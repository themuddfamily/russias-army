import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import type {Vec3} from './protocol';

/** Caller-certified ranges of the SAME actual source tuple. Numeric ranges do
 * not certify signed zero, pose regularity, runtime roots or wrapper admission. */
export interface OriginalFloatVectorBox {readonly x:OriginalFloatBox;readonly y:OriginalFloatBox;readonly z:OriginalFloatBox}
export interface OriginalFloatTriangleEdges {readonly ab:OriginalFloatVectorBox;readonly ac:OriginalFloatVectorBox;readonly bc:OriginalFloatVectorBox}
export interface OriginalFloatSegmentVector {readonly v:OriginalFloatVectorBox;readonly cc:OriginalFloatBox}
export type OriginalTriangleIntervalExit='a'|'b'|'ab'|'c'|'ac'|'bc'|'face';
export type OriginalSegmentIntervalPath='both-zero'|'first-zero'|'second-zero'|'nonparallel-low'|'nonparallel-high'|'nonparallel-interior'|'parallel-low'|'parallel-high'|'parallel-interior';
export const ORIGINAL_FINITE_FEATURE_INTERVAL_LIMITS=Object.freeze({triangleExits:7,segmentPaths:9});
type Truth='true'|'false'|'unknown';
const axes=['x','y','z'] as const;
function record(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-feature-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('feature-accessors-unsupported');}
}
function vector(ctx:OriginalFloatIntervalContext,value:OriginalFloatVectorBox):OriginalFloatVectorBox {
 record(value,axes);return ctx.vector3(value.x,value.y,value.z);
}
export function originalFloatVectorPoint(ctx:OriginalFloatIntervalContext,value:Vec3):OriginalFloatVectorBox {
 record(value,axes);return Object.freeze({x:ctx.point(value.x),y:ctx.point(value.y),z:ctx.point(value.z)});
}
const add=(c:OriginalFloatIntervalContext,a:OriginalFloatVectorBox,b:OriginalFloatVectorBox):OriginalFloatVectorBox=>Object.freeze({x:c.add(a.x,b.x),y:c.add(a.y,b.y),z:c.add(a.z,b.z)});
const sub=(c:OriginalFloatIntervalContext,a:OriginalFloatVectorBox,b:OriginalFloatVectorBox):OriginalFloatVectorBox=>Object.freeze({x:c.sub(a.x,b.x),y:c.sub(a.y,b.y),z:c.sub(a.z,b.z)});
const mul=(c:OriginalFloatIntervalContext,a:OriginalFloatVectorBox,s:OriginalFloatBox):OriginalFloatVectorBox=>Object.freeze({x:c.mul(a.x,s),y:c.mul(a.y,s),z:c.mul(a.z,s)});
const dot=(c:OriginalFloatIntervalContext,a:OriginalFloatVectorBox,b:OriginalFloatVectorBox)=>c.dot3(a.x,a.y,a.z,b.x,b.y,b.z);
const squared=(c:OriginalFloatIntervalContext,a:OriginalFloatVectorBox)=>c.squared3(a.x,a.y,a.z);
const meet=(c:OriginalFloatIntervalContext,a:OriginalFloatVectorBox,b:OriginalFloatVectorBox):OriginalFloatVectorBox=>Object.freeze({x:c.intersect(a.x,b.x),y:c.intersect(a.y,b.y),z:c.intersect(a.z,b.z)});
const merge=(c:OriginalFloatIntervalContext,a:OriginalFloatVectorBox,b:OriginalFloatVectorBox):OriginalFloatVectorBox=>Object.freeze({x:c.hull(a.x,b.x),y:c.hull(a.y,b.y),z:c.hull(a.z,b.z)});
function all(...values:Truth[]):Truth {return values.includes('false')?'false':values.every(v=>v==='true')?'true':'unknown';}
const nonnegative=(c:OriginalFloatIntervalContext,a:OriginalFloatBox)=>c.intersect(a,c.box(0,Number.MAX_VALUE));
const nonpositive=(c:OriginalFloatIntervalContext,a:OriginalFloatBox)=>c.intersect(a,c.box(-Number.MAX_VALUE,0));
const positive=(c:OriginalFloatIntervalContext,a:OriginalFloatBox)=>c.intersect(a,c.box(Number.MIN_VALUE,Number.MAX_VALUE));
const clamp=(c:OriginalFloatIntervalContext,a:OriginalFloatBox,z:OriginalFloatBox,o:OriginalFloatBox)=>c.max(z,c.min(o,a));

