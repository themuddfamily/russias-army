import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,ORIGINAL_FLOAT_INTERVAL_LIMITS,type OriginalFloatBox} from './originalFloatInterval';

const policy=Object.freeze({primitiveProofReuse:true as const});
const view=new DataView(new ArrayBuffer(8));
const bits=(value:number):bigint=>{view.setFloat64(0,value,false);return view.getBigUint64(0,false);};
const fromBits=(value:bigint):number=>{view.setBigUint64(0,value,false);return view.getFloat64(0,false);};
interface Rational {n:bigint;d:bigint}
/** Independent word-based decoding; the reference never computes a floating root. */
function exact(value:number):Rational {
 view.setFloat64(0,value,false);const high=view.getUint32(0,false),low=view.getUint32(4,false),exponent=(high>>>20)&2047;
 if(exponent===2047)throw Error('finite reference required');
 const significand=BigInt(high&0xfffff)*4294967296n+BigInt(low)+(exponent===0?0n:4503599627370496n);
 if(significand===0n)return {n:0n,d:1n};
 const power=(exponent===0?-1022:exponent-1023)-52,sign=high>>>31?-1n:1n;
 return power<0?{n:sign*significand,d:2n**BigInt(-power)}:{n:sign*significand*2n**BigInt(power),d:1n};
}
function compareSquare(candidate:number,input:number):number {
 const c=exact(candidate),x=exact(input),left=c.n*c.n*x.d,right=x.n*c.d*c.d;
 return left<right?-1:left>right?1:0;
}
function bracket(input:number,result:OriginalFloatBox):void {
 expect(compareSquare(result.lo,input)).toBeLessThanOrEqual(0);
 expect(compareSquare(result.hi,input)).toBeGreaterThanOrEqual(0);
 if(bits(result.lo)===bits(result.hi))expect(compareSquare(result.lo,input)).toBe(0);
 else {
  expect(bits(result.hi)).toBe(bits(result.lo)+1n);
  expect(compareSquare(result.lo,input)).toBe(-1);expect(compareSquare(result.hi,input)).toBe(1);
 }
}
function comparePaths(input:number):void {
 const cold=new OriginalFloatIntervalContext(),fast=new OriginalFloatIntervalContext({},policy);
 const expected=cold.sqrtReal(cold.point(input)),actual=fast.sqrtReal(fast.point(input));
 expect([bits(actual.lo),bits(actual.hi)]).toEqual([bits(expected.lo),bits(expected.hi)]);bracket(input,actual);
 expect(fast.resources().sqrtSquareComparisons).toBe(input===0?1:2);
 expect(fast.resources().chargedOperations).toBeLessThan(cold.resources().chargedOperations);
 expect(fast.resources()).toMatchObject({actualFloatCertified:false,signedZeroCertified:false,runtimeMathSqrtCertified:false,noBudgetReset:true});
}

