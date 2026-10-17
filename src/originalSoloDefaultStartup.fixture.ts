import {IDBFactory} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {presentationFixture} from './originalSoloLoadedScenePresentation.fixture';
import {ORIGINAL_WEAPON_TEXTURES} from './originalWeapons';
import type {OriginalDoorTracks} from '../shared/originalDoorWorld';

const maps=['barrack','woodlands'] as const;
const tracks=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks;

export function startup(map:typeof maps[number],options:{paged?:boolean}={}) {
 const f=presentationFixture(map);
 // Remove the configured fixture's coordinator and factory. The invocation
 // under test acquires fresh startup resources and its selected scene factory.
 f.game.disposeSoloWorlds(false);f.worlds.clear();f.factory.release();
 const textures=new Map<string,THREE.Texture>();
 for(const name of ORIGINAL_WEAPON_TEXTURES){
  const resource=name==='mfmachinegun'?'mfak47':name,material=f.collection.resources.get(resource)!.material as THREE.MeshBasicMaterial;
  textures.set(name,material.map!);
 }
 Object.assign(f.game,{velocity:new THREE.Vector3(),health:100,score:0,goldScore:0,originalFlashes:[],
  originalMaps:{[map]:{doorTracks:map==='barrack'?tracks:{version:1,doors:[]}}},
  originalWeaponAssets:{geometry:f.resourcesForTestWeaponGeometry,textures}});
 f.game.arena.barrelWorld=f.player.barrels;f.game.arena.doorWorld=f.player.doors;
 // Restore borrowed local resources to the real gameplay view root and update
 // their matrices before production captures its fresh seven-model seed.
 for(const group of f.collection.models.values())f.viewModel.add(group);
 f.viewModel.updateMatrixWorld(true);
 if(options.paged){
  // Node-only storage injection; production keeps the actual Game entry point.
  f.game.soloPickupStorageFactory=new IDBFactory();
 }else{
  // Retained synchronous inline CPU oracle. This deliberately bypasses the
  // production paged bootstrap and cannot prove normal default acceptance.
  f.game.ensureSoloWorlds=()=>f.game.createSoloWorldsSync();
 }
 return f;
}
export function prepare(game:any,worlds:any,time:number){
 game.elapsed=time;worlds.physics(time,{skipIds:new Set([...worlds.worlds.keys()])});
 for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);
}
export function cycle(game:any,worlds:any,time:number){prepare(game,worlds,time);worlds.completeGoody(time);game.completeSoloActors();}

/** Actual Game CURRENT/actor methods; solver, authored-projectile and scope
 * tails are excluded from this decoded-resource CPU acceptance fixture. */
export async function asyncCycle(game:any,worlds:any,time:number){
 game.elapsed=time;worlds.physics(time,{skipIds:new Set([...worlds.worlds.keys()])});
 for(const world of worlds.worlds.values())if(world.alive&&world.id!=='player'&&!game.enemies.some((enemy:any)=>enemy.id===world.id))worlds.goody(world.id);
 const frame={worlds,generation:game.originalActorDispatchGeneration??0,time,activeProjectiles:Object.freeze([]),stage:'delivery'} as any;
 game.soloPendingGameplayFrame=frame;game.completeSoloGoody();await frame.deliveryWork;
 game.completeSoloActors();
 if(game.soloPendingGameplayFrame===frame)game.soloPendingGameplayFrame=undefined;
}
