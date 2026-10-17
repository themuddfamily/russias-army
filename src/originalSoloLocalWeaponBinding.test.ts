import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import type {OriginalWeaponCollection} from './originalWeapons';
import {ORIGINAL_WEAPON_ROTATION,ORIGINAL_WEAPON_UNIT_SCALE as unit} from './originalWeaponPresentation';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponHandle} from '../shared/originalReceiverLocalWeaponInventory';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {captureOriginalSoloLocalWeaponSeed,createOriginalSoloLocalWeaponBinding,type OriginalSoloLocalWeaponSeedOptions} from './originalSoloLocalWeaponBinding';

const handles=Object.keys(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES) as ReceiverLocalWeaponHandle[];
const identity=()=>new THREE.Matrix4().elements;
function fixture(){
 const resources=new Map<string,THREE.Mesh>();
 for(const handle of handles){const mesh=new THREE.Mesh();mesh.matrixWorld.makeTranslation(1,2,3);resources.set(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES[handle],mesh);}
 const collection={resources,rocket:resources.get('rpgrocket')!} as OriginalWeaponCollection;
 const membership=Object.fromEntries(handles.map(handle=>[handle,handle==='ak47'])) as Record<ReceiverLocalWeaponHandle,boolean>;
 const ancestry=Object.fromEntries(handles.map(handle=>[handle,handle==='ak47'?['camera']:[]])) as Record<ReceiverLocalWeaponHandle,string[]>;
 const options:OriginalSoloLocalWeaponSeedOptions={prefix:{kind:'callback',sceneGeneration:1,callback:0},cameraHandle:'camera',cameraWorldMatrix:identity(),renderToWorld:identity(),selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:3,y:-10,z:2}},membership,ancestry,maxTextChars:65536};
 const seed=()=>captureOriginalSoloLocalWeaponSeed(collection,options);
 return {collection,options,membership,ancestry,seed};
}
const model=(state:Pick<ReceiverLocalWeaponWorldCheckpoint,'models'>,handle:ReceiverLocalWeaponHandle)=>state.models.find(row=>row.handle===handle)!;
const policy=(followOffworldParents=true,parentRestoresMembership=true)=>createOriginalSoloLocalWeaponBinding({followOffworldParents,parentRestoresMembership,maxTextChars:65536});
const compare=(actual:readonly number[],expected:readonly number[])=>{expect(actual.length).toBe(expected.length);actual.forEach((v,i)=>expect(v).toBeCloseTo(expected[i],11));};

