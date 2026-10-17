import {describe,it,expect} from 'vitest';
import {sweepOriginalConvexTriangle,type OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';
const axes:Vec3[]=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}];
const cube:OriginalConvexPolytope={vertices:[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>({x,y,z})))),faceNormals:axes,edgeDirections:axes};
const wall:readonly [Vec3,Vec3,Vec3]=[{x:0,y:-10,z:-10},{x:0,y:10,z:-10},{x:0,y:0,z:10}];
describe('full convex finite triangle translation sweep',()=>{
 it('finds exact face contact fraction and physical pivot without centering shape',()=>{
  const offset={...cube,vertices:cube.vertices.map(v=>({...v,x:v.x+2}))};
  const hit=sweepOriginalConvexTriangle(offset,{x:-6,y:0,z:0},{x:6,y:0,z:0},wall)!;
  expect(hit.fraction).toBeCloseTo(.25,12);expect(hit.position).toEqual({x:-3,y:0,z:0});expect(hit.normal.x).toBeCloseTo(-1,12);expect(hit.normal.y).toBeCloseTo(0,12);expect(hit.normal.z).toBeCloseTo(0,12);expect(hit.initialOverlap).toBe(false);
 });
 it('does not fill the infinite face plane outside the actual triangle',()=>{
  expect(sweepOriginalConvexTriangle(cube,{x:-6,y:20,z:0},{x:6,y:20,z:0},wall)).toBeNull();
 });
 it('catches a finite triangle corner and rejects a nearby nonintersection',()=>{
  const triangle:readonly [Vec3,Vec3,Vec3]=[{x:0,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}];
  expect(sweepOriginalConvexTriangle(cube,{x:-4,y:1.8,z:1.1},{x:4,y:1.8,z:1.1},triangle)?.fraction).toBeCloseTo(3/8,12);
  expect(sweepOriginalConvexTriangle(cube,{x:-4,y:2.1,z:2.1},{x:4,y:2.1,z:2.1},triangle)).toBeNull();
 });
 it('retains penetrating overlap and lets a touching body separate',()=>{
  expect(sweepOriginalConvexTriangle(cube,{x:-.5,y:0,z:0},{x:-4,y:0,z:0},wall)).toMatchObject({fraction:0,initialOverlap:true});
  expect(sweepOriginalConvexTriangle(cube,{x:-1,y:0,z:0},{x:-4,y:0,z:0},wall)).toBeNull();
  expect(sweepOriginalConvexTriangle(cube,{x:-1,y:0,z:0},{x:4,y:0,z:0},wall)).toMatchObject({fraction:0,initialOverlap:true});
 });
 it('is invariant under joint translation, triangle winding and motion reversal',()=>{
  const forward=sweepOriginalConvexTriangle(cube,{x:-4,y:0,z:0},{x:4,y:0,z:0},wall)!;
  const shift=(p:Vec3):Vec3=>({x:p.x+120,y:p.y-50,z:p.z+70});
  const moved=sweepOriginalConvexTriangle(cube,shift({x:-4,y:0,z:0}),shift({x:4,y:0,z:0}),[shift(wall[2]),shift(wall[1]),shift(wall[0])])!;
  expect(moved.fraction).toBe(forward.fraction);expect(moved.position).toEqual(shift(forward.position));expect(moved.normal).toEqual(forward.normal);
  const reverse=sweepOriginalConvexTriangle(cube,{x:4,y:0,z:0},{x:-4,y:0,z:0},wall)!;expect(reverse.fraction).toBe(forward.fraction);expect(reverse.normal).toEqual({x:1,y:0,z:0});
 });
 it('rejects degenerate triangles and nonfinite geometry',()=>{
  const p={x:0,y:0,z:0};expect(sweepOriginalConvexTriangle(cube,p,p,[p,p,p])).toBeNull();
  expect(()=>sweepOriginalConvexTriangle(cube,{...p,x:NaN},p,wall)).toThrow('Invalid original convex sweep');
 });
});
