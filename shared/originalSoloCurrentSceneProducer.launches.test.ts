import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {advanceOriginalReceiverGunCallback} from './originalReceiverGunCallback';
import {OriginalReceiverLoadoutWorld} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld} from './originalReceiverLocalWeaponWorld';
import {OriginalReceiverProjectileWorld,type ReceiverProjectileWorldModel} from './originalReceiverProjectileWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloReceiverSceneLease} from './originalSoloObserverWorld';
import type {OriginalSoloLaunchReservation,OriginalSoloReservedLaunchAdmission} from './originalSoloLaunchBatch';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {WeaponId} from './protocol';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const counts=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
const owned=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
let cachedRuntime:OriginalMapRuntime|undefined;
const runtime=()=>cachedRuntime??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
interface RecordState {
 lease:OriginalSoloReceiverSceneLease;loadout:OriginalReceiverLoadoutWorld;local:OriginalReceiverLocalWeaponWorld;projectiles:OriginalReceiverProjectileWorld;
 inputReads:number;cameraReads:number;constructorCaptures:number;incomingCaptures:number;released:number;
 ownerPrefixes:ReceiverScenePrefix[];incomingPrefixes:ReceiverScenePrefix[];admissions:OriginalSoloReservedLaunchAdmission[];
 repeatReservation?:()=>OriginalSoloReservedLaunchAdmission;
}

