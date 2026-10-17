import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions,type OriginalSoloAdmittedBang} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloReceiverSceneLease,type OriginalSoloEvent,type OriginalSoloReceiverCurrentContext} from './originalSoloObserverWorld';
import {advanceOriginalReceiverGunCallback} from './originalReceiverGunCallback';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {OriginalReceiverProjectileWorld} from './originalReceiverProjectileWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {WeaponId} from './protocol';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const counts=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
const owned=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
let cachedRuntime:OriginalMapRuntime|undefined;
const runtime=()=>cachedRuntime??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
type Program=NonNullable<OriginalSoloCurrentSceneProducerOptions['captureLoadoutProgram']>;
interface RecordState {lease:OriginalSoloReceiverSceneLease;loadout?:OriginalReceiverLoadoutWorld;local?:OriginalReceiverLocalWeaponWorld;projectiles?:OriginalReceiverProjectileWorld;calls:{context:OriginalSoloReceiverCurrentContext;admitted:readonly OriginalSoloAdmittedBang[]}[];previous:ReceiverLoadoutCheckpoint[];seeded:boolean;released:number;cleanupClosed?:boolean;pickupHandle?:string;pickupPosition?:Readonly<{x:number;y:number;z:number}>;modelReads:number;localCalls:number}
function fixture(config:{initialVoid?:boolean;program?:Program;newSlot?:boolean;projectiles?:boolean;extra?:Partial<OriginalSoloCurrentSceneProducerOptions>;seedLoadout?:(seed:ReceiverLoadoutCheckpoint)=>ReceiverLoadoutCheckpoint;onEvent?:(event:OriginalSoloEvent)=>void}={}){
 const records=new Map<string,RecordState>(),events:OriginalSoloEvent[]=[],r=runtime(),flags={missing:false};
 const defaultProgram:Program=(_context,prefixes,previous,admitted)=>({receiptCommands:admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast})),...(prefixes.callback?{callbackCommands:[{kind:'weapon-finish' as const},...(previous.loadout.score===10?[{kind:'ammo-pickup' as const,pickupId:1}]:[])]}:{})});
 const worlds=new OriginalSoloObserverWorlds(r,{onEvent:e=>{events.push(e);config.onEvent?.(e);},createReceiverScene:registration=>{
  const record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,calls:[],previous:[],seeded:false,released:0,modelReads:0,localCalls:0};records.set(registration.id,record);
  const selected=config.newSlot?'pistol':'rifle',pose:ReceiverModelPose={position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1,rotation:{x:0,y:0,z:0,w:1}};
  const options:OriginalSoloCurrentSceneProducerOptions={sourceScale:r.scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:32,maxOutcomes:32,maxModels:128,maxTextChars:65536},controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:128},createBackends:context=>{
   const prefix:ReceiverScenePrefix={kind:'callback',sceneGeneration:context.lifeGeneration,callback:0},seed:ReceiverLoadoutCheckpoint={prefix,map:'woodlands',selected,owned:{...owned(),...(config.newSlot?{rifle:false}:{})},ammo:{...counts(),[selected]:2},reserve:counts(),refillTarget:selected==='pistol'?8:28,counter:{waitgun:7,poldwaitgun:3},score:10,goldScore:123.5};record.loadout=new OriginalReceiverLoadoutWorld(config.seedLoadout?.(seed)??{...seed,...(config.initialVoid?{selected:null}:{})},{maxCommands:32,maxTextChars:8192,weaponModelPresent:owned()});
   const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix,cameraHandle:`camera:${context.id}`,cameraWorldMatrix:[...I],selectedWeapon:config.initialVoid?null:selected,loadedRocket:false,motion:{weapon:config.initialVoid?null:selected,ticker:1,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:handle===(selected==='pistol'?'pistol':'ak47'),worldMatrix:[...I],groupAncestry:['declared-local']}))};
   record.local=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:r.scale,maxCommands:64,maxTextChars:8192,bindModels:(op,state)=>({models:op.kind==='whichgun'?state.models.map(m=>m.handle==='rocket'?m:{...m,inWorld:op.weapon==='rifle'?m.handle==='ak47':op.weapon==='pistol'?m.handle==='pistol':false}):state.models,loadedRocket:state.loadedRocket})});
   if(config.projectiles)record.projectiles=new OriginalReceiverProjectileWorld({prefix,template:{handle:'grenade',resource:'rg6grenade',materialHandle:'explicit-template',inWorld:false,worldMatrix:[...I],groupAncestry:[]},catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]}},{maxModels:16,maxActors:8,maxCommands:32,maxTextChars:8192,rocketMaterialHandle:'explicit-rpg'});
   const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})};
   return {model,localWeaponWorld:record.local,loadoutWorld:record.loadout,...(record.projectiles?{projectileWorld:record.projectiles}:{}),transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},release:()=>{record.released++;let closed=0;for(const bank of [record.loadout,record.local,record.projectiles])if(bank)try{bank.freeze();}catch{closed++;}record.cleanupClosed=closed===(record.projectiles?3:2);}};
  },captureLocalWeaponCallback:()=>{record.localCalls++;return {cameraWorldMatrix:[...I],velocityWorld:{x:0,y:0,z:0},commands:[]};},captureLoadoutProgram:(context,prefixes,previous,admitted)=>{record.calls.push({context,admitted});record.previous.push(previous.loadout);expect(record.lease.readLoadoutState!()).toBe(previous.loadout);return config.program?config.program(context,prefixes,previous,admitted):defaultProgram(context,prefixes,previous,admitted);},goodyAt:context=>context.alive?{eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:50*r.scale,weapon:context.weapon!}:null,snapshotAt:prefix=>({prefix,models:[],missing:flags.missing?['unresolved-native-class']:[],provenance:'declared-empty-CPU-oracle'}),...config.extra};
  record.lease=createOriginalSoloCurrentSceneLease(options);
  // Authentic model-stage setup after admitted receipt: no invented registry.
  // Explicit 76 fade steps and pickup teleport are CPU adapter fixture seams.
  // Forced detonation counters/skipIds below do not prove native fuse/contact chronology.
  return {release:()=>record.lease.release(),captureCurrent:record.lease.captureCurrent!.bind(record.lease),drainOutcomes:record.lease.drainOutcomes!.bind(record.lease),drainLoadoutIntents:record.lease.drainLoadoutIntents!.bind(record.lease),readLoadoutState:()=>{record.modelReads++;return record.lease.readLoadoutState!();},readGunPhaseState:()=>record.lease.readGunPhaseState!(),scene:{begin:()=>{const tx=record.lease.scene.begin();let created=false;return {...tx,applyExternalReceipt:(tick:number,callback:number)=>{tx.applyExternalReceipt(tick,callback);if(!record.seeded){const eye=originalPlayerEye(record.calls.at(-1)!.context.body),feet={x:eye.x,y:eye.y-1,z:eye.z},birth=(id:string)=>({actorId:id,targetFeet:feet,targetYaw:0,callback}),actor={position:feet,yaw:0,motionTime:100,weapon:'rifle' as const};tx.birth(birth('fixture-old'));tx.beforeCallback('fixture-old',actor);tx.detach('fixture-old',actor,callback);for(let i=0;i<76;i++)tx.advanceCorpses();tx.birth(birth('fixture-holder'));tx.beforeCallback('fixture-holder',actor);tx.afterCallback('fixture-holder',{...actor,position:{...feet,x:feet.x+100}});tx.beforeCallback('fixture-holder',actor);const pickup=tx.freezeActorRegistry().pickups[0];record.pickupHandle=pickup.handle;record.pickupPosition=pickup.position;expect(tx.freezeActorRegistry().models.find(m=>m.handle===pickup.handle)!.pose.position.x).toBe(feet.x+100);created=true;}},prepareCommit:()=>{const publish=tx.prepareCommit();return()=>{publish();if(created)record.seeded=true;};}};}}};
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon=config.newSlot?'pistol':'rifle';b.weapon=a.weapon;a.health.canonical=1000;b.health.canonical=1000;
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const w of worlds.worlds.values())if(w.alive)worlds.goody(w.id);return time;},cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 return {worlds,a,b,records,events,flags,physical,cycle,defaultProgram};
}

