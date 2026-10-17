import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {openOriginalPickupBatchStore,type PickupBatchManifest,type PickupBatchObserverPlan} from './originalPickupBatchStore';
import {openOriginalPickupBatchReader} from './originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverPickup} from '../shared/originalReceiverModelWorld';
import {OriginalRemoteView,type OriginalRemoteViewSnapshot} from '../shared/originalRemoteView';
import type {ReceiverScenePrefix} from '../shared/originalReceiverPrefix';

const initial=():PickupBatchManifest=>({version:0,observers:[{observer:'A',lifeGeneration:1,prefix:{kind:'callback',sceneGeneration:4,callback:0},lastReceiptTick:-1,
 root:{key:'initial-A',version:0,count:0,pageCount:0,highWaterId:0}}]});
const pose=()=>({position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1});
const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'declared-CPU-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'declared-CPU-gun'}),
 sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>({...gi.pose,position:{...gi.pose.position,x:gi.pose.position.x+3}}),
 reparentGunMembership:()=>true,dropYaw:()=>.7,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};
const target=()=>({id:'remote',alive:true,position:{x:0,y:10,z:7},yaw:0,motionTime:1000,weapon:'rpg' as const});
async function fixture(name:string){
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial:initial()}),base=await store.readManifest();
 const source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root:base.observers[0].root});
 const models=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:16,maxTextChars:4096}},
  {snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-external-query'})},source);
 const view=new OriginalRemoteView(0,{},'source-callback',models,true);
 let tick=0;
 const deliver=async(kind:'where'|'death',inspectResident=false)=>{
  const reader=await openOriginalPickupBatchReader(store,'old'),old=reader.manifest.observers[0],callback=old.prefix.callback+(kind==='where'?1:0);
  const receiptPrefix={kind:'receipt' as const,sceneGeneration:4,callback:old.prefix.callback,tick};
  const prefix:ReceiverScenePrefix=kind==='where'?{kind:'callback',sceneGeneration:4,callback}:receiptPrefix;
  const plan:PickupBatchObserverPlan={observer:'A',lifeGeneration:1,prefix,lastReceiptTick:tick,root:{key:`clock-${tick}`,version:old.root.version+1},...(kind==='where'?{receiptPrefix}:{})};
  const writer=await store.beginBatch(reader.manifest,[plan]),stage=source.stage(reader,writer,prefix);
  let prepared:Awaited<ReturnType<typeof writer.seal>>|undefined,delivery:Awaited<ReturnType<typeof view.prepareAsynchronousDelivery>>|undefined;
  let publicationAttempted=false;
  const now=callback*1000/30,snapshot:OriginalRemoteViewSnapshot={tick,sentAt:now,targets:kind==='where'?[target()]:[],...(kind==='death'?{deathPlayerId:'remote'}:{})};
  try{
   const before=view.freeze(),history=source.history;
   delivery=await view.prepareAsynchronousDelivery(snapshot,{receiptCallbacks:old.prefix.callback,callbacks:callback},now,async scene=>{
    let buffer:Readonly<ReceiverPickup>[]=[],page=0,count=0;
    const emit=async(row:Readonly<ReceiverPickup>)=>{buffer.push(row);count++;if(buffer.length===16){await writer.writePage({observer:'A',page:page++,records:buffer});buffer=[];}};
    for(let index=0;index<old.root.pageCount;index++){
     const window=await stage.loadWindow(index);
     for(const row of reader.records(window)){if(inspectResident)expect(scene.readPickup(row.id).pickup).toEqual(row);await emit(row);}
     stage.releaseWindow(window);
    }
    const edits=stage.drainEdits();expect(edits.every(edit=>edit.kind==='append')).toBe(true);
    for(const edit of edits)await emit(edit.pickup);
    if(buffer.length)await writer.writePage({observer:'A',page:page++,records:buffer});
    const highWaterId=edits.at(-1)?.pickup.id??old.root.highWaterId;
    prepared=await writer.seal({version:reader.manifest.version+1,observers:[{...plan,root:{...plan.root,count,pageCount:page,highWaterId}}]});stage.seal(prepared);
   });
   if(!delivery.ok)throw Error('Declared CPU delivery rejected');
   expect(view.freeze()).toEqual(before);expect(source.history).toBe(history);expect(await store.readManifest()).toEqual(reader.manifest);
   publicationAttempted=true;await prepared!.publishAndPin('current');delivery.commit();tick++;
   const committed=await store.readManifest(),entry=committed.observers[0];
   expect(entry.lastReceiptTick).toBe(tick-1);expect(entry.prefix).toEqual(prefix);expect(source.history.root).toEqual(entry.root);
   expect(models.freezeActorRegistry().prefix).toEqual(prefix);expect(delivery.result.modelState!.pickupHistory!.root).toEqual(entry.root);
   expect(view.recordSent({...snapshot,targets:[]})).toEqual({ok:false,reason:'invalid_sent_order'});expect(view.debugState().callbacks).toBe(callback);
   await store.unpin('current');return entry;
  }finally{if(delivery?.ok)delivery.rollback();stage.rollback();try{if(!publicationAttempted){if(prepared)await prepared.abort();else await writer.abort();}}finally{await reader.close();}}
 };
 return {store,source,models,view,deliver};
}

