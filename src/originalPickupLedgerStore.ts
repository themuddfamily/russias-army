import type {PickupLedgerPageWrite,PickupLedgerRoot,PickupLedgerStore} from '../shared/originalPickupLedger';
import type {ReceiverPickup} from '../shared/originalReceiverModelWorld';

const ROOTS='roots',PAGES='pages',NAMESPACES='namespaces',LEASES='leases',CURRENT='current',SCHEMA='schema';
const CONCURRENT_TRANSACTIONS=2,CLEANUP_BATCH=16;
const MAX_OWNED_LEASES=6,MAX_GC_CANDIDATES=16;
const WEAPONS=new Set(['pistol','shotgun','rifle','launcher','rpg','sniper']);
const integer=(value:number)=>Number.isSafeInteger(value)&&value>=0;
function key(value:string):string {
 if(typeof value!=='string'||!value.length||value.length>128||!/^[\w-]+$/.test(value))throw Error('Invalid pickup ledger storage key');
 return value;
}
function rootCopy(raw:PickupLedgerRoot,size:number):PickupLedgerRoot {
 if(!raw)throw Error('Missing pickup ledger storage root');
 const {version,count,pageCount,highWaterId}=raw,rootKey=key(raw.key);
 if(![version,count,pageCount,highWaterId].every(integer)||pageCount!==Math.ceil(count/size)||highWaterId<count)throw Error('Invalid pickup ledger storage root');
 return Object.freeze({version,count,pageCount,key:rootKey,highWaterId});
}
function sameRoot(a:PickupLedgerRoot,b:PickupLedgerRoot):boolean {
 return a.version===b.version&&a.count===b.count&&a.pageCount===b.pageCount&&a.key===b.key&&a.highWaterId===b.highWaterId;
}
function recordCopy(raw:ReceiverPickup):Readonly<ReceiverPickup> {
 if(!raw)throw Error('Missing pickup ledger storage record');
 const {id,handle,weapon}=raw,p=raw.position;
 if(!integer(id)||id===0||typeof handle!=='string'||!handle.length||handle.length>256||!WEAPONS.has(weapon)||!p)throw Error('Invalid pickup ledger storage record');
 const {x,y,z}=p;if(![x,y,z].every(Number.isFinite))throw Error('Invalid pickup ledger storage position');
 return Object.freeze({id,handle,weapon,position:Object.freeze({x,y,z})});
}
function recordsCopy(raw:readonly ReceiverPickup[],size:number):readonly Readonly<ReceiverPickup>[] {
 if(!Array.isArray(raw)||raw.length<1||raw.length>size)throw Error('Invalid pickup ledger storage page length');
 const records:Readonly<ReceiverPickup>[]=[];let previous=0;
 for(let i=0;i<raw.length;i++){const record=recordCopy(raw[i]);if(record.id<=previous)throw Error('Invalid pickup ledger storage page order');previous=record.id;records.push(record);}
 return Object.freeze(records);
}
interface StoredPage {root:string;page:number;records:readonly ReceiverPickup[]}
interface Namespace {key:string;owner:string;state:'staging'|'committed'|'retiring'|'tombstone';root?:PickupLedgerRoot}
interface Lease {owner:string;id:string;root:string}
interface ActiveTransaction {transaction:IDBTransaction;done:Promise<void>;fail:(error:unknown)=>void}
export interface PickupLedgerGarbageCollection {
 readonly visited:number;readonly pagesDeleted:number;readonly done:boolean;
 /** Resume scanning after this metadata key. A partial page batch resumes
  * before its candidate; no namespace/page key history is retained. */
 readonly after?:string;
}
export interface OriginalPickupLedgerStoreOptions {
 readonly databaseName:string;
 readonly pageSize?:number;
 /** Explicit injection for host adapters; unavailable IndexedDB fails closed. */
 readonly factory?:IDBFactory;
 readonly initialKey?:string;
}

/** Browser-backed immutable pages. Durable reader leases protect old roots
 * across connections and awaits. GC reclaims only known unleased old roots;
 * crashed/uncertain owners are never evicted on a timer. Old v1 roots without
 * metadata remain untouched. Tombstones prevent namespace reuse, so metadata
 * still accumulates until the application retires its life database.
 *
 * Transactions only enqueue requests in their creation task or request event
 * handlers. Every stream await happens after a page transaction completes.
 * https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction
 */
