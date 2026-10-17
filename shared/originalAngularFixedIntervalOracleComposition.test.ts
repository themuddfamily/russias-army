import {expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {createOriginalAngularFixedIntervalOracle} from './originalAngularFixedIntervalOracle';
import {captureOriginalAngularFixedMotion,planOriginalAngularFixedMotion} from './originalAngularFixedMotion';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';

it('feeds a numerical full-frame exclusion into the actual detached planner without mutating its capture',()=>{
 const zero={x:0,y:0,z:0},reference={vertices:[zero,{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],
  faceNormals:[{x:0,y:0,z:-1},{x:0,y:-1,z:0},{x:-1,y:0,z:0},{x:1,y:1,z:1}],
  edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1},{x:-1,y:1,z:0},{x:-1,y:0,z:1},{x:0,y:-1,z:1}]};
 const motion=captureOriginalAngularFixedMotion({position:zero,velocity:{x:1,y:0,z:0},interval:.05,contactDistance:.1,sceneRevision:()=>1,
  angular:{orientation:{x:0,y:0,z:0,w:1},angularVelocity:zero,centerOfMass:zero,inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0},referenceConvex:reference},
  triangles:[10,20].map((x,i)=>({id:`far-${i}`,triangle:[{x,y:-4,z:-4},{x,y:4,z:-4},{x,y:0,z:4}] as const}))});
 const before=JSON.stringify(motion),scalar=(v:OriginalFloatBox)=>{if(v.lo!==v.hi)throw Error('point-tuple conditional fixture');return v.lo;};
 const math:OriginalAngularMathContract=Object.freeze({tag:'conditional point-tuple Math',hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});
 const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'conditional arithmetic/root/cache',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
 const provider=createOriginalAngularFixedIntervalOracle(math,profile),plan=planOriginalAngularFixedMotion(motion,provider.oracle);
 expect(plan.kind).toBe('excluded');expect(plan.stats).toEqual({cells:1,evaluations:1,excludedCells:1});
 expect(plan.certificates).toHaveLength(1);expect(plan.certificates[0].origin).toBe('trusted-whole-cell-oracle');
 expect(plan.certificates[0].cell).toEqual({lo:0,hi:1,upperInclusive:true});expect(plan.scope).toBe('captured-triangles-binary64-fractions');
 expect(JSON.stringify(motion)).toBe(before);expect(Object.isFrozen(motion)).toBe(true);
});
