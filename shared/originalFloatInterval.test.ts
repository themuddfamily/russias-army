import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,ORIGINAL_FLOAT_INTERVAL_LIMITS,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';

interface Rational {n:bigint;d:bigint}
const view=new DataView(new ArrayBuffer(8));
/** Independent reference reads the two32-bit words and constructs exact dyadics. */
function exact(value:number):Rational {
  view.setFloat64(0,value,false);const high=view.getUint32(0,false),low=view.getUint32(4,false),exponent=(high>>>20)&2047;
  if(exponent===2047)throw Error('finite reference only');
  const significand=BigInt(high&0xfffff)*4294967296n+BigInt(low)+(exponent===0?0n:4503599627370496n);
  if(significand===0n)return {n:0n,d:1n};
  const power=(exponent===0?-1022:exponent-1023)-52,sign=high>>>31?-1n:1n;
  return power<0?{n:sign*significand,d:2n**BigInt(-power)}:{n:sign*significand*2n**BigInt(power),d:1n};
}
const times=(a:Rational,b:Rational):Rational=>({n:a.n*b.n,d:a.d*b.d});
const plus=(a:Rational,b:Rational):Rational=>({n:a.n*b.d+b.n*a.d,d:a.d*b.d});
const minus=(a:Rational,b:Rational):Rational=>plus(a,{n:-b.n,d:b.d});
const compare=(a:Rational,b:Rational)=>a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0;
function adjacent(value:number,up:boolean):number {
  if(value===0)return up?Number.MIN_VALUE:-Number.MIN_VALUE;
  view.setFloat64(0,value,false);const bits=view.getBigUint64(0,false);
  view.setBigUint64(0,bits+((value>0)===up?1n:-1n),false);return view.getFloat64(0,false);
}
function nearestEven(real:Rational,rounded:number):void {
  const halfway=(a:number,b:number)=>{const sum=plus(exact(a),exact(b));return {n:sum.n,d:sum.d*2n};};
  const lo=compare(real,halfway(adjacent(rounded,false),rounded)),hi=compare(real,halfway(rounded,adjacent(rounded,true)));
  expect(lo).toBeGreaterThanOrEqual(0);expect(hi).toBeLessThanOrEqual(0);
  if(lo===0||hi===0){view.setFloat64(0,rounded,false);expect(view.getBigUint64(0,false)&1n).toBe(0n);}
}
function realRootBracket(input:number,result:OriginalFloatBox):void {
  expect(compare(times(exact(result.lo),exact(result.lo)),exact(input))).toBeLessThanOrEqual(0);
  expect(compare(times(exact(result.hi),exact(result.hi)),exact(input))).toBeGreaterThanOrEqual(0);
  if(result.lo!==result.hi)expect(adjacent(result.lo,true)).toBe(result.hi);
}

