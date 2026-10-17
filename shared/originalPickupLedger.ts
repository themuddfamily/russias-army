import type {ReceiverPickup} from './originalReceiverModelWorld';

/** Immutable roots name compact, ordered page sets. IDs never repeat in a life,
 * including after the last pickup is collected. */
export interface PickupLedgerRoot {
  readonly version:number; readonly count:number; readonly pageCount:number;
  readonly key:string; readonly highWaterId:number;
}
export interface PickupLedgerPageWrite {readonly page:number;readonly records:readonly ReceiverPickup[]}
export interface PickupLedgerStore {
  readPage(root:string,page:number):Promise<readonly ReceiverPickup[]>;
  readRoot():Promise<PickupLedgerRoot>;
  /** Atomically read CURRENT and acquire the caller-owned durable pin. A
   * rejected operation acquires none. Pins never expire by elapsed time. */
  readRootAndPin(leaseId:string):Promise<PickupLedgerRoot>;
  /** Verify exact published root identity and acquire pin atomically with GC
   * exclusion. Missing or retiring generations must fail explicitly. */
  pin(root:PickupLedgerRoot,leaseId:string):Promise<void>;
  /** Idempotently release only the supplied owned pin. */
  unpin(leaseId:string):Promise<void>;
  /** Stage pages, then CAS CURRENT and acquire next-root pin in the SAME
   * transaction. Rejecting must not leave a newly acquired pin or publish next. */
  publishAndPin(expected:PickupLedgerRoot,next:PickupLedgerRoot,pages:AsyncIterable<PickupLedgerPageWrite>,leaseId:string):Promise<void>;
  /** Consume pages into a fresh staging namespace, then atomically compare ALL
   * expected root fields and publish next. A rejected stream/CAS must leave the
   * old root intact. Do not retain the stream's history or hold an IndexedDB
   * transaction across awaits. Clean orphan staging pages with a bounded cursor.
   * Immutable old pages remain readable by readers holding their old root. */
  publish(expected:PickupLedgerRoot,next:PickupLedgerRoot,pages:AsyncIterable<PickupLedgerPageWrite>):Promise<void>;
}
const MAX_OPERATIONS=16;
const WEAPONS=new Set(['pistol','shotgun','rifle','launcher','rpg','sniper']);
function integer(value:number):boolean{return Number.isSafeInteger(value)&&value>=0;}
function sameRoot(a:PickupLedgerRoot,b:PickupLedgerRoot):boolean {
  return a.version===b.version&&a.count===b.count&&a.pageCount===b.pageCount&&a.key===b.key&&a.highWaterId===b.highWaterId;
}
function freezeRoot(root:PickupLedgerRoot,size:number):PickupLedgerRoot {
  if(!integer(root.version)||!integer(root.count)||!integer(root.pageCount)||!integer(root.highWaterId)||root.pageCount!==Math.ceil(root.count/size)||root.highWaterId<root.count||typeof root.key!=='string'||!root.key.length||root.key.length>128||!/^[\w-]+$/.test(root.key))throw Error('Invalid pickup ledger root');
  return Object.freeze({version:root.version,count:root.count,pageCount:root.pageCount,key:root.key,highWaterId:root.highWaterId});
}
function freezePickup(record:ReceiverPickup):Readonly<ReceiverPickup> {
  if(!record||!integer(record.id)||record.id===0||typeof record.handle!=='string'||!record.handle.length||record.handle.length>256||!WEAPONS.has(record.weapon)||!record.position||![record.position.x,record.position.y,record.position.z].every(Number.isFinite))throw Error('Invalid pickup ledger record');
  return Object.freeze({id:record.id,handle:record.handle,weapon:record.weapon,position:Object.freeze({x:record.position.x,y:record.position.y,z:record.position.z})});
}

interface RootLease {readonly id:string;readonly root:PickupLedgerRoot;refs:number;pending?:Promise<void>;error?:unknown;failed?:boolean}

/** Bounded resident buffers, not a bound on external history. At most two
 * iterator handles (including unstarted handles), two transactions and two
 * page readers exist per ledger. Commit buffers retain <=96 records plus two
 * transient copies; store-side copies have their own separately bounded cost.
 * Old pages require durable pins; no timeout may expire a paused reader's pin.
 */
