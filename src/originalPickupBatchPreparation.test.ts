import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchPage,type IndexedDBOriginalPickupBatchStore} from './originalPickupBatchStore';
import {OriginalReceiverLoadoutWorld} from '../shared/originalReceiverLoadoutWorld';
import {ORIGINAL_WEAPON_SLOT_ORDER} from '../shared/originalPickupRules';
import type {WeaponId} from '../shared/protocol';

const initial=():PickupBatchManifest=>({version:0,observers:['A','B'].map((observer,i)=>({observer,lifeGeneration:i+1,
 prefix:{kind:'callback',sceneGeneration:i+1,callback:0},lastReceiptTick:0,root:{version:0,count:0,pageCount:0,highWaterId:0,key:`initial-${observer}`}}))});
const next=(base:PickupBatchManifest,label:string,count=33):PickupBatchManifest=>({version:base.version+1,observers:base.observers.map(o=>({...o,
 prefix:{kind:'callback',sceneGeneration:o.prefix.sceneGeneration,callback:o.prefix.callback+1},
 root:{version:o.root.version+1,count,pageCount:Math.ceil(count/16),highWaterId:Math.max(count,o.root.highWaterId),key:`${label}-${o.observer}`}}))});
const row=(id:number)=>({id,handle:'recycled-gun',weapon:'rifle' as const,position:{x:id,y:10,z:0}});
async function* pages(value:PickupBatchManifest):AsyncGenerator<PickupBatchPage>{
 for(const observer of value.observers)for(let page=0;page<observer.root.pageCount;page++){
  const records=Array.from({length:Math.min(16,observer.root.count-page*16)},(_,i)=>row(page*16+i+1));
  expect(records.length).toBeLessThanOrEqual(16);yield {observer:observer.observer,page,records};
 }
}
const open=(name:string,factory:IDBFactory)=>openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()});
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
async function inspect<T>(factory:IDBFactory,name:string,store:string,read:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const get=factory.open(name);get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);});
 return new Promise<T>((resolve,reject)=>{const tx=db.transaction(store,'readonly'),get=read(tx.objectStore(store));let value:T;
  get.onsuccess=()=>{value=get.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=()=>{db.close();reject(tx.error);};});
}
function bank(prefix:PickupBatchManifest['observers'][number]['prefix']){
 const booleanMap=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
 const numbers=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
 return new OriginalReceiverLoadoutWorld({prefix,map:'barrack',selected:'rifle',owned:booleanMap(),ammo:numbers(),reserve:numbers(),refillTarget:28,
  counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:32,maxTextChars:4096,weaponModelPresent:booleanMap()});
}
async function sweep(store:IndexedDBOriginalPickupBatchStore){let after:string|undefined,deleted=0;
 for(let n=0;n<40;n++){const step=await store.collectGarbage(after);expect(step.visited).toBeLessThanOrEqual(16);expect(step.pagesDeleted).toBeLessThanOrEqual(16);
  deleted+=step.pagesDeleted;if(step.done)return deleted;after=step.after;}throw Error('Bounded fixture GC did not finish');
}

