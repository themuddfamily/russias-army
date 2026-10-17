import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import {createOriginalSceneGeometry,type OriginalSceneData,type OriginalSceneNode} from './originalSceneGeometry';
import {createOriginalReceiverImportedScene} from './originalReceiverImportedScene';
import {createOriginalReceiverPrivateInventory} from './originalReceiverPrivateInventory';
import {OriginalReceiverCurrentEnvironment} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController,type ReceiverSceneEnvironmentTransaction} from './originalReceiverSceneController';
import {OriginalRemoteView} from './originalRemoteView';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {OriginalMapRuntime} from './originalMapRuntime';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';

const prefix:ReceiverScenePrefix={sceneGeneration:7,kind:'receipt',callback:0,tick:0};
function fixture(map:'barrack'|'woodlands'='barrack',controlledOracle=false){
 const raw=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData;
 const tracks:OriginalDoorTracks=map==='barrack'?JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks:{version:1,doors:[]};
 const chosen=[raw.nodes.find(n=>n.name.toLowerCase()==='floor')!];
 if(map==='barrack')chosen.push(raw.nodes.find(n=>n.name.trim().split(/\s+/)[0].toLowerCase()==='barrel')!,raw.nodes.find(n=>n.name===tracks.doors[0].name)!);
 const selected=new Map<string,OriginalSceneNode>();
 for(const chosenNode of chosen){let node:OriginalSceneNode|undefined=chosenNode;while(node&&!selected.has(node.name)){selected.set(node.name,node);node=node.parent===''||node.parent.toLowerCase()==='world'?undefined:raw.nodes.find(n=>n.name.toLowerCase()===node!.parent.toLowerCase());}}
 const resources=new Set([...selected.values()].map(n=>n.resource)),data:OriginalSceneData={nodes:[...selected.values()],meshes:raw.meshes.filter(m=>resources.has(m.resource))},scale=.02,geometry=createOriginalSceneGeometry(data,{scale});
 const runtime:OriginalMapRuntime={map,data,scale,geometry,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const barrels=new OriginalBarrelWorld(runtime),doors=new OriginalDoorWorld(data,scale,{version:1,doors:tracks.doors.slice(0,1)}),target={health:createOriginalPlayerHealth(),alive:true};
 const inventory=createOriginalReceiverPrivateInventory(createOriginalReceiverImportedScene(data,{scale,geometryProvenance:'decoded-dynamic-subset',sidedness:'double',maxModels:128,maxVertices:1000000,maxFaces:1000000}),data,{map,scale,sceneGeneration:7,doorNames:doors.getStates().map(d=>d.name),provenance:'decoded-dynamic-subset',maxModels:128,maxVertices:1000000,maxFaces:1000000});
 const captures:{prefix:ReceiverScenePrefix;physical:string[];snapshot:ReturnType<typeof inventory.snapshotAt>;doors:ReturnType<OriginalDoorWorld['getStates']>}[]=[];
 const position=barrels.bodies[0]?{...barrels.bodies[0].position}:{x:0,y:0,z:0};
 const environment=new OriginalReceiverCurrentEnvironment({sceneGeneration:7,sourceScale:scale,target,barrels,doors,maxCommands:8,maxOutcomes:8,maxModels:128,maxTextChars:65536,
  snapshotAt:(p,state)=>{const snapshot=inventory.snapshotAt(p,{prefix:p,barrels:state.barrels,doors:state.doors});captures.push({prefix:p,physical:state.barrels.snapshots().map(b=>b.id),snapshot,doors:state.doors?.getStates()??[]});
   // Controller controls use a declared empty external oracle, with no actor
   // grounding. The actual subset inventory is independently inspected above;
   // its missing classes remain present there, never asserted native-complete.
   return controlledOracle?{prefix:p,models:[],missing:[],provenance:'declared-empty-controller-oracle-no-grounding'}:snapshot;}});
 const arm=()=>environment.arm({physicalCallback:0,goody:{bspWorld:999,modelPosition:position,eyePosition:position,weapon:'rifle'},frames:[{prefix,commands:map==='barrack'?
  [{kind:'transient-birth',event:{kind:'puff',id:'A',position,angleSourceDegrees:10}},{kind:'door-open',name:tracks.doors[0].name,atSeconds:0},{kind:'barrel-hurt',id:barrels.bodies[0].id,birthId:'barrel'},{kind:'transient-birth',event:{kind:'puff',id:'B',position,angleSourceDegrees:20}}]:[]}]});
 return {environment,barrels,doors,target,inventory,captures,position,arm,barrelName:barrels.bodies[0]?.id,doorName:tracks.doors[0]?.name};
}
function controllerFixture(){
 const f=fixture('barrack',true),pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 let active:ReceiverSceneEnvironmentTransaction|undefined,clone=0;const flags={failClone:0},names:string[]=[];
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),dropYaw:()=>0,reparentGunMembership:x=>x,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'unused-declared-oracle'}})};
 const controller=new OriginalReceiverSceneController(backend,{clonePlane:name=>{names.push(name);active!.snapshotAt(prefix);if(++clone===flags.failClone)throw Error('injected emitter failure');return {pose,geometryProvenance:'explicit-plane-fixture',inWorld:true,initialShader:{handle:`seed:${name}`,texture:`texture:${name}`,recycled:false,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},blend:100,emissiveWhite:false}};},cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},{begin:()=>{active=f.environment.begin();return active;}},{model:{sceneGeneration:7,sourceScale:.02,eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:8},transient:{maxModels:16,maxActors:8,maxShaders:16},maxEffects:16});
 const view=new OriginalRemoteView(0,{},'source-callback',controller);
 const freeze=()=>({barrels:f.barrels.snapshots(),doors:f.doors.getStates(),target:structuredClone(f.target),view:view.debugState(),actors:view.freeze(),models:controller.freezeModels(),fx:controller.debugState().fx,publication:controller.freezePublication(),version:controller.freezePublicationVersion()});
 return {...f,controller,view,names,flags,freeze,resetClone:()=>{clone=0;}};
}

