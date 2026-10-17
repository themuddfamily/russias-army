import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {createOriginalAngularMathInterval,type OriginalAngularMathSourceProfile} from './originalAngularMathInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';

export interface OriginalAngularGlibcSourceProfile {
 readonly tag:string;readonly trig:'retained-glibc-unreduced-taylor-table';readonly arithmetic:'separate-rn-binary64-gradual-underflow';
 readonly decimalLiterals:'correctly-rounded-binary64-coefficient-translation';readonly tableABI:'binary64-int4-lowword-source-table';
 readonly hypotProfile:OriginalAngularMathSourceProfile;
}
/** Constants derived from IBM Accurate Mathematical Library/glibc sources.
 * Original source is LGPL-2.1-or-later; provenance is recorded in README. */
export const ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS=Object.freeze({s1:'bfc5555555555555',s2:'3f81111111110ece',s3:'bf2a01a019db08b8',s4:'3ec71de27b9a7ed9',s5:'be5addffc2fcdf59',
 big:'42c8000000000000',sn3:'bfc5555555555515',sn5:'3f811110e829872f',cs2:'3fe0000000000000',cs4:'bfa5555555555535',cs6:'3f56c16bedd9e239'});
export const ORIGINAL_GLIBC_INTERVAL_TABLE_BITS=Object.freeze([
 ['0000000000000000','0000000000000000','3ff0000000000000','0000000000000000'],
 ['3f7fffeaaaaeeeef','bc1e45e2ec67b77c','3fefffc000155552','3c8f4a01a0196dae'],
 ['3f8fffaaaaeeeed5','bc02ab639a9f0777','3fefff000155549f','3c828a28a03a5ef3'],
 ['3f97ff7001033255','3bfefe2b51527336','3feffdc006bff7e6','3c8ae6dae86977bd'],
 ['3f9ffeaaaeeee86f','bc3cd406fb224ae2','3feffc00155527d3','bc83b54492d89b5b'],
 ['3fa3feb2b12d45d5','3c34ec54203d1c11','3feff9c03414a7ba','3c6991f4be6c59bf'],
 ['3fa7fdc01032fba9','bc4599bdf46e997a','3feff7006bfdf99f','bc78b3b560648d5f'],
 ['3fabfc6d78586dac','3c18e4fd03dbf236','3feff3c0c8103a31','3c74856dbddc0e66'],
 ['3faffaaaeeed4edb','bc42d16d32684b69','3feff0015549f4d3','3c8328387b99426f'],
 ['3fb1fc343d808bef','bc5f3d32e6f3be4f','3fefebc222a8ef9f','3c57934934f54c77'],
 ['3fb3facb12d1755b','bc5921915299468c','3fefe7034129ef6f','bc6cbf4337c96f97'],
 ['3fb5f911fd10b737','bc50184f02be9102','3fefe1c4c3c873eb','bc35a9c9057c4a02'],
 ['3fb7f701032550e4','3c3afc2d1800501a','3fefdc06bf7e6b9b','3c831902b535f8db'],
 ['3fb9f4902d55d1f9','3c52696d7eac1dc1','3fefd5c94b43e000','bc62e768cb4f92f9'],
 ['3fbbf1b78568391d','3c5e91841dea4cc8','3fefcf0c800e99b1','3c6ea3d786d186ac'],
 ['3fbdee6f16c1cce6','bc450f8e2fb71673','3fefc7d078d1bc88','3c8075d2447db685'],
 ['3fbfeaaeee86ee36','bc4afcb2bcc6f03b','3fefc015527d5bd3','3c8b68f35094efb8'],
].map(row=>Object.freeze(row as readonly string[])));
function decode(bits:string):number {const view=new DataView(new ArrayBuffer(8));view.setBigUint64(0,BigInt('0x'+bits),false);return view.getFloat64(0,false);}
export const ORIGINAL_GLIBC_INTERVAL_COEFFICIENTS=Object.freeze({s1:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.s1),s2:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.s2),s3:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.s3),s4:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.s4),s5:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.s5),
 big:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.big),sn3:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.sn3),sn5:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.sn5),cs2:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.cs2),cs4:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.cs4),cs6:decode(ORIGINAL_GLIBC_INTERVAL_COEFFICIENT_BITS.cs6)});
