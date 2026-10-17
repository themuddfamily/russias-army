import type {Vec3} from './protocol';
import {sweepOriginalConvexPair,type OriginalConvexContact} from './originalConvexContact';
import {originalConvexIsImmutable,originalConvexImmutabilityKnown,sweepOriginalConvexTriangle,type OriginalConvexPolytope,type OriginalConvexSweepHit} from './originalConvexSweep';

const add=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(a:Vec3,s:number):Vec3=>({x:a.x*s,y:a.y*s,z:a.z*s});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const length=(a:Vec3)=>Math.hypot(a.x,a.y,a.z);
const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const finite=(v:Vec3)=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const EPS=1e-12;
type Triangle=readonly [Vec3,Vec3,Vec3];
interface Bounds {minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number}
interface TriangleEdges {ab:Vec3;ac:Vec3;bc:Vec3}
interface SegmentVector {v:Vec3;cc:number}
interface Features {vertexBounds:Bounds;triangleEdges?:TriangleEdges[];segmentVectors?:SegmentVector[];vertices:readonly Vec3[];triangles:Triangle[];edges:(readonly [Vec3,Vec3])[];triangleBounds:Bounds[];edgeBounds:Bounds[];coordinateSquared:number}
function bounds(points:readonly Vec3[]):Bounds {
 // Preserve the six coordinate-read passes (including sparse-array NaN and
 // signed zero) without allocating six temporary coordinate arrays per feature.
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(let i=0,count=points.length;i<count;i++)minX=Math.min(minX,i in points?points[i].x:NaN);
 for(let i=0,count=points.length;i<count;i++)maxX=Math.max(maxX,i in points?points[i].x:NaN);
 for(let i=0,count=points.length;i<count;i++)minY=Math.min(minY,i in points?points[i].y:NaN);
 for(let i=0,count=points.length;i<count;i++)maxY=Math.max(maxY,i in points?points[i].y:NaN);
 for(let i=0,count=points.length;i<count;i++)minZ=Math.min(minZ,i in points?points[i].z:NaN);
 for(let i=0,count=points.length;i<count;i++)maxZ=Math.max(maxZ,i in points?points[i].z:NaN);
 return {minX,maxX,minY,maxY,minZ,maxZ};
}
function immutableBounds(points:readonly Vec3[]):Bounds {
 const result:Bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};
 for(const point of points){
  result.minX=Math.min(result.minX,point.x);result.maxX=Math.max(result.maxX,point.x);
  result.minY=Math.min(result.minY,point.y);result.maxY=Math.max(result.maxY,point.y);
  result.minZ=Math.min(result.minZ,point.z);result.maxZ=Math.max(result.maxZ,point.z);
 }
 return result;
}
function prepareFeatures(vertices:readonly Vec3[],triangles:Triangle[],edges:(readonly [Vec3,Vec3])[],knownImmutable=false):Features {
 // Only previously proven ordinary frozen coordinates permit interleaving
 // reads. Generic/accessor inputs retain their original six ordered passes.
 const measure=knownImmutable?immutableBounds:bounds;
 return {vertexBounds:measure(vertices),vertices,triangles,edges,triangleBounds:triangles.map(measure),edgeBounds:edges.map(measure),coordinateSquared:Math.max(...vertices.map(v=>dot(v,v)))};
}
/** Reuse only constant-coordinate arithmetic, without translating/reordering
 * any candidates. Mutable/accessor inputs retain the original evaluation. */
function prepareConstantVectors(value:Features):void {
 value.triangleEdges=value.triangles.map(([a,b,c])=>({ab:sub(b,a),ac:sub(c,a),bc:sub(c,b)}));
 value.segmentVectors=value.edges.map(([c,d])=>{const v=sub(d,c);return {v,cc:dot(v,v)};});
}
const prepared=new WeakMap<OriginalConvexPolytope,Features>();
const preparedTriangles=new WeakMap<Triangle,Features>();
interface ClosedTopology {maximumIndices:readonly number[];referenced:Set<number>;edges:readonly (readonly [number,number])[]}
const closedTopologies=new WeakMap<NonNullable<OriginalConvexPolytope['faces']>,ClosedTopology>();
/** Fixed scene triangles can reuse finite-feature bounds. Frozen accessors
 * still represent mutable data; only deeply frozen ordinary values qualify. */
