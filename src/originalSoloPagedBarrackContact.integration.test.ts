import * as THREE from 'three';
import {expect,it,vi} from 'vitest';
import {startup} from './originalSoloDefaultStartup.fixture';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {originalSpawnIndex} from '../shared/originalSpawnRules';
import * as physics from '../shared/originalPlayerPhysics';
import type {OriginalSoloObserver} from '../shared/originalSoloObserverWorld';

// Preserve the historical outbound coordinates and 0.28 horizontal tolerance.
const outbound=[[-4.037931181066177,63.44768566176471],[-17.217797794117647,63.44768566176471],[-19,63.5],[-19,66],[-8,66],[-8,75.5],[-1.316875,75.5],[-1.316875631010273,74.26773140722996],[-1.3168759265061984,72.57769172419226]] as const;
const frameDelta=1/30,delta=Math.min(.033,frameDelta);
type SolverFailure={callback:number;observer:string;kind:string;requested:number;advanced:number;remaining:number};
type SolverObservation={callback:number;queries:number;incomplete:number;remaining:number;iterations:number;totalCalls:number;totalIncomplete:number;firstIncomplete?:SolverFailure};
function observeSolver(observation:SolverObservation){
 const original=physics.stepOriginalPhysicsWorld;
 // The wrapper closes over scalar diagnostics, never a fixture or checkpoint.
 return vi.spyOn(physics,'stepOriginalPhysicsWorld').mockImplementation((...args)=>{
  const result=original(...args);observation.queries++;observation.totalCalls++;
  for(const substep of result.substeps)observation.iterations=Math.max(observation.iterations,substep.iterations);
  observation.remaining+=result.remainingTime;
  if(result.kind!=='complete'){
   observation.incomplete++;observation.totalIncomplete++;
   observation.firstIncomplete??={callback:observation.callback,observer:args[0][0]?.id??'empty',kind:result.kind,requested:result.requestedTime,advanced:result.advancedTime,remaining:result.remainingTime};
  }
  return result;
 });
}
function pruneEmulator(factory:any):void {
 if(!(factory?._databases instanceof Map))throw Error('Unsupported CPU IndexedDB registry');
 const arrays:any[][]=[];
 for(const database of factory._databases.values()){
  const transactions=database?.transactions;
  if(!Array.isArray(transactions)||transactions.some(tx=>!tx||!['active','inactive','committing','finished'].includes(tx._state)||!['readonly','readwrite','versionchange'].includes(tx.mode)))throw Error('Unsupported CPU IndexedDB transactions');
  arrays.push(transactions);
 }
 for(const transactions of arrays)for(let i=transactions.length-1;i>=0;i--)if(transactions[i]._state==='finished'&&transactions[i].mode!=='versionchange')transactions.splice(i,1);
}
function clearDiagnostics(f:ReturnType<typeof startup>):void {
 for(const target of [f.game,f.game.arena,f.game.originalExplosionPresentation,f.game.originalCombatEffectPresentation,f.game.originalEffectPlanePool])
  if(target)for(const value of Object.values(target))if(vi.isMockFunction(value))value.mockClear();
 for(const history of [f.inputs,f.events,f.humanShots,f.puffContexts,f.drops])history.length=0;
 for(const history of f.programs.values())history.length=0;f.birthReads.clear();
}

/** Separate diagnostic: exact failed upper-ramp route prefix, capped human
 * contacts and motion around callbacks418..435; does not weaken the full
 * round-trip acceptance test. Loaded resources, normal paged CURRENT and Enemy work.
 * This does not instantiate Game's browser constructor or claim raster/audio,
 * native Director/Havok timing, or universal Barrack route accessibility. */
