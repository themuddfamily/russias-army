import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import {ORIGINAL_RPG_GEOMETRY_SHA256,ORIGINAL_RPG_SOURCE_POINTS,ORIGINAL_RPG_SOURCE_FACES,ORIGINAL_RPG_PIVOT_BOUND,ORIGINAL_RPG_SOURCE_FACE_NORMALS,ORIGINAL_RPG_SOURCE_EDGE_DIRECTIONS,originalRpgBasisFromSourceRotation,originalRpgBasisFromDirection,originalRpgWorldVertices,originalRpgSupport,originalRpgWorldBounds,originalRpgWorldConvex,originalRpgConvex} from './originalRpgShape';
const pivot={x:4,y:5,z:6};
const closeVector=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>{expect(a.x).toBeCloseTo(b.x,11);expect(a.y).toBeCloseTo(b.y,11);expect(a.z).toBeCloseTo(b.z,11);};
describe('staged original RPG convex support shape',()=>{
 it('retains every exact unique authored support coordinate and unchanged asset hash',()=>{
  const raw=readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url));expect(createHash('sha256').update(raw).digest('hex')).toBe(ORIGINAL_RPG_GEOMETRY_SHA256);
  const data=JSON.parse(raw.toString()),points=data.meshes.filter((m:any)=>m.resource==='rpgrocket').flatMap((m:any)=>m.positions);expect(points).toHaveLength(195);
  const unique=[...new Set(points.map((p:number[])=>JSON.stringify(p)))].map(value=>JSON.parse(value as string)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  expect(ORIGINAL_RPG_SOURCE_POINTS.map(p=>[p.x,p.y,p.z])).toEqual(unique);expect(unique).toHaveLength(72);
  expect(data.nodes.find((n:any)=>n.resource==='rpgrocket')).toMatchObject({parent:'World',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});
 });
 it('preserves zero-angle source up, nose, resource pivot and full axial extent',()=>{
  const basis=originalRpgBasisFromSourceRotation({x:0,y:0,z:0});closeVector(basis.x,{x:0,y:0,z:1});closeVector(basis.y,{x:1,y:0,z:0});closeVector(basis.z,{x:0,y:1,z:0});
  const bounds=originalRpgWorldBounds({pivot,basis});expect(bounds.min.y-pivot.y).toBeCloseTo(4.586082458496094*S,12);expect(bounds.max.z-bounds.min.z).toBeCloseTo(45.33571434020996*S,12);
  expect(bounds.min.y).toBeGreaterThan(pivot.y);expect(ORIGINAL_RPG_PIVOT_BOUND).toBeCloseTo(Math.max(...ORIGINAL_RPG_SOURCE_POINTS.map(p=>Math.hypot(p.x,p.y,p.z)))*S,12);
 });
 it.each([{x:17,y:0,z:41},{x:-71,y:0,z:-2377},{x:22,y:38,z:151}])('matches independent matrix composition at %j',rotation=>{
  const basis=originalRpgBasisFromSourceRotation(rotation),matrix=new THREE.Matrix4().makeRotationX(-Math.PI/2).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotation.x*Math.PI/180,rotation.y*Math.PI/180,rotation.z*Math.PI/180,'ZYX'))).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI/2));
  for(const [axis,column] of [['x',new THREE.Vector3(1,0,0)],['y',new THREE.Vector3(0,1,0)],['z',new THREE.Vector3(0,0,1)]] as const)closeVector(basis[axis],column.applyMatrix4(matrix));
  const posed=originalRpgWorldVertices({pivot,basis});for(let i=0;i<posed.length;i++){const p=ORIGINAL_RPG_SOURCE_POINTS[i];closeVector(posed[i],new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(matrix).multiplyScalar(S).add(new THREE.Vector3(pivot.x,pivot.y,pivot.z)));}
 });
 it.each([{x:0,y:0,z:-1},{x:1,y:2,z:3},{x:0,y:1,z:0},{x:-3,y:-2,z:0}])('aligns resource negative X with flight while retaining explicit source roll adapter %j',direction=>{
  const basis=originalRpgBasisFromDirection(direction),d=new THREE.Vector3(direction.x,direction.y,direction.z).normalize();closeVector({x:-basis.x.x,y:-basis.x.y,z:-basis.x.z},d);
 });
 it('finds support over the entire oriented body with a deterministic original vertex index',()=>{
  const pose={pivot,basis:originalRpgBasisFromSourceRotation({x:37,y:0,z:91})},points=originalRpgWorldVertices(pose);
  for(let i=1;i<=100;i++){const direction={x:Math.sin(i),y:Math.cos(i*.7),z:Math.sin(i*.31)},support=originalRpgSupport(pose,direction),projection=(p:{x:number;y:number;z:number})=>p.x*direction.x+p.y*direction.y+p.z*direction.z;expect(support.point).toEqual(points[support.sourceIndex]);expect(projection(support.point)).toBeCloseTo(Math.max(...points.map(projection)),12);}
 });
 it('provides unit hull normals and edge directions separately from translated/scaled vertices',()=>{
  const basis=originalRpgBasisFromSourceRotation({x:11,y:21,z:31}),shape=originalRpgWorldConvex({pivot,basis});expect(shape.vertices).toEqual(originalRpgWorldVertices({pivot,basis}));expect(shape.faceNormals).toHaveLength(ORIGINAL_RPG_SOURCE_FACE_NORMALS.length);expect(shape.edgeDirections).toHaveLength(ORIGINAL_RPG_SOURCE_EDGE_DIRECTIONS.length);
  for(const direction of [...shape.faceNormals,...shape.edgeDirections])expect(Math.hypot(direction.x,direction.y,direction.z)).toBeCloseTo(1,12);
 });
 it('rejects degenerate or non-rigid support inputs',()=>{
  expect(()=>originalRpgBasisFromDirection({x:0,y:0,z:0})).toThrow();expect(()=>originalRpgBasisFromSourceRotation({x:NaN,y:0,z:0})).toThrow();const basis=originalRpgBasisFromSourceRotation({x:0,y:0,z:0});expect(()=>originalRpgSupport({pivot,basis},{x:0,y:0,z:0})).toThrow();expect(()=>originalRpgWorldVertices({pivot,basis:{...basis,x:{x:2,y:0,z:0}}})).toThrow();
 });
});