export class OriginalPickupLedger {
  private current?:RootLease;
  private loading?:Promise<void>;
  private closing?:Promise<void>;
  private closed=false;
  private activeReaders=0;
  private iteratorHandles=0;
  private activeTransactions=0;
  private readonly leases=new Map<string,RootLease>();
  private readonly publications=new Set<Promise<void>>();
  private readonly iteratorClosers=new Set<()=>Promise<void>>();
  private readonly readerClosers=new Set<()=>Promise<void>>();
  private readonly transactions=new Set<OriginalPickupLedgerTransaction>();
  private cleanupTail:Promise<void>=Promise.resolve();
  constructor(private readonly store:PickupLedgerStore,readonly pageSize=16) {
    if(!Number.isInteger(pageSize)||pageSize<1||pageSize>16)throw Error('Invalid pickup ledger page size');
  }
  private id():string{return `lease-${crypto.randomUUID()}`;}
  private assertLive():void {if(this.closed)throw Error('Pickup ledger life closed');}
  private admit():void {this.assertLive();if(this.cleanupPending)throw Error('Pickup ledger cleanup requires drain');}
  get cleanupPending():boolean {for(const lease of this.leases.values())if(lease.refs===0)return true;return false;}
  /** Cleanup errors describe retired pins, never an unsuccessful root CAS. */
  get cleanupFailed():readonly unknown[] {return Object.freeze([...this.leases.values()].filter(lease=>lease.refs===0&&lease.failed).map(lease=>lease.error));}
  private retire(lease:RootLease):void {
    if(!this.leases.has(lease.id)||lease.refs!==0||lease.pending)return;
    lease.error=undefined;lease.failed=false;
    const pending=this.cleanupTail.then(()=>this.store.unpin(lease.id)).then(()=>{this.leases.delete(lease.id);},error=>{lease.error=error;lease.failed=true;}).finally(()=>{lease.pending=undefined;});
    lease.pending=pending;this.cleanupTail=pending;
  }
  private release(lease:RootLease):void {if(!this.leases.has(lease.id))return;if(lease.refs>0)lease.refs--;if(lease.refs===0)this.retire(lease);}
  /** Drain pending releases, retry failed ones once, and fail explicitly if a
   * durable pin still cannot be released. Admission stays blocked meanwhile. */
  async flushCleanup():Promise<void> {
    const retired=[...this.leases.values()].filter(lease=>lease.refs===0);
    await Promise.all(retired.map(lease=>lease.pending));
    for(const lease of retired)if(this.leases.has(lease.id)&&lease.failed)this.retire(lease);
    await Promise.all(retired.map(lease=>lease.pending));
    const errors=this.cleanupFailed;if(errors.length)throw new AggregateError(errors,'Pickup ledger pin cleanup failed');
  }
  async initialize():Promise<void> {
    this.admit();if(this.current)return;
    if(!this.loading)this.loading=(async()=>{
      const id=this.id(),raw=await this.store.readRootAndPin(id);let root:PickupLedgerRoot;
      try{root=freezeRoot(raw,this.pageSize);}catch(error){
        const orphan:RootLease={id,root:{version:0,count:0,pageCount:0,key:id,highWaterId:0},refs:0};
        this.leases.set(id,orphan);this.retire(orphan);throw error;
      }
      const lease:RootLease={id,root,refs:this.closed?0:1};this.leases.set(id,lease);
      if(this.closed){this.retire(lease);throw Error('Pickup ledger life closed');}
      this.current=lease;
    })().catch(error=>{this.loading=undefined;throw error;});
    await this.loading;
  }
  get root():PickupLedgerRoot {this.assertLive();if(!this.current)throw Error('Pickup ledger not initialized');return this.current.root;}
  /** Invalidates immediately. Await completion before closing the owned store.
   * The ledger does not destroy any other connection's pins. */
  close():Promise<void> {
    this.closed=true;
    if(!this.closing)this.closing=(async()=>{
      if(this.loading)await this.loading.catch(()=>undefined);
      const drains=[...this.transactions].map(transaction=>transaction.close());
      drains.push(...[...this.iteratorClosers].map(close=>close()),...[...this.readerClosers].map(close=>close()));
      await Promise.allSettled([...drains,...this.publications]);
      for(const lease of this.leases.values()){lease.refs=0;this.retire(lease);}
      await this.flushCleanup();
    })().catch(error=>{this.closing=undefined;throw error;});
    return this.closing;
  }
  /** Synchronous capture is safe because the current root is already pinned.
   * Explicit return() releases even a handle never started with next(). */
  entries():AsyncIterableIterator<Readonly<ReceiverPickup>> {
    this.admit();const root=this.root,lease=this.current!;
    if(this.iteratorHandles>=2)throw Error('Pickup ledger iterator handle budget exceeded');
    this.iteratorHandles++;lease.refs++;
    const generator=this.readEntries(root);let released=false,pending=false;
    const close=async()=>{try{await generator.return!(undefined);}finally{release();}};
    const release=()=>{if(!released){released=true;this.iteratorHandles--;this.iteratorClosers.delete(close);this.release(lease);}};
    this.iteratorClosers.add(close);
    const self=this;
    return {
      [Symbol.asyncIterator](){return this;},
      async next(){
        self.assertLive();if(released)return {done:true,value:undefined};
        if(pending)throw Error('Pickup ledger iterator operation already pending');
        pending=true;
        try{self.assertLive();const result=await generator.next();if(result.done)release();return result;}
        catch(error){await close();throw error;}finally{pending=false;}
      },
      async return(){try{return await generator.return!(undefined);}finally{release();}},
      async throw(error?:unknown){try{return await generator.throw!(error);}finally{release();}}
    };
  }
  private readEntries(root:PickupLedgerRoot):AsyncIterableIterator<Readonly<ReceiverPickup>> {
    const generator=this.scanEntries(root);let released=false;
    const release=()=>{if(!released){released=true;this.readerClosers.delete(close);}};
    const close=async()=>{try{await generator.return!(undefined);}finally{release();}};
    this.readerClosers.add(close);
    return {
      [Symbol.asyncIterator](){return this;},
      async next(){try{const result=await generator.next();if(result.done)release();return result;}catch(error){release();throw error;}},
      async return(){try{return await generator.return!(undefined);}finally{release();}},
      async throw(error?:unknown){try{return await generator.throw!(error);}finally{release();}}
    };
  }
  private async *scanEntries(root:PickupLedgerRoot):AsyncGenerator<Readonly<ReceiverPickup>> {
    this.assertLive();if(this.activeReaders>=2)throw Error('Pickup ledger reader budget exceeded');
    this.activeReaders++;
    try {
      let previous=0,total=0;
      for(let page=0;page<root.pageCount;page++) {
        this.assertLive();const records=await this.store.readPage(root.key,page);this.assertLive();
        const expected=Math.min(this.pageSize,root.count-page*this.pageSize);
        if(!Array.isArray(records)||records.length!==expected)throw Error('Invalid pickup ledger page length');
        for(const record of records){this.assertLive();const copy=freezePickup(record);if(copy.id<=previous||copy.id>root.highWaterId)throw Error('Invalid pickup ledger page order');previous=copy.id;total++;yield copy;}
      }
      this.assertLive();if(total!==root.count)throw Error('Invalid pickup ledger count');
    }finally{this.activeReaders--;}
  }
  beginTransaction():OriginalPickupLedgerTransaction {
    this.admit();const base=this.root,lease=this.current!;
    if(this.activeTransactions>=2)throw Error('Pickup ledger transaction budget exceeded');
    this.activeTransactions++;lease.refs++;
    let released=false;let transaction:OriginalPickupLedgerTransaction;
    const release=()=>{if(!released){released=true;this.activeTransactions--;this.transactions.delete(transaction);this.release(lease);}};
    transaction=new OriginalPickupLedgerTransaction(base,this.pageSize,()=>{this.assertLive();if(!sameRoot(base,this.root))throw Error('Stale pickup ledger transaction');},()=>this.readEntries(base),async(next,pages)=>{
      this.assertLive();if(!sameRoot(base,this.root))throw Error('Stale pickup ledger transaction');
      const id=this.id();
      const publication=(async()=>{
        await this.store.publishAndPin(base,next,pages,id);
        // CAS already succeeded: adopting its actual result cannot be rejected
        // merely because releasing an old pin fails or close races continuation.
        const replacement:RootLease={id,root:next,refs:this.closed?0:1};this.leases.set(id,replacement);
        if(this.closed)this.retire(replacement);else this.current=replacement;
        this.release(lease);
      })();
      this.publications.add(publication);
      try{await publication;}finally{this.publications.delete(publication);}
    },release);
    this.transactions.add(transaction);return transaction;
  }
}