describe('detached local gun resource seed and explicit parent binding',()=>{
 it('reads actual borrowed mesh WORLD, applies render basis and raw unit once, and never updates resources',()=>{
  const f=fixture(),mesh=f.collection.resources.get('ak47')!,update=vi.spyOn(mesh,'updateMatrixWorld'),before=[...mesh.matrixWorld.elements];
  const basis=new THREE.Matrix4().makeRotationY(.6).setPosition(4,5,6),seed=captureOriginalSoloLocalWeaponSeed(f.collection,{...f.options,renderToWorld:basis.elements});
  const expected=basis.clone().multiply(mesh.matrixWorld).multiply(new THREE.Matrix4().makeScale(unit,unit,unit));
  compare(model(seed,'ak47').worldMatrix,expected.elements);expect(mesh.matrixWorld.elements).toEqual(before);expect(update).not.toHaveBeenCalled();
  mesh.matrixWorld.makeTranslation(90,91,92);f.ancestry.ak47.push('later');expect(model(seed,'ak47').groupAncestry).toEqual(['camera']);compare(model(seed,'ak47').worldMatrix,expected.elements);
  expect(Object.isFrozen(seed.models)).toBe(true);expect(Object.isFrozen(model(seed,'ak47').worldMatrix)).toBe(true);
 });
 it('never derives membership from visibility or the renderer parent',()=>{
  const f=fixture(),parent=new THREE.Group();for(const mesh of f.collection.resources.values()){mesh.visible=false;parent.add(mesh);}
  f.membership.pistol=true;const seed=f.seed();expect(model(seed,'pistol').inWorld).toBe(true);expect(model(seed,'pistol').groupAncestry).toEqual([]);expect(model(seed,'rocket').inWorld).toBe(false);
 });
 it('transports camera descendants including offworld ones only under the declared policy',()=>{
  const f=fixture();f.ancestry.pistol=['camera'];const seed=f.seed(),next=new THREE.Matrix4().makeRotationY(.25).setPosition(8,4,-3);
  for(const follow of [false,true]){const answer=policy(follow)({kind:'camera',cameraWorldMatrix:next.elements},seed);
   compare(model(answer,'ak47').worldMatrix,next.clone().multiply(new THREE.Matrix4().fromArray(model(seed,'ak47').worldMatrix)).elements);
   compare(model(answer,'pistol').worldMatrix,follow?next.clone().multiply(new THREE.Matrix4().fromArray(model(seed,'pistol').worldMatrix)).elements:model(seed,'pistol').worldMatrix);
   compare(model(answer,'spas12').worldMatrix,model(seed,'spas12').worldMatrix);
  }
 });
 it('selects an unparented template retaining old local translation and scale with the fixed copy rotation',()=>{
  const f=fixture(),camera=new THREE.Matrix4().makeRotationX(.4).setPosition(9,8,7),seed=captureOriginalSoloLocalWeaponSeed(f.collection,{...f.options,cameraWorldMatrix:camera.elements});
  const result=policy()({kind:'whichgun',weapon:'pistol'},seed),local=new THREE.Matrix4().compose(new THREE.Vector3(1,2,3),new THREE.Quaternion().setFromEuler(ORIGINAL_WEAPON_ROTATION),new THREE.Vector3(unit,unit,unit));
  compare(model(result,'pistol').worldMatrix,camera.clone().multiply(local).elements);expect(model(result,'pistol').groupAncestry).toEqual(['camera']);expect(model(result,'pistol').inWorld).toBe(true);expect(model(result,'ak47').inWorld).toBe(false);
 });
 it('preserves the complete retained local affine basis during a source position write',()=>{
  const f=fixture(),seed=f.seed(),shear=new THREE.Matrix4().set(unit,.2*unit,0,1,0,unit,0,2,0,0,unit,3,0,0,0,1);
  const state={...seed,models:seed.models.map(row=>row.handle==='ak47'?{...row,worldMatrix:shear.elements}:row)},result=policy()({kind:'position',weapon:'rifle',positionSource:{x:3,y:-10,z:2}},state);
  const expected=shear.clone().setPosition(3*unit,-10*unit,2*unit);compare(model(result,'ak47').worldMatrix,expected.elements);compare(model(seed,'ak47').worldMatrix,new THREE.Matrix4().makeTranslation(1,2,3).multiply(new THREE.Matrix4().makeScale(unit,unit,unit)).elements);
 });
 it('keeps VOID independent of rocket and retains all model poses and parents',()=>{
  const f=fixture();f.membership.rocket=true;f.ancestry.rocket=['rpg','camera'];const seed=captureOriginalSoloLocalWeaponSeed(f.collection,{...f.options,loadedRocket:true}),answer=policy()({kind:'whichgun',weapon:null},seed);
  for(const handle of handles){compare(model(answer,handle).worldMatrix,model(seed,handle).worldMatrix);expect(model(answer,handle).groupAncestry).toEqual(model(seed,handle).groupAncestry);expect(model(answer,handle).inWorld).toBe(handle==='rocket');}
  expect(answer.loadedRocket).toBe(true);
 });
 it('reparents the loaded rocket at zero translation, propagates parent motion, and retains pose when removed',()=>{
  const f=fixture(),seed=f.seed(),selected=policy()({kind:'whichgun',weapon:'rpg'},seed);
  expect(selected.loadedRocket).toBe(false);expect(model(selected,'rocket').groupAncestry).toEqual(['rpg','camera']);expect(model(selected,'rocket').inWorld).toBe(true);compare(model(selected,'rocket').worldMatrix,model(selected,'rpg').worldMatrix);
  const state={...seed,models:selected.models,loadedRocket:selected.loadedRocket,selectedWeapon:'rpg' as const,motion:{...seed.motion,weapon:'rpg' as const}};
  const moved=policy()({kind:'position',weapon:'rpg',positionSource:{x:5,y:-13,z:-20}},state);compare(model(moved,'rocket').worldMatrix,model(moved,'rpg').worldMatrix);
  const removed=policy()({kind:'rocket',loadedRocket:false},{...state,models:moved.models});expect(removed.loadedRocket).toBe(false);expect(model(removed,'rocket').inWorld).toBe(false);compare(model(removed,'rocket').worldMatrix,model(moved,'rocket').worldMatrix);
  expect(model(removed,'rocket').groupAncestry).toEqual(['rpg','camera']);
 });
 it('keeps parent membership restoration an explicit adapter choice',()=>{
  const seed=fixture().seed(),answer=policy(true,false)({kind:'whichgun',weapon:'rpg'},seed);expect(answer.loadedRocket).toBe(false);expect(answer.models.every(row=>!row.inWorld)).toBe(true);
 });
 it('refreshes rocket metadata explicitly without inventing camera ancestry for an unparented RPG',()=>{
  const f=fixture();f.membership.rpg=true;const seed=f.seed(),answer=policy()({kind:'rocket',loadedRocket:true},seed);
  expect(answer.loadedRocket).toBe(true);expect(model(answer,'rocket').inWorld).toBe(true);expect(model(answer,'rocket').groupAncestry).toEqual(['rpg']);
  const afterCamera=policy()({kind:'camera',cameraWorldMatrix:new THREE.Matrix4().makeTranslation(10,11,12).elements},{...seed,models:answer.models,loadedRocket:true});
  compare(model(afterCamera,'rocket').worldMatrix,model(answer,'rocket').worldMatrix);
 });
 it('rejects missing, aliased or foreign rocket resources without mutating borrowed objects',()=>{
  const f=fixture();f.collection.resources.set('pistol',f.collection.resources.get('ak47')!);expect(f.seed).toThrow(/aliased/);
  const other=fixture();other.collection.rocket=new THREE.Mesh();expect(other.seed).toThrow(/aliased/);other.collection.resources.delete('pistol');expect(other.seed).toThrow(/Missing/);
  const duck=fixture();duck.collection.resources.set('pistol',{isMesh:true,matrixWorld:new THREE.Matrix4()} as THREE.Mesh);expect(duck.seed).toThrow(/Missing/);
 });
 it('rejects malformed matrix counts, singular transforms, invalid ancestry and bounded text',()=>{
  const f=fixture();expect(()=>captureOriginalSoloLocalWeaponSeed(f.collection,{...f.options,renderToWorld:[1,2]})).toThrow(/count/);
  expect(()=>captureOriginalSoloLocalWeaponSeed(f.collection,{...f.options,cameraWorldMatrix:new THREE.Matrix4().makeScale(0,1,1).elements})).toThrow(/Singular/);
  expect(()=>captureOriginalSoloLocalWeaponSeed(f.collection,{...f.options,cameraWorldMatrix:new THREE.Matrix4().makeScale(1e-310,1,1).elements})).toThrow(/inverse overflow/);
  f.ancestry.ak47=['pistol'];f.ancestry.pistol=['ak47'];expect(f.seed).toThrow(/Cyclic/);
  expect(()=>captureOriginalSoloLocalWeaponSeed(f.collection,{...f.options,maxTextChars:4})).toThrow(/text budget/);
  expect(()=>captureOriginalSoloLocalWeaponSeed(f.collection,{...f.options,maxTextChars:65537})).toThrow(/text bound/);
 });
 it('fails closed on arithmetic overflow and unsupported immediate parent ownership',()=>{
  const f=fixture(),seed=f.seed();expect(()=>policy()({kind:'camera',cameraWorldMatrix:new THREE.Matrix4().makeScale(1e308,1e308,1e308).elements},seed)).toThrow();
  const unknown={...seed,models:seed.models.map(row=>row.handle==='pistol'?{...row,groupAncestry:['unknown-parent']}:row)};expect(()=>policy()({kind:'whichgun',weapon:'pistol'},unknown)).toThrow(/Unknown/);
  const bad={...seed,models:seed.models.map(row=>row.handle==='ak47'?{...row,worldMatrix:[1]}:row)};expect(()=>policy()({kind:'whichgun',weapon:'rifle'},bad)).toThrow(/count/);
 });
});
