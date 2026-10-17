import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoldier,createOriginalSoldierResources,isOriginalSoldierConstructorCapture,isOriginalSoldierGunConstructorCapture,ORIGINAL_GI_RIGHT_FINGERS,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_RESOURCES,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import type {WeaponId} from './weapons';

const base=new URL('../public/assets/',import.meta.url);
const geometry=JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'];
const rigMotion=JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'];
const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData;
function fixture(weapon:WeaponId='rpg',bindingId:string|null='actual-constructor-pack'){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const resources=createOriginalSoldierResources({geometry,rigMotion,texture},{geometry:weapons,textures},{resourceBindingId:bindingId??undefined}),soldier=new OriginalSoldier(resources,{weapon,name:'Constructor observer'});
 return {resources,soldier,dispose(){soldier.dispose();resources.dispose();texture.dispose();for(const t of textures.values())t.dispose();}};
}

describe('actual copy soldier immutable fresh constructor observations',()=>{
 it.each(['pistol','shotgun','rifle','launcher','rpg','sniper'] as const)('captures exact %s constructor GI/bone23/gun matrices and borrowed resource joins',weapon=>{
  const f=fixture(weapon);try{
   const c=f.soldier.readConstructorSeedCapture(),gun=f.soldier.getSourceGun(weapon);
   expect(c.kind).toBe('copy-fresh-soldier-constructor');expect(c.resourceBindingId).toBe('actual-constructor-pack');expect(c.phase).toBe(0);expect(c.boneCount).toBe(25);expect(c.selectedWeapon).toBe(weapon);
   expect(c.gi.worldMatrix).toEqual(f.soldier.nativeRoot.matrixWorld.toArray());expect(c.bone23WorldMatrix).toEqual(f.soldier.bones[ORIGINAL_GI_RIGHT_FINGERS].matrixWorld.toArray());expect(c.gun.worldMatrix).toEqual(gun.matrixWorld.toArray());expect(c.gun.weapon).toBe(weapon);expect(c.gun.resource).toBe(ORIGINAL_WEAPON_RESOURCES[weapon]);
   expect(c.gi.geometry).toBe(f.resources.geometry);expect(c.gi.material).toBe(f.resources.material);expect(c.gun.geometry).toBe(f.resources.gunGeometries.get(c.gun.resource));expect(c.gun.material).toBe(f.resources.gunMaterials.get(c.gun.resource));
   const q=f.soldier.nativeRoot.quaternion;expect(c.gi.resourceOrientation).toEqual({x:q.x,y:q.y,z:q.z,w:q.w});expect(isOriginalSoldierConstructorCapture(c)).toBe(true);expect(isOriginalSoldierConstructorCapture({...c})).toBe(false);
   expect(Object.isFrozen(c)).toBe(true);expect(Object.isFrozen(c.gi)).toBe(true);expect(Object.isFrozen(c.gi.resourceOrientation)).toBe(true);expect(Object.isFrozen(c.gi.worldMatrix)).toBe(true);expect(Object.isFrozen(c.bone23WorldMatrix)).toBe(true);expect(Object.isFrozen(c.gun)).toBe(true);expect(Object.isFrozen(c.gun.worldMatrix)).toBe(true);
   expect(Object.isFrozen(f.resources.geometry)).toBe(false);expect(Object.isFrozen(f.resources.material)).toBe(false);
  }finally{f.dispose();}
 });
 it('reads the same historical observations without sampling/updating, acquiring pools or drawing randomness',()=>{
  const f=fixture(),c=f.soldier.readConstructorSeedCapture(),first=f.soldier.readGunConstructorSeedCapture('rpg'),worlds=[f.soldier.nativeRoot.matrixWorld.toArray(),f.soldier.weaponRoot.matrixWorld.toArray(),f.soldier.bones[ORIGINAL_GI_RIGHT_FINGERS].matrixWorld.toArray()],stats=f.resources.muzzleModels.stats();
  const sample=vi.spyOn(f.soldier as any,'sampleMotion'),worldUpdate=vi.spyOn(THREE.Object3D.prototype,'updateWorldMatrix'),matrixUpdate=vi.spyOn(THREE.Object3D.prototype,'updateMatrixWorld'),acquire=vi.spyOn(f.resources.muzzleModels,'acquire'),random=vi.spyOn(Math,'random');
  try{for(let i=0;i<3;i++){expect(f.soldier.readConstructorSeedCapture()).toBe(c);expect(f.soldier.readGunConstructorSeedCapture('rpg')).toBe(first);expect(f.soldier.readGunConstructorSeedCapture('sniper')).toBeUndefined();}expect(sample).not.toHaveBeenCalled();expect(worldUpdate).not.toHaveBeenCalled();expect(matrixUpdate).not.toHaveBeenCalled();expect(acquire).not.toHaveBeenCalled();expect(random).not.toHaveBeenCalled();expect(f.resources.muzzleModels.stats()).toEqual(stats);expect([f.soldier.nativeRoot.matrixWorld.toArray(),f.soldier.weaponRoot.matrixWorld.toArray(),f.soldier.bones[ORIGINAL_GI_RIGHT_FINGERS].matrixWorld.toArray()]).toEqual(worlds);}finally{sample.mockRestore();worldUpdate.mockRestore();matrixUpdate.mockRestore();random.mockRestore();f.dispose();}
 });
 it('retains fresh-constructor matrices and phase after movement, sampling, death and retained reuse',()=>{
  const f=fixture(),c=f.soldier.readConstructorSeedCapture(),first=f.soldier.readGunConstructorSeedCapture('rpg');try{
   f.soldier.group.position.set(3,4,5);f.soldier.animate(.1,{alive:true});expect(f.soldier.nativeRoot.matrixWorld.toArray()).not.toEqual(c.gi.worldMatrix);f.soldier.animate(.1,{alive:false});f.soldier.prepareSourceReuse('Reused observer');
   expect(f.soldier.readConstructorSeedCapture()).toBe(c);expect(f.soldier.readGunConstructorSeedCapture('rpg')).toBe(first);expect(c.phase).toBe(0);expect(c.gi.worldMatrix).not.toEqual(f.soldier.nativeRoot.matrixWorld.toArray());
   f.soldier.nativeRoot.matrixWorld.elements[12]=999;f.soldier.bones[ORIGINAL_GI_RIGHT_FINGERS].matrixWorld.elements[12]=999;expect(c.gi.worldMatrix[12]).not.toBe(999);expect(c.bone23WorldMatrix[12]).not.toBe(999);
  }finally{f.dispose();}
 });
 it('observes actual fresh gun Mesh matrices before parenting and retains each first allocation identity',()=>{
  const f=fixture();try{
   const original=f.soldier.readGunConstructorSeedCapture('rpg')!;expect(original.kind).toBe('copy-fresh-gun-mesh-constructor');expect(original.localMatrix).toEqual(new THREE.Matrix4().toArray());expect(original.worldMatrix).toEqual(new THREE.Matrix4().toArray());expect(original.inWorld).toBe(false);
   f.soldier.group.position.set(5,6,7);f.soldier.group.updateMatrixWorld(true);expect(f.soldier.readGunConstructorSeedCapture('sniper')).toBeUndefined();const mesh=f.soldier.admitSourceGun('sniper'),first=f.soldier.readGunConstructorSeedCapture('sniper')!;
   expect(mesh.parent).toBeNull();expect(first.localMatrix).toEqual(new THREE.Matrix4().toArray());expect(first.worldMatrix).toEqual(new THREE.Matrix4().toArray());expect(first.resource).toBe('dragunov');expect(first.weapon).toBe('sniper');expect(first.geometry).toBe(mesh.geometry);expect(first.material).toBe(mesh.material);expect(first.resourceBindingId).toBe('actual-constructor-pack');expect(first.phase).toBe(0);expect(isOriginalSoldierGunConstructorCapture(first)).toBe(true);expect(isOriginalSoldierGunConstructorCapture({...first})).toBe(false);expect(Object.isFrozen(first.worldMatrix)).toBe(true);expect(Object.isFrozen(first.localMatrix)).toBe(true);
   f.soldier.setWeapon('sniper');expect(f.soldier.getSourceGun('sniper')).toBe(mesh);expect(mesh.parent).toBeNull();f.soldier.weaponRoot.add(mesh);f.soldier.weaponRoot.updateWorldMatrix(true,true);expect(mesh.parent).toBe(f.soldier.weaponRoot);expect(f.soldier.admitSourceGun('sniper')).toBe(mesh);expect(f.soldier.readGunConstructorSeedCapture('sniper')).toBe(first);expect(first.worldMatrix).toEqual(new THREE.Matrix4().toArray());
  }finally{f.dispose();}
 });
 it('preserves old resource users without a binding ID and rejects unissued structural copies',()=>{
  const f=fixture('rpg',null);try{expect(f.soldier.readConstructorSeedCapture().resourceBindingId).toBeUndefined();expect(f.soldier.readGunConstructorSeedCapture('rpg')!.resourceBindingId).toBeUndefined();for(const fake of [undefined,null,{},Object.freeze({...f.soldier.readConstructorSeedCapture()})])expect(isOriginalSoldierConstructorCapture(fake)).toBe(false);for(const fake of [undefined,null,{},Object.freeze({...f.soldier.readGunConstructorSeedCapture('rpg')!})])expect(isOriginalSoldierGunConstructorCapture(fake)).toBe(false);}finally{f.dispose();}
 });
 it('rejects readers after rig disposal or resource generation teardown without disposing borrowed assets through reads',()=>{
  const f=fixture(),disposeGeometry=vi.spyOn(f.resources.geometry,'dispose'),disposeMaterial=vi.spyOn(f.resources.material,'dispose');try{f.soldier.readConstructorSeedCapture();f.soldier.readGunConstructorSeedCapture('rpg');expect(disposeGeometry).not.toHaveBeenCalled();expect(disposeMaterial).not.toHaveBeenCalled();f.soldier.dispose();expect(()=>f.soldier.readConstructorSeedCapture()).toThrow('unavailable');expect(()=>f.soldier.readGunConstructorSeedCapture('rpg')).toThrow('unavailable');expect(disposeGeometry).not.toHaveBeenCalled();expect(disposeMaterial).not.toHaveBeenCalled();}finally{f.dispose();}
  const g=fixture();try{g.resources.dispose();expect(()=>g.soldier.readConstructorSeedCapture()).toThrow('unavailable');expect(()=>g.soldier.readGunConstructorSeedCapture('rpg')).toThrow('unavailable');}finally{g.dispose();}
 });
});
