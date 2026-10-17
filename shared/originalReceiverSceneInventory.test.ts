import {describe,expect,it,vi} from 'vitest';
import {createOriginalReceiverSceneInventory} from './originalReceiverSceneInventory';
import {createOriginalReceiverPrivateInventory} from './originalReceiverPrivateInventory';
import {createOriginalReceiverImportedScene} from './originalReceiverImportedScene';
import {createOriginalReceiverSkyInventory} from './originalReceiverSkyInventory';
import {createOriginalReceiverLocalWeaponInventory} from './originalReceiverLocalWeaponInventory';
import {createOriginalReceiverProjectileInventory,type ReceiverProjectileModelCapture} from './originalReceiverProjectileInventory';
import {createOriginalReceiverTransientInventory,ORIGINAL_RECEIVER_MUZZLE_TEMPLATES,type ReceiverTransientInventoryCapture} from './originalReceiverTransientInventory';
import {OriginalReceiverTransientResources} from './originalReceiverTransientResources';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';
import {OriginalRemoteView} from './originalRemoteView';
import type {OriginalSceneData} from './originalSceneGeometry';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const names=['pistol','spas12','ak47','rg6','rpg','dragunov','rocket'] as const;
const resource=(name:string)=>name==='rocket'?'rpgrocket':name;
const prefix=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:2,callback:3,tick});
const limits={sceneGeneration:2,provenance:'controlled-composed-subset',maxModels:32,maxVertices:256,maxFaces:256};
const capture=(p:ReceiverScenePrefix,offset=0)=>({prefix:p,cameraHandle:'camera',selectedWeapon:'pistol' as const,loadedRocket:false,models:names.map(handle=>{
 const worldMatrix=[...identity];worldMatrix[12]=offset;
 return {handle,resource:resource(handle),worldMatrix,inWorld:handle==='pistol',groupAncestry:handle==='pistol'?['camera']:[]};
})});
const fixture=(handle='floor')=>{
 const data:OriginalSceneData={nodes:[{name:handle,parent:'World',resource:'floor',matrix:[...identity],visibility:1,shader:''}],
  meshes:[{resource:'floor',part:0,positions:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const imported=createOriginalReceiverPrivateInventory(createOriginalReceiverImportedScene(data,{scale:1,geometryProvenance:'fixture-floor',sidedness:'double',...limits}),data,{...limits,map:'barrack',scale:1,doorNames:[]});
 const sky=createOriginalReceiverSkyInventory({radius:10,height:20,position:[0,0,10],rotationDegrees:[90,0,0]},{...limits,scale:1});
 const weapons={meshes:names.map(name=>({resource:resource(name),positions:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]]}))};
 const localWeapons=createOriginalReceiverLocalWeaponInventory(weapons,{...limits,sidedness:'double'});
 return {imported,sky,localWeapons};
};
const dynamicProviders=()=>{
 const geometry=(resource:string)=>({resource,positions:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]]});
 const projectiles=createOriginalReceiverProjectileInventory({meshes:['rg6grenade','rpgrocket'].map(geometry)},{...limits,sidedness:'double'});
 const resources=new OriginalReceiverTransientResources({meshes:ORIGINAL_RECEIVER_MUZZLE_TEMPLATES.map(geometry)},
  {...limits,sourceScale:1,sidedness:'double',planeResource:{widthWorld:1,positions:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]],provenance:'declared-plane'}});
 const transients=createOriginalReceiverTransientInventory(resources,limits);
 return {projectiles,transients};
};
const dynamicCapture=(p:ReceiverScenePrefix)=>{
 const models:ReceiverProjectileModelCapture[]=[{handle:'grenade',resource:'rg6grenade',worldMatrix:[...identity],inWorld:false,groupAncestry:[]},
  {handle:'flight',resource:'rg6grenade',worldMatrix:[...identity],inWorld:true,groupAncestry:[]}];
 const transients:ReceiverTransientInventoryCapture={prefix:p,expectedHandles:[...ORIGINAL_RECEIVER_MUZZLE_TEMPLATES],unresolved:[],planeWidthWorld:null,models:[],
  templates:ORIGINAL_RECEIVER_MUZZLE_TEMPLATES.map(handle=>({handle,resource:handle,worldMatrix:[...identity],inWorld:false,group:'scene',groupAncestry:[]}))};
 return {projectiles:{prefix:p,expectedHandles:['grenade','flight'],models},transients};
};

