import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {encloseOriginalClosestSegments,originalFloatVectorPoint,type OriginalFloatVectorBox} from './originalFiniteFeatureInterval';

const policy=Object.freeze({primitiveProofReuse:true as const});
type XYZ=readonly [number,number,number];
const point=(c:OriginalFloatIntervalContext,p:XYZ)=>originalFloatVectorPoint(c,{x:p[0],y:p[1],z:p[2]});
const word=new DataView(new ArrayBuffer(8));
const bits=(n:number)=>{word.setFloat64(0,n,false);return word.getBigUint64(0,false);};
const boxBits=(b:OriginalFloatBox)=>[bits(b.lo),bits(b.hi)];
const vectorBits=(v:OriginalFloatVectorBox)=>[boxBits(v.x),boxBits(v.y),boxBits(v.z)];
const resultBits=(r:ReturnType<typeof encloseOriginalClosestSegments>)=>({first:vectorBits(r.first),second:vectorBits(r.second),paths:r.paths});
const parameters=(c:OriginalFloatIntervalContext,u:OriginalFloatVectorBox,v:OriginalFloatVectorBox,w:OriginalFloatVectorBox,...cc:[]|[OriginalFloatBox])=>c.segmentSaturatedParameters(u.x,u.y,u.z,v.x,v.y,v.z,w.x,w.y,w.z,...cc);
const fixture=(c:OriginalFloatIntervalContext,wx=2,wy=0,wz=.5)=>({u:point(c,[1,1,0]),v:point(c,[0,0,1]),w:point(c,[wx,wy,wz])});
const solve=(c:OriginalFloatIntervalContext,wx:number,wy=0,wz=.5,offset:XYZ=[0,0,0])=>{
 const p:readonly XYZ[]=[[0,wy,wz],[1,wy+1,wz],[-wx,0,0],[-wx,0,1]],moved=p.map(v=>point(c,[v[0]+offset[0],v[1]+offset[1],v[2]+offset[2]]));
 return encloseOriginalClosestSegments(c,moved[0],moved[1],moved[2],moved[3]);
};

