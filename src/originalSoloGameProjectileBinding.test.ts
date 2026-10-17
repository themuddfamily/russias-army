import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {Game} from './game';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from '../shared/originalSoloObserverWorld';
import {createOriginalSoloCurrentSceneLease} from '../shared/originalSoloCurrentSceneProducer';
import {OriginalReceiverProjectileWorld} from '../shared/originalReceiverProjectileWorld';
import {OriginalReceiverLocalWeaponWorld} from '../shared/originalReceiverLocalWeaponWorld';
import {OriginalReceiverLoadoutWorld} from '../shared/originalReceiverLoadoutWorld';
import {captureOriginalSoloGunCallbackProgram} from '../shared/originalSoloGunCallbackProgram';
import {advanceOriginalReceiverGunCallback,type ReceiverGunCallbackInput} from '../shared/originalReceiverGunCallback';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from '../shared/originalReceiverLocalWeaponInventory';
import {createOriginalSceneGeometry,type OriginalSceneData} from '../shared/originalSceneGeometry';
import type {OriginalMapRuntime} from '../shared/originalMapRuntime';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';
import {createOriginalSoloProjectileBirth} from './originalSoloProjectileBinding';
import {captureOriginalSoloProjectileReceiptProgram} from './originalSoloProjectileProgram';
import type {ReceiverModelPose} from '../shared/originalReceiverModelWorld';

const I=new THREE.Matrix4().toArray(),unit=new THREE.Matrix4().makeScale(ORIGINAL_WEAPON_UNIT_SCALE,ORIGINAL_WEAPON_UNIT_SCALE,ORIGINAL_WEAPON_UNIT_SCALE).toArray();
const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const pose=():ReceiverModelPose=>({position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}});

