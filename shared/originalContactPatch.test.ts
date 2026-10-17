import {describe,it,expect} from 'vitest';
import {originalConvexPairPatch,originalConvexTrianglePatch} from './originalContactPatch';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';
const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
const box=(offset:Vec3=at()):OriginalConvexPolytope=>({vertices:[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>at(x+offset.x,y+offset.y,z+offset.z)))),faceNormals:[],edgeDirections:[]});
const close=(actual:Vec3,expected:Vec3)=>{for(const axis of ['x','y','z'] as const)expect(actual[axis]).toBeCloseTo(expected[axis],12);};
describe('finite original planar contact patches',()=>{
 it('uses the area centroid of overlapping box faces on each actual supporting plane',()=>{
  const patch=originalConvexPairPatch(box(),at(.5,2.2),box(),at(),at(0,1))!;
  close(patch.witnessA,at(.25,1.2));close(patch.witnessB,at(.25,1));
  expect(patch.area).toBeCloseTo(3,12);
  expect(patch.pairs).toHaveLength(4);
  expect(patch.pairs.map(pair=>[pair.witnessA.x,pair.witnessA.z]).sort()).toEqual([[-.5,-1],[-.5,1],[1,-1],[1,1]].sort());
  for(const pair of patch.pairs){expect(pair.witnessA.y).toBeCloseTo(1.2,12);expect(pair.witnessB.y).toBeCloseTo(1,12);expect(pair.witnessB.x).toBe(pair.witnessA.x);expect(pair.witnessB.z).toBe(pair.witnessA.z);}
 });
 it('swaps witnesses under pair reversal and normal reversal',()=>{
  const a=box(),b=box(),pa=at(.5,2.2,.4),pb=at(),patch=originalConvexPairPatch(a,pa,b,pb,at(0,1))!,swapped=originalConvexPairPatch(b,pb,a,pa,at(0,-1))!;
  close(swapped.witnessA,patch.witnessB);close(swapped.witnessB,patch.witnessA);
  expect(patch.area).toBeCloseTo(2.4,12);expect(swapped.area).toBeCloseTo(patch.area,12);
 });
 it('preserves translated, off-axis hulls without recentering their physical pivots',()=>{
  const offset=at(7,3,-4),shift=at(100,-30,50),shape=box(offset),a=at(shift.x+.5,shift.y+2.2,shift.z),b=shift;
  const patch=originalConvexPairPatch(shape,a,shape,b,at(0,1))!;
  close(patch.witnessA,at(107.25,-25.8,46));close(patch.witnessB,at(107.25,-26,46));
  expect(patch.area).toBeCloseTo(3,12);
 });
 it('constructs an oblique tangent basis and restores oblique support planes',()=>{
  const angle=.37,c=Math.cos(angle),s=Math.sin(angle),rotate=(point:Vec3)=>at(c*point.x-s*point.y,s*point.x+c*point.y,point.z),shape=box();
  const oriented={...shape,vertices:shape.vertices.map(rotate)},patch=originalConvexPairPatch(oriented,rotate(at(.5,2.2)),oriented,at(),rotate(at(0,1)))!;
  close(patch.witnessA,rotate(at(.25,1.2)));close(patch.witnessB,rotate(at(.25,1)));
  expect(patch.area).toBeCloseTo(3,12);
 });
 it('uses only roundoff tolerances at different geometric scales',()=>{
  for(const size of [1e-6,1e6]){
   const shape={...box(),vertices:box().vertices.map(point=>at(point.x*size,point.y*size,point.z*size))},patch=originalConvexPairPatch(shape,at(.5*size,2.2*size),shape,at(),at(0,1))!;
   expect(patch.witnessA.x/size).toBeCloseTo(.25,12);expect(patch.witnessA.y/size).toBeCloseTo(1.2,12);expect(patch.witnessB.y/size).toBeCloseTo(1,12);
   expect(patch.area/(size*size)).toBeCloseTo(3,12);
   expect(originalConvexPairPatch(shape,at((2+1e-8)*size,2*size),shape,at(),at(0,1))).toBeNull();
  }
 });
 it('does not reject a small finite patch solely because the physical pivot is far off-axis',()=>{
  const shape=box(at(1e8,0,-1e8)),patch=originalConvexPairPatch(shape,at(0,2),shape,at(),at(0,1))!;
  close(patch.witnessA,at(1e8,1,-1e8));close(patch.witnessB,at(1e8,1,-1e8));
  expect(patch.area).toBeCloseTo(4,12);
 });
 it('clips to a finite half-square triangle instead of the box face or infinite plane center',()=>{
  const triangle:[Vec3,Vec3,Vec3]=[at(-1,0,-1),at(1,0,-1),at(1,0,1)],patch=originalConvexTrianglePatch(box(),at(0,1.2),triangle,at(0,1))!;
  close(patch.witnessA,at(1/3,.2,-1/3));close(patch.witnessB,at(1/3,0,-1/3));
  expect(patch.area).toBeCloseTo(2,12);
  expect(patch.pairs).toHaveLength(3);expect(patch.pairs.map(pair=>[pair.witnessA.x,pair.witnessA.z]).sort()).toEqual([[-1,-1],[1,-1],[1,1]].sort());
 });
 it('integrates the area centroid of a clipped pentagon rather than averaging its vertices',()=>{
  const triangle:[Vec3,Vec3,Vec3]=[at(-1,0,-1),at(2,0,-1),at(-1,0,2)],patch=originalConvexTrianglePatch(box(),at(0,1.2),triangle,at(0,1))!;
  // A square of area4 minus an upper-corner triangle of area1/2 whose
  // centroid is(2/3,2/3) leaves centroid(-2/21,-2/21).
  close(patch.witnessA,at(-2/21,.2,-2/21));close(patch.witnessB,at(-2/21,0,-2/21));
  expect(patch.area).toBeCloseTo(3.5,12);
  expect(patch.pairs).toHaveLength(5);
  expect(patch.pairs.map(pair=>[pair.witnessA.x,pair.witnessA.z]).sort()).toEqual([[-1,-1],[1,-1],[1,0],[0,1],[-1,1]].sort());
  const reversed=originalConvexTrianglePatch(box(),at(0,1.2),[triangle[2],triangle[1],triangle[0]],at(0,1))!;
  close(reversed.witnessA,patch.witnessA);close(reversed.witnessB,patch.witnessB);
  expect(reversed.area).toBeCloseTo(patch.area,12);
 });
 it('supplies geometric areas for complementary coplanar floor triangles',()=>{
  const first=originalConvexTrianglePatch(box(),at(0,1.2),[at(-1,0,-1),at(1,0,-1),at(1,0,1)],at(0,1))!;
  const second=originalConvexTrianglePatch(box(),at(0,1.2),[at(-1,0,-1),at(1,0,1),at(-1,0,1)],at(0,1))!;
  const area=first.area+second.area;expect(area).toBeCloseTo(4,12);
  for(const axis of ['x','z'] as const)expect((first.witnessA[axis]*first.area+second.witnessA[axis]*second.area)/area).toBeCloseTo(0,12);
  // Each triangle is still a finite half-face patch. Aggregation belongs to
  // the caller, which must establish coincident contact time/normal/plane.
  close(first.witnessA,at(1/3,.2,-1/3));close(second.witnessA,at(-1/3,.2,1/3));
 });
 it('uses the actual broad hull face for a roundoff-level nearly parallel triangle normal',()=>{
  const nx=4.220e-9,nz=-1.089e-9,height=.123,floor=(x:number,z:number)=>at(x,height-nx*x-nz*z,z),shape={...box(),faceNormals:[at(0,-1)]};
  const triangle:[Vec3,Vec3,Vec3]=[floor(-4,-4),floor(4,-4),floor(0,4)],patch=originalConvexTrianglePatch(shape,at(0,1.2),triangle,at(nx,1,nz))!;
  expect(patch).not.toBeNull();expect(patch.area).toBeCloseTo(4,12);close(patch.witnessA,at(0,.2));close(patch.witnessB,at(0,height));
  // The hull witness lies on y=.2, and the fixed witness lies on the actual
  // tilted floor; neither surface is replaced by the contact normal's plane.
  expect(patch.witnessA.y).toBeCloseTo(.2,15);expect(patch.witnessB.y+nx*patch.witnessB.x+nz*patch.witnessB.z).toBeCloseTo(height,15);
  expect(patch.pairs).toHaveLength(4);
  for(const pair of patch.pairs){expect(pair.witnessA.y).toBeCloseTo(.2,15);expect(pair.witnessB.y+nx*pair.witnessB.x+nz*pair.witnessB.z).toBeCloseTo(height,15);expect(pair.witnessB.x).toBe(pair.witnessA.x);expect(pair.witnessB.z).toBe(pair.witnessA.z);}
 });
 it('retains finite half-face clipping and the actual tilted triangle plane in the nearparallel fallback',()=>{
  const nx=4.220e-9,nz=-1.089e-9,height=.123,floor=(x:number,z:number)=>at(x,height-nx*x-nz*z,z),shape={...box(),faceNormals:[at(0,-1)]};
  const patch=originalConvexTrianglePatch(shape,at(0,1.2),[floor(-1,-1),floor(1,-1),floor(1,1)],at(nx,1,nz))!;
  expect(patch.area).toBeCloseTo(2,12);close(patch.witnessA,at(1/3,.2,-1/3));close(patch.witnessB,at(1/3,height-nx/3+nz/3,-1/3));
  expect(patch.witnessB.y).toBeCloseTo(height-nx/3+nz/3,15);
  expect(patch.pairs).toHaveLength(3);
  for(const pair of patch.pairs){expect(pair.witnessA.y).toBeCloseTo(.2,15);expect(pair.witnessB.y).toBeCloseTo(height-nx*pair.witnessB.x-nz*pair.witnessB.z,15);}
 });
 it('keeps meaningful tilt and missing actual hull faces on the nearest-feature fallback',()=>{
  const nx=1e-6,length=Math.hypot(nx,1),normal=at(nx/length,1/length),floor=(x:number,z:number)=>at(x,-nx*x,z),shape={...box(),faceNormals:[at(0,-1)]};
  expect(originalConvexTrianglePatch(shape,at(0,1),[floor(-4,-4),floor(4,-4),floor(0,4)],normal)).toBeNull();
  const tiny=4e-9;
  expect(originalConvexTrianglePatch(box(),at(0,1),[at(-4,4*tiny,-4),at(4,-4*tiny,-4),at(0,0,4)],at(tiny,1))).toBeNull();
 });
 it('returns null for empty, edge-only and vertex-only projected contact',()=>{
  for(const pivot of [at(3,2),at(2,2),at(2,2,2)])expect(originalConvexPairPatch(box(),pivot,box(),at(),at(0,1))).toBeNull();
  expect(originalConvexTrianglePatch(box(),at(2,1),[at(-1,0,-1),at(1,0,-1),at(1,0,1)],at(0,1))).toBeNull();
 });
 it('does not promote a support edge or vertex into a planar face',()=>{
  const diagonal=1/Math.sqrt(2),vertex=1/Math.sqrt(3);
  expect(originalConvexPairPatch(box(),at(),box(),at(),at(diagonal,diagonal))).toBeNull();
  expect(originalConvexPairPatch(box(),at(),box(),at(),at(vertex,vertex,vertex))).toBeNull();
 });
 it('rejects a degenerate or noncoplanar triangle instead of inventing a planar patch',()=>{
  expect(originalConvexTrianglePatch(box(),at(0,1),[at(-1),at(),at(1)],at(0,1))).toBeNull();
  expect(originalConvexTrianglePatch(box(),at(0,1),[at(-1,0,-1),at(1,.001,-1),at(1,0,1)],at(0,1))).toBeNull();
 });
 it('validates finite pivots, finite shapes and normalized finite normals',()=>{
  for(const normal of [at(),at(0,2),at(NaN,1)])expect(()=>originalConvexPairPatch(box(),at(),box(),at(),normal)).toThrow();
  expect(()=>originalConvexPairPatch(box(),at(Infinity),box(),at(),at(0,1))).toThrow();
  expect(()=>originalConvexTrianglePatch(box(at(NaN)),at(),[at(),at(1),at(0,0,1)],at(0,1))).toThrow();
 });
 it('returns detached witnesses and leaves inputs untouched',()=>{
  const a=box(),b=box(),pa=at(0,2),pb=at(),normal=at(0,1),before=JSON.stringify({a,b,pa,pb,normal}),patch=originalConvexPairPatch(a,pa,b,pb,normal)!;
  patch.witnessA.x=999;patch.witnessB.y=777;expect(JSON.stringify({a,b,pa,pb,normal})).toBe(before);
  const pairSnapshot=JSON.stringify(patch.pairs);patch.witnessA.z=888;expect(JSON.stringify(patch.pairs)).toBe(pairSnapshot);
  const secondPair=JSON.stringify(patch.pairs[1]);patch.pairs[0].witnessA.x=123;patch.pairs[0].witnessB.y=456;
  expect(JSON.stringify(patch.pairs[1])).toBe(secondPair);expect(JSON.stringify({a,b,pa,pb,normal})).toBe(before);
  expect(originalConvexPairPatch(a,pa,b,pb,normal)!.witnessA).toEqual(at(0,1));
 });
});
