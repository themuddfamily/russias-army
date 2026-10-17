import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,ORIGINAL_WEAPON_RESOURCES,type OriginalWeaponGeometryData} from './originalWeapons';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from '../shared/originalDoorWorld';
import type {OriginalSoloObserverWorlds} from '../shared/originalSoloObserverWorld';

const read=(path:string)=>JSON.parse(readFileSync(`public/assets/${path}`,'utf8'));
const runtimes=new Map<'barrack'|'woodlands',OriginalMapRuntime>();
function mapRuntime(map:'barrack'|'woodlands'){
 let runtime=runtimes.get(map);if(!runtime){runtime=registerOriginalMapRuntime(map,read(`original-scenes/${map==='woodlands'?'woodland':map}/scene.json`));runtimes.set(map,runtime);}return runtime;
}
function fixture(map:'barrack'|'woodlands'){
 const library=new SoldierMaterialLibrary({presentation:'legacy',tier:'low'}),gi=new THREE.Texture();
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const weaponAssets={geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures};
 const resources=createOriginalSoldierResources({geometry:read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'],rigMotion:read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'],texture:gi},weaponAssets);
 const weapons=createOriginalWeapons(weaponAssets),runtime=mapRuntime(map),barrels=new OriginalBarrelWorld(runtime),doors=new OriginalDoorWorld(runtime.data,runtime.scale,map==='barrack'?read('original-scenes/barrack/doors.json') as OriginalDoorTracks:{version:1,doors:[]});
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(1000,1000,1000);
 // Real Enemy construction, Game source callbacks and coordinator run.
 // DOM/audio sinks are inert; GI, guns and muzzle geometry are imported resources.
 // Elevated spawns isolate contacts from the map; this is not a map traversal
 // or WebGL acceptance test.
 const game=Object.assign(Object.create(Game.prototype),{
  mapId:map,mode:'solo',phase:'playing',archivalWinter:false,playerAlive:true,health:100,hits:0,kills:0,score:0,deaths:0,
  elapsed:1,yaw:0,pitch:0,recoil:0,weaponSwayX:0,weaponSwayY:0,keys:new Set(),controlsPreset:'legacy',chatOpen:false,arrowMovement:false,
  originalActorDispatchGeneration:0,originalProjectileContactCount:0,combatEffectsFrozen:false,originalPlayerContacts:[],originalBlasts:[],projectiles:[],enemies:[],soloBotShots:[],
  camera,velocity:new THREE.Vector3(),scene,remotePlayers:new Map(),localCallsign:'Local goody',soldierMaterialLibrary:library,originalSoldierResources:resources,originalWeapons:weapons,
  weaponDrops:[],worldWeaponMaterials:new Map(),weaponState:{current:'rifle',unarmed:false,addReserve:vi.fn()},reload:vi.fn(),appendChat:vi.fn(),syncWeaponPresentation:vi.fn(),arena:{runtime,barrelWorld:barrels,doorWorld:doors,spawnPoints:Array.from({length:8},(_,i)=>new THREE.Vector3(1000+i*20,1000-1.72,1000)),syncBarrels:vi.fn()},
  playOriginalCombatSound:vi.fn(),playPlayerHurtSound:vi.fn(),showOriginalHurt:vi.fn(),spawnImpact:vi.fn(),surfaceNormalAt:()=>new THREE.Vector3(0,1,0),showHitmarker:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),addKillFeed:vi.fn(),spawnExplosion:vi.fn(),
 }) as any;
 installOriginalSoloLegacyFixture(game);
 game.spawnEnemies();const worlds=game.ensureSoloWorlds() as OriginalSoloObserverWorlds;
 return {game,worlds,dispose(){game.clearWeaponDrops();game.clearEnemies();weapons.dispose();resources.dispose();library.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
// Actual source physics → goody/mirror → actor callbacks; elevated actors
// isolate retained gun presentation from map contacts and native rendering timing.
function callback(s:ReturnType<typeof fixture>){
 s.game.elapsed+=1/30;s.game.beginSoloCallback();s.game.updateOriginalPlayerCallback(true);s.game.completeSoloGoody();s.game.updateOriginalExplosives(true);
}
function noBarrels(s:ReturnType<typeof fixture>){for(const world of s.worlds.worlds.values())world.barrels.applySnapshots([]);}
afterEach(()=>vi.restoreAllMocks());

function bundle(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),resources=createOriginalSoldierResources({geometry:read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'],rigMotion:read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'],texture},{geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures});
 return {resources,dispose(){resources.dispose();texture.dispose();for(const value of textures.values())value.dispose();}};
}
// Explicit adapter inventory inspection measures retained Mesh allocations,
// including models currently outside the scene, rather than visible children.
const inventory=(rig:OriginalSoldier)=>(rig as unknown as {gunModels:Map<string,THREE.Mesh>}).gunModels;
const matrix=(object:THREE.Object3D)=>{object.updateWorldMatrix(true,false);return object.matrixWorld.clone();};
const equalMatrix=(actual:THREE.Matrix4,expected:THREE.Matrix4)=>{for(let i=0;i<16;i++)expect(actual.elements[i]).toBeCloseTo(expected.elements[i],10);};
const ids=['rifle','pistol','shotgun','launcher','rpg','sniper'] as const;

