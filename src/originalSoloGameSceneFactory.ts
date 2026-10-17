import type {OriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_SOURCE_PLAYER_EYE_HEIGHT} from '../shared/originalMapProfile';
import {ORIGINAL_COMBAT_PLANE_SIZE} from '../shared/originalCombatEffects';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';
import {originalProjectileDirection} from '../shared/originalProjectileOrientation';
import {advanceOriginalReceiverGunCallback} from '../shared/originalReceiverGunCallback';
import type {ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import type {ReceiverProjectileWorldBirth} from '../shared/originalReceiverProjectileWorld';
import type {ReceiverLocalHitscanAction} from '../shared/originalReceiverLocalHitscan';
import type {OriginalSoloGunHitscanCapture} from '../shared/originalSoloGunCallbackProgram';
import type {OriginalSoloBotShotCapture} from '../shared/originalSoloBotShotCapture';
import type {OriginalSoloLaunchReservation} from '../shared/originalSoloLaunchBatch';
import type {OriginalSoloReceiverSceneContext,OriginalSoloReceiverCurrentContext,OriginalSoloObserverWorlds,OriginalSoloObserver} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloCurrentSceneProducerOptions} from '../shared/originalSoloCurrentSceneProducer';
import type {OriginalWeaponCollection} from './originalWeapons';
import type {OriginalSoloGameStartupResources} from './originalSoloGameStartupResources';
import type {OriginalSoloHumanCallbackInput} from './originalSoloHumanCallbackInput';
import {createOriginalSoloLoadedSceneFactory,type OriginalSoloLoadedSceneFactory,type OriginalSoloLoadedSceneFactoryOptions,type OriginalSoloLoadedAssembly,type OriginalSoloLoadedBanksChoice} from './originalSoloLoadedSceneFactory';
import {captureOriginalSoloHumanGunProgram} from './originalSoloHumanGunProgram';
import {captureOriginalSoloProjectileReceiptProgram} from './originalSoloProjectileProgram';
import {captureOriginalSoloBotProjectileProgram} from './originalSoloBotProjectileProgram';
import {createOriginalSoloProjectileBirth} from './originalSoloProjectileBinding';

export interface OriginalSoloGameSceneFactoryOptions {
 readonly runtime:OriginalMapRuntime;
 readonly collection:OriginalWeaponCollection;
 /** Borrowed startup generation; release it after the returned factory. */
 readonly startupResources:OriginalSoloGameStartupResources;
 readonly readWorlds:()=>OriginalSoloObserverWorlds|undefined;
 readonly readHumanInput:(context:OriginalSoloReceiverCurrentContext,prefix:ReceiverScenePrefix)=>OriginalSoloHumanCallbackInput;
 readonly readHumanHitscan:(context:OriginalSoloReceiverCurrentContext,request:OriginalSoloGunHitscanCapture,preview:ReceiverLocalWeaponWorldCheckpoint)=>ReceiverLocalHitscanAction;
 readonly readBotShots:(context:OriginalSoloReceiverCurrentContext)=>readonly OriginalSoloBotShotCapture[];
 readonly readBanks:(registration:OriginalSoloReceiverSceneContext,context:OriginalSoloReceiverCurrentContext)=>OriginalSoloLoadedBanksChoice;
 readonly random3:()=>number;
 readonly random36:()=>number;
 readonly goodyAt:OriginalSoloCurrentSceneProducerOptions['goodyAt'];
 /** Paired opt-in; the cohort owns paged pickup collection after the gun program. */
 readonly pickupHistorySourceAt?:OriginalSoloLoadedSceneFactoryOptions['pickupHistorySourceAt'];
 readonly pickupContinuationAt?:OriginalSoloLoadedSceneFactoryOptions['pickupContinuationAt'];
}

const maxActors=64,maxCommands=256,maxModels=2048,maxTextChars=65536;
const mapSize=Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!;
const mapValues=Map.prototype.values;

/** Production callback composition over actual startup resources. Human gun
 * policy and authored bot policy remain separate. No body, query, renderer or
 * random draw is advanced until an issued CURRENT capture needs that operand.
 * Terminal goody presence is an explicit copy boundary through joint commit.
 */
