import {copyReceiverPickupHistory,sameReceiverPickupHistory,type ReceiverPickupHistory,type ReceiverPickupHistorySource,type ReceiverPickupHistoryTransaction} from '../shared/originalReceiverPickupHistory';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import type {ReceiverPickup} from '../shared/originalReceiverModelWorld';
import type {ReceiverPickupOutputDescriptor} from '../shared/originalReceiverPickupOutput';
import {isOriginalPickupBatchPrepared,type PickupBatchPrepared,type PickupBatchWriter} from './originalPickupBatchStore';
import {OriginalPickupBatchReader,type PickupBatchWindow} from './originalPickupBatchWindow';

export type PickupBatchModelEdit=Readonly<{kind:'append'|'remove';pickup:Readonly<ReceiverPickup>}>;
const weapons=new Set(['pistol','shotgun','rifle','launcher','rpg','sniper']);
function record(raw:Omit<ReceiverPickup,'id'>,id:number):Readonly<ReceiverPickup> {
 const handle=raw.handle,weapon=raw.weapon,p=raw.position,position={x:p?.x,y:p?.y,z:p?.z};
 if(typeof handle!=='string'||!handle.length||handle.length>256||!weapons.has(weapon)||![position.x,position.y,position.z].every(Number.isFinite))throw Error('Invalid paged model pickup');
 return Object.freeze({id,handle,weapon,position:Object.freeze(position)});
}
const sameRecord=(a:Readonly<ReceiverPickup>,b:Readonly<ReceiverPickup>)=>a.id===b.id&&a.handle===b.handle&&a.weapon===b.weapon&&a.position.x===b.position.x&&a.position.y===b.position.y&&a.position.z===b.position.z;

/** A per-life ModelWorld source. The coordinator owns reader/writer lifetime,
 * external edit spooling and the single shared CAS; this source only publishes
 * bounded logical metadata with the model bank after that CAS succeeds. */
export class OriginalPickupBatchModelHistory implements ReceiverPickupHistorySource {
 private current:ReceiverPickupHistory;
 private active?:OriginalPickupBatchModelStage;
 private readOnly?:ReceiverPickupHistoryTransaction;
 constructor(initial:ReceiverPickupHistory){this.current=copyReceiverPickupHistory(initial);if(this.current.root.count||this.current.root.highWaterId)throw Error('Paged model history must start empty');}
 get history():ReceiverPickupHistory{return this.current;}
 stage(reader:OriginalPickupBatchReader,writer:PickupBatchWriter,pendingPrefix:ReceiverScenePrefix):OriginalPickupBatchModelStage {
  if(this.active||this.readOnly)throw Error('Paged model history staging already active');
  reader.assertWriter(writer);
  const entry=reader.manifest.observers.find(value=>value.observer===this.current.observer);
  if(!entry||!sameReceiverPickupHistory(this.current,{observer:entry.observer,lifeGeneration:entry.lifeGeneration,root:entry.root}))throw Error('Paged model history pinned root mismatch');
  const kind=pendingPrefix.kind,sceneGeneration=pendingPrefix.sceneGeneration,callback=pendingPrefix.callback;
  const prefix:ReceiverScenePrefix=kind==='receipt'?{kind,sceneGeneration,callback,tick:pendingPrefix.tick}:{kind,sceneGeneration,callback};validateReceiverScenePrefix(prefix);
  if(prefix.sceneGeneration!==entry.prefix.sceneGeneration||(prefix.kind==='callback'?prefix.callback!==entry.prefix.callback+1:prefix.callback!==entry.prefix.callback||prefix.tick<=entry.lastReceiptTick))throw Error('Paged model history pending prefix mismatch');
  reader.assertWriterObserverPlan(writer,this.current.observer,this.current.lifeGeneration,prefix);
  const stage=new OriginalPickupBatchModelStage(this.current,reader,writer,Object.freeze(prefix),history=>{this.current=history;this.active=undefined;},()=>{this.active=undefined;});
  this.active=stage;return stage;
 }
 begin(metadataOnly=false):ReceiverPickupHistoryTransaction {
  if(this.active){if(metadataOnly)throw Error('Paged model callback staging already active');return this.active.begin();}
  if(!metadataOnly)throw Error('Paged model history requires a staged callback');
  if(this.readOnly)throw Error('Paged model metadata transaction already active');
  const baseHistory=this.current,epoch={};let open=true,prepared=false;
  const check=()=>{if(!open||prepared)throw Error('Paged model metadata transaction unavailable');};
  const port:ReceiverPickupHistoryTransaction={baseHistory,
   assertPrefix:prefix=>{check();validateReceiverScenePrefix(prefix);},
   readPickup:id=>{check();if(id===0)return null;throw Error('Pickup ID not resident in a metadata transaction');},
   append:()=>{throw Error('Paged model append requires a staged callback');},
   remove:()=>{throw Error('Paged model removal requires a staged callback');},
   operandEpoch:()=>{check();return epoch;},validateEpoch:token=>{check();if(token!==epoch)throw Error('Stale paged model metadata operand');},
   prepareHistory:()=>{check();return baseHistory;},
   preparePublish:()=>{check();prepared=true;return ()=>{if(!open||!prepared)throw Error('Paged model metadata publication closed');open=false;this.readOnly=undefined;};},
   rollback:()=>{if(!open)return;open=false;this.readOnly=undefined;},
  };
  this.readOnly=Object.freeze(port);return this.readOnly;
 }
}

