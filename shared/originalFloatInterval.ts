/** Numeric source-RN ranges only, conditional on separate binary64 operations.
 * Real sqrt bounds are a separate exact dyadic theorem. No signed-zero,
 * runtime Math.sqrt/hypot, compiler/FMA or native-equivalence certificate. */
export interface OriginalFloatBox {readonly lo:number;readonly hi:number}
export interface OriginalFloatIntervalLimits {readonly operations?:number;readonly boxes?:number;readonly rationalBits?:number}
/** Opt-in numeric range proof reuse, never actual-value identity. */
export interface OriginalFloatIntervalProofReusePolicy {readonly primitiveProofReuse:true}
export type OriginalFloatComparison='<'|'<='|'==='|'>'|'>=';
export type OriginalFloatTruth='true'|'false'|'unknown';
export type OriginalFloatTriple=readonly [OriginalFloatBox,OriginalFloatBox,OriginalFloatBox];
export type OriginalFloatPair=readonly [OriginalFloatBox,OriginalFloatBox];
export interface OriginalFloatVectorSnapshot {readonly x:OriginalFloatBox;readonly y:OriginalFloatBox;readonly z:OriginalFloatBox}
export interface OriginalFloatBoundsSnapshot {
 readonly minX:OriginalFloatBox;readonly maxX:OriginalFloatBox;readonly minY:OriginalFloatBox;readonly maxY:OriginalFloatBox;readonly minZ:OriginalFloatBox;readonly maxZ:OriginalFloatBox;
}
export interface OriginalSegmentDisplacementPrefix {
 readonly aa:OriginalFloatBox;readonly bb:OriginalFloatBox;readonly cc:OriginalFloatBox;
 readonly az:OriginalFloatTruth;readonly cz:OriginalFloatTruth;
 readonly actualAA?:OriginalFloatBox;readonly actualCC?:OriginalFloatBox;
 readonly denominator?:OriginalFloatBox;readonly threshold?:OriginalFloatBox;
 readonly parallel?:OriginalFloatTruth;readonly actualDenominator?:OriginalFloatBox;
}
export type OriginalSegmentSaturatedPathName='nonparallel-low'|'nonparallel-high'|'nonparallel-interior'|'parallel-low'|'parallel-high'|'parallel-interior';
export interface OriginalSegmentSaturatedParameter {
 readonly path:OriginalSegmentSaturatedPathName;readonly s:OriginalFloatBox;readonly t:OriginalFloatBox;readonly early:false;
}
type NumericProofResult=OriginalFloatBox|OriginalFloatTruth|OriginalFloatPair|OriginalFloatTriple|OriginalFloatVectorSnapshot|OriginalFloatBoundsSnapshot|OriginalSegmentDisplacementPrefix|readonly OriginalSegmentSaturatedParameter[];
export const ORIGINAL_FLOAT_INTERVAL_LIMITS=Object.freeze({operations:100000,boxes:16384,rationalBits:4096});
export class UnsupportedFloatInterval extends Error {
  constructor(readonly reason:string){super(reason);this.name='UnsupportedFloatInterval';}
}
interface Dyadic {readonly numerator:bigint;readonly denominator:bigint}
const MAX_FINITE_BITS=0x7fefffffffffffffn;
const FRACTION_MASK=0xfffffffffffffn;

/** A context owns all its immutable boxes. Foreign/forged boxes are rejected.
 * Default work counts source scalar proof occurrences, comparisons, exact
 * dyadic work and box allocations. Opt-in reuse instead counts performed proof
 * computations plus owned lookups/insertion; it does not count every source
 * operation occurrence. Boxes are immutable NUMERIC RANGES, not actual-value
 * identity, even when canonical. Combined retained reuse records <=box cap. Guards
 * are bounded ordinary bookkeeping; ownership checks also charge one operation.
 * No budget reset or unbounded precision fallback exists. */
