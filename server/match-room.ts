import {originalProjectileModelQuaternion,raycastOriginalProjectileModel,type OriginalProjectileModelPose} from '../shared/originalProjectileRay';
import {originalServerProjectileRayGeometry} from './original-projectile-ray';
import {raycastOriginalSky} from '../shared/originalSkyRay';
import {MAX_ORIGINAL_REMOTE_SHOTS} from '../shared/originalRemoteShots';
import {originalCodename,ORIGINAL_CODENAME_REJECTION} from '../shared/originalCodename';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {createOriginalPlayerHealth,stepOriginalPlayerHealth,applyOriginalPlayerDamage,applyOriginalPlayerHealthDelta,type OriginalPlayerHealthState} from '../shared/originalPlayerHealth';
import {originalAsciiNamesEqual} from '../shared/originalNameComparison';
import {originalSpawnIndex} from '../shared/originalSpawnRules';
import {isOriginalCowardiceName} from '../shared/originalCowardice';
import {createOriginalPlayerBody,originalPlayerEye,stepOriginalPhysicsWorld,type OriginalPlayerBody,type OriginalPlayerControls,ORIGINAL_PLAYER_DERIVATIVE_FACTOR,ORIGINAL_PLAYER_DERIVATIVE_JUMP,ORIGINAL_PLAYER_DERIVATIVE_GRAVITY,ORIGINAL_PLAYER_GROUNDED_MAX_SPEED} from '../shared/originalPlayerPhysics';
import {applyOriginalPlayerMovementControls,isCopyMovementMode} from '../shared/copyPlayerControls';
import type {OriginalConvexPolytope} from '../shared/originalConvexSweep';
import {sweepOriginalConvexSphere} from '../shared/originalConvexContact';
import {originalProjectileRotationMatchesDirection} from '../shared/originalProjectileOrientation';
import {createOriginalProjectile,stepOriginalProjectileActor,createOriginalBlast,stepOriginalBlast,type OriginalProjectileState,type OriginalBlastState,ORIGINAL_COLLISION_CONTACT_DISTANCE} from '../shared/originalExplosives';
import {ORIGINAL_DROP_AMMO,ORIGINAL_KILL_SCORE,ORIGINAL_PICKUP_SCORE,originalReloadTransfer,originalPickupInReach,originalDropPosition,originalDropYaw,originalWeaponAvailable,originalFirstUsableWeapon} from '../shared/originalPickupRules';
import {OriginalSoldierCollision,advanceOriginalSoldierPhase,shootOriginalSoldierPhase} from '../shared/originalSoldierCollision';
import {originalServerSoldierAssets} from './original-soldier-collision';
import {OriginalRemoteView,type OriginalRemoteViewTarget} from '../shared/originalRemoteView';
import {isOriginalRemoteViewWireTrace} from './protocol';
import {getOriginalHitscan,originalBulletExcludesModel} from '../shared/originalHitscan';
import {OriginalWeaponCounter,originalRpgShot} from '../shared/originalWeaponCounter';
import { MAX_TRANSFORM_PATH_SAMPLES, CHAT_MAX_LENGTH, type MapId, type PickupSnapshot, type WeaponDropSnapshot } from '../shared/protocol';
import { getLegacyMap, legacyGroundHeightAt, legacySupportHeightAt } from '../shared/legacyMaps';
import { rg6JumpLaunchEligible, rg6JumpBlastEligible, rg6JumpVelocity } from '../shared/rg6Jump';
import { usesImmediateReload, weaponReloadDuration } from '../shared/legacyReload';
import { getLegacySpawnLoadout } from '../shared/legacyLoadout';
import { weaponReloadTarget } from '../shared/weaponReloadTarget';
import { raycastLegacyMap, hasLegacyLineOfSight, playerIntersectsLegacyRampSolid } from '../shared/legacyCollision';
import {
  type ClientMessage,
  type DamageSource,
  type ExplosiveWeaponId,
  type HitData,
  type HitscanShotData,
  type HitZone,
  type MatchEvent,
  type MatchSnapshot,
  type MessagePeer,
  type PlayerSnapshot,
  type PlayerTransform,
  type MovementSample,
  type ProjectileSnapshot,
  PROTOCOL_VERSION,
  type ServerMessage,
  type ShotData,
  type Vec3,
  type WeaponId,
  isExplosiveWeaponId,
  isFiniteVec3,
  isHitscanWeaponId,
  isWeaponId,
} from './protocol';
import { randomUUID } from 'node:crypto';
import {originalServerDoorTracks} from './original-scenes';
import {createOriginalDoorWorld,type OriginalDoorWorld} from '../shared/originalDoorWorld';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_SOURCE_SPAWNS,ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import { matchServerNow } from './clock';
import {
  ARENA_COLLIDERS,
  hasArenaLineOfSight,
  isInsideArenaPlayableBounds,
  raycastArena,
  type ArenaAabb,
} from '../shared/arenaCollision';

const MAX_HEALTH = 100;
const DEFAULT_FRAG_LIMIT = 12;
const DEFAULT_TICK_RATE = 20;
const RESPAWN_DELAY_MS = 1_300;
const SPAWN_PROTECTION_MS = 1_000;
const SHOT_LIFETIME_MS = 1_000;
const MAX_PENDING_SHOTS = 32;
const MAX_RECENT_SHOT_IDS = 64;
const MAX_ACTIVE_PROJECTILES_PER_PLAYER = 8;
const PROJECTILE_STEP_MS = 50;
const PROJECTILE_SPAWN_CLEARANCE = 1.2;
const BLAST_LINE_OF_SIGHT_EPSILON = 0.05;
const BLAST_FALLOFF = 0.72;
const SELF_RADIUS_SCALE = 0.85;
const SELF_DAMAGE_SCALE = 0.45;
const MAX_REWIND_MS = 300;
// Authored allowance for transforms already in transit when a boost is issued.
const BOOST_RECEIPT_WINDOW_MS = 250;
const MAX_POSITION_SAMPLES = 32;
const PLAYER_EYE_HEIGHT = 1.55;
const BODY_CENTER_Y = 0.98;
const BODY_RADIUS = 0.44;
const HEAD_CENTER_Y = 1.64;
const HEAD_RADIUS = 0.22;
const MAX_ORIGIN_ERROR = 2.75;
const WORLD_HORIZONTAL_LIMIT = 62;
const WORLD_MIN_Y = -2;
const WORLD_MAX_Y = 32;
const MAX_VELOCITY = 20;
const MAX_MOVE_SPEED = 14;
const MOVEMENT_BUDGET_CAPACITY = 3;
// Source clients can catch up one second of accumulated physics per frame.
const ORIGINAL_MOVEMENT_BUDGET_CAPACITY = MAX_MOVE_SPEED;
const PLAYER_COLLISION_RADIUS = 0.38;
const PLAYER_COLLISION_BOTTOM = 0.06;
const PLAYER_COLLISION_TOP = 1.82;
const PLAYER_STEP_HEIGHT = 0.52;
const MAX_AIRBORNE_RISE = 1.25;
const MAX_UPWARD_VELOCITY = 5.6;
const CLIENT_JUMP_VELOCITY = 5.4;
const CLIENT_GRAVITY = 12.5;
const CLIENT_SPRINT_SPEED = 7.2;
const AIRBORNE_PATH_TOLERANCE = 1;
const AIRBORNE_DIRECTION_TOLERANCE = 1e-5;
const AIRBORNE_VELOCITY_TOLERANCE = 0.35;
const SUPPORT_TOLERANCE = 0.025;
// Match the client sphere grounding hysteresis on recovered terrain.
const ORIGINAL_SUPPORT_TOLERANCE = 0.08;
const COLLISION_EPSILON = 1e-5;
const RESUME_GRACE_MS = 30_000;

interface WeaponRule {
  damage: number;
  headMultiplier: number;
  fireIntervalMs: number;
  range: number;
  magazine: number;
  reserve: number;
  reloadMs: number;
  projectile?: {
    speed: number;
    gravity: number;
    lifetimeMs: number;
    radius: number;
  };
}

const WEAPONS: Record<WeaponId, WeaponRule> = {
  pistol: { damage: 38, headMultiplier: 2.3, fireIntervalMs: 220, range: 85, magazine: 8, reserve: 64, reloadMs: 1_350 },
  shotgun: { damage: 56, headMultiplier: 1.45, fireIntervalMs: 820, range: 42, magazine: 8, reserve: 40, reloadMs: 2_100 },
  rifle: { damage: 34, headMultiplier: 2.2, fireIntervalMs: 95, range: 150, magazine: 30, reserve: 150, reloadMs: 1_750 },
  sniper: { damage: 92, headMultiplier: 1.7, fireIntervalMs: 720, range: 300, magazine: 10, reserve: 40, reloadMs: 2_250 },
  launcher: {
    damage: 105, headMultiplier: 1, fireIntervalMs: 550, range: 80,
    magazine: 6, reserve: 18, reloadMs: 2_700,
    projectile: { speed: 18, gravity: 9.81, lifetimeMs: 2_800, radius: 4.3 },
  },
  rpg: {
    damage: 150, headMultiplier: 1, fireIntervalMs: 1_100, range: 100,
    magazine: 1, reserve: 5, reloadMs: 2_800,
    projectile: { speed: 31, gravity: 0, lifetimeMs: 3_500, radius: 5.5 },
  },
};

const WEAPON_IDS = Object.freeze(Object.keys(WEAPONS) as WeaponId[]);

const DEFAULT_SPAWNS: readonly Vec3[] = [
  { x: -43, y: 0, z: -36 }, { x: 42, y: 0, z: 38 }, { x: 38, y: 0, z: -12 },
  { x: -38, y: 0, z: 12 }, { x: 5, y: 0, z: 30 }, { x: 12, y: 0, z: -40 },
  { x: -8, y: 0, z: 22 }, { x: 32, y: 0, z: 4 }, { x: -31, y: 0, z: -2 },
  { x: -50, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, { x: 0, y: 0, z: -50 },
  { x: 0, y: 0, z: 50 }, { x: -48, y: 0, z: 30 }, { x: 48, y: 0, z: -30 },
  { x: 25, y: 0, z: 48 },
];

interface RegisteredShot {
  shot: HitscanShotData;
  direction: Vec3;
  registeredAt: number;
  targetPaths: Map<string, readonly Vec3[]>;
  targetPoses:Map<string,readonly SourcePose[]>;
  // Detached viewer corpses block rays but are never damage recipients.
  sourceOccluderPoses:readonly SourcePose[];
  sourceProjectileOccluders:readonly OriginalProjectileModelPose[];
  sourceRay?: (origin:Vec3,direction:Vec3,max:number,options:Parameters<typeof raycastArena>[3])=>ReturnType<typeof raycastArena>;
  protectedTargetIds: Set<string>;
  consumed: boolean;
}

interface SourceExplosiveReceipts {
  /** Room-life identities, never names or client supplied receipt claims. */
  sourceReceivers?:Set<RoomPlayer>;
  sourceBirthSequence?:number;
  readonly sourceLaunchName?:string;
}
interface ActiveSourceBlast extends SourceExplosiveReceipts { snapshot: {projectileId:string;shotId:string;attackerId:string;attackerName?:string;weapon:ExplosiveWeaponId;position:Vec3;remainingCallbacks:number;expiresAt:number}; state:OriginalBlastState; updatedAt:number; }

interface ActiveProjectile extends SourceExplosiveReceipts {
  source?:OriginalProjectileState;
  snapshot: ProjectileSnapshot;
  updatedAt: number;
  gravity: number;
  radius: number;
  damage: number;
  rg6JumpEligible: boolean;
}

interface AuthorizedBoost {
  originY: number;
  velocityY: number;
  issuedAt: number;
  budgetUpdatedAt: number;
  verticalBudget: number;
  ascentObserved: boolean;
  contactVelocity?:Vec3;
}

interface SourcePose {receivedAt:number;position:Vec3;yaw:number;motionTime:number;deathBon?:number;}

interface PositionSample {
  receivedAt: number;
  position: Vec3;
}

interface AirborneMovementState {
  originY: number;
  positiveRise: number;
  horizontalDistance: number;
  descending: boolean;
}

interface SourceObserverWorld {
  readonly lifeGeneration:number;
  doorEpoch:number;
  body:OriginalPlayerBody; barrels:OriginalBarrelWorld; doors?:OriginalDoorWorld;
  projectiles:Map<string,ActiveProjectile>; blasts:Map<string,ActiveSourceBlast>; updatedAt:number;
}

interface RoomPlayer {
  sourceWorld:SourceObserverWorld|null;
  sourceActorNames:Map<string,string>;
  id: string;
  name: string;
  peer: MessagePeer | null;
  resumeToken: string;
  resumeExpiresAt: number | null;
  health: number;
  sourceHealth: OriginalPlayerHealthState|null;
  sourceMotionTime:number;
  sourcePendingShots:number;
  sourceMotionPosition:Vec3;
  sourcePoseHistory:SourcePose[];
  sourceRemoteView:OriginalRemoteView|null;
  sourceTimeoutDrops:Map<string,WeaponDropSnapshot>;
  sourceLegacyViewTargets:Map<string,OriginalRemoteViewTarget>;
  sourceViewGeneration:number;
  sourceViewTick:number;
  sourceViewLastValidation:Record<string,number>|null;
  sourceExplosiveCutoff:number;
  armor: number;
  chatTimes: number[];
  frags: number;
  score: number;
  deaths: number;
  alive: boolean;
  respawnAt: number | null;
  protectedUntil: number;
  transform: PlayerTransform;
  transformSequence: number;
  lastTransformAt: number;
  movementBudget: number;
  movementBudgetUpdatedAt: number;
  authorizedBoost: AuthorizedBoost | null;
  airborneOriginY: number | null;
  airbornePositiveRise: number;
  airborneHorizontalDistance: number;
  airborneDescending: boolean;
  positionHistory: PositionSample[];
  lastShotAt: number;
  ammo: Record<WeaponId, number>;
  reserve: Record<WeaponId, number>;
  reloadWeapon: WeaponId | null;
  sourceBody:OriginalPlayerBody|null;
  sourceInput:OriginalPlayerControls|null;
  sourceUnarmed: boolean;
  sourceDisplayedWeapon: WeaponId|null;
  sourceCounter:OriginalWeaponCounter|null;
  sourceCounterUpdatedAt:number;
  sourceCounterReady:boolean;
  sourceCounterWeapon:WeaponId|null;
  sourceAutoReloadTime:number|null;
  reloadCompleteAt: number | null;
  pendingShots: Map<string, RegisteredShot>;
  recentShotIds: Map<string, number>;
}

export interface MatchRoomOptions {
  /** Legacy death ends the player's session. Round rules are an authored opt-in. */
  sessionMode?: 'single-life' | 'round';
  map?: MapId;
  /** Explicit authored geometry opt-in for isolated mechanics fixtures. */
  originalScene?: boolean;
  /** Explicit archival collision profile for pre-legacy-map tests. */
  collisionProfile?: 'winter';
  fragLimit?: number;
  tickRate?: number;
  maxPlayers?: number;
  spawnPoints?: readonly Vec3[];
  idFactory?: () => string;
  resumeTokenFactory?: () => string;
  now?: () => number;
  /** Opt-in local diagnostics; no protocol changes or resume credentials. */
  sourceViewDiagnostics?: (entry:Record<string,unknown>)=>void;
  diagnosticNow?:()=>number;
}

export interface JoinResult {
  ok: true;
  player: PlayerSnapshot;
}

export interface JoinFailure {
  ok: false;
  code: string;
  message: string;
}

export type JoinOutcome = JoinResult | JoinFailure;

interface RayHit {
  distance: number;
  zone: HitZone;
}

function cloneVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneTransform(value: PlayerTransform): PlayerTransform {
  return {
    position: cloneVec3(value.position),
    velocity: cloneVec3(value.velocity),
    yaw: value.yaw,
    pitch: value.pitch,
    grounded: value.grounded,
    weapon: value.weapon,
    ...(value.typing===undefined?{}:{typing:value.typing}),
    ...(value.sourceInput===undefined?{}:{sourceInput:{...value.sourceInput}}),
    ...(value.movementMode===undefined?{}:{movementMode:value.movementMode}),
  };
}

function distanceSquared(a: Vec3, b: Vec3): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}

function length(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: Vec3): Vec3 {
  const magnitude = length(value);
  return { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function intersectSphere(origin: Vec3, direction: Vec3, center: Vec3, radius: number): number | null {
  const offset = { x: origin.x - center.x, y: origin.y - center.y, z: origin.z - center.z };
  const b = offset.x * direction.x + offset.y * direction.y + offset.z * direction.z;
  const c = offset.x * offset.x + offset.y * offset.y + offset.z * offset.z - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = -b - root;
  if (near >= 0) return near;
  const far = -b + root;
  return far >= 0 ? far : null;
}

/** Returns the nearest ray intersection with the volume swept by a sphere along a segment. */
function intersectCapsule(origin: Vec3, direction: Vec3, start: Vec3, end: Vec3, radius: number): number | null {
  const axis = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const axisLengthSquared = dot(axis, axis);
  if (axisLengthSquared < 1e-8) return intersectSphere(origin, direction, start, radius);

  const offset = { x: origin.x - start.x, y: origin.y - start.y, z: origin.z - start.z };
  const axisAlongRay = dot(axis, direction);
  const axisAlongOffset = dot(axis, offset);
  const rayAlongOffset = dot(direction, offset);
  const offsetLengthSquared = dot(offset, offset);
  const a = axisLengthSquared - axisAlongRay * axisAlongRay;
  const b = axisLengthSquared * rayAlongOffset - axisAlongOffset * axisAlongRay;
  const c = axisLengthSquared * offsetLengthSquared - axisAlongOffset * axisAlongOffset
    - radius * radius * axisLengthSquared;

  let nearest: number | null = null;
  if (Math.abs(a) > 1e-8) {
    const discriminant = b * b - a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const near = (-b - root) / a;
      const far = (-b + root) / a;
      for (const distance of [near, far]) {
        const axisDistance = axisAlongOffset + distance * axisAlongRay;
        if (distance >= 0 && axisDistance > 0 && axisDistance < axisLengthSquared
          && (nearest === null || distance < nearest)) nearest = distance;
      }
    }
  }

  const startDistance = intersectSphere(origin, direction, start, radius);
  const endDistance = intersectSphere(origin, direction, end, radius);
  for (const distance of [startDistance, endDistance]) {
    if (distance !== null && (nearest === null || distance < nearest)) nearest = distance;
  }
  return nearest;
}

function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return name.length > 0 ? name : null;
}

function defaultIdFactory(): string {
  return globalThis.crypto?.randomUUID?.() ?? `player-${Math.random().toString(36).slice(2, 12)}`;
}

function initialTransform(position: Vec3, map?: MapId): PlayerTransform {
  return {
    position: cloneVec3(position),
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    grounded: true,
    weapon: getLegacySpawnLoadout(map)?.equipped ?? 'rifle',
  };
}

function defaultResumeTokenFactory(): string {
  return randomUUID();
}

function initialAmmo(map?: MapId): Record<WeaponId, number> {
  const legacy=getLegacySpawnLoadout(map);
  if(legacy)return {...legacy.ammo};
  return Object.fromEntries(WEAPON_IDS.map((weapon) => [weapon, WEAPONS[weapon].magazine])) as Record<WeaponId, number>;
}

function initialReserve(map?: MapId): Record<WeaponId, number> {
  const legacy=getLegacySpawnLoadout(map);
  if(legacy)return {...legacy.reserve};
  return Object.fromEntries(WEAPON_IDS.map((weapon) => [weapon, WEAPONS[weapon].reserve])) as Record<WeaponId, number>;
}

