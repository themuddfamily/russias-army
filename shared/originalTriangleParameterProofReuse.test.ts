import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {encloseOriginalClosestTriangle,originalFloatVectorPoint,type OriginalFloatVectorBox,type OriginalTriangleIntervalExit} from './originalFiniteFeatureInterval';

const policy=Object.freeze({primitiveProofReuse:true as const});
type XYZ=readonly [number,number,number];
const point=(c:OriginalFloatIntervalContext,p:XYZ)=>originalFloatVectorPoint(c,{x:p[0],y:p[1],z:p[2]});
const word=new DataView(new ArrayBuffer(8));
const bits=(n:number)=>{word.setFloat64(0,n,false);return word.getBigUint64(0,false);};
const boxBits=(b:OriginalFloatBox)=>[bits(b.lo),bits(b.hi)];
const vectorBits=(v:OriginalFloatVectorBox)=>[boxBits(v.x),boxBits(v.y),boxBits(v.z)];
const resultBits=(r:ReturnType<typeof encloseOriginalClosestTriangle>)=>({witness:vectorBits(r.witness),exits:r.exits});
const triangle=(c:OriginalFloatIntervalContext,offset:XYZ=[0,0,0])=>[point(c,offset),point(c,[offset[0],offset[1]+1,offset[2]]),point(c,[offset[0],offset[1],offset[2]+1])] as const;
const solve=(c:OriginalFloatIntervalContext,wx:number,y:number,z:number,offset:XYZ=[0,0,0])=>encloseOriginalClosestTriangle(c,point(c,[offset[0]+wx,offset[1]+y,offset[2]+z]),triangle(c,offset));
const pair=(c:OriginalFloatIntervalContext,ab:OriginalFloatVectorBox,ac:OriginalFloatVectorBox,w:OriginalFloatVectorBox)=>c.triangleZeroXDotPair(ab.x,ab.y,ab.z,ac.x,ac.y,ac.z,w.x,w.y,w.z);

