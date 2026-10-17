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
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
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


const worldMatrix=(object:THREE.Object3D)=>{object.updateWorldMatrix(true,false);return object.matrixWorld.clone();};
const sameMatrix=(actual:THREE.Matrix4,expected:THREE.Matrix4)=>{for(let i=0;i<16;i++)expect(actual.elements[i]).toBeCloseTo(expected.elements[i],9);};
const flashOf=(rig:OriginalSoldier)=>rig.group.children.filter(child=>child.name==='original-GI-shot-flash').at(-1)!;
function correctedBone(bone:THREE.Matrix4){
 const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();bone.decompose(position,rotation,scale);
 rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,170*Math.PI/180,10*Math.PI/180,'ZYX')));
 position.add(new THREE.Vector3(0,-3*ORIGINAL_MAP_SCALE,0).applyQuaternion(rotation));
 return new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(1,1,1));
}

describe('source solo retained world gun presentation (actual geometry; no renderer or native placement claim)',()=>{
 it('pure refresh rebases a full quaternion gun and flash through parent motion without sampling or aging',()=>{
  const s=fixture('woodlands'),rig=new OriginalSoldier(s.game.originalSoldierResources,{weapon:'rifle'}),parent=new THREE.Group();s.game.scene.add(parent);parent.add(rig.group);
  try{
   parent.position.set(4,7,-3);parent.quaternion.setFromEuler(new THREE.Euler(.3,-.7,.45,'ZYX'));parent.scale.setScalar(1.8);rig.setSourceMotionTime(320);rig.animate(1/30);
   const retained=worldMatrix(rig.weaponRoot),sampledBone=rig.bones[22].matrixWorld.clone();rig.fireForSourceWeapon('pistol');const flash=flashOf(rig),birth=worldMatrix(flash),phase=rig.debugState().timeMs;
   expect(rig.weapon).toBe('rifle');expect((flash as THREE.Mesh).geometry).toBe(s.game.originalSoldierResources.gunGeometries.get('mfpistol'));sameMatrix(birth,retained);
   const sample=vi.spyOn(rig,'setSourceMotionTime'),animate=vi.spyOn(rig,'animate'),capture=vi.spyOn(rig as unknown as {captureBonePose():void},'captureBonePose');
   parent.position.set(-8,2,9);parent.quaternion.setFromEuler(new THREE.Euler(-.6,.2,.9,'XYZ'));parent.scale.setScalar(.7);rig.group.position.set(2,-1,4);
   for(let i=0;i<6;i++)rig.refreshSourcePresentation();
   sameMatrix(worldMatrix(rig.weaponRoot),retained);sameMatrix(worldMatrix(flash),birth);expect(rig.debugState().timeMs).toBe(phase);expect(sample).not.toHaveBeenCalled();expect(animate).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();
   // Structural hierarchy movement changes current bone world transforms, but
   // orientgun must still consume its last callback-captured bone, not these.
   expect(worldMatrix(rig.bones[22]).elements).not.toEqual(sampledBone.elements);rig.animate(1/30);sameMatrix(worldMatrix(rig.weaponRoot),correctedBone(sampledBone));expect(flash.parent).toBe(rig.group);
   for(let i=0;i<6;i++)rig.refreshSourcePresentation();expect(flash.parent).toBe(rig.group);rig.animate(1/30);expect(flash.parent).toBeNull();
  }finally{rig.dispose();parent.removeFromParent();s.dispose();}
 });
 for(const map of ['barrack','woodlands'] as const)it(`${map}: repeated mirror sync and zero-time source AI preserve the callback gun before the next committed shot`,()=>{
  const s=fixture(map);try{
   noBarrels(s);const enemy=s.game.enemies[0],rig=enemy.rig as OriginalSoldier,owner=s.worlds.worlds.get(enemy.id)!;enemy.weapon='rifle';callback(s);
   owner.body.position.x+=9;owner.body.velocity={x:0,y:0,z:0};enemy.sourceYaw+=.8;callback(s);
   const retained=worldMatrix(rig.weaponRoot),previousBone=rig.bones[22].matrixWorld.clone();rig.fireForSourceWeapon('rifle');const oldFlash=flashOf(rig),birth=worldMatrix(oldFlash),phase=rig.debugState().timeMs;
   expect(Math.max(...correctedBone(previousBone).elements.map((value,i)=>Math.abs(value-retained.elements[i])))).toBeGreaterThan(.01);
   const animate=vi.spyOn(rig,'animate'),sample=vi.spyOn(rig,'setSourceMotionTime'),capture=vi.spyOn(rig as unknown as {captureBonePose():void},'captureBonePose');enemy.nextDecision=Infinity;
   const context={visible:()=>false,blocked:()=>false,intent:vi.fn()};
   for(let i=0;i<4;i++){
    s.game.syncSoloMirrors(false);enemy.update(0,s.game.elapsed,new THREE.Vector3(4000,1000,4000),s.game.arena,vi.fn(),s.game.camera.position,context);
    sameMatrix(worldMatrix(rig.weaponRoot),retained);sameMatrix(worldMatrix(oldFlash),birth);expect(oldFlash.parent).toBe(rig.group);
   }
   expect(rig.debugState().timeMs).toBe(phase);expect(animate).not.toHaveBeenCalled();expect(sample).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();
   s.worlds.reportShots(enemy.id,1);callback(s);const committedFlash=flashOf(rig);expect(committedFlash).not.toBe(oldFlash);sameMatrix(worldMatrix(committedFlash),retained);sameMatrix(worldMatrix(rig.weaponRoot),correctedBone(previousBone));expect(animate).toHaveBeenCalledExactlyOnceWith(1/30,{alive:true});
   s.game.syncSoloMirrors(false);expect(committedFlash.parent).toBe(rig.group);callback(s);expect(committedFlash.parent).toBeNull();
  }finally{s.dispose();}
 });
 it('zero-time source AI on the dead owner refreshes the existing presentation without invoking skeletal animation',()=>{
  const s=fixture('woodlands');try{
   noBarrels(s);callback(s);const enemy=s.game.enemies[0],rig=enemy.rig as OriginalSoldier;enemy.sourceDamagePresentation(0,true,0,s.game.elapsed);
   const retained=worldMatrix(rig.weaponRoot),phase=rig.debugState().timeMs,animate=vi.spyOn(rig,'animate'),sample=vi.spyOn(rig,'setSourceMotionTime');enemy.group.position.add(new THREE.Vector3(5,2,-3));enemy.group.rotation.y+=.4;
   enemy.update(0,s.game.elapsed,s.game.camera.position,s.game.arena,vi.fn(),s.game.camera.position,{visible:()=>false,blocked:()=>false,intent:vi.fn()});
   sameMatrix(worldMatrix(rig.weaponRoot),retained);expect(rig.debugState().timeMs).toBe(phase);expect(animate).not.toHaveBeenCalled();expect(sample).not.toHaveBeenCalled();
  }finally{s.dispose();}
 });
});
