import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchObserverPlan,type PickupBatchWriter} from './originalPickupBatchStore';
import {OriginalReceiverLoadoutWorld} from '../shared/originalReceiverLoadoutWorld';
import {ORIGINAL_WEAPON_SLOT_ORDER} from '../shared/originalPickupRules';
import type {WeaponId} from '../shared/protocol';

const initial=():PickupBatchManifest=>({version:0,observers:['A','B'].map((observer,i)=>({observer,lifeGeneration:i+1,
 prefix:{kind:'callback',sceneGeneration:i+1,callback:0},lastReceiptTick:0,root:{version:0,count:0,pageCount:0,highWaterId:0,key:`initial-${observer}`}}))});
function plans(base:PickupBatchManifest,label:string):readonly PickupBatchObserverPlan[]{return base.observers.map(o=>({...o,
 prefix:{kind:'callback',sceneGeneration:o.prefix.sceneGeneration,callback:o.prefix.callback+1},root:{key:`${label}-${o.observer}`,version:o.root.version+1}}));}
function sealed(base:PickupBatchManifest,p:readonly PickupBatchObserverPlan[],counts:readonly number[],highWater?:readonly number[]):PickupBatchManifest{
 return {version:base.version+1,observers:p.map((o,i)=>({...o,root:{...o.root,count:counts[i],pageCount:Math.ceil(counts[i]/16),highWaterId:highWater?.[i]??counts[i]}}))};
}
const row=(id:number)=>({id,handle:'same-recycled-gun',weapon:'rifle' as const,position:{x:id,y:10,z:0}});
async function writeNew(writer:PickupBatchWriter,observer:string,count:number){
 let consumed=0,page=0;
 while(consumed<count){const records=[];for(let n=0;n<16&&consumed<count;n++,consumed++)records.push(row(writer.allocatePickupId(observer)));
  expect(records.length).toBeLessThanOrEqual(16);await writer.writePage({observer,page:page++,records});}
 return consumed;
}
const open=(name:string,factory:IDBFactory)=>openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()});
async function inspect<T>(factory:IDBFactory,name:string,store:string,read:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await new Promise<IDBDatabase>((r,j)=>{const get=factory.open(name);get.onsuccess=()=>r(get.result);get.onerror=()=>j(get.error);});
 return new Promise<T>((r,j)=>{const tx=db.transaction(store,'readonly'),get=read(tx.objectStore(store));let value:T;get.onsuccess=()=>{value=get.result;};
  tx.oncomplete=()=>{db.close();r(value);};tx.onabort=()=>{db.close();j(tx.error);};});
}
async function unchanged(factory:IDBFactory,name:string,base:PickupBatchManifest){
 expect(await inspect(factory,name,'manifest',s=>s.get('current'))).toEqual(base);
 expect(await inspect(factory,name,'pages',s=>s.count())).toBe(0);expect(await inspect(factory,name,'pins',s=>s.count())).toBe(0);
}
function bank(prefix:PickupBatchManifest['observers'][number]['prefix']){
 const owned=Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>,values=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
 return new OriginalReceiverLoadoutWorld({prefix,map:'barrack',selected:'rifle',owned,ammo:values(),reserve:values(),refillTarget:28,
  counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:32,maxTextChars:4096,weaponModelPresent:owned});
}

