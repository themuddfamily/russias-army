import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {startup} from './originalSoloDefaultStartup.fixture';
import {SoldierMaterialLibrary} from './soldierMaterials';

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

// Actual normal paged CPU Game method path; no native renderer/audio timing claim.
const modes=['before-once','before-twice','after-durable','before-and-reader-twice'] as const;
describe('normal paged Game committed pickup claim recovery',()=>{
 it.each(maps.flatMap(map=>modes.map(mode=>[map,mode] as const)))('%s restores a lethal drop after %s without replaying the captured frame',async(map,mode)=>{
  const f=await frameFixture(map);try{
   await f.frame(0);
   replace(f.game,'localCallsign','CPU Human',f.restores);replace(f.game,'addKillFeed',()=>{},f.restores);
   const deaths=count(f.worlds,'damage',f.restores);
   expect(f.worlds.damage(f.enemy.id,1000,f.game.elapsed,{ownerId:'player',ownerName:'CPU attacker'}).dead).toBe(true);
   await f.worlds.cancelAndDrainCurrent();expect(f.worlds.worlds.has(f.enemy.id)).toBe(false);
   const owner=f.game.soloPickupOwner,store=f.game.soloPickupStore,claim=store.claimOutputChunk,unpin=store.unpin;
   const claimError=Error(`committed human drop claim ${mode}`),readerError=Error('committed drop reader cleanup');
   let failures=mode==='before-twice'?2:1,readerFailures=mode==='before-and-reader-twice'?2:0;
   let claimFailures=0,detaches=0,publications=0,targetCommittedClaims=0,failedReader:string|undefined,readerRejects=0;
   let failReconciliation=false,reconciliationFailures=0;
   if(mode==='after-durable'){
    const cursor=store.readOutputClaimCursor;
    replace(store,'readOutputClaimCursor',async function(this:any,...args:any[]){
     if(failReconciliation){failReconciliation=false;reconciliationFailures++;throw Error('durable claim reconciliation temporarily unavailable');}
     return cursor.apply(this,args);
    },f.restores);
   }
   replace(store,'claimOutputChunk',async function(this:any,...args:any[]){
    const target=args[1]==='player'&&args[2]==='models'&&args[3]===1;
    if(target&&failures>0){
     failures--;claimFailures++;
     if(mode==='after-durable'){await claim.apply(this,args);targetCommittedClaims++;failReconciliation=true;}
     throw claimError;
    }
    const chunk=await claim.apply(this,args);if(target)targetCommittedClaims++;return chunk;
   },f.restores);
   replace(store,'unpin',async function(this:any,lease:string){
    if(readerFailures>0&&lease.endsWith('-reader')){
     failedReader??=lease;expect(lease).toBe(failedReader);readerFailures--;readerRejects++;throw readerError;
    }
    return unpin.call(this,lease);
   },f.restores);
   const factory=f.game.soloCurrentCohortAt;
   replace(f.game,'soloCurrentCohortAt',()=>{const cohort=factory();return {...cohort,publish:async()=>{publications++;await cohort.publish();}};},f.restores);
   const receive=f.game.receiveSoloWorldEvent;
   replace(f.game,'receiveSoloWorldEvent',function(this:any,event:any){
    const result=receive.call(this,event);
    if(event.kind==='model-transitions'&&event.recipientId==='player')detaches+=event.transitions.filter((row:any)=>row.kind==='detach').length;
    return result;
   },f.restores);
   const physics=count(f.worlds,'physics',f.restores),input=count(f.game,'readSoloHumanCallbackInput',f.restores);
   const current=count(f.worlds,'completeGoodyAsync',f.restores),actors=count(f.worlds,'actors',f.restores),scope=count(f.game,'advanceCommittedSoloGunScope',f.restores);
   f.game.originalMouseDelta={x:4,y:2};
   const frame=f.launchFrame(1/30);await expect(frame.deliveryWork).rejects.toThrow();
   expect(claimFailures).toBe(1);if(mode==='after-durable')expect(reconciliationFailures).toBe(1);expect(f.player.callback).toBe(2);expect(f.player.modelState.pickupHistory.root.count).toBe(1);
   expect(detaches).toBe(0);expect(owner.awaiting).toBe(true);expect(f.worlds.currentAwaiting).toBe(true);
   const captured=f.game.soloHumanCallbackInput.input,reads=input.calls,body=structuredClone(f.player.body);
   const model=f.player.modelState,receipt=f.player.receiptTick;
   const held=()=>{
    expect(f.game.soloPendingGameplayFrame).toBe(frame);expect(f.player.callback).toBe(2);expect(f.player.receiptTick).toBe(receipt);
    expect(f.player.modelState).toBe(model);expect(f.player.body).toEqual(body);expect(f.game.soloHumanCallbackInput.input).toBe(captured);
    expect(physics.calls).toBe(1);expect(input.calls).toBe(reads);expect(current.calls).toBe(1);expect(publications).toBe(1);expect(deaths.calls).toBe(1);
    expect(actors.calls).toBe(0);expect(scope.calls).toBe(0);
   };
   f.game.originalMouseDelta={x:8,y:6};f.game.keys.add('Digit1');f.game.elapsed=2/30;f.game.advanceGameplayFrame(1/30);held();
   if(mode==='before-twice'){
    await expect(f.game.retrySoloCurrentAsync()).rejects.toThrow();held();expect(claimFailures).toBe(2);expect(detaches).toBe(0);expect(owner.awaiting).toBe(true);
    f.game.resumeSoloGameplayFrame();held();
   }
   if(mode==='before-and-reader-twice'){
    await expect(f.game.retrySoloCurrentAsync()).rejects.toThrow();held();expect(detaches).toBe(1);expect(readerRejects).toBe(1);expect(owner.awaiting).toBe(true);
    await expect(f.game.retrySoloCurrentAsync()).rejects.toThrow();held();expect(detaches).toBe(1);expect(readerRejects).toBe(2);expect(owner.awaiting).toBe(true);
   }
   await f.game.retrySoloCurrentAsync();held();
   expect(detaches,'Recovery delivers the authentic previously unread detach once').toBe(1);expect(targetCommittedClaims).toBe(1);
   expect(owner.awaiting).toBe(false);expect(f.worlds.currentAwaiting).toBe(false);expect(f.game.soloCurrentError).toBeUndefined();
   expect(f.game.originalMouseDelta).toEqual({x:8,y:6});
   f.game.resumeSoloGameplayFrame();expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(actors.calls).toBe(1);expect(scope.calls).toBe(1);
   f.game.resumeSoloGameplayFrame();expect(actors.calls).toBe(1);expect(scope.calls).toBe(1);
   await f.frame(2/30);expect(detaches).toBe(1);expect(f.player.callback).toBe(3);
   expect(physics.calls).toBe(2);expect(current.calls).toBe(2);expect(publications).toBe(2);expect(deaths.calls).toBe(1);
   expect(actors.calls).toBe(2);expect(scope.calls).toBe(2);
  }finally{await f.close();}
 });
 it.each(maps)('%s retries async terminal RPG puff cleanup after a renderer removal listener error without disposing twice',async map=>{
  const f=await frameFixture(map);try{
   f.game.keys.add('Digit5');
   for(let callback=0;callback<45;callback++){await f.frame(callback/30);f.game.keys.clear();}
   f.game.firing=true;await f.frame(45/30);f.game.firing=false;await f.frame(46/30);
   const transients=f.game.soloReceiverTransients,presentation=transients.presentation,state=presentation.freeze();
   const puff=state.actors.find((actor:any)=>actor.kind==='puff');expect(puff).toBeDefined();
   const mesh=presentation.readModel(puff.handle) as THREE.Mesh;expect(mesh).toBeInstanceOf(THREE.Mesh);expect(mesh.parent).toBe(f.scene);
   const material=mesh.material as THREE.MeshBasicMaterial,texture=material.map!;expect(texture).toBeInstanceOf(THREE.Texture);
   const ownedMaterial=count(material,'dispose',f.restores),ownedTexture=count(texture,'dispose',f.restores);
   const borrowedGeometry=count(mesh.geometry,'dispose',f.restores);
   const rocketGeometry=f.collection.resources.get('rpgrocket')!.geometry,borrowedRocket=count(rocketGeometry,'dispose',f.restores);
   const store=f.game.soloPickupStore,database=f.game.soloPickupDatabase,owner=f.game.soloPickupOwner;
   const storageClose=count(store,'close',f.restores),transientDisposal=count(presentation,'dispose',f.restores);
   const worlds=f.worlds;let removals=0;const removalError=Error('terminal RPG puff removed listener');
   mesh.addEventListener('removed',()=>{removals++;if(removals===1)throw removalError;});
   await expect(f.game.disposeSoloWorldsAsync(false)).rejects.toThrow('Solo presentation teardown failed');
   expect(removals).toBe(1);expect(mesh.parent).toBeNull();expect(presentation.isDisposed).toBe(true);expect(presentation.freeze()).toBeUndefined();
   expect(ownedMaterial.calls).toBe(1);expect(ownedTexture.calls).toBe(1);expect(transientDisposal.calls).toBe(1);
   expect(borrowedGeometry.calls).toBe(0);expect(borrowedRocket.calls).toBe(0);expect(storageClose.calls).toBe(0);
   expect(worlds.worlds.size).toBe(0);expect(f.game.soloWorlds).toBeUndefined();expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(f.game.soloHumanCallbackInput).toBeUndefined();
   expect(f.game.soloReceiverTransients).toBeUndefined();expect(f.game.soloReceiverModels).toBeUndefined();expect(f.game.soloStartupResources).toBeUndefined();expect(f.game.soloLoadedSceneFactory).toBeUndefined();
   expect(f.game.soloTeardown).toBeDefined();expect(f.game.soloPickupStore).toBe(store);expect(f.game.soloPickupOwner).toBe(owner);expect(f.game.soloPickupDatabase).toBe(database);
   expect(f.game.soloCleanupError).toBeDefined();expect(f.game.soloPickupCancelling).toBe(true);
   await f.game.disposeSoloWorldsAsync(false);
   expect(storageClose.calls).toBe(1);expect(removals).toBe(1);expect(transientDisposal.calls).toBe(1);expect(ownedMaterial.calls).toBe(1);expect(ownedTexture.calls).toBe(1);
   expect(borrowedGeometry.calls).toBe(0);expect(borrowedRocket.calls).toBe(0);expect(rocketGeometry.getAttribute('position').count).toBeGreaterThan(0);
   expect(f.game.soloTeardown).toBeUndefined();expect(f.game.soloPickupStore).toBeUndefined();expect(f.game.soloPickupOwner).toBeUndefined();expect(f.game.soloPickupDatabase).toBeUndefined();
   expect(f.game.soloPickupClosing).toBeUndefined();expect(f.game.soloPickupCancelling).toBe(false);expect(f.game.soloCleanupError).toBeUndefined();
   expect(database.factory._databases.has(database.name)).toBe(false);
  }finally{await f.close();}
 },60000);

});
