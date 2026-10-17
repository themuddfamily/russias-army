import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchPage,type IndexedDBOriginalPickupBatchStore} from './originalPickupBatchStore';
import {OriginalReceiverLoadoutWorld} from '../shared/originalReceiverLoadoutWorld';
import {ORIGINAL_WEAPON_SLOT_ORDER} from '../shared/originalPickupRules';
import type {WeaponId} from '../shared/protocol';

const initial=():PickupBatchManifest=>({version:0,observers:['A','B'].map((observer,i)=>({observer,lifeGeneration:i+1,prefix:{kind:'callback',sceneGeneration:i+1,callback:0},lastReceiptTick:0,root:{version:0,count:0,pageCount:0,highWaterId:0,key:`initial-${observer}`}}))});
function next(base:PickupBatchManifest,label:string,count=33):PickupBatchManifest{return {version:base.version+1,observers:base.observers.map(o=>({...o,prefix:{kind:'callback',sceneGeneration:o.prefix.sceneGeneration,callback:o.prefix.callback+1},root:{version:o.root.version+1,count,pageCount:Math.ceil(count/16),highWaterId:Math.max(count,o.root.highWaterId),key:`${label}-${o.observer}`}}))};}
const row=(id:number)=>({id,handle:'same-recycled-gun',weapon:'rifle' as const,position:{x:id,y:10,z:0}});
async function* pages(value:PickupBatchManifest):AsyncGenerator<PickupBatchPage>{for(const o of value.observers)for(let page=0;page<o.root.pageCount;page++){await new Promise<void>(r=>setTimeout(r,0));yield {observer:o.observer,page,records:Array.from({length:Math.min(16,o.root.count-page*16)},(_,i)=>row(page*16+i+1))};}}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};}
async function open(name:string,factory=new IDBFactory()){return openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()});}
async function inspect<T>(factory:IDBFactory,name:string,store:string,read:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const get=factory.open(name);get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);});
 return new Promise<T>((resolve,reject)=>{const t=db.transaction(store,'readonly'),get=read(t.objectStore(store));let value:T;get.onsuccess=()=>{value=get.result;};t.oncomplete=()=>{db.close();resolve(value);};t.onabort=()=>{db.close();reject(t.error);};});
}
async function write(factory:IDBFactory,name:string,store:string,mutate:(store:IDBObjectStore)=>void){const db=await new Promise<IDBDatabase>(r=>{const get=factory.open(name);get.onsuccess=()=>r(get.result);});await new Promise<void>((r,j)=>{const t=db.transaction(store,'readwrite');mutate(t.objectStore(store));t.oncomplete=()=>{db.close();r();};t.onabort=()=>{db.close();j(t.error);};});}
async function sweep(store:IndexedDBOriginalPickupBatchStore){let after:string|undefined,deleted=0;for(let i=0;i<50;i++){const step=await store.collectGarbage(after);expect(step.visited).toBeLessThanOrEqual(16);expect(step.pagesDeleted).toBeLessThanOrEqual(16);deleted+=step.pagesDeleted;if(step.done)return deleted;after=step.after;}throw Error('Fixture GC did not finish');}

