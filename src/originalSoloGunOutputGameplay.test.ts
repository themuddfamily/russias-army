import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {Game} from './game';
import {WeaponState,type WeaponId} from './weapons';
import {createOriginalSoloCurrentSceneLease} from '../shared/originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from '../shared/originalSoloObserverWorld';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from '../shared/originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld} from '../shared/originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from '../shared/originalReceiverLocalWeaponInventory';
import {advanceOriginalReceiverGunCallback} from '../shared/originalReceiverGunCallback';
import {captureOriginalReceiverGunOutputs} from '../shared/originalReceiverGunOutput';
import {originalProjectileDirection} from '../shared/originalProjectileOrientation';
import {createOriginalReceiverGeometryQuery} from '../shared/originalReceiverGeometryBackend';
import {createReceiverLocalHitscanQuery,type ReceiverLocalHitscanSceneCapture} from '../shared/originalReceiverLocalHitscan';
import {ORIGINAL_RECEIVER_SCENE_LAYERS} from '../shared/originalReceiverSceneRay';
import {createOriginalSceneGeometry,type OriginalSceneData} from '../shared/originalSceneGeometry';
import type {OriginalMapRuntime} from '../shared/originalMapRuntime';
import type {ReceiverCurrentEnvironmentCommand} from '../shared/originalReceiverCurrentEnvironment';
import type {ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import {createOriginalScope} from './originalScope';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],zero={x:0,y:0,z:0};
const slots:WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const counts=(n:number)=>Object.fromEntries(slots.map(w=>[w,n])) as Record<WeaponId,number>;
const owned=()=>Object.fromEntries(slots.map(w=>[w,true])) as Record<WeaponId,boolean>;
const pose=():ReceiverModelPose=>({position:{...zero},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}});

