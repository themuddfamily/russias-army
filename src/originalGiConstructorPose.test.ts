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
 // Real Enemy construction and Game birth dispatcher/registry methods run.
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
afterEach(()=>vi.restoreAllMocks());

function bundle(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),resources=createOriginalSoldierResources({geometry:read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'],rigMotion:read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'],texture},{geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures});
 return {resources,dispose(){resources.dispose();texture.dispose();for(const value of textures.values())value.dispose();}};
}
const world=(node:THREE.Object3D)=>{node.updateWorldMatrix(true,false);return node.matrixWorld.clone();};
const same=(actual:THREE.Matrix4,expected:THREE.Matrix4)=>{for(let i=0;i<16;i++)expect(actual.elements[i]).toBeCloseTo(expected.elements[i],9);};
const anchor=(feet:{x:number;y:number;z:number})=>new THREE.Vector3(feet.x+4*ORIGINAL_MAP_SCALE,feet.y+160*ORIGINAL_MAP_SCALE,feet.z);
const bones=(rig:OriginalSoldier)=>rig.bones.map(b=>({p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()}));
const expectedGun=(bone:THREE.Matrix4)=>{
 const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();bone.decompose(p,q,s);q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,170*Math.PI/180,10*Math.PI/180,'ZYX')));p.add(new THREE.Vector3(0,-3*ORIGINAL_MAP_SCALE,0).applyQuaternion(q));return new THREE.Matrix4().compose(p,q,new THREE.Vector3(1,1,1));
};
function rigFixture(){const s=bundle(),rig=new OriginalSoldier(s.resources,{weapon:'rpg'}),parent=new THREE.Group();parent.add(rig.group);return {...s,rig,parent,dispose(){rig.dispose();s.dispose();}};}

