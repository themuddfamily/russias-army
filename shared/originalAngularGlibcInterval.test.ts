import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext} from './originalFloatInterval';
import {createOriginalAngularGlibcInterval,ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS as bits,ORIGINAL_GLIBC_INTERVAL_COEFFICIENTS as coefficients,ORIGINAL_GLIBC_INTERVAL_TABLE_BITS as tableBits,ORIGINAL_GLIBC_INTERVAL_TABLE as table,type OriginalAngularGlibcSourceProfile} from './originalAngularGlibcInterval';
import {encloseOriginalAngularPose} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import {advanceOriginalAngularBody,originalAngularConvex,type OriginalAngularBody} from './originalAngularBody';

const profile:OriginalAngularGlibcSourceProfile=Object.freeze({tag:'unattested glibc source fixture',trig:'retained-glibc-unreduced-taylor-table',arithmetic:'separate-rn-binary64-gradual-underflow',
 decimalLiterals:'correctly-rounded-binary64-coefficient-translation',tableABI:'binary64-int4-lowword-source-table',
 hypotProfile:Object.freeze({tag:'unattested hypot fixture',hypotDispatch:'3-fast-4-slow-kahan',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-binary64-Float64Sqrt',tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27'})});
const provider=createOriginalAngularGlibcInterval(profile);
describe('conditional unreduced bundled glibc angular intervals',()=>{
 it('binds exact header and correctly-rounded source decimal coefficient patterns',()=>{
  expect(bits).toEqual({s1:'bfc5555555555555',s2:'3f81111111110ece',s3:'bf2a01a019db08b8',s4:'3ec71de27b9a7ed9',s5:'be5addffc2fcdf59',big:'42c8000000000000',
   sn3:'bfc5555555555515',sn5:'3f811110e829872f',cs2:'3fe0000000000000',cs4:'bfa5555555555535',cs6:'3f56c16bedd9e239'});
  const view=new DataView(new ArrayBuffer(8));for(const key of Object.keys(bits) as (keyof typeof bits)[]){view.setFloat64(0,coefficients[key],false);expect(view.getBigUint64(0,false).toString(16).padStart(16,'0')).toBe(bits[key]);}
 });
 it('preserves frozen source word rows and four ordered entries per row',()=>{
  expect(tableBits.length).toBe(17);expect(tableBits[0]).toEqual(['0000000000000000','0000000000000000','3ff0000000000000','0000000000000000']);
  expect(tableBits[8]).toEqual(['3faffaaaeeed4edb','bc42d16d32684b69','3feff0015549f4d3','3c8328387b99426f']);
  expect(tableBits[16]).toEqual(['3fbfeaaeee86ee36','bc4afcb2bcc6f03b','3fefc015527d5bd3','3c8b68f35094efb8']);
  const view=new DataView(new ArrayBuffer(8));for(let row=0;row<17;row++)for(let i=0;i<4;i++){view.setFloat64(0,table[row][i],false);expect(view.getBigUint64(0,false).toString(16).padStart(16,'0')).toBe(tableBits[row][i]);}
  expect(Object.isFrozen(table)).toBe(true);expect(Object.isFrozen(table[0])).toBe(true);
 });
 it('retains distinct sine/cosine tiny cutoffs and exact equality alternatives',()=>{
  const c=new OriginalFloatIntervalContext();for(const x of [0,Number.MIN_VALUE,2**-26-2**-79])expect(provider.contract.sin(c,c.point(x))).toEqual({lo:x,hi:x});
  expect(provider.contract.sin(c,c.point(2**-26))).toEqual({lo:2**-26,hi:2**-26});
  expect(provider.contract.cos(c,c.point(2**-27-2**-80))).toEqual({lo:1,hi:1});expect(provider.contract.cos(c,c.point(2**-27))).toEqual({lo:1,hi:1});
  expect(provider.sineTinyCutoff).not.toBe(provider.cosineTinyCutoff);
 });
 it('retains both reachable output paths when boxes cross either tiny cutoff',()=>{
  const c=new OriginalFloatIntervalContext();for(const cosine of [false,true]){
   const cut=cosine?2**-27:2**-26,pre=cut-(cosine?2**-80:2**-79),x=c.box(pre,cut+2**-60),r=cosine?provider.contract.cos(c,x):provider.contract.sin(c,x);
   expect(c.contains(r,cosine?1:pre)).toBe(true);expect(c.contains(r,cosine?Math.cos(cut+2**-60):Math.sin(cut+2**-60))).toBe(true);
  }
 });
 it('uses each source table row at its exact dyadic center with zero residual',()=>{
  const c=new OriginalFloatIntervalContext();for(let row=1;row<=16;row++)expect(provider.contract.cos(c,c.point(row/128))).toEqual({lo:table[row][2],hi:table[row][2]});
 });
 it('covers rounding midpoint ties and narrow boxes containing adjacent owner rows',()=>{
  const c=new OriginalFloatIntervalContext();for(const row of [0,1,7,15]){
   const midpoint=(2*row+1)/256,r=provider.contract.cos(c,c.box(midpoint-2**-50,midpoint+2**-50));
   for(const x of [midpoint-2**-50,midpoint,midpoint+2**-50])expect(c.contains(r,Math.cos(x))).toBe(true);
  }
  expect(provider.inclusiveRowCuts).toBe(true);
 });
 it('encloses fullrange nonpoint source sine and all cosine rows without ideal-function substitution',()=>{
  const c=new OriginalFloatIntervalContext(),x=c.box(0,.125),s=provider.contract.sin(c,x),co=provider.contract.cos(c,x);
  for(let row=0;row<=16;row++){expect(c.contains(s,Math.sin(row/128))).toBe(true);expect(c.contains(co,Math.cos(row/128))).toBe(true);}
  expect(s.hi).toBeGreaterThan(s.lo);expect(co.hi).toBeGreaterThan(co.lo);expect(provider.maximumCosineRows).toBe(17);
 });
 it('composes a nonpoint .05-second pose and local geometry with fresh source falsification checks',()=>{
  const c=new OriginalFloatIntervalContext(),saved={position:{x:0,y:0,z:0},COMvelocity:{x:1,y:0,z:0},orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:90,z:0},
   centerOfMass:{x:.25,y:0,z:0},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}};
  const pose=encloseOriginalAngularPose(c,saved,c.box(.05,.05+2**-40),provider.contract),reference={vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],
   faceNormals:[{x:1,y:0,z:0}],edgeDirections:[{x:0,y:1,z:0}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][]};
  const geometry=encloseOriginalAngularGeometry(c,reference,pose.orientation,provider.contract);
  for(const seconds of [.05,.05+2**-41,.05+2**-40]){
   const state:OriginalAngularBody={orientation:{...saved.orientation},angularVelocity:{...saved.angularVelocity},centerOfMass:saved.centerOfMass,inverseInertia:saved.inverseInertia,referenceConvex:reference};
   const pivot=advanceOriginalAngularBody(saved.position,saved.COMvelocity,state,seconds),actual=originalAngularConvex(state);
   for(const key of ['x','y','z'] as const){expect(c.contains(pose.pivot[key],pivot[key])).toBe(true);expect(c.contains(pose.angularVelocity[key],state.angularVelocity[key])).toBe(true);}
   for(const key of ['x','y','z','w'] as const)expect(c.contains(pose.orientation[key],state.orientation[key])).toBe(true);
   for(const list of ['vertices','faceNormals','edgeDirections'] as const)for(let i=0;i<actual[list].length;i++)for(const key of ['x','y','z'] as const)expect(c.contains(geometry[list][i][key],actual[list][i][key])).toBe(true);
  }
  expect(pose.orientation.y.hi).toBeGreaterThan(pose.orientation.y.lo);expect(pose.orientation.y.lo).toBeGreaterThan(.03);
  expect(geometry.wrapperExclusionCertified).toBe(false);expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);
 });
 it('reuses source hypot without pretending glibc or runtime dispatch attestation',()=>{
  const c=new OriginalFloatIntervalContext();expect(provider.contract.hypot(c,[c.point(3),c.point(4),c.point(0)])).toEqual({lo:5,hi:5});
  expect(provider.sourceProfileAttested).toBe(false);expect(provider.fdlibmEnclosed).toBe(false);expect(provider.nativeEquivalent).toBe(false);expect(provider.runtimeTrigCalls).toBe(0);
 });
 it('rejects unsupported profile, negative/wider domains and foreign boxes',()=>{
  expect(()=>createOriginalAngularGlibcInterval({...profile})).toThrow(/frozen/);
  expect(()=>createOriginalAngularGlibcInterval(Object.freeze({...profile,tableABI:'other'} as unknown as OriginalAngularGlibcSourceProfile))).toThrow(/unsupported/);
  const c=new OriginalFloatIntervalContext();for(const x of [c.box(-Number.MIN_VALUE,0),c.point(.125+2**-55),c.point(1)])expect(()=>provider.contract.cos(c,x)).toThrow(/domain/);
  expect(()=>provider.contract.sin(c,new OriginalFloatIntervalContext().point(.1))).toThrow(/foreign/);
 });
 it('stops shared operation/box budgets with no row or precision fallback',()=>{
  let c=new OriginalFloatIntervalContext({operations:30}),x=c.box(0,.125);expect(()=>provider.contract.cos(c,x)).toThrow(/operation-cap/);expect(c.resources().chargedOperations).toBeLessThanOrEqual(30);
  c=new OriginalFloatIntervalContext({boxes:8});x=c.point(.05);expect(()=>provider.contract.sin(c,x)).toThrow(/box-cap/);
 });
});
