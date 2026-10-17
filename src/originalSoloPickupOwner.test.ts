import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloPickupOwner} from './originalSoloPickupOwner';
import {openOriginalPickupBatchReader} from './originalPickupBatchWindow';
import {openOriginalPickupBatchStore,type PickupBatchManifest} from './originalPickupBatchStore';

async function fixture(){const store=await openOriginalPickupBatchStore({databaseName:'pickup-owner',factory:new IDBFactory(),initial:{version:0,observers:[]}});return {store,owner:new OriginalSoloPickupOwner(store,'owner')};}
describe('per-life paged pickup ownership',()=>{
 it('publishes authentic fresh lives and retirement while preserving other observers',async()=>{
  const {store,owner}=await fixture();try{
   const a=await owner.registerLife('A',1),b=await owner.registerLife('B',1);
   expect(owner.sourceAt('A',1)).toBe(a);expect(owner.sourceAt('B',1)).toBe(b);
   let manifest=await store.readManifest();expect(manifest.version).toBe(2);
   expect(manifest.observers.every(row=>row.lastReceiptTick===-1&&row.prefix.kind==='callback'&&row.prefix.callback===0&&row.root.count===0&&row.root.highWaterId===0)).toBe(true);
   await owner.retireLife('A',1);expect(()=>owner.sourceAt('A',1)).toThrow();
   manifest=await store.readManifest();expect(manifest.observers.map(row=>row.observer)).toEqual(['B']);expect(owner.sourceAt('B',1)).toBe(b);
   const next=await owner.registerLife('A',2);expect(next).not.toBe(a);expect(next.history.lifeGeneration).toBe(2);
   expect((await store.readManifest()).observers.find(row=>row.observer==='A')).toMatchObject({lifeGeneration:2,lastReceiptTick:-1,prefix:{sceneGeneration:2,callback:0}});
   await expect(owner.registerLife('A',2)).rejects.toThrow(/advance/);await expect(owner.retireLife('A',1)).rejects.toThrow(/unavailable/);
   expect(owner.awaiting).toBe(false);
  }finally{await store.close();}
 });
 it('fences roster mutation and a second cohort until the owned cohort aborts',async()=>{
  const {store,owner}=await fixture();try{
   await owner.registerLife('A',1);const cohort=owner.createCohort();expect(owner.awaiting).toBe(true);
   expect(()=>owner.createCohort()).toThrow(/active/);await expect(owner.registerLife('B',1)).rejects.toThrow(/drain/);
   await cohort.abort();expect(owner.awaiting).toBe(false);await owner.registerLife('B',1);
   const next=owner.createCohort();await next.abort();expect(owner.awaiting).toBe(false);
  }finally{await store.close();}
 });
 it('adopts a successful registration before cleanup failure and retries only the pin cleanup',async()=>{
  const {store,owner}=await fixture(),unpin=store.unpin.bind(store);let failed=false,attempts=0;
  const spy=vi.spyOn(store,'unpin').mockImplementation(async id=>{if(id.endsWith('-1-published')){attempts++;if(!failed){failed=true;throw Error('declared roster pin cleanup failure');}}await unpin(id);});
  try{
   await expect(owner.registerLife('A',1)).rejects.toThrow(/cleanup/);expect(owner.awaiting).toBe(true);
   const source=owner.sourceAt('A',1);expect((await store.readManifest()).version).toBe(1);
   await expect(owner.registerLife('A',2)).rejects.toThrow(/drain/);
   const first=owner.retryCleanup(),second=owner.retryCleanup();expect(second).toBe(first);await first;
   expect(attempts).toBe(2);expect(owner.awaiting).toBe(false);expect(owner.sourceAt('A',1)).toBe(source);expect((await store.readManifest()).version).toBe(1);
  }finally{spy.mockRestore();await store.close();}
 });
 it('releases an aborted seal without adopting a life or repeating a consumed writer',async()=>{
  const {store,owner}=await fixture(),begin=store.beginBatch.bind(store);let fail=true;
  const spy=vi.spyOn(store,'beginBatch').mockImplementation(async(...args)=>{
   const writer=await begin(...args),seal=writer.seal.bind(writer);
   return Object.freeze({...writer,seal:async(next:PickupBatchManifest)=>{if(fail){fail=false;await writer.abort();throw Error('declared consumed writer failure');}return seal(next);},abort:writer.abort.bind(writer)});
  });
  try{
   await expect(owner.registerLife('A',1)).rejects.toThrow(/consumed writer failure/);expect((await store.readManifest()).version).toBe(0);expect(()=>owner.sourceAt('A',1)).toThrow();expect(owner.awaiting).toBe(false);
   spy.mockRestore();await owner.registerLife('A',1);expect((await store.readManifest()).version).toBe(1);
  }finally{spy.mockRestore();await store.close();}
 });
 it('holds roster admission while a genuine pin operation is pending',async()=>{
  const {store,owner}=await fixture(),unpin=store.unpin.bind(store);let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  const spy=vi.spyOn(store,'unpin').mockImplementation(async id=>{if(id.endsWith('-1-published')){entered();await gate;}await unpin(id);});let work:Promise<unknown>|undefined;
  try{
   work=owner.registerLife('A',1);await started;expect(owner.awaiting).toBe(true);expect(owner.sourceAt('A',1).history.lifeGeneration).toBe(1);
   await expect(owner.retireLife('A',1)).rejects.toThrow(/drain/);release();await work;expect(owner.awaiting).toBe(false);
  }finally{release();await work?.catch(()=>{});spy.mockRestore();await store.close();}
 });
 it('retains a cohort fence when its terminal cleanup rejects',async()=>{
  const {store,owner}=await fixture();try{
   await owner.registerLife('A',1);const cohort=owner.createCohort();await expect(cohort.finish()).rejects.toThrow(/not published/);
   expect(owner.awaiting).toBe(true);await expect(owner.retireLife('A',1)).rejects.toThrow(/drain/);await cohort.abort();expect(owner.awaiting).toBe(false);
  }finally{await store.close();}
 });
 it('recreates an owner with the same label without colliding with committed roots',async()=>{
  const {store,owner}=await fixture();try{
   const original=await owner.registerLife('A',1),base=await store.readManifest();const pinned=await openOriginalPickupBatchReader(store,'old-life');
   const replacement=new OriginalSoloPickupOwner(store,'owner');const next=await replacement.registerLife('A',2);
   expect(next.history.root.key).not.toBe(original.history.root.key);expect((await store.readManifest()).version).toBe(2);
   expect(pinned.manifest).toEqual(base);await pinned.close();expect(replacement.sourceAt('A',2)).toBe(next);
  }finally{await store.close();}
 });
 it('retains the owner fence when abort after real publication fails pin cleanup',async()=>{
  const {store,owner}=await fixture();let attempts=0;const unpin=store.unpin.bind(store);
  const spy=vi.spyOn(store,'unpin').mockImplementation(async id=>{
   if(id.endsWith('-2-published')&&++attempts===1)throw Error('declared terminal cleanup failure');await unpin(id);
  });
  try{
   await owner.registerLife('A',1);const cohort=owner.createCohort();
   await cohort.begin([],new AbortController().signal);await cohort.seal();await cohort.publish();
   expect((await store.readManifest()).version).toBe(2);await expect(cohort.abort()).rejects.toThrow(/terminal cleanup/);
   expect(owner.awaiting).toBe(true);await expect(owner.registerLife('A',2)).rejects.toThrow(/drain/);
   await cohort.abort();expect(attempts).toBe(2);expect(owner.awaiting).toBe(false);
   expect((await store.readManifest()).version).toBe(2);
  }finally{spy.mockRestore();await store.close();}
 });

 it('retries retained private namespace cleanup without reusing a consumed writer',async()=>{
  const {store}=await fixture();
  const internal=store as unknown as {cleanup:(owner:string,keys:readonly string[])=>Promise<void>};
  const cleanup=internal.cleanup.bind(store);let attempts=0,release!:()=>void,entered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  const spy=vi.spyOn(internal,'cleanup').mockImplementation(async(owner,keys)=>{
   if(++attempts===1)throw Error('declared namespace cleanup failure');entered();await held;await cleanup(owner,keys);
  });let pending:Promise<void>|undefined;
  try{
   const base=await store.readManifest(),row={observer:'A',lifeGeneration:1,prefix:{kind:'callback' as const,sceneGeneration:1,callback:0},lastReceiptTick:-1,root:{key:'cleanup-private',version:0,count:0,pageCount:0,highWaterId:0}};
   const writer=await store.beginBatch(base,[row]);await expect(writer.abort()).rejects.toThrow(/namespace cleanup/);
   expect(()=>store.beginBatch(base,[row])).toThrow(/cleanup unresolved/);
   pending=store.retryFailedCleanup();await started;expect(()=>store.beginBatch(base,[row])).toThrow(/pending/);
   release();await pending;spy.mockRestore();const replacement=await store.beginBatch(base,[row]);await replacement.abort();
   expect((await store.readManifest()).version).toBe(0);await store.retryFailedCleanup();expect(attempts).toBe(2);
  }finally{release();await pending?.catch(()=>{});spy.mockRestore();await store.close();}
 });

});
