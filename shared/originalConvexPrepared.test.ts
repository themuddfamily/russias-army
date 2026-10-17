import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {sweepOriginalConvexTriangle,originalConvexIsImmutable,originalConvexImmutabilityKnown} from './originalConvexSweep';
import {sweepOriginalConvexPair,sweepOriginalConvexSphere} from './originalConvexContact';
import {originalRpgConvex,originalRpgBasisFromSourceRotation} from './originalRpgShape';
import {createOriginalAngularBody,originalAngularConvex} from './originalAngularBody';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import type {OriginalSceneData} from './originalSceneGeometry';
import type {Vec3} from './protocol';
const v=(x=0,y=0,z=0):Vec3=>({x,y,z});
const mutable=<T>(s:T):T=>structuredClone(s);
const triangle=(x=0):readonly [Vec3,Vec3,Vec3]=>Object.freeze([Object.freeze(v(x-10,-10,-1)),Object.freeze(v(x+10,-10,-1)),Object.freeze(v(x,10,-1))] as [Vec3,Vec3,Vec3]);
describe('immutable prepared full convex projection reuse',()=>{
 it('only reports a previous immutability proof and never evaluates unproven getters',()=>{
  const base=originalRpgConvex(originalRpgBasisFromSourceRotation(v())),ordinary=Object.freeze({...base});
  expect(originalConvexImmutabilityKnown(ordinary)).toBe(false);
  expect(originalConvexIsImmutable(ordinary)).toBe(true);
  expect(originalConvexImmutabilityKnown(ordinary)).toBe(true);
  let reads=0;
  const accessor=Object.freeze({...base,get vertices(){reads++;return base.vertices;}});
  expect(originalConvexImmutabilityKnown(accessor)).toBe(false);
  expect(reads).toBe(0);
 });
 it('reuses frozen face topology without retaining rotated coordinates or suppressing coordinate validation',()=>{
  const body=createOriginalAngularBody(originalRpgConvex(originalRpgBasisFromSourceRotation(v(7,12,3))),100),face=triangle();
  let contacts=0;
  for(let i=0;i<12;i++){
   const angle=(i+1)*.012;body.orientation={x:Math.sin(angle/2),y:0,z:0,w:Math.cos(angle/2)};
   const shape=originalAngularConvex(body);
   expect(shape.faces).toBe(body.referenceConvex.faces);
   const result=sweepOriginalConvexTriangleDistance(shape,v(0,0,2),v(.2,.15,-2),face,.02);
   expect(result).toEqual(sweepOriginalConvexTriangleDistance(mutable(shape),v(0,0,2),v(.2,.15,-2),mutable(face),.02));
   if(result)contacts++;
  }
  expect(contacts).toBeGreaterThan(0);
  const base=body.referenceConvex;
  expect(()=>sweepOriginalConvexTriangleDistance({...base,vertices:base.vertices.map(()=>v())},v(),v(),face,.02)).toThrow('Degenerate contact distance hull face');
  expect(()=>sweepOriginalConvexTriangleDistance({...base,vertices:base.vertices.slice(0,4)},v(),v(),face,.02)).toThrow('Invalid contact distance hull face');
 });
 it('retains exact full-axis contacts after early rejection for changing angular hulls',()=>{
  const body=createOriginalAngularBody(originalRpgConvex(originalRpgBasisFromSourceRotation(v(7,12,3))),100),face=triangle();
  let contacts=0;
  for(let i=0;i<20;i++){
   const angle=(i+1)*.012;body.orientation={x:Math.sin(angle/2),y:0,z:0,w:Math.cos(angle/2)};
   const shape=originalAngularConvex(body),raw=mutable(shape);
   for(const [from,to] of [[v(30,0,2),v(30,0,-2)],[v(0,0,2),v(.2,.15,-2)],[v(.1,.1,-1),v(.1,.1,-1)]] as const){
    const result=sweepOriginalConvexTriangle(shape,from,to,face);
    expect(result).toEqual(sweepOriginalConvexTriangle(raw,from,to,mutable(face)));if(result)contacts++;
   }
  }
  expect(contacts).toBeGreaterThan(0);
 });
 it('preserves exact pair fractions, normals, depths and order across changing pivots/paths',()=>{
  const a=originalRpgConvex(originalRpgBasisFromSourceRotation(v(18,9,30))),b=originalRpgConvex(originalRpgBasisFromSourceRotation(v(-12,4,-80))),rawA=mutable(a),rawB=mutable(b);
  const hits=[];
  for(let i=0;i<40;i++){
   const fromA=v(i*.025,.03,.1),toA=v(fromA.x+.5,-.03,-.2),fromB=v(.7-i*.008,.01,-.1),toB=v(fromB.x-.3,.1,.2);
   const raw=sweepOriginalConvexPair(rawA,fromA,toA,rawB,fromB,toB),prepared=sweepOriginalConvexPair(a,fromA,toA,b,fromB,toB);expect(prepared).toEqual(raw);hits.push(prepared);
  }
  expect(hits.some(Boolean)).toBe(true);const overlap=sweepOriginalConvexPair(a,v(),v(),a,v(),v());expect(overlap?.initialOverlap).toBe(true);expect(overlap).toEqual(sweepOriginalConvexPair(rawA,v(),v(),rawA,v(),v()));
 });
 it('keeps exact triangle contact numbers across repeated and changed trajectories',()=>{
  const shape=originalRpgConvex(originalRpgBasisFromSourceRotation(v(7,12,3))),raw=mutable(shape),face=triangle();
  for(let i=0;i<80;i++){
   const from=v(i*.007,.1,1.5),to=v(from.x+.2,.15,-.8);
   expect(sweepOriginalConvexTriangle(shape,from,to,face)).toEqual(sweepOriginalConvexTriangle(raw,from,to,mutable(face)));
  }
 });
 it('does not retain stale projections for arbitrary mutable or partially frozen inputs',()=>{
  const shape=mutable(originalRpgConvex(originalRpgBasisFromSourceRotation(v()))),fixed=originalRpgConvex(originalRpgBasisFromSourceRotation(v())),face=mutable(triangle());
  const from=v(0,0,2),to=v(0,0,-2);expect(sweepOriginalConvexTriangle(shape,from,to,face)).not.toBeNull();
  shape.vertices.forEach(p=>{p.x+=30;});expect(sweepOriginalConvexTriangle(shape,from,to,face)).toBeNull();
  expect(sweepOriginalConvexTriangle(fixed,from,to,face)).not.toBeNull();Object.freeze(face);face.forEach(p=>{p.x+=30;});expect(sweepOriginalConvexTriangle(fixed,from,to,face)).toBeNull();
 });
 it('detaches contact normals from prepared axes and evicts static triangle partners without changing results',()=>{
  const shape=originalRpgConvex(originalRpgBasisFromSourceRotation(v())),raw=mutable(shape),from=v(0,0,2),to=v(0,0,-2),first=triangle();
  const hit=sweepOriginalConvexTriangle(shape,from,to,first)!;hit.normal.x=999;
  for(let i=0;i<70;i++){const face=triangle(i*.001);expect(sweepOriginalConvexTriangle(shape,from,to,face)).toEqual(sweepOriginalConvexTriangle(raw,from,to,mutable(face)));}
  expect(sweepOriginalConvexTriangle(shape,from,to,first)).toEqual(sweepOriginalConvexTriangle(raw,from,to,mutable(first)));
  const b=originalRpgConvex(originalRpgBasisFromSourceRotation(v(0,0,15))),pair=sweepOriginalConvexPair(shape,v(0,0,1.5),v(0,0,0),b,v(),v())!;pair.normalBToA.x=999;
  expect(sweepOriginalConvexPair(shape,v(0,0,1.5),v(0,0,0),b,v(),v())).toEqual(sweepOriginalConvexPair(raw,v(0,0,1.5),v(0,0,0),mutable(b),v(),v()));
 });
 it('reuses prepared support projections without rereading immutable vertices on repeated queries',()=>{
  const base=originalRpgConvex(originalRpgBasisFromSourceRotation(v()));let cachedReads=0,rawReads=0;
  const instrument=(increment:()=>void)=>base.vertices.map(point=>new Proxy(point,{get(target,key,receiver){if(key==='x'||key==='y'||key==='z')increment();return Reflect.get(target,key,receiver);}}));
  const prepared=Object.freeze({...base,vertices:Object.freeze(instrument(()=>cachedReads++))}),raw={...base,vertices:instrument(()=>rawReads++)},b=originalRpgConvex(originalRpgBasisFromSourceRotation(v(0,0,15)));
  const from=v(0,0,1.5),to=v(),other=v();sweepOriginalConvexPair(prepared,from,to,b,other,other);cachedReads=0;
  expect(sweepOriginalConvexPair(prepared,from,to,b,other,other)).toEqual(sweepOriginalConvexPair(raw,from,to,b,other,other));expect(cachedReads).toBe(0);expect(rawReads).toBeGreaterThan(1000);
  const face=triangle();sweepOriginalConvexTriangle(prepared,from,to,face);cachedReads=0;
  expect(sweepOriginalConvexTriangle(prepared,from,to,face)).toEqual(sweepOriginalConvexTriangle(raw,from,to,mutable(face)));expect(cachedReads).toBe(0);
 });
 it('does not mistake frozen accessor coordinates for immutable numeric data',()=>{
  const base=originalRpgConvex(originalRpgBasisFromSourceRotation(v()));let offset=0;
  const vertices=Object.freeze(base.vertices.map(point=>Object.freeze({get x(){return point.x+offset;},y:point.y,z:point.z}))),shape=Object.freeze({...base,vertices}),face=triangle(),from=v(0,0,2),to=v(0,0,-2);
  expect(sweepOriginalConvexTriangle(shape,from,to,face)).not.toBeNull();offset=30;expect(sweepOriginalConvexTriangle(shape,from,to,face)).toBeNull();
 });
 it('leaves frozen triangle coordinate getters and frozen shape array index getters uncached',()=>{
  const base=originalRpgConvex(originalRpgBasisFromSourceRotation(v())),from=v(0,0,2),to=v(0,0,-2);let offset=0;
  const face=Object.freeze(triangle().map(point=>Object.freeze({get x(){return point.x+offset;},y:point.y,z:point.z})) as [Vec3,Vec3,Vec3]);
  expect(sweepOriginalConvexTriangle(base,from,to,face)).not.toBeNull();offset=30;expect(sweepOriginalConvexTriangle(base,from,to,face)).toBeNull();
  offset=0;const vertices=base.vertices.map(point=>point);vertices.forEach((point,index)=>Object.defineProperty(vertices,index,{get:()=>Object.freeze({...point,x:point.x+offset}),configurable:false}));Object.freeze(vertices);
  const shape=Object.freeze({...base,vertices});expect(sweepOriginalConvexTriangle(shape,from,to,triangle())).not.toBeNull();offset=30;expect(sweepOriginalConvexTriangle(shape,from,to,triangle())).toBeNull();
 });
 for(const map of ['barrack','woodlands'] as const)it(`${map} real map query preserves full hull results for moving RPG paths with prepared static triangles`,()=>{
  const folder=map==='woodlands'?'woodland':map,data=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${folder}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData,runtime=registerOriginalMapRuntime(map,data);
  const shape=originalRpgConvex(originalRpgBasisFromSourceRotation(v(0,0,15))),raw=mutable(shape),p=runtime.spawnPoints[0];let contacts=0;
  for(let step=0;step<30;step++){
   const from=v(p.x+step*.01,p.y+.7,p.z+.2),to=v(from.x+.2,from.y-.8,from.z-.3);
   const plain=runtime.geometry.sweepConvex(from,to,raw),cached=runtime.geometry.sweepConvex(from,to,shape);expect(cached).toEqual(plain);if(cached)contacts++;
   expect(sweepOriginalConvexSphere(shape,from,to,v(p.x+.8,p.y+1,p.z-.3),v(p.x+.7,p.y+.8,p.z-.3),.5)).toEqual(sweepOriginalConvexSphere(raw,from,to,v(p.x+.8,p.y+1,p.z-.3),v(p.x+.7,p.y+.8,p.z-.3),.5));
  }
  expect(contacts).toBeGreaterThan(0);
 });
});
