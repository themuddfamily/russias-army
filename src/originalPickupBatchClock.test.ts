import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchObserverPlan} from './originalPickupBatchStore';
import type {ReceiverScenePrefix} from '../shared/originalReceiverPrefix';

const initial=(tick=-1):PickupBatchManifest=>({version:0,observers:[{observer:'A',lifeGeneration:1,
 prefix:{kind:'callback',sceneGeneration:7,callback:0},lastReceiptTick:tick,root:{version:0,count:0,pageCount:0,highWaterId:0,key:'initial-A'}}]});
const proof=(tick=0,callback=0,sceneGeneration=7):Extract<ReceiverScenePrefix,{kind:'receipt'}>=>({kind:'receipt',sceneGeneration,callback,tick});
function plan(base:PickupBatchManifest,receiptPrefix?:ReturnType<typeof proof>):PickupBatchObserverPlan{
 const a=base.observers[0];return {observer:a.observer,lifeGeneration:a.lifeGeneration,
 prefix:{kind:'callback',sceneGeneration:a.prefix.sceneGeneration,callback:a.prefix.callback+1},lastReceiptTick:receiptPrefix?.tick??a.lastReceiptTick,
 root:{key:`next-${base.version}`,version:a.root.version+1},...(receiptPrefix===undefined?{}:{receiptPrefix})};
}
function final(base:PickupBatchManifest,p:PickupBatchObserverPlan):PickupBatchManifest{
 return {version:base.version+1,observers:[{observer:p.observer,lifeGeneration:p.lifeGeneration,prefix:p.prefix,lastReceiptTick:p.lastReceiptTick,
 root:{...p.root,count:0,pageCount:0,highWaterId:base.observers[0].root.highWaterId}}]};
}
const empty=async function*(){};
const open=(name:string,value=initial())=>openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial:value});