/** One retained model transaction across sequential authenticated windows.
 * Removed-ID tombstones are window-local; edits must be drained into the
 * coordinator's private external spool before their sixteen-record limit.
 * Draining does not publish models, rewards or a storage manifest. */
export class OriginalPickupBatchModelStage implements ReceiverPickupHistoryTransaction {
 private started=false;
 private active=true;
 private prepared=false;
 private sealed?:{handle:PickupBatchPrepared;history:ReceiverPickupHistory};
 private window?:PickupBatchWindow;
 private loading?:Promise<PickupBatchWindow>;
 private nextPage=0;
 private epoch:object={};
 private readonly removed=new Set<number>();
 private readonly editOwner={};
 private edits:PickupBatchModelEdit[]=[];
 private count:number;
 private highWaterId:number;
 constructor(readonly baseHistory:ReceiverPickupHistory,private readonly reader:OriginalPickupBatchReader,private readonly writer:PickupBatchWriter,
  private readonly prefix:ReceiverScenePrefix,private readonly adopt:(history:ReceiverPickupHistory)=>void,private readonly discard:()=>void){Object.defineProperty(this,'baseHistory',{value:baseHistory,writable:false,configurable:false});this.count=baseHistory.root.count;this.highWaterId=baseHistory.root.highWaterId;}
 begin():ReceiverPickupHistoryTransaction {this.check(false);if(this.started)throw Error('Paged model transaction already issued');this.started=true;return this;}
 private check(requireStarted=true):void {
  if(!this.active||this.prepared||(requireStarted&&!this.started))throw Error('Paged model transaction unavailable');
  this.reader.assertSnapshot(this.reader.manifest);
 }
 assertPrefix(prefix:ReceiverScenePrefix):void {this.check();if(!sameReceiverScenePrefix(prefix,this.prefix))throw Error('Paged model transaction prefix mismatch');}
 operandEpoch():object {this.check();return this.epoch;}
 validateEpoch(token:object):void {this.check();if(token!==this.epoch)throw Error('Stale paged model pickup window');}
 loadWindow(page:number):Promise<PickupBatchWindow> {
  this.check();if(this.sealed||this.window||this.loading||page!==this.nextPage)throw Error('Paged model window sequence mismatch');
  const work=this.load(page);this.loading=work;void work.then(()=>{if(this.loading===work)this.loading=undefined;},()=>{if(this.loading===work)this.loading=undefined;});return work;
 }
 private async load(page:number):Promise<PickupBatchWindow> {
  const window=await this.reader.loadWindow(this.baseHistory.observer,page,this.prefix);
  if(!this.active||this.prepared){this.reader.cancelWindow(window);throw Error('Paged model transaction unavailable');}
  this.window=window;this.epoch={};return window;
 }
 releaseWindow(window:PickupBatchWindow):void {
  this.check();if(window!==this.window)throw Error('Foreign paged model window');
  this.reader.releaseWindow(window);this.window=undefined;this.removed.clear();this.epoch={};this.nextPage++;
 }
 readPickup(id:number):Readonly<ReceiverPickup>|null {
  this.check();if(!Number.isSafeInteger(id)||id<0)throw Error('Invalid paged model pickup ID');if(id===0)return null;
  if(!this.window)throw Error('Pickup ID not resident in a model window');
  const row=this.reader.readPickup(this.window,id)!;return this.removed.has(id)?null:row;
 }
 private reserve():void {this.check();if(this.sealed||this.edits.length>=16)throw Error('Paged model edit window requires draining');}
 append(raw:Omit<ReceiverPickup,'id'>):Readonly<ReceiverPickup> {
  this.reserve();const copy=record(raw,0);
  if(!Number.isSafeInteger(this.count+1)||!Number.isSafeInteger(this.highWaterId+1))throw Error('Paged model pickup counter overflow');
  this.reader.reserveModelEdit(this.editOwner);
  const id=this.writer.allocatePickupId(this.baseHistory.observer);
  if(id!==this.highWaterId+1)throw Error('Paged model pickup ID allocation mismatch');
  const pickup=Object.freeze({...copy,id});this.highWaterId=id;this.count++;this.edits.push(Object.freeze({kind:'append',pickup}));return pickup;
 }
 remove(expected:Readonly<ReceiverPickup>):void {
  this.reserve();const current=this.readPickup(expected.id);
  if(!current||!sameRecord(current,expected))throw Error('Stale paged model pickup record');
  this.reader.reserveModelEdit(this.editOwner);
  this.removed.add(current.id);this.count--;this.edits.push(Object.freeze({kind:'remove',pickup:current}));
 }
 drainEdits():readonly PickupBatchModelEdit[] {this.check();const edits=Object.freeze(this.edits);this.edits=[];this.reader.releaseModelEdits(this.editOwner);return edits;}
 seal(handle:PickupBatchPrepared):void {
  this.check();if(this.sealed||this.window||this.loading||this.edits.length||this.nextPage!==this.baseHistory.root.pageCount||!isOriginalPickupBatchPrepared(handle)||!this.writer.ownsPreparation(handle))throw Error('Paged model history not ready to seal');
  const manifest=handle.nextManifest,entry=manifest.observers.find(value=>value.observer===this.baseHistory.observer),base=this.baseHistory.root;
  if(manifest.version!==this.reader.manifest.version+1||!entry||entry.lifeGeneration!==this.baseHistory.lifeGeneration||!sameReceiverScenePrefix(entry.prefix,this.prefix)
   ||entry.root.version!==base.version+1||entry.root.key===base.key||entry.root.count!==this.count||entry.root.highWaterId!==this.highWaterId)throw Error('Paged model sealed root mismatch');
  this.sealed={handle,history:copyReceiverPickupHistory({observer:entry.observer,lifeGeneration:entry.lifeGeneration,root:entry.root})};
 }
 prepareHistory():ReceiverPickupHistory {
  this.check();if(!this.sealed||!isOriginalPickupBatchPrepared(this.sealed.handle)||!this.writer.ownsPreparation(this.sealed.handle))throw Error('Paged model history requires a ready sealed root');return this.sealed.history;
 }
 prepareOutput():ReceiverPickupOutputDescriptor|undefined {
  const history=this.prepareHistory();
  const descriptor=this.sealed!.handle.outputDescriptors.find(value=>value.observer===history.observer);
  if(descriptor&&(descriptor.lifeGeneration!==history.lifeGeneration||descriptor.rootKey!==history.root.key||descriptor.rootVersion!==history.root.version||!sameReceiverScenePrefix(descriptor.prefix,this.prefix)))throw Error('Paged model sealed output mismatch');
  return descriptor;
 }
 preparePublish():()=>void {
  const history=this.prepareHistory();this.prepared=true;
  return ()=>{if(!this.active||!this.prepared)throw Error('Paged model publication closed');this.active=false;this.epoch={};this.adopt(history);};
 }
 rollback():void {
  if(!this.active)return;this.active=false;this.epoch={};this.edits=[];this.removed.clear();
  this.reader.releaseModelEdits(this.editOwner);
  if(this.window){try{this.reader.cancelWindow(this.window);}finally{this.window=undefined;this.discard();}}else this.discard();
 }
}
