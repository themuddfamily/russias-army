import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalCombatEffectResources} from './originalCombatEffectPresentation';
import {createOriginalExplosionResources} from './originalExplosionPresentation';
import {createOriginalSoloTransientRendererBinding} from './originalSoloTransientResources';
import {createOriginalSoloBotSceneAssembly,type OriginalSoloSceneAssemblyOptions} from './originalSoloSceneAssembly';
import {captureOriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';
import {createOriginalSoloProjectileBirth} from './originalSoloProjectileBinding';
import {captureOriginalSoloBotProjectileProgram} from './originalSoloBotProjectileProgram';
import {captureOriginalSoloBotShot,type OriginalSoloBotShotCapture} from '../shared/originalSoloBotShotCapture';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloBotProjectileProgram} from '../shared/originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloBotProjectileCommit} from '../shared/originalSoloBotProjectileAdmissions';
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

const assets=new URL('../public/assets/',import.meta.url),read=<T>(path:string)=>JSON.parse(readFileSync(new URL(path,assets),'utf8')) as T;
const geometry=read<OriginalSoldierAssets['geometry']>('original-soldier/geometry.json'),rigMotion=read<OriginalSoldierAssets['rigMotion']>('original-soldier/rig-motion.json'),weaponGeometry=read<OriginalWeaponGeometryData>('original-weapons/geometry.json');
const dataByMap={barrack:read<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/barrack/scene.json'),woodlands:read<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/woodland/scene.json')},tracks=read<OriginalDoorTracks>('original-scenes/barrack/doors.json');
const localHandles:ReceiverLocalWeaponHandle[]=['pistol','spas12','ak47','rg6','rpg','dragunov','rocket'];