export class IndexedDBOriginalPickupLedgerStore implements PickupLedgerStore {
 private closed=false;
 private publishing=false;
 private closing?:Promise<void>;
 private publication?:Promise<void>;
 private cancelPublication?:()=>void;
 private failedStagingCleanup?:Readonly<{root:string;owner:string;error:unknown}>;
 private readonly active=new Set<ActiveTransaction>();
 private readonly ownedLeases=new Set<string>();
 private readonly pendingLeases=new Set<string>();
 private readonly owner:string;
 constructor(private readonly database:IDBDatabase,readonly pageSize:number) {
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>16)throw Error('Invalid pickup ledger storage page size');
  if(typeof crypto==='undefined'||typeof crypto.randomUUID!=='function')throw Error('Pickup ledger storage requires secure unique lease identity');
  this.owner=crypto.randomUUID();
  // Automatic lifecycle events retain the failed close promise for a caller
  // to observe; unresolved durable pins remain fail-closed.
  database.onversionchange=()=>{void this.close().catch(()=>{});};
  database.onclose=()=>{void this.close().catch(()=>{});};
 }
 private assertLive():void {if(this.closed)throw Error('Pickup ledger storage closed');}
 /** Abort active work; cleanup of an owned pending publication completes
  * before the underlying connection closes. An already completed CAS stays
  * committed even if close races its promise continuation. */
 close():Promise<void> {
  if(this.closing)return this.closing;this.closed=true;
  this.cancelPublication?.();
  const pending=[...this.active].map(active=>active.done);
  for(const active of this.active){try{active.transaction.abort();active.fail(Error('Pickup ledger storage closed'));}catch{/* An irreversible completed transaction keeps its actual result. */}}
  const closing=(async()=>{
   await Promise.all(pending);
   try{await this.publication;}catch{/* A cancelled publication reports its own error; owned cleanup is retried below. */}
   if(this.failedStagingCleanup){const failed=this.failedStagingCleanup;await this.cleanup(failed.root,failed.owner);this.failedStagingCleanup=undefined;}
   await this.cleanupOwnLeases();this.database.close();
  })();this.closing=closing;
  // A failed cleanup keeps the connection usable only by a later close retry;
  // normal reads/writes stay invalidated and durable pins remain fail-closed.
  void closing.catch(()=>{if(this.closing===closing)this.closing=undefined;});return closing;
 }
 private transaction<T>(stores:string[],mode:IDBTransactionMode,body:(transaction:IDBTransaction,result:(value:T)=>void,guard:(operation:()=>void)=>void)=>void,cleanup=false):Promise<T> {
  if(!cleanup)this.assertLive();
  if(this.active.size>=CONCURRENT_TRANSACTIONS)return Promise.reject(Error('Pickup ledger storage transaction concurrency budget exceeded'));
  return new Promise<T>((resolve,reject)=>{
   let transaction:IDBTransaction;
   try{transaction=this.database.transaction(stores,mode);}catch(error){reject(error);return;}
   let failure:unknown,value:T,hasResult=false;
   let settled!:()=>void;const done=new Promise<void>(resolveDone=>{settled=resolveDone;});
   const active:ActiveTransaction={transaction,done,fail:error=>{failure??=error;}};
   this.active.add(active);
   const guard=(operation:()=>void)=>{try{if(!cleanup)this.assertLive();operation();}catch(error){active.fail(error);try{transaction.abort();}catch{/* Event completion settles the operation. */}}};
   transaction.onerror=()=>{active.fail(transaction.error??Error('Pickup ledger storage request failed'));};
   transaction.onabort=()=>{this.active.delete(active);settled();reject(failure??transaction.error??Error('Pickup ledger storage transaction aborted'));};
   transaction.oncomplete=()=>{this.active.delete(active);settled();if(failure!==undefined)reject(failure);else if(!hasResult)reject(Error('Pickup ledger storage transaction completed without a result'));else resolve(value);};
   guard(()=>body(transaction,result=>{value=result;hasResult=true;},guard));
  });
 }
 async initialize(initialKey:string):Promise<void> {
  key(initialKey);
  await this.transaction<void>([ROOTS,NAMESPACES],'readwrite',(transaction,result,guard)=>{
   const roots=transaction.objectStore(ROOTS),schema=roots.get(SCHEMA);
   schema.onsuccess=()=>guard(()=>{
    if(schema.result!==undefined&&schema.result.pageSize!==this.pageSize)throw Error('Pickup ledger storage page size mismatch');
    if(schema.result===undefined)roots.add({pageSize:this.pageSize},SCHEMA);
    const request=roots.get(CURRENT);
    request.onsuccess=()=>guard(()=>{
     if(request.result===undefined){const root=rootCopy({version:0,count:0,pageCount:0,key:initialKey,highWaterId:0},this.pageSize);roots.add(root,CURRENT);transaction.objectStore(NAMESPACES).add({key:initialKey,owner:'initial',state:'committed',root} satisfies Namespace);}
     else rootCopy(request.result as PickupLedgerRoot,this.pageSize);
     result();
    });
   });
  });
  this.assertLive();
 }
 async readRoot():Promise<PickupLedgerRoot> {
  const root=await this.transaction<PickupLedgerRoot>([ROOTS],'readonly',(transaction,result,guard)=>{
   const request=transaction.objectStore(ROOTS).get(CURRENT);request.onsuccess=()=>guard(()=>result(rootCopy(request.result as PickupLedgerRoot,this.pageSize)));
  });this.assertLive();return root;
 }
 private reserveLease(id:string):void {
  this.assertLive();key(id);
  if(this.ownedLeases.has(id))throw Error('Pickup ledger storage lease id already owned');
  if(this.ownedLeases.size>=MAX_OWNED_LEASES)throw Error('Pickup ledger storage lease budget exceeded');
  this.ownedLeases.add(id);this.pendingLeases.add(id);
 }
 private knownNamespace(raw:Namespace|undefined,root:PickupLedgerRoot):Namespace {
  if(!raw||raw.key!==root.key||raw.state!=='committed'||!raw.root||!sameRoot(rootCopy(raw.root,this.pageSize),root))throw Error('Pickup ledger storage root metadata mismatch or unavailable');
  return raw;
 }
 async readRootAndPin(id:string):Promise<PickupLedgerRoot> {
  this.reserveLease(id);
  try{return await this.transaction<PickupLedgerRoot>([ROOTS,NAMESPACES,LEASES],'readwrite',(transaction,result,guard)=>{
   const request=transaction.objectStore(ROOTS).get(CURRENT);
   request.onsuccess=()=>guard(()=>{
    const root=rootCopy(request.result as PickupLedgerRoot,this.pageSize),namespace=transaction.objectStore(NAMESPACES).get(root.key);
    namespace.onsuccess=()=>guard(()=>{this.knownNamespace(namespace.result as Namespace|undefined,root);transaction.objectStore(LEASES).add({owner:this.owner,id,root:root.key} satisfies Lease);result(root);});
   });
  });}catch(error){this.ownedLeases.delete(id);throw error;}finally{this.pendingLeases.delete(id);}
 }
 async pin(rawRoot:PickupLedgerRoot,id:string):Promise<void> {
  const root=rootCopy(rawRoot,this.pageSize);this.reserveLease(id);
  try{await this.transaction<void>([NAMESPACES,LEASES],'readwrite',(transaction,result,guard)=>{
   const request=transaction.objectStore(NAMESPACES).get(root.key);request.onsuccess=()=>guard(()=>{this.knownNamespace(request.result as Namespace|undefined,root);transaction.objectStore(LEASES).add({owner:this.owner,id,root:root.key} satisfies Lease);result();});
  });}catch(error){this.ownedLeases.delete(id);throw error;}finally{this.pendingLeases.delete(id);}
 }
 async unpin(id:string):Promise<void> {
  this.assertLive();key(id);if(!this.ownedLeases.has(id))return;
  if(this.pendingLeases.has(id))throw Error('Pickup ledger storage lease operation pending');
  this.pendingLeases.add(id);
  try{await this.transaction<void>([LEASES],'readwrite',(transaction,result)=>{transaction.objectStore(LEASES).delete([this.owner,id]);result();});this.ownedLeases.delete(id);}
  finally{this.pendingLeases.delete(id);}
 }
 private async cleanupOwnLeases():Promise<void> {
  let removed:number;
  do{removed=await this.transaction<number>([LEASES],'readwrite',(transaction,result,guard)=>{
   const leases=transaction.objectStore(LEASES),request=leases.index('owner').openKeyCursor(this.owner);let count=0;
   request.onsuccess=()=>guard(()=>{const cursor=request.result;if(!cursor){result(count);return;}leases.delete(cursor.primaryKey);count++;if(count===CLEANUP_BATCH){result(count);return;}cursor.continue();});
  },true);}while(removed===CLEANUP_BATCH);
  this.ownedLeases.clear();this.pendingLeases.clear();
 }
 async readPage(root:string,page:number):Promise<readonly ReceiverPickup[]> {
  key(root);if(!integer(page))throw Error('Invalid pickup ledger storage page');
  const records=await this.transaction<readonly ReceiverPickup[]>([PAGES,NAMESPACES],'readonly',(transaction,result,guard)=>{
   const namespace=transaction.objectStore(NAMESPACES).get(root);
   namespace.onsuccess=()=>guard(()=>{
    if(namespace.result?.state!=='committed')throw Error('Pickup ledger storage root is not published');
    const request=transaction.objectStore(PAGES).get([root,page]);request.onsuccess=()=>guard(()=>{
     const value=request.result as StoredPage|undefined;
     if(!value||value.root!==root||value.page!==page)throw Error('Missing pickup ledger storage page');
     result(recordsCopy(value.records,this.pageSize));
    });
   });
  });this.assertLive();return records;
 }
 private async claim(expected:PickupLedgerRoot,next:PickupLedgerRoot,owner:string):Promise<void> {
  await this.transaction<void>([ROOTS,NAMESPACES],'readwrite',(transaction,result,guard)=>{
   const request=transaction.objectStore(ROOTS).get(CURRENT);
   request.onsuccess=()=>guard(()=>{
    if(!sameRoot(rootCopy(request.result as PickupLedgerRoot,this.pageSize),expected))throw Error('Stale pickup ledger storage publication');
    // add, never put: even an empty historical root's namespace cannot repeat.
    transaction.objectStore(NAMESPACES).add({key:next.key,owner,state:'staging',root:next} satisfies Namespace);result();
   });
  });
 }
 private async stage(root:string,page:number,records:readonly ReceiverPickup[]):Promise<void> {
  await this.transaction<void>([PAGES],'readwrite',(transaction,result)=>{transaction.objectStore(PAGES).add({root,page,records} satisfies StoredPage);result();});
 }
 private async compareAndPublish(expected:PickupLedgerRoot,next:PickupLedgerRoot,owner:string,id?:string):Promise<void> {
  await this.transaction<void>(id===undefined?[ROOTS,NAMESPACES]:[ROOTS,NAMESPACES,LEASES],'readwrite',(transaction,result,guard)=>{
   const roots=transaction.objectStore(ROOTS),request=roots.get(CURRENT);
   request.onsuccess=()=>guard(()=>{
    if(!sameRoot(rootCopy(request.result as PickupLedgerRoot,this.pageSize),expected))throw Error('Stale pickup ledger storage publication');
    const namespaces=transaction.objectStore(NAMESPACES),namespace=namespaces.get(next.key);
    namespace.onsuccess=()=>guard(()=>{
     const owned=namespace.result as Namespace|undefined;
     if(!owned||owned.owner!==owner||owned.state!=='staging')throw Error('Pickup ledger storage staging ownership lost');
     if(!owned.root||!sameRoot(rootCopy(owned.root,this.pageSize),next))throw Error('Pickup ledger storage staging root metadata changed');
     if(id!==undefined)transaction.objectStore(LEASES).add({owner:this.owner,id,root:next.key} satisfies Lease);
     namespaces.put({key:next.key,owner,state:'committed',root:next} satisfies Namespace);roots.put(next,CURRENT);result();
    });
   });
  });
 }
 private async cleanup(root:string,owner:string):Promise<void> {
  let removed:number;
  do{
   removed=await this.transaction<number>([PAGES,NAMESPACES],'readwrite',(transaction,result,guard)=>{
    const namespaces=transaction.objectStore(NAMESPACES),request=namespaces.get(root);
    request.onsuccess=()=>guard(()=>{
     const owned=request.result as Namespace|undefined;
     if(!owned||owned.owner!==owner||owned.state!=='staging'){result(0);return;}
     // Cursor stores a single page; no getAll/getAllKeys or history key list.
     const pages=transaction.objectStore(PAGES),cursor=pages.index('root').openKeyCursor(root);let count=0;
     cursor.onsuccess=()=>guard(()=>{
      const row=cursor.result;
      if(!row){namespaces.delete(root);result(count);return;}
      pages.delete(row.primaryKey);count++;
      if(count===CLEANUP_BATCH){result(count);return;}
      cursor.result!.continue();
     });
    });
   },true);
  }while(removed===CLEANUP_BATCH);
 }
 /** One bounded sweep: <=16 namespace candidates and <=16 page-key deletes.
  * A durable pin from an uncertain crashed owner blocks reclamation forever
  * until its owner explicitly releases it or the life database is retired. */
 async collectGarbage(after?:string):Promise<PickupLedgerGarbageCollection> {
  if(after!==undefined)key(after);
  return this.transaction<PickupLedgerGarbageCollection>([ROOTS,NAMESPACES,LEASES,PAGES],'readwrite',(transaction,result,guard)=>{
   const request=transaction.objectStore(ROOTS).get(CURRENT);
   request.onsuccess=()=>guard(()=>{
    const current=rootCopy(request.result as PickupLedgerRoot,this.pageSize),namespaces=transaction.objectStore(NAMESPACES),cursor=namespaces.openCursor();let visited=0,last=after;
    const finish=(done:boolean,pagesDeleted=0,resume=last)=>result(Object.freeze({visited,pagesDeleted,done,...(resume===undefined?{}:{after:resume})}));
    const advance=()=>{if(visited===MAX_GC_CANDIDATES)finish(false);else cursor.result!.continue();};
    cursor.onsuccess=()=>guard(()=>{
     const row=cursor.result;if(!row){finish(true);return;}
     if(typeof row.key!=='string')throw Error('Invalid pickup ledger namespace key');
     // Position a cursor using key navigation, not a materialized key list or
     // a host-global IDBKeyRange dependency in injected CPU implementations.
     if(after!==undefined&&row.key<=after){if(row.key<after)row.continue(after);else row.continue();return;}
     const previous=last;last=row.key;visited++;
     const namespace=row.value as Namespace;
     if(!namespace||namespace.key!==row.key)throw Error('Invalid pickup ledger namespace metadata');
     if(namespace.key===current.key||namespace.state==='staging'||namespace.state==='tombstone'||namespace.root===undefined){advance();return;}
     if(namespace.state!=='committed'&&namespace.state!=='retiring')throw Error('Invalid pickup ledger namespace state');
     const known=rootCopy(namespace.root,this.pageSize);
     if(known.key!==namespace.key||known.version>=current.version)throw Error('Invalid historical pickup ledger root metadata');
     const leases=transaction.objectStore(LEASES).index('root').count(namespace.key);
     leases.onsuccess=()=>guard(()=>{
      if(leases.result!==0){if(namespace.state==='retiring')throw Error('Pickup ledger retiring root unexpectedly pinned');advance();return;}
      namespaces.put({...namespace,state:'retiring'} satisfies Namespace);
      const pages=transaction.objectStore(PAGES),keys=pages.index('root').openKeyCursor(namespace.key);let removed=0;
      keys.onsuccess=()=>guard(()=>{
       const page=keys.result;if(!page){namespaces.put({...namespace,state:'tombstone'} satisfies Namespace);finish(false,removed);return;}
       pages.delete(page.primaryKey);removed++;
       if(removed===CLEANUP_BATCH){finish(false,removed,previous);return;}
       page.continue();
      });
     });
    });
   });
  });
 }
 publish(expected:PickupLedgerRoot,next:PickupLedgerRoot,pages:AsyncIterable<PickupLedgerPageWrite>):Promise<void> {
  return this.startPublication(expected,next,pages);
 }
 async publishAndPin(expected:PickupLedgerRoot,next:PickupLedgerRoot,pages:AsyncIterable<PickupLedgerPageWrite>,id:string):Promise<void> {
  this.reserveLease(id);
  try{await this.startPublication(expected,next,pages,id);}catch(error){this.ownedLeases.delete(id);throw error;}finally{this.pendingLeases.delete(id);}
 }
 private startPublication(expected:PickupLedgerRoot,next:PickupLedgerRoot,pages:AsyncIterable<PickupLedgerPageWrite>,id?:string):Promise<void> {
  if(this.closed)return Promise.reject(Error('Pickup ledger storage closed'));
  if(this.publishing)return Promise.reject(Error('Pickup ledger storage publication already pending'));
  if(this.failedStagingCleanup)return Promise.reject(Error('Pickup ledger storage orphan cleanup unresolved'));
  const publication=this.performPublication(expected,next,pages,id);this.publication=publication;return publication;
 }
 private async performPublication(rawExpected:PickupLedgerRoot,rawNext:PickupLedgerRoot,pages:AsyncIterable<PickupLedgerPageWrite>,id?:string):Promise<void> {
  this.assertLive();if(this.publishing)throw Error('Pickup ledger storage publication already pending');
  const expected=rootCopy(rawExpected,this.pageSize),next=rootCopy(rawNext,this.pageSize);
  if(next.version!==expected.version+1||!integer(expected.version+1)||next.highWaterId<expected.highWaterId||next.key===expected.key||!pages||typeof pages[Symbol.asyncIterator]!=='function')throw Error('Invalid pickup ledger storage publication');
  if(typeof crypto==='undefined'||typeof crypto.randomUUID!=='function')throw Error('Pickup ledger storage requires secure unique staging identity');
  const owner=crypto.randomUUID();this.publishing=true;let claimed=false,committed=false;
  let cancel!:()=>void;const cancelled=new Promise<never>((_resolve,reject)=>{cancel=()=>reject(Error('Pickup ledger storage closed'));});void cancelled.catch(()=>{});this.cancelPublication=cancel;
  try{
   await this.claim(expected,next,owner);claimed=true;this.assertLive();
   let page=0,count=0,previous=0;
   const iterator=pages[Symbol.asyncIterator]();let ended=false;
   try{while(true){
    const step=await Promise.race([iterator.next(),cancelled]);if(step.done){ended=true;break;}const write=step.value;
    this.assertLive();if(!write||write.page!==page||page>=next.pageCount)throw Error('Invalid pickup ledger storage page sequence');
    const records=recordsCopy(write.records,this.pageSize),length=Math.min(this.pageSize,next.count-count);
    if(records.length!==length||records[0].id<=previous||records.at(-1)!.id>next.highWaterId)throw Error('Invalid pickup ledger storage staged page');
    await this.stage(next.key,page,records);this.assertLive();previous=records.at(-1)!.id;count+=records.length;page++;
   }}finally{if(!ended&&typeof iterator.return==='function'){void Promise.resolve(iterator.return()).catch(()=>{});}}
   this.assertLive();if(page!==next.pageCount||count!==next.count)throw Error('Incomplete pickup ledger storage publication');
   await this.compareAndPublish(expected,next,owner,id);committed=true;
  }catch(error){
   if(claimed&&!committed){try{await this.cleanup(next.key,owner);}catch(cleanupError){this.failedStagingCleanup=Object.freeze({root:next.key,owner,error:cleanupError});throw new AggregateError([error,cleanupError],`Pickup ledger publication failed; orphan cleanup failed for ${next.key}`);}}
   throw error;
  }finally{this.publishing=false;this.cancelPublication=undefined;}
 }
}

