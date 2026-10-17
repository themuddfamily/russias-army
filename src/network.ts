import {isOriginalRemoteShotReport} from '../shared/originalRemoteShots';
import {originalCodename,ORIGINAL_CODENAME_REJECTION} from '../shared/originalCodename';
import {validOriginalQuaternion,type OriginalQuaternion} from '../shared/originalAngularBody';
import {MAX_ORIGINAL_DOORS} from '../shared/protocol';
import {originalProjectileRotationMatchesDirection} from '../shared/originalProjectileOrientation';
/** Browser-side transport for the authoritative free-for-all server. */

import { MAX_TRANSFORM_PATH_SAMPLES, CHAT_MAX_LENGTH, PROTOCOL_VERSION, RESUME_TOKEN_MAX_LENGTH } from '../shared/protocol';
import { RG6_JUMP_MAX_SPEED } from '../shared/rg6Jump';
import type {
  OriginalRemoteViewState, OriginalRemoteViewWireTrace,
  MapId, RoomSummary, MovementSample,
  ClientMessage as SharedClientMessage,
  DamageSource as SharedDamageSource,
  EventMessage as SharedEventMessage,
  HitData,
  HitMessage as SharedHitMessage,
  HitZone as SharedHitZone,
  JoinMessage as SharedJoinMessage,
  LeaveMessage as SharedLeaveMessage,
  LoadoutMessage as SharedLoadoutMessage,
  MatchEvent as SharedMatchEvent,
  MatchSnapshot,
  MatchState as SharedMatchState,
  PingMessage as SharedPingMessage,
  PlayerSnapshot,
  PlayerTransform,
  PongMessage as SharedPongMessage,
  ProjectileSnapshot as SharedProjectileSnapshot,
  ReloadMessage as SharedReloadMessage,
  ServerErrorMessage as SharedServerErrorMessage,
  ServerMessage as SharedServerMessage,
  ShootMessage as SharedShootMessage,
  ShotData,
  SnapshotMessage as SharedSnapshotMessage,
  TransformMessage as SharedTransformMessage,
  Vec3,
  WeaponId,
  WelcomeMessage as SharedWelcomeMessage,
} from '../shared/protocol';

export { PROTOCOL_VERSION, RESUME_TOKEN_MAX_LENGTH } from '../shared/protocol';
export type {
  MapId, RoomSummary, MovementSample, PickupSnapshot, WeaponDropSnapshot,
  DamageSource,
  CowardiceDamageSource,
  SourceEscapeMessage,
  ExplosionDamageSource,
  ExplosiveWeaponId,
  HitscanDamageSource,
  HitscanShotData,
  HitscanWeaponId,
  ProjectileSnapshot,
  WeaponLoadout,
  WeaponLoadoutState,
} from '../shared/protocol';

export const NETWORK_PROTOCOL_VERSION = PROTOCOL_VERSION;

// Compatibility aliases retain the browser transport's existing public names.
export type Vec3State = Vec3;
export type NetworkWeaponId = WeaponId;
export type TransformState = PlayerTransform;
export type NetworkPlayer = PlayerSnapshot;
export type MatchState = SharedMatchState;
export type NetworkSnapshot = MatchSnapshot;
export type JoinMessage = SharedJoinMessage;
export type LeaveMessage = SharedLeaveMessage;
export type LoadoutMessage = SharedLoadoutMessage;
export type TransformMessage = SharedTransformMessage;
export type ShootClaim = ShotData;
export type ShootMessage = SharedShootMessage;
export type HitZone = SharedHitZone;
export type HitClaim = HitData;
export type HitMessage = SharedHitMessage;
export type ReloadMessage = SharedReloadMessage;
export type PingMessage = SharedPingMessage;
export type ClientMessage = SharedClientMessage;
export type WelcomeMessage = SharedWelcomeMessage;
export type SnapshotMessage = SharedSnapshotMessage;
export type MatchEvent = SharedMatchEvent;
export type NetworkGameEvent = SharedMatchEvent;
export type NetworkEventType = SharedMatchEvent['type'];
export type EventMessage = SharedEventMessage;
export type PongMessage = SharedPongMessage;
export type ServerErrorMessage = SharedServerErrorMessage;
export type ServerMessage = SharedServerMessage;

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'leaving'
  | 'disconnected'
  | 'error';

export interface NetworkErrorDetails {
  code: string;
  message: string;
  fatal: boolean;
  cause?: unknown;
}

export interface ReconnectOptions {
  enabled: boolean;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitter: number;
}

interface MessageEventLike {
  data: unknown;
}

interface CloseEventLike {
  code?: number;
  reason?: string;
  wasClean?: boolean;
}

export interface WebSocketLike {
  readonly readyState: number;
  readonly bufferedAmount?: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: (event: unknown) => void): void;
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  addEventListener(type: 'close', listener: (event: CloseEventLike) => void): void;
}

export interface NetworkClientOptions {
  sourceRemoteView?:boolean;
  onSourceRemoteViewReset?:(state:OriginalRemoteViewState)=>void;
  beforeSourceRemoteViewReceipt?:()=>number;
  getSourceRemoteViewCallbacks?:()=>number;
  /** Defaults to the match server on port 8081 of the current host. */
  url?: string | (() => string);
  /** Clamped to the intended real-time budget of 15-20 updates per second. */
  sendRateHz?: number;
  reconnect?: boolean | Partial<ReconnectOptions>;
  connectTimeoutMs?: number;
  pingIntervalMs?: number;
  /** Reconnect when no valid server message arrives within this window. Defaults to 12 seconds. */
  serverSilenceTimeoutMs?: number;
  websocketFactory?: (url: string) => WebSocketLike;
  /** Epoch-based monotonic clock. Defaults to Date.now anchored to performance.now. */
  now?: () => number;
  random?: () => number;
  onSnapshot?: (snapshot: NetworkSnapshot) => void;
  onEvent?: (event: NetworkGameEvent) => void;
  /** Receives private authoritative weapon state for this client only. */
  onLoadout?: (loadout: LoadoutMessage) => void;
  onStateChange?: (state: ConnectionState, previous: ConnectionState) => void;
  onError?: (error: NetworkErrorDetails) => void;
}

export interface ShootInput {
  sourceRotation?:Vec3;
  origin: Vec3State;
  direction: Vec3State;
  weapon: NetworkWeaponId;
  rg6Jump?: { forward: boolean; jump: boolean };
  /** Supply this when another system already owns shot correlation. */
  shotId?: string;
}

export interface HitInput {
  shotId: string;
  targetId: string;
}

type Unsubscribe = () => void;
type Timer = ReturnType<typeof setTimeout>;

const SOCKET_OPEN = 1;
const MAX_PENDING_MOVEMENT_SAMPLES = 4096;
const MAX_OUTBOUND_BUFFER_BYTES = 1024 * 1024;
const DEFAULT_RECONNECT: ReconnectOptions = {
  enabled: true,
  maxAttempts: 8,
  initialDelayMs: 400,
  maxDelayMs: 8_000,
  jitter: 0.2,
};

