import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox,type OriginalFloatTruth} from './originalFloatInterval';
import {encloseOriginalClosestTriangle,encloseOriginalClosestSegments,type OriginalFloatVectorBox,type OriginalFloatTriangleEdges,type OriginalFloatSegmentVector} from './originalFiniteFeatureInterval';
import {encloseOriginalDistancePadding,encloseOriginalPointBound,encloseOriginalEdgeBound,encloseOriginalPruningDecision,type OriginalDistanceSourceBounds} from './originalDistancePruningInterval';

export interface OriginalSeparatedDistanceSourceProfile {
 readonly tag:string;readonly arithmetic:'separate-rn-binary64-gradual-underflow';readonly sqrt:'correctly-rounded-source-Math.sqrt';readonly cache:'ordinary-immutable-equivalent-source-caches';
}
export interface OriginalSeparatedFeaturesIntervals {
 readonly vertices:readonly OriginalFloatVectorBox[];readonly triangles:readonly (readonly [OriginalFloatVectorBox,OriginalFloatVectorBox,OriginalFloatVectorBox])[];
 readonly edges:readonly (readonly [OriginalFloatVectorBox,OriginalFloatVectorBox])[];readonly vertexBounds:OriginalDistanceSourceBounds;
 readonly triangleBounds:readonly OriginalDistanceSourceBounds[];readonly edgeBounds:readonly OriginalDistanceSourceBounds[];readonly coordinateSquared:OriginalFloatBox;
 readonly triangleEdges?:readonly OriginalFloatTriangleEdges[];readonly segmentVectors?:readonly OriginalFloatSegmentVector[];
 readonly membership?:readonly ('always'|'never'|'maybe')[];readonly vertexSourceIndices?:readonly number[];readonly vertexMembership?:readonly ('always'|'never'|'maybe')[];
}
export const ORIGINAL_SEPARATED_DISTANCE_INTERVAL_LIMITS=Object.freeze({vertices:512,triangles:1024,edges:1536,featurePairs:1024,winnerSlots:1024});
export interface OriginalSeparatedDistanceIntervalLimits {readonly vertices?:number;readonly triangles?:number;readonly edges?:number;readonly featurePairs?:number;readonly winnerSlots?:number}
type B=OriginalFloatBox;type V=OriginalFloatVectorBox;type T=readonly [V,V,V];type E=readonly [V,V];
type Membership='always'|'never'|'maybe';
function ordinary(value:object,keys:readonly string[]):void {
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new UnsupportedFloatInterval('ordinary-separated-distance-data-required');
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw new UnsupportedFloatInterval('separated-distance-accessors-unsupported');}
}
function optional(value:object,key:string):unknown {
 const d=Object.getOwnPropertyDescriptor(value,key);if(!d)return undefined;if(!('value' in d))throw new UnsupportedFloatInterval('separated-distance-accessors-unsupported');return d.value;
}
function dense(value:readonly unknown[],minimum:number,maximum:number):void {
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<minimum||value.length>maximum)throw new UnsupportedFloatInterval('bounded-separated-distance-array-required');
 for(const key of [Symbol.iterator,'map','filter','every','some','flat'] as const)if(Object.getOwnPropertyDescriptor(value,key))throw new UnsupportedFloatInterval('standard-separated-distance-array-required');
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,i);if(!d||!('value' in d))throw new UnsupportedFloatInterval('dense-separated-distance-array-required');}
}
const add=(c:OriginalFloatIntervalContext,a:V,b:V):V=>Object.freeze({x:c.add(a.x,b.x),y:c.add(a.y,b.y),z:c.add(a.z,b.z)});
const sub=(c:OriginalFloatIntervalContext,a:V,b:V):V=>Object.freeze({x:c.sub(a.x,b.x),y:c.sub(a.y,b.y),z:c.sub(a.z,b.z)});
const mul=(c:OriginalFloatIntervalContext,a:V,s:B):V=>Object.freeze({x:c.mul(a.x,s),y:c.mul(a.y,s),z:c.mul(a.z,s)});
const union=(c:OriginalFloatIntervalContext,a:V,b:V):V=>Object.freeze({x:c.hull(a.x,b.x),y:c.hull(a.y,b.y),z:c.hull(a.z,b.z)});
const squared=(c:OriginalFloatIntervalContext,a:V)=>c.squared3(a.x,a.y,a.z);

