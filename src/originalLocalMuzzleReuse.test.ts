import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {OriginalMuzzleModelPool} from './originalMuzzleModelPool';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';

const read=(path:string)=>JSON.parse(readFileSync(new URL('../public/assets/'+path,import.meta.url),'utf8'));
function bundle(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),assets={geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures};
 const resources=createOriginalSoldierResources({geometry:read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'],rigMotion:read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'],texture},assets),weapons=createOriginalWeapons(assets,{muzzlePool:resources.muzzleModels});
 return {resources,weapons,assets,dispose(){weapons.dispose();resources.dispose();texture.dispose();for(const value of textures.values())value.dispose();}};
}
const matrix=(node:THREE.Object3D)=>{node.updateWorldMatrix(true,false);return node.matrixWorld.clone();};
const sameMatrix=(actual:THREE.Matrix4,expected:THREE.Matrix4)=>{for(let i=0;i<16;i++)expect(actual.elements[i]).toBeCloseTo(expected.elements[i],10);};
const sourcePose=(gunWorld:THREE.Matrix4,scale=new THREE.Vector3(1,1,1))=>{const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),ignored=new THREE.Vector3();gunWorld.decompose(position,rotation,ignored);return new THREE.Matrix4().compose(position,rotation,scale);};
function localGame(s:ReturnType<typeof bundle>,enhancedRendering=false){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),view=new THREE.Group(),parent=new THREE.Group();parent.position.set(2,4,-3);parent.quaternion.setFromEuler(new THREE.Euler(.3,-.6,.7,'ZYX'));parent.scale.setScalar(2.2);(enhancedRendering?view:scene).add(parent);parent.add(s.weapons.models.get('rifle')!);camera.position.set(10,7,-5);camera.quaternion.setFromEuler(new THREE.Euler(-.4,.8,.2,'XYZ'));
 const game=Object.assign(Object.create(Game.prototype),{scene,camera,viewScene:view,enhancedRendering,phase:'playing',originalWeapons:s.weapons,originalSoldierResources:s.resources,originalFlashes:[]}) as any;return {game,parent};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('local/Soldier shared muzzle identities (actual resources; CPU presentation)',()=>{
 it('captures borrowed/owned pool responsibility at construction despite later option mutation',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources),borrowedOptions:{muzzlePool?:OriginalMuzzleModelPool}={muzzlePool:s.resources.muzzleModels},borrowed=createOriginalWeapons(s.assets,borrowedOptions),ownedTextures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),ownedOptions:{muzzlePool?:OriginalMuzzleModelPool}={},owned=createOriginalWeapons({geometry:s.assets.geometry,textures:ownedTextures},ownedOptions);try{
   rig.fire();const active=rig.group.children.find(child=>child.name==='original-GI-shot-flash')!,textureDispose=vi.spyOn(s.assets.textures.get('mfmachinegun')!,'dispose');borrowed.spawnFlash('pistol',new THREE.Matrix4());borrowedOptions.muzzlePool=undefined;borrowed.dispose();expect(s.resources.muzzleModels.isDisposed).toBe(false);expect(active.parent).toBe(rig.group);expect(textureDispose).not.toHaveBeenCalled();const ownPool=owned.muzzleModels;owned.spawnFlash('rifle',new THREE.Matrix4());ownedOptions.muzzlePool=s.resources.muzzleModels;owned.dispose();expect(ownPool.isDisposed).toBe(true);expect(s.resources.muzzleModels.isDisposed).toBe(false);expect(active.parent).toBe(rig.group);
  }finally{borrowed.dispose();owned.dispose();rig.dispose();s.dispose();}
 });
 it('rejects malformed or singular WORLD transforms before acquiring any pool lease',()=>{
  const s=bundle();try{
   const acquire=vi.spyOn(s.resources.muzzleModels,'acquire'),nonfinite=new THREE.Matrix4(),short=new THREE.Matrix4();nonfinite.elements[5]=NaN;short.elements.pop();for(const world of [nonfinite,short,new THREE.Matrix4().makeScale(0,0,0)])expect(()=>s.weapons.spawnFlash('rifle',world)).toThrow();expect(acquire).not.toHaveBeenCalled();expect(s.resources.muzzleModels.stats()).toEqual({allocated:0,active:0,pooled:0});
  }finally{s.dispose();}
 });
 it('stale Game records never mutate or release a muzzle already reacquired by a Soldier, on advance or clear',()=>{
  const s=bundle(),{game}=localGame(s),rig=new OriginalSoldier(s.resources),next=createOriginalWeapons(s.assets,{muzzlePool:s.resources.muzzleModels});try{
   game.spawnOriginalMuzzleFlash('rifle');const first=game.originalFlashes[0].mesh;s.weapons.dispose();rig.fire();expect(rig.group.children).toContain(first);first.visible=false;expect(()=>game.advanceOriginalMuzzleFlashes()).not.toThrow();expect(game.originalFlashes).toEqual([]);expect(first.visible).toBe(false);expect(first.parent).toBe(rig.group);expect(s.resources.muzzleModels.stats().active).toBe(1);
   game.originalWeapons=next;game.spawnOriginalMuzzleFlash('rifle');const second=game.originalFlashes[0].mesh;next.releaseFlash(second);rig.fire();expect(rig.group.children).toContain(second);second.visible=false;expect(()=>game.clearOriginalMuzzleFlashes()).not.toThrow();expect(game.originalFlashes).toEqual([]);expect(second.visible).toBe(false);expect(second.parent).toBe(rig.group);expect(first.parent).toBe(rig.group);expect(rig.sourceFlashCount).toBe(2);expect(s.resources.muzzleModels.stats()).toEqual({allocated:2,active:2,pooled:0});
  }finally{game.clearOriginalMuzzleFlashes();next.dispose();rig.dispose();s.dispose();}
 });
 for(const enhanced of [false,true])it(`actual Game enhanced=${enhanced} composes shot WORLD correctly and retires same-callback local births FIFO`,()=>{
  const s=bundle(),{game}=localGame(s,enhanced);try{
   const model=s.weapons.models.get('rifle')!,gun=matrix(model),expected=sourcePose(enhanced?new THREE.Matrix4().multiplyMatrices(matrix(game.camera),gun):gun);game.spawnOriginalMuzzleFlash('rifle');game.spawnOriginalMuzzleFlash('rifle');const [first,second]=game.originalFlashes.map((entry:{mesh:THREE.Mesh})=>entry.mesh);sameMatrix(matrix(first),expected);sameMatrix(matrix(second),expected);expect(first).not.toBe(second);game.advanceOriginalMuzzleFlashes();expect(first.parent).toBe(game.scene);expect(second.parent).toBe(game.scene);game.advanceOriginalMuzzleFlashes();expect(game.originalFlashes).toEqual([]);expect(first.parent).toBeNull();expect(second.parent).toBeNull();game.spawnOriginalMuzzleFlash('rifle');game.spawnOriginalMuzzleFlash('rifle');expect(game.originalFlashes.map((entry:{mesh:THREE.Mesh})=>entry.mesh)).toEqual([first,second]);expect(s.resources.muzzleModels.stats().allocated).toBe(2);
  }finally{game.clearOriginalMuzzleFlashes();s.dispose();}
 });
 it('local then Soldier then local reuse keeps the same canonical geometry/material, name and retained scale at each new full WORLD pose',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources),parent=new THREE.Group();parent.add(rig.group);try{
   const first=s.weapons.spawnFlash('rifle',new THREE.Matrix4().makeTranslation(2,3,4))!,geometry=first.geometry,material=first.material;expect(geometry).toBe(s.resources.gunGeometries.get('mfak47'));expect(material).toBe(s.resources.gunMaterials.get('mfmachinegun'));s.weapons.releaseFlash(first);first.scale.set(.6,1.7,.8);first.name='retained-local-muzzle';const scale=first.scale.clone();
   parent.position.set(-5,8,2);parent.quaternion.setFromEuler(new THREE.Euler(.4,-.7,.3,'YXZ'));parent.scale.setScalar(1.6);rig.setSourceMotionTime(370);rig.animate(1/30);rig.animate(1/30);const gun=matrix(rig.weaponRoot);rig.fire();expect(rig.group.children).toContain(first);sameMatrix(matrix(first),sourcePose(gun,scale));expect(first.name).toBe('retained-local-muzzle');expect(first.geometry).toBe(geometry);expect(first.material).toBe(material);rig.animate(1/30);rig.animate(1/30);
   const next=new THREE.Matrix4().compose(new THREE.Vector3(9,-4,7),new THREE.Quaternion().setFromEuler(new THREE.Euler(-.6,.9,.2,'XYZ')),new THREE.Vector3(3,3,3)),reused=s.weapons.spawnFlash('rifle',next)!;expect(reused).toBe(first);sameMatrix(reused.matrix,sourcePose(next,scale));expect(reused.scale).toEqual(scale);expect(reused.name).toBe('retained-local-muzzle');expect(reused.geometry).toBe(geometry);expect(reused.material).toBe(material);expect(s.resources.muzzleModels.stats().allocated).toBe(1);
  }finally{rig.dispose();s.dispose();}
 });
 it('different local muzzle families retain separate FIFO identities',()=>{
  const s=bundle();try{
   const world=new THREE.Matrix4(),rifle=s.weapons.spawnFlash('rifle',world)!,pistol=s.weapons.spawnFlash('pistol',world)!;expect(rifle).not.toBe(pistol);s.weapons.releaseFlash(rifle);s.weapons.releaseFlash(pistol);expect(s.weapons.spawnFlash('pistol',world)).toBe(pistol);expect(s.weapons.spawnFlash('rifle',world)).toBe(rifle);expect(s.resources.muzzleModels.stats()).toEqual({allocated:2,active:2,pooled:0});
  }finally{s.dispose();}
 });
 it('borrowed collection cleanup releases only its leases and does not dispose active GI canonical geometry, material or caller texture',()=>{
  const s=bundle(),rig=new OriginalSoldier(s.resources);try{
   rig.fire();const giFlash=rig.group.children.find(child=>child.name==='original-GI-shot-flash') as THREE.Mesh,local=s.weapons.spawnFlash('pistol',new THREE.Matrix4())!,geometryDispose=vi.spyOn(giFlash.geometry,'dispose'),materialDispose=vi.spyOn(giFlash.material as THREE.Material,'dispose'),textureDispose=vi.spyOn(s.assets.textures.get('mfmachinegun')!,'dispose');expect(()=>s.weapons.releaseFlash(giFlash)).toThrow();s.weapons.dispose();expect(local.parent).toBeNull();expect(giFlash.parent).toBe(rig.group);expect(rig.sourceFlashCount).toBe(1);expect(s.resources.muzzleModels.stats()).toEqual({allocated:2,active:1,pooled:1});expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();expect(textureDispose).not.toHaveBeenCalled();
  }finally{rig.dispose();s.dispose();}
 });
 it('disposed shared pool makes local spawn and Game advancement/cleanup discard records without re-admission',()=>{
  const s=bundle(),{game}=localGame(s);try{
   game.spawnOriginalMuzzleFlash('rifle');const mesh=game.originalFlashes[0].mesh;s.resources.muzzleModels.dispose();expect(mesh.parent).toBeNull();expect(s.weapons.spawnFlash('rifle',new THREE.Matrix4())).toBeUndefined();expect(()=>game.advanceOriginalMuzzleFlashes()).not.toThrow();expect(game.originalFlashes).toEqual([]);game.spawnOriginalMuzzleFlash('rifle');expect(game.originalFlashes).toEqual([]);expect(()=>game.clearOriginalMuzzleFlashes()).not.toThrow();expect(s.resources.muzzleModels.stats()).toEqual({allocated:0,active:0,pooled:0});
  }finally{game.clearOriginalMuzzleFlashes();s.dispose();}
 });
 it('standalone collection owns its pool, reuses local names, and disposes its resources and textures exactly once',()=>{
  const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),collection=createOriginalWeapons({geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures}),scene=new THREE.Scene();try{
   const first=collection.spawnFlash('rifle',new THREE.Matrix4())!;expect(first.name).toBe('original-shot-flash-rifle');collection.releaseFlash(first);const second=collection.spawnFlash('rifle',new THREE.Matrix4().makeTranslation(3,4,5))!;expect(second).toBe(first);scene.add(second);const geometryDispose=vi.spyOn(second.geometry,'dispose'),materialDispose=vi.spyOn(second.material as THREE.Material,'dispose'),textureDispose=vi.spyOn(textures.get('mfmachinegun')!,'dispose');collection.dispose();collection.dispose();expect(second.parent).toBeNull();expect(collection.muzzleModels.isDisposed).toBe(true);expect(collection.muzzleModels.stats()).toEqual({allocated:0,active:0,pooled:0});expect(geometryDispose).toHaveBeenCalledTimes(1);expect(materialDispose).toHaveBeenCalledTimes(1);expect(textureDispose).toHaveBeenCalledTimes(1);
  }finally{collection.dispose();}
 });
 it('Game records release through their captured collection after the current weapon collection changes',()=>{
  const s=bundle(),{game}=localGame(s),next=createOriginalWeapons(s.assets,{muzzlePool:s.resources.muzzleModels});try{
   game.spawnOriginalMuzzleFlash('rifle');const previous=game.originalFlashes[0].mesh,active=next.spawnFlash('pistol',new THREE.Matrix4())!;game.scene.add(active);game.originalWeapons=next;game.advanceOriginalMuzzleFlashes();game.advanceOriginalMuzzleFlashes();expect(previous.parent).toBeNull();expect(active.parent).toBe(game.scene);expect(s.resources.muzzleModels.stats()).toEqual({allocated:2,active:1,pooled:1});expect(next.spawnFlash('rifle',new THREE.Matrix4())).toBe(previous);
  }finally{game.clearOriginalMuzzleFlashes();next.dispose();s.dispose();}
 });
 it('actual selectMap clears active local leases before resetting the shared pool generation',()=>{
  const s=bundle(),{game}=localGame(s);try{
   const select={value:''};vi.stubGlobal('document',{body:{dataset:{}},getElementById:()=>select});
   // Only UI sinks and terrain installation are inert. Actual local clear,
   // enemy/remote cleanup and pool generation reset methods execute.
   Object.assign(game,{archivalWinter:false,mapId:'woodlands',mode:'online',legacyArena:{dispose:vi.fn()},enemies:[],remotePlayers:new Map(),sourceTimeoutCorpses:new Set(),networkDropVisuals:new Map(),weaponDrops:[],projectiles:[],originalBlasts:[],soloCorpses:new Map(),soloDetachedFlashes:[],snowTracks:{resetActor:vi.fn()},atmosphere:{setMap:vi.fn()},velocity:new THREE.Vector3(),pendingCollections:new Set(),combatImpactMarks:{clear:vi.fn()},weaponState:{current:'rifle',map:'woodlands',reset:vi.fn()},syncWeaponPresentation:vi.fn(),updateHud:vi.fn(),installOriginalMap:vi.fn(()=>{game.arena={spawnPoints:[new THREE.Vector3(4,5,6)]};})});
   game.spawnOriginalMuzzleFlash('rifle');const old=game.originalFlashes[0].mesh,release=vi.spyOn(s.weapons,'releaseFlash'),reset=vi.spyOn(s.resources.muzzleModels,'reset');expect(()=>game.selectMap('barrack')).not.toThrow();expect(old.parent).toBeNull();expect(game.originalFlashes).toEqual([]);expect(reset).toHaveBeenCalledTimes(1);expect(release.mock.invocationCallOrder[0]).toBeLessThan(reset.mock.invocationCallOrder[0]);expect(s.resources.muzzleModels.stats()).toEqual({allocated:0,active:0,pooled:0});expect(select.value).toBe('barrack');game.spawnOriginalMuzzleFlash('rifle');expect(game.originalFlashes[0].mesh).not.toBe(old);
  }finally{game.clearOriginalMuzzleFlashes();s.dispose();}
 });
});
