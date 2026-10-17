import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchObserverPlan} from './originalPickupBatchStore';
import {openOriginalPickupBatchReader} from './originalPickupBatchWindow';
import type {ReceiverScenePrefix} from '../shared/originalReceiverPrefix';

const initial=():PickupBatchManifest=>({version:0,observers:['A','B'].map((observer,i)=>({observer,lifeGeneration:i+1,
 prefix:{kind:'callback',sceneGeneration:i+1,callback:0},lastReceiptTick:0,root:{version:0,count:0,pageCount:0,highWaterId:0,key:`initial-${observer}`}}))});
const row=(id:number)=>({id,handle:'same-recycled-held-gun',weapon:'rifle' as const,position:{x:id*100,y:10,z:-id}});
async function populated(name:string,factory=new IDBFactory()){
 const store=await openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()}),base=await store.readManifest();
 const plans:readonly PickupBatchObserverPlan[]=base.observers.map(o=>({...o,prefix:{kind:'callback',sceneGeneration:o.prefix.sceneGeneration,callback:1},root:{key:`history-${o.observer}`,version:1}}));
 const writer=await store.beginBatch(base,plans);const counts=[17,33];
 for(let observer=0;observer<2;observer++)for(let page=0,left=counts[observer];left>0;page++){
  const records=Array.from({length:Math.min(16,left)},()=>row(writer.allocatePickupId(plans[observer].observer)));left-=records.length;
  await writer.writePage({observer:plans[observer].observer,page,records});
 }
 const manifest:PickupBatchManifest={version:1,observers:plans.map((o,i)=>({...o,root:{...o.root,count:counts[i],pageCount:Math.ceil(counts[i]/16),highWaterId:counts[i]}}))};
 const prepared=await writer.seal(manifest);await prepared.publishAndPin('seed');await store.unpin('seed');return {store,factory,manifest};
}
const callback=(value:PickupBatchManifest,observer:string):ReceiverScenePrefix=>{const p=value.observers.find(o=>o.observer===observer)!.prefix;return {kind:'callback',sceneGeneration:p.sceneGeneration,callback:p.callback+1};};
async function read<T>(factory:IDBFactory,name:string,store:string,request:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await new Promise<IDBDatabase>((r,j)=>{const get=factory.open(name);get.onsuccess=()=>r(get.result);get.onerror=()=>j(get.error);});
 return new Promise<T>((r,j)=>{const tx=db.transaction(store,'readonly'),get=request(tx.objectStore(store));let value:T;get.onsuccess=()=>{value=get.result;};
  tx.oncomplete=()=>{db.close();r(value);};tx.onabort=()=>{db.close();j(tx.error);};});
}
async function mutate(factory:IDBFactory,name:string,store:string,write:(s:IDBObjectStore)=>void){
 const db=await new Promise<IDBDatabase>((r,j)=>{const get=factory.open(name);get.onsuccess=()=>r(get.result);get.onerror=()=>j(get.error);});
 await new Promise<void>((r,j)=>{const tx=db.transaction(store,'readwrite');write(tx.objectStore(store));tx.oncomplete=()=>{db.close();r();};tx.onabort=()=>{db.close();j(tx.error);};});
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}

