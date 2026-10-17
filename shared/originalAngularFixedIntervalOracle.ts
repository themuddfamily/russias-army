import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox,type OriginalFloatIntervalLimits} from './originalFloatInterval';
import {encloseOriginalAngularPose,type OriginalAngularMathContract} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import {createOriginalStationaryDistanceWrapperWorkspace} from './originalStationaryDistanceWrapperInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';
import {assertOriginalFixedMotionCaptureCurrent,type OriginalFixedMotionCapture,type OriginalFixedMotionCell,type OriginalFixedMotionExclusionOracle} from './originalAngularFixedMotion';
import type {Vec3} from './protocol';

export interface OriginalAngularFixedIntervalOracleLimits extends OriginalFloatIntervalLimits {readonly mathCalls?:number;readonly triangles?:number}
const CAPS=Object.freeze({operations:100000,boxes:16384,rationalBits:4096,mathCalls:128,triangles:32});
function ordinary(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-fixed-oracle-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('fixed-oracle-accessors-unsupported');}
}
function dense(value:readonly unknown[],maximum:number):void {
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum)throw new UnsupportedFloatInterval('bounded-fixed-oracle-array-required');
 for(const key of [Symbol.iterator,'map','filter','every','some','flat'] as const)if(Object.getOwnPropertyDescriptor(value,key))throw new UnsupportedFloatInterval('standard-fixed-oracle-array-required');
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,i);if(!d||!('value' in d))throw new UnsupportedFloatInterval('dense-fixed-oracle-array-required');}
}
function vector(v:Vec3):Readonly<Vec3> {ordinary(v,['x','y','z']);if(![v.x,v.y,v.z].every(Number.isFinite))throw new UnsupportedFloatInterval('finite-fixed-oracle-vector-required');return Object.freeze({x:v.x,y:v.y,z:v.z});}

/** Explicit conditional numerical oracle only; no source-profile attestation,
 * persistent proof cache, native scene coverage or default integration. */
