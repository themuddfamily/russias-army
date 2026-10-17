import type {
  ClientMessage,
  ExplosiveWeaponId,
  HitscanWeaponId,
  Vec3,
  WeaponId,
} from '../shared/protocol';
import {originalProjectileRotationMatchesDirection} from '../shared/originalProjectileOrientation';
export {isOriginalProjectileRotation,originalProjectileDirection,originalProjectileRotationMatchesDirection} from '../shared/originalProjectileOrientation';

export { PROTOCOL_VERSION, RESUME_TOKEN_MAX_LENGTH, MAX_TRANSFORM_PATH_SAMPLES, MAX_ORIGINAL_REMOTE_VIEW_RECEIPTS } from '../shared/protocol';
export type {
  OriginalRemoteViewState,
  OriginalRemoteViewWireTrace,
  ClientMessage,
  DamageSource,
  CowardiceDamageSource,
  EventMessage,
  ExplosionDamageSource,
  ExplosiveWeaponId,
  HitData,
  HitscanDamageSource,
  HitscanShotData,
  HitscanWeaponId,
  HitZone,
  JoinMessage,
  LeaveMessage,
  SourceEscapeMessage,
  LoadoutMessage,
  MatchEvent,
  MatchSnapshot,
  MatchState,
  MessagePeer,
  MovementSample,
  PingMessage,
  PlayerSnapshot,
  PlayerTransform,
  PongMessage,
  ProjectileSnapshot,
  ReloadMessage,
  ServerErrorMessage,
  ServerMessage,
  ShootMessage,
  ShotData,
  SnapshotMessage,
  TransformMessage,
  Vec3,
  WeaponId,
  WeaponLoadout,
  WeaponLoadoutState,
  WelcomeMessage,
} from '../shared/protocol';

const CLIENT_MESSAGE_TYPES = new Set(['join', 'leave', 'source_escape', 'transform', 'shoot', 'hit', 'reload', 'ping', 'chat', 'collect']);

/** Parse only the outer envelope here; MatchRoom validates every field it uses. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length === 0 || raw.length > 65_536) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const type = (value as { type?: unknown }).type;
    if (typeof type !== 'string' || !CLIENT_MESSAGE_TYPES.has(type)) return null;
    const envelope=value as Record<string,unknown>;
    if(type==='source_escape'&&Object.keys(envelope).some(key=>key!=='type'&&key!=='sourceRemoteView'))return null;
    if(type==='join'&&envelope.sourceRemoteView!==undefined&&typeof envelope.sourceRemoteView!=='boolean')return null;
    if((type==='transform'||type==='shoot'||type==='source_escape')&&envelope.sourceRemoteView!==undefined&&!isOriginalRemoteViewWireTrace(envelope.sourceRemoteView))return null;
    if(type==='shoot'&&envelope.shot&&typeof envelope.shot==='object'){
      const shot=envelope.shot as Record<string,unknown>;
      if(shot.sourceRotation!==undefined&&!originalProjectileRotationMatchesDirection(shot.sourceRotation,shot.direction))return null;
    }
    return value as ClientMessage;
  } catch {
    return null;
  }
}

export function isOriginalRemoteViewWireTrace(value:unknown):value is import('../shared/protocol').OriginalRemoteViewWireTrace {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const trace=value as Record<string,unknown>;
  const count=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0;
  if(!count(trace.generation)||!count(trace.callbacks)||!Array.isArray(trace.receipts)||trace.receipts.length>64)return false;
  let lastTick=-1,lastCallbacks=-1;
  for(const receipt of trace.receipts){
    if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))return false;
    if(!count(receipt.tick)||!count(receipt.callbacks)||receipt.tick<=lastTick||receipt.callbacks<lastCallbacks||receipt.callbacks>trace.callbacks)return false;
    lastTick=receipt.tick;lastCallbacks=receipt.callbacks;
  }
  return true;
}

export function isWeaponId(value: unknown): value is WeaponId {
  return isHitscanWeaponId(value) || isExplosiveWeaponId(value);
}

export function isHitscanWeaponId(value: unknown): value is HitscanWeaponId {
  return value === 'pistol' || value === 'shotgun' || value === 'rifle' || value === 'sniper';
}

export function isExplosiveWeaponId(value: unknown): value is ExplosiveWeaponId {
  return value === 'launcher' || value === 'rpg';
}

export function isFiniteVec3(value: unknown): value is Vec3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const vector = value as Partial<Vec3>;
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}
