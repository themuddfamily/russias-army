import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MILITARY_TRANSPORT_PLACEMENTS,
  MILITARY_TRANSPORT_DRAW_CALL_BUDGET,
  MILITARY_TRANSPORT_GEOMETRY_BUDGET,
  MILITARY_TRANSPORT_TRIANGLE_BUDGET,
  createMilitaryTransportPresentation,
  type MilitaryTransportPresentation,
} from './militaryTransport';

function matrices(presentation: MilitaryTransportPresentation): number[][] {
  return [
    Array.from(presentation.batches.body.instanceMatrix.array),
    Array.from(presentation.batches.runningGear.instanceMatrix.array),
  ];
}

describe('createMilitaryTransportPresentation', () => {
  it('builds the default parked six-wheel cargo truck at the accepted yard anchor', () => {
    expect(DEFAULT_MILITARY_TRANSPORT_PLACEMENTS).toEqual([
      { id: 'yard-cargo-truck', x: 9, z: 29, yaw: 0, scale: 1 },
    ]);
    expect(Object.isFrozen(DEFAULT_MILITARY_TRANSPORT_PLACEMENTS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_MILITARY_TRANSPORT_PLACEMENTS[0])).toBe(true);

    const parent = new THREE.Group();
    const presentation = createMilitaryTransportPresentation(parent);
    expect(parent.children).toEqual([presentation.group]);
    expect(presentation.group.children).toEqual([
      presentation.batches.body,
      presentation.batches.runningGear,
    ]);
    expect(presentation.batches.runningGear.count).toBe(12);
    expect(presentation.stats.tyreInstances).toBe(6);
    expect(presentation.stats.hubInstances).toBe(6);
    expect(presentation.group.userData.colliderPolicy).toBe('one-authoritative-aabb-per-transport');

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    presentation.batches.body.getMatrixAt(0, matrix);
    matrix.decompose(position, rotation, scale);
    expect(position.x).toBeCloseTo(9, 6);
    expect(position.y).toBeCloseTo(0, 6);
    expect(position.z).toBeCloseTo(29, 6);
    expect(scale.x).toBeCloseTo(1, 6);
    expect(scale.y).toBeCloseTo(1, 6);
    expect(scale.z).toBeCloseTo(1, 6);
    expect(rotation.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);

    presentation.batches.runningGear.getMatrixAt(0, matrix);
    matrix.decompose(position, rotation, scale);
    expect(position.y - scale.x * .5).toBeCloseTo(.04, 6);

    expect(presentation.batches.body.instanceColor).toBeNull();
    expect(presentation.resources.bodyGeometry.getAttribute('color')).toBeDefined();
    expect(presentation.resources.bodyGeometry.getAttribute('surfaceRole')).toBeDefined();
    expect(presentation.batches.runningGear.instanceColor).not.toBeNull();
    expect(presentation.resources.bodyMaterial.vertexColors).toBe(true);
    expect(presentation.resources.runningGearMaterial.vertexColors).toBe(true);
    expect(presentation.resources.bodyMaterial.map).toBeNull();
    expect(presentation.resources.runningGearMaterial.map).toBeNull();
    presentation.dispose();
  });

  it('uses exactly one conservative collider per transport and transforms it with yaw and scale', () => {
    const presentation = createMilitaryTransportPresentation(new THREE.Group(), [
      { id: 'default', x: 9, z: 29, yaw: 0 },
      { id: 'turned', x: -4, z: 7, yaw: Math.PI / 2, scale: 2 },
    ]);

    expect(presentation.colliders).toHaveLength(2);
    expect(presentation.stats.colliders).toBe(2);
    expect(Object.isFrozen(presentation.colliders)).toBe(true);
    expect(presentation.colliders[0].min.toArray()).toEqual([7.67, 0, 25.299999999999997]);
    expect(presentation.colliders[0].max.toArray()).toEqual([10.33, 2.9, 32.5]);
    const turnedSize = presentation.colliders[1].getSize(new THREE.Vector3());
    expect(turnedSize.x).toBeCloseTo(14.4, 6);
    expect(turnedSize.y).toBeCloseTo(5.8, 6);
    expect(turnedSize.z).toBeCloseTo(5.32, 6);
    const turnedCenter = presentation.colliders[1].getCenter(new THREE.Vector3());
    expect(turnedCenter.x).toBeCloseTo(-4.2, 6);
    expect(turnedCenter.y).toBeCloseTo(2.9, 6);
    expect(turnedCenter.z).toBeCloseTo(7, 6);
    presentation.dispose();
  });

  it('keeps both quality tiers inside the requested draw, geometry, triangle and texture budgets', () => {
    const low = createMilitaryTransportPresentation(new THREE.Group(), undefined, { quality: 'low' });
    const high = createMilitaryTransportPresentation(new THREE.Group(), undefined, { quality: 'high' });

    expect(low.stats).toEqual({
      quality: 'low', transports: 1, bodyParts: 21, shellInstances: 21, bodyInstances: 21, tyreInstances: 6, hubInstances: 6,
      runningGearInstances: 12, totalInstances: 33, drawCalls: 2, geometries: 2,
      textures: 0, colliders: 1, submittedTriangles: 636, trianglesPerTransport: 636,
    });
    expect(high.stats).toEqual({
      quality: 'high', transports: 1, bodyParts: 82, shellInstances: 1, bodyInstances: 1, tyreInstances: 6, hubInstances: 6,
      runningGearInstances: 12, totalInstances: 13, drawCalls: 2, geometries: 2,
      textures: 0, colliders: 1, submittedTriangles: 1608, trianglesPerTransport: 1608,
    });
    for (const presentation of [low, high]) {
      expect(Object.isFrozen(presentation.stats)).toBe(true);
      expect(presentation.stats.drawCalls).toBeLessThanOrEqual(MILITARY_TRANSPORT_DRAW_CALL_BUDGET);
      expect(presentation.stats.geometries).toBeLessThanOrEqual(MILITARY_TRANSPORT_GEOMETRY_BUDGET);
      expect(presentation.stats.trianglesPerTransport).toBeLessThanOrEqual(
        MILITARY_TRANSPORT_TRIANGLE_BUDGET[presentation.stats.quality],
      );
      expect(presentation.stats.textures).toBe(0);
      expect(presentation.batches.body.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
      expect(presentation.batches.runningGear.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
    }
    expect(low.batches.body.castShadow).toBe(false);
    expect(high.batches.body.castShadow).toBe(true);
    expect(high.stats.bodyInstances).toBeLessThan(low.stats.bodyInstances);
    expect(high.stats.bodyParts).toBeGreaterThan(low.stats.bodyParts);
    low.dispose();
    high.dispose();
  });

  it('is deterministic, honors parent/ground/rotation options and batches any placement count in two calls', () => {
    const placements = [
      { id: 'one', x: 2, z: 3, yaw: .35, scale: .9 },
      { id: 'two', x: -7, z: 11, yaw: -1.2, scale: 1.1 },
    ] as const;
    const first = createMilitaryTransportPresentation(new THREE.Group(), placements, {
      quality: 'low', groundY: 1.25, castShadow: true, receiveShadow: false, name: 'Convoy',
    });
    const second = createMilitaryTransportPresentation(new THREE.Group(), placements, {
      quality: 'low', groundY: 1.25, castShadow: true, receiveShadow: false, name: 'Convoy',
    });

    expect(matrices(first)).toEqual(matrices(second));
    expect(first.group.name).toBe('Convoy');
    expect(first.batches.body.castShadow).toBe(true);
    expect(first.batches.body.receiveShadow).toBe(false);
    expect(first.stats.transports).toBe(2);
    expect(first.stats.drawCalls).toBe(2);
    expect(first.stats.submittedTriangles).toBe(first.stats.trianglesPerTransport * 2);
    expect(first.colliders[0].min.y).toBeCloseTo(1.25, 6);
    first.dispose();
    second.dispose();
  });

  it('supports an empty placement set, validates input and rejects duplicate identities', () => {
    const empty = createMilitaryTransportPresentation(new THREE.Group(), [], { quality: 'low' });
    expect(empty.stats).toMatchObject({
      transports: 0, bodyInstances: 0, runningGearInstances: 0, drawCalls: 0,
      geometries: 0, submittedTriangles: 0, colliders: 0,
    });
    expect(empty.colliders).toEqual([]);
    empty.dispose();

    expect(() => createMilitaryTransportPresentation(new THREE.Group(), [], {
      quality: 'cinematic' as 'high',
    })).toThrow(/quality/);
    expect(() => createMilitaryTransportPresentation(new THREE.Group(), [], { groundY: Infinity })).toThrow(/groundY/);
    expect(() => createMilitaryTransportPresentation(new THREE.Group(), [
      { id: '', x: 0, z: 0 },
    ])).toThrow(/id/);
    expect(() => createMilitaryTransportPresentation(new THREE.Group(), [
      { id: 'bad', x: Number.NaN, z: 0 },
    ])).toThrow(/\.x/);
    expect(() => createMilitaryTransportPresentation(new THREE.Group(), [
      { id: 'bad', x: 0, z: Infinity },
    ])).toThrow(/\.z/);
    expect(() => createMilitaryTransportPresentation(new THREE.Group(), [
      { id: 'bad', x: 0, z: 0, yaw: Number.NaN },
    ])).toThrow(/yaw/);
    expect(() => createMilitaryTransportPresentation(new THREE.Group(), [
      { id: 'bad', x: 0, z: 0, scale: 0 },
    ])).toThrow(/scale/);
    expect(() => createMilitaryTransportPresentation(new THREE.Group(), [
      { id: 'same', x: 0, z: 0 },
      { id: 'same', x: 1, z: 1 },
    ])).toThrow(/unique/);
  });

  it('disposes every owned resource exactly once without disposing parent state', () => {
    const parent = new THREE.Group();
    const unrelated = new THREE.Group();
    parent.add(unrelated);
    const presentation = createMilitaryTransportPresentation(parent);
    const disposals = [
      vi.spyOn(presentation.resources.bodyGeometry, 'dispose'),
      vi.spyOn(presentation.resources.runningGearGeometry, 'dispose'),
      vi.spyOn(presentation.resources.bodyMaterial, 'dispose'),
      vi.spyOn(presentation.resources.runningGearMaterial, 'dispose'),
    ];

    presentation.dispose();
    presentation.dispose();
    expect(parent.children).toEqual([unrelated]);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });
});
