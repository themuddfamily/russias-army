import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it} from 'vitest';
import {openOriginalPickupBatchStore} from './originalPickupBatchStore';
import {openOriginalPickupBatchReader} from './originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverPickup} from '../shared/originalReceiverModelWorld';
import {OriginalReceiverLoadoutWorld,collectOriginalReceiverAmmoPickup} from '../shared/originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld} from '../shared/originalReceiverLocalWeaponWorld';
import type {ReceiverCurrentLoadoutPublication} from '../shared/originalReceiverCurrentEnvironment';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from '../shared/originalReceiverLocalWeaponInventory';
import {createOriginalWeaponMotion} from '../shared/originalWeaponMotion';
import {ORIGINAL_DROP_AMMO,ORIGINAL_WEAPON_SLOT_ORDER} from '../shared/originalPickupRules';
import type {WeaponId} from '../shared/protocol';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const pose=()=>({position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1});
const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'declared-CPU-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'declared-CPU-gun'}),
 sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>.7,
 nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-query'}})};

describe('actual paged pickup rewards with durable bounded output chunks (declared CPU lifecycle)',()=>{
 it.each([['barrack',17],['barrack',33],['woodlands',17],['woodlands',33]] as const)('%s collects %i historical records through bounded windows',async(map,count)=>{
  const prefix0={kind:'callback' as const,sceneGeneration:4,callback:0};
  const root0={key:'initial',version:0,count:0,pageCount:0,highWaterId:0};
  const store=await openOriginalPickupBatchStore({databaseName:`reward-drain-${map}-${count}`,factory:new IDBFactory(),initial:{version:0,observers:[{observer:'A',lifeGeneration:1,prefix:prefix0,lastReceiptTick:0,root:root0}]}});
  const source=new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root:root0});
  const models=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:8,maxPickups:16,lifecycleJournal:{maxEntries:4,maxTextChars:4096}},
   {snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-CPU-query'})},source);
  const begin=async()=>{
   const reader=await openOriginalPickupBatchReader(store,'reader'),old=reader.manifest.observers[0],prefix={...prefix0,callback:old.prefix.callback+1};
   const plan={...old,prefix,root:{key:`root-${prefix.callback}`,version:old.root.version+1}},writer=await store.beginBatch(reader.manifest,[plan]);
   const stage=source.stage(reader,writer,prefix),tx=models.begin();tx.advanceExternalCallback(prefix.callback);
   return {reader,old,prefix,plan,writer,stage,tx};
  };
  try{
   // Explicit corpse advances are CPU fixture setup, not native scheduling.
   for(let n=0;n<count;n++){
    const w=await begin();try{
     if(n)for(let k=0;k<76;k++)w.tx.advanceCorpses();
     const actor={position:{x:n*100,y:10,z:7},yaw:.2,motionTime:123,weapon:'rpg' as const};
     w.tx.birth({actorId:'recycled',targetFeet:actor.position,targetYaw:.2,callback:w.prefix.callback});
     w.tx.beforeCallback('recycled',actor);w.tx.detach('recycled',actor,w.prefix.callback);
     let buffer:Readonly<ReceiverPickup>[]=[],page=0;
     const append=async(record:Readonly<ReceiverPickup>)=>{buffer.push(record);if(buffer.length===16){await w.writer.writePage({observer:'A',page:page++,records:buffer});buffer=[];}};
     for(let p=0;p<w.old.root.pageCount;p++){
      const window=await w.stage.loadWindow(p);for(const record of w.reader.records(window))await append(record);w.stage.releaseWindow(window);
     }
     for(const edit of w.stage.drainEdits()){expect(edit.kind).toBe('append');await append(edit.pickup);}
     if(buffer.length)await w.writer.writePage({observer:'A',page:page++,records:buffer});
     const ready=await w.writer.seal({version:w.reader.manifest.version+1,observers:[{...w.plan,root:{...w.plan.root,count:n+1,pageCount:page,highWaterId:n+1}}]});w.stage.seal(ready);
     const publish=w.tx.prepareCommit();await ready.publishAndPin('published');publish();await store.unpin('published');
    }finally{w.tx.rollback();await w.reader.close();}
   }
   expect(source.history.root).toMatchObject({count,pageCount:Math.ceil(count/16),highWaterId:count});
   const w=await begin(),present=Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
   const numbers=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
   const loadoutWorld=new OriginalReceiverLoadoutWorld({prefix:w.old.prefix,map,selected:'rpg',owned:present,ammo:numbers(),reserve:numbers(),refillTarget:1,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},
    {maxCommands:4,maxTextChars:256,weaponModelPresent:present});
   const localWorld=new OriginalReceiverLocalWeaponWorld({prefix:w.old.prefix,cameraHandle:'camera',cameraWorldMatrix:I,selectedWeapon:'rpg',loadedRocket:false,motion:createOriginalWeaponMotion({weapon:'rpg',ticker:1,gunPositionSource:{x:5,y:-13,z:-20}}),
    models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource,inWorld:handle==='rpg',worldMatrix:I,groupAncestry:['camera']}))},
    {sourceScale:.02,maxCommands:8,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
   const loadout=loadoutWorld.begin(w.tx),local=localWorld.begin(w.tx);loadout.advanceCallback(w.prefix);local.beginCallback(w.prefix,I);local.finishPhysicalCallback({x:0,y:0,z:0});
   let drained=0,lastOrdinal=0,maxJournal=0,feedback=0,chunks=0;
   const pendingLoadout:ReceiverCurrentLoadoutPublication[]=[];
   const flush=async()=>{
    const token=w.tx.preparePickupWindowDrain!();maxJournal=Math.max(maxJournal,token.transitions.length);
    for(const event of token.transitions){expect(event.ordinal).toBe(++lastOrdinal);expect(event.kind).toBe('pickup-collected');drained++;}
    expect(pendingLoadout.length).toBeLessThanOrEqual(4);
    await w.writer.writeOutputChunk('A',{prefix:token.prefix,sequence:token.sequence,firstOrdinal:token.firstOrdinal,transitions:token.transitions,loadoutIntents:pendingLoadout});
    chunks=token.sequence;
    loadout.finishPickupWindowDrain(token);local.finishPickupWindowDrain(token);w.tx.finishPickupWindowDrain!(token);
    pendingLoadout.length=0;
   };
   try{
    await flush();
    for(let p=0;p<w.old.root.pageCount;p++){
     const window=await w.stage.loadWindow(p);let inBatch=0;
     for(const record of w.reader.records(window)){
      // Explicit operation-time goody at each historical position; this is
      // real collection logic, not native movement/contact timing evidence.
      expect(collectOriginalReceiverAmmoPickup(w.tx,loadout,{pickupId:record.id,goody:{eyePosition:record.position,bspWorld:1}},intent=>{
       if(intent.kind==='whichgun'||intent.kind==='reload-pose')local.applyLoadoutIntent(w.prefix,intent);
       else pendingLoadout.push({prefix:w.prefix,intent});
       if(intent.kind==='feedback')feedback++;
      })).toBe(true);
      expect(w.stage.drainEdits()).toHaveLength(1);
      if(++inBatch===2){await flush();inBatch=0;}
     }
     if(inBatch)await flush();w.stage.releaseWindow(window);
    }
    expect(drained).toBe(count);expect(feedback).toBe(count);expect(maxJournal).toBeLessThanOrEqual(2);
    expect(loadoutWorld.freeze().score).toBe(0);expect(source.history.root.count).toBe(count);
    const ready=await w.writer.seal({version:w.reader.manifest.version+1,observers:[{...w.plan,root:{...w.plan.root,count:0,pageCount:0,highWaterId:count}}]});w.stage.seal(ready);
    expect(ready.outputDescriptors).toHaveLength(1);
    expect(ready.outputDescriptors[0]).toMatchObject({observer:'A',chunkCount:chunks,transitionCount:count});
    expect(w.tx.freezePickupOutputDescriptor!()).toBe(ready.outputDescriptors[0]);
    const publishModel=w.tx.prepareCommit(),publishLoadout=loadout.prepareCommit(),publishLocal=local.prepareCommit();
    const snapshot=await ready.publishAndPin('published');publishModel();publishLoadout();publishLocal();
    expect(source.history.root.count).toBe(0);expect(loadoutWorld.freeze().score).toBe(count*5);
    expect(loadoutWorld.freeze().ammo.rpg+loadoutWorld.freeze().reserve.rpg).toBe(count*ORIGINAL_DROP_AMMO.rpg);
    expect(loadoutWorld.freeze().prefix).toEqual(w.prefix);expect(localWorld.freeze().prefix).toEqual(w.prefix);
    store.assertOutputDescriptor(snapshot,ready.outputDescriptors[0]);
    let committedModels=0,committedFeedback=0;
    // Each read and durable claim retains one chunk only. No full output
    // journal or feedback history is accumulated by this consumer.
    for(let sequence=1;sequence<=chunks;sequence++){
     const events=await store.claimOutputChunk(snapshot,'A','models',sequence);
     for(const event of events.transitions){expect(event.ordinal).toBe(++committedModels);expect(event.kind).toBe('pickup-collected');}
     const outputs=await store.claimOutputChunk(snapshot,'A','loadout',sequence);
     for(const output of outputs.loadoutIntents)if(output.intent.kind==='feedback')committedFeedback++;
    }
    expect(committedModels).toBe(count);expect(committedFeedback).toBe(count);
    await expect(store.claimOutputChunk(snapshot,'A','loadout',chunks)).rejects.toThrow();
    expect(loadoutWorld.freeze().score).toBe(count*5);await store.unpin('published');
   }finally{loadout.rollback();local.rollback();w.tx.rollback();await w.reader.close();loadoutWorld.release();localWorld.release();}
  }finally{await store.close();}
 },15000);
});
