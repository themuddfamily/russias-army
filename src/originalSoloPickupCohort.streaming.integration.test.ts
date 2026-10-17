import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from '../shared/originalReceiverLocalWeaponInventory';
import {OriginalReceiverLoadoutWorld} from '../shared/originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {ORIGINAL_DROP_AMMO,ORIGINAL_WEAPON_SLOT_ORDER} from '../shared/originalPickupRules';
import type {WeaponId} from '../shared/protocol';
import {OriginalSoloPickupCohort} from './originalSoloPickupCohort';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from '../shared/originalSoloObserverWorld';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from '../shared/originalSoloCurrentSceneProducer';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalPlayerBody,originalPlayerEye} from '../shared/originalPlayerPhysics';
import type {ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import {openOriginalPickupBatchStore,type PickupBatchManifest} from './originalPickupBatchStore';
import {openOriginalPickupBatchReader} from './originalPickupBatchWindow';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';

const decoded=new Map<string,OriginalMapRuntime>();
function mapRuntime(map:'woodlands'|'barrack'){let value=decoded.get(map);if(!value){value=registerOriginalMapRuntime(map,JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='woodlands'?'woodland':'barrack'}/scene.json`,import.meta.url),'utf8')));decoded.set(map,value);}return value;}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const initial=():PickupBatchManifest=>({version:0,observers:['A','B'].map(observer=>({observer,lifeGeneration:1,
 prefix:{kind:'callback',sceneGeneration:1,callback:0},lastReceiptTick:-1,root:{key:`initial-${observer}`,version:0,count:0,pageCount:0,highWaterId:0}}))});

/** CPU producer and transport fixture. Real storage/model ownership; no Game,
 * native timing, Game wiring, or unrestricted output-capacity claim. */
async function fixture(name:string,map:'woodlands'|'barrack'='woodlands',onEvent?:(event:OriginalSoloEvent)=>void){
 const runtime=()=>mapRuntime(map);
 const factory=new IDBFactory(),store=await openOriginalPickupBatchStore({databaseName:name,factory,initial:initial()});
 const sources=new Map((await store.readManifest()).observers.map(row=>[row.observer,new OriginalPickupBatchModelHistory({observer:row.observer,lifeGeneration:row.lifeGeneration,root:row.root})]));
 const events:OriginalSoloEvent[]=[],counts={backends:0,releases:0};
 let activeCohort:OriginalSoloPickupCohort|undefined;
 const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 const zero=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
 const owned=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
 const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const options=(source:OriginalPickupBatchModelHistory):OriginalSoloCurrentSceneProducerOptions=>({sourceScale:runtime().scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,
  environment:{maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536},
  controller:{model:{eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:50*runtime().scale,maxModels:128,maxPickups:16,lifecycleJournal:{maxEntries:4,maxTextChars:65536}},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},
  createBackends:c=>{counts.backends++;const selected=c.weapon!,prefix={kind:'callback' as const,sceneGeneration:c.lifeGeneration,callback:0};
  const loadoutWorld=new OriginalReceiverLoadoutWorld({prefix,map,selected,owned:owned(),ammo:{...zero(),[selected]:2},reserve:zero(),refillTarget:selected==='pistol'?8:28,counter:{waitgun:7,poldwaitgun:3},score:0,goldScore:0},{maxCommands:4,maxTextChars:8192,weaponModelPresent:owned()});
  const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix,cameraHandle:`camera:${c.id}`,cameraWorldMatrix:I,selectedWeapon:selected,loadedRocket:false,motion:{weapon:selected,ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:handle===(selected==='pistol'?'pistol':'ak47'),worldMatrix:I,groupAncestry:['declared-local']}))};
  const localWeaponWorld=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:runtime().scale,maxCommands:8,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
  return {pickupHistorySource:source,loadoutWorld,localWeaponWorld,pickupContinuationAt:(callback,collect,flush)=>{if(!activeCohort)throw Error('Missing active fixture cohort');return activeCohort.pickupContinuationAt(c.id)(callback,collect,flush);},
   model:{cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:inWorld=>inWorld,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})},
   transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},release:()=>{counts.releases++;}};},
  captureLocalWeaponCallback:()=>({cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0},commands:[]}),
  captureLoadoutProgram:(_c,prefixes)=>({receiptCommands:[],...(prefixes.callback?{callbackCommands:[]}:{})}),
  goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:50*runtime().scale,weapon:c.weapon!}:null,
  snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-producer-inventory'}),
 });
 const worlds=new OriginalSoloObserverWorlds(runtime(),{presentationLifecycle:true,onEvent:event=>{if(event.kind==='loadout-output'||event.kind==='model-transitions'||event.kind==='model-state'||event.kind==='loadout-state'||event.kind==='fade-born')events.push(event);onEvent?.(event);},createReceiverScene:r=>createOriginalSoloCurrentSceneLease(options(sources.get(r.id)!))});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(callback:number)=>{const time=callback/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 let serial=0;
 const cohort=()=>activeCohort=new OriginalSoloPickupCohort({store,sources,key:`cohort-${++serial}`,streamOutputs:true});
 const close=async()=>{await worlds.clearAsync();await store.close();};
 return {store,sources,worlds,a,b,physical,cohort,close,events};
}

type Fixture=Awaited<ReturnType<typeof fixture>>;
async function cycle(f:Fixture,callback:number,death=false){
 const prepare=f.a.mirror.prepareAsynchronousDelivery.bind(f.a.mirror);
 const spy=death?vi.spyOn(f.a.mirror,'prepareAsynchronousDelivery').mockImplementationOnce((snapshot,order,now,finalize,signal)=>prepare({...snapshot,targets:[],deathPlayerId:'B'},order,now,finalize,signal)):undefined;
 try{await f.worlds.completeGoodyAsync(f.physical(callback),f.cohort());f.worlds.actors(callback/30);}finally{spy?.mockRestore();}
 f.events.length=0;
}
async function pickupEye(f:Fixture,callback:number){
 const reader=await openOriginalPickupBatchReader(f.store,'single-record-inspection');
 try{const window=await reader.loadWindow('A',0,{kind:'callback',sceneGeneration:1,callback});return {...reader.readPickup(window,1)!.position};}finally{await reader.close();}
}

describe('actual Solo CURRENT and production cohort streamed publication (declared CPU)',()=>{
 it.each([['woodlands',17],['woodlands',33],['barrack',17],['barrack',33]] as const)('%s collects %i old records without raising command or journal caps',async(map,count)=>{
  const f=await fixture(`solo-streamed-${map}-${count}`,map);try{
   for(let n=0;n<count;n++){await cycle(f,2*n+1);await cycle(f,2*n+2,true);}
   const callback=2*count+1,old=f.a.modelState!.pickupHistory!.root;
   expect(old).toMatchObject({count,pageCount:Math.ceil(count/16),highWaterId:count});
   const eye=await pickupEye(f,callback);f.a.body.position={...createOriginalPlayerBody('A',eye).position};
   const score=f.a.loadout!.score,ammo=f.a.loadout!.ammo.pistol+f.a.loadout!.reserve.pistol,c=f.cohort();
   const claim=c.claimPickupOutput.bind(c),finish=c.finish.bind(c);let claims=0,finished=false,maxTransitions=0,maxIntents=0;
   let firstClaim:Parameters<typeof claim>|undefined;
   const claimSpy=vi.spyOn(c,'claimPickupOutput').mockImplementation(async(...args)=>{
    expect(finished).toBe(false);expect(f.worlds.currentAwaiting).toBe(true);
    const output=await claim(...args);firstClaim??=args;claims++;maxTransitions=Math.max(maxTransitions,output.transitions.length);maxIntents=Math.max(maxIntents,output.loadoutIntents.length);return output;
   });
   vi.spyOn(c,'finish').mockImplementation(async()=>{expect(claims).toBeGreaterThan(3);await expect(claim(...firstClaim!)).rejects.toThrow(/replay/);finished=true;await finish();});
   await f.worlds.completeGoodyAsync(f.physical(callback),c);claimSpy.mockRestore();
   expect(finished).toBe(true);expect(maxTransitions).toBeLessThanOrEqual(4);expect(maxIntents).toBeLessThanOrEqual(4);
   expect(f.a.loadout!.score).toBe(score+5*count);expect(f.a.loadout!.ammo.pistol+f.a.loadout!.reserve.pistol).toBe(ammo+ORIGINAL_DROP_AMMO.pistol*count);
   expect(f.a.modelState!.pickupHistory!.root).toMatchObject({count:0,pageCount:0,highWaterId:count});
   let collected=0,lastOrdinal=0;const order:string[]=[];
   for(const event of f.events)if(event.recipientId==='A'){
    order.push(event.kind);
    if(event.kind==='model-transitions')for(const transition of event.transitions){expect(transition.ordinal).toBe(++lastOrdinal);if(transition.kind==='pickup-collected')collected++;}
   }
   expect(collected).toBe(count);expect(order.indexOf('model-state')).toBeLessThan(order.indexOf('model-transitions'));
   expect(order.indexOf('model-transitions')).toBeLessThan(order.indexOf('loadout-state'));expect(order.indexOf('loadout-state')).toBeLessThan(order.indexOf('loadout-output'));
   expect(f.worlds.currentAwaiting).toBe(false);
  }finally{await f.close();}
 });
 it('records receipt-only death and streams its detach on the following callback',async()=>{
  const f=await fixture('solo-streamed-receipt-death');try{
   await cycle(f,1);const c=f.cohort(),finish=c.finish.bind(c);let detach=0;
   const claim=c.claimPickupOutput.bind(c);vi.spyOn(c,'claimPickupOutput').mockImplementation(async(...args)=>{
    const output=await claim(...args);expect(output.prefix.kind).toBe('receipt');if(args[2]==='models')detach+=output.transitions.filter(row=>row.kind==='detach').length;return output;
   });
   vi.spyOn(c,'finish').mockImplementation(async()=>{expect(detach).toBe(0);await finish();});
   await f.worlds.disposeAsync('B',c);expect(f.worlds.worlds.has('B')).toBe(false);expect(f.a.callback).toBe(1);
   expect(f.a.modelState!.pickupHistory!.root.count).toBe(0);expect(f.a.receiptTick).toBe(2);
   const next=f.cohort(),nextClaim=next.claimPickupOutput.bind(next);let callbackDetach=0;
   vi.spyOn(next,'claimPickupOutput').mockImplementation(async(...args)=>{
    const output=await nextClaim(...args);expect(output.prefix).toEqual({kind:'callback',sceneGeneration:1,callback:2});
    if(args[2]==='models')callbackDetach+=output.transitions.filter(row=>row.kind==='detach').length;return output;
   });
   await f.worlds.completeGoodyAsync(f.physical(2),next);
   expect(f.a.modelState!.pickupHistory!.root.count).toBe(1);expect(callbackDetach).toBe(1);
  }finally{await f.close();}
 });
 it('captures the issued retry hook before publication and ignores a later replacement',async()=>{
  const f=await fixture('solo-streamed-captured-retry');try{
   await cycle(f,1);const c=f.cohort(),claim=f.store.claimOutputChunk.bind(f.store);let failed=false;
   const spy=vi.spyOn(f.store,'claimOutputChunk').mockImplementation(async(...args)=>{
    if(!failed&&args[1]==='A'&&args[2]==='models'){failed=true;throw Error('declared captured claim read');}
    return claim(...args);
   });
   await expect(f.worlds.completeGoodyAsync(f.physical(2),c)).rejects.toThrow(/read pending/);
   const replacement=vi.spyOn(c,'retryPickupOutput').mockRejectedValue(Error('foreign replacement retry hook'));
   await f.worlds.cancelAndDrainCurrent();expect(replacement).not.toHaveBeenCalled();expect(f.a.callback).toBe(2);expect(f.worlds.currentAwaiting).toBe(false);
   replacement.mockRestore();spy.mockRestore();f.worlds.actors(2/30);
  }finally{await f.close();}
 });
 it.each(['drain','clear'] as const)('retains a committed disposal read until explicit %s finishes its output and releases the retired scene',async mode=>{
  const f=await fixture(`solo-streamed-disposal-read-${mode}`);try{
   await cycle(f,1);const c=f.cohort(),claim=f.store.claimOutputChunk.bind(f.store);
   const release=vi.spyOn(f.worlds as any,'releaseReceiverScene');let failed=false,consumed=0;
   const spy=vi.spyOn(f.store,'claimOutputChunk').mockImplementation(async(...args)=>{
    if(args[1]==='A'&&args[2]==='models'&&args[3]===1){if(!failed){failed=true;throw Error('declared disposal read unavailable');}consumed++;}
    return claim(...args);
   });
   await expect(f.worlds.disposeAsync('B',c)).rejects.toThrow(/read pending/);
   expect(f.worlds.worlds.has('B')).toBe(false);expect(f.a.callback).toBe(1);expect(f.a.receiptTick).toBe(2);
   expect(f.worlds.currentAwaiting).toBe(true);expect(release).not.toHaveBeenCalled();expect(consumed).toBe(0);
   const version=(await f.store.readManifest()).version;
   if(mode==='clear')await f.worlds.clearAsync();else await f.worlds.cancelAndDrainCurrent();
   expect(consumed).toBe(1);expect(f.worlds.currentAwaiting).toBe(false);expect((await f.store.readManifest()).version).toBe(version);
   expect(release.mock.calls.filter(([world])=>world===f.b)).toHaveLength(1);
   if(mode==='clear')expect(f.worlds.worlds.size).toBe(0);
   else{expect(f.worlds.worlds.has('A')).toBe(true);await cycle(f,2);expect(f.a.modelState!.pickupHistory!.root.count).toBe(1);}
   spy.mockRestore();release.mockRestore();
  }finally{await f.close();}
 });
 it('does not replay claimed output or adoption after a public sink throws',async()=>{
  let fail=false;const f=await fixture('solo-streamed-sink-failure','woodlands',event=>{if(fail&&event.kind==='model-transitions')throw Error('declared streamed sink failure');});
  try{
   await cycle(f,1);fail=true;const c=f.cohort(),claim=c.claimPickupOutput.bind(c);let saved:Parameters<typeof claim>|undefined;
   vi.spyOn(c,'claimPickupOutput').mockImplementation(async(...args)=>{const output=await claim(...args);if(args[2]==='models'&&output.transitions.length)saved=args;return output;});
   const prepare=f.a.mirror.prepareAsynchronousDelivery.bind(f.a.mirror);const spy=vi.spyOn(f.a.mirror,'prepareAsynchronousDelivery').mockImplementationOnce((snapshot,order,now,finalize,signal)=>prepare({...snapshot,targets:[],deathPlayerId:'B'},order,now,finalize,signal));
   try{await expect(f.worlds.completeGoodyAsync(f.physical(2),c)).rejects.toThrow(/dispatch/);}finally{spy.mockRestore();}
   expect((await f.store.readManifest()).version).toBe(2);expect(f.a.callback).toBe(2);expect(f.a.modelState!.pickupHistory!.root.count).toBe(1);
   expect(saved).toBeDefined();expect(()=>claim(...saved!)).toThrow(/pinned/);await f.worlds.cancelAndDrainCurrent();expect((await f.store.readManifest()).version).toBe(2);
  }finally{fail=false;await f.close();}
 });
 it('retries only postcommit cleanup while keeping dispatch claims consumed',async()=>{
  const f=await fixture('solo-streamed-cleanup-failure');try{
   const c=f.cohort(),unpin=f.store.unpin.bind(f.store);let attempts=0,claims=0;
   const spy=vi.spyOn(f.store,'unpin').mockImplementation(async id=>{if(id==='cohort-1-published'&&++attempts===1)throw Error('declared published pin cleanup failure');await unpin(id);});
   const claim=c.claimPickupOutput.bind(c);vi.spyOn(c,'claimPickupOutput').mockImplementation(async(...args)=>{claims++;return claim(...args);});
   await expect(f.worlds.completeGoodyAsync(f.physical(1),c)).rejects.toThrow(/cleanup/);const claimed=claims;
   expect(f.a.callback).toBe(1);expect((await f.store.readManifest()).version).toBe(1);await f.worlds.cancelAndDrainCurrent();
   expect(attempts).toBe(2);expect(claims).toBe(claimed);expect((await f.store.readManifest()).version).toBe(1);spy.mockRestore();
  }finally{await f.close();}
 });
 it('cancels a private replay before publication and safely retries its callback',async()=>{
  const f=await fixture('solo-streamed-cancel'),entered=deferred(),release=deferred(),cancel=new AbortController();let pending:Promise<void>|undefined;
  try{
   const c=f.cohort(),replay=c.replayComplete.bind(c),time=f.physical(1);
   vi.spyOn(c,'replayComplete').mockImplementation(async(...args)=>{await replay(...args);if(args[0].observer.id==='A'){entered.resolve();await release.promise;}});
   pending=f.worlds.completeGoodyAsync(time,c,cancel.signal);const reject=expect(pending).rejects.toThrow(/declared cancellation/);
   await entered.promise;cancel.abort(Error('declared cancellation'));release.resolve();await reject;
   expect((await f.store.readManifest()).version).toBe(0);expect(f.a.callback).toBe(0);await f.worlds.completeGoodyAsync(time,f.cohort());expect(f.a.callback).toBe(1);
  }finally{release.resolve();await pending?.catch(()=>{});await f.close();}
 });
});
