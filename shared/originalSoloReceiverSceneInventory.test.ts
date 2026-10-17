import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {createOriginalSoloReceiverSceneInventory} from './originalSoloReceiverSceneInventory';
import {OriginalReceiverActorResources,type ReceiverWeaponGeometry} from './originalReceiverActorResources';
import {createOriginalReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import {OriginalReceiverTransientResources} from './originalReceiverTransientResources';
import {OriginalReceiverTransientWorld} from './originalReceiverTransientWorld';
import {ORIGINAL_RECEIVER_MUZZLE_TEMPLATES} from './originalReceiverTransientInventory';
import {OriginalReceiverLocalWeaponWorld} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {OriginalReceiverProjectileWorld} from './originalReceiverProjectileWorld';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentState} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController} from './originalReceiverSceneController';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {OriginalSceneData} from './originalSceneGeometry';
import type {OriginalSkyDescription} from './originalSkyRay';
import type {OriginalSoldierCollisionAssets} from './originalSoldierCollision';
import type {ReceiverModelEntry,ReceiverModelPose} from './originalReceiverModelWorld';
import type {OriginalReceiverRayModel} from './originalReceiverSceneRay';

const base=new URL('../public/assets/',import.meta.url);
const json=<T>(path:string)=>JSON.parse(readFileSync(new URL(path,base),'utf8')) as T;
const weapons=json<ReceiverWeaponGeometry>('original-weapons/geometry.json');
const soldier:OriginalSoldierCollisionAssets={geometry:json('original-soldier/geometry.json'),rigMotion:json('original-soldier/rig-motion.json')};
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix=(x:number)=>{const m=[...I];m[12]=x;m[13]=1000;return m;};
const p={kind:'receipt' as const,sceneGeneration:7,callback:0,tick:0},seed={kind:'callback' as const,sceneGeneration:7,callback:0};
const pose=(x:number):ReceiverModelPose=>({position:{x,y:1000,z:0},yaw:0,phase:0,scale:.045,rotation:{x:0,y:0,z:0,w:1}});
const limits={maxModels:2048,maxVertices:2000000,maxFaces:2000000,maxTextChars:1000000,maxMeshes:2048};
function fixture(map:'barrack'|'woodlands',unresolved:readonly string[]=[]){
 const data=json<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>(`original-scenes/${map==='woodlands'?'woodland':map}/scene.json`),runtime=registerOriginalMapRuntime(map,data);
 const tracks=map==='barrack'?json<OriginalDoorTracks>('original-scenes/barrack/doors.json'):{version:1 as const,doors:[]};
 const doors=new OriginalDoorWorld(data,runtime.scale,tracks),barrels=new OriginalBarrelWorld(runtime);
 const basis=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
 const actors=new OriginalReceiverActorResources(soldier,weapons,{sourceScale:runtime.scale,giResourceOrientation:{x:basis.x,y:basis.y,z:basis.z,w:basis.w},gunScale:1.3,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,provenance:'decoded-source-GI-guns-explicit-Three-basis',sidedness:'double'});
 // Plane primitive and source clone poses are explicit CPU adapters; only the
 // decoded four muzzle resources and map/GI/gun data are recovered assets.
 const fxResources=new OriginalReceiverTransientResources(weapons,{sourceScale:runtime.scale,planeResource:{widthWorld:2,positions:[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1]],faces:[[0,1,2],[0,2,3]],provenance:'declared-world-plane'},maxVertices:100000,maxFaces:100000,provenance:'decoded-four-muzzle-resources',sidedness:'double'});
 const local=new OriginalReceiverLocalWeaponWorld({prefix:seed,cameraHandle:'private-camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as 'ak47',resource,inWorld:handle==='ak47',worldMatrix:matrix(1200),groupAncestry:handle==='ak47'?['private-camera']:[]}))},{sourceScale:runtime.scale,maxCommands:64,maxTextChars:65536,bindModels:(_operation,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
 const projectileModel={handle:'grenade',resource:'rg6grenade',inWorld:false,materialHandle:'declared-material',worldMatrix:matrix(1300),groupAncestry:[]} as const;
 const projectiles=new OriginalReceiverProjectileWorld({prefix:seed,template:projectileModel,catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]}},{maxModels:32,maxActors:16,maxCommands:64,maxTextChars:65536,rocketMaterialHandle:'declared-rocket'});
 const localTx=local.begin();localTx.applyReceipt(p);const localCapture=localTx.snapshotAt(p);localTx.rollback();
 const projectileTx=projectiles.begin();projectileTx.applyReceipt(p);projectileTx.birth({launchId:'declared-flight',weapon:'launcher',cloneFresh:()=>({...projectileModel,handle:'flight',inWorld:true}),resetModel:model=>model});const projectileCapture=projectileTx.snapshotAt(p);projectileTx.rollback();
 const fxBackend={clonePlane:()=>({pose:{...pose(1500),scale:1},geometryProvenance:'declared-plane-clone',inWorld:true}),cloneMuzzle:()=>({pose:{...pose(1400),scale:1},geometryProvenance:'decoded-muzzle-clone',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:(q:{x:number;y:number;z:number;w:number})=>q};
 const fx=new OriginalReceiverTransientWorld(fxBackend,{maxModels:32,maxActors:32,maxShaders:32});let counter=0;const fxTx=fx.begin(name=>`${name}${++counter}`);
 const goody={bspWorld:2,modelPosition:{x:0,y:0,z:0},eyePosition:{x:0,y:1,z:0},weapon:'rifle' as const};
 fxTx.birth({kind:'miss',id:'miss',position:{x:1500,y:1000,z:0},normal:{x:0,y:1,z:0}},goody);fxTx.birth({kind:'muzzle',id:'muzzle',weapon:'rifle',gunPose:pose(1400)},goody);
 const fxModels=fxTx.freezeModels();fxTx.rollback();
 const gi:ReceiverModelEntry={handle:'gi:peer',name:'peer',resource:'GI',kind:'gi',group:'soldiers',inWorld:true,pose:pose(1000),geometryProvenance:'decoded-GI'},gun:ReceiverModelEntry={handle:'peer-gun',name:'peer-gun',resource:'ak47',kind:'gun',group:'gsmokes',inWorld:true,pose:{...pose(1100),scale:1},geometryProvenance:'decoded-ak47'};
 const registry=createOriginalReceiverActorRegistrySnapshot({prefix:p,sceneGeneration:7,callback:0,giHandles:[gi.handle],gunCatalog:[{handle:gun.handle,gi:gi.handle,weapon:'rifle'}],models:[gi,gun],actors:[{sourcePositionWorld:{x:1000,y:1,z:0},actorId:'peer',gi:gi.handle,gun:gun.handle,bsp:1,weapon:'rifle'}],fades:[],fifo:[],pickups:[]},{maxModels:32,maxPickups:16,maxTextChars:65536});
 const templates=ORIGINAL_RECEIVER_MUZZLE_TEMPLATES.map(handle=>({handle,resource:handle,worldMatrix:matrix(1400),inWorld:false,group:'scene' as const,groupAncestry:[]}));
 const options={map,data,doorNames:tracks.doors.map(door=>door.name),sky:data.runtime.sky,sourceScale:runtime.scale,sceneGeneration:7,weaponGeometry:weapons,actorResources:actors,transientResources:fxResources,muzzleTemplates:templates,transientUnresolved:unresolved,provenance:'actual-assets-declared-complete-CPU-adapter',sidedness:'double' as const,budgets:limits};
 const composer=createOriginalSoloReceiverSceneInventory(options);
 const state:ReceiverCurrentEnvironmentState={health:createOriginalPlayerHealth(),alive:true,barrels,doors,localWeapons:localCapture,projectiles:projectileCapture,transients:Object.freeze({prefix:p,models:fxModels,expectedHandles:Object.freeze(fxModels.map(model=>model.handle)),planeWidthWorld:2})};
 const snapshot=()=>composer.snapshotAt(p,state,registry);
 const full=(external:ReturnType<typeof snapshot>)=>[...external.models,...registry.models,...fxModels];
 return {map,data,scale:runtime.scale,doors,barrels,actors,fxResources,fxBackend,local,projectiles,composer,state,registry,gi,gun,fxModels,snapshot,full,options,dispose(){composer.dispose();actors.dispose();fxResources.dispose();local.release();projectiles.release();}};
}
function rayToTriangle(model:OriginalReceiverRayModel){
 const face=model.faces.find(face=>{
  const [a,b,c]=face.map(i=>new THREE.Vector3().fromArray(model.positions[i]).applyMatrix4(new THREE.Matrix4().fromArray(model.worldMatrix)));
  return new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).lengthSq()>1e-16;
 })!;
 const [a,b,c]=face.map(i=>new THREE.Vector3().fromArray(model.positions[i]).applyMatrix4(new THREE.Matrix4().fromArray(model.worldMatrix)));
 const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize(),point=a.clone().add(b).add(c).multiplyScalar(1/3);
 return {origin:point.clone().addScaledVector(normal,.05),direction:normal.negate()};
}
describe('real recovered Solo scene composition with declared primitive and pose adapters',()=>{
 it.each(['barrack','woodlands'] as const)('%s joins actual resources and executes complete GI and gun queries',map=>{
  const f=fixture(map);try{
   const external=f.snapshot();expect(external.missing).toEqual([]);expect(external.models.some(model=>model.kind==='fixed')).toBe(true);expect(external.models.filter(model=>model.kind==='local-weapon')).toHaveLength(7);expect(external.models.some(model=>model.kind==='sky')).toBe(true);
   // The actual raw ambient record is metadata, not an affine model. Its
   // exclusion must not rewrite recovered input or invent a query primitive.
   const ambient=f.data.nodes.find(node=>node.name==='UIAmbient')!;
   expect(ambient.resource).toBe('');expect(ambient.matrix).toEqual(Array(16).fill(0));expect(external.models.some(model=>model.name==='UIAmbient')).toBe(false);
   const models=f.full(external);expect(new Set(models.map(model=>model.handle)).size).toBe(models.length);
   const query=f.composer.geometryQuery(models,0,7,p,f.registry);
   for(const [entry,layer] of [[f.gi,'live-gi'],[f.gun,'held-gun']] as const){const resource=f.actors.resolve(entry,layer),ray=rayToTriangle(resource),hit=query.nearestDetailed(ray.origin,ray.direction,{maxDistance:.1,bullet:false});expect(hit?.handle).toBe(entry.handle);expect(hit?.layer).toBe(layer);if(entry.kind==='gun')expect(query.nearestDetailed(ray.origin,ray.direction,{maxDistance:.1,bullet:true})).toBeNull();}
   expect(f.projectiles.freeze().actors).toEqual([]);expect(f.local.freeze().prefix).toEqual(seed);
  }finally{f.dispose();}
 });
 it('rejects nonaffine geometry and a malformed metadata ancestor of geometry instead of repairing transforms',()=>{
  const f=fixture('woodlands');try{
   const node=f.data.nodes.find(node=>node.resource&&f.data.meshes.some(mesh=>mesh.resource.toLowerCase()===node.resource.toLowerCase()))!;
   const malformed={...f.data,nodes:f.data.nodes.map(entry=>entry===node?{...entry,matrix:Array(16).fill(0)}:entry)};
   expect(()=>createOriginalSoloReceiverSceneInventory({...f.options,data:malformed})).toThrow(/hierarchy|affine|matrix/i);
   const child={...node,name:'ambient-geometry-child',parent:'UIAmbient',matrix:[...I]},descendant={...f.data,nodes:[...f.data.nodes,child]};
   expect(()=>createOriginalSoloReceiverSceneInventory({...f.options,data:descendant})).toThrow(/hierarchy|affine|matrix/i);
   const malformedGroup={name:'malformed-source-group',parent:'World',resource:'',shader:'',visibility:1,matrix:Array(16).fill(0)};
   const grouped={...f.data,nodes:[...f.data.nodes,malformedGroup,{...child,parent:malformedGroup.name}]};
   expect(()=>createOriginalSoloReceiverSceneInventory({...f.options,data:grouped})).toThrow(/hierarchy|affine|matrix/i);
   const ambient=f.data.nodes.find(entry=>entry.name==='UIAmbient')!;
   expect(()=>createOriginalSoloReceiverSceneInventory({...f.options,data:{...f.data,nodes:[...f.data.nodes,{...ambient}]}})).toThrow(/duplicate/i);
   expect(f.data.nodes.find(entry=>entry.name==='UIAmbient')!.matrix).toEqual(Array(16).fill(0));expect(f.data.nodes).not.toContain(child);
  }finally{f.dispose();}
 });
 it('reads actual private door opening and removed barrel membership without changing the borrowed original world',()=>{
  const f=fixture('barrack');try{
   const initial=f.snapshot(),fork=f.doors.fork(),name=f.doors.getStates()[0].name;fork.open(name,0);fork.update(.5);
   const barrels=f.barrels.fork();barrels.applySnapshots([]);
   const moved=f.composer.snapshotAt(p,{...f.state,doors:fork,barrels},f.registry);
   expect(moved.models.find(model=>model.name===name)!.worldMatrix).not.toEqual(initial.models.find(model=>model.name===name)!.worldMatrix);
   const barrel=initial.models.find(model=>model.kind==='barrel')!;expect(barrel.inWorld).toBe(true);expect(moved.models.find(model=>model.handle===barrel.handle)!.inWorld).toBe(false);expect(f.barrels.bodies.length).toBeGreaterThan(0);
  }finally{f.dispose();}
 });
 it('rejects omitted models and substituted actor identity rather than falling back to world-only rays',()=>{
  const f=fixture('woodlands');try{
   const models=f.full(f.snapshot());expect(()=>f.composer.geometryQuery(models.filter(model=>model.handle!==f.gi.handle),0,7,p,f.registry)).toThrow();
   expect(()=>f.composer.geometryQuery(models.map(model=>model.handle===f.gi.handle?{...model,inWorld:false}:model),0,7,p,f.registry)).toThrow();
   const fx=f.fxModels[0];expect(fx.worldMatrix).toBeUndefined();
   expect(()=>f.composer.geometryQuery(models.map(model=>model.handle===fx.handle?{...model,pose:{...model.pose,position:{...model.pose.position,x:model.pose.position.x+1}}}:model),0,7,p,f.registry)).toThrow(/external model/);
   expect(()=>f.composer.snapshotAt({...p,tick:1},f.state,f.registry)).toThrow(/prefix/);
   expect(()=>f.composer.snapshotAt(p,f.state,{...f.registry})).toThrow();
  }finally{f.dispose();}
 });
 it('preserves explicit missing FX evidence and refuses a complete query',()=>{
  const f=fixture('woodlands',['unmeasured-source-plane-membership']);try{const snapshot=f.snapshot();expect(snapshot.missing).toContain('unmeasured-source-plane-membership');expect(()=>f.composer.geometryQuery(f.full(snapshot),0,7,p,f.registry)).toThrow();}finally{f.dispose();}
 });
 it('uses actual Controller staged FX once in a full recovered external composition',()=>{
  const f=fixture('woodlands');try{
   const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:7,sourceScale:f.scale,target:{health:createOriginalPlayerHealth(),alive:true},barrels:f.barrels,doors:f.doors,localWeaponWorld:f.local,projectileWorld:f.projectiles,maxCommands:32,maxOutcomes:32,maxModels:2048,maxTextChars:1000000,snapshotAt:(prefix,state,actors)=>f.composer.snapshotAt(prefix,state,actors!)});
   let active:ReturnType<OriginalReceiverSceneController['begin']>|undefined;
   const lifecycle={cloneGI:()=>({pose:pose(1000),geometryProvenance:'decoded-GI'}),cloneGun:()=>({pose:pose(1100),geometryProvenance:'decoded-gun'}),heldGunPose:(gi:ReceiverModelEntry)=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource' as const}),reparentGunMembership:()=>true,dropYaw:()=>0};
   const controller=new OriginalReceiverSceneController(f.composer.createGeometryBackend(lifecycle),f.fxBackend,env,{model:{sceneGeneration:7,sourceScale:f.scale,eyeHeight:1,goodyBspWorld:2,maxModels:2048,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:32});
   env.arm({physicalCallback:0,goody:{bspWorld:2,modelPosition:{x:0,y:0,z:0},eyePosition:{x:0,y:1,z:0},weapon:'rifle'},frames:[{prefix:p,commands:[{kind:'transient-birth',event:{kind:'muzzle',id:'controller-muzzle',weapon:'rifle',gunPose:pose(1400)}}]}]});
   active=controller.begin();active.applyExternalReceipt(0,0);const models=active.freezeModels(),fx=models.filter(model=>model.kind==='transient'&&model.group==='gsmokes');
   expect(fx).toHaveLength(1);expect(new Set(models.map(model=>model.handle)).size).toBe(models.length);expect(controller.freezeTransientModels()).toEqual([]);
   expect(()=>f.composer.geometryQuery(models,0,7,p,active!.freezeActorRegistry())).not.toThrow();
   // Birth inserts constructingGI between the external snapshot and the actual
   // downward query. This exercises real complete geometry, not an empty hit oracle.
   active.birth({actorId:'actual-peer',targetFeet:{x:1000,y:1000,z:0},targetYaw:0,callback:0});
   const registry=active.freezeActorRegistry(),owned=new Map(registry.models.map(model=>[model.handle,model]));
   expect(registry.actors.map(actor=>actor.actorId)).toEqual(['actual-peer']);
   const finalModels=active.freezeModels().map(model=>owned.get(model.handle)??model);
   expect(()=>f.composer.geometryQuery(finalModels,0,7,p,registry)).not.toThrow();
   expect(finalModels.filter(model=>model.kind==='transient'&&model.group==='gsmokes')).toHaveLength(1);
   active.rollback();expect(controller.freezeTransientModels()).toEqual([]);expect(controller.freezeModels()).toEqual([]);
  }finally{f.dispose();}
 });
});
