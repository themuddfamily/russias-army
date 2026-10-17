import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';

const policy=Object.freeze({primitiveProofReuse:true as const});
type Triple=readonly [OriginalFloatBox,OriginalFloatBox,OriginalFloatBox];
const points=(c:OriginalFloatIntervalContext,x:number,y:number,z:number):Triple=>[c.point(x),c.point(y),c.point(z)];
const dot=(c:OriginalFloatIntervalContext,a:Triple,b:Triple)=>c.dot3(...a,...b);
const cross=(c:OriginalFloatIntervalContext,a:Triple,b:Triple)=>c.cross3(...a,...b);

describe('bounded ordered source vector proof nodes',()=>{
 it('keeps cold interval corners, left-associated RN dot and same-coordinate squares',()=>{
  for(const c of [new OriginalFloatIntervalContext(),new OriginalFloatIntervalContext({},policy)]){
   const a:Triple=[c.box(-3,2),c.box(-2,4),c.box(1,2)],b:Triple=[c.box(5,7),c.box(-1,3),c.box(-4,-2)];
   expect(dot(c,a,b)).toEqual({lo:-35,hi:24});expect(dot(c,a,a)).toEqual({lo:-13,hi:29});expect(c.squared3(...a)).toEqual({lo:1,hi:29});
   const large=points(c,2**53,1,-(2**53)),ones=points(c,1,1,1);expect(dot(c,large,ones)).toEqual({lo:0,hi:0});
   expect(2**53+(1-(2**53))).toBe(1);expect(c.resources().signedZeroCertified).toBe(false);
  }
 });
 it('returns independently expected ordered cross components and underflow zeros',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=points(c,1,2,3),b=points(c,-4,5,-6);
  expect(cross(c,a,b)).toEqual([{lo:-27,hi:-27},{lo:-6,hi:-6},{lo:13,hi:13}]);
  expect(cross(c,b,a)).toEqual([{lo:27,hi:27},{lo:6,hi:6},{lo:-13,hi:-13}]);
  const tiny=cross(c,points(c,Number.MIN_VALUE,0,0),points(c,0,.5,-.5));for(const x of tiny){expect(x.lo===0).toBe(true);expect(x.hi===0).toBe(true);}
 });
 it('reuses each complete ordered node with ownership plus a charged lookup',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=points(c,1,2,3),b=points(c,-4,5,-6);
  const beforeDot=c.resources(),d=dot(c,a,b),coldDot=c.resources();expect(dot(c,a,b)).toEqual(d);const hotDot=c.resources();
  expect(hotDot.chargedOperations-coldDot.chargedOperations).toBe(7);expect(coldDot.chargedOperations-beforeDot.chargedOperations).toBeGreaterThan(7);
  const s=c.squared3(...a),coldSquared=c.resources();expect(c.squared3(...a)).toEqual(s);expect(c.resources().chargedOperations-coldSquared.chargedOperations).toBe(4);
  const x=cross(c,a,b),coldCross=c.resources();expect(cross(c,a,b)).toBe(x);expect(c.resources().chargedOperations-coldCross.chargedOperations).toBe(7);
  expect(c.resources()).toMatchObject({dot3ProofHits:1,dot3ProofRecords:1,squared3ProofHits:1,squared3ProofRecords:1,cross3ProofHits:1,cross3ProofRecords:1});
  expect(Object.isFrozen(x)).toBe(true);for(const value of x){expect(Object.isFrozen(value)).toBe(true);expect(c.contains(value,value.lo)).toBe(true);}
  expect(c.resources().noBudgetReset).toBe(true);
 });
 it('distinguishes numeric zero bits and ordered arguments without zero-term erasure',()=>{
  const c=new OriginalFloatIntervalContext({},policy),positive=points(c,0,0,0),negative=points(c,-0,-0,-0),ones=points(c,1,1,1);
  expect(Object.is(dot(c,positive,ones).lo,0)).toBe(true);expect(Object.is(dot(c,negative,ones).lo,-0)).toBe(true);
  expect(Object.is(dot(c,negative,ones).hi,-0)).toBe(true);expect(c.compare(positive[0],negative[0],'===')).toBe('true');
  const broad:Triple=[c.box(-1,1),c.point(0),c.point(0)];expect(dot(c,broad,broad)).toEqual({lo:-1,hi:1});expect(c.squared3(...broad)).toEqual({lo:0,hi:1});
 });
 it('rejects foreign or forged input boxes before a warmed whole-node lookup',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=points(c,1,2,3),b=points(c,4,5,6);dot(c,a,b);cross(c,a,b);c.squared3(...a);
  const foreign=new OriginalFloatIntervalContext({},policy).point(1),forged=Object.freeze({lo:1,hi:1});
  for(const bad of [foreign,forged]){const invalid:Triple=[bad,a[1],a[2]];expect(()=>dot(c,invalid,b)).toThrow(/foreign/);expect(()=>cross(c,invalid,b)).toThrow(/foreign/);expect(()=>c.squared3(...invalid)).toThrow(/foreign/);}
 });
 it('keeps early and intermediate overflow failures uncached',()=>{
  const c=new OriginalFloatIntervalContext({},policy),large=points(c,Number.MAX_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE),ones=points(c,1,1,1),twos=points(c,2,0,0);
  for(let i=0;i<2;i++){expect(()=>dot(c,large,twos)).toThrow(/overflow/);expect(()=>dot(c,large,ones)).toThrow(/nonfinite/);expect(()=>c.squared3(...large)).toThrow(/overflow/);}
  expect(c.resources()).toMatchObject({dot3ProofRecords:0,dot3ProofHits:0,squared3ProofRecords:0,squared3ProofHits:0});
 });
 it('cannot publish a cross tuple after only its earlier component succeeds',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=points(c,1e308,1,0),b=points(c,0,0,2);
  for(let i=0;i<2;i++)expect(()=>cross(c,a,b)).toThrow(/overflow/);
  expect(c.resources()).toMatchObject({cross3ProofRecords:0,cross3ProofHits:0});
  expect(c.sub(c.mul(a[1],b[2]),c.mul(a[2],b[1]))).toEqual({lo:2,hi:2});
 });
 it('shares saturated records and keeps normal source computations under the same box cap',()=>{
  const c=new OriginalFloatIntervalContext({boxes:3},policy),a=points(c,0,1,2),zero:Triple=[a[0],a[0],a[0]];
  expect(c.resources().retainedReuseRecords).toBe(3);expect(dot(c,a,zero)).toEqual({lo:0,hi:0});const before=c.resources();
  expect(dot(c,a,zero)).toEqual({lo:0,hi:0});expect(c.resources().chargedOperations-before.chargedOperations).toBeGreaterThan(7);
  expect(c.squared3(...zero)).toEqual({lo:0,hi:0});expect(cross(c,a,zero)).toEqual([{lo:0,hi:0},{lo:0,hi:0},{lo:0,hi:0}]);
  expect(c.resources().retainedReuseRecords).toBe(3);expect(c.resources().createdBoxes).toBeLessThanOrEqual(3);expect(c.resources().noBudgetReset).toBe(true);
  expect(c.resources()).toMatchObject({dot3ProofRecords:0,squared3ProofRecords:0,cross3ProofRecords:0});
 });
 it('eventually exhausts a fixed operation budget even on successful vector hits',()=>{
  const c=new OriginalFloatIntervalContext({operations:500},policy),a=points(c,1,2,3),b=points(c,4,5,6);dot(c,a,b);
  let calls=0;expect(()=>{for(;calls<500;calls++)dot(c,a,b);}).toThrow(/operation-cap/);
  expect(calls).toBeLessThan(500);expect(c.resources().chargedOperations).toBeLessThanOrEqual(500);expect(c.resources().noBudgetReset).toBe(true);
 });
});
