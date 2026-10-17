import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  WINTER_GROUND_RELIEF_PROGRAM_KEY,
  createWinterGroundRelief,
  type WinterGroundRelief,
  type WinterGroundReliefExclusionRect,
  type WinterGroundReliefPlacement,
} from './winterGroundRelief';

const EXPECTED_BASE_STATS = {
  quality: 'high',
  patches: 88,
  sastrugiPatches: 64,
  windCrustPatches: 16,
  compactedPatches: 8,
  vertices: 84,
  submittedVertices: 7_392,
  trianglesPerPatch: 108,
  submittedTriangles: 9_504,
  drawCalls: 1,
  geometries: 1,
  ownedGeometries: 1,
  injectedMaterials: 1,
  ownedMaterials: 1,
  ownedTextures: 0,
  colliders: 0,
  perFrameUpdates: 0,
  minHeight: -.01,
  maxHeight: .04,
} as const;

function create(
  seed: number | string = 'relief-contract',
  exclusions: readonly WinterGroundReliefExclusionRect[] = [],
): { parent: THREE.Group; material: THREE.MeshStandardMaterial; relief: WinterGroundRelief } {
  const parent = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xdde6e7, roughness: .96 });
  material.name = 'CallerSnow';
  const relief = createWinterGroundRelief(parent, { material, seed, exclusions });
  return { parent, material, relief };
}

function attributeValues(relief: WinterGroundRelief, name: string): number[] {
  return Array.from(relief.root.geometry.getAttribute(name).array);
}

interface TestFootprint {
  x: number;
  z: number;
  axes: readonly (readonly [number, number])[];
  halfLength: number;
  halfWidth: number;
}

function placementFootprint(placement: Readonly<WinterGroundReliefPlacement>, clearance = 0): TestFootprint {
  const cosine = Math.cos(placement.yaw);
  const sine = Math.sin(placement.yaw);
  return {
    x: placement.x,
    z: placement.z,
    axes: [[cosine, -sine], [sine, cosine]],
    halfLength: placement.length * .5 + clearance,
    halfWidth: placement.width * .5 + clearance,
  };
}

function exclusionFootprint(rect: WinterGroundReliefExclusionRect, globalPadding: number): TestFootprint {
  const padding = globalPadding + (rect.padding ?? 0);
  const minX = rect.minX - padding;
  const maxX = rect.maxX + padding;
  const minZ = rect.minZ - padding;
  const maxZ = rect.maxZ + padding;
  return {
    x: (minX + maxX) * .5,
    z: (minZ + maxZ) * .5,
    axes: [[1, 0], [0, 1]],
    halfLength: (maxX - minX) * .5,
    halfWidth: (maxZ - minZ) * .5,
  };
}

function radiusOn(footprint: TestFootprint, axis: readonly [number, number]): number {
  return footprint.halfLength * Math.abs(footprint.axes[0]![0] * axis[0] + footprint.axes[0]![1] * axis[1])
    + footprint.halfWidth * Math.abs(footprint.axes[1]![0] * axis[0] + footprint.axes[1]![1] * axis[1]);
}

function overlap(first: TestFootprint, second: TestFootprint): boolean {
  for (const axis of [...first.axes, ...second.axes]) {
    const distance = Math.abs((second.x - first.x) * axis[0] + (second.z - first.z) * axis[1]);
    if (distance >= radiusOn(first, axis) + radiusOn(second, axis)) return false;
  }
  return true;
}