function triangleFeatures(triangle:Triangle):Features {
 const cached=preparedTriangles.get(triangle);if(cached)return cached;
 const result=prepareFeatures(triangle,[triangle],[[triangle[0],triangle[1]],[triangle[1],triangle[2]],[triangle[2],triangle[0]]]);
 const immutable=Object.isFrozen(triangle)&&triangle.every((point,index)=>{
  const entry=Object.getOwnPropertyDescriptor(triangle,index);
  return !!entry&&'value' in entry&&Object.isFrozen(point)&&(['x','y','z'] as const).every(axis=>{
   const coordinate=Object.getOwnPropertyDescriptor(point,axis);return !!coordinate&&'value' in coordinate;
  });
 });
 if(immutable){prepareConstantVectors(result);preparedTriangles.set(triangle,result);}
 return result;
}
function features(shape:OriginalConvexPolytope):Features {
 const cached=prepared.get(shape);if(cached)return cached;
 const faces=shape.faces;
 if(!faces||faces.length<4)throw Error('Closed convex hull faces are required for contact distance');
 if(shape.vertices.length<4||!shape.vertices.every(finite))throw Error('Invalid contact distance hull');
 const topology=closedTopologies.get(faces);
 const edges=topology?undefined:new Map<string,{indices:readonly [number,number];count:number}>(),triangles:Triangle[]=[];
 let faceIndex=0;
 for(const face of faces){
  if(topology&&topology.maximumIndices[faceIndex]>=shape.vertices.length)throw Error('Invalid contact distance hull face');
  faceIndex++;
  if(!topology&&(face.length!==3||face.some(i=>!Number.isSafeInteger(i)||i<0||i>=shape.vertices.length)))throw Error('Invalid contact distance hull face');
  const triangle=face.map(i=>shape.vertices[i]) as unknown as Triangle;
  if(length(cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0])))<=1e-15)throw Error('Degenerate contact distance hull face');
  triangles.push(triangle);
  if(edges)for(let i=0;i<3;i++){
   const a=Math.min(face[i],face[(i+1)%3]),b=Math.max(face[i],face[(i+1)%3]),key=`${a}:${b}`,edge=edges.get(key);
   if(edge)edge.count++;else edges.set(key,{indices:[a,b],count:1});
  }
 }
 if(edges&&[...edges.values()].some(edge=>edge.count!==2))throw Error('Closed convex hull faces are required for contact distance');
 // The closed surface's vertices are sufficient for nearest surface features.
 // Keep source order for deterministic ties; unreferenced resource points do
 // not change the solid, physical pivot, renderer, or SAT vertex collection.
 const referenced=topology?.referenced??new Set(faces.flat());
 const edgeIndices=topology?.edges??[...edges!.values()].map(edge=>edge.indices);
 const interior=(point:Vec3)=>triangles.every(([a,b,c])=>{
  // Preserve sub(b,a), sub(c,a), cross, sub(point,a), dot read/arithmetic
  // order, including repeated accessor reads, without four temporary Vec3s.
  const abx=b.x-a.x,aby=b.y-a.y,abz=b.z-a.z;
  const acx=c.x-a.x,acy=c.y-a.y,acz=c.z-a.z;
  const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
  const px=point.x-a.x,py=point.y-a.y,pz=point.z-a.z;
  return px*nx+py*ny+pz*nz<=0;
 });
 // Generic callers can supply extra exterior vertices inconsistent with faces.
 // Preserve those candidates instead of silently repairing their input. Only
 // points proven inside every outward surface plane are redundant here.
 const result=prepareFeatures(shape.vertices.filter((point,index)=>referenced.has(index)||!interior(point)),triangles,edgeIndices.map(([a,b])=>[shape.vertices[a],shape.vertices[b]]),originalConvexImmutabilityKnown(shape));
 const facesDescriptor=Object.getOwnPropertyDescriptor(shape,'faces');
 const immutableFaces=!!facesDescriptor&&'value' in facesDescriptor&&(!!topology||Object.isFrozen(faces)&&faces.every((face,index)=>{
  const descriptor=Object.getOwnPropertyDescriptor(faces,index);
  return !!descriptor&&'value' in descriptor&&Object.isFrozen(face)&&face.every((_,corner)=>{
   const entry=Object.getOwnPropertyDescriptor(face,corner);return !!entry&&'value' in entry;
  });
 }));
 // Rotations share this frozen topology, but every new hull still validates
 // its actual coordinates, face degeneracy and interior-feature selection.
 if(immutableFaces&&!topology)closedTopologies.set(faces,{maximumIndices:faces.map(face=>Math.max(...face)),referenced,edges:edgeIndices});
 if(originalConvexIsImmutable(shape)&&immutableFaces){prepareConstantVectors(result);prepared.set(shape,result);}
 return result;
}
function closestTriangle(p:Vec3,[a,b,c]:Triangle,constant?:TriangleEdges):Vec3 {
 const ab=constant?.ab??sub(b,a),ac=constant?.ac??sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return add(a,mul(ab,d1/(d1-d3)));
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return add(a,mul(ac,d2/(d2-d6)));
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return add(b,mul(constant?.bc??sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))));
 const denominator=1/(va+vb+vc);return add(a,add(mul(ab,vb*denominator),mul(ac,vc*denominator)));
}
function closestSegments(a:Vec3,b:Vec3,c:Vec3,d:Vec3,constant?:SegmentVector):readonly [Vec3,Vec3] {
 const u=sub(b,a),v=constant?.v??sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=constant?.cc??dot(v,v),dd=dot(u,w),ee=dot(v,w);
 let s=0,t=0;
 if(aa===0&&cc===0)return [a,c];
 if(aa===0)t=Math.max(0,Math.min(1,ee/cc));
 else if(cc===0)s=Math.max(0,Math.min(1,-dd/aa));
 else {
  const denominator=aa*cc-bb*bb;
  s=denominator>Number.EPSILON*aa*cc?Math.max(0,Math.min(1,(bb*ee-cc*dd)/denominator)):0;
  t=(bb*s+ee)/cc;
  if(t<0){t=0;s=Math.max(0,Math.min(1,-dd/aa));}
  else if(t>1){t=1;s=Math.max(0,Math.min(1,(bb-dd)/aa));}
 }
 return [add(a,mul(u,s)),add(c,mul(v,t))];
}
interface Distance {distance:number;normal:Vec3;witnessA?:Vec3;witnessB?:Vec3}
/** For disjoint convex polyhedra a nearest pair occurs at vertex/face or
 * edge/edge features. Triangle diagonals lie on the surface and are harmless.
 * B remains local; offsets preserve the physical pivots without recentering. */
