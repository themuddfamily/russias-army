import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentOptions} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverLoadoutWorld} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {WeaponId} from './protocol';
import type {ReceiverPickupOutputChunk} from './originalReceiverPickupOutput';
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

/** Actual source/model/CURRENT/bank ownership. Controlled tail writers prove
 * admission and acknowledgment, not whole streamed delivery or native timing. */
async function fixture(name:string,phase:Phase=async()=>{},receipt=false,banks:'human'|'bot'|'models'='human'){
 const r=runtime(),initial={version:0,observers:[{observer:'A',lifeGeneration:1,prefix:prefix(0),lastReceiptTick:0,root:{key:'initial',version:0,count:0,pageCount:0,highWaterId:0}}]};
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial}),source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root:initial.observers[0].root});
 const pose={position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-query'}})};
 const world=new OriginalReceiverModelWorld(backend,{sceneGeneration:1,sourceScale:r.scale,eyeHeight:1,goodyBspWorld:1,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:8,maxTextChars:8192}},{snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-provider'})},source);
 const loadout=new OriginalReceiverLoadoutWorld({prefix:prefix(0),map:'woodlands',selected:'rifle',owned:owned(),ammo:{...counts(),rifle:2},reserve:counts(),refillTarget:28,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:8,maxTextChars:256,weaponModelPresent:owned()});
 const seed:ReceiverLocalWeaponWorldCheckpoint={prefix:prefix(0),cameraHandle:'camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:handle==='ak47',worldMatrix:I,groupAncestry:['declared-camera']}))};
 const local=new OriginalReceiverLocalWeaponWorld(seed,{sourceScale:r.scale,maxCommands:16,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
 const target={health:createOriginalPlayerHealth(),alive:true},barrels=new OriginalBarrelWorld(r);let stage:OriginalPickupBatchModelStage|undefined,window:PickupBatchWindow|undefined;
 const continuation:Phase=async(p,collect,flush)=>{if(p.callback===1)return;window=await stage!.loadWindow(0);await phase(p,collect,flush);};
 const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:1,sourceScale:r.scale,target,barrels,...(banks!=='models'?{localWeaponWorld:local}:{}),...(banks==='human'?{loadoutWorld:loadout,pickupContinuationAt:continuation}:{}),maxCommands:8,maxOutcomes:2,maxModels:32,maxTextChars:8192,
  snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-CURRENT-provider'})});
 const arm=(callback:number)=>env.arm({physicalCallback:callback,goody:{eyePosition:{x:0,y:10.5,z:0},modelPosition:{x:0,y:10.5,z:0},bspWorld:1,weapon:'rifle'},frames:[{prefix:prefix(callback),commands:[],...(banks!=='models'?{localWeapon:{cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0}}}:{})}]});
 const firstReader=await openOriginalPickupBatchReader(store,'first-reader'),old=firstReader.manifest.observers[0],firstPlan={...old,prefix:prefix(1),root:{key:'first-root',version:1}},firstWriter=await store.beginBatch(firstReader.manifest,[firstPlan]);
 const firstStage=source.stage(firstReader,firstWriter,prefix(1)),firstModels=world.begin();firstModels.advanceExternalCallback(1);arm(1);const firstEnvironment=env.begin(firstModels,firstModels);await firstEnvironment.dispatchAtAsync!(prefix(1),()=>{});
 const actor={position:{x:0,y:10,z:0},yaw:0,motionTime:100,weapon:'rifle' as const};firstModels.birth({actorId:'declared-drop',targetFeet:actor.position,targetYaw:0,callback:1});firstModels.beforeCallback('declared-drop',actor);firstModels.detach('declared-drop',actor,1);
 const firstEdits=firstStage.drainEdits(),pickup=firstEdits[0].pickup;await firstWriter.writePage({observer:'A',page:0,records:[pickup]});
 const ready=await firstWriter.seal({version:1,observers:[{...firstPlan,root:{...firstPlan.root,count:1,pageCount:1,highWaterId:1}}]});firstStage.seal(ready);
 const publishModels=firstModels.prepareCommit(),publishEnvironment=firstEnvironment.prepareCommit();await ready.publishAndPin('first-published');publishModels();publishEnvironment();await firstReader.close();await store.unpin('first-published');
 const finalPrefix=receipt?{kind:'receipt' as const,sceneGeneration:1,callback:1,tick:1}:prefix(2);
 const reader=await openOriginalPickupBatchReader(store,'second-reader'),base=reader.manifest.observers[0],plan={...base,prefix:finalPrefix,...(receipt?{lastReceiptTick:1}:{}),root:{key:'second-root',version:2}},writer=await store.beginBatch(reader.manifest,[plan]);stage=source.stage(reader,writer,finalPrefix);
 const models=world.begin();if(receipt){models.applyExternalReceipt(1,1);env.arm({physicalCallback:1,goody:{eyePosition:{x:0,y:10.5,z:0},modelPosition:{x:0,y:10.5,z:0},bspWorld:1,weapon:'rifle'},frames:[{prefix:finalPrefix,commands:[]}]});}else{models.advanceExternalCallback(2);arm(2);}const tx=env.begin(models,models),before={loadout:loadout.freeze(),local:local.freeze(),models:world.freezeActorRegistry(),history:source.history};
 const dispatch=()=>tx.dispatchAtAsync!(finalPrefix,()=>{});
 const close=async()=>{tx.rollback();models.rollback();stage!.rollback();await reader.close();loadout.release();local.release();await store.close();};
 const releaseWindow=()=>{stage!.releaseWindow(window!);window=undefined;};
 return {store,source,world,models,env,tx,loadout,local,pickup,before,dispatch,releaseWindow,close,finalPrefix,writer,stage,plan,reader};
}

describe('CURRENT final pickup output tail persistence',()=>{
 it.each([['bot',false],['bot',true],['models',false],['models',true]] as const)('persists %s actor tails without a loadout bank (receipt %s)',async(banks,receipt)=>{
  const f=await fixture(`current-tail-no-loadout-${banks}-${receipt}`,undefined,receipt,banks);
  try{
   await f.dispatch();f.models.birth({actorId:'no-loadout-tail',targetFeet:{x:1,y:2,z:3},targetYaw:0,callback:f.finalPrefix.callback});
   let tail:ReceiverPickupOutputChunk|undefined;
   await f.tx.flushPickupOutputTail!(async chunk=>{tail=chunk;await f.writer.writeOutputChunk('A',chunk);});
   expect(tail!.transitions.map(event=>event.kind)).toEqual(['birth']);expect(tail!.loadoutIntents).toEqual([]);expect(tail!.prefix).toEqual(f.finalPrefix);
   expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.local.freeze()).toBe(f.before.local);
   const window=await f.stage.loadWindow(0);await f.writer.writePage({observer:'A',page:0,records:f.reader.records(window)});f.stage.releaseWindow(window);
   const ready=await f.writer.seal({version:2,observers:[{...f.plan,root:{...f.plan.root,count:1,pageCount:1,highWaterId:1}}]});f.stage.seal(ready);
   const descriptor=f.models.freezePickupOutputDescriptor!();expect(descriptor).toBe(ready.outputDescriptors[0]);expect(descriptor!.loadoutCount).toBe(0);
   f.tx.preparePickupOutputPublication!(descriptor!);const publishEnvironment=f.tx.prepareCommit(),publishModels=f.models.prepareCommit();
   expect(f.source.history).toBe(f.before.history);const snapshot=await ready.publishAndPin('no-loadout-published');publishEnvironment();publishModels();
   f.store.assertOutputDescriptor(snapshot,descriptor!);expect(f.source.history.root.key).toBe('second-root');
   expect(f.loadout.freeze()).toBe(f.before.loadout);
   if(banks==='bot')expect(f.local.freeze().prefix).toEqual(f.finalPrefix);else expect(f.local.freeze()).toBe(f.before.local);
   const committed=await f.store.claimOutputChunk(snapshot,'A','models',1);expect(committed.transitions.map(event=>event.kind)).toEqual(['birth']);
   await f.store.unpin('no-loadout-published');
  }finally{await f.close();}
 });

 it('keeps authentic local-bank acknowledgment checks when no loadout bank exists',async()=>{
  const f=await fixture('current-tail-bot-model-changed',undefined,false,'bot');
  try{
   await f.dispatch();await expect(f.tx.flushPickupOutputTail!(async()=>{
    f.models.birth({actorId:'changed-bot-tail',targetFeet:{x:1,y:2,z:3},targetYaw:0,callback:2});
   })).rejects.toThrow(/changed/);
   expect(f.local.freeze()).toBe(f.before.local);expect(f.loadout.freeze()).toBe(f.before.loadout);expect(()=>f.tx.prepareCommit()).toThrow();
   expect((await f.store.readManifest()).version).toBe(1);
  }finally{await f.close();}
 });

 it('persists actor events emitted after the collection window and retains global sequence and ordinal',async()=>{
  let windowBatch:ReceiverPickupOutputChunk|undefined;
  let f!:Awaited<ReturnType<typeof fixture>>;
  f=await fixture('current-tail-post-collection',async(_p,collect,flush)=>{expect(collect(1)).toBe(true);await flush(async chunk=>{windowBatch=chunk;await f.writer.writeOutputChunk('A',chunk);});});
  try{
   await f.dispatch();f.releaseWindow();
   f.models.birth({actorId:'post-collection',targetFeet:{x:1,y:2,z:3},targetYaw:0,callback:2});
   let tail:ReceiverPickupOutputChunk|undefined;
   await f.tx.flushPickupOutputTail!(async chunk=>{tail=chunk;await f.writer.writeOutputChunk('A',chunk);});
   expect(windowBatch!.transitions.map(event=>event.kind)).toEqual(['pickup-collected']);
   expect(tail!.sequence).toBe(2);expect(tail!.firstOrdinal).toBe(2);
   expect(tail!.transitions.map(event=>event.kind)).toEqual(['birth']);expect(tail!.loadoutIntents).toEqual([]);
   expect(Object.isFrozen(tail)).toBe(true);expect(Object.isFrozen(tail!.transitions)).toBe(true);
   const edits=f.stage.drainEdits();expect(edits).toHaveLength(1);expect(edits[0].kind).toBe('remove');
   const ready=await f.writer.seal({version:2,observers:[{...f.plan,root:{...f.plan.root,count:0,pageCount:0,highWaterId:1}}]});f.stage.seal(ready);
   const descriptor=f.models.freezePickupOutputDescriptor!();expect(descriptor).toBe(ready.outputDescriptors[0]);
   expect(descriptor).toMatchObject({chunkCount:2,transitionCount:2,loadoutCount:2});
   expect(()=>f.tx.prepareCommit()).toThrow(/streamed pickup outputs require streamed publication/);
   expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.source.history).toBe(f.before.history);
  }finally{await f.close();}
 });

 it('captures pending pickup feedback with the final callback tail when the window did not flush',async()=>{
  const f=await fixture('current-tail-feedback',async(_p,collect)=>{expect(collect(1)).toBe(true);});
  try{
   await f.dispatch();let tail:ReceiverPickupOutputChunk|undefined;
   await f.tx.flushPickupOutputTail!(async chunk=>{tail=chunk;});
   expect(tail!.transitions.map(event=>event.kind)).toEqual(['pickup-collected']);
   expect(tail!.loadoutIntents.map(event=>event.intent.kind)).toEqual(['reload-sound','feedback']);
   expect(Object.isFrozen(tail!.loadoutIntents)).toBe(true);expect(Object.isFrozen(tail!.loadoutIntents[0])).toBe(true);
   expect(()=>f.models.freezeModelTransitions!()).toThrow(/streamed/);
  }finally{await f.close();}
 });

 it('persists receipt-only actor events without inventing a callback or changing committed banks',async()=>{
  const f=await fixture('current-tail-receipt',undefined,true);
  try{
   await f.dispatch();f.models.birth({actorId:'receipt-actor',targetFeet:{x:1,y:2,z:3},targetYaw:0,callback:1});
   let tail:ReceiverPickupOutputChunk|undefined;await f.tx.flushPickupOutputTail!(async chunk=>{tail=chunk;});
   expect(tail!.prefix).toEqual({kind:'receipt',sceneGeneration:1,callback:1,tick:1});
   expect(tail!.transitions.map(event=>event.prefix)).toEqual([tail!.prefix]);expect(tail!.transitions[0].kind).toBe('birth');
   expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.local.freeze()).toBe(f.before.local);
  }finally{await f.close();}
 });

 it('rejects tail admission before all CURRENT frames are consumed without calling the writer',async()=>{
  const f=await fixture('current-tail-unconsumed');
  try{const writer=vi.fn(async()=>{});await expect(f.tx.flushPickupOutputTail!(writer)).rejects.toThrow(/unavailable/);expect(writer).not.toHaveBeenCalled();expect(()=>f.tx.prepareCommit()).toThrow();}finally{await f.close();}
 });

 it('leaves rewards, model state and roots private after a tail writer failure',async()=>{
  const f=await fixture('current-tail-failure',async(_p,collect)=>{collect(1);});
  try{
   await f.dispatch();const error=Error('declared tail writer failure');await expect(f.tx.flushPickupOutputTail!(async()=>{throw error;})).rejects.toBe(error);
   expect(()=>f.tx.prepareCommit()).toThrow();expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.world.freezeActorRegistry()).toEqual(f.before.models);
   expect((await f.store.readManifest()).version).toBe(1);expect(f.source.history).toBe(f.before.history);
  }finally{await f.close();}
 });

 it('rejects acknowledgment if an actor event changes the captured model journal during persistence',async()=>{
  const f=await fixture('current-tail-model-changed');
  try{
   await f.dispatch();await expect(f.tx.flushPickupOutputTail!(async()=>{
    f.models.birth({actorId:'during-tail-write',targetFeet:{x:1,y:2,z:3},targetYaw:0,callback:2});
   })).rejects.toThrow(/changed/);
   expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.local.freeze()).toBe(f.before.local);expect(()=>f.tx.prepareCommit()).toThrow();
  }finally{await f.close();}
 });

 it.each(['tail','read','hurt'] as const)('rejects and poisons caught tail writer %s reentry',async kind=>{
  const f=await fixture(`current-tail-reentry-${kind}`);
  try{
   await f.dispatch();await expect(f.tx.flushPickupOutputTail!(async()=>{
    if(kind==='tail')await expect(f.tx.flushPickupOutputTail!(async()=>{})).rejects.toThrow(/unavailable/);
    else if(kind==='read'){try{f.tx.goodyContext();}catch{/* Poison remains visible to the outer writer. */}}
    else{try{f.tx.stageEffects([{kind:'bang-hurt',effectId:'tail-reentry',amount:5,radiusSource:250,attackerName:null,position:{x:0,y:10.5,z:0}}],prefix(2));}catch{/* Private health cannot change during the write. */}}
   })).rejects.toThrow();expect(()=>f.tx.prepareCommit()).toThrow();
  }finally{await f.close();}
 });

 it('holds environment admission until a pending tail write drains after rollback',async()=>{
  const f=await fixture('current-tail-rollback'),entered=deferred(),gate=deferred();let pending:Promise<void>|undefined;
  try{
   await f.dispatch();pending=f.tx.flushPickupOutputTail!(async()=>{entered.resolve();await gate.promise;});const rejected=expect(pending).rejects.toThrow();
   await entered.promise;f.tx.rollback();f.models.rollback();expect(()=>f.env.begin(f.models,f.models)).toThrow(/unavailable/);
   expect(f.loadout.freeze()).toBe(f.before.loadout);expect(f.local.freeze()).toBe(f.before.local);
   gate.resolve();await rejected;expect(()=>f.env.drainLoadoutIntents()).not.toThrow();expect(f.env.drainLoadoutIntents()).toEqual([]);
   expect((await f.store.readManifest()).version).toBe(1);
  }finally{gate.resolve();await pending?.catch(()=>{});await f.close();}
 });
});
