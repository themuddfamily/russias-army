import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {openOriginalPickupLedgerStore} from './originalPickupLedgerStore';
import {OriginalPickupLedger} from '../shared/originalPickupLedger';
import type {PickupLedgerPageWrite,PickupLedgerRoot} from '../shared/originalPickupLedger';
import type {ReceiverPickup} from '../shared/originalReceiverModelWorld';

const record=(id:number):ReceiverPickup=>({id,handle:'reused-source-gun',weapon:'launcher',position:{x:id,y:0,z:0}});
const root=(expected:PickupLedgerRoot,key:string,count:number,highWaterId=count):PickupLedgerRoot=>({version:expected.version+1,key,count,pageCount:Math.ceil(count/16),highWaterId});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const nextTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
async function* pages(count:number,firstId=1):AsyncGenerator<PickupLedgerPageWrite>{
 for(let page=0;page<Math.ceil(count/16);page++){
  await nextTask();const length=Math.min(16,count-page*16);
  yield {page,records:Array.from({length},(_v,i)=>record(firstId+page*16+i))};
 }
}
async function inspect<T>(factory:IDBFactory,name:string,store:string,requestAt:(objectStore:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const database=await new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 return new Promise<T>((resolve,reject)=>{
  const transaction=database.transaction(store,'readonly'),request=requestAt(transaction.objectStore(store));let result:T;
  request.onsuccess=()=>{result=request.result;};
  transaction.oncomplete=()=>{database.close();resolve(result);};transaction.onabort=()=>{database.close();reject(transaction.error);};
 });
}
async function sweep(store:Awaited<ReturnType<typeof openOriginalPickupLedgerStore>>):Promise<number>{
 let after:string|undefined,deleted=0;
 for(let step=0;step<24;step++){const result=await store.collectGarbage(after);deleted+=result.pagesDeleted;if(result.done)return deleted;after=result.after;}
 throw Error('Bounded fixture GC did not finish');
}
async function write(factory:IDBFactory,name:string,store:string,body:(objectStore:IDBObjectStore)=>void):Promise<void>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 await new Promise<void>((resolve,reject)=>{const transaction=db.transaction(store,'readwrite');body(transaction.objectStore(store));transaction.oncomplete=()=>{db.close();resolve();};transaction.onabort=()=>{db.close();reject(transaction.error);};});
}

