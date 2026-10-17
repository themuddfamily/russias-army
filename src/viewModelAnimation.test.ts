import { describe, expect, it } from 'vitest';
import type { WeaponId } from './weapons';
import {
  clampVisualProgress,
  getWeaponVisualProfile,
  sampleEquipPose,
  LEGACY_RIFLE_REFILL_DURATION,
  sampleReloadPose,
  smoothVisualProgress,
  WEAPON_VISUAL_PROFILES,
  type ReloadVisualPose,
} from './viewModelAnimation';

const WEAPONS: WeaponId[] = ['pistol', 'shotgun', 'rifle', 'launcher', 'rpg', 'sniper'];

function scalars(pose: ReloadVisualPose): number[] {
  const values = [...pose.root.position, ...pose.root.rotation];
  for (const part of Object.values(pose.parts)) {
    if (part) values.push(...part.position, ...part.rotation);
  }
  return values;
}

describe('view-model visual profiles', () => {
  it('defines finite, positive presentation values for all six weapons', () => {
    expect(Object.keys(WEAPON_VISUAL_PROFILES).sort()).toEqual([...WEAPONS].sort());

    for (const weapon of WEAPONS) {
      const profile = WEAPON_VISUAL_PROFILES[weapon];
      expect(profile.equipDuration).toBeGreaterThan(0);
      expect(profile.muzzleScale).toBeGreaterThan(0);
      expect(profile.recoilImpulse.recovery).toBeGreaterThan(0);
      expect([
        profile.equipDuration,
        profile.muzzleScale,
        profile.recoilImpulse.recovery,
        ...profile.recoilImpulse.position,
        ...profile.recoilImpulse.rotation,
      ].every(Number.isFinite)).toBe(true);
    }
  });

  it('excludes retained launcher and RPG cases while classifying ejecting weapons', () => {
    expect(WEAPON_VISUAL_PROFILES.launcher.casingKind).toBeNull();
    expect(WEAPON_VISUAL_PROFILES.rpg.casingKind).toBeNull();
    expect(WEAPON_VISUAL_PROFILES.pistol.casingKind).toBe('pistol-brass');
    expect(WEAPON_VISUAL_PROFILES.shotgun.casingKind).toBe('shotgun-shell');
    expect(WEAPON_VISUAL_PROFILES.rifle.casingKind).toBe('rifle-brass');
    expect(WEAPON_VISUAL_PROFILES.sniper.casingKind).toBe('rifle-brass');
  });
});

describe('sampleReloadPose', () => {
  it('is exactly neutral at both endpoints and clamps overrun for every weapon', () => {
    for (const weapon of WEAPONS) {
      const start = sampleReloadPose(weapon, 0);
      const end = sampleReloadPose(weapon, 1);
      expect(scalars(start).every(value => value === 0)).toBe(true);
      expect(scalars(end).every(value => value === 0)).toBe(true);
      expect(sampleReloadPose(weapon, -10)).toEqual(start);
      expect(sampleReloadPose(weapon, Number.NaN)).toEqual(start);
      expect(sampleReloadPose(weapon, Number.POSITIVE_INFINITY)).toEqual(end);
    }
  });

  it('provides finite, deterministic, weapon-specific middle phases', () => {
    const middleRoots = new Set<string>();

    for (const weapon of WEAPONS) {
      const first = sampleReloadPose(weapon, .5);
      const second = sampleReloadPose(weapon, .5);
      expect(first).toEqual(second);
      expect(scalars(first).every(Number.isFinite)).toBe(true);
      expect(scalars(first).some(value => Math.abs(value) > 1e-5)).toBe(true);
      expect(Object.keys(first.parts).length).toBeGreaterThan(0);
      expect(Object.values(first.parts).some(part => part && scalars({ root: part, parts: {} }).some(value => Math.abs(value) > 1e-5))).toBe(true);
      middleRoots.add(first.root.position.concat(first.root.rotation).map(value => value.toFixed(5)).join(','));
    }

    expect(middleRoots.size).toBe(WEAPONS.length);
  });

  it('uses only parts applicable to each weapon mechanism', () => {
    expect(Object.keys(sampleReloadPose('pistol', .5).parts).sort()).toEqual(['action', 'magazine']);
    expect(Object.keys(sampleReloadPose('rifle', .5).parts).sort()).toEqual(['action', 'magazine']);
    expect(Object.keys(sampleReloadPose('sniper', .5).parts).sort()).toEqual(['action', 'magazine']);
    expect(Object.keys(sampleReloadPose('shotgun', .5).parts)).toEqual(['action']);
    expect(Object.keys(sampleReloadPose('launcher', .5).parts)).toEqual(['cylinder']);
    expect(Object.keys(sampleReloadPose('rpg', .5).parts)).toEqual(['rocket']);
  });

  it('smoothly clamps helper progress and never returns non-finite values', () => {
    expect(clampVisualProgress(Number.NaN)).toBe(0);
    expect(clampVisualProgress(-1)).toBe(0);
    expect(clampVisualProgress(2)).toBe(1);
    expect(smoothVisualProgress(0)).toBe(0);
    expect(smoothVisualProgress(.5)).toBe(.5);
    expect(smoothVisualProgress(1)).toBe(1);
    expect(smoothVisualProgress(Number.POSITIVE_INFINITY)).toBe(1);
  });
});


