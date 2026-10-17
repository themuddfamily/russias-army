import {describe,it,expect} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController} from './originalReceiverSceneController';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {createOriginalReceiverGeometryQuery} from './originalReceiverGeometryBackend';
import {createReceiverLocalHitscanQuery,copyReceiverLocalHitscanOutcomes,type ReceiverLocalHitscanOutcome,type ReceiverLocalHitscanAction,type ReceiverLocalHitscanSceneCapture} from './originalReceiverLocalHitscan';
import {ORIGINAL_RECEIVER_SCENE_LAYERS,type OriginalReceiverRayModel} from './originalReceiverSceneRay';
import type {ReceiverModelEntry,ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {createOriginalSceneGeometry,type OriginalSceneData} from './originalSceneGeometry';
import type {OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {WeaponId} from './protocol';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const prefix={kind:'callback' as const,sceneGeneration:7,callback:1};
const zero={x:0,y:0,z:0};
const pose=(z=0):ReceiverModelPose=>({position:{x:0,y:0,z},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}});
const slots:WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const all=()=>Object.fromEntries(slots.map(w=>[w,true])) as Record<WeaponId,boolean>;
const counts=(n:number)=>Object.fromEntries(slots.map(w=>[w,n])) as Record<WeaponId,number>;
// Every layer is explicitly accounted in this synthetic CPU fixture, including
// empty classes. This never attests a complete native/production inventory.
function fixture(config:{actor?:boolean;corpse?:boolean;wall?:boolean;weapon?:'rifle'|'shotgun';actorName?:string|0}={}){
 const scale=.02,data:OriginalSceneData={nodes:[{name:'fixture-runtime-floor',parent:'World',resource:'fixture-runtime-floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'fixture-runtime-floor',part:0,positions:[[-10,-10,-100],[10,-10,-100],[0,10,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]},geometry=createOriginalSceneGeometry(data,{scale});
 const runtime:OriginalMapRuntime={map:'woodlands',data,scale,geometry,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const barrels=new OriginalBarrelWorld(runtime),target={health:createOriginalPlayerHealth(),alive:true};
 const seedPrefix={kind:'callback' as const,sceneGeneration:7,callback:0},weapon=config.weapon??'rifle';
 const seed:ReceiverLoadoutCheckpoint={prefix:seedPrefix,map:'woodlands',selected:weapon,owned:all(),ammo:counts(10),reserve:counts(0),refillTarget:weapon==='rifle'?28:6,counter:{waitgun:0,poldwaitgun:0},score:0,goldScore:0};
 const loadout=new OriginalReceiverLoadoutWorld(seed,{maxCommands:64,maxTextChars:65536,weaponModelPresent:all()});
 const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix:seedPrefix,cameraHandle:'camera:test',cameraWorldMatrix:[...I],selectedWeapon:weapon,loadedRocket:false,motion:{weapon,ticker:0,gunPositionSource:zero},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:false,worldMatrix:[...I],groupAncestry:['declared-local']}))};
 const local=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:scale,maxCommands:64,maxTextChars:65536,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
 const flags={missing:false,queryFailsAt:0},captures:ReceiverLocalHitscanSceneCapture[]=[];
 const wall:ReceiverModelEntry={handle:'fixture-wall',name:'fixture-wall',resource:'fixture-wall',kind:'fixed',group:'scene',inWorld:true,geometryProvenance:'synthetic-wall',pose:pose(-5)};
 const geometryQuery=createOriginalReceiverGeometryQuery({sceneGeneration:7,provenance:'synthetic-complete-layer-fixture',budget:{maxModels:128,maxTriangles:128,maxVertices:384},coverageAt:(callback,p,actors)=>({sceneGeneration:7,callback,prefix:p,actorRegistry:actors,expectedHandles:[...(actors?.models??[]).map(m=>m.handle),...(config.wall?[wall.handle]:[]),...local.freeze().models.map(m=>m.handle),...captures.at(-1)!.models.filter(m=>m.kind==='transient').map(m=>m.handle)],accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]}),resolveModel:(model,_callback,_p,actors):OriginalReceiverRayModel=>({handle:model.handle,layer:model.kind==='gi'?(actors!.actors.some(a=>a.gi===model.handle)?'live-gi':'corpse'):model.kind==='gun'?'held-gun':model.kind==='local-weapon'?'local-weapon':model.kind==='transient'?'transient':'fixed',inWorld:model.inWorld,geometryProvenance:model.geometryProvenance,groupAncestry:model.group==='gsmokes'?['gsmokes']:[],positions:[[-10,-10,0],[10,-10,0],[0,10,0]],faces:[[0,1,2]],worldMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,model.pose.position.x,model.pose.position.y,model.pose.position.z,1],sidedness:'double'})});
 const validatedQuery=createReceiverLocalHitscanQuery(geometryQuery);
 const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:7,sourceScale:scale,target,barrels,localWeaponWorld:local,loadoutWorld:loadout,localHitscan:{nearestBullet:(capture,origin,direction)=>{captures.push(capture);if(flags.queryFailsAt===captures.length)throw Error('injected bullet query failure');return validatedQuery.nearestBullet(capture,origin,direction);}},maxCommands:64,maxOutcomes:16,maxModels:128,maxTextChars:65536,snapshotAt:(p,state)=>({prefix:p,missing:flags.missing?['unresolved-sky']:[],provenance:'synthetic-fixture-complete',models:[...(config.wall?[wall]:[]),...(state.localWeapons?.models??[]).map(m=>({handle:m.handle,name:m.handle,resource:m.resource,kind:'local-weapon' as const,group:'gsmokes' as const,inWorld:m.inWorld,geometryProvenance:'synthetic-local',worldMatrix:m.worldMatrix,pose:pose()}))]})});
 const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(-5),geometryProvenance:'synthetic-GI'}),cloneGun:()=>({pose:pose(-5),geometryProvenance:'synthetic-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'synthetic-empty-downward'}})};
 const births:string[]=[];
 const controller=new OriginalReceiverSceneController(backend,{clonePlane:()=>{births.push('plane');return {pose:pose(),geometryProvenance:'synthetic-plane',inWorld:true};},cloneMuzzle:()=>{births.push('muzzle');return {pose:pose(),geometryProvenance:'synthetic-muzzle',inWorld:true};},pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},env,{model:{sceneGeneration:7,sourceScale:scale,eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:16,maxShaders:32},maxEffects:32});
 const goody={bspWorld:1,modelPosition:{x:0,y:0,z:0},eyePosition:{x:0,y:1,z:0},weapon:'rifle' as const};
 if(config.actor||config.corpse){env.arm({physicalCallback:0,goody,frames:[{prefix:{kind:'receipt',sceneGeneration:7,callback:0,tick:0},commands:[]}]});const initial=controller.begin();initial.applyExternalReceipt(0,0);initial.birth({actorId:'victim',targetFeet:{x:0,y:0,z:-5},targetYaw:0,callback:0});initial.beforeCallback('victim',{position:{x:0,y:0,z:-5},yaw:0,motionTime:0,weapon:'rifle'});initial.afterCallback('victim',{position:{x:0,y:0,z:-5},yaw:0,motionTime:0,weapon:'rifle'});if(config.corpse)initial.detach('victim',{position:{x:0,y:0,z:-5},yaw:0,motionTime:0,weapon:'rifle'},0);initial.commit();env.drainOutcomes();env.drainLoadoutIntents();env.drainLocalHitscanOutcomes();}
 const action=(n=1):ReceiverLocalHitscanAction=>({prefix,weapon,origin:{x:0,y:1,z:0},sourceRotation:zero,bspWorld:1,actorNames:config.actor&&!config.corpse?{victim:config.actorName??'Victim'}:{},effectId:`bullet-output:${n}`,muzzleId:`bullet-muzzle:${n}`,gunPose:pose()});
 const commands=(n=1):ReceiverCurrentEnvironmentCommand[]=>[{kind:'loadout-capture',checkpoint:{...loadout.freeze(),prefix,ammo:{...loadout.freeze().ammo,[weapon]:9}}},...Array.from({length:n},(_,i)=>({kind:'local-hitscan' as const,action:action(i+1)})),{kind:'weapon-finish'}];
 const arm=(cmds=commands())=>env.arm({physicalCallback:1,goody,frames:[{prefix,commands:cmds,localWeapon:{cameraWorldMatrix:I,velocityWorld:zero}}]});
 const freeze=()=>({target:structuredClone(target),loadout:loadout.freeze(),local:local.freeze(),models:controller.freezeModels(),fx:controller.debugState().fx,version:controller.freezePublicationVersion()});
 return {env,controller,loadout,local,target,flags,captures,births,arm,commands,action,freeze};
}

describe('ordered local bullettest in real scene transaction (synthetic complete geometry)',()=>{
 it('records a complete no-hit with muzzle only, no report or remote health mutation',()=>{
  const f=fixture();f.arm();const tx=f.controller.begin();tx.advanceExternalCallback(1);tx.commit();
  expect(f.env.drainLocalHitscanOutcomes()).toMatchObject([{positiveShot:0,hit:null}]);expect(f.births).toEqual(['muzzle']);expect(f.target.health.canonical).toBe(100);
 });
 it('classifies an exact registered GI hit and stages blood before muzzle and the six-point report',()=>{
  const f=fixture({actor:true});f.arm();const before=f.freeze(),tx=f.controller.begin();tx.advanceExternalCallback(1);expect(f.freeze()).toEqual(before);tx.commit();
  const [outcome]=f.env.drainLocalHitscanOutcomes();expect(outcome).toMatchObject({positiveShot:1,weapon:'rifle',hurt:{actorId:'victim',name:'Victim',amount:6,sourcePositionWorld:{x:0,y:1,z:-5}},hit:{layer:'live-gi'}});expect(f.births).toEqual(['plane','muzzle']);expect(f.target.health.canonical).toBe(100);expect(f.controller.debugState().fx.actors.map(a=>a.kind)).toEqual(['blood','muzzle']);
 });
 it('queries two coincident SPAS bullets sequentially, with the first output/muzzle present in the second inventory',()=>{
  const f=fixture({actor:true,weapon:'shotgun'});f.arm(f.commands(2));const tx=f.controller.begin();tx.advanceExternalCallback(1);tx.commit();
  const outcomes=f.env.drainLocalHitscanOutcomes();expect(outcomes.map(o=>o.hurt?.amount)).toEqual([18,18]);expect(outcomes[0].hit).toEqual(outcomes[1].hit);expect(f.births).toEqual(['plane','muzzle','plane','muzzle']);expect(f.captures[0].models.filter(m=>m.kind==='transient')).toHaveLength(0);expect(f.captures[1].models.filter(m=>m.kind==='transient')).toHaveLength(2);
 });
 it.each([{wall:true},{corpse:true},{actor:true,actorName:0 as const}])('treats a wall/corpse/zero-name GI as miss and never fabricates blood',config=>{
  const f=fixture(config);f.arm();const tx=f.controller.begin();tx.advanceExternalCallback(1);tx.commit();const [outcome]=f.env.drainLocalHitscanOutcomes();expect(outcome.positiveShot).toBe(1);expect(outcome.hurt).toBeUndefined();expect(f.controller.debugState().fx.actors.map(a=>a.kind)).toEqual(['miss','muzzle']);
 });
 it('uses action shotgun context for miss texture despite old transmitted rifle context',()=>{
  const f=fixture({wall:true,weapon:'shotgun'});f.arm();const tx=f.controller.begin();tx.advanceExternalCallback(1);tx.commit();expect(f.controller.freezeShaders().some(s=>s.texture==='decalspas')).toBe(true);
 });
 it('rejects incomplete scene coverage before the ray and rolls back counts, models and effects',()=>{
  const f=fixture({actor:true});f.arm();const before=f.freeze();f.flags.missing=true;const tx=f.controller.begin();expect(()=>tx.advanceExternalCallback(1)).toThrow(/Incomplete joint/);tx.rollback();expect(f.freeze()).toEqual(before);expect(f.captures).toEqual([]);expect(f.env.drainLocalHitscanOutcomes()).toEqual([]);
  f.flags.missing=false;const retry=f.controller.begin();retry.advanceExternalCallback(1);retry.commit();expect(f.env.drainLocalHitscanOutcomes()).toHaveLength(1);expect(f.loadout.freeze().ammo.rifle).toBe(9);
 });
 it('rolls back the first bullet when the second query fails, then retries the same armed action ids',()=>{
  const f=fixture({actor:true,weapon:'shotgun'});f.arm(f.commands(2));const before=f.freeze();f.flags.queryFailsAt=2;const tx=f.controller.begin();expect(()=>tx.advanceExternalCallback(1)).toThrow('injected bullet query failure');tx.rollback();expect(f.freeze()).toEqual(before);expect(f.env.drainLocalHitscanOutcomes()).toEqual([]);
  f.flags.queryFailsAt=0;f.captures.length=0;f.births.length=0;const retry=f.controller.begin();retry.advanceExternalCallback(1);retry.commit();expect(f.env.drainLocalHitscanOutcomes()).toHaveLength(2);expect(f.births).toEqual(['plane','muzzle','plane','muzzle']);expect(f.loadout.freeze().ammo.shotgun).toBe(9);expect(f.env.drainLocalHitscanOutcomes()).toEqual([]);
 });
});


it('captures the bounded outcome count once when an injected drain entry getter appends another row',()=>{
 const outcome:ReceiverLocalHitscanOutcome={prefix,weapon:'rifle',positiveShot:0,hit:null};
 const raw:ReceiverLocalHitscanOutcome[]=[];
 Object.defineProperty(raw,0,{configurable:true,get(){raw.push(outcome);return outcome;}});
 const copied=copyReceiverLocalHitscanOutcomes(raw,prefix,1,65536);
 expect(raw).toHaveLength(2);expect(copied).toHaveLength(1);expect(Object.isFrozen(copied)).toBe(true);
});

it('detaches logical hurt positions at the post-commit delivery boundary',()=>{
 const sourcePositionWorld={x:4,y:7,z:9};
 const raw:ReceiverLocalHitscanOutcome={prefix,weapon:'rifle',positiveShot:1,hit:{handle:'gi',geometryProvenance:'declared',layer:'live-gi',faceIndex:0,distance:1,point:{x:100,y:200,z:300},normal:{x:0,y:1,z:0}},hurt:{actorId:'victim',name:'Victim',amount:6,sourcePositionWorld}};
 const copied=copyReceiverLocalHitscanOutcomes([raw],prefix,1,65536);sourcePositionWorld.x=999;
 expect(copied[0].hurt!.sourcePositionWorld).toEqual({x:4,y:7,z:9});expect(Object.isFrozen(copied[0].hurt!.sourcePositionWorld)).toBe(true);
 expect(()=>copyReceiverLocalHitscanOutcomes([{...raw,hurt:{...raw.hurt!,sourcePositionWorld:{x:NaN,y:0,z:0}}}],prefix,1,65536)).toThrow('Invalid local hitscan point');
});
