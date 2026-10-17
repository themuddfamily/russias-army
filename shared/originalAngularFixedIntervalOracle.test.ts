import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {createOriginalAngularFixedIntervalOracle} from './originalAngularFixedIntervalOracle';
import {captureOriginalAngularFixedMotion,type OriginalFixedMotionCapture} from './originalAngularFixedMotion';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';

const scalar=(v:OriginalFloatBox)=>{if(v.lo!==v.hi)throw Error('point-only source fixture');return v.lo;};
const contract:OriginalAngularMathContract=Object.freeze({tag:'conditional point-tuple Math fixture',hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});
const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'conditional source root/cache',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
const zero={x:0,y:0,z:0},cell=Object.freeze({lo:0,hi:1,upperInclusive:true});
const reference=()=>({vertices:[zero,{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}]});
const triangle=(x:number)=>[{x,y:-4,z:-4},{x,y:4,z:-4},{x,y:0,z:4}] as const;
function capture(xs=[10],interval=1,revision:()=>unknown=()=>1){return captureOriginalAngularFixedMotion({position:zero,velocity:{x:1,y:0,z:0},interval,contactDistance:.1,sceneRevision:revision,
 angular:{orientation:{x:0,y:0,z:0,w:1},angularVelocity:zero,centerOfMass:zero,inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0},referenceConvex:reference()},triangles:xs.map((x,i)=>({id:`triangle-${i}`,triangle:triangle(x)}))});}

