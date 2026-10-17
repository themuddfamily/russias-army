import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {encloseOriginalTriangleFeaturePreparation} from './originalFeaturePreparationInterval';
import {encloseOriginalSeparatedDistance,type OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';

// Count actual proof-helper invocations, not source Math.sqrt calls or runtime
// attestations. All computation and ownership still belong to this ONE context.
class RootObservationContext extends OriginalFloatIntervalContext {
 readonly rootInputs:OriginalFloatBox[]=[];
 override sqrtReal(input:OriginalFloatBox):OriginalFloatBox {
  this.rootInputs.push(input);return super.sqrtReal(input);
 }
}
const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'conditional source root-reuse fixture',
 arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
const point=(c:OriginalFloatIntervalContext,x:number,y:number,z:number)=>originalFloatVectorPoint(c,{x,y,z});
const tri=(c:OriginalFloatIntervalContext,z:number)=>encloseOriginalTriangleFeaturePreparation(c,[point(c,0,0,z),point(c,1,0,z),point(c,0,1,z)]);

describe('separated-distance SAME winning value root reuse',()=>{
 it('uses only the global distance root for universally positive best with multiple optional winners',()=>{
  const c=new RootObservationContext(),base=tri(c,0),optional=point(c,0,0,.75);
  const a={...base,vertices:[optional,...base.vertices],vertexMembership:['maybe','always','always','always'] as const,
   vertexBounds:{...base.vertexBounds,maxZ:c.box(0,.75)}};
  const r=encloseOriginalSeparatedDistance(c,a,tri(c,1),point(c,0,0,0),0,profile);
  expect(r.best).toEqual({lo:.0625,hi:1});expect(r.distance).toEqual({lo:.25,hi:1});
  expect(r.possibleWinnerIds).toContain(1);expect(r.possibleWinnerIds.length).toBeGreaterThan(1);
  expect(c.rootInputs).toHaveLength(1);expect(c.rootInputs[0]).toBe(r.best);
  // Whether the optional point is present or absent, the actual positive
  // winning normal is -Z. A broader normal box is allowed after root reuse.
  expect(c.contains(r.normal.z,-1)).toBe(true);expect(r.witnessPresence).toBe('always');
  expect(r.stationaryAdvanceNullCertified).toBe(true);expect(r.fullWrapperCertified).toBe(false);
  expect(c.resources().noBudgetReset).toBe(true);expect(c.resources().runtimeMathSqrtCertified).toBe(false);
 });
 it('retains extra positive-domain roots when the global best includes zero',()=>{
  const c=new RootObservationContext(),base=tri(c,0),optional=point(c,0,0,1);
  const a={...base,vertices:[optional,...base.vertices],vertexMembership:['maybe','always','always','always'] as const,
   vertexBounds:{...base.vertexBounds,maxZ:c.box(0,1)}};
  const r=encloseOriginalSeparatedDistance(c,a,tri(c,1),point(c,0,0,0),0,profile);
  expect(r.best).toEqual({lo:0,hi:1});expect(r.distance).toEqual({lo:0,hi:1});
  expect(r.possibleWinnerIds.length).toBeGreaterThan(1);expect(c.rootInputs.length).toBeGreaterThan(1);
  expect(c.rootInputs[0]).toBe(r.best);
  for(const positive of c.rootInputs.slice(1)){
   expect(positive.lo).toBeGreaterThanOrEqual(Number.MIN_VALUE);expect(positive.hi).toBeLessThanOrEqual(r.best.hi);
  }
  // Optional coincident point gives numeric zero/absent witnesses; without it,
  // the first mandatory vertex gives positive distance and the -Z normal.
  expect(r.witnessPresence).toBe('maybe');expect(c.contains(r.normal.z,0)).toBe(true);expect(c.contains(r.normal.z,-1)).toBe(true);
  expect(r.directThreshold).toBe('unknown');expect(r.gapThreshold).toBe('unknown');
  expect(r.stationaryAdvanceNullCertified).toBe(false);expect(r.fullWrapperCertified).toBe(false);
 });
 it('keeps the exact-zero branch without any positive-domain root or returned witnesses',()=>{
  const c=new RootObservationContext(),a=tri(c,0),r=encloseOriginalSeparatedDistance(c,a,a,point(c,0,0,0),0,profile);
  expect(r.best).toEqual({lo:0,hi:0});expect(r.distance).toEqual({lo:0,hi:0});
  expect(c.rootInputs).toHaveLength(1);expect(c.rootInputs[0]).toBe(r.best);
  expect(r.normal).toEqual({x:{lo:0,hi:0},y:{lo:0,hi:0},z:{lo:0,hi:0}});
  expect(r.witnessPresence).toBe('never');expect(r.witnessA).toBeUndefined();expect(r.witnessB).toBeUndefined();
  expect(r.directThreshold).toBe('true');expect(r.gapThreshold).toBe('true');expect(r.stationaryAdvanceNullCertified).toBe(false);
 });
});
