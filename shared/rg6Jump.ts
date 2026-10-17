import type {Vec3} from './protocol';

/** The surviving old-version guide documents RG6 ground-shot assisted jumps.
 * Force, tolerances and cap below are authored approximations, not recovered
 * original constants. Damage, ammunition and ordinary jump rules still apply.
 */
export const RG6_JUMP_INCREMENT=8;
export const RG6_JUMP_MAX_SPEED=18;
export interface RG6JumpIntent {forward:boolean;jump:boolean}

export function rg6JumpLaunchEligible(weapon:string,direction:Vec3,intent?:RG6JumpIntent):boolean {
  const magnitude=Math.hypot(direction.x,direction.y,direction.z);
  return weapon==='launcher'&&intent?.forward===true&&intent.jump===true
    &&Number.isFinite(magnitude)&&magnitude>0&&direction.y/magnitude<=-.94;
}

export function rg6JumpBlastEligible(feet:Vec3,blast:Vec3):boolean {
  const below=feet.y-blast.y;
  return below>=-.2&&below<=2.5&&Math.hypot(feet.x-blast.x,feet.z-blast.z)<=1.6;
}

export function rg6JumpVelocity(current:number):number {
  return Math.min(RG6_JUMP_MAX_SPEED,Math.max(0,current)+RG6_JUMP_INCREMENT);
}
