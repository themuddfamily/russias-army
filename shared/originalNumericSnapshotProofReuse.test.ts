import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';

const policy=Object.freeze({primitiveProofReuse:true as const});
type Three=readonly [OriginalFloatBox,OriginalFloatBox,OriginalFloatBox];
type Six=readonly [OriginalFloatBox,OriginalFloatBox,OriginalFloatBox,OriginalFloatBox,OriginalFloatBox,OriginalFloatBox];
const three=(c:OriginalFloatIntervalContext):Three=>[c.box(-3,2),c.box(1,4),c.box(-1,1)];
const six=(c:OriginalFloatIntervalContext):Six=>[c.box(-3,-2),c.box(1,2),c.box(-1,0),c.box(3,4),c.box(0,1),c.box(5,6)];
const referenceVector=(c:OriginalFloatIntervalContext,a:Three)=>Object.freeze({x:c.hull(a[0],a[0]),y:c.hull(a[1],a[1]),z:c.hull(a[2],a[2])});
const referenceBounds=(c:OriginalFloatIntervalContext,a:Six)=>Object.freeze({minX:c.hull(a[0],a[0]),maxX:c.hull(a[1],a[1]),minY:c.hull(a[2],a[2]),maxY:c.hull(a[3],a[3]),minZ:c.hull(a[4],a[4]),maxZ:c.hull(a[5],a[5])});