function playerVolumeIntersectsCollider(position: Vec3, collider: ArenaAabb): boolean {
  return position.x + PLAYER_COLLISION_RADIUS > collider.min[0] + COLLISION_EPSILON
    && position.x - PLAYER_COLLISION_RADIUS < collider.max[0] - COLLISION_EPSILON
    && position.y + PLAYER_COLLISION_TOP > collider.min[1] + COLLISION_EPSILON
    && position.y + PLAYER_COLLISION_BOTTOM < collider.max[1] - COLLISION_EPSILON
    && position.z + PLAYER_COLLISION_RADIUS > collider.min[2] + COLLISION_EPSILON
    && position.z - PLAYER_COLLISION_RADIUS < collider.max[2] - COLLISION_EPSILON;
}

function segmentIntersectsOpenBox(start: Vec3, end: Vec3, min: Vec3, max: Vec3): boolean {
  let near = 0;
  let far = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const origin = start[axis];
    const delta = end[axis] - origin;
    if (Math.abs(delta) <= COLLISION_EPSILON) {
      if (origin <= min[axis] + COLLISION_EPSILON || origin >= max[axis] - COLLISION_EPSILON) return false;
      continue;
    }
    let entry = (min[axis] - origin) / delta;
    let exit = (max[axis] - origin) / delta;
    if (entry > exit) [entry, exit] = [exit, entry];
    near = Math.max(near, entry);
    far = Math.min(far, exit);
    if (near >= far - COLLISION_EPSILON) return false;
  }
  return far > COLLISION_EPSILON && near < 1 - COLLISION_EPSILON;
}

function sweptPlayerIntersectsCollider(start: Vec3, end: Vec3, collider: ArenaAabb): boolean {
  return segmentIntersectsOpenBox(start, end, {
    x: collider.min[0] - PLAYER_COLLISION_RADIUS,
    y: collider.min[1] - PLAYER_COLLISION_TOP,
    z: collider.min[2] - PLAYER_COLLISION_RADIUS,
  }, {
    x: collider.max[0] + PLAYER_COLLISION_RADIUS,
    y: collider.max[1] - PLAYER_COLLISION_BOTTOM,
    z: collider.max[2] + PLAYER_COLLISION_RADIUS,
  });
}

function isStepTraversal(start: Vec3, end: Vec3, collider: ArenaAabb, grounded: boolean): boolean {
  const top = collider.max[1];
  return grounded
    && end.y >= start.y - COLLISION_EPSILON
    && top > start.y + 0.02
    && top <= start.y + PLAYER_STEP_HEIGHT + 0.02
    && Math.abs(end.y - top) <= 0.08;
}

/**
 * Authoritative, transport-independent free-for-all room.
 * Call tick() at tickRate; peers receive plain protocol objects and own serialization.
 */
export class MatchRoom {
  readonly id: string;
  readonly map: MapId;
  private readonly winter: boolean;
  private readonly original:ReturnType<typeof getOriginalMapRuntime>|undefined;
  private readonly customSpawns:boolean;
  private doorWorld:OriginalDoorWorld|undefined;
  private get originalGeometry(){return this.doorWorld?.geometry??this.original?.geometry;}

  private readonly colliders: readonly ArenaAabb[];
  private readonly pickups = new Map<string, PickupSnapshot>();
  private readonly drops = new Map<string, WeaponDropSnapshot>();
  private dropSequence = 0;
  readonly fragLimit: number;
  readonly tickRate: number;
  readonly maxPlayers: number;
  readonly sessionMode: 'single-life' | 'round';

  private readonly players = new Map<string, RoomPlayer>();
  private readonly projectiles = new Map<string, ActiveProjectile>();
  private readonly sourceBlasts=new Map<string,ActiveSourceBlast>();
  private readonly spawns: readonly Vec3[];
  private readonly idFactory: () => string;
  private readonly resumeTokenFactory: () => string;
  private readonly clock: () => number;
  private tickNumber = 0;
  private sourceViewGeneration = 0;
  private sourceLifeGeneration = 0;
  private readonly sourceViewDiagnostics:MatchRoomOptions['sourceViewDiagnostics'];
  private readonly diagnosticNow:()=>number;
  private sourceWorldDiagnosticCallbacks=0;
  private lastSourceWorldWork:Record<string,unknown>|null=null;
  private state: 'playing' | 'finished' = 'playing';
  private winnerId: string | null = null;
  private projectileSequence = 0;
  private sourceWorldUpdatedAt:number|null=null;
  private sourceHealthUpdatedAt:number|null=null;
  private sourceSoldierCollision:OriginalSoldierCollision|null=null;
  private readonly barrelWorld:OriginalBarrelWorld|null;
  private readonly sourceLegacyContactBodies=new Map<string,OriginalPlayerBody>();

  constructor(id: string, options: MatchRoomOptions = {}) {
    this.id = id;
    this.map = options.map ?? 'barrack';
    this.winter = options.collisionProfile === 'winter';
    this.customSpawns=Boolean(options.spawnPoints?.length);
    this.original=!this.winter&&options.originalScene!==false ? getOriginalMapRuntime(this.map) : undefined;
    if(!this.winter&&options.originalScene!==false&&!this.original)throw new Error(`Missing original map runtime: ${this.map}`);
    this.barrelWorld=this.original?new OriginalBarrelWorld(this.original):null;
    if(this.original&&this.map==='barrack')this.doorWorld=createOriginalDoorWorld(this.original.data,this.original.scale,originalServerDoorTracks);
    this.sessionMode=options.sessionMode ?? (this.winter ? 'round' : 'single-life');
    this.colliders = this.original ? [] : this.winter ? ARENA_COLLIDERS : getLegacyMap(this.map).colliders;
    if (!this.winter&&!this.original) for (const p of getLegacyMap(this.map).pickups) this.pickups.set(p.id, {id:p.id,type:p.type,position:{x:p.position[0],y:p.position[1],z:p.position[2]},active:true,respawnAt:null});
    this.fragLimit = Math.max(1, Math.floor(options.fragLimit ?? DEFAULT_FRAG_LIMIT));
    this.tickRate = Math.max(1, Math.floor(options.tickRate ?? DEFAULT_TICK_RATE));
    this.maxPlayers = Math.max(1, Math.floor(options.maxPlayers ?? (this.winter ? 16 : 8)));
    this.spawns = options.spawnPoints?.length ? options.spawnPoints.map(cloneVec3) : this.original ? this.original.spawnPoints.map(cloneVec3) : this.winter ? DEFAULT_SPAWNS.map(cloneVec3) : getLegacyMap(this.map).spawnPoints.map(([x,y,z]) => ({x,y,z}));
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.resumeTokenFactory = options.resumeTokenFactory ?? defaultResumeTokenFactory;
    this.clock = options.now ?? matchServerNow;
    this.sourceViewDiagnostics=options.sourceViewDiagnostics;
    this.diagnosticNow=options.diagnosticNow??(()=>performance.now());
  }

  get connectedSize(): number { return [...this.players.values()].filter(p => p.peer !== null).length; }

  get size(): number {
    return this.players.size;
  }

  get finished(): boolean {
    return this.state === 'finished';
  }

  has(playerId: string): boolean {
    return this.players.has(playerId);
  }

  join(peer: MessagePeer, requestedName: unknown, now = this.clock(), resumeToken?: unknown, sourceRemoteView = false): JoinOutcome {
    if(this.state==='playing')this.updateSourceWorld(now);
    this.updateDoors(now);
    this.expireSuspendedPlayers(now);
    if (resumeToken !== undefined) {
      if (typeof resumeToken !== 'string' || resumeToken.length < 1 || resumeToken.length > 128) {
        return { ok: false, code: 'invalid_resume_token', message: 'Reconnect token must contain 1-128 characters.' };
      }
      const retained = [...this.players.values()].find((player) => player.resumeToken === resumeToken);
      if (!retained || (retained.resumeExpiresAt !== null && now >= retained.resumeExpiresAt)) {
        if (retained){this.clearSourceExplosiveReceipts(retained);this.players.delete(retained.id);this.sourceLegacyContactBodies.delete(retained.id);}
        return { ok: false, code: 'resume_expired', message: 'Your reconnect session has expired. Join the room again.' };
      }
      const wasSuspended = retained.peer === null;
      retained.peer = peer;
      if(retained.sourceWorld)retained.sourceWorld.updatedAt=now;
      retained.resumeExpiresAt = null;
      this.finishReload(retained, now);
      retained.resumeToken = this.createResumeToken(retained.resumeToken);
      this.resetSourceView(retained,now,sourceRemoteView);
      const snapshot = this.playerSnapshot(retained);
      this.sendWelcome(retained, snapshot, now);
      this.sendLoadout(retained, now);
      if (wasSuspended) this.broadcastEvent({ type: 'join', serverTime: now, data: { player: snapshot } });
      return { ok: true, player: snapshot };
    }
    if (this.state === 'finished') {
      return { ok: false, code: 'match_finished', message: 'This match has already finished.' };
    }
    if (this.players.size >= this.maxPlayers) {
      return { ok: false, code: 'room_full', message: 'This room is full.' };
    }
    const sourceName=this.original&&typeof requestedName==='string'?originalCodename(requestedName):requestedName;
    const name = sanitizeName(sourceName);
    if (!name) return { ok: false, code: 'invalid_name', message: this.original?ORIGINAL_CODENAME_REJECTION:'Choose a name between 1 and 20 characters.' };

    let id = this.idFactory();
    while (this.players.has(id)) id = this.idFactory();
    const playerResumeToken = this.createResumeToken();
    const position = this.chooseSpawn();
    if(this.original&&this.sourceHealthUpdatedAt===null)this.sourceHealthUpdatedAt=now;
    const player: RoomPlayer = {
      id,
      name,
      peer,
      resumeToken: playerResumeToken,
      resumeExpiresAt: null,
      health: MAX_HEALTH,
      sourceHealth:this.original?createOriginalPlayerHealth():null,
      sourceMotionTime:0,sourcePendingShots:0,
      sourceMotionPosition:cloneVec3(position),
      sourcePoseHistory:[],
      sourceWorld:null,sourceActorNames:new Map(),sourceRemoteView:null,sourceTimeoutDrops:new Map(),sourceLegacyViewTargets:new Map(),sourceViewGeneration:0,sourceViewTick:0,sourceViewLastValidation:null,
      sourceExplosiveCutoff:0,
      armor: 0,
      chatTimes: [],
      frags: 0,
      score: 0,
      deaths: 0,
      alive: true,
      respawnAt: null,
      protectedUntil: this.original?now:now + SPAWN_PROTECTION_MS,
      transform: this.initialTransform(position),
      transformSequence: -1,
      lastTransformAt: now,
      movementBudget: MOVEMENT_BUDGET_CAPACITY,
      movementBudgetUpdatedAt: now,
      authorizedBoost: null,
      airborneOriginY: null,
      airbornePositiveRise: 0,
      airborneHorizontalDistance: 0,
      airborneDescending: false,
      positionHistory: [{ receivedAt: now, position: cloneVec3(position) }],
      lastShotAt: -Infinity,
      ammo: initialAmmo(this.winter ? undefined : this.map),
      reserve: initialReserve(this.winter ? undefined : this.map),
      reloadWeapon: null,
      sourceBody:null,
      sourceInput:null,
      sourceUnarmed: false,
      sourceDisplayedWeapon: this.original?'launcher':null,
      sourceCounter:this.original?new OriginalWeaponCounter(this.map):null,
      sourceCounterUpdatedAt:now,
      sourceCounterReady:false,
      sourceCounterWeapon:null,
      sourceAutoReloadTime:null,
      reloadCompleteAt: null,
      pendingShots: new Map(),
      recentShotIds: new Map(),
    };
    this.players.set(id, player);
    this.resetSourceView(player,now,sourceRemoteView);

    const snapshot = this.playerSnapshot(player);
    this.sendWelcome(player, snapshot, now);
    this.sendLoadout(player, now);
    this.broadcastEvent({ type: 'join', serverTime: now, data: { player: snapshot } });
    return { ok: true, player: snapshot };
  }

  leave(playerId: string, now = this.clock(), peer?: MessagePeer): boolean {
    const player = this.players.get(playerId);
    if (!player || (peer !== undefined && player.peer !== peer)) return false;
    this.clearSourceExplosiveReceipts(player);
    this.players.delete(playerId);
    this.sourceLegacyContactBodies.delete(playerId);
    this.removeOwnedProjectiles(playerId);
    this.broadcastEvent({ type: 'leave', serverTime: now, data: { playerId, name: player.name } });
    return true;
  }

  suspend(playerId: string, now = this.clock(), peer?: MessagePeer): boolean {
    const player = this.players.get(playerId);
    if (!player || player.peer === null || (peer !== undefined && player.peer !== peer)) return false;
    this.updateSourceWorld(now);
    return this.suspendPlayer(player,now);
  }

  private suspendPlayer(player:RoomPlayer,now:number):boolean {
    this.sourceLegacyContactBodies.delete(player.id);
    player.peer = null;
    player.sourceRemoteView=null;player.sourcePendingShots=0;
    if(player.sourceInput){
      player.sourceInput={forward:false,backward:false,left:false,right:false,jump:false,typing:false,yaw:player.transform.yaw,pitch:player.transform.pitch};
      player.transform.sourceInput={forward:false,backward:false,left:false,right:false,jump:false};
      player.transform.typing=false;
    }
    player.resumeExpiresAt = now + RESUME_GRACE_MS;
    player.pendingShots.clear();
    if(player.authorizedBoost) {
      // Reconnect resumes a fall, not a reusable upward authorization.
      player.transform.velocity.y=Math.min(0,player.transform.velocity.y);
      player.airborneOriginY=player.transform.position.y;
      player.airbornePositiveRise=0;
      player.airborneHorizontalDistance=0;
      player.airborneDescending=true;
    }
    player.authorizedBoost = null;
    if(player.sourceBody)player.sourceBody.velocity.y=player.transform.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR;
    if(!this.hasSourceAuthority())this.sourceWorldUpdatedAt=null;
    this.removeOwnedProjectiles(player.id);
    this.broadcastEvent({ type: 'leave', serverTime: now, data: { playerId:player.id, name: player.name } });
    return true;
  }

  handleMessage(playerId: string, message: ClientMessage, now = this.clock(), peer?: MessagePeer): void {
    const player = this.players.get(playerId);
    if (!player || player.peer === null || (peer !== undefined && player.peer !== peer)) return;
    if(player.sourceRemoteView&&(message.type==='transform'||message.type==='shoot'||message.type==='source_escape')){
      const rejection=this.sourceViewRejection(player,message.sourceRemoteView,now);
      if(rejection!==null){
        try{
          // The client closes this socket when it receives the resync error.
          // A rejected shot must be acknowledged before that error arrives.
          if(message.type==='shoot')this.sendLoadout(player,now,typeof message.shot?.shotId==='string'&&message.shot.shotId.length>=1&&message.shot.shotId.length<=64?message.shot.shotId:undefined);
          this.error(player,'invalid_source_view',rejection);
        }finally{
          // Queued packets cannot operate on an invalid presentation generation.
          this.suspendPlayer(player,now);
        }
        return;
      }
    }
    // Combat and collection rays use the visible panel pose at receipt time,
    // even when no physics tick or movement packet occurs between shots.
    if(this.state==='playing')this.updateSourceWorld(now);
    if(player.sourceWorld)this.advanceSourceDoors(player.sourceWorld,now);
    const reloadFinished = this.finishReload(player, now);
    switch (message.type) {
      case 'source_escape':
        this.handleSourceEscape(player, message, now);
        break;
      case 'chat':
        this.handleChat(player, message.text, now);
        if (reloadFinished) this.sendLoadout(player, now);
        break;
      case 'collect':
        this.handleCollect(player, message.itemId, now);
        if (reloadFinished) this.sendLoadout(player, now);
        break;
      case 'transform': {
        const equippedChanged = this.handleTransform(player, message, now);
        if(this.sourceViewDiagnostics&&this.original&&equippedChanged)this.diagnostic({kind:'source-gun-transform',playerId:player.id,receivedAt:now,sequence:message.sequence,typing:player.transform.typing,weapon:player.transform.weapon,counterEpoch:player.sourceCounterUpdatedAt,counter:player.sourceCounter?.state,ready:player.sourceCounterReady,counterWeapon:player.sourceCounterWeapon});
        if (reloadFinished || equippedChanged) this.sendLoadout(player, now);
        break;
      }
      case 'shoot':
        if(this.sourceViewDiagnostics&&this.original)this.diagnostic({kind:'source-gun-admission',playerId:player.id,receivedAt:now,shotId:message.shot?.shotId,shotWeapon:message.shot?.weapon,typing:player.transform.typing,weapon:player.transform.weapon,counterEpoch:player.sourceCounterUpdatedAt,counter:player.sourceCounter?.state,ready:player.sourceCounterReady,counterWeapon:player.sourceCounterWeapon});
        this.handleShoot(player, message.shot, now);
        this.sendLoadout(player, now,typeof message.shot?.shotId==='string'&&message.shot.shotId.length>=1&&message.shot.shotId.length<=64?message.shot.shotId:undefined);
        break;
      case 'hit':
        this.handleHit(player, message.hit, now);
        if (reloadFinished) this.sendLoadout(player, now);
        break;
      case 'reload':
        this.handleReload(player, message.weapon, now, message.sourceSortAfterReload);
        this.sendLoadout(player, now);
        break;
      case 'ping':
        if (Number.isFinite(message.clientTime)) player.peer.send({ type: 'pong', clientTime: message.clientTime, serverTime: now });
        if (reloadFinished) this.sendLoadout(player, now);
        break;
      case 'leave':
        this.leave(playerId, now, peer);
        break;
      case 'join':
        this.error(player, 'already_joined', 'Leave the current room before joining another one.');
        if (reloadFinished) this.sendLoadout(player, now);
        break;
    }
  }

  tick(now = this.clock()): MatchSnapshot {
    if(this.state==='playing')this.updateSourceWorld(now);
    this.updateDoors(now);
    this.expireSuspendedPlayers(now);
    for (const p of this.pickups.values()) if (!p.active && p.respawnAt !== null && now >= p.respawnAt) { p.active = true; p.respawnAt = null; }
    for (const [id,drop] of this.drops) if (drop.expiresAt!==null&&now >= drop.expiresAt) this.drops.delete(id);
    if (this.state === 'playing') {
      this.updateSourceWorld(now);
      this.updateProjectiles(now);
      if(this.state==='playing'&&!this.original)this.updateSourceBlasts(now);
      if (this.state === 'playing') {
        for (const player of this.players.values()) {
          if (this.finishReload(player, now)) this.sendLoadout(player, now);
          this.expireShots(player, now);
          this.expireRecentShotIds(player, now);
          if (player.peer !== null && !player.alive && player.respawnAt !== null && now >= player.respawnAt) {
            this.respawn(player, now);
          }
        }
      }
    }
    this.tickNumber++;
    const snapshot = this.getSnapshot(now);
    if(this.original){
      // Capture one trusted publication batch for every recipient. Inspector
      // and welcome getSnapshot reads never drain or repeat pending reports.
      snapshot.players=snapshot.players.map(target=>{
        const actor=this.players.get(target.id)!;
        const count=actor.sourcePendingShots;actor.sourcePendingShots=0;
        return target.alive&&count>0?{...target,sourceShots:count}:target;
      });
    }
    this.broadcast({ type: 'snapshot', snapshot });
    return snapshot;
  }