/** Source closestTriangle's ordered exits. Unknown guards retain both possible
 * continuations; interval feasibility overapproximates joint dependencies.
 * A reachable/unexcluded unsupported quotient aborts the whole enclosure.
 * Optional cached edges must enclose the same RN differences, not ideal edges. */
export function encloseOriginalClosestTriangle(ctx:OriginalFloatIntervalContext,pInput:OriginalFloatVectorBox,
 triangle:readonly [OriginalFloatVectorBox,OriginalFloatVectorBox,OriginalFloatVectorBox],constant?:OriginalFloatTriangleEdges):Readonly<{witness:OriginalFloatVectorBox;exits:readonly OriginalTriangleIntervalExit[]}> {
 if(!Array.isArray(triangle)||Object.getPrototypeOf(triangle)!==Array.prototype||triangle.length!==3||Object.getOwnPropertyDescriptor(triangle,Symbol.iterator))throw new UnsupportedFloatInterval('ordinary-feature-triangle-required');
 for(let i=0;i<3;i++){const d=Object.getOwnPropertyDescriptor(triangle,i);if(!d||!('value' in d))throw new UnsupportedFloatInterval('feature-triangle-accessor-unsupported');}
 const p=vector(ctx,pInput),a=vector(ctx,triangle[0]),b=vector(ctx,triangle[1]),c=vector(ctx,triangle[2]),zero=ctx.point(0),one=ctx.point(1);
 const freshAB=sub(ctx,b,a),freshAC=sub(ctx,c,a);
 if(constant)record(constant,['ab','ac','bc']);
 const ab=constant?meet(ctx,freshAB,vector(ctx,constant.ab)):freshAB,ac=constant?meet(ctx,freshAC,vector(ctx,constant.ac)):freshAC;
 let witness:OriginalFloatVectorBox|undefined;const exits:OriginalTriangleIntervalExit[]=[];
 const emit=(guard:Truth,name:OriginalTriangleIntervalExit,make:()=>OriginalFloatVectorBox)=>{
  if(guard!=='false'){const value=make();witness=witness?merge(ctx,witness,value):value;exits.push(name);}
  return guard==='true';
 };
 const finish=()=>{if(!witness||exits.length>7)throw new UnsupportedFloatInterval('unsupported-triangle-exit');return Object.freeze({witness,exits:Object.freeze(exits)});};
 // Reuse only each projection pair when its original ordered stage is reached.
 // Later bp/cp arithmetic and optional constant.bc validation remain lazy.
 const projectionPair=(w:OriginalFloatVectorBox)=>ctx.triangleZeroXDotPair(ab.x,ab.y,ab.z,ac.x,ac.y,ac.z,w.x,w.y,w.z);
 const ap=sub(ctx,p,a),apPair=projectionPair(ap),d1=apPair?.[0]??dot(ctx,ab,ap),d2=apPair?.[1]??dot(ctx,ac,ap);
 if(emit(all(ctx.compare(d1,zero,'<='),ctx.compare(d2,zero,'<=')),'a',()=>a))return finish();
 const bp=sub(ctx,p,b),bpPair=projectionPair(bp),d3=bpPair?.[0]??dot(ctx,ab,bp),d4=bpPair?.[1]??dot(ctx,ac,bp);
 if(emit(all(ctx.compare(d3,zero,'>='),ctx.compare(d4,d3,'<=')),'b',()=>b))return finish();
 const vc=ctx.sub(ctx.mul(d1,d4),ctx.mul(d3,d2));
 if(emit(all(ctx.compare(vc,zero,'<='),ctx.compare(d1,zero,'>='),ctx.compare(d3,zero,'<=')),'ab',()=>{
  const n=nonnegative(ctx,d1),other=nonpositive(ctx,d3);return add(ctx,a,mul(ctx,ab,ctx.div(n,ctx.sub(n,other))));
 }))return finish();
 const cp=sub(ctx,p,c),cpPair=projectionPair(cp),d5=cpPair?.[0]??dot(ctx,ab,cp),d6=cpPair?.[1]??dot(ctx,ac,cp);
 if(emit(all(ctx.compare(d6,zero,'>='),ctx.compare(d5,d6,'<=')),'c',()=>c))return finish();
 const vb=ctx.sub(ctx.mul(d5,d2),ctx.mul(d1,d6));
 if(emit(all(ctx.compare(vb,zero,'<='),ctx.compare(d2,zero,'>='),ctx.compare(d6,zero,'<=')),'ac',()=>{
  const n=nonnegative(ctx,d2),other=nonpositive(ctx,d6);return add(ctx,a,mul(ctx,ac,ctx.div(n,ctx.sub(n,other))));
 }))return finish();
 const va=ctx.sub(ctx.mul(d3,d6),ctx.mul(d5,d4)),d4d3=ctx.sub(d4,d3),d5d6=ctx.sub(d5,d6);
 if(emit(all(ctx.compare(va,zero,'<='),ctx.compare(d4d3,zero,'>='),ctx.compare(d5d6,zero,'>=')),'bc',()=>{
  const n=nonnegative(ctx,d4d3),other=nonnegative(ctx,d5d6),freshBC=sub(ctx,c,b);
  const bc=constant?meet(ctx,freshBC,vector(ctx,constant.bc)):freshBC;
  return add(ctx,b,mul(ctx,bc,ctx.div(n,ctx.add(n,other))));
 }))return finish();
 emit('true','face',()=>{
  const denominator=ctx.div(one,ctx.add(ctx.add(va,vb),vc));
  return add(ctx,a,add(ctx,mul(ctx,ab,ctx.mul(vb,denominator)),mul(ctx,ac,ctx.mul(vc,denominator))));
 });return finish();
}

