import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {type OriginalSoloSceneResourcesOptions} from './originalSoloSceneResources';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalCombatEffectResources} from './originalCombatEffectPresentation';
import {createOriginalExplosionResources} from './originalExplosionPresentation';
import {createOriginalSoloTransientRendererBinding} from './originalSoloTransientResources';
import {captureOriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {ORIGINAL_COMBAT_PLANE_SIZE} from '../shared/originalCombatEffects';

// Real decoded resources, CPU textures and explicit prototype policies. This
// assembly test neither starts a browser nor establishes complete scene/native
// clone-default, shader, skin or ray fidelity.
const base=new URL('../public/assets/',import.meta.url);
const geometry=JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'];
const rigMotion=JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'];
const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData;
const families={pistol:'mfpistol',shotgun:'mfspas12',rifle:'mfak47',sniper:'mfdragunov'} as const;
const basis=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
function fixture(sourceScale=ORIGINAL_MAP_SCALE){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const soldierResources=createOriginalSoldierResources({geometry,rigMotion,texture},{geometry:weapons,textures},{resourceBindingId:'scene-actor-generation-42'});
 const combat=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()}),explosion=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
 const material=new THREE.MeshBasicMaterial({map:explosion.textures.rocket}),root=new THREE.Group();root.position.set(2,3,4);root.rotation.set(.2,.3,-.1);root.scale.setScalar(1.3);
 const plane=new THREE.Mesh(combat.geometry,material);plane.position.set(1,2,-3);plane.scale.setScalar(.8);root.add(plane);
 const muzzles={} as Record<keyof typeof families,OriginalSoloSceneResourcesOptions['muzzles']['pistol']>;
 for(const weapon of Object.keys(families) as (keyof typeof families)[]){const mesh=new THREE.Mesh(soldierResources.gunGeometries.get(families[weapon])!,soldierResources.gunMaterials.get('mfmachinegun')!);mesh.position.set(.2,.4,-.6);mesh.rotation.set(-.3,.1,.2);mesh.scale.setScalar(.9);root.add(mesh);muzzles[weapon]={mesh,phase:17,geometryProvenance:`actual decoded ${families[weapon]}`,inWorld:weapon==='rifle',group:'gsmokes',groupAncestry:['gsmokes']};}
 root.updateMatrixWorld(true);
 const renderToWorld=new THREE.Matrix4().compose(new THREE.Vector3(11,12,13),new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,.1,-.2)),new THREE.Vector3(1,1,1)).toArray();
 const transientBinding=createOriginalSoloTransientRendererBinding({soldierResources,combatResources:combat,explosionResources:explosion,planeGeometry:combat.geometry,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,planeGeometryProvenance:'actual application WORLD plane',sourceScale,provenance:'actual scene FX generation',sidedness:'double',resourceBindingId:'scene-FX-generation-42',textureBindingId:'scene-texture-generation-42',nearFilter:THREE.LinearFilter,maxVertices:100000,maxFaces:100000,maxResourceEntries:256,maxTextChars:8192});
 const seed={pose:{position:{x:2,y:3,z:4},yaw:.37,phase:77,scale:1},geometryProvenance:'explicit decoded actor clone'};
 const plan=captureOriginalSoloActorDropYawPlan(1,[{actorId:'a',random36:9}],{maxEntries:8,maxTextChars:8192});
 const options:OriginalSoloSceneResourcesOptions={soldierResources,weapons,transientBinding,renderToWorld,
  actor:{sourceScale,giResourceOrientation:{x:basis.x,y:basis.y,z:basis.z,w:basis.w},gunScale:1,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,maxMeshes:256,maxDescriptorTextChars:8192,provenance:'actual scene actor generation',sidedness:'double'},
  actorLifecycle:{gi:seed,guns:{pistol:seed,shotgun:seed,rifle:seed,launcher:seed,rpg:seed,sniper:seed},parentRestoresMembership:true,readDropYawPlan:()=>plan,maxTextChars:8192},
  transientQuery:{maxVertices:100000,maxFaces:100000,maxMeshes:256,maxTextChars:8192},plane:{mesh:plane,phase:17,geometryProvenance:'actual application WORLD plane',inWorld:false},muzzles,
  transientPolicy:{initialShader:{handle:'observed-initial-plane-shader',texture:'bangrocket',recycled:false,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},blend:100,emissiveWhite:true},pointAtPolicy:'copy-plane-positive-z',omittedUpPolicy:'copy-negative-z',parallelUpPolicy:'copy-x',explicitUpPolicy:'copy-three-lookat',selfRotatePolicy:'copy-local-xyz',coincidentPolicy:'retain',maxTextChars:8192}};
 return {options,root,plane,material,soldierResources,combat,explosion,texture,textures,dispose(){soldierResources.dispose();material.dispose();combat.dispose();explosion.dispose();texture.dispose();for(const value of textures.values())value.dispose();}};
}

