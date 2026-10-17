import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {createOriginalAngularMathInterval,type OriginalAngularMathSourceProfile} from './originalAngularMathInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';

export interface OriginalAngularFdlibmSourceProfile {
 readonly tag:string;readonly trig:'retained-fdlibm-unreduced-iy0-y0';
 readonly arithmetic:'separate-rn-binary64-gradual-underflow';readonly hypotProfile:OriginalAngularMathSourceProfile;
}
export const ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS=Object.freeze({
 S1:'bfc5555555555549',S2:'3f8111111110f8a6',S3:'bf2a01a019c161d5',S4:'3ec71de357b1fe7d',S5:'be5ae5e68a2b9ceb',S6:'3de5d93a5acfd57c',
 C1:'3fa555555555554c',C2:'bf56c16c16c15177',C3:'3efa01a019cb1590',C4:'be927e4f809c52ad',C5:'3e21ee9ebdb4b1c4',C6:'bda8fae9be8838d4'});
function decode(bits:string):number {const view=new DataView(new ArrayBuffer(8));view.setBigUint64(0,BigInt('0x'+bits),false);return view.getFloat64(0,false);}
export const ORIGINAL_FDLIBM_INTERVAL_COEFFICIENTS=Object.freeze({
 S1:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.S1),S2:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.S2),S3:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.S3),
 S4:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.S4),S5:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.S5),S6:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.S6),
 C1:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.C1),C2:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.C2),C3:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.C3),
 C4:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.C4),C5:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.C5),C6:decode(ORIGINAL_FDLIBM_INTERVAL_COEFFICIENT_BITS.C6)});
const cutoff=2**-27,predecessor=cutoff-2**-80,domainHi=1/8;
type B=OriginalFloatBox;
/** Conditional retained fdlibm graph only. No glibc union, range reduction,
 * actual dispatch attestation, runtime trig evaluation or default provider. */
export function createOriginalAngularFdlibmInterval(profile:OriginalAngularFdlibmSourceProfile) {
 if(!profile||Object.getPrototypeOf(profile)!==Object.prototype||!Object.isFrozen(profile))throw new UnsupportedFloatInterval('explicit-frozen-fdlibm-profile-required');
 for(const key of ['tag','trig','arithmetic','hypotProfile'] as const){const d=Object.getOwnPropertyDescriptor(profile,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('fdlibm-profile-accessors-unsupported');}
 if(typeof profile.tag!=='string'||profile.tag.length===0||profile.tag.length>1024||profile.trig!=='retained-fdlibm-unreduced-iy0-y0'||profile.arithmetic!=='separate-rn-binary64-gradual-underflow')throw new UnsupportedFloatInterval('unsupported-fdlibm-profile');
 const base=createOriginalAngularMathInterval(profile.hypotProfile),saved=Object.freeze({tag:profile.tag,trig:profile.trig,arithmetic:profile.arithmetic,hypotProfile:base.profile});
 const polynomial=(ctx:OriginalFloatIntervalContext,x:B,cosine:boolean):B=>{
  const z=ctx.square(x),k=ORIGINAL_FDLIBM_INTERVAL_COEFFICIENTS,p=(a:number)=>ctx.point(a);
  if(!cosine){
   const v=ctx.mul(z,x),r=ctx.add(p(k.S2),ctx.mul(z,ctx.add(p(k.S3),ctx.mul(z,ctx.add(p(k.S4),ctx.mul(z,ctx.add(p(k.S5),ctx.mul(z,p(k.S6)))))))));
   return ctx.add(x,ctx.mul(v,ctx.add(p(k.S1),ctx.mul(z,r))));
  }
  const c5=ctx.add(p(k.C5),ctx.mul(z,p(k.C6)));
  const c4=ctx.add(p(k.C4),ctx.mul(z,c5));
  const c3=ctx.add(p(k.C3),ctx.mul(z,c4));
  const c2=ctx.add(p(k.C2),ctx.mul(z,c3));
  const c1=ctx.add(p(k.C1),ctx.mul(z,c2));
  const r=ctx.mul(z,c1);
  return ctx.sub(p(1),ctx.sub(ctx.mul(p(.5),z),ctx.sub(ctx.mul(z,r),ctx.mul(x,p(0)))));
 };
 const trig=(ctx:OriginalFloatIntervalContext,input:B,cosine:boolean):B=>{
  const x=ctx.hull(input,input),zero=ctx.point(0),cut=ctx.point(cutoff);
  if(ctx.compare(x,zero,'>=')!=='true'||ctx.compare(x,ctx.point(domainHi),'<=')!=='true')throw new UnsupportedFloatInterval('outside-fdlibm-unreduced-domain');
  const tiny=ctx.compare(x,cut,'<');let result:B|undefined;
  if(tiny!=='false'){const small=ctx.intersect(x,ctx.box(0,predecessor));result=cosine?ctx.point(1):small;}
  if(tiny!=='true'){const large=ctx.intersect(x,ctx.box(cutoff,domainHi)),value=polynomial(ctx,large,cosine);result=result?ctx.hull(result,value):value;}
  if(!result)throw new UnsupportedFloatInterval('missing-fdlibm-branch');return result;
 };
 const contract:OriginalAngularMathContract=Object.freeze({tag:saved.tag,hypot:base.contract.hypot,sin:(c:OriginalFloatIntervalContext,a:B)=>trig(c,a,false),cos:(c:OriginalFloatIntervalContext,a:B)=>trig(c,a,true)});
 return Object.freeze({contract,profile:saved,angleDomain:Object.freeze({lo:0,hi:domainHi}),tinyCutoff:cutoff,tinyPredecessor:predecessor,
  maximumTrigBranches:2 as const,conditionalFdlibmProfile:true as const,sourceProfileAttested:false as const,glibcEnclosed:false as const,
  rangeReductionImplemented:false as const,nativeEquivalent:false as const,defaultIntegration:false as const,runtimeTrigCalls:0 as const});
}
