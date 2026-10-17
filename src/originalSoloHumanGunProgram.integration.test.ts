import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {type OriginalSoloSceneResourcesOptions} from './originalSoloSceneResources';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
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

import {createOriginalSoloSceneAssembly} from './originalSoloSceneAssembly';
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
import {createOriginalSoloProjectileBirth} from './originalSoloProjectileBinding';
import {createOriginalSoloCurrentSceneLease} from '../shared/originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds} from '../shared/originalSoloObserverWorld';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';

const json=<T>(path:string)=>JSON.parse(readFileSync(new URL(path,base),'utf8')) as T;
const maps={barrack:json<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/barrack/scene.json'),woodlands:json<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/woodland/scene.json')};
const doorTracks=json<OriginalDoorTracks>('original-scenes/barrack/doors.json');
const handles:ReceiverLocalWeaponHandle[]=['pistol','spas12','ak47','rg6','rpg','dragunov','rocket'];
const receipt=(generation=42)=>({kind:'receipt' as const,sceneGeneration:generation,callback:0,tick:0});
function assemblyFixture(map:'barrack'|'woodlands',generation=42){
 const f=fixture(),collection=createOriginalWeapons({geometry:weapons,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});
 const parent=new THREE.Group();parent.position.set(4,3,8);parent.rotation.set(.3,-.2,.1);
 for(const group of collection.models.values())parent.add(group);parent.add(collection.resources.get('rg6grenade')!);parent.updateMatrixWorld(true);
 const data=maps[map],runtime=registerOriginalMapRuntime(map,data),doors=new OriginalDoorWorld(data,runtime.scale,map==='barrack'?doorTracks:{version:1,doors:[]}),barrels=new OriginalBarrelWorld(runtime);
 const ancestry={pistol:['private-camera'],spas12:['private-camera'],ak47:['private-camera'],rg6:['private-camera'],rpg:['private-camera'],dragunov:['private-camera'],rocket:['rpg','private-camera']};
 const camera=new THREE.Matrix4().fromArray(f.options.renderToWorld).multiply(parent.matrixWorld).toArray();
 const bankOptions:OriginalSoloFreshBanksOptions={map,sceneGeneration:generation,score:0,goldScore:0,sourceScale:runtime.scale,renderToWorld:f.options.renderToWorld,cameraHandle:'private-camera',cameraWorldMatrix:camera,initialGunPositionSource:{x:-12,y:-20,z:5},initialLoadedRocket:false,membership:Object.fromEntries(handles.map(handle=>[handle,handle==='rg6'])) as Record<ReceiverLocalWeaponHandle,boolean>,ancestry,followOffworldParents:true,parentRestoresMembership:true,grenadeMaterialHandle:'borrowed-grenade',grenadeAncestry:['source-parent'],rocketMaterialHandle:'canonical-rpg',maxCommands:256,maxTextChars:65536,maxProjectileModels:32,maxProjectileActors:8,maxReportNames:32};
 const prototype=(weapon:keyof typeof families)=>({...f.options.muzzles[weapon],group:'scene' as const,groupAncestry:[]});
 const resources={...f.options,muzzles:{pistol:prototype('pistol'),shotgun:prototype('shotgun'),rifle:prototype('rifle'),sniper:prototype('sniper')}};
 const assemblyOptions={resources,banks:bankOptions,inventory:{data,doorNames:map==='barrack'?doorTracks.doors.map(door=>door.name):[],sky:data.runtime.sky,transientUnresolved:[],provenance:'actual decoded assembly explicit CPU policies',sidedness:'double' as const,budgets:{maxModels:2048,maxVertices:2000000,maxFaces:2000000,maxTextChars:65536,maxMeshes:256}}};
 const assembly=createOriginalSoloSceneAssembly(collection,assemblyOptions),target={health:createOriginalPlayerHealth(),alive:true};
 const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:generation,sourceScale:runtime.scale,target,barrels,doors,...assembly.backends,maxCommands:256,maxOutcomes:64,maxModels:2048,maxTextChars:1000000,snapshotAt:(prefix,state,actors)=>assembly.snapshotAt(prefix,state,actors!)});
 const controller=new OriginalReceiverSceneController(assembly.backends.model,assembly.backends.transient,env,{model:{sceneGeneration:generation,sourceScale:runtime.scale,eyeHeight:85*runtime.scale,goodyBspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels:2048,maxPickups:16},transient:{maxModels:64,maxActors:64,maxShaders:64,maxTextChars:65536},maxEffects:64});
 const goody={bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,modelPosition:{x:1000,y:1000,z:0},eyePosition:{x:1000,y:1001,z:0},weapon:'launcher' as const};
 const arm=(commands:readonly ReceiverCurrentEnvironmentCommand[])=>env.arm({physicalCallback:0,goody,frames:[{prefix:receipt(generation),commands}]});
 return {f,map,generation,data,runtime,doors,barrels,collection,assemblyOptions,assembly,env,controller,arm,dispose(){assembly.release();collection.dispose();f.dispose();}};
}

