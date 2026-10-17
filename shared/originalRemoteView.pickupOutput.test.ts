import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {OriginalRemoteView} from './originalRemoteView';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverSceneTransaction} from './originalReceiverModelWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {ReceiverPickupOutputDescriptor} from './originalReceiverPickupOutput';
import {openOriginalPickupBatchStore,type PickupBatchPrepared} from '../src/originalPickupBatchStore';
import {openOriginalPickupBatchReader} from '../src/originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from '../src/originalPickupBatchModelHistory';

const pose=()=>({position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1});
const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'declared-CPU-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'declared-CPU-gun'}),
 sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>.7,
 nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};
const options={eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:4,maxTextChars:4096}};
const external={snapshotAt:(prefix:ReceiverScenePrefix)=>({prefix,models:[],missing:[],provenance:'declared-empty-CPU-query'})};
const snapshot={tick:1,sentAt:0,targets:[]};

async function fixture(transform?:(scene:ReceiverSceneTransaction)=>ReceiverSceneTransaction){
 const prefix0={kind:'callback' as const,sceneGeneration:4,callback:0},prefix={kind:'receipt' as const,sceneGeneration:4,callback:0,tick:1};
 const root={key:'initial',version:0,count:0,pageCount:0,highWaterId:0};
 const store=await openOriginalPickupBatchStore({databaseName:'remote-pickup-output',factory:new IDBFactory(),initial:{version:0,observers:[{observer:'A',lifeGeneration:1,prefix:prefix0,lastReceiptTick:0,root}]}});
 const source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root});
 const reader=await openOriginalPickupBatchReader(store,'reader'),old=reader.manifest.observers[0];
 const plan={...old,prefix,lastReceiptTick:1,root:{key:'next-root',version:1}};
 const writer=await store.beginBatch(reader.manifest,[plan]),stage=source.stage(reader,writer,prefix);
 const models=new OriginalReceiverModelWorld(backend,options,external,source);
 let raw:ReceiverSceneTransaction|undefined,ready:PickupBatchPrepared|undefined;
 const view=new OriginalRemoteView(0,{},'source-callback',{begin:()=>{raw=models.begin();return transform?transform(raw):raw;}});
 const finalize=async()=>{
  const token=raw!.preparePickupOutputTailDrain!();
  await writer.writeOutputChunk('A',{prefix:token.prefix,sequence:token.sequence,firstOrdinal:token.firstOrdinal,transitions:token.transitions,loadoutIntents:[]});
  raw!.finishPickupWindowDrain!(token);
  ready=await writer.seal({version:1,observers:[{...plan,root:{...plan.root,count:0,pageCount:0,highWaterId:0}}]});stage.seal(ready);
 };
 return {view,store,source,models,reader,writer,finalize,ready:()=>ready!,close:async()=>{raw?.rollback();await reader.close();await store.close();}};
}

