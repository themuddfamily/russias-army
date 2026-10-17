import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {OriginalReceiverModelWorld,assertReceiverPickupWindowDrain,type ReceiverModelBackend,type ReceiverPickupWindowDrain,type ReceiverSceneTransaction} from './originalReceiverModelWorld';
import {openOriginalPickupBatchStore,type PickupBatchManifest} from '../src/originalPickupBatchStore';
import {openOriginalPickupBatchReader} from '../src/originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from '../src/originalPickupBatchModelHistory';

const pose=()=>({position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1});
const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'declared-CPU-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'declared-CPU-gun'}),
 sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>({...gi.pose,position:{...gi.pose.position,x:3}}),
 reparentGunMembership:()=>true,dropYaw:()=>.7,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};
const initial:PickupBatchManifest={version:0,observers:[{observer:'A',lifeGeneration:1,prefix:{kind:'callback',sceneGeneration:4,callback:0},lastReceiptTick:0,
 root:{key:'initial-A',version:0,count:0,pageCount:0,highWaterId:0}}]};
const actor={position:{x:0,y:10,z:7},yaw:.2,motionTime:123,weapon:'rpg' as const};
async function fixture(name:string){
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial}),source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root:initial.observers[0].root});
 const models=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:2,maxTextChars:4096}},
  {snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-external-query'})},source);
 const begin=async()=>{
  const reader=await openOriginalPickupBatchReader(store,'reader'),old=reader.manifest.observers[0],prefix={kind:'callback' as const,sceneGeneration:4,callback:old.prefix.callback+1};
  const plan={...old,prefix,root:{key:`root-${prefix.callback}`,version:old.root.version+1}},writer=await store.beginBatch(reader.manifest,[plan]);
  const stage=source.stage(reader,writer,prefix),tx=models.begin();tx.advanceExternalCallback(prefix.callback);
  const rollback=async()=>{tx.rollback();await writer.abort();await reader.close();};
  return {reader,old,prefix,plan,writer,stage,tx,rollback};
 };
 const birthDrop=(work:Awaited<ReturnType<typeof begin>>)=>{
  work.tx.birth({actorId:'remote',targetFeet:actor.position,targetYaw:actor.yaw,callback:work.prefix.callback});
  work.tx.detach('remote',actor,work.prefix.callback);
 };
 const seed=async()=>{
  const w=await begin();birthDrop(w);const edits=w.stage.drainEdits(),pickup=edits[0].pickup;
  await w.writer.writePage({observer:'A',page:0,records:[pickup]});
  const ready=await w.writer.seal({version:w.reader.manifest.version+1,observers:[{...w.plan,root:{...w.plan.root,count:1,pageCount:1,highWaterId:pickup.id}}]});
  w.stage.seal(ready);const publish=w.tx.prepareCommit();await ready.publishAndPin('published');publish();await w.reader.close();await store.unpin('published');
 };
 return {store,source,models,begin,birthDrop,seed};
}

