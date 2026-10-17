import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SECURITY_FENCE_RUNS } from './securityInfrastructureBlueprint';
import {
  createSecurityWireBlueprint,
  createSecurityWireRunBlueprint,
  SECURITY_WIRE_TRIANGLE_CEILING,
  SECURITY_WIRE_TRIANGLES_PER_PART,
  type SecurityWireBoxPart,
} from './securityWireBlueprint';

function boundsOf(part: SecurityWireBoxPart): THREE.Box3 {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...part.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation)),
    new THREE.Vector3(...part.size),
  );
  return new THREE.Box3(
    new THREE.Vector3(-.5, -.5, -.5),
    new THREE.Vector3(.5, .5, .5),
  ).applyMatrix4(matrix);
}

describe('createSecurityWireBlueprint', () => {
  it('dresses all established fence runs under the strict triangle ceiling', () => {
    const blueprint = createSecurityWireBlueprint();
    expect(blueprint.stats).toEqual({
      parts: 55,
      triangles: 660,
      runs: 3,
      outriggers: 16,
      wireSegments: 39,
      materialCounts: { steel: 16, dark: 39 },
    });
    expect(blueprint.stats.triangles).toBeLessThanOrEqual(SECURITY_WIRE_TRIANGLE_CEILING);
    expect(blueprint.stats.triangles).toBe(blueprint.stats.parts * SECURITY_WIRE_TRIANGLES_PER_PART);
    expect(new Set(blueprint.parts.map((part) => part.runId))).toEqual(
      new Set(SECURITY_FENCE_RUNS.map((run) => run.id)),
    );
    expect(new Set(blueprint.parts.map((part) => part.name)).size).toBe(blueprint.parts.length);
  });

  it('assigns one spatial cluster to each run and no collision data', () => {
    const blueprint = createSecurityWireBlueprint();
    for (const run of SECURITY_FENCE_RUNS) {
      const parts = blueprint.parts.filter((part) => part.runId === run.id);
      expect(parts.length).toBeGreaterThan(0);
      expect(new Set(parts.map((part) => part.cluster))).toEqual(new Set([`security-wire:${run.id}`]));
    }
    expect('colliders' in blueprint).toBe(false);
    expect(blueprint.parts.every((part) => !('collider' in part))).toBe(true);
  });

  it('keeps three thin, gapped wire courses wholly above the existing fence', () => {
    for (const run of SECURITY_FENCE_RUNS) {
      const blueprint = createSecurityWireRunBlueprint(run);
      const wires = blueprint.parts.filter((part) => part.role === 'wire');
      expect(new Set(wires.map((part) => part.position[1])).size).toBe(3);
      expect(wires.every((part) => part.size[1] === .024 && part.size[2] === .024)).toBe(true);
      expect(wires.every((part) => boundsOf(part).min.y > 2.15)).toBe(true);
      expect(wires.every((part) => part.castShadow === false)).toBe(true);

      const localIntervals = Math.ceil(run.length / 5);
      const spacing = (run.length - .12) / localIntervals;
      expect(wires.every((part) => part.size[0] < spacing)).toBe(true);
    }
  });

  it('leans supports away from the arena while keeping their feet attached to the fence top', () => {
    for (const run of SECURITY_FENCE_RUNS) {
      const outriggers = createSecurityWireRunBlueprint(run).parts.filter((part) => part.role === 'outrigger');
      expect(outriggers.length).toBeGreaterThanOrEqual(5);
      expect(outriggers.every((part) => part.rotation[2] > 1)).toBe(true);
      expect(outriggers.every((part) => boundsOf(part).min.y < 2.15)).toBe(true);
      expect(outriggers.every((part) => boundsOf(part).max.y > 2.8)).toBe(true);

      const normalX = Math.sin(run.rotationY);
      const normalZ = Math.cos(run.rotationY);
      const centerOffset = outriggers[0].position[0] * normalX + outriggers[0].position[2] * normalZ
        - (run.x * normalX + run.z * normalZ);
      const outwardSign = run.x * normalX + run.z * normalZ < 0 ? -1 : 1;
      expect(Math.sign(centerOffset)).toBe(outwardSign);
    }
  });

  it('is deterministic, finite, material-independent, and deeply immutable', () => {
    const first = createSecurityWireBlueprint();
    expect(first).toEqual(createSecurityWireBlueprint());
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parts)).toBe(true);
    expect(Object.isFrozen(first.parts[0])).toBe(true);
    expect(Object.isFrozen(first.parts[0].size)).toBe(true);
    expect(Object.isFrozen(first.parts[0].position)).toBe(true);
    expect(Object.isFrozen(first.parts[0].rotation)).toBe(true);
    expect(Object.isFrozen(first.stats)).toBe(true);
    expect(Object.isFrozen(first.stats.materialCounts)).toBe(true);
    for (const part of first.parts) {
      expect(part.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(part.position.every(Number.isFinite)).toBe(true);
      expect(part.rotation.every(Number.isFinite)).toBe(true);
      expect(['steel', 'dark']).toContain(part.materialSlot);
      expect('material' in part).toBe(false);
    }
  });

  it('rejects malformed run descriptions', () => {
    expect(() => createSecurityWireRunBlueprint({ id: '', x: 0, z: 0, length: 10, rotationY: 0 })).toThrow(RangeError);
    expect(() => createSecurityWireRunBlueprint({ id: 'bad', x: Number.NaN, z: 0, length: 10, rotationY: 0 })).toThrow(RangeError);
    expect(() => createSecurityWireRunBlueprint({ id: 'bad', x: 0, z: 0, length: .2, rotationY: 0 })).toThrow(RangeError);
    expect(() => createSecurityWireRunBlueprint({ id: 'bad', x: 0, z: 0, length: 10, rotationY: Infinity })).toThrow(RangeError);
  });
});