describe('split pickup batch preparation (storage and manually adopted banks; not Game integration)',()=>{
 it('stages multi-page observer histories without publishing CURRENT or acquiring a reader pin',async()=>{
  const factory=new IDBFactory(),store=await open('prepared-private',factory),base=await store.readManifest(),value=next(base,'private');
  try{
   const source=(async function*(){for await(const page of pages(value)){expect(await store.readManifest()).toEqual(base);yield page;}})();
   const prepared=await store.prepareBatch(base,value,source);expect(Object.isFrozen(prepared)).toBe(true);expect(prepared.nextManifest).toEqual(value);
   expect(await store.readManifest()).toEqual(base);expect(await inspect(factory,'prepared-private','pages',s=>s.count())).toBe(6);
   for(const observer of ['A','B'])expect((await inspect<any>(factory,'prepared-private','roots',s=>s.get(`private-${observer}`))).state).toBe('staging');
   expect(await inspect(factory,'prepared-private','pins',s=>s.count())).toBe(0);
   await expect(store.readPage(prepared.nextManifest,'A',0)).rejects.toThrow(/owned pinned/);
   const old=await store.readManifestAndPin('old');expect(old).toEqual(base);
   await expect(store.readPage(old,'A',0)).rejects.toThrow(/Invalid pickup batch page request/);await store.unpin('old');
   await expect(async()=>store.prepareBatch(base,next(base,'overlap'),pages(next(base,'overlap')))).rejects.toThrow();
   const snapshot=await prepared.publishAndPin('current');expect(snapshot).toEqual(value);expect(await store.readManifest()).toEqual(value);
   expect(await inspect(factory,'prepared-private','pins',s=>s.count())).toBe(2);expect(await store.readPage(snapshot,'B',2)).toEqual([row(33)]);
  }finally{await store.close();}
 });

 it('cleans every earlier observer page when later streaming preparation fails',async()=>{
  const factory=new IDBFactory(),store=await open('prepared-stream-error',factory),base=await store.readManifest(),value=next(base,'failed',33);
  try{
   const input=(async function*(){for await(const page of pages(value)){yield page;if(page.observer==='B'&&page.page===0)throw Error('Later observer stream failed');}})();
   await expect(store.prepareBatch(base,value,input)).rejects.toThrow('Later observer stream failed');
   expect(await store.readManifest()).toEqual(base);expect(await inspect(factory,'prepared-stream-error','pages',s=>s.count())).toBe(0);
   expect(await inspect(factory,'prepared-stream-error','pins',s=>s.count())).toBe(0);
   const retry=await store.prepareBatch(base,next(base,'retry',17),pages(next(base,'retry',17)));await retry.abort();
  }finally{await store.close();}
 });

 it('blocks new preparation after owned cleanup fails and retries cleanup on close',async()=>{
  const factory=new IDBFactory(),store=await open('prepared-cleanup-error',factory),base=await store.readManifest(),value=next(base,'owned',17);
  const prepared=await store.prepareBatch(base,value,pages(value)),original=(store as any).tx.bind(store);
  let failed=false;
  const spy=vi.spyOn(store as any,'tx').mockImplementation((...args:any[])=>{
   if(!failed&&args[3]===true&&args[0].includes('roots')&&args[0].includes('pages')){failed=true;return Promise.reject(Error('Owned cleanup failed'));}
   return original(...args);
  });
  try{
   await expect(prepared.abort()).rejects.toThrow('Owned cleanup failed');expect(failed).toBe(true);
   expect(await store.readManifest()).toEqual(base);expect(await inspect(factory,'prepared-cleanup-error','pages',s=>s.count())).toBe(4);
   await expect(async()=>store.prepareBatch(base,next(base,'blocked',1),pages(next(base,'blocked',1)))).rejects.toThrow(/cleanup unresolved/);
   await store.close();expect(await inspect(factory,'prepared-cleanup-error','pages',s=>s.count())).toBe(0);
   expect(await inspect(factory,'prepared-cleanup-error','manifest',s=>s.get('current'))).toEqual(base);expect(await inspect(factory,'prepared-cleanup-error','pins',s=>s.count())).toBe(0);
  }finally{spy.mockRestore();await store.close();}
 });

 it('waits for a later participant and manually adopts actual loadout banks only after one common CAS',async()=>{
  const factory=new IDBFactory(),store=await open('prepared-banks',factory),base=await store.readManifest(),value=next(base,'banks',17);
  const banks=base.observers.map(o=>bank(o.prefix)),before=banks.map(b=>b.freeze()),stages=banks.map(b=>b.begin()),sink=vi.fn();
  const ready=deferred(),release=deferred();
  try{
   stages[0].advanceCallback(value.observers[0].prefix);stages[0].getGun('rifle',()=>{});stages[0].addScore(5);
   const first=stages[0].prepareCommit(),prepared=await store.prepareBatch(base,value,pages(value));
   const later=(async()=>{ready.resolve();await release.promise;stages[1].advanceCallback(value.observers[1].prefix);stages[1].getGun('rifle',()=>{});stages[1].addScore(5);return stages[1].prepareCommit();})();
   await ready.promise;expect(await store.readManifest()).toEqual(base);expect(banks.map(b=>b.freeze())).toEqual(before);expect(sink).not.toHaveBeenCalled();
   release.resolve();const second=await later,expected=stages.map(t=>t.freeze());
   await prepared.publishAndPin('current');expect(banks.map(b=>b.freeze())).toEqual(before);expect(sink).not.toHaveBeenCalled();
   first();second();expect(banks.map(b=>b.freeze())).toEqual(expected);sink(banks.map(b=>b.freeze().score));expect(sink).toHaveBeenCalledExactlyOnceWith([5,5]);
   // One reward per observer; seventeen stored records do not claim seventeen
   // actual collections or a production Game readiness/adoption bridge.
  }finally{release.resolve();stages.forEach(t=>t.rollback());banks.forEach(b=>b.release());await store.close();}
 });

 it('aborts staged histories after a later participant error without publishing banks or rewards',async()=>{
  const factory=new IDBFactory(),store=await open('prepared-abort',factory),base=await store.readManifest(),value=next(base,'abort',17);
  const banks=base.observers.map(o=>bank(o.prefix)),before=banks.map(b=>b.freeze()),stages=banks.map(b=>b.begin()),sink=vi.fn();
  try{
   stages[0].advanceCallback(value.observers[0].prefix);stages[0].getGun('rifle',()=>{});stages[0].addScore(5);const publisher=stages[0].prepareCommit();
   const prepared=await store.prepareBatch(base,value,pages(value));
   const later=async()=>{stages[1].advanceCallback(value.observers[1].prefix);throw Error('Later participant failed');};
   await expect(later()).rejects.toThrow('Later participant failed');await prepared.abort();stages.forEach(t=>t.rollback());publisher();
   expect(await store.readManifest()).toEqual(base);expect(banks.map(b=>b.freeze())).toEqual(before);expect(sink).not.toHaveBeenCalled();
   expect(await inspect(factory,'prepared-abort','pages',s=>s.count())).toBe(0);expect(await inspect(factory,'prepared-abort','pins',s=>s.count())).toBe(0);
   await expect(async()=>prepared.publishAndPin('replayed')).rejects.toThrow();await expect(async()=>prepared.abort()).rejects.toThrow();
  }finally{stages.forEach(t=>t.rollback());banks.forEach(b=>b.release());await store.close();}
 });

 it('rejects copied, forged and foreign receivers and consumed handles before any extra publication',async()=>{
  const factory=new IDBFactory(),first=await open('prepared-handles',factory),second=await open('prepared-handles',factory),base=await first.readManifest();
  try{
   const a=await first.prepareBatch(base,next(base,'handle-A',1),pages(next(base,'handle-A',1)));
   const b=await second.prepareBatch(base,next(base,'handle-B',1),pages(next(base,'handle-B',1)));
   for(const invalid of [{...a},Object.freeze({nextManifest:a.nextManifest}),b]){
    await expect(async()=>a.publishAndPin.call(invalid as typeof a,'forged')).rejects.toThrow();
    await expect(async()=>a.abort.call(invalid as typeof a)).rejects.toThrow();
   }
   expect(await first.readManifest()).toEqual(base);expect(await inspect(factory,'prepared-handles','pins',s=>s.count())).toBe(0);
   await b.abort();const published=await a.publishAndPin('current');expect(await first.readManifest()).toEqual(published);
   await expect(async()=>a.publishAndPin('replay')).rejects.toThrow();await expect(async()=>a.abort()).rejects.toThrow();
  }finally{await first.close();await second.close();}
 });

 it('cleans stale prepared namespaces after another connection wins the common CAS',async()=>{
  const factory=new IDBFactory(),first=await open('prepared-stale',factory),second=await open('prepared-stale',factory),base=await first.readManifest();
  try{
   const loser=await first.prepareBatch(base,next(base,'loser',17),pages(next(base,'loser',17)));
   const winner=await second.prepareBatch(base,next(base,'winner',17),pages(next(base,'winner',17))),published=await winner.publishAndPin('winner');
   await expect(loser.publishAndPin('loser')).rejects.toThrow(/Stale/);expect(await first.readManifest()).toEqual(published);
   for(const id of ['A','B'])expect(await inspect(factory,'prepared-stale','pages',s=>s.index('root').count(`loser-${id}`))).toBe(0);
   expect(await inspect(factory,'prepared-stale','pins',s=>s.count())).toBe(2);
   await expect(async()=>loser.publishAndPin('retry')).rejects.toThrow();
  }finally{await first.close();await second.close();}
 });

 it('closes an unused prepared handle and cancels late streaming input without publishing',async()=>{
  for(const paused of [false,true]){
   const factory=new IDBFactory(),name=`prepared-close-${paused}`,store=await open(name,factory),base=await store.readManifest(),value=next(base,'closed',17),ready=deferred(),release=deferred();
   try{
    if(paused){
     const input=(async function*(){yield {observer:'A',page:0,records:Array.from({length:16},(_,i)=>row(i+1))};ready.resolve();await release.promise;yield {observer:'A',page:1,records:[row(17)]};})();
     const pending=store.prepareBatch(base,value,input),failure=expect(pending).rejects.toThrow(/closed/);await ready.promise;
     await expect(async()=>store.prepareBatch(base,next(base,'busy',1),pages(next(base,'busy',1)))).rejects.toThrow();
     await store.close();release.resolve();await failure;
    }else{
     const handle=await store.prepareBatch(base,value,pages(value));await store.close();await expect(async()=>handle.publishAndPin('closed')).rejects.toThrow();
    }
    expect(await inspect(factory,name,'manifest',s=>s.get('current'))).toEqual(base);expect(await inspect(factory,name,'pages',s=>s.count())).toBe(0);
    expect(await inspect(factory,name,'pins',s=>s.count())).toBe(0);
   }finally{release.resolve();await store.close();}
  }
 });

 it('preserves a completed CAS when close starts before the publication promise continuation',async()=>{
  const factory=new IDBFactory(),store=await open('prepared-completed-close',factory),base=await store.readManifest(),value=next(base,'completed',17);let closing:Promise<void>|undefined;
  try{
   const prepared=await store.prepareBatch(base,value,pages(value)),original=(store as any).tx.bind(store);
   const spy=vi.spyOn(store as any,'tx').mockImplementation(async(...args:any[])=>{
    const result=await original(...args);if(args[0].length===3&&args[0].includes('manifest')&&args[0].includes('roots')&&args[0].includes('pins'))closing=store.close();return result;
   });
   const published=await prepared.publishAndPin('current');expect(published).toEqual(value);await closing;spy.mockRestore();
   expect(await inspect(factory,'prepared-completed-close','manifest',s=>s.get('current'))).toEqual(value);
   expect(await inspect(factory,'prepared-completed-close','pages',s=>s.count())).toBe(4);expect(await inspect(factory,'prepared-completed-close','pins',s=>s.count())).toBe(0);
  }finally{await store.close();}
 });

 it('shares the six-group lease cap and protects paused historical readers across publication and GC',async()=>{
  const factory=new IDBFactory(),store=await open('prepared-leases',factory),base=await store.readManifest();
  try{
   const oldPrepared=await store.prepareBatch(base,next(base,'old',17),pages(next(base,'old',17))),old=await oldPrepared.publishAndPin('old');
   for(let i=0;i<5;i++)await store.readManifestAndPin(`reader-${i}`);
   const prepared=await store.prepareBatch(old,next(old,'new',1),pages(next(old,'new',1)));
   await expect(async()=>prepared.publishAndPin('seventh')).rejects.toThrow(/lease budget/);
   expect(await store.readManifest()).toEqual(old);await store.unpin('reader-4');
   const current=await prepared.publishAndPin('current');expect(await sweep(store)).toBe(0);expect(await store.readPage(old,'B',1)).toEqual([row(17)]);
   await store.unpin('old');for(let i=0;i<4;i++)await store.unpin(`reader-${i}`);
   expect(await sweep(store)).toBe(4);await expect(store.readPage(old,'A',0)).rejects.toThrow(/owned pinned/);expect(await store.readPage(current,'A',0)).toEqual([row(1)]);
  }finally{await store.close();}
 });
});
