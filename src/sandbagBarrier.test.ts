import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  SANDBAG_BARRIER_COUNT,
  createSandbagBarrierPresentation,
} from './sandbagBarrier';

function matrices(mesh: THREE.InstancedMesh): number[][] {
  const matrix = new THREE.Matrix4();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    return matrix.toArray();
  });
}

describe('createSandbagBarrierPresentation', () => {
  it('uses one deterministic instanced draw with quality-scaled authored shells', () => {
    const low = createSandbagBarrierPresentation(new THREE.Group(), { quality: 'low' });
    const high = createSandbagBarrierPresentation(new THREE.Group(), { quality: 'high' });
    expect(low.stats).toEqual({
      quality: 'low', bags: 6, drawCalls: 1, geometries: 1, colliders: 6,
      trianglesPerBag: 96, submittedTriangles: 576,
    });
    expect(high.stats).toEqual({
      quality: 'high', bags: 6, drawCalls: 1, geometries: 1, colliders: 6,
      trianglesPerBag: 206, submittedTriangles: 1_236,
    });
    expect(low.bags.count).toBe(SANDBAG_BARRIER_COUNT);
    expect(high.bags.count).toBe(SANDBAG_BARRIER_COUNT);
    expect(low.bags.geometry.name).toBe('LoadedSandbagShellLow');
    expect(high.bags.geometry.name).toBe('LoadedSandbagShell');
    expect(matrices(low.bags)).toEqual(matrices(high.bags));
    expect(low.bags.instanceColor?.count).toBe(6);
    expect(high.bags.instanceColor?.array).toEqual(low.bags.instanceColor?.array);
    low.dispose();
    high.dispose();
  });

  it('preserves all six authoritative legacy AABBs exactly across quality tiers', () => {
    const low = createSandbagBarrierPresentation(new THREE.Group(), { quality: 'low' });
    const high = createSandbagBarrierPresentation(new THREE.Group(), { quality: 'high' });
    for (let index = 0; index < 6; index++) {
      expect(high.colliders[index].min.toArray()).toEqual(low.colliders[index].min.toArray());
      expect(high.colliders[index].max.toArray()).toEqual(low.colliders[index].max.toArray());
    }
    const union = low.colliders.reduce((box, collider) => box.union(collider), new THREE.Box3());
    expect(union.min.x).toBeCloseTo(-2.8821328403, 8);
    expect(union.min.y).toBeCloseTo(.02000001, 6);
    expect(union.min.z).toBeCloseTo(23.5652509991, 8);
    expect(union.max.x).toBeCloseTo(5.1321328403, 8);
    expect(union.max.y).toBeCloseTo(.6283100510, 8);
    expect(union.max.z).toBeCloseTo(24.4347490009, 8);
    low.dispose();
    high.dispose();
  });

  it('keeps every visual shell inside its corresponding gameplay collider', () => {
    for (const quality of ['low', 'high'] as const) {
      const presentation = createSandbagBarrierPresentation(new THREE.Group(), { quality });
      const localBounds = presentation.bags.geometry.boundingBox!;
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < presentation.bags.count; index++) {
        presentation.bags.getMatrixAt(index, matrix);
        const visualBounds = localBounds.clone().applyMatrix4(matrix);
        expect(presentation.colliders[index].containsBox(visualBounds), `${quality}:${index}`).toBe(true);
      }
      presentation.dispose();
    }
  });

  it('owns geometry and fallback material but never disposes an injected burlap material', () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const materialDispose = vi.spyOn(material, 'dispose');
    const presentation = createSandbagBarrierPresentation(parent, { material });
    const geometryDispose = vi.spyOn(presentation.bags.geometry, 'dispose');
    expect(parent.children).toContain(presentation.group);
    presentation.dispose();
    presentation.dispose();
    expect(parent.children).not.toContain(presentation.group);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
    material.dispose();
  });
});
