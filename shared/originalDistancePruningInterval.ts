import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox,type OriginalFloatTruth} from './originalFloatInterval';
import type {OriginalFloatVectorBox} from './originalFiniteFeatureInterval';

export interface OriginalDistanceSourceBounds {
 readonly minX:OriginalFloatBox;readonly maxX:OriginalFloatBox;
 readonly minY:OriginalFloatBox;readonly maxY:OriginalFloatBox;
 readonly minZ:OriginalFloatBox;readonly maxZ:OriginalFloatBox;
}
type B=OriginalFloatBox;type V=OriginalFloatVectorBox;
function ordinary(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-distance-bound-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('distance-bound-accessors-unsupported');}
}
function vector(ctx:OriginalFloatIntervalContext,v:V):V {ordinary(v,['x','y','z']);return ctx.vector3(v.x,v.y,v.z);}
function bounds(ctx:OriginalFloatIntervalContext,b:OriginalDistanceSourceBounds):OriginalDistanceSourceBounds {
 ordinary(b,['minX','maxX','minY','maxY','minZ','maxZ']);
 return ctx.bounds6(b.minX,b.maxX,b.minY,b.maxY,b.minZ,b.maxZ);
}
function squared(ctx:OriginalFloatIntervalContext,v:V):B {return ctx.squared3(v.x,v.y,v.z);}
/** Source roundoff padding, not a geometric error bound or distance result. */
export function encloseOriginalDistancePadding(ctx:OriginalFloatIntervalContext,coordinateSquaredA:B,coordinateSquaredB:B,offsetInput:V):B {
 const a=ctx.hull(coordinateSquaredA,coordinateSquaredA),b=ctx.hull(coordinateSquaredB,coordinateSquaredB),offset=vector(ctx,offsetInput);
 const factor=ctx.mul(ctx.point(64),ctx.point(Number.EPSILON));
 const maximum=ctx.max(ctx.max(ctx.max(ctx.point(1),a),b),squared(ctx,offset));
 return ctx.mul(factor,maximum);
}
/** The actual source pointBound arithmetic for SAME captured source bounds. */
export function encloseOriginalPointBound(ctx:OriginalFloatIntervalContext,pointInput:V,boundsInput:OriginalDistanceSourceBounds):B {
 const p=vector(ctx,pointInput),b=bounds(ctx,boundsInput),zero=ctx.point(0);
 const x=ctx.max(ctx.max(zero,ctx.sub(b.minX,p.x)),ctx.sub(p.x,b.maxX));
 const y=ctx.max(ctx.max(zero,ctx.sub(b.minY,p.y)),ctx.sub(p.y,b.maxY));
 const z=ctx.max(ctx.max(zero,ctx.sub(b.minZ,p.z)),ctx.sub(p.z,b.maxZ));
 return squared(ctx,Object.freeze({x,y,z}));
}
/** Preserve (first.min+offset)-last.max and (last.min-first.max)-offset. */
export function encloseOriginalEdgeBound(ctx:OriginalFloatIntervalContext,firstInput:OriginalDistanceSourceBounds,lastInput:OriginalDistanceSourceBounds,offsetInput:V):B {
 const first=bounds(ctx,firstInput),last=bounds(ctx,lastInput),offset=vector(ctx,offsetInput),zero=ctx.point(0);
 const x=ctx.max(ctx.max(zero,ctx.sub(ctx.add(first.minX,offset.x),last.maxX)),ctx.sub(ctx.sub(last.minX,first.maxX),offset.x));
 const y=ctx.max(ctx.max(zero,ctx.sub(ctx.add(first.minY,offset.y),last.maxY)),ctx.sub(ctx.sub(last.minY,first.maxY),offset.y));
 const z=ctx.max(ctx.max(zero,ctx.sub(ctx.add(first.minZ,offset.z),last.maxZ)),ctx.sub(ctx.sub(last.minZ,first.maxZ),offset.z));
 return squared(ctx,Object.freeze({x,y,z}));
}
/** null denotes ONLY the actual initial best=+Infinity source state. Finite
 * best is a caller-certified box for that same source running minimum. */
export function encloseOriginalPruningDecision(ctx:OriginalFloatIntervalContext,boundInput:B,bestInput:B|null,paddingInput:B,kind:'forward'|'reverse'|'edge') {
 if(kind!=='forward'&&kind!=='reverse'&&kind!=='edge')throw new UnsupportedFloatInterval('unknown-source-pruning-kind');
 const bound=ctx.hull(boundInput,boundInput),padding=ctx.hull(paddingInput,paddingInput);
 let sourceGuard:OriginalFloatTruth;
 if(bestInput===null)sourceGuard=kind==='reverse'?'false':'true';
 else {
  const best=ctx.hull(bestInput,bestInput),threshold=ctx.add(best,padding);
  sourceGuard=ctx.compare(bound,threshold,kind==='reverse'?'>':'<=');
 }
 const action=sourceGuard==='unknown'?'unresolved':kind==='reverse'?(sourceGuard==='true'?'skip':'evaluate'):(sourceGuard==='true'?'evaluate':'skip');
 return Object.freeze({kind,sourceGuard,action,mustRetainCandidate:action!=='skip',initialInfinityBest:bestInput===null,
  conditionalSourceBounds:true as const,candidateDistanceCertified:false as const,globalBestCertified:false as const,
  wrapperExclusionCertified:false as const,nativeEquivalent:false as const,defaultIntegration:false as const});
}
