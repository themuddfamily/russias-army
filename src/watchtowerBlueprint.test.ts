import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createWatchtowerBlueprint,
  WATCHTOWER_TRIANGLES_PER_PART,
  type WatchtowerBoxPart,
} from './watchtowerBlueprint';

function worldBounds(parts: readonly WatchtowerBoxPart[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  const unitBox = new THREE.Box3(
    new THREE.Vector3(-.5, -.5, -.5),
    new THREE.Vector3(.5, .5, .5),
  );
  for (const part of parts) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...part.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
      new THREE.Vector3(...part.size),
    );
    bounds.union(unitBox.clone().applyMatrix4(matrix));
  }
  return bounds;
}

describe('createWatchtowerBlueprint', () => {
  it('is deterministic, translated by its requested center, and validates coordinates', () => {
    expect(createWatchtowerBlueprint(12, -8)).toEqual(createWatchtowerBlueprint(12, -8));
    const origin = createWatchtowerBlueprint(0, 0);
    const translated = createWatchtowerBlueprint(12, -8);
    for (let index = 0; index < origin.length; index++) {
      expect(translated[index].position[0] - origin[index].position[0]).toBeCloseTo(12, 12);
      expect(translated[index].position[1]).toBe(origin[index].position[1]);
      expect(translated[index].position[2] - origin[index].position[2]).toBeCloseTo(-8, 12);
    }
    expect(() => createWatchtowerBlueprint(Number.NaN, 0)).toThrow(RangeError);
    expect(() => createWatchtowerBlueprint(0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('keeps the structural feet and legs symmetric around the tower center', () => {
    const structural = createWatchtowerBlueprint(0, 0).filter(
      part => part.feature === 'footing' || part.feature === 'leg',
    );
    for (const part of structural) {
      for (const [sx, sz] of [[-1, 1], [1, -1], [-1, -1]] as const) {
        expect(structural.some(candidate =>
          candidate.feature === part.feature
          && candidate.position[0] === part.position[0] * sx
          && candidate.position[1] === part.position[1]
          && candidate.position[2] === part.position[2] * sz
          && candidate.size.every((value, axis) => value === part.size[axis]),
        )).toBe(true);
      }
    }
  });

  it('uses every material slot and stays within the box/triangle budget', () => {
    const parts = createWatchtowerBlueprint(0, 0);
    expect(new Set(parts.map(part => part.materialSlot))).toEqual(
      new Set(['steel', 'panel', 'dark', 'snow', 'glass', 'accent']),
    );
    expect(parts.length).toBeGreaterThanOrEqual(50);
    expect(parts.length).toBeLessThanOrEqual(90);
    expect(parts.length * WATCHTOWER_TRIANGLES_PER_PART).toBeLessThanOrEqual(1080);
    expect(new Set(parts.map(part => part.name)).size).toBe(parts.length);
  });

  it('has a grounded 7–9 metre silhouette including its rotated roof and braces', () => {
    const bounds = worldBounds(createWatchtowerBlueprint(4, -6));
    expect(bounds.min.y).toBeGreaterThanOrEqual(0);
    expect(bounds.max.y).toBeGreaterThanOrEqual(7);
    expect(bounds.max.y).toBeLessThanOrEqual(9);
    expect(bounds.min.x).toBeGreaterThanOrEqual(1.4);
    expect(bounds.max.x).toBeLessThanOrEqual(6.6);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-8.6);
    expect(bounds.max.z).toBeLessThanOrEqual(-3.4);
  });

  it('contains full crossed bracing on all faces and a climbable rear ladder', () => {
    const parts = createWatchtowerBlueprint(0, 0);
    for (const face of ['front', 'back', 'left', 'right']) {
      const braces = parts.filter(part => part.name.startsWith(`brace-${face}-`));
      expect(braces).toHaveLength(2);
      expect(braces[0].rotation).not.toEqual(braces[1].rotation);
    }

    const ladder = parts.filter(part => part.feature === 'ladder');
    const rails = ladder.filter(part => part.name.startsWith('ladder-rail'));
    const rungs = ladder.filter(part => part.name.startsWith('ladder-rung'));
    expect(rails).toHaveLength(2);
    expect(rungs).toHaveLength(9);
    expect(new Set(ladder.map(part => part.position[2])).size).toBe(1);
    expect(rungs.map(part => part.position[1])).toEqual(
      [...rungs].map(part => part.position[1]).sort((a, b) => a - b),
    );
    expect(Math.max(...rungs.map(part => part.position[1]))).toBeLessThan(5.32);
  });
});
