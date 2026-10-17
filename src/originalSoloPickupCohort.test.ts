import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from '../shared/originalReceiverLocalWeaponInventory';
import {OriginalReceiverLoadoutWorld} from '../shared/originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {ORIGINAL_WEAPON_SLOT_ORDER} from '../shared/originalPickupRules';
import type {WeaponId} from '../shared/protocol';
import {OriginalSoloPickupCohort} from './originalSoloPickupCohort';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from '../shared/originalSoloObserverWorld';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from '../shared/originalSoloCurrentSceneProducer';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalPlayerBody,originalPlayerEye} from '../shared/originalPlayerPhysics';
import type {ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import {openOriginalPickupBatchStore,type PickupBatchManifest} from './originalPickupBatchStore';
import {openOriginalPickupBatchReader} from './originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';

let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??(decoded=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const initial=():PickupBatchManifest=>({version:0,observers:['A','B'].map(observer=>({observer,lifeGeneration:1,
 prefix:{kind:'callback',sceneGeneration:1,callback:0},lastReceiptTick:-1,root:{key:`initial-${observer}`,version:0,count:0,pageCount:0,highWaterId:0}}))});

/** CPU producer and transport fixture. Real storage/model ownership; no Game,
 * native timing, Game wiring, or unrestricted output-capacity claim. */
async function fixture(name:string,onEvent?:(event:OriginalSoloEvent)=>void){
 const factory=new IDBFactory(),store=await openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()});
 const sources=new Map((await store.readManifest()).observers.map(row=>[row.observer,new OriginalPickupBatchModelHistory({observer:row.observer,lifeGeneration:row.lifeGeneration,root:row.root})]));
 const events:OriginalSoloEvent[]=[],counts={backends:0,releases:0};
 let activeCohort:OriginalSoloPickupCohort|undefined;
 const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 const zero=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
 const owned=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
 const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const options=(source:OriginalPickupBatchModelHistory):OriginalSoloCurrentSceneProducerOptions=>({sourceScale:runtime().scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,
  environment:{maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536},
  controller:{model:{eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:50*runtime().scale,maxModels:128,maxPickups:16,lifecycleJournal:{maxEntries:16,maxTextChars:65536}},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},
  createBackends:c=>{counts.backends++;const selected=c.weapon!,prefix={kind:'callback' as const,sceneGeneration:c.lifeGeneration,callback:0};
  const loadoutWorld=new OriginalReceiverLoadoutWorld({prefix,map:'woodlands',selected,owned:owned(),ammo:{...zero(),[selected]:2},reserve:zero(),refillTarget:selected==='pistol'?8:28,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:64,maxTextChars:8192,weaponModelPresent:owned()});
  const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix,cameraHandle:`camera:${c.id}`,cameraWorldMatrix:I,selectedWeapon:selected,loadedRocket:false,motion:{weapon:selected,ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:handle===(selected==='pistol'?'pistol':'ak47'),worldMatrix:I,groupAncestry:['declared-local']}))};
  const localWeaponWorld=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:runtime().scale,maxCommands:64,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
  return {pickupHistorySource:source,loadoutWorld,localWeaponWorld,pickupContinuationAt:(callback,collect)=>{if(!activeCohort)throw Error('Missing active fixture cohort');return activeCohort.pickupContinuationAt(c.id)(callback,collect);},
   model:{cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:inWorld=>inWorld,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})},
   transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},release:()=>{counts.releases++;}};},
  captureLocalWeaponCallback:()=>({cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0},commands:[]}),
  captureLoadoutProgram:(_c,prefixes)=>({receiptCommands:[],...(prefixes.callback?{callbackCommands:[]}:{})}),
  goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:50*runtime().scale,weapon:c.weapon!}:null,
  snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-producer-inventory'}),
 });
 const worlds=new OriginalSoloObserverWorlds(runtime(),{presentationLifecycle:true,onEvent:event=>{events.push(event);onEvent?.(event);},createReceiverScene:r=>createOriginalSoloCurrentSceneLease(options(sources.get(r.id)!))});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(callback:number)=>{const time=callback/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 let serial=0;
 const cohort=()=>activeCohort=new OriginalSoloPickupCohort({store,sources,key:`cohort-${++serial}`});
 const close=async()=>{await worlds.clearAsync();await store.close();};
 return {store,sources,worlds,a,b,physical,cohort,close};
}