export class OriginalFloatIntervalContext {
  private readonly owned=new WeakSet<object>();
  private readonly bits=new DataView(new ArrayBuffer(8));
  private readonly maximum:Readonly<{operations:number;boxes:number;rationalBits:number}>;
  private used=0;private created=0;private comparisons=0;
  private readonly reuse:boolean;
  private readonly reuseRecords=new Map<string,NumericProofResult>();
  private readonly boxIds=new WeakMap<object,number>();
  private proofHits=0;private boxHits=0;private proofRecords=0;private boxRecords=0;
  private translationHits=0;private translationRecords=0;
  private dotHits=0;private dotRecords=0;private squaredHits=0;private squaredRecords=0;private crossHits=0;private crossRecords=0;
  private rotationHits=0;private rotationRecords=0;
  private capturedHullRecords=0;
  private vectorHits=0;private vectorRecords=0;private boundsHits=0;private boundsRecords=0;
  private segmentPrefixHits=0;private segmentPrefixRecords=0;
  private segmentSaturationHits=0;private segmentSaturationRecords=0;
  private triangleProjectionHits=0;private triangleProjectionRecords=0;
  constructor(limits:OriginalFloatIntervalLimits={},policy?:OriginalFloatIntervalProofReusePolicy){
    if(policy!==undefined){
      if(!policy||![Object.prototype,null].includes(Object.getPrototypeOf(policy))||!Object.isFrozen(policy))throw new UnsupportedFloatInterval('frozen-ordinary-proof-reuse-policy-required');
      const descriptor=Object.getOwnPropertyDescriptor(policy,'primitiveProofReuse');
      if(!descriptor||!('value' in descriptor)||descriptor.value!==true||Reflect.ownKeys(policy).length!==1)throw new UnsupportedFloatInterval('explicit-primitive-proof-reuse-policy-required');
    }
    this.reuse=policy!==undefined;
    const maximum={operations:limits.operations??100000,boxes:limits.boxes??16384,rationalBits:limits.rationalBits??4096};
    for(const key of ['operations','boxes','rationalBits'] as const){
      if(!Number.isSafeInteger(maximum[key])||maximum[key]<1||maximum[key]>ORIGINAL_FLOAT_INTERVAL_LIMITS[key])throw new UnsupportedFloatInterval('interval-caps-may-only-be-lowered');
    }
    this.maximum=Object.freeze(maximum);
  }
  resources(){return Object.freeze({chargedOperations:this.used,createdBoxes:this.created,sqrtSquareComparisons:this.comparisons,
    maxOperations:this.maximum.operations,maxBoxes:this.maximum.boxes,maxRationalBits:this.maximum.rationalBits,
    noBudgetReset:true,maximumSqrtComparisonsPerEndpoint:64,actualFloatCertified:false,signedZeroCertified:false,runtimeMathSqrtCertified:false,
    accounting:this.reuse?'source-proof-computations':'source-scalar-proof-occurrences',primitiveProofReuse:this.reuse,
    primitiveProofHits:this.proofHits,canonicalBoxHits:this.boxHits,primitiveProofRecords:this.proofRecords,canonicalBoxRecords:this.boxRecords,
    retainedReuseRecords:this.reuseRecords.size,maxRetainedReuseRecords:this.maximum.boxes,physicalBoxAllocations:this.created,
    wholeTranslationProofHits:this.translationHits,wholeTranslationProofRecords:this.translationRecords,
    dot3ProofHits:this.dotHits,dot3ProofRecords:this.dotRecords,squared3ProofHits:this.squaredHits,squared3ProofRecords:this.squaredRecords,
    cross3ProofHits:this.crossHits,cross3ProofRecords:this.crossRecords,capturedSeparatedHullRecords:this.capturedHullRecords,
    groupedRotationProofHits:this.rotationHits,groupedRotationProofRecords:this.rotationRecords,
    vector3ProofHits:this.vectorHits,vector3ProofRecords:this.vectorRecords,bounds6ProofHits:this.boundsHits,bounds6ProofRecords:this.boundsRecords,
    segmentPrefixProofHits:this.segmentPrefixHits,segmentPrefixProofRecords:this.segmentPrefixRecords,
    segmentSaturationProofHits:this.segmentSaturationHits,segmentSaturationProofRecords:this.segmentSaturationRecords,
    triangleProjectionProofHits:this.triangleProjectionHits,triangleProjectionProofRecords:this.triangleProjectionRecords,
    numericProofNodeKinds:'pure-numeric-primitives-explicit-same-offset-translation-and-ordered-dot3-squared3-cross3-and-numeric-vector3-bounds6-and-grouped-quaternion-rotation'});}
  private charge(count=1):void {
    if(this.used+count>this.maximum.operations)throw new UnsupportedFloatInterval('interval-operation-cap');
    this.used+=count;
  }
  private require(value:OriginalFloatBox):void {
    this.charge();if(!value||!this.owned.has(value))throw new UnsupportedFloatInterval('foreign-interval-box');
  }
  private make(lo:number,hi:number):OriginalFloatBox {
    this.charge();
    if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo>hi)throw new UnsupportedFloatInterval('nonfinite-or-unordered-interval');
    let key:string|undefined;
    if(this.reuse){
      this.charge();key=`box:${this.numberKey(lo)}:${this.numberKey(hi)}`;
      const previous=this.reuseRecords.get(key);
      if(previous!==undefined){this.boxHits++;return previous as OriginalFloatBox;}
    }
    if(this.created>=this.maximum.boxes)throw new UnsupportedFloatInterval('interval-box-cap');
    const result=Object.freeze({lo,hi});this.owned.add(result);this.created++;
    if(this.reuse){this.boxIds.set(result,this.created);this.remember(key!,result,false);}
    return result;
  }
  // Endpoint keys preserve all binary64 bits, including +0/-0. Encoding is
  // fixed64-bit bookkeeping, not arbitrary precision or caller-defined data.
  private numberKey(value:number):string {
    this.bits.setFloat64(0,value,false);return this.bits.getBigUint64(0,false).toString(16);
  }
  private remember(key:string,value:NumericProofResult,proof:boolean):void {
    if(this.reuseRecords.size>=this.maximum.boxes)return;
    this.charge();this.reuseRecords.set(key,value);if(proof){
      this.proofRecords++;
      if(key.startsWith('proof:same-offset-translatedSub:'))this.translationRecords++;
      if(key.startsWith('proof:ordered-dot3:'))this.dotRecords++;
      if(key.startsWith('proof:ordered-squared3:'))this.squaredRecords++;
      if(key.startsWith('proof:ordered-cross3:'))this.crossRecords++;
      if(key.startsWith('proof:grouped-quaternion-rotation:'))this.rotationRecords++;
      if(key.startsWith('proof:numeric-vector3:'))this.vectorRecords++;
      if(key.startsWith('proof:numeric-bounds6:'))this.boundsRecords++;
      if(key.startsWith('proof:ordered-segment-displacement-prefix-'))this.segmentPrefixRecords++;
      if(key.startsWith('proof:ordered-segment-saturated-parameters-'))this.segmentSaturationRecords++;
      if(key.startsWith('proof:ordered-triangle-zero-x-dot-pair:'))this.triangleProjectionRecords++;
    }else this.boxRecords++;
  }
  /** A hit reuses a universal numeric-range theorem, not an actual tuple.
   * Ownership precedes lookup. Tags distinguish dependency and every operator.
   * One lookup unit includes bounded key/Map bookkeeping; successful insertions
   * cost another unit. Misses execute all existing numerical proof work. */
  private memo<T extends NumericProofResult>(tag:string,args:readonly OriginalFloatBox[],scalars:readonly number[],compute:()=>T):T {
    for(const value of args)this.require(value);
    this.charge();
    const key=`proof:${tag}:${args.map(value=>this.boxIds.get(value)!).join(',')}:${scalars.map(value=>this.numberKey(value)).join(',')}`;
    const previous=this.reuseRecords.get(key);
    if(previous!==undefined){
      this.proofHits++;if(tag==='same-offset-translatedSub')this.translationHits++;
      if(tag==='ordered-dot3')this.dotHits++;if(tag==='ordered-squared3')this.squaredHits++;if(tag==='ordered-cross3')this.crossHits++;
      if(tag==='grouped-quaternion-rotation')this.rotationHits++;
      if(tag==='numeric-vector3')this.vectorHits++;if(tag==='numeric-bounds6')this.boundsHits++;
      if(tag.startsWith('ordered-segment-displacement-prefix-'))this.segmentPrefixHits++;
      return previous as T;
    }
    const result=compute();this.remember(key,result,true);return result;
  }
  /** Reserve one bounded record for a privately captured separated hull.
   * This stores ONLY an owned anchor and grants no prepared-input capability,
   * source identity or graph validity. The caller must independently validate
   * and privately retain its complete bounded hull capture before publication.
   * Registration applies in both accounting modes; no primitive path changes. */
  reserveSeparatedHullCapture(anchor:OriginalFloatBox):void {
    this.require(anchor);this.charge();
    const key=`capture:separated-hull:${this.capturedHullRecords+1}`;
    if(this.reuseRecords.has(key))throw new UnsupportedFloatInterval('duplicate-separated-hull-capture-record');
    if(this.reuseRecords.size>=this.maximum.boxes)throw new UnsupportedFloatInterval('interval-separated-hull-capture-record-cap');
    this.charge();this.reuseRecords.set(key,anchor);this.capturedHullRecords++;
  }
  box(lo:number,hi:number):OriginalFloatBox {return this.make(lo,hi);}
  point(value:number):OriginalFloatBox {return this.make(value,value);}
  contains(box:OriginalFloatBox,value:number):boolean {
    this.require(box);if(!Number.isFinite(value))throw new UnsupportedFloatInterval('nonfinite-contained-value');
    this.charge(2);return box.lo<=value&&value<=box.hi;
  }
  /** Whole-box source guard proof, without dependency refinement or sampling. */
  private proofCompare(a:OriginalFloatBox,b:OriginalFloatBox,operator:OriginalFloatComparison):OriginalFloatTruth {
    this.require(a);this.require(b);
    if(operator==='==='){
      this.charge(5);
      if(a.lo===a.hi&&b.lo===b.hi&&a.lo===b.lo)return 'true';
      return a.hi<b.lo||a.lo>b.hi?'false':'unknown';
    }
    if(operator!=='<'&&operator!=='<='&&operator!=='>'&&operator!=='>=')throw new UnsupportedFloatInterval('invalid-interval-comparison');
    this.charge(2);
    if(operator==='<')return a.hi<b.lo?'true':a.lo>=b.hi?'false':'unknown';
    if(operator==='<=')return a.hi<=b.lo?'true':a.lo>b.hi?'false':'unknown';
    if(operator==='>')return a.lo>b.hi?'true':a.hi<=b.lo?'false':'unknown';
    return a.lo>=b.hi?'true':a.hi<b.lo?'false':'unknown';
  }
  private proofAdd(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    this.require(a);this.require(b);this.charge(2);return this.make(a.lo+b.lo,a.hi+b.hi);
  }
  private proofSub(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    this.require(a);this.require(b);this.charge(2);return this.make(a.lo-b.hi,a.hi-b.lo);
  }
  /** Uniform RN residual bound for every real operation whose finite rounded
   * output lies in this box. Full output-binade spacing dominates half-ULP,
   * including transitions; MIN_VALUE covers gradual underflow. Exact powers
   * come from a bounded binary64 word, not an approximate Math.pow call. */
  private sourceRoundoffUpper(output:OriginalFloatBox):OriginalFloatBox {
    this.require(output);this.charge(16); // bounded abs/select/decode/word guards
    const magnitude=Math.max(Math.abs(output.lo),Math.abs(output.hi));
    this.bits.setFloat64(0,magnitude,false);
    const exponent=Number((this.bits.getBigUint64(0,false)>>52n)&0x7ffn);
    const power=exponent===0?1n:exponent>=53?BigInt(exponent-52)<<52n:1n<<BigInt(exponent-1);
    this.bits.setBigUint64(0,power,false);const radius=this.bits.getFloat64(0,false);
    return this.make(radius,radius);
  }
  /** RN(RN(a+offset)-RN(b+offset)), with the SAME actual offset in both adds.
   * Keeps all fresh source prefixes finite before using correlation. If local
   * d=RN(a-b), three RN residuals give real inner difference d+delta with
   * |delta|<=3E. Exact radius4E and monotone final RN bound that difference;
   * intersection retains the fresh source enclosure. No ideal replacement,
   * unrelated-box equality, signed-zero or runtime/native attestation. */
  private proofTranslatedSub(a:OriginalFloatBox,b:OriginalFloatBox,offset:OriginalFloatBox):OriginalFloatBox {
    const first=this.add(a,offset),second=this.add(b,offset),fresh=this.sub(first,second);
    if(this.compare(fresh,fresh,'===')==='true')return fresh;
    if(this.compare(a,b,'===')==='true')return this.point(0);
    if(this.compare(offset,this.point(0),'===')==='true')return fresh;
    const local=this.sub(a,b);
    const error=this.max(this.max(this.sourceRoundoffUpper(first),this.sourceRoundoffUpper(second)),this.sourceRoundoffUpper(local));
    const radius=this.mul(this.point(4),error);
    return this.intersect(fresh,this.hull(this.sub(local,radius),this.add(local,radius)));
  }
  private proofNeg(a:OriginalFloatBox):OriginalFloatBox {this.require(a);this.charge(2);return this.make(-a.hi,-a.lo);}
  private corners(a:OriginalFloatBox,b:OriginalFloatBox,divide:boolean):OriginalFloatBox {
    this.charge(4);
    const values=divide?[a.lo/b.lo,a.lo/b.hi,a.hi/b.lo,a.hi/b.hi]:[a.lo*b.lo,a.lo*b.hi,a.hi*b.lo,a.hi*b.hi];
    if(!values.every(Number.isFinite))throw new UnsupportedFloatInterval('interval-primitive-overflow');
    let lo=values[0],hi=values[0];
    for(let index=1;index<4;index++){this.charge(2);lo=Math.min(lo,values[index]);hi=Math.max(hi,values[index]);}
    return this.make(lo,hi);
  }
  private proofMul(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {this.require(a);this.require(b);return this.corners(a,b,false);}
  private proofDiv(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    this.require(a);this.require(b);this.charge(2);
    if(b.lo<=0&&b.hi>=0)throw new UnsupportedFloatInterval('interval-division-contains-zero');
    return this.corners(a,b,true);
  }
  /** SAME actual scalar multiplied by itself. General mul(a,a) stays broader. */
  private proofSquare(a:OriginalFloatBox):OriginalFloatBox {
    this.require(a);this.charge(2);const first=a.lo*a.lo,last=a.hi*a.hi;
    if(!Number.isFinite(first)||!Number.isFinite(last))throw new UnsupportedFloatInterval('interval-primitive-overflow');
    this.charge(3);const crossesZero=a.lo<=0&&a.hi>=0,hi=Math.max(first,last);
    if(!crossesZero)this.charge();return this.make(crossesZero?0:Math.min(first,last),hi);
  }
  private proofHull(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    this.require(a);this.require(b);this.charge(2);return this.make(Math.min(a.lo,b.lo),Math.max(a.hi,b.hi));
  }
  private proofIntersect(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    this.require(a);this.require(b);this.charge(3);const lo=Math.max(a.lo,b.lo),hi=Math.min(a.hi,b.hi);
    if(lo>hi)throw new UnsupportedFloatInterval('empty-interval-intersection');return this.make(lo,hi);
  }
  private proofMin(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    this.require(a);this.require(b);this.charge(2);return this.make(Math.min(a.lo,b.lo),Math.min(a.hi,b.hi));
  }
  private proofMax(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    this.require(a);this.require(b);this.charge(2);return this.make(Math.max(a.lo,b.lo),Math.max(a.hi,b.hi));
  }
  /** Monotone scalar min(max(x,lower),upper), not dependency intersection. */
  private proofClamp(a:OriginalFloatBox,lower:number,upper:number):OriginalFloatBox {
    this.require(a);if(!Number.isFinite(lower)||!Number.isFinite(upper)||lower>upper)throw new UnsupportedFloatInterval('invalid-interval-clamp');
    this.charge(4);return this.make(Math.min(Math.max(a.lo,lower),upper),Math.min(Math.max(a.hi,lower),upper));
  }
  private integer(value:bigint):bigint {
    const magnitude=value<0n?-value:value;
    if(magnitude.toString(2).length>this.maximum.rationalBits)throw new UnsupportedFloatInterval('interval-rational-bit-cap');return value;
  }
  private product(a:bigint,b:bigint):bigint {this.charge();return this.integer(a*b);}
  private fromBits(bits:bigint):number {this.bits.setBigUint64(0,bits,false);return this.bits.getFloat64(0,false);}
  private decode(value:number):Dyadic {
    this.charge();this.bits.setFloat64(0,value,false);const bits=this.bits.getBigUint64(0,false);
    const exponent=Number((bits>>52n)&0x7ffn),fraction=bits&FRACTION_MASK;
    if(exponent===0x7ff)throw new UnsupportedFloatInterval('nonfinite-dyadic-input');
    const mantissa=exponent===0?fraction:(1n<<52n)|fraction;
    if(mantissa===0n)return {numerator:0n,denominator:1n};
    const shift=exponent===0?-1074:exponent-1075,sign=(bits>>63n)===0n?1n:-1n;
    return {numerator:this.integer(sign*(shift>=0?mantissa<<BigInt(shift):mantissa)),denominator:this.integer(shift<0?1n<<BigInt(-shift):1n)};
  }
  private rootBounds(value:number):readonly [number,number] {
    const target=this.decode(value);let count=0;
    const compare=(candidateBits:bigint)=>{
      if(++count>64)throw new UnsupportedFloatInterval('interval-sqrt-comparison-cap');
      this.charge();this.comparisons++;
      const candidate=this.decode(this.fromBits(candidateBits));
      const left=this.product(this.product(candidate.numerator,candidate.numerator),target.denominator);
      const right=this.product(target.numerator,this.product(candidate.denominator,candidate.denominator));
      return left<right?-1:left>right?1:0;
    };
    if(this.reuse){
      // An exact integer significand calculation, independent of runtime
      // Math.sqrt. Every positive binary64 input has a normal real-root
      // significand: exponent k lies in [-537,511]. Verify the result with
      // the same exact dyadic endpoint comparisons used by the default search.
      this.charge();if(target.numerator===0n){if(compare(0n)!==0)throw new UnsupportedFloatInterval('invalid-zero-root-proof');return [0,0];}
      this.charge(2);const nBits=target.numerator.toString(2).length,dBits=target.denominator.toString(2).length;
      this.charge(5);const k=Math.floor((nBits-dBits)/2),shift=104-2*k;
      this.charge(4);const n=this.integer(target.numerator<<BigInt(Math.max(shift,0))),d=this.integer(target.denominator<<BigInt(Math.max(-shift,0)));
      this.charge();const q=this.integer(n/d);
      this.charge(2);const qBits=q.toString(2).length;
      this.charge(3);let m=this.integer(1n<<BigInt(Math.ceil(qBits/2))),settled=false;
      for(let step=0;step<16;step++){
        this.charge(4);const quotient=this.integer(q/m),sum=this.integer(m+quotient),next=this.integer(sum>>1n);
        if(next>=m){settled=true;break;}m=next;
      }
      if(!settled)throw new UnsupportedFloatInterval('integer-root-iteration-cap');
      this.charge(5);const candidate=this.integer((BigInt(k+1023)<<52n)+(m-(1n<<52n)));
      this.charge(2);if(candidate<0n||candidate>=MAX_FINITE_BITS)throw new UnsupportedFloatInterval('invalid-integer-root-candidate');
      const at=compare(candidate);this.charge();const successor=candidate+1n;if(at>0||compare(successor)<=0)throw new UnsupportedFloatInterval('invalid-integer-root-bracket');
      const lower=this.fromBits(candidate);return [lower,at===0?lower:this.fromBits(successor)];
    }
    let lo=0n,hi=MAX_FINITE_BITS;
    while(lo<hi){const middle=(lo+hi+1n)>>1n;if(compare(middle)<=0)lo=middle;else hi=middle-1n;}
    const exact=compare(lo)===0,lower=this.fromBits(lo),upper=exact?lower:this.fromBits(lo+1n);
    if(!Number.isFinite(upper))throw new UnsupportedFloatInterval('interval-real-root-overflow');
    return [lower,upper];
  }
  /** Outward enclosure of the mathematical REAL square root. These endpoints
   * do not claim to enclose an unspecified runtime Math.sqrt/hypot algorithm. */
  private proofSqrtReal(a:OriginalFloatBox):OriginalFloatBox {
    this.require(a);this.charge();if(a.lo<0)throw new UnsupportedFloatInterval('negative-real-root-domain');
    const lower=this.rootBounds(a.lo),upper=a.lo===a.hi?lower:this.rootBounds(a.hi);
    return this.make(lower[0],upper[1]);
  }
  /** Complete universal theorem with the SAME actual offset in both source
   * additions. Reused numeric boxes never imply a/b actual-value equality.
   * Ordered three-input provenance is checked before the distinct node lookup. */
  translatedSub(a:OriginalFloatBox,b:OriginalFloatBox,offset:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofTranslatedSub(a,b,offset);
    return this.memo('same-offset-translatedSub',[a,b,offset],[],()=>this.proofTranslatedSub(a,b,offset));
  }
  compare(a:OriginalFloatBox,b:OriginalFloatBox,operator:OriginalFloatComparison):OriginalFloatTruth {
    if(!this.reuse)return this.proofCompare(a,b,operator);
    if(operator!=='==='&&operator!=='<'&&operator!=='<='&&operator!=='>'&&operator!=='>=')throw new UnsupportedFloatInterval('invalid-interval-comparison');
    return this.memo(`compare:${operator}`,[a,b],[],()=>this.proofCompare(a,b,operator));
  }
  add(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofAdd(a,b);
    return this.memo('add',[a,b],[],()=>this.proofAdd(a,b));
  }
  sub(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofSub(a,b);
    return this.memo('sub',[a,b],[],()=>this.proofSub(a,b));
  }
  mul(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofMul(a,b);
    return this.memo('mul',[a,b],[],()=>this.proofMul(a,b));
  }
  div(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofDiv(a,b);
    return this.memo('div',[a,b],[],()=>this.proofDiv(a,b));
  }
  neg(a:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofNeg(a);
    return this.memo('neg',[a],[],()=>this.proofNeg(a));
  }
  square(a:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofSquare(a);
    return this.memo('square',[a],[],()=>this.proofSquare(a));
  }
  hull(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofHull(a,b);
    return this.memo('hull',[a,b],[],()=>this.proofHull(a,b));
  }
  intersect(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofIntersect(a,b);
    return this.memo('intersect',[a,b],[],()=>this.proofIntersect(a,b));
  }
  min(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofMin(a,b);
    return this.memo('min',[a,b],[],()=>this.proofMin(a,b));
  }
  max(a:OriginalFloatBox,b:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofMax(a,b);
    return this.memo('max',[a,b],[],()=>this.proofMax(a,b));
  }
  clamp(a:OriginalFloatBox,lower:number,upper:number):OriginalFloatBox {
    if(!this.reuse)return this.proofClamp(a,lower,upper);
    if(!Number.isFinite(lower)||!Number.isFinite(upper)||lower>upper)throw new UnsupportedFloatInterval('invalid-interval-clamp');
    return this.memo('clamp',[a],[lower,upper],()=>this.proofClamp(a,lower,upper));
  }
  sqrtReal(a:OriginalFloatBox):OriginalFloatBox {
    if(!this.reuse)return this.proofSqrtReal(a);
    return this.memo('sqrtReal',[a],[],()=>this.proofSqrtReal(a));
  }
  /** Opt-in universal displacement-only numeric proof. The ordered owned
   * ranges identify proof inputs, never equality of actual segment values.
   * Callers must first form the fresh source RN differences and intersect any
   * permitted displacement bounds. Position differences, clamp paths and
   * witnesses are deliberately absent. Default evaluation order is untouched.
   * Misses can fail earlier than positional work; only complete results enter
   * the context-wide bounded immutable proof record store. */
  segmentDisplacementPrefix(ux:OriginalFloatBox,uy:OriginalFloatBox,uz:OriginalFloatBox,
    vx:OriginalFloatBox,vy:OriginalFloatBox,vz:OriginalFloatBox,...constantCC:[]|[OriginalFloatBox]):OriginalSegmentDisplacementPrefix|undefined {
    if(!this.reuse)return undefined;
    // Presence is distinct from value: a supplied undefined/forged bound must
    // reach ownership validation rather than silently selecting fresh cc.
    const args=constantCC.length===0?[ux,uy,uz,vx,vy,vz]:[ux,uy,uz,vx,vy,vz,constantCC[0]];
    return this.memo(`ordered-segment-displacement-prefix-${constantCC.length===0?'fresh':'bounded'}`,args,[],()=>{
      const zero=this.point(0),aa=this.squared3(ux,uy,uz),bb=this.dot3(ux,uy,uz,vx,vy,vz),freshCC=this.squared3(vx,vy,vz);
      const cc=constantCC.length===0?freshCC:this.intersect(freshCC,this.hull(constantCC[0],constantCC[0]));
      const az=this.compare(aa,zero,'==='),cz=this.compare(cc,zero,'===');
      if(az==='true'||cz==='true')return Object.freeze({aa,bb,cc,az,cz});
      const domain=this.box(Number.MIN_VALUE,Number.MAX_VALUE),actualAA=this.intersect(aa,domain),actualCC=this.intersect(cc,domain);
      const denominator=this.sub(this.mul(actualAA,actualCC),this.square(bb));
      const threshold=this.mul(this.mul(this.point(Number.EPSILON),actualAA),actualCC),parallel=this.compare(denominator,threshold,'>');
      let actualDenominator:OriginalFloatBox|undefined;
      if(parallel!=='false'){
        const lower=this.max(this.point(Number.MIN_VALUE),this.point(threshold.lo));
        actualDenominator=this.intersect(denominator,this.box(lower.lo,Number.MAX_VALUE));
      }
      return Object.freeze({aa,bb,cc,az,cz,actualAA,actualCC,denominator,threshold,parallel,actualDenominator});
    });
  }
  /** A conditional parameter theorem for source pairs with nonzero u.x and
   * zero v.x. The fresh signed w.x range must fit one finite binary64 binade
   * envelope, formed by exact exponent words. The cold graph keeps dd's full
   * dependence on that envelope and executes the existing rounded arithmetic.
   * Only decisive nondegenerate paths with every dd-dependent clamp proved an
   * exact boundary (0 or 1) enter the cache. Once the first parameter is such a
   * boundary, t depends on ee, bb and cc only. v.x*w.x's four signed-zero corner
   * products have identical bits for every envelope magnitude of one sign.
   * Narrowing w.x therefore gives the SAME parameter endpoint bits, rather
   * than merely a wider positional enclosure. Positions/witnesses remain fresh.
   * Unsaturated/ambiguous paths fall back. An envelope-induced primitive
   * overflow discards this optional theorem and requires the original fresh
   * graph independently; budget/ownership/other failures still propagate and
   * no work is refunded or reset. Default returns without any work. */
  segmentSaturatedParameters(ux:OriginalFloatBox,uy:OriginalFloatBox,uz:OriginalFloatBox,
    vx:OriginalFloatBox,vy:OriginalFloatBox,vz:OriginalFloatBox,wx:OriginalFloatBox,wy:OriginalFloatBox,wz:OriginalFloatBox,
    ...constantCC:[]|[OriginalFloatBox]):readonly OriginalSegmentSaturatedParameter[]|undefined {
    if(!this.reuse)return undefined;
    const actual=constantCC.length===0?[ux,uy,uz,vx,vy,vz,wx,wy,wz]:[ux,uy,uz,vx,vy,vz,wx,wy,wz,constantCC[0]];
    for(const value of actual)this.require(value);
    this.charge(6); // ordered nonzero/zero endpoints and strict w.x sign
    if(!(ux.lo>0||ux.hi<0)||vx.lo!==0||vx.hi!==0)return undefined;
    const sign=wx.lo>0?1:wx.hi<0?-1:0;if(sign===0)return undefined;
    const minimum=sign>0?wx.lo:-wx.hi,maximum=sign>0?wx.hi:-wx.lo;
    this.charge(12); // finite fixed-width exponent selection and word construction
    this.bits.setFloat64(0,minimum,false);const exponent=Number((this.bits.getBigUint64(0,false)>>52n)&0x7ffn);
    // Keep envelopes away from subnormal/overflow extremes. This is a local
    // cache eligibility limit, never a relaxed global arithmetic limit.
    if(exponent<895||exponent>1151)return undefined;
    this.bits.setBigUint64(0,BigInt(exponent)<<52n,false);const lower=this.bits.getFloat64(0,false);
    this.bits.setBigUint64(0,BigInt(exponent+1)<<52n,false);const upper=this.bits.getFloat64(0,false);
    this.charge(2);if(minimum<lower||maximum>upper)return undefined;
    const envelope=sign>0?this.make(lower,upper):this.make(-upper,-lower);
    this.require(envelope);this.charge(2);
    if(wx.lo<envelope.lo||wx.hi>envelope.hi)return undefined;
    const args=constantCC.length===0?[ux,uy,uz,vx,vy,vz,wy,wz,envelope]:[ux,uy,uz,vx,vy,vz,wy,wz,envelope,constantCC[0]];
    this.charge();const key=`proof:ordered-segment-saturated-parameters-${constantCC.length===0?'fresh':'bounded'}:${args.map(value=>this.boxIds.get(value)!).join(',')}:${this.numberKey(sign)}`;
    const previous=this.reuseRecords.get(key);
    if(previous!==undefined){this.proofHits++;this.segmentSaturationHits++;return previous as readonly OriginalSegmentSaturatedParameter[];}
    let result:readonly OriginalSegmentSaturatedParameter[]|undefined;
    try{result=this.computeSaturatedSegmentParameters(ux,uy,uz,vx,vy,vz,envelope,wy,wz,...constantCC);}
    catch(error){
      // Widening w.x can overflow when the actual fresh projection is finite.
      // This proves nothing: the caller must execute its original graph with
      // fresh w.x. Do not catch or refund any cap/ownership/conditioning failure.
      if(error instanceof UnsupportedFloatInterval&&error.reason==='interval-primitive-overflow')return undefined;
      throw error;
    }
    if(result!==undefined)this.remember(key,result,true);
    return result;
  }
  private computeSaturatedSegmentParameters(ux:OriginalFloatBox,uy:OriginalFloatBox,uz:OriginalFloatBox,
    vx:OriginalFloatBox,vy:OriginalFloatBox,vz:OriginalFloatBox,wx:OriginalFloatBox,wy:OriginalFloatBox,wz:OriginalFloatBox,
    ...constantCC:[]|[OriginalFloatBox]):readonly OriginalSegmentSaturatedParameter[]|undefined {
    const zero=this.point(0),one=this.point(1),prefix=constantCC.length===0
      ?this.segmentDisplacementPrefix(ux,uy,uz,vx,vy,vz)!
      :this.segmentDisplacementPrefix(ux,uy,uz,vx,vy,vz,constantCC[0])!;
    const {bb,az,cz,actualAA,actualCC,parallel,actualDenominator}=prefix;
    if(az!=='false'||cz!=='false'||parallel==='unknown'||!actualAA||!actualCC)return undefined;
    const dd=this.dot3(ux,uy,uz,wx,wy,wz),ee=this.dot3(vx,vy,vz,wx,wy,wz);
    const clamp=(value:OriginalFloatBox)=>this.max(zero,this.min(one,value));
    const boundary=(value:OriginalFloatBox)=>{this.charge(3);return Object.is(value.lo,value.hi)&&(value.lo===0||value.lo===1);};
    let s:OriginalFloatBox,name:'parallel'|'nonparallel';
    if(parallel==='true'){
      if(!actualDenominator)return undefined;
      s=clamp(this.div(this.sub(this.mul(bb,ee),this.mul(actualCC,dd)),actualDenominator));name='nonparallel';
    }else{s=zero;name='parallel';}
    if(!boundary(s))return undefined;
    const t=this.div(this.add(this.mul(bb,s),ee),actualCC),low=this.compare(t,zero,'<');
    if(low==='unknown')return undefined;
    let path:OriginalSegmentSaturatedPathName,finalS=s,finalT=t;
    if(low==='true'){
      finalS=clamp(this.div(this.neg(dd),actualAA));finalT=zero;path=`${name}-low`;
    }else{
      const high=this.compare(t,one,'>');if(high==='unknown')return undefined;
      if(high==='true'){finalS=clamp(this.div(this.sub(bb,dd),actualAA));finalT=one;path=`${name}-high`;}
      else{finalT=this.intersect(t,this.box(0,1));path=`${name}-interior`;}
    }
    if(!boundary(finalS))return undefined;
    return Object.freeze([Object.freeze({path,s:finalS,t:finalT,early:false as const})]);
  }
  /** One reached pair of the source triangle's ordered d1/d2, d3/d4 or d5/d6
   * projections. Zero x directions make the ordered four-corner x products
   * depend only on zero endpoint bits and the current projection's strict x
   * sign. Every actual input is authenticated before that local selection or
   * lookup; only its x magnitude is omitted. Cold work performs both original
   * ordered dot3 graphs. Results are pure numeric ranges, not source identity.
   * Pair-level reuse deliberately leaves the source's later projections and
   * optional bc displacement LAZY: no unused stage is read or prevalidated.
   * Caller bound intersections precede this theorem; their refined ab/ac IDs
   * remain ordered key inputs. All exit, weight and witness work stays fresh.
   * Default contexts return undefined without charging or inspecting inputs. */
  triangleZeroXDotPair(ax:OriginalFloatBox,ay:OriginalFloatBox,az:OriginalFloatBox,
    bx:OriginalFloatBox,by:OriginalFloatBox,bz:OriginalFloatBox,wx:OriginalFloatBox,wy:OriginalFloatBox,wz:OriginalFloatBox):OriginalFloatPair|undefined {
    if(!this.reuse)return undefined;
    for(const value of [ax,ay,az,bx,by,bz,wx,wy,wz])this.require(value);
    this.charge(6); // four ordered zero endpoint tests and two strict x signs
    if(ax.lo!==0||ax.hi!==0||bx.lo!==0||bx.hi!==0)return undefined;
    const sign=wx.lo>0?1:wx.hi<0?-1:0;if(sign===0)return undefined;
    this.charge();
    const key=`proof:ordered-triangle-zero-x-dot-pair:${[ax,ay,az,bx,by,bz,wy,wz].map(value=>this.boxIds.get(value)!).join(',')}:${this.numberKey(sign)}`;
    const previous=this.reuseRecords.get(key);
    if(previous!==undefined){this.proofHits++;this.triangleProjectionHits++;return previous as OriginalFloatPair;}
    const result:OriginalFloatPair=Object.freeze([this.dot3(ax,ay,az,wx,wy,wz),this.dot3(bx,by,bz,wx,wy,wz)] as const);
    this.remember(key,result,true);return result;
  }
  /** RN(RN(RN(ax*bx)+RN(ay*by))+RN(az*bz)), in source order.
   * Each input slot is independent unless an explicit theorem says otherwise. */
  dot3(ax:OriginalFloatBox,ay:OriginalFloatBox,az:OriginalFloatBox,bx:OriginalFloatBox,by:OriginalFloatBox,bz:OriginalFloatBox):OriginalFloatBox {
    const compute=()=>this.add(this.add(this.mul(ax,bx),this.mul(ay,by)),this.mul(az,bz));
    if(!this.reuse)return compute();
    return this.memo('ordered-dot3',[ax,ay,az,bx,by,bz],[],compute);
  }
  /** Source ordered sum of SAME-coordinate squares; distinct from dot3(v,v). */
  squared3(x:OriginalFloatBox,y:OriginalFloatBox,z:OriginalFloatBox):OriginalFloatBox {
    const compute=()=>this.add(this.add(this.square(x),this.square(y)),this.square(z));
    if(!this.reuse)return compute();
    return this.memo('ordered-squared3',[x,y,z],[],compute);
  }
  /** Three separately rounded source cross coordinates. The fixed frozen tuple
   * contains owned boxes; no supplied tuple or algebraic zero shortcut exists. */
  cross3(ax:OriginalFloatBox,ay:OriginalFloatBox,az:OriginalFloatBox,bx:OriginalFloatBox,by:OriginalFloatBox,bz:OriginalFloatBox):OriginalFloatTriple {
    const compute=():OriginalFloatTriple=>Object.freeze([
      this.sub(this.mul(ay,bz),this.mul(az,by)),
      this.sub(this.mul(az,bx),this.mul(ax,bz)),
      this.sub(this.mul(ax,by),this.mul(ay,bx))
    ] as const);
    if(!this.reuse)return compute();
    return this.memo('ordered-cross3',[ax,ay,az,bx,by,bz],[],compute);
  }
  /** Exact grouped source rotation graph. A completed enclosure covers every
   * combination in these seven numeric ranges; reuse grants no actual tuple
   * identity or unit-quaternion premise. No matrix/algebraic reassociation. */
  groupedQuaternionRotate(qx:OriginalFloatBox,qy:OriginalFloatBox,qz:OriginalFloatBox,qw:OriginalFloatBox,vx:OriginalFloatBox,vy:OriginalFloatBox,vz:OriginalFloatBox):OriginalFloatTriple {
    const compute=():OriginalFloatTriple=>{
      const two=this.point(2),tx=this.mul(this.sub(this.mul(qy,vz),this.mul(qz,vy)),two),ty=this.mul(this.sub(this.mul(qz,vx),this.mul(qx,vz)),two),tz=this.mul(this.sub(this.mul(qx,vy),this.mul(qy,vx)),two);
      return Object.freeze([
        this.add(vx,this.add(this.mul(tx,qw),this.sub(this.mul(qy,tz),this.mul(qz,ty)))),
        this.add(vy,this.add(this.mul(ty,qw),this.sub(this.mul(qz,tx),this.mul(qx,tz)))),
        this.add(vz,this.add(this.mul(tz,qw),this.sub(this.mul(qx,ty),this.mul(qy,tx)))),
      ] as const);
    };
    if(!this.reuse)return compute();
    return this.memo('grouped-quaternion-rotation',[qx,qy,qz,qw,vx,vy,vz],[],compute);
  }
  /** Closed immutable numeric-domain snapshot, not SAME actual tuple identity.
   * Every cold field executes the original self-hull ownership operation. */
  vector3(x:OriginalFloatBox,y:OriginalFloatBox,z:OriginalFloatBox):OriginalFloatVectorSnapshot {
    const compute=():OriginalFloatVectorSnapshot=>Object.freeze({x:this.hull(x,x),y:this.hull(y,y),z:this.hull(z,z)});
    if(!this.reuse)return compute();
    return this.memo('numeric-vector3',[x,y,z],[],compute);
  }
  /** Fixed six-field numeric-domain snapshot. Inputs retain their ordered slots;
   * this neither validates a geometric bound relation nor grants source identity. */
  bounds6(minX:OriginalFloatBox,maxX:OriginalFloatBox,minY:OriginalFloatBox,maxY:OriginalFloatBox,minZ:OriginalFloatBox,maxZ:OriginalFloatBox):OriginalFloatBoundsSnapshot {
    const compute=():OriginalFloatBoundsSnapshot=>Object.freeze({
      minX:this.hull(minX,minX),maxX:this.hull(maxX,maxX),
      minY:this.hull(minY,minY),maxY:this.hull(maxY,maxY),
      minZ:this.hull(minZ,minZ),maxZ:this.hull(maxZ,maxZ)
    });
    if(!this.reuse)return compute();
    return this.memo('numeric-bounds6',[minX,maxX,minY,maxY,minZ,maxZ],[],compute);
  }
}
