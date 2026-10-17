import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {encloseOriginalTriangleFeaturePreparation,encloseOriginalFeaturePreparation} from './originalFeaturePreparationInterval';
import {encloseOriginalSeparatedDistance,type OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';
import {createOriginalAngularSourceAlternativesInterval} from './originalAngularSourceAlternativesInterval';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';

const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'conditional source separated leaf fixture',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
const point=(c:OriginalFloatIntervalContext,x:number,y:number,z:number)=>originalFloatVectorPoint(c,{x,y,z});
const tri=(c:OriginalFloatIntervalContext,z:number)=>encloseOriginalTriangleFeaturePreparation(c,[point(c,0,0,z),point(c,1,0,z),point(c,0,1,z)]);
const hypotProfile=Object.freeze({tag:'hypot source fixture',hypotDispatch:'3-fast-4-slow-kahan' as const,arithmetic:'separate-rn-binary64-gradual-underflow' as const,sqrt:'correctly-rounded-binary64-Float64Sqrt' as const,tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27' as const});
const provider=createOriginalAngularSourceAlternativesInterval(Object.freeze({tag:'source alternatives fixture',trigAlternatives:'retained-fdlibm-or-glibc-unreduced',
 fdlibmProfile:Object.freeze({tag:'fdlibm',trig:'retained-fdlibm-unreduced-iy0-y0',arithmetic:'separate-rn-binary64-gradual-underflow',hypotProfile}),
 glibcProfile:Object.freeze({tag:'glibc',trig:'retained-glibc-unreduced-taylor-table',arithmetic:'separate-rn-binary64-gradual-underflow',decimalLiterals:'correctly-rounded-binary64-coefficient-translation',tableABI:'binary64-int4-lowword-source-table',hypotProfile})}));

describe('complete conditional separatedDistance interval leaf',()=>{
 it('preserves all three loops and earlier strict-equality witness ties',()=>{
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalSeparatedDistance(c,tri(c,0),tri(c,1),point(c,0,0,0),.5,profile);
  expect(r.featurePairs).toBe(15);expect(r.candidateCalls).toBeGreaterThan(3);expect(r.possibleWinnerIds).toEqual([1]);
  expect(r.best).toEqual({lo:1,hi:1});expect(r.distance).toEqual({lo:1,hi:1});expect(r.normal.z).toEqual({lo:-1,hi:-1});
  expect(r.witnessA!.x).toEqual({lo:0,hi:0});expect(r.witnessA!.y).toEqual({lo:0,hi:0});expect(r.witnessPresence).toBe('always');
  expect(r.stationaryAdvanceNullCertified).toBe(true);expect(r.fullWrapperCertified).toBe(false);
 });
 it('retains zero-distance normal branch with absent returned witnesses',()=>{
  const c=new OriginalFloatIntervalContext(),a=tri(c,0),r=encloseOriginalSeparatedDistance(c,a,a,point(c,0,0,0),0,profile);
  expect(r.best).toEqual({lo:0,hi:0});expect(r.normal.z).toEqual({lo:0,hi:0});expect(r.witnessPresence).toBe('never');expect(r.witnessA).toBeUndefined();
  expect(r.directThreshold).toBe('true');expect(r.stationaryAdvanceNullCertified).toBe(false);
 });
 it('keeps optional early finite best and initial Infinity until a mandatory source vertex is reached',()=>{
  const c=new OriginalFloatIntervalContext(),base=tri(c,0),optional=point(c,0,0,.75),a={...base,vertices:[optional,...base.vertices],vertexMembership:['maybe','always','always','always'] as const,
   vertexBounds:{...base.vertexBounds,maxZ:c.box(0,.75)}};
  const r=encloseOriginalSeparatedDistance(c,a,tri(c,1),point(c,0,0,0),0,profile);
  expect(r.best).toEqual({lo:.0625,hi:1});expect(r.distance).toEqual({lo:.25,hi:1});expect(r.unknownPruning).toBeGreaterThan(0);
  expect(r.possibleWinnerIds).toContain(1);expect(r.possibleWinnerIds.length).toBeGreaterThan(1);expect(r.stationaryAdvanceNullCertified).toBe(true);
 });
 it('does not turn an optional better candidate into a mandatory upper bound',()=>{
  const c=new OriginalFloatIntervalContext(),base=tri(c,0),a={...base,vertices:[...base.vertices,point(c,0,0,1)],vertexMembership:['always','always','always','maybe'] as const,
   vertexBounds:{...base.vertexBounds,maxZ:c.box(0,1)}};
  const r=encloseOriginalSeparatedDistance(c,a,tri(c,2),point(c,0,0,0),.5,profile);expect(r.best).toEqual({lo:1,hi:4});expect(r.distance).toEqual({lo:1,hi:2});
 });
 it('compares both source threshold graphs independently instead of using a real-gap surrogate',()=>{
  for(const tolerance of [.5,1-1e-12,1]){const c=new OriginalFloatIntervalContext(),r=encloseOriginalSeparatedDistance(c,tri(c,0),tri(c,1),point(c,0,0,0),tolerance,profile);
   expect(r.directThreshold).toBe(1<=tolerance+1e-12?'true':'false');expect(r.gapThreshold).toBe(1-tolerance<=1e-12?'true':'false');
   expect(r.stationaryAdvanceNullCertified).toBe(!(1<=tolerance+1e-12)&&!(1-tolerance<=1e-12));
  }
 });
 it('encloses a genuinely nonpoint tetrahedron full leaf and actual stationary source falsification',()=>{
  const c=new OriginalFloatIntervalContext(),faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],vertices=[point(c,0,0,0),Object.freeze({x:c.box(1,1+2**-40),y:c.point(0),z:c.point(0)}),point(c,0,1,0),point(c,0,0,1)];
  const a=encloseOriginalFeaturePreparation(c,{vertices,faces},provider.contract),scene=[point(c,3,-4,-4),point(c,3,4,-4),point(c,3,0,4)] as const,b=encloseOriginalTriangleFeaturePreparation(c,scene);
  const r=encloseOriginalSeparatedDistance(c,a,b,point(c,0,0,0),.1,profile);expect(c.contains(r.distance,2)).toBe(true);expect(r.distance.hi).toBeGreaterThan(r.distance.lo);expect(r.stationaryAdvanceNullCertified).toBe(true);
  for(const x of [1,1+2**-40]){const h={vertices:[{x:0,y:0,z:0},{x,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces,faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}]};
   const t=[{x:3,y:-4,z:-4},{x:3,y:4,z:-4},{x:3,y:0,z:4}] as const;expect(sweepOriginalConvexTriangleDistance(h,{x:0,y:0,z:0},{x:0,y:0,z:0},t,.1)).toBeNull();
   const admitted=sweepOriginalConvexTriangleDistance(h,{x:0,y:0,z:0},{x:0,y:0,z:0},t,3);expect(admitted).not.toBeNull();expect(c.contains(r.witnessA!.x,admitted!.witnessA!.x)).toBe(true);
  }
 });
 it('rejects an unexcluded unsafe closest-triangle quotient without skipping its source branch',()=>{
  const c=new OriginalFloatIntervalContext(),a=encloseOriginalTriangleFeaturePreparation(c,[point(c,0,.5,1),point(c,1,.5,1),point(c,0,1,1)]),b=encloseOriginalTriangleFeaturePreparation(c,[point(c,0,0,0),point(c,0,0,0),point(c,0,1,0)]);
  expect(()=>encloseOriginalSeparatedDistance(c,a,b,point(c,0,0,0),.1,profile)).toThrow(UnsupportedFloatInterval);
 });
 it('requires a nonempty guaranteed candidate set and an explicit immutable sqrt/source profile',()=>{
  const c=new OriginalFloatIntervalContext(),a=tri(c,0),b=tri(c,1),offset=point(c,0,0,0);
  expect(()=>encloseOriginalSeparatedDistance(c,{...a,vertexMembership:['maybe','maybe','maybe']},b,offset,.1,profile)).toThrow(/guaranteed/);
  expect(()=>encloseOriginalSeparatedDistance(c,a,b,offset,.1,{...profile})).toThrow(/frozen/);
  expect(()=>encloseOriginalSeparatedDistance(c,a,b,offset,.1,Object.freeze({...profile,sqrt:'unattested'} as unknown as OriginalSeparatedDistanceSourceProfile))).toThrow(/unsupported/);
 });
 it('rejects foreign values, invalid source bounds dispatch and nonfinite padding graphs',()=>{
  const c=new OriginalFloatIntervalContext(),a=tri(c,0),b=tri(c,1);
  expect(()=>encloseOriginalSeparatedDistance(c,a,b,point(new OriginalFloatIntervalContext(),0,0,0),.1,profile)).toThrow(/foreign/);
  const bad=[...a.triangleBounds];Object.defineProperty(bad,'map',{value:()=>[]});expect(()=>encloseOriginalSeparatedDistance(c,{...a,triangleBounds:bad},b,point(c,0,0,0),.1,profile)).toThrow(/standard/);
  expect(()=>encloseOriginalSeparatedDistance(c,a,b,point(c,Number.MAX_VALUE,0,0),.1,profile)).toThrow(UnsupportedFloatInterval);
 });
 it('enforces lowerable pair/winner/shared budgets without cumulative reset',()=>{
  let c=new OriginalFloatIntervalContext(),a=tri(c,0),b=tri(c,1);expect(()=>encloseOriginalSeparatedDistance(c,a,b,point(c,0,0,0),.1,profile,{featurePairs:1})).toThrow(/feature-pair-cap/);
  c=new OriginalFloatIntervalContext();a=tri(c,0);b=tri(c,1);const uncertain={...a,vertices:[point(c,0,0,.75),...a.vertices],vertexMembership:['maybe','always','always','always'] as const,vertexBounds:{...a.vertexBounds,maxZ:c.box(0,.75)}};
  expect(()=>encloseOriginalSeparatedDistance(c,uncertain,b,point(c,0,0,0),.1,profile,{winnerSlots:1})).toThrow(/winner-slot-cap/);
  c=new OriginalFloatIntervalContext({operations:2500});a=tri(c,0);b=tri(c,1);const offset=point(c,0,0,0);expect(()=>encloseOriginalSeparatedDistance(c,a,b,offset,.1,profile)).toThrow(/operation-cap/);expect(c.resources().chargedOperations).toBeLessThanOrEqual(2500);
 });
});
