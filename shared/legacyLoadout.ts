import type { WeaponId } from './protocol';

/** Verified in goody.new in the archived Barrack (2011) and Woodland (2015)
 * publisher scripts. Reload capacities are separate: Dragunov starts at 30
 * rounds although weaponry.whichgun sets its refill target to 28.
 */
export interface LegacySpawnLoadout {
  ammo: Record<WeaponId, number>;
  reserve: Record<WeaponId, number>;
  equipped: WeaponId;
}

export function getLegacySpawnLoadout(map: string | undefined): LegacySpawnLoadout | undefined {
  if (map !== 'barrack' && map !== 'woodlands') return undefined;
  return {
    ammo: { pistol: 8, shotgun: 6, rifle: 28, launcher: 6, rpg: 1, sniper: 30 },
    reserve: { pistol: 54, shotgun: 24, rifle: 140, launcher: 18, rpg: 12, sniper: 12 },
    equipped: 'launcher',
  };
}

/** Verified weaponry.whichgun chamber values, rather than inferred capacities. */
export const LEGACY_RELOAD_TARGETS: Readonly<Record<WeaponId, number>> = {
  pistol: 8, shotgun: 6, rifle: 28, launcher: 6, rpg: 1, sniper: 28,
};
