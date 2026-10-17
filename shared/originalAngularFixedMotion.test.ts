import {describe,expect,it} from 'vitest';
import {advanceOriginalAngularBody,cloneOriginalAngularBody,createOriginalAngularBody,originalAngularConvex,type OriginalAngularBody} from './originalAngularBody';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
import {captureOriginalAngularFixedMotion,evaluateOriginalAngularFixedMotion,planOriginalAngularFixedMotion,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS,type OriginalFixedMotionCaptureInput} from './originalAngularFixedMotion';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';

const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
const floor=[at(-10,0,-10),at(10,0,-10),at(0,0,10)] as const;
function cube():OriginalConvexPolytope {
 return {vertices:[at(-1,-1,-1),at(1,-1,-1),at(-1,1,-1),at(1,1,-1),at(-1,-1,1),at(1,-1,1),at(-1,1,1),at(1,1,1)],
  faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],
  faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
}
function input(overrides:Partial<OriginalFixedMotionCaptureInput>={}):OriginalFixedMotionCaptureInput {
 return {position:at(0,1.2),velocity:at(),angular:createOriginalAngularBody(cube(),1),interval:1,contactDistance:0,triangles:[{id:'floor',triangle:floor}],sceneRevision:()=>1,...overrides};
}
function predecessor(value:number):number {const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,value,false);b.setBigUint64(0,b.getBigUint64(0,false)-1n,false);return b.getFloat64(0,false);}