import {createOriginalSoloSceneAssembly,type OriginalSoloSceneAssemblyOptions} from './originalSoloSceneAssembly';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentCommand} from '../shared/originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController} from '../shared/originalReceiverSceneController';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from '../shared/originalDoorWorld';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalPlayerHealth} from '../shared/originalPlayerHealth';
import type {OriginalSceneData} from '../shared/originalSceneGeometry';
import type {OriginalSkyDescription} from '../shared/originalSkyRay';
import type {OriginalSoloFreshBanksOptions} from './originalSoloFreshBanks';
import type {ReceiverLocalWeaponHandle} from '../shared/originalReceiverLocalWeaponInventory';
import {captureOriginalSoloProjectileResource,createOriginalSoloProjectileBirth} from './originalSoloProjectileBinding';
import {createOriginalSoloCurrentSceneLease} from '../shared/originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloObserver} from '../shared/originalSoloObserverWorld';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';
import {createOriginalSoloActorDropCapture} from './originalSoloActorDropCapture';
import {isReceiverDropYawRequest,type ReceiverDropYawRequest} from '../shared/originalReceiverModelWorld';
import type {OriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';

const json=<T>(path:string)=>JSON.parse(readFileSync(new URL(path,base),'utf8')) as T;
const maps={barrack:json<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/barrack/scene.json'),woodlands:json<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/woodland/scene.json')};
const doorTracks=json<OriginalDoorTracks>('original-scenes/barrack/doors.json');
const handles:ReceiverLocalWeaponHandle[]=['pistol','spas12','ak47','rg6','rpg','dragunov','rocket'];
const receipt=(generation=42)=>({kind:'receipt' as const,sceneGeneration:generation,callback:0,tick:0});
function assemblyFixture(map:'barrack'|'woodlands',generation=42,constructorSeeds=false,actorConstructors=false){
 const f=fixture(),collection=createOriginalWeapons({geometry:weapons,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});
 const parent=new THREE.Group();parent.position.set(4,3,8);parent.rotation.set(.3,-.2,.1);
 for(const group of collection.models.values())parent.add(group);parent.add(collection.resources.get('rg6grenade')!);parent.updateMatrixWorld(true);
 const data=maps[map],runtime=registerOriginalMapRuntime(map,data),doors=new OriginalDoorWorld(data,runtime.scale,map==='barrack'?doorTracks:{version:1,doors:[]}),barrels=new OriginalBarrelWorld(runtime);
 const ancestry={pistol:['private-camera'],spas12:['private-camera'],ak47:['private-camera'],rg6:['private-camera'],rpg:['private-camera'],dragunov:['private-camera'],rocket:['rpg','private-camera']};
 const camera=new THREE.Matrix4().fromArray(f.options.renderToWorld).multiply(parent.matrixWorld).toArray();
 const bankOptions:OriginalSoloFreshBanksOptions={map,sceneGeneration:generation,score:0,goldScore:0,sourceScale:runtime.scale,renderToWorld:f.options.renderToWorld,cameraHandle:'private-camera',cameraWorldMatrix:camera,initialGunPositionSource:{x:-12,y:-20,z:5},initialLoadedRocket:false,membership:Object.fromEntries(handles.map(handle=>[handle,handle==='rg6'])) as Record<ReceiverLocalWeaponHandle,boolean>,ancestry,followOffworldParents:true,parentRestoresMembership:true,grenadeMaterialHandle:'borrowed-grenade',grenadeAncestry:['source-parent'],rocketMaterialHandle:'canonical-rpg',maxCommands:256,maxTextChars:65536,maxProjectileModels:32,maxProjectileActors:8,maxReportNames:32};
 const prototype=(weapon:keyof typeof families)=>({...f.options.muzzles[weapon],group:'scene' as const,groupAncestry:[]});
 const supplied={...f.options,muzzles:{pistol:prototype('pistol'),shotgun:prototype('shotgun'),rifle:prototype('rifle'),sniper:prototype('sniper')}};
 const seedRig=actorConstructors?new OriginalSoldier(f.soldierResources,{weapon:'rpg'}):undefined;
 if(seedRig)supplied.actorLifecycle={parentRestoresMembership:true,readDropYawPlan:f.options.actorLifecycle.readDropYawPlan,maxTextChars:8192,constructorSeeds:{capture:seedRig.readConstructorSeedCapture(),gunFactory:seedRig.readGunConstructorSeedCapture('rpg')!,gunClonePolicy:'copy-fresh-gun-mesh-factory',giProvenance:'actual fresh GI constructor',gunProvenance:{pistol:'fresh pistol constructor',shotgun:'fresh spas12 constructor',rifle:'fresh ak47 constructor',launcher:'fresh rg6 constructor',rpg:'fresh rpg constructor',sniper:'fresh dragunov constructor'},maxSeeds:7,maxTextChars:8192}};
 const {plane,muzzles,...baseResources}=supplied;
 const metadata=(weapon:keyof typeof families)=>({geometryProvenance:muzzles[weapon].geometryProvenance,group:'scene' as const,groupAncestry:[]});
 const resources:OriginalSoloSceneAssemblyOptions['resources']=constructorSeeds?{...baseResources,transientPolicy:{...baseResources.transientPolicy,initialShaderIdentity:'per-clone-name',cloneMembership:'copy-effect-birth-parented'},effectPrototypes:{planeMaterial:plane.mesh.material as THREE.MeshBasicMaterial,constructorPolicy:'copy-fresh-mesh-identity-offworld-phase-zero',maxModels:5,maxTextChars:8192,muzzles:{pistol:metadata('pistol'),shotgun:metadata('shotgun'),rifle:metadata('rifle'),sniper:metadata('sniper')}}}:supplied;
 const assemblyOptions={resources,banks:bankOptions,inventory:{data,doorNames:map==='barrack'?doorTracks.doors.map(door=>door.name):[],sky:data.runtime.sky,transientUnresolved:[],provenance:'actual decoded assembly explicit CPU policies',sidedness:'double' as const,budgets:{maxModels:2048,maxVertices:2000000,maxFaces:2000000,maxTextChars:65536,maxMeshes:256}}};
 const assembly=createOriginalSoloSceneAssembly(collection,assemblyOptions),target={health:createOriginalPlayerHealth(),alive:true};
 const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:generation,sourceScale:runtime.scale,target,barrels,doors,...assembly.backends,maxCommands:256,maxOutcomes:64,maxModels:2048,maxTextChars:1000000,snapshotAt:(prefix,state,actors)=>assembly.snapshotAt(prefix,state,actors!)});
 const controller=new OriginalReceiverSceneController(assembly.backends.model,assembly.backends.transient,env,{model:{sceneGeneration:generation,sourceScale:runtime.scale,eyeHeight:85*runtime.scale,goodyBspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels:2048,maxPickups:16},transient:{maxModels:64,maxActors:64,maxShaders:64,maxTextChars:65536},maxEffects:64});
 const goody={bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,modelPosition:{x:1000,y:1000,z:0},eyePosition:{x:1000,y:1001,z:0},weapon:'launcher' as const};
 const arm=(commands:readonly ReceiverCurrentEnvironmentCommand[])=>env.arm({physicalCallback:0,goody,frames:[{prefix:receipt(generation),commands}]});
 return {f,map,generation,data,runtime,doors,barrels,collection,assemblyOptions,assembly,env,controller,arm,seedRig,dispose(){assembly.release();seedRig?.dispose();collection.dispose();f.dispose();}};
}

