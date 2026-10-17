import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {OriginalReceiverLoadoutWorld} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import type {WeaponId} from './protocol';
import {OriginalSoloPickupCohort} from '../src/originalSoloPickupCohort';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from './originalSoloObserverWorld';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {ReceiverModelPose} from './originalReceiverModelWorld';
import {openOriginalPickupBatchStore,type PickupBatchManifest} from '../src/originalPickupBatchStore';
import {OriginalPickupBatchModelHistory} from '../src/originalPickupBatchModelHistory';
import {OriginalReceiverWeaponReportWorld} from './originalReceiverWeaponReportWorld';

const decoded=new Map<string,OriginalMapRuntime>();
function mapRuntime(map:'woodlands'|'barrack'){let value=decoded.get(map);if(!value){value=registerOriginalMapRuntime(map,JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='woodlands'?'woodland':'barrack'}/scene.json`,import.meta.url),'utf8')));decoded.set(map,value);}return value;}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const initial=():PickupBatchManifest=>({version:0,observers:['A','B'].map(observer=>({observer,lifeGeneration:1,
 prefix:{kind:'callback',sceneGeneration:1,callback:0},lastReceiptTick:-1,root:{key:`initial-${observer}`,version:0,count:0,pageCount:0,highWaterId:0}}))});

/** CPU producer and transport fixture. Real storage/model ownership; no Game,
 * native timing, Game wiring, or unrestricted output-capacity claim. */
async function fixture(name:string,map:'woodlands'|'barrack'='woodlands',onEvent?:(event:OriginalSoloEvent)=>void,reportDeath=false){
 const runtime=()=>mapRuntime(map);
 const factory=new IDBFactory(),store=await openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()});
 const sources=new Map((await store.readManifest()).observers.map(row=>[row.observer,new OriginalPickupBatchModelHistory({observer:row.observer,lifeGeneration:row.lifeGeneration,root:row.root})]));
 const events:OriginalSoloEvent[]=[],counts={backends:0,releases:0};
 let activeCohort:OriginalSoloPickupCohort|undefined;
 const disposalControl:{prepare?:(cohort:OriginalSoloPickupCohort)=>void}={};
 const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 const zero=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
 const owned=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
 const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const options=(source:OriginalPickupBatchModelHistory):OriginalSoloCurrentSceneProducerOptions=>({sourceScale:runtime().scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,
  environment:{maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536},
  controller:{model:{eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:50*runtime().scale,maxModels:128,maxPickups:16,lifecycleJournal:{maxEntries:4,maxTextChars:65536}},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},
  createBackends:c=>{counts.backends++;const selected=c.weapon!,prefix={kind:'callback' as const,sceneGeneration:c.lifeGeneration,callback:0};
  const loadoutWorld=new OriginalReceiverLoadoutWorld({prefix,map,selected,owned:owned(),ammo:{...zero(),[selected]:2},reserve:zero(),refillTarget:selected==='pistol'?8:28,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:4,maxTextChars:8192,weaponModelPresent:owned()});
  const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix,cameraHandle:`camera:${c.id}`,cameraWorldMatrix:I,selectedWeapon:selected,loadedRocket:false,motion:{weapon:selected,ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:handle===(selected==='pistol'?'pistol':'ak47'),worldMatrix:I,groupAncestry:['declared-local']}))};
  const localWeaponWorld=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:runtime().scale,maxCommands:8,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
  const weaponReportWorld=reportDeath?new OriginalReceiverWeaponReportWorld({prefix,shots:1,hurts:c.id==='A'?[{name:'Bravo',amount:120}]:[]},{maxNames:8,maxTextChars:4096,maxCommands:8}):undefined;
  return {pickupHistorySource:source,loadoutWorld,localWeaponWorld,...(weaponReportWorld?{weaponReportWorld}:{}),pickupContinuationAt:(callback,collect,flush)=>{if(!activeCohort)throw Error('Missing active fixture cohort');return activeCohort.pickupContinuationAt(c.id)(callback,collect,flush);},
   model:{cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:inWorld=>inWorld,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})},
   transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},release:()=>{counts.releases++;}};},
  captureLocalWeaponCallback:()=>({cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0},commands:[]}),
  captureLoadoutProgram:(c,prefixes,_previous,bangs)=>({receiptCommands:bangs.map(({blast})=>({kind:'admitted-bang' as const,blast})),...(prefixes.callback?{callbackCommands:reportDeath&&c.id==='A'&&prefixes.callback.callback===1?[{kind:'weapon-report-send' as const}]:[]}:{})}),
  goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:50*runtime().scale,weapon:c.weapon!}:null,
  snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-producer-inventory'}),
 });
 const worlds=new OriginalSoloObserverWorlds(runtime(),{presentationLifecycle:true,admitWeaponReportDamage:reportDeath,createDisposalCohort:()=>{const value=cohort();disposalControl.prepare?.(value);return value;},onEvent:event=>{if(event.kind==='loadout-output'||event.kind==='model-transitions'||event.kind==='model-state'||event.kind==='loadout-state'||event.kind==='fade-born')events.push(event);onEvent?.(event);},createReceiverScene:r=>createOriginalSoloCurrentSceneLease(options(sources.get(r.id)!))});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(callback:number)=>{const time=callback/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 let serial=0;
 const cohort=()=>activeCohort=new OriginalSoloPickupCohort({store,sources,key:`cohort-${++serial}`,streamOutputs:true});
 const close=async()=>{await worlds.clearAsync();await store.close();};
 return {store,sources,worlds,a,b,physical,cohort,close,events,counts,disposalControl};
}

type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cycle(f:Fixture,n:number){const time=f.physical(n);await f.worlds.completeGoodyAsync(time,f.cohort());f.worlds.actors(time);}

describe('owned asynchronous terminal Solo death routing with actual CPU CURRENT and paged cohorts',()=>{
 it('delivers terminal committed weapon-report damage through one queued peer receipt',async()=>{
  const f=await fixture('queued-report-terminal','woodlands',undefined,true),entered=deferred(),release=deferred();let pending:Promise<void>|undefined;try{
   const outer=f.cohort(),finish=outer.finish.bind(outer);let streamed=false;
   const claim=outer.claimPickupOutput.bind(outer);vi.spyOn(outer,'claimPickupOutput').mockImplementation(async(...args)=>{streamed=true;return claim(...args);});
   vi.spyOn(outer,'finish').mockImplementation(async()=>{expect(streamed).toBe(true);entered.resolve();await release.promise;await finish();});
   pending=f.worlds.completeGoodyAsync(f.physical(1),outer);await entered.promise;
   expect(f.b.alive).toBe(false);expect(f.worlds.worlds.get('B')).toBe(f.b);expect(f.counts.releases).toBe(0);expect(f.worlds.currentAwaiting).toBe(true);expect(f.a.receiptTick).toBe(1);
   release.resolve();await pending;expect(f.worlds.worlds.has('B')).toBe(false);
   expect(f.b.health.canonical).toBe(-20);expect(f.a.callback).toBe(1);expect(f.a.receiptTick).toBe(2);expect(f.counts.releases).toBe(1);
   expect((await f.store.readManifest()).version).toBe(2);await f.worlds.cancelAndDrainCurrent();expect(f.a.receiptTick).toBe(2);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });
 it('queues direct terminal damage and coalesces one durable peer receipt before release',async()=>{
  const f=await fixture('queued-direct-death');try{
   await cycle(f,1);const tick=f.a.receiptTick,version=(await f.store.readManifest()).version;
   expect(f.worlds.damage('B',200,1/30)?.dead).toBe(true);expect(f.worlds.currentAwaiting).toBe(true);expect(f.counts.releases).toBe(0);
   expect(()=>f.worlds.physics(2/30)).toThrow(/terminal deaths/);
   const first=f.worlds.drainQueuedDeaths(),second=f.worlds.drainQueuedDeaths();expect(second).toBe(first);await first;
   expect(f.worlds.worlds.has('B')).toBe(false);expect(f.a.receiptTick).toBe(tick+1);expect(f.a.callback).toBe(1);
   expect((await f.store.readManifest()).version).toBe(version+1);expect(f.counts.releases).toBe(1);expect(f.worlds.currentAwaiting).toBe(false);
   await f.worlds.drainQueuedDeaths();expect(f.a.receiptTick).toBe(tick+1);
  }finally{await f.close();}
 });
 it('routes an actual terminal CURRENT blast after the outer streamed dispatch finishes',async()=>{
  const f=await fixture('queued-current-terminal'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined;try{
   const launched=f.worlds.launch({ownerId:'A',weapon:'rpg',eye:originalPlayerEye(f.a.body),direction:{x:1,y:0,z:0}},0);if(!launched.ok)throw Error(launched.reason);
   const time=f.physical(1);await f.worlds.completeGoodyAsync(time,f.cohort());
   for(const world of f.worlds.worlds.values())for(const projectile of world.projectiles.values())projectile.state.remainingCallbacks=1;
   f.worlds.actors(time);expect(f.a.blasts.size).toBe(1);
   // The next goody callback restores flick=2. Source death tests
   // canonical-after-hurt + 2*flick < 0: zero minus five is lethal;
   // one minus five reaches exactly zero and survives that strict test.
   f.a.health.canonical=0;
   const outer=f.cohort(),finish=outer.finish.bind(outer);let finished=false;
   vi.spyOn(outer,'finish').mockImplementation(async()=>{expect(f.worlds.worlds.has('A')).toBe(true);expect(f.counts.releases).toBe(0);entered.resolve();await release.promise;await finish();finished=true;});
   pending=f.worlds.completeGoodyAsync(f.physical(2),outer);await entered.promise;
   expect(f.a.health).toEqual({canonical:-5,flick:2});expect(f.a.health.canonical+2*f.a.health.flick).toBeLessThan(0);
   expect(f.a.alive).toBe(false);expect(f.worlds.worlds.has('A')).toBe(true);expect(f.b.receiptTick).toBe(2);expect(f.worlds.currentAwaiting).toBe(true);
   expect(()=>f.worlds.physics(3/30)).toThrow();release.resolve();await pending;
   expect(finished).toBe(true);expect(f.worlds.worlds.has('A')).toBe(false);expect(f.counts.releases).toBe(1);
   expect(f.b.receiptTick).toBe(3);expect((await f.store.readManifest()).version).toBe(3);expect(f.worlds.currentAwaiting).toBe(false);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });
 it('keeps a retired scene lease until failed publication-pin cleanup is retried',async()=>{
  const f=await fixture('queued-cleanup-retry');try{
   await cycle(f,1);const unpin=f.store.unpin.bind(f.store);let failures=0;
   const spy=vi.spyOn(f.store,'unpin').mockImplementation(async id=>{if(id==='cohort-2-published'&&++failures===1)throw Error('declared death cleanup failed');await unpin(id);});
   f.worlds.damage('B',200,1/30);await expect(f.worlds.drainQueuedDeaths()).rejects.toThrow(/cleanup failed/);
   expect(f.worlds.worlds.has('B')).toBe(false);expect(f.counts.releases).toBe(0);const version=(await f.store.readManifest()).version,tick=f.a.receiptTick;
   await f.worlds.cancelAndDrainCurrent();expect(f.counts.releases).toBe(1);expect(failures).toBe(2);expect((await f.store.readManifest()).version).toBe(version);expect(f.a.receiptTick).toBe(tick);spy.mockRestore();
  }finally{await f.close();}
 });
 it('retains the last life lease when an empty peer cohort cleanup fails',async()=>{
  const f=await fixture('queued-last-life-cleanup');try{
   await cycle(f,1);f.worlds.damage('B',200,1/30);await f.worlds.drainQueuedDeaths();expect(f.counts.releases).toBe(1);
   const unpin=f.store.unpin.bind(f.store);let attempts=0;
   const spy=vi.spyOn(f.store,'unpin').mockImplementation(async id=>{if(id==='cohort-3-published'&&++attempts===1)throw Error('declared final life cleanup failure');await unpin(id);});
   f.worlds.damage('A',200,1/30);await expect(f.worlds.drainQueuedDeaths()).rejects.toThrow(/final life cleanup failure/);
   expect(f.worlds.worlds.size).toBe(0);expect(f.counts.releases).toBe(1);expect(f.worlds.currentAwaiting).toBe(true);
   const version=(await f.store.readManifest()).version;await f.worlds.cancelAndDrainCurrent();
   expect(attempts).toBe(2);expect(f.counts.releases).toBe(2);expect((await f.store.readManifest()).version).toBe(version);expect(f.worlds.currentAwaiting).toBe(false);spy.mockRestore();
  }finally{await f.close();}
 });
 it('rejects a stale queued life rather than delivering death to its replacement',async()=>{
  const f=await fixture('queued-life-replaced');try{
   await cycle(f,1);f.worlds.damage('B',200,1/30);const replacement={...f.b,lifeGeneration:2,alive:true};f.worlds.worlds.set('B',replacement);
   await expect(f.worlds.drainQueuedDeaths()).rejects.toThrow(/life changed/);expect(replacement.alive).toBe(true);expect(f.a.receiptTick).toBe(1);
   // Restore the exact owner for authorized cleanup; no replacement receipt was emitted.
   f.worlds.worlds.set('B',f.b);await f.worlds.cancelAndDrainCurrent();expect(f.a.receiptTick).toBe(2);
  }finally{await f.close();}
 });
 it('clearAsync fences and drains queued ownership before releasing lives',async()=>{
  const f=await fixture('queued-clear');try{
   await cycle(f,1);f.worlds.damage('B',200,1/30);await f.worlds.clearAsync();expect(f.worlds.worlds.size).toBe(0);expect(f.counts.releases).toBe(2);expect(f.worlds.currentAwaiting).toBe(false);
  }finally{await f.close();}
 });
 it('cancels an owned private death replay and explicitly drains one fresh receipt attempt',async()=>{
  const f=await fixture('queued-cancel-private'),entered=deferred(),release=deferred();let pending:Promise<void>|undefined,drain:Promise<void>|undefined;
  try{
   await cycle(f,1);f.disposalControl.prepare=c=>{
    f.disposalControl.prepare=undefined;const replay=c.replayComplete.bind(c);
    vi.spyOn(c,'replayComplete').mockImplementation(async(...args)=>{await replay(...args);entered.resolve();await release.promise;});
   };
   f.worlds.damage('B',200,1/30);pending=f.worlds.drainQueuedDeaths();const rejected=expect(pending).rejects.toThrow(/declared private death cancellation/);
   await entered.promise;drain=f.worlds.cancelAndDrainCurrent(Error('declared private death cancellation'));expect(f.counts.releases).toBe(0);release.resolve();await rejected;await drain;
   expect(f.a.receiptTick).toBe(2);expect((await f.store.readManifest()).version).toBe(2);expect(f.counts.releases).toBe(1);expect(f.worlds.currentAwaiting).toBe(false);
  }finally{release.resolve();await pending?.catch(()=>{});await drain?.catch(()=>{});await f.close();}
 });
});