// Actual gun helper/private banks/producer/query/coordinator and Game methods.
// One controlled CPU receiver, offworld local models and gsmokes muzzle geometry;
// independent physical floor, skipped solver and UI/presentation mocks. This
// proves committed output delivery, not default factory/native geometry or sound fidelity.
function fixture(map:'barrack'|'woodlands',config:{weapon?:WeaponId;onEvent?:(event:OriginalSoloEvent)=>void;afterCapture?:()=>void}={}){
 const weapon=config.weapon??'rifle';
 const scale=.02,data:OriginalSceneData={nodes:[{name:'fixture-floor',parent:'World',resource:'fixture-floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'fixture-floor',part:0,positions:[[-100,-100,-100],[100,-100,-100],[0,100,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const geometry=createOriginalSceneGeometry(data,{scale}),runtime:OriginalMapRuntime={map,data,scale,geometry,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const state=new WeaponState(map),events:OriginalSoloEvent[]=[],captures:ReceiverLocalHitscanSceneCapture[]=[],rayDirections:Readonly<{x:number;y:number;z:number}>[]=[];
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,10,0);
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,mode:'solo',archivalWinter:false,phase:'playing',playerAlive:true,elapsed:0,nextSourceReloadPoll:0,originalActorDispatchGeneration:0,arena:{runtime},weaponState:state,keys:new Set<string>(),firing:true,chatOpen:false,controlsPreset:'legacy',camera,pitch:.1,yaw:.2,originalScopeState:createOriginalScope(),velocity:new THREE.Vector3(),scene:new THREE.Scene(),score:0,
  updateHud:vi.fn(),updateOriginalWeaponPresentation:vi.fn(),advanceOriginalMuzzleFlashes:vi.fn(),openSourceScope:vi.fn(()=>false),syncWeaponPresentation:vi.fn(),flushOriginalReconciliation:vi.fn(),playOriginalCombatSound:vi.fn(),audio:{play:vi.fn()},appendChat:vi.fn(),setMessage:vi.fn(),hitscan:vi.fn(),projectiles:[],enemies:[],weaponDrops:[],originalFlashes:[]}) as any;
 camera.rotation.set(game.pitch,game.yaw,0,'YXZ');
 let bank:OriginalReceiverLoadoutWorld|undefined,local:OriginalReceiverLocalWeaponWorld|undefined,plans=0;
 const worlds=new OriginalSoloObserverWorlds(runtime,{onEvent:event=>{events.push(event);game.receiveSoloWorldEvent(event);config.onEvent?.(event);},createReceiverScene:()=>createOriginalSoloCurrentSceneLease({sourceScale:scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:64,maxOutcomes:32,maxModels:64,maxTextChars:65536},controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:64,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},createBackends:c=>{
  const prefix={kind:'callback' as const,sceneGeneration:c.lifeGeneration,callback:0},seed:ReceiverLoadoutCheckpoint={prefix,map,selected:weapon,owned:owned(),ammo:counts(10),reserve:counts(30),refillTarget:28,counter:{waitgun:map==='barrack'?2:0,poldwaitgun:0},score:0,goldScore:0};
  bank=new OriginalReceiverLoadoutWorld(seed,{maxCommands:64,maxTextChars:65536,weaponModelPresent:owned()});
  local=new OriginalReceiverLocalWeaponWorld({prefix,cameraHandle:'fixture-camera',cameraWorldMatrix:I,selectedWeapon:weapon,loadedRocket:false,motion:{weapon,ticker:0,gunPositionSource:{x:3,y:-10,z:2}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as keyof typeof ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,resource,worldMatrix:I,inWorld:false,groupAncestry:['fixture-camera']}))},{sourceScale:scale,maxCommands:64,maxTextChars:65536,bindModels:(_operation,s)=>({models:s.models,loadedRocket:s.loadedRocket})});
  const query=createReceiverLocalHitscanQuery(createOriginalReceiverGeometryQuery({sceneGeneration:c.lifeGeneration,provenance:'declared-controlled-CPU-inventory',budget:{maxModels:64,maxTriangles:64,maxVertices:192},coverageAt:(callback,p,actors)=>({sceneGeneration:c.lifeGeneration,callback,prefix:p,actorRegistry:actors,expectedHandles:captures.at(-1)!.models.map(m=>m.handle),accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]}),resolveModel:m=>({handle:m.handle,layer:m.kind==='local-weapon'?'local-weapon':'transient',inWorld:m.inWorld,geometryProvenance:m.geometryProvenance,groupAncestry:['gsmokes'],positions:[[-1,-1,0],[1,-1,0],[0,1,0]],faces:[[0,1,2]],worldMatrix:I,sidedness:'double'})}));
  return {loadoutWorld:bank,localWeaponWorld:local,localHitscan:{nearestBullet:(capture,origin,direction)=>{captures.push(capture);rayDirections.push(direction);return query.nearestBullet(capture,origin,direction);}},model:{cloneGI:()=>({pose:pose(),geometryProvenance:'fixture-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'fixture-gun'}),heldGunPose:()=>pose(),sphere:()=>({bspWorld:1,provenance:'declared-resource' as const}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-downward'}})},transient:{clonePlane:()=>({pose:pose(),geometryProvenance:'fixture-plane',inWorld:true}),cloneMuzzle:()=>({pose:pose(),geometryProvenance:'fixture-muzzle',inWorld:true}),pointAt:()=>pose().rotation!,selfRotate:q=>q}};
 },captureLocalWeaponCallback:()=>({cameraWorldMatrix:I,velocityWorld:zero,commands:[]}),captureLoadoutProgram:(c,p,previous,admitted)=>{
  plans++;const receiptCommands=admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));if(!p.callback)return {receiptCommands};if(p.callback.kind!=='callback')throw Error('Expected callback');
  const typing=game.chatOpen,shiftHeld=game.keys.has('ShiftLeft')||game.keys.has('ShiftRight'),sourceScopeEnabled=game.controlsPreset==='legacy',sourceRotation={x:game.pitch*180/Math.PI,y:0,z:game.yaw*180/Math.PI};
  const gunPhase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:p.callback,held:{typing,reload:game.keys.has('KeyR'),fire:game.firing||game.keys.has('ControlLeft')||game.keys.has('ControlRight'),digits:slots.map((_w,i)=>game.keys.has(`Digit${i+1}`)) as [boolean,boolean,boolean,boolean,boolean,boolean]},weaponModelPresent:owned()});
  const outputs=captureOriginalReceiverGunOutputs(gunPhase,{typing,shiftHeld,sourceScopeEnabled,random3:gunPhase.intents.filter(intent=>intent.kind==='yaw-kick-request').map(()=>3)});
  const commands:ReceiverCurrentEnvironmentCommand[]=[{kind:'loadout-capture',checkpoint:gunPhase.checkpoint}];
  for(let intentIndex=0;intentIndex<gunPhase.intents.length;intentIndex++){
   const intent=gunPhase.intents[intentIndex];for(const row of outputs)if(row.intentIndex===intentIndex)commands.push({kind:'gun-output',output:row.output});
   if(intent.kind==='rocket-remove')commands.push({kind:'weapon-rocket',loadedRocket:false});
   else if(intent.kind==='rocket-parent')commands.push({kind:'weapon-rocket',loadedRocket:true});
   else if(intent.kind==='load-pose')commands.push({kind:'weapon-reload'});
   else if(intent.kind==='recoil-pose')commands.push({kind:'weapon-fire'});
   else if(intent.kind==='sortweapons')commands.push({kind:'weapon-whichgun',weapon:intent.weapon});
   else if(intent.kind==='fire'&&intent.action==='hitscan')for(let i=0;i<intent.rayCoordinates.length;i++)commands.push({kind:'local-hitscan',action:{prefix:p.callback,weapon:intent.weapon as 'rifle'|'pistol',sourceRotation,origin:originalPlayerEye(c.body),bspWorld:1,actorNames:{},effectId:`effect:${p.callback.callback}:${i}`,muzzleId:`muzzle:${p.callback.callback}:${i}`,gunPose:pose()}});
  }
  for(const row of outputs)if(row.intentIndex===gunPhase.intents.length)commands.push({kind:'gun-output',output:row.output});
  commands.push({kind:'weapon-finish'});config.afterCapture?.();return {receiptCommands,callbackCommands:commands,gunPhase};
 },goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:1,weapon:c.weapon!}:null,snapshotAt:(prefix,s)=>({prefix,missing:[],provenance:'declared-controlled-CPU-inventory',models:(s.localWeapons?.models??[]).map(m=>({handle:m.handle,name:m.handle,resource:m.resource,kind:'local-weapon' as const,group:'gsmokes' as const,inWorld:m.inWorld,worldMatrix:m.worldMatrix,geometryProvenance:'fixture-local',pose:pose()}))})})});
 game.soloWorlds=worlds;const world=worlds.register({id:'player',name:'Fixture',eye:camera.position});world.weapon=weapon;
 state.ammo[weapon]=10;state.select(weapon);
 const before=vi.fn(()=>{world.weapon=state.unarmed?world.weapon:state.current;worlds.physics(game.elapsed,{skipIds:new Set(['player'])});worlds.goody('player');worlds.completeGoody(game.elapsed);});
 const after=vi.fn(()=>worlds.actors(game.elapsed));
 return {game,state,world,worlds,events,captures,rayDirections,before,after,plans:()=>plans,bank:()=>bank!,cycle:()=>game.updateSourceWeaponInput(before,after),dispose:()=>worlds.clear()};
}