describe('opt-in exact integer real-root proofs',()=>{
 it('matches cold endpoint bits for zero, subnormal transitions, odd exponents and maximum finite inputs',()=>{
  const minimumNormal=2**-1022;
  for(const input of [0,-0,Number.MIN_VALUE,2*Number.MIN_VALUE,3*Number.MIN_VALUE,
   fromBits(bits(minimumNormal)-1n),minimumNormal,fromBits(bits(minimumNormal)+1n),
   2**-1073,2**-1021,fromBits(bits(Number.MAX_VALUE)-1n),Number.MAX_VALUE])comparePaths(input);
  const c=new OriginalFloatIntervalContext({},policy),zero=c.sqrtReal(c.point(-0));
  expect(bits(zero.lo)).toBe(0n);expect(bits(zero.hi)).toBe(0n);
 });

 // Small exponent bands preserve ordinary per-test timeouts, while covering
 // every power of two. Every proof also owns a fresh bounded context.
 for(let start=-1074;start<=1023;start+=128){
  const end=Math.min(start+127,1023);
  it(`checks all powers of two and finite neighbors at exponents ${start} through ${end}`,()=>{
   for(let exponent=start;exponent<=end;exponent++){
    const input=2**exponent,key=bits(input);
    if(key>1n)comparePaths(fromBits(key-1n));
    comparePaths(input);comparePaths(fromBits(key+1n));
   }
  });
 }

 it('returns exact squares at root exponent extremes and brackets adjacent input values',()=>{
  for(const exponent of [-537,-511,-1,0,1,255,511]){
   const input=2**(2*exponent),root=2**exponent,c=new OriginalFloatIntervalContext({},policy);
   const actual=c.sqrtReal(c.point(input));expect([bits(actual.lo),bits(actual.hi)]).toEqual([bits(root),bits(root)]);
   bracket(input,actual);
   if(bits(input)>1n)comparePaths(fromBits(bits(input)-1n));comparePaths(fromBits(bits(input)+1n));
  }
  for(const input of [1,2,4])for(const offset of [-1n,0n,1n])comparePaths(fromBits(bits(input)+offset));
 });

 it('bounds both endpoints of a complete interval without conflating adjacency with interval width',()=>{
  for(const [lo,hi] of [[Number.MIN_VALUE,Number.MAX_VALUE],[2,3],[0,2**-1022]] as const){
   const cold=new OriginalFloatIntervalContext(),fast=new OriginalFloatIntervalContext({},policy);
   const expected=cold.sqrtReal(cold.box(lo,hi)),actual=fast.sqrtReal(fast.box(lo,hi));
   expect([bits(actual.lo),bits(actual.hi)]).toEqual([bits(expected.lo),bits(expected.hi)]);
   expect(compareSquare(actual.lo,lo)).toBeLessThanOrEqual(0);expect(compareSquare(actual.hi,hi)).toBeGreaterThanOrEqual(0);
   expect(fast.resources().sqrtSquareComparisons).toBe(lo===0?3:4);
  }
 });

 it('preserves the default binary search and its exact charged work',()=>{
  for(const input of [0,1,2,Number.MIN_VALUE,Number.MAX_VALUE]){
   let lo=0n,hi=0x7fefffffffffffffn,comparisons=0;
   while(lo<hi){const middle=(lo+hi+1n)>>1n;comparisons++;if(compareSquare(fromBits(middle),input)<=0)lo=middle;else hi=middle-1n;}
   comparisons++;
   const c=new OriginalFloatIntervalContext(),actual=c.sqrtReal(c.point(input));bracket(input,actual);
   expect(c.resources()).toMatchObject({sqrtSquareComparisons:comparisons,chargedOperations:5+6*comparisons,
    createdBoxes:2,primitiveProofReuse:false,primitiveProofHits:0,retainedReuseRecords:0,accounting:'source-scalar-proof-occurrences'});
  }
 });

 it('charges warmed proofs and fails closed at lowered operation and box caps without resetting',()=>{
  const c=new OriginalFloatIntervalContext({operations:160},policy),input=c.point(2),result=c.sqrtReal(input),before=c.resources();
  expect(c.sqrtReal(input)).toBe(result);expect(c.resources().chargedOperations-before.chargedOperations).toBe(2);
  expect(c.resources().sqrtSquareComparisons).toBe(before.sqrtSquareComparisons);
  for(let step=0;step<160;step++){
   if(c.resources().chargedOperations+2>160){expect(()=>c.sqrtReal(input)).toThrow(/operation-cap/);break;}
   c.sqrtReal(input);
  }
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(160);expect(c.resources().noBudgetReset).toBe(true);
  const short=new OriginalFloatIntervalContext({operations:12},policy),point=short.point(2);
  expect(()=>short.sqrtReal(point)).toThrow(/operation-cap/);expect(short.resources().primitiveProofRecords).toBe(0);
  expect(short.resources().chargedOperations).toBeLessThanOrEqual(12);
  const oneBox=new OriginalFloatIntervalContext({boxes:1},policy),two=oneBox.point(2);
  expect(()=>oneBox.sqrtReal(two)).toThrow(/box-cap/);expect(oneBox.resources().createdBoxes).toBe(1);
 });

 it('guards decoded values and expanded integer intermediates at lowered rational bit caps',()=>{
  for(const [rationalBits,input] of [[64,Number.MIN_VALUE],[1024,Number.MIN_VALUE],[1100,Number.MIN_VALUE],[128,1]] as const){
   const c=new OriginalFloatIntervalContext({rationalBits},policy),point=c.point(input);
   for(let attempt=0;attempt<2;attempt++)expect(()=>c.sqrtReal(point)).toThrow(/rational-bit-cap/);
   expect(c.resources()).toMatchObject({maxRationalBits:rationalBits,primitiveProofRecords:0,primitiveProofHits:0,noBudgetReset:true});
  }
  expect(ORIGINAL_FLOAT_INTERVAL_LIMITS).toEqual({operations:100000,boxes:16384,rationalBits:4096});
  for(const limits of [{operations:100001},{boxes:16385},{rationalBits:4097}])expect(()=>new OriginalFloatIntervalContext(limits,policy)).toThrow(/lowered/);
 });

 it('rejects negative domains and foreign boxes before a cached root lookup',()=>{
  const c=new OriginalFloatIntervalContext({},policy),point=c.point(2);c.sqrtReal(point);const before=c.resources();
  for(const bad of [new OriginalFloatIntervalContext({},policy).point(2),Object.freeze({lo:2,hi:2})])expect(()=>c.sqrtReal(bad)).toThrow(/foreign/);
  expect(c.resources().primitiveProofHits).toBe(before.primitiveProofHits);
  for(const input of [c.point(-Number.MIN_VALUE),c.box(-1,1)])expect(()=>c.sqrtReal(input)).toThrow(/negative-real-root-domain/);
 });
});
