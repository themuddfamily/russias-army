import {expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {createOriginalAngularFixedIntervalOracle} from './originalAngularFixedIntervalOracle';
import {captureOriginalAngularFixedMotion} from './originalAngularFixedMotion';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';

const zero={x:0,y:0,z:0},scalar=(v:OriginalFloatBox)=>{if(v.lo!==v.hi)throw Error('point-tuple source fixture');return v.lo;};
const math:OriginalAngularMathContract=Object.freeze({tag:'conditional no-spin point-tuple Math',hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});
const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'conditional arithmetic/root/cache',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
function capture(lastIntersects=false){
 const reference={vertices:[zero,{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],
  faceNormals:[{x:0,y:0,z:-1},{x:0,y:-1,z:0},{x:-1,y:0,z:0},{x:1,y:1,z:1}],
  edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1},{x:-1,y:1,z:0},{x:-1,y:0,z:1},{x:0,y:-1,z:1}]};
 return captureOriginalAngularFixedMotion({position:zero,velocity:{x:1,y:0,z:0},interval:.05,contactDistance:.1,sceneRevision:()=>1,
  angular:{orientation:{x:0,y:0,z:0,w:1},angularVelocity:zero,centerOfMass:zero,inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0},referenceConvex:reference},
  triangles:Array.from({length:32},(_,i)=>{const x=lastIntersects&&i===31?.5:10+i;return {id:`page-${i}`,triangle:[{x,y:-4,z:-4},{x,y:4,z:-4},{x,y:0,z:4}] as const};})});
}

it('covers all32 positive-skin triangles and full captured clock within unchanged aggregate caps',()=>{
 const provider=createOriginalAngularFixedIntervalOracle(math,profile),motion=capture(),result=provider.inspectCell(motion,{lo:0,hi:1,upperInclusive:true});
 console.info('complete-page resource observation',JSON.stringify({kind:result.kind,reason:result.reason,certifiedTriangles:result.certifiedTriangles,mathCalls:result.mathCalls,resources:result.resources}));
 expect(result.kind,result.reason).toBe('excluded');expect(result.triangleCount).toBe(32);expect(result.certifiedTriangles).toBe(32);
 expect(result.clock).toEqual({lo:0,hi:.05});expect(result.mathCalls).toBeLessThanOrEqual(128);
 expect(result.resources!.chargedOperations).toBeLessThanOrEqual(100000);expect(result.resources!.createdBoxes).toBeLessThanOrEqual(16384);expect(result.resources!.noBudgetReset).toBe(true);
 const again=provider.inspectCell(motion,{lo:0,hi:1,upperInclusive:true});expect(again.kind).toBe('excluded');expect(again.resources).toEqual(result.resources);
});

it('cannot replace the last intersecting triangle with the preceding31 exclusions',()=>{
 const result=createOriginalAngularFixedIntervalOracle(math,profile).inspectCell(capture(true),{lo:0,hi:1,upperInclusive:true});
 console.info('last-triangle resource observation',JSON.stringify({kind:result.kind,reason:result.reason,certifiedTriangles:result.certifiedTriangles,mathCalls:result.mathCalls,resources:result.resources}));
 expect(result.kind).toBe('unresolved');expect(result.triangleCount).toBe(32);expect(result.certifiedTriangles).toBe(31);expect(result.reason).toBe('captured-triangle-wrapper-unresolved');
});
