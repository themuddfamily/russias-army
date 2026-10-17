import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {OriginalReceiverSceneController,type ReceiverSceneEnvironment,type ReceiverSceneEnvironmentTransaction} from './originalReceiverSceneController';
import {assertReceiverPickupOutputDrain,type ReceiverModelBackend,type ReceiverSceneTransaction} from './originalReceiverModelWorld';
import type {OriginalReceiverTransientBackend} from './originalReceiverTransientWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import {openOriginalPickupBatchStore} from '../src/originalPickupBatchStore';
import {openOriginalPickupBatchReader} from '../src/originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from '../src/originalPickupBatchModelHistory';

const pose={position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1};
const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-CPU-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-CPU-gun'}),
 sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>0,
 nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};
const fxBackend:OriginalReceiverTransientBackend={clonePlane:()=>({pose,geometryProvenance:'declared-CPU-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-CPU-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q};
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}

async function fixture(name:string){
 const initialPrefix={kind:'callback' as const,sceneGeneration:4,callback:0},prefix={kind:'receipt' as const,sceneGeneration:4,callback:0,tick:0};
 const root={key:'initial',version:0,count:0,pageCount:0,highWaterId:0};
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial:{version:0,observers:[{observer:'A',lifeGeneration:1,prefix:initialPrefix,lastReceiptTick:-1,root}]}});
 const reader=await openOriginalPickupBatchReader(store,'reader'),plan={...reader.manifest.observers[0],prefix,lastReceiptTick:0,root:{key:'next',version:1}},writer=await store.beginBatch(reader.manifest,[plan]);
 const source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root}),history=source.stage(reader,writer,prefix);
 let raw!:ReceiverSceneTransaction,environmentStage!:ReceiverSceneEnvironmentTransaction,current:ReceiverScenePrefix|undefined;
 const environment:ReceiverSceneEnvironment={begin:(_allocator,models)=>{
  raw=models as ReceiverSceneTransaction;
  environmentStage={advanceCallback:()=>[],applyReceipt:()=>[],goodyContext:()=>null,stageEffects:()=>{},
   snapshotAt:p=>{current=p;return {prefix:p,models:[],missing:[],provenance:'declared-empty-CPU-environment'};},
   flushPickupOutputTail:async write=>{const token=raw.preparePickupOutputTailDrain!();await write(Object.freeze({...token,loadoutIntents:Object.freeze([])}));raw.finishPickupWindowDrain!(token);},
   prepareCommit:()=>()=>{},rollback:()=>{},
  };return environmentStage;
 }};
 const controller=new OriginalReceiverSceneController(backend,fxBackend,environment,{model:{sceneGeneration:4,sourceScale:.02,eyeHeight:1,goodyBspWorld:2,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:8,maxTextChars:4096}},transient:{maxModels:8,maxActors:8,maxShaders:8},maxEffects:8},source);
 const tx=controller.begin();tx.applyExternalReceipt(0,0);tx.birth({actorId:'actor',targetFeet:{x:0,y:10,z:7},targetYaw:0,callback:0});
 const close=async()=>{tx.rollback();history.rollback();await reader.close();await store.close();};
 return {store,reader,writer,source,history,controller,tx,prefix,raw,environmentStage,current,close};
}

describe('joint controller tail delegation (actual paged Model; declared environment)',()=>{
 it('persists a receipt tail under the exact inner Model issuer and forwards its real descriptor',async()=>{
  const f=await fixture('controller-tail-issued');try{
   await f.tx.flushPickupOutputTail!(async chunk=>{
    expect(chunk.prefix).toEqual(f.prefix);expect(chunk.transitions.map(event=>event.kind)).toEqual(['birth']);
    expect(f.raw).not.toBe(f.tx);await f.writer.writeOutputChunk('A',chunk);
   });
   const ready=await f.writer.seal({version:1,observers:[{observer:'A',lifeGeneration:1,prefix:f.prefix,lastReceiptTick:0,root:{key:'next',version:1,count:0,pageCount:0,highWaterId:0}}]});f.history.seal(ready);
   expect(f.tx.freezePickupOutputDescriptor!()).toBe(ready.outputDescriptors[0]);
   const publish=f.tx.prepareCommit(),snapshot=await ready.publishAndPin('published');publish();
   f.store.assertOutputDescriptor(snapshot,ready.outputDescriptors[0]);expect(f.source.history.root.key).toBe('next');await f.store.unpin('published');
  }finally{await f.close();}
 });
 it('rejects treating the public controller wrapper as the Model permit issuer',async()=>{
  const f=await fixture('controller-tail-foreign-issuer');try{
   const token=f.raw.preparePickupOutputTailDrain!();
   expect(()=>assertReceiverPickupOutputDrain(token,f.tx,f.prefix)).toThrow(/Unauthenticated/);
   assertReceiverPickupOutputDrain(token,f.raw,f.prefix);
  }finally{await f.close();}
 });
 it('poisons the delegated operation after caught public read reentry',async()=>{
  const f=await fixture('controller-tail-read-reentry');try{
   await expect(f.tx.flushPickupOutputTail!(async()=>{expect(()=>f.tx.freezePrefix()).toThrow(/awaiting/);})).rejects.toThrow(/rejected/);
   expect(()=>f.tx.prepareCommit()).toThrow();expect(f.source.history.root.key).toBe('initial');
  }finally{await f.close();}
 });
 it('holds controller admission until a cancelled writer drains',async()=>{
  const f=await fixture('controller-tail-cancel'),entered=deferred(),gate=deferred();let work:Promise<void>|undefined;
  try{
   work=f.tx.flushPickupOutputTail!(async()=>{entered.resolve();await gate.promise;});const rejected=expect(work).rejects.toThrow();
   await entered.promise;f.tx.rollback();expect(()=>f.controller.begin()).toThrow(/active/);gate.resolve();await rejected;
   expect(f.source.history.root.key).toBe('initial');
  }finally{gate.resolve();await work?.catch(()=>{});await f.close();}
 });
});
