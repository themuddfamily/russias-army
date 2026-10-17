import type {PickupLedgerRoot} from '../shared/originalPickupLedger';
import type {ReceiverPickup} from '../shared/originalReceiverModelWorld';
import type {ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import {copyReceiverPickupOutputChunk,type ReceiverPickupOutputChunk,type ReceiverPickupOutputDescriptor} from '../shared/originalReceiverPickupOutput';
import type {ReceiverModelTransitionCopyOptions} from '../shared/originalReceiverModelTransitions';

const MANIFEST='manifest',PAGES='pages',ROOTS='roots',PINS='pins',CURRENT='current',COHORT='cohort';
const MAX_OBSERVERS=64,MAX_LEASES=6,PAGE_SIZE=16,BATCH=16;
const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const weapons=new Set(['pistol','shotgun','rifle','launcher','rpg','sniper']);
const key=(value:string)=>{if(typeof value!=='string'||!value.length||value.length>128||!/^[\w-]+$/.test(value))throw Error('Invalid pickup batch key');return value;};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function root(raw:PickupLedgerRoot):PickupLedgerRoot {
 const {version,count,pageCount,highWaterId}=raw??{};
 if(![version,count,pageCount,highWaterId].every(integer)||pageCount!==Math.ceil(count/PAGE_SIZE)||highWaterId<count)throw Error('Invalid pickup batch root');
 return Object.freeze({version,count,pageCount,highWaterId,key:key(raw.key)});
}
function prefix(raw:ReceiverScenePrefix):ReceiverScenePrefix {
 if(!raw)throw Error('Invalid pickup batch prefix');const {kind,sceneGeneration,callback}=raw;
 if(!integer(sceneGeneration)||!integer(callback))throw Error('Invalid pickup batch prefix');
 if(kind==='callback')return Object.freeze({kind,sceneGeneration,callback});
 if(kind==='receipt'){const tick=raw.tick;if(integer(tick))return Object.freeze({kind,sceneGeneration,callback,tick});}
 throw Error('Invalid pickup batch prefix');
}
export interface PickupBatchObserver {readonly observer:string;readonly lifeGeneration:number;readonly prefix:ReceiverScenePrefix;readonly lastReceiptTick:number;readonly root:PickupLedgerRoot}
export interface PickupBatchManifest {readonly version:number;readonly observers:readonly PickupBatchObserver[]}
export interface PickupBatchPage {readonly observer:string;readonly page:number;readonly records:readonly ReceiverPickup[]}
export interface PickupBatchGC {readonly visited:number;readonly pagesDeleted:number;readonly done:boolean;readonly after?:string}
export type PickupBatchOutputDescriptor=ReceiverPickupOutputDescriptor;
export type PickupBatchOutputChannel='models'|'fades'|'loadout';
interface OutputHeader {descriptor:PickupBatchOutputDescriptor;bounds:ReceiverModelTransitionCopyOptions;nextOrdinal:number;previousCallback:number;previousLoadoutCallback:number;cursors:Record<PickupBatchOutputChannel,number>;nextClaimOrdinal:Record<PickupBatchOutputChannel,number>;claimedLoadout:Record<PickupBatchOutputChannel,number>;claimedLoadoutCallback:Record<PickupBatchOutputChannel,number>}
const outputDescriptorOwners=new WeakMap<object,{owner:object;available:()=>boolean}>();
/** Owned single-use staging capability. Preparing changes neither CURRENT nor
 * reader pins. Only publication performs the all-observer manifest CAS. */
export interface PickupBatchPrepared {
 readonly nextManifest:PickupBatchManifest;
 readonly outputDescriptors:readonly PickupBatchOutputDescriptor[];
 publishAndPin(leaseId:string):Promise<PickupBatchManifest>;
 abort():Promise<void>;
}
const preparedOwners=new WeakMap<object,()=>boolean>();
/** Only a currently ready store-owned preparation may authorize model sealing. */
export function isOriginalPickupBatchPrepared(value:unknown):value is PickupBatchPrepared {
 return typeof value==='object'&&value!==null&&(preparedOwners.get(value)?.()??false);
}
export interface PickupBatchObserverPlan {
 readonly observer:string;readonly lifeGeneration:number;readonly prefix:ReceiverScenePrefix;readonly lastReceiptTick:number;
 readonly root:Readonly<{key:string;version:number}>;
 /** Receipt consumed immediately before this callback, captured before staging. */
 readonly receiptPrefix?:Extract<ReceiverScenePrefix,{kind:'receipt'}>;
}
/** Root counts are derived from streamed pages; high-water IDs are issued by
 * this capability, including IDs issued and then deleted before sealing. */
export interface PickupBatchWriter {
 allocatePickupId(observer:string):number;
 writePage(page:PickupBatchPage):Promise<void>;
 writeOutputChunk(observer:string,chunk:ReceiverPickupOutputChunk):Promise<void>;
 seal(nextManifest:PickupBatchManifest):Promise<PickupBatchPrepared>;
 abort():Promise<void>;
 ownsPreparation(handle:PickupBatchPrepared):boolean;
}
const writerOwners=new WeakMap<object,{owner:object;expected:PickupBatchManifest;header:PickupBatchManifest;available:()=>boolean}>();
function manifest(raw:PickupBatchManifest):PickupBatchManifest {
 const version=raw?.version,rows=raw?.observers;
 if(!integer(version)||!Array.isArray(rows)||rows.length>MAX_OBSERVERS)throw Error('Invalid pickup batch manifest');
 const ids=new Set<string>(),roots=new Set<string>();
 const observers=rows.map(value=>{
  const observer=key(value.observer),r=root(value.root),p=prefix(value.prefix),lifeGeneration=value.lifeGeneration,lastReceiptTick=value.lastReceiptTick;
  if(ids.has(observer)||roots.has(r.key)||!integer(lifeGeneration)||!(integer(lastReceiptTick)||lastReceiptTick===-1&&p.kind==='callback'&&p.callback===0&&r.version===0&&r.count===0&&r.pageCount===0&&r.highWaterId===0)||p.kind==='receipt'&&p.tick!==lastReceiptTick)throw Error('Invalid pickup batch observer');ids.add(observer);roots.add(r.key);
  return Object.freeze({observer,lifeGeneration,prefix:p,lastReceiptTick,root:r});
 });
 return Object.freeze({version,observers:Object.freeze(observers)});
}
function fresh(o:PickupBatchObserver):boolean {return o.prefix.callback===0&&o.root.version===0&&o.root.count===0&&o.root.highWaterId===0;}
type ReceiptProofs=ReadonlyMap<string,Extract<ReceiverScenePrefix,{kind:'receipt'}>>;
function successor(expected:PickupBatchManifest,next:PickupBatchManifest,proofs?:ReceiptProofs):void {
 if(next.version!==expected.version+1)throw Error('Pickup batch generation mismatch');
 const old=new Map(expected.observers.map(o=>[o.observer,o]));
 for(const b of next.observers){
  const a=old.get(b.observer),proof=proofs?.get(b.observer);
  if(!a||b.lifeGeneration!==a.lifeGeneration){if(proof)throw Error('Pickup batch receipt proof requires existing life');if(a&&(b.lifeGeneration<=a.lifeGeneration||b.root.key===a.root.key)||!fresh(b))throw Error('Pickup batch life registration mismatch');continue;}
  if(b.prefix.sceneGeneration!==a.prefix.sceneGeneration)throw Error('Pickup batch scene generation mismatch');
  if(!equal(a.prefix,b.prefix)){
   if(b.prefix.kind==='callback'){
    if(b.prefix.callback!==a.prefix.callback+1)throw Error('Pickup batch callback mismatch');
    if(proof){if(proof.sceneGeneration!==a.prefix.sceneGeneration||proof.callback!==a.prefix.callback||proof.tick!==a.lastReceiptTick+1||b.lastReceiptTick!==proof.tick)throw Error('Pickup batch callback receipt proof mismatch');}
    else if(b.lastReceiptTick!==a.lastReceiptTick)throw Error('Pickup batch callback mismatch');
   }else{if(proof)throw Error('Pickup batch receipt proof requires callback');if(b.prefix.callback!==a.prefix.callback||b.lastReceiptTick<=a.lastReceiptTick)throw Error('Pickup batch receipt mismatch');}
  }else{if(proof)throw Error('Pickup batch receipt proof requires advanced callback');if(b.lastReceiptTick!==a.lastReceiptTick)throw Error('Pickup batch receipt clock mismatch');}
  if(equal(a.root,b.root))continue;
  if(b.root.version!==a.root.version+1||b.root.highWaterId<a.root.highWaterId||b.root.key===a.root.key)throw Error('Pickup batch root successor mismatch');
 }
}
function records(raw:readonly ReceiverPickup[]):readonly ReceiverPickup[] {
 if(!Array.isArray(raw)||!raw.length||raw.length>PAGE_SIZE)throw Error('Invalid pickup batch page size');let previous=0;
 return Object.freeze(raw.map(value=>{
  const {id,handle,weapon}=value??{},p=value?.position;
  if(!integer(id)||id<=previous||typeof handle!=='string'||!handle.length||handle.length>256||!weapons.has(weapon)||!p)throw Error('Invalid pickup batch record');const {x,y,z}=p;if(![x,y,z].every(Number.isFinite))throw Error('Invalid pickup batch position');previous=id;
  return Object.freeze({id,handle,weapon,position:Object.freeze({x,y,z})});
 }));
}
function outputHeader(raw:OutputHeader,entry:PickupBatchObserver):OutputHeader {
 const d=raw?.descriptor,b=raw?.bounds,c=raw?.cursors,q=raw?.nextClaimOrdinal,l=raw?.claimedLoadout,a=raw?.claimedLoadoutCallback;
 if(!d||!b||!c||!q||!l||!a)throw Error('Invalid pickup output header');
 const descriptor=Object.freeze({observer:d.observer,lifeGeneration:d.lifeGeneration,prefix:prefix(d.prefix),rootKey:d.rootKey,rootVersion:d.rootVersion,
  chunkCount:d.chunkCount,transitionCount:d.transitionCount,loadoutCount:d.loadoutCount});
 const bounds=Object.freeze({sceneGeneration:b.sceneGeneration,minCallback:b.minCallback,maxCallback:b.maxCallback,receiptTick:b.receiptTick,maxEntries:b.maxEntries,maxTextChars:b.maxTextChars});
 const nextOrdinal=raw.nextOrdinal,previousCallback=raw.previousCallback,previousLoadoutCallback=raw.previousLoadoutCallback,cursors={models:c.models,fades:c.fades,loadout:c.loadout},nextClaimOrdinal={models:q.models,fades:q.fades,loadout:q.loadout},claimedLoadout={models:l.models,fades:l.fades,loadout:l.loadout},claimedLoadoutCallback={models:a.models,fades:a.fades,loadout:a.loadout};
 if(descriptor.observer!==entry.observer||descriptor.lifeGeneration!==entry.lifeGeneration||!equal(descriptor.prefix,entry.prefix)||descriptor.rootKey!==entry.root.key||descriptor.rootVersion!==entry.root.version
  ||![descriptor.chunkCount,descriptor.transitionCount,descriptor.loadoutCount,nextOrdinal,previousCallback,previousLoadoutCallback,...Object.values(bounds),...Object.values(cursors),...Object.values(nextClaimOrdinal),...Object.values(claimedLoadout),...Object.values(claimedLoadoutCallback)].every(integer)
  ||descriptor.chunkCount<1||nextOrdinal!==descriptor.transitionCount+1||descriptor.transitionCount/descriptor.chunkCount>256||descriptor.loadoutCount/descriptor.chunkCount>256
  ||bounds.sceneGeneration!==entry.prefix.sceneGeneration||bounds.maxCallback!==entry.prefix.callback||bounds.minCallback!==entry.prefix.callback-(entry.prefix.kind==='callback'?1:0)
  ||bounds.receiptTick!==entry.lastReceiptTick||bounds.maxEntries!==256||bounds.maxTextChars!==65536||previousCallback<bounds.minCallback||previousCallback>bounds.maxCallback||previousLoadoutCallback<bounds.minCallback||previousLoadoutCallback>bounds.maxCallback
  ||Object.values(cursors).some(value=>value>descriptor.chunkCount)
  ||(['models','fades','loadout'] as const).some(channel=>nextClaimOrdinal[channel]<1||nextClaimOrdinal[channel]>nextOrdinal||claimedLoadout[channel]>descriptor.loadoutCount
   ||claimedLoadoutCallback[channel]<bounds.minCallback||claimedLoadoutCallback[channel]>previousLoadoutCallback
   ||claimedLoadout[channel]===0&&claimedLoadoutCallback[channel]!==bounds.minCallback
   ||cursors[channel]===0&&(nextClaimOrdinal[channel]!==1||claimedLoadout[channel]!==0)
   ||cursors[channel]===descriptor.chunkCount&&(nextClaimOrdinal[channel]!==nextOrdinal||claimedLoadout[channel]!==descriptor.loadoutCount||claimedLoadoutCallback[channel]!==previousLoadoutCallback)))throw Error('Invalid pickup output header');
 return {descriptor,bounds,nextOrdinal,previousCallback,previousLoadoutCallback,cursors,nextClaimOrdinal,claimedLoadout,claimedLoadoutCallback};
}
interface Namespace {key:string;owner:string;state:'staging'|'committed'|'retiring'|'tombstone';root:PickupLedgerRoot;observer:string;lifeGeneration:number;batchVersion:number;output?:OutputHeader}
interface Active {transaction:IDBTransaction;done:Promise<void>}
interface Prepared {
 readonly owner:string;readonly expected:PickupBatchManifest;readonly next:PickupBatchManifest;
 readonly keys:readonly string[];readonly handle:PickupBatchPrepared;readonly reservedId?:string;
 readonly outputs:ReadonlyMap<string,OutputHeader>;
}
interface ProvisionalNamespace {key:string;owner:string;state:'staging';observer:string;lifeGeneration:number;batchVersion:number;output?:OutputHeader}
interface WriterCursor {entry:PickupBatchObserver;changed:boolean;page:number;count:number;last:number;lastSize:number;highWaterId:number;outputChunks:number;outputTransitions:number;outputLoadout:number;nextOrdinal:number;previousCallback:number;previousLoadoutCallback:number}
interface WriterState {
 readonly owner:string;readonly expected:PickupBatchManifest;readonly header:PickupBatchManifest;
 readonly keys:readonly string[];readonly cursors:Map<string,WriterCursor>;readonly handle:PickupBatchWriter;readonly receiptProofs:ReceiptProofs;
 busy:boolean;active:boolean;
}

/** One life-registration cohort and one shared publication boundary. Resident
 * manifest is <=64 root descriptors and a streamed page is <=16 records.
 * At most six reader groups own <=384 durable rows; input/output manifests
 * and page copies add a fixed multiple of these bounds. One preparation,
 * prepared capability, publication or abort occupies the staging slot; no
 * page history is retained by the capability.
 * Output chunks have <=256 transitions and <=256 intents, with <=65536
 * serialized known-field characters. Reads retain only the current chunk
 * and one predecessor, independent of total history length.
 * This is a storage adaptation, not proof of Director/native suspension timing.
 * Each observer retains its own life and callback clock; production Game
 * readiness and synchronous memory adoption remain separate integration work. */
export class IndexedDBOriginalPickupBatchStore {
 private closed=false;
 private closing?:Promise<void>;
 private readonly active=new Set<Active>();
 private readonly leases=new Map<string,object>();
 private readonly snapshots=new WeakMap<object,object>();
 private readonly pendingLeases=new Set<string>();
 private readonly outputReads=new Map<object,number>();
 private publication?:Promise<PickupBatchManifest>;
 private preparation?:Promise<PickupBatchPrepared>;
 private abortion?:Promise<void>;
 private prepared?:Prepared;
 private writer?:WriterState;
 private writerOpening?:Promise<PickupBatchWriter>;
 private writerOperation?:Promise<unknown>;
 private publishing=false;
 private cancel?:()=>void;
 private failedCleanup?:Readonly<{owner:string;keys:readonly string[]}>;
 private readonly owner=crypto.randomUUID();
 constructor(private readonly database:IDBDatabase) {
  database.onversionchange=()=>{void this.close().catch(()=>{});};database.onclose=()=>{void this.close().catch(()=>{});};
 }
 private live(){if(this.closed)throw Error('Pickup batch storage closed');}
 private tx<T>(stores:string[],mode:IDBTransactionMode,body:(t:IDBTransaction,result:(v:T)=>void,guard:(f:()=>void)=>void)=>void,cleanup=false):Promise<T> {
  if(!cleanup)this.live();if(this.active.size>=2)return Promise.reject(Error('Pickup batch transaction concurrency exceeded'));
  return new Promise<T>((resolve,reject)=>{
   let t:IDBTransaction;try{t=this.database.transaction(stores,mode);}catch(e){reject(e);return;}
   let finish!:()=>void;const done=new Promise<void>(resolve=>{finish=resolve;});const entry={transaction:t,done};this.active.add(entry);
   let value:T,hasResult=false,failure:unknown;
   const guard=(f:()=>void)=>{try{if(!cleanup)this.live();f();}catch(e){failure??=e;try{t.abort();}catch{/* oncomplete reports a completed transaction. */}}};
   t.onerror=()=>{failure??=t.error??Error('Pickup batch request failed');};
   t.onabort=()=>{this.active.delete(entry);finish();reject(failure??t.error??Error('Pickup batch transaction aborted'));};
   t.oncomplete=()=>{this.active.delete(entry);finish();if(failure!==undefined)reject(failure);else if(!hasResult)reject(Error('Pickup batch transaction has no result'));else resolve(value);};
   guard(()=>body(t,v=>{value=v;hasResult=true;},guard));
  });
 }
 async initialize(initial:PickupBatchManifest):Promise<void> {
  const value=manifest(initial);if(value.version!==0||value.observers.some(o=>!fresh(o)))throw Error('Invalid initial pickup batch');
  await this.tx<void>([MANIFEST,ROOTS],'readwrite',(t,result,guard)=>{
   const store=t.objectStore(MANIFEST),get=store.get(COHORT);get.onsuccess=()=>guard(()=>{
    if(get.result!==undefined){if(!equal(manifest(get.result),value))throw Error('Pickup batch initial cohort mismatch');}
    else{store.add(value,COHORT);store.add(value,CURRENT);for(const o of value.observers)t.objectStore(ROOTS).add({key:o.root.key,owner:'initial',state:'committed',root:o.root,observer:o.observer,lifeGeneration:o.lifeGeneration,batchVersion:0} satisfies Namespace);}
    result();
   });
  });this.live();
 }
 async readManifest():Promise<PickupBatchManifest> {
  const value=await this.tx<PickupBatchManifest>([MANIFEST],'readonly',(t,result,guard)=>{const get=t.objectStore(MANIFEST).get(CURRENT);get.onsuccess=()=>guard(()=>result(manifest(get.result)));});this.live();return value;
 }
 private reserve(id:string){this.live();key(id);if(this.leases.has(id)||this.leases.size>=MAX_LEASES)throw Error('Pickup batch reader lease budget or duplicate');this.leases.set(id,{});this.pendingLeases.add(id);}
 private pinRows(t:IDBTransaction,value:PickupBatchManifest,id:string){for(const o of value.observers)t.objectStore(PINS).add({owner:this.owner,id,observer:o.observer,root:o.root.key});}
 private verifyRoots(t:IDBTransaction,value:PickupBatchManifest,guard:(f:()=>void)=>void,finish:()=>void,staging?:Readonly<{owner:string;keys:ReadonlySet<string>;outputs:ReadonlyMap<string,OutputHeader>}>):void {
  let pending=value.observers.length;if(!pending){finish();return;}
  for(const o of value.observers){const get=t.objectStore(ROOTS).get(o.root.key);get.onsuccess=()=>guard(()=>{
   const ns=get.result as Namespace|undefined,changed=staging?.keys.has(o.root.key)??false;
   if(!ns||ns.key!==o.root.key||ns.observer!==o.observer||ns.lifeGeneration!==o.lifeGeneration||!equal(root(ns.root),o.root)||!integer(ns.batchVersion))throw Error('Pickup batch namespace metadata mismatch');
   if(ns.output){if(!changed&&(ns.output.descriptor.prefix.sceneGeneration!==o.prefix.sceneGeneration||ns.output.descriptor.prefix.callback>o.prefix.callback||ns.output.bounds.receiptTick>o.lastReceiptTick))throw Error('Pickup output header clock exceeds snapshot');outputHeader(ns.output,changed?o:{...o,prefix:ns.output.descriptor.prefix,lastReceiptTick:ns.output.bounds.receiptTick});}
   if(changed){if(ns.state!=='staging'||ns.owner!==staging!.owner||ns.batchVersion!==value.version||!equal(ns.output,staging!.outputs.get(o.root.key)))throw Error('Pickup batch staging ownership lost');t.objectStore(ROOTS).put({...ns,state:'committed'} satisfies Namespace);}
   else if(ns.state!=='committed'||ns.batchVersion>value.version-(staging?1:0))throw Error('Pickup batch root unavailable');
   if(--pending===0)finish();
  });}
 }
 async readManifestAndPin(id:string):Promise<PickupBatchManifest> {
  this.reserve(id);try{
   const value=await this.tx<PickupBatchManifest>([MANIFEST,ROOTS,PINS],'readwrite',(t,result,guard)=>{const get=t.objectStore(MANIFEST).get(CURRENT);get.onsuccess=()=>guard(()=>{const value=manifest(get.result);this.verifyRoots(t,value,guard,()=>{this.pinRows(t,value,id);result(value);});});});
   this.live();this.snapshots.set(value,this.leases.get(id)!);return value;
  }catch(e){this.leases.delete(id);throw e;}finally{this.pendingLeases.delete(id);}
 }
 assertPinnedSnapshot(value:PickupBatchManifest):void {
  this.live();const token=this.snapshots.get(value);
  if(!token||![...this.leases.values()].includes(token))throw Error('Pickup batch read requires an owned pinned snapshot');
 }
 assertWriterSnapshot(writer:PickupBatchWriter,value:PickupBatchManifest):void {
  this.assertPinnedSnapshot(value);const known=writerOwners.get(writer);
  if(!known||known.owner!==this||!known.available()||!equal(known.expected,value))throw Error('Pickup batch writer snapshot issuer mismatch');
 }
 /** Authenticate the exact observer callback/receipt captured by this writer. */
 assertWriterObserverPlan(writer:PickupBatchWriter,value:PickupBatchManifest,observer:string,lifeGeneration:number,pendingPrefix:ReceiverScenePrefix):void {
  this.assertWriterSnapshot(writer,value);
  const captured=prefix(pendingPrefix),known=writerOwners.get(writer)!,entry=known.header.observers.find(o=>o.observer===observer);
  if(!entry||entry.lifeGeneration!==lifeGeneration||!equal(entry.prefix,captured))throw Error('Pickup batch writer observer plan mismatch');
 }
 assertOutputDescriptor(value:PickupBatchManifest,descriptor:PickupBatchOutputDescriptor):void {
  this.assertPinnedSnapshot(value);
  const known=descriptor&&typeof descriptor==='object'?outputDescriptorOwners.get(descriptor):undefined;
  if(!known||known.owner!==this||!known.available())throw Error('Unauthenticated pickup output descriptor');
  const entry=value.observers.find(row=>row.observer===descriptor.observer);
  if(!entry||entry.lifeGeneration!==descriptor.lifeGeneration||!equal(entry.prefix,descriptor.prefix)||entry.root.key!==descriptor.rootKey||entry.root.version!==descriptor.rootVersion)throw Error('Pickup output descriptor snapshot mismatch');
 }
 /** Validate an exact output capability before irreversible publication. */
 assertPreparedOutputDescriptor(handle:PickupBatchPrepared,descriptor:PickupBatchOutputDescriptor):void {
  this.live();
  const prepared=this.prepared,known=descriptor&&typeof descriptor==='object'?outputDescriptorOwners.get(descriptor):undefined;
  if(!prepared||prepared.handle!==handle||!isOriginalPickupBatchPrepared(handle)||!known||known.owner!==this||!known.available()
   ||!handle.outputDescriptors.includes(descriptor))throw Error('Unauthenticated prepared pickup output descriptor');
  const entry=prepared.next.observers.find(row=>row.observer===descriptor.observer);
  if(!entry||entry.lifeGeneration!==descriptor.lifeGeneration||!equal(entry.prefix,descriptor.prefix)||entry.root.key!==descriptor.rootKey||entry.root.version!==descriptor.rootVersion)throw Error('Prepared pickup output descriptor snapshot mismatch');
 }
 readOutputChunk(value:PickupBatchManifest,observer:string,sequence:number):Promise<ReceiverPickupOutputChunk> {
  return this.outputChunk(value,observer,sequence);
 }
 claimOutputChunk(value:PickupBatchManifest,observer:string,channel:PickupBatchOutputChannel,sequence:number):Promise<ReceiverPickupOutputChunk> {
  if(!['models','fades','loadout'].includes(channel))throw Error('Invalid pickup output channel');
  return this.outputChunk(value,observer,sequence,channel);
 }
 /** Read one authenticated durable cursor without consuming or disclosing a
  * chunk. The publishing cohort uses this only to reconcile its own uncertain
  * claim while retaining the exact bounded chunk and exclusive channel owner. */
 async readOutputClaimCursor(value:PickupBatchManifest,descriptor:PickupBatchOutputDescriptor,channel:PickupBatchOutputChannel):Promise<number> {
  this.assertOutputDescriptor(value,descriptor);
  if(!['models','fades','loadout'].includes(channel))throw Error('Invalid pickup output channel');
  const token=this.snapshots.get(value)!,entry=value.observers.find(row=>row.observer===descriptor.observer)!;
  if([...this.pendingLeases].some(id=>this.leases.get(id)===token))throw Error('Pickup output lease cleanup pending');
  this.outputReads.set(token,(this.outputReads.get(token)??0)+1);
  try{
   const cursor=await this.tx<number>([ROOTS],'readonly',(t,result,guard)=>{
    const get=t.objectStore(ROOTS).get(entry.root.key);get.onsuccess=()=>guard(()=>{
     const ns=get.result as Namespace|undefined;
     if(!ns||ns.state!=='committed'||ns.key!==entry.root.key||ns.observer!==entry.observer||ns.lifeGeneration!==entry.lifeGeneration
      ||!equal(root(ns.root),entry.root)||!integer(ns.batchVersion)||ns.batchVersion>value.version||!ns.output)throw Error('Pickup output root unavailable');
     const header=outputHeader(ns.output,entry);
     if(!equal(header.descriptor,descriptor))throw Error('Pickup output descriptor metadata mismatch');
     result(header.cursors[channel]);
    });
   });
   this.assertOutputDescriptor(value,descriptor);return cursor;
  }finally{
   const remaining=(this.outputReads.get(token)??1)-1;if(remaining)this.outputReads.set(token,remaining);else this.outputReads.delete(token);
  }
 }
 private async outputChunk(value:PickupBatchManifest,observer:string,sequence:number,channel?:PickupBatchOutputChannel):Promise<ReceiverPickupOutputChunk> {
  this.assertPinnedSnapshot(value);const token=this.snapshots.get(value)!,entry=value.observers.find(row=>row.observer===observer);
  if(!entry||!integer(sequence)||sequence<1)throw Error('Invalid pickup output sequence');
  if([...this.pendingLeases].some(id=>this.leases.get(id)===token))throw Error('Pickup output lease cleanup pending');
  this.outputReads.set(token,(this.outputReads.get(token)??0)+1);
  try{
  const output=await this.tx<ReceiverPickupOutputChunk>([ROOTS,PAGES],channel?'readwrite':'readonly',(t,result,guard)=>{
   const get=t.objectStore(ROOTS).get(entry.root.key);get.onsuccess=()=>guard(()=>{
    const ns=get.result as Namespace|undefined;
    if(!ns||ns.state!=='committed'||ns.key!==entry.root.key||ns.observer!==entry.observer||ns.lifeGeneration!==entry.lifeGeneration||!equal(root(ns.root),entry.root)||!integer(ns.batchVersion)||ns.batchVersion>value.version||!ns.output)throw Error('Pickup output root unavailable');
    const header=outputHeader(ns.output,entry);
    if(sequence>header.descriptor.chunkCount||channel&&sequence!==header.cursors[channel]+1)throw Error('Pickup output channel replay or sequence mismatch');
    const row=t.objectStore(PAGES).get([entry.root.key,-sequence]);row.onsuccess=()=>guard(()=>{
     const stored=row.result;
     if(!stored||stored.root!==entry.root.key||stored.page!==-sequence||stored.sequence!==sequence)throw Error('Missing or corrupt pickup output chunk');
     const chunk=copyReceiverPickupOutputChunk(stored.output,header.bounds);
     if(!equal(chunk.prefix,entry.prefix)||chunk.sequence!==sequence||chunk.firstOrdinal!==stored.firstOrdinal||chunk.transitions.length!==stored.transitionCount||chunk.loadoutIntents.length!==stored.loadoutCount
      ||chunk.firstOrdinal+chunk.transitions.length>header.nextOrdinal||sequence===1&&chunk.firstOrdinal!==1||sequence===header.descriptor.chunkCount&&chunk.firstOrdinal+chunk.transitions.length!==header.nextOrdinal)throw Error('Corrupt pickup output chunk metadata');
     const finish=()=>{
      if(channel){
       if(chunk.firstOrdinal!==header.nextClaimOrdinal[channel])throw Error('Pickup output claimed ordinal mismatch');
       if(chunk.loadoutIntents.some(row=>row.prefix.callback<header.claimedLoadoutCallback[channel]))throw Error('Pickup output claimed loadout chronology mismatch');
       header.nextClaimOrdinal[channel]+=chunk.transitions.length;header.claimedLoadout[channel]+=chunk.loadoutIntents.length;
       if(chunk.loadoutIntents.length)header.claimedLoadoutCallback[channel]=chunk.loadoutIntents.at(-1)!.prefix.callback;
       if(header.nextClaimOrdinal[channel]>header.nextOrdinal||header.claimedLoadout[channel]>header.descriptor.loadoutCount
        ||sequence===header.descriptor.chunkCount&&(header.nextClaimOrdinal[channel]!==header.nextOrdinal||header.claimedLoadout[channel]!==header.descriptor.loadoutCount||header.claimedLoadoutCallback[channel]!==header.previousLoadoutCallback))throw Error('Pickup output claimed totals mismatch');
       header.cursors[channel]=sequence;t.objectStore(ROOTS).put({...ns,output:header} satisfies Namespace);
      }
      result(chunk);
     };
     if(sequence===1)finish();else{
      const prior=t.objectStore(PAGES).get([entry.root.key,-(sequence-1)]);prior.onsuccess=()=>guard(()=>{
       const previous=prior.result;
       if(!previous||previous.root!==entry.root.key||previous.page!==-(sequence-1)||previous.sequence!==sequence-1)throw Error('Missing pickup output predecessor');
       const previousChunk=copyReceiverPickupOutputChunk(previous.output,header.bounds);
       if(previousChunk.sequence!==sequence-1||previousChunk.firstOrdinal!==previous.firstOrdinal||previousChunk.transitions.length!==previous.transitionCount||previousChunk.loadoutIntents.length!==previous.loadoutCount
        ||previousChunk.firstOrdinal+previousChunk.transitions.length!==chunk.firstOrdinal
        ||previousChunk.transitions.length&&chunk.transitions.length&&previousChunk.transitions.at(-1)!.prefix.callback>chunk.transitions[0].prefix.callback)throw Error('Corrupt pickup output predecessor');
       finish();
      });
     }
    });
   });
  });this.live();if(![...this.leases.values()].includes(token))throw Error('Pickup output reader lease released');return output;
  }finally{const remaining=(this.outputReads.get(token)??1)-1;if(remaining)this.outputReads.set(token,remaining);else this.outputReads.delete(token);}
 }
 async unpin(id:string):Promise<void> {
  this.live();key(id);if(!this.leases.has(id))return;if(this.outputReads.get(this.leases.get(id)!)||this.pendingLeases.has(id))throw Error('Pickup batch lease operation pending');this.pendingLeases.add(id);
  try{await this.tx<void>([PINS],'readwrite',(t,result,guard)=>{const cursor=t.objectStore(PINS).index('lease').openKeyCursor([this.owner,id]);cursor.onsuccess=()=>guard(()=>{const row=cursor.result;if(!row){result();return;}t.objectStore(PINS).delete(row.primaryKey);row.continue();});});this.leases.delete(id);}finally{this.pendingLeases.delete(id);}
 }
 async readPage(value:PickupBatchManifest,observer:string,page:number):Promise<readonly ReceiverPickup[]> {
  this.assertPinnedSnapshot(value);const token=this.snapshots.get(value)!;
  const snapshot=manifest(value),entry=snapshot.observers.find(o=>o.observer===observer);if(!entry||!integer(page)||page>=entry.root.pageCount)throw Error('Invalid pickup batch page request');
  const output=await this.tx<readonly ReceiverPickup[]>([ROOTS,PAGES],'readonly',(t,result,guard)=>{
   const ns=t.objectStore(ROOTS).get(entry.root.key);ns.onsuccess=()=>guard(()=>{
    const known=ns.result as Namespace|undefined;if(!known||known.state!=='committed'||known.observer!==entry.observer||known.lifeGeneration!==entry.lifeGeneration||!equal(root(known.root),entry.root))throw Error('Pickup batch root unavailable');
    const get=t.objectStore(PAGES).get([entry.root.key,page]);get.onsuccess=()=>guard(()=>{const stored=get.result;if(!stored||stored.root!==entry.root.key||stored.page!==page)throw Error('Missing pickup batch page');const rows=records(stored.records);if(rows.length!==Math.min(PAGE_SIZE,entry.root.count-page*PAGE_SIZE))throw Error('Incomplete pickup batch page');result(rows);});
   });
  });this.live();if(![...this.leases.values()].includes(token))throw Error('Pickup batch reader lease released');return output;
 }
 private preparationInputs(rawExpected:PickupBatchManifest,rawNext:PickupBatchManifest,pages:AsyncIterable<PickupBatchPage>) {
  this.live();if(this.publishing||this.failedCleanup)throw Error('Pickup batch publication pending or cleanup unresolved');
  const expected=manifest(rawExpected),next=manifest(rawNext);successor(expected,next);
  const iterator=pages?.[Symbol.asyncIterator];if(typeof iterator!=='function')throw Error('Invalid pickup batch stream');
  this.live();if(this.publishing||this.failedCleanup)throw Error('Pickup batch publication pending or cleanup unresolved');
  return {expected,next,pages:Object.freeze({[Symbol.asyncIterator]:()=>iterator.call(pages)})};
 }
 private makePrepared(owner:string,expected:PickupBatchManifest,next:PickupBatchManifest,keys:readonly string[],reservedId?:string,outputs:ReadonlyMap<string,OutputHeader>=new Map()):PickupBatchPrepared {
  const store=this;let published=false;
  const outputDescriptors=Object.freeze([...outputs.values()].map(value=>value.descriptor));
  const handle:PickupBatchPrepared=Object.freeze({nextManifest:next,outputDescriptors,
   publishAndPin(this:PickupBatchPrepared,id:string){if(this!==handle)throw Error('Unauthenticated pickup batch preparation');return store.publishPrepared(handle,id).then(value=>{published=true;return value;});},
   abort(this:PickupBatchPrepared){if(this!==handle)throw Error('Unauthenticated pickup batch preparation');return store.abortPrepared(handle);},
  });
  this.prepared={owner,expected,next,keys,handle,outputs,...(reservedId===undefined?{}:{reservedId})};
  for(const descriptor of outputDescriptors)outputDescriptorOwners.set(descriptor,{owner:this,available:()=>!this.closed&&(published||this.prepared?.handle===handle)});
  preparedOwners.set(handle,()=>!this.closed&&this.prepared?.handle===handle);return handle;
 }
 /** Claim private provisional namespaces without forecasting final counts.
  * All observer clocks and root identities are fixed before the first await. */
 beginBatch(rawExpected:PickupBatchManifest,plans:readonly PickupBatchObserverPlan[]):Promise<PickupBatchWriter> {
  this.live();if(this.publishing||this.failedCleanup)throw Error('Pickup batch publication pending or cleanup unresolved');
  const expected=manifest(rawExpected),old=new Map(expected.observers.map(o=>[o.observer,o]));
  if(!Array.isArray(plans)||plans.length>MAX_OBSERVERS)throw Error('Invalid pickup batch observer plans');
  const receiptProofs=new Map<string,Extract<ReceiverScenePrefix,{kind:'receipt'}>>(),seen=new Set<string>();
  const header=manifest({version:expected.version+1,observers:plans.map(raw=>{
   // Read every caller-owned field exactly once before an asynchronous boundary.
   const {observer,lifeGeneration,prefix:rawPrefix,lastReceiptTick,root:rawRoot,receiptPrefix:rawProof}=raw;
   const p=prefix(rawPrefix),{key:rootKey,version:rootVersion}=rawRoot;
   if(seen.has(observer))throw Error('Duplicate pickup batch observer plan');seen.add(observer);
   if(rawProof!==undefined){const proof=prefix(rawProof);if(proof.kind!=='receipt')throw Error('Invalid pickup batch receipt proof');receiptProofs.set(observer,proof);}
   const previous=old.get(observer),sameLife=previous?.lifeGeneration===lifeGeneration;
   return {observer,lifeGeneration,prefix:p,lastReceiptTick,
    root:{count:sameLife?previous!.root.count:0,pageCount:sameLife?previous!.root.pageCount:0,highWaterId:sameLife?previous!.root.highWaterId:0,key:rootKey,version:rootVersion}};
  })});successor(expected,header,receiptProofs);
  this.live();if(this.publishing||this.failedCleanup)throw Error('Pickup batch publication pending or cleanup unresolved');
  this.publishing=true;const work=this.openWriter(expected,header,receiptProofs);this.writerOpening=work;return work;
 }
 private async openWriter(expected:PickupBatchManifest,header:PickupBatchManifest,receiptProofs:ReceiptProofs):Promise<PickupBatchWriter> {
  const owner=crypto.randomUUID(),old=new Map(expected.observers.map(o=>[o.observer,o]));
  const cursors=new Map(header.observers.map(entry=>[entry.observer,{entry,changed:entry.root.key!==old.get(entry.observer)?.root.key,
   page:0,count:0,last:0,lastSize:PAGE_SIZE,highWaterId:entry.root.highWaterId,outputChunks:0,outputTransitions:0,outputLoadout:0,nextOrdinal:1,previousCallback:old.get(entry.observer)?.prefix.callback??0,previousLoadoutCallback:old.get(entry.observer)?.prefix.callback??0}]));
  const keys=Object.freeze([...cursors.values()].filter(c=>c.changed).map(c=>c.entry.root.key));let claimed=false;
  try{
   await this.tx<void>([MANIFEST,ROOTS],'readwrite',(t,result,guard)=>{const get=t.objectStore(MANIFEST).get(CURRENT);get.onsuccess=()=>guard(()=>{
    if(!equal(manifest(get.result),expected))throw Error('Stale pickup batch preparation');
    for(const c of cursors.values())if(c.changed)t.objectStore(ROOTS).add({key:c.entry.root.key,owner,state:'staging',observer:c.entry.observer,lifeGeneration:c.entry.lifeGeneration,batchVersion:header.version} satisfies ProvisionalNamespace);
    result();
   });});claimed=true;this.live();const store=this;
   const handle:PickupBatchWriter=Object.freeze({
    allocatePickupId(this:PickupBatchWriter,observer:string){if(this!==handle)throw Error('Unauthenticated pickup batch writer');return store.allocateWriterId(handle,observer);},
    writePage(this:PickupBatchWriter,page:PickupBatchPage){if(this!==handle)throw Error('Unauthenticated pickup batch writer');return store.writeWriterPage(handle,page);},
    writeOutputChunk(this:PickupBatchWriter,observer:string,chunk:ReceiverPickupOutputChunk){if(this!==handle)throw Error('Unauthenticated pickup batch writer');return store.writeWriterOutput(handle,observer,chunk);},
    seal(this:PickupBatchWriter,next:PickupBatchManifest){if(this!==handle)throw Error('Unauthenticated pickup batch writer');return store.sealWriter(handle,next);},
    abort(this:PickupBatchWriter){if(this!==handle)throw Error('Unauthenticated pickup batch writer');return store.abortWriter(handle);},
    ownsPreparation(this:PickupBatchWriter,prepared:PickupBatchPrepared){if(this!==handle)throw Error('Unauthenticated pickup batch writer');return !store.closed&&store.prepared?.owner===owner&&store.prepared.handle===prepared;},
   });
   writerOwners.set(handle,{owner:this,expected,header,available:()=>!this.closed&&this.writer?.handle===handle&&this.writer.active&&!this.writer.busy});
   this.writer={owner,expected,header,keys,cursors,handle,receiptProofs,busy:false,active:true};return handle;
  }catch(error){
   if(claimed)try{await this.cleanup(owner,keys);}catch(e){this.failedCleanup={owner,keys};throw new AggregateError([error,e],'Pickup batch writer cleanup failed');}
   throw error;
  }finally{if(!this.writer)this.publishing=false;}
 }
 private writerState(handle:PickupBatchWriter):WriterState {
  this.live();const state=this.writer;if(!state||state.handle!==handle||!state.active)throw Error('Pickup batch writer unavailable');
  if(state.busy)throw Error('Pickup batch writer operation pending');return state;
 }
 private allocateWriterId(handle:PickupBatchWriter,observer:string):number {
  const state=this.writerState(handle),cursor=state.cursors.get(observer);
  if(!cursor||!cursor.changed||!Number.isSafeInteger(cursor.highWaterId+1))throw Error('Invalid pickup batch ID allocation');
  return ++cursor.highWaterId;
 }
 private writeWriterPage(handle:PickupBatchWriter,page:PickupBatchPage):Promise<void> {
  const state=this.writerState(handle);state.busy=true;const work=this.writeStreamingPage(state,page);this.writerOperation=work;return work;
 }
 private async writeStreamingPage(state:WriterState,page:PickupBatchPage):Promise<void> {
  try{
   const cursor=state.cursors.get(page?.observer);
   if(!cursor||!cursor.changed||page.page!==cursor.page||cursor.lastSize!==PAGE_SIZE)throw Error('Invalid pickup batch streaming page sequence');
   const rows=records(page.records);
   if(rows[0].id<=cursor.last||rows.at(-1)!.id>cursor.highWaterId||!integer(cursor.count+rows.length)||!integer(cursor.page+1))throw Error('Invalid pickup batch streaming IDs or count');
   await this.tx<void>([ROOTS,PAGES],'readwrite',(t,result,guard)=>{
    const get=t.objectStore(ROOTS).get(cursor.entry.root.key);get.onsuccess=()=>guard(()=>{
     const ns=get.result as ProvisionalNamespace|undefined;
     if(!ns||ns.state!=='staging'||ns.owner!==state.owner||ns.key!==cursor.entry.root.key||ns.observer!==cursor.entry.observer||ns.lifeGeneration!==cursor.entry.lifeGeneration||ns.batchVersion!==state.header.version)throw Error('Pickup batch provisional ownership lost');
     t.objectStore(PAGES).add({root:cursor.entry.root.key,page:cursor.page,records:rows});result();
    });
   });this.live();cursor.page++;cursor.count+=rows.length;cursor.last=rows.at(-1)!.id;cursor.lastSize=rows.length;
  }catch(error){await this.failWriter(state,error);}finally{state.busy=false;}
 }
 private sealWriter(handle:PickupBatchWriter,rawNext:PickupBatchManifest):Promise<PickupBatchPrepared> {
  const state=this.writerState(handle);state.busy=true;const work=this.sealStreamingWriter(state,rawNext);this.writerOperation=work;return work;
 }
 private outputBounds(state:WriterState,cursor:WriterCursor):ReceiverModelTransitionCopyOptions {
  // Fresh CURRENT where supplies its actual receipt-zero proof; no output
  // reader may invent that receipt for an unreceived fresh life.
  if(cursor.entry.lastReceiptTick<0)throw Error('Pickup output requires a received receipt clock');
  const old=state.expected.observers.find(row=>row.observer===cursor.entry.observer),p=cursor.entry.prefix;
  if(!old||old.lifeGeneration!==cursor.entry.lifeGeneration||!cursor.changed||equal(old.prefix,p))throw Error('Pickup output requires an advanced existing life');
  return {sceneGeneration:p.sceneGeneration,minCallback:old.prefix.callback,maxCallback:p.callback,receiptTick:cursor.entry.lastReceiptTick,maxEntries:256,maxTextChars:65536};
 }
 private writeWriterOutput(handle:PickupBatchWriter,observer:string,raw:ReceiverPickupOutputChunk):Promise<void> {
  const state=this.writerState(handle);state.busy=true;const work=this.writeStreamingOutput(state,observer,raw);this.writerOperation=work;return work;
 }
 private async writeStreamingOutput(state:WriterState,observer:string,raw:ReceiverPickupOutputChunk):Promise<void> {
  try{
   const cursor=state.cursors.get(observer);if(!cursor)throw Error('Unknown pickup output observer');
   const bounds=this.outputBounds(state,cursor),chunk=copyReceiverPickupOutputChunk(raw,bounds);
   if(!equal(chunk.prefix,cursor.entry.prefix)||chunk.sequence!==cursor.outputChunks+1||chunk.firstOrdinal!==cursor.nextOrdinal
    ||chunk.transitions.some(row=>row.prefix.callback<cursor.previousCallback)||chunk.loadoutIntents.some(row=>row.prefix.callback<cursor.previousLoadoutCallback)||![cursor.outputChunks+1,cursor.outputTransitions+chunk.transitions.length,cursor.outputLoadout+chunk.loadoutIntents.length,cursor.nextOrdinal+chunk.transitions.length].every(integer))throw Error('Pickup output chunk sequence mismatch');
   this.live();if(this.writer!==state||!state.active)throw Error('Pickup output writer changed during capture');
   await this.tx<void>([ROOTS,PAGES],'readwrite',(t,result,guard)=>{
    const get=t.objectStore(ROOTS).get(cursor.entry.root.key);get.onsuccess=()=>guard(()=>{
     const ns=get.result as ProvisionalNamespace|undefined;
     if(!ns||ns.state!=='staging'||ns.owner!==state.owner||ns.key!==cursor.entry.root.key||ns.observer!==cursor.entry.observer||ns.lifeGeneration!==cursor.entry.lifeGeneration||ns.batchVersion!==state.header.version)throw Error('Pickup output provisional ownership lost');
     t.objectStore(PAGES).add({root:cursor.entry.root.key,page:-chunk.sequence,output:chunk,sequence:chunk.sequence,firstOrdinal:chunk.firstOrdinal,transitionCount:chunk.transitions.length,loadoutCount:chunk.loadoutIntents.length});result();
    });
   });this.live();cursor.outputChunks++;cursor.outputTransitions+=chunk.transitions.length;cursor.outputLoadout+=chunk.loadoutIntents.length;cursor.nextOrdinal+=chunk.transitions.length;
   if(chunk.transitions.length)cursor.previousCallback=chunk.transitions.at(-1)!.prefix.callback;
   if(chunk.loadoutIntents.length)cursor.previousLoadoutCallback=chunk.loadoutIntents.at(-1)!.prefix.callback;
  }catch(error){await this.failWriter(state,error);}finally{state.busy=false;}
 }
 private async sealStreamingWriter(state:WriterState,rawNext:PickupBatchManifest):Promise<PickupBatchPrepared> {
  try{
   const next=manifest(rawNext);successor(state.expected,next,state.receiptProofs);
   if(next.version!==state.header.version||next.observers.length!==state.header.observers.length)throw Error('Pickup batch seal manifest mismatch');
   for(let i=0;i<next.observers.length;i++){
    const entry=next.observers[i],planned=state.header.observers[i],cursor=state.cursors.get(planned.observer)!;
    if(entry.observer!==planned.observer||entry.lifeGeneration!==planned.lifeGeneration||!equal(entry.prefix,planned.prefix)||entry.lastReceiptTick!==planned.lastReceiptTick||entry.root.key!==planned.root.key||entry.root.version!==planned.root.version)throw Error('Pickup batch seal observer mismatch');
    if(cursor.changed){
     if(entry.root.count!==cursor.count||entry.root.pageCount!==cursor.page||entry.root.highWaterId!==cursor.highWaterId||cursor.last>entry.root.highWaterId)throw Error('Pickup batch seal counts or high-water mismatch');
    }else if(!equal(entry.root,planned.root))throw Error('Pickup batch unchanged root mismatch');
   }
   const outputs=new Map<string,OutputHeader>();
   for(const entry of next.observers){const cursor=state.cursors.get(entry.observer)!;if(cursor.outputChunks){
    const descriptor=Object.freeze({observer:entry.observer,lifeGeneration:entry.lifeGeneration,prefix:entry.prefix,rootKey:entry.root.key,rootVersion:entry.root.version,chunkCount:cursor.outputChunks,transitionCount:cursor.outputTransitions,loadoutCount:cursor.outputLoadout});
    const bounds=this.outputBounds(state,cursor);
    outputs.set(entry.root.key,outputHeader({descriptor,bounds,nextOrdinal:cursor.nextOrdinal,previousCallback:cursor.previousCallback,previousLoadoutCallback:cursor.previousLoadoutCallback,cursors:{models:0,fades:0,loadout:0},nextClaimOrdinal:{models:1,fades:1,loadout:1},claimedLoadout:{models:0,fades:0,loadout:0},claimedLoadoutCallback:{models:bounds.minCallback,fades:bounds.minCallback,loadout:bounds.minCallback}},entry));
   }}
   await this.tx<void>([ROOTS],'readwrite',(t,result,guard)=>{
    let pending=state.keys.length;if(!pending){result();return;}
    for(const entry of next.observers)if(state.cursors.get(entry.observer)!.changed){const get=t.objectStore(ROOTS).get(entry.root.key);get.onsuccess=()=>guard(()=>{
     const ns=get.result as ProvisionalNamespace|undefined;
     if(!ns||ns.key!==entry.root.key||ns.state!=='staging'||ns.owner!==state.owner||ns.observer!==entry.observer||ns.lifeGeneration!==entry.lifeGeneration||ns.batchVersion!==next.version||ns.output!==undefined)throw Error('Pickup batch provisional ownership lost');
     t.objectStore(ROOTS).put({...ns,root:entry.root,...(outputs.has(entry.root.key)?{output:outputs.get(entry.root.key)}:{})} satisfies Namespace);if(--pending===0)result();
    });}
   });this.live();state.active=false;this.writer=undefined;
   return this.makePrepared(state.owner,state.expected,next,state.keys,undefined,outputs);
  }catch(error){return this.failWriter(state,error);}finally{state.busy=false;}
 }
 private abortWriter(handle:PickupBatchWriter):Promise<void> {
  const state=this.writerState(handle);state.active=false;this.writer=undefined;
  const work=this.discardWriter(state);this.abortion=work;return work;
 }
 private async discardWriter(state:WriterState):Promise<void> {
  try{await this.cleanup(state.owner,state.keys);}catch(error){this.failedCleanup={owner:state.owner,keys:state.keys};throw error;}
  finally{state.active=false;if(this.writer===state)this.writer=undefined;this.publishing=false;}
 }
 private async failWriter(state:WriterState,error:unknown):Promise<never> {
  state.active=false;if(this.writer===state)this.writer=undefined;
  try{await this.discardWriter(state);}catch(cleanupError){throw new AggregateError([error,cleanupError],'Pickup batch writer cleanup failed');}
  throw error;
 }
 prepareBatch(rawExpected:PickupBatchManifest,rawNext:PickupBatchManifest,pages:AsyncIterable<PickupBatchPage>):Promise<PickupBatchPrepared> {
  const {expected,next,pages:capturedPages}=this.preparationInputs(rawExpected,rawNext,pages);return this.startPreparation(expected,next,capturedPages);
 }
 /** Compatibility path reserves its reader slot before consuming the stream,
  * as before. The split preparation path reserves no reader slot or pin. */
 publishAndPin(rawExpected:PickupBatchManifest,rawNext:PickupBatchManifest,pages:AsyncIterable<PickupBatchPage>,id:string):Promise<PickupBatchManifest> {
  const {expected,next,pages:capturedPages}=this.preparationInputs(rawExpected,rawNext,pages);this.reserve(id);
  const preparation=this.startPreparation(expected,next,capturedPages,id);
  const work=preparation.then(handle=>this.publishPrepared(handle,id));this.publication=work;return work;
 }
 private startPreparation(expected:PickupBatchManifest,next:PickupBatchManifest,pages:AsyncIterable<PickupBatchPage>,reservedId?:string):Promise<PickupBatchPrepared> {
  this.publishing=true;const work=this.stage(expected,next,pages,reservedId);this.preparation=work;return work;
 }
 private async stage(expected:PickupBatchManifest,next:PickupBatchManifest,pages:AsyncIterable<PickupBatchPage>,reservedId?:string):Promise<PickupBatchPrepared> {
  const owner=crypto.randomUUID(),old=new Map(expected.observers.map(o=>[o.observer,o])),changed=next.observers.filter(o=>!equal(o.root,old.get(o.observer)?.root)),keys=Object.freeze(changed.map(o=>o.root.key));let claimed=false;
  const counts=new Map(changed.map(o=>[o.observer,{entry:o,page:0,count:0,last:0}]));let cancel!:()=>void;
  const cancelled=new Promise<never>((_r,reject)=>{cancel=()=>reject(Error('Pickup batch storage closed'));});void cancelled.catch(()=>{});this.cancel=cancel;
  try{
   await this.tx<void>([MANIFEST,ROOTS],'readwrite',(t,result,guard)=>{const get=t.objectStore(MANIFEST).get(CURRENT);get.onsuccess=()=>guard(()=>{
    if(!equal(manifest(get.result),expected))throw Error('Stale pickup batch publication');
    for(const o of changed)t.objectStore(ROOTS).add({key:o.root.key,owner,state:'staging',root:o.root,observer:o.observer,lifeGeneration:o.lifeGeneration,batchVersion:next.version} satisfies Namespace);result();
   });});claimed=true;this.live();
   const iterator=pages[Symbol.asyncIterator]();let ended=false;
   try{while(true){const step=await Promise.race([iterator.next(),cancelled]);if(step.done){ended=true;break;}this.live();
    const write=step.value,cursor=counts.get(write?.observer);if(!cursor||write.page!==cursor.page||cursor.page>=cursor.entry.root.pageCount)throw Error('Invalid pickup batch page sequence');
    const rows=records(write.records);if(rows.length!==Math.min(PAGE_SIZE,cursor.entry.root.count-cursor.count)||rows[0].id<=cursor.last||rows.at(-1)!.id>cursor.entry.root.highWaterId)throw Error('Invalid pickup batch page order');
    await this.tx<void>([PAGES],'readwrite',(t,result)=>{t.objectStore(PAGES).add({root:cursor.entry.root.key,page:cursor.page,records:rows});result();});this.live();cursor.page++;cursor.count+=rows.length;cursor.last=rows.at(-1)!.id;
   }}finally{if(!ended&&iterator.return)void Promise.resolve(iterator.return()).catch(()=>{});}
   for(const c of counts.values())if(c.page!==c.entry.root.pageCount||c.count!==c.entry.root.count)throw Error('Incomplete pickup batch stream');
   this.live();return this.makePrepared(owner,expected,next,keys,reservedId);
  }catch(error){
   if(reservedId!==undefined){this.leases.delete(reservedId);this.pendingLeases.delete(reservedId);}
   if(claimed)try{await this.cleanup(owner,keys);}catch(e){this.failedCleanup={owner,keys};throw new AggregateError([error,e],'Pickup batch orphan cleanup failed');}
   throw error;
  }finally{this.cancel=undefined;if(!this.prepared)this.publishing=false;}
 }
 private publishPrepared(handle:PickupBatchPrepared,id:string):Promise<PickupBatchManifest> {
  this.live();const prepared=this.prepared;if(!prepared||prepared.handle!==handle)throw Error('Pickup batch preparation unavailable');
  if(prepared.reservedId===undefined)this.reserve(id);
  else if(prepared.reservedId!==id)throw Error('Pickup batch reserved reader mismatch');
  // Consume before the first await; no replay can initiate a second CAS.
  this.prepared=undefined;const work=this.commitPrepared(prepared,id);this.publication=work;return work;
 }
 private async commitPrepared(prepared:Prepared,id:string):Promise<PickupBatchManifest> {
  const {owner,expected,next,keys,outputs}=prepared;let committed=false;
  try{
   this.live();await this.tx<void>([MANIFEST,ROOTS,PINS],'readwrite',(t,result,guard)=>{
    const get=t.objectStore(MANIFEST).get(CURRENT);get.onsuccess=()=>guard(()=>{
     if(!equal(manifest(get.result),expected))throw Error('Stale pickup batch publication');
     this.verifyRoots(t,next,guard,()=>{this.pinRows(t,next,id);t.objectStore(MANIFEST).put(next,CURRENT);result();},{owner,keys:new Set(keys),outputs});
    });
   });committed=true;this.snapshots.set(next,this.leases.get(id)!);return next;
  }catch(error){
   this.leases.delete(id);if(!committed){try{await this.cleanup(owner,keys);}catch(e){this.failedCleanup={owner,keys};throw new AggregateError([error,e],'Pickup batch orphan cleanup failed');}}throw error;
  }finally{this.pendingLeases.delete(id);this.publishing=false;this.cancel=undefined;}
 }
 private abortPrepared(handle:PickupBatchPrepared):Promise<void> {
  this.live();const prepared=this.prepared;if(!prepared||prepared.handle!==handle)throw Error('Pickup batch preparation unavailable');
  this.prepared=undefined;const work=this.discardPrepared(prepared);this.abortion=work;return work;
 }
 private async discardPrepared(prepared:Prepared):Promise<void> {
  const {owner,keys,reservedId}=prepared;
  try{await this.cleanup(owner,keys);}catch(error){this.failedCleanup={owner,keys};throw error;}
  finally{if(reservedId!==undefined){this.leases.delete(reservedId);this.pendingLeases.delete(reservedId);}this.publishing=false;}
 }
 private async cleanup(owner:string,keys:readonly string[]):Promise<void> {
  for(const k of keys){let deleted:number;do{deleted=await this.tx<number>([ROOTS,PAGES],'readwrite',(t,result,guard)=>{
   const get=t.objectStore(ROOTS).get(k);get.onsuccess=()=>guard(()=>{const ns=get.result as Namespace|undefined;if(!ns||ns.owner!==owner||ns.state!=='staging'){result(0);return;}
    const cursor=t.objectStore(PAGES).index('root').openKeyCursor(k);let count=0;cursor.onsuccess=()=>guard(()=>{const row=cursor.result;if(!row){t.objectStore(ROOTS).delete(k);result(count);return;}t.objectStore(PAGES).delete(row.primaryKey);if(++count===BATCH){result(count);return;}row.continue();});
   });
  },true);}while(deleted===BATCH);}
 }
 async collectGarbage(after?:string):Promise<PickupBatchGC> {
  if(after!==undefined)key(after);return this.tx<PickupBatchGC>([MANIFEST,ROOTS,PAGES,PINS],'readwrite',(t,result,guard)=>{
   const get=t.objectStore(MANIFEST).get(CURRENT);get.onsuccess=()=>guard(()=>{
    const value=manifest(get.result),current=new Set(value.observers.map(o=>o.root.key)),cursor=t.objectStore(ROOTS).openCursor();let visited=0,last=after;
    const finish=(done:boolean,pagesDeleted=0,resume=last)=>result(Object.freeze({visited,pagesDeleted,done,...(resume===undefined?{}:{after:resume})}));
    const advance=()=>{if(visited===BATCH)finish(false);else cursor.result!.continue();};
    cursor.onsuccess=()=>guard(()=>{const row=cursor.result;if(!row){finish(true);return;}if(typeof row.key!=='string')throw Error('Invalid pickup batch namespace');if(after!==undefined&&row.key<=after){if(row.key<after)row.continue(after);else row.continue();return;}
     const previous=last;last=row.key;visited++;const ns=row.value as Namespace;
     if(ns.key!==row.key)throw Error('Invalid pickup batch namespace identity');
     // Streaming namespaces deliberately have no final root until sealing.
     // They remain private and are reclaimed only by their owning operation.
     if(ns.state==='staging'){advance();return;}
     if(root(ns.root).key!==ns.key)throw Error('Invalid pickup batch namespace identity');if(current.has(ns.key)||ns.state==='tombstone'){advance();return;}
     if(!['committed','retiring'].includes(ns.state)||!integer(ns.batchVersion)||ns.batchVersion>=value.version)throw Error('Invalid historical pickup batch namespace');root(ns.root);
     const pins=t.objectStore(PINS).index('root').count(ns.key);pins.onsuccess=()=>guard(()=>{if(pins.result){if(ns.state==='retiring')throw Error('Retiring pickup batch root pinned');advance();return;}
      t.objectStore(ROOTS).put({...ns,state:'retiring'} satisfies Namespace);let count=0;const pages=t.objectStore(PAGES).index('root').openKeyCursor(ns.key);pages.onsuccess=()=>guard(()=>{const page=pages.result;if(!page){t.objectStore(ROOTS).put({...ns,state:'tombstone'} satisfies Namespace);finish(false,count);return;}t.objectStore(PAGES).delete(page.primaryKey);if(++count===BATCH){finish(false,count,previous);return;}page.continue();});
     });
    });
   });
  });
 }
 /** Retry only an already identified private namespace cleanup. No writer,
  * publication or gameplay is replayed, and close awaits this owned operation. */
 retryFailedCleanup():Promise<void> {
  this.live();if(this.publishing||this.writer||this.prepared)throw Error('Pickup batch cleanup retry requires idle storage');
  const failed=this.failedCleanup;if(!failed)return Promise.resolve();this.publishing=true;
  const work=this.cleanup(failed.owner,failed.keys).then(()=>{if(this.failedCleanup===failed)this.failedCleanup=undefined;}).finally(()=>{this.publishing=false;});
  this.abortion=work;return work;
 }
 close():Promise<void> {
  if(this.closing)return this.closing;this.closed=true;this.cancel?.();const pending=[...this.active].map(a=>a.done);for(const a of this.active){try{a.transaction.abort();}catch{/* Complete CAS remains committed. */}}
  const work=(async()=>{await Promise.all(pending);try{await this.preparation;}catch{/* Cancellation's owned cleanup is awaited here. */}try{await this.writerOpening;}catch{/* Opening failure cleans private namespaces. */}try{await this.writerOperation;}catch{/* Writer failure cleans private namespaces. */}try{await this.publication;}catch{/* Failed publication cleans its staging namespace. */}try{await this.abortion;}catch{/* Cleanup is retried below. */}
   if(this.writer){const writer=this.writer;this.writer=undefined;writer.active=false;try{await this.discardWriter(writer);}catch{/* Cleanup is retried below. */}}
   if(this.prepared){const prepared=this.prepared;this.prepared=undefined;try{await this.discardPrepared(prepared);}catch{/* Cleanup is retried below. */}}
   if(this.failedCleanup){await this.cleanup(this.failedCleanup.owner,this.failedCleanup.keys);this.failedCleanup=undefined;}
   let removed:number;do{removed=await this.tx<number>([PINS],'readwrite',(t,result,guard)=>{const cursor=t.objectStore(PINS).index('owner').openKeyCursor(this.owner);let count=0;cursor.onsuccess=()=>guard(()=>{const row=cursor.result;if(!row){result(count);return;}t.objectStore(PINS).delete(row.primaryKey);if(++count===BATCH){result(count);return;}row.continue();});},true);}while(removed===BATCH);
   this.leases.clear();this.pendingLeases.clear();this.database.close();})();this.closing=work;void work.catch(()=>{if(this.closing===work)this.closing=undefined;});return work;
 }
}
export async function openOriginalPickupBatchStore(options:Readonly<{databaseName:string;initial:PickupBatchManifest;factory?:IDBFactory}>):Promise<IndexedDBOriginalPickupBatchStore> {
 if(!options||typeof options.databaseName!=='string'||!options.databaseName.length||options.databaseName.length>128)throw Error('Invalid pickup batch database name');const initial=manifest(options.initial),factory=options.factory??globalThis.indexedDB;
 if(!factory||typeof factory.open!=='function'||typeof globalThis.crypto?.randomUUID!=='function')throw Error('Pickup batch storage unavailable');
 const database=await new Promise<IDBDatabase>((resolve,reject)=>{
  let settled=false;const request=factory.open(options.databaseName,1);const fail=(e:unknown)=>{if(!settled){settled=true;reject(e);}};
  request.onblocked=()=>fail(Error('Pickup batch database blocked'));request.onerror=()=>fail(request.error??Error('Pickup batch database failed'));
  request.onupgradeneeded=()=>{if(settled){request.transaction?.abort();return;}const db=request.result;db.createObjectStore(MANIFEST);db.createObjectStore(ROOTS,{keyPath:'key'});const pages=db.createObjectStore(PAGES,{keyPath:['root','page']});pages.createIndex('root','root');const pins=db.createObjectStore(PINS,{keyPath:['owner','id','observer']});pins.createIndex('owner','owner');pins.createIndex('lease',['owner','id']);pins.createIndex('root','root');};
  request.onsuccess=()=>{
   const db=request.result;if(settled){db.close();return;}
   if(![MANIFEST,ROOTS,PAGES,PINS].every(s=>db.objectStoreNames.contains(s))){db.close();fail(Error('Invalid pickup batch database schema'));return;}
   let tx:IDBTransaction;try{
    tx=db.transaction([MANIFEST,ROOTS,PAGES,PINS],'readonly');
    const m=tx.objectStore(MANIFEST),r=tx.objectStore(ROOTS),p=tx.objectStore(PAGES),l=tx.objectStore(PINS);
    if(m.keyPath!==null||m.autoIncrement||r.keyPath!=='key'||r.autoIncrement||!equal(p.keyPath,['root','page'])||p.autoIncrement||!equal(l.keyPath,['owner','id','observer'])||l.autoIncrement)throw Error('Invalid pickup batch key schema');
    for(const [store,name,path] of [[p,'root','root'],[l,'root','root'],[l,'owner','owner'],[l,'lease',['owner','id']]] as const){
     if(!store.indexNames.contains(name))throw Error('Missing pickup batch index');const index=store.index(name);if(!equal(index.keyPath,path)||index.unique||index.multiEntry)throw Error('Invalid pickup batch index');
    }
   }catch(e){db.close();fail(e);return;}
   tx.onabort=()=>{db.close();fail(tx.error??Error('Pickup batch schema inspection aborted'));};
   tx.oncomplete=()=>{if(settled){db.close();return;}settled=true;resolve(db);};
  };
 });
 const store=new IndexedDBOriginalPickupBatchStore(database);try{await store.initialize(initial);return store;}catch(e){try{await store.close();}catch(closeError){throw new AggregateError([e,closeError],'Pickup batch initialization and cleanup failed');}throw e;}
}
