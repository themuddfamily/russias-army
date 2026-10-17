import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {encloseOriginalStationarySatNull} from './originalStationarySatInterval';
import {sweepOriginalConvexTriangle} from './originalConvexSweep';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import {encloseOriginalAngularPose} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import {createOriginalAngularSourceAlternativesInterval,type OriginalAngularSourceAlternativesProfile} from './originalAngularSourceAlternativesInterval';
import type {Vec3} from './protocol';

const cube=()=>({vertices:Array.from({length:8},(_,i)=>({x:i&1?1:0,y:i&2?1:0,z:i&4?1:0})),faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}]});
const triangle=(x:number):[Vec3,Vec3,Vec3]=>[{x,y:-2,z:-2},{x,y:2,z:-2},{x,y:0,z:2}];
const zero={x:0,y:0,z:0};
const boxed=(c:OriginalFloatIntervalContext,h:ReturnType<typeof cube>)=>({vertices:h.vertices.map(v=>originalFloatVectorPoint(c,v)),faceNormals:h.faceNormals.map(v=>originalFloatVectorPoint(c,v)),edgeDirections:h.edgeDirections.map(v=>originalFloatVectorPoint(c,v))});
const scalar=(a:OriginalFloatBox)=>{if(a.lo!==a.hi)throw Error('point-only fixture');return a.lo;};
const pointMath:OriginalAngularMathContract=Object.freeze({tag:'point-only SAT falsification fixture',hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});