function separatedDistance(a:Features,b:Features,offset:Vec3):Distance {
 let best=Infinity,difference:Vec3={x:0,y:0,z:0},witnessA:Vec3|undefined,witnessB:Vec3|undefined;
 const padding=64*Number.EPSILON*Math.max(1,a.coordinateSquared,b.coordinateSquared,dot(offset,offset));
 const pointBound=(p:Vec3,box:Bounds)=>{
  const x=Math.max(0,box.minX-p.x,p.x-box.maxX),y=Math.max(0,box.minY-p.y,p.y-box.maxY),z=Math.max(0,box.minZ-p.z,p.z-box.maxZ);
  return x*x+y*y+z*z;
 };
 const edgeBound=(first:Bounds,last:Bounds)=>{
  const x=Math.max(0,first.minX+offset.x-last.maxX,last.minX-first.maxX-offset.x),y=Math.max(0,first.minY+offset.y-last.maxY,last.minY-first.maxY-offset.y),z=Math.max(0,first.minZ+offset.z-last.maxZ,last.minZ-first.maxZ-offset.z);
  return x*x+y*y+z*z;
 };
 const candidate=(first:Vec3,second:Vec3)=>{
  // Read coordinates in sub()'s existing order, once each. Witness copies must
  // not add accessor evaluations or change deterministic nearest-feature ties.
  const ax=first.x,bx=second.x,ay=first.y,by=second.y,az=first.z,bz=second.z;
  const delta={x:ax-bx,y:ay-by,z:az-bz},squared=dot(delta,delta);
  if(squared<best){best=squared;difference=delta;witnessA={x:ax,y:ay,z:az};witnessB={x:bx,y:by,z:bz};}
 };
 // Bounds only exclude features that cannot improve the current exact answer.
 // Keep equality and a roundoff allowance: neither pruning nor a bound supplies
 // a collision distance or normal, including at rounded edges and grazes.
 for(const vertex of a.vertices){const point=add(vertex,offset);for(let i=0;i<b.triangles.length;i++)if(pointBound(point,b.triangleBounds[i])<=best+padding)candidate(point,closestTriangle(point,b.triangles[i],b.triangleEdges?.[i]));}
 for(const vertex of b.vertices){const point=sub(vertex,offset);if(pointBound(point,a.vertexBounds)>best+padding)continue;for(let i=0;i<a.triangles.length;i++)if(pointBound(point,a.triangleBounds[i])<=best+padding)candidate(add(closestTriangle(point,a.triangles[i],a.triangleEdges?.[i]),offset),vertex);}
 for(let i=0;i<a.edges.length;i++){const edgeA=a.edges[i],first=add(edgeA[0],offset),last=add(edgeA[1],offset);for(let j=0;j<b.edges.length;j++)if(edgeBound(a.edgeBounds[i],b.edgeBounds[j])<=best+padding){const edgeB=b.edges[j],[x,y]=closestSegments(first,last,edgeB[0],edgeB[1],b.segmentVectors?.[j]);candidate(x,y);}}
 const distance=Math.sqrt(best);return {distance,normal:distance>0?mul(difference,1/distance):{x:0,y:0,z:0},
  ...(distance>0&&witnessA&&witnessB?{witnessA,witnessB}:{})};
}
function validate(distance:number,points:readonly Vec3[]):void {
 if(!Number.isFinite(distance)||distance<0||!points.every(finite))throw Error('Invalid contact distance sweep');
}
/** Distance to a convex Minkowski difference is convex along translation.
 * Conservative advancement uses its separating derivative. A slow graze is
 * resolved by locating the convex minimum and bisecting the first threshold
 * crossing; iteration exhaustion never substitutes a swept-plane collision. */
