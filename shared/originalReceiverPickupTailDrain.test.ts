import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {OriginalReceiverModelWorld,assertReceiverPickupOutputDrain,assertReceiverPickupWindowDrain,type ReceiverModelBackend,type ReceiverPickupWindowDrain} from './originalReceiverModelWorld';
import {OriginalReceiverLoadoutWorld} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import type {WeaponId} from './protocol';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import {openOriginalPickupBatchStore,type PickupBatchPrepared} from '../src/originalPickupBatchStore';
import {openOriginalPickupBatchReader} from '../src/originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from '../src/originalPickupBatchModelHistory';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const prefix0={kind:'callback' as const,sceneGeneration:1,callback:0};
const counts=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
const owned=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
const pose=()=>({position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1});
const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'declared-CPU-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'declared-CPU-gun'}),
 sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>.7,
 nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};
async function fixture(name:string,kind:'receipt'|'callback'='receipt'){
 const root={key:'initial-A',version:0,count:0,pageCount:0,highWaterId:0},prefix:ReceiverScenePrefix=kind==='receipt'?{...prefix0,kind,tick:1}:{...prefix0,callback:1};
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial:{version:0,observers:[{observer:'A',lifeGeneration:1,prefix:prefix0,lastReceiptTick:0,root}]}});
 const reader=await openOriginalPickupBatchReader(store,'reader'),old=reader.manifest.observers[0],plan={...old,prefix,lastReceiptTick:kind==='receipt'?1:0,root:{key:'next-A',version:1}};
 const writer=await store.beginBatch(reader.manifest,[plan]),source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root}),stage=source.stage(reader,writer,prefix);
 const world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:1,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:8,maxTextChars:4096}},
  {snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-CPU-query'})},source),models=world.begin();
 if(prefix.kind==='receipt')models.applyExternalReceipt(prefix.tick,prefix.callback);else models.advanceExternalCallback(prefix.callback);
 const loadoutWorld=new OriginalReceiverLoadoutWorld({prefix:prefix0,map:'woodlands',selected:'rifle',owned:owned(),ammo:counts(),reserve:counts(),refillTarget:28,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:4,maxTextChars:256,weaponModelPresent:owned()});
 const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix:prefix0,cameraHandle:'camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:handle==='ak47',worldMatrix:I,groupAncestry:['declared-camera']}))};
 const localWorld=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:.02,maxCommands:8,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})}),loadout=loadoutWorld.begin(models),local=localWorld.begin(models);
 if(prefix.kind==='receipt'){loadout.applyReceipt(prefix);local.applyReceipt(prefix);}else{loadout.advanceCallback(prefix);local.beginCallback(prefix,I);local.finishPhysicalCallback({x:0,y:0,z:0});}
 const birth=(id='actor')=>models.birth({actorId:id,targetFeet:{x:0,y:10,z:7},targetYaw:.2,callback:prefix.callback});
 let ready:PickupBatchPrepared|undefined;
 const seal=async()=>{
  const edits=stage.drainEdits(),rows=edits.filter(e=>e.kind==='append').map(e=>e.pickup);if(rows.length)await writer.writePage({observer:'A',page:0,records:rows});
  ready=await writer.seal({version:1,observers:[{...plan,root:{...plan.root,count:rows.length,pageCount:rows.length?1:0,highWaterId:rows.at(-1)?.id??0}}]});stage.seal(ready);return ready;
 };
 const close=async()=>{loadout.rollback();local.rollback();models.rollback();await reader.close();await store.close();};
 return {store,reader,writer,source,stage,world,models,prefix,birth,loadoutWorld,localWorld,loadout,local,seal,close};
}

