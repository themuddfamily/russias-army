import {validateOriginalReceiverTransientResourceDescriptor,type ReceiverTransientResourceDescriptor} from './originalReceiverTransientResourceDescriptor';
import type {OriginalProjectileModelPose} from './originalProjectileRay';
import type {Vec3} from './protocol';
import type {ReceiverPickupHistorySource} from './originalReceiverPickupHistory';
import {validateOriginalReceiverActorResourceDescriptor,type ReceiverActorResourceDescriptor} from './originalReceiverActorResourceDescriptor';
import type {ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import type {OriginalSoloBlast,OriginalSoloCurrentBlastClaim,OriginalSoloCurrentCaptureResult,OriginalSoloReceiverCurrentContext,OriginalSoloReceiverSceneLease} from './originalSoloObserverWorld';
import {MAX_SOLO_CURRENT_BLAST_CLAIMS,isOriginalSoloPhysicalPuffContext,type OriginalSoloPhysicalPuffContext} from './originalSoloObserverWorld';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentCommand,type ReceiverCurrentEnvironmentOptions,type ReceiverCurrentEnvironmentState} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController,type ReceiverSceneControllerOptions} from './originalReceiverSceneController';
import type {ReceiverModelBackend,ReceiverSceneTransaction} from './originalReceiverModelWorld';
import type {OriginalReceiverTransientBackend,OriginalReceiverTransientGoody} from './originalReceiverTransientWorld';
import {sameReceiverScenePrefix,type ReceiverExternalSceneSnapshot,type ReceiverScenePrefix} from './originalReceiverPrefix';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {OriginalReceiverProjectileWorld,type ReceiverProjectileWorldCheckpoint} from './originalReceiverProjectileWorld';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import type {OriginalReceiverTransientBirth} from './originalReceiverTransientWorld';
import type {ReceiverGunCallbackResult} from './originalReceiverGunCallback';
import {copyReceiverGunPhaseCheckpoint,type ReceiverGunPhaseCheckpoint} from './originalReceiverGunPhase';
import type {ReceiverLocalHitscanQuery} from './originalReceiverLocalHitscan';
import {OriginalReceiverWeaponReportWorld} from './originalReceiverWeaponReportWorld';
import {copyReceiverGunOutput} from './originalReceiverGunOutput';
import type {OriginalSoloIncomingLaunch,OriginalSoloReservedLaunchAdmission} from './originalSoloLaunchBatch';
import {validateOriginalSoloBotProjectileAdmissions,type OriginalSoloBotProjectileAdmission,type OriginalSoloBotProjectileCommit} from './originalSoloBotProjectileAdmissions';

export interface OriginalSoloLocalWeaponCallbackCapture {
 readonly cameraWorldMatrix:readonly number[];readonly velocityWorld:Readonly<Vec3>;
 readonly commands:readonly ReceiverCurrentEnvironmentCommand[];
}
export interface OriginalSoloAdmittedBang {
 readonly blast:OriginalSoloBlast;readonly effectId:string;readonly birthPrefix:ReceiverScenePrefix;
 readonly event:Extract<OriginalReceiverTransientBirth,{kind:'bang'}>;
 readonly terminalProjectilePose?:OriginalProjectileModelPose;
}
export type OriginalSoloProjectileReceiptCommand=ReceiverCurrentEnvironmentCommand
 |Readonly<{kind:'admitted-bang';blast:OriginalSoloBlast}>
 |Readonly<{kind:'admitted-projectile-retire';blast:OriginalSoloBlast;launchId:string}>;
export interface OriginalSoloProjectileProgram {
 readonly receiptCommands:readonly OriginalSoloProjectileReceiptCommand[];
 readonly callbackCommands?:readonly ReceiverCurrentEnvironmentCommand[];
}
export interface OriginalSoloLoadoutProgram extends OriginalSoloProjectileProgram {
 /** Actual callback result whose exact final checkpoint is captured once,
  * after any ordered intermediate captures and before finish/pickups. Only
  * its saved gate is published; the producer never replays its intents. */
 readonly gunPhase?:ReceiverGunCallbackResult;
 readonly launchAdmissions?:readonly OriginalSoloReservedLaunchAdmission[];
}
export interface OriginalSoloBotProjectileProgram extends OriginalSoloProjectileProgram {
 readonly botLaunchAdmissions:readonly OriginalSoloBotProjectileAdmission[];
}

export interface OriginalSoloCurrentSceneProducerOptions {
 readonly sourceScale:number;readonly maxCapturedBlasts:number;readonly maxCapturedProjectiles:number;
 /** Explicit renderer-consuming mode; no default basis or asset identity. */
 readonly requireActorResources?:boolean;
 readonly requireTransientResources?:boolean;
 readonly environment:Pick<ReceiverCurrentEnvironmentOptions,'maxCommands'|'maxOutcomes'|'maxModels'|'maxTextChars'|'terminalGoodyPolicy'>;
 readonly controller:Omit<ReceiverSceneControllerOptions,'model'>&{readonly model:Omit<ReceiverSceneControllerOptions['model'],'sceneGeneration'|'sourceScale'>};
 /** Once per actual life; mutable backend resources must be receiver-private.
  * Immutable decoded resources may be borrowed. Cleanup must not throw. */
 readonly createBackends:(binding:OriginalSoloReceiverCurrentContext)=>{readonly model:ReceiverModelBackend;readonly transient:OriginalReceiverTransientBackend;readonly pickupHistorySource?:ReceiverPickupHistorySource;readonly pickupContinuationAt?:ReceiverCurrentEnvironmentOptions['pickupContinuationAt'];readonly actorResources?:ReceiverActorResourceDescriptor;readonly transientResources?:ReceiverTransientResourceDescriptor;readonly localWeaponWorld?:OriginalReceiverLocalWeaponWorld;readonly projectileWorld?:OriginalReceiverProjectileWorld;readonly loadoutWorld?:OriginalReceiverLoadoutWorld;readonly weaponReportWorld?:OriginalReceiverWeaponReportWorld;readonly localHitscan?:ReceiverLocalHitscanQuery;readonly release?:()=>void};
 /** Paired with an owned backend bank. Pure explicit callback program, captured
  * once per fresh living where plan, not replayed on retries or death receipts. */
 readonly captureLocalWeaponCallback?:(context:OriginalSoloReceiverCurrentContext,prefix:ReceiverScenePrefix,previousCommittedBank:ReceiverLocalWeaponWorldCheckpoint)=>OriginalSoloLocalWeaponCallbackCapture;
 /** Paired with the owned projectile bank. Markers preserve exact automatic
  * receipt bangs. With both banks, this supplies the sole ordered callback
  * program and the local hook supplies camera/velocity with empty commands. */
 readonly captureProjectileProgram?:(context:OriginalSoloReceiverCurrentContext,prefixes:Readonly<{receipt:ReceiverScenePrefix;callback?:ReceiverScenePrefix}>,previousCommittedBank:ReceiverProjectileWorldCheckpoint,admittedBangs:readonly OriginalSoloAdmittedBang[])=>OriginalSoloProjectileProgram;
 /** Authored bot constructor requests. No human loadout/readiness or native
  * hitscan damage is evaluated; committed issued triggers retire exactly once. */
 readonly captureBotProjectileProgram?:(context:OriginalSoloReceiverCurrentContext,prefixes:Readonly<{receipt:ReceiverScenePrefix;callback?:ReceiverScenePrefix}>,previousCommittedBank:ReceiverProjectileWorldCheckpoint,admittedBangs:readonly OriginalSoloAdmittedBang[])=>OriginalSoloBotProjectileProgram;
 /** Paired with the owned loadout bank. Sole ordered frame program; the local
  * hook supplies camera/velocity with empty commands. Mutually exclusive with
  * captureProjectileProgram, including when a projectile bank is also owned. */
 readonly captureLoadoutProgram?:(context:OriginalSoloReceiverCurrentContext,prefixes:Readonly<{receipt:ReceiverScenePrefix;callback?:ReceiverScenePrefix}>,previousCommitted:Readonly<{loadout:ReceiverLoadoutCheckpoint;projectiles?:ReceiverProjectileWorldCheckpoint}>,admittedBangs:readonly OriginalSoloAdmittedBang[])=>OriginalSoloLoadoutProgram;
 /** Sealed remote constructors are discovered after every sender's captured
  * gun program. Return only model birth/pose commands at the receipt
  * prefix; never reread physical input, perform transport or create bodies. */
 readonly captureIncomingLaunches?:(context:OriginalSoloReceiverCurrentContext,prefix:ReceiverScenePrefix,incoming:readonly OriginalSoloIncomingLaunch[],previousCommitted:ReceiverProjectileWorldCheckpoint)=>readonly ReceiverCurrentEnvironmentCommand[];
 /** Explicit camera/model convention and current weapon; no inferred rifle or
  * body-center camera. Dead contexts must return null. */
 readonly goodyAt:(context:OriginalSoloReceiverCurrentContext)=>OriginalReceiverTransientGoody|null;
 /** Preserve independent missing evidence. This producer supplies no static,
  * camera/weapon, projectile or actor completeness and adds no FX twice. */
 readonly snapshotAt:(prefix:ReceiverScenePrefix,state:ReceiverCurrentEnvironmentState,context:OriginalSoloReceiverCurrentContext,actors?:ReceiverActorRegistrySnapshot)=>ReceiverExternalSceneSnapshot;
}
interface Plan {
 readonly goody:OriginalReceiverTransientGoody|null;
 readonly context:OriginalSoloReceiverCurrentContext;readonly fingerprint:string;
 readonly blasts:ReadonlyMap<string,OriginalSoloBlast>;readonly projectiles:ReadonlyMap<string,OriginalSoloReceiverCurrentContext['projectiles'] extends Map<string,infer P>?P:never>;
 readonly claims:readonly OriginalSoloCurrentBlastClaim[];
 readonly result:OriginalSoloCurrentCaptureResult;
 readonly gunPhase?:ReceiverGunPhaseCheckpoint;
 readonly botProjectileCommit?:OriginalSoloBotProjectileCommit;
 readonly botSequence?:number;
}
type LifeBinding=Pick<OriginalSoloReceiverCurrentContext,'observer'|'target'|'body'|'health'|'barrels'|'doors'|'projectiles'|'blasts'>;
const weapons=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const finite=(p:Readonly<Vec3>|undefined)=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const point=(p:Readonly<Vec3>):Readonly<Vec3>=>Object.freeze({x:p.x,y:p.y,z:p.z});

