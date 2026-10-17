import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentArm,type ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController,type ReceiverSceneEnvironmentTransaction} from './originalReceiverSceneController';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponBindingOperation,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from './originalReceiverLocalWeaponInventory';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import type {OriginalReceiverTransientGoody} from './originalReceiverTransientWorld';
import {captureOriginalSoloGunCallbackProgram} from './originalSoloGunCallbackProgram';
import {advanceOriginalReceiverGunCallback,type ReceiverGunCallbackInput} from './originalReceiverGunCallback';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import type {WeaponId} from './protocol';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix=(x=0)=>{const m=[...I];m[12]=x;return m;};
const prefix:ReceiverScenePrefix={kind:'callback',sceneGeneration:4,callback:0};
const callback:ReceiverScenePrefix={kind:'callback',sceneGeneration:4,callback:1};
const counts=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
const present=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
const resource:Record<WeaponId,string>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
let cached:OriginalMapRuntime|undefined;
const runtime=()=>cached??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const release of cleanups.splice(0))release();});
function fixture(selected:WeaponId|null=null){
 const r=runtime(),target={health:createOriginalPlayerHealth(),alive:true},barrels=new OriginalBarrelWorld(r);
 const seed:ReceiverLoadoutCheckpoint={prefix,map:'woodlands',selected,owned:present(),ammo:{...counts(),pistol:2},reserve:counts(),refillTarget:28,counter:{waitgun:0,poldwaitgun:0},score:0,goldScore:0};
 const loadout=new OriginalReceiverLoadoutWorld(seed,{maxCommands:64,maxTextChars:8192,weaponModelPresent:present()});
 const ops:ReceiverLocalWeaponBindingOperation[]=[];
 const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix,cameraHandle:'private-camera',cameraWorldMatrix:matrix(),selectedWeapon:selected,loadedRocket:false,motion:{weapon:selected,ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,res])=>({handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource:res,inWorld:handle===(selected===null?'ak47':resource[selected]),worldMatrix:matrix(50),groupAncestry:['declared-local-parent']}))};
 const local=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:r.scale,maxCommands:64,maxTextChars:8192,bindModels:(op,state)=>{
  ops.push(op);let models=state.models;
  if(op.kind==='whichgun')models=models.map(m=>m.handle==='rocket'?m:{...m,inWorld:op.weapon!==null&&m.handle===resource[op.weapon]});
  if(op.kind==='position')models=models.map(m=>{if(m.handle!==resource[op.weapon])return m;const world=[...m.worldMatrix];world[12]=state.cameraWorldMatrix[12]+op.positionSource.x*r.scale;world[13]=op.positionSource.y*r.scale;world[14]=op.positionSource.z*r.scale;return {...m,worldMatrix:world};});
  return {models,loadedRocket:state.loadedRocket};
 }});
 cleanups.push(()=>local.release(),()=>loadout.release());
 // The oracle and renderer poses below are declared CPU fixtures. They do not
 // claim complete native scene geometry, renderer timing or Havok coverage.
 const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:4,sourceScale:r.scale,target,barrels,localWeaponWorld:local,loadoutWorld:loadout,maxCommands:128,maxOutcomes:16,maxModels:128,maxTextChars:65536,snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-CPU-oracle'})});
 const pose:ReceiverModelPose={position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:2,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})};
 let active:ReceiverSceneEnvironmentTransaction|undefined;const flags={failPrepare:false};
 const controller=new OriginalReceiverSceneController(backend,{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},{begin:(allocator,models)=>{
  active=env.begin(allocator,models);const original=active;
  return {...original,prepareCommit:()=>{const publish=original.prepareCommit();if(flags.failPrepare)throw Error('late prepared environment failure');return publish;}};
 }},{model:{sceneGeneration:4,sourceScale:r.scale,eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64});
 const goody:OriginalReceiverTransientGoody={eyePosition:{x:0,y:10,z:0},modelPosition:{x:0,y:9,z:0},bspWorld:1,weapon:selected};
 const frame=(commands:readonly ReceiverCurrentEnvironmentCommand[]=[],context:OriginalReceiverTransientGoody|null=goody):ReceiverCurrentEnvironmentArm=>({physicalCallback:1,goody:context,frames:[{prefix:callback,commands,...(context?{localWeapon:{cameraWorldMatrix:matrix(20),velocityWorld:{x:3*r.scale,y:4*r.scale,z:12*r.scale}}}:{})}]});
 const freeze=()=>({local:local.freeze(),loadout:loadout.freeze(),models:controller.freezeModels(),fx:controller.debugState().fx,publication:controller.freezePublication(),version:controller.freezePublicationVersion(),target:structuredClone(target),barrels:barrels.snapshots()});
 return {local,loadout,env,controller,ops,flags,frame,freeze,context:()=>active!.goodyContext()};
}
const miss:ReceiverCurrentEnvironmentCommand={kind:'transient-birth',event:{kind:'miss',id:'declared-miss',position:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}}};
const held=(extra:Partial<ReceiverGunCallbackInput['held']>={}):ReceiverGunCallbackInput=>({prefix:callback,weaponModelPresent:present(),held:{typing:false,reload:false,fire:false,digits:[false,false,false,false,false,false],...extra}});

