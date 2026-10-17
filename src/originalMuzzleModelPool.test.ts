import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {OriginalMuzzleModelPool} from './originalMuzzleModelPool';

const fixture=(maxModels=8)=>{
 const geometry=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial(),factory=vi.fn((resource:string)=>{const mesh=new THREE.Mesh(geometry,material);mesh.name=resource;return mesh;}),pool=new OriginalMuzzleModelPool(factory,maxModels);
 return {pool,factory,geometry,material,dispose(){pool.dispose();geometry.dispose();material.dispose();}};
};

describe('resource-owned muzzle model FIFO (explicit mesh adapter)',()=>{
 it('full generation reset rejects active leases atomically, then clears released identities while preserving the factory and budget',()=>{
  const s=fixture(2),parent=new THREE.Group();try{
   const old=s.pool.acquire('mfak47'),active=s.pool.acquire('mfpistol');parent.add(active);s.pool.release(old);const before=s.pool.stats();expect(()=>s.pool.reset()).toThrow();expect(s.pool.stats()).toEqual(before);expect(active.parent).toBe(parent);expect(s.pool.acquire('mfak47')).toBe(old);s.pool.release(old);s.pool.release(active);
   s.pool.reset();expect(s.pool.stats()).toEqual({allocated:0,active:0,pooled:0});const fresh=s.pool.acquire('mfak47');expect(fresh).not.toBe(old);expect(fresh).not.toBe(active);expect(s.factory).toHaveBeenCalledTimes(3);s.pool.acquire('mfpistol');expect(()=>s.pool.acquire('mfak47')).toThrow();expect(s.factory).toHaveBeenCalledTimes(4);s.pool.dispose();expect(()=>s.pool.reset()).toThrow();
  }finally{s.dispose();}
 });
 it('leases distinct models and reuses per-resource FIFO in release order across interleaved families',()=>{
  const s=fixture();try{
   const first=s.pool.acquire('mfak47'),second=s.pool.acquire('mfak47'),pistol=s.pool.acquire('mfpistol');expect(new Set([first,second,pistol]).size).toBe(3);
   s.pool.release(second);s.pool.release(pistol);s.pool.release(first);expect(s.pool.acquire('mfpistol')).toBe(pistol);expect(s.pool.acquire('mfak47')).toBe(second);expect(s.pool.acquire('mfak47')).toBe(first);expect(s.factory).toHaveBeenCalledTimes(3);
  }finally{s.dispose();}
 });
 it('rejects foreign and double releases without changing another active lease',()=>{
  const s=fixture();try{
   const first=s.pool.acquire('mfspas12'),second=s.pool.acquire('mfspas12'),foreign=new THREE.Mesh(s.geometry,s.material),before=s.pool.stats();expect(Object.isFrozen(before)).toBe(true);expect(before).toEqual({allocated:2,active:2,pooled:0});
   expect(()=>s.pool.release(foreign)).toThrow();s.pool.release(first);expect(before).toEqual({allocated:2,active:2,pooled:0});expect(s.pool.stats()).toEqual({allocated:2,active:1,pooled:1});expect(()=>s.pool.release(first)).toThrow();expect(s.pool.acquire('mfspas12')).toBe(first);expect(first).not.toBe(second);expect(s.factory).toHaveBeenCalledTimes(2);
  }finally{s.dispose();}
 });
 it('checks the total inventory budget before factory work and never evicts a different resource FIFO',()=>{
  const s=fixture(1);try{
   const first=s.pool.acquire('mfak47');expect(()=>s.pool.acquire('mfak47')).toThrow();expect(s.factory).toHaveBeenCalledTimes(1);s.pool.release(first);expect(()=>s.pool.acquire('mfpistol')).toThrow();expect(s.factory).toHaveBeenCalledTimes(1);expect(s.pool.acquire('mfak47')).toBe(first);
  }finally{s.dispose();}
 });
 it('admits only the four recovered muzzle resources and rejects invalid budgets before factory work',()=>{
  const s=fixture();try{
   for(const resource of ['mfrpg','mfrg6','','MFak47'])expect(()=>s.pool.acquire(resource)).toThrow();expect(s.factory).not.toHaveBeenCalled();
   for(const limit of [0,-1,1.5,Infinity,NaN])expect(()=>new OriginalMuzzleModelPool(s.factory,limit)).toThrow();expect(s.factory).not.toHaveBeenCalled();
   for(const resource of ['mfak47','mfpistol','mfspas12','mfdragunov'])expect(s.pool.acquire(resource)).toBeInstanceOf(THREE.Mesh);
  }finally{s.dispose();}
 });
 it('factory failure does not consume inventory capacity and a retry creates one valid lease',()=>{
  const s=fixture(1);try{
   s.factory.mockImplementationOnce(()=>{throw Error('Injected clone failure');});expect(()=>s.pool.acquire('mfdragunov')).toThrow('Injected clone failure');const admitted=s.pool.acquire('mfdragunov');expect(s.factory).toHaveBeenCalledTimes(2);s.pool.release(admitted);expect(s.pool.acquire('mfdragunov')).toBe(admitted);expect(s.factory).toHaveBeenCalledTimes(2);
  }finally{s.dispose();}
 });
 it('rejects a factory returning a model already owned by the pool rather than aliasing active leases',()=>{
  const geometry=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material),pool=new OriginalMuzzleModelPool(()=>mesh,2);try{
   expect(pool.acquire('mfak47')).toBe(mesh);expect(()=>pool.acquire('mfpistol')).toThrow();pool.release(mesh);expect(pool.acquire('mfak47')).toBe(mesh);
  }finally{pool.dispose();geometry.dispose();material.dispose();}
 });
 it('generation disposal removes active and pooled models idempotently without disposing borrowed geometry or material',()=>{
  const s=fixture(),parent=new THREE.Group();try{
   const active=s.pool.acquire('mfak47'),pooled=s.pool.acquire('mfpistol');parent.add(active,pooled);s.pool.release(pooled);expect(pooled.parent).toBeNull();const geometryDispose=vi.spyOn(s.geometry,'dispose'),materialDispose=vi.spyOn(s.material,'dispose');
   s.pool.dispose();s.pool.dispose();expect(active.parent).toBeNull();expect(pooled.parent).toBeNull();expect(s.pool.stats()).toEqual({allocated:0,active:0,pooled:0});expect(()=>s.pool.release(active)).not.toThrow();expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();expect(()=>s.pool.acquire('mfak47')).toThrow();
  }finally{s.dispose();}
 });
});