// fake-indexeddb runs actual IDB request/transaction event machinery in Node.
// These verify the backend's streaming and CAS, not browser quota/durability,
// user-origin eviction, native drop ordering or renderer/factory integration.
describe('IndexedDB pickup ledger store (CPU IndexedDB event implementation)',()=>{
 it('composes the ledger with IndexedDB across the seventeenth independent drop and old-position deletion',async()=>{
  const factory=new IDBFactory(),store=await openOriginalPickupLedgerStore({factory,databaseName:'paired-ledger'});
  const ledger=new OriginalPickupLedger(store);try{
   await ledger.initialize();const first=ledger.beginTransaction();for(let id=1;id<=16;id++)await first.append(record(id));await first.commit();await ledger.flushCleanup();
   const seventeenth=ledger.beginTransaction();await seventeenth.append(record(17));await seventeenth.commit();await ledger.flushCleanup();expect(ledger.root.count).toBe(17);
   const collect=ledger.beginTransaction();expect(await collect.lookup(1)).toEqual(record(1));expect(await collect.delete(1,'reused-source-gun')).toBe(true);await collect.commit();await ledger.flushCleanup();
   let expected=2;for await(const row of ledger.entries())expect(row).toEqual(record(expected++));expect(expected).toBe(18);
   expect(await store.readRoot()).toEqual(ledger.root);expect(ledger.root.highWaterId).toBe(17);
  }finally{await ledger.close();await store.close();}
 });
 it('initializes once, validates existing key paths/page size and rejects reads after close',async()=>{
  const factory=new IDBFactory(),store=await openOriginalPickupLedgerStore({factory,databaseName:'fresh'});
  const initial={version:0,count:0,pageCount:0,key:'pickups-initial',highWaterId:0};expect(await store.readRoot()).toEqual(initial);
  const reopened=await openOriginalPickupLedgerStore({factory,databaseName:'fresh'});expect(await reopened.readRoot()).toEqual(initial);await reopened.close();
  await expect(openOriginalPickupLedgerStore({factory,databaseName:'fresh',pageSize:8})).rejects.toThrow(/page size mismatch/);
  await store.close();await expect(store.readRoot()).rejects.toThrow(/closed/);
  await new Promise<void>((resolve,reject)=>{
   const request=factory.open('wrong-schema',1);request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('roots');const pages=db.createObjectStore('pages',{keyPath:'wrong'});pages.createIndex('root','root');db.createObjectStore('namespaces',{keyPath:'key'});};
   request.onerror=()=>reject(request.error);request.onsuccess=()=>{request.result.close();resolve();};
  });
  await expect(openOriginalPickupLedgerStore({factory,databaseName:'wrong-schema'})).rejects.toThrow(/key schema/);
 });
 it('streams three pages across event-loop tasks, exposes no staging root and publishes only after the complete stream',async()=>{
  const factory=new IDBFactory(),store=await openOriginalPickupLedgerStore({factory,databaseName:'stream'});
  try{
   const base=await store.readRoot(),next=root(base,'generation-three-pages',33);let pageCount=0;
   const source=(async function*(){for await(const page of pages(33)){expect(await store.readRoot()).toEqual(base);pageCount++;yield page;}expect(await store.readRoot()).toEqual(base);await expect(store.readPage(next.key,0)).rejects.toThrow(/not published/);})();
   await store.publish(base,next,source);expect(pageCount).toBe(3);expect(await store.readRoot()).toEqual(next);
   for(let page=0;page<3;page++){const records=await store.readPage(next.key,page);expect(records).toHaveLength(page===2?1:16);expect(records[0].id).toBe(page*16+1);expect(Object.isFrozen(records)).toBe(true);expect(Object.isFrozen(records[0].position)).toBe(true);}
  }finally{await store.close();}
 });
 it('compares roots atomically across two connections after a stale publisher already staged its own page',async()=>{
  const factory=new IDBFactory(),first=await openOriginalPickupLedgerStore({factory,databaseName:'race'}),second=await openOriginalPickupLedgerStore({factory,databaseName:'race'});
  const staged=deferred(),release=deferred();try{
   const base=await first.readRoot(),loser=root(base,'loser-generation',1),winner=root(base,'winner-generation',1);
   const source=(async function*(){yield {page:0,records:[record(1)]};staged.resolve();await release.promise;})();
   const pending=first.publish(base,loser,source),rejected=expect(pending).rejects.toThrow(/Stale.*publication/);await staged.promise;
   await second.publish(base,winner,pages(1));release.resolve();await rejected;
   expect(await first.readRoot()).toEqual(winner);expect(await second.readRoot()).toEqual(winner);expect(await first.readPage(winner.key,0)).toEqual([record(1)]);
   expect(await inspect(factory,'race','pages',s=>s.index('root').count(loser.key))).toBe(0);expect(await inspect(factory,'race','namespaces',s=>s.get(loser.key))).toBeUndefined();
  }finally{release.resolve();await first.close();await second.close();}
 });
 it('cleans more than one cursor batch after a stream fails while preserving the prior published root',async()=>{
  const factory=new IDBFactory(),store=await openOriginalPickupLedgerStore({factory,databaseName:'cleanup'});try{
   const base=await store.readRoot(),failed=root(base,'failed-seventeen-pages',17*16);
   const source=(async function*(){yield* pages(17*16);throw Error('source stream failed after staging');})();
   await expect(store.publish(base,failed,source)).rejects.toThrow('source stream failed after staging');expect(await store.readRoot()).toEqual(base);
   expect(await inspect(factory,'cleanup','pages',s=>s.index('root').count(failed.key))).toBe(0);expect(await inspect(factory,'cleanup','namespaces',s=>s.get(failed.key))).toBeUndefined();
   // Cleanup released the failed staging namespace; no historical committed
   // namespace was removed. A fresh attempt may claim this never-published key.
   await store.publish(base,failed,pages(17*16));expect(await store.readRoot()).toEqual(failed);
  }finally{await store.close();}
 });
 it('closes between stream pages, rejects late publication and cleans its already staged page',async()=>{
  const factory=new IDBFactory(),store=await openOriginalPickupLedgerStore({factory,databaseName:'closed'}),staged=deferred(),release=deferred();
  const base=await store.readRoot(),next=root(base,'closed-generation',17);
  const source=(async function*(){yield {page:0,records:Array.from({length:16},(_v,i)=>record(i+1))};staged.resolve();await release.promise;yield {page:1,records:[record(17)]};})();
  const pending=store.publish(base,next,source),rejected=expect(pending).rejects.toThrow(/closed/);
  try{await staged.promise;await store.close();await expect(store.readRoot()).rejects.toThrow(/closed/);release.resolve();await rejected;
   expect(await inspect(factory,'closed','roots',s=>s.get('current'))).toEqual(base);expect(await inspect(factory,'closed','pages',s=>s.index('root').count(next.key))).toBe(0);expect(await inspect(factory,'closed','namespaces',s=>s.get(next.key))).toBeUndefined();
  }finally{release.resolve();await store.close();}
 });
 it('keeps an old immutable root readable after later publication and rejects reuse of a committed namespace',async()=>{
  const factory=new IDBFactory(),store=await openOriginalPickupLedgerStore({factory,databaseName:'retained'});try{
   const empty=await store.readRoot(),old=root(empty,'retained-old',17);await store.publish(empty,old,pages(17));
   const next=root(old,'retained-new',1,18);await store.publish(old,next,pages(1,18));expect(await store.readRoot()).toEqual(next);
   expect((await store.readPage(old.key,0)).map(r=>r.id)).toEqual(Array.from({length:16},(_v,i)=>i+1));expect(await store.readPage(old.key,1)).toEqual([record(17)]);
   const reused=root(next,old.key,1,19);await expect(store.publish(next,reused,pages(1,19))).rejects.toThrow();expect(await store.readRoot()).toEqual(next);expect(await store.readPage(old.key,1)).toEqual([record(17)]);
  }finally{await store.close();}
 });
 it('protects an old root with durable leases across connections and reclaims its pages only after explicit unpin',async()=>{
  const factory=new IDBFactory(),first=await openOriginalPickupLedgerStore({factory,databaseName:'leased'}),second=await openOriginalPickupLedgerStore({factory,databaseName:'leased'});
  try{
   const base=await first.readRoot(),old=root(base,'aaa-old-leased',33);await first.publishAndPin(base,old,pages(33),'lease-old');
   const pinned=await second.readRootAndPin('lease-remote');expect(pinned).toEqual(old);
   const current=root(old,'bbb-current',1,34);await first.publishAndPin(old,current,pages(1,34),'lease-current');
   await sweep(first);expect(await first.readPage(old.key,2)).toEqual([record(33)]);
   await first.unpin('lease-old');await sweep(first);expect(await first.readPage(old.key,2)).toEqual([record(33)]);
   await second.unpin('lease-remote');expect(await sweep(first)).toBe(3);await expect(first.readPage(old.key,0)).rejects.toThrow(/not published/);expect(await first.readRoot()).toEqual(current);expect(await first.readPage(current.key,0)).toEqual([record(34)]);
   expect((await inspect(factory,'leased','namespaces',s=>s.get(old.key))).state).toBe('tombstone');await expect(first.pin(old,'lease-too-late')).rejects.toThrow(/metadata/);
  }finally{await first.close();await second.close();}
 });
 it('serializes cross-connection pin-versus-GC so a winning pin protects pages and a retired root cannot acquire a late pin',async()=>{
  const factory=new IDBFactory(),first=await openOriginalPickupLedgerStore({factory,databaseName:'pin-race'}),second=await openOriginalPickupLedgerStore({factory,databaseName:'pin-race'});
  try{
   const base=await first.readRoot(),old=root(base,'aaa-race-old',1);await first.publish(base,old,pages(1));const next=root(old,'bbb-race-current',1,2);await first.publish(old,next,pages(1,2));
   const pin=second.pin(old,'lease-first');const gc=first.collectGarbage();await Promise.all([pin,gc]);expect(await second.readPage(old.key,0)).toEqual([record(1)]);
   await second.unpin('lease-first');const retiring=first.collectGarbage(),late=second.pin(old,'lease-late');const results=await Promise.allSettled([retiring,late]);expect(results[0].status).toBe('fulfilled');expect(results[1].status).toBe('rejected');
   expect(await inspect(factory,'pin-race','leases',s=>s.count())).toBe(0);await expect(first.readPage(old.key,0)).rejects.toThrow(/not published/);expect(await first.readRoot()).toEqual(next);
  }finally{await first.close();await second.close();}
 });
 it('rejects forged root metadata without adding a pin and bounds each owner to six durable lease IDs',async()=>{
  const factory=new IDBFactory(),store=await openOriginalPickupLedgerStore({factory,databaseName:'forged'});try{
   const base=await store.readRoot(),next=root(base,'known-root',1);await store.publish(base,next,pages(1));
   await expect(store.pin({...next,highWaterId:2},'lease-forged')).rejects.toThrow(/metadata/);expect(await inspect(factory,'forged','leases',s=>s.count())).toBe(0);
   for(let i=0;i<6;i++)expect(await store.readRootAndPin(`lease-${i}`)).toEqual(next);await expect(store.pin(next,'lease-seven')).rejects.toThrow(/lease budget/);
   await store.unpin('lease-missing');for(let i=0;i<6;i++)await store.unpin(`lease-${i}`);expect(await inspect(factory,'forged','leases',s=>s.count())).toBe(0);
   await write(factory,'forged','roots',s=>s.put({...next,highWaterId:2},'current'));await expect(store.readRootAndPin('lease-corrupt-current')).rejects.toThrow(/metadata/);expect(await inspect(factory,'forged','leases',s=>s.count())).toBe(0);
  }finally{await store.close();}
 });
 it('pins a ledger iterator at creation even before its first next and releases it when the life closes',async()=>{
  const factory=new IDBFactory(),store=await openOriginalPickupLedgerStore({factory,databaseName:'unstarted'}),collector=await openOriginalPickupLedgerStore({factory,databaseName:'unstarted'}),ledger=new OriginalPickupLedger(store);
  try{
   await ledger.initialize();const first=ledger.beginTransaction();await first.append(record(1));const old=await first.commit();await ledger.flushCleanup();
   const dormant=ledger.entries()[Symbol.asyncIterator]();const second=ledger.beginTransaction();await second.append(record(2));await second.commit();await ledger.flushCleanup();await sweep(collector);expect(await collector.readPage(old.key,0)).toEqual([record(1)]);
   await ledger.close();await store.close();await sweep(collector);await expect(collector.readPage(old.key,0)).rejects.toThrow(/not published/);await expect(dormant.next()).rejects.toThrow(/closed/);
  }finally{await ledger.close();await store.close();await collector.close();}
 });
 it('upgrades v1 CURRENT metadata but preserves unknown historical roots and refuses to lease them',async()=>{
  const factory=new IDBFactory(),legacy:PickupLedgerRoot={version:1,count:1,pageCount:1,key:'legacy-current',highWaterId:2};
  await new Promise<void>((resolve,reject)=>{
   const request=factory.open('legacy',1);request.onupgradeneeded=()=>{const db=request.result,roots=db.createObjectStore('roots'),pages=db.createObjectStore('pages',{keyPath:['root','page']}),namespaces=db.createObjectStore('namespaces',{keyPath:'key'});pages.createIndex('root','root');roots.add({pageSize:16},'schema');roots.add(legacy,'current');for(const name of ['legacy-old-unknown','legacy-current'])namespaces.add({key:name,owner:'legacy-owner',state:'committed'});pages.add({root:'legacy-old-unknown',page:0,records:[record(1)]});pages.add({root:legacy.key,page:0,records:[record(2)]});};request.onerror=()=>reject(request.error);request.onsuccess=()=>{request.result.close();resolve();};
  });
  const store=await openOriginalPickupLedgerStore({factory,databaseName:'legacy'});try{
   expect(await store.readRootAndPin('lease-legacy-current')).toEqual(legacy);await store.unpin('lease-legacy-current');await expect(store.pin({...legacy,key:'legacy-old-unknown',highWaterId:1},'lease-unknown')).rejects.toThrow(/metadata/);
   const next=root(legacy,'legacy-next',1,3);await store.publish(legacy,next,pages(1,3));await sweep(store);expect(await store.readPage('legacy-old-unknown',0)).toEqual([record(1)]);expect((await inspect(factory,'legacy','namespaces',s=>s.get('legacy-old-unknown'))).root).toBeUndefined();await expect(store.readPage(legacy.key,0)).rejects.toThrow(/not published/);
  }finally{await store.close();}
 });
 it('releases only its own leases on close and permits retry after an injected lease-cleanup failure',async()=>{
  const factory=new IDBFactory(),first=await openOriginalPickupLedgerStore({factory,databaseName:'close-retry'}),second=await openOriginalPickupLedgerStore({factory,databaseName:'close-retry'});try{
   await first.readRootAndPin('lease-first');await second.readRootAndPin('lease-second');const db=(first as unknown as {database:IDBDatabase}).database,original=db.transaction.bind(db);let fail=true;
   const fault=vi.spyOn(db,'transaction').mockImplementation((...args:Parameters<IDBDatabase['transaction']>)=>{if(fail&&args[1]==='readwrite'&&Array.isArray(args[0])&&args[0].length===1&&args[0][0]==='leases'){fail=false;throw Error('lease cleanup injection');}return original(...args);});
   await expect(first.close()).rejects.toThrow('lease cleanup injection');await expect(first.readRoot()).rejects.toThrow(/closed/);expect(await inspect(factory,'close-retry','leases',s=>s.count())).toBe(2);
   fault.mockRestore();await first.close();expect(await inspect(factory,'close-retry','leases',s=>s.count())).toBe(1);await second.unpin('lease-second');expect(await inspect(factory,'close-retry','leases',s=>s.count())).toBe(0);
  }finally{await first.close();await second.close();}
 });
 it('keeps the first publisher tracked after a second overlap rejection so close cancels and cleans the correct staging namespace',async()=>{
  const factory=new IDBFactory(),store=await openOriginalPickupLedgerStore({factory,databaseName:'overlap-close'}),staged=deferred(),release=deferred();
  const base=await store.readRoot(),first=root(base,'first-staging',1),second=root(base,'second-staging',1),source=(async function*(){yield {page:0,records:[record(1)]};staged.resolve();await release.promise;})();
  const pending=store.publishAndPin(base,first,source,'lease-first'),rejected=expect(pending).rejects.toThrow(/closed/);
  try{await staged.promise;await expect(store.publish(base,second,pages(1))).rejects.toThrow(/already pending/);await store.close();await rejected;expect(await inspect(factory,'overlap-close','roots',s=>s.get('current'))).toEqual(base);expect(await inspect(factory,'overlap-close','pages',s=>s.count())).toBe(0);expect(await inspect(factory,'overlap-close','leases',s=>s.count())).toBe(0);}
  finally{release.resolve();await store.close();}
 });
});