// Actual decoded weapon buffers, bank/receipt/constructor/coordinator and Game
// consumers. The floor and non-projectile backend are controlled CPU fixtures;
// this does not attest complete map, native renderer, audio or actor timing.
function fixture(map:'barrack'|'woodlands',weapon:'launcher'|'rpg'='launcher',bind=true){
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),collection=createOriginalWeapons({geometry,textures}),scene=new THREE.Scene();
 const data:OriginalSceneData={nodes:[{name:'floor',parent:'World',resource:'floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'floor',part:0,positions:[[-100,-100,-100],[100,-100,-100],[0,100,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const collision=createOriginalSceneGeometry(data,{scale:.02}),runtime:OriginalMapRuntime={map,data,scale:.02,geometry:collision,spawnPoints:[],profile:{scale:.02,radius:1,bodyHeight:1,eyeHeight:1,bounds:collision.bounds}};
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,20,0);
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,mode:'solo',archivalWinter:false,phase:'playing',playerAlive:true,elapsed:0,originalActorDispatchGeneration:0,originalWeapons:collection,scene,camera,arena:{runtime,syncBarrels:vi.fn()},projectiles:[],originalBlasts:[],enemies:[],soloBotShots:[],soloPickupCapture:[],playOriginalCombatSound:vi.fn(),createProjectileMesh:vi.fn(()=>new THREE.Mesh()),releaseProjectileMesh:vi.fn((mesh:THREE.Mesh)=>mesh.removeFromParent()),orientProjectileMesh:vi.fn(),spawnExplosion:vi.fn(),syncSoloMirrors:vi.fn(),updateWeaponDrops:vi.fn(),originalCombatEffectPresentation:{spawnPuff:vi.fn()}}) as any;
 let bank:OriginalReceiverProjectileWorld,fire=true,plans=0,time=0;
 const events:OriginalSoloEvent[]=[];
 const worlds=new OriginalSoloObserverWorlds(runtime,{onEvent:event=>{events.push(event);if(event.kind==='projectile-state'||event.kind==='spawned'||event.kind==='detonated')game.receiveSoloWorldEvent(event);},createReceiverScene:()=>createOriginalSoloCurrentSceneLease({sourceScale:.02,maxCapturedBlasts:8,maxCapturedProjectiles:8,
  environment:{maxCommands:128,maxOutcomes:64,maxModels:32,maxTextChars:65536},controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:32,maxPickups:8},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},
  createBackends:c=>{
   bank=new OriginalReceiverProjectileWorld({prefix:{kind:'callback',sceneGeneration:c.lifeGeneration,callback:0},template:{handle:'grenade',resource:'rg6grenade',materialHandle:'borrowed-grenade',inWorld:false,worldMatrix:unit,groupAncestry:[]},catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]}},{maxModels:8,maxActors:8,maxCommands:128,maxTextChars:65536,rocketMaterialHandle:'canonical-rpg'});
   const prefix={kind:'callback' as const,sceneGeneration:c.lifeGeneration,callback:0},weapons=['pistol','shotgun','rifle','launcher','rpg','sniper'] as const;
   const ammo=Object.fromEntries(weapons.map(w=>[w,10])) as Record<typeof weapons[number],number>,owned=Object.fromEntries(weapons.map(w=>[w,true])) as Record<typeof weapons[number],boolean>;
   const localWeaponWorld=new OriginalReceiverLocalWeaponWorld({prefix,cameraHandle:'camera',cameraWorldMatrix:I,selectedWeapon:weapon,loadedRocket:true,motion:{weapon,ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as keyof typeof ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,resource,worldMatrix:unit,inWorld:false,groupAncestry:[]}))},{sourceScale:.02,maxCommands:128,maxTextChars:65536,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
   const loadoutWorld=new OriginalReceiverLoadoutWorld({prefix,map,selected:weapon,owned,ammo,reserve:{...ammo},refillTarget:weapon==='rpg'?1:6,counter:new OriginalWeaponCounter(map,weapon).state,score:0,goldScore:0},{maxCommands:128,maxTextChars:65536,weaponModelPresent:owned});
   return {projectileWorld:bank,localWeaponWorld,loadoutWorld,model:{cloneGI:()=>({pose:pose(),geometryProvenance:'controlled-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'controlled-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource' as const}),heldGunPose:()=>pose(),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'controlled-empty-downward'}})},transient:{clonePlane:()=>({pose:pose(),geometryProvenance:'controlled-plane',inWorld:false}),cloneMuzzle:()=>({pose:pose(),geometryProvenance:'controlled-muzzle',inWorld:false}),pointAt:()=>pose().rotation!,selfRotate:q=>q}};
  },
  captureLocalWeaponCallback:c=>({cameraWorldMatrix:I,velocityWorld:c.body.velocity,commands:[]}),
  captureIncomingLaunches:()=>[],
  captureLoadoutProgram:(c,p,previous,bangs)=>{
   plans++;const receiptCommands=captureOriginalSoloProjectileReceiptProgram(previous.projectiles!,[...c.projectiles.values()],bangs,{renderToWorld:I,maxActors:8,maxCommands:128,maxTextChars:65536});
   if(!p.callback)return {receiptCommands};
   const input:ReceiverGunCallbackInput={prefix:p.callback,held:{typing:false,reload:false,fire,digits:[false,false,false,false,false,false]},weaponModelPresent:{pistol:true,shotgun:true,rifle:true,launcher:true,rpg:true,sniper:true}};
   // The pure source helper determines actual sample demand, including cooldown
   // callbacks. It does not reserve, mutate a bank or submit a launch.
   const sampled=advanceOriginalReceiverGunCallback(previous.loadout,input);
   const gun=captureOriginalSoloGunCallbackProgram(previous.loadout,input,{shiftHeld:false,sourceScopeEnabled:false,sendReport:false,random3:sampled.intents.filter(intent=>intent.kind==='yaw-kick-request').map(()=>2),maxCommands:128,maxModels:32,maxTextChars:65536,captureLaunch:request=>{
    const firingWeapon=request.fire.weapon;if(firingWeapon!=='launcher'&&firingWeapon!=='rpg')throw Error('Unexpected fixture gun');
    const admission=c.reserveLaunch!({weapon:firingWeapon,eye:originalPlayerEye(c.body),direction:{x:0,y:0,z:-1},...(firingWeapon==='rpg'?{sourceRotation:{x:0,y:0,z:0}}:{})},0);
    if(!admission.ok)return {admission};
    const birth=createOriginalSoloProjectileBirth({launchId:admission.reservation.launch.id,weapon:firingWeapon,freshModel:{handle:firingWeapon==='rpg'?'rocket':'grenade',resource:firingWeapon==='rpg'?'rpgrocket':'rg6grenade',materialHandle:firingWeapon==='rpg'?'canonical-rpg':'borrowed-grenade',inWorld:false,worldMatrix:unit,groupAncestry:[]},pose:{launchId:admission.reservation.launch.id,weapon:firingWeapon,position:admission.reservation.prototype.position,direction:admission.reservation.prototype.direction,...(admission.reservation.prototype.sourceRotation?{sourceRotation:admission.reservation.prototype.sourceRotation}:{}),renderToWorld:I,orientationPolicy:'copy-source-basis-unit-reset'},rocketMaterialHandle:'canonical-rpg',maxTextChars:65536});
    return {admission,birth};
   }});
   return {receiptCommands,callbackCommands:gun.callbackCommands,gunPhase:gun.gunPhase,launchAdmissions:gun.launchAdmissions};
  },
  goodyAt:c=>({eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:1,weapon:c.weapon??weapon}),
  snapshotAt:(prefix,state)=>({prefix,missing:[],provenance:'controlled-projectile-only-inventory',models:(state.projectiles?.models??[]).map(model=>({handle:model.handle,name:model.handle,resource:model.resource,kind:'projectile' as const,group:'scene' as const,inWorld:model.inWorld,worldMatrix:model.worldMatrix,geometryProvenance:'actual projectile RAW buffers',pose:pose()}))}),
 })});
 game.soloWorlds=worlds;const world=worlds.register({id:'player',name:'Human',eye:{x:0,y:20,z:0}});world.weapon=weapon;
 const options={maxModels:8,maxActors:8,maxTextChars:65536,rocketMaterialHandle:'canonical-rpg',materialBindings:new Map([['borrowed-grenade',{resource:'rg6grenade' as const,material:collection.resources.get('rg6grenade')!.material}],['canonical-rpg',{resource:'rpgrocket' as const,material:collection.resources.get('rpgrocket')!.material}]])};
 if(bind)game.bindSoloProjectilePresentation(world,options);
 const prepare=()=>{worlds.physics(time);worlds.goody('player');},finish=()=>worlds.completeGoody(time),actors=()=>{game.elapsed=time;game.completeSoloActors();time+=1/30;},cycle=()=>{prepare();finish();actors();};
 return {game,world,worlds,collection,scene,events,options,prepare,finish,actors,cycle,plans:()=>plans,bank:()=>bank!,setFire:(value:boolean)=>{fire=value;},adapter:()=>game.soloProjectilePresentation?.adapter,dispose(){game.disposeSoloWorlds(false);collection.dispose();for(const texture of textures.values())texture.dispose();}};
}