describe('lazy per-GI gun instances (actual shared resources; no global native name claim)',()=>{
 it('allocates only the constructor weapon and never allocates held guns through inspection, pose, orientation or a different logical muzzle',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources);try{
   expect([...inventory(rig).keys()]).toEqual(['rifle']);const gun=rig.getSourceGun('rifle');expect(rig.weaponRoot.children.filter(child=>child instanceof THREE.Mesh)).toEqual([gun]);
   for(const id of ids.filter(id=>id!=='rifle'))expect(()=>rig.getSourceGun(id)).toThrow();rig.getMuzzleWorldPosition();rig.debugState();rig.setSourceMotionTime(330);rig.captureSourceBirthPose();rig.refreshSourcePresentation();rig.animate(1/30);rig.fireForSourceWeapon('pistol');rig.beginSourceFadeaway();expect([...inventory(rig).values()]).toEqual([gun]);expect(()=>rig.getSourceGun('pistol')).toThrow();expect(rig.group.children.some(child=>child.name==='original-GI-shot-flash')).toBe(true);
   rig.dispose();expect(()=>rig.getSourceGun('rifle')).toThrow();expect(inventory(rig).size).toBe(1);
  }finally{rig.dispose();s.dispose();}
 });
 it('catalog-only admission keeps selection, current pose, bones and every existing membership unchanged',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources,{weapon:'rpg'});try{
   rig.group.position.set(3,4,5);rig.setSourceMotionTime(430);rig.animate(1/30);
   const selected=rig.getSourceGun('rpg'),before=rig.debugState(),root=matrix(rig.weaponRoot),held=matrix(selected),children=[...rig.weaponRoot.children],bones=rig.bones.map(bone=>bone.quaternion.toArray()),sample=vi.spyOn(rig as unknown as {sampleMotion(seconds:number):void},'sampleMotion'),animate=vi.spyOn(rig,'animate');
   const pistol=rig.admitSourceGun('pistol');expect(pistol.parent).toBeNull();expect(pistol.visible).toBe(false);expect(pistol.geometry).toBe(s.resources.gunGeometries.get(ORIGINAL_WEAPON_RESOURCES.pistol));expect(pistol.material).toBe(s.resources.gunMaterials.get(ORIGINAL_WEAPON_RESOURCES.pistol));
   expect(rig.getSourceGun('pistol')).toBe(pistol);expect(rig.admitSourceGun('pistol')).toBe(pistol);expect([...inventory(rig).keys()]).toEqual(['rpg','pistol']);expect(rig.weaponRoot.children).toEqual(children);expect(selected.parent).toBe(rig.weaponRoot);expect(selected.visible).toBe(true);equalMatrix(matrix(rig.weaponRoot),root);equalMatrix(matrix(selected),held);expect(rig.debugState()).toEqual(before);expect(rig.bones.map(bone=>bone.quaternion.toArray())).toEqual(bones);expect(sample).not.toHaveBeenCalled();expect(animate).not.toHaveBeenCalled();
   // Catalog admission did not advance VOID-oldweapon; first source callback
   // still runs its actual remove/reparent path on the selected RPG instance.
   const remove=vi.spyOn(rig,'removeSourceGun');rig.refreshSourceWeapon('rpg');expect(remove).toHaveBeenCalledExactlyOnceWith(selected);expect(pistol.parent).toBeNull();expect(pistol.visible).toBe(false);
   rig.bindSourceWeapon('pistol');expect(rig.getSourceGun('pistol')).toBe(pistol);expect(pistol.parent).toBe(rig.weaponRoot);expect(pistol.visible).toBe(true);expect(inventory(rig).size).toBe(2);
  }finally{rig.dispose();s.dispose();}
 });
 it('catalog admission never reparents or revives an existing dropped or collected mesh',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources),drop=new THREE.Group();try{
   rig.refreshSourceWeapon('rifle');const rifle=rig.detachSourceGun('rifle',drop),world=matrix(rifle);expect(rig.admitSourceGun('rifle')).toBe(rifle);expect(rifle.parent).toBe(drop);equalMatrix(matrix(rifle),world);
   rig.removeSourceGun(rifle);expect(rig.admitSourceGun('rifle')).toBe(rifle);expect(rifle.parent).toBeNull();expect(rifle.visible).toBe(false);const pistol=rig.admitSourceGun('pistol');rig.setWeapon('pistol');expect(pistol.parent).toBeNull();expect(pistol.visible).toBe(false);rig.bindSourceWeapon('pistol');expect(pistol.parent).toBe(rig.weaponRoot);expect(pistol.visible).toBe(true);rig.bindSourceWeapon('rifle');expect(rig.getSourceGun('rifle')).toBe(rifle);expect(rifle.visible).toBe(true);
  }finally{rig.dispose();s.dispose();}
 });
 it('catalog admission checks resources before writes and closes with its borrowed owner without asset disposal',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources),resource=ORIGINAL_WEAPON_RESOURCES.pistol,geometry=s.resources.gunGeometries.get(resource)!;try{
   const before=rig.debugState(),children=[...rig.weaponRoot.children];s.resources.gunGeometries.delete(resource);expect(()=>rig.admitSourceGun('pistol')).toThrow('missing');expect(inventory(rig).size).toBe(1);expect(rig.debugState()).toEqual(before);expect(rig.weaponRoot.children).toEqual(children);s.resources.gunGeometries.set(resource,geometry);
   const pistol=rig.admitSourceGun('pistol'),geometryDispose=vi.spyOn(geometry,'dispose'),materialDispose=vi.spyOn(pistol.material as THREE.Material,'dispose');rig.dispose();expect(pistol.parent).toBeNull();expect(pistol.visible).toBe(false);expect(()=>rig.admitSourceGun('pistol')).toThrow('Disposed');expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
  }finally{s.resources.gunGeometries.set(resource,geometry);rig.dispose();s.dispose();}
 });
 it('generic setWeapon lazily creates each encountered resource once and keeps one visible mesh and the held WORLD transform',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources);try{
   rig.group.position.set(3,6,-4);rig.group.quaternion.setFromEuler(new THREE.Euler(.3,-.7,.2,'ZYX'));rig.setSourceMotionTime(460);rig.animate(1/30);const world=matrix(rig.weaponRoot),handles=new Map<string,THREE.Mesh>();
   for(const id of ids){rig.setWeapon(id);const gun=rig.getSourceGun(id);handles.set(id,gun);expect(inventory(rig).size).toBe(handles.size);expect(gun.geometry).toBe(s.resources.gunGeometries.get(ORIGINAL_WEAPON_RESOURCES[id]));equalMatrix(matrix(rig.weaponRoot),world);expect(rig.weaponRoot.children.filter(child=>child instanceof THREE.Mesh&&child.visible)).toEqual([gun]);}
   for(const id of [...ids].reverse()){rig.setWeapon(id);expect(rig.getSourceGun(id)).toBe(handles.get(id));}expect(inventory(rig).size).toBe(6);expect(new Set([...handles.values()].map(mesh=>mesh.uuid)).size).toBe(6);
  }finally{rig.dispose();s.dispose();}
 });
 it('first VOID RPG callback removes and restores the existing constructor instance without allocating any other family',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources,{weapon:'rpg'});try{
   const gun=rig.getSourceGun('rpg'),remove=vi.spyOn(rig,'removeSourceGun');rig.refreshSourceWeapon('rpg');expect(remove).toHaveBeenCalledExactlyOnceWith(gun);expect(inventory(rig).size).toBe(1);expect(rig.getSourceGun('rpg')).toBe(gun);expect(gun.parent).toBe(rig.weaponRoot);expect(gun.visible).toBe(true);
  }finally{rig.dispose();s.dispose();}
 });
 it('first explicit source bind allocates one mesh with the retained full WORLD pose without sampling, phase advance or duplicate later allocation',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources),parent=new THREE.Group();parent.add(rig.group);try{
   parent.position.set(-4,5,8);parent.quaternion.setFromEuler(new THREE.Euler(-.4,.7,.2,'XYZ'));parent.scale.setScalar(1.7);rig.setSourceMotionTime(430);rig.animate(1/30);const world=matrix(rig.weaponRoot),phase=rig.debugState().timeMs,bones=rig.bones.map(bone=>bone.quaternion.toArray()),sample=vi.spyOn(rig as unknown as {sampleMotion(seconds:number):void},'sampleMotion'),animate=vi.spyOn(rig,'animate');
   rig.bindSourceWeapon('pistol');const pistol=rig.getSourceGun('pistol');expect(inventory(rig).size).toBe(2);equalMatrix(matrix(pistol),world);expect(rig.debugState().timeMs).toBe(phase);expect(rig.bones.map(bone=>bone.quaternion.toArray())).toEqual(bones);expect(sample).not.toHaveBeenCalled();expect(animate).not.toHaveBeenCalled();rig.bindSourceWeapon('rifle');rig.bindSourceWeapon('pistol');expect(rig.getSourceGun('pistol')).toBe(pistol);expect(inventory(rig).size).toBe(2);
  }finally{rig.dispose();s.dispose();}
 });
 it('preserves dropped and collected alias handles across explicit lookup and RPG constructor reuse without allocating replacements',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources),drop=new THREE.Group();try{
   rig.refreshSourceWeapon('rifle');const rifle=rig.getSourceGun('rifle');expect(rig.detachSourceGun('rifle',drop)).toBe(rifle);rig.bindSourceWeapon('pistol');rig.bindSourceWeapon('rifle');expect(rifle.parent).toBe(rig.weaponRoot);rig.removeSourceGun(rifle);rig.refreshSourceWeapon('rifle');expect(rifle.parent).toBeNull();expect(rifle.visible).toBe(false);expect(inventory(rig).size).toBe(2);
   rig.beginSourceFadeaway();rig.setSourceMotionTime(3008);rig.prepareSourceReuse();expect([...inventory(rig).keys()]).toEqual(['rifle','pistol','rpg']);const rpg=rig.getSourceGun('rpg');rig.bindSourceWeapon('rifle');expect(rig.getSourceGun('rifle')).toBe(rifle);expect(rifle.parent).toBe(rig.weaponRoot);expect(rifle.visible).toBe(true);rig.prepareSourceReuse();expect(rig.getSourceGun('rpg')).toBe(rpg);expect(inventory(rig).size).toBe(3);
  }finally{rig.dispose();s.dispose();}
 });
 it('missing newly requested resource rejects allocation before changing selected weapon, inventory or retained WORLD pose',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources),resource=ORIGINAL_WEAPON_RESOURCES.pistol,geometry=s.resources.gunGeometries.get(resource)!;try{
   const gun=rig.getSourceGun('rifle'),world=matrix(rig.weaponRoot);s.resources.gunGeometries.delete(resource);
   expect(()=>rig.bindSourceWeapon('pistol')).toThrow();expect(rig.weapon).toBe('rifle');expect([...inventory(rig).values()]).toEqual([gun]);expect(gun.parent).toBe(rig.weaponRoot);expect(gun.visible).toBe(true);equalMatrix(matrix(rig.weaponRoot),world);expect(()=>rig.getSourceGun('pistol')).toThrow();
  }finally{s.resources.gunGeometries.set(resource,geometry);rig.dispose();s.dispose();}
 });
 it('distinct GIs borrow shared geometry/materials but dispose all their allocated held/dropped instances without creating unused families',()=>{
  const s=bundle(),a=new OriginalSoldier(s.resources),b=new OriginalSoldier(s.resources),drop=new THREE.Group();try{
   const rifleA=a.getSourceGun('rifle'),rifleB=b.getSourceGun('rifle');expect(rifleA).not.toBe(rifleB);expect(rifleA.geometry).toBe(rifleB.geometry);expect(rifleA.material).toBe(rifleB.material);a.bindSourceWeapon('pistol');const pistol=a.getSourceGun('pistol');a.bindSourceWeapon('rifle');a.detachSourceGun('rifle',drop);const geometryDispose=vi.spyOn(rifleA.geometry,'dispose'),materialDispose=vi.spyOn(rifleA.material as THREE.Material,'dispose');a.dispose();expect(rifleA.parent).toBeNull();expect(pistol.parent).toBeNull();expect(inventory(a).size).toBe(2);expect(inventory(b).size).toBe(1);expect(rifleB.parent).toBe(b.weaponRoot);expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();expect(()=>a.getSourceGun('rifle')).toThrow();
  }finally{a.dispose();b.dispose();s.dispose();}
 });
 for(const map of ['barrack','woodlands'] as const)it(`${map}: actual source Solo starts every Enemy with only its RPG instance then lazily selects the first accepted packet weapon`,()=>{
  const s=fixture(map);try{
   noBarrels(s);for(const enemy of s.game.enemies){const rig=enemy.sourceRig as OriginalSoldier;expect(rig.weapon).toBe('rpg');expect([...inventory(rig).keys()]).toEqual(['rpg']);expect(rig.getSourceGun('rpg').parent).toBe(rig.weaponRoot);}
   callback(s);for(const enemy of s.game.enemies){const rig=enemy.sourceRig as OriginalSoldier;expect([...inventory(rig).keys()]).toEqual(enemy.weapon==='rpg'?['rpg']:['rpg',enemy.weapon]);expect(rig.weapon).toBe(enemy.weapon);expect(rig.getSourceGun(enemy.weapon).parent).toBe(rig.weaponRoot);expect(rig.getSourceGun(enemy.weapon).visible).toBe(true);}
  }finally{s.dispose();}
 });
});
