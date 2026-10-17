import {expect,it} from 'vitest';
import {OriginalFloatIntervalContext} from './originalFloatInterval';
import {createOriginalAngularSourceAlternativesInterval} from './originalAngularSourceAlternativesInterval';
import {encloseOriginalAngularPose} from './originalAngularPoseInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import {encloseOriginalStationaryDistanceWrapperNull} from './originalStationaryDistanceWrapperInterval';
import {advanceOriginalAngularBody,originalAngularConvex,type OriginalAngularBody} from './originalAngularBody';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';

it('covers the entire conditional stationary triangle wrapper after nonpoint rotating pose and geometry',()=>{
 const hypotProfile=Object.freeze({tag:'conditional hypot',hypotDispatch:'3-fast-4-slow-kahan' as const,arithmetic:'separate-rn-binary64-gradual-underflow' as const,sqrt:'correctly-rounded-binary64-Float64Sqrt' as const,tinyTrig:'frozen-common-nonnegative-strict-lt-2^-27' as const});
 const contract=createOriginalAngularSourceAlternativesInterval(Object.freeze({tag:'conditional retained alternatives',trigAlternatives:'retained-fdlibm-or-glibc-unreduced',
  fdlibmProfile:Object.freeze({tag:'fdlibm',trig:'retained-fdlibm-unreduced-iy0-y0',arithmetic:'separate-rn-binary64-gradual-underflow',hypotProfile}),
  glibcProfile:Object.freeze({tag:'glibc',trig:'retained-glibc-unreduced-taylor-table',arithmetic:'separate-rn-binary64-gradual-underflow',decimalLiterals:'correctly-rounded-binary64-coefficient-translation',tableABI:'binary64-int4-lowword-source-table',hypotProfile})})).contract;
 const reference={vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],
  faceNormals:[{x:0,y:0,z:-1},{x:0,y:-1,z:0},{x:-1,y:0,z:0},{x:1,y:1,z:1}],
  edgeDirections:[{x:0,y:1,z:0},{x:-1,y:1,z:0},{x:1,y:0,z:0},{x:-1,y:0,z:1},{x:0,y:0,z:1},{x:0,y:-1,z:1}]};
 const saved={position:{x:0,y:0,z:0},COMvelocity:{x:1,y:0,z:0},orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:90,z:0},centerOfMass:{x:.25,y:0,z:0},inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0}};
 const triangle=[{x:100,y:-2,z:-2},{x:100,y:2,z:-2},{x:100,y:0,z:2}] as const;
 const c=new OriginalFloatIntervalContext(),lo=.05,hi=.05+2**-40;
 const pose=encloseOriginalAngularPose(c,saved,c.box(lo,hi),contract),geometry=encloseOriginalAngularGeometry(c,reference,pose.orientation,contract);
 const wrapper=encloseOriginalStationaryDistanceWrapperNull(c,geometry,pose.pivot,triangle,.1,contract,Object.freeze({tag:'conditional root/cache',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'}));
 expect(wrapper.conditionalFullWrapperNullCertified).toBe(true);expect(wrapper.initialSat!.certifiedNull).toBe(true);
 expect(wrapper.distance!.stationaryAdvanceNullCertified).toBe(true);expect(wrapper.distance!.distance.lo).toBeGreaterThan(98);
 expect(wrapper.sourceProfileAttested).toBe(false);expect(wrapper.nativeEquivalent).toBe(false);expect(wrapper.defaultIntegration).toBe(false);
 // These fresh point calls can falsify incorrect containment. They do not
 // attest runtime Math/caches or prove all scene triangles/the full frame.
 for(const seconds of [lo,(lo+hi)/2,hi]){
  const state:OriginalAngularBody={orientation:{...saved.orientation},angularVelocity:{...saved.angularVelocity},centerOfMass:saved.centerOfMass,inverseInertia:saved.inverseInertia,referenceConvex:reference};
  const pivot=advanceOriginalAngularBody(saved.position,saved.COMvelocity,state,seconds);
  expect(sweepOriginalConvexTriangleDistance(originalAngularConvex(state),pivot,pivot,triangle,.1)).toBeNull();
 }
 expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);expect(c.resources().noBudgetReset).toBe(true);
});
