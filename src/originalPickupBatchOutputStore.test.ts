import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchOutputDescriptor} from './originalPickupBatchStore';
import type {ReceiverPickupOutputChunk} from '../shared/originalReceiverPickupOutput';

const initial=():PickupBatchManifest=>({version:0,observers:[{observer:'A',lifeGeneration:1,prefix:{kind:'callback',sceneGeneration:4,callback:0},lastReceiptTick:-1,root:{key:'initial',version:0,count:0,pageCount:0,highWaterId:0}}]});
const chunk=(sequence:number,empty=false):ReceiverPickupOutputChunk=>({prefix:{kind:'callback',sceneGeneration:4,callback:1},sequence,firstOrdinal:sequence,
 transitions:empty?[]:[{kind:'pickup-collected',ordinal:sequence,prefix:{kind:'callback',sceneGeneration:4,callback:1},pickup:{id:sequence,handle:'gun',weapon:'rpg',position:{x:0,y:1,z:2}}}],
 loadoutIntents:empty?[]:[{prefix:{kind:'callback',sceneGeneration:4,callback:1},intent:{kind:'feedback',message:`record ${sequence}`}}]});
async function fixture(name:string){
 const factory=new IDBFactory(),store=await openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()});
 const begin=async(rootKey='next')=>{
  const expected=await store.readManifest(),old=expected.observers[0];
  const plan={...old,prefix:{kind:'callback' as const,sceneGeneration:4,callback:old.prefix.callback+1},lastReceiptTick:old.lastReceiptTick+1,
   receiptPrefix:{kind:'receipt' as const,sceneGeneration:4,callback:old.prefix.callback,tick:old.lastReceiptTick+1},root:{key:rootKey,version:old.root.version+1}};
  const writer=await store.beginBatch(expected,[plan]),next:PickupBatchManifest={version:expected.version+1,observers:[{...plan,root:{...plan.root,count:0,pageCount:0,highWaterId:0}}]};
  return {expected,plan,writer,next};
 };
 const raw=async<T>(stores:string[],mode:IDBTransactionMode,operation:(tx:IDBTransaction,answer:(value:T)=>void)=>void)=>{
  const database=await new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise<T>((resolve,reject)=>{const tx=database.transaction(stores,mode);let value:T;tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);operation(tx,answer=>{value=answer;});});}finally{database.close();}
 };
 const rows=()=>raw<any[]>(['pages'],'readonly',(tx,answer)=>{const request=tx.objectStore('pages').getAll();request.onsuccess=()=>answer(request.result);});
 return {factory,store,begin,raw,rows,name};
}

