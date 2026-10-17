import {validateOriginalReceiverTransientResourceDescriptor,type ReceiverTransientResourceDescriptor} from './originalReceiverTransientResourceDescriptor';
import {validateOriginalReceiverTransientCheckpoint,type ReceiverTransientCheckpoint} from './originalReceiverTransientCheckpoint';
import type {OriginalReceiverTransientBirth} from './originalReceiverTransientWorld';
import type {BufferGeometry} from 'three';
import type {Vec3,WeaponId,OriginalPlayerMovementMode} from './protocol';
import type {ArenaRayHit,ArenaRaycastOptions} from './arenaCollision';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {OriginalMapRuntime} from './originalMapRuntime';
import type {OriginalDoorWorld} from './originalDoorWorld';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {OriginalRemoteView,type OriginalRemoteViewPose,type OriginalRemoteViewResult,type OriginalRemoteViewDelivery,type OriginalRemoteViewSnapshot} from './originalRemoteView';
import {MAX_ORIGINAL_REMOTE_SHOTS} from './originalRemoteShots';
import {originalAsciiNamesEqual} from './originalNameComparison';
import {planOriginalSoloWeaponReportDamage,type SoloWeaponReportDamagePlan} from './originalSoloWeaponReportDamage';
import {OriginalSoloLaunchBatch,type OriginalSoloIncomingLaunch,type OriginalSoloReservedLaunchAdmission,type OriginalSoloLaunchSpawnPublication} from './originalSoloLaunchBatch';
import {createOriginalPlayerBody,originalPlayerEye,stepOriginalPhysicsWorld,type OriginalPlayerBody,type OriginalPlayerControls,type OriginalPhysicsContactDiagnostic} from './originalPlayerPhysics';
import {applyOriginalPlayerMovementControls} from './copyPlayerControls';
import {createOriginalPlayerHealth,stepOriginalPlayerHealth,applyOriginalPlayerDamage,type OriginalPlayerHealthState} from './originalPlayerHealth';
import {createOriginalProjectile,stepOriginalProjectileActor,createOriginalBlast,stepOriginalBlast,ORIGINAL_COLLISION_CONTACT_DISTANCE,type OriginalProjectileState,type OriginalBlastState} from './originalExplosives';
import {OriginalSoldierCollision,type OriginalSoldierCollisionAssets} from './originalSoldierCollision';
import {raycastOriginalSky} from './originalSkyRay';
import {raycastOriginalProjectileModel,originalProjectileModelQuaternion,type OriginalProjectileModelPose} from './originalProjectileRay';
import type {ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {copyReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponCheckpoint';
import type {ReceiverProjectileWorldCheckpoint} from './originalReceiverProjectileWorld';
import {copyReceiverProjectileWorldCheckpoint} from './originalReceiverProjectileCheckpoint';
import type {ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {copyReceiverWeaponReportPayload,type ReceiverWeaponReportPayload} from './originalReceiverWeaponReportWorld';
import type {ReceiverCurrentWeaponReportPublication} from './originalReceiverCurrentEnvironment';
import type {ReceiverCurrentGunOutputPublication} from './originalReceiverCurrentEnvironment';
import {copyReceiverPickupOutputChunk,type ReceiverPickupOutputChunk,type ReceiverPickupOutputDescriptor} from './originalReceiverPickupOutput';
import type {ReceiverModelTransitionCopyOptions} from './originalReceiverModelTransitions';
import {assertReceiverPickupOutputDescriptorRegistry} from './originalReceiverPickupOutputDescriptor';
import {copyReceiverGunOutput,receiverGunOutputTextChars,type ReceiverGunOutput} from './originalReceiverGunOutput';
import {copyReceiverGunPhaseCheckpoint,type ReceiverGunPhaseCheckpoint} from './originalReceiverGunPhase';
import {copyReceiverLocalHitscanOutcomes,type ReceiverLocalHitscanOutcome} from './originalReceiverLocalHitscan';
import type {ReceiverSceneWorld,ReceiverSceneTransaction,ReceiverModelTransition} from './originalReceiverModelWorld';
import {validateOriginalReceiverActorRegistrySnapshot,type ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import {copyReceiverModelTransitions} from './originalReceiverModelTransitions';
import {copyReceiverShotModels,type ReceiverShotModel} from './originalReceiverShotModels';
import {validateOriginalReceiverActorResourceDescriptor,type ReceiverActorResourceDescriptor} from './originalReceiverActorResourceDescriptor';
import type {ReceiverCurrentHurtOutcome,ReceiverCurrentLoadoutPublication} from './originalReceiverCurrentEnvironment';
import {validateReceiverScenePrefix,sameReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import {isOriginalSoloBotShotCapture} from './originalSoloBotShotCapture';
import type {OriginalSoloBotProjectileCommit} from './originalSoloBotProjectileAdmissions';

const vector=(v:Readonly<Vec3>):Vec3=>({x:v.x,y:v.y,z:v.z});
const immutable=(v:Vec3):Readonly<Vec3>=>Object.freeze(vector(v));
export interface OriginalSoloLaunch {
 readonly id:string;readonly sequence:number;readonly ownerId:string;readonly ownerLife:number;readonly ownerName:string;
 readonly weapon:'launcher'|'rpg';readonly eye:Readonly<Vec3>;readonly direction:Readonly<Vec3>;readonly sourceRotation?:Readonly<Vec3>;
 readonly birthCallback:number;readonly time:number;
}
export interface OriginalSoloProjectile {readonly launch:OriginalSoloLaunch;readonly state:OriginalProjectileState}
export interface OriginalSoloBlast {readonly launch:OriginalSoloLaunch;readonly state:OriginalBlastState}
export interface OriginalSoloObserver {
 readonly id:string;name:string;readonly lifeGeneration:number;readonly cutoff:number;
 body:OriginalPlayerBody;health:OriginalPlayerHealthState;alive:boolean;
 readonly barrels:OriginalBarrelWorld;readonly doors?:OriginalDoorWorld;doorEpoch:number;
 readonly projectiles:Map<string,OriginalSoloProjectile>;readonly blasts:Map<string,OriginalSoloBlast>;
 readonly mirror:OriginalRemoteView;actorNames:Map<string,{name:string;lifeGeneration:number}>;
 yaw:number;motionTime:number;weapon?:'pistol'|'shotgun'|'rifle'|'launcher'|'rpg'|'sniper';
 /** Latest actual committed loadout owner capture; never derived from feedback. */
 loadout?:ReceiverLoadoutCheckpoint;
 /** Saved callback gate; independent of final loadout and not canFire state. */
 gunPhase?:ReceiverGunPhaseCheckpoint;
 /** Actual committed local model/motion bank, independently of loadout logic. */
 localWeapons?:ReceiverLocalWeaponWorldCheckpoint;
 /** Exact detached outcomes from the latest committed scene drain. */
 localHitscanOutcomes?:readonly ReceiverLocalHitscanOutcome[];
 /** Issued committed fade constructor notifications, independent of hit hurt. */
 fadeBirths?:readonly Extract<OriginalSoloEvent,{kind:'fade-born'}>[];
 /** Exact immutable committed report publications; identity authenticates delivery. */
 weaponReports?:readonly Extract<OriginalSoloEvent,{kind:'weapon-report'}>[];
 /** Actual immutable committed projectile model owner, distinct from bodies. */
 projectileState?:ReceiverProjectileWorldCheckpoint;
 botProjectileCommit?:OriginalSoloBotProjectileCommit;
 botProjectileOwned?:boolean;
 botProjectileSequence?:number;
 /** Latest actual immutable committed model owner state, not event reconstruction. */
 modelState?:ReceiverActorRegistrySnapshot;
 /** Latest actual committed FX ledger; actor resources do not attest this pack. */
 transientState?:ReceiverTransientCheckpoint;
 /** Stable committed issuer-branded resource binding for this exact life. */
 actorResources?:ReceiverActorResourceDescriptor;
 /** Separate actual FX primitive/texture binding for this exact life. */
 transientResources?:ReceiverTransientResourceDescriptor;
 updatedAt:number;callback:number;receiptTick:number;
}
export type OriginalSoloEvent =
 | {kind:'spawned';recipientId:string;lifeGeneration:number;time:number;launch:OriginalSoloLaunch;state:OriginalProjectileState}
 | {kind:'contact';recipientId:string;lifeGeneration:number;time:number;launch?:OriginalSoloLaunch;velocity:Vec3;otherId?:string}
 | {kind:'detonated';recipientId:string;lifeGeneration:number;time:number;launch:OriginalSoloLaunch;position:Vec3}
 | {kind:'shot';recipientId:string;lifeGeneration:number;time:number;ownerId:string;ownerName:string;weapon:NonNullable<OriginalSoloObserver['weapon']>;position:Vec3}
 | {kind:'door';recipientId:string;lifeGeneration:number;time:number;name:string;ownerId:string;ownerName:string}
 | {kind:'baddy-born';recipientId:string;lifeGeneration:number;time:number;ownerId:string;callback:number;position:Readonly<Vec3>;yaw:number;weapon:NonNullable<OriginalSoloObserver['weapon']>}
 | {kind:'corpse-retired';recipientId:string;lifeGeneration:number;time:number;sequence:number;callback:number}
 | {kind:'baddy-detached';recipientId:string;lifeGeneration:number;time:number;ownerId:string;reason:'death'|'timeout';callback:number;corpseSequence?:number;weapon:NonNullable<OriginalSoloObserver['weapon']>;position:Readonly<Vec3>;yaw:number}
 | {kind:'model-state';recipientId:string;lifeGeneration:number;time:number;checkpoint:ReceiverActorRegistrySnapshot;resources?:ReceiverActorResourceDescriptor}
 | {kind:'transient-state';recipientId:string;lifeGeneration:number;time:number;checkpoint:ReceiverTransientCheckpoint;resources?:ReceiverTransientResourceDescriptor}
 | {kind:'shot-models';recipientId:string;lifeGeneration:number;time:number;shots:readonly ReceiverShotModel[];resources?:ReceiverActorResourceDescriptor}
 | {kind:'model-transitions';recipientId:string;lifeGeneration:number;time:number;transitions:readonly ReceiverModelTransition[]}
 | {kind:'fade-born';recipientId:string;lifeGeneration:number;time:number;transition:Extract<ReceiverModelTransition,{kind:'detach'}>}
 | {kind:'local-weapon-state';recipientId:string;lifeGeneration:number;time:number;checkpoint:ReceiverLocalWeaponWorldCheckpoint}
 | {kind:'projectile-state';recipientId:string;lifeGeneration:number;time:number;checkpoint:ReceiverProjectileWorldCheckpoint}
 | {kind:'bot-projectile-commit';recipientId:string;lifeGeneration:number;time:number;checkpoint:OriginalSoloBotProjectileCommit}
 | {kind:'loadout-state';recipientId:string;lifeGeneration:number;time:number;checkpoint:ReceiverLoadoutCheckpoint}
 | {kind:'gun-phase-state';recipientId:string;lifeGeneration:number;time:number;checkpoint:ReceiverGunPhaseCheckpoint}
 | {kind:'gun-output';recipientId:string;lifeGeneration:number;time:number;prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;commandIndex:number;output:ReceiverGunOutput}
 | {kind:'local-hitscan-outcome';recipientId:string;lifeGeneration:number;time:number;outcome:ReceiverLocalHitscanOutcome}
 | {kind:'weapon-report';recipientId:string;lifeGeneration:number;time:number;prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;report:ReceiverWeaponReportPayload}
 | {kind:'loadout-output';recipientId:string;lifeGeneration:number;time:number;prefix:ReceiverScenePrefix;intent:ReceiverCurrentLoadoutPublication['intent']}
 | {kind:'damaged'|'dead';recipientId:string;lifeGeneration:number;time:number;ownerId?:string;ownerName?:string;launch?:OriginalSoloLaunch;effectId?:string;position?:Vec3;damage:number;health:number};
/** Issued only for an eligible physical RPG actor invocation. */
export interface OriginalSoloPhysicalPuffContext {
 readonly observer:OriginalSoloObserver;readonly prefix:ReceiverScenePrefix;
 readonly physicalCallback:number;readonly time:number;readonly projectile:OriginalSoloProjectile;
 readonly event:Extract<OriginalReceiverTransientBirth,{kind:'puff'}>;
}
const physicalPuffContexts=new WeakSet<object>();
export function isOriginalSoloPhysicalPuffContext(value:unknown):value is OriginalSoloPhysicalPuffContext {
 return !!value&&typeof value==='object'&&physicalPuffContexts.has(value);
}
export interface OriginalSoloPhysicalPuffStage {
 readonly checkpoint:ReceiverTransientCheckpoint;commit():void;rollback():void;
}
export interface OriginalSoloWorldOptions {
 /** Fresh durable storage cohort for each terminal life receipt delivery. */
 readonly createDisposalCohort?:()=>OriginalSoloCurrentCohort;
 templateBarrels?:OriginalBarrelWorld;templateDoors?:OriginalDoorWorld;
 soldierAssets?:OriginalSoldierCollisionAssets;projectileGeometry?:ReadonlyMap<'launcher'|'rpg',BufferGeometry>;
 onEvent?:(event:OriginalSoloEvent)=>void;
 /** Literal source random(36), sampled once for each owned RPG invocation. */
 samplePuffRandom36?:()=>number;
 /** Ordered receiver births/fade retirement for production scene ownership. */
 presentationLifecycle?:boolean;
 /** Explicit Solo canonical-goody adapter for committed remote-name reports.
  * Local ray outcomes alone never admit damage; this supplies no MUS transport
  * or mirrored baddy hurt audio. All health publishes before public callbacks. */
 admitWeaponReportDamage?:boolean;
 /** Trusted complete-inventory integration. Each life must own a fresh scene;
  * Game must not provide this from its human renderer or a world-only ray. */
 createReceiverScene?:(context:OriginalSoloReceiverSceneContext)=>OriginalSoloReceiverSceneLease;
 /** Synchronous in-process transport adapter; false creates no remote actor. */
 deliverLaunch?:(recipient:OriginalSoloObserver,launch:OriginalSoloLaunch)=>boolean;
 deliverDoor?:(recipient:OriginalSoloObserver,name:string,sender:OriginalSoloObserver)=>boolean;
}
export interface OriginalSoloReceiverSceneContext {
 readonly id:string;readonly name:string;readonly lifeGeneration:number;readonly epochMs:number;
 /** Receiver-private live state for a transactional environment. The factory
  * must not mutate it during creation or retain other observers' state. */
 readonly body:OriginalPlayerBody;readonly health:OriginalPlayerHealthState;
 readonly barrels:OriginalBarrelWorld;readonly doors?:OriginalDoorWorld;
}
export const MAX_SOLO_SCENE_OUTCOMES=256;
export const MAX_SOLO_CURRENT_BLAST_CLAIMS=64;
export interface OriginalSoloCurrentBlastClaim {
 readonly blast:OriginalSoloBlast;readonly effectId:string;readonly birthPrefix:ReceiverScenePrefix;
}
export interface OriginalSoloCurrentCaptureResult {
 readonly blastClaims:readonly OriginalSoloCurrentBlastClaim[];
 /** Exact issuer-bound constructor admissions, including the declared cap
  * rejection. A reservation never mutates a live catalog/body during capture. */
 readonly launchAdmissions?:readonly OriginalSoloReservedLaunchAdmission[];
}
export interface OriginalSoloDetonationAdmission {
 readonly physicalCallback:number;readonly position:Readonly<Vec3>;
 readonly weapon:OriginalSoloLaunch['weapon'];readonly ownerName:string;
 /** Actual final physical pose captured before detonation deletes the body. */
 readonly terminalProjectilePose?:OriginalProjectileModelPose;
}
export interface OriginalSoloReceiverCurrentContext {
 readonly observer:OriginalSoloObserver;readonly target:{health:OriginalPlayerHealthState;alive:boolean};
 readonly id:string;readonly name:string;readonly lifeGeneration:number;
 /** Admitted per-life physical callback, including an external skipIds solver.
  * This is not the lagging mirror counter or proof of Havok completion. */
 readonly physicalCallback:number;readonly mirrorCallback:number;readonly receiptTick:number;
 readonly time:number;readonly phase:'idle'|'physics'|'goody';readonly afterGoody:boolean;
 readonly deliveryKind:'where'|'death';readonly order:Readonly<{receiptCallbacks:number;callbacks:number}>;
 readonly body:OriginalPlayerBody;readonly health:OriginalPlayerHealthState;readonly alive:boolean;
 readonly barrels:OriginalBarrelWorld;readonly doors?:OriginalDoorWorld;
 readonly projectiles:OriginalSoloObserver['projectiles'];readonly blasts:OriginalSoloObserver['blasts'];readonly actorNames:OriginalSoloObserver['actorNames'];
 /** Names in this exact incoming where packet, before its GI births publish.
  * Merge with the prior owner map and filter to the inline actor registry.
  * This is not a complete scene inventory. Death receipts have no rows. */
 readonly receiptActorNames:readonly Readonly<{actorId:string;name:string;lifeGeneration:number}>[];
 /** Immutable observed birth payload for this exact currently registered blast.
  * No foreign/manual object, historical geometry or detonation queue is exposed. */
 readonly detonationFor:(blast:OriginalSoloBlast)=>OriginalSoloDetonationAdmission|undefined;
 /** Present only in the two-pass living launch batch. This captures the raw
  * outbound eye/rotation, not the constructor's shifted RPG position. */
 readonly reserveLaunch?:(command:Omit<OriginalSoloLaunchCommand,'ownerId'>,ordinal:number)=>OriginalSoloReservedLaunchAdmission;
 readonly yaw:number;readonly motionTime:number;readonly weapon?:OriginalSoloObserver['weapon'];
}
export interface OriginalSoloReceiverSceneLease {
 readonly scene:ReceiverSceneWorld;
 /** Nonthrowing teardown of this newly owned scene. A rejected reused scene
  * is never released by the coordinator: it may belong to a live observer. */
 readonly release:()=>void;
 /** Paired optional CURRENT hooks. Capture is speculative and must be idempotent
  * for an identical retry; it must not regenerate commands/RNG or mutate live
  * state. Borrowed references are this life only, not historical snapshots.
  * Midphysics/lagging mirror inputs must be rejected rather than replay invented.
  * Drain is trusted nonthrowing and bounded BEFORE return (max256 entries and
  * max65536 attacker-name characters). It consumes only committed outcomes. */
 /** Claims attest a matching same-scene bang command; they do not prove native
  * ordering or complete geometry. Owned effects must be repeated until expiry. */
 readonly captureCurrent?:(context:OriginalSoloReceiverCurrentContext)=>void|OriginalSoloCurrentCaptureResult;
 /** After all sender captures, before any mirror begins. Incoming remote
  * constructors are finalized at this exact private receipt prefix once. */
 readonly finalizeCurrentCapture?:(context:OriginalSoloReceiverCurrentContext,incoming:readonly OriginalSoloIncomingLaunch[])=>void;
 readonly drainOutcomes?:()=>readonly ReceiverCurrentHurtOutcome[];
 /** Optional committed sound/feedback queue. Requires the CURRENT hook pair;
  * bounded before return under the same256-record/65536-character contract. */
 readonly drainLoadoutIntents?:()=>readonly ReceiverCurrentLoadoutPublication[];
 /** Read the actual committed owner checkpoint once after the joint batch.
  * Undefined means no owner; this must never reconstruct state from output. */
 readonly readLoadoutState?:()=>ReceiverLoadoutCheckpoint|undefined;
 /** Actual committed callback result, undefined after a receipt-only batch. */
 readonly readGunPhaseState?:()=>ReceiverGunPhaseCheckpoint|undefined;
 readonly drainLocalHitscanOutcomes?:()=>readonly ReceiverLocalHitscanOutcome[];
 /** Committed explicit source goody reports, cleared before public delivery.
  * This is not a transport send or authority admission. */
 readonly drainWeaponReports?:()=>readonly ReceiverCurrentWeaponReportPublication[];
 /** Already committed ordered semantic outputs. Pure bounded drain before any
  * public callbacks; command indices belong to this exact callback frame. */
 readonly drainGunOutputs?:()=>readonly ReceiverCurrentGunOutputPublication[];
 readonly readLocalWeaponState?:()=>ReceiverLocalWeaponWorldCheckpoint|undefined;
 readonly readProjectileState?:()=>ReceiverProjectileWorldCheckpoint|undefined;
 readonly readBotProjectileCommit?:()=>OriginalSoloBotProjectileCommit|undefined;
 /** Optional committed resource descriptor. Once present it must retain exact
  * identity for this life; metadata never owns or disposes decoded resources. */
 readonly readActorResources?:()=>ReceiverActorResourceDescriptor|undefined;
 readonly readTransientResources?:()=>ReceiverTransientResourceDescriptor|undefined;
 readonly preparePhysicalPuff?:(context:OriginalSoloPhysicalPuffContext)=>OriginalSoloPhysicalPuffStage;
}
export interface OriginalSoloRegistration {
 id:string;name:string;eye:Vec3;velocity?:Vec3;body?:OriginalPlayerBody;health?:OriginalPlayerHealthState;
 barrels?:OriginalBarrelWorld;doors?:OriginalDoorWorld;yaw?:number;motionTime?:number;
}
export interface OriginalSoloLaunchCommand {ownerId:string;weapon:'launcher'|'rpg';eye:Vec3;direction:Vec3;sourceRotation?:Vec3}
export type OriginalSoloAdmission={ok:true;launch:OriginalSoloLaunch}|{ok:false;reason:'missing-owner'|'projectile-cap'|'frozen'};
interface Capture {world:OriginalSoloObserver;projectiles:OriginalSoloProjectile[];blasts:OriginalSoloBlast[]}
interface SoloPreparedCurrentCapture {
 readonly context?:OriginalSoloReceiverCurrentContext;
 readonly nextOwners?:ReadonlyMap<OriginalSoloBlast,OriginalSoloCurrentBlastClaim>;
 readonly launchAdmissions:readonly OriginalSoloReservedLaunchAdmission[];
}
/** One captured callback or receipt-only delivery. The cohort owns durable history;
 * the population retains ownership of clocks, launches and public dispatch. */
export interface OriginalSoloCurrentCohortPlan {
 readonly observer:OriginalSoloObserver;
 readonly prefix:ReceiverScenePrefix;
 readonly receiptTick:number;
 readonly receiptPrefix:Extract<ReceiverScenePrefix,{kind:'receipt'}>;
}
/** Trusted private storage participant. replayComplete drains one observer's
 * bounded output before the next starts. seal runs once after all replays.
 * publish may reject only before durable success; success requires adoption.
 * abort/finish drain private IO before resolving or rejecting (including an
 * in-flight begin), and may not
 * publish observer state themselves. begin must honor cancellation before
 * admitting any new reader/writer ownership after an aborted await. */
export interface OriginalSoloCurrentCohort {
 begin(plans:readonly OriginalSoloCurrentCohortPlan[],signal:AbortSignal):Promise<void>;
 replayComplete(plan:OriginalSoloCurrentCohortPlan,scene:ReceiverSceneTransaction):Promise<void>;
 seal():Promise<void>;
 publish():Promise<void>;
 abort():Promise<void>;
 finish():Promise<void>;
 validatePickupOutput?(plan:OriginalSoloCurrentCohortPlan,descriptor:ReceiverPickupOutputDescriptor):void;
 claimPickupOutput?(plan:OriginalSoloCurrentCohortPlan,descriptor:ReceiverPickupOutputDescriptor,channel:'models'|'fades'|'loadout',sequence:number):Promise<ReceiverPickupOutputChunk>;
 /** Resume only the exact failed claim. The cohort must reconcile durable
  * consumption and retain its bounded chunk before offering this capability. */
 retryPickupOutput?(plan:OriginalSoloCurrentCohortPlan,descriptor:ReceiverPickupOutputDescriptor,channel:'models'|'fades'|'loadout',sequence:number):Promise<ReceiverPickupOutputChunk>;
}
interface SoloPreparedPickupOutput {
 readonly descriptor:ReceiverPickupOutputDescriptor;
 readonly claim:(channel:'models'|'fades'|'loadout',sequence:number)=>Promise<ReceiverPickupOutputChunk>;
 readonly retryClaim?:SoloPreparedPickupOutput['claim'];
 readonly time:number;
 readonly bounds:ReceiverModelTransitionCopyOptions;
}
class SoloPickupReadPending extends Error {
 constructor(readonly failure:unknown,readonly resume?:()=>Promise<void>){
  super('Solo committed streamed callback dispatch failed: pickup output read pending',{cause:failure});
 }
}
interface SoloPreparedDelivery {
 world:OriginalSoloObserver;callback:number;names:Map<string,{name:string;lifeGeneration:number}>;
 stage:Extract<OriginalRemoteViewDelivery,{ok:true}>;events:OriginalSoloEvent[];journal:boolean;
 modelState?:ReceiverActorRegistrySnapshot;transientState?:ReceiverTransientCheckpoint;
 pickupOutput?:SoloPreparedPickupOutput;
}

interface SoloCurrentOperation {
 readonly done:Promise<void>;
 readonly cancel:(reason:unknown)=>void;
 cleanup?:()=>Promise<void>;
 failure?:unknown;
}
interface SoloSuppliedCohortOwnership {
 active:boolean;published:boolean;aborted:boolean;abortWork?:Promise<void>;operation?:SoloCurrentOperation;
 readonly abort:()=>Promise<void>;
}

interface SoloPreparedDisposal {
 world:OriginalSoloObserver;stage:Extract<OriginalRemoteViewDelivery,{ok:true}>;
 events:OriginalSoloEvent[];journal:boolean;modelState?:ReceiverActorRegistrySnapshot;transientState?:ReceiverTransientCheckpoint;
 pickupOutput?:SoloPreparedPickupOutput;
}

interface SoloSceneLocalWeaponStateQueue {world:OriginalSoloObserver;event:Extract<OriginalSoloEvent,{kind:'local-weapon-state'}>}
interface SoloSceneLoadoutStateQueue {world:OriginalSoloObserver;event:Extract<OriginalSoloEvent,{kind:'loadout-state'}>}
interface SoloSceneBotProjectileQueue {world:OriginalSoloObserver;event:Extract<OriginalSoloEvent,{kind:'bot-projectile-commit'}>}
interface SoloSceneProjectileStateQueue {world:OriginalSoloObserver;event:Extract<OriginalSoloEvent,{kind:'projectile-state'}>}
interface SoloSceneGunPhaseStateQueue {world:OriginalSoloObserver;event:Extract<OriginalSoloEvent,{kind:'gun-phase-state'}>}
interface SoloSceneWeaponReportQueue {world:OriginalSoloObserver;events:readonly Extract<OriginalSoloEvent,{kind:'weapon-report'}>[]}
interface SoloSceneGunOutputQueue {world:OriginalSoloObserver;events:readonly Extract<OriginalSoloEvent,{kind:'gun-output'}>[]}
interface SoloSceneLocalHitscanQueue {world:OriginalSoloObserver;events:readonly Extract<OriginalSoloEvent,{kind:'local-hitscan-outcome'}>[]}
interface SoloSceneLoadoutQueue {world:OriginalSoloObserver;events:readonly Extract<OriginalSoloEvent,{kind:'loadout-output'}>[]}
interface SoloSceneOutcomeQueue {world:OriginalSoloObserver;id:string;lifeGeneration:number;outcomes:readonly ReceiverCurrentHurtOutcome[];events:readonly {damaged:OriginalSoloEvent;dead?:OriginalSoloEvent}[]}

/** Browser-safe population coordinator. Exactly one local goody per world;
 * imported geometry is shared, mutable dynamics are private. Fixed 30Hz mirror
 * ordering, synchronous receipt delivery, eight observers/eight live projectiles
 * per stable owner and existing convex/Havok replacements are explicit adapters.
 * No historical restoration or unbounded callback/receipt history is retained. */
export class OriginalSoloObserverWorlds {
 readonly worlds=new Map<string,OriginalSoloObserver>();
 readonly launches=new Map<string,OriginalSoloLaunch>();
 private readonly initialBarrels:OriginalBarrelWorld;
 private readonly initialDoors?:OriginalDoorWorld;
 private readonly lives=new Map<string,number>();
 private readonly pendingShots=new Map<string,number>();
 private readonly receipts=new Map<string,Map<string,number>>();
 private captures:Capture[]=[];
 private actorProgress?:{time:number;captures:Capture[];errors:unknown[];worldIndex:number;blastIndex:number;projectileIndex:number;pending?:{projectile:OriginalSoloProjectile;fingerprint:string;convex:OriginalProjectileState['convex'];referenceConvex:OriginalProjectileState['convex'];next:OriginalProjectileState;detonated:boolean;context?:OriginalSoloPhysicalPuffContext}};
 private preparingActorPuff=false;private actorPuffReentry=false;private actorDispatching=false;
 private readonly transientResourceBindings=new WeakMap<OriginalSoloObserver,ReceiverTransientResourceDescriptor>();
 private readonly actorResourceBindings=new WeakMap<OriginalSoloObserver,ReceiverActorResourceDescriptor>();
 private readonly receiverSceneLeases=new Map<OriginalSoloObserver,OriginalSoloReceiverSceneLease>();
 private readonly usedReceiverScenes=new WeakSet<ReceiverSceneWorld>();
 private readonly physicalCallbacks=new WeakMap<OriginalSoloObserver,number>();
 private readonly completedGoodyCallbacks=new WeakMap<OriginalSoloObserver,number>();
 private readonly observedDetonations=new WeakMap<OriginalSoloBlast,{readonly world:OriginalSoloObserver;readonly physicalCallback:number;readonly position:Readonly<Vec3>;readonly weapon:OriginalSoloLaunch['weapon'];readonly ownerName:string;readonly terminalProjectilePose:OriginalProjectileModelPose}>();
 private readonly blastOwners=new WeakMap<OriginalSoloObserver,ReadonlyMap<OriginalSoloBlast,OriginalSoloCurrentBlastClaim>>();
 private readonly preparedBlastOwners=new WeakMap<Extract<OriginalRemoteViewDelivery,{ok:true}>,ReadonlyMap<OriginalSoloBlast,OriginalSoloCurrentBlastClaim>>();
 private readonly createReceiverScene?:OriginalSoloWorldOptions['createReceiverScene'];
 private readonly admitWeaponReportDamage:boolean;
 private pendingLaunchBatch?:OriginalSoloLaunchBatch;
 private preparingLaunchBatch=false;
 private awaitingCurrent?:object;
 private readonly currentOperations=new Set<SoloCurrentOperation>();
 private readonly suppliedCohorts=new WeakMap<OriginalSoloCurrentCohort,SoloSuppliedCohortOwnership>();
 private currentDrain?:Promise<void>;
 private drainingCurrent=false;
 private clearAfterDrain=false;
 private launchBatchReentry=false;
 private readonly queuedDeaths=new Map<OriginalSoloObserver,number>();
 private deathWork?:Promise<void>;
 private deathFailure?:unknown;
 private deathAdmission=false;
 private sequence=0;private callback=0;private frozen=false;private frozenAt?:number;private phase:'idle'|'physics'|'goody'='idle';
 /** Caller-visible copy phase for resuming an interrupted gameplay callback.
  * This exposes no native Director timing or mutation authority. */
 get callbackPhase():'idle'|'physics'|'goody' {return this.phase;}
 get currentAwaiting():boolean {return !!this.awaitingCurrent||this.drainingCurrent||!!this.deathWork||this.queuedDeaths.size>0||[...this.currentOperations].some(op=>!!op.cleanup);}
 constructor(readonly runtime:OriginalMapRuntime,private readonly options:OriginalSoloWorldOptions={}){
  if(options.samplePuffRandom36!==undefined&&typeof options.samplePuffRandom36!=='function')throw Error('Invalid Solo puff sampler');
  if(options.admitWeaponReportDamage!==undefined&&typeof options.admitWeaponReportDamage!=='boolean')throw Error('Invalid Solo weapon report damage option');
  if(options.createDisposalCohort!==undefined&&typeof options.createDisposalCohort!=='function')throw Error('Invalid Solo disposal cohort factory');
  this.admitWeaponReportDamage=options.admitWeaponReportDamage??false;
  this.createReceiverScene=options.createReceiverScene;
  this.initialBarrels=options.templateBarrels?.fork()??new OriginalBarrelWorld(runtime);
  this.initialBarrels.reset();this.initialDoors=options.templateDoors?.fork();this.initialDoors?.reset();
 }
 register(registration:OriginalSoloRegistration,time=0):OriginalSoloObserver {
  const generation=this.nextLifeGeneration(registration.id);
  if(!Number.isFinite(time)||time<0||!registration.id||!registration.name)throw Error('Invalid solo observer registration');
  const epochMs=time*1000;if(!Number.isFinite(epochMs))throw Error('Invalid solo observer epoch');
  const body=registration.body??createOriginalPlayerBody(registration.id,registration.eye,registration.velocity),health=registration.health??createOriginalPlayerHealth();
  const barrels=registration.barrels??this.initialBarrels.fork(),doors=registration.doors??this.initialDoors?.fork();
  for(const other of this.worlds.values())if(body===other.body||health===other.health||barrels===other.barrels||(doors&&doors===other.doors))throw Error('Aliased solo observer mutable state');
  const lease=this.createReceiverScene?.(Object.freeze({id:registration.id,name:registration.name,lifeGeneration:generation,epochMs,body,health,barrels,...(doors?{doors}:{})}));
  // Never release a reused scene, including malformed optional hooks: its
  // ownership belongs to the original life, not this rejected factory result.
  if(lease?.scene&&this.usedReceiverScenes.has(lease.scene))throw Error('Reused solo receiver scene');
  const captureCurrent=lease?.captureCurrent,drainOutcomes=lease?.drainOutcomes,drainLoadoutIntents=lease?.drainLoadoutIntents,readLoadoutState=lease?.readLoadoutState,readGunPhaseState=lease?.readGunPhaseState,readLocalWeaponState=lease?.readLocalWeaponState,readProjectileState=lease?.readProjectileState,readBotProjectileCommit=lease?.readBotProjectileCommit,readActorResources=lease?.readActorResources,readTransientResources=lease?.readTransientResources;
  const drainLocalHitscanOutcomes=lease?.drainLocalHitscanOutcomes,drainWeaponReports=lease?.drainWeaponReports,drainGunOutputs=lease?.drainGunOutputs,finalizeCurrentCapture=lease?.finalizeCurrentCapture;
  const preparePhysicalPuff=lease?.preparePhysicalPuff;
  const hasCapture=captureCurrent!==undefined,hasDrain=drainOutcomes!==undefined;
  if(this.createReceiverScene&&(!lease||typeof lease.release!=='function'||!lease.scene||typeof lease.scene!=='object'||typeof lease.scene.begin!=='function'
   ||hasCapture!==hasDrain||hasCapture&&(typeof captureCurrent!=='function'||typeof drainOutcomes!=='function')
   ||drainLoadoutIntents!==undefined&&(!hasCapture||typeof drainLoadoutIntents!=='function')
   ||drainLocalHitscanOutcomes!==undefined&&(!hasCapture||typeof drainLocalHitscanOutcomes!=='function')
   ||drainWeaponReports!==undefined&&(!hasCapture||typeof drainWeaponReports!=='function')
   ||drainGunOutputs!==undefined&&(!hasCapture||typeof drainGunOutputs!=='function')
   ||finalizeCurrentCapture!==undefined&&(!hasCapture||typeof finalizeCurrentCapture!=='function')
   ||readLoadoutState!==undefined&&(!hasCapture||typeof readLoadoutState!=='function')
   ||readGunPhaseState!==undefined&&(!hasCapture||typeof readGunPhaseState!=='function'||typeof readLoadoutState!=='function')
   ||readLocalWeaponState!==undefined&&(!hasCapture||typeof readLocalWeaponState!=='function')
   ||readProjectileState!==undefined&&(!hasCapture||typeof readProjectileState!=='function')
   ||readBotProjectileCommit!==undefined&&(!hasCapture||typeof readBotProjectileCommit!=='function')
   ||readActorResources!==undefined&&(!hasCapture||typeof readActorResources!=='function')
   ||readTransientResources!==undefined&&(!hasCapture||typeof readTransientResources!=='function')
   ||preparePhysicalPuff!==undefined&&(!hasCapture||typeof preparePhysicalPuff!=='function'||typeof readTransientResources!=='function'))){
   if(lease&&typeof lease.release==='function')lease.release();throw Error('Invalid solo receiver scene lease');
  }
  if(lease)this.usedReceiverScenes.add(lease.scene);
  let mirror:OriginalRemoteView;
  try{mirror=new OriginalRemoteView(epochMs,{},'source-callback',lease?.scene,this.options.presentationLifecycle??false);}
  catch(error){lease?.release();throw error;}
  const world:OriginalSoloObserver={id:registration.id,name:registration.name,lifeGeneration:generation,cutoff:this.sequence,
   body,health,alive:true,barrels,doors,doorEpoch:time,
   projectiles:new Map(),blasts:new Map(),mirror,actorNames:new Map(),
   yaw:registration.yaw??0,motionTime:registration.motionTime??0,updatedAt:time,callback:0,receiptTick:0};
  if(lease)this.receiverSceneLeases.set(world,Object.freeze({scene:lease.scene,release:lease.release.bind(lease),...(captureCurrent?{captureCurrent:captureCurrent.bind(lease),drainOutcomes:drainOutcomes!.bind(lease),...(finalizeCurrentCapture?{finalizeCurrentCapture:finalizeCurrentCapture.bind(lease)}:{}),...(drainLoadoutIntents?{drainLoadoutIntents:drainLoadoutIntents.bind(lease)}:{}),...(drainLocalHitscanOutcomes?{drainLocalHitscanOutcomes:drainLocalHitscanOutcomes.bind(lease)}:{}),...(drainWeaponReports?{drainWeaponReports:drainWeaponReports.bind(lease)}:{}),...(drainGunOutputs?{drainGunOutputs:drainGunOutputs.bind(lease)}:{}),...(readLoadoutState?{readLoadoutState:readLoadoutState.bind(lease)}:{}),...(readGunPhaseState?{readGunPhaseState:readGunPhaseState.bind(lease)}:{}),...(readLocalWeaponState?{readLocalWeaponState:readLocalWeaponState.bind(lease)}:{}),...(readProjectileState?{readProjectileState:readProjectileState.bind(lease)}:{}),...(readBotProjectileCommit?{readBotProjectileCommit:readBotProjectileCommit.bind(lease)}:{}),...(readActorResources?{readActorResources:readActorResources.bind(lease)}:{}),...(readTransientResources?{readTransientResources:readTransientResources.bind(lease)}:{}),...(preparePhysicalPuff?{preparePhysicalPuff:preparePhysicalPuff.bind(lease)}:{})}:{})}));
  this.physicalCallbacks.set(world,0);
  this.lives.set(world.id,generation);this.epochs.set(world,epochMs);this.worlds.set(world.id,world);return world;
 }
 /** Validate the next registration identity without reserving or advancing it. */
 nextLifeGeneration(id:string):number {
  this.rejectLaunchBatchReentry();
  if(typeof id!=='string'||!id)throw Error('Invalid solo observer identity');
  if(this.worlds.has(id))throw Error('Solo observer life already registered');
  if(this.worlds.size>=8||(!this.lives.has(id)&&this.lives.size>=8))throw Error('Solo observer capacity exceeded');
  const generation=(this.lives.get(id)??0)+1;
  if(!Number.isSafeInteger(generation)||generation<1)throw Error('Solo observer life generation requires reset');return generation;
 }
 dispose(id:string):void {
  this.rejectLaunchBatchReentry();
  const world=this.worlds.get(id);if(!world)return;
  const prepared:{world:OriginalSoloObserver;stage:Extract<OriginalRemoteViewDelivery,{ok:true}>;events:OriginalSoloEvent[];journal:boolean;modelState?:ReceiverActorRegistrySnapshot;transientState?:ReceiverTransientCheckpoint}[]=[];
  try{
   for(const other of this.worlds.values())if(other!==world&&other.alive){const stage=this.prepareRecord(other,{deathPlayerId:id},other.callback),item={world:other,stage,events:[] as OriginalSoloEvent[],journal:false,modelState:undefined as ReceiverActorRegistrySnapshot|undefined,transientState:undefined as ReceiverTransientCheckpoint|undefined};prepared.push(item);const delivery=this.deliveryEvents(other,stage.result,other.actorNames,other.updatedAt,other.callback);item.events=delivery.events;item.journal=delivery.journal;item.modelState=delivery.modelState;item.transientState=delivery.transientState;}
  }catch(error){for(const item of prepared)item.stage.rollback();throw error;}
  this.adoptPreparedDisposal(prepared);
  this.dispatchPreparedDisposal(world,prepared);
 }
 /** Receipt-only durable death delivery. Ordinary population admissions stay
  * fenced until the shared CAS has adopted every peer and retired this life. */
 async disposeAsync(id:string,cohort:OriginalSoloCurrentCohort,signal?:AbortSignal):Promise<void> {
  return this.runSuppliedCohort(cohort,signal,(owned,operation)=>this.disposeOwned(id,cohort,owned,operation));
 }
 private async disposeOwned(id:string,cohort:OriginalSoloCurrentCohort,signal:AbortSignal,operation:SoloCurrentOperation):Promise<void> {
  this.rejectLaunchBatchReentry();
  const world=this.worlds.get(id);if(!world){await this.abortSuppliedCohort(cohort);return;}
  const begin=cohort.begin,flush=cohort.replayComplete,seal=cohort.seal,publish=cohort.publish,abort=()=>this.abortSuppliedCohort(cohort),finish=cohort.finish;
  if([begin,flush,seal,publish,abort,finish].some(hook=>typeof hook!=='function'))throw Error('Invalid Solo CURRENT cohort');
  if(signal?.aborted)throw signal.reason??Error('Solo disposal cancelled');
  const population=[...this.worlds],prepared:SoloPreparedDisposal[]=[],works:Promise<void>[]=[];
  const discovered:{plan:OriginalSoloCurrentCohortPlan;names:OriginalSoloObserver['actorNames'];capture:SoloPreparedCurrentCapture}[]=[];
  const internal=new AbortController();let publishing=false,durable=false,abortWork:Promise<void>|undefined;
  let releaseSeal!:()=>void,rejectSeal!:(error:unknown)=>void;
  const sealed=new Promise<void>((resolve,reject)=>{releaseSeal=resolve;rejectSeal=reject;});void sealed.catch(()=>{});
  const requestAbort=()=>{if(!abortWork){try{abortWork=Promise.resolve(abort.call(cohort));}catch(error){abortWork=Promise.reject(error);}void abortWork.catch(()=>{});}};
  const cancel=(reason:unknown)=>{if(publishing||durable)return;internal.abort(reason);rejectSeal(reason);requestAbort();};
  const onAbort=()=>cancel(signal?.reason??Error('Solo disposal cancelled'));
  const check=()=>{if(internal.signal.aborted)throw internal.signal.reason;};
  const owner={};this.awaitingCurrent=owner;signal?.addEventListener('abort',onAbort,{once:true});
  try{
   if(signal?.aborted)onAbort();check();
   for(const other of this.worlds.values())if(other!==world&&other.alive){
    const receiptTick=other.receiptTick,prefix=Object.freeze({kind:'receipt' as const,sceneGeneration:other.lifeGeneration,callback:other.callback,tick:receiptTick});
    const capture=this.captureRecord(other,{deathPlayerId:id},other.callback);
    const plan=Object.freeze({observer:other,prefix,receiptTick,receiptPrefix:prefix});
    discovered.push({plan,names:other.actorNames,capture});
   }
   check();await begin.call(cohort,Object.freeze(discovered.map(item=>item.plan)),internal.signal);check();
   for(const item of discovered){
    check();let arrived!:()=>void;const arrival=new Promise<void>(resolve=>{arrived=resolve;});
    const other=item.plan.observer,callback=item.plan.prefix.callback,trusted=this.mirrorEpoch(other)+callback*1000/30;
    const work=other.mirror.prepareAsynchronousDelivery({tick:item.plan.receiptTick,sentAt:trusted,targets:[],deathPlayerId:id},
     {callbacks:callback,receiptCallbacks:callback},trusted,async scene=>{
      check();await flush.call(cohort,item.plan,scene);check();arrived();await sealed;check();
     },internal.signal).then(stage=>{
      if(!stage.ok)throw Error(`Solo mirror receipt failed: ${stage.reason}`);
      if(item.capture.nextOwners)this.preparedBlastOwners.set(stage,item.capture.nextOwners);
      const row:SoloPreparedDisposal={world:other,stage,events:[],journal:false};prepared.push(row);
      const delivery=this.deliveryEvents(other,stage.result,item.names,other.updatedAt,callback,{cohort,plan:item.plan});
      row.events=delivery.events;row.journal=delivery.journal;row.modelState=delivery.modelState;row.transientState=delivery.transientState;
      row.pickupOutput=delivery.pickupOutput;
     });
    works.push(work);void work.catch(()=>{});
    await Promise.race([arrival,work.then(()=>{throw Error('Solo cohort finalizer missing');})]);
   }
   check();await seal.call(cohort);check();releaseSeal();await Promise.all(works);check();
   if(this.worlds.size!==population.length||population.some(([key,peer])=>this.worlds.get(key)!==peer)
    ||discovered.some(item=>!item.plan.observer.alive||item.plan.observer.callback!==item.plan.prefix.callback
     ||item.plan.observer.receiptTick!==item.plan.receiptTick||item.plan.observer.actorNames!==item.names))throw Error('Solo disposal cohort owner changed');
   publishing=true;signal?.removeEventListener('abort',onAbort);
   await publish.call(cohort);durable=true;this.suppliedCohorts.get(cohort)!.published=true;
   // Assignment-only adoption and retirement have no await or public sink.
   this.adoptPreparedDisposal(prepared);this.retireDisposedWorld(world);
   const errors:unknown[]=[];
   const streamed=prepared.some(item=>item.pickupOutput);
   if(streamed)try{await this.dispatchPreparedPickupDisposal(world,prepared);}catch(error){
    if(error instanceof SoloPickupReadPending&&error.resume){
     this.retainCommittedPickupDispatch(operation,error,async()=>{await finish.call(cohort);this.releaseReceiverScene(world);});throw error;
    }
    errors.push(error);
   }
   try{await finish.call(cohort);this.releaseReceiverScene(world);}catch(error){operation.cleanup=async()=>{await finish.call(cohort);this.releaseReceiverScene(world);};errors.push(error);}
   if(this.awaitingCurrent===owner)this.awaitingCurrent=undefined;
   if(!streamed)try{this.dispatchPreparedDisposal(world,prepared,true,false);}catch(error){errors.push(error);}
   if(errors.length===1)throw errors[0];if(errors.length)throw new AggregateError(errors,'Solo committed disposal cleanup/dispatch failed');
  }catch(error){
   if(!durable){
    publishing=false;cancel(error);await Promise.allSettled(works);
    const errors:unknown[]=[error];
    for(const item of prepared)try{item.stage.rollback();}catch(failure){errors.push(failure);}
    try{await abortWork;}catch(failure){errors.push(failure);}
    if(errors.length>1)operation.cleanup=async()=>{
     const failures:unknown[]=[];
     for(const item of prepared)try{item.stage.rollback();}catch(failure){failures.push(failure);}
     try{await abort.call(cohort);}catch(failure){failures.push(failure);}
     if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Solo CURRENT cleanup retry failed');
    };
    if(errors.length>1)throw new AggregateError(errors,'Solo disposal cohort rollback failed');
   }
   throw error;
  }finally{signal?.removeEventListener('abort',onAbort);if(this.awaitingCurrent===owner)this.awaitingCurrent=undefined;}
 }
 private adoptPreparedDisposal(prepared:readonly SoloPreparedDisposal[]):void {
  for(const item of prepared){item.stage.commit();item.world.receiptTick++;}
  for(const item of prepared)this.publishBlastOwners(item.world,item.stage);
  for(const item of prepared)if(item.modelState&&this.worlds.get(item.world.id)===item.world)item.world.modelState=item.modelState;
  for(const item of prepared)if(item.transientState&&this.worlds.get(item.world.id)===item.world)item.world.transientState=item.transientState;
  this.publishCommittedFadeBirths(prepared);
 }
 private retireDisposedWorld(world:OriginalSoloObserver):void {
  world.alive=false;world.projectiles.clear();world.blasts.clear();world.actorNames.clear();
  if(this.worlds.get(world.id)===world)this.worlds.delete(world.id);this.pendingShots.delete(world.id);
  this.blastOwners.delete(world);
  this.captures=this.captures.filter(capture=>capture.world!==world);
  for(const receipt of this.receipts.values())receipt.delete(world.id);
 }
 private dispatchPreparedDisposal(world:OriginalSoloObserver,prepared:readonly SoloPreparedDisposal[],retired=false,release=true):void {
  const currentBatch=!!this.receiverSceneLeases.get(world)?.drainOutcomes||prepared.some(item=>!!this.receiverSceneLeases.get(item.world)?.drainOutcomes||item.journal);
  const drained=currentBatch?this.drainCommittedSceneOutcomes(prepared.map(item=>item.world),'receipt'):{queues:[],loadoutQueues:[],loadoutStates:[],gunPhaseStates:[],localHitscanQueues:[],weaponReportQueues:[],gunOutputQueues:[],localWeaponStates:[],projectileStates:[],botProjectileCommits:[],failedActorResources:new Set<OriginalSoloObserver>(),failedTransientResources:new Set<OriginalSoloObserver>(),errors:[] as unknown[]};
  if(!retired)this.retireDisposedWorld(world);
  // Preserve legacy callback gating, first-error propagation and cleanup when
  // this disposal has neither CURRENT nor an opt-in model journal.
  if(!currentBatch){
   try{for(const item of prepared)for(const event of item.events)if(this.current(item.world))this.emit(event);}
   finally{this.cleanup();if(release)this.releaseReceiverScene(world);}
   return;
  }
  const errors=drained.errors;
  const reportDamage=this.publishCommittedWeaponReportDamage(drained.weaponReportQueues,errors);
  try{
   this.dispatchCommittedModelEvents(prepared,errors,drained.failedActorResources,drained.failedTransientResources);
   this.dispatchCommittedBotProjectileCommits(drained.botProjectileCommits,errors);
   this.dispatchCommittedProjectileStates(drained.projectileStates,errors);
   this.dispatchCommittedLocalWeaponStates(drained.localWeaponStates,errors);
   this.dispatchCommittedLoadoutStates(drained.loadoutStates,errors);
   this.dispatchCommittedWeaponReports(drained.weaponReportQueues,errors);
   this.dispatchCommittedGunPhaseStates(drained.gunPhaseStates,errors);
   this.dispatchCommittedGunOutputs(drained.gunOutputQueues,errors);
   this.dispatchCommittedLocalHitscanOutcomes(drained.localHitscanQueues,errors);
   this.dispatchCommittedFadeBirths(prepared,errors);
   this.dispatchCommittedLoadoutOutputs(drained.loadoutQueues,errors);
   this.dispatchCommittedSceneOutcomes(drained.queues,errors);
   this.dispatchCommittedWeaponReportDamage(reportDamage,errors);
  }finally{this.cleanup();if(release)try{this.releaseReceiverScene(world);}catch(error){errors.push(error);}}
  if(errors.length)throw new AggregateError(errors,'Solo committed disposal dispatch failed');
 }
 /** Link caller cancellation to an invocation owned by this population. The
  * terminal signal is separate from its public rejection: successful rollback
  * makes draining safe even when the original operation reports cancellation. */
 private abortSuppliedCohort(cohort:OriginalSoloCurrentCohort):Promise<void> {
  const record=this.suppliedCohorts.get(cohort);
  if(!record)throw Error('Solo supplied cohort ownership missing');
  if(record.published||record.aborted)return Promise.resolve();if(record.abortWork)return record.abortWork;
  const cleanup=()=>this.abortSuppliedCohort(cohort),operation=record.operation;
  if(operation)operation.cleanup=cleanup;
  const work=Promise.resolve().then(record.abort).then(()=>{record.aborted=true;if(operation?.cleanup===cleanup)operation.cleanup=undefined;});record.abortWork=work;
  void work.catch(()=>{
   if(record.abortWork===work)record.abortWork=undefined;
   if(record.operation)record.operation.cleanup=()=>this.abortSuppliedCohort(cohort);
  });return work;
 }
 private async runSuppliedCohort(cohort:OriginalSoloCurrentCohort,signal:AbortSignal|undefined,action:(owned:AbortSignal,operation:SoloCurrentOperation)=>Promise<void>,allowPendingLaunch=false):Promise<void> {
  if(!cohort||typeof cohort!=='object')throw Error('Invalid Solo CURRENT cohort abort hook');
  let record=this.suppliedCohorts.get(cohort);
  if(record?.operation?.cleanup)this.rejectLaunchBatchReentry();
  if(record?.active||record?.operation?.cleanup)throw Error('Solo supplied cohort already owned or awaiting cleanup');
  // Do not accept a capability when there is no bounded drain slot for it.
  // The caller retains it and can abort it or retry after the population drains.
  if(this.currentOperations.size>=8)throw Error('Solo CURRENT operation capacity exceeded; caller retains supplied cohort');
  if(!record){const abort=cohort.abort;if(typeof abort!=='function')throw Error('Invalid Solo CURRENT cohort abort hook');record={active:false,published:false,aborted:false,abort:abort.bind(cohort)};this.suppliedCohorts.set(cohort,record);}
  const owned=record;owned.active=true;owned.operation=undefined;
  try{
   return await this.runCurrentOperation(signal,async(ownedSignal,operation)=>{
    owned.operation=operation;
    try{await action(ownedSignal,operation);}catch(error){
     if(!owned.published&&!owned.aborted&&!operation.cleanup)try{await this.abortSuppliedCohort(cohort);}catch(failure){operation.cleanup=()=>this.abortSuppliedCohort(cohort);throw new AggregateError([error,failure],'Solo supplied cohort rollback failed');}
     throw error;
    }
   },allowPendingLaunch);
  }catch(error){
   if(!owned.operation&&!owned.published&&!owned.aborted){
    // Admission failed before runCurrentOperation could own this fresh
    // capability. Its abort IO still fences gameplay and has a drain handle.
    let done!:()=>void;const operation:SoloCurrentOperation={done:new Promise<void>(resolve=>{done=resolve;}),cancel:()=>{},cleanup:()=>this.abortSuppliedCohort(cohort)};
    owned.operation=operation;this.currentOperations.add(operation);
    try{await operation.cleanup!();operation.cleanup=undefined;this.currentOperations.delete(operation);}catch(failure){operation.failure=failure;throw new AggregateError([error,failure],'Solo rejected cohort cleanup failed');}finally{done();}
   }
   throw error;
  }finally{owned.active=false;}
 }
 private runCurrentOperation(signal:AbortSignal|undefined,action:(owned:AbortSignal,operation:SoloCurrentOperation)=>Promise<void>,allowPendingLaunch=false):Promise<void> {
  const deathOperation=this.deathAdmission;
  this.rejectLaunchBatchReentry(allowPendingLaunch);
  if(this.currentOperations.size>=8)throw Error('Solo CURRENT operation capacity exceeded');
  if(signal?.aborted)throw signal.reason??Error('Solo CURRENT cancelled');
  const controller=new AbortController();let resolveDone!:()=>void;
  const done=new Promise<void>(resolve=>{resolveDone=resolve;});
  const operation:SoloCurrentOperation={done,cancel:reason=>controller.abort(reason)};
  const relay=()=>operation.cancel(signal?.reason??Error('Solo CURRENT cancelled'));
  signal?.addEventListener('abort',relay,{once:true});this.currentOperations.add(operation);
  if(signal?.aborted)relay();
  const settle=()=>{signal?.removeEventListener('abort',relay);if(!operation.cleanup)this.currentOperations.delete(operation);resolveDone();};
  let work:Promise<void>;
  try{work=action(controller.signal,operation);}catch(error){settle();throw error;}
  return work.then(async()=>{
   settle();if(!deathOperation&&!this.drainingCurrent&&!operation.cleanup&&this.queuedDeaths.size)await this.drainQueuedDeaths();
  },async error=>{
   operation.failure=error;settle();
   if(!deathOperation&&!this.drainingCurrent&&!operation.cleanup&&this.queuedDeaths.size){
    try{await this.drainQueuedDeaths();}catch(deathError){throw new AggregateError([error,deathError],'Solo CURRENT and queued death failed');}
   }
   throw error;
  });
 }
 /** Terminal deaths retain their exact life and scene until durable peer
  * receipts complete. Calls coalesce; a failed delivery retries only explicitly. */
 drainQueuedDeaths():Promise<void> {
  if(this.deathWork)return this.deathWork;
  if(this.awaitingCurrent||[...this.currentOperations].some(op=>!!op.cleanup))throw Error('Solo queued death requires CURRENT completion and cleanup');
  this.deathFailure=undefined;
  const work=(async()=>{
   while(this.queuedDeaths.size){
    const [world,life]=this.queuedDeaths.entries().next().value!;
    if(this.worlds.get(world.id)!==world||world.lifeGeneration!==life)throw Error('Solo queued death life changed');
    const create=this.options.createDisposalCohort;if(!create)throw Error('Solo queued death requires asynchronous disposal cohort');
    let pending:Promise<void>;
    this.deathAdmission=true;
    try{pending=this.disposeAsync(world.id,create());}finally{this.deathAdmission=false;}
    try{await pending;}finally{if(this.worlds.get(world.id)!==world)this.queuedDeaths.delete(world);}
   }
  })();this.deathWork=work;
  const settle=()=>{if(this.deathWork===work)this.deathWork=undefined;};
  void work.then(settle,error=>{this.deathFailure=error;settle();});return work;
 }
 private disposeTerminal(world:OriginalSoloObserver):void {
  if(this.worlds.get(world.id)!==world)return;
  if(!this.options.createDisposalCohort){
   if(this.awaitingCurrent)throw Error('Solo streamed death requires asynchronous disposal cohort');
   this.dispose(world.id);return;
  }
  if(!this.queuedDeaths.has(world)&&this.queuedDeaths.size>=64)throw Error('Solo queued death capacity exceeded');
  this.queuedDeaths.set(world,world.lifeGeneration);
  if(!this.awaitingCurrent&&!this.drainingCurrent&&!this.deathWork&&!this.deathFailure&&!this.currentOperations.size){
   // Start after the synchronous notifications finish; no caller can admit
   // another gameplay operation because the queue already fences admission.
   void Promise.resolve().then(()=>{
    if(this.queuedDeaths.size&&!this.awaitingCurrent&&!this.drainingCurrent&&!this.deathWork&&!this.deathFailure)return this.drainQueuedDeaths();
   }).catch(error=>{this.deathFailure=error;});
  }
 }
 /** Stop new admissions, cancel prepublication work and await every owned
  * invocation. Completed publication adopts normally. Cleanup retries never
  * replay source callbacks or committed output. */
 cancelAndDrainCurrent(reason:unknown=Error('Solo CURRENT cancelled for drain')):Promise<void> {
  if(this.currentDrain)return this.currentDrain;
  this.drainingCurrent=true;
  const records=[...this.currentOperations],priorCleanup=new Map(records.map(operation=>[operation,operation.cleanup]));
  for(const operation of records)operation.cancel(reason);
  const work=(async()=>{
   await Promise.all(records.map(operation=>operation.done));
   try{await this.deathWork;}catch{/* Failure is reported by its owned operation or explicit retry below. */}
   const errors:unknown[]=[];
   for(const operation of records)if(operation.cleanup){
    if(!priorCleanup.get(operation)){errors.push(operation.failure??Error('Solo CURRENT cleanup requires retry'));continue;}
    try{await operation.cleanup();operation.cleanup=undefined;this.currentOperations.delete(operation);}catch(error){errors.push(error);}
   }
   if(errors.length===1)throw errors[0];if(errors.length)throw new AggregateError(errors,'Solo CURRENT drain cleanup failed');
   if(this.clearAfterDrain){this.queuedDeaths.clear();this.deathFailure=undefined;this.clearAfterDrain=false;this.drainingCurrent=false;this.clear();}
   else if(this.queuedDeaths.size)await this.drainQueuedDeaths();
   else this.deathFailure=undefined;
  })();this.currentDrain=work;
  const settle=()=>{if(this.currentDrain===work){this.currentDrain=undefined;this.drainingCurrent=false;}};
  void work.then(settle,settle);return work;
 }
 /** Retirement follows cancellation, adoption when necessary, and IO drain. */
 clearAsync(reason:unknown=Error('Solo CURRENT cancelled for clear')):Promise<void> {
  this.clearAfterDrain=true;return this.cancelAndDrainCurrent(reason);
 }
 private releaseReceiverScene(world:OriginalSoloObserver):void {
  const lease=this.receiverSceneLeases.get(world);if(!lease)return;
  this.receiverSceneLeases.delete(world);lease.release();
 }
 clear():void {
  this.rejectLaunchBatchReentry(true);this.pendingLaunchBatch?.rollback();this.pendingLaunchBatch=undefined;
  const retired=[...this.worlds.values()];
  for(const world of this.worlds.values()){world.alive=false;world.projectiles.clear();world.blasts.clear();world.actorNames.clear();this.blastOwners.delete(world);}
  this.worlds.clear();this.launches.clear();this.receipts.clear();this.pendingShots.clear();this.captures=[];if(this.actorProgress?.pending?.context)physicalPuffContexts.delete(this.actorProgress.pending.context);this.actorProgress=undefined;this.lives.clear();this.phase='idle';this.frozen=false;this.frozenAt=undefined;
  const errors:unknown[]=[];
  for(const world of retired)try{this.releaseReceiverScene(world);}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Solo receiver scene release failed');
 }
 freeze(time=Math.max(0,...[...this.worlds.values()].map(world=>world.updatedAt))):void {
  this.rejectLaunchBatchReentry();
  if(this.frozen)return;
  if(this.pendingLaunchBatch)throw Error('Uncommitted launch batch requires retry or reset before freeze');
  const latest=Math.max(0,...[...this.worlds.values()].map(world=>world.updatedAt));
  // Game admits source callbacks up to frameTime + 1e-9 before restoring the
  // render-frame clock. Preserve that same boundary when suspension follows.
  if(!Number.isFinite(time)||time<0||time<latest-1e-9)throw Error('Invalid solo freeze time');
  this.frozen=true;this.frozenAt=Math.max(time,latest);this.captures=[];if(this.actorProgress?.pending?.context)physicalPuffContexts.delete(this.actorProgress.pending.context);this.actorProgress=undefined;this.phase='idle';
 }
 resume(time:number):void {
  this.rejectLaunchBatchReentry();
  if(!Number.isFinite(time)||time<0)throw Error('Invalid solo resume time');
  if(!this.frozen)return;
  const paused=time-this.frozenAt!;if(paused<0)throw Error('Solo resume precedes freeze');
  for(const world of this.worlds.values())if(!Number.isFinite(world.doorEpoch+paused)||world.doors&&(!Number.isFinite(world.doors.updatedAtSeconds+paused)||world.doors.getStates().some(state=>state.openedAt!==null&&!Number.isFinite(state.openedAt+paused))))throw Error('Solo door resume clock overflow');
  for(const world of this.worlds.values()){
   world.doors?.shiftClock(paused);world.doorEpoch+=paused;world.updatedAt=time;
  }
  this.frozen=false;this.frozenAt=undefined;
 }
 launch(command:OriginalSoloLaunchCommand,time:number):OriginalSoloAdmission {
  this.rejectLaunchBatchReentry();if(this.pendingLaunchBatch)throw Error('Pending owned launch requires commit or reset before legacy launch');
  if(this.frozen)return {ok:false,reason:'frozen'};
  const owner=this.worlds.get(command.ownerId);if(!owner?.alive)return {ok:false,reason:'missing-owner'};
  let live=0;
  for(const record of this.launches.values())if(record.ownerId===owner.id&&[...this.worlds.values()].some(world=>world.projectiles.has(record.id)))live++;
  if(live>=8)return {ok:false,reason:'projectile-cap'};
  // Constructor validation happens before any catalog/receipt mutation.
  const prototype=createOriginalProjectile(command.weapon,command.eye,command.direction,owner.id,command.sourceRotation);
  const launch:OriginalSoloLaunch=Object.freeze({id:`solo-projectile-${++this.sequence}`,sequence:this.sequence,ownerId:owner.id,ownerLife:owner.lifeGeneration,ownerName:owner.name,
   weapon:command.weapon,eye:immutable(command.eye),direction:immutable(prototype.direction),...(prototype.sourceRotation?{sourceRotation:immutable(prototype.sourceRotation)}:{}),birthCallback:this.callback,time});
  this.launches.set(launch.id,launch);const receipt=new Map<string,number>();this.receipts.set(launch.id,receipt);
  const ownerState=structuredClone(prototype);owner.projectiles.set(launch.id,{launch,state:ownerState});receipt.set(owner.id,owner.lifeGeneration);
  this.emit({kind:'spawned',recipientId:owner.id,lifeGeneration:owner.lifeGeneration,time,launch,state:ownerState});
  for(const world of [...this.worlds.values()]){
   if(world===owner||!world.alive||originalAsciiNamesEqual(world.name,launch.ownerName))continue;
   if(this.options.deliverLaunch?.(world,launch)===false||!this.launches.has(launch.id))continue;
   if(this.worlds.get(world.id)!==world||!world.alive)continue;
   const state=structuredClone(prototype);world.projectiles.set(launch.id,{launch,state});receipt.set(world.id,world.lifeGeneration);
   this.emit({kind:'spawned',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,launch,state});
  }
  this.cleanup();return {ok:true,launch};
 }
 geometryFor(id:string){const world=this.require(id);return world.doors?.geometry??this.runtime.geometry;}
 supportHeight(id:string,position:Vec3,maxY=position.y+.08):number|undefined {
  const world=this.require(id),profile=this.runtime.profile;
  const fixed=this.geometryFor(id).playerSupportHeightAt(position.x,position.z,maxY,profile.radius,profile.bodyHeight);
  const barrel=world.barrels.playerSupportHeightAt(position.x,position.z,maxY,profile.radius,profile.bodyHeight);
  return fixed===undefined?barrel:barrel===undefined?fixed:Math.max(fixed,barrel);
 }
 playerIntersects(id:string,position:Vec3):boolean {const profile=this.runtime.profile;return this.geometryFor(id).playerIntersects(position,profile.radius,profile.bodyHeight)||this.require(id).barrels.playerIntersects(position,profile.radius,profile.bodyHeight);}
 raycast(id:string,origin:Vec3,direction:Vec3,max:number,options:ArenaRaycastOptions={}):ArenaRayHit|null {
  const fixed=this.geometryFor(id).raycast(origin,direction,max,options),barrel=this.require(id).barrels.raycast(origin,direction,max,options);
  return barrel&&(!fixed||barrel.distance<fixed.distance)?barrel:fixed;
 }
 /** Frozen shooter-local visible world, including GI/corpses and projectile
  * meshes when assets are supplied. The returned hit identifies the blocker. */
 freezeRay(id:string):(origin:Vec3,direction:Vec3,max:number,options?:ArenaRaycastOptions)=>ArenaRayHit|null {
  const world=this.require(id),geometry=world.doors?.fork().geometry??this.runtime.geometry,barrels=world.barrels.fork();
  const poses=world.mirror.freeze(),corpses=world.mirror.freezeCorpses();
  const projectiles:OriginalProjectileModelPose[]=[...world.projectiles].map(([key,{state}])=>({id:key,weapon:state.weapon,position:vector(state.position),direction:vector(state.direction),sourceRotation:state.sourceRotation,orientation:state.angular?{...state.angular.orientation}:undefined}));
  const collision=this.options.soldierAssets?new OriginalSoldierCollision(this.options.soldierAssets):undefined;
  return (origin,direction,max,options={})=>{
   let hit=geometry.raycast(origin,direction,max,options);const barrel=barrels.raycast(origin,direction,max,options),sky=raycastOriginalSky(this.runtime.data,this.runtime.scale,origin,direction,max);
   for(const candidate of [barrel,sky])if(candidate&&(!hit||candidate.distance<hit.distance))hit=candidate;
   for(const pose of projectiles){const mesh=this.options.projectileGeometry?.get(pose.weapon);if(!mesh)continue;const candidate=raycastOriginalProjectileModel(mesh,pose.position,originalProjectileModelQuaternion(pose.weapon,pose.direction,pose.sourceRotation,pose.orientation),origin,direction,hit?.distance??max,pose.id);if(candidate&&(!hit||candidate.distance<hit.distance))hit=candidate;}
   if(collision)for(const pose of [...poses.map(p=>({id:p.id,position:p.position,yaw:p.yaw,motionTime:p.motionTime,deathBon:undefined})),...corpses.map(p=>({...p,id:`corpse:${p.ownerId}:${p.sequence}`}))]){
    collision.evaluatePose(vector(pose.position),pose.yaw,pose.motionTime,pose.deathBon);const candidate=collision.intersectRay(origin,direction,hit?.distance??max);
    if(candidate&&(!hit||candidate.distance<hit.distance))hit={id:pose.id,surface:'collider',distance:candidate.distance,point:{x:origin.x+direction.x*candidate.distance,y:origin.y+direction.y*candidate.distance,z:origin.z+direction.z*candidate.distance},normal:{x:0,y:0,z:0}};
   }
   return hit;
  };
 }
 /** One caller-scheduled source callback; no elapsed-time catch-up. */
 physics(time:number,options:{skipIds?:ReadonlySet<string>;onResolvedContact?:(world:OriginalSoloObserver,event:OriginalPhysicsContactDiagnostic)=>void}={}):void {
  this.rejectLaunchBatchReentry();
  if(this.frozen)return;
  if(this.phase!=='idle')throw Error('Incomplete solo callback phase');
  if(!Number.isFinite(time)||time<0)throw Error('Invalid solo callback time');
  const captures=[...this.worlds.values()].filter(world=>world.alive).map(world=>({world,projectiles:[...world.projectiles.values()],blasts:[...world.blasts.values()]}));
  if(captures.some(({world})=>time<world.updatedAt))throw Error('Solo callback time moved backwards');
  if(!Number.isSafeInteger(this.callback+1)||captures.some(({world})=>!Number.isSafeInteger((this.physicalCallbacks.get(world)??0)+1)))throw Error('Solo physical callback clock requires reset');
  this.callback++;this.phase='physics';this.captures=captures;
  for(const {world} of captures)this.physicalCallbacks.set(world,(this.physicalCallbacks.get(world)??0)+1);
  for(const {world} of this.captures){if(time<world.updatedAt)throw Error('Solo callback time moved backwards');world.updatedAt=time;this.updateDoors(world,time);}
  for(const capture of this.captures){const {world}=capture;if(!this.current(world)||options.skipIds?.has(world.id))continue;
   const geometry=this.geometryFor(world.id);let contactLaunch:OriginalSoloLaunch|undefined,otherId:string|undefined,contact=false;
   stepOriginalPhysicsWorld([world.body],capture.projectiles.map(p=>p.state),{
    playerPairContacts:false,movableBodies:world.barrels.bodies,contactDistance:ORIGINAL_COLLISION_CONTACT_DISTANCE,
    sweep:(from,to,radius)=>geometry.sweepSphere(from,to,radius,ORIGINAL_COLLISION_CONTACT_DISTANCE),
    sweepConvex:(from,to,shape,velocity)=>geometry.sweepConvex(from,to,shape,ORIGINAL_COLLISION_CONTACT_DISTANCE,velocity),
    contactsSphere:(position:Vec3,radius:number)=>geometry.contactsSphere(position,radius,ORIGINAL_COLLISION_CONTACT_DISTANCE),
    contactsConvex:(position:Vec3,shape:OriginalConvexPolytope)=>geometry.contactsConvex(position,shape,ORIGINAL_COLLISION_CONTACT_DISTANCE),
    memoizePureSweep:true,onProjectileContact:(state,event)=>{if(event.body?.id===world.id){contact=true;contactLaunch=capture.projectiles.find(p=>p.state===state)?.launch;otherId=contactLaunch?.id;}},
    onPlayerContact:(_body,_normal,id)=>{if(id&&world.barrels.bodies.some(body=>body.id===id)){contact=true;otherId=id;}},
    ...(options.onResolvedContact?{onResolvedContact:(event:OriginalPhysicsContactDiagnostic)=>options.onResolvedContact!(world,event)}:{}),
   });
   if(contact&&this.current(world))this.emit({kind:'contact',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,launch:contactLaunch,otherId,velocity:vector(world.body.velocity)});
  }
 }
 private readonly goodyCallbacks=new WeakMap<OriginalSoloObserver,number>();
 goody(id:string,input?:OriginalPlayerControls,mode:OriginalPlayerMovementMode='source',control?:(world:OriginalSoloObserver)=>{grounded:boolean;jumped:boolean}):{grounded:boolean;jumped:boolean} {
  this.rejectLaunchBatchReentry();
  if(this.frozen)return {grounded:false,jumped:false};
  const world=this.require(id);if(!world.alive)return {grounded:false,jumped:false};
  this.completeExternalGoody(id);this.completedGoodyCallbacks.delete(world);
  const result=control?control(world):applyOriginalPlayerMovementControls(world.body,input??{yaw:world.yaw,pitch:0,typing:true},mode);
  stepOriginalPlayerHealth(world.health);this.completedGoodyCallbacks.set(world,this.callback);return result;
 }
 completeExternalGoody(id:string):void {
  this.rejectLaunchBatchReentry();
  if(this.frozen)return;const world=this.require(id);if(!world.alive)return;
  if(this.phase!=='physics'||!this.captures.some(capture=>capture.world===world))throw Error('Solo goody lacks physical capture');
  if(this.goodyCallbacks.get(world)===this.callback)throw Error('Duplicate solo goody phase');this.goodyCallbacks.set(world,this.callback);this.completedGoodyCallbacks.set(world,this.callback);
 }
 completeGoody(time:number):void {
  this.rejectLaunchBatchReentry(true);
  if(this.frozen)return;if(this.phase!=='physics')throw Error('Solo physics phase missing');
  if(this.captures.some(({world})=>this.current(world)&&this.goodyCallbacks.get(world)!==this.callback))throw Error('Missing solo goody phase');
  const publications=[...this.worlds.values()].filter(world=>world.alive).map(world=>({id:world.id,name:world.name,lifeGeneration:world.lifeGeneration,position:{...originalPlayerEye(world.body),y:originalPlayerEye(world.body).y-this.runtime.profile.eyeHeight},yaw:world.yaw,motionTime:world.motionTime,alive:true,weapon:world.weapon,sourceShots:this.pendingShots.get(world.id)}));
  const prepared:SoloPreparedDelivery[]=[];
  const twoPass=[...this.receiverSceneLeases.values()].some(lease=>!!lease.finalizeCurrentCapture);
  let launchPublisher:(()=>void)|undefined,spawnEvents:readonly OriginalSoloLaunchSpawnPublication[]=Object.freeze([]);
  const batch=twoPass?(this.pendingLaunchBatch??=new OriginalSoloLaunchBatch({worlds:this.worlds,launches:this.launches,receipts:this.receipts,sequence:this.sequence,callback:this.callback,time,...(this.options.deliverLaunch?{deliverLaunch:this.options.deliverLaunch}:{})})):undefined;
  type PublishedTarget=(typeof publications)[number]&{reset?:boolean};
  const discovered:{world:OriginalSoloObserver;callback:number;names:Map<string,{name:string;lifeGeneration:number}>;targets:readonly PublishedTarget[];capture:SoloPreparedCurrentCapture}[]=[];
  const prepare=(world:OriginalSoloObserver,callback:number,names:Map<string,{name:string;lifeGeneration:number}>,targets:readonly PublishedTarget[],capture?:SoloPreparedCurrentCapture)=>{
   const rows=targets.map(target=>({actorId:target.id,name:target.name,lifeGeneration:target.lifeGeneration!}));
   const stage=this.prepareRecord(world,{targets},callback,rows,capture);
   const item={world,callback,names,stage,events:[] as OriginalSoloEvent[],journal:false,modelState:undefined as ReceiverActorRegistrySnapshot|undefined,transientState:undefined as ReceiverTransientCheckpoint|undefined};prepared.push(item);
   const delivery=this.deliveryEvents(world,stage.result,names,time,callback);item.events=delivery.events;item.journal=delivery.journal;item.modelState=delivery.modelState;item.transientState=delivery.transientState;
   const retained=new Set(stage.nextPoses.map(p=>p.id));for(const id of names.keys())if(!retained.has(id))names.delete(id);
  };
  if(batch){this.preparingLaunchBatch=true;this.launchBatchReentry=false;}
  try{
   for(const world of this.worlds.values())if(world.alive){
    const callback=world.callback+1,names=new Map(world.actorNames);
    const targets=publications.filter(target=>target.id!==world.id&&!originalAsciiNamesEqual(target.name,world.name)).map(target=>{
     const previous=names.get(target.id),reset=previous!==undefined&&previous.lifeGeneration!==target.lifeGeneration;
     if(!previous||reset)names.set(target.id,{name:target.name,lifeGeneration:target.lifeGeneration});
     return {...target,...(reset?{reset:true}:{})};
    });
    if(batch){
     const capture=this.captureRecord(world,{targets},callback,targets.map(target=>({actorId:target.id,name:target.name,lifeGeneration:target.lifeGeneration})));
     discovered.push({world,callback,names,targets,capture});
    }else prepare(world,callback,names,targets);
   }
   if(batch){
    const claims=discovered.flatMap(item=>item.capture.launchAdmissions);if(claims.length>64)throw Error('Solo launch batch claim budget exceeded');
    batch.seal(claims);
    for(const item of discovered){
     const incoming=batch.incoming(item.world),lease=this.receiverSceneLeases.get(item.world);
     if(item.capture.context&&lease?.finalizeCurrentCapture)lease.finalizeCurrentCapture(item.capture.context,incoming);
     else if(incoming.length&&lease?.captureCurrent)throw Error('Missing receiver incoming launch finalization');
    }
    for(const item of discovered)prepare(item.world,item.callback,item.names,item.targets,item.capture);
    batch.validate();if(this.launchBatchReentry)throw Error('Solo launch batch reentry rejected');
    spawnEvents=batch.spawnEvents;launchPublisher=batch.prepareCommit();
   }
  }catch(error){for(const item of prepared)item.stage.rollback();batch?.rollback();this.preparingLaunchBatch=false;throw error;}
  this.adoptPreparedGoody(prepared,batch,launchPublisher);
  this.dispatchPreparedGoody(prepared,batch,spawnEvents);
 }
 /** Prepare one captured living cohort across bounded history IO. Replays are
  * started one at a time until their output is flushed, then held at one seal
  * barrier. No later body, receipt or control admission may pass meanwhile. */
 async completeGoodyAsync(time:number,cohort:OriginalSoloCurrentCohort,signal?:AbortSignal):Promise<void> {
  // Only delivery may resume the retained launch capture after rollback.
  // Disposal and all other mutation keep rejecting an uncommitted batch.
  return this.runSuppliedCohort(cohort,signal,(owned,operation)=>this.completeGoodyOwned(time,cohort,owned,operation),true);
 }
 private async completeGoodyOwned(time:number,cohort:OriginalSoloCurrentCohort,signal:AbortSignal,operation:SoloCurrentOperation):Promise<void> {
  this.rejectLaunchBatchReentry(true);
  if(this.frozen){await this.abortSuppliedCohort(cohort);return;}if(this.phase!=='physics')throw Error('Solo physics phase missing');
  if(this.captures.some(({world})=>this.current(world)&&this.goodyCallbacks.get(world)!==this.callback))throw Error('Missing solo goody phase');
  if(!Number.isFinite(time)||time<0)throw Error('Invalid Solo cohort time');
  const begin=cohort.begin,flush=cohort.replayComplete,seal=cohort.seal,publish=cohort.publish,abort=()=>this.abortSuppliedCohort(cohort),finish=cohort.finish;
  if([begin,flush,seal,publish,abort,finish].some(hook=>typeof hook!=='function'))throw Error('Invalid Solo CURRENT cohort');
  const canceled=()=>signal?.reason??new Error('Solo CURRENT cohort cancelled');
  if(signal?.aborted)throw canceled();
  const publications=[...this.worlds.values()].filter(world=>world.alive).map(world=>({id:world.id,name:world.name,lifeGeneration:world.lifeGeneration,position:{...originalPlayerEye(world.body),y:originalPlayerEye(world.body).y-this.runtime.profile.eyeHeight},yaw:world.yaw,motionTime:world.motionTime,alive:true,weapon:world.weapon,sourceShots:this.pendingShots.get(world.id)}));
  if(!publications.length){await this.abortSuppliedCohort(cohort);this.completeGoody(time);return;}
  const population=[...this.worlds],prepared:SoloPreparedDelivery[]=[],works:Promise<void>[]=[];
  type Target=(typeof publications)[number]&{reset?:boolean};
  const discovered:{plan:OriginalSoloCurrentCohortPlan;names:Map<string,{name:string;lifeGeneration:number}>;priorNames:OriginalSoloObserver['actorNames'];targets:readonly Target[];capture:SoloPreparedCurrentCapture}[]=[];
  const twoPass=[...this.receiverSceneLeases.values()].some(lease=>!!lease.finalizeCurrentCapture);
  const batch=twoPass?(this.pendingLaunchBatch??=new OriginalSoloLaunchBatch({worlds:this.worlds,launches:this.launches,receipts:this.receipts,sequence:this.sequence,callback:this.callback,time,...(this.options.deliverLaunch?{deliverLaunch:this.options.deliverLaunch}:{})})):undefined;
  let launchPublisher:(()=>void)|undefined,spawnEvents:readonly OriginalSoloLaunchSpawnPublication[]=Object.freeze([]);
  const internal=new AbortController();let publishing=false,durable=false,abortWork:Promise<void>|undefined;
  let releaseSeal!:()=>void,rejectSeal!:(error:unknown)=>void;
  const sealed=new Promise<void>((resolve,reject)=>{releaseSeal=resolve;rejectSeal=reject;});void sealed.catch(()=>{});
  const requestAbort=()=>{if(!abortWork){try{abortWork=Promise.resolve(abort.call(cohort));}catch(error){abortWork=Promise.reject(error);}void abortWork.catch(()=>{});}};
  const cancel=(reason:unknown)=>{if(publishing||durable)return;internal.abort(reason);rejectSeal(reason);requestAbort();};
  const onAbort=()=>cancel(canceled());
  const check=()=>{if(internal.signal.aborted)throw internal.signal.reason;};
  const owner={};this.awaitingCurrent=owner;signal?.addEventListener('abort',onAbort,{once:true});
  try{
   if(signal?.aborted)onAbort();check();
   if(batch){this.preparingLaunchBatch=true;this.launchBatchReentry=false;}
   try{
    for(const world of this.worlds.values())if(world.alive){
     const callback=world.callback+1,names=new Map(world.actorNames);
     const targets=publications.filter(target=>target.id!==world.id&&!originalAsciiNamesEqual(target.name,world.name)).map(target=>{
      const previous=names.get(target.id),reset=previous!==undefined&&previous.lifeGeneration!==target.lifeGeneration;
      if(!previous||reset)names.set(target.id,{name:target.name,lifeGeneration:target.lifeGeneration});
      return {...target,...(reset?{reset:true}:{})};
     });
     const capture=this.captureRecord(world,{targets},callback,targets.map(target=>({actorId:target.id,name:target.name,lifeGeneration:target.lifeGeneration})));
     const receiptTick=world.receiptTick;
     const plan=Object.freeze({observer:world,prefix:Object.freeze({kind:'callback' as const,sceneGeneration:world.lifeGeneration,callback}),receiptTick,
      receiptPrefix:Object.freeze({kind:'receipt' as const,sceneGeneration:world.lifeGeneration,callback:world.callback,tick:receiptTick})});
     discovered.push({plan,names,priorNames:world.actorNames,targets,capture});
    }
    if(batch){
     const claims=discovered.flatMap(item=>item.capture.launchAdmissions);if(claims.length>64)throw Error('Solo launch batch claim budget exceeded');
     batch.seal(claims);
     for(const item of discovered){
      const world=item.plan.observer,incoming=batch.incoming(world),lease=this.receiverSceneLeases.get(world);
      if(item.capture.context&&lease?.finalizeCurrentCapture)lease.finalizeCurrentCapture(item.capture.context,incoming);
      else if(incoming.length&&lease?.captureCurrent)throw Error('Missing receiver incoming launch finalization');
     }
     batch.validate();if(this.launchBatchReentry)throw Error('Solo launch batch reentry rejected');
     spawnEvents=batch.spawnEvents;
    }
   }finally{this.preparingLaunchBatch=false;}
   check();await begin.call(cohort,Object.freeze(discovered.map(item=>item.plan)),internal.signal);check();
   for(const item of discovered){
    check();let arrived!:()=>void;
    const arrival=new Promise<void>(resolve=>{arrived=resolve;});
    const world=item.plan.observer,callback=item.plan.prefix.callback,trusted=this.mirrorEpoch(world)+callback*1000/30;
    const work=world.mirror.prepareAsynchronousDelivery({tick:item.plan.receiptTick,sentAt:trusted,targets:item.targets},
     {callbacks:callback,receiptCallbacks:item.plan.receiptPrefix.callback},trusted,async scene=>{
      check();await flush.call(cohort,item.plan,scene);check();arrived();await sealed;check();
     },internal.signal).then(stage=>{
      if(!stage.ok)throw Error(`Solo mirror receipt failed: ${stage.reason}`);
      if(item.capture.nextOwners)this.preparedBlastOwners.set(stage,item.capture.nextOwners);
      const row:SoloPreparedDelivery={world,callback,names:item.names,stage,events:[],journal:false};prepared.push(row);
      const delivery=this.deliveryEvents(world,stage.result,item.names,time,callback,{cohort,plan:item.plan});
      row.events=delivery.events;row.journal=delivery.journal;row.modelState=delivery.modelState;row.transientState=delivery.transientState;
      row.pickupOutput=delivery.pickupOutput;
      const retained=new Set(stage.nextPoses.map(p=>p.id));for(const id of item.names.keys())if(!retained.has(id))item.names.delete(id);
     });
    works.push(work);void work.catch(()=>{});
    // Whole preparation waits for the global seal. Only wait for this replay's
    // output flush before starting the next observer and its single window.
    await Promise.race([arrival,work.then(()=>{throw Error('Solo cohort finalizer missing');})]);
   }
   check();await seal.call(cohort);check();releaseSeal();await Promise.all(works);check();
   if(this.worlds.size!==population.length||population.some(([id,world])=>this.worlds.get(id)!==world)
    ||discovered.some(item=>!item.plan.observer.alive||item.plan.observer.callback!==item.plan.prefix.callback-1
     ||item.plan.observer.receiptTick!==item.plan.receiptTick||item.plan.observer.actorNames!==item.priorNames))throw Error('Solo CURRENT cohort owner changed');
   if(batch){batch.validate();launchPublisher=batch.prepareCommit();}
   // Cancellation loses rollback authority before entering durable publication.
   // A success is adopted synchronously before any awaited cleanup or callback.
   publishing=true;signal?.removeEventListener('abort',onAbort);
   await publish.call(cohort);durable=true;this.suppliedCohorts.get(cohort)!.published=true;
   this.adoptPreparedGoody(prepared,batch,launchPublisher);
   const errors:unknown[]=[];
   const streamed=prepared.some(item=>item.pickupOutput);
   if(streamed)try{await this.dispatchPreparedPickupGoody(prepared,spawnEvents);}catch(error){
    if(error instanceof SoloPickupReadPending&&error.resume){this.retainCommittedPickupDispatch(operation,error,()=>finish.call(cohort));throw error;}
    errors.push(error);
   }
   try{await finish.call(cohort);}catch(error){operation.cleanup=()=>finish.call(cohort);errors.push(error);}
   if(this.awaitingCurrent===owner)this.awaitingCurrent=undefined;
   if(!streamed)try{this.dispatchPreparedGoody(prepared,batch,spawnEvents);}catch(error){errors.push(error);}
   if(errors.length===1)throw errors[0];if(errors.length)throw new AggregateError(errors,'Solo committed cohort cleanup/dispatch failed');
  }catch(error){
   if(!durable){
    publishing=false;cancel(error);
    await Promise.allSettled(works);
    const errors:unknown[]=[error];
    for(const item of prepared)try{item.stage.rollback();}catch(failure){errors.push(failure);}
    try{batch?.rollback();}catch(failure){errors.push(failure);}
    try{await abortWork;}catch(failure){errors.push(failure);}
    if(errors.length>1)operation.cleanup=async()=>{
     const failures:unknown[]=[];
     for(const item of prepared)try{item.stage.rollback();}catch(failure){failures.push(failure);}
     try{await abort.call(cohort);}catch(failure){failures.push(failure);}
     if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Solo CURRENT cleanup retry failed');
    };
    if(errors.length>1)throw new AggregateError(errors,'Solo CURRENT cohort rollback failed');
   }
   throw error;
  }finally{signal?.removeEventListener('abort',onAbort);if(this.awaitingCurrent===owner){this.preparingLaunchBatch=false;this.awaitingCurrent=undefined;}}
 }
 private adoptPreparedGoody(prepared:readonly SoloPreparedDelivery[],batch:OriginalSoloLaunchBatch|undefined,launchPublisher:(()=>void)|undefined):void {
  // Assignment-only publishers run without external callbacks between worlds.
  for(const item of prepared){item.stage.commit();item.world.callback=item.callback;item.world.receiptTick++;item.world.actorNames=item.names;}
  if(batch){launchPublisher!();this.sequence=batch.nextSequence;this.pendingLaunchBatch=undefined;this.preparingLaunchBatch=false;}
  for(const item of prepared)this.publishBlastOwners(item.world,item.stage);
  for(const item of prepared)if(item.modelState&&this.worlds.get(item.world.id)===item.world)item.world.modelState=item.modelState;
  for(const item of prepared)if(item.transientState&&this.worlds.get(item.world.id)===item.world)item.world.transientState=item.transientState;
  this.publishCommittedFadeBirths(prepared);
  this.pendingShots.clear();this.phase='goody';
 }
 private dispatchPreparedGoody(prepared:readonly SoloPreparedDelivery[],batch:OriginalSoloLaunchBatch|undefined,spawnEvents:readonly OriginalSoloLaunchSpawnPublication[]):void {
  if(!batch&&!prepared.some(item=>!!this.receiverSceneLeases.get(item.world)?.drainOutcomes||item.journal)){
   // Without CURRENT or an opt-in journal, transport keeps its alive/freeze gating and lets
   // the first public callback error propagate directly.
   for(const item of prepared)for(const event of item.events)if(this.current(item.world))this.emit(event);
   return;
  }
  // All queues are consumed before any renderer/audio/user callback can reenter.
  const drained=this.drainCommittedSceneOutcomes(prepared.map(item=>item.world),'callback');
  const reportDamage=this.publishCommittedWeaponReportDamage(drained.weaponReportQueues,drained.errors);
  // Projectile model states publish before spawn callbacks can consume them.
  // Existing Solo delivery then publishes spawned notifications. Explosive
  // channel7 audio versus gun channel6 reload ordering is therefore an adapter,
  // not recovered native constructor ordering; gun outputs add no launch sound.
  this.dispatchCommittedBotProjectileCommits(drained.botProjectileCommits,drained.errors);
  this.dispatchCommittedProjectileStates(drained.projectileStates,drained.errors);
  this.dispatchCommittedLaunchSpawns(spawnEvents,drained.errors);
  this.dispatchCommittedModelEvents(prepared,drained.errors,drained.failedActorResources,drained.failedTransientResources);
  this.dispatchCommittedLocalWeaponStates(drained.localWeaponStates,drained.errors);
  this.dispatchCommittedLoadoutStates(drained.loadoutStates,drained.errors);
  this.dispatchCommittedWeaponReports(drained.weaponReportQueues,drained.errors);
  this.dispatchCommittedGunPhaseStates(drained.gunPhaseStates,drained.errors);
  this.dispatchCommittedGunOutputs(drained.gunOutputQueues,drained.errors);
  this.dispatchCommittedLocalHitscanOutcomes(drained.localHitscanQueues,drained.errors);
  this.dispatchCommittedFadeBirths(prepared,drained.errors);
  this.dispatchCommittedLoadoutOutputs(drained.loadoutQueues,drained.errors);
  this.dispatchCommittedSceneOutcomes(drained.queues,drained.errors);
  this.dispatchCommittedWeaponReportDamage(reportDamage,drained.errors);
  this.cleanup();
  if(drained.errors.length)throw new AggregateError(drained.errors,'Solo committed callback dispatch failed');

 }
 /** A committed read failure retains the ordered dispatch and pins. Only
  * exact failed claims resume; completed public sinks never run twice. */
 private retainCommittedPickupDispatch(operation:SoloCurrentOperation,pending:SoloPickupReadPending,finish:()=>Promise<void>):void {
  let resume=pending.resume!,dispatched=false,dispatchFailure:unknown;
  operation.cleanup=async()=>{
   if(!dispatched){
    try{await resume();dispatched=true;}catch(error){
     if(error instanceof SoloPickupReadPending&&error.resume){resume=error.resume;throw error;}
     dispatched=true;dispatchFailure=error;
    }
   }
   await finish();
   if(dispatchFailure!==undefined){const error=dispatchFailure;dispatchFailure=undefined;throw error;}
  };
 }
 private orderedPickupDispatch(steps:readonly (()=>void|Promise<void>)[],errors:unknown[],message:string):()=>Promise<void> {
  let next=0;
  const resume=async()=>{
   while(next<steps.length){
    try{await steps[next]();}catch(error){
     if(error instanceof SoloPickupReadPending)throw new SoloPickupReadPending(error.failure,resume);
     // Every ordinary source sink is consumed once, including failures.
     errors.push(error);
    }
    next++;
   }
   if(errors.length)throw new AggregateError(errors,message);
  };
  return resume;
 }
 /** One bounded chunk and an observer/sequence cursor; no retained history. */
 private pickupChannelDispatch(items:readonly (SoloPreparedDelivery|SoloPreparedDisposal)[],channel:'models'|'fades'|'loadout',errors:unknown[],failedActorResources:ReadonlySet<OriginalSoloObserver>=new Set(),failedTransientResources:ReadonlySet<OriginalSoloObserver>=new Set()):()=>Promise<void> {
  let itemIndex=0,sequence=1,nextOrdinal=1,transitionCount=0,loadoutCount=0,retrying=false;
  let failureCount=0;const samples:unknown[]=[];
  const record=(failure:unknown)=>{failureCount=Math.min(Number.MAX_SAFE_INTEGER,failureCount+1);if(samples.length<8)samples.push(failure);};
  return async()=>{
   while(itemIndex<items.length){
    const item=items[itemIndex],output=item.pickupOutput;
    if(!output){itemIndex++;continue;}
    const {world}=item,{descriptor,time}=output;
    let complete=true;
    while(sequence<=descriptor.chunkCount){
     let claimed:ReceiverPickupOutputChunk,chunk:ReceiverPickupOutputChunk;
     try{claimed=await (retrying?output.retryClaim!:output.claim)(channel,sequence);retrying=false;}
     catch(error){
      if(output.retryClaim){retrying=true;throw new SoloPickupReadPending(error);}
      record(error);complete=false;break;
     }
     try{
      chunk=copyReceiverPickupOutputChunk(claimed,output.bounds);
      if(chunk.sequence!==sequence||chunk.firstOrdinal!==nextOrdinal)throw Error('Solo committed pickup output continuity mismatch');
      transitionCount+=chunk.transitions.length;loadoutCount+=chunk.loadoutIntents.length;nextOrdinal+=chunk.transitions.length;
     }catch(error){record(error);complete=false;break;}
     // Consume the issued chunk before any synchronous external callout.
     sequence++;
     const chunkErrors:unknown[]=[];
     if(channel==='models'){
      const events:OriginalSoloEvent[]=chunk.transitions.length?[Object.freeze({kind:'model-transitions',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,transitions:chunk.transitions})]:[];
      this.dispatchCommittedModelEvents([{world,events}],chunkErrors,failedActorResources,failedTransientResources);
     }else if(channel==='fades'){
      const events=Object.freeze(chunk.transitions.filter((transition):transition is Extract<ReceiverModelTransition,{kind:'detach'}>=>transition.kind==='detach').map(transition=>Object.freeze({kind:'fade-born' as const,recipientId:world.id,lifeGeneration:world.lifeGeneration,time,transition})));
      const previous=world.fadeBirths;
      try{world.fadeBirths=events;this.dispatchCommittedFadeBirths([{world,events}],chunkErrors);}finally{world.fadeBirths=previous;}
     }else{
      const events=Object.freeze(chunk.loadoutIntents.map(({prefix,intent})=>Object.freeze({kind:'loadout-output' as const,recipientId:world.id,lifeGeneration:world.lifeGeneration,time,prefix,intent})));
      this.dispatchCommittedLoadoutOutputs([{world,events}],chunkErrors);
     }
     for(const error of chunkErrors)record(error);
    }
    if(complete&&(transitionCount!==descriptor.transitionCount||loadoutCount!==descriptor.loadoutCount))record(Error('Solo committed pickup output count mismatch'));
    itemIndex++;sequence=1;nextOrdinal=1;transitionCount=0;loadoutCount=0;retrying=false;
   }
   if(failureCount){errors.push(new AggregateError(samples,`Solo committed pickup ${channel} dispatch failed (${failureCount} failures; at most 8 samples)`));failureCount=0;samples.length=0;}
  };
 }
 private async dispatchPreparedPickupGoody(prepared:readonly SoloPreparedDelivery[],spawnEvents:readonly OriginalSoloLaunchSpawnPublication[]):Promise<void> {
  const drained=this.drainCommittedSceneOutcomes(prepared.map(item=>item.world),'callback'),errors=drained.errors;
  const reportDamage=this.publishCommittedWeaponReportDamage(drained.weaponReportQueues,errors);
  const steps=[
   ()=>this.dispatchCommittedBotProjectileCommits(drained.botProjectileCommits,errors),
   ()=>this.dispatchCommittedProjectileStates(drained.projectileStates,errors),
   ()=>this.dispatchCommittedLaunchSpawns(spawnEvents,errors),
   ()=>this.dispatchCommittedModelEvents(prepared,errors,drained.failedActorResources,drained.failedTransientResources),
   this.pickupChannelDispatch(prepared,'models',errors,drained.failedActorResources,drained.failedTransientResources),
   ()=>this.dispatchCommittedLocalWeaponStates(drained.localWeaponStates,errors),
   ()=>this.dispatchCommittedLoadoutStates(drained.loadoutStates,errors),
   ()=>this.dispatchCommittedWeaponReports(drained.weaponReportQueues,errors),
   ()=>this.dispatchCommittedGunPhaseStates(drained.gunPhaseStates,errors),
   ()=>this.dispatchCommittedGunOutputs(drained.gunOutputQueues,errors),
   ()=>this.dispatchCommittedLocalHitscanOutcomes(drained.localHitscanQueues,errors),
   ()=>this.dispatchCommittedFadeBirths(prepared,errors),
   this.pickupChannelDispatch(prepared,'fades',errors),
   ()=>this.dispatchCommittedLoadoutOutputs(drained.loadoutQueues,errors),
   this.pickupChannelDispatch(prepared,'loadout',errors),
   ()=>this.dispatchCommittedSceneOutcomes(drained.queues,errors),
   ()=>this.dispatchCommittedWeaponReportDamage(reportDamage,errors),
   ()=>this.cleanup(),
  ];
  await this.orderedPickupDispatch(steps,errors,'Solo committed streamed callback dispatch failed')();
 }
 private async dispatchPreparedPickupDisposal(_world:OriginalSoloObserver,prepared:readonly SoloPreparedDisposal[]):Promise<void> {
  const drained=this.drainCommittedSceneOutcomes(prepared.map(item=>item.world),'receipt'),errors=drained.errors;
  const reportDamage=this.publishCommittedWeaponReportDamage(drained.weaponReportQueues,errors);
  const steps=[
   ()=>this.dispatchCommittedModelEvents(prepared,errors,drained.failedActorResources,drained.failedTransientResources),
   this.pickupChannelDispatch(prepared,'models',errors,drained.failedActorResources,drained.failedTransientResources),
   ()=>this.dispatchCommittedBotProjectileCommits(drained.botProjectileCommits,errors),
   ()=>this.dispatchCommittedProjectileStates(drained.projectileStates,errors),
   ()=>this.dispatchCommittedLocalWeaponStates(drained.localWeaponStates,errors),
   ()=>this.dispatchCommittedLoadoutStates(drained.loadoutStates,errors),
   ()=>this.dispatchCommittedWeaponReports(drained.weaponReportQueues,errors),
   ()=>this.dispatchCommittedGunPhaseStates(drained.gunPhaseStates,errors),
   ()=>this.dispatchCommittedGunOutputs(drained.gunOutputQueues,errors),
   ()=>this.dispatchCommittedLocalHitscanOutcomes(drained.localHitscanQueues,errors),
   ()=>this.dispatchCommittedFadeBirths(prepared,errors),
   this.pickupChannelDispatch(prepared,'fades',errors),
   ()=>this.dispatchCommittedLoadoutOutputs(drained.loadoutQueues,errors),
   this.pickupChannelDispatch(prepared,'loadout',errors),
   ()=>this.dispatchCommittedSceneOutcomes(drained.queues,errors),
   ()=>this.dispatchCommittedWeaponReportDamage(reportDamage,errors),
   ()=>this.cleanup(),
  ];
  await this.orderedPickupDispatch(steps,errors,'Solo committed streamed disposal dispatch failed')();
 }
 /** Trusted positive ray report, published once at the next where callback. */
 reportShots(id:string,count:number):void {
  this.rejectLaunchBatchReentry();
  const world=this.require(id);if(!world.alive)return;
  const next=(this.pendingShots.get(id)??0)+count;
  if(!Number.isSafeInteger(count)||count<0||next>MAX_ORIGINAL_REMOTE_SHOTS)throw Error('Solo source shot report capacity exceeded');
  if(count)this.pendingShots.set(id,next);
 }
 actors(time:number):void {
  this.rejectLaunchBatchReentry();
  if(this.actorDispatching)throw Error('Recursive Solo actor dispatch');
  if(this.frozen)return;if(this.phase!=='goody')throw Error('Solo goody phase missing');
  if(!Number.isFinite(time)||time<0)throw Error('Invalid Solo actor time');
  this.actorDispatching=true;try{
  let progress=this.actorProgress;
  if(progress&&progress.time!==time)throw Error('Pending Solo actor stage requires identical time');
  if(!progress){progress={time,captures:this.captures.map(c=>({world:c.world,blasts:[...c.blasts].reverse(),projectiles:[...c.projectiles].reverse()})),errors:[],worldIndex:0,blastIndex:0,projectileIndex:0};this.actorProgress=progress;}
  const errors=progress.errors;
  // Fixed scalar schema: never traverse convex geometry or arbitrary extras.
  const fingerprint=(state:OriginalProjectileState)=>{
   if(state.weapon!=='rpg'&&state.weapon!=='launcher'||typeof state.shooterId!=='string'||state.shooterId.length===0||state.shooterId.length>65536||typeof state.hit!=='boolean')throw Error('Invalid Solo projectile actor primitives');
   const r=state.sourceRotation,a=state.angular,q=a?.orientation,v=a?.angularVelocity,c=a?.centerOfMass,i=a?.inverseInertia;
   const numbers=[state.remainingCallbacks,state.position.x,state.position.y,state.position.z,state.velocity.x,state.velocity.y,state.velocity.z,state.direction.x,state.direction.y,state.direction.z,...(r?[r.x,r.y,r.z]:[]),...(a?[q!.x,q!.y,q!.z,q!.w,v!.x,v!.y,v!.z,c!.x,c!.y,c!.z,i!.xx,i!.yy,i!.zz,i!.xy,i!.xz,i!.yz]:[])];
   if(!numbers.every(Number.isFinite))throw Error('Invalid Solo projectile actor operands');
   return JSON.stringify([state.weapon,state.shooterId,state.hit,!!r,!!a,...numbers]);
  };
  while(progress.worldIndex<progress.captures.length){
   const {world,blasts,projectiles}=progress.captures[progress.worldIndex];
   if(this.current(world))while(progress.blastIndex<blasts.length){
    const blast=blasts[progress.blastIndex++];if(!this.current(world))break;if(world.blasts.get(blast.launch.id)!==blast)continue;
    const owned=this.blastOwners.get(world)?.has(blast)===true;
    const result=stepOriginalBlast(blast.state,owned?[]:[{id:world.id,position:originalPlayerEye(world.body)}]);
    if(result.damagedPlayerIds.length)try{this.damage(world.id,5,time,{launch:blast.launch,position:blast.state.position});}catch(error){errors.push(error);}
    if(result.expired){world.blasts.delete(blast.launch.id);const owners=this.blastOwners.get(world);if(owners?.has(blast)){const retained=new Map(owners);retained.delete(blast);this.blastOwners.set(world,retained);}}
   }
   while(this.current(world)&&progress.projectileIndex<projectiles.length){
    const projectile=projectiles[progress.projectileIndex];
    if(world.projectiles.get(projectile.launch.id)!==projectile){if(progress.pending?.context)physicalPuffContexts.delete(progress.pending.context);progress.pending=undefined;progress.projectileIndex++;continue;}
    if(!progress.pending){
     const next={...projectile.state,position:vector(projectile.state.position),direction:vector(projectile.state.direction),velocity:vector(projectile.state.velocity)};
     const eyes=world.mirror.freeze().map(pose=>({id:pose.id,position:{...pose.position,y:pose.position.y+this.runtime.profile.eyeHeight}}));
     const result=stepOriginalProjectileActor(next,{localEye:originalPlayerEye(world.body),eyes:eyes.filter(eye=>!originalAsciiNamesEqual(world.actorNames.get(eye.id)?.name??'',projectile.launch.ownerName))});
     progress.pending={projectile,fingerprint:fingerprint(projectile.state),convex:projectile.state.convex,referenceConvex:projectile.state.angular?.referenceConvex,next,detonated:result.detonated};
    }
    const plan=progress.pending;
    const unchanged=()=>plan.fingerprint===fingerprint(projectile.state)&&plan.convex===projectile.state.convex&&plan.referenceConvex===projectile.state.angular?.referenceConvex;
    if(plan.projectile!==projectile||!unchanged())throw Error('Changed pending Solo projectile actor');
    const lease=this.receiverSceneLeases.get(world);
    let append:OriginalSoloPhysicalPuffStage|undefined;
    if(lease?.preparePhysicalPuff&&projectile.state.weapon==='rpg'&&projectile.state.remainingCallbacks>0){
     this.preparingActorPuff=true;this.actorPuffReentry=false;
     try{
     if(!plan.context){
      const prefix=world.transientState?.prefix;if(!prefix)throw Error('Missing committed Solo puff prefix');
      const random36=this.options.samplePuffRandom36===undefined?Math.floor(Math.random()*36)+1:this.options.samplePuffRandom36();
      if(!Number.isSafeInteger(random36)||random36<1||random36>36)throw Error('Invalid Solo puff random36');
      if(this.actorPuffReentry||!this.current(world)||this.actorProgress!==progress||!unchanged())throw Error('Changed Solo puff sampling stage');
      const context:OriginalSoloPhysicalPuffContext=Object.freeze({observer:world,prefix,physicalCallback:this.physicalCallbacks.get(world)??0,time,projectile,event:Object.freeze({kind:'puff',id:`solo-rpg-puff:${world.lifeGeneration}:${world.callback}:${projectile.launch.id}`,position:immutable(plan.next.position),angleSourceDegrees:random36*10})});
      physicalPuffContexts.add(context);plan.context=context;
     }
      append=lease.preparePhysicalPuff(plan.context);
      if(this.actorPuffReentry||!this.current(world)||this.actorProgress!==progress||!unchanged()||!sameReceiverScenePrefix(append.checkpoint.prefix,plan.context.prefix))throw Error('Foreign or changed Solo puff stage');
      validateOriginalReceiverTransientCheckpoint(append.checkpoint,{maxModels:256,maxActors:256,maxShaders:256,maxTextures:256,maxPoolEntries:256,maxTextChars:65536});
      append.commit();
     }catch(error){try{append?.rollback();}catch(cleanup){throw new AggregateError([error,cleanup],'Solo puff append and rollback failed');}throw error;}
     finally{this.preparingActorPuff=false;}
    }
    projectile.state.remainingCallbacks=plan.next.remainingCallbacks;projectile.state.velocity=plan.next.velocity;
    if(plan.context)physicalPuffContexts.delete(plan.context);
    progress.pending=undefined;progress.projectileIndex++;
    if(append){world.transientState=append.checkpoint;const resources=this.transientResourceBindings.get(world);
     try{this.emit({kind:'transient-state',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,checkpoint:append.checkpoint,...(resources?{resources}:{})});}catch(error){errors.push(error);}
    }
    if(plan.detonated&&this.current(world)){
     world.projectiles.delete(projectile.launch.id);const blast={launch:projectile.launch,state:createOriginalBlast(projectile.state.position,projectile.launch.ownerId,projectile.launch.weapon)};world.blasts.set(projectile.launch.id,blast);
     this.observedDetonations.set(blast,Object.freeze({world,physicalCallback:this.physicalCallbacks.get(world)??0,position:immutable(blast.state.position),weapon:blast.launch.weapon,ownerName:blast.launch.ownerName,terminalProjectilePose:Object.freeze({id:projectile.launch.id,weapon:projectile.state.weapon,position:immutable(projectile.state.position),direction:immutable(projectile.state.direction),...(projectile.state.sourceRotation?{sourceRotation:immutable(projectile.state.sourceRotation)}:{}),...(projectile.state.angular?{orientation:Object.freeze({...projectile.state.angular.orientation})}:{})})}));
     try{this.emit({kind:'detonated',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,launch:projectile.launch,position:vector(projectile.state.position)});}catch(error){errors.push(error);}
    }
   }
   if(progress.pending?.context)physicalPuffContexts.delete(progress.pending.context);
   progress.pending=undefined;progress.worldIndex++;progress.blastIndex=0;progress.projectileIndex=0;
  }
  if(this.actorProgress===progress){this.actorProgress=undefined;this.captures=[];this.phase='idle';}
  this.cleanup();if(errors.length)throw new AggregateError(errors,'Solo committed actor dispatch failed');
  }finally{this.actorDispatching=false;}
 }

 damage(id:string,amount:number,time:number,source:{launch?:OriginalSoloLaunch;ownerId?:string;ownerName?:string;position?:Vec3}={}):{health:number;dead:boolean}|null {
  this.rejectLaunchBatchReentry();
  const world=this.worlds.get(id);if(!world?.alive||this.frozen)return null;
  const result=applyOriginalPlayerDamage(world.health,amount);
  const event={recipientId:id,lifeGeneration:world.lifeGeneration,time,damage:amount,health:result.health,launch:source.launch,ownerId:source.launch?.ownerId??source.ownerId,ownerName:source.launch?.ownerName??source.ownerName,position:source.position?vector(source.position):undefined};
  if(result.dead)world.alive=false;
  try{
   this.emit({kind:'damaged',...event});
   if(result.dead&&this.worlds.get(id)===world)this.emit({kind:'dead',...event});
  }finally{if(result.dead&&this.worlds.get(id)===world)this.disposeTerminal(world);}
  return result;
 }
 remotePoses(id:string):readonly OriginalRemoteViewPose[]{return this.require(id).mirror.freeze();}
 private rejectLaunchBatchReentry(allowPending=false):void {
  if(this.drainingCurrent&&!this.deathAdmission)throw Error('Solo CURRENT draining');
  if(!this.deathAdmission&&(this.queuedDeaths.size||this.deathWork))throw Error('Solo terminal deaths awaiting durable delivery');
  if([...this.currentOperations].some(op=>!!op.cleanup))throw Error('Solo CURRENT cleanup requires draining');
  if(this.preparingActorPuff){this.actorPuffReentry=true;throw Error('Solo puff preparation forbids coordinator reentry');}
  if(this.preparingLaunchBatch){this.launchBatchReentry=true;throw Error('Solo launch capture forbids coordinator reentry');}
  if(this.awaitingCurrent)throw Error('Solo CURRENT cohort awaiting completion');
  if(this.pendingLaunchBatch&&!allowPending)throw Error('Uncommitted launch batch requires retry or reset before mutation');
 }
 private current(world:OriginalSoloObserver){return this.worlds.get(world.id)===world&&world.alive&&!this.frozen;}
 private require(id:string){const world=this.worlds.get(id);if(!world)throw Error('Missing solo observer life');return world;}
 private emit(event:OriginalSoloEvent){this.options.onEvent?.(event);}
 private captureRecord(world:OriginalSoloObserver,packet:{targets?:OriginalRemoteViewSnapshot['targets'];deathPlayerId?:string},callback:number,receiptActorNames:OriginalSoloReceiverCurrentContext['receiptActorNames']=[]):SoloPreparedCurrentCapture {
  if(!Number.isSafeInteger(callback)||callback<0||!Number.isSafeInteger(world.receiptTick+1))throw Error('Solo mirror clock requires reset');
  const tick=world.receiptTick,order=Object.freeze({callbacks:callback,receiptCallbacks:packet.targets?Math.max(0,callback-1):callback});
  const lease=this.receiverSceneLeases.get(world);if(!lease?.captureCurrent)return {launchAdmissions:Object.freeze([])};
  const afterGoody=this.completedGoodyCallbacks.get(world)===this.callback;
  if(packet.targets&&!afterGoody)throw Error('Solo CURRENT goody not complete');
  const batch=packet.targets?this.pendingLaunchBatch:undefined;
  const prefix=Object.freeze({kind:'callback' as const,sceneGeneration:world.lifeGeneration,callback});
  let acceptingReservations=true;
  const context:OriginalSoloReceiverCurrentContext=Object.freeze({observer:world,target:world,id:world.id,name:world.name,lifeGeneration:world.lifeGeneration,
   physicalCallback:this.physicalCallbacks.get(world)??0,mirrorCallback:world.callback,receiptTick:tick,time:world.updatedAt,phase:this.phase,afterGoody,
   deliveryKind:packet.targets?'where':'death',order,body:world.body,health:world.health,alive:world.alive,barrels:world.barrels,...(world.doors?{doors:world.doors}:{}),
   projectiles:world.projectiles,blasts:world.blasts,actorNames:world.actorNames,
   receiptActorNames:Object.freeze(receiptActorNames.map(row=>Object.freeze({actorId:row.actorId,name:row.name,lifeGeneration:row.lifeGeneration}))),detonationFor:(blast:OriginalSoloBlast)=>this.detonationFor(world,blast),
   ...(batch?{reserveLaunch:(command:Omit<OriginalSoloLaunchCommand,'ownerId'>,ordinal:number)=>{if(!acceptingReservations||!this.preparingLaunchBatch||this.pendingLaunchBatch!==batch){if(this.preparingLaunchBatch)this.launchBatchReentry=true;throw Error('Solo launch reservation outside capture');}return batch.reserve(world,prefix,ordinal,command);}}:{}),
   yaw:world.yaw,motionTime:world.motionTime,...(world.weapon?{weapon:world.weapon}:{})});
  let captured:ReturnType<NonNullable<OriginalSoloReceiverSceneLease['captureCurrent']>>;
  try{captured=lease.captureCurrent(context);}finally{acceptingReservations=false;}
  if(this.worlds.get(world.id)!==world)throw Error('Solo CURRENT capture changed owner');
  const nextOwners=this.prepareBlastOwners(context,captured),raw=captured===undefined?undefined:captured.launchAdmissions;
  if(raw!==undefined&&!Array.isArray(raw))throw Error('Solo launch claim budget exceeded');
  const launchAdmissions:OriginalSoloReservedLaunchAdmission[]=[];
  const count=raw?.length??0;if(!Number.isSafeInteger(count)||count<0||count>64)throw Error('Solo launch claim budget exceeded');
  for(let i=0;i<count;i++){const admission=raw![i];if(!batch)throw Error('Solo launch claim outside discovery');batch.validateClaim(world,prefix,admission);launchAdmissions.push(admission);}
  return Object.freeze({context,nextOwners,launchAdmissions:Object.freeze(launchAdmissions)});
 }
 private prepareRecord(world:OriginalSoloObserver,packet:{targets?:OriginalRemoteViewSnapshot['targets'];deathPlayerId?:string},callback:number,receiptActorNames:OriginalSoloReceiverCurrentContext['receiptActorNames']=[],captured:SoloPreparedCurrentCapture=this.captureRecord(world,packet,callback,receiptActorNames)):Extract<OriginalRemoteViewDelivery,{ok:true}> {
  const trusted=this.mirrorEpoch(world)+callback*1000/30,tick=world.receiptTick;
  const order=Object.freeze({callbacks:callback,receiptCallbacks:packet.targets?Math.max(0,callback-1):callback});
  const stage=world.mirror.prepareSynchronousDelivery({tick,sentAt:trusted,targets:packet.targets??[],...(packet.deathPlayerId?{deathPlayerId:packet.deathPlayerId}:{})},order,trusted);
  if(!stage.ok)throw Error(`Solo mirror receipt failed: ${stage.reason}`);
  if(captured.nextOwners)this.preparedBlastOwners.set(stage,captured.nextOwners);return stage;
 }
 private prepareBlastOwners(context:OriginalSoloReceiverCurrentContext,captured:void|OriginalSoloCurrentCaptureResult):ReadonlyMap<OriginalSoloBlast,OriginalSoloCurrentBlastClaim> {
  const claims=captured===undefined?[]:captured?.blastClaims;
  if(!Array.isArray(claims)||claims.length>MAX_SOLO_CURRENT_BLAST_CLAIMS)throw Error('Solo blast claim budget exceeded');
  const world=context.observer,previous=this.blastOwners.get(world),next=new Map<OriginalSoloBlast,OriginalSoloCurrentBlastClaim>(),effects=new Set<string>();let text=0;
  for(const claim of claims){
   if(!claim||typeof claim.effectId!=='string'||!claim.effectId||!claim.birthPrefix||!claim.blast)throw Error('Invalid solo blast claim');
   text+=claim.effectId.length;if(text>65536)throw Error('Solo blast claim text budget exceeded');
   validateReceiverScenePrefix(claim.birthPrefix);
   const blast=claim.blast;
   if(world.blasts.get(blast.launch.id)!==blast||next.has(blast)||effects.has(claim.effectId))throw Error('Foreign or aliased solo blast claim');
   const old=previous?.get(blast);
   if(old){if(old.effectId!==claim.effectId||!sameReceiverScenePrefix(old.birthPrefix,claim.birthPrefix))throw Error('Changed owned solo blast claim');}
   else{
    const observed=this.observedDetonations.get(blast),prefix=claim.birthPrefix;
    if(!observed||observed.world!==world||context.deliveryKind!=='where'||!context.afterGoody
     ||context.physicalCallback!==context.mirrorCallback+1||observed.physicalCallback!==context.physicalCallback-1
     ||blast.state.remainingCallbacks!==16||prefix.kind!=='receipt'||prefix.sceneGeneration!==context.lifeGeneration
     ||prefix.callback!==context.order.receiptCallbacks||prefix.callback!==context.physicalCallback-1||prefix.tick!==context.receiptTick
     ||blast.state.weapon!==observed.weapon||blast.launch.ownerName!==observed.ownerName
     ||blast.state.position.x!==observed.position.x||blast.state.position.y!==observed.position.y||blast.state.position.z!==observed.position.z)throw Error('Invalid first solo blast claim');
   }
   const prefix=claim.birthPrefix;
   const birthPrefix:ReceiverScenePrefix=Object.freeze({sceneGeneration:prefix.sceneGeneration,callback:prefix.callback,
    ...(prefix.kind==='receipt'?{kind:'receipt' as const,tick:prefix.tick}:{kind:'callback' as const})});
   effects.add(claim.effectId);next.set(blast,Object.freeze({blast,effectId:claim.effectId,birthPrefix}));
  }
  if(previous)for(const blast of previous.keys())if(world.blasts.get(blast.launch.id)===blast&&!next.has(blast))throw Error('Missing sticky solo blast claim');
  return next;
 }
 private publishBlastOwners(world:OriginalSoloObserver,stage:Extract<OriginalRemoteViewDelivery,{ok:true}>):void {
  const next=this.preparedBlastOwners.get(stage);if(next){this.blastOwners.set(world,next);this.preparedBlastOwners.delete(stage);}
 }
 private detonationFor(world:OriginalSoloObserver,blast:OriginalSoloBlast):OriginalSoloDetonationAdmission|undefined {
  if(this.worlds.get(world.id)!==world||!blast?.launch||world.blasts.get(blast.launch.id)!==blast)return undefined;
  const observed=this.observedDetonations.get(blast);if(!observed||observed.world!==world)return undefined;
  return Object.freeze({physicalCallback:observed.physicalCallback,position:observed.position,weapon:observed.weapon,ownerName:observed.ownerName,terminalProjectilePose:observed.terminalProjectilePose});
 }
 /** Optional lease publications are already applied by the joint publisher.
  * Never call damage() here or emit Controller remote-shot a second time. The
  * existing mirror shot event remains the sole source shot/audio notification.
  * Only explicitly committed exact-blast claims suppress legacy health damage.
  * Game activation still requires complete inventory and trusted FX admission. */
 private drainCommittedSceneOutcomes(worlds:readonly OriginalSoloObserver[],expectedKind:'callback'|'receipt'):{queues:SoloSceneOutcomeQueue[];loadoutQueues:SoloSceneLoadoutQueue[];loadoutStates:SoloSceneLoadoutStateQueue[];gunPhaseStates:SoloSceneGunPhaseStateQueue[];localHitscanQueues:SoloSceneLocalHitscanQueue[];weaponReportQueues:SoloSceneWeaponReportQueue[];gunOutputQueues:SoloSceneGunOutputQueue[];localWeaponStates:SoloSceneLocalWeaponStateQueue[];projectileStates:SoloSceneProjectileStateQueue[];botProjectileCommits:SoloSceneBotProjectileQueue[];failedActorResources:Set<OriginalSoloObserver>;failedTransientResources:Set<OriginalSoloObserver>;errors:unknown[]} {
  const queues:SoloSceneOutcomeQueue[]=[],loadoutQueues:SoloSceneLoadoutQueue[]=[],loadoutStates:SoloSceneLoadoutStateQueue[]=[],gunPhaseStates:SoloSceneGunPhaseStateQueue[]=[],localWeaponStates:SoloSceneLocalWeaponStateQueue[]=[],projectileStates:SoloSceneProjectileStateQueue[]=[],botProjectileCommits:SoloSceneBotProjectileQueue[]=[],failedActorResources=new Set<OriginalSoloObserver>(),failedTransientResources=new Set<OriginalSoloObserver>(),errors:unknown[]=[];
  const localHitscanQueues:SoloSceneLocalHitscanQueue[]=[],weaponReportQueues:SoloSceneWeaponReportQueue[]=[],gunOutputQueues:SoloSceneGunOutputQueue[]=[];
  for(const world of worlds){const lease=this.receiverSceneLeases.get(world);if(!lease?.drainOutcomes)continue;
   try{
    const values=lease.drainOutcomes();
    if(!Array.isArray(values)||values.length>MAX_SOLO_SCENE_OUTCOMES)throw Error('Solo scene outcome budget exceeded');
    let text=0,terminal=false;
    for(const value of values){
     if(terminal)throw Error('Solo scene outcomes continue after terminal death');
     if(!value||value.kind!=='hurt'||typeof value.effectId!=='string'||!value.effectId||value.amount!==5||!value.position||![value.position.x,value.position.y,value.position.z,value.health].every(Number.isFinite)||typeof value.dead!=='boolean'
      ||value.attackerName!==null&&typeof value.attackerName!=='string')throw Error('Invalid solo scene outcome');
     validateReceiverScenePrefix(value.prefix);text+=value.effectId.length+(value.attackerName?.length??0);
     if(text>65536)throw Error('Solo scene outcome text budget exceeded');terminal=value.dead;
    }
    const outcomes=Object.freeze(values.map((value:ReceiverCurrentHurtOutcome)=>Object.freeze({kind:'hurt' as const,effectId:value.effectId,prefix:Object.freeze(value.prefix.kind==='receipt'
     ?{kind:'receipt' as const,sceneGeneration:value.prefix.sceneGeneration,callback:value.prefix.callback,tick:value.prefix.tick}
     :{kind:'callback' as const,sceneGeneration:value.prefix.sceneGeneration,callback:value.prefix.callback}),position:immutable(value.position),attackerName:value.attackerName,amount:5 as const,health:value.health,dead:value.dead})));
    // Associate only an explicitly committed claim for this exact private
    // blast. Names/positions are never sufficient to infer a source launch.
    const launchesByEffect=new Map<string,OriginalSoloLaunch>();
    for(const claim of this.blastOwners.get(world)?.values()??[]){
     if(world.blasts.get(claim.blast.launch.id)===claim.blast)launchesByEffect.set(claim.effectId,claim.blast.launch);
    }
    const id=world.id,lifeGeneration=world.lifeGeneration,time=world.updatedAt;
    const events=Object.freeze(outcomes.map(outcome=>{
     const launch=launchesByEffect.get(outcome.effectId);
     const metadata={recipientId:id,lifeGeneration,time,effectId:outcome.effectId,damage:outcome.amount,health:outcome.health,position:immutable(outcome.position),
      ...(launch?{launch,ownerId:launch.ownerId}:{}),...(outcome.attackerName!==null?{ownerName:outcome.attackerName}:{})};
     const damaged:OriginalSoloEvent=Object.freeze({kind:'damaged',...metadata});
     const dead:OriginalSoloEvent|undefined=outcome.dead?Object.freeze({kind:'dead',...metadata}):undefined;
     return Object.freeze({damaged,...(dead?{dead}:{})});
    }));
    queues.push({world,id,lifeGeneration,outcomes,events});
   }catch(error){errors.push(error);}
   // Validation errors here are failed post-commit delivery, not rollback of
   // already published owner state. Each queue still drains independently.
   // Independent try/catch: a malformed/throwing hurt drain must not strand
   // committed loadout output, nor prevent another recipient's queues draining.
   if(lease.drainWeaponReports)try{weaponReportQueues.push(this.copyCommittedWeaponReports(world,lease.drainWeaponReports()));}catch(error){errors.push(error);}
   if(lease.drainGunOutputs)try{gunOutputQueues.push(this.copyCommittedGunOutputs(world,lease.drainGunOutputs()));}catch(error){errors.push(error);}
   if(lease.drainLoadoutIntents)try{loadoutQueues.push(this.copyCommittedLoadoutOutputs(world,lease.drainLoadoutIntents()));}catch(error){errors.push(error);}
   if(lease.drainLocalHitscanOutcomes)try{
    const values=copyReceiverLocalHitscanOutcomes(lease.drainLocalHitscanOutcomes(),{kind:'callback',sceneGeneration:world.lifeGeneration,callback:world.callback},MAX_SOLO_SCENE_OUTCOMES,65536);
    if(this.worlds.get(world.id)===world)world.localHitscanOutcomes=values;
    const events=Object.freeze(values.map(outcome=>Object.freeze({kind:'local-hitscan-outcome' as const,recipientId:world.id,lifeGeneration:world.lifeGeneration,time:world.updatedAt,outcome})));
    localHitscanQueues.push({world,events});
   }catch(error){errors.push(error);}
   if(lease.readLocalWeaponState)try{
    const raw=lease.readLocalWeaponState();
    if(raw!==undefined){
     const checkpoint=copyReceiverLocalWeaponWorldCheckpoint(raw,65536),prefix=checkpoint.prefix;
     if(prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback||prefix.kind==='receipt'&&prefix.tick!==world.receiptTick-1)throw Error('Stale or foreign solo local weapon state prefix');
     const event=Object.freeze({kind:'local-weapon-state' as const,recipientId:world.id,lifeGeneration:world.lifeGeneration,time:world.updatedAt,checkpoint});
     if(this.worlds.get(world.id)===world)world.localWeapons=checkpoint;
     localWeaponStates.push({world,event});
    }
   }catch(error){errors.push(error);}
   if(lease.readProjectileState)try{
    const raw=lease.readProjectileState();
    if(raw!==undefined){
     const checkpoint=copyReceiverProjectileWorldCheckpoint(raw,{maxModels:MAX_SOLO_SCENE_OUTCOMES,maxActors:MAX_SOLO_SCENE_OUTCOMES,maxTextChars:65536}),prefix=checkpoint.prefix;
     if(prefix.kind!==expectedKind||prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback||prefix.kind==='receipt'&&prefix.tick!==world.receiptTick-1)throw Error('Stale or foreign solo projectile state prefix');
     const event=Object.freeze({kind:'projectile-state' as const,recipientId:world.id,lifeGeneration:world.lifeGeneration,time:world.updatedAt,checkpoint});
     if(this.worlds.get(world.id)===world)world.projectileState=checkpoint;
     projectileStates.push({world,event});
    }
   }catch(error){errors.push(error);}
   if(lease.readBotProjectileCommit)try{
    const checkpoint=lease.readBotProjectileCommit();
    if(checkpoint===undefined){if(this.worlds.get(world.id)===world)world.botProjectileCommit=undefined;}
    else{
     if(!Object.isFrozen(checkpoint)||!Object.isFrozen(checkpoint.prefix)||!Object.isFrozen(checkpoint.shots)||!Array.isArray(checkpoint.shots)||checkpoint.shots.length>64)throw Error('Invalid solo bot projectile commit');
     const prefix=checkpoint.prefix;validateReceiverScenePrefix(prefix);
     if(expectedKind!=='callback'||prefix.kind!=='callback'||prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback)throw Error('Stale or foreign solo bot projectile commit');
     let sequence=world.botProjectileSequence??0,text=0;
     const shots=checkpoint.shots,count=shots.length;
     for(let i=0;i<count;i++){
      const shot=shots[i];
      if(!isOriginalSoloBotShotCapture(shot)||shot.ownerId!==world.id||shot.ownerLife!==world.lifeGeneration||shot.weapon!=='launcher'&&shot.weapon!=='rpg'||shot.sequence<=sequence)throw Error('Foreign or repeated solo bot projectile trigger');
      sequence=shot.sequence;text+=shot.ownerId.length+shot.targetId.length+shot.weapon.length;if(text>65536)throw Error('Solo bot projectile commit text budget exceeded');
     }
     if(this.worlds.get(world.id)===world){world.botProjectileCommit=checkpoint;world.botProjectileOwned=true;world.botProjectileSequence=sequence;}
     botProjectileCommits.push({world,event:Object.freeze({kind:'bot-projectile-commit' as const,recipientId:world.id,lifeGeneration:world.lifeGeneration,time:world.updatedAt,checkpoint})});
    }
   }catch(error){errors.push(error);}
   let committedLoadout:ReceiverLoadoutCheckpoint|undefined;
   if(lease.readLoadoutState)try{
    const checkpoint=lease.readLoadoutState();
    if(checkpoint!==undefined){const state=this.copyCommittedLoadoutState(world,checkpoint);
     if(this.worlds.get(world.id)===world&&world.lifeGeneration===state.event.lifeGeneration){world.loadout=state.event.checkpoint;world.weapon=state.event.checkpoint.selected??undefined;}
     committedLoadout=state.event.checkpoint;loadoutStates.push(state);
    }
   }catch(error){errors.push(error);}
   if(lease.readGunPhaseState)try{
    const raw=lease.readGunPhaseState();
    if(raw===undefined){if(this.worlds.get(world.id)===world)world.gunPhase=undefined;}
    else{
     const checkpoint=copyReceiverGunPhaseCheckpoint(raw),prefix=checkpoint.prefix;
     if(prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback||!committedLoadout||committedLoadout.prefix.kind!=='callback'||committedLoadout.prefix.sceneGeneration!==prefix.sceneGeneration||committedLoadout.prefix.callback!==prefix.callback)throw Error('Stale or foreign solo gun phase prefix');
     const event=Object.freeze({kind:'gun-phase-state' as const,recipientId:world.id,lifeGeneration:world.lifeGeneration,time:world.updatedAt,checkpoint});
     if(this.worlds.get(world.id)===world)world.gunPhase=checkpoint;
     gunPhaseStates.push({world,event});
    }
   }catch(error){errors.push(error);}
   if(lease.readActorResources)try{
    const descriptor=lease.readActorResources(),bound=this.actorResourceBindings.get(world);
    if(descriptor!==undefined)validateOriginalReceiverActorResourceDescriptor(descriptor,65536);
    if(bound!==undefined&&descriptor!==bound)throw Error('Changed or missing solo actor resource descriptor');
    if(descriptor!==undefined&&this.worlds.get(world.id)===world){this.actorResourceBindings.set(world,descriptor);world.actorResources=descriptor;}
   }catch(error){failedActorResources.add(world);errors.push(error);}
  }
  // Finish every recipient's outcome/output drains before consulting FX
  // metadata. Reader failures cannot strand another committed queue.
  for(const world of worlds){const lease=this.receiverSceneLeases.get(world);if(!lease?.drainOutcomes)continue;
   if(lease.readTransientResources)try{
    const descriptor=lease.readTransientResources(),bound=this.transientResourceBindings.get(world);
    if(descriptor!==undefined){
     validateOriginalReceiverTransientResourceDescriptor(descriptor,65536);
     if(descriptor.sourceScale!==this.runtime.scale)throw Error('Solo transient resource scale mismatch');
     const checkpoint=world.transientState;
     if(checkpoint){
      if(checkpoint.planeWidthWorld!==null&&checkpoint.planeWidthWorld!==descriptor.planeWidthWorld)throw Error('Solo transient resource plane width mismatch');
      const names=new Set(descriptor.textureNames);
      for(const texture of checkpoint.textures)if(!names.has(texture.name))throw Error('Solo transient resource texture mismatch');
     }
    }
    if(bound!==undefined&&descriptor!==bound)throw Error('Changed or missing solo transient resource descriptor');
    if(descriptor!==undefined&&this.worlds.get(world.id)===world){this.transientResourceBindings.set(world,descriptor);world.transientResources=descriptor;}
   }catch(error){failedTransientResources.add(world);errors.push(error);}
  }
  return {queues,loadoutQueues,loadoutStates,gunPhaseStates,localHitscanQueues,weaponReportQueues,gunOutputQueues,localWeaponStates,projectileStates,botProjectileCommits,failedActorResources,failedTransientResources,errors};
 }
 private dispatchCommittedBotProjectileCommits(queues:readonly SoloSceneBotProjectileQueue[],errors:unknown[]):void {
  for(const {world,event} of queues){if(this.worlds.get(world.id)!==world||world.botProjectileCommit!==event.checkpoint)continue;try{this.emit(event);}catch(error){errors.push(error);}}
 }
 private dispatchCommittedProjectileStates(queues:readonly SoloSceneProjectileStateQueue[],errors:unknown[]):void {
  for(const {world,event} of queues){if(this.worlds.get(world.id)!==world||world.lifeGeneration!==event.lifeGeneration||world.projectileState!==event.checkpoint)continue;try{this.emit(event);}catch(error){errors.push(error);}}
 }
 private copyCommittedLoadoutPrefix(world:OriginalSoloObserver,raw:ReceiverScenePrefix):ReceiverScenePrefix {
  if(!raw)throw Error('Invalid solo loadout prefix');
  const kind=raw.kind,sceneGeneration=raw.sceneGeneration,callback=raw.callback;
  if(kind!=='callback'&&kind!=='receipt')throw Error('Invalid solo loadout prefix');
  const prefix:ReceiverScenePrefix=kind==='receipt'?{kind,sceneGeneration,callback,tick:raw.tick}:{kind,sceneGeneration,callback};
  validateReceiverScenePrefix(prefix);
  if(sceneGeneration!==world.lifeGeneration||callback>world.callback||prefix.kind==='receipt'&&prefix.tick>=world.receiptTick)throw Error('Foreign or future solo loadout prefix');return Object.freeze(prefix);
 }
 private copyCommittedLoadoutState(world:OriginalSoloObserver,raw:ReceiverLoadoutCheckpoint):SoloSceneLoadoutStateQueue {
  if(!raw)throw Error('Invalid solo loadout state');
  const rawPrefix=raw.prefix,map=raw.map,selected=raw.selected,refillTarget=raw.refillTarget,score=raw.score,goldScore=raw.goldScore,counter=raw.counter,rawOwned=raw.owned,rawAmmo=raw.ammo,rawReserve=raw.reserve;
  const prefix=this.copyCommittedLoadoutPrefix(world,rawPrefix);
  if(prefix.callback!==world.callback||prefix.kind==='receipt'&&prefix.tick!==world.receiptTick-1)throw Error('Stale solo loadout state prefix');
  if(!counter||!rawOwned||!rawAmmo||!rawReserve)throw Error('Invalid solo loadout state');
  const waitgun=counter.waitgun,poldwaitgun=counter.poldwaitgun,weapons=['pistol','shotgun','rifle','launcher','rpg','sniper'] as const;
  if(!['barrack','woodlands'].includes(map)||map!==this.runtime.map||selected!==null&&!weapons.includes(selected)||!Number.isSafeInteger(refillTarget)||refillTarget<1||!Number.isSafeInteger(score)||!Number.isFinite(goldScore)||![waitgun,poldwaitgun].every(Number.isSafeInteger))throw Error('Invalid solo loadout state');
  const owned={} as Record<typeof weapons[number],boolean>,ammo={} as Record<typeof weapons[number],number>,reserve={} as Record<typeof weapons[number],number>;
  for(const weapon of weapons){const has=rawOwned[weapon],chamber=rawAmmo[weapon],stock=rawReserve[weapon];
   if(typeof has!=='boolean'||![chamber,stock].every(n=>Number.isSafeInteger(n)&&n>=0)||!has&&stock!==0)throw Error('Invalid solo loadout state counts');
   owned[weapon]=has;ammo[weapon]=chamber;reserve[weapon]=stock;
  }
  const checkpoint:ReceiverLoadoutCheckpoint=Object.freeze({prefix,map,selected,refillTarget,score,goldScore,counter:Object.freeze({waitgun,poldwaitgun}),owned:Object.freeze(owned),ammo:Object.freeze(ammo),reserve:Object.freeze(reserve)});
  return {world,event:Object.freeze({kind:'loadout-state',recipientId:world.id,lifeGeneration:world.lifeGeneration,time:world.updatedAt,checkpoint})};
 }
 private dispatchCommittedLocalWeaponStates(queues:readonly SoloSceneLocalWeaponStateQueue[],errors:unknown[]):void {
  for(const {world,event} of queues){if(this.worlds.get(event.recipientId)!==world||world.lifeGeneration!==event.lifeGeneration)continue;try{this.emit(event);}catch(error){errors.push(error);}}
 }
 private dispatchCommittedLoadoutStates(queues:readonly SoloSceneLoadoutStateQueue[],errors:unknown[]):void {
  for(const {world,event} of queues){if(this.worlds.get(event.recipientId)!==world||world.lifeGeneration!==event.lifeGeneration)continue;try{this.emit(event);}catch(error){errors.push(error);}}
 }
 private dispatchCommittedGunPhaseStates(queues:readonly SoloSceneGunPhaseStateQueue[],errors:unknown[]):void {
  for(const {world,event} of queues){if(this.worlds.get(event.recipientId)!==world||world.lifeGeneration!==event.lifeGeneration)continue;try{this.emit(event);}catch(error){errors.push(error);}}
 }
 private dispatchCommittedLocalHitscanOutcomes(queues:readonly SoloSceneLocalHitscanQueue[],errors:unknown[]):void {
  for(const {world,events} of queues)for(const event of events){if(this.worlds.get(event.recipientId)!==world||world.lifeGeneration!==event.lifeGeneration)continue;try{this.emit(event);}catch(error){errors.push(error);}}
 }
 private copyCommittedWeaponReports(world:OriginalSoloObserver,values:readonly ReceiverCurrentWeaponReportPublication[]):SoloSceneWeaponReportQueue {
  if(!Array.isArray(values))throw Error('Solo weapon report budget exceeded');
  const count=values.length;if(!Number.isSafeInteger(count)||count<0||count>MAX_SOLO_SCENE_OUTCOMES)throw Error('Solo weapon report budget exceeded');
  const events:Extract<OriginalSoloEvent,{kind:'weapon-report'}>[]=[];let names=0,text=0;
  for(let index=0;index<count;index++){
   const value:ReceiverCurrentWeaponReportPublication=values[index],raw=value?.prefix;
   if(!raw||raw.kind!=='callback')throw Error('Invalid solo weapon report prefix');
   const prefix=Object.freeze({kind:'callback' as const,sceneGeneration:raw.sceneGeneration,callback:raw.callback});validateReceiverScenePrefix(prefix);
   if(prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback)throw Error('Stale or foreign solo weapon report');
   const report=copyReceiverWeaponReportPayload(value.report,MAX_SOLO_SCENE_OUTCOMES,65536);
   for(const hurt of report.hurts??[]){names++;text+=hurt.name.length;}
   if(names>MAX_SOLO_SCENE_OUTCOMES||text>65536)throw Error('Solo weapon report payload budget exceeded');
   events.push(Object.freeze({kind:'weapon-report',recipientId:world.id,lifeGeneration:world.lifeGeneration,time:world.updatedAt,prefix,report}));
  }
  const committed=Object.freeze(events);world.weaponReports=committed;
  return {world,events:committed};
 }
 private dispatchCommittedWeaponReports(queues:readonly SoloSceneWeaponReportQueue[],errors:unknown[]):void {
  for(const {world,events} of queues)for(const event of events){if(this.worlds.get(event.recipientId)!==world||world.lifeGeneration!==event.lifeGeneration)continue;try{this.emit(event);}catch(error){errors.push(error);}}
 }
 private copyCommittedGunOutputs(world:OriginalSoloObserver,values:readonly ReceiverCurrentGunOutputPublication[]):SoloSceneGunOutputQueue {
  if(!Array.isArray(values))throw Error('Solo gun output budget exceeded');
  const count=values.length;if(!Number.isSafeInteger(count)||count<0||count>MAX_SOLO_SCENE_OUTCOMES)throw Error('Solo gun output budget exceeded');
  const events:Extract<OriginalSoloEvent,{kind:'gun-output'}>[]=[];let text=0,previousIndex=-1,scopeFrame=false;
  for(let i=0;i<count;i++){
   const value:ReceiverCurrentGunOutputPublication=values[i],raw=value?.prefix,commandIndex=value?.commandIndex;
   if(!raw||raw.kind!=='callback'||!Number.isSafeInteger(commandIndex)||commandIndex<0||commandIndex<=previousIndex)throw Error('Invalid solo gun output order or prefix');
   const prefix=Object.freeze({kind:'callback' as const,sceneGeneration:raw.sceneGeneration,callback:raw.callback});validateReceiverScenePrefix(prefix);
   if(prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback)throw Error('Stale or foreign solo gun output');
   if(scopeFrame)throw Error('Solo gun output after scope frame');
   const output=copyReceiverGunOutput(value.output);scopeFrame=output.kind==='scope-frame';text+=receiverGunOutputTextChars(output);
   if(!Number.isSafeInteger(text)||text>65536)throw Error('Solo gun output text budget exceeded');
   previousIndex=commandIndex;events.push(Object.freeze({kind:'gun-output',recipientId:world.id,lifeGeneration:world.lifeGeneration,time:world.updatedAt,prefix,commandIndex,output}));
  }
  return {world,events:Object.freeze(events)};
 }
 private dispatchCommittedGunOutputs(queues:readonly SoloSceneGunOutputQueue[],errors:unknown[]):void {
  for(const {world,events} of queues)for(const event of events){
   if(this.worlds.get(event.recipientId)!==world||world.lifeGeneration!==event.lifeGeneration)continue;
   try{this.emit(event);}catch(error){errors.push(error);}
  }
 }
 private dispatchCommittedLaunchSpawns(values:readonly OriginalSoloLaunchSpawnPublication[],errors:unknown[]):void {
  for(const {world,event} of values){if(this.worlds.get(world.id)!==world||world.lifeGeneration!==event.lifeGeneration||world.projectiles.get(event.launch.id)?.state!==event.state)continue;try{this.emit(event);}catch(error){errors.push(error);}}
 }
 private publishCommittedWeaponReportDamage(queues:readonly SoloSceneWeaponReportQueue[],errors:unknown[]):readonly SoloWeaponReportDamagePlan[] {
  if(!this.admitWeaponReportDamage||this.frozen)return Object.freeze([]);
  try{
   // A send can precede a later lethal private effect in the same callback.
   // Its already committed report survives that death while the life exists.
   const reports=queues.flatMap(({world,events})=>this.worlds.get(world.id)===world
    ?events.map(event=>({sender:world,report:event.report,time:event.time})):[]);
   const plans=planOriginalSoloWeaponReportDamage(reports,[...this.worlds.values()]);
   // No callbacks or authority mutation occur between detached preparation and
   // publication. Keep borrowed health objects: CURRENT owns these references.
   if(plans.some(plan=>this.worlds.get(plan.world.id)!==plan.world||!plan.world.alive))throw Error('Changed Solo report damage target life');
   for(const plan of plans){plan.world.health.canonical=plan.health.canonical;plan.world.health.flick=plan.health.flick;if(plan.dead)plan.world.alive=false;}
   return plans;
  }catch(error){errors.push(error);return Object.freeze([]);}
 }
 private dispatchCommittedWeaponReportDamage(plans:readonly SoloWeaponReportDamagePlan[],errors:unknown[]):void {
  // Admission is already committed. Freeze cannot undo it; replacement/clear
  // suppresses obsolete notifications and never damages a fresh life.
  for(const plan of plans){
   const world=plan.world,stillOwned=()=>this.worlds.get(world.id)===world;
   for(const event of plan.events){if(!stillOwned())continue;try{this.emit(event);}catch(error){errors.push(error);}}
  }
  // Finish every victim's notifications before death receipts can reenter.
  for(const plan of plans)if(plan.dead&&this.worlds.get(plan.world.id)===plan.world)try{this.disposeTerminal(plan.world);}catch(error){errors.push(error);}
 }
 private copyCommittedLoadoutOutputs(world:OriginalSoloObserver,values:readonly ReceiverCurrentLoadoutPublication[]):SoloSceneLoadoutQueue {
  if(!Array.isArray(values))throw Error('Solo loadout output budget exceeded');
  const count=values.length;
  if(!Number.isSafeInteger(count)||count<0||count>MAX_SOLO_SCENE_OUTCOMES)throw Error('Solo loadout output budget exceeded');
  const id=world.id,lifeGeneration=world.lifeGeneration,time=world.updatedAt;
  const events:Extract<OriginalSoloEvent,{kind:'loadout-output'}>[]=[],weapons=['pistol','shotgun','rifle','launcher','rpg','sniper'];
  const sourceSounds:Readonly<Record<WeaponId,'repistol'|'reak47'|'rerg6'>>={pistol:'repistol',shotgun:'repistol',rifle:'reak47',sniper:'reak47',launcher:'rerg6',rpg:'rerg6'};let text=0;
  for(let i=0;i<count;i++){
   const value:ReceiverCurrentLoadoutPublication=values[i];if(!value)throw Error('Invalid solo loadout output');
   const rawPrefix=value.prefix,rawIntent=value.intent;if(!rawPrefix||!rawIntent)throw Error('Invalid solo loadout output');
   const prefix=this.copyCommittedLoadoutPrefix(world,rawPrefix);
   const kind=rawIntent.kind;let intent:ReceiverCurrentLoadoutPublication['intent'];
   if(kind==='feedback'){
    const message=rawIntent.message;if(typeof message!=='string')throw Error('Invalid solo loadout feedback');text+=kind.length+message.length;
    if(!Number.isSafeInteger(text)||text>65536)throw Error('Solo loadout output text budget exceeded');
    intent=Object.freeze({kind,message});
   }else if(kind==='reload-sound'){
    const weapon=rawIntent.weapon,sound=rawIntent.sound,channel=rawIntent.channel;
    if(typeof weapon!=='string'||!weapons.includes(weapon)||sourceSounds[weapon]!==sound||channel!==6)throw Error('Invalid solo loadout sound');
    text+=kind.length+weapon.length+sound.length;if(!Number.isSafeInteger(text)||text>65536)throw Error('Solo loadout output text budget exceeded');
    intent=Object.freeze({kind,weapon,sound,channel});
   }else throw Error('Invalid solo loadout intent');
   events.push(Object.freeze({kind:'loadout-output',recipientId:id,lifeGeneration,time,prefix:Object.freeze(prefix),intent}));
  }
  return {world,events:Object.freeze(events)};
 }
 private dispatchCommittedLoadoutOutputs(queues:readonly SoloSceneLoadoutQueue[],errors:unknown[]):void {
  // All queues are drained first. Deliver model events, loadout state, output, then hurt:
  // terminal hurt may dispose this life, but cannot erase its committed output.
  for(const {world,events} of queues)for(const event of events){
   if(this.worlds.get(event.recipientId)!==world||world.lifeGeneration!==event.lifeGeneration)continue;
   try{this.emit(event);}catch(error){errors.push(error);}
  }
 }
 /** Publish exact notification identities before any post-commit user sink.
  * The copied journal is bounded by the existing 256 entry/text caps. */
 private publishCommittedFadeBirths(items:readonly {world:OriginalSoloObserver;events:readonly OriginalSoloEvent[]}[]):void {
  for(const {world,events} of items){
   if(this.worlds.get(world.id)!==world)continue;
   world.fadeBirths=Object.freeze(events.filter((event):event is Extract<OriginalSoloEvent,{kind:'fade-born'}>=>event.kind==='fade-born'));
  }
 }
 private dispatchCommittedFadeBirths(items:readonly {world:OriginalSoloObserver;events:readonly OriginalSoloEvent[]}[],errors:unknown[]):void {
  // Source weapon evaluation precedes receiver actor fade constructors in the
  // installed callback adapter. Native actor-list scheduling remains unproved.
  for(const {world,events} of items)for(const event of events){
   if(event.kind!=='fade-born'||this.worlds.get(event.recipientId)!==world||world.lifeGeneration!==event.lifeGeneration||!world.fadeBirths?.includes(event))continue;
   try{this.emit(event);}catch(error){errors.push(error);}
  }
 }
 private dispatchCommittedModelEvents(items:readonly {world:OriginalSoloObserver;events:readonly OriginalSoloEvent[]}[],errors:unknown[],failedActorResources:ReadonlySet<OriginalSoloObserver>,failedTransientResources:ReadonlySet<OriginalSoloObserver>):void {
  for(const {world,events} of items)for(const event of events){
   if(event.kind==='fade-born')continue;
   if(this.worlds.get(event.recipientId)!==world||world.lifeGeneration!==event.lifeGeneration)continue;
   if((event.kind==='model-state'||event.kind==='shot-models')&&failedActorResources.has(world))continue;
   if(event.kind==='transient-state'&&failedTransientResources.has(world))continue;
   const resources=this.actorResourceBindings.get(world),transientResources=this.transientResourceBindings.get(world);
   const publication=(event.kind==='model-state'||event.kind==='shot-models')&&resources?Object.freeze({...event,resources}):event.kind==='transient-state'&&transientResources?Object.freeze({...event,resources:transientResources}):event;
   try{this.emit(publication);}catch(error){errors.push(error);}
  }
 }
 private dispatchCommittedSceneOutcomes(queues:readonly SoloSceneOutcomeQueue[],errors:unknown[]):void {
  // Freeze is not rollback: finish committed outcomes while this exact life
  // exists. clear/replacement invalidates by identity, including in callbacks.
  for(const {world,id,lifeGeneration,outcomes,events} of queues)for(let i=0;i<outcomes.length;i++){
   const stillOwned=()=>this.worlds.get(id)===world&&world.lifeGeneration===lifeGeneration;
   if(!stillOwned())continue;
   const outcome=outcomes[i],event=events[i];
   try{try{this.emit(event.damaged);}catch(error){errors.push(error);}
    if(event.dead&&stillOwned())try{this.emit(event.dead);}catch(error){errors.push(error);}
   }finally{if(outcome.dead&&stillOwned())try{this.disposeTerminal(world);}catch(error){errors.push(error);}}
  }
 }
 private deliveryEvents(world:OriginalSoloObserver,accepted:Extract<OriginalRemoteViewResult,{ok:true}>,names:ReadonlyMap<string,{name:string;lifeGeneration:number}>,time:number,targetCallback:number,streamed?:{cohort:OriginalSoloCurrentCohort;plan:OriginalSoloCurrentCohortPlan}):{events:OriginalSoloEvent[];journal:boolean;modelState?:ReceiverActorRegistrySnapshot;transientState?:ReceiverTransientCheckpoint;pickupOutput?:SoloPreparedPickupOutput} {
  // Copy all identity publications before any recipient commits. Keep this
  // dedicated ordered stream separate from mirror callback/receipt events.
  const rawTransitions=accepted.modelTransitions,modelState=accepted.modelState,rawShotModels=accepted.shotModels,transientState=accepted.transientState;
  const descriptor=accepted.pickupOutput;
  if(rawTransitions!==undefined&&descriptor!==undefined||(rawTransitions!==undefined||descriptor!==undefined)!==(modelState!==undefined))throw Error('Unpaired solo model journal/state');
  let pickupOutput:SoloPreparedPickupOutput|undefined;
  if(descriptor!==undefined){
   assertReceiverPickupOutputDescriptorRegistry(descriptor,modelState!,{callback:targetCallback,receiptTick:world.receiptTick});
   const validate=streamed?.cohort.validatePickupOutput,claim=streamed?.cohort.claimPickupOutput,retry=streamed?.cohort.retryPickupOutput;
   if(!streamed||typeof validate!=='function'||typeof claim!=='function')throw Error('Solo streamed pickup output requires an authenticated asynchronous cohort');
   validate.call(streamed.cohort,streamed.plan,descriptor);
   const {cohort,plan}=streamed;
   pickupOutput=Object.freeze({descriptor,time,bounds:Object.freeze({sceneGeneration:world.lifeGeneration,minCallback:world.callback,maxCallback:targetCallback,receiptTick:world.receiptTick,maxEntries:256,maxTextChars:65536}),claim:(channel:'models'|'fades'|'loadout',sequence:number)=>claim.call(cohort,plan,descriptor,channel,sequence),...(typeof retry==='function'?{retryClaim:(channel:'models'|'fades'|'loadout',sequence:number)=>retry.call(cohort,plan,descriptor,channel,sequence)}:{})});
  }
  if(modelState!==undefined){
   validateOriginalReceiverActorRegistrySnapshot(modelState,{maxModels:256,maxPickups:256,maxTextChars:65536});
   const prefix=modelState.prefix;
   if(modelState.sceneGeneration!==world.lifeGeneration||modelState.callback!==targetCallback||modelState.constructingGI!==undefined||!prefix||prefix.sceneGeneration!==world.lifeGeneration
    ||(targetCallback>world.callback?prefix.kind!=='callback'||prefix.callback!==targetCallback:prefix.kind!=='receipt'||prefix.callback!==world.callback||prefix.tick!==world.receiptTick))throw Error('Foreign or stale solo final model state');
  }
  if(transientState!==undefined){
   validateOriginalReceiverTransientCheckpoint(transientState,{maxModels:256,maxActors:256,maxShaders:256,maxTextures:256,maxPoolEntries:256,maxTextChars:65536});
   const prefix=transientState.prefix;
   if(transientState.sceneGeneration!==world.lifeGeneration||prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==targetCallback
    ||(targetCallback>world.callback?prefix.kind!=='callback':prefix.kind!=='receipt'||prefix.tick!==world.receiptTick))throw Error('Foreign or stale solo transient state');
  }
  const transitions=rawTransitions===undefined?undefined:copyReceiverModelTransitions(rawTransitions,{sceneGeneration:world.lifeGeneration,minCallback:world.callback,maxCallback:targetCallback,receiptTick:world.receiptTick,maxEntries:256,maxTextChars:65536});
  const shotModels=rawShotModels===undefined?undefined:copyReceiverShotModels(rawShotModels,{sceneGeneration:world.lifeGeneration,minCallback:world.callback,maxCallback:targetCallback,maxEntries:256,maxTextChars:65536});
  if(shotModels!==undefined){
   const admittedShots=accepted.shots??[];
   if(!Array.isArray(admittedShots)||admittedShots.length!==shotModels.length)throw Error('Unpaired solo shot model captures');
   for(let i=0;i<shotModels.length;i++){const captured=shotModels[i],admitted=admittedShots[i];
    if(!admitted||captured.actorId!==admitted.id||captured.weapon!==admitted.weapon||captured.callback!==admitted.callback)throw Error('Mismatched solo shot model capture');
   }
  }
  const events:OriginalSoloEvent[]=(accepted.modelEvents??accepted.events??[]).map(event=>{
   if(event.kind==='birth')return {kind:'baddy-born',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,ownerId:event.id,callback:event.callback,position:event.position,yaw:event.yaw,weapon:event.weapon??'rpg'};
   if(event.kind==='corpse-retired')return {kind:'corpse-retired',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,sequence:event.sequence,callback:event.callback};
   if(event.kind==='shot'){const shot=event.shot;return {kind:'shot',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,ownerId:shot.id,ownerName:names.get(shot.id)?.name??shot.id,weapon:shot.weapon,position:{...shot.position,y:shot.position.y+this.runtime.profile.eyeHeight}};}
   const transition=event.transition;return {kind:'baddy-detached',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,ownerId:transition.id,reason:event.kind,callback:transition.callback,...('corpseSequence' in event?{corpseSequence:event.corpseSequence}:{}),weapon:transition.weapon??'rpg',position:transition.position,yaw:transition.yaw};
  });
  // A detach's logical eye is the source fadeaway.new(pos) sound operand;
  // it is distinct from the lower dropped-gun position and later corpse pose.
  for(const transition of transitions??[])if(transition.kind==='detach')events.push(Object.freeze({kind:'fade-born',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,transition}));
  if(shotModels?.length)events.unshift(Object.freeze({kind:'shot-models',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,shots:shotModels}));
  if(transitions?.length)events.unshift(Object.freeze({kind:'model-transitions',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,transitions}));
  if(transientState!==undefined)events.unshift(Object.freeze({kind:'transient-state',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,checkpoint:transientState}));
  if(modelState!==undefined)events.unshift(Object.freeze({kind:'model-state',recipientId:world.id,lifeGeneration:world.lifeGeneration,time,checkpoint:modelState}));
  return {events,journal:rawTransitions!==undefined||descriptor!==undefined||shotModels!==undefined||transientState!==undefined,...(modelState!==undefined?{modelState}:{}),...(transientState!==undefined?{transientState}:{}),...(pickupOutput?{pickupOutput}:{})};
 }
 private readonly epochs=new WeakMap<OriginalSoloObserver,number>();
 private mirrorEpoch(world:OriginalSoloObserver):number {const epoch=this.epochs.get(world);if(epoch===undefined)throw Error('Missing solo mirror epoch');return epoch;}
 private updateDoors(world:OriginalSoloObserver,time:number):void {
  if(!world.doors||!this.current(world))return;
  const epoch=Math.max(time,world.doorEpoch,world.doors.updatedAtSeconds);
  world.doors.update(epoch);const opened=world.doors.triggerNearby(originalPlayerEye(world.body),epoch);
  if(!opened.length)return;world.doorEpoch=epoch;
  for(const name of opened){
   if(!this.current(world))return;
   this.emit({kind:'door',recipientId:world.id,lifeGeneration:world.lifeGeneration,time:epoch,name,ownerId:world.id,ownerName:world.name});
   if(!this.current(world))return;
   for(const recipient of [...this.worlds.values()]){
    if(recipient===world||!recipient.alive||!recipient.doors||originalAsciiNamesEqual(recipient.name,world.name))continue;
    if(this.options.deliverDoor?.(recipient,name,world)===false||!this.current(recipient)||!this.current(world))continue;
    const receiverEpoch=Math.max(epoch,recipient.doorEpoch,recipient.doors.updatedAtSeconds);
    if(recipient.doors.open(name,receiverEpoch)){recipient.doorEpoch=receiverEpoch;this.emit({kind:'door',recipientId:recipient.id,lifeGeneration:recipient.lifeGeneration,time:receiverEpoch,name,ownerId:world.id,ownerName:world.name});}
   }
  }
 }

 private cleanup():void {
  for(const id of this.launches.keys())if(![...this.worlds.values()].some(world=>world.projectiles.has(id)||world.blasts.has(id))){this.launches.delete(id);this.receipts.delete(id);}
 }
}
