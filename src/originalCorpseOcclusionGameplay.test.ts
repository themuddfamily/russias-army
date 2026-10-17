import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {WEAPONS,WeaponState,type WeaponId} from './weapons';

const assets=new URL('../public/assets/',import.meta.url);
function resources(){return createOriginalSoldierResources({geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',assets),'utf8')) as OriginalSoldierAssets['geometry'],rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',assets),'utf8')) as OriginalSoldierAssets['rigMotion'],texture:new THREE.Texture()},
 {geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',assets),'utf8')) as OriginalWeaponGeometryData,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});}
const state:RemoteState={id:'same-owner',name:'OWNER',x:0,y:0,z:0,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true,sourceMotionTime:0};
/** Pick a real posed GI surface, without replacing its geometry or raycaster. */
function surface(mesh:THREE.SkinnedMesh):THREE.Vector3 {
 mesh.updateWorldMatrix(true,false);const positions=mesh.geometry.getAttribute('position'),faces=mesh.geometry.index!;
 for(let face=0;face<faces.count;face+=3){
  const center=new THREE.Vector3();for(let corner=0;corner<3;corner++){const index=faces.getX(face+corner);center.add(mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(positions,index)).applyMatrix4(mesh.matrixWorld));}center.multiplyScalar(1/3);
  const hits=new THREE.Raycaster(center.clone().add(new THREE.Vector3(0,0,10)),new THREE.Vector3(0,0,-1),0,30).intersectObject(mesh,false);
  if(hits.length)return hits[0].point.clone();
 }
 throw new Error('No source GI surface visible along the declared fixture ray');
}
function fixture(map='woodlands',weapon:WeaponId='pistol'){
 const r=resources(),corpse=new RemotePlayer(state.id,state.name,undefined,r,true),fresh=new RemotePlayer(state.id,'FRESH',undefined,r,true),scene=new THREE.Scene();
 scene.add(corpse.group,fresh.group);corpse.apply(state,true);corpse.apply({...state,alive:false,health:0});expect(corpse.update(1/30,undefined,1)?.reason).toBe('death');
 fresh.apply({...state,name:'FRESH'},true);
 const point=surface(corpse.hitMeshes[0] as THREE.SkinnedMesh),alivePoint=surface(fresh.hitMeshes[0] as THREE.SkinnedMesh);
 const delta=point.clone().add(new THREE.Vector3(0,0,-5)).sub(alivePoint);fresh.apply({...state,name:'FRESH',x:delta.x,y:delta.y,z:delta.z},true);
 const camera=new THREE.PerspectiveCamera();camera.position.copy(point).add(new THREE.Vector3(0,0,10));
 const g=Object.create(Game.prototype) as any;
 Object.assign(g,{mapId:map,archivalWinter:false,mode:'online',phase:'playing',camera,scene,weaponState:new WeaponState(map),keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,elapsed:0,
  remotePlayers:new Map([[state.id,fresh]]),sourceTimeoutCorpses:new Set([corpse]),enemies:[],raycaster:new THREE.Raycaster(),
  flushOriginalReconciliation:vi.fn(),raycastWorld:vi.fn(()=>({distance:100,normal:{x:0,y:1,z:0}})),surfaceNormalAt:vi.fn(()=>new THREE.Vector3(0,1,0)),
  network:{shoot:vi.fn(()=>'corpse-shot'),hit:vi.fn()},spawnTracer:vi.fn(),snowTracks:{resetActor:vi.fn()},appendChat:vi.fn(),playOriginalCombatSound:vi.fn(),
  originalCombatEffectPresentation:{spawnBlood:vi.fn(),spawnMiss:vi.fn()}});
 g.weaponState.select(weapon);
 const hits=new THREE.Raycaster(camera.position,new THREE.Vector3(0,0,-1)).intersectObjects([...corpse.hitMeshes,...fresh.hitMeshes],false);
 expect(hits[0].object).toBe(corpse.hitMeshes[0]);expect(hits.some(hit=>hit.object===fresh.hitMeshes[0])).toBe(true);
 return {g,r,corpse,fresh,hit:hits[0],dispose:()=>{g.clearRemotePlayers();r.dispose();}};
}
afterEach(()=>vi.restoreAllMocks());