describe('Game receives committed source gun outputs (declared CPU scene)',()=>{
 it.each(['barrack','woodlands'] as const)('%s publishes rifle audio once after bank commit and applies logical recoil after the captured shot camera',map=>{
  let f:ReturnType<typeof fixture>;const observations:{ammo:number;callback:number;pitch:number;yaw:number}[]=[];
  f=fixture(map,{onEvent:event=>{if(event.kind==='gun-output'&&event.output.kind==='sound')observations.push({ammo:f.bank().freeze().ammo.rifle,callback:f.world.loadout!.prefix.callback,pitch:f.game.pitch,yaw:f.game.yaw});}});
  try{
   const camera=f.game.camera.quaternion.clone(),pitch=f.game.pitch,yaw=f.game.yaw;f.cycle();
   expect(observations).toEqual([{ammo:9,callback:1,pitch,yaw}]);expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();expect(f.game.playOriginalCombatSound.mock.calls[0][0]).toBe('gunfire');
   expect(f.game.pitch).toBeCloseTo(pitch+Math.PI/180,14);expect(f.game.yaw).toBeCloseTo(yaw+.5*Math.PI/180,14);expect(f.game.camera.quaternion.equals(camera)).toBe(true);expect(f.captures).toHaveLength(1);
   expect(f.rayDirections).toEqual([originalProjectileDirection({x:pitch*180/Math.PI,y:0,z:yaw*180/Math.PI})]);
   f.game.elapsed=1/30;f.cycle();expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();expect(f.state.ammo.rifle).toBe(9);
  }finally{f.dispose();}
 });
 it('publishes no sound or look changes on a failed bank preparation and reuses captured outputs on retry',()=>{
  const f=fixture('woodlands');try{
   const pitch=f.game.pitch,yaw=f.game.yaw,time=0,failure=vi.spyOn(f.world.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('gun output preparation failed');});
   f.worlds.physics(time,{skipIds:new Set(['player'])});f.worlds.goody('player');expect(()=>f.worlds.completeGoody(time)).toThrow('gun output preparation failed');expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();expect(f.game.pitch).toBe(pitch);expect(f.game.yaw).toBe(yaw);expect(f.bank().freeze().ammo.rifle).toBe(10);const plans=f.plans();
   failure.mockRestore();f.worlds.completeGoody(time);expect(f.plans()).toBe(plans);expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();expect(f.state.ammo.rifle).toBe(9);expect(f.game.pitch).toBeCloseTo(pitch+Math.PI/180,14);
  }finally{f.dispose();}
 });
 it('polls the old sniper before final digit selection using captured Shift and chat levels',()=>{
  const f=fixture('woodlands',{weapon:'sniper',afterCapture:()=>{f.game.keys.clear();f.game.chatOpen=true;}});try{
   f.game.firing=false;f.game.keys.add('ShiftLeft');f.game.keys.add('Digit1');f.cycle();
   expect(f.state.current).toBe('pistol');expect(f.game.chatOpen).toBe(true);expect(f.game.keys.size).toBe(0);
   const poll=f.events.find(event=>event.kind==='gun-output'&&event.output.kind==='scope-poll');expect(poll&&poll.kind==='gun-output'?poll.output:undefined).toMatchObject({kind:'scope-poll',weapon:'sniper',typing:false,shiftHeld:true});
   expect(f.game.originalScopeState).toMatchObject({active:true,fov:35,zoomonce:0});
   f.game.elapsed=1/30;f.cycle();expect(f.game.originalScopeState).toMatchObject({active:false,fov:50,zoomonce:1});
  }finally{f.dispose();}
 });
 it('does not create a sniper scope when typing was captured, even if live chat closes before dispatch',()=>{
  const f=fixture('woodlands',{weapon:'sniper',afterCapture:()=>{f.game.chatOpen=false;f.game.keys.add('ShiftLeft');}});try{
   f.game.firing=false;f.game.chatOpen=true;f.cycle();expect(f.events.filter(event=>event.kind==='gun-output'&&event.output.kind==='scope-poll')).toEqual([]);expect(f.game.originalScopeState).toMatchObject({active:false,fov:50});
  }finally{f.dispose();}
 });
 it.each([{captured:'modern',live:'legacy',enabled:false},{captured:'legacy',live:'modern',enabled:true}])('uses captured $captured scope policy when the preset becomes $live before committed output dispatch',({captured,live,enabled})=>{
  let f:ReturnType<typeof fixture>;f=fixture('woodlands',{weapon:'sniper',afterCapture:()=>{f.game.controlsPreset=live;}});try{
   f.game.controlsPreset=captured;f.game.firing=false;f.game.keys.add('ShiftLeft');f.cycle();
   const rows=f.events.filter(event=>event.kind==='gun-output'&&(event.output.kind==='scope-poll'||event.output.kind==='scope-frame'));
   expect(rows).toHaveLength(2);for(const row of rows){if(row.kind!=='gun-output')throw Error('Missing scope output');expect(row.output).toMatchObject({sourceScopeEnabled:enabled});expect(Object.isFrozen(row.output)).toBe(true);}
   expect(f.game.controlsPreset).toBe(live);expect(f.game.originalScopeState).toMatchObject(enabled?{active:true,fov:35,zoomonce:0}:{active:false,fov:50,zoomonce:1});
   // Already consumed poll/frame delivery cannot replay after another preset
   // transition, even when that transition would permit a fresh source scope.
   f.game.controlsPreset=captured;for(const row of rows)f.game.receiveSoloWorldEvent(row);
   expect(f.game.originalScopeState).toMatchObject(enabled?{active:true,fov:35}:{active:false,fov:50});
  }finally{f.dispose();}
 });
 it.each([{captured:'modern',live:'legacy',enabled:false},{captured:'legacy',live:'modern',enabled:true}])('retains $captured scope policy across a failed preparation and retry under $live controls',({captured,live,enabled})=>{
  const f=fixture('woodlands',{weapon:'sniper'});try{
   f.game.controlsPreset=captured;f.game.firing=false;f.game.keys.add('ShiftLeft');
   const failure=vi.spyOn(f.world.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('scope policy preparation failed');});
   f.worlds.physics(0,{skipIds:new Set(['player'])});f.worlds.goody('player');expect(()=>f.worlds.completeGoody(0)).toThrow('scope policy preparation failed');
   const plans=f.plans();expect(f.game.originalScopeState).toMatchObject({active:false,fov:50});expect(f.events.filter(event=>event.kind==='gun-output')).toEqual([]);
   f.game.controlsPreset=live;f.game.keys.clear();f.game.chatOpen=true;failure.mockRestore();f.worlds.completeGoody(0);
   expect(f.plans()).toBe(plans);const poll=f.events.find(event=>event.kind==='gun-output'&&event.output.kind==='scope-poll');expect(poll&&poll.kind==='gun-output'?poll.output:undefined).toMatchObject({sourceScopeEnabled:enabled,typing:false,shiftHeld:true});
   expect(f.game.originalScopeState).toMatchObject(enabled?{active:true,fov:35}:{active:false,fov:50});
   f.after();expect(f.game.advanceCommittedSoloGunScope()).toBe(true);expect(f.game.originalScopeState).toMatchObject(enabled?{active:true,fov:35}:{active:false,fov:50});
  }finally{f.dispose();}
 });
 it.each([{captured:'modern',live:'legacy',enabled:false},{captured:'legacy',live:'modern',enabled:true}])('advances a deferred scope frame with captured $captured policy after preset switches to $live',({captured,live,enabled})=>{
  const f=fixture('woodlands',{weapon:'sniper'});try{
   f.game.controlsPreset=captured;f.game.firing=false;
   f.game.originalScopeState={...createOriginalScope(),active:true,fov:20,zoomonce:0};
   // Commit and deliver outputs without running the subsequent actor stage.
   // There is no Shift poll to create a scope or mask that frame's own policy.
   f.before();expect(f.game.originalScopeState).toMatchObject({active:true,fov:20});
   const frame=f.events.find(event=>event.kind==='gun-output'&&event.output.kind==='scope-frame');expect(frame&&frame.kind==='gun-output'?frame.output:undefined).toMatchObject({sourceScopeEnabled:enabled,shiftHeld:false});
   f.game.controlsPreset=live;f.after();expect(f.game.advanceCommittedSoloGunScope()).toBe(true);
   expect(f.game.originalScopeState).toMatchObject({active:true,fov:enabled?19.25:20});
   const once={...f.game.originalScopeState};f.game.controlsPreset=captured;expect(f.game.advanceCommittedSoloGunScope()).toBe(true);expect(f.game.originalScopeState).toEqual(once);
  }finally{f.dispose();}
 });
 it('applies shotgun source pitch kicks in order while keeping both shot queries on their pre-recoil camera',()=>{
  const f=fixture('woodlands',{weapon:'shotgun'});try{
   const pitch=f.game.pitch,camera=f.game.camera.quaternion.clone();f.cycle();expect(f.captures).toHaveLength(2);expect(f.game.pitch).toBeCloseTo(pitch+7*Math.PI/180,14);expect(f.game.camera.quaternion.equals(camera)).toBe(true);
   const kicks=f.events.flatMap(event=>event.kind==='gun-output'&&event.output.kind==='look-kick'&&event.output.axis==='pitch'?[event.output.degrees]:[]);expect(kicks).toEqual([6,1]);expect(f.game.playOriginalCombatSound.mock.calls.map((call:any[])=>call[0])).toEqual(['spas12wav']);
  }finally{f.dispose();}
 });
 it('continues committed recoil after a throwing audio listener and never replays that sound',()=>{
  const f=fixture('woodlands');try{
   f.game.playOriginalCombatSound.mockImplementationOnce(()=>{throw Error('audio fixture failure');});expect(()=>f.cycle()).toThrow(/committed callback dispatch failed/);expect(f.state.ammo.rifle).toBe(9);expect(f.game.pitch).toBeCloseTo(.1+Math.PI/180,14);
   const event=f.events.find(event=>event.kind==='gun-output'&&event.output.kind==='sound')!;expect(event).toBeDefined();f.game.receiveSoloWorldEvent(event);expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
 it('delivers already committed sound and recoil after terminal health while cancelling scope actor advancement',()=>{
  let f:ReturnType<typeof fixture>;f=fixture('woodlands',{onEvent:event=>{
   if(event.kind==='gun-phase-state'){
    expect(f.bank().freeze().ammo.rifle).toBe(9);
    // Controlled post-commit listener transition, not a native lethal-damage
    // fixture: health termination invalidates future Game actor dispatch while
    // already committed presentation commands still belong to this life.
    f.world.alive=false;f.game.playerAlive=false;
   }
  }});try{
   f.game.originalScopeState={...createOriginalScope(),active:true,fov:20,zoomonce:0};
   const scope=vi.spyOn(f.game,'advanceSourceScope'),committedScope=vi.spyOn(f.game,'advanceCommittedSoloGunScope');f.cycle();
   expect(f.world.alive).toBe(false);expect(f.state.ammo.rifle).toBe(9);expect(f.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('gunfire',undefined,6);
   expect(f.game.pitch).toBeCloseTo(.1+Math.PI/180,14);expect(f.game.yaw).toBeCloseTo(.2+.5*Math.PI/180,14);expect(scope).not.toHaveBeenCalled();expect(committedScope).not.toHaveBeenCalled();expect(f.game.originalScopeState).toMatchObject({active:true,fov:20});
   const event=f.events.find(event=>event.kind==='gun-output'&&event.output.kind==='sound')!;f.game.receiveSoloWorldEvent(event);expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();
  }finally{f.dispose();}
 });
});
