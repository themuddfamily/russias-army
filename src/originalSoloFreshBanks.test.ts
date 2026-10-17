import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {OriginalWeaponCollection} from './originalWeapons';
import type {Vec3,WeaponId} from '../shared/protocol';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponHandle} from '../shared/originalReceiverLocalWeaponInventory';
import {OriginalReceiverLocalWeaponWorld} from '../shared/originalReceiverLocalWeaponWorld';
import {OriginalReceiverProjectileWorld} from '../shared/originalReceiverProjectileWorld';
import * as freshLoadout from '../shared/originalSoloFreshLoadout';
import {createOriginalSoloFreshBanks,createOriginalSoloFreshBotBanks,type OriginalSoloFreshBanksOptions,type OriginalSoloFreshBotBanksOptions} from './originalSoloFreshBanks';

const handles=Object.keys(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES) as ReceiverLocalWeaponHandle[];
function fixture(){
 const resources=new Map<string,THREE.Mesh>();
 for(const resource of [...Object.values(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES),'rg6grenade'])resources.set(resource,new THREE.Mesh());
 const collection={resources,rocket:resources.get('rpgrocket')!} as OriginalWeaponCollection;
 const options:OriginalSoloFreshBanksOptions={map:'woodlands',sceneGeneration:7,score:19,goldScore:2.5,sourceScale:.02,
  renderToWorld:new THREE.Matrix4().elements,cameraHandle:'camera',cameraWorldMatrix:new THREE.Matrix4().elements,
  initialGunPositionSource:{x:1,y:2,z:3},initialLoadedRocket:false,
  membership:Object.fromEntries(handles.map(h=>[h,h==='rg6'])) as Record<ReceiverLocalWeaponHandle,boolean>,
  ancestry:Object.fromEntries(handles.map(h=>[h,h==='rg6'?['camera']:[]])) as Record<ReceiverLocalWeaponHandle,string[]>,
  followOffworldParents:true,parentRestoresMembership:true,grenadeMaterialHandle:'grenade-shader',grenadeAncestry:[],rocketMaterialHandle:'rpg-shader',
  maxCommands:256,maxTextChars:65536,maxProjectileModels:100,maxProjectileActors:20,maxReportNames:16};
 return {collection,options};
}
afterEach(()=>vi.restoreAllMocks());
describe('fresh Solo private bank acquisition',()=>{
 it('constructs four owners at the same callback zero without advancing or guessing initial gun state',()=>{
  const f=fixture(),banks=createOriginalSoloFreshBanks(f.collection,f.options);
  const expected={kind:'callback',sceneGeneration:7,callback:0};
  for(const bank of [banks.localWeaponWorld,banks.projectileWorld,banks.loadoutWorld,banks.weaponReportWorld])expect(bank.freeze().prefix).toEqual(expected);
  expect(banks.localWeaponWorld.freeze()).toMatchObject({selectedWeapon:'launcher',loadedRocket:false,motion:{weapon:'launcher',ticker:1,gunPositionSource:{x:1,y:2,z:3}}});
  expect(banks.localWeaponWorld.sourceScale).toBe(.02);
  expect(banks.loadoutWorld.freeze()).toMatchObject({selected:'launcher',score:19,goldScore:2.5,counter:{waitgun:0,poldwaitgun:0}});
  expect(banks.weaponReportWorld.freeze()).toMatchObject({shots:0,hurts:[]});
  expect(banks.projectileWorld.freeze()).toMatchObject({catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]},template:{inWorld:false}});
  expect(Object.isFrozen(banks)).toBe(true);banks.release();
 });
 it('retains the Barrack initial firing wait and explicit loaded rocket fact',()=>{
  const f=fixture(),banks=createOriginalSoloFreshBanks(f.collection,{...f.options,map:'barrack',initialLoadedRocket:true});
  expect(banks.loadoutWorld.freeze().counter).toEqual({waitgun:10,poldwaitgun:0});
  expect(banks.localWeaponWorld.freeze().loadedRocket).toBe(true);banks.release();
 });
 it('releases private banks once, rolls back open stages, and never updates or disposes borrowed resources',()=>{
  const f=fixture(),updates=[...f.collection.resources.values()].map(mesh=>vi.spyOn(mesh,'updateMatrixWorld'));
  const disposals=[...f.collection.resources.values()].map(mesh=>vi.spyOn(mesh.geometry,'dispose'));
  const banks=createOriginalSoloFreshBanks(f.collection,f.options),spies=[banks.localWeaponWorld,banks.projectileWorld,banks.loadoutWorld,banks.weaponReportWorld].map(bank=>vi.spyOn(bank,'release'));
  const stage=banks.loadoutWorld.begin();stage.advanceCallback({kind:'callback',sceneGeneration:7,callback:1});stage.addScore(10);
  banks.release();banks.release();for(const spy of spies)expect(spy).toHaveBeenCalledTimes(1);
  for(const bank of [banks.localWeaponWorld,banks.projectileWorld,banks.loadoutWorld,banks.weaponReportWorld])expect(()=>bank.freeze()).toThrow(/released/);
  expect(()=>stage.freeze()).toThrow();for(const spy of [...updates,...disposals])expect(spy).not.toHaveBeenCalled();
 });
 it.each([
  {sourceScale:0},{sourceScale:Infinity},{score:1.2},{goldScore:NaN},{sceneGeneration:-1},
  {maxCommands:0},{maxTextChars:65537},{maxProjectileModels:0},{maxProjectileActors:0},{maxReportNames:257},
  {rocketMaterialHandle:' bad '},{initialGunPositionSource:{x:NaN,y:0,z:0}},
 ])('rejects invalid configuration before acquiring a bank: %j',patch=>{
  const f=fixture(),acquire=vi.spyOn(freshLoadout,'createOriginalSoloFreshLoadoutWorld');
  expect(()=>createOriginalSoloFreshBanks(f.collection,{...f.options,...patch})).toThrow();expect(acquire).not.toHaveBeenCalled();
 });
 it('rejects local/template cross-bank mesh aliases before owner acquisition',()=>{
  const f=fixture(),release=vi.spyOn(OriginalReceiverLocalWeaponWorld.prototype,'release');
  f.collection.resources.set('rg6grenade',f.collection.resources.get('rg6')!);
  expect(()=>createOriginalSoloFreshBanks(f.collection,f.options)).toThrow(/aliases/);expect(release).not.toHaveBeenCalled();
 });
 it('rejects missing templates, local resource aliases and singular WORLD captures before acquisition',()=>{
  const release=vi.spyOn(OriginalReceiverLocalWeaponWorld.prototype,'release');
  for(const mutate of [
   (f:ReturnType<typeof fixture>)=>f.collection.resources.delete('rg6grenade'),
   (f:ReturnType<typeof fixture>)=>f.collection.resources.set('pistol',f.collection.resources.get('ak47')!),
   (f:ReturnType<typeof fixture>)=>f.collection.resources.get('rg6grenade')!.matrixWorld.makeScale(0,1,1),
  ]){const f=fixture();mutate(f);expect(()=>createOriginalSoloFreshBanks(f.collection,f.options)).toThrow();}
  expect(release).not.toHaveBeenCalled();
 });
 it('releases already acquired owners when a later constructor fails, preserving the original failure',()=>{
  const f=fixture(),failure=new Error('loadout acquisition failed'),order:string[]=[];
  vi.spyOn(freshLoadout,'createOriginalSoloFreshLoadoutWorld').mockImplementation(()=>{throw failure;});
  vi.spyOn(OriginalReceiverLocalWeaponWorld.prototype,'release').mockImplementation(()=>{order.push('local');});
  vi.spyOn(OriginalReceiverProjectileWorld.prototype,'release').mockImplementation(()=>{order.push('projectile');});
  expect(()=>createOriginalSoloFreshBanks(f.collection,f.options)).toThrow(failure);expect(order).toEqual(['projectile','local']);
 });
 it('preserves constructor and all cleanup failures while still attempting each acquired bank',()=>{
  const f=fixture(),failure=new Error('construction'),projectileFailure=new Error('projectile cleanup'),localFailure=new Error('local cleanup');
  vi.spyOn(freshLoadout,'createOriginalSoloFreshLoadoutWorld').mockImplementation(()=>{throw failure;});
  const projectile=vi.spyOn(OriginalReceiverProjectileWorld.prototype,'release').mockImplementation(()=>{throw projectileFailure;});
  const local=vi.spyOn(OriginalReceiverLocalWeaponWorld.prototype,'release').mockImplementation(()=>{throw localFailure;});
  let caught:unknown;try{createOriginalSoloFreshBanks(f.collection,f.options);}catch(error){caught=error;}
  expect(caught).toBeInstanceOf(AggregateError);expect((caught as AggregateError).errors).toEqual([failure,projectileFailure,localFailure]);
  expect((caught as AggregateError).cause).toBe(failure);expect(projectile).toHaveBeenCalledOnce();expect(local).toHaveBeenCalledOnce();
 });
 it('attempts every bank release after failures and remains idempotent after a failed release',()=>{
  const f=fixture(),banks=createOriginalSoloFreshBanks(f.collection,f.options),order:string[]=[],failure=new Error('report release');
  vi.spyOn(banks.weaponReportWorld,'release').mockImplementation(()=>{order.push('report');throw failure;});
  vi.spyOn(banks.loadoutWorld,'release').mockImplementation(()=>{order.push('loadout');});
  vi.spyOn(banks.projectileWorld,'release').mockImplementation(()=>{order.push('projectile');});
  vi.spyOn(banks.localWeaponWorld,'release').mockImplementation(()=>{order.push('local');});
  let caught:unknown;try{banks.release();}catch(error){caught=error;}
  expect((caught as AggregateError).errors).toEqual([failure]);expect(order).toEqual(['report','loadout','projectile','local']);
  banks.release();expect(order).toHaveLength(4);
 });
 it('does not retain mutable configuration arrays or caller motion points',()=>{
  const f=fixture(),banks=createOriginalSoloFreshBanks(f.collection,f.options),before=banks.localWeaponWorld.freeze();
  (f.options.initialGunPositionSource as Vec3).x=90;(f.options.renderToWorld as number[])[12]=91;
  (f.options.cameraWorldMatrix as number[])[12]=92;(f.options.ancestry.rg6 as string[]).push('later');
  expect(banks.localWeaponWorld.freeze()).toBe(before);expect(before.motion.gunPositionSource.x).toBe(1);expect(before.models.find(m=>m.handle==='rg6')!.groupAncestry).toEqual(['camera']);
  banks.release();
 });
});

