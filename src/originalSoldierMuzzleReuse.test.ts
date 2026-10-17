import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {OriginalMuzzleModelPool} from './originalMuzzleModelPool';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';

const read=(path:string)=>JSON.parse(readFileSync(new URL('../public/assets/'+path,import.meta.url),'utf8'));
function bundle(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),resources=createOriginalSoldierResources({geometry:read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'],rigMotion:read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'],texture},{geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures});
 return {resources,dispose(){resources.dispose();texture.dispose();for(const value of textures.values())value.dispose();}};
}
const flashes=(rig:OriginalSoldier)=>rig.group.children.filter((child):child is THREE.Mesh=>child instanceof THREE.Mesh&&child.name==='original-GI-shot-flash');
const matrix=(object:THREE.Object3D)=>{object.updateWorldMatrix(true,false);return object.matrixWorld.clone();};
const sameWorld=(mesh:THREE.Mesh,world:THREE.Matrix4)=>{const actual=matrix(mesh);for(let i=0;i<16;i++)expect(actual.elements[i]).toBeCloseTo(world.elements[i],10);};
afterEach(()=>vi.restoreAllMocks());

describe('resource-shared source muzzle reuse (real geometry; local callback order adapter)',()=>{
 it('retires two same-callback births in forward insertion order and reuses their exact meshes FIFO on a different GI',()=>{
  const s=bundle(),a=new OriginalSoldier(s.resources),b=new OriginalSoldier(s.resources);try{
   a.fire();a.fire();const [first,second]=flashes(a);expect(first).not.toBe(second);expect(s.resources.muzzleModels.stats()).toEqual({allocated:2,active:2,pooled:0});a.animate(1/30);expect(first.parent).toBe(a.group);expect(second.parent).toBe(a.group);a.animate(1/30);expect(first.parent).toBeNull();expect(second.parent).toBeNull();expect(a.sourceFlashCount).toBe(0);
   b.fire();b.fire();expect(flashes(b)).toEqual([first,second]);expect(s.resources.muzzleModels.stats()).toEqual({allocated:2,active:2,pooled:0});
  }finally{a.dispose();b.dispose();s.dispose();}
 });
 it('keeps weapon FIFOs distinct and replaces stale pooled parent/WORLD state with the new shot full pose',()=>{
  const s=bundle(),a=new OriginalSoldier(s.resources),b=new OriginalSoldier(s.resources),parent=new THREE.Group();parent.add(b.group);try{
   a.fireForSourceWeapon('rifle');a.fireForSourceWeapon('pistol');const [rifle,pistol]=flashes(a);a.animate(1/30);a.animate(1/30);const retainedScale=new THREE.Vector3(.7,1.8,.4);rifle.scale.copy(retainedScale);rifle.name='retained-muzzle-adapter';
   parent.position.set(8,-3,5);parent.quaternion.setFromEuler(new THREE.Euler(.4,-.7,.2,'ZYX'));parent.scale.setScalar(1.5);b.setSourceMotionTime(470);b.animate(1/30);b.animate(1/30);const world=matrix(b.weaponRoot);
   b.fireForSourceWeapon('pistol');expect(flashes(b)[0]).toBe(pistol);expect(pistol.geometry).toBe(s.resources.gunGeometries.get('mfpistol'));sameWorld(pistol,world);b.fireForSourceWeapon('rifle');expect(b.group.children).toContain(rifle);expect(b.sourceFlashCount).toBe(2);expect(rifle.name).toBe('retained-muzzle-adapter');expect(rifle.geometry).toBe(s.resources.gunGeometries.get('mfak47'));const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),gunScale=new THREE.Vector3();world.decompose(position,quaternion,gunScale);sameWorld(rifle,new THREE.Matrix4().compose(position,quaternion,retainedScale));expect(rifle.scale).toEqual(retainedScale);expect(s.resources.muzzleModels.stats().allocated).toBe(2);
  }finally{a.dispose();b.dispose();s.dispose();}
 });
 it('detached death flashes retain their lease through owner disposal, then return to shared FIFO after their remaining callbacks',()=>{
  const s=bundle(),a=new OriginalSoldier(s.resources),b=new OriginalSoldier(s.resources),parent=new THREE.Group();let detached:ReturnType<OriginalSoldier['detachSourceFlashes']>|undefined;try{
   a.fire();const old=flashes(a)[0],world=matrix(old);detached=a.detachSourceFlashes(parent);a.dispose();expect(s.resources.muzzleModels.stats()).toEqual({allocated:1,active:1,pooled:0});detached.step(1/30);expect(old.parent).toBe(parent);sameWorld(old,world);
   b.fire();const second=flashes(b)[0];expect(second).not.toBe(old);b.reset();expect(second.parent).toBeNull();detached.step(1/30);expect(old.parent).toBeNull();expect(detached.count).toBe(0);b.fire();b.fire();expect(flashes(b)).toEqual([second,old]);expect(s.resources.muzzleModels.stats().allocated).toBe(2);
  }finally{detached?.clear();a.dispose();b.dispose();s.dispose();}
 });
 it('reset and detached clear release only their owned records and cannot reclaim another GI active muzzle',()=>{
  const s=bundle(),a=new OriginalSoldier(s.resources),b=new OriginalSoldier(s.resources),parent=new THREE.Group();let detached:ReturnType<OriginalSoldier['detachSourceFlashes']>|undefined;try{
   a.fire();b.fire();const own=flashes(a)[0],other=flashes(b)[0];a.reset();expect(other.parent).toBe(b.group);expect(b.sourceFlashCount).toBe(1);expect(s.resources.muzzleModels.stats()).toEqual({allocated:2,active:1,pooled:1});a.fire();expect(flashes(a)[0]).toBe(own);detached=a.detachSourceFlashes(parent);detached.clear();detached.clear();expect(other.parent).toBe(b.group);expect(s.resources.muzzleModels.stats()).toEqual({allocated:2,active:1,pooled:1});b.animate(1/30);expect(other.parent).toBe(b.group);b.animate(1/30);expect(other.parent).toBeNull();
  }finally{detached?.clear();a.dispose();b.dispose();s.dispose();}
 });
 it('resource generation disposal removes active and detached leases and later owner cleanup never double-disposes borrowed resources',()=>{
  const s=bundle(),a=new OriginalSoldier(s.resources),b=new OriginalSoldier(s.resources),parent=new THREE.Group();let detached:ReturnType<OriginalSoldier['detachSourceFlashes']>|undefined;try{
   a.fire();b.fireForSourceWeapon('pistol');const active=flashes(a)[0],transferred=flashes(b)[0],geometryDispose=vi.spyOn(active.geometry,'dispose'),materialDispose=vi.spyOn(active.material as THREE.Material,'dispose');detached=b.detachSourceFlashes(parent);s.resources.dispose();expect(active.parent).toBeNull();expect(transferred.parent).toBeNull();expect(s.resources.muzzleModels.stats()).toEqual({allocated:0,active:0,pooled:0});expect(geometryDispose).toHaveBeenCalledTimes(1);expect(materialDispose).toHaveBeenCalledTimes(1);
   const late=a.detachSourceFlashes(parent);expect(late.count).toBe(0);expect(active.parent).toBeNull();expect(transferred.parent).toBeNull();expect(()=>late.step(1/30)).not.toThrow();expect(()=>late.clear()).not.toThrow();expect(()=>detached!.step(0)).not.toThrow();expect(detached.count).toBe(0);expect(transferred.parent).toBeNull();
   expect(()=>a.dispose()).not.toThrow();expect(()=>detached!.clear()).not.toThrow();expect(()=>b.dispose()).not.toThrow();s.resources.dispose();expect(geometryDispose).toHaveBeenCalledTimes(1);expect(materialDispose).toHaveBeenCalledTimes(1);
  }finally{detached?.clear();a.dispose();b.dispose();s.dispose();}
 });
 it('muzzle capacity failure is preflighted before changing phase or active records, while unsupported weapon phases use no lease',()=>{
  const s=bundle(),limited=new OriginalMuzzleModelPool(resource=>{const mesh=new THREE.Mesh(s.resources.gunGeometries.get(resource)!,s.resources.gunMaterials.get('mfmachinegun')!);mesh.name='original-GI-shot-flash';return mesh;},1),rig=new OriginalSoldier({...s.resources,muzzleModels:limited});try{
   rig.fire();const existing=flashes(rig)[0];rig.setSourceMotionTime(270);expect(()=>rig.fire()).toThrow();expect(rig.debugState().timeMs).toBe(270);expect(flashes(rig)).toEqual([existing]);expect(limited.stats()).toEqual({allocated:1,active:1,pooled:0});rig.fireForSourceWeapon('rpg');expect(rig.debugState().timeMs).toBe(2000);expect(flashes(rig)).toEqual([existing]);rig.fireForSourceWeapon('launcher');expect(limited.stats().allocated).toBe(1);
  }finally{rig.dispose();limited.dispose();s.dispose();}
 });
});
