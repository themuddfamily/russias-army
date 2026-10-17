import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import type {OriginalFloatVectorBox,OriginalFloatTriangleEdges,OriginalFloatSegmentVector} from './originalFiniteFeatureInterval';
import {encloseOriginalClosedFaceGuards,type OriginalClosedFaceIntervalLimits} from './originalClosedFaceInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';

export type OriginalFeatureMembership='always'|'never'|'maybe';
export interface OriginalFeatureBoundsInterval {readonly minX:OriginalFloatBox;readonly maxX:OriginalFloatBox;readonly minY:OriginalFloatBox;readonly maxY:OriginalFloatBox;readonly minZ:OriginalFloatBox;readonly maxZ:OriginalFloatBox}
export const ORIGINAL_FEATURE_PREPARATION_INTERVAL_LIMITS=Object.freeze({vertices:512,faces:1024,mathCalls:128});
type V=OriginalFloatVectorBox;type B=OriginalFloatBox;type Triangle=readonly [V,V,V];type Edge=readonly [V,V];
const xyz=['x','y','z'] as const;
function ordinary(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-feature-preparation-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('feature-preparation-accessors-unsupported');}
}
function dense(list:readonly unknown[],minimum:number,maximum:number):void {
 if(!Array.isArray(list)||Object.getPrototypeOf(list)!==Array.prototype||list.length<minimum||list.length>maximum)throw new UnsupportedFloatInterval('bounded-feature-preparation-array-required');
 for(const key of [Symbol.iterator,'map','filter','every','some','flat'] as const)if(Object.getOwnPropertyDescriptor(list,key))throw new UnsupportedFloatInterval('standard-feature-preparation-array-required');
 for(let i=0;i<list.length;i++){const d=Object.getOwnPropertyDescriptor(list,i);if(!d||!('value' in d))throw new UnsupportedFloatInterval('dense-feature-preparation-array-required');}
}
function vector(c:OriginalFloatIntervalContext,v:V):V {ordinary(v,xyz);return c.vector3(v.x,v.y,v.z);}
const sub=(c:OriginalFloatIntervalContext,a:V,b:V):V=>Object.freeze({x:c.sub(a.x,b.x),y:c.sub(a.y,b.y),z:c.sub(a.z,b.z)});
const dot=(c:OriginalFloatIntervalContext,a:V,b:V)=>c.dot3(a.x,a.y,a.z,b.x,b.y,b.z);
const squared=(c:OriginalFloatIntervalContext,v:V)=>c.squared3(v.x,v.y,v.z);
function bounds(c:OriginalFloatIntervalContext,possible:readonly V[],always:readonly V[]):OriginalFeatureBoundsInterval {
 if(!possible.length||!always.length)throw new UnsupportedFloatInterval('nonempty-guaranteed-feature-set-required');
 const minimum=(list:readonly V[],axis:typeof xyz[number])=>{let value=list[0][axis];for(let i=1;i<list.length;i++)value=c.min(value,list[i][axis]);return value;};
 const maximum=(list:readonly V[],axis:typeof xyz[number])=>{let value=list[0][axis];for(let i=1;i<list.length;i++)value=c.max(value,list[i][axis]);return value;};
 const mins=xyz.map(axis=>c.box(minimum(possible,axis).lo,minimum(always,axis).hi));
 const maxs=xyz.map(axis=>c.box(maximum(always,axis).lo,maximum(possible,axis).hi));
 return Object.freeze({minX:mins[0],maxX:maxs[0],minY:mins[1],maxY:maxs[1],minZ:mins[2],maxZ:maxs[2]});
}
function prepare(c:OriginalFloatIntervalContext,vertices:readonly V[],always:readonly V[],alwaysMask:readonly boolean[],triangles:readonly Triangle[],edges:readonly Edge[],triangleEdges:readonly OriginalFloatTriangleEdges[]) {
 let possibleSquared:B|undefined,alwaysSquared:B|undefined;
 for(let i=0;i<vertices.length;i++){const value=squared(c,vertices[i]);possibleSquared=possibleSquared?c.max(possibleSquared,value):value;if(alwaysMask[i])alwaysSquared=alwaysSquared?c.max(alwaysSquared,value):value;}
 if(!possibleSquared||!alwaysSquared)throw new UnsupportedFloatInterval('nonempty-guaranteed-coordinate-norm-required');
 const segmentVectors:OriginalFloatSegmentVector[]=edges.map(([a,b])=>{const v=sub(c,b,a);return Object.freeze({v,cc:squared(c,v)});});
 return Object.freeze({vertices:Object.freeze([...vertices]),triangles:Object.freeze([...triangles]),edges:Object.freeze([...edges]),
  vertexBounds:bounds(c,vertices,always),triangleBounds:Object.freeze(triangles.map(t=>bounds(c,t,t))),edgeBounds:Object.freeze(edges.map(e=>bounds(c,e,e))),
  coordinateSquared:c.box(alwaysSquared.lo,possibleSquared.hi),triangleEdges:Object.freeze([...triangleEdges]),segmentVectors:Object.freeze(segmentVectors)});
}

