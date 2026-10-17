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
import {createOriginalReceiverGeometryQuery} from '../shared/originalReceiverGeometryBackend';
import {createReceiverLocalHitscanQuery,type ReceiverLocalHitscanSceneCapture} from '../shared/originalReceiverLocalHitscan';
import {ORIGINAL_RECEIVER_SCENE_LAYERS} from '../shared/originalReceiverSceneRay';
import {createOriginalSceneGeometry,type OriginalSceneData} from '../shared/originalSceneGeometry';
import type {OriginalMapRuntime} from '../shared/originalMapRuntime';
import type {ReceiverCurrentEnvironmentCommand} from '../shared/originalReceiverCurrentEnvironment';
import type {ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],zero={x:0,y:0,z:0};
const slots:WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const counts=(n:number)=>Object.fromEntries(slots.map(w=>[w,n])) as Record<WeaponId,number>;
const owned=()=>Object.fromEntries(slots.map(w=>[w,true])) as Record<WeaponId,boolean>;
const pose=():ReceiverModelPose=>({position:{...zero},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}});

// Actual gun helper/private banks/producer/query/coordinator and Game methods.
// One controlled CPU receiver, offworld local models and gsmokes muzzle geometry;
// independent physical floor, skipped solver and UI/presentation mocks. This
// proves ownership consumption, not default factory/native geometry or audio.
function fixture(map:'barrack'|'woodlands'){
 const scale=.02,data:OriginalSceneData={nodes:[{name:'fixture-floor',parent:'World',resource:'fixture-floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'fixture-floor',part:0,positions:[[-100,-100,-100],[100,-100,-100],[0,100,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const geometry=createOriginalSceneGeometry(data,{scale}),runtime:OriginalMapRuntime={map,data,scale,geometry,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const state=new WeaponState(map),events:OriginalSoloEvent[]=[],captures:ReceiverLocalHitscanSceneCapture[]=[];
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,10,0);
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,mode:'solo',archivalWinter:false,phase:'playing',playerAlive:true,elapsed:0,nextSourceReloadPoll:0,originalActorDispatchGeneration:0,arena:{runtime},weaponState:state,keys:new Set<string>(),firing:true,chatOpen:false,controlsPreset:'legacy',camera,velocity:new THREE.Vector3(),scene:new THREE.Scene(),score:0,
  updateHud:vi.fn(),updateOriginalWeaponPresentation:vi.fn(),advanceOriginalMuzzleFlashes:vi.fn(),advanceSourceScope:vi.fn(),openSourceScope:vi.fn(()=>false),syncWeaponPresentation:vi.fn(),flushOriginalReconciliation:vi.fn(),playOriginalCombatSound:vi.fn(),appendChat:vi.fn(),setMessage:vi.fn(),hitscan:vi.fn(),projectiles:[],enemies:[],weaponDrops:[],originalFlashes:[]}) as any;
 let bank:OriginalReceiverLoadoutWorld|undefined,local:OriginalReceiverLocalWeaponWorld|undefined,plans=0;
 const worlds=new OriginalSoloObserverWorlds(runtime,{onEvent:event=>{events.push(event);game.receiveSoloWorldEvent(event);},createReceiverScene:()=>createOriginalSoloCurrentSceneLease({sourceScale:scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:64,maxOutcomes:32,maxModels:64,maxTextChars:65536},controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:64,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},createBackends:c=>{
  const prefix={kind:'callback' as const,sceneGeneration:c.lifeGeneration,callback:0},seed:ReceiverLoadoutCheckpoint={prefix,map,selected:'rifle',owned:owned(),ammo:counts(10),reserve:counts(30),refillTarget:28,counter:{waitgun:map==='barrack'?2:0,poldwaitgun:0},score:0,goldScore:0};
  bank=new OriginalReceiverLoadoutWorld(seed,{maxCommands:64,maxTextChars:65536,weaponModelPresent:owned()});
  local=new OriginalReceiverLocalWeaponWorld({prefix,cameraHandle:'fixture-camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:0,gunPositionSource:{x:3,y:-10,z:2}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as keyof typeof ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,resource,worldMatrix:I,inWorld:false,groupAncestry:['fixture-camera']}))},{sourceScale:scale,maxCommands:64,maxTextChars:65536,bindModels:(_operation,s)=>({models:s.models,loadedRocket:s.loadedRocket})});
  const query=createReceiverLocalHitscanQuery(createOriginalReceiverGeometryQuery({sceneGeneration:c.lifeGeneration,provenance:'declared-controlled-CPU-inventory',budget:{maxModels:64,maxTriangles:64,maxVertices:192},coverageAt:(callback,p,actors)=>({sceneGeneration:c.lifeGeneration,callback,prefix:p,actorRegistry:actors,expectedHandles:captures.at(-1)!.models.map(m=>m.handle),accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]}),resolveModel:m=>({handle:m.handle,layer:m.kind==='local-weapon'?'local-weapon':'transient',inWorld:m.inWorld,geometryProvenance:m.geometryProvenance,groupAncestry:['gsmokes'],positions:[[-1,-1,0],[1,-1,0],[0,1,0]],faces:[[0,1,2]],worldMatrix:I,sidedness:'double'})}));
  return {loadoutWorld:bank,localWeaponWorld:local,localHitscan:{nearestBullet:(capture,origin,direction)=>{captures.push(capture);return query.nearestBullet(capture,origin,direction);}},model:{cloneGI:()=>({pose:pose(),geometryProvenance:'fixture-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'fixture-gun'}),heldGunPose:()=>pose(),sphere:()=>({bspWorld:1,provenance:'declared-resource' as const}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-downward'}})},transient:{clonePlane:()=>({pose:pose(),geometryProvenance:'fixture-plane',inWorld:true}),cloneMuzzle:()=>({pose:pose(),geometryProvenance:'fixture-muzzle',inWorld:true}),pointAt:()=>pose().rotation!,selfRotate:q=>q}};
 },captureLocalWeaponCallback:()=>({cameraWorldMatrix:I,velocityWorld:zero,commands:[]}),captureLoadoutProgram:(c,p,previous,admitted)=>{
  plans++;const receiptCommands=admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));if(!p.callback)return {receiptCommands};if(p.callback.kind!=='callback')throw Error('Expected callback');
  const gunPhase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:p.callback,held:{typing:game.chatOpen,reload:game.keys.has('KeyR'),fire:game.firing||game.keys.has('ControlLeft')||game.keys.has('ControlRight'),digits:slots.map((_w,i)=>game.keys.has(`Digit${i+1}`)) as [boolean,boolean,boolean,boolean,boolean,boolean]},weaponModelPresent:owned()});
  const commands:ReceiverCurrentEnvironmentCommand[]=[{kind:'loadout-capture',checkpoint:gunPhase.checkpoint}];
  for(const intent of gunPhase.intents){
   if(intent.kind==='rocket-remove')commands.push({kind:'weapon-rocket',loadedRocket:false});
   else if(intent.kind==='rocket-parent')commands.push({kind:'weapon-rocket',loadedRocket:true});
   else if(intent.kind==='load-pose')commands.push({kind:'weapon-reload'});
   else if(intent.kind==='recoil-pose')commands.push({kind:'weapon-fire'});
   else if(intent.kind==='sortweapons')commands.push({kind:'weapon-whichgun',weapon:intent.weapon});
   else if(intent.kind==='fire'&&intent.action==='hitscan')for(let i=0;i<intent.rayCoordinates.length;i++)commands.push({kind:'local-hitscan',action:{prefix:p.callback,weapon:intent.weapon as 'rifle'|'pistol',sourceRotation:zero,origin:originalPlayerEye(c.body),bspWorld:1,actorNames:{},effectId:`effect:${p.callback.callback}:${i}`,muzzleId:`muzzle:${p.callback.callback}:${i}`,gunPose:pose()}});
  }
  commands.push({kind:'weapon-finish'});return {receiptCommands,callbackCommands:commands,gunPhase};
 },goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:1,weapon:c.weapon!}:null,snapshotAt:(prefix,s)=>({prefix,missing:[],provenance:'declared-controlled-CPU-inventory',models:(s.localWeapons?.models??[]).map(m=>({handle:m.handle,name:m.handle,resource:m.resource,kind:'local-weapon' as const,group:'gsmokes' as const,inWorld:m.inWorld,worldMatrix:m.worldMatrix,geometryProvenance:'fixture-local',pose:pose()}))})})});
 game.soloWorlds=worlds;const world=worlds.register({id:'player',name:'Fixture',eye:camera.position});world.weapon='rifle';
 const before=vi.fn(()=>{world.weapon=state.unarmed?world.weapon:state.current;worlds.physics(game.elapsed,{skipIds:new Set(['player'])});worlds.goody('player');worlds.completeGoody(game.elapsed);});
 const after=vi.fn(()=>worlds.actors(game.elapsed));
 return {game,state,world,worlds,events,captures,before,after,plans:()=>plans,bank:()=>bank!,cycle:()=>game.updateSourceWeaponInput(before,after),dispose:()=>worlds.clear()};
}

