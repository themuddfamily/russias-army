import {describe,expect,it} from 'vitest';
import {originalAngularConvex,type OriginalAngularBody} from './originalAngularBody';
import {OriginalFloatIntervalContext,UnsupportedFloatInterval,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint,type OriginalFloatVectorBox} from './originalFiniteFeatureInterval';
import {encloseOriginalAngularGeometry} from './originalAngularGeometryInterval';
import type {OriginalAngularMathContract,OriginalQuaternionInterval} from './originalAngularPoseInterval';

const reference=()=>({vertices:[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:2,z:0},{x:0,y:0,z:3}],
 faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],edgeDirections:[{x:1,y:2,z:3}],
 faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][]});
function q(c:OriginalFloatIntervalContext,x=0,y=0,z=0,w=1):OriginalQuaternionInterval{return Object.freeze({...originalFloatVectorPoint(c,{x,y,z}),w:c.point(w)});}
function scalar(a:OriginalFloatBox):number {if(a.lo!==a.hi)throw Error('point-only Math fixture');return a.lo;}
const pointMath:OriginalAngularMathContract={tag:'point-only runtime falsification',hypot:(c,v)=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}};
function contains(c:OriginalFloatIntervalContext,v:OriginalFloatVectorBox,p:{x:number;y:number;z:number}):void {
 for(const key of ['x','y','z'] as const)expect(c.contains(v[key],p[key])).toBe(true);expect(Object.isFrozen(v)).toBe(true);
}
describe('bounded conditional local angular geometry intervals',()=>{
 it('retains plus/minus identity coordinates and ordered frozen topology',()=>{
  for(const w of [1,-1]){const c=new OriginalFloatIntervalContext(),h=reference(),r=encloseOriginalAngularGeometry(c,h,q(c,0,0,0,w),pointMath);
   for(const key of ['vertices','faceNormals','edgeDirections'] as const)for(let i=0;i<h[key].length;i++)contains(c,r[key][i],h[key][i]);
   expect(r.faces).toEqual(h.faces);expect(Object.isFrozen(r.faces)).toBe(true);expect(Object.isFrozen(r.faces[0])).toBe(true);expect(Object.isFrozen(r.vertices)).toBe(true);
   expect(r.identityShortcut).toBe(true);expect(r.mathCalls).toBe(1);expect(r.closedManifoldCertified).toBe(false);
  }
 });
 it('matches analytic 180 degree X and Y rotations for vertices, normals and edges',()=>{
  for(const axis of ['x','y'] as const){const c=new OriginalFloatIntervalContext(),h=reference(),r=encloseOriginalAngularGeometry(c,h,axis==='x'?q(c,1,0,0,0):q(c,0,1,0,0),pointMath);
   for(const key of ['vertices','faceNormals','edgeDirections'] as const)for(let i=0;i<h[key].length;i++){
    const p=h[key][i];contains(c,r[key][i],axis==='x'?{x:p.x,y:-p.y,z:-p.z}:{x:-p.x,y:p.y,z:-p.z});
   }
   expect(r.identityShortcut).toBe(false);
  }
 });
 it('does not normalize valid nonunit quaternion coefficients with zero xyz',()=>{
  const c=new OriginalFloatIntervalContext(),h=reference(),r=encloseOriginalAngularGeometry(c,h,q(c,0,0,0,1+2**-22),pointMath);
  expect(r.identityShortcut).toBe(false);for(let i=0;i<h.vertices.length;i++)contains(c,r.vertices[i],h.vertices[i]);
  expect(r.orientation.w).toEqual({lo:1+2**-22,hi:1+2**-22});
 });
 it('encloses a whole quaternion interval including an uncertain identity branch under an explicit norm premise',()=>{
  const c=new OriginalFloatIntervalContext(),e=2**-12,orientation=Object.freeze({x:c.box(-e,e),y:c.point(0),z:c.point(0),w:c.point(1)});
  // True hypot( x,0,0,1 ) lies in [1,1+2^-24] for |x|<=2^-12.
  // This caller premise applies to the full tuple domain, not sampled angles.
  const contract:OriginalAngularMathContract={...pointMath,tag:'analytic bounded near-identity norm premise',hypot:(ctx,values)=>{
   expect(values[0]).toEqual({lo:-e,hi:e});return ctx.box(1,1+2**-24);
  }};
  const r=encloseOriginalAngularGeometry(c,reference(),orientation,contract);
  // For (0,2,0), exact source dyadic endpoints give y=2-4e²,z=±4e;
  // the interval graph retains the entire range and identity y=2,z=0.
  expect(r.vertices[2].z).toEqual({lo:-4*e,hi:4*e});expect(c.contains(r.vertices[2].y,2-4*e*e)).toBe(true);expect(c.contains(r.vertices[2].y,2)).toBe(true);
  expect(r.identityShortcut).toBe(false);expect(r.mathContractVerified).toBe(false);
 });
 it('agrees with fresh actual originalAngularConvex at an arbitrary valid point quaternion',()=>{
  const h=reference(),orientation={x:.1,y:.2,z:.3,w:Math.sqrt(.86)},state:OriginalAngularBody={orientation,angularVelocity:{x:0,y:0,z:0},centerOfMass:{x:0,y:0,z:0},
   inverseInertia:{xx:1,yy:1,zz:1,xy:0,xz:0,yz:0},referenceConvex:h};
  const actual=originalAngularConvex(state),c=new OriginalFloatIntervalContext(),r=encloseOriginalAngularGeometry(c,h,q(c,orientation.x,orientation.y,orientation.z,orientation.w),pointMath);
  for(const key of ['vertices','faceNormals','edgeDirections'] as const)for(let i=0;i<actual[key].length;i++)contains(c,r[key][i],actual[key][i]);
  expect(r.faces).toEqual(actual.faces); // Point agreement is falsification, not a whole-cell proof.
 });
 it('captures all coordinates and topology before a callback can mutate incoming references',()=>{
  const h=reference(),expected=reference(),c=new OriginalFloatIntervalContext(),orientation={...q(c)};
  const contract:OriginalAngularMathContract={...pointMath,hypot:(ctx,v)=>{
   h.vertices[1].x=999;h.faceNormals[0].x=999;h.edgeDirections[0].x=999;h.faces[0][0]=3;orientation.w=ctx.point(999);return pointMath.hypot(ctx,v);
  }};
  const r=encloseOriginalAngularGeometry(c,h,orientation,contract);
  for(const key of ['vertices','faceNormals','edgeDirections'] as const)for(let i=0;i<expected[key].length;i++)contains(c,r[key][i],expected[key][i]);
  expect(r.faces).toEqual(expected.faces);expect(r.orientation.w).toEqual({lo:1,hi:1});
 });
 it('rejects missing, malformed, sparse, accessor or custom-iterator topology and coordinates',()=>{
  const cases=[()=>{const h=reference();delete (h as {faces?:unknown}).faces;return h;},()=>{const h=reference();h.faces[0][0]=4;return h;},
   ()=>{const h=reference();delete h.vertices[1];return h;},()=>{const h=reference();Object.defineProperty(h.vertices[1],'x',{get:()=>1});return h;},
   ()=>{const h=reference();Object.defineProperty(h.vertices,Symbol.iterator,{value:function*(){yield h.vertices[0];}});return h;},
   ()=>{const h=reference();Object.defineProperty(h.vertices,'map',{value:()=>[]});return h;},
   ()=>{const h=reference();h.faces.pop();return h;},
   ()=>{const h=reference();Object.defineProperty(h.faces[0],0,{get:()=>0});return h;}];
  for(const make of cases){const c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalAngularGeometry(c,make(),q(c),pointMath)).toThrow(UnsupportedFloatInterval);}
 });
 it('rejects foreign quaternion boxes, invalid public norm and source intermediate overflow',()=>{
  let c=new OriginalFloatIntervalContext(),orientation={...q(c),x:new OriginalFloatIntervalContext().point(0)};
  expect(()=>encloseOriginalAngularGeometry(c,reference(),orientation,pointMath)).toThrow(/foreign/);
  c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalAngularGeometry(c,reference(),q(c,0,0,0,2),pointMath)).toThrow(/public-quaternion/);
  c=new OriginalFloatIntervalContext();const h=reference();h.vertices[2].y=Number.MAX_VALUE;
  expect(()=>encloseOriginalAngularGeometry(c,h,q(c,1,0,0,0),pointMath)).toThrow(UnsupportedFloatInterval);
 });
 it('allows only lower geometry caps and shares the unchanged scalar budget',()=>{
  let c=new OriginalFloatIntervalContext();expect(()=>encloseOriginalAngularGeometry(c,reference(),q(c),pointMath,{vertices:3})).toThrow(UnsupportedFloatInterval);
  expect(()=>encloseOriginalAngularGeometry(c,reference(),q(c),pointMath,{faces:1025})).toThrow(/caps-may-only-be-lowered/);
  c=new OriginalFloatIntervalContext({operations:40});expect(()=>encloseOriginalAngularGeometry(c,reference(),q(c,1,0,0,0),pointMath)).toThrow(/operation-cap/);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(40);
 });
});
