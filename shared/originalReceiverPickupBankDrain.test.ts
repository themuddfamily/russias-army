import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverPickupWindowDrain,type ReceiverSceneTransaction} from './originalReceiverModelWorld';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutIntent} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import type {WeaponId} from './protocol';
import {openOriginalPickupBatchStore} from '../src/originalPickupBatchStore';
import {openOriginalPickupBatchReader} from '../src/originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from '../src/originalPickupBatchModelHistory';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const initialPrefix={kind:'callback' as const,sceneGeneration:1,callback:0};
const prefix={kind:'callback' as const,sceneGeneration:1,callback:1};
const counts=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
const owned=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
async function fixture(name:string){
 const initial={version:0,observers:[{observer:'A',lifeGeneration:1,prefix:initialPrefix,lastReceiptTick:0,root:{key:'initial-A',version:0,count:0,pageCount:0,highWaterId:0}}]};
 const store=await openOriginalPickupBatchStore({databaseName:name,factory:new IDBFactory(),initial}),reader=await openOriginalPickupBatchReader(store,'reader');
 const old=reader.manifest.observers[0],plan={...old,prefix,root:{key:'next-A',version:1}},writer=await store.beginBatch(reader.manifest,[plan]);
 const source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root:old.root}),history=source.stage(reader,writer,prefix);
 const pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:inWorld=>inWorld,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};
 const world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:1,sceneGeneration:1,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:4,maxTextChars:1024}},{snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-CPU-provider'})},source);
 const models=world.begin();models.advanceExternalCallback(1);
 const loadoutWorld=new OriginalReceiverLoadoutWorld({prefix:initialPrefix,map:'woodlands',selected:'rifle',owned:owned(),ammo:counts(),reserve:counts(),refillTarget:28,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:4,maxTextChars:256,weaponModelPresent:owned()});
 const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix:initialPrefix,cameraHandle:'camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:handle==='ak47',worldMatrix:I,groupAncestry:['declared-camera']}))};
 const localWorld=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:.02,maxCommands:8,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
 const banks=(owner:ReceiverSceneTransaction|undefined=models,finished=true)=>{
  const loadout=loadoutWorld.begin(owner),local=localWorld.begin(owner);loadout.advanceCallback(prefix);local.beginCallback(prefix,I);if(finished)local.finishPhysicalCallback({x:0,y:0,z:0});return {loadout,local};
 };
 let published=false;const markPublished=()=>{published=true;};
 const close=async()=>{loadoutWorld.release();localWorld.release();models.rollback();history.rollback();if(!published)await writer.abort();await reader.close();await store.close();};
 return {store,reader,writer,history,world,models,plan,loadoutWorld,localWorld,banks,markPublished,close};
}

