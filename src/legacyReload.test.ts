import { describe, expect, it } from 'vitest';
import { usesImmediateReload, weaponReloadDuration } from '../shared/legacyReload';

describe('recovered edition-specific reload scheduling', () => {
  it('uses Woodland thirty-frame lockout for each weapon', () => {
    for (const weapon of ['pistol', 'shotgun', 'rifle', 'launcher', 'rpg', 'sniper']) {
      expect(weaponReloadDuration('woodlands', weapon, 2.7)).toBe(1);
    }
    expect(usesImmediateReload('woodlands')).toBe(true);
  });
  it('keeps Barrack ahead-counter plus per-weapon wait instead of Woodland countdown', () => {
    expect(weaponReloadDuration('barrack', 'rifle', 1.75)).toBe(22 / 30);
    expect(weaponReloadDuration('barrack', 'shotgun', 2.1)).toBe(35 / 30);
    expect(weaponReloadDuration('barrack', 'sniper', 2.25)).toBe(70 / 30);
    expect(usesImmediateReload('barrack')).toBe(true);
  });
  it('retains archival/unselected behavior and unknown weapon fallback', () => {
    expect(usesImmediateReload(undefined)).toBe(false);
    expect(usesImmediateReload('winter')).toBe(false);
    expect(weaponReloadDuration('winter', 'rifle', 1.75)).toBe(1.75);
    expect(weaponReloadDuration(undefined, 'sniper', 2.25)).toBe(2.25);
    expect(weaponReloadDuration('barrack', 'unknown', 3)).toBe(3);
  });
});
