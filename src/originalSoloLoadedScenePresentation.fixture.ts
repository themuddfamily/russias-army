import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {expect,vi} from 'vitest';
import {WeaponState} from './weapons';
import {OriginalWeaponPresentation} from './originalWeaponPresentation';
import {OriginalSoloModelPresentation} from './originalSoloModelPresentation';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalCombatEffectResources} from './originalCombatEffectPresentation';
import {createOriginalExplosionResources} from './originalExplosionPresentation';
import {createOriginalSoloTransientRendererBinding} from './originalSoloTransientResources';
import {createOriginalSoloSceneAssembly,createOriginalSoloBotSceneAssembly,type OriginalSoloSceneAssemblyOptions} from './originalSoloSceneAssembly';
import {captureOriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';
import {createOriginalSoloProjectileBirth} from './originalSoloProjectileBinding';
import {captureOriginalSoloBotProjectileProgram} from './originalSoloBotProjectileProgram';
import {captureOriginalSoloBotShot,type OriginalSoloBotShotCapture} from '../shared/originalSoloBotShotCapture';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloLaunchReservation} from '../shared/originalSoloLaunchBatch';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalDoorWorld,type OriginalDoorTracks} from '../shared/originalDoorWorld';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import type {OriginalSceneData} from '../shared/originalSceneGeometry';
import type {OriginalSkyDescription} from '../shared/originalSkyRay';
import type {ReceiverLocalWeaponHandle} from '../shared/originalReceiverLocalWeaponInventory';
import {ORIGINAL_COMBAT_PLANE_SIZE} from '../shared/originalCombatEffects';
import type {WeaponId} from '../shared/protocol';
import {Game} from './game';
import {createOriginalSoloLoadedSceneFactory} from './originalSoloLoadedSceneFactory';
import {createOriginalSoloPlaneMaterial} from './originalSoloPlaneMaterial';
import {createOriginalSoloGameStartupResources} from './originalSoloGameStartupResources';
import {captureOriginalSoloHumanGunProgram} from './originalSoloHumanGunProgram';
import type {ReceiverLocalHitscanAction} from '../shared/originalReceiverLocalHitscan';
import {captureOriginalSoloProjectileReceiptProgram} from './originalSoloProjectileProgram';
import {advanceOriginalReceiverGunCallback} from '../shared/originalReceiverGunCallback';
import {originalProjectileDirection} from '../shared/originalProjectileOrientation';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';

const assets=new URL('../public/assets/',import.meta.url),read=<T>(path:string)=>JSON.parse(readFileSync(new URL(path,assets),'utf8')) as T;
const geometry=read<OriginalSoldierAssets['geometry']>('original-soldier/geometry.json'),rigMotion=read<OriginalSoldierAssets['rigMotion']>('original-soldier/rig-motion.json'),weaponGeometry=read<OriginalWeaponGeometryData>('original-weapons/geometry.json');
const dataByMap={barrack:read<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/barrack/scene.json'),woodlands:read<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/woodland/scene.json')},tracks=read<OriginalDoorTracks>('original-scenes/barrack/doors.json');
const localHandles:ReceiverLocalWeaponHandle[]=['pistol','spas12','ak47','rg6','rpg','dragunov','rocket'];

