import * as THREE from 'three';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from '../shared/originalSoloCurrentSceneProducer';
import type {OriginalSoloReceiverSceneContext,OriginalSoloReceiverCurrentContext,OriginalSoloReceiverSceneLease} from '../shared/originalSoloObserverWorld';
import type {OriginalWeaponCounterMap} from '../shared/originalWeaponCounter';
import type {ReceiverPickupHistorySource} from '../shared/originalReceiverPickupHistory';
import type {OriginalWeaponCollection} from './originalWeapons';
import {createOriginalSoloSceneAssembly,createOriginalSoloBotSceneAssembly,type OriginalSoloSceneAssemblyOptions} from './originalSoloSceneAssembly';
import type {OriginalSoloFreshBanksOptions,OriginalSoloFreshBotBanksOptions} from './originalSoloFreshBanks';
import {createOriginalSoloActorDropCapture} from './originalSoloActorDropCapture';

export type OriginalSoloLoadedHumanAssembly=ReturnType<typeof createOriginalSoloSceneAssembly>;
export type OriginalSoloLoadedBotAssembly=ReturnType<typeof createOriginalSoloBotSceneAssembly>;
export type OriginalSoloLoadedAssembly=OriginalSoloLoadedHumanAssembly|OriginalSoloLoadedBotAssembly;
type WithoutDrop<T>=T extends unknown?Omit<T,'readDropYawPlan'>&{readonly readDropYawPlan?:T extends {readDropYawPlan:infer F}?F:never}:never;
type LoadedResources<T>=T extends {actorLifecycle:infer L}?Omit<T,'actorLifecycle'>&{readonly actorLifecycle:WithoutDrop<L>}:never;
type HookWithOwner<F,A>=F extends (...args:infer P)=>infer R?(...args:[...P,A])=>R:never;
type Producer=OriginalSoloCurrentSceneProducerOptions;
export type OriginalSoloLoadedBanksChoice=Readonly<{kind:'human';banks:OriginalSoloFreshBanksOptions}>|Readonly<{kind:'bot';banks:OriginalSoloFreshBotBanksOptions}>;
export interface OriginalSoloLoadedSceneFactoryOptions {
 readonly map:OriginalWeaponCounterMap;readonly collection:OriginalWeaponCollection;
 readonly resources:LoadedResources<OriginalSoloSceneAssemblyOptions['resources']>;
 readonly inventory:OriginalSoloSceneAssemblyOptions['inventory'];
 readonly producer:Omit<Producer,'createBackends'|'captureLocalWeaponCallback'|'captureLoadoutProgram'|'captureProjectileProgram'|'captureBotProjectileProgram'|'captureIncomingLaunches'|'snapshotAt'>;
 readonly banksAt:(registration:OriginalSoloReceiverSceneContext,firstContext:OriginalSoloReceiverCurrentContext)=>OriginalSoloLoadedBanksChoice;
 /** One externally owned logical history source per registered life. Capture
  * retries reuse it; release never manufactures a replacement empty history. */
 readonly pickupHistorySourceAt?:(registration:OriginalSoloReceiverSceneContext)=>ReceiverPickupHistorySource;
 readonly pickupContinuationAt?:(registration:OriginalSoloReceiverSceneContext)=>ReturnType<Producer['createBackends']>['pickupContinuationAt'];
 readonly readCommittedCallback:(registration:OriginalSoloReceiverSceneContext)=>number;
 readonly sampleRandom36:(registration:OriginalSoloReceiverSceneContext)=>number;
 readonly dropLimits:Readonly<{maxEntries:number;maxTextChars:number}>;
 readonly programs:Readonly<{
  human:Readonly<{captureLocalWeaponCallback:HookWithOwner<NonNullable<Producer['captureLocalWeaponCallback']>,OriginalSoloLoadedHumanAssembly>;captureLoadoutProgram:HookWithOwner<NonNullable<Producer['captureLoadoutProgram']>,OriginalSoloLoadedHumanAssembly>}>;
  bot:Readonly<{captureLocalWeaponCallback:HookWithOwner<NonNullable<Producer['captureLocalWeaponCallback']>,OriginalSoloLoadedBotAssembly>;captureBotProjectileProgram:HookWithOwner<NonNullable<Producer['captureBotProjectileProgram']>,OriginalSoloLoadedBotAssembly>}>;
 }>;
 readonly captureIncomingLaunches:(owner:OriginalSoloLoadedAssembly,...args:Parameters<NonNullable<Producer['captureIncomingLaunches']>>)=>ReturnType<NonNullable<Producer['captureIncomingLaunches']>>;
}
export interface OriginalSoloLoadedSceneFactory {
 createReceiverScene(registration:OriginalSoloReceiverSceneContext):OriginalSoloReceiverSceneLease;
 readAssembly(id:string,lifeGeneration:number):OriginalSoloLoadedAssembly|undefined;
 release():void;
}
/** Explicit loaded-resource composition, not automatic Game activation. Exact
 * id 'player' selects human capture; every other registered life selects authored
 * bot capture. Programs, constructor/material/membership policies and stochastic
 * operands remain supplied by the caller. Each actual CURRENT lease lazily owns
 * its complete assembly and exact-detach cache; immutable assets stay borrowed. */
