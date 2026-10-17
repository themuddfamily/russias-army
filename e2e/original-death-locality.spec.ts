import {expect,test,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {MatchRoom} from '../server/match-room';
import {matchServerNow} from '../server/clock';
import {parseClientMessage,type MessagePeer,type ServerMessage} from '../server/protocol';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';

test.describe.configure({timeout:90_000});
test('two Woodland browser viewers independently collect one remote death while its owner and a late entrant get no drop',async({browser},testInfo)=>{
 const base={...getOriginalMapRuntime('woodlands').spawnPoints[0]};
 // Three nearby starts isolate pickup reach and separate the live bodies.
 // This is an explicit initial spawn fixture, not native spawn verification.
 const room=new MatchRoom('LOCALDEATH',{map:'woodlands',now:matchServerNow,spawnPoints:[base,{...base,x:base.x+.6},{...base,x:base.x-.6}]});
 const server=new WebSocketServer({port:0,host:'127.0.0.1'}),contexts:any[]=[],messages:Array<{name:string;message:ServerMessage}>=[],errors:string[]=[];
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const retain=(name:string,message:ServerMessage)=>{
  if(message.type==='welcome'||message.type==='error'||message.type==='event'||message.type==='snapshot'&&message.snapshot.drops?.length){
   if(messages.length>=512)throw Error('Death locality browser ledger exceeded');messages.push({name,message});
  }
 };
 server.on('connection',socket=>{
  let id:string|null=null,name='UNKNOWN';
  const peer:MessagePeer={send(message){retain(name,message);if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}};
  socket.on('message',raw=>{
   const message=parseClientMessage(raw.toString());if(!message)throw Error('Invalid locality fixture request');
   if(message.type==='join'){
    name=message.name;const joined=room.join(peer,name,matchServerNow(),message.resumeToken,message.sourceRemoteView);
    if(!joined.ok)throw Error(joined.message);id=joined.player.id;
   }else if(id){room.handleMessage(id,message,matchServerNow(),peer);if(message.type==='leave')id=null;}
  });
  socket.on('close',()=>{if(id)room.suspend(id,matchServerNow(),peer);});
 });
 const port=(server.address() as {port:number}).port,timer=setInterval(()=>room.tick(matchServerNow()),50);
 const victimPeer:MessagePeer={send(message){retain('VICTIM',message);}},joined=room.join(victimPeer,'VICTIM',matchServerNow());
 if(!joined.ok)throw Error(joined.message);const victimId=joined.player.id;
 const read=(page:Page)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
 async function join(name:string){
  const context=await browser.newContext({viewport:{width:800,height:600}});contexts.push(context);const page=await context.newPage();
  page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
  await page.addInitScript(({port})=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(String(url).replace(':8081',`:${port}`),protocols);}};},{port});
  await page.goto('/?map=woodlands&e2e=1&quality=low');await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#callsign').fill(name);await page.locator('#deploy').click();
  await page.locator('#room-code').fill('LOCALDEATH');await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');return page;
 }
 let before:any,after:any,verified=false,pages:Page[]=[];
 try{
  const a=await join('Cowardice'),b=await join('VIEWERB');
  pages=[a,b];
  for(const page of [a,b])await expect.poll(async()=>(await read(page)).remotes.some((actor:any)=>actor.id===victimId&&actor.original.alive)).toBe(true);
  before={a:await read(a),b:await read(b)};
  room.handleMessage(victimId,{type:'source_escape'},matchServerNow(),victimPeer);
  const collection=(name:string)=>messages.filter(entry=>entry.name===name&&entry.message.type==='event'&&entry.message.event.type==='collected');
  // Live body contacts separated the initial starts beyond the strict native
  // pickup radius. Approach the dropped gun using ordinary held input; each
  // viewer releases its key as soon as its own private collection arrives.
  await Promise.all([['Cowardice',a,'KeyA'],['VIEWERB',b,'KeyD']].map(async([name,page,key])=>{
   const viewer=page as Page;await viewer.keyboard.down(key as string);
   try{await expect.poll(()=>collection(name as string).length,{timeout:5000,intervals:[50]}).toBe(1);}
   finally{await viewer.keyboard.up(key as string);}
  }));
  after={a:await read(a),b:await read(b)};
  for(const [name,page,prior,state,score] of [['Cowardice',a,before.a,after.a,35],['VIEWERB',b,before.b,after.b,5]] as const){
   expect(state.local.alive).toBe(true);expect(state.local.health).toBe(100);
   await expect(page.locator('#legacy-score')).toHaveText(String(score));
   await expect.poll(async()=>(await read(page)).loadout.reserve.launcher).toBe(prior.loadout.reserve.launcher+12);
   expect(messages.some(entry=>entry.name===name&&entry.message.type==='snapshot'&&entry.message.snapshot.drops?.some(drop=>drop.weapon==='launcher'&&drop.expiresAt===null))).toBe(true);
   expect(state.sourceTimeoutCorpses.some((actor:any)=>actor.id===victimId&&actor.inScene)).toBe(true);
  }
  const ca=collection('Cowardice')[0].message,cb=collection('VIEWERB')[0].message;
  if(ca.type!=='event'||cb.type!=='event'||ca.event.type!=='collected'||cb.event.type!=='collected')throw Error('Missing private collection');
  expect(ca.event.data.itemId).not.toBe(cb.event.data.itemId);
  expect(messages.filter(entry=>entry.name==='VICTIM'&&entry.message.type==='snapshot'&&entry.message.snapshot.drops?.length)).toEqual([]);
  const lateMessages:ServerMessage[]=[],late=room.join({send(message){lateMessages.push(message);}},'LATE',matchServerNow(),undefined,true);
  expect(late.ok).toBe(true);expect(lateMessages.find(message=>message.type==='snapshot')).toMatchObject({snapshot:{drops:[]}});
  expect(room.getSnapshot(matchServerNow()).drops).toEqual([]);expect(errors).toEqual([]);expect(messages.filter(entry=>entry.message.type==='error')).toEqual([]);verified=true;
 }finally{
  if(!after&&pages.length===2)after={a:await read(pages[0]).catch(()=>null),b:await read(pages[1]).catch(()=>null)};
  await writeFile(testInfo.outputPath('death-locality-result.json'),JSON.stringify({verified,fixture:{base,scope:'Initial nearby spawn fixture only; production source callbacks, death, private pickups and automatic collection.'},before,after,messages,errors},null,2));
  clearInterval(timer);await Promise.allSettled(contexts.map(context=>context.close()));for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
