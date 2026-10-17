import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloReceiverCurrentContext,type OriginalSoloReceiverSceneLease} from './originalSoloObserverWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponBindingOperation,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {createOriginalReceiverLocalWeaponInventory,ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from './originalReceiverLocalWeaponInventory';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import type {ReceiverModelBackend,ReceiverModelEntry,ReceiverModelPose} from './originalReceiverModelWorld';
import {originalPlayerEye} from './originalPlayerPhysics';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {WeaponId} from './protocol';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const selected:Record<WeaponId,string>={rifle:'ak47',pistol:'pistol',shotgun:'spas12',sniper:'dragunov',rpg:'rpg',launcher:'rg6'};
let savedRuntime:OriginalMapRuntime|undefined;
const runtime=()=>savedRuntime??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
interface RecordState {lease:OriginalSoloReceiverSceneLease;bank?:OriginalReceiverLocalWeaponWorld;created:number;released:number;cleanupSawClosed?:boolean;hooks:{context:OriginalSoloReceiverCurrentContext;prefix:ReceiverScenePrefix;previous:ReceiverLocalWeaponWorldCheckpoint}[];ops:ReceiverLocalWeaponBindingOperation[];snapshots:{prefix:ReceiverScenePrefix;models:readonly ReceiverModelEntry[]}[];staged:(readonly Readonly<ReceiverModelEntry>[])[];options?:OriginalSoloCurrentSceneProducerOptions}
type Hook=NonNullable<OriginalSoloCurrentSceneProducerOptions['captureLocalWeaponCallback']>;
function fixture(custom?:Hook,configure?:(options:OriginalSoloCurrentSceneProducerOptions,record:RecordState)=>OriginalSoloCurrentSceneProducerOptions){
 const records=new Map<string,RecordState>(),flags={missing:false},scale=runtime().scale,pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const worlds=new OriginalSoloObserverWorlds(runtime(),{createReceiverScene:registration=>{
  const record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,created:0,released:0,hooks:[],ops:[],snapshots:[],staged:[]};records.set(registration.id,record);
  const provider=createOriginalReceiverLocalWeaponInventory(JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as ReceiverWeaponGeometry,{sceneGeneration:registration.lifeGeneration,maxModels:7,maxVertices:100000,maxFaces:100000,provenance:'declared-private-producer-bank',sidedness:'double'});
  const options:OriginalSoloCurrentSceneProducerOptions={sourceScale:scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536},controller:{model:{eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:50*scale,maxModels:128,maxPickups:32},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},createBackends:context=>{
   record.created++;const weapon=context.weapon;if(!weapon)throw Error('fixture requires explicit weapon');const checkpoint:ReceiverLocalWeaponWorldCheckpoint={prefix:{kind:'callback',callback:0,sceneGeneration:context.lifeGeneration},cameraHandle:`camera:${context.id}`,cameraWorldMatrix:[...I],selectedWeapon:weapon,loadedRocket:false,motion:{weapon,ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource,worldMatrix:[...I],inWorld:handle===selected[weapon],groupAncestry:handle===selected[weapon]?[`camera:${context.id}`]:['declared-template']}))};
   record.bank=new OriginalReceiverLocalWeaponWorld(checkpoint,{sourceScale:scale,maxCommands:32,maxTextChars:8192,bindModels:(op,state)=>{record.ops.push(op);let models=state.models,loadedRocket=state.loadedRocket;if(op.kind==='whichgun')models=models.map(m=>m.handle==='rocket'?m:{...m,inWorld:op.weapon!==null&&m.handle===selected[op.weapon]});if(op.kind==='rocket'){loadedRocket=op.loadedRocket;models=models.map(m=>m.handle==='rocket'?{...m,inWorld:op.loadedRocket}:m);}if(op.kind==='position'){const world=[...state.cameraWorldMatrix];world[12]+=op.positionSource.x*scale;world[13]+=op.positionSource.y*scale;world[14]+=op.positionSource.z*scale;models=models.map(m=>m.handle===selected[op.weapon]?{...m,worldMatrix:world}:m);}return {models,loadedRocket};}});
   const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:()=>pose,reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-CPU-query-subset'}})};
   return {model,transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},localWeaponWorld:record.bank,release:()=>{record.released++;try{record.bank!.freeze();record.cleanupSawClosed=false;}catch{record.cleanupSawClosed=true;}}};
  },captureLocalWeaponCallback:(context,prefix,previous)=>{record.hooks.push({context,prefix,previous});if(custom)return custom(context,prefix,previous);const camera=[...I];camera[12]=context.physicalCallback*10;return {cameraWorldMatrix:camera,velocityWorld:{x:100*scale,y:0,z:0},commands:[]};},goodyAt:context=>context.alive?{eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:50*scale,weapon:context.weapon!}:null,
  // The fixture's oracle closes only this declared CPU subset. Mandatory
  // missing evidence is independently injected; this is no native scene proof.
  snapshotAt:(prefix,state)=>{if(!state.localWeapons)throw Error('missing staged bank');const snapshot=provider.snapshotAt(prefix,state.localWeapons);record.snapshots.push({prefix,models:snapshot.models});return {prefix,models:snapshot.models,missing:flags.missing?['unresolved-native-membership']:[],provenance:snapshot.provenance};}};
  record.options=configure?configure(options,record):options;record.lease=createOriginalSoloCurrentSceneLease(record.options);
  return {captureCurrent:record.lease.captureCurrent!.bind(record.lease),drainOutcomes:record.lease.drainOutcomes!.bind(record.lease),readLocalWeaponState:record.lease.readLocalWeaponState!.bind(record.lease),release:()=>record.lease.release(),scene:{begin:()=>{const tx=record.lease.scene.begin();return {...tx,prepareCommit:()=>{record.staged.push(tx.freezeModels());return tx.prepareCommit();}};}}};
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 const freeze=()=>[...worlds.worlds.values()].map(world=>({id:world.id,callback:world.callback,tick:world.receiptTick,poses:world.mirror.freeze(),health:{...world.health},bank:records.get(world.id)?.bank?.freeze()}));
 return {worlds,a,b,records,flags,physical,cycle,freeze};
}

