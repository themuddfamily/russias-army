import {advanceOriginalAngularBody,cloneOriginalAngularBody,originalAngularConvex,validOriginalQuaternion,type OriginalAngularBody} from './originalAngularBody';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
import type {OriginalConvexPolytope,OriginalConvexSweepHit} from './originalConvexSweep';
import type {Vec3} from './protocol';

/** Detached proposal work only. These limits never alter world event budgets. */
export const ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS=Object.freeze({cells:128,evaluations:64,triangles:32,vertices:512,faces:1024,vectors:1024});
type Triangle=readonly [Vec3,Vec3,Vec3];
export interface OriginalFixedMotionTriangle {readonly id:string;readonly triangle:Triangle}
export interface OriginalFixedMotionCaptureInput {
 /** Scene mode reproduces the geometry query's whole-hull AABB rejection.
  * The default continues to evaluate the stationary wrapper directly. */
 readonly query?:'stationary-wrapper'|'scene-aabb-then-wrapper';
 readonly position:Vec3;readonly velocity:Vec3;readonly angular:OriginalAngularBody;readonly interval:number;
 readonly contactDistance:number;readonly triangles:readonly OriginalFixedMotionTriangle[];
 /** Pure revision token read; changing activation/coordinates must change this. */
 readonly sceneRevision:()=>unknown;
}
export interface OriginalFixedMotionCapture {
 readonly query:'stationary-wrapper'|'scene-aabb-then-wrapper';
 readonly position:Readonly<Vec3>;readonly velocity:Readonly<Vec3>;readonly angular:Readonly<OriginalAngularBody>;
 readonly interval:number;readonly contactDistance:number;readonly triangles:readonly OriginalFixedMotionTriangle[];
 readonly revision:unknown;readonly sceneRevision:()=>unknown;
}
export interface OriginalFixedMotionPose {
 readonly fraction:number;readonly duration:number;readonly position:Readonly<Vec3>;
 readonly angular:Readonly<OriginalAngularBody>;readonly convex:OriginalConvexPolytope;
}
export interface OriginalFixedMotionHit {readonly triangleId:string;readonly triangleIndex:number;readonly hit:Readonly<OriginalConvexSweepHit>}
/** All binary64 fractions >=lo and <hi, or <=hi when upperInclusive. */
export interface OriginalFixedMotionCell {readonly lo:number;readonly hi:number;readonly upperInclusive:boolean}
export type OriginalFixedMotionCellProof={readonly kind:'excluded';readonly proof:string}|{readonly kind:'unresolved'};
/** Trusted rigorous ALL-triangle source-predicate oracle, not a point sampler.
 * It must cover the exact cell's binary64 fraction clock and captured revision.
 * Its implementation must itself be bounded/pure; synchronous JS cannot
 * preempt a blocking oracle. The planner does not validate its mathematics. */
export type OriginalFixedMotionExclusionOracle=(motion:OriginalFixedMotionCapture,cell:OriginalFixedMotionCell)=>OriginalFixedMotionCellProof;
export interface OriginalFixedMotionStats {readonly cells:number;readonly evaluations:number;readonly excludedCells:number}
export type OriginalFixedMotionPlan=
 | {readonly kind:'excluded';readonly stats:OriginalFixedMotionStats;readonly certificates:readonly OriginalFixedMotionCellCertificate[];readonly scope:'captured-triangles-binary64-fractions'}
 | {readonly kind:'contact';readonly pose:OriginalFixedMotionPose;readonly contact:OriginalFixedMotionHit;readonly stats:OriginalFixedMotionStats;readonly certificates:readonly OriginalFixedMotionCellCertificate[];readonly earliestRepresentableFractionConditionalOnOracle:true;readonly scope:'captured-triangles-binary64-fractions'}
 | {readonly kind:'unresolved';readonly reason:string;readonly cell:OriginalFixedMotionCell;readonly stats:OriginalFixedMotionStats;readonly certificates:readonly OriginalFixedMotionCellCertificate[];readonly scope:'captured-triangles-binary64-fractions'};