describe('RemoteView sealed pickup output result',()=>{
 it('preserves real issuer identity and the final root registry without an inline journal',async()=>{
  const f=await fixture();try{
   const delivery=await f.view.prepareAsynchronousDelivery(snapshot,{receiptCallbacks:0,callbacks:0},0,f.finalize);
   expect(delivery.ok).toBe(true);if(!delivery.ok)throw Error('Expected prepared delivery');
   expect(delivery.result.pickupOutput).toBe(f.ready().outputDescriptors[0]);
   expect(delivery.result).not.toHaveProperty('modelTransitions');
   expect(delivery.result.modelState?.pickupHistory?.root.key).toBe('next-root');
   expect(f.source.history.root.key).toBe('initial');
   const pinned=await f.ready().publishAndPin('published');delivery.commit();
   f.store.assertOutputDescriptor(pinned,delivery.result.pickupOutput!);
   expect(f.source.history.root.key).toBe('next-root');await f.store.unpin('published');
  }finally{await f.close();}
 });
 it('retains inline journal shape when nothing was drained',async()=>{
  const models=new OriginalReceiverModelWorld(backend,options,external),view=new OriginalRemoteView(0,{},'source-callback',models);
  const delivery=await view.prepareAsynchronousDelivery(snapshot,{receiptCallbacks:0,callbacks:0},0);
  if(!delivery.ok)throw Error('Expected prepared delivery');
  expect(delivery.result.modelTransitions).toEqual([]);expect(delivery.result).not.toHaveProperty('pickupOutput');delivery.rollback();
 });
 it('keeps receipt-born actor transitions in the durable chunk and final registry',async()=>{
  const f=await fixture();try{
   const packet={...snapshot,targets:[{id:'soldier',position:{x:0,y:0,z:0},yaw:0,motionTime:0,alive:true,weapon:'rpg' as const}]};
   const delivery=await f.view.prepareAsynchronousDelivery(packet,{receiptCallbacks:0,callbacks:0},0,f.finalize);
   if(!delivery.ok)throw Error('Expected prepared delivery');
   expect(delivery.result.pickupOutput?.transitionCount).toBe(1);
   expect(delivery.result.modelState?.actors).toHaveLength(1);
   const pinned=await f.ready().publishAndPin('published');delivery.commit();
   const chunk=await f.store.claimOutputChunk(pinned,'A','models',1);
   expect(chunk.transitions.map(event=>event.kind)).toEqual(['birth']);
   expect(chunk.transitions[0].prefix).toEqual({kind:'receipt',sceneGeneration:4,callback:0,tick:1});
   await f.store.unpin('published');
  }finally{await f.close();}
 });
 it('rejects drained output before the real root is sealed',async()=>{
  const f=await fixture();try{
   await expect(f.view.prepareAsynchronousDelivery(snapshot,{receiptCallbacks:0,callbacks:0},0,async scene=>{
    const token=scene.preparePickupOutputTailDrain!();scene.finishPickupWindowDrain!(token);
   })).rejects.toThrow(/sealed/);
   expect(f.source.history.root.key).toBe('initial');
  }finally{await f.close();}
 });
 it.each(['observer','lifeGeneration','rootKey','rootVersion','chunkCount','transitionCount','loadoutCount','prefix'] as const)('rejects %s that disagrees with final registry or safe counters',async field=>{
  const f=await fixture(scene=>({...scene,freezePickupOutputDescriptor:()=>{
   const descriptor=scene.freezePickupOutputDescriptor!()!;
   const invalid:Record<string,unknown>={observer:'foreign',lifeGeneration:2,rootKey:'foreign-root',rootVersion:99,chunkCount:0,transitionCount:NaN,loadoutCount:-1,prefix:{...descriptor.prefix,callback:1}};
   return {...descriptor,[field]:invalid[field]} as ReceiverPickupOutputDescriptor;
  }}));try{
   await expect(f.view.prepareAsynchronousDelivery(snapshot,{receiptCallbacks:0,callbacks:0},0,f.finalize)).rejects.toThrow(/mismatch/);
   expect(f.source.history.root.key).toBe('initial');
  }finally{await f.close();}
 });
 it('requires a prepared registry for streamed publication',async()=>{
  const f=await fixture(scene=>({...scene,preparedActorRegistry:undefined}));try{
   await expect(f.view.prepareAsynchronousDelivery(snapshot,{receiptCallbacks:0,callbacks:0},0,f.finalize)).rejects.toThrow(/prepared actor registry/);
  }finally{await f.close();}
 });
 it('rejects a streamed descriptor on synchronous delivery',()=>{
  const models=new OriginalReceiverModelWorld(backend,options,external),view=new OriginalRemoteView(0,{},'source-callback',{begin:()=>{
   const scene=models.begin();return {...scene,freezePickupOutputDescriptor:()=>({} as ReceiverPickupOutputDescriptor)};
  }});
  expect(()=>view.prepareSynchronousDelivery(snapshot,{receiptCallbacks:0,callbacks:0},0)).toThrow(/asynchronous delivery/);
  expect(view.freeze()).toEqual([]);
 });
});