import {Game} from './game';
import {WeaponState} from './weapons';
import {captureOriginalSoloHumanGunProgram} from './originalSoloHumanGunProgram';
import {captureOriginalSoloLocalGunPose} from './originalSoloLocalGunPose';
import {captureOriginalSoloProjectileReceiptProgram} from './originalSoloProjectileProgram';
import {advanceOriginalReceiverGunCallback} from '../shared/originalReceiverGunCallback';
import {advanceOriginalWeaponMotion,equipOriginalWeaponMotion} from '../shared/originalWeaponMotion';
import {originalProjectileDirection} from '../shared/originalProjectileOrientation';
import type {OriginalSoloLaunchReservation,OriginalSoloReservedLaunchAdmission} from '../shared/originalSoloLaunchBatch';
import type {OriginalSoloEvent} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloHumanCallbackInput} from './originalSoloHumanCallbackInput';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import type {ReceiverLoadoutCheckpoint} from '../shared/originalReceiverLoadoutWorld';
import type {ReceiverLocalHitscanSceneCapture} from '../shared/originalReceiverLocalHitscan';

function humanFixture(map:'barrack'|'woodlands'){
 const f=assemblyFixture(map),owners=new Map<string,ReturnType<typeof createOriginalSoloSceneAssembly>>(),events:OriginalSoloEvent[]=[],inputs:OriginalSoloHumanCallbackInput[]=[],previews:ReceiverLocalWeaponWorldCheckpoint[]=[],hookCheckpoints:ReceiverLoadoutCheckpoint[]=[],queryCheckpoints:ReceiverLoadoutCheckpoint[]=[],queries:ReceiverLocalHitscanSceneCapture[]=[],programs:ReturnType<typeof captureOriginalSoloHumanGunProgram>[]=[],admissions:OriginalSoloReservedLaunchAdmission[]=[];
 const camera=new THREE.PerspectiveCamera();camera.position.set(1000,1000,0);camera.rotation.set(0,0,0,'YXZ');camera.updateMatrixWorld(true);
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,mode:'solo',archivalWinter:false,phase:'playing',playerAlive:true,elapsed:0,arena:{runtime:f.runtime},weaponState:new WeaponState(map),keys:new Set<string>(),firing:false,chatOpen:false,controlsPreset:'legacy',yaw:0,pitch:0,velocity:new THREE.Vector3(),camera,enemies:[],originalWeapons:f.collection,originalScopeState:{enabled:false}}) as any;
 let planReads=0,launchReads=0,rayReads=0,randomReads=0;const cloneNames:string[]=[];
 const fromReservation=(owner:ReturnType<typeof createOriginalSoloSceneAssembly>,reservation:OriginalSoloLaunchReservation,preview?:ReceiverLocalWeaponWorldCheckpoint)=>{
  const launch=reservation.launch,physical=reservation.prototype;
  // Remote RPG constructors explicitly borrow that viewer's captured local
  // rocket template. This seed policy is independent of their selected gun.
  const freshModel=launch.weapon==='launcher'?owner.banks.projectileWorld.freeze().template:{...(preview??owner.banks.localWeaponWorld.freeze()).models.find(m=>m.handle==='rocket')!,handle:'rocket',resource:'rpgrocket' as const,materialHandle:'canonical-rpg'};
  const birth=createOriginalSoloProjectileBirth({launchId:launch.id,weapon:launch.weapon,freshModel,pose:{launchId:launch.id,weapon:launch.weapon,position:physical.position,direction:physical.direction,...(physical.sourceRotation?{sourceRotation:physical.sourceRotation}:{}),renderToWorld:f.f.options.renderToWorld,orientationPolicy:'copy-source-basis-unit-reset'},rocketMaterialHandle:'canonical-rpg',maxTextChars:65536});
  return {...birth,cloneFresh:(name?:string)=>{cloneNames.push(name!);return birth.cloneFresh(name);}};
 };
 const worlds=new OriginalSoloObserverWorlds(f.runtime,{templateDoors:f.doors,templateBarrels:f.barrels,onEvent:event=>events.push(event),createReceiverScene:registration=>{
  let owner:ReturnType<typeof createOriginalSoloSceneAssembly>,lastLoadout:ReceiverLoadoutCheckpoint|undefined;
  return createOriginalSoloCurrentSceneLease({sourceScale:f.runtime.scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,requireActorResources:true,requireTransientResources:true,
   environment:{maxCommands:256,maxOutcomes:128,maxModels:2048,maxTextChars:65536},controller:{model:{eyeHeight:85*f.runtime.scale,goodyBspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels:2048,maxPickups:16},transient:{maxModels:64,maxActors:64,maxShaders:64,maxTextChars:65536},maxEffects:128,transientState:true},
   createBackends:context=>{owner=createOriginalSoloSceneAssembly(f.collection,{...f.assemblyOptions,banks:{...f.assemblyOptions.banks,sceneGeneration:context.lifeGeneration}});owners.set(registration.id,owner);
    return {...owner.backends,localHitscan:{nearestBullet:(capture,origin,direction)=>{queries.push(capture);queryCheckpoints.push(lastLoadout!);return owner.backends.localHitscan.nearestBullet(capture,origin,direction);}}};},
   captureLocalWeaponCallback:(context,prefix)=>{
    if(context.id!=='player')return {cameraWorldMatrix:f.assemblyOptions.banks.cameraWorldMatrix,velocityWorld:context.body.velocity,commands:[]};
    const input=game.readSoloHumanCallbackInput(context,prefix) as OriginalSoloHumanCallbackInput;inputs.push(input);return {cameraWorldMatrix:input.cameraWorldMatrix,velocityWorld:input.velocityWorld,commands:[]};
   },
   captureLoadoutProgram:(context,prefixes,previous,bangs)=>{
    const receiptCommands=captureOriginalSoloProjectileReceiptProgram(previous.projectiles!,[...context.projectiles.values()],bangs,{renderToWorld:f.f.options.renderToWorld,maxActors:8,maxCommands:256,maxTextChars:65536});if(!prefixes.callback)return {receiptCommands};
    // The other observer has an explicit no-fire policy and does not read human keys.
    if(context.id!=='player')return {receiptCommands,callbackCommands:[{kind:'weapon-report-send' as const},{kind:'weapon-finish' as const}]};
    planReads++;const input=game.readSoloHumanCallbackInput(context,prefixes.callback) as OriginalSoloHumanCallbackInput;expect(input).toBe(inputs.at(-1));
    const phase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:input.prefix,held:input.held,weaponModelPresent:input.weaponModelPresent}),random3=phase.intents.filter(intent=>intent.kind==='yaw-kick-request').map(()=>{randomReads++;return 3;});
    const initial=owner.banks.localWeaponWorld.freeze();
    const program=captureOriginalSoloHumanGunProgram(previous.loadout,input,{localWeaponWorld:owner.banks.localWeaponWorld,random3,sendReport:true,maxCommands:256,maxModels:2048,maxTextChars:65536,
     captureHitscan:(request,preview)=>{
      rayReads++;previews.push(preview);hookCheckpoints.push(request.checkpoint);expect(owner.banks.localWeaponWorld.freeze()).toBe(initial);expect(preview.motion.ticker).toBe(initial.motion.ticker);
      const gunPose=captureOriginalSoloLocalGunPose(preview,request.fire.weapon,{sourceScale:f.runtime.scale,phase:0,maxTextChars:65536});
      return {prefix:input.prefix,weapon:request.fire.weapon as 'shotgun',sourceRotation:input.sourceRotation,origin:originalPlayerEye(context.body),bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,actorNames:Object.fromEntries([...context.actorNames].map(([id,entry])=>[id,entry.name])),effectId:`effect:${input.prefix.callback}:${request.rayIndex}`,muzzleId:`muzzle:${input.prefix.callback}:${request.rayIndex}`,gunPose};
     },captureLaunch:(request,preview)=>{
      launchReads++;previews.push(preview);hookCheckpoints.push(request.checkpoint);expect(owner.banks.localWeaponWorld.freeze()).toBe(initial);
      const admission=context.reserveLaunch!({weapon:request.fire.weapon as 'launcher'|'rpg',eye:originalPlayerEye(context.body),direction:originalProjectileDirection(input.sourceRotation),sourceRotation:input.sourceRotation},0);admissions.push(admission);
      return {admission,...(admission.ok?{birth:fromReservation(owner,admission.reservation,preview)}:{})};
     },
    });expect(owner.banks.localWeaponWorld.freeze()).toBe(initial);programs.push(program);return {receiptCommands,...program};
   },
   captureIncomingLaunches:(_context,_prefix,incoming)=>incoming.map(item=>({kind:'projectile-birth' as const,birth:fromReservation(owner,item.reservation)})),
   goodyAt:context=>({eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,weapon:context.weapon??'launcher'}),
   snapshotAt:(prefix,state,_context,actors)=>{lastLoadout=state.loadout;return owner.snapshotAt(prefix,state,actors!);},
  });
 }});game.soloWorlds=worlds;
 const player=worlds.register({id:'player',name:'Human',eye:{x:1000,y:1000,z:0}}),other=worlds.register({id:'other',name:'Other',eye:{x:1200,y:1000,z:0}});player.weapon=other.weapon='launcher';
 let time=0;
 const prepare=(runPhysics=false)=>{worlds.physics(time,runPhysics?{}:{skipIds:new Set(['player','other'])});worlds.goody('player');worlds.goody('other');};
 const finish=()=>{worlds.completeGoody(time);};
 const next=()=>{worlds.actors(time);time+=1/30;game.elapsed=time;};
 const cycle=()=>{prepare();finish();next();};
 const saved=[...f.collection.resources.values()].map(mesh=>({mesh,parent:mesh.parent,matrix:mesh.matrix.toArray(),world:mesh.matrixWorld.toArray(),visible:mesh.visible}));
 const unchanged=()=>{for(const state of saved){expect(state.mesh.parent).toBe(state.parent);expect(state.mesh.matrix.toArray()).toEqual(state.matrix);expect(state.mesh.matrixWorld.toArray()).toEqual(state.world);expect(state.mesh.visible).toBe(state.visible);}};
 return {f,game,player,other,worlds,owners,events,inputs,previews,hookCheckpoints,queryCheckpoints,queries,programs,admissions,cloneNames,prepare,finish,next,cycle,unchanged,reads:()=>({planReads,launchReads,rayReads,randomReads}),dispose(){worlds.clear();f.dispose();}};
}

