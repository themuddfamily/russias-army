import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {encloseOriginalFeaturePreparation,encloseOriginalTriangleFeaturePreparation} from './originalFeaturePreparationInterval';
import {createOriginalAngularSourceAlternativesInterval} from './originalAngularSourceAlternativesInterval';
import {encloseOriginalAngularPose} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {Vec3} from './protocol';

const hypotProfile=Object.freeze({tag:'conditional hypot',hypotDispatch:'3-fast-4-slow-kahan' as const,arithmetic:'separate-rn-binary64-gradual-underflow' as const,sqrt:'correctly-rounded-binary64-Float64Sqrt' as const,tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27' as const});
const provider=createOriginalAngularSourceAlternativesInterval(Object.freeze({tag:'unattested source alternatives',trigAlternatives:'retained-fdlibm-or-glibc-unreduced',
 fdlibmProfile:Object.freeze({tag:'fdlibm',trig:'retained-fdlibm-unreduced-iy0-y0',arithmetic:'separate-rn-binary64-gradual-underflow',hypotProfile}),
 glibcProfile:Object.freeze({tag:'glibc',trig:'retained-glibc-unreduced-taylor-table',arithmetic:'separate-rn-binary64-gradual-underflow',decimalLiterals:'correctly-rounded-binary64-coefficient-translation',tableABI:'binary64-int4-lowword-source-table',hypotProfile})}));
const reference=()=>({vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],
 faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}]});
