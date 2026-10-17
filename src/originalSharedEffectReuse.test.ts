import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {OriginalEffectPlanePool} from './originalEffectPlanePool';
import {createOriginalCombatEffectResources,OriginalCombatEffectPresentation} from './originalCombatEffectPresentation';
import {createOriginalExplosionResources,OriginalExplosionPresentation} from './originalExplosionPresentation';

const origin={x:0,y:0,z:0},eye={x:4,y:5,z:12};
function fixture(options?:{maxModels?:number;maxShaders?:number}){
 const combatResources=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decal:new THREE.Texture(),decalspas:new THREE.Texture(),pufft:new THREE.Texture()}),explosionResources=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()}),parent=new THREE.Group(),pool=new OriginalEffectPlanePool(combatResources.geometry,options),combat=new OriginalCombatEffectPresentation(combatResources,parent,pool),explosions=new OriginalExplosionPresentation(explosionResources,parent,pool);
 return {combatResources,explosionResources,parent,pool,combat,explosions,dispose(){combat.dispose();explosions.dispose();pool.dispose();combatResources.dispose();explosionResources.dispose();}};
}

describe('shared combat/explosion model and shader reuse (CPU parent adapter)',()=>{
 it('reuses a plane across miss, blood, bang and puff with constructor orientation retained where source does not pointAt',()=>{
  const s=fixture();try{
   const miss=s.combat.spawnMiss(origin,{x:.6,y:.4,z:.8},false),mesh=miss.mesh,rotation=mesh.quaternion.clone();s.combat.remove(miss.id);const blood=s.combat.spawnBlood({x:2,y:3,z:4});expect(blood.mesh).toBe(mesh);expect(blood.mesh.quaternion.toArray()).toEqual(rotation.toArray());s.combat.remove(blood.id);const bang=s.explosions.spawn('bang','grenade',{x:2,y:3,z:4});expect(bang.mesh).toBe(mesh);expect(bang.mesh.quaternion.toArray()).toEqual(rotation.toArray());s.explosions.step({x:2,y:40,z:4});expect(bang.mesh.quaternion.toArray()).toEqual(rotation.toArray());s.explosions.remove('bang');
   const puff=s.combat.spawnPuff(origin,eye,()=>0);expect(puff.mesh).toBe(mesh);expect(puff.mesh.quaternion.angleTo(rotation)).toBeGreaterThan(.01);const puffRotation=puff.mesh.quaternion.clone();s.combat.remove(puff.id);const next=s.explosions.spawn('next','rocket',origin);expect(next.mesh).toBe(mesh);expect(next.mesh.quaternion.toArray()).toEqual(puffRotation.toArray());expect(mesh.geometry).toBe(s.combatResources.geometry);expect(s.pool.stats().allocated).toBe(1);
  }finally{s.dispose();}
 });
 it('interleaved named planes decouple plane FIFO from puff/bang material and UV-wrapper FIFO',()=>{
  const s=fixture();try{
   const puff=s.combat.spawnPuff(origin,eye,()=>0,'p'),shaderA=puff.mesh.material,wrapperA=shaderA.map!,miss=s.combat.spawnMiss(origin,{x:0,y:1,z:0},false,'m'),bang=s.explosions.spawn('b','rocket',origin),shaderB=bang.mesh.material,wrapperB=shaderB.map!;s.combat.remove('m');s.combat.remove('p');s.explosions.remove('b');
   const nextBang=s.explosions.spawn('new-b','grenade',origin),nextPuff=s.combat.spawnPuff(origin,eye,()=>0,'new-p');expect(nextBang.mesh).toBe(miss.mesh);expect(nextBang.mesh.material).toBe(shaderA);expect(nextBang.mesh.material.map).toBe(wrapperA);expect(nextPuff.mesh).toBe(puff.mesh);expect(nextPuff.mesh.material).toBe(shaderB);expect(nextPuff.mesh.material.map).toBe(wrapperB);expect(wrapperA.repeat.toArray()).toEqual([.25,.25]);expect(wrapperB.repeat.toArray()).toEqual([1,1]);s.explosions.step(eye);expect(wrapperA.offset.toArray()).toEqual([.25,.75]);expect(wrapperB.offset.toArray()).toEqual([0,0]);expect(s.combatResources.textures.pufft.repeat.toArray()).toEqual([1,1]);expect(s.explosionResources.textures.grenade.repeat.toArray()).toEqual([1,1]);
  }finally{s.dispose();}
 });
 it('blood actors across distinct presenters share one named material and newborn atlas reset without resetting older lifetime',()=>{
  const s=fixture(),other=new OriginalCombatEffectPresentation(s.combatResources,s.parent,s.pool);try{
   const old=s.combat.spawnBlood(origin);s.combat.step(eye);expect(old.mesh.material.map!.offset.x).toBeCloseTo(0);const young=other.spawnBlood({x:1,y:0,z:0});expect(young.mesh.material).toBe(old.mesh.material);expect(young.mesh.material.map).toBe(old.mesh.material.map);expect(old.mesh.material.map!.offset.x).toBeCloseTo(-1/3);expect(old.state).toMatchObject({remainingCallbacks:4});s.combat.step(eye);other.step(eye);expect(s.pool.bloodTexturePosition).toEqual({x:-1,y:1,z:0});expect(old.mesh.material.map!.offset.x).toBeCloseTo(1/3);expect(old.state).toMatchObject({remainingCallbacks:0});expect(young.state).toMatchObject({remainingCallbacks:4});
  }finally{other.dispose();s.dispose();}
 });
 it('failed model/shader admission preserves replaced IDs and every live blood atlas/lifetime before allowing recycled replacement credit',()=>{
  const s=fixture({maxModels:2,maxShaders:2});try{
   const blood=s.combat.spawnBlood(origin,eye,'blood');s.combat.step(eye);const old=s.combat.spawnPuff(origin,eye,()=>0,'old'),before=s.pool.stats(),offset=blood.mesh.material.map!.offset.clone(),position={...s.pool.bloodTexturePosition};
   expect(()=>s.combat.spawnBlood({x:1,y:2,z:3},eye,'third')).toThrow();expect(()=>s.combat.spawnMiss(origin,{x:0,y:1,z:0},false,'old')).toThrow();expect(s.combat.get('old')).toBe(old);expect(s.combat.get('blood')).toBe(blood);expect(blood.mesh.material.map!.offset).toEqual(offset);expect(s.pool.bloodTexturePosition).toEqual(position);expect(blood.state).toMatchObject({remainingCallbacks:4});expect(s.pool.stats()).toEqual(before);
   const replacement=s.combat.spawnPuff({x:3,y:2,z:1},eye,()=>0,'old');expect(replacement.mesh).toBe(old.mesh);expect(s.combat.size).toBe(2);expect(blood.mesh.material.map!.offset).toEqual(offset);
  }finally{s.dispose();}
 });
 it('borrowed presenter cleanup releases only its effects while standalone presenter owns and disposes its own shader pool',()=>{
  const s=fixture(),own=new OriginalCombatEffectPresentation(s.combatResources,new THREE.Group());try{
   const puff=s.combat.spawnPuff(origin,eye,()=>0),bang=s.explosions.spawn('b','rocket',origin),geometryDispose=vi.spyOn(s.combatResources.geometry,'dispose'),sourceDispose=vi.spyOn(s.combatResources.textures.pufft,'dispose');s.combat.dispose();expect(puff.mesh.parent).toBeNull();expect(bang.mesh.parent).toBe(s.parent);expect(s.pool.isDisposed).toBe(false);expect(s.pool.stats().active).toBe(1);expect(geometryDispose).not.toHaveBeenCalled();expect(sourceDispose).not.toHaveBeenCalled();
   const owned=own.spawnPuff(origin,eye,()=>0),materialDispose=vi.spyOn(owned.mesh.material,'dispose'),wrapperDispose=vi.spyOn(owned.mesh.material.map!,'dispose');own.dispose();own.dispose();expect(own.planePool.isDisposed).toBe(true);expect(materialDispose).toHaveBeenCalledTimes(1);expect(wrapperDispose).toHaveBeenCalledTimes(1);expect(geometryDispose).not.toHaveBeenCalled();expect(sourceDispose).not.toHaveBeenCalled();
  }finally{own.dispose();s.dispose();}
 });
 it('pool teardown removes all active models and late presenter callbacks/cleanup cannot re-admit them',()=>{
  const s=fixture();try{
   const puff=s.combat.spawnPuff(origin,eye,()=>0),blood=s.combat.spawnBlood(origin),bang=s.explosions.spawn('b','grenade',origin);s.pool.dispose();expect(puff.mesh.parent).toBeNull();expect(blood.mesh.parent).toBeNull();expect(bang.mesh.parent).toBeNull();expect(()=>s.combat.step(eye)).not.toThrow();expect(()=>s.explosions.step(eye)).toThrow('disposed');expect(s.combat.size).toBe(0);expect(s.explosions.get('b')).toBe(bang);expect(bang.frame).toBe(0);expect(()=>s.explosions.clear()).not.toThrow();expect(()=>s.explosions.clear()).not.toThrow();expect(s.explosions.size).toBe(0);expect(()=>s.combat.spawnBlood(origin)).toThrow();expect(()=>s.explosions.spawn('new','rocket',origin)).toThrow();expect(s.parent.children).toEqual([]);
  }finally{s.dispose();}
 });
 it('shared leases retain strict miss81/blood3/puff31/bang16 clocks and goody guards without allocating replacement identities',()=>{
  const s=fixture();try{
   const miss=s.combat.spawnMiss(origin,{x:0,y:1,z:0},false,'m'),blood=s.combat.spawnBlood(origin,eye,'blood'),puff=s.combat.spawnPuff(origin,eye,()=>0,'p'),bang=s.explosions.spawn('b','rocket',origin);s.combat.stepCallbacks(null,30);for(let i=0;i<16;i++)s.explosions.step(null);expect(s.combat.get('p')).toBe(puff);expect(blood.state).toMatchObject({remainingCallbacks:8});expect(bang.frame).toBe(0);s.combat.step(null);expect(s.combat.get('p')).toBeUndefined();for(let i=0;i<2;i++)s.combat.step(eye);expect(s.combat.get('blood')).toBe(blood);s.combat.step(eye);expect(s.combat.get('blood')).toBeUndefined();s.combat.stepCallbacks(null,46);expect(s.combat.get('m')).toBe(miss);s.combat.step(null);expect(s.combat.get('m')).toBeUndefined();for(let i=0;i<15;i++)s.explosions.step(eye);expect(s.explosions.get('b')).toBe(bang);s.explosions.step(eye);expect(s.explosions.get('b')).toBeUndefined();expect(s.pool.stats()).toMatchObject({allocated:4,active:0,pooled:4});expect(s.combat.spawnBlood(origin).mesh).toBe(puff.mesh);
  }finally{s.dispose();}
 });
 it('actual Game reset clears both presenter owners before pool generation reset and creates fresh identity afterward',()=>{
  const s=fixture(),game=Object.assign(Object.create(Game.prototype),{originalCombatEffectPresentation:s.combat,originalExplosionPresentation:s.explosions,originalEffectPlanePool:s.pool}) as any;try{
   const old=s.combat.spawnPuff(origin,eye,()=>0),bang=s.explosions.spawn('b','grenade',origin),combatClear=vi.spyOn(s.combat,'clear'),bangClear=vi.spyOn(s.explosions,'clear'),reset=vi.spyOn(s.pool,'reset');expect(()=>game.resetOriginalPlaneEffects()).not.toThrow();expect(old.mesh.parent).toBeNull();expect(bang.mesh.parent).toBeNull();expect(s.combat.size).toBe(0);expect(s.explosions.size).toBe(0);expect(combatClear.mock.invocationCallOrder[0]).toBeLessThan(reset.mock.invocationCallOrder[0]);expect(bangClear.mock.invocationCallOrder[0]).toBeLessThan(reset.mock.invocationCallOrder[0]);expect(s.pool.stats().allocated).toBe(0);expect(s.combat.spawnPuff(origin,eye,()=>0).mesh).not.toBe(old.mesh);
  }finally{s.dispose();}
 });
});