describe('Woodland AK47 presentation', () => {
  it('limits measured equip/refill durations to presentation and preserves other profiles', () => {
    expect(getWeaponVisualProfile('rifle','legacy').equipDuration).toBe(.9);
    expect(LEGACY_RIFLE_REFILL_DURATION).toBe(.8);
    expect(getWeaponVisualProfile('rifle','modern')).toBe(WEAPON_VISUAL_PROFILES.rifle);
    expect(getWeaponVisualProfile('rifle','legacy').recoilImpulse).toBe(WEAPON_VISUAL_PROFILES.rifle.recoilImpulse);
    for(const weapon of WEAPONS.filter(id=>id!=='rifle')) {
      expect(getWeaponVisualProfile(weapon,'legacy')).toBe(WEAPON_VISUAL_PROFILES[weapon]);
      expect(sampleReloadPose(weapon,.4,'legacy')).toEqual(sampleReloadPose(weapon,.4));
      expect(sampleEquipPose(weapon,.4,'legacy')).toEqual(sampleEquipPose(weapon,.4));
    }
  });
  it('starts the legacy rifle low and inward and raises it continuously without magazine exchange', () => {
    const start=sampleEquipPose('rifle',0,'legacy');
    expect(start.position[0]).toBeLessThan(0);
    expect(start.position[1]).toBe(-.70);
    expect(sampleEquipPose('rifle',.5,'legacy').position[1]).toBe(-.35);
    expect(start.rotation[2]).toBe(0);
    let previous=start.position[1];
    for(let frame=1;frame<=9;frame++) {
      const pose=sampleEquipPose('rifle',frame/9,'legacy');
      expect(pose.position[1]).toBeGreaterThanOrEqual(previous);previous=pose.position[1];
    }
    expect(sampleEquipPose('rifle',1,'legacy').position.every(value=>value===0)).toBe(true);
    expect(sampleEquipPose('rifle',1,'legacy').rotation.every(value=>value===0)).toBe(true);
    for(const progress of [0,.1,.5,.9,1]) {
      const reload=sampleReloadPose('rifle',progress,'legacy');
      expect(scalars(reload).every(value=>value===0)).toBe(true);
      expect(reload.parts).toEqual({});
    }
  });
  it('retains the exact modern equip transform and clamps invalid presentation times', () => {
    const modern=sampleEquipPose('rifle',0);
    expect(modern.position).toEqual([0,-.34,.08]);
    expect(modern.rotation).toEqual([0,0,.26]);
    expect(sampleEquipPose('rifle',NaN,'legacy')).toEqual(sampleEquipPose('rifle',0,'legacy'));
    expect(sampleEquipPose('rifle',Infinity,'legacy')).toEqual(sampleEquipPose('rifle',1,'legacy'));
    expect(sampleEquipPose('rifle',-1,'legacy')).toEqual(sampleEquipPose('rifle',0,'legacy'));
  });
});