describe('authenticated receipt and callback pickup output tails (declared CPU lifecycle)',()=>{
 it('persists receipt-only detach output, acknowledges all three banks and adopts after real root CAS',async()=>{
  const f=await fixture('pickup-tail-receipt-publish');try{
   f.birth();f.models.detach('actor',{position:{x:0,y:10,z:7},yaw:.2,motionTime:123,weapon:'rpg'},0);f.loadout.addScore(5);
   expect(()=>f.models.preparePickupWindowDrain!()).toThrow(/unavailable/);
   const token=f.models.preparePickupOutputTailDrain!(),beforeLoadout=f.loadout.freeze(),beforeLocal=f.local.freeze();
   expect(token.prefix).toEqual(f.prefix);expect(token.transitions.map(t=>t.kind)).toEqual(['birth','detach']);
   expect(token.transitions.every(t=>t.prefix.kind==='receipt'&&t.prefix.tick===1)).toBe(true);
   assertReceiverPickupOutputDrain(token,f.models,f.prefix);
   expect(()=>assertReceiverPickupWindowDrain(token as ReceiverPickupWindowDrain,f.models,f.prefix)).toThrow(/callback/);
   await f.writer.writeOutputChunk('A',{...token,loadoutIntents:[{prefix:f.prefix,intent:{kind:'feedback',message:'declared receipt feedback'}}]});
   f.loadout.finishPickupWindowDrain(token);f.local.finishPickupWindowDrain(token);
   expect(f.loadout.freeze()).toBe(beforeLoadout);expect(f.local.freeze()).toBe(beforeLocal);f.models.finishPickupWindowDrain!(token);
   expect(()=>f.models.freezeModelTransitions!()).toThrow(/streamed/);const ready=await f.seal(),descriptor=f.models.freezePickupOutputDescriptor!();
   expect(descriptor).toBe(ready.outputDescriptors[0]);expect(descriptor).toMatchObject({prefix:f.prefix,chunkCount:1,transitionCount:2,loadoutCount:1});
   const publishModels=f.models.prepareCommit(),publishLoadout=f.loadout.prepareCommit(),publishLocal=f.local.prepareCommit();
   const snapshot=await ready.publishAndPin('published');expect(f.source.history.root.key).toBe('initial-A');expect(f.loadoutWorld.freeze().score).toBe(0);
   publishModels();publishLoadout();publishLocal();expect(f.source.history.root.count).toBe(1);expect(f.loadoutWorld.freeze().score).toBe(5);expect(f.localWorld.freeze().prefix).toEqual(f.prefix);
   f.store.assertOutputDescriptor(snapshot,descriptor!);const chunk=await f.store.claimOutputChunk(snapshot,'A','models',1);expect(chunk.transitions.map(t=>t.kind)).toEqual(['birth','detach']);
   expect((await f.store.claimOutputChunk(snapshot,'A','loadout',1)).loadoutIntents[0].intent).toEqual({kind:'feedback',message:'declared receipt feedback'});
   await f.store.unpin('published');
  }finally{await f.close();}
 });
 it('shares sequence and ordinals between callback windows and callback tails',async()=>{
  const f=await fixture('pickup-tail-callback','callback');try{
   f.birth();const first=f.models.preparePickupWindowDrain!();assertReceiverPickupWindowDrain(first,f.models,f.prefix);
   await f.writer.writeOutputChunk('A',{...first,loadoutIntents:[]});f.loadout.finishPickupWindowDrain(first);f.local.finishPickupWindowDrain(first);f.models.finishPickupWindowDrain!(first);
   const tail=f.models.preparePickupOutputTailDrain!();expect(tail).toMatchObject({prefix:f.prefix,sequence:2,firstOrdinal:2,transitions:[]});
   assertReceiverPickupWindowDrain(tail as ReceiverPickupWindowDrain,f.models,f.prefix);await f.writer.writeOutputChunk('A',{...tail,loadoutIntents:[]});
   f.loadout.finishPickupWindowDrain(tail);f.local.finishPickupWindowDrain(tail);f.models.finishPickupWindowDrain!(tail);const ready=await f.seal();
   expect(f.models.freezePickupOutputDescriptor!()).toBe(ready.outputDescriptors[0]);expect(ready.outputDescriptors[0]).toMatchObject({chunkCount:2,transitionCount:1});
  }finally{await f.close();}
 });
 it('fences a second tail and preparation until the first permit is acknowledged',async()=>{
  const f=await fixture('pickup-tail-outstanding');try{
   const token=f.models.preparePickupOutputTailDrain!();expect(()=>f.models.preparePickupOutputTailDrain!()).toThrow(/unavailable/);expect(()=>f.models.preparePickupWindowDrain!()).toThrow(/unavailable/);
   expect(()=>f.models.prepareCommit()).toThrow(/drain pending/);f.loadout.finishPickupWindowDrain(token);f.local.finishPickupWindowDrain(token);f.models.finishPickupWindowDrain!(token);
   expect(()=>assertReceiverPickupOutputDrain(token,f.models,f.prefix)).toThrow(/Unauthenticated/);expect(f.models.preparePickupOutputTailDrain!().sequence).toBe(2);
  }finally{await f.close();}
 });
 it.each(['loadout','local'] as const)('rejects a forged receipt permit in the %s bank',async kind=>{
  const f=await fixture(`pickup-tail-forged-${kind}`);try{
   const token=f.models.preparePickupOutputTailDrain!();expect(()=>f[kind].finishPickupWindowDrain({...token})).toThrow(/Unauthenticated/);expect(()=>f[kind].freeze()).toThrow();
  }finally{await f.close();}
 });
 it.each(['loadout','local'] as const)('rejects a consumed receipt permit in the %s bank',async kind=>{
  const f=await fixture(`pickup-tail-consumed-${kind}`);try{
   const token=f.models.preparePickupOutputTailDrain!();f.models.finishPickupWindowDrain!(token);expect(()=>f[kind].finishPickupWindowDrain(token)).toThrow(/Unauthenticated/);
  }finally{await f.close();}
 });
 it('rejects changed receipt journals and rolled-back permits',async()=>{
  const f=await fixture('pickup-tail-changed');try{
   const token=f.models.preparePickupOutputTailDrain!();f.birth();expect(()=>f.models.finishPickupWindowDrain!(token)).toThrow(/changed/);expect(()=>f.models.prepareCommit()).toThrow();
  }finally{await f.close();}
  const other=await fixture('pickup-tail-rollback');try{
   const token=other.models.preparePickupOutputTailDrain!();other.models.rollback();expect(()=>assertReceiverPickupOutputDrain(token,other.models,other.prefix)).toThrow(/closed/);
  }finally{await other.close();}
 });
 it('invalidates a receipt tail when its actual resident page epoch is released',async()=>{
  const f=await fixture('pickup-tail-resident-epoch');try{
   f.birth();f.models.detach('actor',{position:{x:0,y:10,z:7},yaw:.2,motionTime:123,weapon:'rpg'},0);
   const token=f.models.preparePickupOutputTailDrain!();await f.writer.writeOutputChunk('A',{...token,loadoutIntents:[]});
   f.loadout.finishPickupWindowDrain(token);f.local.finishPickupWindowDrain(token);f.models.finishPickupWindowDrain!(token);
   const ready=await f.seal(),publish=f.models.prepareCommit();await ready.publishAndPin('published');publish();await f.reader.close();await f.store.unpin('published');
   const reader=await openOriginalPickupBatchReader(f.store,'next-reader'),old=reader.manifest.observers[0],prefix={kind:'receipt' as const,sceneGeneration:1,callback:0,tick:2};
   const writer=await f.store.beginBatch(reader.manifest,[{...old,prefix,lastReceiptTick:2,root:{key:'third-A',version:2}}]),stage=f.source.stage(reader,writer,prefix),models=f.world.begin();
   try{
    models.applyExternalReceipt(2,0);const window=await stage.loadWindow(0);expect(models.readPickup(1).pickup!.id).toBe(1);
    const tail=models.preparePickupOutputTailDrain!();stage.releaseWindow(window);expect(()=>assertReceiverPickupOutputDrain(tail,models,prefix)).toThrow(/Stale/);
    expect(()=>models.finishPickupWindowDrain!(tail)).toThrow();expect(()=>models.freezeModels()).toThrow();
   }finally{models.rollback();await writer.abort();await reader.close();}
  }finally{await f.close();}
 });
 it('rejects inline and metadata-only tail admission',async()=>{
  const inline=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:1,maxModels:8,maxPickups:16}),tx=inline.begin();
  tx.applyExternalReceipt(1,0);expect(()=>tx.preparePickupOutputTailDrain!()).toThrow(/unavailable/);tx.rollback();
  const f=await fixture('pickup-tail-metadata');try{
   f.models.rollback();const metadata=f.world.begin(true);try{expect(()=>metadata.preparePickupOutputTailDrain!()).toThrow(/unavailable/);}finally{metadata.rollback();}
  }finally{await f.close();}
 });
});