describe('offline hull axes remain supported by actual recovered coordinates',()=>{
 it('retains all triangulated hull face and edge axes without near-parallel reduction',()=>{
  expect(ORIGINAL_RPG_SOURCE_FACE_NORMALS).toHaveLength(76);expect(ORIGINAL_RPG_SOURCE_EDGE_DIRECTIONS).toHaveLength(114);
  const dot=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>a.x*b.x+a.y*b.y+a.z*b.z;
  for(const normal of ORIGINAL_RPG_SOURCE_FACE_NORMALS){
   const projections=ORIGINAL_RPG_SOURCE_POINTS.map(point=>dot(point,normal)),min=Math.min(...projections),max=Math.max(...projections);
   expect(Math.max(projections.filter(p=>Math.abs(p-min)<1e-7).length,projections.filter(p=>Math.abs(p-max)<1e-7).length)).toBeGreaterThanOrEqual(3);
  }
  const pairDirections=ORIGINAL_RPG_SOURCE_POINTS.flatMap((a,i)=>ORIGINAL_RPG_SOURCE_POINTS.slice(i+1).map(b=>{const x=b.x-a.x,y=b.y-a.y,z=b.z-a.z,length=Math.hypot(x,y,z);return {x:x/length,y:y/length,z:z/length};}));
  for(const edge of ORIGINAL_RPG_SOURCE_EDGE_DIRECTIONS)expect(pairDirections.some(pair=>Math.abs(Math.abs(dot(edge,pair))-1)<1e-12)).toBe(true);
 });
});

it('supplies sweep offsets without adding the physical pivot twice',()=>{
 const basis=originalRpgBasisFromSourceRotation({x:37,y:0,z:41}),offsets=originalRpgConvex(basis),world=originalRpgWorldConvex({pivot,basis});
 expect(offsets.faceNormals).toEqual(world.faceNormals);expect(offsets.edgeDirections).toEqual(world.edgeDirections);
 offsets.vertices.forEach((offset,index)=>closeVector({x:offset.x+pivot.x,y:offset.y+pivot.y,z:offset.z+pivot.z},world.vertices[index]));
});

it('retains a closed outward hull over the exact original support indices',()=>{
 expect(ORIGINAL_RPG_SOURCE_FACES).toHaveLength(76);const edges=new Map<string,number>();
 for(const [a,b,c] of ORIGINAL_RPG_SOURCE_FACES){const p=ORIGINAL_RPG_SOURCE_POINTS[a],q=ORIGINAL_RPG_SOURCE_POINTS[b],r=ORIGINAL_RPG_SOURCE_POINTS[c],u={x:q.x-p.x,y:q.y-p.y,z:q.z-p.z},v={x:r.x-p.x,y:r.y-p.y,z:r.z-p.z},n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
  for(const point of ORIGINAL_RPG_SOURCE_POINTS)expect((point.x-p.x)*n.x+(point.y-p.y)*n.y+(point.z-p.z)*n.z).toBeLessThanOrEqual(1e-7);
  for(const [i,j] of [[a,b],[b,c],[c,a]]){const key=[i,j].sort((x,y)=>x-y).join(',');edges.set(key,(edges.get(key)??0)+1);}
 }
 expect([...edges.values()].every(count=>count===2)).toBe(true);expect(originalRpgConvex(originalRpgBasisFromSourceRotation({x:0,y:0,z:0})).faces).toBe(ORIGINAL_RPG_SOURCE_FACES);
});

it('deep-freezes convex shapes for projection caches without freezing caller pose data',()=>{
 const basis=originalRpgBasisFromSourceRotation({x:37,y:0,z:41}),shape=originalRpgConvex(basis);
 expect(Object.isFrozen(shape)).toBe(true);
 for(const array of [shape.vertices,shape.faceNormals,shape.edgeDirections,shape.faces]){expect(Object.isFrozen(array)).toBe(true);expect(array.every(value=>Object.isFrozen(value))).toBe(true);}
 expect(Object.isFrozen(basis)).toBe(false);expect(Object.isFrozen(basis.x)).toBe(false);
});
