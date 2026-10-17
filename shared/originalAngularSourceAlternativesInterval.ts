import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {createOriginalAngularFdlibmInterval,type OriginalAngularFdlibmSourceProfile} from './originalAngularFdlibmInterval';
import {createOriginalAngularGlibcInterval,type OriginalAngularGlibcSourceProfile} from './originalAngularGlibcInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';

/** Caller asserts that each executing trig call uses one of these two retained
 * graphs with the declared lowering. This record does not attest that premise. */
export interface OriginalAngularSourceAlternativesProfile {
 readonly tag:string;
 readonly trigAlternatives:'retained-fdlibm-or-glibc-unreduced';
 readonly fdlibmProfile:OriginalAngularFdlibmSourceProfile;
 readonly glibcProfile:OriginalAngularGlibcSourceProfile;
}
export function createOriginalAngularSourceAlternativesInterval(profile:OriginalAngularSourceAlternativesProfile) {
 if(!profile||Object.getPrototypeOf(profile)!==Object.prototype||!Object.isFrozen(profile))throw new UnsupportedFloatInterval('explicit-frozen-trig-alternatives-profile-required');
 for(const key of ['tag','trigAlternatives','fdlibmProfile','glibcProfile'] as const){
  const d=Object.getOwnPropertyDescriptor(profile,key);
  if(!d||!('value' in d))throw new UnsupportedFloatInterval('trig-alternatives-profile-accessors-unsupported');
 }
 if(typeof profile.tag!=='string'||profile.tag.length===0||profile.tag.length>1024||profile.trigAlternatives!=='retained-fdlibm-or-glibc-unreduced')throw new UnsupportedFloatInterval('unsupported-trig-alternatives-profile');
 const fdlibm=createOriginalAngularFdlibmInterval(profile.fdlibmProfile);
 const glibc=createOriginalAngularGlibcInterval(profile.glibcProfile);
 // Both factories validate the same mandatory hypot source graph and sqrt
 // premise. Their tags do not alter that graph; one evaluation covers both.
 const saved=Object.freeze({tag:profile.tag,trigAlternatives:profile.trigAlternatives,fdlibmProfile:fdlibm.profile,glibcProfile:glibc.profile});
 const trig=(ctx:OriginalFloatIntervalContext,angle:OriginalFloatBox,cosine:boolean):OriginalFloatBox=>{
  const first=cosine?fdlibm.contract.cos(ctx,angle):fdlibm.contract.sin(ctx,angle);
  const second=cosine?glibc.contract.cos(ctx,angle):glibc.contract.sin(ctx,angle);
  // A failed reachable alternative propagates. Neither a fresh context nor a
  // fallback to the successful alternative can justify the union.
  return ctx.hull(first,second);
 };
 const contract:OriginalAngularMathContract=Object.freeze({tag:saved.tag,hypot:fdlibm.contract.hypot,
  sin:(ctx:OriginalFloatIntervalContext,a:OriginalFloatBox)=>trig(ctx,a,false),
  cos:(ctx:OriginalFloatIntervalContext,a:OriginalFloatBox)=>trig(ctx,a,true)});
 return Object.freeze({contract,profile:saved,angleDomain:Object.freeze({lo:0,hi:1/8}),trigSourceAlternatives:2 as const,
  hypotGraphShared:true as const,conditionalSourceAlternatives:true as const,sourceProfileAttested:false as const,
  rangeReductionImplemented:false as const,nativeEquivalent:false as const,defaultIntegration:false as const,runtimeTrigCalls:0 as const});
}
