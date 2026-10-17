import {OriginalFloatIntervalContext,UnsupportedFloatInterval} from './originalFloatInterval';
import {originalFloatVectorPoint,type OriginalFloatVectorBox} from './originalFiniteFeatureInterval';
import {encloseOriginalRotateVector,type OriginalAngularMathContract,type OriginalQuaternionInterval} from './originalAngularPoseInterval';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';

export const ORIGINAL_ANGULAR_GEOMETRY_INTERVAL_LIMITS=Object.freeze({vertices:512,faces:1024,faceNormals:1024,edgeDirections:1024});
export interface OriginalAngularGeometryIntervalLimits {readonly vertices?:number;readonly faces?:number;readonly faceNormals?:number;readonly edgeDirections?:number}
const axes=['x','y','z'] as const,lists=['vertices','faceNormals','edgeDirections'] as const;
function ordinary(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-geometry-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('geometry-accessors-unsupported');}
}
function denseArray(value:readonly unknown[],maximum:number,minimum:number):void {
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||Object.getOwnPropertyDescriptor(value,Symbol.iterator)||Object.getOwnPropertyDescriptor(value,'map')||!Number.isSafeInteger(value.length)||value.length<minimum||value.length>maximum)throw new UnsupportedFloatInterval('bounded-standard-geometry-array-required');
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,i);if(!d||!('value' in d))throw new UnsupportedFloatInterval('dense-geometry-data-array-required');}
}
function captureVectors(ctx:OriginalFloatIntervalContext,list:readonly Vec3[],maximum:number,minimum:number):readonly OriginalFloatVectorBox[] {
 denseArray(list,maximum,minimum);const result:OriginalFloatVectorBox[]=[];
 for(let i=0;i<list.length;i++){
  const v=list[i];ordinary(v,axes);
  // Copy only bounded required coordinates, never spread unrelated metadata.
  result.push(originalFloatVectorPoint(ctx,{x:v.x,y:v.y,z:v.z}));
 }
 return Object.freeze(result);
}
function groupedRotate(ctx:OriginalFloatIntervalContext,q:OriginalQuaternionInterval,v:OriginalFloatVectorBox):OriginalFloatVectorBox {
 const [x,y,z]=ctx.groupedQuaternionRotate(q.x,q.y,q.z,q.w,v.x,v.y,v.z);
 return Object.freeze({x,y,z});
}

/** Actual LOCAL originalAngularConvex coordinate graph conditional on an
 * explicit Math contract and equivalent immutable source-cache inputs.
 * Faces are preserved topology, not a certified closed convex manifold. */
export function encloseOriginalAngularGeometry(ctx:OriginalFloatIntervalContext,reference:OriginalConvexPolytope,qInput:OriginalQuaternionInterval,
 contract:OriginalAngularMathContract,limits:OriginalAngularGeometryIntervalLimits={}) {
 ordinary(reference,['vertices','faceNormals','edgeDirections','faces']);ordinary(qInput,['x','y','z','w']);ordinary(limits,[]);
 const maximum:{vertices:number;faces:number;faceNormals:number;edgeDirections:number}={...ORIGINAL_ANGULAR_GEOMETRY_INTERVAL_LIMITS};
 for(const key of ['vertices','faces','faceNormals','edgeDirections'] as const){
  const descriptor=Object.getOwnPropertyDescriptor(limits,key);
  if(descriptor){if(!('value' in descriptor))throw new UnsupportedFloatInterval('geometry-limit-accessors-unsupported');maximum[key]=descriptor.value;}
  if(!Number.isSafeInteger(maximum[key])||maximum[key]<1||maximum[key]>ORIGINAL_ANGULAR_GEOMETRY_INTERVAL_LIMITS[key])throw new UnsupportedFloatInterval('geometry-caps-may-only-be-lowered');
 }
 // Snapshot all source tuples and topology before the public guard callback.
 const captured={vertices:captureVectors(ctx,reference.vertices,maximum.vertices,4),faceNormals:captureVectors(ctx,reference.faceNormals,maximum.faceNormals,0),edgeDirections:captureVectors(ctx,reference.edgeDirections,maximum.edgeDirections,0)};
 const faces=reference.faces;if(!faces)throw new UnsupportedFloatInterval('geometry-face-topology-required');denseArray(faces,maximum.faces,4);
 const topology:Array<readonly [number,number,number]>=[];
 for(let i=0;i<faces.length;i++){
  const face=faces[i];denseArray(face,3,3);const indices:[number,number,number]=[face[0],face[1],face[2]];
  for(const index of indices)if(!Number.isSafeInteger(index)||index<0||index>=captured.vertices.length)throw new UnsupportedFloatInterval('invalid-geometry-face-index');
  topology.push(Object.freeze(indices));
 }
 const q:OriginalQuaternionInterval=Object.freeze({x:ctx.hull(qInput.x,qInput.x),y:ctx.hull(qInput.y,qInput.y),z:ctx.hull(qInput.z,qInput.z),w:ctx.hull(qInput.w,qInput.w)});
 const zero=originalFloatVectorPoint(ctx,{x:0,y:0,z:0});
 // Exactly one public runtime hypot guard. The zero rotation result is unused;
 // no general per-vector Math call, normalization or ideal unit assumption.
 encloseOriginalRotateVector(ctx,q,zero,contract,{mathCalls:1});
 const identity=q.x.lo===0&&q.x.hi===0&&q.y.lo===0&&q.y.hi===0&&q.z.lo===0&&q.z.hi===0&&q.w.lo===q.w.hi&&(q.w.lo===1||q.w.lo===-1);
 const result:{vertices:readonly OriginalFloatVectorBox[];faceNormals:readonly OriginalFloatVectorBox[];edgeDirections:readonly OriginalFloatVectorBox[]}={...captured};
 if(!identity)for(const key of lists){const rotated:OriginalFloatVectorBox[]=[];for(const v of captured[key])rotated.push(groupedRotate(ctx,q,v));result[key]=Object.freeze(rotated);}
 // For an uncertain identity branch, the general graph contains the identity
 // values: q.xyz=0 makes tx/ty/tz and every correction numerically zero. This
 // statement concerns finite numeric values, not object or signed-zero identity.
 return Object.freeze({...result,faces:Object.freeze(topology),orientation:q,identityShortcut:identity,
  mathCalls:1 as const,conditionalMathContract:true as const,mathContractVerified:false as const,localGeometryEnclosed:true as const,
  sourceCacheConsumed:false as const,immutableCacheEquivalenceRequired:true as const,closedManifoldCertified:false as const,
  featureRegularityCertified:false as const,SATCertified:false as const,wrapperExclusionCertified:false as const,defaultIntegration:false as const,nativeEquivalent:false as const});
}
