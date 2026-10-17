import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchPrepared} from './originalPickupBatchStore';
import {openOriginalPickupBatchReader} from './originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverPickupWindowDrain} from '../shared/originalReceiverModelWorld';

const pose=()=>({position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1});
const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'declared-CPU-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'declared-CPU-gun'}),
 sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>.7,
 nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};

async function fixture(name:string){
 const prefix0={kind:'callback' as const,sceneGeneration:4,callback:0},root={key:'initial',version:0,count:0,pageCount:0,highWaterId:0};
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial:{version:0,observers:[{observer:'A',lifeGeneration:1,prefix:prefix0,lastReceiptTick:0,root}]}});
 const reader=await openOriginalPickupBatchReader(store,'reader'),entry=reader.manifest.observers[0],prefix={...prefix0,callback:1};
 const plan={...entry,prefix,root:{key:'next',version:1}},writer=await store.beginBatch(reader.manifest,[plan]);
 const source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root});
 const models=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:8,maxTextChars:4096}},
  {snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-CPU-query'})},source);
 const stage=source.stage(reader,writer,prefix),tx=models.begin();tx.advanceExternalCallback(1);
 const birth=(id='actor')=>tx.birth({actorId:id,targetFeet:{x:0,y:10,z:7},targetYaw:.2,callback:1});
 const write=(token:ReceiverPickupWindowDrain)=>writer.writeOutputChunk('A',{...token,loadoutIntents:[]});
 const drain=async()=>{const token=tx.preparePickupWindowDrain!();await write(token);tx.finishPickupWindowDrain!(token);return token;};
 let ready:PickupBatchPrepared|undefined;
 const seal=async()=>{ready=await writer.seal({version:1,observers:[{...plan,root:{...plan.root,count:0,pageCount:0,highWaterId:0}}]});stage.seal(ready);return ready;};
 const close=async()=>{tx.rollback();await reader.close();await store.close();};
 return {store,reader,writer,source,models,stage,tx,prefix,birth,write,drain,seal,close};
}

