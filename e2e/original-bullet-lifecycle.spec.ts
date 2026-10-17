import {expect,test,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {MatchRoom} from '../server/match-room';
import {matchServerNow} from '../server/clock';
import {parseClientMessage,PROTOCOL_VERSION,type MessagePeer} from '../server/protocol';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';

test.describe.configure({timeout:120_000});

async function authority(map:'barrack'|'woodlands'){
 const spawnIndex=map==='barrack'?5:0,spawn={...getOriginalMapRuntime(map).spawnPoints[spawnIndex]};
 const room=new MatchRoom('BULLET',{map,now:matchServerNow,spawnPoints:[spawn]});
 const server=new WebSocketServer({port:0,host:'127.0.0.1'});
 await new Promise<void>(resolve=>server.once('listening',resolve));
 server.on('connection',socket=>{
  let playerId:string|null=null;
  const peer:MessagePeer={send(message){if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}};
  socket.on('message',raw=>{
   const message=parseClientMessage(raw.toString());if(!message)throw Error('Invalid bullet lifecycle fixture request');
   if(message.type==='join'){
    if(message.protocol!==PROTOCOL_VERSION)throw Error('Bullet lifecycle fixture protocol mismatch');
    const result=room.join(peer,message.name,matchServerNow(),message.resumeToken,message.sourceRemoteView);
    if(!result.ok)throw Error(result.message);playerId=result.player.id;
   }else if(playerId){room.handleMessage(playerId,message,matchServerNow(),peer);if(message.type==='leave')playerId=null;}
  });
  socket.on('close',()=>{if(playerId)room.suspend(playerId,matchServerNow(),peer);});
 });
 const timer=setInterval(()=>room.tick(matchServerNow()),50);
 return {spawnIndex,spawn,port:(server.address() as {port:number}).port,async close(){clearInterval(timer);for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}

const read=(page:Page)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());

for(const map of ['barrack','woodlands'] as const)test(`${map} ordinary pistol death preserves survivor room and Replay starts a new life`,async({browser},testInfo)=>{
 const contexts:any[]=[],messages:any[]=[],sent:any[]=[],errors:string[]=[],samples:any[]=[];
 const fixture=await authority(map),room='BULLET',out=testInfo.outputPath('bullet-lifecycle-evidence');
 let victim:Page|undefined,shooter:Page|undefined,verified=false,before:any,dead:any,reentered:any,separation:any=null;
 async function join(name:string){
  const context=await browser.newContext({viewport:{width:800,height:600}});contexts.push(context);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
  page.on('websocket',socket=>{
   socket.on('framesent',frame=>{
    const message=JSON.parse(String(frame.payload));
    if(message.type==='shoot'||message.type==='hit'){
     if(sent.length>=4096)throw Error('Bullet lifecycle outgoing observation cap exceeded');
     sent.push({name,message});
    }
   });
   socket.on('framereceived',frame=>{
   const message=JSON.parse(String(frame.payload));
   if(message.type==='event'||message.type==='error'||message.type==='welcome'||message.type==='snapshot'&&message.snapshot.drops?.length){
    if(messages.length>=4096)throw Error('Bullet lifecycle observation cap exceeded');
    messages.push({name,message});
   }
   });
  });
  await page.addInitScript(({port})=>{
   const Native=window.WebSocket;
   window.WebSocket=class extends Native {
    constructor(url:string|URL,protocols?:string|string[]){
     super(String(url).replace(':8081',`:${port}`),protocols);let clientId:string|null=null;
     this.addEventListener('message',event=>{
      const message=JSON.parse(String(event.data));if(message.type==='welcome')clientId=message.clientId;
      if(message.type==='event'&&message.event.type==='killed'&&message.event.data.killerId===clientId){
       window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));
       (window as any).__BULLET_RELEASE__={clientId,victimId:message.event.data.victimId};
      }
     });
    }
   };
   let locked:Element|null=null;
   Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
   Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
   Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  },{port:fixture.port});
  await page.goto(`/?map=${map}&e2e=1&quality=low`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#callsign').fill(name);await page.locator('#deploy').click();
  await page.locator('#room-code').fill(room);await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await expect.poll(async()=>(await read(page)).sourceRemoteView.enabled).toBe(true);
  return page;
 }
 try{
  victim=await join('VICTIM');
  // Both welcomes use an explicit actual settled source spawn. The first
  // browser separates with ordinary keys; no placement after welcome occurs.
  // Barrack source5 has clear supported torso rays only on its upper plinth;
  // Release at measured +Z1.2, allowing the observed ordinary braking distance
  // to settle within the supported +Z2–3 window before the roof edge.
  if(map==='barrack'){
   const initial=await read(victim);
   await victim.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(Math.PI));
   await victim.keyboard.down('KeyW');
   try{separation=await victim.evaluate(async start=>{
    const debug=(window as any).__RA_MULTIPLAYER_DEBUG__,began=performance.now(),samples:any[]=[];
    for(;;){
     const state=debug.snapshot();samples.push({elapsed:performance.now()-began,local:state.local,grounded:state.movement.grounded,colliding:state.originalScene.colliding});
     if(!state.local.alive||state.originalScene.colliding)return {status:'invalid_body',initial:start,samples};
     if(state.local.z>=start.z+1.2){
      window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',key:'w',bubbles:true}));
      return {status:'reached',initial:start,samples,releasedKeys:debug.snapshot().movement.keys};
     }
     if(performance.now()-began>=2000||samples.length>=128)return {status:'did_not_reach',initial:start,samples};
     await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
   },initial.local);}
   finally{await victim.keyboard.up('KeyW');}
   expect(separation.status).toBe('reached');
   await expect.poll(async()=>{
    const state=await read(victim!);separation.afterRelease=state;
    return state.local.alive&&state.movement.grounded&&!state.originalScene.colliding&&Math.hypot(state.movement.velocity.x,state.movement.velocity.z)<.05;
   },{timeout:2000,intervals:[40,80]}).toBe(true);
   expect(separation.afterRelease.local.z).toBeLessThan(initial.local.z+3.3);
   expect(separation.afterRelease.local.y).toBeCloseTo(initial.local.y,1);
  }else{
   await victim.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(0));
   await victim.keyboard.down('KeyD');try{await victim.waitForTimeout(350);}finally{await victim.keyboard.up('KeyD');}
  }
  shooter=await join('SHOOTER');
  await expect.poll(async()=>(await read(shooter!)).remotes.length).toBe(1);
  await shooter.keyboard.down('Digit1');try{await expect.poll(async()=>(await read(shooter!)).loadout.equipped).toBe('pistol');}finally{await shooter.keyboard.up('Digit1');}
  await shooter.locator('#game canvas').click();
  before={victim:await read(victim),shooter:await read(shooter)};
  expect(before.victim.local.health).toBe(100);expect(before.victim.originalScene.colliding).toBe(false);expect(before.shooter.originalScene.colliding).toBe(false);
  const victimId=before.victim.clientId,shooterId=before.shooter.clientId;
  const aim=async()=>{
   const observed=await shooter!.evaluate(id=>{
    const debug=(window as any).__RA_MULTIPLAYER_DEBUG__,state=debug.snapshot(),point=debug.sourceRemoteAimPoint(id);
    if(!point)return {state,point:null,aimed:false};
    const dx=point.x-state.local.x,dy=point.y-(state.local.y+1.72),dz=point.z-state.local.z;
    debug.setLook(Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz)));
    return {state,point,aimed:true};
   },victimId);
   if(samples.length>=256)throw Error('Bullet lifecycle aim observation cap exceeded');
   samples.push({local:observed.state.local,target:observed.state.remotes.find((actor:any)=>actor.id===victimId),point:observed.point,aimed:observed.aimed});
   return observed.aimed;
  };
  await expect.poll(aim,{timeout:8_000}).toBe(true);
  await shooter.mouse.down();
  try{await expect.poll(async()=>{await aim();return victim!.locator('#result').isVisible();},{timeout:8_000,intervals:[80,120]}).toBe(true);}
  finally{await shooter.mouse.up();}
  await expect(victim.locator('#result-title')).toHaveText('GAME OVER');
  await expect(victim.locator('#result-kicker')).toContainText('Comrade VICTIM');
  await expect(victim.locator('#result-kicker')).toContainText('thanks to SHOOTER...');
  await expect(victim.locator('#result-stats')).toHaveText('0 points');
  await expect(victim.locator('#hud')).toBeHidden();await expect(victim.locator('#original-normal-ui')).toBeHidden();
  const kills=()=>messages.filter(entry=>entry.name==='SHOOTER'&&entry.message.type==='event'&&entry.message.event.type==='killed'&&entry.message.event.data.victimId===victimId);
  await expect.poll(()=>kills().length).toBe(1);
  const killed=kills()[0].message.event;
  expect(killed.data).toMatchObject({victimId,killerId:shooterId,killerScore:30,killerFrags:1,victimDeaths:1});
  const damage=messages.filter(entry=>entry.name==='SHOOTER'&&entry.message.type==='event'&&entry.message.event.type==='damaged'&&entry.message.event.data.targetId===victimId).map(entry=>entry.message.event);
  expect(damage.length).toBeGreaterThan(1);
  expect(damage.every(event=>event.data.attackerId===shooterId&&event.data.source.weapon==='pistol'&&event.data.damage===12&&event.data.sourceHealth.canonical===event.data.health&&event.data.lethal===(event.data.health+2*event.data.sourceHealth.flick<0))).toBe(true);
  expect(await shooter.evaluate(()=>(window as any).__BULLET_RELEASE__)).toEqual({clientId:shooterId,victimId});
  expect(damage.at(-1).data.lethal).toBe(true);
  expect(damage.at(-1).data.health+2*damage.at(-1).data.sourceHealth.flick).toBeLessThan(0);
  await expect.poll(()=>messages.some(entry=>entry.name==='SHOOTER'&&entry.message.type==='snapshot'&&entry.message.snapshot.drops?.some((drop:any)=>drop.weapon===before.victim.loadout.equipped&&drop.expiresAt===null))).toBe(true);
  await expect.poll(async()=>(await read(shooter!)).sourceTimeoutCorpses.some((remote:any)=>remote.id===victimId&&remote.original?.alive===false&&remote.inScene)).toBe(true);
  const observer=await read(shooter);expect(observer.movement.phase).toBe('playing');expect(observer.local.alive).toBe(true);
  const collections=()=>messages.filter(entry=>entry.name==='SHOOTER'&&entry.message.type==='event'&&entry.message.event.type==='collected'&&entry.message.event.data.playerId===shooterId);
  await expect.poll(async()=>Number(await shooter!.locator('#legacy-score').textContent())-5*collections().length).toBe(30);
  const firstDead=await read(victim);await victim.waitForTimeout(1200);dead=await read(victim);
  expect(dead.local.alive).toBe(false);expect(dead.local.health).toBe(0);expect(dead.movement.phase).toBe('lost');
  expect(dead.local).toEqual(firstDead.local);
  await mkdir(out,{recursive:true});await victim.screenshot({path:`${out}/game-over.png`});
  await victim.locator('#restart').click();await expect(victim.locator('#menu-entry')).toBeVisible();
  await victim.locator('#deploy').click();await victim.locator('#join-room').click();
  await expect(victim.locator('#network-status')).toHaveAttribute('data-state','connected');
  reentered=await read(victim);expect(reentered.clientId).not.toBe(victimId);expect(reentered.local.health).toBe(100);expect(reentered.sourceHealth.canonical).toBe(100);expect(reentered.local.alive).toBe(true);
  expect(kills()).toHaveLength(1);expect(errors).toEqual([]);expect(messages.filter(entry=>entry.message.type==='error')).toEqual([]);
  verified=true;
 }finally{
  await shooter?.mouse.up().catch(()=>{});
  await mkdir(out,{recursive:true});await writeFile(`${out}/result.json`,JSON.stringify({verified,map,scope:'Two actual browser peers in an isolated production MatchRoom with custom spawnPoints containing actual settled source Barrack spawn5 or Woodland spawn0; normal separation movement, weapon key and mouse firing; debug look only. Fixed initial spawn is an explicit fixture, not random-spawn verification. No post-welcome placement, health, damage, shot or receipt override.',fixture:{spawnIndex:fixture.spawnIndex,spawn:fixture.spawn},separation,before,dead,reentered,samples,messages,sent,errors},null,2));
  try{await Promise.allSettled(contexts.map(context=>context.close()));}finally{await fixture.close();}
 }
});
