import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {OriginalSceneData,OriginalSceneMesh,OriginalSceneNode} from './originalSceneGeometry';
import {createOriginalReceiverImportedScene} from './originalReceiverImportedScene';
import {createOriginalReceiverSceneRay,ORIGINAL_RECEIVER_SCENE_LAYERS,type OriginalReceiverRayModel} from './originalReceiverSceneRay';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix=(z=0,x=0)=>{const m=[...identity];m[12]=x;m[14]=z;return m;};
const mesh=(resource='floor',part=0,z=0):OriginalSceneMesh=>({resource,part,positions:[[-2,-2,z],[2,-2,z],[0,2,z]],faces:[[0,1,2]],normals:[],tex_coords:[]});
const node=(name:string,resource:string,parent='',z=0,visibility=1):OriginalSceneNode=>({name,resource,parent,matrix:matrix(z),visibility,shader:''});
const options={scale:1,geometryProvenance:'synthetic-decoded-scene-fixture',sidedness:'double' as const,maxModels:32,maxVertices:256,maxFaces:128};
const ray=(models:readonly OriginalReceiverRayModel[])=>createOriginalReceiverSceneRay(models,{sceneGeneration:1,callback:0,expectedHandles:models.map(m=>m.handle),accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]},{maxModels:32,maxTriangles:128,maxVertices:256});

