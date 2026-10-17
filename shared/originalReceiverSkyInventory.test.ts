import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createOriginalReceiverSkyInventory} from './originalReceiverSkyInventory';
import {raycastOriginalSky,type OriginalSkyDescription} from './originalSkyRay';
import {createOriginalReceiverSceneRay,ORIGINAL_RECEIVER_SCENE_LAYERS,type OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const source=():OriginalSkyDescription=>({radius:10,height:20,position:[0,0,10],rotationDegrees:[90,0,0]});
const options={scale:1,sceneGeneration:4,provenance:'explicit-sky-CPU-adapter',maxModels:1,maxVertices:63,maxFaces:80};
const prefix=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:4,callback:0,tick});
function ray(models:readonly OriginalReceiverRayModel[],p:ReceiverScenePrefix){
 // Isolated sky-only fixture: other layers are explicitly empty here. This
 // does not establish complete packaged-map/receiver inventory.
 return createOriginalReceiverSceneRay(models,{prefix:p,sceneGeneration:p.sceneGeneration,callback:p.callback,expectedHandles:models.map(model=>model.handle),accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]},{maxModels:1,maxVertices:63,maxTriangles:80});
}
const vector=(value:{x:number;y:number;z:number})=>new THREE.Vector3(value.x,value.y,value.z);
afterEach(()=>vi.restoreAllMocks());

