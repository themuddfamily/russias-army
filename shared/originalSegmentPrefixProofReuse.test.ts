import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {encloseOriginalClosestSegments,originalFloatVectorPoint,type OriginalFloatVectorBox,type OriginalSegmentIntervalPath} from './originalFiniteFeatureInterval';

const policy=Object.freeze({primitiveProofReuse:true as const});
type XYZ=readonly [number,number,number];
const point=(c:OriginalFloatIntervalContext,p:XYZ)=>originalFloatVectorPoint(c,{x:p[0],y:p[1],z:p[2]});
const shift=(p:XYZ,offset:XYZ):XYZ=>[p[0]+offset[0],p[1]+offset[1],p[2]+offset[2]];
const prefix=(c:OriginalFloatIntervalContext,u:OriginalFloatVectorBox,v:OriginalFloatVectorBox,cc?:OriginalFloatBox)=>cc===undefined
 ?c.segmentDisplacementPrefix(u.x,u.y,u.z,v.x,v.y,v.z)
 :c.segmentDisplacementPrefix(u.x,u.y,u.z,v.x,v.y,v.z,cc);
const view=new DataView(new ArrayBuffer(8));
const bits=(v:number)=>{view.setFloat64(0,v,false);return view.getBigUint64(0,false);};
const boxBits=(b:OriginalFloatBox)=>[bits(b.lo),bits(b.hi)];
const vectorBits=(v:OriginalFloatVectorBox)=>[boxBits(v.x),boxBits(v.y),boxBits(v.z)];
const resultBits=(r:ReturnType<typeof encloseOriginalClosestSegments>)=>({first:vectorBits(r.first),second:vectorBits(r.second),paths:r.paths});
const solve=(c:OriginalFloatIntervalContext,points:readonly XYZ[])=>{
 const p=points.map(v=>point(c,v));return encloseOriginalClosestSegments(c,p[0],p[1],p[2],p[3]);
};