describe('owned solo loadout producer (declared CPU oracle and authentic model-stage pickup)',()=>{
 it('admits explicitly present VOID goody only with an actual committed VOID loadout',()=>{
  const f=fixture({initialVoid:true,program:(_c,p)=>({receiptCommands:[],...(p.callback?{callbackCommands:[{kind:'weapon-finish' as const}]}:{})}),extra:{goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:1,weapon:null}:null}});
  try{f.cycle(1);for(const record of f.records.values()){expect(record.loadout!.freeze().selected).toBeNull();expect(record.local!.freeze().motion.weapon).toBeNull();expect(record.local!.freeze().motion.ticker).toBe(1);expect(record.local!.freeze().models.find(model=>model.handle==='ak47')!.inWorld).toBe(true);}expect(f.a.loadout!.prefix.callback).toBe(1);}finally{f.worlds.clear();}
 });
 it('rejects explicit VOID goody paired with an armed committed loadout before capture hooks',()=>{
  const capture=vi.fn<Program>(()=>({receiptCommands:[],callbackCommands:[]})),f=fixture({program:capture,extra:{goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:1,weapon:null}:null}});
  try{const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow('VOID goody requires committed VOID loadout');expect(capture).not.toHaveBeenCalled();expect(f.a.callback).toBe(0);expect(f.events).toEqual([]);}finally{f.worlds.clear();}
 });

 it('captures once per life/callback and publishes actual committed score/ammo state before separate loadout outputs',()=>{
  const f=fixture();f.cycle(1);const record=f.records.get('A')!;expect(record.calls).toHaveLength(1);expect(record.localCalls).toBe(1);expect(record.loadout!.freeze()).toMatchObject({score:15,ammo:{rifle:28},reserve:{rifle:24},counter:{waitgun:30,poldwaitgun:3}});expect(f.a.loadout).toEqual(record.loadout!.freeze());const stateIndex=f.events.findIndex(e=>e.kind==='loadout-state'&&e.recipientId==='A'),outputIndex=f.events.findIndex(e=>e.kind==='loadout-output'&&e.recipientId==='A');expect(stateIndex).toBeGreaterThanOrEqual(0);expect(outputIndex).toBeGreaterThan(stateIndex);expect(f.events.filter(e=>e.kind==='loadout-output'&&e.recipientId==='A')).toHaveLength(2);f.cycle(2);expect(record.calls).toHaveLength(2);expect(record.loadout!.freeze().score).toBe(15);expect(record.previous[1].score).toBe(15);f.worlds.clear();
 });
 it('adopts new-slot selection before callbacks and uses it as the next capture weapon without deriving state from feedback',()=>{
  const f=fixture({newSlot:true});f.cycle(1);expect(f.a.weapon).toBe('rifle');expect(f.a.loadout).toMatchObject({selected:'rifle',owned:{rifle:true},score:15,ammo:{rifle:28},reserve:{rifle:22}});f.cycle(2);expect(f.records.get('A')!.calls[1].context.weapon).toBe('rifle');expect(f.events.flatMap(e=>e.kind==='loadout-output'&&e.recipientId==='A'&&e.intent.kind==='feedback'?[e.intent.message]:[])).toEqual(['You have the ak47!']);f.worlds.clear();
 });
 it('rolls back every receiver on a later mirror failure and reuses captured commands without recalling either hook',()=>{
  const f=fixture(),time=f.physical(1),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later loadout receiver failed');});expect(()=>f.worlds.completeGoody(time)).toThrow('later loadout receiver failed');const record=f.records.get('A')!;expect(record.loadout!.freeze().score).toBe(10);expect(record.seeded).toBe(false);expect(f.a.loadout).toBeUndefined();const calls=record.calls.length,localCalls=record.localCalls;failure.mockRestore();f.worlds.completeGoody(time);expect(record.calls).toHaveLength(calls);expect(record.localCalls).toBe(localCalls);expect(record.loadout!.freeze().score).toBe(15);expect(f.events.filter(e=>e.kind==='loadout-output'&&e.recipientId==='A')).toHaveLength(2);f.worlds.clear();
 });
 it('captures a death receipt program with no physical motion age or camera recall',()=>{
  const f=fixture();f.cycle(1);const record=f.records.get('A')!,before=record.local!.freeze(),calls=record.calls.length,cameraCalls=record.localCalls;f.worlds.dispose('B');expect(record.calls).toHaveLength(calls+1);expect(record.calls.at(-1)!.context.deliveryKind).toBe('death');expect(record.localCalls).toBe(cameraCalls);expect(record.local!.freeze().models).toEqual(before.models);expect(record.local!.freeze().motion).toEqual(before.motion);expect(record.loadout!.freeze().score).toBe(15);expect(f.events.filter(e=>e.kind==='loadout-output'&&e.recipientId==='A')).toHaveLength(2);f.worlds.clear();
 });
 it('combines exact automatic bang markers with the loadout-owned program when a projectile bank is also owned',()=>{
  const f=fixture({projectiles:true});expect(f.worlds.launch({ownerId:'A',weapon:'rpg',eye:originalPlayerEye(f.a.body),direction:{x:1,y:0,z:0}},0).ok).toBe(true);const time=f.physical(1);f.worlds.completeGoody(time);for(const w of f.worlds.worlds.values())for(const p of w.projectiles.values())p.state.remainingCallbacks=1;f.worlds.actors(time);f.cycle(2);const record=f.records.get('A')!;expect(record.calls[1].admitted).toHaveLength(1);expect(record.projectiles!.freeze().catalog).toEqual([]);expect(f.a.health.canonical).toBe(995);expect(record.loadout!.freeze().score).toBe(15);expect(f.events.filter(e=>e.kind==='damaged'&&e.recipientId==='A')).toHaveLength(1);f.worlds.clear();
 });
 it('rejects unpaired or conflicting program owners and releases every owned bank before backend cleanup',()=>{
  const missing=fixture({extra:{captureLoadoutProgram:undefined}}),time=missing.physical(1);expect(()=>missing.worlds.completeGoody(time)).toThrow('Unpaired');const record=missing.records.get('A')!;expect(record.released).toBe(1);expect(record.cleanupClosed).toBe(true);record.lease.release();expect(record.released).toBe(1);missing.worlds.clear();expect(()=>fixture({extra:{captureProjectileProgram:()=>({receiptCommands:[],callbackCommands:[]})}})).toThrow('producer options');
 });
 it('preflights hostile command cardinality and fail-closes caught output-drain reentry during program capture',()=>{
  let reads=0;const oversized=new Array(33);Object.defineProperty(oversized,0,{get:()=>{reads++;throw Error('entry read');}});const f=fixture({program:()=>({receiptCommands:oversized,callbackCommands:[]})}),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow('budget');expect(reads).toBe(0);expect(f.records.get('A')!.cleanupClosed).toBe(true);f.worlds.clear();
  let drain=()=>{};const reentrant=fixture({program:(_c,p)=>{try{drain();}catch{/* A caught nested drain must not admit the returned plan. */}return {receiptCommands:[],...(p.callback?{callbackCommands:[]}:{})};}});drain=()=>{reentrant.records.get('A')!.lease.drainLoadoutIntents!();};const n=reentrant.physical(1);expect(()=>reentrant.worlds.completeGoody(n)).toThrow();expect(reentrant.records.get('A')!.released).toBe(1);reentrant.worlds.clear();
 });
 it('retains independent missing evidence on retry and releases isolated private owners before clear/re-register',()=>{
  const f=fixture(),time=f.physical(1);f.flags.missing=true;expect(()=>f.worlds.completeGoody(time)).toThrow('Incomplete receiver external');const record=f.records.get('A')!,calls=record.calls.length;expect(record.loadout!.freeze().score).toBe(10);f.flags.missing=false;f.worlds.completeGoody(time);expect(record.calls).toHaveLength(calls);expect(record.loadout!.freeze().score).toBe(15);const old=record.loadout;f.worlds.clear();expect(record.cleanupClosed).toBe(true);const replacement=f.worlds.register({id:'A',name:'NewAlpha',eye:{x:1000,y:1000,z:1000}});replacement.weapon='rifle';f.cycle(1);expect(f.records.get('A')!.loadout).not.toBe(old);expect(replacement.loadout!.score).toBe(15);f.worlds.clear();
 });
});

