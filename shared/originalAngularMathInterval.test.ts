import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {createOriginalAngularMathInterval,type OriginalAngularMathSourceProfile} from './originalAngularMathInterval';
import {encloseOriginalAngularPose} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';

const profile:OriginalAngularMathSourceProfile=Object.freeze({tag:'conditional frozen source fixture; unattested runtime',hypotDispatch:'3-fast-4-slow-kahan',
 arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-binary64-Float64Sqrt',tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27'});
const provider=createOriginalAngularMathInterval(profile);
const hypot=(c:OriginalFloatIntervalContext,values:readonly OriginalFloatBox[])=>provider.contract.hypot(c,values);
describe('restricted conditional source angular Math intervals',()=>{
 it('matches independent exact norm5 fixtures for fast3 and slow4 source radicands',()=>{
  for(const values of [[3,4,0],[1,2,2,4]]){const c=new OriginalFloatIntervalContext(),r=hypot(c,values.map(v=>c.point(v)));
   expect(r).toEqual({lo:5,hi:5});expect(provider.sourceProfileAttested).toBe(false);expect(provider.runtimeMathCalls).toBe(0);
  }
 });
 it('encloses positive nonpoint tuples with same-max ratio restrictions',()=>{
  const c=new OriginalFloatIntervalContext(),r=hypot(c,[c.box(3,4),c.box(0,1),c.point(0)]);
  // Full domain has real norm in [3,sqrt17]; source-node rounding is retained
  // separately by the provider. These literal endpoints falsify missed nodes.
  expect(c.contains(r,3)).toBe(true);expect(c.contains(r,Math.hypot(4,1,0))).toBe(true);
  expect(Number.isFinite(r.hi)).toBe(true);expect(r.hi).toBeLessThan(5);
  const near=hypot(c,[c.box(3,3+2**-40),c.point(4),c.point(0)]);expect(c.contains(near,5)).toBe(true);
 });
 it('retains numeric zero and positive max branches including signs and max-owner ties',()=>{
  for(const values of [[0,0,0],[0,0,0,0]]){const c=new OriginalFloatIntervalContext();expect(hypot(c,values.map(v=>c.point(v)))).toEqual({lo:0,hi:0});}
  for(const arity of [3,4]){const c=new OriginalFloatIntervalContext(),v=[c.box(-1,1),...Array.from({length:arity-1},()=>c.point(0))];
   expect(hypot(c,v)).toEqual({lo:0,hi:1});
  }
  const c=new OriginalFloatIntervalContext(),r=hypot(c,[c.box(-1,1),c.box(-1,1),c.box(-1,1)]);
  expect(c.contains(r,0)).toBe(true);expect(c.contains(r,1)).toBe(true);expect(c.contains(r,Math.hypot(1,1,1))).toBe(true);
 });
 it('retains gradual-underflow axis values and tiny normalized summands',()=>{
  for(const arity of [3,4]){const c=new OriginalFloatIntervalContext(),values=[c.point(Number.MIN_VALUE),...Array.from({length:arity-1},()=>c.point(0))];
   expect(hypot(c,values)).toEqual({lo:Number.MIN_VALUE,hi:Number.MIN_VALUE});
  }
  const c=new OriginalFloatIntervalContext(),r=hypot(c,[c.point(1),c.point(Number.MIN_VALUE),c.point(Number.MIN_VALUE),c.point(0)]);expect(r).toEqual({lo:1,hi:1});
 });
 it('preserves compensation source graphs on cancellation-sensitive finite point tuples',()=>{
  // Runtime comparisons are falsification checks under the declared source
  // dispatch/lowering premise, not evidence that the running engine attests it.
  for(const values of [[1,2**-26,2**-27],[1,2**-26,2**-27,2**-28],[2**500,2**475,2**474],[2**-500,2**-525,2**-526,2**-527]]){
   const c=new OriginalFloatIntervalContext(),r=hypot(c,values.map(v=>c.point(v)));expect(c.contains(r,Math.hypot(...values))).toBe(true);
  }
 });
 it('uses only common strict nonnegative tiny source trig branches',()=>{
  const c=new OriginalFloatIntervalContext(),a=c.box(0,2**-27-2**-40);
  expect(provider.contract.sin(c,a)).toEqual(a);expect(provider.contract.cos(c,a)).toEqual({lo:1,hi:1});
  for(const angle of [c.point(2**-27),c.box(-Number.MIN_VALUE,0),c.point(1)])expect(()=>provider.contract.sin(c,angle)).toThrow(/tiny-trig-domain/);
 });
 it('composes an actual nonpoint positive pose cell and local geometry under the explicit profile',()=>{
  const c=new OriginalFloatIntervalContext(),saved={position:{x:0,y:0,z:0},COMvelocity:{x:1,y:0,z:0},orientation:{x:0,y:0,z:0,w:1},
   angularVelocity:{x:0,y:90,z:0},centerOfMass:{x:0,y:0,z:0},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}};
  const pose=encloseOriginalAngularPose(c,saved,c.box(1e-12,1e-12+2**-80),provider.contract);
  const geometry=encloseOriginalAngularGeometry(c,{vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faceNormals:[{x:1,y:0,z:0}],edgeDirections:[{x:0,y:1,z:0}],
   faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]]},pose.orientation,provider.contract);
  expect(pose.includesZeroSeconds).toBe(false);expect(pose.orientation.y.hi).toBeGreaterThan(pose.orientation.y.lo);
  expect(geometry.localGeometryEnclosed).toBe(true);expect(geometry.wrapperExclusionCertified).toBe(false);
  const resources=c.resources();expect(resources.chargedOperations).toBeLessThanOrEqual(100000);expect(resources.createdBoxes).toBeLessThanOrEqual(16384);expect(resources.noBudgetReset).toBe(true);
 });
 it('requires an explicit immutable supported profile and owned dense arity3/4 inputs',()=>{
  expect(()=>createOriginalAngularMathInterval({...profile})).toThrow(/frozen/);
  expect(()=>createOriginalAngularMathInterval(Object.freeze({...profile,arithmetic:'unattested'} as unknown as OriginalAngularMathSourceProfile))).toThrow(/unsupported/);
  const c=new OriginalFloatIntervalContext();expect(()=>hypot(c,[c.point(1),c.point(2)])).toThrow(/arity/);
  expect(()=>hypot(c,[c.point(1),new OriginalFloatIntervalContext().point(2),c.point(3)])).toThrow(/foreign/);
 });
 it('rejects source scaling overflow and lowerable shared operation/root-precision exhaustion',()=>{
  let c=new OriginalFloatIntervalContext();expect(()=>hypot(c,[c.point(Number.MAX_VALUE),c.point(Number.MAX_VALUE),c.point(0)])).toThrow(UnsupportedFloatInterval);
  c=new OriginalFloatIntervalContext({operations:30});const values=[c.point(1),c.point(2),c.point(3)];expect(()=>hypot(c,values)).toThrow(/operation-cap/);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(30);
  c=new OriginalFloatIntervalContext({rationalBits:64});expect(()=>hypot(c,[c.point(1),c.point(1),c.point(0)])).toThrow(UnsupportedFloatInterval);
 });
});