export function createOriginalSoloGameSceneFactory(options:OriginalSoloGameSceneFactoryOptions):OriginalSoloLoadedSceneFactory {
 if(!options)throw Error('Missing Game Solo scene factory options');
 const {runtime,collection,startupResources,readWorlds,readHumanInput,readHumanHitscan,readBotShots,readBanks,random3,random36,goodyAt,pickupHistorySourceAt,pickupContinuationAt}=options;
 if(!runtime||!['barrack','woodlands'].includes(runtime.map)||!Number.isFinite(runtime.scale)||runtime.scale<=0
  ||!collection||!startupResources||![readWorlds,readHumanInput,readHumanHitscan,readBotShots,readBanks,random3,random36,goodyAt].every(fn=>typeof fn==='function'))throw Error('Invalid Game Solo scene factory options');
 if((pickupHistorySourceAt===undefined)!==(pickupContinuationAt===undefined)
  ||pickupHistorySourceAt!==undefined&&typeof pickupHistorySourceAt!=='function'
  ||pickupContinuationAt!==undefined&&typeof pickupContinuationAt!=='function')throw Error('Game Solo paged pickup hooks must be paired functions');
 const pagedPickups=pickupHistorySourceAt!==undefined;
 const resources=startupResources.resources,inventory=startupResources.inventory,sourceScale=runtime.scale;
 if(resources.actor.sourceScale!==sourceScale||resources.transientBinding.resources.sourceScale!==sourceScale||inventory.data!==runtime.data)throw Error('Foreign Game Solo startup generation');
 const renderToWorld=Object.freeze([...resources.renderToWorld]);
 const rocketMaterials=new WeakMap<OriginalSoloObserver,string>();
 const physical=(context:OriginalSoloReceiverCurrentContext)=>{
  if(mapSize.call(context.projectiles)>maxActors)throw Error('Game Solo physical projectile budget exceeded');
  return [...mapValues.call(context.projectiles)];
 };
 const birth=(owner:OriginalSoloLoadedAssembly,context:OriginalSoloReceiverCurrentContext,reservation:OriginalSoloLaunchReservation,preview?:ReceiverLocalWeaponWorldCheckpoint):ReceiverProjectileWorldBirth=>{
  const launch=reservation.launch,state=reservation.prototype,bank=owner.banks.projectileWorld;
  const rocketMaterialHandle=rocketMaterials.get(context.observer);
  if(!rocketMaterialHandle)throw Error('Missing Game Solo declared rocket material binding');
  let freshModel=bank.freeze().template;
  if(launch.weapon==='rpg'){
   const local=preview??owner.banks.localWeaponWorld.freeze();
   if(local.models.length>8)throw Error('Game Solo local model budget exceeded');
   const rocket=local.models.find(model=>model.handle==='rocket');
   if(!rocket)throw Error('Missing actual Game Solo held rocket constructor');
   freshModel={...rocket,handle:'rocket',resource:'rpgrocket',materialHandle:rocketMaterialHandle};
  }
  return createOriginalSoloProjectileBirth({launchId:launch.id,weapon:launch.weapon,freshModel,
   pose:{launchId:launch.id,weapon:launch.weapon,position:state.position,direction:state.direction,...(state.sourceRotation?{sourceRotation:state.sourceRotation}:{}),renderToWorld,orientationPolicy:'copy-source-basis-unit-reset'},
   rocketMaterialHandle,maxTextChars});
 };
 return createOriginalSoloLoadedSceneFactory({map:runtime.map,collection,resources,inventory,
  ...(pagedPickups?{pickupHistorySourceAt,pickupContinuationAt:(registration:OriginalSoloReceiverSceneContext)=>{
   const continuation=pickupContinuationAt!(registration);
   if(registration.id==='player'&&typeof continuation!=='function')throw Error('Missing Game Solo human pickup continuation');
   return continuation;
  }}:{}),
  producer:{sourceScale,maxCapturedBlasts:maxActors,maxCapturedProjectiles:maxActors,requireActorResources:true,requireTransientResources:true,
   environment:{maxCommands,maxOutcomes:128,maxModels,maxTextChars:1000000,terminalGoodyPolicy:'retain-until-current-commit'},
   controller:{model:{lifecycleJournal:{maxEntries:64,maxTextChars:8192},eyeHeight:ORIGINAL_SOURCE_PLAYER_EYE_HEIGHT*sourceScale,goodyBspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels,maxPickups:16},
    transient:{maxModels:64,maxActors:64,maxShaders:64,maxTextChars},maxEffects:128,transientState:true},goodyAt},
  banksAt:(registration,context)=>{
   const choice=readBanks(registration,context);
   rocketMaterials.set(context.observer,choice.banks.rocketMaterialHandle);
   return choice;
  },
  readCommittedCallback:registration=>{
   const world=readWorlds()?.worlds.get(registration.id);
   if(world&&world.lifeGeneration!==registration.lifeGeneration)throw Error('Foreign Game Solo committed life');
   return world?.callback??0;
  },sampleRandom36:()=>random36(),dropLimits:{maxEntries:64,maxTextChars:8192},
  programs:{human:{
   captureLocalWeaponCallback:(context,prefix)=>{
    const input=readHumanInput(context,prefix);
    return {cameraWorldMatrix:input.cameraWorldMatrix,velocityWorld:input.velocityWorld,commands:[]};
   },
   captureLoadoutProgram:(context,prefixes,previous,bangs,owner)=>{
    if(!previous.projectiles)throw Error('Missing Game Solo committed projectile bank');
    const receiptCommands=captureOriginalSoloProjectileReceiptProgram(previous.projectiles,physical(context),bangs,{renderToWorld,maxActors,maxCommands,maxTextChars});
    if(!prefixes.callback)return {receiptCommands};
    if(!pagedPickups&&context.observer.modelState?.pickupHistory)throw Error('Game Solo paged pickup continuation is not installed');
    const pickups=pagedPickups?[]:context.observer.modelState?.pickups??[];
    if(!Array.isArray(pickups)||pickups.length>16)throw Error('Game Solo pickup command budget exceeded');
    const input=readHumanInput(context,prefixes.callback);
    const phase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:input.prefix,held:input.held,weaponModelPresent:input.weaponModelPresent});
    const samples=phase.intents.filter(intent=>intent.kind==='yaw-kick-request').map(()=>random3());
    const program=captureOriginalSoloHumanGunProgram(previous.loadout,input,{localWeaponWorld:owner.banks.localWeaponWorld,random3:samples,sendReport:true,maxCommands,maxModels,maxTextChars,
     captureHitscan:(request,preview)=>readHumanHitscan(context,request,preview),
     captureLaunch:(request,preview)=>{
      if(!context.reserveLaunch||request.fire.weapon!=='launcher'&&request.fire.weapon!=='rpg')throw Error('Missing Game Solo human launch reservation');
      const admission=context.reserveLaunch({weapon:request.fire.weapon,eye:originalPlayerEye(context.body),direction:originalProjectileDirection(input.sourceRotation),sourceRotation:input.sourceRotation},0);
      return {admission,...(admission.ok?{birth:birth(owner,context,admission.reservation,preview)}:{})};
     }});
    const callbackCommands=Object.freeze([...program.callbackCommands,...pickups.map(pickup=>Object.freeze({kind:'ammo-pickup' as const,pickupId:pickup.id}))]);
    if(receiptCommands.length+callbackCommands.length>maxCommands)throw Error('Game Solo combined gun command budget exceeded');
    return Object.freeze({receiptCommands,...program,callbackCommands});
   }},bot:{
   captureLocalWeaponCallback:(context)=>({cameraWorldMatrix:renderToWorld,velocityWorld:context.body.velocity,commands:[]}),
   captureBotProjectileProgram:(context,prefixes,previous,bangs,owner)=>captureOriginalSoloBotProjectileProgram(context,prefixes,previous,bangs,prefixes.callback?readBotShots(context):[],
    {renderToWorld,maxActors,maxShots:64,maxCommands,maxTextChars,captureBirth:reservation=>birth(owner,context,reservation)}),
  }},
  captureIncomingLaunches:(owner,context,_prefix,incoming)=>{
   if(!Array.isArray(incoming)||incoming.length>maxActors)throw Error('Game Solo incoming constructor budget exceeded');
   return Object.freeze(incoming.map(row=>Object.freeze({kind:'projectile-birth' as const,birth:birth(owner,context,row.reservation)})));
  },
 });
}
