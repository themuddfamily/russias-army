import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchObserverPlan} from './originalPickupBatchStore';
import {openOriginalPickupBatchReader,type PickupBatchWindow} from './originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelPose,type ReceiverPickup} from '../shared/originalReceiverModelWorld';

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
async function rebuild(work:Work,removeId?:number,firstWindow?:PickupBatchWindow){
 let output:Readonly<ReceiverPickup>[]=[],page=0,count=0,maxBuffer=0;
 const emit=async(record:Readonly<ReceiverPickup>)=>{output.push(record);count++;maxBuffer=Math.max(maxBuffer,output.length);
  if(output.length===16){await work.writer.writePage({observer:'A',page:page++,records:output});output=[];}};
 // Only one old window and one output buffer are resident. Reblock short tail
 // pages before adding new drops; never retain a complete history array.
 for(let p=0;p<work.base.observers[0].root.pageCount;p++){
  const window=p===0&&firstWindow?firstWindow:await work.stage.loadWindow(p);for(const record of work.reader.records(window))if(record.id!==removeId)await emit(record);
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

describe('bounded paged pickup alias counts from actual ModelWorld history mutations',()=>{
 it.each([17,33])('retains %i old actors in one recycled gun alias and removes old-position actors without relocating its current mesh',async count=>{
  const f=await fixture(`model-alias-count-${count}`);let work:Work|undefined;
  try{
   const history=await drops(f,count);expect(f.models.freezeActorRegistry().pickupAliases).toEqual([{handle:history.handle,count}]);
   expect(f.models.freezeActorRegistry().pickups).toEqual([]);expect(f.models.freezeActorRegistry().gunCatalog.length).toBeLessThanOrEqual(8);
   // A rejected private collection must leave published scalar counts intact.
   work=await f.begin();let window=await work.stage.loadWindow(0);expect(work.tx.collectPickup(work.tx.readPickup(1))).toBe(true);
   expect(work.tx.freezeActorRegistry().pickupAliases).toBeUndefined();work.stage.releaseWindow(window);work.tx.rollback();await work.writer.abort();await work.reader.close();work=undefined;
   expect(f.models.freezeActorRegistry().pickupAliases).toEqual([{handle:history.handle,count}]);expect(f.source.history.root.count).toBe(count);
   work=await f.begin();for(let n=0;n<76;n++)work.tx.advanceCorpses();const live=work.tx.birth(birth(work.prefix.callback,9999));work.tx.beforeCallback('recycled',actor(9999));work.tx.afterCallback('recycled',actor(9999));
   expect(live.gunHandle).toBe(history.handle);window=await work.stage.loadWindow(0);const operand=work.tx.readPickup(1),before=work.tx.freezeModels().find(model=>model.handle===history.handle)!;
   expect(operand.pickup).toEqual(history.oldest);expect(operand.pickup!.position.x).toBe(0);expect(before.pose.position.x).not.toBe(operand.pickup!.position.x);
   expect(work.tx.collectPickup(operand)).toBe(true);expect(work.tx.freezeModels().find(model=>model.handle===history.handle)!.pose).toEqual(before.pose);expect(work.tx.freezeModels().find(model=>model.handle===history.handle)!.inWorld).toBe(false);
   const ready=await rebuild(work,1,window),publish=work.tx.prepareCommit();
   // Counts join the final sealed history only after preparation, never the
   // old-root speculative query snapshot.
   expect(work.tx.preparedActorRegistry!().pickupAliases).toEqual([{handle:history.handle,count:count-1}]);
   const current=await ready.publishAndPin('current');publish();await work.reader.close();
   const registry=f.models.freezeActorRegistry();expect(registry.pickupAliases).toEqual([{handle:history.handle,count:count-1}]);expect(registry.pickupHistory!.root.count).toBe(count-1);expect(registry.actors[0].gun).toBe(history.handle);
   expect((await f.store.readPage(current,'A',0))[0].id).toBe(2);await f.store.unpin('current');
  }finally{work?.tx.rollback();await work?.reader.close();await f.store.close();}
 },15000);
});
