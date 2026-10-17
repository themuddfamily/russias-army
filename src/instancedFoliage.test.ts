import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createInstancedFoliage, type WinterPinePlacement } from './instancedFoliage';

const PLACEMENTS: readonly WinterPinePlacement[] = [
  { x: -7.5, z: 12, scale: .8 },
  { x: 3, z: -4.25, scale: 1.15 },
  { x: 16.5, z: 8, scale: 1.4 },
];

function matrixArray(mesh: THREE.InstancedMesh): number[] {
  return Array.from(mesh.instanceMatrix.array);
}

describe('createInstancedFoliage', () => {
  it('represents any tree count with three decorative draw batches', () => {
    const scene = new THREE.Scene();
    const foliage = createInstancedFoliage(scene, PLACEMENTS, {
      castShadow: false,
      receiveShadow: true,
    });

    expect(scene.children).toContain(foliage.group);
    expect(foliage.group.children).toEqual([
      foliage.batches.trunks,
      foliage.batches.crowns,
      foliage.batches.snowCaps,
    ]);
    expect(foliage.group.userData.decorative).toBe(true);
    expect(foliage.batches.trunks.count).toBe(3);
    expect(foliage.batches.crowns.count).toBe(12);
    expect(foliage.batches.snowCaps.count).toBe(3);
    expect(foliage.stats).toEqual({
      quality: 'low',
      treeCount: 3,
      trunkInstances: 3,
      crownInstances: 12,
      snowCapInstances: 3,
      totalInstances: 18,
      drawBatches: 3,
      drawCalls: 3,
      geometries: 3,
      ownedGeometries: 3,
      materials: 3,
      ownedMaterials: 3,
      textures: 0,
      colliders: 0,
      uniqueTriangles: 55,
      trianglesPerTree: 109,
      submittedTriangles: 327,
    });
    for (const batch of Object.values(foliage.batches)) {
      expect(batch).toBeInstanceOf(THREE.InstancedMesh);
      expect(batch.castShadow).toBe(false);
      expect(batch.receiveShadow).toBe(true);
      expect(batch.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
    }

    foliage.dispose();
  });

  it('merges a high-quality spruce into one rooted instance in each of three batches', () => {
    const foliage = createInstancedFoliage(new THREE.Group(), PLACEMENTS, {
      quality: 'high',
      seed: 90210,
    });

    expect(foliage.batches.trunks.count).toBe(3);
    expect(foliage.batches.crowns.count).toBe(3);
    expect(foliage.batches.snowCaps.count).toBe(3);
    expect(foliage.stats).toEqual({
      quality: 'high',
      treeCount: 3,
      trunkInstances: 3,
      crownInstances: 3,
      snowCapInstances: 3,
      totalInstances: 9,
      drawBatches: 3,
      drawCalls: 3,
      geometries: 3,
      ownedGeometries: 3,
      materials: 3,
      ownedMaterials: 3,
      textures: 0,
      colliders: 0,
      uniqueTriangles: 172,
      trianglesPerTree: 172,
      submittedTriangles: 516,
    });
    expect(foliage.stats.trianglesPerTree).toBeLessThanOrEqual(180);
    expect(foliage.stats.submittedTriangles / foliage.stats.treeCount).toBe(172);

    const matrix = new THREE.Matrix4();
    for (let tree = 0; tree < PLACEMENTS.length; tree++) {
      foliage.batches.trunks.getMatrixAt(tree, matrix);
      const trunk = matrix.toArray();
      foliage.batches.crowns.getMatrixAt(tree, matrix);
      expect(matrix.toArray()).toEqual(trunk);
      foliage.batches.snowCaps.getMatrixAt(tree, matrix);
      expect(matrix.toArray()).toEqual(trunk);
    }

    for (const batch of Object.values(foliage.batches)) {
      expect(batch.instanceColor).not.toBeNull();
      expect(batch.instanceColor?.usage).toBe(THREE.StaticDrawUsage);
      expect(batch.boundingBox).not.toBeNull();
      expect(batch.boundingSphere).not.toBeNull();
      for (const value of batch.instanceColor?.array ?? []) {
        expect(value).toBeGreaterThanOrEqual(.85);
        expect(value).toBeLessThanOrEqual(1);
      }
    }

    foliage.dispose();
  });

  it('keeps the 54-tree high-quality arena submission below its fixed ceiling', () => {
    const placements = Array.from({ length: 54 }, (_, index): WinterPinePlacement => ({
      x: index % 9 * 4,
      z: Math.floor(index / 9) * 4,
      scale: .8 + index % 5 * .1,
    }));
    const foliage = createInstancedFoliage(new THREE.Group(), placements, { quality: 'high' });

    expect(foliage.stats).toMatchObject({
      treeCount: 54,
      totalInstances: 162,
      drawCalls: 3,
      geometries: 3,
      trianglesPerTree: 172,
      submittedTriangles: 9_288,
    });
    expect(foliage.stats.submittedTriangles).toBeLessThanOrEqual(9_720);

    foliage.dispose();
  });

  it('keeps the high-quality unit silhouette compact with upward-facing sparse snow shelves', () => {
    const foliage = createInstancedFoliage(new THREE.Group(), [{ x: 0, z: 0, scale: 1 }], {
      quality: 'high',
      seed: 17,
    });
    const geometries = Object.values(foliage.batches).map((batch) => batch.geometry);
    for (const geometry of geometries) {
      const position = geometry.getAttribute('position');
      let maximumRadius = 0;
      let minimumY = Number.POSITIVE_INFINITY;
      let maximumY = Number.NEGATIVE_INFINITY;
      for (let vertex = 0; vertex < position.count; vertex++) {
        const x = position.getX(vertex);
        const y = position.getY(vertex);
        const z = position.getZ(vertex);
        maximumRadius = Math.max(maximumRadius, Math.hypot(x, z));
        minimumY = Math.min(minimumY, y);
        maximumY = Math.max(maximumY, y);
      }
      expect(minimumY).toBeGreaterThanOrEqual(-1e-6);
      expect(maximumY).toBeLessThanOrEqual(5.75);
      expect(maximumRadius).toBeLessThanOrEqual(1.55);
      for (const name of Object.keys(geometry.attributes)) {
        expect(geometry.getAttribute(name).usage).toBe(THREE.StaticDrawUsage);
      }
      expect(geometry.index?.usage ?? THREE.StaticDrawUsage).toBe(THREE.StaticDrawUsage);
    }

    const snowNormal = foliage.batches.snowCaps.geometry.getAttribute('normal');
    for (let vertex = 0; vertex < snowNormal.count; vertex++) {
      expect(snowNormal.getY(vertex)).toBeGreaterThan(.45);
    }
    // Only one third of each of three 12-sector whorls receives snow.
    expect(foliage.batches.snowCaps.geometry.getAttribute('position').count / 3).toBe(24);

    foliage.dispose();
  });

  it('varies high-quality width, height, yaw, and lean deterministically within narrow bounds', () => {
    const first = createInstancedFoliage(new THREE.Group(), PLACEMENTS, { quality: 'high', seed: 7301, groundY: 2 });
    const second = createInstancedFoliage(new THREE.Group(), PLACEMENTS, { quality: 'high', seed: 7301, groundY: 2 });
    const changed = createInstancedFoliage(new THREE.Group(), PLACEMENTS, { quality: 'high', seed: 7302, groundY: 2 });

    expect(matrixArray(first.batches.trunks)).toEqual(matrixArray(second.batches.trunks));
    expect(Array.from(first.batches.crowns.instanceColor?.array ?? [])).toEqual(
      Array.from(second.batches.crowns.instanceColor?.array ?? []),
    );
    expect(matrixArray(first.batches.trunks)).not.toEqual(matrixArray(changed.batches.trunks));
    expect(Array.from(first.batches.crowns.instanceColor?.array ?? [])).not.toEqual(
      Array.from(changed.batches.crowns.instanceColor?.array ?? []),
    );

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3();
    for (let tree = 0; tree < PLACEMENTS.length; tree++) {
      first.batches.trunks.getMatrixAt(tree, matrix);
      matrix.decompose(position, rotation, scale);
      const baseScale = PLACEMENTS[tree].scale;
      expect(position.x).toBeCloseTo(PLACEMENTS[tree].x, 6);
      expect(position.z).toBeCloseTo(PLACEMENTS[tree].z, 6);
      expect(position.y).toBeGreaterThanOrEqual(2);
      expect(position.y).toBeLessThan(2 + baseScale * .02);
      expect(scale.x / baseScale).toBeGreaterThanOrEqual(.93);
      expect(scale.x / baseScale).toBeLessThanOrEqual(1.07);
      expect(scale.y / baseScale).toBeGreaterThanOrEqual(.95);
      expect(scale.y / baseScale).toBeLessThanOrEqual(1.07);
      expect(scale.z / baseScale).toBeGreaterThanOrEqual(.93);
      expect(scale.z / baseScale).toBeLessThanOrEqual(1.07);
      up.set(0, 1, 0).applyQuaternion(rotation);
      expect(up.angleTo(new THREE.Vector3(0, 1, 0))).toBeLessThanOrEqual(.04001);
    }

    first.dispose();
    second.dispose();
    changed.dispose();
  });

  it('builds deterministic transforms with placement-order tier indexing', () => {
    const first = createInstancedFoliage(new THREE.Group(), PLACEMENTS, { seed: 7301, groundY: 2 });
    const second = createInstancedFoliage(new THREE.Group(), PLACEMENTS, { seed: 7301, groundY: 2 });
    const changed = createInstancedFoliage(new THREE.Group(), PLACEMENTS, { seed: 7302, groundY: 2 });

    expect(matrixArray(first.batches.trunks)).toEqual(matrixArray(second.batches.trunks));
    expect(matrixArray(first.batches.crowns)).toEqual(matrixArray(second.batches.crowns));
    expect(matrixArray(first.batches.snowCaps)).toEqual(matrixArray(second.batches.snowCaps));
    expect(matrixArray(first.batches.trunks)).not.toEqual(matrixArray(changed.batches.trunks));

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    first.batches.trunks.getMatrixAt(1, matrix);
    matrix.decompose(position, rotation, scale);
    expect(position.x).toBeCloseTo(3, 6);
    expect(position.y).toBeCloseTo(3.2075, 6);
    expect(position.z).toBeCloseTo(-4.25, 6);
    expect(scale.x).toBeCloseTo(1.15, 6);
    expect(scale.y).toBeCloseTo(1.15, 6);
    expect(scale.z).toBeCloseTo(1.15, 6);

    // Tree 1, tier 2 is instance 1 * 4 + 2.
    first.batches.crowns.getMatrixAt(6, matrix);
    matrix.decompose(position, rotation, scale);
    expect(position.x).toBeCloseTo(3, 6);
    expect(position.y).toBeCloseTo(2 + (2.2 + 2 * .75) * 1.15, 6);
    expect(position.z).toBeCloseTo(-4.25, 6);
    expect(scale.x).toBeCloseTo(1 * 1.15, 6);
    expect(scale.y).toBeCloseTo(2.4 * 1.15, 6);
    expect(scale.z).toBeCloseTo(1 * 1.15, 6);

    first.dispose();
    second.dispose();
    changed.dispose();
  });

  it('detaches and disposes owned resources once without disposing injected materials', () => {
    const parent = new THREE.Group();
    const trunk = new THREE.MeshStandardMaterial();
    const foliageMaterial = new THREE.MeshStandardMaterial();
    const snow = new THREE.MeshStandardMaterial();
    const injectedDisposals = [trunk, foliageMaterial, snow].map((material) => vi.spyOn(material, 'dispose'));
    const foliage = createInstancedFoliage(parent, PLACEMENTS, {
      materials: { trunk, foliage: foliageMaterial, snow },
    });
    const geometryDisposals = Object.values(foliage.batches).map((batch) => vi.spyOn(batch.geometry, 'dispose'));

    foliage.dispose();
    foliage.dispose();

    expect(parent.children).not.toContain(foliage.group);
    for (const dispose of geometryDisposals) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of injectedDisposals) expect(dispose).not.toHaveBeenCalled();

    trunk.dispose();
    foliageMaterial.dispose();
    snow.dispose();
  });

  it('owns fallback materials and validates malformed placement data', () => {
    const foliage = createInstancedFoliage(new THREE.Group(), PLACEMENTS);
    const materialDisposals = Object.values(foliage.batches).map((batch) => vi.spyOn(batch.material as THREE.Material, 'dispose'));
    foliage.dispose();
    foliage.dispose();
    for (const dispose of materialDisposals) expect(dispose).toHaveBeenCalledTimes(1);

    expect(() => createInstancedFoliage(new THREE.Group(), [{ x: 0, z: 0, scale: 0 }])).toThrow(/scale/);
    expect(() => createInstancedFoliage(new THREE.Group(), [{ x: Number.NaN, z: 0, scale: 1 }])).toThrow(/\.x/);
    expect(() => createInstancedFoliage(new THREE.Group(), [], { groundY: Number.POSITIVE_INFINITY })).toThrow(/groundY/);
    expect(() => createInstancedFoliage(new THREE.Group(), [], { seed: 1.5 })).toThrow(/seed/);
    expect(() => createInstancedFoliage(new THREE.Group(), [], { quality: 'ultra' as 'high' })).toThrow(/quality/);
  });

  it('reports and releases only partially owned fallback materials', () => {
    const injectedTrunk = new THREE.MeshStandardMaterial();
    const injectedDispose = vi.spyOn(injectedTrunk, 'dispose');
    const foliage = createInstancedFoliage(new THREE.Group(), PLACEMENTS, {
      quality: 'high',
      materials: { trunk: injectedTrunk },
    });
    const ownedDisposals = [foliage.batches.crowns, foliage.batches.snowCaps]
      .map((batch) => vi.spyOn(batch.material as THREE.Material, 'dispose'));

    expect(foliage.stats.ownedMaterials).toBe(2);
    foliage.dispose();
    foliage.dispose();
    expect(injectedDispose).not.toHaveBeenCalled();
    for (const dispose of ownedDisposals) expect(dispose).toHaveBeenCalledTimes(1);

    injectedTrunk.dispose();
  });
});
