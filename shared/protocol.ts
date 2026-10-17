/** Dependency-free JSON protocol shared by the browser and match server. */

export const PROTOCOL_VERSION = 12 as const;
export const MAX_ORIGINAL_REMOTE_VIEW_RECEIPTS = 64;
export interface OriginalRemoteViewState { epoch:number;generation:number }
export interface OriginalRemoteViewWireTrace { generation:number;callbacks:number;receipts:Array<{tick:number;callbacks:number}> }
export const RESUME_TOKEN_MAX_LENGTH = 128 as const;

export type MapId = 'barrack' | 'woodlands';
export interface RoomSummary { room: string; map: MapId; players: number; connectedPlayers?: number; capacity: number; state: MatchState }
export type PickupKind = 'health' | 'armor' | 'ammo';
export interface PickupSnapshot { id: string; type: PickupKind; position: Vec3; active: boolean; respawnAt: number | null }
export interface WeaponDropSnapshot { id: string; weapon: WeaponId; position: Vec3; expiresAt: number | null; yaw?: number }
export const CHAT_MAX_LENGTH = 240;

export type HitscanWeaponId = 'pistol' | 'shotgun' | 'rifle' | 'sniper';
export type ExplosiveWeaponId = 'launcher' | 'rpg';
export type WeaponId = HitscanWeaponId | ExplosiveWeaponId;
export type HitZone = 'body' | 'head';
export type MatchState = 'playing' | 'finished';

export interface Quaternion {x:number;y:number;z:number;w:number}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Optional copy controls; source preserves the recovered movement impulses. */
export type OriginalPlayerMovementMode='source'|'modern-walk'|'modern-sprint'|'modern-aim';
export interface OriginalPlayerHealthState {canonical:number;flick:2|-2}

export interface OriginalPlayerInputIntent {
  forward:boolean;
  backward:boolean;
  left:boolean;
  right:boolean;
  jump:boolean;
}

export interface PlayerTransform {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  grounded: boolean;
  weapon: WeaponId;
  /** Copy transport adaptation: synchronizes source chat input guards. */
  typing?:boolean;
  /** Held source controls consumed by the authoritative joint physics callback. */
  sourceInput?:OriginalPlayerInputIntent;
  movementMode?:OriginalPlayerMovementMode;
}

/** A fire request. The server validates it and owns every resulting effect. */
export interface ShotData {
  /** Exact pre-recoil launch source degrees; ordinary source Y stays zero. */
  sourceRotation?:Vec3;
  shotId: string;
  origin: Vec3;
  direction: Vec3;
  weapon: WeaponId;
  rg6Jump?: { forward: boolean; jump: boolean };
}

export interface HitscanShotData extends ShotData {
  weapon: HitscanWeaponId;
}

/** A target-selection claim for a registered hitscan shot. */
export interface HitData {
  shotId: string;
  targetId: string;
}

export interface JoinMessage {
  sourceRemoteView?:boolean;
  type: 'join';
  map?: MapId;
  room: string;
  name: string;
  protocol: typeof PROTOCOL_VERSION;
  /** Opaque server-issued credential used only for automatic reconnection. */
  resumeToken?: string;
}

export interface LeaveMessage {
  type: 'leave';
}

/** The server chooses the source Escape operation from map and accepted typing state. */
export interface SourceEscapeMessage {
  type: 'source_escape';
  sourceRemoteView?: OriginalRemoteViewWireTrace;
}

export const MAX_TRANSFORM_PATH_SAMPLES = 128;
export type MovementSample = Pick<PlayerTransform, 'position' | 'velocity' | 'grounded'>;

export interface TransformMessage {
  sourceRemoteView?:OriginalRemoteViewWireTrace;
  type: 'transform';
  sequence: number;
  clientTime: number;
  transform: PlayerTransform;
  /** Collision-safe physics states accumulated since the previous send. */
  path?: MovementSample[];
}

export interface ShootMessage {
  sourceRemoteView?:OriginalRemoteViewWireTrace;
  type: 'shoot';
  shot: ShotData;
}

export interface HitMessage {
  type: 'hit';
  hit: HitData;
}

export interface ReloadMessage {
  type: 'reload';
  weapon: WeaponId;
  /** Source held-fire reload calls sortweapon even when every weapon is empty. */
  sourceSortAfterReload?: boolean;
}

export interface PingMessage {
  type: 'ping';
  clientTime: number;
}

