import type {OriginalSoloCurrentCohort,OriginalSoloCurrentCohortPlan} from '../shared/originalSoloObserverWorld';
import type {ReceiverSceneTransaction,ReceiverPickup} from '../shared/originalReceiverModelWorld';
import type {ReceiverCurrentPickupWindowFlush} from '../shared/originalReceiverCurrentEnvironment';
import type {ReceiverPickupOutputChunk,ReceiverPickupOutputDescriptor} from '../shared/originalReceiverPickupOutput';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import {OriginalPickupBatchModelHistory,type OriginalPickupBatchModelStage} from './originalPickupBatchModelHistory';
import {openOriginalPickupBatchReader,type OriginalPickupBatchReader} from './originalPickupBatchWindow';
import type {IndexedDBOriginalPickupBatchStore,PickupBatchWriter,PickupBatchPrepared,PickupBatchManifest,PickupBatchObserverPlan,PickupBatchOutputChannel} from './originalPickupBatchStore';

interface Entry {
 readonly plan:OriginalSoloCurrentCohortPlan;
 readonly stage:OriginalPickupBatchModelStage;
 readonly id:string;readonly life:number;readonly prefix:ReceiverScenePrefix;readonly tick:number;
 readonly root:Readonly<{key:string;version:number}>;
 scanned:boolean;replayed:boolean;count:number;pages:number;highWaterId:number;
}
interface PendingOutputClaim {
 readonly plan:OriginalSoloCurrentCohortPlan;readonly descriptor:ReceiverPickupOutputDescriptor;
 readonly channel:PickupBatchOutputChannel;readonly sequence:number;
 chunk?:ReceiverPickupOutputChunk;attempted:boolean;
}

/** One-shot production storage participant. The population owns model adoption;
 * this participant owns one reader, one writer and one sixteen-row output page.
 * Optional output spooling shares that writer and root CAS without raising
 * CURRENT command or journal limits. The default Game path opts in separately. */
