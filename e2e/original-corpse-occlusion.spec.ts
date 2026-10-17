import {expect,test} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {MatchRoom} from '../server/match-room';
import {matchServerNow} from '../server/clock';
import {parseClientMessage,type MessagePeer,type ServerMessage} from '../server/protocol';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';

test.describe.configure({timeout:60_000});
test.use({viewport:{width:800,height:600}});

test('Woodland visible fadeaway corpse receives a miss effect and no remote hit request',async({page},testInfo)=>{
 const base={...getOriginalMapRuntime('woodlands').spawnPoints[0]};
 // Explicit initial placement fixture. Death, fade, aim, shooting, transport and
 // receipts all use production paths; no callback counter or pose is assigned.
 const room=new MatchRoom('CORPSE',{map:'woodlands',now:matchServerNow,spawnPoints:[base,{...base,x:base.x+.6}]});
 const server=new WebSocketServer({port:0,host:'127.0.0.1'}),messages:ServerMessage[]=[],requests:any[]=[],errors:string[]=[],victimMessages:ServerMessage[]=[];
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const retain=(ledger:ServerMessage[],message:ServerMessage)=>{
  if(message.type==='welcome'||message.type==='error'||message.type==='event'||message.type==='loadout'){
   if(ledger.length>=512)throw Error('Corpse receipt ledger exceeded');ledger.push(message);
  }
 };
 server.on('connection',socket=>{
  let id:string|null=null;
  const peer:MessagePeer={send(message){retain(messages,message);if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}};
  socket.on('message',raw=>{
   const message=parseClientMessage(raw.toString());if(!message)throw Error('Invalid corpse fixture request');
   if(requests.length>=1024)throw Error('Corpse request ledger exceeded');requests.push(message);
   if(message.type==='join'){
    const joined=room.join(peer,message.name,matchServerNow(),message.resumeToken,message.sourceRemoteView);
    if(!joined.ok)throw Error(joined.message);id=joined.player.id;
   }else if(id){room.handleMessage(id,message,matchServerNow(),peer);if(message.type==='leave')id=null;}
  });
  socket.on('close',()=>{if(id)room.suspend(id,matchServerNow(),peer);});
 });
 const port=(server.address() as {port:number}).port,timer=setInterval(()=>room.tick(matchServerNow()),50);
 const victimPeer:MessagePeer={send(message){retain(victimMessages,message);}},joined=room.join(victimPeer,'VICTIM',matchServerNow());
 if(!joined.ok)throw Error(joined.message);const victimId=joined.player.id;
 const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
 let before:any,death:any,probe:any,after:any,verified=false;
 try{
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({port})=>{
   const Native=window.WebSocket;
   window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(String(url).replace(':8081',`:${port}`),protocols);}};
  },{port});
  await page.goto('/?map=woodlands&e2e=1&quality=low');await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#callsign').fill('VIEWER');await page.locator('#deploy').click();
  await page.locator('#room-code').fill('CORPSE');await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await expect.poll(async()=>(await read()).remotes.some((actor:any)=>actor.id===victimId&&actor.original.alive)).toBe(true);
  await page.keyboard.down('Digit1');
  try{await expect.poll(async()=>(await read()).loadout.equipped).toBe('pistol');}
  finally{await page.keyboard.up('Digit1');}
  before=await read();expect(before.local.health).toBe(100);
  room.handleMessage(victimId,{type:'source_escape'},matchServerNow(),victimPeer);
  await expect.poll(async()=>{
   const state=await read();if(state.sourceTimeoutCorpses.some((actor:any)=>actor.id===victimId&&actor.inScene)){death=state;return true;}return false;
  },{timeout:3000,intervals:[20]}).toBe(true);
  await expect.poll(async()=>{
   probe=await page.evaluate(id=>(window as any).__RA_MULTIPLAYER_DEBUG__.fireAtSourceCorpse(id),victimId);
   return probe.queued;
  },{timeout:2000,intervals:[20]}).toBe(true);
  expect(probe.visible).toBe(true);expect(probe.shotId).toEqual(expect.any(String));
  expect(probe.pose.original.alive).toBe(false);expect(probe.misses).toBe(1);expect(probe.blood).toBe(0);
  await expect.poll(()=>messages.some(message=>message.type==='loadout'&&message.ackShotId===probe.shotId)).toBe(true);
  await expect.poll(async()=>(await read()).sourceTimeoutCorpses.some((actor:any)=>actor.id===victimId),{timeout:3000,intervals:[50]}).toBe(false);
  after=await read();
  const shoots=requests.filter(message=>message.type==='shoot');expect(shoots).toHaveLength(1);
  expect(shoots[0].shot).toMatchObject({shotId:probe.shotId,weapon:'pistol'});
  expect(requests.filter(message=>message.type==='hit')).toEqual([]);
  for(const ledger of [messages,victimMessages]){
   const damage=ledger.filter(message=>message.type==='event'&&message.event.type==='damaged');
   expect(damage).toHaveLength(1);
   expect(damage[0]).toMatchObject({type:'event',event:{type:'damaged',data:{targetId:victimId,source:{kind:'cowardice'}}}});
  }
  expect(after.local.health).toBe(100);expect(after.local.alive).toBe(true);
  expect(room.getSnapshot(matchServerNow()).players.find(player=>player.id===after.clientId)).toMatchObject({health:100});
  expect(messages.filter(message=>message.type==='error')).toEqual([]);expect(errors).toEqual([]);verified=true;
 }finally{
  await writeFile(testInfo.outputPath('corpse-occlusion-result.json'),JSON.stringify({verified,fixture:{base,viewer:{...base,x:base.x+.6},scope:'Initial nearby spawn fixture; ordinary source_escape, elapsed callbacks and fade. Pistol selection uses physical Digit1. Debug helper aims a visible posed corpse triangle and calls ordinary tryFire; no placement, pose or clock override.'},victimId,before,death,probe,after,messages,victimMessages,requests,errors},null,2));
  clearInterval(timer);for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
