import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createOriginalProjectileRayGeometry,originalProjectileModelQuaternion,raycastOriginalProjectileMesh,raycastOriginalProjectileModel,type OriginalProjectileRayMesh} from './originalProjectileRay';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import {createOriginalWeaponGeometry,type OriginalMeshData} from '../src/originalWeapons';
import {Game} from '../src/game';

const data=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as {meshes:OriginalMeshData[]};
const zero={x:0,y:0,z:0},identity=new THREE.Quaternion(),front={x:0,y:0,z:-1};
const triangle:OriginalProjectileRayMesh={positions:[[-100,-100,0],[100,-100,0],[0,100,0]],faces:[[0,1,2]]};
// Fixed witnesses retained by the bounded mesh-hull-gap probe. These are convex
// combinations of displayed vertices, not evidence of native ray sidedness,
// strict hull interior, or a particular Havok hull construction algorithm.
const assetConvexCombinationMisses=[
 {resource:'rg6grenade',a:[-.0014732922427356243,.028997812420129776,-.016741957515478134],b:[-.0014732922427356243,.033140480518341064,0],point:[-.0014732922427356243,.03106914646923542,-.008370978757739067],origin:[-2.0014732922427356,.03106914646923542,-.008370978757739067],direction:[1,0,0]},
 {resource:'rpgrocket',a:[-.2932584583759308,.009633734822273254,.1197548508644104],b:[-.4968830645084381,-.021563299000263214,.09325813502073288],point:[-.39507076144218445,-.00596478208899498,.10650649294257164],origin:[-.39507076144218445,-2.005964782088995,.10650649294257164],direction:[0,1,0]},
] as const;
function witness(geometry:THREE.BufferGeometry,matrix:THREE.Matrix4):{origin:THREE.Vector3;direction:THREE.Vector3} {
 const positions=geometry.getAttribute('position'),indices=geometry.index!;
 const points=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(positions,indices.getX(i)).applyMatrix4(matrix));
 const center=points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1/3),normal=THREE.Triangle.getNormal(points[0],points[1],points[2],new THREE.Vector3());
 return {origin:center.clone().addScaledVector(normal,2),direction:normal.negate()};
}

