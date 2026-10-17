import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {SoldierMaterialLibrary} from './soldierMaterials';

const assets=new URL('../public/assets/',import.meta.url);
function resources(){
 const gi=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const r=createOriginalSoldierResources({geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',assets),'utf8')) as OriginalSoldierAssets['geometry'],rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',assets),'utf8')) as OriginalSoldierAssets['rigMotion'],texture:gi},
  {geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',assets),'utf8')) as OriginalWeaponGeometryData,textures});
 return {r,dispose(){r.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
const flash=(group:THREE.Object3D)=>{let result:THREE.Object3D|undefined;group.traverse(object=>{if(object.name==='original-GI-shot-flash')result=object;});expect(result).toBeDefined();return result!;};
const state:RemoteState={id:'source',name:'SOURCE',x:0,y:0,z:0,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true,sourceMotionTime:0};
afterEach(()=>vi.restoreAllMocks());

describe('actual Game retains independent source muzzle actors through soldier death',()=>{
 it('keeps a bot flash through damage and the first dead-body update, then removes it on the second callback',()=>{
  const owned=resources(),library=new SoldierMaterialLibrary({presentation:'modern',tier:'low'}),g=Object.create(Game.prototype) as any;
  Object.assign(g,{scene:new THREE.Scene(),enemies:[],soldierMaterialLibrary:library,originalSoldierResources:owned.r,arena:{spawnPoints:[new THREE.Vector3(),new THREE.Vector3()]}});
  try{
   g.spawnEnemies();const enemy=g.enemies[0];enemy.rig.fire();const muzzle=flash(enemy.group);muzzle.updateWorldMatrix(true,false);const world=muzzle.matrixWorld.clone();
   expect(enemy.damage(100,100)).toBe('killed');expect(muzzle.parent).not.toBeNull();expect(enemy.rig.weaponRoot.visible).toBe(false);
   enemy.group.position.set(3,4,5);enemy.group.rotation.y=.6;
   enemy.update(1/30,100,new THREE.Vector3(),{colliders:[]},vi.fn());muzzle.updateWorldMatrix(true,false);
   expect(muzzle.parent).not.toBeNull();expect(muzzle.visible).toBe(true);
   expect(Math.max(...muzzle.matrixWorld.elements.map((value,index)=>Math.abs(value-world.elements[index])))).toBeLessThan(1e-10);
   enemy.update(1/30,100,new THREE.Vector3(),{colliders:[]},vi.fn());expect(muzzle.parent).toBeNull();expect(enemy.alive).toBe(false);
  }finally{g.clearEnemies();owned.dispose();library.dispose();}
 });

 it('keeps the remote flash when Game transfers a dead baddie to its corpse set, and clears it without reviving the actor',()=>{
  const owned=resources(),remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true),g=Object.create(Game.prototype) as any;
  let now=5000;vi.spyOn(performance,'now').mockImplementation(()=>now);
  Object.assign(g,{scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),remotePlayers:new Map([[state.id,remote]]),sourceTimeoutCorpses:new Set(),snowTracks:{resetActor:vi.fn()},playOriginalCombatSound:vi.fn()});
  try{
   g.scene.add(remote.group);remote.apply(state,true);g.resetSourceRemoteView({epoch:1000,generation:1});remote.fire();const muzzle=flash(remote.group);
   remote.apply({...state,alive:false,health:0});expect(muzzle.parent).not.toBeNull();
   now+=1000/30;g.advanceSourceRemoteView();expect(g.remotePlayers.has(state.id)).toBe(false);expect(g.sourceTimeoutCorpses.has(remote)).toBe(true);expect(muzzle.parent).not.toBeNull();
   // The death transition births fadeaway; its retained flash consumes the
   // following two nominal callbacks. Native actor-list iteration is unproved.
   now+=1000/30;g.advanceSourceRemoteView();expect(muzzle.parent).not.toBeNull();expect(muzzle.visible).toBe(true);
   now+=1000/30;g.advanceSourceRemoteView();expect(muzzle.parent).toBeNull();expect(remote.alive).toBe(false);expect(g.sourceTimeoutCorpses.has(remote)).toBe(true);
   expect(g.playOriginalCombatSound).toHaveBeenCalledTimes(1);
  }finally{g.clearRemotePlayers();owned.dispose();}
 });
});
