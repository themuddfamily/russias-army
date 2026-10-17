import type { WeaponId } from './weapons';

/** A renderer-agnostic XYZ tuple. Angles are expressed in radians. */
export type AnimationPresentation = 'legacy' | 'modern';

export type VisualVector3 = readonly [x: number, y: number, z: number];

/** Neutral-relative transform that can be added to a view-model part's authored pose. */
export interface VisualTransform {
  readonly position: VisualVector3;
  readonly rotation: VisualVector3;
}

export type ReloadPart = 'magazine' | 'action' | 'cylinder' | 'rocket';
export type CasingKind = 'pistol-brass' | 'rifle-brass' | 'shotgun-shell';

export interface RecoilImpulse {
  /** Instantaneous neutral-relative root displacement. */
  readonly position: VisualVector3;
  /** Instantaneous neutral-relative root rotation. */
  readonly rotation: VisualVector3;
  /** Presentation-only spring settling time, in seconds. */
  readonly recovery: number;
}

export interface WeaponVisualProfile {
  /** Presentation-only draw/equip duration. It does not affect weapon availability. */
  readonly equipDuration: number;
  readonly recoilImpulse: RecoilImpulse;
  /** Null for weapons which retain their case or projectile container. */
  readonly casingKind: CasingKind | null;
  /** Uniform multiplier for the shared muzzle-flash sprite. */
  readonly muzzleScale: number;
}

export interface ReloadVisualPose {
  readonly root: VisualTransform;
  /** Only contains parts that exist on this weapon's view-model metadata. */
  readonly parts: Readonly<Partial<Record<ReloadPart, VisualTransform>>>;
}

interface ReloadMotion {
  readonly rootPosition: VisualVector3;
  readonly rootRotation: VisualVector3;
  readonly rootPhase: readonly [start: number, peak: number, end: number];
  readonly parts: Readonly<Partial<Record<ReloadPart, PartMotion>>>;
}

interface PartMotion {
  readonly position: VisualVector3;
  readonly rotation: VisualVector3;
  readonly phase: readonly [start: number, peak: number, end: number];
}

const vec = (x: number, y: number, z: number): VisualVector3 => Object.freeze([x, y, z]);

const impulse = (
  position: VisualVector3,
  rotation: VisualVector3,
  recovery: number,
): RecoilImpulse => Object.freeze({ position, rotation, recovery });

/**
 * Presentation parameters are intentionally separate from WeaponSpec: none of
 * these values changes firing cadence, reload completion, damage, or ammo.
 */
export const WEAPON_VISUAL_PROFILES: Readonly<Record<WeaponId, WeaponVisualProfile>> = Object.freeze({
  pistol: Object.freeze({
    equipDuration: .24,
    recoilImpulse: impulse(vec(.004, .018, .105), vec(-.115, .018, -.025), .12),
    casingKind: 'pistol-brass',
    muzzleScale: .78,
  }),
  shotgun: Object.freeze({
    equipDuration: .38,
    recoilImpulse: impulse(vec(.008, .025, .19), vec(-.16, .008, .018), .2),
    casingKind: 'shotgun-shell',
    muzzleScale: 1.28,
  }),
  rifle: Object.freeze({
    equipDuration: .32,
    recoilImpulse: impulse(vec(.006, .012, .092), vec(-.078, .012, -.012), .105),
    casingKind: 'rifle-brass',
    muzzleScale: .96,
  }),
  launcher: Object.freeze({
    equipDuration: .43,
    recoilImpulse: impulse(vec(.012, .035, .155), vec(-.13, -.015, .026), .23),
    casingKind: null,
    muzzleScale: 1.48,
  }),
  rpg: Object.freeze({
    equipDuration: .52,
    recoilImpulse: impulse(vec(.015, .045, .205), vec(-.17, -.025, .032), .28),
    casingKind: null,
    muzzleScale: 1.82,
  }),
  sniper: Object.freeze({
    equipDuration: .46,
    recoilImpulse: impulse(vec(.006, .026, .17), vec(-.145, .01, -.014), .24),
    casingKind: 'rifle-brass',
    muzzleScale: 1.16,
  }),
});

/** Visible AK47 refill-associated rise, sampled from the silent 10 Hz Woodland clip.
 * This is presentation time, not a measured reload/input/attack lockout.
 */
export const LEGACY_RIFLE_REFILL_DURATION = .8;
const LEGACY_RIFLE_VISUAL_PROFILE: WeaponVisualProfile = Object.freeze({
  ...WEAPON_VISUAL_PROFILES.rifle,
  equipDuration: .9,
});

/** Only the directly observed AK47 equip duration differs in legacy mode. */
export function getWeaponVisualProfile(
  weapon: WeaponId,
  presentation: AnimationPresentation = 'modern',
): WeaponVisualProfile {
  return presentation === 'legacy' && weapon === 'rifle'
    ? LEGACY_RIFLE_VISUAL_PROFILE : WEAPON_VISUAL_PROFILES[weapon];
}

