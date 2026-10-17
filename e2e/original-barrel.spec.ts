import {createOriginalAngularBody,originalAngularConvex} from '../shared/originalAngularBody';
import {expect,test,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {MatchRoom} from '../server/match-room';
import {matchServerNow} from '../server/clock';
import {parseClientMessage,PROTOCOL_VERSION,type MessagePeer,type ServerMessage,type Vec3} from '../server/protocol';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {sweepOriginalConvexSphere} from '../shared/originalConvexContact';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE} from '../shared/originalExplosives';

test.setTimeout(120_000);
const out=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-10-01/current';
const runtime=getOriginalMapRuntime('barrack'),sourceWorld=new OriginalBarrelWorld(runtime),shape=sourceWorld.bodies[0].convex;
const original=sourceWorld.getInitialPosition(sourceWorld.bodies[0].id)!;
function approach(){
  // Choose a supported clear approach from actual fixed geometry; no authored
  // replacement barrel or scene is used. W faces along the selected direction.
  for(const direction of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){
    const position={x:original.x-direction.x*1.5,y:0,z:original.z-direction.z*1.5};
    let valid=true;
    for(let distance=0;distance<=3;distance+=.1){
      const x=position.x+direction.x*distance,z=position.z+direction.z*distance;
      const y=runtime.geometry.playerSupportHeightAt(x,z,.5,runtime.profile.radius,runtime.profile.bodyHeight);
      if(y===undefined||runtime.geometry.playerIntersects({x,y,z},runtime.profile.radius,runtime.profile.bodyHeight)){valid=false;break;}
      if(distance===0)position.y=y;
    }
    if(valid)return {position,direction,yaw:Math.atan2(-direction.x,-direction.z)};
  }
  throw Error('No supported collision-free recovered barrel approach');
}
const fixtureApproach=approach();
const read=(page:Page)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
const projection=(p:Vec3)=>p.x*fixtureApproach.direction.x+p.z*fixtureApproach.direction.z;
function aligned(state:any){
  expect(state.originalBarrels.bodies).toHaveLength(1);expect(state.originalBarrels.models).toHaveLength(1);
  const body=state.originalBarrels.bodies[0],model=state.originalBarrels.models[0];expect(model.id).toBe(body.id);
  for(const axis of ['x','y','z'] as const)expect(model.pivot[axis]).toBeCloseTo(body.position[axis],9);
}
function verifyTrace(trace:any[]){
  expect(trace.length).toBeGreaterThan(2);
  const checks=trace.map(state=>{
    aligned(state);
    const body=state.originalBarrels.bodies[0],feet={x:state.local.x,y:state.local.y,z:state.local.z};
    const center={...feet,y:feet.y+runtime.profile.radius};
    const angular=createOriginalAngularBody(shape,1);angular.orientation={...body.orientation};angular.angularVelocity={...body.angularVelocity};
    const rotatingShape=originalAngularConvex(angular);
    const contact=sweepOriginalConvexSphere(rotatingShape,body.position,body.position,center,center,runtime.profile.radius);
    const depth=contact?.penetrationDepth??0;
    expect(depth).toBeLessThanOrEqual(1e-5);
    expect(runtime.geometry.playerIntersects(feet,runtime.profile.radius,runtime.profile.bodyHeight)).toBe(false);
    const bottom=body.position.y+Math.min(...rotatingShape.vertices.map(v=>v.y));
    const support=runtime.geometry.playerSupportHeightAt(body.position.x,body.position.z,bottom+.1,.001,.002);
    expect(support).toBeDefined();expect(bottom).toBeGreaterThanOrEqual(support!-1e-5);
    expect(bottom-support!).toBeLessThan(ORIGINAL_COLLISION_CONTACT_DISTANCE+.015);
    // The player remains on its approach side of the physical solid throughout
    // contact. A pass-through would place its centre ahead of the barrel pivot.
    expect(projection(center)).toBeLessThan(projection(body.position));
    expect(state.local.health).toBe(100);expect(state.networkEffects.explosions).toBe(0);
    return {depth,support,barrelBottom:bottom,orientation:body.orientation,angularVelocity:body.angularVelocity,playerProjection:projection(center),barrelProjection:projection(body.position)};
  });
  return checks;
}