describe('ordered CURRENT command dispatch (CPU adapter chronology, not native global actor order)',()=>{
 it('emits each birth between commands and exposes removed-body/retained-render membership only during barrel construction',()=>{
  const f=fixture(),matrix=f.barrels.getModelMatrix(f.barrelName!)!;f.arm();const stage=f.environment.begin(),ids:string[]=[];
  stage.dispatchAt!(prefix,event=>{ids.push(event.id);stage.snapshotAt(prefix);if(event.id==='barrel')stage.stageEffects([{kind:'bang-hurt',effectId:event.id,position:f.position,attackerName:null,amount:5,radiusSource:250}],prefix);});
  expect(ids).toEqual(['A','barrel','B']);expect(f.captures.map(c=>c.prefix)).toEqual([prefix,prefix,prefix]);expect(f.captures.map(c=>c.physical.length)).toEqual([1,0,0]);
  expect(f.captures.map(c=>c.snapshot.resolveModel(f.barrelName!).inWorld)).toEqual([true,true,false]);expect(f.captures[1].snapshot.resolveModel(f.barrelName!).worldMatrix).toEqual(f.captures[0].snapshot.resolveModel(f.barrelName!).worldMatrix);
  expect(f.captures[0].doors[0].openedAt).toBeNull();expect(f.captures[1].doors[0].openedAt).toBe(0);expect(f.captures[1].snapshot.missing.length).toBeGreaterThan(0);
  expect(f.barrels.getModelMatrix(f.barrelName!)).toEqual(matrix);expect(f.target.health.canonical).toBe(100);stage.prepareCommit()();expect(f.barrels.snapshots()).toEqual([]);expect(f.target.health.canonical).toBe(95);
 });
 it('wires actual Controller/View clonePlane observations through ordered dispatch with shared allocator order',()=>{
  const f=controllerFixture();f.arm();expect(f.view.recordSent({tick:0,sentAt:0,targets:[]})).toEqual({ok:true});expect(f.view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toEqual({ok:true});
  expect(f.names).toEqual(['plane1','plane3','plane4']);expect(f.captures.slice(0,3).map(c=>c.physical.length)).toEqual([1,0,0]);expect(f.captures.slice(0,3).map(c=>c.snapshot.resolveModel(f.barrelName!).inWorld)).toEqual([true,true,false]);
  expect(f.controller.debugState().fx.actors.map(a=>a.id)).toEqual(['A','barrel','B']);expect(f.barrels.snapshots()).toEqual([]);expect(f.controller.freezePublication().map(e=>e.kind)).toEqual(['sound']);
 });
 it('rolls back actual mirror, models, FX, publication and target on an emitter failure, then retries the identical armed input',()=>{
  const f=controllerFixture();f.arm();expect(f.view.recordSent({tick:0,sentAt:0,targets:[]})).toEqual({ok:true});const before=f.freeze();f.flags.failClone=2;
  expect(()=>f.view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toThrow('injected emitter failure');expect(f.freeze()).toEqual(before);expect(f.environment.drainOutcomes()).toEqual([]);
  f.flags.failClone=0;f.resetClone();f.names.length=0;f.captures.length=0;expect(f.view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toEqual({ok:true});expect(f.names).toEqual(['plane1','plane3','plane4']);expect(f.barrels.snapshots()).toEqual([]);
 });
 it.each(['dispatch','prepare','receipt'] as const)('rejects reentrant %s during emission while releasing the target for retry',operation=>{
  const f=fixture();f.arm();const stage=f.environment.begin();
  expect(()=>stage.dispatchAt!(prefix,()=>{if(operation==='dispatch')stage.dispatchAt!(prefix,()=>{});else if(operation==='prepare')stage.prepareCommit();else stage.applyReceipt(0,0);})).toThrow();stage.rollback();expect(f.barrels.snapshots()).toHaveLength(1);expect(f.doors.getStates()[0].openedAt).toBeNull();
  const retry=f.environment.begin();const ids:string[]=[];retry.dispatchAt!(prefix,e=>ids.push(e.id));expect(ids).toEqual(['A','barrel','B']);expect(()=>retry.dispatchAt!(prefix,()=>{})).toThrow();retry.rollback();
 });
 it('does not invent contact/proximity-triggered births for decoded empty Woodland dynamics',()=>{
  const f=fixture('woodlands');f.arm();const stage=f.environment.begin();let births=0;stage.dispatchAt!(prefix,()=>{births++;});expect(births).toBe(0);expect(stage.snapshotAt(prefix).missing.length).toBeGreaterThan(0);stage.prepareCommit()();expect(f.barrels.snapshots()).toEqual([]);expect(f.doors.getStates()).toEqual([]);
 });
});