describe('imported receiver scene adapter (imported subset only; no complete receiver inventory claim)',()=>{
 it('includes invisible geometry below smokes for downward rays while bullet rays exclude it',()=>{
  const data:OriginalSceneData={meshes:[mesh('near'),mesh('far')],nodes:[node('smokes',''),node('invisible-gun','near','smokes',5,0),node('floor','far','',0)]};
  const snapshot=createOriginalReceiverImportedScene(data,options).snapshot();expect(snapshot.scope).toBe('imported-scene-only');expect(snapshot.missing).toEqual([]);
  expect(snapshot.models.find(m=>m.handle==='invisible-gun')).toMatchObject({inWorld:true,groupAncestry:expect.arrayContaining(['smokes'])});
  const r=ray(snapshot.models);expect(r.nearestDetailedDownward({x:0,y:10,z:0})!.handle).toBe('invisible-gun');
  expect(r.nearestDetailed({x:0,y:10,z:0},{x:0,y:-1,z:0},{bullet:true})!.handle).toBe('floor');
 });
 it('merges multipart resources and composes parent transforms before converting source coordinates once',()=>{
  const data:OriginalSceneData={meshes:[mesh('multipart',0,0),mesh('multipart',1,1)],nodes:[node('group','', '',5),node('child','multipart','group',2)]};
  const snapshot=createOriginalReceiverImportedScene(data,{...options,scale:2}).snapshot();expect(snapshot.models).toHaveLength(1);
  expect(snapshot.models[0].faces).toEqual([[0,1,2],[3,4,5]]);
  const r=ray(snapshot.models);expect(r.nearestDetailedDownward({x:0,y:30,z:0})).toMatchObject({handle:'child',faceIndex:1,point:{x:0,y:16,z:0},distance:14});
 });
 it('applies complete world-space movement overrides exactly once and retains source ancestry',()=>{
  const provider=createOriginalReceiverImportedScene({meshes:[mesh()],nodes:[node('group','', '',10),node('door','floor','group',3)]},{...options,scale:2});
  const transformed=[...identity];transformed[13]=4;
  // Source local triangle lies in Z=0. Override is already world-local-to-world,
  // so use the exact Z-up -> Y-up basis, plus final world translation.
  transformed[5]=0;transformed[6]=-1;transformed[9]=1;transformed[10]=0;
  const overrides=new Map([['door',{worldMatrix:transformed,inWorld:true}]]),snapshot=provider.snapshot(overrides);
  expect(ray(snapshot.models).nearestDetailedDownward({x:0,y:10,z:0})!.point.y).toBe(4);
  expect(snapshot.models[0].groupAncestry).toContain('group');transformed[13]=9;
  expect(ray(snapshot.models).nearestDetailedDownward({x:0,y:10,z:0})!.point.y).toBe(4);
  expect(ray(provider.snapshot().models).nearestDetailedDownward({x:0,y:30,z:0})!.point.y).toBe(26);
 });
 it('discloses unmatched model resources while preserving empty-resource ancestry groups',()=>{
  const snapshot=createOriginalReceiverImportedScene({meshes:[mesh()],nodes:[node('smokes',''),node('missing','unknown','smokes'),node('floor','floor','smokes')]},options).snapshot();
  expect(snapshot.groups).toContain('smokes');expect(snapshot.models.map(m=>m.handle)).toEqual(['floor']);expect(snapshot.missing.length).toBeGreaterThan(0);
  expect(snapshot.missing.join(' ')).toContain('missing');
 });
 it('rejects expanded instance budgets, malformed geometry and invalid hierarchy before publishing a snapshot',()=>{
  const repeated:OriginalSceneData={meshes:[mesh()],nodes:[node('a','floor'),node('b','floor')]};
  expect(()=>createOriginalReceiverImportedScene(repeated,{...options,maxVertices:5})).toThrow();
  expect(()=>createOriginalReceiverImportedScene({meshes:[{...mesh(),faces:[[0,1,3]]}],nodes:[node('a','floor')]},options)).toThrow();
  expect(()=>createOriginalReceiverImportedScene({meshes:[mesh()],nodes:[node('a','floor','absent-parent')]},options)).toThrow();
  expect(()=>createOriginalReceiverImportedScene({meshes:[mesh()],nodes:[node('a','floor','b'),node('b','','a')]},options)).toThrow();
 });
 it('admits actual decoded Barrack outerfencing and applies the explicit explore-script smokes reparent',()=>{
  // This disk read runs only inside root's bounded test process. Limit the
  // imported provider to one real resource and its actual ancestor chain.
  const data=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8')) as OriginalSceneData;
  const chosen=data.nodes.find(n=>n.name.toLowerCase()==='outerfencing');expect(chosen).toBeDefined();
  const selected=new Map<string,OriginalSceneNode>();let current=chosen;
  while(current&&!selected.has(current.name)){selected.set(current.name,current);const parent=current.parent.toLowerCase();current=parent===''||parent==='world'?undefined:data.nodes.find(n=>n.name.toLowerCase()===parent);}
  const subset:OriginalSceneData={meshes:data.meshes.filter(m=>selectedHasResource(selected,m.resource)),nodes:[...selected.values()]};
  const provider=createOriginalReceiverImportedScene(subset,{...options,scale:.02,geometryProvenance:'actual-decoded-barrack-resource-subset',maxVertices:1000000,maxFaces:1000000}),snapshot=provider.snapshot();
  expect(snapshot.missing).toEqual([]);const fence=snapshot.models.find(m=>m.handle===chosen!.name);expect(fence).toBeDefined();
  expect(fence!.positions.length).toBeGreaterThan(0);expect(fence!.faces.length).toBeGreaterThan(0);
  // Decoded hierarchy does not prove explore's later runtime reparent. Apply
  // that controller operation explicitly; do not infer it from the mesh name.
  const ancestry=['smokes'],reparented=provider.snapshot(new Map([[fence!.handle,{worldMatrix:fence!.worldMatrix,groupAncestry:ancestry}]]));ancestry.push('later-mutation');
  expect(reparented.models.find(m=>m.handle===chosen!.name)!.groupAncestry).toEqual(['smokes']);
 });
});
function selectedHasResource(selected:ReadonlyMap<string,OriginalSceneNode>,resource:string):boolean{return [...selected.values()].some(n=>n.resource.toLowerCase()===resource.toLowerCase());}
