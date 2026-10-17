import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {OriginalProjectileModelPool} from './originalProjectileModelPool';

const fixture=(maxModels=8)=>{
 const geometry=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial();
 const factory=vi.fn((weapon:'launcher'|'rpg'):THREE.Mesh=>{const mesh=new THREE.Mesh(geometry,material);mesh.name=`projectile-${weapon}`;return mesh;});
 const pool=new OriginalProjectileModelPool(factory,maxModels);
 return {pool,factory,geometry,material,dispose(){pool.dispose();geometry.dispose();material.dispose();}};
};

describe('resource-owned projectile FIFO (explicit CPU mesh adapter)',()=>{
 it('keeps two weapon FIFOs independent and leases distinct models in release order',()=>{
  const s=fixture();try{
   const first=s.pool.acquire('launcher'),second=s.pool.acquire('launcher'),rocket=s.pool.acquire('rpg');expect(new Set([first,second,rocket]).size).toBe(3);
   s.pool.release(second);s.pool.release(rocket);s.pool.release(first);
   expect(s.pool.acquire('rpg')).toBe(rocket);expect(s.pool.acquire('launcher')).toBe(second);expect(s.pool.acquire('launcher')).toBe(first);expect(s.factory).toHaveBeenCalledTimes(3);
  }finally{s.dispose();}
 });
 it('retains model name, scale, rotation and borrowed GPU resources across release and reacquisition',()=>{
  const s=fixture(),parent=new THREE.Group();try{
   const model=s.pool.acquire('rpg');model.name='retained-source-handle';model.scale.set(2,3,4);model.quaternion.setFromEuler(new THREE.Euler(.2,.4,.6));const rotation=model.quaternion.clone();parent.add(model);
   s.pool.release(model);expect(model.parent).toBeNull();expect(s.pool.hasLease(model)).toBe(false);expect(s.pool.acquire('rpg')).toBe(model);expect(s.pool.hasLease(model)).toBe(true);
   expect(model.name).toBe('retained-source-handle');expect(model.scale.toArray()).toEqual([2,3,4]);expect(model.quaternion.equals(rotation)).toBe(true);expect(model.geometry).toBe(s.geometry);expect(model.material).toBe(s.material);
  }finally{s.dispose();}
 });
 it('checks aggregate inventory capacity before factory work without evicting another family',()=>{
  const s=fixture(1);try{
   const model=s.pool.acquire('launcher');expect(()=>s.pool.acquire('rpg')).toThrow();expect(s.factory).toHaveBeenCalledTimes(1);s.pool.release(model);
   expect(()=>s.pool.acquire('rpg')).toThrow();expect(s.factory).toHaveBeenCalledTimes(1);expect(s.pool.stats()).toEqual({allocated:1,active:0,pooled:1});expect(s.pool.acquire('launcher')).toBe(model);
  }finally{s.dispose();}
 });
 it('rejects foreign and double releases and returns frozen detached lease statistics',()=>{
  const s=fixture();try{
   const first=s.pool.acquire('launcher'),second=s.pool.acquire('rpg'),foreign=new THREE.Mesh(s.geometry,s.material),before=s.pool.stats();expect(Object.isFrozen(before)).toBe(true);expect(s.pool.hasLease(foreign)).toBe(false);
   expect(()=>s.pool.release(foreign)).toThrow();expect(s.pool.stats()).toEqual(before);s.pool.release(first);expect(()=>s.pool.release(first)).toThrow();expect(s.pool.hasLease(first)).toBe(false);expect(s.pool.hasLease(second)).toBe(true);
   expect(before).toEqual({allocated:2,active:2,pooled:0});expect(s.pool.stats()).toEqual({allocated:2,active:1,pooled:1});expect(s.pool.acquire('launcher')).toBe(first);
  }finally{s.dispose();}
 });
 it('validates weapon families and budgets before invoking the model factory',()=>{
  const s=fixture();try{
   for(const weapon of ['rifle','RPG','',null,undefined])expect(()=>s.pool.acquire(weapon as 'rpg')).toThrow();
   for(const limit of [0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])expect(()=>new OriginalProjectileModelPool(s.factory,limit)).toThrow();expect(s.factory).not.toHaveBeenCalled();expect(s.pool.stats()).toEqual({allocated:0,active:0,pooled:0});
  }finally{s.dispose();}
 });
 it('leaves inventory unchanged after a factory exception or an aliased model and permits a valid retry',()=>{
  const s=fixture(2);try{
   s.factory.mockImplementationOnce(()=>{throw Error('Injected projectile clone failure');});expect(()=>s.pool.acquire('launcher')).toThrow('Injected projectile clone failure');expect(s.pool.stats()).toEqual({allocated:0,active:0,pooled:0});
   const model=s.pool.acquire('launcher');s.factory.mockImplementationOnce(()=>model);expect(()=>s.pool.acquire('rpg')).toThrow();expect(s.pool.stats()).toEqual({allocated:1,active:1,pooled:0});expect(s.pool.hasLease(model)).toBe(true);
   const rocket=s.pool.acquire('rpg');expect(rocket).not.toBe(model);expect(s.pool.stats()).toEqual({allocated:2,active:2,pooled:0});
  }finally{s.dispose();}
 });
 it('rejects an active reset before mutation, then starts a fresh generation with the same factory and cap',()=>{
  const s=fixture(2),parent=new THREE.Group();try{
   const pooled=s.pool.acquire('launcher'),active=s.pool.acquire('rpg');s.pool.release(pooled);parent.add(active);const before=s.pool.stats();expect(()=>s.pool.reset()).toThrow();expect(s.pool.stats()).toEqual(before);expect(active.parent).toBe(parent);expect(s.pool.acquire('launcher')).toBe(pooled);
   s.pool.release(pooled);s.pool.release(active);const geometryDispose=vi.spyOn(s.geometry,'dispose'),materialDispose=vi.spyOn(s.material,'dispose');s.pool.reset();expect(s.pool.isDisposed).toBe(false);expect(s.pool.stats()).toEqual({allocated:0,active:0,pooled:0});expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
   const fresh=s.pool.acquire('launcher');expect(fresh).not.toBe(pooled);expect(fresh).not.toBe(active);s.pool.acquire('rpg');expect(()=>s.pool.acquire('rpg')).toThrow();expect(s.factory).toHaveBeenCalledTimes(4);
  }finally{s.dispose();}
 });
 it('disposes generation membership idempotently without destroying borrowed resources or permitting late admission',()=>{
  const s=fixture(),parent=new THREE.Group();try{
   const active=s.pool.acquire('rpg'),pooled=s.pool.acquire('launcher');parent.add(active,pooled);s.pool.release(pooled);const geometryDispose=vi.spyOn(s.geometry,'dispose'),materialDispose=vi.spyOn(s.material,'dispose');
   s.pool.dispose();s.pool.dispose();expect(s.pool.isDisposed).toBe(true);expect(active.parent).toBeNull();expect(pooled.parent).toBeNull();expect(s.pool.hasLease(active)).toBe(false);expect(s.pool.stats()).toEqual({allocated:0,active:0,pooled:0});expect(()=>s.pool.release(active)).not.toThrow();expect(()=>s.pool.release(pooled)).not.toThrow();
   expect(()=>s.pool.acquire('rpg')).toThrow();expect(()=>s.pool.reset()).toThrow();expect(s.factory).toHaveBeenCalledTimes(2);expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
  }finally{s.dispose();}
 });
});