function defaultSocketUrl(): string {
  if (typeof location === 'undefined') return 'ws://localhost:8081';
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.hostname}:8081`;
}

function cloneVec3(vector: Vec3State): Vec3State {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function cloneTransform(transform: TransformState): TransformState {
  return {
    position: cloneVec3(transform.position),
    velocity: cloneVec3(transform.velocity),
    yaw: transform.yaw,
    pitch: transform.pitch,
    grounded: transform.grounded,
    weapon: transform.weapon,
    ...(transform.typing===undefined?{}:{typing:transform.typing}),
    ...(transform.sourceInput===undefined?{}:{sourceInput:{...transform.sourceInput}}),
    ...(transform.movementMode===undefined?{}:{movementMode:transform.movementMode}),
  };
}

function cloneMovementSample(sample:MovementSample):MovementSample {
  return {position:cloneVec3(sample.position),velocity:cloneVec3(sample.velocity),grounded:sample.grounded};
}

function validMovementSample(sample:unknown):sample is MovementSample {
  return isRecord(sample)&&finiteVector(sample.position)&&finiteVector(sample.velocity)&&typeof sample.grounded==='boolean';
}

function finiteVector(vector: unknown): vector is Vec3State {
  if (!isRecord(vector)) return false;
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function validTransform(transform: unknown): transform is TransformState {
  if (!isRecord(transform)) return false;
  return finiteVector(transform.position)
    && finiteVector(transform.velocity)
    && Number.isFinite(transform.yaw)
    && Number.isFinite(transform.pitch)
    && typeof transform.grounded === 'boolean'
    && (transform.typing===undefined||typeof transform.typing==='boolean')
    && (transform.sourceInput===undefined||validSourceInput(transform.sourceInput))
    && (transform.movementMode===undefined||(typeof transform.movementMode==='string'&&['source','modern-walk','modern-sprint','modern-aim'].includes(transform.movementMode)))
    && isNetworkWeapon(transform.weapon);
}

function validSourceInput(value:unknown):boolean {
  return isRecord(value)&&Object.keys(value).length===5
    && ['forward','backward','left','right','jump'].every(key=>typeof value[key]==='boolean');
}

function isNetworkWeapon(value: unknown): value is NetworkWeaponId {
  return value === 'pistol' || value === 'shotgun' || value === 'rifle'
    || value === 'sniper' || value === 'launcher' || value === 'rpg';
}

const NETWORK_WEAPON_IDS: readonly NetworkWeaponId[] = [
  'pistol', 'shotgun', 'rifle', 'sniper', 'launcher', 'rpg',
];

function isHitscanWeapon(value: unknown): value is 'pistol' | 'shotgun' | 'rifle' | 'sniper' {
  return value === 'pistol' || value === 'shotgun' || value === 'rifle' || value === 'sniper';
}

function isExplosiveWeapon(value: unknown): value is 'launcher' | 'rpg' {
  return value === 'launcher' || value === 'rpg';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= maxLength;
}

function validOptionalAttackerName(value: unknown): boolean {
  return value === undefined || (isBoundedString(value, 20) && !/[\u0000-\u001f\u007f]/.test(value));
}

function validSourceScoreRecipients(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length <= 64
    && value.every(recipient => isRecord(recipient)
      && hasExactKeys(recipient, ['playerId', 'frags', 'score'])
      && isBoundedString(recipient.playerId, 128) && isCount(recipient.frags) && isCount(recipient.score))
    && new Set(value.map(recipient => recipient.playerId)).size === value.length);
}

function compactStringHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function validLoadout(value: unknown): value is LoadoutMessage {
  if (!isRecord(value)
    || value.type !== 'loadout'
    || !Number.isFinite(value.serverTime)
    || (value.serverTime as number) < 0
    || !isBoundedString(value.playerId, 128)
    || !isNetworkWeapon(value.equipped)
    || (value.unarmed!==undefined&&typeof value.unarmed!=='boolean')
    || (value.sourceDisplayedWeapon!==undefined&&value.sourceDisplayedWeapon!==null&&!isNetworkWeapon(value.sourceDisplayedWeapon))
    || !isRecord(value.weapons)
    || !hasExactKeys(value.weapons, NETWORK_WEAPON_IDS)) return false;

  for (const weapon of NETWORK_WEAPON_IDS) {
    const state = value.weapons[weapon];
    if (!isRecord(state)
      || !hasExactKeys(state, ['ammo', 'reserve'])
      || !isCount(state.ammo)
      || !isCount(state.reserve)) return false;
  }

  if(value.ackShotId!==undefined&&!isBoundedString(value.ackShotId,64))return false;
  if(value.sourceAutoReloadTime!==undefined&&(!Number.isFinite(value.sourceAutoReloadTime)
    ||(value.sourceAutoReloadTime as number)<0
    ||(value.sourceAutoReloadTime as number)>(value.serverTime as number)+1e-7))return false;
  if(value.sourceCounterTime!==undefined&&(!Number.isFinite(value.sourceCounterTime)
    ||(value.sourceCounterTime as number)<0||value.sourceCounter===undefined
    ||(value.sourceCounterTime as number)>(value.serverTime as number)+1e-7))return false;
  if(value.sourceTransformSequence!==undefined&&(!Number.isSafeInteger(value.sourceTransformSequence)
    ||(value.sourceTransformSequence as number)<-1||value.sourceCounter===undefined))return false;
  if(value.sourceTyping!==undefined&&(typeof value.sourceTyping!=='boolean'||value.sourceCounter===undefined))return false;
  if(value.sourceCounter!==undefined&&(!isRecord(value.sourceCounter)
    ||!hasExactKeys(value.sourceCounter,['waitgun','poldwaitgun','ready'])
    ||!Number.isSafeInteger(value.sourceCounter.waitgun)
    ||!Number.isSafeInteger(value.sourceCounter.poldwaitgun)
    ||typeof value.sourceCounter.ready!=='boolean'))return false;

  if(value.unarmed===true&&value.reload!==null)return false;
  if (value.reload === null) return true;
  return isRecord(value.reload)
    && hasExactKeys(value.reload, ['weapon', 'completesAt'])
    && isNetworkWeapon(value.reload.weapon)
    && value.reload.weapon === value.equipped
    && Number.isFinite(value.reload.completesAt)
    && (value.reload.completesAt as number) > (value.serverTime as number);
}

function validMap(value: unknown): value is MapId { return value === 'barrack' || value === 'woodlands'; }

function validPlayer(value: unknown): value is NetworkPlayer {
  if (!isRecord(value) || !isBoundedString(value.id, 128) || !isBoundedString(value.name, 20)) return false;
  if (!Number.isFinite(value.health) || !Number.isFinite(value.maxHealth)
    || (value.maxHealth as number) <= 0) return false;
  if(value.sourceHealth===undefined){
    if((value.health as number)<0||(value.health as number)>(value.maxHealth as number))return false;
  }else if(!validSourceHealth(value.sourceHealth,value.health))return false;
  if(!isOriginalRemoteShotReport(value.sourceShots))return false;
  if(value.sourceMotionTime!==undefined&&(!Number.isFinite(value.sourceMotionTime)||(value.sourceMotionTime as number)<0))return false;
  if (value.armor !== undefined && (!Number.isFinite(value.armor) || (value.armor as number) < 0 || (value.armor as number) > 100)) return false;
  return (value.score===undefined||isCount(value.score))
    && isCount(value.frags)
    && isCount(value.deaths)
    && typeof value.alive === 'boolean'
    && (value.respawnAt === null || Number.isFinite(value.respawnAt))
    && validTransform(value.transform);
}

function validSourceHealth(value:unknown,health:unknown):boolean {
  return isRecord(value)&&hasExactKeys(value,['canonical','flick'])&&Number.isFinite(value.canonical)
    && (value.flick===2||value.flick===-2)&&value.canonical===health;
}

function validSourceDamageHealth(value:unknown,health:unknown,lethal:unknown):boolean {
  return validSourceHealth(value,health)&&typeof lethal==='boolean'
    && lethal===((health as number)+2*((value as Record<string,unknown>).flick as number)<0);
}

function validSourceEpoch(value:unknown,serverTime:unknown):boolean {
  return value===undefined||(Number.isFinite(value)&&(value as number)>=0&&(value as number)<=(serverTime as number)+.001);
}

function validShot(value: unknown, hitscanOnly = false): value is ShootClaim {
  if (!isRecord(value) || !isBoundedString(value.shotId, 64)
    || !finiteVector(value.origin) || !finiteVector(value.direction)
    || (value.rg6Jump !== undefined && !validRg6JumpIntent(value.rg6Jump))
    || (value.sourceRotation!==undefined&&!originalProjectileRotationMatchesDirection(value.sourceRotation,value.direction))) return false;
  const directionLength = Math.hypot(value.direction.x, value.direction.y, value.direction.z);
  return directionLength >= 0.75 && directionLength <= 1.25
    && (hitscanOnly ? isHitscanWeapon(value.weapon) : isNetworkWeapon(value.weapon));
}

function validRg6JumpIntent(value: unknown): value is NonNullable<ShootInput['rg6Jump']> {
  return isRecord(value) && typeof value.forward === 'boolean' && typeof value.jump === 'boolean';
}

function validAngularSnapshot(value:Record<string,unknown>):boolean {
  if(value.orientation===undefined&&value.angularVelocity===undefined)return true;
  const q=value.orientation;
  return isRecord(q)&&validOriginalQuaternion(q as unknown as OriginalQuaternion)
    &&finiteVector(value.angularVelocity);
}

function validProjectile(value: unknown): value is SharedProjectileSnapshot {
  return isRecord(value)
    && validAngularSnapshot(value)
    && isBoundedString(value.projectileId, 128)
    && isBoundedString(value.shotId, 64)
    && isBoundedString(value.attackerId, 128)
    && validOptionalAttackerName(value.attackerName)
    && isExplosiveWeapon(value.weapon)
    && (value.sourceRotation===undefined||originalProjectileRotationMatchesDirection(value.sourceRotation,value.direction))
    && finiteVector(value.position)
    && finiteVector(value.velocity)
    && Number.isFinite(value.expiresAt)
    && (value.remainingCallbacks===undefined||(Number.isInteger(value.remainingCallbacks)&&(value.remainingCallbacks as number)>=1&&(value.remainingCallbacks as number)<=(value.weapon==='launcher'?60:200)))
    && (value.direction===undefined||(finiteVector(value.direction)&&Math.abs(Math.hypot(value.direction.x,value.direction.y,value.direction.z)-1)<1e-6));
}

function validOriginalBlast(value:unknown):boolean {
  return isRecord(value)&&isBoundedString(value.projectileId,128)&&isBoundedString(value.shotId,64)
    &&isBoundedString(value.attackerId,128)&&validOptionalAttackerName(value.attackerName)&&isExplosiveWeapon(value.weapon)&&finiteVector(value.position)
    &&Number.isInteger(value.remainingCallbacks)&&(value.remainingCallbacks as number)>=1&&(value.remainingCallbacks as number)<=16&&Number.isFinite(value.expiresAt);
}

function validDamageSource(value: unknown): value is SharedDamageSource {
  if (!isRecord(value)) return false;
  if(value.kind==='cowardice')return Object.keys(value).length===3&&typeof value.direct==='boolean'
    &&(value.attackerId===null||isBoundedString(value.attackerId,128));
  if (!isBoundedString(value.shotId, 64) || !finiteVector(value.position)) return false;
  if (value.kind === 'hitscan') {
    return isHitscanWeapon(value.weapon) && (value.zone === 'body' || value.zone === 'head');
  }
  if (value.kind === 'explosion') {
    return isBoundedString(value.projectileId, 128) && isExplosiveWeapon(value.weapon)
      && validOptionalAttackerName(value.attackerName);
  }
  return false;
}

function validSnapshot(value: unknown): value is NetworkSnapshot {
  if (!isRecord(value) || !/^[a-zA-Z0-9_-]{1,32}$/.test(typeof value.room === 'string' ? value.room : '')) return false;
  if (value.map !== undefined && !validMap(value.map)) return false;
  if(value.barrels!==undefined&&(!Array.isArray(value.barrels)||value.barrels.length>128
    ||!value.barrels.every(b=>isRecord(b)&&isBoundedString(b.id,128)&&finiteVector(b.position)&&finiteVector(b.velocity)&&validAngularSnapshot(b))
    ||new Set(value.barrels.map(b=>b.id)).size!==value.barrels.length))return false;
  if(value.blasts!==undefined&&(!Array.isArray(value.blasts)||value.blasts.length>512||!value.blasts.every(validOriginalBlast)
    ||new Set(value.blasts.map(b=>b.projectileId)).size!==value.blasts.length))return false;
  if(value.doors!==undefined&&(!Array.isArray(value.doors)||value.doors.length>MAX_ORIGINAL_DOORS
    ||!value.doors.every(d=>isRecord(d)&&isBoundedString(d.name,64)&&(d.openedAt===null||(Number.isFinite(d.openedAt)&&(d.openedAt as number)>=0&&(d.openedAt as number)<=(value.serverTime as number))))
    ||new Set(value.doors.map(d=>d.name)).size!==value.doors.length))return false;
  if (value.pickups !== undefined && (!Array.isArray(value.pickups) || value.pickups.length > 128 || !value.pickups.every(p => isRecord(p) && isBoundedString(p.id,128) && ['health','armor','ammo'].includes(String(p.type)) && finiteVector(p.position) && typeof p.active === 'boolean' && (p.respawnAt === null || Number.isFinite(p.respawnAt))))) return false;
  if (value.drops !== undefined && (!Array.isArray(value.drops) || value.drops.length > 128 || !value.drops.every(p => isRecord(p) && isBoundedString(p.id,128) && isNetworkWeapon(p.weapon) && finiteVector(p.position) && (p.expiresAt===null||Number.isFinite(p.expiresAt)) && (p.yaw===undefined||Number.isFinite(p.yaw))))) return false;
  if (!isCount(value.tick) || !Number.isFinite(value.serverTime) || !isPositiveCount(value.fragLimit)) return false;
  if(value.sourcePhysicsTime!==undefined&&(!Number.isFinite(value.sourcePhysicsTime)||(value.sourcePhysicsTime as number)<0||(value.sourcePhysicsTime as number)>(value.serverTime as number)+.001))return false;
  if(!validSourceEpoch(value.sourceHealthTime,value.serverTime))return false;
  if (value.state !== 'playing' && value.state !== 'finished') return false;
  if (value.winnerId !== null && !isBoundedString(value.winnerId, 128)) return false;
  if (!Array.isArray(value.players) || value.players.length > 64 || !value.players.every(validPlayer)) return false;
  return Array.isArray(value.projectiles)
    && value.projectiles.length <= 512
    && value.projectiles.every(validProjectile);
}

function validEvent(value: unknown): value is NetworkGameEvent {
  if (!isRecord(value) || typeof value.type !== 'string' || !Number.isFinite(value.serverTime) || !isRecord(value.data)) return false;
  const data = value.data;
  switch (value.type) {
    case 'door_open':return isBoundedString(data.name,64)&&Number.isFinite(data.openedAt)&&(data.openedAt as number)>=0&&(data.openedAt as number)<=(value.serverTime as number);
    case 'chat': return isBoundedString(data.playerId,128) && isBoundedString(data.name,20) && isBoundedString(data.text,CHAT_MAX_LENGTH);
    case 'collected': return isBoundedString(data.playerId,128) && isBoundedString(data.itemId,128) && ['health','armor','ammo','weapon'].includes(String(data.kind)) && (data.kind === 'weapon' ? isNetworkWeapon(data.weapon) : data.weapon === undefined) && (data.score===undefined||isCount(data.score));
    case 'join':
      return validPlayer(data.player);
    case 'leave':
      return isBoundedString(data.playerId, 128) && isBoundedString(data.name, 20);
    case 'shot':
      return isBoundedString(data.playerId, 128) && validShot(data.shot, true);
    case 'projectile_spawned':
      return validProjectile(data.projectile)&&(data.launchSoundPosition===undefined||finiteVector(data.launchSoundPosition));
    case 'projectile_contact':
      return isBoundedString(data.playerId,128)&&isBoundedString(data.projectileId,128)&&finiteVector(data.velocity);
    case 'rg6_boost':
      return isBoundedString(data.playerId, 128)
        && isBoundedString(data.projectileId, 128)
        && Number.isFinite(data.velocityY)
        && (data.velocityY as number) > 0
        && (data.velocityY as number) <= RG6_JUMP_MAX_SPEED;
    case 'explosion':
      return isBoundedString(data.projectileId, 128)
        && isBoundedString(data.shotId, 64)
        && isBoundedString(data.attackerId, 128)
        && validOptionalAttackerName(data.attackerName)
        && isExplosiveWeapon(data.weapon)
        && finiteVector(data.position)
        && Number.isFinite(data.radius)
        && (data.radius as number) > 0
        && (data.radius as number) <= 32
        && (data.remainingCallbacks===undefined||(Number.isInteger(data.remainingCallbacks)&&(data.remainingCallbacks as number)>=1&&(data.remainingCallbacks as number)<=16));
    case 'damaged':
      return isBoundedString(data.attackerId, 128)
        && isBoundedString(data.targetId, 128)
        && Number.isFinite(data.damage)
        && (data.damage as number) > 0
        && Number.isFinite(data.health)
        && (data.sourceHealth===undefined?(data.health as number)>=0:validSourceDamageHealth(data.sourceHealth,data.health,data.lethal))
        && (data.lethal===undefined||typeof data.lethal==='boolean')
        && validSourceEpoch(data.sourceHealthTime,value.serverTime)
        && validDamageSource(data.source)
        && (data.source.kind!=='cowardice'||!data.source.direct);
    case 'killed':
      return isBoundedString(data.killerId, 128)
        && isBoundedString(data.victimId, 128)
        && isCount(data.killerFrags)
        && (data.killerScore===undefined||isCount(data.killerScore))
        && validSourceScoreRecipients(data.sourceScoreRecipients)
        && isCount(data.victimDeaths)
        && validDamageSource(data.source);
    case 'respawn':
      return isBoundedString(data.playerId, 128)
        && finiteVector(data.position)
        && Number.isFinite(data.health)
        && (data.health as number) > 0;
    case 'winner':
      return isBoundedString(data.playerId, 128)
        && isBoundedString(data.name, 20)
        && isPositiveCount(data.frags);
    default:
      return false;
  }
}

function safeCount(value:unknown):value is number{return Number.isSafeInteger(value)&&(value as number)>=0;}

function validWelcome(value: unknown): value is WelcomeMessage {
  if (!isRecord(value)) return false;
  return (value.sourceRemoteView===undefined||(isRecord(value.sourceRemoteView)&&Number.isFinite(value.sourceRemoteView.epoch)&&(value.sourceRemoteView.epoch as number)>=0&&(value.sourceRemoteView.epoch as number)<=(value.serverTime as number)&&safeCount(value.sourceRemoteView.generation)))
    && (value.map === undefined || validMap(value.map))
    && value.protocol === NETWORK_PROTOCOL_VERSION
    && isBoundedString(value.clientId, 128)
    && isBoundedString(value.resumeToken, RESUME_TOKEN_MAX_LENGTH)
    && /^[a-zA-Z0-9_-]{1,32}$/.test(typeof value.room === 'string' ? value.room : '')
    && isPositiveCount(value.tickRate)
    && (value.tickRate as number) <= 240
    && Number.isFinite(value.serverTime)
    && validSourceEpoch(value.sourceHealthTime,value.serverTime)
    && isPositiveCount(value.fragLimit)
    && validPlayer(value.player)
    && value.player.id === value.clientId;
}

type ServerParseResult =
  | { message: ServerMessage }
  | { error: 'invalid_message' | 'invalid_welcome' | 'protocol_mismatch' | 'invalid_snapshot' | 'invalid_event' | 'invalid_loadout' };

function parseServerMessage(data: unknown): ServerParseResult {
  let parsed: unknown = data;
  if (typeof data === 'string') {
    if (data.length === 0 || data.length > 262_144) return { error: 'invalid_message' };
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return { error: 'invalid_message' };
    }
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') return { error: 'invalid_message' };
  switch (parsed.type) {
    case 'welcome':
      if (parsed.protocol !== NETWORK_PROTOCOL_VERSION) return { error: 'protocol_mismatch' };
      return validWelcome(parsed) ? { message: parsed } : { error: 'invalid_welcome' };
    case 'snapshot':
      return (parsed.sourceViewTick===undefined||safeCount(parsed.sourceViewTick))&&(parsed.sourceViewSentAt===undefined||(typeof parsed.sourceViewSentAt==='number'&&Number.isFinite(parsed.sourceViewSentAt)&&parsed.sourceViewSentAt>=0))&&validSnapshot(parsed.snapshot) ? { message: parsed as unknown as SnapshotMessage } : { error: 'invalid_snapshot' };
    case 'event':
      return (parsed.sourceViewTick===undefined||safeCount(parsed.sourceViewTick))&&(parsed.sourceViewSentAt===undefined||(typeof parsed.sourceViewSentAt==='number'&&Number.isFinite(parsed.sourceViewSentAt)&&parsed.sourceViewSentAt>=0))&&validEvent(parsed.event) ? { message: parsed as unknown as EventMessage } : { error: 'invalid_event' };
    case 'loadout':
      return validLoadout(parsed) ? { message: parsed } : { error: 'invalid_loadout' };
    case 'pong':
      return Number.isFinite(parsed.clientTime) && Number.isFinite(parsed.serverTime)
        ? { message: parsed as unknown as PongMessage }
        : { error: 'invalid_message' };
    case 'error':
      return isBoundedString(parsed.code, 128) && isBoundedString(parsed.message, 2_048)
        ? { message: parsed as unknown as ServerErrorMessage }
        : { error: 'invalid_message' };
    default:
      return { error: 'invalid_message' };
  }
}

function reconnectOptions(value: NetworkClientOptions['reconnect']): ReconnectOptions {
  if (value === false) return { ...DEFAULT_RECONNECT, enabled: false };
  if (value === true || value === undefined) return { ...DEFAULT_RECONNECT };
  return {
    ...DEFAULT_RECONNECT,
    ...value,
    maxAttempts: Math.max(0, Math.floor(value.maxAttempts ?? DEFAULT_RECONNECT.maxAttempts)),
    initialDelayMs: Math.max(0, value.initialDelayMs ?? DEFAULT_RECONNECT.initialDelayMs),
    maxDelayMs: Math.max(0, value.maxDelayMs ?? DEFAULT_RECONNECT.maxDelayMs),
    jitter: Math.min(1, Math.max(0, value.jitter ?? DEFAULT_RECONNECT.jitter)),
  };
}

/**
 * Small, renderer-independent multiplayer client. The game only needs to feed
 * it its latest numeric transform and subscribe to authoritative snapshots.
 */
export class NetworkClient {
  private readonly sourceViewOptions:Pick<NetworkClientOptions,'sourceRemoteView'|'onSourceRemoteViewReset'|'beforeSourceRemoteViewReceipt'|'getSourceRemoteViewCallbacks'>;
  private sourceViewState?:OriginalRemoteViewState;
  private sourceViewLastTick=-1;
  private sourceViewLastSentAt=0;
  private sourceViewLastCallbacks=0;
  private sourceViewLastTraceSentAt=-Infinity;
  private readonly sourceViewReceipts:OriginalRemoteViewWireTrace['receipts']=[];
  private readonly socketUrl: string | (() => string);
  private readonly socketFactory: (url: string) => WebSocketLike;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly sendIntervalMs: number;
  private readonly connectTimeoutMs: number;
  private readonly pingIntervalMs: number;
  private readonly serverSilenceTimeoutMs: number;
  private readonly reconnectConfig: ReconnectOptions;
  private readonly snapshotHandlers = new Set<(snapshot: NetworkSnapshot) => void>();
  private readonly eventHandlers = new Set<(event: NetworkGameEvent) => void>();
  private readonly loadoutHandlers = new Set<(loadout: LoadoutMessage) => void>();
  private readonly stateHandlers = new Set<(state: ConnectionState, previous: ConnectionState) => void>();
  private readonly errorHandlers = new Set<(error: NetworkErrorDetails) => void>();

  private socket?: WebSocketLike;
  private connectionGeneration = 0;
  private currentState: ConnectionState = 'idle';
  private desiredJoin?: { room: string; name: string; map?: MapId };
  private intentionalLeave = false;
  private reconnectAttempt = 0;
  private reconnectTimer?: Timer;
  private sendTimer?: Timer;
  private pingTimer?: Timer;
  private timeoutTimer?: Timer;
  private silenceTimer?: Timer;
  private latestTransform?: TransformState;
  private readonly pendingMovementPath:MovementSample[]=[];
  private transformSequence = 0;
  private shotSequence = 0;
  private localId?: string;
  private resumeToken?: string;
  private joinedRoom?: string;
  private lastWelcome?: WelcomeMessage;
  private mostRecentSnapshot?: NetworkSnapshot;
  private measuredLatency?: number;
  private measuredServerOffset?: number;
  private pendingJoin?: {
    resolve: (welcome: WelcomeMessage) => void;
    reject: (error: Error) => void;
  };

  constructor(options: NetworkClientOptions = {}) {
    this.sourceViewOptions={sourceRemoteView:options.sourceRemoteView,onSourceRemoteViewReset:options.onSourceRemoteViewReset,beforeSourceRemoteViewReceipt:options.beforeSourceRemoteViewReceipt,getSourceRemoteViewCallbacks:options.getSourceRemoteViewCallbacks};
    this.socketUrl = options.url ?? defaultSocketUrl;
    this.socketFactory = options.websocketFactory ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
    if (options.now) {
      this.now = options.now;
    } else {
      const epoch = Date.now();
      const startedAt = performance.now();
      this.now = () => epoch + performance.now() - startedAt;
    }
    this.random = options.random ?? Math.random;
    this.sendIntervalMs = 1_000 / Math.min(20, Math.max(15, options.sendRateHz ?? 18));
    this.connectTimeoutMs = Math.max(1_000, options.connectTimeoutMs ?? 10_000);
    this.pingIntervalMs = Math.max(1_000, options.pingIntervalMs ?? 5_000);
    this.serverSilenceTimeoutMs = Math.max(100, options.serverSilenceTimeoutMs ?? 12_000);
    this.reconnectConfig = reconnectOptions(options.reconnect);
    if (options.onSnapshot) this.snapshotHandlers.add(options.onSnapshot);
    if (options.onEvent) this.eventHandlers.add(options.onEvent);
    if (options.onLoadout) this.loadoutHandlers.add(options.onLoadout);
    if (options.onStateChange) this.stateHandlers.add(options.onStateChange);
    if (options.onError) this.errorHandlers.add(options.onError);
  }

  get state(): ConnectionState { return this.currentState; }
  get sourceRemoteViewState():Readonly<OriginalRemoteViewState>|undefined{return this.sourceViewState?{...this.sourceViewState}:undefined;}
  get pendingSourceRemoteViewReceipts():number{return this.sourceViewReceipts.length;}
  get connected(): boolean { return this.currentState === 'connected'; }
  get clientId(): string | undefined { return this.localId; }
  /** Sequence of the current transform dispatch, for authority input acknowledgments. */
  get lastSentTransformSequence():number { return this.transformSequence; }
  get room(): string | undefined { return this.joinedRoom; }
  get latencyMs(): number | undefined { return this.measuredLatency; }
  get serverTimeOffsetMs(): number | undefined { return this.measuredServerOffset; }
  /** Estimated server epoch time using elapsed monotonic time, unaffected by wall-clock corrections. */
  get estimatedServerTimeMs(): number | undefined {
    return this.measuredServerOffset === undefined ? undefined : this.now() + this.measuredServerOffset;
  }
  get latestSnapshot(): NetworkSnapshot | undefined { return this.mostRecentSnapshot; }

  subscribeSnapshot(handler: (snapshot: NetworkSnapshot) => void): Unsubscribe {
    this.snapshotHandlers.add(handler);
    return () => this.snapshotHandlers.delete(handler);
  }

  subscribeEvent(handler: (event: NetworkGameEvent) => void): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  subscribeLoadout(handler: (loadout: LoadoutMessage) => void): Unsubscribe {
    this.loadoutHandlers.add(handler);
    return () => this.loadoutHandlers.delete(handler);
  }

  subscribeState(handler: (state: ConnectionState, previous: ConnectionState) => void): Unsubscribe {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  subscribeError(handler: (error: NetworkErrorDetails) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  join(room: string, name: string, map?: MapId): Promise<WelcomeMessage> {
    if (map !== undefined && !validMap(map)) return Promise.reject(new Error('Choose Barrack or Woodlands.'));
    const cleanRoom = room.trim();
    const sourceName=this.sourceViewOptions.sourceRemoteView===true
      ||(this.sourceViewOptions.sourceRemoteView!==false&&map!==undefined);
    const cleanName = sourceName?originalCodename(name):name.trim();
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(cleanRoom)) {
      return Promise.reject(new Error('Room must contain 1-32 letters, numbers, underscores, or hyphens.'));
    }
    if (!cleanName) return Promise.reject(new Error(sourceName?ORIGINAL_CODENAME_REJECTION:'Name must contain 1-20 characters.'));
    if(cleanName.length>20)return Promise.reject(new Error('Name must contain 1-20 characters.'));

    if (this.connected && this.desiredJoin?.room === cleanRoom && this.desiredJoin.name === cleanName && this.desiredJoin.map === map && this.lastWelcome) {
      return Promise.resolve(this.lastWelcome);
    }

    this.cancelPendingJoin(new Error('Join superseded by a newer request.'));
    this.send({ type: 'leave' });
    this.clearTimers();
    this.closeSocket(4000, 'new join');
    this.resumeToken = undefined;
    this.desiredJoin = { room: cleanRoom, name: cleanName, map };
    this.intentionalLeave = false;
    this.reconnectAttempt = 0;
    this.localId = undefined;
    this.joinedRoom = undefined;
    this.lastWelcome = undefined;
    this.mostRecentSnapshot = undefined;
    this.latestTransform = undefined;
    this.resetTransformPath();
    this.transformSequence = 0;
    this.measuredLatency = undefined;
    this.measuredServerOffset = undefined;

    const promise = new Promise<WelcomeMessage>((resolve, reject) => {
      this.pendingJoin = { resolve, reject };
    });
    this.connect(false);
    return promise;
  }

  leave(): void {
    this.resetTransformPath();
    this.resumeToken = undefined;
    if (this.currentState === 'idle' || this.currentState === 'disconnected') return;
    this.intentionalLeave = true;
    this.desiredJoin = undefined;
    this.setState('leaving');
    this.send({ type: 'leave' });
    this.cancelPendingJoin(new Error('Join cancelled by leave().'));
    this.clearTimers();
    this.closeSocket(1000, 'client leave');
    this.localId = undefined;
    this.joinedRoom = undefined;
    this.lastWelcome = undefined;
    this.mostRecentSnapshot = undefined;
    this.latestTransform = undefined;
    this.resetTransformPath();
    this.measuredLatency = undefined;
    this.measuredServerOffset = undefined;
    this.setState('disconnected');
  }

  dispose(): void {
    this.leave();
    this.snapshotHandlers.clear();
    this.eventHandlers.clear();
    this.loadoutHandlers.clear();
    this.stateHandlers.clear();
    this.errorHandlers.clear();
  }

  /** Replaces the state sent on the next 15-20 Hz network update. */
  setTransform(transform: TransformState,path?:readonly MovementSample[]): boolean {
    if (!validTransform(transform)||(path!==undefined&&(!Array.isArray(path)||!path.every(validMovementSample)))) {
      this.reportError('invalid_transform', 'Transform contains non-finite or invalid values.', false);
      return false;
    }
    if(this.pendingMovementPath.length+(path?.length??0)>MAX_PENDING_MOVEMENT_SAMPLES){
      this.recoverTransport('movement_queue_full','Movement history exceeded the client memory limit.');return false;
    }
    const endpoint=path?.at(-1)??this.pendingMovementPath.at(-1);
    const appendEndpoint=Boolean(endpoint&&(endpoint.grounded!==transform.grounded
      ||(['x','y','z'] as const).some(axis=>endpoint.position[axis]!==transform.position[axis]||endpoint.velocity[axis]!==transform.velocity[axis])));
    if(appendEndpoint&&this.pendingMovementPath.length+(path?.length??0)>=MAX_PENDING_MOVEMENT_SAMPLES){
      this.recoverTransport('movement_queue_full','Movement history exceeded the client memory limit.');return false;
    }
    this.latestTransform = cloneTransform(transform);
    if(path)for(const sample of path)this.pendingMovementPath.push(cloneMovementSample(sample));
    if(appendEndpoint){
      this.pendingMovementPath.push(cloneMovementSample(transform));
    }
    return true;
  }

  /** Publish an input-mode transition before a following weapon request. */
  flushTransform():boolean {
    if(!this.connected||!this.latestTransform)return false;
    if(this.pendingMovementPath.length){
      while(this.pendingMovementPath.length){
        const path=this.pendingMovementPath.slice(0,MAX_TRANSFORM_PATH_SAMPLES),endpoint=path[path.length-1];
        const transform={...cloneTransform(this.latestTransform),...cloneMovementSample(endpoint)};
        if(!this.send({type:'transform',sequence:++this.transformSequence,clientTime:this.now(),transform,path}))return false;
        this.pendingMovementPath.splice(0,path.length);
      }
      return true;
    }
    return this.send({type:'transform',sequence:++this.transformSequence,clientTime:this.now(),transform:cloneTransform(this.latestTransform)});
  }

  /** Discard prior movement when an authoritative spawn/correction establishes a new origin. */
  resetTransformPath():void {this.pendingMovementPath.length=0;}

  /** Sends a fire claim immediately and returns its correlation id. */
  shoot(input: ShootInput): string | undefined {
    if (!this.connected || !finiteVector(input.origin) || !finiteVector(input.direction) || !isNetworkWeapon(input.weapon)) return undefined;
    if (input.shotId !== undefined && !isBoundedString(input.shotId, 64)) return undefined;
    if (input.rg6Jump !== undefined && !validRg6JumpIntent(input.rg6Jump)) return undefined;
    if((this.sourceViewState&&input.weapon==='rpg'&&input.sourceRotation===undefined)
      ||(input.sourceRotation!==undefined&&!originalProjectileRotationMatchesDirection(input.sourceRotation,input.direction)))return undefined;
    const directionLength = Math.hypot(input.direction.x, input.direction.y, input.direction.z);
    if (directionLength < 0.75 || directionLength > 1.25) return undefined;
    const shotId = input.shotId ?? this.createShotId();
    const sent = this.send({
      type: 'shoot',
      shot: {
        shotId,
        origin: cloneVec3(input.origin),
        direction: cloneVec3(input.direction),
        weapon: input.weapon,
        ...(input.sourceRotation===undefined?{}:{sourceRotation:cloneVec3(input.sourceRotation)}),
        ...(input.rg6Jump === undefined ? {} : { rg6Jump: { forward: input.rg6Jump.forward, jump: input.rg6Jump.jump } }),
      },
    });
    return sent ? shotId : undefined;
  }

  /** Reports which target a prior shot intersected; the server owns validation and damage. */
  hit(input: HitInput): boolean {
    if (!this.connected || !isBoundedString(input.shotId, 64) || !isBoundedString(input.targetId, 128)) return false;
    return this.send({
      type: 'hit',
      hit: {
        shotId: input.shotId,
        targetId: input.targetId,
      },
    });
  }

  chat(text: string): boolean {
    const sourceMap=this.desiredJoin?.map==='barrack'||this.desiredJoin?.map==='woodlands';
    const clean = sourceMap ? text : text.trim();
    return this.connected && clean.trim().length > 0 && clean.length <= CHAT_MAX_LENGTH && !/[\u0000-\u001f\u007f]/.test(clean) && this.send({ type: 'chat', text: clean });
  }

  /** Order pending typing/movement before the server chooses the Escape operation. */
  sourceEscape():boolean {
    if(!this.connected||(this.desiredJoin?.map!=='barrack'&&this.desiredJoin?.map!=='woodlands'))return false;
    if(this.latestTransform&&!this.flushTransform())return false;
    return this.send({type:'source_escape'});
  }

  collect(itemId: string): boolean {
    return this.connected && isBoundedString(itemId,128) && this.send({ type: 'collect', itemId });
  }

  async listRooms(): Promise<RoomSummary[]> {
    const url = new URL(typeof this.socketUrl === 'function' ? this.socketUrl() : this.socketUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'; url.pathname = '/rooms'; url.search = '';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load rooms.');
    const result: unknown = await response.json();
    if (!isRecord(result) || !Array.isArray(result.rooms) || !result.rooms.every(r => isRecord(r) && isBoundedString(r.room,32) && validMap(r.map) && isCount(r.players) && isPositiveCount(r.capacity) && (r.state === 'playing' || r.state === 'finished'))) throw new Error('Invalid room directory.');
    return result.rooms as RoomSummary[];
  }

  /** Requests an authoritative reload for the selected weapon. */
  reload(weapon: NetworkWeaponId, sourceSortAfterReload = false): boolean {
    if (!this.connected || !isNetworkWeapon(weapon) || typeof sourceSortAfterReload !== 'boolean') return false;
    return this.send({ type: 'reload', weapon, ...(sourceSortAfterReload ? {sourceSortAfterReload:true} : {}) });
  }

  private connect(reconnecting: boolean): void {
    if (!this.desiredJoin || this.intentionalLeave) return;
    this.resetSourceView();
    const generation = ++this.connectionGeneration;
    if (!reconnecting) this.setState('connecting');

    try {
      const url = typeof this.socketUrl === 'function' ? this.socketUrl() : this.socketUrl;
      const socket = this.socketFactory(url);
      this.socket = socket;
      socket.addEventListener('open', () => {
        if (generation !== this.connectionGeneration || socket !== this.socket || !this.desiredJoin) return;
        if (!reconnecting) this.setState('joining');
        const joinMessage: JoinMessage = {
          type: 'join',
          protocol: NETWORK_PROTOCOL_VERSION,
          room: this.desiredJoin.room,
          name: this.desiredJoin.name,
        };
        if (this.desiredJoin.map !== undefined) joinMessage.map = this.desiredJoin.map;
        if(this.sourceViewOptions.sourceRemoteView)joinMessage.sourceRemoteView=true;
        if (reconnecting && this.resumeToken !== undefined) joinMessage.resumeToken = this.resumeToken;
        this.send(joinMessage);
      });
      socket.addEventListener('message', (event) => {
        if (generation !== this.connectionGeneration || socket !== this.socket) return;
        this.handleMessage(event.data);
      });
      socket.addEventListener('error', (event) => {
        if (generation !== this.connectionGeneration || socket !== this.socket) return;
        this.reportError('socket_error', 'The multiplayer connection encountered an error.', false, event);
      });
      socket.addEventListener('close', (event) => {
        if (generation !== this.connectionGeneration || socket !== this.socket) return;
        this.socket = undefined;
        this.handleClose(event);
      });
      this.timeoutTimer = setTimeout(() => {
        if (generation !== this.connectionGeneration || this.connected) return;
        this.reportError('connect_timeout', 'The multiplayer server did not complete the join in time.', false);
        socket.close(4001, 'join timeout');
      }, this.connectTimeoutMs);
    } catch (cause) {
      this.reportError('connect_failed', 'Could not create the multiplayer connection.', false, cause);
      this.scheduleReconnect();
    }
  }

  private handleMessage(data: unknown): void {
    const parsed = parseServerMessage(data);
    if ('error' in parsed) {
      if(this.sourceViewState&&(parsed.error==='invalid_snapshot'||parsed.error==='invalid_event')){
        this.resyncSourceView('invalid_source_view','A corrupt source remote view message cannot be applied safely.');return;
      }
      if (parsed.error === 'protocol_mismatch') {
        const reason = `The match server does not support protocol ${NETWORK_PROTOCOL_VERSION}.`;
        this.reportError('protocol_mismatch', reason, true);
        this.failFatally(reason);
        return;
      }
      if (parsed.error === 'invalid_welcome') {
        this.reportError('invalid_welcome', 'The server sent an invalid welcome message.', true);
        this.failFatally();
        return;
      }
      const message = parsed.error === 'invalid_snapshot'
        ? 'Ignored an invalid world snapshot.'
        : parsed.error === 'invalid_event'
          ? 'Ignored an invalid game event.'
          : parsed.error === 'invalid_loadout'
            ? 'Ignored an invalid authoritative loadout.'
            : 'Ignored an invalid message from the multiplayer server.';
      this.reportError(parsed.error, message, false);
      return;
    }
    const { message } = parsed;
    if (message.type === 'welcome' && (message.room !== this.desiredJoin?.room || (this.desiredJoin?.map !== undefined && message.map !== this.desiredJoin.map))) {
      this.reportError('invalid_welcome', 'The server sent a welcome for a different room.', true);
      this.failFatally('The server sent a welcome for a different room.');
      return;
    }
    if (message.type === 'snapshot' && (message.snapshot.room !== this.joinedRoom || (message.snapshot.map !== undefined && this.lastWelcome?.map !== undefined && message.snapshot.map !== this.lastWelcome.map))) {
      this.reportError('invalid_snapshot', 'Ignored a world snapshot for a different room.', false);
      return;
    }
    if (message.type === 'loadout' && message.playerId !== this.localId) {
      this.reportError('invalid_loadout', 'Ignored an authoritative loadout for a different player.', false);
      return;
    }
    this.refreshSilenceWatchdog();

    switch (message.type) {
      case 'welcome': {
        if(this.sourceViewOptions.sourceRemoteView&&!message.sourceRemoteView){this.reportError('invalid_welcome','The server did not negotiate the requested source remote view.',true);this.failFatally();return;}
        this.resetSourceView();
        if(this.sourceViewOptions.sourceRemoteView&&message.sourceRemoteView){
          this.measuredServerOffset=message.serverTime-this.now();
          this.sourceViewState={...message.sourceRemoteView};
          this.sourceViewLastSentAt=message.sourceRemoteView.epoch;
          this.sourceViewLastTraceSentAt=this.now();
          this.sourceViewOptions.onSourceRemoteViewReset?.({...message.sourceRemoteView});
        }
        this.clearTimeoutTimer();
        this.localId = message.clientId;
        this.resumeToken = message.resumeToken;
        this.joinedRoom = message.room;
        this.lastWelcome = message;
        this.mostRecentSnapshot = undefined;
        this.resetTransformPath();
        this.latestTransform = cloneTransform(message.player.transform);
        this.reconnectAttempt = 0;
        this.setState('connected');
        this.startRealtimeLoops();
        const pending = this.pendingJoin;
        this.pendingJoin = undefined;
        pending?.resolve(message);
        break;
      }
      case 'snapshot':
        if(this.sourceViewState&&message.snapshot.projectiles.some(projectile=>projectile.weapon==='rpg'&&projectile.sourceRotation===undefined)){this.resyncSourceView('invalid_source_view','Source RPG snapshot is missing its launch orientation.');break;}
        if(!this.receiveSourceView(message.sourceViewTick,message.sourceViewSentAt,true))break;
        this.mostRecentSnapshot = structuredClone(message.snapshot);
        this.emit(this.snapshotHandlers, structuredClone(this.mostRecentSnapshot));
        break;
      case 'event':
        if(this.sourceViewState&&message.event.type==='projectile_spawned'&&message.event.data.projectile.weapon==='rpg'&&message.event.data.projectile.sourceRotation===undefined){this.resyncSourceView('invalid_source_view','Source RPG event is missing its launch orientation.');break;}
        if(!this.receiveSourceView(message.sourceViewTick,message.sourceViewSentAt,message.event.type==='shot'||message.event.type==='projectile_spawned'||message.event.type==='killed'))break;
        this.emit(this.eventHandlers, structuredClone(message.event));
        break;
      case 'loadout':
        this.emit(this.loadoutHandlers, message);
        break;
      case 'pong': {
        const receivedAt = this.now();
        const roundTrip = Math.max(0, receivedAt - message.clientTime);
        this.measuredLatency = roundTrip;
        this.measuredServerOffset = message.serverTime - (message.clientTime + roundTrip / 2);
        break;
      }
      case 'error': {
        if(this.connected&&this.sourceViewOptions.sourceRemoteView&&(message.code==='invalid_source_view'||message.code==='source_view_resync_required')){
          this.resyncSourceView(message.code,message.message);break;
        }
        // Retrying a rejected join with identical input cannot succeed.
        const terminal = this.currentState === 'joining' || this.currentState === 'reconnecting';
        this.reportError(message.code || 'server_error', message.message || 'The server rejected a request.', terminal);
        if (terminal) this.failFatally(message.message);
        break;
      }
    }
  }

  private handleClose(event: CloseEventLike): void {
    this.resetSourceView();
    this.resetTransformPath();
    this.stopRealtimeLoops();
    this.clearTimeoutTimer();
    this.clearSilenceWatchdog();
    this.localId = undefined;
    this.joinedRoom = undefined;
    this.lastWelcome = undefined;
    this.mostRecentSnapshot = undefined;
    if (this.intentionalLeave || !this.desiredJoin) {
      this.setState('disconnected');
      return;
    }
    const detail = event.reason ? `: ${event.reason}` : '';
    const timedOut = event.code === 4003;
    this.reportError(
      timedOut ? 'server_timeout' : 'connection_closed',
      timedOut ? 'The multiplayer server stopped responding.' : `Multiplayer connection closed${detail}`,
      false,
      event,
    );
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.stopRealtimeLoops();
    this.clearTimeoutTimer();
    if (!this.desiredJoin || this.intentionalLeave || !this.reconnectConfig.enabled
      || this.reconnectAttempt >= this.reconnectConfig.maxAttempts) {
      const error = new Error('Unable to reconnect to the multiplayer server.');
      this.reportError('reconnect_exhausted', error.message, true);
      this.cancelPendingJoin(error);
      this.setState('error');
      return;
    }

    this.reconnectAttempt += 1;
    this.setState('reconnecting');
    const exponential = Math.min(
      this.reconnectConfig.maxDelayMs,
      this.reconnectConfig.initialDelayMs * 2 ** (this.reconnectAttempt - 1),
    );
    const jitter = 1 + (this.random() * 2 - 1) * this.reconnectConfig.jitter;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect(true);
    }, Math.max(0, exponential * jitter));
  }

  private startRealtimeLoops(): void {
    this.stopRealtimeLoops();
    const sendTransform = (): void => {
      if (!this.connected) return;
      this.flushTransform();
      if(this.connected)this.sendTimer = setTimeout(sendTransform, this.sendIntervalMs);
    };
    const ping = (): void => {
      if (!this.connected) return;
      this.send({ type: 'ping', clientTime: this.now() });
      if(this.connected)this.pingTimer = setTimeout(ping, this.pingIntervalMs);
    };
    this.sendTimer = setTimeout(sendTransform, this.sendIntervalMs);
    ping();
  }

  private stopRealtimeLoops(): void {
    if (this.sendTimer !== undefined) clearTimeout(this.sendTimer);
    if (this.pingTimer !== undefined) clearTimeout(this.pingTimer);
    this.sendTimer = undefined;
    this.pingTimer = undefined;
  }

  private send(message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== SOCKET_OPEN) return false;
    if((this.socket.bufferedAmount??0)>=MAX_OUTBOUND_BUFFER_BYTES){
      this.recoverTransport('outbound_queue_full','The multiplayer connection exceeded the client output memory limit.');return false;
    }
    try {
      let receiptCount=0;
      let sentCallbacks:number|undefined;
      if(this.sourceViewState&&(message.type==='transform'||message.type==='shoot'||message.type==='source_escape')){
        const callbacks=this.sourceViewOptions.getSourceRemoteViewCallbacks?.()??this.sourceViewLastCallbacks;
        if(!safeCount(callbacks)||callbacks<this.sourceViewLastCallbacks)throw new Error('Invalid source remote callback count');
        receiptCount=this.sourceViewReceipts.length;
        sentCallbacks=callbacks;
        message={...message,sourceRemoteView:{generation:this.sourceViewState.generation,callbacks,receipts:this.sourceViewReceipts.map(receipt=>({...receipt}))}};
      }
      this.socket.send(JSON.stringify(message));
      if(receiptCount)this.sourceViewReceipts.splice(0,receiptCount);
      if(sentCallbacks!==undefined){this.sourceViewLastCallbacks=sentCallbacks;this.sourceViewLastTraceSentAt=this.now();}
      return true;
    } catch (cause) {
      this.reportError('send_failed', `Could not send ${message.type} to the multiplayer server.`, false, cause);
      return false;
    }
  }

  private resetSourceView():void{this.sourceViewState=undefined;this.sourceViewLastTick=-1;this.sourceViewLastSentAt=0;this.sourceViewLastCallbacks=0;this.sourceViewLastTraceSentAt=-Infinity;this.sourceViewReceipts.length=0;}

  private receiveSourceView(tick:number|undefined,sentAt:number|undefined,required:boolean):boolean{
    if(!this.sourceViewState)return true;
    if(tick===undefined&&!required)return true;
    if(!safeCount(tick)||tick!==this.sourceViewLastTick+1||typeof sentAt!=='number'||!Number.isFinite(sentAt)||sentAt<this.sourceViewLastSentAt||this.sourceViewReceipts.length>=64){
      this.resyncSourceView('invalid_source_view','The source remote view receipt stream is missing or out of order.');return false;
    }
    const callbacks=this.sourceViewOptions.beforeSourceRemoteViewReceipt?.()??this.sourceViewLastCallbacks;
    if(!safeCount(callbacks)||callbacks<this.sourceViewLastCallbacks){this.resyncSourceView('invalid_source_view','The source remote view callback count is invalid.');return false;}
    this.sourceViewReceipts.push({tick,callbacks});this.sourceViewLastTick=tick;this.sourceViewLastSentAt=sentAt;this.sourceViewLastCallbacks=callbacks;
    // A background tab or expensive render can starve the transform timer
    // while WebSocket receipts still arrive. Send the existing ordered trace
    // before applying this packet's potentially expensive world state.
    // The authority's one-second age bound and all trace validation stay intact.
    if(this.now()-this.sourceViewLastTraceSentAt>=250){
      this.flushTransform();
      if(!this.sourceViewState)return false;
    }
    return true;
  }

  /** Rebuild the private mirror while resuming the existing authoritative life. */
  private resyncSourceView(code:string,message:string):void{
    this.recoverTransport(code,message,4004,'source view resync');
  }

  /** Resume from authority rather than dropping ordered movement or receipts. */
  private recoverTransport(code:string,message:string,closeCode=4005,reason='client queue limit'):void{
    this.reportError(code,message,false);
    this.closeSocket(closeCode,reason);
    this.handleClose({code:closeCode,reason,wasClean:false});
  }

  private createShotId(): string {
    this.shotSequence += 1;
    const clientPart = compactStringHash(this.localId ?? 'client');
    const timePart = Math.floor(this.now()).toString(36).slice(-12);
    const sequencePart = this.shotSequence.toString(36).slice(-12);
    const randomPart = Math.floor(this.random() * 0xffff_ffff).toString(36).slice(-12);
    return `${clientPart}-${timePart}-${sequencePart}-${randomPart}`;
  }

  private failFatally(reason = 'The multiplayer server rejected the connection.'): void {
    const error = new Error(reason);
    this.intentionalLeave = true;
    this.desiredJoin = undefined;
    this.cancelPendingJoin(error);
    this.clearTimers();
    this.closeSocket(4002, 'fatal server error');
    this.setState('error');
  }

  private closeSocket(code: number, reason: string): void {
    this.resetSourceView();
    this.resetTransformPath();
    const socket = this.socket;
    this.socket = undefined;
    this.connectionGeneration += 1;
    if (!socket) return;
    try {
      socket.close(code, reason);
    } catch {
      // It is already detached; there is nothing left to recover here.
    }
  }

  private clearTimeoutTimer(): void {
    if (this.timeoutTimer !== undefined) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = undefined;
  }

  private refreshSilenceWatchdog(): void {
    this.clearSilenceWatchdog();
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = undefined;
      if (!this.socket || !this.desiredJoin || this.currentState !== 'connected') return;
      this.closeSocket(4003, 'server silence timeout');
      this.handleClose({ code: 4003, reason: 'server silence timeout', wasClean: false });
    }, this.serverSilenceTimeoutMs);
  }

  private clearSilenceWatchdog(): void {
    if (this.silenceTimer !== undefined) clearTimeout(this.silenceTimer);
    this.silenceTimer = undefined;
  }

  private clearTimers(): void {
    this.stopRealtimeLoops();
    this.clearTimeoutTimer();
    this.clearSilenceWatchdog();
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private cancelPendingJoin(error: Error): void {
    const pending = this.pendingJoin;
    this.pendingJoin = undefined;
    pending?.reject(error);
  }

  private setState(next: ConnectionState): void {
    if (next === this.currentState) return;
    const previous = this.currentState;
    this.currentState = next;
    this.emitState(next, previous);
  }

  private reportError(code: string, message: string, fatal: boolean, cause?: unknown): void {
    this.emit(this.errorHandlers, { code, message, fatal, cause });
  }

  private emit<T>(handlers: Set<(value: T) => void>, value: T): void {
    for (const handler of [...handlers]) {
      try {
        handler(value);
      } catch (error) {
        console.error('NetworkClient callback failed', error);
      }
    }
  }

  private emitState(state: ConnectionState, previous: ConnectionState): void {
    for (const handler of [...this.stateHandlers]) {
      try {
        handler(state, previous);
      } catch (error) {
        console.error('NetworkClient state callback failed', error);
      }
    }
  }
}
