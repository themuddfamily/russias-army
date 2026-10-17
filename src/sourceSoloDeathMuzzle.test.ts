import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalWeapons} from './originalWeapons';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from '../shared/originalDoorWorld';
import type {OriginalSoloObserverWorlds} from '../shared/originalSoloObserverWorld';

const read=(path:string)=>JSON.parse(readFileSync(new URL('../public/assets/'+path,import.meta.url),'utf8'));
function fixture(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const resources=createOriginalSoldierResources({geometry:read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'],rigMotion:read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'],texture},{geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures});
 const rig=new OriginalSoldier(resources,{weapon:'rifle'}),scene=new THREE.Scene(),sourceParent=new THREE.Group(),destination=new THREE.Group();scene.add(sourceParent,destination);sourceParent.add(rig.group);
 return {rig,resources,sourceParent,destination,dispose(){rig.dispose();resources.dispose();texture.dispose();for(const value of textures.values())value.dispose();}};
}
const flashes=(rig:OriginalSoldier)=>rig.group.children.filter((child):child is THREE.Mesh=>child instanceof THREE.Mesh&&child.name==='original-GI-shot-flash');
const matrix=(object:THREE.Object3D)=>{object.updateWorldMatrix(true,false);return object.matrixWorld.clone();};
const equalWorld=(actual:THREE.Object3D,expected:THREE.Matrix4)=>{const current=matrix(actual);for(let i=0;i<16;i++)expect(current.elements[i]).toBeCloseTo(expected.elements[i],10);};
afterEach(()=>vi.restoreAllMocks());