/** Opens one ledger per named database. Initialization and CAS are atomic
 * across connections; page staging never spans an async iterator await. */
export async function openOriginalPickupLedgerStore(options:OriginalPickupLedgerStoreOptions):Promise<IndexedDBOriginalPickupLedgerStore> {
 if(!options||typeof options.databaseName!=='string'||!options.databaseName.length||options.databaseName.length>128)throw Error('Invalid pickup ledger database name');
 const pageSize=options.pageSize??16,initialKey=key(options.initialKey??'pickups-initial');
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>16)throw Error('Invalid pickup ledger storage page size');
 const factory=options.factory??globalThis.indexedDB;if(!factory||typeof factory.open!=='function')throw Error('IndexedDB pickup ledger storage unavailable');
 const database=await new Promise<IDBDatabase>((resolve,reject)=>{
  let settled=false;const request=factory.open(options.databaseName,2);
  const fail=(error:unknown)=>{if(settled)return;settled=true;reject(error);};
  request.onblocked=()=>fail(Error('Pickup ledger database open blocked'));
  request.onerror=()=>fail(request.error??Error('Pickup ledger database open failed'));
  request.onupgradeneeded=event=>{
   if(settled){request.transaction?.abort();return;}
   try{
    const db=request.result,transaction=request.transaction!;
    if(event.oldVersion===0){db.createObjectStore(ROOTS);const pages=db.createObjectStore(PAGES,{keyPath:['root','page']});pages.createIndex('root','root');db.createObjectStore(NAMESPACES,{keyPath:'key'});}
    else if(event.oldVersion!==1)throw Error('Unsupported pickup ledger database version');
    const leases=db.createObjectStore(LEASES,{keyPath:['owner','id']});leases.createIndex('root','root');leases.createIndex('owner','owner');
    if(event.oldVersion===1){
     // Only CURRENT has authoritative v1 root metadata. Unknown historical
     // namespaces remain untouched and are ineligible for pinning/reclamation.
     const roots=transaction.objectStore(ROOTS),current=roots.get(CURRENT);
     current.onsuccess=()=>{
      try{
       if(current.result===undefined)return;
       const schema=roots.get(SCHEMA);schema.onsuccess=()=>{
        try{
         const size=schema.result?.pageSize;if(!Number.isInteger(size)||size<1||size>16)throw Error('Invalid legacy pickup ledger page size');
         const root=rootCopy(current.result as PickupLedgerRoot,size),namespaces=transaction.objectStore(NAMESPACES),namespace=namespaces.get(root.key);
         namespace.onsuccess=()=>{
          try{const owned=namespace.result as Namespace|undefined;if(!owned||owned.key!==root.key||owned.state!=='committed')throw Error('Invalid legacy pickup ledger current namespace');namespaces.put({...owned,root} satisfies Namespace);}
          catch(error){fail(error);transaction.abort();}
         };
        }catch(error){fail(error);transaction.abort();}
       };
      }catch(error){fail(error);transaction.abort();}
     };
    }
   }
   catch(error){fail(error);request.transaction?.abort();}
  };
  request.onsuccess=()=>{
   const db=request.result;if(settled){db.close();return;}
   if(![ROOTS,PAGES,NAMESPACES,LEASES].every(name=>db.objectStoreNames.contains(name))){db.close();fail(Error('Invalid pickup ledger database schema'));return;}
   // Inspect an existing version's key paths as well as its store names. Wait
   // for this metadata-only transaction to finish before exposing the store.
   let transaction:IDBTransaction;
   try{
    transaction=db.transaction([ROOTS,PAGES,NAMESPACES,LEASES],'readonly');
    const roots=transaction.objectStore(ROOTS),pages=transaction.objectStore(PAGES),namespaces=transaction.objectStore(NAMESPACES),leases=transaction.objectStore(LEASES),path=pages.keyPath,leasePath=leases.keyPath;
    if(roots.keyPath!==null||roots.autoIncrement||!Array.isArray(path)||path.length!==2||path[0]!=='root'||path[1]!=='page'||pages.autoIncrement||namespaces.keyPath!=='key'||namespaces.autoIncrement||!pages.indexNames.contains('root'))throw Error('Invalid pickup ledger database key schema');
    const index=pages.index('root');if(index.keyPath!=='root'||index.unique||index.multiEntry)throw Error('Invalid pickup ledger database root index');
    if(!Array.isArray(leasePath)||leasePath.length!==2||leasePath[0]!=='owner'||leasePath[1]!=='id'||leases.autoIncrement||!leases.indexNames.contains('root')||!leases.indexNames.contains('owner'))throw Error('Invalid pickup ledger database lease schema');
    for(const name of ['root','owner']){const index=leases.index(name);if(index.keyPath!==name||index.unique||index.multiEntry)throw Error('Invalid pickup ledger database lease index');}
   }catch(error){db.close();fail(error);return;}
   transaction.onabort=()=>{db.close();fail(transaction.error??Error('Pickup ledger schema inspection aborted'));};
   transaction.oncomplete=()=>{if(settled){db.close();return;}settled=true;resolve(db);};
  };
 });
 let store:IndexedDBOriginalPickupLedgerStore;
 try{store=new IndexedDBOriginalPickupLedgerStore(database,pageSize);}catch(error){database.close();throw error;}
 try{await store.initialize(initialKey);return store;}catch(error){try{await store.close();}catch(closeError){throw new AggregateError([error,closeError],'Pickup ledger open and lease cleanup failed');}throw error;}
}
