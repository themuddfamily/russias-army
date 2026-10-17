import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import type {OriginalWeaponCollection} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE as unit} from './originalWeaponPresentation';
import {originalProjectileModelQuaternion} from '../shared/originalProjectileRay';
import {originalProjectileDirection} from '../shared/originalProjectileOrientation';
import {captureOriginalSoloProjectileResource,captureOriginalSoloProjectileSeed,captureOriginalSoloProjectilePose,createOriginalSoloProjectileBirth,type OriginalSoloProjectilePose,type OriginalSoloProjectileResourceOptions} from './originalSoloProjectileBinding';

const identity=()=>new THREE.Matrix4().elements;
const compare=(actual:readonly number[],expected:readonly number[])=>actual.forEach((value,index)=>expect(value).toBeCloseTo(expected[index],11));
function fixture(weapon:'launcher'|'rpg'='launcher'){
 const mesh=new THREE.Mesh();mesh.matrixWorld.makeRotationY(.4).setPosition(8,9,10);mesh.visible=false;
 const options:OriginalSoloProjectileResourceOptions={handle:weapon==='launcher'?'grenade':'rocket',resource:weapon==='launcher'?'rg6grenade':'rpgrocket',inWorld:weapon==='rpg',materialHandle:'captured-material',groupAncestry:weapon==='rpg'?['rpg','camera']:[],renderToWorld:identity(),maxTextChars:65536};
 const model=()=>captureOriginalSoloProjectileResource(mesh,options);
 const sourceRotation={x:10,y:0,z:-90};
 const pose:OriginalSoloProjectilePose={launchId:'flight-one',weapon,position:{x:3,y:4,z:5},direction:weapon==='rpg'?originalProjectileDirection(sourceRotation):{x:1,y:2,z:3},renderToWorld:identity(),orientationPolicy:'copy-source-basis-unit-reset',...(weapon==='rpg'?{sourceRotation}:{})};
 const birth=()=>createOriginalSoloProjectileBirth({launchId:pose.launchId,weapon,freshModel:model(),pose,rocketMaterialHandle:'explicit-rpg',maxTextChars:65536});
 return {mesh,options,model,pose,birth};
}

