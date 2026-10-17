import {describe,expect,it} from 'vitest';
import {advanceOriginalAngularBody,type OriginalAngularBody} from './originalAngularBody';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {encloseOriginalAngularPose,encloseOriginalRotateVector,type OriginalAngularMathContract} from './originalAngularPoseInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';

const input=()=>({position:{x:1,y:2,z:3},COMvelocity:{x:2,y:-1,z:.5},orientation:{x:0,y:0,z:0,w:1},
 angularVelocity:{x:0,y:0,z:0},centerOfMass:{x:.25,y:.5,z:-.25},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}});
function scalar(a:OriginalFloatBox):number {if(a.lo!==a.hi)throw Error('point-only falsification fixture');return a.lo;}
// Uses actual runtime Math only for point fixtures, as a falsification seam.
// This is deliberately NOT a generic interval Math contract or audited proof.
const pointMath:OriginalAngularMathContract=Object.freeze({tag:'point-only runtime falsification fixture',
 hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),
 sin:(c:OriginalFloatIntervalContext,a:OriginalFloatBox)=>c.point(Math.sin(scalar(a))),cos:(c:OriginalFloatIntervalContext,a:OriginalFloatBox)=>c.point(Math.cos(scalar(a)))});
function expectVector(c:OriginalFloatIntervalContext,v:{x:OriginalFloatBox;y:OriginalFloatBox;z:OriginalFloatBox},p:{x:number;y:number;z:number}):void {
 for(const key of ['x','y','z'] as const)expect(c.contains(v[key],p[key])).toBe(true);
 expect(Object.isFrozen(v)).toBe(true);
}

