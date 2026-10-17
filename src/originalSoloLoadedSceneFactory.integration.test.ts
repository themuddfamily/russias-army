import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
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
// this exercises authored shot admission, not native projectile/render fidelity.
function setup(map:'barrack'|'woodlands'){
 const weapons:Record<string,WeaponId>={player:'launcher',a:'launcher',b:'rpg'};
 const localForWeapon:Record<WeaponId,ReceiverLocalWeaponHandle>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
 const data=dataByMap[map],runtime=registerOriginalMapRuntime(map,data),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),soldierTexture=new THREE.Texture();
 const soldierResources=createOriginalSoldierResources({geometry,rigMotion,texture:soldierTexture},{geometry:weaponGeometry,textures},{resourceBindingId:'bot-actual-soldier-generation'}),collection=createOriginalWeapons({geometry:weaponGeometry,textures});
 const seedRig=new OriginalSoldier(soldierResources,{weapon:'rpg'}),capture=seedRig.readConstructorSeedCapture();
 const combat=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()}),explosion=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
 const mapping=new THREE.Matrix4().compose(new THREE.Vector3(11,12,13),new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.2,-.1)),new THREE.Vector3(1,1,1)).toArray();
 const binding=createOriginalSoloTransientRendererBinding({soldierResources,combatResources:combat,explosionResources:explosion,planeGeometry:combat.geometry,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,planeGeometryProvenance:'actual application plane',sourceScale:runtime.scale,provenance:'bot actual FX resources',sidedness:'double',resourceBindingId:'bot-FX-generation',textureBindingId:'bot-texture-generation',nearFilter:THREE.LinearFilter,maxVertices:100000,maxFaces:100000,maxResourceEntries:256,maxTextChars:8192});
 const planeOwner=createOriginalSoloPlaneMaterial(binding,{texture:'bangrocket',constructorPolicy:'copy-fresh-basic-material-borrowed-texture',maxTextChars:8192}),planeMaterial=planeOwner.planeMaterial;
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
 const game=Object.assign(Object.create(Game.prototype),{phase:'playing',mode:'solo',mapId:map,playerAlive:true,archivalWinter:false,arena:{runtime},elapsed:0,originalActorDispatchGeneration:0,soloBotShots:[] as OriginalSoloBotShotCapture[],camera,keys:new Set<string>(),firing:false,chatOpen:false,controlsPreset:'legacy',yaw:0,pitch:0,originalWeapons:collection}) as any;
 const remember=(context:{id:string},owner:Owner)=>{owners.set(context.id,owner);return owner;};
 const birth=(owner:Owner,reservation:OriginalSoloLaunchReservation,preview?:ReceiverLocalWeaponWorldCheckpoint)=>{
  const launch=reservation.launch,physical=reservation.prototype;birthReads.set(launch.ownerId,(birthReads.get(launch.ownerId)??0)+1);
  const freshModel=launch.weapon==='launcher'?owner.banks.projectileWorld.freeze().template:{...(preview??owner.banks.localWeaponWorld.freeze()).models.find(model=>model.handle==='rocket')!,handle:'rocket',resource:'rpgrocket' as const,materialHandle:'canonical-rpg'};
  return createOriginalSoloProjectileBirth({launchId:launch.id,weapon:launch.weapon,freshModel,pose:{launchId:launch.id,weapon:launch.weapon,position:physical.position,direction:physical.direction,...(physical.sourceRotation?{sourceRotation:physical.sourceRotation}:{}),renderToWorld:mapping,orientationPolicy:'copy-source-basis-unit-reset'},rocketMaterialHandle:'canonical-rpg',maxTextChars:65536});
 };
 let worlds:OriginalSoloObserverWorlds;
 const factory=createOriginalSoloLoadedSceneFactory({map,collection,resources,inventory:{data,doorNames:map==='barrack'?tracks.doors.map(door=>door.name):[],sky:data.runtime.sky,transientUnresolved:[],provenance:'actual mixed loaded scene resources',sidedness:'double',budgets:{maxModels:2048,maxVertices:2000000,maxFaces:2000000,maxTextChars:65536,maxMeshes:256}},
  producer:{sourceScale:runtime.scale,maxCapturedBlasts:64,maxCapturedProjectiles:64,requireActorResources:true,requireTransientResources:true,environment:{maxCommands:256,maxOutcomes:128,maxModels:2048,maxTextChars:1000000},controller:{model:{lifecycleJournal:{maxEntries:64,maxTextChars:8192},eyeHeight:85*runtime.scale,goodyBspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels:2048,maxPickups:16},transient:{maxModels:64,maxActors:64,maxShaders:64,maxTextChars:65536},maxEffects:128,transientState:true},goodyAt:context=>context.alive?{eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,weapon:context.weapon??'launcher'}:null},
  banksAt:(registration,context)=>{
   programs.set(registration.id,[]);
   const banks={map,sceneGeneration:registration.lifeGeneration,sourceScale:runtime.scale,renderToWorld:mapping,cameraHandle:'private-camera',cameraWorldMatrix:mapping,initialGunPositionSource:{x:-12,y:-20,z:5},initialLoadedRocket:false,membership:Object.fromEntries(localHandles.map(handle=>[handle,handle===localForWeapon[weapons[registration.id]]])) as Record<ReceiverLocalWeaponHandle,boolean>,ancestry:{pistol:['private-camera'],spas12:['private-camera'],ak47:['private-camera'],rg6:['private-camera'],rpg:['private-camera'],dragunov:['private-camera'],rocket:['rpg','private-camera']},followOffworldParents:true,parentRestoresMembership:true,grenadeMaterialHandle:'borrowed-grenade',grenadeAncestry:[],rocketMaterialHandle:'canonical-rpg',maxCommands:256,maxTextChars:65536,maxProjectileModels:128,maxProjectileActors:64};
   expect(context.body).toBe(registration.body);
   return registration.id==='player'?{kind:'human' as const,banks:{...banks,score:0,goldScore:0,maxReportNames:32}}:{kind:'bot' as const,banks:{...banks,weapon:weapons[registration.id]}};
  },readCommittedCallback:registration=>worlds.worlds.get(registration.id)?.callback??0,sampleRandom36:registration=>{drops.push({id:registration.id,life:registration.lifeGeneration});return 18;},dropLimits:{maxEntries:64,maxTextChars:8192},
  programs:{human:{
   captureLocalWeaponCallback:(context,prefix,_previous,owner)=>{remember(context,owner);const input=game.readSoloHumanCallbackInput(context,prefix);inputs.push(input);return {cameraWorldMatrix:input.cameraWorldMatrix,velocityWorld:input.velocityWorld,commands:[]};},
   captureLoadoutProgram:(context,prefixes,previous,bangs,owner)=>{
    remember(context,owner);const receiptCommands=captureOriginalSoloProjectileReceiptProgram(previous.projectiles!,[...context.projectiles.values()],bangs,{renderToWorld:mapping,maxActors:64,maxCommands:256,maxTextChars:65536});if(!prefixes.callback)return {receiptCommands};
    humanReads.programs++;const input=game.readSoloHumanCallbackInput(context,prefixes.callback);expect(input).toBe(inputs.at(-1));
    const phase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:input.prefix,held:input.held,weaponModelPresent:input.weaponModelPresent});
    const random3=phase.intents.filter(intent=>intent.kind==='yaw-kick-request').map(()=>{humanReads.random3++;return 3;});
    const program=captureOriginalSoloHumanGunProgram(previous.loadout,input,{localWeaponWorld:owner.banks.localWeaponWorld,random3,sendReport:true,maxCommands:256,maxModels:2048,maxTextChars:65536,captureHitscan:(request,preview)=>{const action=game.readSoloHumanHitscanAction(context,request,preview);humanShots.push(action);return action;},captureLaunch:(request,preview)=>{const admission=context.reserveLaunch!({weapon:request.fire.weapon as 'launcher'|'rpg',eye:originalPlayerEye(context.body),direction:originalProjectileDirection(input.sourceRotation),sourceRotation:input.sourceRotation},0);return {admission,...(admission.ok?{birth:birth(owner,admission.reservation,preview)}:{})};}});
    const pickupCommands=(context.observer.modelState?.pickups??[]).map(pickup=>({kind:'ammo-pickup' as const,pickupId:pickup.id}));const complete={receiptCommands,...program,callbackCommands:[...program.callbackCommands,...pickupCommands]};programs.get(context.id)!.push(complete);return complete;
   }},bot:{captureLocalWeaponCallback:(context,_prefix,_previous,owner)=>{remember(context,owner);return {cameraWorldMatrix:mapping,velocityWorld:context.body.velocity,commands:[]};},captureBotProjectileProgram:(context,prefixes,previous,bangs,owner)=>{remember(context,owner);const program=captureOriginalSoloBotProjectileProgram(context,prefixes,previous,bangs,prefixes.callback?game.readSoloBotProjectileShots(context):[],{renderToWorld:mapping,maxActors:64,maxShots:64,maxCommands:256,maxTextChars:65536,captureBirth:reservation=>birth(owner,reservation)});programs.get(context.id)!.push(program);return program;}}},
  captureIncomingLaunches:(owner,_context,_prefix,incoming)=>incoming.map(row=>({kind:'projectile-birth' as const,birth:birth(owner,row.reservation)})),
 });
 worlds=new OriginalSoloObserverWorlds(runtime,{templateDoors:doors,templateBarrels:barrels,onEvent:event=>{events.push(event);if(event.kind==='bot-projectile-commit')game.receiveSoloWorldEvent(event);},createReceiverScene:factory.createReceiverScene});
 game.soloWorlds=worlds;
 const player=worlds.register({id:'player',name:'Human',eye:{x:1000,y:1000,z:0}}),a=worlds.register({id:'a',name:'Authored A',eye:{x:1100,y:1000,z:0}}),b=worlds.register({id:'b',name:'Authored B',eye:{x:1200,y:1000,z:0}});player.weapon='launcher';a.weapon='launcher';b.weapon='rpg';
 const add=(id:'a'|'b',sequence:number,weapon:'launcher'|'rpg')=>{const own=worlds.worlds.get(id)!,shot=captureOriginalSoloBotShot({ownerId:id,ownerLife:own.lifeGeneration,sequence,capturedAt:0,weapon,targetId:'player',targetLife:player.lifeGeneration,sourceShotOrigin:{x:-100,y:-100,z:-100},aimDirection:{x:0,y:0,z:-1},targetDistance:200,authoredDamage:5,chanceRoll:.99},{maxTextChars:65536});game.soloBotShots.push(shot);return shot;};
 const prepare=(time:number)=>{game.elapsed=time;worlds.physics(time,{skipIds:new Set(['player','a','b'])});worlds.goody('player');worlds.goody('a');worlds.goody('b');};
 return {worlds,factory,game,player,a,b,owners,programs,birthReads,inputs,humanReads,humanShots,drops,events,collection,planeOwner,mapping,add,prepare,dispose(){worlds.clear();factory.release();planeOwner.release();seedRig.dispose();collection.dispose();soldierResources.dispose();combat.dispose();explosion.dispose();soldierTexture.dispose();for(const texture of textures.values())texture.dispose();}};
}