// These programs exercise the real helper → producer → scene joint commit →
// coordinator publication. Geometry/actor setup remains the declared CPU fixture
// above; no production factory, shot admission or native pickup timing is proved.
const gunBlank={typing:false,reload:false,fire:false,digits:[false,false,false,false,false,false] as const};
function stagedGunProgram(options:{fire?:boolean;choosePistol?:boolean;pickup?:boolean}={}):Program {
 return (_context,prefixes,previous,admitted)=>{
  const receiptCommands=admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));
  if(!prefixes.callback)return {receiptCommands};
  const gunPhase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:prefixes.callback,held:{...gunBlank,fire:options.fire??false,digits:options.choosePistol?[true,false,false,false,false,false]:gunBlank.digits},weaponModelPresent:owned()});
  const modelCommands=gunPhase.intents.flatMap((intent):ReceiverCurrentEnvironmentCommand[]=>{
   if(intent.kind==='sortweapons')return [{kind:'weapon-whichgun',weapon:intent.weapon}];
   if(intent.kind==='load-pose')return [{kind:'weapon-reload'}];
   if(intent.kind==='recoil-pose')return [{kind:'weapon-fire'}];
   if(intent.kind==='rocket-remove')return [{kind:'weapon-rocket',loadedRocket:false}];
   if(intent.kind==='rocket-parent')return [{kind:'weapon-rocket',loadedRocket:true}];
   return [];
  });
  return {receiptCommands,gunPhase,callbackCommands:[{kind:'loadout-capture',checkpoint:gunPhase.checkpoint},...modelCommands,{kind:'weapon-finish'},...(options.pickup?[{kind:'ammo-pickup' as const,pickupId:1}]:[])]};
 };
}

