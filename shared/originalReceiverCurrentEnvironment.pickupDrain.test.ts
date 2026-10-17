import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentOptions,type ReceiverCurrentPickupWindowBatch,type ReceiverCurrentPickupWindowFlush} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverLoadoutWorld} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {WeaponId} from './protocol';
import {openOriginalPickupBatchStore} from '../src/originalPickupBatchStore';
import {openOriginalPickupBatchReader,type PickupBatchWindow} from '../src/originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory,type OriginalPickupBatchModelStage} from '../src/originalPickupBatchModelHistory';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const prefix=(callback:number)=>({kind:'callback' as const,sceneGeneration:1,callback});
const counts=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
const owned=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
type Phase=NonNullable<ReceiverCurrentEnvironmentOptions['pickupContinuationAt']>;

/** Real authenticated pickup/model/bank ownership and initial root CAS. The
 * writer used by each test is a controlled private callback; these tests do
 * not establish durable output-spool publication or native callback timing. */
async function fixture(name:string,phase:Phase){
 const r=runtime(),initial={version:0,observers:[{observer:'A',lifeGeneration:1,prefix:prefix(0),lastReceiptTick:0,root:{key:'initial',version:0,count:0,pageCount:0,highWaterId:0}}]};
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial}),source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root:initial.observers[0].root});
 const pose={position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-query'}})};
 const world=new OriginalReceiverModelWorld(backend,{sceneGeneration:1,sourceScale:r.scale,eyeHeight:1,goodyBspWorld:1,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:8,maxTextChars:8192}},{snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-provider'})},source);
 const loadout=new OriginalReceiverLoadoutWorld({prefix:prefix(0),map:'woodlands',selected:'rifle',owned:owned(),ammo:{...counts(),rifle:2},reserve:counts(),refillTarget:28,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:8,maxTextChars:256,weaponModelPresent:owned()});
 const seed:ReceiverLocalWeaponWorldCheckpoint={prefix:prefix(0),cameraHandle:'camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:handle==='ak47',worldMatrix:I,groupAncestry:['declared-camera']}))};
 const local=new OriginalReceiverLocalWeaponWorld(seed,{sourceScale:r.scale,maxCommands:16,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
 const target={health:createOriginalPlayerHealth(),alive:true},barrels=new OriginalBarrelWorld(r);let stage:OriginalPickupBatchModelStage|undefined,window:PickupBatchWindow|undefined;
 const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:1,sourceScale:r.scale,target,barrels,localWeaponWorld:local,loadoutWorld:loadout,maxCommands:8,maxOutcomes:2,maxModels:32,maxTextChars:8192,
  pickupContinuationAt:async(p,collect,flush)=>{if(p.callback===1)return;window=await stage!.loadWindow(0);await phase(p,collect,flush);},
  snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-CURRENT-provider'})});
 const arm=(callback:number)=>env.arm({physicalCallback:callback,goody:{eyePosition:{x:0,y:10.5,z:0},modelPosition:{x:0,y:10.5,z:0},bspWorld:1,weapon:'rifle'},frames:[{prefix:prefix(callback),commands:[],localWeapon:{cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0}}}]});
 const firstReader=await openOriginalPickupBatchReader(store,'first-reader'),old=firstReader.manifest.observers[0],firstPlan={...old,prefix:prefix(1),root:{key:'first-root',version:1}},firstWriter=await store.beginBatch(firstReader.manifest,[firstPlan]);
 const firstStage=source.stage(firstReader,firstWriter,prefix(1)),firstModels=world.begin();firstModels.advanceExternalCallback(1);arm(1);const firstEnvironment=env.begin(firstModels,firstModels);await firstEnvironment.dispatchAtAsync!(prefix(1),()=>{});
 const actor={position:{x:0,y:10,z:0},yaw:0,motionTime:100,weapon:'rifle' as const};firstModels.birth({actorId:'declared-drop',targetFeet:actor.position,targetYaw:0,callback:1});firstModels.beforeCallback('declared-drop',actor);firstModels.detach('declared-drop',actor,1);
 const firstEdits=firstStage.drainEdits(),pickup=firstEdits[0].pickup;await firstWriter.writePage({observer:'A',page:0,records:[pickup]});
 const ready=await firstWriter.seal({version:1,observers:[{...firstPlan,root:{...firstPlan.root,count:1,pageCount:1,highWaterId:1}}]});firstStage.seal(ready);
 const publishModels=firstModels.prepareCommit(),publishEnvironment=firstEnvironment.prepareCommit();await ready.publishAndPin('first-published');publishModels();publishEnvironment();await firstReader.close();await store.unpin('first-published');
 const reader=await openOriginalPickupBatchReader(store,'second-reader'),base=reader.manifest.observers[0],plan={...base,prefix:prefix(2),root:{key:'second-root',version:2}},writer=await store.beginBatch(reader.manifest,[plan]);stage=source.stage(reader,writer,prefix(2));
 const models=world.begin();models.advanceExternalCallback(2);arm(2);const tx=env.begin(models,models),before={loadout:loadout.freeze(),local:local.freeze(),models:world.freezeActorRegistry(),history:source.history};
 const dispatch=()=>tx.dispatchAtAsync!(prefix(2),()=>{});
 const close=async()=>{tx.rollback();models.rollback();stage!.rollback();await writer.abort();await reader.close();loadout.release();local.release();await store.close();};
 const releaseWindow=()=>{stage!.releaseWindow(window!);window=undefined;};
 return {store,source,world,models,env,tx,loadout,local,pickup,before,dispatch,releaseWindow,close};
}

describe('private awaited CURRENT pickup-window persistence capability',()=>{
 it('writes a detached bounded batch before acknowledging banks and refuses unsupported streamed publication',async()=>{
  const entered=deferred(),gate=deferred();let batch:ReceiverCurrentPickupWindowBatch|undefined;
  const f=await fixture('current-drain-batch',async(_p,collect,flush)=>{expect(collect(1)).toBe(true);await flush(async value=>{batch=value;entered.resolve();await gate.promise;});});
  let pending:Promise<void>|undefined;
  try{
   pending=f.dispatch();await entered.promise;expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.local.freeze()).toBe(f.before.local);expect(f.source.history).toBe(f.before.history);
   expect(batch!.prefix).toEqual(prefix(2));expect(batch!.sequence).toBe(1);expect(batch!.firstOrdinal).toBe(1);expect(batch!.transitions.map(value=>value.kind)).toEqual(['pickup-collected']);
   expect(batch!.loadoutIntents.map(value=>value.intent.kind)).toEqual(['reload-sound','feedback']);expect(Object.isFrozen(batch)).toBe(true);expect(Object.isFrozen(batch!.loadoutIntents)).toBe(true);
   expect(Object.keys(batch!)).toEqual(['prefix','sequence','firstOrdinal','transitions','loadoutIntents']);
   gate.resolve();await pending;
   expect(()=>f.models.freezeModelTransitions!()).toThrow(/streamed/);expect(()=>f.tx.prepareCommit()).toThrow(/streamed pickup outputs require streamed publication/);
   f.tx.rollback();f.models.rollback();expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.env.drainLoadoutIntents()).toEqual([]);
   expect(f.world.freezeActorRegistry()).toEqual(f.before.models);
  }finally{gate.resolve();await pending?.catch(()=>{});await f.close();}
 });

 it('keeps batch and reward private when the persistence writer rejects',async()=>{
  const error=Error('declared private spool failure'),f=await fixture('current-drain-write-failure',async(_p,collect,flush)=>{collect(1);await flush(async()=>{throw error;});});
  try{
   await expect(f.dispatch()).rejects.toBe(error);expect(()=>f.tx.prepareCommit()).toThrow();f.tx.rollback();f.models.rollback();
   expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.local.freeze()).toBe(f.before.local);expect(f.source.history).toBe(f.before.history);
   expect((await f.store.readManifest()).version).toBe(1);expect(f.env.drainLoadoutIntents()).toEqual([]);
  }finally{await f.close();}
 });

 it.each(['collect','flush','read','hurt'] as const)('poisons the outer persistence operation after caught writer %s reentry',async kind=>{
  let f!:Awaited<ReturnType<typeof fixture>>;
  f=await fixture(`current-drain-reentry-${kind}`,async(_p,collect,flush)=>{
   collect(1);await flush(async()=>{
    if(kind==='collect'){try{collect(0);}catch{/* Must still poison outer flush. */}}
    else if(kind==='flush')await expect(flush(async()=>{})).rejects.toThrow();
    else if(kind==='read'){try{f.tx.goodyContext();}catch{/* Reads cannot admit writer reentry. */}}
    else {try{f.tx.stageEffects([{kind:'bang-hurt',effectId:'writer-reentry',amount:5,radiusSource:250,attackerName:null,position:{x:0,y:10.5,z:0}}],prefix(2));}catch{/* Writer cannot mutate private health/outcomes. */}}
   });
  });
  try{await expect(f.dispatch()).rejects.toThrow();expect(()=>f.tx.prepareCommit()).toThrow();expect(f.loadout.freeze()).toBe(f.before.loadout);}finally{await f.close();}
 });

 it('drains a writer started by a continuation that drops its flush promise',async()=>{
  const entered=deferred(),gate=deferred();let settled=false,writing:Promise<void>|undefined;
  const f=await fixture('current-drain-unawaited',async(_p,collect,flush)=>{collect(1);writing=flush(async()=>{entered.resolve();await gate.promise;});});let pending:Promise<void>|undefined;
  try{
   pending=f.dispatch().then(()=>{settled=true;});await entered.promise;await Promise.resolve();expect(settled).toBe(false);
   gate.resolve();await pending;await writing;expect(settled).toBe(true);expect(()=>f.tx.prepareCommit()).toThrow(/streamed/);
  }finally{gate.resolve();await pending?.catch(()=>{});await writing?.catch(()=>{});await f.close();}
 });

 it('drains a pending writer after rollback and acknowledges no private bank state',async()=>{
  const entered=deferred(),gate=deferred();const f=await fixture('current-drain-rollback',async(_p,collect,flush)=>{collect(1);await flush(async()=>{entered.resolve();await gate.promise;});});let pending:Promise<void>|undefined;
  try{
   pending=f.dispatch();const rejected=expect(pending).rejects.toThrow();await entered.promise;f.tx.rollback();f.models.rollback();
   expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.local.freeze()).toBe(f.before.local);expect(()=>f.env.begin(f.models,f.models)).toThrow(/unavailable/);gate.resolve();await rejected;
   expect((await f.store.readManifest()).version).toBe(1);
  }finally{gate.resolve();await pending?.catch(()=>{});await f.close();}
 });

 it('rejects acknowledgement when the authenticated pickup window epoch changes during the write',async()=>{
  let f!:Awaited<ReturnType<typeof fixture>>;
  f=await fixture('current-drain-window-epoch',async(_p,collect,flush)=>{collect(1);await flush(async()=>{f.releaseWindow();});});
  try{await expect(f.dispatch()).rejects.toThrow(/Stale/);expect(()=>f.tx.prepareCommit()).toThrow();expect(f.source.history).toBe(f.before.history);expect(f.loadout.freeze()).toBe(f.before.loadout);}finally{await f.close();}
 });

 it('rejects a retained flush after its callback completes without invoking its writer',async()=>{
  let retained:ReceiverCurrentPickupWindowFlush|undefined;const f=await fixture('current-drain-retained',async(_p,_collect,flush)=>{retained=flush;});
  try{await f.dispatch();const writer=vi.fn(async()=>{});await expect(retained!(writer)).rejects.toThrow(/unavailable/);expect(writer).not.toHaveBeenCalled();expect(()=>f.tx.prepareCommit()).toThrow();}finally{await f.close();}
 });
});