export interface OriginalFixedMotionCellCertificate {readonly cell:OriginalFixedMotionCell;readonly proof:string;readonly origin:'trusted-whole-cell-oracle'|'adjacent-clock-nonhit'|'zero-duration-nonhit'}
const captures=new WeakSet<object>();
const finite=(v:Vec3)=>[v.x,v.y,v.z].every(Number.isFinite);
function ordinary(value:object,keys:readonly string[]):void {
 if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('Ordinary motion data required');
 for(const key of keys)if(!Object.getOwnPropertyDescriptor(value,key)||!('value' in Object.getOwnPropertyDescriptor(value,key)!))throw Error('Motion accessors are unsupported');
}
function vector(v:Vec3):Readonly<Vec3> {ordinary(v,['x','y','z']);if(!finite(v))throw Error('Nonfinite motion vector');return Object.freeze({x:v.x,y:v.y,z:v.z});}
function array<T>(values:readonly T[],maximum:number):void {
 if(Object.getPrototypeOf(values)!==Array.prototype||values.length>maximum||Object.getOwnPropertyDescriptor(values,Symbol.iterator))throw Error('Unsupported motion array');
 for(let i=0;i<values.length;i++)if(!Object.getOwnPropertyDescriptor(values,i)||!('value' in Object.getOwnPropertyDescriptor(values,i)!))throw Error('Sparse/accessor motion array');
}
function retainedHull(shape:OriginalConvexPolytope):OriginalConvexPolytope {
 ordinary(shape,['vertices','faceNormals','edgeDirections','faces']);
 array(shape.vertices,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.vertices);array(shape.faceNormals,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.vectors);array(shape.edgeDirections,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.vectors);
 if(!shape.faces)throw Error('Closed faces required');array(shape.faces,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.faces);
 if(shape.vertices.length<4||!shape.faceNormals.length||!shape.edgeDirections.length||shape.faces.length<4)throw Error('Empty motion hull');
 const faces=shape.faces.map(face=>{array(face,3);if(face.length!==3||face.some(i=>!Number.isSafeInteger(i)||i<0||i>=shape.vertices.length))throw Error('Invalid motion face');return Object.freeze([...face] as [number,number,number]);});
 return Object.freeze({vertices:Object.freeze(shape.vertices.map(vector)),faceNormals:Object.freeze(shape.faceNormals.map(vector)),edgeDirections:Object.freeze(shape.edgeDirections.map(vector)),faces:Object.freeze(faces)});
}
function retainedAngular(state:OriginalAngularBody):Readonly<OriginalAngularBody> {
 ordinary(state,['orientation','angularVelocity','centerOfMass','inverseInertia','referenceConvex']);ordinary(state.orientation,['x','y','z','w']);
 if(!validOriginalQuaternion(state.orientation))throw Error('Invalid motion quaternion');ordinary(state.inverseInertia,['xx','yy','zz','xy','xz','yz']);
 const tensor={xx:state.inverseInertia.xx,yy:state.inverseInertia.yy,zz:state.inverseInertia.zz,xy:state.inverseInertia.xy,xz:state.inverseInertia.xz,yz:state.inverseInertia.yz};
 if(!Object.values(tensor).every(Number.isFinite))throw Error('Nonfinite motion tensor');
 return Object.freeze({orientation:Object.freeze({x:state.orientation.x,y:state.orientation.y,z:state.orientation.z,w:state.orientation.w}),angularVelocity:vector(state.angularVelocity),centerOfMass:vector(state.centerOfMass),inverseInertia:Object.freeze(tensor),referenceConvex:retainedHull(state.referenceConvex)});
}
/** Copies/freeze all mutable source inputs, including fields shared by clone. */
export function captureOriginalAngularFixedMotion(input:OriginalFixedMotionCaptureInput):OriginalFixedMotionCapture {
 const queryDescriptor=Object.getOwnPropertyDescriptor(input,'query');
 if(queryDescriptor&&!('value' in queryDescriptor))throw Error('Motion query accessors are unsupported');
 const query=queryDescriptor?.value===undefined?'stationary-wrapper':queryDescriptor.value;
 if(query!=='stationary-wrapper'&&query!=='scene-aabb-then-wrapper')throw Error('Unsupported motion query');
 if(!Number.isFinite(input.interval)||input.interval<0||!Number.isFinite(input.contactDistance)||input.contactDistance<0)throw Error('Invalid motion interval/skin');
 array(input.triangles,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.triangles);if(!input.triangles.length)throw Error('Explicit nonempty triangle population required');
 const revision=input.sceneRevision();
 const triangles=input.triangles.map(v=>{ordinary(v,['id','triangle']);array(v.triangle,3);if(typeof v.id!=='string'||v.triangle.length!==3)throw Error('Invalid captured triangle');return Object.freeze({id:v.id,triangle:Object.freeze([vector(v.triangle[0]),vector(v.triangle[1]),vector(v.triangle[2])] as const)});});
 const motion=Object.freeze({query,position:vector(input.position),velocity:vector(input.velocity),angular:retainedAngular(input.angular),interval:input.interval,contactDistance:input.contactDistance,triangles:Object.freeze(triangles),revision,sceneRevision:input.sceneRevision});
 if(!Object.is(input.sceneRevision(),revision))throw Error('Scene changed during capture');captures.add(motion);return motion;
}
function current(motion:OriginalFixedMotionCapture):void {if(!captures.has(motion)||!Object.is(motion.sceneRevision(),motion.revision))throw Error('Stale motion scene revision');}
/** Read-only authenticity/epoch check for a rigorous detached cell oracle.
 * Uses the same private capture registry as point queries; it advances no pose
 * and requires the existing pure bounded sceneRevision callback premise. */
