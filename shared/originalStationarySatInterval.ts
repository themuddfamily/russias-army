import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox,type OriginalFloatTruth} from './originalFloatInterval';
import {originalFloatVectorPoint,type OriginalFloatVectorBox} from './originalFiniteFeatureInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {Vec3} from './protocol';

export interface OriginalStationarySatLocalIntervals {readonly vertices:readonly OriginalFloatVectorBox[];readonly faceNormals:readonly OriginalFloatVectorBox[];readonly edgeDirections:readonly OriginalFloatVectorBox[]}
export interface OriginalStationarySatIntervalLimits {readonly vertices?:number;readonly faceNormals?:number;readonly edgeDirections?:number;readonly axes?:number;readonly mathCalls?:number}
export const ORIGINAL_STATIONARY_SAT_INTERVAL_LIMITS=Object.freeze({vertices:512,faceNormals:1024,edgeDirections:1024,axes:4097,mathCalls:128});
type V=OriginalFloatVectorBox;type B=OriginalFloatBox;
function ordinary(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-stationary-SAT-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('stationary-SAT-accessors-unsupported');}
}
function dense(value:readonly unknown[],minimum:number,maximum:number):void {
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||Object.getOwnPropertyDescriptor(value,Symbol.iterator)||Object.getOwnPropertyDescriptor(value,'map')||value.length<minimum||value.length>maximum)throw new UnsupportedFloatInterval('bounded-standard-SAT-array-required');
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,i);if(!d||!('value' in d))throw new UnsupportedFloatInterval('dense-SAT-array-required');}
}
function vector(c:OriginalFloatIntervalContext,v:V):V {ordinary(v,['x','y','z']);return c.vector3(v.x,v.y,v.z);}
const sub=(c:OriginalFloatIntervalContext,a:V,b:V):V=>Object.freeze({x:c.sub(a.x,b.x),y:c.sub(a.y,b.y),z:c.sub(a.z,b.z)});
const mul=(c:OriginalFloatIntervalContext,v:V,s:B):V=>Object.freeze({x:c.mul(v.x,s),y:c.mul(v.y,s),z:c.mul(v.z,s)});
const dot=(c:OriginalFloatIntervalContext,a:V,b:V)=>c.dot3(a.x,a.y,a.z,b.x,b.y,b.z);
const cross=(c:OriginalFloatIntervalContext,a:V,b:V):V=>{const [x,y,z]=c.cross3(a.x,a.y,a.z,b.x,b.y,b.z);return Object.freeze({x,y,z});};
const squared=(c:OriginalFloatIntervalContext,v:V)=>c.squared3(v.x,v.y,v.z);
function projection(c:OriginalFloatIntervalContext,points:readonly V[],axis:V):{lo:B;hi:B} {
 let lo=dot(c,points[0],axis),hi=lo;
 for(let i=1;i<points.length;i++){const value=dot(c,points[i],axis);lo=c.min(lo,value);hi=c.max(hi,value);}
 return {lo,hi};
}

/** SAME-context immutable stationary SAT workspace. Caller-certified input
 * boxes enclose the SAME actual shape/pivot across every triangle. Reuse assumes
 * a truthful pure Math contract and immutable source/cache equivalence; neither
 * is attested here. Pivot is the SAME actual from/to tuple. No moving path. */
