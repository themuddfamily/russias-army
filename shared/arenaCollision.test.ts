import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ARENA_COLLIDERS,
  ARENA_GROUND,
  ARENA_PLAYABLE_BOUNDS,
  hasArenaLineOfSight,
  isInsideArenaPlayableBounds,
  raycastArena,
  type ArenaColliderKind,
} from './arenaCollision';

describe('arena collision manifest', () => {
  it('preserves the exact ordered 95-volume gameplay contract', () => {
    expect(ARENA_COLLIDERS).toHaveLength(95);
    const counts = Object.fromEntries(
      [...new Set(ARENA_COLLIDERS.map((collider) => collider.kind))]
        .map((kind) => [kind, ARENA_COLLIDERS.filter((collider) => collider.kind === kind).length]),
    ) as Record<ArenaColliderKind, number>;
    expect(counts).toEqual({
      building: 46,
      interior: 11,
      barrier: 4,
      crate: 5,
      sandbag: 6,
      watchtower: 10,
      fence: 3,
      barrel: 5,
      transport: 1,
      perimeter: 4,
    });
    expect(ARENA_COLLIDERS.map((collider) => collider.id).slice(0, 3)).toEqual([
      'building:block-01:rear-wall',
      'building:block-01:west-wall',
      'building:block-01:front-east',
    ]);
    expect(ARENA_COLLIDERS.at(-1)?.id).toBe('perimeter:east');
    expect(new Set(ARENA_COLLIDERS.map((collider) => collider.id)).size).toBe(95);
    for (const collider of ARENA_COLLIDERS) {
      for (let axis = 0; axis < 3; axis++) {
        expect(Number.isFinite(collider.min[axis])).toBe(true);
        expect(Number.isFinite(collider.max[axis])).toBe(true);
        expect(collider.min[axis]).toBeLessThan(collider.max[axis]);
      }
    }
    const canonical = JSON.stringify(ARENA_COLLIDERS.map(({ id, kind, min, max }) => ({ id, kind, min, max })));
    // Captured only after buildArena's authored Three.js boxes passed the
    // coordinate-by-coordinate parity assertion against this complete list.
    expect(createHash('sha256').update(canonical).digest('hex')).toBe(
      '2a28d22675e36c18455d2bf858f4cadaf9a57fe4f4e930c94c537e3591521734',
    );
  });

  it('retains exact Float32-derived transformed bounds', () => {
    expect(ARENA_COLLIDERS.find((collider) => collider.id === 'sandbag:0')).toEqual({
      id: 'sandbag:0',
      kind: 'sandbag',
      min: [-2.882132840349632, .020000007152557286, 23.565250999083297],
      max: [-1.1178671596503678, .6283100509643555, 24.434749000916703],
    });
    expect(ARENA_COLLIDERS.find((collider) => collider.id === 'barrel:east-cluster-1')).toEqual({
      id: 'barrel:east-cluster-1',
      kind: 'barrel',
      min: [20.552808087013695, -.05705258056114737, -17.360000014305115],
      max: [21.447191912986305, 1.0170525805611472, -16.639999985694885],
    });
  });

  it('is deeply immutable and exposes a separately bounded ground plane', () => {
    expect(Object.isFrozen(ARENA_COLLIDERS)).toBe(true);
    for (const collider of ARENA_COLLIDERS) {
      expect(Object.isFrozen(collider)).toBe(true);
      expect(Object.isFrozen(collider.min)).toBe(true);
      expect(Object.isFrozen(collider.max)).toBe(true);
    }
    expect(Object.isFrozen(ARENA_PLAYABLE_BOUNDS)).toBe(true);
    expect(Object.isFrozen(ARENA_GROUND)).toBe(true);
    expect(ARENA_GROUND).toEqual({
      id: 'ground', y: 0,
      minX: -59.6, maxX: 59.6,
      minZ: -57.6, maxZ: 57.6,
    });
  });
});

