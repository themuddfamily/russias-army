import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentOptions} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController,type ReceiverSceneEnvironmentTransaction} from './originalReceiverSceneController';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {OriginalReceiverWeaponReportWorld} from './originalReceiverWeaponReportWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from './originalReceiverLocalWeaponInventory';
import {captureOriginalSoloGunCallbackProgram} from './originalSoloGunCallbackProgram';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import type {WeaponId} from './protocol';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import type {OriginalReceiverTransientEffect,OriginalReceiverTransientGoody} from './originalReceiverTransientWorld';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const initial={kind:'callback' as const,sceneGeneration:4,callback:0};
const receipt={kind:'receipt' as const,sceneGeneration:4,callback:0,tick:0};
const callback={kind:'callback' as const,sceneGeneration:4,callback:1};
const present=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
const counts=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
const resource:Record<WeaponId,string>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
let cached:OriginalMapRuntime|undefined;
const runtime=()=>cached??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const release of cleanups.splice(0))release();});
function fixture(policy?:'retain-until-current-commit'){
 const r=runtime(),target={health:createOriginalPlayerHealth(0,2),alive:true},barrels=new OriginalBarrelWorld(r);
 const loadoutSeed:ReceiverLoadoutCheckpoint={prefix:initial,map:'woodlands',selected:'shotgun',owned:present(),ammo:{...counts(),shotgun:6},reserve:{...counts(),shotgun:12},refillTarget:28,counter:{waitgun:0,poldwaitgun:0},score:0,goldScore:0};
 const loadout=new OriginalReceiverLoadoutWorld(loadoutSeed,{maxCommands:128,maxTextChars:8192,weaponModelPresent:present()});
 const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix:initial,cameraHandle:'declared-camera',cameraWorldMatrix:I,selectedWeapon:'shotgun',loadedRocket:false,motion:{weapon:'shotgun',ticker:1,gunPositionSource:{x:0,y:0,z:0}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,res])=>({handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource:res,inWorld:handle==='spas12',worldMatrix:I,groupAncestry:['declared-camera-parent']}))};
 const operations:string[]=[];
 const local=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:r.scale,maxCommands:128,maxTextChars:8192,bindModels:(operation,state)=>{
  operations.push(operation.kind);let models=state.models;
  if(operation.kind==='whichgun')models=models.map(m=>m.handle==='rocket'?m:{...m,inWorld:operation.weapon!==null&&m.handle===resource[operation.weapon]});
  if(operation.kind==='position')models=models.map(m=>{if(m.handle!==resource[operation.weapon])return m;const world=[...m.worldMatrix];world[12]=operation.positionSource.x*r.scale;world[13]=operation.positionSource.y*r.scale;world[14]=operation.positionSource.z*r.scale;return {...m,worldMatrix:world};});
  return {models,loadedRocket:state.loadedRocket};
 }});
 const reports=new OriginalReceiverWeaponReportWorld({prefix:initial,shots:2,hurts:[]},{maxNames:32,maxTextChars:8192,maxCommands:128});
 cleanups.push(()=>local.release(),()=>loadout.release(),()=>reports.release());
 const pose:ReceiverModelPose={position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},yaw:0,phase:17,scale:1};
 const goody:OriginalReceiverTransientGoody={bspWorld:1,eyePosition:{x:0,y:10,z:0},modelPosition:{x:0,y:9,z:0},weapon:'shotgun'};
 const floor={handle:'floor',name:'floor',resource:'floor',kind:'fixed' as const,group:'scene' as const,inWorld:true,pose,geometryProvenance:'declared-floor'};
 const query=vi.fn(()=>({handle:'floor',geometryProvenance:'declared-floor',layer:'fixed' as const,faceIndex:0,distance:1,point:{x:0,y:10,z:-1},normal:{x:0,y:1,z:0}}));
 const observedStates:{alive:boolean;health:number}[]=[];
 const options:ReceiverCurrentEnvironmentOptions={sceneGeneration:4,sourceScale:r.scale,target,barrels,localWeaponWorld:local,loadoutWorld:loadout,weaponReportWorld:reports,localHitscan:{nearestBullet:query},maxCommands:128,maxOutcomes:32,maxModels:128,maxTextChars:65536,...(policy?{terminalGoodyPolicy:policy}:{}),snapshotAt:(p,state)=>{observedStates.push({alive:state.alive,health:state.health.canonical});return {prefix:p,models:[floor],missing:[],provenance:'declared-complete-CPU-floor-oracle'};}};
 const env=new OriginalReceiverCurrentEnvironment(options),flags={failPrepare:false};let active:ReceiverSceneEnvironmentTransaction|undefined;
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-complete-CPU-floor-oracle'}})};
 const controller=new OriginalReceiverSceneController(backend,{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},{begin:(allocator,models)=>{
  active=env.begin(allocator,models);const original=active;return {...original,prepareCommit:()=>{const publish=original.prepareCommit();if(flags.failPrepare)throw Error('Injected terminal late prepare failure');return publish;}};
 }},{model:{sceneGeneration:4,sourceScale:r.scale,eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64,transientState:true});
 let captures=0;
 const program=captureOriginalSoloGunCallbackProgram(loadout.freeze(),{prefix:callback,weaponModelPresent:present(),held:{typing:false,reload:false,fire:true,digits:[false,false,false,false,false,false]}},{shiftHeld:false,random3:[3],sendReport:true,maxCommands:128,maxModels:128,maxTextChars:65536,captureHitscan:request=>{
  captures++;return {prefix:callback,weapon:'shotgun',sourceRotation:{x:0,y:0,z:0},origin:goody.eyePosition,bspWorld:1,actorNames:{},effectId:`declared-hit:${request.rayIndex}`,muzzleId:`declared-muzzle:${request.rayIndex}`,gunPose:pose};
 }});
 const arm=()=>env.arm({physicalCallback:1,goody,frames:[{prefix:receipt,commands:[]},{prefix:callback,commands:program.callbackCommands,localWeapon:{cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0}}}]});
 const hurt:Extract<OriginalReceiverTransientEffect,{kind:'bang-hurt'}>={kind:'bang-hurt',effectId:'declared-lethal-before-gun',position:goody.eyePosition,attackerName:null,amount:5,radiusSource:250};
 const begin=()=>{const tx=controller.begin();tx.applyExternalReceipt(0,0);active!.stageEffects([hurt],receipt);return tx;};
 const freeze=()=>({target:structuredClone(target),local:local.freeze(),loadout:loadout.freeze(),reports:reports.freeze(),scene:controller.debugState(),publication:controller.freezePublication()});
 return {env,options,target,local,loadout,reports,controller,flags,program,operations,query,arm,begin,freeze,observedStates,context:()=>active!.goodyContext(),captures:()=>captures,hurt,environmentStage:()=>active!};
}

