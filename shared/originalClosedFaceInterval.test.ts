import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {encloseOriginalClosedFaceGuards} from './originalClosedFaceInterval';
import {createOriginalAngularSourceAlternativesInterval} from './originalAngularSourceAlternativesInterval';
import {encloseOriginalAngularPose} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
const hypotProfile=Object.freeze({tag:'conditional hypot',hypotDispatch:'3-fast-4-slow-kahan' as const,arithmetic:'separate-rn-binary64-gradual-underflow' as const,sqrt:'correctly-rounded-binary64-Float64Sqrt' as const,tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27' as const});
const provider=createOriginalAngularSourceAlternativesInterval(Object.freeze({tag:'conditional retained sources',trigAlternatives:'retained-fdlibm-or-glibc-unreduced',
 fdlibmProfile:Object.freeze({tag:'conditional fdlibm',trig:'retained-fdlibm-unreduced-iy0-y0',arithmetic:'separate-rn-binary64-gradual-underflow',hypotProfile}),
 glibcProfile:Object.freeze({tag:'conditional glibc',trig:'retained-glibc-unreduced-taylor-table',arithmetic:'separate-rn-binary64-gradual-underflow',decimalLiterals:'correctly-rounded-binary64-coefficient-translation',tableABI:'binary64-int4-lowword-source-table',hypotProfile})}));
const vertices=[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
const reference={vertices,faces,faceNormals:[{x:1,y:0,z:0}],edgeDirections:[{x:0,y:1,z:0}]};
const input=(c:OriginalFloatIntervalContext)=>({vertices:vertices.map(v=>originalFloatVectorPoint(c,v)),faces});
describe('conditional source closed-face guards',()=>{
 it('preserves source triangle and undirected edge insertion order without certifying winding',()=>{
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalClosedFaceGuards(c,input(c),provider.contract);
  expect(r.edgeIndices).toEqual([[0,2],[1,2],[0,1],[1,3],[0,3],[2,3]]);expect(r.mathCalls).toBe(4);expect(r.triangles.length).toBe(4);
  expect(r.windingCertified).toBe(false);expect(r.convexityCertified).toBe(false);expect(r.featureSelectionEnclosed).toBe(false);
  expect(r.distanceCertified).toBe(false);expect(Object.isFrozen(r.triangles[0])).toBe(true);
  const reversed=faces.map(([a,b,d])=>[a,d,b] as const);expect(encloseOriginalClosedFaceGuards(c,{vertices:r.vertices,faces:reversed},provider.contract).sourceClosedEdgeCountsEnclosed).toBe(true);
 });
 it('validates genuinely nonpoint face coordinates under the source hypot graph',()=>{
  const c=new OriginalFloatIntervalContext(),v=input(c);v.vertices[1]=Object.freeze({x:c.box(1,1+2**-40),y:c.point(0),z:c.point(0)});
  expect(encloseOriginalClosedFaceGuards(c,v,provider.contract).sourceFaceGuardsEnclosed).toBe(true);
 });
 it('rejects open edge counts like the source feature preparation',()=>{
  const altered=[faces[0],faces[1],faces[2],faces[0]],c=new OriginalFloatIntervalContext();
  expect(()=>encloseOriginalClosedFaceGuards(c,{vertices:input(c).vertices,faces:altered},provider.contract)).toThrow(/edge-count/);
  expect(()=>sweepOriginalConvexTriangleDistance({...reference,faces:altered},{x:0,y:0,z:0},{x:0,y:0,z:0},[{x:10,y:0,z:0},{x:10,y:1,z:0},{x:10,y:0,z:1}],.1)).toThrow(/Closed convex/);
 });
 it('rejects the same small source cross/hypot face degeneracy',()=>{
  const points=vertices.map(v=>({x:v.x*1e-8,y:v.y*1e-8,z:v.z*1e-8})),c=new OriginalFloatIntervalContext();
  expect(()=>encloseOriginalClosedFaceGuards(c,{vertices:points.map(v=>originalFloatVectorPoint(c,v)),faces},provider.contract)).toThrow(/degenerate/);
  expect(()=>sweepOriginalConvexTriangleDistance({...reference,vertices:points},{x:0,y:0,z:0},{x:0,y:0,z:0},[{x:10,y:0,z:0},{x:10,y:1,z:0},{x:10,y:0,z:1}],.1)).toThrow(/Degenerate/);
 });
 it('retains an unresolved face guard rather than choosing a favorable hypot value',()=>{
  const c=new OriginalFloatIntervalContext(),v=input(c),contract=Object.freeze({tag:'truthful wide source fixture',hypot:(context:OriginalFloatIntervalContext)=>context.box(0,2)});
  expect(()=>encloseOriginalClosedFaceGuards(c,v,contract)).toThrow(/unresolved/);
 });
 it('composes nonpoint .05-second source pose, geometry and every face guard in one context',()=>{
  const c=new OriginalFloatIntervalContext(),pose=encloseOriginalAngularPose(c,{position:{x:0,y:0,z:0},COMvelocity:{x:1,y:0,z:0},orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:90,z:0},
   centerOfMass:{x:.25,y:0,z:0},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}},c.box(.05,.05+2**-40),provider.contract);
  const geometry=encloseOriginalAngularGeometry(c,reference,pose.orientation,provider.contract),result=encloseOriginalClosedFaceGuards(c,geometry,provider.contract);
  expect(result.sourceFaceGuardsEnclosed).toBe(true);expect(result.sourceClosedEdgeCountsEnclosed).toBe(true);expect(result.featureBoundsEnclosed).toBe(false);
  expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);expect(c.resources().noBudgetReset).toBe(true);
 });
 it('rejects malformed source dispatch/index and foreign owned inputs',()=>{
  const c=new OriginalFloatIntervalContext(),v=input(c),bad=faces.map(f=>[...f] as [number,number,number]);bad[3][2]=99;
  expect(()=>encloseOriginalClosedFaceGuards(c,{...v,faces:bad},provider.contract)).toThrow(/index/);
  const overridden=Object.assign([...faces],{map:()=>[]});expect(()=>encloseOriginalClosedFaceGuards(c,{...v,faces:overridden},provider.contract)).toThrow(/standard/);
  const foreign=input(new OriginalFloatIntervalContext());expect(()=>encloseOriginalClosedFaceGuards(c,foreign,provider.contract)).toThrow(/foreign/);
 });
 it('enforces unchanged context and lowerable invocation callback limits',()=>{
  const c=new OriginalFloatIntervalContext(),v=input(c);expect(()=>encloseOriginalClosedFaceGuards(c,v,provider.contract,{mathCalls:3})).toThrow(/math-call-cap/);
  expect(()=>encloseOriginalClosedFaceGuards(c,v,provider.contract,{mathCalls:129})).toThrow(/only-be-lowered/);
  const small=new OriginalFloatIntervalContext({operations:20});expect(()=>encloseOriginalClosedFaceGuards(small,input(small),provider.contract)).toThrow(UnsupportedFloatInterval);
 });
});