describe('same-CAS durable bounded pickup output spool',()=>{
 it('reads a cursor only through the exact pinned output descriptor without consuming a chunk',async()=>{
  const f=await fixture('output-owned-cursor');try{
   const w=await f.begin();await w.writer.writeOutputChunk('A',chunk(1));
   const ready=await w.writer.seal(w.next),descriptor=ready.outputDescriptors[0],current=await ready.publishAndPin('current');
   expect(await f.store.readOutputClaimCursor(current,descriptor,'models')).toBe(0);
   await expect(f.store.readOutputClaimCursor({...current},descriptor,'models')).rejects.toThrow(/pinned/);
   await expect(f.store.readOutputClaimCursor(current,{...descriptor},'models')).rejects.toThrow(/Unauthenticated/);
   await f.store.claimOutputChunk(current,'A','models',1);
   expect(await f.store.readOutputClaimCursor(current,descriptor,'models')).toBe(1);
   expect(await f.store.readOutputClaimCursor(current,descriptor,'fades')).toBe(0);
   await f.store.unpin('current');await expect(f.store.readOutputClaimCursor(current,descriptor,'models')).rejects.toThrow(/pinned/);
  }finally{await f.store.close();}
 });
 it.each([17,33])('streams %i chunks, authenticates their descriptor and reads only after shared publication',async(count)=>{
  const f=await fixture(`output-stream-${count}`);try{
   const w=await f.begin();for(let sequence=1;sequence<=count;sequence++)await w.writer.writeOutputChunk('A',chunk(sequence));
   const ready=await w.writer.seal(w.next),descriptor=ready.outputDescriptors[0];
   expect(descriptor).toMatchObject({observer:'A',lifeGeneration:1,rootKey:'next',rootVersion:1,chunkCount:count,transitionCount:count,loadoutCount:count});
   const old=await f.store.readManifestAndPin('old');await expect(f.store.readOutputChunk(old,'A',1)).rejects.toThrow(/unavailable/);
   expect(()=>f.store.assertOutputDescriptor(ready.nextManifest,descriptor)).toThrow(/pinned/);
   const current=await ready.publishAndPin('current');f.store.assertOutputDescriptor(current,descriptor);
   expect(()=>f.store.assertOutputDescriptor(current,{...descriptor} as PickupBatchOutputDescriptor)).toThrow(/Unauthenticated/);
   expect(()=>f.store.assertOutputDescriptor({...current},descriptor)).toThrow(/pinned/);
   let transitions=0,feedback=0;
   for(let sequence=1;sequence<=count;sequence++){const output=await f.store.readOutputChunk(current,'A',sequence);expect(output.sequence).toBe(sequence);transitions+=output.transitions.length;feedback+=output.loadoutIntents.length;}
   expect(transitions).toBe(count);expect(feedback).toBe(count);await f.store.unpin('current');
   expect(()=>f.store.assertOutputDescriptor(current,descriptor)).toThrow(/pinned/);await expect(f.store.readOutputChunk(current,'A',1)).rejects.toThrow(/pinned/);
  }finally{await f.store.close();}
 });
 it('accepts empty initial flushes without inventing an ordinal or receipt clock',async()=>{
  const f=await fixture('output-empty');try{
   const w=await f.begin();await w.writer.writeOutputChunk('A',chunk(1,true));await w.writer.writeOutputChunk('A',{...chunk(1),sequence:2});
   const ready=await w.writer.seal(w.next),current=await ready.publishAndPin('current');
   expect(ready.outputDescriptors[0]).toMatchObject({chunkCount:2,transitionCount:1,loadoutCount:1});
   expect((await f.store.readOutputChunk(current,'A',1)).transitions).toEqual([]);expect((await f.store.readOutputChunk(current,'A',2)).firstOrdinal).toBe(1);
  }finally{await f.store.close();}
 });
 it('persists independent channel claims before a failing sink and across reopened connections',async()=>{
  const f=await fixture('output-claim');let reopened:Awaited<ReturnType<typeof openOriginalPickupBatchStore>>|undefined;
  try{
   const w=await f.begin();for(let sequence=1;sequence<=3;sequence++)await w.writer.writeOutputChunk('A',chunk(sequence));
   const ready=await w.writer.seal(w.next),current=await ready.publishAndPin('current');
   await f.store.claimOutputChunk(current,'A','models',1);
   expect(()=>{throw Error('declared presentation sink failed');}).toThrow('declared presentation sink failed');
   // A sink failure occurs after claim transaction completion; this chunk can
   // never be replayed even by a fresh connection and fresh reader lease.
   await expect(f.store.claimOutputChunk(current,'A','models',1)).rejects.toThrow(/replay/);
   expect((await f.store.claimOutputChunk(current,'A','loadout',1)).sequence).toBe(1);
   expect((await f.store.claimOutputChunk(current,'A','fades',1)).sequence).toBe(1);
   reopened=await openOriginalPickupBatchStore({databaseName:f.name,factory:f.factory,initial:initial()});const pin=await reopened.readManifestAndPin('reopened');
   expect(()=>reopened!.assertOutputDescriptor(pin,ready.outputDescriptors[0])).toThrow(/Unauthenticated/);
   await expect(reopened.claimOutputChunk(pin,'A','models',1)).rejects.toThrow(/replay/);
   expect((await reopened.claimOutputChunk(pin,'A','models',2)).sequence).toBe(2);
   await expect(f.store.claimOutputChunk(current,'A','models',2)).rejects.toThrow(/replay/);
   expect((await f.store.claimOutputChunk(current,'A','models',3)).sequence).toBe(3);
  }finally{await reopened?.close();await f.store.close();}
 });
 it('cleans a real foreign-writer CAS loser including all negative pages',async()=>{
  const f=await fixture('output-losing-cas'),foreign=await openOriginalPickupBatchStore({databaseName:f.name,factory:f.factory,initial:initial()});
  try{
   const w=await f.begin('loser');for(let n=1;n<=3;n++)await w.writer.writeOutputChunk('A',chunk(n));const ready=await w.writer.seal(w.next);
   const winnerPlan={...w.plan,root:{key:'winner',version:1}},writer=await foreign.beginBatch(w.expected,[winnerPlan]);
   const winning=await writer.seal({version:1,observers:[{...winnerPlan,root:{...winnerPlan.root,count:0,pageCount:0,highWaterId:0}}]});await winning.publishAndPin('winner');
   await expect(ready.publishAndPin('loser')).rejects.toThrow(/Stale/);expect((await f.rows()).filter(row=>row.root==='loser')).toEqual([]);
   const pin=await f.store.readManifestAndPin('winning');expect(()=>f.store.assertOutputDescriptor(pin,ready.outputDescriptors[0])).toThrow(/Unauthenticated/);
  }finally{await foreign.close();await f.store.close();}
 });
 it('keeps historical output roots pinned and garbage-collects negative pages in bounded batches',async()=>{
  const f=await fixture('output-gc');try{
   const w=await f.begin();for(let n=1;n<=33;n++)await w.writer.writeOutputChunk('A',chunk(n));const ready=await w.writer.seal(w.next),old=await ready.publishAndPin('old');
   const base=await f.store.readManifest(),entry=base.observers[0],next={version:2,observers:[{...entry,prefix:{kind:'callback' as const,sceneGeneration:4,callback:2},root:{...entry.root,key:'later',version:2}}]};
   await f.store.publishAndPin(base,next,(async function*(){})(),'later');await f.store.collectGarbage();expect((await f.store.readOutputChunk(old,'A',33)).sequence).toBe(33);
   await f.store.unpin('old');let deleted=0,after:string|undefined;
   for(let n=0;n<20;n++){const gc=await f.store.collectGarbage(after);expect(gc.pagesDeleted).toBeLessThanOrEqual(16);deleted+=gc.pagesDeleted;after=gc.after;if(gc.done)break;}
   expect(deleted).toBe(33);expect((await f.rows()).filter(row=>row.root==='next')).toEqual([]);
  }finally{await f.store.close();}
 });
 it('fails and cleans a writer on chunk gaps, foreign envelopes or invalid serialized data',async()=>{
  for(const fault of ['sequence','prefix','ordinal','text'] as const){const f=await fixture(`output-invalid-${fault}`);try{
   const w=await f.begin();await w.writer.writeOutputChunk('A',chunk(1));let bad=chunk(2);
   if(fault==='sequence')bad={...bad,sequence:3};if(fault==='prefix')bad={...bad,prefix:{...bad.prefix,callback:2}};
   if(fault==='ordinal')bad={...bad,firstOrdinal:3};if(fault==='text')bad={...bad,loadoutIntents:[{prefix:bad.prefix,intent:{kind:'feedback',message:'x'.repeat(65536)}}]};
   await expect(w.writer.writeOutputChunk('A',bad)).rejects.toThrow();expect(await f.rows()).toEqual([]);await expect(async()=>w.writer.seal(w.next)).rejects.toThrow(/unavailable/);
  }finally{await f.store.close();}}
 });
 it('rejects a corrupt sealed header before CAS and cleans its output rows',async()=>{
  const f=await fixture('output-corrupt-header');try{
   const w=await f.begin();await w.writer.writeOutputChunk('A',chunk(1));const ready=await w.writer.seal(w.next);
   await f.raw<void>(['roots'],'readwrite',(tx,answer)=>{const request=tx.objectStore('roots').get('next');request.onsuccess=()=>{const ns=request.result;ns.output.descriptor.chunkCount++;tx.objectStore('roots').put(ns);answer();};});
   await expect(ready.publishAndPin('corrupt')).rejects.toThrow(/ownership/);expect(await f.rows()).toEqual([]);expect(await f.store.readManifest()).toEqual(w.expected);
  }finally{await f.store.close();}
 });
 it('does not advance a channel cursor when corrupted chunk data is rejected',async()=>{
  const f=await fixture('output-corrupt-row');try{
   const w=await f.begin();await w.writer.writeOutputChunk('A',chunk(1));const ready=await w.writer.seal(w.next),pin=await ready.publishAndPin('current');
   await f.raw<void>(['pages'],'readwrite',(tx,answer)=>{const request=tx.objectStore('pages').get(['next',-1]);request.onsuccess=()=>{const row=request.result;row.output.sequence=2;tx.objectStore('pages').put(row);answer();};});
   await expect(f.store.claimOutputChunk(pin,'A','models',1)).rejects.toThrow(/Corrupt/);
   await f.raw<void>(['pages'],'readwrite',(tx,answer)=>{const request=tx.objectStore('pages').get(['next',-1]);request.onsuccess=()=>{const row=request.result;row.output.sequence=1;tx.objectStore('pages').put(row);answer();};});
   expect((await f.store.claimOutputChunk(pin,'A','models',1)).sequence).toBe(1);
  }finally{await f.store.close();}
 });
 it('rejects a middle-chunk ordinal gap before advancing its durable channel cursor',async()=>{
  const f=await fixture('output-corrupt-middle');try{
   const w=await f.begin();for(let n=1;n<=3;n++)await w.writer.writeOutputChunk('A',chunk(n));
   const ready=await w.writer.seal(w.next),pin=await ready.publishAndPin('current');await f.store.claimOutputChunk(pin,'A','models',1);
   await f.raw<void>(['pages'],'readwrite',(tx,answer)=>{const request=tx.objectStore('pages').get(['next',-2]);request.onsuccess=()=>{const row=request.result;row.firstOrdinal=3;row.output.firstOrdinal=3;row.output.transitions[0].ordinal=3;tx.objectStore('pages').put(row);answer();};});
   await expect(f.store.claimOutputChunk(pin,'A','models',2)).rejects.toThrow(/predecessor|ordinal/);
   await f.raw<void>(['pages'],'readwrite',(tx,answer)=>{const request=tx.objectStore('pages').get(['next',-2]);request.onsuccess=()=>{const row=request.result;row.firstOrdinal=2;row.output.firstOrdinal=2;row.output.transitions[0].ordinal=2;tx.objectStore('pages').put(row);answer();};});
   expect((await f.store.claimOutputChunk(pin,'A','models',2)).sequence).toBe(2);
  }finally{await f.store.close();}
 });
 it('holds the real output claim lease until its transaction is terminal',async()=>{
  const f=await fixture('output-unpin-race');try{
   const w=await f.begin();await w.writer.writeOutputChunk('A',chunk(1));const ready=await w.writer.seal(w.next),pin=await ready.publishAndPin('current');
   const pending=f.store.claimOutputChunk(pin,'A','models',1);
   // fake-indexeddb schedules the actual root/page requests asynchronously;
   // this unpin races an admitted, nonterminal claim transaction.
   await expect(f.store.unpin('current')).rejects.toThrow(/operation pending/);
   expect((await pending).sequence).toBe(1);f.store.assertPinnedSnapshot(pin);await f.store.unpin('current');
   await expect(f.store.readOutputChunk(pin,'A',1)).rejects.toThrow(/pinned/);
  }finally{await f.store.close();}
 });
 it('retains historical spool metadata when a legacy unchanged root advances its clock',async()=>{
  const f=await fixture('output-retained-clock');try{
   const w=await f.begin();await w.writer.writeOutputChunk('A',chunk(1));const ready=await w.writer.seal(w.next),old=await ready.publishAndPin('old');
   const next:PickupBatchManifest={version:2,observers:[{...old.observers[0],prefix:{kind:'callback',sceneGeneration:4,callback:2}}]};
   const later=await f.store.prepareBatch(old,next,(async function*(){})());expect(later.outputDescriptors).toEqual([]);
   const pin=await later.publishAndPin('later');expect(await f.store.readManifest()).toEqual(next);
   const rePinned=await f.store.readManifestAndPin('reopened');expect(rePinned).toEqual(next);
   expect((await f.store.readOutputChunk(old,'A',1)).sequence).toBe(1);
   expect(()=>f.store.assertOutputDescriptor(pin,ready.outputDescriptors[0])).toThrow(/snapshot mismatch/);
   await expect(f.store.readOutputChunk(pin,'A',1)).rejects.toThrow(/header/);
  }finally{await f.store.close();}
 });
 it('rejects a backwards receipt-prefix loadout output across an empty chunk',async()=>{
  const f=await fixture('output-backwards-loadout');try{
   const w=await f.begin();await w.writer.writeOutputChunk('A',chunk(1));
   await w.writer.writeOutputChunk('A',{...chunk(2,true),firstOrdinal:2});
   const receipt={kind:'receipt' as const,sceneGeneration:4,callback:0,tick:0};
   const backwards={...chunk(2,true),sequence:3,firstOrdinal:2,loadoutIntents:[{prefix:receipt,intent:{kind:'feedback' as const,message:'late old receipt'}}]};
   await expect(w.writer.writeOutputChunk('A',backwards)).rejects.toThrow(/sequence/);expect(await f.rows()).toEqual([]);
  }finally{await f.store.close();}
 });
 it('rejects output staging on an unreceived fresh life without inventing receipt zero',async()=>{
  const f=await fixture('output-unreceived');try{
   const expected=await f.store.readManifest(),entry=expected.observers[0],writer=await f.store.beginBatch(expected,[{...entry,lifeGeneration:2,root:{key:'fresh-life',version:0}}]);
   await expect(writer.writeOutputChunk('A',{...chunk(1,true),prefix:entry.prefix})).rejects.toThrow(/received receipt clock/);
   expect(await f.rows()).toEqual([]);expect(await f.store.readManifest()).toEqual(expected);
  }finally{await f.store.close();}
 });
});