export function assertOriginalFixedMotionCaptureCurrent(motion:OriginalFixedMotionCapture):void {current(motion);}
/** Every query advances a fresh original saved clone at the AUTHORITATIVE
 * RN(interval*fraction) duration. No tau/divide/multiply round trip occurs. */
export function evaluateOriginalAngularFixedMotion(motion:OriginalFixedMotionCapture,fraction:number):{readonly pose:OriginalFixedMotionPose;readonly contact:OriginalFixedMotionHit|null} {
 current(motion);if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw Error('Invalid motion fraction');
 const duration=motion.interval*fraction,angular=cloneOriginalAngularBody(motion.angular);
 const position=advanceOriginalAngularBody({...motion.position},{...motion.velocity},angular,duration),convex=originalAngularConvex(angular);
 if(!finite(position))throw Error('Nonfinite evaluated motion pose');
 const pose=Object.freeze({fraction,duration,position:vector(position),angular:Object.freeze({...angular,orientation:Object.freeze({...angular.orientation}),angularVelocity:vector(angular.angularVelocity)}),convex});
 let contact:OriginalFixedMotionHit|null=null;
 // Same arithmetic/order as OriginalSceneGeometry's stationary sweep bounds:
 // local extreme + pivot, then +/- skin. This certifies the scene guard,
 // not a null result from a wrapper that was never invoked.
 const bounds=motion.query==='scene-aabb-then-wrapper'?(['x','y','z'] as const).map(axis=>({axis,
  min:Math.min(...convex.vertices.map(vertex=>vertex[axis]))+position[axis]-motion.contactDistance,
  max:Math.max(...convex.vertices.map(vertex=>vertex[axis]))+position[axis]+motion.contactDistance})):null;
 for(let i=0;i<motion.triangles.length;i++){
  if(bounds?.some(({axis,min,max})=>Math.max(...motion.triangles[i].triangle.map(vertex=>vertex[axis]))<min||Math.min(...motion.triangles[i].triangle.map(vertex=>vertex[axis]))>max))continue;
  const hit=sweepOriginalConvexTriangleDistance(convex,position,position,motion.triangles[i].triangle,motion.contactDistance);
  if(hit){contact=Object.freeze({triangleId:motion.triangles[i].id,triangleIndex:i,hit:Object.freeze({...hit,position:vector(hit.position),normal:vector(hit.normal),...(hit.witnessA?{witnessA:vector(hit.witnessA)}:{}),...(hit.witnessB?{witnessB:vector(hit.witnessB)}:{})})});break;}
 }
 current(motion);return Object.freeze({pose,contact});
}
const bits=new DataView(new ArrayBuffer(8));
function nextFraction(value:number):number {bits.setFloat64(0,value,false);bits.setBigUint64(0,bits.getBigUint64(0,false)+1n,false);return bits.getFloat64(0,false);}
/** Left-first binary64 fraction lattice planner, conditional on a trusted
 * whole-cell oracle. No world commit, response, event-budget or time debit. */
