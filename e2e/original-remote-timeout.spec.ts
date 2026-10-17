import {expect,test} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {MatchRoom} from '../server/match-room';
import {matchServerNow} from '../server/clock';
import {parseClientMessage,type MessagePeer,type ServerMessage} from '../server/protocol';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';

test.setTimeout(60_000);
test.use({viewport:{width:800,height:600}});

// One browser and one ordinary server peer. Source spawn selection is fixture
// setup; callbacks, receipt clocks, pickup creation and fade are production code.
test('Woodland missing remote times out, leaves a separate corpse and rejoins as a fresh actor',async({page},testInfo)=>{
 const spawn={...getOriginalMapRuntime('woodlands').spawnPoints[0]},room=new MatchRoom('TIMEOUT',{map:'woodlands',now:matchServerNow,spawnPoints:[spawn]});
 const server=new WebSocketServer({port:0,host:'127.0.0.1'}),messages:ServerMessage[]=[],errors:string[]=[],peerMessages:ServerMessage[]=[];
 await new Promise<void>(resolve=>server.once('listening',resolve));
 server.on('connection',socket=>{
  let id:string|null=null;
  const peer:MessagePeer={send(message){
   if(message.type==='error'||message.type==='event'||message.type==='snapshot'&&message.snapshot.drops?.length){
    if(messages.length>=512)throw Error('Timeout evidence cap exceeded');messages.push(message);
   }
   if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));
  }};
  socket.on('message',raw=>{
   const message=parseClientMessage(raw.toString());if(!message)throw Error('Invalid timeout fixture request');
   if(message.type==='join'){
    const result=room.join(peer,message.name,matchServerNow(),message.resumeToken,message.sourceRemoteView);
    if(!result.ok)throw Error(result.message);id=result.player.id;
   }else if(id){room.handleMessage(id,message,matchServerNow(),peer);if(message.type==='leave')id=null;}
  });
  socket.on('close',()=>{if(id)room.suspend(id,matchServerNow(),peer);});
 });
 const timer=setInterval(()=>room.tick(matchServerNow()),50),port=(server.address() as {port:number}).port;
 const targetPeer:MessagePeer={send(message){if(peerMessages.length>=1024)throw Error('Target ledger cap exceeded');peerMessages.push(message);}};
 const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
 let before:any,missing:any,timedOut:any,rejoined:any,finished:any,verified=false;
 try{
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({port})=>{
   const Native=window.WebSocket;
   window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(String(url).replace(':8081',`:${port}`),protocols);}};
  },{port});
  await page.goto('/?map=woodlands&e2e=1&quality=low');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#callsign').fill('VIEWER');await page.locator('#deploy').click();
  await page.locator('#room-code').fill('TIMEOUT');await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  const joined=room.join(targetPeer,'MISSING',matchServerNow());if(!joined.ok)throw Error(joined.message);
  const id=joined.player.id,welcome=peerMessages.find(message=>message.type==='welcome');
  if(!welcome||welcome.type!=='welcome')throw Error('Missing target welcome');
  await expect.poll(async()=>(await read()).remotes.some((actor:any)=>actor.id===id)).toBe(true);
  before=await read();room.suspend(id,matchServerNow(),targetPeer);
  await expect.poll(async()=>room.getSnapshot(matchServerNow()).players.some(player=>player.id===id)).toBe(false);
  missing=await read();expect(missing.remotes.some((actor:any)=>actor.id===id)).toBe(true);
  await expect.poll(async()=>{
   const state=await read(),corpse=state.sourceTimeoutCorpses.find((actor:any)=>actor.id===id);
   if(corpse){timedOut=state;return true;}return false;
  },{timeout:20_000,intervals:[50]}).toBe(true);
  expect(timedOut.remotes.some((actor:any)=>actor.id===id)).toBe(false);
  expect(timedOut.sourceTimeoutCorpses).toEqual([expect.objectContaining({id,name:'MISSING',inScene:true,original:expect.objectContaining({alive:false,removed:false})})]);
  expect(timedOut.local.health).toBe(100);
  expect(room.getSnapshot(matchServerNow()).players.find(player=>player.id===timedOut.clientId)).toMatchObject({health:100,frags:0,deaths:0});
  await expect(page.locator('#chat-log')).toContainText('MISSING is disconnected');
  await expect.poll(()=>messages.some(message=>message.type==='snapshot'&&message.snapshot.drops?.some(drop=>drop.weapon==='launcher'&&drop.expiresAt===null)),{timeout:1000}).toBe(true);
  const resumed=room.join(targetPeer,'MISSING',matchServerNow(),welcome.resumeToken);if(!resumed.ok)throw Error(resumed.message);
  expect(resumed.player.id).toBe(id);
  await expect.poll(async()=>{
   const state=await read();if(state.remotes.some((actor:any)=>actor.id===id)){rejoined=state;return true;}return false;
  },{timeout:1000,intervals:[20]}).toBe(true);
  expect(rejoined.sourceTimeoutCorpses.some((actor:any)=>actor.id===id&&actor.inScene)).toBe(true);
  expect(rejoined.remotes.find((actor:any)=>actor.id===id).original.alive).toBe(true);
  await expect.poll(async()=>(await read()).sourceTimeoutCorpses.length,{timeout:3000,intervals:[50]}).toBe(0);
  finished=await read();expect(finished.remotes.find((actor:any)=>actor.id===id).original.alive).toBe(true);
  expect(messages.filter(message=>message.type==='error')).toEqual([]);expect(errors).toEqual([]);verified=true;
 }finally{
  await writeFile(testInfo.outputPath('timeout-result.json'),JSON.stringify({verified,before,missing,timedOut,rejoined,finished,messages,errors},null,2));
  clearInterval(timer);for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
