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
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import type {OriginalSoloObserverWorlds,OriginalSoloEvent} from '../shared/originalSoloObserverWorld';

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

const worldMatrix=(node:THREE.Object3D)=>{node.updateWorldMatrix(true,false);return node.matrixWorld.clone();};
const sameMatrix=(actual:THREE.Matrix4,expected:THREE.Matrix4)=>{for(let i=0;i<16;i++)expect(actual.elements[i]).toBeCloseTo(expected.elements[i],10);};

function replay(s:ReturnType<typeof fixture>,enemy:any,position:THREE.Vector3,weapon:'rifle'|'pistol'='rifle'){
 // Declared canonical respawn/teleport seam: these CPU tests exercise model
 // identity and callback ownership, not native spawn grounding or traversal.
 enemy.respawn(position,s.game.elapsed,true);enemy.weapon=weapon;s.game.registerSoloEnemy(enemy);
}

describe('actual source Solo GI and gun ownership (imported resources; CPU adapter)',()=>{
 it('birth capture keeps the retired phase3008 bones and full rotation until the next orientgun callback without sampling',()=>{
  const s=fixture('woodlands'),rig=new OriginalSoldier(s.game.originalSoldierResources,{weapon:'rpg'}),parent=new THREE.Group();s.game.scene.add(parent);parent.add(rig.group);try{
   rig.group.quaternion.setFromEuler(new THREE.Euler(.3,-.8,.5,'ZYX'));rig.beginSourceFadeaway();rig.setSourceMotionTime(3008);const rotation=rig.group.quaternion.clone(),bones=rig.bones.map(bone=>({position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray()}));
   const sample=vi.spyOn(rig as unknown as {sampleMotion(seconds:number):void},'sampleMotion'),animate=vi.spyOn(rig,'animate'),orient=vi.spyOn(rig as unknown as {updateGunPose():void},'updateGunPose');rig.prepareSourceReuse('cross-bot');const retainedGun=worldMatrix(rig.weaponRoot);parent.position.set(-8,4,6);parent.quaternion.setFromEuler(new THREE.Euler(-.2,.5,.7,'YXZ'));rig.group.position.set(20,7,-4);
   // Capture must update the moved parent itself. No gun/bone WORLD query or
   // presentation refresh is allowed to repair its stale matrix first.
   rig.captureSourceBirthPose();const birthBone=worldMatrix(rig.bones[22]);
   expect(rig.group.quaternion.toArray()).toEqual(rotation.toArray());expect(rig.bones.map(bone=>({position:bone.position.toArray(),quaternion:bone.quaternion.toArray(),scale:bone.scale.toArray()}))).toEqual(bones);expect(rig.debugState()).toMatchObject({alive:true,timeMs:0,deathBon:0,removed:false});sameMatrix(worldMatrix(rig.weaponRoot),retainedGun);expect(sample).not.toHaveBeenCalled();expect(animate).not.toHaveBeenCalled();expect(orient).not.toHaveBeenCalled();
   const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();birthBone.decompose(position,quaternion,scale);quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,170*Math.PI/180,10*Math.PI/180,'ZYX')));position.add(new THREE.Vector3(0,-3*ORIGINAL_MAP_SCALE,0).applyQuaternion(quaternion));rig.animate(1/30);sameMatrix(worldMatrix(rig.weaponRoot),new THREE.Matrix4().compose(position,quaternion,new THREE.Vector3(1,1,1)));expect(orient).toHaveBeenCalledTimes(1);
  }finally{rig.dispose();s.dispose();}
 });
 it('stores a removed gun drop WORLD without membership revival and atomically rejects foreign or malformed transforms',()=>{
  const s=fixture('barrack'),rig=new OriginalSoldier(s.game.originalSoldierResources,{weapon:'rifle'});s.game.scene.add(rig.group);try{
   const gun=rig.getSourceGun('rifle');rig.removeSourceGun(gun);rig.bindSourceWeapon('pistol');const dropWorld=new THREE.Matrix4().compose(new THREE.Vector3(8,3,-6),new THREE.Quaternion().setFromEuler(new THREE.Euler(.6,-.3,.9,'XYZ')),new THREE.Vector3(1,1,1)),retained=dropWorld.clone();rig.setSourceGunWorld(gun,dropWorld);dropWorld.elements[12]=999;
   expect(gun.parent).toBeNull();expect(gun.visible).toBe(false);rig.bindSourceWeapon('rifle');expect(gun.parent).toBe(rig.weaponRoot);expect(gun.visible).toBe(true);expect(rig.getSourceGun('rifle')).toBe(gun);sameMatrix(worldMatrix(rig.weaponRoot),retained);
   const invalid=new THREE.Matrix4();invalid.elements[4]=NaN;const short=new THREE.Matrix4();short.elements.pop();const foreign=new THREE.Mesh(gun.geometry,gun.material);expect(()=>rig.setSourceGunWorld(foreign,retained)).toThrow('Foreign');expect(()=>rig.setSourceGunWorld(gun,invalid)).toThrow('Invalid');expect(()=>rig.setSourceGunWorld(gun,short)).toThrow('Invalid');sameMatrix(worldMatrix(rig.weaponRoot),retained);
   rig.bindSourceWeapon('pistol');rig.bindSourceWeapon('rifle');sameMatrix(worldMatrix(rig.weaponRoot),retained);expect(gun.parent).toBe(rig.weaponRoot);expect(gun.visible).toBe(true);
  }finally{rig.dispose();s.dispose();}
 });
 it.each([false,true])('birth before the final fade callback acquires a fresh GI before retirement, with firing=%s',firing=>{
  const s=fixture('woodlands');try{
   noBarrels(s);const [a,b]=s.game.enemies;a.weapon='rifle';b.weapon='rifle';callback(s);const oldA=a.sourceRig as OriginalSoldier,oldB=b.sourceRig as OriginalSoldier,allocated=s.game.soloModelPresentation.freezeState().allocated;
   expect(s.game.damageSoloEnemy(a,110)).toBe('killed');expect(s.game.damageSoloEnemy(b,110)).toBe('killed');callback(s);for(let i=0;i<75;i++)callback(s);
   expect([oldA,oldB].map(rig=>rig.debugState().deathBon)).toEqual([600,600]);expect(s.game.soloModelPresentation.freezeState()).toMatchObject({fifo:[],corpses:[{handle:oldA.group.uuid},{handle:oldB.group.uuid}]});
   const seen:{event:OriginalSoloEvent;allocated:number;fifo:readonly string[]}[]=[],receive=s.game.receiveSoloWorldEvent.bind(s.game);s.game.receiveSoloWorldEvent=(event:OriginalSoloEvent)=>{receive(event);if(event.recipientId==='player'){const state=s.game.soloModelPresentation.freezeState();seen.push({event,allocated:state.allocated,fifo:state.fifo});}};
   // The next where is accepted at receipt prefix N-1 while both old GIs are
   // still corpses. Callback N then retires them. Neither firing nor final
   // presentation projection may make that future FIFO available to birth.
   replay(s,a,new THREE.Vector3(4000,1000-1.72,4000));if(firing)s.worlds.reportShots(a.id,1);callback(s);
   expect(a.sourceRig).not.toBe(oldA);expect(a.sourceRig).not.toBe(oldB);expect(a.sourceRig.mesh).not.toBe(oldA.mesh);expect(s.game.soloModelPresentation.freezeState()).toMatchObject({allocated:allocated+1,fifo:[oldA.group.uuid,oldB.group.uuid],corpses:[]});
   expect(seen.map(item=>item.event.kind)).toEqual(['baddy-born','corpse-retired','corpse-retired',...(firing?['shot']:[])]);expect(seen[0]).toMatchObject({allocated:allocated+1,fifo:[]});expect([oldA,oldB].map(rig=>rig.debugState().deathBon)).toEqual([608,608]);
  }finally{s.dispose();}
 });
 for(const map of ['barrack','woodlands'] as const)it(`${map}: accepted death uses the same GI mesh/skeleton and gun, while early replay acquires an independent GI`,()=>{
  const s=fixture(map);try{
   noBarrels(s);const enemy=s.game.enemies[0];enemy.weapon='rifle';callback(s);const rig=enemy.sourceRig as OriginalSoldier,mesh=rig.mesh,skeleton=rig.skeleton,gun=rig.getSourceGun('rifle'),allocated=s.game.soloModelPresentation.freezeState().allocated;
   expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');expect(s.game.weaponDrops).toHaveLength(0);s.game.syncSoloMirrors(false);expect(enemy.sourceRig).toBe(rig);callback(s);
   const human=s.worlds.worlds.get('player')!,corpse=human.mirror.freezeCorpses().find(c=>c.ownerId===enemy.id)!,actual=s.game.soloCorpses.get(corpse.sequence) as OriginalSoldier,drop=s.game.weaponDrops[0];
   expect(actual).toBe(rig);expect(actual.mesh).toBe(mesh);expect(actual.skeleton).toBe(skeleton);expect(actual.group.parent).toBe(s.game.scene);expect(enemy.sourceRig).toBeUndefined();expect(drop.sourceModel).toBe(gun);expect(drop.sourceModel.uuid).toBe(gun.uuid);expect(drop.sourceRig).toBe(rig);expect(drop.group.children).toEqual([gun]);expect(gun.parent).toBe(drop.group);
   const point=originalDropPosition({...corpse.position,y:corpse.position.y+s.game.arena.runtime.profile.eyeHeight},s.game.arena.runtime.scale);expect(drop.group.position.toArray()).toEqual([point.x,point.y,point.z]);expect(actual.debugState()).toMatchObject({alive:false,timeMs:3000,deathBon:0});
   expect(corpse.deathBon).toBe(0);const fixed=drop.group.position.clone();replay(s,enemy,new THREE.Vector3(1400,1000-1.72,1040),'pistol');callback(s);
   expect(enemy.sourceRig).not.toBe(rig);expect(enemy.sourceRig.mesh).not.toBe(mesh);expect(enemy.sourceRig.skeleton).not.toBe(skeleton);expect(s.game.soloModelPresentation.freezeState().allocated).toBe(allocated+1);expect(s.game.soloCorpses.get(corpse.sequence)).toBe(rig);expect(rig.debugState()).toMatchObject({alive:false,timeMs:2408,deathBon:8});expect(drop.group.position).toEqual(fixed);expect(drop.sourceModel).toBe(gun);expect(gun.parent).toBe(drop.group);
  }finally{s.dispose();}
 });
 it('retires at callback76 into FIFO, crosses GI ownership between bot IDs, and collects an old pickup alias from a currently held gun',()=>{
  const s=fixture('woodlands');try{
   noBarrels(s);const [a,b]=s.game.enemies;a.weapon='rifle';b.weapon='rifle';callback(s);const rigA=a.sourceRig as OriginalSoldier,rigB=b.sourceRig as OriginalSoldier,gunA=rigA.getSourceGun('rifle'),meshA=rigA.mesh,meshB=rigB.mesh,allocated=s.game.soloModelPresentation.freezeState().allocated,skeletonDispose=vi.spyOn(rigA.skeleton,'dispose');
   expect(s.game.damageSoloEnemy(a,110)).toBe('killed');expect(s.game.damageSoloEnemy(b,110)).toBe('killed');callback(s);const dropA=s.game.weaponDrops.find((drop:any)=>drop.sourceRig===rigA),fixed=dropA.group.position.clone(),corpseA=[...s.game.soloCorpses].find(([,rig])=>rig===rigA)![0];
   for(let i=0;i<75;i++)callback(s);expect(s.game.soloCorpses.get(corpseA)).toBe(rigA);expect(rigA.debugState()).toMatchObject({timeMs:3000,deathBon:600,removed:false});expect(s.game.soloModelPresentation.freezeState().fifo).toEqual([]);callback(s);
   expect(s.game.soloCorpses.size).toBe(0);expect(s.game.soloModelPresentation.freezeState().fifo).toEqual([rigA.group.uuid,rigB.group.uuid]);expect(rigA.debugState()).toMatchObject({timeMs:3008,deathBon:608,removed:true});expect(skeletonDispose).not.toHaveBeenCalled();expect(gunA.parent).toBe(dropA.group);
   replay(s,b,new THREE.Vector3(4000,1000-1.72,4000));callback(s);expect(b.sourceRig).toBe(rigA);expect(b.sourceRig.mesh).toBe(meshA);expect(b.sourceRig.skeleton).toBe(rigA.skeleton);expect(rigA.getSourceGun('rifle')).toBe(gunA);expect(gunA.parent).toBe(rigA.weaponRoot);expect(gunA.visible).toBe(true);expect(dropA.group.position).toEqual(fixed);
   replay(s,a,new THREE.Vector3(4500,1000-1.72,4500));callback(s);expect(a.sourceRig).toBe(rigB);expect(a.sourceRig.mesh).toBe(meshB);expect(s.game.soloModelPresentation.freezeState()).toMatchObject({allocated,fifo:[]});expect(dropA.group.position).toEqual(fixed);
   gunA.updateWorldMatrix(true,false);expect(gunA.getWorldPosition(new THREE.Vector3()).distanceTo(fixed)).toBeGreaterThan(100);
   // Explicit camera teleport isolates the actual pickup reach/collection
   // function from physical travel. The immutable old pickup point wins over
   // the aliased model's new held location and removes that exact handle.
   s.game.camera.position.copy(fixed);s.game.updateWeaponDrops(0,[dropA]);expect(s.game.weaponDrops.includes(dropA)).toBe(false);expect(gunA.parent).toBeNull();expect(gunA.visible).toBe(false);expect(s.game.weaponState.addReserve).toHaveBeenCalledExactlyOnceWith('rifle',ORIGINAL_DROP_AMMO.rifle);
   callback(s);expect(gunA.visible).toBe(false);expect(gunA.parent).toBeNull();b.weapon='pistol';callback(s);b.weapon='rifle';callback(s);expect(rigA.getSourceGun('rifle')).toBe(gunA);expect(gunA.visible).toBe(true);expect(gunA.parent).toBe(rigA.weaponRoot);expect(dropA.group.position).toEqual(fixed);expect(s.game.weaponState.addReserve).toHaveBeenCalledTimes(1);
  }finally{s.dispose();}
 });
 it('full cleanup disposes owned skeletons once and removes dropped/active model instances while borrowing geometry and materials',()=>{
  const s=fixture('barrack');try{
   noBarrels(s);callback(s);const enemy=s.game.enemies[0],rig=enemy.sourceRig as OriginalSoldier,gun=rig.getSourceGun(enemy.weapon),giDispose=vi.spyOn(s.game.originalSoldierResources.geometry,'dispose'),gunDispose=vi.spyOn(gun.geometry,'dispose'),materialDispose=vi.spyOn(gun.material as THREE.Material,'dispose'),skeletonDispose=vi.spyOn(rig.skeleton,'dispose');
   expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');callback(s);expect(gun.parent).toBe(s.game.weaponDrops[0].group);s.game.clearWeaponDrops();s.game.disposeSoloWorlds(false);expect(rig.group.parent).toBeNull();expect(gun.parent).toBeNull();expect(s.game.soloModelPresentation).toBeUndefined();expect(skeletonDispose).toHaveBeenCalledTimes(1);expect(giDispose).not.toHaveBeenCalled();expect(gunDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();s.game.clearEnemies();expect(skeletonDispose).toHaveBeenCalledTimes(1);
  }finally{s.dispose();}
 });
});