describe('bounded zero-x triangle coefficient proof reuse',()=>{
 it('does no work or accounting when the default context does not enable projection reuse',()=>{
  const c=new OriginalFloatIntervalContext(),ab=point(c,[0,1,0]),ac=point(c,[0,0,1]),w=point(c,[1,-1,-1]),before=c.resources();expect(pair(c,ab,ac,w)).toBeUndefined();expect(c.resources()).toEqual(before);
 });
 it.each([1,-1])('matches all seven ordered exits with fresh witness positions and x sign %s',sign=>{
  const cases:readonly [OriginalTriangleIntervalExit,number,number][]=[['a',-1,-1],['b',2,0],['ab',.5,-1],['c',0,2],['ac',-1,.5],['bc',1,1],['face',.25,.25]];
  for(const [exit,y,z] of cases){
   const c=new OriginalFloatIntervalContext({},policy),first=solve(c,sign,y,z);expect(first.exits).toEqual([exit]);expect(resultBits(first)).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),sign,y,z)));
   for(const [magnitude,offset] of [[2,[8,4,2]],[4,[-8,8,-4]]] as const){const before=c.resources(),actual=solve(c,sign*magnitude,y,z,offset);expect(actual.exits).toEqual([exit]);expect(resultBits(actual)).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),sign*magnitude,y,z,offset)));expect(vectorBits(actual.witness)).not.toEqual(vectorBits(first.witness));expect(c.resources().triangleProjectionProofHits-before.triangleProjectionProofHits).toBe(exit==='a'?1:exit==='b'||exit==='ab'?2:3);}
  }
 });
 it('retains ordered unknown alternatives on boxed edge/face boundaries',()=>{
  const evaluate=(c:OriginalFloatIntervalContext,wx:number)=>encloseOriginalClosestTriangle(c,{x:c.point(wx),y:c.box(-.125,.125),z:c.point(.25)},triangle(c));
  const c=new OriginalFloatIntervalContext({},policy);
  for(const wx of [1,2,4,-1,-2]){const actual=evaluate(c,wx);expect(actual.exits).toEqual(['ac','face']);expect(resultBits(actual)).toEqual(resultBits(evaluate(new OriginalFloatIntervalContext(),wx)));}
 });
 it('does not validate unreachable foreign bc data at early a, b or ab exits',()=>{
  for(const [exit,y,z] of [['a',-1,-1],['b',2,0],['ab',.5,-1]] as const)for(const sign of [1,-1]){
   const evaluate=(c:OriginalFloatIntervalContext)=>{
    const foreign=new OriginalFloatIntervalContext().point(0),constant={ab:point(c,[0,1,0]),ac:point(c,[0,0,1]),bc:{x:foreign,y:foreign,z:foreign}};
    return encloseOriginalClosestTriangle(c,point(c,[sign,y,z]),triangle(c),constant);
   };
   const actual=evaluate(new OriginalFloatIntervalContext({},policy));expect(actual.exits).toEqual([exit]);expect(resultBits(actual)).toEqual(resultBits(evaluate(new OriginalFloatIntervalContext())));
  }
 });
 it('does not evaluate unused overflowing bp/cp projections at early source exits',()=>{
  for(const sign of [1,-1])for(const [exit,b,c,p] of [
   ['a',[0,Number.MAX_VALUE,0],[0,0,Number.MAX_VALUE],[sign,0,0]],
   ['b',[0,1,0],[0,0,Number.MAX_VALUE],[sign,2,0]],
   ['ab',[0,1,0],[0,0,Number.MAX_VALUE],[sign,.5,0]],
  ] as const){
   const evaluate=(context:OriginalFloatIntervalContext)=>encloseOriginalClosestTriangle(context,point(context,p),[point(context,[0,0,0]),point(context,b),point(context,c)]);
   const actual=evaluate(new OriginalFloatIntervalContext({},policy));expect(actual.exits).toEqual([exit]);expect(resultBits(actual)).toEqual(resultBits(evaluate(new OriginalFloatIntervalContext())));
  }
 });
 it('authenticates and intersects the fresh current bc edge only when bc is reached',()=>{
  for(const c of [new OriginalFloatIntervalContext(),new OriginalFloatIntervalContext({},policy)]){
   const p=point(c,[1,1,1]),t=triangle(c),ab=point(c,[0,1,0]),ac=point(c,[0,0,1]),bc=point(c,[0,-1,1]);
   expect(encloseOriginalClosestTriangle(c,p,t,{ab,ac,bc}).exits).toEqual(['bc']);
   const foreign=new OriginalFloatIntervalContext().point(0);expect(()=>encloseOriginalClosestTriangle(c,p,t,{ab,ac,bc:{...bc,x:foreign}})).toThrow(/foreign/);
   expect(()=>encloseOriginalClosestTriangle(c,p,t,{ab,ac,bc:point(c,[0,2,1])})).toThrow(/empty|disjoint|intersection/);
   expect(()=>encloseOriginalClosestTriangle(c,p,t,{ab:point(c,[0,2,0]),ac,bc})).toThrow(/empty|disjoint|intersection/);
  }
 });
 it('allows equivalent refined constant edges but never uses a warmed projection to skip fresh validation',()=>{
  const c=new OriginalFloatIntervalContext({},policy),p=point(c,[1,.25,.25]),t=triangle(c),constant={ab:point(c,[0,1,0]),ac:point(c,[0,0,1]),bc:point(c,[0,-1,1])};
  const first=encloseOriginalClosestTriangle(c,p,t),before=c.resources(),supplied=encloseOriginalClosestTriangle(c,p,t,constant);expect(resultBits(supplied)).toEqual(resultBits(first));expect(c.resources().triangleProjectionProofHits-before.triangleProjectionProofHits).toBe(3);
  expect(()=>encloseOriginalClosestTriangle(c,p,t,{...constant,ab:point(c,[0,2,0])})).toThrow(/empty|disjoint|intersection/);
  const foreign=new OriginalFloatIntervalContext().point(1);expect(()=>encloseOriginalClosestTriangle(c,p,t,{...constant,ac:{...constant.ac,z:foreign}})).toThrow(/foreign/);
 });
 it('keys ordered projections, signed-zero bits and strict sign while omitting only x magnitude',()=>{
  const c=new OriginalFloatIntervalContext({},policy),ab=point(c,[0,1,0]),ac=point(c,[0,0,2]),w=point(c,[1,.25,.5]),first=pair(c,ab,ac,w)!;
  expect(first).toEqual([{lo:.25,hi:.25},{lo:1,hi:1}]);expect(Object.isFrozen(first)).toBe(true);expect(Object.isFrozen(first[0])).toBe(true);expect(Object.isFrozen(first[1])).toBe(true);
  expect(pair(c,ab,ac,{...w,x:c.point(8)})).toBe(first);expect(pair(c,ac,ab,w)).not.toBe(first);expect(pair(c,{...ab,x:c.point(-0)},ac,w)).not.toBe(first);expect(pair(c,ab,{...ac,x:c.point(-0)},w)).not.toBe(first);expect(pair(c,ab,ac,{...w,x:c.point(-1)})).not.toBe(first);
  expect(pair(c,ab,ac,{...w,y:c.point(.5)})).not.toBe(first);expect(pair(c,ab,ac,{...w,z:c.point(.25)})).not.toBe(first);
  const zero=pair(c,ab,ac,{...w,y:c.point(+0)})!;expect(pair(c,ab,ac,{...w,y:c.point(-0)})).not.toBe(zero);expect(boxBits(c.point(-0))).toEqual([bits(-0),bits(-0)]);
 });
 it('accepts same-sign finite subnormal/extreme projection magnitudes without altering dot bits',()=>{
  for(const sign of [1,-1]){
   const c=new OriginalFloatIntervalContext({},policy),ab=point(c,[0,1,0]),ac=point(c,[0,0,1]),w=point(c,[sign,.25,.5]),first=pair(c,ab,ac,w)!;
   for(const magnitude of [Number.MIN_VALUE,Number.MAX_VALUE]){const current={...w,x:c.point(sign*magnitude)};expect(pair(c,ab,ac,current)).toBe(first);const cold=new OriginalFloatIntervalContext(),cab=point(cold,[0,1,0]),cac=point(cold,[0,0,1]),cw=point(cold,[sign*magnitude,.25,.5]);expect(first.map(boxBits)).toEqual([boxBits(cold.dot3(cab.x,cab.y,cab.z,cw.x,cw.y,cw.z)),boxBits(cold.dot3(cac.x,cac.y,cac.z,cw.x,cw.y,cw.z))]);}
  }
 });
 it('falls back for projection sign ambiguity or nonzero edge x while keeping ownership checks first',()=>{
  const c=new OriginalFloatIntervalContext({},policy),ab=point(c,[0,1,0]),ac=point(c,[0,0,1]),w=point(c,[1,.25,.5]);pair(c,ab,ac,w);const before=c.resources();
  for(const x of [c.box(-1,1),c.box(0,1),c.box(-1,-0),c.point(+0),c.point(-0)])expect(pair(c,ab,ac,{...w,x})).toBeUndefined();
  expect(pair(c,{...ab,x:c.point(Number.MIN_VALUE)},ac,w)).toBeUndefined();expect(pair(c,ab,{...ac,x:c.point(1)},w)).toBeUndefined();expect(c.resources().triangleProjectionProofHits).toBe(before.triangleProjectionProofHits);
  const foreign=new OriginalFloatIntervalContext().point(0);expect(()=>pair(c,ab,ac,{...w,x:c.point(0),y:foreign})).toThrow(/foreign/);
 });
 it('rejects forged/foreign boxes in every ordered operand slot on warmed lookups',()=>{
  const c=new OriginalFloatIntervalContext({},policy),ab=point(c,[0,1,0]),ac=point(c,[0,0,1]),w=point(c,[1,.25,.5]);pair(c,ab,ac,w);const good=[ab.x,ab.y,ab.z,ac.x,ac.y,ac.z,w.x,w.y,w.z];
  for(const bad of [new OriginalFloatIntervalContext().point(0),Object.freeze({lo:0,hi:0})])for(let slot=0;slot<9;slot++){const values=[...good];values[slot]=bad;const before=c.resources();expect(()=>c.triangleZeroXDotPair(values[0],values[1],values[2],values[3],values[4],values[5],values[6],values[7],values[8])).toThrow(/foreign/);expect(c.resources().triangleProjectionProofHits).toBe(before.triangleProjectionProofHits);}
 });
 it('does not retain failed cold dot pairs and respects lowered operation caps',()=>{
  const c=new OriginalFloatIntervalContext({},policy),ab=point(c,[0,Number.MAX_VALUE,0]),ac=point(c,[0,0,1]),w=point(c,[1,Number.MAX_VALUE,0]);
  for(let attempt=0;attempt<2;attempt++)expect(()=>pair(c,ab,ac,w)).toThrow(/overflow/);expect(c.resources()).toMatchObject({triangleProjectionProofRecords:0,triangleProjectionProofHits:0});
  const short=new OriginalFloatIntervalContext({operations:40},policy),sab=point(short,[0,1,0]),sac=point(short,[0,0,1]),sw=point(short,[1,.25,.5]);expect(()=>pair(short,sab,sac,sw)).toThrow(/operation-cap/);expect(short.resources().chargedOperations).toBeLessThanOrEqual(40);expect(short.resources()).toMatchObject({triangleProjectionProofRecords:0,noBudgetReset:true});
 });
 it('computes cold pairs without retaining them when the combined cache is full',()=>{
  const c=new OriginalFloatIntervalContext({boxes:128},policy),ab=point(c,[0,1,0]),ac=point(c,[0,0,1]),w=point(c,[1,-1,-1]);pair(c,ac,ab,w);
  while(c.resources().retainedReuseRecords<128)c.reserveSeparatedHullCapture(ab.x);
  const before=c.resources(),first=pair(c,ab,ac,w)!,second=pair(c,ab,ac,w)!;expect(first).toEqual(second);expect(first).not.toBe(second);expect(c.resources().triangleProjectionProofRecords).toBe(before.triangleProjectionProofRecords);expect(c.resources().triangleProjectionProofHits).toBe(before.triangleProjectionProofHits);expect(c.resources().retainedReuseRecords).toBe(128);
 });
});