describe('jointly committed saved gun phase (explicit CPU programs)',()=>{
 it('keeps a consumed old-slot firing gate separate from final selection and counts',()=>{
  const f=fixture({seedLoadout:s=>({...s,counter:{waitgun:0,poldwaitgun:0},ammo:{...s.ammo,pistol:8}}),program:stagedGunProgram({fire:true,choosePistol:true})});
  f.cycle(1);const record=f.records.get('A')!,capture=record.lease.readGunPhaseState!();
  expect(capture).toMatchObject({prefix:{kind:'callback',sceneGeneration:f.a.lifeGeneration,callback:1},phase:{weapon:'rifle',bullets:2,ready:true,counter:{waitgun:-1,poldwaitgun:0}}});
  expect(f.a.gunPhase).toEqual(capture);expect(f.a.loadout).toMatchObject({selected:'pistol',ammo:{rifle:1,pistol:8},counter:{waitgun:2,poldwaitgun:0}});
  const loadoutIndex=f.events.findIndex(e=>e.kind==='loadout-state'&&e.recipientId==='A'),phaseIndex=f.events.findIndex(e=>e.kind==='gun-phase-state'&&e.recipientId==='A');expect(loadoutIndex).toBeLessThan(phaseIndex);
  expect(Object.isFrozen(capture)).toBe(true);expect(Object.isFrozen(capture!.phase)).toBe(true);f.worlds.clear();
 });
 it('retains the pre-pickup gate while the same callback pickup reloads final counts and counter',()=>{
  const f=fixture({seedLoadout:s=>({...s,counter:{waitgun:0,poldwaitgun:0}}),program:stagedGunProgram({fire:true,pickup:true})});f.cycle(1);
  expect(f.a.gunPhase?.phase).toMatchObject({weapon:'rifle',bullets:2,ready:true,counter:{waitgun:-1,poldwaitgun:0}});
  expect(f.a.loadout).toMatchObject({score:15,ammo:{rifle:28},reserve:{rifle:23},counter:{waitgun:30,poldwaitgun:0}});
  const phaseIndex=f.events.findIndex(e=>e.kind==='gun-phase-state'&&e.recipientId==='A'),audioIndex=f.events.findIndex(e=>e.kind==='loadout-output'&&e.recipientId==='A');expect(phaseIndex).toBeLessThan(audioIndex);f.worlds.clear();
 });
 it('publishes nothing on joint failure and retries the exact once-captured gun result',()=>{
  const f=fixture({seedLoadout:s=>({...s,counter:{waitgun:0,poldwaitgun:0}}),program:stagedGunProgram({fire:true})});const time=f.physical(1),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('gun-phase later receiver failed');});
  expect(()=>f.worlds.completeGoody(time)).toThrow('gun-phase later receiver failed');const record=f.records.get('A')!;
  expect(record.lease.readGunPhaseState!()).toBeUndefined();expect(f.a.gunPhase).toBeUndefined();expect(record.loadout!.freeze().ammo.rifle).toBe(2);expect(f.events.filter(e=>e.kind==='gun-phase-state')).toEqual([]);
  const calls=record.calls.length;failure.mockRestore();f.worlds.completeGoody(time);expect(record.calls).toHaveLength(calls);expect(f.a.loadout!.ammo.rifle).toBe(1);expect(f.events.filter(e=>e.kind==='gun-phase-state'&&e.recipientId==='A')).toHaveLength(1);f.worlds.clear();
 });
 it('clears saved callback metadata on a death receipt without retagging or rerunning gun input',()=>{
  const f=fixture({program:stagedGunProgram()});f.cycle(1);const record=f.records.get('A')!,calls=record.calls.length;expect(f.a.gunPhase?.prefix.kind).toBe('callback');f.worlds.dispose('B');
  expect(record.calls).toHaveLength(calls+1);expect(record.calls.at(-1)!.context.deliveryKind).toBe('death');expect(record.lease.readGunPhaseState!()).toBeUndefined();expect(f.a.gunPhase).toBeUndefined();expect(f.events.filter(e=>e.kind==='gun-phase-state'&&e.recipientId==='A')).toHaveLength(1);f.worlds.clear();
 });
 it('clears optional phase ownership on a subsequent callback with no staged gun result',()=>{
  const program=stagedGunProgram(),f=fixture({program:(context,prefixes,previous,admitted)=>{
   if(prefixes.callback?.callback===1)return program(context,prefixes,previous,admitted);
   return {receiptCommands:admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast})),...(prefixes.callback?{callbackCommands:[{kind:'weapon-finish' as const}]}:{})};
  }});f.cycle(1);expect(f.a.gunPhase).toBeDefined();f.cycle(2);expect(f.a.gunPhase).toBeUndefined();expect(f.records.get('A')!.lease.readGunPhaseState!()).toBeUndefined();f.worlds.clear();
 });
 it('preserves explicit null phase for a typed callback instead of fabricating readiness',()=>{
  const f=fixture({program:(_context,prefixes,previous,admitted)=>{
   const receiptCommands=admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));if(!prefixes.callback)return {receiptCommands};
   const gunPhase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:prefixes.callback,held:{...gunBlank,typing:true},weaponModelPresent:owned()});return {receiptCommands,gunPhase,callbackCommands:[{kind:'loadout-capture',checkpoint:gunPhase.checkpoint},{kind:'weapon-finish'}]};
  }});f.cycle(1);expect(f.a.gunPhase).toMatchObject({phase:null});expect(f.a.loadout!.counter.waitgun).toBe(6);f.worlds.clear();
 });
});