/** Full three-loop separatedDistance source leaf, followed by the two initial
 * stationary advance predicates. SAT/outer wrapper guards remain external. */
export function createOriginalSeparatedDistanceWorkspace(ctx:OriginalFloatIntervalContext,aInput:OriginalSeparatedFeaturesIntervals,
 profile:OriginalSeparatedDistanceSourceProfile,limits:OriginalSeparatedDistanceIntervalLimits={}) {
 if(!profile||Object.getPrototypeOf(profile)!==Object.prototype||!Object.isFrozen(profile))throw new UnsupportedFloatInterval('explicit-frozen-separated-distance-profile-required');
 ordinary(profile,['tag','arithmetic','sqrt','cache']);
 if(typeof profile.tag!=='string'||!profile.tag||profile.tag.length>1024||profile.arithmetic!=='separate-rn-binary64-gradual-underflow'||profile.sqrt!=='correctly-rounded-source-Math.sqrt'||profile.cache!=='ordinary-immutable-equivalent-source-caches')throw new UnsupportedFloatInterval('unsupported-separated-distance-profile');
 ordinary(limits,[]);const maximum:{vertices:number;triangles:number;edges:number;featurePairs:number;winnerSlots:number}={...ORIGINAL_SEPARATED_DISTANCE_INTERVAL_LIMITS};
 for(const key of ['vertices','triangles','edges','featurePairs','winnerSlots'] as const){const d=Object.getOwnPropertyDescriptor(limits,key);if(d){if(!('value' in d))throw new UnsupportedFloatInterval('separated-distance-limit-accessors-unsupported');maximum[key]=d.value;}
  if(!Number.isSafeInteger(maximum[key])||maximum[key]<1||maximum[key]>ORIGINAL_SEPARATED_DISTANCE_INTERVAL_LIMITS[key])throw new UnsupportedFloatInterval('separated-distance-caps-may-only-be-lowered');}
 const savedProfile=Object.freeze({tag:profile.tag,arithmetic:profile.arithmetic,sqrt:profile.sqrt,cache:profile.cache});
 let vectors=new WeakMap<object,V>();
 const vector=(v:V):V=>{ordinary(v,['x','y','z']);const existing=vectors.get(v);if(existing)return existing;
  const result=ctx.vector3(v.x,v.y,v.z);vectors.set(v,result);return result;};
 const bounds=(b:OriginalDistanceSourceBounds):OriginalDistanceSourceBounds=>{ordinary(b,['minX','maxX','minY','maxY','minZ','maxZ']);return ctx.bounds6(b.minX,b.maxX,b.minY,b.maxY,b.minZ,b.maxZ);};
 const capture=(input:OriginalSeparatedFeaturesIntervals)=>{
  ordinary(input,['vertices','triangles','edges','vertexBounds','triangleBounds','edgeBounds','coordinateSquared']);
  dense(input.vertices,1,maximum.vertices);dense(input.triangles,1,maximum.triangles);dense(input.edges,1,maximum.edges);
  dense(input.triangleBounds,input.triangles.length,input.triangles.length);dense(input.edgeBounds,input.edges.length,input.edges.length);
  const vertices=Object.freeze(input.vertices.map(vector)),triangles:T[]=[],edges:E[]=[];
  for(const t of input.triangles){dense(t,3,3);triangles.push(Object.freeze([vector(t[0]),vector(t[1]),vector(t[2])] as const));}
  for(const e of input.edges){dense(e,2,2);edges.push(Object.freeze([vector(e[0]),vector(e[1])] as const));}
  let membership:Membership[]=vertices.map(()=>'always');
  const aligned=optional(input,'vertexMembership') as readonly Membership[]|undefined,original=optional(input,'membership') as readonly Membership[]|undefined,indices=optional(input,'vertexSourceIndices') as readonly number[]|undefined;
  if(aligned){dense(aligned,vertices.length,vertices.length);membership=[...aligned];}
  else if(original||indices){if(!original||!indices)throw new UnsupportedFloatInterval('paired-feature-membership-indices-required');dense(original,1,maximum.vertices);dense(indices,vertices.length,vertices.length);
   membership=indices.map(index=>{if(!Number.isSafeInteger(index)||index<0||index>=original.length)throw new UnsupportedFloatInterval('invalid-feature-membership-index');return original[index];});}
  if(!membership.every(v=>v==='always'||v==='never'||v==='maybe')||!membership.includes('always'))throw new UnsupportedFloatInterval('guaranteed-nonempty-source-candidates-required');
  const rawTriangleEdges=optional(input,'triangleEdges') as readonly OriginalFloatTriangleEdges[]|undefined,rawSegments=optional(input,'segmentVectors') as readonly OriginalFloatSegmentVector[]|undefined;
  let triangleEdges:readonly OriginalFloatTriangleEdges[]|undefined,segmentVectors:readonly OriginalFloatSegmentVector[]|undefined;
  if(rawTriangleEdges){dense(rawTriangleEdges,triangles.length,triangles.length);triangleEdges=Object.freeze(rawTriangleEdges.map(e=>{ordinary(e,['ab','ac','bc']);return Object.freeze({ab:vector(e.ab),ac:vector(e.ac),bc:vector(e.bc)});}));}
  if(rawSegments){dense(rawSegments,edges.length,edges.length);segmentVectors=Object.freeze(rawSegments.map(e=>{ordinary(e,['v','cc']);return Object.freeze({v:vector(e.v),cc:ctx.hull(e.cc,e.cc)});}));}
  return Object.freeze({vertices,triangles:Object.freeze(triangles),edges:Object.freeze(edges),vertexBounds:bounds(input.vertexBounds),triangleBounds:Object.freeze(input.triangleBounds.map(bounds)),edgeBounds:Object.freeze(input.edgeBounds.map(bounds)),
   coordinateSquared:ctx.hull(input.coordinateSquared,input.coordinateSquared),membership:Object.freeze(membership),triangleEdges,segmentVectors});
 };
 const a=capture(aInput);
 // Reserve one retained private hull slot in the context-wide combined bound.
 // The slot is bookkeeping only; it cannot validate a caller-supplied graph.
 ctx.reserveSeparatedHullCapture(a.coordinateSquared);
 // ONE bounded privately captured immutable graph. No lookup/result history;
 // each invocation discards its temporary B capture map before returning.
 vectors=new WeakMap<object,V>();let busy=false;
 const encloseTriangle=(bInput:OriginalSeparatedFeaturesIntervals,offsetInput:V,contactDistance:number)=>{
  if(busy)throw new UnsupportedFloatInterval('separated-distance-workspace-reentry');busy=true;
  try{
   if(!Number.isFinite(contactDistance)||contactDistance<0)throw new UnsupportedFloatInterval('nonnegative-finite-contact-distance-required');
   // Ownership of a privately retained anchor is rechecked and charged. This
   // is not an attestation of runtime cache identity or native equivalence.
   ctx.hull(a.coordinateSquared,a.coordinateSquared);
   vectors=new WeakMap<object,V>();
   const b=capture(bInput),offset=vector(offsetInput),zero=ctx.point(0),one=ctx.point(1),EPS=ctx.point(1e-12);
 const padding=encloseOriginalDistancePadding(ctx,a.coordinateSquared,b.coordinateSquared,offset);
 interface Winner {id:number;squared:B;delta:V;first:V;second:V}
 let best:B|undefined,mayInfinity=true,winners:Winner[]=[],featurePairs=0,candidateCalls=0,unknownPruning=0,unknownUpdates=0;
 const checkPair=()=>{if(featurePairs>=maximum.featurePairs)throw new UnsupportedFloatInterval('separated-distance-feature-pair-cap');featurePairs++;};
 const reach=(bound:B,kind:'forward'|'reverse'|'edge',parentAlways:boolean):{possible:boolean;always:boolean}=>{
  const decision=encloseOriginalPruningDecision(ctx,bound,best??null,padding,kind);if(decision.action==='unresolved')unknownPruning++;
  // Initial Infinity is an additional branch when a finite optional best exists.
  return {possible:mayInfinity||decision.action!=='skip',always:parentAlways&&(best===undefined||decision.action==='evaluate')};
 };
 const candidate=(first:V,second:V,alwaysExecuted:boolean,initialGuaranteed:boolean)=>{
  candidateCalls++;const delta=sub(ctx,first,second),value=squared(ctx,delta),old=best,hadInfinity=mayInfinity;
  const comparison:OriginalFloatTruth=old?ctx.compare(value,old,'<'):'true';if(comparison==='unknown')unknownUpdates++;
  // Equality never replaces an earlier source winner. Unknown/optional reach
  // retains old tuples; only a universally reached strict update erases them.
  if(alwaysExecuted&&comparison==='true')winners=[];
  if(comparison!=='false'||hadInfinity){if(winners.length>=maximum.winnerSlots)throw new UnsupportedFloatInterval('separated-distance-winner-slot-cap');winners.push({id:candidateCalls,squared:value,delta,first,second});}
  if(old){const updated=ctx.min(old,value);best=alwaysExecuted?updated:ctx.hull(old,updated);if(hadInfinity)best=ctx.hull(best,value);}
  else best=value;
  if(initialGuaranteed)mayInfinity=false;
 };
 // Three complete source loops in original order; optional filter membership
 // affects vertices only, never mandatory triangles/Map edges.
 for(let v=0;v<a.vertices.length;v++){
  if(a.membership[v]==='never')continue;const mandatory=a.membership[v]==='always',point=add(ctx,a.vertices[v],offset);
  for(let i=0;i<b.triangles.length;i++){checkPair();const r=reach(encloseOriginalPointBound(ctx,point,b.triangleBounds[i]),'forward',mandatory);
   if(r.possible)candidate(point,encloseOriginalClosestTriangle(ctx,point,b.triangles[i],b.triangleEdges?.[i]).witness,r.always,mandatory&&mayInfinity);
  }
 }
 for(let v=0;v<b.vertices.length;v++){
  if(b.membership[v]==='never')continue;const mandatory=b.membership[v]==='always',point=sub(ctx,b.vertices[v],offset),outer=reach(encloseOriginalPointBound(ctx,point,a.vertexBounds),'reverse',mandatory);
  if(!outer.possible)continue;
  for(let i=0;i<a.triangles.length;i++){checkPair();const r=reach(encloseOriginalPointBound(ctx,point,a.triangleBounds[i]),'forward',outer.always);
   if(r.possible)candidate(add(ctx,encloseOriginalClosestTriangle(ctx,point,a.triangles[i],a.triangleEdges?.[i]).witness,offset),b.vertices[v],r.always,false);
  }
 }
 for(let i=0;i<a.edges.length;i++){
  const first=add(ctx,a.edges[i][0],offset),last=add(ctx,a.edges[i][1],offset);
  // The SAME actual offset translates both endpoints before source u=last-first.
  // Retain both endpoint-add rounding errors; an untranslated cached edge is
  // not the source displacement. Refine the fresh witness difference only.
  const firstSourceU=Object.freeze({x:ctx.translatedSub(a.edges[i][1].x,a.edges[i][0].x,offset.x),
   y:ctx.translatedSub(a.edges[i][1].y,a.edges[i][0].y,offset.y),z:ctx.translatedSub(a.edges[i][1].z,a.edges[i][0].z,offset.z)});
  for(let j=0;j<b.edges.length;j++){checkPair();const r=reach(encloseOriginalEdgeBound(ctx,a.edgeBounds[i],b.edgeBounds[j],offset),'edge',true);
   if(r.possible){const pair=encloseOriginalClosestSegments(ctx,first,last,b.edges[j][0],b.edges[j][1],b.segmentVectors?.[j],firstSourceU);candidate(pair.first,pair.second,r.always,false);}
  }
 }
 if(mayInfinity||!best||!winners.length)throw new UnsupportedFloatInterval('unresolved-initial-Infinity-best');
 const distance=ctx.sqrtReal(best),zeroVector:V=Object.freeze({x:zero,y:zero,z:zero}),bestPositive=ctx.compare(best,zero,'>'),bestZero=ctx.compare(best,zero,'===');
 let normal:V|undefined=bestPositive!=='true'?zeroVector:undefined,firstWitness:V|undefined,secondWitness:V|undefined;const possibleWinnerIds:number[]=[];
 for(const winner of winners){
  if(ctx.compare(winner.squared,best,'<')==='true'||ctx.compare(winner.squared,best,'>')==='true')continue;const sameBest=ctx.intersect(winner.squared,best);possibleWinnerIds.push(winner.id);
  if(ctx.compare(sameBest,zero,'>')!=='false'){
   // A possible actual winner has squared===actual best. When best is
   // universally positive, distance encloses the SAME source root used by
   // production for its normal. Mixed zero/positive best still needs a
   // positive binary64 >=MIN_VALUE domain for the conditional normal arm.
   const length=bestPositive==='true'?distance:ctx.sqrtReal(ctx.intersect(sameBest,ctx.box(Number.MIN_VALUE,Number.MAX_VALUE)));
   const value=mul(ctx,winner.delta,ctx.div(one,length));normal=normal?union(ctx,normal,value):value;
   firstWitness=firstWitness?union(ctx,firstWitness,winner.first):winner.first;secondWitness=secondWitness?union(ctx,secondWitness,winner.second):winner.second;
  }
 }
 if(!normal||!possibleWinnerIds.length)throw new UnsupportedFloatInterval('unresolved-source-winner-normal');
 const tolerance=ctx.point(contactDistance),directThreshold=ctx.compare(distance,ctx.add(tolerance,EPS),'<='),gap=ctx.sub(distance,tolerance),gapThreshold=ctx.compare(gap,EPS,'<=');
 // SAME actual stationary relative0 and finite normal => source closing0.
 const stationaryAdvanceNullCertified=directThreshold==='false'&&gapThreshold==='false';
 return Object.freeze({best,distance,normal,witnessA:firstWitness,witnessB:secondWitness,witnessPresence:bestZero==='true'?'never':bestPositive==='true'?'always':'maybe',padding,
  directThreshold,gap,gapThreshold,stationaryAdvanceNullCertified,featurePairs,candidateCalls,unknownPruning,unknownUpdates,possibleWinnerIds:Object.freeze(possibleWinnerIds),
  profile:savedProfile,separatedDistanceEnclosed:true as const,strictSourceTieOrderRetained:true as const,sourceProfileAttested:false as const,
  SATNullRequiredExternally:true as const,outerTriangleGuardRequiredExternally:true as const,sourcePreparationRequiredExternally:true as const,
  fullWrapperCertified:false as const,movingAdvanceCertified:false as const,nativeEquivalent:false as const,defaultIntegration:false as const});
  }finally{vectors=new WeakMap<object,V>();busy=false;}
 };
 return Object.freeze({encloseTriangle,metadata:Object.freeze({sameContextAndCapturedHullRequired:true as const,
  privateValidatedHullReuse:true as const,callerPreparedDataAccepted:false as const,retainedHullGraphs:1 as const,
  resultMemoization:false as const,budgetReset:false as const,sourceCacheAttested:false as const,nativeEquivalent:false as const,defaultIntegration:false as const})});
}
/** Fresh-workspace compatibility entry point. Profile and tolerance checks
 * still precede hull capture, as in the original public leaf. */