describe('displacement-only closest-segment proof reuse',()=>{
 it('preserves the default context without charging an unused prefix abstraction',()=>{
  const c=new OriginalFloatIntervalContext(),u=point(c,[1,0,0]),v=point(c,[0,1,0]),before=c.resources();
  expect(prefix(c,u,v)).toBeUndefined();expect(c.resources()).toEqual(before);
 });

 it('reuses numeric displacements while recomputing translated closest positions',()=>{
  const c=new OriginalFloatIntervalContext({},policy),source:readonly XYZ[]=[[-1,0,0],[1,0,0],[0,-1,1],[0,1,1]];
  const first=solve(c,source),before=c.resources();
  for(const offset of [[8,4,2],[16,-8,4],[-8,16,-2]] as const){
   const moved=source.map(p=>shift(p,offset)),actual=solve(c,moved),cold=solve(new OriginalFloatIntervalContext(),moved);
   expect(resultBits(actual)).toEqual(resultBits(cold));expect(actual.paths).toEqual(['nonparallel-interior']);
   expect(vectorBits(actual.first)).toEqual(vectorBits(point(c,offset)));
   expect(vectorBits(actual.second)).toEqual(vectorBits(point(c,shift([0,0,1],offset))));
   expect(vectorBits(actual.first)).not.toEqual(vectorBits(first.first));
  }
  const after=c.resources();expect(after.segmentPrefixProofHits+after.segmentSaturationProofHits-before.segmentPrefixProofHits-before.segmentSaturationProofHits).toBeGreaterThanOrEqual(3);
 });

 it('does not reuse position-dependent projections or clamps for equal directions',()=>{
  const c=new OriginalFloatIntervalContext({},policy),cases:readonly (readonly XYZ[])[]=[
   [[0,0,0],[1,0,0],[2,1,0],[2,2,0]],
   [[0,0,0],[1,0,0],[.5,-.5,0],[.5,.5,0]],
   [[0,0,0],[1,0,0],[2,-2,0],[2,-1,0]],
  ];
  const expectedPaths=['nonparallel-low','nonparallel-interior','nonparallel-high'];
  const results=cases.map((p,i)=>{
   const actual=solve(c,p);expect(resultBits(actual)).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),p)));
   expect(actual.paths).toEqual([expectedPaths[i]]);return actual;
  });
  expect(c.resources().segmentPrefixProofHits+c.resources().segmentSaturationProofHits).toBeGreaterThanOrEqual(2);
  expect(vectorBits(results[0].second)).not.toEqual(vectorBits(results[1].second));
  expect(vectorBits(results[1].second)).not.toEqual(vectorBits(results[2].second));
 });

 it('keeps all analytic degenerate, parallel and nonparallel source branches',()=>{
  const cases:readonly [OriginalSegmentIntervalPath,readonly XYZ[]][]=[
   ['both-zero',[[1,2,3],[1,2,3],[4,5,6],[4,5,6]]],
   ['first-zero',[[0,.5,0],[0,.5,0],[0,0,0],[0,1,0]]],
   ['second-zero',[[0,0,0],[1,0,0],[.5,1,0],[.5,1,0]]],
   ['parallel-interior',[[0,0,0],[1,0,0],[0,1,0],[1,1,0]]],
   ['parallel-low',[[0,0,0],[1,0,0],[2,1,0],[3,1,0]]],
   ['parallel-high',[[0,0,0],[1,0,0],[-3,1,0],[-2,1,0]]],
   ['nonparallel-interior',[[-1,0,0],[1,0,0],[0,-1,1],[0,1,1]]],
   ['nonparallel-low',[[0,0,0],[1,0,0],[2,1,0],[2,2,0]]],
   ['nonparallel-high',[[0,0,0],[1,0,0],[2,-2,0],[2,-1,0]]],
  ];
  for(const [path,p] of cases){
   const c=new OriginalFloatIntervalContext({},policy),actual=solve(c,p);
   expect(resultBits(actual)).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),p)));expect(actual.paths).toEqual([path]);
   const before=c.resources();expect(resultBits(solve(c,p))).toEqual(resultBits(actual));
   const after=c.resources();expect(after.segmentPrefixProofHits+after.segmentSaturationProofHits-before.segmentPrefixProofHits-before.segmentSaturationProofHits).toBeGreaterThanOrEqual(1);
  }
 });

 it('keys ordered displacement slots and distinguishes supplied squared-length bounds',()=>{
  const c=new OriginalFloatIntervalContext({},policy),u=point(c,[2,0,0]),v=point(c,[0,3,0]);
  const direct=prefix(c,u,v)!;expect(Object.isFrozen(direct)).toBe(true);
  expect(direct.aa).toEqual({lo:4,hi:4});expect(direct.bb).toEqual({lo:0,hi:0});expect(direct.cc).toEqual({lo:9,hi:9});
  const before=c.resources();expect(prefix(c,u,v)).toBe(direct);expect(c.resources().chargedOperations-before.chargedOperations).toBe(7);
  const reverse=prefix(c,v,u)!;expect(reverse).not.toBe(direct);expect(reverse.aa).toEqual({lo:9,hi:9});expect(reverse.cc).toEqual({lo:4,hi:4});
  const cc=c.point(9),supplied=prefix(c,u,v,cc)!;expect(supplied).not.toBe(direct);expect(supplied.cc).toEqual(direct.cc);
  const suppliedBefore=c.resources();expect(prefix(c,u,v,cc)).toBe(supplied);expect(c.resources().chargedOperations-suppliedBefore.chargedOperations).toBe(8);
  const wide=prefix(c,u,v,c.box(8,10))!;expect(wide).not.toBe(supplied);expect(wide.cc).toEqual({lo:9,hi:9});
  expect(()=>prefix(c,u,v,c.point(8))).toThrow(/empty|disjoint|intersection/);
 });

 it('checks every owned input before a warmed lookup, including supplied cc',()=>{
  const c=new OriginalFloatIntervalContext({},policy),u=point(c,[2,0,0]),v=point(c,[0,3,0]),cc=c.point(9);prefix(c,u,v,cc);
  const good=[u.x,u.y,u.z,v.x,v.y,v.z,cc] as const;
  expect(()=>c.segmentDisplacementPrefix(u.x,u.y,u.z,v.x,v.y,v.z,undefined as unknown as OriginalFloatBox)).toThrow(/foreign/);
  for(const bad of [new OriginalFloatIntervalContext({},policy).point(2),Object.freeze({lo:2,hi:2})])for(let slot=0;slot<7;slot++){
   const values=[...good];values[slot]=bad;const before=c.resources();
   expect(()=>c.segmentDisplacementPrefix(values[0],values[1],values[2],values[3],values[4],values[5],values[6])).toThrow(/foreign/);
   expect(c.resources().chargedOperations-before.chargedOperations).toBe(slot+1);expect(c.resources().segmentPrefixProofHits).toBe(before.segmentPrefixProofHits);
  }
 });

 it('still validates cached source differences and cc against fresh translated differences',()=>{
  for(const c of [new OriginalFloatIntervalContext(),new OriginalFloatIntervalContext({},policy)]){
   const a=point(c,[0,0,0]),b=point(c,[1,0,0]),start=point(c,[0,1,0]),end=point(c,[1,1,0]),v=point(c,[1,0,0]);
   const cached={v,cc:c.point(1)},actual=encloseOriginalClosestSegments(c,a,b,start,end,cached,v);
   expect(actual.paths).toEqual(['parallel-interior']);
   expect(()=>encloseOriginalClosestSegments(c,a,b,start,end,{v:point(c,[2,0,0]),cc:cached.cc},v)).toThrow();
   expect(()=>encloseOriginalClosestSegments(c,a,b,start,end,{v,cc:c.point(2)},v)).toThrow();
   expect(()=>encloseOriginalClosestSegments(c,a,b,start,end,{v,cc:undefined as unknown as OriginalFloatBox},v)).toThrow(/foreign/);
   expect(()=>encloseOriginalClosestSegments(c,a,b,start,end,cached,point(c,[2,0,0]))).toThrow();
  }
 });

 it('keeps conditioning failures and lowered operation budgets fail closed',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=point(c,[0,0,0]),b={x:c.box(0,1),y:c.point(0),z:c.point(0)};
  expect(()=>encloseOriginalClosestSegments(c,a,b,point(c,[2,1,0]),point(c,[3,1,0]))).toThrow();
  const short=new OriginalFloatIntervalContext({operations:30},policy),u=point(short,[1,0,0]),v=point(short,[0,1,0]);
  expect(()=>prefix(short,u,v)).toThrow(/operation-cap/);expect(short.resources().chargedOperations).toBeLessThanOrEqual(30);
  expect(short.resources()).toMatchObject({segmentPrefixProofRecords:0,segmentPrefixProofHits:0,noBudgetReset:true});
 });

 it('recomputes uncached prefixes when the combined record cap is saturated',()=>{
  const c=new OriginalFloatIntervalContext({boxes:128},policy),u=point(c,[1,0,0]),v=point(c,[0,1,0]);prefix(c,v,u);
  while(c.resources().retainedReuseRecords<128)c.reserveSeparatedHullCapture(u.y);
  const before=c.resources(),first=prefix(c,u,v),second=prefix(c,u,v);
  expect(first).toEqual(second);expect(first).not.toBe(second);
  expect(c.resources().segmentPrefixProofHits).toBe(before.segmentPrefixProofHits);expect(c.resources().segmentPrefixProofRecords).toBe(before.segmentPrefixProofRecords);
  expect(c.resources().retainedReuseRecords).toBe(128);expect(c.resources().physicalBoxAllocations).toBeLessThanOrEqual(128);
  expect(c.resources().chargedOperations-before.chargedOperations).toBeGreaterThan(14);
 });
});
