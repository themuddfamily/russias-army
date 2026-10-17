import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  SANDBAG_LEGACY_CAPSULE_BOUNDS,
  createSandbagGeometry,
} from './sandbagGeometry';

function arrays(geometry: THREE.BufferGeometry): number[][] {
  return [
    Array.from(geometry.getAttribute('position').array),
    Array.from(geometry.getAttribute('normal').array),
    Array.from(geometry.getAttribute('uv').array),
    Array.from(geometry.index?.array ?? []),
  ];
}

function ringExtents(geometry: THREE.BufferGeometry, ring: number, segments = 10): { x: number; z: number } {
  const position = geometry.getAttribute('position');
  const stride = segments + 1;
  const start = ring * stride;
  let x = 0;
  let z = 0;
  for (let index = start; index < start + stride; index++) {
    x = Math.max(x, Math.abs(position.getX(index)));
    z = Math.max(z, Math.abs(position.getZ(index)));
  }
  return { x, z };
}

describe('createSandbagGeometry', () => {
  it('returns deterministic independently owned buffers and immutable exact stats', () => {
    const first = createSandbagGeometry();
    const second = createSandbagGeometry();

    expect(first.geometry).not.toBe(second.geometry);
    expect(first.geometry.name).toBe('LoadedSandbagShell');
    expect(first.stats).toEqual({
      geometries: 1,
      vertices: 157,
      triangles: 206,
      bodyTriangles: 180,
      seamTriangles: 26,
    });
    expect(second.stats).toEqual(first.stats);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.stats)).toBe(true);
    expect(Object.isFrozen(SANDBAG_LEGACY_CAPSULE_BOUNDS)).toBe(true);
    expect(Object.isFrozen(SANDBAG_LEGACY_CAPSULE_BOUNDS.min)).toBe(true);
    expect(Object.isFrozen(SANDBAG_LEGACY_CAPSULE_BOUNDS.max)).toBe(true);
    expect(arrays(second.geometry)).toEqual(arrays(first.geometry));

    first.dispose();
    second.dispose();
  });

  it('provides a deterministic 96-triangle low shell without a separate ridge', () => {
    const first = createSandbagGeometry('low');
    const second = createSandbagGeometry('low');
    expect(first.geometry).not.toBe(second.geometry);
    expect(first.geometry.name).toBe('LoadedSandbagShellLow');
    expect(first.stats).toEqual({
      geometries: 1,
      vertices: 74,
      triangles: 96,
      bodyTriangles: 96,
      seamTriangles: 0,
    });
    expect(first.stats.triangles).toBeLessThanOrEqual(98);
    expect(second.stats).toEqual(first.stats);
    expect(arrays(second.geometry)).toEqual(arrays(first.geometry));
    first.dispose();
    second.dispose();
  });

  it('keeps the low topology closed, finite, collider-safe and visibly loaded', () => {
    const result = createSandbagGeometry('low');
    const { geometry } = result;
    const index = geometry.index!;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    expect(index.count).toBe(96 * 3);
    expect(position.count).toBe(74);
    expect(normal.count).toBe(position.count);
    expect(uv.count).toBe(position.count);

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    for (let offset = 0; offset < index.count; offset += 3) {
      a.fromBufferAttribute(position, index.getX(offset));
      b.fromBufferAttribute(position, index.getX(offset + 1));
      c.fromBufferAttribute(position, index.getX(offset + 2));
      edgeA.subVectors(b, a);
      edgeB.subVectors(c, a);
      expect(edgeA.cross(edgeB).lengthSq()).toBeGreaterThan(1e-12);
    }
    for (let vertex = 0; vertex < position.count; vertex++) {
      expect([
        position.getX(vertex), position.getY(vertex), position.getZ(vertex),
        normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex),
        uv.getX(vertex), uv.getY(vertex),
      ].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex))).toBeCloseTo(1, 5);
      expect(uv.getX(vertex)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(vertex)).toBeLessThanOrEqual(1);
      expect(uv.getY(vertex)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(vertex)).toBeLessThanOrEqual(1);
    }

    const legacy = SANDBAG_LEGACY_CAPSULE_BOUNDS;
    const bounds = geometry.boundingBox!;
    expect(bounds.min.toArray()).toEqual(expect.arrayContaining([
      expect.any(Number), expect.any(Number), expect.any(Number),
    ]));
    expect(bounds.min.x).toBeGreaterThanOrEqual(legacy.min[0]);
    expect(bounds.min.y).toBeGreaterThanOrEqual(legacy.min[1]);
    expect(bounds.min.z).toBeGreaterThanOrEqual(legacy.min[2]);
    expect(bounds.max.x).toBeLessThanOrEqual(legacy.max[0]);
    expect(bounds.max.y).toBeLessThanOrEqual(legacy.max[1]);
    expect(bounds.max.z).toBeLessThanOrEqual(legacy.max[2]);
    expect(bounds.min.x).toBeCloseTo(-.276, 6);
    expect(bounds.max.z).toBeCloseTo(.29767, 6);

    const lowerEnd = ringExtents(geometry, 0, 8);
    const middle = ringExtents(geometry, 3, 8);
    const upperEnd = ringExtents(geometry, 5, 8);
    expect(middle.x).toBeGreaterThan(lowerEnd.x * 6);
    expect(middle.z).toBeGreaterThan(lowerEnd.z * 8);
    expect(middle.x).toBeGreaterThan(upperEnd.x * 6);
    expect(middle.z).toBeGreaterThan(upperEnd.z * 8);

    const middleStart = 3 * 9;
    // The top cross-section vertex carries a four-millimetre sewn crest with
    // no extra vertices or triangles in the low shell.
    expect(position.getX(middleStart + 4)).toBeCloseTo(.280, 6);
    const middleX = Array.from({ length: 9 }, (_, segment) => position.getX(middleStart + segment));
    const minimumX = Math.min(...middleX);
    const settled = Array.from({ length: 9 }, (_, segment) => middleStart + segment)
      .filter((vertex) => position.getX(vertex) <= minimumX + .0151);
    const settledZ = settled.map((vertex) => position.getZ(vertex));
    expect(settled.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...settledZ) - Math.min(...settledZ)).toBeGreaterThan(.47);

    for (let ring = 0; ring < 6; ring++) {
      const first = ring * 9;
      const last = first + 8;
      expect(position.getX(first)).toBeCloseTo(position.getX(last), 6);
      expect(position.getY(first)).toBeCloseTo(position.getY(last), 6);
      expect(position.getZ(first)).toBeCloseTo(position.getZ(last), 6);
      expect(uv.getX(first)).toBe(0);
      expect(uv.getX(last)).toBe(1);
    }
    const sideVertexCount = 6 * 9;
    const sideZ = Array.from({ length: sideVertexCount }, (_, vertex) => position.getZ(vertex));
    expect(Math.max(...sideZ)).toBeGreaterThan(Math.abs(Math.min(...sideZ)) * 1.05);
    result.dispose();
  });

  it('validates an invalid runtime quality selector', () => {
    expect(() => createSandbagGeometry('cinematic' as 'high')).toThrow(/quality/);
  });

  it('uses indexed, closed, nondegenerate topology inside the triangle target', () => {
    const result = createSandbagGeometry();
    const { geometry } = result;
    const index = geometry.index;
    const position = geometry.getAttribute('position');
    expect(index).not.toBeNull();
    expect(index!.count).toBe(result.stats.triangles * 3);
    expect(result.stats.triangles).toBeGreaterThanOrEqual(160);
    expect(result.stats.triangles).toBeLessThanOrEqual(240);
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
    result.dispose();
  });

  it('provides aligned finite positions, unit normals and in-range UVs', () => {
    const result = createSandbagGeometry();
    const position = result.geometry.getAttribute('position');
    const normal = result.geometry.getAttribute('normal');
    const uv = result.geometry.getAttribute('uv');
    expect(Object.keys(result.geometry.attributes).sort()).toEqual(['normal', 'position', 'uv']);
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
    result.dispose();
  });

  it('duplicates its underside UV seam and uses split planar end-cap normals', () => {
    const result = createSandbagGeometry();
    const position = result.geometry.getAttribute('position');
    const normal = result.geometry.getAttribute('normal');
    const uv = result.geometry.getAttribute('uv');
    for (let ring = 0; ring < 9; ring++) {
      const first = ring * 11;
      const last = first + 10;
      expect(position.getX(first)).toBeCloseTo(position.getX(last), 6);
      expect(position.getY(first)).toBeCloseTo(position.getY(last), 6);
      expect(position.getZ(first)).toBeCloseTo(position.getZ(last), 6);
      expect(position.getX(first)).toBeLessThan(0);
      expect(normal.getX(first)).toBeCloseTo(normal.getX(last), 6);
      expect(normal.getY(first)).toBeCloseTo(normal.getY(last), 6);
      expect(normal.getZ(first)).toBeCloseTo(normal.getZ(last), 6);
      expect(uv.getX(first)).toBe(0);
      expect(uv.getX(last)).toBe(1);
    }

    const bottomCenter = 99;
    const bottomPerimeter = 100;
    const topCenter = 111;
    const topPerimeter = 112;
    expect(normal.getY(bottomCenter)).toBe(-1);
    expect(normal.getY(topCenter)).toBe(1);
    for (let segment = 0; segment <= 10; segment++) {
      expect(normal.getX(bottomPerimeter + segment)).toBe(0);
      expect(normal.getY(bottomPerimeter + segment)).toBe(-1);
      expect(normal.getZ(bottomPerimeter + segment)).toBe(0);
      expect(normal.getX(topPerimeter + segment)).toBe(0);
      expect(normal.getY(topPerimeter + segment)).toBe(1);
      expect(normal.getZ(topPerimeter + segment)).toBe(0);
    }
    result.dispose();
  });

  it('is exactly bounded by its authored shape and contained by the legacy capsule envelope', () => {
    const result = createSandbagGeometry();
    const bounds = result.geometry.boundingBox!;
    expect(bounds.min.x).toBeCloseTo(-.2778646052, 7);
    expect(bounds.min.y).toBeCloseTo(-.844, 7);
    expect(bounds.min.z).toBeCloseTo(-.2766397893, 7);
    expect(bounds.max.x).toBeCloseTo(.284, 7);
    expect(bounds.max.y).toBeCloseTo(.844, 7);
    expect(bounds.max.z).toBeCloseTo(.2928894162, 7);

    const legacy = SANDBAG_LEGACY_CAPSULE_BOUNDS;
    expect(bounds.min.x).toBeGreaterThanOrEqual(legacy.min[0]);
    expect(bounds.min.y).toBeGreaterThanOrEqual(legacy.min[1]);
    expect(bounds.min.z).toBeGreaterThanOrEqual(legacy.min[2]);
    expect(bounds.max.x).toBeLessThanOrEqual(legacy.max[0]);
    expect(bounds.max.y).toBeLessThanOrEqual(legacy.max[1]);
    expect(bounds.max.z).toBeLessThanOrEqual(legacy.max[2]);
    result.dispose();
  });

  it('has a loaded middle, puckered ends and a broad flattened underside', () => {
    const result = createSandbagGeometry();
    const geometry = result.geometry;
    const lowerEnd = ringExtents(geometry, 0);
    const middle = ringExtents(geometry, 4);
    const upperEnd = ringExtents(geometry, 8);
    expect(middle.x).toBeGreaterThan(lowerEnd.x * 6);
    expect(middle.z).toBeGreaterThan(lowerEnd.z * 8);
    expect(middle.x).toBeGreaterThan(upperEnd.x * 6);
    expect(middle.z).toBeGreaterThan(upperEnd.z * 8);

    const position = geometry.getAttribute('position');
    const start = 4 * 11;
    const middleX = Array.from({ length: 11 }, (_, index) => position.getX(start + index));
    const minimumX = Math.min(...middleX);
    const settledVertices = Array.from({ length: 11 }, (_, index) => start + index)
      .filter((index) => position.getX(index) <= minimumX + .015);
    const settledZ = settledVertices.map((index) => position.getZ(index));
    expect(settledVertices.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...settledZ) - Math.min(...settledZ)).toBeGreaterThan(.4);
    result.dispose();
  });

  it('bakes a raised longitudinal ridge and asymmetric fill into the same geometry', () => {
    const result = createSandbagGeometry();
    const position = result.geometry.getAttribute('position');
    const bodyVertexCount = 123;
    const bodyX = Array.from({ length: bodyVertexCount }, (_, index) => position.getX(index));
    const ridgeX = Array.from(
      { length: position.count - bodyVertexCount },
      (_, index) => position.getX(bodyVertexCount + index),
    );
    expect(Math.max(...ridgeX)).toBeGreaterThan(Math.max(...bodyX) + .005);
    expect(result.stats.seamTriangles).toBe(26);

    for (let vertex = bodyVertexCount; vertex < position.count; vertex++) {
      expect(Math.abs(position.getZ(vertex))).toBeLessThanOrEqual(.0141);
      expect(Math.abs(position.getY(vertex))).toBeLessThanOrEqual(.7901);
    }
    const bodyZ = Array.from({ length: bodyVertexCount }, (_, index) => position.getZ(index));
    expect(Math.max(...bodyZ)).toBeGreaterThan(Math.abs(Math.min(...bodyZ)) * 1.05);
    result.dispose();
  });

  it('owns no material or scene state and disposes its geometry exactly once', () => {
    const result = createSandbagGeometry();
    expect(Object.keys(result).sort()).toEqual(['dispose', 'geometry', 'stats']);
    expect(result).not.toHaveProperty('material');
    expect(result).not.toHaveProperty('texture');
    expect(result.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(result.geometry).not.toBeInstanceOf(THREE.Material);
    expect(result.geometry).not.toBeInstanceOf(THREE.Texture);
    expect(result.geometry).not.toBeInstanceOf(THREE.Object3D);
    const geometryDispose = vi.spyOn(result.geometry, 'dispose');
    result.dispose();
    result.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });
});