  /** Diagnostic room inspection projects the first living observer world.
   * Source publication and authority queries must select a viewer explicitly;
   * this projection never advances or supplies a shared physical trajectory. */
  getSnapshot(now = this.clock()): MatchSnapshot {
    const diagnostic=this.original?[...this.players.values()].find(p=>p.alive&&p.peer!==null&&p.sourceWorld)?.sourceWorld:null;
    return {
      room: this.id,
      map: this.map,
      tick: this.tickNumber,
      serverTime: now,
      ...(diagnostic?{sourcePhysicsTime:diagnostic.updatedAt}:this.hasSourceAuthority()&&this.sourceWorldUpdatedAt!==null?{sourcePhysicsTime:this.sourceWorldUpdatedAt}:{}),
      ...(this.original&&this.sourceHealthUpdatedAt!==null?{sourceHealthTime:this.sourceHealthUpdatedAt}:{}),
      fragLimit: this.fragLimit,
      state: this.state,
      winnerId: this.winnerId,
      players: [...this.players.values()]
        .filter((player) => player.peer !== null)
        .map((player) => this.playerSnapshot(player)),
      pickups: [...this.pickups.values()].map(p => ({...p,position:cloneVec3(p.position)})),
      drops: [...this.drops.values()].map(p => ({...p,position:cloneVec3(p.position)})),
      ...(this.original?{doors:(diagnostic?.doors??this.doorWorld)?.getStates().map(d=>({name:d.name,openedAt:d.openedAt===null?null:d.openedAt*1000}))??[]}:{}),
      projectiles: this.original?(diagnostic?[...diagnostic.projectiles.values()].map(p=>this.sourceSnapshotAt(p,diagnostic.updatedAt)):[]):[...this.projectiles.values()].map((projectile) => this.cloneProjectile(projectile.snapshot)),
      ...(this.barrelWorld?{barrels:(diagnostic?.barrels??this.barrelWorld).snapshots()}:{}),
      ...(this.original?{blasts:diagnostic?[...diagnostic.blasts.values()].map(b=>({...b.snapshot,position:cloneVec3(b.snapshot.position),expiresAt:diagnostic.updatedAt+b.state.remainingCallbacks*1000/30})):[]}:{}),
    };
  }

  private ensureSourceWorld(player:RoomPlayer,now:number):SourceObserverWorld {
    if(!player.sourceWorld){
      if(!Number.isSafeInteger(this.sourceLifeGeneration+1))throw Error('Source life generation exhausted');
      player.sourceWorld={lifeGeneration:++this.sourceLifeGeneration,doorEpoch:this.doorWorld?.updatedAtSeconds??0,body:player.sourceBody??this.createSourceLegacyContactBody(player),barrels:this.barrelWorld!.fork(),
        ...(this.doorWorld?{doors:this.doorWorld.fork()}:{}),
        projectiles:new Map(),blasts:new Map(),updatedAt:now};
    }
    return player.sourceWorld;
  }
  /** The declared authority adapter merges receipt wall time and callback
   * time monotonically. Tiny callback-grid rounding overshoots and later
   * fractional receipts cannot reverse a private door facade. */
  private advanceSourceDoors(world:SourceObserverWorld,now:number):number {
    world.doorEpoch=Math.max(world.doorEpoch,now/1000,world.doors?.updatedAtSeconds??0);
    world.doors?.update(world.doorEpoch);
    return world.doorEpoch;
  }
  private geometryFor(player?:RoomPlayer){return player?.sourceWorld?.doors?.geometry??this.originalGeometry;}
  getSnapshotFor(viewer:RoomPlayer|string,now=this.clock()):MatchSnapshot {
    const player=typeof viewer==='string'?this.players.get(viewer):viewer;
    const snapshot=this.getSnapshot(now);
    if(!this.original||!player)return snapshot;
    if(!player.alive)return {...snapshot,projectiles:[],blasts:[],barrels:[],doors:[],sourcePhysicsTime:now};
    const world=this.ensureSourceWorld(player,now);
    return {...snapshot,sourcePhysicsTime:world.updatedAt,barrels:world.barrels.snapshots(),
      doors:world.doors?.getStates().map(d=>({name:d.name,openedAt:d.openedAt===null?null:d.openedAt*1000}))??[],
      projectiles:[...world.projectiles.values()].map(p=>this.sourceSnapshotAt(p,world.updatedAt)),
      blasts:[...world.blasts.values()].map(b=>({...b.snapshot,position:{...b.snapshot.position},expiresAt:world.updatedAt+b.state.remainingCallbacks*1000/30}))};
  }
  private sourceSnapshotAt(actor:ActiveProjectile,time:number):ProjectileSnapshot {
    const snapshot=this.cloneProjectile(actor.snapshot);
    if(actor.source)snapshot.expiresAt=time+Math.max(0,actor.source.remainingCallbacks-(actor.source.weapon==='launcher'?1:0))*1000/30;
    return snapshot;
  }
  private cloneSourceActor(actor:ActiveProjectile):ActiveProjectile {
    return {...actor,snapshot:this.cloneProjectile(actor.snapshot),source:structuredClone(actor.source),sourceReceivers:undefined};
  }
  /** Explicit test adapter for detached historical actor checkpoints. Never
   * called by admission, snapshots, or callback stepping in production. */
  installSourceFixtureActor(actor:ActiveProjectile,viewers?:readonly string[]):void {
    if(!this.original||!actor.source)throw Error('Source fixture requires source state');
    this.projectiles.set(actor.snapshot.projectileId,actor);
    const targets=viewers?viewers.map(id=>this.players.get(id)).filter((p):p is RoomPlayer=>p!==undefined):[...this.sourceExplosiveReceivers(actor)];
    actor.sourceReceivers=new Set(targets);
    for(const player of targets)this.ensureSourceWorld(player,actor.updatedAt).projectiles.set(actor.snapshot.projectileId,this.cloneSourceActor(actor));
  }
  private restoreSourceActor(player:RoomPlayer,actor:ActiveProjectile,now:number):void {
    const world=this.ensureSourceWorld(player,now),id=actor.snapshot.projectileId;
    if(world.projectiles.has(id)||world.blasts.has(id))return;
    // Named restoration adapter: one surviving recipient checkpoint, copied once.
    for(const other of actor.sourceReceivers??[]){
      const blast=other.sourceWorld?.blasts.get(id);
      if(blast){world.blasts.set(id,{...blast,snapshot:{...blast.snapshot,position:{...blast.snapshot.position}},state:structuredClone(blast.state),updatedAt:now,sourceReceivers:undefined});return;}
      const projectile=other.sourceWorld?.projectiles.get(id);
      if(projectile){const copy=this.cloneSourceActor(projectile);copy.updatedAt=now;world.projectiles.set(id,copy);return;}
    }
  }
  private groundHeight(x: number,z: number,player?:RoomPlayer): number { return this.original ? this.geometryFor(player)!.supportHeightAt(x,z,Infinity,true)??-Infinity : this.winter ? 0 : legacyGroundHeightAt(this.map,x,z); }
  private initialTransform(position:Vec3):PlayerTransform {
    const transform=initialTransform(position,this.winter?undefined:this.map);
    if(this.original&&!this.customSpawns){
      const index=this.original.spawnPoints.findIndex(p=>p.x===position.x&&p.y===position.y&&p.z===position.z);
      if(index<0)throw new Error('Original spawn has no source orientation.');
      const rotation=ORIGINAL_SOURCE_SPAWNS[this.map][index].rotation;
      transform.yaw=rotation[2]*Math.PI/180;transform.pitch=rotation[0]*Math.PI/180;
    }
    return transform;
  }
  private supportHeight(position:Vec3,maxY=position.y+SUPPORT_TOLERANCE,player?:RoomPlayer):number|undefined {
    if(this.original){
      const {radius,bodyHeight}=this.original.profile;
      const fixed=this.geometryFor(player)!.playerSupportHeightAt(position.x,position.z,maxY,radius,bodyHeight);
      const barrel=(player?.sourceWorld?.barrels??this.barrelWorld)?.playerSupportHeightAt(position.x,position.z,maxY,radius,bodyHeight);
      return fixed===undefined?barrel:barrel===undefined?fixed:Math.max(fixed,barrel);
    }
    return this.winter ? 0 : legacySupportHeightAt(this.map,position.x,position.z,maxY);
  }
  private raycast(...args: Parameters<typeof raycastArena>): ReturnType<typeof raycastArena> {
    return this.raycastFor(undefined,...args);
  }
  private raycastFor(player:RoomPlayer|undefined,...args:Parameters<typeof raycastArena>):ReturnType<typeof raycastArena> {
    if(this.original){
      const fixed=this.geometryFor(player)!.raycast(...args),barrel=(player?.sourceWorld?.barrels??this.barrelWorld)?.raycast(args[0],args[1],args[2],args[3])??null;
      return barrel&&(!fixed||barrel.distance<fixed.distance)?barrel:fixed;
    }
    return this.winter ? raycastArena(...args) : raycastLegacyMap(this.map,...args);
  }
  /** Bullet-only generated model membership; never added to physics/support rays. */
  private captureSourceProjectilePoses(player?:RoomPlayer):readonly OriginalProjectileModelPose[] {
    if(!this.original)return [];
    return [...(player?.sourceWorld?.projectiles??this.projectiles).entries()].flatMap(([id,projectile])=>{
      const source=projectile.source;
      return source?[{id,weapon:source.weapon,position:{...source.position},direction:{...source.direction},
        ...(source.sourceRotation?{sourceRotation:{...source.sourceRotation}}:{}),
        ...(source.angular?{orientation:{...source.angular.orientation}}:{})}]:[];
    });
  }
  private freezeSourceRay(player:RoomPlayer){
    const world=this.ensureSourceWorld(player,this.clock()),geometry=world.doors?.fork().geometry??this.originalGeometry!;
    const barrels=world.barrels.fork();
    const projectiles=this.captureSourceProjectilePoses(player);
    return (origin:Vec3,direction:Vec3,max:number,options:Parameters<typeof raycastArena>[3])=>{
      const fixed=geometry.raycast(origin,direction,max,options),barrel=barrels.raycast(origin,direction,max,options);
      const sky=raycastOriginalSky(this.original!.data,this.original!.scale,origin,direction,max);
      let hit=barrel&&(!fixed||barrel.distance<fixed.distance)?barrel:fixed;
      if(sky&&(!hit||sky.distance<hit.distance))hit=sky;
      for(const pose of projectiles){const candidate=raycastOriginalProjectileModel(originalServerProjectileRayGeometry.get(pose.weapon)!,pose.position,originalProjectileModelQuaternion(pose.weapon,pose.direction,pose.sourceRotation,pose.orientation),origin,direction,hit?.distance??max,pose.id);if(candidate&&(!hit||candidate.distance<hit.distance))hit=candidate;}
      return hit;
    };
  }
  private raycastBulletWorld(origin:Vec3,direction:Vec3,max=300,options:Parameters<typeof raycastArena>[3]={},
    projectiles:readonly OriginalProjectileModelPose[]=this.captureSourceProjectilePoses()):ReturnType<typeof raycastArena> {
    const world=this.raycast(origin,direction,max,options);
    const sky=this.original?raycastOriginalSky(this.original.data,this.original.scale,origin,direction,max):null;
    let nearest=sky&&(!world||sky.distance<world.distance)?sky:world;
    if(this.original)for(const pose of projectiles){
      const geometry=originalServerProjectileRayGeometry.get(pose.weapon)!;
      const quaternion=originalProjectileModelQuaternion(pose.weapon,pose.direction,pose.sourceRotation,pose.orientation);
      const hit=raycastOriginalProjectileModel(geometry,pose.position,quaternion,origin,direction,nearest?.distance??max,pose.id);
      if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;
    }
    return nearest;
  }
  private lineOfSight(...args: Parameters<typeof hasArenaLineOfSight>): boolean {
    return this.lineOfSightFor(undefined,...args);
  }
  private lineOfSightFor(player:RoomPlayer|undefined,...args:Parameters<typeof hasArenaLineOfSight>):boolean {
    if(this.original){
      const [from,to,options={}]=args;
      const direction={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z},distance=length(direction);
      if(distance<=1e-9)return true;
      return this.raycastFor(player,from,direction,distance-Math.min(1e-5,distance*.5),{...options,minDistance:options.minDistance??1e-5})===null;
    }
    return this.winter ? hasArenaLineOfSight(...args) : hasLegacyLineOfSight(this.map,...args);
  }
  private applyDamage(player: RoomPlayer, damage: number): boolean {
    if(player.sourceHealth){
      const result=applyOriginalPlayerDamage(player.sourceHealth,damage);
      player.health=result.health;
      return result.dead;
    }
    const absorbed = Math.min(player.armor, damage * .55);
    player.armor -= absorbed;
    player.health = Math.max(0,player.health-(damage-absorbed));
    return player.health<=0;
  }
  private sourceDamageState(player:RoomPlayer,lethal:boolean){
    return player.sourceHealth?{sourceHealth:{...player.sourceHealth},...(this.sourceHealthUpdatedAt!==null?{sourceHealthTime:this.sourceHealthUpdatedAt}:{}),lethal}:{};
  }
  private stepSourceHealth():void {
    for(const player of this.players.values())if(player.alive&&player.peer!==null&&player.sourceHealth)stepOriginalPlayerHealth(player.sourceHealth);
  }
  private handleChat(player: RoomPlayer, text: unknown, now: number): void {
    if (typeof text !== 'string' || text.length > CHAT_MAX_LENGTH || !text.trim() || /[\u0000-\u001f\u007f]/.test(text)) {
      this.error(player,'invalid_chat',`Chat must contain 1-${CHAT_MAX_LENGTH} printable characters.`);return;
    }
    player.chatTimes = player.chatTimes.filter(time => now-time < 5_000);
    if (player.chatTimes.length >= 4) { this.error(player,'chat_rate_limit','Please wait before sending another message.');return; }
    player.chatTimes.push(now);
    this.broadcastEvent({type:'chat',serverTime:now,data:{playerId:player.id,name:player.name,text:this.original?text:text.trim()}});
  }
  private handleSourceEscape(player:RoomPlayer,message:ClientMessage,now:number):void {
    // Route and amount come from the current authenticated source actor, never
    // a client's claimed typing state, killer, target or damage.
    if(Object.keys(message).some(key=>key!=='type'&&key!=='sourceRemoteView')){
      this.error(player,'invalid_source_escape','Source Escape accepts no authority fields.');return;
    }
    if(!this.original){this.error(player,'invalid_source_escape','Source Escape is only available in source maps.');return;}
    if(!player.alive||this.state!=='playing')return;
    const direct=this.map==='barrack'&&!player.transform.typing;
    // Source getplayer resolves its own goody before searching remote actors.
    const named=isOriginalCowardiceName(player.name)?player
      :[...this.players.values()].find(candidate=>candidate.peer!==null&&candidate.alive&&isOriginalCowardiceName(candidate.name));
    const source:DamageSource={kind:'cowardice',direct,attackerId:named?.id??null};
    const killer=named??player;
    const lethal=direct||this.applyDamage(player,1000);
    if(!direct)this.broadcastEvent({type:'damaged',serverTime:now,data:{attackerId:killer.id,targetId:player.id,damage:1000,health:player.health,source,...this.sourceDamageState(player,lethal)}});
    if(lethal)this.kill(killer,player,source,now,named!==undefined&&named.id!==player.id);
    // The client leaves only after receiving terminal authority. This keeps
    // killed ahead of leave and preserves its negotiated death-view receipt.
  }
  private handleCollect(player: RoomPlayer,itemId: unknown,now: number): void {
    if (!player.alive || this.state !== 'playing' || typeof itemId !== 'string' || itemId.length < 1 || itemId.length > 128) return;
    const pickup=this.pickups.get(itemId),privateDrop=player.sourceTimeoutDrops.get(itemId),drop=privateDrop??this.drops.get(itemId),item=pickup??drop;
    if (!item || (pickup && (!pickup.active || pickup.respawnAt !== null)) || (drop && drop.expiresAt!==null&&now >= drop.expiresAt)) return;
    const feet=player.transform.position;
    if(this.original&&drop){
      if(!originalPickupInReach({...feet,y:feet.y+this.original.profile.eyeHeight},item.position,this.original.scale))return;
    }else{
      if (Math.hypot(feet.x-item.position.x,feet.z-item.position.z)>1.35 || Math.abs(feet.y-item.position.y)>1.5) return;
      if (!this.lineOfSightFor(player,{...feet,y:feet.y+.8},item.position,{minDistance:.01})) return;
    }
    if (pickup) {
      if (pickup.type==='health') {if(player.sourceHealth){const result=applyOriginalPlayerHealthDelta(player.sourceHealth,20);player.health=result.health;}else{if(player.health>=MAX_HEALTH)return;player.health=Math.min(MAX_HEALTH,player.health+40);}}
      if (pickup.type==='armor') {if(this.original)return;if(player.armor>=100)return;player.armor=Math.min(100,player.armor+50);}
      if (pickup.type==='ammo') for(const weapon of WEAPON_IDS)player.reserve[weapon]+=Math.ceil(WEAPONS[weapon].magazine*.7);
      pickup.active=false;pickup.respawnAt=this.original?null:now+18_000;
    } else if (drop) {
      if(this.original){
        player.reserve[drop.weapon]+=ORIGINAL_DROP_AMMO[drop.weapon];
        if(player.sourceUnarmed){player.transform.weapon=drop.weapon;player.sourceUnarmed=false;}
        this.startOriginalReload(player,player.transform.weapon,now);
      }else{
        player.reserve[drop.weapon]+=WEAPONS[drop.weapon].magazine;
        player.reloadWeapon=null;player.reloadCompleteAt=null;player.transform.weapon=drop.weapon;
      }
      if(privateDrop)player.sourceTimeoutDrops.delete(drop.id);else this.drops.delete(drop.id);
    }
    if(this.original)player.score+=ORIGINAL_PICKUP_SCORE;
    this.sendLoadout(player,now);
    const event:MatchEvent={type:'collected',serverTime:now,data:{playerId:player.id,itemId,kind:pickup?.type??'weapon',...(this.original?{score:player.score}:{}),...(drop?{weapon:drop.weapon}:{})}};
    if(privateDrop)this.sendSourceViewMessage(player,{type:'event',event});else this.broadcastEvent(event);
  }

  private commitDoors(player:RoomPlayer,world:OriginalDoorWorld,now:number):void {
    const owner=this.ensureSourceWorld(player,now),previous=new Map(owner.doors?.getStates().map(d=>[d.name,d.openedAt]));
    owner.doors=world;this.advanceSourceDoors(owner,now);
    for(const door of world.getStates())if(door.openedAt!==null&&previous.get(door.name)===null){
      const event:MatchEvent={type:'door_open',serverTime:now,data:{name:door.name,openedAt:door.openedAt*1000}};
      this.sendSourceViewMessage(player,{type:'event',event});
      for(const receiver of this.players.values())if(receiver!==player&&receiver.peer!==null&&receiver.alive&&!originalAsciiNamesEqual(receiver.name,player.name)){
        const target=this.ensureSourceWorld(receiver,now),states=target.doors?.getStates();if(!states)continue;
        if(states.find(d=>d.name===door.name)?.openedAt!==null)continue;
        // A delivered door constructor starts at this receiver's private
        // facade epoch; the wire animation and committed body removal agree.
        const epoch=this.advanceSourceDoors(target,now),peer=receiver.peer;
        this.sendSourceViewMessage(receiver,{type:'event',event:{...event,data:{name:door.name,openedAt:epoch*1000}}});
        if(receiver.peer===peer&&receiver.alive&&receiver.sourceWorld===target)target.doors!.reconcile(states.map(d=>({name:d.name,openedAt:d.name===door.name?epoch:d.openedAt})),epoch);
      }
    }
  }
  private updateDoors(now:number):void {
    if(!this.original)return;
    for(const player of this.players.values())if(player.alive&&player.peer!==null){
      const owner=this.ensureSourceWorld(player,now);if(!owner.doors)continue;
      const epoch=this.advanceSourceDoors(owner,now),world=owner.doors.fork();world.triggerNearby({...player.transform.position,y:player.transform.position.y+this.original.profile.eyeHeight},epoch);this.commitDoors(player,world,now);
    }
  }
  private handleTransform(player:RoomPlayer,message:Extract<ClientMessage,{type:'transform'}>,now:number):boolean {
    if(!player.alive||this.state!=='playing')return false;
    const owner=this.original?this.ensureSourceWorld(player,now):null,previous=owner?.doors;
    if(!previous)return this.handleTransformWithDoors(player,message,now);
    const epoch=this.advanceSourceDoors(owner!,now),world=previous.fork(),sequence=player.transformSequence;owner!.doors=world;
    let accepted=false;
    try{
      if(message.path===undefined&&player.alive)world.triggerNearby({...player.transform.position,y:player.transform.position.y+this.original!.profile.eyeHeight},epoch);
      const changed=this.handleTransformWithDoors(player,message,now);accepted=player.transformSequence>sequence&&player.transformSequence===message.sequence;
      if(accepted)world.triggerNearby({...player.transform.position,y:player.transform.position.y+this.original!.profile.eyeHeight},epoch);
      return changed;
    }finally{owner!.doors=previous;if(accepted)this.commitDoors(player,world,now);}
  }

