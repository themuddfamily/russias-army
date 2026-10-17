import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import type {OriginalSoldier} from './originalSoldier';
import {OriginalSoloModelPresentation} from './originalSoloModelPresentation';

/** Structural rigs isolate registry identity/ownership. These cases do not
 * establish actual skinned pose, renderer, grounding or gun-parent semantics. */
function fixture(){
 const group=new THREE.Group(),gun=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());
 let phase=0;const setSourceMotionTime=vi.fn((value:number)=>{phase=value;group.position.y-=value===3008 ? .02 : 0;});
 const dispose=vi.fn(()=>group.removeFromParent()),reset=vi.fn();
 const rig={group,setSourceMotionTime,dispose,reset,gun} as unknown as OriginalSoldier;
 return {rig,group,gun,setSourceMotionTime,dispose,reset,phase:()=>phase};
}

describe('source Solo scene-generation model registry ownership',()=>{
 it('moves the same live GI into a corpse without reset, mutation or premature replay reuse',()=>{
  const registry=new OriginalSoloModelPresentation(),first=fixture(),replay=fixture();registry.register('bot-a',first.rig);
  first.group.position.set(3,7,-5);const before=first.group.position.clone();
  expect(registry.bindCorpse('bot-a',1)).toBe(first.rig);expect(registry.active('bot-a')).toBeUndefined();expect(registry.corpse(1)).toBe(first.rig);
  expect(first.group.position).toEqual(before);expect(first.reset).not.toHaveBeenCalled();expect(first.setSourceMotionTime).not.toHaveBeenCalled();
  const factory=vi.fn(()=>replay.rig);expect(registry.acquire('bot-a',factory)).toBe(replay.rig);expect(factory).toHaveBeenCalledOnce();expect(registry.corpse(1)).toBe(first.rig);expect(registry.active('bot-a')).toBe(replay.rig);
  registry.retireMissing(new Set([1]));expect(first.setSourceMotionTime).not.toHaveBeenCalled();expect(registry.debugState().fifo).toEqual([]);
  registry.releaseclear();expect(first.dispose).toHaveBeenCalledOnce();expect(replay.dispose).toHaveBeenCalledOnce();
 });
 it('retires at phase3008, hides/removes once, and reuses all retained state and gun identity FIFO across actors',()=>{
  const registry=new OriginalSoloModelPresentation(),first=fixture(),second=fixture(),parent=new THREE.Group();parent.add(first.group,second.group);
  registry.register('a',first.rig);registry.register('b',second.rig);registry.bindCorpse('a',9);registry.bindCorpse('b',3);
  first.group.position.set(8,6,-2);const firstGun=first.gun;registry.retireMissing(new Set([3]));
  expect(first.phase()).toBe(3008);expect(first.group.visible).toBe(false);expect(first.group.parent).toBeNull();expect(first.setSourceMotionTime).toHaveBeenCalledOnce();expect(first.reset).not.toHaveBeenCalled();expect(first.dispose).not.toHaveBeenCalled();
  const retained=first.group.position.clone();registry.retireMissing(new Set());expect(second.phase()).toBe(3008);registry.retireMissing(new Set());expect(first.setSourceMotionTime).toHaveBeenCalledOnce();expect(second.setSourceMotionTime).toHaveBeenCalledOnce();
  expect(registry.freezeState().fifo).toEqual([first.group.uuid,second.group.uuid]);const factory=vi.fn(()=>fixture().rig);
  expect(registry.acquire('different-owner',factory)).toBe(first.rig);expect(registry.acquire('another-owner',factory)).toBe(second.rig);expect(factory).not.toHaveBeenCalled();expect(first.group.position).toEqual(retained);expect(first.phase()).toBe(3008);expect(first.gun).toBe(firstGun);
  registry.releaseclear();
 });
 it('preflights actor/model/corpse duplicates and exhaustion without factory calls or active eviction',()=>{
  const registry=new OriginalSoloModelPresentation(2),first=fixture(),second=fixture(),third=fixture();registry.register('a',first.rig);registry.register('b',second.rig);const factory=vi.fn(()=>third.rig),before=registry.freezeState();
  expect(()=>registry.acquire('a',factory)).toThrow('already bound');expect(()=>registry.acquire('c',factory)).toThrow('budget');expect(factory).not.toHaveBeenCalled();expect(()=>registry.register('c',first.rig)).toThrow('already owned');expect(()=>registry.register('c',third.rig)).toThrow('budget');expect(registry.freezeState()).toEqual(before);
  registry.bindCorpse('a',1);const bound=registry.freezeState();expect(()=>registry.bindCorpse('b',1)).toThrow('already bound');expect(()=>registry.bindCorpse('missing',2)).toThrow('missing');expect(()=>registry.register('c',first.rig)).toThrow('already owned');expect(registry.freezeState()).toEqual(bound);expect(first.dispose).not.toHaveBeenCalled();expect(second.dispose).not.toHaveBeenCalled();registry.releaseclear();
 });
 it('rejects a factory that aliases an existing corpse and preserves the registry',()=>{
  const registry=new OriginalSoloModelPresentation(),first=fixture();registry.register('a',first.rig);registry.bindCorpse('a',1);const before=registry.freezeState();expect(()=>registry.acquire('b',()=>first.rig)).toThrow('owned model');expect(registry.freezeState()).toEqual(before);registry.releaseclear();
 });
 it('exports detached frozen identities and disposes each inventory handle once at actual scene reset',()=>{
  const registry=new OriginalSoloModelPresentation(),active=fixture(),corpse=fixture(),pooled=fixture();registry.register('active',active.rig);registry.register('dead',corpse.rig);registry.register('retired',pooled.rig);registry.bindCorpse('dead',5);registry.bindCorpse('retired',7);registry.retireMissing(new Set([5]));
  const state=registry.freezeState();expect(Object.isFrozen(state)).toBe(true);expect(Object.isFrozen(state.active)).toBe(true);expect(Object.isFrozen(state.active[0])).toBe(true);expect(Object.isFrozen(state.corpses)).toBe(true);expect(Object.isFrozen(state.fifo)).toBe(true);
  registry.releaseclear();registry.releaseclear();expect(active.dispose).toHaveBeenCalledOnce();expect(corpse.dispose).toHaveBeenCalledOnce();expect(pooled.dispose).toHaveBeenCalledOnce();expect(registry.debugState()).toEqual({allocated:0,active:[],corpses:[],fifo:[]});expect(state.allocated).toBe(3);
  const fresh=fixture();registry.register('fresh',fresh.rig);expect(registry.active('fresh')).toBe(fresh.rig);registry.releaseclear();expect(fresh.dispose).toHaveBeenCalledOnce();
 });
 it('retires only the exact ordered corpse sequence and keeps later newborn acquisition ahead of a later retirement',()=>{
  const registry=new OriginalSoloModelPresentation(),older=fixture(),later=fixture(),born=fixture();registry.register('older',older.rig);registry.register('later',later.rig);registry.bindCorpse('older',1);registry.bindCorpse('later',2);
  expect(registry.acquire('newborn-before-retire',()=>born.rig)).toBe(born.rig);registry.retire(2);expect(registry.corpse(1)).toBe(older.rig);expect(older.setSourceMotionTime).not.toHaveBeenCalled();expect(later.phase()).toBe(3008);
  expect(registry.acquire('newborn-after-retire',()=>{throw Error('Must reuse');})).toBe(later.rig);const before=registry.freezeState();expect(()=>registry.retire(2)).toThrow('missing');expect(registry.freezeState()).toEqual(before);registry.retire(1);expect(registry.freezeState().fifo).toEqual([older.group.uuid]);registry.releaseclear();
 });
 it('clears ownership before disposal and attempts active, corpse and FIFO rigs after an earlier failure without replay',()=>{
  const registry=new OriginalSoloModelPresentation(),active=fixture(),corpse=fixture(),pooled=fixture(),parent=new THREE.Group();
  parent.add(active.group,corpse.group,pooled.group);
  registry.register('active',active.rig);registry.register('corpse',corpse.rig);registry.register('pooled',pooled.rig);
  registry.bindCorpse('corpse',1);registry.bindCorpse('pooled',2);registry.retire(2);
  const failure=Error('injected-first-rig-disposal'),observed:unknown[]=[],fresh=fixture();
  active.dispose.mockImplementation(()=>{observed.push(registry.freezeState());registry.releaseclear();registry.register('fresh',fresh.rig);active.group.removeFromParent();throw failure;});
  let caught:unknown;try{registry.releaseclear();}catch(error){caught=error;}
  expect(caught).toBeInstanceOf(AggregateError);expect((caught as AggregateError).errors).toEqual([failure]);
  expect(observed).toEqual([{allocated:0,active:[],corpses:[],fifo:[]}]);
  expect(active.dispose).toHaveBeenCalledOnce();expect(corpse.dispose).toHaveBeenCalledOnce();expect(pooled.dispose).toHaveBeenCalledOnce();
  expect(active.group.parent).toBeNull();expect(corpse.group.parent).toBeNull();expect(pooled.group.parent).toBeNull();
  expect(registry.active('fresh')).toBe(fresh.rig);expect(registry.freezeState().allocated).toBe(1);expect(fresh.dispose).not.toHaveBeenCalled();
  registry.releaseclear();expect(fresh.dispose).toHaveBeenCalledOnce();expect(active.dispose).toHaveBeenCalledOnce();expect(corpse.dispose).toHaveBeenCalledOnce();expect(pooled.dispose).toHaveBeenCalledOnce();
  expect(registry.freezeState()).toEqual({allocated:0,active:[],corpses:[],fifo:[]});registry.releaseclear();expect(fresh.dispose).toHaveBeenCalledOnce();
 });
 it('rejects invalid budgets and identities without replacing valid bindings',()=>{
  expect(()=>new OriginalSoloModelPresentation(0)).toThrow('budget');expect(()=>new OriginalSoloModelPresentation(1.5)).toThrow('budget');const registry=new OriginalSoloModelPresentation(),first=fixture();expect(()=>registry.register('',first.rig)).toThrow('Invalid');registry.register('a',first.rig);expect(()=>registry.bindCorpse('a',0)).toThrow('Invalid');expect(registry.active('a')).toBe(first.rig);registry.releaseclear();
 });
});
