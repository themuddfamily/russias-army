import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {WEAPONS,WeaponState} from './weapons';

const base=new URL('../public/assets/',import.meta.url);
function resources(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const r=createOriginalSoldierResources({geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')),texture} as OriginalSoldierAssets,
  {geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures});
 return {r,dispose(){r.dispose();texture.dispose();for(const item of textures.values())item.dispose();}};
}
function harness(map:'barrack'|'woodlands',weapon:'pistol'|'shotgun',bots=1){
 const owned=resources(),g=Object.create(Game.prototype) as any,camera=new THREE.PerspectiveCamera(),weaponState=new WeaponState(map);weaponState.select(weapon);
 Object.assign(g,{mapId:map,mode:'solo',archivalWinter:false,phase:'playing',playerAlive:true,elapsed:10,keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,
  camera,weaponState,scene:new THREE.Scene(),enemies:[],originalSoldierResources:owned.r,
  arena:{spawnPoints:[new THREE.Vector3(),...Array.from({length:bots},(_,i)=>new THREE.Vector3(i*5,0,-5))]},
  raycaster:new THREE.Raycaster(),hits:0,kills:0,score:0,tracerSequence:0,
  audio:{play:vi.fn(),playOriginalSound:vi.fn()},flushOriginalReconciliation:vi.fn(),raycastWorld:vi.fn(()=>null),distanceToWorld:vi.fn(()=>100),
  showHitmarker:vi.fn(),spawnTracer:vi.fn(),spawnImpact:vi.fn(),dropWeapon:vi.fn(),addKillFeed:vi.fn(),setMessage:vi.fn(),updateHud:vi.fn(),
  originalCombatEffectPresentation:{spawnBlood:vi.fn(),spawnMiss:vi.fn()}});
 // Instantiate the private Enemy through its actual Game population path.
 g.spawnEnemies();
 return {g,dispose(){g.clearEnemies();owned.dispose();}};
}
function aimAtActualSkin(g:any,enemy:any):void {
 const mesh=enemy.hitMeshes[0] as THREE.SkinnedMesh;mesh.updateWorldMatrix(true,false);
 const indices=mesh.geometry.index!;
 for(let i=0;i<indices.count;i+=3){
  const points=[0,1,2].map(j=>mesh.getVertexPosition(indices.getX(i+j),new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  const normal=THREE.Triangle.getNormal(points[0],points[1],points[2],new THREE.Vector3());if(normal.lengthSq()===0)continue;
  const center=points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1/3),origin=center.clone().addScaledVector(normal,2),direction=normal.negate();
  if(new THREE.Raycaster(origin,direction,0,10).intersectObject(mesh,false).length===0)continue;
  g.camera.position.copy(origin);g.camera.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);return;
 }
 throw Error('No finite GI triangle witness for death audio fixture');
}
const soundNames=(g:any)=>g.audio.playOriginalSound.mock.calls.map((call:unknown[])=>call[0]);
afterEach(()=>vi.restoreAllMocks());

describe('actual Game damage and recovered fadeaway birth audio ownership',()=>{
 // Recovered baddies.hurt plays hurt; baddies.die constructs fadeaway, whose
 // constructor separately plays hurt. SPAS invokes hurt once per source ray.
 for(const map of ['barrack','woodlands'] as const)for(const [weapon,damage,rays] of [['pistol',12,1],['shotgun',36,2]] as const){
  it(`${map} ${weapon} lethal actual GI hitscan retains per-ray hurt plus one fadeaway hurt`,()=>{
   const s=harness(map,weapon),victim=s.g.enemies[0];
   try{
    victim.health=damage;aimAtActualSkin(s.g,victim);const applied=vi.spyOn(victim,'damage');
    expect(s.g.hitscan(WEAPONS[weapon])).toBe(true);expect(applied).toHaveBeenCalledExactlyOnceWith(damage,10);
    expect(victim.alive).toBe(false);expect(victim.deaths).toBe(1);expect(s.g.kills).toBe(1);expect(s.g.score).toBe(30);
    expect(soundNames(s.g)).toEqual(Array(rays+1).fill('hurt'));expect(s.g.audio.play).not.toHaveBeenCalled();
    expect(s.g.dropWeapon).toHaveBeenCalledExactlyOnceWith(victim);
    // A retired Enemy cannot emit another damage or fade birth on a later ray.
    s.g.hitscan(WEAPONS[weapon]);expect(applied).toHaveBeenCalledOnce();expect(soundNames(s.g)).toHaveLength(rays+1);expect(victim.deaths).toBe(1);
   }finally{s.dispose();}
  });
  it(`${map} ${weapon} nonlethal actual GI hitscan emits only its per-ray hurt`,()=>{
   const s=harness(map,weapon),victim=s.g.enemies[0];
   try{
    victim.health=damage+1;aimAtActualSkin(s.g,victim);const applied=vi.spyOn(victim,'damage');
    s.g.hitscan(WEAPONS[weapon]);expect(applied).toHaveBeenCalledExactlyOnceWith(damage,10);
    expect(victim.health).toBe(1);expect(victim.alive).toBe(true);expect(victim.deaths).toBe(0);expect(s.g.kills).toBe(0);
    expect(soundNames(s.g)).toEqual(Array(rays).fill('hurt'));expect(s.g.dropWeapon).not.toHaveBeenCalled();
   }finally{s.dispose();}
  });
 }
 for(const map of ['barrack','woodlands'] as const)it(`${map} actual bot lethal damage retains one hurt and one fadeaway birth after its firing sample`,()=>{
  const s=harness(map,'pistol',2),shooter=s.g.enemies[0],victim=s.g.enemies[1];
  try{
   victim.health=12;vi.spyOn(Math,'random').mockReturnValue(0);const applied=vi.spyOn(victim,'damage'),origin=shooter.group.position.clone().add(new THREE.Vector3(0,1.72,0));
   s.g.combatantShoot(shooter,victim,origin,12);expect(applied).toHaveBeenCalledExactlyOnceWith(12,10);
   expect(soundNames(s.g)).toEqual(['gunfire','hurt','hurt']);expect(victim.alive).toBe(false);expect(victim.deaths).toBe(1);expect(shooter.frags).toBe(1);
   expect(s.g.dropWeapon).toHaveBeenCalledExactlyOnceWith(victim);
   s.g.combatantShoot(shooter,victim,origin,12);expect(applied).toHaveBeenCalledOnce();expect(soundNames(s.g)).toEqual(['gunfire','hurt','hurt']);
  }finally{s.dispose();}
 });
});
