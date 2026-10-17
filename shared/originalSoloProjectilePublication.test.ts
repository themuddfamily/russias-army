import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {captureOriginalSoloGunCallbackProgram} from './originalSoloGunCallbackProgram';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloReceiverSceneLease} from './originalSoloObserverWorld';
import {OriginalReceiverProjectileWorld,type ReceiverProjectileWorldBirth} from './originalReceiverProjectileWorld';
import {OriginalReceiverLocalWeaponWorld} from './originalReceiverLocalWeaponWorld';
import {createOriginalSoloFreshLoadoutWorld} from './originalSoloFreshLoadout';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import type {OriginalSoloLaunchReservation} from './originalSoloLaunchBatch';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const present={pistol:true,shotgun:true,rifle:true,launcher:true,rpg:true,sniper:true};
const runtimes=new Map<string,OriginalMapRuntime>();
function runtime(map:'barrack'|'woodlands'){let value=runtimes.get(map);if(!value){value=registerOriginalMapRuntime(map,JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='woodlands'?'woodland':'barrack'}/scene.json`,import.meta.url),'utf8')));runtimes.set(map,value);}return value;}
function birth(reservation:OriginalSoloLaunchReservation):ReceiverProjectileWorldBirth {
 const {launch,prototype}=reservation,worldMatrix=[...I];worldMatrix[12]=prototype.position.x;worldMatrix[13]=prototype.position.y;worldMatrix[14]=prototype.position.z;
 return {launchId:launch.id,weapon:launch.weapon,cloneFresh:name=>({handle:name!,resource:launch.weapon==='launcher'?'rg6grenade':'rpgrocket',materialHandle:'grenade-material',inWorld:false,worldMatrix:I,groupAncestry:[]}),resetModel:model=>({...model,inWorld:true,worldMatrix,materialHandle:launch.weapon==='rpg'?'rpg-material':model.materialHandle})};
}
// Real map/coordinator/CURRENT/private banks with explicit CPU lifecycle and
// empty ray fixtures. Publication proves model ownership, not native geometry,
// physics, clone matrices or browser rendering.
function fixture(map:'barrack'|'woodlands'='woodlands',onEvent?:(event:OriginalSoloEvent,worlds:OriginalSoloObserverWorlds)=>void){
 const r=runtime(map),events:OriginalSoloEvent[]=[],records=new Map<string,{lease:OriginalSoloReceiverSceneLease;bank?:OriginalReceiverProjectileWorld;badReader?:'throw'|'prefix'|'shape'|'kind'}>(),drains:string[]=[];
 const worlds:OriginalSoloObserverWorlds=new OriginalSoloObserverWorlds(r,{onEvent:event=>{events.push(event);onEvent?.(event,worlds);},createReceiverScene:registration=>{
  const record={lease:undefined!} as {lease:OriginalSoloReceiverSceneLease;bank?:OriginalReceiverProjectileWorld;badReader?:'throw'|'prefix'|'shape'|'kind'};records.set(registration.id,record);
  const pose:ReceiverModelPose={position:{x:0,y:20,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
  const options:OriginalSoloCurrentSceneProducerOptions={sourceScale:r.scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:128,maxOutcomes:32,maxModels:128,maxTextChars:65536},controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:128},createBackends:c=>{
   const prefix={kind:'callback' as const,sceneGeneration:c.lifeGeneration,callback:0};
   const loadout=createOriginalSoloFreshLoadoutWorld({map,sceneGeneration:c.lifeGeneration,score:0,goldScore:0,maxCommands:128,maxTextChars:8192,weaponModelPresent:present});
   const local=new OriginalReceiverLocalWeaponWorld({prefix,cameraHandle:`camera-${c.id}`,cameraWorldMatrix:I,selectedWeapon:'launcher',loadedRocket:false,motion:{weapon:'launcher',ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as keyof typeof ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,resource,inWorld:handle==='rg6',worldMatrix:I,groupAncestry:[]}))},{sourceScale:r.scale,maxCommands:128,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
   record.bank=new OriginalReceiverProjectileWorld({prefix,template:{handle:'grenade',resource:'rg6grenade',materialHandle:'grenade-material',inWorld:false,worldMatrix:I,groupAncestry:[]},catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]}},{maxModels:32,maxActors:16,maxCommands:128,maxTextChars:8192,rocketMaterialHandle:'rpg-material'});
   const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-oracle'}})};
   return {model,projectileWorld:record.bank,localWeaponWorld:local,loadoutWorld:loadout,transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q}};
  },captureLocalWeaponCallback:()=>({cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0},commands:[]}),captureLoadoutProgram:(c,p,previous,admitted)=>{
   const receiptCommands=admitted.map(a=>({kind:'admitted-projectile-retire' as const,blast:a.blast,launchId:a.blast.launch.id}));if(!p.callback)return {receiptCommands};
   const gun=captureOriginalSoloGunCallbackProgram(previous.loadout,{prefix:p.callback,held:{typing:false,reload:false,fire:c.id==='A'&&p.callback.callback===1,digits:[false,false,false,false,false,false]},weaponModelPresent:present},{random3:c.id==='A'&&p.callback.callback===1?[2]:[],shiftHeld:false,sourceScopeEnabled:false,sendReport:false,maxCommands:128,maxModels:128,maxTextChars:65536,captureLaunch:request=>{const admission=c.reserveLaunch!({weapon:request.fire.weapon as 'launcher'|'rpg',eye:originalPlayerEye(c.body),direction:{x:1,y:0,z:0}},0);return admission.ok?{admission,birth:birth(admission.reservation)}:{admission};}});
   const poses:ReceiverCurrentEnvironmentCommand[]=[];
   for(const actor of previous.projectiles?.actors??[]){const model=previous.projectiles!.models.find(m=>m.handle===actor.handle)!;const worldMatrix=[...model.worldMatrix];worldMatrix[12]+=7;poses.push({kind:'projectile-pose',launchId:actor.launchId,model:{...model,worldMatrix}});}
   return {receiptCommands,callbackCommands:[...poses,...gun.callbackCommands],gunPhase:gun.gunPhase,launchAdmissions:gun.launchAdmissions};
  },captureIncomingLaunches:(_c,_prefix,incoming)=>incoming.map(row=>({kind:'projectile-birth',birth:birth(row.reservation)})),goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:50*r.scale,weapon:c.weapon!}:null,snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-oracle'})};
  record.lease=createOriginalSoloCurrentSceneLease(options);
  return {...record.lease,drainOutcomes:()=>{drains.push(registration.id);return record.lease.drainOutcomes!();},readProjectileState:():ReturnType<NonNullable<OriginalSoloReceiverSceneLease['readProjectileState']>>=>{if(record.badReader==='throw')throw Error('projectile reader failed');const state=record.lease.readProjectileState!();if(!state)return state;if(record.badReader==='prefix')return {...state,prefix:{...state.prefix,callback:state.prefix.callback+1}};if(record.badReader==='shape')return {...state,models:[]};if(record.badReader==='kind')return {...state,prefix:state.prefix.kind==='callback'?{...state.prefix,kind:'receipt' as const,tick:worlds.worlds.get(registration.id)!.receiptTick-1}:{kind:'callback' as const,sceneGeneration:state.prefix.sceneGeneration,callback:state.prefix.callback}};return state;}};
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='launcher';b.weapon='launcher';
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 const states=()=>events.flatMap(e=>e.kind==='projectile-state'?[e]:[]);
 return {worlds,a,b,records,events,drains,physical,cycle,states};
}
describe('committed projectile owner publication',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} publishes both joint owner states before any spawned notification`,()=>{
   let inspect=()=>{};const f=fixture(map,event=>{if(event.kind==='projectile-state')inspect();});inspect=()=>{expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);expect(f.drains).toEqual(['A','B']);};
   try{f.cycle(1);expect(f.states()).toHaveLength(2);for(const event of f.states()){const world=f.worlds.worlds.get(event.recipientId)!;expect(event.checkpoint).toBe(world.projectileState);expect(event.checkpoint).not.toBe(f.records.get(world.id)!.bank!.freeze());expect(event.checkpoint).toEqual(f.records.get(world.id)!.bank!.freeze());expect(event.checkpoint.actors).toHaveLength(1);expect(event.checkpoint.models[0].inWorld).toBe(true);expect(Object.isFrozen(event.checkpoint.models[0].worldMatrix)).toBe(true);}expect(f.events.findIndex(e=>e.kind==='spawned')).toBeGreaterThan(f.events.indexOf(f.states().at(-1)!));}finally{f.worlds.clear();}
  });
  it(`${map} cancels every speculative bank and publishes no state on a later receiver failure`,()=>{
   const f=fixture(map),spy=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later receiver failed');});
   try{const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow('later receiver failed');expect(f.events).toEqual([]);expect(f.a.projectileState).toBeUndefined();expect(f.b.projectileState).toBeUndefined();expect(f.a.callback).toBe(0);spy.mockRestore();f.worlds.completeGoody(time);expect(f.states()).toHaveLength(2);f.worlds.actors(time);}finally{spy.mockRestore();f.worlds.clear();}
  });
 }
 it('updates same-callback receipt prefix without reconstructing bodies or altering prior checkpoints',()=>{
  const f=fixture();try{f.cycle(1);const before=f.a.projectileState!,body=[...f.a.projectiles.values()][0].state;f.worlds.dispose('B');const receipt=f.a.projectileState!;expect(receipt.prefix).toEqual({kind:'receipt',sceneGeneration:1,callback:1,tick:1});expect(receipt.models).toEqual(before.models);expect(receipt.actors).toEqual(before.actors);expect([...f.a.projectiles.values()][0].state).toBe(body);f.cycle(2);expect(f.a.projectileState!.models[0].worldMatrix[12]).toBe(before.models[0].worldMatrix[12]+7);expect(receipt.models[0].worldMatrix).toEqual(before.models[0].worldMatrix);}finally{f.worlds.clear();}
 });
 it.each(['throw','prefix','shape'] as const)('keeps other committed streams independent of a malformed %s reader',badReader=>{
  const f=fixture();try{f.cycle(1);const before=f.a.projectileState!;f.records.get('A')!.badReader=badReader;const time=f.physical(2);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.a.callback).toBe(2);expect(f.b.callback).toBe(2);expect(f.a.projectileState).toBe(before);expect(f.states().filter(e=>e.recipientId==='B')).toHaveLength(2);f.worlds.actors(time);}finally{f.worlds.clear();}
 });
 it('rejects receipt-kind checkpoint from a callback reader even when its tick and life match',()=>{
  const f=fixture();try{f.cycle(1);const before=f.a.projectileState!,count=f.states().filter(e=>e.recipientId==='A').length;f.records.get('A')!.badReader='kind';const time=f.physical(2);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.a.callback).toBe(2);expect(f.a.projectileState).toBe(before);expect(f.states().filter(e=>e.recipientId==='A')).toHaveLength(count);expect(f.b.projectileState!.prefix.kind).toBe('callback');f.worlds.actors(time);}finally{f.worlds.clear();}
 });
 it('rejects callback-kind checkpoint from a receipt reader without publishing stale owner state',()=>{
  const f=fixture();try{f.cycle(1);const before=f.a.projectileState!,count=f.states().filter(e=>e.recipientId==='A').length;f.records.get('A')!.badReader='kind';expect(()=>f.worlds.dispose('B')).toThrow();expect(f.worlds.worlds.has('B')).toBe(false);expect(f.a.callback).toBe(1);expect(f.a.projectileState).toBe(before);expect(f.states().filter(e=>e.recipientId==='A')).toHaveLength(count);expect(f.records.get('A')!.bank!.freeze().prefix.kind).toBe('receipt');}finally{f.worlds.clear();}
 });
 it('continues all state/spawn deliveries after an observer error without replaying the committed queue',()=>{
  let fail=true;const f=fixture('woodlands',event=>{if(event.kind==='projectile-state'&&fail){fail=false;throw Error('presentation failed');}});try{const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.states()).toHaveLength(2);expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(2);f.worlds.actors(time);f.cycle(2);expect(f.states()).toHaveLength(4);expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(2);}finally{f.worlds.clear();}
 });
 it('suppresses old state and spawn callbacks after clear and replacement with the same numeric life',()=>{
  let replaced=false;const f=fixture('woodlands',(event,worlds)=>{if(event.kind==='projectile-state'&&!replaced){replaced=true;worlds.clear();worlds.register({id:'A',name:'Replacement',eye:{x:1000,y:1000,z:1000}});}});try{f.worlds.completeGoody(f.physical(1));expect(f.states()).toHaveLength(1);const replacement=f.worlds.worlds.get('A')!;expect(replacement).not.toBe(f.a);expect(replacement.lifeGeneration).toBe(1);expect(replacement.projectileState).toBeUndefined();expect(f.events.filter(e=>e.kind==='spawned')).toEqual([]);}finally{f.worlds.clear();}
 });
});