export function createOriginalStationarySatWorkspace(ctx:OriginalFloatIntervalContext,shape:OriginalStationarySatLocalIntervals,pivotInput:V,
 contract:OriginalAngularMathContract,limits:OriginalStationarySatIntervalLimits={}) {
 ordinary(shape,['vertices','faceNormals','edgeDirections']);ordinary(limits,[]);
 const maximum:{vertices:number;faceNormals:number;edgeDirections:number;axes:number;mathCalls:number}={...ORIGINAL_STATIONARY_SAT_INTERVAL_LIMITS};
 for(const key of ['vertices','faceNormals','edgeDirections','axes','mathCalls'] as const){
  const d=Object.getOwnPropertyDescriptor(limits,key);if(d){if(!('value' in d))throw new UnsupportedFloatInterval('SAT-limit-accessors-unsupported');maximum[key]=d.value;}
  if(!Number.isSafeInteger(maximum[key])||maximum[key]<1||maximum[key]>ORIGINAL_STATIONARY_SAT_INTERVAL_LIMITS[key])throw new UnsupportedFloatInterval('SAT-caps-may-only-be-lowered');
 }
 const capture=(values:readonly V[],minimum:number,cap:number)=>{dense(values,minimum,cap);const result:V[]=[];for(const value of values)result.push(vector(ctx,value));return Object.freeze(result);};
 const vertices=capture(shape.vertices,4,maximum.vertices),normals=capture(shape.faceNormals,1,maximum.faceNormals),edges=capture(shape.edgeDirections,1,maximum.edgeDirections),pivot=vector(ctx,pivotInput);
 ordinary(contract,['tag','hypot','sin','cos']);
 if(!Object.isFrozen(contract)||typeof contract.tag!=='string'||contract.tag.length===0||contract.tag.length>1024||![contract.hypot,contract.sin,contract.cos].every(v=>typeof v==='function'))throw new UnsupportedFloatInterval('frozen-stationary-SAT-math-contract-required');
 const hypotCallback=contract.hypot,tag=contract.tag;
 // Each entry encloses the SAME immutable actual hull axis, local population
 // and pivot. Commit only a complete theorem; no caller-supplied cached data.
 type HullAxis={readonly skipped:OriginalFloatTruth;readonly axis?:V;readonly local?:{lo:B;hi:B};readonly origin?:B};
 const hullAxes:Array<HullAxis|undefined>=new Array(normals.length);let busy=false;
 const encloseTriangle=(triangleInput:readonly [Vec3,Vec3,Vec3])=>{
  if(busy)throw new UnsupportedFloatInterval('stationary-SAT-workspace-reentry');busy=true;
  try {
   dense(triangleInput,3,3);const triangle:V[]=[];
   for(const value of triangleInput){ordinary(value,['x','y','z']);triangle.push(originalFloatVectorPoint(ctx,{x:value.x,y:value.y,z:value.z}));}
   let mathCalls=0,processedAxes=0,unknownSkips=0,possibleUsed=false,reusedHullAxes=0;
   const finish=(certifiedNull:boolean,reason:string,separatorIndex:number|null)=>Object.freeze({status:certifiedNull?'conditional-stationary-SAT-null':'unresolved-stationary-SAT-null',certifiedNull,
    reason,separatorIndex,constructedAxes:axes.length,processedAxes,unknownAxisSkips:unknownSkips,mathCalls,maxMathCalls:maximum.mathCalls,reusedHullAxes,
    sameContextHullAxisReuse:true as const,pureImmutableMathReuseRequired:true as const,
    contractTag:tag,conditionalMathContract:true as const,mathContractVerified:false as const,sameActualFromToRequired:true as const,
    genericEagerAxesValidated:true as const,sourceCacheConsumed:false as const,immutableCacheEquivalenceRequired:true as const,
    movingSATCertified:false as const,contactReconstructed:false as const,positiveSkinWrapperCertified:false as const,nativeEquivalent:false as const,defaultIntegration:false as const});
   const triangleEdges=[sub(ctx,triangle[1],triangle[0]),sub(ctx,triangle[2],triangle[1]),sub(ctx,triangle[0],triangle[2])],normal=cross(ctx,triangleEdges[0],triangleEdges[1]);
   const axes:V[]=[];
   if(ctx.compare(squared(ctx,normal),ctx.point(0),'===')==='true')return finish(true,'source-degenerate-triangle-return',null);
   if(normals.length+1+3*edges.length>maximum.axes)throw new UnsupportedFloatInterval('stationary-SAT-axis-cap');
   axes.push(...normals,normal);
   // Generic source eagerly constructs every cross before first projection.
   // Proving all finite is deliberately stronger than relying on lazy caches.
   for(const edge of edges)for(const other of triangleEdges)axes.push(cross(ctx,edge,other));
   const zero=ctx.point(0),one=ctx.point(1),skipCutoff=ctx.point(1e-12);
   for(let index=0;index<axes.length;index++){
    processedAxes++;const raw=axes[index];
    let theorem=index<normals.length?hullAxes[index]:undefined;
    if(theorem)reusedHullAxes++;
    else {
     if(mathCalls>=maximum.mathCalls)throw new UnsupportedFloatInterval('stationary-SAT-math-call-cap');mathCalls++;
     let length:B;
     try{const value=hypotCallback(ctx,Object.freeze([raw.x,raw.y,raw.z]));length=ctx.intersect(ctx.hull(value,value),ctx.box(0,Number.MAX_VALUE));}
     catch(error){if(error instanceof UnsupportedFloatInterval)throw error;throw new UnsupportedFloatInterval('stationary-SAT-math-contract-threw');}
     const skipped=ctx.compare(length,skipCutoff,'<=');
     if(skipped==='true')theorem=Object.freeze({skipped});
     else {
      // Inclusive cut retains the actual source length>cutoff continuation.
      const usedLength=ctx.intersect(length,ctx.box(1e-12,Number.MAX_VALUE)),axis=mul(ctx,raw,ctx.div(one,usedLength));
      theorem=Object.freeze({skipped,axis,local:Object.freeze(projection(ctx,vertices,axis)),origin:dot(ctx,pivot,axis)});
     }
     if(index<normals.length)hullAxes[index]=theorem;
    }
    const {skipped}=theorem;if(skipped==='true')continue;
    possibleUsed=true;if(skipped==='unknown')unknownSkips++;
    const axis=theorem.axis!,local=theorem.local!,origin=theorem.origin!,other=projection(ctx,triangle,axis);
    const lo=ctx.add(local.lo,origin),hi=ctx.add(local.hi,origin);
    // SAME finite from/to implies RNdelta numeric0, and finite normalized axes
    // imply the exact numeric source dot(delta,axis)=0. No independent box sub.
    const speed=zero;
    const negative=ctx.sub(hi,other.lo),positive=ctx.sub(other.hi,lo);
    if(ctx.compare(negative,zero,'>=')!=='false'&&ctx.compare(positive,zero,'>=')!=='false'){
     ctx.min(negative,positive); // Source distance/depth guard may execute.
     const sign=ctx.compare(negative,positive,'<=');
     if(sign!=='false')mul(ctx,axis,ctx.point(-1));if(sign!=='true')mul(ctx,axis,one);
    }
    const separated=ctx.compare(hi,other.lo,'<')==='true'||ctx.compare(lo,other.hi,'>')==='true';
    // Unknown skip retains a path that never uses this separating axis.
    if(skipped==='false'&&ctx.compare(speed,ctx.point(1e-15),'<=')==='true'&&separated)return finish(true,'source-universally-used-separating-axis',index);
   }
   // With no possibly used axis, source overlapNormal remains undefined.
   if(!possibleUsed)return finish(true,'source-all-axes-skipped-no-normal',null);
   return finish(false,'no-universal-stationary-null-proof',null);
  }finally{busy=false;}
 };
 return Object.freeze({encloseTriangle});
}

/** Fresh workspace entry: no reuse across independent calls or contexts. */
export function encloseOriginalStationarySatNull(ctx:OriginalFloatIntervalContext,shape:OriginalStationarySatLocalIntervals,pivot:V,
 triangle:readonly [Vec3,Vec3,Vec3],contract:OriginalAngularMathContract,limits:OriginalStationarySatIntervalLimits={}) {
 return createOriginalStationarySatWorkspace(ctx,shape,pivot,contract,limits).encloseTriangle(triangle);
}