describe('Game consumes the private gun callback once (declared CPU scene)',()=>{
 it.each(['barrack','woodlands'] as const)('%s: first beforeGun adoption suppresses the second evaluator and retains old-slot gate metadata',map=>{
  const f=fixture(map);try{
   f.game.keys.add('Digit1');const fire=vi.spyOn(f.game,'tryFire'),reload=vi.spyOn(f.game,'reload'),choose=vi.spyOn(f.game,'switchWeapon'),step=vi.spyOn(f.state,'stepSourceCounter'),update=vi.spyOn(f.state,'update');
   expect(f.world.loadout).toBeUndefined();f.cycle();
   expect(f.plans()).toBe(1);expect(f.captures).toHaveLength(1);expect(f.state.ammo.rifle).toBe(9);expect(f.state.ammo.pistol).toBe(10);expect(f.state.current).toBe('pistol');
   expect(f.state.originalGunPhaseCheckpoint?.phase).toMatchObject({weapon:'rifle',bullets:10,ready:true});expect(f.state.originalCounterState).toEqual({...f.world.loadout!.counter,ready:false});expect(f.state.canFire(100)).toBe(false);
   for(const mock of [fire,reload,choose,step,update,f.game.hitscan,f.game.openSourceScope])expect(mock).not.toHaveBeenCalled();
   expect(f.before).toHaveBeenCalledOnce();expect(f.after).toHaveBeenCalledOnce();expect(f.game.updateOriginalWeaponPresentation).toHaveBeenCalledOnce();expect(f.game.advanceSourceScope).toHaveBeenCalledExactlyOnceWith(false);
  }finally{f.dispose();}
 });
 it('held R transfers source counts once per captured callback without replaying Game reload',()=>{
  const f=fixture('woodlands');try{
   f.game.keys.add('KeyR');f.game.firing=false;const reload=vi.spyOn(f.game,'reload'),step=vi.spyOn(f.state,'stepSourceCounter');f.cycle();
   expect(f.state.ammo.rifle).toBe(28);expect(f.state.reserve.rifle).toBe(12);expect(f.state.originalCounterState).toEqual({...f.bank().freeze().counter,ready:false});expect(f.captures).toEqual([]);
   f.game.elapsed=1/30;f.cycle();expect(f.plans()).toBe(2);expect(f.state.ammo.rifle).toBe(28);expect(f.state.reserve.rifle).toBe(12);expect(reload).not.toHaveBeenCalled();expect(step).not.toHaveBeenCalled();expect(f.after).toHaveBeenCalledTimes(2);
  }finally{f.dispose();}
 });
 it('direct Game fire/reload/switch calls cannot bypass the committed owner',()=>{
  const f=fixture('woodlands');try{
   f.cycle();const before=f.state.originalLoadoutCheckpoint,counter=f.state.originalCounterState,ammo={...f.state.ammo};
   f.game.tryFire();expect(f.game.reload()).toBe(false);f.game.switchWeapon('pistol');
   expect(f.game.flushOriginalReconciliation).not.toHaveBeenCalled();expect(f.game.hitscan).not.toHaveBeenCalled();expect(f.state.originalLoadoutCheckpoint).toBe(before);expect(f.state.originalCounterState).toEqual(counter);expect(f.state.ammo).toEqual(ammo);expect(f.state.current).toBe('rifle');expect(f.captures).toHaveLength(1);
  }finally{f.dispose();}
 });
 it('accepts only the exact current owned phase event and clears metadata on the next loadout',()=>{
  const f=fixture('woodlands');try{
   f.cycle();const actual=f.state.originalGunPhaseCheckpoint,event=f.events.find(e=>e.kind==='gun-phase-state')!;
   if(event.kind!=='gun-phase-state')throw Error('Missing phase');
   f.game.receiveSoloWorldEvent({...event,checkpoint:{...event.checkpoint,phase:null}});expect(f.state.originalGunPhaseCheckpoint).toBe(actual);
   f.game.receiveSoloWorldEvent({...event,lifeGeneration:event.lifeGeneration+1});expect(f.state.originalGunPhaseCheckpoint).toBe(actual);
   f.state.adoptOriginalLoadout(f.world.loadout!,f.game.elapsed);expect(f.state.originalGunPhaseCheckpoint).toBeUndefined();
   f.game.receiveSoloWorldEvent(event);expect(f.state.originalGunPhaseCheckpoint).toEqual(f.world.gunPhase);
  }finally{f.dispose();}
 });
 it('preserves terminal afterGun cancellation without advancing scope or another callback',()=>{
  const f=fixture('woodlands');try{
   f.game.elapsed=2/30;const after=vi.fn(()=>{f.after();f.game.phase='lost';f.game.playerAlive=false;});
   f.game.updateSourceWeaponInput(f.before,after);expect(f.plans()).toBe(1);expect(after).toHaveBeenCalledOnce();expect(f.game.advanceSourceScope).not.toHaveBeenCalled();expect(f.captures).toHaveLength(1);
  }finally{f.dispose();}
 });
});