export interface ChatMessage { type: 'chat'; text: string }
export interface CollectMessage { type: 'collect'; itemId: string }

export type ClientMessage =
  | ChatMessage
  | CollectMessage
  | JoinMessage
  | LeaveMessage
  | SourceEscapeMessage
  | TransformMessage
  | ShootMessage
  | HitMessage
  | ReloadMessage
  | PingMessage;

export interface PlayerSnapshot {
  /** Trusted positive ray-count batch; absence preserves remote queued work. */
  sourceShots?:number;
  /** Recovered GI skeletal time in milliseconds at the accepted source callback. */
  sourceMotionTime?:number;
  /** Signed source health and the phase used by its literal death expression. */
  sourceHealth?:OriginalPlayerHealthState;
  /** Original source points, independent of added frag/death statistics. */
  score?: number;
  armor?: number;
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  frags: number;
  deaths: number;
  alive: boolean;
  /** Server epoch time in milliseconds, or null while alive. */
  respawnAt: number | null;
  transform: PlayerTransform;
}

export interface ProjectileSnapshot {
  /** Optional paired evolving body orientation and world angular velocity (degrees/sec). */
  orientation?:Quaternion;
  angularVelocity?:Vec3;
  /** Retained launch orientation, independent of principal direction angles. */
  sourceRotation?:Vec3;
  projectileId: string;
  shotId: string;
  attackerId: string;
  /** Immutable server-derived launch callsign, retained after the owner leaves. */
  attackerName?: string;
  weapon: ExplosiveWeaponId;
  position: Vec3;
  velocity: Vec3;
  /** Server epoch time in milliseconds. */
  expiresAt: number;
  /** Recovered source projectile actor state; absent for authored projectiles. */
  remainingCallbacks?: number;
  direction?: Vec3;
}

export interface OriginalBlastSnapshot {
  projectileId:string;shotId:string;attackerId:string;weapon:ExplosiveWeaponId;
  /** Immutable server-derived launch callsign. */
  attackerName?:string;
  position:Vec3;remainingCallbacks:number;expiresAt:number;
}

export interface DoorSnapshot { name: string; openedAt: number | null }
export const MAX_ORIGINAL_DOORS = 13;

/** Canonical source movable-barrel pose, in world and physics velocity units. */
export interface OriginalBarrelSnapshot {id:string;position:Vec3;velocity:Vec3;orientation?:Quaternion;angularVelocity?:Vec3}

export interface MatchSnapshot {
  barrels?:OriginalBarrelSnapshot[];
  /** Epoch of the last completed source player health-phase callback. */
  sourceHealthTime?:number;
  /** Epoch time of the last completed source joint physics callback. */
  sourcePhysicsTime?:number;
  blasts?: OriginalBlastSnapshot[];
  doors?: DoorSnapshot[];
  map?: MapId;
  pickups?: PickupSnapshot[];
  drops?: WeaponDropSnapshot[];
  room: string;
  tick: number;
  serverTime: number;
  fragLimit: number;
  state: MatchState;
  winnerId: string | null;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
}

export interface HitscanDamageSource {
  kind: 'hitscan';
  shotId: string;
  weapon: HitscanWeaponId;
  zone: HitZone;
  /** Authoritative server-derived ray impact. */
  position: Vec3;
}

export interface ExplosionDamageSource {
  kind: 'explosion';
  /** Immutable server-derived launch callsign. */
  attackerName?: string;
  shotId: string;
  projectileId: string;
  weapon: ExplosiveWeaponId;
  /** Authoritative blast origin. */
  position: Vec3;
}

/** Literal source death cause, without an invented weapon impact. */
export interface CowardiceDamageSource {
  kind: 'cowardice';
  direct: boolean;
  /** Resolved source name lookup, or null when no player is named Cowardice. */
  attackerId: string | null;
}

export type DamageSource = HitscanDamageSource | ExplosionDamageSource | CowardiceDamageSource;