function advance(evaluate:(fraction:number)=>Distance,relative:Vec3,tolerance:number,endFraction=1):(Distance&{fraction:number})|null {
 let fraction=0,state=evaluate(0);
 if(state.distance<=tolerance+EPS)return {fraction:0,...state};
 for(let iteration=0;iteration<96;iteration++){
  const gap=state.distance-tolerance;
  if(gap<=EPS)return {fraction,...state};
  const closing=-dot(relative,state.normal);if(closing<=0)return null;
  const next=fraction+gap/closing;
  if(next>endFraction+EPS)return null;
  if(next<=fraction+Number.EPSILON)break;
  fraction=Math.min(endFraction,next);state=evaluate(fraction);
 }
 let lo=fraction,hi=endFraction;
 for(let iteration=0;iteration<64;iteration++){
  const middle=(lo+hi)/2,value=evaluate(middle);
  if(dot(relative,value.normal)<0)lo=middle;else hi=middle;
 }
 const minimum=(lo+hi)/2,value=evaluate(minimum);
 if(value.distance>tolerance+EPS)return null;
 lo=fraction;hi=minimum;
 for(let iteration=0;iteration<64;iteration++){const middle=(lo+hi)/2;if(evaluate(middle).distance<=tolerance+EPS)hi=middle;else lo=middle;}
 return {fraction:hi,...evaluate(hi)};
}

/** One TOTAL surface-separation threshold; neither hull is inflated. Skin
 * contacts have zero actual penetration and initialOverlap=false. Actual
 * initial intersections retain the existing SAT depth and normal. */
export function sweepOriginalConvexPairDistance(shapeA:OriginalConvexPolytope,fromA:Vec3,toA:Vec3,shapeB:OriginalConvexPolytope,fromB:Vec3,toB:Vec3,contactDistance:number):OriginalConvexContact|null {
 validate(contactDistance,[fromA,toA,fromB,toB]);
 if(contactDistance===0)return sweepOriginalConvexPair(shapeA,fromA,toA,shapeB,fromB,toB);
 const a=features(shapeA),b=features(shapeB),initial=sweepOriginalConvexPair(shapeA,fromA,fromA,shapeB,fromB,fromB);
 if(initial)return initial;
 const offset=sub(fromA,fromB),relative=sub(sub(toA,fromA),sub(toB,fromB));
 const actual=sweepOriginalConvexPair(shapeA,fromA,toA,shapeB,fromB,toB);
 const hit=advance(fraction=>separatedDistance(a,b,add(offset,mul(relative,fraction))),relative,contactDistance,actual?.fraction??1);
 if(!hit)return null;
 const pivotB=add(fromB,mul(sub(toB,fromB),hit.fraction));
 return {fraction:hit.fraction,normalBToA:hit.normal,penetrationDepth:0,initialOverlap:false,
  ...(hit.witnessA&&hit.witnessB?{witnessA:add(hit.witnessA,pivotB),witnessB:add(hit.witnessB,pivotB)}:{})};
}
export function sweepOriginalConvexTriangleDistance(shape:OriginalConvexPolytope,from:Vec3,to:Vec3,triangle:Triangle,contactDistance:number):OriginalConvexSweepHit|null {
 validate(contactDistance,[from,to,...triangle]);
 if(contactDistance===0)return sweepOriginalConvexTriangle(shape,from,to,triangle);
 if(length(cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0])))===0)return null;
 const a=features(shape),initial=sweepOriginalConvexTriangle(shape,from,from,triangle);
 if(initial)return initial;
 const b=triangleFeatures(triangle),relative=sub(to,from);
 const actual=sweepOriginalConvexTriangle(shape,from,to,triangle);
 const hit=advance(fraction=>separatedDistance(a,b,add(from,mul(relative,fraction))),relative,contactDistance,actual?.fraction??1);
 return hit?{fraction:hit.fraction,position:add(from,mul(relative,hit.fraction)),normal:hit.normal,penetrationDepth:0,initialOverlap:false,
  ...(hit.witnessA&&hit.witnessB?{witnessA:{...hit.witnessA},witnessB:{...hit.witnessB}}:{})}:null;
}
