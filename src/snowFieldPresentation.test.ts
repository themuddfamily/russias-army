import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createSnowFieldPresentation,
  type SnowFieldPresentation,
  type SnowFieldQuality,
} from './snowFieldPresentation';

const EXPECTED_STATS = {
  low: {
    quality: 'low', vertices: 4, triangles: 2, drawCalls: 1, geometries: 1,
    ownedMaterials: 0, ownedTextures: 0, colliders: 0, maxHeight: 0,
  },
  high: {
    quality: 'high', vertices: 2_401, triangles: 4_608, drawCalls: 1, geometries: 1,
    ownedMaterials: 0, ownedTextures: 0, colliders: 0, maxHeight: 0,
  },
} as const;

function create(quality: SnowFieldQuality, seed: number | string = 12_903): {
  parent: THREE.Group;
  material: THREE.MeshStandardMaterial;
  field: SnowFieldPresentation;
} {
  const parent = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const field = createSnowFieldPresentation(parent, { quality, seed, material });
  return { parent, material, field };
}

function values(field: SnowFieldPresentation, attribute: string): number[] {
  return Array.from(field.mesh.geometry.getAttribute(attribute).array);
}

describe('createSnowFieldPresentation', () => {
  it.each(['low', 'high'] as const)('reports its exact %s topology and one-draw ownership budget', (quality) => {
    const { parent, material, field } = create(quality);

    expect(parent.children).toEqual([field.mesh]);
    expect(field.stats).toEqual(EXPECTED_STATS[quality]);
    expect(field.mesh.geometry.getAttribute('position').count).toBe(field.stats.vertices);
    expect(field.mesh.geometry.index?.count).toBe(field.stats.triangles * 3);
    expect(field.mesh.castShadow).toBe(false);
    expect(field.mesh.receiveShadow).toBe(true);
    expect(field.mesh.userData).toMatchObject({ presentationOnly: true, authoritativeColliders: 'none' });

    field.dispose();
    material.dispose();
  });

  it.each(['low', 'high'] as const)('keeps every %s vertex at gameplay height zero with finite static attributes', (quality) => {
    const { material, field } = create(quality);
    const geometry = field.mesh.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const color = geometry.getAttribute('color') as THREE.BufferAttribute;

    expect(position.itemSize).toBe(3);
    expect(normal.itemSize).toBe(3);
    expect(uv.itemSize).toBe(2);
    expect(color.itemSize).toBe(3);
    expect(normal.count).toBe(position.count);
    expect(uv.count).toBe(position.count);
    expect(color.count).toBe(position.count);
    for (const attribute of [position, normal, uv, color]) {
      expect(attribute.usage).toBe(THREE.StaticDrawUsage);
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    }
    expect(geometry.index?.usage).toBe(THREE.StaticDrawUsage);

    for (let index = 0; index < position.count; index += 1) {
      expect(position.getY(index)).toBe(0);
      expect(Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index))).toBeCloseTo(1, 6);
      expect(normal.getY(index)).toBeGreaterThan(.97);
      expect(uv.getX(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(index)).toBeLessThanOrEqual(1);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(index)).toBeLessThanOrEqual(1);
      for (const component of [color.getX(index), color.getY(index), color.getZ(index)]) {
        expect(component).toBeGreaterThanOrEqual(.91);
        expect(component).toBeLessThanOrEqual(1);
      }
    }
    expect(geometry.boundingBox?.min.y).toBe(0);
    expect(geometry.boundingBox?.max.y).toBe(0);

    field.dispose();
    material.dispose();
  });

  it('uses upward winding for every indexed triangle', () => {
    const { material, field } = create('high');
    const geometry = field.mesh.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const indices = geometry.index!;
    const first = new THREE.Vector3();
    const second = new THREE.Vector3();
    const third = new THREE.Vector3();
    const cross = new THREE.Vector3();

    for (let offset = 0; offset < indices.count; offset += 3) {
      first.fromBufferAttribute(position, indices.getX(offset));
      second.fromBufferAttribute(position, indices.getX(offset + 1));
      third.fromBufferAttribute(position, indices.getX(offset + 2));
      cross.crossVectors(second.sub(first), third.sub(first));
      expect(cross.y).toBeGreaterThan(0);
    }

    field.dispose();
    material.dispose();
  });

  it('is byte-stable for one seed and changes macro shading for a different seed', () => {
    const first = create('high', 'stable-snow');
    const second = create('high', 'stable-snow');
    const changed = create('high', 'changed-snow');

    expect(values(first.field, 'position')).toEqual(values(second.field, 'position'));
    expect(values(first.field, 'normal')).toEqual(values(second.field, 'normal'));
    expect(values(first.field, 'color')).toEqual(values(second.field, 'color'));
    expect(values(first.field, 'normal')).not.toEqual(values(changed.field, 'normal'));
    expect(values(first.field, 'color')).not.toEqual(values(changed.field, 'color'));
    expect(values(first.field, 'position')).toEqual(values(changed.field, 'position'));

    for (const created of [first, second, changed]) {
      created.field.dispose();
      created.material.dispose();
    }
  });

  it('returns normals and colours to neutral inside masks and feathers outside them', () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const field = createSnowFieldPresentation(parent, {
      quality: 'high',
      seed: 8_801,
      size: 24,
      material,
      masks: [{ minX: -2, maxX: 2, minZ: -2, maxZ: 2, feather: 4 }],
    });
    const position = field.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = field.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const color = field.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    let neutralInside = 0;
    let featheredOutside = 0;
    let variedOutside = 0;

    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const inside = x >= -2 && x <= 2 && z >= -2 && z <= 2;
      const distanceX = Math.max(-2 - x, 0, x - 2);
      const distanceZ = Math.max(-2 - z, 0, z - 2);
      const distance = Math.hypot(distanceX, distanceZ);
      const normalDeviation = Math.hypot(normal.getX(index), normal.getZ(index));
      const colourDeviation = Math.max(
        Math.abs(1 - color.getX(index)),
        Math.abs(1 - color.getY(index)),
        Math.abs(1 - color.getZ(index)),
      );
      if (inside) {
        expect([normal.getX(index), normal.getY(index), normal.getZ(index)]).toEqual([0, 1, 0]);
        expect([color.getX(index), color.getY(index), color.getZ(index)]).toEqual([1, 1, 1]);
        neutralInside += 1;
      } else if (distance > 0 && distance < 4 && normalDeviation + colourDeviation > 1e-6) {
        expect(normalDeviation).toBeLessThan(.16);
        expect(colourDeviation).toBeLessThan(.09);
        featheredOutside += 1;
      } else if (distance >= 4 && normalDeviation + colourDeviation > 1e-4) {
        variedOutside += 1;
      }
    }
    expect(neutralInside).toBeGreaterThan(0);
    expect(featheredOutside).toBeGreaterThan(0);
    expect(variedOutside).toBeGreaterThan(100);

    field.dispose();
    material.dispose();
  });

  it('validates parent, material, quality, dimensions, seeds, and masks', () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const createInvalid = (options: Record<string, unknown>) =>
      createSnowFieldPresentation(parent, options as never);

    expect(() => createSnowFieldPresentation(null as never, { material })).toThrow(/parent/i);
    expect(() => createInvalid({ material: {}, quality: 'high' })).toThrow(/material/i);
    expect(() => createInvalid({ material, quality: 'ultra' })).toThrow(/quality/i);
    expect(() => createInvalid({ material, size: Number.NaN })).toThrow(/size.*finite/i);
    expect(() => createInvalid({ material, size: 0 })).toThrow(/size.*greater than zero/i);
    expect(() => createInvalid({ material, seed: 2.5 })).toThrow(/seed|integer/i);
    expect(() => createInvalid({ material, seed: '' })).toThrow(/seed|empty/i);
    expect(() => createInvalid({ material, masks: [{ minX: 2, maxX: -2, minZ: -1, maxZ: 1 }] }))
      .toThrow(/mask.*maximum/i);
    expect(() => createInvalid({ material, masks: [{ minX: -1, maxX: 1, minZ: -1, maxZ: 1, feather: -1 }] }))
      .toThrow(/feather.*negative/i);

    material.dispose();
  });

  it('detaches and disposes geometry once while preserving its injected material', () => {
    const { parent, material, field } = create('high');
    const geometryDispose = vi.spyOn(field.mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    field.dispose();
    field.dispose();

    expect(parent.children).not.toContain(field.mesh);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
    material.dispose();
  });
});
