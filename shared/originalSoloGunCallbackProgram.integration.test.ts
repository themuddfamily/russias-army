import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloFreshLoadoutWorld} from './originalSoloFreshLoadout';
import {captureOriginalSoloGunCallbackProgram} from './originalSoloGunCallbackProgram';
import {createOriginalSoloCurrentSceneLease} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from './originalSoloObserverWorld';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponBindingOperation,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {OriginalReceiverProjectileWorld} from './originalReceiverProjectileWorld';
import {OriginalReceiverWeaponReportWorld} from './originalReceiverWeaponReportWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {createOriginalSceneGeometry,type OriginalSceneData} from './originalSceneGeometry';
import {createOriginalReceiverGeometryQuery} from './originalReceiverGeometryBackend';
import {createReceiverLocalHitscanQuery,type ReceiverLocalHitscanSceneCapture} from './originalReceiverLocalHitscan';
import {ORIGINAL_RECEIVER_SCENE_LAYERS} from './originalReceiverSceneRay';
import {originalPlayerEye} from './originalPlayerPhysics';
import {ORIGINAL_WEAPON_WAIT} from './originalWeaponCounter';
import type {OriginalMapRuntime} from './originalMapRuntime';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import type {ReceiverModelPose} from './originalReceiverModelWorld';
import type {OriginalSoloLaunchReservation,OriginalSoloReservedLaunchAdmission} from './originalSoloLaunchBatch';
import type {WeaponId} from './protocol';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],zero={x:0,y:0,z:0};
const slots:WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const counts=(n:number)=>Object.fromEntries(slots.map(w=>[w,n])) as Record<WeaponId,number>;
const owned=()=>Object.fromEntries(slots.map(w=>[w,true])) as Record<WeaponId,boolean>;
const pose=():ReceiverModelPose=>({position:zero,yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}});

// Real translator, CURRENT, controller, private banks, coordinator reservation
// and CPU triangle query. Explicit offworld local models and identity WORLD
// matrices qualify the source basis. Physics is skipped, downward coverage is
// declared empty, and no native asset, Havok, audio clock or default factory
// equivalence is asserted by these controlled operation-order cases.
function projectileBirth(reservation:OriginalSoloLaunchReservation):Extract<ReceiverCurrentEnvironmentCommand,{kind:'projectile-birth'}>{
 const {launch,prototype}=reservation,matrix=[...I];matrix[12]=prototype.position.x;matrix[13]=prototype.position.y;matrix[14]=prototype.position.z;
 return {kind:'projectile-birth',birth:{launchId:launch.id,weapon:launch.weapon,
  cloneFresh:name=>({handle:name!,resource:launch.weapon==='launcher'?'rg6grenade':'rpgrocket',materialHandle:'declared-grenade',inWorld:false,worldMatrix:I,groupAncestry:[]}),
  resetModel:model=>({...model,materialHandle:launch.weapon==='rpg'?'declared-rocket':model.materialHandle,inWorld:true,worldMatrix:matrix,groupAncestry:['declared-projectiles']})}};
}