export const ORIGINAL_GLIBC_INTERVAL_TABLE=Object.freeze(ORIGINAL_GLIBC_INTERVAL_TABLE_BITS.map(row=>Object.freeze(row.map(decode))));
type B=OriginalFloatBox;const domainHi=.125;
export function createOriginalAngularGlibcInterval(profile:OriginalAngularGlibcSourceProfile) {
 if(!profile||Object.getPrototypeOf(profile)!==Object.prototype||!Object.isFrozen(profile))throw new UnsupportedFloatInterval('explicit-frozen-glibc-profile-required');
 for(const key of ['tag','trig','arithmetic','decimalLiterals','tableABI','hypotProfile'] as const){const d=Object.getOwnPropertyDescriptor(profile,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('glibc-profile-accessors-unsupported');}
 if(typeof profile.tag!=='string'||profile.tag.length===0||profile.tag.length>1024||profile.trig!=='retained-glibc-unreduced-taylor-table'||profile.arithmetic!=='separate-rn-binary64-gradual-underflow'||profile.decimalLiterals!=='correctly-rounded-binary64-coefficient-translation'||profile.tableABI!=='binary64-int4-lowword-source-table')throw new UnsupportedFloatInterval('unsupported-glibc-profile');
 const base=createOriginalAngularMathInterval(profile.hypotProfile),saved=Object.freeze({tag:profile.tag,trig:profile.trig,arithmetic:profile.arithmetic,decimalLiterals:profile.decimalLiterals,tableABI:profile.tableABI,hypotProfile:base.profile});
 const sine=(ctx:OriginalFloatIntervalContext,x:B):B=>{
  const k=ORIGINAL_GLIBC_INTERVAL_COEFFICIENTS,p=(v:number)=>ctx.point(v),xx=ctx.square(x),dx=p(0);
  const s4=ctx.add(ctx.mul(p(k.s5),xx),p(k.s4));
  const s3=ctx.add(ctx.mul(s4,xx),p(k.s3));
  const s2=ctx.add(ctx.mul(s3,xx),p(k.s2));
  const polynomial=ctx.add(ctx.mul(s2,xx),p(k.s1));
  const correction=ctx.add(ctx.mul(ctx.sub(ctx.mul(polynomial,x),ctx.mul(p(.5),dx)),xx),dx);
  return ctx.add(x,correction);
 };
 const cosine=(ctx:OriginalFloatIntervalContext,input:B):B=>{
  const k=ORIGINAL_GLIBC_INTERVAL_COEFFICIENTS,p=(v:number)=>ctx.point(v),big=p(k.big),u=ctx.add(big,input);let result:B|undefined;
  for(let row=0;row<=16;row++){
   const lo=Math.max(0,(2*row-1)/256),hi=Math.min(domainHi,(2*row+1)/256),rowU=k.big+row/128;
   if(input.hi<lo||input.lo>hi||u.hi<rowU||u.lo>rowU)continue;
   const argument=ctx.intersect(input,ctx.box(lo,hi)),sameU=ctx.intersect(u,p(rowU));
   const x=ctx.add(ctx.sub(argument,ctx.sub(sameU,big)),p(0)),xx=ctx.square(x);
   const s=ctx.add(x,ctx.mul(ctx.mul(x,xx),ctx.add(p(k.sn3),ctx.mul(xx,p(k.sn5)))));
   const c=ctx.mul(xx,ctx.add(p(k.cs2),ctx.mul(xx,ctx.add(p(k.cs4),ctx.mul(xx,p(k.cs6))))));
   const [sn,ssn,cs,ccs]=ORIGINAL_GLIBC_INTERVAL_TABLE[row];
   const correction=ctx.sub(ctx.sub(ctx.sub(p(ccs),ctx.mul(s,p(ssn))),ctx.mul(p(cs),c)),ctx.mul(p(sn),s));
   const value=ctx.add(p(cs),correction);result=result?ctx.hull(result,value):value;
  }
  if(!result)throw new UnsupportedFloatInterval('missing-glibc-cosine-row');return result;
 };
 const trig=(ctx:OriginalFloatIntervalContext,input:B,isCosine:boolean):B=>{
  const x=ctx.hull(input,input);
  if(ctx.compare(x,ctx.point(0),'>=')!=='true'||ctx.compare(x,ctx.point(domainHi),'<=')!=='true')throw new UnsupportedFloatInterval('outside-glibc-unreduced-domain');
  const cutoff=isCosine?2**-27:2**-26,predecessor=isCosine?cutoff-2**-80:cutoff-2**-79,tiny=ctx.compare(x,ctx.point(cutoff),'<');let result:B|undefined;
  if(tiny!=='false'){const small=ctx.intersect(x,ctx.box(0,predecessor));result=isCosine?ctx.point(1):small;}
  if(tiny!=='true'){const argument=ctx.intersect(x,ctx.box(cutoff,domainHi)),value=isCosine?cosine(ctx,argument):sine(ctx,argument);result=result?ctx.hull(result,value):value;}
  if(!result)throw new UnsupportedFloatInterval('missing-glibc-trig-branch');return result;
 };
 const contract:OriginalAngularMathContract=Object.freeze({tag:saved.tag,hypot:base.contract.hypot,sin:(ctx:OriginalFloatIntervalContext,x:B)=>trig(ctx,x,false),cos:(ctx:OriginalFloatIntervalContext,x:B)=>trig(ctx,x,true)});
 return Object.freeze({contract,profile:saved,angleDomain:Object.freeze({lo:0,hi:domainHi}),sineTinyCutoff:2**-26,cosineTinyCutoff:2**-27,
  maximumCosineRows:17 as const,maximumSineBranches:2 as const,maximumCosineBranches:18 as const,inclusiveRowCuts:true as const,
  conditionalGlibcProfile:true as const,sourceProfileAttested:false as const,fdlibmEnclosed:false as const,rangeReductionImplemented:false as const,
  nativeEquivalent:false as const,defaultIntegration:false as const,runtimeTrigCalls:0 as const});
}
