import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {captureOriginalSoloLocalGunPose} from './originalSoloLocalGunPose';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from '../shared/originalReceiverLocalWeaponInventory';

const opts={sourceScale:.02,phase:19,maxTextChars:1024};
function fixture(matrix:THREE.Matrix4){return {selectedWeapon:'rifle',models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle,resource,inWorld:false,worldMatrix:matrix.toArray(),groupAncestry:[]}))} as unknown as ReceiverLocalWeaponWorldCheckpoint;}
describe('operation-time selected local RAW gun pose',()=>{
 it('reconstructs the exact transformed RAW matrix at a different provider scale without touching capture fields',()=>{
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,-.4,.2)),m=new THREE.Matrix4().compose(new THREE.Vector3(4,5,6),q,new THREE.Vector3().setScalar(.12)),state=fixture(m),before=JSON.stringify(state),pose=captureOriginalSoloLocalGunPose(state,'rifle',opts);
  const r=pose.rotation!,actual=new THREE.Matrix4().compose(new THREE.Vector3(pose.position.x,pose.position.y,pose.position.z),new THREE.Quaternion(r.x,r.y,r.z,r.w),new THREE.Vector3().setScalar(pose.scale*opts.sourceScale));
  actual.elements.forEach((v,i)=>expect(v).toBeCloseTo(m.elements[i],12));expect(pose.phase).toBe(19);expect(pose.scale).toBe(6);expect(JSON.stringify(state)).toBe(before);expect(Object.isFrozen(pose.position)).toBe(true);expect(Object.isFrozen(pose.rotation)).toBe(true);
 });
 it.each(['wrong-selection','duplicate','absent','sparse','projective','nonfinite','zero','nonuniform','shear','reflection','subnormal','foreign-handle'] as const)('rejects %s instead of supplying a repaired shot pose',kind=>{
  const state=fixture(new THREE.Matrix4()),model=state.models.find(m=>m.resource==='ak47')!,e=model.worldMatrix as number[];
  if(kind==='wrong-selection')Object.assign(state,{selectedWeapon:'pistol'});else if(kind==='duplicate')Object.assign(state.models[0],{resource:'ak47'});else if(kind==='absent')Object.assign(model,{resource:'unknown'});else if(kind==='sparse')delete e[0];else if(kind==='projective')e[3]=1;else if(kind==='nonfinite')e[12]=Infinity;else if(kind==='zero')e[0]=0;else if(kind==='nonuniform')e[0]=2;else if(kind==='shear'){e[4]=.6;e[5]=.8;}else if(kind==='reflection')e[0]=-1;else if(kind==='foreign-handle')Object.assign(model,{handle:'foreign-gun'});else e[0]=e[5]=e[10]=Number.MIN_VALUE;
  expect(()=>captureOriginalSoloLocalGunPose(state,'rifle',opts)).toThrow();
 });
 it('requires explicit finite phase, bounded metadata and representable provider conversion',()=>{
  const state=fixture(new THREE.Matrix4());for(const change of [{phase:-1},{phase:Infinity},{sourceScale:0},{sourceScale:Number.MIN_VALUE},{maxTextChars:2},{maxTextChars:65537}])expect(()=>captureOriginalSoloLocalGunPose(state,'rifle',{...opts,...change})).toThrow();
 });
});