describe('detached projectile templates and explicit copy pose binding',()=>{
 it('captures already-updated actual mesh WORLD and conversion with raw units once without updating the borrowed renderer',()=>{
  const f=fixture(),update=vi.spyOn(f.mesh,'updateMatrixWorld'),basis=new THREE.Matrix4().makeRotationX(.6).setPosition(4,6,8),old=[...f.mesh.matrixWorld.elements];
  const capture=captureOriginalSoloProjectileResource(f.mesh,{...f.options,renderToWorld:basis.elements});
  compare(capture.worldMatrix,basis.clone().multiply(f.mesh.matrixWorld).scale(new THREE.Vector3(unit,unit,unit)).elements);
  expect(update).not.toHaveBeenCalled();expect(f.mesh.matrixWorld.elements).toEqual(old);expect(capture.inWorld).toBe(false);
  f.mesh.matrixWorld.makeTranslation(100,200,300);expect(capture.worldMatrix[12]).not.toBe(100);expect(Object.isFrozen(capture.worldMatrix)).toBe(true);
 });
 it('takes ancestry, membership and shader labels from caller facts independently of mesh parents and visibility',()=>{
  const f=fixture(),parent=new THREE.Group();parent.add(f.mesh);
  const declared=['declared-parent'],capture=captureOriginalSoloProjectileResource(f.mesh,{...f.options,inWorld:true,groupAncestry:declared});declared.push('later');
  expect(capture.inWorld).toBe(true);expect(capture.groupAncestry).toEqual(['declared-parent']);expect(capture.materialHandle).toBe('captured-material');
 });
 it('seeds only the offworld grenade template and empty actor/catalog/FIFOs, leaving loaded rocket in its local bank',()=>{
  const f=fixture(),rocket=new THREE.Mesh(),collection={resources:new Map([['rg6grenade',f.mesh],['rpgrocket',rocket]])} as OriginalWeaponCollection;
  const seed=captureOriginalSoloProjectileSeed(collection,{prefix:{kind:'receipt',sceneGeneration:2,callback:0,tick:0},renderToWorld:identity(),grenadeMaterialHandle:'template-shader',grenadeAncestry:['templates'],maxTextChars:1024});
  expect(seed.template.handle).toBe('grenade');expect(seed.template.inWorld).toBe(false);expect(seed.models).toEqual([]);expect(seed.catalog).toEqual([]);expect(seed.actors).toEqual([]);expect(seed.fifo).toEqual({launcher:[],rpg:[]});expect(Object.isFrozen(seed.fifo.rpg)).toBe(true);
 });
 it.each(['launcher','rpg'] as const)('creates detached %s clone defaults and constructor uniform-unit pose from captured inputs',weapon=>{
  const f=fixture(weapon),fresh=f.model(),birth=createOriginalSoloProjectileBirth({launchId:f.pose.launchId,weapon,freshModel:fresh,pose:f.pose,rocketMaterialHandle:'explicit-rpg',maxTextChars:65536});
  f.mesh.matrixWorld.makeTranslation(999,999,999);(f.pose.position as {x:number}).x=999;
  const clone=birth.cloneFresh('allocated-flight');expect(clone.handle).toBe('allocated-flight');expect(clone.worldMatrix).toEqual(fresh.worldMatrix);expect(clone.inWorld).toBe(fresh.inWorld);expect(clone.groupAncestry).toEqual(fresh.groupAncestry);
  const reset=birth.resetModel({...clone,worldMatrix:new THREE.Matrix4().makeScale(8,9,10).elements});
  const rotation=originalProjectileModelQuaternion(weapon,f.pose.direction,f.pose.sourceRotation);
  compare(reset.worldMatrix,new THREE.Matrix4().compose(new THREE.Vector3(3,4,5),rotation,new THREE.Vector3(unit,unit,unit)).elements);
  expect(reset.materialHandle).toBe(weapon==='rpg'?'explicit-rpg':'captured-material');expect(reset.groupAncestry).toEqual(fresh.groupAncestry);expect(Object.isFrozen(reset)).toBe(true);
 });
 it('keeps grenade recycled shader and prior explicit ancestry/membership while resetting RPG shader on every constructor',()=>{
  for(const weapon of ['launcher','rpg'] as const){const f=fixture(weapon),birth=f.birth(),retained={...f.model(),handle:'pooled',materialHandle:'retained-shader',inWorld:true,groupAncestry:['retained-parent']};
   const reset=birth.resetModel(retained);expect(reset.materialHandle).toBe(weapon==='rpg'?'explicit-rpg':'retained-shader');expect(reset.inWorld).toBe(true);expect(reset.groupAncestry).toEqual(['retained-parent']);expect(retained.materialHandle).toBe('retained-shader');}
 });
 it.each(['launcher','rpg'] as const)('premultiplies normalized angular orientation in continuing %s pose with conversion exactly once',weapon=>{
  const f=fixture(weapon),angular=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.7),basis=new THREE.Matrix4().makeRotationY(.3).setPosition(9,8,7),orientation={x:angular.x*5,y:angular.y*5,z:angular.z*5,w:angular.w*5};
  const capture=captureOriginalSoloProjectilePose(f.model(),{...f.pose,orientation,renderToWorld:basis.elements},65536),rotation=originalProjectileModelQuaternion(weapon,f.pose.direction,f.pose.sourceRotation,angular);
  compare(capture.model.worldMatrix,basis.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(3,4,5),rotation,new THREE.Vector3(unit,unit,unit))).elements);expect(capture.launchId).toBe('flight-one');expect(capture.model.materialHandle).toBe('captured-material');
 });
 it('never parks retired models at the dummy rigidbody position or invents offworld membership during continuation',()=>{
  const f=fixture(),model=f.model(),capture=captureOriginalSoloProjectilePose(model,{...f.pose,position:{x:3,y:4,z:-6}},65536);expect(capture.model.inWorld).toBe(false);expect(capture.model.worldMatrix[14]).toBe(-6);expect(model.worldMatrix[14]).toBe(10);
 });
 it('requires allocator naming and exact birth family/launch identity and never repairs a foreign reset resource',()=>{
  const f=fixture(),birth=f.birth();expect(()=>birth.cloneFresh()).toThrow(/text/);expect(()=>birth.cloneFresh(' ')).toThrow(/text/);
  expect(()=>birth.resetModel({...f.model(),resource:'rpgrocket'})).toThrow(/resource mismatch/);
  expect(()=>createOriginalSoloProjectileBirth({launchId:'another',weapon:'launcher',freshModel:f.model(),pose:f.pose,rocketMaterialHandle:'rpg',maxTextChars:65536})).toThrow(/identity mismatch/);
  expect(()=>captureOriginalSoloProjectilePose({...f.model(),resource:'rpgrocket'},f.pose,65536)).toThrow(/resource mismatch/);
 });
 it('rejects missing RPG rotation, unknown policy, zero direction, malformed and overflowing angular operands',()=>{
  const f=fixture('rpg');expect(()=>captureOriginalSoloProjectilePose(f.model(),{...f.pose,sourceRotation:undefined},65536)).toThrow(/requires/);
  expect(()=>captureOriginalSoloProjectilePose(f.model(),{...f.pose,orientationPolicy:'guessed' as OriginalSoloProjectilePose['orientationPolicy']},65536)).toThrow(/policy/);
  expect(()=>captureOriginalSoloProjectilePose(f.model(),{...f.pose,direction:{x:0,y:0,z:0}},65536)).toThrow(/direction/);
  expect(()=>captureOriginalSoloProjectilePose(f.model(),{...f.pose,sourceRotation:{x:10,y:20,z:-90}},65536)).toThrow(/does not match/);
  expect(()=>captureOriginalSoloProjectilePose(f.model(),{...f.pose,direction:{x:0,y:0,z:1}},65536)).toThrow(/does not match/);
  const grenade=fixture();expect(()=>captureOriginalSoloProjectilePose(grenade.model(),{...grenade.pose,sourceRotation:{x:0,y:0,z:0}},65536)).toThrow(/cannot use/);
  for(const orientation of [{x:0,y:0,z:0,w:0},{x:Infinity,y:0,z:0,w:1},{x:1.7e308,y:1.7e308,z:0,w:0}])expect(()=>captureOriginalSoloProjectilePose(f.model(),{...f.pose,orientation},65536)).toThrow(/angular/);
 });
 it('fails closed on foreign mesh, malformed affine captures and singular or inverse-overflow conversions',()=>{
  const f=fixture();expect(()=>captureOriginalSoloProjectileResource({isMesh:true,matrixWorld:new THREE.Matrix4()} as THREE.Mesh,f.options)).toThrow(/borrowed mesh/);
  expect(()=>captureOriginalSoloProjectileResource(f.mesh,{...f.options,renderToWorld:[]})).toThrow(/matrix count/);
  const perspective=identity();perspective[3]=.1;expect(()=>captureOriginalSoloProjectileResource(f.mesh,{...f.options,renderToWorld:perspective})).toThrow(/Nonaffine/);
  expect(()=>captureOriginalSoloProjectileResource(f.mesh,{...f.options,renderToWorld:new THREE.Matrix4().makeScale(0,1,1).elements})).toThrow(/Singular/);
  expect(()=>captureOriginalSoloProjectileResource(f.mesh,{...f.options,renderToWorld:new THREE.Matrix4().makeScale(1e-310,1,1).elements})).toThrow(/inverse overflow/);
 });
 it('bounds text before copying ancestry and rejects duplicate or self parent labels',()=>{
  const f=fixture();expect(()=>captureOriginalSoloProjectileResource(f.mesh,{...f.options,maxTextChars:65537})).toThrow(/text bound/);
  expect(()=>captureOriginalSoloProjectileResource(f.mesh,{...f.options,maxTextChars:4})).toThrow(/text budget/);
  expect(()=>captureOriginalSoloProjectileResource(f.mesh,{...f.options,groupAncestry:['p','P']})).toThrow(/ancestry/);
  expect(()=>captureOriginalSoloProjectileResource(f.mesh,{...f.options,groupAncestry:['GRENADE']})).toThrow(/ancestry/);
  const sparse=new Array(65537) as string[];expect(()=>captureOriginalSoloProjectileResource(f.mesh,{...f.options,groupAncestry:sparse})).toThrow(/model/);
  const model=f.model();expect(()=>captureOriginalSoloProjectilePose(model,f.pose,model.handle.length+model.resource.length+model.materialHandle.length)).toThrow(/text budget/);
 });
});