describe('conditional all-captured-triangle angular whole-cell oracle',()=>{
 it('covers a full nontrivial linear duration cell and every captured far triangle in one context',()=>{
  const motion=capture([10,20]),provider=createOriginalAngularFixedIntervalOracle(contract,profile),r=provider.inspectCell(motion,cell);
  expect(r.kind).toBe('excluded');expect(r.clock).toEqual({lo:0,hi:1});expect(r.triangleCount).toBe(2);expect(r.certifiedTriangles).toBe(2);expect(r.motion).toBe(motion);
  expect(r.resources!.noBudgetReset).toBe(true);expect(r.mathCalls).toBeLessThanOrEqual(128);expect(r.resources!.chargedOperations).toBeLessThanOrEqual(100000);expect(r.resources!.createdBoxes).toBeLessThanOrEqual(16384);
  const proof=provider.oracle(motion,cell);expect(proof.kind).toBe('excluded');if(proof.kind==='excluded')expect(proof.proof.length).toBeLessThanOrEqual(2048);
  expect('pose' in r).toBe(false);expect('geometry' in r).toBe(false);expect('wrappers' in r).toBe(false);expect(provider.metadata.proofHistoryRetained).toBe(false);
 });
 it('never treats an earlier far triangle proof as exclusion of a later intersecting triangle',()=>{
  const r=createOriginalAngularFixedIntervalOracle(contract,profile).inspectCell(capture([10,.5]),cell);
  expect(r.kind).toBe('unresolved');expect(r.triangleCount).toBe(2);expect(r.certifiedTriangles).toBe(1);expect(r.reason).toBe('captured-triangle-wrapper-unresolved');
 });
 it('uses only represented half-open fractions and the authoritative RN multiply clock',()=>{
  const provider=createOriginalAngularFixedIntervalOracle(contract,profile),predecessor=1-2**-53,motion=capture([10],.05),half=Object.freeze({lo:predecessor,hi:1,upperInclusive:false}),r=provider.inspectCell(motion,half);
  expect(r.kind).toBe('excluded');expect(r.representedHi).toBe(predecessor);expect(r.cell).toEqual(half);expect(r.clock).toEqual({lo:.05*predecessor,hi:.05*predecessor});
  expect(provider.inspectCell(motion,{lo:predecessor,hi:1,upperInclusive:true}).clock!.hi).toBe(.05);
 });
 it('retains numeric-zero source durations for zero interval and positive underflow cells',()=>{
  const provider=createOriginalAngularFixedIntervalOracle(contract,profile),r=provider.inspectCell(capture([10],0),cell);
  expect(r.kind).toBe('excluded');expect(r.clock).toEqual({lo:0,hi:0});
  const tiny=provider.inspectCell(capture([10],Number.MIN_VALUE),{lo:Number.MIN_VALUE,hi:2*Number.MIN_VALUE,upperInclusive:true});expect(tiny.kind).toBe('excluded');expect(tiny.clock).toEqual({lo:0,hi:0});
 });
 it('rejects stale or forged motion identity rather than certifying copied boxes',()=>{
  let epoch=1;const motion=capture([10],1,()=>epoch),provider=createOriginalAngularFixedIntervalOracle(contract,profile);epoch=2;
  expect(provider.inspectCell(motion,cell).kind).toBe('unresolved');expect(provider.oracle(motion,cell)).toEqual({kind:'unresolved'});
  const valid=capture();expect(provider.inspectCell(Object.freeze({...valid}) as OriginalFixedMotionCapture,cell).reason).toMatch(/Stale/);
 });
 it('requires explicit frozen source and callback contracts without default or native attestation',()=>{
  expect(()=>createOriginalAngularFixedIntervalOracle({...contract},profile)).toThrow(/frozen/);
  expect(()=>createOriginalAngularFixedIntervalOracle(contract,{...profile})).toThrow(/frozen/);
  expect(()=>createOriginalAngularFixedIntervalOracle(contract,Object.freeze({...profile,sqrt:'unproved'} as unknown as OriginalSeparatedDistanceSourceProfile))).toThrow(/profile/);
  const p=createOriginalAngularFixedIntervalOracle(contract,profile);expect(p.metadata.sourceProfileAttested).toBe(false);expect(p.metadata.nativeEquivalent).toBe(false);expect(p.metadata.defaultIntegration).toBe(false);expect(p.metadata.continuousTimeCertified).toBe(false);expect(p.metadata.fullFrameClockCertified).toBe(false);
 });
 it('returns unresolved for malformed cells and never reaches callbacks through malformed capture data',()=>{
  let calls=0;const counted=Object.freeze({...contract,hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{calls++;return contract.hypot(c,v);}}),p=createOriginalAngularFixedIntervalOracle(counted,profile),motion=capture();
  for(const bad of [{lo:0,hi:2,upperInclusive:true},{lo:1,hi:0,upperInclusive:true},{lo:.5,hi:.5,upperInclusive:false}])expect(p.inspectCell(motion,bad).kind).toBe('unresolved');
  const bad={...motion};Object.defineProperty(bad,'triangles',{get:()=>motion.triangles});expect(p.inspectCell(bad,cell).reason).toMatch(/accessor/);expect(calls).toBe(0);
 });
 it('retains callback failures, foreign boxes and revision changes as unresolved',()=>{
  const motion=capture(),throwing=Object.freeze({...contract,hypot:()=>{throw Error('bad');}}),foreign=Object.freeze({...contract,hypot:()=>new OriginalFloatIntervalContext().point(1)});
  expect(createOriginalAngularFixedIntervalOracle(throwing,profile).inspectCell(motion,cell).kind).toBe('unresolved');expect(createOriginalAngularFixedIntervalOracle(foreign,profile).inspectCell(motion,cell).kind).toBe('unresolved');
  let epoch=1;const mutable=capture([10],1,()=>epoch),mutation=Object.freeze({...contract,hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{epoch=2;return contract.hypot(c,v);}});
  expect(createOriginalAngularFixedIntervalOracle(mutation,profile).inspectCell(mutable,cell).reason).toMatch(/Stale/);
 });
 it('counts aggregate Math across helpers and triangles and preserves lowerable one-attempt budgets',()=>{
  const motion=capture([10,20]),mathLimit=createOriginalAngularFixedIntervalOracle(contract,profile,{mathCalls:1}).inspectCell(motion,cell);
  expect(mathLimit.kind).toBe('unresolved');expect(mathLimit.mathCalls).toBe(1);expect(mathLimit.reason).toMatch(/aggregate-Math-cap/);
  const work=createOriginalAngularFixedIntervalOracle(contract,profile,{operations:100}).inspectCell(motion,cell);expect(work.kind).toBe('unresolved');expect(work.resources!.chargedOperations).toBeLessThanOrEqual(100);
  expect(createOriginalAngularFixedIntervalOracle(contract,profile,{triangles:1}).inspectCell(motion,cell).kind).toBe('unresolved');expect(()=>createOriginalAngularFixedIntervalOracle(contract,profile,{mathCalls:129})).toThrow(/lowered/);
 });
 it('prevents callback reentry and retains no mutable proof history across attempts',()=>{
  const motion=capture();let nestedReason='';let provider:ReturnType<typeof createOriginalAngularFixedIntervalOracle>;
  const reentry=Object.freeze({...contract,hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{nestedReason=provider.inspectCell(motion,cell).reason;return contract.hypot(c,v);}});
  provider=createOriginalAngularFixedIntervalOracle(reentry,profile);const first=provider.inspectCell(motion,cell);expect(first.kind).toBe('excluded');expect(nestedReason).toBe('fixed-oracle-reentry-unsupported');
  const second=provider.inspectCell(motion,cell);expect(second.kind).toBe('excluded');expect(second.resources).toEqual(first.resources);expect(second).not.toBe(first);
 });
});
