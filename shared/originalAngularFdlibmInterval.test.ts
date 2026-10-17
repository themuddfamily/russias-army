import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval} from './originalFloatInterval';
import {createOriginalAngularFdlibmInterval,ORIGINAL_FDLIBM_INTERVAL_COEFFICIENTS as coefficients,ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS as bits,type OriginalAngularFdlibmSourceProfile} from './originalAngularFdlibmInterval';
import {encloseOriginalAngularPose} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import {advanceOriginalAngularBody,originalAngularConvex,type OriginalAngularBody} from './originalAngularBody';

const profile:OriginalAngularFdlibmSourceProfile=Object.freeze({tag:'unattested retained fdlibm source fixture',trig:'retained-fdlibm-unreduced-iy0-y0',arithmetic:'separate-rn-binary64-gradual-underflow',
 hypotProfile:Object.freeze({tag:'unattested hypot source fixture',hypotDispatch:'3-fast-4-slow-kahan',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-binary64-Float64Sqrt',tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27'})});
const provider=createOriginalAngularFdlibmInterval(profile),cut=2**-27,pre=cut-2**-80;
describe('conditional unreduced fdlibm angular trig intervals',()=>{
 it('retains all twelve exact frozen coefficient bit patterns',()=>{
  const expected={S1:'bfc5555555555549',S2:'3f8111111110f8a6',S3:'bf2a01a019c161d5',S4:'3ec71de357b1fe7d',S5:'be5ae5e68a2b9ceb',S6:'3de5d93a5acfd57c',
   C1:'3fa555555555554c',C2:'bf56c16c16c15177',C3:'3efa01a019cb1590',C4:'be927e4f809c52ad',C5:'3e21ee9ebdb4b1c4',C6:'bda8fae9be8838d4'};
  expect(bits).toEqual(expected);const view=new DataView(new ArrayBuffer(8));
  for(const key of Object.keys(expected) as (keyof typeof expected)[]){view.setFloat64(0,coefficients[key],false);expect(view.getBigUint64(0,false).toString(16).padStart(16,'0')).toBe(expected[key]);}
 });
 it('retains exact tiny numeric zero, subnormal and cutoff-predecessor returns',()=>{
  const c=new OriginalFloatIntervalContext();for(const x of [0,Number.MIN_VALUE,pre]){
   expect(provider.contract.sin(c,c.point(x))).toEqual({lo:x,hi:x});expect(provider.contract.cos(c,c.point(x))).toEqual({lo:1,hi:1});
  }
 });
 it('takes the polynomial branch at exact cutoff without excluding its rounded source result',()=>{
  const c=new OriginalFloatIntervalContext();expect(provider.contract.sin(c,c.point(cut))).toEqual({lo:cut,hi:cut});
  expect(provider.contract.cos(c,c.point(cut))).toEqual({lo:1,hi:1});expect(provider.tinyPredecessor).toBe(pre);
 });
 it('matches independent literal endpoint values and retains the source x*y-zero cosine graph',()=>{
  const c=new OriginalFloatIntervalContext();expect(provider.contract.sin(c,c.point(.125))).toEqual({lo:.12467473338522769,hi:.12467473338522769});
  expect(provider.contract.cos(c,c.point(.125))).toEqual({lo:.992197667229329,hi:.992197667229329});
 });
 it('unions both actual source branches across the strict tiny cutoff',()=>{
  const c=new OriginalFloatIntervalContext(),x=c.box(pre,cut+2**-60),s=provider.contract.sin(c,x),co=provider.contract.cos(c,x);
  expect(c.contains(s,pre)).toBe(true);expect(c.contains(s,cut)).toBe(true);expect(c.contains(s,Math.sin(cut+2**-60))).toBe(true);
  expect(c.contains(co,1)).toBe(true);expect(provider.maximumTrigBranches).toBe(2);
 });
 it('encloses a whole unreduced positive interval without endpoint-only substitution',()=>{
  const c=new OriginalFloatIntervalContext(),x=c.box(.0625,.125),s=provider.contract.sin(c,x),co=provider.contract.cos(c,x);
  for(const a of [.0625,.09375,.125]){expect(c.contains(s,Math.sin(a))).toBe(true);expect(c.contains(co,Math.cos(a))).toBe(true);}
  expect(s.hi).toBeGreaterThan(s.lo);expect(co.hi).toBeGreaterThan(co.lo);expect(Number.isFinite(s.hi)).toBe(true);
 });
 it('composes a nonpoint positive frame-duration pose and local geometry in one unchanged context',()=>{
  const c=new OriginalFloatIntervalContext(),saved={position:{x:0,y:0,z:0},COMvelocity:{x:1,y:0,z:0},orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:90,z:0},
   centerOfMass:{x:.25,y:0,z:0},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}};
  const pose=encloseOriginalAngularPose(c,saved,c.box(1/60,1/60+2**-40),provider.contract);
  const reference={vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faceNormals:[{x:1,y:0,z:0}],edgeDirections:[{x:0,y:1,z:0}],
   faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][]};
  const geometry=encloseOriginalAngularGeometry(c,reference,pose.orientation,provider.contract);
  // Fresh saved-state comparisons at endpoints/interior are falsification
  // checks only; the whole interval and conditional source theorem stay intact.
  for(const seconds of [1/60,1/60+2**-41,1/60+2**-40]){
   const state:OriginalAngularBody={orientation:{...saved.orientation},angularVelocity:{...saved.angularVelocity},centerOfMass:saved.centerOfMass,inverseInertia:saved.inverseInertia,referenceConvex:reference};
   const pivot=advanceOriginalAngularBody(saved.position,saved.COMvelocity,state,seconds),actual=originalAngularConvex(state);
   for(const key of ['x','y','z'] as const){expect(c.contains(pose.pivot[key],pivot[key])).toBe(true);expect(c.contains(pose.angularVelocity[key],state.angularVelocity[key])).toBe(true);}
   for(const key of ['x','y','z','w'] as const)expect(c.contains(pose.orientation[key],state.orientation[key])).toBe(true);
   for(const list of ['vertices','faceNormals','edgeDirections'] as const)for(let i=0;i<actual[list].length;i++)for(const key of ['x','y','z'] as const)expect(c.contains(geometry[list][i][key],actual[list][i][key])).toBe(true);
  }
  expect(pose.orientation.y.hi).toBeGreaterThan(pose.orientation.y.lo);expect(pose.orientation.y.lo).toBeGreaterThan(.01);
  expect(pose.includesZeroSeconds).toBe(false);expect(geometry.localGeometryEnclosed).toBe(true);expect(geometry.wrapperExclusionCertified).toBe(false);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);expect(c.resources().noBudgetReset).toBe(true);
 });
 it('reuses the explicit hypot source provider and never claims dispatch attestation',()=>{
  const c=new OriginalFloatIntervalContext();expect(provider.contract.hypot(c,[c.point(3),c.point(4),c.point(0)])).toEqual({lo:5,hi:5});
  expect(provider.sourceProfileAttested).toBe(false);expect(provider.glibcEnclosed).toBe(false);expect(provider.nativeEquivalent).toBe(false);expect(provider.runtimeTrigCalls).toBe(0);
 });
 it('rejects missing/nonfrozen or incompatible profiles, wider domains and foreign boxes',()=>{
  expect(()=>createOriginalAngularFdlibmInterval(undefined as unknown as OriginalAngularFdlibmSourceProfile)).toThrow(UnsupportedFloatInterval);
  expect(()=>createOriginalAngularFdlibmInterval({...profile})).toThrow(/frozen/);
  expect(()=>createOriginalAngularFdlibmInterval(Object.freeze({...profile,trig:'glibc'} as unknown as OriginalAngularFdlibmSourceProfile))).toThrow(/unsupported/);
  const c=new OriginalFloatIntervalContext();for(const x of [c.box(-Number.MIN_VALUE,0),c.point(.125+2**-55),c.point(1)])expect(()=>provider.contract.sin(c,x)).toThrow(/domain/);
  expect(()=>provider.contract.cos(c,new OriginalFloatIntervalContext().point(.1))).toThrow(/foreign/);
 });
 it('fails lowerable operation and output-box caps without reset or wider-domain fallback',()=>{
  let c=new OriginalFloatIntervalContext({operations:20}),x=c.point(.125);expect(()=>provider.contract.sin(c,x)).toThrow(/operation-cap/);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(20);
  c=new OriginalFloatIntervalContext({boxes:8});x=c.point(.125);expect(()=>provider.contract.cos(c,x)).toThrow(/box-cap/);
 });
});
