import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import type {Vec3} from './protocol';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import {ORIGINAL_GRENADE_GEOMETRY_SHA256,ORIGINAL_GRENADE_SOURCE_POINTS as points,ORIGINAL_GRENADE_SOURCE_FACES as faces,ORIGINAL_GRENADE_SOURCE_FACE_NORMALS as normals,ORIGINAL_GRENADE_SOURCE_EDGE_DIRECTIONS as directions,ORIGINAL_GRENADE_PIVOT_BOUND,originalGrenadeWorldVertices,originalGrenadeWorldBounds,originalGrenadeSupport,originalGrenadeConvex,originalGrenadeWorldConvex} from './originalGrenadeShape';
import type {OriginalGrenadeBasis} from './originalGrenadeShape';
const pivot={x:4,y:-3,z:7};
const identity:OriginalGrenadeBasis={x:{x:1,y:0,z:0},y:{x:0,y:1,z:0},z:{x:0,y:0,z:1}};
const close=(a:Readonly<Vec3>,b:Readonly<Vec3>)=>{for(const axis of ['x','y','z'] as const)expect(a[axis]).toBeCloseTo(b[axis],11);};
const dot=(a:Readonly<Vec3>,b:Readonly<Vec3>)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a:Readonly<Vec3>,b:Readonly<Vec3>):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const cross=(a:Readonly<Vec3>,b:Readonly<Vec3>):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function basisFor(matrix:THREE.Matrix4):OriginalGrenadeBasis {
 const col=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z).applyMatrix4(matrix);
 return {x:col(1,0,0),y:col(0,1,0),z:col(0,0,1)};
}
describe('passive original grenade convex foundation',()=>{
 it('retains all75 exact unique source coordinates and the unchanged geometry hash',()=>{
  const raw=readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url));
  expect(createHash('sha256').update(raw).digest('hex')).toBe(ORIGINAL_GRENADE_GEOMETRY_SHA256);
  const data=JSON.parse(raw.toString());const mesh=data.meshes.find((m:{resource:string})=>m.resource==='rg6grenade');
  expect(mesh.positions).toHaveLength(129);expect(mesh.faces).toHaveLength(144);
  expect(data.nodes.find((n:{resource:string})=>n.resource==='rg6grenade')).toMatchObject({parent:'World',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});
  const unique=[...new Set<string>(mesh.positions.map((p:number[])=>JSON.stringify(p)))].map(s=>JSON.parse(s) as number[]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  expect(unique).toHaveLength(75);expect(points.map(p=>[p.x,p.y,p.z])).toEqual(unique);
 });
 it('preserves resource pivot, exact unequal axis bounds and broadphase extent',()=>{
  const bounds=originalGrenadeWorldBounds({pivot,basis:identity});
  close(bounds.min,{x:pivot.x-2.1961679458618164*S,y:pivot.y-1.6377562284469604*S,z:pivot.z-1.6547282934188843*S});
  close(bounds.max,{x:pivot.x+2.1961681842803955*S,y:pivot.y+1.6377562284469604*S,z:pivot.z+1.6547282934188843*S});
  expect(ORIGINAL_GRENADE_PIVOT_BOUND).toBeCloseTo(2.7497782490023486*S,14);
 });
 it('has closed outward topology containing every retained support point',()=>{
  expect(faces).toHaveLength(78);expect(normals).toHaveLength(78);expect(directions).toHaveLength(117);
  const edges=new Map<string,{count:number;winding:number}>();const extremes=new Set<number>();
  faces.forEach(([a,b,c],index)=>{
   [a,b,c].forEach(v=>extremes.add(v));const raw=cross(sub(points[b],points[a]),sub(points[c],points[a]));
   const length=Math.hypot(raw.x,raw.y,raw.z);expect(length).toBeGreaterThan(0);close(normals[index],{x:raw.x/length,y:raw.y/length,z:raw.z/length});
   for(const p of points)expect(dot(sub(p,points[a]),normals[index])).toBeLessThanOrEqual(1e-7);
   for(const [i,j] of [[a,b],[b,c],[c,a]]){const key=[Math.min(i,j),Math.max(i,j)].join(',');const edge=edges.get(key)??{count:0,winding:0};edge.count++;edge.winding+=i<j?1:-1;edges.set(key,edge);}
  });
  expect(extremes.size).toBe(41);expect(edges.size).toBe(117);expect([...edges.values()].every(e=>e.count===2&&e.winding===0)).toBe(true);
  const pairs=[...edges.keys()].map(s=>s.split(',').map(Number)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  pairs.forEach(([a,b],i)=>{const v=sub(points[b],points[a]),length=Math.hypot(v.x,v.y,v.z);close(directions[i],{x:v.x/length,y:v.y/length,z:v.z/length});});
 });
 it('uses explicit caller orientation without inferring launch direction or recentering',()=>{
  const matrix=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.43,-.72,1.18,'ZYX')),basis=basisFor(matrix),pose={pivot,basis};
  const transformed=originalGrenadeWorldVertices(pose);
  points.forEach((p,i)=>close(transformed[i],new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(matrix).multiplyScalar(S).add(new THREE.Vector3(pivot.x,pivot.y,pivot.z))));
  const offsets=originalGrenadeConvex(basis),world=originalGrenadeWorldConvex(pose);
  offsets.vertices.forEach((v,i)=>close({x:v.x+pivot.x,y:v.y+pivot.y,z:v.z+pivot.z},world.vertices[i]));
  expect(world.faces).toBe(faces);expect(offsets.faceNormals).toEqual(world.faceNormals);expect(offsets.edgeDirections).toEqual(world.edgeDirections);
  for(const v of [...world.faceNormals,...world.edgeDirections])expect(Math.hypot(v.x,v.y,v.z)).toBeCloseTo(1,12);
  for(let i=1;i<=70;i++){const d={x:Math.sin(i),y:Math.cos(i*.7),z:Math.sin(i*.31)},support=originalGrenadeSupport(pose,d);expect(support.point).toEqual(transformed[support.sourceIndex]);expect(dot(support.point,d)).toBeCloseTo(Math.max(...transformed.map(p=>dot(p,d))),12);}
 });
 it('deep freezes cacheable shapes without freezing caller orientation',()=>{
  const shape=originalGrenadeConvex(identity);expect(Object.isFrozen(shape)).toBe(true);
  for(const list of [shape.vertices,shape.faceNormals,shape.edgeDirections,shape.faces!]){expect(Object.isFrozen(list)).toBe(true);expect(list.every(v=>Object.isFrozen(v))).toBe(true);}
  expect(Object.isFrozen(identity)).toBe(false);expect(Object.isFrozen(identity.x)).toBe(false);
 });
 it('rejects non-rigid, reflected and non-finite transforms or zero support directions',()=>{
  for(const basis of [{...identity,x:{x:2,y:0,z:0}},{...identity,z:{x:0,y:0,z:-1}},{...identity,y:{x:1,y:0,z:0}},{...identity,z:{x:0,y:0,z:NaN}}])expect(()=>originalGrenadeConvex(basis)).toThrow();
  expect(()=>originalGrenadeWorldVertices({pivot:{...pivot,y:Infinity},basis:identity})).toThrow();
  for(const direction of [{x:0,y:0,z:0},{x:NaN,y:1,z:0}])expect(()=>originalGrenadeSupport({pivot,basis:identity},direction)).toThrow();
 });
});
