import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloCurrentCohort,type OriginalSoloCurrentCohortPlan,type OriginalSoloEvent} from './originalSoloObserverWorld';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {ReceiverModelPose,ReceiverSceneTransaction} from './originalReceiverModelWorld';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchWriter,type PickupBatchPrepared} from '../src/originalPickupBatchStore';
import {openOriginalPickupBatchReader,type OriginalPickupBatchReader} from '../src/originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory,type OriginalPickupBatchModelStage} from '../src/originalPickupBatchModelHistory';

let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??(decoded=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const initial=():PickupBatchManifest=>({version:0,observers:['A','B'].map(observer=>({observer,lifeGeneration:1,
 prefix:{kind:'callback',sceneGeneration:1,callback:0},lastReceiptTick:-1,root:{key:`initial-${observer}`,version:0,count:0,pageCount:0,highWaterId:0}}))});

/** Actual durable shared-manifest CAS and actual per-life ModelWorld sources.
 * Empty history deliberately isolates the asynchronous cohort boundary; this
 * does not prove paged collection, Game wiring or native suspension timing. */
async function fixture(name:string,onEvent?:(event:OriginalSoloEvent)=>void){
 const factory=new IDBFactory(),store=await openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()});
 const sources=new Map((await store.readManifest()).observers.map(row=>[row.observer,new OriginalPickupBatchModelHistory({observer:row.observer,lifeGeneration:row.lifeGeneration,root:row.root})]));
 const events:OriginalSoloEvent[]=[],counts={backends:0,releases:0};
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
 const worlds=new OriginalSoloObserverWorlds(runtime(),{presentationLifecycle:true,onEvent:event=>{events.push(event);onEvent?.(event);},createReceiverScene:r=>createOriginalSoloCurrentSceneLease(options(sources.get(r.id)!))});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(callback:number)=>{const time=callback/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 let serial=0;
 const cohort=(hooks:{begin?:()=>Promise<void>;replayComplete?:(plan:OriginalSoloCurrentCohortPlan)=>Promise<void>;beforeCAS?:()=>Promise<void>;afterCAS?:()=>Promise<void>}={})=>{
  const id=++serial,stats={begin:0,replayed:[] as string[],seal:0,publish:0,abort:0,finish:0};
  let reader:OriginalPickupBatchReader|undefined,writer:PickupBatchWriter|undefined,prepared:PickupBatchPrepared|undefined,next:PickupBatchManifest|undefined,published=false,publicationAttempted=false,aborted=false;
  const stages=new Map<string,OriginalPickupBatchModelStage>();
  const countsByObserver=new Map<string,{count:number;pageCount:number;highWaterId:number}>();
  let beginWork:Promise<void>|undefined,abortWork:Promise<void>|undefined;
  const value:OriginalSoloCurrentCohort={
   begin:(plans,signal)=>{
    const check=()=>{if(aborted||signal.aborted)throw signal.reason??Error('Fixture cohort begin cancelled');};
    const work=(async()=>{
    stats.begin++;check();await hooks.begin?.();check();reader=await openOriginalPickupBatchReader(store,`read-${id}`);check();
    // The issued plan names the actual received packet at the old callback.
    // Persist that watermark with its subsequent callback in one shared CAS.
    const planned=plans.map(plan=>{const old=reader!.manifest.observers.find(row=>row.observer===plan.observer.id)!;return {...old,prefix:plan.prefix,lastReceiptTick:plan.receiptTick,receiptPrefix:plan.receiptPrefix,root:{key:`next-${id}-${old.observer}`,version:old.root.version+1}};});
    writer=await store.beginBatch(reader.manifest,planned);check();
    next={version:reader.manifest.version+1,observers:planned.map(row=>({...row,root:{...row.root,count:0,pageCount:0,highWaterId:0}}))};
    for(const plan of plans)stages.set(plan.observer.id,sources.get(plan.observer.id)!.stage(reader,writer,plan.prefix));
    })();beginWork=work;return work;
   },
   replayComplete:async(plan,_scene:ReceiverSceneTransaction)=>{
    stats.replayed.push(plan.observer.id);const stage=stages.get(plan.observer.id)!;
    // This fixture starts empty. A single replay-tail death append is allowed
    // so the same durable boundary can also prove actual ModelWorld drops.
    expect(stage.baseHistory.root.count).toBe(0);
    const edits=stage.drainEdits();expect(edits.every(edit=>edit.kind==='append')).toBe(true);expect(edits.length).toBeLessThanOrEqual(16);
    if(edits.length)await writer!.writePage({observer:plan.observer.id,page:0,records:edits.map(edit=>edit.pickup)});
    countsByObserver.set(plan.observer.id,{count:edits.length,pageCount:edits.length?1:0,highWaterId:edits.at(-1)?.pickup.id??stage.baseHistory.root.highWaterId});
    await hooks.replayComplete?.(plan);
   },
   seal:async()=>{stats.seal++;next={...next!,observers:next!.observers.map(row=>({...row,root:{...row.root,...countsByObserver.get(row.observer)!}}))};
    prepared=await writer!.seal(next);for(const stage of stages.values())stage.seal(prepared);},
   publish:async()=>{stats.publish++;await hooks.beforeCAS?.();publicationAttempted=true;await prepared!.publishAndPin(`published-${id}`);published=true;await hooks.afterCAS?.();},
   abort:()=>{if(abortWork)return abortWork;if(published)return Promise.resolve();aborted=true;stats.abort++;
    const work=(async()=>{try{await beginWork;}catch{/* Cancellation drains begin before inspecting resources. */}
    for(const stage of stages.values())stage.rollback();
    // publishAndPin consumes its capability and drains failed-CAS cleanup.
    // Calling that consumed handle's abort would itself fail authentication.
    if(!publicationAttempted){if(prepared)await prepared.abort();else if(writer)await writer.abort();}await reader?.close();})();abortWork=work;return work;},
   finish:async()=>{stats.finish++;await reader?.close();if(published)await store.unpin(`published-${id}`);},
  };
  return {value,stats};
 };
 const close=async()=>{worlds.clear();await store.close();};
 return {store,factory,databaseName:name,sources,worlds,a,b,events,counts,physical,cohort,close};
}

