import {describe,expect,it} from 'vitest';
import {OriginalFloatIntervalContext,type OriginalFloatBox} from './originalFloatInterval';
import {originalFloatVectorPoint} from './originalFiniteFeatureInterval';
import {createOriginalStationaryDistanceWrapperWorkspace,encloseOriginalStationaryDistanceWrapperNull} from './originalStationaryDistanceWrapperInterval';
import type {OriginalAngularMathContract} from './originalAngularPoseInterval';
import type {OriginalSeparatedDistanceSourceProfile} from './originalSeparatedDistanceInterval';

const zero={x:0,y:0,z:0};
const profile:OriginalSeparatedDistanceSourceProfile=Object.freeze({tag:'conditional workspace root/cache',arithmetic:'separate-rn-binary64-gradual-underflow',sqrt:'correctly-rounded-source-Math.sqrt',cache:'ordinary-immutable-equivalent-source-caches'});
const scalar=(v:OriginalFloatBox)=>{if(v.lo!==v.hi)throw Error('point-only workspace fixture');return v.lo;};
const math:OriginalAngularMathContract=Object.freeze({tag:'point-only Math source falsification',hypot:(c:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>c.point(Math.hypot(...v.map(scalar))),sin:()=>{throw Error('unused');},cos:()=>{throw Error('unused');}});
const triangle=(x=3)=>[{x,y:-4,z:-4},{x,y:4,z:-4},{x,y:0,z:4}] as const;
function shape(c:OriginalFloatIntervalContext){return {vertices:[zero,{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}].map(v=>originalFloatVectorPoint(c,v)),faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]] as [number,number,number][],
 faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}].map(v=>originalFloatVectorPoint(c,v)),edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}].map(v=>originalFloatVectorPoint(c,v))};}

describe('private SAME-context stationary hull feature workspace',()=>{
 it('retains fresh-wrapper receipts exactly for the first workspace call',()=>{
  const c=new OriginalFloatIntervalContext(),a=shape(c),workspace=createOriginalStationaryDistanceWrapperWorkspace(c,a,originalFloatVectorPoint(c,zero),math,profile),first=workspace.encloseTriangle(triangle(),.1);
  const d=new OriginalFloatIntervalContext(),fresh=encloseOriginalStationaryDistanceWrapperNull(d,shape(d),originalFloatVectorPoint(d,zero),triangle(),.1,math,profile);
  expect(first).toEqual(fresh);expect(first.preparationCalls).toBe(1);expect(first.preparationReused).toBe(false);expect(first.workspacePreparationCalls).toBe(1);
 });
 it('prepares one immutable local hull theorem and still checks every new triangle independently',()=>{
  const c=new OriginalFloatIntervalContext(),workspace=createOriginalStationaryDistanceWrapperWorkspace(c,shape(c),originalFloatVectorPoint(c,zero),math,profile),first=workspace.encloseTriangle(triangle(3),.1),before=c.resources(),second=workspace.encloseTriangle(triangle(4),.1);
  expect(first.conditionalFullWrapperNullCertified).toBe(true);expect(second.conditionalFullWrapperNullCertified).toBe(true);expect(second.preparationCalls).toBe(0);expect(second.preparationReused).toBe(true);expect(second.workspacePreparationCalls).toBe(1);
  expect(first.mathCalls).toBe(6);expect(second.mathCalls).toBe(1);expect(second.distance!.distance).toEqual({lo:3,hi:3});expect(c.resources().chargedOperations).toBeGreaterThan(before.chargedOperations);
  const intersecting=workspace.encloseTriangle(triangle(.5),.1);expect(intersecting.conditionalFullWrapperNullCertified).toBe(false);expect(intersecting.preparationReused).toBe(true);expect(intersecting.distance).toBeUndefined();
 });
 it('keeps feature preparation lazy through zero-skin and outer-degenerate source dispatch',()=>{
  const c=new OriginalFloatIntervalContext(),workspace=createOriginalStationaryDistanceWrapperWorkspace(c,shape(c),originalFloatVectorPoint(c,zero),math,profile);
  const sat=workspace.encloseTriangle(triangle(),0),degenerate=workspace.encloseTriangle([zero,{x:1,y:0,z:0},{x:2,y:0,z:0}],.1);
  for(const r of [sat,degenerate]){expect(r.conditionalFullWrapperNullCertified).toBe(true);expect(r.workspacePreparationCalls).toBe(0);expect(r.preparationCalls).toBe(0);expect(r.preparationReused).toBe(false);}
  expect(workspace.encloseTriangle(triangle(),.1).preparationCalls).toBe(1);
 });
 it('binds capture before callbacks and never accepts caller-provided preparation or mutable replacements',()=>{
  const c=new OriginalFloatIntervalContext(),input=shape(c),workspace=createOriginalStationaryDistanceWrapperWorkspace(c,input,originalFloatVectorPoint(c,zero),math,profile);
  input.vertices[1]=originalFloatVectorPoint(c,{x:99,y:0,z:0});input.faces[0][0]=99;
  const r=workspace.encloseTriangle(triangle(),.1);expect(r.conditionalFullWrapperNullCertified).toBe(true);expect(r.distance!.distance).toEqual({lo:2,hi:2});expect(workspace.metadata.callerPreparedDataAccepted).toBe(false);expect(workspace.metadata.sourceCacheAttested).toBe(false);
 });
 it('retains per-call lowerable limits, foreign ownership rejection and cumulative context work',()=>{
  const c=new OriginalFloatIntervalContext(),a=shape(c),workspace=createOriginalStationaryDistanceWrapperWorkspace(c,a,originalFloatVectorPoint(c,zero),math,profile,{mathCalls:1});
  expect(()=>workspace.encloseTriangle(triangle(),.1)).toThrow(/Math-call-cap/);
  const zeroSkin=workspace.encloseTriangle(triangle(),0);expect(zeroSkin.workspacePreparationCalls).toBe(0);expect(zeroSkin.mathCalls).toBe(1);expect(c.resources().noBudgetReset).toBe(true);
  expect(()=>createOriginalStationaryDistanceWrapperWorkspace(c,a,originalFloatVectorPoint(new OriginalFloatIntervalContext(),zero),math,profile)).toThrow(/foreign/);
  expect(()=>createOriginalStationaryDistanceWrapperWorkspace(c,a,originalFloatVectorPoint(c,zero),math,profile,{faces:3}).encloseTriangle(triangle(),.1)).toThrow();
 });
 it('rejects reentry without publishing partial preparation and releases its guard after failure',()=>{
  const c=new OriginalFloatIntervalContext();let nested=true;let workspace:ReturnType<typeof createOriginalStationaryDistanceWrapperWorkspace>;
  const reentry=Object.freeze({...math,hypot:(ctx:OriginalFloatIntervalContext,v:readonly OriginalFloatBox[])=>{if(nested)workspace.encloseTriangle(triangle(),.1);return math.hypot(ctx,v);}});
  workspace=createOriginalStationaryDistanceWrapperWorkspace(c,shape(c),originalFloatVectorPoint(c,zero),reentry,profile);
  expect(()=>workspace.encloseTriangle(triangle(),.1)).toThrow(/reentry/);nested=false;const r=workspace.encloseTriangle(triangle(),.1);expect(r.conditionalFullWrapperNullCertified).toBe(true);expect(r.preparationCalls).toBe(1);expect(r.workspacePreparationCalls).toBe(1);
 });
});
