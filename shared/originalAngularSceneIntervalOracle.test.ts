import {expect,it} from 'vitest';
import {captureOriginalAngularFixedMotion,evaluateOriginalAngularFixedMotion} from './originalAngularFixedMotion';
import {createOriginalAngularFixedIntervalOracle} from './originalAngularFixedIntervalOracle';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';
import {createOriginalSceneGeometry} from './originalSceneGeometry';
import {planOriginalAngularFixedScene} from './originalAngularFixedScene';

const zero={x:0,y:0,z:0};
const scalar=(v:OriginalFloatBox)=>{if(v.lo!==v.hi)throw Error('point-tuple source fixture');return v.lo;};
const math:OriginalAngularMathContract=Object.freeze({tag:'conditional no-spin point-tuple Math',hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});
const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'conditional arithmetic/root/cache',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
function capture(lastIntersects=false,query:'stationary-wrapper'|'scene-aabb-then-wrapper'='scene-aabb-then-wrapper'){
 const reference={vertices:[zero,{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],
  faceNormals:[{x:0,y:0,z:-1},{x:0,y:-1,z:0},{x:-1,y:0,z:0},{x:1,y:1,z:1}],
  edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1},{x:-1,y:1,z:0},{x:0,y:-1,z:1},{x:-1,y:0,z:1}]};
 return captureOriginalAngularFixedMotion({query,position:zero,velocity:{x:1,y:0,z:0},interval:.05,contactDistance:.1,sceneRevision:()=>1,
  angular:{orientation:{x:0,y:0,z:0,w:1},angularVelocity:zero,centerOfMass:zero,inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0},referenceConvex:reference},
  triangles:Array.from({length:32},(_,i)=>{const x=lastIntersects&&i===31?.5:10+i;return {id:`page-${i}`,triangle:[{x,y:-4,z:-4},{x,y:4,z:-4},{x,y:0,z:4}] as const};})});
}

it('covers the whole scene-query page through full-hull bounds within unchanged caps',()=>{
 const provider=createOriginalAngularFixedIntervalOracle(math,profile),motion=capture();
 const result=provider.inspectCell(motion,{lo:0,hi:1,upperInclusive:true});
 expect(result.kind,result.reason).toBe('excluded');expect(result.certifiedTriangles).toBe(32);expect(result.boundsExcludedTriangles).toBe(32);
 expect(result.query).toBe('scene-aabb-then-wrapper');expect(result.proof).toContain('geometry AABB guard');
 expect(result.resources!.chargedOperations).toBeLessThanOrEqual(100000);expect(result.resources!.createdBoxes).toBeLessThanOrEqual(16384);
 for(const fraction of [0,.25,.5,.75,1])expect(evaluateOriginalAngularFixedMotion(motion,fraction).contact).toBeNull();
 console.info('scene page resources',JSON.stringify(result.resources));
});

it('does not use distant bounds to exclude the last nearby contacting triangle',()=>{
 const motion=capture(true),result=createOriginalAngularFixedIntervalOracle(math,profile).inspectCell(motion,{lo:0,hi:1,upperInclusive:true});
 expect(result.kind).toBe('unresolved');expect(result.certifiedTriangles).toBe(31);expect(result.boundsExcludedTriangles).toBe(31);
 expect(result.reason).toBe('captured-triangle-wrapper-unresolved');expect(result.proof).toBeUndefined();
 const contact=evaluateOriginalAngularFixedMotion(motion,0).contact;
 expect(contact?.triangleId).toBe('page-31');expect(contact?.triangleIndex).toBe(31);
});

it('retains a triangle equal to the expanded whole-cell AABB boundary',()=>{
 const seed=capture(),x=(1+.05)+.1;
 const motion=captureOriginalAngularFixedMotion({...seed,triangles:[{id:'boundary',triangle:[{x,y:-4,z:-4},{x,y:4,z:-4},{x,y:0,z:4}]}]});
 const result=createOriginalAngularFixedIntervalOracle(math,profile).inspectCell(motion,{lo:0,hi:1,upperInclusive:true});
 expect(result.boundsExcludedTriangles).toBe(0);
});

it('keeps direct-wrapper captures distinct from scene guard certificates',()=>{
 const motion=capture(false,'stationary-wrapper');
 const result=createOriginalAngularFixedIntervalOracle(math,profile,{operations:100}).inspectCell(motion,{lo:0,hi:1,upperInclusive:true});
 expect(result.kind).toBe('unresolved');expect(result.query).toBe('stationary-wrapper');expect(result.boundsExcludedTriangles).toBe(0);
});

it('never invokes a rejected query getter while reporting an invalid capture',()=>{
 let calls=0;
 const forged={...capture(),get query():never{calls++;throw Error('must not invoke');}};
 const result=createOriginalAngularFixedIntervalOracle(math,profile).inspectCell(forged,{lo:0,hi:1,upperInclusive:true});
 expect(result.kind).toBe('unresolved');expect(calls).toBe(0);expect(result.query).toBeUndefined();
});

it('propagates scene-query mode through every page of the construction scene planner',()=>{
 const motion=capture(),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 const geometry=createOriginalSceneGeometry({
  nodes:motion.triangles.map((entry,i)=>({name:`surface-${i}`,resource:entry.id,parent:'World',matrix:identity,visibility:1,shader:'default'})),
  meshes:motion.triangles.map(entry=>({resource:entry.id,part:0,positions:entry.triangle.map(point=>[point.x,point.y,point.z]),faces:[[0,1,2]],normals:[],tex_coords:[]})),
 },{scale:1,cellSize:20});
 const result=planOriginalAngularFixedScene({query:motion.query,geometry,position:zero,velocity:motion.velocity,angular:motion.angular,interval:motion.interval,contactDistance:motion.contactDistance,activeSceneRevision:()=>1},createOriginalAngularFixedIntervalOracle(math,profile).oracle);
 expect(result.kind,result.kind==='unresolved'?result.reason:undefined).toBe('excluded');expect(result.stats.triangles).toBe(32);expect(result.stats.pages).toBe(2);
 expect(result.receipts[0].certificates[0].proof).toContain('geometry AABB guard');
});
