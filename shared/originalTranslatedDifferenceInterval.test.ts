import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval} from './originalFloatInterval';

describe('source rounded subtraction after SAME translation',()=>{
 it('retains a unit edge over a whole unit translation without changing the source graph',()=>{
  const c=new OriginalFloatIntervalContext(),a=c.point(1),b=c.point(0),o=c.box(0,1),r=c.translatedSub(a,b,o);
  expect(r.lo).toBeGreaterThan(1-1e-12);expect(r.hi).toBeLessThan(1+1e-12);
  for(const offset of [0,2**-53,.5,1])expect(c.contains(r,(1+offset)-(0+offset))).toBe(true);
  expect(c.resources().noBudgetReset).toBe(true);
 });
 it('uses numeric equality only for equal point inputs, after finite source prefixes',()=>{
  const c=new OriginalFloatIntervalContext();expect(c.translatedSub(c.point(2),c.point(2),c.box(-1e100,1e100))).toEqual({lo:0,hi:0});
  const sameBox=c.box(0,1);expect(c.translatedSub(sameBox,sameBox,c.point(0))).toEqual({lo:-1,hi:1});
 });
 it('keeps cancellation-sensitive rounded differences at a binary64 binade transition',()=>{
  const c=new OriginalFloatIntervalContext(),r=c.translatedSub(c.point(1),c.point(0),c.box(2**53,2**53+2));
  expect(c.contains(r,0)).toBe(true);expect(c.contains(r,2)).toBe(true);
  for(const offset of [2**53,2**53+2])expect(c.contains(r,(1+offset)-offset)).toBe(true);
 });
 it('covers subnormal residual bounds and both signs without a zero-radius underflow',()=>{
  for(const sign of [-1,1]){const c=new OriginalFloatIntervalContext(),a=c.box(Number.MIN_VALUE,2*Number.MIN_VALUE),b=c.point(0),o=c.box(sign<0?-2*Number.MIN_VALUE:Number.MIN_VALUE,sign<0?-Number.MIN_VALUE:2*Number.MIN_VALUE),r=c.translatedSub(a,b,o);
   for(const x of [a.lo,a.hi])for(const offset of [o.lo,o.hi])expect(c.contains(r,(x+offset)-offset)).toBe(true);
  }
 });
 it('does not erase overflowing fresh prefixes through an equal-point shortcut',()=>{
  const c=new OriginalFloatIntervalContext(),a=c.point(Number.MAX_VALUE),o=c.point(Number.MAX_VALUE);
  expect(()=>c.translatedSub(a,a,o)).toThrow(UnsupportedFloatInterval);
  const foreign=new OriginalFloatIntervalContext().point(0);expect(()=>c.translatedSub(c.point(1),foreign,c.point(0))).toThrow(/foreign/);
 });
 it('charges work and allocation through the unchanged lowerable context limits',()=>{
  const c=new OriginalFloatIntervalContext({operations:30}),a=c.point(1),b=c.point(0),o=c.box(0,1);
  expect(()=>c.translatedSub(a,b,o)).toThrow(/operation-cap/);expect(c.resources().chargedOperations).toBeLessThanOrEqual(30);
  const limited=new OriginalFloatIntervalContext({boxes:4}),x=limited.point(1),y=limited.point(0),offset=limited.box(0,1);
  expect(()=>limited.translatedSub(x,y,offset)).toThrow(/box-cap/);expect(limited.resources().createdBoxes).toBeLessThanOrEqual(4);
 });
});