describe('conditional whole-cell stationary SAT null only',()=>{
 it('certifies separated source point inputs and agrees with actual stationary sweep',()=>{
  const c=new OriginalFloatIntervalContext(),h=cube(),t=triangle(5),r=encloseOriginalStationarySatNull(c,boxed(c,h),originalFloatVectorPoint(c,zero),t,pointMath);
  expect(r.certifiedNull).toBe(true);expect(r.separatorIndex).toBe(0);expect(r.constructedAxes).toBe(13);expect(r.mathCalls).toBe(1);
  expect(sweepOriginalConvexTriangle(h,zero,zero,t)).toBeNull();expect(r.positiveSkinWrapperCertified).toBe(false);
 });
 it('returns unresolved for source overlap and touching without reconstructing contact',()=>{
  for(const x of [.5,1]){const c=new OriginalFloatIntervalContext(),h=cube(),t=triangle(x),r=encloseOriginalStationarySatNull(c,boxed(c,h),originalFloatVectorPoint(c,zero),t,pointMath);
   expect(r.certifiedNull).toBe(false);expect(r.contactReconstructed).toBe(false);expect(sweepOriginalConvexTriangle(h,zero,zero,t)).not.toBeNull();
  }
 });
 it('retains the source degenerate-triangle return before Math or eager cross construction',()=>{
  const c=new OriginalFloatIntervalContext(),t:[Vec3,Vec3,Vec3]=[{x:5,y:0,z:0},{x:6,y:0,z:0},{x:7,y:0,z:0}],r=encloseOriginalStationarySatNull(c,boxed(c,cube()),originalFloatVectorPoint(c,zero),t,pointMath);
  expect(r.certifiedNull).toBe(true);expect(r.constructedAxes).toBe(0);expect(r.mathCalls).toBe(0);expect(r.reason).toMatch(/degenerate/);
 });
 it('rejects nonfinite eager crosses before a usable early separating face axis',()=>{
  const c=new OriginalFloatIntervalContext(),h=cube();h.edgeDirections=[{x:0,y:Number.MAX_VALUE,z:0}];
  expect(()=>encloseOriginalStationarySatNull(c,boxed(c,h),originalFloatVectorPoint(c,zero),triangle(5),pointMath)).toThrow(UnsupportedFloatInterval);
 });
 it('retains skip/use uncertainty and reaches a later universally used separator',()=>{
  const c=new OriginalFloatIntervalContext(),h=cube();h.faceNormals[0].x=1e-12;
  const contract:OriginalAngularMathContract=Object.freeze({...pointMath,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>scalar(v[0])===1e-12&&scalar(v[1])===0&&scalar(v[2])===0?ctx.box(.5e-12,1.5e-12):pointMath.hypot(ctx,v)});
  const r=encloseOriginalStationarySatNull(c,boxed(c,h),originalFloatVectorPoint(c,zero),triangle(5),contract);
  expect(r.certifiedNull).toBe(true);expect(r.unknownAxisSkips).toBe(1);expect(r.separatorIndex).toBe(3);
 });
 it('does not bypass errors on an unresolved earlier skip path',()=>{
  const c=new OriginalFloatIntervalContext(),h=cube();h.faceNormals[0].x=1e-12;
  const contract:OriginalAngularMathContract=Object.freeze({...pointMath,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{
   if(scalar(v[0])===1e-12)return ctx.box(.5e-12,1.5e-12);throw Error('later reachable Math failure');
  }});
  expect(()=>encloseOriginalStationarySatNull(c,boxed(c,h),originalFloatVectorPoint(c,zero),triangle(5),contract)).toThrow(/contract-threw/);
 });
 it('preserves local dot extrema followed by separately rounded pivot dot addition',()=>{
  const c=new OriginalFloatIntervalContext(),huge=2**53,h={vertices:[0,.125,.25,.375].map(y=>({x:huge,y,z:0})),faceNormals:[{x:.6,y:.8,z:0}],edgeDirections:[{x:0,y:0,z:1}]},pivot={x:-huge,y:1,z:0};
  const t:[Vec3,Vec3,Vec3]=[{x:0,y:1.125,z:0},{x:.125,y:1,z:0},{x:0,y:1.125,z:.125}];
  const r=encloseOriginalStationarySatNull(c,boxed(c,h),originalFloatVectorPoint(c,pivot),t,pointMath);
  expect(r.certifiedNull).toBe(true);expect(r.separatorIndex).toBe(0);expect(sweepOriginalConvexTriangle(h,pivot,pivot,t)).toBeNull();
  const separate=(.6*huge)+(.6*(-huge)+.8),reassociated=.6*(huge-huge)+.8;
  expect(separate).toBe(1);expect(reassociated).toBe(.8);expect(separate).toBeGreaterThan(.9);expect(reassociated).toBeLessThan(.9);
 });
 it('snapshots local populations and triangle before a Math callback mutates caller records',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c,cube()),t=triangle(5),contract:OriginalAngularMathContract=Object.freeze({...pointMath,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{
   h.vertices[0]=originalFloatVectorPoint(ctx,{x:999,y:999,z:999});t[0].x=-999;return pointMath.hypot(ctx,v);
  }});
  expect(encloseOriginalStationarySatNull(c,h,originalFloatVectorPoint(c,zero),t,contract).certifiedNull).toBe(true);
 });
 it('composes .05 nonpoint pose/local geometry and a far fixed triangle under both explicit source alternatives',()=>{
  const hypotProfile=Object.freeze({tag:'conditional hypot fixture',hypotDispatch:'3-fast-4-slow-kahan' as const,arithmetic:'separate-rn-binary64-gradual-underflow' as const,sqrt:'correctly-rounded-binary64-Float64Sqrt' as const,tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27' as const});
  const profile:OriginalAngularSourceAlternativesProfile=Object.freeze({tag:'unattested alternatives SAT fixture',trigAlternatives:'retained-fdlibm-or-glibc-unreduced',
   fdlibmProfile:Object.freeze({tag:'fdlibm fixture',trig:'retained-fdlibm-unreduced-iy0-y0',arithmetic:'separate-rn-binary64-gradual-underflow',hypotProfile}),
   glibcProfile:Object.freeze({tag:'glibc fixture',trig:'retained-glibc-unreduced-taylor-table',arithmetic:'separate-rn-binary64-gradual-underflow',decimalLiterals:'correctly-rounded-binary64-coefficient-translation',tableABI:'binary64-int4-lowword-source-table',hypotProfile})});
  const contract=createOriginalAngularSourceAlternativesInterval(profile).contract,c=new OriginalFloatIntervalContext();
  const saved={position:zero,COMvelocity:{x:1,y:0,z:0},orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:90,z:0},centerOfMass:{x:0,y:0,z:0},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}};
  const pose=encloseOriginalAngularPose(c,saved,c.box(.05,.05+2**-40),contract),reference={...cube(),faces:[[0,1,2],[1,2,3],[0,3,4],[0,4,5]] as [number,number,number][]};
  const geometry=encloseOriginalAngularGeometry(c,reference,pose.orientation,contract),r=encloseOriginalStationarySatNull(c,geometry,pose.pivot,triangle(100),contract);
  expect(r.certifiedNull).toBe(true);expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);
 });
 it('rejects foreign/malformed inputs and absent, mutable or invalid Math contracts',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c,cube()),pivot=originalFloatVectorPoint(c,zero);
  expect(()=>encloseOriginalStationarySatNull(c,h,{...pivot,x:new OriginalFloatIntervalContext().point(0)},triangle(5),pointMath)).toThrow(/foreign/);
  expect(()=>encloseOriginalStationarySatNull(c,{...h,vertices:h.vertices.slice(0,3)},pivot,triangle(5),pointMath)).toThrow(UnsupportedFloatInterval);
  expect(()=>encloseOriginalStationarySatNull(c,h,pivot,triangle(5),{...pointMath})).toThrow(/frozen/);
  const foreign:OriginalAngularMathContract=Object.freeze({...pointMath,hypot:()=>new OriginalFloatIntervalContext().point(1)});
  expect(()=>encloseOriginalStationarySatNull(c,h,pivot,triangle(5),foreign)).toThrow(/foreign/);
 });
 it('stops lowerable axes, Math and shared scalar budgets without resets',()=>{
  let c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalStationarySatNull(c,boxed(c,cube()),originalFloatVectorPoint(c,zero),triangle(5),pointMath,{axes:2})).toThrow(/axis-cap/);
  c=new OriginalFloatIntervalContext();const h=cube();h.faceNormals.reverse();expect(()=>encloseOriginalStationarySatNull(c,boxed(c,h),originalFloatVectorPoint(c,zero),triangle(5),pointMath,{mathCalls:1})).toThrow(/math-call-cap/);
  c=new OriginalFloatIntervalContext({operations:150});const boxes=boxed(c,cube()),pivot=originalFloatVectorPoint(c,zero);expect(()=>encloseOriginalStationarySatNull(c,boxes,pivot,triangle(5),pointMath)).toThrow(/operation-cap/);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(150);
 });
});