export function planOriginalAngularFixedMotion(motion:OriginalFixedMotionCapture,exclude:OriginalFixedMotionExclusionOracle,limits:{readonly cells?:number;readonly evaluations?:number}={}):OriginalFixedMotionPlan {
 const cellLimit=limits.cells??ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.cells,evaluationLimit=limits.evaluations??ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.evaluations;
 if(!Number.isSafeInteger(cellLimit)||cellLimit<1||cellLimit>ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.cells||!Number.isSafeInteger(evaluationLimit)||evaluationLimit<1||evaluationLimit>ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.evaluations)throw Error('Planner caps may only be lowered');
 const pending:OriginalFixedMotionCell[]=[Object.freeze({lo:0,hi:1,upperInclusive:true})],certificates:OriginalFixedMotionCellCertificate[]=[];
 let cells=0,evaluations=0;const cache=new Map<number,ReturnType<typeof evaluateOriginalAngularFixedMotion>>();
 const stats=()=>Object.freeze({cells,evaluations,excludedCells:certificates.length});
 const receipts=()=>Object.freeze([...certificates]);const scope='captured-triangles-binary64-fractions' as const;
 const unresolved=(reason:string,cell:OriginalFixedMotionCell):OriginalFixedMotionPlan=>Object.freeze({kind:'unresolved',reason,cell,stats:stats(),certificates:receipts(),scope});
 const sample=(fraction:number)=>{current(motion);let value=cache.get(fraction);if(!value){if(evaluations>=evaluationLimit)throw Error('point-evaluation-cap');evaluations++;value=evaluateOriginalAngularFixedMotion(motion,fraction);cache.set(fraction,value);}return value;};
 while(pending.length){
  const cell=pending.pop()!;
  if(cells>=cellLimit)return unresolved('cell-cap',cell);cells++;
  try {
   current(motion);const lower=sample(cell.lo);
   // All smaller fractions have already been certified excluded by left-first
   // traversal; no sampled later hit is used to skip an unresolved prefix.
   if(lower.contact)return Object.freeze({kind:'contact',pose:lower.pose,contact:lower.contact,stats:stats(),certificates:receipts(),earliestRepresentableFractionConditionalOnOracle:true,scope});
   if(motion.interval===0){certificates.push(Object.freeze({cell,proof:'All source durations are numericzero; same captured stationary nonhit.',origin:'zero-duration-nonhit'}));continue;}
   const proof=exclude(motion,cell);current(motion);
   if(proof.kind==='excluded'){
    if(typeof proof.proof!=='string'||!proof.proof.trim())return unresolved('invalid-exclusion-receipt',cell);
    certificates.push(Object.freeze({cell,proof:proof.proof,origin:'trusted-whole-cell-oracle'}));continue;
   }
   if(proof.kind!=='unresolved')return unresolved('invalid-oracle-result',cell);
   if(nextFraction(cell.lo)===cell.hi){
    if(cell.upperInclusive){const upper=sample(cell.hi);if(upper.contact){certificates.push(Object.freeze({cell:Object.freeze({lo:cell.lo,hi:cell.hi,upperInclusive:false}),proof:'Adjacent representable fractions; the included lower endpoint evaluated nonhit.',origin:'adjacent-clock-nonhit'}));return Object.freeze({kind:'contact',pose:upper.pose,contact:upper.contact,stats:stats(),certificates:receipts(),earliestRepresentableFractionConditionalOnOracle:true,scope});}}
    certificates.push(Object.freeze({cell,proof:'Adjacent representable fractions; all included endpoints evaluated nonhit.',origin:'adjacent-clock-nonhit'}));continue;
   }
   const middle=cell.lo+(cell.hi-cell.lo)/2;
   if(!(middle>cell.lo&&middle<cell.hi))return unresolved('fraction-split-stalled',cell);
   // Half-open left cell cannot exclude an admitted shared right endpoint.
   pending.push(Object.freeze({lo:middle,hi:cell.hi,upperInclusive:cell.upperInclusive}),Object.freeze({lo:cell.lo,hi:middle,upperInclusive:false}));
  }catch(error){return unresolved(error instanceof Error?error.message:'oracle-or-evaluation-failure',cell);}
 }
 return Object.freeze({kind:'excluded',stats:stats(),certificates:receipts(),scope});
}
