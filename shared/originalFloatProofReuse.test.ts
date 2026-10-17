import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';

const policy=Object.freeze({primitiveProofReuse:true as const});
const view=new DataView(new ArrayBuffer(8));
function words(value:number):bigint {view.setFloat64(0,value,false);return view.getBigUint64(0,false);}
function dyadic(value:number):{n:bigint;d:bigint} {
 view.setFloat64(0,value,false);const high=view.getUint32(0,false),low=view.getUint32(4,false),e=(high>>>20)&2047;
 const n=BigInt(high&0xfffff)*4294967296n+BigInt(low)+(e===0?0n:4503599627370496n),p=(e===0?-1022:e-1023)-52;
 return p<0?{n,d:1n<<BigInt(-p)}:{n:n<<BigInt(p),d:1n};
}
function rootBracket(input:number,root:OriginalFloatBox):void {
 const target=dyadic(input),lower=dyadic(root.lo),upper=dyadic(root.hi);
 expect(lower.n*lower.n*target.d<=target.n*lower.d*lower.d).toBe(true);
 expect(upper.n*upper.n*target.d>=target.n*upper.d*upper.d).toBe(true);
 if(root.lo!==root.hi)expect(words(root.hi)-words(root.lo)).toBe(1n);
}

describe('opt-in bounded primitive proof reuse',()=>{
 it('keeps cold numerical corners and independent exact root brackets',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.box(-3,2),b=c.box(-5,7);
  expect(c.add(a,b)).toEqual({lo:-8,hi:9});expect(c.sub(a,b)).toEqual({lo:-10,hi:7});
  expect(c.mul(a,b)).toEqual({lo:-21,hi:15});expect(c.div(a,c.box(-4,-2))).toEqual({lo:-1,hi:1.5});
  const x=dyadic(1+2**-52),y=dyadic(1-2**-52),rn=c.mul(c.point(1+2**-52),c.point(1-2**-52));
  expect(x.n*y.n<x.d*y.d).toBe(true);expect(rn).toEqual({lo:1,hi:1});expect(c.sub(rn,c.point(1))).toEqual({lo:0,hi:0});
  for(const x of [0,1,2,4,Number.MIN_VALUE,2**-1022,Number.MAX_VALUE])rootBracket(x,c.sqrtReal(c.point(x)));
  expect(c.resources().actualFloatCertified).toBe(false);expect(c.resources().runtimeMathSqrtCertified).toBe(false);
 });
 it('reduces repeated work while charging hits and preserving exact results',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.box(-3,2),b=c.box(-5,7),before=c.resources(),first=c.mul(a,b),cold=c.resources();
  expect(c.mul(a,b)).toEqual(first);const hot=c.resources();
  expect(hot.chargedOperations-cold.chargedOperations).toBeGreaterThan(0);
  expect(hot.chargedOperations-cold.chargedOperations).toBeLessThan(cold.chargedOperations-before.chargedOperations);
  const x=c.point(2),root=c.sqrtReal(x),r=c.resources();expect(c.sqrtReal(x)).toEqual(root);
  expect(c.resources().sqrtSquareComparisons).toBe(r.sqrtSquareComparisons);expect(c.resources().noBudgetReset).toBe(true);
 });
 it('distinguishes endpoint bits including zero signs without claiming signed-zero certification',()=>{
  const c=new OriginalFloatIntervalContext({},policy),p=c.point(0),n=c.point(-0),one=c.point(1);
  const positive=c.mul(p,one),negative=c.mul(n,one);
  expect(Object.is(positive.lo,0)).toBe(true);expect(Object.is(negative.lo,-0)).toBe(true);
  expect(Object.is(c.mul(n,one).hi,-0)).toBe(true);expect(c.compare(p,n,'===')).toBe('true');
  const adjacent=c.point(1+2**-52);expect(c.add(one,one).lo).toBe(2);expect(c.add(adjacent,one).lo).toBe(2);expect(c.mul(adjacent,one).lo).toBe(1+2**-52);
  expect(c.resources().signedZeroCertified).toBe(false);
 });
 it('does not turn matching ranges or aliases into same-value dependency',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.box(-3,2),alias=c.box(-3,2);
  for(const b of [a,alias]){expect(c.compare(a,b,'===')).toBe('unknown');expect(c.sub(a,b)).toEqual({lo:-5,hi:5});expect(c.mul(a,b)).toEqual({lo:-6,hi:9});}
  expect(c.square(a)).toEqual({lo:0,hi:9});expect(c.square(alias)).toEqual({lo:0,hi:9});expect(c.mul(a,a)).toEqual({lo:-6,hi:9});
 });
 it('checks ownership before warmed proof lookup',()=>{
  const c=new OriginalFloatIntervalContext({},policy),a=c.box(1,2),b=c.box(3,4);c.add(a,b);c.sqrtReal(a);
  const foreign=new OriginalFloatIntervalContext({},policy).box(1,2),forged=Object.freeze({lo:1,hi:2});
  for(const invalid of [foreign,forged]){expect(()=>c.add(invalid,b)).toThrow(/foreign/);expect(()=>c.sqrtReal(invalid)).toThrow(/foreign/);expect(()=>c.compare(invalid,a,'===')).toThrow(/foreign/);}
 });
 it('never memoizes failed overflow, domain, precision or clamp proofs',()=>{
  const c=new OriginalFloatIntervalContext({},policy),large=c.point(Number.MAX_VALUE),two=c.point(2),negative=c.box(-1,1),zero=c.point(0),one=c.point(1);
  const initial=c.resources().primitiveProofHits;
  for(let i=0;i<2;i++){
   expect(()=>c.mul(large,two)).toThrow(/overflow/);expect(()=>c.add(large,large)).toThrow(/nonfinite/);
   expect(()=>c.sqrtReal(negative)).toThrow(/negative/);expect(()=>c.div(one,zero)).toThrow(/zero/);expect(()=>c.clamp(one,2,1)).toThrow(/clamp/);
  }
  expect(c.resources().primitiveProofHits).toBe(initial);
  const narrow=new OriginalFloatIntervalContext({rationalBits:64},policy),small=narrow.point(Number.MIN_VALUE);
  for(let i=0;i<2;i++)expect(()=>narrow.sqrtReal(small)).toThrow(/rational-bit/);
  expect(narrow.resources().noBudgetReset).toBe(true);
 });
 it('eventually exhausts an unchanged operation budget even using only cache hits',()=>{
  const c=new OriginalFloatIntervalContext({operations:120},policy),a=c.point(1),b=c.point(2);expect(c.add(a,b)).toEqual({lo:3,hi:3});
  let count=0;expect(()=>{for(;count<121;count++)c.add(a,b);}).toThrow(/operation-cap/);
  expect(count).toBeLessThan(121);expect(c.resources().chargedOperations).toBeLessThanOrEqual(120);expect(c.resources().noBudgetReset).toBe(true);
 });
 it('shares one bounded record cap and computes normally after saturation',()=>{
  const c=new OriginalFloatIntervalContext({boxes:8},policy),a=c.point(1),b=c.point(2);c.point(0);
  for(const operator of ['<','<=','===','>','>='] as const)c.compare(a,b,operator);
  const full=c.resources();expect(full.retainedReuseRecords).toBe(8);expect(full.maxRetainedReuseRecords).toBe(8);
  expect(full.primitiveProofRecords+full.canonicalBoxRecords).toBe(full.retainedReuseRecords);
  const product=c.mul(a,b),first=c.resources();expect(product).toEqual({lo:2,hi:2});expect(c.mul(a,b)).toEqual({lo:2,hi:2});
  const second=c.resources();expect(second.retainedReuseRecords).toBe(8);expect(second.primitiveProofRecords).toBe(full.primitiveProofRecords);
  expect(second.chargedOperations-first.chargedOperations).toBeGreaterThan(4);expect(second.createdBoxes).toBeLessThanOrEqual(8);
  expect(second.physicalBoxAllocations).toBe(second.createdBoxes);expect(second.accounting).toBe('source-proof-computations');
  expect(second.primitiveProofReuse).toBe(true);expect(second.noBudgetReset).toBe(true);
 });
 it('requires a frozen ordinary explicit opt-in data policy',()=>{
  expect(()=>new OriginalFloatIntervalContext({}, {primitiveProofReuse:true})).toThrow();
  const accessor={};Object.defineProperty(accessor,'primitiveProofReuse',{get:()=>true,enumerable:true});Object.freeze(accessor);
  expect(()=>new OriginalFloatIntervalContext({},accessor as typeof policy)).toThrow();
  expect(()=>new OriginalFloatIntervalContext({},Object.freeze(Object.create({primitiveProofReuse:true})) as typeof policy)).toThrow();
  expect(()=>new OriginalFloatIntervalContext({},Object.freeze({primitiveProofReuse:'yes'}) as unknown as typeof policy)).toThrow();
  expect(()=>new OriginalFloatIntervalContext({},Object.freeze({...policy,extra:1}))).toThrow();
  const ordinary=new OriginalFloatIntervalContext(),a=ordinary.point(1),b=ordinary.point(2);ordinary.add(a,b);const cold=ordinary.resources();ordinary.add(a,b);
  expect(ordinary.resources()).toMatchObject({primitiveProofReuse:false,retainedReuseRecords:0,accounting:'source-scalar-proof-occurrences'});
  expect(ordinary.resources().createdBoxes).toBe(cold.createdBoxes+1);
 });
});
