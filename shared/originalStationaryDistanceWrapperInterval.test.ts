import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {encloseOriginalStationaryDistanceWrapperNull} from './originalStationaryDistanceWrapperInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
import type {Vec3} from './protocol';

const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'conditional wrapper source fixture',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
const scalar=(v:OriginalFloatBox)=>{if(v.lo!==v.hi)throw Error('point-only falsification contract');return v.lo;};
const math:OriginalAngularMathContract=Object.freeze({tag:'point-only source Math falsification',hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});
const zero={x:0,y:0,z:0};
const raw=()=>({vertices:[zero,{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}]});
const boxed=(c:OriginalFloatIntervalContext,h=raw())=>({vertices:h.vertices.map(v=>originalFloatVectorPoint(c,v)),faces:h.faces,faceNormals:h.faceNormals.map(v=>originalFloatVectorPoint(c,v)),edgeDirections:h.edgeDirections.map(v=>originalFloatVectorPoint(c,v))});
const triangle=(x=3):readonly [Vec3,Vec3,Vec3]=>[{x,y:-4,z:-4},{x,y:4,z:-4},{x,y:0,z:4}];

describe('conditional full stationary triangle distance wrapper null',()=>{
 it('composes the complete positive-skin source path and agrees with an actual point falsification',()=>{
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalStationaryDistanceWrapperNull(c,boxed(c),originalFloatVectorPoint(c,zero),triangle(),.1,math,profile);
  expect(r.conditionalFullWrapperNullCertified).toBe(true);expect(r.outerZero).toBe('false');expect(r.preparationCalls).toBe(1);expect(r.actualSatReused).toBe(true);
  expect(r.evaluateZeroOffsetIdentity).toBe(true);expect(r.closingFiniteZero).toBe(true);expect(r.distance!.stationaryAdvanceNullCertified).toBe(true);
  expect(r.distance!.distance).toEqual({lo:2,hi:2});expect(r.mathCalls).toBe(6);expect(r.nativeEquivalent).toBe(false);expect(r.defaultIntegration).toBe(false);
  expect(sweepOriginalConvexTriangleDistance(raw(),zero,zero,triangle(),.1)).toBeNull();
 });
 it('dispatches zero skin directly to SAT without faces, outer hypot or feature preparation',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c),{faces:_faces,...withoutFaces}=h;void _faces;
  const r=encloseOriginalStationaryDistanceWrapperNull(c,withoutFaces,originalFloatVectorPoint(c,zero),triangle(),0,math,profile);
  expect(r.conditionalFullWrapperNullCertified).toBe(true);expect(r.outerZero).toBeUndefined();expect(r.preparationCalls).toBe(0);expect(r.mathCalls).toBe(1);expect(r.distance).toBeUndefined();
 });
 it('retains the positive outer-degenerate return before shape feature guards',()=>{
  const c=new OriginalFloatIntervalContext(),t=[zero,{x:1,y:0,z:0},{x:2,y:0,z:0}] as const,r=encloseOriginalStationaryDistanceWrapperNull(c,{vertices:[],faceNormals:[],edgeDirections:[]},originalFloatVectorPoint(c,zero),t,.1,math,profile);
  expect(r.conditionalFullWrapperNullCertified).toBe(true);expect(r.outerZero).toBe('true');expect(r.mathCalls).toBe(1);expect(r.preparationCalls).toBe(0);expect(r.initialSat).toBeUndefined();
 });
 it('keeps an unknown outer zero branch and proves the entire positive continuation',()=>{
  const c=new OriginalFloatIntervalContext();let calls=0;const broad:OriginalAngularMathContract=Object.freeze({...math,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{calls++;const exact=Math.hypot(...v.map(scalar));return calls===1?ctx.box(0,exact):ctx.point(exact);}});
  const r=encloseOriginalStationaryDistanceWrapperNull(c,boxed(c),originalFloatVectorPoint(c,zero),triangle(),.1,broad,profile);
  expect(r.outerZero).toBe('unknown');expect(r.conditionalFullWrapperNullCertified).toBe(true);expect(r.preparationCalls).toBe(1);expect(calls).toBe(r.mathCalls);
 });
 it('does not replace an unresolved initial SAT with favorable distance exclusion',()=>{
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalStationaryDistanceWrapperNull(c,boxed(c),originalFloatVectorPoint(c,zero),triangle(.5),.01,math,profile);
  expect(r.conditionalFullWrapperNullCertified).toBe(false);expect(r.reason).toBe('initial-SAT-null-unresolved');expect(r.distance).toBeUndefined();expect(r.actualSatReused).toBe(false);
 });
 it('retains threshold equality and positive skin admission as unresolved rather than null',()=>{
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalStationaryDistanceWrapperNull(c,boxed(c),originalFloatVectorPoint(c,zero),triangle(),2,math,profile);
  expect(r.initialSat!.certifiedNull).toBe(true);expect(r.distance!.directThreshold).toBe('true');expect(r.conditionalFullWrapperNullCertified).toBe(false);expect(r.closingFiniteZero).toBe(false);
  expect(sweepOriginalConvexTriangleDistance(raw(),zero,zero,triangle(),2)).not.toBeNull();
 });
 it('encloses a nonpoint stationary pivot and reuses only the same captured actual SAT inputs',()=>{
  const c=new OriginalFloatIntervalContext(),pivot=Object.freeze({x:c.box(0,2**-40),y:c.point(0),z:c.point(0)}),r=encloseOriginalStationaryDistanceWrapperNull(c,boxed(c),pivot,triangle(),.1,math,profile);
  expect(r.conditionalFullWrapperNullCertified).toBe(true);expect(r.distance!.distance.lo).toBeLessThan(2);expect(c.contains(r.distance!.distance,2)).toBe(true);expect(r.sameActualFromToRequired).toBe(true);
 });
 it('captures all geometry, topology, triangle and callback identities before the first callback',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c),t=triangle().map(v=>({...v})) as [Vec3,Vec3,Vec3];let calls=0;
  const mutation:OriginalAngularMathContract=Object.freeze({...math,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{if(calls++===0){h.vertices[1]=originalFloatVectorPoint(ctx,{x:99,y:0,z:0});h.faces[0][0]=99;t[0].x=.5;}return math.hypot(ctx,v);}});
  const r=encloseOriginalStationaryDistanceWrapperNull(c,h,originalFloatVectorPoint(c,zero),t,.1,mutation,profile);expect(r.conditionalFullWrapperNullCertified).toBe(true);expect(r.distance!.distance).toEqual({lo:2,hi:2});
 });
 it('rejects nonfinite contact validation, accessors, foreign Math boxes and throwing contracts',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c),p=originalFloatVectorPoint(c,zero);
  expect(()=>encloseOriginalStationaryDistanceWrapperNull(c,h,p,triangle(),-1,math,profile)).toThrow(UnsupportedFloatInterval);
  expect(()=>encloseOriginalStationaryDistanceWrapperNull(c,h,p,[{x:Infinity,y:0,z:0},zero,zero],.1,math,profile)).toThrow(/finite/);
  const bad={...h};Object.defineProperty(bad,'faces',{get:()=>h.faces});expect(()=>encloseOriginalStationaryDistanceWrapperNull(c,bad,p,triangle(),.1,math,profile)).toThrow(/accessor/);
  const foreign=Object.freeze({...math,hypot:()=>new OriginalFloatIntervalContext().point(1)});expect(()=>encloseOriginalStationaryDistanceWrapperNull(c,h,p,triangle(),.1,foreign,profile)).toThrow(/foreign/);
  const throwing=Object.freeze({...math,hypot:()=>{throw Error('callback');}});expect(()=>encloseOriginalStationaryDistanceWrapperNull(c,h,p,triangle(),.1,throwing,profile)).toThrow(/contract-threw/);
 });
 it('enforces one wrapper Math cap and lowerable shared work caps without resetting',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c),p=originalFloatVectorPoint(c,zero);let calls=0;const counted=Object.freeze({...math,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{calls++;return math.hypot(ctx,v);}});
  expect(()=>encloseOriginalStationaryDistanceWrapperNull(c,h,p,triangle(),.1,counted,profile,{mathCalls:1})).toThrow(/wrapper-Math-call-cap/);expect(calls).toBe(1);
  expect(()=>encloseOriginalStationaryDistanceWrapperNull(c,h,p,triangle(),.1,math,profile,{featurePairs:1})).toThrow(/feature-pair-cap/);
  expect(()=>encloseOriginalStationaryDistanceWrapperNull(c,h,p,triangle(),.1,math,profile,{mathCalls:129})).toThrow(/only-be-lowered/);expect(c.resources().noBudgetReset).toBe(true);
 });
});
