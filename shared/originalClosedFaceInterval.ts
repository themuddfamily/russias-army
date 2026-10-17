import {OriginalFloatIntervalContext,UnsupportedFloatInterval} from './originalFloatInterval';
import type {OriginalFloatVectorBox} from './originalFiniteFeatureInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';

export const ORIGINAL_CLOSED_FACE_INTERVAL_LIMITS=Object.freeze({vertices:512,faces:1024,mathCalls:128});
export interface OriginalClosedFaceIntervalLimits {readonly vertices?:number;readonly faces?:number;readonly mathCalls?:number}
type V=OriginalFloatVectorBox;
const xyz=['x','y','z'] as const;
function ordinary(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-closed-face-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('closed-face-accessors-unsupported');}
}
function dense(list:readonly unknown[],minimum:number,maximum:number):void {
 if(!Array.isArray(list)||Object.getPrototypeOf(list)!==Array.prototype||list.length<minimum||list.length>maximum)throw new UnsupportedFloatInterval('bounded-closed-face-array-required');
 for(const key of [Symbol.iterator,'map','some','every','flat'] as const)if(Object.getOwnPropertyDescriptor(list,key))throw new UnsupportedFloatInterval('standard-closed-face-array-required');
 for(let i=0;i<list.length;i++){const d=Object.getOwnPropertyDescriptor(list,i);if(!d||!('value' in d))throw new UnsupportedFloatInterval('dense-closed-face-array-required');}
}
function sub(c:OriginalFloatIntervalContext,a:V,b:V):V {return Object.freeze({x:c.sub(a.x,b.x),y:c.sub(a.y,b.y),z:c.sub(a.z,b.z)});}
function cross(c:OriginalFloatIntervalContext,a:V,b:V):V {const [x,y,z]=c.cross3(a.x,a.y,a.z,b.x,b.y,b.z);return Object.freeze({x,y,z});}

/** Source features() face/index/edge-count guards only. Interior filtering,
 * coordinate bounds, cached vectors, candidates and convexity are separate. */
export function encloseOriginalClosedFaceGuards(ctx:OriginalFloatIntervalContext,input:{readonly vertices:readonly V[];readonly faces:readonly (readonly [number,number,number])[]},
 contract:Pick<OriginalAngularMathContract,'tag'|'hypot'>,limits:OriginalClosedFaceIntervalLimits={}) {
 ordinary(input,['vertices','faces']);ordinary(contract,['tag','hypot']);ordinary(limits,[]);
 if(typeof contract.tag!=='string'||!contract.tag||contract.tag.length>1024||typeof contract.hypot!=='function')throw new UnsupportedFloatInterval('closed-face-math-contract-required');
 const tag=contract.tag,hypot=contract.hypot,maximum:{vertices:number;faces:number;mathCalls:number}={...ORIGINAL_CLOSED_FACE_INTERVAL_LIMITS};
 for(const key of ['vertices','faces','mathCalls'] as const){
  const d=Object.getOwnPropertyDescriptor(limits,key);if(d){if(!('value' in d))throw new UnsupportedFloatInterval('closed-face-limit-accessors-unsupported');maximum[key]=d.value;}
  if(!Number.isSafeInteger(maximum[key])||maximum[key]<1||maximum[key]>ORIGINAL_CLOSED_FACE_INTERVAL_LIMITS[key])throw new UnsupportedFloatInterval('closed-face-caps-may-only-be-lowered');
 }
 dense(input.vertices,4,maximum.vertices);dense(input.faces,4,maximum.faces);
 const vertices:V[]=[],faces:Array<readonly [number,number,number]>=[];
 // Capture every tuple/topology entry before any caller Math callback.
 for(const v of input.vertices){ordinary(v,xyz);vertices.push(ctx.vector3(v.x,v.y,v.z));}
 for(const face of input.faces){dense(face,3,3);const indices:[number,number,number]=[face[0],face[1],face[2]];
  for(const index of indices)if(!Number.isSafeInteger(index)||index<0||index>=vertices.length)throw new UnsupportedFloatInterval('invalid-closed-face-index');
  faces.push(Object.freeze(indices));
 }
 const triangles:Array<readonly [V,V,V]>=[],faceBasis:Array<Readonly<{ab:V;ac:V;normal:V}>>=[],edges=new Map<string,{indices:readonly [number,number];count:number}>();let mathCalls=0;
 for(const face of faces){
  const triangle=Object.freeze([vertices[face[0]],vertices[face[1]],vertices[face[2]]] as const),ab=sub(ctx,triangle[1],triangle[0]),ac=sub(ctx,triangle[2],triangle[0]),normal=cross(ctx,ab,ac);
  if(mathCalls>=maximum.mathCalls)throw new UnsupportedFloatInterval('closed-face-math-call-cap');mathCalls++;
  const length=hypot(ctx,Object.freeze([normal.x,normal.y,normal.z]));
  if(ctx.compare(length,ctx.point(1e-15),'>')!=='true')throw new UnsupportedFloatInterval('unresolved-or-degenerate-closed-face');
  triangles.push(triangle);faceBasis.push(Object.freeze({ab,ac,normal}));
  for(let i=0;i<3;i++){
   const a=Math.min(face[i],face[(i+1)%3]),b=Math.max(face[i],face[(i+1)%3]),key=`${a}:${b}`,entry=edges.get(key);
   if(entry)entry.count++;else edges.set(key,{indices:Object.freeze([a,b] as const),count:1});
  }
 }
 if([...edges.values()].some(edge=>edge.count!==2))throw new UnsupportedFloatInterval('closed-face-edge-count-required');
 return Object.freeze({vertices:Object.freeze(vertices),faces:Object.freeze(faces),triangles:Object.freeze(triangles),faceBasis:Object.freeze(faceBasis),
  edgeIndices:Object.freeze([...edges.values()].map(edge=>edge.indices)),mathCalls,mathContractTag:tag,
  sourceFaceGuardsEnclosed:true as const,sourceClosedEdgeCountsEnclosed:true as const,conditionalMathContract:true as const,
  mathContractVerified:false as const,immutableCacheEquivalenceRequired:true as const,sourceCacheConsumed:false as const,
  windingCertified:false as const,convexityCertified:false as const,featureSelectionEnclosed:false as const,
  featureBoundsEnclosed:false as const,distanceCertified:false as const,defaultIntegration:false as const,nativeEquivalent:false as const});
}
