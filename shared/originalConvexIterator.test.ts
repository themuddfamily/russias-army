import {describe,expect,it} from 'vitest';
import {sweepOriginalConvexTriangle,type OriginalConvexPolytope} from './originalConvexSweep';
import {originalGrenadeConvex} from './originalGrenadeShape';
import {originalGrenadeBasisFromDirection} from './originalGrenadeOrientation';
import type {Vec3} from './protocol';

const v=(x=0,y=0,z=0):Vec3=>({x,y,z});
const triangle=(points:[Vec3,Vec3,Vec3]):readonly [Vec3,Vec3,Vec3]=>Object.freeze(points.map(p=>Object.freeze(p))) as unknown as readonly [Vec3,Vec3,Vec3];
const floor=()=>triangle([v(-10,0,-10),v(10,0,-10),v(0,0,10)]);
const wall=()=>triangle([v(0,-10,-10),v(0,10,-10),v(0,0,10)]);
function emptyIteration():readonly Vec3[]{
 const list=[Object.freeze(v(1))];
 Object.defineProperty(list,Symbol.iterator,{value:function*(){},enumerable:false});
 return Object.freeze(list);
}
function emptyIteratedGrenade():OriginalConvexPolytope{
 const source=originalGrenadeConvex(originalGrenadeBasisFromDirection(v(0,0,-1)));
 return Object.freeze({...source,faceNormals:emptyIteration(),edgeDirections:emptyIteration()});
}

describe('SAT shape projection reuse with custom array iteration',()=>{
 it('retains eager invalid iterator failure without an additional shape-list read',()=>{
  const source=originalGrenadeConvex(originalGrenadeBasisFromDirection(v(0,0,-1)));
  let reads=0,iterations=0;
  const normals=[Object.freeze(v(1))];
  Object.defineProperty(normals,Symbol.iterator,{value:function*(){
   iterations++;yield iterations===1?normals[0]:undefined;
  }});
  const shape={...source,get faceNormals(){reads++;return normals;}};
  expect(()=>sweepOriginalConvexTriangle(shape,v(0,1),v(0,-1),floor())).toThrow(TypeError);
  expect(reads).toBe(3);expect(iterations).toBe(2);
 });

 it('does not reuse a floor triangle normal as a wall face axis when frozen iterators yield no axes',()=>{
  const shape=emptyIteratedGrenade();
  expect(sweepOriginalConvexTriangle(shape,v(0,1),v(0,-1),floor())).not.toBeNull();
  const hit=sweepOriginalConvexTriangle(shape,v(1,.2),v(-1,.2),wall());
  const fresh=sweepOriginalConvexTriangle(emptyIteratedGrenade(),v(1,.2),v(-1,.2),wall());
  expect(hit).not.toBeNull();expect(fresh).not.toBeNull();
  expect(hit).toEqual(fresh);
  expect(hit!.fraction).toBeGreaterThan(0);expect(hit!.fraction).toBeLessThan(1);
  expect(hit!.normal.x).toBe(1);expect(hit!.normal.y).toBe(0);expect(hit!.normal.z).toBe(-0);
  expect(hit!.initialOverlap).toBe(false);
 });

 it('preserves custom face iteration order in an equal-entry-axis tie',()=>{
  const x=Object.freeze(v(1)),y=Object.freeze(v(0,1)),z=Object.freeze(v(0,0,1));
  const normals=[x,y,z];
  Object.defineProperty(normals,Symbol.iterator,{value:function*(){yield z;yield y;yield x;}});
  const vertices=Object.freeze([-1,1].flatMap(a=>[-1,1].flatMap(b=>[-1,1].map(c=>Object.freeze(v(a*.1,b*.1,c*.1))))));
  const shape=Object.freeze({vertices,faceNormals:Object.freeze(normals),edgeDirections:emptyIteration()});
  const explicit={vertices,faceNormals:[z,y,x],edgeDirections:emptyIteration()};
  const finiteFloor=triangle([v(),v(1),v(0,0,1)]);
  const hit=sweepOriginalConvexTriangle(shape,v(3,0,3),v(),finiteFloor);
  const expected=sweepOriginalConvexTriangle(explicit,v(3,0,3),v(),finiteFloor);
  expect(hit).not.toBeNull();expect(hit).toEqual(expected);
  expect(hit!.fraction).toBeGreaterThan(0);
  expect(hit!.normal.x).toBe(0);expect(hit!.normal.y).toBe(0);expect(hit!.normal.z).toBe(1);
 });

 it.each([false,true])('retains iterator accessor reads for frozen=%s generic inputs',frozen=>{
  const reads:string[]=[];
  const accessorList=(label:string)=>{
   const list=[Object.freeze(v(1)),Object.freeze(v(0,1)),Object.freeze(v(0,0,1))];
   Object.defineProperty(list,Symbol.iterator,{get(){reads.push(label);return Array.prototype[Symbol.iterator];}});
   return frozen?Object.freeze(list):list;
  };
  const source=originalGrenadeConvex(originalGrenadeBasisFromDirection(v(0,0,-1)));
  const shape={...source,faceNormals:accessorList('face'),edgeDirections:accessorList('edge')};
  if(frozen)Object.freeze(shape);
  sweepOriginalConvexTriangle(shape,v(0,1),v(0,-1),floor());
  const hit=sweepOriginalConvexTriangle(shape,v(1,.2),v(-1,.2),wall());
  expect(hit).not.toBeNull();
  // First validation and eager axes each read both iterators. Proven frozen
  // data keeps existing validation reuse; mutable inputs validate again.
  expect(reads).toEqual(frozen?['face','edge','face','edge','face','edge']:
   ['face','edge','face','edge','face','edge','face','edge']);
 });
});