  private handleTransformWithDoors(
    player: RoomPlayer,
    message: Extract<ClientMessage, { type: 'transform' }>,
    now: number,
  ): boolean {
    if (!player.alive || this.state !== 'playing') return false;
    if (!Number.isSafeInteger(message.sequence) || message.sequence <= player.transformSequence) return false;
    if (!Number.isFinite(message.clientTime) || !this.validTransform(message.transform,player)) {
      this.error(player, 'invalid_transform', 'Transform data is outside the allowed range.');
      return false;
    }
    if(this.original&&message.transform.weapon!==player.transform.weapon
      &&!originalWeaponAvailable(player.ammo,player.reserve,message.transform.weapon)){
      this.error(player,'invalid_transform','An empty source weapon cannot be selected.');return false;
    }
    if (!this.original&&player.reloadWeapon !== null && message.transform.weapon !== player.transform.weapon) {
      this.error(player, 'reload_in_progress', 'Finish reloading before switching weapons.');
      return false;
    }

    if(this.original&&message.transform.sourceInput!==undefined) {
      this.updateSourceWorld(now);
      this.sourceLegacyContactBodies.delete(player.id);
      const first=player.sourceBody===null;
      if(first){
        const eye={...player.transform.position,y:player.transform.position.y+this.original.profile.eyeHeight};
        player.sourceBody=createOriginalPlayerBody(player.id,eye,{x:player.transform.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:player.transform.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:player.transform.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR});
        player.sourceBody.supported=player.transform.grounded;
        this.ensureSourceWorld(player,now).body=player.sourceBody;
        if(this.sourceWorldUpdatedAt===null)this.sourceWorldUpdatedAt=now;
      }
      const equippedChanged=message.transform.weapon!==player.transform.weapon;
      const typingChanged=Boolean(message.transform.typing)!==Boolean(player.transform.typing);
      player.sourceInput={...message.transform.sourceInput,yaw:message.transform.yaw,pitch:message.transform.pitch,typing:Boolean(message.transform.typing)};
      player.transform={...player.transform,yaw:message.transform.yaw,pitch:message.transform.pitch,weapon:message.transform.weapon,typing:message.transform.typing,sourceInput:{...message.transform.sourceInput},movementMode:message.transform.movementMode};
      if(equippedChanged){player.sourceDisplayedWeapon=message.transform.weapon;player.sourceUnarmed=false;player.sourceCounterReady=false;player.sourceCounterWeapon=message.transform.weapon;this.syncSourceReload(player);}
      if(typingChanged&&message.transform.typing){player.sourceCounterReady=false;this.syncSourceReload(player);}
      player.transformSequence=message.sequence;player.lastTransformAt=now;
      return Boolean(first||equippedChanged||typingChanged);
    }
    // Once source intent is established, transform-only packets cannot replace
    // the authoritative body or manufacture a jump/contact velocity.
    if(this.original&&player.sourceBody!==null){this.error(player,'invalid_transform','Source movement requires held input intent.');return false;}
    const boost = player.authorizedBoost;
    if(boost && boost.velocityY>0 && !boost.ascentObserved && now-boost.issuedAt<=BOOST_RECEIPT_WINDOW_MS
      && (message.transform.grounded || message.transform.velocity.y<=0
        || message.transform.position.y<player.transform.position.y-AIRBORNE_DIRECTION_TOLERANCE)) {
      // A pre-event transform cannot cancel the newly issued ascent. Ignoring
      // it changes neither position nor any movement allowance.
      return false;
    }
    let pathReview: {state:RoomPlayer;travel:number;verticalTravel:number}|undefined;
    if(message.path!==undefined){
      if(!this.original||!Array.isArray(message.path)||message.path.length===0||message.path.length>MAX_TRANSFORM_PATH_SAMPLES
        ||!message.path.every(sample=>sample&&isFiniteVec3(sample.position)&&isFiniteVec3(sample.velocity)&&typeof sample.grounded==='boolean'&&this.validTransform({...message.transform,position:sample.position,velocity:sample.velocity,grounded:sample.grounded},player))) {
        this.error(player,'invalid_transform','Movement path did not pass validation.');return false;
      }
      const last=message.path[message.path.length-1],end=message.transform;
      if(last.grounded!==end.grounded||last.position.x!==end.position.x||last.position.y!==end.position.y||last.position.z!==end.position.z
        ||last.velocity.x!==end.velocity.x||last.velocity.y!==end.velocity.y||last.velocity.z!==end.velocity.z){
        this.error(player,'invalid_transform','Movement path must end at the published transform.');return false;
      }
      pathReview=this.reviewMovementPath(player,message.path,message.transform,now);
      if(!pathReview){this.error(player,'collision_rejected','Movement path crossed or occupied solid arena geometry.');return false;}
    }
    this.replenishMovementBudget(player, now);
    const verticalDistance = pathReview?.verticalTravel??Math.abs(message.transform.position.y-player.transform.position.y);
    if (boost) {
      const from = Math.max(0,(boost.budgetUpdatedAt-boost.issuedAt)/1000);
      const to = Math.max(from,(now-boost.issuedAt)/1000);
      const gravity=this.original?ORIGINAL_PLAYER_DERIVATIVE_GRAVITY:CLIENT_GRAVITY;
      const apex = boost.velocityY/gravity;
      const primitive = (t:number) => boost.velocityY*t-.5*gravity*t*t;
      const travel = from<apex&&to>apex
        ? 2*primitive(apex)-primitive(from)-primitive(to)
        : Math.abs(primitive(to)-primitive(from));
      boost.verticalBudget=Math.min(6,boost.verticalBudget+travel);
      boost.budgetUpdatedAt=Math.max(boost.budgetUpdatedAt,now);
      if(verticalDistance>boost.verticalBudget+COLLISION_EPSILON) {
        this.error(player,'movement_rejected','Vertical movement exceeded the issued boost.');
        return false;
      }
    }
    const movementDistance = pathReview?.travel??Math.hypot(
      message.transform.position.x - player.transform.position.x,
      boost ? 0 : message.transform.position.y - player.transform.position.y,
      message.transform.position.z - player.transform.position.z,
    );
    if (movementDistance > player.movementBudget + COLLISION_EPSILON) {
      this.error(player, 'movement_rejected', 'Transform moved farther than the server allows.');
      return false;
    }
    const airborneState = pathReview
      ? (pathReview.state.airborneOriginY===null?null:{originY:pathReview.state.airborneOriginY,positiveRise:pathReview.state.airbornePositiveRise,horizontalDistance:pathReview.state.airborneHorizontalDistance,descending:pathReview.state.airborneDescending})
      : this.validArenaMovement(player, message.transform, now);
    if (airborneState === false) {
      this.error(player, 'collision_rejected', 'Transform crossed or occupied solid arena geometry.');
      return false;
    }

    if(boost&&pathReview?.state.authorizedBoost)boost.ascentObserved=pathReview.state.authorizedBoost.ascentObserved;
    const equippedChanged = message.transform.weapon !== player.transform.weapon;
    const typingChanged=this.original&&Boolean(message.transform.typing)!==Boolean(player.transform.typing);
    player.movementBudget = Math.max(0, player.movementBudget - movementDistance);
    if(boost) {
      boost.verticalBudget=Math.max(0,boost.verticalBudget-verticalDistance);
      const expectedVelocity=boost.velocityY-(this.original?ORIGINAL_PLAYER_DERIVATIVE_GRAVITY:CLIENT_GRAVITY)*Math.max(0,(now-boost.issuedAt)/1000);
      if(!message.transform.grounded && message.transform.velocity.y>0
        && message.transform.velocity.y>=expectedVelocity-1) boost.ascentObserved=true;
    }
    if (airborneState === null) {
      player.authorizedBoost = null;
      player.airborneOriginY = null;
      player.airbornePositiveRise = 0;
      player.airborneHorizontalDistance = 0;
      player.airborneDescending = false;
    } else {
      player.airborneOriginY = airborneState.originY;
      player.airbornePositiveRise = airborneState.positiveRise;
      player.airborneHorizontalDistance = airborneState.horizontalDistance;
      player.airborneDescending = airborneState.descending;
    }
    player.transform = cloneTransform(message.transform);
    if(this.original&&player.sourceWorld&&!player.sourceBody)player.sourceWorld.body=this.createSourceLegacyContactBody(player);
    if(this.original&&message.transform.typing){player.sourceCounterReady=false;this.syncSourceReload(player);}
    if(this.original&&equippedChanged){
      player.sourceDisplayedWeapon=message.transform.weapon;player.sourceUnarmed=false;player.sourceCounterReady=false;
      player.sourceCounterWeapon=message.transform.weapon;this.syncSourceReload(player);
    }
    player.transformSequence = message.sequence;
    player.lastTransformAt = now;
    this.recordPosition(player, now);
    return Boolean(equippedChanged||typingChanged);
  }

  private reviewMovementPath(player:RoomPlayer,path:MovementSample[],endpoint:PlayerTransform,now:number):{state:RoomPlayer;travel:number;verticalTravel:number}|undefined {
    const state={...player,transform:cloneTransform(player.transform),authorizedBoost:player.authorizedBoost?{...player.authorizedBoost}:null};
    let travel=0,verticalTravel=0;
    for(let i=0;i<path.length;i++){
      const next={...endpoint,position:path[i].position,velocity:path[i].velocity,grounded:path[i].grounded},sampleStart=Math.max(player.lastTransformAt,state.authorizedBoost?.issuedAt??player.lastTransformAt),sampleTime=sampleStart+(now-sampleStart)*(i+1)/path.length;
      // A burst may contain physics steps sampled before the issued event.
      // Those states cannot clear or spend a new boost authorization.
      if(state.authorizedBoost&&!state.authorizedBoost.ascentObserved&&sampleTime<state.authorizedBoost.issuedAt)continue;
      const previous=state.transform.position,p=next.position;
      if(state.sourceWorld?.doors){const epoch=this.advanceSourceDoors(state.sourceWorld,now);state.sourceWorld.doors.triggerNearby({...previous,y:previous.y+this.original!.profile.eyeHeight},epoch);}
      travel+=Math.hypot(p.x-previous.x,state.authorizedBoost?0:p.y-previous.y,p.z-previous.z);
      verticalTravel+=Math.abs(p.y-previous.y);
      const airborne=this.validArenaMovement(state,next,sampleTime);
      if(airborne===false)return undefined;
      if(state.sourceWorld?.doors)state.sourceWorld.doors.triggerNearby({...p,y:p.y+this.original!.profile.eyeHeight},this.advanceSourceDoors(state.sourceWorld,now));
      if(airborne===null){state.authorizedBoost=null;state.airborneOriginY=null;state.airbornePositiveRise=0;state.airborneHorizontalDistance=0;state.airborneDescending=false;}
      else{state.airborneOriginY=airborne.originY;state.airbornePositiveRise=airborne.positiveRise;state.airborneHorizontalDistance=airborne.horizontalDistance;state.airborneDescending=airborne.descending;}
      if(state.authorizedBoost&&!next.grounded&&next.velocity.y>0)state.authorizedBoost.ascentObserved=true;
      state.transform=cloneTransform(next);
    }
    if(state.transform.position.x!==endpoint.position.x||state.transform.position.y!==endpoint.position.y||state.transform.position.z!==endpoint.position.z)return undefined;
    return {state,travel,verticalTravel};
  }

  private validTransform(transform: unknown,player?:RoomPlayer): transform is PlayerTransform {
    if (!transform || typeof transform !== 'object') return false;
    const value = transform as Partial<PlayerTransform>;
    if (!isFiniteVec3(value.position) || !isFiniteVec3(value.velocity)) return false;
    if (!Number.isFinite(value.yaw) || !Number.isFinite(value.pitch)) return false;
    if (typeof value.grounded !== 'boolean' || !isWeaponId(value.weapon)) return false;
    if(value.typing!==undefined&&typeof value.typing!=='boolean')return false;
    if(value.movementMode!==undefined&&!isCopyMovementMode(value.movementMode))return false;
    if(value.sourceInput!==undefined&&(!value.sourceInput||typeof value.sourceInput!=='object'||Object.keys(value.sourceInput).length!==5||!['forward','backward','left','right','jump'].every(key=>typeof (value.sourceInput as unknown as Record<string,unknown>)[key]==='boolean')))return false;
    const { position, velocity } = value as PlayerTransform;
    if(this.original){
      const bounds=this.geometryFor(player)!.groundBounds??this.geometryFor(player)!.bounds;
      if(position.x<bounds.min.x||position.x>bounds.max.x||position.z<bounds.min.z||position.z>bounds.max.z)return false;
      if(position.y<bounds.min.y-32||position.y>bounds.max.y+32)return false;
    }else{
      if (Math.abs(position.x) > WORLD_HORIZONTAL_LIMIT || Math.abs(position.z) > WORLD_HORIZONTAL_LIMIT) return false;
      if (position.y < WORLD_MIN_Y || position.y > WORLD_MAX_Y) return false;
    }
    // Source goody clamps before mouse input, then gun recoil can raise the
    // published pitch again (85 + SPAS 7 = 92 degrees). Held source intent
    // therefore accepts finite aim without imposing the authored camera bound.
    if(this.original&&value.sourceInput!==undefined)return true;
    if (Math.abs((value.pitch as number)) > Math.PI / 2 + 0.01) return false;
    return length(velocity) <= MAX_VELOCITY+(player?.authorizedBoost?.contactVelocity?length(player.authorizedBoost.contactVelocity):0);
  }

  private replenishMovementBudget(player: RoomPlayer, now: number): void {
    const elapsed = Math.max(0, now - player.movementBudgetUpdatedAt) / 1_000;
    const contactSpeed=player.authorizedBoost?.contactVelocity?Math.hypot(player.authorizedBoost.contactVelocity.x,player.authorizedBoost.contactVelocity.z):0;
    player.movementBudget = Math.min((this.original?ORIGINAL_MOVEMENT_BUDGET_CAPACITY:MOVEMENT_BUDGET_CAPACITY)+contactSpeed, player.movementBudget + (MAX_MOVE_SPEED+contactSpeed) * elapsed);
    player.movementBudgetUpdatedAt = Math.max(player.movementBudgetUpdatedAt, now);
  }

  private validArenaMovement(player: RoomPlayer, nextTransform: PlayerTransform, now: number): AirborneMovementState | null | false {
    const next = nextTransform.position;
    const ground = this.groundHeight(next.x,next.z,player);
    if (next.y < ground - SUPPORT_TOLERANCE) return false;
    if(this.original){
      const bounds=this.geometryFor(player)!.groundBounds??this.geometryFor(player)!.bounds,radius=this.original.profile.radius;
      if(next.x<bounds.min.x+radius||next.x>bounds.max.x-radius||next.z<bounds.min.z+radius||next.z>bounds.max.z-radius)return false;
    }else if (this.winter ? !isInsideArenaPlayableBounds(next, PLAYER_COLLISION_RADIUS) : Math.max(Math.abs(next.x),Math.abs(next.z)) > getLegacyMap(this.map).bounds-PLAYER_COLLISION_RADIUS) return false;
    let airborneState: AirborneMovementState | null = null;
    if (nextTransform.grounded) {
      if (!this.hasPlayerSupport(next,player)) return false;
    } else {
      airborneState = this.nextAirborneMovementState(player, nextTransform, now);
      if (!airborneState) return false;
    }
    if(this.original){
      const {profile}=this.original,geometry=this.geometryFor(player)!;
      if(geometry.playerIntersects(next,profile.radius,profile.bodyHeight)||player?.sourceWorld?.barrels?.playerIntersects(next,profile.radius,profile.bodyHeight))return false;
      const oldCenter={...player.transform.position,y:player.transform.position.y+profile.radius},newCenter={...next,y:next.y+profile.radius};
      for(const barrel of player?.sourceWorld?.barrels?.bodies??[]){
        const hit=sweepOriginalConvexSphere(barrel.convex,barrel.position,barrel.position,oldCenter,newCenter,profile.radius,ORIGINAL_COLLISION_CONTACT_DISTANCE);
        if(hit&&hit.fraction<1&&(newCenter.x-oldCenter.x)*hit.normalBToA.x+(newCenter.y-oldCenter.y)*hit.normalBToA.y+(newCenter.z-oldCenter.z)*hit.normalBToA.z>1e-9)return false;
      }
      const resolved=geometry.movePlayer(player.transform.position,next,profile.radius,profile.bodyHeight).position;
      if(Math.hypot(resolved.x-next.x,resolved.y-next.y,resolved.z-next.z)>.025
        && !(player.transform.grounded&&nextTransform.grounded&&this.validOriginalGroundPath(player.transform.position,next,player)))return false;
      return airborneState;
    }
    if (!this.winter) {
      if(playerIntersectsLegacyRampSolid(this.map,next,PLAYER_COLLISION_RADIUS,PLAYER_COLLISION_TOP,PLAYER_COLLISION_BOTTOM))return false;
      const previous=player.transform.position;
      const steps=Math.max(1,Math.ceil(Math.hypot(next.x-previous.x,next.z-previous.z)/.2));
      for(let i=1;i<steps;i++){
        const t=i/steps,x=previous.x+(next.x-previous.x)*t,z=previous.z+(next.z-previous.z)*t,y=previous.y+(next.y-previous.y)*t;
        if(playerIntersectsLegacyRampSolid(this.map,{x,y,z},PLAYER_COLLISION_RADIUS,PLAYER_COLLISION_TOP,PLAYER_COLLISION_BOTTOM))return false;
        if(y<this.groundHeight(x,z)-.08)return false;
        if(nextTransform.grounded && player.transform.grounded && next.y>previous.y+PLAYER_STEP_HEIGHT
          && y-legacySupportHeightAt(this.map,x,z,y+.12)>.15)return false;
      }
    }
    if (this.colliders.some((collider) => playerVolumeIntersectsCollider(next, collider))) return false;
    for (const collider of this.colliders) {
      if (!sweptPlayerIntersectsCollider(player.transform.position, next, collider)) continue;
      if (isStepTraversal(player.transform.position, next, collider, player.transform.grounded)) continue;
      return false;
    }
    return airborneState;
  }

