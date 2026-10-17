import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {OriginalEffectPlanePool} from './originalEffectPlanePool';

function fixture(options?:{maxModels?:number;maxShaders?:number}){
 const geometry=new THREE.PlaneGeometry(2,2),texture=new THREE.Texture(),pool=new OriginalEffectPlanePool(geometry,options);
 return {geometry,texture,pool,dispose(){pool.dispose();geometry.dispose();texture.dispose();}};
}

describe('shared effect plane and independent shader FIFO (explicit geometry adapter)',()=>{
 it('reuses one plane FIFO across all four effect kinds while recycled shaders follow their own release FIFO',()=>{
  const s=fixture();try{
   const puff=s.pool.acquire('puff','pufft',s.texture),shaderA=puff.material,miss=s.pool.acquire('miss','decal',s.texture),named=miss.material,bang=s.pool.acquire('bang','bangrocket',s.texture),shaderB=bang.material;
   s.pool.release(miss);s.pool.release(puff);s.pool.release(bang);const nextBang=s.pool.acquire('bang','banggrenade',s.texture),nextPuff=s.pool.acquire('puff','pufft',s.texture);expect(nextBang).toBe(miss);expect(nextBang.material).toBe(shaderA);expect(nextPuff).toBe(puff);expect(nextPuff.material).toBe(shaderB);expect(nextBang.material).not.toBe(named);expect(nextPuff.geometry).toBe(s.geometry);
  }finally{s.dispose();}
 });
 it('named blood and decal shaders are shared by texture name while recycled effects receive independent shader wrappers',()=>{
  const s=fixture();try{
   const a=s.pool.acquire('blood','spatter',s.texture),b=s.pool.acquire('blood','spatter',s.texture),miss=s.pool.acquire('miss','decal',s.texture),secondMiss=s.pool.acquire('miss','decal',s.texture),shotgun=s.pool.acquire('miss','decalspas',s.texture),puff=s.pool.acquire('puff','pufft',s.texture),secondPuff=s.pool.acquire('puff','pufft',s.texture);
   expect(a.material).toBe(b.material);expect(miss.material).toBe(secondMiss.material);expect(shotgun.material).not.toBe(miss.material);expect(puff.material).not.toBe(secondPuff.material);expect(puff.material.map).not.toBe(secondPuff.material.map);expect(a.material.map).not.toBe(s.texture);expect(s.pool.bloodTexturePosition).toEqual({x:1,y:1,z:0});
  }finally{s.dispose();}
 });
 it('preflights model/shader exhaustion before clone work and allows only valid active replacement credit',()=>{
  const s=fixture({maxModels:1,maxShaders:1});try{
   const first=s.pool.acquire('puff','pufft',s.texture),clone=vi.spyOn(s.texture,'clone'),before=s.pool.stats();expect(()=>s.pool.preflight('bang','bangrocket')).toThrow();expect(()=>s.pool.acquire('bang','bangrocket',s.texture)).toThrow();expect(clone).not.toHaveBeenCalled();expect(s.pool.stats()).toEqual(before);
   expect(()=>s.pool.preflight('bang','bangrocket',first)).not.toThrow();expect(()=>s.pool.preflight('miss','decal',first)).toThrow();expect(s.pool.stats()).toEqual(before);s.pool.release(first);expect(()=>s.pool.preflight('bang','bangrocket',first)).toThrow();expect(s.pool.acquire('bang','bangrocket',s.texture)).toBe(first);
  }finally{s.dispose();}
 });
 it('validates kind/texture combinations, invalid limits and foreign replacement without changing inventory',()=>{
  const s=fixture();try{
   for(const [kind,name] of [['miss','pufft'],['blood','decal'],['puff','spatter'],['bang','pufft'],['miss','unknown']] as const)expect(()=>s.pool.preflight(kind,name)).toThrow();expect(()=>s.pool.preflight('puff','pufft',new THREE.Mesh(s.geometry))).toThrow();expect(s.pool.stats().allocated).toBe(0);
   for(const value of [0,-1,1.5,Infinity,NaN]){expect(()=>new OriginalEffectPlanePool(s.geometry,{maxModels:value})).toThrow();expect(()=>new OriginalEffectPlanePool(s.geometry,{maxShaders:value})).toThrow();}
  }finally{s.dispose();}
 });
 it('foreign or double release cannot steal another active model or its shader',()=>{
  const s=fixture();try{
   const a=s.pool.acquire('puff','pufft',s.texture),b=s.pool.acquire('puff','pufft',s.texture),parent=new THREE.Group();parent.add(b);expect(()=>s.pool.release(new THREE.Mesh(s.geometry))).toThrow();s.pool.release(a);const before=s.pool.stats();expect(()=>s.pool.release(a)).toThrow();expect(s.pool.stats()).toEqual(before);expect(b.parent).toBe(parent);expect(s.pool.acquire('bang','bangrocket',s.texture)).toBe(a);expect(b.parent).toBe(parent);
  }finally{s.dispose();}
 });
 it('returns frozen detached statistics and does not mutate shared blood position on rejected admission',()=>{
  const s=fixture({maxModels:1});try{
   s.pool.acquire('blood','spatter',s.texture);s.pool.bloodTexturePosition.x=-2;const before=s.pool.stats(),position={...s.pool.bloodTexturePosition};expect(Object.isFrozen(before)).toBe(true);expect(()=>s.pool.preflight('blood','spatter')).toThrow();expect(s.pool.bloodTexturePosition).toEqual(position);expect(s.pool.stats()).toEqual(before);
  }finally{s.dispose();}
 });
 it('generation reset rejects active leases atomically, then disposes owned shader wrappers and creates fresh plane identities',()=>{
  const s=fixture();try{
   const a=s.pool.acquire('puff','pufft',s.texture),b=s.pool.acquire('miss','decal',s.texture),material=a.material,wrapper=material.map!,materialDispose=vi.spyOn(material,'dispose'),wrapperDispose=vi.spyOn(wrapper,'dispose'),geometryDispose=vi.spyOn(s.geometry,'dispose'),sourceDispose=vi.spyOn(s.texture,'dispose');s.pool.release(a);const before=s.pool.stats();expect(()=>s.pool.reset()).toThrow();expect(s.pool.stats()).toEqual(before);s.pool.release(b);s.pool.reset();expect(s.pool.stats()).toEqual({allocated:0,active:0,pooled:0,shaders:0,recycledShaders:0,freeRecycledShaders:0});expect(materialDispose).toHaveBeenCalledTimes(1);expect(wrapperDispose).toHaveBeenCalledTimes(1);expect(geometryDispose).not.toHaveBeenCalled();expect(sourceDispose).not.toHaveBeenCalled();expect(s.pool.acquire('puff','pufft',s.texture)).not.toBe(a);
  }finally{s.dispose();}
 });
 it('generation disposal removes active and pooled planes, owns shader clones only, and tolerates late release',()=>{
  const s=fixture();try{
   const active=s.pool.acquire('bang','bangrocket',s.texture),pooled=s.pool.acquire('blood','spatter',s.texture),parent=new THREE.Group();parent.add(active,pooled);s.pool.release(pooled);const materialDispose=vi.spyOn(active.material,'dispose'),wrapperDispose=vi.spyOn(active.material.map!,'dispose'),geometryDispose=vi.spyOn(s.geometry,'dispose'),sourceDispose=vi.spyOn(s.texture,'dispose');s.pool.dispose();s.pool.dispose();expect(active.parent).toBeNull();expect(pooled.parent).toBeNull();expect(materialDispose).toHaveBeenCalledTimes(1);expect(wrapperDispose).toHaveBeenCalledTimes(1);expect(geometryDispose).not.toHaveBeenCalled();expect(sourceDispose).not.toHaveBeenCalled();expect(()=>s.pool.release(active)).not.toThrow();expect(()=>s.pool.acquire('puff','pufft',s.texture)).toThrow();
  }finally{s.dispose();}
 });
});

