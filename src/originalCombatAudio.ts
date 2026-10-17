import type {WeaponId} from './weapons';

export const ORIGINAL_COMBAT_SOUND_NAMES=['gunfire','spas12wav','resniper','repistol','reak47','rerg6','grenade1','offrock','boomnew','hurt'] as const;
export type OriginalSoundName=typeof ORIGINAL_COMBAT_SOUND_NAMES[number]|'door'|'hurtme';

/** Projectile actor launch samples use channel 7; hitscan firing uses channel 6. */
export function originalFireSound(weapon:WeaponId):OriginalSoundName {
  return ({pistol:'gunfire',shotgun:'spas12wav',rifle:'gunfire',sniper:'resniper',launcher:'grenade1',rpg:'offrock'} as const)[weapon];
}
export function originalReloadSound(weapon:WeaponId):OriginalSoundName {
  return ({pistol:'repistol',shotgun:'repistol',rifle:'reak47',sniper:'reak47',launcher:'rerg6',rpg:'rerg6'} as const)[weapon];
}