async function authority(){
  const diagnostics:Record<string,unknown>[]=[],received:Array<{playerId:string|null;at:number;message:unknown}>=[];
  const observer={...fixtureApproach.position,x:fixtureApproach.position.x+3,z:fixtureApproach.position.z+3};
  const observerSupport=runtime.geometry.playerSupportHeightAt(observer.x,observer.z,1,runtime.profile.radius,runtime.profile.bodyHeight);
  if(observerSupport===undefined||runtime.geometry.playerIntersects({...observer,y:observerSupport},runtime.profile.radius,runtime.profile.bodyHeight))throw Error('Unsupported barrel observer spawn');
  observer.y=observerSupport;
  const room=new MatchRoom('BARRELPUSH',{map:'barrack',now:matchServerNow,spawnPoints:[fixtureApproach.position,observer],sourceViewDiagnostics:entry=>diagnostics.push(structuredClone(entry))});
  const server=new WebSocketServer({port:0,host:'127.0.0.1'}),messages:ServerMessage[]=[],requests:unknown[]=[];
  await new Promise<void>(resolve=>server.once('listening',resolve));
  server.on('connection',socket=>{
    let playerId:string|null=null;
    const peer:MessagePeer={send(message){messages.push(message);if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}};
    socket.on('message',raw=>{
      const message=parseClientMessage(raw.toString());if(!message)throw Error('Invalid barrel fixture request');requests.push(message);received.push({playerId,at:matchServerNow(),message});
      if(message.type==='join'){
        if(message.protocol!==PROTOCOL_VERSION)throw Error('Barrel fixture protocol mismatch');
        const result=room.join(peer,message.name,matchServerNow(),message.resumeToken,message.sourceRemoteView);
        if(!result.ok)throw Error(result.message);playerId=result.player.id;
      }else if(playerId){room.handleMessage(playerId,message,matchServerNow(),peer);if(message.type==='leave')playerId=null;}
    });
    socket.on('close',()=>{if(playerId)room.suspend(playerId,matchServerNow(),peer);});
  });
  const timer=setInterval(()=>room.tick(matchServerNow()),50);
  return {room,messages,requests,diagnostics,received,port:(server.address() as {port:number}).port,async close(){clearInterval(timer);for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
async function prepare(page:Page,map='barrack',port?:number){
  await page.setViewportSize({width:800,height:600});
  await page.addInitScript(({port})=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
    if(port){const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(String(url).replace(':8081',`:${port}`),protocols);}};}
  },{port});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
}
async function join(page:Page,name:string){
  await page.locator('#callsign').fill(name);await page.locator('#mode-online').click();await page.locator('#deploy').click();
  await page.locator('#room-code').fill('BARRELPUSH');await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
}

