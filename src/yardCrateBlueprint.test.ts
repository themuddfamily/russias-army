import { describe, expect, it } from 'vitest';
import {
  createYardCrateBlueprint,
  YARD_CRATE_MAX_PARTS,
  YARD_CRATE_MAX_TRIANGLES,
  YARD_CRATE_PLACEMENTS,
  type YardCrateMaterialSlot,
  type YardCratePartRole,
} from './yardCrateBlueprint';

describe('createYardCrateBlueprint', () => {
  it('preserves the five original unsplit crate colliders exactly', () => {
    const { colliders } = createYardCrateBlueprint();
    expect(colliders).toEqual([
      { crateId: 'crate-south-west', size: [1.5, 1.5, 1.5], position: [-5, .75, -3], min: [-5.75, 0, -3.75], max: [-4.25, 1.5, -2.25] },
      { crateId: 'crate-center-east', size: [1.8, 1.8, 1.8], position: [4, .9, 7], min: [3.1, 0, 6.1], max: [4.9, 1.8, 7.9] },
      { crateId: 'crate-east', size: [1.35, 1.35, 1.35], position: [14, .675, -13], min: [13.325, 0, -13.675], max: [14.675, 1.35, -12.325] },
      { crateId: 'crate-north-west', size: [1.65, 1.65, 1.65], position: [-15, .825, 14], min: [-15.825, 0, 13.175], max: [-14.175, 1.65, 14.825] },
      { crateId: 'crate-far-east', size: [1.5, 1.5, 1.5], position: [33, .75, 5], min: [32.25, 0, 4.25], max: [33.75, 1.5, 5.75] },
    ]);
    for (const collider of colliders) for (let axis = 0; axis < 3; axis++) {
      expect(collider.max[axis] - collider.min[axis]).toBeCloseTo(collider.size[axis], 9);
      expect((collider.max[axis] + collider.min[axis]) / 2).toBeCloseTo(collider.position[axis], 9);
    }
  });

  it('keeps every visible detail within its authoritative collider envelope', () => {
    const { parts, colliders } = createYardCrateBlueprint();
    for (const part of parts) {
      const collider = colliders.find((candidate) => candidate.crateId === part.crateId)!;
      for (let axis = 0; axis < 3; axis++) {
        const half = part.size[axis] / 2;
        expect(part.position[axis] - half).toBeGreaterThanOrEqual(collider.min[axis] - 1e-9);
        expect(part.position[axis] + half).toBeLessThanOrEqual(collider.max[axis] + 1e-9);
      }
    }
  });

  it('gives every crate the same complete modern visual vocabulary', () => {
    const { parts } = createYardCrateBlueprint();
    const expectedRoles: Readonly<Record<YardCratePartRole, number>> = {
      'inner-core': 1,
      'face-slat': 4,
      'side-panel': 2,
      'lid-slat': 3,
      'corner-batten': 4,
      strap: 2,
      'stencil-plate': 1,
    };
    for (const placement of YARD_CRATE_PLACEMENTS) {
      const crateParts = parts.filter((part) => part.crateId === placement.id);
      expect(crateParts).toHaveLength(17);
      for (const [role, count] of Object.entries(expectedRoles)) {
        expect(crateParts.filter((part) => part.role === role)).toHaveLength(count);
      }
      expect(new Set(crateParts.map((part) => part.materialSlot))).toEqual(new Set<YardCrateMaterialSlot>(['wood', 'dark', 'accent']));
    }
  });

  it('enforces a strict static-box part and triangle budget', () => {
    const { parts, stats } = createYardCrateBlueprint();
    expect(stats).toEqual({
      crates: 5,
      parts: 85,
      partsPerCrate: 17,
      triangles: 1_020,
      roleCounts: {
        'inner-core': 5,
        'face-slat': 20,
        'side-panel': 10,
        'lid-slat': 15,
        'corner-batten': 20,
        strap: 10,
        'stencil-plate': 5,
      },
      materialCounts: { wood: 50, dark: 30, accent: 5 },
    });
    expect(parts).toHaveLength(stats.parts);
    expect(stats.parts).toBeLessThanOrEqual(YARD_CRATE_MAX_PARTS);
    expect(stats.triangles).toBeLessThanOrEqual(YARD_CRATE_MAX_TRIANGLES);
    expect(new Set(parts.map((part) => part.name)).size).toBe(parts.length);
    for (const part of parts) {
      expect(part.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(part.position.every(Number.isFinite)).toBe(true);
    }
  });

  it('is deterministic and deeply immutable', () => {
    const first = createYardCrateBlueprint();
    const second = createYardCrateBlueprint();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.parts).not.toBe(second.parts);
    expect(first.colliders).not.toBe(second.colliders);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parts)).toBe(true);
    for (const part of first.parts) {
      expect(Object.isFrozen(part)).toBe(true);
      expect(Object.isFrozen(part.size)).toBe(true);
      expect(Object.isFrozen(part.position)).toBe(true);
    }
    expect(Object.isFrozen(first.colliders)).toBe(true);
    for (const collider of first.colliders) {
      expect(Object.isFrozen(collider)).toBe(true);
      expect(Object.isFrozen(collider.size)).toBe(true);
      expect(Object.isFrozen(collider.position)).toBe(true);
      expect(Object.isFrozen(collider.min)).toBe(true);
      expect(Object.isFrozen(collider.max)).toBe(true);
    }
    expect(Object.isFrozen(first.stats)).toBe(true);
    expect(Object.isFrozen(first.stats.roleCounts)).toBe(true);
    expect(Object.isFrozen(first.stats.materialCounts)).toBe(true);
  });
});
