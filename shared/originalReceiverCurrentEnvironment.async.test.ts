import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentCommand,type ReceiverCurrentEnvironmentArm,type ReceiverCurrentEnvironmentOptions} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponBindingOperation,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from './originalReceiverLocalWeaponInventory';
import {OriginalReceiverSceneController,type ReceiverSceneEnvironmentTransaction} from './originalReceiverSceneController';
import {type ReceiverModelBackend,type ReceiverModelPose} from './originalReceiverModelWorld';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import type {WeaponId} from './protocol';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix=(x=0)=>{const m=[...I];m[12]=x;return m;};
const receipt=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:4,callback:0,tick});
const callback:ReceiverScenePrefix={kind:'callback',sceneGeneration:4,callback:1};
let cachedRuntime:OriginalMapRuntime|undefined;
const runtime=()=>cachedRuntime??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
const counts=(n=0)=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,n])) as Record<WeaponId,number>;
const owned=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
const loadoutSeed=():ReceiverLoadoutCheckpoint=>({prefix:{kind:'callback',sceneGeneration:4,callback:0},map:'woodlands',selected:'rifle',owned:owned(),ammo:{...counts(),rifle:2},reserve:counts(),refillTarget:28,counter:{waitgun:7,poldwaitgun:3},score:10,goldScore:123.5});
const resources:Record<WeaponId,string>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
function binding(op:ReceiverLocalWeaponBindingOperation,state:ReceiverLocalWeaponWorldCheckpoint){let models=state.models;if(op.kind==='whichgun')models=models.map(m=>m.handle==='rocket'?m:{...m,inWorld:op.weapon!==null&&m.handle===resources[op.weapon]});if(op.kind==='position')models=models.map(m=>{if(m.handle!==resources[op.weapon])return m;const world=[...m.worldMatrix];world[12]=state.cameraWorldMatrix[12]+op.positionSource.x*runtime().scale;world[13]=op.positionSource.y*runtime().scale;world[14]=op.positionSource.z*runtime().scale;return {...m,worldMatrix:world};});return {models,loadedRocket:state.loadedRocket};}
function fixture(extra:Partial<ReceiverCurrentEnvironmentOptions>={},afterAsyncBirth=false){
 const r=runtime(),target={health:createOriginalPlayerHealth(),alive:true},barrels=new OriginalBarrelWorld(r),loadout=new OriginalReceiverLoadoutWorld(loadoutSeed(),{maxCommands:32,maxTextChars:8192,weaponModelPresent:owned()}),ops:ReceiverLocalWeaponBindingOperation[]=[];
 const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix:loadoutSeed().prefix,cameraHandle:'private-camera',cameraWorldMatrix:matrix(),selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource,inWorld:handle==='ak47',worldMatrix:matrix(50),groupAncestry:['declared-local-parent']}))};
 const local=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:r.scale,maxCommands:64,maxTextChars:8192,bindModels:(op,state)=>{ops.push(op);return binding(op,state);}}),captured:{prefix:ReceiverScenePrefix;local:NonNullable<Parameters<ReceiverCurrentEnvironmentOptions['snapshotAt']>[1]['localWeapons']>;loadout:ReceiverLoadoutCheckpoint}[]=[],flags={failPlane:false};
 // Deliberately declared empty external CPU oracle. Real private ownership
 // comes from this Controller's actual model stage; native coverage is unproved.
 const options:ReceiverCurrentEnvironmentOptions={sceneGeneration:4,sourceScale:r.scale,target,barrels,localWeaponWorld:local,loadoutWorld:loadout,maxCommands:32,maxOutcomes:16,maxModels:128,maxTextChars:65536,snapshotAt:(prefix,state)=>{captured.push({prefix,local:state.localWeapons!,loadout:state.loadout!});return {prefix,models:[],missing:[],provenance:'declared-empty-CPU-oracle'};},...extra},env=new OriginalReceiverCurrentEnvironment(options);
 const pose:ReceiverModelPose={position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1,rotation:{x:0,y:0,z:0,w:1}},queries:ReceiverScenePrefix[]=[],planeNames:string[]=[],during:typeof captured=[];let active:ReceiverSceneEnvironmentTransaction|undefined;
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:2,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:(_o,_models,_cb,_gen,p)=>{queries.push(p!);return {hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}};}};
 const controller=new OriginalReceiverSceneController(backend,{clonePlane:name=>{planeNames.push(name);active!.snapshotAt(callback);during.push(captured.at(-1)!);if(flags.failPlane)throw Error('later FX constructor failed');return {pose,geometryProvenance:'declared-plane',inWorld:true};},cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},{begin:(allocator,models)=>{active=env.begin(allocator,models);const underlying=active;return afterAsyncBirth?{...underlying,dispatchAtAsync:async(prefix,emit,capture)=>{await underlying.dispatchAtAsync!(prefix,emit,capture);emit({kind:'puff',id:'after-await',position:{x:0,y:0,z:0},angleSourceDegrees:10});}}:underlying;}},{model:{sceneGeneration:4,sourceScale:r.scale,eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64});
 const goody={eyePosition:{x:0,y:10,z:0},modelPosition:{x:0,y:9,z:0},bspWorld:1,weapon:'rifle' as const};
 const frame=(commands:readonly ReceiverCurrentEnvironmentCommand[]=[],context:typeof goody|null=goody):ReceiverCurrentEnvironmentArm=>({physicalCallback:1,goody:context,frames:[{prefix:callback,commands,...(context?{localWeapon:{cameraWorldMatrix:matrix(20),velocityWorld:{x:3*r.scale,y:4*r.scale,z:12*r.scale}}}:{})}]});
 const freeze=()=>({models:controller.freezeModels(),modelState:controller.debugState().models,fx:controller.debugState().fx,publication:controller.freezePublication(),version:controller.freezePublicationVersion(),local:local.freeze(),loadout:loadout.freeze(),target:structuredClone(target),barrels:barrels.snapshots()});
 function admitAlias(){env.arm({physicalCallback:0,goody,frames:[{prefix:receipt(),commands:[]}]});const tx=controller.begin(),birth=(id:string)=>({actorId:id,targetFeet:{x:0,y:10,z:0},targetYaw:0,callback:0}),actor={position:{x:0,y:10,z:0},yaw:0,motionTime:100,weapon:'rifle' as const};tx.applyExternalReceipt(0,0);const original=tx.birth(birth('old'));tx.beforeCallback('old',actor);tx.detach('old',actor,0);for(let i=0;i<76;i++)tx.advanceCorpses();const reused=tx.birth(birth('new'));tx.beforeCallback('new',actor);tx.afterCallback('new',{...actor,position:{x:100,y:10,z:0}});tx.beforeCallback('new',actor);const pickup=tx.freezeActorRegistry().pickups[0];expect(original.giHandle).toBe(reused.giHandle);expect(tx.freezeActorRegistry().actors[0].gun).toBe(pickup.handle);expect(tx.freezeActorRegistry().models.find(m=>m.handle===pickup.handle)!.pose.position.x).toBe(100);tx.commit();return pickup;}
 return {env,options,loadout,local,target,barrels,controller,backend,ops,captured,flags,queries,planeNames,during,goody,frame,freeze,admitAlias,getActive:()=>active!};
}