describe('streamed receipt and callback clocks (CPU IndexedDB; no Game installation)',()=>{
 it('publishes initial receipt tick zero, then a callback containing the next exact receipt',async()=>{
  const store=await open('clock-zero');try{
   const base=await store.readManifest(),a=base.observers[0],receipt:PickupBatchObserverPlan={...a,prefix:proof(),lastReceiptTick:0};
   const first=await store.beginBatch(base,[receipt]);const afterReceipt=await (await first.seal(final(base,receipt))).publishAndPin('receipt');
   expect(afterReceipt.observers[0].lastReceiptTick).toBe(0);expect(afterReceipt.observers[0].prefix).toEqual(proof());
   const p=plan(afterReceipt,proof(1)),writer=await store.beginBatch(afterReceipt,[p]);
   expect(await store.readManifest()).toEqual(afterReceipt);
   const prepared=await writer.seal(final(afterReceipt,p));expect(await store.readManifest()).toEqual(afterReceipt);
   const adopted=await prepared.publishAndPin('callback');expect(adopted.observers[0].prefix.callback).toBe(1);expect(adopted.observers[0].lastReceiptTick).toBe(1);
  }finally{await store.close();}
 });
 it('combines the first tick-zero receipt directly with callback one',async()=>{
  const store=await open('clock-first');try{const base=await store.readManifest(),p=plan(base,proof()),writer=await store.beginBatch(base,[p]);
   const adopted=await (await writer.seal(final(base,p))).publishAndPin('first');expect(adopted.observers[0].lastReceiptTick).toBe(0);
  }finally{await store.close();}
 });
 it.each(['skip','regress','missing','wrongCallback','wrongScene','wrongTick','duplicateTick','newLife','unchanged','receiptOnly','duplicatePlan'] as const)('rejects %s receipt proof before staging',async fault=>{
  const store=await open(`clock-${fault}`,initial(3));try{
   const base=await store.readManifest(),good=plan(base,proof(4));let p:PickupBatchObserverPlan=good;
   if(fault==='skip')p={...good,prefix:{...good.prefix,callback:2}};
   if(fault==='regress')p={...good,prefix:{...good.prefix,callback:0}};
   if(fault==='missing'){const {receiptPrefix:_,...without}=good;p=without;}
   if(fault==='wrongCallback')p={...good,receiptPrefix:proof(4,1)};
   if(fault==='wrongScene')p={...good,receiptPrefix:proof(4,0,8)};
   if(fault==='wrongTick')p={...good,lastReceiptTick:5,receiptPrefix:proof(5)};
   if(fault==='duplicateTick')p={...good,lastReceiptTick:3,receiptPrefix:proof(3)};
   if(fault==='newLife')p={...good,lifeGeneration:2,prefix:base.observers[0].prefix,root:{key:'new-life',version:0}};
   if(fault==='unchanged')p={...good,prefix:base.observers[0].prefix,lastReceiptTick:3};
   if(fault==='receiptOnly')p={...good,prefix:proof(4)};
   expect(()=>store.beginBatch(base,fault==='duplicatePlan'?[p,p]:[p])).toThrow();expect(await store.readManifest()).toEqual(base);
   const recovery=plan(base),writer=await store.beginBatch(base,[recovery]);await writer.abort();
  }finally{await store.close();}
 });
 it('does not extend known-count preparation or compatibility publication with implicit receipt proof',async()=>{
  const store=await open('clock-known');try{const base=await store.readManifest(),next=final(base,plan(base,proof()));
   expect(()=>store.prepareBatch(base,next,empty())).toThrow();expect(()=>store.publishAndPin(base,next,empty(),'known')).toThrow();
   expect(await store.readManifest()).toEqual(base);
  }finally{await store.close();}
 });
 it('accepts minus one only on fresh callback-zero roots and keeps legacy nonnegative clocks',async()=>{
  for(const fault of ['receipt','callback','rootVersion','count','highwater','negative'] as const){
   const base=initial(),a=base.observers[0];const broken:PickupBatchManifest={...base,observers:[fault==='receipt'?{...a,prefix:proof()}:
    fault==='callback'?{...a,prefix:{...a.prefix,callback:1}}:fault==='negative'?{...a,lastReceiptTick:-2}:
    {...a,root:{...a.root,...(fault==='rootVersion'?{version:1}:fault==='count'?{count:1,pageCount:1,highWaterId:1}:{highWaterId:1})}}]};
   await expect(open(`clock-minus-${fault}`,broken)).rejects.toThrow();
  }
  const store=await open('clock-legacy',initial(0));try{const base=await store.readManifest(),p=plan(base),writer=await store.beginBatch(base,[p]);
   expect((await (await writer.seal(final(base,p))).publishAndPin('legacy')).observers[0].lastReceiptTick).toBe(0);
  }finally{await store.close();}
 });
 it('snapshots each caller plan and nested proof getter once before awaiting and keeps proof private',async()=>{
  const store=await open('clock-getters');try{
   const base=await store.readManifest(),good=plan(base,proof()),expected=final(base,good),reads=new Map<string,number>();
   const object=(label:string,values:object)=>Object.defineProperties({},Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{enumerable:true,get(){const name=`${label}.${k}`,n=(reads.get(name)??0)+1;reads.set(name,n);if(n>1)throw Error(`Repeated ${name}`);return value;}}])));
   const rawProof=object('proof',proof()),rawPrefix=object('prefix',good.prefix),rawRoot=object('root',good.root);
   const rawPlan=object('plan',{...good,prefix:rawPrefix,root:rawRoot,receiptPrefix:rawProof}) as PickupBatchObserverPlan;
   const pending=store.beginBatch(base,[rawPlan]);expect([...reads.values()].every(n=>n===1)).toBe(true);
   const writer=await pending,prepared=await writer.seal(expected);expect([...reads.values()].every(n=>n===1)).toBe(true);
   expect(Object.isFrozen(prepared.nextManifest)).toBe(true);expect(Object.isFrozen(prepared.nextManifest.observers[0].prefix)).toBe(true);
   expect('receiptPrefix' in prepared.nextManifest.observers[0]).toBe(false);
   expect(await prepared.publishAndPin('getters')).toEqual(expected);
  }finally{await store.close();}
 });
 it('authenticates exact writer observer life and prefix against an owned pinned snapshot',async()=>{
  const store=await open('clock-plan-auth');try{
   const snapshot=await store.readManifestAndPin('reader'),p=plan(snapshot,proof()),writer=await store.beginBatch(snapshot,[p]);
   expect(()=>store.assertWriterObserverPlan(writer,snapshot,'A',1,p.prefix)).not.toThrow();
   for(const [observer,life,prefix] of [['B',1,p.prefix],['A',2,p.prefix],['A',1,{...p.prefix,callback:2}],['A',1,proof()]] as const){
    expect(()=>store.assertWriterObserverPlan(writer,snapshot,observer,life,prefix)).toThrow();
   }
   expect(()=>store.assertWriterObserverPlan(writer,{...snapshot},'A',1,p.prefix)).toThrow();
   const prepared=await writer.seal(final(snapshot,p));expect(()=>store.assertWriterObserverPlan(writer,snapshot,'A',1,p.prefix)).toThrow();await prepared.abort();
  }finally{await store.close();}
 });
 it('rejects receipt proof on fresh registration and rejects a callback-shaped proof',async()=>{
  const store=await open('clock-registration',initial(0));try{
   const base=await store.readManifest(),p=plan(base,proof(1));
   const registration:PickupBatchObserverPlan={...p,observer:'B',lifeGeneration:1,prefix:{kind:'callback',sceneGeneration:8,callback:0},root:{key:'new-B',version:0}};
   expect(()=>store.beginBatch(base,[registration])).toThrow();
   const malformed={...p,receiptPrefix:{kind:'callback',sceneGeneration:7,callback:0}} as unknown as PickupBatchObserverPlan;
   expect(()=>store.beginBatch(base,[malformed])).toThrow();expect(await store.readManifest()).toEqual(base);
  }finally{await store.close();}
 });
 it('rejects outer capture when a receipt-proof getter starts a nested writer, preserving the nested capability',async()=>{
  const store=await open('clock-reentry',initial(0));try{
   const base=await store.readManifest(),nestedPlan=plan(base),rawOuter=plan(base,proof(1)),outerPlan={...rawOuter,root:{...rawOuter.root,key:'outer-reentry'}};
   let nested:ReturnType<typeof store.beginBatch>|undefined;
   Object.defineProperty(outerPlan,'receiptPrefix',{get(){nested=store.beginBatch(base,[nestedPlan]);return proof(1);}});
   expect(()=>store.beginBatch(base,[outerPlan])).toThrow('publication pending');
   const writer=await nested!;expect(writer.allocatePickupId('A')).toBe(1);await writer.abort();
   expect(await store.readManifest()).toEqual(base);
   const recovery=await store.beginBatch(base,[nestedPlan]);await recovery.abort();
  }finally{await store.close();}
 });
 it.each(['prepare','publish'] as const)('rejects known-count %s capture reentry from the iterator getter',async mode=>{
  const store=await open(`clock-known-reentry-${mode}`,initial(0));try{
   const base=await store.readManifest(),p=plan(base);let nested:ReturnType<typeof store.beginBatch>|undefined,reads=0;
   const pages=Object.defineProperty({},Symbol.asyncIterator,{get(){reads++;nested=store.beginBatch(base,[p]);return empty;}}) as AsyncIterable<never>;
   expect(()=>mode==='prepare'?store.prepareBatch(base,final(base,p),pages):store.publishAndPin(base,final(base,p),pages,'outer')).toThrow('publication pending');
   expect(reads).toBe(1);const writer=await nested!;expect(writer.allocatePickupId('A')).toBe(1);await writer.abort();
   expect(await store.readManifest()).toEqual(base);const recovery=await store.beginBatch(base,[p]);await recovery.abort();
  }finally{await store.close();}
 });
 it('captures the known-count iterator getter once before asynchronous staging',async()=>{
  const store=await open('clock-iterator-once',initial(0));try{
   const base=await store.readManifest(),p=plan(base);let reads=0;
   const pages=Object.defineProperty({},Symbol.asyncIterator,{get(){if(++reads>1)throw Error('Iterator getter repeated');return empty;}}) as AsyncIterable<never>;
   const prepared=await store.prepareBatch(base,final(base,p),pages);expect(reads).toBe(1);await prepared.abort();
  }finally{await store.close();}
 });
 it('rejects a proof getter that closes the store before allocating provisional namespaces',async()=>{
  const factory=new IDBFactory(),name='clock-close-getter',store=await openOriginalPickupBatchStore({databaseName:name,factory,initial:initial(0)});
  const base=await store.readManifest(),p=plan(base,proof(1));let closing:Promise<void>|undefined;
  Object.defineProperty(p,'receiptPrefix',{get(){closing=store.close();return proof(1);}});
  expect(()=>store.beginBatch(base,[p])).toThrow('storage closed');await closing;
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{const roots=await new Promise<number>((resolve,reject)=>{const transaction=db.transaction('roots','readonly'),request=transaction.objectStore('roots').count();let count=0;
   request.onsuccess=()=>{count=request.result;};transaction.oncomplete=()=>resolve(count);transaction.onabort=()=>reject(transaction.error);});expect(roots).toBe(1);
  }finally{db.close();}
  const reopened=await openOriginalPickupBatchStore({databaseName:name,factory,initial:initial(0)});try{expect(await reopened.readManifest()).toEqual(base);}finally{await reopened.close();}
 });
 it('captures mutable proof and final manifest before IO, and revalidates planned clocks at seal',async()=>{
  const store=await open('clock-seal');try{
   const base=await store.readManifest(),receipt=proof(),p=plan(base,receipt),expected=final(base,p);
   const pending=store.beginBatch(base,[p]);(receipt as {tick:number;callback:number}).tick=99;(receipt as {tick:number;callback:number}).callback=99;
   const writer=await pending,preparedPending=writer.seal(expected);
   (expected.observers[0] as {lastReceiptTick:number}).lastReceiptTick=99;
   const prepared=await preparedPending;expect(prepared.nextManifest.observers[0].lastReceiptTick).toBe(0);
   const current=await prepared.publishAndPin('seal'),next=plan(current,proof(1,1)),bad=await store.beginBatch(current,[next]);
   const invalid=final(current,next);(invalid.observers[0] as {lastReceiptTick:number}).lastReceiptTick=2;
   await expect(bad.seal(invalid)).rejects.toThrow();expect(await store.readManifest()).toEqual(current);
  }finally{await store.close();}
 });
});
