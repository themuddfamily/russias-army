import {expect,it} from 'vitest';
import {OriginalFloatIntervalContext} from './originalFloatInterval';
import {createOriginalAngularSourceAlternativesInterval} from './originalAngularSourceAlternativesInterval';
import {encloseOriginalAngularPose} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import {encloseOriginalClosedFaceGuards} from './originalClosedFaceInterval';
import {encloseOriginalStationarySatNull} from './originalStationarySatInterval';
import {advanceOriginalAngularBody,originalAngularConvex,type OriginalAngularBody} from './originalAngularBody';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
it('shares one context through frame-scale pose, complete tetrahedron geometry, face guards and stationary SAT',()=>{
 const hypotProfile=Object.freeze({tag:'conditional hypot',hypotDispatch:'3-fast-4-slow-kahan' as const,arithmetic:'separate-rn-binary64-gradual-underflow' as const,sqrt:'correctly-rounded-binary64-Float64Sqrt' as const,tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27' as const});
 const contract=createOriginalAngularSourceAlternativesInterval(Object.freeze({tag:'conditional retained alternatives',trigAlternatives:'retained-fdlibm-or-glibc-unreduced',
  fdlibmProfile:Object.freeze({tag:'fdlibm',trig:'retained-fdlibm-unreduced-iy0-y0',arithmetic:'separate-rn-binary64-gradual-underflow',hypotProfile}),
  glibcProfile:Object.freeze({tag:'glibc',trig:'retained-glibc-unreduced-taylor-table',arithmetic:'separate-rn-binary64-gradual-underflow',decimalLiterals:'correctly-rounded-binary64-coefficient-translation',tableABI:'binary64-int4-lowword-source-table',hypotProfile})})).contract;
 const reference={vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],
  faceNormals:[{x:0,y:0,z:-1},{x:0,y:-1,z:0},{x:-1,y:0,z:0},{x:1,y:1,z:1}],
  edgeDirections:[{x:0,y:1,z:0},{x:-1,y:1,z:0},{x:1,y:0,z:0},{x:-1,y:0,z:1},{x:0,y:0,z:1},{x:0,y:-1,z:1}]};
 const saved={position:{x:0,y:0,z:0},COMvelocity:{x:1,y:0,z:0},orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:90,z:0},centerOfMass:{x:.25,y:0,z:0},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}};
 const triangle=[{x:100,y:-2,z:-2},{x:100,y:2,z:-2},{x:100,y:0,z:2}] as const,c=new OriginalFloatIntervalContext(),lo=.05,hi=.05+2**-40;
 const pose=encloseOriginalAngularPose(c,saved,c.box(lo,hi),contract),geometry=encloseOriginalAngularGeometry(c,reference,pose.orientation,contract);
 const faces=encloseOriginalClosedFaceGuards(c,geometry,contract),sat=encloseOriginalStationarySatNull(c,geometry,pose.pivot,triangle,contract);
 expect(faces.sourceFaceGuardsEnclosed).toBe(true);expect(faces.edgeIndices.length).toBe(6);expect(sat.certifiedNull).toBe(true);expect(sat.positiveSkinWrapperCertified).toBe(false);
 // Actual positive-skin calls are falsification checks. The preceding leaf
 // guarantees do not enclose the source finite-distance/pruning graph.
 for(const seconds of [lo,(lo+hi)/2,hi]){
  const state:OriginalAngularBody={orientation:{...saved.orientation},angularVelocity:{...saved.angularVelocity},centerOfMass:saved.centerOfMass,inverseInertia:saved.inverseInertia,referenceConvex:reference};
  const pivot=advanceOriginalAngularBody(saved.position,saved.COMvelocity,state,seconds),shape=originalAngularConvex(state);
  expect(sweepOriginalConvexTriangleDistance(shape,pivot,pivot,triangle,.1)).toBeNull();
 }
 expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);expect(c.resources().noBudgetReset).toBe(true);
});
