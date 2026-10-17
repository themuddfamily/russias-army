import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createSecurityFenceBlueprint,
  createSecurityInfrastructureBlueprint,
  createSecurityLampBlueprint,
  SECURITY_FENCE_RUNS,
  SECURITY_LAMP_LOCATIONS,
  SECURITY_TRIANGLES_PER_PART,
  type SecurityBoxPart,
} from './securityInfrastructureBlueprint';

function worldBounds(parts: readonly SecurityBoxPart[]): THREE.Box3 {
  const bounds = new THREE.Box3();
  const unitBox = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5));
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

describe('createSecurityInfrastructureBlueprint', () => {
  it('preserves every original lamp anchor and fence run', () => {
    expect(SECURITY_LAMP_LOCATIONS.map(({ x, z }) => [x, z])).toEqual([
      [-7, -23], [9, 21], [36, -8], [-37, 1],
    ]);
    expect(SECURITY_FENCE_RUNS.map(({ x, z, length, rotationY }) => [x, z, length, rotationY])).toEqual([
      [47, 7, 20, Math.PI / 2],
      [-42, -17, 25, Math.PI / 2],
      [18, 43, 18, 0],
    ]);

    const blueprint = createSecurityInfrastructureBlueprint();
    for (const location of SECURITY_LAMP_LOCATIONS) {
      const base = blueprint.parts.find((part) => part.name === `${location.id}-base`)!;
      expect([base.position[0], base.position[2]]).toEqual([location.x, location.z]);
    }
    for (const run of SECURITY_FENCE_RUNS) {
      expect(blueprint.colliders.find((collider) => collider.runId === run.id)?.position).toEqual([
        run.x, 1.075, run.z,
      ]);
    }
  });

  it('uses all four injected material slots within the strict box budget', () => {
    const blueprint = createSecurityInfrastructureBlueprint();
    expect(blueprint.stats).toEqual({
      parts: 63,
      triangles: 756,
      lampParts: 32,
      fenceParts: 31,
      lamps: 4,
      fences: 3,
      fencePanels: 22,
      materialCounts: { steel: 37, dark: 18, glass: 4, accent: 4 },
    });
    expect(blueprint.stats.parts).toBeLessThanOrEqual(180);
    expect(blueprint.stats.triangles).toBeLessThanOrEqual(2160);
    expect(blueprint.stats.triangles).toBe(blueprint.stats.parts * SECURITY_TRIANGLES_PER_PART);
    expect(new Set(blueprint.parts.map((part) => part.materialSlot))).toEqual(
      new Set(['steel', 'dark', 'glass', 'accent']),
    );
    expect(new Set(blueprint.parts.map((part) => part.name)).size).toBe(blueprint.parts.length);
  });

  it('returns explicit AABBs matching the three complete rotated run footprints', () => {
    const { colliders } = createSecurityInfrastructureBlueprint();
    expect(colliders).toEqual([
      {
        runId: 'fence-east', localSize: [20, 2.15, .12], sourceRotationY: Math.PI / 2,
        size: [.12, 2.15, 20], position: [47, 1.075, 7],
        min: [46.94, 0, -3], max: [47.06, 2.15, 17],
      },
      {
        runId: 'fence-west', localSize: [25, 2.15, .12], sourceRotationY: Math.PI / 2,
        size: [.12, 2.15, 25], position: [-42, 1.075, -17],
        min: [-42.06, 0, -29.5], max: [-41.94, 2.15, -4.5],
      },
      {
        runId: 'fence-north', localSize: [18, 2.15, .12], sourceRotationY: 0,
        size: [18, 2.15, .12], position: [18, 1.075, 43],
        min: [9, 0, 42.94], max: [27, 2.15, 43.06],
      },
    ]);

    for (const run of SECURITY_FENCE_RUNS) {
      const fence = createSecurityFenceBlueprint(run);
      const bounds = worldBounds(fence.parts);
      const collider = fence.collider;
      expect(bounds.min.x).toBeGreaterThanOrEqual(collider.min[0] - 1e-9);
      expect(bounds.min.y).toBeGreaterThanOrEqual(collider.min[1] - 1e-9);
      expect(bounds.min.z).toBeGreaterThanOrEqual(collider.min[2] - 1e-9);
      expect(bounds.max.x).toBeLessThanOrEqual(collider.max[0] + 1e-9);
      expect(bounds.max.y).toBeLessThanOrEqual(collider.max[1] + 1e-9);
      expect(bounds.max.z).toBeLessThanOrEqual(collider.max[2] + 1e-9);
    }
  });

  it('builds grounded cantilever lamps with an angled arm and downward lens', () => {
    for (const location of SECURITY_LAMP_LOCATIONS) {
      const parts = createSecurityLampBlueprint(location);
      expect(parts).toHaveLength(8);
      expect(parts.every((part) => part.structureId === location.id && part.kind === 'lamp')).toBe(true);
      expect(parts.find((part) => part.feature === 'arm' && part.name.endsWith('angled-arm'))?.rotation?.[2]).toBeLessThan(0);
      const housing = parts.find((part) => part.feature === 'luminaire')!;
      const lens = parts.find((part) => part.feature === 'lens')!;
      expect(lens.position[1]).toBeLessThan(housing.position[1]);
      const bounds = worldBounds(parts);
      expect(bounds.min.y).toBe(0);
      expect(bounds.max.y).toBeGreaterThan(4.8);
      expect(bounds.max.y).toBeLessThan(5);
      expect(bounds.max.x).toBeGreaterThan(location.x + 1.2);
    }
  });

  it('frames every chain-link run with posts and rails and applies its rotation', () => {
    for (const run of SECURITY_FENCE_RUNS) {
      const blueprint = createSecurityFenceBlueprint(run);
      const posts = blueprint.parts.filter((part) => part.feature === 'post');
      const rails = blueprint.parts.filter((part) => part.feature === 'rail');
      const braces = blueprint.parts.filter((part) => part.feature === 'brace');
      expect(posts).toHaveLength(blueprint.panels + 1);
      expect(rails).toHaveLength(2);
      expect(braces).toHaveLength(0);
      expect(blueprint.parts.every((part) => part.rotation?.[1] === run.rotationY)).toBe(true);
    }
  });

  it('is deterministic, deeply immutable, finite, and validates malformed input', () => {
    const first = createSecurityInfrastructureBlueprint();
    expect(first).toEqual(createSecurityInfrastructureBlueprint());
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parts)).toBe(true);
    expect(Object.isFrozen(first.parts[0])).toBe(true);
    expect(Object.isFrozen(first.parts[0].size)).toBe(true);
    expect(Object.isFrozen(first.colliders)).toBe(true);
    expect(Object.isFrozen(first.colliders[0])).toBe(true);
    for (const part of first.parts) {
      expect(part.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(part.position.every(Number.isFinite)).toBe(true);
      expect(part.rotation?.every(Number.isFinite) ?? true).toBe(true);
    }

    expect(() => createSecurityLampBlueprint({ id: '', x: 0, z: 0 })).toThrow(RangeError);
    expect(() => createSecurityLampBlueprint({ id: 'bad', x: Number.NaN, z: 0 })).toThrow(RangeError);
    expect(() => createSecurityFenceBlueprint({ id: 'bad', x: 0, z: 0, length: .1, rotationY: 0 })).toThrow(RangeError);
    expect(() => createSecurityFenceBlueprint({ id: 'bad', x: 0, z: 0, length: 2, rotationY: Infinity })).toThrow(RangeError);
  });
});