describe('raycastArena', () => {
  it('normalizes directions and returns the nearest impact point and face normal', () => {
    const hit = raycastArena({ x: 0, y: 1, z: -20 }, { x: 0, y: 0, z: 10 }, 20);
    expect(hit?.id).toBe('barrier:north');
    expect(hit?.surface).toBe('collider');
    expect(hit?.distance).toBeCloseTo(11.675, 12);
    expect(hit?.point).toEqual({ x: 0, y: 1, z: -8.325 });
    expect(hit?.normal).toEqual({ x: 0, y: 0, z: -1 });
    expect(Object.isFrozen(hit)).toBe(true);
    expect(Object.isFrozen(hit?.point)).toBe(true);
    expect(Object.isFrozen(hit?.normal)).toBe(true);
    expect(raycastArena({ x: 0, y: 1, z: -20 }, { x: 0, y: 0, z: 1 }, 11.67)).toBeNull();
    expect(raycastArena({ x: 0, y: 1, z: -20 }, { x: 0, y: 0, z: 1e-12 }, 20)?.distance).toBeCloseTo(11.675, 12);
    expect(raycastArena({ x: 0, y: 1, z: -20 }, { x: 0, y: 0, z: 1e12 }, 20)?.distance).toBeCloseTo(11.675, 12);
  });

  it('hits only the bounded ground plane when travelling toward it', () => {
    const hit = raycastArena({ x: 0, y: 10, z: 0 }, { x: 0, y: -2, z: 0 });
    expect(hit).toMatchObject({
      id: 'ground',
      surface: 'ground',
      distance: 10,
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    });
    expect(raycastArena({ x: 61, y: 10, z: 0 }, { x: 0, y: -1, z: 0 })).toBeNull();
    expect(raycastArena({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, Infinity, { includeGround: false })).toBeNull();
    expect(raycastArena({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
    expect(raycastArena({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
    const inward = raycastArena({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    expect(inward).toMatchObject({ id: 'ground', distance: 0 });
    expect(Object.is(inward?.distance, -0)).toBe(false);
  });

  it('handles surface starts without self-occluding outward or tangent rays', () => {
    const origin = { x: 0, y: 1, z: -8.325 };
    expect(raycastArena(origin, { x: 0, y: 0, z: -1 }, 20, { minDistance: 1e-5 })).toBeNull();
    expect(raycastArena(origin, { x: 1, y: 0, z: 0 }, 20, { minDistance: 1e-5 })).toBeNull();
    const inward = raycastArena(origin, { x: 0, y: 0, z: 1 }, 2, { minDistance: 1e-5 });
    expect(inward).toMatchObject({ id: 'barrier:north', normal: { x: 0, y: 0, z: 1 } });
    expect(inward?.distance).toBeCloseTo(.65, 12);
  });

  it('does not confuse alignment with one face plane for a surface start', () => {
    const edge = raycastArena(
      { x: -9, y: 1, z: -10 },
      { x: 0, y: 0, z: 1 },
      5,
      { includeGround: false },
    );
    expect(edge).toMatchObject({ id: 'barrier:north', normal: { x: 0, y: 0, z: -1 } });
    expect(edge?.distance).toBeCloseTo(1.675, 12);

    const perimeterEdge = raycastArena({ x: 59.6, y: 10, z: 0 }, { x: 0, y: -1, z: 0 });
    expect(perimeterEdge).toMatchObject({ id: 'perimeter:east', normal: { x: 0, y: 1, z: 0 } });
    expect(perimeterEdge?.distance).toBeCloseTo(6.8, 12);
  });

  it('returns an exit face when beginning strictly inside a volume', () => {
    const hit = raycastArena({ x: 0, y: 1, z: -8 }, { x: 0, y: 0, z: 4 }, 10);
    expect(hit).toMatchObject({ id: 'barrier:north', normal: { x: 0, y: 0, z: 1 } });
    expect(hit?.distance).toBeCloseTo(.325, 12);
  });

  it('rejects invalid rays without throwing', () => {
    expect(raycastArena({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBeNull();
    expect(raycastArena({ x: Number.NaN, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
    expect(raycastArena({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, -1)).toBeNull();
  });
});

describe('arena visibility and bounds', () => {
  it('blocks solid cover but leaves authored door openings clear', () => {
    expect(hasArenaLineOfSight({ x: 0, y: 1, z: -10 }, { x: 0, y: 1, z: -6 })).toBe(false);
    expect(hasArenaLineOfSight({ x: 36, y: 1, z: -27 }, { x: 32, y: 1, z: -27 })).toBe(false);
    expect(hasArenaLineOfSight({ x: 36, y: 1, z: -24 }, { x: 32, y: 1, z: -24 })).toBe(true);
  });

  it('does not treat a clear segment endpoint on a surface as intervening cover', () => {
    expect(hasArenaLineOfSight(
      { x: 0, y: 1, z: -10 },
      { x: 0, y: 1, z: -8.325 },
    )).toBe(true);
    expect(hasArenaLineOfSight(
      { x: 0, y: 1, z: -8.325 },
      { x: 0, y: 1, z: -10 },
    )).toBe(true);
  });

  it('applies margins to the playable perimeter', () => {
    expect(isInsideArenaPlayableBounds({ x: -59.6, y: 100, z: 57.6 })).toBe(true);
    expect(isInsideArenaPlayableBounds({ x: -59.6, y: 0, z: 57.6 }, .38)).toBe(false);
    expect(isInsideArenaPlayableBounds({ x: 0, y: -100, z: 0 }, .38)).toBe(true);
    expect(isInsideArenaPlayableBounds({ x: 60, y: 0, z: 0 })).toBe(false);
    expect(isInsideArenaPlayableBounds({ x: 0, y: 0, z: 0 }, -1)).toBe(false);
  });
});
