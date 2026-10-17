import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ContactShadows, createContactShadows, type ContactShadowTarget } from './contactShadows';

function opacityArray(shadows: ContactShadows): number[] {
  const attribute = shadows.mesh.geometry.getAttribute('instanceOpacity') as THREE.InstancedBufferAttribute;
  return Array.from(attribute.array).slice(0, shadows.mesh.count);
}

describe('ContactShadows', () => {
  it('uses one fixed-capacity draw batch and clamps only drawable targets', () => {
    const parent = new THREE.Group();
    const shadows = createContactShadows(parent, 2);
    const statsReference = shadows.stats;
    const targets: ContactShadowTarget[] = [
      { position: { x: -2, y: 0, z: 1 }, radius: .7, visible: false },
      { position: { x: 1, y: 0, z: 2 }, radius: .8 },
      { position: { x: 2, y: 0, z: 3 }, radius: .9 },
      { position: { x: 3, y: 0, z: 4 }, radius: 1 },
    ];

    expect(parent.children).toEqual([shadows.mesh]);
    expect(shadows.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(shadows.mesh.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);
    expect(shadows.mesh.frustumCulled).toBe(false);
    expect(shadows.mesh.castShadow).toBe(false);
    expect(shadows.mesh.receiveShadow).toBe(false);

    expect(shadows.update(targets)).toBe(statsReference);
    expect(shadows.mesh.count).toBe(2);
    expect(shadows.stats).toEqual({ capacity: 2, submitted: 4, active: 2, clipped: 1, drawCalls: 1 });

    shadows.dispose();
  });

  it('writes stable horizontal transforms, compact visibility, clamped alpha and distance fade', () => {
    const shadows = new ContactShadows(new THREE.Group(), 4, {
      groundY: 2,
      yOffset: .025,
      opacity: .5,
      fadeStart: 10,
      fadeEnd: 20,
    });
    const targets: ContactShadowTarget[] = [
      { position: { x: 3, y: 0, z: 4 }, radius: 1.25, opacity: 2 },
      { position: { x: 0, y: 0, z: 15 }, radius: .75, opacity: .8 },
      { position: { x: 8, y: 0, z: 8 }, radius: 2, opacity: 0 },
      { position: { x: -4, y: 0, z: -4 }, radius: 1, visible: false },
      { position: { x: 0, y: 0, z: 20 }, radius: 1 },
    ];

    shadows.update(targets, { x: 0, y: 0, z: 0 });
    expect(shadows.mesh.count).toBe(2);
    expect(shadows.stats).toEqual({ capacity: 4, submitted: 5, active: 2, clipped: 0, drawCalls: 1 });
    expect(opacityArray(shadows)[0]).toBeCloseTo(.5, 6);
    expect(opacityArray(shadows)[1]).toBeCloseTo(.5 * .8 * .5, 6);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    shadows.mesh.getMatrixAt(0, matrix);
    matrix.decompose(position, rotation, scale);
    expect(position.x).toBeCloseTo(3, 6);
    expect(position.y).toBeCloseTo(2.025, 6);
    expect(position.z).toBeCloseTo(4, 6);
    expect(scale.toArray()).toEqual([1.25, 1, 1.25]);

    const firstMatrices = Array.from(shadows.mesh.instanceMatrix.array);
    const firstOpacity = opacityArray(shadows);
    shadows.update(targets, { x: 0, y: 0, z: 0 });
    expect(Array.from(shadows.mesh.instanceMatrix.array)).toEqual(firstMatrices);
    expect(opacityArray(shadows)).toEqual(firstOpacity);

    shadows.update([], { x: 0, y: 0, z: 0 });
    expect(shadows.mesh.count).toBe(0);
    expect(shadows.stats).toEqual({ capacity: 4, submitted: 0, active: 0, clipped: 0, drawCalls: 0 });
    shadows.dispose();
  });

  it('owns and disposes its geometry, material and procedural texture exactly once', () => {
    const parent = new THREE.Group();
    const shadows = createContactShadows(parent, 3);
    const geometryDispose = vi.spyOn(shadows.mesh.geometry, 'dispose');
    const material = shadows.mesh.material;
    const materialDispose = vi.spyOn(material, 'dispose');
    const texture = material.uniforms.shadowMap!.value as THREE.DataTexture;
    const textureDispose = vi.spyOn(texture, 'dispose');

    shadows.dispose();
    shadows.dispose();

    expect(parent.children).not.toContain(shadows.mesh);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(shadows.stats.active).toBe(0);
  });

  it('validates construction and target data', () => {
    const parent = new THREE.Group();
    expect(() => new ContactShadows(parent, -1)).toThrow(/capacity/);
    expect(() => new ContactShadows(parent, 1.2)).toThrow(/capacity/);
    expect(() => new ContactShadows(parent, 1, { fadeStart: 10, fadeEnd: 10 })).toThrow(/fadeEnd/);
    expect(() => new ContactShadows(parent, 1, { groundY: Number.NaN })).toThrow(/groundY/);
    expect(() => new ContactShadows(parent, 1, { textureSize: 2 })).toThrow(/textureSize/);

    const shadows = new ContactShadows(parent, 1);
    expect(() => shadows.update([{ position: { x: 0, y: 0, z: 0 }, radius: 0 }])).toThrow(/radius/);
    expect(() => shadows.update([{ position: { x: Number.NaN, y: 0, z: 0 }, radius: 1 }])).toThrow(/position.x/);
    expect(() => shadows.update([{ position: { x: 0, y: 0, z: 0 }, radius: 1, opacity: Number.NaN }])).toThrow(/opacity/);
    shadows.dispose();
  });
});
