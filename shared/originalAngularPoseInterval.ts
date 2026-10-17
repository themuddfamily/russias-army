import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint,type OriginalFloatVectorBox} from './originalFiniteFeatureInterval';
import type {OriginalQuaternion,OriginalSymmetricTensor} from './originalAngularBody';
import type {Vec3} from './protocol';

export interface OriginalQuaternionInterval extends OriginalFloatVectorBox {readonly w:OriginalFloatBox}
export interface OriginalAngularPosePointInput {
 readonly position:Vec3;readonly COMvelocity:Vec3;readonly orientation:OriginalQuaternion;
 readonly angularVelocity:Vec3;readonly centerOfMass:Vec3;readonly inverseInertia:OriginalSymmetricTensor;
}
/** Explicit caller premise, not a proof checked by this consumer. Callbacks
 * must be pure, bounded and enclose the corresponding runtime Math operation. */
export interface OriginalAngularMathContract {
 readonly tag:string;
 readonly hypot:(ctx:OriginalFloatIntervalContext,values:readonly OriginalFloatBox[],purpose?:'public-quaternion'|'speed'|'normalization'|'change'|'next')=>OriginalFloatBox;
 readonly sin:(ctx:OriginalFloatIntervalContext,angle:OriginalFloatBox)=>OriginalFloatBox;
 readonly cos:(ctx:OriginalFloatIntervalContext,angle:OriginalFloatBox)=>OriginalFloatBox;
}
export const ORIGINAL_ANGULAR_POSE_INTERVAL_LIMITS=Object.freeze({mathCalls:128,midpointIterations:12});
type V=OriginalFloatVectorBox;type Q=OriginalQuaternionInterval;type B=OriginalFloatBox;
type T=Readonly<{xx:B;yy:B;zz:B;xy:B;xz:B;yz:B}>;
const xyz=['x','y','z'] as const,xyzw=['x','y','z','w'] as const,tensorKeys=['xx','yy','zz','xy','xz','yz'] as const;
function ordinary(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-pose-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('pose-accessors-unsupported');}
}
function capture<TValue extends object>(value:TValue,keys:readonly (keyof TValue)[]):TValue {
 ordinary(value,keys as readonly string[]);const result:Record<string,number>={};
 for(const key of keys){const n=value[key];if(typeof n!=='number'||!Number.isFinite(n))throw new UnsupportedFloatInterval('nonfinite-pose-input');result[key as string]=n;}
 return Object.freeze(result) as unknown as TValue;
}
function canonicalInertia(value:OriginalSymmetricTensor):OriginalSymmetricTensor {
 ordinary(value,tensorKeys);
 // The source spreads this record, then checks Object.values. Required hidden
 // fields would disappear and extra enumerable fields could alter its guard.
 // Bound enumeration rather than allocating an arbitrary Object.keys array.
 let count=0;
 for(const key in value){
  if(++count>6||!Object.prototype.hasOwnProperty.call(value,key)||!tensorKeys.some(k=>k===key))throw new UnsupportedFloatInterval('canonical-enumerable-inertia-required');
 }
 if(count!==6)throw new UnsupportedFloatInterval('canonical-enumerable-inertia-required');
 for(const key of tensorKeys)if(!Object.getOwnPropertyDescriptor(value,key)!.enumerable)throw new UnsupportedFloatInterval('canonical-enumerable-inertia-required');
 return capture(value,tensorKeys);
}
const add=(c:OriginalFloatIntervalContext,a:V,b:V):V=>Object.freeze({x:c.add(a.x,b.x),y:c.add(a.y,b.y),z:c.add(a.z,b.z)});
const sub=(c:OriginalFloatIntervalContext,a:V,b:V):V=>Object.freeze({x:c.sub(a.x,b.x),y:c.sub(a.y,b.y),z:c.sub(a.z,b.z)});
const mul=(c:OriginalFloatIntervalContext,a:V,s:B):V=>Object.freeze({x:c.mul(a.x,s),y:c.mul(a.y,s),z:c.mul(a.z,s)});
const unionV=(c:OriginalFloatIntervalContext,a:V,b:V):V=>Object.freeze({x:c.hull(a.x,b.x),y:c.hull(a.y,b.y),z:c.hull(a.z,b.z)});
const unionQ=(c:OriginalFloatIntervalContext,a:Q,b:Q):Q=>Object.freeze({...unionV(c,a,b),w:c.hull(a.w,b.w)});
const conjugate=(c:OriginalFloatIntervalContext,q:Q):Q=>Object.freeze({x:c.neg(q.x),y:c.neg(q.y),z:c.neg(q.z),w:q.w});
const positive=(c:OriginalFloatIntervalContext,a:B)=>c.intersect(a,c.box(Number.MIN_VALUE,Number.MAX_VALUE));
function tensorVector(c:OriginalFloatIntervalContext,t:T,v:V):V {
 return Object.freeze({x:c.add(c.add(c.mul(t.xx,v.x),c.mul(t.xy,v.y)),c.mul(t.xz,v.z)),
  y:c.add(c.add(c.mul(t.xy,v.x),c.mul(t.yy,v.y)),c.mul(t.yz,v.z)),z:c.add(c.add(c.mul(t.xz,v.x),c.mul(t.yz,v.y)),c.mul(t.zz,v.z))});
}
function inverse(c:OriginalFloatIntervalContext,t:T):T {
 const {xx:a,yy:d,zz:f,xy:b,xz:v,yz:e}=t;
 const df=c.sub(c.mul(d,f),c.square(e)),bf=c.sub(c.mul(b,f),c.mul(v,e)),be=c.sub(c.mul(b,e),c.mul(v,d));
 const determinant=c.add(c.sub(c.mul(a,df),c.mul(b,bf)),c.mul(v,be)),zero=c.point(0);
 if(c.compare(a,zero,'>')!=='true'||c.compare(c.sub(c.mul(a,d),c.square(b)),zero,'>')!=='true'||c.compare(determinant,zero,'>')!=='true')throw new UnsupportedFloatInterval('invalid-or-unresolved-pose-inertia');
 return Object.freeze({xx:c.div(df,determinant),yy:c.div(c.sub(c.mul(a,f),c.square(v)),determinant),zz:c.div(c.sub(c.mul(a,d),c.square(b)),determinant),
  xy:c.div(c.sub(c.mul(v,e),c.mul(b,f)),determinant),xz:c.div(be,determinant),yz:c.div(c.sub(c.mul(b,v),c.mul(a,e)),determinant)});
}
class Runtime {
 readonly tag:string;private readonly hypotCallback:OriginalAngularMathContract['hypot'];private readonly sinCallback:OriginalAngularMathContract['sin'];private readonly cosCallback:OriginalAngularMathContract['cos'];
 calls=0;readonly maximum:number;
 constructor(readonly c:OriginalFloatIntervalContext,contract:OriginalAngularMathContract,maximum:number){
  ordinary(contract,['tag','hypot','sin','cos']);
  if(typeof contract.tag!=='string'||contract.tag.length===0||contract.tag.length>1024||![contract.hypot,contract.sin,contract.cos].every(v=>typeof v==='function'))throw new UnsupportedFloatInterval('explicit-pose-math-contract-required');
  if(!Number.isSafeInteger(maximum)||maximum<1||maximum>128)throw new UnsupportedFloatInterval('pose-math-cap-may-only-be-lowered');
  this.tag=contract.tag;this.hypotCallback=contract.hypot;this.sinCallback=contract.sin;this.cosCallback=contract.cos;this.maximum=maximum;
 }
 private call(callback:()=>B):B {
  if(this.calls>=this.maximum)throw new UnsupportedFloatInterval('pose-math-call-cap');this.calls++;
  try{const value=callback();return this.c.hull(value,value);}catch(error){if(error instanceof UnsupportedFloatInterval)throw error;throw new UnsupportedFloatInterval('pose-math-contract-threw');}
 }
 hypot(values:readonly B[],purpose:Parameters<OriginalAngularMathContract['hypot']>[2]):B{return this.c.intersect(this.call(()=>this.hypotCallback(this.c,Object.freeze([...values]),purpose)),this.c.box(0,Number.MAX_VALUE));}
 sin(angle:B):B{return this.call(()=>this.sinCallback(this.c,angle));}
 cos(angle:B):B{return this.call(()=>this.cosCallback(this.c,angle));}
 requireQ(q:Q):void {
  const difference=this.c.sub(this.hypot([q.x,q.y,q.z,q.w],'public-quaternion'),this.c.point(1));
  const absolute=this.c.max(this.c.neg(difference),difference);
  if(this.c.compare(absolute,this.c.point(1e-6),'<=')!=='true')throw new UnsupportedFloatInterval('invalid-or-unresolved-public-quaternion');
 }
 rotate(q:Q,v:V):V {
  this.requireQ(q);const c=this.c,two=c.point(2);
  const tx=c.mul(c.sub(c.mul(q.y,v.z),c.mul(q.z,v.y)),two),ty=c.mul(c.sub(c.mul(q.z,v.x),c.mul(q.x,v.z)),two),tz=c.mul(c.sub(c.mul(q.x,v.y),c.mul(q.y,v.x)),two);
  return Object.freeze({x:c.add(v.x,c.add(c.mul(tx,q.w),c.sub(c.mul(q.y,tz),c.mul(q.z,ty)))),
   y:c.add(v.y,c.add(c.mul(ty,q.w),c.sub(c.mul(q.z,tx),c.mul(q.x,tz)))),z:c.add(v.z,c.add(c.mul(tz,q.w),c.sub(c.mul(q.x,ty),c.mul(q.y,tx))))});
 }
 rotated(before:Q,omega:V,seconds:B):Q {
  const c=this.c,speed=this.hypot([omega.x,omega.y,omega.z],'speed'),zero=c.point(0);
  c.mul(speed,seconds); // Source checks finite angle even on a return branch.
  const speedZero=c.compare(speed,zero,'==='),timeZero=c.compare(seconds,zero,'===');
  let result:Q|undefined=(speedZero!=='false'||timeZero!=='false')?before:undefined;
  if(speedZero!=='true'&&timeZero!=='true'){
   const divisor=positive(c,speed),duration=positive(c,seconds),angle=c.mul(divisor,duration),half=c.div(angle,c.point(2)),factor=c.div(this.sin(half),divisor);
   const v=mul(c,omega,factor),dq:Q=Object.freeze({...v,w:this.cos(half)}),a=dq,b=before;
   const next:Q=Object.freeze({x:c.sub(c.add(c.add(c.mul(a.w,b.x),c.mul(a.x,b.w)),c.mul(a.y,b.z)),c.mul(a.z,b.y)),
    y:c.add(c.add(c.sub(c.mul(a.w,b.y),c.mul(a.x,b.z)),c.mul(a.y,b.w)),c.mul(a.z,b.x)),
    z:c.add(c.sub(c.add(c.mul(a.w,b.z),c.mul(a.x,b.y)),c.mul(a.y,b.x)),c.mul(a.z,b.w)),
    w:c.sub(c.sub(c.sub(c.mul(a.w,b.w),c.mul(a.x,b.x)),c.mul(a.y,b.y)),c.mul(a.z,b.z))});
   const length=this.hypot([next.x,next.y,next.z,next.w],'normalization');
   if(c.compare(length,zero,'>')!=='true')throw new UnsupportedFloatInterval('unsafe-pose-normalization');
   const q:Q=Object.freeze({x:c.div(next.x,length),y:c.div(next.y,length),z:c.div(next.z,length),w:c.div(next.w,length)});result=result?unionQ(c,result,q):q;
  }
  if(!result)throw new UnsupportedFloatInterval('unsupported-rotated-orientation');return result;
 }
}