function botFixture(weapon:WeaponId='rpg'){
 const f=fixture(),{score,goldScore,maxReportNames,...base}=f.options;
 const options:OriginalSoloFreshBotBanksOptions={...base,weapon};
 return {...f,options};
}
describe('fresh authored bot local/projectile bank acquisition',()=>{
 it.each(['pistol','shotgun','rifle','launcher','rpg','sniper'] as const)('seeds exact %s selection once without acquiring human banks or inferring memberships',weapon=>{
  const f=botFixture(weapon),humanAcquire=vi.spyOn(freshLoadout,'createOriginalSoloFreshLoadoutWorld');
  const banks=createOriginalSoloFreshBotBanks(f.collection,{...f.options,initialLoadedRocket:true});
  try{
   expect(Object.keys(banks).sort()).toEqual(['localWeaponWorld','projectileWorld','release']);expect(Object.isFrozen(banks)).toBe(true);expect(humanAcquire).not.toHaveBeenCalled();
   const local=banks.localWeaponWorld.freeze();expect(local).toMatchObject({prefix:{kind:'callback',sceneGeneration:7,callback:0},selectedWeapon:weapon,loadedRocket:true,motion:{weapon,ticker:1,gunPositionSource:{x:1,y:2,z:3}}});
   expect(local.models.filter(model=>model.inWorld).map(model=>model.handle)).toEqual(['rg6']);expect(local.models.find(model=>model.handle==='rocket')!.inWorld).toBe(false);
   expect(banks.projectileWorld.freeze()).toMatchObject({prefix:local.prefix,models:[],catalog:[],actors:[],fifo:{launcher:[],rpg:[]},template:{inWorld:false,materialHandle:'grenade-shader'}});
   expect(banks.localWeaponWorld.sourceScale).toBe(.02);
  }finally{banks.release();}
 });
 it('gives each life independent staged state and resets selection/motion from fresh declared seeds',()=>{
  const f=botFixture(),first=createOriginalSoloFreshBotBanks(f.collection,f.options),second=createOriginalSoloFreshBotBanks(f.collection,{...f.options,sceneGeneration:8});
  try{
   expect(first.localWeaponWorld).not.toBe(second.localWeaponWorld);expect(first.projectileWorld).not.toBe(second.projectileWorld);
   const original=second.localWeaponWorld.freeze(),stage=first.localWeaponWorld.begin();stage.beginCallback({kind:'callback',sceneGeneration:7,callback:1},new THREE.Matrix4().makeTranslation(20,30,40).toArray());stage.whichGun('pistol');stage.finishCallback(10);stage.commit();
   expect(first.localWeaponWorld.freeze()).toMatchObject({selectedWeapon:'pistol',motion:{weapon:'pistol',ticker:1.5}});expect(second.localWeaponWorld.freeze()).toBe(original);
   first.release();expect(()=>first.localWeaponWorld.freeze()).toThrow(/released/);expect(second.localWeaponWorld.freeze()).toBe(original);
   const fresh=createOriginalSoloFreshBotBanks(f.collection,f.options);try{expect(fresh.localWeaponWorld.freeze()).toMatchObject({selectedWeapon:'rpg',motion:{weapon:'rpg',ticker:1,gunPositionSource:{x:1,y:2,z:3}},prefix:{callback:0}});}finally{fresh.release();}
  }finally{first.release();second.release();}
 });
 it('copies declared policies and matrices without touching borrowed transforms, assets or callbacks',()=>{
  const f=botFixture('rifle'),meshes=[...f.collection.resources.values()],before=meshes.map(mesh=>({local:mesh.matrix.toArray(),world:mesh.matrixWorld.toArray(),parent:mesh.parent}));
  const updates=meshes.flatMap(mesh=>[vi.spyOn(mesh,'updateMatrixWorld'),vi.spyOn(mesh,'updateWorldMatrix')]),disposals=meshes.flatMap(mesh=>[vi.spyOn(mesh.geometry,'dispose'),vi.spyOn(mesh.material as THREE.Material,'dispose')]);
  const banks=createOriginalSoloFreshBotBanks(f.collection,f.options),local=banks.localWeaponWorld.freeze();
  (f.options as {weapon:WeaponId}).weapon='sniper';(f.options.initialGunPositionSource as Vec3).x=90;(f.options.cameraWorldMatrix as number[])[12]=91;(f.options.renderToWorld as number[])[12]=92;(f.options.ancestry.rg6 as string[]).push('later');(f.options.membership as Record<ReceiverLocalWeaponHandle,boolean>).pistol=true;
  expect(banks.localWeaponWorld.freeze()).toBe(local);expect(local.selectedWeapon).toBe('rifle');expect(local.motion.gunPositionSource.x).toBe(1);expect(local.cameraWorldMatrix[12]).toBe(0);expect(local.models.find(model=>model.handle==='rg6')!.groupAncestry).toEqual(['camera']);expect(local.models.find(model=>model.handle==='pistol')!.inWorld).toBe(false);
  const localStage=banks.localWeaponWorld.begin(),projectileStage=banks.projectileWorld.begin();banks.release();banks.release();expect(()=>localStage.freeze()).toThrow();expect(()=>projectileStage.freeze()).toThrow();
  expect(meshes.map(mesh=>({local:mesh.matrix.toArray(),world:mesh.matrixWorld.toArray(),parent:mesh.parent}))).toEqual(before);for(const spy of [...updates,...disposals])expect(spy).not.toHaveBeenCalled();
 });
 it.each([{weapon:'invalid'},{sourceScale:0},{sceneGeneration:-1},{map:'unknown'},{maxCommands:257},{maxCommands:0},{maxTextChars:65537},{maxProjectileModels:257},{maxProjectileActors:257},{maxProjectileModels:0},{maxProjectileActors:0},{rocketMaterialHandle:' invalid '},{initialGunPositionSource:{x:NaN,y:0,z:0}}])('rejects invalid authored configuration before owner acquisition: %j',patch=>{
  const f=botFixture(),localRelease=vi.spyOn(OriginalReceiverLocalWeaponWorld.prototype,'release'),humanAcquire=vi.spyOn(freshLoadout,'createOriginalSoloFreshLoadoutWorld');
  expect(()=>createOriginalSoloFreshBotBanks(f.collection,{...f.options,...patch} as OriginalSoloFreshBotBanksOptions)).toThrow();expect(localRelease).not.toHaveBeenCalled();expect(humanAcquire).not.toHaveBeenCalled();
 });
 it('rejects malformed resource identities, WORLD matrices and aggregate shader text before acquiring owners',()=>{
  const release=vi.spyOn(OriginalReceiverLocalWeaponWorld.prototype,'release');
  for(const mutate of [
   (f:ReturnType<typeof botFixture>)=>f.collection.resources.set('rg6grenade',f.collection.resources.get('rg6')!),
   (f:ReturnType<typeof botFixture>)=>f.collection.resources.set('pistol',f.collection.resources.get('ak47')!),
   (f:ReturnType<typeof botFixture>)=>f.collection.resources.delete('rg6grenade'),
   (f:ReturnType<typeof botFixture>)=>f.collection.resources.get('rg6grenade')!.matrixWorld.makeScale(0,1,1),
  ]){const f=botFixture();mutate(f);expect(()=>createOriginalSoloFreshBotBanks(f.collection,f.options)).toThrow();}
  const f=botFixture();expect(()=>createOriginalSoloFreshBotBanks(f.collection,{...f.options,maxTextChars:200,grenadeMaterialHandle:'g'.repeat(110),rocketMaterialHandle:'r'.repeat(110)})).toThrow(/projectile text budget/);expect(release).not.toHaveBeenCalled();
 });
 it('attempts both private releases, preserves failures and stays idempotent after failed release',()=>{
  const f=botFixture(),banks=createOriginalSoloFreshBotBanks(f.collection,f.options),localRelease=banks.localWeaponWorld.release.bind(banks.localWeaponWorld),projectileRelease=banks.projectileWorld.release.bind(banks.projectileWorld),localError=new Error('local cleanup'),projectileError=new Error('projectile cleanup'),order:string[]=[];
  const local=vi.spyOn(banks.localWeaponWorld,'release').mockImplementation(()=>{order.push('local');localRelease();throw localError;}),projectile=vi.spyOn(banks.projectileWorld,'release').mockImplementation(()=>{order.push('projectile');projectileRelease();throw projectileError;});
  let caught:unknown;try{banks.release();}catch(error){caught=error;}expect(caught).toBeInstanceOf(AggregateError);expect((caught as AggregateError).errors).toEqual([projectileError,localError]);expect(order).toEqual(['projectile','local']);
  banks.release();expect(local).toHaveBeenCalledOnce();expect(projectile).toHaveBeenCalledOnce();expect(()=>banks.localWeaponWorld.freeze()).toThrow(/released/);expect(()=>banks.projectileWorld.freeze()).toThrow(/released/);
 });
});