export function createOriginalSoloLoadedSceneFactory(options:OriginalSoloLoadedSceneFactoryOptions):OriginalSoloLoadedSceneFactory {
 if(!options)throw Error('Missing loaded Solo factory options');
 const {map,collection,inventory,banksAt,readCommittedCallback,sampleRandom36,captureIncomingLaunches,pickupHistorySourceAt,pickupContinuationAt}=options;
 const raw=options.resources,p=options.producer,drop=options.dropLimits,human=options.programs?.human,bot=options.programs?.bot;
 if(!['barrack','woodlands'].includes(map)||!collection||!raw?.actor||!raw.actorLifecycle||!inventory||!p?.controller?.model||!p.environment||typeof p.goodyAt!=='function'
  ||![banksAt,readCommittedCallback,sampleRandom36,captureIncomingLaunches,human?.captureLocalWeaponCallback,human?.captureLoadoutProgram,bot?.captureLocalWeaponCallback,bot?.captureBotProjectileProgram].every(fn=>typeof fn==='function')
  ||pickupHistorySourceAt!==undefined&&typeof pickupHistorySourceAt!=='function'
  ||pickupContinuationAt!==undefined&&(typeof pickupContinuationAt!=='function'||!pickupHistorySourceAt)
  ||!drop||!Number.isSafeInteger(drop.maxEntries)||drop.maxEntries<1||drop.maxEntries>256||!Number.isSafeInteger(drop.maxTextChars)||drop.maxTextChars<1||drop.maxTextChars>65536)throw Error('Invalid loaded Solo factory policies');
 const scale=p.sourceScale,maxEntries=drop.maxEntries,maxTextChars=drop.maxTextChars,mapping=raw.renderToWorld;
 if(!Number.isFinite(scale)||scale<=0||raw.actor.sourceScale!==scale||raw.transientBinding?.resources?.sourceScale!==scale||!Array.isArray(mapping)||mapping.length!==16||mapping.some(n=>!Number.isFinite(n))||mapping[3]!==0||mapping[7]!==0||mapping[11]!==0||mapping[15]!==1)throw Error('Invalid loaded Solo factory resource mapping/scale');
 const determinant=new THREE.Matrix4().fromArray(mapping).determinant();if(!Number.isFinite(determinant)||determinant===0)throw Error('Invalid loaded Solo factory resource mapping/scale');
 const renderToWorld=Object.freeze([...mapping]);
 const resources={...raw,renderToWorld,actor:{...raw.actor},actorLifecycle:{...raw.actorLifecycle}};
 const producer={...p,environment:{...p.environment},controller:{...p.controller,model:{...p.controller.model},transient:{...p.controller.transient}}};
 const humanLocal=human!.captureLocalWeaponCallback,humanProgram=human!.captureLoadoutProgram,botLocal=bot!.captureLocalWeaponCallback,botProgram=bot!.captureBotProjectileProgram;
 type Life={registration:OriginalSoloReceiverSceneContext;lease?:OriginalSoloReceiverSceneLease;owner?:OriginalSoloLoadedAssembly;pickupHistorySource?:ReceiverPickupHistorySource;pickupContinuation?:ReturnType<Producer['createBackends']>['pickupContinuationAt'];cache:ReturnType<typeof createOriginalSoloActorDropCapture>;observer?:OriginalSoloReceiverCurrentContext['observer'];closed:boolean;failed:boolean};
 const active=new Map<string,Life>();let closed=false,busy:Life|undefined;
 const check=()=>{if(closed)throw Error('Loaded Solo factory released');if(busy){busy.failed=true;throw Error('Loaded Solo factory operation active');}};
 const key=(id:string,life:number)=>{if(typeof id!=='string'||!id||id.trim()!==id||id.length>maxTextChars||!Number.isSafeInteger(life)||life<1)throw Error('Invalid loaded Solo life key');};
 const checkLife=(life:Life)=>{if(closed||life.closed||life.failed||active.get(life.registration.id)!==life)throw Error('Loaded Solo life unavailable');};
 const releaseOwned=(life:Life)=>{
  if(life.closed)return;life.closed=true;if(active.get(life.registration.id)===life)active.delete(life.registration.id);
  const errors:unknown[]=[];try{life.owner?.release();}catch(error){errors.push(error);}try{life.cache.release();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Loaded Solo owned resources release failed');
 };
 const releaseLife=(life:Life)=>{
  if(life.closed)return;const errors:unknown[]=[];try{life.lease?.release();}catch(error){errors.push(error);}try{releaseOwned(life);}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Loaded Solo life release failed');
 };
 const run=<T>(life:Life,operation:()=>T):T=>{
  check();checkLife(life);busy=life;
  try{const result=operation();checkLife(life);return result;}finally{busy=undefined;}
 };
 const validateContext=(life:Life,c:OriginalSoloReceiverCurrentContext)=>{
  const r=life.registration,w=c?.observer;
  if(!c||!w||c.target!==w||c.id!==r.id||c.name!==r.name||c.lifeGeneration!==r.lifeGeneration||w.id!==r.id||w.lifeGeneration!==r.lifeGeneration
   ||c.body!==r.body||c.health!==r.health||c.barrels!==r.barrels||c.doors!==r.doors||w.body!==r.body||w.health!==r.health||w.barrels!==r.barrels||w.doors!==r.doors
   ||c.projectiles!==w.projectiles||c.blasts!==w.blasts||c.actorNames!==w.actorNames||c.mirrorCallback!==w.callback||c.receiptTick!==w.receiptTick||c.time!==w.updatedAt||c.alive!==w.alive
   ||life.observer!==undefined&&life.observer!==w)throw Error('Foreign loaded Solo CURRENT context');
  if(c.deliveryKind==='where'&&(c.phase!=='physics'||!c.afterGoody||!c.alive||c.order.callbacks!==w.callback+1||c.order.receiptCallbacks!==w.callback))throw Error('Invalid loaded Solo living callback');
  if(c.deliveryKind!=='where'&&c.deliveryKind!=='death')throw Error('Invalid loaded Solo delivery kind');
 };
 const createReceiverScene=(registration:OriginalSoloReceiverSceneContext):OriginalSoloReceiverSceneLease=>{
  check();if(!registration)throw Error('Missing loaded Solo registration');key(registration.id,registration.lifeGeneration);
  if(typeof registration.name!=='string'||!registration.name||registration.id.length+registration.name.length>maxTextChars||!Number.isFinite(registration.epochMs)||registration.epochMs<0||!registration.body||!registration.health||!registration.barrels)throw Error('Invalid loaded Solo registration');
  if(active.has(registration.id))throw Error('Loaded Solo life already registered');if(active.size>=8)throw Error('Loaded Solo active life budget exceeded');
  for(const life of active.values()){const old=life.registration;if(registration.body===old.body||registration.health===old.health||registration.barrels===old.barrels||registration.doors!==undefined&&registration.doors===old.doors)throw Error('Aliased loaded Solo mutable registration');}
  const r=Object.freeze({id:registration.id,name:registration.name,lifeGeneration:registration.lifeGeneration,epochMs:registration.epochMs,body:registration.body,health:registration.health,barrels:registration.barrels,...(registration.doors?{doors:registration.doors}:{})});
  const life:Life={registration:r,cache:createOriginalSoloActorDropCapture({sceneGeneration:r.lifeGeneration,maxEntries,maxTextChars,sampleRandom36:()=>sampleRandom36(r),readCommittedCallback:()=>readCommittedCallback(r)}),closed:false,failed:false};active.set(r.id,life);
  const isHuman=r.id==='player';
  try{
   if(pickupHistorySourceAt){
    const source=pickupHistorySourceAt(r);checkLife(life);
    const history=source?.history;
    if(!source||typeof source.begin!=='function'||!history||history.observer!==r.id||history.lifeGeneration!==r.lifeGeneration)throw Error('Foreign loaded Solo pickup history source');
    for(const other of active.values())if(other!==life&&other.pickupHistorySource===source)throw Error('Aliased loaded Solo pickup history source');
    life.pickupHistorySource=source;
   }
   if(pickupContinuationAt){const continuation=pickupContinuationAt(r);checkLife(life);if(continuation!==undefined&&typeof continuation!=='function')throw Error('Invalid loaded Solo pickup continuation');life.pickupContinuation=continuation;}
   const current=createOriginalSoloCurrentSceneLease({...producer,controller:{...producer.controller,model:{...producer.controller.model,dropRequestOwner:life.cache.requestOwner}},
    createBackends:c=>{
     validateContext(life,c);if(life.owner)throw Error('Loaded Solo assembly already acquired');life.observer=c.observer;
     const selected=banksAt(r,c);checkLife(life);const banks=selected?.banks;
     if(!banks||selected.kind!==(isHuman?'human':'bot')||banks.map!==map||banks.sceneGeneration!==r.lifeGeneration||banks.sourceScale!==scale
      ||!Array.isArray(banks.renderToWorld)||banks.renderToWorld.length!==16||Array.from({length:16},(_,i)=>banks.renderToWorld[i]).some((n,i)=>!Number.isFinite(n)||n!==renderToWorld[i])||!isHuman&&(!('weapon' in banks)||banks.weapon!==c.weapon))throw Error('Foreign loaded Solo bank policy');
     checkLife(life);
     const ownedResources={...resources,actorLifecycle:{...resources.actorLifecycle,readDropYawPlan:life.cache.readDropYawPlan}} as OriginalSoloSceneAssemblyOptions['resources'];
     life.owner=selected.kind==='human'?createOriginalSoloSceneAssembly(collection,{resources:ownedResources,inventory,banks:selected.banks}):createOriginalSoloBotSceneAssembly(collection,{resources:ownedResources,inventory,banks:selected.banks});
     checkLife(life);return {...life.owner.backends,...(life.pickupHistorySource?{pickupHistorySource:life.pickupHistorySource}:{}),...(life.pickupContinuation?{pickupContinuationAt:life.pickupContinuation}:{}),release:()=>releaseOwned(life)};
    },
    captureLocalWeaponCallback:(c,prefix,previous)=>isHuman?humanLocal(c,prefix,previous,life.owner as OriginalSoloLoadedHumanAssembly):botLocal(c,prefix,previous,life.owner as OriginalSoloLoadedBotAssembly),
    ...(isHuman?{captureLoadoutProgram:(...args:Parameters<NonNullable<Producer['captureLoadoutProgram']>>)=>humanProgram(...args,life.owner as OriginalSoloLoadedHumanAssembly)}:{captureBotProjectileProgram:(...args:Parameters<NonNullable<Producer['captureBotProjectileProgram']>>)=>botProgram(...args,life.owner as OriginalSoloLoadedBotAssembly)}),
    captureIncomingLaunches:(...args)=>captureIncomingLaunches(life.owner!,...args),snapshotAt:(prefix,state,_c,actors)=>life.owner!.snapshotAt(prefix,state,actors!),
   });life.lease=current;
   return Object.freeze({...current,...(current.preparePhysicalPuff?{preparePhysicalPuff:(context:Parameters<NonNullable<OriginalSoloReceiverSceneLease['preparePhysicalPuff']>>[0])=>run(life,()=>current.preparePhysicalPuff!(context))}:{}),captureCurrent:(c:OriginalSoloReceiverCurrentContext)=>{
    check();checkLife(life);validateContext(life,c);
    try{return run(life,()=>current.captureCurrent!(c));}catch(error){try{releaseLife(life);}catch(cleanup){throw new AggregateError([error,cleanup],'Loaded Solo capture and cleanup failed',{cause:error});}throw error;}
   },...(current.finalizeCurrentCapture?{finalizeCurrentCapture:(c:OriginalSoloReceiverCurrentContext,incoming:Parameters<NonNullable<OriginalSoloReceiverSceneLease['finalizeCurrentCapture']>>[1])=>{validateContext(life,c);try{return run(life,()=>current.finalizeCurrentCapture!(c,incoming));}catch(error){try{releaseLife(life);}catch(cleanup){throw new AggregateError([error,cleanup],'Loaded Solo finalization and cleanup failed',{cause:error});}throw error;}}}:{}),release:()=>{if(life.closed)return;check();releaseLife(life);}});
  }catch(error){try{releaseLife(life);}catch(cleanup){throw new AggregateError([error,cleanup],'Loaded Solo registration and cleanup failed',{cause:error});}throw error;}
 };
 const readAssembly=(id:string,lifeGeneration:number)=>{check();key(id,lifeGeneration);const life=active.get(id);return life?.registration.lifeGeneration===lifeGeneration?life.owner:undefined;};
 const release=()=>{if(closed)return;if(busy){busy.failed=true;throw Error('Loaded Solo factory operation active');}const lives=[...active.values()],errors:unknown[]=[];for(const life of lives)try{releaseLife(life);}catch(error){errors.push(error);}closed=true;if(errors.length)throw new AggregateError(errors,'Loaded Solo factory release failed');};
 return Object.freeze({createReceiverScene,readAssembly,release});
}
