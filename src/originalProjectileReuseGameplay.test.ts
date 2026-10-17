import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalProjectile} from '../shared/originalExplosives';

// CPU integration: real decoded resources and Game ownership/receipt helpers.
// DOM, audio, effect births and prediction rendering are explicit output seams;
// these tests do not establish native collision or browser rendering fidelity.
function fixture(){
 const collection=createOriginalWeapons({geometry:JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData,
  textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});
 const g=Object.create(Game.prototype) as any;
 Object.assign(g,{originalWeapons:collection,archivalWinter:false,phase:'playing',mode:'online',playerAlive:true,elapsed:1,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),
  network:{clientId:'local'},projectiles:[],networkProjectiles:new Map(),pendingNetworkProjectileShots:new Map(),handledNetworkExplosions:new Set(),
  networkEffectCounts:{predictions:0,adoptions:0,explosions:0},enemies:[],originalBlasts:[],soloCorpses:new Map(),soloDetachedFlashes:[],
  originalCombatEffectPresentation:{spawnPuff:vi.fn(),step:vi.fn()},originalExplosionPresentation:{step:vi.fn()},
  renderNetworkProjectilePrediction:vi.fn(),playOriginalCombatSound:vi.fn(),spawnExplosion:vi.fn(),updateHud:vi.fn()});
 return {g,collection,dispose(){g.resetOriginalProjectileModels();g.originalProjectileModelPool?.dispose();collection.dispose();}};
}
function snapshot(weapon:'launcher'|'rpg',id='authority',shotId='shot'){
 const state=createOriginalProjectile(weapon,{x:0,y:5,z:0},{x:1,y:0,z:0},'local');
 return {projectileId:id,shotId,attackerId:'local',weapon,position:{...state.position},velocity:{...state.velocity},direction:{...state.direction},remainingCallbacks:state.remainingCallbacks,expiresAt:5000};
}
function predict(g:any,weapon:'launcher'|'rpg'='launcher',shot='shot'){g.predictNetworkProjectile(shot,weapon,new THREE.Vector3(0,5,0),new THREE.Vector3(1,0,0));return g.networkProjectiles.get(`pending:${shot}`);}