describe('one durable pickup manifest for all observers (CPU IndexedDB event implementation)',()=>{
 it('stages independent multi-page histories and publishes both roots and reader pins in one transaction',async()=>{
  const factory=new IDBFactory(),store=await open('atomic',factory),base=await store.readManifest();try{
   const value=next(base,'committed');let consumed=0;
   const source=(async function*(){for await(const page of pages(value)){expect(await store.readManifest()).toEqual(base);consumed++;yield page;}})();
   const snapshot=await store.publishAndPin(base,value,source,'current');expect(consumed).toBe(6);expect(snapshot).toEqual(value);expect(await store.readManifest()).toEqual(value);
   expect(await inspect(factory,'atomic','pins',s=>s.count())).toBe(2);
   for(const observer of ['A','B']){expect(await store.readPage(snapshot,observer,2)).toEqual([row(33)]);expect((await store.readPage(snapshot,observer,0))[0].position).toEqual({x:1,y:10,z:0});}
   expect(Object.isFrozen(snapshot.observers[0].prefix)).toBe(true);
   await expect(store.readPage({...snapshot},'A',0)).rejects.toThrow('owned pinned');
  }finally{await store.close();}
 });
 it('rolls back every root and actual loadout when a later observer fails before the common publication',async()=>{
  const factory=new IDBFactory(),store=await open('failed',factory),base=await store.readManifest(),value=next(base,'failed');
  const worlds=base.observers.map(o=>new OriginalReceiverLoadoutWorld({prefix:o.prefix,map:'barrack',selected:'rifle',owned:Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>,ammo:Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>,reserve:Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>,refillTarget:28,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:32,maxTextChars:4096,weaponModelPresent:Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>}));
  const sink=vi.fn(),before=worlds.map(w=>w.freeze()),stages=worlds.map((w,i)=>{const tx=w.begin();tx.advanceCallback(value.observers[i].prefix);tx.getGun('rifle',()=>{});tx.addScore(5);return tx;});const publishers=stages.map(t=>t.prepareCommit());
  try{
   const source=(async function*(){for await(const page of pages(value)){expect(worlds.map(w=>w.freeze())).toEqual(before);expect(sink).not.toHaveBeenCalled();yield page;if(page.observer==='B'&&page.page===0)throw Error('Later observer failed');}})();
   await expect(store.publishAndPin(base,value,source,'failed')).rejects.toThrow('Later observer failed');stages.forEach(t=>t.rollback());
   expect(await store.readManifest()).toEqual(base);expect(worlds.map(w=>w.freeze())).toEqual(before);expect(sink).not.toHaveBeenCalled();expect(await inspect(factory,'failed','pages',s=>s.count())).toBe(0);expect(await inspect(factory,'failed','pins',s=>s.count())).toBe(0);
   const retry=worlds.map((w,i)=>{const t=w.begin();t.advanceCallback(value.observers[i].prefix);t.getGun('rifle',()=>{});t.addScore(5);return t;});const expected=retry.map(t=>t.freeze()),commit=retry.map(t=>t.prepareCommit());
   await store.publishAndPin(base,value,pages(value),'retry');expect(worlds.map(w=>w.freeze())).toEqual(before);commit.forEach(p=>p());expect(worlds.map(w=>w.freeze())).toEqual(expected);sink(worlds.map(w=>w.freeze().score));expect(sink).toHaveBeenCalledExactlyOnceWith([5,5]);
   // Rolled-back assignment-only publishers cannot publish their old stages.
   publishers.forEach(p=>p());expect(worlds.map(w=>w.freeze().score)).toEqual([5,5]);
  }finally{stages.forEach(t=>t.rollback());worlds.forEach(w=>w.release());await store.close();}
 });
 it('reopens the same cohort after publication and rejects a stale competing root vector',async()=>{
  const factory=new IDBFactory(),first=await open('race',factory),base=await first.readManifest(),loser=next(base,'loser'),winner=next(base,'winner'),ready=deferred(),release=deferred();let second:IndexedDBOriginalPickupBatchStore|undefined;
  try{
   const input=(async function*(){yield* pages(loser);ready.resolve();await release.promise;})();const pending=first.publishAndPin(base,loser,input,'loser'),failure=expect(pending).rejects.toThrow('Stale');await ready.promise;
   second=await open('race',factory);await second.publishAndPin(base,winner,pages(winner),'winner');release.resolve();await failure;expect(await first.readManifest()).toEqual(winner);
   const third=await open('race',factory);try{expect(await third.readManifest()).toEqual(winner);}finally{await third.close();}
   expect(await inspect(factory,'race','pages',s=>s.index('root').count('loser-A'))).toBe(0);expect(await inspect(factory,'race','pages',s=>s.index('root').count('loser-B'))).toBe(0);
  }finally{release.resolve();await first.close();await second?.close();}
 });
 it('protects a paused old vector across another connection and rejects replay after its lease ID is reused',async()=>{
  const factory=new IDBFactory(),first=await open('pins',factory),base=await first.readManifest();let second:IndexedDBOriginalPickupBatchStore|undefined;try{
   const old=await first.publishAndPin(base,next(base,'old',17),pages(next(base,'old',17)),'old');second=await open('pins',factory);
   const current=next(old,'new',1);await second.publishAndPin(old,current,pages(current),'new');expect(await sweep(second)).toBe(0);expect(await first.readPage(old,'B',1)).toEqual([row(17)]);
   await first.unpin('old');const renewed=await first.readManifestAndPin('old');await expect(first.readPage(old,'A',0)).rejects.toThrow('owned pinned');expect(await sweep(second)).toBe(4);expect(await first.readPage(renewed,'A',0)).toEqual([row(1)]);
  }finally{await first.close();await second?.close();}
 });
 it('retains an unchanged root, preserves empty-root high-water IDs and supports explicit replacement lives',async()=>{
  const store=await open('lives'),base=await store.readManifest();try{
   const old=await store.publishAndPin(base,next(base,'born',17),pages(next(base,'born',17)),'old');const change=next(old,'one',0);const value={...change,observers:[change.observers[0],old.observers[1]]};
   const snapshot=await store.publishAndPin(old,value,(async function*(){})(),'one');expect(snapshot.observers[0].root.highWaterId).toBe(17);expect(await store.readPage(snapshot,'B',1)).toEqual([row(17)]);
   const replacement:PickupBatchManifest={version:value.version+1,observers:[{...initial().observers[0],lifeGeneration:3,prefix:{kind:'callback',sceneGeneration:3,callback:0},root:{...initial().observers[0].root,key:'replacement-A'}},value.observers[1]]};
   await store.publishAndPin(value,replacement,(async function*(){})(),'replacement');expect(await store.readManifest()).toEqual(replacement);
  }finally{await store.close();}
 });
 it('preserves separate receipt clocks and callbacks for each observer',async()=>{
  const store=await open('clocks'),base=await store.readManifest();try{
   const a=next(base,'clock-A',1).observers[0],b={...base.observers[1],prefix:{kind:'receipt' as const,sceneGeneration:2,callback:0,tick:5},lastReceiptTick:5};
   const first:PickupBatchManifest={version:1,observers:[a,b]};await store.publishAndPin(base,first,(async function*(){yield {observer:'A',page:0,records:[row(1)]};})(),'first');
   const second:PickupBatchManifest={version:2,observers:[a,{...b,prefix:{...b.prefix,tick:6},lastReceiptTick:6,root:{version:1,count:1,pageCount:1,highWaterId:1,key:'clock-B'}}]};
   await store.publishAndPin(first,second,(async function*(){yield {observer:'B',page:0,records:[row(1)]};})(),'second');
   const third:PickupBatchManifest={version:3,observers:[a,{...second.observers[1],prefix:{kind:'callback',sceneGeneration:2,callback:1}}]};await store.publishAndPin(second,third,(async function*(){})(),'third');
   for(const observer of [{...third.observers[1],prefix:{kind:'receipt' as const,sceneGeneration:2,callback:1,tick:0},lastReceiptTick:0},{...third.observers[1],prefix:{kind:'callback' as const,sceneGeneration:2,callback:2},lastReceiptTick:7},{...third.observers[1],lastReceiptTick:7}])expect(()=>store.publishAndPin(third,{version:4,observers:[a,observer]},(async function*(){})(),'invalid')).toThrow();
  }finally{await store.close();}
 });
 it('cleans failed and retired histories in sixteen-page cursor batches',async()=>{
  const factory=new IDBFactory(),store=await open('large-cleanup',factory),base=await store.readManifest(),value=next(base,'large',257);try{
   const source=(async function*(){for await(const page of pages(value)){yield page;if(page.observer==='B'&&page.page===0)throw Error('later-page-failure');}})();await expect(store.publishAndPin(base,value,source,'failed')).rejects.toThrow('later-page-failure');expect(await inspect(factory,'large-cleanup','pages',s=>s.count())).toBe(0);
   const old=await store.publishAndPin(base,value,pages(value),'old');const fresh=next(old,'fresh',1);await store.publishAndPin(old,fresh,pages(fresh),'fresh');expect(await sweep(store)).toBe(0);await store.unpin('old');expect(await sweep(store)).toBe(34);
  }finally{await store.close();}
 });
 it('closes during later page input, drains cleanup and leaves the prior vector authoritative',async()=>{
  const factory=new IDBFactory(),store=await open('close',factory),base=await store.readManifest(),value=next(base,'closed',17),ready=deferred(),release=deferred();
  const input=(async function*(){yield {observer:'A',page:0,records:Array.from({length:16},(_,i)=>row(i+1))};ready.resolve();await release.promise;yield {observer:'A',page:1,records:[row(17)]};})();
  const work=store.publishAndPin(base,value,input,'closed'),failure=expect(work).rejects.toThrow('closed');try{await ready.promise;await store.close();release.resolve();await failure;expect(await inspect(factory,'close','manifest',s=>s.get('current'))).toEqual(base);expect(await inspect(factory,'close','pages',s=>s.count())).toBe(0);expect(await inspect(factory,'close','pins',s=>s.count())).toBe(0);}finally{release.resolve();await store.close();}
 });
 it('validates unchanged namespace metadata before atomic pinning or publication',async()=>{
  const factory=new IDBFactory(),store=await open('corrupt',factory),base=await store.readManifest();try{
   await write(factory,'corrupt','roots',s=>s.put({key:'initial-B',owner:'initial',state:'committed',root:base.observers[1].root,observer:'FOREIGN',lifeGeneration:2,batchVersion:0}));
   await expect(store.readManifestAndPin('bad')).rejects.toThrow('metadata mismatch');expect(await inspect(factory,'corrupt','pins',s=>s.count())).toBe(0);
   const changed=next(base,'changed',1),value={...changed,observers:[changed.observers[0],base.observers[1]]};
   await expect(store.publishAndPin(base,value,(async function*(){yield {observer:'A',page:0,records:[row(1)]};})(),'bad')).rejects.toThrow('metadata mismatch');expect(await store.readManifest()).toEqual(base);expect(await inspect(factory,'corrupt','pages',s=>s.count())).toBe(0);
  }finally{await store.close();}
 });
 it('preserves a completed common CAS when close races its promise continuation',async()=>{
  const factory=new IDBFactory(),store=await open('completed-close',factory),base=await store.readManifest(),value=next(base,'complete',1);let closing:Promise<void>|undefined;
  const original=(store as any).tx.bind(store);vi.spyOn(store as any,'tx').mockImplementation(async(...args:any[])=>{const result=await original(...args);if(args[0].length===3&&args[0].includes('pins')&&args[0].includes('roots')&&args[0].includes('manifest'))closing=store.close();return result;});
  const snapshot=await store.publishAndPin(base,value,pages(value),'current');expect(snapshot).toEqual(value);await closing;expect(await inspect(factory,'completed-close','manifest',s=>s.get('current'))).toEqual(value);expect(await inspect(factory,'completed-close','pins',s=>s.count())).toBe(0);await store.close();
 });
 it('rejects an issued read whose exact lease is released before result delivery',async()=>{
  const store=await open('late-read'),base=await store.readManifest(),value=next(base,'live',1),snapshot=await store.publishAndPin(base,value,pages(value),'current'),ready=deferred(),release=deferred();
  const original=(store as any).tx.bind(store);vi.spyOn(store as any,'tx').mockImplementation(async(...args:any[])=>{const result=await original(...args);if(args[1]==='readonly'&&args[0].includes('pages')){ready.resolve();await release.promise;}return result;});
  const work=store.readPage(snapshot,'A',0),rejection=expect(work).rejects.toThrow('lease released');try{await ready.promise;await store.unpin('current');await store.readManifestAndPin('current');release.resolve();await rejection;}finally{release.resolve();await store.close();}
 });
 it('rejects existing databases whose pin index could miss historical readers',async()=>{
  const factory=new IDBFactory();await new Promise<void>((resolve,reject)=>{const get=factory.open('wrong-index',1);get.onupgradeneeded=()=>{const db=get.result;db.createObjectStore('manifest');db.createObjectStore('roots',{keyPath:'key'});const p=db.createObjectStore('pages',{keyPath:['root','page']});p.createIndex('root','root');const pins=db.createObjectStore('pins',{keyPath:['owner','id','observer']});pins.createIndex('owner','owner');pins.createIndex('lease',['owner','id']);pins.createIndex('root','observer');};get.onsuccess=()=>{get.result.close();resolve();};get.onerror=()=>reject(get.error);});
  await expect(open('wrong-index',factory)).rejects.toThrow('index');
 });
 it('bounds observer vectors and acquires a whole snapshot while another connection publishes',async()=>{
  const factory=new IDBFactory(),first=await open('pin-race',factory),base=await first.readManifest(),old=await first.publishAndPin(base,next(base,'old',1),pages(next(base,'old',1)),'old'),second=await open('pin-race',factory);try{
   const value=next(old,'new',17);const [snapshot]=await Promise.all([first.readManifestAndPin('reader'),second.publishAndPin(old,value,pages(value),'new')]);
   expect([old.version,value.version]).toContain(snapshot.version);expect(snapshot.observers.map(o=>o.root.key)).toEqual((snapshot.version===old.version?old:value).observers.map(o=>o.root.key));await first.unpin('old');await sweep(second);
   for(const o of snapshot.observers)expect((await first.readPage(snapshot,o.observer,0))[0]).toEqual(row(1));await first.unpin('reader');await sweep(second);
  }finally{await first.close();await second.close();}
  const tooMany:PickupBatchManifest={version:0,observers:Array.from({length:65},(_,i)=>({...initial().observers[0],observer:`observer-${i}`,root:{...initial().observers[0].root,key:`root-${i}`}}))};
  await expect(openOriginalPickupBatchStore({factory,databaseName:'too-many',initial:tooMany})).rejects.toThrow('manifest');
 });
 it('enforces lease, observer, prefix and page admission limits without publishing partial state',async()=>{
  const store=await open('limits'),base=await store.readManifest();try{
   for(let i=0;i<6;i++)await store.readManifestAndPin(`lease-${i}`);await expect(store.readManifestAndPin('seventh')).rejects.toThrow('budget');await store.unpin('lease-0');
   const invalid=next(base,'invalid',17);expect(()=>store.publishAndPin(base,{...invalid,observers:invalid.observers.map(o=>({...o,prefix:{...o.prefix,callback:2}}))},pages(invalid),'bad')).toThrow('callback');
   expect(()=>store.publishAndPin(base,{...invalid,observers:[invalid.observers[0],invalid.observers[0]]},pages(invalid),'bad')).toThrow('observer');
   for(const write of [{observer:'A',page:0,records:Array.from({length:17},(_,i)=>row(i+1))},{observer:'A',page:1,records:[row(1)]},{observer:'A',page:0,records:[row(2),row(1)]}]){
    await expect(store.publishAndPin(base,invalid,(async function*(){yield write;})(),'bad')).rejects.toThrow();expect(await store.readManifest()).toEqual(base);
   }
  }finally{await store.close();}
 });
});