/** Public rotateValidated graph, including the runtime public quaternion guard.
 * Each invocation has its own explicit math cap and shares the caller context. */
export function encloseOriginalRotateVector(ctx:OriginalFloatIntervalContext,q:Q,v:V,contract:OriginalAngularMathContract,limits:{readonly mathCalls?:number}={}):V {
 ordinary(q,xyzw);ordinary(v,xyz);
 const ownedQ:Q=Object.freeze({x:ctx.hull(q.x,q.x),y:ctx.hull(q.y,q.y),z:ctx.hull(q.z,q.z),w:ctx.hull(q.w,q.w)});
 const ownedV:V=Object.freeze({x:ctx.hull(v.x,v.x),y:ctx.hull(v.y,v.y),z:ctx.hull(v.z,v.z)});
 return new Runtime(ctx,contract,limits.mathCalls??128).rotate(ownedQ,ownedV);
}

/** Detached conditional enclosure of the source pose only. No hull, Math proof,
 * scene oracle, sequential advancement, native equivalence or default caller. */
export function encloseOriginalAngularPose(ctx:OriginalFloatIntervalContext,input:OriginalAngularPosePointInput,secondsInput:B,contract:OriginalAngularMathContract,limits:{readonly mathCalls?:number}={}) {
 ordinary(input,['position','COMvelocity','orientation','angularVelocity','centerOfMass','inverseInertia']);
 // Snapshot every numerical field before the first caller callback.
 const saved=Object.freeze({position:capture(input.position,xyz),COMvelocity:capture(input.COMvelocity,xyz),orientation:capture(input.orientation,xyzw),
  angularVelocity:capture(input.angularVelocity,xyz),centerOfMass:capture(input.centerOfMass,xyz),inverseInertia:canonicalInertia(input.inverseInertia)});
 const c=ctx,seconds=c.hull(secondsInput,secondsInput),zero=c.point(0);
 if(c.compare(seconds,zero,'>=')!=='true')throw new UnsupportedFloatInterval('nonnegative-pose-seconds-required');
 const runtime=new Runtime(c,contract,limits.mathCalls??128),position=originalFloatVectorPoint(c,saved.position),velocity=originalFloatVectorPoint(c,saved.COMvelocity),incoming=originalFloatVectorPoint(c,saved.angularVelocity);
 const before:Q=Object.freeze({...originalFloatVectorPoint(c,saved.orientation),w:c.point(saved.orientation.w)}),COM=originalFloatVectorPoint(c,saved.centerOfMass),t=saved.inverseInertia;
 const inverseInertia:T=Object.freeze({xx:c.point(t.xx),yy:c.point(t.yy),zz:c.point(t.zz),xy:c.point(t.xy),xz:c.point(t.xz),yz:c.point(t.yz)});
 runtime.requireQ(before);
 const secondsZero=c.compare(seconds,zero,'==='),hasZero=secondsZero!=='false';
 let pivot:V|undefined=hasZero?position:undefined,orientation:Q|undefined=hasZero?before:undefined,stored:V|undefined=hasZero?incoming:undefined;
 let iterations=0,unknownStops=0;
 if(secondsZero!=='true'){
  const duration=positive(c,seconds);
  if(saved.angularVelocity.x===0&&saved.angularVelocity.y===0&&saved.angularVelocity.z===0){
   const translated=add(c,position,mul(c,velocity,duration));pivot=pivot?unionV(c,pivot,translated):translated;orientation=before;stored=incoming;
  }else{
   const oldCenter=add(c,position,runtime.rotate(before,COM)),DEG=c.point(Math.PI/180),omega=mul(c,incoming,DEG);
   const inertia=inverse(c,inverseInertia),momentum=runtime.rotate(before,tensorVector(c,inertia,runtime.rotate(conjugate(c,before),omega)));
   const at=(q:Q)=>runtime.rotate(q,tensorVector(c,inverseInertia,runtime.rotate(conjugate(c,q),momentum)));
   const half=c.div(duration,c.point(2));let active=omega,terminal:V|undefined;
   for(let i=0;i<12;i++){
    iterations++;const next=at(runtime.rotated(before,active,half)),delta=sub(c,next,active),change=runtime.hypot([delta.x,delta.y,delta.z],'change');
    const tolerance=c.mul(c.point(1e-13),c.max(c.point(1),runtime.hypot([next.x,next.y,next.z],'next'))),stop=c.compare(change,tolerance,'<=');
    if(stop==='unknown')unknownStops++;
    if(stop!=='false'||i===11)terminal=terminal?unionV(c,terminal,next):next;
    active=next; // Assignment occurs before the stopping test in the source.
    if(stop==='true')break;
   }
   if(!terminal)throw new UnsupportedFloatInterval('missing-assigned-midpoint-terminal');
   const q=runtime.rotated(before,terminal,duration),angular=mul(c,at(q),c.div(c.point(1),DEG));
   const placed=sub(c,add(c,oldCenter,mul(c,velocity,duration)),runtime.rotate(q,COM));
   pivot=pivot?unionV(c,pivot,placed):placed;orientation=orientation?unionQ(c,orientation,q):q;stored=stored?unionV(c,stored,angular):angular;
  }
 }
 if(!pivot||!orientation||!stored)throw new UnsupportedFloatInterval('missing-pose-alternative');
 return Object.freeze({pivot,orientation,angularVelocity:stored,mathCalls:runtime.calls,maxMathCalls:runtime.maximum,midpointIterations:iterations,unknownMidpointStops:unknownStops,
  includesZeroSeconds:hasZero,contractTag:runtime.tag,conditionalMathContract:true as const,mathContractVerified:false as const,
  fullHullEnclosed:false as const,wrapperExclusionCertified:false as const,nativeEquivalent:false as const,defaultIntegration:false as const});
}
