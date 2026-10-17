import {OriginalEffectPlanePool} from './originalEffectPlanePool';
import {captureOriginalSoloBotShot,isOriginalSoloBotShotCapture,type OriginalSoloBotShotCapture} from './originalSoloBotShotCapture';
import {raycastOriginalProjectileMesh} from '../shared/originalProjectileRay';
import {raycastOriginalSky} from '../shared/originalSkyRay';
import {originalCodename,ORIGINAL_CODENAME_REJECTION} from '../shared/originalCodename';
import {cloneOriginalAngularBody,originalAngularConvex,type OriginalAngularBody} from '../shared/originalAngularBody';
import * as THREE from 'three';
import type {MovementSample,OriginalPlayerMovementMode,OriginalRemoteViewState} from '../shared/protocol';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildArena, updateArena, type ArenaData } from './arena';
import { raycastArena } from '../shared/arenaCollision';
import { getLegacyMap, getLegacyReferenceCameras, type LegacyMapId } from '../shared/legacyMaps';
import {originalDrawDistance} from './originalDrawDistance';
import { raycastLegacyMap, playerIntersectsLegacyRampSolid } from '../shared/legacyCollision';
import type { LegacyArena } from './legacyArena';
import { createOriginalArena, type OriginalArena } from './originalArena';
import { OriginalDoorClient } from './originalDoorClient';
import type { OriginalMapAssets } from './originalMapAssets';
import type { OriginalMapRuntime } from '../shared/originalMapRuntime';
import {sourcePointToWorld} from '../shared/originalSceneGeometry';
import { ORIGINAL_SOURCE_SPAWNS, ORIGINAL_MAP_SCALE, ORIGINAL_PLAYER_RADIUS } from '../shared/originalMapProfile';
import {originalSpawnIndex} from '../shared/originalSpawnRules';
import {originalRpgBasisFromSourceRotation} from '../shared/originalRpgShape';
import {originalGrenadeBasisFromDirection} from '../shared/originalGrenadeOrientation';
import type {OriginalConvexPolytope} from '../shared/originalConvexSweep';
import {sweepOriginalConvexSphere} from '../shared/originalConvexContact';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE,ORIGINAL_PROJECTILE_RADIUS,createOriginalProjectile,stepOriginalProjectile,stepOriginalProjectileActor,createOriginalBlast,stepOriginalBlast,type OriginalProjectileState,type OriginalBlastState,type OriginalProjectileContact} from '../shared/originalExplosives';
import type {Vec3} from '../shared/protocol';
import {createOriginalPlayerBody,originalPlayerEye,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_DERIVATIVE_FACTOR,type OriginalPlayerControls,type OriginalPlayerBody,type OriginalPhysicsContactDiagnostic} from '../shared/originalPlayerPhysics';
import {createOriginalPlayerHealth,stepOriginalPlayerHealth,applyOriginalPlayerDamage,applyOriginalPlayerHealthDelta,type OriginalPlayerHealthState} from '../shared/originalPlayerHealth';
import {applyOriginalPlayerMovementControls} from '../shared/copyPlayerControls';
import {getOriginalHitscan,originalHitscanYawRecoil,originalBulletExcludesModel} from '../shared/originalHitscan';
import {OriginalWeaponCounter,type OriginalWeaponCounterState} from '../shared/originalWeaponCounter';
import {ORIGINAL_DROP_AMMO,ORIGINAL_KILL_SCORE,ORIGINAL_PICKUP_SCORE,originalDropPosition,originalDropYaw,originalPickupInReach} from '../shared/originalPickupRules';
import { createOriginalWeapons, type OriginalWeaponAssets, type OriginalWeaponCollection } from './originalWeapons';
import {OriginalProjectileModelPool} from './originalProjectileModelPool';
import {OriginalExplosionPresentation,ORIGINAL_EXPLOSION_LAYER,type OriginalExplosionResources} from './originalExplosionPresentation';
import {OriginalCombatEffectPresentation,type OriginalCombatEffectResources} from './originalCombatEffectPresentation';
import { OriginalWeaponPresentation, ORIGINAL_WEAPON_POSES, ORIGINAL_WEAPON_UNIT_SCALE, originalWeaponVerticalFov } from './originalWeaponPresentation';
import {OriginalReceiverLocalWeaponPresentation} from './originalReceiverLocalWeaponPresentation';
import {OriginalReceiverProjectilePresentation,type OriginalReceiverProjectilePresentationOptions} from './originalReceiverProjectilePresentation';
import {createOriginalScope,openOriginalScope,stepOriginalScope,closeOriginalScope,type OriginalScopeState} from './originalScope';
import { updateLegacyHealthHud } from './legacyHealthHud';
import {updateOriginalBarrackHealth} from './originalBarrackHealth';
import {isOriginalCowardiceName} from '../shared/originalCowardice';
import {originalAsciiNamesEqual} from '../shared/originalNameComparison';
import {originalPickupFeedback,originalFeedbackText,originalFeedbackLines,originalTalkFeedbackText,ORIGINAL_TALK_PREFIX,ORIGINAL_TALK_MAX_CHARACTERS,ORIGINAL_TALK_BACKSPACE_MIN_CHARACTERS} from '../shared/originalFeedbackText';
import {installOriginalNormalUi,type OriginalNormalUi} from './originalNormalUi';
import {installOriginalResultUi,type OriginalResultUi} from './originalResultUi';
import {originalAmmoHudPrefix} from '../shared/originalAmmoHudText';
import { rg6JumpBlastEligible, rg6JumpLaunchEligible, rg6JumpVelocity, type RG6JumpIntent } from '../shared/rg6Jump';
import { aimingHeld, movementAxes, legacyArrowTurn, sprintHeld, type ControlPreset } from './legacyControls';
import { weaponReloadDuration } from '../shared/legacyReload';
import type { GeneratedGameAssets } from './generatedAssets';
import { AdaptiveSunShadow, type AdaptiveSunShadowDebugState } from './adaptiveSunShadow';
import { AudioSystem } from './audio';
import {originalFireSound,originalReloadSound,type OriginalSoundName} from './originalCombatAudio';
import { CombatEffects, type CombatEffectsStats, type ImpactSurface } from './combatEffects';
import { CombatImpactMarks, type CombatImpactMarksStats } from './combatImpactMarks';
import { ContactShadows } from './contactShadows';
import { damageIndicatorAngle } from './damageDirection';
import {createOriginalHurtOverlay,activateOriginalHurtOverlay,stepOriginalHurtOverlay,originalWoodlandHurtRotation} from './originalHurtOverlay';
import originalHurtAssets from './assets/original-effects/hurt-overlay-provenance.json';
import { canCollectDrop,chooseSafestSpawn,dropExpired,rankStandings,recordElimination,standingPlace } from './deathmatch';
import { DynamicSnowTracks, type DynamicSnowTrackStats } from './dynamicSnowTracks';
import { recommendedMaterialAnisotropy } from './materials';
import { isBrowserShortcut } from './keyboardCapture';
import { NetworkClient, type ConnectionState, type LoadoutMessage, type NetworkGameEvent, type NetworkPlayer, type NetworkSnapshot, type ProjectileSnapshot } from './network';
import { RemotePlayer,type RemoteConsumedShot } from './remotePlayer';
import { SoldierModel, type SoldierDetailLevel } from './soldierModel';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets,type OriginalSoldierResources,type DetachedSourceFlashes} from './originalSoldier';
import {OriginalSoloModelPresentation} from './originalSoloModelPresentation';
import {createOriginalSoloGameStartupResources,type OriginalSoloGameStartupResources} from './originalSoloGameStartupResources';
import {createOriginalSoloGameSceneFactory} from './originalSoloGameSceneFactory';
import type {OriginalSoloLoadedSceneFactory,OriginalSoloLoadedBanksChoice} from './originalSoloLoadedSceneFactory';
import type {ReceiverLocalWeaponHandle} from '../shared/originalReceiverLocalWeaponInventory';
import {ORIGINAL_WEAPON_LOAD_POSITION} from '../shared/originalWeaponMotion';
import {captureOriginalSoloHumanHitscan} from './originalSoloHumanHitscanCapture';
import type {OriginalSoloGunHitscanCapture} from '../shared/originalSoloGunCallbackProgram';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {OriginalReceiverModelPresentation,type OriginalReceiverPickupBinding,type OriginalReceiverPickupModelBinding} from './originalReceiverModelPresentation';
import {OriginalSoloPickupOwner} from './originalSoloPickupOwner';
import {openOriginalPickupBatchStore,type IndexedDBOriginalPickupBatchStore} from './originalPickupBatchStore';
import {OriginalReceiverTransientPresentation} from './originalReceiverTransientPresentation';
import {createOriginalSoloTransientRendererBinding,type OriginalSoloTransientBinding} from './originalSoloTransientResources';
import {ORIGINAL_COMBAT_PLANE_SIZE} from '../shared/originalCombatEffects';
import { SoldierMaterialLibrary } from './soldierMaterials';
import { getWeaponVisualProfile, LEGACY_RIFLE_REFILL_DURATION, sampleEquipPose, sampleReloadPose, smoothVisualProgress, WEAPON_VISUAL_PROFILES } from './viewModelAnimation';
import {
  createViewModelWeapons,
  type ViewModelWeaponCollection,
  type ViewModelWeaponMetadata,
} from './viewModelWeapons';
import { WEAPONS, WeaponState, type WeaponId } from './weapons';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloCurrentCohort,type OriginalSoloRegistration,type OriginalSoloObserver,type OriginalSoloReceiverCurrentContext,type OriginalSoloReceiverSceneContext} from '../shared/originalSoloObserverWorld';
import {captureOriginalSoloHumanCallbackInput,type OriginalSoloHumanCallbackInput} from './originalSoloHumanCallbackInput';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import type {ReceiverGunOutput} from '../shared/originalReceiverGunOutput';
import {applyOriginalSoloBotIntent,sourceRotationForSoloDirection} from './originalSoloWorlds';
import {OriginalLauncherPrediction} from './originalLauncherPrediction';
import { createWinterAtmosphere, type WinterAtmosphere } from './winterAtmosphere';

type GamePhase = 'menu' | 'playing' | 'paused' | 'won' | 'lost';
type GameMode = 'solo' | 'online';
interface SoloGameplayFrame {
  readonly worlds:OriginalSoloObserverWorlds;readonly generation:number;readonly time:number;
  readonly activeProjectiles:readonly OriginalProjectileState[];
  actorObservation?:{record:SourceCallbackCaptureRecord;dispatch:unknown;generation:number};
  goodyPrepared?:boolean;deliveryWork?:Promise<void>;deliveryError?:unknown;deliveryFailed?:boolean;
  stage:'delivery'|'mirror'|'presentation'|'actors'|'actor-tail'|'authored'|'scope';
}
type GameplayArena = Pick<ArenaData,'colliders'|'spawnPoints'|'pickups'> & Partial<Pick<LegacyArena,'groundHeightAt'|'supportHeightAt'>> & {map?:LegacyMapId;runtime?:OriginalMapRuntime} & Partial<Pick<OriginalArena,'doorWorld'|'updateDoors'|'resetDoors'|'barrelWorld'|'syncBarrels'|'resetBarrels'|'barrelModelPivots'>>;
type EnvironmentPresentationPreset = 'facade' | 'warehouse' | 'junction' | 'skyline' | 'road-overlook' | 'road-shoulder' | 'tower' | 'perimeter' | 'yard' | 'security' | 'props' | 'motorpool' | 'sandbags';

interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  radius: number;
  damage: number;
  grenade: boolean;
  impact: boolean;
  owner: 'player';
  rg6JumpEligible?: boolean;
  source?:OriginalProjectileState;
  soloId?:string;
}

interface NetworkProjectileVisual {
  mesh: THREE.Mesh;
  authoritativePosition: THREE.Vector3;
  authoritativeVelocity: THREE.Vector3;
  velocity: THREE.Vector3;
  weapon: 'launcher' | 'rpg';
  lastServerTime: number;
  predictedSeconds: number;
  predictionLimitSeconds: number;
  removeAfter: number;
  source?:OriginalProjectileState;
  launcherPrediction?:OriginalLauncherPrediction;
  /** Lowest remaining callback already presented; survives authority adoption. */
  puffRemainingCallbacks?:number;
  puffTerminal?:boolean;
}

interface WeaponDrop {
  group: THREE.Group;
  weapon: WeaponId;
  expiresAt: number|null;
  baseY: number;
  /** Source pickup position remains in group even if its named gun is held again. */
  sourceModel?:THREE.Mesh;
  sourceRig?:OriginalSoldier;
}

interface EjectedCasing {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  life: number;
  bounced: boolean;
}

interface MutableContactShadowTarget {
  position: THREE.Vector3;
  radius: number;
  opacity: number;
  visible: boolean;
}

interface BlastLightSlot {
  readonly light: THREE.PointLight;
  active: boolean;
  age: number;
  lifetime: number;
  peakIntensity: number;
}

interface WeaponAnimationDebugState {
  position:number[];rotation:number[];magazinePosition:number[];ammo:number;reserve:number;refillStartedAt:number;
}

interface SoldierPresentationDebugState {
  presentation: 'legacy' | 'modern';
  detailLevel: SoldierDetailLevel;
  weapon: WeaponId;
  visibleMeshes: number;
  triangles: number;
  original?:ReturnType<OriginalSoldier['debugState']>;
}

interface SoldierReviewPose {
  yaw?: number;
  aimPitch?: number;
  crouch?: number;
  firing?: boolean;
  sourceWalkSeconds?:number;
  sourceDeathSeconds?:number;
}

interface KeyboardLock {
  lock(keys?: string[]): Promise<void>;
  unlock(): void;
}

interface KeyboardLockFullscreenOptions extends FullscreenOptions {
  keyboardLock: 'browser';
}

interface MultiplayerDebugState {
  map: LegacyMapId | 'winter';
  controls: ControlPreset;
  aiming: boolean;
  chatOpen: boolean;
  movement: {phase:GamePhase;grounded:boolean;keys:string[];velocity:{x:number;y:number;z:number};pointerCaptured:boolean};
  pickups: Array<{id:string;active:boolean}>;
  connection: ConnectionState | 'offline';
  clientId: string | null;
  room: string | null;
  tick: number | null;
  playerCount: number;
  local: { x:number;y:number;z:number;yaw:number;pitch:number;alive:boolean;health:number };
  sourceHealth:OriginalPlayerHealthState|null;
  sourceHurt:{blend:number;sourceAngle:number}|null;
  sourceScope:OriginalScopeState|null;
  doors:ReturnType<OriginalArena['doorWorld']['getStates']>;
  originalBarrels:{snapshotBodies:ReturnType<OriginalArena['barrelWorld']['snapshots']>;snapshotTime:number|null;bodies:ReturnType<OriginalArena['barrelWorld']['snapshots']>;models:Array<{id:string;pivot:Vec3}>;authorityTime:number|null;receivedAuthorityTime?:number|null;pendingCorrectionTime?:number|null;appliedPlayerTime?:number|null};
  originalWeapon:{weapon:WeaponId;displayedWeapon:WeaponId|null;models:{weapon:WeaponId;visible:boolean}[];position:number[];sourcePosition:number[];ticker:number;rotation:number[];worldFov:number;viewFov:number;meshes:string[];loadedRocket:boolean;flashes:number}|null;
  originalScene: {triangles:number;scale:number;radius:number;bodyHeight:number;colliding:boolean;bounds:{min:{x:number;y:number;z:number};max:{x:number;y:number;z:number}}}|null;
  authoritativeLocal: {position:{x:number;y:number;z:number};yaw:number;pitch:number;grounded:boolean}|null;
  networkProjectiles: number;
  originalExplosives:{projectiles:Array<{weapon:string;position:Vec3;velocity:Vec3;direction:Vec3;remainingCallbacks:number;orientation?:{x:number;y:number;z:number;w:number};angularVelocity?:Vec3}>;blasts:Array<{position:Vec3;remainingCallbacks:number}>;contactCount:number};
  authoredHandGrenades:{remaining:number;projectiles:Array<{position:Vec3;velocity:Vec3;life:number}>};
  originalCombatVisuals:Array<{id:string;kind:string;texture:string;position:Vec3;opacity:number;scale:number;remainingCallbacks?:number;myscale?:number;offset:number[];size:number[]}>;
  originalExplosionVisuals:Array<{id:string;kind:string;frame:number;remainingCallbacks:number;opacity:number;scale:number;position:Vec3;offset:number[];size:number[]}>;
  networkEffects: { predictions:number;adoptions:number;projectileSpawns:number;explosions:number;damageEvents:number;eliminations:number };
  loadout: { equipped:WeaponId;unarmed:boolean;sourceCounter?:WeaponState['originalCounterState'];ammo:Record<WeaponId,number>;reserve:Record<WeaponId,number>;reloading:boolean;reloadRemaining:number;autoReloadWeapon:WeaponId|null;authoritativeUpdates:number;lastServerTime:number|null };
  combatTransients: { damageOpacity:number;recoil:number;bob:number;stepDistance:number;viewActionPulse:number;muzzleFlashRemaining:number };
  sourceRemoteView:{enabled:boolean;generation:number|null;epoch:number|null;callbacks:number};
  sourceGunTiming:{localTime:number;nextCallback:number|null;estimatedServerTime:number|null;authorityLocalTime:number|null;authority:Game['sourceGunAuthorityCounter']|null;pendingShot:string|null;awaitingInputSequence:number|null};
  remotes: Array<ReturnType<RemotePlayer['debugState']> & { id:string;name:string;inScene:boolean }>;
  sourceTimeoutCorpses:Array<ReturnType<RemotePlayer['debugState']> & {id:string;name:string;inScene:boolean}>;
  render: { calls:number;triangles:number;points:number;geometries:number;textures:number };
  worldProjection:{near:number;far:number};
  renderPipeline: { enhanced:boolean;passes:string[];antialiasing:'context-msaa'|'smaa';toneMapping:THREE.ToneMapping;exposure:number;outputColorSpace:string };
  sunShadow: AdaptiveSunShadowDebugState;
  militaryTransport?: ArenaData['militaryTransport']['stats'];
  sandbagBarrier?: ArenaData['sandbagBarrier']['stats'];
  roadSurface?: ArenaData['roadSurface']['stats'];
  impactMarks: CombatImpactMarksStats;
  combatEffects: CombatEffectsStats;
  blastLights: { active:number;capacity:number };
  snowTracks: DynamicSnowTrackStats;
  snowField?: ArenaData['snowField']['stats'];
  winterGroundRelief: NonNullable<ArenaData['winterGroundRelief']>['stats'] | null;
  authoritativeColliders: number;
  foliage?: ArenaData['foliage']['stats'];
  buildingFacade: {
    quality?: ArenaData['buildingFacade']['quality'];
    blueprint?: ArenaData['buildingFacade']['blueprint']['stats'];
    authoritativeColliders?: number;
    presentation: NonNullable<ArenaData['buildingFacade']['presentation']>['stats'] | null;
  };
  perimeterWall: {
    quality?: ArenaData['perimeterWall']['quality'];
    blueprint?: ArenaData['perimeterWall']['blueprint']['stats'];
    authoritativeColliders?: number;
    presentation: NonNullable<ArenaData['perimeterWall']['presentation']>['stats'] | null;
  };
  exteriorBackdrop?: ArenaData['exteriorBackdrop']['stats'];
}

interface SourceViewTimingRecord {
  stage:'advanceSourceRemoteView'|'applyNetworkSnapshot'|'reconcileOriginalPlayer'|'reconcileNetworkProjectile'|'renderNetworkProjectilePrediction';
  startedAt:number;endedAt:number;durationMs:number;
  callbacksBefore:number;callbacksAfter:number;
  snapshotTick?:number;snapshotPhysicsEpoch?:number;pendingReplayCount?:number;
  projectileWeapon?:'launcher'|'rpg';predictionCallbacks?:number;remainingProjectileCallbacks?:number;
}
interface SourceViewTimingCapture {capacity:number;dropped:number;records:SourceViewTimingRecord[]}
interface SourceCallbackCaptureRecord {
  index:number;localTime:number;startedAt:number;endedAt:number|null;
  incomingBeforeQueue:unknown;beforePhysics:unknown;afterPhysics:unknown;afterControls:unknown;afterActors:unknown;
  contacts:OriginalPhysicsContactDiagnostic[];droppedContacts:number;
  actorStage:'pending'|'captured'|'cancelled-gameover'|'unavailable-online-authority';
}
interface SourceCallbackCapture {
  capacity:number;contactCapacity:number;droppedCallbacks:number;droppedContacts:number;
  records:SourceCallbackCaptureRecord[];
  unavailable:string[];stageSemantics:Record<string,string>;
}

declare global {
  interface Window {
    __RA_MULTIPLAYER_DEBUG__?: {
      snapshot: () => MultiplayerDebugState;
      /** Explicit E2E-only opt-in; ordinary instances retain their original methods. */
      enableSourceCallbackCapture:()=>boolean;
      readSourceCallbackCapture:()=>SourceCallbackCapture|null;
      enableSourceViewTimings:()=>boolean;
      readSourceViewTimings:()=>SourceViewTimingCapture;

      setReferenceView: (name:string)=>void;
      /** Historical-image fit, including an explicitly assumed recording aspect. E2E only. */
      setRegisteredReferenceView: (view:{station:string;position:number[];target:number[];up:number[];aspect:number;points:number[][];showWeapon?:boolean})=>{position:number[];fov:number;aspect:number;projectedPixels:number[][]}|null;
      /** Deterministic visual-review hook; ignored outside the explicit E2E mode. */
      setView: (x: number, z: number, yaw?: number, pitch?: number) => void;
      setLook:(yaw:number,pitch?:number)=>void;
      /** Read a visible animated mesh point without firing or advancing callbacks. E2E only. */
      sourceRemoteAimPoint:(id:string)=>{x:number;y:number;z:number}|null;
      fireAtSourceRemote:(id:string)=>{visible:boolean;queued:boolean;shotId:string|null;callbacks:number;pose:ReturnType<RemotePlayer['debugState']>|null};
      fireAtSourceCorpse:(id:string)=>{visible:boolean;queued:boolean;shotId:string|null;callbacks:number;pose:ReturnType<RemotePlayer['debugState']>|null;misses:number;blood:number};
      setPresentation: (weapon: WeaponId, aiming?: boolean, reloadProgress?: number, muzzleFlash?: boolean) => void;
      setWeaponAnimationPresentation: (kind:'equip'|'refill',progress:number)=>WeaponAnimationDebugState|null;
      weaponAnimationSnapshot:()=>WeaponAnimationDebugState|null;
      setTransientPresentation:(kind:'death'|'results')=>void;
      setSoldierPresentation: (
        distance: number,
        weapon: WeaponId,
        detail: SoldierDetailLevel,
        pose?: SoldierReviewPose,
      ) => void;
      setSoldierPresentationVisible: (visible: boolean) => void;
      setBackdropPresentationVisible: (visible: boolean) => void;
      setFoliagePresentationVisible: (visible: boolean) => void;
      setBuildingFacadeDetailsVisible: (visible: boolean) => void;
      setPerimeterWallDetailsVisible: (visible: boolean) => void;
      setGroundDressingVisible: (visible: boolean) => void;
      setWinterGroundReliefVisible: (visible: boolean) => void;
      winterGroundReliefPlacements: () => NonNullable<ArenaData['winterGroundRelief']>['placements'] | null;
      setRoadMarkingsVisible: (visible: boolean) => void;
      setRoadRepairsVisible: (visible: boolean) => void;
      setEnvironmentPresentation: (preset: EnvironmentPresentationPreset) => void;
      setRoadPresentationVisible: (visible: boolean) => void;
      setRoadPresentationIsolation: (isolated: boolean) => void;
      soldierSnapshot: () => SoldierPresentationDebugState | null;
      triggerEffect: (kind: 'impact'|'explosion', x: number, y: number, z: number) => void;
      clearImpactMarks: () => void;
      setCombatEffectsFrozen: (frozen: boolean) => void;
      setOriginalExplosionPresentation:(kind:'grenade'|'rocket',frame:number,distance?:number)=>void;
      setOriginalCombatPresentation:(kind:'miss'|'shotgun-miss'|'blood'|'puff',callbacks:number,distance?:number)=>void;
      addOriginalBloodPresentation:(distance?:number)=>void;
      advanceEffects: (seconds: number) => void;
      clearSnowTracks: () => void;
      seedSnowTrail: () => void;
      advanceSnowTracks: (seconds: number) => void;
      /** E2E-only authoritative multiplayer fire path. */
      fireNetworkWeapon: (weapon: 'launcher'|'rpg', yaw?:number, pitch?:number) => void;
      fireNetworkWeaponFromOffset: (weapon:'launcher'|'rpg',offsetX:number,offsetZ:number,yaw?:number,pitch?:number)=>void;
    };
  }
}

let originalSoloResourceSequence=0;
const BOT_COUNT = 7;
const KILL_LIMIT = 12;
const BOT_NAMES=['VOLKOV','SOKOLOV','ORLOV','PETROV','MOROZOV','LEBEDEV','KUZNETSOV'];
const BOT_WEAPONS:WeaponId[]=['rifle','shotgun','sniper','launcher','rifle','rpg','pistol'];
const WEAPON_IDS=Object.freeze(Object.keys(WEAPONS) as WeaponId[]);
const BOT_DAMAGE:Record<WeaponId,number>={pistol:14,shotgun:24,rifle:12,launcher:31,rpg:38,sniper:29};
const BOT_FIRE_DELAY:Record<WeaponId,number>={pistol:.58,shotgun:1.05,rifle:.38,launcher:1.25,rpg:1.6,sniper:1.1};
const PLAYER_HEIGHT = 1.72;
const PLAYER_RADIUS = .38;
const NETWORK_PROJECTILE_GRAVITY = 9.81;
const NETWORK_PROJECTILE_STEP_SECONDS = .05;
const NETWORK_PROJECTILE_SPAWN_CLEARANCE = 1.2;
const NETWORK_PROJECTILE_SPEED:Readonly<Record<'launcher'|'rpg',number>>={launcher:18,rpg:31};
const MAX_PROJECTILE_EXTRAPOLATION_MS = 500;
const NETWORK_PROJECTILE_EXPIRY_GRACE_MS = 1_000;
const PENDING_PROJECTILE_TIMEOUT_MS = 1_500;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// Shared scratch objects for per-frame AI, collision, and ballistic math.
// Each use is straight-line within a single call, so reuse never aliases.
const SCRATCH_TO_OPPONENT = new THREE.Vector3();
const SCRATCH_MOVEMENT = new THREE.Vector3();
const SCRATCH_SIDE = new THREE.Vector3();
const SCRATCH_PREVIOUS = new THREE.Vector3();
const SCRATCH_RIGHT = new THREE.Vector3();
const SCRATCH_ORIGIN = new THREE.Vector3();
const SCRATCH_DIRECTION = new THREE.Vector3();
const SCRATCH_HIT = new THREE.Vector3();
const SCRATCH_RAY = new THREE.Ray();
const SCRATCH_BOX = new THREE.Box3();
const SCRATCH_SEGMENT = new THREE.Line3();
const SCRATCH_CLOSEST = new THREE.Vector3();
const SCRATCH_TARGET_POINT = new THREE.Vector3();
const SCRATCH_UP = new THREE.Vector3(0,1,0);
function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element as T;
}

interface SoloEnemyIntent {direction:Vec3;speed:number}
interface SoloEnemyDecisionContext {
  intent:(intent:SoloEnemyIntent)=>void;
  blocked:(direction:Vec3,speed:number,delta:number)=>boolean;
  visible:(origin:Vec3,direction:Vec3,distance:number)=>boolean;
}

class Enemy {
  readonly group = new THREE.Group();
  /** Canonical local goody pose is independent of the human received GI. */
  readonly sourcePosition = new THREE.Vector3();
  sourceYaw = 0;
  readonly sourceTargets=new Map<string,THREE.Vector3>();
  sourceIntent:SoloEnemyIntent={direction:{x:0,y:0,z:0},speed:0};
  readonly hitMeshes: THREE.Mesh[] = [];
  readonly id: string;
  readonly name: string;
  readonly weapon: WeaponId;
  frags = 0;
  deaths = 0;
  health = 100;
  alive = true;
  deathTime = 0;
  lastShot = Math.random();
  nextDecision = 0;
  target = new THREE.Vector3();
  strafe = Math.random() > .5 ? 1 : -1;
  alert = 0;
  invulnerableUntil = 0;
  combatTarget: { position: THREE.Vector3; enemy: Enemy | null } | null = null;
  targetRevalidateAt = 0;
  private rig: SoldierModel|OriginalSoldier;
  private sourceRigDetached=false;
  private committedSourceRig=false;
  private readonly hitMaterial = new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});

  constructor(position: THREE.Vector3, index: number, materialLibrary: SoldierMaterialLibrary,originalResources?:OriginalSoldierResources,initialPresentationWeapon?:WeaponId) {
    this.id=`bot-${index}`;this.name=BOT_NAMES[index%BOT_NAMES.length];this.weapon=BOT_WEAPONS[index%BOT_WEAPONS.length];
    this.rig=originalResources?new OriginalSoldier(originalResources,{name:this.name,weapon:initialPresentationWeapon??this.weapon}):new SoldierModel({weapon:this.weapon,team:'red',seed:index,showName:false,materialLibrary});this.group.add(this.rig.visual);
    if(this.rig instanceof OriginalSoldier){const mesh=this.rig.mesh;mesh.userData.enemy=this;mesh.userData.zone='body';this.hitMeshes.push(mesh);}
    else{const body=this.hitProxy(new THREE.SphereGeometry(.44,10,7),.98,'body');const head=this.hitProxy(new THREE.SphereGeometry(.22,10,7),1.64,'head');this.group.add(body,head);}

    this.group.position.copy(position); this.group.rotation.y = Math.random() * Math.PI * 2;
    this.sourcePosition.copy(position);this.sourceYaw=this.group.rotation.y;
    this.target.copy(position);this.group.updateWorldMatrix(true,true);
  }

  private hitProxy(geometry:THREE.BufferGeometry,y:number,zone:'body'|'head'):THREE.Mesh {
    // Raycaster intersects invisible meshes, so hiding the proxies keeps
    // hitscan behavior while removing their transparent draw submissions.
    const mesh=new THREE.Mesh(geometry,this.hitMaterial);mesh.position.y=y;mesh.castShadow=false;mesh.receiveShadow=false;mesh.visible=false;
    mesh.userData.enemy = this; mesh.userData.zone = zone;
    this.hitMeshes.push(mesh); return mesh;
  }

  damage(amount: number, now: number): 'ignored'|'damaged'|'killed' {
    if (!this.alive||now<this.invulnerableUntil) return 'ignored';
    this.health -= amount; this.alert = 4;if(!this.committedSourceRig)this.rig.flinch(Math.min(1.3,.45+amount/100),Math.random()>.5?1:-1);
    if (this.health <= 0) {
      this.alive = false; this.deathTime = now;if(!this.committedSourceRig)this.rig.die();
      if(!this.committedSourceRig)for (const mesh of this.hitMeshes) mesh.userData.enemy = undefined;
      return 'killed';
    }
    return 'damaged';
  }

  sourceDamagePresentation(health:number,dead:boolean,amount:number,now:number):void {
    this.health=health;this.alert=4;
    if(amount>0&&!this.sourceRigDetached&&!this.committedSourceRig)this.rig.flinch(Math.min(1.3,.45+amount/100),Math.random()>.5?1:-1);
    if(dead&&this.alive){this.alive=false;this.deathTime=now;this.sourceIntent={direction:{x:0,y:0,z:0},speed:0};}
  }

  sourceReceivedPose(pose:{position:Vec3;yaw:number;motionTime:number;alive:boolean},advance=false):void {
    this.group.position.copy(pose.position);this.group.rotation.set(0,pose.yaw,0);
    // freeze() membership survives a death receipt until its next callback.
    // Keep that registered GI pose; detached corpse state owns death geometry.
    if(this.committedSourceRig){this.group.updateWorldMatrix(true,true);return;}
    if(this.rig instanceof OriginalSoldier){
      if(advance){this.rig.animate(1/30,{alive:true});this.rig.setSourceMotionTime(pose.motionTime);}
      this.rig.refreshSourcePresentation();
    }else this.rig.animate(advance?1/30:0,{alive:true});
    this.group.updateWorldMatrix(true,true);
    for(const mesh of this.hitMeshes)mesh.userData.enemy=this;
  }

  respawn(position: THREE.Vector3, now: number,source=false): void {
    this.health=100;this.alive=true;this.deathTime=0;this.alert=0;
    const yaw=Math.random()*Math.PI*2;
    if(!source){if(!this.committedSourceRig)this.rig.reset();this.group.position.copy(position);this.group.rotation.set(0,yaw,0);}
    this.sourcePosition.copy(position);this.sourceYaw=yaw;this.sourceIntent={direction:{x:0,y:0,z:0},speed:0};
    this.target.copy(position);this.lastShot=now;this.nextDecision=now+1.25;
    this.invulnerableUntil=now+1;this.combatTarget=null;this.targetRevalidateAt=0;
    if(!source)for(const mesh of this.hitMeshes)mesh.userData.enemy=this;
  }

  sourceReceivedShot(weapon:WeaponId):void {
    if(this.sourceRigDetached||this.committedSourceRig)return;
    if(this.rig instanceof OriginalSoldier)this.rig.fireForSourceWeapon(weapon);else this.rig.fire();
  }

  get sourceRig():OriginalSoldier|undefined {return !this.sourceRigDetached&&this.rig instanceof OriginalSoldier?this.rig:undefined;}
  /** Committed renderer ownership is independent of the AI wrapper. */
  bindCommittedSourceRig(rig?:OriginalSoldier):void {
    this.releaseCommittedSourceRig();this.committedSourceRig=true;this.sourceRigDetached=!rig;
    if(rig){this.rig=rig;rig.mesh.userData.enemy=this;rig.mesh.userData.zone='body';this.hitMeshes.push(rig.mesh);}
  }
  releaseCommittedSourceRig():void {
    if(!this.committedSourceRig)return;for(const mesh of this.hitMeshes)if(mesh.userData.enemy===this)mesh.userData.enemy=undefined;
    this.hitMeshes.length=0;this.sourceRigDetached=true;this.committedSourceRig=false;
  }
  releaseSourceRig():OriginalSoldier|undefined {
    if(this.committedSourceRig){const rig=this.sourceRig;this.releaseCommittedSourceRig();return rig;}
    const rig=this.sourceRig;if(!rig)return undefined;
    this.sourceRigDetached=true;this.hitMeshes.length=0;rig.mesh.userData.enemy=undefined;rig.group.removeFromParent();return rig;
  }
  attachSourceRig(rig:OriginalSoldier):void {
    if(this.committedSourceRig)throw Error('Committed Solo renderer owns this GI');
    const retainedRotation=rig.group.getWorldQuaternion(new THREE.Quaternion());
    this.rig=rig;this.sourceRigDetached=false;this.group.quaternion.copy(retainedRotation);rig.group.position.set(0,0,0);rig.group.rotation.set(0,0,0);this.group.add(rig.group);
    rig.setName(this.name);rig.mesh.userData.enemy=this;rig.mesh.userData.zone='body';this.hitMeshes.length=0;this.hitMeshes.push(rig.mesh);
  }
  get sourceFlashCount():number {return this.sourceRig?.sourceFlashCount??0;}
  detachSourceFlashes(parent:THREE.Object3D):DetachedSourceFlashes|undefined {
    return this.sourceRig?.detachSourceFlashes(parent);
  }

  update(
    delta: number,
    now: number,
    opponentPosition: THREE.Vector3,
    arena: GameplayArena,
    onShoot: (origin: THREE.Vector3, damage: number) => void,
    viewerPosition: THREE.Vector3 = opponentPosition,
    sourceContext?:SoloEnemyDecisionContext,
  ): void {
    if(sourceContext&&this.sourceRigDetached&&!this.alive)return;
    const viewerDx=viewerPosition.x-this.group.position.x;
    const viewerDy=viewerPosition.y-this.group.position.y;
    const viewerDz=viewerPosition.z-this.group.position.z;
    if(!this.sourceRigDetached&&!this.committedSourceRig)this.rig.setDistanceToCamera(Math.hypot(viewerDx,viewerDy,viewerDz));
    if (!this.alive) {
      this.group.updateWorldMatrix(true,true);
      if(this.committedSourceRig)return;
      if(sourceContext&&this.rig instanceof OriginalSoldier)this.rig.refreshSourcePresentation();
      else this.rig.animate(sourceContext?0:delta,{alive:sourceContext?undefined:false});
      return;
    }
    const position=sourceContext?this.sourcePosition:this.group.position;
    const toOpponent = SCRATCH_TO_OPPONENT.copy(opponentPosition).sub(position);
    const distance = toOpponent.length();
    const visualTargetY=opponentPosition.y;const aimPitch=-Math.atan2(visualTargetY-(position.y+1.48),Math.max(.01,Math.hypot(toOpponent.x,toOpponent.z)));
    this.alert = Math.max(0, this.alert - delta);
    const seesOpponent = distance < 42 && this.lineOfSight(opponentPosition, arena,sourceContext);
    if (seesOpponent) this.alert = 3.5;

    if (now > this.nextDecision) {
      this.nextDecision = now + .7 + Math.random() * 1.2;
      this.strafe *= Math.random() > .35 ? 1 : -1;
      if (this.alert <= 0) {
        const spawn = arena.spawnPoints[Math.floor(Math.random() * arena.spawnPoints.length)];
        this.target.copy(spawn);
      }
    }

    const movement = SCRATCH_MOVEMENT.set(0, 0, 0);
    if (this.alert > 0) {
      const forward = toOpponent.setY(0).normalize();
      const side = SCRATCH_SIDE.set(-forward.z, 0, forward.x);
      if (distance > 13) movement.add(forward);
      if (distance < 7) movement.sub(forward);
      movement.addScaledVector(side, this.strafe * .55).normalize();
      this.turnToward(opponentPosition, delta * 7,!!sourceContext);
      if (seesOpponent && distance < (this.weapon==='shotgun'?17:35) && now - this.lastShot > BOT_FIRE_DELAY[this.weapon] + Math.random() * .3) {
        this.lastShot = now;
        this.invulnerableUntil = now;
        if(!sourceContext&&!this.committedSourceRig)this.rig.fire();const origin=sourceContext||this.committedSourceRig?new THREE.Vector3(position.x,position.y+PLAYER_HEIGHT,position.z):this.rig.getMuzzleWorldPosition();
        onShoot(origin, BOT_DAMAGE[this.weapon]*(.85+Math.random()*.3));
      }
    } else {
      movement.copy(this.target).sub(position).setY(0);
      if (movement.lengthSq() > 3) { movement.normalize(); this.turnToward(this.target, delta * 3,!!sourceContext); }
      else movement.set(0,0,0);
    }
    let motionSpeed=0;let strafeSpeed=0;
    if(sourceContext){
      const speed=movement.lengthSq()>0?(this.alert>0?2.65:1.25):0;
      const blocked=speed>0&&sourceContext.blocked(movement,speed,delta);
      if(blocked){this.strafe*=-1;this.nextDecision=now;}
      this.sourceIntent={direction:{x:movement.x,y:movement.y,z:movement.z},speed:blocked?0:speed};sourceContext.intent(this.sourceIntent);
    }else if (movement.lengthSq() > 0) {
      const speed = this.alert > 0 ? 2.65 : 1.25;
      const old = SCRATCH_PREVIOUS.copy(this.group.position);
      this.group.position.addScaledVector(movement, speed * delta);
      this.group.position.y=arena.supportHeightAt?.(this.group.position.x,this.group.position.z,old.y+.5)??old.y;
      if (this.collides(arena.colliders)||(arena.runtime?(arena.runtime.geometry.playerIntersects(this.group.position,.3,1.9)||!!arena.barrelWorld?.playerIntersects(this.group.position,.3,1.9)):(arena.map&&playerIntersectsLegacyRampSolid(arena.map,this.group.position,.3,1.9,.05)))) {
        this.group.position.copy(old); this.strafe *= -1; this.nextDecision = now;
      }else if(this.rig instanceof OriginalSoldier){
        // Source bon advances by the full position delta's magnitude. Passing
        // total speed and its lateral component counts strafing twice.
        motionSpeed=delta>0?this.group.position.distanceTo(old)/delta:0;
      }else{motionSpeed=speed;const right=SCRATCH_RIGHT.set(1,0,0).applyAxisAngle(WORLD_UP,this.group.rotation.y);strafeSpeed=movement.dot(right)*speed;}
    }
    this.group.updateWorldMatrix(true,true);
    if(this.committedSourceRig)return;
    if(sourceContext&&this.rig instanceof OriginalSoldier)this.sourceRig?.refreshSourcePresentation();
    else this.rig.animate(sourceContext?0:delta,{moveSpeed:motionSpeed,strafeSpeed,aimPitch,alive:sourceContext?undefined:true});
  }

  dispose():void {
    this.releaseCommittedSourceRig();
    if(!this.sourceRigDetached&&!this.committedSourceRig)this.rig.dispose();if(!(this.rig instanceof OriginalSoldier))for(const mesh of this.hitMeshes){mesh.removeFromParent();mesh.geometry.dispose();}this.hitMaterial.dispose();this.hitMeshes.length=0;
  }

  private collides(colliders: THREE.Box3[]): boolean {
    const p = this.group.position;
    const box = SCRATCH_BOX;
    box.min.set(p.x-.3, p.y+.05, p.z-.3); box.max.set(p.x+.3, p.y+1.9, p.z+.3);
    for (const collider of colliders) if (collider.intersectsBox(box)) return true;
    return false;
  }

  private lineOfSight(target: THREE.Vector3, arena: GameplayArena,sourceContext?:SoloEnemyDecisionContext): boolean {
    const origin = SCRATCH_ORIGIN.copy(sourceContext?this.sourcePosition:this.group.position); origin.y += 1.55;
    const direction = SCRATCH_DIRECTION.copy(target).sub(origin); const distance = direction.length(); direction.normalize();
    if(sourceContext)return sourceContext.visible(origin,direction,distance);
    const ray = SCRATCH_RAY; ray.set(origin, direction);
    if(arena.runtime)return Math.min(arena.runtime.geometry.raycast(origin,direction,distance,{includeGround:true})?.distance??distance,arena.barrelWorld?.raycast(origin,direction,distance)?.distance??distance)>=distance-.12;
    if(arena.map)return (raycastLegacyMap(arena.map,origin,direction,distance,{includeGround:true})?.distance??distance)>=distance-.12;
    for (const box of arena.colliders) if (ray.intersectBox(box, SCRATCH_HIT) && SCRATCH_HIT.distanceTo(origin) < distance) return false;
    return true;
  }

  private turnToward(target: THREE.Vector3, amount: number,source=false): void {
    const position=source?this.sourcePosition:this.group.position,yaw=source?this.sourceYaw:this.group.rotation.y;
    const desired = Math.atan2(target.x - position.x, target.z - position.z);
    let diff = desired - yaw;diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if(source)this.sourceYaw+=diff*Math.min(1,amount);else this.group.rotation.y+=diff*Math.min(1,amount);
  }

  /** E2E-only deterministic visual pose; gameplay hit proxies remain untouched. */
  setReviewPresentation(
    position: THREE.Vector3,
    weapon: WeaponId,
    detail: SoldierDetailLevel,
    pose: SoldierReviewPose = {},
  ): void {
    const yaw=Number.isFinite(pose.yaw)?pose.yaw??.38:.38;
    const aimPitch=THREE.MathUtils.clamp(Number.isFinite(pose.aimPitch)?pose.aimPitch??0:0,-.75,.75);
    const crouch=THREE.MathUtils.clamp(Number.isFinite(pose.crouch)?pose.crouch??0:0,0,1);
    this.group.visible=true;this.group.position.copy(position);this.group.rotation.set(0,yaw,0);this.target.copy(position);
    this.rig.reset();this.rig.setWeapon(weapon);this.rig.setDetailLevel(detail);
    // Settle damped joints to a deterministic review pose. The game is paused
    // while these hooks are used, so the final firing pulse remains frozen for
    // a stable capture instead of advancing with wall-clock timing.
    for(let frame=0;frame<45;frame++)this.rig.animate(1/60,{alive:true,moveSpeed:0,strafeSpeed:0,aimYaw:0,aimPitch,crouch});
    if(this.rig instanceof OriginalSoldier){
      const walk=THREE.MathUtils.clamp(pose.sourceWalkSeconds??0,0,3);
      for(let remaining=walk;remaining>1e-8;remaining-=1/30)this.rig.animate(Math.min(remaining,1/30),{alive:true,moveSpeed:2});
      if(pose.sourceDeathSeconds!==undefined){
        this.rig.die();
        const death=THREE.MathUtils.clamp(pose.sourceDeathSeconds,0,4);
        for(let remaining=death;remaining>1e-8;remaining-=1/30)this.rig.animate(Math.min(remaining,1/30),{alive:false});
      }
    }
    if(pose.firing){this.rig.fire();this.rig.animate(1/120,{alive:true,moveSpeed:0,strafeSpeed:0,aimYaw:0,aimPitch,crouch});}
    this.group.updateMatrixWorld(true);
  }

  presentationDebugState(): SoldierPresentationDebugState {
    let visibleMeshes=0;let triangles=0;
    const effectivelyVisible=(object:THREE.Object3D):boolean=>{let current:THREE.Object3D|null=object;while(current){if(!current.visible)return false;current=current.parent;}return true;};
    this.rig.group.traverse((object)=>{if(!(object instanceof THREE.Mesh)||!effectivelyVisible(object))return;visibleMeshes++;const geometry=object.geometry;triangles+=(geometry.index?.count??geometry.attributes.position.count)/3;});
    return {presentation:this.rig.presentation,detailLevel:this.rig.detailLevel,weapon:this.rig.weapon,visibleMeshes,triangles,...(this.rig instanceof OriginalSoldier?{original:this.rig.debugState()}:{})};
  }
}

export class Game {
  private readonly container: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .05, 260);
  private readonly viewCamera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, .015, 8);
  private readonly viewScene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private composer?: EffectComposer;
  private readonly renderPipelinePasses: string[] = [];
  private readonly clock = new THREE.Clock();
  private arena!: GameplayArena;
  private archivedArena?: ArenaData;
  private legacyArena?: LegacyArena;
  private originalDrawBounds?:THREE.Sphere;
  private mapId: LegacyMapId = new URLSearchParams(location.search).get('map')==='woodlands'?'woodlands':'barrack';
  private readonly archivalWinter = new URLSearchParams(location.search).get('map')==='winter';
  private controlsPreset: ControlPreset = 'legacy';
  private arrowMovement=true;
  private rightMouseAiming=false;
  private chatOpen=false;
  private sourceFeedbackText='';
  private sourceTalkPrefix=ORIGINAL_TALK_PREFIX;
  private sourceEscapePending=false;
  private sourceEscapeCaptureReleased=false;
  private roomDirectoryGeneration=0;
  private readonly pendingCollections=new Map<string,number>();
  private readonly networkDropVisuals=new Map<string,THREE.Group>();
  private readonly audio = new AudioSystem();
  private readonly soldierMaterialLibrary: SoldierMaterialLibrary;
  private readonly originalSoldierResources?:OriginalSoldierResources;
  private readonly weaponState = new WeaponState(this.archivalWinter?'winter':this.mapId);
  private sourceDisplayedWeapon?:WeaponId|null;
  private originalBarrelAuthorityTime=-Infinity;
  private originalBarrelReceivedTime=-Infinity;
  private originalBarrelSnapshotBodies:NonNullable<NetworkSnapshot['barrels']>=[];
  /** Transport adapter: combine local corrections, never receipts or remote actor updates. */
  private pendingOriginalReconciliation?:{player:NetworkPlayer;serverTime:number;map:LegacyMapId;generation:number|null;lifeGeneration:number;barrels?:NetworkSnapshot['barrels'];barrelEpoch?:number};
  private originalReconciliationEpoch=-Infinity;
  private originalReconciliationLifeGeneration=0;
  private readonly enemies: Enemy[] = [];
  private readonly combatEffects: CombatEffects;
  private readonly combatImpactMarks: CombatImpactMarks;
  private readonly snowTracks: DynamicSnowTracks;
  private readonly sunShadow: AdaptiveSunShadow;
  private readonly contactShadows?: ContactShadows;
  private readonly contactShadowTargets: MutableContactShadowTarget[] = Array.from({length:32},()=>({
    position:new THREE.Vector3(),radius:1,opacity:1,visible:false,
  }));
  private readonly atmosphere: Pick<WinterAtmosphere,'update'> & {setMap?:(id:LegacyMapId)=>void};
  private readonly projectiles: Projectile[] = [];
  private readonly originalBlasts:OriginalBlastState[]=[];
  private sourceCallbackCapture?:SourceCallbackCapture;
  private sourceCallbackCaptureCurrent?:SourceCallbackCaptureRecord;
  private sourceCallbackCaptureContactCount=0;
  private originalProjectileAccumulator=0;
  private originalProjectileContactCount=0;
  private originalMouseDelta={x:0,y:0};
  private originalPlayerContacts:Array<{serverTime:number;localTime:number;velocity:Vec3;applied:boolean}>=[];
  private originalPlayerPrediction:Array<{serverTime:number;input:OriginalPlayerControls;movementMode?:OriginalPlayerMovementMode}>=[];
  private originalEffectPlanePool?:OriginalEffectPlanePool;
  private originalExplosionPresentation?:OriginalExplosionPresentation;
  private originalCombatEffectPresentation?:OriginalCombatEffectPresentation;
  private originalExplosionSequence=0;
  private networkExplosionIds=new Set<string>();
  private readonly weaponDrops: WeaponDrop[] = [];
  private readonly keys = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly viewProjection = new THREE.Group();
  private readonly viewModel = new THREE.Group();
  private readonly weaponModels = new Map<WeaponId, THREE.Group>();
  private readonly weaponMetadata = new Map<WeaponId, ViewModelWeaponMetadata>();
  private weaponViewCollection?: ViewModelWeaponCollection;
  private readonly originalDoorClient=new OriginalDoorClient();
  private originalWeapons?:OriginalWeaponCollection;
  private originalProjectileModelPool?:OriginalProjectileModelPool;
  private originalProjectileRocketMaterial?:THREE.Material|THREE.Material[];
  private originalProjectileModelOwners=new Map<THREE.Mesh,OriginalProjectileModelPool>();
  private originalWeaponPresentation?:OriginalWeaponPresentation;
  private soloLocalWeaponPresentation?:{world:OriginalSoloObserver;adapter:OriginalReceiverLocalWeaponPresentation;frozen?:boolean};
  private soloProjectilePresentation?:{world:OriginalSoloObserver;adapter:OriginalReceiverProjectilePresentation;frozen?:boolean};
  private soloCommittedGunOutput?:{world:OriginalSoloObserver;callback:number;lastCommandIndex:number;scopeCreated:boolean;scopeFrame?:Extract<ReceiverGunOutput,{kind:'scope-frame'}>;scopeAdvanced:boolean};
  private soloCommittedHitscan?:{world:OriginalSoloObserver;callback:number;consumed:Set<number>};
  private soloCommittedWeaponReports?:{world:OriginalSoloObserver;events:NonNullable<OriginalSoloObserver['weaponReports']>;consumed:Set<number>};
  private soloCommittedFadeBirths?:{world:OriginalSoloObserver;events:NonNullable<OriginalSoloObserver['fadeBirths']>;consumed:Set<number>};
  private readonly originalFlashes:Array<{mesh:THREE.Mesh;bangtime:number;owner?:OriginalWeaponCollection}>=[];
  private originalScopeState:OriginalScopeState=createOriginalScope();
  private originalScopeFov=50;
  private originalScopeActive=false;
  private originalNormalUi?:OriginalNormalUi;
  private originalResultUi?:OriginalResultUi;
  private readonly viewPartRest = new Map<THREE.Object3D, { position: THREE.Vector3; rotation: THREE.Euler }>();
  private readonly remotePlayers = new Map<string, RemotePlayer>();
  private readonly sourceTimeoutCorpses=new Set<RemotePlayer>();
  private readonly casings: EjectedCasing[] = [];
  private readonly casingGeometry = new THREE.CylinderGeometry(.018, .018, .058, 8);
  private readonly casingMaterial = new THREE.MeshStandardMaterial({ color: 0xb89245, roughness: .34, metalness: .82 });
  private readonly shellMaterial = new THREE.MeshStandardMaterial({ color: 0x8a2721, roughness: .62, metalness: .12 });
  // Shared projectile/drop resources: creating materials mid-round forces a
  // synchronous shader compile on their first frame, a visible hitch.
  private readonly projectileRocketGeometry = new THREE.CylinderGeometry(.06, .06, .42, 8);
  private readonly projectileShellGeometry = new THREE.CylinderGeometry(.06, .06, .18, 8);
  private readonly projectileShellMaterial = new THREE.MeshStandardMaterial({ color: 0x42513d, emissive: 0x31220f, emissiveIntensity: .5 });
  private readonly grenadeGeometry = new THREE.SphereGeometry(.11, 8, 6);
  private readonly grenadeMaterial = new THREE.MeshStandardMaterial({ color: 0x344135, roughness: .65, metalness: .25 });
  private readonly dropMetalMaterials = new Map<WeaponId, THREE.MeshStandardMaterial>();
  private readonly dropHeadMaterial = new THREE.MeshStandardMaterial({ color: 0x4b5a42, roughness: .7 });
  private readonly dropStockMaterial = new THREE.MeshStandardMaterial({ color: 0x382d24, roughness: .78 });
  private readonly dropRingMaterial = new THREE.MeshBasicMaterial({ color: 0xd8a94e, transparent: true, opacity: .72 });
  private readonly dropTubeGeometry = new THREE.CylinderGeometry(.08, .08, .9, 10);
  private readonly dropHeadGeometry = new THREE.ConeGeometry(.15, .32, 10);
  private readonly dropReceiverGeometry = new THREE.BoxGeometry(.18, .14, .72);
  private readonly dropBarrelGeometry = new THREE.CylinderGeometry(.025, .025, .58, 8);
  private readonly dropStockGeometry = new THREE.BoxGeometry(.34, .2, .16);
  private readonly dropRingGeometry = new THREE.TorusGeometry(.62, .025, 6, 32);
  private enhancedRendering = true;
  // 'high' keeps the full GTAO pipeline behind ?quality=high; the default
  // 'balanced' tier trades GTAO, full-rate 2048px shadows, and 1.75x pixel
  // ratio for frame rate on ordinary hardware.
  private renderTier: 'low' | 'balanced' | 'high' = 'balanced';
  private shadowFrameParity = 0;
  private readonly cullablePointLights: { light: THREE.PointLight; position: THREE.Vector3; distanceSq: number }[] = [];
  private readonly cullableSpotLights: { light: THREE.SpotLight; position: THREE.Vector3; distanceSq: number }[] = [];
  private readonly domCache = new Map<string, HTMLElement>();
  private readonly radarDots: HTMLElement[] = [];
  private radarPlayerDot: HTMLElement | null = null;
  private lastStatusText = '';
  private lastCrosshairGap = '';
  private phase: GamePhase = 'menu';
  private mode: GameMode = 'solo';
  private localCallsign = 'COMRADE';
  private sourceRemoteViewEpoch:number|null=null;
  private sourceRemoteViewGeneration:number|null=null;
  private sourceRemoteViewLocalStart=0;
  private sourceRemoteViewCallbacks=0;
  private networkMovementPath:MovementSample[]=[];
  private network?: NetworkClient;
  private latestNetworkSnapshot?: NetworkSnapshot;
  private readonly networkProjectiles = new Map<string, NetworkProjectileVisual>();
  private readonly pendingNetworkProjectileShots = new Map<string,string>();
  private readonly handledNetworkShots = new Set<string>();
  private readonly handledNetworkProjectileSpawns = new Set<string>();
  private readonly handledNetworkExplosions = new Set<string>();
  private readonly handledNetworkRG6Boosts = new Set<string>();
  private networkBoostStartedAt?:number;
  private readonly handledNetworkDamageEvents = new Set<string>();
  private predictedSourceHitHurts = new Set<string>();
  private readonly handledNetworkEliminations = new Set<string>();
  private readonly creditedExplosiveShots = new Set<string>();
  private readonly networkEffectCounts={predictions:0,adoptions:0,projectileSpawns:0,explosions:0,damageEvents:0,eliminations:0};
  private networkFragLimit = KILL_LIMIT;
  private authoritativeLoadoutUpdates = 0;
  private lastLoadoutServerTime?: number;
  private lastSnapshotReceivedAt = 0;
  private needsAuthoritativeSpawn = false;
  private lastFatalNetworkError?: string;
  private onlineWeaponReadyAt = 0;
  private pendingSourceShot?:string;
  private lastSourceAutoReloadTime=-Infinity;
  private sourceGunAuthorityLocalTime=-Infinity;
  private sourceGunAwaitingInputSequence?:number;
  private sourceGunAuthorityCounter?:{epoch:number;weapon:WeaponId;state:OriginalWeaponCounterState&{ready:boolean}};
  private autoReloadWeapon?: WeaponId;
  private autoReloadAt = Infinity;
  private velocity = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private sensitivity = 1;
  private aiming = false;
  private firing = false;
  private grounded = true;
  private health = 100;
  private sourceHealth = createOriginalPlayerHealth();
  private sourceHurt = createOriginalHurtOverlay();
  private sourceHealthPrediction:number[]=[];
  private sourceHealthAuthorityTime=-Infinity;
  private armor = 50;
  private grenades = 3;
  private kills = 0;
  private shots = 0;
  private hits = 0;
  private score = 0;
  private startTime = 0;
  private elapsed = 0;
  private recoil = 0;
  private bob = 0;
  private stepDistance = 0;
  private damageOpacity = 0;
  private hitmarkerHideTimer?: ReturnType<typeof setTimeout>;
  private damageDirectionHideTimer?: ReturnType<typeof setTimeout>;
  private messageTimer = 0;
  private playerAlive = true;
  private playerRespawnAt = 0;
  private invulnerableUntil = 0;
  private deaths = 0;
  private pauseStarted = 0;
  private muzzleLight = new THREE.PointLight(0xffa24f, 0, 2.2, 2);
  private worldMuzzleLight = new THREE.PointLight(0xff8f3c, 0, 5, 2);
  private readonly blastLights: BlastLightSlot[] = [];
  private blastLightCursor = 0;
  private muzzleFlash?: THREE.Sprite;
  private viewDepthReset?: THREE.Mesh;
  private readonly worldWeaponMaterials=new Map<string,THREE.Material|THREE.Material[]>();
  private weaponSwayX = 0;
  private weaponSwayY = 0;
  private aimWeight = 0;
  private sprintWeight = 0;
  private equipStartedAt = -10;
  private legacyRifleRefillStartedAt = -10;
  private muzzleFlashRemaining = 0;
  private viewActionPulse = 0;
  private launcherCylinderAngle = 0;
  private readonly viewRecoilPosition = new THREE.Vector3();
  private readonly viewRecoilRotation = new THREE.Vector3();
  private readonly scratchViewPosition = new THREE.Vector3();
  private tracerSequence = 0;
  private keyboardCaptureAttempt = 0;
  private immersiveCaptureGeneration = 0;
  private immersiveCaptureOwnerGeneration?: number;
  private viewFill?: THREE.PointLight;
  private soldierReviewMode = false;
  private environmentReviewTime: number | null = null;
  private registeredReferenceAspect: number | null = null;
  private combatEffectsFrozen = false;

  constructor(container: HTMLElement, generatedAssets?: GeneratedGameAssets, private readonly originalMaps?: OriginalMapAssets, private readonly originalWeaponAssets?:OriginalWeaponAssets,originalSoldierAssets?:OriginalSoldierAssets,originalExplosionResources?:OriginalExplosionResources,originalCombatEffectResources?:OriginalCombatEffectResources,private readonly originalSoloTransientBinding?:OriginalSoloTransientBinding) {
    this.container = container;
    this.originalNormalUi=installOriginalNormalUi(byId('hud'));
    this.originalResultUi=installOriginalResultUi(byId('result'));
    this.syncOriginalHudProjection();
    this.setupRenderer();
    this.camera.layers.enable(ORIGINAL_EXPLOSION_LAYER);
    if(!this.archivalWinter){
      if(!originalExplosionResources)throw new Error('Original explosion assets are required for Barrack and Woodland.');
      if(!originalCombatEffectResources)throw new Error('Original combat effect assets are required for Barrack and Woodland.');
      this.originalEffectPlanePool=new OriginalEffectPlanePool(originalCombatEffectResources.geometry);
      this.originalExplosionPresentation=new OriginalExplosionPresentation(originalExplosionResources,this.scene,this.originalEffectPlanePool);
      this.originalCombatEffectPresentation=new OriginalCombatEffectPresentation(originalCombatEffectResources,this.scene,this.originalEffectPlanePool);
    }
    this.soldierMaterialLibrary = new SoldierMaterialLibrary({
      presentation: this.archivalWinter ? 'modern' : 'legacy',
      tier: this.enhancedRendering ? 'high' : 'low',
      textureSize: this.enhancedRendering ? 128 : 64,
      anisotropy: recommendedMaterialAnisotropy(this.renderer, this.enhancedRendering ? 8 : 2),
      seed: 'barrack-01-soldiers',
      albedoMaps: generatedAssets?.soldier,
    });
    if(!this.archivalWinter){
      if(!originalSoldierAssets||!originalWeaponAssets)throw new Error('Original soldier assets are required for Barrack and Woodland.');
      if(!Number.isSafeInteger(originalSoloResourceSequence+1))throw Error('Original Solo resource generation requires restart');
      const resourceBindingId=`original-solo-assets-${++originalSoloResourceSequence}`;
      this.originalSoldierResources=createOriginalSoldierResources(originalSoldierAssets,originalWeaponAssets,{resourceBindingId});
      // Both consumers borrow the same loaded pack. No private ownership is
      // activated until the complete factory/input/pickup composition is ready.
      this.originalSoloTransientBinding??=createOriginalSoloTransientRendererBinding({soldierResources:this.originalSoldierResources,explosionResources:originalExplosionResources!,combatResources:originalCombatEffectResources!,planeGeometry:originalCombatEffectResources!.geometry,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,planeGeometryProvenance:'copy combat PlaneGeometry WORLD resource',sourceScale:ORIGINAL_MAP_SCALE,provenance:'loaded original Solo effect packs',sidedness:'double',resourceBindingId:`${resourceBindingId}-fx`,textureBindingId:`${resourceBindingId}-textures`,nearFilter:THREE.LinearFilter,maxVertices:10000,maxFaces:10000,maxResourceEntries:256,maxTextChars:65536});
    }
    this.sunShadow = this.setupWorld();
    this.createBlastLightPool();
    this.atmosphere = this.archivalWinter?createWinterAtmosphere(this.renderer, this.scene, this.viewScene, this.enhancedRendering, {
      snowCount: this.enhancedRendering ? 2600 : 520,
    }):{update(){}};
    this.scene.environmentIntensity=.58;this.viewScene.environmentIntensity=.68;
    this.combatEffects = new CombatEffects(this.scene, {
      capacities: this.enhancedRendering ? undefined : {
        tracers: 18, sparks: 42, chips: 20, dust: 18, smoke: 20, explosionFlashes: 4, shockRings: 4,
      },
    });
    this.combatImpactMarks = new CombatImpactMarks(this.scene, {
      capacities: this.enhancedRendering ? undefined : { bullets: 32, scorches: 4 },
      seed: 0x1a4b7c2d,
      bulletTexture: generatedAssets?.decals.bullet,
      scorchTexture: generatedAssets?.decals.scorch,
    });
    this.composer = this.setupPostProcessing();
    if(this.archivalWinter){this.archivedArena = buildArena(this.scene, {
      textureSize: this.enhancedRendering ? 256 : 128,
      anisotropy: recommendedMaterialAnisotropy(this.renderer, this.enhancedRendering ? 8 : 2),
      enhancedRendering: this.enhancedRendering,
      albedoMaps: generatedAssets?.arena,
      ...(generatedAssets ? { decals: {
        pickupIcons: {
          health: generatedAssets?.decals.health,
          armor: generatedAssets?.decals.armor,
          ammo: generatedAssets?.decals.ammo,
        },
        signPlate: generatedAssets?.decals.signPlate,
        crateStamp: generatedAssets?.decals.crateStamp,
      } } : {}),
    });
    this.arena=this.archivedArena;
    }else{this.installOriginalMap(this.mapId);}
    this.snowTracks = new DynamicSnowTracks(this.archivalWinter?this.scene:new THREE.Scene(), {
      capacities: this.enhancedRendering ? undefined : { footprints: 96, puffs: 40 },
      seed: 0x57494e54,
      bootTexture: generatedAssets?.decals.boot,
      pixelRatio: Math.min(2, Math.max(.5, this.renderer.getPixelRatio())),
      ...(this.archivedArena?.winterGroundRelief ? {
        surfaceHeightAt: (x: number, z: number) => this.archivedArena?.winterGroundRelief?.heightSampler.heightAt(x, z),
      } : {}),
    });
    if(!this.enhancedRendering)this.contactShadows = new ContactShadows(this.scene, this.contactShadowTargets.length, {
      yOffset: .022,
      opacity: .36,
      color: 0x162024,
      fadeStart: 34,
      fadeEnd: 58,
      textureSize: 24,
      name: 'FallbackContactShadows',
    });
    this.createViewModels(generatedAssets,this.originalWeaponAssets);
    if(!this.archivalWinter){void this.audio.prepareOriginalDoorSound();void this.audio.prepareOriginalHurtSound();void this.audio.prepareOriginalCombatSounds();}
    this.weaponState.map=this.archivalWinter?'winter':this.mapId;
    if(this.archivalWinter)this.spawnEnemies();
    this.bindEvents();
    byId<HTMLSelectElement>('map-select').value=this.mapId;document.body.dataset.map=this.archivalWinter?'winter':this.mapId;
    byId('entry-controls-hint').textContent=this.archivalWinter?'M lists current members. Esc pauses or cancels chat.':'M lists current members. Esc gives up. Tab cancels chat.';
    this.loadSettings();
    const initialSpawn=this.arena.spawnPoints[0];
    this.camera.position.set(initialSpawn.x, PLAYER_HEIGHT+initialSpawn.y, initialSpawn.z);
    this.applyOriginalSpawnOrientation(0);
    // The fallback renderer draws the weapon inside the world scene rather than
    // the separately lit view scene. Give that path enough camera-local fill to
    // retain the receiver, grip, and sight silhouettes against the dark asphalt.
    this.viewFill = new THREE.PointLight(0xd8e4dc, this.enhancedRendering ? 2.4 : 4.6, 4, 1.5);
    this.viewFill.position.set(-.5, .8, .5); this.camera.add(this.viewFill);
    this.scene.add(this.camera);
    this.collectCullableLights();
    const roadIsolationVisibility=new Map<THREE.Object3D,boolean>();
    const sourceViewTimingCapacity=4096;
    const sourceViewTimingRecords:SourceViewTimingRecord[]=[];
    let sourceViewTimingDropped=0,sourceViewTimingEnabled=false;
    const measureSourceView=<T>(stage:SourceViewTimingRecord['stage'],metadata:Partial<SourceViewTimingRecord>,run:()=>T):T=>{
      const startedAt=performance.now(),callbacksBefore=this.sourceRemoteViewCallbacks??0;
      try{return run();}finally{
        const endedAt=performance.now();
        if(sourceViewTimingRecords.length===sourceViewTimingCapacity){sourceViewTimingRecords.shift();sourceViewTimingDropped++;}
        sourceViewTimingRecords.push({...metadata,stage,startedAt,endedAt,durationMs:endedAt-startedAt,
          callbacksBefore,callbacksAfter:this.sourceRemoteViewCallbacks??0});
      }
    };
    window.__RA_MULTIPLAYER_DEBUG__ = {
      enableSourceCallbackCapture:()=>this.enableSourceCallbackCapture(),
      readSourceCallbackCapture:()=>this.readSourceCallbackCapture(),
      enableSourceViewTimings:()=>{
        if(!new URLSearchParams(location.search).has('e2e'))return false;
        if(sourceViewTimingEnabled)return true;
        sourceViewTimingEnabled=true;
        const advance=this.advanceSourceRemoteView,apply=this.applyNetworkSnapshot,reconcile=this.reconcileOriginalPlayer,
          reconcileProjectile=this.reconcileNetworkProjectile,predictProjectile=this.renderNetworkProjectilePrediction;
        this.advanceSourceRemoteView=()=>measureSourceView('advanceSourceRemoteView',{},()=>advance.call(this));
        this.applyNetworkSnapshot=(snapshot)=>measureSourceView('applyNetworkSnapshot',{
          snapshotTick:snapshot.tick,snapshotPhysicsEpoch:snapshot.sourcePhysicsTime??snapshot.sourceHealthTime??snapshot.serverTime,
        },()=>apply.call(this,snapshot));
        this.reconcileOriginalPlayer=(player,serverTime)=>measureSourceView('reconcileOriginalPlayer',{
          snapshotTick:this.latestNetworkSnapshot?.tick,snapshotPhysicsEpoch:serverTime,
          pendingReplayCount:!this.arena.runtime||this.needsAuthoritativeSpawn||this.phase!=='playing'?0
            :(this.originalPlayerPrediction??[]).filter(frame=>frame.serverTime>serverTime&&frame.serverTime<=serverTime+1000).slice(-31).length,
        },()=>reconcile.call(this,player,serverTime));
        this.reconcileNetworkProjectile=(projectile,serverTime)=>measureSourceView('reconcileNetworkProjectile',{
          snapshotPhysicsEpoch:serverTime,projectileWeapon:projectile.weapon,
          remainingProjectileCallbacks:projectile.remainingCallbacks,
        },()=>reconcileProjectile.call(this,projectile,serverTime));
        this.renderNetworkProjectilePrediction=(visual)=>measureSourceView('renderNetworkProjectilePrediction',{
          projectileWeapon:visual.weapon,predictionCallbacks:Math.floor(visual.predictedSeconds*30+1e-8),
          remainingProjectileCallbacks:visual.source?.remainingCallbacks,
        },()=>predictProjectile.call(this,visual));
        return true;
      },
      readSourceViewTimings:()=>({capacity:sourceViewTimingCapacity,dropped:sourceViewTimingDropped,
        records:new URLSearchParams(location.search).has('e2e')?sourceViewTimingRecords.map(record=>({...record})):[]}),
      snapshot: () => this.multiplayerDebugState(),
      setReferenceView: (name)=>this.setReferenceView(name),
      setRegisteredReferenceView: (view)=>{
        if(!new URLSearchParams(location.search).has('e2e'))return null;
        const vectors=[view.position,view.target,view.up,...view.points];
        if(vectors.some(p=>p.length!==3||!p.every(Number.isFinite))||!Number.isFinite(view.aspect)||view.aspect<=0)throw new Error('Invalid reference camera');
        if(!getLegacyReferenceCameras(this.mapId).some(v=>v.name===view.station))throw new Error('Unknown reference station');
        this.setReferenceView(view.station);
        this.soldierReviewMode=!view.showWeapon;
        this.camera.position.fromArray(view.position);this.camera.up.fromArray(view.up);
        this.camera.lookAt(new THREE.Vector3().fromArray(view.target));
        this.updateOriginalDrawDistance();
        this.registeredReferenceAspect=view.aspect;
        this.camera.fov=50;this.camera.aspect=view.aspect;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
        this.viewCamera.aspect=view.aspect;this.viewCamera.updateProjectionMatrix();
        this.camera.rotation.reorder('YXZ');this.yaw=this.camera.rotation.y;this.pitch=this.camera.rotation.x;this.checkpointSoloHumanBody();
        return {position:this.camera.position.toArray(),fov:this.camera.fov,aspect:this.camera.aspect,projectedPixels:view.points.map(p=>{
          const pixel=new THREE.Vector3().fromArray(p).project(this.camera);
          return [(pixel.x+1)*innerWidth/2,(1-pixel.y)*innerHeight/2];
        })};
      },
      setView: (x, z, yaw = 0, pitch = 0) => {
        if (!new URLSearchParams(location.search).has('e2e')) return;
        this.cancelOriginalReconciliation();
        this.camera.position.set(x, PLAYER_HEIGHT+(this.arena.groundHeightAt?.(x,z)??0), z);
        this.velocity.set(0, 0, 0);
        this.yaw = yaw;
        this.pitch = pitch;
        this.camera.rotation.set(pitch, yaw, 0, 'YXZ');this.checkpointSoloHumanBody();
      },
      setLook:(yaw,pitch=0)=>{
        if(!new URLSearchParams(location.search).has('e2e'))return;
        this.yaw=yaw;this.pitch=pitch;this.camera.rotation.set(pitch,yaw,0,'YXZ');
      },
      sourceRemoteAimPoint:(id)=>{
        if(!new URLSearchParams(location.search).has('e2e')||this.archivalWinter||this.mode!=='online')return null;
        const remote=this.remotePlayers.get(id);if(!remote?.alive)return null;
        const mesh=remote.hitMeshes[0];if(!(mesh instanceof THREE.SkinnedMesh))return null;
        const {meshes:targets,corpseMeshes}=this.sourceRemoteRayTargets();
        for(const target of targets)target.updateWorldMatrix(true,false);
        const positions=mesh.geometry.getAttribute('position'),faces=mesh.geometry.index!;
        const raycaster=new THREE.Raycaster();raycaster.far=700;
        for(let face=0;face<faces.count;face+=3){
          const center=new THREE.Vector3();
          for(let corner=0;corner<3;corner++){const index=faces.getX(face+corner);center.add(mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(positions,index)).applyMatrix4(mesh.matrixWorld));}
          center.multiplyScalar(1/3);const height=center.y-remote.group.position.y;if(height<.8||height>1.3)continue;
          const direction=center.clone().sub(this.camera.position).normalize();raycaster.set(this.camera.position,direction);
          const hit=raycaster.intersectObjects(targets,false)[0];
          if(!hit||corpseMeshes.has(hit.object as THREE.Mesh)||hit.object.userData.remoteId!==id||this.distanceToWorld(this.camera.position,direction,700)<hit.distance)continue;
          return {x:center.x,y:center.y,z:center.z};
        }
        return null;
      },
      fireAtSourceRemote:(id)=>{
        const result={visible:false,queued:false,shotId:null as string|null,callbacks:this.sourceRemoteViewCallbacks,pose:null as ReturnType<RemotePlayer['debugState']>|null};
        if(!new URLSearchParams(location.search).has('e2e')||this.archivalWinter||this.mode!=='online'||!getOriginalHitscan(this.mapId,this.weaponState.current))return result;
        this.advanceSourceRemoteView();result.callbacks=this.sourceRemoteViewCallbacks;
        const remote=this.remotePlayers.get(id);if(!remote?.alive)return result;
        result.pose=remote.debugState();const mesh=remote.hitMeshes[0];if(!(mesh instanceof THREE.SkinnedMesh))return result;
        const {meshes:targets,corpseMeshes}=this.sourceRemoteRayTargets();
        for(const target of targets)target.updateWorldMatrix(true,false);
        const positions=mesh.geometry.getAttribute('position'),faces=mesh.geometry.index!;
        for(let face=0;face<faces.count;face+=3){
          const center=new THREE.Vector3();
          for(let corner=0;corner<3;corner++){const index=faces.getX(face+corner);center.add(mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(positions,index)).applyMatrix4(mesh.matrixWorld));}
          center.multiplyScalar(1/3);const height=center.y-remote.group.position.y;if(height<.8||height>1.3)continue;
          const direction=center.sub(this.camera.position).normalize();this.raycaster.set(this.camera.position,direction);this.raycaster.far=700;
          const hit=this.raycaster.intersectObjects(targets,false)[0];
          if(!hit||corpseMeshes.has(hit.object as THREE.Mesh)||hit.object.userData.remoteId!==id||this.distanceToWorld(this.camera.position,direction,700)<hit.distance)continue;
          this.yaw=Math.atan2(-direction.x,-direction.z);this.pitch=Math.asin(direction.y);this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
          const shots=this.shots;this.tryFire();result.visible=true;result.queued=this.shots>shots;result.shotId=result.queued?this.pendingSourceShot??null:null;return result;
        }
        return result;
      },
      fireAtSourceCorpse:(id)=>{
        const result={visible:false,queued:false,shotId:null as string|null,callbacks:this.sourceRemoteViewCallbacks,pose:null as ReturnType<RemotePlayer['debugState']>|null,misses:0,blood:0};
        if(!new URLSearchParams(location.search).has('e2e')||this.archivalWinter||this.mode!=='online'||!getOriginalHitscan(this.mapId,this.weaponState.current))return result;
        this.advanceSourceRemoteView();result.callbacks=this.sourceRemoteViewCallbacks;
        const corpse=[...this.sourceTimeoutCorpses].find(actor=>actor.id===id),mesh=corpse?.hitMeshes[0];
        if(!corpse||!(mesh instanceof THREE.SkinnedMesh))return result;
        result.pose=corpse.debugState();const {meshes:targets}=this.sourceRemoteRayTargets();
        for(const target of targets)target.updateWorldMatrix(true,false);
        const positions=mesh.geometry.getAttribute('position'),faces=mesh.geometry.index!;
        for(let face=0;face<faces.count;face+=3){
          const center=new THREE.Vector3();
          for(let corner=0;corner<3;corner++){const index=faces.getX(face+corner);center.add(mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(positions,index)).applyMatrix4(mesh.matrixWorld));}
          center.multiplyScalar(1/3);const direction=center.sub(this.camera.position).normalize();
          this.raycaster.set(this.camera.position,direction);this.raycaster.far=700;
          const hit=this.raycaster.intersectObjects(targets,false)[0];
          if(!hit||hit.object!==mesh||this.distanceToWorld(this.camera.position,direction,700)<=hit.distance)continue;
          this.yaw=Math.atan2(-direction.x,-direction.z);this.pitch=Math.asin(direction.y);this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
          const before=this.originalCombatEffectPresentation?.getStats(),shots=this.shots;
          this.tryFire();result.visible=true;result.queued=this.shots>shots;result.shotId=result.queued?this.pendingSourceShot??null:null;
          const after=this.originalCombatEffectPresentation?.getStats();result.misses=(after?.miss??0)-(before?.miss??0);result.blood=(after?.blood??0)-(before?.blood??0);return result;
        }
        return result;
      },
      setPresentation: (weapon, aiming = false, reloadProgress, muzzleFlash = false) => {
        if (!new URLSearchParams(location.search).has('e2e') || !(weapon in WEAPONS)) return;
        if(this.currentSoloLocalWeaponPresentation())return;
        this.clearOriginalMuzzleFlashes();
        this.weaponState.reloading=false;this.switchWeapon(weapon);this.aiming=aiming;
        if(this.originalWeaponPresentation){
          // A paused still-life review must not inherit the movement bob from
          // the last playing callback, even when sourcePosition is exact.
          if(this.phase==='paused')this.velocity.set(0,0,0);
          this.originalWeaponPresentation.sourcePosition.fromArray(ORIGINAL_WEAPON_POSES[weapon].rest);
          if(reloadProgress!==undefined){this.originalWeaponPresentation.reload();this.originalWeaponPresentation.update(THREE.MathUtils.clamp(reloadProgress,0,1),0);}
          if(this.controlsPreset!=='modern'){
            this.originalScopeState=createOriginalScope();
            if(weapon==='sniper'&&aiming)openOriginalScope(this.originalScopeState,true,false,true);
          }
          this.updateOriginalWeaponPresentation(0);
          if(muzzleFlash&&this.phase==='paused'){this.spawnOriginalMuzzleFlash(weapon);this.originalWeaponPresentation.fire();this.updateOriginalWeaponPresentation(0);}
          return;
        }
        const metadata=this.weaponMetadata.get(weapon);const pose=metadata?.poses[aiming?'ads':'hip'];
        if(metadata&&pose){this.aimWeight=aiming?1:0;this.sprintWeight=0;this.equipStartedAt=-10;this.viewModel.position.copy(pose.position);this.viewModel.rotation.copy(pose.rotation);metadata.model.position.set(0,0,0);metadata.model.rotation.set(0,0,0);this.restoreViewModelParts(metadata);this.camera.fov=pose.fov;this.camera.updateProjectionMatrix();}
        this.el('scope-overlay').classList.toggle('active',weapon==='sniper'&&aiming);
        if(metadata)metadata.model.visible=weapon!=='sniper'||!aiming;
        if(reloadProgress!==undefined){const progress=THREE.MathUtils.clamp(reloadProgress,0,1);this.weaponState.ammo[weapon]=Math.max(0,WEAPONS[weapon].magazine-1);this.weaponState.reloading=true;this.weaponState.reloadEnd=this.elapsed+weaponReloadDuration(this.weaponState.map,weapon,WEAPONS[weapon].reloadTime)*(1-progress);}
        if(muzzleFlash&&this.phase==='paused'){this.muzzleFlashRemaining=.05;this.updateViewModelPresentation(0,0,false,0,0);}
      },
      setWeaponAnimationPresentation:(kind,progress)=>{
        if(!new URLSearchParams(location.search).has('e2e')||this.phase!=='paused')return null;
        if(this.currentSoloLocalWeaponPresentation())return this.weaponAnimationDebugState();
        if(this.originalWeaponPresentation){
          // Match stationary setPresentation reviews: paused movement would
          // otherwise add source bob to the requested equip/reload still.
          this.velocity.set(0,0,0);
          this.weaponState.reloading=false;this.switchWeapon('rifle');this.aiming=false;
          this.originalWeaponPresentation.reload();this.originalWeaponPresentation.update(THREE.MathUtils.clamp(progress,0,1),0);
          this.legacyRifleRefillStartedAt=kind==='refill'?this.elapsed-THREE.MathUtils.clamp(progress,0,1):-10;
          this.updateOriginalWeaponPresentation(0);return this.weaponAnimationDebugState();
        }
        const metadata=this.weaponMetadata.get('rifle');if(!metadata)return null;
        this.weaponState.reloading=false;this.switchWeapon('rifle');this.aiming=false;
        this.equipStartedAt=-10;this.legacyRifleRefillStartedAt=-10;
        const duration=kind==='refill'?LEGACY_RIFLE_REFILL_DURATION:getWeaponVisualProfile('rifle',this.archivalWinter?'modern':'legacy').equipDuration;
        if(kind==='refill')this.legacyRifleRefillStartedAt=this.elapsed-THREE.MathUtils.clamp(progress,0,1)*duration;
        else this.equipStartedAt=this.elapsed-THREE.MathUtils.clamp(progress,0,1)*duration;
        const pose=metadata.poses.hip;this.aimWeight=0;this.sprintWeight=0;this.viewModel.position.copy(pose.position);this.viewModel.rotation.copy(pose.rotation);
        this.updateViewModelPresentation(0,0,false,0,0);
        return this.weaponAnimationDebugState();
      },
      weaponAnimationSnapshot:()=>this.weaponAnimationDebugState(),
      setTransientPresentation:(kind)=>{
        if(!new URLSearchParams(location.search).has('e2e')||this.mode!=='solo'||this.phase!=='paused')return;
        if(kind==='results'){this.endRound(false,'VOLKOV');return;}
        this.phase='playing';this.killPlayer();
        if(this.archivalWinter){this.phase='paused';byId('respawn-time').textContent='1.3';}
      },
      setSoldierPresentation: (distance, weapon, detail, pose) => {
        if(!new URLSearchParams(location.search).has('e2e')||!(weapon in WEAPONS)||!['full','reduced','silhouette'].includes(detail))return;
        const subject=this.enemies[0];if(!subject)return;this.soldierReviewMode=true;this.environmentReviewTime=12.5;
        // Keep archived captures on their snow lane; legacy maps use the
        // clear central lane and sample terrain for both feet and camera.
        const x=this.archivalWinter?-50:0;const z=this.archivalWinter?20:35;
        const subjectZ=z-THREE.MathUtils.clamp(distance,4,70);
        const ground=(sampleZ:number)=>this.archivalWinter?0:(this.arena.groundHeightAt?.(x,sampleZ)??0);
        this.camera.position.set(x,PLAYER_HEIGHT+ground(z),z);this.velocity.set(0,0,0);this.yaw=0;this.pitch=0;this.camera.rotation.set(0,0,0,'YXZ');
        if(!this.archivalWinter){this.camera.lookAt(x,ground(subjectZ)+1,subjectZ);this.pitch=this.camera.rotation.x;}
        this.checkpointSoloHumanBody();
        this.enemies.forEach((enemy,index)=>{enemy.group.visible=index===0;});
        subject.setReviewPresentation(new THREE.Vector3(x,ground(subjectZ),subjectZ),weapon,detail,pose);
      },
      setSoldierPresentationVisible: (visible) => {
        if(!new URLSearchParams(location.search).has('e2e'))return;
        const subject=this.enemies[0];if(subject)subject.group.visible=visible;
      },
      setBackdropPresentationVisible: (visible) => {
        if(new URLSearchParams(location.search).has('e2e')&&this.archivedArena)this.archivedArena.exteriorBackdrop.root.visible=visible;
      },
      setFoliagePresentationVisible: (visible) => {
        if(new URLSearchParams(location.search).has('e2e')&&this.archivedArena)this.archivedArena.foliage.group.visible=visible;
      },
      setBuildingFacadeDetailsVisible: (visible) => {
        if(new URLSearchParams(location.search).has('e2e')&&this.archivedArena)this.archivedArena.buildingFacade.presentation?.setDetailsVisible(visible);
      },
      setPerimeterWallDetailsVisible: (visible) => {
        if(new URLSearchParams(location.search).has('e2e')&&this.archivedArena)this.archivedArena.perimeterWall.presentation?.setDetailsVisible(visible);
      },
      setGroundDressingVisible: (visible) => {
        if(new URLSearchParams(location.search).has('e2e')&&this.archivedArena)this.archivedArena.groundDressing.root.visible=visible;
      },
      setWinterGroundReliefVisible: (visible) => {
        if(new URLSearchParams(location.search).has('e2e')&&this.archivedArena)this.archivedArena.winterGroundRelief?.setVisible(visible);
      },
      winterGroundReliefPlacements: () => new URLSearchParams(location.search).has('e2e')
        ? this.archivedArena?.winterGroundRelief?.placements ?? null
        : null,
      setRoadMarkingsVisible: (visible) => {
        if(new URLSearchParams(location.search).has('e2e')&&this.archivedArena)this.archivedArena.roadSurface.markings.visible=visible;
      },
      setRoadRepairsVisible: (visible) => {
        if(new URLSearchParams(location.search).has('e2e')&&this.archivedArena?.roadSurface.repairs)this.archivedArena.roadSurface.repairs.visible=visible;
      },
      setEnvironmentPresentation: (preset) => {
        if(!new URLSearchParams(location.search).has('e2e'))return;
        const views:Record<EnvironmentPresentationPreset,readonly [number,number,number,number,number?]>={
          facade:[-21,-1,0,.025],
          warehouse:[27,-12,0,-.045],
          junction:[-18,8,-1.15257,-.13],
          skyline:[0,49,0,.035],
          // Elevated and grazing views make the crown, broken shoulders, worn
          // paint and repair overlays reviewable instead of hiding them behind cover.
          'road-overlook':[0,31,0,-.48,7.5],
          'road-shoulder':[-7.35,27,0,-.16,1.7],
          tower:[35,-33,-.66,.18],
          perimeter:[-20,-45,-1.03,.01],
          yard:[-16,32,-.49,-.03],
          security:[38,20,-.5,.02],
          props:[-11,4,-.78,.02],
          // Front three-quarter inspection view exposes the authored cab,
          // glazing, bonnet, lamps, running gear and canvas silhouette.
          motorpool:[1.5,18.5,-2.52,-.04],
          // Close cover inspection isolates the loaded sack profiles while
          // retaining the truck, barracks, lamp, and fence for scale.
          sandbags:[-7,20,-2.03,-.10],
        };
        const view=views[preset];if(!view)return;
        if(this.phase==='playing')this.pause();
        this.environmentReviewTime=12.5;this.soldierReviewMode=true;this.releaseActiveInput();
        this.enemies.forEach((enemy)=>{enemy.group.visible=false;});
        for(const remote of this.remotePlayers.values())remote.group.visible=false;
        for(const pickup of this.arena.pickups)pickup.mesh.visible=false;
        for(const drop of this.weaponDrops)drop.group.visible=false;
        for(const projectile of this.projectiles)projectile.mesh.visible=false;
        for(const casing of this.casings)casing.mesh.visible=false;
        // Environment captures describe the authored arena, not the variable
        // few frames of bot footprints produced before the review freezes.
        this.snowTracks.clear();
        if(this.archivedArena)this.archivedArena.roadSurface.root.visible=true;
        byId('hud').classList.add('hidden');byId('pause').classList.add('hidden');
        this.camera.position.set(view[0],view[4]??PLAYER_HEIGHT,view[1]);this.velocity.set(0,0,0);
        this.yaw=view[2];this.pitch=view[3];this.camera.rotation.set(view[3],view[2],0,'YXZ');this.checkpointSoloHumanBody();
      },
      setRoadPresentationVisible: (visible) => {
        if(new URLSearchParams(location.search).has('e2e')&&this.archivedArena)this.archivedArena.roadSurface.root.visible=visible;
      },
      setRoadPresentationIsolation: (isolated) => {
        if(!new URLSearchParams(location.search).has('e2e')||!this.archivedArena)return;
        if(isolated&&roadIsolationVisibility.size===0){
          for(const child of this.scene.children)if(child!==this.archivedArena.roadSurface.root){roadIsolationVisibility.set(child,child.visible);child.visible=false;}
          if(this.archivedArena)this.archivedArena.roadSurface.root.visible=true;
        }else if(!isolated&&roadIsolationVisibility.size>0){
          for(const [child,visible] of roadIsolationVisibility)child.visible=visible;
          roadIsolationVisibility.clear();this.archivedArena.roadSurface.root.visible=true;
        }
      },
      soldierSnapshot: () => this.enemies[0]?.presentationDebugState()??null,
      triggerEffect: (kind,x,y,z) => {
        if(!new URLSearchParams(location.search).has('e2e'))return;const point=new THREE.Vector3(x,y,z);
        if(kind==='explosion')this.spawnExplosion(point,4.5);else{const incoming=point.clone().sub(this.camera.position).normalize();if(this.archivalWinter)this.combatEffects.emitTracer(this.camera.position,point,{width:.018,lifetime:.18});this.spawnImpact(point,this.surfaceNormalAt(point,incoming),10,1.25,true);}
      },
      clearImpactMarks: () => { if(new URLSearchParams(location.search).has('e2e'))this.combatImpactMarks.clear(); },
      setCombatEffectsFrozen: (frozen) => { if(new URLSearchParams(location.search).has('e2e'))this.combatEffectsFrozen=frozen; },
      advanceEffects: (seconds) => { if(new URLSearchParams(location.search).has('e2e')&&Number.isFinite(seconds)&&seconds>=0&&!this.hasCommittedSoloTransients()){this.advanceCombatEffects(seconds);for(let callback=0;callback<Math.floor(seconds*30+1e-8);callback++){this.originalExplosionPresentation?.step(this.camera.position);this.originalCombatEffectPresentation?.step(this.camera.position);}} },
      setOriginalExplosionPresentation:(kind:'grenade'|'rocket',frame:number,distance=6)=>{
        if(this.hasCommittedSoloTransients()||!new URLSearchParams(location.search).has('e2e')||!this.originalExplosionPresentation||!Number.isInteger(frame)||frame<0||frame>15)return;
        this.originalExplosionPresentation.clear();const point=new THREE.Vector3(0,0,-distance).applyQuaternion(this.camera.quaternion).add(this.camera.position);
        this.originalExplosionPresentation.spawn('review-blast',kind,point,16-frame);this.originalExplosionPresentation.faceAll(this.camera.position);this.combatEffectsFrozen=true;
      },
      setOriginalCombatPresentation:(kind,callbacks,distance=3)=>{
        if(this.hasCommittedSoloTransients()||!new URLSearchParams(location.search).has('e2e')||!this.originalCombatEffectPresentation||!Number.isInteger(callbacks)||callbacks<0||callbacks>81)return;
        const effects=this.originalCombatEffectPresentation;effects.clear();
        const point=new THREE.Vector3(0,0,-distance).applyQuaternion(this.camera.quaternion).add(this.camera.position);
        if(kind==='blood')effects.spawnBlood(point,this.camera.position);
        else if(kind==='puff')effects.spawnPuff(point,this.camera.position,()=>.25);
        else effects.spawnMiss(point,this.camera.position.clone().sub(point).normalize(),kind==='shotgun-miss');
        effects.stepCallbacks(this.camera.position,callbacks);this.combatEffectsFrozen=true;
      },
      addOriginalBloodPresentation:(distance=3.6)=>{
        if(this.hasCommittedSoloTransients()||!new URLSearchParams(location.search).has('e2e')||!this.originalCombatEffectPresentation||!Number.isFinite(distance)||distance<=0)return;
        const point=new THREE.Vector3(0,0,-distance).applyQuaternion(this.camera.quaternion).add(this.camera.position);
        this.originalCombatEffectPresentation.spawnBlood(point,this.camera.position);this.combatEffectsFrozen=true;
      },
      clearSnowTracks: () => { if(new URLSearchParams(location.search).has('e2e'))this.snowTracks.clear(); },
      seedSnowTrail: () => {
        if(!new URLSearchParams(location.search).has('e2e'))return;
        this.snowTracks.clear();
        this.snowTracks.emitTrail({x:-46,y:0,z:15},{x:-46,y:0,z:8.5},12);
      },
      advanceSnowTracks: (seconds) => {
        if(new URLSearchParams(location.search).has('e2e')&&Number.isFinite(seconds)&&seconds>=0)this.snowTracks.update(seconds);
      },
      fireNetworkWeapon: (weapon,yaw=this.yaw,pitch=this.pitch) => {
        if(!new URLSearchParams(location.search).has('e2e')||this.mode!=='online'||this.phase!=='playing')return;
        this.switchWeapon(weapon);this.yaw=yaw;this.pitch=pitch;this.camera.rotation.set(pitch,yaw,0,'YXZ');this.onlineWeaponReadyAt=0;this.publishNetworkTransform();
        // The weapon transform is sent on the next realtime update. Fire only
        // after the server has observed it so this remains the real protocol
        // path rather than a test-only damage shortcut.
        setTimeout(()=>{if(this.mode==='online'&&this.phase==='playing'&&this.weaponState.current===weapon){this.onlineWeaponReadyAt=0;this.tryFire();}},180);
      },
      fireNetworkWeaponFromOffset:(weapon,offsetX,offsetZ,yaw=this.yaw,pitch=this.pitch)=>{
        if(!new URLSearchParams(location.search).has('e2e')||this.mode!=='online'||this.phase!=='playing'||this.weaponState.current!==weapon)return;
        this.flushOriginalReconciliation();
        const position=this.camera.position.clone();this.yaw=yaw;this.pitch=pitch;this.camera.rotation.set(pitch,yaw,0,'YXZ');this.camera.position.x+=offsetX;this.camera.position.z+=offsetZ;this.onlineWeaponReadyAt=0;
        try{this.tryFire();}finally{this.camera.position.copy(position);}
      },
    };
    this.addShaderWarmup();
    this.animate();
    const hideLoading = () => {
      const loading = document.getElementById('loading');
      if (!loading) return;
      loading.style.opacity = '0';
      setTimeout(() => loading.remove(), 500);
    };
    // Compile every scene program (including hidden pools and view weapons)
    // behind the loading screen, so first shots, kills, and pickups do not
    // stall on first-use shader compilation. The race is a safety net for
    // drivers where async compilation misbehaves.
    this.uploadSceneTextures(this.scene);
    if (this.enhancedRendering) this.uploadSceneTextures(this.viewScene);
    const compiled = Promise.all([
      this.renderer.compileAsync(this.scene, this.camera),
      ...(this.enhancedRendering ? [this.renderer.compileAsync(this.viewScene, this.viewCamera)] : []),
    ]).catch(() => undefined);
    const fallback = new Promise((resolve) => setTimeout(resolve, 2500));
    void Promise.race([compiled, fallback]).then(() => setTimeout(hideLoading, 350));
  }

  /**
   * Invisible one-mesh-per-material stand-ins for everything spawned at
   * runtime (casings, projectiles, weapon drops). renderer.compile() gathers
   * materials with a full traverse, so these compile during loading despite
   * being hidden.
   */
  /** Textures otherwise upload lazily on first draw — e.g. every view-weapon map the moment the player deploys. */
  private uploadSceneTextures(root: THREE.Object3D): void {
    const keys = ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'] as const;
    root.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!material) return;
      for (const item of Array.isArray(material) ? material : [material]) {
        for (const key of keys) {
          const texture = (item as unknown as Record<string, unknown>)[key];
          if (texture instanceof THREE.Texture) this.renderer.initTexture(texture);
        }
      }
    });
  }

  private addShaderWarmup(): void {
    const warmup = new THREE.Group();
    warmup.name = 'ShaderWarmup';
    warmup.visible = false;
    warmup.add(
      new THREE.Mesh(this.casingGeometry, this.casingMaterial),
      new THREE.Mesh(this.casingGeometry, this.shellMaterial),
      new THREE.Mesh(this.projectileRocketGeometry, this.projectileShellMaterial),
      new THREE.Mesh(this.grenadeGeometry, this.grenadeMaterial),
      new THREE.Mesh(this.dropTubeGeometry, this.dropMetal('rifle')),
      new THREE.Mesh(this.dropRingGeometry, this.dropRingMaterial),
    );
    this.scene.add(warmup);
  }

  private setupRenderer(): void {
    const gl=this.renderer.getContext();const rendererInfo=gl.getExtension('WEBGL_debug_renderer_info') as {UNMASKED_RENDERER_WEBGL:number}|null;
    const rendererName=rendererInfo?String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)):'';
    const quality=new URLSearchParams(location.search).get('quality');
    const softwareRenderer=navigator.webdriver||/swiftshader|llvmpipe|software/i.test(rendererName);
    this.renderTier=quality==='high'?'high':quality==='balanced'?'balanced':(quality==='low'||softwareRenderer)?'low':'balanced';
    this.enhancedRendering=this.renderTier!=='low';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.renderTier==='high'?1.75:this.renderTier==='balanced'?1.25:.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.info.autoReset=false;
    this.renderer.shadowMap.enabled = this.enhancedRendering;
    // The balanced tier re-renders the sun shadow map every other frame.
    if(this.renderTier==='balanced')this.renderer.shadowMap.autoUpdate=false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // OutputPass tone-maps the completed world framebuffer, even when source
    // materials disable it. Preserve the recovered unlit source colors there.
    this.renderer.toneMapping = this.archivalWinter ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.container.appendChild(this.renderer.domElement);
  }

  private setupWorld(): AdaptiveSunShadow {
    const hemi = new THREE.HemisphereLight(0xd7e1e8, this.archivalWinter?0x67716c:0x76825a, 1.85); this.scene.add(hemi);
    const sunShadow = new AdaptiveSunShadow(this.scene, {
      enabled: this.enhancedRendering,
      color: 0xe9eef1,
      intensity: this.archivalWinter?1.75:1.3,
      ...(this.renderTier === 'balanced' ? { mapSize: 1024, shadowMapType: THREE.PCFShadowMap } : {}),
    });
    this.renderer.shadowMap.type = sunShadow.shadowMapType;
    return sunShadow;
  }

  private setupPostProcessing(): EffectComposer | undefined {
    if(!this.enhancedRendering)return undefined;
    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(Math.min(devicePixelRatio, this.renderTier==='high'?1.5:1.25));
    composer.addPass(new RenderPass(this.scene, this.camera));this.renderPipelinePasses.push('RenderPass');
    // Source shaders use emissive color without these modern framebuffer
    // effects. AO/bloom would alter their pixels regardless of material flags.
    if(this.archivalWinter&&this.renderTier==='high'){
      // GTAO costs a second full-resolution scene render; only the explicit
      // high tier pays for it.
      const gtao=new GTAOPass(this.scene,this.camera,innerWidth,innerHeight);gtao.blendIntensity=.55;
      gtao.updateGtaoMaterial({radius:.32,distanceExponent:1.7,thickness:1.1,distanceFallOff:.8,scale:.9,samples:8,screenSpaceRadius:true});
      gtao.updatePdMaterial({radius:6,rings:2,samples:12,lumaPhi:8,depthPhi:2,normalPhi:3});composer.addPass(gtao);this.renderPipelinePasses.push('GTAOPass');
    }
    if(this.archivalWinter){
      const bloomScale=this.renderTier==='high'?1:.5;
      const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth*bloomScale, innerHeight*bloomScale), .14, .32, .94);
      composer.addPass(bloom);this.renderPipelinePasses.push('UnrealBloomPass');
    }
    // EffectComposer renders into non-multisampled offscreen buffers, so the
    // renderer context's MSAA cannot smooth enhanced-tier world silhouettes.
    // SMAA operates in linear-sRGB and must remain immediately before OutputPass.
    composer.addPass(new SMAAPass());this.renderPipelinePasses.push('SMAAPass');
    composer.addPass(new OutputPass());this.renderPipelinePasses.push('OutputPass');
    return composer;
  }

  private createViewModels(generatedAssets?: GeneratedGameAssets,originalAssets?:OriginalWeaponAssets): void {
    if(!this.archivalWinter){
      if(!originalAssets)throw new Error('Original weapon assets are required for Barrack and Woodland.');
      this.originalWeapons=createOriginalWeapons(originalAssets,{muzzlePool:this.originalSoldierResources?.muzzleModels});this.originalWeaponPresentation=new OriginalWeaponPresentation(this.weaponState.current);
      for(const [id,model] of this.originalWeapons.models){this.weaponModels.set(id,model);this.viewModel.add(model);model.visible=id===this.weaponState.current;
        model.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=false;object.receiveShadow=false;}});}
      this.viewModel.position.set(0,0,0);this.viewModel.rotation.set(0,0,0);this.viewProjection.scale.set(1,1,1);
      this.originalWeaponPresentation.update(0,0,this.weaponModels.get(this.weaponState.current)!.position);
      this.camera.fov=this.viewCamera.fov=originalWeaponVerticalFov(this.camera.aspect);this.viewCamera.near=this.camera.near;this.camera.updateProjectionMatrix();this.viewCamera.updateProjectionMatrix();
    }else{
    this.weaponViewCollection = createViewModelWeapons({
      presentation:this.archivalWinter?'modern':'legacy',
      tier: this.enhancedRendering ? 'high' : 'low',
      textureSize: this.enhancedRendering ? 256 : 128,
      anisotropy: recommendedMaterialAnisotropy(this.renderer, this.enhancedRendering ? 8 : 2),
      seed: 'barrack-01-view-weapons',
      albedoMaps: generatedAssets?.weapon,
    });
    for (const [id, model] of this.weaponViewCollection.models) {
      this.weaponModels.set(id, model);
      this.viewModel.add(model);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
          object.receiveShadow = false;
        }
      });
    }
    for (const [id, metadata] of this.weaponViewCollection.metadata) {
      this.weaponMetadata.set(id, metadata);
      for (const part of Object.values(metadata.parts)) if (part) {
        this.viewPartRest.set(part, { position: part.position.clone(), rotation: part.rotation.clone() });
      }
    }
    const initialPose = this.weaponMetadata.get(this.weaponState.current)!.poses.hip;
    this.viewModel.position.copy(initialPose.position);
    this.viewModel.rotation.copy(initialPose.rotation);
    this.weaponModels.get(this.weaponState.current)!.visible = true;
    }

    if (this.enhancedRendering) {
      this.viewCamera.add(this.viewModel);
      this.viewScene.add(this.viewCamera);
      const fill = new THREE.HemisphereLight(0xe4edee, 0x3c4741, 1.4);
      const key = new THREE.DirectionalLight(0xe9eef1, 2.7); key.position.set(-1.4, 1.8, 1.2);
      const rim = new THREE.PointLight(0x80b5cc, 2, 4, 2); rim.position.set(.8, .25, -.9);
      this.viewScene.add(fill, key, rim, key.target, this.muzzleLight);
    } else {
      // SwiftShader occasionally corrupts the default framebuffer when a second
      // scene is rendered into it. Keep the low-tier path to one scene/pass and
      // reset depth after world transparency, immediately before the weapon.
      // An opaque reset runs before transparent trees regardless of renderOrder,
      // making distant foliage draw through opaque roofs. Use the transparent
      // queue for scheduling, preserving opaque weapon pixels with NoBlending.
      const viewMaterials=new Map<THREE.Material,THREE.Material>();
      this.viewModel.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        object.renderOrder=1000;
        this.worldWeaponMaterials.set(object.uuid,object.material);
        const cameraMaterial=(material:THREE.Material)=>{
          let copy=viewMaterials.get(material);
          if(!copy){copy=material.clone();if(!copy.transparent){copy.transparent=true;copy.blending=THREE.NoBlending;}viewMaterials.set(material,copy);}
          return copy;
        };
        object.material=Array.isArray(object.material)?object.material.map(cameraMaterial):cameraMaterial(object.material);
      });
      this.viewProjection.add(this.viewModel);
      this.camera.add(this.viewProjection);
      const depthReset = new THREE.Mesh(
        new THREE.PlaneGeometry(.001, .001),
        new THREE.MeshBasicMaterial({ transparent:true, colorWrite: false, depthWrite: false, depthTest: false }),
      );
      depthReset.position.z = -.06;
      depthReset.renderOrder = 999;
      depthReset.frustumCulled = false;
      depthReset.onBeforeRender = (renderer) => renderer.clearDepth();
      this.camera.add(depthReset);
      this.viewDepthReset = depthReset;
      this.scene.add(this.muzzleLight);
    }
    this.worldMuzzleLight.position.set(.08, -.08, -.82); this.camera.add(this.worldMuzzleLight);

    if(this.originalWeapons)return;
    let flashMap = generatedAssets?.decals.muzzle;
    if (!flashMap) {
      const flashCanvas=document.createElement('canvas');flashCanvas.width=128;flashCanvas.height=128;const flashContext=flashCanvas.getContext('2d')!;
      const flashGradient=flashContext.createRadialGradient(64,64,2,64,64,62);flashGradient.addColorStop(0,'rgba(255,255,230,1)');flashGradient.addColorStop(.18,'rgba(255,190,74,.95)');flashGradient.addColorStop(.52,'rgba(255,82,18,.42)');flashGradient.addColorStop(1,'rgba(255,50,0,0)');flashContext.fillStyle=flashGradient;flashContext.fillRect(0,0,128,128);
      flashMap=new THREE.CanvasTexture(flashCanvas);
    }
    this.muzzleFlash=new THREE.Sprite(new THREE.SpriteMaterial({map:flashMap,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}));
    this.muzzleFlash.scale.set(.34,.34,.34);this.muzzleFlash.visible=false;(this.enhancedRendering?this.viewScene:this.scene).add(this.muzzleFlash);
  }

  private spawnEnemies(): void {
    if(this.deferSoloTeardown('spawn',()=>this.spawnEnemies()))return;
    this.clearEnemies();
    const spawns = this.arena.spawnPoints.slice(1, BOT_COUNT+1);
    spawns.forEach((point, index) => {
      const enemy = new Enemy(point, index, this.soldierMaterialLibrary,this.originalSoldierResources,this.isSourceSolo()?'rpg':undefined); this.enemies.push(enemy); this.scene.add(enemy.group);
    });
  }

  private clearEnemies(): void {
    const errors:unknown[]=[];let cleanup:Promise<void>|void=undefined;
    try{cleanup=this.disposeSoloWorlds();}catch(error){
      // A terminal listener error may follow successful ownership release.
      // Pending authority/resources still fence Enemy inventory disposal.
      if(this.soloWorlds||this.soloTeardown||this.soloPickupStore||this.soloPickupDatabase
        ||this.soloReceiverModels||this.soloReceiverTransients||this.soloLocalWeaponPresentation
        ||this.soloProjectilePresentation||this.soloStartupResources||this.soloLoadedSceneFactory
        ||this.soloModelPresentation||this.soloDetachedFlashes?.length)throw error;
      errors.push(error);
    }
    if(cleanup){this.deferSoloTeardown('enemies',()=>this.clearEnemies());return;}
    const enemies=this.enemies.splice(0);
    for(const enemy of enemies){try{this.scene.remove(enemy.group);}catch(error){errors.push(error);}try{enemy.dispose();}catch(error){errors.push(error);}}
    if(errors.length)throw new AggregateError(errors,'Solo enemy cleanup failed');
  }

  private bindEvents(): void {
    byId<HTMLSelectElement>('map-select').addEventListener('change',()=>{
      const id=byId<HTMLSelectElement>('map-select').value;
      if(id==='barrack'||id==='woodlands')this.selectMap(id);
    });
    byId('refresh-rooms').addEventListener('click',()=>{void this.refreshRooms();});
    byId<HTMLSelectElement>('controls-preset').addEventListener('change',()=>{
      this.controlsPreset=byId<HTMLSelectElement>('controls-preset').value==='modern'?'modern':'legacy';
      this.releaseActiveInput();
      this.originalScopeState=createOriginalScope();this.originalScopeActive=false;this.originalScopeFov=50;
      document.body.classList.toggle('modern-controls',this.controlsPreset==='modern');this.saveSettings();this.updateHud();
    });
    byId<HTMLInputElement>('arrow-movement').addEventListener('change',()=>{this.arrowMovement=byId<HTMLInputElement>('arrow-movement').checked;this.saveSettings();});
    byId<HTMLFormElement>('chat-form').addEventListener('submit',(event)=>{event.preventDefault();this.sendChat();});
    byId('mode-solo').addEventListener('click', () => this.setMode('solo'));
    byId('mode-online').addEventListener('click', () => this.setMode('online'));
    byId('deploy').addEventListener('click', () => {if(this.mode==='online')this.openRoomSelection();else this.start();});
    byId('join-room').addEventListener('click',()=>this.start());
    byId('back-entry').addEventListener('click',()=>{this.setMenuStage('entry');byId<HTMLInputElement>('callsign').focus();});
    byId('resume').addEventListener('click', () => this.resume());
    byId('restart').addEventListener('click', () => this.returnToMenu());
    byId('restart-pause').addEventListener('click', () => this.returnToMenu());
    byId<HTMLInputElement>('sensitivity').addEventListener('input', (event) => { this.sensitivity = Number((event.target as HTMLInputElement).value); this.saveSettings(); });
    byId<HTMLInputElement>('volume').addEventListener('input', (event) => { this.audio.setVolume(Number((event.target as HTMLInputElement).value)); this.saveSettings(); });
    addEventListener('resize', () => this.resize());
    // Capture keyboard events before page widgets or browser-facing handlers see
    // them. Fullscreen Keyboard Lock below is the primary protection; this is
    // also useful in browsers that do not implement that API.
    addEventListener('keydown', (event) => this.keyDown(event), { capture: true });
    addEventListener('keyup', (event) => {this.keys.delete(event.code);this.aiming=aimingHeld(this.controlsPreset,this.keys,!this.archivalWinter&&this.controlsPreset==='legacy'?false:this.rightMouseAiming,this.weaponState.current);});
    addEventListener('mousemove', (event) => this.mouseMove(event));
    addEventListener('mousedown', (event) => this.mouseDown(event));
    addEventListener('mouseup', (event) => { if (event.button === 0) this.firing = false; if (event.button === 2) {this.rightMouseAiming=false;this.aiming=aimingHeld(this.controlsPreset,this.keys,false,this.weaponState.current);} });
    addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('pointerlockchange', () => this.handlePointerLockChange());
    document.addEventListener('pointerlockerror', () => {
      // Pointer-lock errors are global and may arrive late from an older
      // request. Never let one tear down a newer generation that owns canvas.
      if(document.pointerLockElement!==this.renderer.domElement)this.captureFailed('POINTER CAPTURE BLOCKED');
    });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) return;
      this.releaseKeyboardCapture();
      if (this.phase === 'playing'&&(this.archivalWinter||!this.sourceEscapeCaptureReleased)) this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      this.releaseActiveInput();
      if (this.phase === 'playing') this.pause();
    });
    addEventListener('blur', () => this.releaseActiveInput());
    addEventListener('beforeunload', (event) => {
      if (this.phase === 'playing' || this.phase === 'paused') { event.preventDefault(); event.returnValue = ''; }
    });
    this.renderer.domElement.addEventListener('click', () => { if (this.phase === 'playing'&&!this.chatOpen) this.requestPointerCapture(); });
  }

  private start(): void {
    if(!this.archivalWinter&&!this.validateOriginalCodename())return;
    if (this.mode === 'online') {
      const callsign = byId<HTMLInputElement>('callsign').value.replace(/\s+/g, ' ').trim();
      const room = byId<HTMLInputElement>('room-code').value.trim().toUpperCase();
      if (!callsign || callsign.length > 20) { this.setConnectionNote('ENTER A CALLSIGN · 1–20 CHARACTERS', true); return; }
      if (!/^[A-Z0-9_-]{1,32}$/.test(room)) { this.setConnectionNote('ROOM USES LETTERS, NUMBERS, _ OR -', true); return; }
      byId<HTMLInputElement>('room-code').value = room;
      this.beginRound();
      // Capture must remain in the original click activation stack. The socket
      // handshake deliberately starts only after immersive capture is requested.
      this.enterImmersiveMode();
      void this.connectOnline(room, callsign);
      return;
    }
    this.beginRound();
    this.enterImmersiveMode();
  }

  private beginRound(): void {
    if(this.deferSoloTeardown('round',()=>this.beginRound()))return;
    this.cancelOriginalReconciliation();
    this.localCallsign=this.archivalWinter?byId<HTMLInputElement>('callsign').value.replace(/\s+/g,' ').trim()||'COMRADE':originalCodename(byId<HTMLInputElement>('callsign').value);
    byId('menu').classList.add('hidden'); byId('hud').classList.remove('hidden');
    this.audio.resume(); this.restartState(); this.clock.getDelta(); this.phase = 'playing'; this.startTime = performance.now() / 1000; this.invulnerableUntil=this.startTime+4;
    if(!this.archivalWinter&&this.mode==='solo')this.appendChat('',`Welcome to Russia Army, comrade ${this.localCallsign}!`,'welcome');
  }

  private restartState(): void {
    if(this.deferSoloTeardown('restart',()=>this.restartState()))return;
    if(!this.archivalWinter)this.resetOriginalActorDispatch();
    if(this.registeredReferenceAspect!=null){this.registeredReferenceAspect=null;this.camera.up.set(0,1,0);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.viewCamera.aspect=this.camera.aspect;this.viewCamera.updateProjectionMatrix();}
    this.sourceEscapePending=false;this.sourceEscapeCaptureReleased=false;
    this.attachOriginalDoors();this.originalDoorClient?.reset(this.originalDoorTime());
    this.arena.resetBarrels?.();this.originalBarrelAuthorityTime=-Infinity;this.originalBarrelReceivedTime=-Infinity;this.originalBarrelSnapshotBodies=[];
    this.closeChat(false);
    this.releaseActiveInput();
    if(!this.archivalWinter){this.sourceFeedbackText='';byId('chat-log').replaceChildren();}
    this.pendingCollections.clear();this.clearNetworkDrops();
    this.soldierReviewMode=false;this.environmentReviewTime=null;
    this.messageTimer=0;byId('prompt').classList.remove('active');
    this.combatImpactMarks.clear();
    this.resetCombatPresentation();
    this.snowTracks.clear();
    this.health=100;this.sourceHealth=createOriginalPlayerHealth();this.sourceHealthPrediction=[];this.sourceHealthAuthorityTime=-Infinity; this.armor=0; this.grenades=this.mode==='online'||this.controlsPreset==='legacy'?0:3; this.kills=0; this.shots=0; this.hits=0; this.score=0;this.deaths=0;this.playerAlive=true;this.playerRespawnAt=0;
    const spawnIndex=this.arena.runtime&&this.mode==='solo'?originalSpawnIndex(this.arena.spawnPoints.length,Math.random()):0;
    this.velocity.set(0,0,0);this.keys.clear();this.firing=false;this.aiming=false;this.aimWeight=0;this.sprintWeight=0;this.weaponSwayX=0;this.weaponSwayY=0;this.autoReloadWeapon=undefined;this.autoReloadAt=Infinity; this.yaw=0; this.pitch=0; const spawn=this.arena.spawnPoints[spawnIndex];this.camera.position.set(spawn.x,PLAYER_HEIGHT+spawn.y,spawn.z); this.camera.rotation.set(0,0,0);
    this.applyOriginalSpawnOrientation(spawnIndex);
    this.weaponState.reset();this.nextSourceReloadPoll=-Infinity;this.clearEnemies();this.clearRemotePlayers();this.originalSoldierResources?.muzzleModels.reset();if(this.mode==='solo')this.spawnEnemies();this.clearNetworkProjectiles();this.latestNetworkSnapshot=undefined;this.switchWeapon(this.weaponState.current);
    for (const pickup of this.arena.pickups) { pickup.active=true; pickup.mesh.visible=true; pickup.respawnAt=0; }
    for (const projectile of this.projectiles) this.releaseProjectileMesh(projectile.mesh); this.projectiles.length=0;this.originalBlasts.length=0;this.originalProjectileAccumulator=0;this.originalProjectileContactCount=0;this.originalPlayerPrediction=[];this.originalPlayerContacts=[];
    for(const casing of this.casings)casing.mesh.removeFromParent();this.casings.length=0;
    this.clearWeaponDrops();
    byId('respawn-overlay').classList.remove('active');
    byId('kill-feed').replaceChildren();
    this.updateHud(); this.setMessage(this.mode==='online'?'CONNECTING TO ROOM':'COMBAT READY', 2);
  }

  /** Whole scene reset: return both presenters' leases before inventory reset. */
  private resetOriginalPlaneEffects():void {
    this.originalExplosionPresentation?.clear();this.originalCombatEffectPresentation?.clear();this.originalEffectPlanePool?.reset();
  }

  private resetCombatPresentation():void {
    this.resetOriginalProjectileModels();
    this.resetOriginalPlaneEffects();
    this.invalidateImmersiveCapture();
    this.pendingSourceShot=undefined;this.lastSourceAutoReloadTime=-Infinity;this.sourceGunAuthorityLocalTime=-Infinity;this.sourceGunAuthorityCounter=undefined;this.sourceGunAwaitingInputSequence=undefined;this.resetSourceScope();
    this.sourceHurt=createOriginalHurtOverlay();byId('original-hurt-overlay').style.opacity='0';
    this.damageOpacity=0;this.recoil=0;this.bob=0;this.stepDistance=0;
    this.weaponSwayX=0;this.weaponSwayY=0;this.aimWeight=0;this.sprintWeight=0;
    this.viewRecoilPosition.set(0,0,0);this.viewRecoilRotation.set(0,0,0);this.viewActionPulse=0;this.launcherCylinderAngle=0;
    this.muzzleFlashRemaining=0;this.muzzleLight.intensity=0;this.worldMuzzleLight.intensity=0;if(this.muzzleFlash)this.muzzleFlash.visible=false;
    if(this.originalWeaponPresentation){if(!this.currentSoloLocalWeaponPresentation())this.originalWeaponPresentation.reset(this.weaponState.current);this.originalScopeState=createOriginalScope();this.originalScopeActive=false;this.originalScopeFov=50;}
    this.clearOriginalMuzzleFlashes();
    this.tracerSequence=0;this.lastStatusText='';this.lastCrosshairGap='';this.combatEffectsFrozen=false;this.combatEffects.clear();
    this.blastLightCursor=0;for(const slot of this.blastLights){slot.active=false;slot.age=0;slot.peakIntensity=0;slot.light.intensity=0;}
    if(this.hitmarkerHideTimer!==undefined){clearTimeout(this.hitmarkerHideTimer);this.hitmarkerHideTimer=undefined;}
    if(this.damageDirectionHideTimer!==undefined){clearTimeout(this.damageDirectionHideTimer);this.damageDirectionHideTimer=undefined;}
    const damageFlash=byId('damage-flash');damageFlash.style.opacity='0';
    const direction=byId('damage-direction');direction.style.opacity='0';direction.style.transform='translate(-50%,-50%) rotate(0rad)';
    const marker=byId('hitmarker');marker.classList.remove('kill','headshot');marker.style.opacity='0';marker.style.transform='translate(-50%,-52%) scale(.7)';
    byId('scope-overlay').classList.remove('active');
    if(this.archivalWinter){
      const hip=this.weaponMetadata.get('rifle')?.poses.hip;if(hip){this.viewModel.position.copy(hip.position);this.viewModel.rotation.copy(hip.rotation);this.camera.fov=hip.fov;this.camera.updateProjectionMatrix();}
      this.viewCamera.fov=56;this.viewCamera.updateProjectionMatrix();
    }
    for(const metadata of this.weaponMetadata.values()){this.restoreViewModelParts(metadata);metadata.model.position.set(0,0,0);metadata.model.rotation.set(0,0,0);}
  }

  private setMode(mode:GameMode):void {
    if(this.phase!=='menu')return;
    this.mode=mode;
    byId('mode-solo').classList.toggle('active',mode==='solo');
    byId('mode-online').classList.toggle('active',mode==='online');
    byId('online-fields').classList.toggle('hidden',mode!=='online');
    byId('deploy').textContent=mode==='online'?'NEXT':'PLAY';
    this.setMenuStage('entry');
    this.setConnectionNote(mode==='online'?'CHOOSE A ROOM OR ENTER A NAME':'OFFLINE BOT DEATHMATCH');
  }

  private setMenuStage(stage:'entry'|'rooms'):void {
    byId('menu-entry').classList.toggle('hidden',stage!=='entry');
    byId('menu-rooms').classList.toggle('hidden',stage!=='rooms');
    byId('menu').dataset.stage=stage;
    byId('room-callsign').textContent=byId<HTMLInputElement>('callsign').value.replace(/\s+/g,' ').trim();
  }

  private openRoomSelection():void {
    if(this.phase!=='menu'||this.mode!=='online')return;
    if(!this.archivalWinter&&!this.validateOriginalCodename())return;
    const input=byId<HTMLInputElement>('callsign');const name=input.value.replace(/\s+/g,' ').trim();
    const note=byId('entry-note');note.textContent='';
    if(!name||name.length>20){note.textContent='Enter a player name (1–20 characters).';input.focus();return;}
    input.value=name;this.setMenuStage('rooms');
    this.setConnectionNote('CHOOSE A ROOM OR ENTER A NAME');
    void this.refreshRooms();byId('refresh-rooms').focus();
  }

  private validateOriginalCodename():boolean {
    const input=byId<HTMLInputElement>('callsign');
    input.value=originalCodename(input.value);
    if(input.value)return true;
    byId('entry-note').textContent=ORIGINAL_CODENAME_REJECTION;
    this.setConnectionNote(ORIGINAL_CODENAME_REJECTION,true);input.focus();return false;
  }

  private setConnectionNote(text:string,error=false):void {
    const note=byId('connection-note');note.textContent=text;note.classList.toggle('error',error);
  }

  private async connectOnline(room:string,callsign:string):Promise<void> {
    this.disconnectNetwork();
    this.lastFatalNetworkError=undefined;
    const client:NetworkClient=new NetworkClient({
      sourceRemoteView:!this.archivalWinter,
      onSourceRemoteViewReset:(state)=>{if(this.network===client)this.resetSourceRemoteView(state);},
      beforeSourceRemoteViewReceipt:():number=>this.network===client?this.advanceSourceRemoteView():0,
      getSourceRemoteViewCallbacks:()=>this.sourceRemoteViewCallbacks??0,
      onSnapshot:(snapshot)=>{if(this.network===client)this.applyNetworkSnapshot(snapshot);},
      onEvent:(event)=>{if(this.network===client)this.handleNetworkEvent(event);},
      onLoadout:(loadout)=>{if(this.network===client)this.applyNetworkLoadout(loadout);},
      onStateChange:(state,previous)=>{if(this.network===client)this.handleNetworkState(state,previous);},
      onError:(error)=>{
        if(this.network!==client)return;
        if(error.code==='invalid_source_escape'||error.fatal)this.sourceEscapePending=false;
        if(['invalid_shot','invalid_origin','duplicate_shot','fire_rate','projectile_limit','shot_history_full','reload_in_progress','empty_magazine'].includes(error.code))this.clearPendingNetworkProjectiles();
        if(['invalid_reload','magazine_full','no_reserve'].includes(error.code)){this.weaponState.reloading=false;this.legacyRifleRefillStartedAt=-10;this.autoReloadWeapon=undefined;this.autoReloadAt=Infinity;this.setMessage(error.message.toUpperCase(),1.2);this.updateHud();}
        if(['invalid_transform','movement_rejected','collision_rejected'].includes(error.code)){this.networkMovementPath=[];this.network?.resetTransformPath?.();this.needsAuthoritativeSpawn=true;this.releaseActiveInput();this.velocity.set(0,0,0);this.setMessage('POSITION CORRECTED BY SERVER',1.2);}
        if(error.fatal){this.lastFatalNetworkError=error.message;this.setMessage(error.message.toUpperCase(),3);}
        else if(error.code==='socket_error'||error.code==='connection_closed')this.setMessage('NETWORK INTERRUPTION',1.5);
      },
    });
    this.network=client;this.updateNetworkStatus('connecting');
    try {
      const welcome=await client.join(room,callsign,this.mapId);
      if(this.network!==client||this.mode!=='online')return;
      if(welcome.map&&welcome.map!==this.mapId)this.selectMap(welcome.map);
      this.networkFragLimit=welcome.fragLimit;
      this.applyAuthoritativeSpawn(welcome.player,true);
      this.setMessage(`ROOM ${welcome.room} · ${welcome.player.name}`,1.8);
      this.appendChat('',`Welcome to Russia Army, comrade ${welcome.player.name}!`,'welcome');
      this.updateHud();
    } catch(error) {
      if(this.network!==client)return;
      const message=error instanceof Error?error.message:'Unable to join the room.';
      this.returnToMenu(message);
    }
  }

  private resetSourceRemoteView(state?:OriginalRemoteViewState):void {
    this.cancelOriginalReconciliation();
    this.sourceRemoteViewEpoch=state?.epoch??null;
    this.sourceRemoteViewGeneration=state?.generation??null;
    this.sourceRemoteViewLocalStart=performance.now();
    this.sourceRemoteViewCallbacks=0;
  }

  /** Receipt and render callbacks share a stable welcome-relative 30Hz clock. */
  private advanceSourceRemoteView():number {
    if(this.sourceRemoteViewEpoch==null)return 0;
    const callbacks=Math.max(this.sourceRemoteViewCallbacks,Math.floor(Math.max(0,performance.now()-this.sourceRemoteViewLocalStart)*30/1000+1e-8));
    const steps=callbacks-this.sourceRemoteViewCallbacks;
    // A stopped tab requires a new transport generation instead of unbounded
    // catch-up work. The authority rejects stale callbacks and resynchronizes.
    if(steps>4096)return this.sourceRemoteViewCallbacks;
    // Match the source actor-list order across catch-up: each callback first
    // advances already registered fade actors, then living/pending baddies.
    // Shared audio channels observe each shooting prefix before movement/death.
    const onSourceShot=(shot:RemoteConsumedShot)=>{
      if(getOriginalHitscan(this.mapId,shot.weapon))this.playOriginalCombatSound(originalFireSound(shot.weapon),{...shot.position,y:shot.position.y+PLAYER_HEIGHT});
    };
    for(let callback=0;callback<Math.max(1,steps);callback++){
      const count=steps===0?0:1;
      // Online actors keep receiving source callbacks while input is paused.
      // Age their transient effects too; otherwise incoming rocket puffs retain
      // meshes/materials indefinitely until the local gameplay loop resumes.
      if(count&&this.mode==='online'&&this.phase==='paused'&&!this.combatEffectsFrozen){
        const callbackTime=this.sourceRemoteViewLocalStart/1000+(this.sourceRemoteViewCallbacks+callback+1)/30;
        const eye=this.playerAlive?this.camera.position:null;
        this.originalExplosionPresentation?.step(eye,callbackTime);
        this.originalCombatEffectPresentation?.step(eye,callbackTime);
      }
      for(const corpse of this.sourceTimeoutCorpses){
        corpse.update(count/30,this.camera.position,count);
        if(corpse.debugState().original?.removed){corpse.dispose();this.sourceTimeoutCorpses.delete(corpse);}
      }
      for(const [id,remote] of this.remotePlayers){
        const effect=remote.update(count/30,this.camera.position,count,onSourceShot);
        if(effect){
          this.remotePlayers.delete(id);this.snowTracks.resetActor(`remote:${id}`);this.sourceTimeoutCorpses.add(remote);
          if(effect.reason==='timeout')this.appendChat('',`${effect.name} is disconnected`,'feedback');
          this.playOriginalCombatSound('hurt',{...effect.position,y:effect.position.y+PLAYER_HEIGHT});
          continue;
        }
        if(remote.alive===false&&remote.debugState().original?.removed===true&&!this.latestNetworkSnapshot?.players.some(player=>player.id===id)){
          this.snowTracks.resetActor(`remote:${id}`);this.scene.remove(remote.group);remote.dispose();this.remotePlayers.delete(id);
        }
      }
    }
    this.sourceRemoteViewCallbacks=callbacks;
    return callbacks;
  }

  private disconnectNetwork():void {
    this.cancelOriginalReconciliation();
    this.sourceEscapePending=false;this.sourceEscapeCaptureReleased=false;
    this.resetSourceRemoteView();
    this.pendingSourceShot=undefined;this.lastSourceAutoReloadTime=-Infinity;this.sourceGunAuthorityLocalTime=-Infinity;this.sourceGunAuthorityCounter=undefined;this.sourceGunAwaitingInputSequence=undefined;this.resetSourceScope();
    this.networkMovementPath=[];
    const client=this.network;this.network=undefined;client?.dispose();
    this.latestNetworkSnapshot=undefined;this.authoritativeLoadoutUpdates=0;this.lastLoadoutServerTime=undefined;this.clearRemotePlayers();this.clearNetworkProjectiles();this.clearNetworkDrops();
  }

  private returnToMenu(errorMessage?:string):void {
    if(this.deferSoloTeardown('menu',()=>this.returnToMenu(errorMessage)))return;
    const sourceReplay=!this.archivalWinter&&(this.phase==='lost'||this.phase==='won');
    if(sourceReplay)byId<HTMLInputElement>('callsign').value=originalCodename(this.localCallsign);
    this.closeChat(false);this.phase='menu';this.releaseActiveInput();this.releaseKeyboardCapture();
    this.disconnectNetwork();
    if(document.pointerLockElement)document.exitPointerLock();
    if(document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined);
    byId('pause').classList.add('hidden');byId('result').classList.add('hidden');byId('hud').classList.add('hidden');byId('menu').classList.remove('hidden');
    byId('respawn-overlay').classList.remove('active');byId('scope-overlay').classList.remove('active');
    this.resetCombatPresentation();this.snowTracks.clear();
    this.clearEnemies();this.originalSoldierResources?.muzzleModels.reset();if(this.archivalWinter)this.spawnEnemies();this.updateNetworkStatus('idle');this.setMode(this.mode);
    if(sourceReplay)this.validateOriginalCodename();
    if(errorMessage){if(this.mode==='online')this.setMenuStage('rooms');this.setConnectionNote(errorMessage.toUpperCase(),true);}this.lastFatalNetworkError=undefined;
  }

  private handleNetworkState(state:ConnectionState,previous:ConnectionState):void {
    this.updateNetworkStatus(state);
    if(state==='reconnecting'){
      this.sourceEscapePending=false;
      this.resetSourceRemoteView();
      this.pendingSourceShot=undefined;this.lastSourceAutoReloadTime=-Infinity;this.sourceGunAuthorityLocalTime=-Infinity;this.sourceGunAuthorityCounter=undefined;this.sourceGunAwaitingInputSequence=undefined;this.resetSourceScope();
      this.lastFatalNetworkError=undefined;this.needsAuthoritativeSpawn=true;this.releaseActiveInput();
      this.latestNetworkSnapshot=undefined;this.lastSnapshotReceivedAt=0;this.clearRemotePlayers();this.clearNetworkProjectiles();this.updateNetworkStatus(state);
      this.setMessage('RECONNECTING TO ROOM',2);
    }
    if(state==='connected'&&previous==='reconnecting'){
      this.lastFatalNetworkError=undefined;
      this.needsAuthoritativeSpawn=true;this.latestNetworkSnapshot=undefined;this.lastSnapshotReceivedAt=0;
      this.clearRemotePlayers();this.clearNetworkProjectiles();this.setMessage('REJOINED · SYNCHRONIZING',1.5);
    }
    // Initial join failures are rejected with a specific server message. Let
    // connectOnline's catch render that detail before tearing down the client;
    // later reconnect exhaustion has no pending join promise and uses the
    // generic fallback here.
    if(state==='error'&&previous!=='joining'&&this.phase!=='menu')this.returnToMenu(this.lastFatalNetworkError??'Multiplayer connection failed.');
  }

  private updateNetworkStatus(state:ConnectionState|'offline'|'idle'):void {
    const status=byId('network-status');const playerCount=this.latestNetworkSnapshot?.players.length??0;
    const publicState=state==='idle'||state==='offline'?'offline':state;
    status.dataset.state=publicState;status.dataset.playerCount=playerCount.toString();
    status.classList.toggle('online',state==='connected');status.classList.toggle('error',state==='error');
    if(state==='connected'){
      const latency=this.network?.latencyMs;status.textContent=`ONLINE · ${this.network?.room??''} · ${playerCount}P${latency===undefined?'':` · ${Math.round(latency)}MS`}`;
    }else if(state==='connecting'||state==='joining')status.textContent='CONNECTING…';
    else if(state==='reconnecting')status.textContent='RECONNECTING…';
    else if(state==='error')status.textContent='CONNECTION ERROR';
    else status.textContent='OFFLINE';
  }

  private applyNetworkLoadout(loadout:LoadoutMessage):void {
    if(this.mode!=='online'||loadout.playerId!==this.network?.clientId)return;
    if(!this.archivalWinter&&this.lastLoadoutServerTime!==undefined&&Number.isFinite(this.lastLoadoutServerTime)&&loadout.serverTime<this.lastLoadoutServerTime)return;
    if(this.sourceGunAwaitingInputSequence!==undefined&&loadout.sourceTyping===false&&loadout.sourceTransformSequence!==undefined&&loadout.sourceTransformSequence>=this.sourceGunAwaitingInputSequence)this.sourceGunAwaitingInputSequence=undefined;
    if(loadout.ackShotId===this.pendingSourceShot)this.pendingSourceShot=undefined;
    const wasReloading=this.weaponState.reloading;
    const previousRifleAmmo=this.weaponState.ammo.rifle;
    const previousRpgAmmo=this.weaponState.ammo.rpg;
    const autoReloadTime=loadout.sourceAutoReloadTime;
    const freshSourceAutoReload=!this.archivalWinter&&autoReloadTime!==undefined&&autoReloadTime>(this.lastSourceAutoReloadTime??-Infinity);
    if(freshSourceAutoReload)this.lastSourceAutoReloadTime=autoReloadTime;
    this.authoritativeLoadoutUpdates++;this.lastLoadoutServerTime=loadout.serverTime;
    for(const weapon of WEAPON_IDS){this.weaponState.ammo[weapon]=loadout.weapons[weapon].ammo;this.weaponState.reserve[weapon]=loadout.weapons[weapon].reserve;}

    const equippedChanged=this.weaponState.current!==loadout.equipped;
    const sourceRearmed=!this.archivalWinter&&this.weaponState.unarmed&&!loadout.unarmed;
    this.weaponState.current=loadout.equipped;this.weaponState.unarmed=loadout.unarmed??false;
    if(equippedChanged||sourceRearmed){this.syncWeaponPresentation(loadout.equipped,false);this.onlineWeaponReadyAt=0;}
    if(!this.archivalWinter&&loadout.sourceDisplayedWeapon!==undefined&&!this.currentSoloLocalWeaponPresentation()){
      // Selection and the last source whichgun refresh differ after an empty
      // direct-R return. Authority transports that refresh separately.
      this.sourceDisplayedWeapon=loadout.sourceDisplayedWeapon;
      for(const [id,model] of this.weaponModels)model.visible=id===this.sourceDisplayedWeapon;
    }

    const unpredictedRpgReload=freshSourceAutoReload&&previousRpgAmmo===0&&loadout.equipped==='rpg'&&this.weaponState.ammo.rpg>0;
    if(unpredictedRpgReload)this.playOriginalCombatSound(originalReloadSound('rpg'),undefined,6);
    if(loadout.reload){
      if((!wasReloading||equippedChanged||unpredictedRpgReload)&&!this.currentSoloLocalWeaponPresentation())this.originalWeaponPresentation?.reload();
      // Both values share the same authoritative clock. Only their difference
      // is meaningful to the performance-time client animation.
      const remainingSeconds=Math.max(0,(loadout.reload.completesAt-loadout.serverTime)/1_000);
      this.weaponState.reloading=remainingSeconds>0;this.weaponState.reloadEnd=this.elapsed+remainingSeconds;
      if(!this.archivalWinter&&loadout.equipped==='rifle'&&remainingSeconds>0
        &&(!wasReloading||equippedChanged||this.legacyRifleRefillStartedAt===-10)){
        const duration=weaponReloadDuration(this.weaponState.map,'rifle',WEAPONS.rifle.reloadTime);
        this.legacyRifleRefillStartedAt=this.elapsed-Math.max(0,duration-remainingSeconds);
      }
      this.autoReloadWeapon=undefined;this.autoReloadAt=Infinity;
    }else{
      this.weaponState.reloading=false;this.weaponState.reloadEnd=0;
      if(!this.archivalWinter&&loadout.equipped==='rifle'&&this.weaponState.ammo.rifle<previousRifleAmmo)this.legacyRifleRefillStartedAt=-10;
      const queued=this.autoReloadWeapon;
      if(queued!==undefined&&(queued!==loadout.equipped||this.weaponState.ammo[queued]>0||this.weaponState.reserve[queued]<=0)){
        this.autoReloadWeapon=undefined;this.autoReloadAt=Infinity;
      }
      if(this.archivalWinter&&this.playerAlive&&this.weaponState.ammo[loadout.equipped]===0&&this.weaponState.reserve[loadout.equipped]>0&&this.autoReloadWeapon===undefined){
        this.autoReloadWeapon=loadout.equipped;this.autoReloadAt=this.elapsed+.35;
      }
    }
    if(loadout.sourceCounter){
      const serverNow=this.network?.estimatedServerTimeMs;
      const epoch=loadout.sourceCounterTime??loadout.serverTime;
      const counterTime=serverNow===undefined?this.elapsed:performance.now()/1000-Math.max(0,serverNow-epoch)/1000;
      this.sourceGunAuthorityLocalTime=Math.max(this.sourceGunAuthorityLocalTime??-Infinity,counterTime);
      this.weaponState.applyOriginalCounter(loadout.sourceCounter,counterTime);
      this.sourceGunAuthorityCounter={epoch,weapon:loadout.equipped,state:{...loadout.sourceCounter}};
    }
    this.updateHud();
  }

  private applyNetworkSnapshot(snapshot:NetworkSnapshot):void {
    if(!this.archivalWinter&&(this.phase==='won'||this.phase==='lost'))return;
    if(snapshot.map&&snapshot.map!==this.mapId)this.selectMap(snapshot.map);
    const localId=this.network?.clientId;const local=localId?snapshot.players.find(player=>player.id===localId):undefined;
    const barrelEpoch=snapshot.sourcePhysicsTime??snapshot.sourceHealthTime??snapshot.serverTime;
    const currentBarrelEpoch=barrelEpoch>=Math.max(this.originalBarrelAuthorityTime??-Infinity,this.originalBarrelReceivedTime??-Infinity);
    const stageLocal=!this.archivalWinter&&this.mode==='online'&&this.sourceRemoteViewEpoch!=null&&local
      &&!this.needsAuthoritativeSpawn&&this.playerAlive&&local.alive&&local.transform.sourceInput&&(!snapshot.barrels||currentBarrelEpoch);
    // The player and movable bodies form one physical correction. Receipts,
    // remote targets and health still apply in order, but a queued player must
    // never be observed against a newly restored barrel from another epoch.
    if(!this.archivalWinter&&local&&(!local.alive||this.needsAuthoritativeSpawn||!this.playerAlive))this.cancelOriginalReconciliation();
    else if(!stageLocal&&snapshot.barrels&&currentBarrelEpoch&&this.pendingOriginalReconciliation){
      // A live unmatched transition cannot discard a snapshot that covered a
      // previously received contact. Commit that valid pair before advancing
      // the independently supplied barrels; death/new-life cancellation above
      // deliberately never restores the previous live player.
      this.flushOriginalReconciliation();
    }else if(stageLocal&&!snapshot.barrels&&this.pendingOriginalReconciliation?.barrels)this.flushOriginalReconciliation();
    if(!this.archivalWinter&&snapshot.barrels&&this.arena.barrelWorld&&currentBarrelEpoch){
      this.originalBarrelReceivedTime=barrelEpoch;
      if(!stageLocal){
        this.applyOriginalBarrelAuthority(snapshot.barrels,barrelEpoch);
      }
      const serverNow=this.network?.estimatedServerTimeMs;
      if(serverNow!==undefined){
        const authorityTime=performance.now()/1000-(serverNow-barrelEpoch)/1000;
        if(!Number.isFinite(this.nextSourceReloadPoll)||this.nextSourceReloadPoll<=authorityTime+1e-9)this.nextSourceReloadPoll=authorityTime+1/30;
      }
    }
    this.latestNetworkSnapshot=snapshot;this.lastSnapshotReceivedAt=performance.now();this.networkFragLimit=snapshot.fragLimit;
    // Establish the matching pending pair before door notifications can consume
    // a spatial camera pose; those consumers commit only the new pair.
    if(stageLocal)this.queueOriginalReconciliation(local,snapshot.sourcePhysicsTime??snapshot.serverTime,snapshot.barrels,barrelEpoch);
    this.attachOriginalDoors();this.originalDoorClient?.snapshot(snapshot.doors,snapshot.serverTime,this.needsAuthoritativeSpawn);
    if(local){
      const wasAlive=this.playerAlive;const requiresFreshSpawn=this.needsAuthoritativeSpawn;
      this.health=local.health;
      if(!this.archivalWinter&&local.sourceHealth)this.restoreOriginalHealth(local.sourceHealth,snapshot.sourceHealthTime??snapshot.sourcePhysicsTime??snapshot.serverTime);
      this.armor=local.armor??0;this.kills=local.frags;this.deaths=local.deaths;this.score=local.score??local.frags*150;
      if(!this.archivalWinter&&!local.alive){this.cancelOriginalReconciliation();this.setLocalNetworkDead();return;}
      if(requiresFreshSpawn)this.applyAuthoritativeSpawn(local,false);
      else if(local.alive&&!wasAlive)this.applyAuthoritativeSpawn(local,true);
      if(!local.alive&&wasAlive)this.setLocalNetworkDead();
      this.playerAlive=local.alive;
      if(!this.archivalWinter&&this.sourceRemoteViewEpoch==null&&!requiresFreshSpawn&&wasAlive&&local.alive&&local.transform.sourceInput&&(!snapshot.barrels||currentBarrelEpoch))this.reconcileOriginalPlayer(local,snapshot.sourcePhysicsTime??snapshot.serverTime);
    }
    const present=new Set<string>();
    for(const player of snapshot.players){
      if(player.id===localId)continue;present.add(player.id);
      if(this.sourceRemoteViewEpoch!=null&&local&&originalAsciiNamesEqual(player.name,local.name))continue;
      let remote=this.remotePlayers.get(player.id);const isNew=!remote;const wasAlive=remote?.alive??false;
      // Native dead cannot construct an unknown baddie. A detached corpse is
      // independent of its owner's standing record in subsequent snapshots.
      if(!remote&&!player.alive&&this.sourceRemoteViewEpoch!=null)continue;
      if(!remote){remote=new RemotePlayer(player.id,player.name,this.soldierMaterialLibrary,this.originalSoldierResources,this.sourceRemoteViewEpoch!=null,this.sourceRemoteViewEpoch!=null);this.remotePlayers.set(player.id,remote);this.scene.add(remote.group);}
      remote.apply({id:player.id,name:player.name,x:player.transform.position.x,y:player.transform.position.y,z:player.transform.position.z,yaw:player.transform.yaw,pitch:player.transform.pitch,health:player.health,frags:player.frags,deaths:player.deaths,weapon:player.transform.weapon,alive:player.alive,sourceMotionTime:player.sourceMotionTime,sourceShots:player.sourceShots},isNew||(!wasAlive&&player.alive&&this.sourceRemoteViewEpoch==null));
      if(isNew&&!this.archivalWinter&&this.sourceRemoteViewEpoch!=null)this.appendChat('',`${player.name} has entered the arena.`,'feedback');
    }
    for(const [id,remote] of this.remotePlayers)if(!present.has(id)&&!(!this.archivalWinter&&(
      remote.alive&&this.sourceRemoteViewEpoch!=null||remote.alive===false&&remote.debugState().original?.removed===false
    ))){this.snowTracks.resetActor(`remote:${id}`);this.scene.remove(remote.group);remote.dispose();this.remotePlayers.delete(id);}
    this.reconcileNetworkItems(snapshot);
    this.reconcileNetworkProjectiles(snapshot.projectiles,snapshot.serverTime);
    if(this.originalExplosionPresentation&&snapshot.blasts){
      const present=new Set<string>();
      for(const blast of snapshot.blasts){present.add(blast.projectileId);this.originalExplosionPresentation.sync(blast.projectileId,blast.weapon==='rpg'?'rocket':'grenade',blast.position,blast.remainingCallbacks,this.sourceEffectAuthorityTime(snapshot.serverTime));}
      for(const id of this.networkExplosionIds)if(!present.has(id))this.originalExplosionPresentation.remove(id);
      this.networkExplosionIds=present;this.originalExplosionPresentation.faceAll(this.camera.position);
    }
    this.updateNetworkStatus(this.network?.state??'offline');this.updateHud();
    if(this.archivalWinter&&snapshot.state==='finished'&&snapshot.winnerId){const winner=this.playerName(snapshot.winnerId);this.endRound(snapshot.winnerId===localId,winner);}
  }

  private applyAuthoritativeSpawn(player:NetworkPlayer,resetLoadout:boolean):void {
    this.cancelOriginalReconciliation();
    this.pendingSourceShot=undefined;this.lastSourceAutoReloadTime=-Infinity;this.sourceGunAuthorityLocalTime=-Infinity;this.sourceGunAuthorityCounter=undefined;this.sourceGunAwaitingInputSequence=undefined;this.resetSourceScope();
    if(!this.archivalWinter&&(this.phase==='won'||this.phase==='lost'))return;
    if(!this.archivalWinter&&!player.alive){this.setLocalNetworkDead();return;}
    this.releaseActiveInput();
    this.networkBoostStartedAt=undefined;
    this.originalPlayerPrediction=[];this.originalPlayerContacts=[];
    this.networkMovementPath=[];this.network?.resetTransformPath?.();
    this.camera.position.set(player.transform.position.x,player.transform.position.y+PLAYER_HEIGHT,player.transform.position.z);
    this.yaw=player.transform.yaw;this.pitch=player.transform.pitch;this.velocity.set(player.transform.velocity.x,player.transform.velocity.y,player.transform.velocity.z);this.keys.clear();this.grounded=player.transform.grounded;
    this.health=player.health;
    if(!this.archivalWinter){this.sourceHealth=player.sourceHealth?{...player.sourceHealth}:createOriginalPlayerHealth(player.health);this.sourceHealthPrediction=[];this.sourceHealthAuthorityTime=-Infinity;}
    this.armor=player.armor??0;this.playerAlive=player.alive;this.needsAuthoritativeSpawn=false;
    this.snowTracks.resetActor('player');
    if(resetLoadout){this.weaponState.reset();this.nextSourceReloadPoll=-Infinity;this.switchWeapon(player.transform.weapon);}
    else if(this.weaponState.current!==player.transform.weapon){this.weaponState.current=player.transform.weapon;this.syncWeaponPresentation(player.transform.weapon,false);this.onlineWeaponReadyAt=0;this.updateHud();}
    byId('respawn-overlay').classList.toggle('active',!player.alive);if(player.alive&&this.archivalWinter)this.setMessage('SPAWN PROTECTION',1.2);
    this.publishNetworkTransform();
  }

  private setLocalNetworkDead(playAudio=true,killerName='UNKNOWN'):void {
    this.flushOriginalReconciliation();this.cancelOriginalReconciliation();
    if(!this.archivalWinter&&(this.phase==='won'||this.phase==='lost'))return;
    this.playerAlive=false;this.health=0;this.firing=false;this.aiming=false;this.velocity.set(0,0,0);
    this.autoReloadWeapon=undefined;this.autoReloadAt=Infinity;this.weaponState.reloading=false;
    if(!this.archivalWinter){this.playerRespawnAt=0;this.endRound(false,killerName);this.disconnectNetwork();return;}
    byId('respawn-overlay').classList.add('active');if(playAudio)this.audio.play('hurt');
  }

  private handleNetworkEvent(event:NetworkGameEvent):void {
    if(!this.archivalWinter&&(this.phase==='won'||this.phase==='lost'))return;
    const localId=this.network?.clientId;
    if(event.type==='door_open'){this.attachOriginalDoors();if(this.originalDoorClient?.opened(event.data.name,event.data.openedAt,event.serverTime))this.playOriginalDoorSound(event.data.name);return;}
    if(event.type==='chat'){this.appendChat(event.data.name,event.data.text);return;}
    // Keep the pending marker until snapshot removal: the collected receipt
    // can precede the snapshot that removes this item from automatic reach checks.
    if(event.type==='collected'&&event.data.playerId===localId){if(this.archivalWinter)this.audio.play('ui');if(this.archivalWinter){if(event.data.weapon)this.switchWeapon(event.data.weapon);}else{if(event.data.score!==undefined)this.score=event.data.score;if(!this.currentSoloLocalWeaponPresentation())this.originalWeaponPresentation?.reload();if(event.data.weapon&&!this.weaponState.unarmed)this.playOriginalCombatSound(originalReloadSound(this.weaponState.current),undefined,6);if(event.data.weapon)this.appendChat('',originalPickupFeedback(event.data.weapon),'feedback');this.updateHud();}return;}
    if(event.type==='shot'&&event.data.playerId!==localId){
      const shot=event.data.shot;if(!this.rememberNetworkKey(this.handledNetworkShots,`${event.serverTime}:${event.data.playerId}:${shot.shotId}`))return;
      const queued=!this.archivalWinter&&this.sourceRemoteViewEpoch!=null;
      if(!queued)this.remotePlayers.get(event.data.playerId)?.fire();
      this.spawnNetworkTracer(shot.origin,shot.direction,WEAPONS[shot.weapon].range);
      if(this.archivalWinter){if(this.camera.position.distanceTo(new THREE.Vector3(shot.origin.x,shot.origin.y,shot.origin.z))<35)this.audio.play('shot',.28);}else if(!queued)this.playOriginalCombatSound(originalFireSound(shot.weapon),this.originalHurtAttackerPosition(event.data.playerId)??shot.origin);
    }else if(event.type==='projectile_spawned'){
      const projectile=event.data.projectile;this.reconcileNetworkProjectile(projectile,event.serverTime);
      const firstSpawn=this.rememberNetworkKey(this.handledNetworkProjectileSpawns,projectile.projectileId);
      if(firstSpawn)this.networkEffectCounts.projectileSpawns++;
      if(projectile.attackerId!==localId&&firstSpawn){
        // Source grenade/rocket messages create their own projectile actor;
        // only bullet shots enter the remote soldier's shooting phase.
        if(this.archivalWinter)this.remotePlayers.get(projectile.attackerId)?.fire();
        // The source constructor plays at its message position before the RPG
        // advances its model. Keep this detached from the remote's current pose.
        if(this.archivalWinter){if(this.camera.position.distanceTo(new THREE.Vector3(projectile.position.x,projectile.position.y,projectile.position.z))<35)this.audio.play('shot',.28);}else this.playOriginalCombatSound(originalFireSound(projectile.weapon),event.data.launchSoundPosition??this.originalHurtAttackerPosition(projectile.attackerId)??projectile.position,7);
      }
    }else if(event.type==='explosion'){
      const pendingId=this.pendingNetworkProjectileShots.get(event.data.shotId);
      const visual=this.networkProjectiles.get(event.data.projectileId)??(pendingId?this.networkProjectiles.get(pendingId):undefined);
      if(!this.archivalWinter&&visual?.source?.weapon==='rpg'&&!visual.puffTerminal){this.originalCombatEffectPresentation?.spawnPuff(event.data.position,this.playerAlive?this.camera.position:null,Math.random,undefined,0,this.sourceEffectAuthorityTime(event.serverTime));visual.puffTerminal=true;}
      if(this.rememberNetworkKey(this.handledNetworkExplosions,event.data.projectileId)){
        this.networkEffectCounts.explosions++;
        const point=new THREE.Vector3(event.data.position.x,event.data.position.y,event.data.position.z);
        if(this.archivalWinter)this.audio.play('explosion');else this.playOriginalCombatSound('boomnew',point);this.spawnExplosion(point,event.data.radius,event.data.weapon,event.data.projectileId,event.data.remainingCallbacks??16,this.sourceEffectAuthorityTime(event.serverTime));
      }
      const retired=new Set<THREE.Mesh>();
      if(visual){retired.add(visual.mesh);this.releaseProjectileMesh(visual.mesh);}
      this.networkProjectiles.delete(event.data.projectileId);
      if(pendingId){const pending=this.networkProjectiles.get(pendingId);if(pending&&!retired.has(pending.mesh))this.releaseProjectileMesh(pending.mesh);this.networkProjectiles.delete(pendingId);this.pendingNetworkProjectileShots.delete(event.data.shotId);}
    }else if(event.type==='projectile_contact'){
      if(!this.archivalWinter&&event.data.playerId===localId&&this.rememberNetworkKey(this.handledNetworkRG6Boosts,`${event.data.projectileId}:${event.serverTime}`)&&this.phase==='playing'&&this.playerAlive){this.originalProjectileContactCount=(this.originalProjectileContactCount??0)+1;this.networkMovementPath=[];this.network?.resetTransformPath?.();
        const serverNow=this.network?.estimatedServerTimeMs;
        if(this.arena.runtime){
          const coveredEpoch=this.sourceRemoteViewEpoch!=null
            ?Math.max(this.originalReconciliationEpoch??-Infinity,this.pendingOriginalReconciliation?.serverTime??-Infinity)
            :(this.latestNetworkSnapshot?.sourcePhysicsTime??-Infinity);
          if(coveredEpoch>=event.serverTime)return;
          const localTime=performance.now()/1000-(serverNow===undefined?0:(serverNow-event.serverTime)/1000);
          const contacts=this.originalPlayerContacts??=[];contacts.push({serverTime:event.serverTime,localTime,velocity:{...event.data.velocity},applied:false});contacts.sort((a,b)=>a.serverTime-b.serverTime);
          while(contacts.length>128)contacts.shift();
        }else{this.velocity.copy(event.data.velocity);this.grounded=false;
          const sourceAge=serverNow===undefined?0:Math.min(.25,Math.max(0,(serverNow-event.serverTime)/1000));this.networkBoostStartedAt=performance.now()/1000-sourceAge;
        }
      }
    }else if(event.type==='rg6_boost'){
      if(this.archivalWinter&&event.data.playerId===localId&&this.rememberNetworkKey(this.handledNetworkRG6Boosts,event.data.projectileId)
        &&this.phase==='playing'&&this.playerAlive){
        this.networkMovementPath=[];this.network?.resetTransformPath?.();
        this.velocity.y=event.data.velocityY;this.grounded=false;
        const serverNow=this.network?.estimatedServerTimeMs;
        const sourceAge=serverNow===undefined?0:Math.min(.25,Math.max(0,(serverNow-event.serverTime)/1000));
        this.networkBoostStartedAt=performance.now()/1000-sourceAge;
      }
    }else if(event.type==='damaged'){
      if(event.data.targetId===localId)this.flushOriginalReconciliation();
      const source=event.data.source;
      if(source.kind==='cowardice'){
        const key=`${event.serverTime}:cowardice:${event.data.targetId}:${event.data.health}`;
        if(!this.rememberNetworkKey(this.handledNetworkDamageEvents,key))return;
        this.networkEffectCounts.damageEvents++;
        if(event.data.targetId===localId){
          this.health=event.data.health;
          if(event.data.sourceHealth)this.restoreOriginalHealth(event.data.sourceHealth,event.data.sourceHealthTime??event.serverTime);
          if(!source.direct){this.playPlayerHurtSound();this.showOriginalHurt(this.originalHurtAttackerPosition(source.attackerId??undefined));}
          // Keep ownership until the following killed receipt confirms the
          // source death/drop. A surviving response preserves the typing field.
          if(event.data.lethal!==true)this.sourceEscapePending=false;
        }
        this.updateHud();return;
      }
      const damageKey=`${event.serverTime}:${event.data.attackerId}:${source.kind}:${source.shotId}:${event.data.targetId}`;
      if(this.rememberNetworkKey(this.handledNetworkDamageEvents,damageKey)){
        this.networkEffectCounts.damageEvents++;
        // The shooter's registered bullet already presented baddies.hurt.
        // Correlate only that shot/target; receipt-only events retain their adapter.
        const predictedHurt=!this.archivalWinter&&source.kind==='hitscan'&&event.data.attackerId===localId
          &&this.predictedSourceHitHurts?.delete(JSON.stringify([source.shotId,event.data.targetId]));
        if(!this.archivalWinter&&event.data.targetId!==localId&&!predictedHurt){const position=this.originalHurtAttackerPosition(event.data.targetId)??source.position;const rays=source.kind==='hitscan'&&event.data.attackerId===localId?(getOriginalHitscan(this.mapId,source.weapon)?.rays??1):1;for(let ray=0;ray<rays;ray++)this.playOriginalCombatSound('hurt',position);}
        if(event.data.attackerId===localId&&event.data.targetId!==localId){
          const lethal=this.archivalWinter?event.data.health<=0:event.data.lethal===true;const remote=this.remotePlayers.get(event.data.targetId);
          if(!lethal)remote?.flinch(Math.min(1.3,.45+event.data.damage/100),Math.random()>.5?1:-1);
          if(source.kind==='explosion'){
            if(this.rememberNetworkKey(this.creditedExplosiveShots,`${event.data.attackerId}:${source.projectileId}`)){this.hits++;if(!lethal){this.showHitmarker(false);if(this.archivalWinter)this.audio.play('hit',.8);}}
          }else{
            this.hits++;if(!lethal){this.showHitmarker(false,source.zone==='head');if(this.archivalWinter)this.audio.play('hit',.8);}
            const point=new THREE.Vector3(source.position.x,source.position.y,source.position.z);
            if(this.archivalWinter)this.spawnImpact(point,this.camera.position.clone().sub(point).normalize(),7,1,false,'flesh');
          }
        }
        if(event.data.targetId===localId){this.health=event.data.health;if(!this.archivalWinter&&event.data.sourceHealth)this.restoreOriginalHealth(event.data.sourceHealth,event.data.sourceHealthTime??event.serverTime);this.showNetworkDamage(source.position,event.data.attackerId,source.kind==='explosion'?source.attackerName:undefined);if(this.archivalWinter?event.data.health<=0:event.data.lethal===true){if(!this.archivalWinter&&this.playerAlive)this.deaths++;this.setLocalNetworkDead(false,!this.archivalWinter&&source.kind==='explosion'&&source.attackerName!==undefined?source.attackerName:this.deathActorName(event.data.attackerId));}}
      }
    }else if(event.type==='killed'){
      const source=event.data.source;const cowardice=source.kind==='cowardice';
      const ownerName=!this.archivalWinter&&source.kind==='explosion'?source.attackerName:undefined;
      const killerLabel=cowardice?'Cowardice':ownerName??this.playerName(event.data.killerId);
      const eliminationKey=`${event.serverTime}:${event.data.killerId}:${source.kind}:${cowardice?'Cowardice':source.shotId}:${event.data.victimId}`;
      if(this.rememberNetworkKey(this.handledNetworkEliminations,eliminationKey)){
        this.networkEffectCounts.eliminations++;
        if(this.latestNetworkSnapshot){
          const players=recordElimination(
            this.latestNetworkSnapshot.players,
            event.data.killerId,
            event.data.victimId,
            event.data.killerFrags,
            event.data.victimDeaths,
          ).map((player)=>{
            const recipient=!this.archivalWinter?event.data.sourceScoreRecipients?.find(item=>item.playerId===player.id):undefined;
            const credited=recipient?{...player,frags:recipient.frags,score:recipient.score}:player;
            return player.id===event.data.victimId?{...credited,health:0,alive:false}:credited;
          });
          this.latestNetworkSnapshot={...this.latestNetworkSnapshot,players};
          const victim=players.find((player)=>player.id===event.data.victimId),remote=victim?this.remotePlayers.get(victim.id):undefined;
          if(!this.archivalWinter&&victim&&remote){
            if(this.sourceRemoteViewEpoch==null)this.playOriginalCombatSound('hurt',{x:victim.transform.position.x,y:victim.transform.position.y+PLAYER_HEIGHT,z:victim.transform.position.z});
            this.appendChat('',`${killerLabel} makes ${victim.name} russian history.`,'feedback');
          }
          if(victim&&remote)remote.apply({id:victim.id,name:victim.name,x:victim.transform.position.x,y:victim.transform.position.y,z:victim.transform.position.z,yaw:victim.transform.yaw,pitch:victim.transform.pitch,health:0,frags:victim.frags,deaths:victim.deaths,weapon:victim.transform.weapon,alive:false,sourceMotionTime:victim.sourceMotionTime});
        }
        this.addKillFeed(killerLabel,this.playerName(event.data.victimId));
        const sourceRecipients=!this.archivalWinter?event.data.sourceScoreRecipients:undefined;
        const ownRecipient=sourceRecipients?.find(recipient=>recipient.playerId===localId);
        if(ownRecipient){this.kills=ownRecipient.frags;this.score=ownRecipient.score;}
        const originalOwnerCredit=event.data.killerId===localId&&event.data.victimId!==localId&&(sourceRecipients===undefined||ownRecipient!==undefined);
        if(originalOwnerCredit){if(sourceRecipients===undefined){this.kills=event.data.killerFrags;this.score=event.data.killerScore??this.kills*150;}if(!cowardice){this.showHitmarker(true);if(this.archivalWinter)this.audio.play('hit',.8);this.setMessage('ELIMINATION CONFIRMED',1.2);}}
        if(event.data.victimId===localId){this.sourceEscapePending=false;this.deaths=event.data.victimDeaths;this.setLocalNetworkDead(false,cowardice?'Cowardice':ownerName??this.deathActorName(event.data.killerId));}
      }
    }else if(this.archivalWinter&&event.type==='respawn'&&event.data.playerId===localId){
      const player=this.latestNetworkSnapshot?.players.find(item=>item.id===localId);
      if(player)this.applyAuthoritativeSpawn({...player,alive:true,health:event.data.health,respawnAt:null,transform:{...player.transform,position:event.data.position,velocity:{x:0,y:0,z:0},grounded:true,weapon:'rifle'}},true);
    }else if(event.type==='join'&&event.data.player.id!==localId&&(this.archivalWinter||this.sourceRemoteViewEpoch==null)){
      this.setMessage(`${event.data.player.name} JOINED`,1.2);this.appendChat('',`${event.data.player.name} has entered the arena.`,'system');
    }else if(event.type==='leave'&&(this.archivalWinter||this.sourceRemoteViewEpoch==null)){
      this.setMessage(`${event.data.name} LEFT`,1.2);this.appendChat('',`${event.data.name} has left the arena.`,'system');
    }else if(this.archivalWinter&&event.type==='winner')this.endRound(event.data.playerId===localId,event.data.name);
    this.updateHud();
  }

  private playPlayerHurtSound():void {
    if(this.archivalWinter)this.audio.play('hurt');
    else this.audio.playOriginalHurt();
  }

  private showNetworkDamage(origin:Vec3,attackerId?:string,attackerName?:string):void {
    this.playPlayerHurtSound();
    if(this.archivalWinter){this.damageOpacity=Math.min(.85,this.damageOpacity+.3);this.showDamageDirection(origin);}
    else this.showOriginalHurt(attackerName===undefined?this.originalHurtAttackerPosition(attackerId):this.originalHurtAttackerNamePosition(attackerName));
  }

  /** Source hurt resolves the stored owner name; the explosion origin is not an actor. */
  private originalHurtAttackerNamePosition(name:string):Vec3|undefined {
    if(this.playerAlive&&originalAsciiNamesEqual(name,this.localCallsign))return this.camera.position;
    for(const remote of this.remotePlayers.values()){
      if(remote.sourceActorActive&&originalAsciiNamesEqual(name,remote.name))return {x:remote.group.position.x,y:remote.group.position.y+PLAYER_HEIGHT,z:remote.group.position.z};
    }
    return undefined;
  }

  private originalHurtAttackerPosition(id?:string):Vec3|undefined {
    if(id==='player'||id===this.network?.clientId&&id!==undefined)return this.camera.position;
    const remote=id?this.remotePlayers?.get(id):undefined;
    if(remote)return {x:remote.group.position.x,y:remote.group.position.y+PLAYER_HEIGHT,z:remote.group.position.z};
    if(id?.startsWith('enemy:')){const enemy=this.enemies?.[Number(id.slice(6))];if(enemy)return {x:enemy.group.position.x,y:enemy.group.position.y+PLAYER_HEIGHT,z:enemy.group.position.z};}
    return undefined;
  }

  private showOriginalHurt(attacker?:Vec3):void {
    activateOriginalHurtOverlay(this.sourceHurt??=createOriginalHurtOverlay(),this.camera.position,attacker,this.yaw??0);
  }

  private renderOriginalHurt():void {
    const overlay=this.el('original-hurt-overlay'),image=this.el('original-hurt-image'),state=this.sourceHurt??=createOriginalHurtOverlay();
    if(this.archivalWinter){overlay.style.opacity='0';return;}
    overlay.style.opacity=String(state.blend/100);
    if(this.mapId==='woodlands'){
      image.setAttribute('href','/assets/original-effects/hurt-woodland.png');
      image.setAttribute('x','0');image.setAttribute('y','0');image.setAttribute('width','128');image.setAttribute('height','128');
      image.setAttribute('transform',`rotate(${originalWoodlandHurtRotation(state)} 64 64)`);
    }else{
      // Literal361+vang; nearest integer/clamping is an explicit browser adapter
      // while native fractional/out-of-range Director poster frames are unproved.
      const requested=361+state.sourceAngle,frame=Math.max(1,Math.min(361,Math.round(requested)));
      const matrix=originalHurtAssets.placements[frame-1].matrix;
      image.setAttribute('href','/assets/original-effects/hurt-barrack.png');
      image.setAttribute('x','-41');image.setAttribute('y','-43');image.setAttribute('width','82');image.setAttribute('height','31');
      image.setAttribute('transform',`matrix(${matrix.join(' ')})`);
      overlay.dataset.requestedFrame=String(requested);overlay.dataset.frame=String(frame);
    }
  }

  private showDamageDirection(origin:{x:number;y:number;z:number}):void {
    const toSource=new THREE.Vector3(origin.x,origin.y,origin.z).sub(this.camera.position);const angle=damageIndicatorAngle(toSource.x,toSource.z,this.yaw);
    const indicator=byId('damage-direction');indicator.style.transform=`translate(-50%,-50%) rotate(${angle}rad)`;indicator.style.opacity='1';
    if(this.damageDirectionHideTimer!==undefined)clearTimeout(this.damageDirectionHideTimer);
    this.damageDirectionHideTimer=setTimeout(()=>{indicator.style.opacity='0';this.damageDirectionHideTimer=undefined;},260);
  }

  /** Death messages preserve names, including the local name for self damage. */
  private deathActorName(id:string):string {
    return this.latestNetworkSnapshot?.players.find(player=>player.id===id)?.name
      ??(id===this.network?.clientId||id==='player'?this.localCallsign:this.remotePlayers?.get(id)?.name)
      ??'UNKNOWN';
  }

  private playerName(id:string):string {
    if(id===this.network?.clientId)return 'YOU';
    return this.latestNetworkSnapshot?.players.find(player=>player.id===id)?.name??this.remotePlayers.get(id)?.name??'UNKNOWN';
  }

  private clearRemotePlayers():void {
    for(const remote of this.remotePlayers.values()){this.snowTracks.resetActor(`remote:${remote.id}`);this.scene.remove(remote.group);remote.dispose();}
    this.remotePlayers.clear();
    for(const corpse of this.sourceTimeoutCorpses)corpse.dispose();
    this.sourceTimeoutCorpses.clear();
  }

  private reconcileNetworkProjectile(projectile:ProjectileSnapshot,serverTime:number):void {
    if(this.handledNetworkExplosions.has(projectile.projectileId))return;
    let visual=this.networkProjectiles.get(projectile.projectileId);
    if(visual&&serverTime<visual.lastServerTime)return;
    if(!visual){
      const pendingId=this.pendingNetworkProjectileShots.get(projectile.shotId);
      if(pendingId){
        visual=this.networkProjectiles.get(pendingId);
        this.networkProjectiles.delete(pendingId);this.pendingNetworkProjectileShots.delete(projectile.shotId);
        if(visual)this.networkEffectCounts.adoptions++;
      }
    }
    if(!visual){
      visual=this.createNetworkProjectileVisual(projectile.weapon);
      this.networkProjectiles.set(projectile.projectileId,visual);
    }else if(!this.networkProjectiles.has(projectile.projectileId)){
      this.networkProjectiles.set(projectile.projectileId,visual);
    }
    visual.weapon=projectile.weapon;visual.lastServerTime=serverTime;
    if(!this.archivalWinter){
      if(visual.source?.weapon==='rpg'&&projectile.remainingCallbacks!==undefined){
        // Prediction may have hit a surface which authority did not. A live
        // endpoint disproves that provisional termination.
        if(projectile.remainingCallbacks<=(visual.puffRemainingCallbacks??200))visual.puffTerminal=false;
        // Replay known missed callbacks before replacing prediction with the
        // authority endpoint. Geometry/body disagreement remains a transport
        // adapter; a late join has no earlier path to replay.
        const previous={...visual.source,position:{...visual.source.position},velocity:{...visual.source.velocity},direction:{...visual.source.direction},...(visual.source.angular?{angular:cloneOriginalAngularBody(visual.source.angular)}:{})};
        while(previous.remainingCallbacks>projectile.remainingCallbacks){const result=stepOriginalProjectile(previous,{radius:this.originalProjectileRadius('rpg'),sweep:(from,to,radius)=>this.sweepOriginalProjectile(from,to,radius),sweepConvex:(from,to,shape,surfaceVelocity)=>this.sweepOriginalConvex(from,to,shape,false,surfaceVelocity)});this.presentNetworkOriginalPuff(visual,previous,false,previous.remainingCallbacks-projectile.remainingCallbacks);if(result.detonated)break;}
      }
      const direction=projectile.direction??new THREE.Vector3().copy(projectile.velocity).normalize();
      visual.source=createOriginalProjectile(projectile.weapon,projectile.position,direction,projectile.attackerId,projectile.sourceRotation);
      visual.source.position={...projectile.position};visual.source.velocity={...projectile.velocity};visual.source.remainingCallbacks=projectile.remainingCallbacks??visual.source.remainingCallbacks;
      if(projectile.orientation&&projectile.angularVelocity&&visual.source.angular){
        const q=projectile.orientation,length=Math.hypot(q.x,q.y,q.z,q.w);
        visual.source.angular.orientation={x:q.x/length,y:q.y/length,z:q.z/length,w:q.w/length};
        visual.source.angular.angularVelocity={...projectile.angularVelocity};visual.source.convex=originalAngularConvex(visual.source.angular);
      }
      if(visual.source.weapon==='rpg'&&visual.puffRemainingCallbacks===undefined)visual.puffRemainingCallbacks=visual.source.remainingCallbacks;
    }
    visual.authoritativePosition.set(projectile.position.x,projectile.position.y,projectile.position.z);
    visual.authoritativeVelocity.set(projectile.velocity.x,projectile.velocity.y,projectile.velocity.z);
    const estimatedServerNow=this.estimatedNetworkServerNow(serverTime);
    const extrapolationMs=Math.max(0,Math.min(MAX_PROJECTILE_EXTRAPOLATION_MS,projectile.expiresAt-serverTime,estimatedServerNow-serverTime));
    visual.predictedSeconds=extrapolationMs/1_000;
    visual.predictionLimitSeconds=Math.max(0,Math.min(MAX_PROJECTILE_EXTRAPOLATION_MS,projectile.expiresAt-serverTime)/1_000);
    visual.removeAfter=performance.now()+Math.max(0,projectile.expiresAt-Math.max(serverTime,estimatedServerNow))+NETWORK_PROJECTILE_EXPIRY_GRACE_MS;
    this.renderNetworkProjectilePrediction(visual);
  }

  private reconcileNetworkProjectiles(projectiles:readonly ProjectileSnapshot[],serverTime:number):void {
    const present=new Set<string>();
    for(const projectile of projectiles){present.add(projectile.projectileId);this.reconcileNetworkProjectile(projectile,serverTime);}
    const pendingIds=new Set(this.pendingNetworkProjectileShots.values());
    for(const [id,visual] of this.networkProjectiles)if(!present.has(id)&&!pendingIds.has(id)){this.releaseProjectileMesh(visual.mesh);this.networkProjectiles.delete(id);}
  }

  private updateNetworkProjectiles(delta:number):void {
    const now=performance.now();
    for(const [id,visual] of this.networkProjectiles){
      if(now>=visual.removeAfter){this.releaseProjectileMesh(visual.mesh);this.networkProjectiles.delete(id);for(const [shotId,pendingId] of this.pendingNetworkProjectileShots)if(pendingId===id)this.pendingNetworkProjectileShots.delete(shotId);continue;}
      visual.predictedSeconds=Math.min(visual.predictionLimitSeconds,visual.predictedSeconds+delta);
      this.renderNetworkProjectilePrediction(visual);
    }
  }

  private renderNetworkProjectilePrediction(visual:NetworkProjectileVisual):void {
    if(!this.archivalWinter&&visual.source){
      const frames=Math.floor(visual.predictedSeconds*30+1e-8);
      const geometryToken=visual.source.weapon==='launcher'&&frames>0?this.arena?.runtime?.geometry?.movementSnapshotIdentity:undefined;
      let source:OriginalProjectileState;
      if(visual.source.weapon==='launcher'&&geometryToken){
        const prediction=visual.launcherPrediction??=new OriginalLauncherPrediction();
        source=prediction.predict(visual.source,geometryToken,frames,this.stepNetworkLauncherPrediction);
      }else{
        source={...visual.source,position:{...visual.source.position},velocity:{...visual.source.velocity},direction:{...visual.source.direction},...(visual.source.angular?{angular:cloneOriginalAngularBody(visual.source.angular)}:{})};
        for(let i=0;i<frames;i++){const result=stepOriginalProjectile(source,{radius:this.originalProjectileRadius(source.weapon),sweep:(from,to,radius)=>this.sweepOriginalProjectile(from,to,radius),sweepConvex:(from,to,shape,surfaceVelocity)=>this.sweepOriginalConvex(from,to,shape,false,surfaceVelocity)});this.presentNetworkOriginalPuff(visual,source,result.detonated,Math.max(0,frames-i-1));if(result.detonated)break;}
      }
      visual.mesh.position.copy(source.position);visual.velocity.copy(source.velocity);this.orientProjectileMesh(visual.mesh,new THREE.Vector3().copy(source.direction),source.sourceRotation,source.angular);return;
    }
    visual.mesh.position.copy(visual.authoritativePosition);visual.velocity.copy(visual.authoritativeVelocity);
    let remaining=visual.predictedSeconds;
    while(remaining>1e-8){
      const step=Math.min(NETWORK_PROJECTILE_STEP_SECONDS,remaining);
      if(visual.weapon==='launcher')visual.velocity.y-=NETWORK_PROJECTILE_GRAVITY*step;
      SCRATCH_MOVEMENT.copy(visual.velocity).multiplyScalar(step);
      const distance=SCRATCH_MOVEMENT.length();
      if(distance>1e-8){
        SCRATCH_DIRECTION.copy(SCRATCH_MOVEMENT).multiplyScalar(1/distance);
        const hit=this.raycastWorld(visual.mesh.position,SCRATCH_DIRECTION,distance);
        if(hit){visual.mesh.position.addScaledVector(SCRATCH_DIRECTION,Math.max(0,hit.distance-.01));visual.velocity.set(0,0,0);break;}
        visual.mesh.position.add(SCRATCH_MOVEMENT);
      }
      remaining-=step;
    }
    if(visual.velocity.lengthSq()>1e-8)visual.mesh.quaternion.setFromUnitVectors(SCRATCH_UP,SCRATCH_DIRECTION.copy(visual.velocity).normalize());
  }

  private readonly stepNetworkLauncherPrediction=(source:OriginalProjectileState)=>stepOriginalProjectile(source,{
    radius:this.originalProjectileRadius('launcher'),
    sweep:(from,to,radius)=>this.sweepOriginalProjectile(from,to,radius),
    sweepConvex:(from,to,shape,surfaceVelocity)=>this.sweepOriginalConvex(from,to,shape,false,surfaceVelocity),
  });

  private presentNetworkOriginalPuff(visual:NetworkProjectileVisual,source:OriginalProjectileState,terminal:boolean,ageCallbacks=0):void {
    if(source.weapon!=='rpg'||source.remainingCallbacks>=(visual.puffRemainingCallbacks??200)||visual.puffTerminal)return;
    this.originalCombatEffectPresentation?.spawnPuff(source.position,this.playerAlive?this.camera.position:null,Math.random,undefined,ageCallbacks,performance.now()/1000);
    visual.puffRemainingCallbacks=source.remainingCallbacks;
    if(terminal)visual.puffTerminal=true;
  }

  private estimatedNetworkServerNow(referenceServerTime:number):number {
    const serverNow=this.network?.estimatedServerTimeMs;
    // Client and server epoch clocks can differ arbitrarily. Until ping/pong has
    // measured that offset, leave the visual at the authoritative sample rather
    // than misreading clock skew as latency.
    return serverNow===undefined?referenceServerTime:Math.max(referenceServerTime,serverNow);
  }

  private createProjectileMesh(weapon:'launcher'|'rpg'):THREE.Mesh {
    const collection=!this.archivalWinter?this.originalWeapons:undefined;
    const resource=collection?.resources.get(weapon==='rpg'?'rpgrocket':'rg6grenade');
    if(collection&&resource){
      if(!this.originalProjectileModelPool)this.originalProjectileRocketMaterial=collection.resources.get('rpgrocket')?.material;
      const pool=this.originalProjectileModelPool??=new OriginalProjectileModelPool(family=>{
        const source=collection.resources.get(family==='rpg'?'rpgrocket':'rg6grenade');
        if(!source)throw Error('Original projectile resource missing');
        const mesh=new THREE.Mesh(source.geometry,source.material);mesh.name=`original-flight-${family}`;mesh.userData.sourceProjectile=true;mesh.userData.sourceProjectileWeapon=family;return mesh;
      });
      const mesh=pool.acquire(weapon);
      // rockets.new assigns shady("rpg") on every birth; grenades.new retains
      // the recycled model's shader. Capture the first scene resource binding.
      if(weapon==='rpg'&&this.originalProjectileRocketMaterial)mesh.material=this.originalProjectileRocketMaterial;
      (this.originalProjectileModelOwners??=new Map()).set(mesh,pool);
      mesh.visible=true;mesh.matrixAutoUpdate=true;mesh.matrixWorldNeedsUpdate=true;
      return mesh;
    }
    return new THREE.Mesh(weapon==='rpg'?this.projectileRocketGeometry:this.projectileShellGeometry,this.projectileShellMaterial);
  }

  private releaseProjectileMesh(mesh:THREE.Mesh):void {
    const owner=this.originalProjectileModelOwners?.get(mesh);
    if(owner){this.originalProjectileModelOwners.delete(mesh);if(owner.hasLease(mesh))owner.release(mesh);return;}
    // A source mesh with no captured lease can be a stale reference to a
    // handle already returned and reused by another presenter.
    if(mesh.userData.sourceProjectile)return;
    mesh.removeFromParent();
  }

  /** A scene reset returns all local/network leases before clearing FIFO state. */
  private resetOriginalProjectileModels():void {
    const committed=this.soloProjectilePresentation;this.soloProjectilePresentation=undefined;committed?.adapter.dispose();
    for(const projectile of this.projectiles??[])this.releaseProjectileMesh(projectile.mesh);
    if(this.projectiles)this.projectiles.length=0;
    for(const visual of this.networkProjectiles?.values()??[])this.releaseProjectileMesh(visual.mesh);
    this.networkProjectiles?.clear();this.pendingNetworkProjectileShots?.clear();
    this.originalProjectileModelPool?.reset();
  }

  private orientProjectileMesh(mesh:THREE.Mesh,direction:THREE.Vector3,sourceRotation?:Readonly<Vec3>,angular?:OriginalAngularBody):void {
    if(mesh.userData.sourceProjectile&&(sourceRotation||mesh.userData.sourceProjectileWeapon==='launcher')){
      const basis=sourceRotation?originalRpgBasisFromSourceRotation(sourceRotation):originalGrenadeBasisFromDirection(direction);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().copy(basis.x),new THREE.Vector3().copy(basis.y),new THREE.Vector3().copy(basis.z)));
      if(angular){const q=angular.orientation;mesh.quaternion.premultiply(new THREE.Quaternion(q.x,q.y,q.z,q.w));}return;
    }
    // Recovered rocket geometry extends along local negative X. Preserve its
    // pivot and off-axis offset rather than recentering its source vertices.
    mesh.quaternion.setFromUnitVectors(mesh.userData.sourceProjectile?new THREE.Vector3(-1,0,0):SCRATCH_UP,direction);
  }

  private createNetworkProjectileVisual(weapon:'launcher'|'rpg'):NetworkProjectileVisual {
    const mesh=this.createProjectileMesh(weapon);
    mesh.castShadow=this.enhancedRendering;this.scene.add(mesh);
    return {
      mesh,
      authoritativePosition:new THREE.Vector3(),
      authoritativeVelocity:new THREE.Vector3(),
      velocity:new THREE.Vector3(),
      weapon,
      lastServerTime:-Infinity,
      predictedSeconds:0,
      predictionLimitSeconds:0,
      removeAfter:Infinity,
    };
  }

  private predictNetworkProjectile(shotId:string,weapon:'launcher'|'rpg',origin:THREE.Vector3,direction:THREE.Vector3,sourceRotation?:Vec3):void {
    const id=`pending:${shotId}`;const visual=this.createNetworkProjectileVisual(weapon);
    if(!this.archivalWinter){
      visual.source=createOriginalProjectile(weapon,origin,direction,this.network?.clientId??'player',sourceRotation);
      visual.authoritativePosition.copy(visual.source.position);visual.authoritativeVelocity.copy(visual.source.velocity);visual.predictionLimitSeconds=MAX_PROJECTILE_EXTRAPOLATION_MS/1000;
      visual.removeAfter=performance.now()+PENDING_PROJECTILE_TIMEOUT_MS;this.networkProjectiles.set(id,visual);this.pendingNetworkProjectileShots.set(shotId,id);this.networkEffectCounts.predictions++;this.renderNetworkProjectilePrediction(visual);return;
    }
    const clearanceHit=this.raycastWorld(origin,direction,NETWORK_PROJECTILE_SPAWN_CLEARANCE);
    if(clearanceHit){
      visual.authoritativePosition.copy(origin).addScaledVector(direction,Math.max(0,clearanceHit.distance-.01));
      visual.authoritativeVelocity.set(0,0,0);visual.predictionLimitSeconds=0;
    }else{
      visual.authoritativePosition.copy(origin).addScaledVector(direction,NETWORK_PROJECTILE_SPAWN_CLEARANCE);
      visual.authoritativeVelocity.copy(direction).multiplyScalar(NETWORK_PROJECTILE_SPEED[weapon]);
      visual.predictionLimitSeconds=MAX_PROJECTILE_EXTRAPOLATION_MS/1_000;
    }
    visual.removeAfter=performance.now()+PENDING_PROJECTILE_TIMEOUT_MS;
    this.networkProjectiles.set(id,visual);this.pendingNetworkProjectileShots.set(shotId,id);this.networkEffectCounts.predictions++;this.renderNetworkProjectilePrediction(visual);
  }

  private clearPendingNetworkProjectiles():void {
    for(const id of this.pendingNetworkProjectileShots.values()){const visual=this.networkProjectiles.get(id);if(visual)this.releaseProjectileMesh(visual.mesh);this.networkProjectiles.delete(id);}
    this.pendingNetworkProjectileShots.clear();
  }

  private clearNetworkProjectiles():void {
    this.predictedSourceHitHurts?.clear();
    this.originalExplosionPresentation?.clear();this.networkExplosionIds?.clear();
    this.originalCombatEffectPresentation?.clear();
    for(const visual of this.networkProjectiles.values())this.releaseProjectileMesh(visual.mesh);
    this.networkProjectiles.clear();this.pendingNetworkProjectileShots.clear();this.handledNetworkShots.clear();this.handledNetworkProjectileSpawns.clear();this.handledNetworkExplosions.clear();this.handledNetworkRG6Boosts.clear();this.networkBoostStartedAt=undefined;this.handledNetworkDamageEvents.clear();this.handledNetworkEliminations.clear();this.creditedExplosiveShots.clear();
    this.networkEffectCounts.predictions=0;this.networkEffectCounts.adoptions=0;this.networkEffectCounts.projectileSpawns=0;this.networkEffectCounts.explosions=0;this.networkEffectCounts.damageEvents=0;this.networkEffectCounts.eliminations=0;
  }

  private rememberNetworkKey(set:Set<string>,key:string,limit=256):boolean {
    if(set.has(key))return false;set.add(key);
    while(set.size>limit){const oldest=set.values().next().value as string|undefined;if(oldest===undefined)break;set.delete(oldest);}
    return true;
  }

  private pause(): void {
    if(this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)return;
    if (this.phase !== 'playing') return;
    this.networkBoostStartedAt=undefined;this.invalidateImmersiveCapture();this.soloWorlds?.freeze(this.elapsed);this.phase='paused';this.pauseStarted=this.elapsed;this.releaseActiveInput();this.releaseKeyboardCapture();byId('pause').classList.remove('hidden');
    // Fullscreen owns keyboard capture on engines without navigator.keyboard;
    // leaving it is the portable way to release every reserved key on pause.
    if(document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined);
  }

  private resume(): void {
    if(this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)return;
    if (this.phase !== 'paused') return;
    if(this.registeredReferenceAspect!=null){this.registeredReferenceAspect=null;this.camera.up.set(0,1,0);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.viewCamera.aspect=this.camera.aspect;this.viewCamera.updateProjectionMatrix();}
    const now=performance.now()/1000;
    // Offline simulation freezes while paused; online time remains the server's
    // wall clock, including pauses, so authoritative events and the round timer agree.
    if(this.mode==='solo')this.shiftDeadlines(Math.max(0,now-this.pauseStarted));this.elapsed=now;this.soloWorlds?.resume(now);
    byId('pause').classList.add('hidden'); this.phase='playing'; this.clock.getDelta(); this.audio.resume();
    this.enterImmersiveMode();
  }

  private keyDown(event: KeyboardEvent): void {
    if(!this.archivalWinter&&this.phase==='playing'&&this.playerAlive&&event.code==='Escape'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
      event.preventDefault();this.requestSourceEscape();return;
    }
    if(this.chatOpen){
      // Source keyPressed polls physical state even when typing gates its action.
      // Record only polled controls; browser chords must not synthesize input.
      if(!this.archivalWinter&&this.arena?.runtime&&this.phase==='playing'&&!event.metaKey&&!event.altKey&&(!event.ctrlKey||event.code==='ControlLeft'||event.code==='ControlRight')&&
        ['KeyW','KeyS','KeyA','KeyD','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyR','ShiftLeft','ShiftRight','ControlLeft','ControlRight','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6'].includes(event.code))this.keys.add(event.code);
      if(isBrowserShortcut(event)&&!['KeyA','KeyC','KeyV','KeyX','KeyZ','KeyY'].includes(event.code)){event.preventDefault();event.stopImmediatePropagation();}
      if(event.code==='Escape'||(!this.archivalWinter&&event.code==='Tab'&&!event.ctrlKey&&!event.metaKey&&!event.altKey)){event.preventDefault();this.closeChat();}
      if(!this.archivalWinter&&event.code==='Backspace'&&byId<HTMLInputElement>('chat-input').value.length===0){
        event.preventDefault();this.sourceTalkPrefix=(this.sourceTalkPrefix??ORIGINAL_TALK_PREFIX).slice(0,ORIGINAL_TALK_BACKSPACE_MIN_CHARACTERS);
        byId('chat-label').textContent=this.sourceTalkPrefix;byId<HTMLInputElement>('chat-input').maxLength=ORIGINAL_TALK_MAX_CHARACTERS-this.sourceTalkPrefix.length;
      }
      return;
    }
    if(this.phase==='playing'&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&['Tab','Enter','KeyT'].includes(event.code)){event.preventDefault();this.openChat();return;}
    if(!this.archivalWinter&&this.phase==='playing'&&this.playerAlive&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.code==='KeyM'){
      event.preventDefault();if(!event.repeat)this.showCurrentMembers();return;
    }
    // The source polls controlDown as a firing input. A standalone modifier
    // is physical state, while Ctrl+another key remains a browser shortcut.
    if(!this.archivalWinter&&this.arena?.runtime&&this.phase==='playing'&&this.playerAlive&&!event.metaKey&&!event.altKey&&
      (event.code==='ControlLeft'||event.code==='ControlRight')){this.keys.add(event.code);return;}
    // Keyboard Lock captures browser-reserved keys in supporting browsers. Keep
    // this broad DOM fallback too: it covers every Ctrl/Cmd/Alt chord instead of
    // trying to maintain a fragile list of close, reload, tab, zoom and devtools
    // shortcuts. Operating-system chords such as Alt+Tab remain OS-controlled.
    if ((this.phase === 'playing' || this.phase === 'paused') && isBrowserShortcut(event)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (this.phase === 'playing') this.setMessage(this.archivalWinter?'BROWSER SHORTCUT BLOCKED · ESC TO PAUSE':'BROWSER SHORTCUT BLOCKED · ESC GIVES UP', 1.4);
      return;
    }
    this.keys.add(event.code);
    if(this.phase==='playing'&&this.arrowMovement&&event.code.startsWith('Arrow'))event.preventDefault();
    if(this.phase==='playing')this.aiming=aimingHeld(this.controlsPreset,this.keys,!this.archivalWinter&&this.controlsPreset==='legacy'?false:this.rightMouseAiming,this.weaponState.current);
    // Movement remains held in the key set, but gameplay actions are edges.
    // Native repeat events must not drain grenades, auto-jump, or continuously
    // restart weapon equip/network synchronization.
    if(event.repeat)return;
    if (event.code === 'Escape' && this.phase === 'playing') { event.preventDefault(); this.pause(); document.exitPointerLock(); return; }
    if (event.code === 'Escape' && this.phase === 'paused') this.resume();
    if (this.phase !== 'playing' || !this.playerAlive) return;
    if(!this.archivalWinter&&event.code.startsWith('Digit'))return;
    if (event.code === 'Digit1') this.switchWeapon('pistol');
    if (event.code === 'Digit2') this.switchWeapon('shotgun');
    if (event.code === 'Digit3') this.switchWeapon('rifle');
    if (event.code === 'Digit4') this.switchWeapon('launcher');
    if (event.code === 'Digit5') this.switchWeapon('rpg');
    if (event.code === 'Digit6') this.switchWeapon('sniper');
    if (event.code === 'KeyR'&&this.archivalWinter) this.reload();
    if (event.code === 'KeyG'&&this.controlsPreset==='modern'&&this.mode==='solo') this.throwGrenade();
    if (this.archivalWinter && event.code === 'Space' && this.grounded) { this.velocity.y=5.4; this.grounded=false; }
  }

  private mouseMove(event: MouseEvent): void {
    const sourceRuntime=!this.archivalWinter&&!!this.arena?.runtime;
    if ((this.chatOpen&&!sourceRuntime) || this.phase !== 'playing' || !this.playerAlive || document.pointerLockElement !== this.renderer.domElement) return;
    if(!this.archivalWinter&&this.arena.runtime){
      const mouse=this.originalMouseDelta??={x:0,y:0};mouse.x+=event.movementX;mouse.y+=event.movementY;return;
    }
    const factor = .00165 * this.sensitivity * (this.aiming ? .45 : 1);
    this.yaw -= event.movementX * factor; this.pitch -= event.movementY * factor;
    this.weaponSwayX=THREE.MathUtils.clamp(this.weaponSwayX-event.movementX*.00042,-.045,.045);this.weaponSwayY=THREE.MathUtils.clamp(this.weaponSwayY-event.movementY*.00034,-.035,.035);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI*.47, Math.PI*.47);
    // Mouse and button events can land before the next animation frame. Keep
    // the ballistic quaternion current so a click in that window follows the
    // crosshair instead of firing along the previous frame's aim.
    this.camera.rotation.set(this.pitch+this.recoil,this.yaw,0,'YXZ');
  }

  private mouseDown(event: MouseEvent): void {
    if(this.chatOpen){
      // Source keytalk continues owning input while its recentered mouse is
      // captured. A canvas click must not blur the browser talk field.
      if(!this.archivalWinter&&this.arena.runtime&&this.phase==='playing'&&this.playerAlive&&document.pointerLockElement===this.renderer.domElement){
        event.preventDefault();
        // mouseDown/rightMouseDown are polled physical levels. Talk suppresses
        // their actions in the callbacks, rather than releasing either button.
        if(event.button===0)this.firing=true;
        if(event.button===2)this.rightMouseAiming=true;
      }
      return;
    }
    if (this.phase !== 'playing' || !this.playerAlive) return;
    if (document.pointerLockElement !== this.renderer.domElement) { this.requestPointerCapture(); return; }
    if (event.button === 0) { this.firing=true; if(this.archivalWinter)this.tryFire(); }
    if (event.button === 2) {this.rightMouseAiming=true;this.aiming=aimingHeld(this.controlsPreset,this.keys,!this.archivalWinter&&this.controlsPreset==='legacy'?false:true,this.weaponState.current);}
  }

  private switchWeapon(id: WeaponId): void {
    if(this.hasCommittedSoloLoadout())return;
    if (this.archivalWinter&&this.weaponState.reloading) return;
    if(!this.weaponState.select(id))return;
    this.aiming=aimingHeld(this.controlsPreset,this.keys,!this.archivalWinter&&this.controlsPreset==='legacy'?false:this.rightMouseAiming,id);
    this.syncWeaponPresentation(id,true);
    if(this.mode==='online'){if(this.archivalWinter)this.onlineWeaponReadyAt=performance.now()+120;this.publishNetworkTransform();if(!this.archivalWinter&&this.network?.connected)this.network.flushTransform();}
    if(this.archivalWinter)this.audio.play('ui',.6); this.updateHud();
  }

  private syncWeaponPresentation(id:WeaponId,animateEquip:boolean):void {
    if(this.currentSoloLocalWeaponPresentation())return;
    if(!this.archivalWinter)this.sourceDisplayedWeapon=id;
    for (const [key, model] of this.weaponModels) model.visible = key === id;
    for (const metadata of this.weaponMetadata.values()) this.restoreViewModelParts(metadata);
    if(this.originalWeaponPresentation){
      this.originalWeaponPresentation.equip(id);
      if(!animateEquip)this.originalWeaponPresentation.sourcePosition.fromArray(ORIGINAL_WEAPON_POSES[id].rest);
      this.originalWeaponPresentation.update(0,0,this.weaponModels.get(id)!.position);
      // weaponry.whichgun reparents the RPG rocket even with an empty chamber.
      if(id==='rpg')this.originalWeapons?.setLoaded('rpg',true);
      if(id!=='sniper')closeOriginalScope(this.originalScopeState??=createOriginalScope());
      this.originalScopeActive=this.originalScopeState?.active??false;this.originalScopeFov=this.originalScopeState?.fov??50;
    }
    this.equipStartedAt=animateEquip?this.elapsed:-10;this.legacyRifleRefillStartedAt=-10;this.viewActionPulse=0;this.muzzleFlashRemaining=0;
    this.viewRecoilPosition.set(0,0,0);this.viewRecoilRotation.set(0,0,0);
  }

  private weaponAnimationDebugState():WeaponAnimationDebugState|null {
    const source=this.originalWeapons?.models.get('rifle');
    if(source)return {position:source.position.toArray(),rotation:[source.rotation.x,source.rotation.y,source.rotation.z],magazinePosition:[],ammo:this.weaponState.ammo.rifle,reserve:this.weaponState.reserve.rifle,refillStartedAt:this.legacyRifleRefillStartedAt};
    const metadata=this.weaponMetadata.get('rifle');if(!metadata)return null;
    return {position:metadata.model.position.toArray(),rotation:[metadata.model.rotation.x,metadata.model.rotation.y,metadata.model.rotation.z],magazinePosition:metadata.parts.magazine?.position.toArray()??[],ammo:this.weaponState.ammo.rifle,reserve:this.weaponState.reserve.rifle,refillStartedAt:this.legacyRifleRefillStartedAt};
  }

  private reload(sourceCallback=false,predictAuthorityAutoReload=false,sourceSortAfterReload=false): boolean {
    if(this.hasCommittedSoloLoadout())return false;
    const weapon=this.weaponState.current,previousAmmo=this.weaponState.ammo[weapon],previousReserve=this.weaponState.reserve[weapon],previousReloading=this.weaponState.reloading,previousReloadEnd=this.weaponState.reloadEnd,previousUnarmed=this.weaponState.unarmed,previousCounter=this.weaponState.originalCounterState;
    if(!this.weaponState.startReload(this.elapsed,sourceCallback)){
      if(this.weaponState.current!==weapon||this.weaponState.unarmed){
        if(this.mode==='online'&&(!predictAuthorityAutoReload||sourceSortAfterReload)&&!(sourceSortAfterReload?this.network?.reload(weapon,true):this.network?.reload(weapon))){this.weaponState.current=weapon;this.weaponState.unarmed=previousUnarmed;return false;}
        if(!this.weaponState.unarmed)this.syncWeaponPresentation(this.weaponState.current,true);
        this.updateHud();
      }
      return false;
    }
    if(this.mode==='online'&&!predictAuthorityAutoReload&&!(sourceSortAfterReload?this.network?.reload(weapon,true):this.network?.reload(weapon))){
      this.weaponState.ammo[weapon]=previousAmmo;this.weaponState.reserve[weapon]=previousReserve;
      this.weaponState.reloading=previousReloading;this.weaponState.reloadEnd=previousReloadEnd;if(previousCounter)this.weaponState.applyOriginalCounter(previousCounter,this.elapsed);this.setMessage('WAITING FOR SERVER',.8);this.updateHud();return false;
    }
    if(!this.currentSoloLocalWeaponPresentation()){
      this.originalWeaponPresentation?.reload();
      if(!this.archivalWinter&&this.weaponState.current==='rpg')this.originalWeapons?.setLoaded('rpg',true);
    }
    if(!this.archivalWinter&&weapon==='rifle')this.legacyRifleRefillStartedAt=this.elapsed;
    if(this.archivalWinter)this.audio.play('reload');else this.playOriginalCombatSound(originalReloadSound(weapon),undefined,6);this.setMessage('RELOADING',this.weaponState.reloadEnd-this.elapsed);
    this.updateHud();return true;
  }

  // endgame.resetactors removes registration. Presentation disposal and native
  // mutation within an in-flight Director iteration remain unproved adapters.
  private soloWorlds?:OriginalSoloObserverWorlds;
  private soloLoadedSceneFactory?:OriginalSoloLoadedSceneFactory;
  private soloStartupResources?:OriginalSoloGameStartupResources;
  private soloPendingGameplayFrame?:SoloGameplayFrame;
  private soloCurrentCohortAt?:()=>OriginalSoloCurrentCohort;
  private soloCurrentWork?:Promise<void>;
  private soloPickupStore?:IndexedDBOriginalPickupBatchStore;
  private soloPickupOwner?:OriginalSoloPickupOwner;
  private soloPickupStorageFactory?:IDBFactory;
  private soloPickupDatabase?:{name:string;factory:IDBFactory};
  private soloPickupStartup?:Promise<OriginalSoloObserverWorlds>;
  private soloPickupRosterWork?:Promise<void>;
  private soloPickupClosing?:Promise<void>;
  private soloPickupPreservePresentation?:boolean;
  private soloPickupAdopting=false;
  private soloPickupCancelling=false;
  private soloPickupFailed=false;
  private soloPickupFailure?:unknown;
  private soloPickupRetirements?:Map<string,number>;
  private get soloCurrentPending():boolean {return !!this.soloCurrentWork||!!this.soloPendingGameplayFrame?.deliveryFailed||(!this.soloPickupAdopting&&!!this.soloPickupStartup)||!!this.soloPickupRosterWork||!!this.soloPickupClosing||this.soloPickupCancelling||this.soloPickupFailed;}
  private soloHumanCallbackInput?:{readonly world:OriginalSoloObserver;readonly input:OriginalSoloHumanCallbackInput};

  /** Bind actual borrowed projectile resources explicitly for one registered
   * human life. Material labels are supplied by the factory, never inferred
   * from a checkpoint. Rendering starts only after a committed state exists. */
  bindSoloProjectilePresentation(world:OriginalSoloObserver,options:Omit<OriginalReceiverProjectilePresentationOptions,'sceneGeneration'>):void {
    if(!this.isSourceSolo()||world.id!=='player'||!world.alive||this.soloWorlds?.worlds.get('player')!==world||!this.originalWeapons)throw Error('Invalid Solo projectile presentation life');
    if(this.soloProjectilePresentation?.world===world)throw Error('Solo projectile presentation already bound');
    const adapter=new OriginalReceiverProjectilePresentation(this.originalWeapons,this.scene,{...options,sceneGeneration:world.lifeGeneration});
    try{if(world.projectileState)adapter.adopt(world.projectileState.prefix,world.projectileState);}
    catch(error){try{adapter.dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Solo projectile binding failed');}throw error;}
    const previous=this.soloProjectilePresentation;this.soloProjectilePresentation={world,adapter};
    const errors:unknown[]=[];
    try{previous?.adapter.dispose();}catch(error){errors.push(error);}
    if(world.projectileState)try{this.retireLegacySoloProjectiles();}catch(error){errors.push(error);}
    if(errors.length)throw new AggregateError(errors,'Solo projectile binding handoff failed');
  }

  private hasCommittedSoloProjectiles():boolean {
    const owner=this.soloProjectilePresentation;
    if(!owner)return false;
    if(!this.isSourceSolo()||!owner.frozen&&this.soloWorlds?.worlds.get('player')!==owner.world){
      this.soloProjectilePresentation=undefined;owner.adapter.dispose();return false;
    }
    return !!owner.adapter.freeze();
  }

  private adoptCommittedSoloProjectiles(world:OriginalSoloObserver,checkpoint:NonNullable<OriginalSoloObserver['projectileState']>):void {
    const owner=this.soloProjectilePresentation;
    if(!owner||owner.frozen||owner.world!==world||checkpoint!==world.projectileState)return;
    owner.adapter.adopt(checkpoint.prefix,checkpoint);
    this.retireLegacySoloProjectiles();
  }

  private retireLegacySoloProjectiles():void {
    // The committed catalog owns every clone and retained offworld handle.
    // Release legacy visual leases only after the first successful adoption.
    const errors:unknown[]=[];
    for(let i=0;i<(this.projectiles?.length??0);){
      const projectile=this.projectiles[i];if(!projectile.soloId){i++;continue;}
      try{this.releaseProjectileMesh(projectile.mesh);}catch(error){errors.push(error);}
      this.projectiles.splice(i,1);
    }
    if(errors.length)throw new AggregateError(errors,'Solo projectile renderer handoff failed');
  }

  /** The configured CURRENT factory calls this after completed goody movement,
   * before gun evaluation. Both bank hooks share this single detached capture;
   * a retry at the same prefix never rereads renderer, controls or body velocity.
   * This human binding supplies no bot AI, local model inventory or RNG policy. */
  readSoloHumanCallbackInput(context:OriginalSoloReceiverCurrentContext,prefix:ReceiverScenePrefix):OriginalSoloHumanCallbackInput {
    validateReceiverScenePrefix(prefix);
    const world=this.soloWorlds?.worlds.get('player');
    if(!this.isSourceSolo()||this.phase!=='playing'||!this.playerAlive||!world||!world.alive||!context
      ||context.id!=='player'||context.name!==world.name||context.observer!==world||context.target!==world||context.lifeGeneration!==world.lifeGeneration
      ||context.body!==world.body||context.health!==world.health||context.barrels!==world.barrels||context.doors!==world.doors
      ||context.projectiles!==world.projectiles||context.blasts!==world.blasts||context.actorNames!==world.actorNames||!context.alive
      ||context.deliveryKind!=='where'||context.phase!=='physics'||!context.afterGoody
      ||context.mirrorCallback!==world.callback||context.physicalCallback!==context.mirrorCallback+1
      ||prefix.kind!=='callback'||prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==context.physicalCallback
      ||context.order.callbacks!==prefix.callback||context.order.receiptCallbacks!==context.mirrorCallback
      ||context.time!==world.updatedAt)throw Error('Human Solo input requires the actual living CURRENT callback');
    const previous=this.soloHumanCallbackInput;
    if(previous?.world===world&&previous.input.prefix.callback===prefix.callback)return previous.input;
    if(!(this.camera instanceof THREE.Camera)||!(this.originalWeapons?.resources instanceof Map))throw Error('Human Solo input resources unavailable');
    const resources=this.originalWeapons.resources;
    const weaponModelPresent={pistol:resources.get('pistol') instanceof THREE.Mesh,shotgun:resources.get('spas12') instanceof THREE.Mesh,
      rifle:resources.get('ak47') instanceof THREE.Mesh,launcher:resources.get('rg6') instanceof THREE.Mesh,
      rpg:resources.get('rpg') instanceof THREE.Mesh,sniper:resources.get('dragunov') instanceof THREE.Mesh};
    this.camera.updateWorldMatrix(true,false);
    const input=captureOriginalSoloHumanCallbackInput({prefix,cameraWorldMatrix:this.camera.matrixWorld.elements,
      velocityWorld:world.body.velocity,pitchRadians:this.pitch,yawRadians:this.yaw,typing:this.chatOpen,firing:this.firing,
      keys:this.keys,sourceScopeEnabled:this.controlsPreset==='legacy',weaponModelPresent});
    this.soloHumanCallbackInput={world,input};return input;
  }

  /** Capture one operation-time bullet invocation from the actual human life.
   * The configured factory owns retry reuse; no query, damage, RNG or renderer
   * write occurs here. Logical aim remains separate from the muzzle pose. */
  readSoloHumanHitscanAction(context:OriginalSoloReceiverCurrentContext,request:OriginalSoloGunHitscanCapture,preview:ReceiverLocalWeaponWorldCheckpoint) {
    const input=this.readSoloHumanCallbackInput(context,request.checkpoint.prefix);
    return captureOriginalSoloHumanHitscan(context,input,request,preview,{sourceScale:this.arena.runtime!.scale,bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,maxModels:8,maxTextChars:65536});
  }

  private soloCorpses=new Map<number,OriginalSoldier>();
  private soloModelPresentation?:OriginalSoloModelPresentation;
  private soloReceiverModels?:{world:OriginalSoloObserver;presentation:OriginalReceiverModelPresentation;frozen?:boolean};
  private soloReceiverTransients?:{world:OriginalSoloObserver;presentation:OriginalReceiverTransientPresentation;frozen?:boolean};
  private hasCommittedSoloTransients():boolean {return this.isSourceSolo()&&!!this.soloReceiverTransients;}
  private soloReceiverPickupBindings:readonly Readonly<OriginalReceiverPickupBinding|OriginalReceiverPickupModelBinding>[]=[];
  private hasCommittedSoloModels():boolean {return !!this.soloReceiverModels;}
  private soloDetachedFlashes:DetachedSourceFlashes[]=[];
  private soloPickupCapture:WeaponDrop[]=[];
  private soloBotShots:OriginalSoloBotShotCapture[]=[];
  private soloBotShotSequence=0;

  /** Speculative callback readers borrow issued triggers without retiring them.
   * The jointly committed producer event below is the only retirement boundary. */
  readSoloBotProjectileShots(context:OriginalSoloReceiverCurrentContext):readonly OriginalSoloBotShotCapture[] {
    const world=this.soloWorlds?.worlds.get(context?.id);
    if(!this.isSourceSolo()||this.phase!=='playing'||!world||context.id==='player'||world!==context.observer||context.target!==world||world.lifeGeneration!==context.lifeGeneration||context.name!==world.name||context.body!==world.body||context.health!==world.health||context.barrels!==world.barrels||context.doors!==world.doors||context.projectiles!==world.projectiles||context.blasts!==world.blasts||context.actorNames!==world.actorNames||!context.alive||!world.alive||context.deliveryKind!=='where'||!context.afterGoody||context.phase!=='physics'||context.mirrorCallback!==world.callback||context.physicalCallback!==world.callback+1||context.receiptTick!==world.receiptTick||context.time!==world.updatedAt||context.order.callbacks!==world.callback+1||context.order.receiptCallbacks!==world.callback)throw Error('Invalid Solo bot projectile callback context');
    if(this.soloBotShots.length>64)throw Error('Solo bot projectile trigger budget exceeded');
    const shots:OriginalSoloBotShotCapture[]=[];
    for(const shot of this.soloBotShots){if(!isOriginalSoloBotShotCapture(shot))throw Error('Invalid Solo bot projectile trigger');if(shot.ownerId===world.id&&shot.ownerLife===world.lifeGeneration)shots.push(shot);}
    let sequence=world.botProjectileSequence??0;
    for(const shot of shots){if(!isOriginalSoloBotShotCapture(shot)||shot.weapon!=='launcher'&&shot.weapon!=='rpg'||shot.sequence<=sequence)throw Error('Invalid Solo bot projectile trigger');sequence=shot.sequence;}
    return Object.freeze(shots);
  }

  private isSourceSolo():boolean {return !this.archivalWinter&&this.mode==='solo'&&!!this.arena?.runtime;}
  private hasCommittedSoloLoadout():boolean {return this.isSourceSolo()&&!!this.soloWorlds?.worlds.get('player')?.loadout;}

  /** Capture installed renderer resources once for a fresh private life. The
   * flattened camera ancestry is the explicit copy parent policy; immutable
   * geometry/materials remain borrowed from the loaded application packs. */
  private readSoloStartupBanks(registration:OriginalSoloReceiverSceneContext,context:OriginalSoloReceiverCurrentContext):OriginalSoloLoadedBanksChoice {
    const runtime=this.arena.runtime!,collection=this.originalWeapons;
    if(!collection||context.body!==registration.body)throw Error('Solo startup bank resources unavailable');
    const camera=this.enhancedRendering?this.viewCamera:this.camera;
    camera.updateWorldMatrix(true,true);this.viewModel.updateWorldMatrix(true,true);
    for(const mesh of collection.resources.values())mesh.updateWorldMatrix(true,false);
    const weapon=registration.id==='player'?'launcher':context.weapon;
    if(!weapon)throw Error('Solo bot startup selection unavailable');
    const handles:ReceiverLocalWeaponHandle[]=['pistol','spas12','ak47','rg6','rpg','dragunov','rocket'];
    const selected:Record<WeaponId,ReceiverLocalWeaponHandle>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
    const membership=Object.fromEntries(handles.map(handle=>[handle,handle===selected[weapon]||handle==='rocket'&&weapon==='rpg'&&collection.rocket.visible])) as Record<ReceiverLocalWeaponHandle,boolean>;
    const ancestry={pistol:['private-camera'],spas12:['private-camera'],ak47:['private-camera'],rg6:['private-camera'],rpg:['private-camera'],dragunov:['private-camera'],rocket:['rpg','private-camera']};
    const [x,y,z]=ORIGINAL_WEAPON_LOAD_POSITION;
    const banks={map:this.mapId,sceneGeneration:registration.lifeGeneration,sourceScale:runtime.scale,renderToWorld:new THREE.Matrix4().elements,
      cameraHandle:'private-camera',cameraWorldMatrix:camera.matrixWorld.elements,initialGunPositionSource:{x,y,z},initialLoadedRocket:collection.rocket.visible,
      membership,ancestry,followOffworldParents:true,parentRestoresMembership:true,grenadeMaterialHandle:'installed-grenade',grenadeAncestry:[],rocketMaterialHandle:'installed-rpg',
      maxCommands:256,maxTextChars:65536,maxProjectileModels:128,maxProjectileActors:64};
    return registration.id==='player'?{kind:'human',banks:{...banks,score:Number.isSafeInteger(this.score)?this.score:0,goldScore:0,maxReportNames:64}}:{kind:'bot',banks:{...banks,weapon}};
  }

  private ensureSoloWorlds():OriginalSoloObserverWorlds|undefined {
    if(this.soloTeardown||this.soloPickupCancelling||this.soloPickupFailed||!this.isSourceSolo()||!this.playerAlive)return undefined;
    if(this.soloWorlds)return this.soloWorlds;
    if(!this.soloPickupStartup)void this.initializeSoloWorldsAsync().catch(()=>{/* Failure remains owned and blocks automatic retry. */});
    return undefined;
  }
  /** Real browser storage is mandatory for normal Solo startup. */
  initializeSoloWorldsAsync(factory?:IDBFactory):Promise<OriginalSoloObserverWorlds> {
    if(this.soloPickupStartup)return this.soloPickupStartup;
    if(this.soloPickupClosing)return this.soloPickupClosing.then(()=>this.initializeSoloWorldsAsync(factory));
    if(this.soloPickupFailed)return this.disposeSoloWorldsAsync(false).then(()=>this.initializeSoloWorldsAsync(factory));
    if(this.soloWorlds)return Promise.resolve(this.soloWorlds);
    if(this.soloTeardown||!this.isSourceSolo()||!this.playerAlive)return Promise.reject(Error('Solo paged startup is inactive'));
    if(this.soloReceiverModels||this.soloReceiverTransients||this.soloLocalWeaponPresentation||this.soloProjectilePresentation||this.soloStartupResources||this.soloLoadedSceneFactory||this.soloDetachedFlashes?.length)return this.disposeSoloWorldsAsync(false).then(()=>this.initializeSoloWorldsAsync(factory));
    this.soloPickupCancelling=false;this.soloPickupFailed=false;this.soloPickupFailure=undefined;
    const work=(async()=>{
      const selected=factory??this.soloPickupStorageFactory??globalThis.indexedDB;
      if(!selected)throw Error('Solo pickup IndexedDB storage unavailable');
      const name=`solo-${globalThis.crypto.randomUUID()}`;this.soloPickupDatabase={name,factory:selected};
      const store=await openOriginalPickupBatchStore({databaseName:name,factory:selected,initial:{version:0,observers:[]}});
      this.soloPickupStore=store;const owner=new OriginalSoloPickupOwner(store,'game');this.soloPickupOwner=owner;
      if(this.soloPickupCancelling)throw Error('Solo pickup startup cancelled');
      const ids=['player',...(this.enemies??[]).filter(enemy=>enemy.alive).map(enemy=>enemy.id)];
      if(ids.length>64||new Set(ids).size!==ids.length)throw Error('Solo pickup startup population exceeds capacity');
      for(const id of ids){await owner.registerLife(id,1);if(this.soloPickupCancelling)throw Error('Solo pickup startup cancelled');}
      this.soloCurrentCohortAt=()=>owner.createCohort();this.soloPickupAdopting=true;
      try{const worlds=this.createSoloWorldsSync();if(!worlds)throw Error('Solo pickup startup lost its active world');return worlds;}
      finally{this.soloPickupAdopting=false;}
    })();this.soloPickupStartup=work;
    const settle=()=>{if(this.soloPickupStartup===work)this.soloPickupStartup=undefined;};
    void work.then(settle,error=>{this.soloPickupFailed=true;this.soloPickupFailure=error;settle();});return work;
  }
  get soloPickupError():unknown {return this.soloPickupFailure;}
  private createSoloWorldsSync():OriginalSoloObserverWorlds|undefined {
    if(this.soloTeardown||!this.isSourceSolo()||!this.playerAlive)return undefined;
    if(!this.soloWorlds&&(this.soloReceiverModels||this.soloReceiverTransients||this.soloLocalWeaponPresentation||this.soloProjectilePresentation||this.soloStartupResources||this.soloLoadedSceneFactory||this.soloDetachedFlashes?.length))this.disposeSoloWorlds(false);
    if(!this.soloWorlds){
      this.soloCorpses??=new Map();this.soloBotShots??=[];
      this.soloModelPresentation??=new OriginalSoloModelPresentation();
      for(const enemy of this.enemies)if(enemy.sourceRig){this.soloModelPresentation.register(enemy.id,enemy.sourceRig);enemy.sourceRig.prepareSourceReuse(enemy.name);}
      const projectileGeometry=new Map<'launcher'|'rpg',THREE.BufferGeometry>();
      for(const weapon of ['launcher','rpg'] as const){const geometry=this.originalWeapons?.resources.get(weapon==='rpg'?'rpgrocket':'rg6grenade')?.geometry;if(geometry)projectileGeometry.set(weapon,geometry);}
      try{
        if(!this.originalSoldierResources||!this.originalWeaponAssets||!this.originalSoloTransientBinding||!this.originalWeapons)throw Error('Loaded Solo startup resources unavailable');
        const borrowedSeed=this.enemies.find(enemy=>enemy.sourceRig)?.sourceRig;
        const seed=borrowedSeed??new OriginalSoldier(this.originalSoldierResources,{weapon:'rpg'});
        try{this.soloStartupResources=createOriginalSoloGameStartupResources({runtime:this.arena.runtime!,doorNames:this.arena.doorWorld?.getStates().map(door=>door.name)??[],
          soldierResources:this.originalSoldierResources,weapons:this.originalWeaponAssets.geometry,transientBinding:this.originalSoloTransientBinding,
          constructorCapture:seed.readConstructorSeedCapture(),gunFactory:seed.readGunConstructorSeedCapture('rpg')!,renderToWorld:new THREE.Matrix4().elements});}
        finally{if(!borrowedSeed)seed.dispose();}
        this.soloLoadedSceneFactory=createOriginalSoloGameSceneFactory({runtime:this.arena.runtime!,collection:this.originalWeapons,startupResources:this.soloStartupResources,
          ...(this.soloPickupOwner?{pickupHistorySourceAt:(registration:OriginalSoloReceiverSceneContext)=>this.soloPickupOwner!.sourceAt(registration.id,registration.lifeGeneration),pickupContinuationAt:(registration:OriginalSoloReceiverSceneContext)=>registration.id==='player'?this.soloPickupOwner!.pickupContinuationAt(registration.id):undefined}:{}),
          readWorlds:()=>this.soloWorlds,readBanks:(registration,context)=>this.readSoloStartupBanks(registration,context),
          readHumanInput:(context,prefix)=>this.readSoloHumanCallbackInput(context,prefix),readHumanHitscan:(context,request,preview)=>this.readSoloHumanHitscanAction(context,request,preview),
          readBotShots:context=>this.readSoloBotProjectileShots(context),random3:()=>Math.floor(Math.random()*3)+1,random36:()=>Math.floor(Math.random()*36)+1,
          goodyAt:context=>{if(!context.alive)return null;const eye=originalPlayerEye(context.body),selected=context.id==='player'&&context.observer.loadout?context.observer.loadout.selected:context.weapon??'launcher';
            return {eyePosition:eye,modelPosition:eye,bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,weapon:selected};}});
        this.soloWorlds=new OriginalSoloObserverWorlds(this.arena.runtime!,{templateBarrels:this.arena.barrelWorld,templateDoors:this.arena.doorWorld,admitWeaponReportDamage:true,
          ...(this.soloPickupOwner?{createDisposalCohort:()=>this.soloCurrentCohortAt!()}:{}),
          soldierAssets:this.originalSoldierResources.assets,projectileGeometry,presentationLifecycle:true,onEvent:event=>this.receiveSoloWorldEvent(event),
          createReceiverScene:registration=>this.soloLoadedSceneFactory!.createReceiverScene(registration)});
        const player=this.soloWorlds.register({id:'player',name:this.localCallsign||'COMRADE',eye:this.camera.position,velocity:{x:this.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:this.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:this.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR},health:this.ensureOriginalHealth(),barrels:this.arena.barrelWorld,doors:this.arena.doorWorld,yaw:this.yaw},this.elapsed);
        player.weapon='launcher';
        this.bindSoloProjectilePresentation(player,{maxModels:128,maxActors:64,maxTextChars:65536,rocketMaterialHandle:'installed-rpg',materialBindings:new Map([
          ['installed-grenade',{resource:'rg6grenade',material:this.originalWeapons.resources.get('rg6grenade')!.material}],
          ['installed-rpg',{resource:'rpgrocket',material:this.originalWeapons.resources.get('rpgrocket')!.material}],
        ])});
        for(const enemy of this.enemies)if(enemy.alive)this.registerSoloEnemy(enemy);
      }catch(error){if(this.soloPickupAdopting)throw error;try{this.disposeSoloWorlds(false);}catch(cleanup){throw new AggregateError([error,cleanup],'Solo startup and cleanup failed',{cause:error});}throw error;}
    }
    return this.soloWorlds;
  }

  /** Only intentional camera/velocity resets call this checkpoint. Ordinary
   * callbacks read the persistent goody body; presentation never drives it. */
  private checkpointSoloHumanBody():void {
    if(!this.isSourceSolo()||!this.playerAlive)return;
    const world=this.soloWorlds?.worlds.get('player');if(!world)return;
    const checkpoint=createOriginalPlayerBody('player',this.camera.position,{x:this.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:this.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:this.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR});
    world.body.position=checkpoint.position;world.body.velocity=checkpoint.velocity;world.body.supported=false;world.yaw=this.yaw;
  }

  private registerSoloEnemy(enemy:Enemy):void {
    const worlds=this.soloWorlds;if(this.soloTeardown||(!this.soloPickupAdopting&&this.soloCurrentPending)||!worlds||worlds.currentAwaiting||worlds.worlds.has(enemy.id))return;
    if(this.soloPickupOwner&&!this.soloPickupAdopting){void this.registerSoloObserverAsync({id:enemy.id,name:enemy.name,eye:{x:enemy.sourcePosition.x,y:enemy.sourcePosition.y+PLAYER_HEIGHT,z:enemy.sourcePosition.z},yaw:enemy.sourceYaw-Math.PI},this.elapsed).then(world=>{world.weapon=enemy.weapon;enemy.sourceTargets.clear();enemy.combatTarget=null;},()=>{/* Roster failure remains owned. */});return;}
    const world=worlds.register({id:enemy.id,name:enemy.name,eye:{x:enemy.sourcePosition.x,y:enemy.sourcePosition.y+PLAYER_HEIGHT,z:enemy.sourcePosition.z},yaw:enemy.sourceYaw-Math.PI},this.elapsed);
    world.weapon=enemy.weapon;enemy.sourceTargets.clear();enemy.combatTarget=null;
  }

  private runSoloPickupRoster(action:()=>Promise<void>):Promise<void> {
    if(this.soloPickupRosterWork)return Promise.reject(Error('Solo pickup roster already active'));
    const work=action();this.soloPickupRosterWork=work;
    const settle=()=>{if(this.soloPickupRosterWork===work)this.soloPickupRosterWork=undefined;};
    void work.then(settle,error=>{this.soloPickupFailed=true;this.soloPickupFailure=error;settle();});return work;
  }
  async registerSoloObserverAsync(registration:OriginalSoloRegistration,time=this.elapsed):Promise<OriginalSoloObserver> {
    const worlds=this.soloWorlds,owner=this.soloPickupOwner,store=this.soloPickupStore;
    if(!worlds||!owner||!store||this.soloTeardown||this.soloCurrentPending||worlds.currentAwaiting||worlds.callbackPhase!=='idle')throw Error('Solo paged roster requires an idle owned world');
    if(worlds.worlds.has(registration.id))throw Error('Solo paged observer already registered');
    const generation=worlds.nextLifeGeneration(registration.id);let result:OriginalSoloObserver|undefined;
    await this.runSoloPickupRoster(async()=>{
      await worlds.cancelAndDrainCurrent();if(this.soloPickupCancelling)throw Error('Solo pickup registration cancelled');
      const old=(await store.readManifest()).observers.find(row=>row.observer===registration.id);
      if(old)await owner.retireLife(old.observer,old.lifeGeneration);
      await owner.registerLife(registration.id,generation);if(this.soloPickupCancelling)throw Error('Solo pickup registration cancelled');
      if(worlds.nextLifeGeneration(registration.id)!==generation)throw Error('Solo pickup registration life changed');
      result=worlds.register(registration,time);
      if(result.lifeGeneration!==generation)throw Error('Solo pickup registered life mismatch');
    });return result!;
  }
  async retireSoloObserverAsync(id:string):Promise<void> {
    const worlds=this.soloWorlds,owner=this.soloPickupOwner,store=this.soloPickupStore;
    if(!worlds||!owner||!store||this.soloTeardown||this.soloCurrentPending||worlds.currentAwaiting)throw Error('Solo paged retirement requires an idle owner');
    const world=worlds.worlds.get(id);
    await this.runSoloPickupRoster(async()=>{
      await worlds.cancelAndDrainCurrent();if(this.soloPickupCancelling)throw Error('Solo pickup retirement cancelled');
      if(world){if(worlds.worlds.get(id)!==world)throw Error('Solo pickup retirement life changed');await worlds.disposeAsync(id,this.soloCurrentCohortAt!());}
      const old=(await store.readManifest()).observers.find(row=>row.observer===id);
      if(old){if(world&&old.lifeGeneration!==world.lifeGeneration)throw Error('Solo pickup retirement generation mismatch');await owner.retireLife(id,old.lifeGeneration);}
      this.soloPickupRetirements?.delete(id);
    });
  }
  private async retireQueuedSoloPickupLives():Promise<void> {
    const queued=this.soloPickupRetirements,owner=this.soloPickupOwner,store=this.soloPickupStore,worlds=this.soloWorlds;
    if(!queued?.size||!owner||!store||!worlds||this.soloPickupCancelling)return;
    const recoveredFailure=this.soloPickupFailure;
    await this.runSoloPickupRoster(async()=>{
      // Retirement may have published its CAS before reader/pin cleanup failed.
      // Drain that exact owner first; an absent durable row alone does not mean
      // its publication resources are terminal or another cohort may start.
      await owner.retryCleanup();
      await worlds.cancelAndDrainCurrent();
      for(const [id,generation] of queued){
        if(this.soloPickupCancelling)return;
        if(worlds.worlds.has(id))throw Error('Solo pickup terminal life still registered');
        const row=(await store.readManifest()).observers.find(value=>value.observer===id);
        if(row){if(row.lifeGeneration!==generation)throw Error('Solo pickup queued retirement life changed');await owner.retireLife(id,generation);}
        queued.delete(id);
      }
    });
    if(!this.soloPickupCancelling&&this.soloWorlds===worlds&&this.soloPickupOwner===owner&&this.soloPickupStore===store
      &&!owner.awaiting&&this.soloPickupFailure===recoveredFailure){
      this.soloPickupFailed=false;this.soloPickupFailure=undefined;
    }
  }

  private soloTeardown?:{worlds:OriginalSoloObserverWorlds;preservePresentation:boolean;ownedReleased?:boolean;work?:Promise<void>;failure?:unknown};
  private soloTeardownActions?:Map<string,()=>void>;
  private soloTeardownFailure?:unknown;

  /** Terminal cleanup owns the old resources until its storage drain succeeds. */
  private disposeSoloWorlds(preservePresentation=false,awaitCleanup=false):Promise<void>|void {
    if(!this.soloPickupStore&&!this.soloPickupDatabase&&!this.soloPickupStartup&&!this.soloPickupRosterWork&&!this.soloPickupClosing){this.soloPickupFailed=false;this.soloPickupFailure=undefined;this.soloPickupCancelling=false;return this.disposeSoloWorldsOwned(preservePresentation,awaitCleanup);}
    if(this.soloPickupClosing){if(!preservePresentation){this.soloPickupPreservePresentation=false;if(this.soloTeardown)this.soloTeardown.preservePresentation=false;}return this.soloPickupClosing;}
    this.soloPickupCancelling=true;
    this.soloPickupPreservePresentation=preservePresentation;
    const work=(async()=>{
      try{await this.soloPickupStartup;}catch{/* Keep its acquired owners for terminal cleanup. */}
      try{await this.soloPickupRosterWork;}catch{/* CAS may have adopted before cleanup failure. */}
      await this.soloPickupOwner?.retryCleanup();
      const preserve=this.soloPickupPreservePresentation===true;
      await this.disposeSoloWorldsOwned(preserve,true);
      await this.soloPickupStore?.close();
      const database=this.soloPickupDatabase;
      if(database)await new Promise<void>((resolve,reject)=>{const request=database.factory.deleteDatabase(database.name);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error??Error('Solo pickup database cleanup failed'));request.onblocked=()=>reject(Error('Solo pickup database cleanup blocked'));});
      if(preserve&&!this.soloPickupPreservePresentation)await this.disposeSoloWorldsOwned(false,true);
      this.soloPickupStore=undefined;this.soloPickupOwner=undefined;this.soloPickupDatabase=undefined;this.soloPickupRetirements=undefined;
      this.soloPickupFailed=false;this.soloPickupFailure=undefined;this.soloPickupCancelling=false;
      this.soloPickupPreservePresentation=undefined;
    })();this.soloPickupClosing=work;
    void work.then(()=>{if(this.soloPickupClosing===work){this.soloPickupClosing=undefined;this.runSoloTeardownActions();}},error=>{if(this.soloPickupClosing===work)this.soloPickupClosing=undefined;this.recordSoloTeardownFailure(error);});return work;
  }
  private runSoloTeardownActions():void {
    const actions=this.soloTeardownActions;this.soloTeardownActions=undefined;
    for(const action of actions?.values()??[])try{action();}catch(error){this.recordSoloTeardownFailure(error);}
  }
  private disposeSoloWorldsOwned(preservePresentation=false,awaitCleanup=false):Promise<void>|void {
    const retained=this.soloTeardown,worlds=retained?.worlds??this.soloWorlds;
    if(!retained&&!awaitCleanup&&!worlds?.currentAwaiting&&!this.soloCurrentPending){this.releaseSoloWorlds(preservePresentation);return;}
    if(!worlds){if(awaitCleanup){this.releaseSoloWorlds(preservePresentation);return Promise.resolve();}throw Error('Solo teardown lost its retained world');}
    const state:NonNullable<Game['soloTeardown']>=retained??{worlds,preservePresentation};this.soloTeardown=state;
    if(!preservePresentation)state.preservePresentation=false;
    if(state.work)return state.work;
    state.failure=undefined;this.soloTeardownFailure=undefined;
    const work=(async()=>{
      // This exact teardown may have completed renderer/World release before
      // reporting a terminal listener error. Retry finishes outer storage IO;
      // a replacement World still rejects rather than inheriting that state.
      if(state.ownedReleased){if(this.soloWorlds!==undefined)throw Error('Solo teardown world changed after cleanup');return;}
      await worlds.cancelAndDrainCurrent();
      const currentWork=this.soloCurrentWork;if(currentWork)try{await currentWork;}catch{/* Teardown drains the rejected gameplay frame before releasing it. */}
      await worlds.clearAsync();
      if(this.soloWorlds!==worlds)throw Error('Solo teardown world changed before cleanup');
      try{this.releaseSoloWorlds(state.preservePresentation,true);state.ownedReleased=true;}
      catch(error){if(this.soloWorlds===undefined)state.ownedReleased=true;throw error;}
    })();
    state.work=work;
    void work.then(()=>{
      if(this.soloTeardown!==state)return;
      this.soloTeardown=undefined;this.soloTeardownFailure=undefined;
      if(!this.soloPickupClosing)this.runSoloTeardownActions();
    },error=>{
      if(this.soloTeardown===state){state.work=undefined;state.failure=error;this.recordSoloTeardownFailure(error);}
    });
    return work;
  }
  disposeSoloWorldsAsync(preservePresentation=false):Promise<void> {
    return Promise.resolve(this.disposeSoloWorlds(preservePresentation,true));
  }
  get soloCleanupError():unknown {return this.soloTeardownFailure;}
  private recordSoloTeardownFailure(error:unknown):void {
    this.soloTeardownFailure=error;
    console.error('Solo teardown failed; resources retained until cleanup is retried',error);
    if(typeof document!=='undefined'&&document.getElementById('connection-note'))try{this.setConnectionNote('UNABLE TO RESET GAME. TRY AGAIN.',true);}catch(displayError){this.soloTeardownFailure=new AggregateError([error,displayError],'Solo cleanup and error display failed');}
  }
  private deferSoloTeardown(key:'spawn'|'enemies'|'round'|'restart'|'menu'|'map',action:()=>void):boolean {
    if(!this.soloTeardown&&!this.soloCurrentPending&&!this.soloWorlds?.currentAwaiting)return false;
    (this.soloTeardownActions??=new Map()).set(key,action);
    this.disposeSoloWorlds(false);return true;
  }
  private releaseSoloWorlds(preservePresentation=false,alreadyCleared=false):void {
    const errors:unknown[]=[];
    const transients=this.soloReceiverTransients;
    if(preservePresentation){if(transients)transients.frozen=true;}
    else{try{transients?.presentation.dispose();this.soloReceiverTransients=undefined;}catch(error){errors.push(error);if(transients?.presentation.isDisposed)this.soloReceiverTransients=undefined;}}
    const models=this.soloReceiverModels;
    if(preservePresentation){if(models)models.frozen=true;}
    else{const before=errors.length;this.soloReceiverPickupBindings=[];if(models)for(const enemy of this.enemies??[])try{enemy.releaseCommittedSourceRig();}catch(error){errors.push(error);}
      if(errors.length===before)try{models?.presentation.dispose();this.soloReceiverModels=undefined;if(models)this.soloCorpses?.clear();}catch(error){errors.push(error);if(models?.presentation.isDisposed){this.soloReceiverModels=undefined;this.soloCorpses?.clear();}}}
    const localPresentation=this.soloLocalWeaponPresentation;
    if(preservePresentation){if(localPresentation)localPresentation.frozen=true;}
    else{try{localPresentation?.adapter.release();this.soloLocalWeaponPresentation=undefined;}catch(error){errors.push(error);if(localPresentation?.adapter.isDisposed)this.soloLocalWeaponPresentation=undefined;}}
    const projectilePresentation=this.soloProjectilePresentation;
    if(preservePresentation){if(projectilePresentation)projectilePresentation.frozen=true;}
    else{try{projectilePresentation?.adapter.dispose();this.soloProjectilePresentation=undefined;}catch(error){errors.push(error);if(projectilePresentation?.adapter.isDisposed)this.soloProjectilePresentation=undefined;}}
    let authorityCleared=alreadyCleared;
    if(!alreadyCleared)try{this.soloWorlds?.clear();authorityCleared=true;}catch(error){errors.push(error);}
    const factory=this.soloLoadedSceneFactory;
    try{factory?.release();this.soloLoadedSceneFactory=undefined;}catch(error){errors.push(error);}
    // endgame resetactors unregisters callbacks without deleting displayed
    // models. Authority dies now; its bounded human handles freeze until reset.
    if(preservePresentation){if(errors.length)throw new AggregateError(errors,'Solo presentation teardown failed');
    const capture=this.soloPendingGameplayFrame?.actorObservation?.record??this.sourceCallbackCaptureCurrent;
    if(capture?.actorStage==='pending'){
      capture.afterActors={stateUnavailable:'Registration disposed; no completed actor stage'};
      capture.actorStage='cancelled-gameover';capture.endedAt=performance.now();
    }
    this.soloPendingGameplayFrame=undefined;
    this.soloHumanCallbackInput=undefined;
    this.soloCommittedGunOutput=undefined;
    this.soloCommittedHitscan=undefined;
    this.soloCommittedWeaponReports=undefined;
    this.soloCommittedFadeBirths=undefined;
    this.soloWorlds=undefined;this.soloCurrentCohortAt=undefined;this.soloCurrentWork=undefined;this.soloBotShots=[];this.soloPickupCapture=[];
      return;}
    const startup=this.soloStartupResources;
    try{startup?.release();this.soloStartupResources=undefined;}catch(error){errors.push(error);}
    const failedFlashes:DetachedSourceFlashes[]=[];for(const flashes of this.soloDetachedFlashes??[])try{flashes.clear();}catch(error){errors.push(error);failedFlashes.push(flashes);}this.soloDetachedFlashes=failedFlashes;
    if(this.soloModelPresentation){
      const before=errors.length;
      for(const enemy of this.enemies??[])if(enemy.sourceRig&&this.soloModelPresentation.active(enemy.id)===enemy.sourceRig)try{enemy.releaseSourceRig();}catch(error){errors.push(error);}
      if(errors.length===before)try{this.soloModelPresentation.releaseclear();this.soloModelPresentation=undefined;this.soloCorpses?.clear();}catch(error){errors.push(error);}
    }else if(!models)for(const [sequence,rig] of this.soloCorpses??[])try{rig.group.removeFromParent();rig.dispose();this.soloCorpses!.delete(sequence);}catch(error){errors.push(error);}
    for(let i=0;i<(this.projectiles?.length??0);i++)if(this.projectiles[i].soloId){try{this.releaseProjectileMesh(this.projectiles[i].mesh);this.projectiles.splice(i,1);i--;}catch(error){errors.push(error);}}
    if(this.originalBlasts)this.originalBlasts.length=0;
    if(errors.length&&(!authorityCleared||this.soloReceiverModels||this.soloReceiverTransients
      ||this.soloLocalWeaponPresentation||this.soloProjectilePresentation||this.soloStartupResources
      ||this.soloLoadedSceneFactory||this.soloModelPresentation||this.soloDetachedFlashes?.length
      ||this.soloCorpses?.size||this.projectiles?.some(projectile=>!!projectile.soloId)))throw new AggregateError(errors,'Solo presentation teardown failed');
    const capture=this.soloPendingGameplayFrame?.actorObservation?.record??this.sourceCallbackCaptureCurrent;
    if(capture?.actorStage==='pending'){
      capture.afterActors={stateUnavailable:'Registration disposed; no completed actor stage'};
      capture.actorStage='cancelled-gameover';capture.endedAt=performance.now();
    }
    this.soloPendingGameplayFrame=undefined;
    this.soloHumanCallbackInput=undefined;
    this.soloCommittedGunOutput=undefined;
    this.soloCommittedHitscan=undefined;
    this.soloCommittedWeaponReports=undefined;
    this.soloCommittedFadeBirths=undefined;
    this.soloWorlds=undefined;this.soloCurrentCohortAt=undefined;this.soloCurrentWork=undefined;this.soloBotShots=[];this.soloPickupCapture=[];
    if(errors.length)throw new AggregateError(errors,'Solo presentation teardown failed');
  }

  private retireLegacySoloModelPresentation(errors:unknown[]):void {
    const registry=this.soloModelPresentation;this.soloModelPresentation=undefined;
    const rigs=new Set<OriginalSoldier>(this.soloCorpses?.values()??[]);for(const drop of this.weaponDrops??[])if(drop.sourceRig)rigs.add(drop.sourceRig);
    for(const enemy of this.enemies??[]){const rig=enemy.sourceRig;if(rig){rigs.add(rig);try{enemy.releaseSourceRig();}catch(error){errors.push(error);}}}
    if(registry)try{registry.releaseclear();}catch(error){errors.push(error);}else for(const rig of rigs)try{rig.dispose();}catch(error){errors.push(error);}
    this.soloCorpses?.clear();
    // Prior drops belong to the retired legacy inventory, never the new bank.
    for(let i=(this.weaponDrops?.length??0)-1;i>=0;i--){const drop=this.weaponDrops[i];try{drop.group.removeFromParent();}catch(error){errors.push(error);}this.weaponDrops.splice(i,1);}
    const failedFlashes:DetachedSourceFlashes[]=[];for(const flashes of this.soloDetachedFlashes??[])try{flashes.clear();}catch(error){errors.push(error);failedFlashes.push(flashes);}this.soloDetachedFlashes=failedFlashes;
  }
  private retireLegacySoloTransientPresentation(errors:unknown[]):void {
    try{this.originalExplosionPresentation?.clear();}catch(error){errors.push(error);}
    try{this.originalCombatEffectPresentation?.clear();}catch(error){errors.push(error);}
    try{this.originalEffectPlanePool?.reset();}catch(error){errors.push(error);}
    const rigs=new Set<OriginalSoldier>(this.soloCorpses?.values()??[]);
    for(const enemy of this.enemies??[])if(enemy.sourceRig)rigs.add(enemy.sourceRig);
    for(const drop of this.weaponDrops??[])if(drop.sourceRig)rigs.add(drop.sourceRig);
    const models=this.soloReceiverModels,checkpoint=models?.presentation.freeze();if(models&&checkpoint)for(const handle of checkpoint.giHandles){const rig=models.presentation.readRig(handle);if(rig)rigs.add(rig);}
    this.soloDetachedFlashes??=[];for(const rig of rigs)try{rig.retireSourceTransientPresentation();}catch(error){errors.push(error);}
    const detached=this.soloDetachedFlashes;this.soloDetachedFlashes=[];for(const flashes of detached)try{flashes.clear();}catch(error){errors.push(error);this.soloDetachedFlashes.push(flashes);}
  }
  private bindCommittedSoloModelMetadata():void {
    const owner=this.soloReceiverModels;if(!owner)return;const checkpoint=owner.presentation.freeze();if(!checkpoint)return;
    const errors:unknown[]=[];for(const enemy of this.enemies??[])try{enemy.releaseCommittedSourceRig();}catch(error){errors.push(error);}
    for(const enemy of this.enemies??[])try{enemy.bindCommittedSourceRig(owner.presentation.actorRig(enemy.id));}catch(error){errors.push(error);}
    this.soloCorpses??=new Map();this.soloCorpses.clear();for(const fade of checkpoint.fades)this.soloCorpses.set(fade.id,owner.presentation.readRig(fade.handle)!);
    this.soloReceiverPickupBindings=checkpoint.pickupHistory?owner.presentation.pickupModelBindings(checkpoint):Object.freeze(checkpoint.pickups.map(pickup=>owner.presentation.pickupBinding(pickup.id)!));
    if(errors.length)throw new AggregateError(errors,'Solo model metadata binding failed');
  }
  private receiveSoloWorldEvent(event:OriginalSoloEvent):void {
    const world=this.soloWorlds?.worlds.get(event.recipientId);
    if(!world||world.lifeGeneration!==event.lifeGeneration||this.phase!=='playing')return;
    if(event.kind==='dead'&&event.recipientId!=='player'&&this.soloPickupOwner){const queued=this.soloPickupRetirements??=new Map();if(queued.size>=64&&!queued.has(event.recipientId))throw Error('Solo pickup retirement capacity exceeded');queued.set(event.recipientId,event.lifeGeneration);}
    if(event.kind==='fade-born'){
      const values=world.fadeBirths;
      if(event.recipientId!=='player'||!this.isSourceSolo()||!values||values.length>256||!Object.isFrozen(values))return;
      const index=values.indexOf(event);if(index<0)return;
      const prefix=event.transition.prefix;
      if(prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback)return;
      let holder=this.soloCommittedFadeBirths;
      if(!holder||holder.world!==world||holder.events!==values){holder={world,events:values,consumed:new Set()};this.soloCommittedFadeBirths=holder;}
      if(holder.consumed.has(index))return;
      holder.consumed.add(index);
      this.playOriginalCombatSound('hurt',event.transition.fadePositionWorld);
    }else if(event.kind==='weapon-report'){
      const values=world.weaponReports;
      if(event.recipientId!=='player'||!this.isSourceSolo()||!Array.isArray(values)||values.length>256||!Object.isFrozen(values))return;
      let index=-1;for(let i=0;i<values.length;i++)if(values[i]===event){index=i;break;}
      if(index<0)return;
      const prefix=event.prefix;
      if(prefix.kind!=='callback'||prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback)return;
      let holder=this.soloCommittedWeaponReports;
      if(!holder||holder.world!==world||holder.events!==values){
        holder={world,events:values,consumed:new Set()};this.soloCommittedWeaponReports=holder;
      }
      if(holder.consumed.has(index))return;
      // This source report drives remote baddy firing phases, not accuracy.
      // Consume before the sink so a delivery error or reentry cannot repeat it.
      holder.consumed.add(index);
      if(event.report.shots!==undefined)this.soloWorlds!.reportShots('player',event.report.shots);
    }else if(event.kind==='local-hitscan-outcome'){
      const outcome=event.outcome,prefix=outcome.prefix,values=world.localHitscanOutcomes;
      if(event.recipientId!=='player'||!this.isSourceSolo()||prefix.kind!=='callback'
        ||prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback
        ||!values||values.length>256)return;
      let index=-1;for(let i=0;i<values.length;i++)if(values[i]===outcome){index=i;break;}
      if(index<0)return;
      let holder=this.soloCommittedHitscan;
      if(!holder||holder.world!==world||holder.callback!==prefix.callback){
        holder={world,callback:prefix.callback,consumed:new Set()};this.soloCommittedHitscan=holder;
      }
      if(holder.consumed.has(index))return;
      // Consume before audio: post-commit sink failures must never replay hurt.
      holder.consumed.add(index);
      if(outcome.hurt)this.playOriginalCombatSound('hurt',outcome.hurt.sourcePositionWorld);
    }else if(event.kind==='bot-projectile-commit'){
      if(!this.isSourceSolo()||event.recipientId==='player'||event.checkpoint!==world.botProjectileCommit)return;
      const completed=new Set<OriginalSoloBotShotCapture>(),shots=event.checkpoint.shots;
      for(let i=0;i<shots.length;i++)completed.add(shots[i]);
      this.soloBotShots=this.soloBotShots.filter(shot=>shot.ownerId!==world.id||shot.ownerLife!==world.lifeGeneration||!completed.has(shot));
    }else if(event.kind==='transient-state'){
      if(event.recipientId!=='player'||!this.isSourceSolo())return;
      const existing=this.soloReceiverTransients,resources=event.resources,binding=this.originalSoloTransientBinding;
      if(event.checkpoint!==world.transientState)return;
      if(!resources||resources!==world.transientResources||!binding||binding.resources.resourceBindingId!==resources.resourceBindingId||binding.resources.textureBindingId!==resources.textureBindingId){
        if(existing||resources)throw Error('Missing or foreign Solo transient resource binding');return;
      }
      if(existing?.world===world){existing.presentation.adopt(event.checkpoint,resources);return;}
      const presentation=new OriginalReceiverTransientPresentation(binding.resources,this.scene,{sceneGeneration:world.lifeGeneration,maxModels:256,maxShaders:256,maxTextChars:65536,resourceBindingId:binding.resources.resourceBindingId,textureBindingId:binding.resources.textureBindingId,side:binding.side,nearFilter:binding.nearFilter});
      try{presentation.adopt(event.checkpoint,resources);}catch(error){try{presentation.dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Solo transient adoption failed');}throw error;}
      this.soloReceiverTransients={world,presentation};const errors:unknown[]=[];
      try{existing?.presentation.dispose();}catch(error){errors.push(error);}
      this.retireLegacySoloTransientPresentation(errors);if(errors.length)throw new AggregateError(errors,'Solo transient renderer handoff failed');
    }else if(event.kind==='model-state'){
      if(event.recipientId!=='player'||!this.isSourceSolo())return;
      if(event.checkpoint!==world.modelState)return;
      const existing=this.soloReceiverModels,resources=event.resources,pack=this.originalSoldierResources;
      if(!resources||resources!==world.actorResources||!pack?.resourceBindingId||pack.resourceBindingId!==resources.resourceBindingId){
        if(existing||resources)throw Error('Missing or foreign Solo model resource binding');return;
      }
      if(existing?.world===world){existing.presentation.adopt(event.checkpoint,resources);this.bindCommittedSoloModelMetadata();return;}
      const presentation=new OriginalReceiverModelPresentation(pack,this.scene,{sceneGeneration:world.lifeGeneration,maxModels:256,maxPickups:256,maxTextChars:65536,resourceBindingId:pack.resourceBindingId});
      try{presentation.adopt(event.checkpoint,resources);}catch(error){try{presentation.dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Solo model adoption failed');}throw error;}
      // Renderer writes can fail after the receiver has committed. Keep the
      // new owner reachable for cleanup before retiring prior presentation.
      this.soloReceiverModels={world,presentation};const errors:unknown[]=[];
      for(const enemy of this.enemies??[])try{enemy.releaseCommittedSourceRig();}catch(error){errors.push(error);}
      // These fade associations belong to the prior exact model owner; its
      // dispose owns every rig. Do not feed them into legacy fallback disposal.
      if(existing)this.soloCorpses?.clear();
      try{existing?.presentation.dispose();}catch(error){errors.push(error);}
      this.retireLegacySoloModelPresentation(errors);try{this.bindCommittedSoloModelMetadata();}catch(error){errors.push(error);}
      if(errors.length)throw new AggregateError(errors,'Solo model renderer handoff failed');
    }else if(event.kind==='model-transitions'){
      // Final committed registry owns geometry/membership. Do not replay
      // intermediate journal transforms over that checkpoint.
      if(event.recipientId==='player'&&this.soloReceiverModels?.world===world)this.bindCommittedSoloModelMetadata();
    }else if(event.kind==='local-weapon-state'){
      if(event.recipientId!=='player'||!this.isSourceSolo()||event.checkpoint!==world.localWeapons||!this.originalWeapons)return;
      const capturedCamera=new THREE.Matrix4().fromArray(event.checkpoint.cameraWorldMatrix);
      const cameraDeterminant=capturedCamera.determinant();
      if(!Number.isFinite(cameraDeterminant)||cameraDeterminant===0)throw Error('Singular Solo local weapon camera');
      const conversion=new THREE.Matrix4();
      if(this.enhancedRendering){
        this.viewCamera.updateWorldMatrix(true,false);
        const determinant=this.viewCamera.matrixWorld.determinant();
        if(!Number.isFinite(determinant)||determinant===0)throw Error('Singular Solo view camera');
        conversion.multiplyMatrices(this.viewCamera.matrixWorld,capturedCamera.invert());
      }
      if(!conversion.elements.every(Number.isFinite))throw Error('Solo local weapon camera conversion overflow');
      // Canonicalize only generated affine rounding, never captured operands.
      conversion.elements[3]=0;conversion.elements[7]=0;conversion.elements[11]=0;conversion.elements[15]=1;
      if(this.soloLocalWeaponPresentation?.world!==world){
        const previous=this.soloLocalWeaponPresentation;this.soloLocalWeaponPresentation=undefined;previous?.adapter.release();
        this.soloLocalWeaponPresentation={world,adapter:new OriginalReceiverLocalWeaponPresentation(this.originalWeapons,this.viewModel,{sceneGeneration:world.lifeGeneration,maxTextChars:65536})};
      }
      this.soloLocalWeaponPresentation.adapter.adopt(event.checkpoint.prefix,event.checkpoint,conversion.elements);
      this.sourceDisplayedWeapon=event.checkpoint.selectedWeapon;
      if(this.originalWeaponPresentation){
        const motion=event.checkpoint.motion;
        this.originalWeaponPresentation.ticker=motion.ticker;
        this.originalWeaponPresentation.sourcePosition.set(motion.gunPositionSource.x,motion.gunPositionSource.y,motion.gunPositionSource.z);
        if(motion.weapon!==null)this.originalWeaponPresentation.weapon=motion.weapon;
      }
    }else if(event.kind==='projectile-state'){
      if(event.recipientId!=='player'||!this.isSourceSolo()||event.checkpoint!==world.projectileState)return;
      this.adoptCommittedSoloProjectiles(world,event.checkpoint);
    }else if(event.kind==='loadout-state'){
      if(event.recipientId!=='player'||!this.isSourceSolo()||event.checkpoint!==world.loadout||event.checkpoint.map!==this.mapId)return;
      // Adopt committed counts/counters on the delivery clock. This state
      // event does not replay private pose adoption, selection/reload helpers
      // or reset gun/rocket presentation.
      this.weaponState.adoptOriginalLoadout(event.checkpoint,this.elapsed);
      this.score=event.checkpoint.score;this.updateHud();
    }else if(event.kind==='gun-phase-state'){
      if(event.recipientId!=='player'||!this.isSourceSolo()||event.checkpoint!==world.gunPhase||!world.loadout||world.loadout.map!==this.mapId||!this.weaponState.originalLoadoutCheckpoint)return;
      this.weaponState.adoptOriginalGunPhase(event.checkpoint);
    }else if(event.kind==='gun-output'){
      const prefix=event.prefix,loadout=world.loadout,local=world.localWeapons,adopted=this.weaponState.originalLoadoutCheckpoint;
      if(event.recipientId!=='player'||!this.isSourceSolo()||prefix.kind!=='callback'
        ||prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback
        ||!loadout||loadout.map!==this.mapId||!local||!adopted
        ||[loadout.prefix,local.prefix,adopted.prefix].some(p=>p.kind!=='callback'||p.sceneGeneration!==prefix.sceneGeneration||p.callback!==prefix.callback)
        ||!Number.isSafeInteger(event.commandIndex)||event.commandIndex<0)return;
      let holder=this.soloCommittedGunOutput;
      if(holder?.world===world&&holder.callback>prefix.callback)return;
      if(!holder||holder.world!==world||holder.callback!==prefix.callback){
        holder={world,callback:prefix.callback,lastCommandIndex:-1,scopeCreated:false,scopeAdvanced:false};this.soloCommittedGunOutput=holder;
      }
      if(event.commandIndex<=holder.lastCommandIndex)return;
      // Consume before calling audio/projection hooks: a throwing listener must
      // not make a committed presentation command replayable.
      holder.lastCommandIndex=event.commandIndex;
      const output=event.output;
      if(output.kind==='sound')this.playOriginalCombatSound(output.sound,undefined,6);
      else if(output.kind==='look-kick'){
        const radians=output.degrees*Math.PI/180;
        if(output.axis==='pitch'){
          const pitch=this.pitch+radians;if(!Number.isFinite(pitch))throw Error('Committed Solo pitch overflow');this.pitch=pitch;
        }else{
          const yaw=this.yaw+radians;if(!Number.isFinite(yaw))throw Error('Committed Solo yaw overflow');this.yaw=yaw;
        }
        // goody captured this callback's camera before weaponry changed aim.
        // The next goody callback owns camera.rotation, not this consumer.
      }else if(output.kind==='scope-poll'){
        if(output.sourceScopeEnabled??true){
          const state=this.originalScopeState??=createOriginalScope();
          holder.scopeCreated=openOriginalScope(state,true,output.typing,output.shiftHeld)||holder.scopeCreated;
        }
      }else holder.scopeFrame=output;
    }else if(event.kind==='loadout-output'){
      if(event.recipientId!=='player'||!this.isSourceSolo()||!world.loadout||world.loadout.map!==this.mapId)return;
      if(event.intent.kind==='feedback')this.appendChat('',event.intent.message,'feedback');
      else this.playOriginalCombatSound(event.intent.sound,undefined,6);
    }else if(event.kind==='baddy-born'){
      if(event.recipientId!=='player'||this.hasCommittedSoloModels())return;
      const enemy=this.enemies.find(enemy=>enemy.id===event.ownerId);if(!enemy)throw Error('Solo birth owner missing');
      this.ensureSourceSoloRig(enemy,event.position);
    }else if(event.kind==='corpse-retired'){
      if(event.recipientId!=='player'||this.hasCommittedSoloModels())return;
      this.soloModelPresentation!.retire(event.sequence);this.soloCorpses.delete(event.sequence);
    }else if(event.kind==='baddy-detached'){
      if(event.recipientId!=='player'||this.hasCommittedSoloModels())return;
      // Both known death and -450 timeout run baddies.die. The accepted
      // callback's refreshed weapon/position survive canonical bot replay.
      const enemy=this.enemies.find(enemy=>enemy.id===event.ownerId),rig=enemy?.sourceRig;
      const corpse=world.mirror.freezeCorpses().find(corpse=>event.corpseSequence!==undefined?corpse.sequence===event.corpseSequence:corpse.ownerId===event.ownerId&&!this.soloCorpses.has(corpse.sequence));
      if(!enemy||!rig||!corpse)throw Error('Solo death model binding missing');
      // Source refreshes the current weapon/orientgun before die. Retain
      // independent muzzle records while sampling the terminal GI phase.
      // This is the accepted terminal actor callback (not a render refresh).
      // Orient once, but let the independent flash dispatcher age its records.
      rig.refreshSourceWeapon(event.weapon);rig.animate(0,{alive:true});
      const transientErrors:unknown[]=[];
      if(this.hasCommittedSoloTransients())try{rig.retireSourceTransientPresentation();}catch(error){transientErrors.push(error);}
      else{const flashes=rig.detachSourceFlashes(this.scene);this.soloDetachedFlashes??=[];if(flashes.count)this.soloDetachedFlashes.push(flashes);}
      this.dropSourceSoloWeapon(event.weapon,event.position,rig);
      this.soloModelPresentation!.bindCorpse(enemy.id,corpse.sequence);enemy.releaseSourceRig();
      rig.beginSourceFadeaway();this.soloCorpses.set(corpse.sequence,rig);this.scene.add(rig.group);
      if(transientErrors.length)throw new AggregateError(transientErrors,'Solo death transient cleanup failed');
    }else if(event.kind==='spawned'){
      if(event.recipientId!=='player')return;
      if(this.hasCommittedSoloProjectiles()){this.playOriginalCombatSound(originalFireSound(event.state.weapon),event.launch.eye,7);return;}
      const source=event.state,mesh=this.createProjectileMesh(source.weapon);
      mesh.position.copy(source.position);this.orientProjectileMesh(mesh,new THREE.Vector3().copy(source.direction),source.sourceRotation,source.angular);this.scene.add(mesh);
      this.projectiles.push({mesh,velocity:new THREE.Vector3().copy(source.velocity),life:0,radius:250*ORIGINAL_MAP_SCALE,damage:5,grenade:source.weapon==='launcher',impact:false,owner:'player',source,soloId:event.launch.id});
      this.playOriginalCombatSound(originalFireSound(source.weapon),event.launch.eye,7);
    }else if(event.kind==='shot'){
      if(event.recipientId!=='player')return;
      // Owned final gun WORLD cannot reconstruct the shot's previous bone
      // pose. Dedicated committed shot/FX binding remains required; audio stays.
      const enemy=this.enemies.find(e=>e.id===event.ownerId);if(enemy&&!this.hasCommittedSoloModels()&&!this.hasCommittedSoloTransients()){if(!enemy.sourceRig)throw Error('Solo shot birth model missing');enemy.sourceReceivedShot(event.weapon);}this.playOriginalCombatSound(originalFireSound(event.weapon),event.position);
    }else if(event.kind==='door'){
      if(event.recipientId==='player')this.playOriginalDoorSound(event.name);
    }else if(event.kind==='contact'){
      // Body impulses are already in the owning persistent body. Projectile
      // contact diagnostics below count fixed and dynamic contacts exactly once.
    }else if(event.kind==='detonated'){
      if(event.recipientId!=='player')return;
      const index=this.projectiles.findIndex(p=>p.soloId===event.launch.id);
      if(event.launch.weapon==='rpg'&&!this.hasCommittedSoloTransients())this.originalCombatEffectPresentation?.spawnPuff(event.position,this.camera.position,Math.random,undefined,0,this.elapsed);
      this.playOriginalCombatSound('boomnew',event.position);this.spawnExplosion(new THREE.Vector3().copy(event.position),250*ORIGINAL_MAP_SCALE,event.launch.weapon);
      if(index>=0){const visual=this.projectiles[index];this.releaseProjectileMesh(visual.mesh);this.projectiles.splice(index,1);}
    }else if(event.kind==='damaged'){
      if(event.recipientId==='player'){
        this.health=event.health;this.playPlayerHurtSound();this.showOriginalHurt(event.ownerName===undefined?undefined:this.soloHurtAttackerPosition(event.ownerName));this.updateHud();
      }else{
        const enemy=this.enemies.find(e=>e.id===event.recipientId);if(!enemy)return;
        enemy.sourceDamagePresentation(event.health,false,event.damage,event.time);
        if(event.launch&&event.ownerName&&originalAsciiNamesEqual(event.ownerName,this.localCallsign)){this.hits++;this.showHitmarker(false);}
      }
    }else if(event.kind==='dead'){
      const attacker=this.enemies.find(e=>e.alive&&event.ownerName!==undefined&&originalAsciiNamesEqual(e.name,event.ownerName));
      if(event.recipientId==='player'){this.killPlayer(attacker,event.ownerName);return;}
      const victim=this.enemies.find(e=>e.id===event.recipientId);if(!victim||!victim.alive)return;
      victim.sourceDamagePresentation(event.health,true,0,event.time);this.soloBotShots=this.soloBotShots.filter(shot=>shot.ownerId!==victim.id);
      if(event.ownerName&&originalAsciiNamesEqual(event.ownerName,this.localCallsign)){this.showHitmarker(true);this.registerKill(false,victim);}
      else if(attacker)this.registerBotKill(attacker,victim);
      else{victim.deaths++;this.dropWeapon(victim);this.addKillFeed(event.ownerName??'',victim.name);this.updateHud();}
    }
  }

  private soloHurtAttackerPosition(name:string):Vec3|undefined {
    const human=this.soloWorlds?.worlds.get('player');if(!human)return undefined;
    if(this.playerAlive&&originalAsciiNamesEqual(name,human.name))return originalPlayerEye(human.body);
    for(const pose of human.mirror.freeze())if(originalAsciiNamesEqual(human.actorNames.get(pose.id)?.name??'',name))return {...pose.position,y:pose.position.y+PLAYER_HEIGHT};
    return undefined;
  }

  private beginSoloCallback():void {
    const worlds=this.ensureSoloWorlds();if(!worlds)return;
    // Match the existing captured-actor adapter: appended pickups first step
    // on a following callback. Native mutation during actorList is unproved.
    this.soloPickupCapture=[...(this.weaponDrops??[])];
  }

  private ensureSourceSoloRig(enemy:Enemy,birthPosition?:Readonly<Vec3>):OriginalSoldier {
    if(this.hasCommittedSoloModels()){const rig=this.soloReceiverModels!.presentation.actorRig(enemy.id);if(!rig)throw Error('Committed Solo actor rig missing');return rig;}
    if(enemy.sourceRig){
      // Initial registration already prepared the rig. The accepted receipt
      // supplies its constructor placement without another reuse or bone sample.
      if(birthPosition){enemy.group.position.copy(birthPosition);enemy.sourceRig.prepareSourceBirthPose(birthPosition);}
      return enemy.sourceRig;
    }
    if(!this.soloModelPresentation||!this.originalSoldierResources)throw Error('Solo source model registry unavailable');
    const rig=this.soloModelPresentation.acquire(enemy.id,()=>new OriginalSoldier(this.originalSoldierResources!,{name:enemy.name,weapon:'rpg'}));
    rig.prepareSourceReuse(enemy.name);if(birthPosition)enemy.group.position.copy(birthPosition);enemy.attachSourceRig(rig);
    rig.prepareSourceBirthPose(birthPosition??enemy.group.position);return rig;
  }

  private completeSoloGoody():void {
    const worlds=this.soloWorlds;if(!worlds)return;
    const frame=this.soloPendingGameplayFrame,asynchronous=!!this.soloCurrentCohortAt;
    if(asynchronous){
      if(!frame||frame.worlds!==worlds||frame.stage!=='delivery')throw Error('Async Solo CURRENT requires its captured gameplay frame');
      if(frame.goodyPrepared||frame.deliveryWork)return;
    }
    const human=worlds.worlds.get('player');if(human){human.yaw=this.yaw;human.weapon=this.weaponState.current;worlds.completeExternalGoody('player');}
    for(const enemy of this.enemies){const world=worlds.worlds.get(enemy.id);if(!world||!enemy.alive)continue;
      worlds.goody(enemy.id,undefined,'source',local=>applyOriginalSoloBotIntent(local.body,enemy.sourceIntent));
      enemy.sourcePosition.copy(originalPlayerEye(world.body)).add(new THREE.Vector3(0,-PLAYER_HEIGHT,0));enemy.health=world.health.canonical;world.yaw=enemy.sourceYaw-Math.PI;world.weapon=enemy.weapon;
    }
    if(asynchronous){frame!.goodyPrepared=true;this.startSoloCurrentDelivery(frame!,false);return;}
    worlds.completeGoody(this.elapsed);
    const pending=this.soloPendingGameplayFrame;
    if(pending?.worlds===worlds)pending.stage='mirror';
    this.syncSoloMirrors(true);
    if(this.soloPendingGameplayFrame===pending&&pending)pending.stage='presentation';
  }

  /** A held source frame keeps its physical inputs while CURRENT and storage
   * settle. Explicit retry drains cleanup and never repeats a published CAS. */
  private startSoloCurrentDelivery(frame:SoloGameplayFrame,retry:boolean):Promise<void> {
    if(frame.deliveryWork)return frame.deliveryWork;
    const factory=this.soloCurrentCohortAt;if(!factory)throw Error('Async Solo CURRENT cohort factory unavailable');
    frame.deliveryError=undefined;frame.deliveryFailed=false;
    const work=(async()=>{
      if(retry)await frame.worlds.cancelAndDrainCurrent();
      if(this.soloTeardown||this.soloPendingGameplayFrame!==frame||this.soloWorlds!==frame.worlds)return;
      if(!this.playerAlive||!this.originalActorDispatchActive(frame.generation))throw Error('Retained Solo CURRENT callback is inactive');
      if(frame.worlds.callbackPhase==='physics')await frame.worlds.completeGoodyAsync(frame.time,factory());
      else if(!retry||frame.worlds.callbackPhase!=='goody')throw Error('Async Solo CURRENT lost its captured callback phase');
      await this.retireQueuedSoloPickupLives();
      if(this.soloTeardown||this.soloPendingGameplayFrame!==frame||this.soloWorlds!==frame.worlds||!this.playerAlive||!this.originalActorDispatchActive(frame.generation))return;
      const elapsed=this.elapsed;this.elapsed=frame.time;
      try{
        if(frame.stage==='delivery'||frame.stage==='mirror'){
          // Consume this presentation callback before callouts: cleanup retry
          // must not replay a partially advanced source pose or flash.
          frame.stage='presentation';this.syncSoloMirrors(true);
        }
      }finally{if(this.phase!=='playing'||(this.originalActorDispatchGeneration??0)===frame.generation)this.elapsed=elapsed;}
    })();
    frame.deliveryWork=work;this.soloCurrentWork=work;
    const settle=()=>{if(frame.deliveryWork===work)frame.deliveryWork=undefined;if(this.soloCurrentWork===work)this.soloCurrentWork=undefined;};
    void work.then(settle,error=>{frame.deliveryError=error;frame.deliveryFailed=true;settle();});return work;
  }
  get soloCurrentError():unknown {return this.soloPendingGameplayFrame?.deliveryError;}
  retrySoloCurrentAsync():Promise<void> {
    const frame=this.soloPendingGameplayFrame;
    if(!frame||!frame.goodyPrepared||!this.soloCurrentCohortAt)return Promise.reject(Error('No retained asynchronous Solo CURRENT frame'));
    if(this.soloTeardown)return Promise.reject(Error('Solo teardown owns the retained CURRENT frame'));
    if(frame.deliveryWork)return frame.deliveryWork;
    if(!this.playerAlive||!this.originalActorDispatchActive(frame.generation))return Promise.reject(Error('Retained Solo CURRENT callback is inactive'));
    return this.startSoloCurrentDelivery(frame,true);
  }

  /** Finish the exact suspended source callback before admitting another body
   * or control step. CURRENT retries use captured inputs and launches; actor
   * retries use the coordinator's retained physical cursor. Committed user
   * dispatch errors never turn into a second delivery of weapon work. */
  private resumeSoloGameplayFrame():void {
    if(this.soloTeardown||this.soloCurrentPending)return;
    const pending=this.soloPendingGameplayFrame;if(!pending||pending.deliveryWork||pending.deliveryFailed)return;
    const current=()=>this.soloPendingGameplayFrame===pending&&this.soloWorlds===pending.worlds&&this.playerAlive&&this.originalActorDispatchActive(pending.generation);
    if(!current()){if(this.soloPendingGameplayFrame===pending)this.soloPendingGameplayFrame=undefined;return;}
    const frameTime=this.elapsed;this.elapsed=pending.time;
    try{
      if(pending.stage==='delivery'){
        if(this.soloCurrentCohortAt){this.startSoloCurrentDelivery(pending,false);return;}
        if(pending.worlds.callbackPhase==='physics')pending.worlds.completeGoody(pending.time);
        else if(pending.worlds.callbackPhase!=='goody')throw Error('Suspended Solo delivery phase lost');
        if(!current())return;pending.stage='mirror';
      }
      if(pending.stage==='mirror'){pending.stage='presentation';this.syncSoloMirrors(true);if(!current())return;}
      if(pending.stage==='presentation'){pending.stage='actors';this.advanceSourceWeaponPresentation(pending.generation);if(!current())return;}
      if(pending.stage==='actors'){
        // An actor dispatch error can follow a completed physical cursor. Keep
        // completed viewers consumed; a preparation failure retains goody.
        try{if(pending.worlds.callbackPhase==='goody')this.updateOriginalExplosives(true,pending.activeProjectiles);
          else if(pending.worlds.callbackPhase!=='idle')throw Error('Suspended Solo actor phase lost');}
        finally{if(pending.stage==='actors'&&pending.worlds.callbackPhase==='idle')pending.stage='actor-tail';}
        if(!current())return;
      }
      if(pending.stage==='actor-tail'){this.finishSoloActors(pending.worlds);if(!current())return;pending.stage='authored';}
      if(pending.stage==='authored'){pending.stage='scope';this.updateAuthoredProjectiles(1/30);if(!current())return;}
      if(pending.stage==='scope'){
        this.soloPendingGameplayFrame=undefined;
        if(!this.advanceCommittedSoloGunScope())this.advanceSourceScope(false);
      }
    }finally{if(this.phase!=='playing'||(this.originalActorDispatchGeneration??0)===pending.generation)this.elapsed=frameTime;}
  }

  private syncSoloMirrors(advance=false):void {
    this.soloReceiverTransients?.presentation.rebase();
    if(this.soloReceiverModels&&!this.soloWorlds){this.soloReceiverModels.presentation.rebase();return;}
    const worlds=this.soloWorlds;if(!worlds)return;
    for(const enemy of this.enemies){const world=worlds.worlds.get(enemy.id);if(!world)continue;
      const poses=world.mirror.freeze(),members=new Set(poses.map(p=>p.id));
      for(const id of enemy.sourceTargets.keys())if(!members.has(id))enemy.sourceTargets.delete(id);
      for(const pose of poses){let target=enemy.sourceTargets.get(pose.id);if(!target){target=new THREE.Vector3();enemy.sourceTargets.set(pose.id,target);}target.copy(pose.position);if(pose.id==='player')target.y+=PLAYER_HEIGHT;}
    }
    const human=worlds.worlds.get('player');if(!human)return;
    if(this.hasCommittedSoloModels()){
      this.soloReceiverModels!.presentation.rebase();this.bindCommittedSoloModelMetadata();
      const poses=human.mirror.freeze();for(const enemy of this.enemies){const pose=poses.find(pose=>pose.id===enemy.id);enemy.group.visible=!!pose;if(pose){enemy.group.position.copy(pose.position);enemy.group.rotation.set(0,pose.yaw,0);enemy.group.updateWorldMatrix(true,true);}}return;
    }
    const poses=human.mirror.freeze(),corpses=human.mirror.freezeCorpses();
    const retained=new Set(corpses.map(corpse=>corpse.sequence));
    if([...this.soloCorpses.keys()].some(sequence=>!retained.has(sequence)))throw Error('Solo fade retirement event missing');
    this.soloDetachedFlashes??=[];
    // Source Solo has eight owners and two-callback flashes. Preflight before
    // changing any clock/ownership; abnormal accumulation must never evict FX.
    const pendingFlashes=this.enemies.reduce((count,enemy)=>count+(poses.some(pose=>pose.id===enemy.id)?0:enemy.sourceFlashCount),0);
    if(this.soloDetachedFlashes.reduce((count,flashes)=>count+flashes.count,0)+pendingFlashes>64)throw Error('Solo detached muzzle capacity exceeded');
    // Keep the renderer's existing callback schedule. Already-detached clocks
    // step once here; zero-time mirror/AI refreshes never advance them.
    if(!this.hasCommittedSoloTransients())for(const flashes of this.soloDetachedFlashes)flashes.step(advance?1/30:0);
    this.soloDetachedFlashes=this.soloDetachedFlashes.filter(flashes=>flashes.count>0);
    for(const enemy of this.enemies){const pose=poses.find(p=>p.id===enemy.id);
      if(!pose&&enemy.sourceFlashCount&&!this.hasCommittedSoloTransients()){
        const flashes=enemy.detachSourceFlashes(this.scene)!;
        // A missing pose would otherwise skip this rig's advancing callback.
        // Preserve its remaining clock, including fractional preview time.
        flashes.step(advance?1/30:0);if(flashes.count)this.soloDetachedFlashes.push(flashes);
      }
      enemy.group.visible=!!pose;if(pose){const rig=enemy.sourceRig;if(!rig)throw Error('Solo birth model event missing');if(advance)rig.refreshSourceWeapon(human.mirror.sourceWeaponOf(enemy.id)??'rpg');enemy.sourceReceivedPose(pose,advance);}
    }
    if(this.originalSoldierResources)for(const corpse of corpses){let rig=this.soloCorpses.get(corpse.sequence);
      if(!rig)throw Error('Solo corpse model binding missing');
      rig.group.position.copy(corpse.position);rig.group.rotation.y=corpse.yaw;if(corpse.deathBon===0)rig.beginSourceFadeaway();else rig.setSourceMotionTime(corpse.motionTime);rig.group.updateWorldMatrix(true,true);
    }
  }

  private completeSoloActors():void {
    const worlds=this.soloWorlds;if(!worlds)return;
    const generation=this.originalActorDispatchGeneration;
    const pending=this.soloBotShots;this.soloBotShots=[];
    for(const shot of pending){if(!isOriginalSoloBotShotCapture(shot)||shot.weapon!=='launcher'&&shot.weapon!=='rpg')throw Error('Invalid Solo bot projectile capture');const world=worlds.worlds.get(shot.ownerId);if(!world||world.lifeGeneration!==shot.ownerLife)continue;
      if(world.botProjectileOwned===true){this.soloBotShots.push(shot);continue;}
      const admission=worlds.launch({ownerId:shot.ownerId,weapon:shot.weapon,eye:originalPlayerEye(world.body),direction:shot.aimDirection,sourceRotation:shot.weapon==='rpg'?sourceRotationForSoloDirection(shot.aimDirection):undefined},this.elapsed);if(!admission.ok&&admission.reason!=='projectile-cap')throw Error(`Solo bot launch failed: ${admission.reason}`);
    }
    try{worlds.actors(this.elapsed);}
    finally{const pending=this.soloPendingGameplayFrame;if(pending?.worlds===worlds&&worlds.callbackPhase==='idle')pending.stage='actor-tail';}
    if(!this.originalActorDispatchActive(generation)||this.soloWorlds!==worlds)return;
    this.finishSoloActors(worlds);
    const frame=this.soloPendingGameplayFrame;if(frame?.worlds===worlds)frame.stage='authored';
  }

  private finishSoloActors(worlds:OriginalSoloObserverWorlds):void {
    if(this.soloWorlds!==worlds)return;
    const human=worlds.worlds.get('player');if(!human)return;
    this.originalBlasts.splice(0,this.originalBlasts.length,...[...human.blasts.values()].map(blast=>blast.state));
    if(!this.hasCommittedSoloProjectiles()){
    for(const projectile of this.projectiles)if(projectile.soloId&&projectile.source){const source=projectile.source;
      projectile.mesh.position.copy(source.position);projectile.velocity.copy(source.velocity);this.orientProjectileMesh(projectile.mesh,new THREE.Vector3().copy(source.direction),source.sourceRotation,source.angular);
      if(source.weapon==='rpg'&&source.remainingCallbacks<200&&!this.hasCommittedSoloTransients())this.originalCombatEffectPresentation?.spawnPuff(source.position,this.camera.position,Math.random,undefined,0,this.elapsed);
    }
    }else if(!this.hasCommittedSoloTransients())for(const projectile of human.projectiles.values()){
      const source=projectile.state;
      if(source.weapon==='rpg'&&source.remainingCallbacks<200)this.originalCombatEffectPresentation?.spawnPuff(source.position,this.camera.position,Math.random,undefined,0,this.elapsed);
    }
    this.arena.syncBarrels?.();this.syncSoloMirrors();
    const pickups=this.soloPickupCapture??[];this.soloPickupCapture=[];
    if(pickups.length)this.updateWeaponDrops(1/30,pickups);
    const observation=this.soloPendingGameplayFrame?.worlds===worlds?this.soloPendingGameplayFrame.actorObservation:undefined;
    if(observation)this.finishSoloActorCapture(observation.record,observation.dispatch,observation.generation);
  }

  private finishSoloActorCapture(record:SourceCallbackCaptureRecord,dispatch:unknown,generation:number):void {
    if(record.actorStage==='cancelled-gameover'){
      record.afterActors={stateUnavailable:'Registration cancelled during dispatch; no completed actor stage',dispatchBeforeActors:dispatch,dispatchGeneration:generation};
      return;
    }
    if(record.actorStage!=='pending')return;
    if(!this.originalActorDispatchActive(generation)){
      record.afterActors={stateUnavailable:'Registration cancelled during dispatch; no completed actor stage',dispatchBeforeActors:dispatch,dispatchGeneration:generation};record.actorStage='cancelled-gameover';
    }else{
      record.afterActors={state:this.captureSourceCallbackState(this.soloWorlds?.worlds.get('player')?.body),dispatchBeforeActors:dispatch,dispatchOrder:'Observer-local existing blasts then captured projectile actors'};record.actorStage='captured';
    }
    record.endedAt=performance.now();
  }

  private damageSoloEnemy(enemy:Enemy,amount:number,ownerId='player',ownerName=this.localCallsign,position?:Vec3):'ignored'|'damaged'|'killed' {
    const worlds=this.ensureSoloWorlds();if(!worlds)return enemy.damage(amount,this.elapsed);
    const result=worlds.damage(enemy.id,amount,this.elapsed,{ownerId,ownerName,position});return result?(result.dead?'killed':'damaged'):'ignored';
  }

  private originalActorDispatchGeneration=0;
  private resetOriginalActorDispatch():void {
    this.originalActorDispatchGeneration=(this.originalActorDispatchGeneration??0)+1;
    this.disposeSoloWorlds(true);
    const capture=this.sourceCallbackCaptureCurrent;
    if(!this.soloTeardown&&capture?.actorStage==='pending'){capture.actorStage='cancelled-gameover';capture.endedAt=performance.now();}
  }
  private originalActorDispatchActive(generation:number):boolean {
    return this.phase==='playing'&&(this.originalActorDispatchGeneration??0)===generation;
  }
  private nextSourceReloadPoll=-Infinity;
  private updateSourceWeaponInput(beforeGun?:()=>void,afterGun?:()=>void):void {
    if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)||this.archivalWinter||this.phase!=='playing'||!this.playerAlive)return;
    const frameTime=this.elapsed,generation=this.originalActorDispatchGeneration??0;
    if(!Number.isFinite(this.nextSourceReloadPoll))this.nextSourceReloadPoll=frameTime;
    if(frameTime+1e-9<this.nextSourceReloadPoll)return;
    // Replay at most one second of movie callbacks after a rendering stall.
    if(frameTime-this.nextSourceReloadPoll>1)this.nextSourceReloadPoll=frameTime-1;
    try {
    while(!(this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)&&this.originalActorDispatchActive(generation)&&this.playerAlive&&this.nextSourceReloadPoll<=frameTime+1e-9){
      this.elapsed=this.nextSourceReloadPoll;this.nextSourceReloadPoll+=1/30;
      this.advanceOriginalMuzzleFlashes();
      beforeGun?.();
      if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)||!this.originalActorDispatchActive(generation)||!this.playerAlive)break;
      if(this.soloPendingGameplayFrame){this.resumeSoloGameplayFrame();continue;}
      // The private callback already consumed its input and published loadout.
      // A saved old-slot gate is metadata, never a second firing permission.
      if(this.hasCommittedSoloLoadout()){
        this.advanceSourceWeaponPresentation(generation);
        afterGun?.();
        if(!this.originalActorDispatchActive(generation)||!this.playerAlive)break;
        if(!this.advanceCommittedSoloGunScope())this.advanceSourceScope(false);continue;
      }
      // weaponry.gun removes/reparents before reload and ammunition debit.
      // VOID selection leaves the prior model membership untouched.
      if(!this.weaponState.unarmed&&!this.currentSoloLocalWeaponPresentation())this.originalWeapons?.setLoaded('rpg',this.weaponState.current==='rpg'&&this.weaponState.ammo.rpg>0);
      let newScope=false;
      // Authority already advanced this gun state through its packet epoch.
      // Body callbacks still run; restored weapon counters cannot run backward.
      if(this.mode==='online'&&this.elapsed<=(this.sourceGunAuthorityLocalTime??-Infinity)+1e-9 ){newScope=this.openSourceScope();this.advanceSourceWeaponPresentation(generation);afterGun?.();if(!this.originalActorDispatchActive(generation))break;this.advanceSourceScope(newScope);continue;}
      let reloaded=false;
      if(!this.chatOpen&&!this.weaponState.unarmed&&this.keys.has('KeyR'))reloaded=this.reload(true);
      // weaponry.gun reloads before checking Dragunov/Shift: an empty R
      // can select another weapon or VOID before a sniper actor is created.
      newScope=this.openSourceScope();
      if(!reloaded)this.weaponState.stepSourceCounter(this.elapsed,{inputEnabled:!this.chatOpen});
      this.updateWeaponReload();
      if(!this.chatOpen&&!this.weaponState.unarmed){
        const id=this.weaponState.current;
        // weaponry.gun retains these values through both empty-RPG reloads.
        const bullets=this.weaponState.ammo[id],ready=this.weaponState.originalCounterState?.ready;
        if(ready&&id==='rpg'&&bullets===0)this.reload(false,this.mode==='online');
        if((this.firing||this.keys.has('ControlLeft')||this.keys.has('ControlRight'))&&ready){
          if(bullets===0){
            this.reload(false,this.mode==='online'&&id==='rpg'&&this.weaponState.current==='rpg',true);
            // weaponry.gun calls sortweapons after empty fire. Direct R can
            // return from reload before that refresh, so retain its old model.
            if(this.weaponState.unarmed){if(!this.currentSoloLocalWeaponPresentation()){this.sourceDisplayedWeapon=null;for(const model of this.weaponModels.values())model.visible=false;}this.updateHud();}
          }else this.tryFire();
        }
        const slots:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
        for(let slot=0;slot<slots.length;slot++)if(this.keys.has(`Digit${slot+1}`)){this.switchWeapon(slots[slot]);break;}
      }else if(!this.chatOpen){
        const slots:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
        for(let slot=0;slot<slots.length;slot++)if(this.keys.has(`Digit${slot+1}`)){this.switchWeapon(slots[slot]);break;}
      }
      if(!this.originalActorDispatchActive(generation)||!this.playerAlive)break;
      this.advanceSourceWeaponPresentation(generation);
      afterGun?.();
      if(!this.originalActorDispatchActive(generation))break;
      this.advanceSourceScope(newScope);
    }
    } finally {
      // A reentrant new life owns its clock; a terminal transition does not.
      if(this.phase!=='playing'||(this.originalActorDispatchGeneration??0)===generation)this.elapsed=frameTime;
    }
  }
  private resetSourceScope():void {
    this.originalScopeState=createOriginalScope();this.originalScopeActive=false;this.originalScopeFov=50;
    if(!this.archivalWinter&&this.originalWeaponPresentation)this.applyOriginalScopeProjection();
  }
  private openSourceScope():boolean {
    if(this.controlsPreset==='modern')return false;
    const state=this.originalScopeState??=createOriginalScope();
    return openOriginalScope(state,!this.weaponState.unarmed&&this.weaponState.current==='sniper',this.chatOpen,this.keys?.has('ShiftLeft')||this.keys?.has('ShiftRight')||false);
  }
  private advanceSourceScope(created:boolean):void {
    if(this.controlsPreset==='modern')return;
    const state=this.originalScopeState??=createOriginalScope();
    // Appended actors begin on the following nominal callback. Director's
    // mutation-during-actorList iteration timing has not been recovered.
    if(!created)stepOriginalScope(state,!this.weaponState.unarmed&&this.weaponState.current==='sniper',this.chatOpen,this.keys?.has('ShiftLeft')||this.keys?.has('ShiftRight')||false);
    this.originalScopeActive=state.active;this.originalScopeFov=state.fov;
    if(this.originalWeaponPresentation)this.applyOriginalScopeProjection();
  }
  private advanceCommittedSoloGunScope():boolean {
    const holder=this.soloCommittedGunOutput,world=this.soloWorlds?.worlds.get('player');
    if(!holder||holder.world!==world||!world?.alive||holder.callback!==world.callback||!holder.scopeFrame||!world.loadout||!world.localWeapons)return false;
    if(holder.scopeAdvanced)return true;
    holder.scopeAdvanced=true;
    const frame=holder.scopeFrame;
    // Committed callbacks own their captured control policy, including retry
    // and the later actor step. Omitted legacy policy means source controls.
    if(!(frame.sourceScopeEnabled??true))return true;
    const state=this.originalScopeState??=createOriginalScope();
    // Newly appended sniper actors start on the following nominal callback;
    // Director actorList mutation timing remains an explicit adapter limit.
    if(!holder.scopeCreated)stepOriginalScope(state,frame.weapon==='sniper',frame.typing,frame.shiftHeld);
    this.originalScopeActive=state.active;this.originalScopeFov=state.fov;
    if(this.originalWeaponPresentation)this.applyOriginalScopeProjection();
    return true;
  }
  private updateSourceReloadInput():void {this.updateSourceWeaponInput();}

  private advanceSourceWeaponPresentation(generation:number):void {
    // weaponry.stepFrame assigns the mesh after gun and choosegun. Staged
    // movement without a runtime retains its existing presentation cadence.
    if(this.arena?.runtime&&this.playerAlive&&this.originalActorDispatchActive(generation)){
      this.updateOriginalWeaponPresentation(1/30,false);
    }
  }

  private updateAutoReload():void {
    if(!this.playerAlive)return;
    if(this.mode==='online'&&(this.needsAuthoritativeSpawn||this.network?.state!=='connected'))return;
    const id=this.autoReloadWeapon;if(id===undefined||this.elapsed<this.autoReloadAt)return;
    this.autoReloadWeapon=undefined;this.autoReloadAt=Infinity;
    if(this.weaponState.current===id&&this.weaponState.ammo[id]===0)this.reload();
  }

  private updateWeaponReload():void {
    if(this.playerAlive&&this.weaponState.update(this.elapsed)){
      if(this.archivalWinter)this.audio.play('reload',.65);this.setMessage('WEAPON READY',.65);this.updateHud();
    }
  }

  private restoreViewModelParts(metadata:ViewModelWeaponMetadata):void {
    for(const part of Object.values(metadata.parts))if(part){const rest=this.viewPartRest.get(part);if(rest){part.position.copy(rest.position);part.rotation.copy(rest.rotation);}}
  }

  private offsetViewPart(part:THREE.Object3D|undefined,transform:{position:readonly[number,number,number];rotation:readonly[number,number,number]}|undefined):void {
    if(!part||!transform)return;const rest=this.viewPartRest.get(part);if(!rest)return;
    part.position.set(rest.position.x+transform.position[0],rest.position.y+transform.position[1],rest.position.z+transform.position[2]);
    part.rotation.set(rest.rotation.x+transform.rotation[0],rest.rotation.y+transform.rotation[1],rest.rotation.z+transform.rotation[2],rest.rotation.order);
  }

  private triggerViewModelFire(id:WeaponId):void {
    if(this.originalWeaponPresentation){
      if(!this.currentSoloLocalWeaponPresentation())this.originalWeaponPresentation.fire();return;
    }
    const impulse=WEAPON_VISUAL_PROFILES[id].recoilImpulse;
    this.viewRecoilPosition.x+=impulse.position[0];this.viewRecoilPosition.y+=impulse.position[1];this.viewRecoilPosition.z+=impulse.position[2];
    this.viewRecoilRotation.x+=impulse.rotation[0];this.viewRecoilRotation.y+=impulse.rotation[1];this.viewRecoilRotation.z+=impulse.rotation[2];
    this.viewActionPulse=1;
    if(id==='launcher')this.launcherCylinderAngle+=Math.PI/3;
  }

  private viewAnchorWorld(anchor:THREE.Object3D,target:THREE.Vector3):THREE.Vector3 {
    // getWorldPosition refreshes only the anchor's ancestor chain, so neither
    // path needs the full-scene updateMatrixWorld it previously forced.
    if(!this.enhancedRendering)return anchor.getWorldPosition(target);
    anchor.getWorldPosition(target);
    return target.applyQuaternion(this.camera.quaternion).add(this.camera.position);
  }

  private spawnCasing(id:WeaponId):void {
    if(this.originalWeapons)return;
    const profile=WEAPON_VISUAL_PROFILES[id];if(!profile.casingKind)return;
    const metadata=this.weaponMetadata.get(id);if(!metadata)return;
    const mesh=new THREE.Mesh(this.casingGeometry,profile.casingKind==='shotgun-shell'?this.shellMaterial:this.casingMaterial);
    if(profile.casingKind==='shotgun-shell')mesh.scale.set(1.35,1.28,1.35);
    this.viewAnchorWorld(metadata.anchors.ejection,mesh.position);
    mesh.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);mesh.castShadow=this.enhancedRendering;this.scene.add(mesh);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion);
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
    const velocity=right.multiplyScalar(1.8+Math.random()*1.25).addScaledVector(up,.9+Math.random()*.7).addScaledVector(forward,(Math.random()-.5)*.45);
    this.casings.push({mesh,velocity,angularVelocity:new THREE.Vector3(8+Math.random()*8,6+Math.random()*9,7+Math.random()*10),life:.9+Math.random()*.35,bounced:false});
  }

  private updateCasings(delta:number):void {
    for(let index=this.casings.length-1;index>=0;index--){const casing=this.casings[index];casing.life-=delta;casing.velocity.y-=9.2*delta;casing.mesh.position.addScaledVector(casing.velocity,delta);casing.mesh.rotation.x+=casing.angularVelocity.x*delta;casing.mesh.rotation.y+=casing.angularVelocity.y*delta;casing.mesh.rotation.z+=casing.angularVelocity.z*delta;
      const ground=(this.arena.supportHeightAt?.(casing.mesh.position.x,casing.mesh.position.z,casing.mesh.position.y+.1)??0)+.035;
      if(casing.mesh.position.y<ground&&!casing.bounced){casing.mesh.position.y=ground;casing.velocity.y=Math.abs(casing.velocity.y)*.28;casing.velocity.x*=.58;casing.velocity.z*=.58;casing.angularVelocity.multiplyScalar(.65);casing.bounced=true;}
      if(casing.life<=0){casing.mesh.removeFromParent();this.casings.splice(index,1);}
    }
  }

  private tryFire(): void {
    if (this.phase !== 'playing' || !this.playerAlive) return;
    if(this.hasCommittedSoloLoadout())return;
    this.flushOriginalReconciliation();
    if(this.mode==='online'&&(this.needsAuthoritativeSpawn||!this.network?.connected||performance.now()<this.onlineWeaponReadyAt)){this.setMessage(this.network?.connected?'WEAPON SYNCHRONIZING':'WAITING FOR ROOM',.45);return;}
    if(!this.archivalWinter&&this.mode==='online'&&this.pendingSourceShot)return;
    if(!this.archivalWinter&&this.mode==='online'&&this.sourceGunAwaitingInputSequence!==undefined)return;
    const id = this.weaponState.current;
    if(!this.archivalWinter&&this.mode==='online'&&this.sourceGunAuthorityCounter){
      const authority=this.sourceGunAuthorityCounter,serverNow=this.network?.estimatedServerTimeMs;
      if(serverNow!==undefined){
        const counter=new OriginalWeaponCounter(this.mapId as 'barrack'|'woodlands');counter.restore(authority.state);
        const callbacks=authority.state.ready&&authority.weapon===id?0:counter.framesUntilReady(id);
        // Body and gun callback phases can differ. The actual authority epoch
        // determines the first legal shot, without adding a transport margin.
        if(serverNow+1e-7<authority.epoch+callbacks*1000/30)return;
      }
    }
    const previousAmmo=this.weaponState.ammo[id],previousReserve=this.weaponState.reserve[id],previousCounter=this.weaponState.originalCounterState,
      previousReloading=this.weaponState.reloading,previousReloadEnd=this.weaponState.reloadEnd,previousLastShot=this.weaponState.lastShot;
    const spec=WEAPONS[id],sourceHit=getOriginalHitscan(this.archivalWinter?'winter':this.mapId,id),sourceRpg=!this.archivalWinter&&id==='rpg';
    let shotQueued=true;
    const executeShot=()=>{
      this.invulnerableUntil=this.elapsed;
      this.shots++; if(this.archivalWinter)this.recoil += spec.recoil;this.triggerViewModelFire(id);
      this.muzzleLight.intensity = id === 'rpg' ? 9 : 5.5;this.worldMuzzleLight.intensity=id==='rpg'?9:5;
      this.muzzleFlashRemaining=id==='rpg'?.075:.05;
      if(this.archivalWinter)this.audio.play(id === 'sniper' ? 'sniper' : 'shot');else if(id!=='rifle'){if(id==='rpg'){if(!this.currentSoloLocalWeaponPresentation())this.originalWeaponPresentation?.reload();this.playOriginalCombatSound(originalReloadSound(id),undefined,6);}if(!(this.isSourceSolo()&&(id==='launcher'||id==='rpg')))this.playOriginalCombatSound(originalFireSound(id),id==='launcher'||id==='rpg'?this.camera.position:undefined,id==='launcher'||id==='rpg'?7:6);}
      this.spawnMuzzleParticles(id === 'rpg' ? 14 : 5);
      this.spawnCasing(id);
      if (this.mode==='online'&&(id==='launcher'||id==='rpg'))shotQueued=this.fireNetworkExplosive(id,spec);
      else if (this.mode==='online')shotQueued=this.hitscan(spec);
      else if (id === 'rpg' || id === 'launcher') this.launchExplosive(id);
      else if (id === 'shotgun'&&!sourceHit) for (let pellet=0;pellet<8;pellet++) this.hitscan(spec);
      else this.hitscan(spec);
      if(!this.archivalWinter&&id==='rifle')this.playOriginalCombatSound(originalFireSound(id),undefined,6);
    };
    if (!this.weaponState.fire(this.elapsed,sourceRpg?executeShot:undefined)) {
      if (this.archivalWinter&&!this.weaponState.reloading&&this.weaponState.ammo[id] <= 0 && this.elapsed-this.weaponState.lastShot>.25) { this.audio.play('empty'); this.weaponState.lastShot=this.elapsed; this.setMessage('MAGAZINE EMPTY',.8); }
      return;
    }
    if(!sourceRpg)executeShot();
    if(!shotQueued){
      this.weaponState.ammo[id]=previousAmmo;
      if(!this.archivalWinter){this.weaponState.reserve[id]=previousReserve;this.weaponState.reloading=previousReloading;this.weaponState.reloadEnd=previousReloadEnd;this.weaponState.lastShot=previousLastShot;if(previousCounter)this.weaponState.applyOriginalCounter(previousCounter,this.elapsed);}
      if(this.autoReloadWeapon===id){this.autoReloadWeapon=undefined;this.autoReloadAt=Infinity;}this.updateHud();return;
    }
    // weaponry.gun calls sortweapons/whichgun after a successful shot.
    if(!this.archivalWinter&&this.weaponState.current==='rpg'&&!this.currentSoloLocalWeaponPresentation())this.originalWeapons?.setLoaded('rpg',true);
    if(!this.archivalWinter){
      this.pitch+=sourceHit?.pitchRecoilRadians??Math.PI/180;
      this.yaw+=originalHitscanYawRecoil(Math.random());
      this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
    }
    this.updateHud();
    if(this.archivalWinter&&this.weaponState.ammo[id]===0){this.autoReloadWeapon=id;this.autoReloadAt=this.elapsed+.35;}
  }

  private fireNetworkExplosive(id:'launcher'|'rpg',spec:typeof WEAPONS[WeaponId]):boolean {
    this.flushOriginalReconciliation();
    const sprinting=sprintHeld(this.controlsPreset,this.keys,this.aiming,this.arrowMovement);
    const spread=spec.spread*(this.aiming ? .2 : 1)*(sprinting?1.35:1);
    const direction=(this.archivalWinter?new THREE.Vector3((Math.random()-.5)*spread,(Math.random()-.5)*spread,-1):new THREE.Vector3(0,0,-1)).applyQuaternion(this.camera.quaternion).normalize();
    if(this.archivalWinter&&id==='launcher')direction.y+=.09;direction.normalize();
    const sourceRotation=!this.archivalWinter&&id==='rpg'?{x:this.pitch*180/Math.PI,y:0,z:this.yaw*180/Math.PI}:undefined;
    const shotId=this.network?.shoot({...(sourceRotation?{sourceRotation}:{}),origin:{x:this.camera.position.x,y:this.camera.position.y,z:this.camera.position.z},direction:{x:direction.x,y:direction.y,z:direction.z},weapon:id,...(this.archivalWinter&&id==='launcher'?{rg6Jump:this.rg6JumpIntent()}: {})});
    if(shotId){if(!this.archivalWinter)this.pendingSourceShot=shotId;this.predictNetworkProjectile(shotId,id,this.camera.position,direction,sourceRotation);}
    return shotId!==undefined;
  }

  /** Source modelsUnderRay also sees fadeaway skins, which are no longer baddies. */
  private sourceRemoteRayTargets():{meshes:THREE.Mesh[];corpseMeshes:Set<THREE.Mesh>} {
    const meshes=[...this.remotePlayers.values()].flatMap(remote=>remote.sourceActorActive?remote.hitMeshes:[]);
    const corpseMeshes=new Set<THREE.Mesh>();
    for(const corpse of this.sourceTimeoutCorpses??[])for(const mesh of corpse.hitMeshes){corpseMeshes.add(mesh);meshes.push(mesh);}
    return {meshes,corpseMeshes};
  }

  private soloRayTargets():{meshes:THREE.Mesh[];corpseMeshes:Set<THREE.Mesh>} {
    const members=new Set(this.soloWorlds?.worlds.get('player')?.mirror.freeze().map(p=>p.id)??[]);
    const meshes=this.enemies.flatMap(enemy=>members.has(enemy.id)?enemy.hitMeshes:[]),corpseMeshes=new Set<THREE.Mesh>();
    for(const corpse of this.soloCorpses.values()){corpseMeshes.add(corpse.mesh);meshes.push(corpse.mesh);}
    return {meshes,corpseMeshes};
  }

  private hitscan(spec: typeof WEAPONS[WeaponId]): boolean {
    this.flushOriginalReconciliation();
    const sprinting=sprintHeld(this.controlsPreset,this.keys,this.aiming,this.arrowMovement);
    const sourceHit=getOriginalHitscan(this.archivalWinter?'winter':this.mapId,spec.id);
    const muzzleOwner=this.originalWeapons;
    const muzzleWorld=sourceHit?this.captureOriginalMuzzleWorld(spec.id):undefined;
    let bulletOutput:(()=>void)|undefined,hurtPosition:Vec3|undefined;
    const range=sourceHit?.range??spec.range;
    const spread = sourceHit?0:spec.spread * (this.aiming ? .2 : 1) * (sprinting ? 1.35 : 1);
    const direction = new THREE.Vector3(
      (Math.random()-.5)*spread,
      (Math.random()-.5)*spread,
      -1,
    ).applyQuaternion(this.camera.quaternion).normalize();
    this.raycaster.set(this.camera.position, direction); this.raycaster.far = range;
    const sourceTargets=sourceHit?(this.mode==='online'?this.sourceRemoteRayTargets():this.isSourceSolo()?this.soloRayTargets():undefined):undefined;
    const targets = this.mode==='online'
      ? sourceTargets?.meshes??[...this.remotePlayers.values()].flatMap((remote)=>remote.sourceActorActive?remote.hitMeshes:[])
      : sourceTargets?.meshes??this.enemies.flatMap((enemy) => enemy.alive ? enemy.hitMeshes : []);
    for(const mesh of targets)mesh.updateWorldMatrix(true,false);
    const hits = this.raycaster.intersectObjects(targets, false);
    const sourceWorldHit=sourceHit?this.raycastWorld(this.camera.position,direction,range,true):undefined;
    const worldDistance = sourceHit?(sourceWorldHit?.distance??range):this.distanceToWorld(this.camera.position,direction,range);
    const shotId=this.mode==='online'?this.network?.shoot({origin:{x:this.camera.position.x,y:this.camera.position.y,z:this.camera.position.z},direction:{x:direction.x,y:direction.y,z:direction.z},weapon:this.weaponState.current}):undefined;
    if(shotId&&sourceHit)this.pendingSourceShot=shotId;
    let effectPoint=this.camera.position.clone().addScaledVector(direction,worldDistance);
    if (hits.length && hits[0].distance < worldDistance) {
      const hit = hits[0];effectPoint=hit.point;
      const corpseHit=sourceTargets?.corpseMeshes.has(hit.object as THREE.Mesh)===true;
      const enemy=hit.object.userData.enemy as Enemy|undefined;
      const remoteId=hit.object.userData.remoteId;
      const remote=typeof remoteId==='string'?this.remotePlayers?.get(remoteId):undefined;
      // Source blood requires the queried model to belong to a registered
      // baddy. Retained geometry or stale owner metadata alone is insufficient.
      const sourceOwner=sourceHit&&(this.mode==='online'
        ?remote?.sourceActorActive&&remote.hitMeshes.includes(hit.object as THREE.Mesh)
        :enemy&&this.enemies.includes(enemy)&&enemy.hitMeshes.includes(hit.object as THREE.Mesh));
      if(sourceHit&&(corpseHit||!sourceOwner)){
        const normal=hit.face?.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()??direction.clone().negate();
        bulletOutput=()=>{if(!this.hasCommittedSoloTransients())this.originalCombatEffectPresentation?.spawnMiss(hit.point,normal,spec.id==='shotgun',undefined,this.elapsed);};
      }else{
      if(sourceHit){const bloodPoint=hit.point.clone().addScaledVector(direction,-25*ORIGINAL_MAP_SCALE),eye=this.camera.position.clone();bulletOutput=()=>{if(!this.hasCommittedSoloTransients())this.originalCombatEffectPresentation?.spawnBlood(bloodPoint,eye,undefined,this.elapsed);};}
      if(this.mode==='online'){
        const targetId=hit.object.userData.remoteId as string|undefined;
        if(sourceHit&&remote){
          hurtPosition={x:remote.group.position.x,y:remote.group.position.y+PLAYER_HEIGHT,z:remote.group.position.z};
          if(shotId&&targetId)this.rememberNetworkKey(this.predictedSourceHitHurts??=new Set<string>(),JSON.stringify([shotId,targetId]));
        }
        if(shotId&&targetId)this.network?.hit({shotId,targetId});
      }else{
        if (!enemy) return true;
        else{
        // baddies.hurt is presentation, independent of canonical damage acceptance.
        if(sourceHit)hurtPosition={x:enemy.group?.position.x??hit.point.x,y:(enemy.group?.position.y??hit.point.y)+PLAYER_HEIGHT,z:enemy.group?.position.z??hit.point.z};
        const headshot = !sourceHit&&hit.object.userData.zone === 'head';
        const result = this.isSourceSolo()?this.damageSoloEnemy(enemy,(sourceHit?.damage??spec.damage)*(headshot?spec.headMultiplier:1),'player',this.localCallsign,this.camera.position):enemy.damage((sourceHit?.damage??spec.damage)*(headshot?spec.headMultiplier:1),this.elapsed);
        if(result!=='ignored'){const killed=result==='killed';this.hits++; this.showHitmarker(killed,headshot); if(this.archivalWinter)this.audio.play('hit',.8);
        if(this.archivalWinter)this.spawnImpact(hit.point,direction.clone().negate(),killed?10:7,killed?.8:1,false,'flesh');
        if (killed&&!this.isSourceSolo()) this.registerKill(headshot,enemy);}
        }
      }
      }
    } else if(worldDistance<range-.01){if(sourceHit){const normal=sourceWorldHit?new THREE.Vector3().copy(sourceWorldHit.normal):this.surfaceNormalAt(effectPoint,direction);bulletOutput=()=>{if(!this.hasCommittedSoloTransients())this.originalCombatEffectPresentation?.spawnMiss(effectPoint,normal,spec.id==='shotgun',undefined,this.elapsed);};}else this.spawnImpact(effectPoint,this.surfaceNormalAt(effectPoint,direction),5,1.05,true);}
    // The existing authority/query adapter aggregates damage once. Present each
    // source bullet's output before its independent muzzle actor.
    if(sourceHit)for(let ray=0;ray<sourceHit.rays;ray++){
      if(hurtPosition)this.playOriginalCombatSound('hurt',hurtPosition);
      bulletOutput?.();
      if(muzzleWorld)this.spawnOriginalMuzzleFlash(spec.id,muzzleWorld,muzzleOwner);
    }
    if(sourceHit&&this.isSourceSolo()&&(hits.length&&hits[0].distance<worldDistance||worldDistance<range-.01))this.soloWorlds?.reportShots('player',sourceHit.rays);
    this.spawnTracer(effectPoint);
    return this.mode!=='online'||shotId!==undefined;
  }

  private soloWorldDistance(id:string,origin:Vec3,direction:Vec3,max:number):number {
    if(this.isSourceSolo()){const worlds=this.ensureSoloWorlds();if(!worlds?.worlds.has(id))return 0;return worlds.raycast(id,origin,direction,max,{includeGround:true})?.distance??max;}
    return this.distanceToWorld(new THREE.Vector3().copy(origin),new THREE.Vector3().copy(direction),max);
  }

  private distanceToWorld(origin: THREE.Vector3, direction: THREE.Vector3, max: number,sourceBullet=false): number {
    return this.raycastWorld(origin,direction,max,sourceBullet)?.distance??max;
  }

  private raycastWorld(origin:THREE.Vector3,direction:THREE.Vector3,max:number,sourceBullet=false) {
    const options={includeGround:true,...(sourceBullet&&!this.archivalWinter?{excludeModel:(name:string)=>originalBulletExcludesModel(this.mapId,name)}:{})};
    const fixed=this.archivalWinter?raycastArena(origin,direction,max,{includeGround:true}):this.arena.runtime
      ?this.arena.runtime.geometry.raycast(origin,direction,max,options)
      :raycastLegacyMap(this.mapId,origin,direction,max,{includeGround:true});
    const barrel=!this.archivalWinter?this.arena.barrelWorld?.raycast(origin,direction,max):undefined;
    const world=barrel&&barrel.distance<(fixed?.distance??Infinity)?barrel:fixed;
    const sky=sourceBullet&&!this.archivalWinter&&this.arena.runtime
      ?raycastOriginalSky(this.arena.runtime.data,this.arena.runtime.scale,origin,direction,max):null;
    let nearest=sky&&sky.distance<(world?.distance??Infinity)?sky:world;
    if(sourceBullet&&!this.archivalWinter){
      const active=this.mode==='online'?[...(this.networkProjectiles?.values()??[])]:this.projectiles??[];
      for(const projectile of active){
        if(!projectile.source||!projectile.mesh.userData.sourceProjectile)continue;
        const hit=raycastOriginalProjectileMesh(projectile.mesh,origin,direction,nearest?.distance??max,projectile.mesh.uuid);
        if(hit&&hit.distance<(nearest?.distance??Infinity))nearest=hit;
      }
    }
    return nearest;
  }

  private installOriginalMap(id:LegacyMapId):void {
    this.cancelOriginalReconciliation();
    const asset=this.originalMaps?.[id];
    if(!asset)throw new Error(`Original ${id} assets are required before Game starts`);
    const arena=createOriginalArena(this.scene,id,asset);
    this.legacyArena=arena;this.arena={...arena,map:id};this.originalBarrelAuthorityTime=-Infinity;this.originalBarrelReceivedTime=-Infinity;this.originalBarrelSnapshotBodies=[];
    // Include the generated sky; createOriginalScene's bounds predate its addition.
    this.originalDrawBounds=new THREE.Box3().setFromObject(arena.group).getBoundingSphere(new THREE.Sphere());
    this.updateOriginalDrawDistance();
  }

  private updateOriginalDrawDistance():void {
    if(this.archivalWinter||!this.originalDrawBounds)return;
    const far=originalDrawDistance(this.originalDrawBounds,this.camera.position);
    if(this.camera.far!==far){this.camera.far=far;this.camera.updateProjectionMatrix();}
  }

  private applyOriginalSpawnOrientation(index:number):void {
    if(!this.arena.runtime)return;
    const rotation=ORIGINAL_SOURCE_SPAWNS[this.mapId][index].rotation;
    this.yaw=THREE.MathUtils.degToRad(rotation[2]);this.pitch=THREE.MathUtils.degToRad(rotation[0]);
    this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
    this.camera.fov=50;this.camera.updateProjectionMatrix();
  }

  private selectMap(id:LegacyMapId):void {
    if(this.archivalWinter||id===this.mapId&&this.legacyArena)return;
    if(this.deferSoloTeardown('map',()=>this.selectMap(id)))return;
    this.resetOriginalProjectileModels();
    this.resetOriginalPlaneEffects();
    this.clearOriginalMuzzleFlashes();this.clearEnemies();this.clearRemotePlayers();this.originalSoldierResources?.muzzleModels.reset();this.clearWeaponDrops();this.clearNetworkDrops();
    this.legacyArena?.dispose();this.mapId=id;this.weaponState.map=id;document.body.dataset.map=id;
    this.installOriginalMap(id);
    this.atmosphere.setMap?.(id);byId<HTMLSelectElement>('map-select').value=id;
    const spawn=this.arena.spawnPoints[0];this.camera.position.set(spawn.x,spawn.y+PLAYER_HEIGHT,spawn.z);
    this.applyOriginalSpawnOrientation(0);
    this.velocity.set(0,0,0);this.grounded=true;
    this.pendingCollections.clear();this.combatImpactMarks.clear();
    this.originalCombatEffectPresentation?.clear();
    this.weaponState.reset();this.nextSourceReloadPoll=-Infinity;this.syncWeaponPresentation(this.weaponState.current,false);this.updateHud();
    if(this.mode==='solo'&&(this.phase==='playing'||this.phase==='paused'))this.spawnEnemies();
    if(this.phase==='menu'&&this.mode==='online')void this.refreshRooms();
  }

  private setReferenceView(name:string):void {
    if(!new URLSearchParams(location.search).has('e2e'))return;
    let view=getLegacyReferenceCameras(this.mapId).find(v=>v.name===name);if(!view)return;
    this.cancelOriginalReconciliation();
    this.registeredReferenceAspect=null;this.camera.up.set(0,1,0);this.camera.aspect=innerWidth/innerHeight;
    this.viewCamera.aspect=this.camera.aspect;this.viewCamera.updateProjectionMatrix();
    if(this.arena.runtime){
      const stations=this.mapId==='barrack'
        ?['courtyard','pink-facade','ramp','roof','interior','treeline']
        :['hills','cottage','interior','shed','outbuilding','outbuilding-yard','forest','gully','stonebarn-interior','cliffview-interior'];
      const index=Math.max(0,stations.indexOf(name))%6;
      const spawn=this.arena.runtime.spawnPoints[index],rotation=ORIGINAL_SOURCE_SPAWNS[this.mapId][index].rotation;
      const yaw=THREE.MathUtils.degToRad(rotation[2]),pitch=THREE.MathUtils.degToRad(rotation[0]);
      const position=new THREE.Vector3(spawn.x,spawn.y+PLAYER_HEIGHT,spawn.z);
      const target=position.clone().add(new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(10));
      if(this.mapId==='barrack'&&name==='roof'){const other=this.arena.runtime.spawnPoints[4];target.set(other.x,other.y+PLAYER_HEIGHT,other.z);}
      if(this.mapId==='barrack'&&name==='ramp'){const first=this.arena.runtime.spawnPoints[0],rot=ORIGINAL_SOURCE_SPAWNS.barrack[0].rotation;position.set(first.x,first.y+PLAYER_HEIGHT,first.z);const angle=THREE.MathUtils.degToRad(rot[2]);target.copy(position).add(new THREE.Vector3(-Math.sin(angle),0,-Math.cos(angle)).multiplyScalar(10));}
      const modelName=this.mapId==='woodlands'?({cottage:'woodenlodge',interior:'woodenshed',shed:'woodenshed',outbuilding:'stonebarn','outbuilding-yard':'stonebarn','stonebarn-interior':'stonebarn','cliffview-interior':'cliffview'} as Record<string,string>)[name]:({interior:'hangar','pink-facade':'bigredfellaopen'} as Record<string,string>)[name];
      const model=modelName?this.legacyArena?.group.getObjectByName(modelName):undefined;
      if(model){
        this.legacyArena!.group.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
        if(this.mapId==='woodlands'&&name==='cliffview-interior'){
          // Source face141 covers this footprint with upward winding and board UVs.
          // Authored window-room review pose; historical camera remains unregistered.
          const eyeZ=-84.75373077392578+PLAYER_HEIGHT/this.arena.runtime.scale;
          position.copy(model.localToWorld(new THREE.Vector3(-235,260,eyeZ)));
          target.copy(model.localToWorld(new THREE.Vector3(-350,400,-12)));
        }else if(this.mapId==='woodlands'&&name==='stonebarn-interior'){
          // The 22s room reference is stonebarn, distinct from the timber shed.
          // Authored local review pose inside its walls; not footage registration.
          // The wall-bottom level supplies a candidate floor, not support proof.
          const eyeZ=-0.23757171630859375+PLAYER_HEIGHT/this.arena.runtime.scale;
          position.copy(model.localToWorld(new THREE.Vector3(-900,100,eyeZ)));
          target.copy(model.localToWorld(new THREE.Vector3(-420,50,eyeZ)));
        }else if(name==='interior'||name==='shed'){
          // Several named resources batch distant buildings. Their overall box
          // centre is empty terrain; use the source model origin for this room.
          const origin=new THREE.Vector3().setFromMatrixPosition(model.matrixWorld);
          position.copy(origin);position.y=(this.arena.runtime.geometry.playerSupportHeightAt(origin.x,origin.z,origin.y+.6,this.arena.runtime.profile.radius,this.arena.runtime.profile.bodyHeight)??origin.y)+PLAYER_HEIGHT;
          target.copy(position).add(new THREE.Vector3(3,-2,6));
        }else{
          position.set(center.x+size.x*.65,center.y,center.z+Math.max(5,size.z*1.4));
          position.y=(this.arena.groundHeightAt?.(position.x,position.z)??box.min.y)+PLAYER_HEIGHT+(name==='outbuilding-yard'?3:0);
          target.copy(center);
        }
      }
      view={name,position:position.toArray() as [number,number,number],target:target.toArray() as [number,number,number],reference:'Recovered source spawn/mesh review station; footage camera registration remains pending'};
      this.camera.fov=50;this.camera.updateProjectionMatrix();
    }
    this.environmentReviewTime=12.5;this.soldierReviewMode=true;this.releaseActiveInput();
    if(this.phase==='playing')this.pause();
    byId('hud').classList.add('hidden');byId('pause').classList.add('hidden');
    this.enemies.forEach(e=>e.group.visible=false);this.arena.pickups.forEach(p=>p.mesh.visible=false);
    this.camera.position.fromArray(view.position);this.camera.lookAt(new THREE.Vector3().fromArray(view.target));
    this.updateOriginalDrawDistance();
    this.camera.rotation.reorder('YXZ');this.yaw=this.camera.rotation.y;this.pitch=this.camera.rotation.x;
    this.velocity.set(0,0,0);this.checkpointSoloHumanBody();
  }

  private updateLegacyPickups(time:number):void {
    const definitions=getLegacyMap(this.mapId).pickups;
    for(const pickup of this.arena.pickups){
      const spec=definitions.find(p=>p.id===pickup.mesh.userData.pickupId);if(!spec)continue;
      if(!(this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)&&this.mode==='solo'&&!pickup.active&&this.phase==='playing'&&time>=pickup.respawnAt){pickup.active=true;pickup.mesh.visible=true;}
      pickup.mesh.rotation.y=time*.65;
      pickup.mesh.position.y=spec.position[1]+Math.sin(time*2.5+spec.position[0])*.06;
    }
  }

  private async refreshRooms():Promise<void> {
    const generation=++this.roomDirectoryGeneration,map=this.mapId;
    const list=byId('room-list');list.textContent='LOADING ROOMS…';
    const directory=new NetworkClient();
    try{
      const rooms=(await directory.listRooms()).filter(room=>room.map===map);
      if(this.phase!=='menu'||generation!==this.roomDirectoryGeneration)return;list.replaceChildren();
      for(const room of rooms){
        const button=document.createElement('button');button.type='button';
        button.textContent=`${room.room} · ${room.players}/${room.capacity}${room.players>=room.capacity?' FULL':''}`;
        button.disabled=room.players>=room.capacity||room.state==='finished';
        button.addEventListener('click',()=>{byId<HTMLInputElement>('room-code').value=room.room;list.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===button));});list.append(button);
      }
      if(rooms.length===0)list.textContent='NO ROOMS YET · ENTER A NAME TO CREATE ONE';
    }catch{if(generation===this.roomDirectoryGeneration&&this.phase==='menu'){list.textContent='ROOM LIST UNAVAILABLE';this.setConnectionNote('START THE ROOM SERVER TO PLAY ONLINE',true);}}
    finally{directory.dispose();}
  }

  private handlePointerLockChange():void {
    if(document.pointerLockElement===this.renderer.domElement)this.sourceEscapeCaptureReleased=false;
    if(this.phase==='playing'&&!this.chatOpen&&document.pointerLockElement!==this.renderer.domElement
      &&(this.archivalWinter||!this.sourceEscapeCaptureReleased))this.pause();
  }

  /** goody Escape is direct Barrack walking death, otherwise hurt1000.
   * The online operation waits for authority, preserving typing if survived.
   */
  private requestSourceEscape():void {
    if(this.archivalWinter||this.phase!=='playing'||!this.playerAlive||this.needsAuthoritativeSpawn||this.sourceEscapePending)return;
    if(this.mode==='online'){
      if(!this.network?.connected)return;
      this.publishNetworkTransform();this.sourceEscapePending=this.network.sourceEscape();
      if(!this.sourceEscapePending)return;
    }
    this.sourceEscapeCaptureReleased=true;
    if(this.mode==='online')return;
    const ownName=isOriginalCowardiceName(this.localCallsign);
    const actor=ownName?undefined:this.enemies.find(enemy=>enemy.alive&&isOriginalCowardiceName(enemy.name));
    if(this.mapId==='barrack'&&!this.chatOpen){this.killPlayer(actor,'Cowardice');return;}
    const position=ownName?this.camera.position
      :actor?{x:actor.group.position.x,y:actor.group.position.y+PLAYER_HEIGHT,z:actor.group.position.z}:undefined;
    this.takeDamage(1000,this.camera.position,actor,position,'Cowardice');
  }

  private openChat():void {
    const sourceRuntime=!this.archivalWinter&&!!this.arena?.runtime;
    const pendingMouse=sourceRuntime?this.originalMouseDelta:undefined;
    this.chatOpen=true;this.weaponState.setOriginalTyping(true);if(!this.archivalWinter&&this.phase==='playing'&&this.playerAlive&&this.network?.connected){this.publishNetworkTransform();this.network.flushTransform();}this.releaseActiveInput(sourceRuntime);
    // goody keeps recentering and applying mouse motion while ptyping blocks
    // movement and gun input. Opening the talk member does not discard motion
    // or physically held keys/buttons; ordinary up events still release them.
    if(pendingMouse)this.originalMouseDelta=pendingMouse;
    const input=byId<HTMLInputElement>('chat-input');
    if(!this.archivalWinter){this.sourceTalkPrefix=ORIGINAL_TALK_PREFIX;input.value='';input.maxLength=ORIGINAL_TALK_MAX_CHARACTERS-this.sourceTalkPrefix.length;input.placeholder='';byId('chat-label').textContent=this.sourceTalkPrefix;}
    else{input.maxLength=180;input.placeholder='Type a message…';byId('chat-label').textContent='SAY';}
    byId('chat-form').classList.remove('hidden');
    if(!sourceRuntime&&document.pointerLockElement)document.exitPointerLock();
    byId<HTMLInputElement>('chat-input').focus();
  }

  private closeChat(capture=true):void {
    if(!this.chatOpen)return;this.chatOpen=false;this.weaponState.setOriginalTyping(false);if(!this.archivalWinter&&this.phase==='playing'&&this.playerAlive&&this.network?.connected){
      this.publishNetworkTransform();
      if(this.network.flushTransform())this.sourceGunAwaitingInputSequence=this.network.lastSentTransformSequence;
      // The completed callback in an older loadout still ran with typing set.
      // Resume gun prediction only after this input transition is acknowledged.
    }
    byId('chat-form').classList.add('hidden');byId<HTMLInputElement>('chat-input').blur();
    const sourceRuntime=!this.archivalWinter&&!!this.arena?.runtime;
    const pendingMouse=sourceRuntime?this.originalMouseDelta:undefined;
    this.releaseActiveInput(sourceRuntime);if(pendingMouse)this.originalMouseDelta=pendingMouse;
    if(capture&&this.phase==='playing')this.requestPointerCapture();
  }

  /** Both recovered goody.keywalk scripts send names to the ordinary feedback log. */
  private showCurrentMembers():void {
    // baddies is the source actor registry, not the room's standing records.
    // Pending death remains registered until its callback transfers the remote
    // into the separate fadeaway set; a retained corpse is no longer a member.
    const localNames=this.playerAlive?[this.localCallsign]:[];
    const names=this.archivalWinter
      ? this.mode==='online'?(this.latestNetworkSnapshot?.players??[]).map(player=>player.name)
        : [byId<HTMLInputElement>('callsign').value.trim()||'YOU',...this.enemies.map(enemy=>enemy.name)]
      : this.mode==='online'
        ? [...localNames,...Array.from(this.remotePlayers.values()).filter(remote=>remote.sourceActorActive).map(remote=>remote.name)]
        : [...localNames,...this.enemies.filter(enemy=>enemy.alive).map(enemy=>enemy.name)];
    this.appendChat('',`Members: ${names.map(name=>name+' ').join('')}`,'feedback');
  }

  private sendChat():void {
    const input=byId<HTMLInputElement>('chat-input');
    const text=this.archivalWinter?input.value.trim():((this.sourceTalkPrefix??ORIGINAL_TALK_PREFIX)+input.value).slice(0,ORIGINAL_TALK_MAX_CHARACTERS);
    if(!text){this.closeChat();return;}
    if(this.mode==='online'){
      if(!this.network?.chat(text)){this.appendChat('SYSTEM','MESSAGE NOT SENT · CHECK CONNECTION');return;}
    }else this.appendChat(this.archivalWinter?byId<HTMLInputElement>('callsign').value.trim()||'YOU':this.localCallsign,text);
    input.value='';this.closeChat();
  }

  private appendChat(name:string,text:string,kind:'player'|'system'|'welcome'|'feedback'=name==='SYSTEM'?'system':'player'):void {
    const log=byId('chat-log');
    const className=kind==='system'?'system':kind==='feedback'?'feedback':'player-message';
    if(!this.archivalWinter){
      const news=(kind==='player'?originalTalkFeedbackText(name,text):text).replace(/\r\n|\n/g,'\r');
      const previousClasses=Array.from(log.children).map(line=>line.className);
      this.sourceFeedbackText=originalFeedbackText(this.sourceFeedbackText??'',news);
      const addedLines=originalFeedbackLines(news).length;
      log.replaceChildren(...originalFeedbackLines(this.sourceFeedbackText).map((text,index)=>{
        const line=document.createElement('div');line.textContent=text;
        line.className=index<addedLines?className:previousClasses[index-addedLines]??'player-message';
        return line;
      }));
      log.scrollTop=0;return;
    }
    const line=document.createElement('div');line.className=className;line.textContent=kind==='player'?`${name}: ${text}`:text;log.append(line);
    while(log.children.length>8)log.firstElementChild?.remove();log.scrollTop=log.scrollHeight;
  }

  private saveSettings():void {
    try{localStorage.setItem('russias-army-settings',JSON.stringify({controls:this.controlsPreset,arrows:this.arrowMovement,sensitivity:this.sensitivity,volume:Number(byId<HTMLInputElement>('volume').value)}));}catch{/* Settings remain usable when browser storage is unavailable. */}
  }

  private loadSettings():void {
    try{
      const saved=JSON.parse(localStorage.getItem('russias-army-settings')??'null') as {controls?:unknown;arrows?:unknown;sensitivity?:unknown;volume?:unknown}|null;
      if(saved?.controls==='modern'||saved?.controls==='legacy')this.controlsPreset=saved.controls;
      if(typeof saved?.arrows==='boolean')this.arrowMovement=saved.arrows;
      if(typeof saved?.sensitivity==='number'&&saved.sensitivity>=.3&&saved.sensitivity<=1.8)this.sensitivity=saved.sensitivity;
      if(typeof saved?.volume==='number'&&saved.volume>=0&&saved.volume<=1){byId<HTMLInputElement>('volume').value=String(saved.volume);this.audio.setVolume(saved.volume);}
    }catch{/* Invalid or unavailable storage uses the documented defaults. */}
    byId<HTMLSelectElement>('controls-preset').value=this.controlsPreset;
    byId<HTMLInputElement>('sensitivity').value=String(this.sensitivity);
    byId<HTMLInputElement>('arrow-movement').checked=this.arrowMovement;
    document.body.classList.toggle('modern-controls',this.controlsPreset==='modern');
  }

  private reconcileNetworkItems(snapshot:NetworkSnapshot):void {
    for(const pickup of this.arena.pickups){
      const authoritative=snapshot.pickups?.find(p=>p.id===pickup.mesh.userData.pickupId);
      pickup.active=authoritative?.active??false;pickup.mesh.visible=pickup.active;
    }
    const present=new Set<string>();
    for(const drop of snapshot.drops??[]){
      present.add(drop.id);let visual=this.networkDropVisuals.get(drop.id);
      if(!visual){visual=this.createDroppedWeapon(drop.weapon);this.networkDropVisuals.set(drop.id,visual);}
      visual.position.set(drop.position.x,drop.position.y,drop.position.z);visual.rotation.y=this.archivalWinter?this.elapsed*.35:drop.yaw??0;
    }
    for(const [id,visual] of this.networkDropVisuals)if(!present.has(id)){visual.removeFromParent();this.networkDropVisuals.delete(id);this.pendingCollections.delete(id);}
  }

  private collectNetworkItems():void {
    this.flushOriginalReconciliation();
    if(!this.network?.connected||!this.latestNetworkSnapshot)return;
    const p=this.camera.position,foot=p.y-PLAYER_HEIGHT;
    const items=[...(this.latestNetworkSnapshot.pickups??[]).filter(i=>i.active),...(this.latestNetworkSnapshot.drops??[])];
    for(const item of items){
      if(this.arena.runtime){if(!originalPickupInReach(p,item.position,this.arena.runtime.scale))continue;}
      else if(Math.hypot(item.position.x-p.x,item.position.z-p.z)>1.35||Math.abs(item.position.y-foot)>1.5)continue;
      if(this.elapsed-(this.pendingCollections.get(item.id)??-Infinity)<1)continue;
      this.pendingCollections.set(item.id,this.elapsed);this.network.collect(item.id);
    }
  }

  private clearNetworkDrops():void {
    for(const group of this.networkDropVisuals.values())group.removeFromParent();this.networkDropVisuals.clear();
  }

  private surfaceNormalAt(point:THREE.Vector3,incoming:THREE.Vector3):THREE.Vector3 {
    const fallback=incoming.clone().negate().normalize();let nearest=.12;const result=fallback.clone();
    for(const box of this.arena.colliders){
      if(point.x<box.min.x-.08||point.x>box.max.x+.08||point.y<box.min.y-.08||point.y>box.max.y+.08||point.z<box.min.z-.08||point.z>box.max.z+.08)continue;
      const faces:[number,number,number,number][]=[
        [Math.abs(point.x-box.min.x),-1,0,0],[Math.abs(point.x-box.max.x),1,0,0],
        [Math.abs(point.y-box.min.y),0,-1,0],[Math.abs(point.y-box.max.y),0,1,0],
        [Math.abs(point.z-box.min.z),0,0,-1],[Math.abs(point.z-box.max.z),0,0,1],
      ];
      for(const [distance,x,y,z] of faces)if(distance<nearest){nearest=distance;result.set(x,y,z);}
    }
    return result;
  }

  private rg6JumpIntent():RG6JumpIntent {
    const {forward}=movementAxes(this.chatOpen?new Set():this.keys,this.arrowMovement,this.archivalWinter?'modern':this.controlsPreset);
    return {forward:!this.archivalWinter&&forward>0,jump:!this.chatOpen&&this.keys.has('Space')};
  }

  private launchExplosive(id: 'rpg' | 'launcher'): void {
    const direction = new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion).normalize();
    if(this.isSourceSolo()){const admission=this.ensureSoloWorlds()?.launch({ownerId:'player',weapon:id,eye:this.camera.position,direction,sourceRotation:id==='rpg'?{x:this.pitch*180/Math.PI,y:0,z:this.yaw*180/Math.PI}:undefined},this.elapsed);if(admission&&!admission.ok)this.setMessage(`PROJECTILE ADMISSION: ${admission.reason}`,1);return;}
    if(!this.archivalWinter){
      const source=createOriginalProjectile(id,this.camera.position,direction,'player',id==='rpg'?{x:this.pitch*180/Math.PI,y:0,z:this.yaw*180/Math.PI}:undefined);
      const mesh=this.createProjectileMesh(id);
      mesh.position.copy(source.position);this.orientProjectileMesh(mesh,direction,source.sourceRotation,source.angular);this.scene.add(mesh);
      this.projectiles.push({mesh,velocity:new THREE.Vector3().copy(source.velocity),life:0,radius:250*ORIGINAL_MAP_SCALE,damage:5,grenade:id==='launcher',impact:false,owner:'player',source});return;
    }
    if (id === 'launcher') direction.y += .09;
    direction.normalize();
    const rg6JumpEligible=rg6JumpLaunchEligible(id,direction,this.rg6JumpIntent());
    const clearance=this.distanceToWorld(this.camera.position,direction,1.2);
    if(clearance<1.15){this.explode(this.camera.position.clone().addScaledVector(direction,clearance),id==='rpg'?5.5:4.3,WEAPONS[id].damage,'player',rg6JumpEligible);return;}
    const mesh = new THREE.Mesh(id==='rpg'?this.projectileRocketGeometry:this.projectileShellGeometry,this.projectileShellMaterial);
    mesh.rotation.x=Math.PI/2; mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
    mesh.position.copy(this.camera.position).addScaledVector(direction,1.2); this.scene.add(mesh);
    this.projectiles.push({mesh,velocity:direction.multiplyScalar(id === 'rpg'?31:18),life:id === 'rpg'?3.5:2.8,radius:id === 'rpg'?5.5:4.3,damage:WEAPONS[id].damage,grenade:id === 'launcher',impact:true,owner:'player',rg6JumpEligible});
  }

  private throwGrenade(): void {
    if(this.grenades<=0){this.setMessage('NO GRENADES',.8);return;}
    if(this.weaponState.reloading){this.setMessage('RELOAD IN PROGRESS',.8);return;}
    this.grenades--;this.invulnerableUntil=this.elapsed; this.shots++; const direction=new THREE.Vector3(0,.13,-1).applyQuaternion(this.camera.quaternion).normalize();
    const mesh=new THREE.Mesh(this.grenadeGeometry,this.grenadeMaterial);
    mesh.position.copy(this.camera.position).addScaledVector(direction,.7); mesh.castShadow=true; this.scene.add(mesh);
    this.projectiles.push({mesh,velocity:direction.multiplyScalar(14).add(new THREE.Vector3(0,2.8,0)),life:2.4,radius:5,damage:120,grenade:true,impact:false,owner:'player'});
    this.audio.play('reload',.65); this.updateHud();
  }

  private registerKill(headshot: boolean,victim:Enemy): void {
    if(this.phase!=='playing')return;
    victim.deaths++;if(!this.archivalWinter)this.playOriginalCombatSound('hurt',{x:victim.group.position.x,y:victim.group.position.y+PLAYER_HEIGHT,z:victim.group.position.z});this.dropWeapon(victim);
    this.kills++; this.score += this.archivalWinter?(headshot ? 250 : 150):ORIGINAL_KILL_SCORE;
    this.addKillFeed('YOU',victim.name,headshot);
    this.setMessage(this.archivalWinter?(headshot?'HEADSHOT +250':'ELIMINATION +150'):'ELIMINATION +30',1.2); this.updateHud();
    if (this.archivalWinter&&this.kills>=KILL_LIMIT)this.endRound(true);
  }

  private updateProjectiles(delta: number): void {
    if(!this.archivalWinter){const generation=this.originalActorDispatchGeneration??0;if(!this.originalActorDispatchActive(generation))return;this.originalProjectileAccumulator=(this.originalProjectileAccumulator??0)+delta;while(this.originalActorDispatchActive(generation)&&this.originalProjectileAccumulator>=1/30-1e-9){this.originalProjectileAccumulator-=1/30;this.updateOriginalExplosives();if(!this.originalActorDispatchActive(generation))break;this.updateAuthoredProjectiles(1/30);}return;}
    this.updateAuthoredProjectiles(delta);
  }

  /** Explicit Modern hand grenades retain their authored flight and damage. */
  private updateAuthoredProjectiles(delta:number):void {
    for (let i=this.projectiles.length-1;i>=0;i--) {
      const projectile=this.projectiles[i];if(projectile.source)continue;projectile.life-=delta;
      const old=SCRATCH_PREVIOUS.copy(projectile.mesh.position);
      if (projectile.grenade) projectile.velocity.y-=9.81*delta;
      projectile.mesh.position.addScaledVector(projectile.velocity,delta); projectile.mesh.rotation.x+=delta*7;
      let explode=projectile.life<=0;
      const movement=SCRATCH_MOVEMENT.copy(projectile.mesh.position).sub(old); const distance=movement.length();
      const travelDirection=SCRATCH_DIRECTION.copy(movement); if(distance>0)travelDirection.normalize(); else travelDirection.set(0,0,0);
      const wallDistance=distance>0?this.distanceToWorld(old,travelDirection,distance):distance;
      if (distance>0 && wallDistance<distance) {
        projectile.mesh.position.copy(old).addScaledVector(travelDirection,Math.max(0,wallDistance-.025));
        if (projectile.grenade && !projectile.impact && projectile.life>.3) { projectile.mesh.position.copy(old); projectile.velocity.multiplyScalar(.62); projectile.velocity.y=Math.abs(projectile.velocity.y)*.62; }
        else explode=true;
      }
      if (projectile.mesh.position.y<=(this.arena.groundHeightAt?.(projectile.mesh.position.x,projectile.mesh.position.z)??0)+.12) {
        if (projectile.grenade && !projectile.impact && projectile.life>.3) { projectile.mesh.position.y=(this.arena.groundHeightAt?.(projectile.mesh.position.x,projectile.mesh.position.z)??0)+.12; projectile.velocity.y=Math.abs(projectile.velocity.y)*.52; projectile.velocity.x*=.72; projectile.velocity.z*=.72; }
        else explode=true;
      }
      if (projectile.impact) {
        const segment=SCRATCH_SEGMENT; segment.start.copy(old); segment.end.copy(projectile.mesh.position);
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          const center=SCRATCH_TARGET_POINT.copy(enemy.group.position); center.y+=1;
          if (segment.closestPointToPoint(center,true,SCRATCH_CLOSEST).distanceTo(center)<.8) explode=true;
        }
      }
      if (explode) { this.explode(projectile.mesh.position,projectile.radius,projectile.damage,projectile.owner,projectile.rg6JumpEligible); this.releaseProjectileMesh(projectile.mesh); this.projectiles.splice(i,1); }
    }
  }

  private updateOriginalExplosives(physicsAlreadyStepped=false,activeProjectiles?:readonly OriginalProjectileState[]):void {
    const generation=this.originalActorDispatchGeneration??0;
    if(!this.originalActorDispatchActive(generation))return;
    const actorCapture=physicsAlreadyStepped?this.sourceCallbackCaptureCurrent:undefined;
    const pending=this.soloPendingGameplayFrame;
    const actorDispatch=pending?.actorObservation?.dispatch??(actorCapture?structuredClone(this.projectiles.flatMap((projectile,index)=>projectile.source&&(!activeProjectiles||activeProjectiles.includes(projectile.source))?[{index,state:projectile.source}]:[])):undefined);
    if(pending&&actorCapture&&!pending.actorObservation)pending.actorObservation={record:actorCapture,dispatch:actorDispatch,generation};
    if(!this.combatEffectsFrozen&&!this.hasCommittedSoloTransients())this.originalExplosionPresentation?.step(this.playerAlive?this.camera.position:null,this.elapsed);
    if(!this.combatEffectsFrozen&&!this.hasCommittedSoloTransients())this.originalCombatEffectPresentation?.step(this.playerAlive?this.camera.position:null,this.elapsed);
    if(this.isSourceSolo()){
      this.completeSoloActors();
      if(actorCapture)this.finishSoloActorCapture(actorCapture,actorDispatch,generation);
      return;
    }
    const eyes=[...(this.playerAlive?[{id:'player',position:this.camera.position}]:[]),...this.enemies.flatMap((enemy,index)=>enemy.alive?[{id:`enemy:${index}`,position:{x:enemy.group.position.x,y:enemy.group.position.y+PLAYER_HEIGHT,z:enemy.group.position.z}}]:[])];
    for(let i=this.originalBlasts.length-1;i>=0&&this.originalActorDispatchActive(generation);i--){
      const blast=this.originalBlasts[i],result=stepOriginalBlast(blast,eyes);
      for(const id of result.damagedPlayerIds){if(!this.originalActorDispatchActive(generation))break;if(id==='player')this.takeDamage(5,new THREE.Vector3().copy(blast.position),undefined,this.originalHurtAttackerPosition(blast.shooterId),this.deathActorName(blast.shooterId));else{const enemy=this.enemies[Number(id.slice(6))];if(!enemy)continue;const hit=enemy.damage(5,this.elapsed);if(hit!=='ignored'){this.playOriginalCombatSound('hurt',{x:enemy.group.position.x,y:enemy.group.position.y+PLAYER_HEIGHT,z:enemy.group.position.z});this.hits++;this.showHitmarker(hit==='killed');if(hit==='killed')this.registerKill(false,enemy);}}}
      if(this.originalActorDispatchActive(generation)&&result.expired)this.originalBlasts.splice(i,1);
    }
    for(let i=0;i<this.projectiles.length&&this.originalActorDispatchActive(generation);i++){
      const projectile=this.projectiles[i],source=projectile.source;if(!source||activeProjectiles&&!activeProjectiles.includes(source))continue;
      const result=physicsAlreadyStepped?stepOriginalProjectileActor(source,{eyes,localEye:this.playerAlive?this.camera.position:undefined}):stepOriginalProjectile(source,{radius:this.originalProjectileRadius(source.weapon),sweep:(from,to,radius)=>this.sweepOriginalProjectile(from,to,radius,true),sweepConvex:(from,to,shape,surfaceVelocity)=>this.sweepOriginalConvex(from,to,shape,true,surfaceVelocity),eyes,localEye:this.playerAlive?this.camera.position:undefined,onContact:(contact,_state,bodyVelocity)=>{this.originalProjectileContactCount=(this.originalProjectileContactCount??0)+1;if(contact.body?.id==='player'&&bodyVelocity&&this.playerAlive){this.velocity.copy(bodyVelocity).multiplyScalar(1.5);this.grounded=false;}}});
      projectile.mesh.position.copy(source.position);projectile.velocity.copy(source.velocity);this.orientProjectileMesh(projectile.mesh,new THREE.Vector3().copy(source.direction),source.sourceRotation,source.angular);
      if(source.weapon==='rpg'&&!this.hasCommittedSoloTransients())this.originalCombatEffectPresentation?.spawnPuff(source.position,this.playerAlive?this.camera.position:null,Math.random,undefined,0,this.elapsed);
      if(result.detonated){this.playOriginalCombatSound('boomnew',source.position);this.spawnExplosion(projectile.mesh.position,250*ORIGINAL_MAP_SCALE,source.weapon);this.originalBlasts.push(createOriginalBlast(source.position,source.shooterId,source.weapon));this.releaseProjectileMesh(projectile.mesh);this.projectiles.splice(i,1);i--;}
    }
    const captured=actorCapture;
    if(physicsAlreadyStepped&&captured){
      if(!this.originalActorDispatchActive(generation)){
        captured.afterActors={stateUnavailable:'Registration cancelled during dispatch; no completed actor stage',dispatchBeforeActors:actorDispatch,dispatchGeneration:generation};
        if(this.mode!=='online')captured.actorStage='cancelled-gameover';captured.endedAt=performance.now();return;
      }
      const player=this.playerAlive?createOriginalPlayerBody('player',this.camera.position,{x:this.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:this.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:this.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR}):undefined;
      captured.afterActors={state:this.captureSourceCallbackState(player),playerSupportUnavailable:'Body rebuilt after controls reset; previous support is in afterPhysics',dispatchBeforeActors:actorDispatch,dispatchOrder:'Projectile birth order (after blast actors)'};if(this.mode!=='online')captured.actorStage=this.originalActorDispatchActive(generation)?'captured':'cancelled-gameover';captured.endedAt=performance.now();
    }
  }

  private originalProjectileRadius(weapon:'launcher'|'rpg'):number {return ORIGINAL_PROJECTILE_RADIUS[weapon];}

  private sweepOriginalConvex(from:Vec3,to:Vec3,shape:OriginalConvexPolytope,includePlayer=false,surfaceVelocity?:(point:Vec3)=>Vec3):OriginalProjectileContact|null {
    if(!this.arena.runtime)throw Error('Recovered triangle geometry is required for source convex projectile collision');
    let best:OriginalProjectileContact|null=this.arena.runtime.geometry.sweepConvex(from,to,shape,ORIGINAL_COLLISION_CONTACT_DISTANCE,surfaceVelocity);
    if(includePlayer&&this.playerAlive){
      const center={x:this.camera.position.x,y:this.camera.position.y-60*ORIGINAL_MAP_SCALE,z:this.camera.position.z};
      const hit=sweepOriginalConvexSphere(shape,from,to,center,center,ORIGINAL_PLAYER_RADIUS,ORIGINAL_COLLISION_CONTACT_DISTANCE);
      if(hit&&hit.fraction<(best?.fraction??Infinity)){
        const n=hit.normalBToA,travel={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};
        if(surfaceVelocity&&hit.witnessA?(()=>{const v=surfaceVelocity(hit.witnessA);return (v.x-this.velocity.x/1.5)*n.x+(v.y-this.velocity.y/1.5)*n.y+(v.z-this.velocity.z/1.5)*n.z<0;})():travel.x*n.x+travel.y*n.y+travel.z*n.z<0){
          best={...(hit.witnessA&&hit.witnessB?{witnessA:{...hit.witnessA},witnessB:{...hit.witnessB}}:{}),position:{x:from.x+travel.x*hit.fraction+n.x*hit.penetrationDepth,y:from.y+travel.y*hit.fraction+n.y*hit.penetrationDepth,z:from.z+travel.z*hit.fraction+n.z*hit.penetrationDepth},normal:n,fraction:hit.fraction,penetrationDepth:hit.penetrationDepth,body:{id:'player',velocity:this.velocity.clone().multiplyScalar(1/1.5),mass:1,restitution:.1,friction:1}};
        }
      }
    }
    return best;
  }

  private sweepOriginalProjectile(from:Vec3,to:Vec3,radius:number,includePlayer=false):OriginalProjectileContact|null {
    let world:OriginalProjectileContact|null=null;
    if(this.arena.runtime)world=this.arena.runtime.geometry.sweepSphere(from,to,radius,ORIGINAL_COLLISION_CONTACT_DISTANCE);
    else {
      const origin=new THREE.Vector3().copy(from),travel=new THREE.Vector3().copy(to).sub(origin),distance=travel.length();
      if(distance>1e-9){travel.multiplyScalar(1/distance);const hit=this.raycastWorld(origin,travel,distance+radius);if(hit)world={position:origin.addScaledVector(travel,Math.max(0,hit.distance-radius)),normal:hit.normal,fraction:Math.max(0,(hit.distance-radius)/distance)};}
    }
    if(includePlayer&&this.playerAlive){
      const center=this.camera.position.clone();center.y-=60*ORIGINAL_MAP_SCALE;
      const start=new THREE.Vector3().copy(from),travel=new THREE.Vector3().copy(to).sub(start),offset=start.clone().sub(center),sumRadius=ORIGINAL_PLAYER_RADIUS+radius+ORIGINAL_COLLISION_CONTACT_DISTANCE;
      const a=travel.lengthSq(),b=offset.dot(travel),c=offset.lengthSq()-sumRadius*sumRadius,disc=b*b-a*c;
      let fraction=c<0?0:(a>1e-12&&disc>=0?(-b-Math.sqrt(disc))/a:Infinity);
      if(fraction>=0&&fraction<=1&&fraction<(world?.fraction??Infinity)){
        const position=start.addScaledVector(travel,fraction),normal=position.clone().sub(center).normalize();
        if(normal.lengthSq()>1e-12&&travel.dot(normal)<0){position.copy(center).addScaledVector(normal,sumRadius+1e-6);world={position,normal,fraction,body:{id:'player',velocity:this.velocity.clone().multiplyScalar(1/1.5),mass:1,restitution:.1,friction:1}};}
      }
    }
    return world;
  }

  private explode(position: THREE.Vector3,radius:number,damage:number,owner:'player',rg6JumpEligible=false): void {
    this.audio.play('explosion'); this.spawnExplosion(position,radius);
    for (const enemy of this.enemies) {
      if(this.phase!=='playing')break;
      if (!enemy.alive) continue; const distance=enemy.group.position.distanceTo(position);
      const target=enemy.group.position.clone().add(new THREE.Vector3(0,1,0));const direction=target.sub(position);const targetDistance=direction.length();
      if (distance<radius&&this.distanceToWorld(position,direction.normalize(),targetDistance)>=targetDistance-.12) { const result=this.isSourceSolo()?this.damageSoloEnemy(enemy,damage*(1-distance/radius*.72),'player',this.localCallsign,position):enemy.damage(damage*(1-distance/radius*.72),this.elapsed);if(result!=='ignored'){const killed=result==='killed';this.hits++; this.showHitmarker(killed); if(killed&&owner==='player'&&!this.isSourceSolo())this.registerKill(false,enemy);} }
    }
    const playerDistance=this.camera.position.distanceTo(position);
    const playerDirection=this.camera.position.clone().sub(position);
    if(playerDistance<radius*.85&&this.distanceToWorld(position,playerDirection.normalize(),playerDistance)>=playerDistance-.12){
      this.takeDamage(Math.max(0,damage*(1-playerDistance/(radius*.85))*.45),position);
      const feet=this.camera.position.clone();feet.y-=PLAYER_HEIGHT;
      if(rg6JumpEligible&&this.mode==='solo'&&this.phase==='playing'&&this.playerAlive
        &&rg6JumpBlastEligible(feet,position)){
        this.velocity.y=rg6JumpVelocity(this.velocity.y);this.grounded=false;this.checkpointSoloHumanBody();
      }
    }
  }

  private spawnTracer(end:THREE.Vector3):void {
    if(!this.archivalWinter)return;
    this.tracerSequence++;
    if(this.weaponState.current==='shotgun'&&this.tracerSequence%4!==0)return;
    const metadata=this.weaponMetadata.get(this.weaponState.current);const start=new THREE.Vector3();
    if(metadata)this.viewAnchorWorld(metadata.anchors.muzzle,start);else this.camera.getWorldPosition(start);
    const width=this.weaponState.current==='sniper'?.02:this.weaponState.current==='pistol'?.012:.015;
    this.combatEffects.emitTracer(start,end,{width,lifetime:this.weaponState.current==='sniper'?.095:.07});
  }

  private spawnNetworkTracer(origin:{x:number;y:number;z:number},direction:{x:number;y:number;z:number},range:number):void {
    if(!this.archivalWinter)return;
    const start=new THREE.Vector3(origin.x,origin.y,origin.z);const forward=new THREE.Vector3(direction.x,direction.y,direction.z).normalize();
    const distance=this.distanceToWorld(start,forward,range);const end=start.clone().addScaledVector(forward,distance);this.combatEffects.emitTracer(start,end,{width:.014,lifetime:.075});
    if(distance<range-.01)this.spawnImpact(end,this.surfaceNormalAt(end,forward),5,.9,true);
  }

  private spawnMuzzleParticles(count:number):void {
    if(this.originalWeapons)return;
    const metadata=this.weaponMetadata.get(this.weaponState.current);const origin=new THREE.Vector3();
    if(metadata)this.viewAnchorWorld(metadata.anchors.muzzle,origin);else this.camera.getWorldPosition(origin);
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion);
    this.combatEffects.emitImpact(origin,forward,{sparkCount:count,chipCount:0,dustCount:0,smokeCount:0,scale:.38,lifetime:.5,surface:'metal'});
  }

  private spawnImpact(point:THREE.Vector3,normal:THREE.Vector3,count:number,scale:number,leaveMark=false,surface=this.classifyImpactSurface(point,normal)):void {
    if(!this.archivalWinter){if(this.hasCommittedSoloTransients())return;if(surface==='flesh')this.originalCombatEffectPresentation?.spawnBlood(point,this.camera.position,undefined,this.elapsed);else this.originalCombatEffectPresentation?.spawnMiss(point,normal,this.weaponState.current==='shotgun',undefined,this.elapsed);return;}
    this.combatEffects.emitImpact(point,normal,{sparkCount:count,chipCount:Math.ceil(count*.35),dustCount:Math.ceil(count*.45),smokeCount:1,scale,surface});
    this.triggerImpactLight(point,scale,surface);
    if(leaveMark)this.combatImpactMarks.emitBullet(point,normal,{radius:.06*Math.max(.75,Math.min(1.35,scale))});
  }

  private sourceEffectAuthorityTime(serverTime:number):number {
    const serverNow=this.network?.estimatedServerTimeMs;
    return performance.now()/1000-(serverNow===undefined?0:Math.max(0,serverNow-serverTime)/1000);
  }

  private spawnExplosion(point:THREE.Vector3,radius=4,weapon:'launcher'|'rpg'='launcher',id?:string,remainingCallbacks=16,callbackEpoch=this.elapsed):void {
    if(!this.archivalWinter){if(this.hasCommittedSoloTransients())return;this.originalExplosionPresentation?.spawn(id??`local-blast-${++this.originalExplosionSequence}`,weapon==='rpg'?'rocket':'grenade',point,remainingCallbacks,callbackEpoch);return;}
    this.triggerBlastLight(point,radius);
    this.combatEffects.emitExplosion(point,{radius,sparkCount:this.enhancedRendering?24:12,chipCount:this.enhancedRendering?9:4,dustCount:this.enhancedRendering?12:5,smokeCount:this.enhancedRendering?10:5});
    this.leaveExplosionScorch(point,radius);
  }

  private classifyImpactSurface(point:THREE.Vector3,normal:THREE.Vector3):ImpactSurface {
    if(this.archivedArena?.militaryTransport.colliders.some((box)=>box.distanceToPoint(point)<=.12))return 'metal';
    // The arena's two asphalt lanes cross inside a 13 m corridor. Horizontal
    // hits outside both corridors land on the authored snow field.
    if(normal.y>.55&&point.y<=.2&&Math.abs(point.x)>6.8&&Math.abs(point.z)>6.8)return 'snow';
    return 'concrete';
  }

  private createBlastLightPool():void {
    // Idle slots stay visible at zero intensity: toggling light visibility
    // changes the compiled light count and forces every lit material in the
    // scene to recompile mid-firefight, which reads as a hard freeze.
    const capacity=this.renderTier==='high'?6:3;
    for(let index=0;index<capacity;index++){
      const light=new THREE.PointLight(0xff7a30,0,13,2);light.name=`BlastLight-${index}`;
      this.scene.add(light);this.blastLights.push({light,active:false,age:0,lifetime:.16,peakIntensity:0});
    }
  }

  private triggerBlastLight(point:THREE.Vector3,radius:number):void {
    const available=this.blastLights.find((slot)=>!slot.active);
    const slot=available??this.blastLights[this.blastLightCursor++%this.blastLights.length];
    slot.age=0;slot.lifetime=.16;slot.peakIntensity=10+Math.min(6,radius*.55);
    slot.light.color.setHex(0xff7a30);
    slot.light.position.copy(point);slot.light.position.y+=.5;slot.light.distance=Math.max(9,radius*3.1);
    slot.light.intensity=slot.peakIntensity;slot.active=true;
  }

  private triggerImpactLight(point:THREE.Vector3,scale:number,surface:ImpactSurface):void {
    const available=this.blastLights.find((slot)=>!slot.active);
    const slot=available??this.blastLights[this.blastLightCursor++%this.blastLights.length];
    slot.age=0;slot.lifetime=.07;slot.peakIntensity=1.8+Math.min(2.2,scale*1.25);
    slot.light.color.setHex(surface==='snow'?0xe9f5ff:surface==='metal'?0xffdca0:surface==='flesh'?0xa82d28:0xffa84d);
    this.scratchViewPosition.copy(this.camera.position).sub(point).normalize();
    slot.light.position.copy(point).addScaledVector(this.scratchViewPosition,.08);
    slot.light.distance=3.2;slot.light.intensity=slot.peakIntensity;slot.active=true;
  }

  private advanceCombatEffects(delta:number):void {
    this.combatEffects.update(delta);this.combatImpactMarks.update(delta);
    for(const slot of this.blastLights){
      if(!slot.active)continue;slot.age+=delta;
      const progress=slot.age/slot.lifetime;
      if(progress>=1){slot.light.intensity=0;slot.active=false;continue;}
      slot.light.intensity=slot.peakIntensity*(1-progress)*(1-progress);
    }
  }

  private leaveExplosionScorch(point:THREE.Vector3,radius:number):void {
    const markPoint=point.clone();let normal:THREE.Vector3;
    if(point.y<=.35){markPoint.y=.025;normal=new THREE.Vector3(0,1,0);}
    else{
      const nearSurface=this.arena.colliders.some((box)=>point.x>=box.min.x-.16&&point.x<=box.max.x+.16&&point.y>=box.min.y-.16&&point.y<=box.max.y+.16&&point.z>=box.min.z-.16&&point.z<=box.max.z+.16);
      if(!nearSurface)return;
      normal=this.surfaceNormalAt(point,new THREE.Vector3(0,-1,0));
    }
    this.combatImpactMarks.emitScorch(markPoint,normal,{radius:Math.max(.65,radius*.26)});
  }

  private combatantShoot(shooter:Enemy,targetEnemy:Enemy|null,origin:THREE.Vector3,damage:number):void {
    if(this.phase!=='playing')return;
    if(targetEnemy&&!targetEnemy.alive)return;if(!targetEnemy&&!this.playerAlive)return;
    const sourceSolo=this.isSourceSolo(),world=sourceSolo?this.ensureSoloWorlds()?.worlds.get(shooter.id):undefined;
    if(sourceSolo&&!world)return;
    const shotOrigin=world?new THREE.Vector3().copy(originalPlayerEye(world.body)):origin;
    const targetPosition=sourceSolo?(shooter.sourceTargets.get(targetEnemy?.id??'player')??this.enemyCombatPosition(shooter)):(targetEnemy?targetEnemy.group.position:this.camera.position);
    const target=targetPosition.clone().add(targetEnemy?new THREE.Vector3(0,1.25,0):new THREE.Vector3()).add(new THREE.Vector3((Math.random()-.5)*.7,(Math.random()-.5)*.7,(Math.random()-.5)*.7));
    const targetDistance=shotOrigin.distanceTo(target),direction=target.sub(shotOrigin).normalize();
    this.tracerSequence++;if(this.archivalWinter&&this.tracerSequence%2===0)this.combatEffects.emitTracer(origin,origin.clone().addScaledVector(direction,Math.max(.2,Math.min(40,targetDistance)-.65)),{width:.012,lifetime:.07});
    if(this.archivalWinter)this.audio.play('shot',.35);else if(!world)this.playOriginalCombatSound(originalFireSound(shooter.weapon),origin);
    const chance=THREE.MathUtils.clamp(.86-targetDistance*.014,.24,.8),chanceRoll=Math.random();
    const targetId=targetEnemy?.id??'player';
    const botShot=world?captureOriginalSoloBotShot({ownerId:shooter.id,ownerLife:world.lifeGeneration,sequence:(this.soloBotShotSequence??0)+1,capturedAt:this.elapsed,weapon:shooter.weapon,targetId,targetLife:this.soloWorlds!.worlds.get(targetId)!.lifeGeneration,sourceShotOrigin:shotOrigin,aimDirection:direction,targetDistance,authoredDamage:damage,chanceRoll},{maxTextChars:65536}):undefined;
    if(botShot)this.soloBotShotSequence=botShot.sequence;
    if(world&&(shooter.weapon==='launcher'||shooter.weapon==='rpg')){
      // Retain the authored random draw, but constructors are not gated by the
      // obsolete instantaneous hit probability. Birth follows the next goody.
      this.soloBotShots.push(botShot!);return;
    }
    const privateRay=world?this.soloWorlds!.freezeRay(shooter.id):undefined;
    const hit=privateRay?.(shotOrigin,direction,Math.max(48,targetDistance+12),{includeGround:true,excludeModel:name=>originalBulletExcludesModel(this.mapId,name)});
    if(world&&hit)this.soloWorlds!.reportShots(shooter.id,getOriginalHitscan(this.mapId,shooter.weapon)?.rays??1);
    const reachesTarget=world?hit?.id===targetId:this.distanceToWorld(origin,direction,targetDistance)>=targetDistance-.12;
    if((botShot?botShot.chanceRoll<botShot.chance:chanceRoll<chance)&&reachesTarget){
      const admittedDamage=botShot?.authoredDamage??damage;
      if(targetEnemy){const result=sourceSolo?this.damageSoloEnemy(targetEnemy,admittedDamage,shooter.id,shooter.name,shotOrigin):targetEnemy.damage(admittedDamage,this.elapsed);
        if(!this.archivalWinter&&result!=='ignored')this.playOriginalCombatSound('hurt',{x:targetEnemy.group.position.x,y:targetEnemy.group.position.y+PLAYER_HEIGHT,z:targetEnemy.group.position.z});if(result==='killed'&&!sourceSolo)this.registerBotKill(shooter,targetEnemy);
      }else this.takeDamage(admittedDamage,shotOrigin,shooter);
    }else{
      const range=Math.max(48,targetDistance+12),distance=world?(hit?.distance??range):this.distanceToWorld(origin,direction,range);
      if(distance<range-.01){
        const point=shotOrigin.clone().addScaledVector(direction,distance);
        // Source arenas have no authored AABBs. Use the selected query's
        // surface normal instead of orienting every bot mark toward its shot.
        const normal=world&&hit?.normal?new THREE.Vector3(hit.normal.x,hit.normal.y,hit.normal.z):undefined;
        const lengthSq=normal?.lengthSq()??0;
        const hasNormal=normal&&normal.toArray().every(Number.isFinite)&&Number.isFinite(lengthSq)&&lengthSq>0;
        this.spawnImpact(point,hasNormal?normal.normalize():this.surfaceNormalAt(point,direction),4,.82,true);
      }
    }
  }

  private takeDamage(amount:number,origin:THREE.Vector3,attacker?:Enemy,hurtPosition?:Vec3,killerName?:string):void {
    if(this.phase!=='playing'||!this.playerAlive||amount<=0||(this.archivalWinter&&this.elapsed<this.invulnerableUntil))return;
    if(this.isSourceSolo()){this.ensureSoloWorlds()?.damage('player',amount,this.elapsed,{ownerId:attacker?.id,ownerName:killerName??attacker?.name,position:hurtPosition??origin});return;}
    let dead:boolean;
    if(!this.archivalWinter){const result=applyOriginalPlayerDamage(this.ensureOriginalHealth(),amount);this.health=result.health;dead=result.dead;}
    else{const absorbed=Math.min(this.armor,amount*.55);this.armor-=absorbed;this.health-=amount-absorbed;dead=this.health<=0;}
    this.playPlayerHurtSound();
    if(this.archivalWinter){this.damageOpacity=Math.min(.85,this.damageOpacity+.25);this.showDamageDirection(origin);}
    else this.showOriginalHurt(hurtPosition??(attacker?{x:attacker.group.position.x,y:attacker.group.position.y+PLAYER_HEIGHT,z:attacker.group.position.z}:undefined));
    this.updateHud();if(dead)this.killPlayer(attacker,killerName);
  }

  private killPlayer(attacker?:Enemy,killerName?:string):void {
    if(this.phase!=='playing'||!this.playerAlive)return;this.playerAlive=false;this.deaths++;this.health=0;this.firing=false;this.aiming=false;this.velocity.set(0,0,0);this.playerRespawnAt=this.archivalWinter?this.elapsed+1.3:0;
    if(attacker){attacker.frags++;this.addKillFeed(killerName??attacker.name,'YOU');if(this.archivalWinter&&attacker.frags>=KILL_LIMIT){this.endRound(false,attacker.name);return;}}
    if(!this.archivalWinter){this.endRound(false,killerName??attacker?.name);return;}
    byId('scope-overlay').classList.remove('active');byId('respawn-overlay').classList.add('active');this.audio.play('hurt');this.updateHud();
  }

  private registerBotKill(attacker:Enemy,victim:Enemy):void {
    if(this.phase!=='playing')return;
    attacker.frags++;victim.deaths++;if(!this.archivalWinter)this.playOriginalCombatSound('hurt',{x:victim.group.position.x,y:victim.group.position.y+PLAYER_HEIGHT,z:victim.group.position.z});this.dropWeapon(victim);this.addKillFeed(attacker.name,victim.name);this.updateHud();
    if(this.archivalWinter&&attacker.frags>=KILL_LIMIT)this.endRound(false,attacker.name);
  }

  private addKillFeed(attacker:string,victim:string,headshot=false):void {
    const feed=byId('kill-feed');const line=document.createElement('div');const marker=document.createElement('b');marker.textContent='◆';
    line.append(document.createTextNode(`${attacker} `),marker,document.createTextNode(` ${victim}`));
    if(headshot){const label=document.createElement('b');label.textContent=' [HEADSHOT]';line.append(label);}
    feed.prepend(line);setTimeout(()=>line.remove(),3500);
  }

  private updatePlayerRespawn():void {
    if(!this.archivalWinter)return;
    const remaining=Math.max(0,this.playerRespawnAt-this.elapsed);byId('respawn-time').textContent=remaining.toFixed(1);
    if(this.elapsed<this.playerRespawnAt)return;
    const spawn=this.safestPlayerSpawn();this.camera.position.set(spawn.x,PLAYER_HEIGHT+spawn.y,spawn.z);this.snowTracks.resetActor('player');this.velocity.set(0,0,0);this.keys.clear();this.health=100;this.armor=0;this.grenades=this.controlsPreset==='modern'?3:0;this.recoil=0;this.grounded=true;this.playerAlive=true;this.invulnerableUntil=this.elapsed+1.5;this.weaponState.reset();this.nextSourceReloadPoll=-Infinity;this.switchWeapon(this.weaponState.current);
    byId('respawn-overlay').classList.remove('active');this.setMessage('SPAWN PROTECTION',1.5);this.updateHud();
  }

  private updateNetworkRespawn():void {
    if(!this.archivalWinter)return;
    const localId=this.network?.clientId;const player=localId?this.latestNetworkSnapshot?.players.find(item=>item.id===localId):undefined;
    if(!player?.respawnAt)return;
    const serverNow=this.network?.estimatedServerTimeMs
      ?? (this.latestNetworkSnapshot?.serverTime??Date.now())+(performance.now()-this.lastSnapshotReceivedAt);
    byId('respawn-time').textContent=Math.max(0,(player.respawnAt-serverNow)/1000).toFixed(1);
  }

  private advanceGameplayFrame(frameDelta:number):void {
    if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting))return;
    if(this.isSourceSolo()&&!this.soloWorlds){this.ensureSoloWorlds();if(!this.soloWorlds||this.soloCurrentPending)return;}
    this.flushOriginalReconciliation();
    if(!this.archivalWinter&&this.arena.runtime){
      const generation=this.originalActorDispatchGeneration??0;
      if(!this.originalActorDispatchActive(generation))return;
      if(this.playerAlive){
        this.resumeSoloGameplayFrame();
        if(!this.originalActorDispatchActive(generation)||!this.playerAlive)return;
        let activeProjectiles:OriginalProjectileState[]=[];
        this.updateSourceWeaponInput(()=>{
          activeProjectiles=this.projectiles.flatMap(projectile=>projectile.source?[projectile.source]:[]);
          if(this.isSourceSolo())this.beginSoloCallback();this.updateOriginalPlayerCallback(true);
          if(this.isSourceSolo()){
            if(this.soloLoadedSceneFactory){
              if(activeProjectiles.length>64)throw Error('Solo retained physical projectile budget exceeded');
              this.soloPendingGameplayFrame={worlds:this.soloWorlds!,generation,time:this.elapsed,activeProjectiles:Object.freeze([...activeProjectiles]),stage:'delivery'};
            }
            this.completeSoloGoody();
          }
        },()=>{this.updateOriginalExplosives(true,activeProjectiles);if(this.originalActorDispatchActive(generation))this.updateAuthoredProjectiles(1/30);});
      }
      else {
        this.originalProjectileAccumulator+=Math.min(1,Math.max(0,frameDelta));
        while(!(this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)&&this.originalActorDispatchActive(generation)&&this.originalProjectileAccumulator>=1/30-1e-9){this.originalProjectileAccumulator-=1/30;this.advanceOriginalMuzzleFlashes();this.updateOriginalPlayerCallback();if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)||!this.originalActorDispatchActive(generation))break;this.updateOriginalExplosives(true);if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)||!this.originalActorDispatchActive(generation))break;this.updateAuthoredProjectiles(1/30);}
      }
      return;
    }
    // Movement and explosive travel share elapsed time at every render rate.
    // Otherwise a slow frame can let the jumper rise before their ground shot hits.
    // Small steps retain ceiling/wall collision checks; a stall cannot create an
    // unbounded catch-up. Visibility loss pauses and resume discards paused time.
    // Active online frames can exceed 250 ms on slow GPUs; preserve server-time
    // gravity for those frames while still bounding long stalls to one second.
    const catchupLimit=this.mode==='online'?1:.25;
    let remaining=Math.min(catchupLimit,Math.max(0,frameDelta));
    // A newly received impulse cannot act during the pre-event part of this frame.
    // Known server clock offset also supplies bounded time already spent in flight.
    const verticalBudget=this.networkBoostStartedAt===undefined?remaining
      :Math.min(catchupLimit,Math.max(0,performance.now()/1000-this.networkBoostStartedAt));
    this.networkBoostStartedAt=undefined;
    let skipVertical=Math.max(0,remaining-verticalBudget);
    let extraVertical=Math.max(0,verticalBudget-remaining);
    while(remaining>1e-8&&this.phase==='playing'){
      const step=Math.min(1/120,remaining);
      const verticalStep=Math.max(0,step-skipVertical);skipVertical=Math.max(0,skipVertical-step);
      if(this.playerAlive)this.updateMovement(step,verticalStep);
      this.updateProjectiles(step);remaining-=step;
    }
    while(extraVertical>1e-8&&this.phase==='playing'&&this.playerAlive){
      const step=Math.min(1/120,extraVertical);this.updateMovement(0,step);extraVertical-=step;
    }
  }

  private attachOriginalDoors():void {
    const arena=this.arena;
    this.originalDoorClient?.attach(arena.doorWorld&&arena.updateDoors&&arena.resetDoors?arena as OriginalArena:undefined);
  }
  private originalDoorTime():number {
    if(this.mode==='solo')return performance.now()/1000;
    const now=this.network?.estimatedServerTimeMs??(this.latestNetworkSnapshot
      ?this.latestNetworkSnapshot.serverTime+performance.now()-this.lastSnapshotReceivedAt:Date.now());
    return now/1000;
  }
  private updateOriginalDoors():void {
    // The opening epoch can lag callbacks (or never change in Woodlands).
    // Render the shared door facade at its committed time without aging it.
    if(this.isSourceSolo()){const world=this.soloWorlds?.worlds.get('player');if(world?.doors)this.arena.updateDoors?.(world.doors.updatedAtSeconds);return;}
    this.attachOriginalDoors();
    const opened=this.originalDoorClient?.update(this.originalDoorTime(),this.mode==='solo'&&this.phase==='playing'&&this.playerAlive?this.camera.position:undefined)??[];
    for(const name of opened)this.playOriginalDoorSound(name);
  }

  private playOriginalCombatSound(name:OriginalSoundName,position?:Vec3,channel?:number):void {
    this.flushOriginalReconciliation();
    if(!this.audio.playOriginalSound)return;
    const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);
    this.audio.playOriginalSound(name,position,this.camera.position,right,channel);
  }

  private playOriginalDoorSound(name:string):void {
    this.flushOriginalReconciliation();
    const track=this.originalMaps?.[this.mapId].doorTracks.doors.find(d=>d.name===name);
    if(!track||!this.arena.runtime)return;
    const position=sourcePointToWorld(track.baseMatrix.slice(12,15),this.arena.runtime.scale);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);
    this.audio.playOriginalDoor(position,this.camera.position,right);
  }

  /** Full fixed-contact providers follow the arena's live door facade.
   * Sweep-only compatibility providers retain their existing optional path. */
  private originalFixedTouchingQueries() {
    const geometry=this.arena?.runtime?.geometry;
    if(!geometry?.contactsSphere||!geometry.contactsConvex)return {};
    return {
      contactsSphere:(position:Vec3,radius:number):readonly OriginalProjectileContact[]=>geometry.contactsSphere(position,radius,ORIGINAL_COLLISION_CONTACT_DISTANCE),
      contactsConvex:(position:Vec3,shape:OriginalConvexPolytope):readonly OriginalProjectileContact[]=>geometry.contactsConvex(position,shape,ORIGINAL_COLLISION_CONTACT_DISTANCE),
    };
  }

  private enableSourceCallbackCapture():boolean {
    if(!new URLSearchParams(location.search).has('e2e'))return false;
    this.sourceCallbackCapture={capacity:96,contactCapacity:8192,droppedCallbacks:0,droppedContacts:0,records:[],
      stageSemantics:{incomingBeforeQueue:'Incoming correction and received/applied epochs before the normal queue flush',
        beforePhysics:'After correction flush, live door update and earlier network contacts; physical body is authoritative for this client callback',
        afterPhysics:'Player/body states are postphysics; camera and derivativeVelocity are still precommit',
        afterControls:'End of goody callback after queued contact overrides, camera, health and presentation; input/result identify dispatched controls',
        afterActors:'After intervening gun stage, blast actors and projectile actors; online server actors remain unavailable'},
      unavailable:['Native runtime/manifold equivalence','Physical advance time (measure in detached replay)',
        ...(this.mode==='online'?['Authority world state and contacts: this captures client prediction only']:[])]};
    this.sourceCallbackCaptureCurrent=undefined;this.sourceCallbackCaptureContactCount=0;return true;
  }
  private readSourceCallbackCapture():SourceCallbackCapture|null {
    return new URLSearchParams(location.search).has('e2e')&&this.sourceCallbackCapture?structuredClone(this.sourceCallbackCapture):null;
  }

  /** Opt-in observation only: full detached states preserve physics units and
   * launch-relative angular hulls. Authority state is explicitly unavailable. */
  private captureSourceCallbackState(body?:OriginalPlayerBody):unknown {
    return structuredClone({map:this.mapId,mode:this.mode,phase:this.phase,localTime:this.elapsed,
      clock:{projectileAccumulator:this.originalProjectileAccumulator,nextGunCallback:this.nextSourceReloadPoll},
      player:body??null,playerUnavailable:body?null:'No live player body at this stage',
      camera:{x:this.camera.position.x,y:this.camera.position.y,z:this.camera.position.z},
      derivativeVelocity:{x:this.velocity.x,y:this.velocity.y,z:this.velocity.z},grounded:this.grounded,
      look:{yaw:this.yaw,pitch:this.pitch,recoil:this.recoil},mouseDelta:this.originalMouseDelta??null,
      keys:[...this.keys],typing:this.chatOpen,input:this.originalMovementInput(),movementMode:this.originalMovementMode(),
      projectiles:this.projectiles.flatMap((projectile,index)=>projectile.source?[{index,state:projectile.source}]:[]),
      networkProjectiles:this.mode==='online'?[...this.networkProjectiles.values()].flatMap(projectile=>projectile.source?[projectile.source]:[]):null,
      barrels:this.arena?.barrelWorld?.bodies??[],doors:this.arena?.doorWorld?.getStates()??[],
      blasts:this.originalBlasts,playerContacts:this.originalPlayerContacts,
      pendingReconciliation:this.pendingOriginalReconciliation??null,reconciliationEpoch:this.originalReconciliationEpoch??null,
      reconciliationLifeGeneration:this.originalReconciliationLifeGeneration??null,
      sourceViewEpoch:this.sourceRemoteViewEpoch??null,sourceViewGeneration:this.sourceRemoteViewGeneration??null,
      sourceViewCallbacks:this.sourceRemoteViewCallbacks??null,pendingPrediction:this.originalPlayerPrediction??[],
      physicsProjectilesIncluded:this.mode==='solo',authorityPhysicsTime:this.latestNetworkSnapshot?.sourcePhysicsTime??null});
  }

  /** The source movie advances its world before goody input and weaponry. */
  private updateOriginalPlayerCallback(deferWeaponPresentation=false):void {
    const incomingBeforeQueue=this.sourceCallbackCapture&&this.sourceCallbackCapture.records.length<this.sourceCallbackCapture.capacity
      ?structuredClone({pending:this.pendingOriginalReconciliation??null,appliedEpoch:this.originalReconciliationEpoch??null,
        receivedBarrelEpoch:this.originalBarrelReceivedTime??null,appliedBarrelEpoch:this.originalBarrelAuthorityTime??null,
        sourceViewEpoch:this.sourceRemoteViewEpoch??null,sourceViewGeneration:this.sourceRemoteViewGeneration??null,
        lifeGeneration:this.originalReconciliationLifeGeneration??null,playerContacts:this.originalPlayerContacts??[]}):null;
    this.flushOriginalReconciliation();
    this.updateOriginalDoors();
    const contacts=this.originalPlayerContacts??=[];
    for(const contact of contacts)if(!contact.applied&&contact.localTime<this.elapsed-1e-9){this.velocity.copy(contact.velocity);contact.applied=true;this.grounded=false;}
    const soloBody=this.isSourceSolo()?this.soloWorlds?.worlds.get('player')?.body:undefined;
    const body=soloBody??(this.playerAlive?createOriginalPlayerBody('player',this.camera.position,{x:this.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:this.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:this.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR}):undefined);
    const projectiles=this.mode==='solo'?this.projectiles.flatMap(projectile=>projectile.source?[projectile.source]:[]):[];
    this.sourceCallbackCaptureCurrent=undefined;
    const capture=this.sourceCallbackCapture;
    if(capture){
      if(capture.records.length>=capture.capacity)capture.droppedCallbacks++;
      else {
        const record:SourceCallbackCaptureRecord={index:capture.records.length,localTime:this.elapsed,startedAt:performance.now(),endedAt:null,
          incomingBeforeQueue,beforePhysics:this.captureSourceCallbackState(body),afterPhysics:null,afterControls:null,afterActors:null,
          contacts:[],droppedContacts:0,actorStage:this.mode==='online'?'unavailable-online-authority':'pending'};
        capture.records.push(record);this.sourceCallbackCaptureCurrent=record;
      }
    }
    const captured=this.sourceCallbackCaptureCurrent;
    if(soloBody)this.soloWorlds!.physics(this.elapsed,{onResolvedContact:(world,event)=>{
      if(world.id!=='player')return;
      if([event.bodyA.type,event.bodyB.type].some(type=>type==='launcher'||type==='rpg'))this.originalProjectileContactCount=(this.originalProjectileContactCount??0)+1;
      if(!captured)return;
      if(this.sourceCallbackCaptureContactCount<capture!.contactCapacity){captured.contacts.push(event);this.sourceCallbackCaptureContactCount++;}
      else{captured.droppedContacts++;capture!.droppedContacts++;}
    }});
    if(!soloBody)stepOriginalPhysicsWorld(body?[body]:[],projectiles,{
      ...this.originalFixedTouchingQueries(),
      ...(captured?{onResolvedContact:(event:OriginalPhysicsContactDiagnostic)=>{
        if(this.sourceCallbackCaptureContactCount<capture!.contactCapacity){captured.contacts.push(event);this.sourceCallbackCaptureContactCount++;}
        else {captured.droppedContacts++;capture!.droppedContacts++;}
      }}:{}),
      movableBodies:this.arena?.barrelWorld?.bodies,
      contactDistance:this.arena?.runtime?ORIGINAL_COLLISION_CONTACT_DISTANCE:0,
      sweep:(from,to,radius)=>this.sweepOriginalProjectile(from,to,radius),
      sweepConvex:(from,to,shape,surfaceVelocity)=>this.sweepOriginalConvex(from,to,shape,false,surfaceVelocity),
      memoizePureSweep:!!this.arena?.runtime,
      onProjectileContact:()=>{this.originalProjectileContactCount=(this.originalProjectileContactCount??0)+1;},
    });
    if(captured)captured.afterPhysics=this.captureSourceCallbackState(body);
    this.arena?.syncBarrels?.();
    for(const projectile of this.projectiles)if(projectile.source&&(!projectile.soloId||!this.hasCommittedSoloProjectiles())){projectile.mesh.position.copy(projectile.source.position);projectile.velocity.copy(projectile.source.velocity);this.orientProjectileMesh(projectile.mesh,new THREE.Vector3().copy(projectile.source.direction),projectile.source.sourceRotation,projectile.source.angular);}
    if(!body){if(captured)captured.endedAt=performance.now();return;}
    this.aiming=!this.chatOpen&&aimingHeld(this.controlsPreset,this.keys,this.controlsPreset==='legacy'?false:this.rightMouseAiming,this.weaponState.current);
    const controls=this.originalMovementInput(),movementMode=this.originalMovementMode();
    this.yaw+=legacyArrowTurn(this.keys,this.arrowMovement,1/30,this.controlsPreset);
    // goody clamps before applying this callback's mouse movement. A large
    // movement may therefore exceed the clamp until the following callback.
    this.pitch=THREE.MathUtils.clamp(this.pitch,-85*Math.PI/180,85*Math.PI/180);
    const mouse=this.originalMouseDelta??={x:0,y:0},factor=(this.controlsPreset==='modern'?.5:(this.originalScopeState?.mouseDelta??.5))*Math.PI/180*(this.sensitivity??1);
    this.yaw-=mouse.x*factor;this.pitch-=mouse.y*factor;mouse.x=mouse.y=0;
    const input={...controls,typing:this.chatOpen,yaw:this.yaw,pitch:this.pitch};
    const result=applyOriginalPlayerMovementControls(body,input,movementMode);
    let contacted=false;
    for(const contact of contacts)if(!contact.applied&&contact.localTime<=this.elapsed+1e-9){body.velocity={x:contact.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:contact.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:contact.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR};contact.applied=true;contacted=true;}
    if(this.mode==='online'&&!this.needsAuthoritativeSpawn){
      const serverNow=this.network?.estimatedServerTimeMs??Date.now();
      const serverTime=serverNow+(this.elapsed-performance.now()/1000)*1000;
      const history=this.originalPlayerPrediction??=[];history.push({serverTime,input,movementMode});
      while(history.length>31||history.length>0&&history[0].serverTime<serverTime-1000)history.shift();
    }
    this.camera.position.copy(originalPlayerEye(body));
    this.velocity.copy(body.velocity).multiplyScalar(ORIGINAL_PLAYER_DERIVATIVE_FACTOR);this.grounded=!contacted&&result.grounded&&!result.jumped;
    this.camera.rotation.set(this.pitch+this.recoil,this.yaw,0,'YXZ');
    this.recoil=THREE.MathUtils.damp(this.recoil,0,13,1/30);
    this.weaponSwayX=THREE.MathUtils.damp(this.weaponSwayX,0,8,1/30);this.weaponSwayY=THREE.MathUtils.damp(this.weaponSwayY,0,8,1/30);
    if(!deferWeaponPresentation)this.updateViewModelPresentation(1/30,Math.hypot(this.velocity.x,this.velocity.z),movementMode==='modern-sprint',0,0);
    stepOriginalHurtOverlay(this.sourceHurt??=createOriginalHurtOverlay());
    stepOriginalPlayerHealth(this.ensureOriginalHealth());
    if(this.mode==='online'&&!this.needsAuthoritativeSpawn){const serverNow=this.network?.estimatedServerTimeMs??Date.now();const serverTime=serverNow+(this.elapsed-performance.now()/1000)*1000;const history=this.sourceHealthPrediction??=[];history.push(serverTime);while(history.length>31||history.length>0&&history[0]<serverTime-1000)history.shift();}
    if(this.mode==='online'&&!this.needsAuthoritativeSpawn)(this.networkMovementPath??=[]).push({position:{x:this.camera.position.x,y:this.camera.position.y-PLAYER_HEIGHT,z:this.camera.position.z},velocity:{x:this.velocity.x,y:this.velocity.y,z:this.velocity.z},grounded:this.grounded});
    if(captured){captured.afterControls={state:this.captureSourceCallbackState(body),input:structuredClone(input),movementMode,result:{...result},contacted};captured.endedAt=performance.now();}
  }

  private ensureOriginalHealth():OriginalPlayerHealthState {
    return this.sourceHealth??=createOriginalPlayerHealth(Number.isFinite(this.health)?this.health:100);
  }

  /** Restore canonical health without reapplying damage. Only local callbacks
   * newer than the authoritative phase may flip its flick again. */
  private restoreOriginalHealth(state:OriginalPlayerHealthState,serverTime:number):void {
    if(serverTime<(this.sourceHealthAuthorityTime??-Infinity)){this.health=this.ensureOriginalHealth().canonical;return;}
    this.sourceHealthAuthorityTime=serverTime;
    this.sourceHealth={...state};
    this.sourceHealthPrediction=(this.sourceHealthPrediction??[]).filter(time=>time>serverTime&&time<=serverTime+1000).slice(-31);
    for(const _time of this.sourceHealthPrediction)stepOriginalPlayerHealth(this.sourceHealth);
    this.health=this.sourceHealth.canonical;
  }

  /** Snapshots are an authoritative epoch. Replay only pending player controls,
   * never live gun counters, projectile actors, blast damage, or contact events.
   * Callback/server-clock phase and unobserved dynamic contacts remain adapters. */
  private applyOriginalBarrelAuthority(barrels:NonNullable<NetworkSnapshot['barrels']>,epoch:number):void {
    if(!this.arena.barrelWorld)return;
    this.arena.barrelWorld.applySnapshots(barrels);
    this.originalBarrelAuthorityTime=epoch;
    this.originalBarrelSnapshotBodies=structuredClone(barrels);
    this.arena.syncBarrels?.();
  }

  private queueOriginalReconciliation(player:NetworkPlayer,serverTime:number,barrels?:NetworkSnapshot['barrels'],barrelEpoch?:number):void {
    if(this.archivalWinter||this.mode!=='online'||this.sourceRemoteViewEpoch==null){this.reconcileOriginalPlayer(player,serverTime);return;}
    if(serverTime<(this.originalReconciliationEpoch??-Infinity)||serverTime<(this.pendingOriginalReconciliation?.serverTime??-Infinity))return;
    this.pendingOriginalReconciliation={player:structuredClone(player),serverTime,map:this.mapId,generation:this.sourceRemoteViewGeneration??null,lifeGeneration:this.originalReconciliationLifeGeneration??0,...(barrels?{barrels:structuredClone(barrels),barrelEpoch}:{})};
  }

  private flushOriginalReconciliation():void {
    const pending=this.pendingOriginalReconciliation;
    if(!pending)return;
    this.pendingOriginalReconciliation=undefined;
    if(this.archivalWinter||this.mode!=='online'||this.phase!=='playing'||!this.playerAlive||this.needsAuthoritativeSpawn
      ||pending.lifeGeneration!==(this.originalReconciliationLifeGeneration??0)||pending.map!==this.mapId||pending.generation!==(this.sourceRemoteViewGeneration??null))return;
    if(pending.barrels&&this.arena.barrelWorld){
      this.applyOriginalBarrelAuthority(pending.barrels,pending.barrelEpoch??pending.serverTime);
    }
    this.originalReconciliationEpoch=pending.serverTime;
    this.reconcileOriginalPlayer(pending.player,pending.serverTime);
  }

  private cancelOriginalReconciliation():void {
    this.pendingOriginalReconciliation=undefined;this.originalReconciliationEpoch=-Infinity;
    this.originalReconciliationLifeGeneration=(this.originalReconciliationLifeGeneration??0)+1;
  }

  private reconcileOriginalPlayer(player:NetworkPlayer,serverTime:number):void {
    if(!this.arena.runtime||this.needsAuthoritativeSpawn||this.phase!=='playing')return;
    const transform=player.transform;
    const body=createOriginalPlayerBody('player',{x:transform.position.x,y:transform.position.y+PLAYER_HEIGHT,z:transform.position.z},
      {x:transform.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:transform.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:transform.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR});
    const pending=(this.originalPlayerPrediction??[]).filter(frame=>frame.serverTime>serverTime&&frame.serverTime<=serverTime+1000).slice(-31);
    this.originalPlayerPrediction=pending;
    const localNow=performance.now()/1000;
    const serverNow=this.network?.estimatedServerTimeMs??(this.latestNetworkSnapshot&&Number.isFinite(this.lastSnapshotReceivedAt)
      ?this.latestNetworkSnapshot.serverTime+Math.max(0,performance.now()-this.lastSnapshotReceivedAt):undefined);
    if(serverNow!==undefined){
      const authorityTime=localNow-(serverNow-serverTime)/1000;
      // A snapshot can advance the body while requestAnimationFrame is stalled.
      // Its already simulated callbacks must not move that restored body again.
      if(!Number.isFinite(this.nextSourceReloadPoll)||this.nextSourceReloadPoll<=authorityTime+1e-9)this.nextSourceReloadPoll=authorityTime+1/30;
    }
    const contacts=(this.originalPlayerContacts??[]).filter(contact=>contact.serverTime>serverTime);this.originalPlayerContacts=contacts;
    const replayed=new Set<(typeof contacts)[number]>();
    let grounded=transform.grounded;
    const restoreContact=(contact:(typeof contacts)[number])=>{body.velocity={x:contact.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:contact.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:contact.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR};replayed.add(contact);contact.applied=true;grounded=false;};
    for(const frame of pending){
      for(const contact of contacts)if(!replayed.has(contact)&&contact.serverTime<frame.serverTime-1e-6)restoreContact(contact);
      stepOriginalPhysicsWorld([body],[],{...this.originalFixedTouchingQueries(),movableBodies:this.arena.barrelWorld?.bodies,contactDistance:ORIGINAL_COLLISION_CONTACT_DISTANCE,sweep:(from,to,radius)=>this.sweepOriginalProjectile(from,to,radius),sweepConvex:(from,to,shape,surfaceVelocity)=>this.sweepOriginalConvex(from,to,shape,false,surfaceVelocity),memoizePureSweep:!!this.arena?.runtime});
      const result=applyOriginalPlayerMovementControls(body,frame.input,frame.movementMode);grounded=result.grounded&&!result.jumped;
      for(const contact of contacts)if(!replayed.has(contact)&&contact.serverTime<=frame.serverTime+1e-6)restoreContact(contact);
    }
    this.arena.syncBarrels?.();
    this.camera.position.copy(originalPlayerEye(body));this.velocity.copy(body.velocity).multiplyScalar(ORIGINAL_PLAYER_DERIVATIVE_FACTOR);this.grounded=grounded;
    // Paths queued before the authoritative correction describe another body.
    this.networkMovementPath=[];this.network?.resetTransformPath?.();
  }

  /** Modern movement modes are explicit copy options, independent of source controls. */
  private originalMovementMode():OriginalPlayerMovementMode {
    if(this.controlsPreset!=='modern')return 'source';
    const aiming=!this.chatOpen&&aimingHeld(this.controlsPreset,this.keys,this.rightMouseAiming,this.weaponState.current);
    if(aiming)return 'modern-aim';
    return !this.chatOpen&&sprintHeld(this.controlsPreset,this.keys,aiming,this.arrowMovement)?'modern-sprint':'modern-walk';
  }

  private originalMovementInput():{forward:boolean;backward:boolean;left:boolean;right:boolean;jump:boolean} {
    const keys=this.keys,strafeArrows=this.arrowMovement&&this.controlsPreset==='modern';
    return {forward:keys.has('KeyW')||(this.arrowMovement&&keys.has('ArrowUp'))||(this.controlsPreset==='legacy'&&this.rightMouseAiming),backward:keys.has('KeyS')||(this.arrowMovement&&keys.has('ArrowDown')),
      right:keys.has('KeyD')||(strafeArrows&&keys.has('ArrowRight')),left:keys.has('KeyA')||(strafeArrows&&keys.has('ArrowLeft')),jump:keys.has('Space')};
  }

  private updateMovement(delta:number,verticalDelta=delta):void {
    if(!this.archivalWinter&&this.arena.runtime){
      this.originalProjectileAccumulator=(this.originalProjectileAccumulator??0)+Math.max(0,delta);
      while(this.originalProjectileAccumulator>=1/30-1e-9){this.originalProjectileAccumulator-=1/30;this.advanceOriginalMuzzleFlashes();this.updateOriginalPlayerCallback();}
      return;
    }
    this.updateOriginalDoors();
    this.aiming=!this.chatOpen&&aimingHeld(this.controlsPreset,this.keys,!this.archivalWinter&&this.controlsPreset==='legacy'?false:this.rightMouseAiming,this.weaponState.current);
    const moveKeys=this.chatOpen?new Set<string>():this.keys;
    const arrowPreset=this.archivalWinter?'modern':this.controlsPreset;
    this.yaw+=legacyArrowTurn(moveKeys,this.arrowMovement,delta,arrowPreset);
    const {forward,side}=movementAxes(moveKeys,this.arrowMovement,arrowPreset);
    const move=new THREE.Vector3(side,0,-forward);if(move.lengthSq()>0)move.normalize().applyAxisAngle(WORLD_UP,this.yaw);
    const sprint=sprintHeld(this.controlsPreset,this.keys,this.aiming,this.arrowMovement);const speed=sprint?7.2:this.aiming?2.6:4.55;
    const desired=move.multiplyScalar(speed);this.velocity.x=THREE.MathUtils.damp(this.velocity.x,desired.x,12,delta);this.velocity.z=THREE.MathUtils.damp(this.velocity.z,desired.z,12,delta);
    this.velocity.y-=12.5*verticalDelta;
    if(this.arena.runtime){
      const {geometry,profile}=this.arena.runtime;
      const feet={x:this.camera.position.x,y:this.camera.position.y-PLAYER_HEIGHT,z:this.camera.position.z};
      // The original contact friction holds a resting sphere on terrain. Avoid
      // introducing lateral drift by sliding a gravity step down that surface.
      if(this.grounded&&this.velocity.y<0){const support=geometry.playerSupportHeightAt(feet.x,feet.z,feet.y+.08,profile.radius,profile.bodyHeight);if(support!==undefined&&Math.abs(feet.y-support)<.05)this.velocity.y=0;}
      const bounds=profile.bounds;
      const target={x:THREE.MathUtils.clamp(feet.x+this.velocity.x*delta,bounds.min.x+profile.radius,bounds.max.x-profile.radius),y:feet.y+this.velocity.y*verticalDelta,z:THREE.MathUtils.clamp(feet.z+this.velocity.z*delta,bounds.min.z+profile.radius,bounds.max.z-profile.radius)};
      const movement=geometry.movePlayer(feet,target,profile.radius,profile.bodyHeight);
      this.camera.position.set(movement.position.x,movement.position.y+PLAYER_HEIGHT,movement.position.z);
      if(this.velocity.y>0&&movement.normals.some(normal=>normal.y<-.5))this.velocity.y=0;
    }else{
      const old=this.camera.position.clone();this.camera.position.x+=this.velocity.x*delta;if(this.playerCollides()&&!this.tryStep(old.y))this.camera.position.x=old.x;
      const beforeZ=this.camera.position.y;this.camera.position.z+=this.velocity.z*delta;if(this.playerCollides()&&!this.tryStep(beforeZ))this.camera.position.z=old.z;
      const previousY=this.camera.position.y;this.camera.position.y+=this.velocity.y*verticalDelta;
      if(this.velocity.y>0&&this.playerCollides()){this.camera.position.y=previousY;this.velocity.y=0;}
    }
    const foot=this.camera.position.y-PLAYER_HEIGHT;const support=this.supportHeight(foot+.15);const landing=PLAYER_HEIGHT+support;
    // Triangle sweeps retain a microscopic separation to avoid penetration.
    // Treat that separation as contact so gravity cannot accumulate while resting.
    const landingTolerance=this.arena.runtime?1e-5:0;
    if(this.velocity.y<=0&&this.camera.position.y<=landing+landingTolerance){this.camera.position.y=landing;this.velocity.y=0;this.grounded=true;}
    else if(this.camera.position.y>landing+.08)this.grounded=false;
    const horizontal=Math.hypot(this.velocity.x,this.velocity.z);if(this.grounded&&horizontal>.5){this.bob+=delta*horizontal*(sprint?1.8:1.45);this.stepDistance+=delta*horizontal;if(this.stepDistance>2.35){this.stepDistance=0;this.audio.play('step',.35);}}
    this.camera.rotation.order='YXZ';this.camera.rotation.y=this.yaw;this.camera.rotation.x=this.pitch+this.recoil;
    this.recoil=THREE.MathUtils.damp(this.recoil,0,13,delta);
    const bobX=Math.sin(this.bob)*.012*Math.min(horizontal,4);const bobY=Math.abs(Math.cos(this.bob))*.012*Math.min(horizontal,4);
    this.weaponSwayX=THREE.MathUtils.damp(this.weaponSwayX,0,8,delta);this.weaponSwayY=THREE.MathUtils.damp(this.weaponSwayY,0,8,delta);
    this.updateViewModelPresentation(delta,horizontal,sprint,bobX,bobY);
    if(this.mode==='online'&&this.arena.runtime&&!this.needsAuthoritativeSpawn){
      (this.networkMovementPath??=[]).push({position:{x:this.camera.position.x,y:this.camera.position.y-PLAYER_HEIGHT,z:this.camera.position.z},velocity:{x:this.velocity.x,y:this.velocity.y,z:this.velocity.z},grounded:this.grounded});
    }
  }

  private updateOriginalWeaponPresentation(delta:number,updateLoadedRocket=true):void {
    const presentation=this.originalWeaponPresentation,collection=this.originalWeapons;if(!presentation||!collection)return;
    const id=this.weaponState.current,model=collection.models.get(id);if(!model)return;
    // Source weaponry reads Havok linearVelocity, whereas Game/network velocity
    // is the nominal wall-clock derivative (.05 physics seconds at30Hz).
    // Staged previews without a runtime already supply body-equivalent speed.
    const bodySpeed=this.velocity.length()/(this.arena?.runtime?ORIGINAL_PLAYER_DERIVATIVE_FACTOR:1);
    const adopted=this.currentSoloLocalWeaponPresentation();
    if(adopted){
      // The committed seven-model bank owns pose, motion and membership. Scope
      // projection below remains a renderer concern; do not age this state.
    }else if(this.weaponState.unarmed){
      // Source stepFrame advances ticker even with VOID selection, then skips
      // both gunpos interpolation and the stale model's position assignment.
      presentation.advanceTicker(delta,bodySpeed);
    }else presentation.update(delta,bodySpeed,model.position);
    // The final gun callback preserves membership from gun/whichgun phases.
    // Standalone movement and staged previews retain their ammo adapter.
    if(!adopted&&updateLoadedRocket)collection.setLoaded('rpg',this.weaponState.ammo.rpg>0);
    if(this.controlsPreset==='modern'){
      // Optional Modern aim remains an authored, immediately releasable input.
      const scoped=id==='sniper'&&this.aiming;
      if(scoped&&!this.originalScopeActive)this.originalScopeFov=35;
      else if(!scoped)this.originalScopeFov=50;
      else if(this.originalScopeFov>8)this.originalScopeFov=Math.max(8,this.originalScopeFov-.75*30*Math.max(0,delta));
      this.originalScopeActive=scoped;
    }else{
      const scope=this.originalScopeState??=createOriginalScope();
      this.originalScopeActive=scope.active;this.originalScopeFov=scope.fov;
    }
    this.applyOriginalScopeProjection();
    this.el('crosshair').style.setProperty('--crosshair-gap','5px');
  }

  /** Native dynamic-member envelope uses the same explicit800x600 viewport adapter as static UI art. */
  private syncOriginalHudProjection():void {
    this.originalResultUi?.resize(innerWidth,innerHeight);
    if(!this.originalNormalUi)return;
    const hud=byId('hud');
    hud.style.setProperty('--source-hud-scale-x',String(innerWidth/800));
    hud.style.setProperty('--source-hud-scale-y',String(innerHeight/600));
  }

  private syncOriginalNormalUi():void {
    this.originalNormalUi?.setState({sourceMap:!this.archivalWinter,map:this.mapId,playing:this.phase==='playing'||this.phase==='paused',scoped:this.originalScopeActive});
  }

  private applyOriginalScopeProjection():void {
    this.aimWeight=this.originalScopeActive?1:0;this.sprintWeight=0;
    this.camera.fov=this.viewCamera.fov=originalWeaponVerticalFov(this.camera.aspect,'vertical',this.originalScopeFov);
    this.camera.updateProjectionMatrix();this.viewCamera.updateProjectionMatrix();this.viewProjection.scale.set(1,1,1);
    this.el('scope-overlay').classList.toggle('active',this.originalScopeActive);
    this.syncOriginalNormalUi();
  }

  private captureOriginalMuzzleWorld(id:WeaponId):THREE.Matrix4|undefined {
    const adopted=this.currentSoloLocalWeaponPresentation()?.adapter.freeze();
    if(adopted){
      const handle:Record<WeaponId,string>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
      const model=adopted.models.find(model=>model.handle===handle[id]);if(!model)return;
      // Muzzle geometry already carries the source-unit scale. The captured
      // resource WORLD includes that scale, so remove it once on the right.
      const world=new THREE.Matrix4().fromArray(model.worldMatrix).multiply(new THREE.Matrix4().makeScale(1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE));
      if(!world.elements.every(Number.isFinite))throw Error('Solo muzzle WORLD overflow');
      world.elements[3]=0;world.elements[7]=0;world.elements[11]=0;world.elements[15]=1;return world;
    }
    const model=this.originalWeapons?.models.get(id);if(!model)return;
    model.updateWorldMatrix(true,false);this.camera.updateWorldMatrix(true,false);
    return this.enhancedRendering?new THREE.Matrix4().multiplyMatrices(this.camera.matrixWorld,model.matrixWorld):model.matrixWorld.clone();
  }

  private currentSoloLocalWeaponPresentation():{world:OriginalSoloObserver;adapter:OriginalReceiverLocalWeaponPresentation;frozen?:boolean}|undefined {
    const owner=this.soloLocalWeaponPresentation;
    // Terminal reset unregisters simulation while preserving one bounded
    // borrowed renderer snapshot. Full reset or a new owner restores it.
    if(owner?.frozen)return owner.adapter.freeze()?owner:undefined;
    if(owner&&(this.soloWorlds?.worlds.get('player')!==owner.world||!this.isSourceSolo())){
      this.soloLocalWeaponPresentation=undefined;owner.adapter.release();return undefined;
    }
    return owner?.adapter.freeze()?owner:undefined;
  }

  private spawnOriginalMuzzleFlash(id:WeaponId,world?:THREE.Matrix4,collection=this.originalWeapons):void {
    if(!collection)return;
    const matrix=world??this.captureOriginalMuzzleWorld(id);if(!matrix)return;
    const flash=collection.spawnFlash(id,matrix);if(!flash)return;
    this.scene.add(flash);this.originalFlashes.push({mesh:flash,bangtime:1,owner:collection});
  }

  /** Source muzzle.stepFrame adds once, then returns the model on its second
   * callback. Newly appended actors begin on the next nominal callback; native
   * actor-list mutation timing and clone membership remain unproved. */
  private advanceOriginalMuzzleFlashes():void {
    if(this.phase==='paused'||!this.originalFlashes?.length)return;
    for(let i=0;i<this.originalFlashes.length;){const flash=this.originalFlashes[i],owner=flash.owner??this.originalWeapons;
      if(owner?.muzzleModels?.isDisposed){owner.releaseFlash(flash.mesh);this.originalFlashes.splice(i,1);continue;}
      if(owner?.hasFlashLease?.(flash.mesh)===false){this.originalFlashes.splice(i,1);continue;}
      flash.mesh.visible=true;
      if(flash.bangtime===0){owner?.releaseFlash(flash.mesh);this.originalFlashes.splice(i,1);}else i++;
      flash.bangtime--;
    }
  }

  private clearOriginalMuzzleFlashes():void {
    for(const flash of this.originalFlashes){const owner=flash.owner??this.originalWeapons;if(owner?.muzzleModels?.isDisposed||owner?.hasFlashLease?.(flash.mesh)!==false)owner?.releaseFlash(flash.mesh);}this.originalFlashes.length=0;
  }

  private updateViewModelPresentation(delta:number,horizontal:number,sprinting:boolean,bobX:number,bobY:number):void {
    if(this.originalWeaponPresentation){this.updateOriginalWeaponPresentation(delta);return;}
    const id=this.weaponState.current;const metadata=this.weaponMetadata.get(id);if(!metadata)return;
    this.aimWeight=THREE.MathUtils.damp(this.aimWeight,this.aiming&&!this.weaponState.reloading?1:0,this.aiming?20:16,delta);
    this.sprintWeight=THREE.MathUtils.damp(this.sprintWeight,sprinting&&horizontal>.75?1:0,sprinting?11:15,delta);
    const aim=smoothVisualProgress(this.aimWeight);const sprint=smoothVisualProgress(this.sprintWeight);
    const hip=metadata.poses.hip;const ads=metadata.poses.ads;const run=metadata.poses.sprint;
    const poseX=THREE.MathUtils.lerp(THREE.MathUtils.lerp(hip.position.x,ads.position.x,aim),run.position.x,sprint)+bobX*(1-aim);
    const poseY=THREE.MathUtils.lerp(THREE.MathUtils.lerp(hip.position.y,ads.position.y,aim),run.position.y,sprint)-bobY*(1-aim);
    const poseZ=THREE.MathUtils.lerp(THREE.MathUtils.lerp(hip.position.z,ads.position.z,aim),run.position.z,sprint);
    this.viewModel.position.x=THREE.MathUtils.damp(this.viewModel.position.x,poseX,16,delta);
    this.viewModel.position.y=THREE.MathUtils.damp(this.viewModel.position.y,poseY,16,delta);
    this.viewModel.position.z=THREE.MathUtils.damp(this.viewModel.position.z,poseZ,16,delta);
    const rotationX=THREE.MathUtils.lerp(THREE.MathUtils.lerp(hip.rotation.x,ads.rotation.x,aim),run.rotation.x,sprint)+this.weaponSwayY*(1-aim);
    const rotationY=THREE.MathUtils.lerp(THREE.MathUtils.lerp(hip.rotation.y,ads.rotation.y,aim),run.rotation.y,sprint)+this.weaponSwayX*(1-aim);
    const rotationZ=THREE.MathUtils.lerp(THREE.MathUtils.lerp(hip.rotation.z,ads.rotation.z,aim),run.rotation.z,sprint)-this.weaponSwayX*.7*(1-aim);
    this.viewModel.rotation.x=THREE.MathUtils.damp(this.viewModel.rotation.x,rotationX,15,delta);
    this.viewModel.rotation.y=THREE.MathUtils.damp(this.viewModel.rotation.y,rotationY,15,delta);
    this.viewModel.rotation.z=THREE.MathUtils.damp(this.viewModel.rotation.z,rotationZ,15,delta);

    const targetFov=this.arena.runtime?THREE.MathUtils.lerp(50,ads.fov,aim):THREE.MathUtils.lerp(THREE.MathUtils.lerp(hip.fov,ads.fov,aim),run.fov,sprint);
    this.camera.fov=THREE.MathUtils.damp(this.camera.fov,targetFov,10,delta);this.camera.updateProjectionMatrix();
    const viewFov=id==='pistol'?52:id==='launcher'||id==='rpg'?60:id==='shotgun'||id==='sniper'?58:56;
    this.viewCamera.fov=THREE.MathUtils.damp(this.viewCamera.fov,viewFov,12,delta);this.viewCamera.updateProjectionMatrix();
    if(!this.enhancedRendering){const projectionScale=Math.tan(THREE.MathUtils.degToRad(this.camera.fov*.5))/Math.tan(THREE.MathUtils.degToRad(viewFov*.5));this.viewProjection.scale.set(projectionScale,projectionScale,1);}
    const crosshairGap=THREE.MathUtils.clamp(5+WEAPONS[id].spread*105+horizontal*1.2+sprint*8+Math.abs(this.recoil)*85,3,20)*(1-aim*.68);
    const crosshairGapValue=`${crosshairGap.toFixed(2)}px`;
    if(crosshairGapValue!==this.lastCrosshairGap){this.lastCrosshairGap=crosshairGapValue;this.el('crosshair').style.setProperty('--crosshair-gap',crosshairGapValue);}

    this.restoreViewModelParts(metadata);
    const presentation=this.archivalWinter?'modern':'legacy';
    const profile=getWeaponVisualProfile(id,presentation);const recoveryLambda=4/Math.max(.05,profile.recoilImpulse.recovery);
    this.viewRecoilPosition.x=THREE.MathUtils.damp(this.viewRecoilPosition.x,0,recoveryLambda,delta);this.viewRecoilPosition.y=THREE.MathUtils.damp(this.viewRecoilPosition.y,0,recoveryLambda,delta);this.viewRecoilPosition.z=THREE.MathUtils.damp(this.viewRecoilPosition.z,0,recoveryLambda,delta);
    this.viewRecoilRotation.x=THREE.MathUtils.damp(this.viewRecoilRotation.x,0,recoveryLambda,delta);this.viewRecoilRotation.y=THREE.MathUtils.damp(this.viewRecoilRotation.y,0,recoveryLambda,delta);this.viewRecoilRotation.z=THREE.MathUtils.damp(this.viewRecoilRotation.z,0,recoveryLambda,delta);
    this.viewActionPulse=THREE.MathUtils.damp(this.viewActionPulse,0,id==='shotgun'?12:28,delta);
    let reloadProgress=0;if(this.weaponState.reloading){const duration=weaponReloadDuration(this.weaponState.map,id,WEAPONS[id].reloadTime);reloadProgress=THREE.MathUtils.clamp(1-(this.weaponState.reloadEnd-this.elapsed)/duration,0,1);}
    const reloadPose=sampleReloadPose(id,reloadProgress,presentation);
    const refillActive=presentation==='legacy'&&id==='rifle'&&this.elapsed-this.legacyRifleRefillStartedAt<LEGACY_RIFLE_REFILL_DURATION;
    const equipProgress=refillActive?(this.elapsed-this.legacyRifleRefillStartedAt)/LEGACY_RIFLE_REFILL_DURATION:(this.elapsed-this.equipStartedAt)/profile.equipDuration;
    const equip=sampleEquipPose(id,equipProgress,presentation);
    metadata.model.position.set(reloadPose.root.position[0]+this.viewRecoilPosition.x+equip.position[0],reloadPose.root.position[1]+this.viewRecoilPosition.y+equip.position[1],reloadPose.root.position[2]+this.viewRecoilPosition.z+equip.position[2]);
    metadata.model.rotation.set(reloadPose.root.rotation[0]+this.viewRecoilRotation.x+equip.rotation[0],reloadPose.root.rotation[1]+this.viewRecoilRotation.y+equip.rotation[1],reloadPose.root.rotation[2]+this.viewRecoilRotation.z+equip.rotation[2]);
    this.offsetViewPart(metadata.parts.magazine,reloadPose.parts.magazine);
    this.offsetViewPart(metadata.parts.cylinder,reloadPose.parts.cylinder);
    this.offsetViewPart(metadata.parts.rocket,reloadPose.parts.rocket);
    this.offsetViewPart(metadata.parts.pump??metadata.parts.bolt,reloadPose.parts.action);
    const action=metadata.parts.pump??metadata.parts.bolt;if(action)action.position.z+=(id==='shotgun'?.29:.13)*this.viewActionPulse;
    if(metadata.parts.trigger)metadata.parts.trigger.rotation.x-=.22*this.viewActionPulse;
    if(metadata.parts.cylinder)metadata.parts.cylinder.rotation.z+=this.launcherCylinderAngle;
    if(metadata.parts.rocket)metadata.parts.rocket.visible=this.weaponState.ammo.rpg>0||(this.weaponState.reloading&&reloadProgress>.18);
    metadata.model.visible=id!=='sniper'||aim<.88;

    metadata.anchors.muzzle.getWorldPosition(this.scratchViewPosition);
    this.muzzleLight.position.copy(this.scratchViewPosition);
    if(this.muzzleFlash){
      this.muzzleFlash.position.copy(this.scratchViewPosition);this.muzzleFlash.visible=this.muzzleFlashRemaining>0;
      // Woodland's sharp still has a broad pale burst around the AK muzzle.
      // This footprint is an authored fit; other slots retain their prior size.
      const baseFlashSize=!this.archivalWinter&&this.mapId==='woodlands'&&id==='rifle'?1:.34;
      const flashSize=baseFlashSize*profile.muzzleScale*(.88+Math.min(1,this.muzzleFlashRemaining*18)*.28);this.muzzleFlash.scale.setScalar(flashSize);
    }
    this.el('scope-overlay').classList.toggle('active',id==='sniper'&&aim>.82);
  }

  private playerCollides():boolean {
    const p=this.camera.position;const foot=p.y-PLAYER_HEIGHT;const box=new THREE.Box3(new THREE.Vector3(p.x-PLAYER_RADIUS,foot+.06,p.z-PLAYER_RADIUS),new THREE.Vector3(p.x+PLAYER_RADIUS,p.y+.1,p.z+PLAYER_RADIUS));
    if(this.arena.runtime){const {geometry,profile}=this.arena.runtime;return geometry.playerIntersects({x:p.x,y:foot,z:p.z},profile.radius,profile.bodyHeight)||!!this.arena.barrelWorld?.playerIntersects({x:p.x,y:foot,z:p.z},profile.radius,profile.bodyHeight);}
    return this.arena.colliders.some(c=>c.intersectsBox(box))||Boolean(this.arena.map&&playerIntersectsLegacyRampSolid(this.arena.map,{x:p.x,y:foot,z:p.z},PLAYER_RADIUS,PLAYER_HEIGHT+.1));
  }

  private supportHeight(maxHeight:number):number {
    const p=this.camera.position;let support=this.arena.supportHeightAt?.(p.x,p.z,maxHeight)??0;
    for(const box of this.arena.colliders){if(box.max.y<=maxHeight&&p.x>box.min.x-PLAYER_RADIUS&&p.x<box.max.x+PLAYER_RADIUS&&p.z>box.min.z-PLAYER_RADIUS&&p.z<box.max.z+PLAYER_RADIUS)support=Math.max(support,box.max.y);}
    return support;
  }

  private tryStep(previousY:number):boolean {
    if(!this.grounded)return false;const foot=previousY-PLAYER_HEIGHT;const step=this.supportHeight(foot+.52);
    if(step<=foot+.02||step>foot+.52)return false;
    this.camera.position.y=PLAYER_HEIGHT+step;
    if(!this.playerCollides())return true;
    this.camera.position.y=previousY;
    return false;
  }

  private dropMetal(weapon:WeaponId):THREE.MeshStandardMaterial {
    let material=this.dropMetalMaterials.get(weapon);
    if(!material){material=new THREE.MeshStandardMaterial({color:WEAPONS[weapon].color,roughness:.42,metalness:.68});this.dropMetalMaterials.set(weapon,material);}
    return material;
  }

  private createDroppedWeapon(weapon:WeaponId):THREE.Group {
    if(this.originalWeapons){
      const source=this.originalWeapons.resources.get({rifle:'ak47',shotgun:'spas12',launcher:'rg6',rpg:'rpg',pistol:'pistol',sniper:'dragunov'}[weapon]);
      if(!source)throw new Error(`Original dropped weapon missing: ${weapon}`);
      const group=new THREE.Group(),model=source.clone();
      // Camera-local queue scheduling must not leak into world weapon drops.
      model.renderOrder=0;model.material=this.worldWeaponMaterials.get(source.uuid)??source.material;
      group.name=`original-drop-${weapon}`;model.rotation.x=-Math.PI/2;group.add(model);this.scene.add(group);return group;
    }
    const group=new THREE.Group();const metal=this.dropMetal(weapon);
    if(weapon==='rpg'||weapon==='launcher'){
      const tube=new THREE.Mesh(this.dropTubeGeometry,metal);tube.rotation.z=Math.PI/2;tube.castShadow=true;group.add(tube);
      if(weapon==='rpg'){const head=new THREE.Mesh(this.dropHeadGeometry,this.dropHeadMaterial);head.rotation.z=-Math.PI/2;head.position.x=.58;group.add(head);}
    }else{
      const receiver=new THREE.Mesh(this.dropReceiverGeometry,metal);receiver.rotation.y=Math.PI/2;receiver.castShadow=true;group.add(receiver);
      const barrel=new THREE.Mesh(this.dropBarrelGeometry,metal);barrel.rotation.z=Math.PI/2;barrel.position.x=.62;group.add(barrel);
      const stock=new THREE.Mesh(this.dropStockGeometry,this.dropStockMaterial);stock.position.x=-.5;group.add(stock);
    }
    const ring=new THREE.Mesh(this.dropRingGeometry,this.dropRingMaterial);ring.rotation.x=Math.PI/2;ring.position.y=-.08;group.add(ring);
    this.scene.add(group);return group;
  }

  private dropWeapon(enemy:Enemy):void {
    if(this.hasCommittedSoloModels()&&this.isSourceSolo())return;
    if(this.isSourceSolo())return;
    const group=this.createDroppedWeapon(enemy.weapon);
    if(this.arena.runtime){const eye={x:enemy.group.position.x,y:enemy.group.position.y+PLAYER_HEIGHT,z:enemy.group.position.z};const position=originalDropPosition(eye,this.arena.runtime.scale);group.position.set(position.x,position.y,position.z);group.rotation.y=originalDropYaw(Math.random());}
    else{group.position.copy(enemy.group.position);group.position.y+=.22;group.rotation.y=enemy.group.rotation.y;}
    this.weaponDrops.push({group,weapon:enemy.weapon,expiresAt:this.arena.runtime?null:this.elapsed+30,baseY:group.position.y});
  }

  private dropSourceSoloWeapon(weapon:WeaponId,feet:Readonly<Vec3>,rig:OriginalSoldier):void {
    if(this.hasCommittedSoloModels())return;
    const group=new THREE.Group();group.name=`original-drop-${weapon}`;this.scene.add(group);
    const sourceModel=rig.detachSourceGun(weapon,group);
    sourceModel.matrixAutoUpdate=true;sourceModel.position.set(0,0,0);sourceModel.rotation.set(-Math.PI/2,0,0);sourceModel.scale.set(1,1,1);
    const position=originalDropPosition({...feet,y:feet.y+PLAYER_HEIGHT},this.arena.runtime!.scale);
    group.position.set(position.x,position.y,position.z);group.rotation.y=originalDropYaw(Math.random());
    group.updateWorldMatrix(true,false);sourceModel.updateMatrix();rig.setSourceGunWorld(sourceModel,new THREE.Matrix4().multiplyMatrices(group.matrixWorld,sourceModel.matrix));
    this.weaponDrops.push({group,weapon,expiresAt:null,baseY:group.position.y,sourceModel,sourceRig:rig});
  }

  private removeWeaponDrop(index:number):void {
    // Geometry and materials are pooled class members; only the group leaves the scene.
    const drop=this.weaponDrops[index];if(drop.sourceModel)drop.sourceRig!.removeSourceGun(drop.sourceModel);
    this.scene.remove(drop.group);this.weaponDrops.splice(index,1);
  }

  private updateWeaponDrops(delta:number,captured?:readonly WeaponDrop[]):void {
    // The private owner controls pickup collection and model membership. Its
    // visual retirement still needs explicit private model binding; legacy
    // expiry/collection must not remove a second owner's retained gun alias.
    if(this.hasCommittedSoloModels()||this.hasCommittedSoloLoadout())return;
    // The source callback already captured actor order. Reversing that order
    // changes which nearby gun rearms an unarmed player and receives reloads.
    // Standalone archival updates retain their previous reverse traversal.
    for(const drop of captured??[...this.weaponDrops].reverse()){
      const i=this.weaponDrops.indexOf(drop);if(i<0)continue;
      if(!this.arena.runtime){drop.group.rotation.y+=delta*.35;drop.group.position.y=drop.baseY+Math.sin(this.elapsed*2+drop.group.position.x)*.035;}
      if(drop.expiresAt!==null&&dropExpired(this.elapsed,drop.expiresAt)){this.removeWeaponDrop(i);continue;}
      if(!this.playerAlive)continue;
      if(this.arena.runtime){
        if(!originalPickupInReach(this.camera.position,drop.group.position,this.arena.runtime.scale))continue;
        this.weaponState.addReserve(drop.weapon,ORIGINAL_DROP_AMMO[drop.weapon]);
        if(this.weaponState.unarmed){this.weaponState.current=drop.weapon;this.weaponState.unarmed=false;this.syncWeaponPresentation(drop.weapon,true);}
        this.reload();this.appendChat('',originalPickupFeedback(drop.weapon),'feedback');this.removeWeaponDrop(i);this.score+=ORIGINAL_PICKUP_SCORE;this.updateHud();continue;
      }
      const feet=new THREE.Vector3(this.camera.position.x,this.camera.position.y-PLAYER_HEIGHT,this.camera.position.z);if(canCollectDrop(feet,drop.group.position)){this.weaponState.addReserve(drop.weapon,WEAPONS[drop.weapon].magazine);this.weaponState.reloading=false;this.switchWeapon(drop.weapon);this.audio.play('ui');this.setMessage(`${WEAPONS[drop.weapon].name} SCAVENGED`,1.1);this.removeWeaponDrop(i);this.updateHud();}
    }
  }

  private clearWeaponDrops():void {for(let i=this.weaponDrops.length-1;i>=0;i--)this.removeWeaponDrop(i);}

  private collectPickups():void {
    for(const pickup of this.arena.pickups){if(pickup.type==='ammo'&&this.hasCommittedSoloLoadout())continue;const dx=pickup.mesh.position.x-this.camera.position.x;const dz=pickup.mesh.position.z-this.camera.position.z;if(!pickup.active||Math.hypot(dx,dz)>1.35||Math.abs(pickup.mesh.position.y-(this.camera.position.y-PLAYER_HEIGHT))>1.5)continue;
      const path=pickup.mesh.position.clone().sub(this.camera.position);const distance=path.length();if(this.distanceToWorld(this.camera.position,path.normalize(),distance)<distance-.05)continue;
      let used=false;if(pickup.type==='health'&&(!this.archivalWinter||this.health<100)){if(this.archivalWinter)this.health=Math.min(100,this.health+40);else{const result=applyOriginalPlayerHealthDelta(this.ensureOriginalHealth(),20);this.health=result.health;this.score+=ORIGINAL_PICKUP_SCORE;if(result.dead)this.killPlayer();}used=true;}
      if(this.archivalWinter&&pickup.type==='armor'&&this.armor<100){this.armor=Math.min(100,this.armor+50);used=true;}
      if(pickup.type==='ammo'){for(const id of Object.keys(WEAPONS) as WeaponId[])this.weaponState.addReserve(id,Math.ceil(WEAPONS[id].magazine*.7));used=true;}
      if(used){pickup.active=false;pickup.mesh.visible=false;pickup.respawnAt=this.archivalWinter?this.elapsed+18:Infinity;if(this.archivalWinter)this.audio.play('ui');this.setMessage(`${pickup.type.toUpperCase()} ACQUIRED`,1);this.updateHud();}
    }
  }

  private endRound(won:boolean,winnerName=''):void {
    this.cancelOriginalReconciliation();
    if(this.phase!=='playing'&&this.phase!=='paused')return;if(!this.archivalWinter)this.resetOriginalActorDispatch();this.invalidateImmersiveCapture();this.closeChat(false);this.phase=won?'won':'lost';this.releaseActiveInput();this.releaseKeyboardCapture();document.exitPointerLock();byId('hud').classList.add('hidden');byId('pause').classList.add('hidden');
    this.resetSourceScope();
    this.syncOriginalNormalUi();
    byId('respawn-overlay').classList.remove('active');byId('scope-overlay').classList.remove('active');
    const result=byId('result');result.classList.remove('hidden');
    result.classList.toggle('source-result',!this.archivalWinter);
    this.originalResultUi?.setEdition(this.mapId);
    this.originalResultUi?.start(this.elapsed);
    byId('result-title').textContent='GAME OVER';
    if(this.archivalWinter){
      byId('result-kicker').textContent=won?'Round report':`${winnerName} reached the frag limit`;
      const accuracy=this.shots?Math.min(100,Math.round(this.hits/this.shots*100)):0;const duration=Math.max(0,Math.round(this.elapsed-this.startTime));const standings=this.getStandings();const place=standingPlace(standings,this.mode==='online'?this.network?.clientId??'':'0-player');
      byId('result-stats').innerHTML=`<div><b>${place}</b><span>PLACE</span></div><div><b>${this.kills}/${this.deaths}</b><span>K / D</span></div><div><b>${accuracy}%</b><span>ACCURACY</span></div><div><b>${duration}s</b><span>TIME</span></div>`;
    }else{
      const name=this.latestNetworkSnapshot?.players.find(player=>player.id===this.network?.clientId)?.name
        ??this.localCallsign??'COMRADE';
      byId('result-kicker').textContent=`Our commiserations, Comrade ${name}, you are now pieces of Russian history, thanks to ${winnerName||'UNKNOWN'}...`;
      byId('result-stats').innerHTML='';
      byId('result-stats').textContent=`Would you like to submit your score of ${this.score} points?\n\nClick go to see if you are worthy of Kremlin fame.`;
    }
    if(this.archivalWinter)this.audio.play(won?'ui':'hurt');
  }

  private showHitmarker(kill:boolean,headshot=false):void {
    const marker=byId('hitmarker');marker.classList.toggle('kill',kill);marker.classList.toggle('headshot',headshot);marker.style.opacity='1';marker.style.transform='translate(-50%,-52%) scale(1)';
    if(this.hitmarkerHideTimer!==undefined)clearTimeout(this.hitmarkerHideTimer);
    this.hitmarkerHideTimer=setTimeout(()=>{marker.style.opacity='0';marker.style.transform='translate(-50%,-52%) scale(.7)';this.hitmarkerHideTimer=undefined;},headshot?145:100);
  }
  private setMessage(text:string,duration:number):void {
    const prompt=byId('prompt');prompt.textContent=text;prompt.classList.add('active');this.messageTimer=duration;
  }

  private updateHud():void {
    this.syncOriginalNormalUi();
    const id=this.weaponState.current;const spec=WEAPONS[id];
    byId('health').textContent=(this.archivalWinter?Math.max(0,Math.ceil(this.health)):Math.ceil(this.health)).toString();byId('armor').textContent=Math.ceil(this.armor).toString();
    if(!this.archivalWinter){if(this.mapId==='barrack')updateOriginalBarrackHealth(this.health);else updateLegacyHealthHud(this.health);}
    byId('health-bar').style.width=`${Math.max(0,this.health)}%`;byId('armor-bar').style.width=`${this.armor}%`;
    byId('weapon-name').textContent=spec.name;byId('ammo').textContent=this.weaponState.ammo[id].toString().padStart(2,'0');byId('reserve').textContent=this.weaponState.reserve[id].toString().padStart(3,'0');
    for(const weapon of WEAPON_IDS){
      byId(`ammo-${weapon}`).textContent=`${this.weaponState.ammo[weapon]} / ${this.weaponState.reserve[weapon]}`;
      const row=document.querySelector(`[data-weapon="${weapon}"]`);
      const selected=this.archivalWinter?(this.weaponState.unarmed?null:id):(this.sourceDisplayedWeapon===undefined?(this.weaponState.unarmed?null:id):this.sourceDisplayedWeapon);
      row?.classList.toggle('active',weapon===selected);
      if(!this.archivalWinter){
        const header=row?.querySelector('th'),prefix=originalAmmoHudPrefix(weapon);
        if(header&&header.textContent!==prefix)header.textContent=prefix;
      }
    }
    byId('fire-mode').textContent=spec.automatic?'AUTO':'SEMI';byId('grenades').textContent=this.grenades.toString();
    const limit=this.mode==='online'?this.networkFragLimit:KILL_LIMIT;
    byId('enemy-count').textContent=`${Math.min(this.kills,limit)} / ${limit}`;byId('score').textContent=this.score.toString().padStart(4,'0');
    const legacyScore=document.getElementById('legacy-score');if(legacyScore)legacyScore.textContent=this.score.toString();
    const leader=this.getStandings()[0];byId('leader-line').textContent=`1ST ${leader.name} ${leader.frags} · YOU ${this.kills}`;
  }

  /** Cached getElementById for elements touched every frame. */
  private el<T extends HTMLElement>(id: string): T {
    let element = this.domCache.get(id);
    if (!element) { element = byId(id); this.domCache.set(id, element); }
    return element as T;
  }

  /**
   * All arena point/spot lights have short falloff distances, so only the few
   * nearest the camera can contribute visibly. Keeping a fixed-size set
   * visible caps the per-fragment light loop in every lit shader without
   * cycling the compiled program count.
   */
  private collectCullableLights(): void {
    this.scene.traverse((object) => {
      if (object.parent === this.camera) return;
      if (object === this.muzzleLight || object === this.worldMuzzleLight) return;
      if (this.blastLights.some((slot) => slot.light === object)) return;
      if (object instanceof THREE.SpotLight) this.cullableSpotLights.push({ light: object, position: new THREE.Vector3(), distanceSq: 0 });
      else if (object instanceof THREE.PointLight) this.cullablePointLights.push({ light: object, position: new THREE.Vector3(), distanceSq: 0 });
    });
  }

  private updateLightBudget(): void {
    const pointBudget = this.renderTier === 'high' ? 6 : 4;
    const spotBudget = this.renderTier === 'high' ? 2 : 1;
    this.applyLightBudget(this.cullablePointLights, pointBudget);
    this.applyLightBudget(this.cullableSpotLights, spotBudget);
  }

  private applyLightBudget(entries: { light: THREE.Light; position: THREE.Vector3; distanceSq: number }[], budget: number): void {
    if (entries.length <= budget) return;
    // Lights under a hidden ancestor (collected pickups, review-hidden
    // structures) never reach the render list, so they must not occupy budget
    // slots — otherwise the counted light total, and with it the compiled
    // shader variant, would fluctuate.
    const eligible: typeof entries = [];
    for (const entry of entries) {
      let ancestor: THREE.Object3D | null = entry.light.parent;
      let hidden = false;
      while (ancestor) { if (!ancestor.visible) { hidden = true; break; } ancestor = ancestor.parent; }
      if (hidden) continue;
      entry.light.getWorldPosition(entry.position);
      entry.distanceSq = entry.position.distanceToSquared(this.camera.position);
      eligible.push(entry);
    }
    eligible.sort((a, b) => a.distanceSq - b.distanceSq);
    for (let index = 0; index < eligible.length; index++) eligible[index].light.visible = index < budget;
  }

  private updateRadar():void {
    const radar=this.el('radar-dots');
    const opponents:Iterable<{alive:boolean;group:THREE.Group}>=this.mode==='online'?this.remotePlayers.values():this.enemies;
    let used=0;
    for(const enemy of opponents){
      if(!enemy.alive)continue;
      const dx=enemy.group.position.x-this.camera.position.x;
      const dy=enemy.group.position.y-this.camera.position.y;
      const dz=enemy.group.position.z-this.camera.position.z;
      if(dx*dx+dy*dy+dz*dz>48*48)continue;
      let dot=this.radarDots[used];
      if(!dot){dot=document.createElement('i');this.radarDots.push(dot);radar.appendChild(dot);}
      const x=THREE.MathUtils.clamp(dx/48*46,-46,46);const y=THREE.MathUtils.clamp(dz/48*46,-46,46);
      dot.style.left=`${51+x}px`;dot.style.top=`${51+y}px`;dot.style.display='';
      used++;
    }
    for(let index=used;index<this.radarDots.length;index++)this.radarDots[index].style.display='none';
    if(!this.radarPlayerDot)this.radarPlayerDot=document.querySelector<HTMLElement>('.player-dot');
    if(this.radarPlayerDot)this.radarPlayerDot.style.transform=`rotate(${-this.yaw}rad)`;
  }

  private writeContactShadow(index:number,position:THREE.Vector3,radius:number,opacity:number,visible:boolean,groundY?:number):number {
    if(!visible||index>=this.contactShadowTargets.length)return index;
    const target=this.contactShadowTargets[index];target.position.copy(position);if(groundY!==undefined)target.position.y=groundY;target.radius=radius;target.opacity=opacity;target.visible=true;
    return index+1;
  }

  private updateContactShadows():void {
    if(!this.contactShadows)return;
    let index=0;
    for(const enemy of this.enemies)index=this.writeContactShadow(index,enemy.group.position,.58,enemy.alive?1:.65,enemy.group.visible);
    for(const remote of this.remotePlayers.values())index=this.writeContactShadow(index,remote.group.position,.58,remote.alive?1:.65,remote.group.visible);
    for(const pickup of this.arena.pickups)index=this.writeContactShadow(index,pickup.mesh.position,.40,.55,pickup.active&&pickup.mesh.visible,0);
    if(this.hasCommittedSoloModels()){
      const seen=new Set<string>();for(const binding of this.soloReceiverPickupBindings){if(seen.has(binding.gunHandle))continue;seen.add(binding.gunHandle);
        binding.model.getWorldPosition(this.scratchViewPosition);index=this.writeContactShadow(index,this.scratchViewPosition,.48,.55,binding.model.visible&&binding.model.parent!==null,0);}
    }else for(const drop of this.weaponDrops)index=this.writeContactShadow(index,drop.group.position,.48,.55,drop.group.visible,0);
    const transportCollider=this.archivedArena?.militaryTransport.colliders[0];
    if(transportCollider){transportCollider.getCenter(this.scratchViewPosition);index=this.writeContactShadow(index,this.scratchViewPosition,2.35,.72,this.archivedArena?.militaryTransport.group.visible??false,0);}
    for(;index<this.contactShadowTargets.length;index++)this.contactShadowTargets[index].visible=false;
    this.contactShadows.update(this.contactShadowTargets,this.camera.position);
  }

  private sampleSnowMovement():void {
    const active=this.phase==='playing';
    this.snowTracks.sampleActor('player',{
      x:this.camera.position.x,
      y:this.camera.position.y-PLAYER_HEIGHT,
      z:this.camera.position.z,
    },this.yaw+Math.PI,active&&this.playerAlive&&this.grounded);
    for(const enemy of this.enemies)this.snowTracks.sampleActor(
      `bot:${enemy.id}`,
      enemy.group.position,
      enemy.group.rotation.y,
      active&&enemy.alive&&enemy.group.visible,
    );
    for(const remote of this.remotePlayers.values())this.snowTracks.sampleActor(
      `remote:${remote.id}`,
      remote.group.position,
      remote.group.rotation.y,
      active&&remote.alive&&remote.group.visible,
    );
  }

  private advancePlayingPopulation(delta:number):void {
      if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting))return;
      if(!this.archivalWinter&&!this.arena.runtime)this.updateSourceReloadInput();
      if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting))return;
      if(this.playerAlive){if(this.mode==='solo')this.collectPickups();else this.collectNetworkItems();}else if(this.mode==='solo')this.updatePlayerRespawn();else this.updateNetworkRespawn();
      if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting))return;
      if(this.mode==='solo'&&!this.isSourceSolo())this.updateWeaponDrops(delta);
      if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting))return;
      if(this.mode==='solo')for(const enemy of this.enemies){if(this.phase!=='playing'||(this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting))break;
        const sourceContext=this.isSourceSolo()?this.soloEnemyDecisionContext(enemy):undefined;
        if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting))break;
        if(enemy.alive){const target=this.chooseCombatTarget(enemy);if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting))break;enemy.update(delta,this.elapsed,target.enemy?target.position.clone().add(new THREE.Vector3(0,1.25,0)):target.position,this.arena,(origin,damage)=>this.combatantShoot(enemy,target.enemy,origin,damage),this.camera.position,sourceContext);}
        else{enemy.update(delta,this.elapsed,this.camera.position,this.arena,()=>undefined,this.camera.position,sourceContext);if(!(this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting)&&this.elapsed-enemy.deathTime>=1.3){enemy.respawn(this.safestEnemySpawn(),this.elapsed,this.isSourceSolo());if(this.isSourceSolo())this.registerSoloEnemy(enemy);this.snowTracks.resetActor(`bot:${enemy.id}`);}}
      }
      else {if(this.sourceRemoteViewEpoch==null)for(const remote of this.remotePlayers.values())remote.update(delta,this.camera.position);this.publishNetworkTransform();}
      if((this.soloTeardown||this.soloCurrentPending||this.soloWorlds?.currentAwaiting))return;
      if(this.archivalWinter){const spec=WEAPONS[this.weaponState.current];if(this.playerAlive&&this.firing&&spec.automatic)this.tryFire();this.updateAutoReload();this.updateWeaponReload();}
  }

  private animate=():void=>{
    requestAnimationFrame(this.animate);const frameDelta=this.clock.getDelta();const delta=Math.min(.033,frameDelta);if(!this.soloTeardown&&!this.soloCurrentPending&&!this.soloWorlds?.currentAwaiting)this.elapsed=performance.now()/1000;
    this.originalResultUi?.advance(this.elapsed);
    this.flushOriginalReconciliation();
    this.advanceSourceRemoteView();
    this.updateOriginalDoors();
    const presentationTime=this.environmentReviewTime??this.elapsed;
    if(this.archivedArena)updateArena(this.archivedArena,this.environmentReviewTime===null?delta:0,presentationTime);else this.updateLegacyPickups(presentationTime);this.atmosphere.update(presentationTime,this.camera);if(!this.combatEffectsFrozen)this.advanceCombatEffects(delta);this.snowTracks.update(delta);this.updateCasings(delta);this.updateNetworkProjectiles(delta);
    this.muzzleFlashRemaining=Math.max(0,this.muzzleFlashRemaining-delta);this.muzzleLight.intensity=THREE.MathUtils.damp(this.muzzleLight.intensity,0,32,delta);this.worldMuzzleLight.intensity=THREE.MathUtils.damp(this.worldMuzzleLight.intensity,0,30,delta);
    this.damageOpacity=THREE.MathUtils.damp(this.damageOpacity,0,4,delta);this.el('damage-flash').style.opacity=this.archivalWinter&&this.damageOpacity>=.004?this.damageOpacity.toFixed(3):'0';this.renderOriginalHurt();
    if(this.phase==='playing'){
      this.advanceGameplayFrame(frameDelta);
      this.advancePlayingPopulation(delta);
      const statusText=this.aiming?'FOCUS AIM':'COMBAT READY';
      if(statusText!==this.lastStatusText){this.lastStatusText=statusText;this.el('status-text').textContent=statusText;}
      if(this.messageTimer>0){this.messageTimer-=delta;if(this.messageTimer<=0)byId('prompt').classList.remove('active');}
      this.updateRadar();
    }
    if(this.archivalWinter)this.sampleSnowMovement();
    this.soloReceiverTransients?.presentation.rebase();
    this.soloReceiverModels?.presentation.rebase();
    if(this.hasCommittedSoloProjectiles())this.soloProjectilePresentation!.adapter.rebase();
    this.updateContactShadows();
    this.updateOriginalDrawDistance();
    this.sunShadow.update(this.camera);
    this.viewModel.visible=!this.soldierReviewMode&&this.playerAlive&&(this.phase==='playing'||this.phase==='paused');
    if(this.viewFill)this.viewFill.visible=this.viewModel.visible;
    if(this.viewDepthReset)this.viewDepthReset.visible=this.viewModel.visible;
    // Accumulate every world, post-processing and viewmodel pass into one
    // frame-level sample. With the renderer default, high-tier telemetry only
    // described EffectComposer's final fullscreen triangle.
    this.renderer.info.reset();
    if(this.renderTier==='balanced'&&this.shadowFrameParity++%2===0)this.renderer.shadowMap.needsUpdate=true;
    this.updateLightBudget();
    if(this.enhancedRendering&&this.composer){
      this.composer.render();
      if(this.viewModel.visible){const autoClear=this.renderer.autoClear;this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.viewScene,this.viewCamera);this.renderer.autoClear=autoClear;}
    }else this.renderer.render(this.scene,this.camera);
  };

  private resize():void {this.syncOriginalHudProjection();this.camera.aspect=this.registeredReferenceAspect??innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.viewCamera.aspect=this.registeredReferenceAspect??innerWidth/innerHeight;this.viewCamera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);this.composer?.setSize(innerWidth,innerHeight);}

  private keyboardLock(): KeyboardLock | undefined {
    const keyboard = (navigator as Navigator & { keyboard?: Partial<KeyboardLock> }).keyboard;
    return keyboard && typeof keyboard.lock === 'function' && typeof keyboard.unlock === 'function'
      ? keyboard as KeyboardLock
      : undefined;
  }

  private releaseActiveInput(preserveSourceInput=false): void {
    this.aiming=false;if(!preserveSourceInput){this.firing=false;this.rightMouseAiming=false;this.keys.clear();}this.originalMouseDelta={x:0,y:0};
  }

  private invalidateImmersiveCapture():void {
    this.immersiveCaptureGeneration++;
    this.immersiveCaptureOwnerGeneration=undefined;
  }

  private newerImmersiveCaptureOwnsInput(staleGeneration:number):boolean {
    return this.phase==='playing'
      && this.immersiveCaptureGeneration>staleGeneration
      && this.immersiveCaptureOwnerGeneration===this.immersiveCaptureGeneration;
  }

  private releaseKeyboardCapture(): void {
    this.keyboardCaptureAttempt++;
    document.documentElement.dataset.keyboardCapture='released';
    try { this.keyboardLock()?.unlock(); } catch { /* The browser also releases it on fullscreen exit. */ }
  }

  private requestKeyboardCapture(): void {
    const keyboard=this.keyboardLock();
    // The fullscreen keyboardLock option is handled by enterImmersiveMode().
    // Reaching this method without Chromium's API means only DOM fallback is
    // available, which cannot reclaim a shortcut the browser never dispatches.
    if(!keyboard){document.documentElement.dataset.keyboardCapture='fallback';return;}
    const attempt=++this.keyboardCaptureAttempt;
    document.documentElement.dataset.keyboardCapture='pending';
    let request:Promise<void>;
    try { request=keyboard.lock(); }
    catch { this.keyboardCaptureFailed(attempt); return; }
    void Promise.resolve(request).then(()=>{
      if(attempt!==this.keyboardCaptureAttempt||!document.fullscreenElement||this.phase!=='playing'){
        // Keyboard Lock is global. A stale promise must not unlock a newer
        // playing attempt that has already acquired (or is acquiring) it.
        const newerPlayingCaptureOwnsFullscreen=attempt<this.keyboardCaptureAttempt
          && this.phase==='playing'
          && !!document.fullscreenElement
          && this.immersiveCaptureOwnerGeneration===this.immersiveCaptureGeneration;
        if(!newerPlayingCaptureOwnsFullscreen){
          try { keyboard.unlock(); } catch { /* Already released by the browser. */ }
        }
        return;
      }
      document.documentElement.dataset.keyboardCapture='locked';
    }).catch(()=>this.keyboardCaptureFailed(attempt));
  }

  private keyboardCaptureFailed(attempt:number):void {
    if(attempt!==this.keyboardCaptureAttempt)return;
    document.documentElement.dataset.keyboardCapture='fallback';
    if(this.phase==='playing')this.setMessage('BROWSER KEY CAPTURE UNAVAILABLE · ESC TO PAUSE',3);
  }

  private captureFailed(message:string):void {
    if(this.phase!=='playing')return;
    this.releaseKeyboardCapture();
    this.pause();
    this.setMessage(`${message} · PRESS RESUME`,2.5);
  }

  private requestPointerCapture(expectedGeneration=this.immersiveCaptureGeneration):void {
    if(expectedGeneration!==this.immersiveCaptureGeneration||this.phase!=='playing')return;
    let request:Promise<void>;
    try { request=this.renderer.domElement.requestPointerLock(); }
    catch { this.captureFailed('POINTER CAPTURE BLOCKED'); return; }
    void Promise.resolve(request).then(()=>{
      if(expectedGeneration===this.immersiveCaptureGeneration&&this.phase==='playing')return;
      if(this.newerImmersiveCaptureOwnsInput(expectedGeneration))return;
      if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock();
    }).catch(()=>{if(expectedGeneration===this.immersiveCaptureGeneration&&this.phase==='playing')this.captureFailed('POINTER CAPTURE BLOCKED');});
  }

  private safestEnemySpawn(): THREE.Vector3 {
    const threats=[...(this.playerAlive?[this.camera.position]:[]),...this.enemies.filter(enemy=>enemy.alive).map(enemy=>this.enemyCombatPosition(enemy))];
    return chooseSafestSpawn(this.arena.spawnPoints,threats);
  }

  private safestPlayerSpawn(): THREE.Vector3 {
    return chooseSafestSpawn(this.arena.spawnPoints,this.enemies.filter(enemy=>enemy.alive).map(enemy=>this.enemyCombatPosition(enemy)));
  }

  private soloEnemyDecisionContext(enemy:Enemy):SoloEnemyDecisionContext {
    return {
      intent:intent=>{enemy.sourceIntent=intent;},
      visible:(origin,direction,distance)=>this.soloWorldDistance(enemy.id,origin,direction,distance)>=distance-.12,
      blocked:(direction,speed,delta)=>{
        const worlds=this.ensureSoloWorlds(),world=worlds?.worlds.get(enemy.id);if(!world)return true;
        // Retain the authored navigation rejection/decision response against
        // this observer's geometry. This is a probe, never body integration or
        // rollback; source physics still owns gravity/contact momentum.
        const proposed={x:enemy.sourcePosition.x+direction.x*speed*delta,y:enemy.sourcePosition.y,z:enemy.sourcePosition.z+direction.z*speed*delta};
        proposed.y=worlds!.supportHeight(enemy.id,proposed,enemy.sourcePosition.y+.5)??enemy.sourcePosition.y;
        return worlds!.geometryFor(enemy.id).playerIntersects(proposed,.3,1.9)||world.barrels.playerIntersects(proposed,.3,1.9);
      },
    };
  }

  private enemyCombatPosition(enemy:Enemy):THREE.Vector3 {
    return !this.archivalWinter&&this.mode==='solo'&&this.arena.runtime?enemy.sourcePosition:enemy.group.position;
  }

  private chooseCombatTarget(shooter:Enemy):{position:THREE.Vector3;enemy:Enemy|null} {
    const cached=shooter.combatTarget;
    if(cached&&this.elapsed<shooter.targetRevalidateAt&&(cached.enemy?cached.enemy.alive:this.playerAlive))return cached;
    const source=!this.archivalWinter&&this.mode==='solo'&&!!this.arena.runtime;
    const shooterPosition=this.enemyCombatPosition(shooter);
    const candidates:Array<{position:THREE.Vector3;enemy:Enemy|null;distance:number;visible:boolean}>=[];
    const human=source?shooter.sourceTargets.get('player'):this.camera.position;
    if(this.playerAlive&&human)candidates.push({position:human,enemy:null,distance:shooterPosition.distanceToSquared(human),visible:this.combatantVisible(shooter,human)});
    for(const candidate of this.enemies)if(candidate!==shooter&&candidate.alive){
      const position=source?shooter.sourceTargets.get(candidate.id):candidate.group.position;if(!position)continue;
      candidates.push({position,enemy:candidate,distance:shooterPosition.distanceToSquared(position),visible:this.combatantVisible(shooter,SCRATCH_TARGET_POINT.copy(position).setY(position.y+1.2))});
    }
    const pool=candidates.some(candidate=>candidate.visible)?candidates.filter(candidate=>candidate.visible):candidates;pool.sort((a,b)=>a.distance-b.distance);
    const chosen=pool[0]??{position:shooterPosition,enemy:null};
    shooter.combatTarget=chosen;shooter.targetRevalidateAt=this.elapsed+.22;
    return chosen;
  }

  private combatantVisible(shooter:Enemy,target:THREE.Vector3):boolean {
    const origin=SCRATCH_ORIGIN.copy(this.enemyCombatPosition(shooter));origin.y+=1.5;
    const direction=SCRATCH_DIRECTION.copy(target).sub(origin),distance=direction.length();
    return distance===0||this.soloWorldDistance(shooter.id,origin,direction.normalize(),distance)>=distance-.12;
  }

  private getStandings():Array<{id:string;name:string;frags:number;deaths:number}> {
    // Events can advance the local counters before the next room snapshot.
    // In particular lethal damage ends a Legacy life before its killed event.
    if(this.mode==='online'&&this.latestNetworkSnapshot){const localId=this.network?.clientId;return rankStandings(this.latestNetworkSnapshot.players.map(player=>({id:player.id,name:player.id===localId?'YOU':player.name,frags:player.id===localId?this.kills:player.frags,deaths:player.id===localId?this.deaths:player.deaths})));}
    return rankStandings([{id:'0-player',name:'YOU',frags:this.kills,deaths:this.deaths},...this.enemies.map(enemy=>({id:enemy.id,name:enemy.name,frags:enemy.frags,deaths:enemy.deaths}))]);
  }

  private publishNetworkTransform():void {
    if(this.mode!=='online'||!this.network||this.needsAuthoritativeSpawn)return;
    this.flushOriginalReconciliation();
    this.network.setTransform({
      position:{x:this.camera.position.x,y:this.camera.position.y-PLAYER_HEIGHT,z:this.camera.position.z},
      velocity:{x:this.velocity.x,y:this.velocity.y,z:this.velocity.z},yaw:this.yaw,pitch:this.pitch,grounded:this.grounded,weapon:this.weaponState.current,...(!this.archivalWinter?{typing:this.chatOpen,sourceInput:this.originalMovementInput(),movementMode:this.originalMovementMode()}:{}),
    },this.arena.runtime?this.networkMovementPath:undefined);
    this.networkMovementPath=[];
  }

  private multiplayerDebugState():MultiplayerDebugState {
    const snapshot=this.latestNetworkSnapshot;
    return {worldProjection:{near:this.camera.near,far:this.camera.far},sourceGunTiming:{localTime:this.elapsed,nextCallback:Number.isFinite(this.nextSourceReloadPoll)?this.nextSourceReloadPoll:null,estimatedServerTime:this.network?.estimatedServerTimeMs??null,authorityLocalTime:Number.isFinite(this.sourceGunAuthorityLocalTime)?this.sourceGunAuthorityLocalTime:null,authority:this.sourceGunAuthorityCounter?{...this.sourceGunAuthorityCounter,state:{...this.sourceGunAuthorityCounter.state}}:null,pendingShot:this.pendingSourceShot??null,awaitingInputSequence:this.sourceGunAwaitingInputSequence??null},sourceScope:this.archivalWinter?null:{...(this.originalScopeState??createOriginalScope())},sourceHurt:this.archivalWinter?null:{...(this.sourceHurt??createOriginalHurtOverlay())},map:this.archivalWinter?'winter':this.mapId,controls:this.controlsPreset,aiming:this.aiming,chatOpen:this.chatOpen,movement:{phase:this.phase,grounded:this.grounded,keys:[...this.keys],velocity:{x:this.velocity.x,y:this.velocity.y,z:this.velocity.z},pointerCaptured:document.pointerLockElement===this.renderer.domElement},pickups:this.arena.pickups.map(p=>({id:String(p.mesh.userData.pickupId??p.mesh.name),active:p.active})),connection:this.mode==='online'?(this.network?.state??'idle'):'offline',clientId:this.network?.clientId??null,room:this.network?.room??null,tick:snapshot?.tick??null,playerCount:snapshot?.players.length??0,
      originalWeapon:this.originalWeapons&&this.originalWeaponPresentation?{weapon:this.weaponState.current,displayedWeapon:this.sourceDisplayedWeapon??null,models:[...this.weaponModels].map(([weapon,model])=>({weapon,visible:model.visible})),position:this.originalWeapons.models.get(this.weaponState.current)!.position.toArray(),sourcePosition:this.originalWeaponPresentation.sourcePosition.toArray(),ticker:this.originalWeaponPresentation.ticker,rotation:[...this.originalWeapons.models.get(this.weaponState.current)!.rotation.toArray().slice(0,3)] as number[],worldFov:this.camera.fov,viewFov:this.viewCamera.fov,meshes:this.originalWeapons.models.get(this.weaponState.current)!.children.map(o=>o.name),loadedRocket:this.originalWeapons.rocket.visible,flashes:this.originalFlashes.length}:null,
      doors:this.arena.doorWorld?.getStates()??[],local:{x:this.camera.position.x,y:this.camera.position.y-PLAYER_HEIGHT,z:this.camera.position.z,yaw:this.yaw,pitch:this.pitch,alive:this.playerAlive,health:this.health},originalScene:this.arena.runtime?{triangles:this.arena.runtime.geometry.triangleCount,scale:this.arena.runtime.scale,radius:this.arena.runtime.profile.radius,bodyHeight:this.arena.runtime.profile.bodyHeight,colliding:this.playerCollides(),bounds:this.arena.runtime.profile.bounds}:null,networkProjectiles:this.networkProjectiles.size,
      sourceHealth:this.archivalWinter?null:{...this.ensureOriginalHealth()},
      authoritativeLocal:snapshot?.players.find(player=>player.id===this.network?.clientId)?.transform??null,
      originalBarrels:{snapshotBodies:structuredClone(this.originalBarrelSnapshotBodies??[]),snapshotTime:Number.isFinite(this.originalBarrelAuthorityTime)?this.originalBarrelAuthorityTime:null,bodies:this.arena.barrelWorld?.snapshots()??[],models:this.arena.barrelModelPivots?.()??[],authorityTime:Number.isFinite(this.originalBarrelAuthorityTime)?this.originalBarrelAuthorityTime:null,receivedAuthorityTime:Number.isFinite(this.originalBarrelReceivedTime)?this.originalBarrelReceivedTime:null,pendingCorrectionTime:this.pendingOriginalReconciliation?.serverTime??null,appliedPlayerTime:Number.isFinite(this.originalReconciliationEpoch)?this.originalReconciliationEpoch:null},
      originalExplosives:{projectiles:this.mode==='online'?[...this.networkProjectiles.values()].flatMap(p=>p.source?[{weapon:p.source.weapon,position:{x:p.mesh.position.x,y:p.mesh.position.y,z:p.mesh.position.z},velocity:{x:p.velocity.x,y:p.velocity.y,z:p.velocity.z},direction:{...p.source.direction},remainingCallbacks:p.source.remainingCallbacks,...(p.source.angular?{orientation:{...p.source.angular.orientation},angularVelocity:{...p.source.angular.angularVelocity}}:{})}]:[]):this.projectiles.flatMap(p=>p.source?[{weapon:p.source.weapon,position:{...p.source.position},velocity:{...p.source.velocity},direction:{...p.source.direction},remainingCallbacks:p.source.remainingCallbacks,...(p.source.angular?{orientation:{...p.source.angular.orientation},angularVelocity:{...p.source.angular.angularVelocity}}:{})}]:[]),blasts:this.mode==='online'?(this.latestNetworkSnapshot?.blasts??[]).map(b=>({position:{...b.position},remainingCallbacks:b.remainingCallbacks})):this.originalBlasts.map(b=>({position:{...b.position},remainingCallbacks:b.remainingCallbacks})),contactCount:this.originalProjectileContactCount},
      authoredHandGrenades:{remaining:this.grenades,projectiles:this.projectiles.filter(p=>!p.source&&p.grenade).slice(0,64).map(p=>({position:{x:p.mesh.position.x,y:p.mesh.position.y,z:p.mesh.position.z},velocity:{x:p.velocity.x,y:p.velocity.y,z:p.velocity.z},life:p.life}))},
      originalCombatVisuals:this.originalCombatEffectPresentation?.list().map(b=>({id:b.id,kind:b.kind,texture:b.state.texture,position:{...b.state.position},opacity:b.mesh.material.opacity,scale:b.mesh.scale.x,...('remainingCallbacks' in b.state?{remainingCallbacks:b.state.remainingCallbacks}:{}),...('myscale' in b.state?{myscale:b.state.myscale}:{}),offset:b.mesh.material.map!.offset.toArray(),size:[b.mesh.geometry.parameters.width,b.mesh.geometry.parameters.height]}))??[],
      originalExplosionVisuals:this.originalExplosionPresentation?.list().map(b=>({id:b.id,kind:b.kind,frame:b.frame,remainingCallbacks:b.remainingCallbacks,opacity:b.mesh.material.opacity,scale:b.mesh.scale.x,position:{x:b.position.x,y:b.position.y,z:b.position.z},offset:b.mesh.material.map!.offset.toArray(),size:[b.mesh.geometry.parameters.width,b.mesh.geometry.parameters.height]}))??[],
      networkEffects:{...this.networkEffectCounts},
      loadout:{equipped:this.weaponState.current,unarmed:this.weaponState.unarmed,sourceCounter:this.weaponState.originalCounterState,ammo:{...this.weaponState.ammo},reserve:{...this.weaponState.reserve},reloading:this.weaponState.reloading,reloadRemaining:this.weaponState.reloading?Math.max(0,this.weaponState.reloadEnd-this.elapsed):0,autoReloadWeapon:this.autoReloadWeapon??null,authoritativeUpdates:this.authoritativeLoadoutUpdates,lastServerTime:this.lastLoadoutServerTime??null},
      combatTransients:{damageOpacity:this.damageOpacity,recoil:this.recoil,bob:this.bob,stepDistance:this.stepDistance,viewActionPulse:this.viewActionPulse,muzzleFlashRemaining:this.muzzleFlashRemaining},
      sourceRemoteView:{enabled:this.sourceRemoteViewEpoch!=null,generation:this.sourceRemoteViewGeneration,epoch:this.sourceRemoteViewEpoch,callbacks:this.sourceRemoteViewCallbacks},
      remotes:[...this.remotePlayers.values()].map(remote=>({id:remote.id,name:remote.name,inScene:remote.group.parent===this.scene,...remote.debugState()})),
      sourceTimeoutCorpses:[...this.sourceTimeoutCorpses].map(remote=>({id:remote.id,name:remote.name,inScene:remote.group.parent===this.scene,...remote.debugState()})),
      render:{calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,points:this.renderer.info.render.points,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures},
      renderPipeline:{enhanced:this.enhancedRendering,passes:[...this.renderPipelinePasses],antialiasing:this.enhancedRendering?'smaa':'context-msaa',toneMapping:this.renderer.toneMapping,exposure:this.renderer.toneMappingExposure,outputColorSpace:this.renderer.outputColorSpace},sunShadow:this.sunShadow.getDebugState(),militaryTransport:this.archivedArena?.militaryTransport.stats,sandbagBarrier:this.archivedArena?.sandbagBarrier.stats,roadSurface:this.archivedArena?.roadSurface.stats,impactMarks:this.combatImpactMarks.getStats(),combatEffects:this.combatEffects.getStats(),blastLights:{active:this.blastLights.filter((slot)=>slot.active).length,capacity:this.blastLights.length},snowTracks:this.snowTracks.getStats(),snowField:this.archivedArena?.snowField.stats,winterGroundRelief:this.archivedArena?.winterGroundRelief?.stats??null,authoritativeColliders:this.arena.colliders.length,foliage:this.archivedArena?.foliage.stats,buildingFacade:{quality:this.archivedArena?.buildingFacade.quality,blueprint:this.archivedArena?.buildingFacade.blueprint.stats,authoritativeColliders:this.archivedArena?.buildingFacade.authoritativeColliders,presentation:this.archivedArena?.buildingFacade.presentation?.stats??null},perimeterWall:{quality:this.archivedArena?.perimeterWall.quality,blueprint:this.archivedArena?.perimeterWall.blueprint.stats,authoritativeColliders:this.archivedArena?.perimeterWall.blueprint.colliders.length,presentation:this.archivedArena?.perimeterWall.presentation?.stats??null},exteriorBackdrop:this.archivedArena?.exteriorBackdrop.stats,};
  }

  private shiftDeadlines(seconds:number):void {
    if(seconds<=0)return;this.startTime+=seconds;if(this.playerRespawnAt>0)this.playerRespawnAt+=seconds;if(this.invulnerableUntil>0)this.invulnerableUntil+=seconds;
    if(Number.isFinite(this.nextSourceReloadPoll))this.nextSourceReloadPoll+=seconds;this.weaponState.shiftSourceClock(seconds);if(this.weaponState.reloading)this.weaponState.reloadEnd+=seconds;if(Number.isFinite(this.autoReloadAt))this.autoReloadAt+=seconds;for(const pickup of this.arena.pickups)if(!pickup.active)pickup.respawnAt+=seconds;for(const drop of this.weaponDrops)if(drop.expiresAt!==null)drop.expiresAt+=seconds;
    for(const enemy of this.enemies){enemy.lastShot+=seconds;enemy.nextDecision+=seconds;if(!enemy.alive)enemy.deathTime+=seconds;if(enemy.invulnerableUntil>0)enemy.invulnerableUntil+=seconds;}
  }

  private enterImmersiveMode(): void {
    const generation=++this.immersiveCaptureGeneration;
    if(new URLSearchParams(location.search).has('e2e'))return;
    const capture = (fullscreenKeyboardLock=false): void => {
      if(generation!==this.immersiveCaptureGeneration||this.phase!=='playing'){
        if(this.newerImmersiveCaptureOwnsInput(generation))return;
        if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock();
        if(document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined);
        return;
      }
      this.immersiveCaptureOwnerGeneration=generation;
      if(document.fullscreenElement){
        if(fullscreenKeyboardLock)document.documentElement.dataset.keyboardCapture='fullscreen';
        else this.requestKeyboardCapture();
      }
      else document.documentElement.dataset.keyboardCapture='fallback';
      this.requestPointerCapture(generation);
    };
    if (!document.fullscreenElement) {
      const root=document.documentElement;
      // Chromium exposes navigator.keyboard.lock(), so prefer that established
      // API there. Other engines can implement the newer fullscreen option
      // without exposing navigator.keyboard. Select the path before requesting
      // fullscreen so an unsupported option cannot prevent capture.
      if(this.keyboardLock()){
        try { void root.requestFullscreen({navigationUI:'hide'}).then(()=>capture()).catch(()=>capture()); }
        catch { capture(); }
        return;
      }
      const options:KeyboardLockFullscreenOptions={navigationUI:'hide',keyboardLock:'browser'};
      const basicFullscreen=():void=>{
        if(generation!==this.immersiveCaptureGeneration||this.phase!=='playing')return;
        try { void root.requestFullscreen({navigationUI:'hide'}).then(()=>capture()).catch(()=>capture()); }
        catch { capture(); }
      };
      try { void root.requestFullscreen(options).then(()=>capture(true)).catch(basicFullscreen); }
      catch { basicFullscreen(); }
    } else capture();
  }
}
