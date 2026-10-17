import {describe,expect,it} from 'vitest';
import {createOriginalReceiverSceneRay,ORIGINAL_RECEIVER_SCENE_LAYERS,type OriginalReceiverRayModel,type OriginalReceiverRayCoverage} from './originalReceiverSceneRay';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const model=(handle:string,y:number,extra:Partial<OriginalReceiverRayModel>={}):OriginalReceiverRayModel=>({handle,layer:'fixed',inWorld:true,groupAncestry:['world'],geometryProvenance:'fixture-triangle',positions:[[-2,y,-2],[0,y,2],[2,y,-2]],faces:[[0,1,2]],worldMatrix:identity,sidedness:'double',...extra});
const coverage=(models:readonly OriginalReceiverRayModel[],extra:Partial<OriginalReceiverRayCoverage>={}):OriginalReceiverRayCoverage=>({sceneGeneration:7,callback:13,expectedHandles:models.map(m=>m.handle),accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[],...extra});
const ray=(models:readonly OriginalReceiverRayModel[],extra:Partial<OriginalReceiverRayCoverage>={})=>createOriginalReceiverSceneRay(models,coverage(models,extra),{maxModels:32,maxTriangles:64,maxVertices:192});

describe('complete admitted receiver ray foundation (synthetic meshes, no native sidedness claim)',()=>{
 it('retains unbounded downward nearest hits farther than the former 300-unit default',()=>{
  const r=ray([model('far',-1000),model('nearest',-401)]),hit=r.nearestDetailedDownward({x:0,y:0,z:0});
  expect(hit).toMatchObject({handle:'nearest',distance:401,point:{x:0,y:-401,z:0},faceIndex:0,geometryProvenance:'fixture-triangle'});
  expect(r.nearestDetailed({x:0,y:0,z:0},{x:0,y:-1,z:0},{maxDistance:300})).toBeNull();
 });
 it('uses the nearest gun for downward birth but removes any gsmokes descendant from bullet queries',()=>{
  const r=ray([model('floor',-10),model('held',-2,{layer:'held-gun',groupAncestry:['world','smokes','weapon']}),model('dropped',-3,{layer:'dropped-gun',groupAncestry:['world','GSMOKES']})]);
  expect(r.nearestDetailedDownward({x:0,y:0,z:0})!.handle).toBe('held');
  expect(r.nearestDetailed({x:0,y:0,z:0},{x:0,y:-7,z:0},{bullet:true})!.handle).toBe('floor');
 });
 it('fade birth excludes only its own model handle and retains another corpse and just-written dropped gun',()=>{
  const r=ray([model('own-gi',-1,{layer:'pending-death-gi'}),model('gun',-2,{layer:'dropped-gun',groupAncestry:['gsmokes']}),model('other-corpse',-3,{layer:'corpse'})]);
  expect(r.nearestDetailedDownward({x:0,y:0,z:0},{excludeHandle:'own-gi'})!.handle).toBe('gun');
  expect(r.nearestDetailed({x:0,y:0,z:0},{x:0,y:-1,z:0},{excludeHandle:'own-gi',bullet:true})!.handle).toBe('other-corpse');
 });
 it.each(ORIGINAL_RECEIVER_SCENE_LAYERS)('admits the %s layer independently of collision interest',layer=>{
  const r=ray([model('admitted',-1,{layer})]);expect(r.nearestDetailedDownward({x:0,y:0,z:0})!.layer).toBe(layer);
 });
 it('requires the complete inventory and all accounted layers, without world-only fallback',()=>{
  const models=[model('floor',-1)];
  expect(()=>ray(models,{unresolved:['projectile mesh unavailable']})).toThrow('Incomplete receiver scene coverage');
  expect(()=>ray(models,{accountedLayers:['fixed']})).toThrow('Incomplete receiver scene layer inventory');
  expect(()=>ray(models,{expectedHandles:['floor','missing-gun']})).toThrow('inventory');
  expect(()=>ray([model('empty',-1,{positions:[],faces:[]})])).toThrow('Missing receiver scene model geometry');
 });
 it('keeps receiver snapshots detached and private across geometry and ancestry mutation',()=>{
  const vertices=[[-2,-2,-2],[0,-2,2],[2,-2,-2]],ancestry=['world'];const matrix=[...identity];
  const m=model('moving',-2,{positions:vertices,groupAncestry:ancestry,worldMatrix:matrix}),a=ray([m]);
  vertices.forEach(p=>p[1]=-20);ancestry.push('gsmokes');matrix[13]=4;const b=ray([m]);
  expect(a.nearestDetailedDownward({x:0,y:0,z:0})!.point.y).toBe(-2);
  expect(a.nearestDetailed({x:0,y:0,z:0},{x:0,y:-1,z:0},{bullet:true})!.handle).toBe('moving');
  expect(b.nearestDetailedDownward({x:0,y:0,z:0})!.point.y).toBe(-16);
  expect(b.nearestDetailed({x:0,y:0,z:0},{x:0,y:-1,z:0},{bullet:true})).toBeNull();
 });
 it('accounts for outside-world models but excludes them from ray membership',()=>{
  const r=ray([model('retired',-1,{inWorld:false}),model('live',-5)]);expect(r.modelCount).toBe(2);expect(r.triangleCount).toBe(1);
  expect(r.nearestDetailedDownward({x:0,y:0,z:0})!.handle).toBe('live');
 });
 it('rejects malformed geometry and transport budget exhaustion',()=>{
  const models=[model('floor',-1)];
  expect(()=>createOriginalReceiverSceneRay(models,coverage(models),{maxModels:1,maxTriangles:1,maxVertices:2})).toThrow('vertex budget');
  expect(()=>ray([model('bad',-1,{faces:[[0,1,3]]})])).toThrow('Invalid receiver scene face');
 });
 it('treats valid zero-area faces as nonintersectable while preserving sibling face indices',()=>{
  const degenerate=ray([model('zero',-1,{positions:[[0,0,0],[0,0,0],[0,0,0]]})]);
  expect(degenerate.nearestDetailedDownward({x:0,y:2,z:0})).toBeNull();
  const mixed=ray([model('mixed',-2,{positions:[[0,0,0],[-2,-2,-2],[0,-2,2],[2,-2,-2]],faces:[[0,0,0],[1,2,3]]})]);
  expect(mixed.nearestDetailedDownward({x:0,y:0,z:0})).toMatchObject({handle:'mixed',faceIndex:1,distance:2,point:{x:0,y:-2,z:0}});
  // Degenerate faces still require valid indices and finite coordinates.
  expect(()=>ray([model('bad-zero',-1,{positions:[[NaN,0,0],[0,0,0],[0,0,0]]})])).toThrow('Invalid receiver scene vertex');
  expect(()=>ray([model('bad-zero',-1,{faces:[[0,0,3]]})])).toThrow('Invalid receiver scene face');
 });
});
