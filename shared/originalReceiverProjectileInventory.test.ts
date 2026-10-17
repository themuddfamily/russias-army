import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalReceiverProjectileInventory,type ReceiverProjectileModelCapture,type ReceiverProjectileInventoryOptions} from './originalReceiverProjectileInventory';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import {createOriginalProjectileRayGeometry,originalProjectileModelQuaternion,raycastOriginalProjectileMesh} from './originalProjectileRay';
import {createOriginalReceiverSceneRay,ORIGINAL_RECEIVER_SCENE_LAYERS} from './originalReceiverSceneRay';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const weapons=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as ReceiverWeaponGeometry;
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const options:ReceiverProjectileInventoryOptions={sceneGeneration:3,provenance:'decoded-projectile-current-pose-adapter',sidedness:'front',maxModels:32,maxVertices:100000,maxFaces:100000};
const prefix=(tick=0):ReceiverScenePrefix=>({sceneGeneration:3,callback:0,kind:'receipt',tick});
const template=():ReceiverProjectileModelCapture=>({handle:'grenade',resource:'rg6grenade',inWorld:false,worldMatrix:[...I],groupAncestry:[]});
const model=(handle='captured-flight',resource:'rg6grenade'|'rpgrocket'='rg6grenade'):ReceiverProjectileModelCapture=>({handle,resource,inWorld:true,worldMatrix:[...I],groupAncestry:[]});
const vector=(point:{x:number;y:number;z:number})=>new THREE.Vector3(point.x,point.y,point.z);