function fixture(config:{fresh?:boolean;map?:'woodlands'|'barrack';weapon?:WeaponId;digit?:number;reload?:boolean;failAfterQueriesOnce?:boolean;onEvent?:(event:OriginalSoloEvent)=>void}={}){
 const map=config.map??'woodlands',weapon=config.fresh?'launcher':config.weapon??'shotgun',scale=.02;
 const data:OriginalSceneData={nodes:[{name:'floor',parent:'World',resource:'floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'floor',part:0,positions:[[-100,-100,-100],[100,-100,-100],[0,100,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const geometry=createOriginalSceneGeometry(data,{scale}),runtime:OriginalMapRuntime={map,data,scale,geometry,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const events:OriginalSoloEvent[]=[],queryStates:ReceiverLoadoutCheckpoint[]=[],hookStates:ReceiverLoadoutCheckpoint[]=[],binds:ReceiverLocalWeaponBindingOperation[]=[],bindStates:ReceiverLocalWeaponWorldCheckpoint[]=[],captures:ReceiverLocalHitscanSceneCapture[]=[],admissions:OriginalSoloReservedLaunchAdmission[]=[];
 let bank:OriginalReceiverLoadoutWorld,local:OriginalReceiverLocalWeaponWorld,projectiles:OriginalReceiverProjectileWorld,reports:OriginalReceiverWeaponReportWorld;
 let lastSnapshot:ReceiverLoadoutCheckpoint|undefined,plans=0,cameraReads=0,hitCaptures=0,launchCaptures=0,program:ReturnType<typeof captureOriginalSoloGunCallbackProgram>|undefined;
 const worlds=new OriginalSoloObserverWorlds(runtime,{onEvent:e=>{events.push(e);config.onEvent?.(e);},createReceiverScene:()=>createOriginalSoloCurrentSceneLease({
  sourceScale:scale,maxCapturedBlasts:16,maxCapturedProjectiles:16,environment:{maxCommands:256,maxOutcomes:128,maxModels:128,maxTextChars:65536},controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:64,maxActors:64,maxShaders:64},maxEffects:256},
  createBackends:c=>{
   const prefix={kind:'callback' as const,sceneGeneration:c.lifeGeneration,callback:0};
   bank=config.fresh?createOriginalSoloFreshLoadoutWorld({map,sceneGeneration:c.lifeGeneration,score:0,goldScore:0,maxCommands:256,maxTextChars:65536,weaponModelPresent:owned()}):new OriginalReceiverLoadoutWorld({prefix,map,selected:weapon,owned:owned(),ammo:counts(2),reserve:counts(4),refillTarget:6,counter:{waitgun:map==='barrack'?ORIGINAL_WEAPON_WAIT[weapon]:0,poldwaitgun:0},score:0,goldScore:0},{maxCommands:256,maxTextChars:65536,weaponModelPresent:owned()});
   if(config.failAfterQueriesOnce){
    const originalBegin=bank.begin.bind(bank);
    vi.spyOn(bank,'begin').mockImplementationOnce(()=>{
     const stage=originalBegin(),prepare=stage.prepareCommit;
     return {...stage,prepareCommit:()=>{prepare();throw Error('SPAS preparation failed');}};
    });
   }
   local=new OriginalReceiverLocalWeaponWorld({prefix,cameraHandle:'fixture-camera',cameraWorldMatrix:I,selectedWeapon:weapon,loadedRocket:weapon==='rpg',motion:{weapon,ticker:0,gunPositionSource:zero},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as keyof typeof ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,resource,worldMatrix:I,inWorld:false,groupAncestry:['fixture-camera']}))},{sourceScale:scale,maxCommands:256,maxTextChars:65536,bindModels:(op,state)=>{binds.push(op);bindStates.push(state);return {models:state.models,loadedRocket:op.kind==='rocket'?op.loadedRocket:state.loadedRocket};}});
   projectiles=new OriginalReceiverProjectileWorld({prefix,template:{handle:'grenade',resource:'rg6grenade',materialHandle:'declared-grenade',inWorld:false,worldMatrix:I,groupAncestry:[]},catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]}},{maxModels:64,maxActors:32,maxCommands:256,maxTextChars:65536,rocketMaterialHandle:'declared-rocket'});
   reports=new OriginalReceiverWeaponReportWorld({prefix,shots:2,hurts:[]},{maxNames:128,maxTextChars:65536,maxCommands:256});
   const query=createReceiverLocalHitscanQuery(createOriginalReceiverGeometryQuery({sceneGeneration:c.lifeGeneration,provenance:'declared-controlled-CPU-inventory',budget:{maxModels:128,maxTriangles:128,maxVertices:384},coverageAt:(callback,p,actors)=>({sceneGeneration:c.lifeGeneration,callback,prefix:p,actorRegistry:actors,expectedHandles:captures.at(-1)!.models.map(m=>m.handle),accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]}),resolveModel:m=>({handle:m.handle,layer:m.kind==='local-weapon'?'local-weapon':'transient',inWorld:m.inWorld,geometryProvenance:m.geometryProvenance,groupAncestry:['gsmokes'],positions:[[-1,-1,0],[1,-1,0],[0,1,0]],faces:[[0,1,2]],worldMatrix:I,sidedness:'double'})}));
   return {loadoutWorld:bank,localWeaponWorld:local,projectileWorld:projectiles,weaponReportWorld:reports,
    localHitscan:{nearestBullet:(capture,origin,direction)=>{captures.push(capture);queryStates.push(lastSnapshot!);expect(bank.freeze().ammo[weapon]).toBe(2);expect(events.filter(e=>e.kind==='gun-output')).toEqual([]);return query.nearestBullet(capture,origin,direction);}},
    model:{cloneGI:()=>({pose:pose(),geometryProvenance:'fixture-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'fixture-gun'}),heldGunPose:()=>pose(),sphere:()=>({bspWorld:1,provenance:'declared-resource' as const}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-downward'}})},
    transient:{clonePlane:()=>({pose:pose(),geometryProvenance:'fixture-plane',inWorld:true}),cloneMuzzle:()=>({pose:pose(),geometryProvenance:'fixture-muzzle',inWorld:true}),pointAt:()=>pose().rotation!,selfRotate:q=>q}};
  },captureLocalWeaponCallback:()=>{cameraReads++;return {cameraWorldMatrix:I,velocityWorld:zero,commands:[]};},
  captureLoadoutProgram:(c,p,previous,bangs)=>{
   const receiptCommands=bangs.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));if(!p.callback)return {receiptCommands};plans++;
   if(p.callback.kind!=='callback')throw Error('Expected callback');
   const digits=slots.map((_w,i)=>config.digit===i+1) as [boolean,boolean,boolean,boolean,boolean,boolean];
   program=captureOriginalSoloGunCallbackProgram(previous.loadout,{prefix:p.callback,held:{typing:false,reload:config.reload??false,fire:p.callback.callback===1,digits},weaponModelPresent:owned()},{
    shiftHeld:false,random3:p.callback.callback===1?[3]:[],sendReport:true,maxCommands:256,maxModels:128,maxTextChars:65536,
    captureHitscan:request=>{hitCaptures++;hookStates.push(request.checkpoint);return {prefix:p.callback as Extract<typeof p.callback,{kind:'callback'}>,weapon:request.fire.weapon as 'shotgun',sourceRotation:zero,origin:originalPlayerEye(c.body),bspWorld:1,actorNames:{},effectId:`effect:${request.checkpoint.prefix.callback}:${request.rayIndex}`,muzzleId:`muzzle:${request.checkpoint.prefix.callback}:${request.rayIndex}`,gunPose:pose()};},
    captureLaunch:request=>{launchCaptures++;hookStates.push(request.checkpoint);const admission=c.reserveLaunch!({weapon:request.fire.weapon as 'rpg'|'launcher',eye:originalPlayerEye(c.body),direction:{x:1,y:0,z:0},sourceRotation:{x:0,y:0,z:-90}},0);admissions.push(admission);return {admission,...(admission.ok?{birth:projectileBirth(admission.reservation).birth}:{})};},
   });return {receiptCommands,...program};
  },captureIncomingLaunches:(_c,_p,incoming)=>incoming.map(a=>projectileBirth(a.reservation)),
  goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:1,weapon:c.weapon!}:null,
  snapshotAt:(prefix,state)=>{lastSnapshot=state.loadout;return {prefix,missing:[],provenance:'declared-controlled-CPU-inventory',models:(state.localWeapons?.models??[]).map(m=>({handle:m.handle,name:m.handle,resource:m.resource,kind:'local-weapon' as const,group:'gsmokes' as const,inWorld:m.inWorld,worldMatrix:m.worldMatrix,geometryProvenance:'fixture-local',pose:pose()}))};},
 })});
 const world=worlds.register({id:'player',name:'Fixture',eye:{x:0,y:20,z:0}});world.weapon=weapon;
 const prepare=(time=0)=>{worlds.physics(time,{skipIds:new Set(['player'])});worlds.goody('player');};
 return {worlds,world,events,queryStates,hookStates,binds,bindStates,captures,admissions,prepare,bank:()=>bank!,local:()=>local!,projectiles:()=>projectiles!,reports:()=>reports!,program:()=>program!,reads:()=>({plans,cameraReads,hitCaptures,launchCaptures})};
}

