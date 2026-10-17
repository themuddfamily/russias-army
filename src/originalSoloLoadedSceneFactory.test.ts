import * as THREE from 'three';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {OriginalSoloReceiverCurrentContext,OriginalSoloReceiverSceneContext} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloLoadedSceneFactoryOptions,OriginalSoloLoadedBanksChoice} from './originalSoloLoadedSceneFactory';
import {createOriginalSoloLoadedSceneFactory} from './originalSoloLoadedSceneFactory';

// Ownership composition is isolated here. Root's separate decoded-map cases
// exercise actual CURRENT, assembly, queries, reservations and Game consumers.
const calls=vi.hoisted(()=>({producers:[] as any[],assemblies:[] as any[],owners:[] as any[],failAssembly:false,failProducer:false}));
vi.mock('./originalSoloSceneAssembly',()=>{
 const acquire=(options:any,kind:string)=>{
  calls.assemblies.push({options,kind});if(calls.failAssembly)throw Error('assembly acquisition failed');
  const prefix={kind:'callback',sceneGeneration:options.banks.sceneGeneration,callback:0};
  const local={freeze:()=>({prefix,selectedWeapon:kind==='human'?'launcher':options.banks.weapon})},projectile={freeze:()=>({prefix,actors:[]})};
  const owner={kind,banks:{localWeaponWorld:local,projectileWorld:projectile,...(kind==='human'?{loadoutWorld:{freeze:()=>({prefix})},weaponReportWorld:{freeze:()=>({prefix})}}:{})},snapshotAt:vi.fn(()=>({models:[]})),release:vi.fn(),backends:{} as any};
  owner.backends={model:{},transient:{},...owner.banks,release:owner.release};calls.owners.push(owner);return owner;
 };
 return {createOriginalSoloSceneAssembly:(_collection:any,options:any)=>acquire(options,'human'),createOriginalSoloBotSceneAssembly:(_collection:any,options:any)=>acquire(options,'bot')};
});
vi.mock('../shared/originalSoloCurrentSceneProducer',()=>({createOriginalSoloCurrentSceneLease:(options:any)=>{
 calls.producers.push(options);if(calls.failProducer)throw Error('CURRENT lease failed');let backends:any,closed=false;
 const readBot=()=>({marker:'actual forwarded bot reader'});
 return Object.freeze({scene:{begin:()=>{if(closed)throw Error('released');return {}; }},captureCurrent:(context:any)=>{
  if(closed)throw Error('released');backends??=options.createBackends(context);
  const prefix={kind:'callback',sceneGeneration:context.lifeGeneration,callback:1};
  options.captureLocalWeaponCallback(context,prefix,backends.localWeaponWorld.freeze());
  if(options.captureLoadoutProgram)options.captureLoadoutProgram(context,{receipt:prefix,callback:prefix},{loadout:{}},[]);
  else options.captureBotProjectileProgram(context,{receipt:prefix,callback:prefix},backends.projectileWorld.freeze(),[]);
  return {blastClaims:[]};
 },finalizeCurrentCapture:(context:any,incoming:any)=>options.captureIncomingLaunches(context,{},incoming,backends.projectileWorld.freeze()),drainOutcomes:()=>[],readBotProjectileCommit:readBot,
 readLocalWeaponState:()=>backends?.localWeaponWorld.freeze(),release:()=>{if(closed)return;closed=true;backends?.release();}});
}}));
beforeEach(()=>{calls.producers=[];calls.assemblies=[];calls.owners=[];calls.failAssembly=false;calls.failProducer=false;});
afterEach(()=>vi.restoreAllMocks());
function registration(id='player',lifeGeneration=1):OriginalSoloReceiverSceneContext {
 return {id,name:id.toUpperCase(),lifeGeneration,epochMs:0,body:{id,position:{x:1,y:2,z:3},velocity:{x:0,y:0,z:0},supported:false},health:{} as never,barrels:{} as never};
}
function context(r:OriginalSoloReceiverSceneContext,weapon:'launcher'|'rpg'='rpg'):OriginalSoloReceiverCurrentContext {
 const observer={id:r.id,name:r.name,lifeGeneration:r.lifeGeneration,body:r.body,health:r.health,barrels:r.barrels,doors:r.doors,projectiles:new Map(),blasts:new Map(),actorNames:new Map(),callback:0,receiptTick:0,updatedAt:0,alive:true};
 return {observer,target:observer,...r,projectiles:observer.projectiles,blasts:observer.blasts,actorNames:observer.actorNames,mirrorCallback:0,physicalCallback:1,receiptTick:0,time:0,alive:true,phase:'physics',afterGoody:true,deliveryKind:'where',order:{callbacks:1,receiptCallbacks:0},weapon} as unknown as OriginalSoloReceiverCurrentContext;
}
function fixture(){
 const mapping=new THREE.Matrix4().toArray(),sample=vi.fn(()=>9),committed=vi.fn(()=>0);
 const local=vi.fn(()=>({cameraWorldMatrix:mapping,velocityWorld:{x:0,y:0,z:0},commands:[]})),human=vi.fn(()=>({receiptCommands:[],callbackCommands:[]})),bot=vi.fn(()=>({receiptCommands:[],callbackCommands:[],botLaunchAdmissions:[]})),incoming=vi.fn(()=>[]);
 const banksAt=vi.fn((r:OriginalSoloReceiverSceneContext):OriginalSoloLoadedBanksChoice=>({kind:r.id==='player'?'human':'bot',banks:{map:'barrack',sceneGeneration:r.lifeGeneration,sourceScale:.02,renderToWorld:mapping,weapon:'rpg'}} as unknown as OriginalSoloLoadedBanksChoice));
 const options={map:'barrack',collection:{resources:new Map()},resources:{actor:{sourceScale:.02},actorLifecycle:{readDropYawPlan:()=>{throw Error('caller reader must be replaced');}},transientBinding:{resources:{sourceScale:.02}},renderToWorld:mapping},inventory:{},producer:{sourceScale:.02,controller:{model:{dropRequestOwner:{foreign:true}},transient:{}},environment:{},goodyAt:()=>null},banksAt,readCommittedCallback:committed,sampleRandom36:sample,dropLimits:{maxEntries:8,maxTextChars:8192},programs:{human:{captureLocalWeaponCallback:local,captureLoadoutProgram:human},bot:{captureLocalWeaponCallback:local,captureBotProjectileProgram:bot}},captureIncomingLaunches:incoming} as unknown as OriginalSoloLoadedSceneFactoryOptions;
 return {options,sample,committed,local,human,bot,incoming,banksAt,mapping,factory:createOriginalSoloLoadedSceneFactory(options)};
}
describe('loaded per-life Solo scene factory composition',()=>{
 it('selects canonical human and bot CURRENT hooks before lazy acquisition and passes their actual owner',()=>{
  const f=fixture(),r=registration(),b=registration('bot-1'),humanLease=f.factory.createReceiverScene(r),botLease=f.factory.createReceiverScene(b),humanContext=context(r),botContext=context(b);
  try{
   expect(calls.assemblies).toEqual([]);expect(f.factory.readAssembly('player',1)).toBeUndefined();expect(calls.producers[0].captureLoadoutProgram).toBeTypeOf('function');expect(calls.producers[0].captureBotProjectileProgram).toBeUndefined();expect(calls.producers[1].captureLoadoutProgram).toBeUndefined();expect(calls.producers[1].captureBotProjectileProgram).toBeTypeOf('function');
   humanLease.captureCurrent!(humanContext);botLease.captureCurrent!(botContext);expect(calls.assemblies.map(row=>row.kind)).toEqual(['human','bot']);
   expect(f.human.mock.calls).toHaveLength(1);expect(f.bot.mock.calls).toHaveLength(1);expect(f.local.mock.calls).toHaveLength(2);
   expect((f.human.mock.calls[0] as unknown[]).at(-1)).toBe(calls.owners[0]);expect((f.bot.mock.calls[0] as unknown[]).at(-1)).toBe(calls.owners[1]);expect(f.factory.readAssembly('bot-1',1)).toBe(calls.owners[1]);expect(f.factory.readAssembly('bot-1',2)).toBeUndefined();
   humanLease.finalizeCurrentCapture!(humanContext,[]);expect((f.incoming.mock.calls[0] as unknown[])[0]).toBe(calls.owners[0]);expect(botLease.readBotProjectileCommit!()).toEqual({marker:'actual forwarded bot reader'});
   expect(calls.producers[0].controller.model.dropRequestOwner).not.toBe(f.options.producer.controller.model.dropRequestOwner);expect(calls.producers[0].controller.model.dropRequestOwner).not.toBe(calls.producers[1].controller.model.dropRequestOwner);
   const read=calls.assemblies[0].options.resources.actorLifecycle.readDropYawPlan;expect(()=>read('peer',1)).toThrow(/inactive.*request|Missing/);expect(f.sample).not.toHaveBeenCalled();expect(f.committed).not.toHaveBeenCalled();
  }finally{f.factory.release();}
 });
 it('bounds eight active lives, rejects duplicate registrations, and frees a slot when one lease releases',()=>{
  const f=fixture(),leases=Array.from({length:8},(_,i)=>f.factory.createReceiverScene(registration(`bot-${i}`)));
  try{expect(()=>f.factory.createReceiverScene(registration('bot-0',2))).toThrow(/already registered/);expect(()=>f.factory.createReceiverScene(registration('excess'))).toThrow(/life budget/);expect(calls.producers).toHaveLength(8);expect(f.banksAt).not.toHaveBeenCalled();leases[0].release();f.factory.createReceiverScene(registration('bot-0',2));expect(calls.producers).toHaveLength(9);}finally{f.factory.release();}
 });
 it('rejects shared live body, health and private map state before constructing a second CURRENT lease',()=>{
  const f=fixture(),first=registration('bot-1');f.factory.createReceiverScene(first);
  try{for(const field of ['body','health','barrels'] as const){const next=registration('bot-2');expect(()=>f.factory.createReceiverScene({...next,[field]:first[field]})).toThrow(/Aliased/);}expect(calls.producers).toHaveLength(1);expect(calls.assemblies).toEqual([]);}finally{f.factory.release();}
 });
 it.each(['id','life','body','target','observer','phase'] as const)('rejects foreign %s context before any assembly or program and retains the legitimate life',field=>{
  const f=fixture(),r=registration('bot-1'),lease=f.factory.createReceiverScene(r),c=context(r);
  const changes={id:{id:'foreign'},life:{lifeGeneration:2},body:{body:{...r.body}},target:{target:{...c.target}},observer:{observer:{...c.observer,body:{...r.body}}},phase:{phase:'goody'}};
  try{expect(()=>lease.captureCurrent!({...c,...changes[field]} as OriginalSoloReceiverCurrentContext)).toThrow(/context|callback/);expect(calls.assemblies).toEqual([]);expect(f.banksAt).not.toHaveBeenCalled();lease.captureCurrent!(c);expect(f.bot).toHaveBeenCalledOnce();}finally{f.factory.release();}
 });
 it.each([{kind:'human'},{map:'woodlands'},{sceneGeneration:2},{sourceScale:.03},{weapon:'rifle'},{renderToWorld:new THREE.Matrix4().makeTranslation(1,0,0).toArray()},{renderToWorld:Array(16)}])('rejects a foreign bank policy before assembly acquisition: %j',patch=>{
  const f=fixture(),r=registration('bot-1'),lease=f.factory.createReceiverScene(r),c=context(r);
  f.banksAt.mockImplementation(()=>({kind:('kind' in patch?patch.kind:'bot'),banks:{map:'barrack',sceneGeneration:1,sourceScale:.02,renderToWorld:f.mapping,weapon:'rpg',...patch}} as unknown as OriginalSoloLoadedBanksChoice));
  expect(()=>lease.captureCurrent!(c)).toThrow(/bank policy/);expect(calls.assemblies).toEqual([]);expect(f.factory.readAssembly(r.id,1)).toBeUndefined();expect(f.sample).not.toHaveBeenCalled();f.factory.release();
 });
 it('releases the exact cache and complete assembly once across lease and factory shutdown ordering',()=>{
  const f=fixture(),r=registration(),lease=f.factory.createReceiverScene(r);lease.captureCurrent!(context(r));const read=calls.assemblies[0].options.resources.actorLifecycle.readDropYawPlan;
  lease.release();lease.release();expect(calls.owners[0].release).toHaveBeenCalledOnce();expect(()=>read('peer',1)).toThrow(/unavailable/);expect(f.factory.readAssembly('player',1)).toBeUndefined();
  const next=registration('player',2),later=f.factory.createReceiverScene(next);later.captureCurrent!(context(next));f.factory.release();expect(()=>later.release()).not.toThrow();expect(()=>lease.release()).not.toThrow();f.factory.release();expect(calls.owners[1].release).toHaveBeenCalledOnce();expect(()=>f.factory.readAssembly('player',2)).toThrow(/released/);
 });
 it('closes acquisition/program failures without retaining a live cache or owner',()=>{
  const f=fixture(),r=registration('bot-1'),lease=f.factory.createReceiverScene(r);calls.failAssembly=true;expect(()=>lease.captureCurrent!(context(r))).toThrow('assembly acquisition failed');expect(f.factory.readAssembly(r.id,1)).toBeUndefined();expect(f.sample).not.toHaveBeenCalled();expect(()=>lease.release()).not.toThrow();
  calls.failAssembly=false;const next=registration('bot-1',2),later=f.factory.createReceiverScene(next);f.bot.mockImplementation(()=>{throw Error('program capture failed');});expect(()=>later.captureCurrent!(context(next))).toThrow('program capture failed');expect(calls.owners[0].release).toHaveBeenCalledOnce();const read=calls.assemblies[1].options.resources.actorLifecycle.readDropYawPlan;expect(()=>read('peer',1)).toThrow(/unavailable/);f.factory.release();
 });
 it('poisons caught reentry before acquisition and retires the rejected life',()=>{
  const f=fixture(),r=registration('bot-1'),lease=f.factory.createReceiverScene(r);f.banksAt.mockImplementation(()=>{expect(()=>f.factory.readAssembly(r.id,1)).toThrow(/operation active/);return {kind:'bot',banks:{map:'barrack',sceneGeneration:1,sourceScale:.02,renderToWorld:f.mapping,weapon:'rpg'}} as unknown as OriginalSoloLoadedBanksChoice;});
  expect(()=>lease.captureCurrent!(context(r))).toThrow(/unavailable/);expect(calls.assemblies).toEqual([]);expect(f.factory.readAssembly(r.id,1)).toBeUndefined();f.factory.release();
 });
 it('attempts every life cleanup after failure, closes caches and permits idempotent subsequent shutdown',()=>{
  const f=fixture(),ra=registration(),rb=registration('bot-1'),a=f.factory.createReceiverScene(ra),b=f.factory.createReceiverScene(rb);a.captureCurrent!(context(ra));b.captureCurrent!(context(rb));const failure=new Error('private owner cleanup');calls.owners[0].release.mockImplementation(()=>{throw failure;});
  expect(()=>f.factory.release()).toThrow(AggregateError);expect(calls.owners[0].release).toHaveBeenCalledOnce();expect(calls.owners[1].release).toHaveBeenCalledOnce();for(const row of calls.assemblies)expect(()=>row.options.resources.actorLifecycle.readDropYawPlan('peer',1)).toThrow(/unavailable/);expect(()=>a.release()).not.toThrow();expect(()=>b.release()).not.toThrow();expect(()=>f.factory.release()).not.toThrow();
 });
 it('captures mapping and producer scalars while leaving caller resource objects mutable and borrowed',()=>{
  const f=fixture();f.mapping[12]=90;(f.options.producer.controller.model as {eyeHeight:number}).eyeHeight=91;
  const r=registration('bot-1'),lease=f.factory.createReceiverScene(r);f.banksAt.mockImplementation(()=>({kind:'bot',banks:{map:'barrack',sceneGeneration:1,sourceScale:.02,renderToWorld:new THREE.Matrix4().toArray(),weapon:'rpg'}} as unknown as OriginalSoloLoadedBanksChoice));
  try{lease.captureCurrent!(context(r));expect(calls.assemblies[0].options.resources.renderToWorld[12]).toBe(0);expect(calls.producers[0].controller.model.eyeHeight).toBeUndefined();expect(f.options.resources.renderToWorld[12]).toBe(90);expect(Object.isFrozen(f.options.resources)).toBe(false);}finally{f.factory.release();}
 });
});
