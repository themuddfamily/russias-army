import type {Vec3} from './protocol';

/** Ordinary recovered goody rotations keep source Y=0. Angles are degrees;
 * pitch/yaw remain unwrapped so principal-asin branch/vertical yaw is retained.
 */
export function isOriginalProjectileRotation(value:unknown):value is Vec3 {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const v=value as Partial<Vec3>;
  return Number.isFinite(v.x)&&v.y===0&&Number.isFinite(v.z);
}
/** Recovered cosine3D, then source Z-up to copy Y-up. */
export function originalProjectileDirection(rotation:Readonly<Vec3>):Vec3 {
  if(!isOriginalProjectileRotation(rotation))throw Error('Invalid original projectile source rotation');
  const pitch=(rotation.x%360)*Math.PI/180,yaw=(rotation.z%360)*Math.PI/180;
  return {x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
}
/** Direction can verify a rotation but cannot uniquely reconstruct its basis. */
export function originalProjectileRotationMatchesDirection(rotation:unknown,direction:unknown,tolerance=1e-7):boolean {
  if(!isOriginalProjectileRotation(rotation)||!direction||typeof direction!=='object'||Array.isArray(direction)||!Number.isFinite(tolerance)||tolerance<0)return false;
  const d=direction as Partial<Vec3>;
  if(!Number.isFinite(d.x)||!Number.isFinite(d.y)||!Number.isFinite(d.z))return false;
  const length=Math.hypot(d.x!,d.y!,d.z!);if(length===0||!Number.isFinite(length))return false;
  const expected=originalProjectileDirection(rotation);
  return Math.hypot(expected.x-d.x!/length,expected.y-d.y!/length,expected.z-d.z!/length)<=tolerance;
}