describe('actual Game source corpse ray occlusion',()=>{
 for(const map of ['barrack','woodlands'])for(const [weapon,rays] of [['pistol',1],['shotgun',2]] as const)it(`${map} ${weapon} treats a nearer same-ID corpse as a miss and never hits the fresh actor behind it`,()=>{
  const s=fixture(map,weapon);
  try{
   expect(s.g.hitscan(WEAPONS[weapon])).toBe(true);expect(s.g.network.shoot).toHaveBeenCalledTimes(1);expect(s.g.pendingSourceShot).toBe('corpse-shot');expect(s.g.network.hit).not.toHaveBeenCalled();
   expect(s.g.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();expect(s.g.originalCombatEffectPresentation.spawnMiss).toHaveBeenCalledTimes(rays);
   const [point,normal,shotgun]=s.g.originalCombatEffectPresentation.spawnMiss.mock.calls[0];
   expect(point.distanceTo(s.hit.point)).toBeLessThan(1e-10);expect(shotgun).toBe(weapon==='shotgun');
   const expected=s.hit.face!.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(s.hit.object.matrixWorld)).normalize();expect(normal.distanceTo(expected)).toBeLessThan(1e-10);
   expect(s.g.spawnTracer.mock.calls[0][0].distanceTo(s.hit.point)).toBeLessThan(1e-10);expect(s.fresh.health).toBe(100);expect(s.fresh.alive).toBe(true);
  }finally{s.dispose();}
 });

 it('a static surface nearer than the corpse wins the ordinary ray comparison',()=>{
  const s=fixture(),normal={x:0,y:1,z:0};s.g.raycastWorld.mockReturnValue({distance:1,normal});
  try{
   expect(s.g.hitscan(WEAPONS.pistol)).toBe(true);expect(s.g.network.hit).not.toHaveBeenCalled();expect(s.g.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();
   const expected=s.g.camera.position.clone().add(new THREE.Vector3(0,0,-1));expect(s.g.originalCombatEffectPresentation.spawnMiss).toHaveBeenCalledTimes(1);
   expect(s.g.originalCombatEffectPresentation.spawnMiss.mock.calls[0][0].distanceTo(expected)).toBeLessThan(1e-10);
   expect(s.g.raycastWorld).toHaveBeenCalledTimes(1);expect(s.g.surfaceNormalAt).not.toHaveBeenCalled();
   expect(s.g.originalCombatEffectPresentation.spawnMiss.mock.calls[0][1].toArray()).toEqual([normal.x,normal.y,normal.z]);
  }finally{s.dispose();}
 });

 it('ordinary corpse removal releases the ray to the living same-ID actor',()=>{
  const s=fixture();let now=5000;vi.spyOn(performance,'now').mockImplementation(()=>now);s.g.resetSourceRemoteView({epoch:1000,generation:1});
  try{
   s.g.hitscan(WEAPONS.pistol);expect(s.g.network.hit).not.toHaveBeenCalled();
   for(let callback=1;callback<=76;callback++){now=5000+callback*1000/30;s.g.advanceSourceRemoteView();}
   expect(s.g.sourceTimeoutCorpses.size).toBe(0);expect(s.corpse.group.parent).toBeNull();expect(s.g.remotePlayers.get(state.id)).toBe(s.fresh);
   s.g.originalCombatEffectPresentation.spawnBlood.mockClear();s.g.originalCombatEffectPresentation.spawnMiss.mockClear();
   expect(s.g.hitscan(WEAPONS.pistol)).toBe(true);expect(s.g.network.hit).toHaveBeenCalledExactlyOnceWith({shotId:'corpse-shot',targetId:state.id});
   expect(s.g.originalCombatEffectPresentation.spawnBlood).toHaveBeenCalledTimes(1);expect(s.g.originalCombatEffectPresentation.spawnMiss).not.toHaveBeenCalled();
  }finally{s.dispose();}
 });
});
