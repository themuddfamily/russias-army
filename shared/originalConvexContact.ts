import type {Vec3} from './protocol';
import {originalConvexIsImmutable,type OriginalConvexPolytope} from './originalConvexSweep';

/** Translation-only contacts retain each caller's physical pivot. The normal
 * points from body B towards body A; positive penetration is a separating MTV.
 * Native rotational CCD, hull margins and manifold selection remain unproved. */
export interface OriginalConvexContact {
 fraction:number;normalBToA:Vec3;penetrationDepth:number;initialOverlap:boolean;
 /** Proven surface witnesses in world space at the returned fraction.
  * Sphere contacts use A=convex surface and B=sphere surface. SAT pair
  * contacts omit them until an actual finite-feature manifold is established. */
 witnessA?:Vec3;witnessB?:Vec3;
}
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const add=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(a:Vec3,s:number):Vec3=>({x:a.x*s,y:a.y*s,z:a.z*s});
const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const finite=(v:Vec3)=>[v.x,v.y,v.z].every(Number.isFinite);
const size=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
const TOL=1e-12;
const validatedShapes=new WeakSet<OriginalConvexPolytope>();
function validShape(shape:OriginalConvexPolytope):void {
 if(validatedShapes.has(shape))return;
 if(shape.vertices.length<4||!shape.faceNormals.length||!shape.edgeDirections.length||![...shape.vertices,...shape.faceNormals,...shape.edgeDirections].every(finite))throw Error('Invalid original convex contact shape');
 if(originalConvexIsImmutable(shape))validatedShapes.add(shape);
}
interface PairProjection {axis:Vec3;aLo:number;aHi:number;bLo:number;bHi:number}
interface PairPrepared {axes:(PairProjection|null)[];complete:boolean}
const preparedPairs=new WeakMap<OriginalConvexPolytope,Map<OriginalConvexPolytope,PairPrepared>>();
function pairPrepared(a:OriginalConvexPolytope,b:OriginalConvexPolytope):PairPrepared|undefined{
 if(!originalConvexIsImmutable(a)||!originalConvexIsImmutable(b))return;
 let partners=preparedPairs.get(a);if(!partners){partners=new Map();preparedPairs.set(a,partners);}
 let entry=partners.get(b);if(entry){partners.delete(b);partners.set(b,entry);return entry;}
 entry={axes:[],complete:false};if(partners.size>=8)partners.delete(partners.keys().next().value!);partners.set(b,entry);return entry;
}
/** Complete continuous SAT for two fixed-orientation polyhedra. Using the
 * distance to either separating endpoint handles containment, where the
 * intersection interval's length is not the minimum translation distance. */
export function sweepOriginalConvexPair(shapeA:OriginalConvexPolytope,fromA:Vec3,toA:Vec3,shapeB:OriginalConvexPolytope,fromB:Vec3,toB:Vec3):OriginalConvexContact|null {
 validShape(shapeA);validShape(shapeB);if(![fromA,toA,fromB,toB].every(finite))throw Error('Invalid original convex contact path');
 const relative=sub(sub(toA,fromA),sub(toB,fromB));
 let enter=-Infinity,exit=Infinity,entryNormal:Vec3|undefined,overlapNormal:Vec3|undefined,depth=Infinity,overlap=true;
 const prepared=pairPrepared(shapeA,shapeB);let axisIndex=0;
 const axisTest=(raw?:Vec3):boolean=>{
  const index=axisIndex++;let projection=prepared?.axes[index];
  if(projection===undefined){
    const length=size(raw!);if(length<=1e-12){if(prepared)prepared.axes[index]=null;return true;}
    const axis=mul(raw!,1/length);let aLo=Infinity,aHi=-Infinity,bLo=Infinity,bHi=-Infinity;
    for(const v of shapeA.vertices){const p=dot(v,axis);aLo=Math.min(aLo,p);aHi=Math.max(aHi,p);}
    for(const v of shapeB.vertices){const p=dot(v,axis);bLo=Math.min(bLo,p);bHi=Math.max(bHi,p);}
    projection={axis,aLo,aHi,bLo,bHi};if(prepared)prepared.axes[index]=projection;
  }
  if(projection===null)return true;
  const {axis}=projection,originA=dot(fromA,axis),originB=dot(fromB,axis);
  const aLo=projection.aLo+originA,aHi=projection.aHi+originA,bLo=projection.bLo+originB,bHi=projection.bHi+originB;
  const negative=aHi-bLo,positive=bHi-aLo;
  if(negative<0||positive<0)overlap=false;
  else if(Math.min(negative,positive)<depth){depth=Math.min(negative,positive);overlapNormal=mul(axis,negative<=positive?-1:1);}
  const speed=dot(relative,axis);
  if(Math.abs(speed)<=1e-15)return negative>=0&&positive>=0;
  const first=-negative/speed,last=positive/speed,axisEnter=Math.min(first,last),axisExit=Math.max(first,last);
  if(axisEnter>enter){enter=axisEnter;entryNormal=mul(axis,speed>0?-1:1);}
  exit=Math.min(exit,axisExit);return enter<=exit;
 };
 if(prepared?.complete){for(let i=0;i<prepared.axes.length;i++)if(!axisTest())return null;}
 else{
  for(const axis of shapeA.faceNormals)if(!axisTest(axis))return null;
  for(const axis of shapeB.faceNormals)if(!axisTest(axis))return null;
  for(const a of shapeA.edgeDirections)for(const b of shapeB.edgeDirections)if(!axisTest(cross(a,b)))return null;
  if(prepared)prepared.complete=true;
 }
 if(exit<0||enter>1)return null;
 const normal=overlap?overlapNormal:entryNormal;if(!normal)return null;
 if(overlap&&depth<=TOL&&dot(relative,normal)>1e-15)return null;
 return {fraction:overlap?0:Math.max(0,enter),normalBToA:normal,penetrationDepth:overlap?Math.max(0,depth):0,initialOverlap:overlap};
}
function closestTriangle(p:Vec3,a:Vec3,b:Vec3,c:Vec3):Vec3 {
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return add(a,mul(ab,d1/(d1-d3)));
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return add(a,mul(ac,d2/(d2-d6)));
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return add(b,mul(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))));
 const denominator=1/(va+vb+vc);return add(a,add(mul(ab,vb*denominator),mul(ac,vc*denominator)));
}
/** Exact finite-feature distance to the CLOSED hull, followed by conservative
 * advancement along relative motion. Expanding finitely many SAT intervals by
 * radius would invent sharp corners; this uses actual triangle/edge/vertex
 * distances and the signed nearest exit plane when the sphere center is inside. */