const boxed=(c:OriginalFloatIntervalContext,h=reference())=>({vertices:h.vertices.map(v=>originalFloatVectorPoint(c,v)),faces:h.faces});
const triangle=(x:number):[Vec3,Vec3,Vec3]=>[{x,y:-2,z:-2},{x,y:2,z:-2},{x,y:0,z:2}];
describe('conditional source finite feature preparation',()=>{
 it('preserves referenced Set, face and Map edge insertion order with all mandatory candidates',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c),r=encloseOriginalFeaturePreparation(c,h,provider.contract);
  expect(r.membership).toEqual(['always','always','always','always']);expect(r.vertexSourceIndices).toEqual([0,1,2,3]);expect(r.referencedVertexSourceIndices).toEqual([0,2,1,3]);
  expect(r.faces).toEqual(h.faces);expect(r.edgeIndices).toEqual([[0,2],[1,2],[0,1],[1,3],[0,3],[2,3]]);expect(r.mathCalls).toBe(4);
  expect(r.vertexBounds.minX).toEqual({lo:0,hi:0});expect(r.vertexBounds.maxX).toEqual({lo:1,hi:1});expect(r.coordinateSquared).toEqual({lo:1,hi:1});
  expect(Object.isFrozen(r.vertices)).toBe(true);expect(r.distanceCertified).toBe(false);expect(r.convexityCertified).toBe(false);
 });
 it('drops unreferenced tetrahedron interior and boundary points but retains exterior points',()=>{
  const h=reference();h.vertices.push({x:.25,y:.25,z:.25},{x:0,y:.25,z:.25},{x:2,y:0,z:0});
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalFeaturePreparation(c,boxed(c,h),provider.contract);
  expect(r.membership).toEqual(['always','always','always','always','never','never','always']);expect(r.vertexSourceIndices).toEqual([0,1,2,3,6]);expect(r.coordinateSquared).toEqual({lo:4,hi:4});
 });
 it('retains uncertain inclusion and correct optional coordinate bounds across actual corner states',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c);h.vertices.push(Object.freeze({x:c.box(-.125,.125),y:c.point(.25),z:c.point(.25)}));
  const r=encloseOriginalFeaturePreparation(c,h,provider.contract);expect(r.membership[4]).toBe('maybe');expect(r.vertexSourceIndices).toEqual([0,1,2,3,4]);
  expect(r.vertexBounds.minX).toEqual({lo:-.125,hi:0});expect(r.vertexBounds.maxX).toEqual({lo:1,hi:1});expect(r.coordinateSquared).toEqual({lo:1,hi:1});
  // Negative x is outside the outward tetrahedron plane; positive x is inside.
  // Actual source finite-feature wrapper witnesses falsify an incorrect drop.
  for(const x of [-.125,.125]){const actual=reference();actual.vertices.push({x,y:.25,z:.25});const hit=sweepOriginalConvexTriangleDistance(actual,{x:0,y:0,z:0},{x:0,y:0,z:0},triangle(-1),2);
   expect(hit).not.toBeNull();expect(hit!.witnessA!.x).toBe(x<0?x:0);
  }
 });
 it('uses mandatory-only lower bounds for optional far points and possible-member upper bounds',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c);h.vertices.push(Object.freeze({x:c.box(0,100),y:c.point(.25),z:c.point(.25)}));
  const r=encloseOriginalFeaturePreparation(c,h,provider.contract);expect(r.membership[4]).toBe('maybe');
  expect(r.vertexBounds.maxX).toEqual({lo:1,hi:100});expect(r.coordinateSquared).toEqual({lo:1,hi:10000.125});
 });
 it('preserves fresh triangle ab/ac/bc and sorted Map segment v/cc source arithmetic',()=>{
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalFeaturePreparation(c,boxed(c),provider.contract),k=r.triangleEdges[0];
  expect(k.ab).toEqual({x:{lo:0,hi:0},y:{lo:1,hi:1},z:{lo:0,hi:0}});expect(k.ac.x).toEqual({lo:1,hi:1});expect(k.bc.x).toEqual({lo:1,hi:1});expect(k.bc.y).toEqual({lo:-1,hi:-1});
  expect(k.ab).toBe(r.faceBasis[0].ab);expect(k.ac).toBe(r.faceBasis[0].ac);expect(Object.isFrozen(r.faceBasis[0].normal)).toBe(true);
  expect(r.segmentVectors[0].v.y).toEqual({lo:1,hi:1});expect(r.segmentVectors[0].cc).toEqual({lo:1,hi:1});expect(r.triangleBounds[0].maxZ).toEqual({lo:0,hi:0});
 });
 it('prepares fixed triangle bounds/constants with the source edge orientations and no Math calls',()=>{
  const c=new OriginalFloatIntervalContext(),v=[originalFloatVectorPoint(c,{x:2,y:0,z:0}),originalFloatVectorPoint(c,{x:0,y:3,z:0}),originalFloatVectorPoint(c,{x:0,y:0,z:4})] as const;
  const r=encloseOriginalTriangleFeaturePreparation(c,v);expect(r.coordinateSquared).toEqual({lo:16,hi:16});expect(r.vertexBounds.maxZ).toEqual({lo:4,hi:4});
  expect(r.segmentVectors[2].v.x).toEqual({lo:2,hi:2});expect(r.segmentVectors[2].v.z).toEqual({lo:-4,hi:-4});expect(r.segmentVectors[2].cc).toEqual({lo:20,hi:20});expect(r.mathCalls).toBe(0);
 });
 it('snapshots all coordinate/topology inputs before the closed-guard callback',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c),contract:OriginalAngularMathContract=Object.freeze({...provider.contract,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{
   h.faces[0][0]=3;h.vertices[1]=originalFloatVectorPoint(ctx,{x:999,y:0,z:0});return provider.contract.hypot(ctx,v);
  }});
  const r=encloseOriginalFeaturePreparation(c,h,contract);expect(r.faces[0]).toEqual([0,2,1]);expect(r.vertexBounds.maxX).toEqual({lo:1,hi:1});
 });
 it('composes .05 nonpoint pose, geometry and complete source preparation in one unchanged context',()=>{
  const c=new OriginalFloatIntervalContext(),pose=encloseOriginalAngularPose(c,{position:{x:0,y:0,z:0},COMvelocity:{x:1,y:0,z:0},orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:90,z:0},
   centerOfMass:{x:.25,y:0,z:0},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}},c.box(.05,.05+2**-40),provider.contract);
  const geometry=encloseOriginalAngularGeometry(c,reference(),pose.orientation,provider.contract),r=encloseOriginalFeaturePreparation(c,geometry,provider.contract);
  expect(r.featureSelectionEnclosed).toBe(true);expect(r.featureBoundsEnclosed).toBe(true);expect(r.membership).toEqual(['always','always','always','always']);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);expect(c.resources().noBudgetReset).toBe(true);
 });
 it('rejects source guard failures, nonfinite coordinate norms and unsupported array dispatch',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c),bad={...h,faces:[h.faces[0],h.faces[1],h.faces[2],h.faces[0]]};
  expect(()=>encloseOriginalFeaturePreparation(c,bad,provider.contract)).toThrow(/edge-count/);
  h.vertices.push(originalFloatVectorPoint(c,{x:Number.MAX_VALUE,y:0,z:0}));expect(()=>encloseOriginalFeaturePreparation(c,h,provider.contract)).toThrow(UnsupportedFloatInterval);
  const overridden=boxed(c);Object.defineProperty(overridden.vertices,'filter',{value:()=>[]});expect(()=>encloseOriginalFeaturePreparation(c,overridden,provider.contract)).toThrow(/standard/);
 });
 it('rejects foreign owned values and lowerable callback/scalar cap exhaustion',()=>{
  const c=new OriginalFloatIntervalContext(),h=boxed(c);h.vertices[0]=originalFloatVectorPoint(new OriginalFloatIntervalContext(),{x:0,y:0,z:0});
  expect(()=>encloseOriginalFeaturePreparation(c,h,provider.contract)).toThrow(/foreign/);
  expect(()=>encloseOriginalFeaturePreparation(c,boxed(c),provider.contract,{mathCalls:3})).toThrow(/math-call-cap/);
  const limited=new OriginalFloatIntervalContext({operations:150}),v=boxed(limited);expect(()=>encloseOriginalFeaturePreparation(limited,v,provider.contract)).toThrow(/operation-cap/);expect(limited.resources().chargedOperations).toBeLessThanOrEqual(150);
 });
});