// The physical launch prototype comes from the real coordinator constructor.
// Its position is captured into an explicit translated WORLD matrix; resource,
// material, rotation and empty downward-query coverage are CPU fixture adapters.
// These cases prove joint publication, not Havok, native model or clock parity.
function projectileBirth(reservation:OriginalSoloLaunchReservation):ReceiverCurrentEnvironmentCommand {
 const {launch,prototype}=reservation,matrix=[...I];matrix[12]=prototype.position.x;matrix[13]=prototype.position.y;matrix[14]=prototype.position.z;
 return {kind:'projectile-birth',birth:{launchId:launch.id,weapon:launch.weapon,
  cloneFresh:name=>({handle:name!,resource:launch.weapon==='launcher'?'rg6grenade':'rpgrocket',materialHandle:'declared-grenade-material',inWorld:false,worldMatrix:[...I],groupAncestry:[]}),
  resetModel:(model:ReceiverProjectileWorldModel)=>({...model,materialHandle:launch.weapon==='rpg'?'declared-rpg-material':model.materialHandle,worldMatrix:matrix,inWorld:true,groupAncestry:['declared-projectiles']})}};
}
function fixture(config:{weapon?:'launcher'|'rpg';sender?:'A'|'B';recipientName?:string;captureUnrelatedModel?:boolean;callRetainedReservation?:boolean;onEvent?:(event:OriginalSoloEvent)=>void}={}){
 const records=new Map<string,RecordState>(),events:OriginalSoloEvent[]=[],r=runtime(),weapon=config.weapon??'launcher',sender=config.sender??'A';
 const worlds=new OriginalSoloObserverWorlds(r,{onEvent:event=>{events.push(event);config.onEvent?.(event);},createReceiverScene:registration=>{
  const record={} as RecordState;Object.assign(record,{inputReads:0,cameraReads:0,constructorCaptures:0,incomingCaptures:0,released:0,ownerPrefixes:[],incomingPrefixes:[],admissions:[]});records.set(registration.id,record);
  const pose:ReceiverModelPose={position:{x:0,y:20,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
  const options:OriginalSoloCurrentSceneProducerOptions={sourceScale:r.scale,maxCapturedBlasts:16,maxCapturedProjectiles:16,
   environment:{maxCommands:128,maxOutcomes:32,maxModels:128,maxTextChars:65536},controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:128},
   createBackends:context=>{
    const prefix:ReceiverScenePrefix={kind:'callback',sceneGeneration:context.lifeGeneration,callback:0};
    record.loadout=new OriginalReceiverLoadoutWorld({prefix,map:'woodlands',selected:weapon,owned:owned(),ammo:{...counts(),[weapon]:2},reserve:{...counts(),[weapon]:4},refillTarget:weapon==='launcher'?6:1,counter:{waitgun:0,poldwaitgun:0},score:0,goldScore:0},{maxCommands:128,maxTextChars:8192,weaponModelPresent:owned()});
    record.local=new OriginalReceiverLocalWeaponWorld({prefix,cameraHandle:`camera:${context.id}`,cameraWorldMatrix:[...I],selectedWeapon:weapon,loadedRocket:weapon==='rpg',motion:{weapon,ticker:0,gunPositionSource:{x:0,y:0,z:0}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as 'pistol',resource,inWorld:handle===(weapon==='launcher'?'rg6':'rpg')||weapon==='rpg'&&handle==='rocket',worldMatrix:[...I],groupAncestry:['declared-local']}))},{sourceScale:r.scale,maxCommands:128,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
    record.projectiles=new OriginalReceiverProjectileWorld({prefix,template:{handle:'grenade',resource:'rg6grenade',materialHandle:'declared-grenade-material',inWorld:false,worldMatrix:[...I],groupAncestry:[]},catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]}},{maxModels:32,maxActors:16,maxCommands:128,maxTextChars:8192,rocketMaterialHandle:'declared-rpg-material'});
    const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})};
    return {model,localWeaponWorld:record.local,loadoutWorld:record.loadout,projectileWorld:record.projectiles,transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},release:()=>{record.released++;}};
   },captureLocalWeaponCallback:()=>{record.cameraReads++;return {cameraWorldMatrix:[...I],velocityWorld:{x:0,y:0,z:0},commands:[]};},
   captureLoadoutProgram:(context,prefixes,previous,admitted)=>{
    const receiptCommands=admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));if(!prefixes.callback)return {receiptCommands};record.inputReads++;
    const gunPhase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:prefixes.callback,held:{typing:false,reload:false,fire:context.id===sender&&prefixes.callback.callback===1,digits:[false,false,false,false,false,false]},weaponModelPresent:owned()});
    const launchAdmissions:OriginalSoloReservedLaunchAdmission[]=[],callbackCommands:ReceiverCurrentEnvironmentCommand[]=[{kind:'loadout-capture',checkpoint:gunPhase.checkpoint}];
    for(const intent of gunPhase.intents){
     if(intent.kind==='recoil-pose')callbackCommands.push({kind:'weapon-fire'});
     else if(intent.kind==='load-pose')callbackCommands.push({kind:'weapon-reload'});
     else if(intent.kind==='rocket-remove')callbackCommands.push({kind:'weapon-rocket',loadedRocket:false});
     else if(intent.kind==='rocket-parent')callbackCommands.push({kind:'weapon-rocket',loadedRocket:true});
     else if(intent.kind==='sortweapons')callbackCommands.push({kind:'weapon-whichgun',weapon:intent.weapon});
     else if(intent.kind==='fire'&&(intent.weapon==='launcher'||intent.weapon==='rpg')){
      // Explicit pre-recoil input capture: the original eye is sent to the
      // constructor; the resulting shifted RPG position only seeds its model.
      record.constructorCaptures++;const command={weapon:intent.weapon,eye:originalPlayerEye(context.body),direction:{x:1,y:0,z:0},sourceRotation:{x:0,y:0,z:-90}},ordinal=launchAdmissions.length;
      record.repeatReservation=()=>context.reserveLaunch!(command,ordinal);const admission=record.repeatReservation();launchAdmissions.push(admission);record.admissions.push(admission);
      if(admission.ok){record.ownerPrefixes.push(prefixes.callback);callbackCommands.push(projectileBirth(admission.reservation));}
     }
    }
    callbackCommands.push({kind:'weapon-finish'});return {receiptCommands,callbackCommands,gunPhase,launchAdmissions};
   },captureIncomingLaunches:(_context,prefix,incoming,previous)=>{
    record.incomingCaptures++;record.incomingPrefixes.push(prefix);
    if(config.callRetainedReservation)expect(()=>records.get(sender)!.repeatReservation!()).toThrow(/outside capture/);
    const commands=incoming.map(item=>projectileBirth(item.reservation));
    if(config.captureUnrelatedModel){const matrix=[...previous.template.worldMatrix];matrix[12]=999;commands.unshift({kind:'projectile-capture-model',handle:previous.template.handle,model:{...previous.template,worldMatrix:matrix}});}
    return commands;
   },
   goodyAt:context=>context.alive?{eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:50*r.scale,weapon:context.weapon!}:null,
   snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-CPU-oracle'})};
  record.lease=createOriginalSoloCurrentSceneLease(options);return record.lease;
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:config.recipientName??'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon=weapon;b.weapon=weapon;
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const w of worlds.worlds.values())if(w.alive)worlds.goody(w.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 return {worlds,a,b,records,events,physical,cycle};
}