// Actual decoded geometry, constructor observations and complete map inventory.
// Borrowed template/rocket ancestry and unit mapping are explicit CPU policies;
// this exercises authored shot admission, not native projectile/render fidelity.
function setup(map:'barrack'|'woodlands',alterProgram?:(program:OriginalSoloBotProjectileProgram)=>OriginalSoloBotProjectileProgram,alterCommit?:(checkpoint:OriginalSoloBotProjectileCommit)=>OriginalSoloBotProjectileCommit,weapons:{a:WeaponId;b:WeaponId}={a:'launcher',b:'rpg'}){
 const localForWeapon:Record<WeaponId,ReceiverLocalWeaponHandle>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
 const data=dataByMap[map],runtime=registerOriginalMapRuntime(map,data),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),soldierTexture=new THREE.Texture();
 const soldierResources=createOriginalSoldierResources({geometry,rigMotion,texture:soldierTexture},{geometry:weaponGeometry,textures},{resourceBindingId:'bot-actual-soldier-generation'}),collection=createOriginalWeapons({geometry:weaponGeometry,textures});
 const seedRig=new OriginalSoldier(soldierResources,{weapon:'rpg'}),capture=seedRig.readConstructorSeedCapture();
 const combat=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()}),explosion=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()}),planeMaterial=new THREE.MeshBasicMaterial({map:explosion.textures.rocket});
 const mapping=new THREE.Matrix4().compose(new THREE.Vector3(11,12,13),new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.2,-.1)),new THREE.Vector3(1,1,1)).toArray();
 const binding=createOriginalSoloTransientRendererBinding({soldierResources,combatResources:combat,explosionResources:explosion,planeGeometry:combat.geometry,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,planeGeometryProvenance:'actual application plane',sourceScale:runtime.scale,provenance:'bot actual FX resources',sidedness:'double',resourceBindingId:'bot-FX-generation',textureBindingId:'bot-texture-generation',nearFilter:THREE.LinearFilter,maxVertices:100000,maxFaces:100000,maxResourceEntries:256,maxTextChars:8192});
 const muzzle=(resource:string)=>({geometryProvenance:`actual soldier ${resource}`,group:'scene' as const,groupAncestry:[]});
 const resources:OriginalSoloSceneAssemblyOptions['resources']={soldierResources,weapons:weaponGeometry,transientBinding:binding,renderToWorld:mapping,
  actor:{sourceScale:runtime.scale,giResourceOrientation:capture.gi.resourceOrientation,gunScale:1,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,maxMeshes:256,maxDescriptorTextChars:8192,provenance:'actual bot actor resources',sidedness:'double'},
  actorLifecycle:{parentRestoresMembership:true,readDropYawPlan:(actorId,callback)=>captureOriginalSoloActorDropYawPlan(callback,[{actorId,random36:18}],{maxEntries:8,maxTextChars:8192}),maxTextChars:8192,constructorSeeds:{capture,gunFactory:seedRig.readGunConstructorSeedCapture('rpg')!,gunClonePolicy:'copy-fresh-gun-mesh-factory',giProvenance:'actual fresh GI constructor',gunProvenance:{pistol:'fresh pistol',shotgun:'fresh spas12',rifle:'fresh ak47',launcher:'fresh rg6',rpg:'fresh rpg',sniper:'fresh dragunov'},maxSeeds:7,maxTextChars:8192}},
  transientQuery:{maxVertices:100000,maxFaces:100000,maxMeshes:256,maxTextChars:8192},
  transientPolicy:{cloneMembership:'copy-effect-birth-parented',pointAtPolicy:'copy-plane-positive-z',omittedUpPolicy:'copy-negative-z',parallelUpPolicy:'copy-x',explicitUpPolicy:'copy-three-lookat',selfRotatePolicy:'copy-local-xyz',coincidentPolicy:'retain',maxTextChars:8192},
  effectPrototypes:{planeMaterial,constructorPolicy:'copy-fresh-mesh-identity-offworld-phase-zero',maxModels:5,maxTextChars:8192,muzzles:{pistol:muzzle('mfpistol'),shotgun:muzzle('mfspas12'),rifle:muzzle('mfak47'),sniper:muzzle('mfdragunov')}}};
 const doors=new OriginalDoorWorld(data,runtime.scale,map==='barrack'?tracks:{version:1,doors:[]}),barrels=new OriginalBarrelWorld(runtime);
 const owners=new Map<string,ReturnType<typeof createOriginalSoloBotSceneAssembly>>(),queues=new Map<string,OriginalSoloBotShotCapture[]>([['a',[]],['b',[]]]),programs=new Map<string,OriginalSoloBotProjectileProgram[]>(),constructorReads=new Map<string,number>(),cloneNames=new Map<string,string[]>(),events:OriginalSoloEvent[]=[];
 const game=Object.assign(Object.create(Game.prototype),{phase:'playing',mode:'solo',archivalWinter:false,arena:{runtime},elapsed:0,originalActorDispatchGeneration:0,soloBotShots:[] as OriginalSoloBotShotCapture[]}) as {readSoloBotProjectileShots:Game['readSoloBotProjectileShots'];soloBotShots:OriginalSoloBotShotCapture[];soloWorlds:OriginalSoloObserverWorlds;receiveSoloWorldEvent:(event:OriginalSoloEvent)=>void;completeSoloActors:()=>void};
 const worlds=new OriginalSoloObserverWorlds(runtime,{templateDoors:doors,templateBarrels:barrels,onEvent:event=>{events.push(event);if(event.kind==='bot-projectile-commit'){game.receiveSoloWorldEvent(event);queues.set(event.recipientId,game.soloBotShots.filter(shot=>shot.ownerId===event.recipientId));}},createReceiverScene:registration=>{
  let owner:ReturnType<typeof createOriginalSoloBotSceneAssembly>;
  programs.set(registration.id,[]);cloneNames.set(registration.id,[]);constructorReads.set(registration.id,0);
  const birth=(reservation:OriginalSoloLaunchReservation)=>{
   constructorReads.set(registration.id,constructorReads.get(registration.id)!+1);
   const launch=reservation.launch,physical=reservation.prototype;
   const freshModel=launch.weapon==='launcher'?owner.banks.projectileWorld.freeze().template:{...owner.banks.localWeaponWorld.freeze().models.find(model=>model.handle==='rocket')!,handle:'rocket',resource:'rpgrocket' as const,materialHandle:'canonical-rpg'};
   const captured=createOriginalSoloProjectileBirth({launchId:launch.id,weapon:launch.weapon,freshModel,pose:{launchId:launch.id,weapon:launch.weapon,position:physical.position,direction:physical.direction,...(physical.sourceRotation?{sourceRotation:physical.sourceRotation}:{}),renderToWorld:mapping,orientationPolicy:'copy-source-basis-unit-reset'},rocketMaterialHandle:'canonical-rpg',maxTextChars:65536});
   return {...captured,cloneFresh:(name?:string)=>{cloneNames.get(registration.id)!.push(name!);return captured.cloneFresh(name);}};
  };
  const lease=createOriginalSoloCurrentSceneLease({sourceScale:runtime.scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,requireActorResources:true,requireTransientResources:true,
   environment:{maxCommands:256,maxOutcomes:128,maxModels:2048,maxTextChars:1000000},controller:{model:{lifecycleJournal:{maxEntries:64,maxTextChars:8192},eyeHeight:85*runtime.scale,goodyBspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels:2048,maxPickups:16},transient:{maxModels:64,maxActors:64,maxShaders:64,maxTextChars:65536},maxEffects:128,transientState:true},
   createBackends:context=>{
    owner=createOriginalSoloBotSceneAssembly(collection,{resources,banks:{map,sceneGeneration:context.lifeGeneration,weapon:weapons[context.id as 'a'|'b'],sourceScale:runtime.scale,renderToWorld:mapping,cameraHandle:'private-camera',cameraWorldMatrix:mapping,initialGunPositionSource:{x:-12,y:-20,z:5},initialLoadedRocket:false,membership:Object.fromEntries(localHandles.map(handle=>[handle,handle===localForWeapon[weapons[context.id as 'a'|'b']]])) as Record<ReceiverLocalWeaponHandle,boolean>,ancestry:{pistol:['private-camera'],spas12:['private-camera'],ak47:['private-camera'],rg6:['private-camera'],rpg:['private-camera'],dragunov:['private-camera'],rocket:['rpg','private-camera']},followOffworldParents:true,parentRestoresMembership:true,grenadeMaterialHandle:'borrowed-grenade',grenadeAncestry:[],rocketMaterialHandle:'canonical-rpg',maxCommands:256,maxTextChars:65536,maxProjectileModels:32,maxProjectileActors:8},inventory:{data,doorNames:map==='barrack'?tracks.doors.map(door=>door.name):[],sky:data.runtime.sky,transientUnresolved:[],provenance:'actual decoded bot scene with explicit constructor policies',sidedness:'double',budgets:{maxModels:2048,maxVertices:2000000,maxFaces:2000000,maxTextChars:65536,maxMeshes:256}}});owners.set(registration.id,owner);
    // Dedicated bot assembly owns only local/projectile banks. Its supplied
    // projection/membership policy does not derive a human loadout or gun phase.
    return owner.backends;
   },
   captureLocalWeaponCallback:context=>({cameraWorldMatrix:mapping,velocityWorld:context.body.velocity,commands:[]}),
   captureBotProjectileProgram:(context,prefixes,previous,bangs)=>{const program=captureOriginalSoloBotProjectileProgram(context,prefixes,previous,bangs,prefixes.callback?game.readSoloBotProjectileShots(context):[],{renderToWorld:mapping,maxActors:8,maxShots:64,maxCommands:256,maxTextChars:65536,captureBirth:birth});const supplied=alterProgram?alterProgram(program):program;programs.get(registration.id)!.push(supplied);return supplied;},
   captureIncomingLaunches:(_context,_prefix,incoming)=>incoming.map(row=>({kind:'projectile-birth' as const,birth:birth(row.reservation)})),
   goodyAt:context=>({eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,weapon:context.weapon??'launcher'}),snapshotAt:(prefix,state,_context,actors)=>owner.snapshotAt(prefix,state,actors!),
  });
  return !alterCommit?lease:{...lease,readBotProjectileCommit:()=>{const checkpoint=lease.readBotProjectileCommit!();return checkpoint?alterCommit(checkpoint):undefined;}};
 }});
 game.soloWorlds=worlds;
 const a=worlds.register({id:'a',name:'Authored A',eye:{x:1000,y:1000,z:0}}),b=worlds.register({id:'b',name:'Authored B',eye:{x:1200,y:1000,z:0}});a.weapon=weapons.a;b.weapon=weapons.b;
 const add=(id:'a'|'b',sequence:number,weapon:'launcher'|'rpg')=>{const own=worlds.worlds.get(id)!,other=id==='a'?b:a;const shot=captureOriginalSoloBotShot({ownerId:id,ownerLife:own.lifeGeneration,sequence,capturedAt:0,weapon,targetId:other.id,targetLife:other.lifeGeneration,sourceShotOrigin:{x:-100,y:-100,z:-100},aimDirection:{x:0,y:0,z:-1},targetDistance:200,authoredDamage:5,chanceRoll:.99},{maxTextChars:65536});queues.get(id)!.push(shot);game.soloBotShots.push(shot);return shot;};
 const prepare=(time:number)=>{worlds.physics(time,{skipIds:new Set(['a','b'])});worlds.goody('a');worlds.goody('b');};
 return {worlds,game,a,b,owners,queues,programs,constructorReads,cloneNames,events,collection,soldierResources,seedRig,mapping,add,prepare,dispose(){worlds.clear();seedRig.dispose();collection.dispose();soldierResources.dispose();combat.dispose();explosion.dispose();planeMaterial.dispose();soldierTexture.dispose();for(const texture of textures.values())texture.dispose();}};
}

