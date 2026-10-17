import {OriginalSoloPickupCohort} from '../src/originalSoloPickupCohort';
import {readFileSync} from 'node:fs';
import {IDBFactory,IDBDatabase} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from './originalSoloObserverWorld';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {ReceiverModelPose} from './originalReceiverModelWorld';
import {openOriginalPickupBatchStore,type PickupBatchManifest} from '../src/originalPickupBatchStore';
import {openOriginalPickupBatchReader} from '../src/originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from '../src/originalPickupBatchModelHistory';

let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??(decoded=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const initial=():PickupBatchManifest=>({version:0,observers:['A','B','C'].map(observer=>({observer,lifeGeneration:1,
 prefix:{kind:'callback',sceneGeneration:1,callback:0},lastReceiptTick:-1,root:{key:`initial-${observer}`,version:0,count:0,pageCount:0,highWaterId:0}}))});

/** Actual CPU producer, model history and durable CAS. This fixture declares
 * skipped physics and empty query geometry; it does not prove Game wiring or
 * native transport/disposal timing. */
async function fixture(name:string,onEvent?:(event:OriginalSoloEvent)=>void){
 const factory=new IDBFactory(),store=await openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()});
 const sources=new Map((await store.readManifest()).observers.map(row=>[row.observer,new OriginalPickupBatchModelHistory({observer:row.observer,lifeGeneration:row.lifeGeneration,root:row.root})]));
 const events:OriginalSoloEvent[]=[],counts={backends:0,releases:0},releases=new Map<string,number>(),failRelease=new Set<string>();
 const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const options=(source:OriginalPickupBatchModelHistory):OriginalSoloCurrentSceneProducerOptions=>({sourceScale:runtime().scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,
  environment:{maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536},
  controller:{model:{eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:50*runtime().scale,maxModels:128,maxPickups:16,lifecycleJournal:{maxEntries:16,maxTextChars:65536}},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},
  createBackends:()=>{counts.backends++;return {pickupHistorySource:source,
   model:{cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:inWorld=>inWorld,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})},
   transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},release:()=>{counts.releases++;}};},
  goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:50*runtime().scale,weapon:c.weapon!}:null,
  snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-producer-inventory'}),
 });
 const worlds=new OriginalSoloObserverWorlds(runtime(),{presentationLifecycle:true,onEvent:event=>{events.push(event);onEvent?.(event);},createReceiverScene:r=>{const lease=createOriginalSoloCurrentSceneLease(options(sources.get(r.id)!));return {...lease,release:()=>{lease.release();releases.set(r.id,(releases.get(r.id)??0)+1);if(failRelease.has(r.id))throw Error('declared lease release failure');}};}});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});const c=worlds.register({id:'C',name:'Charlie',eye:{x:3000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';c.weapon='shotgun';
 const physical=(callback:number)=>{const time=callback/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 let serial=0;
 const cohort=()=>new OriginalSoloPickupCohort({store,sources,key:`dispose-${++serial}`});
 const cycle=async(callback:number)=>{const time=physical(callback);await worlds.completeGoodyAsync(time,cohort());worlds.actors(time);};
 const close=async()=>{await worlds.clearAsync();await store.close();};
 return {store,sources,worlds,a,b,c,physical,cohort,cycle,close,releases,failRelease,events};
}

describe('receipt-only asynchronous Solo disposal with real paged model history',()=>{
 it('holds the dead life, resources and both peer clocks until the delayed actual CAS succeeds',async()=>{
  const f=await fixture('dispose-delayed-CAS'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined;
  try{
   await f.cycle(1);const before=await f.store.readManifest(),states=[f.a.modelState,f.c.modelState],cohort=f.cohort(),publish=cohort.publish.bind(cohort);
   const publication=vi.spyOn(cohort,'publish').mockImplementation(async()=>{entered.resolve();await release.promise;await publish();});
   pending=f.worlds.disposeAsync('B',cohort);await entered.promise;
   expect(await f.store.readManifest()).toEqual(before);expect(f.worlds.worlds.get('B')).toBe(f.b);expect(f.b.alive).toBe(true);
   expect(f.releases.get('B')??0).toBe(0);expect(f.a.receiptTick).toBe(1);expect(f.c.receiptTick).toBe(1);
   expect([f.a.modelState,f.c.modelState]).toEqual(states);expect(f.worlds.currentAwaiting).toBe(true);
   expect(()=>f.worlds.clear()).toThrow();expect(()=>f.worlds.physics(2/30)).toThrow();
   release.resolve();await pending;
   expect(publication).toHaveBeenCalledTimes(1);expect(f.worlds.worlds.has('B')).toBe(false);expect(f.b.alive).toBe(false);expect(f.releases.get('B')).toBe(1);
   for(const peer of [f.a,f.c]){
    expect(peer.callback).toBe(1);expect(peer.receiptTick).toBe(2);
    const row=(await f.store.readManifest()).observers.find(row=>row.observer===peer.id)!;
    expect(row.prefix).toEqual({kind:'receipt',sceneGeneration:1,callback:1,tick:1});expect(row.lastReceiptTick).toBe(1);
    expect(peer.modelState!.pickupHistory!.root).toEqual(row.root);
   }
   expect(f.worlds.currentAwaiting).toBe(false);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });

 it('accepts death receipt zero before any where and then permits the first callback',async()=>{
  const f=await fixture('dispose-first-receipt');
  try{
   await f.worlds.disposeAsync('B',f.cohort());
   for(const peer of [f.a,f.c]){
    expect(peer.callback).toBe(0);expect(peer.receiptTick).toBe(1);
    const row=(await f.store.readManifest()).observers.find(row=>row.observer===peer.id)!;
    expect(row.prefix).toEqual({kind:'receipt',sceneGeneration:1,callback:0,tick:0});expect(row.lastReceiptTick).toBe(0);
    expect(peer.mirror.freeze()).toEqual([]);
   }
   await f.cycle(1);
   for(const peer of [f.a,f.c]){
    expect(peer.callback).toBe(1);expect(peer.receiptTick).toBe(2);
    expect((await f.store.readManifest()).observers.find(row=>row.observer===peer.id)!.lastReceiptTick).toBe(1);
   }
  }finally{await f.close();}
 });

 it('marks death at the receipt and appends the real drop only on the next callback',async()=>{
  const f=await fixture('dispose-next-callback-drop');
  try{
   await f.cycle(1);await f.worlds.disposeAsync('B',f.cohort());
   for(const peer of [f.a,f.c]){
    expect(peer.modelState!.pickupHistory!.root.count).toBe(0);
    expect(peer.mirror.freeze().find(actor=>actor.id==='B')!.alive).toBe(false);
   }
   await f.cycle(2);
   const reader=await openOriginalPickupBatchReader(f.store,'inspect-disposal-drop');
   try{
    for(const peer of [f.a,f.c]){
     expect(peer.mirror.freeze().some(actor=>actor.id==='B')).toBe(false);
     expect(peer.modelState!.pickupHistory!.root).toMatchObject({count:1,pageCount:1,highWaterId:1});
     const window=await reader.loadWindow(peer.id,0,{kind:'callback',sceneGeneration:1,callback:3});
     expect(reader.records(window)[0]).toMatchObject({id:1,weapon:'pistol'});reader.releaseWindow(window);
    }
   }finally{await reader.close();}
  }finally{await f.close();}
 });

 it('rolls back both peer receipts on pre-CAS failure and retries the same dead life',async()=>{
  const f=await fixture('dispose-preCAS-retry');
  try{
   await f.cycle(1);const before=await f.store.readManifest(),states=[f.a.modelState,f.c.modelState],failed=f.cohort();
   vi.spyOn(failed,'publish').mockRejectedValue(Error('declared disposal CAS failure'));
   await expect(f.worlds.disposeAsync('B',failed)).rejects.toThrow('declared disposal CAS failure');
   expect(await f.store.readManifest()).toEqual(before);expect(f.worlds.worlds.get('B')).toBe(f.b);expect(f.b.alive).toBe(true);
   expect(f.releases.get('B')??0).toBe(0);expect([f.a.modelState,f.c.modelState]).toEqual(states);expect(f.a.receiptTick).toBe(1);expect(f.c.receiptTick).toBe(1);
   await f.worlds.disposeAsync('B',f.cohort());
   expect((await f.store.readManifest()).version).toBe(before.version+1);expect(f.releases.get('B')).toBe(1);expect(f.a.receiptTick).toBe(2);expect(f.c.receiptTick).toBe(2);
  }finally{await f.close();}
 });

 it('drains pre-CAS cancellation during private receipt replay and retries unchanged peers',async()=>{
  const f=await fixture('dispose-preCAS-cancel'),entered=deferred(),release=deferred(),controller=new AbortController();let pending:Promise<void>|undefined;
  try{
   await f.cycle(1);const before=await f.store.readManifest(),states=[f.a.modelState,f.c.modelState],cohort=f.cohort(),replay=cohort.replayComplete.bind(cohort);
   vi.spyOn(cohort,'replayComplete').mockImplementation(async(...args)=>{await replay(...args);if(args[0].observer.id==='A'){entered.resolve();await release.promise;}});
   pending=f.worlds.disposeAsync('B',cohort,controller.signal);const rejected=expect(pending).rejects.toThrow('cancel private disposal replay');
   await entered.promise;controller.abort(Error('cancel private disposal replay'));
   expect(f.worlds.currentAwaiting).toBe(true);expect(()=>f.worlds.clear()).toThrow();expect(()=>f.worlds.dispose('B')).toThrow();
   expect(f.worlds.worlds.get('B')).toBe(f.b);expect(f.releases.get('B')??0).toBe(0);
   release.resolve();await rejected;
   expect(await f.store.readManifest()).toEqual(before);expect([f.a.modelState,f.c.modelState]).toEqual(states);
   expect(f.a.receiptTick).toBe(1);expect(f.c.receiptTick).toBe(1);expect(f.worlds.currentAwaiting).toBe(false);
   await f.worlds.disposeAsync('B',f.cohort());expect(f.releases.get('B')).toBe(1);expect(f.a.receiptTick).toBe(2);expect(f.c.receiptTick).toBe(2);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });

 it('rolls back an earlier private peer when the later receipt replay fails',async()=>{
  const f=await fixture('dispose-late-peer-failure');
  try{
   await f.cycle(1);const before=await f.store.readManifest(),states=[f.a.modelState,f.c.modelState],cohort=f.cohort(),replay=cohort.replayComplete.bind(cohort),seen:string[]=[];
   vi.spyOn(cohort,'replayComplete').mockImplementation(async(...args)=>{await replay(...args);seen.push(args[0].observer.id);if(args[0].observer.id==='C')throw Error('declared later disposal peer failure');});
   await expect(f.worlds.disposeAsync('B',cohort)).rejects.toThrow('declared later disposal peer failure');
   expect(seen).toEqual(['A','C']);expect(await f.store.readManifest()).toEqual(before);expect([f.a.modelState,f.c.modelState]).toEqual(states);
   expect(f.worlds.worlds.get('B')).toBe(f.b);expect(f.b.alive).toBe(true);expect(f.releases.get('B')??0).toBe(0);
   for(const peer of [f.a,f.c]){expect(peer.receiptTick).toBe(1);expect(peer.mirror.freeze().find(actor=>actor.id==='B')!.alive).toBe(true);}
   await f.worlds.disposeAsync('B',f.cohort());expect((await f.store.readManifest()).version).toBe(before.version+1);
   expect(f.a.receiptTick).toBe(2);expect(f.c.receiptTick).toBe(2);expect(f.releases.get('B')).toBe(1);
  }finally{await f.close();}
 });

 it('adopts the completed CAS and disposes even when cancellation arrives before publication returns',async()=>{
  const f=await fixture('dispose-postCAS-cancel'),entered=deferred(),release=deferred(),cancel=new AbortController();let pending:Promise<void>|undefined;
  try{
   await f.cycle(1);const before=await f.store.readManifest(),cohort=f.cohort(),publish=cohort.publish.bind(cohort);
   const publication=vi.spyOn(cohort,'publish').mockImplementation(async()=>{await publish();entered.resolve();await release.promise;});
   pending=f.worlds.disposeAsync('B',cohort,cancel.signal);await entered.promise;
   expect((await f.store.readManifest()).version).toBe(before.version+1);expect(f.worlds.worlds.get('B')).toBe(f.b);expect(f.a.receiptTick).toBe(1);
   cancel.abort(Error('late cancellation loses rollback authority'));release.resolve();await pending;
   expect(publication).toHaveBeenCalledTimes(1);expect(f.worlds.worlds.has('B')).toBe(false);expect(f.releases.get('B')).toBe(1);
   expect(f.a.receiptTick).toBe(2);expect(f.c.receiptTick).toBe(2);expect(f.worlds.currentAwaiting).toBe(false);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });

 it('clearAsync cancels a pre-CAS disposal and releases lives only after private replay drains',async()=>{
  const f=await fixture('clear-preCAS-disposal'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined,clearing:Promise<void>|undefined;
  try{
   await f.cycle(1);const before=await f.store.readManifest(),cohort=f.cohort(),replay=cohort.replayComplete.bind(cohort);
   vi.spyOn(cohort,'replayComplete').mockImplementation(async(...args)=>{await replay(...args);if(args[0].observer.id==='A'){entered.resolve();await release.promise;}});
   pending=f.worlds.disposeAsync('B',cohort);const canceled=expect(pending).rejects.toThrow('clear suspended disposal');await entered.promise;
   clearing=f.worlds.clearAsync(Error('clear suspended disposal'));
   expect(f.worlds.worlds.size).toBe(3);expect([...f.releases.values()]).toEqual([]);expect(()=>f.worlds.register({id:'D',name:'Delta',eye:{x:4000,y:1000,z:1000}})).toThrow();
   release.resolve();await canceled;await clearing;
   expect(await f.store.readManifest()).toEqual(before);expect(f.worlds.worlds.size).toBe(0);expect(f.worlds.currentAwaiting).toBe(false);
   for(const id of ['A','B','C'])expect(f.releases.get(id)).toBe(1);
   expect(f.a.receiptTick).toBe(1);expect(f.c.receiptTick).toBe(1);
  }finally{release.resolve();await pending?.catch(()=>{});await clearing?.catch(()=>{});await f.close();}
 });

 it('clearAsync waits for completed CAS adoption before releasing all scene lives',async()=>{
  const f=await fixture('clear-postCAS-disposal'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined,clearing:Promise<void>|undefined;
  try{
   await f.cycle(1);const before=await f.store.readManifest(),cohort=f.cohort(),publish=cohort.publish.bind(cohort);
   const publication=vi.spyOn(cohort,'publish').mockImplementation(async()=>{await publish();entered.resolve();await release.promise;});
   pending=f.worlds.disposeAsync('B',cohort);await entered.promise;clearing=f.worlds.clearAsync(Error('clear after irreversible CAS'));
   expect((await f.store.readManifest()).version).toBe(before.version+1);expect(f.a.receiptTick).toBe(1);expect([...f.releases.values()]).toEqual([]);
   expect(f.worlds.worlds.get('B')).toBe(f.b);release.resolve();await pending;await clearing;
   expect(publication).toHaveBeenCalledTimes(1);expect(f.a.receiptTick).toBe(2);expect(f.c.receiptTick).toBe(2);
   for(const peer of [f.a,f.c])expect(peer.modelState!.pickupHistory!.root).toEqual((await f.store.readManifest()).observers.find(row=>row.observer===peer.id)!.root);
   expect(f.worlds.worlds.size).toBe(0);for(const id of ['A','B','C'])expect(f.releases.get(id)).toBe(1);
   expect(f.worlds.currentAwaiting).toBe(false);
  }finally{release.resolve();await pending?.catch(()=>{});await clearing?.catch(()=>{});await f.close();}
 });

 it('cancelAndDrainCurrent cancels a living callback and allows its exact captured retry',async()=>{
  const f=await fixture('drain-living-callback'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined,draining:Promise<void>|undefined;
  try{
   const before=await f.store.readManifest(),time=f.physical(1),cohort=f.cohort(),replay=cohort.replayComplete.bind(cohort);
   vi.spyOn(cohort,'replayComplete').mockImplementation(async(...args)=>{await replay(...args);if(args[0].observer.id==='A'){entered.resolve();await release.promise;}});
   pending=f.worlds.completeGoodyAsync(time,cohort);const canceled=expect(pending).rejects.toThrow('cancel captured living callback');await entered.promise;
   draining=f.worlds.cancelAndDrainCurrent(Error('cancel captured living callback'));
   expect(()=>f.worlds.physics(2/30)).toThrow();expect(()=>f.worlds.clear()).toThrow();expect(f.worlds.worlds.size).toBe(3);
   release.resolve();await canceled;await draining;
   expect(await f.store.readManifest()).toEqual(before);expect(f.worlds.currentAwaiting).toBe(false);expect([...f.releases.values()]).toEqual([]);
   for(const peer of [f.a,f.b,f.c]){expect(peer.callback).toBe(0);expect(peer.receiptTick).toBe(0);}
   await f.worlds.completeGoodyAsync(time,f.cohort());f.worlds.actors(time);
   expect((await f.store.readManifest()).version).toBe(1);for(const peer of [f.a,f.b,f.c])expect(peer.callback).toBe(1);
  }finally{release.resolve();await pending?.catch(()=>{});await draining?.catch(()=>{});await f.close();}
 });

 it('retries cancelAndDrainCurrent after failed reader lease cleanup without releasing live scenes',async()=>{
  const f=await fixture('drain-retry-reader-cleanup'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined,draining:Promise<void>|undefined;
  try{
   const before=await f.store.readManifest(),time=f.physical(1),cohort=f.cohort(),replay=cohort.replayComplete.bind(cohort),unpin=f.store.unpin.bind(f.store);let attempts=0;
   vi.spyOn(f.store,'unpin').mockImplementation(async id=>{if(id==='dispose-1-reader'&&++attempts===1)throw Error('declared failed drain lease cleanup');await unpin(id);});
   vi.spyOn(cohort,'replayComplete').mockImplementation(async(...args)=>{await replay(...args);if(args[0].observer.id==='A'){entered.resolve();await release.promise;}});
   pending=f.worlds.completeGoodyAsync(time,cohort);const canceled=expect(pending).rejects.toThrow();await entered.promise;
   draining=f.worlds.cancelAndDrainCurrent(Error('cancel before cleanup fault'));const drainFailure=expect(draining).rejects.toThrow();release.resolve();await canceled;await drainFailure;
   expect(attempts).toBe(1);expect(await f.store.readManifest()).toEqual(before);expect(f.worlds.worlds.size).toBe(3);expect([...f.releases.values()]).toEqual([]);
   await f.worlds.cancelAndDrainCurrent();expect(attempts).toBe(2);
   await f.worlds.completeGoodyAsync(time,f.cohort());f.worlds.actors(time);expect((await f.store.readManifest()).version).toBe(1);
   expect([...f.releases.values()]).toEqual([]);
  }finally{release.resolve();await pending?.catch(()=>{});await draining?.catch(()=>{});await f.close();}
 });

 it.each([1,2] as const)('retries cleanup after actual finish pin transaction %s aborts without republishing',async abortedAttempt=>{
  const f=await fixture(`dispose-real-pin-abort-${abortedAttempt}`);let interception:{mockRestore():void}|undefined;
  try{
   await f.cycle(1);const before=await f.store.readManifest(),cohort=f.cohort(),publication=vi.spyOn(cohort,'publish');
   const transaction=IDBDatabase.prototype.transaction;let pinTransactions=0,aborts=0;
   interception=vi.spyOn(IDBDatabase.prototype,'transaction').mockImplementation(function(this:IDBDatabase,storeNames,mode,options){
    const tx=transaction.call(this,storeNames,mode,options),names=typeof storeNames==='string'?[storeNames]:Array.from(storeNames);
    if(mode==='readwrite'&&names.length===1&&names[0]==='pins'){
     pinTransactions++;
     if(pinTransactions===abortedAttempt)queueMicrotask(()=>{aborts++;tx.abort();});
    }
    return tx;
   });
   await expect(f.worlds.disposeAsync('B',cohort)).rejects.toThrow();
   // Both independent finish leases were attempted despite one genuine IDB
   // transaction abort. Durable observer/model adoption cannot be rolled back.
   expect(aborts).toBe(1);expect(pinTransactions).toBe(2);expect(publication).toHaveBeenCalledTimes(1);
   expect((await f.store.readManifest()).version).toBe(before.version+1);expect(f.worlds.worlds.has('B')).toBe(false);expect(f.releases.get('B')??0).toBe(0);
   expect(f.a.receiptTick).toBe(2);expect(f.c.receiptTick).toBe(2);expect(f.worlds.currentAwaiting).toBe(true);
   const events=f.events.length;
   await cohort.finish();await f.worlds.cancelAndDrainCurrent();expect(f.worlds.currentAwaiting).toBe(false);expect(pinTransactions).toBe(3);expect(publication).toHaveBeenCalledTimes(1);
   expect(f.events).toHaveLength(events);expect(f.releases.get('B')).toBe(1);
   expect((await f.store.readManifest()).version).toBe(before.version+1);
   await cohort.finish();expect(pinTransactions).toBe(3);expect(f.events).toHaveLength(events);
  }finally{interception?.mockRestore();await f.close();}
 });

 it.each(['dispatch','release'] as const)('never republishes a completed disposal after %s failure',async kind=>{
  let failDispatch=false;
  const f=await fixture(`dispose-committed-${kind}`,event=>{if(failDispatch&&event.kind==='model-state')throw Error('declared committed dispatch failure');});
  try{
   await f.cycle(1);if(kind==='dispatch')failDispatch=true;else f.failRelease.add('B');
   const cohort=f.cohort(),publication=vi.spyOn(cohort,'publish'),finish=vi.spyOn(cohort,'finish'),before=await f.store.readManifest();
   await expect(f.worlds.disposeAsync('B',cohort)).rejects.toThrow();
   failDispatch=false;f.failRelease.clear();
   expect((await f.store.readManifest()).version).toBe(before.version+1);expect(f.worlds.worlds.has('B')).toBe(false);
   expect(f.a.receiptTick).toBe(2);expect(f.c.receiptTick).toBe(2);expect(f.releases.get('B')).toBe(1);expect(publication).toHaveBeenCalledTimes(1);
   const events=f.events.length;
   if(kind==='release'){
    expect(f.worlds.currentAwaiting).toBe(true);
    await expect(f.worlds.disposeAsync('B',cohort)).rejects.toThrow(/cleanup requires draining/);
    await f.worlds.cancelAndDrainCurrent();expect(finish).toHaveBeenCalledTimes(2);expect(f.worlds.currentAwaiting).toBe(false);
   }
   await f.worlds.disposeAsync('B',cohort);expect(publication).toHaveBeenCalledTimes(1);expect(f.releases.get('B')).toBe(1);expect(f.events).toHaveLength(events);
   expect((await f.store.readManifest()).version).toBe(before.version+1);
  }finally{failDispatch=false;f.failRelease.clear();await f.close();}
 });
});