describe('conditional bounded source angular pose intervals',()=>{
 it('preserves the exact zero-time nonunit incoming tuple and skips inverse inertia',()=>{
  const p=input();p.orientation.w=1+2**-22;p.angularVelocity.x=17;p.inverseInertia.xx=-1;
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalAngularPose(c,p,c.point(0),pointMath);
  expectVector(c,r.pivot,p.position);expectVector(c,r.angularVelocity,p.angularVelocity);expect(r.orientation.w).toEqual({lo:p.orientation.w,hi:p.orientation.w});
  expect(r.midpointIterations).toBe(0);expect(r.mathCalls).toBe(1);expect(r.includesZeroSeconds).toBe(true);
 });
 it('retains no-spin source translation grouping over a whole seconds interval',()=>{
  const p=input();p.inverseInertia.xx=-1;
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalAngularPose(c,p,c.box(0,.5),pointMath);
  expectVector(c,r.pivot,{x:1,y:2,z:3});expectVector(c,r.pivot,{x:2,y:1.5,z:3.25});
  expect(r.pivot.x).toEqual({lo:1,hi:2});expect(r.pivot.y).toEqual({lo:1.5,hi:2});expect(r.midpointIterations).toBe(0);
 });
 it('matches fresh source principal-axis pose, COM placement and stored degrees at point clocks',()=>{
  for(const seconds of [.125,.5,1]){
   const p=input();p.angularVelocity.y=90;
   const state:OriginalAngularBody={orientation:{...p.orientation},angularVelocity:{...p.angularVelocity},centerOfMass:p.centerOfMass,inverseInertia:p.inverseInertia,
    referenceConvex:{vertices:[],faceNormals:[],edgeDirections:[],faces:[]}};
   const actual=advanceOriginalAngularBody(p.position,p.COMvelocity,state,seconds),c=new OriginalFloatIntervalContext(),r=encloseOriginalAngularPose(c,p,c.point(seconds),pointMath);
   expectVector(c,r.pivot,actual);expectVector(c,r.angularVelocity,state.angularVelocity);
   for(const key of ['x','y','z','w'] as const)expect(c.contains(r.orientation[key],state.orientation[key])).toBe(true);
   expect(r.mathCalls).toBeLessThanOrEqual(128);expect(r.midpointIterations).toBeGreaterThan(0);expect(r.mathContractVerified).toBe(false);
  }
 });
 it('retains all twelve assign-before-stop alternatives with a sound broad change contract',()=>{
  const p=input();p.angularVelocity.x=Number.MIN_VALUE;p.COMvelocity={x:0,y:0,z:0};p.centerOfMass={x:0,y:0,z:0};
  const contract:OriginalAngularMathContract={...pointMath,tag:'zero-underflow broad-change fixture',hypot:(c,v,purpose)=>{
   // All omega and change coordinates are exactly zero after DEG underflow.
   // Only change is deliberately widened; true Math.hypot value 0 is retained.
   if(purpose==='change'){expect(v.every(a=>a.lo===0&&a.hi===0)).toBe(true);return c.box(0,2e-13);}
   return pointMath.hypot(c,v);
  }};
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalAngularPose(c,p,c.box(0,1),contract);
  expect(r.midpointIterations).toBe(12);expect(r.unknownMidpointStops).toBe(12);expect(r.mathCalls).toBeLessThanOrEqual(128);
  expectVector(c,r.pivot,p.position);expect(c.contains(r.angularVelocity.x,0)).toBe(true);expect(c.contains(r.angularVelocity.x,Number.MIN_VALUE)).toBe(true);
 });
 it('preserves positive half-time underflow and positive zero-angle normalization',()=>{
  const p=input();p.angularVelocity.x=1;p.orientation.w=1+2**-22;p.centerOfMass={x:0,y:0,z:0};
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalAngularPose(c,p,c.point(Number.MIN_VALUE),pointMath);
  expect(r.includesZeroSeconds).toBe(false);expect(r.orientation.w).toEqual({lo:1,hi:1});expect(r.midpointIterations).toBe(1);
 });
 it('snapshots ordinary point inputs and retains callback identities before invocation',()=>{
  const p=input(),contract:OriginalAngularMathContract={...pointMath,hypot:(c,v)=>{
   p.position.x=999;p.COMvelocity.x=999;p.orientation.w=999;p.inverseInertia.xx=999;
   return pointMath.hypot(c,v);
  }};
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalAngularPose(c,p,c.point(.5),contract);expectVector(c,r.pivot,{x:2,y:1.5,z:3.25});
 });
 it('exports the validated grouped rotate graph without assuming exact unit norm',()=>{
  const c=new OriginalFloatIntervalContext(),q=Object.freeze({...originalFloatVectorPoint(c,{x:0,y:0,z:0}),w:c.point(1+2**-22)});
  expectVector(c,encloseOriginalRotateVector(c,q,originalFloatVectorPoint(c,{x:2,y:3,z:4}),pointMath),{x:2,y:3,z:4});
 });
 it('fails missing, throwing or foreign Math contracts and unresolved public quaternion guards',()=>{
  const c=new OriginalFloatIntervalContext(),p=input();
  expect(()=>encloseOriginalAngularPose(c,p,c.point(0),undefined as unknown as OriginalAngularMathContract)).toThrow(UnsupportedFloatInterval);
  expect(()=>encloseOriginalAngularPose(c,p,c.point(0),{...pointMath,hypot:()=>{throw Error('callback');}})).toThrow(/contract-threw/);
  expect(()=>encloseOriginalAngularPose(c,p,c.point(0),{...pointMath,hypot:()=>new OriginalFloatIntervalContext().point(1)})).toThrow(/foreign/);
  expect(()=>encloseOriginalAngularPose(c,p,c.point(0),{...pointMath,hypot:ctx=>ctx.box(.9,1.1)})).toThrow(/public-quaternion/);
 });
 it('rejects invalid inertia, unsafe normalization, overflowing placement and negative durations',()=>{
  const p=input();p.angularVelocity.y=90;p.inverseInertia.xx=-1;
  let c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalAngularPose(c,p,c.point(.5),pointMath)).toThrow(/inertia/);
  p.inverseInertia.xx=1;c=new OriginalFloatIntervalContext();
  const contract:OriginalAngularMathContract={...pointMath,hypot:(ctx,v,purpose)=>purpose==='normalization'?ctx.point(0):pointMath.hypot(ctx,v)};
  expect(()=>encloseOriginalAngularPose(c,p,c.point(.5),contract)).toThrow(/normalization/);
  const translated=input();translated.position.x=Number.MAX_VALUE;translated.COMvelocity.x=Number.MAX_VALUE;c=new OriginalFloatIntervalContext();
  expect(()=>encloseOriginalAngularPose(c,translated,c.point(1),pointMath)).toThrow(UnsupportedFloatInterval);
  c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalAngularPose(c,input(),c.box(-1,0),pointMath)).toThrow(/nonnegative/);
 });
 it('enforces math-call and shared operation caps without resets',()=>{
  const p=input();p.angularVelocity.y=90;let c=new OriginalFloatIntervalContext();
  expect(()=>encloseOriginalAngularPose(c,p,c.point(.5),pointMath,{mathCalls:1})).toThrow(/math-call-cap/);
  c=new OriginalFloatIntervalContext({operations:40});expect(()=>encloseOriginalAngularPose(c,p,c.point(.5),pointMath)).toThrow(/operation-cap/);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(40);
 });
 it('rejects extra enumerable inertia values and required fields hidden from source spread',()=>{
  const sourceAdvance=(p:ReturnType<typeof input>)=>advanceOriginalAngularBody(p.position,p.COMvelocity,{orientation:{...p.orientation},angularVelocity:{...p.angularVelocity},
   centerOfMass:p.centerOfMass,inverseInertia:p.inverseInertia,referenceConvex:{vertices:[],faceNormals:[],edgeDirections:[],faces:[]}},.5);
  for(const extra of [NaN,1]){
   const p=input();p.angularVelocity.y=90;Object.defineProperty(p.inverseInertia,'extra',{value:extra,enumerable:true});
   if(Number.isNaN(extra))expect(()=>sourceAdvance(p)).toThrow(/inertia/);
   else expect(()=>sourceAdvance(p)).not.toThrow(); // Canonical helper policy conservatively rejects this valid source extension.
   const c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalAngularPose(c,p,c.point(.5),pointMath)).toThrow(/canonical-enumerable-inertia/);
  }
  const p=input();p.angularVelocity.y=90;Object.defineProperty(p.inverseInertia,'xx',{value:1,enumerable:false});
  expect(()=>sourceAdvance(p)).toThrow(/inertia/);
  const c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalAngularPose(c,p,c.point(.5),pointMath)).toThrow(/canonical-enumerable-inertia/);
 });
});