/** Source hull features() preparation, including optional unreferenced points.
 * Same-context closed guards precede filtering. No distance or pruning proof. */
export function encloseOriginalFeaturePreparation(ctx:OriginalFloatIntervalContext,input:{readonly vertices:readonly V[];readonly faces:readonly (readonly [number,number,number])[]},
 contract:OriginalAngularMathContract,limits:OriginalClosedFaceIntervalLimits={}) {
 ordinary(input,['vertices','faces']);ordinary(limits,[]);ordinary(contract,['tag','hypot','sin','cos']);
 const maximum:{vertices:number;faces:number;mathCalls:number}={...ORIGINAL_FEATURE_PREPARATION_INTERVAL_LIMITS};
 for(const key of ['vertices','faces','mathCalls'] as const){const d=Object.getOwnPropertyDescriptor(limits,key);if(d){if(!('value' in d))throw new UnsupportedFloatInterval('feature-preparation-limit-accessors-unsupported');maximum[key]=d.value;}
  if(!Number.isSafeInteger(maximum[key])||maximum[key]<1||maximum[key]>ORIGINAL_FEATURE_PREPARATION_INTERVAL_LIMITS[key])throw new UnsupportedFloatInterval('feature-preparation-caps-may-only-be-lowered');}
 dense(input.vertices,4,maximum.vertices);dense(input.faces,4,maximum.faces);
 const vertices:V[]=input.vertices.map(v=>vector(ctx,v)),faces:Array<readonly [number,number,number]>=[];
 for(const face of input.faces){dense(face,3,3);faces.push(Object.freeze([face[0],face[1],face[2]] as const));}
 const retainedContract=Object.freeze({tag:contract.tag,hypot:contract.hypot,sin:contract.sin,cos:contract.cos});
 const captured=Object.freeze({vertices:Object.freeze(vertices),faces:Object.freeze(faces)});
 let guarded:ReturnType<typeof encloseOriginalClosedFaceGuards>;
 try{guarded=encloseOriginalClosedFaceGuards(ctx,captured,retainedContract,maximum);}catch(error){if(error instanceof UnsupportedFloatInterval)throw error;throw new UnsupportedFloatInterval('feature-preparation-closed-guard-failed');}
 const referenced=new Set<number>();for(const face of guarded.faces)for(const index of face)referenced.add(index);
 // Reuse the SAME actual immutable source coordinate differences/normal, not
 // generic accessor evaluations or a recomputed ideal geometric normal.
 const constants:OriginalFloatTriangleEdges[]=[],normals:V[]=[];
 for(let index=0;index<guarded.triangles.length;index++){
  const [,b,c]=guarded.triangles[index],basis=guarded.faceBasis[index];
  constants.push(Object.freeze({ab:basis.ab,ac:basis.ac,bc:sub(ctx,c,b)}));normals.push(basis.normal);
 }
 const membership:OriginalFeatureMembership[]=[],possible:V[]=[],always:V[]=[],sourceIndices:number[]=[],guaranteedIndices:number[]=[],alwaysMask:boolean[]=[];
 const zero=ctx.point(0);
 for(let index=0;index<guarded.vertices.length;index++){
  let include:OriginalFeatureMembership='always';
  if(!referenced.has(index)){
   let uncertain=false,outside=false;
   for(let face=0;face<guarded.triangles.length;face++){
    const predicate=ctx.compare(dot(ctx,sub(ctx,guarded.vertices[index],guarded.triangles[face][0]),normals[face]),zero,'<=');
    if(predicate==='false'){outside=true;break;}if(predicate==='unknown')uncertain=true;
   }
   include=outside?'always':uncertain?'maybe':'never';
  }
  membership.push(include);
  if(include!=='never'){possible.push(guarded.vertices[index]);sourceIndices.push(index);alwaysMask.push(include==='always');}
  if(include==='always'){always.push(guarded.vertices[index]);guaranteedIndices.push(index);}
 }
 const edges:Edge[]=guarded.edgeIndices.map(([a,b])=>Object.freeze([guarded.vertices[a],guarded.vertices[b]] as const));
 const value=prepare(ctx,possible,always,alwaysMask,guarded.triangles,edges,constants);
 return Object.freeze({...value,originalVertices:guarded.vertices,faces:guarded.faces,membership:Object.freeze(membership),vertexSourceIndices:Object.freeze(sourceIndices),guaranteedVertexSourceIndices:Object.freeze(guaranteedIndices),
  edgeIndices:guarded.edgeIndices,faceBasis:guarded.faceBasis,referencedVertexSourceIndices:Object.freeze([...referenced]),mathCalls:guarded.mathCalls,
  sourceFaceGuardsEnclosed:true as const,sourceClosedEdgeCountsEnclosed:true as const,featureSelectionEnclosed:true as const,featureBoundsEnclosed:true as const,
  constantVectorsEnclosed:true as const,conditionalMathContract:true as const,mathContractVerified:false as const,immutableCacheEquivalenceRequired:true as const,
  sourceCacheConsumed:false as const,convexityCertified:false as const,windingCertified:false as const,distanceCertified:false as const,pruningCertified:false as const,defaultIntegration:false as const,nativeEquivalent:false as const});
}