describe('finite original projectile bullet model triangles',()=>{
 it.each([['launcher','rg6grenade',129,144],['rpg','rpgrocket',195,140]] as const)('%s preserves every displayed Float32 vertex and indexed face',(_weapon,resource,vertices,faces)=>{
  const raw=data.meshes.find(m=>m.resource===resource)!,geometry=createOriginalProjectileRayGeometry(raw),renderer=createOriginalWeaponGeometry(raw);
  try{
   expect(geometry.getAttribute('position').count).toBe(vertices);expect(geometry.index!.count).toBe(faces*3);
   expect(Array.from(geometry.getAttribute('position').array)).toEqual(Array.from(renderer.getAttribute('position').array));
   expect(Array.from(geometry.index!.array)).toEqual(Array.from(renderer.index!.array));
  }finally{geometry.dispose();renderer.dispose();}
 });

 it.each(['launcher','rpg'] as const)('%s matches actual Game orientation and Three nearest ray over packaged triangles',weapon=>{
  const raw=data.meshes.find(m=>m.resource===(weapon==='rpg'?'rpgrocket':'rg6grenade'))!,geometry=createOriginalProjectileRayGeometry(raw),renderer=createOriginalWeaponGeometry(raw);
  const direction=new THREE.Vector3(-2,1,3).normalize(),rotation=weapon==='rpg'?{x:113,y:27,z:-2377}:undefined;
  const orientation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,2,3).normalize(),.37),angular={orientation};
  const mesh=new THREE.Mesh(renderer,new THREE.MeshBasicMaterial({side:THREE.FrontSide}));mesh.name=`retained-flight-${weapon}`;mesh.userData.sourceProjectile=true;mesh.userData.sourceProjectileWeapon=weapon;
  (Game.prototype as any).orientProjectileMesh.call({},mesh,direction,rotation,angular);
  const quaternion=originalProjectileModelQuaternion(weapon,direction,rotation,orientation);expect(quaternion.toArray()).toEqual(mesh.quaternion.toArray());
  mesh.position.set(2,4,-3);mesh.updateWorldMatrix(true,false);const ray=witness(renderer,mesh.matrixWorld),caster=new THREE.Raycaster(ray.origin,ray.direction,0,5),expected=caster.intersectObject(mesh,false)[0];
  expect(expected).toBeDefined();const result=raycastOriginalProjectileModel(geometry,mesh.position,quaternion,ray.origin,ray.direction,5,'flight')!;
  expect(result.id).toBe('flight');expect(result.distance).toBeCloseTo(expected.distance,12);expect(new THREE.Vector3().copy(result.point).distanceTo(expected.point)).toBeLessThan(1e-12);
  expect(raycastOriginalProjectileModel(geometry,mesh.position,quaternion,ray.origin,ray.direction,expected.distance-.01,'flight')).toBeNull();
  geometry.dispose();renderer.dispose();(mesh.material as THREE.Material).dispose();
 });

 it('retains the direction-only RPG renderer fallback without angular premultiplication',()=>{
  const direction=new THREE.Vector3(1,2,3).normalize(),orientation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),1);
  const mesh=new THREE.Mesh();mesh.userData.sourceProjectile=true;mesh.name='original-flight-rpg';
  (Game.prototype as any).orientProjectileMesh.call({},mesh,direction,undefined,{orientation});
  expect(originalProjectileModelQuaternion('rpg',direction,undefined,orientation).toArray()).toEqual(mesh.quaternion.toArray());
  mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();
 });

 it('keeps a real triangle opening instead of filling it with the physical convex hull',()=>{
  // Four quads form a frame: the convex support hull covers the center, the
  // actual indexed render surface leaves that center open.
  const positions:number[][]=[],faces:number[][]=[];
  for(const [x0,y0,x1,y1] of [[-100,-100,-20,100],[20,-100,100,100],[-20,-100,20,-20],[-20,20,20,100]]){
   const i=positions.length;positions.push([x0,y0,0],[x1,y0,0],[x1,y1,0],[x0,y1,0]);faces.push([i,i+1,i+2],[i,i+2,i+3]);
  }
  const geometry=createOriginalProjectileRayGeometry({positions,faces});
  try{
   const origin={x:0,y:0,z:1};expect(geometry.boundingBox!.containsPoint(new THREE.Vector3(0,0,0))).toBe(true);
   expect(raycastOriginalProjectileModel(geometry,zero,identity,origin,front,2,'opening')).toBeNull();
   expect(raycastOriginalProjectileModel(geometry,zero,identity,{x:60*S,y:0,z:1},front,2,'frame')?.distance).toBeCloseTo(1,12);
  }finally{geometry.dispose();}
 });

 it.each(assetConvexCombinationMisses)('$resource FrontSide triangle rays miss a known convex combination of actual displayed vertices',sample=>{
  const raw=data.meshes.find(m=>m.resource===sample.resource)!,geometry=createOriginalProjectileRayGeometry(raw),renderer=createOriginalWeaponGeometry(raw),material=new THREE.MeshBasicMaterial({side:THREE.FrontSide}),mesh=new THREE.Mesh(renderer,material);
  try{
   const positions=renderer.getAttribute('position'),vertices=Array.from({length:positions.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(positions,i).toArray());
   expect(vertices).toContainEqual([...sample.a]);expect(vertices).toContainEqual([...sample.b]);
   const midpoint=new THREE.Vector3().fromArray(sample.a).add(new THREE.Vector3().fromArray(sample.b)).multiplyScalar(.5),point=new THREE.Vector3().fromArray(sample.point),origin=new THREE.Vector3().fromArray(sample.origin),direction=new THREE.Vector3().fromArray(sample.direction);
   expect(midpoint.distanceTo(point)).toBe(0);expect(origin.clone().addScaledVector(direction,2).distanceTo(point)).toBeLessThan(1e-15);
   mesh.updateWorldMatrix(true,false);expect(new THREE.Raycaster(origin,direction,0,4).intersectObject(mesh,false)).toHaveLength(0);
   expect(raycastOriginalProjectileModel(geometry,zero,identity,origin,direction,4,sample.resource)).toBeNull();
  }finally{geometry.dispose();renderer.dispose();material.dispose();}
 });

 it('uses FrontSide, finite range, normalized query direction and detached results',()=>{
  const geometry=createOriginalProjectileRayGeometry(triangle),origin={x:0,y:0,z:2};
  try{
   const first=raycastOriginalProjectileModel(geometry,zero,identity,origin,{x:0,y:0,z:-4},3,'first')!;
   expect(first.distance).toBe(2);expect(first.normal.z).toBe(1);(first.point as {x:number}).x=999;(first.normal as {z:number}).z=999;
   expect(raycastOriginalProjectileModel(geometry,zero,identity,origin,front,3,'next')).toMatchObject({id:'next',point:{x:0,y:0,z:0},normal:{x:0,y:0,z:1}});
   expect(raycastOriginalProjectileModel(geometry,zero,identity,{x:0,y:0,z:-2},{x:0,y:0,z:1},3,'back')).toBeNull();
   expect(raycastOriginalProjectileModel(geometry,zero,identity,origin,front,1.99,'short')).toBeNull();
   expect(raycastOriginalProjectileModel(geometry,{x:0,y:0,z:-1},identity,origin,front,5,'moved')?.distance).toBe(3);
   expect(raycastOriginalProjectileModel(geometry,zero,identity,origin,front,3,'restored')?.distance).toBe(2);
  }finally{geometry.dispose();}
 });

 it('queries actual parent matrices and material sidedness without visibility inference',()=>{
  const geometry=createOriginalProjectileRayGeometry(triangle),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material),parent=new THREE.Group();
  parent.position.set(2,3,4);parent.rotation.y=.4;parent.scale.set(2,1,3);parent.add(mesh);mesh.visible=false;parent.updateWorldMatrix(true,true);
  try{
   const ray=witness(geometry,mesh.matrixWorld),expected=new THREE.Raycaster(ray.origin,ray.direction,0,4).intersectObject(mesh,false)[0];
   expect(raycastOriginalProjectileMesh(mesh,ray.origin,ray.direction,4,'parent')?.distance).toBeCloseTo(expected.distance,12);
   const reverseOrigin=ray.origin.clone().addScaledVector(ray.direction,4),reverse=ray.direction.clone().negate();
   expect(raycastOriginalProjectileMesh(mesh,reverseOrigin,reverse,4,'back')?.distance).toBeCloseTo(2,12);
  }finally{geometry.dispose();material.dispose();}
 });

 it('selects the closest indexed triangle independent of face order',()=>{
  const geometry=createOriginalProjectileRayGeometry({positions:[[-100,-100,-100],[100,-100,-100],[0,100,-100],...triangle.positions],faces:[[0,1,2],[3,4,5]]});
  try{expect(raycastOriginalProjectileModel(geometry,zero,identity,{x:0,y:0,z:2},front,10,'nearest')?.distance).toBe(2);}finally{geometry.dispose();}
 });

 it('rejects sparse, nonfinite, oversized or invalid numeric source geometry and invalid queries',()=>{
  for(const raw of [{positions:new Array(3),faces:[[0,1,2]]},{...triangle,positions:[[NaN,0,0],...triangle.positions.slice(1)]},{...triangle,positions:[[Number.MAX_VALUE,0,0],...triangle.positions.slice(1)]},{...triangle,faces:[[0,1,3]]},{...triangle,faces:[new Array(3)]},{...triangle,positions:Array.from({length:513},()=>[0,0,0])},{...triangle,faces:Array.from({length:1025},()=>[0,1,2])}])expect(()=>createOriginalProjectileRayGeometry(raw)).toThrow();
  const geometry=createOriginalProjectileRayGeometry(triangle);
  try{
   for(const [origin,direction,max] of [[zero,zero,5],[{x:NaN,y:0,z:0},front,5],[zero,front,Infinity],[zero,front,-1]] as const)expect(raycastOriginalProjectileModel(geometry,zero,identity,origin,direction,max,'invalid')).toBeNull();
   expect(()=>originalProjectileModelQuaternion('launcher',zero)).toThrow();
   expect(()=>raycastOriginalProjectileModel(geometry,{x:Infinity,y:0,z:0},identity,zero,front,5,'invalid')).toThrow();
  }finally{geometry.dispose();}
 });
});