describe('actual paged ModelWorld pickup drain authority (declared CPU backend)',()=>{
 it('authenticates owner, prefix and identity, then consumes a bounded immutable journal',async()=>{
  const f=await fixture('pickup-drain-auth'),w=await f.begin();try{
   f.birthDrop(w);const token=w.tx.preparePickupWindowDrain!();
   expect(token).toMatchObject({prefix:w.prefix,sequence:1,firstOrdinal:1});expect(token.transitions.map(t=>t.ordinal)).toEqual([1,2]);
   expect(Object.isFrozen(token)).toBe(true);expect(Object.isFrozen(token.transitions)).toBe(true);
   assertReceiverPickupWindowDrain(token,w.tx,w.prefix);
   expect(()=>assertReceiverPickupWindowDrain({...token},w.tx,w.prefix)).toThrow(/Unauthenticated/);
   expect(()=>assertReceiverPickupWindowDrain(token,{...w.tx} as ReceiverSceneTransaction,w.prefix)).toThrow(/Unauthenticated/);
   expect(()=>assertReceiverPickupWindowDrain(token,w.tx,{...w.prefix,callback:2})).toThrow(/prefix/);
   expect(()=>w.tx.preparePickupWindowDrain!()).toThrow(/unavailable/);
   expect(()=>w.tx.prepareCommit()).toThrow(/drain pending/);
   w.tx.finishPickupWindowDrain!(token);
   expect(()=>assertReceiverPickupWindowDrain(token,w.tx,w.prefix)).toThrow(/Unauthenticated/);
   expect(()=>w.tx.freezeModelTransitions!()).toThrow(/streamed/);
   const next=w.tx.preparePickupWindowDrain!();expect(next.sequence).toBe(2);expect(next.firstOrdinal).toBe(3);expect(next.transitions).toEqual([]);
   w.tx.finishPickupWindowDrain!(next);
  }finally{await w.rollback();await f.store.close();}
 });
 it('preserves global ordinals across same-epoch flushes and permits sealed model publication',async()=>{
  const f=await fixture('pickup-drain-ordinals'),w=await f.begin();try{
   w.tx.birth({actorId:'remote',targetFeet:actor.position,targetYaw:actor.yaw,callback:w.prefix.callback});
   const first=w.tx.preparePickupWindowDrain!();expect(first.transitions.map(t=>t.ordinal)).toEqual([1]);w.tx.finishPickupWindowDrain!(first);
   w.tx.beforeCallback('remote',actor);w.tx.detach('remote',actor,w.prefix.callback);
   const second=w.tx.preparePickupWindowDrain!();expect(second.firstOrdinal).toBe(2);expect(second.transitions.map(t=>t.ordinal)).toEqual([2,3]);w.tx.finishPickupWindowDrain!(second);
   const edits=w.stage.drainEdits();await w.writer.writePage({observer:'A',page:0,records:edits.map(e=>e.pickup)});
   const ready=await w.writer.seal({version:1,observers:[{...w.plan,root:{...w.plan.root,count:1,pageCount:1,highWaterId:1}}]});w.stage.seal(ready);
   const publish=w.tx.prepareCommit();await ready.publishAndPin('published');publish();
   expect(f.source.history.root.count).toBe(1);expect(f.models.freezeActorRegistry().actors).toEqual([]);
   await w.reader.close();await f.store.unpin('published');
  }finally{w.tx.rollback();await w.reader.close();await f.store.close();}
 });
 it('rejects an authentic token after its resident page epoch is released',async()=>{
  const f=await fixture('pickup-drain-epoch');await f.seed();const w=await f.begin();try{
   const window=await w.stage.loadWindow(0);expect(w.tx.readPickup(1).pickup!.id).toBe(1);
   const token=w.tx.preparePickupWindowDrain!();w.stage.releaseWindow(window);
   expect(()=>assertReceiverPickupWindowDrain(token,w.tx,w.prefix)).toThrow(/Stale/);
   expect(()=>w.tx.finishPickupWindowDrain!(token)).toThrow();expect(()=>w.tx.freezeModels()).toThrow();
  }finally{await w.rollback();await f.store.close();}
 });
 it('rejects changed journals and poisons a failed finish without exposing staged state',async()=>{
  const f=await fixture('pickup-drain-changed'),w=await f.begin();try{
   w.tx.birth({actorId:'remote',targetFeet:actor.position,targetYaw:actor.yaw,callback:w.prefix.callback});
   const token=w.tx.preparePickupWindowDrain!();w.tx.detach('remote',actor,w.prefix.callback);
   expect(()=>w.tx.finishPickupWindowDrain!(token)).toThrow(/changed/);expect(()=>w.tx.prepareCommit()).toThrow();
   expect(f.models.freezeModels()).toEqual([]);expect(f.source.history.root.count).toBe(0);
  }finally{await w.rollback();await f.store.close();}
 });
 it('rejects default inline drains and authentic tokens after rollback',async()=>{
  const inline=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:8,maxPickups:16}),tx=inline.begin();
  tx.advanceExternalCallback(1);expect(()=>tx.preparePickupWindowDrain!()).toThrow(/unavailable/);tx.rollback();
  const f=await fixture('pickup-drain-rollback'),w=await f.begin();try{
   const token=w.tx.preparePickupWindowDrain!();w.tx.rollback();expect(()=>assertReceiverPickupWindowDrain(token,w.tx,w.prefix)).toThrow(/closed/);
   expect(()=>assertReceiverPickupWindowDrain({prefix:w.prefix,sequence:1,firstOrdinal:1,transitions:[]} as ReceiverPickupWindowDrain,w.tx,w.prefix)).toThrow(/Unauthenticated/);
  }finally{await w.rollback();await f.store.close();}
 });
 it('rejects metadata-only transactions without affecting the published pickup root',async()=>{
  const f=await fixture('pickup-drain-metadata');await f.seed();
  const before=f.source.history,tx=f.models.begin(true);
  try{expect(()=>tx.preparePickupWindowDrain!()).toThrow(/unavailable/);expect(f.source.history).toBe(before);}
  finally{tx.rollback();await f.store.close();}
 });
 it('rechecks the journal after a history epoch validation callout',async()=>{
  const f=await fixture('pickup-drain-epoch-reentry'),w=await f.begin();
  try{
   const token=w.tx.preparePickupWindowDrain!(),validate=w.stage.validateEpoch.bind(w.stage);
   w.stage.validateEpoch=epoch=>{
    validate(epoch);
    w.tx.birth({actorId:'remote',targetFeet:actor.position,targetYaw:actor.yaw,callback:w.prefix.callback});
   };
   expect(()=>w.tx.finishPickupWindowDrain!(token)).toThrow(/changed/);
   expect(()=>w.tx.prepareCommit()).toThrow();expect(f.models.freezeModels()).toEqual([]);
  }finally{await w.rollback();await f.store.close();}
 });
});