it('diagnoses the normal paged Barrack upper-ramp jump contacts with the unchanged failed route prefix',async()=>{
 const originalRandom=Math.random;Math.random=()=>.99;
 const f=startup('barrack',{paged:true}),game=f.game,materials=new SoldierMaterialLibrary({tier:'low'}),runtime=game.arena.runtime;
 const observation:SolverObservation={callback:-1,queries:0,incomplete:0,remaining:0,iterations:0,totalCalls:0,totalIncomplete:0},solver=observeSolver(observation);
 const trace:Array<{callback:number;leg:'outbound'|'reverse';waypoint:number;x:number;y:number;z:number;colliding:boolean;incomplete:number;remaining:number;iterations:number}>=[];
 let stopped=false,cleanup:Promise<void>|undefined,timer:ReturnType<typeof setTimeout>|undefined,failure:string|undefined;
 let leg:'outbound'|'reverse'='outbound',waypoint=0,outboundCallbacks=0,reverseDoorCrossed=false,doorOpenedAt:number|undefined;
 let finalDoor:{openedAt:number|null;phase:string;elapsedSeconds:number}|undefined;
 let initialSpawnFeet:{x:number;y:number;z:number}|undefined,returnPath:Array<[number,number]>|undefined;
 let settleCallbacks=0,returnJumpIssued=false;
 let jumpLaunch:{callback:number;feet:{x:number;y:number;z:number};velocityY:number}|undefined,jumpLanding:{callback:number;feet:{x:number;y:number;z:number}}|undefined;
 const contactWindow:Array<{callback:number;kind:'blocking'|'support';event:physics.OriginalPhysicsContactDiagnostic}>=[];
 let observedHumanContacts=0,droppedHumanContacts=0;
 const blockingCallbacks=new Set<number>(),supportCallbacks=new Set<number>();
 const motionWindow:Array<{callback:number;before:{feet:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number}};after:{feet:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number}}}>=[];
 let restoreWorldPhysics:(()=>void)|undefined;
 const deadline=performance.now()+150000;
 const active=()=>{if(stopped||performance.now()>=deadline)throw Error('Paged Barrack contact diagnostic exceeded its owned deadline');};
 try{
  game.arena.spawnPoints=runtime.spawnPoints.map((point:{x:number;y:number;z:number})=>new THREE.Vector3(point.x,point.y,point.z));
  game.arena.colliders=[];game.arena.pickups=[];
  const spawnIndex=originalSpawnIndex(game.arena.spawnPoints.length,Math.random()),spawn=game.arena.spawnPoints[spawnIndex];
  expect(spawnIndex).toBe(5);expect(game.soloWorlds).toBeUndefined();
  // Initial recovered spawn selection occurs before any observer registration.
  game.camera.position.set(spawn.x,spawn.y+runtime.profile.eyeHeight,spawn.z);game.applyOriginalSpawnOrientation(spawnIndex);
  initialSpawnFeet={x:spawn.x,y:spawn.y,z:spawn.z};
  Object.assign(game,{soldierMaterialLibrary:materials,viewProjection:new THREE.Group(),recoil:0,weaponSwayX:0,weaponSwayY:0,
   grounded:false,arrowMovement:false,rightMouseAiming:false,sensitivity:1,originalMouseDelta:{x:0,y:0},
   originalPlayerContacts:[],originalProjectileAccumulator:0,nextSourceReloadPoll:-Infinity,originalScopeActive:false,originalScopeFov:50,
   kills:0,deaths:0,shots:0,hits:0,snowTracks:{resetActor(){}},el:()=>({style:{setProperty(){}},classList:{toggle(){}}})});
  game.spawnEnemies();expect(game.enemies).toHaveLength(game.arena.spawnPoints.length-1);
  const worlds=await game.initializeSoloWorldsAsync();active();
  expect(worlds.worlds.size).toBe(game.arena.spawnPoints.length);expect(game.soloPickupOwner).toBeDefined();
  expect(worlds.worlds.get('player').barrels.bodies.length).toBeGreaterThan(0);
  const originalWorldPhysics=worlds.physics;
  worlds.physics=function(time:number,options:{skipIds?:ReadonlySet<string>;onResolvedContact?:(world:OriginalSoloObserver,event:physics.OriginalPhysicsContactDiagnostic)=>void}={}){
   return originalWorldPhysics.call(worlds,time,{...options,onResolvedContact:(world:OriginalSoloObserver,event:physics.OriginalPhysicsContactDiagnostic)=>{
    options.onResolvedContact?.(world,event);
    if(world.id!=='player'||observation.callback<418||observation.callback>435)return;
    const humanA=event.bodyA.id==='player',humanB=event.bodyB.id==='player';
    if(!humanA&&!humanB)return;
    observedHumanContacts++;
    const sign=humanA?1:-1,other=humanA?event.bodyB:event.bodyA;
    // Reserve12 slots for opposing north-edge contacts and4 for support.
    // One per kind/callback stops repeated solver events consuming the cap.
    const kind=other.type==='fixed'&&event.normal.z*sign>.2?'blocking':Math.abs(event.normal.y)>.5?'support':undefined;
    const callbacks=kind==='blocking'?blockingCallbacks:supportCallbacks,limit=kind==='blocking'?12:4;
    if(!kind||callbacks.has(observation.callback)||callbacks.size>=limit){droppedHumanContacts++;return;}
    callbacks.add(observation.callback);
    contactWindow.push({callback:observation.callback,kind,event:structuredClone(event)});
   }});
  };
  restoreWorldPhysics=()=>{worlds.physics=originalWorldPhysics;};
  // The failed direct reversal descended the ramp to y6.229 before meeting
  // a 3.325m roof wall; authentic jump rise is only about1.58m. Preserve the
  // door/corridor reversal through the upper ramp, then cross from plinths
  // source faces18/43 (z61.877..65.018) onto weehuthollow roof faces180/184
  // (y9.554,x−13.473..1.794,z51.687..59.065) with actual Space input.
  returnPath=[...outbound.slice(1,-1).reverse().map(([x,z])=>[x,z] as [number,number]),[-12,63.44768566176471],[-12,62.2],[-12,57.5],[spawn.x,spawn.z]];
  const reverse=returnPath;
  let route:readonly(readonly[number,number])[]=outbound;
  timer=setTimeout(()=>{stopped=true;cleanup=game.disposeSoloWorldsAsync(false);void cleanup!.catch(()=>{});},Math.max(1,deadline-performance.now()));
  game.keys.add('KeyW');
  while(trace.length<440&&game.playerAlive){
   active();
   while(waypoint<route.length&&Math.hypot(game.camera.position.x-route[waypoint][0],game.camera.position.z-route[waypoint][1])<.28)waypoint++;
   if(waypoint===route.length){
    if(leg==='reverse')break;
    const door=worlds.worlds.get('player').doors.getStates().find((state:{name:string})=>state.name==='door open 5');
    expect(door?.openedAt).not.toBeNull();expect(door).toBeDefined();doorOpenedAt=door.openedAt;
    outboundCallbacks=trace.length;leg='reverse';route=reverse;waypoint=0;
   }
   const settling=leg==='reverse'&&waypoint===8&&settleCallbacks<10;
   if(settling)game.keys.delete('KeyW');else game.keys.add('KeyW');
   const jumping=leg==='reverse'&&waypoint===9&&!returnJumpIssued;
   if(jumping){
    expect(game.grounded).toBe(true);game.keys.add('Space');returnJumpIssued=true;
    jumpLaunch={callback:trace.length,feet:{x:game.camera.position.x,y:game.camera.position.y-runtime.profile.eyeHeight,z:game.camera.position.z},velocityY:0};
   }else game.keys.delete('Space');
   const target=route[waypoint];game.yaw=Math.atan2(game.camera.position.x-target[0],game.camera.position.z-target[1]);game.pitch=0;
   game.camera.rotation.set(0,game.yaw,0,'YXZ');game.camera.updateMatrixWorld(true);
   observation.callback=trace.length;observation.queries=0;observation.incomplete=0;observation.remaining=0;observation.iterations=0;
   const humanBefore=worlds.worlds.get('player');
   const before=observation.callback>=418&&observation.callback<=435?{feet:{x:game.camera.position.x,y:game.camera.position.y-runtime.profile.eyeHeight,z:game.camera.position.z},velocity:{...humanBefore.body.velocity}}:undefined;
   game.elapsed=(trace.length+1)/30;game.advanceGameplayFrame(frameDelta);
   const frame=game.soloPendingGameplayFrame,delivery=frame?.deliveryWork;
   expect(frame).toBeDefined();expect(delivery).toBeInstanceOf(Promise);await delivery;active();
   game.resumeSoloGameplayFrame();expect(game.soloPendingGameplayFrame).toBeUndefined();expect(worlds.callbackPhase).toBe('idle');
   game.advancePlayingPopulation(delta);
   if(game.soloPickupRosterWork){await game.soloPickupRosterWork;active();}
   if(worlds.currentAwaiting){await worlds.cancelAndDrainCurrent();active();}
   expect(game.soloCurrentError).toBeUndefined();expect(game.soloPickupFailed).toBe(false);
   const player=worlds.worlds.get('player');expect(player).toBeDefined();expect(player.callback).toBe(trace.length+1);
   expect(observation.queries).toBeGreaterThan(0);
   const feet={x:game.camera.position.x,y:game.camera.position.y-runtime.profile.eyeHeight,z:game.camera.position.z},colliding=worlds.playerIntersects('player',feet);
   trace.push({callback:observation.callback,leg,waypoint,...feet,colliding,incomplete:observation.incomplete,remaining:observation.remaining,iterations:observation.iterations});
   if(before)motionWindow.push({callback:observation.callback,before,after:{feet:{...feet},velocity:{...player.body.velocity}}});
   if(settling&&++settleCallbacks===10){
    // Neutral source controls settle residual lateral velocity. Keep the next
    // run/jump heading at the actual supported x, inside the decoded roof.
    expect(feet.x).toBeGreaterThan(-12.9);expect(feet.x).toBeLessThan(-10.4);
    returnPath![8]=[feet.x,62.2];returnPath![9]=[feet.x,57.5];
   }
   if(jumping){jumpLaunch!.velocityY=player.body.velocity.y;expect(jumpLaunch!.velocityY).toBeGreaterThan(3);game.keys.delete('Space');}
   if(returnJumpIssued&&!jumpLanding&&game.grounded&&feet.z<59.065&&Math.abs(feet.y-initialSpawnFeet!.y)<.28)jumpLanding={callback:observation.callback,feet:{...feet}};
   if(leg==='reverse'&&waypoint>=1&&feet.z>=75.22)reverseDoorCrossed=true;
   expect(colliding).toBe(false);expect(observation.incomplete).toBe(0);
   solver.mockClear();clearDiagnostics(f);pruneEmulator(game.soloPickupStorageFactory);
   if(trace.length%100===0)console.info('paged Barrack contact diagnostic progress',JSON.stringify({callbacks:trace.length,leg,waypoint,heapUsedBytes:process.memoryUsage().heapUsed}));
  }
  while(waypoint<route.length&&Math.hypot(game.camera.position.x-route[waypoint][0],game.camera.position.z-route[waypoint][1])<.28)waypoint++;
  const door=worlds.worlds.get('player')?.doors.getStates().find((state:{name:string})=>state.name==='door open 5');
  if(door)finalDoor={openedAt:door.openedAt,phase:door.phase,elapsedSeconds:door.elapsedSeconds};
  // This is a contact diagnostic, not a passing full-return acceptance gate.
  expect(trace.length).toBe(440);expect(outboundCallbacks).toBe(233);
  expect(leg).toBe('reverse');expect(reverseDoorCrossed).toBe(true);
  expect(game.playerAlive).toBe(true);expect(observation.totalIncomplete).toBe(0);
  expect(door.openedAt).toBe(doorOpenedAt);expect(door.phase).toBe('open');
  expect(settleCallbacks).toBe(10);expect(returnJumpIssued).toBe(true);
  expect(jumpLaunch).toBeDefined();expect(jumpLaunch!.callback).toBe(423);
  expect(jumpLaunch!.velocityY).toBeGreaterThan(3);
  expect(blockingCallbacks.size).toBeGreaterThan(0);expect(contactWindow.length).toBeGreaterThan(0);expect(contactWindow.length).toBeLessThanOrEqual(16);
  expect(motionWindow).toHaveLength(18);
 }catch(error){failure=error instanceof Error?error.message:String(error);throw error;}
 finally{
  if(timer)clearTimeout(timer);stopped=true;
  const retainedDoor=game.soloWorlds?.worlds.get('player')?.doors.getStates().find((state:{name:string})=>state.name==='door open 5');
  if(retainedDoor)finalDoor={openedAt:retainedDoor.openedAt,phase:retainedDoor.phase,elapsedSeconds:retainedDoor.elapsedSeconds};
  console.info('paged Barrack contact diagnostic observation',JSON.stringify({scope:'normal paged CPU Game frame/population; deterministic .99 spawn5; no native/raster claim',callbacks:trace.length,outboundCallbacks,leg,reachedWaypoints:waypoint,reverseDoorCrossed,doorOpenedAt,finalDoor,initialSpawnFeet,returnPath,settleCallbacks,jumpLaunch,jumpLanding,totalSolverCalls:observation.totalCalls,totalIncomplete:observation.totalIncomplete,firstIncomplete:observation.firstIncomplete,final:trace.at(-1),observedHumanContacts,droppedHumanContacts,contactWindow,motionWindow,failure}));
  restoreWorldPhysics?.();game.keys.clear();solver.mockClear();solver.mockRestore();Math.random=originalRandom;
  // Failed cleanup leaves genuine owners retained. Release borrowed resources
  // only after terminal cancellation and the actual Game storage teardown.
  if(cleanup)await cleanup;await game.disposeSoloWorldsAsync(false);game.clearEnemies();materials.dispose();f.dispose();clearDiagnostics(f);
 }
},180000);