function deferred(){let resolve!:()=>void,reject!:(reason:unknown)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

// Real CPU banks and controller, with declared empty scene geometry. These
// tests establish callback isolation, not browser, native or durable-CAS proof.
describe('CURRENT asynchronous pickup callback through real SceneController',()=>{
 it('keeps a collected alias and all banks private through await, then prepares the final registry',async()=>{
  const gate=deferred();let entered=0,collectLater:((id:number)=>boolean)|undefined,pickupId=0;
  const f=fixture({pickupContinuationAt:async(prefix,collect)=>{entered++;expect(prefix).toEqual(callback);collectLater=collect;expect(collect(pickupId)).toBe(true);await gate.promise;}});
  const pickup=f.admitAlias();pickupId=pickup.id;const before=f.freeze();f.env.arm(f.frame([{kind:'weapon-finish'}]));
  const tx=f.controller.begin(),pending=tx.advanceExternalCallbackAsync!(1);
  expect(entered).toBe(1);expect(f.freeze()).toEqual(before);expect(()=>tx.freezeActorRegistry()).toThrow('awaiting');expect(()=>tx.prepareCommit()).toThrow('awaiting');expect(()=>f.controller.begin()).toThrow();expect(()=>f.env.drainLoadoutIntents()).toThrow('active');
  gate.resolve();await pending;
  expect(tx.freezeActorRegistry().pickups).toEqual([]);expect(tx.freezeActorRegistry().prefix).toEqual(callback);expect(f.freeze()).toEqual(before);
  const publish=tx.prepareCommit(),prepared=tx.preparedActorRegistry!();expect(prepared.pickups).toEqual([]);expect(prepared.prefix).toEqual(callback);expect(()=>tx.freezeActorRegistry()).toThrow();
  publish();expect(f.loadout.freeze().score).toBe(15);expect(f.local.freeze().motion.ticker).toBeCloseTo(1.65);expect(f.controller.freezeModels().find(m=>m.handle===pickup.handle)!.inWorld).toBe(false);expect(f.env.drainLoadoutIntents().map(v=>v.intent.kind)).toEqual(['reload-sound','feedback']);expect(()=>collectLater!(pickupId)).toThrow();expect(entered).toBe(1);
 });
 it('holds the real transient emitter alive until asynchronous environment dispatch settles',async()=>{
  const gate=deferred();const f=fixture({pickupContinuationAt:async()=>{await gate.promise;}},true);f.admitAlias();const before=f.freeze();f.env.arm(f.frame());
  const tx=f.controller.begin(),pending=tx.advanceExternalCallbackAsync!(1);expect(f.planeNames).toEqual([]);expect(f.freeze()).toEqual(before);gate.resolve();await pending;
  expect(f.planeNames).toEqual(['plane2']);expect(f.during).toHaveLength(1);expect(f.during[0].prefix).toEqual(callback);expect(f.controller.freezeTransientModels()).toEqual([]);tx.commit();expect(f.controller.freezeTransientModels()).toHaveLength(1);expect(f.local.freeze().motion.ticker).toBeCloseTo(1.65);
 });
 it('rolls back a rejected continuation and replays the captured prefix and weapon finish once on retry',async()=>{
  let reject=true,attempts=0,pickupId=0;const f=fixture({pickupContinuationAt:async(_prefix,collect)=>{attempts++;collect(pickupId);await Promise.resolve();if(reject)throw Error('declared page read failure');}});
  const pickup=f.admitAlias();pickupId=pickup.id;const before=f.freeze();f.env.arm(f.frame([{kind:'weapon-finish'}]));let tx=f.controller.begin();await expect(tx.advanceExternalCallbackAsync!(1)).rejects.toThrow('declared page read failure');tx.rollback();expect(f.freeze()).toEqual(before);expect(f.env.drainLoadoutIntents()).toEqual([]);
  reject=false;tx=f.controller.begin();await tx.advanceExternalCallbackAsync!(1);tx.commit();expect(attempts).toBe(2);expect(f.loadout.freeze().score).toBe(15);expect(f.local.freeze().motion.ticker).toBeCloseTo(1.65);expect(f.env.drainLoadoutIntents()).toHaveLength(2);
 });
 it('invalidates private work immediately on rollback but keeps admission locked until the pending phase drains',async()=>{
  const gate=deferred();let waiting=true,pickupId=0;const f=fixture({pickupContinuationAt:async(_prefix,collect)=>{collect(pickupId);if(waiting)await gate.promise;}},true);
  const pickup=f.admitAlias();pickupId=pickup.id;const before=f.freeze();f.env.arm(f.frame());let tx=f.controller.begin();const pending=tx.advanceExternalCallbackAsync!(1);tx.rollback();expect(f.freeze()).toEqual(before);expect(()=>f.controller.begin()).toThrow();gate.resolve();await expect(pending).rejects.toThrow();expect(f.planeNames).toEqual([]);expect(f.freeze()).toEqual(before);
  waiting=false;tx=f.controller.begin();await tx.advanceExternalCallbackAsync!(1);tx.commit();expect(f.loadout.freeze().score).toBe(15);expect(f.planeNames).toEqual(['plane2']);expect(f.env.drainLoadoutIntents()).toHaveLength(2);
 });
 it('rejects a retained collector from the prior callback even while a later continuation is executing',async()=>{
  let prior:((id:number)=>boolean)|undefined,nestedError:unknown;const f=fixture({pickupContinuationAt:async(prefix,collect)=>{if(prefix.callback===1)prior=collect;else {try{prior!(0);}catch(error){nestedError=error;}}}});
  f.admitAlias();f.env.arm(f.frame());let tx=f.controller.begin();await tx.advanceExternalCallbackAsync!(1);tx.commit();expect(f.env.drainLoadoutIntents()).toEqual([]);
  const frame=f.frame();f.env.arm({...frame,physicalCallback:2,frames:frame.frames.map(entry=>({...entry,prefix:{kind:'callback',sceneGeneration:4,callback:2}}))});tx=f.controller.begin();await tx.advanceExternalCallbackAsync!(2);expect(nestedError).toBeInstanceOf(Error);expect(tx.freezeActorRegistry().pickups).toHaveLength(1);tx.commit();expect(f.loadout.freeze().score).toBe(10);expect(f.env.drainLoadoutIntents()).toEqual([]);
 });

});