describe('ordered gun program through actual private CURRENT and coordinator (qualified CPU adapters)',()=>{
 it.each(['woodlands','barrack'] as const)('%s fresh source loadout publishes its first grenade and decremented chamber jointly',map=>{
  const f=fixture({map,fresh:true});try{f.prepare();f.worlds.completeGoody(0);
   expect(f.bank().freeze()).toMatchObject({selected:'launcher',ammo:{launcher:5,sniper:30},reserve:{launcher:18},refillTarget:6,counter:{waitgun:map==='woodlands'?10:0,poldwaitgun:0},score:0,goldScore:0});
   expect(f.admissions).toHaveLength(1);expect(f.admissions[0].ok).toBe(true);expect(f.worlds.launches.size).toBe(1);expect(f.world.projectiles.size).toBe(1);expect(f.projectiles().freeze().actors).toHaveLength(1);expect(f.local().freeze().selectedWeapon).toBe('launcher');
   expect(f.events.filter(e=>e.kind==='gun-output'&&e.output.kind==='sound')).toHaveLength(0);
   expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(1);
  }finally{f.worlds.clear();}
 });
 it.each(['woodlands','barrack'] as const)('%s keeps both SPAS queries on operation-time counts before kicks and final digit selection',map=>{
  const f=fixture({map,digit:1});try{f.prepare();f.worlds.completeGoody(0);
   expect(f.hookStates).toHaveLength(2);expect(f.queryStates).toHaveLength(2);
   for(const state of [...f.hookStates,...f.queryStates]){expect(state.selected).toBe('shotgun');expect(state.ammo.shotgun).toBe(2);expect(state.reserve.shotgun).toBe(4);}
   expect(f.bank().freeze()).toMatchObject({selected:'pistol',ammo:{shotgun:1},refillTarget:8});expect(f.local().freeze().selectedWeapon).toBe('pistol');
   const commands=f.program().callbackCommands,rayIndices=commands.flatMap((c,i)=>c.kind==='local-hitscan'?[i]:[]),kick=commands.findIndex(c=>c.kind==='gun-output'&&c.output.kind==='look-kick');
   expect(rayIndices).toHaveLength(2);expect(rayIndices[1]).toBeLessThan(kick);expect(commands[0].kind).toBe('weapon-report-send');
   const terminal=commands.filter(c=>c.kind==='loadout-capture').at(-1);expect(terminal&&terminal.kind==='loadout-capture'?terminal.checkpoint:undefined).toBe(f.program().gunPhase.checkpoint);
   const choose=f.binds.findIndex(op=>op.kind==='whichgun'&&op.weapon==='pistol');expect(choose).toBeGreaterThan(-1);expect(f.bindStates[choose]).toMatchObject({selectedWeapon:'shotgun',motion:{gunPositionSource:{x:3,y:-10,z:5}}});
   expect(f.events.filter(e=>e.kind==='weapon-report').map(e=>e.kind==='weapon-report'?e.report:undefined)).toEqual([{shots:2}]);
   expect(f.events.flatMap(e=>e.kind==='gun-output'&&e.output.kind==='look-kick'&&e.output.axis==='pitch'?[e.output.degrees]:[])).toEqual([6,1]);
  }finally{f.worlds.clear();}
 });
 it('captures RPG constructor after temporary refill then commits saved ammunition overwrite with its private model and physical launch',()=>{
  const f=fixture({weapon:'rpg'});try{f.prepare();f.worlds.completeGoody(0);
   expect(f.hookStates).toHaveLength(1);expect(f.hookStates[0]).toMatchObject({selected:'rpg',ammo:{rpg:6},reserve:{rpg:0},refillTarget:1});
   expect(f.bank().freeze()).toMatchObject({ammo:{rpg:1},reserve:{rpg:0}});expect(f.admissions[0].ok).toBe(true);expect(f.worlds.launches.size).toBe(1);expect(f.world.projectiles.size).toBe(1);expect(f.projectiles().freeze().actors).toHaveLength(1);
   const commands=f.program().callbackCommands,birth=commands.findIndex(c=>c.kind==='projectile-birth');
   const before=commands.slice(0,birth).filter(c=>c.kind==='loadout-capture').at(-1),after=commands.slice(birth+1).filter(c=>c.kind==='loadout-capture').at(-1);
   expect(before&&before.kind==='loadout-capture'?before.checkpoint.ammo.rpg:undefined).toBe(6);expect(after&&after.kind==='loadout-capture'?after.checkpoint.ammo.rpg:undefined).toBe(1);
  }finally{f.worlds.clear();}
 });
 it('reuses captured input, ray actions and constructors after failed preparation and publishes no audio or bank writes before commit',()=>{
  const f=fixture({weapon:'rpg'});try{f.prepare();const failure=vi.spyOn(f.world.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('ordered program preparation failed');});
   expect(()=>f.worlds.completeGoody(0)).toThrow('ordered program preparation failed');const reads=f.reads();
   expect(f.bank().freeze().ammo.rpg).toBe(2);expect(f.projectiles().freeze().actors).toEqual([]);expect(f.worlds.launches.size).toBe(0);expect(f.events.filter(e=>e.kind==='gun-output'||e.kind==='spawned'||e.kind==='weapon-report')).toEqual([]);
   failure.mockRestore();f.worlds.completeGoody(0);expect(f.reads()).toEqual(reads);expect(f.worlds.launches.size).toBe(1);expect(f.bank().freeze().ammo.rpg).toBe(1);expect(f.events.filter(e=>e.kind==='gun-output'&&e.output.kind==='sound')).toHaveLength(1);
  }finally{f.worlds.clear();}
 });
 it('captures SPAS ray inputs once across rollback while recomputing both private queries in each fresh transaction',()=>{
  const f=fixture({digit:1,failAfterQueriesOnce:true});try{f.prepare();
   expect(()=>f.worlds.completeGoody(0)).toThrow('SPAS preparation failed');expect(f.hookStates).toHaveLength(2);expect(f.queryStates).toHaveLength(2);const reads=f.reads();expect(f.bank().freeze().ammo.shotgun).toBe(2);expect(f.local().freeze().selectedWeapon).toBe('shotgun');expect(f.events.filter(e=>e.kind==='gun-output')).toEqual([]);
   f.worlds.completeGoody(0);expect(f.reads()).toEqual(reads);expect(f.queryStates).toHaveLength(4);for(const state of f.queryStates)expect(state).toMatchObject({selected:'shotgun',ammo:{shotgun:2}});expect(f.bank().freeze()).toMatchObject({selected:'pistol',ammo:{shotgun:1}});
  }finally{f.worlds.clear();}
 });
 it('preserves refill and saved-ammo overwrite when actual coordinator projectile cap rejects the constructor',()=>{
  const f=fixture({weapon:'rpg'});try{for(let i=0;i<8;i++)expect(f.worlds.launch({ownerId:'player',weapon:'rpg',eye:originalPlayerEye(f.world.body),direction:{x:1,y:0,z:0}},0).ok).toBe(true);
   const spawned=f.events.filter(e=>e.kind==='spawned').length;f.prepare();f.worlds.completeGoody(0);
   expect(f.admissions).toEqual([{ok:false,reason:'projectile-cap'}]);expect(f.hookStates[0].ammo.rpg).toBe(6);expect(f.bank().freeze()).toMatchObject({ammo:{rpg:1},reserve:{rpg:0}});expect(f.projectiles().freeze().actors).toEqual([]);expect(f.worlds.launches.size).toBe(8);expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(spawned);
  }finally{f.worlds.clear();}
 });
 it('publishes every owned bank before listener delivery and never replays output after a listener fails',()=>{
  let f:ReturnType<typeof fixture>,failed=false;f=fixture({weapon:'rpg',onEvent:e=>{if(e.kind==='gun-output'&&e.output.kind==='sound'&&!failed){failed=true;expect(f.bank().freeze().ammo.rpg).toBe(1);expect(f.projectiles().freeze().actors).toHaveLength(1);expect(f.worlds.launches.size).toBe(1);throw Error('ordered output listener failed');}}});
  try{f.prepare();expect(()=>f.worlds.completeGoody(0)).toThrow(/committed callback dispatch failed/);expect(f.events.filter(e=>e.kind==='gun-output'&&e.output.kind==='sound')).toHaveLength(1);f.worlds.actors(0);f.prepare(1/30);f.worlds.completeGoody(1/30);expect(f.events.filter(e=>e.kind==='gun-output'&&e.output.kind==='sound')).toHaveLength(1);expect(f.reads().launchCaptures).toBe(1);}
  finally{f.worlds.clear();}
 });
});