describe('optional producer-owned local weapon bank (real coordinator, declared CPU binding)',()=>{
 it('reads only the actual committed bank during capture and failed delivery, with no ownership before lazy initialization',()=>{
  let read:(_id:string)=>ReceiverLocalWeaponWorldCheckpoint|undefined=()=>undefined;
  const during:{id:string;state:ReceiverLocalWeaponWorldCheckpoint}[]=[];
  const f=fixture((context,_prefix,previous)=>{const state=read(context.id);expect(state).toBe(previous);during.push({id:context.id,state:state!});return {cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0},commands:[]};});
  const record=f.records.get('A')!;expect(record.lease.readLocalWeaponState!()).toBeUndefined();
  read=id=>f.records.get(id)!.lease.readLocalWeaponState!();
  // Each receiver reads its own committed checkpoint, without exposing a staged camera/position write.
  f.cycle(1);const committed=record.bank!.freeze();expect(read('A')).toBe(committed);expect(Object.isFrozen(committed.models)).toBe(true);
  const time=f.physical(2),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('local read delivery failed');});
  expect(()=>f.worlds.completeGoody(time)).toThrow('local read delivery failed');expect(read('A')).toBe(committed);expect(during.filter(value=>value.id==='A').at(-1)!.state).toBe(committed);const calls=record.hooks.length;
  failure.mockRestore();f.worlds.completeGoody(time);expect(record.hooks).toHaveLength(calls);expect(read('A')).toBe(record.bank!.freeze());expect(read('A')).not.toBe(committed);f.worlds.actors(time);
  f.worlds.clear();
  expect(()=>read('A')).toThrow('released');
 });
 it('lazily owns distinct seven-model banks and forwards decoded CURRENT inventory on multiple successful callbacks',()=>{
  const f=fixture();expect(f.records.get('A')!.created).toBe(0);f.cycle(1);f.cycle(2);const a=f.records.get('A')!,b=f.records.get('B')!;expect(a.created).toBe(1);expect(b.created).toBe(1);expect(a.bank).not.toBe(b.bank);expect(a.hooks.map(h=>h.prefix.callback)).toEqual([1,2]);expect(a.hooks[0].previous.prefix).toMatchObject({kind:'callback',callback:0});expect(a.hooks[1].previous.prefix).toMatchObject({kind:'callback',callback:1});expect(a.snapshots.every(s=>s.models.length===7)).toBe(true);expect(a.bank!.freeze().motion.ticker).toBe(11);expect(a.bank!.freeze().models.find(m=>m.handle==='ak47')!.worldMatrix[12]).toBeLessThan(20);f.worlds.clear();
 });
 it('orders recoil, explicit old-WORLD muzzle birth and later selection/load before final bank assignment',()=>{
  const f=fixture((context,_prefix,previous)=>{const commands:ReceiverCurrentEnvironmentCommand[]=context.id==='A'?[{kind:'weapon-fire'},{kind:'transient-birth',event:{kind:'muzzle',id:'declared-local-old-rifle',weapon:'rifle',gunPose:{position:{x:previous.models.find(m=>m.handle==='ak47')!.worldMatrix[12],y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}}}},{kind:'weapon-equip',weapon:'pistol'}]:[];const camera=[...I];camera[12]=30;return {cameraWorldMatrix:camera,velocityWorld:{x:0,y:0,z:0},commands};});f.cycle(1);const record=f.records.get('A')!,state=record.bank!.freeze();expect(record.ops.map(op=>op.kind)).toEqual(['camera','whichgun','position']);expect(state.selectedWeapon).toBe('pistol');expect(state.models.find(m=>m.handle==='ak47')!.worldMatrix).toEqual(I);expect(state.models.find(m=>m.handle==='pistol')!.worldMatrix[12]).not.toBe(0);expect(record.staged.at(-1)!.some(m=>m.kind==='transient'&&m.resource==='mfak47'&&m.pose.position.x===0)).toBe(true);f.worlds.clear();
 });
 it('retries later-receiver failure using the exact captured hook plan without calling the hook again or publishing bank changes',()=>{
  const f=fixture(),time=f.physical(1),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later local receiver failed');});expect(()=>f.worlds.completeGoody(time)).toThrow('later local receiver failed');const record=f.records.get('A')!,before=record.bank!.freeze(),calls=record.hooks.length;expect(before.prefix.callback).toBe(0);failure.mockRestore();f.worlds.completeGoody(time);expect(record.hooks).toHaveLength(calls);expect(record.created).toBe(1);expect(record.bank!.freeze().prefix.callback).toBe(1);f.worlds.actors(time);f.worlds.clear();
 });
 it('same-physical death receipts never call the local callback hook or age/assign the retained bank',()=>{
  const f=fixture();f.cycle(1);const record=f.records.get('A')!,before=record.bank!.freeze(),calls=record.hooks.length,ops=record.ops.length;f.worlds.dispose('B');expect(record.hooks).toHaveLength(calls);expect(record.ops).toHaveLength(ops);expect(record.bank!.freeze().motion).toEqual(before.motion);expect(record.bank!.freeze().models).toEqual(before.models);expect(record.bank!.freeze().prefix).toMatchObject({kind:'receipt',callback:1});f.worlds.clear();
 });
 it('retains mandatory inventory gaps and cached hook data until complete acceptance can retry',()=>{
  const f=fixture(),time=f.physical(1);f.flags.missing=true;expect(()=>f.worlds.completeGoody(time)).toThrow('Incomplete receiver external scene');const record=f.records.get('A')!,calls=record.hooks.length;expect(record.bank!.freeze().prefix.callback).toBe(0);expect(f.a.callback).toBe(0);f.flags.missing=false;f.worlds.completeGoody(time);expect(record.hooks).toHaveLength(calls);expect(record.bank!.freeze().prefix.callback).toBe(1);f.worlds.actors(time);f.worlds.clear();
 });
 it('bounds callback command arrays before reading entries and cleans failed first capture bank/backend once',()=>{
  let reads=0;const oversized=new Array(17);Object.defineProperty(oversized,0,{get:()=>{reads++;throw Error('oversized entry read');}});Object.defineProperty(oversized,Symbol.iterator,{get:()=>{reads++;throw Error('oversized iterator read');}});const f=fixture(()=>({cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0},commands:oversized})),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();const record=f.records.get('A')!;expect(reads).toBe(0);expect(record.released).toBe(1);expect(()=>record.bank!.freeze()).toThrow();expect(()=>record.lease.scene.begin()).toThrow();record.lease.release();expect(record.released).toBe(1);f.worlds.clear();
 });
 it('requires the callback hook and owned bank as a pair, with fail-closed cleanup for missing counterparts',()=>{
  for(const missing of ['bank','hook']){const f=fixture(undefined,(options)=>{if(missing==='hook'){Reflect.deleteProperty(options,'captureLocalWeaponCallback');return options;}const create=options.createBackends;return {...options,createBackends:context=>{const resources=create(context);Reflect.deleteProperty(resources,'localWeaponWorld');return resources;}};}),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();const record=f.records.get('A')!;expect(record.released).toBe(1);expect(()=>record.lease.scene.begin()).toThrow();f.worlds.clear();if(missing==='bank')record.bank!.release();}
 });
 it('captures producer options and hook identity at lease creation and releases owned banks before resource cleanup',()=>{
  const f=fixture(),record=f.records.get('A')!,options=record.options!;Reflect.set(options,'captureLocalWeaponCallback',()=>{throw Error('mutated callback must not run');});Reflect.set(options.environment,'maxCommands',0);f.cycle(1);expect(record.hooks).toHaveLength(1);const before=record.bank!;f.worlds.clear();expect(()=>before.freeze()).toThrow();expect(record.released).toBe(1);expect(record.cleanupSawClosed).toBe(true);record.lease.release();expect(record.released).toBe(1);
  f.worlds.register({id:'A',name:'NewAlpha',eye:{x:1000,y:1000,z:1000}});expect(f.records.get('A')!.bank).toBeUndefined();expect(f.records.get('A')!.lease.scene).not.toBe(record.lease.scene);f.worlds.clear();
 });
 it('rejects malformed camera/velocity plans before publishing any seven-model bank state',()=>{
  for(const invalid of ['camera','velocity']){const f=fixture(()=>({cameraWorldMatrix:invalid==='camera'?[1]:I,velocityWorld:{x:invalid==='velocity'?Infinity:0,y:0,z:0},commands:[]})),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.a.callback).toBe(0);const record=f.records.get('A')!;expect(record.released).toBe(1);expect(()=>record.bank!.freeze()).toThrow();f.worlds.clear();}
  for(const phase of ['factory','capture']){const f=fixture(undefined,(options,record)=>{const create=options.createBackends,capture=options.captureLocalWeaponCallback!;return {...options,createBackends:context=>{const resources=create(context);if(phase==='factory')record.lease.release();return resources;},captureLocalWeaponCallback:(context,prefix,previous)=>{const program=capture(context,prefix,previous);if(phase==='capture')record.lease.release();return program;}};}),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();const record=f.records.get('A')!;expect(record.released).toBe(1);expect(record.cleanupSawClosed).toBe(true);expect(()=>record.bank!.freeze()).toThrow();expect(()=>record.lease.scene.begin()).toThrow();record.lease.release();expect(record.released).toBe(1);f.worlds.clear();}
 });
 it('fail-closes a later poisoned command getter even when it catches recursive preparation after an earlier successful callback',()=>{
  let attack=false,reenter=()=>{};const f=fixture(()=>({cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0},get commands(){if(attack){try{reenter();}catch{/* Catching a nested error must not allow a stranded armed plan. */}}return [];}}));f.cycle(1);const record=f.records.get('A')!;attack=true;reenter=()=>{record.lease.scene.begin();};const time=f.physical(2);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.a.callback).toBe(1);expect(record.released).toBe(1);expect(record.cleanupSawClosed).toBe(true);expect(()=>record.lease.scene.begin()).toThrow();expect(()=>record.bank!.freeze()).toThrow();record.lease.release();expect(record.released).toBe(1);f.worlds.clear();
 });
});
