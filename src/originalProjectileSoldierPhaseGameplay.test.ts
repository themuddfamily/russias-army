import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {originalFireSound} from './originalCombatAudio';
import type {ProjectileSnapshot} from './network';

const assets=new URL('../public/assets/',import.meta.url);
function resources(){
 const gi=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const r=createOriginalSoldierResources({geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',assets),'utf8')) as OriginalSoldierAssets['geometry'],rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',assets),'utf8')) as OriginalSoldierAssets['rigMotion'],texture:gi},
  {geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',assets),'utf8')) as OriginalWeaponGeometryData,textures});
 return {r,dispose(){r.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
function setup(map:'barrack'|'woodlands'|'winter',weapon:RemoteState['weapon']){
 const owned=map==='winter'?undefined:resources(),remote=new RemotePlayer('remote','REMOTE',undefined,owned?.r,true);
 const state:RemoteState={id:'remote',name:'REMOTE',x:2,y:0,z:3,yaw:.4,pitch:0,health:100,frags:0,deaths:0,weapon,alive:true,sourceMotionTime:440};remote.apply(state,true);
 const geometry=new THREE.BoxGeometry(.1,.1,.1),material=new THREE.MeshBasicMaterial(),g=Object.create(Game.prototype) as any;
 Object.assign(g,{mapId:map,archivalWinter:map==='winter',phase:'playing',scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),network:{clientId:'local'},remotePlayers:new Map([['remote',remote]]),
  networkProjectiles:new Map(),pendingNetworkProjectileShots:new Map(),handledNetworkExplosions:new Set(),handledNetworkProjectileSpawns:new Set(),handledNetworkShots:new Set(),
  networkEffectCounts:{predictions:0,adoptions:0,projectileSpawns:0},projectileRocketGeometry:geometry,projectileShellGeometry:geometry,projectileShellMaterial:material,
  updateHud:vi.fn(),audio:{play:vi.fn()},playOriginalCombatSound:vi.fn(),spawnNetworkTracer:vi.fn(),sweepOriginalProjectile:vi.fn(()=>null),sweepOriginalConvex:vi.fn(()=>null)});
 g.scene.add(remote.group);
 return {g,remote,dispose(){remote.dispose();for(const visual of g.networkProjectiles.values())visual.mesh.removeFromParent();geometry.dispose();material.dispose();owned?.dispose();}};
}
function packet(weapon:'launcher'|'rpg',attackerId='remote'):ProjectileSnapshot{return {projectileId:'projectile',shotId:'launch',attackerId,weapon,position:{x:2,y:2,z:3},velocity:{x:0,y:8,z:0},direction:{x:0,y:1,z:0},...(weapon==='rpg'?{sourceRotation:{x:90,y:0,z:0}}:{}),remainingCallbacks:weapon==='rpg'?200:60,expiresAt:9000};}
function flashes(remote:RemotePlayer){let count=0;remote.group.traverse(object=>{if(object.name==='original-GI-shot-flash')count++;});return count;}

describe('actual Game separates projectile receipt from baddie shoot',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const)it(`${map} ${weapon} spawns and sounds once without changing the registered GI phase`,()=>{
  const s=setup(map,weapon);
  try{
   const before=s.remote.debugState(),projectile=packet(weapon),event={type:'projectile_spawned',serverTime:1000,data:{projectile}};
   s.g.handleNetworkEvent(event);
   expect(s.remote.debugState()).toEqual(before);expect(flashes(s.remote)).toBe(0);
   const visual=s.g.networkProjectiles.get(projectile.projectileId);expect(visual.source.weapon).toBe(weapon);expect(visual.source.remainingCallbacks).toBe(projectile.remainingCallbacks);
   expect(s.g.networkEffectCounts.projectileSpawns).toBe(1);expect(s.g.playOriginalCombatSound).toHaveBeenCalledTimes(1);
   expect(s.g.playOriginalCombatSound.mock.calls[0][0]).toBe(originalFireSound(weapon));expect(s.g.playOriginalCombatSound.mock.calls[0][2]).toBe(7);
   s.g.handleNetworkEvent(event);expect(s.g.networkProjectiles.size).toBe(1);expect(s.g.networkProjectiles.get(projectile.projectileId)).toBe(visual);
   expect(s.g.networkEffectCounts.projectileSpawns).toBe(1);expect(s.g.playOriginalCombatSound).toHaveBeenCalledTimes(1);expect(s.remote.debugState()).toEqual(before);
  }finally{s.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s retains actual hitscan shoot phase and muzzle with receipt deduplication',map=>{
  const s=setup(map,'rifle');
  try{
   const before=s.remote.debugState(),event={type:'shot',serverTime:1000,data:{playerId:'remote',shot:{shotId:'bullet',weapon:'rifle',origin:{x:2,y:2,z:3},direction:{x:0,y:0,z:1}}}};
   s.g.handleNetworkEvent(event);expect(s.remote.debugState().original!.timeMs).toBe(2000);expect(s.remote.debugState().sourceMotionTime).toBe(2000);
   expect(s.remote.debugState().sourceMovement).toEqual(before.sourceMovement);expect(flashes(s.remote)).toBe(1);expect(s.g.spawnNetworkTracer).toHaveBeenCalledTimes(1);expect(s.g.playOriginalCombatSound).toHaveBeenCalledTimes(1);
   s.g.handleNetworkEvent(event);expect(flashes(s.remote)).toBe(1);expect(s.g.spawnNetworkTracer).toHaveBeenCalledTimes(1);expect(s.g.playOriginalCombatSound).toHaveBeenCalledTimes(1);
  }finally{s.dispose();}
 });
 it.each(['launcher','rpg'] as const)('Winter %s preserves the existing authored soldier fire presentation',weapon=>{
  const s=setup('winter',weapon),fire=vi.spyOn(s.remote,'fire');
  try{const event={type:'projectile_spawned',serverTime:1000,data:{projectile:packet(weapon)}};s.g.handleNetworkEvent(event);s.g.handleNetworkEvent(event);
   expect(fire).toHaveBeenCalledTimes(1);expect(s.g.audio.play).toHaveBeenCalledExactlyOnceWith('shot',.28);expect(s.g.networkProjectiles.size).toBe(1);expect(s.g.networkEffectCounts.projectileSpawns).toBe(1);
  }finally{s.dispose();}
 });
 it('a local authoritative projectile receipt adds no remote shoot or duplicate launch sound',()=>{
  const s=setup('woodlands','rpg'),fire=vi.spyOn(s.remote,'fire');
  try{s.g.handleNetworkEvent({type:'projectile_spawned',serverTime:1000,data:{projectile:packet('rpg','local')}});expect(fire).not.toHaveBeenCalled();expect(s.g.playOriginalCombatSound).not.toHaveBeenCalled();expect(s.g.networkProjectiles.size).toBe(1);}
  finally{s.dispose();}
 });
});
