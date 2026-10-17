import type {OriginalSoloCurrentCohort,OriginalSoloCurrentCohortPlan} from '../shared/originalSoloObserverWorld';
import type {ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import type {ReceiverCurrentPickupWindowFlush} from '../shared/originalReceiverCurrentEnvironment';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';
import {OriginalSoloPickupCohort} from './originalSoloPickupCohort';
import {openOriginalPickupBatchReader} from './originalPickupBatchWindow';
import {isOriginalPickupBatchPrepared,type IndexedDBOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchObserver,type PickupBatchWriter,type PickupBatchPrepared} from './originalPickupBatchStore';

/** Per-population storage ownership. Registration/retirement uses the same
 * real manifest CAS as callback cohorts. Caller drains its worlds before life
 * replacement; this owner additionally fences its own cohort and cleanup IO. */
export class OriginalSoloPickupOwner {
 private readonly sources=new Map<string,OriginalPickupBatchModelHistory>();
 private readonly generations=new Map<string,number>();
 private active?:OriginalSoloPickupCohort;
 private rosterBusy=false;
 private cleanup?:()=>Promise<void>;
 private cleanupWork?:Promise<void>;
 private serial=0;
 private garbageAfter?:string;
 private readonly namespace:string;
 constructor(private readonly store:IndexedDBOriginalPickupBatchStore,key:string){
  if(!store||typeof key!=='string'||!/^\w[\w-]{0,39}$/.test(key))throw Error('Invalid Solo pickup owner');
  this.namespace=`${key.slice(0,8)}-${globalThis.crypto.randomUUID().replaceAll('-','')}`;
 }
 private nextKey():string {
  const next=this.serial+1;if(!Number.isSafeInteger(next))throw Error('Solo pickup owner sequence requires reset');this.serial=next;return `${this.namespace}-${next}`;
 }
 get awaiting():boolean{return this.rosterBusy||!!this.active||!!this.cleanup||!!this.cleanupWork;}
 sourceAt(observer:string,lifeGeneration:number):OriginalPickupBatchModelHistory {
  const source=this.sources.get(observer);
  if(!source||source.history.lifeGeneration!==lifeGeneration)throw Error('Solo pickup owner life unavailable');return source;
 }
 private admitRoster():void {if(this.awaiting)throw Error('Solo pickup owner must drain cohort/cleanup before roster mutation');this.rosterBusy=true;}
 async registerLife(observer:string,lifeGeneration:number):Promise<OriginalPickupBatchModelHistory> {
  this.admitRoster();
  try{
   if(typeof observer!=='string'||!/^\w[\w-]{0,127}$/.test(observer)||!Number.isSafeInteger(lifeGeneration)||lifeGeneration<1)throw Error('Invalid Solo pickup life');
   const previous=this.generations.get(observer);
   if(previous!==undefined&&lifeGeneration<=previous)throw Error('Solo pickup life generation must advance');
   if(previous===undefined&&this.generations.size>=64)throw Error('Solo pickup owner identity capacity requires reset');
   const operation=this.nextKey(),root={key:`${operation}-root`,version:0,count:0,pageCount:0,highWaterId:0};
   const row:PickupBatchObserver={observer,lifeGeneration,prefix:{kind:'callback',sceneGeneration:lifeGeneration,callback:0},lastReceiptTick:-1,root};
   const source=new OriginalPickupBatchModelHistory({observer,lifeGeneration,root});
   await this.publishRoster(operation,base=>{
    if(!base.observers.some(value=>value.observer===observer)&&base.observers.length>=64)throw Error('Solo pickup population capacity exceeded');
    const old=base.observers.find(value=>value.observer===observer);
    if(old&&lifeGeneration<=old.lifeGeneration)throw Error('Solo pickup durable life generation must advance');
    return [...base.observers.filter(value=>value.observer!==observer),row];
   },()=>{this.sources.set(observer,source);this.generations.set(observer,lifeGeneration);});
   return source;
  }finally{this.rosterBusy=false;}
 }
 async retireLife(observer:string,lifeGeneration:number):Promise<void> {
  this.admitRoster();
  try{
   this.sourceAt(observer,lifeGeneration);const operation=this.nextKey();
   await this.publishRoster(operation,base=>{
    const row=base.observers.find(value=>value.observer===observer);
    if(!row||row.lifeGeneration!==lifeGeneration)throw Error('Solo pickup durable retirement life mismatch');
    return base.observers.filter(value=>value.observer!==observer);
   },()=>{this.sources.delete(observer);});
  }finally{this.rosterBusy=false;}
 }
 private async publishRoster(operation:string,rows:(base:PickupBatchManifest)=>readonly PickupBatchObserver[],adopt:()=>void):Promise<void> {
  const reader=await openOriginalPickupBatchReader(this.store,`${operation}-reader`);
  let writer:PickupBatchWriter|undefined,ready:PickupBatchPrepared|undefined,published=false,attempted=false,stagingCleared=false;
  const closePublished=async()=>{
   const errors:unknown[]=[];
   try{await reader.close();}catch(error){errors.push(error);}
   try{await this.store.unpin(`${operation}-published`);}catch(error){errors.push(error);}
   if(errors.length)throw new AggregateError(errors,'Solo pickup roster cleanup failed');
  };
  const abort=async()=>{
   const errors:unknown[]=[];
   try{
    if(!stagingCleared){
     // An attempted CAS or failed writer may already have consumed its handle.
     if(!attempted){
      if(ready){stagingCleared=true;if(isOriginalPickupBatchPrepared(ready))await ready.abort();}
      else if(writer){
       let available=false;try{this.store.assertWriterSnapshot(writer,reader.manifest);available=true;}catch{/* Failed writer's cleanup is owned by the Store. */}
       stagingCleared=true;if(available)await writer.abort();
      }
     }
     stagingCleared=true;
    }
    await this.store.retryFailedCleanup();
   }catch(error){errors.push(error);}
   try{await reader.close();}catch(error){errors.push(error);}
   if(errors.length)throw new AggregateError(errors,'Solo pickup roster rollback failed');
  };
  try{
   const observers=rows(reader.manifest);
   writer=await this.store.beginBatch(reader.manifest,observers);
   ready=await writer.seal({version:reader.manifest.version+1,observers});
   attempted=true;await ready.publishAndPin(`${operation}-published`);published=true;
   // Publish metadata synchronously after irreversible CAS, before cleanup IO.
   adopt();
   try{await closePublished();}catch(error){this.cleanup=closePublished;throw error;}
  }catch(error){
   if(!published)try{await abort();}catch(failure){this.cleanup=abort;throw new AggregateError([error,failure],'Solo pickup roster publication/rollback failed');}
   throw error;
  }
 }
 retryCleanup():Promise<void> {
  if(this.cleanupWork)return this.cleanupWork;
  if(!this.cleanup)return Promise.resolve();
  const cleanup=this.cleanup,work=cleanup().then(()=>{if(this.cleanup===cleanup)this.cleanup=undefined;});this.cleanupWork=work;
  const settle=()=>{if(this.cleanupWork===work)this.cleanupWork=undefined;};void work.then(settle,settle);return work;
 }
 createCohort():OriginalSoloCurrentCohort {
  if(this.awaiting)throw Error('Solo pickup owner cohort/cleanup already active');
  const cohort=new OriginalSoloPickupCohort({store:this.store,sources:this.sources,key:this.nextKey(),streamOutputs:true});this.active=cohort;
  let published=false,publishWork:Promise<void>|undefined;
  const release=()=>{if(this.active===cohort)this.active=undefined;};
  const finish=async()=>{await cohort.finish();const garbage=await this.store.collectGarbage(this.garbageAfter);this.garbageAfter=garbage.done?undefined:garbage.after;release();};
  return Object.freeze({
   begin:(plans:readonly OriginalSoloCurrentCohortPlan[],signal:AbortSignal)=>cohort.begin(plans,signal),
   replayComplete:cohort.replayComplete.bind(cohort),seal:cohort.seal.bind(cohort),publish:()=>{
    const work=cohort.publish().then(()=>{published=true;});publishWork=work;return work;
   },
   validatePickupOutput:cohort.validatePickupOutput.bind(cohort),claimPickupOutput:cohort.claimPickupOutput.bind(cohort),
   retryPickupOutput:cohort.retryPickupOutput.bind(cohort),
   abort:async()=>{await cohort.abort();try{await publishWork;}catch{/* Private publication failed; abort already drained it. */}
    if(published)await finish();await this.store.retryFailedCleanup();release();},finish,
  });
 }
 pickupContinuationAt(observer:string):(prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>,collect:(id:number)=>boolean,flush:ReceiverCurrentPickupWindowFlush)=>Promise<void> {
  return (prefix,collect,flush)=>{
   if(!this.active)throw Error('Solo pickup owner cohort unavailable');return this.active.pickupContinuationAt(observer)(prefix,collect,flush);
  };
 }
}