  private validOriginalGroundPath(from:Vec3,to:Vec3,player?:RoomPlayer):boolean {
    if(!this.original)return false;
    const {profile}=this.original,geometry=this.geometryFor(player)!;
    // Network samples can contain many collision-safe physics steps. A chord
    // across a rounded ramp crest cuts through support even when that path is
    // clear. Reconstruct only a nearby continuous grounded surface, sweeping
    // every segment so walls, ceilings and unsupported gaps remain solid.
    const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.025));
    let previous=from;
    for(let i=1;i<=steps;i++){
      const t=i/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
      const support=this.supportHeight({x,y:previous.y,z},previous.y+ORIGINAL_SUPPORT_TOLERANCE,player);
      if(support===undefined||Math.abs(support-previous.y)>ORIGINAL_SUPPORT_TOLERANCE)return false;
      const point=i===steps?to:{x,y:support,z};
      if(Math.abs(point.y-support)>ORIGINAL_SUPPORT_TOLERANCE||geometry.playerIntersects(point,profile.radius,profile.bodyHeight)||player?.sourceWorld?.barrels?.playerIntersects(point,profile.radius,profile.bodyHeight))return false;
      const moved=geometry.movePlayer(previous,point,profile.radius,profile.bodyHeight).position;
      if(Math.hypot(moved.x-point.x,moved.y-point.y,moved.z-point.z)>.0025)return false;
      previous=point;
    }
    return true;
  }

  private nextAirborneMovementState(
    player: RoomPlayer,
    nextTransform: PlayerTransform,
    now: number,
  ): AirborneMovementState | null {
    const boost=player.authorizedBoost;
    const elapsed=boost ? Math.max(0,(now-boost.issuedAt)/1000) : 0;
    const previous = player.transform;
    const starting = previous.grounded || player.airborneOriginY === null;
    const originY = starting ? previous.position.y : player.airborneOriginY!;
    const verticalDelta = nextTransform.position.y - previous.position.y;
    const horizontalDelta = Math.hypot(
      nextTransform.position.x - previous.position.x,
      nextTransform.position.z - previous.position.z,
    );
    const positiveRise = (starting ? 0 : player.airbornePositiveRise) + Math.max(0, verticalDelta);
    const horizontalDistance = (starting ? 0 : player.airborneHorizontalDistance) + horizontalDelta;
    const wasDescending = !starting && player.airborneDescending;
    if (wasDescending && (verticalDelta > AIRBORNE_DIRECTION_TOLERANCE
      || nextTransform.velocity.y > AIRBORNE_VELOCITY_TOLERANCE)) return null;
    const gravity=this.original?ORIGINAL_PLAYER_DERIVATIVE_GRAVITY:CLIENT_GRAVITY;
    const jump=this.original?ORIGINAL_PLAYER_DERIVATIVE_JUMP:CLIENT_JUMP_VELOCITY;
    const groundSpeed=this.original?ORIGINAL_PLAYER_GROUNDED_MAX_SPEED:CLIENT_SPRINT_SPEED;
    const launchVelocity=boost?.velocityY ?? jump;
    const maximumRise=boost ? launchVelocity**2/(2*gravity)+.15 : this.original?jump**2/(2*gravity)+.15:MAX_AIRBORNE_RISE;
    // A transform describes a recently sampled state, not necessarily the
    // state at packet receipt. Bound that sampling/transport delay without
    // trusting the client's clock or changing ordinary jump authorization.
    const earliestSampleElapsed=Math.max(0,elapsed-BOOST_RECEIPT_WINDOW_MS/1000);
    const maximumVelocity=boost ? launchVelocity-gravity*earliestSampleElapsed+.8 : this.original?jump+.2:MAX_UPWARD_VELOCITY;
    if (nextTransform.position.y > originY + maximumRise + COLLISION_EPSILON
      || positiveRise > maximumRise + COLLISION_EPSILON
      || nextTransform.velocity.y > maximumVelocity) return null;
    if(boost) {
      const highestSampleElapsed=Math.max(earliestSampleElapsed,Math.min(elapsed,launchVelocity/gravity));
      const maximumSampleHeight=boost.originY+launchVelocity*highestSampleElapsed-.5*gravity*highestSampleElapsed**2;
      if(nextTransform.position.y>maximumSampleHeight+1) return null;
    }

    const dropFromOrigin = Math.max(0, originY - nextTransform.position.y);
    const maximumFlightSeconds = (launchVelocity
      + Math.sqrt(launchVelocity ** 2 + 2 * gravity * dropFromOrigin)) / gravity;
    const maximumHorizontalPath = (groundSpeed+(boost?.contactVelocity?Math.hypot(boost.contactVelocity.x,boost.contactVelocity.z):0)) * maximumFlightSeconds + AIRBORNE_PATH_TOLERANCE;
    if (horizontalDistance > maximumHorizontalPath + COLLISION_EPSILON) return null;

    return {
      originY,
      positiveRise,
      horizontalDistance,
      descending: wasDescending
        // The first issued ascent sample can lag below the server's prior
        // position. Its positive velocity distinguishes acknowledgment from
        // a genuine descent; all later direction checks remain unchanged.
        || (verticalDelta < -AIRBORNE_DIRECTION_TOLERANCE
          && !(boost && !boost.ascentObserved && nextTransform.velocity.y>AIRBORNE_VELOCITY_TOLERANCE))
        || nextTransform.velocity.y < -AIRBORNE_VELOCITY_TOLERANCE,
    };
  }

  private hasPlayerSupport(position: Vec3,player?:RoomPlayer): boolean {
    if(this.original){const support=this.supportHeight(position,position.y+ORIGINAL_SUPPORT_TOLERANCE,player);return support!==undefined&&Math.abs(position.y-support)<=ORIGINAL_SUPPORT_TOLERANCE;}
    if (Math.abs(position.y - (this.winter ? 0 : legacySupportHeightAt(this.map,position.x,position.z,position.y+SUPPORT_TOLERANCE))) <= SUPPORT_TOLERANCE) return true;
    return this.colliders.some((collider) =>
      Math.abs(position.y - collider.max[1]) <= SUPPORT_TOLERANCE
      && position.x > collider.min[0] - PLAYER_COLLISION_RADIUS
      && position.x < collider.max[0] + PLAYER_COLLISION_RADIUS
      && position.z > collider.min[2] - PLAYER_COLLISION_RADIUS
      && position.z < collider.max[2] + PLAYER_COLLISION_RADIUS);
  }

  private handleShoot(player: RoomPlayer, shot: unknown, now: number): void {
    if (!player.alive || this.state !== 'playing') return;
    if (!this.validShot(shot) || shot.weapon !== player.transform.weapon) {
      this.error(player, 'invalid_shot', 'Shot data did not pass server validation.');
      return;
    }
    if(this.original&&player.sourceRemoteView&&shot.weapon==='rpg'&&!originalProjectileRotationMatchesDirection(shot.sourceRotation,shot.direction)){this.error(player,'invalid_shot','Source RPG launch rotation is required.');return;}
    this.expireRecentShotIds(player, now);
    if (player.recentShotIds.has(shot.shotId) || player.pendingShots.has(shot.shotId)) {
      this.error(player, 'duplicate_shot', 'Shot identifiers must be unique.');
      return;
    }
    if (player.recentShotIds.size >= MAX_RECENT_SHOT_IDS) {
      this.error(player, 'shot_history_full', 'Too many recent shots are still active.');
      return;
    }
    const weapon = WEAPONS[shot.weapon];
    if(this.original&&player.sourceUnarmed){this.error(player,'empty_magazine','No source weapon is selected.');return;}
    if (player.reloadWeapon !== null) {
      this.error(player, 'reload_in_progress', 'The current weapon is still reloading.');
      return;
    }
    if (player.ammo[shot.weapon] <= 0) {
      this.error(player, 'empty_magazine', 'Reload before firing this weapon again.');
      return;
    }
    if (this.original ? (!player.sourceCounterReady||player.sourceCounterWeapon!==shot.weapon)
      : now - player.lastShotAt + 1 < weapon.fireIntervalMs) {
      this.error(player, 'fire_rate', 'Weapon fired faster than its server rate limit.');
      return;
    }
    const eye = { x: player.transform.position.x, y: player.transform.position.y + (this.original?.profile.eyeHeight??PLAYER_EYE_HEIGHT), z: player.transform.position.z };
    if (distanceSquared(shot.origin, eye) > MAX_ORIGIN_ERROR * MAX_ORIGIN_ERROR) {
      this.error(player, 'invalid_origin', 'Shot origin is too far from the authoritative player position.');
      return;
    }
    const eyeToOrigin = {
      x: shot.origin.x - eye.x,
      y: shot.origin.y - eye.y,
      z: shot.origin.z - eye.z,
    };
    const originDistance = length(eyeToOrigin);
    if (!this.original&&originDistance > COLLISION_EPSILON
      && this.raycast(eye, eyeToOrigin, originDistance, { includeGround: true, minDistance: COLLISION_EPSILON })) {
      this.error(player, 'invalid_origin', 'Shot origin cannot cross solid arena geometry.');
      return;
    }
    if (isExplosiveWeaponId(shot.weapon)) {
      const activeCount = [...this.projectiles.values()]
        .filter((projectile) => projectile.snapshot.attackerId === player.id&&(!projectile.source||[...this.players.values()].some(p=>p.sourceWorld?.projectiles.has(projectile.snapshot.projectileId)))).length;
      if (activeCount >= MAX_ACTIVE_PROJECTILES_PER_PLAYER) {
        this.error(player, 'projectile_limit', 'Too many projectiles are already active.');
        return;
      }
    }

    // RPG saves its chamber before the firing-time reload and overwrites that
    // chamber after launch. All admission checks above remain mutation-free.
    const sourceRpg=this.original&&shot.weapon==='rpg'&&player.sourceCounter!==null;
    if(!sourceRpg)player.ammo[shot.weapon]--;
    player.protectedUntil = now;
    this.expireShots(player, now);
    player.lastShotAt = now;
    if(player.sourceCounter&&!sourceRpg){
      player.sourceCounter.shot(shot.weapon);player.sourceCounterReady=false;player.sourceCounterWeapon=shot.weapon;
    }
    const direction = normalize(shot.direction);

    if (isExplosiveWeaponId(shot.weapon)) {
      const projectileRule = weapon.projectile;
      if (!projectileRule) return;
      player.recentShotIds.set(shot.shotId, now + (this.original?(shot.weapon==='launcher'?59:200)*1000/30:projectileRule.lifetimeMs) + SHOT_LIFETIME_MS);
      const launch=()=>this.spawnProjectile(player, shot as ShotData & { weapon: ExplosiveWeaponId }, direction, weapon, now);
      if(sourceRpg){
        player.sourceCounterReady=false;player.sourceCounterWeapon='rpg';
        const result=originalRpgShot(player.sourceCounter!,player.ammo.rpg,player.reserve.rpg,1,transfer=>{
          player.ammo.rpg=transfer.ammo;player.reserve.rpg=transfer.reserve;
          launch();
        });
        player.ammo.rpg=result.ammo;player.reserve.rpg=result.reserve;
        // The source reload presentation remains active until the final
        // map-specific counter reaches its next ready gate.
        player.reloadWeapon='rpg';this.syncSourceReload(player);
      }else launch();
      return;
    }

    // Source grenade/rocket launch messages do not call baddies.shoot.
    if(this.original){player.sourceMotionTime=shootOriginalSoldierPhase();this.recordSourcePose(player,now);}
    while (player.pendingShots.size >= MAX_PENDING_SHOTS) {
      const oldest = player.pendingShots.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      player.pendingShots.delete(oldest);
    }
    const targetPaths = new Map<string, readonly Vec3[]>();
    const targetPoses=new Map<string,readonly SourcePose[]>();
    const protectedTargetIds = new Set<string>();
    const visiblePoses=player.sourceRemoteView?.freeze();
    const sourceOccluderPoses:readonly SourcePose[]=player.sourceRemoteView?.freezeCorpses().map(pose=>({
      receivedAt:now,position:{...pose.position},yaw:pose.yaw-Math.PI,motionTime:pose.motionTime,deathBon:pose.deathBon,
    }))??[];
    // A retained missing actor still occludes source rays until its own
    // timeout. It cannot receive damage without a live connected room owner.
    if(visiblePoses)for(const pose of visiblePoses)if(pose.id!==player.id){
      targetPaths.set(pose.id,[{...pose.position}]);
      targetPoses.set(pose.id,[{receivedAt:now,position:{...pose.position},yaw:pose.yaw-Math.PI,motionTime:pose.motionTime}]);
    }
    for (const target of this.players.values()) {
      if (target.peer !== null && target.id !== player.id && target.alive) {
        if(visiblePoses){
          const pose=visiblePoses.find(p=>p.id===target.id&&p.alive);
          if(!pose)continue;
          targetPaths.set(target.id,[{...pose.position}]);
          targetPoses.set(target.id,[{receivedAt:now,position:{...pose.position},yaw:pose.yaw-Math.PI,motionTime:pose.motionTime}]);
        }else{
          targetPaths.set(target.id, this.rewindPath(target, now));
          if(this.original)targetPoses.set(target.id,this.rewindSourcePoses(target,now));
        }
        if (!this.original&&now < target.protectedUntil) protectedTargetIds.add(target.id);
      }
    }
    if (!isHitscanWeaponId(shot.weapon)) return;
    const cleanShot: HitscanShotData = {
      shotId: shot.shotId,
      // Network adapter: source rays originate at the authoritative eye. A
      // bounded stale/predicted client eye is validation input only, so its
      // straight chord to the current eye cannot authorize or block a shot.
      origin: cloneVec3(this.original?eye:shot.origin),
      direction: cloneVec3(shot.direction),
      weapon: shot.weapon,
    };
    const registered: RegisteredShot = {
      shot: cleanShot,
      direction,
      registeredAt: now,
      targetPaths,
      targetPoses,
      sourceOccluderPoses,
      sourceProjectileOccluders:this.captureSourceProjectilePoses(player),
      sourceRay:this.original?this.freezeSourceRay(player):undefined,
      protectedTargetIds,
      consumed: false,
    };
    if(this.original&&this.sourceShotIntersectsKnownModel(registered)){
      const next=player.sourcePendingShots+getOriginalHitscan(this.map,shot.weapon)!.rays;
      if(!Number.isSafeInteger(next)||next>MAX_ORIGINAL_REMOTE_SHOTS){
        this.error(player,'source_view_resync_required','Source shot report exceeded its transport bound.');
        this.disconnectSourceView(player,now);return;
      }
      player.sourcePendingShots=next;
    }
    player.pendingShots.set(shot.shotId, registered);
    player.recentShotIds.set(shot.shotId, now + SHOT_LIFETIME_MS);
    this.broadcastEvent({ type: 'shot', serverTime: now, data: { playerId: player.id, shot: registered.shot } });
  }

  /** Positive intersections in the reconstructed bullet population only.
   * Native model/primitive query equivalence, local view-model membership and finite bounds remain adapters;
   * an empty result is not an attestation of a native Director empty query. */
  private sourceShotIntersectsKnownModel(registered:RegisteredShot):boolean {
    const range=getOriginalHitscan(this.map,registered.shot.weapon)!.range;
    if((registered.sourceRay??((origin,direction,max,options)=>this.raycastBulletWorld(origin,direction,max,options,registered.sourceProjectileOccluders)))(registered.shot.origin,registered.direction,range,{
      includeGround:true,
      excludeModel:(name:string)=>originalBulletExcludesModel(this.map,name),
    }))return true;
    for(const poses of registered.targetPoses.values()){
      const hit=this.rayHitSourcePoses(registered.shot.origin,registered.direction,poses);
      if(hit&&hit.distance<=range)return true;
    }
    const corpse=this.rayHitSourcePoses(registered.shot.origin,registered.direction,registered.sourceOccluderPoses);
    return !!corpse&&corpse.distance<=range;
  }

  private validShot(value: unknown): value is ShotData {
    if (!value || typeof value !== 'object') return false;
    const shot = value as Partial<ShotData>;
    if (typeof shot.shotId !== 'string' || shot.shotId.length < 1 || shot.shotId.length > 64) return false;
    if (!isFiniteVec3(shot.origin) || !isFiniteVec3(shot.direction) || !isWeaponId(shot.weapon)) return false;
    if(shot.rg6Jump!==undefined && (!shot.rg6Jump || typeof shot.rg6Jump!=='object'
      || typeof shot.rg6Jump.forward!=='boolean' || typeof shot.rg6Jump.jump!=='boolean')) return false;
    if(shot.sourceRotation!==undefined&&!originalProjectileRotationMatchesDirection(shot.sourceRotation,shot.direction))return false;
    const directionLength = length(shot.direction);
    return directionLength >= 0.75 && directionLength <= 1.25;
  }

  private handleReload(player: RoomPlayer, weapon: unknown, now: number, sourceSortAfterReload?:unknown): void {
    if(sourceSortAfterReload!==undefined&&typeof sourceSortAfterReload!=='boolean'){this.error(player,'invalid_reload','Source reload sort intent must be boolean.');return;}
    if (!player.alive || this.state !== 'playing') return;
    if (!isWeaponId(weapon) || weapon !== player.transform.weapon) {
      this.error(player, 'invalid_reload', 'Reload requests must match the equipped weapon.');
      return;
    }
    if(this.original){
      if(player.transform.typing){this.error(player,'invalid_reload','Source weapon input is disabled while typing.');return;}
      this.startOriginalReload(player,weapon,now,true,true,sourceSortAfterReload===true);
      return;
    }
    if (player.reloadWeapon !== null) {
      this.error(player, 'reload_in_progress', 'The current weapon is already reloading.');
      return;
    }
    const rule = WEAPONS[weapon];
    if (player.ammo[weapon] >= weaponReloadTarget(this.winter ? 'winter' : this.map, weapon, rule.magazine)) {
      this.error(player, 'magazine_full', 'This magazine is already full.');
      return;
    }
    if (player.reserve[weapon] <= 0) {
      this.error(player, 'no_reserve', 'No reserve ammunition remains for this weapon.');
      return;
    }
    // Publisher scripts change chamber/reserve counts before their wait timer.
    // The archival Winter rules retain completion-time transfer.
    if(usesImmediateReload(this.winter ? 'winter' : this.map))this.transferReloadAmmo(player,weapon);
    player.reloadWeapon = weapon;
    player.reloadCompleteAt = now + weaponReloadDuration(this.winter ? 'winter' : this.map,weapon,rule.reloadMs/1000)*1000;
  }

  private startOriginalReload(player:RoomPlayer,weapon:WeaponId,now:number,insideGun=false,advanceCounter=true,sortAfterReload=false):boolean {
    const transfer=originalReloadTransfer(player.ammo[weapon],player.reserve[weapon],weaponReloadTarget(this.map,weapon,WEAPONS[weapon].magazine));
    if(!transfer.canReload){
      const selected=originalFirstUsableWeapon(player.ammo,player.reserve);
      player.sourceUnarmed=selected===undefined;
      if(selected!==undefined){player.transform.weapon=selected;player.sourceDisplayedWeapon=selected;}
      else if(sortAfterReload)player.sourceDisplayedWeapon=null;
      player.sourceCounterReady=false;player.sourceCounterWeapon=selected??null;
      if(player.sourceUnarmed){player.reloadWeapon=null;player.reloadCompleteAt=null;}else this.syncSourceReload(player);
      return false;
    }
    player.sourceUnarmed=false;player.sourceDisplayedWeapon=weapon;
    player.ammo[weapon]=transfer.ammo;player.reserve[weapon]=transfer.reserve;
    if(advanceCounter)this.advanceSourceCounter(player,now);
    if(insideGun)player.sourceCounter!.step(weapon,{reload:true});else player.sourceCounter!.reload();
    player.sourceCounterReady=false;player.sourceCounterWeapon=weapon;
    // Successful reload presentation is separate from ordinary firing cadence.
    player.reloadWeapon=weapon;this.syncSourceReload(player);
    return true;
  }

  private advanceSourceCounter(player:RoomPlayer,now:number):void {
    const counter=player.sourceCounter;if(!counter)return;
    const frameMs=1000/30,callbacks=Math.max(0,Math.floor((now-player.sourceCounterUpdatedAt)/frameMs+1e-8));
    if(callbacks===0)return;
    // All six gates settle in <256 idle callbacks. Further idle Woodland
    // negative waits cannot affect a subsequent shot/reload assignment; Barrack
    // counters stop incrementing once their selected gate remains ready.
    for(let i=0;i<Math.min(callbacks,256);i++){
      const weapon=player.sourceUnarmed?null:player.transform.weapon;
      player.sourceCounterReady=counter.step(weapon,{inputEnabled:!player.transform.typing});
      player.sourceCounterWeapon=weapon;
      // gun() reloads an empty RPG at a ready gate even with no held trigger.
      // The saved bullets remain zero for that callback, so it cannot launch.
      if(player.alive&&player.peer!==null&&player.sourceCounterReady&&weapon==='rpg'&&player.ammo.rpg===0){
        const callbackTime=player.sourceCounterUpdatedAt+(i+1)*frameMs;
        if(this.startOriginalReload(player,'rpg',callbackTime,false,false))player.sourceAutoReloadTime=callbackTime;
      }
    }
    player.sourceCounterUpdatedAt+=callbacks*frameMs;
  }

  private syncSourceReload(player:RoomPlayer):void {
    if(!player.sourceCounter||player.reloadWeapon===null)return;
    if(player.sourceUnarmed||(player.sourceCounterReady&&player.sourceCounterWeapon===player.transform.weapon)){
      player.reloadWeapon=null;player.reloadCompleteAt=null;return;
    }
    player.reloadWeapon=player.transform.weapon;
    player.reloadCompleteAt=player.sourceCounterUpdatedAt+player.sourceCounter.framesUntilReady(player.transform.weapon)*1000/30;
  }

  private finishReload(player: RoomPlayer, now: number): boolean {
    if(this.original){
      const active=player.reloadWeapon!==null,ammo=player.ammo.rpg,reserve=player.reserve.rpg,unarmed=player.sourceUnarmed,equipped=player.transform.weapon;
      this.advanceSourceCounter(player,now);this.syncSourceReload(player);
      // Publish autonomous empty-RPG transfers as well as completed locks.
      return (active&&player.reloadWeapon===null)||ammo!==player.ammo.rpg||reserve!==player.reserve.rpg||unarmed!==player.sourceUnarmed||equipped!==player.transform.weapon;
    }
    if (player.reloadWeapon === null || player.reloadCompleteAt === null || now < player.reloadCompleteAt) return false;
    const weapon = player.reloadWeapon;
    if(!usesImmediateReload(this.winter ? 'winter' : this.map))this.transferReloadAmmo(player,weapon);
    player.reloadWeapon = null;
    player.reloadCompleteAt = null;
    return true;
  }

  private transferReloadAmmo(player:RoomPlayer,weapon:WeaponId):void {
    const needed = Math.max(0, weaponReloadTarget(this.winter ? 'winter' : this.map, weapon, WEAPONS[weapon].magazine) - player.ammo[weapon]);
    const moved = Math.min(needed, player.reserve[weapon]);
    player.ammo[weapon] += moved;
    player.reserve[weapon] -= moved;
  }

  private spawnProjectile(
    player: RoomPlayer,
    shot: ShotData & { weapon: ExplosiveWeaponId },
    direction: Vec3,
    weapon: WeaponRule,
    now: number,
  ): void {
    const rule = weapon.projectile;
    if (!rule) return;
    const projectileId = `${this.id}-projectile-${++this.projectileSequence}`;
    if(this.original){
      const sourceEye={...player.transform.position,y:player.transform.position.y+this.original.profile.eyeHeight};
      const source=createOriginalProjectile(shot.weapon,sourceEye,direction,player.id,shot.sourceRotation);
      const snapshot:ProjectileSnapshot={projectileId,shotId:shot.shotId,attackerId:player.id,attackerName:player.name,weapon:shot.weapon,position:cloneVec3(source.position),velocity:cloneVec3(source.velocity),direction:cloneVec3(source.direction),...(source.sourceRotation?{sourceRotation:cloneVec3(source.sourceRotation)}:{}),...this.sourceAngularSnapshot(source),remainingCallbacks:source.remainingCallbacks,expiresAt:now+(shot.weapon==='launcher'?59:200)*1000/30};
      // Weaponry creates the owner's local actor before sending MUS; that
      // birth does not depend on the success of the owner's transport.
      this.projectiles.set(projectileId,{snapshot,source,sourceReceivers:new Set([player]),sourceBirthSequence:this.projectileSequence,sourceLaunchName:player.name,updatedAt:now,gravity:0,radius:250*ORIGINAL_MAP_SCALE,damage:5,rg6JumpEligible:false});
      this.ensureSourceWorld(player,now).projectiles.set(projectileId,this.cloneSourceActor(this.projectiles.get(projectileId)!));
      this.broadcastEvent({type:'projectile_spawned',serverTime:now,data:{projectile:this.cloneProjectile(snapshot),launchSoundPosition:cloneVec3(sourceEye)}});return;
    }
    const spawnPosition = {
      x: shot.origin.x + direction.x * PROJECTILE_SPAWN_CLEARANCE,
      y: shot.origin.y + direction.y * PROJECTILE_SPAWN_CLEARANCE,
      z: shot.origin.z + direction.z * PROJECTILE_SPAWN_CLEARANCE,
    };
    const snapshot: ProjectileSnapshot = {
      projectileId,
      shotId: shot.shotId,
      attackerId: player.id,
      weapon: shot.weapon,
      position: spawnPosition,
      velocity: {
        x: direction.x * rule.speed,
        y: direction.y * rule.speed,
        z: direction.z * rule.speed,
      },
      expiresAt: now + rule.lifetimeMs,
    };
    const active: ActiveProjectile = {
      snapshot,
      updatedAt: now,
      gravity: rule.gravity,
      radius: rule.radius,
      damage: weapon.damage,
      rg6JumpEligible: !this.winter && rg6JumpLaunchEligible(shot.weapon,direction,shot.rg6Jump),
    };
    this.broadcastEvent({
      type: 'projectile_spawned',
      serverTime: now,
      data: { projectile: this.cloneProjectile(snapshot) },
    });

    const clearanceImpact = this.projectileImpact(shot.origin, spawnPosition, player.id);
    if (clearanceImpact) {
      active.snapshot.position = clearanceImpact;
      this.detonate(active, now);
      return;
    }
    this.projectiles.set(projectileId, active);
  }

  private updateProjectiles(now: number): void {
    for (const active of [...this.projectiles.values()]) {
      const projectileId = active.snapshot.projectileId;
      if (!this.projectiles.has(projectileId)) continue;
      if(active.source){continue;}
      const endTime = Math.min(now, active.snapshot.expiresAt);
      while (active.updatedAt < endTime && this.projectiles.has(projectileId)) {
        const stepTime = Math.min(endTime, active.updatedAt + PROJECTILE_STEP_MS);
        const elapsed = (stepTime - active.updatedAt) / 1_000;
        const start = cloneVec3(active.snapshot.position);
        active.snapshot.velocity.y -= active.gravity * elapsed;
        const end = {
          x: start.x + active.snapshot.velocity.x * elapsed,
          y: start.y + active.snapshot.velocity.y * elapsed,
          z: start.z + active.snapshot.velocity.z * elapsed,
        };
        const impact = this.projectileImpact(start, end, active.snapshot.attackerId);
        active.updatedAt = stepTime;
        active.snapshot.position = impact ?? end;
        if (impact) this.detonate(active, stepTime);
      }
      if (this.projectiles.has(projectileId) && now >= active.snapshot.expiresAt) {
        this.detonate(active, active.snapshot.expiresAt);
      }
    }
  }

  private hasSourceAuthority():boolean {
    return Boolean(this.original&&[...this.players.values()].some(player=>player.alive&&player.peer!==null&&player.sourceBody!==null));
  }

  /** The shared authority adapter advances its local-player proxies together.
   * Each recovered observer world has one goody, controlled after physics and
   * before projectile actor counters. Snapshot velocity is the wall-clock
   * derivative; the shared rigid bodies retain physics units. */
  private diagnostic(entry:Record<string,unknown>):void {
    try{this.sourceViewDiagnostics?.({room:this.id,map:this.map,...entry});}catch{/* Diagnostics must not affect gameplay. */}
  }

  private updateSourceWorld(now:number):void {
    if(!this.sourceViewDiagnostics){this.updateSourceWorldImpl(now);return;}
    const startedAt=this.diagnosticNow(),before=this.sourceWorldUpdatedAt??this.sourceHealthUpdatedAt;
    this.sourceWorldDiagnosticCallbacks=0;
    try{this.updateSourceWorldImpl(now);}finally{
      const endedAt=this.diagnosticNow(),callbacks=this.sourceWorldDiagnosticCallbacks;
      const work={kind:'source-world-work',trustedNow:now,processingStartedAt:startedAt,processingEndedAt:endedAt,durationMs:endedAt-startedAt,callbacks,
        worldTimeBefore:before,worldTimeAfter:this.sourceWorldUpdatedAt??this.sourceHealthUpdatedAt,players:this.connectedSize,
        sourceBodies:[...this.players.values()].filter(p=>p.peer!==null&&p.sourceBody!==null).length};
      if(callbacks>0)this.lastSourceWorldWork=work;
      if(callbacks>3||endedAt-startedAt>=100)this.diagnostic(work);
    }
  }

  private updateSourceWorldImpl(now:number):void {
    if(!this.original)return;
    if(this.sourceHealthUpdatedAt===null)this.sourceHealthUpdatedAt=now;
    const interval=1000/30;
    // Clock adapter: server callbacks use the last acknowledged baddy mirror;
    // mirror receipt replay remains exclusively driven by validated traces.
    while(this.sourceHealthUpdatedAt+interval<=now+1e-7&&this.state==='playing'){
      const time=this.sourceHealthUpdatedAt+=interval;this.sourceWorldUpdatedAt=time;
      if(this.sourceViewDiagnostics)this.sourceWorldDiagnosticCallbacks++;
      const actors=[...this.players.values()].filter(p=>p.alive&&p.peer!==null);
      const eyes=new Map(actors.map(player=>[player,this.sourceObserverEyes(player)]));
      const due=new Map<RoomPlayer,{world:SourceObserverWorld;active:ActiveProjectile[]}>();
      for(const player of actors){
        if(!player.alive||player.peer===null)continue;
        const world=this.ensureSourceWorld(player,time-interval);
        if(world.updatedAt>=time-1e-7)continue;
        world.updatedAt=time;
        if(player.sourceBody)world.body=player.sourceBody;
        const geometry=this.geometryFor(player)!;
        this.advanceSourceDoors(world,time);
        const active=[...world.projectiles.values()].filter(p=>p.source&&p.updatedAt<time-1e-7);
        due.set(player,{world,active});
        let contact:ActiveProjectile|undefined;
        stepOriginalPhysicsWorld([world.body],active.map(p=>p.source!),{
          playerPairContacts:false,movableBodies:world.barrels.bodies,contactDistance:ORIGINAL_COLLISION_CONTACT_DISTANCE,
          ...(typeof geometry.contactsSphere==='function'&&typeof geometry.contactsConvex==='function'?{
            contactsSphere:(position:Vec3,radius:number)=>geometry.contactsSphere(position,radius,ORIGINAL_COLLISION_CONTACT_DISTANCE),
            contactsConvex:(position:Vec3,shape:OriginalConvexPolytope)=>geometry.contactsConvex(position,shape,ORIGINAL_COLLISION_CONTACT_DISTANCE)}:{}),
          sweep:(from,to,radius)=>geometry.sweepSphere(from,to,radius,ORIGINAL_COLLISION_CONTACT_DISTANCE),
          sweepConvex:(from,to,shape,surfaceVelocity)=>geometry.sweepConvex(from,to,shape,ORIGINAL_COLLISION_CONTACT_DISTANCE,surfaceVelocity),memoizePureSweep:true,
          onProjectileContact:(state,event)=>{if(event.body?.id===player.id)contact=active.find(p=>p.source===state);},
          onPlayerContact:(body,_normal,otherId)=>{if(!player.sourceBody&&world.barrels.bodies.some(b=>b.id===otherId))this.authorizeSourceContact(player.id,this.sourceBodyVelocity(body),time);},
        });
        const control=applyOriginalPlayerMovementControls(world.body,player.sourceInput??{yaw:player.transform.yaw,pitch:player.transform.pitch,typing:true},player.transform.movementMode);
        if(player.sourceBody){const eye=originalPlayerEye(world.body);player.transform.position={...eye,y:eye.y-this.original.profile.eyeHeight};player.transform.velocity=this.sourceBodyVelocity(world.body);player.transform.grounded=control.grounded&&!control.jumped;this.recordPosition(player,time,false);}
        else if(contact)this.authorizeSourceContact(player.id,this.sourceBodyVelocity(world.body),time);
        if(contact)this.sendSourceViewMessage(player,{type:'event',event:{type:'projectile_contact',serverTime:time,data:{playerId:player.id,projectileId:contact.snapshot.projectileId,velocity:{...player.transform.velocity}}}});
      }
      this.stepSourceMotion(time);this.stepSourceHealth();
      for(const [player,{world,active}] of due){
        if(!player.alive||player.peer===null||player.sourceWorld!==world)continue;
        for(const projectile of active){
          if(!player.alive||player.peer===null||player.sourceWorld!==world)break;
          projectile.updatedAt=time;const state=projectile.source!;
          const result=stepOriginalProjectileActor(state,{eyes:eyes.get(player)!.filter(p=>projectile.sourceLaunchName===undefined||!originalAsciiNamesEqual(player.sourceActorNames.get(p.id)??'',projectile.sourceLaunchName)),localEye:originalPlayerEye(world.body)});
          projectile.snapshot.position={...state.position};projectile.snapshot.velocity={...state.velocity};projectile.snapshot.remainingCallbacks=state.remainingCallbacks;Object.assign(projectile.snapshot,this.sourceAngularSnapshot(state));
          if(result.detonated)this.detonateSourceFor(player,projectile,time);
        }
      }
      for(const player of actors)if(player.alive&&player.peer!==null)this.stepSourceObserverBlasts(player,time);
    }
    // Catalog stores launch admission only, never canonical evolving physics.
    for(const [id,actor] of this.projectiles)if(actor.source&&now>actor.snapshot.expiresAt+16*interval){
      const live=[...this.players.values()].some(p=>p.sourceWorld?.projectiles.has(id)||p.sourceWorld?.blasts.has(id));
      if(!live)this.projectiles.delete(id);
    }
  }
  private createSourceLegacyContactBody(player:RoomPlayer):OriginalPlayerBody {
    return createOriginalPlayerBody(player.id,{...player.transform.position,y:player.transform.position.y+this.original!.profile.eyeHeight},{x:player.transform.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:player.transform.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:player.transform.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR});
  }
  private sourceBodyVelocity(body:OriginalPlayerBody):Vec3 {return {x:body.velocity.x*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:body.velocity.y*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:body.velocity.z*ORIGINAL_PLAYER_DERIVATIVE_FACTOR};}
  private sourceObserverEyes(player:RoomPlayer):Array<{id:string;position:Vec3}> {
    const poses=player.sourceRemoteView?.freeze()??[...player.sourceLegacyViewTargets.values()];
    return poses.map(p=>({id:p.id,position:{...p.position,y:p.position.y+this.original!.profile.eyeHeight}}));
  }
  private detonateSourceFor(player:RoomPlayer,active:ActiveProjectile,now:number):void {
    const world=player.sourceWorld;if(!world||!world.projectiles.delete(active.snapshot.projectileId))return;
    const p=active.snapshot;
    world.blasts.set(p.projectileId,{state:createOriginalBlast(p.position,p.attackerId,p.weapon),updatedAt:now,sourceLaunchName:active.sourceLaunchName,
      snapshot:{projectileId:p.projectileId,shotId:p.shotId,attackerId:p.attackerId,...(p.attackerName!==undefined?{attackerName:p.attackerName}:{}),weapon:p.weapon,position:{...p.position},remainingCallbacks:16,expiresAt:now+16*1000/30}});
    this.sendSourceViewMessage(player,{type:'event',event:{type:'explosion',serverTime:now,data:{projectileId:p.projectileId,shotId:p.shotId,attackerId:p.attackerId,...(p.attackerName!==undefined?{attackerName:p.attackerName}:{}),weapon:p.weapon,position:{...p.position},radius:250*ORIGINAL_MAP_SCALE,remainingCallbacks:16}}});
  }
  private stepSourceObserverBlasts(player:RoomPlayer,now:number):void {
    const world=player.sourceWorld;if(!world)return;
    for(const [id,blast] of [...world.blasts]){
      if(!player.alive||player.peer===null||player.sourceWorld!==world)return;
      if(blast.updatedAt>=now-1e-7)continue;blast.updatedAt=now;
      const result=stepOriginalBlast(blast.state,[{id:player.id,position:originalPlayerEye(world.body)}]);
      if(result.damagedPlayerIds.includes(player.id)){
        const attacker=this.players.get(blast.snapshot.attackerId),attackerName=blast.snapshot.attackerName;
        const source:DamageSource={kind:'explosion',shotId:blast.snapshot.shotId,projectileId:id,weapon:blast.snapshot.weapon,position:{...blast.snapshot.position},...(attackerName!==undefined?{attackerName}:{})};
        const lethal=this.applyDamage(player,5);
        this.broadcastEvent({type:'damaged',serverTime:now,data:{attackerId:blast.snapshot.attackerId,targetId:player.id,damage:5,health:player.health,source,...this.sourceDamageState(player,lethal)}});
        if(lethal)this.kill(attacker,player,source,now,false,{id:blast.snapshot.attackerId,name:attackerName});
      }
      blast.snapshot.remainingCallbacks=blast.state.remainingCallbacks;if(result.expired)world.blasts.delete(id);
    }
  }

  private authorizeSourceContact(playerId:string,velocity:Vec3,now:number):boolean {
    const player=this.players.get(playerId);if(!player||!player.alive||!isFiniteVec3(velocity))return false;
    const change=distanceSquared(velocity,player.transform.velocity);if(change<1e-12)return false;
    player.authorizedBoost={originY:player.transform.position.y,velocityY:Math.max(0,velocity.y),issuedAt:now,budgetUpdatedAt:now,verticalBudget:.6,ascentObserved:false,contactVelocity:cloneVec3(velocity)};
    player.airborneOriginY=player.transform.position.y;player.airbornePositiveRise=0;player.airborneHorizontalDistance=0;player.airborneDescending=velocity.y<0;
    player.transform.velocity=cloneVec3(velocity);if(velocity.y>0)player.transform.grounded=false;
    // The callback publishes only the final contact velocity per player.
    // Intermediate substeps update body state for subsequent contacts.
    return true;
  }

  private updateSourceBlasts(now:number):void {
    for(const [id,blast] of this.sourceBlasts) {
      if(blast.updatedAt<now-1e-7&&this.sourceBlasts.has(id)&&this.state==='playing') {
        blast.updatedAt=now;
        const result=stepOriginalBlast(blast.state,[...this.players.values()].filter(p=>p.alive&&p.peer!==null).map(p=>({id:p.id,position:{...p.transform.position,y:p.transform.position.y+PLAYER_EYE_HEIGHT}})));
        const attacker=this.players.get(blast.snapshot.attackerId);
        const attackerName=blast.snapshot.attackerName??attacker?.name;
        const source:DamageSource={kind:'explosion',shotId:blast.snapshot.shotId,projectileId:id,weapon:blast.snapshot.weapon,position:cloneVec3(blast.snapshot.position),...(attackerName!==undefined?{attackerName}:{})};
        for(const victimId of result.damagedPlayerIds) {
          const target=this.players.get(victimId);
          if(!target||!target.alive||target.peer===null||!this.sourceExplosiveReceivers(blast).has(target))continue;
          const lethal=this.applyDamage(target,5);
          this.broadcastEvent({type:'damaged',serverTime:blast.updatedAt,data:{attackerId:blast.snapshot.attackerId,targetId:target.id,damage:5,health:target.health,source,...this.sourceDamageState(target,lethal)}});
          if(lethal)this.kill(attacker,target,source,blast.updatedAt,false,{id:blast.snapshot.attackerId,name:attackerName});
        }
        blast.snapshot.remainingCallbacks=blast.state.remainingCallbacks;
        if(result.expired)this.sourceBlasts.delete(id);
      }
    }
  }

  private projectileImpact(start: Vec3, end: Vec3, ownerId: string): Vec3 | null {
    const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
    const segmentLength = length(delta);
    if (segmentLength < 1e-8) return null;
    const direction = normalize(delta);
    const worldHit = this.raycast(start, direction, segmentLength, { includeGround: true });
    let nearestDistance = worldHit?.distance ?? Infinity;

    for (const target of this.players.values()) {
      if (target.peer === null || target.id === ownerId || !target.alive) continue;
      const hit = this.rayHitPlayerPath(start, direction, [target.transform.position]);
      if (hit && hit.distance <= segmentLength && hit.distance < nearestDistance) {
        nearestDistance = hit.distance;
      }
    }
    if (!Number.isFinite(nearestDistance)) return null;
    return {
      x: start.x + direction.x * nearestDistance,
      y: start.y + direction.y * nearestDistance,
      z: start.z + direction.z * nearestDistance,
    };
  }

  private detonate(active: ActiveProjectile, now: number): void {
    const projectile = active.snapshot;
    this.projectiles.delete(projectile.projectileId);
    if(active.source){
      // Explicit private diagnostic fixture adapter: production source stepping
      // calls detonateSourceFor directly and never this global method.
      for(const player of this.players.values()){
        const copy=player.sourceWorld?.projectiles.get(projectile.projectileId);
        if(copy){copy.snapshot.position={...projectile.position};this.detonateSourceFor(player,copy,now);}
      }
      return;
    }
    const position = cloneVec3(projectile.position);
    this.broadcastEvent({
      type: 'explosion',
      serverTime: now,
      data: {
        projectileId: projectile.projectileId,
        shotId: projectile.shotId,
        attackerId: projectile.attackerId,
        weapon: projectile.weapon,
        position: cloneVec3(position),
        radius: active.radius,
      },
    });

    const attacker = this.players.get(projectile.attackerId);
    if (!attacker) return;
    const source: DamageSource = {
      kind: 'explosion',
      shotId: projectile.shotId,
      projectileId: projectile.projectileId,
      weapon: projectile.weapon,
      position: cloneVec3(position),
    };
    const damagePlan: Array<{ target: RoomPlayer; damage: number }> = [];
    for (const target of this.players.values()) {
      if (target.peer === null || !target.alive || now < target.protectedUntil) continue;
      const self = target.id === attacker.id;
      const targetPoint = {
        x: target.transform.position.x,
        y: target.transform.position.y + (self ? PLAYER_EYE_HEIGHT : BODY_CENTER_Y),
        z: target.transform.position.z,
      };
      const blastRadius = self ? active.radius * SELF_RADIUS_SCALE : active.radius;
      const distance = Math.sqrt(distanceSquared(position, targetPoint));
      if (distance >= blastRadius) continue;
      if (!this.lineOfSight(position, targetPoint, { minDistance: BLAST_LINE_OF_SIGHT_EPSILON })) continue;
      const scale = self
        ? (1 - distance / blastRadius) * SELF_DAMAGE_SCALE
        : 1 - BLAST_FALLOFF * distance / blastRadius;
      const damage = Math.max(0, Math.round(active.damage * scale));
      if (damage > 0) damagePlan.push({ target, damage });
    }

    const killed: RoomPlayer[] = [];
    for (const { target, damage } of damagePlan) {
      if (!target.alive) continue;
      const lethal=this.applyDamage(target, damage);
      this.broadcastEvent({
        type: 'damaged',
        serverTime: now,
        data: {
          attackerId: attacker.id,
          targetId: target.id,
          damage,
          health: target.health,
          source,
        },
      });
      if (lethal) killed.push(target);
    }
    for (const target of killed) this.kill(attacker, target, source, now, target.id !== attacker.id);
    this.finishIfWinner(attacker, now);
    if(active.rg6JumpEligible && attacker.alive && attacker.peer!==null && this.state==='playing'
      && rg6JumpBlastEligible(attacker.transform.position,position)
      && this.lineOfSight(position,{...attacker.transform.position,y:attacker.transform.position.y+PLAYER_EYE_HEIGHT},
        {minDistance:BLAST_LINE_OF_SIGHT_EPSILON})) {
      const prior=attacker.authorizedBoost;
      const current=prior ? Math.min(attacker.transform.velocity.y,prior.velocityY-CLIENT_GRAVITY*Math.max(0,(now-prior.issuedAt)/1000))
        : attacker.transform.velocity.y;
      const velocityY=rg6JumpVelocity(current);
      attacker.authorizedBoost={originY:attacker.transform.position.y,velocityY,issuedAt:now,budgetUpdatedAt:now,verticalBudget:.6,ascentObserved:false};
      attacker.airborneOriginY=attacker.transform.position.y;
      attacker.airbornePositiveRise=0;
      attacker.airborneHorizontalDistance=0;
      attacker.airborneDescending=false;
      attacker.transform.grounded=false;
      attacker.transform.velocity.y=velocityY;
      this.broadcastEvent({type:'rg6_boost',serverTime:now,data:{playerId:attacker.id,projectileId:projectile.projectileId,velocityY}});
    }
  }

  private handleHit(attacker: RoomPlayer, hit: unknown, now: number): void {
    if (!attacker.alive || this.state !== 'playing' || !this.validHit(hit)) return;
    const registered = attacker.pendingShots.get(hit.shotId);
    if (!registered || registered.consumed || now - registered.registeredAt > SHOT_LIFETIME_MS) return;
    const target = this.players.get(hit.targetId);
    if (!target || target.peer === null || target.id === attacker.id || !target.alive || (!this.original&&now < target.protectedUntil)) return;
    const sampledPath = registered.targetPaths.get(target.id);
    if (!sampledPath || registered.protectedTargetIds.has(target.id)) return;

    const rayHit = this.original?this.rayHitSourcePoses(registered.shot.origin,registered.direction,registered.targetPoses.get(target.id)??[]):this.rayHitPlayerPath(registered.shot.origin, registered.direction, sampledPath);
    const weapon = WEAPONS[registered.shot.weapon];
    const originalHitscan=this.original?getOriginalHitscan(this.map,registered.shot.weapon):undefined;
    if (!rayHit || rayHit.distance > (originalHitscan?.range??weapon.range)) return;
    const arenaHit = (registered.sourceRay??((origin,direction,max,options)=>this.raycastBulletWorld(origin,direction,max,options,registered.sourceProjectileOccluders)))(registered.shot.origin, registered.direction, rayHit.distance, {
      includeGround: true,
      ...(this.original?{excludeModel:(name:string)=>originalBulletExcludesModel(this.map,name)}:{}),
      minDistance: this.original?0:BLAST_LINE_OF_SIGHT_EPSILON,
    });
    if (arenaHit && arenaHit.distance <= rayHit.distance) return;
    if(this.original){
      const corpseHit=this.rayHitSourcePoses(registered.shot.origin,registered.direction,registered.sourceOccluderPoses);
      if(corpseHit&&corpseHit.distance<rayHit.distance)return;
    }
    for (const [candidateId, candidatePath] of registered.targetPaths) {
      if (candidateId === target.id) continue;
      const candidateHit = this.original?this.rayHitSourcePoses(registered.shot.origin,registered.direction,registered.targetPoses.get(candidateId)??[]):this.rayHitPlayerPath(registered.shot.origin, registered.direction, candidatePath);
      if (candidateHit && candidateHit.distance < rayHit.distance) return;
    }

    registered.consumed = true;
    const damage = originalHitscan?.damage??Math.round(weapon.damage * (rayHit.zone === 'head' ? weapon.headMultiplier : 1));
    const impact = {
      x: registered.shot.origin.x + registered.direction.x * rayHit.distance,
      y: registered.shot.origin.y + registered.direction.y * rayHit.distance,
      z: registered.shot.origin.z + registered.direction.z * rayHit.distance,
    };
    const source: DamageSource = {
      kind: 'hitscan',
      shotId: hit.shotId,
      weapon: registered.shot.weapon,
      zone: rayHit.zone,
      position: impact,
    };
    const lethal=this.applyDamage(target, damage);
    this.broadcastEvent({
      type: 'damaged',
      serverTime: now,
      data: { attackerId: attacker.id, targetId: target.id, damage, health: target.health, source,...this.sourceDamageState(target,lethal) },
    });
    if (lethal) {
      this.kill(attacker, target, source, now, true);
      this.finishIfWinner(attacker, now);
    }
  }

  private validHit(value: unknown): value is HitData {
    if (!value || typeof value !== 'object') return false;
    const hit = value as Partial<HitData>;
    if (typeof hit.shotId !== 'string' || typeof hit.targetId !== 'string') return false;
    if (hit.shotId.length < 1 || hit.shotId.length > 64 || hit.targetId.length < 1 || hit.targetId.length > 128) return false;
    return true;
  }

  private stepSourceMotion(now:number):void {
    for(const player of this.players.values())if(player.peer!==null){
      if(!player.alive){if(player.sourceMotionTime<=3000)player.sourceMotionTime+=8;continue;}
      const position=player.transform.position,previous=player.sourceMotionPosition;
      player.sourceMotionTime=advanceOriginalSoldierPhase(player.sourceMotionTime,Math.hypot(position.x-previous.x,position.y-previous.y,position.z-previous.z));
      player.sourceMotionPosition=cloneVec3(position);
      this.recordSourcePose(player,now);
    }
  }

  private recordSourcePose(player:RoomPlayer,now:number):void {
    const history=player.sourcePoseHistory;
    const receivedAt=Math.max(history.at(-1)?.receivedAt??now,now);
    history.push({receivedAt,position:cloneVec3(player.transform.position),yaw:player.transform.yaw,motionTime:player.sourceMotionTime});
    while(history.length>2&&history[1].receivedAt<=receivedAt-MAX_REWIND_MS)history.shift();
    if(history.length>MAX_POSITION_SAMPLES)history.splice(0,history.length-MAX_POSITION_SAMPLES);
  }

  private rewindSourcePoses(player:RoomPlayer,now:number):readonly SourcePose[] {
    const cutoff=now-MAX_REWIND_MS;
    const poses=player.sourcePoseHistory.filter(pose=>pose.receivedAt>=cutoff);
    // The latest accepted pose remains current when no packet arrived recently.
    if(!poses.length)poses.push({receivedAt:now,position:player.transform.position,yaw:player.transform.yaw,motionTime:player.sourceMotionTime});
    return poses.map(pose=>({...pose,position:cloneVec3(pose.position)}));
  }

  private rayHitSourcePoses(origin:Vec3,direction:Vec3,poses:readonly SourcePose[]):RayHit|null {
    const collision=this.sourceSoldierCollision??=new OriginalSoldierCollision(originalServerSoldierAssets);
    let nearest:RayHit|null=null;
    for(const pose of poses){
      collision.evaluatePose(pose.position,pose.yaw+Math.PI,pose.motionTime,pose.deathBon);
      const hit=collision.intersectRay(origin,direction,10000);
      if(hit&&(!nearest||hit.distance<nearest.distance))nearest={distance:hit.distance,zone:'body'};
    }
    return nearest;
  }

  private rayHitPlayerPath(origin: Vec3, direction: Vec3, feetPath: readonly Vec3[]): RayHit | null {
    const candidates: RayHit[] = [];
    const addVolume = (centerY: number, radius: number, zone: HitZone): void => {
      let distance: number | null = null;
      if (feetPath.length === 1) {
        const feet = feetPath[0];
        distance = intersectSphere(origin, direction, { x: feet.x, y: feet.y + centerY, z: feet.z }, radius);
      } else {
        for (let index = 1; index < feetPath.length; index++) {
          const previous = feetPath[index - 1];
          const current = feetPath[index];
          const segmentDistance = intersectCapsule(
            origin,
            direction,
            { x: previous.x, y: previous.y + centerY, z: previous.z },
            { x: current.x, y: current.y + centerY, z: current.z },
            radius,
          );
          if (segmentDistance !== null && (distance === null || segmentDistance < distance)) distance = segmentDistance;
        }
      }
      if (distance !== null) candidates.push({ distance, zone });
    };

    addVolume(HEAD_CENTER_Y, HEAD_RADIUS, 'head');
    addVolume(BODY_CENTER_Y, BODY_RADIUS, 'body');
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0] ?? null;
  }

  private recordPosition(player: RoomPlayer, now: number,sourcePose=true): void {
    const previous = player.positionHistory.at(-1);
    const receivedAt = previous ? Math.max(previous.receivedAt, now) : now;
    player.positionHistory.push({ receivedAt, position: cloneVec3(player.transform.position) });
    if(this.original&&sourcePose)this.recordSourcePose(player,receivedAt);

    const cutoff = receivedAt - MAX_REWIND_MS;
    while (player.positionHistory.length > 2 && player.positionHistory[1].receivedAt <= cutoff) {
      player.positionHistory.shift();
    }
    if (player.positionHistory.length > MAX_POSITION_SAMPLES) {
      player.positionHistory.splice(0, player.positionHistory.length - MAX_POSITION_SAMPLES);
    }
  }

  /**
   * Builds a bounded path using only transforms the server accepted. The cutoff
   * point is interpolated from server receive times, never from a client clock or
   * the hit point supplied with a later claim.
   */
  private rewindPath(player: RoomPlayer, now: number): readonly Vec3[] {
    const history = player.positionHistory;
    if (history.length === 0) return [cloneVec3(player.transform.position)];
    const cutoff = now - MAX_REWIND_MS;
    const firstRecent = history.findIndex((sample) => sample.receivedAt >= cutoff);
    if (firstRecent < 0) return [cloneVec3(player.transform.position)];

    const path: Vec3[] = [];
    if (firstRecent > 0) {
      const before = history[firstRecent - 1];
      const after = history[firstRecent];
      const elapsed = after.receivedAt - before.receivedAt;
      if (elapsed > 0 && after.receivedAt > cutoff) {
        const amount = Math.max(0, Math.min(1, (cutoff - before.receivedAt) / elapsed));
        path.push({
          x: before.position.x + (after.position.x - before.position.x) * amount,
          y: before.position.y + (after.position.y - before.position.y) * amount,
          z: before.position.z + (after.position.z - before.position.z) * amount,
        });
      }
    }
    for (let index = firstRecent; index < history.length; index++) path.push(cloneVec3(history[index].position));
    if (path.length === 0) path.push(cloneVec3(player.transform.position));
    return path;
  }

  private kill(
    killer: RoomPlayer | undefined,
    victim: RoomPlayer,
    source: DamageSource,
    now: number,
    awardFrag: boolean,
    sourceOwner?:{id:string;name?:string},
  ): void {
    const cancelledReload = victim.reloadWeapon !== null;
    victim.authorizedBoost = null;
    victim.pendingShots.clear();
    // A projectile from this life may still damage others, but must never
    // authorize movement after its owner respawns.
    for(const projectile of this.projectiles.values()) {
      if(projectile.snapshot.attackerId===victim.id) projectile.rg6JumpEligible=false;
    }
    victim.alive = false;
    victim.health = 0;
    if(victim.sourceHealth){victim.sourceHealth.canonical=0;victim.sourceMotionTime=2400;this.recordSourcePose(victim,now);}
    if(this.original){
      // Local goody death exits its world; only observers of an existing
      // remote actor create its gun, through their own accepted recurrence.
      victim.sourceTimeoutDrops.clear();victim.sourceLegacyViewTargets.clear();
      this.clearSourceExplosiveReceipts(victim);
      // A replayed local world cannot restore actors from its terminal world.
      victim.sourceExplosiveCutoff=this.projectileSequence;
    }else{
      const dropId = `drop-${++this.dropSequence}`;
      if (this.drops.size >= 128) this.drops.delete(this.drops.keys().next().value!);
      this.drops.set(dropId,{id:dropId,weapon:victim.transform.weapon,
        position:{...victim.transform.position,y:(this.winter ? victim.transform.position.y : this.supportHeight(victim.transform.position,victim.transform.position.y,victim)??victim.transform.position.y)+.22},
        expiresAt:now+30_000});
    }
    victim.deaths++;
    victim.respawnAt = this.sessionMode==='round' ? now+RESPAWN_DELAY_MS : null;
    victim.transform.velocity = { x: 0, y: 0, z: 0 };
    this.sourceLegacyContactBodies.delete(victim.id);
    victim.reloadWeapon = null;
    victim.reloadCompleteAt = null;
    if (awardFrag&&killer){killer.frags++;if(this.original)killer.score+=ORIGINAL_KILL_SCORE;}
    // MUS dead is delivered by name to each live receiver, excluding the
    // sender's own case-equivalent name. Old ids never authorize a new life.
    const sourceScoreRecipients=sourceOwner?[...this.players.values()].filter(player=>player.peer!==null&&player.alive&&sourceOwner.name!==undefined&&originalAsciiNamesEqual(player.name,sourceOwner.name)&&!originalAsciiNamesEqual(player.name,victim.name)).map(player=>{
      player.frags++;player.score+=ORIGINAL_KILL_SCORE;
      return {playerId:player.id,frags:player.frags,score:player.score};
    }):undefined;
    this.broadcastEvent({
      type: 'killed',
      serverTime: now,
      data: {
        killerId: sourceOwner?.id??killer!.id,
        victimId: victim.id,
        killerFrags: killer?.frags??0,
        ...(this.original?{killerScore:killer?.score??0}:{}),
        ...(sourceScoreRecipients?{sourceScoreRecipients}:{}),
        victimDeaths: victim.deaths,
        source,
      },
    });
    if (cancelledReload) this.sendLoadout(victim, now);
  }

  private finishIfWinner(killer: RoomPlayer, now: number): void {
    if (this.state !== 'playing' || this.sessionMode!=='round') return;
    if (killer.frags >= this.fragLimit) {
      this.state = 'finished';
      this.winnerId = killer.id;
      this.projectiles.clear();
      this.sourceBlasts.clear();
      for(const player of this.players.values()){this.clearSourceExplosiveReceipts(player);player.pendingShots.clear();}
      this.broadcastEvent({ type: 'winner', serverTime: now, data: { playerId: killer.id, name: killer.name, frags: killer.frags } });
    }
  }

  private respawn(player: RoomPlayer, now: number): void {
    if(this.sessionMode!=='round')return;
    const position = this.chooseSpawn(player.id);
    player.health = MAX_HEALTH;
    if(this.original){player.sourceHealth=createOriginalPlayerHealth();player.sourceMotionTime=0;player.sourcePendingShots=0;player.sourceMotionPosition=cloneVec3(position);player.sourcePoseHistory=[];}
    player.armor = 0;
    player.alive = true;
    player.respawnAt = null;
    player.protectedUntil = this.original?now:now + SPAWN_PROTECTION_MS;
    player.transform = this.initialTransform(position);
    player.transformSequence = -1;
    player.lastTransformAt = now;
    player.movementBudget = MOVEMENT_BUDGET_CAPACITY;
    player.movementBudgetUpdatedAt = now;
    player.authorizedBoost = null;
    player.airborneOriginY = null;
    player.airbornePositiveRise = 0;
    player.airborneHorizontalDistance = 0;
    player.airborneDescending = false;
    player.positionHistory = [{ receivedAt: now, position: cloneVec3(position) }];
    player.lastShotAt = -Infinity;
    player.ammo = initialAmmo(this.winter ? undefined : this.map);
    player.reserve = initialReserve(this.winter ? undefined : this.map);
    player.reloadWeapon = null;
    player.reloadCompleteAt = null;
    player.pendingShots.clear();
    player.sourceUnarmed=false;player.sourceDisplayedWeapon=this.original?'launcher':null;
    this.sourceLegacyContactBodies.delete(player.id);
    player.sourceWorld=null;player.sourceBody=null;player.sourceInput=null;
    player.sourceCounter=this.original?new OriginalWeaponCounter(this.map):null;
    player.sourceCounterUpdatedAt=now;player.sourceCounterReady=false;player.sourceCounterWeapon=null;player.sourceAutoReloadTime=null;
    this.broadcastEvent({ type: 'respawn', serverTime: now, data: { playerId: player.id, position: cloneVec3(position), health: player.health } });
    this.sendLoadout(player, now);
  }

  private chooseSpawn(excludedPlayerId?: string): Vec3 {
    // explore.buildlevel samples random(vstarts.count), independent of peers.
    // Custom starts are authored fixtures and retain their existing policy.
    if(this.original&&!this.customSpawns)return cloneVec3(this.spawns[originalSpawnIndex(this.spawns.length,Math.random())]);
    const threats = [...this.players.values()]
      .filter((player) => player.peer !== null && player.alive && player.id !== excludedPlayerId);
    if (threats.length === 0) return cloneVec3(this.spawns[this.players.size % this.spawns.length]);
    let best = this.spawns[0];
    let bestDistance = -Infinity;
    for (const spawn of this.spawns) {
      let nearest = Infinity;
      for (const threat of threats) {
        const horizontal = (spawn.x - threat.transform.position.x) ** 2 + (spawn.z - threat.transform.position.z) ** 2;
        nearest = Math.min(nearest, horizontal);
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = spawn;
      }
    }
    return cloneVec3(best);
  }

  private expireShots(player: RoomPlayer, now: number): void {
    for (const [shotId, shot] of player.pendingShots) {
      if (shot.consumed || now - shot.registeredAt > SHOT_LIFETIME_MS) player.pendingShots.delete(shotId);
    }
  }

  private expireRecentShotIds(player: RoomPlayer, now: number): void {
    for (const [shotId, expiresAt] of player.recentShotIds) {
      if (now > expiresAt) player.recentShotIds.delete(shotId);
    }
  }

  private sourceAngularSnapshot(source:OriginalProjectileState):Pick<ProjectileSnapshot,'orientation'|'angularVelocity'> {
    return source.angular?{orientation:{...source.angular.orientation},angularVelocity:cloneVec3(source.angular.angularVelocity)}:{};
  }

  private cloneProjectile(projectile: ProjectileSnapshot): ProjectileSnapshot {
    return {
      projectileId: projectile.projectileId,
      shotId: projectile.shotId,
      attackerId: projectile.attackerId,
      ...(projectile.attackerName!==undefined?{attackerName:projectile.attackerName}:{}),
      weapon: projectile.weapon,
      position: cloneVec3(projectile.position),
      velocity: cloneVec3(projectile.velocity),
      expiresAt: projectile.expiresAt,
      ...(projectile.remainingCallbacks!==undefined?{remainingCallbacks:projectile.remainingCallbacks}:{}),
      ...(projectile.direction?{direction:cloneVec3(projectile.direction)}:{}),
      ...(projectile.sourceRotation?{sourceRotation:cloneVec3(projectile.sourceRotation)}:{}),
      ...(projectile.orientation&&projectile.angularVelocity?{orientation:{...projectile.orientation},angularVelocity:cloneVec3(projectile.angularVelocity)}:{}),
    };
  }

  private playerSnapshot(player: RoomPlayer): PlayerSnapshot {
    return {
      id: player.id,
      name: player.name,
      health: player.health,
      ...(player.sourceHealth?{sourceHealth:{...player.sourceHealth},sourceMotionTime:player.sourceMotionTime}:{}),
      armor: player.armor,
      maxHealth: MAX_HEALTH,
      frags: player.frags,
      ...(this.original?{score:player.score}:{}),
      deaths: player.deaths,
      alive: player.alive,
      respawnAt: player.respawnAt,
      transform: cloneTransform(player.transform),
    };
  }

  private sendWelcome(player: RoomPlayer, snapshot: PlayerSnapshot, now: number): void {
    player.peer?.send({
      type: 'welcome',
      map: this.map,
      protocol: PROTOCOL_VERSION,
      clientId: player.id,
      resumeToken: player.resumeToken,
      room: this.id,
      tickRate: this.tickRate,
      serverTime: now,
      ...(player.sourceRemoteView?{sourceRemoteView:{epoch:now,generation:player.sourceViewGeneration}}:{}),
      ...(this.hasSourceAuthority()&&this.sourceWorldUpdatedAt!==null?{sourcePhysicsTime:this.sourceWorldUpdatedAt}:{}),
      ...(this.original&&this.sourceHealthUpdatedAt!==null?{sourceHealthTime:this.sourceHealthUpdatedAt}:{}),
      fragLimit: this.fragLimit,
      player: snapshot,
    });
    if(this.original)this.sendSourceViewMessage(player,{type:'snapshot',snapshot:this.getSnapshot(now)});
  }

  private sendLoadout(player: RoomPlayer, now: number, ackShotId?:string): void {
    if(player.peer===null)return;
    player.peer.send({
      type: 'loadout',
      ...(ackShotId!==undefined?{ackShotId}:{}),
      ...(player.sourceAutoReloadTime!==null?{sourceAutoReloadTime:player.sourceAutoReloadTime}:{}),
      serverTime: now,
      playerId: player.id,
      equipped: player.transform.weapon,
      ...(this.original?{unarmed:player.sourceUnarmed,sourceDisplayedWeapon:player.sourceDisplayedWeapon}:{}),
      ...(player.sourceCounter?{sourceTransformSequence:player.transformSequence,sourceTyping:Boolean(player.transform.typing),sourceCounterTime:player.sourceCounterUpdatedAt,sourceCounter:{...player.sourceCounter.state,ready:player.sourceCounterReady&&!player.sourceUnarmed&&player.sourceCounterWeapon===player.transform.weapon}}:{}),
      weapons: {
        pistol: { ammo: player.ammo.pistol, reserve: player.reserve.pistol },
        shotgun: { ammo: player.ammo.shotgun, reserve: player.reserve.shotgun },
        rifle: { ammo: player.ammo.rifle, reserve: player.reserve.rifle },
        sniper: { ammo: player.ammo.sniper, reserve: player.reserve.sniper },
        launcher: { ammo: player.ammo.launcher, reserve: player.reserve.launcher },
        rpg: { ammo: player.ammo.rpg, reserve: player.reserve.rpg },
      },
      reload: player.reloadWeapon !== null && player.reloadCompleteAt !== null
        ? { weapon: player.reloadWeapon, completesAt: player.reloadCompleteAt }
        : null,
    });
    // A reconnect can receive a marker retained while detached; ordinary
    // packets cannot replay it after a successful send. A thrown send leaves
    // it pending rather than discarding the source callback notification.
    player.sourceAutoReloadTime=null;
  }

  private createResumeToken(disallowed?: string): string {
    let token = this.resumeTokenFactory();
    while (token.length < 1 || token.length > 128 || token === disallowed
      || [...this.players.values()].some((player) => player.resumeToken === token)) {
      token = this.resumeTokenFactory();
    }
    return token;
  }

  private removeOwnedProjectiles(playerId: string): void {
    // Received source actors belong to the observing world, not the sender's connection.
    if(this.original)return;
    for (const [projectileId, projectile] of this.projectiles) {
      if (projectile.snapshot.attackerId === playerId) this.projectiles.delete(projectileId);
    }
  }

  private expireSuspendedPlayers(now: number): void {
    for (const [playerId, player] of this.players) {
      if (player.peer === null && player.resumeExpiresAt !== null && now >= player.resumeExpiresAt) {
        this.clearSourceExplosiveReceipts(player);
        this.players.delete(playerId);
        this.sourceLegacyContactBodies.delete(playerId);
      }
    }
  }

  private error(player: RoomPlayer, code: string, message: string): void {
    player.peer?.send({ type: 'error', code, message });
  }

  private resetSourceView(player:RoomPlayer,now:number,enabled:boolean):void {
    player.sourceActorNames.clear();player.sourceTimeoutDrops.clear();player.sourcePendingShots=0;
    player.sourceLegacyViewTargets.clear();
    player.sourceRemoteView=this.original&&enabled?new OriginalRemoteView(now,{},'source-callback'):null;
    if(player.sourceRemoteView){
      if(!Number.isSafeInteger(this.sourceViewGeneration+1))throw Error('Source view generation exhausted');
      player.sourceViewGeneration=++this.sourceViewGeneration;
    }
    player.sourceViewTick=0;player.sourceViewLastValidation=null;
  }

  private sourceViewRejection(player:RoomPlayer,value:unknown,now:number):string|null {
    const valid=isOriginalRemoteViewWireTrace(value),mirror=player.sourceRemoteView!;
    const processingAt=this.sourceViewDiagnostics?this.diagnosticNow():0;
    const before=this.sourceViewDiagnostics?mirror.debugState():null;
    const rejection=!valid||value.generation!==player.sourceViewGeneration?'A valid receipt trace for this source view generation is required.'
      :(()=>{const result=mirror.accept(value,now);if(!result.ok)return result.reason;
        if(player.alive){
          const transitions=result.transitions??[...(result.timeouts??[]),...(result.deaths??[])].sort((a,b)=>a.callback-b.callback);
          for(const transition of transitions)this.createPrivateSourceDrop(player,transition);
        }
        return null;})();
    if(this.sourceViewDiagnostics){
      if(rejection!==null)this.diagnostic({kind:'source-view-rejected',playerId:player.id,generation:player.sourceViewGeneration,trustedNow:now,
        processingAt,processingEndedAt:this.diagnosticNow(),reason:rejection,lastValidation:player.sourceViewLastValidation,lastWorldWork:this.lastSourceWorldWork,
        mirror:before?{epoch:before.epoch,callbacks:before.callbacks,lastAcceptedAt:before.lastAcceptedAt,pendingCount:before.pendingTicks.length,
          pending:before.pendingTicks.map((tick,index)=>({tick,sentAt:before.pendingSentAt[index],ageMs:now-before.pendingSentAt[index]}))}:null,
        trace:valid?{generation:value.generation,callbacks:value.callbacks,receipts:value.receipts.map(r=>({...r}))}:null});
      else if(valid)player.sourceViewLastValidation={trustedNow:now,processingAt,callbacks:value.callbacks,receiptCount:value.receipts.length};
    }
    return rejection;
  }

  private createPrivateSourceDrop(player:RoomPlayer,target:{position:Vec3;weapon?:WeaponId}):void {
    if(!this.original||!player.alive||!target.weapon)return;
    const id=`drop-${++this.dropSequence}`;
    if(player.sourceTimeoutDrops.size>=128)player.sourceTimeoutDrops.delete(player.sourceTimeoutDrops.keys().next().value!);
    player.sourceTimeoutDrops.set(id,{id,weapon:target.weapon,
      position:originalDropPosition({...target.position,y:target.position.y+this.original.profile.eyeHeight},this.original.scale),
      expiresAt:null,yaw:originalDropYaw(Math.random())});
  }

  private clearSourceExplosiveReceipts(player:RoomPlayer):void {
    player.sourceWorld?.projectiles.clear();player.sourceWorld?.blasts.clear();player.sourceWorld=null;player.sourceBody=null;
    for(const actor of this.projectiles.values())actor.sourceReceivers?.delete(player);
    for(const actor of this.sourceBlasts.values())actor.sourceReceivers?.delete(player);
  }

  private sourceExplosiveReceivers(actor:SourceExplosiveReceipts&{snapshot:{attackerId:string;attackerName?:string}}):Set<RoomPlayer> {
    if(!actor.sourceReceivers){
      // Explicit historical fixture adapter for manually installed actors
      // without delivery history. Real launches always install an empty or
      // owner-only set and only successful delivery adds remote recipients.
      // Unknown legacy attribution cannot support a name exclusion.
      const launchName=actor.sourceLaunchName??actor.snapshot.attackerName;
      actor.sourceReceivers=new Set([...this.players.values()].filter(player=>player.alive&&player.peer!==null
        &&(player.id===actor.snapshot.attackerId||launchName===undefined
          ||!originalAsciiNamesEqual(player.name,launchName))));
    }
    return actor.sourceReceivers;
  }

  private sourceExplosiveCanRestore(player:RoomPlayer,actor:SourceExplosiveReceipts&{snapshot:{attackerId:string;attackerName?:string}}):boolean {
    if(!player.alive)return false;
    if(actor.sourceBirthSequence!==undefined&&actor.sourceBirthSequence<=player.sourceExplosiveCutoff)return false;
    if(this.sourceExplosiveReceivers(actor).has(player))return true;
    // Only the actual launching life has an unconditional local birth. Fresh
    // lives with an equivalent name do not inherit that identity. Established
    // recipients above retain their actor even if a fixture changes a name.
    const launchName=actor.sourceLaunchName??actor.snapshot.attackerName;
    return launchName===undefined||!originalAsciiNamesEqual(player.name,launchName);
  }

  /** Only snapshots successfully sent to this particular viewer enter its mirror.
   * Non-negotiated direct fixtures remain a historical-pose testing adapter. */
  private sendSourceViewMessage(player:RoomPlayer,message:ServerMessage):void {
    if(!player.peer)return;
    const received:SourceExplosiveReceipts[]=[];
    if(this.original){
      if(message.type==='snapshot'){
        const world=player.alive?this.ensureSourceWorld(player,message.snapshot.serverTime):null;
        const personalized=this.getSnapshotFor(player,message.snapshot.serverTime);
        personalized.players=message.snapshot.players;
        for(const actor of this.projectiles.values())if(actor.source&&this.sourceExplosiveCanRestore(player,actor)){
          const id=actor.snapshot.projectileId;
          if(!world||world.projectiles.has(id)||world.blasts.has(id)||actor.sourceReceivers?.has(player))continue;
          const donor=[...(actor.sourceReceivers??[])].find(p=>p.sourceWorld?.projectiles.has(id)||p.sourceWorld?.blasts.has(id));
          if(!donor)continue;
          const projectile=donor.sourceWorld!.projectiles.get(id),blast=donor.sourceWorld!.blasts.get(id);
          if(projectile)personalized.projectiles.push(this.sourceSnapshotAt(projectile,world.updatedAt));
          else if(blast)personalized.blasts!.push({...blast.snapshot,position:{...blast.snapshot.position},expiresAt:world.updatedAt+blast.state.remainingCallbacks*1000/30});
          received.push(actor);
        }
        message={...message,snapshot:personalized};
      }else if(message.type==='event'&&message.event.type==='projectile_spawned'){
        const actor=this.projectiles.get(message.event.data.projectile.projectileId);
        if(actor){
          if(actor.sourceReceivers?.has(player)&&!player.sourceWorld?.projectiles.has(actor.snapshot.projectileId))return;
          if(!this.sourceExplosiveCanRestore(player,actor))return;
          received.push(actor);
        }else{
          // Standalone legacy event fixtures do not carry authoritative actors.
          const snapshot=message.event.data.projectile;
          if(!player.alive||(snapshot.attackerId!==player.id&&snapshot.attackerName!==undefined&&originalAsciiNamesEqual(player.name,snapshot.attackerName)))return;
        }
      }else if(message.type==='event'&&message.event.type==='explosion'){
        const actor=player.sourceWorld?.blasts.get(message.event.data.projectileId);
        // An explosion message represents an existing local actor's transition,
        // rather than a second opportunity to receive a failed launch.
        if(!actor)return;
        if(!player.alive)return;
      }
    }
    const commitReceipts=()=>{for(const receipt of received){
      const actor=receipt as ActiveProjectile;
      if(this.original&&actor.source){
        const world=this.ensureSourceWorld(player,message.type==='snapshot'?message.snapshot.serverTime:message.type==='event'?message.event.serverTime:this.clock());
        if(message.type==='event'&&message.event.type==='projectile_spawned'){
          if(!world.projectiles.has(actor.snapshot.projectileId)&&!world.blasts.has(actor.snapshot.projectileId))world.projectiles.set(actor.snapshot.projectileId,this.cloneSourceActor(actor));
        }else this.restoreSourceActor(player,actor,message.type==='snapshot'?message.snapshot.serverTime:this.clock());
      }
      receipt.sourceReceivers!.add(player);
    }};
    const send=(outgoing:ServerMessage):boolean=>{
      try{player.peer!.send(outgoing);commitReceipts();
        if(this.original&&outgoing.type==='snapshot'){for(const target of outgoing.snapshot.players)if(!player.sourceActorNames.has(target.id))player.sourceActorNames.set(target.id,target.name);if(player.sourceActorNames.size>128){try{this.error(player,'source_view_resync_required','Source actor name history exceeded its transport bound.');}catch{/* Failed transport follows the same suspension policy. */}finally{this.disconnectSourceView(player,outgoing.snapshot.serverTime);}return false;}}
        return true;}
      catch(error){
        if(!this.original)throw error;
        this.disconnectSourceView(player,Math.max(this.clock(),message.type==='snapshot'?message.snapshot.serverTime:message.type==='event'?message.event.serverTime:0));
        return false;
      }
    };
    // Timeout pickups belong to the viewer that observed the native actor
    // recurrence. Retain the existing128-item wire bound without publishing
    // them into another viewer's collectible world.
    if(message.type==='snapshot'&&player.sourceTimeoutDrops.size)message={...message,snapshot:{...message.snapshot,
      drops:[...(message.snapshot.drops??[]),...[...player.sourceTimeoutDrops.values()].map(drop=>({...drop,position:{...drop.position}}))].slice(-128)}};

    const mirror=player.sourceRemoteView;
    const firePlayerId=message.type==='event'&&message.event.type==='shot'?message.event.data.playerId:undefined;
    // Projectile receipts still share the negotiated dispatch clock without
    // applying a bullet shooting phase to the viewer's soldier mirror.
    const projectileReceiptEvent=message.type==='event'&&message.event.type==='projectile_spawned';
    const deathPlayerId=message.type==='event'&&message.event.type==='killed'?message.event.data.victimId:undefined;
    if(!mirror){
      if(!send(message))return;
      if(this.original&&message.type==='snapshot'){
        // Explicit non-negotiated adapter: remember only successfully sent
        // live metadata; it has no client callback evidence to interpolate.
        player.sourceLegacyViewTargets.clear();
        if(player.alive)for(const target of message.snapshot.players)if(target.alive&&target.id!==player.id&&!originalAsciiNamesEqual(target.name,player.name)){
          player.sourceLegacyViewTargets.set(target.id,{id:target.id,position:{...target.transform.position},yaw:target.transform.yaw,motionTime:target.sourceMotionTime??0,alive:true,weapon:target.transform.weapon});
        }
      }else if(this.original&&deathPlayerId!==undefined){
        const target=player.sourceLegacyViewTargets.get(deathPlayerId);
        if(target)this.createPrivateSourceDrop(player,target);
        player.sourceLegacyViewTargets.delete(deathPlayerId);
      }
      return;
    }
    if(message.type!=='snapshot'&&firePlayerId===undefined&&deathPlayerId===undefined&&!projectileReceiptEvent){send(message);return;}
    const tick=player.sourceViewTick++;
    const simulationTime=message.type==='snapshot'?message.snapshot.serverTime:message.type==='event'?message.event.serverTime:0;
    // Timestamp dispatch, not the earlier simulation callback. The max keeps
    // explicit fixed-clock fixtures usable; production shares the monotonic
    // server clock, which is always at or after its simulation timestamp.
    const sentAt=Math.max(simulationTime,this.clock());
    if(message.type==='snapshot'){if(!send({...message,sourceViewTick:tick,sourceViewSentAt:sentAt}))return;}
    else if(message.type==='event'){if(!send({...message,sourceViewTick:tick,sourceViewSentAt:sentAt}))return;}
    const result=mirror.recordSent({tick,sentAt,targets:message.type==='snapshot'?message.snapshot.players
      .filter(target=>target.id!==player.id&&!originalAsciiNamesEqual(target.name,player.name)).map(target=>({id:target.id,position:target.transform.position,yaw:target.transform.yaw,motionTime:target.sourceMotionTime??0,alive:target.alive,weapon:target.transform.weapon,sourceShots:target.sourceShots})):[],
      ...(firePlayerId!==undefined?{firePlayerId}:{}),...(deathPlayerId!==undefined?{deathPlayerId}:{})});
    if(!result.ok){
      try{this.error(player,'source_view_resync_required',result.reason);}catch{/* Transport already failed. */}finally{this.disconnectSourceView(player,sentAt);}
    }
  }

  private disconnectSourceView(player:RoomPlayer,now:number):void {
    // World has already advanced before this outbound delivery; reuse normal
    // suspension cleanup without recursively advancing a failing transport.
    this.suspendPlayer(player,now);
  }

  private broadcastEvent(event: MatchEvent): void {
    this.broadcast({ type: 'event', event });
  }

  private broadcast(message: ServerMessage): void {
    for (const player of this.players.values()) this.sendSourceViewMessage(player,message);
  }
}
