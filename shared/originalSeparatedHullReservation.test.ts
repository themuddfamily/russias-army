import {expect,it} from 'vitest';
import {OriginalFloatIntervalContext} from './originalFloatInterval';

it('bounds retained hull slots by the same record quota in both accounting modes',()=>{
 for(const policy of [undefined,Object.freeze({primitiveProofReuse:true as const})]){
  const c=new OriginalFloatIntervalContext({boxes:2},policy),anchor=c.point(0);
  c.reserveSeparatedHullCapture(anchor);
  if(!policy)c.reserveSeparatedHullCapture(anchor);
  const before=c.resources();expect(before.retainedReuseRecords).toBe(2);
  expect(()=>c.reserveSeparatedHullCapture(anchor)).toThrow(/capture-record-cap/);
  const after=c.resources();expect(after.capturedSeparatedHullRecords).toBe(before.capturedSeparatedHullRecords);
  expect(after.retainedReuseRecords).toBe(2);expect(after.createdBoxes).toBe(1);
  expect(after.canonicalBoxRecords+after.primitiveProofRecords+after.capturedSeparatedHullRecords).toBe(after.retainedReuseRecords);
 }
});

it('rejects foreign and forged anchors before creating a reservation',()=>{
 const c=new OriginalFloatIntervalContext(),foreign=new OriginalFloatIntervalContext().point(0);
 for(const anchor of [foreign,Object.freeze({lo:0,hi:0})])expect(()=>c.reserveSeparatedHullCapture(anchor)).toThrow(/foreign/);
 expect(c.resources().capturedSeparatedHullRecords).toBe(0);expect(c.resources().retainedReuseRecords).toBe(0);
});

it('cannot publish another retained slot when its operation budget expires',()=>{
 const c=new OriginalFloatIntervalContext({operations:5}),anchor=c.point(0);
 c.reserveSeparatedHullCapture(anchor);
 expect(()=>c.reserveSeparatedHullCapture(anchor)).toThrow(/operation-cap/);
 expect(c.resources()).toMatchObject({chargedOperations:5,capturedSeparatedHullRecords:1,retainedReuseRecords:1,noBudgetReset:true});
});