// Game input, source gun helper, operation-time real local-bank previews and
// complete decoded query resources are exercised together. Aim, effect labels,
// no-fire peer policy and clone transforms remain explicit copy policies; this
// fixture does not enable the default factory or prove native movie scheduling.
describe('human gun program through Game capture and complete Solo resources',()=>{
 it.each(['barrack','woodlands'] as const)('%s reads held reload/selection once and publishes the original ordered local/loadout changes',map=>{
  const f=humanFixture(map);try{
   f.game.keys.add('KeyR');f.game.keys.add('Digit1');f.game.keys.add('ShiftRight');f.cycle();
   const input=f.inputs[0];expect(input.held).toMatchObject({typing:false,reload:true,fire:false,digits:[true,false,false,false,false,false]});expect(input.shiftHeld).toBe(true);expect(Object.isFrozen(input)).toBe(true);
   const owner=f.owners.get('player')!;expect(owner.banks.loadoutWorld.freeze()).toMatchObject({selected:'pistol',ammo:{launcher:6,pistol:8},reserve:{launcher:18,pistol:54}});expect(owner.banks.localWeaponWorld.freeze().selectedWeapon).toBe('pistol');
   const commands=f.programs[0].callbackCommands,reload=commands.findIndex(c=>c.kind==='weapon-reload'),choose=commands.findIndex(c=>c.kind==='weapon-whichgun'&&c.weapon==='pistol');expect(reload).toBeGreaterThan(-1);expect(choose).toBeGreaterThan(reload);
   expect(f.owners.get('other')!.banks.loadoutWorld.freeze().selected).toBe('launcher');expect(f.reads()).toMatchObject({planReads:1,rayReads:0,launchReads:0,randomReads:0});f.unchanged();
  }finally{f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s admits the first actual RG6 launch and both private projectile models with the source ammunition debit',map=>{
  const f=humanFixture(map);try{
   f.game.firing=true;f.cycle();const owner=f.owners.get('player')!,other=f.owners.get('other')!;
   expect(f.admissions).toHaveLength(1);expect(f.admissions[0].ok).toBe(true);expect(f.worlds.launches.size).toBe(1);expect(f.player.projectiles.size).toBe(1);expect(f.other.projectiles.size).toBe(1);
   expect(owner.banks.loadoutWorld.freeze().ammo.launcher).toBe(5);expect(other.banks.loadoutWorld.freeze().ammo.launcher).toBe(6);expect(owner.banks.projectileWorld.freeze().actors).toHaveLength(1);expect(other.banks.projectileWorld.freeze().actors).toHaveLength(1);
   expect(f.hookCheckpoints[0]).toMatchObject({selected:'launcher',ammo:{launcher:6}});expect(f.previews[0].selectedWeapon).toBe('launcher');expect(f.previews[0].motion.ticker).toBe(1);
   expect(f.events.filter(e=>e.kind==='spawned'&&e.recipientId==='player')).toHaveLength(1);expect(f.reads()).toMatchObject({launchReads:1,rayReads:0});f.unchanged();
  }finally{f.dispose();}
 });
 it('captures both literal SPAS rays from the same actual operation-time model before final selection and motion finish',()=>{
  const f=humanFixture('woodlands');try{
   f.game.keys.add('Digit2');f.cycle();expect(f.player.loadout!.selected).toBe('shotgun');
   f.game.keys.clear();f.game.keys.add('Digit1');f.game.firing=true;f.cycle();
   expect(f.previews).toHaveLength(2);expect(f.previews[0]).toEqual(f.previews[1]);expect(f.previews[0].selectedWeapon).toBe('shotgun');
   expect(f.hookCheckpoints).toHaveLength(2);expect(f.queryCheckpoints).toHaveLength(2);for(const capture of [...f.hookCheckpoints,...f.queryCheckpoints])expect(capture).toMatchObject({selected:'shotgun',ammo:{shotgun:6},reserve:{shotgun:24}});
   expect(f.queries).toHaveLength(2);for(const capture of f.queries){expect(capture.models.filter(m=>m.kind==='local-weapon')).toHaveLength(7);expect(capture.models.some(m=>m.kind==='fixed')).toBe(true);expect(capture.models.some(m=>m.kind==='sky')).toBe(true);expect(capture.actors.actors).toHaveLength(1);}
   const owner=f.owners.get('player')!,program=f.programs.at(-1)!;expect(owner.banks.loadoutWorld.freeze()).toMatchObject({selected:'pistol',ammo:{shotgun:5}});expect(owner.banks.localWeaponWorld.freeze().selectedWeapon).toBe('pistol');
   const rays=program.callbackCommands.filter(c=>c.kind==='local-hitscan');expect(rays).toHaveLength(2);
   for(const ray of rays){if(ray.kind!=='local-hitscan')throw Error('Missing shot action');expect(ray.action.gunPose).toEqual(captureOriginalSoloLocalGunPose(f.previews[0],'shotgun',{sourceScale:f.f.runtime.scale,phase:0,maxTextChars:65536}));expect(ray.action.sourceRotation).toEqual(f.inputs.at(-1)!.sourceRotation);}
   const velocity=f.inputs.at(-1)!.velocityWorld,sourceSpeed=Math.hypot(velocity.x,velocity.y,velocity.z)/f.f.runtime.scale;
   // whichgun selects pistol and its subsequent source load-pose assigns the
   // rest seed before the final recurrence. Ticker advances with speed, not
   // with callback count; this controlled callback has zero physical speed.
   expect(owner.banks.localWeaponWorld.freeze().motion).toEqual(advanceOriginalWeaponMotion(equipOriginalWeaponMotion(f.previews[0].motion,'pistol'),{frames:1,sourceSpeed}).state);expect(f.reads().randomReads).toBe(1);f.unchanged();
  }finally{f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s constructs actual RPG models for both observers from the operation-time owner rocket and viewer template',map=>{
  const f=humanFixture(map);try{
   f.game.keys.add('Digit5');f.cycle();expect(f.player.loadout!.selected).toBe('rpg');f.game.keys.clear();f.game.firing=true;
   for(let callback=0;callback<32&&f.admissions.length===0;callback++)f.cycle();
   expect(f.admissions).toHaveLength(1);expect(f.admissions[0].ok).toBe(true);expect(f.previews).toHaveLength(1);expect(f.previews[0].selectedWeapon).toBe('rpg');
   for(const id of ['player','other']){const owner=f.owners.get(id)!,state=owner.banks.projectileWorld.freeze();expect(state.actors).toHaveLength(1);expect(state.actors[0].weapon).toBe('rpg');expect(state.models.find(m=>m.handle===state.actors[0].handle)).toMatchObject({resource:'rpgrocket',inWorld:true,materialHandle:'canonical-rpg'});}
   expect(f.player.loadout!.ammo.rpg).toBe(0);expect(f.other.loadout!.ammo.rpg).toBe(1);expect(f.other.projectiles.size).toBe(1);f.unchanged();
  }finally{f.dispose();}
 });
 it('updates a continuing RG6 RAW model from actual physical state then admits terminal pose and FIFO retirement',()=>{
  const f=humanFixture('woodlands');try{
   f.game.firing=true;f.cycle();f.game.firing=false;
   const owner=f.owners.get('player')!,before=owner.banks.projectileWorld.freeze(),handle=before.actors[0].handle;
   // Unlike the input-only fixtures, this path runs the actual private map,
   // player, barrel and projectile physics so continuing poses really move.
   f.prepare(true);f.finish();const physical=f.player.projectiles.values().next().value!;
   const expected=new THREE.Vector3(physical.state.position.x,physical.state.position.y,physical.state.position.z).applyMatrix4(new THREE.Matrix4().fromArray(f.f.f.options.renderToWorld)),continuing=owner.banks.projectileWorld.freeze().models.find(m=>m.handle===handle)!;
   for(const [offset,axis] of [[12,'x'],[13,'y'],[14,'z']] as const)expect(continuing.worldMatrix[offset]).toBeCloseTo(expected[axis],10);
   expect(continuing.worldMatrix).not.toEqual(before.models.find(m=>m.handle===handle)!.worldMatrix);
   expect(physical.state.remainingCallbacks).toBe(60);let actorSteps=0;
   // Fresh constructors are not in the first callback's captured actor list.
   // Progress the actual fuse to one, admitting its observed terminal pose on
   // the following CURRENT receipt. The guard cannot manufacture a retirement.
   while(f.player.projectiles.size&&actorSteps<60){f.next();actorSteps++;f.prepare(true);f.finish();}
   expect(actorSteps).toBe(59);expect(f.player.projectiles.size).toBe(0);expect(f.other.projectiles.size).toBe(0);
   const retired=owner.banks.projectileWorld.freeze();expect(retired.actors).toEqual([]);expect(retired.fifo.launcher).toEqual([handle]);expect(retired.models.find(m=>m.handle===handle)!.inWorld).toBe(false);f.unchanged();
  }finally{f.dispose();}
 });
 it('retries the captured RG6 program with identical input and reservation after joint publication fails',()=>{
  const f=humanFixture('barrack');try{
   f.game.firing=true;f.prepare();const fail=vi.spyOn(f.player.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('held human program publication');});
   expect(f.finish).toThrow('held human program publication');const reads=f.reads(),input=f.inputs[0],admission=f.admissions[0],program=f.programs[0],owner=f.owners.get('player')!,names=[...f.cloneNames];
   expect(owner.banks.loadoutWorld.freeze().ammo.launcher).toBe(6);expect(owner.banks.projectileWorld.freeze().actors).toEqual([]);expect(f.worlds.launches.size).toBe(0);expect(f.events.filter(e=>e.kind==='spawned'||e.kind==='gun-output')).toEqual([]);f.unchanged();
   f.game.firing=false;f.game.keys.add('Digit1');f.game.pitch=.9;f.game.camera.position.x+=17;fail.mockRestore();f.finish();
   expect(f.reads()).toEqual(reads);expect(f.inputs).toEqual([input]);expect(f.programs).toEqual([program]);expect(f.admissions).toEqual([admission]);expect(owner.banks.loadoutWorld.freeze()).toMatchObject({selected:'launcher',ammo:{launcher:5}});expect(f.cloneNames.slice(names.length,names.length*2)).toEqual(names);expect(owner.banks.projectileWorld.freeze().actors[0].handle).toMatch(/^grenade\d+$/);expect(f.worlds.launches.size).toBe(1);f.unchanged();
  }finally{f.dispose();}
 });
 it('reuses SPAS fire captures and sampled recoil while repeating actual complete queries in the rollback retry',()=>{
  const f=humanFixture('woodlands');try{
   f.game.keys.add('Digit2');f.cycle();f.game.keys.clear();f.game.firing=true;f.prepare();
   // The player's real scene and both rays prepare before this later observer
   // fails, while the coordinator has not published either private life.
   const fail=vi.spyOn(f.other.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('held SPAS publication');});expect(f.finish).toThrow('held SPAS publication');
   const reads=f.reads(),previews=[...f.previews],queryCount=f.queries.length;expect(queryCount).toBe(2);expect(f.player.loadout!.ammo.shotgun).toBe(6);
   f.game.firing=false;f.game.keys.add('Digit1');fail.mockRestore();f.finish();expect(f.reads()).toEqual(reads);expect(f.previews).toEqual(previews);expect(f.queries).toHaveLength(queryCount*2);expect(f.player.loadout!).toMatchObject({selected:'shotgun',ammo:{shotgun:5}});
   const model=f.owners.get('player')!.banks.localWeaponWorld.freeze().models;expect(new Set(model.map(m=>m.handle)).size).toBe(7);for(const state of f.queryCheckpoints)expect(state.ammo.shotgun).toBe(6);f.unchanged();
  }finally{f.dispose();}
 });
});