/** Fixed triangle features() analogue from three owned tuples. It has no hull
 * closed-face guard or membership uncertainty and needs no Math callback. */
export function encloseOriginalTriangleFeaturePreparation(ctx:OriginalFloatIntervalContext,input:readonly [V,V,V]) {
 dense(input,3,3);const vertices=Object.freeze(input.map(v=>vector(ctx,v))),triangle=Object.freeze([vertices[0],vertices[1],vertices[2]] as const);
 const edges:Edge[]=[Object.freeze([vertices[0],vertices[1]] as const),Object.freeze([vertices[1],vertices[2]] as const),Object.freeze([vertices[2],vertices[0]] as const)];
 const [a,b,c]=triangle,constants=Object.freeze({ab:sub(ctx,b,a),ac:sub(ctx,c,a),bc:sub(ctx,c,b)});
 return Object.freeze({...prepare(ctx,vertices,vertices,[true,true,true],[triangle],edges,[constants]),vertexSourceIndices:Object.freeze([0,1,2]),
  membership:Object.freeze(['always','always','always'] as const),mathCalls:0 as const,featureBoundsEnclosed:true as const,constantVectorsEnclosed:true as const,
  immutableCacheEquivalenceRequired:true as const,sourceCacheConsumed:false as const,distanceCertified:false as const,pruningCertified:false as const,defaultIntegration:false as const,nativeEquivalent:false as const});
}