export function sweepOriginalConvexSphere(shape:OriginalConvexPolytope,fromConvex:Vec3,toConvex:Vec3,sphereFrom:Vec3,sphereTo:Vec3,radius:number,contactDistance=0):OriginalConvexContact|null {
 validShape(shape);if(![fromConvex,toConvex,sphereFrom,sphereTo].every(finite)||!Number.isFinite(radius)||radius<=0||!Number.isFinite(contactDistance)||contactDistance<0)throw Error('Invalid original convex sphere path');
 const faces=(shape as OriginalConvexPolytope&{faces?:readonly (readonly [number,number,number])[]}).faces;
 if(!faces||faces.length<4)throw Error('Closed convex hull faces are required');
 const triangles=faces.map(face=>{
  if(face.length!==3||face.some(i=>!Number.isSafeInteger(i)||i<0||i>=shape.vertices.length))throw Error('Invalid closed convex hull face');
  const [a,b,c]=face.map(i=>shape.vertices[i]),raw=cross(sub(b,a),sub(c,a)),length=size(raw);
  if(length<=1e-15)throw Error('Degenerate closed convex hull face');return {a,b,c,normal:mul(raw,1/length)};
 });
 const from=sub(sphereFrom,fromConvex),relative=sub(sub(sphereTo,sphereFrom),sub(toConvex,fromConvex));
 const evaluate=(fraction:number):{gap:number;normal:Vec3;convexPoint:Vec3}=>{
  const point=add(from,mul(relative,fraction));let plane=-Infinity,exitNormal=triangles[0].normal;
  for(const t of triangles){const distance=dot(sub(point,t.a),t.normal);if(distance>plane){plane=distance;exitNormal=t.normal;}}
  // For an interior point the nearest normalized exit plane is distance
  // -plane away. Its outward projection remains within every convex
  // halfspace (all other signed distances are <=plane), hence on the hull.
  if(plane<=0)return {gap:plane-radius,normal:mul(exitNormal,-1),convexPoint:sub(point,mul(exitNormal,plane))};
  let distance=Infinity,nearest=triangles[0].a;
  for(const t of triangles){const candidate=closestTriangle(point,t.a,t.b,t.c),d=size(sub(point,candidate));if(d<distance){distance=d;nearest=candidate;}}
  return {gap:distance-radius,normal:distance>1e-15?mul(sub(nearest,point),1/distance):mul(exitNormal,-1),convexPoint:nearest};
 };
 const witnesses=(state:ReturnType<typeof evaluate>,fraction:number)=>({
  witnessA:add(add(fromConvex,mul(sub(toConvex,fromConvex),fraction)),state.convexPoint),
  witnessB:add(add(sphereFrom,mul(sub(sphereTo,sphereFrom),fraction)),mul(state.normal,radius)),
 });
 const initial=evaluate(0);
 if(initial.gap<=contactDistance+TOL){
  if(contactDistance===0&&initial.gap>=-TOL&&dot(relative,initial.normal)<-1e-15)return null;
  return {fraction:0,normalBToA:initial.normal,penetrationDepth:Math.max(0,-initial.gap),initialOverlap:initial.gap<=0,...witnesses(initial,0)};
 }
 let fraction=0;
 for(let iteration=0;iteration<128;iteration++){
  const state=iteration===0?initial:evaluate(fraction);
  if(state.gap<=contactDistance+TOL)return {fraction,normalBToA:state.normal,penetrationDepth:0,initialOverlap:false,...witnesses(state,fraction)};
  // The distance to a convex set is convex along a line. Its current
  // separating derivative bounds safe advancement and proves moving-away misses.
  const closing=dot(relative,state.normal);if(closing<=1e-15)return null;
  const advance=(state.gap-contactDistance)/closing;if(advance<=1e-15)return null;
  fraction+=advance;if(fraction>1+TOL)return null;fraction=Math.min(1,fraction);
 }
 // A numerical graze may converge slowly; locate the minimum of the convex
 // distance and bisect its first contact rather than claiming a swept-plane hit.
 let lo=fraction,hi=1;
 for(let i=0;i<64;i++){const middle=(lo+hi)/2,state=evaluate(middle);if(dot(relative,state.normal)>0)lo=middle;else hi=middle;}
 const minimum=(lo+hi)/2,state=evaluate(minimum);if(state.gap>contactDistance+TOL)return null;
 lo=fraction;hi=minimum;for(let i=0;i<64;i++){const middle=(lo+hi)/2;if(evaluate(middle).gap<=contactDistance+TOL)hi=middle;else lo=middle;}
 const hit=evaluate(hi);
 return {fraction:hi,normalBToA:hit.normal,penetrationDepth:0,initialOverlap:false,...witnesses(hit,hi)};
}
