import type {Vec3} from './protocol';

/** Director's documented pointAt default(-Z front,+Y up), source Z-up target,
 * then Euler/world Z minus90 under the existing RzRyRx reconstruction.
 * Native Euler/asset overrides and parallel-up fallback remain adapters. */
export function originalGrenadeBasisFromDirection(direction:Readonly<Vec3>):{x:Vec3;y:Vec3;z:Vec3} {
  const length=Math.hypot(direction.x,direction.y,direction.z);
  if(![direction.x,direction.y,direction.z,length].every(Number.isFinite)||length===0)throw Error('Invalid original grenade direction');
  const p=direction.x/length,q=direction.y/length,r=direction.z/length,h=Math.hypot(p,r);
  // A direction parallel to source up does not determine pointAt roll/yaw.
  // Use explicit heading0 for standalone fixtures rather than divide byzero.
  if(h===0)return {x:{x:0,y:0,z:1},y:{x:-q,y:0,z:0},z:{x:0,y:-q,z:0}};
  return {x:{x:-p/h,y:0,z:-r/h},y:{x:q*r/h,y:h,z:-q*p/h},z:{x:r,y:-q,z:-p}};
}