/** Source closestSegments, including all zero/parallel/clamp paths. Every
 * quotient is checked before min/max. Conditional cuts refer only to the
 * corresponding source predicate; no ideal minimizer or unit vector is used.
 * firstSourceU, when supplied, encloses the SAME actual RN(b-a) after source
 * endpoint translation. It is intersected with the fresh source difference;
 * it is not an untranslated edge cache or an ideal displacement. */
export function encloseOriginalClosestSegments(ctx:OriginalFloatIntervalContext,aInput:OriginalFloatVectorBox,bInput:OriginalFloatVectorBox,
 cInput:OriginalFloatVectorBox,dInput:OriginalFloatVectorBox,constant?:OriginalFloatSegmentVector,firstSourceU?:OriginalFloatVectorBox):Readonly<{first:OriginalFloatVectorBox;second:OriginalFloatVectorBox;paths:readonly OriginalSegmentIntervalPath[]}> {
 const a=vector(ctx,aInput),b=vector(ctx,bInput),c=vector(ctx,cInput),d=vector(ctx,dInput),zero=ctx.point(0),one=ctx.point(1);
 const freshU=sub(ctx,b,a),u=firstSourceU?meet(ctx,freshU,vector(ctx,firstSourceU)):freshU,freshV=sub(ctx,d,c);if(constant)record(constant,['v','cc']);
 const v=constant?meet(ctx,freshV,vector(ctx,constant.v)):freshV,w=sub(ctx,a,c);
 const saturated=constant?ctx.segmentSaturatedParameters(u.x,u.y,u.z,v.x,v.y,v.z,w.x,w.y,w.z,constant.cc)
  :ctx.segmentSaturatedParameters(u.x,u.y,u.z,v.x,v.y,v.z,w.x,w.y,w.z);
 const paths:OriginalSegmentIntervalPath[]=[];let first:OriginalFloatVectorBox|undefined,second:OriginalFloatVectorBox|undefined;
 const append=(name:OriginalSegmentIntervalPath,s:OriginalFloatBox,t:OriginalFloatBox,early=false)=>{
  const x=early?a:add(ctx,a,mul(ctx,u,s)),y=early?c:add(ctx,c,mul(ctx,v,t));
  first=first?merge(ctx,first,x):x;second=second?merge(ctx,second,y):y;paths.push(name);
 };
 const finish=()=>{
  if(!first||!second||paths.length>9)throw new UnsupportedFloatInterval('unsupported-segment-path');
  return Object.freeze({first,second,paths:Object.freeze(paths)});
 };
 if(saturated){
  // The envelope theorem proves identical saturated parameters, not identical
  // endpoints or winners. Execute the source RN witness graph for this call.
  for(const parameter of saturated)append(parameter.path,parameter.s,parameter.t,parameter.early);
  return finish();
 }
 // Default returns undefined without charging or performing any prefix work.
 // Its original scalar evaluation order is consequently preserved below.
 const prefix=constant?ctx.segmentDisplacementPrefix(u.x,u.y,u.z,v.x,v.y,v.z,constant.cc):ctx.segmentDisplacementPrefix(u.x,u.y,u.z,v.x,v.y,v.z);
 const aa=prefix?.aa??squared(ctx,u),bb=prefix?.bb??dot(ctx,u,v),freshCC=prefix?.cc??squared(ctx,v);
 const cc=prefix?.cc??(constant?ctx.intersect(freshCC,ctx.hull(constant.cc,constant.cc)):freshCC),dd=dot(ctx,u,w),ee=dot(ctx,v,w);
 const az=prefix?.az??ctx.compare(aa,zero,'==='),cz=prefix?.cz??ctx.compare(cc,zero,'===');
 if(az!=='false'&&cz!=='false')append('both-zero',zero,zero,true);
 if(az!=='false'&&cz!=='true')append('first-zero',zero,clamp(ctx,ctx.div(ee,positive(ctx,cc)),zero,one));
 if(az!=='true'&&cz!=='false')append('second-zero',clamp(ctx,ctx.div(ctx.neg(dd),positive(ctx,aa)),zero,one),zero);
 if(az!=='true'&&cz!=='true'){
  const actualAA=prefix?.actualAA??positive(ctx,aa),actualCC=prefix?.actualCC??positive(ctx,cc),denominator=prefix?.denominator??ctx.sub(ctx.mul(actualAA,actualCC),ctx.square(bb));
  const threshold=prefix?.threshold??ctx.mul(ctx.mul(ctx.point(Number.EPSILON),actualAA),actualCC),parallel=prefix?.parallel??ctx.compare(denominator,threshold,'>');
  const complete=(s:OriginalFloatBox,prefix:'parallel'|'nonparallel')=>{
   const t=ctx.div(ctx.add(ctx.mul(bb,s),ee),actualCC),low=ctx.compare(t,zero,'<');
   if(low!=='false')append(`${prefix}-low`,clamp(ctx,ctx.div(ctx.neg(dd),actualAA),zero,one),zero);
   if(low==='true')return;
   const high=ctx.compare(t,one,'>');
   if(high!=='false')append(`${prefix}-high`,clamp(ctx,ctx.div(ctx.sub(bb,dd),actualAA),zero,one),one);
   if(high!=='true')append(`${prefix}-interior`,s,ctx.intersect(t,ctx.box(0,1)));
  };
  if(parallel!=='false'){
   // A true source comparison implies a strictly positive binary64 divisor;
   // its lower bound may also use the nonnegative source threshold.
   const actualDenominator=prefix?.actualDenominator??(()=>{
    const lower=ctx.max(ctx.point(Number.MIN_VALUE),ctx.point(threshold.lo));
    return ctx.intersect(denominator,ctx.box(lower.lo,Number.MAX_VALUE));
   })();
   const s=clamp(ctx,ctx.div(ctx.sub(ctx.mul(bb,ee),ctx.mul(actualCC,dd)),actualDenominator),zero,one);
   complete(s,'nonparallel');
  }
  if(parallel!=='true')complete(zero,'parallel');
 }
 return finish();
}
