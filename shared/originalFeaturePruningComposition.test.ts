import {expect,it} from 'vitest';
import {OriginalFloatIntervalContext} from './originalFloatInterval';
import {originalFloatVectorPoint,encloseOriginalClosestTriangle} from './originalFiniteFeatureInterval';
import {createOriginalAngularMathInterval} from './originalAngularMathInterval';
import {encloseOriginalFeaturePreparation,encloseOriginalTriangleFeaturePreparation} from './originalFeaturePreparationInterval';
import {encloseOriginalDistancePadding,encloseOriginalPointBound,encloseOriginalEdgeBound,encloseOriginalPruningDecision} from './originalDistancePruningInterval';
it('shares preparation, the actual first witness and subsequent source pruning in one nonpoint context',()=>{
 const contract=createOriginalAngularMathInterval(Object.freeze({tag:'conditional retained hypot source',hypotDispatch:'3-fast-4-slow-kahan',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-binary64-Float64Sqrt',tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27'})).contract;
 const c=new OriginalFloatIntervalContext(),point=(x:number,y:number,z:number)=>originalFloatVectorPoint(c,{x,y,z}),zero=point(0,0,0);
 const vertices=[Object.freeze({x:c.box(0,2**-40),y:c.point(0),z:c.point(0)}),point(1,0,0),point(0,1,0),point(0,0,1)];
 const a=encloseOriginalFeaturePreparation(c,{vertices,faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]]},contract);
 const b=encloseOriginalTriangleFeaturePreparation(c,[point(100,-2,-2),point(100,2,-2),point(100,0,2)]);
 const padding=encloseOriginalDistancePadding(c,a.coordinateSquared,b.coordinateSquared,zero);
 expect(encloseOriginalPruningDecision(c,encloseOriginalPointBound(c,a.vertices[0],b.triangleBounds[0]),null,padding,'forward').action).toBe('evaluate');
 // The first mandatory source candidate executes with initial best=Infinity.
 // Its finite rounded witness squared becomes the SAME source prefix best.
 const witness=encloseOriginalClosestTriangle(c,a.vertices[0],b.triangles[0],b.triangleEdges[0]).witness;
 const dx=c.sub(a.vertices[0].x,witness.x),dy=c.sub(a.vertices[0].y,witness.y),dz=c.sub(a.vertices[0].z,witness.z);
 const prefixBest=c.add(c.add(c.square(dx),c.square(dy)),c.square(dz));
 expect(prefixBest.lo).toBeGreaterThan(9999);expect(prefixBest.hi).toBeLessThan(10001);
 expect(encloseOriginalPruningDecision(c,encloseOriginalPointBound(c,a.vertices[1],b.triangleBounds[0]),prefixBest,padding,'forward').action).toBe('evaluate');
 // If the source reaches the later edge loop, its nonnegative running best
 // can only decrease from this first finite candidate. Keep its full range.
 const laterBest=c.box(0,prefixBest.hi);
 const edgeGate=encloseOriginalPruningDecision(c,encloseOriginalEdgeBound(c,a.edgeBounds[0],b.edgeBounds[0],zero),laterBest,padding,'edge');
 expect(edgeGate.action).toBe('skip');expect(edgeGate.wrapperExclusionCertified).toBe(false);
 // This prefix does not enumerate every candidate or establish global best.
 expect(edgeGate.globalBestCertified).toBe(false);expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);expect(c.resources().noBudgetReset).toBe(true);
});