describe('CURRENT present-goody VOID weapon source callback',()=>{
 it('advances ticker without writing gun pose or removing retained visible membership',()=>{
  const f=fixture(),before=f.local.freeze();f.env.arm(f.frame());const tx=f.controller.begin();tx.advanceExternalCallback(1);
  expect(f.context()).toMatchObject({weapon:null,bspWorld:1});tx.commit();
  expect(f.local.freeze().motion).toEqual({...before.motion,ticker:1.65});expect(f.local.freeze().models).toEqual(before.models);
  expect(f.local.freeze().cameraWorldMatrix).toEqual(matrix(20));expect(f.ops.filter(op=>op.kind==='position'||op.kind==='whichgun')).toEqual([]);
  expect(f.loadout.freeze().selected).toBeNull();expect(f.local.freeze().prefix).toEqual(callback);
 });
 it('runs recovered choosegun from VOID and finishes the newly selected pistol in source order',()=>{
  const f=fixture(),program=captureOriginalSoloGunCallbackProgram(f.loadout.freeze(),held({digits:[true,false,false,false,false,false]}),{shiftHeld:false,random3:[],sendReport:false,maxCommands:128,maxModels:128,maxTextChars:65536});
  f.env.arm(f.frame(program.callbackCommands));const tx=f.controller.begin();tx.advanceExternalCallback(1);expect(f.context()!.weapon).toBe('pistol');tx.commit();
  expect(f.loadout.freeze().selected).toBe('pistol');expect(f.local.freeze().selectedWeapon).toBe('pistol');expect(f.local.freeze().motion.weapon).toBe('pistol');
  expect(f.local.freeze().motion.ticker).toBeCloseTo(1.65);expect(f.local.freeze().models.filter(m=>m.inWorld).map(m=>m.handle)).toEqual(['pistol']);
  const kinds=f.ops.map(op=>op.kind);expect(kinds.indexOf('whichgun')).toBeLessThan(kinds.lastIndexOf('position'));
 });
 it.each([null,'shotgun'] as const)('uses visible goody weapon %s to select generic or SPAS decal',weapon=>{
  const f=fixture(weapon);f.env.arm(f.frame([miss]));const tx=f.controller.begin();tx.advanceExternalCallback(1);expect(f.context()!.weapon).toBe(weapon);tx.commit();
  const texture=weapon==='shotgun'?'decalspas':'decal';expect(f.controller.freezeShaders().find(s=>s.handle===texture)!.texture).toBe(texture);
  expect(f.controller.freezeTransientModels()).toHaveLength(1);expect(f.controller.freezeTransientModels()[0].pose.scale).toBe(weapon==='shotgun'?.5:.4);
 });
 it('rolls back prepared VOID motion and FX, then retries without publishing duplicate state',()=>{
  const f=fixture(),before=f.freeze();f.env.arm(f.frame([miss]));f.flags.failPrepare=true;let tx=f.controller.begin();tx.advanceExternalCallback(1);
  expect(()=>tx.prepareCommit()).toThrow('late prepared environment failure');tx.rollback();expect(f.freeze()).toEqual(before);
  expect(f.local.freeze()).toBe(before.local);expect(f.loadout.freeze()).toBe(before.loadout);expect(f.env.drainOutcomes()).toEqual([]);expect(f.env.drainLoadoutIntents()).toEqual([]);
  f.flags.failPrepare=false;tx=f.controller.begin();tx.advanceExternalCallback(1);tx.commit();expect(f.local.freeze().motion.ticker).toBeCloseTo(1.65);expect(f.controller.freezeTransientModels()).toHaveLength(1);
 });
 it('keeps absent-goody whole callback skipping distinct from a present VOID weapon',()=>{
  const f=fixture(),before=f.local.freeze();f.env.arm(f.frame([],null));const tx=f.controller.begin();tx.advanceExternalCallback(1);expect(f.context()).toBeNull();tx.commit();
  expect(f.local.freeze().motion).toEqual(before.motion);expect(f.local.freeze().models).toEqual(before.models);expect(f.local.freeze().cameraWorldMatrix).toEqual(before.cameraWorldMatrix);expect(f.ops).toEqual([]);
  expect(f.local.freeze().prefix).toEqual(callback);expect(f.loadout.freeze().selected).toBeNull();
 });
 it('retains the unsupported in-flight reload continuation to VOID guard without mutating banks',()=>{
  const f=fixture('rifle'),before=f.freeze(),empty={...f.loadout.freeze(),ammo:counts(),reserve:counts()};
  expect(()=>advanceOriginalReceiverGunCallback(empty,held({reload:true}))).toThrow('Unsupported recovered gun continuation after reload fallback to VOID');
  expect(f.freeze()).toEqual(before);expect(f.ops).toEqual([]);
 });
});
