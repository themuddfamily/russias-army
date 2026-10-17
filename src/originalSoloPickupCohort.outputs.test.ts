import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloPickupCohort} from './originalSoloPickupCohort';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';
import {openOriginalPickupBatchStore,type PickupBatchWriter} from './originalPickupBatchStore';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverSceneTransaction} from '../shared/originalReceiverModelWorld';
import type {OriginalSoloCurrentCohortPlan,OriginalSoloObserver} from '../shared/originalSoloObserverWorld';
import type {ReceiverPickupOutputChunk} from '../shared/originalReceiverPickupOutput';
import type {ReceiverCurrentPickupWindowFlush} from '../shared/originalReceiverCurrentEnvironment';

const pose=()=>({position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1});
const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'declared-CPU-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'declared-CPU-gun'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};
async function fixture(name:string,receipt=false){
 const root={key:'initial',version:0,count:0,pageCount:0,highWaterId:0},prefix0={kind:'callback' as const,sceneGeneration:4,callback:0};
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial:{version:0,observers:[{observer:'A',lifeGeneration:1,prefix:prefix0,lastReceiptTick:-1,root}]}});
 const source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root});
 const models=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:2,maxTextChars:4096}},{snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-CPU-query'})},source);
 // The cohort uses only the captured observer identity, not a synthetic world.
 const observer={id:'A',lifeGeneration:1} as OriginalSoloObserver;
 const receiptPrefix={kind:'receipt' as const,sceneGeneration:4,callback:0,tick:0};
 const plan:OriginalSoloCurrentCohortPlan={observer,prefix:receipt?receiptPrefix:{...prefix0,callback:1},receiptPrefix,receiptTick:0};
 const cohort=new OriginalSoloPickupCohort({store,sources:new Map([['A',source]]),key:'output-cohort',streamOutputs:true}),cancel=new AbortController();
 await cohort.begin([plan],cancel.signal);const tx=models.begin();
 if(receipt)tx.applyExternalReceipt(0,0);else tx.advanceExternalCallback(1);
 const flush=async(write:(chunk:ReceiverPickupOutputChunk)=>Promise<void>,tail=false)=>{
  const token=tail?tx.preparePickupOutputTailDrain!():tx.preparePickupWindowDrain!();
  await write({...token,loadoutIntents:[]});tx.finishPickupWindowDrain!(token);
 };
 const scene:ReceiverSceneTransaction={...tx,flushPickupOutputTail:write=>flush(write,true)};
 const windowFlush:ReceiverCurrentPickupWindowFlush=write=>flush(async chunk=>{
  if(chunk.prefix.kind!=='callback')throw Error('Fixture callback flush prefix mismatch');
  await write({...chunk,prefix:chunk.prefix});
 });
 const close=async()=>{tx.rollback();await cohort.abort();await store.close();};
 return {store,source,tx,scene,plan,cohort,cancel,flush,windowFlush,close};
}

