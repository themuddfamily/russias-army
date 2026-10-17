import type {Vec3} from './protocol';

/** Vertices are offsets from the physical pivot, already oriented in world
 * axes. Normals and edge directions describe the complete convex hull. */
export interface OriginalConvexPolytope {
  readonly vertices:readonly Vec3[];
  readonly faceNormals:readonly Vec3[];
  readonly edgeDirections:readonly Vec3[];
  /** Outward hull triangles for finite-feature convex/sphere distance queries. */
  readonly faces?:readonly (readonly [number,number,number])[];
}
export interface OriginalConvexSweepHit {
 fraction:number;position:Vec3;normal:Vec3;initialOverlap:boolean;penetrationDepth:number;
 /** Closest surface points when resolved by a distance query, not model pivots. */
 witnessA?:Vec3;witnessB?:Vec3;
 witnessPairs?:Array<{witnessA:Vec3;witnessB:Vec3}>;
 /** Exact selected finite terrain feature, bound to its generating geometry. */
 fixedFeature?:OriginalFixedConvexFeature;
}
export interface OriginalFixedConvexFeature {
 readonly revision:object;
 readonly sourceIndex:number;
 readonly model:string;
 readonly contactDistance:number;
 readonly triangle:readonly [Readonly<Vec3>,Readonly<Vec3>,Readonly<Vec3>];
 /** Current-pose geometry only; no separating-velocity or response filter. */
 readonly refresh:(shape:OriginalConvexPolytope,position:Vec3,contactDistance:number)=>OriginalConvexSweepHit|null;
}
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(a:Vec3,s:number):Vec3=>({x:a.x*s,y:a.y*s,z:a.z*s});
const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const finite=(v:Vec3)=>[v.x,v.y,v.z].every(Number.isFinite);

const immutableShapes=new WeakSet<OriginalConvexPolytope>();
/** Read-only proof query: does not evaluate arbitrary input getters. */
export function originalConvexImmutabilityKnown(shape:OriginalConvexPolytope):boolean {return immutableShapes.has(shape);}
const immutableLists=new WeakSet<readonly Vec3[]>();
const immutableVector=(v:Vec3)=>Object.isFrozen(v)&&(['x','y','z'] as const).every(key=>{
  const descriptor=Object.getOwnPropertyDescriptor(v,key);return !!descriptor&&'value' in descriptor;
});
const immutableVectorList=(list:readonly Vec3[])=>{
 if(immutableLists.has(list))return true;
 const immutable=Object.isFrozen(list)&&list.every((point,index)=>{
  const descriptor=Object.getOwnPropertyDescriptor(list,index);return !!descriptor&&'value' in descriptor&&immutableVector(point);
});
 if(immutable)immutableLists.add(list);return immutable;
};
/** Runtime immutability is the opt-in: mutable generic callers never cache. */
export function originalConvexIsImmutable(shape:OriginalConvexPolytope):boolean {
  if(immutableShapes.has(shape))return true;
  const lists=['vertices','faceNormals','edgeDirections'] as const;
  if(Object.isFrozen(shape)&&lists.every(key=>{
    const descriptor=Object.getOwnPropertyDescriptor(shape,key),list=shape[key];
    return !!descriptor&&'value' in descriptor&&immutableVectorList(list);
  })){immutableShapes.add(shape);return true;}
  return false;
}
const standardArrayIterator=Array.prototype.values;
/** Indexed axis reuse requires the same sequence that spread/for-of consumes.
 * Frozen coordinate arrays may still override their iteration protocol. */
function standardVectorIteration(list:readonly Vec3[]):boolean {
  return Object.getPrototypeOf(list)===Array.prototype&&
    !Object.getOwnPropertyDescriptor(list,Symbol.iterator)&&
    Object.getOwnPropertyDescriptor(Array.prototype,Symbol.iterator)?.value===standardArrayIterator;
}
interface AxisProjection {axis:Vec3;lo:number;hi:number;otherLo:number;otherHi:number}
interface TrianglePrepared {rawAxes:Vec3[];projections:(AxisProjection|null)[];cacheable:boolean;axisCount:number;triangleEdges?:Vec3[]}
interface ShapeProjection {axis:Vec3;lo:number;hi:number}
const faceAxisCache=new WeakMap<OriginalConvexPolytope,(ShapeProjection|null)[]>();
const triangleCache=new WeakMap<OriginalConvexPolytope,Map<readonly [Vec3,Vec3,Vec3],TrianglePrepared|null>>();
const MAX_TRIANGLE_PARTNERS=64;
const validatedShapes=new WeakSet<OriginalConvexPolytope>();
function triangleProjections(shape:OriginalConvexPolytope,triangle:readonly [Vec3,Vec3,Vec3]):TrianglePrepared|null {
  const cacheable=originalConvexIsImmutable(shape)&&immutableVectorList(triangle);
  let cache=cacheable?triangleCache.get(shape):undefined;
  if(cache?.has(triangle)){const entry=cache.get(triangle)!;cache.delete(triangle);cache.set(triangle,entry);return entry;}
  const edges=[sub(triangle[1],triangle[0]),sub(triangle[2],triangle[1]),sub(triangle[0],triangle[2])],normal=cross(edges[0],edges[1]);
  if(dot(normal,normal)===0)return null;
  const shareFaceAxes=cacheable&&[shape.vertices,shape.faceNormals,shape.edgeDirections,triangle].every(standardVectorIteration);
  const axes=[...shape.faceNormals,normal];
  // Generic inputs retain eager coordinate reads. Only proven constant
  // coordinates allow axes after an early rejection to remain unconstructed.
  if(!shareFaceAxes)for(const edge of shape.edgeDirections)for(const other of edges)axes.push(cross(edge,other));
  const result:TrianglePrepared={rawAxes:axes,projections:[],cacheable:shareFaceAxes,
    axisCount:shareFaceAxes?axes.length+shape.edgeDirections.length*edges.length:axes.length,
    triangleEdges:shareFaceAxes?edges:undefined};
  if(cacheable){if(!cache){cache=new Map();triangleCache.set(shape,cache);}if(cache.size>=MAX_TRIANGLE_PARTNERS)cache.delete(cache.keys().next().value!);cache.set(triangle,result);}
  return result;
}