describe('staged gun program association rejects unsafe publication',()=>{
 it('accepts explicit empty admissions for a nonexplosive callback without a projectile bank',()=>{
  const base=stagedGunProgram(),f=fixture({program:(context,prefixes,previous,admitted)=>{
   const program=base(context,prefixes,previous,admitted);return prefixes.callback?{...program,launchAdmissions:[]}:program;
  }});try{f.cycle(1);expect(f.a.gunPhase?.phase?.weapon).toBe('rifle');expect(f.records.get('A')!.projectiles).toBeUndefined();expect(f.worlds.launches.size).toBe(0);}finally{f.worlds.clear();}
 });
 it.each(['missing','duplicate','after-finish','after-pickup','different-capture','after-exact','foreign-prefix'] as const)('rejects %s gun/loadout association before publishing',mode=>{
  const f=fixture({program:(_context,prefixes,previous,admitted)=>{
   const receiptCommands=admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));if(!prefixes.callback)return {receiptCommands};
   const result=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:prefixes.callback,held:gunBlank,weaponModelPresent:owned()});
   const gunPhase=mode==='foreign-prefix'?{...result,checkpoint:{...result.checkpoint,prefix:{...prefixes.callback,sceneGeneration:prefixes.callback.sceneGeneration+1}}}:result;
   const capture={kind:'loadout-capture' as const,checkpoint:mode==='different-capture'?{...result.checkpoint}:result.checkpoint},finish={kind:'weapon-finish' as const};
   const callbackCommands=mode==='missing'?[finish]:mode==='duplicate'?[capture,capture,finish]:mode==='after-finish'?[finish,capture]:mode==='after-pickup'?[{kind:'ammo-pickup' as const,pickupId:1},capture,finish]:mode==='after-exact'?[capture,{kind:'loadout-capture' as const,checkpoint:{...result.checkpoint}},finish]:[capture,finish];
   return {receiptCommands,gunPhase,callbackCommands};
  }});const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow(/gun|Gun|loadout capture/);
  expect(f.a.gunPhase).toBeUndefined();expect(f.a.loadout).toBeUndefined();expect(f.events.filter(e=>e.kind==='gun-phase-state')).toEqual([]);f.worlds.clear();
 });
 it('snapshots saved metadata once before rollback and does not reread mutable caller aliases on retry',()=>{
  let mutable:{weapon:WeaponId;bullets:number;ready:boolean;counter:{waitgun:number;poldwaitgun:number}}|undefined;
  const f=fixture({program:(_context,prefixes,previous,admitted)=>{
   const receiptCommands=admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));if(!prefixes.callback)return {receiptCommands};
   const result=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:prefixes.callback,held:gunBlank,weaponModelPresent:owned()});
   const captured={...result.gunPhase!,counter:{...result.gunPhase!.counter}};if(_context.id==='A')mutable=captured;
   return {receiptCommands,gunPhase:{...result,gunPhase:captured},callbackCommands:[{kind:'loadout-capture',checkpoint:result.checkpoint},{kind:'weapon-finish'}]};
  }});const time=f.physical(1),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('mutable gun retry');});expect(()=>f.worlds.completeGoody(time)).toThrow('mutable gun retry');
  mutable!.weapon='pistol';mutable!.bullets=999;mutable!.ready=true;mutable!.counter.waitgun=-100;
  failure.mockRestore();f.worlds.completeGoody(time);expect(f.a.gunPhase?.phase).toMatchObject({weapon:'rifle',bullets:2,ready:false,counter:{waitgun:6,poldwaitgun:3}});f.worlds.clear();
 });
});