describe('detached actual angular fixed-scene proposals',()=>{
 it('uses real rotated full hull stationary contact, not a translated frozen hull',()=>{
  const seed=input();seed.angular.angularVelocity.z=90;
  const motion=captureOriginalAngularFixedMotion(seed);
  expect(evaluateOriginalAngularFixedMotion(motion,0).contact).toBeNull();
  const trial=evaluateOriginalAngularFixedMotion(motion,.5);
  expect(trial.contact).not.toBeNull();
  const angular=cloneOriginalAngularBody(seed.angular),position=advanceOriginalAngularBody({...seed.position},{...seed.velocity},angular,.5);
  expect(trial.pose.angular.orientation).toEqual(angular.orientation);
  expect(trial.contact!.hit).toEqual(sweepOriginalConvexTriangleDistance(originalAngularConvex(angular),position,position,floor,0));
  expect(sweepOriginalConvexTriangleDistance(originalAngularConvex(seed.angular),seed.position,seed.position,floor,0)).toBeNull();
 });

 it('starts every trial from the same saved clone in any evaluation order',()=>{
  const seed=input({velocity:at(.3,-.1,.2)});seed.angular.angularVelocity=at(37,61,19);
  const untouched=JSON.stringify(seed.angular),motion=captureOriginalAngularFixedMotion(seed);
  const first=evaluateOriginalAngularFixedMotion(motion,.75);evaluateOriginalAngularFixedMotion(motion,.25);
  const again=evaluateOriginalAngularFixedMotion(motion,.75);
  expect(again.pose).toEqual(first.pose);expect(again.contact).toEqual(first.contact);
  const direct=cloneOriginalAngularBody(seed.angular),pivot=advanceOriginalAngularBody({...seed.position},{...seed.velocity},direct,.75);
  expect(first.pose.position).toEqual(pivot);expect(first.pose.angular.orientation).toEqual(direct.orientation);
  expect(JSON.stringify(seed.angular)).toBe(untouched);
 });

 it('deeply captures mutable COM, tensor, hull and triangles and survives cache eviction',()=>{
  const hull=cube(),base=createOriginalAngularBody(hull,1),COM={...base.centerOfMass},tensor={...base.inverseInertia};
  const angular:OriginalAngularBody={...base,centerOfMass:COM,inverseInertia:tensor,referenceConvex:hull};angular.angularVelocity=at(0,0,30);
  const triangle=[...floor.map(v=>({...v}))] as [Vec3,Vec3,Vec3];
  const seed=input({angular,triangles:[{id:'floor',triangle}]}),motion=captureOriginalAngularFixedMotion(seed),before=evaluateOriginalAngularFixedMotion(motion,.5);
  COM.x=9;tensor.xx=999;hull.vertices[0].x=100;triangle[0].y=50;angular.orientation.z=.4;angular.angularVelocity.z=200;
  expect(motion.angular.centerOfMass.x).not.toBe(COM.x);expect(motion.angular.referenceConvex.vertices[0].x).toBe(-1);
  const evict=cloneOriginalAngularBody(motion.angular);advanceOriginalAngularBody({...motion.position},{...motion.velocity},evict,.9);originalAngularConvex(evict);
  expect(evaluateOriginalAngularFixedMotion(motion,.5)).toEqual(before);
  expect(Object.isFrozen(motion.angular.inverseInertia)).toBe(true);expect(Object.isFrozen(motion.angular.referenceConvex.faces![0])).toBe(true);
 });

 it('cannot bypass an unresolved early cell to emit a known real later hit',()=>{
  const seed=input();seed.angular.angularVelocity.z=90;const saved=JSON.stringify(seed),motion=captureOriginalAngularFixedMotion(seed);
  expect(evaluateOriginalAngularFixedMotion(motion,.5).contact).not.toBeNull();
  const result=planOriginalAngularFixedMotion(motion,()=>({kind:'unresolved'}),{cells:1,evaluations:2});
  expect(result.kind).toBe('unresolved');if(result.kind!=='unresolved')throw Error('expected unresolved');
  expect(result.reason).toBe('cell-cap');expect(result.cell.lo).toBe(0);expect(result.stats.evaluations).toBe(1);
  expect(JSON.stringify(seed)).toBe(saved);
 });

 it('invalidates a proposal when the oracle changes the scene revision',()=>{
  let revision=1;const motion=captureOriginalAngularFixedMotion(input({sceneRevision:()=>revision}));
  const result=planOriginalAngularFixedMotion(motion,()=>{revision++;return {kind:'excluded',proof:'stale receipt'};});
  expect(result.kind).toBe('unresolved');if(result.kind==='unresolved')expect(result.reason).toBe('Stale motion scene revision');
  expect(()=>evaluateOriginalAngularFixedMotion(motion,0)).toThrow('Stale motion scene revision');
 });

 it('queries the actual interval*fraction clock, including a failed tau round trip',()=>{
  const interval=49/1024,tau=1/1024,fraction=tau/interval;
  const motion=captureOriginalAngularFixedMotion(input({interval,position:at(0,4),velocity:at(1)}));
  const trial=evaluateOriginalAngularFixedMotion(motion,fraction);
  expect(trial.pose.duration).toBe(predecessor(tau));expect(trial.pose.duration).not.toBe(tau);
  expect(trial.pose.position.x).toBe(interval*fraction);
 });

 it('retains half-open shared endpoints and resolves an adjacent binary64 contact clock',()=>{
  // Unit cube translates from pivot y3 to y1. For every representable f<1,
  // RN(3-RN(2*f))-1 is strictly positive (minimum2^-52), so the finite
  // floor is separated at T0. This fixture oracle covers whole cells; it
  // does not infer absence from endpoint sampling or extend to rotating hulls.
  const motion=captureOriginalAngularFixedMotion(input({position:at(0,3),velocity:at(0,-2)}));
  expect(evaluateOriginalAngularFixedMotion(motion,predecessor(1)).contact).toBeNull();
  const result=planOriginalAngularFixedMotion(motion,(_saved,cell)=>cell.hi<1||!cell.upperInclusive?{kind:'excluded',proof:'Exact unit-axis translation separation for all included binary64 fractions f<1.'}:{kind:'unresolved'});
  expect(result.kind).toBe('contact');if(result.kind!=='contact')throw Error('expected lattice endpoint contact');
  expect(result.pose.fraction).toBe(1);expect(result.pose.duration).toBe(1);expect(result.contact.triangleId).toBe('floor');
  expect(result.certificates.every(v=>v.cell.hi<1||!v.cell.upperInclusive)).toBe(true);
  expect(result.certificates[result.certificates.length-1]).toMatchObject({cell:{lo:predecessor(1),hi:1,upperInclusive:false},origin:'adjacent-clock-nonhit'});
  expect(result.stats.cells).toBeLessThanOrEqual(ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.cells);
  expect(result.stats.evaluations).toBeLessThanOrEqual(ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.evaluations);
 });

 it('does not require an oracle to exclude a stationary zero-duration nonhit',()=>{
  let calls=0;const motion=captureOriginalAngularFixedMotion(input({interval:0,position:at(0,4)}));
  const result=planOriginalAngularFixedMotion(motion,()=>{calls++;return {kind:'unresolved'};});
  expect(result.kind).toBe('excluded');expect(calls).toBe(0);expect(result.stats.evaluations).toBe(1);
 });

 it('uses actual first-in-array contact and prohibits cap increases',()=>{
  const motion=captureOriginalAngularFixedMotion(input({position:at(0,1),triangles:[{id:'first',triangle:floor},{id:'second',triangle:floor}]}));
  const result=planOriginalAngularFixedMotion(motion,()=>({kind:'unresolved'}));
  expect(result.kind).toBe('contact');if(result.kind==='contact')expect(result.contact.triangleId).toBe('first');
  expect(()=>planOriginalAngularFixedMotion(motion,()=>({kind:'unresolved'}),{cells:ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.cells+1})).toThrow('Planner caps may only be lowered');
 });
});