export function createOriginalAngularFixedIntervalOracle(contract:OriginalAngularMathContract,profile:OriginalSeparatedDistanceSourceProfile,limits:OriginalAngularFixedIntervalOracleLimits={}) {
 ordinary(contract,['tag','hypot','sin','cos']);ordinary(profile,['tag','arithmetic','sqrt','cache']);ordinary(limits,[]);
 if(!Object.isFrozen(contract)||typeof contract.tag!=='string'||!contract.tag||contract.tag.length>1024||![contract.hypot,contract.sin,contract.cos].every(f=>typeof f==='function'))throw new UnsupportedFloatInterval('explicit-frozen-fixed-oracle-Math-required');
 if(!Object.isFrozen(profile)||typeof profile.tag!=='string'||!profile.tag||profile.tag.length>1024||profile.arithmetic!=='separate-rn-binary64-gradual-underflow'||profile.sqrt!=='correctly-rounded-source-Math.sqrt'||profile.cache!=='ordinary-immutable-equivalent-source-caches')throw new UnsupportedFloatInterval('explicit-frozen-fixed-oracle-source-profile-required');
 const maximum:{operations:number;boxes:number;rationalBits:number;mathCalls:number;triangles:number}={...CAPS};
 for(const key of Object.keys(maximum) as (keyof typeof maximum)[]){const d=Object.getOwnPropertyDescriptor(limits,key);if(d){if(!('value' in d))throw new UnsupportedFloatInterval('fixed-oracle-limit-accessors-unsupported');maximum[key]=d.value;}
  if(!Number.isSafeInteger(maximum[key])||maximum[key]<1||maximum[key]>CAPS[key])throw new UnsupportedFloatInterval('fixed-oracle-caps-may-only-be-lowered');}
 const sourceProfile=Object.freeze({tag:profile.tag,arithmetic:profile.arithmetic,sqrt:profile.sqrt,cache:profile.cache}),tag=contract.tag,hypot=contract.hypot,sin=contract.sin,cos=contract.cos;
 const metadata=Object.freeze({scope:'captured-triangles-binary64-fractions' as const,sourceProfile,contractTag:tag,halfOpenUpperIsBinary64Predecessor:true as const,
  sourceProfileAttested:false as const,mathContractVerified:false as const,nativeEquivalent:false as const,defaultIntegration:false as const,continuousTimeCertified:false as const,fullFrameClockCertified:false as const,
  scenePopulationCompleteRequiredExternally:true as const,proofHistoryRetained:false as const,attemptLocalHullWorkspace:true as const,
  attemptLocalPrimitiveProofReuse:true as const,operationAccounting:'bounded-proof-computations-with-universal-numeric-reuse' as const,limits:Object.freeze({...maximum})});
 let busy=false;
 const inspectCell=(motion:OriginalFixedMotionCapture,cell:OriginalFixedMotionCell)=>{
  let ctx:OriginalFloatIntervalContext|undefined,clock:OriginalFloatBox|undefined,representedHi:number|undefined,exactCell:Readonly<OriginalFixedMotionCell>|undefined,query:OriginalFixedMotionCapture['query']|undefined,mathCalls=0,triangleCount=0,certifiedTriangles=0,boundsExcludedTriangles=0;
  const finish=(excluded:boolean,reason:string)=>Object.freeze({kind:excluded?'excluded' as const:'unresolved' as const,reason,motion,cell:exactCell,clock,triangleCount,certifiedTriangles,mathCalls,
   query,boundsExcludedTriangles,representedHi,resources:ctx?.resources(),metadata,proof:excluded?(query==='scene-aabb-then-wrapper'
    ?'Conditional whole captured binary64 cell: source pose, full-hull geometry bounds and every captured scene triangle rejected by the geometry AABB guard or stationary wrapper; explicit frozen Math/root/cache premises and current capture.'
    :'Conditional whole captured binary64 cell: source pose, local geometry and every captured stationary triangle wrapper null; explicit frozen Math/root/cache premises and current capture.'):undefined});
  if(busy)return finish(false,'fixed-oracle-reentry-unsupported');busy=true;
  try {
   ordinary(cell,['lo','hi','upperInclusive']);
   if(!Number.isFinite(cell.lo)||!Number.isFinite(cell.hi)||cell.lo<0||cell.hi>1||cell.lo>cell.hi||typeof cell.upperInclusive!=='boolean'||(!cell.upperInclusive&&cell.lo===cell.hi))throw new UnsupportedFloatInterval('invalid-fixed-oracle-cell');
   exactCell=Object.freeze({lo:cell.lo,hi:cell.hi,upperInclusive:cell.upperInclusive});
   representedHi=exactCell.hi;
   if(!exactCell.upperInclusive){const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,exactCell.hi,false);bits.setBigUint64(0,bits.getBigUint64(0,false)-1n,false);representedHi=bits.getFloat64(0,false);
    if(representedHi<exactCell.lo)throw new UnsupportedFloatInterval('empty-fixed-oracle-represented-cell');}
   ordinary(motion,['query','position','velocity','angular','interval','contactDistance','triangles','revision','sceneRevision']);
   if(motion.query!=='stationary-wrapper'&&motion.query!=='scene-aabb-then-wrapper')throw new UnsupportedFloatInterval('unsupported-fixed-oracle-query');
   query=motion.query;
   if(!Number.isFinite(motion.interval)||motion.interval<0||!Number.isFinite(motion.contactDistance)||motion.contactDistance<0)throw new UnsupportedFloatInterval('finite-fixed-oracle-clock-skin-required');
   const interval=motion.interval,contactDistance=motion.contactDistance,position=vector(motion.position),velocity=vector(motion.velocity),angular=motion.angular;
   ordinary(angular,['orientation','angularVelocity','centerOfMass','inverseInertia','referenceConvex']);ordinary(angular.orientation,['x','y','z','w']);ordinary(angular.inverseInertia,['xx','yy','zz','xy','xz','yz']);
   const q=angular.orientation,t=angular.inverseInertia,orientation=Object.freeze({x:q.x,y:q.y,z:q.z,w:q.w}),inverseInertia=Object.freeze({xx:t.xx,yy:t.yy,zz:t.zz,xy:t.xy,xz:t.xz,yz:t.yz});
   if(!Object.values(orientation).every(Number.isFinite)||!Object.values(inverseInertia).every(Number.isFinite))throw new UnsupportedFloatInterval('finite-fixed-oracle-angular-input-required');
   const saved=Object.freeze({position,COMvelocity:velocity,orientation,angularVelocity:vector(angular.angularVelocity),centerOfMass:vector(angular.centerOfMass),inverseInertia});
   const hull=angular.referenceConvex;ordinary(hull,['vertices','faceNormals','edgeDirections','faces']);
   const vectors=(v:readonly Vec3[],cap:number)=>{dense(v,cap);return Object.freeze(v.map(vector));};
   const vertices=vectors(hull.vertices,512),faceNormals=vectors(hull.faceNormals,1024),edgeDirections=vectors(hull.edgeDirections,1024);
   if(!hull.faces)throw new UnsupportedFloatInterval('fixed-oracle-closed-faces-required');dense(hull.faces,1024);
   const faces=Object.freeze(hull.faces.map(f=>{dense(f,3);if(f.length!==3||f.some(i=>!Number.isSafeInteger(i)||i<0||i>=vertices.length))throw new UnsupportedFloatInterval('fixed-oracle-invalid-face');return Object.freeze([f[0],f[1],f[2]] as const);}));
   const reference=Object.freeze({vertices,faceNormals,edgeDirections,faces});
   dense(motion.triangles,maximum.triangles);if(!motion.triangles.length)throw new UnsupportedFloatInterval('fixed-oracle-nonempty-triangles-required');
   const triangles=Object.freeze(motion.triangles.map(entry=>{ordinary(entry,['id','triangle']);dense(entry.triangle,3);if(entry.triangle.length!==3)throw new UnsupportedFloatInterval('fixed-oracle-triangle-three-points-required');return Object.freeze([vector(entry.triangle[0]),vector(entry.triangle[1]),vector(entry.triangle[2])] as const);}));triangleCount=triangles.length;
   // Snapshot completed before the revision reader or any Math callback.
   assertOriginalFixedMotionCaptureCurrent(motion);
   // Reuse universal numeric primitive proofs only inside this one attempt.
   // Equal numeric ranges never imply equality of actual nonpoint values.
   ctx=new OriginalFloatIntervalContext(maximum,Object.freeze({primitiveProofReuse:true}));const c=ctx;
   const invoke=(fn:()=>OriginalFloatBox):OriginalFloatBox=>{if(mathCalls>=maximum.mathCalls)throw new UnsupportedFloatInterval('fixed-oracle-aggregate-Math-cap');mathCalls++;
    try{const value=fn();return c.hull(value,value);}catch(error){if(error instanceof UnsupportedFloatInterval)throw error;throw new UnsupportedFloatInterval('fixed-oracle-Math-contract-threw');}};
   const bounded:OriginalAngularMathContract=Object.freeze({tag,
    hypot:(owner:OriginalFloatIntervalContext,values:readonly OriginalFloatBox[],purpose:Parameters<OriginalAngularMathContract['hypot']>[2])=>{if(owner!==c)throw new UnsupportedFloatInterval('fixed-oracle-context-mismatch');return invoke(()=>hypot(owner,values,purpose));},
    sin:(owner:OriginalFloatIntervalContext,a:OriginalFloatBox)=>{if(owner!==c)throw new UnsupportedFloatInterval('fixed-oracle-context-mismatch');return invoke(()=>sin(owner,a));},
    cos:(owner:OriginalFloatIntervalContext,a:OriginalFloatBox)=>{if(owner!==c)throw new UnsupportedFloatInterval('fixed-oracle-context-mismatch');return invoke(()=>cos(owner,a));}});
   // Remove ONLY an excluded upper endpoint using the binary64 predecessor.
   // RN(interval*fraction) is the authoritative clock, without tau conversion.
   clock=c.mul(c.point(interval),c.box(exactCell.lo,representedHi));
   const pose=encloseOriginalAngularPose(c,saved,clock,bounded),geometry=encloseOriginalAngularGeometry(c,reference,pose.orientation,bounded);
   // This private captured-geometry workspace lives only for this attempt.
   // SAME immutable hull feature proofs share the existing aggregate budget.
   let workspace:ReturnType<typeof createOriginalStationaryDistanceWrapperWorkspace>|undefined;
   const axes=['x','y','z'] as const;
   const sceneBounds=motion.query==='scene-aabb-then-wrapper'?axes.map(axis=>{
    let min=geometry.vertices[0][axis],max=min;
    for(let i=1;i<geometry.vertices.length;i++){min=c.min(min,geometry.vertices[i][axis]);max=c.max(max,geometry.vertices[i][axis]);}
    return {axis,min:c.sub(c.add(min,pose.pivot[axis]),c.point(contactDistance)),max:c.add(c.add(max,pose.pivot[axis]),c.point(contactDistance))};
   }):null;
   for(const triangle of triangles){
    if(sceneBounds?.some(({axis,min,max})=>Math.max(...triangle.map(vertex=>vertex[axis]))<min.lo||Math.min(...triangle.map(vertex=>vertex[axis]))>max.hi)){
     certifiedTriangles++;boundsExcludedTriangles++;continue;
    }
    workspace??=createOriginalStationaryDistanceWrapperWorkspace(c,geometry,pose.pivot,bounded,sourceProfile);
    const wrapper=workspace.encloseTriangle(triangle,contactDistance);
    if(!wrapper.conditionalFullWrapperNullCertified){assertOriginalFixedMotionCaptureCurrent(motion);return finish(false,'captured-triangle-wrapper-unresolved');}certifiedTriangles++;}
   assertOriginalFixedMotionCaptureCurrent(motion);return finish(true,motion.query==='scene-aabb-then-wrapper'?'all-captured-scene-triangles-excluded':'all-captured-triangle-wrappers-null');
  }catch(error){return finish(false,error instanceof Error?error.message.slice(0,256):'fixed-oracle-unsupported');}finally{busy=false;}
 };
 const oracle:OriginalFixedMotionExclusionOracle=(motion,cell)=>{const result=inspectCell(motion,cell);return result.kind==='excluded'?Object.freeze({kind:'excluded',proof:result.proof!}):Object.freeze({kind:'unresolved'});};
 return Object.freeze({oracle,inspectCell,metadata});
}