describe('actual Game source projectile model ownership and FIFO',()=>{
 it('borrows canonical GPU resources and ignores released source handles while fallback meshes detach',()=>{
  const f=fixture(),{g,collection}=f;
  try{for(const weapon of ['launcher','rpg'] as const){const mesh=g.createProjectileMesh(weapon),resource=collection.resources.get(weapon==='rpg'?'rpgrocket':'rg6grenade')!;
   const geometry=vi.spyOn(resource.geometry,'dispose'),materials=(Array.isArray(resource.material)?resource.material:[resource.material]).map(material=>vi.spyOn(material,'dispose'));
   expect(mesh.geometry).toBe(resource.geometry);expect(mesh.material).toBe(resource.material);g.scene.add(mesh);g.releaseProjectileMesh(mesh);g.releaseProjectileMesh(mesh);
   expect(mesh.parent).toBeNull();expect(geometry).not.toHaveBeenCalled();for(const material of materials)expect(material).not.toHaveBeenCalled();
   g.scene.add(mesh);g.releaseProjectileMesh(mesh);expect(mesh.parent).toBe(g.scene);mesh.removeFromParent();}
   const procedural=new THREE.Mesh();g.scene.add(procedural);g.releaseProjectileMesh(procedural);expect(procedural.parent).toBeNull();
  }finally{f.dispose();}
 });

 it('reuses local → network → local handles by family, retaining names/scales and resetting the RPG shader on birth',()=>{
  const f=fixture(),{g,collection}=f;const altered=new THREE.MeshBasicMaterial();
  try{const grenade=g.createProjectileMesh('launcher'),rocket=g.createProjectileMesh('rpg');grenade.name='retained-grenade';grenade.scale.set(2,3,4);rocket.name='retained-rocket';rocket.scale.set(4,3,2);rocket.material=altered;
   g.releaseProjectileMesh(grenade);g.releaseProjectileMesh(rocket);
   const network=g.createNetworkProjectileVisual('launcher');expect(network.mesh).toBe(grenade);expect(network.mesh.name).toBe('retained-grenade');expect(network.mesh.scale.toArray()).toEqual([2,3,4]);
   const nextRocket=g.createProjectileMesh('rpg');expect(nextRocket).toBe(rocket);expect(rocket.material).toBe(collection.resources.get('rpgrocket')!.material);expect(rocket.name).toBe('retained-rocket');expect(rocket.scale.toArray()).toEqual([4,3,2]);
   g.releaseProjectileMesh(network.mesh);g.releaseProjectileMesh(nextRocket);const local=g.createProjectileMesh('launcher');expect(local).toBe(grenade);g.releaseProjectileMesh(local);
  }finally{altered.dispose();f.dispose();}
 });

 it('adopts a predicted receipt without returning its lease or changing identity',()=>{
  const f=fixture(),{g}=f;
  try{const pending=predict(g),release=vi.spyOn(g.originalProjectileModelPool,'release');g.reconcileNetworkProjectile(snapshot('launcher'),1000);
   expect(g.networkProjectiles.get('authority')).toBe(pending);expect(g.pendingNetworkProjectileShots.size).toBe(0);expect(g.networkProjectiles.has('pending:shot')).toBe(false);
   expect(release).not.toHaveBeenCalled();expect(g.originalProjectileModelPool.stats().active).toBe(1);expect(g.networkEffectCounts.adoptions).toBe(1);
  }finally{f.dispose();}
 });

 it('preserves pending visuals across absent snapshots and returns timeout/authority cleanup leases exactly once',()=>{
  const f=fixture(),{g}=f;
  try{const pending=predict(g),release=vi.spyOn(g.originalProjectileModelPool,'release');g.reconcileNetworkProjectiles([],1000);expect(release).not.toHaveBeenCalled();
   pending.removeAfter=-Infinity;g.updateNetworkProjectiles(0);g.updateNetworkProjectiles(0);expect(release).toHaveBeenCalledTimes(1);expect(g.pendingNetworkProjectileShots.size).toBe(0);
   g.reconcileNetworkProjectile(snapshot('launcher'),1000);g.reconcileNetworkProjectiles([],1001);g.reconcileNetworkProjectiles([],1002);expect(release).toHaveBeenCalledTimes(2);expect(g.networkProjectiles.size).toBe(0);
  }finally{f.dispose();}
 });

 it('dispatches accepted Solo RPG puff and bang births before returning the projectile',()=>{
  const f=fixture(),{g}=f;
  try{const mesh=g.createProjectileMesh('rpg');g.scene.add(mesh);g.projectiles.push({mesh,soloId:'solo'});g.soloWorlds={worlds:new Map([['player',{lifeGeneration:1}]]),clear:vi.fn()};
   const release=vi.spyOn(g.originalProjectileModelPool,'release');g.receiveSoloWorldEvent({kind:'detonated',recipientId:'player',lifeGeneration:1,launch:{id:'solo',weapon:'rpg'},position:{x:1,y:2,z:3}});
   expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledOnce();expect(g.spawnExplosion).toHaveBeenCalledOnce();expect(release).toHaveBeenCalledExactlyOnceWith(mesh);
   expect(g.originalCombatEffectPresentation.spawnPuff.mock.invocationCallOrder[0]).toBeLessThan(release.mock.invocationCallOrder[0]);expect(g.spawnExplosion.mock.invocationCallOrder[0]).toBeLessThan(release.mock.invocationCallOrder[0]);expect(g.projectiles).toHaveLength(0);
  }finally{f.dispose();}
 });

 it('dispatches online terminal effects before return and deduplicates pending/authority aliases and repeated receipts',()=>{
  const f=fixture(),{g}=f;
  try{const pending=predict(g,'rpg');g.networkProjectiles.set('authority',pending);const release=vi.spyOn(g.originalProjectileModelPool,'release');
   const receipt={type:'explosion',serverTime:1000,data:{projectileId:'authority',shotId:'shot',weapon:'rpg',position:{x:1,y:2,z:3},radius:2}};
   g.handleNetworkEvent(receipt);g.handleNetworkEvent(receipt);
   expect(release).toHaveBeenCalledExactlyOnceWith(pending.mesh);expect(g.spawnExplosion).toHaveBeenCalledOnce();expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledOnce();
   expect(g.spawnExplosion.mock.invocationCallOrder[0]).toBeLessThan(release.mock.invocationCallOrder[0]);expect(g.originalCombatEffectPresentation.spawnPuff.mock.invocationCallOrder[0]).toBeLessThan(release.mock.invocationCallOrder[0]);expect(g.networkProjectiles.size).toBe(0);expect(g.pendingNetworkProjectileShots.size).toBe(0);
  }finally{f.dispose();}
 });

 it('returns all local and network owners before resetting inventory, creating fresh scene identities',()=>{
  const f=fixture(),{g}=f;
  try{const local=g.createProjectileMesh('launcher');g.scene.add(local);g.projectiles.push({mesh:local});const pending=predict(g,'rpg');const pool=g.originalProjectileModelPool,release=vi.spyOn(pool,'release'),reset=vi.spyOn(pool,'reset');
   g.resetOriginalProjectileModels();expect(release).toHaveBeenCalledTimes(2);expect(Math.max(...release.mock.invocationCallOrder)).toBeLessThan(reset.mock.invocationCallOrder[0]);expect(pool.stats()).toEqual({allocated:0,active:0,pooled:0});
   expect(g.originalProjectileModelOwners.size).toBe(0);expect(g.projectiles).toHaveLength(0);expect(g.networkProjectiles.size).toBe(0);expect(g.pendingNetworkProjectileShots.size).toBe(0);expect(pending.mesh.parent).toBeNull();const fresh=g.createProjectileMesh('launcher');expect(fresh).not.toBe(local);g.releaseProjectileMesh(fresh);
  }finally{f.dispose();}
 });

 it('preserves Solo terminal displayed leases until explicit scene cleanup',()=>{
  const f=fixture(),{g}=f;
  try{const mesh=g.createProjectileMesh('launcher');g.scene.add(mesh);g.projectiles.push({mesh,soloId:'solo'});const clear=vi.fn();g.soloWorlds={clear};
   g.disposeSoloWorlds(true);expect(clear).toHaveBeenCalledOnce();expect(mesh.parent).toBe(g.scene);expect(g.originalProjectileModelPool.stats().active).toBe(1);expect(g.projectiles).toHaveLength(1);
   g.disposeSoloWorlds();expect(mesh.parent).toBeNull();expect(g.originalProjectileModelPool.stats().active).toBe(0);expect(g.projectiles).toHaveLength(0);
  }finally{f.dispose();}
 });

 it('retires two same-callback source grenades in birth order and reacquires FIFO oldest first',()=>{
  const f=fixture(),{g}=f;
  try{g.playerAlive=false;const meshes=[g.createProjectileMesh('launcher'),g.createProjectileMesh('launcher')];
   for(const mesh of meshes){const source=createOriginalProjectile('launcher',{x:0,y:5,z:0},{x:1,y:0,z:0},'local');source.remainingCallbacks=2;g.scene.add(mesh);g.projectiles.push({mesh,source,velocity:new THREE.Vector3()});}
   const release=vi.spyOn(g.originalProjectileModelPool,'release');g.updateOriginalExplosives(true);
   expect(release.mock.calls.map((call:unknown[])=>call[0])).toEqual(meshes);expect(g.projectiles).toHaveLength(0);expect(g.spawnExplosion).toHaveBeenCalledTimes(2);
   const first=g.createProjectileMesh('launcher'),second=g.createProjectileMesh('launcher');expect(first).toBe(meshes[0]);expect(second).toBe(meshes[1]);g.releaseProjectileMesh(first);g.releaseProjectileMesh(second);
  }finally{f.dispose();}
 });
});
