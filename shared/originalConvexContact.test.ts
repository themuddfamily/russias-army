import {describe,it,expect} from 'vitest';
import {sweepOriginalConvexPair,sweepOriginalConvexSphere} from './originalConvexContact';
import {originalRpgConvex,originalRpgBasisFromDirection} from './originalRpgShape';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';
const zero={x:0,y:0,z:0};
const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
type Closed=OriginalConvexPolytope&{faces:readonly (readonly [number,number,number])[]};
function expectNormal(actual:Vec3,expected:Vec3){for(const key of ['x','y','z'] as const)expect(actual[key]).toBeCloseTo(expected[key],12);}
function box(x=1,y=1,z=1):Closed{return {vertices:[at(-x,-y,-z),at(x,-y,-z),at(-x,y,-z),at(x,y,-z),at(-x,-y,z),at(x,-y,z),at(-x,y,z),at(x,y,z)],faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};}
function rotate(shape:Closed,angle:number):Closed{const c=Math.cos(angle),s=Math.sin(angle),r=(v:Vec3)=>at(v.x*c-v.y*s,v.x*s+v.y*c,v.z);return {...shape,vertices:shape.vertices.map(r),faceNormals:shape.faceNormals.map(r),edgeDirections:shape.edgeDirections.map(r)};}
function rotate3(shape:Closed,x:number,y:number,z:number):Closed{
 const rotatePoint=(v:Vec3)=>{const a=at(v.x,v.y*Math.cos(x)-v.z*Math.sin(x),v.y*Math.sin(x)+v.z*Math.cos(x)),b=at(a.x*Math.cos(y)+a.z*Math.sin(y),a.y,-a.x*Math.sin(y)+a.z*Math.cos(y));return at(b.x*Math.cos(z)-b.y*Math.sin(z),b.x*Math.sin(z)+b.y*Math.cos(z),b.z);};
 return {...shape,vertices:shape.vertices.map(rotatePoint),faceNormals:shape.faceNormals.map(rotatePoint),edgeDirections:shape.edgeDirections.map(rotatePoint)};
}
describe('fixed-orientation continuous original convex contacts',()=>{
 it('sweeps the complete pair, with relative moving bodies and symmetric fraction/opposite normal',()=>{
  const a=box(),b=box(),hit=sweepOriginalConvexPair(a,at(-5),at(-1),b,at(1),at(-1))!;
  expect(hit.fraction).toBeCloseTo(2/3,12);expectNormal(hit.normalBToA,at(-1));expect(hit.penetrationDepth).toBe(0);expect(hit.initialOverlap).toBe(false);
 const swapped=sweepOriginalConvexPair(b,at(1),at(-1),a,at(-5),at(-1))!;expect(swapped.fraction).toBe(hit.fraction);expect(swapped.normalBToA.x).toBe(1);
  expect(hit.witnessA).toBeUndefined();expect(hit.witnessB).toBeUndefined();expect(swapped.witnessA).toBeUndefined();
 });
 it('uses containment-correct pair MTV instead of the intersection width',()=>{
  const hit=sweepOriginalConvexPair(box(),at(.5),at(.5),box(5,5,5),zero,zero)!;
  expect(hit.initialOverlap).toBe(true);expect(hit.fraction).toBe(0);expect(hit.penetrationDepth).toBe(5.5);expect(hit.normalBToA).toEqual(at(1));
 });
 it('rejects separated and touching separating pairs while keeping penetrating geometric MTVs',()=>{
  expect(sweepOriginalConvexPair(box(),at(-2),at(-3),box(),zero,zero)).toBeNull();
  expect(sweepOriginalConvexPair(box(),at(-3),at(-4),box(),zero,zero)).toBeNull();
  const overlapping=sweepOriginalConvexPair(box(),at(-1.5),at(-3),box(),zero,zero)!;expect(overlapping.penetrationDepth).toBe(.5);
 });
 it('tests crossed edges and oblique thin finite shapes rather than axis-aligned bounds',()=>{
  const a=rotate(box(2,.1,.1),Math.PI/4),b=rotate(box(2,.1,.1),-Math.PI/4);
  const hit=sweepOriginalConvexPair(a,at(0,0,-2),at(0,0,2),b,zero,zero)!;expect(hit.fraction).toBeCloseTo(.45,12);expectNormal(hit.normalBToA,at(0,0,-1));
  expect(sweepOriginalConvexPair(a,at(4,4,-2),at(4,4,2),b,zero,zero)).toBeNull();
 });
 it('rejects a skew finite pair separated only by an edge-cross axis when every face-normal interval overlaps',()=>{
  const a=rotate3(box(1.5,.2,.3),.2,.5,.1),b=rotate3(box(1.5,.2,.3),1.2,-.4,.8),pivot=at(-2,-1.55,.1);
  for(const n of [...a.faceNormals,...b.faceNormals]){
   const project=(v:Vec3)=>v.x*n.x+v.y*n.y+v.z*n.z,pa=a.vertices.map(project),pb=b.vertices.map(v=>project(at(v.x+pivot.x,v.y+pivot.y,v.z+pivot.z)));
   expect(Math.max(...pa)).toBeGreaterThanOrEqual(Math.min(...pb));expect(Math.max(...pb)).toBeGreaterThanOrEqual(Math.min(...pa));
  }
  expect(sweepOriginalConvexPair(a,zero,zero,b,pivot,pivot)).toBeNull();
 });
 it('uses the actual oblique face normal for a translating sphere',()=>{
  const angle=.7,n=at(Math.cos(angle),Math.sin(angle)),shape=rotate(box(1,.5,.2),angle),start=at(n.x*3,n.y*3);
  const hit=sweepOriginalConvexSphere(shape,zero,zero,start,zero,.2)!;expect(hit.fraction).toBeCloseTo(.6,12);expectNormal(hit.normalBToA,at(-n.x,-n.y));
 });
 it('contacts a face with the exact radius and uses sphere relative motion',()=>{
  const hit=sweepOriginalConvexSphere(box(),zero,zero,at(3),zero,.2)!;expect(hit.fraction).toBeCloseTo(.6,12);expectNormal(hit.normalBToA,at(-1));
  const moving=sweepOriginalConvexSphere(box(),zero,at(1),at(3),at(2),.2)!;expect(moving.fraction).toBeCloseTo(.9,12);expect(moving.normalBToA).toEqual(at(-1));
  expectNormal(hit.witnessA!,at(1));expectNormal(hit.witnessB!,at(1));
  expectNormal(moving.witnessA!,at(1.9));expectNormal(moving.witnessB!,at(1.9));
 });
 it('retains rounded finite edge/vertex features, including an exact edge hit and a corner near miss',()=>{
  expect(sweepOriginalConvexSphere(box(),zero,zero,at(-3,1.8,1.8),at(3,1.8,1.8),1)).toBeNull();
 const hit=sweepOriginalConvexSphere(box(),zero,zero,at(3,1.3,0),at(0,1.3,0),.5)!;
  expect(hit.fraction).toBeCloseTo((3-1-Math.sqrt(.25-.09))/3,10);expect(hit.normalBToA.x).toBeCloseTo(-.8,10);expect(hit.normalBToA.y).toBeCloseTo(-.6,10);
  expectNormal(hit.witnessA!,at(1,1));expectNormal(hit.witnessB!,at(1,1));
 });
 it('handles a grazing vertex without a sharp SAT-expanded corner',()=>{
  const hit=sweepOriginalConvexSphere(box(),zero,zero,at(-3,1.3,1.4),at(3,1.3,1.4),.5)!;expect(hit).not.toBeNull();expect(hit.fraction).toBeCloseTo(1/3,5);
  expect(sweepOriginalConvexSphere(box(),zero,zero,at(-3,1.3001,1.4),at(3,1.3001,1.4),.5)).toBeNull();
 });
 it('finds the signed nearest exit face for an interior sphere and preserves deep separating overlap',()=>{
  const hit=sweepOriginalConvexSphere(box(),zero,zero,at(.5),at(.6),.2)!;expect(hit.penetrationDepth).toBeCloseTo(.7,12);expectNormal(hit.normalBToA,at(-1));expect(hit.initialOverlap).toBe(true);
  expectNormal(hit.witnessA!,at(1));expectNormal(hit.witnessB!,at(.3));
  expect(sweepOriginalConvexSphere(box(),zero,zero,at(1.2),at(2),.2)).toBeNull();
 });
 it('is invariant under shared translation and common motion without recentering either body',()=>{
  const shape=rotate(box(1,.5,.2),.7),a=sweepOriginalConvexSphere(shape,zero,zero,at(3),zero,.2)!;
 const shift=at(8,-4,3),end=at(10,-3,2),b=sweepOriginalConvexSphere(shape,shift,end,at(11,-4,3),end,.2)!;
  expect(b.fraction).toBeCloseTo(a.fraction,12);expect(b.normalBToA.x).toBeCloseTo(a.normalBToA.x,12);expect(b.normalBToA.y).toBeCloseTo(a.normalBToA.y,12);
  const offset=at(shift.x+(end.x-shift.x)*b.fraction,shift.y+(end.y-shift.y)*b.fraction,shift.z+(end.z-shift.z)*b.fraction);
  for(const key of ['x','y','z'] as const){expect(b.witnessA![key]).toBeCloseTo(a.witnessA![key]+offset[key],12);expect(b.witnessB![key]).toBeCloseTo(a.witnessB![key]+offset[key],12);}
 });
 it('hits the recovered RPG nose and rear while its physical pivot stays far from contact',()=>{
  const shape=originalRpgConvex(originalRpgBasisFromDirection(at(0,0,-1))),minZ=Math.min(...shape.vertices.map(v=>v.z)),maxZ=Math.max(...shape.vertices.map(v=>v.z));
  const centerY=7.1040019989*S,r=.01;
  const nose=sweepOriginalConvexSphere(shape,zero,zero,at(0,centerY,minZ-.5),at(0,centerY,minZ+.1),r)!;
  expect(nose).not.toBeNull();expect(nose.fraction).toBeCloseTo((.5-r)/.6,8);expect(Math.abs(minZ)).toBeGreaterThan(.8);
  const rear=sweepOriginalConvexSphere(shape,zero,zero,at(0,centerY,maxZ+.5),at(0,centerY,maxZ-.1),r)!;expect(rear).not.toBeNull();expect(rear.fraction).toBeCloseTo((.5-r)/.6,8);
  expect(nose.witnessA!.z).toBeCloseTo(minZ,8);expect(nose.witnessB!.z).toBeCloseTo(minZ,8);
  expect(rear.witnessA!.z).toBeCloseTo(maxZ,8);expect(rear.witnessB!.z).toBeCloseTo(maxZ,8);
  expect(Math.abs(nose.witnessA!.z)).toBeGreaterThan(.8);
 });
 it('sweeps recovered RPG hulls against each other with full axial span and opposite swapped contact normals',()=>{
  const shape=originalRpgConvex(originalRpgBasisFromDirection(at(0,0,-1))),span=Math.max(...shape.vertices.map(v=>v.z))-Math.min(...shape.vertices.map(v=>v.z));
  const hit=sweepOriginalConvexPair(shape,zero,at(0,0,1),shape,at(0,0,1.5),at(0,0,1.5))!;expect(hit.fraction).toBeCloseTo(1.5-span,8);expectNormal(hit.normalBToA,at(0,0,-1));
  const reverse=sweepOriginalConvexPair(shape,at(0,0,1.5),at(0,0,1.5),shape,zero,at(0,0,1))!;expect(reverse.fraction).toBeCloseTo(hit.fraction,12);expectNormal(reverse.normalBToA,at(0,0,1));
 });
 it('requires actual closed hull triangles and rejects invalid radii',()=>{
  const {faces:_,...open}=box();expect(()=>sweepOriginalConvexSphere(open,zero,zero,at(3),zero,.2)).toThrow(/faces/);expect(()=>sweepOriginalConvexSphere(box(),zero,zero,at(3),zero,0)).toThrow();
 });
 it('keeps tolerance witnesses on actual surfaces rather than moving them to a midpoint',()=>{
  const hit=sweepOriginalConvexSphere(box(),at(5,2,3),at(5,2,3),at(8,2,3),at(5,2,3),.2,.1)!;
  expect(hit.fraction).toBeCloseTo(1.7/3,12);expect(hit.initialOverlap).toBe(false);expect(hit.penetrationDepth).toBe(0);
  expectNormal(hit.witnessA!,at(6,2,3));expectNormal(hit.witnessB!,at(6.1,2,3));
 });
 it('reconstructs an interior oblique exit point under an offset physical pivot',()=>{
  const angle=.7,n=at(Math.cos(angle),Math.sin(angle)),pivot=at(9,-4,3),center=at(pivot.x+.5*n.x,pivot.y+.5*n.y,pivot.z);
  const hit=sweepOriginalConvexSphere(rotate(box(1,2,3),angle),pivot,pivot,center,center,.2)!;
  expect(hit.penetrationDepth).toBeCloseTo(.7,12);expectNormal(hit.normalBToA,at(-n.x,-n.y));
  expectNormal(hit.witnessA!,at(pivot.x+n.x,pivot.y+n.y,pivot.z));
  expectNormal(hit.witnessB!,at(pivot.x+.3*n.x,pivot.y+.3*n.y,pivot.z));
 });
 it('returns independent world points even when a nearest feature is a caller-owned vertex',()=>{
  const shape=box(),before=shape.vertices.map(v=>({...v})),start=at(3,3,3),end=at(1,1,1);
  const hit=sweepOriginalConvexSphere(shape,zero,zero,start,end,.5)!;
  expectNormal(hit.witnessA!,at(1,1,1));expectNormal(hit.witnessB!,at(1,1,1));
  expect(shape.vertices).not.toContain(hit.witnessA);expect(hit.witnessA).not.toBe(hit.witnessB);
  hit.witnessA!.x=99;hit.witnessB!.y=98;
  expect(shape.vertices).toEqual(before);expect(start).toEqual(at(3,3,3));expect(end).toEqual(at(1,1,1));
 });
});