describe('static receiver sky inventory (explicit renderer primitive adapter)',()=>{
 for(const edition of ['barrack','woodland'] as const)it(`${edition}: actual metadata yields the same back-facing polygon hits as existing sky rays`,()=>{
  const data=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${edition}/scene.json`,import.meta.url),'utf8')) as {runtime:{sky:OriginalSkyDescription}};
  const inventory=createOriginalReceiverSkyInventory(data.runtime.sky,{...options,scale:ORIGINAL_MAP_SCALE}),p=prefix(),snapshot=inventory.snapshotAt(p,{prefix:p}),query=ray(snapshot.triangles,p),origin={x:0,y:1000*ORIGINAL_MAP_SCALE,z:0};
  expect(snapshot.scope).toBe('sky-only');expect(snapshot.missing).toEqual([]);expect(snapshot.models[0]).toMatchObject({handle:'sky',resource:'sky',kind:'sky',group:'scene',inWorld:true});
  expect(snapshot.triangles[0]).toMatchObject({layer:'sky',sidedness:'back',groupAncestry:[]});expect(snapshot.triangles[0].positions).toHaveLength(63);expect(snapshot.triangles[0].faces).toHaveLength(80);
  for(const angle of [.13,.57,1.23,2.61]){
   const direction=new THREE.Vector3(Math.cos(angle),.03,Math.sin(angle)).normalize(),existing=raycastOriginalSky(data,ORIGINAL_MAP_SCALE,origin,direction,700),actual=query.nearestDetailed(origin,direction,{maxDistance:700});
   expect(existing).not.toBeNull();expect(actual).not.toBeNull();expect(actual!.distance).toBeCloseTo(existing!.distance,8);expect(vector(actual!.point).distanceTo(vector(existing!.point))).toBeLessThan(1e-8);
   // SceneRay reports raw resource winding; the older sky ray helper returns
   // its explicit inward normal. Hit geometry/culling agree, normals oppose.
   expect(vector(actual!.normal).negate().distanceTo(vector(existing!.normal))).toBeLessThan(1e-8);
   expect(query.nearestDetailed(origin,direction,{maxDistance:actual!.distance-.01})).toBeNull();
  }
 });
 it('leaves upright ends open, preserves inward/back culling and returns a horizon hit',()=>{
  const p=prefix(),snapshot=createOriginalReceiverSkyInventory(source(),options).snapshotAt(p,{prefix:p}),query=ray(snapshot.triangles,p),origin={x:0,y:10,z:0};
  expect(query.nearestDetailed(origin,{x:1,y:0,z:0})!.distance).toBeCloseTo(10,8);
  expect(query.nearestDetailedDownward(origin)).toBeNull();expect(query.nearestDetailed(origin,{x:0,y:1,z:0})).toBeNull();
  expect(query.nearestDetailed({x:20,y:10,z:0},{x:-1,y:0,z:0},{maxDistance:15})).toBeNull();
  expect(query.nearestDetailed({x:20,y:10,z:0},{x:-1,y:0,z:0},{maxDistance:40})!.distance).toBeCloseTo(30,8);
 });
 it('uses an unbounded downward query for a horizontal cylinder without substituting a support plane',()=>{
  const description={...source(),position:[0,0,0],rotationDegrees:[0,0,0]},p=prefix(),snapshot=createOriginalReceiverSkyInventory(description,options).snapshotAt(p,{prefix:p}),query=ray(snapshot.triangles,p),origin={x:0,y:1000000,z:0};
  const hit=query.nearestDetailedDownward(origin);expect(hit).not.toBeNull();expect(hit!.distance).toBeCloseTo(1000010,5);expect(hit!.point.y).toBeCloseTo(-10,5);
  expect(query.nearestDetailed(origin,{x:0,y:-1,z:0},{maxDistance:1000000})).toBeNull();
 });
 it('detaches scalar metadata and prefix while sharing immutable resource records across snapshots',()=>{
  const description={...source(),position:[0,0,10],rotationDegrees:[90,0,0]},settings={...options},inventory=createOriginalReceiverSkyInventory(description,settings),p={kind:'receipt' as const,sceneGeneration:4,callback:0,tick:3},first=inventory.snapshotAt(p,{prefix:p});
  description.radius=999;description.position[2]=999;description.rotationDegrees[0]=0;settings.scale=999;p.tick=9;
  const secondPrefix=prefix(4),second=inventory.snapshotAt(secondPrefix,{prefix:secondPrefix});
  expect(first.prefix).toEqual(prefix(3));expect(second.prefix).toEqual(secondPrefix);expect(second.models).toBe(first.models);expect(second.triangles).toBe(first.triangles);
  expect(first.models[0].worldMatrix![13]).toBeCloseTo(10,10);expect(Object.isFrozen(first)).toBe(true);expect(Object.isFrozen(first.prefix)).toBe(true);
  for(const record of first.triangles){expect(Object.isFrozen(record)).toBe(true);expect(Object.isFrozen(record.worldMatrix)).toBe(true);expect(Object.isFrozen(record.positions)).toBe(true);for(const position of record.positions)expect(Object.isFrozen(position)).toBe(true);for(const face of record.faces)expect(Object.isFrozen(face)).toBe(true);}
 });
 it('rejects mismatched generation/receipt prefixes, invalid shapes and allocation budgets',()=>{
  const inventory=createOriginalReceiverSkyInventory(source(),options),p=prefix();
  expect(()=>inventory.snapshotAt(p,{prefix:prefix(1)})).toThrow('prefix');
  expect(()=>inventory.snapshotAt({...p,sceneGeneration:5},{prefix:{...p,sceneGeneration:5}})).toThrow('prefix');
  expect(()=>inventory.snapshotAt({...p,callback:-1},{prefix:p})).toThrow();
  for(const override of [{maxModels:0},{maxVertices:62},{maxFaces:79},{maxTextChars:1},{scale:0},{sceneGeneration:-1}])expect(()=>createOriginalReceiverSkyInventory(source(),{...options,...override})).toThrow();
  for(const invalid of [{...source(),radius:NaN},{...source(),height:0},{...source(),position:[0,0]},{...source(),position:new Array<number>(3)},{...source(),rotationDegrees:[90,0,Infinity]}])expect(()=>createOriginalReceiverSkyInventory(invalid,options)).toThrow();
 });
 it('disposes its temporary primitive and rejects numeric overflow without publishing geometry',()=>{
  const dispose=vi.spyOn(THREE.BufferGeometry.prototype,'dispose');createOriginalReceiverSkyInventory(source(),options);expect(dispose).toHaveBeenCalledOnce();
  expect(()=>createOriginalReceiverSkyInventory({...source(),radius:Number.MAX_VALUE},options)).toThrow('overflow');
  expect(()=>createOriginalReceiverSkyInventory({...source(),position:[Number.MAX_VALUE,0,10]},{...options,scale:2})).toThrow('overflow');
  expect(dispose).toHaveBeenCalledOnce();
 });
});