export class OriginalSoloPickupCohort implements OriginalSoloCurrentCohort {
 private readonly store:IndexedDBOriginalPickupBatchStore;
 private readonly sources:ReadonlyMap<string,OriginalPickupBatchModelHistory>;
 private readonly key:string;
 private reader?:OriginalPickupBatchReader;
 private writer?:PickupBatchWriter;
 private prepared?:PickupBatchPrepared;
 private readonly entries=new Map<string,Entry>();
 private buffer:Readonly<ReceiverPickup>[]=[];
 private owner?:Entry;
 private signal?:AbortSignal;
 private work?:Promise<void>;
 private aborting?:Promise<void>;
 private begun=false;
 private aborted=false;
 private attempted=false;
 private stagingCleaned=false;
 private published=false;
 private publishedSnapshot?:PickupBatchManifest;
 private readonly streamOutputs:boolean;
 private pendingOutputClaim?:PendingOutputClaim;
 private outputClaimWork?:Promise<ReceiverPickupOutputChunk>;
 constructor(options:{store:IndexedDBOriginalPickupBatchStore;sources:ReadonlyMap<string,OriginalPickupBatchModelHistory>;key:string;streamOutputs?:boolean}) {
  const {store,sources,key}=options;
  if(!store||!sources||sources.size>64||!key||key.length>60||!/^\w[\w-]*$/.test(key))throw Error('Invalid Solo pickup cohort options');
  this.store=store;this.sources=new Map(sources);this.key=key;this.streamOutputs=options.streamOutputs===true;
 }
 private check():void {if(this.aborted||this.signal?.aborted)throw this.signal?.reason??Error('Solo pickup cohort cancelled');}
 private run(action:()=>Promise<void>):Promise<void> {
  this.check();if(this.work)throw Error('Solo pickup cohort operation pending');
  const work=action();this.work=work;
  void work.then(()=>{if(this.work===work)this.work=undefined;},()=>{if(this.work===work)this.work=undefined;});return work;
 }
 begin(plans:readonly OriginalSoloCurrentCohortPlan[],signal:AbortSignal):Promise<void> {
  if(this.begun)throw Error('Solo pickup cohort already begun');this.begun=true;this.signal=signal;
  // Capture the issued plans before storage yields. The observer itself is an
  // identity operand; mutable observer clocks are not read after this boundary.
  const captured=plans.map(plan=>({plan,id:plan.observer.id,life:plan.observer.lifeGeneration,
   prefix:Object.freeze({...plan.prefix}),receiptPrefix:Object.freeze({...plan.receiptPrefix}),tick:plan.receiptTick}));
  if(captured.length>64||new Set(captured.map(p=>p.id)).size!==captured.length)throw Error('Invalid Solo pickup cohort plans');
  return this.run(async()=>{
   this.reader=await openOriginalPickupBatchReader(this.store,`${this.key}-reader`);this.check();
   const targets=new Map(captured.map(p=>[p.id,p]));
   for(const p of captured){const old=this.reader.manifest.observers.find(row=>row.observer===p.id);
    if(!old||old.lifeGeneration!==p.life||!this.sources.has(p.id))throw Error('Solo pickup cohort life mismatch');
    validateReceiverScenePrefix(p.prefix);validateReceiverScenePrefix(p.receiptPrefix);
    if(p.receiptPrefix.kind!=='receipt'||p.tick!==p.receiptPrefix.tick||p.tick!==old.lastReceiptTick+1
     ||p.receiptPrefix.sceneGeneration!==old.prefix.sceneGeneration||p.receiptPrefix.callback!==old.prefix.callback
     ||p.prefix.kind==='receipt'&&!sameReceiverScenePrefix(p.prefix,p.receiptPrefix))throw Error('Solo pickup cohort receipt mismatch');
   }
   const planned:PickupBatchObserverPlan[]=this.reader.manifest.observers.map((old,index)=>{
    const target=targets.get(old.observer);return target?{observer:old.observer,lifeGeneration:old.lifeGeneration,
     prefix:target.prefix,lastReceiptTick:target.tick,...(target.prefix.kind==='callback'?{receiptPrefix:target.receiptPrefix}:{}),
     root:{key:`${this.key}-root-${index}`,version:old.root.version+1}}:old;
   });
   this.writer=await this.store.beginBatch(this.reader.manifest,planned);this.check();
   for(const p of captured){const stage=this.sources.get(p.id)!.stage(this.reader,this.writer,p.prefix),root=planned.find(row=>row.observer===p.id)!.root;
    this.entries.set(p.id,{plan:p.plan,id:p.id,life:p.life,prefix:p.prefix,tick:p.tick,stage,root,scanned:false,replayed:false,count:0,pages:0,highWaterId:stage.baseHistory.root.highWaterId});}
  });
 }
 /** Captured per-life by the scene factory. Only the issued callback may scan. */
 pickupContinuationAt(observer:string):(prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>,collect:(id:number)=>boolean,flush?:ReceiverCurrentPickupWindowFlush)=>Promise<void> {
  return (prefix,collect,flush)=>this.run(async()=>{
   const entry=this.entries.get(observer);
   if(!entry||entry.prefix.kind!=='callback'||entry.scanned||entry.replayed||this.prepared||!sameReceiverScenePrefix(prefix,entry.prefix)||typeof collect!=='function')throw Error('Solo pickup continuation mismatch');
   if(this.streamOutputs&&typeof flush!=='function')throw Error('Solo pickup output flush unavailable');
   await this.scan(entry,collect,this.streamOutputs?flush:undefined);
  });
 }
 private async writeOutput(entry:Entry,chunk:ReceiverPickupOutputChunk):Promise<void> {
  this.check();await this.writer!.writeOutputChunk(entry.id,chunk);this.check();
 }
 private async scan(entry:Entry,collect:(id:number)=>boolean,flush?:ReceiverCurrentPickupWindowFlush):Promise<void> {
   this.claim(entry);
   if(flush)await flush(chunk=>this.writeOutput(entry,chunk));
   for(let page=0;page<entry.stage.baseHistory.root.pageCount;page++){
    this.check();const window=await entry.stage.loadWindow(page);this.check();
    // Both collect and readPickup validate the actual ModelWorld catalog when
    // called through CURRENT. The stage is the authoritative removal view.
    let collected=0;
    for(const row of this.reader!.records(window)){
     this.check();collect(row.id);const survivor=entry.stage.readPickup(row.id);
     const edits=entry.stage.drainEdits();
     if(edits.some(edit=>edit.kind!=='remove'||edit.pickup.id!==row.id)||edits.length!==(survivor?0:1))throw Error('Solo pickup collection edit mismatch');
     if(survivor)await this.append(entry,survivor);
     if(flush&&++collected===2){await flush(chunk=>this.writeOutput(entry,chunk));collected=0;}
    }
    if(flush)await flush(chunk=>this.writeOutput(entry,chunk));
    entry.stage.releaseWindow(window);
   }
   entry.scanned=true;
 }
 private claim(entry:Entry):void {
  if(this.owner&&this.owner!==entry)throw Error('Solo pickup output belongs to an earlier observer');this.owner=entry;
 }
 private async append(entry:Entry,row:Readonly<ReceiverPickup>):Promise<void> {
  this.claim(entry);if(this.buffer.length>=16)throw Error('Solo pickup output buffer overflow');
  this.buffer.push(row);entry.count++;if(this.buffer.length===16)await this.flush(entry);
 }
 private async flush(entry:Entry):Promise<void> {
  this.check();if(!this.buffer.length)return;
  await this.writer!.writePage({observer:entry.id,page:entry.pages,records:this.buffer});this.check();
  this.buffer=[];entry.pages++;
 }
 replayComplete(plan:OriginalSoloCurrentCohortPlan,_scene:ReceiverSceneTransaction):Promise<void> {
  return this.run(async()=>{
   const entry=[...this.entries.values()].find(value=>value.plan===plan);
   if(!entry||entry.plan!==plan||entry.replayed||this.prepared)throw Error('Solo pickup replay mismatch');
   const edits=entry.stage.drainEdits();
   if(edits.some(edit=>edit.kind!=='append')||entry.prefix.kind==='receipt'&&edits.length)throw Error('Solo pickup replay-tail edit mismatch');
   if(!entry.scanned)await this.scan(entry,id=>{_scene.readPickup(id);return false;});this.claim(entry);
   for(const edit of edits){
    if(edit.kind!=='append'||edit.pickup.id!==entry.highWaterId+1)throw Error('Solo pickup replay-tail edit mismatch');
    entry.highWaterId=edit.pickup.id;await this.append(entry,edit.pickup);
   }
   await this.flush(entry);
   if(this.streamOutputs){
    if(typeof _scene.flushPickupOutputTail!=='function')throw Error('Solo pickup output tail unavailable');
    await _scene.flushPickupOutputTail(chunk=>this.writeOutput(entry,chunk));
   }
   entry.replayed=true;this.owner=undefined;
  });
 }
 seal():Promise<void> {
  return this.run(async()=>{
   if(!this.reader||!this.writer||this.prepared||this.owner||this.buffer.length||[...this.entries.values()].some(e=>!e.replayed))throw Error('Solo pickup cohort not ready');
   const next:PickupBatchManifest={version:this.reader.manifest.version+1,observers:this.reader.manifest.observers.map(old=>{
    const entry=this.entries.get(old.observer);return entry?{observer:old.observer,lifeGeneration:old.lifeGeneration,
     prefix:entry.prefix,lastReceiptTick:entry.tick,
     root:{...entry.root,count:entry.count,pageCount:entry.pages,highWaterId:entry.highWaterId}}:old;
   })};
   this.prepared=await this.writer.seal(next);this.check();for(const entry of this.entries.values())entry.stage.seal(this.prepared);
  });
 }
 publish():Promise<void> {
  return this.run(async()=>{
   if(!this.prepared||this.attempted)throw Error('Solo pickup cohort publication unavailable');
   this.attempted=true;const snapshot=await this.prepared.publishAndPin(`${this.key}-published`);
   // No cancellation check or fallible cleanup after irreversible publication.
   this.publishedSnapshot=snapshot;this.published=true;
  });
 }
 validatePickupOutput(plan:OriginalSoloCurrentCohortPlan,descriptor:ReceiverPickupOutputDescriptor):void {
  this.check();const entry=this.entries.get(descriptor?.observer);
  if(!this.streamOutputs||!entry||entry.plan!==plan||!entry.replayed||!this.prepared||this.attempted)throw Error('Solo pickup output plan mismatch');
  this.store.assertPreparedOutputDescriptor(this.prepared,descriptor);
  if(descriptor.observer!==entry.id||descriptor.lifeGeneration!==entry.life||!sameReceiverScenePrefix(descriptor.prefix,entry.prefix)
   ||descriptor.rootKey!==entry.root.key||descriptor.rootVersion!==entry.root.version)throw Error('Solo pickup output root mismatch');
 }
 claimPickupOutput(plan:OriginalSoloCurrentCohortPlan,descriptor:ReceiverPickupOutputDescriptor,channel:PickupBatchOutputChannel,sequence:number):Promise<ReceiverPickupOutputChunk> {
  return this.startOutputClaim(plan,descriptor,channel,sequence,false);
 }
 /** Only the exact failed tuple may resume. Successful tuples are never retained
  * for replay; the World must advance its public dispatch cursor after return. */
 retryPickupOutput(plan:OriginalSoloCurrentCohortPlan,descriptor:ReceiverPickupOutputDescriptor,channel:PickupBatchOutputChannel,sequence:number):Promise<ReceiverPickupOutputChunk> {
  return this.startOutputClaim(plan,descriptor,channel,sequence,true);
 }
 private startOutputClaim(plan:OriginalSoloCurrentCohortPlan,descriptor:ReceiverPickupOutputDescriptor,channel:PickupBatchOutputChannel,sequence:number,retry:boolean):Promise<ReceiverPickupOutputChunk> {
  const entry=this.entries.get(descriptor?.observer),snapshot=this.publishedSnapshot;
  if(!this.streamOutputs||!entry||entry.plan!==plan||!this.published||!snapshot||!this.prepared?.outputDescriptors.includes(descriptor))throw Error('Solo pickup published output mismatch');
  this.store.assertOutputDescriptor(snapshot,descriptor);
  if(!['models','fades','loadout'].includes(channel)||!Number.isSafeInteger(sequence)||sequence<1||sequence>descriptor.chunkCount)throw Error('Solo pickup output sequence mismatch');
  if(this.outputClaimWork)throw Error('Solo pickup output claim pending');
  let pending=this.pendingOutputClaim;
  if(pending&&(pending.plan!==plan||pending.descriptor!==descriptor||pending.channel!==channel||pending.sequence!==sequence))throw Error('Solo pickup output pending tuple mismatch');
  if(retry&&!pending)throw Error('Solo pickup output retry unavailable');
  if(!pending){pending={plan,descriptor,channel,sequence,attempted:false};this.pendingOutputClaim=pending;}
  const retained=pending;
  const work=(async()=>{
   const cursor=await this.store.readOutputClaimCursor(snapshot,descriptor,channel);
   if(cursor===sequence&&retained.attempted&&retained.chunk){this.pendingOutputClaim=undefined;return retained.chunk;}
   if(cursor!==sequence-1){this.pendingOutputClaim=undefined;throw Error('Solo pickup output channel replay or sequence mismatch');}
   // Preread is bounded and fully validated by the Store. Retain it before any
   // durable claim can commit but fail to return; no public sink has seen it.
   retained.chunk??=await this.store.readOutputChunk(snapshot,entry.id,sequence);
   retained.attempted=true;
   try{await this.store.claimOutputChunk(snapshot,entry.id,channel,sequence);}
   catch(error){
    // A transaction failure before consumption may retry the same tuple. A
    // failure after consumption returns the exact preread once, never reclaims.
    // Failed reconciliation also leaves this one chunk owned for explicit retry.
    let consumed:number;
    try{consumed=await this.store.readOutputClaimCursor(snapshot,descriptor,channel);}
    catch(failure){throw new AggregateError([error,failure],'Solo pickup output claim reconciliation failed');}
    if(consumed!==sequence)throw error;
   }
   this.pendingOutputClaim=undefined;return retained.chunk;
  })();
  this.outputClaimWork=work;
  const settle=()=>{if(this.outputClaimWork===work)this.outputClaimWork=undefined;};void work.then(settle,settle);return work;
 }
 abort():Promise<void> {
  if(this.published)return Promise.resolve();if(this.aborting)return this.aborting;this.aborted=true;
  const pending=this.work;
  const work=(async()=>{
   try{await pending;}catch{/* Drain before closing owned resources. */}
   if(this.published)return;
   for(const entry of this.entries.values())entry.stage.rollback();this.buffer=[];this.owner=undefined;
   if(!this.stagingCleaned){
    if(!this.attempted){if(this.prepared)await this.prepared.abort();else if(this.writer)await this.writer.abort();}
    this.stagingCleaned=true;
   }
   await this.reader?.close();
  })();this.aborting=work;
  void work.catch(()=>{if(this.aborting===work)this.aborting=undefined;});return work;
 }
 async finish():Promise<void> {
  if(!this.published)throw Error('Solo pickup cohort has not published');
  if(this.pendingOutputClaim||this.outputClaimWork)throw Error('Solo pickup output claim requires retry before cleanup');
  const errors:unknown[]=[];
  try{await this.reader!.close();}catch(error){errors.push(error);}
  try{await this.store.unpin(`${this.key}-published`);}catch(error){errors.push(error);}
  if(errors.length===1)throw errors[0];
  if(errors.length)throw new AggregateError(errors,'Solo pickup cohort pin cleanup failed');
 }
}