describe('authenticated private pickup bank accounting drains',()=>{
 it.each([17,33])('preserves %s declared reward mutations through low caps without advancing bank state at drains',async rewardCount=>{
  const f=await fixture(`bank-drain-rewards-${rewardCount}`);
  try{
   const {loadout,local}=f.banks();let intents=0;
   const emit=(intent:ReceiverLoadoutIntent)=>{intents++;if(intent.kind==='whichgun'||intent.kind==='reload-pose')local.applyLoadoutIntent(prefix,intent);};
   for(let window=0;window<rewardCount;window++){
    // These are explicit bank mutations, not a claim of arbitrarily many resident
    // pickup collections, native callbacks, or persisted output spool replay.
    loadout.getGun('rifle',emit);loadout.addScore(5);
    const beforeLoadout=loadout.freeze(),beforeLocal=local.freeze(),token=f.models.preparePickupWindowDrain!();
    loadout.finishPickupWindowDrain(token);local.finishPickupWindowDrain(token);
    expect(loadout.freeze()).toBe(beforeLoadout);expect(local.freeze()).toBe(beforeLocal);
    f.models.finishPickupWindowDrain!(token);
   }
   expect(intents).toBeGreaterThan(rewardCount);expect(loadout.freeze().score).toBe(rewardCount*5);expect(loadout.freeze().goldScore).toBeCloseTo(rewardCount*5/7.2956438);
   expect(loadout.freeze().prefix).toEqual(prefix);expect(local.freeze().prefix).toEqual(prefix);
   expect(f.loadoutWorld.freeze().score).toBe(0);expect(f.localWorld.freeze().prefix).toEqual(initialPrefix);
   const ready=await f.writer.seal({version:1,observers:[{...f.plan,root:{...f.plan.root,count:0,pageCount:0,highWaterId:0}}]});f.history.seal(ready);
   const publishModels=f.models.prepareCommit(),publishLoadout=loadout.prepareCommit(),publishLocal=local.prepareCommit();
   await ready.publishAndPin('published');f.markPublished();publishModels();publishLoadout();publishLocal();
   expect(f.loadoutWorld.freeze().score).toBe(rewardCount*5);expect(f.localWorld.freeze().prefix).toEqual(prefix);expect(f.world.freezeActorRegistry().pickupHistory!.root.version).toBe(1);
  }finally{await f.close();}
 });

 it.each(['loadout','local'] as const)('rejects a copied permit and poisons the %s transaction',async kind=>{
  const f=await fixture(`bank-drain-copy-${kind}`);
  try{
   const banks=f.banks(),token=f.models.preparePickupWindowDrain!(),bank=banks[kind];
   expect(()=>bank.finishPickupWindowDrain({...token})).toThrow(/Unauthenticated/);
   expect(()=>bank.freeze()).toThrow();expect(()=>bank.prepareCommit()).toThrow();banks.loadout.rollback();banks.local.rollback();
  }finally{await f.close();}
 });

 it.each(['loadout','local'] as const)('rejects a consumed model permit and poisons the %s transaction',async kind=>{
  const f=await fixture(`bank-drain-stale-${kind}`);
  try{
   const banks=f.banks(),token=f.models.preparePickupWindowDrain!();f.models.finishPickupWindowDrain!(token);
   expect(()=>banks[kind].finishPickupWindowDrain(token)).toThrow(/Unauthenticated/);expect(()=>banks[kind].freeze()).toThrow();banks.loadout.rollback();banks.local.rollback();
  }finally{await f.close();}
 });

 it.each(['loadout','local'] as const)('consumes a live permit once in each %s bank',async kind=>{
  const f=await fixture(`bank-drain-reused-${kind}`);
  try{
   const banks=f.banks(),token=f.models.preparePickupWindowDrain!();banks[kind].finishPickupWindowDrain(token);
   expect(()=>banks[kind].finishPickupWindowDrain(token)).toThrow(/already consumed/);expect(()=>banks[kind].freeze()).toThrow();banks.loadout.rollback();banks.local.rollback();
  }finally{await f.close();}
 });

 it.each(['loadout','local'] as const)('requires the exact captured model owner in the %s bank',async kind=>{
  const f=await fixture(`bank-drain-owner-${kind}`);
  try{
   const banks=f.banks({...f.models}),token=f.models.preparePickupWindowDrain!();
   expect(()=>banks[kind].finishPickupWindowDrain(token)).toThrow(/Unauthenticated/);expect(()=>banks[kind].freeze()).toThrow();banks.loadout.rollback();banks.local.rollback();
  }finally{await f.close();}
 });

 it.each(['loadout','local'] as const)('does not admit accounting reset in an unconfigured %s transaction',async kind=>{
  const f=await fixture(`bank-drain-unconfigured-${kind}`);
  try{
   // Use direct begin calls so the fixture helper's owner default is omitted.
   const loadout=f.loadoutWorld.begin(),local=f.localWorld.begin();loadout.advanceCallback(prefix);local.beginCallback(prefix,I);local.finishPhysicalCallback({x:0,y:0,z:0});
   const token:ReceiverPickupWindowDrain=f.models.preparePickupWindowDrain!(),bank=kind==='loadout'?loadout:local;
   expect(()=>bank.finishPickupWindowDrain(token)).toThrow();expect(()=>bank.freeze()).toThrow();loadout.rollback();local.rollback();
  }finally{await f.close();}
 });

 it.each(['loadout','local'] as const)('rejects caught %s reentry through the actual history epoch validator',async kind=>{
  const f=await fixture(`bank-drain-epoch-reentry-${kind}`);
  try{
   const banks=f.banks(),token=f.models.preparePickupWindowDrain!(),validate=f.history.validateEpoch.bind(f.history);
   const callout=vi.spyOn(f.history,'validateEpoch').mockImplementation(epoch=>{
    validate(epoch);
    try{
     if(kind==='loadout')banks.loadout.addScore(1);
     else banks.local.applyLoadoutIntent(prefix,{kind:'reload-pose',weapon:'rifle'});
    }catch{/* A caught nested operation must still poison the outer drain. */}
   });
   expect(()=>banks[kind].finishPickupWindowDrain(token)).toThrow();
   expect(()=>banks[kind].freeze()).toThrow();expect(()=>banks[kind].prepareCommit()).toThrow();
   expect(f.loadoutWorld.freeze().score).toBe(0);expect(f.localWorld.freeze().prefix).toEqual(initialPrefix);
   callout.mockRestore();banks.loadout.rollback();banks.local.rollback();
  }finally{await f.close();}
 });

 it('rejects local accounting drain before the physical callback finishes',async()=>{
  const f=await fixture('bank-drain-unfinished-local');
  try{
   const banks=f.banks(f.models,false),token=f.models.preparePickupWindowDrain!();
   expect(()=>banks.local.finishPickupWindowDrain(token)).toThrow(/unavailable/);expect(()=>banks.local.freeze()).toThrow();banks.loadout.rollback();banks.local.rollback();
  }finally{await f.close();}
 });
});