describe('saved gun phase post-commit delivery and life ownership',()=>{
 it('keeps all receivers committed when a gun-state listener throws and does not replay that consumed shot',()=>{
  let failed=false;
  const f=fixture({seedLoadout:s=>({...s,counter:{waitgun:0,poldwaitgun:0}}),program:stagedGunProgram({fire:true}),onEvent:event=>{if(event.kind==='gun-phase-state'&&event.recipientId==='A'&&!failed){failed=true;throw Error('gun listener failed');}}});
  const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow(/committed callback dispatch failed/);
  expect(f.a.loadout!.ammo.rifle).toBe(1);expect(f.b.loadout!.ammo.rifle).toBe(1);expect(f.a.gunPhase?.prefix.callback).toBe(1);expect(f.b.gunPhase?.prefix.callback).toBe(1);
  expect(f.events.filter(e=>e.kind==='gun-phase-state'&&e.recipientId==='B')).toHaveLength(1);f.worlds.actors(time);f.cycle(2);
  expect(f.a.loadout!.ammo.rifle).toBe(1);expect(f.events.filter(e=>e.kind==='gun-phase-state'&&e.recipientId==='A'&&e.checkpoint.prefix.callback===1)).toHaveLength(1);f.worlds.clear();
 });
 it('never carries a prior life gate into a replacement registration with the same id',()=>{
  const f=fixture({program:stagedGunProgram()});f.cycle(1);const old=f.a,lease=f.records.get('A')!.lease;expect(old.gunPhase).toBeDefined();f.worlds.dispose('A');
  const fresh=f.worlds.register({id:'A',name:'AlphaAgain',eye:{x:1000,y:1000,z:1000}},1/30);expect(fresh.lifeGeneration).toBe(old.lifeGeneration+1);expect(fresh.gunPhase).toBeUndefined();expect(fresh.loadout).toBeUndefined();expect(()=>lease.readGunPhaseState!()).toThrow(/released/);f.worlds.clear();
 });
});
