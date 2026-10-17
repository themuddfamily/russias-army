import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCrossroadGeometry } from './crossroadGeometry';

interface Bounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function triangleArea(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index) throw new Error('Expected indexed geometry.');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  let area = 0;

  for (let offset = 0; offset < index.count; offset += 3) {
    a.fromBufferAttribute(position, index.getX(offset));
    b.fromBufferAttribute(position, index.getX(offset + 1));
    c.fromBufferAttribute(position, index.getX(offset + 2));
    area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * .5;
  }
  return area;
}

function quadBounds(geometry: THREE.BufferGeometry): Bounds2D[] {
  const position = geometry.getAttribute('position');
  const bounds: Bounds2D[] = [];
  for (let offset = 0; offset < position.count; offset += 4) {
    const xs = [0, 1, 2, 3].map((index) => position.getX(offset + index));
    const zs = [0, 1, 2, 3].map((index) => position.getZ(offset + index));
    bounds.push({
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    });
  }
  return bounds;
}

describe('createCrossroadGeometry', () => {
  it('builds five upward-facing quads with the requested square bounds', () => {
    const geometry = createCrossroadGeometry(100, 12);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');

    expect(position.count).toBe(20);
    expect(normal.count).toBe(20);
    expect(uv.count).toBe(20);
    expect(geometry.getIndex()?.count).toBe(30);
    expect(geometry.userData.quadCount).toBe(5);
    expect(geometry.boundingBox?.min.toArray()).toEqual([-50, 0, -50]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([50, 0, 50]);

    for (let vertex = 0; vertex < normal.count; vertex++) {
      expect([normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)]).toEqual([0, 1, 0]);
    }
    geometry.dispose();
  });

  it('has the exact union area and no positive-area overlap between quads', () => {
    const length = 145;
    const width = 13;
    const geometry = createCrossroadGeometry(length, width);
    const expectedArea = 2 * length * width - width * width;
    const bounds = quadBounds(geometry);

    expect(triangleArea(geometry)).toBeCloseTo(expectedArea, 6);
    expect(geometry.userData.roadArea).toBe(expectedArea);
    for (let first = 0; first < bounds.length; first++) {
      for (let second = first + 1; second < bounds.length; second++) {
        const overlapWidth = Math.max(0, Math.min(bounds[first].maxX, bounds[second].maxX)
          - Math.max(bounds[first].minX, bounds[second].minX));
        const overlapDepth = Math.max(0, Math.min(bounds[first].maxZ, bounds[second].maxZ)
          - Math.max(bounds[first].minZ, bounds[second].minZ));
        expect(overlapWidth * overlapDepth).toBe(0);
      }
    }
    geometry.dispose();
  });

  it('maps duplicate seam positions to identical world-space UVs', () => {
    const geometry = createCrossroadGeometry(80, 10);
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const seen = new Map<string, [number, number]>();
    let duplicateCount = 0;

    for (let vertex = 0; vertex < position.count; vertex++) {
      const key = `${position.getX(vertex)},${position.getZ(vertex)}`;
      const current: [number, number] = [uv.getX(vertex), uv.getY(vertex)];
      const previous = seen.get(key);
      if (previous) {
        expect(current).toEqual(previous);
        duplicateCount++;
      } else {
        seen.set(key, current);
      }
    }
    expect(duplicateCount).toBeGreaterThan(0);
    geometry.dispose();
  });

  it('rejects non-finite, non-positive, and collapsed dimensions', () => {
    expect(() => createCrossroadGeometry(Number.NaN, 10)).toThrow(/length.*finite/i);
    expect(() => createCrossroadGeometry(100, Number.POSITIVE_INFINITY)).toThrow(/width.*finite/i);
    expect(() => createCrossroadGeometry(0, 10)).toThrow(/length.*greater than zero/i);
    expect(() => createCrossroadGeometry(100, -1)).toThrow(/width.*greater than zero/i);
    expect(() => createCrossroadGeometry(10, 10)).toThrow(/length.*greater than its width/i);
    expect(() => createCrossroadGeometry(9, 10)).toThrow(/length.*greater than its width/i);
  });
});
