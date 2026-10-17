import {type OriginalAngularBody,validOriginalQuaternion} from './originalAngularBody';
import {captureOriginalAngularFixedMotion,evaluateOriginalAngularFixedMotion,planOriginalAngularFixedMotion,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS,type OriginalFixedMotionCapture,type OriginalFixedMotionExclusionOracle,type OriginalFixedMotionPose,type OriginalFixedMotionHit,type OriginalFixedMotionCellCertificate} from './originalAngularFixedMotion';
import {originalConvexTrianglePatch,type OriginalContactPatch} from './originalContactPatch';
import type {OriginalFixedTrianglePage,OriginalFixedTriangleRevision,OriginalSceneGeometry} from './originalSceneGeometry';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';

/** New aggregate detached-work caps; existing per-page and world budgets stay unchanged. */
export const ORIGINAL_ANGULAR_FIXED_SCENE_LIMITS=Object.freeze({pages:1024,triangles:32768,cells:4096,evaluations:2048,proofCharacters:1024,modelCharacters:1024});
export interface OriginalAngularFixedSceneInput {
  readonly query?:OriginalFixedMotionCapture['query'];
  readonly geometry:Pick<OriginalSceneGeometry,'fixedTrianglePage'>;
  readonly position:Vec3;readonly velocity:Vec3;readonly angular:OriginalAngularBody;
  readonly interval:number;readonly contactDistance:number;
  /** Pure active-scene epoch; construction identity does not cover live activation. */
  readonly activeSceneRevision:()=>unknown;
}
export interface OriginalAngularFixedSceneBudget {readonly pages?:number;readonly triangles?:number;readonly cells?:number;readonly evaluations?:number}
/** pages counts provider reads, including the final construction revalidation. */
export interface OriginalAngularFixedSceneStats {readonly pages:number;readonly triangles:number;readonly cells:number;readonly evaluations:number}
export interface OriginalAngularFixedScenePageReceipt {
  readonly offset:number;readonly nextOffset:number;readonly kind:'excluded'|'contact'|'unresolved';
  readonly excludedPrefixEnd:number;readonly certificates:readonly OriginalFixedMotionCellCertificate[];
}
type Scope='constructed-triangle-population-binary64-fractions';
export interface OriginalAngularFixedScenePatch {
  readonly witnessA:Readonly<Vec3>;readonly witnessB:Readonly<Vec3>;readonly area:number;
  readonly pairs:readonly {readonly witnessA:Readonly<Vec3>;readonly witnessB:Readonly<Vec3>}[];
}
interface Base {readonly stats:OriginalAngularFixedSceneStats;readonly receipts:readonly OriginalAngularFixedScenePageReceipt[];readonly scope:Scope}
export type OriginalAngularFixedSceneProposal=
  | (Base&{readonly kind:'unresolved';readonly reason:string})
  | (Base&{readonly kind:'excluded';readonly constructionRevision:OriginalFixedTriangleRevision;readonly activeRevision:unknown})
  | (Base&{readonly kind:'contact';readonly constructionRevision:OriginalFixedTriangleRevision;readonly activeRevision:unknown;
      readonly sourceIndex:number;readonly model:string;readonly pose:OriginalFixedMotionPose;readonly contact:OriginalFixedMotionHit;
      readonly patch:OriginalAngularFixedScenePatch|null;readonly earliestRepresentableFractionConditionalOnOracle:true});