// Explicit installed-copy terminal policy and declared CPU query geometry.
// Receipt damage is staged deliberately before gun execution; this is not a
// claim that Director's go handler truncates its current actor callback.
describe('CURRENT retain-until-current-commit goody policy',()=>{
 it('keeps the default strict source-presence rejection with complete rollback',()=>{
  const f=fixture(),before=f.freeze();f.arm();const tx=f.begin();expect(f.context()).toBeNull();expect(()=>tx.advanceExternalCallback(1)).toThrow('source-presence transition');tx.rollback();
  expect(f.freeze()).toEqual(before);expect(f.query).not.toHaveBeenCalled();expect(f.env.drainOutcomes()).toEqual([]);
 });
 it('retains goody presence and the full captured SPAS program despite staged canonical death',()=>{
  const f=fixture('retain-until-current-commit'),before=f.freeze();f.arm();const tx=f.begin();expect(f.context()).toMatchObject({weapon:'shotgun'});expect(f.target.alive).toBe(true);
  tx.advanceExternalCallback(1);const staged=tx.freezeTransientState!()!;expect(staged.actors.filter(a=>a.kind==='muzzle')).toHaveLength(2);expect(staged.actors.filter(a=>a.kind==='miss')).toHaveLength(2);expect(f.freeze()).toEqual(before);
  tx.commit();expect(f.target).toEqual({health:{canonical:-5,flick:2},alive:false});expect(f.query).toHaveBeenCalledTimes(2);expect(f.captures()).toBe(2);
  expect(f.observedStates.filter(x=>!x.alive)).toContainEqual({alive:false,health:-5});
  expect(f.loadout.freeze()).toEqual(f.program.gunPhase.checkpoint);expect(f.loadout.freeze().ammo.shotgun).toBe(5);expect(f.local.freeze().prefix).toEqual(callback);expect(f.local.freeze().selectedWeapon).toBe('shotgun');
  expect(f.operations).toContain('position');expect(f.reports.freeze()).toMatchObject({prefix:callback,shots:2});
  expect(f.env.drainWeaponReports()).toEqual([{prefix:callback,report:{shots:2}}]);expect(f.env.drainLocalHitscanOutcomes()).toHaveLength(2);
  const outputs=f.env.drainGunOutputs();expect(outputs.some(x=>x.output.kind==='scope-frame')).toBe(true);expect(outputs.some(x=>x.output.kind==='look-kick')).toBe(true);
  expect(f.env.drainOutcomes()).toMatchObject([{health:-5,dead:true,amount:5}]);
 });
 it('rolls back all prepared health/banks/clone names and retries the same captured program',()=>{
  const f=fixture('retain-until-current-commit'),before=f.freeze();f.arm();const first=f.begin();first.advanceExternalCallback(1);const checkpoint=first.freezeTransientState!();f.flags.failPrepare=true;
  expect(()=>first.prepareCommit()).toThrow('late prepare failure');first.rollback();expect(f.freeze()).toEqual(before);expect(f.env.drainGunOutputs()).toEqual([]);expect(f.env.drainWeaponReports()).toEqual([]);expect(f.env.drainOutcomes()).toEqual([]);
  f.flags.failPrepare=false;const retry=f.begin();retry.advanceExternalCallback(1);expect(retry.freezeTransientState!()).toEqual(checkpoint);retry.commit();
  expect(f.captures()).toBe(2);expect(f.query).toHaveBeenCalledTimes(4);expect(f.loadout.freeze().ammo.shotgun).toBe(5);expect(f.target.health).toEqual({canonical:-5,flick:2});expect(f.env.drainOutcomes()).toHaveLength(1);
 });
 it('retains the existing additional-damage guard after lethal health while retaining goody for commands',()=>{
  const f=fixture('retain-until-current-commit');f.arm();const tx=f.begin();f.environmentStage().stageEffects([{...f.hurt,effectId:'ignored-after-death'}],receipt);
  expect(f.context()).not.toBeNull();tx.advanceExternalCallback(1);tx.commit();expect(f.target.health.canonical).toBe(-5);expect(f.env.drainOutcomes()).toHaveLength(1);
 });
 it('rejects an unknown terminal policy before any stage or borrowed bank mutation',()=>{
  const f=fixture(),before=f.freeze();expect(()=>new OriginalReceiverCurrentEnvironment({...f.options,terminalGoodyPolicy:'stop-after-lethal' as 'retain-until-current-commit'})).toThrow();expect(f.freeze()).toEqual(before);
 });
});
