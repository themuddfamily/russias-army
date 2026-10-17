import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createSoldierAnatomyGeometrySet,
  type SoldierAnatomyGeometrySet,
} from './soldierAnatomyGeometry';

type GeometryKey = Exclude<keyof SoldierAnatomyGeometrySet, 'stats'>;

const GEOMETRIES: readonly GeometryKey[] = Object.freeze([
  'torso', 'pelvis', 'thigh', 'calf', 'upperArm', 'forearm',
]);

const EXPECTED: Readonly<Record<GeometryKey, {
  name: string;
  segments: number;
  triangles: number;
  bounds: readonly [number, number, number, number, number, number];
}>> = Object.freeze({
  torso: { name: 'AnatomicalTorsoShell', segments: 12, triangles: 144, bounds: [-.28, -.065, -.194, .28, .645, .189] },
  pelvis: { name: 'AnatomicalPelvisShell', segments: 12, triangles: 144, bounds: [-.23, -.10, -.14, .23, .10, .138] },
  thigh: { name: 'AnatomicalThighShell', segments: 10, triangles: 120, bounds: [-.113, -.515, -.11, .113, .015, .104] },
  calf: { name: 'AnatomicalCalfShell', segments: 10, triangles: 120, bounds: [-.097, -.50, -.106, .097, 0, .085] },
  upperArm: { name: 'AnatomicalUpperArmShell', segments: 10, triangles: 120, bounds: [-.087, -.43, -.078, .087, -.01, .08] },
  forearm: { name: 'AnatomicalForearmShell', segments: 10, triangles: 120, bounds: [-.073, -.377, -.065, .073, -.003, .064] },
});

function arrays(geometry: THREE.BufferGeometry): number[][] {
  return [
    Array.from(geometry.getAttribute('position').array),
    Array.from(geometry.getAttribute('normal').array),
    Array.from(geometry.getAttribute('uv').array),
    Array.from(geometry.index?.array ?? []),
  ];
}

function ringProfile(
  geometry: THREE.BufferGeometry,
  segments: number,
  ring: number,
): { centerZ: number; radiusX: number; radiusZ: number } {
  const position = geometry.getAttribute('position');
  const start = ring * (segments + 1);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = start; index < start + segments + 1; index++) {
    minX = Math.min(minX, position.getX(index));
    maxX = Math.max(maxX, position.getX(index));
    minZ = Math.min(minZ, position.getZ(index));
    maxZ = Math.max(maxZ, position.getZ(index));
  }
  return {
    centerZ: (minZ + maxZ) * .5,
    radiusX: (maxX - minX) * .5,
    radiusZ: (maxZ - minZ) * .5,
  };
}

function dispose(set: SoldierAnatomyGeometrySet): void {
  for (const key of GEOMETRIES) set[key].dispose();
}