/** Optional explosion, weapon and projectile capture, not scene completeness.
 * No physics, flick, history restoration or public presentation runs here.
 * Raw owner writes during a prepared stage remain forbidden by the borrowed
 * state contract; the bounded retry watch is not a native scene fingerprint. */
export function createOriginalSoloCurrentSceneLease(input:OriginalSoloCurrentSceneProducerOptions):OriginalSoloReceiverSceneLease {
 if(!input||!Number.isFinite(input.sourceScale)||input.sourceScale<=0
  ||![input.maxCapturedBlasts,input.maxCapturedProjectiles].every(v=>Number.isSafeInteger(v)&&v>0)
  ||!input.environment||![input.environment.maxCommands,input.environment.maxOutcomes,input.environment.maxModels,input.environment.maxTextChars].every(v=>Number.isSafeInteger(v)&&v>0)
  ||!input.controller||!input.controller.model||!input.controller.transient
  ||typeof input.createBackends!=='function'||typeof input.goodyAt!=='function'||typeof input.snapshotAt!=='function'
  ||input.captureLocalWeaponCallback!==undefined&&typeof input.captureLocalWeaponCallback!=='function'
  ||input.captureProjectileProgram!==undefined&&typeof input.captureProjectileProgram!=='function'
  ||input.captureBotProjectileProgram!==undefined&&typeof input.captureBotProjectileProgram!=='function'
  ||input.captureLoadoutProgram!==undefined&&typeof input.captureLoadoutProgram!=='function'
  ||input.captureIncomingLaunches!==undefined&&typeof input.captureIncomingLaunches!=='function'
  ||[input.captureLoadoutProgram,input.captureProjectileProgram,input.captureBotProjectileProgram].filter(hook=>hook!==undefined).length>1)throw Error('Invalid Solo CURRENT producer options');
 const requireActorResources=input.requireActorResources;
 if(requireActorResources!==undefined&&typeof requireActorResources!=='boolean')throw Error('Invalid Solo CURRENT actor resource requirement');
 const requireTransientResources=input.requireTransientResources;
 if(requireTransientResources!==undefined&&typeof requireTransientResources!=='boolean')throw Error('Invalid Solo CURRENT transient resource requirement');
 const model=input.controller.model,transient=input.controller.transient;
 const transientState=input.controller.transientState;
 if(transientState!==undefined&&typeof transientState!=='boolean')throw Error('Invalid Solo CURRENT transient state option');
 const rawShotJournal=input.controller.shotJournal;
 if(rawShotJournal!==undefined&&(!rawShotJournal||typeof rawShotJournal!=='object'))throw Error('Invalid Solo CURRENT shot journal');
 const shotJournal=rawShotJournal===undefined?undefined:Object.freeze({maxEntries:rawShotJournal.maxEntries,maxTextChars:rawShotJournal.maxTextChars});
 if(shotJournal&&(!Number.isSafeInteger(shotJournal.maxEntries)||shotJournal.maxEntries<1||shotJournal.maxEntries>256||!Number.isSafeInteger(shotJournal.maxTextChars)||shotJournal.maxTextChars<1||shotJournal.maxTextChars>65536))throw Error('Invalid Solo CURRENT shot journal budgets');
 const rawJournal=model.lifecycleJournal;
 const dropRequestOwner=model.dropRequestOwner;
 if(dropRequestOwner!==undefined&&(typeof dropRequestOwner!=='object'||dropRequestOwner===null))throw Error('Invalid Solo CURRENT drop request owner');
 if(rawJournal!==undefined&&(!rawJournal||typeof rawJournal!=='object'))throw Error('Invalid Solo CURRENT lifecycle journal budgets');
 const lifecycleJournal=rawJournal===undefined?undefined:Object.freeze({maxEntries:rawJournal.maxEntries,maxTextChars:rawJournal.maxTextChars});
 if(lifecycleJournal&&(!Number.isSafeInteger(lifecycleJournal.maxEntries)||lifecycleJournal.maxEntries<1||!Number.isSafeInteger(lifecycleJournal.maxTextChars)||lifecycleJournal.maxTextChars<1))throw Error('Invalid Solo CURRENT lifecycle journal budgets');
 if(![model.eyeHeight,model.goodyBspWorld,250*input.sourceScale].every(Number.isFinite)||model.eyeHeight<0||model.goodyBspWorld<0
  ||![model.maxModels,model.maxPickups,transient.maxModels,transient.maxActors,transient.maxShaders,
   transient.maxShaderPoolEntries??transient.maxShaders,transient.maxTextChars??65536,input.controller.maxEffects].every(v=>Number.isSafeInteger(v)&&v>0)
  ||!Number.isSafeInteger(model.initialCloneCounter??0)||(model.initialCloneCounter??0)<0||!Number.isSafeInteger(model.maxRegistryTextChars??131072)||(model.maxRegistryTextChars??131072)<1)throw Error('Invalid Solo CURRENT producer budgets');
 // Capture scalar configuration and hooks; later caller edits cannot replace
 // this lease's factories or budgets. Constructors validate their own options.
 const sourceScale=input.sourceScale,maxBlasts=input.maxCapturedBlasts,maxProjectiles=input.maxCapturedProjectiles;
 const terminalGoodyPolicy=input.environment.terminalGoodyPolicy;
 if(terminalGoodyPolicy!==undefined&&terminalGoodyPolicy!=='retain-until-current-commit')throw Error('Invalid Solo CURRENT terminal goody policy');
 const budgets=Object.freeze({maxCommands:input.environment.maxCommands,maxOutcomes:input.environment.maxOutcomes,maxModels:input.environment.maxModels,maxTextChars:input.environment.maxTextChars,terminalGoodyPolicy});
 const m=input.controller.model,t=input.controller.transient;
 const controllerOptions={...(transientState!==undefined?{transientState}:{}),...(shotJournal?{shotJournal}:{}),model:{...(lifecycleJournal?{lifecycleJournal}:{}),...(dropRequestOwner!==undefined?{dropRequestOwner}:{}),eyeHeight:m.eyeHeight,goodyBspWorld:m.goodyBspWorld,maxModels:m.maxModels,maxPickups:m.maxPickups,initialCloneCounter:m.initialCloneCounter,maxRegistryTextChars:m.maxRegistryTextChars,requireCompleteCoverage:true},transient:{maxModels:t.maxModels,maxActors:t.maxActors,maxShaders:t.maxShaders,maxShaderPoolEntries:t.maxShaderPoolEntries,maxTextChars:t.maxTextChars},maxEffects:input.controller.maxEffects};
 const createBackends=input.createBackends,goodyAt=input.goodyAt,snapshotAt=input.snapshotAt,captureLocalWeaponCallback=input.captureLocalWeaponCallback,captureProjectileProgram=input.captureProjectileProgram,captureBotProjectileProgram=input.captureBotProjectileProgram,captureLoadoutProgram=input.captureLoadoutProgram,captureIncomingLaunches=input.captureIncomingLaunches;
 let binding:LifeBinding|undefined,environment:OriginalReceiverCurrentEnvironment|undefined,controller:OriginalReceiverSceneController|undefined;
 let cleanup:(()=>void)|undefined,pending:Plan|undefined,active:ReceiverSceneTransaction|undefined,closed=false;
 let actorResources:ReceiverActorResourceDescriptor|undefined,committedActorResources:ReceiverActorResourceDescriptor|undefined;
 let transientResources:ReceiverTransientResourceDescriptor|undefined,committedTransientResources:ReceiverTransientResourceDescriptor|undefined;
 let localWeaponWorld:OriginalReceiverLocalWeaponWorld|undefined,capturing=false,captureFailed=false;
 let projectileWorld:OriginalReceiverProjectileWorld|undefined;
 let loadoutWorld:OriginalReceiverLoadoutWorld|undefined;
 let weaponReportWorld:OriginalReceiverWeaponReportWorld|undefined;
 let committedGunPhase:ReceiverGunPhaseCheckpoint|undefined;
 let committedBotSequence=0,committedBotProjectileCommit:OriginalSoloBotProjectileCommit|undefined;
 let finalizedIncoming:readonly OriginalSoloIncomingLaunch[]|undefined;
 let committedGoody:OriginalReceiverTransientGoody|null|undefined;
 let physicalActive:ReturnType<OriginalReceiverSceneController['preparePhysicalPuff']>|undefined;
 let committed:ReadonlyMap<OriginalSoloBlast,OriginalSoloCurrentBlastClaim>=new Map();
 const check=()=>{if(closed)throw Error('Solo CURRENT producer released');};
 const afterHook=()=>{check();if(captureFailed)throw Error('Recursive Solo CURRENT capture');};
 const releaseResources=()=>{const bank=localWeaponWorld,projectiles=projectileWorld,loadout=loadoutWorld,reports=weaponReportWorld,release=cleanup;committedGunPhase=undefined;actorResources=undefined;committedActorResources=undefined;transientResources=undefined;committedTransientResources=undefined;localWeaponWorld=undefined;projectileWorld=undefined;loadoutWorld=undefined;weaponReportWorld=undefined;cleanup=undefined;try{reports?.release();}finally{try{loadout?.release();}finally{try{projectiles?.release();}finally{try{bank?.release();}finally{release?.();}}}}};
 const compatible=(a:LifeBinding,b:LifeBinding)=>a.observer===b.observer&&a.target===b.target&&a.body===b.body&&a.health===b.health&&a.barrels===b.barrels&&a.doors===b.doors&&a.projectiles===b.projectiles&&a.blasts===b.blasts;
 const validateContext=(c:OriginalSoloReceiverCurrentContext)=>{
  if(!c||c.observer!==c.target||c.id!==c.observer.id||c.name!==c.observer.name||c.lifeGeneration!==c.observer.lifeGeneration||c.body!==c.observer.body||c.health!==c.target.health||c.barrels!==c.observer.barrels||c.doors!==c.observer.doors
   ||c.blasts!==c.observer.blasts||c.projectiles!==c.observer.projectiles||c.actorNames!==c.observer.actorNames||c.alive!==c.target.alive
   ||c.barrels.sourceScale!==sourceScale||!Number.isFinite(c.time)||!Number.isFinite(c.yaw)||!Number.isFinite(c.motionTime)
   ||!['idle','physics','goody'].includes(c.phase)||c.weapon!==undefined&&!weapons.includes(c.weapon)
   ||![c.physicalCallback,c.mirrorCallback,c.receiptTick,c.lifeGeneration].every(v=>Number.isSafeInteger(v)&&v>=0)
   ||typeof c.detonationFor!=='function'||!Array.isArray(c.receiptActorNames)||c.receiptActorNames.length>budgets.maxModels
   ||c.deliveryKind==='death'&&c.receiptActorNames.length!==0)throw Error('Invalid Solo CURRENT context');
  if(c.blasts.size>maxBlasts||c.projectiles.size>maxProjectiles)throw Error('Solo CURRENT capture population budget exceeded');
  if(binding&&!compatible(binding,c))throw Error('Solo CURRENT producer changed life binding');
  if(c.deliveryKind==='where'){
   if(c.phase!=='physics'||!c.afterGoody||c.physicalCallback!==c.mirrorCallback+1||c.order.receiptCallbacks!==c.physicalCallback-1||c.order.callbacks!==c.physicalCallback)throw Error('Unsupported Solo CURRENT where phase');
  }else if(c.deliveryKind!=='death'||c.physicalCallback!==c.mirrorCallback||c.order.receiptCallbacks!==c.physicalCallback||c.order.callbacks!==c.physicalCallback||!['idle','goody'].includes(c.phase))throw Error('Unsupported Solo CURRENT death phase');
 };
 const watch=(c:OriginalSoloReceiverCurrentContext):string=>{
  let text=c.id.length+c.name.length;
  if(text>budgets.maxTextChars)throw Error('Solo CURRENT watch text budget exceeded');
  const addText=(values:readonly string[])=>{for(const value of values){if(typeof value!=='string')throw Error('Invalid Solo CURRENT watched text');text+=value.length;if(text>budgets.maxTextChars)throw Error('Solo CURRENT watch text budget exceeded');}};
  const receiptNames:unknown[]=[],receiptIds=new Set<string>(),receiptCount=c.receiptActorNames.length;
  if(receiptCount>budgets.maxModels)throw Error('Solo CURRENT receipt name budget exceeded');
  for(let index=0;index<receiptCount;index++){
   const row=c.receiptActorNames[index];
   if(!row||typeof row.actorId!=='string'||!row.actorId||typeof row.name!=='string'||!row.name
    ||!Number.isSafeInteger(row.lifeGeneration)||row.lifeGeneration<1||receiptIds.has(row.actorId))throw Error('Invalid Solo CURRENT receipt names');
   addText([row.actorId,row.name]);receiptIds.add(row.actorId);receiptNames.push([row.actorId,row.name,row.lifeGeneration]);
  }
  const blastValues=[];
  for(const [id,blast] of c.blasts){const s=blast.state,a=c.detonationFor(blast);if(!finite(s.position)||![s.remainingCallbacks,blast.launch.sequence,blast.launch.ownerLife].every(Number.isFinite)||a&&(!finite(a.position)||!Number.isFinite(a.physicalCallback)))throw Error('Invalid Solo CURRENT watched blast');addText([id,blast.launch.id,blast.launch.ownerId,blast.launch.ownerName,s.weapon,s.shooterId,...(a?[a.weapon,a.ownerName]:[])]);blastValues.push([id,blast.launch.id,blast.launch.sequence,blast.launch.ownerId,blast.launch.ownerLife,blast.launch.ownerName,s.position.x,s.position.y,s.position.z,s.weapon,s.shooterId,s.remainingCallbacks,a?.physicalCallback,a?.position.x,a?.position.y,a?.position.z,a?.weapon,a?.ownerName]);}
  const projectileValues=[];
  for(const [id,p] of c.projectiles){const s=p.state;if(!finite(s.position)||!finite(s.velocity)||!finite(s.direction)||![p.launch.sequence,s.remainingCallbacks].every(Number.isFinite)||typeof s.hit!=='boolean'||s.angular&&![s.angular.orientation.x,s.angular.orientation.y,s.angular.orientation.z,s.angular.orientation.w].every(Number.isFinite))throw Error('Invalid Solo CURRENT watched projectile');addText([id,p.launch.id]);projectileValues.push([id,p.launch.id,p.launch.sequence,s.position.x,s.position.y,s.position.z,s.velocity.x,s.velocity.y,s.velocity.z,s.direction.x,s.direction.y,s.direction.z,s.remainingCallbacks,s.hit,s.angular?.orientation.x,s.angular?.orientation.y,s.angular?.orientation.z,s.angular?.orientation.w]);}
  const b=c.body;
  if(!finite(b.position)||!finite(b.velocity)||![c.health.canonical,c.health.flick].every(Number.isFinite))throw Error('Invalid Solo CURRENT watched owner');
  const value=JSON.stringify([c.id,c.name,c.lifeGeneration,c.physicalCallback,c.mirrorCallback,c.receiptTick,c.time,c.phase,c.afterGoody,c.deliveryKind,c.order.receiptCallbacks,c.order.callbacks,c.yaw,c.motionTime,c.weapon,c.alive,c.health.canonical,c.health.flick,b.position.x,b.position.y,b.position.z,b.velocity.x,b.velocity.y,b.velocity.z,blastValues,projectileValues,receiptNames]);
  if(value.length>budgets.maxTextChars)throw Error('Solo CURRENT watch text budget exceeded');return value;
 };
 const scene={begin:():ReceiverSceneTransaction=>{
  if(capturing){captureFailed=true;throw Error('Solo CURRENT scene begin during capture');}
  check();if(!pending||!controller||active||physicalActive)throw Error('Solo CURRENT producer not captured or already active');
  if(captureIncomingLaunches&&pending.context.deliveryKind==='where'&&finalizedIncoming===undefined)throw Error('Solo launch receipts not finalized');
  const owned=controller.begin();let plan:Plan|undefined=pending,open=true,publisher:(()=>void)|undefined;
  const prepareCommit=()=>{
   if(publisher)return publisher;if(!open)throw Error('Solo CURRENT transaction closed');
   const next=new Map(plan!.claims.map(claim=>[claim.blast,claim] as const));
   const publish=owned.prepareCommit(),nextActorResources=actorResources,nextTransientResources=transientResources,nextGunPhase=plan!.gunPhase,nextBotCommit=plan!.botProjectileCommit,nextBotSequence=plan!.botSequence??committedBotSequence;
   const nextGoody=plan!.goody;
   publisher=()=>{if(!open)return;publish();committed=next;committedActorResources=nextActorResources;committedTransientResources=nextTransientResources;committedGunPhase=nextGunPhase;committedBotSequence=nextBotSequence;committedBotProjectileCommit=nextBotCommit;committedGoody=nextGoody;pending=undefined;finalizedIncoming=undefined;plan=undefined;open=false;active=undefined;};return publisher;
  };
  const wrapped:ReceiverSceneTransaction={...owned,prepareCommit,commit:()=>{if(open)prepareCommit()();},rollback:()=>{if(!open)return;owned.rollback();plan=undefined;open=false;active=undefined;}};
  active=wrapped;return wrapped;
 }};
 return Object.freeze({scene,
  captureCurrent:(c:OriginalSoloReceiverCurrentContext):OriginalSoloCurrentCaptureResult=>{
   if(capturing){captureFailed=true;throw Error('Recursive Solo CURRENT capture');}
   capturing=true;captureFailed=false;
   try{
   check();if(active||physicalActive)throw Error('Solo CURRENT capture during transaction');validateContext(c);
   const fingerprint=watch(c);
   afterHook();
   if(pending){
    if(!compatible(pending.context,c)||pending.context.actorNames!==c.actorNames||pending.fingerprint!==fingerprint)throw Error('Changed Solo CURRENT retry');
    // Map replacement with equal scalar payload must not inherit exact identity.
    for(const [id,blast] of pending.blasts)if(c.blasts.get(id)!==blast)throw Error('Changed Solo CURRENT retry blast');
    for(const [id,p] of pending.projectiles)if(c.projectiles.get(id)!==p)throw Error('Changed Solo CURRENT retry projectile');
    for(const claim of pending.claims)if(c.blasts.get(claim.blast.launch.id)!==claim.blast)throw Error('Changed Solo CURRENT retry blast');
    return pending.result;
   }
   const supplied=goodyAt(c);
   afterHook();
   if(c.alive?!supplied||!finite(supplied.eyePosition)||!finite(supplied.modelPosition)||!Number.isFinite(supplied.bspWorld)||supplied.bspWorld<=0||supplied.weapon!==null&&!weapons.includes(supplied.weapon)||supplied.weapon===null&&!captureLoadoutProgram||supplied.weapon!==null&&c.weapon!==undefined&&c.weapon!==supplied.weapon:supplied!==null)throw Error('Invalid Solo CURRENT explicit goody');
   const goody=supplied?Object.freeze({bspWorld:supplied.bspWorld,eyePosition:point(supplied.eyePosition),modelPosition:point(supplied.modelPosition),weapon:supplied.weapon}):null;
   const receipt:ReceiverScenePrefix=Object.freeze({kind:'receipt',sceneGeneration:c.lifeGeneration,callback:c.order.receiptCallbacks,tick:c.receiptTick});
   const claims:OriginalSoloCurrentBlastClaim[]=[],commands:ReceiverCurrentEnvironmentCommand[]=[],admitted:OriginalSoloAdmittedBang[]=[];let text=0;
   for(const blast of c.blasts.values()){
    const old=committed.get(blast),admission=c.detonationFor(blast);let claim=old;
    if(!claim&&c.deliveryKind==='where'&&admission&&admission.physicalCallback===c.physicalCallback-1&&blast.state.remainingCallbacks===16){
     if(!finite(admission.position)||!['launcher','rpg'].includes(admission.weapon)||typeof admission.ownerName!=='string')throw Error('Invalid Solo CURRENT detonation');
     const effectId=`solo-bang:${c.lifeGeneration}:${blast.launch.sequence}`;
     claim=Object.freeze({blast,effectId,birthPrefix:receipt});
     const event:Extract<OriginalReceiverTransientBirth,{kind:'bang'}>=Object.freeze({kind:'bang',id:effectId,type:admission.weapon==='launcher'?'grenade':'rocket',position:point(admission.position),attackerName:admission.ownerName});
     commands.push(Object.freeze({kind:'transient-birth',event}));admitted.push(Object.freeze({blast,effectId,birthPrefix:receipt,event,...(admission.terminalProjectilePose?{terminalProjectilePose:admission.terminalProjectilePose}:{})}));
     text+=admission.ownerName.length;
    }
    if(claim){claims.push(claim);text+=claim.effectId.length;}
    if(claims.length>MAX_SOLO_CURRENT_BLAST_CLAIMS||commands.length>budgets.maxCommands||text>budgets.maxTextChars)throw Error('Solo CURRENT admission budget exceeded');
   }
   afterHook();
   const frozenClaims=Object.freeze(claims);let result:OriginalSoloCurrentCaptureResult=Object.freeze({blastClaims:frozenClaims});
   let gunPhase:ReceiverGunPhaseCheckpoint|undefined,botProjectileCommit:OriginalSoloBotProjectileCommit|undefined,botSequence:number|undefined;
   let initialized=false,armedSuccessfully=false;
   try{
    if(!binding){
     const resources=createBackends(c);
     // Capture each returned ownership field once. A throwing getter before a
     // usable cleanup hook is obtained remains the trusted factory's boundary.
     const bank=resources?.localWeaponWorld;
     if(bank instanceof OriginalReceiverLocalWeaponWorld)localWeaponWorld=bank;
     const projectileBank=resources?.projectileWorld;
     if(projectileBank instanceof OriginalReceiverProjectileWorld)projectileWorld=projectileBank;
     const loadoutBank=resources?.loadoutWorld;
     if(loadoutBank instanceof OriginalReceiverLoadoutWorld)loadoutWorld=loadoutBank;
     const reportBank=resources?.weaponReportWorld;
     if(reportBank instanceof OriginalReceiverWeaponReportWorld)weaponReportWorld=reportBank;
     const release=resources?.release;
     if(typeof release==='function')cleanup=release.bind(resources);
     const modelBackend=resources?.model,transientBackend=resources?.transient,descriptor=resources?.actorResources,fxDescriptor=resources?.transientResources,pickupHistorySource=resources?.pickupHistorySource,pickupContinuationAt=resources?.pickupContinuationAt;
     afterHook();
     if(!resources||!modelBackend||!transientBackend||release!==undefined&&typeof release!=='function')throw Error('Invalid Solo CURRENT private backends');
     if(descriptor!==undefined){validateOriginalReceiverActorResourceDescriptor(descriptor,65536);if(descriptor.sourceScale!==sourceScale)throw Error('Solo CURRENT actor resource scale mismatch');}
     else if(requireActorResources)throw Error('Missing required Solo CURRENT actor resources');
     if(fxDescriptor!==undefined){validateOriginalReceiverTransientResourceDescriptor(fxDescriptor,65536);if(fxDescriptor.sourceScale!==sourceScale)throw Error('Solo CURRENT transient resource scale mismatch');}
     else if(requireTransientResources)throw Error('Missing required Solo CURRENT transient resources');
     transientResources=fxDescriptor;
     actorResources=descriptor;
     if((bank!==undefined)!==(captureLocalWeaponCallback!==undefined)||bank!==undefined&&!localWeaponWorld)throw Error('Unpaired Solo CURRENT local weapon capture');
     if(reportBank!==undefined&&!weaponReportWorld)throw Error('Invalid Solo CURRENT weapon report bank');
     if((loadoutBank!==undefined)!==(captureLoadoutProgram!==undefined)||loadoutBank!==undefined&&(!loadoutWorld||!localWeaponWorld))throw Error('Unpaired Solo CURRENT loadout capture');
     if(projectileBank!==undefined&&!projectileWorld||projectileBank!==undefined&&!captureProjectileProgram&&!captureBotProjectileProgram&&!captureLoadoutProgram||(captureProjectileProgram!==undefined||captureBotProjectileProgram!==undefined)&&projectileBank===undefined)throw Error('Unpaired Solo CURRENT projectile capture');
     if(captureIncomingLaunches&&!projectileWorld)throw Error('Incoming Solo launch capture requires projectile bank');
     environment=new OriginalReceiverCurrentEnvironment({...budgets,sourceScale,sceneGeneration:c.lifeGeneration,target:c.target,barrels:c.barrels,doors:c.doors,localWeaponWorld,projectileWorld,loadoutWorld,pickupContinuationAt,weaponReportWorld,localHitscan:resources.localHitscan,snapshotAt:(prefix,state,actors)=>{if(!pending)throw Error('Solo CURRENT snapshot without plan');return snapshotAt(prefix,state,pending.context,actors);}});
     controller=new OriginalReceiverSceneController(modelBackend,transientBackend,environment,{...controllerOptions,model:{...controllerOptions.model,sourceScale,sceneGeneration:c.lifeGeneration}},pickupHistorySource);
     binding=Object.freeze({observer:c.observer,target:c.target,body:c.body,health:c.health,barrels:c.barrels,doors:c.doors,projectiles:c.projectiles,blasts:c.blasts});initialized=true;
    }
    if(goody?.weapon===null&&(!loadoutWorld||loadoutWorld.freeze().selected!==null))throw Error('Solo CURRENT VOID goody requires committed VOID loadout');
    const callback:ReceiverScenePrefix=Object.freeze({kind:'callback',sceneGeneration:c.lifeGeneration,callback:c.order.callbacks});
    let program:OriginalSoloLocalWeaponCallbackCapture|undefined;
    let localCommands:readonly ReceiverCurrentEnvironmentCommand[]=Object.freeze([]),localCount=0;
    if(c.deliveryKind==='where'&&goody&&localWeaponWorld){
     program=captureLocalWeaponCallback!(c,callback,localWeaponWorld.freeze());afterHook();
     const suppliedCommands=program?.commands;
     if(!program||!Array.isArray(suppliedCommands))throw Error('Solo CURRENT callback command budget exceeded');localCommands=suppliedCommands;localCount=suppliedCommands.length;
    }
    let receiptCommands:readonly ReceiverCurrentEnvironmentCommand[]=commands,callbackCommands:readonly ReceiverCurrentEnvironmentCommand[]=localCommands;
    if(projectileWorld||loadoutWorld){
     const prefixes=Object.freeze({receipt,...(c.deliveryKind==='where'?{callback}:{})});
     const suppliedProgram=loadoutWorld
      ?captureLoadoutProgram!(c,prefixes,Object.freeze({loadout:loadoutWorld.freeze(),...(projectileWorld?{projectiles:projectileWorld.freeze()}: {})}),Object.freeze(admitted))
      :captureBotProjectileProgram?captureBotProjectileProgram(c,prefixes,projectileWorld!.freeze(),Object.freeze(admitted)):captureProjectileProgram!(c,prefixes,projectileWorld!.freeze(),Object.freeze(admitted));afterHook();
     const receiptInput=suppliedProgram?.receiptCommands,callbackInput=suppliedProgram?.callbackCommands;
     const gunResult=loadoutWorld?(suppliedProgram as OriginalSoloLoadoutProgram)?.gunPhase:undefined;
     const gunCheckpoint=gunResult?.checkpoint,savedGunPhase=gunResult?.gunPhase;
     if(gunResult!==undefined){
      if(c.deliveryKind!=='where'||!gunCheckpoint)throw Error('Gun result requires a living callback');
      const captured=copyReceiverGunPhaseCheckpoint({prefix:gunCheckpoint.prefix as ReceiverGunPhaseCheckpoint['prefix'],phase:savedGunPhase!});
      if(captured.prefix.sceneGeneration!==callback.sceneGeneration||captured.prefix.callback!==callback.callback)throw Error('Foreign or stale Solo gun result prefix');
      gunPhase=captured;
     }
     if(!Array.isArray(receiptInput))throw Error('Invalid Solo CURRENT projectile program frames');
     if(c.deliveryKind==='where'?!Array.isArray(callbackInput):callbackInput!==undefined)throw Error('Invalid Solo CURRENT projectile program frames');
     const receiptCount=receiptInput.length,callbackCount=callbackInput?.length??0;
     if(![receiptCount,callbackCount,localCount].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=budgets.maxCommands)||receiptCount+callbackCount+localCount>budgets.maxCommands)throw Error('Solo CURRENT combined command budget exceeded');
     if(localWeaponWorld&&localCount!==0)throw Error('Solo CURRENT combined callback requires empty local commands');
     const claimedIds=new Set(claims.map(claim=>claim.effectId));let marker=0,markerText=0;
     const validateOrdinary=(command:ReceiverCurrentEnvironmentCommand,kind:string|undefined):ReceiverCurrentEnvironmentCommand=>{
      if(!command)throw Error('Invalid Solo CURRENT ordinary command');
      if(kind==='projectile-retire')throw Error('Raw Solo CURRENT projectile retirement unsupported');
      if(kind==='transient-birth'){
       const event=(command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'transient-birth'}>).event;if(!event)throw Error('Invalid Solo CURRENT ordinary birth');const eventKind=event.kind,id=event.id;
       if(claimedIds.has(id))throw Error('Solo CURRENT command collides with claimed effect');
       let copy:OriginalReceiverTransientBirth;
       switch(eventKind){
        case 'muzzle':copy=Object.freeze({kind:eventKind,id,weapon:event.weapon,gunPose:event.gunPose});break;
        case 'bang':{const type=event.type;copy=type==='barrel'?Object.freeze({kind:eventKind,id,type,position:event.position,attackerName:event.attackerName}):Object.freeze({kind:eventKind,id,type,position:event.position,attackerName:event.attackerName});break;}
        case 'puff':copy=Object.freeze({kind:eventKind,id,position:event.position,angleSourceDegrees:event.angleSourceDegrees});break;
        case 'miss':copy=Object.freeze({kind:eventKind,id,position:event.position,normal:event.normal});break;
        case 'blood':copy=Object.freeze({kind:eventKind,id,position:event.position});break;
        default:throw Error('Invalid Solo CURRENT ordinary birth kind');
       }
       return Object.freeze({kind,event:copy});
      }
      switch(kind){
       case 'barrel-hurt':{const c=command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'barrel-hurt'}>,id=c.id,birthId=c.birthId;if(claimedIds.has(birthId))throw Error('Solo CURRENT command collides with claimed effect');return Object.freeze({kind,id,birthId});}
       case 'door-open':{const c=command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'door-open'}>;return Object.freeze({kind,name:c.name,atSeconds:c.atSeconds});}
       case 'weapon-whichgun':return Object.freeze({kind,weapon:(command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'weapon-whichgun'}>).weapon});
       case 'weapon-equip':return Object.freeze({kind,weapon:(command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'weapon-equip'}>).weapon});
       case 'weapon-reload':case 'weapon-fire':return Object.freeze({kind});
       case 'local-hitscan':return Object.freeze({kind,action:(command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'local-hitscan'}>).action});
       case 'gun-output':return Object.freeze({kind,output:copyReceiverGunOutput((command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'gun-output'}>).output)});
       case 'weapon-finish':case 'weapon-report-send':return Object.freeze({kind});
       case 'loadout-capture':return Object.freeze({kind,checkpoint:(command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'loadout-capture'}>).checkpoint});
       case 'ammo-pickup':return Object.freeze({kind,pickupId:(command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'ammo-pickup'}>).pickupId});
       case 'weapon-rocket':return Object.freeze({kind,loadedRocket:(command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'weapon-rocket'}>).loadedRocket});
       case 'projectile-pose':{const c=command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'projectile-pose'}>;return Object.freeze({kind,launchId:c.launchId,model:c.model});}
       case 'projectile-capture-model':{const c=command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'projectile-capture-model'}>;return Object.freeze({kind,handle:c.handle,model:c.model});}
       case 'projectile-birth':{const b=(command as Extract<ReceiverCurrentEnvironmentCommand,{kind:'projectile-birth'}>).birth;if(!b)throw Error('Invalid Solo CURRENT ordinary projectile birth');const onRecycled=b.onRecycled;return Object.freeze({kind,birth:Object.freeze({launchId:b.launchId,weapon:b.weapon,cloneFresh:b.cloneFresh,resetModel:b.resetModel,...(onRecycled!==undefined?{onRecycled}:{})})});}
       default:throw Error('Invalid Solo CURRENT ordinary command kind');
      }
     };
     const normalized:ReceiverCurrentEnvironmentCommand[]=[];
     for(let commandIndex=0;commandIndex<receiptCount;commandIndex++){
      const command=receiptInput[commandIndex] as OriginalSoloProjectileReceiptCommand;
      const kind=command?.kind;
      if(kind==='admitted-bang'||kind==='admitted-projectile-retire'){
       const blast=command.blast,expected=admitted[marker++];if(!expected||blast!==expected.blast)throw Error('Missing, repeated or unordered Solo CURRENT admitted bang');
       if(kind==='admitted-projectile-retire'){
        const launchId=command.launchId;if(typeof launchId!=='string'||!launchId)throw Error('Invalid Solo CURRENT private projectile owner');markerText+=launchId.length;if(markerText>budgets.maxTextChars)throw Error('Solo CURRENT marker text budget exceeded');
        normalized.push(Object.freeze({kind:'projectile-retire',launchId,event:expected.event}));
       }else normalized.push(Object.freeze({kind:'transient-birth',event:expected.event}));
      }else{
       if(captureBotProjectileProgram&&kind!=='projectile-pose'&&kind!=='projectile-capture-model')throw Error('Invalid authored bot projectile receipt command');
       normalized.push(validateOrdinary(command,kind));
      }
     }
     if(marker!==admitted.length)throw Error('Missing Solo CURRENT admitted bang');
     const normalizedCallback:ReceiverCurrentEnvironmentCommand[]=[];
     for(let commandIndex=0;commandIndex<callbackCount;commandIndex++){
      const command=callbackInput![commandIndex] as ReceiverCurrentEnvironmentCommand;
      normalizedCallback.push(validateOrdinary(command,command?.kind));
     }
     const captures=normalizedCallback.flatMap((command,index)=>command.kind==='loadout-capture'?[{command,index}]:[]);
     if(gunPhase){
      // Ordered translation exposes temporary refill/counter/selection state
      // to query and constructor commands. The exact helper result still owns
      // one terminal capture; no later capture may overwrite it before pickups.
      const exact=captures.filter(capture=>capture.command.checkpoint===gunCheckpoint);
      if(exact.length>1)throw Error('Repeated Solo callback loadout capture');
      const capture=captures[captures.length-1],firstFollowing=normalizedCallback.findIndex(command=>command.kind==='weapon-finish'||command.kind==='ammo-pickup');
      if(exact.length!==1||!capture||capture!==exact[0]||firstFollowing>=0&&capture.index>=firstFollowing)throw Error('Gun result must precede finish/pickups in its exact terminal loadout capture');
     }
     const rawAdmissions=loadoutWorld?(suppliedProgram as OriginalSoloLoadoutProgram).launchAdmissions:undefined;
     if(captureBotProjectileProgram){
      const rawBot=(suppliedProgram as OriginalSoloBotProjectileProgram).botLaunchAdmissions;
      if(!Array.isArray(rawBot)||rawBot.length>64)throw Error('Solo bot launch admission budget exceeded');
      if(c.deliveryKind==='where'){
       if(!captureIncomingLaunches||!c.reserveLaunch)throw Error('Solo bot launch admission requires joint incoming capture');
       const checked=validateOriginalSoloBotProjectileAdmissions(rawBot,{context:c,callback,callbackCommands:normalizedCallback,committedSequence:committedBotSequence,maxAdmissions:64,maxTextChars:budgets.maxTextChars>65536?65536:budgets.maxTextChars});
       botSequence=checked.lastSequence;botProjectileCommit=Object.freeze({prefix:Object.freeze({...callback}),shots:checked.shots});
       result=Object.freeze({blastClaims:frozenClaims,launchAdmissions:checked.admissions});
      }else if(rawBot.length!==0)throw Error('Solo death receipt cannot admit bot launches');
     }
     if(rawAdmissions!==undefined){
      const rawIntents=gunResult?.intents;
      if(!gunPhase||!Array.isArray(rawAdmissions)||!Array.isArray(rawIntents))throw Error('Invalid Solo gun launch admission program');
      const admissionCount=rawAdmissions.length,intentCount=rawIntents.length;
      if(![admissionCount,intentCount].every(count=>Number.isSafeInteger(count)&&count>=0&&count<=64))throw Error('Solo gun launch admission budget exceeded');
      const explosive:('launcher'|'rpg')[]=[];
      for(let i=0;i<intentCount;i++){
       const intent=rawIntents[i];if(intent?.kind!=='fire')continue;
       const action=intent.action,weapon=intent.weapon;
       if(action==='grenade-constructor'||action==='rocket-constructor'){
        if(weapon!==(action==='grenade-constructor'?'launcher':'rpg')||gunPhase.phase?.weapon!==weapon)throw Error('Invalid Solo saved explosive intent');
        explosive.push(weapon as 'launcher'|'rpg');
       }
      }
      if(admissionCount!==explosive.length)throw Error('Missing or repeated Solo gun launch admissions');
      if(admissionCount>0&&(!captureIncomingLaunches||!projectileWorld||!c.reserveLaunch))throw Error('Invalid Solo gun launch admission program');
      const admissions:OriginalSoloReservedLaunchAdmission[]=[],ids=new Set<string>();
      for(let i=0;i<admissionCount;i++){
       const admission=rawAdmissions[i];if(!admission||!Object.isFrozen(admission))throw Error('Invalid Solo gun launch admission');
       if(admission.ok){
        const launch=admission.reservation?.launch;
        if(!launch||launch.ownerId!==c.id||launch.ownerLife!==c.lifeGeneration||launch.ownerName!==c.name||launch.weapon!==explosive[i]||ids.has(launch.id))throw Error('Foreign Solo gun launch reservation');
        ids.add(launch.id);
        const births=normalizedCallback.flatMap((command,index)=>command.kind==='projectile-birth'&&command.birth.launchId===launch.id?[{command,index}]:[]);
        const finish=normalizedCallback.findIndex(command=>command.kind==='weapon-finish'||command.kind==='ammo-pickup');
        if(births.length!==1||births[0].command.birth.weapon!==launch.weapon||finish>=0&&births[0].index>=finish)throw Error('Solo reserved constructor must birth its exact model before finish/pickups');
       }else if(admission.reason!=='projectile-cap')throw Error('Invalid Solo gun launch rejection');
       admissions.push(admission);
      }
      result=Object.freeze({blastClaims:frozenClaims,launchAdmissions:Object.freeze(admissions)});
     }else if(captureIncomingLaunches&&gunPhase){
      const intents=gunResult!.intents,count=intents.length;if(!Number.isSafeInteger(count)||count>64)throw Error('Solo gun intent budget exceeded');
      for(let i=0;i<count;i++){const intent=intents[i];if(intent?.kind==='fire'&&(intent.action==='grenade-constructor'||intent.action==='rocket-constructor'))throw Error('Missing Solo explosive constructor admission');}
     }
     afterHook();receiptCommands=Object.freeze(normalized);callbackCommands=Object.freeze(normalizedCallback);
    }else if(!Number.isSafeInteger(localCount)||localCount<0||commands.length+localCount>budgets.maxCommands)throw Error('Solo CURRENT callback command budget exceeded');
    const frames=c.deliveryKind==='where'?[{prefix:receipt,commands:receiptCommands},{prefix:callback,commands:callbackCommands,...(program?{localWeapon:{cameraWorldMatrix:program.cameraWorldMatrix,velocityWorld:program.velocityWorld}}:{})}]:[{prefix:receipt,commands:receiptCommands}];
    environment!.arm({physicalCallback:c.physicalCallback,goody,frames});armedSuccessfully=true;afterHook();pending=Object.freeze({context:c,goody,fingerprint,claims:frozenClaims,result,blasts:new Map(c.blasts),projectiles:new Map(c.projectiles),...(gunPhase?{gunPhase}:{}),...(botProjectileCommit?{botProjectileCommit,botSequence}:{})});return result;
   }catch(error){if(initialized||!binding||armedSuccessfully||captureFailed){closed=true;try{releaseResources();}finally{pending=undefined;committed=new Map();environment=undefined;controller=undefined;binding=undefined;}}throw error;}
   }catch(error){if(captureFailed&&!closed){closed=true;try{active?.rollback();}finally{active=undefined;pending=undefined;committed=new Map();binding=undefined;environment=undefined;controller=undefined;releaseResources();}}throw error;}finally{capturing=false;}
  },
  ...(captureIncomingLaunches?{finalizeCurrentCapture:(c:OriginalSoloReceiverCurrentContext,incoming:readonly OriginalSoloIncomingLaunch[]):void=>{
   if(capturing){captureFailed=true;throw Error('Recursive Solo launch receipt finalization');}
   if(physicalActive)throw Error('Solo launch receipt finalization during physical puff transaction');
   capturing=true;captureFailed=false;
   try{
    check();if(active||physicalActive||!pending||!environment||!projectileWorld||c.deliveryKind!=='where')throw Error('Solo launch finalization without captured callback');
    validateContext(c);if(pending.fingerprint!==watch(c)||!compatible(pending.context,c))throw Error('Changed Solo launch finalization context');
    if(!Array.isArray(incoming))throw Error('Solo incoming launch budget exceeded');
    const count=incoming.length;if(!Number.isSafeInteger(count)||count<0||count>maxProjectiles)throw Error('Solo incoming launch budget exceeded');
    if(finalizedIncoming!==undefined){if(count!==finalizedIncoming.length)throw Error('Changed finalized Solo launch receipts');for(let i=0;i<count;i++)if(incoming[i]!==finalizedIncoming[i])throw Error('Changed finalized Solo launch receipts');return;}
    const ids=new Set<string>();let text=0;const captured:OriginalSoloIncomingLaunch[]=[];
    for(let i=0;i<count;i++){
     const row=incoming[i],reservation=row?.reservation,launch=reservation?.launch;
     if(!row||!reservation||!launch||!Object.isFrozen(row)||!Object.isFrozen(reservation)||!Object.isFrozen(launch)||row.prototype!==reservation.prototype||!Object.isFrozen(row.prototype)||launch.ownerId===c.id||ids.has(launch.id))throw Error('Invalid Solo incoming constructor');
     text+=launch.id.length+launch.ownerId.length+launch.ownerName.length;if(text>budgets.maxTextChars)throw Error('Solo incoming constructor text budget exceeded');ids.add(launch.id);captured.push(row);
    }
    const rows=Object.freeze(captured),prefix:ReceiverScenePrefix=Object.freeze({kind:'receipt',sceneGeneration:c.lifeGeneration,callback:c.order.receiptCallbacks,tick:c.receiptTick});
    const supplied=count?captureIncomingLaunches(c,prefix,rows,projectileWorld.freeze()):Object.freeze([]);afterHook();
    if(!Array.isArray(supplied))throw Error('Solo incoming model command budget exceeded');
    const commandCount=supplied.length;if(!Number.isSafeInteger(commandCount)||commandCount<0||commandCount>budgets.maxCommands)throw Error('Solo incoming model command budget exceeded');
    const births=new Set<string>(),commands:ReceiverCurrentEnvironmentCommand[]=[];
    for(let i=0;i<commandCount;i++){
     const command=supplied[i],kind=command?.kind;
     if(kind==='projectile-birth'){
      const raw=command.birth;if(!raw)throw Error('Invalid Solo incoming model birth');
      const birth=Object.freeze({launchId:raw.launchId,weapon:raw.weapon,cloneFresh:raw.cloneFresh,resetModel:raw.resetModel,onRecycled:raw.onRecycled});
      const launch=rows.find(row=>row.reservation.launch.id===birth.launchId)?.reservation.launch;
      if(!launch||births.has(birth.launchId)||birth.weapon!==launch.weapon)throw Error('Foreign or repeated Solo incoming model birth');births.add(birth.launchId);commands.push(Object.freeze({kind,birth}));
     }else if(kind==='projectile-pose'){
      const launchId=command.launchId,model=command.model;if(!ids.has(launchId))throw Error('Foreign Solo incoming model pose');commands.push(Object.freeze({kind,launchId,model}));
     }
     else throw Error('Invalid Solo incoming model command');
    }
    if(births.size!==ids.size)throw Error('Missing Solo incoming constructor model');
    environment.appendReceiptCommands(prefix,Object.freeze(commands));afterHook();finalizedIncoming=rows;
   }catch(error){closed=true;try{active?.rollback();}finally{active=undefined;pending=undefined;finalizedIncoming=undefined;committed=new Map();binding=undefined;environment=undefined;controller=undefined;releaseResources();}throw error;}finally{capturing=false;}
  }}:{}),
  drainOutcomes:()=>{if(capturing){captureFailed=true;throw Error('Solo CURRENT drain during capture');}check();return environment?.drainOutcomes()??Object.freeze([]);},
  drainLoadoutIntents:()=>{if(capturing){captureFailed=true;throw Error('Solo CURRENT drain during capture');}check();return environment?.drainLoadoutIntents()??Object.freeze([]);},
  drainLocalHitscanOutcomes:()=>{if(capturing){captureFailed=true;throw Error('Solo CURRENT drain during capture');}check();return environment?.drainLocalHitscanOutcomes()??Object.freeze([]);},
  drainWeaponReports:()=>{if(capturing){captureFailed=true;throw Error('Solo CURRENT drain during capture');}check();return environment?.drainWeaponReports()??Object.freeze([]);},
  drainGunOutputs:()=>{if(capturing){captureFailed=true;throw Error('Solo CURRENT drain during capture');}check();return environment?.drainGunOutputs()??Object.freeze([]);},
  readTransientResources:()=>{if(capturing){captureFailed=true;throw Error('Solo CURRENT transient resource read during capture');}check();return committedTransientResources;},
  readActorResources:()=>{if(capturing){captureFailed=true;throw Error('Solo CURRENT actor resource read during capture');}check();return committedActorResources;},
  readLoadoutState:()=>{check();return loadoutWorld?.freeze();},
  readGunPhaseState:()=>{check();return committedGunPhase;},
  readLocalWeaponState:()=>{check();return localWeaponWorld?.freeze();},
  readProjectileState:()=>{check();return projectileWorld?.freeze();},
  readBotProjectileCommit:()=>{check();return committedBotProjectileCommit;},
  ...(transientState?{preparePhysicalPuff:(context:OriginalSoloPhysicalPuffContext)=>{
   if(capturing){captureFailed=true;throw Error('Solo CURRENT physical puff during capture');}
   check();
   if(!isOriginalSoloPhysicalPuffContext(context)||!binding||!controller||!committedGoody||pending||active||physicalActive)throw Error('Invalid Solo CURRENT physical puff boundary');
   const world=context.observer,projectile=context.projectile,event=context.event,prefix=context.prefix,expected=controller.debugState().prefix;
   if(world!==binding.observer||world!==binding.target||world.body!==binding.body||world.health!==binding.health||world.barrels!==binding.barrels||world.doors!==binding.doors||world.projectiles!==binding.projectiles||world.blasts!==binding.blasts
    ||!world.alive||!expected||!sameReceiverScenePrefix(prefix,expected)||prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback
    ||!Number.isSafeInteger(context.physicalCallback)||context.physicalCallback<1||context.physicalCallback!==world.callback||!Number.isFinite(context.time)||context.time!==world.updatedAt
    ||!projectile||projectile.state.weapon!=='rpg'||projectile.launch.weapon!=='rpg'||Map.prototype.get.call(world.projectiles,projectile.launch.id)!==projectile
    ||event.kind!=='puff'||!finite(event.position)||event.position.x!==projectile.state.position.x||event.position.y!==projectile.state.position.y||event.position.z!==projectile.state.position.z)throw Error('Foreign Solo CURRENT physical puff context');
   const goody=Object.freeze({...committedGoody,weapon:loadoutWorld?loadoutWorld.freeze().selected:committedGoody.weapon});
   capturing=true;captureFailed=false;let stage:ReturnType<OriginalReceiverSceneController['preparePhysicalPuff']>|undefined;
   try{stage=controller.preparePhysicalPuff(prefix,goody,event);afterHook();physicalActive=stage;}
   catch(error){stage?.rollback();throw error;}finally{capturing=false;}
   const prepared=stage!;let open=true;
   return Object.freeze({checkpoint:prepared.checkpoint,commit:()=>{check();if(!open||physicalActive!==prepared)throw Error('Solo CURRENT physical puff stage closed');prepared.commit();open=false;physicalActive=undefined;},rollback:()=>{if(!open)return;open=false;try{prepared.rollback();}finally{if(physicalActive===prepared)physicalActive=undefined;}}});
  }}:{}),
  release:()=>{if(closed)return;closed=true;try{physicalActive?.rollback();}finally{physicalActive=undefined;committedGoody=undefined;try{active?.rollback();}finally{active=undefined;pending=undefined;committed=new Map();binding=undefined;environment=undefined;controller=undefined;releaseResources();}}},
 });
}
