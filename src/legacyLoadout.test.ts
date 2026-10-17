import { describe, expect, it } from 'vitest';
import { getLegacySpawnLoadout, LEGACY_RELOAD_TARGETS } from '../shared/legacyLoadout';
import { weaponReloadTarget } from '../shared/weaponReloadTarget';

describe('recovered publisher loadout rules', () => {
  it.each(['barrack', 'woodlands'])('preserves %s spawn and distinct Dragunov refill capacity', map => {
    const loadout = getLegacySpawnLoadout(map)!;
    expect(loadout.equipped).toBe('launcher');
    expect(loadout.ammo).toEqual({ pistol: 8, shotgun: 6, rifle: 28, launcher: 6, rpg: 1, sniper: 30 });
    expect(loadout.reserve).toEqual({ pistol: 54, shotgun: 24, rifle: 140, launcher: 18, rpg: 12, sniper: 12 });
    for (const [weapon, target] of Object.entries(LEGACY_RELOAD_TARGETS)) {
      expect(weaponReloadTarget(map, weapon, 10)).toBe(target);
    }
    loadout.ammo.sniper = 0;
    expect(getLegacySpawnLoadout(map)!.ammo.sniper).toBe(30);
  });
  it('keeps unselected and archival capacities', () => {
    expect(getLegacySpawnLoadout(undefined)).toBeUndefined();
    expect(getLegacySpawnLoadout('winter')).toBeUndefined();
    expect(weaponReloadTarget('winter', 'sniper', 10)).toBe(10);
    expect(weaponReloadTarget(undefined, 'rifle', 30)).toBe(30);
  });
});