export class OriginalPickupLedgerTransaction {
  private readonly changes=new Map<number,Readonly<ReceiverPickup>|null>();
  private operations=0;
  private count:number;
  private highWaterId:number;
  private active=true;
  private busy=false;
  private closing?:Promise<void>;
  private readonly idleWaiters=new Set<()=>void>();
  private readonly entryClosers=new Set<()=>Promise<void>>();
  constructor(readonly base:PickupLedgerRoot,private readonly pageSize:number,private readonly validateLife:()=>void,private readonly source:()=>AsyncIterable<Readonly<ReceiverPickup>>,private readonly publish:(next:PickupLedgerRoot,pages:AsyncIterable<PickupLedgerPageWrite>)=>Promise<void>,private readonly release:()=>void) {
    this.count=base.count;this.highWaterId=base.highWaterId;
  }
  private check():void {if(!this.active)throw Error('Pickup ledger transaction closed');this.validateLife();}
  private begin():void {this.check();if(this.busy)throw Error('Pickup ledger operation already pending');this.busy=true;}
  private finishBusy():void {this.busy=false;for(const resolve of this.idleWaiters)resolve();this.idleWaiters.clear();}
  private reserve():void {if(this.operations>=MAX_OPERATIONS)throw Error('Pickup ledger transaction operation budget exceeded');}
  private async find(id:number):Promise<Readonly<ReceiverPickup>|undefined> {
    if(!integer(id)||id===0)throw Error('Invalid pickup ledger id');
    if(this.changes.has(id))return this.changes.get(id)??undefined;
    for await(const record of this.source()){this.check();if(record.id===id)return record;if(record.id>id)return undefined;}
    return undefined;
  }
  async lookup(id:number):Promise<Readonly<ReceiverPickup>|undefined> {
    this.begin();try{const record=await this.find(id);this.check();return record;}finally{this.finishBusy();}
  }
  async append(record:ReceiverPickup):Promise<void> {
    this.begin();try {
      this.reserve();const copy=freezePickup(record);
      if(copy.id<=this.highWaterId)throw Error('Pickup ledger id must increase');
      if(!Number.isSafeInteger(this.count+1))throw Error('Pickup ledger count overflow');
      this.changes.set(copy.id,copy);this.highWaterId=copy.id;this.count++;this.operations++;
    }finally{this.finishBusy();}
  }
  /** A recycled gun handle may occur in several distinct pickup records. ID
   * selects the historical drop; handle authenticates the expected operand. */
  async delete(id:number,expectedHandle:string):Promise<boolean> {
    this.begin();try {
      this.reserve();const record=await this.find(id);this.check();
      if(!record)return false;
      if(record.handle!==expectedHandle)throw Error('Stale pickup ledger handle');
      this.changes.set(id,null);this.count--;this.operations++;return true;
    }finally{this.finishBusy();}
  }
  private async *merged():AsyncGenerator<Readonly<ReceiverPickup>> {
    for await(const record of this.source()) {
      this.check();if(!this.changes.has(record.id))yield record;
      else {const changed=this.changes.get(record.id);if(changed)yield changed;}
    }
    // Appended IDs exceed the original high-water mark and retain insertion order.
    for(const [id,record] of this.changes){this.check();if(id>this.base.highWaterId&&record)yield record;}
  }
  entries():AsyncIterableIterator<Readonly<ReceiverPickup>> {
    this.check();if(this.entryClosers.size)throw Error('Pickup ledger transaction iterator budget exceeded');
    const self=this;let pending=false,released=false;
    const generator=(async function*(){self.begin();try{yield* self.merged();}finally{self.finishBusy();}})();
    const release=()=>{if(!released){released=true;self.entryClosers.delete(close);}};
    const close=async()=>{try{await generator.return!(undefined);}finally{release();}};
    this.entryClosers.add(close);
    return {
      [Symbol.asyncIterator](){return this;},
      async next(){
        self.check();if(pending)throw Error('Pickup ledger iterator operation already pending');if(released)return {done:true,value:undefined};pending=true;
        try{const result=await generator.next();if(result.done)release();return result;}catch(error){await close();throw error;}finally{pending=false;}
      },
      async return(){try{return await generator.return!(undefined);}finally{release();}},
      async throw(error?:unknown){try{return await generator.throw!(error);}finally{release();}}
    };
  }
  /** Lifecycle cancellation is distinct from source rollback: invalidate now,
   * close retained cursors and await finite pending IO before releasing buffers. */
  close():Promise<void> {
    this.active=false;
    if(!this.closing)this.closing=(async()=>{
      await Promise.allSettled([...this.entryClosers].map(close=>close()));
      if(this.busy)await new Promise<void>(resolve=>this.idleWaiters.add(resolve));
      this.changes.clear();this.release();
    })();
    return this.closing;
  }
  async commit():Promise<PickupLedgerRoot> {
    if(this.busy)throw Error('Pickup ledger operation already pending');
    try {
      this.begin();
      if(this.operations===0){return this.base;}
      if(!Number.isSafeInteger(this.base.version+1))throw Error('Pickup ledger version overflow');
      const next=freezeRoot({version:this.base.version+1,count:this.count,pageCount:Math.ceil(this.count/this.pageSize),key:`pickups-${crypto.randomUUID()}`,highWaterId:this.highWaterId},this.pageSize);
      const self=this;
      const pages=(async function*():AsyncGenerator<PickupLedgerPageWrite>{
        let page=0,total=0,records:ReceiverPickup[]=[];
        for await(const record of self.merged()) {
          records.push(record);total++;
          if(records.length===self.pageSize){yield Object.freeze({page:page++,records:Object.freeze(records)});records=[];}
        }
        if(records.length)yield Object.freeze({page:page++,records:Object.freeze(records)});
        if(total!==next.count||page!==next.pageCount)throw Error('Pickup ledger staged count mismatch');
        self.check();
      })();
      await this.publish(next,pages);return next;
    }finally{this.active=false;this.changes.clear();this.finishBusy();this.release();}
  }
  rollback():void {if(this.busy)throw Error('Pickup ledger operation already pending');this.active=false;this.changes.clear();this.release();}
}
