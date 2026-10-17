import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval} from './originalFloatInterval';
import {encloseOriginalClosestTriangle,encloseOriginalClosestSegments,originalFloatVectorPoint,type OriginalFloatVectorBox,type OriginalTriangleIntervalExit,type OriginalSegmentIntervalPath} from './originalFiniteFeatureInterval';

const point=(c:OriginalFloatIntervalContext,x:number,y:number,z=0)=>originalFloatVectorPoint(c,{x,y,z});
function contains(c:OriginalFloatIntervalContext,v:OriginalFloatVectorBox,expected:readonly number[]):void {
 for(const [i,key] of (['x','y','z'] as const).entries())expect(c.contains(v[key],expected[i])).toBe(true);
 expect(Object.isFrozen(v)).toBe(true);expect(Object.isFrozen(v.x)).toBe(true);
}
const triangle=(c:OriginalFloatIntervalContext)=>[point(c,0,0),point(c,1,0),point(c,0,1)] as const;

describe('bounded finite source feature witnesses',()=>{
 it('matches all seven independent exact-dyadic unit-triangle nearest points',()=>{
  // Orthogonal projection and the three closed unit-triangle edges give these
  // literal answers; every arithmetic intermediate in these fixtures is dyadic.
  const cases:readonly [OriginalTriangleIntervalExit,readonly number[],readonly number[]][]=[
   ['a',[-1,-1,1],[0,0,0]],['b',[2,0,1],[1,0,0]],['ab',[.5,-1,1],[.5,0,0]],
   ['c',[0,2,1],[0,1,0]],['ac',[-1,.5,1],[0,.5,0]],['bc',[1,1,1],[.5,.5,0]],['face',[.25,.25,1],[.25,.25,0]],
  ];
  for(const [exit,p,w] of cases){const c=new OriginalFloatIntervalContext(),r=encloseOriginalClosestTriangle(c,point(c,p[0],p[1],p[2]),triangle(c));
   expect(r.exits).toEqual([exit]);contains(c,r.witness,w);
   for(const [i,key] of (['x','y','z'] as const).entries())expect(r.witness[key]).toEqual({lo:w[i],hi:w[i]});
   expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.exits)).toBe(true);
  }
 });
 it('retains both feasible edge and face continuations across a boxed boundary',()=>{
  const c=new OriginalFloatIntervalContext(),p=Object.freeze({x:c.box(-.125,.125),y:c.point(.25),z:c.point(1)});
  const r=encloseOriginalClosestTriangle(c,p,triangle(c));expect(r.exits).toEqual(['ac','face']);
  // Exact nearest points for the complete x interval have x=max(0,x), y=1/4.
  expect(r.witness.x.lo).toBeLessThanOrEqual(0);expect(r.witness.x.hi).toBeGreaterThanOrEqual(.125);
  contains(c,r.witness,[0,.25,0]);contains(c,r.witness,[.125,.25,0]);
 });
 it('fails a reachable degenerate quotient but permits a source vertex early exit',()=>{
  const c=new OriginalFloatIntervalContext(),t=[point(c,0,0),point(c,0,0),point(c,0,1)] as const;
  expect(()=>encloseOriginalClosestTriangle(c,point(c,0,.5,1),t)).toThrow(UnsupportedFloatInterval);
  const d=new OriginalFloatIntervalContext(),z=point(d,0,0);
  expect(encloseOriginalClosestTriangle(d,z,[z,z,z]).exits).toEqual(['a']);
 });
 it('accepts matching cached source edges and rejects an incompatible cached difference',()=>{
  const c=new OriginalFloatIntervalContext(),edges={ab:point(c,1,0),ac:point(c,0,1),bc:point(c,-1,1)};
  contains(c,encloseOriginalClosestTriangle(c,point(c,.25,.25,1),triangle(c),edges).witness,[.25,.25,0]);
  expect(()=>encloseOriginalClosestTriangle(c,point(c,.25,.25,1),triangle(c),{...edges,ab:point(c,2,0)})).toThrow(UnsupportedFloatInterval);
  const a=point(c,0,0),b=point(c,1,0),start=point(c,0,1),end=point(c,1,1),cached={v:point(c,1,0),cc:c.point(1)};
  const segment=encloseOriginalClosestSegments(c,a,b,start,end,cached);contains(c,segment.first,[0,0,0]);contains(c,segment.second,[0,1,0]);
  expect(()=>encloseOriginalClosestSegments(c,a,b,start,end,{...cached,v:point(c,2,0)})).toThrow(UnsupportedFloatInterval);
  expect(()=>encloseOriginalClosestSegments(c,a,b,start,end,{...cached,cc:c.point(2)})).toThrow(UnsupportedFloatInterval);
 });
 it('matches analytic zero, parallel, interior and endpoint segment witnesses',()=>{
  const cases:readonly [OriginalSegmentIntervalPath,readonly number[][],readonly number[],readonly number[]][]=[
   ['both-zero',[[1,2,3],[1,2,3],[4,5,6],[4,5,6]],[1,2,3],[4,5,6]],
   ['first-zero',[[0,.5,0],[0,.5,0],[0,0,0],[0,1,0]],[0,.5,0],[0,.5,0]],
   ['second-zero',[[0,0,0],[1,0,0],[.5,1,0],[.5,1,0]],[.5,0,0],[.5,1,0]],
   ['parallel-interior',[[0,0,0],[1,0,0],[0,1,0],[1,1,0]],[0,0,0],[0,1,0]],
   ['parallel-low',[[0,0,0],[1,0,0],[2,1,0],[3,1,0]],[1,0,0],[2,1,0]],
   ['parallel-high',[[0,0,0],[1,0,0],[-3,1,0],[-2,1,0]],[0,0,0],[-2,1,0]],
   ['nonparallel-interior',[[-1,0,0],[1,0,0],[0,-1,1],[0,1,1]],[0,0,0],[0,0,1]],
   ['nonparallel-low',[[0,0,0],[1,0,0],[2,1,0],[2,2,0]],[1,0,0],[2,1,0]],
   ['nonparallel-high',[[0,0,0],[1,0,0],[2,-2,0],[2,-1,0]],[1,0,0],[2,-1,0]],
  ];
  for(const [path,points,x,y] of cases){const c=new OriginalFloatIntervalContext(),p=points.map(v=>point(c,v[0],v[1],v[2]));
   const r=encloseOriginalClosestSegments(c,p[0],p[1],p[2],p[3]);expect(r.paths).toEqual([path]);contains(c,r.first,x);contains(c,r.second,y);
   expect(Object.isFrozen(r.paths)).toBe(true);
  }
 });
 it('unions boxed segment endpoint and interior alternatives without assuming an ideal minimizer',()=>{
  const c=new OriginalFloatIntervalContext(),start=Object.freeze({x:c.point(0),y:c.box(-.125,.125),z:c.point(1)});
  const r=encloseOriginalClosestSegments(c,point(c,-1,0),point(c,1,0),start,point(c,0,1,1));
  expect(r.paths).toEqual(['nonparallel-low','nonparallel-interior']);contains(c,r.first,[0,0,0]);
  contains(c,r.second,[0,0,1]);contains(c,r.second,[0,.125,1]);
 });
 it('fails conditioning before clamp can conceal a nonfinite reachable division',()=>{
  const c=new OriginalFloatIntervalContext(),b=Object.freeze({x:c.box(0,1),y:c.point(0),z:c.point(0)});
  expect(()=>encloseOriginalClosestSegments(c,point(c,0,0),b,point(c,2,1),point(c,3,1))).toThrow(UnsupportedFloatInterval);
 });
 it('rejects overflowing source differences and foreign input boxes',()=>{
  const c=new OriginalFloatIntervalContext();
  expect(()=>encloseOriginalClosestTriangle(c,point(c,0,0),[point(c,-Number.MAX_VALUE,0),point(c,Number.MAX_VALUE,0),point(c,0,1)])).toThrow(UnsupportedFloatInterval);
  const foreign=new OriginalFloatIntervalContext().point(0),p={x:foreign,y:c.point(0),z:c.point(0)};
  expect(()=>encloseOriginalClosestTriangle(c,p,triangle(c))).toThrow(/foreign/);
 });
 it('stops at a lowerable shared operation budget without resetting counters',()=>{
  const c=new OriginalFloatIntervalContext({operations:200}),p=point(c,.25,.25,1),t=triangle(c);
  expect(()=>encloseOriginalClosestTriangle(c,p,t)).toThrow(/operation-cap/);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(200);expect(c.resources().noBudgetReset).toBe(true);
 });
});
