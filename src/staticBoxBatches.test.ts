import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createStaticBoxBatches } from './staticBoxBatches';

describe('createStaticBoxBatches', () => {
  it('groups arbitrary boxes by material and shadow state with stable transforms', () => {
    const parent = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial();
    const snow = new THREE.MeshStandardMaterial();
    const batches = createStaticBoxBatches(parent, [
      { size: [2, 3, 4], position: [1, 2, 3], material: steel },
      { size: [1, .5, 2], position: [-2, 1, 4], rotation: [0, Math.PI / 2, 0], material: steel },
      { size: [5, .1, 5], position: [0, 4, 0], material: snow, castShadow: false },
      { size: [.2, 1, .2], position: [3, .5, 2], material: steel, castShadow: false },
    ], 'TestBoxes');

    expect(parent.children).toEqual([batches.root]);
    expect(batches.stats).toEqual({ instances: 4, batches: 3, triangles: 48 });
    expect(batches.meshes.every((mesh) => mesh.instanceMatrix.usage === THREE.StaticDrawUsage)).toBe(true);
    const mainSteel = batches.meshes.find((mesh) => mesh.material === steel && mesh.castShadow)!;
    expect(mainSteel.count).toBe(2);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    mainSteel.getMatrixAt(0, matrix);
    matrix.decompose(position, quaternion, scale);
    expect(position.toArray()).toEqual([1, 2, 3]);
    expect(scale.toArray()).toEqual([2, 3, 4]);
  });

  it('separates matching material and shadow instances by their optional cluster', () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const batches = createStaticBoxBatches(parent, [
      { size: [1, 1, 1], position: [0, 0, 0], material },
      { size: [1, 1, 1], position: [1, 0, 0], material },
      { size: [1, 1, 1], position: [2, 0, 0], material, cluster: 'north' },
      { size: [1, 1, 1], position: [3, 0, 0], material, cluster: 'north' },
      { size: [1, 1, 1], position: [4, 0, 0], material, cluster: 'south' },
    ]);

    expect(batches.stats).toEqual({ instances: 5, batches: 3, triangles: 60 });
    expect(batches.meshes.map((mesh) => mesh.count).sort((a, b) => a - b)).toEqual([1, 2, 2]);
  });

  it('retains one batch for unclustered instances with matching material and shadows', () => {
    const material = new THREE.MeshStandardMaterial();
    const batches = createStaticBoxBatches(new THREE.Group(), [
      { size: [1, 1, 1], position: [0, 0, 0], material },
      { size: [2, 1, 1], position: [2, 0, 0], material },
    ]);

    expect(batches.stats).toEqual({ instances: 2, batches: 1, triangles: 24 });
    expect(batches.meshes).toHaveLength(1);
    expect(batches.meshes[0].count).toBe(2);
  });

  it('preserves caller materials and disposes shared geometry only once', () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const materialDispose = vi.spyOn(material, 'dispose');
    const batches = createStaticBoxBatches(parent, [
      { size: [1, 1, 1], position: [0, 0, 0], material },
    ]);
    const geometryDispose = vi.spyOn(batches.meshes[0].geometry, 'dispose');
    batches.dispose();
    batches.dispose();
    expect(parent.children).not.toContain(batches.root);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
    material.dispose();
  });

  it('uploads optional per-instance colors without splitting a spatial batch', () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const batches = createStaticBoxBatches(parent, [
      { size: [1, 1, 1], position: [0, 0, 0], material, cluster: 'details', color: 0xd24a3b },
      { size: [1, 1, 1], position: [2, 0, 0], material, cluster: 'details', color: 0x4b83c4 },
    ]);
    const mesh = batches.meshes[0];
    const color = new THREE.Color();

    expect(batches.stats).toEqual({ instances: 2, batches: 1, triangles: 24 });
    expect(mesh.instanceColor?.usage).toBe(THREE.StaticDrawUsage);
    mesh.getColorAt(0, color);
    expect(color.getHex()).toBe(0xd24a3b);
    mesh.getColorAt(1, color);
    expect(color.getHex()).toBe(0x4b83c4);
    batches.dispose();
    material.dispose();
  });

  it('validates finite transforms and positive dimensions', () => {
    const material = new THREE.MeshBasicMaterial();
    expect(() => createStaticBoxBatches(new THREE.Group(), [
      { size: [1, 0, 1], position: [0, 0, 0], material },
    ])).toThrow(/greater than zero/);
    expect(() => createStaticBoxBatches(new THREE.Group(), [
      { size: [1, 1, 1], position: [Number.NaN, 0, 0], material },
    ])).toThrow(/finite/);
    material.dispose();
  });
});
