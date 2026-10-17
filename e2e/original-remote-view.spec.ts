import {expect,test,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {PROTOCOL_VERSION} from '../shared/protocol';
import {OriginalRemoteView} from '../shared/originalRemoteView';

test.setTimeout(150_000);
for(const map of ['barrack','woodlands'] as const)test(`${map} moving displayed GI hits agree with receipt mirror and resume preserves hurt life`,async({browser})=>{
 const contexts:any[]=[],traffic:any[]=[],errors:string[]=[],probes:any[]=[];
 const observationEpoch=Date.now(),observationStart=performance.now();
 const observedNow=()=>observationEpoch+performance.now()-observationStart;
 const room='VIEW'+Date.now().toString(36).toUpperCase(),out='artifacts/fidelity-review/2026-10-01/current';
 let actor:Page|undefined,viewer:Page|undefined,verified=false,lastFireAttempt:any=null;
 const read=(page:Page)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
 async function join(name:string){
  const context=await browser.newContext({viewport:{width:1280,height:576}});contexts.push(context);const page=await context.newPage();
  page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
  page.on('websocket',socket=>{
   let generation:number|undefined;
   socket.on('framereceived',frame=>{const message=JSON.parse(String(frame.payload));if(message.type==='welcome')generation=message.sourceRemoteView?.generation;traffic.push({name,generation,direction:'in',at:observedNow(),message});});
   socket.on('framesent',frame=>traffic.push({name,generation,direction:'out',at:observedNow(),message:JSON.parse(String(frame.payload))}));
  });
  await page.addInitScript(()=>{
   let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
   Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
   const Native=window.WebSocket;
   window.WebSocket=class extends Native{send(data:any){const message=JSON.parse(String(data));if(message.type==='join'&&message.sourceRemoteView)(window as any).__VIEW_SOCKET__=this;if(message.type==='transform')(window as any).__VIEW_TRANSFORM__=message;super.send(data);}};
  });
  await page.goto(`/?map=${map}&e2e=1&quality=low`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#callsign').fill(name);await page.locator('#deploy').click();await page.locator('#room-code').fill(room);await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await expect.poll(async()=>(await read(page)).sourceRemoteView.enabled).toBe(true);return page;
 }
 async function selectPistol(page:Page){
  await page.keyboard.down('Digit1');
  try{await expect.poll(async()=>(await read(page)).loadout.equipped).toBe('pistol');}
  finally{await page.keyboard.up('Digit1');}
 }
 async function fire(page:Page,targetId:string,movingActor?:Page,routeAnchor?:{x:number;z:number}){
  let result:any,attempt=0;
  let routeStrafe:'KeyD'|'KeyA'='KeyD';
  const movementStartCallbacks=movingActor?(await read(movingActor)).sourceRemoteView.callbacks:null;
  try{
   await expect.poll(async()=>{
    // Reverse at measured corridor boundaries, rather than elapsed time: source
    // inertia and hill contacts can otherwise drift across alternating inputs.
    const routePosition=movingActor?(await read(movingActor)).local:null;
    if(routePosition&&routeAnchor){if(routePosition.x>=routeAnchor.x+.6)routeStrafe='KeyA';else if(routePosition.x<=routeAnchor.x-.6)routeStrafe='KeyD';}
    const strafe=routeStrafe;attempt++;
    if(movingActor&&routePosition&&routeAnchor){
     const forward=routePosition.z>routeAnchor.z+.3,backward=routePosition.z<routeAnchor.z-.3;
     await movingActor.keyboard[forward?'down':'up']('KeyW');await movingActor.keyboard[backward?'down':'up']('KeyS');
    }
    if(movingActor){await movingActor.keyboard.up(strafe==='KeyD'?'KeyA':'KeyD');await movingActor.keyboard.down(strafe);await movingActor.waitForTimeout(40);}
    const movementCallbacks=movingActor?(await read(movingActor)).sourceRemoteView.callbacks:null;
    if(movingActor&&movementCallbacks<=movementStartCallbacks){lastFireAttempt={name:page===viewer?'VIEWER':'ACTOR',targetId,attempt,strafe,at:observedNow(),queued:false,movementGate:'waiting for actor source callback',movementStartCallbacks,movementCallbacks};return false;}
    result=await page.evaluate(({id,moving})=>{
     const debug=(window as any).__RA_MULTIPLAYER_DEBUG__,state=debug.snapshot(),remote=state.remotes.find((p:any)=>p.id===id);
     const speed=remote?.sourceMovement?.speed,horizontalSpeed=speed?Math.hypot(speed.x,speed.z):0;
     if(moving&&horizontalSpeed<=1e-5)return {visible:remote?.visible??false,queued:false,shotId:null,callbacks:state.sourceRemoteView.callbacks,pose:remote??null,movingHorizontalSpeed:horizontalSpeed,movementGate:'waiting for displayed motion'};
     const result=debug.fireAtSourceRemote(id),actualSpeed=result.pose?.sourceMovement?.speed;
     return {...result,movingHorizontalSpeed:actualSpeed?Math.hypot(actualSpeed.x,actualSpeed.z):0};
    },{id:targetId,moving:!!movingActor});
    lastFireAttempt={name:page===viewer?'VIEWER':'ACTOR',targetId,attempt,strafe:movingActor?strafe:null,routeAnchor,routePosition,movementStartCallbacks,movementCallbacks,at:observedNow(),...result};
    return result.queued;
   },{timeout:8_000,intervals:[40,80,120]}).toBe(true);
  }finally{if(movingActor){for(const key of ['KeyD','KeyA','KeyW','KeyS'])await movingActor.keyboard.up(key);}}
  if(movingActor)expect(result.movingHorizontalSpeed).toBeGreaterThan(1e-5);
  const state=await read(page);probes.push({name:page===viewer?'VIEWER':'ACTOR',generation:state.sourceRemoteView.generation,targetId,...result});return result;
 }
 try{
  actor=await join('ACTOR');const actorId=(await read(actor)).clientId;
  // Actual room peers occupy the other recovered spawns. The seventh player
  // therefore joins near the first spawn, permitting real unobstructed queries.
  // Separate the first body from the repeated spawn on its ridge, rather than
  // walking down the Woodland spawn's forward-facing valley before joining.
  await actor.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(0));
  await actor.keyboard.down('KeyD');await actor.waitForTimeout(350);await actor.keyboard.up('KeyD');
  await actor.evaluate(async({room,map,protocol})=>{
   const sockets:WebSocket[]=[];(window as any).__VIEW_FILLERS__=sockets;
   for(let i=0;i<5;i++){const socket=new WebSocket('ws://127.0.0.1:8081');sockets.push(socket);await new Promise<void>((resolve,reject)=>{socket.onerror=()=>reject(Error('Spawn peer failed'));socket.onopen=()=>socket.send(JSON.stringify({type:'join',room,map,protocol,name:`SPAWN${i}`}));socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='welcome')resolve();if(m.type==='error')reject(Error(m.message));};});}
  },{room,map,protocol:PROTOCOL_VERSION});
  viewer=await join('VIEWER');const viewerId=(await read(viewer)).clientId;
  await expect.poll(async()=>(await read(viewer!)).remotes.length).toBe(6);
  await selectPistol(viewer);await viewer.waitForTimeout(1200);
  const routeAnchor=(await read(actor)).local;
  for(let shot=0;shot<3;shot++){
   await actor.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(0));
   const probe=await fire(viewer,actorId,actor,routeAnchor);
   await expect.poll(()=>traffic.filter(t=>t.direction==='in'&&t.message.type==='event'&&t.message.event.type==='damaged'&&t.message.event.data.attackerId===viewerId&&t.message.event.data.targetId===actorId&&t.message.event.data.source.shotId===probe.shotId).length).toBeGreaterThan(0);
   await viewer.waitForTimeout(400);
  }
  await actor.keyboard.up('KeyD');await selectPistol(actor);await actor.waitForTimeout(600);
  const healthBefore=(await read(viewer)).local.health,back=await fire(actor,viewerId);
  await expect.poll(async()=>(await read(viewer!)).local.health).toBeLessThan(healthBefore);
  const beforeResume=await read(viewer);expect(beforeResume.local.alive).toBe(true);expect(beforeResume.local.health).toBeLessThan(100);
  const previousShot=traffic.findLast(t=>t.name==='VIEWER'&&t.direction==='out'&&t.message.type==='shoot').message.shot;
  await viewer.evaluate(shot=>{const w=window as any,state=w.__RA_MULTIPLAYER_DEBUG__.snapshot();w.__VIEW_SOCKET__.send(JSON.stringify({type:'shoot',shot:{...shot,shotId:'invalid-view'},sourceRemoteView:{generation:state.sourceRemoteView.generation+9999,callbacks:state.sourceRemoteView.callbacks,receipts:[]}}));},previousShot);
  await expect.poll(async()=>(await read(viewer!)).sourceRemoteView.generation,{timeout:10_000}).toBeGreaterThan(beforeResume.sourceRemoteView.generation);
  await expect(pageConnected(viewer)).resolves.toBe(true);
  const resumed=await read(viewer);expect(resumed.clientId).toBe(viewerId);expect(resumed.local.alive).toBe(true);expect(resumed.local.health).toBe(beforeResume.local.health);expect(resumed.loadout.ammo.pistol).toBe(beforeResume.loadout.ammo.pistol);
  expect(errors).toEqual([]);
  const serverErrors=traffic.filter(t=>t.direction==='in'&&t.message.type==='error');expect(serverErrors.map(t=>t.message.code)).toEqual(['invalid_source_view']);
  const acknowledgement=traffic.findIndex(t=>t.name==='VIEWER'&&t.direction==='in'&&t.message.type==='loadout'&&t.message.ackShotId==='invalid-view');
  const rejection=traffic.findIndex(t=>t.name==='VIEWER'&&t.direction==='in'&&t.message.type==='error');expect(acknowledgement).toBeGreaterThanOrEqual(0);expect(acknowledgement).toBeLessThan(rejection);
  // Rebuild each real shoot pose from delivered server-issued data and the
  // exact traces sent by NetworkClient, independently of Game's renderer.
  const replayChecks:any[]=[];
  for(const name of ['ACTOR','VIEWER']){
   const entries=traffic.filter(t=>t.name===name),states=new Map<number,{mirror:OriginalRemoteView;ledger:any[];recorded:number;now:number;epoch:number;lastSentAt:number}>();
   for(const entry of entries)if(entry.direction==='in'&&entry.message.type==='welcome'&&entry.message.sourceRemoteView){const state=entry.message.sourceRemoteView;states.set(state.generation,{mirror:new OriginalRemoteView(state.epoch),ledger:entries.filter(t=>t.direction==='in'&&t.generation===state.generation&&t.message.sourceViewTick!==undefined).sort((a,b)=>a.message.sourceViewTick-b.message.sourceViewTick),recorded:0,now:state.epoch,epoch:state.epoch,lastSentAt:state.epoch});}
   for(const entry of entries){
    const m=entry.message,trace=m.sourceRemoteView;if(entry.direction!=='out'||!trace||(m.type!=='transform'&&m.type!=='shoot'))continue;
    const state=states.get(trace.generation);if(!state)continue;const lastTick=trace.receipts.at(-1)?.tick??-1;
    while(state.recorded<=lastTick){const incoming=state.ledger[state.recorded++].message;const event=incoming.event;state.lastSentAt=incoming.sourceViewSentAt;expect(state.mirror.recordSent({tick:incoming.sourceViewTick,sentAt:incoming.sourceViewSentAt,targets:incoming.snapshot?incoming.snapshot.players.filter((p:any)=>p.name!==name).map((p:any)=>({id:p.id,position:p.transform.position,yaw:p.transform.yaw,motionTime:p.sourceMotionTime,alive:p.alive})):[],...(event?.type==='shot'?{firePlayerId:event.data.playerId}:event?.type==='projectile_spawned'?{firePlayerId:event.data.projectile.attackerId}:event?.type==='killed'?{deathPlayerId:event.data.victimId}:{})})).toEqual({ok:true});}
    // Offline reconstruction uses the reported callback basis, not the Node
    // observer clock. Browser CDP frame delivery does not expose server receipt
    // time; production timing acceptance is established by real accepted hits.
    state.now=Math.max(state.now,state.epoch+trace.callbacks*1000/30,state.lastSentAt);expect(state.mirror.accept(trace,state.now)).toEqual({ok:true});
    if(m.type==='shoot'){const probe=probes.find(p=>p.name===name&&p.shotId===m.shot.shotId);expect(probe).toBeTruthy();const pose=state.mirror.freeze().find(p=>p.id===probe.targetId)!;expect(pose).toBeTruthy();expect(pose.position).toEqual({x:probe.pose.rendered.x,y:probe.pose.rendered.y,z:probe.pose.rendered.z});expect(pose.yaw).toBeCloseTo(probe.pose.rendered.yaw,9);expect(pose.motionTime).toBe(probe.pose.original.timeMs);replayChecks.push({name,shotId:m.shot.shotId,callbacks:trace.callbacks,pose});}
   }
  }
  expect(replayChecks).toHaveLength(4);expect(probes.some(p=>Math.hypot(p.pose.rendered.x-p.pose.authoritative.x,p.pose.rendered.z-p.pose.authoritative.z)>.02)).toBe(true);
  await mkdir(out,{recursive:true});await viewer.screenshot({path:`${out}/${map}-source-remote-view.png`});verified=true;
  await writeFile(`${out}/${map}-source-remote-view.json`,JSON.stringify({verified,map,observationClock:'epoch anchored monotonic performance.now',probes,lastFireAttempt,replayChecks,beforeResume,resumed,back,traffic,errors},null,2));
 }finally{
  if(!verified){await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-remote-view-failure.json`,JSON.stringify({verified,map,observationClock:'epoch anchored monotonic performance.now',probes,lastFireAttempt,traffic,errors},null,2));}
  if(actor){for(const key of ['KeyD','KeyA','KeyW','KeyS'])await actor.keyboard.up(key).catch(()=>{});await actor.evaluate(()=>(window as any).__VIEW_FILLERS__?.forEach((s:WebSocket)=>s.close())).catch(()=>{});}
  for(const context of contexts)await context.close();
 }
});
async function pageConnected(page:Page){await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');return true;}
