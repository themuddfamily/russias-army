import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OriginalPickupLedger,type PickupLedgerStore,type PickupLedgerRoot,type PickupLedgerPageWrite} from './originalPickupLedger';
import type {ReceiverPickup} from './originalReceiverModelWorld';

// Actual filesystem-backed pages exercise asynchronous external I/O without
// opening a browser. This verifies the ledger contract, not IndexedDB itself.
class DiskStore implements PickupLedgerStore {
 peakRead=0;peakWrite=0;failPage:number|undefined;failUnpin=false;
 readonly pins=new Map<string,PickupLedgerRoot>();
 constructor(readonly directory:string){}
 async readRoot():Promise<PickupLedgerRoot>{return JSON.parse(await readFile(join(this.directory,'root.json'),'utf8'));}
 async pin(root:PickupLedgerRoot,id:string):Promise<void>{
  const actual=JSON.parse(await readFile(join(this.directory,root.key,'metadata.json'),'utf8'));
  if(JSON.stringify(actual)!==JSON.stringify(root))throw Error('invalid disk root lease');
  if(this.pins.has(id))throw Error('duplicate disk lease');this.pins.set(id,root);
 }
 async readRootAndPin(id:string):Promise<PickupLedgerRoot>{const root=await this.readRoot();await this.pin(root,id);return root;}
 async unpin(id:string):Promise<void>{if(this.failUnpin)throw Error('injected disk unpin failure');this.pins.delete(id);}
 async publishAndPin(expected:PickupLedgerRoot,next:PickupLedgerRoot,pages:AsyncIterable<PickupLedgerPageWrite>,id:string):Promise<void>{
  // Filesystem adapter has no collector and serializes successful publication.
  // IndexedDB tests verify atomic CAS plus lease acquisition across connections.
  await this.publish(expected,next,pages);await this.pin(next,id);
 }
 async readPage(key:string,page:number):Promise<readonly ReceiverPickup[]>{
  const rows=JSON.parse(await readFile(join(this.directory,key,String(page)),'utf8')) as ReceiverPickup[];
  this.peakRead=Math.max(this.peakRead,rows.length);return rows;
 }
 async publish(expected:PickupLedgerRoot,next:PickupLedgerRoot,pages:AsyncIterable<PickupLedgerPageWrite>):Promise<void>{
  const staging=join(this.directory,next.key);await mkdir(staging);
  try{
   for await(const page of pages){
    this.peakWrite=Math.max(this.peakWrite,page.records.length);
    if(page.page===this.failPage)throw Error('injected disk write failure');
    await writeFile(join(staging,String(page.page)),JSON.stringify(page.records));
   }
   if(JSON.stringify(await this.readRoot())!==JSON.stringify(expected))throw Error('stale disk root');
   await writeFile(join(staging,'metadata.json'),JSON.stringify(next));
   // The tests serialize successful writes. The browser store must implement
   // this compare/publication in one actual storage transaction.
   const temporary=join(staging,'next-root');await writeFile(temporary,JSON.stringify(next));
   await rename(temporary,join(this.directory,'root.json'));
  }catch(error){await rm(staging,{recursive:true,force:true});throw error;}
 }
}
const directories:string[]=[];
const ledgers:OriginalPickupLedger[]=[];
afterEach(async()=>{for(const ledger of ledgers.splice(0))await ledger.close();for(const path of directories.splice(0))await rm(path,{recursive:true,force:true});});
const pickup=(id:number):ReceiverPickup=>({id,handle:'reused-rpg',weapon:'rpg',position:{x:id*300,y:1000,z:0}});
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'ra-pickups-'));directories.push(directory);
 const store=new DiskStore(directory),root:PickupLedgerRoot={version:0,count:0,pageCount:0,key:'initial',highWaterId:0};
 await writeFile(join(directory,'root.json'),JSON.stringify(root));
 await mkdir(join(directory,root.key));await writeFile(join(directory,root.key,'metadata.json'),JSON.stringify(root));
 const ledger=new OriginalPickupLedger(store);ledgers.push(ledger);await ledger.initialize();return {store,ledger};
}
async function seed(ledger:OriginalPickupLedger,count:number){
 for(let first=1;first<=count;first+=16){const tx=ledger.beginTransaction();for(let id=first;id<=Math.min(first+15,count);id++)await tx.append(pickup(id));await tx.commit();await ledger.flushCleanup();}
}
describe('external paged historical pickup ledger',()=>{
 it('retains 257 independent positions sharing one gun with sixteen-record pages',async()=>{
  const {ledger,store}=await fixture();await seed(ledger,257);
  let count=0;for await(const record of ledger.entries()){count++;expect(record).toEqual(pickup(count));expect(Object.isFrozen(record.position)).toBe(true);}
  expect(count).toBe(257);expect(ledger.root).toMatchObject({count:257,pageCount:17,highWaterId:257});
  expect(store.peakRead).toBe(16);expect(store.peakWrite).toBe(16);
 });
 it('deletes cross-page historical IDs once without deduplicating their shared handle',async()=>{
  const {ledger}=await fixture();await seed(ledger,33);const tx=ledger.beginTransaction();
  expect(await tx.delete(1,'reused-rpg')).toBe(true);expect(await tx.delete(17,'reused-rpg')).toBe(true);
  expect(await tx.delete(33,'reused-rpg')).toBe(true);expect(await tx.delete(17,'reused-rpg')).toBe(false);
  await tx.commit();await ledger.flushCleanup();let expected=2;for await(const record of ledger.entries()){if(expected===17)expected++;expect(record.id).toBe(expected++);}
  expect(ledger.root.count).toBe(30);expect(ledger.root.highWaterId).toBe(33);
 });
 it('keeps the published root intact after a later page write fails, then retries changed failure input',async()=>{
  const {ledger,store}=await fixture();await seed(ledger,33);const before=ledger.root,tx=ledger.beginTransaction();await tx.append(pickup(34));
  store.failPage=1;await expect(tx.commit()).rejects.toThrow('injected disk write failure');
  expect(ledger.root).toBe(before);expect(await store.readRoot()).toEqual(before);
  store.failPage=undefined;const retry=ledger.beginTransaction();await retry.append(pickup(34));await retry.commit();expect(ledger.root.count).toBe(34);
 });
 it('rejects stale concurrent transactions and preserves an already captured read root',async()=>{
  const {ledger}=await fixture();await seed(ledger,17);const historical=ledger.entries(),a=ledger.beginTransaction(),b=ledger.beginTransaction();
  await a.append(pickup(18));await a.commit();await expect(b.append(pickup(19))).rejects.toThrow('Stale');
  b.rollback();
  let count=0;for await(const record of historical){count++;expect(record.id).toBe(count);}expect(count).toBe(17);
 });
 it('rejects another ledger instance at the external root publication frontier',async()=>{
  const {ledger,store}=await fixture();await seed(ledger,17);
  const competing=new OriginalPickupLedger(store);ledgers.push(competing);await competing.initialize();
  const a=ledger.beginTransaction(),b=competing.beginTransaction();await a.append(pickup(18));await b.append(pickup(19));
  await a.commit();await expect(b.commit()).rejects.toThrow('stale disk root');
  expect(await store.readRoot()).toEqual(ledger.root);expect(competing.root.count).toBe(17);
  b.rollback();
 });
 it('bounds staged operations and protects handle identity, rollback and high-water IDs',async()=>{
  const {ledger}=await fixture();const tx=ledger.beginTransaction();for(let id=1;id<=16;id++)await tx.append(pickup(id));
  await expect(tx.append(pickup(17))).rejects.toThrow('operation budget');tx.rollback();expect(ledger.root.count).toBe(0);
  await seed(ledger,1);const removal=ledger.beginTransaction();await expect(removal.delete(1,'another-gun')).rejects.toThrow('Stale pickup ledger handle');
  expect(await removal.delete(1,'reused-rpg')).toBe(true);await removal.commit();await ledger.flushCleanup();expect(ledger.root.count).toBe(0);
  const next=ledger.beginTransaction();await expect(next.append(pickup(1))).rejects.toThrow('must increase');await next.append(pickup(2));await next.commit();
  expect(ledger.root.highWaterId).toBe(2);
 });
 it('rejects malformed disk pages and invalidates readers and transactions when closed',async()=>{
  const {ledger,store}=await fixture();await seed(ledger,1);const key=ledger.root.key;
  await writeFile(join(store.directory,key,'0'),JSON.stringify([pickup(1),pickup(2)]));
  await expect(ledger.entries()[Symbol.asyncIterator]().next()).rejects.toThrow('page length');
  const tx=ledger.beginTransaction(),reader=ledger.entries(),closing=ledger.close();
  await expect(tx.lookup(1)).rejects.toThrow('life closed');await expect(reader[Symbol.asyncIterator]().next()).rejects.toThrow('life closed');
  tx.rollback();await closing;
 });
 it('caps concurrent reader and transaction buffers and releases them on rollback or iterator return',async()=>{
  const {ledger}=await fixture();await seed(ledger,17);
  const a=ledger.beginTransaction(),b=ledger.beginTransaction();expect(()=>ledger.beginTransaction()).toThrow('transaction budget');
  a.rollback();const c=ledger.beginTransaction();b.rollback();c.rollback();
  const first=ledger.entries()[Symbol.asyncIterator](),second=ledger.entries()[Symbol.asyncIterator]();
  expect(()=>ledger.entries()).toThrow('iterator handle budget');
  await first.next();await second.next();
  await first.return?.();await second.return?.();await ledger.flushCleanup();let count=0;for await(const _record of ledger.entries())count++;expect(count).toBe(17);
 });
 it('pins an unstarted old-root reader across publication and releases it on explicit return',async()=>{
  const {ledger,store}=await fixture();await seed(ledger,17);const old=ledger.root,reader=ledger.entries()[Symbol.asyncIterator]();
  const tx=ledger.beginTransaction();await tx.append(pickup(18));await tx.commit();
  expect([...store.pins.values()].some(root=>root.key===old.key)).toBe(true);
  await reader.return?.();await ledger.flushCleanup();expect([...store.pins.values()].some(root=>root.key===old.key)).toBe(false);
  await ledger.close();expect(store.pins.size).toBe(0);
 });
 it('reports failed retired-pin cleanup separately from successful publication and applies backpressure',async()=>{
  const {ledger,store}=await fixture();await seed(ledger,1);const tx=ledger.beginTransaction();await tx.append(pickup(2));store.failUnpin=true;
  try{
   await tx.commit();expect(ledger.root.count).toBe(2);expect(await store.readRoot()).toEqual(ledger.root);
   await expect(ledger.flushCleanup()).rejects.toThrow('pin cleanup failed');expect(ledger.cleanupFailed.length).toBe(1);
   expect(()=>ledger.beginTransaction()).toThrow('cleanup requires drain');expect(()=>ledger.entries()).toThrow('cleanup requires drain');
  }finally{store.failUnpin=false;await ledger.flushCleanup();}
  const later=ledger.beginTransaction();await later.append(pickup(3));await later.commit();await ledger.flushCleanup();expect(ledger.root.count).toBe(3);
 });
 it('drains a paused transaction iterator and drops its staged changes on close',async()=>{
  const {ledger,store}=await fixture();await seed(ledger,17);const tx=ledger.beginTransaction();await tx.append(pickup(18));
  const cursor=tx.entries()[Symbol.asyncIterator]();expect((await cursor.next()).value?.id).toBe(1);
  await ledger.close();expect(store.pins.size).toBe(0);expect((await store.readRoot()).count).toBe(17);
  await expect(tx.lookup(18)).rejects.toThrow(/closed/);await cursor.return?.();tx.rollback();
 });
 it('waits for an already issued transaction page read before releasing its durable pin',async()=>{
  const {ledger,store}=await fixture();await seed(ledger,17);
  let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(resolve=>{enter=resolve;}),released=new Promise<void>(resolve=>{release=resolve;});
  const read=store.readPage.bind(store);store.readPage=async(key,page)=>{enter();await released;return read(key,page);};
  const tx=ledger.beginTransaction(),lookup=tx.lookup(17),rejection=expect(lookup).rejects.toThrow(/closed/);
  await entered;const closing=ledger.close();expect(store.pins.size).toBeGreaterThan(0);
  release();await rejection;await closing;expect(store.pins.size).toBe(0);tx.rollback();
 });
});