const RELOAD_MOTIONS: Readonly<Record<WeaponId, ReloadMotion>> = Object.freeze({
  pistol: {
    rootPosition: vec(-.085, -.165, .115),
    rootRotation: vec(.16, -.12, .58),
    rootPhase: [0, .36, 1],
    parts: {
      magazine: {
        position: vec(.035, -.43, .07), rotation: vec(-.08, .1, .08), phase: [.08, .34, .76],
      },
      action: {
        position: vec(0, 0, .16), rotation: vec(0, 0, 0), phase: [.68, .82, .96],
      },
    },
  },
  shotgun: {
    rootPosition: vec(.045, -.19, .14),
    rootRotation: vec(.24, .08, -.38),
    rootPhase: [.02, .44, .98],
    parts: {
      action: {
        position: vec(0, -.018, .31), rotation: vec(.02, 0, 0), phase: [.38, .6, .9],
      },
    },
  },
  rifle: {
    rootPosition: vec(-.105, -.235, .15),
    rootRotation: vec(.13, -.19, .52),
    rootPhase: [.02, .4, .99],
    parts: {
      magazine: {
        position: vec(.12, -.49, .105), rotation: vec(-.2, .08, -.22), phase: [.1, .38, .73],
      },
      action: {
        position: vec(.018, 0, .145), rotation: vec(0, 0, .05), phase: [.7, .82, .95],
      },
    },
  },
  launcher: {
    rootPosition: vec(.12, -.255, .18),
    rootRotation: vec(.18, .22, -.48),
    rootPhase: [.01, .43, .99],
    parts: {
      cylinder: {
        position: vec(.23, -.08, .06), rotation: vec(.18, .7, 1.08), phase: [.12, .46, .84],
      },
    },
  },
  rpg: {
    rootPosition: vec(-.13, -.285, .22),
    rootRotation: vec(.11, -.28, .45),
    rootPhase: [.02, .48, .99],
    parts: {
      rocket: {
        position: vec(.08, .16, -.92), rotation: vec(0, .08, -.06), phase: [.1, .48, .88],
      },
    },
  },
  sniper: {
    rootPosition: vec(-.12, -.22, .16),
    rootRotation: vec(.19, -.14, .41),
    rootPhase: [.02, .42, .99],
    parts: {
      magazine: {
        position: vec(-.08, -.455, .12), rotation: vec(-.12, -.08, .18), phase: [.12, .42, .76],
      },
      action: {
        position: vec(.055, .025, .19), rotation: vec(.08, 0, -.16), phase: [.7, .84, .96],
      },
    },
  },
});

/** Clamps all real values, including infinities and NaN, into a safe unit range. */
export function clampVisualProgress(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Cubic Hermite easing with zero velocity at both ends. */
export function smoothVisualProgress(value: number): number {
  const t = clampVisualProgress(value);
  return t * t * (3 - 2 * t);
}

function phaseWeight(progress: number, phase: readonly [number, number, number]): number {
  const [start, peak, end] = phase;
  if (progress <= start || progress >= end) return 0;
  if (progress < peak) return smoothVisualProgress((progress - start) / (peak - start));
  return 1 - smoothVisualProgress((progress - peak) / (end - peak));
}

function scaleVector(value: VisualVector3, weight: number): VisualVector3 {
  return [value[0] * weight, value[1] * weight, value[2] * weight];
}

function sampleTransform(
  position: VisualVector3,
  rotation: VisualVector3,
  phase: readonly [number, number, number],
  progress: number,
): VisualTransform {
  const weight = phaseWeight(progress, phase);
  return { position: scaleVector(position, weight), rotation: scaleVector(rotation, weight) };
}

/**
 * Samples presentation-only reload offsets at normalized gameplay progress.
 * Input is clamped and the returned root and every applicable part are exactly
 * neutral at both endpoints, making interruption/reset handling deterministic.
 */
export function sampleReloadPose(
  weapon: WeaponId,
  progress: number,
  presentation: AnimationPresentation = 'modern',
): ReloadVisualPose {
  // The source resolves a lowered/raised rifle only when its ammunition refills.
  // Input-to-refill motion is unmeasured: avoid inventing magazine/bolt handling
  // throughout the copy's independent gameplay reload lockout. The caller plays
  // sampleEquipPose over LEGACY_RIFLE_REFILL_DURATION on the actual refill event.
  if (presentation === 'legacy' && weapon === 'rifle') {
    return { root: { position: vec(0, 0, 0), rotation: vec(0, 0, 0) }, parts: {} };
  }
  const p = clampVisualProgress(progress);
  const motion = RELOAD_MOTIONS[weapon];
  const parts: Partial<Record<ReloadPart, VisualTransform>> = {};

  for (const part of Object.keys(motion.parts) as ReloadPart[]) {
    const partMotion = motion.parts[part];
    if (partMotion) {
      parts[part] = sampleTransform(partMotion.position, partMotion.rotation, partMotion.phase, p);
    }
  }

  return {
    root: sampleTransform(motion.rootPosition, motion.rootRotation, motion.rootPhase, p),
    parts,
  };
}


/**
 * Presentation-only neutral-relative draw pose. Legacy AK47 starts low and
 * inward, then rises with little roll, as seen at 1.5–2.4 and 21.6–22.4 seconds.
 * Use elapsed / selected presentation duration; this never changes availability.
 * The authored drop amplitude is calibrated to the captured screen footprint,
 * not a claim about original camera/world units.
 * Other weapons preserve the copy's existing generic equip offsets.
 */
export function sampleEquipPose(
  weapon: WeaponId,
  progress: number,
  presentation: AnimationPresentation = 'modern',
): VisualTransform {
  const weight = 1 - smoothVisualProgress(progress);
  const legacyRifle = presentation === 'legacy' && weapon === 'rifle';
  return {
    position: scaleVector(legacyRifle ? vec(-.15, -.70, .08) : vec(0, -.34, .08), weight),
    rotation: scaleVector(legacyRifle ? vec(.2, -.04, 0) : vec(0, 0, .26), weight),
  };
}
