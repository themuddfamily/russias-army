import {expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';

function source(c:OriginalFloatIntervalContext,q:readonly OriginalFloatBox[],v:readonly OriginalFloatBox[]){
 const two=c.point(2),tx=c.mul(c.sub(c.mul(q[1],v[2]),c.mul(q[2],v[1])),two),ty=c.mul(c.sub(c.mul(q[2],v[0]),c.mul(q[0],v[2])),two),tz=c.mul(c.sub(c.mul(q[0],v[1]),c.mul(q[1],v[0])),two);
 return [c.add(v[0],c.add(c.mul(tx,q[3]),c.sub(c.mul(q[1],tz),c.mul(q[2],ty)))),c.add(v[1],c.add(c.mul(ty,q[3]),c.sub(c.mul(q[2],tx),c.mul(q[0],tz)))),c.add(v[2],c.add(c.mul(tz,q[3]),c.sub(c.mul(q[0],ty),c.mul(q[1],tx))))];
}
it('reuses the completed source graph for independent equal numeric ranges',()=>{
 const c=new OriginalFloatIntervalContext({},Object.freeze({primitiveProofReuse:true}));
 const q=[c.box(.25,.26),c.box(.30,.31),c.box(-.73,-.72),c.box(.55,.56)] as const,v=[c.box(-2,-1),c.box(3,4),c.box(0,.01)] as const;
 const expected=source(c,q,v),first=c.groupedQuaternionRotate(...q,...v),before=c.resources();
 const again=c.groupedQuaternionRotate(...q.map(b=>c.box(b.lo,b.hi)) as unknown as typeof q,...v.map(b=>c.box(b.lo,b.hi)) as unknown as typeof v),after=c.resources();
 expect(first).toEqual(expected);expect(again).toBe(first);expect(Object.isFrozen(first)).toBe(true);
 expect(after.groupedRotationProofHits).toBe(1);expect(after.groupedRotationProofRecords).toBe(1);
 expect(after.chargedOperations-before.chargedOperations).toBeLessThan(100);
});
it('preserves cold source results without reuse, and rejects foreign inputs before lookup',()=>{
 for(const reuse of [false,true]){
  const c=new OriginalFloatIntervalContext({},reuse?Object.freeze({primitiveProofReuse:true}):undefined),q=[c.point(.26),c.point(.30),c.point(-.73),c.point(.55)] as const,v=[c.point(1),c.point(2),c.point(3)] as const;
  expect(c.groupedQuaternionRotate(...q,...v)).toEqual(source(c,q,v));
  const foreign=new OriginalFloatIntervalContext().point(1);
  expect(()=>c.groupedQuaternionRotate(q[0],q[1],q[2],q[3],foreign,v[1],v[2])).toThrow('foreign-interval-box');
  expect(c.resources().retainedReuseRecords).toBeLessThanOrEqual(c.resources().maxRetainedReuseRecords);
 }
});
it('does not reuse a permuted input or a changed quaternion component',()=>{
 const c=new OriginalFloatIntervalContext({},Object.freeze({primitiveProofReuse:true})),q=[c.point(.26),c.point(.30),c.point(-.73),c.point(.55)] as const,v=[c.point(1),c.point(2),c.point(3)] as const;
 const first=c.groupedQuaternionRotate(...q,...v),permuted=c.groupedQuaternionRotate(...q,v[1],v[0],v[2]),changed=c.groupedQuaternionRotate(q[0],q[1],q[2],c.point(.56),...v);
 expect(permuted).not.toBe(first);expect(changed).not.toBe(first);expect(permuted).toEqual(source(c,q,[v[1],v[0],v[2]]));
 expect(changed).toEqual(source(c,[q[0],q[1],q[2],c.point(.56)],v));expect(c.resources().groupedRotationProofHits).toBe(0);
});
