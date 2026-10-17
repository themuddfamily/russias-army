import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import {createOriginalSceneGeometry,type OriginalSceneData,type OriginalSceneNode} from './originalSceneGeometry';
import type {OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import {OriginalReceiverCurrentEnvironment} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController} from './originalReceiverSceneController';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {OriginalReceiverTransientBackend} from './originalReceiverTransientWorld';

// Actual decoded dynamics, but a declared floor/plane/GI oracle. This fixture
// does not claim native complete scene inventory or global actor scheduling.
function setup(){
 const raw=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8')) as OriginalSceneData;
 const tracks=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks;
 const barrel=raw.nodes.find(n=>n.name.trim().split(/\s+/)[0].toLowerCase()==='barrel')!,track=tracks.doors[0];
 const selected=new Map<string,OriginalSceneNode>();
 for(const chosen of [raw.nodes.find(n=>n.name.toLowerCase()==='floor')!,barrel,raw.nodes.find(n=>n.name===track.name)!]){
  let node:OriginalSceneNode|undefined=chosen;
  while(node&&!selected.has(node.name)){selected.set(node.name,node);node=node.parent===''||node.parent.toLowerCase()==='world'?undefined:raw.nodes.find(n=>n.name.toLowerCase()===node!.parent.toLowerCase());}
 }
 const resources=new Set([...selected.values()].map(n=>n.resource));
 const data:OriginalSceneData={nodes:[...selected.values()],meshes:raw.meshes.filter(m=>resources.has(m.resource))},scale=.02,geometry=createOriginalSceneGeometry(data,{scale});
 const runtime:OriginalMapRuntime={map:'barrack',data,scale,geometry,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const barrels=new OriginalBarrelWorld(runtime),doors=new OriginalDoorWorld(data,scale,{version:1,doors:[track]});
 const target={health:createOriginalPlayerHealth(100,-2),alive:true},position={...barrels.bodies[0].position};
 const goody={bspWorld:50*scale,modelPosition:position,eyePosition:{...position,y:position.y+1},weapon:'rifle' as const};
 const pose=(y=0):ReceiverModelPose=>({position:{x:position.x,y,z:position.z},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}});
 const flags={queryFails:false},queries:ReceiverScenePrefix[]=[];
 const environment=new OriginalReceiverCurrentEnvironment({sceneGeneration:7,sourceScale:scale,target,barrels,doors,maxCommands:8,maxOutcomes:8,maxModels:32,maxTextChars:65536,
  snapshotAt:prefix=>({prefix,models:[{handle:'fixture-floor',name:'fixture-floor',resource:'fixture-floor',group:'scene',kind:'fixed',inWorld:true,pose:pose(-100),geometryProvenance:'declared-floor-oracle'}],missing:[],provenance:'controlled-external-fixture'})});
 const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(20),geometryProvenance:'declared-GI'}),cloneGun:()=>({pose:pose(20),geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:present=>present,dropYaw:()=>0,
  nearestDetailedDownward:(origin,_models,_callback,_generation,prefix)=>{
   if(prefix)queries.push(prefix);if(flags.queryFails)throw Error('Later grounding failed after private damage');
   return {hit:{position:{x:origin.x,y:-100,z:origin.z},handle:'fixture-floor',geometryProvenance:'declared-floor-oracle'},coverage:{complete:true,missing:[],provenance:'declared-complete-fixture'}};
  }};
 const fxBackend:OriginalReceiverTransientBackend={clonePlane:name=>({pose:pose(),geometryProvenance:'declared-plane',inWorld:true,
  initialShader:{handle:`declared-seed:${name}`,texture:`declared-texture:${name}`,recycled:false,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},blend:100,emissiveWhite:false}}),cloneMuzzle:()=>({pose:pose(),geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q};
 const controller=new OriginalReceiverSceneController(backend,fxBackend,environment,{model:{sceneGeneration:7,sourceScale:scale,eyeHeight:1,goodyBspWorld:goody.bspWorld,maxModels:64,maxPickups:8},transient:{maxModels:32,maxActors:16,maxShaders:16},maxEffects:16});
 const receipt:ReceiverScenePrefix={kind:'receipt',sceneGeneration:7,callback:0,tick:0};
 environment.arm({physicalCallback:0,goody,frames:[{prefix:receipt,commands:[{kind:'transient-birth',event:{kind:'bang',type:'rocket',id:'old-rocket',attackerName:'attested-owner',position}}]}]});
 const initial=controller.begin();initial.applyExternalReceipt(0,0);initial.commit();
 const arm=()=>environment.arm({physicalCallback:1,goody,frames:[{prefix:{kind:'callback',sceneGeneration:7,callback:1},commands:[{kind:'door-open',name:track.name,atSeconds:0},{kind:'barrel-hurt',id:barrel.name,birthId:'attested-barrel'}]}]});
 const freeze=()=>({target:structuredClone(target),barrels:barrels.snapshots(),doors:doors.getStates(),models:controller.freezeModels(),fx:controller.debugState().fx,publication:controller.freezePublication(),version:controller.freezePublicationVersion()});
 return {target,barrels,doors,environment,controller,flags,queries,arm,freeze,position,barrelName:barrel.name};
}

describe('CURRENT environment in the actual joint scene controller (declared query oracle)',()=>{
 it('publishes real dynamic removal and copied health with FX only after joint commit',()=>{
  const f=setup(),before=f.freeze();f.arm();const stage=f.controller.begin();stage.advanceExternalCallback(1);
  expect(f.freeze()).toEqual(before);expect(f.environment.drainOutcomes).toBeTypeOf('function');
  const publish=stage.prepareCommit();expect(f.freeze()).toEqual(before);publish();
  expect(f.target).toEqual({health:{canonical:95,flick:-2},alive:true});expect(f.barrels.snapshots()).toEqual([]);
  expect(f.doors.getStates()[0].openedAt).toBe(0);
  expect(f.controller.debugState().fx.actors.map(a=>({id:a.id,time:a.time}))).toEqual([{id:'old-rocket',time:15},{id:'attested-barrel',time:16}]);
  expect(f.controller.freezePublication().map(e=>e.kind)).toEqual(['sound','bang-hurt']);
  const outcomes=f.environment.drainOutcomes();expect(outcomes).toHaveLength(1);expect(outcomes[0]).toMatchObject({kind:'hurt',amount:5,health:95,dead:false,attackerName:'attested-owner',position:f.position});
  expect(f.environment.drainOutcomes()).toEqual([]);
 });
 it('rolls back health, actual dynamics, FX and publication after a later query fails, then retries the same capture',()=>{
  const f=setup(),before=f.freeze();f.arm();f.flags.queryFails=true;
  const stage=f.controller.begin();stage.advanceExternalCallback(1);
  expect(()=>stage.birth({actorId:'later',targetFeet:{x:0,y:10,z:0},targetYaw:0,callback:1})).toThrow('Later grounding failed after private damage');
  stage.rollback();expect(f.freeze()).toEqual(before);expect(f.environment.drainOutcomes()).toEqual([]);
  f.flags.queryFails=false;const retry=f.controller.begin();retry.advanceExternalCallback(1);
  retry.birth({actorId:'later',targetFeet:{x:0,y:10,z:0},targetYaw:0,callback:1});retry.commit();
  expect(f.target.health.canonical).toBe(95);expect(f.barrels.snapshots()).toEqual([]);expect(f.environment.drainOutcomes()).toHaveLength(1);
  expect(f.controller.debugState().models.actorHandles.map(a=>a.actorId)).toEqual(['later']);
 });
 it('releases prepared environment locks on joint rollback without consuming its capture',()=>{
  const f=setup(),before=f.freeze();f.arm();const stage=f.controller.begin();stage.advanceExternalCallback(1);const publish=stage.prepareCommit();
  expect(()=>f.barrels.reset()).toThrow();expect(()=>f.doors.update(1)).toThrow();stage.rollback();
  expect(()=>publish()).toThrow('publication closed');expect(f.freeze()).toEqual(before);expect(f.environment.drainOutcomes()).toEqual([]);
  const retry=f.controller.begin();retry.advanceExternalCallback(1);retry.commit();expect(f.target.health.canonical).toBe(95);
  expect(f.barrels.snapshots()).toEqual([]);expect(f.environment.drainOutcomes()).toHaveLength(1);
 });
});