function ordinary(value:object,keys:readonly string[]):void {
  if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Ordinary scene motion data required');
  for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!('value' in descriptor))throw Error('Scene motion accessors unsupported');}
}
function vector(value:Vec3):Readonly<Vec3> {
  ordinary(value,['x','y','z']);if(![value.x,value.y,value.z].every(Number.isFinite))throw Error('Nonfinite scene motion vector');
  return Object.freeze({x:value.x,y:value.y,z:value.z});
}
function array<T>(values:readonly T[],maximum:number):void {
  if(!Array.isArray(values)||Object.getPrototypeOf(values)!==Array.prototype||values.length>maximum||Object.getOwnPropertyDescriptor(values,Symbol.iterator))throw Error('Unsupported scene motion array');
  for(let index=0;index<values.length;index++){const descriptor=Object.getOwnPropertyDescriptor(values,index);if(!descriptor||!('value' in descriptor))throw Error('Sparse/accessor scene motion array');}
}
/** Explicit bounded snapshot precedes the first page/oracle callback. */
function snapshot(input:OriginalAngularFixedSceneInput) {
  ordinary(input,['position','velocity','angular','interval','contactDistance','geometry','activeSceneRevision']);
  const queryDescriptor=Object.getOwnPropertyDescriptor(input,'query');
  if(queryDescriptor&&!('value' in queryDescriptor))throw Error('Scene query accessors are unsupported');
  const query=queryDescriptor?.value===undefined?'stationary-wrapper':queryDescriptor.value;
  if(query!=='stationary-wrapper'&&query!=='scene-aabb-then-wrapper')throw Error('Unsupported scene motion query');
  const state=input.angular;ordinary(state,['orientation','angularVelocity','centerOfMass','inverseInertia','referenceConvex']);
  ordinary(state.orientation,['x','y','z','w']);ordinary(state.inverseInertia,['xx','yy','zz','xy','xz','yz']);
  const orientation=Object.freeze({x:state.orientation.x,y:state.orientation.y,z:state.orientation.z,w:state.orientation.w});
  if(!validOriginalQuaternion(orientation))throw Error('Invalid scene motion quaternion');
  const inverseInertia=Object.freeze({xx:state.inverseInertia.xx,yy:state.inverseInertia.yy,zz:state.inverseInertia.zz,xy:state.inverseInertia.xy,xz:state.inverseInertia.xz,yz:state.inverseInertia.yz});
  if(!Object.values(inverseInertia).every(Number.isFinite))throw Error('Nonfinite scene motion tensor');
  const shape=state.referenceConvex;ordinary(shape,['vertices','faceNormals','edgeDirections','faces']);
  array(shape.vertices,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.vertices);array(shape.faceNormals,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.vectors);array(shape.edgeDirections,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.vectors);
  if(!shape.faces)throw Error('Closed scene motion hull required');array(shape.faces,ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.faces);
  if(shape.vertices.length<4||shape.faces.length<4||!shape.faceNormals.length||!shape.edgeDirections.length)throw Error('Empty scene motion hull');
  const faces=shape.faces.map(face=>{array(face,3);if(face.length!==3||face.some(index=>!Number.isSafeInteger(index)||index<0||index>=shape.vertices.length))throw Error('Invalid scene motion face');return Object.freeze([face[0],face[1],face[2]] as const);});
  const referenceConvex:OriginalConvexPolytope=Object.freeze({vertices:Object.freeze(shape.vertices.map(vector)),faceNormals:Object.freeze(shape.faceNormals.map(vector)),edgeDirections:Object.freeze(shape.edgeDirections.map(vector)),faces:Object.freeze(faces)});
  const angular:OriginalAngularBody=Object.freeze({orientation,angularVelocity:vector(state.angularVelocity),centerOfMass:vector(state.centerOfMass),inverseInertia,referenceConvex});
  if(!Number.isFinite(input.interval)||input.interval<0||!Number.isFinite(input.contactDistance)||input.contactDistance<0)throw Error('Invalid scene motion interval/skin');
  return Object.freeze({query,position:vector(input.position),velocity:vector(input.velocity),angular,interval:input.interval,contactDistance:input.contactDistance});
}
function prefix(certificates:readonly OriginalFixedMotionCellCertificate[]):number {
  let end=0;
  for(const receipt of certificates){
    const cell=receipt.cell;
    if(cell.lo!==end||!Number.isFinite(cell.hi)||cell.hi<=cell.lo||cell.hi>1||cell.upperInclusive&&cell.hi!==1||typeof receipt.proof!=='string'||!receipt.proof.trim()||receipt.proof.length>ORIGINAL_ANGULAR_FIXED_SCENE_LIMITS.proofCharacters)throw Error('Invalid contiguous scene exclusion prefix');
    end=cell.hi;
  }
  return end;
}
function pageEntries(page:OriginalFixedTrianglePage,offset:number,total:number):void {
  ordinary(page,['revision','offset','nextOffset','total','complete','triangles']);array(page.triangles,32);
  if(!Object.isFrozen(page)||!Object.isFrozen(page.triangles)||page.offset!==offset||page.total!==total||page.triangles.length!==Math.min(32,total-offset)||page.nextOffset!==offset+page.triangles.length||page.complete!==(page.nextOffset===total))throw Error('Invalid contiguous fixed scene page');
  for(let index=0;index<page.triangles.length;index++){
    const entry=page.triangles[index];ordinary(entry,['id','sourceIndex','model','triangle']);array(entry.triangle,3);
    if(!Object.isFrozen(entry)||!Object.isFrozen(entry.triangle)||entry.triangle.length!==3||entry.sourceIndex!==offset+index||entry.id!==`fixed-triangle:${entry.sourceIndex}`||typeof entry.model!=='string')throw Error('Invalid fixed scene triangle identity');
    if(entry.model.length>ORIGINAL_ANGULAR_FIXED_SCENE_LIMITS.modelCharacters)throw Error('scene-model-metadata-cap');
    for(const point of entry.triangle){vector(point);if(!Object.isFrozen(point))throw Error('Mutable fixed scene triangle');}
  }
}
function frozenPatch(patch:OriginalContactPatch|null):OriginalAngularFixedScenePatch|null {
  if(!patch)return null;
  if(!Number.isFinite(patch.area)||patch.area<=0||patch.pairs.length>ORIGINAL_ANGULAR_FIXED_PLANNER_LIMITS.vertices+3)throw Error('Invalid fresh scene patch');
  const pairs=patch.pairs.map(pair=>Object.freeze({witnessA:vector(pair.witnessA),witnessB:vector(pair.witnessB)}));
  return Object.freeze({witnessA:vector(patch.witnessA),witnessB:vector(patch.witnessB),area:patch.area,pairs:Object.freeze(pairs)});
}

