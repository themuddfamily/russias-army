import { LEGACY_RELOAD_TARGETS } from './legacyLoadout';
import type { WeaponId } from './protocol';

/** Recovered Barrack/Woodland weaponry.whichgun scripts establish capacities.
 * The Woodland AK target also matches the preserved 12/140 → 28/124 sequence.
 * Undefined/archived maps retain the copy's existing weapon capacities.
 */
export function weaponReloadTarget(map:string|undefined,weapon:string,capacity:number):number {
  if ((map === 'barrack' || map === 'woodlands') && Object.hasOwn(LEGACY_RELOAD_TARGETS, weapon)) {
    return LEGACY_RELOAD_TARGETS[weapon as WeaponId];
  }
  return capacity;
}