describe('closed owned numeric vector and bounds snapshots',()=>{
 it('keeps default self-hull numerical ranges and scalar charge accounting',()=>{
  const c=new OriginalFloatIntervalContext(),a=three(c),b=six(c),before=c.resources(),v=c.vector3(...a),afterVector=c.resources(),bounds=c.bounds6(...b),afterBounds=c.resources();
  expect(afterVector.chargedOperations-before.chargedOperations).toBe(15);expect(afterBounds.chargedOperations-afterVector.chargedOperations).toBe(30);
  const d=new OriginalFloatIntervalContext();expect(v).toEqual(referenceVector(d,three(d)));expect(bounds).toEqual(referenceBounds(d,six(d)));
  expect(afterBounds.primitiveProofReuse).toBe(false);expect(afterBounds.noBudgetReset).toBe(true);
 });
 it('matches independent explicit self-hull references on cold opt-in calls and charges hot ownership',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=three(c),b=six(c),v=c.vector3(...a),bounds=c.bounds6(...b),cold=c.resources();
  const d=new OriginalFloatIntervalContext();expect(v).toEqual(referenceVector(d,three(d)));expect(bounds).toEqual(referenceBounds(d,six(d)));
  expect(c.vector3(...a)).toBe(v);const vectorHot=c.resources();expect(vectorHot.chargedOperations-cold.chargedOperations).toBe(4);
  expect(c.bounds6(...b)).toBe(bounds);expect(c.resources().chargedOperations-vectorHot.chargedOperations).toBe(7);
  expect(c.resources()).toMatchObject({vector3ProofRecords:1,vector3ProofHits:1,bounds6ProofRecords:1,bounds6ProofHits:1});
  expect(c.resources().primitiveProofRecords+c.resources().canonicalBoxRecords+c.resources().capturedSeparatedHullRecords).toBe(c.resources().retainedReuseRecords);
  expect(c.resources().retainedReuseRecords).toBeLessThanOrEqual(c.resources().maxRetainedReuseRecords);
  expect(Object.isFrozen(v)).toBe(true);expect(Object.isFrozen(bounds)).toBe(true);
  for(const value of [...Object.values(v),...Object.values(bounds)]){expect(Object.isFrozen(value)).toBe(true);expect(c.contains(value,value.lo)).toBe(true);}
 });
 it('does not infer actual equality from a canonical snapshot or matching nonpoint ranges',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.box(-3,2),b=c.box(-3,2);expect(a).toBe(b);
  const v=c.vector3(a,b,a);expect(v.x).toBe(v.y);expect(c.compare(v.x,v.y,'===')).toBe('unknown');
  expect(c.sub(v.x,v.y)).toEqual({lo:-5,hi:5});expect(c.mul(v.x,v.y)).toEqual({lo:-6,hi:9});expect(c.square(v.x)).toEqual({lo:0,hi:9});
 });
 it('preserves ordered fields and exact zero endpoint bits in its keys',()=>{
  const c=new OriginalFloatIntervalContext({},policy),p=c.point(0),n=c.point(-0),one=c.point(1),v=c.vector3(p,n,one),swapped=c.vector3(n,p,one);
  expect(v).not.toBe(swapped);expect(Object.is(v.x.lo,0)).toBe(true);expect(Object.is(v.y.lo,-0)).toBe(true);expect(Object.is(swapped.x.lo,-0)).toBe(true);
  expect(c.vector3(p,n,one)).toBe(v);expect(c.vector3(n,p,one)).toBe(swapped);
  const a=c.bounds6(p,one,n,one,p,one),b=c.bounds6(n,one,p,one,p,one);expect(a).not.toBe(b);expect(Object.is(a.minY.lo,-0)).toBe(true);expect(Object.is(b.minX.lo,-0)).toBe(true);
  expect(c.resources().signedZeroCertified).toBe(false);
 });
 it('rejects matching foreign or forged scalars in every warmed argument position',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=three(c),b=six(c);c.vector3(...a);c.bounds6(...b);
  const foreign=new OriginalFloatIntervalContext({},policy);
  for(let i=0;i<3;i++)for(const invalid of [foreign.box(a[i].lo,a[i].hi),Object.freeze({...a[i]})]){const args=[...a] as [OriginalFloatBox,OriginalFloatBox,OriginalFloatBox];args[i]=invalid;expect(()=>c.vector3(...args)).toThrow(/foreign/);}
  for(let i=0;i<6;i++)for(const invalid of [foreign.box(b[i].lo,b[i].hi),Object.freeze({...b[i]})]){const args=[...b] as [OriginalFloatBox,OriginalFloatBox,OriginalFloatBox,OriginalFloatBox,OriginalFloatBox,OriginalFloatBox];args[i]=invalid;expect(()=>c.bounds6(...args)).toThrow(/foreign/);}
 });
 it('accepts only positional owned boxes, never callback or supplied snapshot dispatch',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=three(c);let called=false;const callback=()=>{called=true;return a[0];};
  expect(()=>c.vector3(callback as unknown as OriginalFloatBox,a[1],a[2])).toThrow(/foreign/);
  expect(()=>c.vector3({x:a[0],y:a[1],z:a[2]} as unknown as OriginalFloatBox,a[1],a[2])).toThrow(/foreign/);expect(called).toBe(false);
 });
 it('shares the saturated record cap and computes successful uncached snapshots without fallback',()=>{
  const c=new OriginalFloatIntervalContext({boxes:3},policy),zero=c.point(0),one=c.point(1),two=c.point(2),before=c.resources();
  expect(before.retainedReuseRecords).toBe(3);const v=c.vector3(zero,one,two),bounds=c.bounds6(zero,one,zero,two,one,two),first=c.resources();
  expect(c.vector3(zero,one,two)).toEqual(v);expect(c.bounds6(zero,one,zero,two,one,two)).toEqual(bounds);
  const after=c.resources();expect(after.retainedReuseRecords).toBe(3);expect(after.primitiveProofRecords).toBe(0);expect(after.maxRetainedReuseRecords).toBe(3);
  expect(after).toMatchObject({vector3ProofRecords:0,bounds6ProofRecords:0,vector3ProofHits:0,bounds6ProofHits:0});
  expect(after.chargedOperations-first.chargedOperations).toBeGreaterThan(11);expect(after.createdBoxes).toBeLessThanOrEqual(3);expect(after.noBudgetReset).toBe(true);
 });
 it('charges cumulative hits until the fixed operation cap is exhausted',()=>{
  const c=new OriginalFloatIntervalContext({operations:200},policy),a=three(c);c.vector3(...a);let calls=0;
  expect(()=>{for(;calls<200;calls++)c.vector3(...a);}).toThrow(/operation-cap/);expect(calls).toBeLessThan(200);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(200);expect(c.resources().noBudgetReset).toBe(true);
 });
});