/** Pure bounded callbacks are required: synchronous JS cannot preempt a blocking
 * provider/oracle. Every constructed page is considered, without spatial pruning.
 * A cap-limited page may be ignored only with a checked prefix strictly beyond
 * the selected fraction. Equality conservatively remains unresolved. This is a
 * detached proposal, not active-door/all-layer/native CCD or a live state commit.
 */
export function planOriginalAngularFixedScene(input:OriginalAngularFixedSceneInput,exclude:OriginalFixedMotionExclusionOracle,
  limits:OriginalAngularFixedSceneBudget={}):OriginalAngularFixedSceneProposal {
  const budget={pages:limits.pages??1024,triangles:limits.triangles??32768,cells:limits.cells??4096,evaluations:limits.evaluations??2048};
  for(const key of ['pages','triangles','cells','evaluations'] as const)if(!Number.isSafeInteger(budget[key])||budget[key]<1||budget[key]>ORIGINAL_ANGULAR_FIXED_SCENE_LIMITS[key])throw Error('Scene aggregate caps may only be lowered');
  let pages=0,triangles=0,cells=0,evaluations=0;
  let callbackFailure=false;
  const receipts:OriginalAngularFixedScenePageReceipt[]=[];
  const base=()=>({stats:Object.freeze({pages,triangles,cells,evaluations}),receipts:Object.freeze([...receipts]),scope:'constructed-triangle-population-binary64-fractions' as Scope});
  const unresolved=(reason:string):OriginalAngularFixedSceneProposal=>Object.freeze({...base(),kind:'unresolved',reason});
  try {
    ordinary(input,['position','velocity','angular','interval','contactDistance','geometry','activeSceneRevision']);
    if(typeof input.activeSceneRevision!=='function'||typeof exclude!=='function')throw Error('Explicit active revision and exclusion oracle required');
    const active=input.activeSceneRevision,geometry=input.geometry,readPage=geometry.fixedTrianglePage.bind(geometry);
    const readActive=()=>{try{return active();}catch(error){callbackFailure=true;throw error;}};
    const incoming=snapshot(input),epoch=readActive();
    const current=()=>{if(!Object.is(readActive(),epoch))throw Error('Stale active scene revision');};current();
    let offset=0,total:number|undefined,revision:OriginalFixedTriangleRevision|undefined;
    let best:{motion:OriginalFixedMotionCapture;page:OriginalFixedTrianglePage;fraction:number;sourceIndex:number;model:string;contact:OriginalFixedMotionHit}|undefined;
    let unknownPrefix=Infinity;
    while(total===undefined||offset<total){
      current();if(pages>=budget.pages)return unresolved('scene-page-cap');
      const page=readPage(offset,32);pages++;current();
      ordinary(page,['revision','offset','nextOffset','total','complete','triangles']);
      if(!Number.isSafeInteger(page.total)||page.total<1||page.total>budget.triangles)throw Error('scene-triangle-cap');
      if(total===undefined){total=page.total;revision=page.revision;}
      ordinary(revision!,['scope']);
      if(page.revision!==revision||!Object.isFrozen(revision)||revision.scope!=='immutable-construction-subset')throw Error('Invalid construction scene revision');
      pageEntries(page,offset,total);
      triangles+=page.triangles.length;
      if(cells>=budget.cells||evaluations>=budget.evaluations-1)return unresolved('scene-aggregate-planner-cap');
      const motion=captureOriginalAngularFixedMotion({...incoming,triangles:page.triangles,sceneRevision:readActive});current();
      const guardedOracle:OriginalFixedMotionExclusionOracle=(captured,cell)=>{
        try {
          current();const answer=exclude(captured,cell);current();
          if(answer.kind==='excluded'&&(typeof answer.proof!=='string'||answer.proof.length>ORIGINAL_ANGULAR_FIXED_SCENE_LIMITS.proofCharacters))throw Error('Invalid bounded scene oracle receipt');
          return answer;
        }catch(error){callbackFailure=true;throw error;}
      };
      const plan=planOriginalAngularFixedMotion(motion,guardedOracle,{cells:Math.min(128,budget.cells-cells),evaluations:Math.min(64,budget.evaluations-evaluations-1)});current();
      cells+=plan.stats.cells;evaluations+=plan.stats.evaluations;
      if(callbackFailure)return unresolved('scene-callback-failure');
      const end=prefix(plan.certificates);
      receipts.push(Object.freeze({offset,nextOffset:page.nextOffset,kind:plan.kind,excludedPrefixEnd:end,certificates:plan.certificates}));
      if(plan.kind==='excluded'){
        if(end!==1||!plan.certificates.at(-1)?.cell.upperInclusive)throw Error('Incomplete whole-page exclusion');
      }else if(plan.kind==='unresolved'){
        if(!['cell-cap','point-evaluation-cap'].includes(plan.reason))return unresolved(plan.reason);
        if(end!==plan.cell.lo)throw Error('Invalid unresolved page prefix');unknownPrefix=Math.min(unknownPrefix,end);
      }else{
        if(end!==plan.pose.fraction)throw Error('Invalid page contact prefix');
        const entry=page.triangles[plan.contact.triangleIndex];
        if(!entry||entry.id!==plan.contact.triangleId)throw Error('Invalid page contact identity');
        if(!best||plan.pose.fraction<best.fraction)best={motion,page,fraction:plan.pose.fraction,sourceIndex:entry.sourceIndex,model:entry.model,contact:plan.contact};
      }
      offset=page.nextOffset;
    }
    current();if(!revision||total===undefined||triangles!==total)throw Error('Incomplete constructed scene population');
    const revalidateConstruction=(saved?:OriginalFixedTrianglePage)=>{
      if(pages>=budget.pages)throw Error('scene-final-page-read-cap');
      const fresh=readPage(saved?.offset??0,32);pages++;current();
      if(fresh.revision!==revision||fresh.total!==total||fresh.offset!==(saved?.offset??0))throw Error('Stale construction scene revision');
      pageEntries(fresh,saved?.offset??0,total!);
      if(saved)for(let index=0;index<saved.triangles.length;index++){
        const a=saved.triangles[index],b=fresh.triangles[index];
        if(a.id!==b.id||a.model!==b.model||a.sourceIndex!==b.sourceIndex||a.triangle.some((point,corner)=>['x','y','z'].some(axis=>!Object.is(point[axis as keyof Vec3],b.triangle[corner][axis as keyof Vec3]))))throw Error('Changed construction scene triangles');
      }
    };
    if(!best){if(unknownPrefix!==Infinity)return unresolved('unresolved-competing-page');revalidateConstruction();return Object.freeze({...base(),kind:'excluded',constructionRevision:revision,activeRevision:epoch});}
    if(unknownPrefix<=best.fraction)return unresolved('unresolved-earlier-competing-page');
    if(evaluations>=budget.evaluations)return unresolved('scene-selected-evaluation-cap');
    evaluations++;const fresh=evaluateOriginalAngularFixedMotion(best.motion,best.fraction);current();
    if(!fresh.contact||fresh.contact.triangleId!==best.contact.triangleId||fresh.contact.triangleIndex!==best.contact.triangleIndex)throw Error('Fresh scene winner changed');
    const entry=best.motion.triangles[fresh.contact.triangleIndex];
    const patch=frozenPatch(originalConvexTrianglePatch(fresh.pose.convex,fresh.pose.position,entry.triangle,fresh.contact.hit.normal));current();revalidateConstruction(best.page);current();
    return Object.freeze({...base(),kind:'contact',constructionRevision:revision,activeRevision:epoch,sourceIndex:best.sourceIndex,model:best.model,pose:fresh.pose,contact:fresh.contact,patch,earliestRepresentableFractionConditionalOnOracle:true as const});
  }catch(error){return unresolved(callbackFailure?'scene-callback-failure':error instanceof Error?error.message:'scene-proposal-failure');}
}