describe('authenticated bounded pickup windows (CPU storage adapter; not Game integration)',()=>{
 it('captures each prefix field once and validates the captured kind and tick',async()=>{
  const f=await populated('windows-prefix-getters'),reader=await openOriginalPickupBatchReader(f.store,'reader');
  try{
   const invalid={kind:'unknown',sceneGeneration:1,callback:1,tick:1} as unknown as ReceiverScenePrefix;
   await expect(async()=>reader.loadWindow('A',0,invalid)).rejects.toThrow();
   let kindReads=0,sceneReads=0,callbackReads=0,tickReads=0;
   const changing={get kind(){kindReads++;return 'receipt' as const;},
    get sceneGeneration(){sceneReads++;return 1;},get callback(){callbackReads++;return 1;},
    get tick(){return ++tickReads<=2?1:NaN;}};
   const window=await reader.loadWindow('A',0,changing);
   expect(window.prefix).toEqual({kind:'receipt',sceneGeneration:1,callback:1,tick:1});
   expect([kindReads,sceneReads,callbackReads,tickReads]).toEqual([1,1,1,1]);
   reader.releaseWindow(window);
   await expect(async()=>reader.loadWindow('A',1,{kind:'receipt',sceneGeneration:1,callback:1,tick:NaN})).rejects.toThrow();
  }finally{await reader.close();await f.store.close();}
 });
 it('retains independent historical positions and shares one manifest lease across observer windows',async()=>{
  const f=await populated('windows-history'),reader=await openOriginalPickupBatchReader(f.store,'reader');
  try{
   expect(reader.manifest).toEqual(f.manifest);expect(await read(f.factory,'windows-history','pins',s=>s.count())).toBe(2);
   expect(Reflect.set(reader,'manifest',{...reader.manifest})).toBe(false);expect(reader.manifest).toEqual(f.manifest);
   const first=await reader.loadWindow('A',0,callback(reader.manifest,'A'));expect(Object.isFrozen(first)).toBe(true);
   expect(Object.keys(first).sort()).toEqual(['lifeGeneration','observer','page','prefix','root']);
   expect(reader.records(first)).toHaveLength(16);expect(reader.readPickup(first,1)).toEqual(row(1));expect(reader.readPickup(first,16)).toEqual(row(16));
   expect(reader.readPickup(first,1)!.handle).toBe(reader.readPickup(first,16)!.handle);
   expect(reader.readPickup(first,1)!.position).not.toEqual(reader.readPickup(first,16)!.position);
   expect(Object.isFrozen(reader.records(first))).toBe(true);expect(Object.isFrozen(reader.readPickup(first,1)!.position)).toBe(true);
   reader.releaseWindow(first);const last=await reader.loadWindow('A',1,callback(reader.manifest,'A'));expect(reader.records(last)).toEqual([row(17)]);
   reader.releaseWindow(last);const other=await reader.loadWindow('B',2,callback(reader.manifest,'B'));expect(reader.records(other)).toEqual([row(33)]);
   expect(other.lifeGeneration).toBe(2);expect(other.root).toEqual(f.manifest.observers[1].root);
   expect(await read(f.factory,'windows-history','pins',s=>s.count())).toBe(2);
  }finally{await reader.close();await f.store.close();}
 });

 it('returns null only for zero and throws for positive IDs outside resident records',async()=>{
  const f=await populated('windows-resident'),reader=await openOriginalPickupBatchReader(f.store,'reader');
  try{
   const window=await reader.loadWindow('A',0,callback(reader.manifest,'A'));expect(reader.readPickup(window,0)).toBeNull();
   for(const id of [17,33,999])expect(()=>reader.readPickup(window,id)).toThrow(/not resident/);
   for(const id of [-1,1.5,NaN,Infinity])expect(()=>reader.readPickup(window,id)).toThrow();
   reader.releaseWindow(window);const last=await reader.loadWindow('A',1,callback(reader.manifest,'A'));
   expect(()=>reader.readPickup(last,1)).toThrow(/not resident/);expect(reader.readPickup(last,17)).toEqual(row(17));
  }finally{await reader.close();await f.store.close();}
 });

 it('enforces one resident window across all observers and rejects cloned or foreign capabilities',async()=>{
  const f=await populated('windows-ownership'),reader=await openOriginalPickupBatchReader(f.store,'reader'),foreign=await openOriginalPickupBatchReader(f.store,'foreign');
  try{
   const window=await reader.loadWindow('A',0,callback(reader.manifest,'A'));
   await expect(async()=>reader.loadWindow('B',0,callback(reader.manifest,'B'))).rejects.toThrow();
   for(const invalid of [{...window},Object.freeze({...window,prefix:{...window.prefix}})]){
    expect(()=>reader.records(invalid)).toThrow();expect(()=>reader.readPickup(invalid,1)).toThrow();expect(()=>reader.releaseWindow(invalid)).toThrow();
   }
   expect(()=>foreign.records(window)).toThrow();expect(()=>foreign.readPickup(window,1)).toThrow();expect(()=>foreign.releaseWindow(window)).toThrow();
   reader.releaseWindow(window);expect(()=>reader.records(window)).toThrow();expect(()=>reader.readPickup(window,0)).toThrow();expect(()=>reader.releaseWindow(window)).toThrow();
   const replacement=await reader.loadWindow('B',0,callback(reader.manifest,'B'));expect(()=>reader.readPickup(window,1)).toThrow();expect(reader.records(replacement)).toHaveLength(16);
  }finally{await reader.close();await foreign.close();await f.store.close();}
 });

 it('permits only the exact next callback or a later receipt in the current callback',async()=>{
  const f=await populated('windows-prefix'),reader=await openOriginalPickupBatchReader(f.store,'reader');
  try{
   const entry=reader.manifest.observers[0],prefix=callback(reader.manifest,'A');
   for(const invalid of [{...prefix,sceneGeneration:99},{...prefix,callback:entry.prefix.callback},{...prefix,callback:entry.prefix.callback+2},
    {kind:'receipt' as const,sceneGeneration:entry.prefix.sceneGeneration,callback:entry.prefix.callback,tick:entry.lastReceiptTick},
    {kind:'receipt' as const,sceneGeneration:entry.prefix.sceneGeneration,callback:entry.prefix.callback+1,tick:entry.lastReceiptTick+1}])await expect(async()=>reader.loadWindow('A',0,invalid)).rejects.toThrow();
   const receipt:ReceiverScenePrefix={kind:'receipt',sceneGeneration:entry.prefix.sceneGeneration,callback:entry.prefix.callback,tick:entry.lastReceiptTick+1};
   const window=await reader.loadWindow('A',0,receipt);expect(window.prefix).toEqual(receipt);reader.releaseWindow(window);
   for(const page of [-1,1.5,2,NaN])await expect(async()=>reader.loadWindow('A',page,receipt)).rejects.toThrow();
   await expect(async()=>reader.loadWindow('FOREIGN',0,prefix)).rejects.toThrow();
   await expect(async()=>reader.loadWindow('A',1,prefix)).rejects.toThrow(/prefix changed/);
   await expect(async()=>reader.loadWindow('A',1,{...receipt,tick:receipt.tick+1})).rejects.toThrow(/prefix changed/);
   const next=await reader.loadWindow('A',1,receipt);expect(next.prefix).toEqual(receipt);
  }finally{await reader.close();await f.store.close();}
 });

 it('rejects corrupted page lengths, ID order and root high-water overruns without admitting a window',async()=>{
  for(const fault of ['length','order','high-water'] as const){
   const name=`windows-corrupt-${fault}`,f=await populated(name),reader=await openOriginalPickupBatchReader(f.store,'reader');
   try{
    const records=Array.from({length:16},(_,i)=>row(i+1));if(fault==='length')records.pop();else if(fault==='order')records.reverse();else records[15]=row(18);
    await mutate(f.factory,name,'pages',s=>s.put({root:'history-A',page:0,records}));
    await expect(async()=>reader.loadWindow('A',0,callback(reader.manifest,'A'))).rejects.toThrow();
    await mutate(f.factory,name,'pages',s=>s.put({root:'history-A',page:0,records:Array.from({length:16},(_,i)=>row(i+1))}));
    const valid=await reader.loadWindow('A',0,callback(reader.manifest,'A'));expect(reader.records(valid)).toHaveLength(16);
   }finally{await reader.close();await f.store.close();}
  }
 });

 it('invalidates a resident window immediately when close begins and releases its one lease',async()=>{
  const f=await populated('windows-close'),reader=await openOriginalPickupBatchReader(f.store,'reader');
  try{
   const window=await reader.loadWindow('A',0,callback(reader.manifest,'A')),closing=reader.close();
   expect(()=>reader.records(window)).toThrow();expect(()=>reader.readPickup(window,1)).toThrow();
   await expect(async()=>reader.loadWindow('B',0,callback(reader.manifest,'B'))).rejects.toThrow();await closing;await reader.close();
   expect(await read(f.factory,'windows-close','pins',s=>s.count())).toBe(0);
  }finally{await reader.close();await f.store.close();}
 });

 it('blocks a second load and drains a finite pending read before unpinning on close',async()=>{
  const f=await populated('windows-close-read'),reader=await openOriginalPickupBatchReader(f.store,'reader'),ready=deferred(),release=deferred();
  const original=f.store.readPage.bind(f.store),unpin=vi.spyOn(f.store,'unpin');
  const readPage=vi.spyOn(f.store,'readPage').mockImplementation(async(...args)=>{const result=await original(...args);ready.resolve();await release.promise;return result;});
  try{
   const load=reader.loadWindow('A',0,callback(reader.manifest,'A')),failure=expect(load).rejects.toThrow();await ready.promise;
   await expect(async()=>reader.loadWindow('B',0,callback(reader.manifest,'B'))).rejects.toThrow();const closing=reader.close();
   expect(unpin).not.toHaveBeenCalled();await expect(async()=>reader.loadWindow('A',1,callback(reader.manifest,'A'))).rejects.toThrow();
   release.resolve();await failure;await closing;expect(unpin).toHaveBeenCalledExactlyOnceWith('reader');
   expect(await read(f.factory,'windows-close-read','pins',s=>s.count())).toBe(0);
  }finally{release.resolve();readPage.mockRestore();unpin.mockRestore();await reader.close();await f.store.close();}
 });

 it('shares the store six-group lease cap rather than allocating a lease for each observer page',async()=>{
  const f=await populated('windows-leases');let reader:Awaited<ReturnType<typeof openOriginalPickupBatchReader>>|undefined;
  try{
   for(let n=0;n<6;n++)await f.store.readManifestAndPin(`existing-${n}`);
   await expect(openOriginalPickupBatchReader(f.store,'seventh')).rejects.toThrow(/lease budget/);expect(await read(f.factory,'windows-leases','pins',s=>s.count())).toBe(12);
   await f.store.unpin('existing-5');reader=await openOriginalPickupBatchReader(f.store,'reader');
   for(const observer of ['A','B']){const window=await reader.loadWindow(observer,0,callback(reader.manifest,observer));reader.releaseWindow(window);}
   expect(await read(f.factory,'windows-leases','pins',s=>s.count())).toBe(12);await reader.close();expect(await read(f.factory,'windows-leases','pins',s=>s.count())).toBe(10);
  }finally{await reader?.close();await f.store.close();}
 });

 it('keeps its old pinned root readable across publication and releases it for bounded garbage collection',async()=>{
  const f=await populated('windows-old-root'),reader=await openOriginalPickupBatchReader(f.store,'reader');
  const sweep=async()=>{let after:string|undefined,deleted=0;for(let n=0;n<40;n++){const step=await f.store.collectGarbage(after);
   expect(step.visited).toBeLessThanOrEqual(16);expect(step.pagesDeleted).toBeLessThanOrEqual(16);deleted+=step.pagesDeleted;
   if(step.done)return deleted;after=step.after;}throw Error('Bounded fixture GC did not finish');};
  try{
   const p:readonly PickupBatchObserverPlan[]=f.manifest.observers.map(o=>({...o,prefix:callback(f.manifest,o.observer),root:{key:`replacement-${o.observer}`,version:2}}));
   const writer=await f.store.beginBatch(f.manifest,p),ids:number[]=[];
   for(const observer of ['A','B']){const id=writer.allocatePickupId(observer);ids.push(id);await writer.writePage({observer,page:0,records:[row(id)]});}
   const next:PickupBatchManifest={version:2,observers:p.map((o,i)=>({...o,root:{...o.root,count:1,pageCount:1,highWaterId:ids[i]}}))};
   await (await writer.seal(next)).publishAndPin('current');expect(await sweep()).toBe(0);
   const window=await reader.loadWindow('A',1,callback(reader.manifest,'A'));expect(reader.readPickup(window,17)).toEqual(row(17));
   expect(reader.manifest).toEqual(f.manifest);await reader.close();expect(await sweep()).toBe(5);
  }finally{await reader.close();await f.store.close();}
 });

 it('keeps reads invalidated while failed lease cleanup is retried by close',async()=>{
  const f=await populated('windows-unpin-retry'),reader=await openOriginalPickupBatchReader(f.store,'reader'),original=f.store.unpin.bind(f.store);
  const unpin=vi.spyOn(f.store,'unpin').mockRejectedValueOnce(Error('Lease cleanup failed')).mockImplementation(original);
  try{
   const window=await reader.loadWindow('A',0,callback(reader.manifest,'A'));await expect(reader.close()).rejects.toThrow('Lease cleanup failed');
   expect(()=>reader.records(window)).toThrow();await expect(async()=>reader.loadWindow('B',0,callback(reader.manifest,'B'))).rejects.toThrow();
   expect(await read(f.factory,'windows-unpin-retry','pins',s=>s.count())).toBe(2);await reader.close();expect(unpin).toHaveBeenCalledTimes(2);
   expect(await read(f.factory,'windows-unpin-retry','pins',s=>s.count())).toBe(0);
  }finally{unpin.mockRestore();await reader.close();await f.store.close();}
 });
});