/** Continuous separating-axis intersection under translation. Tests the full
 * hull against the finite triangle, including edges and vertices. Orientation
 * stays fixed during the sweep; rotational CCD/native Havok margins are not
 * represented. No sphere, box or recentered hull replaces the supplied shape. */
export function sweepOriginalConvexTriangle(shape:OriginalConvexPolytope,from:Vec3,to:Vec3,triangle:readonly [Vec3,Vec3,Vec3]):OriginalConvexSweepHit|null {
  if(!validatedShapes.has(shape)){
    if(shape.vertices.length<4||!shape.faceNormals.length||!shape.edgeDirections.length
      ||![...shape.vertices,...shape.faceNormals,...shape.edgeDirections].every(finite))throw Error('Invalid original convex sweep');
    if(originalConvexIsImmutable(shape))validatedShapes.add(shape);
  }
  if(![from,to,...triangle].every(finite))throw Error('Invalid original convex sweep');
  const projections=triangleProjections(shape,triangle);if(!projections)return null;
  const delta=sub(to,from);
  let enter=-Infinity,exit=Infinity,entryNormal:Vec3|undefined,overlapNormal:Vec3|undefined,depth=Infinity,initialOverlap=true;
  for(let index=0;index<projections.axisCount;index++){
    let projection=projections.projections[index];
    if(projection===undefined){
      let common:ShapeProjection|null|undefined;
      let faceAxes:(ShapeProjection|null)[]|undefined;
      if(projections.cacheable&&index<shape.faceNormals.length){
        faceAxes=faceAxisCache.get(shape);
        if(!faceAxes){faceAxes=[];faceAxisCache.set(shape,faceAxes);}
        common=faceAxes[index];
      }
      if(common===null){projections.projections[index]=null;continue;}
      if(common===undefined){
        let raw=projections.rawAxes[index];
        if(raw===undefined&&projections.triangleEdges){
          const offset=index-shape.faceNormals.length-1,edges=projections.triangleEdges!;
          raw=cross(shape.edgeDirections[Math.floor(offset/edges.length)],edges[offset%edges.length]);
          projections.rawAxes[index]=raw;
        }
        const length=Math.hypot(raw.x,raw.y,raw.z);
        if(length<=1e-12){if(faceAxes)faceAxes[index]=null;projections.projections[index]=null;continue;}
        const axis=mul(raw,1/length);let lo=Infinity,hi=-Infinity;
        for(const vertex of shape.vertices){const p=dot(vertex,axis);lo=Math.min(lo,p);hi=Math.max(hi,p);}
        common={axis,lo,hi};if(faceAxes)faceAxes[index]=common;
      }
      const {axis,lo,hi}=common;let otherLo=Infinity,otherHi=-Infinity;
      for(const vertex of triangle){const p=dot(vertex,axis);otherLo=Math.min(otherLo,p);otherHi=Math.max(otherHi,p);}
      projection={axis,lo,hi,otherLo,otherHi};projections.projections[index]=projection;
    }
    if(projection===null)continue;
    const {axis,otherLo,otherHi}=projection,origin=dot(from,axis),speed=dot(delta,axis);
    const lo=projection.lo+origin,hi=projection.hi+origin;
    if(hi<otherLo||lo>otherHi)initialOverlap=false;
    const negative=hi-otherLo,positive=otherHi-lo;
    if(negative>=0&&positive>=0){
      const distance=Math.min(negative,positive);
      if(distance<depth){depth=distance;overlapNormal=mul(axis,negative<=positive?-1:1);}
    }
    if(Math.abs(speed)<=1e-15){if(hi<otherLo||lo>otherHi)return null;continue;}
    const first=(otherLo-hi)/speed,last=(otherHi-lo)/speed;
    const axisEnter=Math.min(first,last),axisExit=Math.max(first,last);
    // This axis alone excludes the entire queried time interval. Later axes
    // can only raise entry or lower exit, so the final rejection is proved.
    if(axisEnter>1||axisExit<0)return null;
    if(axisEnter>enter){enter=axisEnter;entryNormal=mul(axis,speed>0?-1:1);}
    exit=Math.min(exit,axisExit);
    if(enter>exit)return null;
  }
  if(exit<0||enter>1)return null;
  // A touching body moving away has no intersection at positive time.
  if(initialOverlap&&depth<=1e-12&&overlapNormal&&dot(delta,overlapNormal)>0)return null;
  const fraction=initialOverlap?0:Math.max(0,enter),normal=initialOverlap?overlapNormal:entryNormal;
  if(!normal)return null;
  return {fraction,position:{x:from.x+delta.x*fraction,y:from.y+delta.y*fraction,z:from.z+delta.z*fraction},normal,initialOverlap,penetrationDepth:initialOverlap?Math.max(0,depth):0};
}