function commands(f:ReturnType<typeof assemblyFixture>):ReceiverCurrentEnvironmentCommand[]{
 const grenade=f.collection.resources.get('rg6grenade')!;
 const freshModel=captureOriginalSoloProjectileResource(grenade,{handle:'grenade',resource:'rg6grenade',inWorld:false,materialHandle:'borrowed-grenade',groupAncestry:['source-parent'],renderToWorld:f.f.options.renderToWorld,maxTextChars:65536});
 const birth=createOriginalSoloProjectileBirth({launchId:'explicit-flight',weapon:'launcher',freshModel,pose:{launchId:'explicit-flight',weapon:'launcher',position:{x:1000,y:1000,z:0},direction:{x:0,y:0,z:-1},renderToWorld:f.f.options.renderToWorld,orientationPolicy:'copy-source-basis-unit-reset'},rocketMaterialHandle:'canonical-rpg',maxTextChars:65536});
 return [{kind:'projectile-birth',birth},{kind:'transient-birth',event:{kind:'muzzle',id:'explicit-muzzle',weapon:'rifle',gunPose:{position:{x:1100,y:1000,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}}}}];
}
function stage(f:ReturnType<typeof assemblyFixture>,reuseArmedProgram=false){
 // CURRENT retains its admitted operand/function captures on rollback. Retry
 // the same arm rather than constructing another projectile birth program.
 if(!reuseArmedProgram)f.arm(commands(f));const tx=f.controller.begin();tx.applyExternalReceipt(0,0);
 const born=tx.birth({actorId:'actual-peer',targetFeet:{x:1000,y:1000,z:0},targetYaw:0,callback:0});
 tx.beforeCallback('actual-peer',{position:{x:1000,y:1000,z:0},yaw:.2,motionTime:750,weapon:'rifle'});
 tx.afterCallback('actual-peer',{position:{x:1000,y:1000,z:0},yaw:.2,motionTime:750,weapon:'rifle'});
 const registry=tx.freezeActorRegistry(),owned=new Map(registry.models.map(model=>[model.handle,model])),models=tx.freezeModels().map(model=>owned.get(model.handle)??model);
 return {tx,born,models,registry};
}

