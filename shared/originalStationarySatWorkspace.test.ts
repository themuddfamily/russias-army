import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {createOriginalStationarySatWorkspace,encloseOriginalStationarySatNull} from './originalStationarySatInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {Vec3} from './protocol';

const zero={x:0,y:0,z:0};
const triangle=(x:number):[Vec3,Vec3,Vec3]=>[{x,y:-2,z:-2},{x,y:2,z:-2},{x,y:0,z:2}];
const shape=(c:OriginalFloatIntervalContext)=>({
 vertices:Array.from({length:8},(_,i)=>originalFloatVectorPoint(c,{x:i&1?1:0,y:i&2?1:0,z:i&4?1:0})),
 faceNormals:[{x:0,y:0,z:1},{x:0,y:1,z:0},{x:1,y:0,z:0}].map(v=>originalFloatVectorPoint(c,v)),
 edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}].map(v=>originalFloatVectorPoint(c,v))});
const scalar=(v:OriginalFloatBox)=>{if(v.lo!==v.hi)throw Error('point-only fixture');return v.lo;};
const math:OriginalAngularMathContract=Object.freeze({tag:'conditional point-tuple workspace fixture',
 hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),
 sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});

describe('same-context stationary SAT workspace',()=>{
 it('lazily reuses three reached hull axes across all32 distinct triangles in original order',()=>{
  const c=new OriginalFloatIntervalContext();let calls=0;
  const contract=Object.freeze({...math,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{calls++;return math.hypot(ctx,v);}});
  const workspace=createOriginalStationarySatWorkspace(c,shape(c),originalFloatVectorPoint(c,zero),contract);
  expect(calls).toBe(0);
  for(let i=0;i<32;i++){
   const r=workspace.encloseTriangle(triangle(10+i));
   expect(r.certifiedNull).toBe(true);expect(r.separatorIndex).toBe(2);
   expect(r.constructedAxes).toBe(13);expect(r.mathCalls).toBe(i===0?3:0);
   expect(r.reusedHullAxes).toBe(i===0?0:3);expect(r.genericEagerAxesValidated).toBe(true);
  }
  expect(calls).toBe(3);expect(c.resources().noBudgetReset).toBe(true);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(100000);
  expect(c.resources().createdBoxes).toBeLessThanOrEqual(16384);
 });
 it('preserves fresh legacy entries and triangle-specific separation after hull axes are cached',()=>{
  const c=new OriginalFloatIntervalContext(),h=shape(c),pivot=originalFloatVectorPoint(c,zero),workspace=createOriginalStationarySatWorkspace(c,h,pivot,math);
  expect(workspace.encloseTriangle(triangle(10)).certifiedNull).toBe(true);
  const overlap=workspace.encloseTriangle(triangle(.5));expect(overlap.certifiedNull).toBe(false);
  expect(overlap.mathCalls).toBeGreaterThan(0);expect(overlap.reusedHullAxes).toBe(3);
  expect(encloseOriginalStationarySatNull(c,h,pivot,triangle(10),math).mathCalls).toBe(3);
 });
 it('snapshots shape and each triangle before callbacks; later triangle data remains fresh',()=>{
  const c=new OriginalFloatIntervalContext(),h=shape(c),t=triangle(10);
  const contract=Object.freeze({...math,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{
   t[0].x=-999;h.faceNormals[2]=originalFloatVectorPoint(ctx,{x:0,y:0,z:0});return math.hypot(ctx,v);
  }});
  const workspace=createOriginalStationarySatWorkspace(c,h,originalFloatVectorPoint(c,zero),contract);
  h.vertices[0]=originalFloatVectorPoint(c,{x:999,y:999,z:999});
  expect(workspace.encloseTriangle(t).certifiedNull).toBe(true);
  expect(workspace.encloseTriangle(triangle(.5)).certifiedNull).toBe(false);
 });
 it('replays unknown skip alternatives without treating a cached unknown hull axis as a separator',()=>{
  const c=new OriginalFloatIntervalContext(),h=shape(c);h.faceNormals=[originalFloatVectorPoint(c,{x:1e-12,y:0,z:0})];
  const contract=Object.freeze({...math,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>scalar(v[0])===1e-12&&scalar(v[1])===0&&scalar(v[2])===0?ctx.box(.5e-12,1.5e-12):math.hypot(ctx,v)});
  const workspace=createOriginalStationarySatWorkspace(c,h,originalFloatVectorPoint(c,zero),contract);
  const a=workspace.encloseTriangle(triangle(10)),b=workspace.encloseTriangle(triangle(20));
  expect(a.certifiedNull).toBe(true);expect(b.certifiedNull).toBe(true);
  expect(a.separatorIndex).toBe(1);expect(b.separatorIndex).toBe(1);
  expect(b.unknownAxisSkips).toBe(1);expect(b.reusedHullAxes).toBe(1);expect(b.mathCalls).toBe(1);
 });
 it('checks every new triangle eager cross before using a previously cached separator',()=>{
  const c=new OriginalFloatIntervalContext(),h=shape(c);h.edgeDirections=[originalFloatVectorPoint(c,{x:0,y:1e308,z:0})];
  const workspace=createOriginalStationarySatWorkspace(c,h,originalFloatVectorPoint(c,zero),math);
  const small:[Vec3,Vec3,Vec3]=[{x:10,y:0,z:0},{x:10,y:.1,z:0},{x:10,y:0,z:.1}];
  expect(workspace.encloseTriangle(small).certifiedNull).toBe(true);
  expect(()=>workspace.encloseTriangle(triangle(10))).toThrow(/primitive-overflow/);
 });
 it('does not cache incomplete hull proofs and releases busy state after failure',()=>{
  const c=new OriginalFloatIntervalContext();let fail=true,calls=0;
  const contract=Object.freeze({...math,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{calls++;if(fail)throw Error('first callback failure');return math.hypot(ctx,v);}});
  const workspace=createOriginalStationarySatWorkspace(c,shape(c),originalFloatVectorPoint(c,zero),contract);
  expect(()=>workspace.encloseTriangle(triangle(10))).toThrow(/contract-threw/);fail=false;
  const r=workspace.encloseTriangle(triangle(10));expect(r.certifiedNull).toBe(true);expect(r.reusedHullAxes).toBe(0);expect(calls).toBe(4);
 });
 it('rejects callback reentry without clearing the active invocation guard',()=>{
  const c=new OriginalFloatIntervalContext();let workspace:ReturnType<typeof createOriginalStationarySatWorkspace>,attempts=0;
  const contract=Object.freeze({...math,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{
   attempts++;expect(()=>workspace.encloseTriangle(triangle(20))).toThrow(/reentry/);
   expect(()=>workspace.encloseTriangle(triangle(30))).toThrow(/reentry/);return math.hypot(ctx,v);
  }});
  workspace=createOriginalStationarySatWorkspace(c,shape(c),originalFloatVectorPoint(c,zero),contract);
  expect(workspace.encloseTriangle(triangle(10)).certifiedNull).toBe(true);expect(attempts).toBe(3);
  expect(workspace.encloseTriangle(triangle(20)).mathCalls).toBe(0);
 });
 it('keeps degenerate early return, per-invocation actual callback caps and inherited context caps',()=>{
  let c=new OriginalFloatIntervalContext(),workspace=createOriginalStationarySatWorkspace(c,shape(c),originalFloatVectorPoint(c,zero),math,{mathCalls:1});
  const line:[Vec3,Vec3,Vec3]=[{x:5,y:0,z:0},{x:6,y:0,z:0},{x:7,y:0,z:0}];
  expect(workspace.encloseTriangle(line).mathCalls).toBe(0);
  expect(()=>workspace.encloseTriangle(triangle(10))).toThrow(/math-call-cap/);
  c=new OriginalFloatIntervalContext({operations:500});workspace=createOriginalStationarySatWorkspace(c,shape(c),originalFloatVectorPoint(c,zero),math);
  expect(()=>workspace.encloseTriangle(triangle(10))).toThrow(/operation-cap/);
  expect(c.resources().chargedOperations).toBeLessThanOrEqual(500);
 });
});
