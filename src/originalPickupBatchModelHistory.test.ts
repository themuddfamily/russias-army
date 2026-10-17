import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchObserverPlan} from './originalPickupBatchStore';
import {openOriginalPickupBatchReader} from './originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelPose,type ReceiverPickup} from '../shared/originalReceiverModelWorld';
import {OriginalReceiverLoadoutWorld,collectOriginalReceiverAmmoPickup} from '../shared/originalReceiverLoadoutWorld';
import {ORIGINAL_WEAPON_SLOT_ORDER} from '../shared/originalPickupRules';
import type {WeaponId} from '../shared/protocol';

const pose=():ReceiverModelPose=>({position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1});
const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'declared-CPU-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'declared-CPU-gun'}),
 sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>({...gi.pose,position:{...gi.pose.position,x:gi.pose.position.x+3}}),
 reparentGunMembership:()=>true,dropYaw:()=>.7,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};
const actor=(x:number)=>({position:{x,y:10,z:7},yaw:.2,motionTime:123,weapon:'rpg' as const});
const birth=(callback:number,x:number)=>({actorId:'recycled',targetFeet:{x,y:10,z:7},targetYaw:.2,callback});
const initial=():PickupBatchManifest=>({version:0,observers:[{observer:'A',lifeGeneration:1,prefix:{kind:'callback',sceneGeneration:4,callback:0},lastReceiptTick:0,
 root:{key:'initial-A',version:0,count:0,pageCount:0,highWaterId:0}}]});
