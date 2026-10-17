import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import {createOriginalSceneGeometry,type OriginalSceneData,type OriginalSceneNode} from './originalSceneGeometry';
import {createOriginalReceiverImportedScene} from './originalReceiverImportedScene';
import {createOriginalReceiverPrivateInventory} from './originalReceiverPrivateInventory';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';
import {OriginalRemoteView} from './originalRemoteView';
import type {OriginalMapRuntime} from './originalMapRuntime';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const prefix=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:7,callback:0,tick});
function fixture(){
 const raw=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8')) as OriginalSceneData;
 const tracks=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks;
 const barrel=raw.nodes.find(n=>n.name.trim().split(/\s+/)[0].toLowerCase()==='barrel')!,track=tracks.doors[0],floor=raw.nodes.find(n=>n.name.toLowerCase()==='floor')!;
 const selected=new Map<string,OriginalSceneNode>();
 for(const chosen of [floor,barrel,raw.nodes.find(n=>n.name===track.name)!]){let node:OriginalSceneNode|undefined=chosen;while(node&&!selected.has(node.name)){selected.set(node.name,node);node=node.parent===''||node.parent.toLowerCase()==='world'?undefined:raw.nodes.find(n=>n.name.toLowerCase()===node!.parent.toLowerCase());}}
 const resources=new Set([...selected.values()].map(n=>n.resource)),data:OriginalSceneData={nodes:[...selected.values()],meshes:raw.meshes.filter(m=>resources.has(m.resource))},scale=.02,geometry=createOriginalSceneGeometry(data,{scale});
 const runtime:OriginalMapRuntime={map:'barrack',data,scale,geometry,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}},barrels=new OriginalBarrelWorld(runtime),doors=new OriginalDoorWorld(data,scale,{version:1,doors:[track]});
 const bounds={sceneGeneration:7,maxModels:128,maxVertices:1000000,maxFaces:1000000,provenance:'actual-resource-subset-dynamic-adoption'};
 const inventory=createOriginalReceiverPrivateInventory(createOriginalReceiverImportedScene(data,{...bounds,scale,geometryProvenance:bounds.provenance,sidedness:'double'}),data,{...bounds,map:'barrack',scale,doorNames:[track.name]});
 return {barrels,doors,inventory,barrelName:barrel.name,doorName:track.name};
}
function staged(f:ReturnType<typeof fixture>){const barrels=f.barrels.fork(),doors=f.doors.fork();barrels.applySnapshots([]);doors.open(f.doorName,0);doors.update(.5);return {barrels,doors};}

describe('joint private dynamics adoption (actual decoded subset; source completeness remains unresolved)',()=>{
 it('publishes prepared door/barrel captures without replacing facades or retaining candidate mutation',()=>{
  const f=fixture(),facade=f.doors.geometry,p=prefix(),saved=f.inventory.snapshotAt(p,{prefix:p,barrels:f.barrels,doors:f.doors}),s=staged(f),q=prefix(1),expected=f.inventory.snapshotAt(q,{prefix:q,...s});
  const barrel=f.barrels.prepareAdopt(s.barrels),door=f.doors.prepareAdopt(s.doors);
  expect(f.barrels.snapshots()).toHaveLength(1);expect(f.doors.getStates()[0].phase).toBe('closed');expect(expected.resolveModel(f.barrelName).inWorld).toBe(false);
  s.barrels.reset();s.doors.reset();barrel.commit();door.commit();
  expect(f.doors.geometry).toBe(facade);const current=f.inventory.snapshotAt(q,{prefix:q,barrels:f.barrels,doors:f.doors});expect(current.models).toEqual(expected.models);expect(current.triangles).toEqual(expected.triangles);
  expect(saved.resolveModel(f.barrelName).inWorld).toBe(true);expect(saved.resolveModel(f.doorName).worldMatrix).not.toEqual(current.resolveModel(f.doorName).worldMatrix);
  f.doors.update(.75);const updated=f.doors.getStates();barrel.commit();door.commit();barrel.rollback();door.rollback();expect(f.doors.getStates()).toEqual(updated);expect(f.barrels.snapshots()).toEqual([]);
 });
 it('rolls back an earlier prepared participant when a later dynamic fork fails provenance',()=>{
  const f=fixture(),s=staged(f),before={doors:f.doors.getStates(),barrels:f.barrels.snapshots(),matrix:f.doors.getModelMatrix(f.doorName)},door=f.doors.prepareAdopt(s.doors);
  try{expect(()=>f.barrels.prepareAdopt(s.barrels.fork())).toThrow();}finally{door.rollback();}
  door.commit();expect({doors:f.doors.getStates(),barrels:f.barrels.snapshots(),matrix:f.doors.getModelMatrix(f.doorName)}).toEqual(before);
  expect(f.doors.open(f.doorName,0)).toBe(true);const valid=f.barrels.prepareAdopt(s.barrels);valid.rollback();expect(f.barrels.snapshots()).toEqual(before.barrels);
 });
 it('keeps incomplete actual inventory out of receiver grounding and leaves staged dynamics unpublished',()=>{
  const f=fixture(),s=staged(f),query=vi.fn<ReceiverModelBackend['nearestDetailedDownward']>(()=>({hit:null,coverage:{complete:true,missing:[],provenance:'must-not-query'}}));
  const pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-gi'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),nearestDetailedDownward:query,heldGunPose:gi=>gi.pose,cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),reparentGunMembership:present=>present,dropYaw:()=>0};
  const external={snapshotAt:(p:ReceiverScenePrefix)=>f.inventory.snapshotAt(p,{prefix:p,...s})},world=new OriginalReceiverModelWorld(backend,{sceneGeneration:7,eyeHeight:1,sourceScale:.02,goodyBspWorld:1,maxModels:128,maxPickups:8},external),view=new OriginalRemoteView(0,{},'source-callback',world);
  expect(view.recordSent({tick:0,sentAt:0,targets:[{id:'actor',position:{x:0,y:10,z:0},yaw:0,motionTime:0,alive:true,weapon:'rifle'}]})).toEqual({ok:true});
  const before={barrels:f.barrels.snapshots(),doors:f.doors.getStates(),models:world.freezeModels(),state:world.debugState(),actors:view.freeze(),clock:view.debugState()};
  expect(()=>view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toThrow('Incomplete receiver external scene');expect(query).not.toHaveBeenCalled();
  expect({barrels:f.barrels.snapshots(),doors:f.doors.getStates(),models:world.freezeModels(),state:world.debugState(),actors:view.freeze(),clock:view.debugState()}).toEqual(before);
 });
});