describe('explicit private projectile inventory (no naming/physics/native chronology inference)',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const)
  it(`${map} ${weapon}: decoded rigid triangles and captured angular basis match the existing displayed projectile ray adapter`,()=>{
   const resource=weapon==='launcher'?'rg6grenade':'rpgrocket',raw=weapons.meshes.find(mesh=>mesh.resource===resource)!;
   const geometry=createOriginalProjectileRayGeometry(raw),material=new THREE.MeshBasicMaterial({side:THREE.FrontSide}),mesh=new THREE.Mesh(geometry,material);
   try{
    const origin=new THREE.Vector3(4,100,-3),direction=new THREE.Vector3(1,0,0),angular=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.31);
    mesh.quaternion.copy(originalProjectileModelQuaternion(weapon,direction,{x:-25,y:5,z:40},angular));
    const vertices=geometry.getAttribute('position'),indices=geometry.index!;let center:THREE.Vector3|undefined;
    for(let face=0;face<indices.count;face+=3){
     const [a,b,c]=[0,1,2].map(corner=>new THREE.Vector3().fromBufferAttribute(vertices,indices.getX(face+corner)).applyQuaternion(mesh.quaternion));
     if(b.clone().sub(a).cross(c.clone().sub(a)).normalize().dot(direction)<-.2){center=a.add(b).add(c).multiplyScalar(1/3);break;}
    }
    if(!center)throw Error('No real source projectile triangle witness');
    mesh.position.copy(origin).addScaledVector(direction,2).sub(center);mesh.updateMatrixWorld(true);
    // Existing helper geometry uses Float32(source*scale). Inventory preserves
    // raw decoded arrays, applying that declared unit conversion in WORLD once.
    const world=new THREE.Matrix4().compose(mesh.position,mesh.quaternion,new THREE.Vector3().setScalar(ORIGINAL_MAP_SCALE)).toArray(),handle=`declared-${map}-${weapon}`;
    const captured:ReceiverProjectileModelCapture={handle,resource,inWorld:true,worldMatrix:world,groupAncestry:[]},p=prefix(),snapshot=createOriginalReceiverProjectileInventory(weapons,options).snapshotAt(p,{prefix:p,expectedHandles:['grenade',handle],models:[template(),captured]});
    const query=createOriginalReceiverSceneRay(snapshot.triangles,{prefix:p,sceneGeneration:3,callback:0,expectedHandles:['grenade',handle],accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]},{maxModels:32,maxVertices:100000,maxTriangles:100000});
    const displayed=raycastOriginalProjectileMesh(mesh,origin,direction,700,handle),actual=query.nearestDetailed(origin,direction,{maxDistance:700});
    expect(displayed).not.toBeNull();expect(actual).not.toBeNull();expect(actual!.handle).toBe(handle);expect(actual!.distance).toBeCloseTo(displayed!.distance,5);
    expect(vector(actual!.point).distanceTo(vector(displayed!.point))).toBeLessThan(1e-5);
    expect(snapshot.missing).toEqual([]);expect(snapshot.models[1]).toMatchObject({kind:'projectile',resource,worldMatrix:world});
    expect(snapshot.triangles[1].positions).toEqual(raw.positions);expect(snapshot.triangles[1].faces).toEqual(raw.faces);
    expect(snapshot.triangles[1].positions).toHaveLength(raw.positions.length);expect(snapshot.triangles[1].faces).toHaveLength(raw.faces.length);
   }finally{geometry.dispose();material.dispose();}
  });
 it('includes offworld template/pool handles and discloses independently expected omissions',()=>{
  const inventory=createOriginalReceiverProjectileInventory(weapons,options),p=prefix(),pooled={...model('retained-offworld','rpgrocket'),inWorld:false},snapshot=inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade','retained-offworld','unresolved-clone'],models:[template(),pooled]});
  expect(snapshot.models).toHaveLength(2);expect(snapshot.models.every(entry=>!entry.inWorld)).toBe(true);expect(snapshot.missing).toEqual(['missing-projectile-model:unresolved-clone']);
  const absent=inventory.snapshotAt(p,{prefix:p,expectedHandles:['unresolved-clone'],models:[]});expect(absent.missing).toEqual(['projectile-template-coverage:grenade','missing-projectile-template:grenade','missing-projectile-model:unresolved-clone']);
  const omitted=inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade'],models:[]});expect(omitted.missing).toContain('missing-projectile-template:grenade');expect(omitted.missing).toContain('missing-projectile-model:grenade');
 });
 it('freezes captured membership/transforms/prefix and shares immutable raw resource arrays between private snapshots',()=>{
  const inventory=createOriginalReceiverProjectileInventory(weapons,options),p={sceneGeneration:3,callback:0,kind:'receipt' as const,tick:1},world=[...I],ancestry=['private-group'],captured={...model(),worldMatrix:world,groupAncestry:ancestry};
  const first=inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade',captured.handle],models:[template(),captured]});world[12]=99;ancestry[0]='smokes';captured.inWorld=false;p.tick=2;
  const q=prefix(3),other=inventory.snapshotAt(q,{prefix:q,expectedHandles:['grenade',captured.handle],models:[template(),captured]});
  expect(first.prefix).toEqual(prefix(1));expect(first.models[1].inWorld).toBe(true);expect(first.models[1].worldMatrix![12]).toBe(0);expect(first.triangles[1].groupAncestry).toEqual(['private-group']);
  expect(other.models[1].inWorld).toBe(false);expect(other.models[1].worldMatrix![12]).toBe(99);expect(other.triangles[1].positions).toBe(first.triangles[1].positions);expect(other.triangles[1].faces).toBe(first.triangles[1].faces);
  expect(Object.isFrozen(first)).toBe(true);expect(Object.isFrozen(first.prefix)).toBe(true);expect(Object.isFrozen(first.models[1].worldMatrix)).toBe(true);for(const point of first.triangles[1].positions)expect(Object.isFrozen(point)).toBe(true);
 });
 it('rejects local weapon/template aliases, duplicate or unexpected handles and malformed captures',()=>{
  const inventory=createOriginalReceiverProjectileInventory(weapons,options),p=prefix();
  for(const handle of ['rocket','pistol','spas12','ak47','rg6','rpg','dragunov','ROCKET'])expect(()=>inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade',handle],models:[template(),model(handle,'rpgrocket')]})).toThrow('identity');
  expect(()=>inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade','Flight','flight'],models:[template()]})).toThrow();
  expect(()=>inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade'],models:[template(),model()]})).toThrow();
  expect(()=>inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade'],models:[{...template(),resource:'rpgrocket'}]})).toThrow('template');
  expect(()=>inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade'],models:[{...template(),worldMatrix:[1,2,3]}]})).toThrow();
  expect(()=>inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade'],models:[{...template(),worldMatrix:I.map((value,index)=>index===12?Infinity:value)}]})).toThrow();
  expect(()=>inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade','x'],models:[template(),model('x'),model('x')]})).toThrow();
 });
 it('rejects generation/prefix and resource/instance/text budgets without retaining capture history',()=>{
  const inventory=createOriginalReceiverProjectileInventory(weapons,options),p=prefix();
  expect(()=>inventory.snapshotAt(p,{prefix:prefix(1),expectedHandles:['grenade'],models:[template()]})).toThrow('prefix');
  expect(()=>inventory.snapshotAt({...p,sceneGeneration:4},{prefix:{...p,sceneGeneration:4},expectedHandles:['grenade'],models:[template()]})).toThrow('prefix');
  for(const limits of [{maxModels:0},{maxVertices:1},{maxFaces:1},{maxTextChars:1}])expect(()=>createOriginalReceiverProjectileInventory(weapons,{...options,...limits})).toThrow();
  const raw=weapons.meshes.filter(mesh=>['rg6grenade','rpgrocket'].includes(mesh.resource)),vertexTotal=raw.reduce((sum,mesh)=>sum+mesh.positions.length,0),faceTotal=raw.reduce((sum,mesh)=>sum+mesh.faces.length,0);
  const bounded=createOriginalReceiverProjectileInventory(weapons,{...options,maxVertices:vertexTotal,maxFaces:faceTotal});
  expect(()=>bounded.snapshotAt(p,{prefix:p,expectedHandles:['grenade','a','b'],models:[template(),model('a','rpgrocket'),model('b')]})).toThrow('instance budget');
  const maxModels=createOriginalReceiverProjectileInventory(weapons,{...options,maxModels:1});expect(()=>maxModels.snapshotAt(p,{prefix:p,expectedHandles:['grenade','missing'],models:[template()]})).toThrow('model budget');
  expect(()=>createOriginalReceiverProjectileInventory({meshes:[]},options)).toThrow('resource');
 });
 it('copies raw topology once, rejects malformed resource faces and never substitutes supplied body proxies',()=>{
  const copied:ReceiverWeaponGeometry={meshes:weapons.meshes.filter(mesh=>['rg6grenade','rpgrocket'].includes(mesh.resource)).map(mesh=>({resource:mesh.resource,positions:mesh.positions.map(point=>[...point]),faces:mesh.faces.map(face=>[...face])}))};
  const grenade=copied.meshes.find(mesh=>mesh.resource==='rg6grenade')!,inventory=createOriginalReceiverProjectileInventory(copied,options),saved=grenade.positions[0][0];grenade.positions[0][0]=999;
  const p=prefix(),captured={...template(),bodyProxy:{positions:[[99,99,99]],faces:[]}},snapshot=inventory.snapshotAt(p,{prefix:p,expectedHandles:['grenade'],models:[captured]});
  expect(snapshot.triangles[0].positions[0][0]).toBe(saved);expect(snapshot.triangles[0].positions.length).toBeGreaterThan(1);expect('bodyProxy' in snapshot.models[0]).toBe(false);expect('bodyProxy' in snapshot.triangles[0]).toBe(false);
  copied.meshes[0].faces[0]=[0,1,copied.meshes[0].positions.length];expect(()=>createOriginalReceiverProjectileInventory(copied,options)).toThrow('face');
 });
 it('rejects oversized mesh inventories before reading resource entries or iterating',()=>{
  for(const [length,maxMeshes] of [[257,undefined],[2,1]] as const){
   const meshes:ReceiverWeaponGeometry['meshes']=[];meshes.length=length;
   const entry=vi.fn(()=>{throw Error('resource entry must not be touched');}),iterate=vi.fn(()=>{throw Error('resource inventory must not be iterated');});
   Object.defineProperty(meshes,'0',{get:entry});Object.defineProperty(meshes,Symbol.iterator,{value:iterate});
   expect(()=>createOriginalReceiverProjectileInventory({meshes},{...options,...(maxMeshes===undefined?{}:{maxMeshes})})).toThrow('options');
   expect(entry).not.toHaveBeenCalled();expect(iterate).not.toHaveBeenCalled();
  }
  expect(()=>createOriginalReceiverProjectileInventory(weapons,{...options,maxMeshes:0})).toThrow('options');
  const raw=weapons.meshes.filter(mesh=>['rg6grenade','rpgrocket'].includes(mesh.resource));
  expect(()=>createOriginalReceiverProjectileInventory({meshes:[...raw,raw[0]]},options)).toThrow('duplicate');
 });
});
