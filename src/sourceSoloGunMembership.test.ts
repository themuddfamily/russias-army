import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from '../shared/originalDoorWorld';
import {ORIGINAL_DROP_AMMO,originalDropPosition} from '../shared/originalPickupRules';
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

const inScene=(node:THREE.Object3D,scene:THREE.Scene)=>{for(let current:THREE.Object3D|null=node;current;current=current.parent)if(current===scene)return true;return false;};

describe('source Solo explicit gun lookup and hierarchy membership (real CPU resources)',()=>{
 for(const map of ['barrack','woodlands'] as const)it(`${map}: first VOID-oldweapon RPG refresh removes then looks up the same model and restores hierarchy membership`,()=>{
  const s=fixture(map),rig=new OriginalSoldier(s.game.originalSoldierResources,{weapon:'rpg'});s.game.scene.add(rig.group);try{
   const gun=rig.getSourceGun('rpg'),uuid=gun.uuid,remove=vi.spyOn(rig,'removeSourceGun'),lookup=vi.spyOn(rig,'bindSourceWeapon');rig.refreshSourceWeapon('rpg');
   expect(remove).toHaveBeenCalledExactlyOnceWith(gun);expect(lookup).toHaveBeenCalledExactlyOnceWith('rpg');expect(remove.mock.invocationCallOrder[0]).toBeLessThan(lookup.mock.invocationCallOrder[0]);expect(rig.getSourceGun('rpg')).toBe(gun);expect(gun.uuid).toBe(uuid);expect(gun.parent).toBe(rig.weaponRoot);expect(gun.visible).toBe(true);expect(inScene(gun,s.game.scene)).toBe(true);
  }finally{rig.dispose();s.dispose();}
 });
 it('same weapon callback does not invoke lookup, while explicit lookup and constructor RPG reuse restore the stable removed handle',()=>{
  const s=fixture('barrack'),rig=new OriginalSoldier(s.game.originalSoldierResources,{weapon:'rpg'});s.game.scene.add(rig.group);try{
   const gun=rig.getSourceGun('rpg');rig.refreshSourceWeapon('rpg');rig.removeSourceGun(gun);const lookup=vi.spyOn(rig,'bindSourceWeapon');rig.refreshSourceWeapon('rpg');rig.animate(1/30);expect(lookup).not.toHaveBeenCalled();expect(gun.parent).toBeNull();expect(gun.visible).toBe(false);
   rig.bindSourceWeapon('rpg');expect(gun.parent).toBe(rig.weaponRoot);expect(gun.visible).toBe(true);rig.removeSourceGun(gun);rig.beginSourceFadeaway();rig.setSourceMotionTime(3008);const bones=rig.bones.map(bone=>bone.quaternion.toArray()),sample=vi.spyOn(rig as unknown as {sampleMotion(time:number):void},'sampleMotion');rig.prepareSourceReuse('next-life');expect(rig.getSourceGun('rpg')).toBe(gun);expect(gun.parent).toBe(rig.weaponRoot);expect(gun.visible).toBe(true);expect(sample).not.toHaveBeenCalled();expect(rig.bones.map(bone=>bone.quaternion.toArray())).toEqual(bones);
  }finally{rig.dispose();s.dispose();}
 });
 it('removing and restoring the whole owning group changes effective world membership without replacing the gun or immediate parent',()=>{
  const s=fixture('woodlands'),rig=new OriginalSoldier(s.game.originalSoldierResources,{weapon:'rifle'}),owner=new THREE.Group();s.game.scene.add(owner);owner.add(rig.group);try{
   const gun=rig.getSourceGun('rifle'),parent=gun.parent;expect(inScene(gun,s.game.scene)).toBe(true);owner.removeFromParent();expect(inScene(gun,s.game.scene)).toBe(false);expect(gun.parent).toBe(parent);expect(rig.getSourceGun('rifle')).toBe(gun);s.game.scene.add(owner);expect(inScene(gun,s.game.scene)).toBe(true);expect(gun.parent).toBe(parent);expect(rig.getSourceGun('rifle')).toBe(gun);
  }finally{rig.dispose();owner.removeFromParent();s.dispose();}
 });
 for(const map of ['barrack','woodlands'] as const){
  it(`${map}: collected same-weapon gun stays removed through pure/advancing callbacks, and a genuine away/back weapon change restores it`,()=>{
   const s=fixture(map);try{
    noBarrels(s);const enemy=s.game.enemies[0];enemy.weapon='rifle';callback(s);const rig=enemy.sourceRig as OriginalSoldier,gun=rig.getSourceGun('rifle'),uuid=gun.uuid;
    // Explicit prior collection seam invokes the same stable-handle removal
    // used by the actual pickup dispatcher; this avoids a 76-frame setup.
    rig.removeSourceGun(gun);const lookup=vi.spyOn(rig,'bindSourceWeapon');for(let i=0;i<3;i++)s.game.syncSoloMirrors(false);callback(s);callback(s);expect(lookup).not.toHaveBeenCalled();expect(gun.parent).toBeNull();expect(gun.visible).toBe(false);
    enemy.weapon='pistol';callback(s);expect(gun.parent).toBeNull();enemy.weapon='rifle';callback(s);expect(rig.getSourceGun('rifle')).toBe(gun);expect(gun.uuid).toBe(uuid);expect(gun.parent).toBe(rig.weaponRoot);expect(gun.visible).toBe(true);expect(inScene(gun,s.game.scene)).toBe(true);
   }finally{s.dispose();}
  });
  it(`${map}: death after same-weapon collection keeps the same gun offworld while its fixed pickup point remains collectible`,()=>{
   const s=fixture(map);try{
    noBarrels(s);const enemy=s.game.enemies[0];enemy.weapon='rifle';callback(s);const rig=enemy.sourceRig as OriginalSoldier,gun=rig.getSourceGun('rifle');rig.removeSourceGun(gun);callback(s);expect(gun.parent).toBeNull();expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');callback(s);
    const drop=s.game.weaponDrops[0],corpse=s.worlds.worlds.get('player')!.mirror.freezeCorpses().find(c=>c.ownerId===enemy.id)!,point=originalDropPosition({...corpse.position,y:corpse.position.y+s.game.arena.runtime.profile.eyeHeight},s.game.arena.runtime.scale);
    expect(drop.sourceModel).toBe(gun);expect(drop.sourceRig).toBe(rig);expect(drop.group.children).toEqual([]);expect(gun.parent).toBeNull();expect(gun.visible).toBe(false);expect(drop.group.position.toArray()).toEqual([point.x,point.y,point.z]);const fixed=drop.group.position.clone();for(let i=0;i<3;i++)s.game.syncSoloMirrors(false);callback(s);expect(drop.group.position).toEqual(fixed);expect(gun.parent).toBeNull();
    // Declared camera teleport exercises actual collection at the immutable
    // pickup point despite the absent model; it does not test map traversal.
    s.game.camera.position.copy(fixed);s.game.updateWeaponDrops(0,[drop]);expect(s.game.weaponDrops.includes(drop)).toBe(false);expect(s.game.weaponState.addReserve).toHaveBeenCalledExactlyOnceWith('rifle',ORIGINAL_DROP_AMMO.rifle);expect(gun.parent).toBeNull();expect(rig.getSourceGun('rifle')).toBe(gun);
   }finally{s.dispose();}
  });
 }
});
