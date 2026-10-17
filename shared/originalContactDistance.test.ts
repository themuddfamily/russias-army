import {describe,it,expect} from 'vitest';
import {sweepOriginalConvexPairDistance as pair,sweepOriginalConvexTriangleDistance as triangle} from './originalContactDistance';
import {sweepOriginalConvexPair} from './originalConvexContact';
import {sweepOriginalConvexTriangle,type OriginalConvexPolytope} from './originalConvexSweep';
import {createOriginalBarrelConvex} from './originalBarrelShape';
import {originalRpgConvex,originalRpgBasisFromDirection} from './originalRpgShape';
import {originalGrenadeConvex} from './originalGrenadeShape';
import {originalGrenadeBasisFromDirection} from './originalGrenadeOrientation';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import type {Vec3} from './protocol';
import {readFileSync} from 'node:fs';
import {transpileModule,ModuleKind,ScriptTarget} from 'typescript';
import * as contactKernel from './originalConvexContact';
import * as sweepKernel from './originalConvexSweep';
const at=(x=0,y=0,z=0):Vec3=>({x,y,z}),zero=at();
function box():OriginalConvexPolytope{return {vertices:[at(-1,-1,-1),at(1,-1,-1),at(-1,1,-1),at(1,1,-1),at(-1,-1,1),at(1,-1,1),at(-1,1,1),at(1,1,1)],faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};}
const wall:readonly [Vec3,Vec3,Vec3]=[at(0,-10,-10),at(0,10,-10),at(0,0,10)];
// Keep the advancement/SAT policy identical while replacing only the optimized
// distance evaluator with exhaustive enumeration of EVERY original vertex,
// triangle, and edge. This isolates pruning and redundant-point removal, and
// does not substitute sampled paths or approximate distance as the oracle.
function exhaustiveReference():{pair:typeof pair;triangle:typeof triangle}{
 const source=readFileSync(new URL('./originalContactDistance.ts',import.meta.url),'utf8');
 const distance=/function separatedDistance\(a:Features,b:Features,offset:Vec3\):Distance \{[\s\S]*?\n\}/;
 const vertices=/prepareFeatures\(shape\.vertices\.filter\([\s\S]*?\),triangles,/;
 expect(source.match(distance)).not.toBeNull();expect(source.match(vertices)).not.toBeNull();
 const exhaustive=source.replace('const b=triangleFeatures(triangle),relative=sub(to,from);','const b=prepareFeatures(triangle,[triangle],[[triangle[0],triangle[1]],[triangle[1],triangle[2]],[triangle[2],triangle[0]]]),relative=sub(to,from);').replace(vertices,'prepareFeatures(shape.vertices,triangles,').replace(distance,`function separatedDistance(a:Features,b:Features,offset:Vec3):Distance {
  let best=Infinity,difference:Vec3={x:0,y:0,z:0};
  const candidate=(first:Vec3,second:Vec3)=>{const delta=sub(first,second),squared=dot(delta,delta);if(squared<best){best=squared;difference=delta;}};
  for(const vertex of a.vertices){const point=add(vertex,offset);for(const triangle of b.triangles)candidate(point,closestTriangle(point,triangle));}
  for(const vertex of b.vertices){const point=sub(vertex,offset);for(const triangle of a.triangles)candidate(add(closestTriangle(point,triangle),offset),vertex);}
  for(const edgeA of a.edges){const first=add(edgeA[0],offset),last=add(edgeA[1],offset);for(const edgeB of b.edges){const [x,y]=closestSegments(first,last,edgeB[0],edgeB[1]);candidate(x,y);}}
  const distance=Math.sqrt(best);return {distance,normal:distance>0?mul(difference,1/distance):{x:0,y:0,z:0}};
 }`);
 const exports:{sweepOriginalConvexPairDistance?:typeof pair;sweepOriginalConvexTriangleDistance?:typeof triangle}={};
 const compiled=transpileModule(exhaustive,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',compiled)((name:string)=>{
  if(name==='./originalConvexContact')return contactKernel;
  if(name==='./originalConvexSweep')return sweepKernel;
  throw Error(`Unexpected reference import ${name}`);
 },exports);
 return {pair:exports.sweepOriginalConvexPairDistance!,triangle:exports.sweepOriginalConvexTriangleDistance!};
}
function sameContact(actual:ReturnType<typeof pair>,expected:ReturnType<typeof pair>){
 if(!expected){expect(actual).toBeNull();return;}
 expect(actual).not.toBeNull();
 expect(actual!.fraction).toBeCloseTo(expected.fraction,10);
 expect(actual!.penetrationDepth).toBeCloseTo(expected.penetrationDepth,12);
 expect(actual!.initialOverlap).toBe(expected.initialOverlap);
 for(const axis of ['x','y','z'] as const)expect(actual!.normalBToA[axis]).toBeCloseTo(expected.normalBToA[axis],9);
}
// The exhaustive oracle deliberately retains the original no-witness API.
// Preserve exact equality on every preexisting field; separate tests validate
// new witnesses against independently calculated surface coordinates.
function originalTriangleFields(hit:ReturnType<typeof triangle>){return hit?{fraction:hit.fraction,position:hit.position,normal:hit.normal,penetrationDepth:hit.penetrationDepth,initialOverlap:hit.initialOverlap}:null;}
describe('original total finite-feature contact distance',()=>{
 it('detects exactly one total gap while leaving physical penetration zero',()=>{
  const shape=box();
  for(const gap of [.5*S,S])expect(pair(shape,at(-2-gap),at(-2-gap),shape,zero,zero,S)).toMatchObject({fraction:0,penetrationDepth:0,initialOverlap:false});
  expect(pair(shape,at(-2-1.01*S),at(-2-1.01*S),shape,zero,zero,S)).toBeNull();
 });
 it('finds relative moving contact and symmetric closest-feature normals',()=>{
  const shape=box(),a=pair(shape,at(-5),at(-1),shape,at(1),at(-1),.2)!;
  expect(a.fraction).toBeCloseTo(3.8/6,11);expect(a.normalBToA).toEqual(at(-1));
  const b=pair(shape,at(1),at(-1),shape,at(-5),at(-1),.2)!;
  expect(b.fraction).toBeCloseTo(a.fraction,12);expect(b.normalBToA).toEqual(at(1));
 });
 it('rejects diagonal corners that interval inflation would fill',()=>{
  const shape=box();expect(pair(shape,at(2+.75*S,2+.75*S),at(2+.75*S,2+.75*S),shape,zero,zero,S)).toBeNull();
  const hit=pair(shape,at(2+.6*S,2+.6*S),at(2+.6*S,2+.6*S),shape,zero,zero,S)!;
  expect(hit.normalBToA.x).toBeCloseTo(Math.SQRT1_2,10);expect(hit.normalBToA.y).toBeCloseTo(Math.SQRT1_2,10);
 });
 it('finds rounded finite edges and handles an exact grazing path',()=>{
  const shape=box(),hit=pair(shape,at(-4,2.3),at(4,2.3),shape,zero,zero,.5)!;
  expect(hit.fraction).toBeCloseTo((2-.4)/8,10);expect(hit.normalBToA.x).toBeCloseTo(-.8,10);expect(hit.normalBToA.y).toBeCloseTo(.6,10);
  const graze=pair(shape,at(-4,2.5),at(4,2.5),shape,zero,zero,.5)!;
  expect(graze.fraction).toBeCloseTo(.25,5);
  expect(pair(shape,at(-4,2.50001),at(4,2.50001),shape,zero,zero,.5)).toBeNull();
 });
 it('retains actual overlap normals/depth and zero-distance kernels',()=>{
  const a=box(),b=box();expect(pair(a,at(-1.5),at(-3),b,zero,zero,.2)).toEqual(sweepOriginalConvexPair(a,at(-1.5),at(-1.5),b,zero,zero));
  expect(pair(a,at(-4),at(4),b,zero,zero,0)).toEqual(sweepOriginalConvexPair(a,at(-4),at(4),b,zero,zero));
  expect(triangle(a,at(-.5),at(-4),wall,.2)).toEqual(sweepOriginalConvexTriangle(a,at(-.5),at(-.5),wall));
 });
 it('preserves off-center pivots for finite triangle contacts',()=>{
  const shape=box(),offset={...shape,vertices:shape.vertices.map(v=>({...v,x:v.x+2}))};
  const hit=triangle(offset,at(-6),at(6),wall,.2)!;
  expect(hit.fraction).toBeCloseTo(2.8/12,11);expect(hit.position.x).toBeCloseTo(-3.2,11);expect(hit.normal).toEqual(at(-1));expect(hit.initialOverlap).toBe(false);
  expect(triangle(shape,at(-4,20),at(4,20),wall,.2)).toBeNull();
 });
 it('uses finite triangle corner distance instead of an infinite plane or sharp expanded corner',()=>{
  const finite:readonly [Vec3,Vec3,Vec3]=[at(),at(0,1),at(0,0,1)],shape=box();
  expect(triangle(shape,at(-4,-1.075,-1.075),at(4,-1.075,-1.075),finite,.1)).toBeNull();
  const hit=triangle(shape,at(-4,-1.06,-1.06),at(4,-1.06,-1.06),finite,.1)!;
  expect(hit.fraction).toBeCloseTo((3-Math.sqrt(.01-.0072))/8,9);
  expect(hit.normal.y).toBeCloseTo(-.6,9);expect(hit.normal.z).toBeCloseTo(-.6,9);
 });
 it('accepts both complete source hulls without recentering their pivots',()=>{
  for(const shape of [originalRpgConvex(originalRpgBasisFromDirection(at(0,0,-1))),originalGrenadeConvex(originalGrenadeBasisFromDirection(at(0,-1,-.1)))]){
   const maximum=Math.max(...shape.vertices.map(v=>v.x));
   const hit=triangle(shape,at(-maximum-1),at(-maximum+.2),wall,S)!;
   expect(hit.fraction).toBeCloseTo((1-S)/1.2,8);expect(hit.position.x).toBeCloseTo(-maximum-S,8);expect(hit.penetrationDepth).toBe(0);
  }
 });
 it('is invariant under common translation and motion, and exposes skin contact without inventing penetration',()=>{
  const shape=box(),baseline=pair(shape,at(-5),at(-1),shape,at(1),at(-1),.2)!;
  const moved=pair(shape,at(15,-8,4),at(21,-5,2),shape,at(21,-8,4),at(21,-5,2),.2)!;
  expect(moved.fraction).toBeCloseTo(baseline.fraction,12);expect(moved.normalBToA).toEqual(baseline.normalBToA);
  expect(pair(shape,at(-2.1),at(-3),shape,zero,zero,.2)).toMatchObject({fraction:0,initialOverlap:false,penetrationDepth:0});
  expect(pair(shape,at(-2.3),at(-3),shape,zero,zero,.2)).toBeNull();
 });
 it('preserves the recovered RPG axial extent in full pair distance queries',()=>{
  const shape=originalRpgConvex(originalRpgBasisFromDirection(at(0,0,-1))),span=Math.max(...shape.vertices.map(v=>v.z))-Math.min(...shape.vertices.map(v=>v.z));
  const hit=pair(shape,zero,at(0,0,1),shape,at(0,0,1.5),at(0,0,1.5),S)!;
  expect(hit.fraction).toBeCloseTo(1.5-span-S,8);expect(hit.normalBToA.z).toBeCloseTo(-1,8);expect(hit.initialOverlap).toBe(false);
 });
 it('preserves detached world-space surface witnesses with off-center pivots and moving bodies',()=>{
  const base=box(),a={...base,vertices:base.vertices.map(v=>at(v.x+4,v.y+2,v.z-3))};
  const fromA=at(-9,-5,7),toA=at(-5,-2,5),fromB=at(1,-3,4),toB=at(-1,0,2);
  const hit=pair(a,fromA,toA,base,fromB,toB,.2)!;
  expect(hit.fraction).toBeCloseTo(3.8/6,11);
  const pivotA=at(fromA.x+(toA.x-fromA.x)*hit.fraction,fromA.y+(toA.y-fromA.y)*hit.fraction,fromA.z+(toA.z-fromA.z)*hit.fraction);
  const pivotB=at(fromB.x+(toB.x-fromB.x)*hit.fraction,fromB.y+(toB.y-fromB.y)*hit.fraction,fromB.z+(toB.z-fromB.z)*hit.fraction);
  expect(hit.witnessA).toBeDefined();expect(hit.witnessB).toBeDefined();
  expect(hit.witnessA!.x).toBeCloseTo(pivotA.x+5,11);expect(hit.witnessB!.x).toBeCloseTo(pivotB.x-1,11);
  expect(hit.witnessA!.y).toBeCloseTo(hit.witnessB!.y,11);expect(hit.witnessA!.z).toBeCloseTo(hit.witnessB!.z,11);
  expect(hit.witnessB!.x-hit.witnessA!.x).toBeCloseTo(.2,11);
  expect(hit.witnessA).not.toEqual(pivotA);expect(hit.witnessB).not.toEqual(pivotB);
  const swapped=pair(base,fromB,toB,a,fromA,toA,.2)!;
  expect(swapped.fraction).toBeCloseTo(hit.fraction,12);
  for(const axis of ['x','y','z'] as const){
   expect(swapped.witnessA![axis]).toBeCloseTo(hit.witnessB![axis],11);expect(swapped.witnessB![axis]).toBeCloseTo(hit.witnessA![axis],11);
  }
  hit.witnessA!.x=999;hit.witnessB!.y=999;
  const again=pair(a,fromA,toA,base,fromB,toB,.2)!;
  expect(again.witnessA!.x).not.toBe(999);expect(again.witnessB!.y).not.toBe(999);
  expect(a.vertices).toEqual(base.vertices.map(v=>at(v.x+4,v.y+2,v.z-3)));
 });
 it('retains actual finite corner witness separation aligned with the existing normal',()=>{
  const shape=box(),hit=pair(shape,at(-4,2.3),at(4,2.3),shape,zero,zero,.5)!;
  expect(hit.witnessA!.x).toBeCloseTo(-1.4,10);expect(hit.witnessA!.y).toBeCloseTo(1.3,10);
  expect(hit.witnessB!.x).toBeCloseTo(-1,10);expect(hit.witnessB!.y).toBeCloseTo(1,10);
  const delta=at(hit.witnessA!.x-hit.witnessB!.x,hit.witnessA!.y-hit.witnessB!.y,hit.witnessA!.z-hit.witnessB!.z),distance=Math.hypot(delta.x,delta.y,delta.z);
  expect(distance).toBeCloseTo(.5,10);
  for(const axis of ['x','y','z'] as const)expect(delta[axis]/distance).toBeCloseTo(hit.normalBToA[axis],10);
 });
 it('exposes world-space hull and triangle surfaces separately from the moving pivot',()=>{
  const shape=box(),offset={...shape,vertices:shape.vertices.map(v=>at(v.x+2,v.y,v.z))};
  const translatedWall=wall.map(v=>at(v.x+12,v.y-7,v.z+3)) as unknown as typeof wall;
  const hit=triangle(offset,at(6,-7,3),at(18,-7,3),translatedWall,.2)!;
  expect(hit.position.x).toBeCloseTo(8.8,11);expect(hit.witnessA!.x).toBeCloseTo(11.8,11);expect(hit.witnessB!.x).toBeCloseTo(12,11);
  expect(hit.witnessA!.y).toBeCloseTo(hit.witnessB!.y,11);expect(hit.witnessA!.z).toBeCloseTo(hit.witnessB!.z,11);
  const original=JSON.stringify(translatedWall);hit.witnessA!.y=999;hit.witnessB!.z=999;
  const again=triangle(offset,at(6,-7,3),at(18,-7,3),translatedWall,.2)!;
  expect(again.witnessA!.y).not.toBe(999);expect(again.witnessB!.z).not.toBe(999);expect(JSON.stringify(translatedWall)).toBe(original);
 });
 it('omits fabricated surface witnesses for zero-distance SAT and actual initial intersections',()=>{
  const shape=box();
  for(const hit of [pair(shape,at(-1.5),at(-3),shape,zero,zero,.2),pair(shape,at(-4),at(4),shape,zero,zero,0),triangle(shape,at(-.5),at(-4),wall,.2),triangle(shape,at(-4),at(4),wall,0)]){
   expect(hit).not.toBeNull();expect(hit!.witnessA).toBeUndefined();expect(hit!.witnessB).toBeUndefined();
  }
 });
 it('rejects open hulls, invalid distances and degenerate triangles',()=>{
  const shape=box(),{faces:_,...open}=shape;
  expect(()=>pair(open,zero,zero,shape,zero,zero,S)).toThrow(/faces/);
  expect(()=>triangle(shape,zero,zero,wall,-1)).toThrow();
  expect(triangle(shape,zero,zero,[zero,zero,zero],S)).toBeNull();
 });
 it('does not cache a frozen hull whose face accessor can change topology',()=>{
  const source=box();
  const closed=Object.freeze(source.faces!.map(face=>Object.freeze([...face] as [number,number,number])));
  let current:readonly (readonly [number,number,number])[]=closed;
  const shape=Object.freeze({
   vertices:Object.freeze(source.vertices.map(v=>Object.freeze(v))),
   faceNormals:Object.freeze(source.faceNormals.map(v=>Object.freeze(v))),
   edgeDirections:Object.freeze(source.edgeDirections.map(v=>Object.freeze(v))),
   get faces(){return current;},
  });
  expect(triangle(shape,at(-2-S),at(-2-S),wall,S)).toBeNull();
  current=Object.freeze(closed.slice(1));
  expect(()=>triangle(shape,at(-2-S),at(-2-S),wall,S)).toThrow(/Closed convex hull/);
 });
 it('matches exhaustive original features for moving source pairs, offsets, skin contacts and misses',()=>{
  const reference=exhaustiveReference(),grenade=originalGrenadeConvex(originalGrenadeBasisFromDirection(at(.2,-1,-.1))),rpg=originalRpgConvex(originalRpgBasisFromDirection(at(.1,.2,-1)));
  for(const [a,b] of [[grenade,grenade],[grenade,rpg],[rpg,grenade],[rpg,rpg]]){
   for(const [from,to,otherFrom,otherTo] of [
    [at(-.6,.01,.01),at(.6,.01,.01),zero,zero],
    [at(12-.6,-7+.04,3),at(12+.3,-7+.04,3),at(12,-7,3),at(12-.3,-7,3)],
    [at(-.6,.5,.4),at(.6,.5,.4),zero,zero],
   ])sameContact(pair(a,from,to,b,otherFrom,otherTo,S),reference.pair(a,from,to,b,otherFrom,otherTo,S));
  }
  const shape=box();
  for(const y of [2.5,2.50001])sameContact(pair(shape,at(-4,y),at(4,y),shape,zero,zero,.5),reference.pair(shape,at(-4,y),at(4,y),shape,zero,zero,.5));
 });
 it('matches exhaustive distance after mutable vertices change and immutable source features are reused',()=>{
  const reference=exhaustiveReference(),source=originalGrenadeConvex(originalGrenadeBasisFromDirection(at(0,-1,-.2))),mutable={...source,vertices:source.vertices.map(v=>({...v}))};
  for(let iteration=0;iteration<3;iteration++){
   const start=at(-.4,.02,.01),end=at(.4,.02,.01);
   sameContact(pair(source,start,end,source,zero,zero,S),reference.pair(source,start,end,source,zero,zero,S));
   sameContact(pair(mutable,start,end,source,zero,zero,S),reference.pair(mutable,start,end,source,zero,zero,S));
   for(const vertex of mutable.vertices)vertex.x+=.007;
  }
  // Inconsistent generic input keeps an extra exterior vertex, matching the
  // existing kernel contract rather than silently omitting an unchecked point.
  const original=box(),generic={...original,vertices:[...original.vertices,at(-3,0,0)]};
  sameContact(pair(generic,at(-5),at(-1),box(),zero,zero,.2),reference.pair(generic,at(-5),at(-1),box(),zero,zero,.2));
 });
 it('matches exhaustive source hull distance at finite triangles and translated corners',()=>{
  const reference=exhaustiveReference(),finite:readonly [Vec3,Vec3,Vec3]=[at(),at(0,.2),at(0,0,.2)];
  for(const shape of [originalGrenadeConvex(originalGrenadeBasisFromDirection(at(.2,-1,-.1))),originalRpgConvex(originalRpgBasisFromDirection(at(.1,.2,-1)))]){
   for(const [start,end,facet] of [
    [at(-1,.03,.03),at(1,.03,.03),finite],
    [at(-1,.4,.4),at(1,.4,.4),finite],
    [at(11,-6.97,3.03),at(13,-6.97,3.03),finite.map(p=>at(p.x+12,p.y-7,p.z+3)) as unknown as typeof finite],
   ] as const){
    const actual=triangle(shape,start,end,facet,S),expected=reference.triangle(shape,start,end,facet,S);
    if(!expected){expect(actual).toBeNull();continue;}
    expect(actual).not.toBeNull();expect(actual!.fraction,JSON.stringify({vertices:shape.vertices.length,start,end,actual,expected})).toBeCloseTo(expected.fraction,10);
    expect(actual!.penetrationDepth).toBeCloseTo(expected.penetrationDepth,12);expect(actual!.initialOverlap).toBe(expected.initialOverlap);
    for(const axis of ['x','y','z'] as const){expect(actual!.normal[axis]).toBeCloseTo(expected.normal[axis],9);expect(actual!.position[axis]).toBeCloseTo(expected.position[axis],10);}
   }
  }
 });
 it('preserves full barrel contacts when immutable triangle features are reused',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8'));
  const points:Vec3[]=data.meshes.find((m:any)=>m.resource==='barrel').positions.map((p:number[])=>at(p[0]*S,p[2]*S,-p[1]*S));
  const shape=createOriginalBarrelConvex(points),reference=exhaustiveReference();
  const floor=Object.freeze([Object.freeze(at(-2,0,-2)),Object.freeze(at(2,0,-2)),Object.freeze(at(0,0,2))]) as readonly [Vec3,Vec3,Vec3];
  for(let i=0;i<25;i++){
   const from=at(-.8+i*.065,S+.000028,1.5),to=at(from.x+.007,from.y-.0004,from.z+.002);
   const expected=reference.triangle(shape,from,to,floor,S);
   expect(originalTriangleFields(triangle(shape,from,to,floor,S))).toEqual(expected);
   expect(originalTriangleFields(triangle(shape,from,to,floor,S))).toEqual(expected);
  }
 });
 it('rebuilds triangle features for frozen accessor-backed and mutable triangles',()=>{
  const shape=box(),reference=exhaustiveReference();let shift=0;
  const base=[at(0,-1,-1),at(0,1,-1),at(0,0,1)];
  const moving=Object.freeze(base.map(v=>Object.freeze({get x(){return v.x+shift;},y:v.y,z:v.z}))) as readonly [Vec3,Vec3,Vec3];
  const accessor=Object.freeze(Object.defineProperties([],{0:{get:()=>Object.freeze(at(shift,-1,-1))},1:{get:()=>Object.freeze(at(shift,1,-1))},2:{get:()=>Object.freeze(at(shift,0,1))},length:{value:3}})) as unknown as readonly [Vec3,Vec3,Vec3];
  const mutable=base.map(v=>({...v})) as [Vec3,Vec3,Vec3];
  for(shift of [0,3,-3,.005,2,0]){
   for(const v of mutable)v.x=shift;
   for(const face of [moving,accessor,mutable]){
    const plain=face.map(v=>({...v})) as [Vec3,Vec3,Vec3];
    for(const [from,to] of [[at(-2.1,1.9,.7),at(.1,1.9,.7)],[at(-1.02,0,1.02),at(-1.02,0,1.02)]]){
     expect(originalTriangleFields(triangle(shape,from,to,face,S))).toEqual(reference.triangle(shape,from,to,plain,S));
    }
   }
  }
 });

});
