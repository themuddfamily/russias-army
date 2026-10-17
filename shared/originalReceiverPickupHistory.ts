import type {PickupLedgerRoot} from './originalPickupLedger';
import type {ReceiverPickup} from './originalReceiverModelWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {ReceiverPickupOutputDescriptor} from './originalReceiverPickupOutput';

/** External logical history; an empty inline pickup array is not its contents. */
export interface ReceiverPickupHistory {
 readonly observer:string;readonly lifeGeneration:number;readonly root:PickupLedgerRoot;
}
/** Trusted synchronous view over one coordinator-owned paged transaction.
 * The adapter retains at most one 16-row window and 16 pending edits. Unknown
 * nonresident IDs throw; they must never masquerade as absent records. */
export interface ReceiverPickupHistoryTransaction {
 readonly baseHistory:ReceiverPickupHistory;
 assertPrefix(prefix:ReceiverScenePrefix):void;
 readPickup(id:number):Readonly<ReceiverPickup>|null;
 append(record:Omit<ReceiverPickup,'id'>):Readonly<ReceiverPickup>;
 remove(record:Readonly<ReceiverPickup>):void;
 operandEpoch():object;
 validateEpoch(token:object):void;
 /** Only a sealed, independently verified storage root may be returned. */
 prepareHistory():ReceiverPickupHistory;
 /** Exact issuer-owned descriptor from the same ready sealed root, if any. */
 prepareOutput?():ReceiverPickupOutputDescriptor|undefined;
 /** All checks precede this assignment-only publisher; no asynchronous CAS. */
 preparePublish():()=>void;
 rollback():void;
}
export interface ReceiverPickupHistorySource {
 readonly history:ReceiverPickupHistory;
 /** Issues one source-owned transaction, never a caller-supplied page view. */
 begin(metadataOnly?:boolean):ReceiverPickupHistoryTransaction;
}
export function copyReceiverPickupHistory(raw:ReceiverPickupHistory):ReceiverPickupHistory {
 if(!raw)throw Error('Invalid receiver pickup history');
 const observer=raw.observer,lifeGeneration=raw.lifeGeneration,r=raw.root;
 if(!r)throw Error('Invalid receiver pickup history');
 const root={version:r.version,count:r.count,pageCount:r.pageCount,key:r.key,highWaterId:r.highWaterId};
 if(typeof observer!=='string'||!observer.length||observer.length>256||!Number.isSafeInteger(lifeGeneration)||lifeGeneration<0
  ||![root.version,root.count,root.pageCount,root.highWaterId].every(n=>Number.isSafeInteger(n)&&n>=0)
  ||root.pageCount!==Math.ceil(root.count/16)||root.highWaterId<root.count||typeof root.key!=='string'||!root.key.length||root.key.length>128||!/^[\w-]+$/.test(root.key))throw Error('Invalid receiver pickup history');
 return Object.freeze({observer,lifeGeneration,root:Object.freeze(root)});
}
export function sameReceiverPickupHistory(a:ReceiverPickupHistory,b:ReceiverPickupHistory):boolean {
 const x=a.root,y=b.root;
 return a.observer===b.observer&&a.lifeGeneration===b.lifeGeneration&&x.key===y.key&&x.version===y.version&&x.count===y.count&&x.pageCount===y.pageCount&&x.highWaterId===y.highWaterId;
}