describe('authentic sealed pickup output preparation (declared CPU lifecycle)',()=>{
 it('leaves ordinary undrained journals on the inline path',async()=>{
  const f=await fixture('prepared-output-inline');try{
   f.birth();expect(f.tx.freezePickupOutputDescriptor!()).toBeUndefined();
   expect(f.tx.freezeModelTransitions!()).toHaveLength(1);
  }finally{await f.close();}
 });

 it('requires a real ready root after an acknowledged durable drain',async()=>{
  const f=await fixture('prepared-output-unsealed');try{
   f.birth();await f.drain();expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();
   expect(f.source.history.root.key).toBe('initial');expect((await f.store.readManifest()).version).toBe(0);
  }finally{await f.close();}
 });

 it('returns the exact issued descriptor before CAS and adopts only after CAS',async()=>{
  const f=await fixture('prepared-output-ready');try{
   f.birth();const token=await f.drain(),ready=await f.seal(),descriptor=f.tx.freezePickupOutputDescriptor!();
   expect(descriptor).toBe(ready.outputDescriptors[0]);expect(Object.isFrozen(descriptor)).toBe(true);
   expect(descriptor).toMatchObject({observer:'A',lifeGeneration:1,prefix:f.prefix,rootKey:'next',rootVersion:1,chunkCount:1,transitionCount:token.transitions.length,loadoutCount:0});
   expect(f.tx.freezePickupOutputDescriptor!()).toBe(descriptor);
   expect(()=>f.tx.freezeModelTransitions!()).toThrow(/streamed/);
   expect(f.source.history.root.key).toBe('initial');expect(f.models.freezeModels()).toEqual([]);
   const publish=f.tx.prepareCommit(),snapshot=await ready.publishAndPin('published');
   expect(f.source.history.root.key).toBe('initial');publish();
   expect(f.source.history.root.key).toBe('next');f.store.assertOutputDescriptor(snapshot,descriptor!);
   expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();await f.store.unpin('published');
  }finally{await f.close();}
 });

 it('rejects a still outstanding permit after the real root seals',async()=>{
  const f=await fixture('prepared-output-pending');try{
   f.birth();await f.drain();const pending=f.tx.preparePickupWindowDrain!();await f.write(pending);await f.seal();
   expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();
  }finally{await f.close();}
 });

 it('rejects actor events created after the last acknowledged chunk',async()=>{
  const f=await fixture('prepared-output-tail');try{
   await f.drain();f.birth();await f.seal();expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();
   expect(f.source.history.root.key).toBe('initial');
  }finally{await f.close();}
 });

 it('rejects source callout reentry even when it returns the exact issued descriptor',async()=>{
  const f=await fixture('prepared-output-callout-reentry');try{
   await f.drain();const ready=await f.seal(),prepareOutput=f.stage.prepareOutput.bind(f.stage);
   const spy=vi.spyOn(f.stage,'prepareOutput').mockImplementation(()=>{const descriptor=prepareOutput();f.birth();return descriptor;});
   expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow(/fully drained/);
   expect(spy).toHaveReturnedWith(ready.outputDescriptors[0]);
   expect(()=>f.tx.freezeActorRegistry()).toThrow(/closed/);expect(()=>f.tx.prepareCommit()).toThrow(/closed/);
   expect(f.source.history.root.key).toBe('initial');expect((await f.store.readManifest()).version).toBe(0);
  }finally{await f.close();}
 });

 it('revalidates a successfully frozen proof before preparing publication',async()=>{
  const f=await fixture('prepared-output-proof-tail');try{
   await f.drain();const ready=await f.seal();expect(f.tx.freezePickupOutputDescriptor!()).toBe(ready.outputDescriptors[0]);
   f.birth('later');expect(()=>f.tx.prepareCommit()).toThrow(/fully drained/);
   expect(()=>f.tx.freezeActorRegistry()).toThrow(/closed/);
   expect(f.source.history.root.key).toBe('initial');expect((await f.store.readManifest()).version).toBe(0);
  }finally{await f.close();}
 });

 it('rejects acknowledged drains that were never stored',async()=>{
  const f=await fixture('prepared-output-missing');try{
   f.birth();const token=f.tx.preparePickupWindowDrain!();f.tx.finishPickupWindowDrain!(token);
   const ready=await f.seal();expect(ready.outputDescriptors).toEqual([]);
   expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();
  }finally{await f.close();}
 });

 it('rejects an authentic descriptor with fewer transitions than the Model journal',async()=>{
  const f=await fixture('prepared-output-transition-count');try{
   f.birth();const token=f.tx.preparePickupWindowDrain!();
   await f.writer.writeOutputChunk('A',{...token,transitions:[],loadoutIntents:[]});f.tx.finishPickupWindowDrain!(token);
   const ready=await f.seal();expect(ready.outputDescriptors[0].transitionCount).toBe(0);
   expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();
  }finally{await f.close();}
 });

 it('rejects an authentic descriptor with extra chunks not acknowledged by Model',async()=>{
  const f=await fixture('prepared-output-chunk-count');try{
   const token=await f.drain();await f.writer.writeOutputChunk('A',{prefix:f.prefix,sequence:2,firstOrdinal:token.firstOrdinal,transitions:[],loadoutIntents:[]});
   const ready=await f.seal();expect(ready.outputDescriptors[0].chunkCount).toBe(2);
   expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();
  }finally{await f.close();}
 });

 it('invalidates prepared output when its writer aborts',async()=>{
  const f=await fixture('prepared-output-aborted');try{
   await f.drain();const ready=await f.seal();await ready.abort();expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();
  }finally{await f.close();}
 });

 it('invalidates prepared output when its reader closes',async()=>{
  const f=await fixture('prepared-output-reader-closed');try{
   await f.drain();await f.seal();await f.reader.close();expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();
  }finally{await f.close();}
 });

 it('rejects a real foreign preparation with identical root and output metadata',async()=>{
  const f=await fixture('prepared-output-owner'),other=await fixture('prepared-output-foreign');try{
   await f.drain();await other.drain();const foreign=await other.seal();
   expect(()=>f.stage.seal(foreign)).toThrow();expect(()=>f.tx.freezePickupOutputDescriptor!()).toThrow();
   expect(f.source.history.root.key).toBe('initial');
  }finally{await f.close();await other.close();}
 });
});