describe('actual Solo asynchronous cohort with real empty paged history and durable shared CAS',()=>{
 it('prepares both observers against one root and adopts both only after the actual CAS',async()=>{
  const f=await fixture('solo-async-two-observers'),atCAS=deferred(),release=deferred();
  try{
   const c=f.cohort({afterCAS:async()=>{atCAS.resolve();await release.promise;}}),pending=f.worlds.completeGoodyAsync(f.physical(1),c.value);
   await atCAS.promise;
   expect((await f.store.readManifest()).version).toBe(1);
   for(const world of [f.a,f.b]){expect(world.callback).toBe(0);expect(world.receiptTick).toBe(0);expect(world.modelState).toBeUndefined();expect(f.sources.get(world.id)!.history.root.version).toBe(0);expect(world.mirror.freeze()).toEqual([]);}
   expect(f.events).toEqual([]);release.resolve();await pending;
   expect(c.stats).toEqual({begin:1,replayed:['A','B'],seal:1,publish:1,abort:0,finish:1});
   for(const world of [f.a,f.b]){expect(world.callback).toBe(1);expect(world.receiptTick).toBe(1);expect(world.modelState!.pickupHistory).toEqual(f.sources.get(world.id)!.history);expect(world.modelState!.pickupHistory!.root).toMatchObject({count:0,pageCount:0,version:1});expect((await f.store.readManifest()).observers.find(row=>row.observer===world.id)!.lastReceiptTick).toBe(world.receiptTick-1);}
   expect(f.worlds.callbackPhase).toBe('goody');expect(f.counts.backends).toBe(2);
  }finally{release.resolve();await f.close();}
 });

 it('persists each actual issued receipt with three successive callbacks on both observers',async()=>{
  const f=await fixture('solo-async-exact-clocks');try{
   for(let callback=1;callback<=3;callback++){
    await f.worlds.completeGoodyAsync(f.physical(callback),f.cohort().value);
    const manifest=await f.store.readManifest();
    for(const world of [f.a,f.b]){
     const stored=manifest.observers.find(row=>row.observer===world.id)!;
     expect(world.callback).toBe(callback);expect(world.receiptTick).toBe(callback);
     expect(stored.prefix.callback).toBe(callback);expect(stored.lastReceiptTick).toBe(callback-1);
     expect(world.mirror.recordSent({tick:stored.lastReceiptTick,sentAt:callback*1000/30,targets:[]})).toEqual({ok:false,reason:'invalid_sent_order'});
     expect(world.modelState!.prefix).toEqual(stored.prefix);expect(world.modelState!.pickupHistory!.root).toEqual(stored.root);
    }
    f.worlds.actors(callback/30);
   }
  }finally{await f.close();}
 });

 it('rolls back an earlier observer when a later replay fails and retries the captured life',async()=>{
  const f=await fixture('solo-async-late-peer');
  try{
   const time=f.physical(1),before=await f.store.readManifest(),c=f.cohort({replayComplete:async plan=>{if(plan.observer.id==='B')throw Error('late actual-history peer');}});
   await expect(f.worlds.completeGoodyAsync(time,c.value)).rejects.toThrow('late actual-history peer');
   expect(await f.store.readManifest()).toEqual(before);expect(c.stats.publish).toBe(0);expect(c.stats.abort).toBe(1);
   for(const world of [f.a,f.b]){expect(world.callback).toBe(0);expect(world.receiptTick).toBe(0);expect(world.modelState).toBeUndefined();expect(f.sources.get(world.id)!.history.root.version).toBe(0);}
   const retry=f.cohort();await f.worlds.completeGoodyAsync(time,retry.value);expect(retry.stats.publish).toBe(1);expect(f.counts.backends).toBe(2);
   expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);
  }finally{await f.close();}
 });

 it('rejects an actual foreign-writer CAS without adopting either prepared observer',async()=>{
  const f=await fixture('solo-async-foreign-cas'),foreign=await openOriginalPickupBatchStore({databaseName:f.databaseName,factory:f.factory,initial:initial()});
  let winning:PickupBatchManifest|undefined;
  try{
   const before=await f.store.readManifest(),roots=new Map([...f.sources].map(([id,source])=>[id,source.history]));
   const c=f.cohort({beforeCAS:async()=>{
    const plans=before.observers.map(row=>({...row,prefix:{kind:'callback' as const,sceneGeneration:1,callback:1},lastReceiptTick:0,receiptPrefix:{kind:'receipt' as const,sceneGeneration:1,callback:0,tick:0},root:{key:`foreign-${row.observer}`,version:1}}));
    const writer=await foreign.beginBatch(before,plans);
    winning={version:before.version+1,observers:plans.map(row=>({...row,root:{...row.root,count:0,pageCount:0,highWaterId:0}}))};
    const ready=await writer.seal(winning);winning=await ready.publishAndPin('foreign-publication');await foreign.unpin('foreign-publication');
   }});
   await expect(f.worlds.completeGoodyAsync(f.physical(1),c.value)).rejects.toThrow('Stale pickup batch publication');
   expect(await f.store.readManifest()).toEqual(winning);expect(c.stats).toMatchObject({seal:1,publish:1,abort:1});
   for(const world of [f.a,f.b]){expect(world.callback).toBe(0);expect(world.receiptTick).toBe(0);expect(world.modelState).toBeUndefined();expect(world.mirror.freeze()).toEqual([]);expect(f.sources.get(world.id)!.history).toEqual(roots.get(world.id));}
   expect(f.events).toEqual([]);expect(f.worlds.currentAwaiting).toBe(false);expect(f.worlds.callbackPhase).toBe('physics');
   await c.value.abort();expect(c.stats.abort).toBe(1);
   // Sources admit metadata transactions again only after all staged private
   // banks have been discarded. Foreign CURRENT remains authoritative.
   for(const source of f.sources.values()){const tx=source.begin(true);expect(tx.baseHistory).toEqual(roots.get(source.history.observer));tx.rollback();}
  }finally{await foreign.close();await f.close();}
 });

 it('finishes assignment adoption when cancellation arrives after the durable CAS',async()=>{
  const f=await fixture('solo-async-cancel-after-cas'),atCAS=deferred(),release=deferred(),abort=new AbortController();
  try{
   const c=f.cohort({afterCAS:async()=>{atCAS.resolve();await release.promise;}}),pending=f.worlds.completeGoodyAsync(f.physical(1),c.value,abort.signal);
   await atCAS.promise;abort.abort(Error('cancelled after durable publication'));release.resolve();await pending;
   expect((await f.store.readManifest()).version).toBe(1);expect(c.stats.abort).toBe(0);expect(c.stats.finish).toBe(1);
   for(const world of [f.a,f.b]){expect(world.callback).toBe(1);expect(world.receiptTick).toBe(1);expect(world.modelState!.pickupHistory!.root.version).toBe(1);expect(f.sources.get(world.id)!.history.root.version).toBe(1);}
  }finally{release.resolve();await f.close();}
 });

 it('rolls back cancellation during retained replay without changing CURRENT or either life',async()=>{
  const f=await fixture('solo-async-cancel-replay'),entered=deferred(),release=deferred(),abort=new AbortController();
  try{
   const before=await f.store.readManifest(),time=f.physical(1),c=f.cohort({replayComplete:async plan=>{if(plan.observer.id==='A'){entered.resolve();await release.promise;}}});
   const pending=f.worlds.completeGoodyAsync(time,c.value,abort.signal);await entered.promise;
   abort.abort(Error('cancelled retained replay'));release.resolve();await expect(pending).rejects.toThrow('cancelled retained replay');
   expect(await f.store.readManifest()).toEqual(before);expect(c.stats.publish).toBe(0);expect(c.stats.abort).toBe(1);
   for(const world of [f.a,f.b]){expect(world.callback).toBe(0);expect(world.receiptTick).toBe(0);expect(world.modelState).toBeUndefined();expect(f.sources.get(world.id)!.history.root.version).toBe(0);}
   const retry=f.cohort();await f.worlds.completeGoodyAsync(time,retry.value);expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);
  }finally{release.resolve();await f.close();}
 });

 it('rejects new admission while begin awaits without corrupting the retained callback',async()=>{
  const f=await fixture('solo-async-admission'),entered=deferred(),release=deferred();
  try{
   const time=f.physical(1),c=f.cohort({begin:async()=>{entered.resolve();await release.promise;}}),pending=f.worlds.completeGoodyAsync(time,c.value);
   await entered.promise;
   expect(()=>f.worlds.physics(2/30)).toThrow();expect(()=>f.worlds.reportShots('A',1)).toThrow();expect(()=>f.worlds.register({id:'C',name:'Charlie',eye:{x:3000,y:1000,z:1000}})).toThrow();
   expect(()=>f.worlds.clear()).toThrow();expect(()=>f.worlds.completeGoody(time)).toThrow();expect(()=>f.worlds.actors(time)).toThrow();
   expect(f.worlds.worlds.size).toBe(2);expect(f.a.callback).toBe(0);release.resolve();await pending;
   expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);expect(c.stats.publish).toBe(1);
  }finally{release.resolve();await f.close();}
 });

 it('drains cancellation during begin before retrying the same lives and storage slot',async()=>{
  const f=await fixture('solo-async-cancel-begin'),entered=deferred(),release=deferred(),abort=new AbortController();
  try{
   const before=await f.store.readManifest(),time=f.physical(1),c=f.cohort({begin:async()=>{entered.resolve();await release.promise;}});
   const pending=f.worlds.completeGoodyAsync(time,c.value,abort.signal);await entered.promise;
   abort.abort(Error('cancelled suspended begin'));release.resolve();await expect(pending).rejects.toThrow('cancelled suspended begin');
   expect(c.stats).toMatchObject({begin:1,replayed:[],seal:0,publish:0,abort:1});expect(await f.store.readManifest()).toEqual(before);expect(f.worlds.currentAwaiting).toBe(false);
   for(const world of [f.a,f.b]){expect(world.callback).toBe(0);expect(world.receiptTick).toBe(0);expect(world.modelState).toBeUndefined();expect(f.sources.get(world.id)!.history.root.version).toBe(0);}
   const retry=f.cohort();await f.worlds.completeGoodyAsync(time,retry.value);expect(retry.stats.publish).toBe(1);expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);
   expect(f.counts.backends).toBe(2);await c.value.abort();expect(c.stats.abort).toBe(1);
  }finally{release.resolve();await f.close();}
 });

 it('retains the next invocation admission guard when committed listeners start another suspended cohort',async()=>{
  const entered=deferred(),release=deferred();let once=false,nextPending:Promise<void>|undefined;
  let f!:Awaited<ReturnType<typeof fixture>>;
  f=await fixture('solo-async-reentrant-next',event=>{
   if(event.kind!=='model-state'||once)return;once=true;
   f.worlds.actors(1/30);const nextTime=f.physical(2);
   const next=f.cohort({begin:async()=>{entered.resolve();await release.promise;}});
   nextPending=f.worlds.completeGoodyAsync(nextTime,next.value);
  });
  try{
   const first=f.cohort();await f.worlds.completeGoodyAsync(f.physical(1),first.value);await entered.promise;
   expect(once).toBe(true);expect(nextPending).toBeDefined();expect(f.worlds.currentAwaiting).toBe(true);
   expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);expect(first.stats.finish).toBe(1);
   expect(()=>f.worlds.physics(3/30)).toThrow();expect(()=>f.worlds.reportShots('A',1)).toThrow();expect(()=>f.worlds.clear()).toThrow();
   release.resolve();await nextPending;
   expect(f.worlds.currentAwaiting).toBe(false);expect(f.a.callback).toBe(2);expect(f.b.callback).toBe(2);expect((await f.store.readManifest()).version).toBe(2);
  }finally{release.resolve();await nextPending?.catch(()=>{});await f.close();}
 });

 it('reports a committed user dispatch failure without replaying the callback or CAS',async()=>{
  const f=await fixture('solo-async-dispatch-failure',event=>{if(event.kind==='model-state')throw Error('committed renderer failure');});
  try{
   const c=f.cohort(),prepare=vi.spyOn(f.a.mirror,'prepareAsynchronousDelivery'),time=f.physical(1);
   await expect(f.worlds.completeGoodyAsync(time,c.value)).rejects.toThrow('Solo committed callback dispatch failed');
   expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);expect((await f.store.readManifest()).version).toBe(1);expect(f.worlds.callbackPhase).toBe('goody');expect(c.stats.abort).toBe(0);
   await expect(f.worlds.completeGoodyAsync(time,c.value)).rejects.toThrow();expect(prepare).toHaveBeenCalledTimes(1);expect(c.stats.publish).toBe(1);expect(c.stats.finish).toBe(1);
  }finally{await f.close();}
 });

 it('streams an actual replay-tail death drop into the same durable cohort before model adoption',async()=>{
  const f=await fixture('solo-async-death-append'),atCAS=deferred(),release=deferred();let death:{mockRestore():void}|undefined;
  try{
   const first=f.cohort();await f.worlds.completeGoodyAsync(f.physical(1),first.value);f.worlds.actors(1/30);
   expect(f.a.mirror.freeze().map(actor=>actor.id)).toEqual(['B']);
   // Inject one declared transport death receipt into the actual mirror. This
   // exercises real controller detach/append; it does not claim Game death
   // admission, asynchronous dispose, or native transport timing.
   const prepare=f.a.mirror.prepareAsynchronousDelivery.bind(f.a.mirror);
   death=vi.spyOn(f.a.mirror,'prepareAsynchronousDelivery').mockImplementationOnce((snapshot,order,now,finalize,signal)=>prepare({...snapshot,targets:[],deathPlayerId:'B'},order,now,finalize,signal));
   const c=f.cohort({afterCAS:async()=>{atCAS.resolve();await release.promise;}}),pending=f.worlds.completeGoodyAsync(f.physical(2),c.value);
   await atCAS.promise;
   const manifest=await f.store.readManifest(),aRoot=manifest.observers.find(row=>row.observer==='A')!.root;
   expect(aRoot).toMatchObject({count:1,pageCount:1,highWaterId:1,version:2});expect(manifest.observers.find(row=>row.observer==='A')!.lastReceiptTick).toBe(1);expect(f.sources.get('A')!.history.root.count).toBe(0);expect(f.a.callback).toBe(1);
   release.resolve();await pending;
   expect(f.sources.get('A')!.history.root).toEqual(aRoot);expect(f.a.modelState!.pickupHistory!.root).toEqual(aRoot);expect(f.a.modelState!.pickups).toEqual([]);
   expect(f.a.mirror.freeze()).toEqual([]);expect(f.b.callback).toBe(2);expect(c.stats.publish).toBe(1);expect(c.stats.seal).toBe(1);
   const reader=await openOriginalPickupBatchReader(f.store,'inspect-death');
   try{const window=await reader.loadWindow('A',0,{kind:'callback',sceneGeneration:1,callback:3});const row=reader.records(window)[0];expect(row).toMatchObject({id:1,weapon:'pistol'});expect(typeof row.handle).toBe('string');}finally{await reader.close();}
  }finally{death?.mockRestore();release.resolve();await f.close();}
 });
});