describe('loaded factory with actual complete mixed human and authored bot scenes',()=>{
 it.each((['barrack','woodlands'] as const).flatMap(map=>(['pistol','shotgun','rifle','sniper'] as const).map(weapon=>({map,weapon}))))('$map captures actual $weapon rays once through mixed scenes and retains them on joint retry',({map,weapon})=>{
  const f=setup(map);let failure:{mockRestore():void}|undefined;
  try{
   const slot={pistol:'Digit1',shotgun:'Digit2',rifle:'Digit3',sniper:'Digit6'}[weapon];
   f.game.keys.add(slot);f.prepare(0);f.worlds.completeGoody(0);f.worlds.actors(0);f.game.keys.clear();expect(f.player.loadout!.selected).toBe(weapon);
   f.game.firing=true;let time=1/30;
   // Use actual readiness gates rather than changing captured bank counters.
   for(let callback=1;callback<90;callback++,time+=1/30){
    f.prepare(time);
    const before=f.humanShots.length,events=f.events.length;
    failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('bullet late peer');});
    expect(()=>f.worlds.completeGoody(time)).toThrow('bullet late peer');failure.mockRestore();failure=undefined;
    const shots=f.humanShots.slice(before),programCount=f.humanReads.programs,samples=f.humanReads.random3;
    expect(f.events).toHaveLength(events);
    f.worlds.completeGoody(time);expect(f.humanReads.programs).toBe(programCount);expect(f.humanReads.random3).toBe(samples);expect(f.humanShots.slice(before)).toEqual(shots);
    if(shots.length){
     expect(shots).toHaveLength(weapon==='shotgun'?2:1);expect(f.player.loadout!.ammo[weapon]).toBe(({pistol:8,shotgun:6,rifle:28,sniper:30} as const)[weapon]-1);
     const outcomes=f.events.slice(events).filter(event=>event.kind==='local-hitscan-outcome');expect(outcomes).toHaveLength(shots.length);
     for(const shot of shots){expect(shot.weapon).toBe(weapon);expect(shot.prefix.callback).toBe(f.player.callback);expect(shot.sourceRotation).toEqual({x:0,y:0,z:0});expect(Object.keys(shot.actorNames)).toEqual(['a','b']);expect(Object.isFrozen(shot)).toBe(true);}
     expect(new Set(shots.map(shot=>shot.effectId)).size).toBe(shots.length);expect(new Set(shots.map(shot=>shot.muzzleId)).size).toBe(shots.length);
     if(shots.length===2){expect(shots[0].gunPose).toEqual(shots[1].gunPose);expect(shots[0].origin).toEqual(shots[1].origin);}
     expect(f.a.loadout).toBeUndefined();expect(f.b.loadout).toBeUndefined();expect(f.humanReads.random3).toBe(1);return;
    }
    f.worlds.actors(time);
   }
   throw Error('Actual bullet readiness never reached');
  }finally{failure?.mockRestore();f.dispose();}
 });

 it.each(['barrack','woodlands'] as const)('%s retains the death-receipt actor at the gun boundary then detaches it in actor order',map=>{
  const f=setup(map);try{
   f.game.keys.add('Digit2');f.prepare(0);f.worlds.completeGoody(0);f.worlds.actors(0);f.game.keys.clear();
   // Mature the real readiness counter while B is still alive. The first
   // post-death callback must actually fire before actor detach.
   let callback=1;
   for(;callback<=45;callback++){const time=callback/30;f.prepare(time);f.worlds.completeGoody(time);f.worlds.actors(time);}
   expect(f.humanShots).toEqual([]);f.worlds.dispose('b');f.game.firing=true;
   const time=callback/30;f.worlds.physics(time,{skipIds:new Set(['player','a'])});f.worlds.goody('player');f.worlds.goody('a');f.worlds.completeGoody(time);
   expect(f.humanShots).toHaveLength(2);for(const shot of f.humanShots){expect(Object.keys(shot.actorNames)).toEqual(['a','b']);expect(shot.prefix.callback).toBe(f.player.callback);}
   expect(f.player.modelState!.actors.some(actor=>actor.actorId==='b')).toBe(false);expect(f.player.modelState!.pickups).toHaveLength(1);
  }finally{f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s preserves actual human launcher readiness/debit and incoming bot ownership without an extra birth step',map=>{
  const f=setup(map);try{
   f.game.firing=true;let birthAt=-1;
   for(let callback=0;callback<32;callback++){const time=callback/30;f.prepare(time);f.worlds.completeGoody(time);if(f.player.projectiles.size){birthAt=time;break;}f.worlds.actors(time);}
   expect(birthAt).toBeGreaterThanOrEqual(0);expect(f.player.loadout!.ammo.launcher).toBe(5);expect(f.player.loadout!.selected).toBe('launcher');expect(f.humanReads.random3).toBe(1);
   for(const world of [f.player,f.a,f.b]){expect(world.projectiles.size).toBe(1);expect(world.projectileState!.actors).toHaveLength(1);expect([...world.projectiles.values()][0].state.remainingCallbacks).toBe(60);}
   expect(f.a.loadout).toBeUndefined();expect(f.b.loadout).toBeUndefined();expect(f.drops).toEqual([]);expect(f.game.soloBotShots).toEqual([]);
   f.game.firing=false;f.worlds.actors(birthAt);f.prepare(birthAt+1/30);f.worlds.completeGoody(birthAt+1/30);for(const world of [f.player,f.a,f.b])expect([...world.projectiles.values()][0].state.remainingCallbacks).toBe(60);f.worlds.actors(birthAt+1/30);for(const world of [f.player,f.a,f.b])expect([...world.projectiles.values()][0].state.remainingCallbacks).toBe(59);expect(f.player.loadout!.ammo.launcher).toBe(5);
  }finally{f.dispose();}
 });

 it.each(['barrack','woodlands'] as const)('%s owns all programs and private scenes through joint rollback/retry and whole-life release',map=>{
  const f=setup(map),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('mixed factory late peer');}),texture=f.planeOwner.planeMaterial.map!,material=f.planeOwner.planeMaterial,disposeTexture=vi.spyOn(texture,'dispose'),disposeMaterial=vi.spyOn(material,'dispose');
  try{
   const shots=[f.add('a',1,'launcher'),f.add('b',2,'rpg')];f.game.keys.add('KeyR');f.game.keys.add('Digit1');f.prepare(0);
   expect(()=>f.worlds.completeGoody(0)).toThrow('mixed factory late peer');expect(f.events).toEqual([]);expect(f.game.soloBotShots).toEqual(shots);expect(f.humanReads.programs).toBe(1);expect(f.inputs).toHaveLength(1);expect(f.drops).toEqual([]);
   const plans=[...f.programs].map(([id,rows])=>({id,rows:[...rows]})),births=[...f.birthReads],input=f.inputs[0];
   f.game.keys.clear();f.game.firing=false;f.worlds.completeGoody(0);
   expect([...f.birthReads]).toEqual(births);expect(f.inputs).toEqual([input]);for(const saved of plans)expect(f.programs.get(saved.id)).toEqual(saved.rows);expect(f.game.soloBotShots).toEqual([]);
   expect(f.player.loadout).toMatchObject({selected:'pistol',ammo:{launcher:6,pistol:8}});expect(f.player.localWeapons!.selectedWeapon).toBe('pistol');
   for(const bot of [f.a,f.b]){expect(bot.loadout).toBeUndefined();expect(bot.gunPhase).toBeUndefined();expect(bot.localWeapons!.selectedWeapon).toBe(bot.weapon);}
   for(const world of [f.player,f.a,f.b]){expect(world.callback).toBe(1);expect(world.projectiles.size).toBe(2);expect(world.projectileState!.actors).toHaveLength(2);expect(f.factory.readAssembly(world.id,world.lifeGeneration)).toBe(f.owners.get(world.id));for(const row of world.projectiles.values())expect(row.state.remainingCallbacks).toBe(row.launch.weapon==='launcher'?60:200);}
   expect(f.events.filter(event=>event.kind==='spawned')).toHaveLength(6);expect(disposeTexture).not.toHaveBeenCalled();expect(disposeMaterial).not.toHaveBeenCalled();f.worlds.clear();for(const owner of f.owners.values())expect(()=>owner.banks.localWeaponWorld.freeze()).toThrow(/released/);expect(f.factory.readAssembly('player',1)).toBeUndefined();expect(disposeMaterial).not.toHaveBeenCalled();f.factory.release();f.planeOwner.release();f.planeOwner.release();expect(disposeMaterial).toHaveBeenCalledOnce();expect(disposeTexture).not.toHaveBeenCalled();
  }finally{failure.mockRestore();disposeTexture.mockRestore();disposeMaterial.mockRestore();f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s collects a previously committed dropped gun after gun finish with joint rollback',map=>{
  const f=setup(map);let failure:{mockRestore():void}|undefined;
  try{
   f.prepare(0);f.worlds.completeGoody(0);f.worlds.actors(0);f.worlds.dispose('b');
   f.worlds.physics(1/30,{skipIds:new Set(['player','a'])});f.worlds.goody('player');f.worlds.goody('a');f.worlds.completeGoody(1/30);f.worlds.actors(1/30);
   const pickup=f.player.modelState!.pickups[0],before=f.player.loadout!;expect(pickup).toBeDefined();
   f.player.body.position={x:pickup.position.x,y:pickup.position.y-85*f.game.arena.runtime.scale,z:pickup.position.z};
   f.worlds.physics(2/30,{skipIds:new Set(['player','a'])});f.worlds.goody('player');f.worlds.goody('a');
   failure=vi.spyOn(f.a.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('pickup late peer');});expect(()=>f.worlds.completeGoody(2/30)).toThrow('pickup late peer');failure.mockRestore();failure=undefined;
   expect(f.player.loadout).toBe(before);expect(f.player.modelState!.pickups).toHaveLength(1);
   const plan=f.programs.get('player')!.at(-1) as {callbackCommands:{kind:string;pickupId?:number}[]};expect(plan.callbackCommands.at(-1)).toMatchObject({kind:'ammo-pickup',pickupId:pickup.id});expect(plan.callbackCommands.findIndex(c=>c.kind==='weapon-finish')).toBeLessThan(plan.callbackCommands.findIndex(c=>c.kind==='ammo-pickup'));
   f.worlds.completeGoody(2/30);expect(f.player.modelState!.pickups).toEqual([]);expect(f.player.loadout!.score).toBe(before.score+5);expect(f.player.loadout!.reserve.rpg).toBeGreaterThan(before.reserve.rpg);expect(f.a.modelState!.pickups).toHaveLength(1);expect(f.a.loadout).toBeUndefined();
   const score=f.player.loadout!.score;f.worlds.actors(2/30);f.worlds.physics(3/30,{skipIds:new Set(['player','a'])});f.worlds.goody('player');f.worlds.goody('a');f.worlds.completeGoody(3/30);expect(f.player.loadout!.score).toBe(score);
  }finally{failure?.mockRestore();f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s admits drop operands only at actual detach and retains the first viewer operand through peer rollback',map=>{
  const f=setup(map);let fail:{mockRestore():void}|undefined;
  try{
   f.prepare(0);f.worlds.completeGoody(0);f.worlds.actors(0);f.worlds.dispose('b');expect(f.drops).toEqual([]);
   f.worlds.physics(1/30,{skipIds:new Set(['player','a'])});f.worlds.goody('player');f.worlds.goody('a');
   fail=vi.spyOn(f.a.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('late detach peer');});expect(()=>f.worlds.completeGoody(1/30)).toThrow('late detach peer');expect(f.drops).toEqual([{id:'player',life:1}]);expect(f.player.modelState!.pickups).toEqual([]);expect(f.player.callback).toBe(1);
   f.worlds.completeGoody(1/30);expect(f.drops).toEqual([{id:'player',life:1},{id:'a',life:1}]);for(const world of [f.player,f.a]){expect(world.callback).toBe(2);expect(world.modelState!.pickups).toHaveLength(1);expect(world.modelState!.fades).toHaveLength(1);expect(world.modelState!.actors.some(actor=>actor.actorId==='b')).toBe(false);}
  }finally{fail?.mockRestore();f.dispose();}
 });
});
