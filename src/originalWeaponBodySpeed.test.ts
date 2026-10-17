import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from './game';
import {OriginalWeaponPresentation,ORIGINAL_WEAPON_POSES,ORIGINAL_WEAPON_UNIT_SCALE as S} from './originalWeaponPresentation';
import {ORIGINAL_PLAYER_DERIVATIVE_FACTOR} from '../shared/originalPlayerPhysics';
import {getOriginalMapRuntime,registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {OriginalSceneData} from '../shared/originalSceneGeometry';
import {createOriginalScope} from './originalScope';
import type {LegacyMapId} from '../shared/legacyMaps';

// Register this file's own preserved assets before constructing any client.
// No test-order dependency on another file loading the source runtimes.
for(const [map,folder] of [['barrack','barrack'],['woodlands','woodland']] as const){
  const data=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${folder}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData;
  registerOriginalMapRuntime(map,data);
}

interface Harness {
  velocity:THREE.Vector3;
  originalWeaponPresentation:OriginalWeaponPresentation;
  model:THREE.Group;
  updateViewModelPresentation(dt:number,horizontal:number,sprint:boolean,bobX:number,bobY:number):void;
}
function client(map?:LegacyMapId):Harness {
  const result=Object.create(Game.prototype) as Harness;
  const model=new THREE.Group(),presentation=new OriginalWeaponPresentation('rifle');
  presentation.sourcePosition.fromArray(ORIGINAL_WEAPON_POSES.rifle.rest);
  Object.assign(result,{mapId:map??'woodlands',arena:map?{runtime:getOriginalMapRuntime(map)}:{},
    originalWeaponPresentation:presentation,originalWeapons:{models:new Map([['rifle',model]]),setLoaded:vi.fn()},
    weaponState:{current:'rifle',ammo:{rpg:0}},velocity:new THREE.Vector3(),model,
    controlsPreset:'legacy',originalScopeState:createOriginalScope(),originalScopeFov:50,originalScopeActive:false,
    camera:new THREE.PerspectiveCamera(50,4/3),viewCamera:new THREE.PerspectiveCamera(50,4/3),viewProjection:new THREE.Group(),
    el:()=>({classList:{toggle:vi.fn()},style:{setProperty:vi.fn()}})});
  return result;
}
function expectBob(game:Harness,sourceSpeed:number,ticker:number):void {
  const sine=Math.sin(ticker*Math.PI/180),rest=ORIGINAL_WEAPON_POSES.rifle.rest;
  expect(game.originalWeaponPresentation.ticker).toBeCloseTo(ticker,12);
  expect(game.model.position.x/S).toBeCloseTo(rest[0]-sine*sourceSpeed*.003,12);
  expect(game.model.position.y/S).toBeCloseTo(rest[1]-Math.abs(sine*sourceSpeed*.002),12);
  expect(game.model.position.z/S).toBeCloseTo(rest[2],12);
}

describe('source Game weapon bob consumes Havok body speed',()=>{
  it.each(['barrack','woodlands'] as const)('%s restores body units before source ticker and 3D bob arithmetic',map=>{
    const game=client(map);
    // Body velocity60/80/0 source units has magnitude100. Network/Game keeps
    // its1.5× derivative; source weaponry must still see exactly100.
    game.velocity.set(60*S,80*S,0).multiplyScalar(ORIGINAL_PLAYER_DERIVATIVE_FACTOR);
    const derivative=game.velocity.clone();
    game.updateViewModelPresentation(1/30,game.velocity.x,false,0,0);
    expectBob(game,100,6);expect(game.velocity.toArray()).toEqual(derivative.toArray());
    game.updateViewModelPresentation(1/30,game.velocity.x,false,0,0);
    expectBob(game,100,11);
  });
  it.each(['barrack','woodlands'] as const)('%s includes vertical body motion rather than horizontal speed alone',map=>{
    const game=client(map);game.velocity.set(0,200*S*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,0);
    game.updateViewModelPresentation(1/30,0,false,0,0);expectBob(game,200,11);
  });
  it('keeps staged previews without a source runtime in explicit body-equivalent units',()=>{
    const game=client();game.velocity.set(100*S,0,0);
    game.updateViewModelPresentation(1/30,game.velocity.x,false,0,0);expectBob(game,100,6);
  });
  it('leaves stationary source framing at its recovered rest pose',()=>{
    const game=client('woodlands');game.updateViewModelPresentation(1/30,0,false,0,0);expectBob(game,0,1);
  });
});