describe('private scene inventory composition (controlled resources; full source coverage remains incomplete)',()=>{
 it('discharges exactly represented sky/local classes while preserving independently unresolved scene membership',()=>{
  const providers=fixture(),inventory=createOriginalReceiverSceneInventory(providers.imported,{...limits,...providers}),p=prefix(),snapshot=inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:capture(p)});
  expect(snapshot.models).toHaveLength(9);expect(snapshot.triangles).toHaveLength(9);expect(snapshot.missing).toEqual(['projectile','transient','actor-ledger']);
  expect(snapshot.models.find(model=>model.handle==='sky')!.kind).toBe('sky');expect(snapshot.models.find(model=>model.handle==='pistol')!.kind).toBe('local-weapon');
  for(const model of snapshot.models)expect(snapshot.resolveModel(model.handle)).toBe(snapshot.triangles.find(ray=>ray.handle===model.handle));
  expect(()=>snapshot.resolveModel('unowned')).toThrow();
 });
 it('keeps absent or incomplete local inventory missing instead of treating an empty resource list as proof',()=>{
  const providers=fixture(),p=prefix(),inventory=createOriginalReceiverSceneInventory(providers.imported,{...limits,sky:providers.sky,localWeapons:providers.localWeapons});
  expect(inventory.snapshotAt(p,{prefix:p,imported:{prefix:p}}).missing).toContain('local-camera-weapon');
  const partial=capture(p);partial.models=partial.models.filter(model=>model.handle!=='pistol');
  const snapshot=inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:partial});
  expect(snapshot.missing).toContain('local-camera-weapon');expect(snapshot.missing.join(' ')).toContain('pistol');
  expect(createOriginalReceiverSceneInventory(providers.imported,limits).snapshotAt(p,{prefix:p,imported:{prefix:p}}).missing).toContain('sky');
 });
 it('detaches saved matrices and prefixes while sharing immutable resources between independent private captures',()=>{
  const providers=fixture(),inventory=createOriginalReceiverSceneInventory(providers.imported,{...limits,...providers}),p={kind:'receipt' as const,sceneGeneration:2,callback:3,tick:1},firstCapture=capture(p,10),first=inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:firstCapture});
  firstCapture.models[0].worldMatrix[12]=999;p.tick=9;
  const q=prefix(2),second=inventory.snapshotAt(q,{prefix:q,imported:{prefix:q},localWeapons:capture(q,20)});
  expect(first.prefix).toEqual(prefix(1));expect(first.resolveModel('pistol').worldMatrix[12]).toBe(10);expect(second.resolveModel('pistol').worldMatrix[12]).toBe(20);
  expect(first.resolveModel('pistol').positions).toBe(second.resolveModel('pistol').positions);expect(first.resolveModel('sky')).toBe(second.resolveModel('sky'));expect(Object.isFrozen(first.models)).toBe(true);
 });
 it('rejects a different component receipt or generation without using another current inventory',()=>{
  const providers=fixture(),inventory=createOriginalReceiverSceneInventory(providers.imported,{...limits,...providers}),p=prefix();
  expect(()=>inventory.snapshotAt(p,{prefix:prefix(1),imported:{prefix:p},localWeapons:capture(p)})).toThrow('prefix');
  expect(()=>inventory.snapshotAt(p,{prefix:p,imported:{prefix:prefix(1)},localWeapons:capture(p)})).toThrow('prefix');
  expect(()=>inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:capture(prefix(1))})).toThrow('prefix');
  const wrong={...p,sceneGeneration:3};expect(()=>inventory.snapshotAt(wrong,{prefix:wrong,imported:{prefix:wrong}})).toThrow('prefix');
  expect(()=>createOriginalReceiverSceneInventory(providers.imported,limits).snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:capture(p)})).toThrow('unavailable');
 });
 it('rejects colliding source handles and combined resource budgets after individually bounded providers succeed',()=>{
  const providers=fixture('sky'),p=prefix();expect(()=>createOriginalReceiverSceneInventory(providers.imported,{...limits,...providers}).snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:capture(p)})).toThrow('identity');
  const ordinary=fixture();
  for(const bound of [{maxModels:8},{maxVertices:86},{maxFaces:87},{maxTextChars:50}]){
   const inventory=createOriginalReceiverSceneInventory(ordinary.imported,{...limits,...ordinary,...bound});
   expect(()=>inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:capture(p)})).toThrow('budget');
  }
 });
 it('joins independently enumerated projectile/template inventories while retaining actor-ledger coverage',()=>{
  const providers=fixture(),dynamic=dynamicProviders(),p=prefix(),inventory=createOriginalReceiverSceneInventory(providers.imported,{...limits,...providers,...dynamic});
  const snapshot=inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:capture(p),...dynamicCapture(p)});
  expect(snapshot.models).toHaveLength(15);expect(snapshot.missing).toEqual(['actor-ledger']);
  expect(snapshot.resolveModel('grenade').inWorld).toBe(false);expect(snapshot.resolveModel('flight').layer).toBe('projectile');
  expect(snapshot.resolveModel('mfpistol').groupAncestry).toEqual([]);
 });
 it('preserves incomplete projectile enumeration and unsupported barrel effects rather than discharging their classes',()=>{
  const providers=fixture(),dynamic=dynamicProviders(),p=prefix(),inventory=createOriginalReceiverSceneInventory(providers.imported,{...limits,...providers,...dynamic});
  const state=dynamicCapture(p);state.projectiles.models=state.projectiles.models.filter(model=>model.handle!=='flight');
  const snapshot=inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:capture(p),projectiles:state.projectiles,
   transients:{...state.transients,unresolved:['unsupported-barrel-bang']}});
  expect(snapshot.missing).toContain('projectile');expect(snapshot.missing.join(' ')).toContain('flight');
  expect(snapshot.missing).toContain('transient');expect(snapshot.missing).toContain('unsupported-barrel-bang');expect(snapshot.missing).toContain('actor-ledger');
 });
 it('rejects new component-prefix mismatches and unconfigured dynamic inputs',()=>{
  const providers=fixture(),dynamic=dynamicProviders(),p=prefix(),inventory=createOriginalReceiverSceneInventory(providers.imported,{...limits,...providers,...dynamic}),state=dynamicCapture(p);
  expect(()=>inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},projectiles:{...state.projectiles,prefix:prefix(1)}})).toThrow('prefix');
  expect(()=>inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},transients:{...state.transients,prefix:prefix(1)}})).toThrow('prefix');
  const without=createOriginalReceiverSceneInventory(providers.imported,{...limits,...providers});
  expect(()=>without.snapshotAt(p,{prefix:p,imported:{prefix:p},projectiles:state.projectiles})).toThrow('unavailable');
  expect(()=>without.snapshotAt(p,{prefix:p,imported:{prefix:p},transients:state.transients})).toThrow('unavailable');
 });
 it('still rejects real receiver birth before querying when actor ownership remains unresolved',()=>{
  const providers=fixture(),dynamic=dynamicProviders(),inventory=createOriginalReceiverSceneInventory(providers.imported,{...limits,...providers,...dynamic});
  const query=vi.fn<ReceiverModelBackend['nearestDetailedDownward']>(()=>({hit:null,coverage:{complete:true,missing:[],provenance:'must-not-query'}}));
  const pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1};
  const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-gi'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),nearestDetailedDownward:query,
   heldGunPose:gi=>gi.pose,cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),reparentGunMembership:present=>present,dropYaw:()=>0};
  const external={snapshotAt:(p:ReceiverScenePrefix)=>inventory.snapshotAt(p,{prefix:p,imported:{prefix:p},localWeapons:capture(p),...dynamicCapture(p)})};
  const world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:1,goodyBspWorld:1,sceneGeneration:2,maxModels:32,maxPickups:8},external),view=new OriginalRemoteView(0,{},'source-callback',world);
  expect(view.recordSent({tick:0,sentAt:0,targets:[{id:'remote',position:{x:0,y:10,z:0},yaw:0,motionTime:0,alive:true,weapon:'rifle'}]})).toEqual({ok:true});
  const before={world:world.debugState(),models:world.freezeModels(),view:view.debugState(),actors:view.freeze()};
  expect(()=>view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toThrow('Incomplete receiver external scene');expect(query).not.toHaveBeenCalled();
  expect({world:world.debugState(),models:world.freezeModels(),view:view.debugState(),actors:view.freeze()}).toEqual(before);
 });
});
