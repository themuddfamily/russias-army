import type { Vec3 } from '../shared/protocol';

export interface OriginalHurtOverlayState {
  blend: number;
  /** Signed source vang; retain it for Barrack's 361+vang posterFrame. */
  sourceAngle: number;
}

export function createOriginalHurtOverlay(): OriginalHurtOverlayState {
  return { blend: 0, sourceAngle: 0 };
}

/** goody.hurt updates directional art only if getplayer(attacker) succeeds.
 * sourcePointToWorld maps (sx,sy,sz) to (sx,sz,-sy)*scale; game yaw equals
 * source rot.z in radians. Consequently vectoang(player,attacker).z is
 * atan2(world delta.x,-world delta.z), independently of positive map scale.
 * Keep the signed remainder; wrapping negative angles into [0,360) would
 * change Barrack's recovered posterFrame expression. Native frame bounding
 * and the rendered rotation convention remain separate presentation adapters.
 */
export function activateOriginalHurtOverlay(
  state: OriginalHurtOverlayState,
  player: Vec3,
  attacker: Vec3 | null | undefined,
  yaw: number,
): boolean {
  if (attacker == null) return false;
  if (![player.x, player.y, player.z, attacker.x, attacker.y, attacker.z, yaw].every(Number.isFinite)) {
    throw new Error('Invalid original hurt direction');
  }
  const dx = player.x - attacker.x;
  const dz = player.z - attacker.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) throw new Error('Invalid original hurt direction');
  // The recovered handler returns vector(0,0,0) for coincident positions.
  // Vertically separated positions also have zero horizontal yaw.
  const direction = dx === 0 && dz === 0 ? 0 : Math.atan2(dx, -dz) * 180 / Math.PI;
  const angle = direction + yaw * 180 / Math.PI;
  if (!Number.isFinite(angle)) throw new Error('Invalid original hurt direction');
  state.sourceAngle = angle % 360;
  state.blend = 100;
  return true;
}

/** Called once per completed goody callback, immediately before cheatfinder. */
export function stepOriginalHurtOverlay(state: OriginalHurtOverlayState): void {
  if (state.blend > 0) state.blend -= 4;
}

/** Woodland assigns this exact angle to overlay 2; CSS signs are not inferred. */
export function originalWoodlandHurtRotation(state: OriginalHurtOverlayState): number {
  return state.sourceAngle + 180;
}