describe('bounded source-RN numeric intervals and separate real roots',()=>{
  it('charges whole-box tri-valued source comparisons without dependency shortcuts',()=>{
    const c=new OriginalFloatIntervalContext(),a=c.box(-1,1),b=c.box(1,2),zero=c.point(0),same=c.point(-0);
    expect(c.compare(a,b,'<')).toBe('unknown');expect(c.compare(a,b,'<=')).toBe('true');
    expect(c.compare(a,b,'>')).toBe('false');expect(c.compare(a,b,'>=')).toBe('unknown');
    expect(c.compare(b,a,'>')).toBe('unknown');expect(c.compare(b,a,'>=')).toBe('true');
    expect(c.compare(b,zero,'<')).toBe('false');expect(c.compare(zero,b,'<=')).toBe('true');
    expect(c.compare(b,zero,'>')).toBe('true');expect(c.compare(zero,b,'>=')).toBe('false');
    expect(c.compare(zero,same,'===')).toBe('true');expect(c.compare(a,a,'===')).toBe('unknown');
    expect(c.compare(zero,b,'===')).toBe('false');expect(c.compare(a,b,'===')).toBe('unknown');
    expect(c.compare(zero,same,'<')).toBe('false');expect(c.compare(zero,same,'<=')).toBe('true');
    expect(()=>c.compare(zero,{lo:0,hi:0},'<')).toThrow(/foreign/);
    const before=c.resources();c.compare(a,b,'<');expect(c.resources().chargedOperations-before.chargedOperations).toBe(4);
    const limited=new OriginalFloatIntervalContext({operations:5}),x=limited.point(0),y=limited.point(1);
    expect(()=>limited.compare(x,y,'<')).toThrow(/operation-cap/);expect(limited.resources().chargedOperations).toBeLessThanOrEqual(5);
  });

  it('owns finite frozen boxes and rejects mutable, forged and foreign inputs',()=>{
    const c=new OriginalFloatIntervalContext(),a=c.box(-1,2),foreign=new OriginalFloatIntervalContext().point(1);
    expect(Object.isFrozen(a)).toBe(true);expect(Reflect.set(a,'lo',99)).toBe(false);
    expect(()=>c.add(a,{lo:0,hi:1})).toThrow(/foreign/);expect(()=>c.add(a,foreign)).toThrow(/foreign/);
    for(const [lo,hi] of [[NaN,1],[0,Infinity],[2,1]])expect(()=>c.box(lo,hi)).toThrow(UnsupportedFloatInterval);
  });

  it('encloses independent exact dyadic add/sub corners and finite cancellation',()=>{
    const c=new OriginalFloatIntervalContext(),a=c.box(-3,2),b=c.box(-5,7);
    expect(c.add(a,b)).toEqual({lo:-8,hi:9});expect(c.sub(a,b)).toEqual({lo:-10,hi:7});
    for(const x of [-3,2])for(const y of [-5,7]){
      nearestEven(plus(exact(x),exact(y)),x+y);nearestEven(minus(exact(x),exact(y)),x-y);
      expect(c.contains(c.add(a,b),x+y)).toBe(true);expect(c.contains(c.sub(a,b),x-y)).toBe(true);
    }
    expect(c.add(c.point(Number.MAX_VALUE),c.point(-Number.MAX_VALUE))).toEqual({lo:0,hi:0});
  });

  it('covers all four cross-sign product and nonzero divisor corners',()=>{
    const c=new OriginalFloatIntervalContext(),a=c.box(-3,2),b=c.box(-5,7),positive=c.box(2,4),negative=c.box(-4,-2);
    expect(c.mul(a,b)).toEqual({lo:-21,hi:15});expect(c.div(a,positive)).toEqual({lo:-1.5,hi:1});
    expect(c.div(a,negative)).toEqual({lo:-1,hi:1.5});
    const product=c.mul(a,b);
    for(const x of [-3,2])for(const y of [-5,7]){nearestEven(times(exact(x),exact(y)),x*y);expect(c.contains(product,x*y)).toBe(true);}
    for(const divisor of [2,4,-4,-2])for(const x of [-3,2]){
      const numerator=exact(x),denominator=exact(divisor),real={n:numerator.n*denominator.d*(denominator.n<0n?-1n:1n),d:numerator.d*(denominator.n<0n?-denominator.n:denominator.n)};
      nearestEven(real,x/divisor);expect(c.contains(c.div(a,divisor>0?positive:negative),x/divisor)).toBe(true);
    }
  });

  it('retains source rounding grouping and does not label RN products as exact-real enclosures',()=>{
    const c=new OriginalFloatIntervalContext(),a=1+2**-52,b=1-2**-52;
    const rounded=c.mul(c.point(a),c.point(b));expect(rounded).toEqual({lo:1,hi:1});
    nearestEven(times(exact(a),exact(b)),rounded.lo);
    expect(compare(times(exact(a),exact(b)),exact(rounded.lo))).toBe(-1);
    expect(c.sub(rounded,c.point(1))).toEqual({lo:0,hi:0});
  });

  it('keeps subnormal tie-to-even underflow and numerical zero without signed-zero claims',()=>{
    const c=new OriginalFloatIntervalContext(),small=c.point(Number.MIN_VALUE),two=c.point(2);
    expect(c.add(small,small)).toEqual({lo:2*Number.MIN_VALUE,hi:2*Number.MIN_VALUE});
    const half=c.div(small,two);expect(half.lo).toBe(0);expect(half.hi).toBe(0);
    nearestEven({n:1n,d:2n**1075n},half.lo);
    expect(c.contains(c.point(-0),0)).toBe(true);expect(c.resources().signedZeroCertified).toBe(false);
  });

  it('uses same-value square dependency while general multiplication remains broad',()=>{
    const c=new OriginalFloatIntervalContext(),cross=c.box(-3,2);
    expect(c.mul(cross,cross)).toEqual({lo:-6,hi:9});expect(c.square(cross)).toEqual({lo:0,hi:9});
    expect(c.square(c.box(-3,-2))).toEqual({lo:4,hi:9});expect(c.square(c.box(2,3))).toEqual({lo:4,hi:9});
    expect(c.square(c.point(Number.MIN_VALUE)).hi).toBe(0);
  });

  it('keeps clamp, hull, intersection and min/max meanings distinct',()=>{
    const c=new OriginalFloatIntervalContext(),a=c.box(-3,2),b=c.box(1,4);
    expect(c.clamp(a,0,1)).toEqual({lo:0,hi:1});expect(c.clamp(c.box(2,4),0,1)).toEqual({lo:1,hi:1});
    expect(c.hull(a,b)).toEqual({lo:-3,hi:4});expect(c.intersect(a,b)).toEqual({lo:1,hi:2});
    expect(c.min(a,b)).toEqual({lo:-3,hi:2});expect(c.max(a,b)).toEqual({lo:1,hi:4});expect(c.neg(a)).toEqual({lo:-2,hi:3});
    expect(()=>c.intersect(c.point(0),c.point(1))).toThrow(/empty/);
    expect(()=>c.clamp(a,2,1)).toThrow(/clamp/);expect(()=>c.clamp(a,0,Infinity)).toThrow(/clamp/);
  });

  it('fails closed on zero-crossing division and primitive overflow',()=>{
    const c=new OriginalFloatIntervalContext(),one=c.point(1),large=c.point(Number.MAX_VALUE);
    for(const denominator of [c.box(-1,1),c.point(0),c.box(-1,0)])expect(()=>c.div(one,denominator)).toThrow(/zero/);
    expect(()=>c.add(large,large)).toThrow(/nonfinite/);expect(()=>c.mul(large,c.point(2))).toThrow(/overflow/);
    expect(()=>c.div(one,c.point(Number.MIN_VALUE))).toThrow(/overflow/);expect(()=>c.square(large)).toThrow(/overflow/);
  });

  it('certifies real roots by exact squared dyadics with adjacent representable brackets',()=>{
    const c=new OriginalFloatIntervalContext();
    for(const input of [0,1,2,4,Number.MIN_VALUE,2**-1022,Number.MAX_VALUE]){
      const result=c.sqrtReal(c.point(input));realRootBracket(input,result);
      if([0,1,4].includes(input))expect(result.lo).toBe(result.hi);
    }
    const stats=c.resources();expect(stats.sqrtSquareComparisons).toBeLessThanOrEqual(7*64);
    expect(stats.runtimeMathSqrtCertified).toBe(false);expect(stats.actualFloatCertified).toBe(false);
  });

  it('bounds a complete real-root interval and rejects negative domains or precision exhaustion',()=>{
    const c=new OriginalFloatIntervalContext(),result=c.sqrtReal(c.box(2,3));
    expect(compare(times(exact(result.lo),exact(result.lo)),exact(2))).toBeLessThanOrEqual(0);
    expect(compare(times(exact(result.hi),exact(result.hi)),exact(3))).toBeGreaterThanOrEqual(0);
    expect(c.resources().sqrtSquareComparisons).toBeLessThanOrEqual(128);
    expect(()=>c.sqrtReal(c.box(-1,1))).toThrow(/negative/);
    const narrow=new OriginalFloatIntervalContext({rationalBits:64});expect(()=>narrow.sqrtReal(narrow.point(Number.MIN_VALUE))).toThrow(/rational-bit/);
  });

  it('charges exact-source corners, boxes and root comparisons without resetting caps',()=>{
    const c=new OriginalFloatIntervalContext(),a=c.point(1),b=c.point(2),before=c.resources();
    c.mul(a,b);const product=c.resources();expect(product.chargedOperations-before.chargedOperations).toBe(13);expect(product.createdBoxes-before.createdBoxes).toBe(1);
    c.sqrtReal(a);const root=c.resources();expect(root.sqrtSquareComparisons).toBeGreaterThan(0);expect(root.chargedOperations).toBeGreaterThan(product.chargedOperations);
    const tiny=new OriginalFloatIntervalContext({operations:1});tiny.point(0);expect(()=>tiny.point(1)).toThrow(/operation-cap/);
    expect(tiny.resources()).toMatchObject({chargedOperations:1,createdBoxes:1,noBudgetReset:true});
    const oneBox=new OriginalFloatIntervalContext({boxes:1});oneBox.point(0);expect(()=>oneBox.point(1)).toThrow(/box-cap/);expect(oneBox.resources().createdBoxes).toBe(1);
    const shortRoot=new OriginalFloatIntervalContext({operations:10});const zero=shortRoot.point(0);expect(()=>shortRoot.sqrtReal(zero)).toThrow(/operation-cap/);
    expect(shortRoot.resources().chargedOperations).toBeLessThanOrEqual(10);
    for(const limits of [{operations:100001},{boxes:16385},{rationalBits:4097},{operations:0}])expect(()=>new OriginalFloatIntervalContext(limits)).toThrow(/lowered/);
    expect(ORIGINAL_FLOAT_INTERVAL_LIMITS).toEqual({operations:100000,boxes:16384,rationalBits:4096});
  });
});