describe('atomic source gun launches through private CURRENT banks (explicit CPU adapters)',()=>{
 it.each(['launcher','rpg'] as const)('commits one %s constructor, debit, physical body and distinct private model per receiver',weapon=>{
  const f=fixture({weapon}),time=f.physical(1);f.worlds.completeGoody(time);expect(f.worlds.launches.size).toBe(1);
  const launch=[...f.worlds.launches.values()][0],sender=f.records.get('A')!,remote=f.records.get('B')!;
  expect(launch).toMatchObject({id:'solo-projectile-1',sequence:1,ownerId:'A',ownerLife:f.a.lifeGeneration,ownerName:'Alpha',weapon,birthCallback:1,eye:originalPlayerEye(f.a.body),sourceRotation:{x:0,y:0,z:-90}});
  expect(sender.constructorCaptures).toBe(1);expect(sender.loadout.freeze().ammo[weapon]).toBe(1);expect(remote.loadout.freeze().ammo[weapon]).toBe(2);
  expect(sender.ownerPrefixes).toEqual([{kind:'callback',sceneGeneration:f.a.lifeGeneration,callback:1}]);expect(remote.incomingPrefixes[0]).toMatchObject({kind:'receipt',sceneGeneration:f.b.lifeGeneration,callback:0});
  for(const [id,w] of f.worlds.worlds){const record=f.records.get(id)!,bank=record.projectiles.freeze(),physical=w.projectiles.get(launch.id)!;expect(bank.actors).toHaveLength(1);expect(bank.actors[0].launchId).toBe(launch.id);expect(bank.actors[0].handle).not.toBe(launch.id);expect(bank.models).toHaveLength(1);expect(bank.models[0].inWorld).toBe(true);expect(bank.models[0].worldMatrix.slice(12,15)).toEqual([physical.state.position.x,physical.state.position.y,physical.state.position.z]);}
  expect(f.a.projectiles.get(launch.id)!.state).not.toBe(f.b.projectiles.get(launch.id)!.state);expect(sender.projectiles.freeze().models[0]).not.toBe(remote.projectiles.freeze().models[0]);
  expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(2);f.worlds.actors(time);f.cycle(2);expect(f.worlds.launches.size).toBe(1);expect(sender.constructorCaptures).toBe(1);expect(sender.loadout.freeze().ammo[weapon]).toBe(1);f.worlds.clear();
 });
 it('finalizes an earlier receiver after a later registered sender captures its constructor',()=>{
  const f=fixture({sender:'B'});f.cycle(1);const launch=[...f.worlds.launches.values()][0];expect(launch.ownerId).toBe('B');expect(f.a.projectiles.has(launch.id)).toBe(true);expect(f.records.get('A')!.projectiles.freeze().actors.map(a=>a.launchId)).toEqual([launch.id]);expect(f.records.get('A')!.incomingCaptures).toBe(1);expect(f.records.get('B')!.incomingCaptures).toBe(0);f.worlds.clear();
 });
 it('filters equal source names from captured registration independently of a receiver GI model',()=>{
  const f=fixture({recipientName:'aLPHa'});f.cycle(1);expect(f.worlds.launches.size).toBe(1);expect(f.a.projectiles.size).toBe(1);expect(f.b.projectiles.size).toBe(0);expect(f.records.get('B')!.incomingCaptures).toBe(0);expect(f.records.get('B')!.projectiles.freeze().actors).toEqual([]);expect(f.events.filter(e=>e.kind==='spawned').map(e=>e.recipientId)).toEqual(['A']);f.worlds.clear();
 });
 it('rejects an incoming hook command that would mutate an unrelated retained template',()=>{
  const f=fixture({captureUnrelatedModel:true}),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow(/Invalid Solo incoming model command/);
  expect(f.worlds.launches.size).toBe(0);expect(f.a.projectiles.size).toBe(0);expect(f.b.projectiles.size).toBe(0);expect(f.events.filter(e=>e.kind==='spawned')).toEqual([]);
  const sender=f.records.get('A')!,remote=f.records.get('B')!;expect(sender.loadout.freeze().ammo.launcher).toBe(2);expect(sender.projectiles.freeze().catalog).toEqual([]);expect(sender.projectiles.freeze().template.worldMatrix).toEqual(I);expect(remote.incomingCaptures).toBe(1);expect(remote.released).toBe(1);expect(()=>remote.projectiles.freeze()).toThrow(/released/);f.worlds.clear();
 });
 it('rejects a retained reservation closure during later receipt hooks and after commit, even for its identical prior request',()=>{
  const f=fixture({callRetainedReservation:true}),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow(/launch batch reentry rejected/);const sender=f.records.get('A')!;
  expect(f.worlds.launches.size).toBe(0);expect(f.a.projectiles.size).toBe(0);expect(f.b.projectiles.size).toBe(0);expect(sender.loadout.freeze().ammo.launcher).toBe(2);expect(sender.constructorCaptures).toBe(1);
  // A caught reservation reentry still poisons this preparation. The retry
  // reuses the already captured receipt and cannot rerun the offending hook.
  f.worlds.completeGoody(time);
  expect(f.records.get('B')!.incomingCaptures).toBe(1);expect(()=>sender.repeatReservation!()).toThrow(/outside capture/);expect(f.worlds.launches.size).toBe(1);expect(sender.constructorCaptures).toBe(1);expect(sender.loadout.freeze().ammo.launcher).toBe(1);expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(2);f.worlds.clear();
 });
 it('rolls back catalog, sequence, bodies and all banks after a later mirror failure, then retries captured constructors and recipients once',()=>{
  const f=fixture(),time=f.physical(1),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later launch receiver failed');});
  expect(()=>f.worlds.completeGoody(time)).toThrow('later launch receiver failed');expect(f.worlds.launches.size).toBe(0);expect(f.a.projectiles.size).toBe(0);expect(f.b.projectiles.size).toBe(0);expect(f.events.filter(e=>e.kind==='spawned')).toEqual([]);
  const before=[...f.records.values()].map(record=>({input:record.inputReads,camera:record.cameraReads,constructor:record.constructorCaptures,incoming:record.incomingCaptures}));
  const originalWorlds=[...f.worlds.worlds],originalBodies=[f.a.body,f.b.body];
  expect(()=>f.worlds.register({id:'C',name:'Charlie',eye:{x:3000,y:1000,z:1000}},time)).toThrow(/Uncommitted launch batch/);
  expect(()=>f.worlds.dispose('A')).toThrow(/Uncommitted launch batch/);
  expect(()=>f.worlds.physics(2/30,{skipIds:new Set(['A','B'])})).toThrow(/Uncommitted launch batch/);
  expect(()=>f.worlds.freeze(time)).toThrow(/Uncommitted launch batch/);
  expect(()=>f.worlds.launch({ownerId:'A',weapon:'launcher',eye:originalPlayerEye(f.a.body),direction:{x:1,y:0,z:0}},time)).toThrow(/Uncommitted launch batch/);
  expect([...f.worlds.worlds]).toEqual(originalWorlds);expect([f.a.body,f.b.body]).toEqual(originalBodies);expect(f.worlds.launches.size).toBe(0);expect(f.a.projectiles.size).toBe(0);expect(f.b.projectiles.size).toBe(0);
  for(const record of f.records.values()){expect(record.projectiles.freeze().actors).toEqual([]);expect(record.projectiles.freeze().catalog).toEqual([]);expect(record.loadout.freeze().ammo.launcher).toBe(2);}
  failure.mockRestore();f.worlds.completeGoody(time);expect([...f.worlds.launches.values()][0].sequence).toBe(1);expect([...f.records.values()].map(record=>({input:record.inputReads,camera:record.cameraReads,constructor:record.constructorCaptures,incoming:record.incomingCaptures}))).toEqual(before);
  expect(f.records.get('A')!.loadout.freeze().ammo.launcher).toBe(1);expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(2);f.worlds.clear();
 });
 it('drains and commits every recipient before a throwing spawned listener, without replaying the launch next callback',()=>{
  let f:ReturnType<typeof fixture>,failed=false;f=fixture({onEvent:event=>{if(event.kind==='spawned'&&event.recipientId==='A'&&!failed){failed=true;expect(f.a.projectiles.size).toBe(1);expect(f.b.projectiles.size).toBe(1);for(const record of f.records.values())expect(record.projectiles.freeze().actors).toHaveLength(1);throw Error('spawn listener failed');}}});
  const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow(/committed callback dispatch failed/);expect(f.events.filter(e=>e.kind==='spawned'&&e.recipientId==='B')).toHaveLength(1);f.worlds.actors(time);f.cycle(2);expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(2);expect(f.worlds.launches.size).toBe(1);expect(f.records.get('A')!.loadout.freeze().ammo.launcher).toBe(1);f.worlds.clear();
 });
 it('allows explicit clear to discard an uncommitted launch batch and release every private owner',()=>{
  const f=fixture(),time=f.physical(1),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('launch reset fixture');});expect(()=>f.worlds.completeGoody(time)).toThrow('launch reset fixture');failure.mockRestore();
  expect(()=>f.worlds.clear()).not.toThrow();expect(f.worlds.worlds.size).toBe(0);expect(f.worlds.launches.size).toBe(0);expect(f.events.filter(e=>e.kind==='spawned')).toEqual([]);for(const record of f.records.values()){expect(record.released).toBe(1);expect(()=>record.projectiles.freeze()).toThrow(/released/);expect(()=>record.loadout.freeze()).toThrow(/released/);}
 });
 it('preserves the helper debit when the explicit eight-projectile admission cap rejects the constructor',()=>{
  const f=fixture();for(let i=0;i<8;i++)expect(f.worlds.launch({ownerId:'A',weapon:'launcher',eye:originalPlayerEye(f.a.body),direction:{x:1,y:0,z:0}},0).ok).toBe(true);
  const eventCount=f.events.filter(e=>e.kind==='spawned').length;f.cycle(1);const sender=f.records.get('A')!;expect(sender.admissions).toEqual([{ok:false,reason:'projectile-cap'}]);expect(sender.constructorCaptures).toBe(1);expect(sender.loadout.freeze().ammo.launcher).toBe(1);expect(sender.projectiles.freeze().actors).toEqual([]);expect(f.worlds.launches.size).toBe(8);expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(eventCount);f.worlds.clear();
 });
 it('releases prior private banks on replacement and never transfers constructor reservations to the fresh life',()=>{
  const f=fixture();f.cycle(1);const old=f.records.get('A')!,oldLife=f.a.lifeGeneration;f.worlds.dispose('A');const replacement=f.worlds.register({id:'A',name:'AlphaAgain',eye:{x:3000,y:1000,z:1000}},1/30);replacement.weapon='launcher';expect(replacement.lifeGeneration).toBe(oldLife+1);expect(replacement.projectiles.size).toBe(0);expect(old.released).toBe(1);expect(()=>old.projectiles.freeze()).toThrow(/released/);f.worlds.freeze(1/30);expect(f.worlds.launch({ownerId:'A',weapon:'launcher',eye:originalPlayerEye(replacement.body),direction:{x:1,y:0,z:0}},1/30)).toEqual({ok:false,reason:'frozen'});f.worlds.clear();
 });
});