export function encloseOriginalSeparatedDistance(ctx:OriginalFloatIntervalContext,aInput:OriginalSeparatedFeaturesIntervals,bInput:OriginalSeparatedFeaturesIntervals,offsetInput:V,
 contactDistance:number,profile:OriginalSeparatedDistanceSourceProfile,limits:OriginalSeparatedDistanceIntervalLimits={}) {
 if(!profile||Object.getPrototypeOf(profile)!==Object.prototype||!Object.isFrozen(profile))throw new UnsupportedFloatInterval('explicit-frozen-separated-distance-profile-required');
 ordinary(profile,['tag','arithmetic','sqrt','cache']);
 if(typeof profile.tag!=='string'||!profile.tag||profile.tag.length>1024||profile.arithmetic!=='separate-rn-binary64-gradual-underflow'||profile.sqrt!=='correctly-rounded-source-Math.sqrt'||profile.cache!=='ordinary-immutable-equivalent-source-caches')throw new UnsupportedFloatInterval('unsupported-separated-distance-profile');
 if(!Number.isFinite(contactDistance)||contactDistance<0)throw new UnsupportedFloatInterval('nonnegative-finite-contact-distance-required');
 return createOriginalSeparatedDistanceWorkspace(ctx,aInput,profile,limits).encloseTriangle(bInput,offsetInput,contactDistance);
}
