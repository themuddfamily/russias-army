import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {startup} from './originalSoloDefaultStartup.fixture';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {OriginalSoldier,isOriginalSoldierConstructorCapture} from './originalSoldier';

const maps=['barrack','woodlands'] as const;
type Restore=()=>void;
function replace(target:any,key:string,value:any,restores:Restore[]):void {
 const own=Object.getOwnPropertyDescriptor(target,key);
 Object.defineProperty(target,key,{configurable:true,writable:true,value});
 restores.push(()=>{if(own)Object.defineProperty(target,key,own);else Reflect.deleteProperty(target,key);});
}
function count(target:any,key:string,restores:Restore[]){
 const original=target[key],observation={calls:0,times:[] as number[]};
 replace(target,key,function(this:any,...args:any[]){observation.calls++;if(typeof args[0]==='number')observation.times.push(args[0]);return original.apply(this,args);},restores);
 return observation;
}
// fake-indexeddb retains terminal request/rollback caches. Preserve upgrade
// transactions and all unfinished scheduler entries; never change stored rows.
function prune(factory:any):void {
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
async function frameFixture(map:typeof maps[number]){
 const f=startup(map,{paged:true}),game=f.game,materials=new SoldierMaterialLibrary({tier:'low'}),restores:Restore[]=[];
 const eye=game.camera.position.clone();
 // Real decoded-map physics, elevated separated bodies, no skipIds or solver
 // substitute. DOM/audio sinks exclude renderer and native timing claims.
 game.arena.spawnPoints=[eye.clone().add(new THREE.Vector3(0,-1.8,0)),eye.clone().add(new THREE.Vector3(100,-1.8,0))];
 Object.assign(game,{soldierMaterialLibrary:materials,viewProjection:new THREE.Group(),recoil:0,weaponSwayX:0,weaponSwayY:0,
  grounded:false,arrowMovement:false,rightMouseAiming:false,sensitivity:1,originalMouseDelta:{x:0,y:0},
  originalPlayerContacts:[],originalProjectileAccumulator:0,nextSourceReloadPoll:-Infinity,originalScopeActive:false,originalScopeFov:50,
  el:()=>({style:{setProperty(){}},classList:{toggle(){}}})});
 game.spawnEnemies();const enemy=game.enemies[0],seed=enemy.sourceRig.readConstructorSeedCapture();
 const worlds=await game.initializeSoloWorldsAsync(),player=worlds.worlds.get('player')!,bot=worlds.worlds.get(enemy.id)!;
 const launchFrame=(time:number)=>{game.elapsed=time;game.advanceGameplayFrame(1/30);return game.soloPendingGameplayFrame;};
 const finishFrame=async(frame:any)=>{
  expect(frame).toBeDefined();const delivery=frame.deliveryWork;expect(delivery).toBeInstanceOf(Promise);await delivery;
  game.resumeSoloGameplayFrame();expect(game.soloPendingGameplayFrame).toBeUndefined();expect(worlds.callbackPhase).toBe('idle');
  prune(game.soloPickupStorageFactory);clearDiagnostics(f);
 };
 return {...f,enemy,seed,worlds,player,bot,restores,launchFrame,finishFrame,frame:async(time:number)=>finishFrame(launchFrame(time)),
  async close(){
   // Resource release follows terminal owned cleanup; a failed drain leaves
   // the owners available for explicit retry instead of discarding them.
   await game.disposeSoloWorldsAsync(false);game.clearEnemies();materials.dispose();f.dispose();clearDiagnostics(f);
   for(const restore of restores.reverse())restore();
  }};
}

describe('normal paged Game complete frame dispatch with real CPU map physics',()=>{
 it.each(maps)('%s commits physical bodies, spawned enemy bindings and all four real presentation consumers',async map=>{
  const f=await frameFixture(map);try{
   expect(f.enemy.sourceRig).toBeInstanceOf(OriginalSoldier);expect(isOriginalSoldierConstructorCapture(f.seed)).toBe(true);
   expect(f.seed.selectedWeapon).toBe('rpg');expect(f.seed.resourceBindingId).toBe(f.soldierResources.resourceBindingId);
   const physics=count(f.worlds,'physics',f.restores),callback=count(f.game,'updateOriginalPlayerCallback',f.restores),actors=count(f.worlds,'actors',f.restores);
   const before=f.game.camera.position.clone();await f.frame(0);
   expect(physics.calls).toBe(1);expect(callback.calls).toBe(1);expect(actors.calls).toBe(1);
   expect(f.player.callback).toBe(1);expect(f.bot.callback).toBe(1);expect(f.game.camera.position.y).toBeLessThan(before.y);
   expect(f.player.health.flick).toBe(-2);expect(f.game.sourceHealth).toBe(f.player.health);
   expect(f.player.loadout.selected).toBe('launcher');expect(f.bot.loadout).toBeUndefined();expect(f.bot.localWeapons.selectedWeapon).toBe('rifle');
   expect(f.player.modelState.pickupHistory.root.count).toBe(0);expect(f.player.modelState.pickups).toEqual([]);
   expect(f.game.soloReceiverModels.presentation.freeze()).toBe(f.player.modelState);
   expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(f.player.transientState);
   expect(f.game.soloLocalWeaponPresentation.adapter.freeze()).toEqual(f.player.localWeapons);
   expect(f.game.soloProjectilePresentation.adapter.freeze()).toEqual(f.player.projectileState);
   expect(f.enemy.sourceRig).toBe(f.game.soloReceiverModels.presentation.actorRig(f.enemy.id));
   expect(f.player.modelState.actors.some((actor:any)=>actor.actorId===f.enemy.id)).toBe(true);
  }finally{await f.close();}
 });
 it.each(maps)('%s holds physical and gun admission while actual paged CURRENT awaits its cohort',async map=>{
  const f=await frameFixture(map);let release!:()=>void;try{
   const held=new Promise<void>(resolve=>{release=resolve;}),factory=f.game.soloCurrentCohortAt;
   let first=true;replace(f.game,'soloCurrentCohortAt',()=>{const cohort=factory();return {...cohort,begin:async(...args:any[])=>{if(first){first=false;await held;}return cohort.begin(...args);}};},f.restores);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores),scope=count(f.game,'advanceCommittedSoloGunScope',f.restores);
   f.game.keys.add('KeyW');f.game.originalMouseDelta={x:4,y:2};const frame=f.launchFrame(0);
   const body=structuredClone(f.player.body),camera=f.game.camera.position.clone(),yaw=f.game.yaw,pitch=f.game.pitch,captured=f.game.soloHumanCallbackInput.input,reads=input.calls,poll=f.game.nextSourceReloadPoll;
   expect(frame.stage).toBe('delivery');expect(f.player.callback).toBe(0);expect(f.game.soloCurrentWork).toBe(frame.deliveryWork);
   f.game.keys.clear();f.game.keys.add('Digit1');f.game.originalMouseDelta={x:9,y:7};f.game.firing=true;f.game.elapsed=1/30;f.game.advanceGameplayFrame(1/30);
   expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(physics.calls).toBe(1);expect(input.calls).toBe(reads);expect(scope.calls).toBe(0);
   expect(f.player.body).toEqual(body);expect(f.game.camera.position).toEqual(camera);expect(f.game.yaw).toBe(yaw);expect(f.game.pitch).toBe(pitch);expect(f.game.nextSourceReloadPoll).toBe(poll);
   release();await f.finishFrame(frame);expect(f.game.elapsed).toBe(1/30);expect(f.player.callback).toBe(1);expect(f.player.loadout.selected).toBe('launcher');expect(scope.calls).toBe(1);
   expect(f.game.soloHumanCallbackInput.input).toBe(captured);expect(f.game.originalMouseDelta).toEqual({x:9,y:7});
   f.game.firing=false;await f.frame(1/30);expect(physics.calls).toBe(2);expect(f.player.callback).toBe(2);expect(f.player.loadout.selected).toBe('pistol');expect(f.game.originalMouseDelta).toEqual({x:0,y:0});
  }finally{release?.();await f.close();}
 });
 it.each(maps)('%s explicitly retries failed paged publication without repeating physics or captured control input',async map=>{
  const f=await frameFixture(map);try{
   const factory=f.game.soloCurrentCohortAt,error=Error('paged frame before-CAS failure');let fail=true;
   replace(f.game,'soloCurrentCohortAt',()=>{const cohort=factory();return {...cohort,begin:async(...args:any[])=>{if(fail){fail=false;throw error;}return cohort.begin(...args);}};},f.restores);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores),actors=count(f.worlds,'actors',f.restores);
   f.game.originalMouseDelta={x:4,y:2};const frame=f.launchFrame(0),delivery=frame.deliveryWork;await expect(delivery).rejects.toBe(error);
   const body=structuredClone(f.player.body),captured=f.game.soloHumanCallbackInput.input,reads=input.calls;
   expect(f.game.soloCurrentError).toBe(error);expect(f.player.callback).toBe(0);expect(actors.calls).toBe(0);
   f.game.keys.add('Digit1');f.game.originalMouseDelta={x:8,y:6};f.game.elapsed=1/30;f.game.advanceGameplayFrame(1/30);
   expect(physics.calls).toBe(1);expect(f.game.soloPendingGameplayFrame).toBe(frame);
   await f.game.retrySoloCurrentAsync();f.game.resumeSoloGameplayFrame();expect(f.game.soloPendingGameplayFrame).toBeUndefined();
   expect(f.player.callback).toBe(1);expect(f.bot.callback).toBe(1);expect(physics.calls).toBe(1);expect(input.calls).toBe(reads);expect(actors.calls).toBe(1);
   expect(f.player.body).toEqual(body);expect(f.game.soloHumanCallbackInput.input).toBe(captured);expect(f.player.loadout.selected).toBe('launcher');expect(f.game.originalMouseDelta).toEqual({x:8,y:6});
  }finally{await f.close();}
 });
 for(const weapon of ['launcher','rpg'] as const)it.each(maps)(`%s completes a real ${weapon} launch, physical actor and captured scope tail`,async map=>{
  const f=await frameFixture(map);try{
   if(weapon==='rpg')f.game.keys.add('Digit5');
   for(let callback=0;callback<45;callback++){await f.frame(callback/30);f.game.keys.clear();}
   const scope=count(f.game,'advanceCommittedSoloGunScope',f.restores),legacyMesh=count(f.game,'createProjectileMesh',f.restores),legacyOrient=count(f.game,'orientProjectileMesh',f.restores),ammo=f.player.loadout.ammo[weapon];
   expect(f.player.loadout.selected).toBe(weapon);expect(ammo).toBe(weapon==='launcher'?6:1);
   f.game.firing=true;await f.frame(45/30);f.game.firing=false;
   expect(f.player.loadout.ammo[weapon]).toBe(ammo-1);expect(f.player.projectiles.size).toBe(1);expect(f.bot.projectiles.size).toBe(1);expect(scope.calls).toBe(1);
   const physical=[...f.player.projectiles.values()][0] as any,peer=[...f.bot.projectiles.values()][0] as any;
   expect(peer.launch).toBe(physical.launch);expect(physical.launch.ownerId).toBe('player');expect(physical.state.remainingCallbacks).toBe(weapon==='launcher'?60:200);
   const actor=f.player.projectileState.actors[0],mesh=f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle),matrix=mesh.matrixWorld.clone();
   expect(mesh).toBeInstanceOf(THREE.Mesh);expect(mesh.parent).toBe(f.scene);
   expect(mesh.geometry).toBe(f.collection.resources.get(weapon==='launcher'?'rg6grenade':'rpgrocket')!.geometry);
   await f.frame(46/30);expect(f.player.loadout.ammo[weapon]).toBe(ammo-1);expect(scope.calls).toBe(2);
   expect(f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle)).toBe(mesh);expect(mesh.matrixWorld.equals(matrix)).toBe(false);expect(physical.state.remainingCallbacks).toBe(weapon==='launcher'?59:199);
   if(weapon==='rpg')expect(f.player.transientState.actors.filter((value:any)=>value.kind==='puff')).toHaveLength(1);
   expect(f.game.soloCommittedGunOutput.scopeAdvanced).toBe(true);expect(f.game.originalScopeActive).toBe(false);
   expect(legacyMesh.calls).toBe(0);expect(legacyOrient.calls).toBe(0);
  }finally{await f.close();}
 },60000);
 for(const weapon of ['launcher','rpg'] as const)it.each(maps)(`%s retries one captured ${weapon} firing frame before CAS without duplicate launch or debit`,async map=>{
  const f=await frameFixture(map);try{
   if(weapon==='rpg')f.game.keys.add('Digit5');
   for(let callback=0;callback<45;callback++){await f.frame(callback/30);f.game.keys.clear();}
   const ammo=f.player.loadout.ammo[weapon],factory=f.game.soloCurrentCohortAt,error=Error(`captured ${weapon} launch before CAS`);
   let fail=true,capturedLaunch:any,spawned=0;
   replace(f.game,'soloCurrentCohortAt',()=>{
    const cohort=factory();return {...cohort,begin:async(...args:any[])=>{
     if(fail){
      fail=false;
      // The actual fire reservation is sealed before storage begins, but its
      // immutable launch and physical copies have not been published yet.
      capturedLaunch=f.worlds.pendingLaunchBatch.incoming(f.bot)[0].reservation.launch;throw error;
     }
     return cohort.begin(...args);
    }};
   },f.restores);
   const receive=f.game.receiveSoloWorldEvent;
   replace(f.game,'receiveSoloWorldEvent',function(this:any,event:any){
    if(event.kind==='spawned'){spawned++;expect(event.launch).toBe(capturedLaunch);}return receive.call(this,event);
   },f.restores);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores),actors=count(f.worlds,'actors',f.restores),scope=count(f.game,'advanceCommittedSoloGunScope',f.restores);
   const legacyMesh=count(f.game,'createProjectileMesh',f.restores),legacyOrient=count(f.game,'orientProjectileMesh',f.restores);
   f.game.firing=true;const frame=f.launchFrame(45/30),delivery=frame.deliveryWork;await expect(delivery).rejects.toBe(error);
   const body=structuredClone(f.player.body),health={...f.player.health},captured=f.game.soloHumanCallbackInput.input,reads=input.calls,poll=f.game.nextSourceReloadPoll;
   expect(captured.held.fire).toBe(true);expect(capturedLaunch.weapon).toBe(weapon);expect(capturedLaunch.ownerId).toBe('player');
   expect(f.game.soloCurrentError).toBe(error);expect(f.player.callback).toBe(45);expect(f.bot.callback).toBe(45);
   expect(f.player.loadout.ammo[weapon]).toBe(ammo);expect(f.player.projectiles.size).toBe(0);expect(f.bot.projectiles.size).toBe(0);expect(spawned).toBe(0);
   expect(physics.calls).toBe(1);expect(actors.calls).toBe(0);expect(scope.calls).toBe(0);
   f.game.firing=false;f.game.keys.add('Digit1');f.game.originalMouseDelta={x:7,y:5};f.game.elapsed=46/30;f.game.advanceGameplayFrame(1/30);
   expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(physics.calls).toBe(1);expect(input.calls).toBe(reads);expect(f.game.nextSourceReloadPoll).toBe(poll);
   await f.game.retrySoloCurrentAsync();f.game.resumeSoloGameplayFrame();prune(f.game.soloPickupStorageFactory);clearDiagnostics(f);
   expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(f.worlds.callbackPhase).toBe('idle');expect(f.player.callback).toBe(46);expect(f.bot.callback).toBe(46);
   expect(physics.calls).toBe(1);expect(input.calls).toBe(reads);expect(actors.calls).toBe(1);expect(scope.calls).toBe(1);expect(spawned).toBe(2);
   expect(f.player.body).toEqual(body);expect(f.player.health).toEqual(health);expect(f.game.soloHumanCallbackInput.input).toBe(captured);
   expect(f.game.originalMouseDelta).toEqual({x:7,y:5});expect(f.game.elapsed).toBe(46/30);expect(f.player.loadout.selected).toBe(weapon);expect(f.player.loadout.ammo[weapon]).toBe(ammo-1);
   expect(f.player.projectiles.size).toBe(1);expect(f.bot.projectiles.size).toBe(1);
   const physical=[...f.player.projectiles.values()][0] as any,peer=[...f.bot.projectiles.values()][0] as any;
   expect(physical.launch).toBe(capturedLaunch);expect(peer.launch).toBe(capturedLaunch);expect(physical.state.remainingCallbacks).toBe(weapon==='launcher'?60:200);
   const actor=f.player.projectileState.actors[0],mesh=f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle),matrix=mesh.matrixWorld.clone();
   expect(mesh).toBeInstanceOf(THREE.Mesh);expect(mesh.parent).toBe(f.scene);expect(mesh.geometry).toBe(f.collection.resources.get(weapon==='launcher'?'rg6grenade':'rpgrocket')!.geometry);
   await f.frame(46/30);expect(f.player.callback).toBe(47);expect(physics.calls).toBe(2);expect(actors.calls).toBe(2);expect(scope.calls).toBe(2);expect(spawned).toBe(2);
   expect(f.player.loadout.ammo[weapon]).toBe(ammo-1);expect(f.player.projectiles.size).toBe(1);expect(f.bot.projectiles.size).toBe(1);
   expect(f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle)).toBe(mesh);expect(mesh.matrixWorld.equals(matrix)).toBe(false);
   expect(physical.state.remainingCallbacks).toBe(weapon==='launcher'?59:199);expect(legacyMesh.calls).toBe(0);expect(legacyOrient.calls).toBe(0);
  }finally{await f.close();}
 },60000);
 it.each(maps.flatMap(map=>(['reader','published'] as const).flatMap(pin=>[1,2].map(failures=>[map,pin,failures] as const))))('%s retains committed cohort %s cleanup through %i failed unpins without replaying the frame',async(map,pin,failures)=>{
  const f=await frameFixture(map);try{
   f.game.keys.add('Digit6');await f.frame(0);f.game.keys.clear();
   const owner=f.game.soloPickupOwner,store=f.game.soloPickupStore,unpin=store.unpin,error=Error(`committed cohort ${pin} unpin unavailable`);
   let remaining=failures,failedLease:string|undefined,successfulRetries=0;
   replace(store,'unpin',async function(this:any,lease:string){
    if(remaining>0&&lease.endsWith(`-${pin}`)){
     failedLease??=lease;expect(lease).toBe(failedLease);remaining--;throw error;
    }
    const result=await unpin.call(this,lease);if(lease===failedLease)successfulRetries++;return result;
   },f.restores);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores),actors=count(f.worlds,'actors',f.restores);
   const current=count(f.worlds,'completeGoodyAsync',f.restores),cohorts=count(owner,'createCohort',f.restores),scope=count(f.game,'advanceCommittedSoloGunScope',f.restores),claims=count(store,'claimOutputChunk',f.restores);
   f.game.keys.add('ShiftLeft');f.game.originalMouseDelta={x:4,y:2};
   const frame=f.launchFrame(1/30);await expect(frame.deliveryWork).rejects.toBe(error);
   const manifest=await store.readManifest(),body=structuredClone(f.player.body),captured=f.game.soloHumanCallbackInput.input,reads=input.calls;
   const model=f.player.modelState,localWeapons=f.player.localWeapons,receipt=f.player.receiptTick,claimed=claims.calls;
   expect(claimed).toBeGreaterThan(0);expect(captured.sourceScopeEnabled).toBe(true);
   expect(failedLease).toBeDefined();expect(owner.awaiting).toBe(true);expect(f.game.soloCurrentError).toBe(error);
   expect(f.player.callback).toBe(2);expect(f.bot.callback).toBe(2);expect(f.worlds.callbackPhase).toBe('goody');
   expect(current.calls).toBe(1);expect(cohorts.calls).toBe(1);expect(physics.calls).toBe(1);expect(actors.calls).toBe(0);expect(scope.calls).toBe(0);
   f.game.keys.clear();f.game.keys.add('Digit1');f.game.originalMouseDelta={x:8,y:6};f.game.elapsed=2/30;f.game.advanceGameplayFrame(1/30);
   expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(physics.calls).toBe(1);expect(input.calls).toBe(reads);
   if(failures===2){
    await expect(f.game.retrySoloCurrentAsync()).rejects.toBe(error);
    expect(owner.awaiting).toBe(true);expect(frame.deliveryFailed).toBe(true);expect(successfulRetries).toBe(0);
    expect((await store.readManifest()).version).toBe(manifest.version);expect(f.player.callback).toBe(2);expect(f.player.receiptTick).toBe(receipt);
    expect(f.player.modelState).toBe(model);expect(f.player.localWeapons).toBe(localWeapons);expect(f.player.body).toEqual(body);
    expect(claims.calls).toBe(claimed);
    f.game.resumeSoloGameplayFrame();expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(actors.calls).toBe(0);expect(scope.calls).toBe(0);
   }
   await f.game.retrySoloCurrentAsync();expect(successfulRetries).toBe(1);expect(owner.awaiting).toBe(false);
   expect((await store.readManifest()).version).toBe(manifest.version);expect(current.calls).toBe(1);expect(cohorts.calls).toBe(1);
   expect(claims.calls).toBe(claimed);
   expect(f.player.callback).toBe(2);expect(f.player.receiptTick).toBe(receipt);expect(f.player.modelState).toBe(model);expect(f.player.localWeapons).toBe(localWeapons);
   expect(f.player.body).toEqual(body);expect(input.calls).toBe(reads);expect(f.game.soloHumanCallbackInput.input).toBe(captured);
   expect(f.game.originalMouseDelta).toEqual({x:8,y:6});expect(f.game.soloCurrentError).toBeUndefined();
   f.game.resumeSoloGameplayFrame();expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(actors.calls).toBe(1);expect(scope.calls).toBe(1);
   expect(f.game.originalScopeActive).toBe(true);expect(f.game.originalScopeFov).toBe(35);expect(f.player.loadout.selected).toBe('sniper');
   f.game.resumeSoloGameplayFrame();expect(actors.calls).toBe(1);expect(scope.calls).toBe(1);
   await f.frame(2/30);expect(f.player.callback).toBe(3);expect(physics.calls).toBe(2);expect(current.calls).toBe(2);expect(cohorts.calls).toBe(2);
   expect(actors.calls).toBe(2);expect(scope.calls).toBe(2);expect(f.player.loadout.selected).toBe('pistol');expect(f.game.originalScopeActive).toBe(false);
  }finally{await f.close();}
 });
 it.each(maps.flatMap(map=>[[map,1],[map,2]] as const))('%s retains published retirement cleanup through %i failed unpins and then admits a complete frame',async(map,failures)=>{
  const f=await frameFixture(map);try{
   await f.frame(0);
   const owner=f.game.soloPickupOwner,store=f.game.soloPickupStore,id=f.enemy.id,life=f.bot.lifeGeneration;
   replace(f.game,'localCallsign','CPU Human',f.restores);replace(f.game,'addKillFeed',()=>{},f.restores);
   const retirement=count(owner,'retireLife',f.restores),disposal=count(f.worlds,'disposeAsync',f.restores),current=count(f.worlds,'completeGoodyAsync',f.restores);
   let deaths=0;const receive=f.game.receiveSoloWorldEvent;
   replace(f.game,'receiveSoloWorldEvent',function(this:any,event:any){if(event.kind==='dead'&&event.recipientId===id)deaths++;return receive.call(this,event);},f.restores);
   expect(f.worlds.damage(id,1000,f.game.elapsed,{ownerId:'player',ownerName:'CPU attacker'}).dead).toBe(true);
   await f.worlds.cancelAndDrainCurrent();
   expect(f.worlds.worlds.has(id)).toBe(false);expect(deaths).toBe(1);expect(disposal.calls).toBe(1);expect(f.game.soloPickupRetirements.get(id)).toBe(life);
   const unpin=store.unpin,error=Error('retirement published pin unavailable');let failuresRemaining=failures,failedLease:string|undefined,cleanupRetries=0;
   replace(store,'unpin',async function(this:any,lease:string){
    if(failuresRemaining>0&&lease.endsWith('-published')){
     const manifest=await store.readManifest();
     // CURRENT's output pin closes while the bot row still exists. Inject only
     // after the authoritative retirement CAS has removed that durable row.
     if(!manifest.observers.some((row:any)=>row.observer===id)){failuresRemaining--;failedLease=lease;throw error;}
    }
    if(lease===failedLease)cleanupRetries++;return unpin.call(this,lease);
   },f.restores);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores),actors=count(f.worlds,'actors',f.restores);
   const frame=f.launchFrame(1/30),delivery=frame.deliveryWork;await expect(delivery).rejects.toThrow('Solo pickup roster cleanup failed');
   const manifest=await store.readManifest(),body=structuredClone(f.player.body),captured=f.game.soloHumanCallbackInput.input,reads=input.calls;
   expect(failedLease).toBeDefined();expect(manifest.observers.some((row:any)=>row.observer===id)).toBe(false);
   expect(()=>owner.sourceAt(id,life)).toThrow('unavailable');expect(owner.awaiting).toBe(true);
   expect(f.game.soloPickupFailed).toBe(true);expect(f.game.soloPickupFailure).toBe(f.game.soloCurrentError);
   expect(f.player.callback).toBe(2);expect(f.worlds.callbackPhase).toBe('goody');expect(retirement.calls).toBe(1);expect(current.calls).toBe(1);expect(actors.calls).toBe(0);
   f.game.elapsed=2/30;f.game.advanceGameplayFrame(1/30);expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(physics.calls).toBe(1);
   if(failures===2){
    await expect(f.game.retrySoloCurrentAsync()).rejects.toThrow('Solo pickup roster cleanup failed');
    expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(frame.deliveryFailed).toBe(true);expect(owner.awaiting).toBe(true);
    expect(f.game.soloPickupFailed).toBe(true);expect(f.game.soloPickupFailure).toBe(f.game.soloCurrentError);expect(cleanupRetries).toBe(0);
    expect((await store.readManifest()).version).toBe(manifest.version);expect(f.player.callback).toBe(2);expect(f.worlds.callbackPhase).toBe('goody');
    expect(f.player.body).toEqual(body);expect(f.game.soloHumanCallbackInput.input).toBe(captured);expect(input.calls).toBe(reads);
    f.game.resumeSoloGameplayFrame();f.game.advanceGameplayFrame(1/30);
    expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(physics.calls).toBe(1);expect(actors.calls).toBe(0);
    expect(retirement.calls).toBe(1);expect(current.calls).toBe(1);expect(disposal.calls).toBe(1);expect(deaths).toBe(1);
   }
   await f.game.retrySoloCurrentAsync();
   expect(cleanupRetries).toBe(1);expect(owner.awaiting).toBe(false);expect(f.game.soloPickupFailed).toBe(false);expect(f.game.soloPickupFailure).toBeUndefined();
   expect((await store.readManifest()).version).toBe(manifest.version);expect(retirement.calls).toBe(1);expect(current.calls).toBe(1);expect(disposal.calls).toBe(1);expect(deaths).toBe(1);
   expect(f.player.body).toEqual(body);expect(f.game.soloHumanCallbackInput.input).toBe(captured);expect(input.calls).toBe(reads);
   f.game.resumeSoloGameplayFrame();expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(actors.calls).toBe(1);expect(f.game.soloPickupRetirements.size).toBe(0);
   await f.frame(2/30);expect(f.player.callback).toBe(3);expect(physics.calls).toBe(2);expect(current.calls).toBe(2);expect(actors.calls).toBe(2);
   expect(deaths).toBe(1);expect(disposal.calls).toBe(1);expect(retirement.calls).toBe(1);
  }finally{await f.close();}
 });
 it.each(maps)('%s drains held paged CURRENT before releasing owners and suppresses later frame presentation',async map=>{
  const f=await frameFixture(map);let release!:()=>void,teardown:Promise<void>|undefined;
  try{
   await f.frame(0);
   const models=f.game.soloReceiverModels,transients=f.game.soloReceiverTransients,startupOwner=f.game.soloStartupResources,factoryOwner=f.game.soloLoadedSceneFactory,store=f.game.soloPickupStore;
   const modelRelease=count(models.presentation,'dispose',f.restores),transientRelease=count(transients.presentation,'dispose',f.restores),materialRelease=count(startupOwner.planeOwner.planeMaterial,'dispose',f.restores),storageClose=count(store,'close',f.restores);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores),actors=count(f.worlds,'actors',f.restores),scope=count(f.game,'advanceCommittedSoloGunScope',f.restores),mirrors=count(f.game,'syncSoloMirrors',f.restores);
   const held=new Promise<void>(resolve=>{release=resolve;}),factory=f.game.soloCurrentCohortAt;
   replace(f.game,'soloCurrentCohortAt',()=>{const cohort=factory();return {...cohort,begin:async(...args:any[])=>{await held;return cohort.begin(...args);}};},f.restores);
   f.game.originalMouseDelta={x:4,y:2};const frame=f.launchFrame(1/30),delivery=frame.deliveryWork,deliveryOutcome=Promise.allSettled([delivery]);
   const body=structuredClone(f.player.body),captured=f.game.soloHumanCallbackInput.input,reads=input.calls,callback=f.player.callback;
   let terminal=false;const closing:Promise<void>=f.game.disposeSoloWorldsAsync(false);teardown=closing;void closing.then(()=>{terminal=true;},()=>{});
   expect(f.game.soloPickupCancelling).toBe(true);expect(f.game.soloPickupClosing).toBe(teardown);
   expect(f.game.soloWorlds).toBe(f.worlds);expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(f.game.soloStartupResources).toBe(startupOwner);
   expect(f.game.soloReceiverModels).toBe(models);expect(f.game.soloReceiverTransients).toBe(transients);expect(f.game.soloLoadedSceneFactory).toBe(factoryOwner);
   expect(modelRelease.calls).toBe(0);expect(transientRelease.calls).toBe(0);expect(materialRelease.calls).toBe(0);expect(storageClose.calls).toBe(0);expect(terminal).toBe(false);
   f.game.keys.add('Digit1');f.game.firing=true;f.game.originalMouseDelta={x:8,y:6};f.game.elapsed=2/30;
   f.game.advanceGameplayFrame(1/30);f.game.updateSourceWeaponInput();f.game.resumeSoloGameplayFrame();
   expect(physics.calls).toBe(1);expect(input.calls).toBe(reads);expect(f.player.body).toEqual(body);expect(f.game.soloHumanCallbackInput.input).toBe(captured);
   expect(f.player.callback).toBe(callback);expect(mirrors.calls).toBe(0);expect(actors.calls).toBe(0);expect(scope.calls).toBe(0);
   release();await deliveryOutcome;await teardown;
   expect(terminal).toBe(true);expect(modelRelease.calls).toBe(1);expect(transientRelease.calls).toBe(1);expect(materialRelease.calls).toBe(1);expect(storageClose.calls).toBe(1);
   expect(f.game.soloWorlds).toBeUndefined();expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(f.game.soloHumanCallbackInput).toBeUndefined();
   expect(f.game.soloReceiverModels).toBeUndefined();expect(f.game.soloReceiverTransients).toBeUndefined();expect(f.game.soloStartupResources).toBeUndefined();expect(f.game.soloPickupStore).toBeUndefined();
   expect(()=>factoryOwner.readAssembly('player',f.player.lifeGeneration)).toThrow('released');expect(()=>startupOwner.resources).toThrow('released');
   expect(f.player.callback).toBe(callback);expect(physics.calls).toBe(1);expect(input.calls).toBe(reads);expect(mirrors.calls).toBe(0);expect(actors.calls).toBe(0);expect(scope.calls).toBe(0);
  }finally{release?.();if(teardown)await teardown;await f.close();}
 });
 it.each(maps)('%s drains a post-CAS gun sink error without replaying committed fire or presentation commands',async map=>{
  const f=await frameFixture(map);try{
   for(let callback=0;callback<45;callback++)await f.frame(callback/30);
   const factory=f.game.soloCurrentCohortAt;let publications=0;
   replace(f.game,'soloCurrentCohortAt',()=>{const cohort=factory();return {...cohort,publish:async()=>{publications++;await cohort.publish();}};},f.restores);
   const receive=f.game.receiveSoloWorldEvent,error=Error('committed gun pitch sink');let fail=true,pitchOutputs=0;
   replace(f.game,'receiveSoloWorldEvent',function(this:any,event:any){
    receive.call(this,event);
    if(event.kind==='gun-output'&&event.recipientId==='player'&&event.output.kind==='look-kick'&&event.output.axis==='pitch'){
     pitchOutputs++;if(fail){fail=false;throw error;}
    }
   },f.restores);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores),actors=count(f.worlds,'actors',f.restores),scope=count(f.game,'advanceCommittedSoloGunScope',f.restores);
   const ammo=f.player.loadout.ammo.launcher;f.game.firing=true;const frame=f.launchFrame(45/30),delivery=frame.deliveryWork;
   await expect(delivery).rejects.toThrow('Solo committed streamed callback dispatch failed');f.game.firing=false;
   const body=structuredClone(f.player.body),captured=f.game.soloHumanCallbackInput.input,reads=input.calls,pitch=f.game.pitch,projectile=[...f.player.projectiles.values()][0] as any;
   expect(f.game.soloCurrentError).toBeDefined();expect(frame.deliveryFailed).toBe(true);expect(f.worlds.callbackPhase).toBe('goody');expect(f.player.callback).toBe(46);
   expect(publications).toBe(1);expect(pitchOutputs).toBe(1);expect(f.player.loadout.ammo.launcher).toBe(ammo-1);
   expect(f.player.projectiles.size).toBe(1);expect(f.bot.projectiles.size).toBe(1);expect(projectile.state.remainingCallbacks).toBe(60);expect(actors.calls).toBe(0);expect(scope.calls).toBe(0);
   f.game.elapsed=46/30;f.game.advanceGameplayFrame(1/30);expect(physics.calls).toBe(1);expect(f.game.soloPendingGameplayFrame).toBe(frame);
   await f.game.retrySoloCurrentAsync();f.game.resumeSoloGameplayFrame();
   expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(publications).toBe(1);expect(pitchOutputs).toBe(1);expect(f.game.pitch).toBe(pitch);
   expect(f.player.body).toEqual(body);expect(f.game.soloHumanCallbackInput.input).toBe(captured);expect(input.calls).toBe(reads);expect(physics.calls).toBe(1);expect(actors.calls).toBe(1);expect(scope.calls).toBe(1);
   expect(f.player.loadout.ammo.launcher).toBe(ammo-1);expect([...f.player.projectiles.values()][0]).toBe(projectile);expect(projectile.state.remainingCallbacks).toBe(60);
   const actor=f.player.projectileState.actors[0],mesh=f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle);expect(mesh).toBeInstanceOf(THREE.Mesh);
   f.game.resumeSoloGameplayFrame();expect(actors.calls).toBe(1);expect(scope.calls).toBe(1);expect(pitchOutputs).toBe(1);
   await f.frame(46/30);expect(f.player.callback).toBe(47);expect(publications).toBe(2);expect(physics.calls).toBe(2);expect(actors.calls).toBe(2);expect(scope.calls).toBe(2);
   expect(f.player.loadout.ammo.launcher).toBe(ammo-1);expect(projectile.state.remainingCallbacks).toBe(59);expect(f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle)).toBe(mesh);
  }finally{await f.close();}
 },60000);
 it.each(maps)('%s resumes a committed RPG puff actor tail without repeating its decrement or renderer birth',async map=>{
  const f=await frameFixture(map);try{
   f.game.keys.add('Digit5');for(let callback=0;callback<45;callback++){await f.frame(callback/30);f.game.keys.clear();}
   f.game.firing=true;await f.frame(45/30);f.game.firing=false;
   const projectile=[...f.player.projectiles.values()][0] as any,actor=f.player.projectileState.actors[0],mesh=f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores),actors=count(f.worlds,'actors',f.restores),tail=count(f.game,'finishSoloActors',f.restores),scope=count(f.game,'advanceCommittedSoloGunScope',f.restores),weaponPresentation=count(f.game,'advanceSourceWeaponPresentation',f.restores);
   const receive=f.game.receiveSoloWorldEvent,error=Error('committed RPG puff renderer sink');let fail=true,puffBirths=0,lastPuff:string|undefined;
   replace(f.game,'receiveSoloWorldEvent',function(this:any,event:any){
    // Actual Three adoption precedes the injected sink failure. Count each real
    // actor birth ID once, excluding later CURRENT redispatch of the same puff.
    receive.call(this,event);
    if(event.kind==='transient-state'&&event.recipientId==='player'){
     const prefix=`solo-rpg-puff:${f.player.lifeGeneration}:${f.player.callback}:`;
     const puff=event.checkpoint.actors.find((value:any)=>value.kind==='puff'&&value.id.startsWith(prefix));
     if(puff&&puff.id!==lastPuff){lastPuff=puff.id;puffBirths++;if(fail){fail=false;throw error;}}
    }
   },f.restores);
   const frame=f.launchFrame(46/30),delivery=frame.deliveryWork;await delivery;
   const captured=f.game.soloHumanCallbackInput.input,reads=input.calls;
   expect(()=>f.game.resumeSoloGameplayFrame()).toThrow('Solo committed actor dispatch failed');
   const state=f.player.transientState,body=structuredClone(f.player.body);
   expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(frame.stage).toBe('actor-tail');expect(f.worlds.callbackPhase).toBe('idle');expect(f.player.callback).toBe(47);
   expect(projectile.state.remainingCallbacks).toBe(199);expect(puffBirths).toBe(1);expect(state.actors.filter((value:any)=>value.kind==='puff')).toHaveLength(1);
   expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(state);expect(physics.calls).toBe(1);expect(actors.calls).toBe(1);expect(weaponPresentation.calls).toBe(1);expect(tail.calls).toBe(0);expect(scope.calls).toBe(0);
   f.game.elapsed=47/30;f.game.resumeSoloGameplayFrame();
   expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(f.game.elapsed).toBe(47/30);expect(tail.calls).toBe(1);expect(scope.calls).toBe(1);
   expect(physics.calls).toBe(1);expect(actors.calls).toBe(1);expect(weaponPresentation.calls).toBe(1);expect(input.calls).toBe(reads);
   expect(f.player.body).toEqual(body);expect(f.game.soloHumanCallbackInput.input).toBe(captured);expect(projectile.state.remainingCallbacks).toBe(199);expect(puffBirths).toBe(1);
   expect(f.player.transientState).toBe(state);expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(state);expect(f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle)).toBe(mesh);expect(f.player.loadout.ammo.rpg).toBe(0);
   f.game.resumeSoloGameplayFrame();expect(tail.calls).toBe(1);expect(scope.calls).toBe(1);expect(projectile.state.remainingCallbacks).toBe(199);
   await f.frame(47/30);expect(f.player.callback).toBe(48);expect(projectile.state.remainingCallbacks).toBe(198);expect(puffBirths).toBe(2);expect(physics.calls).toBe(2);expect(actors.calls).toBe(2);expect(scope.calls).toBe(2);
   expect(f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle)).toBe(mesh);expect(f.player.loadout.ammo.rpg).toBe(0);
  }finally{await f.close();}
 },60000);
 it.each(maps)('%s opens Dragunov scope, eases seven real callbacks and closes on the captured Shift release',async map=>{
  const f=await frameFixture(map);try{
   f.game.keys.add('Digit6');await f.frame(0);f.game.keys.clear();
   expect(f.player.loadout.selected).toBe('sniper');expect(f.game.originalScopeActive).toBe(false);expect(f.game.camera.fov).toBe(50);
   const scope=count(f.game,'advanceCommittedSoloGunScope',f.restores),physics=count(f.worlds,'physics',f.restores),actors=count(f.worlds,'actors',f.restores);
   f.game.keys.add('ShiftLeft');await f.frame(1/30);
   expect(f.game.originalScopeState).toEqual({active:true,fov:35,mouseDelta:.5,ptog:'open',zoomonce:0});
   expect(f.game.originalScopeActive).toBe(true);expect(f.game.originalScopeFov).toBe(35);expect(f.game.camera.fov).toBe(35);expect(f.game.viewCamera.fov).toBe(35);
   expect(f.game.camera.projectionMatrix.elements[5]).toBeCloseTo(1/Math.tan(35*Math.PI/360),12);
   expect(f.game.viewCamera.projectionMatrix.elements[5]).toBeCloseTo(1/Math.tan(35*Math.PI/360),12);
   expect(f.game.soloCommittedGunOutput.scopeCreated).toBe(true);expect(f.game.soloCommittedGunOutput.scopeAdvanced).toBe(true);
   // The appended scope starts easing on the callback after creation.
   for(let callback=2;callback<=8;callback++)await f.frame(callback/30);
   expect(f.game.originalScopeState).toMatchObject({active:true,fov:29.75,ptog:'zoomed',zoomonce:0});
   expect(f.game.originalScopeState.mouseDelta).toBeCloseTo(.5*.93**7,14);
   expect(f.game.camera.fov).toBe(29.75);expect(f.game.viewCamera.fov).toBe(29.75);
   expect(f.game.camera.projectionMatrix.elements[5]).toBeCloseTo(1/Math.tan(29.75*Math.PI/360),12);
   f.game.keys.delete('ShiftLeft');await f.frame(9/30);
   expect(f.game.originalScopeState).toMatchObject({active:false,fov:50,mouseDelta:.5,zoomonce:1});
   expect(f.game.originalScopeActive).toBe(false);expect(f.game.originalScopeFov).toBe(50);expect(f.game.camera.fov).toBe(50);expect(f.game.viewCamera.fov).toBe(50);
   expect(f.game.camera.projectionMatrix.elements[5]).toBeCloseTo(1/Math.tan(50*Math.PI/360),12);
   expect(f.player.callback).toBe(10);expect(scope.calls).toBe(9);expect(physics.calls).toBe(9);expect(actors.calls).toBe(9);
   f.game.resumeSoloGameplayFrame();expect(scope.calls).toBe(9);expect(f.game.originalScopeState.fov).toBe(50);
  }finally{await f.close();}
 });
 it.each(maps)('%s keeps captured Dragunov Shift and typing through held IO and explicit retry before the next callback closes scope',async map=>{
  const f=await frameFixture(map);let release!:()=>void;
  try{
   f.game.keys.add('Digit6');await f.frame(0);f.game.keys.clear();
   const factory=f.game.soloCurrentCohortAt,held=new Promise<void>(resolve=>{release=resolve;}),error=Error('held Dragunov pre-CAS failure');let fail=true,publications=0;
   replace(f.game,'soloCurrentCohortAt',()=>{
    const cohort=factory();return {...cohort,begin:async(...args:any[])=>{if(fail){await held;fail=false;throw error;}return cohort.begin(...args);},publish:async()=>{publications++;await cohort.publish();}};
   },f.restores);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores),actors=count(f.worlds,'actors',f.restores),scope=count(f.game,'advanceCommittedSoloGunScope',f.restores);
   let polls=0;const receive=f.game.receiveSoloWorldEvent;
   replace(f.game,'receiveSoloWorldEvent',function(this:any,event:any){if(event.kind==='gun-output'&&event.recipientId==='player'&&event.output.kind==='scope-poll')polls++;return receive.call(this,event);},f.restores);
   f.game.keys.add('ShiftLeft');const frame=f.launchFrame(1/30),delivery=frame.deliveryWork;
   const captured=f.game.soloHumanCallbackInput.input,reads=input.calls,body=structuredClone(f.player.body);
   expect(captured.shiftHeld).toBe(true);expect(captured.held.typing).toBe(false);expect(captured.sourceScopeEnabled).toBe(true);
   expect(f.game.originalScopeActive).toBe(false);expect(f.game.camera.fov).toBe(50);expect(f.game.viewCamera.fov).toBe(50);
   f.game.keys.delete('ShiftLeft');f.game.chatOpen=true;f.game.elapsed=2/30;f.game.advanceGameplayFrame(1/30);
   expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(input.calls).toBe(reads);expect(physics.calls).toBe(1);expect(polls).toBe(0);expect(scope.calls).toBe(0);
   release();await expect(delivery).rejects.toBe(error);
   expect(f.player.callback).toBe(1);expect(publications).toBe(0);expect(f.game.originalScopeActive).toBe(false);
   await f.game.retrySoloCurrentAsync();f.game.resumeSoloGameplayFrame();
   expect(f.player.callback).toBe(2);expect(publications).toBe(1);expect(polls).toBe(1);expect(scope.calls).toBe(1);expect(actors.calls).toBe(1);
   expect(input.calls).toBe(reads);expect(physics.calls).toBe(1);expect(f.player.body).toEqual(body);expect(f.game.soloHumanCallbackInput.input).toBe(captured);
   expect(f.game.chatOpen).toBe(true);expect(f.game.keys.has('ShiftLeft')).toBe(false);
   expect(f.game.originalScopeState).toEqual({active:true,fov:35,mouseDelta:.5,ptog:'open',zoomonce:0});
   expect(f.game.camera.fov).toBe(35);expect(f.game.viewCamera.fov).toBe(35);expect(f.game.originalScopeActive).toBe(true);
   expect(f.game.camera.projectionMatrix.elements[5]).toBeCloseTo(1/Math.tan(35*Math.PI/360),12);
   f.game.resumeSoloGameplayFrame();expect(polls).toBe(1);expect(scope.calls).toBe(1);expect(f.game.originalScopeState.fov).toBe(35);
   await f.frame(2/30);
   expect(f.game.soloHumanCallbackInput.input.held.typing).toBe(true);expect(f.player.callback).toBe(3);expect(publications).toBe(2);expect(polls).toBe(1);
   expect(scope.calls).toBe(2);expect(actors.calls).toBe(2);expect(physics.calls).toBe(2);
   expect(f.game.originalScopeState).toMatchObject({active:false,fov:50,mouseDelta:.5,zoomonce:1});
   expect(f.game.originalScopeActive).toBe(false);expect(f.game.camera.fov).toBe(50);expect(f.game.viewCamera.fov).toBe(50);
  }finally{release?.();await f.close();}
 });
});