async function deathDrop(f:Awaited<ReturnType<typeof fixture>>){
 const prepare=f.a.mirror.prepareAsynchronousDelivery.bind(f.a.mirror);
 const death=vi.spyOn(f.a.mirror,'prepareAsynchronousDelivery').mockImplementationOnce((snapshot,order,now,finalize,signal)=>
  prepare({...snapshot,targets:[],deathPlayerId:'B'},order,now,finalize,signal));
 try{await f.worlds.completeGoodyAsync(f.physical(2),f.cohort());}finally{death.mockRestore();}
 f.worlds.actors(2/30);
}
async function records(f:Awaited<ReturnType<typeof fixture>>,callback:number){
 const reader=await openOriginalPickupBatchReader(f.store,`inspect-${callback}`);
 try{
  const window=await reader.loadWindow('A',0,{kind:'callback',sceneGeneration:1,callback});
  return reader.records(window).map(row=>({...row,position:{...row.position}}));
 }finally{await reader.close();}
}

describe('production pickup cohort adapter with actual CPU Solo replay and IndexedDB',()=>{
 it('persists receipt watermarks and final roots across repeated where deliveries',async()=>{
  const f=await fixture('production-cohort-repeated');
  try{
   for(let callback=1;callback<=3;callback++){
    await f.worlds.completeGoodyAsync(f.physical(callback),f.cohort());
    const manifest=await f.store.readManifest();expect(manifest.version).toBe(callback);
    for(const world of [f.a,f.b]){
     const row=manifest.observers.find(row=>row.observer===world.id)!;
     expect(row.prefix).toEqual({kind:'callback',sceneGeneration:1,callback});
     expect(row.lastReceiptTick).toBe(callback-1);expect(world.receiptTick).toBe(callback);
     expect(world.modelState!.pickupHistory).toEqual(f.sources.get(world.id)!.history);
     expect(world.modelState!.pickupHistory!.root).toEqual(row.root);
    }
    f.worlds.actors(callback/30);
   }
  }finally{await f.close();}
 });

 it('writes a replay-tail append and preserves its old page through the next callback',async()=>{
  const f=await fixture('production-cohort-tail');
  try{
   await f.worlds.completeGoodyAsync(f.physical(1),f.cohort());f.worlds.actors(1/30);
   await deathDrop(f);
   const dropped=await records(f,3);expect(dropped).toHaveLength(1);expect(dropped[0]).toMatchObject({id:1,weapon:'pistol'});
   expect(f.a.modelState!.pickupHistory!.root).toMatchObject({count:1,pageCount:1,highWaterId:1});
   await f.worlds.completeGoodyAsync(f.physical(3),f.cohort());f.worlds.actors(3/30);
   expect(await records(f,4)).toEqual(dropped);
   expect(f.a.modelState!.pickups).toEqual([]);
   expect(f.a.modelState!.pickupHistory!.root).toMatchObject({count:1,pageCount:1,highWaterId:1,version:3});
  }finally{await f.close();}
 });

 it('collects a preserved resident record through CURRENT and adopts the reward with its empty successor',async()=>{
  const f=await fixture('production-cohort-collection');
  try{
   await f.worlds.completeGoodyAsync(f.physical(1),f.cohort());f.worlds.actors(1/30);await deathDrop(f);
   const old=(await records(f,3))[0],score=f.a.loadout!.score;
   // Declared CPU teleport places the captured goody at the old pickup point.
   // This proves authenticated collection/adoption, not native movement timing.
   const body=createOriginalPlayerBody('A',old.position);f.a.body.position={...body.position};
   await f.worlds.completeGoodyAsync(f.physical(3),f.cohort());f.worlds.actors(3/30);
   expect(f.a.loadout!.score).toBe(score+5);
   expect(f.a.modelState!.pickupHistory!.root).toMatchObject({count:0,pageCount:0,highWaterId:1});
   expect(f.a.modelState!.pickups).toEqual([]);
   expect((await f.store.readManifest()).observers.find(row=>row.observer==='A')!.root).toEqual(f.a.modelState!.pickupHistory!.root);
  }finally{await f.close();}
 });

 it('rolls back after private page rewrite fails and retries the same captured callback',async()=>{
  const f=await fixture('production-cohort-rewrite-failure');
  try{
   await f.worlds.completeGoodyAsync(f.physical(1),f.cohort());f.worlds.actors(1/30);await deathDrop(f);
   const before=await f.store.readManifest(),history=f.sources.get('A')!.history,model=f.a.modelState,time=f.physical(3);
   const c=f.cohort(),original=c.replayComplete.bind(c);
   const failed=vi.spyOn(c,'replayComplete').mockImplementation(async(...args)=>{
    await original(...args);if(args[0].observer.id==='A')throw Error('after private survivor rewrite');
   });
   await expect(f.worlds.completeGoodyAsync(time,c)).rejects.toThrow('after private survivor rewrite');failed.mockRestore();
   expect(await f.store.readManifest()).toEqual(before);expect(f.sources.get('A')!.history).toBe(history);expect(f.a.modelState).toBe(model);
   expect(f.a.callback).toBe(2);expect(f.b.callback).toBe(2);expect(f.worlds.currentAwaiting).toBe(false);
   await f.worlds.completeGoodyAsync(time,f.cohort());f.worlds.actors(time);
   expect((await f.store.readManifest()).version).toBe(3);expect(await records(f,4)).toHaveLength(1);
  }finally{await f.close();}
 });

 it.each(['writer','prepared'] as const)('retries reader cleanup after %s staging abort consumed its capability',async state=>{
  const f=await fixture(`production-cohort-cleanup-${state}`);
  try{
   const before=await f.store.readManifest(),time=f.physical(1),c=f.cohort();
   const unpin=f.store.unpin.bind(f.store);let readerAttempts=0;
   const cleanup=vi.spyOn(f.store,'unpin').mockImplementation(async id=>{
    if(id==='cohort-1-reader'&&++readerAttempts===1)throw Error('reader lease cleanup once');
    await unpin(id);
   });
   if(state==='writer'){
    const replay=c.replayComplete.bind(c);
    vi.spyOn(c,'replayComplete').mockImplementation(async(...args)=>{await replay(...args);throw Error('before global seal');});
   }else vi.spyOn(c,'publish').mockRejectedValue(Error('before durable publication'));
   await expect(f.worlds.completeGoodyAsync(time,c)).rejects.toThrow('Solo CURRENT cohort rollback failed');
   expect(readerAttempts).toBe(1);expect(await f.store.readManifest()).toEqual(before);
   expect(f.a.callback).toBe(0);expect(f.b.callback).toBe(0);
   expect(f.sources.get('A')!.history.root.version).toBe(0);expect(f.sources.get('B')!.history.root.version).toBe(0);
   // Staging abort already succeeded. Only the still-owned reader lease needs
   // retry; authenticating the consumed staging handle again must not occur.
   await c.abort();expect(readerAttempts).toBe(2);await c.abort();expect(readerAttempts).toBe(2);
   await f.worlds.cancelAndDrainCurrent();
   cleanup.mockRestore();
   await f.worlds.completeGoodyAsync(time,f.cohort());f.worlds.actors(time);
   expect((await f.store.readManifest()).version).toBe(1);expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);
  }finally{await f.close();}
 });

 it('drains cancellation during a rewritten observer before retrying',async()=>{
  const f=await fixture('production-cohort-cancellation'),entered=deferred(),release=deferred(),controller=new AbortController();
  let pending:Promise<void>|undefined;
  try{
   const before=await f.store.readManifest(),time=f.physical(1),c=f.cohort(),original=c.replayComplete.bind(c);
   vi.spyOn(c,'replayComplete').mockImplementation(async(...args)=>{await original(...args);if(args[0].observer.id==='A'){entered.resolve();await release.promise;}});
   pending=f.worlds.completeGoodyAsync(time,c,controller.signal);const rejection=expect(pending).rejects.toThrow('cancel private observer');
   await entered.promise;controller.abort(Error('cancel private observer'));release.resolve();await rejection;
   expect(await f.store.readManifest()).toEqual(before);expect(f.a.callback).toBe(0);expect(f.b.callback).toBe(0);expect(f.worlds.currentAwaiting).toBe(false);
   await f.worlds.completeGoodyAsync(time,f.cohort());f.worlds.actors(time);expect((await f.store.readManifest()).version).toBe(1);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });
});
