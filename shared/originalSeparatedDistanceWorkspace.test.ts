import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {encloseOriginalTriangleFeaturePreparation} from './originalFeaturePreparationInterval';
import {createOriginalSeparatedDistanceWorkspace,encloseOriginalSeparatedDistance,type OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';

const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'private hull workspace fixture',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
const point=(c:OriginalFloatIntervalContext,x:number,y:number,z:number)=>originalFloatVectorPoint(c,{x,y,z});
const tri=(c:OriginalFloatIntervalContext,z:number)=>encloseOriginalTriangleFeaturePreparation(c,[point(c,0,0,z),point(c,1,0,z),point(c,0,1,z)]);
function setup(){const c=new OriginalFloatIntervalContext(),a=tri(c,0),b=tri(c,1),offset=point(c,0,0,0);return {c,a,b,offset};}

describe('private validated separated-distance hull workspace',()=>{
 it('matches the fresh public entry result and first-use charge counters',()=>{
  const fresh=setup(),r=encloseOriginalSeparatedDistance(fresh.c,fresh.a,fresh.b,fresh.offset,.5,profile),shared=setup();
  const workspace=createOriginalSeparatedDistanceWorkspace(shared.c,shared.a,profile),s=workspace.encloseTriangle(shared.b,shared.offset,.5);
  expect(s).toEqual(r);expect(shared.c.resources()).toEqual(fresh.c.resources());
  expect(Object.isFrozen(workspace)).toBe(true);expect(workspace.metadata.callerPreparedDataAccepted).toBe(false);
  expect(workspace.metadata.retainedHullGraphs).toBe(1);expect(workspace.metadata.resultMemoization).toBe(false);
  expect(shared.c.resources().capturedSeparatedHullRecords).toBe(1);
 });
 it('captures the hull once while every later triangle and threshold remains fresh',()=>{
  const {c,a,b,offset}=setup(),input={...a,vertices:[...a.vertices],triangleBounds:[...a.triangleBounds],vertexMembership:['always','always','always'] as const};
  const workspace=createOriginalSeparatedDistanceWorkspace(c,input,profile),first=workspace.encloseTriangle(b,offset,.5);
  input.vertices[0]=point(c,99,99,99);input.coordinateSquared=new OriginalFloatIntervalContext().point(99);
  const later=workspace.encloseTriangle(tri(c,2),offset,.5);
  expect(first.best).toEqual({lo:1,hi:1});expect(later.best).toEqual({lo:4,hi:4});expect(later.stationaryAdvanceNullCertified).toBe(true);
  expect(workspace.encloseTriangle(b,offset,1).directThreshold).toBe('true');
  expect(workspace.encloseTriangle(a,offset,0).witnessPresence).toBe('never');
  expect(c.resources().capturedSeparatedHullRecords).toBe(1);
 });
 it('revalidates later B and offset ownership and never accepts a prepared flag',()=>{
  const {c,a,b,offset}=setup(),workspace=createOriginalSeparatedDistanceWorkspace(c,a,profile);workspace.encloseTriangle(b,offset,.1);
  const foreign=new OriginalFloatIntervalContext();
  expect(()=>workspace.encloseTriangle({...b,coordinateSquared:foreign.point(1)},offset,.1)).toThrow(/foreign/);
  expect(()=>workspace.encloseTriangle(b,point(foreign,0,0,0),.1)).toThrow(/foreign/);
  expect(()=>workspace.encloseTriangle({prepared:true} as unknown as typeof b,offset,.1)).toThrow(/accessors/);
  expect(workspace.encloseTriangle(b,offset,.1).best).toEqual({lo:1,hi:1});
 });
 it('rejects caller accessors without executing them on reused B',()=>{
  const {c,a,b,offset}=setup(),workspace=createOriginalSeparatedDistanceWorkspace(c,a,profile);let calls=0;
  const bad={...b};Object.defineProperty(bad,'vertices',{get:()=>{calls++;return b.vertices;}});
  expect(()=>workspace.encloseTriangle(bad,offset,.1)).toThrow(/accessors/);expect(calls).toBe(0);
  const vertex={...b.vertices[0]};Object.defineProperty(vertex,'x',{get:()=>{calls++;return b.vertices[0].x;}});
  expect(()=>workspace.encloseTriangle({...b,vertices:[vertex,...b.vertices.slice(1)]},offset,.1)).toThrow(/accessors/);expect(calls).toBe(0);
 });
 it('rejects late owned-box accessors before warmed opt-in vector and bounds snapshot lookup',()=>{
  const c=new OriginalFloatIntervalContext({},Object.freeze({primitiveProofReuse:true})),a=tri(c,0),b=tri(c,1),offset=point(c,0,0,0),workspace=createOriginalSeparatedDistanceWorkspace(c,a,profile);
  const first=workspace.encloseTriangle(b,offset,.1);expect(first.best).toEqual({lo:1,hi:1});let calls=0;
  const badOffset={...offset};Object.defineProperty(badOffset,'z',{get:()=>{calls++;return offset.z;}});
  expect(()=>workspace.encloseTriangle(b,badOffset,.1)).toThrow(/accessors/);expect(calls).toBe(0);
  const badBounds={...b.vertexBounds};Object.defineProperty(badBounds,'maxZ',{get:()=>{calls++;return b.vertexBounds.maxZ;}});
  expect(()=>workspace.encloseTriangle({...b,vertexBounds:badBounds},offset,.1)).toThrow(/accessors/);expect(calls).toBe(0);
  expect(workspace.encloseTriangle(b,offset,.1).best).toEqual(first.best);expect(c.resources().noBudgetReset).toBe(true);
 });
 it('retains fixed pair limits and shared cumulative operation accounting after failures',()=>{
  const {c,a,b,offset}=setup(),limits={featurePairs:1},workspace=createOriginalSeparatedDistanceWorkspace(c,a,profile,limits);
  limits.featurePairs=1024;
  const before=c.resources().chargedOperations;expect(()=>workspace.encloseTriangle(b,offset,.1)).toThrow(/feature-pair-cap/);
  const after=c.resources().chargedOperations;expect(after).toBeGreaterThan(before);
  expect(()=>workspace.encloseTriangle(b,offset,.1)).toThrow(/feature-pair-cap/);expect(c.resources().chargedOperations).toBeGreaterThan(after);
  expect(()=>createOriginalSeparatedDistanceWorkspace(c,a,profile,{vertices:513})).toThrow(/only-be-lowered/);
  expect(c.resources().noBudgetReset).toBe(true);
 });
 it('guards reentry and releases its busy state after rejected nested work',()=>{
  const {c,a,b,offset}=setup(),workspace=createOriginalSeparatedDistanceWorkspace(c,a,profile),original=c.hull.bind(c);let probed=false;
  c.hull=(x:OriginalFloatBox,y:OriginalFloatBox)=>{
   if(!probed){probed=true;expect(()=>workspace.encloseTriangle(b,offset,.1)).toThrow(/workspace-reentry/);}
   return original(x,y);
  };
  expect(workspace.encloseTriangle(b,offset,.1).best).toEqual({lo:1,hi:1});c.hull=original;
  expect(workspace.encloseTriangle(b,offset,.1).best).toEqual({lo:1,hi:1});
 });
 it('rejects bad construction inputs and preserves public profile/tolerance validation before capture',()=>{
  const {c,a,b,offset}=setup();
  expect(()=>createOriginalSeparatedDistanceWorkspace(c,a,{...profile})).toThrow(/frozen/);
  expect(()=>createOriginalSeparatedDistanceWorkspace(c,{...a,coordinateSquared:new OriginalFloatIntervalContext().point(0)},profile)).toThrow(/foreign/);
  const bad={...a};Object.defineProperty(bad,'vertices',{get:()=>{throw Error('must not execute');}});
  expect(()=>encloseOriginalSeparatedDistance(c,bad,b,offset,-1,profile)).toThrow(/nonnegative/);
  expect(()=>encloseOriginalSeparatedDistance(c,bad,b,offset,.1,{...profile})).toThrow(/frozen/);
 });
});