describe('createWinterGroundRelief', () => {
  it('meets the exact high-only role, topology, submission, and resource contract', () => {
    const { parent, material, relief } = create();
    const counts = relief.placements.reduce<Record<string, number>>((result, placement) => {
      result[placement.kind] = (result[placement.kind] ?? 0) + 1;
      return result;
    }, {});

    expect(relief.stats).toEqual({ ...EXPECTED_BASE_STATS, exclusions: 0 });
    expect(relief.placements).toHaveLength(88);
    expect(counts).toEqual({ sastrugi: 64, 'wind-crust': 16, compacted: 8 });
    expect(parent.children).toEqual([relief.root]);
    expect(relief.root.count).toBe(88);
    expect(relief.root.geometry.getAttribute('position').count).toBe(84);
    expect(relief.root.geometry.index?.count).toBe(324);
    expect(relief.root.castShadow).toBe(false);
    expect(relief.root.receiveShadow).toBe(true);
    expect(relief.root.userData).toMatchObject({
      presentationOnly: true,
      authoritativeColliders: 'none',
      perFrameUpdates: 0,
    });
    expect(relief.root.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
    expect(relief.root.instanceColor?.usage).toBe(THREE.StaticDrawUsage);
    expect(relief.root.boundingBox).not.toBeNull();
    expect(relief.root.boundingSphere).not.toBeNull();

    const quadrantCounts = relief.placements.reduce<Record<string, number>>((result, placement) => {
      result[placement.quadrant] = (result[placement.quadrant] ?? 0) + 1;
      return result;
    }, {});
    expect(quadrantCounts).toEqual({
      'south-west': 22,
      'south-east': 22,
      'north-west': 22,
      'north-east': 22,
    });
    for (const placement of relief.placements) {
      expect(Math.abs(placement.x)).toBeGreaterThanOrEqual(10);
      expect(Math.abs(placement.x)).toBeLessThanOrEqual(55);
      expect(Math.abs(placement.z)).toBeGreaterThanOrEqual(10);
      expect(Math.abs(placement.z)).toBeLessThanOrEqual(55);
      expect(placement.yaw).toBeGreaterThanOrEqual(-.57);
      expect(placement.yaw).toBeLessThanOrEqual(-.29);
      if (placement.kind === 'sastrugi') {
        expect(placement.length).toBeGreaterThanOrEqual(4);
        expect(placement.length).toBeLessThanOrEqual(6.5);
        expect(placement.width).toBeGreaterThanOrEqual(1.4);
        expect(placement.width).toBeLessThanOrEqual(2.2);
        expect(placement.height).toBeGreaterThanOrEqual(.018);
        expect(placement.height).toBeLessThanOrEqual(.04);
      } else if (placement.kind === 'wind-crust') {
        expect(placement.length).toBeGreaterThanOrEqual(3.2);
        expect(placement.length).toBeLessThanOrEqual(5.2);
        expect(placement.width).toBeGreaterThanOrEqual(1.6);
        expect(placement.width).toBeLessThanOrEqual(2.6);
        expect(placement.height).toBeGreaterThanOrEqual(.01);
        expect(placement.height).toBeLessThanOrEqual(.024);
      } else {
        expect(placement.length).toBeGreaterThanOrEqual(2.6);
        expect(placement.length).toBeLessThanOrEqual(4.6);
        expect(placement.width).toBeGreaterThanOrEqual(1.8);
        expect(placement.width).toBeLessThanOrEqual(2.8);
        expect(placement.height).toBeGreaterThanOrEqual(.005);
        expect(placement.height).toBeLessThanOrEqual(.014);
      }
    }
    expect(Math.max(...relief.placements.map((placement) => placement.height))).toBe(.04);
    const sampledColour = new THREE.Color();
    relief.placements.forEach((placement, index) => {
      relief.root.getColorAt(index, sampledColour);
      const expected = placement.kind === 'sastrugi'
        ? [.985, .992, 1]
        : placement.kind === 'wind-crust' ? [.995, .997, 1] : [.91, .925, .935];
      expect(sampledColour.toArray()).toEqual(expect.arrayContaining(expected.map((value) => expect.closeTo(value, 6))));
    });

    relief.dispose();
    material.dispose();
  });

  it('builds three disconnected finite ribbons with upward winding and submerged feet', () => {
    const { material, relief } = create();
    const geometry = relief.root.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const color = geometry.getAttribute('color') as THREE.BufferAttribute;

    for (const attribute of [position, normal, uv, color, geometry.index!]) {
      expect(attribute.usage).toBe(THREE.StaticDrawUsage);
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    }
    expect(normal.count).toBe(84);
    expect(uv.count).toBe(84);
    expect(color.count).toBe(84);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(-.25, 7);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(1, 7);

    let interiorAboveGround = 0;
    let perimeterBelowGround = 0;
    let colorBelowNeutral = 0;
    let colorAboveNeutral = 0;
    for (let ribbon = 0; ribbon < 3; ribbon += 1) {
      for (let along = 0; along < 7; along += 1) {
        for (let crossStation = 0; crossStation < 4; crossStation += 1) {
          const index = ribbon * 28 + along * 4 + crossStation;
          const perimeter = along === 0 || along === 6 || crossStation === 0 || crossStation === 3;
          if (perimeter) {
            expect(position.getY(index)).toBeCloseTo(-.25, 7);
            perimeterBelowGround += 1;
          } else if (position.getY(index) > 0) {
            interiorAboveGround += 1;
          }
          for (const component of [color.getX(index), color.getY(index), color.getZ(index)]) {
            if (component < 1) colorBelowNeutral += 1;
            if (component > 1) colorAboveNeutral += 1;
            expect(component).toBeGreaterThanOrEqual(.965);
            expect(component).toBeLessThanOrEqual(1);
          }
          expect(normal.getY(index)).toBeGreaterThan(0);
        }
      }
    }
    expect(perimeterBelowGround).toBe(54);
    expect(interiorAboveGround).toBe(30);
    expect(colorBelowNeutral).toBeGreaterThan(0);
    expect(colorAboveNeutral).toBe(0);
    expect([1, 5, 9, 13, 17, 21, 25].map((index) => position.getY(index)))
      .toEqual(expect.arrayContaining([expect.closeTo(.38, 6), expect.closeTo(.78, 6), 1, expect.closeTo(.84, 6), expect.closeTo(.44, 6)]));
    expect(position.getY(3 * 4 + 1)).toBe(1);
    expect(position.getY(3 * 4 + 2)).toBeLessThan(position.getY(3 * 4 + 1));
    expect(position.getZ(0)).toBeCloseTo(-.415, 6);
    expect(position.getZ(28)).toBeCloseTo(-.105, 6);
    expect(position.getZ(56)).toBeCloseTo(.195, 6);

    const first = new THREE.Vector3();
    const second = new THREE.Vector3();
    const third = new THREE.Vector3();
    const cross = new THREE.Vector3();
    for (let offset = 0; offset < geometry.index!.count; offset += 3) {
      first.fromBufferAttribute(position, geometry.index!.getX(offset));
      second.fromBufferAttribute(position, geometry.index!.getX(offset + 1));
      third.fromBufferAttribute(position, geometry.index!.getX(offset + 2));
      cross.crossVectors(second.sub(first), third.sub(first));
      expect(cross.y).toBeGreaterThan(0);
      const ribbon = Math.floor(geometry.index!.getX(offset) / 28);
      expect(Math.floor(geometry.index!.getX(offset + 1) / 28)).toBe(ribbon);
      expect(Math.floor(geometry.index!.getX(offset + 2) / 28)).toBe(ribbon);
    }

    relief.dispose();
    material.dispose();
  });

  it('is byte-stable for one seed and changes its static instance program for another', () => {
    const first = create('stable-relief');
    const second = create('stable-relief');
    const changed = create('changed-relief');

    expect(first.relief.placements).toEqual(second.relief.placements);
    expect(Array.from(first.relief.root.instanceMatrix.array)).toEqual(Array.from(second.relief.root.instanceMatrix.array));
    expect(Array.from(first.relief.root.instanceColor!.array)).toEqual(Array.from(second.relief.root.instanceColor!.array));
    expect(attributeValues(first.relief, 'position')).toEqual(attributeValues(second.relief, 'position'));
    expect(first.relief.placements).not.toEqual(changed.relief.placements);
    expect(Array.from(first.relief.root.instanceMatrix.array)).not.toEqual(Array.from(changed.relief.root.instanceMatrix.array));

    for (const created of [first, second, changed]) {
      created.relief.dispose();
      created.material.dispose();
    }
  });

  it('keeps every rotated patch clear of padded masks, colliders, and other patches', () => {
    const masks: readonly WinterGroundReliefExclusionRect[] = [
      { minX: -8, maxX: 8, minZ: -60, maxZ: 60 },
      { minX: -60, maxX: 60, minZ: -8, maxZ: 8 },
    ];
    const colliders: readonly WinterGroundReliefExclusionRect[] = [
      { minX: 15, maxX: 28, minZ: 15, maxZ: 25, padding: .2 },
      { minX: -31, maxX: -20, minZ: -27, maxZ: -17 },
    ];
    const stencils: readonly WinterGroundReliefExclusionRect[] = [
      { minX: 35, maxX: 40, minZ: -44, maxZ: -37 },
    ];
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const relief = createWinterGroundRelief(parent, {
      material,
      seed: 'masked-relief',
      masks,
      contactColliders: colliders,
      exclusions: stencils,
      exclusionPadding: .55,
    });
    const exclusions = [...masks, ...colliders, ...stencils];

    expect(relief.stats.exclusions).toBe(5);
    for (let firstIndex = 0; firstIndex < relief.placements.length; firstIndex += 1) {
      const footprint = placementFootprint(relief.placements[firstIndex]!);
      for (const exclusion of exclusions) {
        expect(overlap(footprint, exclusionFootprint(exclusion, .55))).toBe(false);
      }
      for (let secondIndex = firstIndex + 1; secondIndex < relief.placements.length; secondIndex += 1) {
        expect(overlap(
          placementFootprint(relief.placements[firstIndex]!, .15),
          placementFootprint(relief.placements[secondIndex]!, .15),
        )).toBe(false);
      }
    }

    relief.dispose();
    material.dispose();
  });

  it('samples the exact faceted surface at authored vertices and falls back outside patches', () => {
    const { material, relief } = create('surface-sampler');
    const position = relief.root.geometry.getAttribute('position') as THREE.BufferAttribute;
    const localVertex = new THREE.Vector3().fromBufferAttribute(position, 3 * 4 + 1);
    const instanceMatrix = new THREE.Matrix4();
    relief.root.getMatrixAt(0, instanceMatrix);
    const worldVertex = localVertex.clone().applyMatrix4(instanceMatrix);
    const center = relief.placements[0]!;
    const centerHeight = relief.heightSampler.heightAt(center.x, center.z);
    const gapLocalZ = .15 * center.width;
    const gapX = center.x + Math.sin(center.yaw) * gapLocalZ;
    const gapZ = center.z + Math.cos(center.yaw) * gapLocalZ;

    expect(relief.heightSampler.heightAt(worldVertex.x, worldVertex.z)).toBeCloseTo(worldVertex.y, 5);
    expect(centerHeight).toBeDefined();
    expect(centerHeight!).toBeGreaterThan(0);
    expect(centerHeight!).toBeLessThanOrEqual(center.height);
    expect(relief.heightSampler.heightAt(gapX, gapZ)).toBeUndefined();
    expect(relief.heightSampler.heightAt(0, 0)).toBeUndefined();
    expect(relief.heightSampler.heightAt(89, 89)).toBeUndefined();
    expect(() => relief.heightSampler.heightAt(Number.NaN, 0)).toThrow(/sample x.*finite/i);

    relief.dispose();
    material.dispose();
  });

  it('clones the caller material, preserves its map, and installs world-phased map UVs', () => {
    const parent = new THREE.Group();
    const map = new THREE.Texture();
    map.repeat.set(32, 32);
    const material = new THREE.MeshStandardMaterial({ map, vertexColors: false });
    const originalRepeat = map.repeat.clone();
    const relief = createWinterGroundRelief(parent, { material, seed: 44, fieldSize: 180 });
    const owned = relief.root.material as THREE.MeshStandardMaterial;
    const shader = { vertexShader: '#include <uv_vertex>', fragmentShader: '', uniforms: {} };

    owned.onBeforeCompile(shader as never, null as never);
    expect(owned).not.toBe(material);
    expect(owned.vertexColors).toBe(true);
    expect(owned.map).toBe(map);
    expect(material.vertexColors).toBe(false);
    expect(map.repeat).toEqual(originalRepeat);
    expect(shader.vertexShader).toContain('instanceMatrix');
    expect(shader.vertexShader).toContain('mapTransform');
    expect(shader.vertexShader).toContain('90.000000');
    expect(shader.vertexShader).toContain('180.000000');
    expect(owned.customProgramCacheKey()).toContain(WINTER_GROUND_RELIEF_PROGRAM_KEY);

    relief.dispose();
    material.dispose();
    map.dispose();
  });

  it('toggles visibility and idempotently disposes only owned resources', () => {
    const parent = new THREE.Group();
    const map = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map });
    const relief = createWinterGroundRelief(parent, { material });
    const geometryDispose = vi.spyOn(relief.root.geometry, 'dispose');
    const ownedMaterialDispose = vi.spyOn(relief.root.material, 'dispose');
    const sourceMaterialDispose = vi.spyOn(material, 'dispose');
    const mapDispose = vi.spyOn(map, 'dispose');

    relief.setVisible(false);
    expect(relief.root.visible).toBe(false);
    relief.setVisible(true);
    expect(relief.root.visible).toBe(true);
    expect(() => relief.setVisible('yes' as never)).toThrow(/visibility.*boolean/i);

    relief.dispose();
    relief.dispose();
    expect(parent.children).not.toContain(relief.root);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(ownedMaterialDispose).toHaveBeenCalledTimes(1);
    expect(sourceMaterialDispose).not.toHaveBeenCalled();
    expect(mapDispose).not.toHaveBeenCalled();

    material.dispose();
    map.dispose();
  });

  it('validates construction inputs and reports impossible exclusion layouts', () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const invalid = (options: Record<string, unknown>) => createWinterGroundRelief(parent, options as never);

    expect(() => createWinterGroundRelief(null as never, { material })).toThrow(/parent/i);
    expect(() => invalid({ material: {} })).toThrow(/material/i);
    expect(() => invalid({ material, seed: 1.5 })).toThrow(/seed|integer/i);
    expect(() => invalid({ material, seed: '' })).toThrow(/seed|empty/i);
    expect(() => invalid({ material, fieldSize: Number.NaN })).toThrow(/field size.*finite/i);
    expect(() => invalid({ material, fieldSize: 100 })).toThrow(/field size.*120/i);
    expect(() => invalid({ material, exclusionPadding: -1 })).toThrow(/padding.*negative/i);
    expect(() => invalid({ material, exclusions: [{ minX: 2, maxX: -2, minZ: -1, maxZ: 1 }] }))
      .toThrow(/exclusion.*maximum/i);
    expect(() => invalid({ material, exclusions: [{ minX: -60, maxX: 60, minZ: -60, maxZ: 60 }] }))
      .toThrow(/insufficient clear ground/i);

    material.dispose();
  });
});