async function fixture(name:string){
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial:initial()}),base=await store.readManifest();
 const source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root:base.observers[0].root});
 const models=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:8,maxPickups:16,requireCompleteCoverage:true},
  {snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-external-query'})},source);
 const begin=async()=>{
  const reader=await openOriginalPickupBatchReader(store,'reader'),base=reader.manifest,o=base.observers[0],prefix={kind:'callback' as const,sceneGeneration:4,callback:o.prefix.callback+1};
  const plans:readonly PickupBatchObserverPlan[]=[{...o,prefix,root:{key:`history-${prefix.callback}`,version:o.root.version+1}}],writer=await store.beginBatch(base,plans);
  const stage=source.stage(reader,writer,prefix),tx=models.begin();tx.advanceExternalCallback(prefix.callback);
  return {reader,base,prefix,plans,writer,stage,tx};
 };
 return {store,source,models,begin};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
type Work=Awaited<ReturnType<Fixture['begin']>>;
async function rebuild(work:Work,removeId?:number){
 let output:Readonly<ReceiverPickup>[]=[],page=0,count=0,maxBuffer=0;
 const emit=async(record:Readonly<ReceiverPickup>)=>{output.push(record);count++;maxBuffer=Math.max(maxBuffer,output.length);
  if(output.length===16){await work.writer.writePage({observer:'A',page:page++,records:output});output=[];}};
 // Only one old window and one output buffer are resident. Reblock short tail
 // pages before adding new drops; never retain a complete history array.
 for(let p=0;p<work.base.observers[0].root.pageCount;p++){
  const window=await work.stage.loadWindow(p);for(const record of work.reader.records(window))if(record.id!==removeId)await emit(record);
  work.stage.releaseWindow(window);
 }
 const edits=work.stage.drainEdits();expect(edits.length).toBeLessThanOrEqual(16);
 for(const edit of edits)if(edit.kind==='append')await emit(edit.pickup);
 if(output.length)await work.writer.writePage({observer:'A',page:page++,records:output});
 expect(maxBuffer).toBeLessThanOrEqual(16);
 const highWaterId=Math.max(work.base.observers[0].root.highWaterId,...edits.filter(e=>e.kind==='append').map(e=>e.pickup.id));
 const value:PickupBatchManifest={version:work.base.version+1,observers:[{...work.plans[0],root:{...work.plans[0].root,count,pageCount:page,highWaterId}}]};
 const prepared=await work.writer.seal(value);work.stage.seal(prepared);return prepared;
}
async function commit(work:Work,prepared:Awaited<ReturnType<typeof rebuild>>){
 const publish=work.tx.prepareCommit();await prepared.publishAndPin('current');publish();await work.reader.close();
}
async function drops(f:Fixture,count:number){
 let oldest:Readonly<ReceiverPickup>|undefined,handle:string|undefined;
 for(let life=0;life<count;life++){
  const work=await f.begin();
  try{
   if(life>0)for(let n=0;n<76;n++)work.tx.advanceCorpses();
   const born=work.tx.birth(birth(work.prefix.callback,life*100));work.tx.beforeCallback('recycled',actor(life*100));work.tx.detach('recycled',actor(life*100),work.prefix.callback);
   if(handle!==undefined)expect(born.gunHandle).toBe(handle);handle=born.gunHandle;
   const prepared=await rebuild(work);await commit(work,prepared);await f.store.unpin('current');
   expect(f.source.history.root.count).toBe(life+1);expect(f.models.freezeActorRegistry().pickups).toEqual([]);
   expect(f.models.freezeModels().length).toBeLessThanOrEqual(2);
   if(!oldest){const reader=await openOriginalPickupBatchReader(f.store,'audit');const window=await reader.loadWindow('A',0,{kind:'callback',sceneGeneration:4,callback:work.prefix.callback+1});oldest=reader.readPickup(window,1)!;await reader.close();}
  }finally{work.tx.rollback();await work.reader.close();}
 }
 return {oldest:oldest!,handle:handle!};
}
function loadout(prefix:Work['prefix']){
 const bool=Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>,nums=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
 return new OriginalReceiverLoadoutWorld({prefix,map:'barrack',selected:'rpg',owned:bool,ammo:nums(),reserve:nums(),refillTarget:1,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},
  {maxCommands:32,maxTextChars:4096,weaponModelPresent:bool});
}

describe('real paged ModelWorld history adapter (declared CPU lifecycle; not Game or native timing)',()=>{
 it('rolls back a resident window safely after its reader has already closed',async()=>{
  const f=await fixture('model-paging-closed-rollback');let work:Work|undefined;
  try{
   await drops(f,1);const before=f.models.freezeModels(),history=f.source.history;work=await f.begin();
   await work.stage.loadWindow(0);expect(work.tx.readPickup(1).pickup!.id).toBe(1);await work.reader.close();
   expect(()=>work!.tx.rollback()).not.toThrow();await work.writer.abort();
   expect(f.models.freezeModels()).toEqual(before);expect(f.source.history).toEqual(history);
  }finally{work?.tx.rollback();await work?.reader.close();await f.store.close();}
 });

 it('adopts a completed CAS even when the old reader closes before memory publication',async()=>{
  const f=await fixture('model-paging-completed-close');let work:Work|undefined;
  try{
   work=await f.begin();work.tx.birth(birth(work.prefix.callback,0));work.tx.beforeCallback('recycled',actor(0));work.tx.detach('recycled',actor(0),work.prefix.callback);
   const prepared=await rebuild(work),publish=work.tx.prepareCommit();await prepared.publishAndPin('current');await work.reader.close();publish();
   expect(f.source.history.root.count).toBe(1);expect(f.models.freezeActorRegistry().pickupHistory).toEqual(f.source.history);
   expect(()=>publish()).toThrow();
  }finally{work?.tx.rollback();await work?.reader.close();await f.store.close();}
 });

 it('shares a global sixteen-edit budget across two observer model stages',async()=>{
  const seed=initial(),second={...seed.observers[0],observer:'B',lifeGeneration:2,root:{...seed.observers[0].root,key:'initial-B'}};
  const store=await openOriginalPickupBatchStore({databaseName:'model-paging-global-edits',factory:new IDBFactory(),initial:{...seed,observers:[seed.observers[0],second]}});
  const reader=await openOriginalPickupBatchReader(store,'reader'),prefix={kind:'callback' as const,sceneGeneration:4,callback:1};
  const plans=reader.manifest.observers.map(o=>({...o,prefix,root:{key:`global-${o.observer}`,version:1}})),writer=await store.beginBatch(reader.manifest,plans);
  const sources=reader.manifest.observers.map(o=>new OriginalPickupBatchModelHistory({observer:o.observer,lifeGeneration:o.lifeGeneration,root:o.root}));
  const worlds=sources.map(source=>new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:8,maxPickups:16},
   {snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-external-query'})},source));
  for(const source of sources)source.stage(reader,writer,prefix);
  const txs=worlds.map(world=>world.begin());for(const tx of txs)tx.advanceExternalCallback(1);
  try{
   for(let n=0;n<16;n++){txs[0].birth(birth(1,n*100));txs[0].beforeCallback('recycled',actor(n*100));txs[0].detach('recycled',actor(n*100),1);for(let k=0;k<76;k++)txs[0].advanceCorpses();}
   txs[1].birth(birth(1,0));txs[1].beforeCallback('recycled',actor(0));
   expect(()=>txs[1].detach('recycled',actor(0),1)).toThrow(/Global.*draining/);
   expect(sources.map(source=>source.history.root.count)).toEqual([0,0]);
  }finally{for(const tx of txs)tx.rollback();await writer.abort();await reader.close();await store.close();}
 });
 it('commits seventeen historical drops and collects the oldest alias without repositioning its held gun',async()=>{
  const f=await fixture('model-paging-seventeen');let work:Work|undefined,bank:ReturnType<typeof loadout>|undefined;
  try{
   // Seventy-six declared advanceCorpses operations exercise FIFO recycling;
   // this unit setup does not claim seventy-six production callback schedules.
   const history=await drops(f,17);expect(f.source.history.root).toMatchObject({count:17,pageCount:2,highWaterId:17});
   expect(()=>f.models.freezePickups()).toThrow(/window/);
   work=await f.begin();for(let n=0;n<76;n++)work.tx.advanceCorpses();const live=work.tx.birth(birth(work.prefix.callback,9999));
   work.tx.beforeCallback('recycled',actor(9999));work.tx.afterCallback('recycled',actor(9999));expect(live.gunHandle).toBe(history.handle);
   const beforeGun=work.tx.freezeModels().find(m=>m.handle===live.gunHandle)!,window=await work.stage.loadWindow(0);
   const operand=work.tx.readPickup(1);expect(operand.pickup).toEqual(history.oldest);expect(operand.pickup!.position.x).toBe(0);
   bank=loadout(work.prefix);const ammo=bank.begin(),intents:string[]=[];
   expect(collectOriginalReceiverAmmoPickup(work.tx,ammo,{pickupId:1,goody:{eyePosition:history.oldest.position,bspWorld:1}},intent=>intents.push(intent.kind))).toBe(true);
   expect(intents).toEqual(['whichgun','reload-pose','reload-sound','whichgun','feedback']);
   const afterGun=work.tx.freezeModels().find(m=>m.handle===live.gunHandle)!;expect(afterGun.pose).toEqual(beforeGun.pose);expect(afterGun.inWorld).toBe(false);
   // Stream this already loaded first window, then page1, in the same model tx.
   let records:Readonly<ReceiverPickup>[]=[],page=0;
   for(const record of work.reader.records(window))if(record.id!==1)records.push(record);work.stage.releaseWindow(window);
   const tail=await work.stage.loadWindow(1);for(const record of work.reader.records(tail)){records.push(record);if(records.length===16){await work.writer.writePage({observer:'A',page:page++,records});records=[];}}
   work.stage.releaseWindow(tail);expect(work.stage.drainEdits()).toEqual([{kind:'remove',pickup:history.oldest}]);expect(records).toEqual([]);
   const value:PickupBatchManifest={version:work.base.version+1,observers:[{...work.plans[0],root:{...work.plans[0].root,count:16,pageCount:1,highWaterId:17}}]};
   const prepared=await work.writer.seal(value);work.stage.seal(prepared);const publishModel=work.tx.prepareCommit(),publishAmmo=ammo.prepareCommit();
   expect(bank.freeze().score).toBe(0);expect(f.source.history.root.count).toBe(17);
   const current=await prepared.publishAndPin('current');expect(bank.freeze().score).toBe(0);publishModel();publishAmmo();
   expect(bank.freeze().score).toBe(5);expect(f.source.history.root.count).toBe(16);expect((await f.store.readPage(current,'A',0))[0].id).toBe(2);
   expect(f.models.freezeActorRegistry().actors[0].gun).toBe(history.handle);
  }finally{work?.tx.rollback();await work?.reader.close();bank?.release();await f.store.close();}
 },15000);

 it('invalidates same-prefix operands between resident windows without treating a miss as absence',async()=>{
  const f=await fixture('model-paging-epoch');let work:Work|undefined;
  try{
   await drops(f,17);
   // Each rejected model-port operation poisons its transaction, so isolate
   // negative checks rather than continuing mutations after a caught error.
   for(const invalid of ['nonresident','old-record','old-null'] as const){
    work=await f.begin();const first=await work.stage.loadWindow(0),operand=work.tx.readPickup(1),zero=work.tx.readPickup(0);
    if(invalid==='nonresident')expect(()=>work!.tx.readPickup(17)).toThrow(/not resident/);
    else{
     work.stage.releaseWindow(first);const second=await work.stage.loadWindow(1);expect(work.tx.readPickup(17).pickup!.id).toBe(17);
     expect(()=>work!.tx.collectPickup(invalid==='old-record'?operand:zero)).toThrow(/window/);work.stage.releaseWindow(second);
    }
    expect(()=>work!.tx.prepareCommit()).toThrow();work.tx.rollback();await work.writer.abort();await work.reader.close();expect(f.source.history.root.count).toBe(17);
   }
  }finally{work?.tx.rollback();await work?.reader.close();await f.store.close();}
 },15000);

 it('rolls back a late staged collection after page1 without changing history, model bank or rewards',async()=>{
  const f=await fixture('model-paging-rollback');let work:Work|undefined,bank:ReturnType<typeof loadout>|undefined;
  try{
   const old=await drops(f,17),before=f.models.freezeModels(),history=f.source.history;work=await f.begin();bank=loadout(work.prefix);const ammo=bank.begin();
   const first=await work.stage.loadWindow(0);expect(collectOriginalReceiverAmmoPickup(work.tx,ammo,{pickupId:1,goody:{eyePosition:old.oldest.position,bspWorld:1}},()=>{})).toBe(true);
   work.stage.releaseWindow(first);const second=await work.stage.loadWindow(1);expect(work.tx.readPickup(17).pickup!.id).toBe(17);work.stage.releaseWindow(second);
   expect(()=>work!.tx.prepareCommit()).toThrow();work.tx.rollback();ammo.rollback();await work.writer.abort();
   expect(f.source.history).toEqual(history);expect(f.models.freezeModels()).toEqual(before);expect(bank.freeze().score).toBe(0);expect(await f.store.readManifest()).toEqual(work.base);
  }finally{work?.tx.rollback();await work?.reader.close();bank?.release();await f.store.close();}
 },15000);

 it('rejects forged sealing authority and keeps a prepared but rolled-back model unpublished',async()=>{
  const f=await fixture('model-paging-seal');let work:Work|undefined;
  try{
   work=await f.begin();work.tx.birth(birth(work.prefix.callback,0));work.tx.beforeCallback('recycled',actor(0));work.tx.detach('recycled',actor(0),work.prefix.callback);
   const value:PickupBatchManifest={version:work.base.version+1,observers:[{...work.plans[0],root:{...work.plans[0].root,count:1,pageCount:1,highWaterId:1}}]};
   const fake={nextManifest:value,outputDescriptors:Object.freeze([]),publishAndPin:async()=>work!.base,abort:async()=>{}};
   expect(()=>work!.stage.seal(fake)).toThrow();const edits=work.stage.drainEdits();expect(edits).toHaveLength(1);
   await work.writer.writePage({observer:'A',page:0,records:[edits[0].pickup]});const ready=await work.writer.seal(value);
   expect(()=>work!.stage.seal({...ready})).toThrow();work.stage.seal(ready);
   work.tx.prepareCommit();work.tx.rollback();await ready.abort();expect(f.source.history.root.count).toBe(0);
   expect(await f.store.readManifest()).toEqual(work.base);
  }finally{work?.tx.rollback();await work?.reader.close();await f.store.close();}
 });

 it('rejects a real prepared root whose issued high water differs from the model append sequence',async()=>{
  const f=await fixture('model-paging-high-water');let work:Work|undefined;
  try{
   work=await f.begin();work.tx.birth(birth(work.prefix.callback,0));work.tx.beforeCallback('recycled',actor(0));work.tx.detach('recycled',actor(0),work.prefix.callback);
   const edits=work.stage.drainEdits();expect(work.writer.allocatePickupId('A')).toBe(2);
   await work.writer.writePage({observer:'A',page:0,records:[edits[0].pickup]});
   const value:PickupBatchManifest={version:work.base.version+1,observers:[{...work.plans[0],root:{...work.plans[0].root,count:1,pageCount:1,highWaterId:2}}]};
   const ready=await work.writer.seal(value);expect(()=>work!.stage.seal(ready)).toThrow(/mismatch/);
   work.tx.rollback();await ready.abort();expect(f.source.history.root.count).toBe(0);expect(await f.store.readManifest()).toEqual(work.base);
  }finally{work?.tx.rollback();await work?.reader.close();await f.store.close();}
 });

 it('rejects a real foreign database writer before opening a model transaction',async()=>{
  const f=await fixture('model-paging-writer-owner'),other=await fixture('model-paging-foreign-writer'),reader=await openOriginalPickupBatchReader(f.store,'reader');
  const prefix={kind:'callback' as const,sceneGeneration:4,callback:1},entry=reader.manifest.observers[0];
  const writer=await other.store.beginBatch(await other.store.readManifest(),[{...entry,prefix,root:{key:'foreign-root',version:1}}]);
  try{
   expect(()=>f.source.stage(reader,writer,prefix)).toThrow();expect(()=>f.models.begin()).toThrow();expect(f.source.history.root.count).toBe(0);
  }finally{await writer.abort();await reader.close();await f.store.close();await other.store.close();}
 });

 it('rejects a real foreign preparation with identical metadata and permits only its own writer preparation',async()=>{
  const f=await fixture('model-paging-handle-owner'),other=await fixture('model-paging-foreign-handle');
  const local=await f.begin(),foreign=await other.begin();let foreignReady:Awaited<ReturnType<typeof rebuild>>|undefined,localReady:Awaited<ReturnType<typeof rebuild>>|undefined;
  try{
   for(const work of [local,foreign]){work.tx.birth(birth(work.prefix.callback,0));work.tx.beforeCallback('recycled',actor(0));work.tx.detach('recycled',actor(0),work.prefix.callback);}
   foreignReady=await rebuild(foreign);const edits=local.stage.drainEdits();await local.writer.writePage({observer:'A',page:0,records:[edits[0].pickup]});
   localReady=await local.writer.seal(foreignReady.nextManifest);
   // Both databases have identical namespace strings/scalars. Only durable
   // issuer ownership distinguishes their actual prepared histories.
   expect(localReady.nextManifest).toEqual(foreignReady.nextManifest);expect(()=>local.stage.seal(foreignReady!)).toThrow();
   local.stage.seal(localReady);const publish=local.tx.prepareCommit();await localReady.publishAndPin('current');publish();
   expect(f.source.history.root.count).toBe(1);expect(other.source.history.root.count).toBe(0);expect((await other.store.readManifest()).version).toBe(0);
  }finally{
   local.tx.rollback();foreign.tx.rollback();if(foreignReady)await foreignReady.abort();else await foreign.writer.abort();
   await local.reader.close();await foreign.reader.close();await f.store.close();await other.store.close();
  }
 });
});
