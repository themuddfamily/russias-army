import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint,type OriginalFloatVectorBox} from './originalFiniteFeatureInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import {encloseOriginalStationarySatNull,createOriginalStationarySatWorkspace} from './originalStationarySatInterval';
import {encloseOriginalFeaturePreparation,encloseOriginalTriangleFeaturePreparation} from './originalFeaturePreparationInterval';
import {createOriginalSeparatedDistanceWorkspace,encloseOriginalSeparatedDistance,type OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';
import type {Vec3} from './protocol';

export interface OriginalStationaryDistanceWrapperShape {
 readonly vertices:readonly OriginalFloatVectorBox[];readonly faceNormals:readonly OriginalFloatVectorBox[];readonly edgeDirections:readonly OriginalFloatVectorBox[];
 readonly faces?:readonly (readonly [number,number,number])[];
}
export const ORIGINAL_STATIONARY_DISTANCE_WRAPPER_LIMITS=Object.freeze({vertices:512,faces:1024,faceNormals:1024,edgeDirections:1024,axes:4097,mathCalls:128,featurePairs:1024,winnerSlots:1024});
export type OriginalStationaryDistanceWrapperLimits={readonly [K in keyof typeof ORIGINAL_STATIONARY_DISTANCE_WRAPPER_LIMITS]?:number};
type V=OriginalFloatVectorBox;
function ordinary(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-stationary-wrapper-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('stationary-wrapper-accessors-unsupported');}
}
function dense(value:readonly unknown[],maximum:number):void {
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum)throw new UnsupportedFloatInterval('bounded-stationary-wrapper-array-required');
 for(const key of [Symbol.iterator,'map','filter','every','some','flat'] as const)if(Object.getOwnPropertyDescriptor(value,key))throw new UnsupportedFloatInterval('standard-stationary-wrapper-array-required');
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,i);if(!d||!('value' in d))throw new UnsupportedFloatInterval('dense-stationary-wrapper-array-required');}
}
const sub=(c:OriginalFloatIntervalContext,a:V,b:V):V=>Object.freeze({x:c.sub(a.x,b.x),y:c.sub(a.y,b.y),z:c.sub(a.z,b.z)});
const cross=(c:OriginalFloatIntervalContext,a:V,b:V):V=>{const [x,y,z]=c.cross3(a.x,a.y,a.z,b.x,b.y,b.z);return Object.freeze({x,y,z});};

/** Private SAME-context immutable hull preparation workspace. Reuse is a proof
 * about the SAME captured source tuples, not acceptance of supplied cache data. */