describe('actual Game committed projectile presentation',()=>{
 it.each(['barrack','woodlands'] as const)('%s adopts committed birth before spawned audio and suppresses legacy meshes',map=>{
  const f=fixture(map);try{f.cycle();f.setFire(false);
   expect(f.world.projectileState!.actors).toHaveLength(1);const state=f.world.projectileState!,handle=state.actors[0].handle,mesh=f.adapter().meshForHandle(handle)!;
   expect(f.game.hasCommittedSoloProjectiles()).toBe(true);expect(mesh.parent).toBe(f.scene);expect(f.game.projectiles).toEqual([]);expect(f.game.createProjectileMesh).not.toHaveBeenCalled();expect(f.game.orientProjectileMesh).not.toHaveBeenCalled();expect(f.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('grenade1',expect.anything(),7);
   expect(f.events.findIndex(e=>e.kind==='projectile-state')).toBeLessThan(f.events.findIndex(e=>e.kind==='spawned'));
   const raw=geometry.meshes.find(m=>m.resource==='rg6grenade')!.positions[0],expected=new THREE.Vector3(raw[0],raw[1],raw[2]).applyMatrix4(new THREE.Matrix4().fromArray(state.models[0].worldMatrix)),actual=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),0).applyMatrix4(mesh.matrixWorld);expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
   const before=mesh.matrixWorld.clone();f.cycle();expect(f.adapter().meshForHandle(handle)).toBe(mesh);expect(mesh.matrixWorld.equals(before)).toBe(false);expect(f.game.orientProjectileMesh).not.toHaveBeenCalled();
  }finally{f.dispose();}
 });
 it('keeps legacy fallback until an explicit resource binding adopts and then retires its lease',()=>{
  const f=fixture('woodlands','launcher',false);try{f.cycle();f.setFire(false);expect(f.game.createProjectileMesh).toHaveBeenCalledOnce();const legacy=f.game.projectiles[0].mesh;f.game.bindSoloProjectilePresentation(f.world,f.options);expect(f.game.projectiles).toEqual([]);expect(f.game.releaseProjectileMesh).toHaveBeenCalledWith(legacy);expect(f.game.hasCommittedSoloProjectiles()).toBe(true);expect(()=>f.game.bindSoloProjectilePresentation(f.world,f.options)).toThrow('already bound');}finally{f.dispose();}
 });
 it('publishes no renderer state before commit and retains one captured launch through rollback',()=>{
  const f=fixture('woodlands');try{f.prepare();const fail=vi.spyOn(f.world.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('projectile preparation failed');});expect(f.finish).toThrow('projectile preparation failed');const plans=f.plans();expect(f.adapter().freeze()).toBeUndefined();expect(f.scene.children).toEqual([]);expect(f.events.filter(e=>e.kind==='spawned'||e.kind==='projectile-state')).toEqual([]);f.setFire(false);fail.mockRestore();f.finish();expect(f.plans()).toBe(plans);expect(f.adapter().freeze()!.actors).toHaveLength(1);expect(f.game.createProjectileMesh).not.toHaveBeenCalled();}finally{f.dispose();}
 });
 it('rejects a failed late binding without retiring legacy state and permits corrected binding',()=>{
  const f=fixture('woodlands','launcher',false);try{f.cycle();f.setFire(false);const legacy=f.game.projectiles[0].mesh;
   const materials=new Map(f.options.materialBindings);materials.delete('borrowed-grenade');
   expect(()=>f.game.bindSoloProjectilePresentation(f.world,{...f.options,materialBindings:materials})).toThrow('Unmapped');expect(f.adapter()).toBeUndefined();expect(f.game.projectiles[0].mesh).toBe(legacy);expect(f.game.releaseProjectileMesh).not.toHaveBeenCalled();
   f.game.bindSoloProjectilePresentation(f.world,f.options);expect(f.game.hasCommittedSoloProjectiles()).toBe(true);expect(f.game.releaseProjectileMesh).toHaveBeenCalledWith(legacy);
  }finally{f.dispose();}
 });
 it('retains the exact renderer handle through ordinary fuse retirement and FIFO rebirth',()=>{
  const f=fixture('woodlands');try{f.cycle();f.setFire(false);const handle=f.world.projectileState!.actors[0].handle,mesh=f.adapter().meshForHandle(handle)!;let steps=0;
   while(f.world.projectiles.size&&steps<60){f.cycle();steps++;}expect(steps).toBe(59);f.prepare();f.finish();expect(f.world.projectileState!.fifo.launcher).toEqual([handle]);expect(mesh.parent).toBeNull();expect(mesh.visible).toBe(false);f.actors();f.setFire(true);f.cycle();expect(f.world.projectileState!.actors[0].handle).toBe(handle);expect(f.adapter().meshForHandle(handle)).toBe(mesh);expect(mesh.parent).toBe(f.scene);expect(f.game.createProjectileMesh).not.toHaveBeenCalled();}finally{f.dispose();}
 });
 it('preserves RPG puff/audio while leaving orientation and matrices to committed captures',()=>{
  const f=fixture('woodlands','rpg');try{f.cycle();f.setFire(false);f.cycle();expect(f.game.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledOnce();expect(f.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('offrock',expect.anything(),7);expect(f.game.createProjectileMesh).not.toHaveBeenCalled();expect(f.game.orientProjectileMesh).not.toHaveBeenCalled();}finally{f.dispose();}
 });
 it('ignores foreign event captures, rebases without physics, freezes endgame and releases on reset',()=>{
  const f=fixture('woodlands');try{f.cycle();f.setFire(false);const event=f.events.find(e=>e.kind==='projectile-state')!;if(event.kind!=='projectile-state')throw Error('Missing checkpoint');const handle=event.checkpoint.actors[0].handle,mesh=f.adapter().meshForHandle(handle)!,matrix=mesh.matrixWorld.clone();f.game.receiveSoloWorldEvent({...event,checkpoint:{...event.checkpoint}});expect(mesh.matrixWorld.equals(matrix)).toBe(true);f.scene.position.x=7;f.adapter().rebase();expect(mesh.matrixWorld.equals(matrix)).toBe(true);const bank=f.adapter().freeze();f.game.disposeSoloWorlds(true);expect(f.game.hasCommittedSoloProjectiles()).toBe(true);expect(f.adapter().freeze()).toBe(bank);expect(mesh.parent).toBe(f.scene);f.game.resetOriginalProjectileModels();expect(mesh.parent).toBeNull();expect(f.game.hasCommittedSoloProjectiles()).toBe(false);f.game.resetOriginalProjectileModels();}finally{f.dispose();}
 });
});