describe('production cohort output spooling with real CPU ModelWorld and IndexedDB',()=>{
 it('retries the issued tuple when the bounded preread fails before any claim',async()=>{
  const f=await fixture('cohort-output-preread-retry');try{
   await f.cohort.replayComplete(f.plan,f.scene);await f.cohort.seal();
   const descriptor=f.tx.freezePickupOutputDescriptor!()!,publish=f.tx.prepareCommit();await f.cohort.publish();publish();
   const error=Error('bounded preread unavailable'),read=vi.spyOn(f.store,'readOutputChunk').mockRejectedValueOnce(error),claim=vi.spyOn(f.store,'claimOutputChunk');
   await expect(f.cohort.claimPickupOutput(f.plan,descriptor,'models',1)).rejects.toBe(error);expect(claim).not.toHaveBeenCalled();
   expect((await f.cohort.retryPickupOutput(f.plan,descriptor,'models',1)).sequence).toBe(1);
   expect(read).toHaveBeenCalledTimes(2);expect(claim).toHaveBeenCalledTimes(1);await f.cohort.finish();
  }finally{vi.restoreAllMocks();await f.close();}
 });
 for(const consumed of [false,true])it(`retains one exact bounded claim after ${consumed?'consumption and failed reconciliation':'an unconsumed storage failure'}`,async()=>{
  const f=await fixture(`cohort-output-retry-${consumed}`);try{
   f.tx.birth({actorId:'actor',targetFeet:{x:0,y:10,z:0},targetYaw:0,callback:1});
   await f.cohort.replayComplete(f.plan,f.scene);await f.cohort.seal();
   const descriptor=f.tx.freezePickupOutputDescriptor!()!,publish=f.tx.prepareCommit();await f.cohort.publish();publish();
   const claim=f.store.claimOutputChunk.bind(f.store),cursor=f.store.readOutputClaimCursor.bind(f.store);
   let exact:ReceiverPickupOutputChunk|undefined,cursorCalls=0;
   const error=Error('uncertain claim result'),readError=Error('cursor unavailable');
   const claimSpy=vi.spyOn(f.store,'claimOutputChunk').mockImplementationOnce(async(...args)=>{
    if(consumed)exact=await claim(...args);throw error;
   });
   const cursorSpy=vi.spyOn(f.store,'readOutputClaimCursor').mockImplementation(async(...args)=>{
    cursorCalls++;if(consumed&&cursorCalls===2)throw readError;return cursor(...args);
   });
   const failure=await f.cohort.claimPickupOutput(f.plan,descriptor,'models',1).catch(error=>error);
   if(consumed){expect(failure).toBeInstanceOf(AggregateError);expect(failure.errors).toEqual([error,readError]);}
   else expect(failure).toBe(error);
   expect(()=>f.cohort.retryPickupOutput(f.plan,descriptor,'fades',1)).toThrow(/tuple/);
   await expect(f.cohort.finish()).rejects.toThrow(/requires retry/);
   const recovered=await f.cohort.retryPickupOutput(f.plan,descriptor,'models',1);
   expect(recovered.transitions[0].kind).toBe('birth');if(exact)expect(recovered).toEqual(exact);
   expect(claimSpy).toHaveBeenCalledTimes(consumed?1:2);
   expect(()=>f.cohort.retryPickupOutput(f.plan,descriptor,'models',1)).toThrow(/unavailable/);
   await expect(f.cohort.claimPickupOutput(f.plan,descriptor,'models',1)).rejects.toThrow(/replay/);
   await f.cohort.finish();claimSpy.mockRestore();cursorSpy.mockRestore();
  }finally{vi.restoreAllMocks();await f.close();}
 });
 it('reconciles a consumed claim result before disclosing the preread once',async()=>{
  const f=await fixture('cohort-output-consumed-result');try{
   await f.cohort.replayComplete(f.plan,f.scene);await f.cohort.seal();
   const descriptor=f.tx.freezePickupOutputDescriptor!()!,publish=f.tx.prepareCommit();await f.cohort.publish();publish();
   const claim=f.store.claimOutputChunk.bind(f.store);
   const spy=vi.spyOn(f.store,'claimOutputChunk').mockImplementationOnce(async(...args)=>{await claim(...args);throw Error('result lost after consumption');});
   expect((await f.cohort.claimPickupOutput(f.plan,descriptor,'models',1)).sequence).toBe(1);
   expect(spy).toHaveBeenCalledTimes(1);
   await expect(f.cohort.claimPickupOutput(f.plan,descriptor,'models',1)).rejects.toThrow(/replay/);
   await f.cohort.finish();spy.mockRestore();
  }finally{vi.restoreAllMocks();await f.close();}
 });
 it('seals authentic model output and holds published claims until finish',async()=>{
  const f=await fixture('cohort-output-auth');try{
   await f.cohort.pickupContinuationAt('A')(f.plan.prefix as Extract<typeof f.plan.prefix,{kind:'callback'}>,()=>false,f.windowFlush);
   f.tx.birth({actorId:'actor',targetFeet:{x:0,y:10,z:0},targetYaw:0,callback:1});
   await f.cohort.replayComplete(f.plan,f.scene);await f.cohort.seal();
   const descriptor=f.tx.freezePickupOutputDescriptor!()!;expect(descriptor).toMatchObject({chunkCount:2,transitionCount:1,loadoutCount:0});
   f.cohort.validatePickupOutput(f.plan,descriptor);
   expect(()=>f.cohort.validatePickupOutput({...f.plan},descriptor)).toThrow(/plan/);
   expect(()=>f.cohort.validatePickupOutput(f.plan,{...descriptor})).toThrow(/Unauthenticated/);
   expect(()=>f.cohort.claimPickupOutput(f.plan,descriptor,'models',1)).toThrow(/published/);
   const publish=f.tx.prepareCommit();await f.cohort.publish();publish();
   for(const channel of ['models','fades','loadout'] as const){
    expect((await f.cohort.claimPickupOutput(f.plan,descriptor,channel,1)).transitions).toEqual([]);
    expect((await f.cohort.claimPickupOutput(f.plan,descriptor,channel,2)).transitions[0].kind).toBe('birth');
    await expect(f.cohort.claimPickupOutput(f.plan,descriptor,channel,2)).rejects.toThrow(/replay/);
   }
   await f.cohort.finish();expect(()=>f.cohort.claimPickupOutput(f.plan,descriptor,'models',2)).toThrow(/pinned/);
  }finally{await f.close();}
 });
 it('spools a receipt-only tail without admitting callback collection',async()=>{
  const f=await fixture('cohort-output-receipt',true);try{
   await f.cohort.replayComplete(f.plan,f.scene);await f.cohort.seal();
   const descriptor=f.tx.freezePickupOutputDescriptor!()!;expect(descriptor).toMatchObject({prefix:f.plan.prefix,chunkCount:1,transitionCount:0});
   f.cohort.validatePickupOutput(f.plan,descriptor);const publish=f.tx.prepareCommit();await f.cohort.publish();publish();
   expect((await f.cohort.claimPickupOutput(f.plan,descriptor,'models',1)).prefix).toEqual(f.plan.prefix);await f.cohort.finish();
  }finally{await f.close();}
 });
 it('requires the owned CURRENT flush in streamed callback continuation',async()=>{
  const f=await fixture('cohort-output-missing-flush');try{
   await expect(f.cohort.pickupContinuationAt('A')(f.plan.prefix as Extract<typeof f.plan.prefix,{kind:'callback'}>,()=>false)).rejects.toThrow(/flush unavailable/);
   await f.cohort.abort();expect((await f.store.readManifest()).version).toBe(0);
  }finally{await f.close();}
 });
 it('cancels after output persistence without publishing or acknowledging a drain',async()=>{
  const f=await fixture('cohort-output-cancel');
  const port=f.store as unknown as {writeWriterOutput(writer:PickupBatchWriter,observer:string,chunk:ReceiverPickupOutputChunk):Promise<void>};
  const write=port.writeWriterOutput.bind(port),spy=vi.spyOn(port,'writeWriterOutput').mockImplementation(async(...args)=>{await write(...args);f.cancel.abort(Error('declared cancellation'));});
  try{
   await expect(f.cohort.pickupContinuationAt('A')(f.plan.prefix as Extract<typeof f.plan.prefix,{kind:'callback'}>,()=>false,f.windowFlush)).rejects.toThrow(/cancellation/);
   await f.cohort.abort();expect((await f.store.readManifest()).version).toBe(0);expect(f.source.history.root.key).toBe('initial');
  }finally{spy.mockRestore();await f.close();}
 });
 it('drains a failed output write through abort and leaves CURRENT unchanged',async()=>{
  const f=await fixture('cohort-output-write-failure');
  const port=f.store as unknown as {writeWriterOutput(writer:PickupBatchWriter,observer:string,chunk:ReceiverPickupOutputChunk):Promise<void>};
  const spy=vi.spyOn(port,'writeWriterOutput').mockRejectedValueOnce(Error('declared output write failure'));
  try{
   await expect(f.cohort.pickupContinuationAt('A')(f.plan.prefix as Extract<typeof f.plan.prefix,{kind:'callback'}>,()=>false,f.windowFlush)).rejects.toThrow(/write failure/);
   await f.cohort.abort();expect((await f.store.readManifest()).version).toBe(0);expect(f.source.history.root.key).toBe('initial');
  }finally{spy.mockRestore();await f.close();}
 });
});