describe('GI constructor presentation pose (imported CPU resources; accepted feet are injected)',()=>{
 it('places the WORLD anchor along source world X under a rotated parent while retaining full WORLD rotation, scale and bones',()=>{
  const s=rigFixture();try{
   s.parent.position.set(-4,7,9);s.parent.quaternion.setFromEuler(new THREE.Euler(.4,-.7,.2,'ZYX'));s.parent.scale.set(1.2,2.1,.8);s.rig.group.quaternion.setFromEuler(new THREE.Euler(-.2,.6,.8,'XYZ'));s.rig.setSourceMotionTime(470);
   const before=world(s.rig.nativeRoot),retained=bones(s.rig),phase=s.rig.debugState().timeMs,feet={x:20,y:3,z:-8};
   const sample=vi.spyOn(s.rig as unknown as {sampleMotion(seconds:number):void},'sampleMotion');s.rig.prepareSourceBirthPose(feet);
   same(world(s.rig.nativeRoot),before.clone().setPosition(anchor(feet)));expect(bones(s.rig)).toEqual(retained);expect(s.rig.debugState().timeMs).toBe(phase);expect(sample).not.toHaveBeenCalled();
  }finally{s.dispose();}
 });
 it('copies getter-backed accepted feet and never follows later caller mutation',()=>{
  const s=rigFixture();try{
   const backing={x:8,y:6,z:4},feet={get x(){return backing.x;},get y(){return backing.y;},get z(){return backing.z;}};s.rig.prepareSourceBirthPose(feet);const expected=world(s.rig.nativeRoot);backing.x=999;backing.y=-999;s.rig.refreshSourcePresentation();same(world(s.rig.nativeRoot),expected);expect(s.rig.nativeRoot.getWorldPosition(new THREE.Vector3()).distanceTo(anchor({x:8,y:6,z:4}))).toBeLessThan(1e-10);
  }finally{s.dispose();}
 });
 it('pure parent/root movement rebases pending constructor WORLD and retained gun without sampling, orienting or advancing phase',()=>{
  const s=rigFixture();try{
   s.rig.prepareSourceBirthPose({x:10,y:5,z:2});const native=world(s.rig.nativeRoot),gun=world(s.rig.weaponRoot),bone=world(s.rig.bones[22]),phase=s.rig.debugState().timeMs;
   const sample=vi.spyOn(s.rig as unknown as {sampleMotion(seconds:number):void},'sampleMotion'),orient=vi.spyOn(s.rig as unknown as {updateGunPose():void},'updateGunPose');s.parent.position.set(-20,12,5);s.parent.quaternion.setFromEuler(new THREE.Euler(.5,.7,-.4));s.rig.group.position.set(50,60,70);s.rig.group.quaternion.setFromEuler(new THREE.Euler(-.6,.2,.9));
   for(let i=0;i<3;i++)s.rig.refreshSourcePresentation();same(world(s.rig.nativeRoot),native);same(world(s.rig.bones[22]),bone);same(world(s.rig.weaponRoot),gun);expect(s.rig.debugState().timeMs).toBe(phase);expect(sample).not.toHaveBeenCalled();expect(orient).not.toHaveBeenCalled();
  }finally{s.dispose();}
 });
 it('first advancing callback orients from constructor bone WORLD then restores standing basis before later bone sampling',()=>{
  const s=rigFixture();try{
   s.rig.group.quaternion.setFromEuler(new THREE.Euler(.3,-.8,.5));s.rig.prepareSourceBirthPose({x:20,y:7,z:-4});const birthBone=world(s.rig.bones[22]);s.parent.position.set(3,5,8);s.rig.group.position.set(-10,2,6);s.rig.refreshSourcePresentation();s.rig.animate(1/30);
   same(world(s.rig.weaponRoot),expectedGun(birthBone));expect(s.rig.nativeRoot.position.toArray()).toEqual([0,55*ORIGINAL_MAP_SCALE,0]);const basis=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));expect(s.rig.nativeRoot.quaternion.toArray()).toEqual(basis.toArray());
   const ordinaryBone=world(s.rig.bones[22]);s.rig.animate(1/30);same(world(s.rig.weaponRoot),expectedGun(ordinaryBone));
  }finally{s.dispose();}
 });
 it('recycled phase3008 bones survive birth without resampling and feed the first callback while scalar phase resets to zero',()=>{
  const s=rigFixture();try{
   s.rig.beginSourceFadeaway();s.rig.setSourceMotionTime(3008);const retained=bones(s.rig);s.rig.prepareSourceReuse('recycled');const sample=vi.spyOn(s.rig as unknown as {sampleMotion(seconds:number):void},'sampleMotion');s.rig.prepareSourceBirthPose({x:30,y:8,z:9});const birthBone=world(s.rig.bones[22]);expect(bones(s.rig)).toEqual(retained);expect(s.rig.debugState()).toMatchObject({alive:true,timeMs:0,deathBon:0});expect(sample).not.toHaveBeenCalled();s.rig.animate(1/30);same(world(s.rig.weaponRoot),expectedGun(birthBone));
  }finally{s.dispose();}
 });
 it('rejects malformed feet before mutation and clears pending constructor state on reset, reuse and disposal',()=>{
  const s=rigFixture();try{
   s.rig.prepareSourceBirthPose({x:5,y:6,z:7});const prior=world(s.rig.nativeRoot),before=bones(s.rig);for(const feet of [{x:NaN,y:0,z:0},{x:0,y:Infinity,z:0},{x:0,y:0,z:-Infinity}])expect(()=>s.rig.prepareSourceBirthPose(feet)).toThrow();same(world(s.rig.nativeRoot),prior);expect(bones(s.rig)).toEqual(before);
   const local=s.rig.nativeRoot.matrix.clone();s.parent.scale.x=0;expect(()=>s.rig.prepareSourceBirthPose({x:1,y:2,z:3})).toThrow();same(s.rig.nativeRoot.matrix,local);s.parent.scale.x=1;s.rig.refreshSourcePresentation();same(world(s.rig.nativeRoot),prior);
   for(const clear of [()=>s.rig.reset(),()=>s.rig.prepareSourceReuse()]){s.rig.prepareSourceBirthPose({x:5,y:6,z:7});clear();const cleared=world(s.rig.nativeRoot);s.parent.position.x+=20;s.rig.refreshSourcePresentation();expect(s.rig.nativeRoot.matrixAutoUpdate).toBe(true);expect(s.rig.nativeRoot.position.y).toBe(55*ORIGINAL_MAP_SCALE);expect(s.rig.nativeRoot.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(new THREE.Vector3().setFromMatrixPosition(cleared).x+20,9);}
   s.rig.prepareSourceBirthPose({x:5,y:6,z:7});s.rig.dispose();expect(()=>s.rig.refreshSourcePresentation()).not.toThrow();expect(()=>s.rig.prepareSourceBirthPose({x:0,y:0,z:0})).toThrow();
  }finally{s.dispose();}
 });
 for(const map of ['barrack','woodlands'] as const){
  it(`${map}: actual Game accepted birth updates the already registered initial GI without reuse or bone sampling`,()=>{
   const s=fixture(map);try{
    const enemy=s.game.enemies[0],rig=enemy.sourceRig as OriginalSoldier,feet={x:80,y:9,z:-30},reuse=vi.spyOn(rig,'prepareSourceReuse'),sample=vi.spyOn(rig as unknown as {sampleMotion(seconds:number):void},'sampleMotion');
    // Receipt dispatcher is invoked directly to inspect constructor placement
    // before its first callback. Accepted feet are an explicit authority seam.
    s.game.receiveSoloWorldEvent({kind:'baddy-born',recipientId:'player',lifeGeneration:s.worlds.worlds.get('player')!.lifeGeneration,ownerId:enemy.id,position:feet});
    expect(enemy.sourceRig).toBe(rig);expect(rig.nativeRoot.getWorldPosition(new THREE.Vector3()).distanceTo(anchor(feet))).toBeLessThan(1e-9);expect(reuse).not.toHaveBeenCalled();expect(sample).not.toHaveBeenCalled();
   }finally{s.dispose();}
  });
  it(`${map}: actual Game acquires a retired cross-bot GI and applies constructor placement after attachment`,()=>{
   const s=fixture(map);try{
    const [a,b]=s.game.enemies,rig=a.sourceRig as OriginalSoldier,registry=s.game.soloModelPresentation;registry.bindCorpse(a.id,1);a.releaseSourceRig();registry.retire(1);registry.bindCorpse(b.id,2);b.releaseSourceRig();const mesh=rig.mesh,skeleton=rig.skeleton,retained=bones(rig),feet={x:120,y:11,z:40};
    // Direct registry retirement isolates the FIFO/constructor presentation
    // seam; this does not establish native fade scheduling or grounding.
    const acquired=s.game.ensureSourceSoloRig(b,feet);expect(acquired).toBe(rig);expect(b.sourceRig).toBe(rig);expect(rig.mesh).toBe(mesh);expect(rig.skeleton).toBe(skeleton);expect(rig.nativeRoot.getWorldPosition(new THREE.Vector3()).distanceTo(anchor(feet))).toBeLessThan(1e-9);expect(bones(rig)).toEqual(retained);expect(rig.debugState().timeMs).toBe(0);
   }finally{s.dispose();}
  });
 }
});
