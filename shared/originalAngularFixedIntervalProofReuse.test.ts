import {expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {createOriginalAngularFixedIntervalOracle} from './originalAngularFixedIntervalOracle';
import {captureOriginalAngularFixedMotion} from './originalAngularFixedMotion';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';

it('confines primitive proofs to fresh attempts and still invokes source Math callbacks',()=>{
 const zero={x:0,y:0,z:0},reference={vertices:[zero,{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],
  faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],
  faceNormals:[{x:0,y:0,z:-1},{x:0,y:-1,z:0},{x:-1,y:0,z:0},{x:1,y:1,z:1}],
  edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1},{x:-1,y:1,z:0},{x:-1,y:0,z:1},{x:0,y:-1,z:1}]};
 const motion=captureOriginalAngularFixedMotion({position:zero,velocity:{x:1,y:0,z:0},interval:.05,contactDistance:.1,sceneRevision:()=>1,
  angular:{orientation:{x:0,y:0,z:0,w:1},angularVelocity:zero,centerOfMass:zero,inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0},referenceConvex:reference},
  triangles:[10,20].map((x,i)=>({id:`far-${i}`,triangle:[{x,y:-4,z:-4},{x,y:4,z:-4},{x,y:0,z:4}] as const}))});
 const owners=new Set<OriginalFloatIntervalContext>();let calls=0;
 const scalar=(b:OriginalFloatBox)=>{if(b.lo!==b.hi)throw Error('conditional point-tuple fixture');return b.lo;};
 const math:OriginalAngularMathContract=Object.freeze({tag:'conditional point-tuple Math without callback memoization',
  hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{owners.add(c);calls++;return c.point(Math.hypot(...v.map(scalar)));},
  sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});
 const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'explicit conditional root/arithmetic/cache',arithmetic:'separate-rn-binary64-gradual-underflow',
  sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
 const provider=createOriginalAngularFixedIntervalOracle(math,profile),cell={lo:0,hi:1,upperInclusive:true},before=JSON.stringify(motion);
 const first=provider.inspectCell(motion,cell),firstCalls=calls,second=provider.inspectCell(motion,cell);
 expect(first.kind,first.reason).toBe('excluded');expect(second.kind,second.reason).toBe('excluded');expect(first.certifiedTriangles).toBe(2);
 expect(firstCalls).toBeGreaterThan(0);expect(calls).toBe(2*firstCalls);expect(first.mathCalls).toBe(firstCalls);expect(second.mathCalls).toBe(firstCalls);
 expect(owners.size).toBe(2);expect(first.resources).toEqual(second.resources);expect(JSON.stringify(motion)).toBe(before);
 expect(provider.metadata.attemptLocalPrimitiveProofReuse).toBe(true);expect(provider.metadata.operationAccounting).toBe('bounded-proof-computations-with-universal-numeric-reuse');
 expect(first.resources!.noBudgetReset).toBe(true);expect(first.resources!.chargedOperations).toBeLessThanOrEqual(100000);expect(first.resources!.createdBoxes).toBeLessThanOrEqual(16384);
 expect(provider.metadata.proofHistoryRetained).toBe(false);expect(provider.metadata.nativeEquivalent).toBe(false);expect(provider.metadata.defaultIntegration).toBe(false);
});