describe('createSoldierAnatomyGeometrySet', () => {
  it('returns deterministic independently owned geometry and exact frozen stats', () => {
    const first = createSoldierAnatomyGeometrySet();
    const second = createSoldierAnatomyGeometrySet();

    expect(first.stats).toEqual({ geometries: 6, uniqueTriangles: 768, submittedTriangles: 1_248 });
    expect(second.stats).toEqual(first.stats);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.stats)).toBe(true);
    expect(first.stats.submittedTriangles).toBeGreaterThanOrEqual(950);
    expect(first.stats.submittedTriangles).toBeLessThanOrEqual(1_800);

    for (const key of GEOMETRIES) {
      expect(first[key]).not.toBe(second[key]);
      expect(first[key].name).toBe(EXPECTED[key].name);
      expect(arrays(second[key])).toEqual(arrays(first[key]));
    }
    dispose(first);
    dispose(second);
  });

  it('uses indexed, closed, nondegenerate deterministic topology', () => {
    const set = createSoldierAnatomyGeometrySet();
    for (const key of GEOMETRIES) {
      const geometry = set[key];
      const expected = EXPECTED[key];
      const index = geometry.index;
      const position = geometry.getAttribute('position');
      expect(index).not.toBeNull();
      expect(index!.count / 3).toBe(expected.triangles);
      expect(index!.count % 3).toBe(0);
      expect(geometry.groups).toEqual([]);

      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const edgeA = new THREE.Vector3();
      const edgeB = new THREE.Vector3();
      for (let offset = 0; offset < index!.count; offset += 3) {
        const ia = index!.getX(offset);
        const ib = index!.getX(offset + 1);
        const ic = index!.getX(offset + 2);
        expect(ia).toBeGreaterThanOrEqual(0);
        expect(ib).toBeGreaterThanOrEqual(0);
        expect(ic).toBeGreaterThanOrEqual(0);
        expect(ia).toBeLessThan(position.count);
        expect(ib).toBeLessThan(position.count);
        expect(ic).toBeLessThan(position.count);
        a.fromBufferAttribute(position, ia);
        b.fromBufferAttribute(position, ib);
        c.fromBufferAttribute(position, ic);
        edgeA.subVectors(b, a);
        edgeB.subVectors(c, a);
        expect(edgeA.cross(edgeB).lengthSq()).toBeGreaterThan(1e-12);
      }
    }
    dispose(set);
  });

  it('provides aligned finite attributes, near-unit normals and UVs in range', () => {
    const set = createSoldierAnatomyGeometrySet();
    for (const key of GEOMETRIES) {
      const geometry = set[key];
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      expect(position.itemSize).toBe(3);
      expect(normal.itemSize).toBe(3);
      expect(uv.itemSize).toBe(2);
      expect(normal.count).toBe(position.count);
      expect(uv.count).toBe(position.count);
      for (let vertex = 0; vertex < position.count; vertex++) {
        const components = [
          position.getX(vertex), position.getY(vertex), position.getZ(vertex),
          normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex),
          uv.getX(vertex), uv.getY(vertex),
        ];
        expect(components.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex))).toBeCloseTo(1, 5);
        expect(uv.getX(vertex)).toBeGreaterThanOrEqual(0);
        expect(uv.getX(vertex)).toBeLessThanOrEqual(1);
        expect(uv.getY(vertex)).toBeGreaterThanOrEqual(0);
        expect(uv.getY(vertex)).toBeLessThanOrEqual(1);
      }
    }
    dispose(set);
  });

  it('duplicates a back UV seam and splits planar cap normals from the smooth sides', () => {
    const set = createSoldierAnatomyGeometrySet();
    for (const key of GEOMETRIES) {
      const geometry = set[key];
      const segments = EXPECTED[key].segments;
      const stride = segments + 1;
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');

      for (let ring = 0; ring < 6; ring++) {
        const first = ring * stride;
        const last = first + segments;
        expect(position.getX(first)).toBeCloseTo(position.getX(last), 6);
        expect(position.getY(first)).toBeCloseTo(position.getY(last), 6);
        expect(position.getZ(first)).toBeCloseTo(position.getZ(last), 6);
        expect(position.getZ(first)).toBeLessThan(0);
        expect(normal.getX(first)).toBeCloseTo(normal.getX(last), 6);
        expect(normal.getY(first)).toBeCloseTo(normal.getY(last), 6);
        expect(normal.getZ(first)).toBeCloseTo(normal.getZ(last), 6);
        expect(uv.getX(first)).toBe(0);
        expect(uv.getX(last)).toBe(1);
        expect(uv.getY(first)).toBeCloseTo(uv.getY(last), 6);
      }

      const sideCount = 6 * stride;
      const bottomCenter = sideCount;
      const bottomPerimeter = bottomCenter + 1;
      const topCenter = bottomCenter + segments + 2;
      const topPerimeter = topCenter + 1;
      expect(normal.getY(bottomCenter)).toBe(-1);
      expect(normal.getY(topCenter)).toBe(1);
      for (let segment = 0; segment <= segments; segment++) {
        const sideBottom = segment;
        const sideTop = 5 * stride + segment;
        expect(position.getX(bottomPerimeter + segment)).toBeCloseTo(position.getX(sideBottom), 6);
        expect(position.getY(bottomPerimeter + segment)).toBeCloseTo(position.getY(sideBottom), 6);
        expect(position.getZ(bottomPerimeter + segment)).toBeCloseTo(position.getZ(sideBottom), 6);
        expect(position.getX(topPerimeter + segment)).toBeCloseTo(position.getX(sideTop), 6);
        expect(position.getY(topPerimeter + segment)).toBeCloseTo(position.getY(sideTop), 6);
        expect(position.getZ(topPerimeter + segment)).toBeCloseTo(position.getZ(sideTop), 6);
        expect(normal.getX(bottomPerimeter + segment)).toBe(0);
        expect(normal.getY(bottomPerimeter + segment)).toBe(-1);
        expect(normal.getZ(bottomPerimeter + segment)).toBe(0);
        expect(normal.getX(topPerimeter + segment)).toBe(0);
        expect(normal.getY(topPerimeter + segment)).toBe(1);
        expect(normal.getZ(topPerimeter + segment)).toBe(0);
      }
      // The shared indexed side rings carry continuously sloped normals instead
      // of six bands of faceted, purely horizontal side normals.
      let maximumSideSlope = 0;
      for (let vertex = 0; vertex < sideCount; vertex++) {
        maximumSideSlope = Math.max(maximumSideSlope, Math.abs(normal.getY(vertex)));
      }
      expect(maximumSideSlope).toBeGreaterThan(.05);
    }
    dispose(set);
  });

  it('matches the authored feet-level rig envelopes to within one centimetre', () => {
    const set = createSoldierAnatomyGeometrySet();
    for (const key of GEOMETRIES) {
      const box = set[key].boundingBox;
      const expected = EXPECTED[key].bounds;
      expect(box).not.toBeNull();
      const actual = [box!.min.x, box!.min.y, box!.min.z, box!.max.x, box!.max.y, box!.max.z];
      for (let axis = 0; axis < actual.length; axis++) {
        expect(Math.abs(actual[axis] - expected[axis])).toBeLessThanOrEqual(.01);
      }
    }
    dispose(set);
  });

  it('has measurable anatomical taper and bulge in every profile', () => {
    const set = createSoldierAnatomyGeometrySet();
    const torsoWaist = ringProfile(set.torso, 12, 0);
    const torsoShoulder = ringProfile(set.torso, 12, 3);
    const torsoNeck = ringProfile(set.torso, 12, 5);
    expect(torsoShoulder.radiusX).toBeGreaterThan(torsoWaist.radiusX * 1.3);
    expect(torsoNeck.radiusX).toBeLessThan(torsoShoulder.radiusX * .55);

    const pelvisBottom = ringProfile(set.pelvis, 12, 0);
    const pelvisHip = ringProfile(set.pelvis, 12, 3);
    const pelvisTop = ringProfile(set.pelvis, 12, 5);
    expect(pelvisHip.radiusX).toBeGreaterThan(pelvisBottom.radiusX * 1.3);
    expect(pelvisHip.radiusZ).toBeGreaterThan(pelvisBottom.radiusZ * 1.25);
    expect(pelvisTop.radiusX).toBeLessThan(pelvisHip.radiusX * .9);

    for (const key of ['thigh', 'calf', 'upperArm', 'forearm'] as const) {
      const narrowEnd = ringProfile(set[key], 10, 0);
      const bulge = ringProfile(set[key], 10, 3);
      expect(bulge.radiusX, `${key} x bulge`).toBeGreaterThan(narrowEnd.radiusX * 1.3);
      expect(bulge.radiusZ, `${key} z bulge`).toBeGreaterThan(narrowEnd.radiusZ * 1.3);
    }
    dispose(set);
  });

  it('keeps adjacent rings continuous and matches articulated joint transitions', () => {
    const set = createSoldierAnatomyGeometrySet();
    for (const key of GEOMETRIES) {
      const segments = EXPECTED[key].segments;
      for (let ring = 1; ring < 6; ring++) {
        const previous = ringProfile(set[key], segments, ring - 1);
        const current = ringProfile(set[key], segments, ring);
        expect(Math.abs(current.radiusX - previous.radiusX), `${key} ring ${ring} x`).toBeLessThan(.115);
        expect(Math.abs(current.radiusZ - previous.radiusZ), `${key} ring ${ring} z`).toBeLessThan(.06);
        expect(Math.abs(current.centerZ - previous.centerZ), `${key} ring ${ring} centre`).toBeLessThan(.021);
      }
    }

    const torsoWaist = ringProfile(set.torso, 12, 0);
    const pelvisWaist = ringProfile(set.pelvis, 12, 5);
    expect(pelvisWaist.radiusX).toBeCloseTo(torsoWaist.radiusX, 5);
    expect(Math.abs(pelvisWaist.radiusZ - torsoWaist.radiusZ)).toBeLessThan(.01);
    expect(pelvisWaist.centerZ).toBeCloseTo(torsoWaist.centerZ, 5);

    const distalThigh = ringProfile(set.thigh, 10, 0);
    const proximalCalf = ringProfile(set.calf, 10, 5);
    expect(proximalCalf.radiusX).toBeCloseTo(distalThigh.radiusX, 5);
    expect(proximalCalf.radiusZ).toBeCloseTo(distalThigh.radiusZ, 5);
    expect(proximalCalf.centerZ).toBeCloseTo(distalThigh.centerZ, 5);

    const distalUpperArm = ringProfile(set.upperArm, 10, 0);
    const proximalForearm = ringProfile(set.forearm, 10, 5);
    expect(proximalForearm.radiusX).toBeCloseTo(distalUpperArm.radiusX, 5);
    expect(proximalForearm.radiusZ).toBeCloseTo(distalUpperArm.radiusZ, 5);
    expect(proximalForearm.centerZ).toBeCloseTo(distalUpperArm.centerZ, 5);
    dispose(set);
  });

  it('contains no materials, textures, scene nodes or hidden resources', () => {
    const set = createSoldierAnatomyGeometrySet();
    expect(Object.keys(set).sort()).toEqual(['calf', 'forearm', 'pelvis', 'stats', 'thigh', 'torso', 'upperArm']);
    for (const key of GEOMETRIES) {
      expect(set[key]).toBeInstanceOf(THREE.BufferGeometry);
      expect(set[key]).not.toBeInstanceOf(THREE.Material);
      expect(set[key]).not.toBeInstanceOf(THREE.Texture);
      expect(set[key]).not.toBeInstanceOf(THREE.Object3D);
      expect(Object.keys(set[key].attributes).sort()).toEqual(['normal', 'position', 'uv']);
    }
    dispose(set);
  });
});