const runtimes=new Map<'barrack'|'woodlands',OriginalMapRuntime>();
function mapRuntime(map:'barrack'|'woodlands'){
 let runtime=runtimes.get(map);if(!runtime){runtime=registerOriginalMapRuntime(map,read(`original-scenes/${map==='woodlands'?'woodland':map}/scene.json`));runtimes.set(map,runtime);}return runtime;
}
function gameFixture(map:'barrack'|'woodlands'){
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
function callback(s:ReturnType<typeof gameFixture>){
 s.game.elapsed+=1/30;s.game.beginSoloCallback();s.game.updateOriginalPlayerCallback(true);s.game.completeSoloGoody();s.game.updateOriginalExplosives(true);
}
function noBarrels(s:ReturnType<typeof gameFixture>){for(const world of s.worlds.worlds.values())world.barrels.applySnapshots([]);}


describe('detached source muzzle callback bundle (real resources; explicit parent adapter)',()=>{
 for(const map of ['barrack','woodlands'] as const)it(`${map}: actual shot then death callback transfers the same flash before owner hide, ages once, and retires on the following callback`,()=>{
  const s=gameFixture(map);try{
   noBarrels(s);callback(s);const enemy=s.game.enemies[0],rig=enemy.rig as OriginalSoldier,human=s.worlds.worlds.get('player')!,pose=human.mirror.freeze().find(p=>p.id===enemy.id)!,retainedGun=matrix(rig.weaponRoot);
   // A declared extra trusted where at the existing callback queues a positive
   // report without running a soldier step. The real dead-only delivery and
   // subsequent Game callback then exercise shot -> death -> owner hide.
   const trusted=1000+human.callback*1000/30,stage=human.mirror.prepareSynchronousDelivery({tick:human.receiptTick,sentAt:trusted,targets:[{id:enemy.id,position:pose.position,yaw:pose.yaw-Math.PI,motionTime:pose.motionTime,alive:true,weapon:'rifle',sourceShots:1}]},{callbacks:human.callback,receiptCallbacks:human.callback},trusted);if(!stage.ok)throw Error(stage.reason);stage.commit();human.receiptTick++;
   let captured:THREE.Mesh|undefined;const fire=rig.fireForSourceWeapon.bind(rig);vi.spyOn(rig,'fireForSourceWeapon').mockImplementation(weapon=>{fire(weapon);captured=flashes(rig).at(-1);});
   s.worlds.dispose(enemy.id);expect(rig.sourceFlashCount).toBe(0);callback(s);
   const transferred=s.game.scene.children.find((child:THREE.Object3D)=>child.name==='original-GI-shot-flash') as THREE.Mesh;expect(transferred).toBeDefined();expect(transferred).toBe(captured);expect(transferred.geometry).toBe(s.game.originalSoldierResources.gunGeometries.get('mfak47'));expect(enemy.group.visible).toBe(false);expect(rig.sourceFlashCount).toBe(0);expect(transferred.parent).toBe(s.game.scene);equalWorld(transferred,retainedGun);expect(s.game.soloDetachedFlashes.map((bundle:{count:number})=>bundle.count)).toEqual([1]);
   for(let i=0;i<5;i++)s.game.syncSoloMirrors(false);expect(transferred.parent).toBe(s.game.scene);equalWorld(transferred,retainedGun);callback(s);expect(transferred.parent).toBeNull();expect(s.game.soloDetachedFlashes).toEqual([]);
  }finally{s.dispose();}
 });
 it('actual Game preserves detached flashes on terminal authority freeze and removes them on full cleanup',()=>{
  const s=gameFixture('woodlands');try{
   noBarrels(s);callback(s);const enemy=s.game.enemies[0],rig=enemy.rig as OriginalSoldier;rig.fire();const transferred=flashes(rig)[0],world=matrix(transferred);s.worlds.dispose(enemy.id);
   // Use the real terminal callback: model ownership now changes with its
   // committed detach event rather than a mirror-only fixture acceptance.
   callback(s);
   expect(enemy.group.visible).toBe(false);expect(transferred.parent).toBe(s.game.scene);expect(s.game.soloDetachedFlashes[0].count).toBe(1);equalWorld(transferred,world);s.game.disposeSoloWorlds(true);expect(s.game.soloWorlds).toBeUndefined();
   for(let i=0;i<4;i++)s.game.syncSoloMirrors(true);expect(transferred.parent).toBe(s.game.scene);equalWorld(transferred,world);s.game.disposeSoloWorlds(false);expect(transferred.parent).toBeNull();expect(s.game.soloDetachedFlashes).toEqual([]);
  }finally{s.dispose();}
 });
 it('transfers the same meshes into a transformed parent at their captured WORLD pose and survives owner reset/disposal',()=>{
  const s=fixture();let bundle:ReturnType<OriginalSoldier['detachSourceFlashes']>|undefined;try{
   s.sourceParent.position.set(3,5,-7);s.sourceParent.quaternion.setFromEuler(new THREE.Euler(.4,-.6,.8,'ZYX'));s.sourceParent.scale.setScalar(1.6);s.rig.setSourceMotionTime(470);s.rig.animate(1/30);s.rig.fireForSourceWeapon('pistol');
   const flash=flashes(s.rig)[0],world=matrix(flash),geometry=flash.geometry,material=flash.material;
   s.destination.position.set(-9,2,6);s.destination.quaternion.setFromEuler(new THREE.Euler(-.7,.5,-.3,'XYZ'));s.destination.scale.set(2,.5,1.3);
   bundle=s.rig.detachSourceFlashes(s.destination);expect(bundle.count).toBe(1);expect(flashes(s.rig)).toEqual([]);expect(flash.parent).toBe(s.destination);expect(flash.geometry).toBe(geometry);expect(flash.material).toBe(material);equalWorld(flash,world);
   const empty=s.rig.detachSourceFlashes(s.destination);expect(empty.count).toBe(0);empty.clear();s.rig.reset();s.rig.dispose();expect(bundle.count).toBe(1);equalWorld(flash,world);
   s.destination.position.set(8,-4,1);s.destination.quaternion.setFromEuler(new THREE.Euler(.2,.9,-.6,'YXZ'));s.destination.scale.set(.8,1.7,.6);for(let i=0;i<5;i++)bundle.step(0);equalWorld(flash,world);expect(bundle.count).toBe(1);
   bundle.step(1/30);expect(bundle.count).toBe(1);equalWorld(flash,world);bundle.step(1/30);expect(bundle.count).toBe(0);expect(flash.parent).toBeNull();
  }finally{bundle?.clear();s.dispose();}
 });
 it('preserves different existing bangtimes and the fractional callback remainder rather than granting a new lifetime',()=>{
  const s=fixture();let bundle:ReturnType<OriginalSoldier['detachSourceFlashes']>|undefined;try{
   s.rig.fire();const older=flashes(s.rig)[0];s.rig.animate(1/30);s.rig.animate(1/60);s.rig.fireForSourceWeapon('sniper');const newer=flashes(s.rig)[1],oldWorld=matrix(older),newWorld=matrix(newer);
   bundle=s.rig.detachSourceFlashes(s.destination);expect(bundle.count).toBe(2);expect(s.destination.children).toEqual([older,newer]);equalWorld(older,oldWorld);equalWorld(newer,newWorld);
   bundle.step(1/60);expect(older.parent).toBeNull();expect(newer.parent).toBe(s.destination);expect(bundle.count).toBe(1);equalWorld(newer,newWorld);
   for(let i=0;i<4;i++)bundle.step(0);expect(bundle.count).toBe(1);bundle.step(1/60);expect(bundle.count).toBe(1);bundle.step(1/60);expect(bundle.count).toBe(0);expect(newer.parent).toBeNull();
  }finally{bundle?.clear();s.dispose();}
 });
 it('moves the fractional accumulator out of the owner so newly created owner flashes have an independent callback clock',()=>{
  const s=fixture();let bundle:ReturnType<OriginalSoldier['detachSourceFlashes']>|undefined;try{
   s.rig.fire();const detached=flashes(s.rig)[0];s.rig.animate(1/60);bundle=s.rig.detachSourceFlashes(s.destination);s.rig.fireForSourceWeapon('pistol');const fresh=flashes(s.rig)[0];
   s.rig.animate(1/60);bundle.step(1/60);expect(fresh.parent).toBe(s.rig.group);expect(detached.parent).toBe(s.destination);
   s.rig.animate(1/60);bundle.step(1/30);expect(detached.parent).toBeNull();expect(bundle.count).toBe(0);expect(fresh.parent).toBe(s.rig.group);
   s.rig.animate(1/60);expect(fresh.parent).toBe(s.rig.group);s.rig.animate(1/60);expect(fresh.parent).toBeNull();
  }finally{bundle?.clear();s.dispose();}
 });
 it('clear removes only transferred meshes and never disposes borrowed flash material or geometry',()=>{
  const s=fixture();let bundle:ReturnType<OriginalSoldier['detachSourceFlashes']>|undefined;try{
   s.rig.fire();const transferred=flashes(s.rig)[0],geometryDispose=vi.spyOn(transferred.geometry,'dispose'),materialDispose=vi.spyOn(transferred.material as THREE.Material,'dispose'),unrelated=new THREE.Object3D();s.destination.add(unrelated);
   bundle=s.rig.detachSourceFlashes(s.destination);s.rig.fire();const ownerFlash=flashes(s.rig)[0];bundle.clear();bundle.clear();bundle.step(1);expect(bundle.count).toBe(0);expect(transferred.parent).toBeNull();expect(unrelated.parent).toBe(s.destination);expect(ownerFlash.parent).toBe(s.rig.group);expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
  }finally{bundle?.clear();s.dispose();}
 });
});
