import {expect,it,vi} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import * as poseModule from './originalAngularPoseInterval';
import * as geometryModule from './originalAngularGeometryInterval';
import * as preparationModule from './originalFeaturePreparationInterval';
import * as distanceModule from './originalSeparatedDistanceInterval';
import * as satModule from './originalStationarySatInterval';
import {createOriginalAngularFixedIntervalOracle} from './originalAngularFixedIntervalOracle';
import {captureOriginalAngularFixedMotion} from './originalAngularFixedMotion';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';

// Read-only stage instrumentation delegates to the actual producer bodies.
// Three original page triangles diagnose cost; the unchanged32-triangle tests
// remain the acceptance requirements and run separately in the same job.
it('records actual producer work over the first three original full-clock triangles',()=>{
 const spans:{stage:string;operations:number;boxes:number;proofHits:number;translationHits:number}[]=[];
 function observe<T>(stage:string,c:OriginalFloatIntervalContext,body:()=>T):T {
  const before=c.resources(),value=body(),after=c.resources();
  if(spans.length>=32)throw Error('diagnostic span cap');
  spans.push({stage,operations:after.chargedOperations-before.chargedOperations,boxes:after.createdBoxes-before.createdBoxes,
   proofHits:after.primitiveProofHits-before.primitiveProofHits,translationHits:after.wholeTranslationProofHits-before.wholeTranslationProofHits});
  return value;
 }
 const pose=poseModule.encloseOriginalAngularPose,geometry=geometryModule.encloseOriginalAngularGeometry,
  preparation=preparationModule.encloseOriginalFeaturePreparation,trianglePreparation=preparationModule.encloseOriginalTriangleFeaturePreparation,
  distanceWorkspace=distanceModule.createOriginalSeparatedDistanceWorkspace,satWorkspace=satModule.createOriginalStationarySatWorkspace;
 vi.spyOn(poseModule,'encloseOriginalAngularPose').mockImplementation((...args)=>observe('pose',args[0],()=>pose(...args)));
 vi.spyOn(geometryModule,'encloseOriginalAngularGeometry').mockImplementation((...args)=>observe('geometry',args[0],()=>geometry(...args)));
 vi.spyOn(preparationModule,'encloseOriginalFeaturePreparation').mockImplementation((...args)=>observe('hull-preparation',args[0],()=>preparation(...args)));
 vi.spyOn(preparationModule,'encloseOriginalTriangleFeaturePreparation').mockImplementation((...args)=>observe('triangle-preparation',args[0],()=>trianglePreparation(...args)));
 vi.spyOn(satModule,'createOriginalStationarySatWorkspace').mockImplementation((...args)=>{
  const workspace=observe('SAT-hull-capture',args[0],()=>satWorkspace(...args));
  return Object.freeze({...workspace,encloseTriangle:(...input:Parameters<typeof workspace.encloseTriangle>)=>observe('stationary-SAT',args[0],()=>workspace.encloseTriangle(...input))});
 });
 vi.spyOn(distanceModule,'createOriginalSeparatedDistanceWorkspace').mockImplementation((...args)=>{
  const workspace=observe('distance-hull-capture',args[0],()=>distanceWorkspace(...args));
  return Object.freeze({...workspace,encloseTriangle:(...input:Parameters<typeof workspace.encloseTriangle>)=>observe('separated-distance',args[0],()=>workspace.encloseTriangle(...input))});
 });
 try {
  const zero={x:0,y:0,z:0},reference={vertices:[zero,{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],
   faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],
   faceNormals:[{x:0,y:0,z:-1},{x:0,y:-1,z:0},{x:-1,y:0,z:0},{x:1,y:1,z:1}],
   edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1},{x:-1,y:1,z:0},{x:-1,y:0,z:1},{x:0,y:-1,z:1}]};
  const motion=captureOriginalAngularFixedMotion({position:zero,velocity:{x:1,y:0,z:0},interval:.05,contactDistance:.1,sceneRevision:()=>1,
   angular:{orientation:{x:0,y:0,z:0,w:1},angularVelocity:zero,centerOfMass:zero,inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0},referenceConvex:reference},
   triangles:[10,11,12].map((x,i)=>({id:`page-${i}`,triangle:[{x,y:-4,z:-4},{x,y:4,z:-4},{x,y:0,z:4}] as const}))});
  const scalar=(b:OriginalFloatBox)=>{if(b.lo!==b.hi)throw Error('conditional point-tuple diagnostic');return b.lo;};
  const math:OriginalAngularMathContract=Object.freeze({tag:'conditional point-tuple stage diagnostic',
   hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});
  const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'explicit conditional stage diagnostic',arithmetic:'separate-rn-binary64-gradual-underflow',
   sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
  const r=createOriginalAngularFixedIntervalOracle(math,profile).inspectCell(motion,{lo:0,hi:1,upperInclusive:true});
  expect(r.kind,r.reason).toBe('excluded');expect(r.certifiedTriangles).toBe(3);expect(r.clock).toEqual({lo:0,hi:.05});
  expect(spans.map(s=>s.stage)).toEqual(['pose','geometry','hull-preparation','SAT-hull-capture','stationary-SAT','triangle-preparation','distance-hull-capture','separated-distance',
   'stationary-SAT','triangle-preparation','separated-distance','stationary-SAT','triangle-preparation','separated-distance']);
  expect(spans.reduce((n,s)=>n+s.operations,0)).toBeLessThanOrEqual(r.resources!.chargedOperations);
  console.info('source producer stage diagnostic',JSON.stringify({spans,total:r.resources,mathCalls:r.mathCalls,scope:'three-triangle diagnostic; full32 requirement separate'}));
 }finally{vi.restoreAllMocks();}
});
