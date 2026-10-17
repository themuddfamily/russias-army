import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint,encloseOriginalClosestSegments,type OriginalFloatVectorBox} from './originalFiniteFeatureInterval';
import {encloseOriginalStationaryDistanceWrapperNull} from './originalStationaryDistanceWrapperInterval';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';

const point=(c:OriginalFloatIntervalContext,x:number,y:number,z:number)=>originalFloatVectorPoint(c,{x,y,z});
const add=(c:OriginalFloatIntervalContext,a:OriginalFloatVectorBox,o:OriginalFloatVectorBox)=>Object.freeze({x:c.add(a.x,o.x),y:c.add(a.y,o.y),z:c.add(a.z,o.z)});
const sourceU=(c:OriginalFloatIntervalContext,last:OriginalFloatVectorBox,first:OriginalFloatVectorBox,o:OriginalFloatVectorBox)=>Object.freeze({x:c.translatedSub(last.x,first.x,o.x),y:c.translatedSub(last.y,first.y,o.y),z:c.translatedSub(last.z,first.z,o.z)});
const scalar=(v:OriginalFloatBox)=>{if(v.lo!==v.hi)throw Error('point-only source fixture');return v.lo;};
const contract:OriginalAngularMathContract=Object.freeze({tag:'point-only source hypot fixture',hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});
const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'conditional root/cache',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});

describe('same source translated segment displacement',()=>{
 it('keeps a finite nonparallel witness across a full common translation spanning one',()=>{
  const c=new OriginalFloatIntervalContext(),a=point(c,0,0,0),b=point(c,1,0,0),o=Object.freeze({x:c.box(0,1),y:c.point(0),z:c.point(0)}),u=sourceU(c,b,a,o);
  const r=encloseOriginalClosestSegments(c,add(c,a,o),add(c,b,o),point(c,.5,-1,1),point(c,.5,1,1),undefined,u);
  expect(u.x.lo).toBeGreaterThan(.99);expect(u.x.hi).toBeLessThan(1.01);expect(r.paths).toEqual(['nonparallel-interior']);
  for(const offset of [0,.5,1]){expect(c.contains(r.first.x,Math.max(.5,offset))).toBe(true);expect(c.contains(r.first.y,0)).toBe(true);expect(c.contains(r.second.x,.5)).toBe(true);expect(c.contains(r.second.y,0)).toBe(true);expect(c.contains(r.second.z,1)).toBe(true);}
 });
 it('retains endpoint rounding instead of substituting an untranslated cached edge',()=>{
  const c=new OriginalFloatIntervalContext(),a=point(c,0,0,0),b=point(c,1,0,0),o=point(c,2**53,0,0),u=sourceU(c,b,a,o),r=encloseOriginalClosestSegments(c,add(c,a,o),add(c,b,o),point(c,0,1,0),point(c,1,1,0),undefined,u);
  expect(u.x).toEqual({lo:0,hi:0});expect(r.paths).toEqual(['first-zero']);expect(r.first.x).toEqual({lo:2**53,hi:2**53});
 });
 it('closes the full positive wrapper for an untranslated hull with a nonpoint stationary pivot and contains actual source witnesses',()=>{
  const c=new OriginalFloatIntervalContext(),h={vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}]};
  const boxed={vertices:h.vertices.map(v=>originalFloatVectorPoint(c,v)),faces:h.faces,faceNormals:h.faceNormals.map(v=>originalFloatVectorPoint(c,v)),edgeDirections:h.edgeDirections.map(v=>originalFloatVectorPoint(c,v))},pivot=Object.freeze({x:c.box(0,1),y:c.point(0),z:c.point(0)}),t=[{x:10,y:-4,z:-4},{x:10,y:4,z:-4},{x:10,y:0,z:4}] as const;
  const receipt=encloseOriginalStationaryDistanceWrapperNull(c,boxed,pivot,t,.1,contract,profile);expect(receipt.conditionalFullWrapperNullCertified).toBe(true);expect(receipt.distance!.distance.lo).toBeGreaterThan(7);
  for(const x of [0,.5,1]){const p={x,y:0,z:0};expect(sweepOriginalConvexTriangleDistance(h,p,p,t,.1)).toBeNull();const actual=sweepOriginalConvexTriangleDistance(h,p,p,t,100);expect(actual).not.toBeNull();
   expect(c.contains(receipt.distance!.witnessA!.x,actual!.witnessA!.x)).toBe(true);expect(c.contains(receipt.distance!.witnessB!.x,actual!.witnessB!.x)).toBe(true);}
 });
 it('does not trust an incompatible or foreign supplied displacement',()=>{
  const c=new OriginalFloatIntervalContext(),a=point(c,0,0,0),b=point(c,1,0,0),d=point(c,0,1,0),e=point(c,1,1,0);
  expect(()=>encloseOriginalClosestSegments(c,a,b,d,e,undefined,point(c,99,0,0))).toThrow(UnsupportedFloatInterval);
  expect(()=>encloseOriginalClosestSegments(c,a,b,d,e,undefined,point(new OriginalFloatIntervalContext(),1,0,0))).toThrow(/foreign/);
 });
 it('charges refinement to the existing context and rejects overflow or exhausted work',()=>{
  const c=new OriginalFloatIntervalContext({operations:100}),a=point(c,0,0,0),b=point(c,1,0,0),o=point(c,0,0,0);
  expect(()=>{const u=sourceU(c,b,a,o);encloseOriginalClosestSegments(c,a,b,point(c,0,1,0),point(c,1,1,0),undefined,u);}).toThrow(UnsupportedFloatInterval);expect(c.resources().chargedOperations).toBeLessThanOrEqual(100);expect(c.resources().noBudgetReset).toBe(true);
  const huge=new OriginalFloatIntervalContext();expect(()=>huge.translatedSub(huge.point(Number.MAX_VALUE),huge.point(0),huge.point(Number.MAX_VALUE))).toThrow(UnsupportedFloatInterval);
 });
});
