import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval} from './originalFloatInterval';
import {createOriginalAngularFdlibmInterval,type OriginalAngularFdlibmSourceProfile} from './originalAngularFdlibmInterval';
import {createOriginalAngularGlibcInterval,type OriginalAngularGlibcSourceProfile} from './originalAngularGlibcInterval';
import {createOriginalAngularSourceAlternativesInterval,type OriginalAngularSourceAlternativesProfile} from './originalAngularSourceAlternativesInterval';
import {encloseOriginalAngularPose} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import {advanceOriginalAngularBody,originalAngularConvex,type OriginalAngularBody} from './originalAngularBody';

const hypotProfile=Object.freeze({tag:'conditional shared hypot fixture',hypotDispatch:'3-fast-4-slow-kahan' as const,
 arithmetic:'separate-rn-binary64-gradual-underflow' as const,sqrt:'correctly-rounded-binary64-Float64Sqrt' as const,tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27' as const});
const fdlibmProfile:OriginalAngularFdlibmSourceProfile=Object.freeze({tag:'conditional fdlibm fixture',trig:'retained-fdlibm-unreduced-iy0-y0',arithmetic:'separate-rn-binary64-gradual-underflow',hypotProfile});
const glibcProfile:OriginalAngularGlibcSourceProfile=Object.freeze({tag:'conditional glibc fixture',trig:'retained-glibc-unreduced-taylor-table',arithmetic:'separate-rn-binary64-gradual-underflow',
 decimalLiterals:'correctly-rounded-binary64-coefficient-translation',tableABI:'binary64-int4-lowword-source-table',hypotProfile});
const profile:OriginalAngularSourceAlternativesProfile=Object.freeze({tag:'conditional two-source fixture; runtime unattested',trigAlternatives:'retained-fdlibm-or-glibc-unreduced',fdlibmProfile,glibcProfile});
const provider=createOriginalAngularSourceAlternativesInterval(profile);

describe('conditional retained angular trig alternatives',()=>{
 it('retains both source enclosures across a cosine table midpoint and distinct sine cutoffs',()=>{
  const fd=createOriginalAngularFdlibmInterval(fdlibmProfile),gl=createOriginalAngularGlibcInterval(glibcProfile);
  for(const [lo,hi] of [[1/256-2**-55,1/256+2**-55],[2**-27-2**-80,2**-26+2**-70],[.0625,.125]]){
   const c=new OriginalFloatIntervalContext(),angle=c.box(lo,hi);
   for(const method of ['sin','cos'] as const){
    const a=fd.contract[method](c,angle),b=gl.contract[method](c,angle),both=provider.contract[method](c,angle);
    expect(both.lo).toBeLessThanOrEqual(a.lo);expect(both.hi).toBeGreaterThanOrEqual(a.hi);
    expect(both.lo).toBeLessThanOrEqual(b.lo);expect(both.hi).toBeGreaterThanOrEqual(b.hi);
    // Production values are falsification only, not selected dispatch evidence.
    for(const value of [lo,(lo+hi)/2,hi])expect(c.contains(both,method==='sin'?Math.sin(value):Math.cos(value))).toBe(true);
   }
  }
 });
 it('uses one unchanged context for both reachable alternatives and propagates exhaustion',()=>{
  const fd=createOriginalAngularFdlibmInterval(fdlibmProfile),gl=createOriginalAngularGlibcInterval(glibcProfile);
  const f=new OriginalFloatIntervalContext(),g=new OriginalFloatIntervalContext(),all=new OriginalFloatIntervalContext();
  fd.contract.cos(f,f.point(.05));gl.contract.cos(g,g.point(.05));provider.contract.cos(all,all.point(.05));
  const biggest=Math.max(f.resources().chargedOperations,g.resources().chargedOperations);
  expect(all.resources().chargedOperations).toBeGreaterThan(biggest+10);
  const limited=new OriginalFloatIntervalContext({operations:biggest+10}),angle=limited.point(.05);
  expect(()=>provider.contract.cos(limited,angle)).toThrow(/operation-cap/);
  expect(limited.resources().chargedOperations).toBeLessThanOrEqual(biggest+10);expect(limited.resources().noBudgetReset).toBe(true);
 });
 it('carries a nonpoint 0.05-second pose and hull through both source alternatives',()=>{
  const c=new OriginalFloatIntervalContext(),lo=.05,hi=.05+2**-40;
  const saved={position:{x:0,y:0,z:0},COMvelocity:{x:1,y:0,z:0},orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:90,z:0},
   centerOfMass:{x:.25,y:0,z:0},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}};
  const reference={vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faceNormals:[{x:1,y:0,z:0}],edgeDirections:[{x:0,y:1,z:0}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][]};
  const pose=encloseOriginalAngularPose(c,saved,c.box(lo,hi),provider.contract),geometry=encloseOriginalAngularGeometry(c,reference,pose.orientation,provider.contract);
  for(const seconds of [lo,(lo+hi)/2,hi]){
   const state:OriginalAngularBody={orientation:{...saved.orientation},angularVelocity:{...saved.angularVelocity},centerOfMass:saved.centerOfMass,inverseInertia:saved.inverseInertia,referenceConvex:reference};
   const pivot=advanceOriginalAngularBody(saved.position,saved.COMvelocity,state,seconds),actual=originalAngularConvex(state);
   for(const key of ['x','y','z'] as const){expect(c.contains(pose.pivot[key],pivot[key])).toBe(true);expect(c.contains(pose.angularVelocity[key],state.angularVelocity[key])).toBe(true);}
   for(const key of ['x','y','z','w'] as const)expect(c.contains(pose.orientation[key],state.orientation[key])).toBe(true);
   for(const list of ['vertices','faceNormals','edgeDirections'] as const)for(let i=0;i<actual[list].length;i++)for(const key of ['x','y','z'] as const)expect(c.contains(geometry[list][i][key],actual[list][i][key])).toBe(true);
  }
  expect(pose.orientation.y.lo).toBeGreaterThan(.03);expect(pose.orientation.y.hi).toBeGreaterThan(pose.orientation.y.lo);
  expect(geometry.localGeometryEnclosed).toBe(true);expect(geometry.wrapperExclusionCertified).toBe(false);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);expect(c.resources().noBudgetReset).toBe(true);
 });
 it('shares the identical retained hypot graph without claiming actual qualification or default integration',()=>{
  const c=new OriginalFloatIntervalContext();expect(provider.contract.hypot(c,[c.point(3),c.point(4),c.point(0)])).toEqual({lo:5,hi:5});
  expect(provider.trigSourceAlternatives).toBe(2);expect(provider.hypotGraphShared).toBe(true);expect(provider.sourceProfileAttested).toBe(false);
  expect(provider.nativeEquivalent).toBe(false);expect(provider.defaultIntegration).toBe(false);expect(provider.rangeReductionImplemented).toBe(false);
 });
 it('rejects malformed profiles, any unsupported reachable source premise, domains and foreign boxes',()=>{
  expect(()=>createOriginalAngularSourceAlternativesInterval({...profile})).toThrow(/frozen/);
  expect(()=>createOriginalAngularSourceAlternativesInterval(Object.freeze({...profile,trigAlternatives:'sampled'} as unknown as OriginalAngularSourceAlternativesProfile))).toThrow(/unsupported/);
  expect(()=>createOriginalAngularSourceAlternativesInterval(Object.freeze({...profile,glibcProfile:Object.freeze({...glibcProfile,tableABI:'unknown'})} as unknown as OriginalAngularSourceAlternativesProfile))).toThrow(UnsupportedFloatInterval);
  const c=new OriginalFloatIntervalContext();for(const x of [c.point(-Number.MIN_VALUE),c.point(.125+2**-55)])expect(()=>provider.contract.sin(c,x)).toThrow(/domain/);
  expect(()=>provider.contract.cos(c,new OriginalFloatIntervalContext().point(.05))).toThrow(/foreign/);
 });
});