describe('exact receipt clocks through real ModelWorld and private RemoteView replay (declared CPU geometry)',()=>{
 it('commits a death receipt before first where, then consecutive received callbacks with exact durable watermarks',async()=>{
  const f=await fixture('model-clock-initial-death');try{
   expect((await f.store.readManifest()).observers[0].lastReceiptTick).toBe(-1);
   const death=await f.deliver('death');expect(death.prefix).toEqual({kind:'receipt',sceneGeneration:4,callback:0,tick:0});expect(f.view.freeze()).toEqual([]);
   const first=await f.deliver('where');expect(first.prefix.callback).toBe(1);expect(first.lastReceiptTick).toBe(1);
   const next=await f.deliver('where');expect(next.prefix.callback).toBe(2);expect(next.lastReceiptTick).toBe(2);expect(f.view.freeze()).toHaveLength(1);
  }finally{await f.store.close();}
 });
 it('receives where, where, death, where and persists the actual following-callback drop with its receipt clock',async()=>{
  const f=await fixture('model-clock-death-where');try{
   await f.deliver('where');await f.deliver('where');const death=await f.deliver('death');
   expect(death.prefix).toEqual({kind:'receipt',sceneGeneration:4,callback:2,tick:2});expect(death.root.count).toBe(0);expect(f.view.freeze()[0].alive).toBe(false);
   // The next where contains the same id; its dead actor remains pending until
   // the next callback, which performs the actual ModelWorld detach/append.
   const drop=await f.deliver('where');expect(drop.lastReceiptTick).toBe(3);expect(drop.root).toMatchObject({count:1,pageCount:1,highWaterId:1});
   expect(f.view.freeze()).toEqual([]);expect(f.models.freezeActorRegistry().actors).toEqual([]);
   const receipt=await f.deliver('death',true);expect(receipt.lastReceiptTick).toBe(4);expect(receipt.root.count).toBe(1);
  }finally{await f.store.close();}
 });
 it('rejects a stage at a valid old-root prefix not present in its authentic writer plan',async()=>{
  const f=await fixture('model-clock-writer-prefix');const reader=await openOriginalPickupBatchReader(f.store,'binding');
  const receiptPrefix={kind:'receipt' as const,sceneGeneration:4,callback:0,tick:0},prefix={kind:'callback' as const,sceneGeneration:4,callback:1};
  const writer=await f.store.beginBatch(reader.manifest,[{observer:'A',lifeGeneration:1,prefix,lastReceiptTick:0,receiptPrefix,root:{key:'binding-next',version:1}}]);
  try{
   expect(()=>f.source.stage(reader,writer,receiptPrefix)).toThrow(/plan/);
   const accepted=f.source.stage(reader,writer,prefix);accepted.rollback();expect(f.source.history.root.version).toBe(0);
  }finally{await writer.abort();await reader.close();await f.store.close();}
 });
});
