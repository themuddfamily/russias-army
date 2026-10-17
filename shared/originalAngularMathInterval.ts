import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';

/** Caller assertions about the actual executing call sites. A frozen profile
 * and matching strings do not attest binary/compiler/hardware behavior. */
export interface OriginalAngularMathSourceProfile {
 readonly tag:string;
 readonly hypotDispatch:'3-fast-4-slow-kahan';
 readonly arithmetic:'separate-rn-binary64-gradual-underflow';
 readonly sqrt:'correctly-rounded-binary64-Float64Sqrt';
 readonly tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27';
}
export const ORIGINAL_ANGULAR_MATH_INTERVAL_SCOPE=Object.freeze({maximumHypotArity:4,maximumMaxOwnerBranches:4,tinyTrigCutoff:2**-27,
 fastCompensationResidualBound:3*2**-52,slowCompensationResidualBound:3*2**-49});
type B=OriginalFloatBox;
function requiredProfile(profile:OriginalAngularMathSourceProfile):Readonly<OriginalAngularMathSourceProfile> {
 if(!profile||Object.getPrototypeOf(profile)!==Object.prototype||!Object.isFrozen(profile))throw new UnsupportedFloatInterval('explicit-frozen-math-source-profile-required');
 for(const key of ['tag','hypotDispatch','arithmetic','sqrt','tinyTrig'] as const){const d=Object.getOwnPropertyDescriptor(profile,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('math-profile-accessors-unsupported');}
 if(typeof profile.tag!=='string'||profile.tag.length===0||profile.tag.length>1024||profile.hypotDispatch!=='3-fast-4-slow-kahan'||profile.arithmetic!=='separate-rn-binary64-gradual-underflow'||profile.sqrt!=='correctly-rounded-binary64-Float64Sqrt'||profile.tinyTrig!=='frozen-common-nonnegative-strict-lt-2^-27')throw new UnsupportedFloatInterval('unsupported-math-source-profile');
 return Object.freeze({tag:profile.tag,hypotDispatch:profile.hypotDispatch,arithmetic:profile.arithmetic,sqrt:profile.sqrt,tinyTrig:profile.tinyTrig});
}
/** Restricted conditional provider. No runtime Math calls or default profile.
 * sqrtReal bounds the source radicand's specified correctly-rounded sqrt node,
 * then the source RN multiplication by max remains a separate operation. */
export function createOriginalAngularMathInterval(profile:OriginalAngularMathSourceProfile) {
 const saved=requiredProfile(profile);
 const hypot=(ctx:OriginalFloatIntervalContext,values:readonly B[]):B=>{
  if(!Array.isArray(values)||Object.getPrototypeOf(values)!==Array.prototype||Object.getOwnPropertyDescriptor(values,Symbol.iterator)||!(values.length===3||values.length===4))throw new UnsupportedFloatInterval('math-hypot-arity-3-or-4-required');
  const abs:B[]=[];
  for(let i=0;i<values.length;i++){
   const d=Object.getOwnPropertyDescriptor(values,i);if(!d||!('value' in d))throw new UnsupportedFloatInterval('math-hypot-dense-data-required');
   const a=ctx.hull(values[i],values[i]);abs.push(ctx.intersect(ctx.max(ctx.neg(a),a),ctx.box(0,Number.MAX_VALUE)));
  }
  const zero=ctx.point(0),one=ctx.point(1);let maximum=zero;
  for(const a of abs)maximum=ctx.max(maximum,a);
  if(ctx.compare(maximum,zero,'===')==='true')return zero;
  const includesZero=maximum.lo===0;let result:B|undefined=includesZero?zero:undefined;
  for(let owner=0;owner<abs.length;owner++){
   if(abs[owner].hi===0||abs.some(a=>a.lo>abs[owner].hi))continue;
   const scale=ctx.intersect(maximum,ctx.box(Math.max(Number.MIN_VALUE,maximum.lo),abs[owner].hi));
   const ratio=(index:number):B=>{
    if(index===owner)return ctx.hull(one,one); // SAME actual max/max, including subnormals.
    if(abs[index].hi===0)return ctx.hull(zero,zero);
    if(includesZero)return ctx.box(0,1); // Relational positive branch: SAME abs<=max.
    return ctx.intersect(ctx.div(abs[index],scale),ctx.box(0,1));
   };
   let sum:B;
   if(abs.length===3){
    // Frozen FastMathHypot repeats the divisions for each separate product.
    const pa=ctx.mul(ratio(0),ratio(0)),pb=ctx.mul(ratio(1),ratio(1));
    const compensation=ctx.intersect(ctx.sub(ctx.sub(ctx.add(pa,pb),pa),pb),ctx.box(-3*2**-52,3*2**-52));
    const pc=ctx.sub(ctx.mul(ratio(2),ratio(2)),compensation);sum=ctx.add(ctx.add(pa,pb),pc);
   }else{
    let oldSum=zero,compensation=zero;
    for(let i=0;i<4;i++){
     const n=ratio(i),summand=ctx.sub(ctx.square(n),compensation),preliminary=ctx.add(oldSum,summand);
     compensation=ctx.intersect(ctx.sub(ctx.sub(preliminary,oldSum),summand),ctx.box(-3*2**-49,3*2**-49));
     oldSum=preliminary; // Commit only after compensation uses old sum.
    }
    sum=oldSum;
   }
   // Do not silently repair a negative or uncertain source radicand.
   if(ctx.compare(sum,zero,'>=')!=='true')throw new UnsupportedFloatInterval('unresolved-source-hypot-radicand');
   const branch=ctx.mul(ctx.sqrtReal(sum),scale);result=result?ctx.hull(result,branch):branch;
  }
  if(!result)throw new UnsupportedFloatInterval('missing-source-hypot-owner');return result;
 };
 const tiny=(ctx:OriginalFloatIntervalContext,angle:B,cosine:boolean):B=>{
  const owned=ctx.hull(angle,angle);
  if(ctx.compare(owned,ctx.point(0),'>=')!=='true'||ctx.compare(owned,ctx.point(2**-27),'<')!=='true')throw new UnsupportedFloatInterval('outside-frozen-tiny-trig-domain');
  return cosine?ctx.point(1):owned;
 };
 const contract:OriginalAngularMathContract=Object.freeze({tag:saved.tag,hypot,sin:(ctx:OriginalFloatIntervalContext,a:B)=>tiny(ctx,a,false),cos:(ctx:OriginalFloatIntervalContext,a:B)=>tiny(ctx,a,true)});
 return Object.freeze({contract,profile:saved,conditionalSourceProfile:true as const,sourceProfileAttested:false as const,
  runtimeMathCalls:0 as const,tinyTrigCutoff:2**-27,hypotArities:Object.freeze([3,4] as const),maximumOwnerBranches:4 as const,
  nativeEquivalent:false as const,defaultIntegration:false as const});
}