describe('bounded signed-x envelope saturated segment parameter reuse',()=>{
 it('leaves the default unused abstraction entirely uncharged',()=>{
  const c=new OriginalFloatIntervalContext(),f=fixture(c),before=c.resources();expect(parameters(c,f.u,f.v,f.w)).toBeUndefined();expect(c.resources()).toEqual(before);
 });
 it.each([1,-1])('keeps uncached witness bits while reusing decisive s=%s sign coefficients at new positions',sign=>{
  const c=new OriginalFloatIntervalContext({},policy),f=fixture(c,sign*2),descriptor=parameters(c,f.u,f.v,f.w)!;
  expect(descriptor).toHaveLength(1);expect(descriptor[0].path).toBe('nonparallel-interior');expect(descriptor[0].s).toEqual({lo:sign>0?0:1,hi:sign>0?0:1});expect(descriptor[0].t).toEqual({lo:.5,hi:.5});expect(descriptor[0].early).toBe(false);
  expect(Object.isFrozen(descriptor)).toBe(true);expect(Object.isFrozen(descriptor[0])).toBe(true);expect(Object.isFrozen(descriptor[0].s)).toBe(true);expect(Object.isFrozen(descriptor[0].t)).toBe(true);
  const before=c.resources(),results=[];
  for(const [magnitude,offset] of [[2,[0,0,0]],[2.5,[8,4,2]],[3,[-8,8,-2]]] as const){const actual=solve(c,sign*magnitude,0,.5,offset);expect(resultBits(actual)).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),sign*magnitude,0,.5,offset)));results.push(actual);}
  expect(c.resources().segmentSaturationProofHits-before.segmentSaturationProofHits).toBe(3);expect(vectorBits(results[1].second)).not.toEqual(vectorBits(results[0].second));
 });
 it('retains nonparallel low/high branch order and endpoint clamp witnesses',()=>{
  for(const sign of [1,-1])for(const [wz,path] of [[-1,'nonparallel-low'],[2,'nonparallel-high']] as const){
   const c=new OriginalFloatIntervalContext({},policy);solve(c,sign*2,0,wz);const before=c.resources(),warm=solve(c,sign*3,0,wz);
   expect(warm.paths).toEqual([path]);expect(resultBits(warm)).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),sign*3,0,wz)));expect(c.resources().segmentSaturationProofHits-before.segmentSaturationProofHits).toBe(1);
  }
 });
 it('matches decisive parallel low, high and interior paths with current witnesses',()=>{
  for(const sign of [1,-1])for(const [wy,path] of [[-2,'parallel-low'],[2,'parallel-high'],[.5,'parallel-interior']] as const){
   const evaluate=(c:OriginalFloatIntervalContext,wx:number)=>{
    const p:readonly XYZ[]=[[0,wy,0],[2**-30,wy+1,0],[-wx,0,0],[-wx,1,0]],v=p.map(x=>point(c,x));return encloseOriginalClosestSegments(c,v[0],v[1],v[2],v[3]);
   };
   const c=new OriginalFloatIntervalContext({},policy),cold=evaluate(c,sign*2**60),before=c.resources(),warm=evaluate(c,sign*1.5*2**60);
   expect(cold.paths).toEqual([path]);expect(resultBits(cold)).toEqual(resultBits(evaluate(new OriginalFloatIntervalContext(),sign*2**60)));expect(resultBits(warm)).toEqual(resultBits(evaluate(new OriginalFloatIntervalContext(),sign*1.5*2**60)));expect(c.resources().segmentSaturationProofHits-before.segmentSaturationProofHits).toBe(1);
  }
 });
 it('preserves signed zero in current witnesses and in ordered cache operands',()=>{
  const c=new OriginalFloatIntervalContext({},policy),f=fixture(c,2,0,-0),first=parameters(c,f.u,f.v,f.w)!;
  expect(parameters(c,f.u,f.v,{...f.w,y:c.point(-0)})).not.toBe(first);expect(parameters(c,{...f.u,z:c.point(-0)},f.v,f.w)).not.toBe(first);
  for(const wx of [2,3])expect(resultBits(solve(c,wx,0,-0))).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),wx,0,-0)));
  expect(boxBits(c.point(-0))).toEqual([bits(-0),bits(-0)]);
 });
 it('keys signed binade envelopes and safely falls back across their boundary',()=>{
  const c=new OriginalFloatIntervalContext({},policy),f=fixture(c),first=parameters(c,f.u,f.v,f.w)!;
  expect(parameters(c,f.u,f.v,{...f.w,x:c.box(2,4)})).toBe(first);
  expect(parameters(c,f.u,f.v,{...f.w,x:c.box(-4,-2)})).not.toBe(first);
  const before=c.resources();expect(parameters(c,f.u,f.v,{...f.w,x:c.box(2,4+Number.EPSILON*4)})).toBeUndefined();expect(parameters(c,f.u,f.v,{...f.w,x:c.box(-1,1)})).toBeUndefined();expect(parameters(c,f.u,f.v,{...f.w,x:c.point(0)})).toBeUndefined();expect(c.resources().segmentSaturationProofHits).toBe(before.segmentSaturationProofHits);
  for(const wx of [2,4,4+Number.EPSILON*4,-2,-4])expect(resultBits(solve(c,wx))).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),wx)));
 });
 it('rejects subnormal/extreme envelopes while preserving successful scalar fallback',()=>{
  const c=new OriginalFloatIntervalContext({},policy),f=fixture(c),before=c.resources();
  for(const wx of [Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,2**-129,2**129])expect(parameters(c,f.u,f.v,{...f.w,x:c.point(wx)})).toBeUndefined();
  expect(c.resources().segmentSaturationProofRecords).toBe(before.segmentSaturationProofRecords);
  for(const wx of [Number.MIN_VALUE,-Number.MIN_VALUE,2**-129,2**129])expect(resultBits(solve(c,wx))).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),wx)));
  for(const exponent of [-128,128]){
   expect(parameters(c,f.u,f.v,{...f.w,x:c.box(2**exponent,2**(exponent+1))})).toBeDefined();
   for(const wx of [2**exponent,2**(exponent+1)])expect(resultBits(solve(c,wx))).toEqual(resultBits(solve(new OriginalFloatIntervalContext(),wx)));
  }
 });
 it('does not cache unsaturated interior s, ambiguous clamps, or ambiguous aa/cc/parallel proofs',()=>{
  const c=new OriginalFloatIntervalContext({},policy),f=fixture(c),candidates=[
   {u:f.u,v:f.v,w:point(c,[-.5,0,.5])},
   {u:f.u,v:f.v,w:{...f.w,z:c.box(-.125,.125)}},
   {u:{...f.u,x:c.box(-1,1),y:c.point(0)},v:f.v,w:f.w},
   {u:f.u,v:{...f.v,z:c.box(0,1)},w:f.w},
   {u:{x:c.box(2**-26,2**-25),y:c.point(1),z:c.point(0)},v:point(c,[0,1,0]),w:point(c,[2**60,2,0])},
   {u:point(c,[Number.MIN_VALUE,0,0]),v:f.v,w:f.w},
  ];
  for(const candidate of candidates){const before=c.resources();expect(parameters(c,candidate.u,candidate.v,candidate.w)).toBeUndefined();expect(c.resources().segmentSaturationProofRecords).toBe(before.segmentSaturationProofRecords);expect(c.resources().segmentSaturationProofHits).toBe(before.segmentSaturationProofHits);}
 });
 it('keeps degenerate directions and nonzero vx on the authentic scalar fallback path',()=>{
  const c=new OriginalFloatIntervalContext({},policy),f=fixture(c),zero=point(c,[0,0,0]);
  for(const [u,v] of [[zero,zero],[zero,f.v],[f.u,zero],[f.u,point(c,[1,0,0])]])expect(parameters(c,u,v,f.w)).toBeUndefined();
  const cases:readonly (readonly XYZ[])[]=[[[2,0,0],[2,0,0],[0,0,0],[0,0,0]],[[2,0,.5],[2,0,.5],[0,0,0],[0,0,1]],[[0,0,0],[1,1,0],[-2,0,0],[-2,0,0]],[[2,1,0],[3,1,0],[0,0,0],[1,0,0]]];
  for(const raw of cases){const evaluate=(context:OriginalFloatIntervalContext)=>{const p=raw.map(v=>point(context,v));return encloseOriginalClosestSegments(context,p[0],p[1],p[2],p[3]);};expect(resultBits(evaluate(c))).toEqual(resultBits(evaluate(new OriginalFloatIntervalContext())));}
 });
 it('checks forged/foreign boxes in all ordered slots and explicit cc before warm eligibility',()=>{
  const c=new OriginalFloatIntervalContext({},policy),f=fixture(c),cc=c.point(1);parameters(c,f.u,f.v,f.w,cc);const good=[f.u.x,f.u.y,f.u.z,f.v.x,f.v.y,f.v.z,f.w.x,f.w.y,f.w.z,cc];
  for(const bad of [new OriginalFloatIntervalContext().point(1),Object.freeze({lo:1,hi:1})])for(let slot=0;slot<10;slot++){const values=[...good];values[slot]=bad;const before=c.resources();expect(()=>c.segmentSaturatedParameters(values[0],values[1],values[2],values[3],values[4],values[5],values[6],values[7],values[8],values[9])).toThrow(/foreign/);expect(c.resources().segmentSaturationProofHits).toBe(before.segmentSaturationProofHits);}
  expect(()=>parameters(c,f.u,f.v,f.w,undefined as unknown as OriginalFloatBox)).toThrow(/foreign/);
 });
 it('distinguishes reordered slots, cc presence and authenticated cc bounds',()=>{
  const c=new OriginalFloatIntervalContext({},policy),f=fixture(c),first=parameters(c,f.u,f.v,f.w)!,cc=c.point(1),supplied=parameters(c,f.u,f.v,f.w,cc)!;
  expect(supplied).not.toBe(first);expect(parameters(c,f.u,f.v,{...f.w,x:c.point(3)},cc)).toBe(supplied);expect(parameters(c,f.u,f.v,f.w,c.box(.5,1.5))).not.toBe(supplied);expect(()=>parameters(c,f.u,f.v,f.w,c.point(2))).toThrow(/empty|disjoint|intersection/);
  const before=c.resources();expect(parameters(c,f.v,f.u,f.w)).toBeUndefined();expect(c.resources().segmentSaturationProofHits).toBe(before.segmentSaturationProofHits);
 });
 it('never retains failed cold arithmetic and fails closed under reduced caps',()=>{
  const c=new OriginalFloatIntervalContext({},policy),f=fixture(c),u={...f.u,y:c.point(Number.MAX_VALUE)};
  for(let attempt=0;attempt<2;attempt++)expect(parameters(c,u,f.v,f.w)).toBeUndefined();expect(c.resources()).toMatchObject({segmentSaturationProofRecords:0,segmentSaturationProofHits:0});
  const overflow=(context:OriginalFloatIntervalContext)=>encloseOriginalClosestSegments(context,point(context,[0,0,0]),point(context,[1,Number.MAX_VALUE,0]),point(context,[-2,0,0]),point(context,[-2,0,1]));
  expect(()=>overflow(c)).toThrow(/overflow/);expect(()=>overflow(new OriginalFloatIntervalContext())).toThrow(/overflow/);expect(c.resources().segmentSaturationProofRecords).toBe(0);
  const short=new OriginalFloatIntervalContext({operations:40},policy),sf=fixture(short);expect(()=>parameters(short,sf.u,sf.v,sf.w)).toThrow(/operation-cap/);expect(short.resources().chargedOperations).toBeLessThanOrEqual(40);expect(short.resources()).toMatchObject({segmentSaturationProofRecords:0,noBudgetReset:true});
 });
 it('falls back when only the widened envelope overflows and preserves the finite actual source result',()=>{
  const evaluate=(c:OriginalFloatIntervalContext)=>encloseOriginalClosestSegments(c,point(c,[0,0,0]),point(c,[1,0,0]),point(c,[-(2**126),0,0]),point(c,[-(2**126),1.2e135,0]));
  const c=new OriginalFloatIntervalContext({},policy),f={u:point(c,[1,0,0]),v:point(c,[0,1.2e135,0]),w:point(c,[2**126,0,0])};
  expect(parameters(c,f.u,f.v,f.w)).toBeUndefined();expect(c.resources()).toMatchObject({segmentSaturationProofRecords:0,segmentSaturationProofHits:0});
  const actual=evaluate(c),cold=evaluate(new OriginalFloatIntervalContext());expect(actual.paths).toEqual(['nonparallel-interior']);expect(resultBits(actual)).toEqual(resultBits(cold));expect(c.resources().segmentSaturationProofRecords).toBe(0);
 });
 it('recomputes successful unretained descriptors when the shared record cap is full',()=>{
  const c=new OriginalFloatIntervalContext({boxes:256},policy),f=fixture(c);parameters(c,f.u,f.v,{...f.w,x:c.point(-2)});
  while(c.resources().retainedReuseRecords<256)c.reserveSeparatedHullCapture(f.u.z);
  const before=c.resources(),first=parameters(c,f.u,f.v,f.w)!,second=parameters(c,f.u,f.v,f.w)!;expect(first).toEqual(second);expect(first).not.toBe(second);expect(c.resources().segmentSaturationProofRecords).toBe(before.segmentSaturationProofRecords);expect(c.resources().segmentSaturationProofHits).toBe(before.segmentSaturationProofHits);expect(c.resources().retainedReuseRecords).toBe(256);
 });
});