// Actual decoded geometry, constructor observations and complete map inventory.
// Borrowed template/rocket ancestry and unit mapping are explicit CPU policies;
// this exercises actual Game consumers, not raster/audio/native fidelity.
export function presentationFixture(map:'barrack'|'woodlands',options:{gameStartupResources?:boolean;samplePuffRandom36?:()=>number;terminalGoodyPolicy?:'retain-until-current-commit'}={}){
 const weapons:Record<string,WeaponId>={player:'launcher',a:'launcher',b:'rpg'};
 const localForWeapon:Record<WeaponId,ReceiverLocalWeaponHandle>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
 const data=dataByMap[map],runtime=registerOriginalMapRuntime(map,data),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),soldierTexture=new THREE.Texture();
 const soldierResources=createOriginalSoldierResources({geometry,rigMotion,texture:soldierTexture},{geometry:weaponGeometry,textures},{resourceBindingId:'bot-actual-soldier-generation'}),collection=createOriginalWeapons({geometry:weaponGeometry,textures});
 const seedRig=new OriginalSoldier(soldierResources,{weapon:'rpg'}),capture=seedRig.readConstructorSeedCapture();
 const combat=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()}),explosion=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
 const mapping=new THREE.Matrix4().compose(new THREE.Vector3(11,12,13),new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.2,-.1)),new THREE.Vector3(1,1,1)).toArray();
 const binding=createOriginalSoloTransientRendererBinding({soldierResources,combatResources:combat,explosionResources:explosion,planeGeometry:combat.geometry,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,planeGeometryProvenance:'actual application plane',sourceScale:runtime.scale,provenance:'bot actual FX resources',sidedness:'double',resourceBindingId:'bot-FX-generation',textureBindingId:'bot-texture-generation',nearFilter:THREE.LinearFilter,maxVertices:100000,maxFaces:100000,maxResourceEntries:256,maxTextChars:8192});
 const startupResources=options.gameStartupResources?createOriginalSoloGameStartupResources({runtime,doorNames:map==='barrack'?tracks.doors.map(door=>door.name):[],soldierResources,weapons:weaponGeometry,transientBinding:binding,constructorCapture:capture,gunFactory:seedRig.readGunConstructorSeedCapture('rpg')!,renderToWorld:mapping}):undefined;
 const planeOwner=startupResources?.planeOwner??createOriginalSoloPlaneMaterial(binding,{texture:'bangrocket',constructorPolicy:'copy-fresh-basic-material-borrowed-texture',maxTextChars:8192}),planeMaterial=planeOwner.planeMaterial;
 const muzzle=(resource:string)=>({geometryProvenance:`actual soldier ${resource}`,group:'scene' as const,groupAncestry:[]});
 const resources:OriginalSoloSceneAssemblyOptions['resources']={soldierResources,weapons:weaponGeometry,transientBinding:binding,renderToWorld:mapping,
  actor:{sourceScale:runtime.scale,giResourceOrientation:capture.gi.resourceOrientation,gunScale:1,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,maxMeshes:256,maxDescriptorTextChars:8192,provenance:'actual bot actor resources',sidedness:'double'},
  actorLifecycle:{parentRestoresMembership:true,readDropYawPlan:(actorId,callback)=>captureOriginalSoloActorDropYawPlan(callback,[{actorId,random36:18}],{maxEntries:8,maxTextChars:8192}),maxTextChars:8192,constructorSeeds:{capture,gunFactory:seedRig.readGunConstructorSeedCapture('rpg')!,gunClonePolicy:'copy-fresh-gun-mesh-factory',giProvenance:'actual fresh GI constructor',gunProvenance:{pistol:'fresh pistol',shotgun:'fresh spas12',rifle:'fresh ak47',launcher:'fresh rg6',rpg:'fresh rpg',sniper:'fresh dragunov'},maxSeeds:7,maxTextChars:8192}},
  transientQuery:{maxVertices:100000,maxFaces:100000,maxMeshes:256,maxTextChars:8192},
  transientPolicy:{cloneMembership:'copy-effect-birth-parented',pointAtPolicy:'copy-plane-positive-z',omittedUpPolicy:'copy-negative-z',parallelUpPolicy:'copy-x',explicitUpPolicy:'copy-three-lookat',selfRotatePolicy:'copy-local-xyz',coincidentPolicy:'retain',maxTextChars:8192},
  effectPrototypes:{planeMaterial,constructorPolicy:'copy-fresh-mesh-identity-offworld-phase-zero',maxModels:5,maxTextChars:8192,muzzles:{pistol:muzzle('mfpistol'),shotgun:muzzle('mfspas12'),rifle:muzzle('mfak47'),sniper:muzzle('mfdragunov')}}};
 const doors=new OriginalDoorWorld(data,runtime.scale,map==='barrack'?tracks:{version:1,doors:[]}),barrels=new OriginalBarrelWorld(runtime);
 type Owner=ReturnType<typeof createOriginalSoloSceneAssembly>|ReturnType<typeof createOriginalSoloBotSceneAssembly>;
 const owners=new Map<string,Owner>(),programs=new Map<string,unknown[]>(),events:OriginalSoloEvent[]=[],drops:{id:string;life:number}[]=[],birthReads=new Map<string,number>(),inputs:unknown[]=[],humanReads={programs:0,random3:0},humanShots:ReceiverLocalHitscanAction[]=[];
 const camera=new THREE.PerspectiveCamera();camera.position.set(1000,1000,0);camera.updateMatrixWorld(true);
 const scene=new THREE.Scene(),viewModel=new THREE.Group();scene.add(viewModel);
 const legacyModels=new OriginalSoloModelPresentation();legacyModels.register('a',seedRig);scene.add(seedRig.group);
 const legacyDrop=new THREE.Group();scene.add(legacyDrop);
 const legacyProjectile=new THREE.Mesh(collection.resources.get('rg6grenade')!.geometry,collection.resources.get('rg6grenade')!.material);scene.add(legacyProjectile);
 const game=Object.assign(Object.create(Game.prototype),{scene,viewModel,soloModelPresentation:legacyModels,viewCamera:new THREE.PerspectiveCamera(),enhancedRendering:false,weaponState:new WeaponState(map),originalWeaponPresentation:new OriginalWeaponPresentation('launcher'),originalSoldierResources:soldierResources,originalSoloTransientBinding:binding,weaponDrops:[{group:legacyDrop}],enemies:[],soloCorpses:new Map(),soloDetachedFlashes:[],soloPickupCapture:[],originalBlasts:[],projectiles:[{mesh:legacyProjectile,soloId:'legacy-before-binding'}],
  updateHud:vi.fn(),appendChat:vi.fn(),playOriginalCombatSound:vi.fn(),playOriginalDoorSound:vi.fn(),playPlayerHurtSound:vi.fn(),showOriginalHurt:vi.fn(),showHitmarker:vi.fn(),createProjectileMesh:vi.fn(()=>new THREE.Mesh()),orientProjectileMesh:vi.fn(),releaseProjectileMesh:vi.fn((mesh:THREE.Mesh)=>mesh.removeFromParent()),originalExplosionPresentation:{clear:vi.fn(),spawn:vi.fn()},originalCombatEffectPresentation:{clear:vi.fn(),spawnPuff:vi.fn()},originalEffectPlanePool:{reset:vi.fn()},phase:'playing',mode:'solo',mapId:map,playerAlive:true,archivalWinter:false,arena:{runtime,syncBarrels:vi.fn()},elapsed:0,originalActorDispatchGeneration:0,soloBotShots:[] as OriginalSoloBotShotCapture[],camera,keys:new Set<string>(),firing:false,chatOpen:false,controlsPreset:'legacy',yaw:0,pitch:0,originalWeapons:collection}) as any;
 const remember=(context:{id:string},owner:Owner)=>{owners.set(context.id,owner);return owner;};
 const birth=(owner:Owner,reservation:OriginalSoloLaunchReservation,preview?:ReceiverLocalWeaponWorldCheckpoint)=>{
  const launch=reservation.launch,physical=reservation.prototype;birthReads.set(launch.ownerId,(birthReads.get(launch.ownerId)??0)+1);
  const freshModel=launch.weapon==='launcher'?owner.banks.projectileWorld.freeze().template:{...(preview??owner.banks.localWeaponWorld.freeze()).models.find(model=>model.handle==='rocket')!,handle:'rocket',resource:'rpgrocket' as const,materialHandle:'canonical-rpg'};
  return createOriginalSoloProjectileBirth({launchId:launch.id,weapon:launch.weapon,freshModel,pose:{launchId:launch.id,weapon:launch.weapon,position:physical.position,direction:physical.direction,...(physical.sourceRotation?{sourceRotation:physical.sourceRotation}:{}),renderToWorld:mapping,orientationPolicy:'copy-source-basis-unit-reset'},rocketMaterialHandle:'canonical-rpg',maxTextChars:65536});
 };
 let worlds:OriginalSoloObserverWorlds;
 const barrelBirths:{kind:'transient-birth';event:{kind:'bang';id:string;type:'barrel';position:{x:number;y:number;z:number}}}[]=[];
 const factory=createOriginalSoloLoadedSceneFactory({map,collection,resources:startupResources?.resources??resources,inventory:startupResources?.inventory??{data,doorNames:map==='barrack'?tracks.doors.map(door=>door.name):[],sky:data.runtime.sky,transientUnresolved:[],provenance:'actual mixed loaded scene resources',sidedness:'double',budgets:{maxModels:2048,maxVertices:2000000,maxFaces:2000000,maxTextChars:65536,maxMeshes:256}},
  producer:{sourceScale:runtime.scale,maxCapturedBlasts:64,maxCapturedProjectiles:64,requireActorResources:true,requireTransientResources:true,environment:{maxCommands:256,maxOutcomes:128,maxModels:2048,maxTextChars:1000000,...(options.terminalGoodyPolicy?{terminalGoodyPolicy:options.terminalGoodyPolicy}:{})},controller:{model:{lifecycleJournal:{maxEntries:64,maxTextChars:8192},eyeHeight:85*runtime.scale,goodyBspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels:2048,maxPickups:16},transient:{maxModels:64,maxActors:64,maxShaders:64,maxTextChars:65536},maxEffects:128,transientState:true},goodyAt:context=>context.alive?{eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,weapon:context.weapon??'launcher'}:null},
  banksAt:(registration,context)=>{
   programs.set(registration.id,[]);
   const banks={map,sceneGeneration:registration.lifeGeneration,sourceScale:runtime.scale,renderToWorld:mapping,cameraHandle:'private-camera',cameraWorldMatrix:mapping,initialGunPositionSource:{x:-12,y:-20,z:5},initialLoadedRocket:false,membership:Object.fromEntries(localHandles.map(handle=>[handle,handle===localForWeapon[weapons[registration.id]]])) as Record<ReceiverLocalWeaponHandle,boolean>,ancestry:{pistol:['private-camera'],spas12:['private-camera'],ak47:['private-camera'],rg6:['private-camera'],rpg:['private-camera'],dragunov:['private-camera'],rocket:['rpg','private-camera']},followOffworldParents:true,parentRestoresMembership:true,grenadeMaterialHandle:'borrowed-grenade',grenadeAncestry:[],rocketMaterialHandle:'canonical-rpg',maxCommands:256,maxTextChars:65536,maxProjectileModels:128,maxProjectileActors:64};
   expect(context.body).toBe(registration.body);
   return registration.id==='player'?{kind:'human' as const,banks:{...banks,score:0,goldScore:0,maxReportNames:32}}:{kind:'bot' as const,banks:{...banks,weapon:weapons[registration.id]}};
  },readCommittedCallback:registration=>worlds.worlds.get(registration.id)?.callback??0,sampleRandom36:registration=>{drops.push({id:registration.id,life:registration.lifeGeneration});return 18;},dropLimits:{maxEntries:64,maxTextChars:8192},
  programs:{human:{
   captureLocalWeaponCallback:(context,prefix,_previous,owner)=>{remember(context,owner);const input=game.readSoloHumanCallbackInput(context,prefix);inputs.push(input);return {cameraWorldMatrix:input.cameraWorldMatrix,velocityWorld:input.velocityWorld,commands:[]};},
   captureLoadoutProgram:(context,prefixes,previous,bangs,owner)=>{
    remember(context,owner);const receiptCommands=[...captureOriginalSoloProjectileReceiptProgram(previous.projectiles!,[...context.projectiles.values()],bangs,{renderToWorld:mapping,maxActors:64,maxCommands:256,maxTextChars:65536}),...barrelBirths];if(!prefixes.callback)return {receiptCommands};
    humanReads.programs++;const input=game.readSoloHumanCallbackInput(context,prefixes.callback);expect(input).toBe(inputs.at(-1));
    const phase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:input.prefix,held:input.held,weaponModelPresent:input.weaponModelPresent});
    const random3=phase.intents.filter(intent=>intent.kind==='yaw-kick-request').map(()=>{humanReads.random3++;return 3;});
    const program=captureOriginalSoloHumanGunProgram(previous.loadout,input,{localWeaponWorld:owner.banks.localWeaponWorld,random3,sendReport:true,maxCommands:256,maxModels:2048,maxTextChars:65536,captureHitscan:(request,preview)=>{const action=game.readSoloHumanHitscanAction(context,request,preview);humanShots.push(action);return action;},captureLaunch:(request,preview)=>{const admission=context.reserveLaunch!({weapon:request.fire.weapon as 'launcher'|'rpg',eye:originalPlayerEye(context.body),direction:originalProjectileDirection(input.sourceRotation),sourceRotation:input.sourceRotation},0);return {admission,...(admission.ok?{birth:birth(owner,admission.reservation,preview)}:{})};}});
    const pickupCommands=(context.observer.modelState?.pickups??[]).map(pickup=>({kind:'ammo-pickup' as const,pickupId:pickup.id}));const complete={receiptCommands,...program,callbackCommands:[...program.callbackCommands,...pickupCommands]};programs.get(context.id)!.push(complete);return complete;
   }},bot:{captureLocalWeaponCallback:(context,_prefix,_previous,owner)=>{remember(context,owner);return {cameraWorldMatrix:mapping,velocityWorld:context.body.velocity,commands:[]};},captureBotProjectileProgram:(context,prefixes,previous,bangs,owner)=>{remember(context,owner);const program=captureOriginalSoloBotProjectileProgram(context,prefixes,previous,bangs,prefixes.callback?game.readSoloBotProjectileShots(context):[],{renderToWorld:mapping,maxActors:64,maxShots:64,maxCommands:256,maxTextChars:65536,captureBirth:reservation=>birth(owner,reservation)});programs.get(context.id)!.push(program);return program;}}},
  captureIncomingLaunches:(owner,_context,_prefix,incoming)=>incoming.map(row=>({kind:'projectile-birth' as const,birth:birth(owner,row.reservation)})),
 });
 const puffContexts:import('../shared/originalSoloObserverWorld').OriginalSoloPhysicalPuffContext[]=[],puffFlags:{failRecipient?:string;beforePrepare?:(context:import('../shared/originalSoloObserverWorld').OriginalSoloPhysicalPuffContext)=>void;afterEvent?:(event:OriginalSoloEvent)=>void}={};
 worlds=new OriginalSoloObserverWorlds(runtime,{samplePuffRandom36:options.samplePuffRandom36??(()=>18),templateDoors:doors,templateBarrels:barrels,onEvent:event=>{events.push(event);game.receiveSoloWorldEvent(event);puffFlags.afterEvent?.(event);},createReceiverScene:registration=>{const lease=factory.createReceiverScene(registration);return {...lease,preparePhysicalPuff:context=>{puffContexts.push(context);puffFlags.beforePrepare?.(context);if(puffFlags.failRecipient===context.observer.id)throw Error('physical puff injected failure');return lease.preparePhysicalPuff!(context);}};}});
 game.soloWorlds=worlds;
 const player=worlds.register({id:'player',name:'Human',eye:{x:1000,y:1000,z:0}}),a=worlds.register({id:'a',name:'Authored A',eye:{x:1100,y:1000,z:0}}),b=worlds.register({id:'b',name:'Authored B',eye:{x:1200,y:1000,z:0}});player.weapon='launcher';a.weapon='launcher';b.weapon='rpg';
 game.bindSoloProjectilePresentation(player,{maxModels:128,maxActors:64,maxTextChars:65536,rocketMaterialHandle:'canonical-rpg',materialBindings:new Map([['borrowed-grenade',{resource:'rg6grenade' as const,material:collection.resources.get('rg6grenade')!.material}],['canonical-rpg',{resource:'rpgrocket' as const,material:collection.resources.get('rpgrocket')!.material}]])});
 const add=(id:'a'|'b',sequence:number,weapon:'launcher'|'rpg')=>{const own=worlds.worlds.get(id)!,shot=captureOriginalSoloBotShot({ownerId:id,ownerLife:own.lifeGeneration,sequence,capturedAt:0,weapon,targetId:'player',targetLife:player.lifeGeneration,sourceShotOrigin:{x:-100,y:-100,z:-100},aimDirection:{x:0,y:0,z:-1},targetDistance:200,authoredDamage:5,chanceRoll:.99},{maxTextChars:65536});game.soloBotShots.push(shot);return shot;};
 const prepare=(time:number)=>{game.elapsed=time;worlds.physics(time,{skipIds:new Set(['player','a','b'])});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);};
 return {puffContexts,puffFlags,startupResources,barrelBirths,scene,viewModel,legacyRig:seedRig,legacyDrop,legacyProjectile,soldierResources,binding,resourcesForTestWeaponGeometry:weaponGeometry,worlds,factory,game,player,a,b,owners,programs,birthReads,inputs,humanReads,humanShots,drops,events,collection,planeOwner,mapping,add,prepare,dispose(){game.disposeSoloWorlds(false);worlds.clear();factory.release();if(startupResources)startupResources.release();else planeOwner.release();seedRig.dispose();collection.dispose();soldierResources.dispose();combat.dispose();explosion.dispose();soldierTexture.dispose();for(const texture of textures.values())texture.dispose();}};
}