describe('complete decoded Solo assembly through actual CURRENT and scene controller',()=>{
 it.each(['barrack','woodlands'] as const)('%s forwards a live producer drop owner and retains actual detach operands across joint rollback and life release',map=>{
  const f=assemblyFixture(map,42,true,true),owners=new Map<string,ReturnType<typeof createOriginalSoloSceneAssembly>>();
  const caches=new Map<string,ReturnType<typeof createOriginalSoloActorDropCapture>>(),samplers=new Map<string,ReturnType<typeof vi.fn>>();
  const admissions=new Map<string,{request:ReceiverDropYawRequest;plan:OriginalSoloActorDropYawPlan}[]>();
  const borrowedGeometry=f.f.soldierResources.gunGeometries.get('rg6')!,borrowedMaterial=f.f.soldierResources.gunMaterials.get('rg6')!;
  const geometryDispose=vi.spyOn(borrowedGeometry,'dispose'),materialDispose=vi.spyOn(borrowedMaterial,'dispose');
  const sourcePositions=Array.from(borrowedGeometry.getAttribute('position').array),sourceMatrices=[...f.collection.resources].map(([name,mesh])=>({name,matrix:mesh.matrixWorld.toArray()}));
  const constructorCapture=f.seedRig!.readConstructorSeedCapture(),poolBefore=f.f.soldierResources.muzzleModels.stats();
  // Actual packs, complete inventory and CURRENT/coordinator ownership; the
  // no-fire program and random(36) sampler are explicit test capture policies.
  const worlds=new OriginalSoloObserverWorlds(f.runtime,{templateDoors:f.doors,templateBarrels:f.barrels,createReceiverScene:registration=>{
   let owner:ReturnType<typeof createOriginalSoloSceneAssembly>|undefined,observer:OriginalSoloObserver|undefined;
   const sample=vi.fn(()=>registration.id==='a'?9:12),cache=createOriginalSoloActorDropCapture({sceneGeneration:registration.lifeGeneration,maxEntries:8,maxTextChars:8192,sampleRandom36:sample,readCommittedCallback:()=>observer?.callback??0});
   caches.set(registration.id,cache);samplers.set(registration.id,sample);admissions.set(registration.id,[]);
   const controllerModel={dropRequestOwner:cache.requestOwner,lifecycleJournal:{maxEntries:64,maxTextChars:8192},eyeHeight:85*f.runtime.scale,goodyBspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels:2048,maxPickups:16};
   const lease=createOriginalSoloCurrentSceneLease({sourceScale:f.runtime.scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,requireActorResources:true,requireTransientResources:true,
    environment:{maxCommands:256,maxOutcomes:64,maxModels:2048,maxTextChars:map==='woodlands'?1000000:65536},
    controller:{model:controllerModel,transient:{maxModels:64,maxActors:64,maxShaders:64,maxTextChars:65536},maxEffects:64,transientState:true},
    createBackends:context=>{
     observer=context.observer;
     const resources={...f.assemblyOptions.resources,actorLifecycle:{...f.assemblyOptions.resources.actorLifecycle,readDropYawPlan:(id:string,callback:number,request?:ReceiverDropYawRequest)=>{
      expect(isReceiverDropYawRequest(request,cache.requestOwner)).toBe(true);
      expect(request).toMatchObject({actorId:'b',callback:2,prefix:{kind:'callback',sceneGeneration:registration.lifeGeneration,callback:2}});
      const plan=cache.readDropYawPlan(id,callback,request);admissions.get(registration.id)!.push({request:request!,plan});return plan;
     }}};
     owner=createOriginalSoloSceneAssembly(f.collection,{...f.assemblyOptions,resources,banks:{...f.assemblyOptions.banks,sceneGeneration:context.lifeGeneration}});owners.set(registration.id,owner);return owner.backends;
    },
    captureLocalWeaponCallback:context=>({cameraWorldMatrix:f.assemblyOptions.banks.cameraWorldMatrix,velocityWorld:context.body.velocity,commands:[]}),
    captureLoadoutProgram:(_context,prefixes,_previous,admitted)=>({receiptCommands:admitted.map(admission=>({kind:'admitted-bang' as const,blast:admission.blast})),...(prefixes.callback?{callbackCommands:[{kind:'weapon-report-send' as const},{kind:'weapon-finish' as const}]}:{})}),
    goodyAt:context=>({eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,weapon:context.weapon??'launcher'}),
    snapshotAt:(prefix,state,_context,actors)=>owner!.snapshotAt(prefix,state,actors!),
   });
   // Lease construction must capture the opaque identity, before a caller
   // edits its options and before lazy backends first acquire their owners.
   controllerModel.dropRequestOwner=Object.freeze({});
   return {...lease,release:()=>{try{lease.release();}finally{cache.release();}}};
  }});
  let restoreLateFailure:(()=>void)|undefined;
  try{
   const a=worlds.register({id:'a',name:'A',eye:{x:1000,y:1000,z:0}}),b=worlds.register({id:'b',name:'B',eye:{x:1200,y:1000,z:0}}),c=worlds.register({id:'c',name:'C',eye:{x:1400,y:1000,z:0}});a.weapon=b.weapon=c.weapon='launcher';
   worlds.physics(0,{skipIds:new Set(['a','b','c'])});for(const id of ['a','b','c'])worlds.goody(id);worlds.completeGoody(0);worlds.actors(0);
   expect(a.modelState!.actors.map(actor=>actor.actorId)).toEqual(['b','c']);
   for(const sample of samplers.values())expect(sample).not.toHaveBeenCalled();
   expect(worlds.damage('b',1000,1,{ownerId:'a',ownerName:'A'})).toMatchObject({dead:true});
   expect(worlds.worlds.has('b')).toBe(false);expect(()=>caches.get('b')!.readDropYawPlan('b',2)).toThrow(/unavailable/);
   expect(a.modelState!.actors.some(actor=>actor.actorId==='b')).toBe(true);
   for(const sample of samplers.values())expect(sample).not.toHaveBeenCalled();
   const before=a.modelState!,localBefore=owners.get('a')!.banks.localWeaponWorld.freeze(),loadoutBefore=owners.get('a')!.banks.loadoutWorld.freeze(),projectileBefore=owners.get('a')!.banks.projectileWorld.freeze(),reportBefore=owners.get('a')!.banks.weaponReportWorld.freeze();
   // This observer is prepared after A, so A has executed its actual detach
   // and complete geometry query before the joint transaction is rolled back.
   const lateFailure=vi.spyOn(c.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('late peer preparation');});restoreLateFailure=()=>lateFailure.mockRestore();
   worlds.physics(33,{skipIds:new Set(['a','c'])});worlds.goody('a');worlds.goody('c');
   expect(()=>worlds.completeGoody(33)).toThrow('late peer preparation');
   expect(a.callback).toBe(1);expect(c.callback).toBe(1);expect(a.modelState).toBe(before);
   expect(samplers.get('a')).toHaveBeenCalledTimes(1);expect(samplers.get('c')).not.toHaveBeenCalled();
   expect(owners.get('a')!.banks.localWeaponWorld.freeze()).toEqual(localBefore);expect(owners.get('a')!.banks.loadoutWorld.freeze()).toEqual(loadoutBefore);expect(owners.get('a')!.banks.projectileWorld.freeze()).toEqual(projectileBefore);expect(owners.get('a')!.banks.weaponReportWorld.freeze()).toEqual(reportBefore);
   const first=admissions.get('a')![0];expect(isReceiverDropYawRequest(first.request,caches.get('a')!.requestOwner)).toBe(false);
   // Retry the retained captured batch directly: no physics, input or goody
   // recapture, and no second draw for the already admitted A/b/callback-2 key.
   worlds.completeGoody(33);
   expect(a.callback).toBe(2);expect(c.callback).toBe(2);expect(admissions.get('a')).toHaveLength(2);expect(admissions.get('a')![1].plan).toBe(first.plan);
   expect(samplers.get('a')).toHaveBeenCalledTimes(1);expect(samplers.get('c')).toHaveBeenCalledTimes(1);
   expect(a.modelState!.actors.map(actor=>actor.actorId)).toEqual(['c']);expect(a.modelState!.pickups).toHaveLength(1);expect(a.modelState!.fades).toHaveLength(1);
   const pickup=a.modelState!.pickups[0],gun=a.modelState!.models.find(model=>model.handle===pickup.handle)!;
   expect(gun.kind).toBe('gun');expect(gun.inWorld).toBe(true);expect(gun.pose.yaw).toBeCloseTo(Math.PI/2);expect(c.modelState!.models.find(model=>model.handle===c.modelState!.pickups[0].handle)!.pose.yaw).toBeCloseTo(2*Math.PI/3);
   expect(owners.get('a')!.resourceOwner.actorDescriptor.resourceBindingId).toBe(f.f.soldierResources.resourceBindingId);
   expect(f.seedRig!.readConstructorSeedCapture()).toBe(constructorCapture);expect(f.f.soldierResources.muzzleModels.stats()).toEqual(poolBefore);
   expect(Array.from(borrowedGeometry.getAttribute('position').array)).toEqual(sourcePositions);expect([...f.collection.resources].map(([name,mesh])=>({name,matrix:mesh.matrixWorld.toArray()}))).toEqual(sourceMatrices);
   worlds.clear();for(const cache of caches.values())expect(()=>cache.readDropYawPlan('b',2)).toThrow(/unavailable/);
   for(const owner of owners.values()){expect(()=>owner.resourceOwner.actorQueryResources.readResourceDescriptor()).toThrow(/disposed/);expect(()=>owner.banks.localWeaponWorld.freeze()).toThrow(/released/);}
   expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
  }finally{restoreLateFailure?.();worlds.clear();geometryDispose.mockRestore();materialDispose.mockRestore();f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s configured CURRENT coordinator consumes complete assembled resources and releases each observer life',map=>{
  const f=assemblyFixture(map),owners=new Map<string,ReturnType<typeof createOriginalSoloSceneAssembly>>();
  // Explicit no-fire callback program exercises integration and ownership. It
  // is not the default Game factory or evidence for native human/bot controls.
  const worlds=new OriginalSoloObserverWorlds(f.runtime,{templateDoors:f.doors,templateBarrels:f.barrels,createReceiverScene:registration=>{
   let owner:ReturnType<typeof createOriginalSoloSceneAssembly>|undefined;
   return createOriginalSoloCurrentSceneLease({sourceScale:f.runtime.scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,requireActorResources:true,requireTransientResources:true,
    environment:{maxCommands:256,maxOutcomes:64,maxModels:2048,maxTextChars:map==='woodlands'?1000000:65536},controller:{model:{eyeHeight:85*f.runtime.scale,goodyBspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels:2048,maxPickups:16},transient:{maxModels:64,maxActors:64,maxShaders:64,maxTextChars:65536},maxEffects:64,transientState:true},
    createBackends:context=>{owner=createOriginalSoloSceneAssembly(f.collection,{...f.assemblyOptions,banks:{...f.assemblyOptions.banks,sceneGeneration:context.lifeGeneration}});owners.set(registration.id,owner);return owner.backends;},
    captureLocalWeaponCallback:context=>({cameraWorldMatrix:f.assemblyOptions.banks.cameraWorldMatrix,velocityWorld:context.body.velocity,commands:[]}),
    captureLoadoutProgram:(_context,prefixes,_previous,admitted)=>({receiptCommands:admitted.map(admission=>({kind:'admitted-bang' as const,blast:admission.blast})),...(prefixes.callback?{callbackCommands:[{kind:'weapon-report-send' as const},{kind:'weapon-finish' as const}]}:{})}),
    goodyAt:context=>({eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,weapon:context.weapon??'launcher'}),
    snapshotAt:(prefix,state,_context,actors)=>owner!.snapshotAt(prefix,state,actors!),
   });
  }});
  try{
   const a=worlds.register({id:'a',name:'A',eye:{x:1000,y:1000,z:0}}),b=worlds.register({id:'b',name:'B',eye:{x:1200,y:1000,z:0}});a.weapon=b.weapon='launcher';
   worlds.physics(0,{skipIds:new Set(['a','b'])});worlds.goody('a');worlds.goody('b');worlds.completeGoody(0);
   expect(owners.size).toBe(2);expect(a.callback).toBe(1);expect(b.callback).toBe(1);expect(a.mirror.freeze()).toHaveLength(1);expect(b.mirror.freeze()).toHaveLength(1);
   for(const [id,owner] of owners){expect(owner.banks.localWeaponWorld.freeze().prefix).toMatchObject({kind:'callback',callback:1});expect(owner.banks.weaponReportWorld.freeze().shots).toBe(0);expect(owner.resourceOwner.actorDescriptor.resourceBindingId).toBe(f.f.soldierResources.resourceBindingId);expect(worlds.worlds.get(id)!.localWeapons!.models).toHaveLength(7);expect(worlds.worlds.get(id)!.loadout!.ammo.launcher).toBe(6);}
   expect(owners.get('a')!.banks.localWeaponWorld).not.toBe(owners.get('b')!.banks.localWeaponWorld);
   worlds.clear();for(const owner of owners.values()){expect(()=>owner.banks.localWeaponWorld.freeze()).toThrow(/released/);expect(()=>owner.resourceOwner.actorQueryResources.readResourceDescriptor()).toThrow(/disposed/);}
  }finally{worlds.clear();f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s composes actual fresh GI/gun and effect constructor observations through complete scene rollback/retry',map=>{
  const f=assemblyFixture(map,42,true,true);try{
   const original=f.seedRig!.readConstructorSeedCapture(),first=stage(f),speculative=first.models;expect(first.born.queryCoverage.complete).toBe(true);first.tx.rollback();expect(f.controller.freezeModels()).toEqual([]);
   const retry=stage(f,true);expect(retry.models).toEqual(speculative);retry.tx.commit();expect(f.seedRig!.readConstructorSeedCapture()).toBe(original);
   const gi=f.controller.freezeModels().find(m=>m.kind==='gi')!;expect(f.assembly.resourceOwner.actorLifecycle.cloneGI('fresh-independent').pose.phase).toBe(0);expect(gi.pose.phase).toBe(750);expect(gi.pose.scale).toBe(.045);expect(f.assembly.resourceOwner.actorQueryResources.resolve(gi,'live-gi').positions).toHaveLength(742);expect(f.assembly.banks.projectileWorld.freeze().actors).toHaveLength(1);expect(f.controller.freezeTransientModels()[0].inWorld).toBe(true);
   f.assembly.release();expect(()=>f.assembly.resourceOwner.actorQueryResources.readResourceDescriptor()).toThrow(/disposed/);expect(f.seedRig!.readConstructorSeedCapture()).toBe(original);
  }finally{f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s derives offworld effect constructors from actual resources and consumes them through complete scene staging',map=>{
  const f=assemblyFixture(map,42,true);try{
   const owner=f.assembly.effectPrototypes!;expect(owner.plane.mesh.parent).toBeNull();expect(owner.plane.phase).toBe(0);expect(owner.plane.inWorld).toBe(false);
   for(const weapon of Object.keys(families) as (keyof typeof families)[]){expect(owner.muzzles[weapon].mesh.geometry).toBe(f.f.soldierResources.gunGeometries.get(families[weapon]));expect(owner.muzzles[weapon].inWorld).toBe(false);}
   const stats=f.f.soldierResources.muzzleModels.stats();const first=stage(f),speculative=first.models;first.tx.rollback();const retry=stage(f,true);expect(retry.models).toEqual(speculative);expect(retry.born.queryCoverage.complete).toBe(true);retry.tx.commit();
   expect(f.controller.freezeTransientModels()).toHaveLength(1);expect(f.controller.freezeTransientModels()[0].inWorld).toBe(true);expect(f.assembly.resourceOwner.muzzleTemplates.every(t=>!t.inWorld)).toBe(true);expect(f.f.soldierResources.muzzleModels.stats()).toEqual(stats);
   f.assembly.release();expect(()=>owner.plane).toThrow(/released/);expect(()=>f.assembly.resourceOwner.transientQueryResources.readResourceDescriptor()).toThrow(/disposed/);
  }finally{f.dispose();}
 });
 it('rejects a constant shared shader for fresh material constructors before acquiring the scene',()=>{
  const f=assemblyFixture('woodlands',42,true);try{
   const resources=f.assemblyOptions.resources;if(!('effectPrototypes' in resources))throw Error('Expected constructor options');
   expect(()=>createOriginalSoloSceneAssembly(f.collection,{...f.assemblyOptions,resources:{...resources,transientPolicy:{...resources.transientPolicy,initialShaderIdentity:'shared-observed'}}})).toThrow('per-clone shader identity');
  }finally{f.dispose();}
 });
 it('requires explicit parented copy birth membership without changing offworld prototype metadata',()=>{
  const f=assemblyFixture('woodlands',42,true);try{
   const resources=f.assemblyOptions.resources;if(!('effectPrototypes' in resources))throw Error('Expected constructor options');
   expect(()=>createOriginalSoloSceneAssembly(f.collection,{...f.assemblyOptions,resources:{...resources,transientPolicy:{...resources.transientPolicy,cloneMembership:'template'}}})).toThrow('copy birth membership');expect(f.assembly.effectPrototypes!.plane.inWorld).toBe(false);
  }finally{f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s executes a complete downward birth query with actual GI/gun, local models, sky, private map, projectile and one staged FX',map=>{
  const f=assemblyFixture(map);try{
   const s=stage(f);expect(s.born.queryCoverage.complete).toBe(true);expect(s.born.queryCoverage.missing).toEqual([]);
   expect(s.models.filter(m=>m.kind==='local-weapon')).toHaveLength(7);expect(s.models.some(m=>m.kind==='fixed')).toBe(true);expect(s.models.some(m=>m.kind==='sky')).toBe(true);
   expect(s.models.filter(m=>m.kind==='transient'&&m.group==='gsmokes')).toHaveLength(1);expect(s.models.filter(m=>m.kind==='projectile'&&m.inWorld)).toHaveLength(1);
   expect(new Set(s.models.map(m=>m.handle)).size).toBe(s.models.length);expect(s.registry.actors.map(a=>a.actorId)).toEqual(['actual-peer']);
   const query=f.assembly.inventory.geometryQuery(s.models,0,f.generation,receipt(f.generation),s.registry);expect(query).toBeDefined();
   const gi=s.registry.models.find(m=>m.kind==='gi')!,gun=s.registry.models.find(m=>m.resource==='ak47')!;
   expect(f.assembly.resourceOwner.actorQueryResources.resolve(gi,'live-gi').positions).toHaveLength(742);expect(f.assembly.resourceOwner.actorQueryResources.resolve(gun,'held-gun').positions.length).toBeGreaterThan(0);
   expect(f.controller.freezeTransientModels()).toEqual([]);expect(f.assembly.banks.projectileWorld.freeze().actors).toEqual([]);
   s.tx.commit();expect(f.controller.freezeTransientModels()).toHaveLength(1);expect(f.assembly.banks.projectileWorld.freeze().actors).toHaveLength(1);expect(f.assembly.banks.localWeaponWorld.freeze().prefix).toEqual(receipt(f.generation));
   expect(f.data.nodes.find(n=>n.name==='UIAmbient')!.matrix).toEqual(Array(16).fill(0));
  }finally{f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s rolls back all staged owners and retries with identical clone names and complete geometry',map=>{
  const f=assemblyFixture(map);try{
   const banks=f.assembly.banks,initial=[banks.localWeaponWorld.freeze(),banks.projectileWorld.freeze(),banks.loadoutWorld.freeze(),banks.weaponReportWorld.freeze()],beforeGI=f.f.soldierResources.geometry.getAttribute('position').array.slice();
   const failed=stage(f),models=failed.models;failed.tx.rollback();expect(f.controller.freezeModels()).toEqual([]);expect(f.controller.freezeTransientModels()).toEqual([]);
   expect([banks.localWeaponWorld.freeze(),banks.projectileWorld.freeze(),banks.loadoutWorld.freeze(),banks.weaponReportWorld.freeze()]).toEqual(initial);
   const retry=stage(f,true);expect(retry.models).toEqual(models);expect(retry.born).toEqual(failed.born);retry.tx.commit();
   expect(banks.projectileWorld.freeze().catalog).toHaveLength(1);expect(f.controller.freezeTransientModels()).toHaveLength(1);expect(f.f.soldierResources.geometry.getAttribute('position').array).toEqual(beforeGI);
  }finally{f.dispose();}
 });
 it('uses current private door and barrel membership while preserving the recovered imported map',()=>{
  const f=assemblyFixture('barrack');try{
   const beforeDoors=f.doors.getStates(),beforeBarrels=f.barrels.snapshots(),name=beforeDoors[0].name,barrelId=beforeBarrels[0].id;
   f.arm([{kind:'door-open',name,atSeconds:0},{kind:'barrel-hurt',id:barrelId,birthId:'actual-private-barrel'}]);const tx=f.controller.begin();tx.applyExternalReceipt(0,0);
   expect(tx.freezeModels().filter(m=>m.kind==='barrel'&&m.inWorld)).toHaveLength(beforeBarrels.length-1);expect(tx.freezeModels().filter(m=>m.kind==='transient'&&m.group==='gsmokes')).toHaveLength(1);
   expect(f.doors.getStates()).toEqual(beforeDoors);expect(f.barrels.snapshots()).toEqual(beforeBarrels);tx.rollback();expect(f.barrels.snapshots()).toEqual(beforeBarrels);
  }finally{f.dispose();}
 });
 it.each([{resource:'ak47',attribute:'position'},{resource:'rpgrocket',attribute:'index'},{resource:'rg6grenade',attribute:'position'}])('rejects a changed actual collection $resource $attribute while the soldier pack and existing life remain valid',({resource,attribute:changed})=>{
  const f=assemblyFixture('woodlands');try{
   const mesh=f.collection.resources.get(resource)!,attribute=changed==='index'?mesh.geometry.index!:mesh.geometry.getAttribute('position') as THREE.BufferAttribute,old=attribute.array[0];attribute.array[0]=old+1;
   expect(()=>createOriginalSoloSceneAssembly(f.collection,f.assemblyOptions)).toThrow();attribute.array[0]=old;
   expect(f.assembly.banks.localWeaponWorld.freeze().models).toHaveLength(7);const s=stage(f);expect(s.born.queryCoverage.complete).toBe(true);s.tx.rollback();
  }finally{f.dispose();}
 });
 it('isolates a replacement life sharing every borrowed renderer asset and releases only its private owners',()=>{
  const f=assemblyFixture('woodlands'),other=createOriginalSoloSceneAssembly(f.collection,{...f.assemblyOptions,banks:{...f.assemblyOptions.banks,sceneGeneration:43}});
  const collectionMaterials=[...f.collection.resources.values()].flatMap(mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material]);
  const assets=[f.f.soldierResources.geometry,f.f.soldierResources.material,...f.f.soldierResources.gunGeometries.values(),...[...f.collection.resources.values()].map(mesh=>mesh.geometry),...collectionMaterials,f.f.combat.geometry,f.f.explosion.geometry,f.f.texture,...f.f.textures.values(),...Object.values(f.f.combat.textures),...Object.values(f.f.explosion.textures)];
  const spies=[...new Set(assets)].map(resource=>vi.spyOn(resource,'dispose'));
  try{
   const tx=f.assembly.banks.loadoutWorld.begin();tx.addScore(7);tx.commit();expect(other.banks.loadoutWorld.freeze().score).toBe(0);
   f.assembly.release();f.assembly.release();for(const spy of spies)expect(spy).not.toHaveBeenCalled();expect(()=>f.assembly.banks.loadoutWorld.freeze()).toThrow(/released/);
   expect(other.banks.localWeaponWorld.freeze().prefix.sceneGeneration).toBe(43);expect(other.resourceOwner.actorQueryResources.readResourceDescriptor()!.resourceBindingId).toBe(f.f.soldierResources.resourceBindingId);
   expect(()=>f.assembly.resourceOwner.actorQueryResources.readResourceDescriptor()).toThrow(/disposed/);expect(()=>f.assembly.resourceOwner.transientQueryResources.readResourceDescriptor()).toThrow(/disposed/);
  }finally{other.release();for(const spy of spies)spy.mockRestore();f.dispose();}
 });
});