describe('authored bot projectile program through actual complete scene and coordinator',()=>{
 it.each(['barrack','woodlands'] as const)('%s preserves authored rifle/RPG local selection through rollback, death receipt and fresh life replacement',map=>{
  const f=setup(map,undefined,undefined,{a:'rifle',b:'rpg'}),fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('authored selection peer failure');});
  try{
   f.prepare(0);expect(()=>f.worlds.completeGoody(0)).toThrow('authored selection peer failure');
   const oldB=f.owners.get('b')!;
   for(const [id,weapon] of [['a','rifle'],['b','rpg']] as const){const owner=f.owners.get(id)!;expect(owner.banks.localWeaponWorld.freeze().selectedWeapon).toBe(weapon);expect('loadoutWorld' in owner.backends).toBe(false);expect('weaponReportWorld' in owner.backends).toBe(false);}
   f.worlds.completeGoody(0);f.worlds.actors(0);
   expect(f.a.localWeapons!.selectedWeapon).toBe('rifle');expect(f.b.localWeapons!.selectedWeapon).toBe('rpg');
   for(const programs of f.programs.values())for(const program of programs){expect(program.callbackCommands).toEqual([]);expect(program.botLaunchAdmissions).toEqual([]);}
   f.worlds.dispose('b');expect(f.a.localWeapons!.prefix.kind).toBe('receipt');expect(f.a.localWeapons!.selectedWeapon).toBe('rifle');expect(f.a.localWeapons!.motion.weapon).toBe('rifle');expect(()=>oldB.banks.localWeaponWorld.freeze()).toThrow(/released/);
   // Game waits 1.3 seconds before authored respawn. The intervening live
   // callback must actually detach the dead actor before a same-ID birth.
   f.worlds.physics(1/30,{skipIds:new Set(['a'])});f.worlds.goody('a');f.worlds.completeGoody(1/30);f.worlds.actors(1/30);
   expect(f.a.modelState!.actors.some(actor=>actor.actorId==='b')).toBe(false);expect(f.a.modelState!.fades).toHaveLength(1);expect(f.a.modelState!.pickups).toHaveLength(1);
   const replacement=f.worlds.register({id:'b',name:'Fresh authored B',eye:{x:1200,y:1000,z:0}},1.3);replacement.weapon='rpg';
   f.prepare(1.3);f.worlds.completeGoody(1.3);
   expect(replacement.lifeGeneration).toBe(2);expect(replacement.localWeapons!.prefix.sceneGeneration).toBe(2);expect(replacement.localWeapons!.selectedWeapon).toBe('rpg');expect(replacement.localWeapons!.motion.weapon).toBe('rpg');expect(replacement.loadout).toBeUndefined();expect(replacement.gunPhase).toBeUndefined();expect(f.owners.get('b')).not.toBe(oldB);expect(f.a.localWeapons!.selectedWeapon).toBe('rifle');expect(f.a.modelState!.actors.some(actor=>actor.actorId==='b')).toBe(true);expect(f.a.modelState!.fades).toHaveLength(1);expect(f.a.modelState!.pickups).toHaveLength(1);
  }finally{fail.mockRestore();f.dispose();}
 });

 it('bounds committed shot traversal without invoking an overridden frozen-array iterator',()=>{
  const iterator=vi.fn(()=>{throw Error('unbounded custom iterator');});
  const f=setup('woodlands',undefined,checkpoint=>{const shots=Array.from(checkpoint.shots);Object.defineProperty(shots,Symbol.iterator,{value:iterator});return Object.freeze({...checkpoint,shots:Object.freeze(shots)});});
  try{const shot=f.add('a',1,'launcher');f.prepare(0);f.worlds.completeGoody(0);expect(iterator).not.toHaveBeenCalled();expect(f.game.soloBotShots).toEqual([]);expect(f.a.botProjectileSequence).toBe(shot.sequence);expect(f.a.projectiles.size).toBe(1);expect(f.b.projectiles.size).toBe(1);}finally{f.dispose();}
 });
 it.each(['projectile-birth','local-hitscan','weapon-report-send','weapon-fire','loadout-capture'] as const)('rejects unclaimed or human %s commands at the authored receipt boundary before joint publication',kind=>{
  const f=setup('barrack',program=>({...program,receiptCommands:[...program.receiptCommands,{kind} as unknown as OriginalSoloBotProjectileProgram['receiptCommands'][number]]}));
  try{f.add('a',1,'launcher');f.prepare(0);expect(()=>f.worlds.completeGoody(0)).toThrow('authored bot projectile receipt command');expect(f.a.callback).toBe(0);expect(f.a.projectiles.size).toBe(0);expect(f.b.projectiles.size).toBe(0);expect(f.game.soloBotShots).toHaveLength(1);expect(f.events).toEqual([]);expect(()=>f.owners.get('a')!.banks.projectileWorld.freeze()).toThrow(/released/);}finally{f.dispose();}
 });

 it.each(['barrack','woodlands'] as const)('%s stages both sender and incoming constructor ownership, then retains it through late peer rollback/retry',map=>{
  const f=setup(map),shotA=f.add('a',1,'launcher'),shotB=f.add('b',2,'rpg'),geometry=f.collection.resources.get('rg6grenade')!.geometry,dispose=vi.spyOn(geometry,'dispose'),matrices=[...f.collection.resources].map(([name,mesh])=>({name,matrix:mesh.matrixWorld.toArray()}));
  const fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('late authored peer stage');});
  try{
   f.prepare(0);const eyeA=originalPlayerEye(f.a.body),eyeB=originalPlayerEye(f.b.body);
   expect(()=>f.worlds.completeGoody(0)).toThrow('late authored peer stage');
   expect(f.a.callback).toBe(0);expect(f.b.callback).toBe(0);expect(f.a.projectiles.size).toBe(0);expect(f.b.projectiles.size).toBe(0);expect(f.events).toEqual([]);
   for(const owner of f.owners.values()){expect(owner.banks.projectileWorld.freeze().actors).toEqual([]);expect(owner.banks.localWeaponWorld.freeze().prefix.callback).toBe(0);}
   expect(f.queues.get('a')).toEqual([shotA]);expect(f.queues.get('b')).toEqual([shotB]);expect(f.game.soloBotShots).toEqual([shotA,shotB]);
   for(const [id,weapon] of [['a','launcher'],['b','rpg']] as const){const bank=f.owners.get(id)!.banks;expect(bank.localWeaponWorld.freeze().selectedWeapon).toBe(weapon);expect(bank.localWeaponWorld.freeze().motion.weapon).toBe(weapon);expect('loadoutWorld' in bank).toBe(false);expect('weaponReportWorld' in bank).toBe(false);}
   const programA=f.programs.get('a')![0],programB=f.programs.get('b')![0],claimA=programA.botLaunchAdmissions[0].admission,claimB=programB.botLaunchAdmissions[0].admission;if(!claimA.ok||!claimB.ok)throw Error('Missing actual reservations');
   expect(claimA.reservation.launch.eye).toEqual(eyeA);expect(claimB.reservation.launch.eye).toEqual(eyeB);expect(claimA.reservation.launch.eye).not.toEqual(shotA.sourceShotOrigin);
   const namesA=[...f.cloneNames.get('a')!],reads=[...f.constructorReads];
   f.worlds.completeGoody(0);
   expect(f.programs.get('a')).toEqual([programA]);expect(f.programs.get('b')).toEqual([programB]);expect([...f.constructorReads]).toEqual(reads);expect(f.cloneNames.get('a')!).toEqual([...namesA,...namesA]);
   expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);expect(f.queues.get('a')).toEqual([]);expect(f.queues.get('b')).toEqual([]);
   const commits=f.events.filter(event=>event.kind==='bot-projectile-commit');expect(commits).toHaveLength(2);expect(commits.map(event=>event.kind==='bot-projectile-commit'?event.checkpoint.shots[0]:undefined)).toEqual([shotA,shotB]);
   for(const world of [f.a,f.b]){
    expect(world.projectiles.size).toBe(2);expect(world.projectileState!.actors).toHaveLength(2);expect(world.loadout).toBeUndefined();expect(world.gunPhase).toBeUndefined();expect(world.localWeapons!.selectedWeapon).toBe(world.weapon);expect(world.localWeapons!.motion.weapon).toBe(world.weapon);
    for(const claim of [claimA,claimB]){const row=world.projectiles.get(claim.reservation.launch.id)!;expect(row.state.position).toEqual(claim.reservation.prototype.position);expect(row.state.remainingCallbacks).toBe(claim.reservation.prototype.remainingCallbacks);const actor=world.projectileState!.actors.find(actor=>actor.launchId===row.launch.id)!;const model=world.projectileState!.models.find(model=>model.handle===actor.handle)!;const expected=new THREE.Vector3().copy(row.state.position).applyMatrix4(new THREE.Matrix4().fromArray(f.mapping));expect(model.worldMatrix[12]).toBeCloseTo(expected.x);expect(model.worldMatrix[13]).toBeCloseTo(expected.y);expect(model.worldMatrix[14]).toBeCloseTo(expected.z);if(row.launch.weapon==='rpg')expect(model.materialHandle).toBe('canonical-rpg');}
   }
   const birthCounters=[...f.a.projectiles.values()].map(row=>row.state.remainingCallbacks),legacyLaunch=vi.spyOn(f.worlds,'launch');f.game.completeSoloActors();expect(legacyLaunch).not.toHaveBeenCalled();legacyLaunch.mockRestore();expect([...f.a.projectiles.values()].map(row=>row.state.remainingCallbacks)).toEqual(birthCounters);expect(f.game.soloBotShots).toEqual([]);
   f.prepare(1/30);f.worlds.completeGoody(1/30);expect(f.programs.get('a')![1].receiptCommands.map(command=>command.kind)).toEqual(['projectile-pose','projectile-pose']);expect(f.programs.get('a')![1].botLaunchAdmissions).toEqual([]);f.worlds.actors(1/30);expect([...f.a.projectiles.values()].map(row=>row.state.remainingCallbacks)).toEqual(birthCounters.map(count=>count-1));
   expect([...f.collection.resources].map(([name,mesh])=>({name,matrix:mesh.matrixWorld.toArray()}))).toEqual(matrices);f.worlds.clear();expect(dispose).not.toHaveBeenCalled();for(const owner of f.owners.values())expect(()=>owner.banks.projectileWorld.freeze()).toThrow(/released/);
  }finally{fail.mockRestore();dispose.mockRestore();f.dispose();}
 });
 it('commits eight exact physical/model births and consumes the ninth source shot as an actual cap rejection',()=>{
  const f=setup('barrack');try{
   const shots=Array.from({length:9},(_,i)=>f.add('a',i+1,'launcher'));f.prepare(0);f.worlds.completeGoody(0);
   const program=f.programs.get('a')![0];expect(program.botLaunchAdmissions.map(row=>row.shot)).toEqual(shots);expect(program.botLaunchAdmissions.filter(row=>row.admission.ok)).toHaveLength(8);expect(program.botLaunchAdmissions[8].admission).toEqual({ok:false,reason:'projectile-cap'});expect(program.callbackCommands).toHaveLength(8);
   expect(f.a.projectiles.size).toBe(8);expect(f.b.projectiles.size).toBe(8);expect(f.a.projectileState!.actors).toHaveLength(8);expect(f.b.projectileState!.actors).toHaveLength(8);expect(f.constructorReads.get('a')).toBe(8);expect(f.constructorReads.get('b')).toBe(8);expect(f.queues.get('a')).toEqual([]);
   expect(f.events.filter(event=>event.kind==='spawned')).toHaveLength(16);const commit=f.events.find(event=>event.kind==='bot-projectile-commit'&&event.recipientId==='a');if(commit?.kind!=='bot-projectile-commit')throw Error('Missing committed cap consumption');expect(commit.checkpoint.shots).toEqual(shots);expect(f.a.loadout).toBeUndefined();
  }finally{f.dispose();}
 });
});
