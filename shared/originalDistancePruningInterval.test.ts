import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {encloseOriginalDistancePadding,encloseOriginalPointBound,encloseOriginalEdgeBound,encloseOriginalPruningDecision,type OriginalDistanceSourceBounds} from './originalDistancePruningInterval';
const box=(c:OriginalFloatIntervalContext,lo:number,hi:number):OriginalDistanceSourceBounds=>Object.freeze({minX:c.point(lo),maxX:c.point(hi),minY:c.point(0),maxY:c.point(0),minZ:c.point(0),maxZ:c.point(0)});
describe('conditional source distance padding and pruning arithmetic',()=>{
 it('preserves exact padding scale and source max including the offset squared graph',()=>{
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalDistancePadding(c,c.point(4),c.point(9),originalFloatVectorPoint(c,{x:3,y:4,z:0}));
  expect(r).toEqual({lo:25*2**-46,hi:25*2**-46});
  const range=encloseOriginalDistancePadding(c,c.box(1,2),c.point(0),Object.freeze({x:c.box(0,2),y:c.point(0),z:c.point(0)}));
  expect(range).toEqual({lo:2**-46,hi:4*2**-46});
 });
 it('uses nonnegative source point gaps and left-associated source squared distance',()=>{
  const c=new OriginalFloatIntervalContext(),bounds={...box(c,0,1),minY:c.point(0),maxY:c.point(1)};
  expect(encloseOriginalPointBound(c,originalFloatVectorPoint(c,{x:4,y:5,z:0}),bounds)).toEqual({lo:25,hi:25});
  expect(encloseOriginalPointBound(c,originalFloatVectorPoint(c,{x:.5,y:.5,z:0}),bounds)).toEqual({lo:0,hi:0});
 });
 it('encloses nonpoint bound tuples without treating their endpoints as ideal geometry',()=>{
  const c=new OriginalFloatIntervalContext(),r=encloseOriginalPointBound(c,Object.freeze({x:c.box(2,3),y:c.point(0),z:c.point(0)}),{...box(c,0,1),maxX:c.box(1,2)});
  expect(r).toEqual({lo:0,hi:4});
 });
 it('retains source edge-bound addition before subtraction under cancellation',()=>{
  const c=new OriginalFloatIntervalContext(),huge=2**53,offset=originalFloatVectorPoint(c,{x:huge,y:0,z:0});
  expect(encloseOriginalEdgeBound(c,box(c,1,1),box(c,huge,huge),offset)).toEqual({lo:0,hi:0});
  expect((1+huge)-huge).toBe(0);expect((1-huge)+huge).toBe(1);
  const ordinary=encloseOriginalEdgeBound(c,box(c,0,1),box(c,5,6),originalFloatVectorPoint(c,{x:1,y:0,z:0}));expect(ordinary).toEqual({lo:9,hi:9});
 });
 it('keeps equality after the actual rounded best-plus-padding operation',()=>{
  const c=new OriginalFloatIntervalContext(),padding=encloseOriginalDistancePadding(c,c.point(1.5),c.point(0),originalFloatVectorPoint(c,{x:0,y:0,z:0}));
  const bound=c.point(128+2**-45),best=c.point(128);expect(128+padding.lo).toBe(bound.lo);
  for(const kind of ['forward','reverse','edge'] as const)expect(encloseOriginalPruningDecision(c,bound,best,padding,kind).action).toBe('evaluate');
 });
 it('keeps unknown source guards and distinguishes strict reverse from forward/edge comparison',()=>{
  const c=new OriginalFloatIntervalContext(),best=c.point(4),padding=c.point(0);
  for(const kind of ['forward','reverse','edge'] as const){
   expect(encloseOriginalPruningDecision(c,c.point(5),best,padding,kind).action).toBe('skip');
   const unknown=encloseOriginalPruningDecision(c,c.box(3,5),best,padding,kind);expect(unknown.sourceGuard).toBe('unknown');expect(unknown.mustRetainCandidate).toBe(true);
  }
 });
 it('represents only the exact initial positive-infinity best by its explicit sentinel',()=>{
  const c=new OriginalFloatIntervalContext();for(const kind of ['forward','reverse','edge'] as const){
   const r=encloseOriginalPruningDecision(c,c.point(100),null,c.point(1),kind);expect(r.action).toBe('evaluate');expect(r.initialInfinityBest).toBe(true);
   expect(r.candidateDistanceCertified).toBe(false);expect(r.globalBestCertified).toBe(false);expect(r.wrapperExclusionCertified).toBe(false);
  }
 });
 it('rejects unsafe source nodes, foreign boxes, malformed bounds and shared cap exhaustion',()=>{
  let c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalDistancePadding(c,c.point(0),c.point(0),originalFloatVectorPoint(c,{x:Number.MAX_VALUE,y:0,z:0}))).toThrow(UnsupportedFloatInterval);
  c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalPruningDecision(c,c.point(1),c.point(Number.MAX_VALUE),c.point(Number.MAX_VALUE),'forward')).toThrow(UnsupportedFloatInterval);
  expect(()=>encloseOriginalPointBound(c,originalFloatVectorPoint(c,{x:0,y:0,z:0}),{...box(c,0,1),minX:new OriginalFloatIntervalContext().point(0)})).toThrow(/foreign/);
  const accessor=Object.defineProperty({...box(c,0,1)},'minX',{get:()=>c.point(0)});expect(()=>encloseOriginalPointBound(c,originalFloatVectorPoint(c,{x:0,y:0,z:0}),accessor)).toThrow(/accessors/);
  const small=new OriginalFloatIntervalContext({operations:30}),bounds=box(small,0,1),p=originalFloatVectorPoint(small,{x:0,y:0,z:0});expect(()=>encloseOriginalPointBound(small,p,bounds)).toThrow(/operation-cap/);
  expect(small.resources().chargedOperations).toBeLessThanOrEqual(30);expect(small.resources().noBudgetReset).toBe(true);
 });
});