export function createOriginalStationaryDistanceWrapperWorkspace(ctx:OriginalFloatIntervalContext,shapeInput:OriginalStationaryDistanceWrapperShape,pivotInput:V,
 contract:OriginalAngularMathContract,profile:OriginalSeparatedDistanceSourceProfile,
 limits:OriginalStationaryDistanceWrapperLimits={}) {
 ordinary(limits,[]);const maximum:{vertices:number;faces:number;faceNormals:number;edgeDirections:number;axes:number;mathCalls:number;featurePairs:number;winnerSlots:number}={...ORIGINAL_STATIONARY_DISTANCE_WRAPPER_LIMITS};
 for(const key of Object.keys(maximum) as (keyof typeof maximum)[]){const d=Object.getOwnPropertyDescriptor(limits,key);if(d){if(!('value' in d))throw new UnsupportedFloatInterval('wrapper-limit-accessors-unsupported');maximum[key]=d.value;}
  if(!Number.isSafeInteger(maximum[key])||maximum[key]<1||maximum[key]>ORIGINAL_STATIONARY_DISTANCE_WRAPPER_LIMITS[key])throw new UnsupportedFloatInterval('wrapper-caps-may-only-be-lowered');}
 // All values and callback identities are retained BEFORE the first callback.
 const vector=(v:V):V=>{ordinary(v,['x','y','z']);return ctx.vector3(v.x,v.y,v.z);};
 const pivot=vector(pivotInput);
 ordinary(shapeInput,['vertices','faceNormals','edgeDirections']);
 const capture=(values:readonly V[],cap:number)=>{dense(values,cap);return Object.freeze(values.map(vector));};
 const vertices=capture(shapeInput.vertices,maximum.vertices),faceNormals=capture(shapeInput.faceNormals,maximum.faceNormals),edgeDirections=capture(shapeInput.edgeDirections,maximum.edgeDirections);
 const fd=Object.getOwnPropertyDescriptor(shapeInput,'faces');if(fd&&!('value' in fd))throw new UnsupportedFloatInterval('wrapper-face-accessors-unsupported');
 let faces:readonly (readonly [number,number,number])[]|undefined;
 if(fd&&fd.value!==undefined){const raw=fd.value as readonly (readonly [number,number,number])[];dense(raw,maximum.faces);faces=Object.freeze(raw.map(f=>{dense(f,3);if(f.length!==3)throw new UnsupportedFloatInterval('wrapper-three-face-indices-required');return Object.freeze([f[0],f[1],f[2]] as const);}));}
 const shape=Object.freeze({vertices,faceNormals,edgeDirections,faces});
 ordinary(contract,['tag','hypot','sin','cos']);ordinary(profile,['tag','arithmetic','sqrt','cache']);
 if(!Object.isFrozen(contract)||typeof contract.tag!=='string'||!contract.tag||contract.tag.length>1024||![contract.hypot,contract.sin,contract.cos].every(f=>typeof f==='function'))throw new UnsupportedFloatInterval('frozen-wrapper-Math-contract-required');
 if(!Object.isFrozen(profile)||typeof profile.tag!=='string'||!profile.tag||profile.tag.length>1024||profile.arithmetic!=='separate-rn-binary64-gradual-underflow'||profile.sqrt!=='correctly-rounded-source-Math.sqrt'||profile.cache!=='ordinary-immutable-equivalent-source-caches')throw new UnsupportedFloatInterval('explicit-frozen-wrapper-source-profile-required');
 const savedProfile=Object.freeze({tag:profile.tag,arithmetic:profile.arithmetic,sqrt:profile.sqrt,cache:profile.cache}),hypot=contract.hypot,sin=contract.sin,cos=contract.cos,tag=contract.tag;
 let prepared:ReturnType<typeof encloseOriginalFeaturePreparation>|undefined,workspacePreparationCalls=0,busy=false;
 let distanceWorkspace:ReturnType<typeof createOriginalSeparatedDistanceWorkspace>|undefined;
 let mathCalls=0,satWorkspace:ReturnType<typeof createOriginalStationarySatWorkspace>|undefined;
 // Keep ONE callback identity for private SAME-shape SAT proof reuse. Calls
 // are counted afresh per wrapper invocation; the caller's aggregate wrapper
 // still sees every actual callback and its own unchanged cumulative cap.
 const capturedContract:OriginalAngularMathContract=Object.freeze({tag,hypot:(c:OriginalFloatIntervalContext,values:readonly OriginalFloatBox[],purpose:Parameters<OriginalAngularMathContract['hypot']>[2])=>{
  if(c!==ctx)throw new UnsupportedFloatInterval('wrapper-Math-context-mismatch');if(mathCalls>=maximum.mathCalls)throw new UnsupportedFloatInterval('wrapper-Math-call-cap');mathCalls++;
  try{const result=hypot(c,values,purpose);return c.intersect(c.hull(result,result),c.box(0,Number.MAX_VALUE));}catch(error){if(error instanceof UnsupportedFloatInterval)throw error;throw new UnsupportedFloatInterval('wrapper-Math-contract-threw');}
 },sin,cos});
 const sat=(triangle:readonly [Vec3,Vec3,Vec3])=>{
  // Do not construct source SAT state on a positive outer-degenerate arm.
  satWorkspace??=createOriginalStationarySatWorkspace(ctx,shape,pivot,capturedContract,maximum);
  return satWorkspace.encloseTriangle(triangle);
 };
 const encloseTriangle=(triangleInput:readonly [Vec3,Vec3,Vec3],contactDistance:number)=>{
 if(busy)throw new UnsupportedFloatInterval('stationary-wrapper-workspace-reentry');busy=true;
 try {
 if(!Number.isFinite(contactDistance)||contactDistance<0)throw new UnsupportedFloatInterval('nonnegative-finite-wrapper-contact-distance-required');
 dense(triangleInput,3);if(triangleInput.length!==3)throw new UnsupportedFloatInterval('wrapper-triangle-three-points-required');
 const triangle=Object.freeze(triangleInput.map(v=>{ordinary(v,['x','y','z']);if(![v.x,v.y,v.z].every(Number.isFinite))throw new UnsupportedFloatInterval('finite-wrapper-triangle-required');return Object.freeze({x:v.x,y:v.y,z:v.z});})) as readonly [Vec3,Vec3,Vec3];
 mathCalls=0;
 let initialSat:ReturnType<typeof encloseOriginalStationarySatNull>|undefined,distance:ReturnType<typeof encloseOriginalSeparatedDistance>|undefined;
 let outerZero:'true'|'false'|'unknown'|undefined,preparationCalls=0,preparationReused=false,actualSatReused=false,evaluateZeroOffsetIdentity=false,closingFiniteZero=false;
 const finish=(certified:boolean,reason:string)=>Object.freeze({status:certified?'conditional-stationary-triangle-wrapper-null':'unresolved-stationary-triangle-wrapper-null',conditionalFullWrapperNullCertified:certified,reason,
  contactDistance,outerZero,initialSat,distance,mathCalls,maxMathCalls:maximum.mathCalls,preparationCalls,preparationReused,workspacePreparationCalls,actualSatReused,evaluateZeroOffsetIdentity,closingFiniteZero,
  sameActualFromToRequired:true as const,pureImmutableSATReuseRequired:true as const,immutableCacheEquivalenceRequired:true as const,conditionalMathContract:true as const,
  contractTag:tag,sourceProfile:savedProfile,sourceProfileAttested:false as const,mathContractVerified:false as const,movingWrapperCertified:false as const,contactReconstructed:false as const,
  sceneCoverageCertified:false as const,clockCoverageCertified:false as const,nativeEquivalent:false as const,defaultIntegration:false as const});
 // Source zero-skin dispatch precedes outer normal and feature preparation.
 if(contactDistance===0){initialSat=sat(triangle);return finish(initialSat.certifiedNull,'zero-skin-direct-SAT');}
 const points=Object.freeze(triangle.map(v=>originalFloatVectorPoint(ctx,v))) as readonly [V,V,V];
 const outer=cross(ctx,sub(ctx,points[1],points[0]),sub(ctx,points[2],points[0]));
 const length=capturedContract.hypot(ctx,Object.freeze([outer.x,outer.y,outer.z]));outerZero=ctx.compare(length,ctx.point(0),'===');
 if(outerZero==='true')return finish(true,'positive-skin-outer-degenerate-return');
 // Unknown outer zero retains its null arm; the positive continuation must
 // still be safe and null. No favorable zero branch bypasses later work.
 if(!faces)throw new UnsupportedFloatInterval('positive-wrapper-closed-faces-required');
 if(prepared)preparationReused=true;
 else {preparationCalls++;const complete=encloseOriginalFeaturePreparation(ctx,{vertices,faces},capturedContract,maximum);prepared=complete;workspacePreparationCalls++;}
 const a=prepared;
 initialSat=sat(triangle);
 if(!initialSat.certifiedNull)return finish(false,'initial-SAT-null-unresolved');
 const b=encloseOriginalTriangleFeaturePreparation(ctx,points);
 // Actual SAT has EXACT SAME captured inputs as initial SAT, because from/to
 // are the same actual tuple. Pure immutable/cache equivalence permits reuse.
 actualSatReused=true;
 const zero=ctx.point(0),relative=Object.freeze({x:zero,y:zero,z:zero});
 const offset=Object.freeze({x:ctx.add(pivot.x,ctx.mul(relative.x,zero)),y:ctx.add(pivot.y,ctx.mul(relative.y,zero)),z:ctx.add(pivot.z,ctx.mul(relative.z,zero))});evaluateZeroOffsetIdentity=true;
 distanceWorkspace??=createOriginalSeparatedDistanceWorkspace(ctx,a,savedProfile,maximum);
 distance=distanceWorkspace.encloseTriangle(b,offset,contactDistance);
 if(!distance.stationaryAdvanceNullCertified)return finish(false,'stationary-distance-threshold-unresolved');
 const closing=ctx.neg(ctx.add(ctx.add(ctx.mul(relative.x,distance.normal.x),ctx.mul(relative.y,distance.normal.y)),ctx.mul(relative.z,distance.normal.z)));
 closingFiniteZero=ctx.compare(closing,zero,'===')==='true';
 return finish(closingFiniteZero,'positive-skin-first-stationary-advance-null');
 }finally{busy=false;}
 };
 return Object.freeze({encloseTriangle,metadata:Object.freeze({sameContextAndCapturedHullRequired:true as const,pureImmutablePreparationReuseRequired:true as const,
  callerPreparedDataAccepted:false as const,budgetReset:false as const,sourceCacheAttested:false as const,defaultIntegration:false as const,nativeEquivalent:false as const})});
}

/** Fresh-workspace compatibility entry point; no cross-call cache or reset. */
export function encloseOriginalStationaryDistanceWrapperNull(ctx:OriginalFloatIntervalContext,shapeInput:OriginalStationaryDistanceWrapperShape,pivotInput:V,
 triangleInput:readonly [Vec3,Vec3,Vec3],contactDistance:number,contract:OriginalAngularMathContract,profile:OriginalSeparatedDistanceSourceProfile,
 limits:OriginalStationaryDistanceWrapperLimits={}) {
 if(!Number.isFinite(contactDistance)||contactDistance<0)throw new UnsupportedFloatInterval('nonnegative-finite-wrapper-contact-distance-required');
 return createOriginalStationaryDistanceWrapperWorkspace(ctx,shapeInput,pivotInput,contract,profile,limits).encloseTriangle(triangleInput,contactDistance);
}
