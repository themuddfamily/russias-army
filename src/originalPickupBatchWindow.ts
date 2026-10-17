import type {ReceiverPickup} from '../shared/originalReceiverModelWorld';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import type {PickupLedgerRoot} from '../shared/originalPickupLedger';
import type {IndexedDBOriginalPickupBatchStore,PickupBatchManifest,PickupBatchObserver,PickupBatchWriter} from './originalPickupBatchStore';

/** A query window, not a complete-history snapshot. Only its issuing reader
 * can disclose rows, and release invalidates even same-prefix operands. */
export interface PickupBatchWindow {
 readonly observer:string;readonly lifeGeneration:number;readonly root:PickupLedgerRoot;
 readonly prefix:ReceiverScenePrefix;readonly page:number;
}
interface WindowState {readonly rows:readonly Readonly<ReceiverPickup>[];active:boolean}
const weapons=new Set(['pistol','shotgun','rifle','launcher','rpg','sniper']);
function pendingPrefix(entry:PickupBatchObserver,raw:ReceiverScenePrefix):ReceiverScenePrefix {
 const kind=raw.kind,sceneGeneration=raw.sceneGeneration,callback=raw.callback;
 const value:ReceiverScenePrefix=kind==='receipt'
  ?{kind,sceneGeneration,callback,tick:raw.tick}
  :{kind,sceneGeneration,callback};
 validateReceiverScenePrefix(value);
 if(value.sceneGeneration!==entry.prefix.sceneGeneration
  ||(value.kind==='callback'?value.callback!==entry.prefix.callback+1
   :value.callback!==entry.prefix.callback||value.tick<=entry.lastReceiptTick))throw Error('Pickup window pending prefix mismatch');
 return Object.freeze(value);
}
function rowsForPage(raw:readonly ReceiverPickup[],entry:PickupBatchObserver,page:number):readonly Readonly<ReceiverPickup>[] {
 const count=Math.min(16,entry.root.count-page*16);
 if(!Array.isArray(raw)||raw.length!==count)throw Error('Pickup window page length mismatch');
 let previous=0;
 return Object.freeze(raw.map(row=>{
  if(!row||!Number.isSafeInteger(row.id)||row.id<=previous||row.id>entry.root.highWaterId
   ||typeof row.handle!=='string'||!row.handle.length||row.handle.length>256||!weapons.has(row.weapon)
   ||!row.position||![row.position.x,row.position.y,row.position.z].every(Number.isFinite))throw Error('Invalid pickup window record');
  previous=row.id;
  return Object.freeze({id:row.id,handle:row.handle,weapon:row.weapon,
   position:Object.freeze({x:row.position.x,y:row.position.y,z:row.position.z})});
 }));
}

/** One lease pins all observers and one resident window serves the whole
 * reader. A window miss is unresolved, never an assertion of logical absence.
 * This supplies storage authority; ModelWorld catalog joins and callback
 * transaction ownership must be checked by the integrating coordinator. */