for(const mode of ['solo','online'] as const)test(`Barrack ${mode} real W pushes source barrel and preserves its pivot`,async({page,browser})=>{
  const fixture=mode==='online'?await authority():null,errors:string[]=[],serverErrors:unknown[]=[],latePackets:any[]=[];
  let observerContext:Awaited<ReturnType<typeof browser.newContext>>|undefined;
  const record=(p:Page)=>{p.on('pageerror',e=>errors.push(e.message));p.on('websocket',s=>s.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);}));};record(page);
  try{
    await prepare(page,'barrack',fixture?.port);
    await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.enableSourceViewTimings());
    if(fixture){await join(page,'PUSHER');await page.evaluate(yaw=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(yaw),fixtureApproach.yaw);}
    else{await page.locator('#deploy').click();await page.evaluate(({position,yaw})=>(window as any).__RA_MULTIPLAYER_DEBUG__.setView(position.x,position.z,yaw),fixtureApproach);}
    await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('#game canvas')!.requestPointerLock());
    await expect.poll(async()=>(await read(page)).movement.grounded).toBe(true);
    // Initial source setup raises the stationary body ten units. Zero vertical
    // speed alone would accept that pre-gravity pose as already settled.
    await expect.poll(async()=>{
      const position=(await read(page)).originalBarrels.bodies[0].position;
      const support=runtime.geometry.playerSupportHeightAt(position.x,position.z,position.y+.1,.001,.002);
      return support===undefined?Infinity:position.y-support;
    }).toBeLessThan(ORIGINAL_COLLISION_CONTACT_DISTANCE+.015);
    await expect.poll(async()=>Math.abs((await read(page)).originalBarrels.bodies[0].velocity.y)).toBeLessThan(.03);
    const before=await read(page);aligned(before);await mkdir(out,{recursive:true});
    await page.screenshot({path:`${out}/barrack-barrel-${mode}-before.png`});
    await page.evaluate(()=>{const w=window as any;w.__BARREL_TRACE__=[];w.__BARREL_TIMER__=setInterval(()=>w.__BARREL_TRACE__.push(w.__RA_MULTIPLAYER_DEBUG__.snapshot()),50);});
    await page.keyboard.down('KeyW');
    try{await expect.poll(async()=>projection((await read(page)).originalBarrels.bodies[0].position)-projection(before.originalBarrels.bodies[0].position),{timeout:10_000,intervals:[50]}).toBeGreaterThan(.2);}
    finally{await page.keyboard.up('KeyW');}
    const pushed=await read(page),trace=await page.evaluate(()=>{const w=window as any;clearInterval(w.__BARREL_TIMER__);return w.__BARREL_TRACE__;});
    aligned(pushed);const checks=verifyTrace(trace);expect(trace.some((state:any)=>{const q=state.originalBarrels.bodies[0].orientation;return Math.hypot(q.x,q.y,q.z)>1e-5;})).toBe(true);expect(pushed.originalBarrels.bodies[0].position).not.toEqual(before.originalBarrels.bodies[0].position);
    await page.screenshot({path:`${out}/barrack-barrel-${mode}-pushed.png`});
    let late:any=null;
    if(fixture){
      observerContext=await browser.newContext();const observer=await observerContext.newPage();record(observer);
      observer.on('websocket',s=>s.on('framereceived',frame=>latePackets.push(JSON.parse(String(frame.payload)))));
      await prepare(observer,'barrack',fixture.port);
      await observer.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.enableSourceViewTimings());
      await join(observer,'OBSERVER');
      await expect.poll(async()=>(await read(observer)).originalBarrels.authorityTime).not.toBeNull();
      late=await read(observer);aligned(late);
      const initial=latePackets.find(m=>m.type==='snapshot');expect(initial).toBeDefined();expect(initial.snapshot.barrels).toHaveLength(1);
      expect(projection(initial.snapshot.barrels[0].position)-projection(before.originalBarrels.bodies[0].position)).toBeGreaterThan(.2);
      // A pushed source body can still slide over this open terrain. Compare
      // received state at its exact packet epoch, and rendered prediction with
      // its actual body pivot; do not require an unspecified settling deadline.
      const packet=[...latePackets].reverse().find(m=>m.type==='snapshot'&&(m.snapshot.sourcePhysicsTime??m.snapshot.sourceHealthTime??m.snapshot.serverTime)===late.originalBarrels.snapshotTime);
      expect(packet).toBeDefined();expect(late.originalBarrels.snapshotBodies).toEqual(packet.snapshot.barrels);
      expect(late.originalBarrels.authorityTime).toBe(late.originalBarrels.snapshotTime);
      expect(projection(late.originalBarrels.bodies[0].position)-projection(before.originalBarrels.bodies[0].position)).toBeGreaterThan(.2);
      const canonical=late.originalBarrels.bodies[0];
      await observer.evaluate(({yaw,pitch})=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(yaw,pitch),{yaw:Math.atan2(late.local.x-canonical.position.x,late.local.z-canonical.position.z),pitch:-.25});
      await observer.screenshot({path:`${out}/barrack-barrel-online-latejoin.png`});
      expect(fixture.requests.some((m:any)=>m.type==='transform'&&m.transform.sourceInput?.forward===true)).toBe(true);
    }
    const sourceViewTimings=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.readSourceViewTimings());
    const observerSourceViewTimings=observerContext?await observerContext.pages()[0].evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.readSourceViewTimings()):null;
    await writeFile(`${out}/barrack-barrel-${mode}.json`,JSON.stringify({sourceViewTimings,observerSourceViewTimings,mode,fixtureApproach,before,pushed,trace,checks,late,latePackets,requests:fixture?.requests,messages:fixture?.messages,diagnostics:fixture?.diagnostics,received:fixture?.received,errors,serverErrors,limits:'Real W input and joint physics push the recovered barrel. Solo initial player placement and online room spawns are explicit fixtures. Full recovered hull, rendered matrix and snapshots share reconstructed angular motion. Uniform convex mass properties, sampled rotational sweeps and manifold solver are explicit adapters; native equivalence remains unproved. The source hurt trigger remains unconnected; no detonation is invented.'},null,2));
    expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
  }catch(error){
    await mkdir(out,{recursive:true});
    const current=await read(page).catch(()=>null);
    const trace=await page.evaluate(()=>{const w=window as any;clearInterval(w.__BARREL_TIMER__);return w.__BARREL_TRACE__??[];}).catch(()=>[]);
    const sourceViewTimings=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__?.readSourceViewTimings()).catch(()=>null);
    const observerSourceViewTimings=observerContext?await observerContext.pages()[0]?.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__?.readSourceViewTimings()).catch(()=>null):null;
    await writeFile(`${out}/barrack-barrel-${mode}-failure.json`,JSON.stringify({sourceViewTimings,observerSourceViewTimings,diagnostics:fixture?.diagnostics,received:fixture?.received,error:String(error),fixtureApproach,current,trace,requests:fixture?.requests,messages:fixture?.messages,latePackets,errors,serverErrors},null,2));
    throw error;
  }finally{await observerContext?.close();await fixture?.close();}
});

test('Woodland actual source world has no invented barrel bodies or models',async({page})=>{
  await prepare(page,'woodlands');await page.locator('#deploy').click();const state=await read(page);
  expect(state.originalBarrels.bodies).toEqual([]);expect(state.originalBarrels.models).toEqual([]);
  await mkdir(out,{recursive:true});await writeFile(`${out}/woodlands-no-source-barrel.json`,JSON.stringify(state.originalBarrels,null,2));
});