export type MatchEvent =
  | { type: 'door_open'; serverTime: number; data: { name: string; openedAt: number } }
  | { type: 'chat'; serverTime: number; data: { playerId: string; name: string; text: string } }
  | { type: 'collected'; serverTime: number; data: { playerId: string; itemId: string; kind: PickupKind | 'weapon'; weapon?: WeaponId; score?: number } }
  | { type: 'join'; serverTime: number; data: { player: PlayerSnapshot } }
  | { type: 'leave'; serverTime: number; data: { playerId: string; name: string } }
  | { type: 'shot'; serverTime: number; data: { playerId: string; shot: HitscanShotData } }
  | { type: 'projectile_spawned'; serverTime: number; data: { projectile: ProjectileSnapshot; /** Source constructor sound precedes RPG forward placement. */ launchSoundPosition?:Vec3 } }
  | { type: 'projectile_contact'; serverTime:number; data:{playerId:string;projectileId:string;velocity:Vec3} }
  | { type: 'rg6_boost'; serverTime: number; data: { playerId: string; projectileId: string; velocityY: number } }
  | {
      type: 'explosion';
      serverTime: number;
      data: {
        projectileId: string;
        shotId: string;
        attackerId: string;
        /** Immutable server-derived launch callsign. */
        attackerName?: string;
        weapon: ExplosiveWeaponId;
        position: Vec3;
        radius: number;
        remainingCallbacks?: number;
      };
    }
  | {
      type: 'damaged';
      serverTime: number;
      data: { attackerId: string; targetId: string; damage: number; health: number; source: DamageSource; sourceHealth?:OriginalPlayerHealthState; sourceHealthTime?:number; lethal?:boolean };
    }
  | {
      type: 'killed';
      serverTime: number;
      data: {
        killerId: string;
        victimId: string;
        killerFrags: number;
        killerScore?: number;
        /** Authoritative recipients of source callsign-based death scoring. */
        sourceScoreRecipients?: Array<{ playerId: string; frags: number; score: number }>;
        victimDeaths: number;
        source: DamageSource;
      };
    }
  | { type: 'respawn'; serverTime: number; data: { playerId: string; position: Vec3; health: number } }
  | { type: 'winner'; serverTime: number; data: { playerId: string; name: string; frags: number } };

export interface WelcomeMessage {
  sourceRemoteView?:OriginalRemoteViewState;
  sourceHealthTime?:number;
  map?: MapId;
  type: 'welcome';
  protocol: typeof PROTOCOL_VERSION;
  clientId: string;
  /** Opaque credential for reclaiming this authoritative player session. */
  resumeToken: string;
  room: string;
  tickRate: number;
  serverTime: number;
  fragLimit: number;
  player: PlayerSnapshot;
}

export interface SnapshotMessage {
  sourceViewTick?:number;
  /** Private monotonic dispatch time, separate from simulation/event time. */
  sourceViewSentAt?:number;
  type: 'snapshot';
  snapshot: MatchSnapshot;
}

export interface EventMessage {
  sourceViewTick?:number;
  /** Private monotonic dispatch time, separate from simulation/event time. */
  sourceViewSentAt?:number;
  type: 'event';
  event: MatchEvent;
}

export interface PongMessage {
  type: 'pong';
  clientTime: number;
  serverTime: number;
}

export interface WeaponLoadoutState {
  ammo: number;
  reserve: number;
}

export type WeaponLoadout = Record<WeaponId, WeaponLoadoutState>;

/** Private authoritative weapon state sent only to the player it describes. */
export interface LoadoutMessage {
  /** Exact source shoot request processed by this reconciliation, including rejection. */
  ackShotId?:string;
  /** One-shot callback epoch for an authority automatic empty-RPG reload. */
  sourceAutoReloadTime?:number;
  type: 'loadout';
  serverTime: number;
  playerId: string;
  equipped: WeaponId;
  /** Source VOID selection; equipped remains a cached transport enum. */
  unarmed?: boolean;
  /** Source sortweapon presentation; failed all-empty manual reload retains its previous model. */
  sourceDisplayedWeapon?: WeaponId | null;
  /** Original callback counter, separate from reload presentation. */
  sourceCounter?: {waitgun:number;poldwaitgun:number;ready:boolean};
  /** Last completed authoritative gun callback, rather than packet receipt. */
  sourceCounterTime?:number;
  /** Last accepted transform sequence when this source counter was sampled. */
  sourceTransformSequence?:number;
  /** Authority typing gate paired with the sampled source counter. */
  sourceTyping?:boolean;
  weapons: WeaponLoadout;
  reload: { weapon: WeaponId; completesAt: number } | null;
}

export interface ServerErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | EventMessage
  | LoadoutMessage
  | PongMessage
  | ServerErrorMessage;

export interface MessagePeer {
  send(message: ServerMessage): void;
}
