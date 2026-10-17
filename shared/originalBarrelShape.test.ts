import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import type {Vec3} from './protocol';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import {createOriginalBarrelConvex} from './originalBarrelShape';
import {sourcePointToWorld,type OriginalSceneData} from './originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function sourcePoints():Vec3[]{
 const data:OriginalSceneData=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8'));
 return data.meshes.filter(m=>m.resource==='barrel').flatMap(m=>m.positions.map(p=>sourcePointToWorld(p,S)));
}
function verify(shape:OriginalConvexPolytope){
 const edges=new Map<string,{count:number;winding:number}>();
 shape.faces!.forEach(([a,b,c],i)=>{
  const raw=cross(sub(shape.vertices[b],shape.vertices[a]),sub(shape.vertices[c],shape.vertices[a])),length=Math.hypot(raw.x,raw.y,raw.z);
  expect(length).toBeGreaterThan(0);
  for(const axis of ['x','y','z'] as const)expect(shape.faceNormals[i][axis]).toBeCloseTo(raw[axis]/length,11);
  for(const p of shape.vertices)expect(dot(shape.faceNormals[i],sub(p,shape.vertices[a]))).toBeLessThanOrEqual(1e-11);
  for(const [from,to] of [[a,b],[b,c],[c,a]]){const key=[Math.min(from,to),Math.max(from,to)].join(','),edge=edges.get(key)??{count:0,winding:0};edge.count++;edge.winding+=from<to?1:-1;edges.set(key,edge);}
 });
 expect([...edges.values()].every(e=>e.count===2&&e.winding===0)).toBe(true);
 expect(shape.edgeDirections).toHaveLength(edges.size);
 for(const n of [...shape.faceNormals,...shape.edgeDirections])expect(Math.hypot(n.x,n.y,n.z)).toBeCloseTo(1,11);
}
describe('retained original barrel convex envelope',()=>{
 it('contains every actual render point without moving the bottom pivot or changing coordinates',()=>{
  const points=sourcePoints(),shape=createOriginalBarrelConvex(points),unique=[...new Map(points.map(p=>[[p.x,p.y,p.z].join(','),p])).values()];
  expect(points).toHaveLength(47);expect(shape.vertices).toHaveLength(20);expect(shape.vertices).toEqual(unique);
  expect(Math.min(...shape.vertices.map(p=>p.y))).toBe(0);expect(Math.max(...shape.vertices.map(p=>p.y))).toBe(59.997379302978516*S);
  for(const p of points)expect(Math.min(...shape.vertices.map(v=>Math.hypot(v.x-p.x,v.y-p.y,v.z-p.z)))).toBe(0);
  verify(shape);
  expect(sweepOriginalConvexTriangleDistance(shape,at(0,1),at(0,-1),[at(-10,0,-10),at(10,0,-10),at(0,0,10)],S)).toMatchObject({penetrationDepth:0,initialOverlap:false});
 });
 it('retains exact off-axis rotated point coordinates and complete outward topology',()=>{
  const rotation=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.43,-.72,1.18,'ZYX'));
  const points=sourcePoints().map(p=>new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(rotation)),shape=createOriginalBarrelConvex(points);
  verify(shape);
  for(const d of [at(1),at(0,1),at(0,0,1),at(-.3,.7,1.1)])expect(Math.max(...shape.vertices.map(p=>dot(p,d)))).toBe(Math.max(...points.map(p=>dot(p,d))));
 });
 it('handles interior and duplicate points while producing deterministic coplanar triangulation',()=>{
  const points=[at(-1,-1,-1),at(1,-1,-1),at(-1,1,-1),at(1,1,-1),at(-1,-1,1),at(1,-1,1),at(-1,1,1),at(1,1,1),at(),at(0,0,1),at(1,1,1)];
  const shape=createOriginalBarrelConvex(points);verify(shape);expect(shape.faces).toHaveLength(12);expect(shape.vertices).toHaveLength(10);
  expect(createOriginalBarrelConvex(points)).toEqual(shape);
  expect(shape.faces!.flat()).not.toContain(8);expect(shape.faces!.flat()).not.toContain(9);
 });
 it('copies and deeply freezes all hull features without mutating caller points',()=>{
  const points=sourcePoints(),shape=createOriginalBarrelConvex(points),old={...shape.vertices[0]};points[0].x+=10;
  expect(shape.vertices[0]).toEqual(old);expect(Object.isFrozen(points[0])).toBe(false);expect(Object.isFrozen(shape)).toBe(true);
  for(const list of [shape.vertices,shape.faceNormals,shape.edgeDirections,shape.faces!]){expect(Object.isFrozen(list)).toBe(true);expect(list.every(Object.isFrozen)).toBe(true);}
 });
 it('rejects nonfinite, insufficient, collinear and planar inputs',()=>{
  for(const points of [[],[at(),at(1),at(0,1)],[at(),at(1),at(2),at(3)],[at(),at(1),at(0,1),at(1,1)],[at(),at(1),at(0,1),at(0,0,NaN)]])expect(()=>createOriginalBarrelConvex(points)).toThrow();
 });
});