export class OriginalPickupBatchReader {
 private closed=false;
 private closing?:Promise<void>;
 private loading?:Promise<PickupBatchWindow>;
 private active?:PickupBatchWindow;
 private readonly prefixes=new Map<string,ReceiverScenePrefix>();
 private readonly issued=new WeakMap<PickupBatchWindow,WindowState>();
 private readonly editOwners=new Map<object,number>();
 private editCount=0;
 private constructor(private readonly store:IndexedDBOriginalPickupBatchStore,private readonly leaseId:string,
  readonly manifest:PickupBatchManifest){Object.defineProperty(this,'manifest',{value:manifest,writable:false,configurable:false});}
 static async open(store:IndexedDBOriginalPickupBatchStore,leaseId:string):Promise<OriginalPickupBatchReader> {
  const manifest=await store.readManifestAndPin(leaseId);
  return new OriginalPickupBatchReader(store,leaseId,manifest);
 }
 private live():void {if(this.closed)throw Error('Pickup window reader closed');}
 assertSnapshot(value:PickupBatchManifest):void {
  this.live();if(value!==this.manifest)throw Error('Pickup window reader snapshot mismatch');this.store.assertPinnedSnapshot(value);
 }
 assertWriter(writer:PickupBatchWriter):void {this.assertSnapshot(this.manifest);this.store.assertWriterSnapshot(writer,this.manifest);}
 assertWriterObserverPlan(writer:PickupBatchWriter,observer:string,lifeGeneration:number,prefix:ReceiverScenePrefix):void {
  this.assertSnapshot(this.manifest);this.store.assertWriterObserverPlan(writer,this.manifest,observer,lifeGeneration,prefix);
 }
 reserveModelEdit(owner:object):void {
  this.assertSnapshot(this.manifest);if(!owner||typeof owner!=='object'||this.editCount>=16)throw Error('Global pickup model edit window requires draining');
  this.editOwners.set(owner,(this.editOwners.get(owner)??0)+1);this.editCount++;
 }
 releaseModelEdits(owner:object):void {
  this.editCount-=this.editOwners.get(owner)??0;this.editOwners.delete(owner);
 }
 loadWindow(observer:string,page:number,rawPrefix:ReceiverScenePrefix):Promise<PickupBatchWindow> {
  this.assertSnapshot(this.manifest);if(this.active||this.loading)throw Error('Pickup window already resident or loading');
  const entry=this.manifest.observers.find(row=>row.observer===observer);
  if(!entry||!Number.isSafeInteger(page)||page<0||page>=entry.root.pageCount)throw Error('Invalid pickup window page');
  const prefix=pendingPrefix(entry,rawPrefix);
  const bound=this.prefixes.get(observer);
  if(bound&&!sameReceiverScenePrefix(bound,prefix))throw Error('Pickup window pending prefix changed');
  this.prefixes.set(observer,prefix);
  const work=this.load(entry,page,prefix);this.loading=work;
  // Clear only this issued operation; close retains its captured promise to
  // drain before releasing the durable all-observer lease.
  void work.then(()=>{if(this.loading===work)this.loading=undefined;},()=>{if(this.loading===work)this.loading=undefined;});
  return work;
 }
 private async load(entry:PickupBatchObserver,page:number,prefix:ReceiverScenePrefix):Promise<PickupBatchWindow> {
  const raw=await this.store.readPage(this.manifest,entry.observer,page);this.live();
  const rows=rowsForPage(raw,entry,page);
  const window=Object.freeze({observer:entry.observer,lifeGeneration:entry.lifeGeneration,root:entry.root,prefix,page});
  this.issued.set(window,{rows,active:true});this.active=window;return window;
 }
 private owned(window:PickupBatchWindow):WindowState {
  this.assertSnapshot(this.manifest);const state=this.issued.get(window);
  if(!state||!state.active||window!==this.active)throw Error('Unauthenticated or released pickup window');
  return state;
 }
 records(window:PickupBatchWindow):readonly Readonly<ReceiverPickup>[] {return this.owned(window).rows;}
 readPickup(window:PickupBatchWindow,id:number):Readonly<ReceiverPickup>|null {
  const state=this.owned(window);
  if(!Number.isSafeInteger(id)||id<0)throw Error('Invalid pickup window ID');
  if(id===0)return null;
  const row=state.rows.find(value=>value.id===id);
  if(!row)throw Error('Pickup ID not resident in this window');
  return row;
 }
 releaseWindow(window:PickupBatchWindow):void {
  const state=this.owned(window);state.active=false;this.issued.delete(window);this.active=undefined;
 }
 /** Cancellation invalidates an owned window even after its lease was closed.
  * A closed reader already discarded its windows; this operation admits no read. */
 cancelWindow(window:PickupBatchWindow):void {
  const state=this.issued.get(window);
  if(!state){if(this.closed)return;throw Error('Unauthenticated pickup window cancellation');}
  if(window!==this.active)throw Error('Foreign pickup window cancellation');
  state.active=false;this.issued.delete(window);this.active=undefined;
 }
 close():Promise<void> {
  if(this.closing)return this.closing;
  this.closed=true;
  this.prefixes.clear();
  this.editOwners.clear();this.editCount=0;
  if(this.active){this.issued.delete(this.active);this.active=undefined;}
  const loading=this.loading;
  const work=(async()=>{
   try{await loading;}catch{/* Failed/cancelled read has no published window. */}
   await this.store.unpin(this.leaseId);
  })();this.closing=work;
  // A failed lease cleanup is retryable; reads stay invalidated throughout.
  void work.catch(()=>{if(this.closing===work)this.closing=undefined;});return work;
 }
}
export const openOriginalPickupBatchReader=(store:IndexedDBOriginalPickupBatchStore,leaseId:string)=>OriginalPickupBatchReader.open(store,leaseId);
