import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext} from './originalFloatInterval';

const policy=Object.freeze({primitiveProofReuse:true as const});
describe('bounded SAME-offset whole translated-difference proof reuse',()=>{
 it('returns the same whole-interval theorem with less charged work on repeated ordered inputs',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.point(1),b=c.point(0),o=c.box(0,1),before=c.resources(),first=c.translatedSub(a,b,o),cold=c.resources();
  const again=c.translatedSub(a,b,o),hot=c.resources();expect(again).toEqual(first);
  expect(hot.chargedOperations-cold.chargedOperations).toBe(4);
  expect(hot.chargedOperations-cold.chargedOperations).toBeLessThan(cold.chargedOperations-before.chargedOperations);
  expect(hot.wholeTranslationProofHits-cold.wholeTranslationProofHits).toBe(1);expect(hot.wholeTranslationProofRecords).toBe(1);
  expect(hot.createdBoxes).toBe(cold.createdBoxes);expect(hot.noBudgetReset).toBe(true);
  for(const offset of [0,2**-53,.5,1])expect(c.contains(first,(1+offset)-offset)).toBe(true);
 });
 it('keeps independent nonpoint values broad even after canonical interning',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.box(0,1),b=c.box(0,1),o=c.point(0);
  expect(a).toBe(b);expect(c.compare(a,b,'===')).toBe('unknown');
  const first=c.translatedSub(a,b,o);expect(first).toEqual({lo:-1,hi:1});expect(c.translatedSub(a,b,o)).toEqual(first);
  expect(c.contains(first,(0+0)-(1+0))).toBe(true);expect(c.contains(first,(1+0)-(0+0))).toBe(true);
 });
 it('rejects matching foreign and forged inputs before a warmed lookup',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.point(1),b=c.point(0),o=c.box(0,1);c.translatedSub(a,b,o);
  const foreign=new OriginalFloatIntervalContext({},policy),bad=foreign.point(1),fake=Object.freeze({lo:1,hi:1});
  for(const value of [bad,fake])expect(()=>c.translatedSub(value,b,o)).toThrow(/foreign/);
  expect(()=>c.translatedSub(a,foreign.point(0),o)).toThrow(/foreign/);expect(()=>c.translatedSub(a,b,foreign.box(0,1))).toThrow(/foreign/);
  expect(c.resources().wholeTranslationProofHits).toBe(0);
 });
 it('never bypasses overflowing first source additions or memoizes failed nodes',()=>{
  const c=new OriginalFloatIntervalContext({},policy),large=c.point(Number.MAX_VALUE);
  for(let i=0;i<2;i++)expect(()=>c.translatedSub(large,large,large)).toThrow(/nonfinite/);
  expect(c.resources().wholeTranslationProofHits).toBe(0);expect(c.resources().wholeTranslationProofRecords).toBe(0);
 });
 it('does not publish a whole node when a later source prefix fails',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.point(-Number.MAX_VALUE),b=c.point(Number.MAX_VALUE),o=c.point(Number.MAX_VALUE);
  for(let i=0;i<2;i++)expect(()=>c.translatedSub(a,b,o)).toThrow(/nonfinite/);
  expect(c.resources().wholeTranslationProofHits).toBe(0);expect(c.resources().wholeTranslationProofRecords).toBe(0);
  // A reusable successful inner addition is not completion of the outer proof.
  expect(c.add(a,o)).toEqual({lo:0,hi:0});
 });
 it('uses ordered operands and exact offset bits for distinct whole-node keys',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.point(1),b=c.point(0),p=c.point(0),n=c.point(-0);
  expect(c.translatedSub(a,b,p)).toEqual({lo:1,hi:1});c.translatedSub(a,b,p);const warm=c.resources();
  expect(c.translatedSub(a,b,n)).toEqual({lo:1,hi:1});expect(c.resources().wholeTranslationProofHits).toBe(warm.wholeTranslationProofHits);
  expect(c.translatedSub(b,a,p)).toEqual({lo:-1,hi:-1});expect(c.resources().wholeTranslationProofHits).toBe(warm.wholeTranslationProofHits);
  const records=c.resources().wholeTranslationProofRecords;expect(records).toBe(3);c.translatedSub(a,b,n);expect(c.resources().wholeTranslationProofRecords).toBe(records);
  expect(c.resources().wholeTranslationProofHits).toBe(warm.wholeTranslationProofHits+1);expect(c.resources().signedZeroCertified).toBe(false);
 });
 it('retains binade-transition and subnormal source falsification cases on cold and hot nodes',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.point(1),b=c.point(0),o=c.box(2**53,2**53+2),r=c.translatedSub(a,b,o);
  expect(c.translatedSub(a,b,o)).toEqual(r);for(const offset of [o.lo,o.hi])expect(c.contains(r,(1+offset)-offset)).toBe(true);
  expect(c.contains(r,0)).toBe(true);expect(c.contains(r,2)).toBe(true);
  for(const sign of [-1,1]){const x=c.box(Number.MIN_VALUE,2*Number.MIN_VALUE),offset=c.box(sign<0?-2*Number.MIN_VALUE:Number.MIN_VALUE,sign<0?-Number.MIN_VALUE:2*Number.MIN_VALUE),result=c.translatedSub(x,b,offset);
   expect(c.translatedSub(x,b,offset)).toEqual(result);for(const value of [x.lo,x.hi])for(const shift of [offset.lo,offset.hi])expect(c.contains(result,(value+shift)-shift)).toBe(true);
  }
 });
 it('charges whole-node hits until the unchanged operation cap is exhausted',()=>{
  const c=new OriginalFloatIntervalContext({operations:1000},policy),a=c.point(1),b=c.point(0),o=c.box(0,1);c.translatedSub(a,b,o);
  let calls=0;expect(()=>{for(;calls<1000;calls++)c.translatedSub(a,b,o);}).toThrow(/operation-cap/);
  expect(calls).toBeLessThan(1000);expect(c.resources().wholeTranslationProofHits).toBeGreaterThan(0);expect(c.resources().chargedOperations).toBeLessThanOrEqual(1000);expect(c.resources().noBudgetReset).toBe(true);
 });
 it('shares bounded retained records and computes uncached whole nodes after saturation',()=>{
  const c=new OriginalFloatIntervalContext({boxes:3},policy),a=c.point(1),b=c.point(0),o=c.point(-0);
  expect(c.resources().retainedReuseRecords).toBe(3);
  expect(c.translatedSub(a,b,o)).toEqual({lo:1,hi:1});const cold=c.resources();expect(c.translatedSub(a,b,o)).toEqual({lo:1,hi:1});const hot=c.resources();
  expect(hot.retainedReuseRecords).toBe(3);expect(hot.maxRetainedReuseRecords).toBe(3);expect(hot.wholeTranslationProofRecords).toBe(0);expect(hot.wholeTranslationProofHits).toBe(0);
  expect(hot.chargedOperations-cold.chargedOperations).toBeGreaterThan(4);expect(hot.createdBoxes).toBeLessThanOrEqual(3);expect(hot.primitiveProofRecords+hot.canonicalBoxRecords).toBe(3);
 });
});