describe('unknown-count pickup streaming and final seal (CPU storage; not Game installation)',()=>{
 it('derives seventeen and thirty-three record roots only after bounded input is consumed',async()=>{
  const factory=new IDBFactory(),store=await open('stream-counts',factory),base=await store.readManifest(),p=plans(base,'stream');
  try{
   const writer=await store.beginBatch(base,p);expect(Object.isFrozen(writer)).toBe(true);
   // Plans contain namespace/version and source clocks, with no guessed count.
   expect(Object.keys(p[0].root).sort()).toEqual(['key','version']);
   const a=await writeNew(writer,'A',17);expect(await store.readManifest()).toEqual(base);
   const b=await writeNew(writer,'B',33);expect(await inspect(factory,'stream-counts','pins',s=>s.count())).toBe(0);
   const value=sealed(base,p,[a,b]),prepared=await writer.seal(value);expect(prepared.nextManifest).toEqual(value);expect(await store.readManifest()).toEqual(base);
   const snapshot=await prepared.publishAndPin('current');expect(await store.readPage(snapshot,'A',1)).toEqual([row(17)]);expect(await store.readPage(snapshot,'B',2)).toEqual([row(33)]);
   expect(await inspect(factory,'stream-counts','pages',s=>s.count())).toBe(5);
  }finally{await store.close();}
 });

 it('preserves empty-root high water including an issued pickup deleted before sealing',async()=>{
  const factory=new IDBFactory(),store=await open('stream-empty',factory),base=await store.readManifest(),p=plans(base,'old');
  try{
   const first=await store.beginBatch(base,p);await writeNew(first,'A',17);await writeNew(first,'B',33);
   const old=await (await first.seal(sealed(base,p,[17,33]))).publishAndPin('old');
   const change=plans(old,'empty'),writer=await store.beginBatch(old,change);expect(writer.allocatePickupId('A')).toBe(18);
   const value=sealed(old,change,[0,0],[18,33]),current=await (await writer.seal(value)).publishAndPin('current');
   expect(current.observers.map(o=>o.root)).toEqual(value.observers.map(o=>o.root));expect(current.observers.every(o=>o.root.pageCount===0)).toBe(true);
   const again=await store.beginBatch(current,plans(current,'again'));expect(again.allocatePickupId('A')).toBe(19);expect(again.allocatePickupId('B')).toBe(34);await again.abort();
  }finally{await store.close();}
 });

 it('runs staged actual loadout effects once before seal, without a counting dry pass or replay',async()=>{
  const factory=new IDBFactory(),store=await open('stream-effects',factory),base=await store.readManifest(),p=plans(base,'effects'),banks=base.observers.map(o=>bank(o.prefix));
  const before=banks.map(b=>b.freeze()),stages=banks.map(b=>b.begin()),intents:{observer:string;kind:string}[]=[],rewardSink=vi.fn();
  try{
   const writer=await store.beginBatch(base,p);let invocationCount=0;
   for(let observer=0;observer<2;observer++){
    const tx=stages[observer];tx.advanceCallback(p[observer].prefix);
    tx.getGun('rifle',intent=>{intents.push({observer:p[observer].observer,kind:intent.kind});});invocationCount++;tx.addScore(5);
    await writeNew(writer,p[observer].observer,observer===0?17:33);
   }
   const expected=stages.map(t=>t.freeze()),publishers=stages.map(t=>t.prepareCommit()),captured=[...intents];
   expect(intents).toEqual(['A','B'].flatMap(observer=>['whichgun','reload-pose','reload-sound','whichgun','feedback'].map(kind=>({observer,kind}))));
   const prepared=await writer.seal(sealed(base,p,[17,33]));expect(invocationCount).toBe(2);expect(intents).toEqual(captured);
   expect(banks.map(b=>b.freeze())).toEqual(before);expect(rewardSink).not.toHaveBeenCalled();
   await prepared.publishAndPin('current');expect(banks.map(b=>b.freeze())).toEqual(before);expect(intents).toEqual(captured);
   publishers.forEach(publish=>publish());expect(banks.map(b=>b.freeze())).toEqual(expected);rewardSink(banks.map(b=>b.freeze().score));
   expect(rewardSink).toHaveBeenCalledExactlyOnceWith([5,5]);expect(invocationCount).toBe(2);
   // Two actual getGun invocations/rewards plus streamed history. This is not
   // fifty ammo collections or an installed production callback readiness gate.
  }finally{stages.forEach(t=>t.rollback());banks.forEach(b=>b.release());await store.close();}
 });

 it('rejects final count/page/high-water, life and prefix mismatches with owned cleanup',async()=>{
  for(const fault of ['count','pages','highwater','life','prefix'] as const){
   const factory=new IDBFactory(),name=`stream-seal-${fault}`,store=await open(name,factory),base=await store.readManifest(),p=plans(base,'bad');
   try{
    const writer=await store.beginBatch(base,p);await writeNew(writer,'A',17);await writeNew(writer,'B',1);const valid=sealed(base,p,[17,1]);
    const a=valid.observers[0],broken=fault==='life'?{...a,lifeGeneration:a.lifeGeneration+1}:fault==='prefix'?{...a,prefix:{...a.prefix,callback:a.prefix.callback+1}}:
     {...a,root:{...a.root,...(fault==='count'?{count:18}:fault==='pages'?{pageCount:3}:{highWaterId:18})}};
    await expect(async()=>writer.seal({...valid,observers:[broken,valid.observers[1]]})).rejects.toThrow();await unchanged(factory,name,base);
    await expect(async()=>writer.allocatePickupId('A')).rejects.toThrow();
   }finally{await store.close();}
  }
 });

 it('rejects wrong observers, unordered IDs, oversized pages and pages following a short page',async()=>{
  for(const fault of ['observer','order','unissued','oversized','after-short'] as const){
   const factory=new IDBFactory(),name=`stream-page-${fault}`,store=await open(name,factory),base=await store.readManifest(),p=plans(base,'bad');
   try{
    const writer=await store.beginBatch(base,p);for(let n=0;n<33;n++)writer.allocatePickupId('A');
    await writer.writePage({observer:'A',page:0,records:Array.from({length:fault==='after-short'?1:16},(_,i)=>row(i+1))});
    const malformed=fault==='observer'?{observer:'FOREIGN',page:0,records:[row(1)]}:fault==='order'?{observer:'A',page:1,records:[row(16)]}:fault==='unissued'?{observer:'A',page:1,records:[row(34)]}:
     fault==='oversized'?{observer:'A',page:1,records:Array.from({length:17},(_,i)=>row(i+17))}:{observer:'A',page:1,records:[row(2)]};
    await expect(writer.writePage(malformed)).rejects.toThrow();await unchanged(factory,name,base);
   }finally{await store.close();}
  }
 });

 it('guards owned writer receivers and occupies the staging slot through sealing and prepared publication',async()=>{
  const factory=new IDBFactory(),store=await open('stream-handles',factory),base=await store.readManifest(),p=plans(base,'one');
  try{
   const writer=await store.beginBatch(base,p),clone={...writer};
   await expect(async()=>writer.allocatePickupId.call(clone,'A')).rejects.toThrow();
   await expect(async()=>writer.writePage.call(clone,{observer:'A',page:0,records:[row(1)]})).rejects.toThrow();
   await expect(async()=>store.beginBatch(base,plans(base,'busy'))).rejects.toThrow();
   await writeNew(writer,'A',1);const ready=await writer.seal(sealed(base,p,[1,0]));
   await expect(async()=>writer.allocatePickupId('A')).rejects.toThrow();await expect(async()=>writer.seal(sealed(base,p,[1,0]))).rejects.toThrow();
   await expect(async()=>store.beginBatch(base,plans(base,'still-busy'))).rejects.toThrow();await ready.abort();
   await unchanged(factory,'stream-handles',base);
  }finally{await store.close();}
 });

 it('rejects overlapping writer operations while awaiting one finite page transaction',async()=>{
  const factory=new IDBFactory(),store=await open('stream-write-busy',factory),base=await store.readManifest(),p=plans(base,'busy');
  let release!:()=>void,entered!:()=>void;const pending=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{entered=r;});
  try{
   const writer=await store.beginBatch(base,p);for(let n=0;n<17;n++)writer.allocatePickupId('A');
   const original=(store as any).tx.bind(store);let held=false;
   const spy=vi.spyOn(store as any,'tx').mockImplementation(async(...args:any[])=>{const result=await original(...args);
    if(!held&&args[1]==='readwrite'&&args[0].includes('pages')){held=true;entered();await pending;}return result;});
   const write=writer.writePage({observer:'A',page:0,records:Array.from({length:16},(_,i)=>row(i+1))});await ready;
   await expect(async()=>writer.writePage({observer:'A',page:1,records:[row(17)]})).rejects.toThrow(/operation pending/);
   await expect(async()=>writer.allocatePickupId('A')).rejects.toThrow(/operation pending/);
   await expect(async()=>writer.seal(sealed(base,p,[16,0],[17,0]))).rejects.toThrow(/operation pending/);
   release();await write;spy.mockRestore();await writer.writePage({observer:'A',page:1,records:[row(17)]});
   const prepared=await writer.seal(sealed(base,p,[17,0]));await prepared.abort();await unchanged(factory,'stream-write-busy',base);
  }finally{release();await store.close();}
 });

 it('cleans an unknown-count sealed loser when another connection wins the common CAS',async()=>{
  const factory=new IDBFactory(),first=await open('stream-stale',factory),second=await open('stream-stale',factory),base=await first.readManifest();
  try{
   const p=plans(base,'loser'),writer=await first.beginBatch(base,p);await writeNew(writer,'A',17);await writeNew(writer,'B',33);const loser=await writer.seal(sealed(base,p,[17,33]));
   const q=plans(base,'winner'),other=await second.beginBatch(base,q);await writeNew(other,'A',1);await writeNew(other,'B',1);
   const winner=await (await other.seal(sealed(base,q,[1,1]))).publishAndPin('winner');await expect(loser.publishAndPin('loser')).rejects.toThrow(/Stale/);
   expect(await first.readManifest()).toEqual(winner);for(const observer of ['A','B'])expect(await inspect(factory,'stream-stale','pages',s=>s.index('root').count(`loser-${observer}`))).toBe(0);
  }finally{await first.close();await second.close();}
 });

 it('closes before or after seal and drains only the unpublished writer namespaces',async()=>{
  for(const sealedFirst of [false,true]){
   const factory=new IDBFactory(),name=`stream-close-${sealedFirst}`,store=await open(name,factory),base=await store.readManifest(),p=plans(base,'closed');
   try{
    const writer=await store.beginBatch(base,p);await writeNew(writer,'A',17);await writeNew(writer,'B',33);
    const prepared=sealedFirst?await writer.seal(sealed(base,p,[17,33])):undefined;await store.close();
    if(prepared)await expect(async()=>prepared.publishAndPin('closed')).rejects.toThrow();else await expect(async()=>writer.seal(sealed(base,p,[17,33]))).rejects.toThrow();
    await unchanged(factory,name,base);
   }finally{await store.close();}
  }
 });

 it('preserves actual committed metadata when close races the completed sealed CAS',async()=>{
  const factory=new IDBFactory(),store=await open('stream-complete-close',factory),base=await store.readManifest(),p=plans(base,'committed');let closing:Promise<void>|undefined;
  try{
   const writer=await store.beginBatch(base,p);await writeNew(writer,'A',17);await writeNew(writer,'B',33);const value=sealed(base,p,[17,33]),ready=await writer.seal(value),original=(store as any).tx.bind(store);
   const spy=vi.spyOn(store as any,'tx').mockImplementation(async(...args:any[])=>{const result=await original(...args);
    if(args[0].length===3&&args[0].includes('manifest')&&args[0].includes('roots')&&args[0].includes('pins'))closing=store.close();return result;});
   expect(await ready.publishAndPin('current')).toEqual(value);await closing;spy.mockRestore();
   expect(await inspect(factory,'stream-complete-close','manifest',s=>s.get('current'))).toEqual(value);expect(await inspect(factory,'stream-complete-close','pages',s=>s.count())).toBe(5);
   expect(await inspect(factory,'stream-complete-close','pins',s=>s.count())).toBe(0);
  }finally{await store.close();}
 });

 it('reserves a lease only at publication and keeps the sealed preparation usable after lease-cap rejection',async()=>{
  const factory=new IDBFactory(),store=await open('stream-lease-cap',factory),base=await store.readManifest(),p=plans(base,'leased');
  try{
   for(let n=0;n<6;n++)await store.readManifestAndPin(`old-${n}`);
   const writer=await store.beginBatch(base,p);await writeNew(writer,'A',17);await writeNew(writer,'B',33);const ready=await writer.seal(sealed(base,p,[17,33]));
   await expect(async()=>ready.publishAndPin('seventh')).rejects.toThrow(/lease budget/);expect(await store.readManifest()).toEqual(base);
   await store.unpin('old-5');const current=await ready.publishAndPin('current');expect(await store.readPage(current,'B',2)).toEqual([row(33)]);
  }finally{await store.close();}
 });
});
