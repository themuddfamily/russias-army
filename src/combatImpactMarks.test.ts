import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  CombatImpactMarks,
  createCombatImpactMarks,
  type CombatImpactMarkCapacities,
} from './combatImpactMarks';

const SMALL_CAPACITY: CombatImpactMarkCapacities = { bullets: 2, scorches: 1 };

function decomposedMatrices(mesh: THREE.InstancedMesh): Array<{
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}> {
  const matrix = new THREE.Matrix4();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    return { position, quaternion, scale };
  });
}

function renderResources(root: THREE.Object3D): {
  objects: Set<string>;
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  textures: Set<THREE.Texture>;
} {
  const objects = new Set<string>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    objects.add(object.uuid);
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const assigned = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of assigned) {
      materials.add(material);
      if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map);
    }
  });
  return { objects, geometries, materials, textures };
}

describe('CombatImpactMarks', () => {
  it('owns two idle fixed-capacity batches and the default high-tier capacities', () => {
    const parent = new THREE.Group();
    const marks = createCombatImpactMarks(parent);

    expect(parent.children).toEqual([marks.root]);
    expect(marks.capacities).toEqual({ bullets: 96, scorches: 12 });
    expect(marks.root.children).toEqual([marks.bulletMesh, marks.scorchMesh]);
    for (const mesh of [marks.bulletMesh, marks.scorchMesh]) {
      expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
      expect(mesh.geometry).toBe(marks.bulletMesh.geometry);
      expect(mesh.count).toBe(0);
      expect(mesh.visible).toBe(false);
      expect(mesh.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);
      expect(mesh.frustumCulled).toBe(false);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.material.alphaTest).toBeGreaterThan(0);
      expect(mesh.material.transparent).toBe(false);
      expect(mesh.material.map).toBeInstanceOf(THREE.DataTexture);
    }
    expect(marks.getStats()).toEqual({
      active: { bullets: 0, scorches: 0 },
      capacity: { bullets: 96, scorches: 12 },
      drawCalls: 0,
      resources: { geometries: 1, materials: 2, textures: 2 },
    });
    marks.dispose();
  });

  it('aligns the plane normal, offsets from the surface and preserves requested scale', () => {
    const marks = new CombatImpactMarks(new THREE.Group(), { capacities: SMALL_CAPACITY, seed: 11 });
    expect(marks.emitBullet(
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 0, z: 0 },
      { radius: .2, lifetime: 3 },
    )).toBe(true);

    const [{ position, quaternion, scale }] = decomposedMatrices(marks.bulletMesh);
    const renderedNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
    expect(renderedNormal.dot(new THREE.Vector3(1, 0, 0))).toBeCloseTo(1, 6);
    expect(position.x).toBeCloseTo(1.008, 6);
    expect(position.y).toBeCloseTo(2, 6);
    expect(position.z).toBeCloseTo(3, 6);
    expect(scale.x).toBeGreaterThanOrEqual(.18);
    expect(scale.x).toBeLessThanOrEqual(.22);
    expect(scale.y).toBeCloseTo(scale.x, 6);
    expect(scale.z).toBeCloseTo(1, 6);
    expect(marks.getStats().drawCalls).toBe(1);
    marks.dispose();
  });

  it('overwrites the oldest ring slots at capacity and submits at most two draws', () => {
    const marks = new CombatImpactMarks(new THREE.Group(), { capacities: SMALL_CAPACITY, seed: 5 });
    marks.emitBullet({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    marks.emitBullet({ x: 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    marks.emitBullet({ x: 3, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    marks.emitScorch({ x: 4, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    marks.emitScorch({ x: 5, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

    expect(marks.getStats()).toMatchObject({ active: SMALL_CAPACITY, drawCalls: 2 });
    expect(marks.bulletMesh.count).toBe(2);
    expect(marks.scorchMesh.count).toBe(1);
    const bulletXs = decomposedMatrices(marks.bulletMesh).map(({ position }) => position.x).sort();
    expect(bulletXs).toEqual([2, 3]);
    expect(decomposedMatrices(marks.scorchMesh)[0].position.x).toBe(5);
    marks.dispose();
  });

  it('expires independently, compacts survivors and clears without releasing resources', () => {
    const marks = new CombatImpactMarks(new THREE.Group(), { capacities: { bullets: 3, scorches: 2 } });
    marks.emitBullet({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { lifetime: .1 });
    marks.emitBullet({ x: 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { lifetime: .3 });
    marks.emitScorch({ x: 3, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { lifetime: .2 });

    marks.update(.15);
    expect(marks.getStats()).toMatchObject({ active: { bullets: 1, scorches: 1 }, drawCalls: 2 });
    expect(marks.bulletMesh.count).toBe(1);
    expect(decomposedMatrices(marks.bulletMesh)[0].position.x).toBe(2);

    marks.update(.1);
    expect(marks.getStats()).toMatchObject({ active: { bullets: 1, scorches: 0 }, drawCalls: 1 });
    expect(marks.scorchMesh.visible).toBe(false);
    marks.clear();
    expect(marks.getStats()).toMatchObject({ active: { bullets: 0, scorches: 0 }, drawCalls: 0 });
    expect(marks.bulletMesh.count).toBe(0);
    expect(marks.scorchMesh.count).toBe(0);
    expect(marks.getStats().resources).toEqual({ geometries: 1, materials: 2, textures: 2 });
    marks.dispose();
  });

  it('retains every scene and GPU resource identity across repeated emissions', () => {
    const marks = new CombatImpactMarks(new THREE.Group(), { capacities: { bullets: 32, scorches: 4 }, seed: 9 });
    const before = renderResources(marks.root);
    for (let index = 0; index < 1_000; index++) {
      marks.emitBullet(
        { x: index % 13, y: index % 7, z: -index % 17 },
        { x: index % 3 - 1, y: 1, z: index % 5 - 2 },
        { radius: .04 + index % 4 * .01 },
      );
      if (index % 20 === 0) {
        marks.emitScorch({ x: index, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      }
      marks.update(.001);
    }
    const after = renderResources(marks.root);

    expect(after.objects).toEqual(before.objects);
    expect(after.geometries).toEqual(before.geometries);
    expect(after.materials).toEqual(before.materials);
    expect(after.textures).toEqual(before.textures);
    expect(marks.getStats()).toMatchObject({
      active: { bullets: 32, scorches: 4 },
      capacity: { bullets: 32, scorches: 4 },
      drawCalls: 2,
      resources: { geometries: 1, materials: 2, textures: 2 },
    });
    marks.dispose();
  });

  it('generates deterministic textures without coupling their identity', () => {
    const first = new CombatImpactMarks(new THREE.Group(), { capacities: SMALL_CAPACITY, seed: 73 });
    const second = new CombatImpactMarks(new THREE.Group(), { capacities: SMALL_CAPACITY, seed: 73 });
    const changed = new CombatImpactMarks(new THREE.Group(), { capacities: SMALL_CAPACITY, seed: 74 });
    const bytes = (mesh: typeof first.bulletMesh): number[] => Array.from(
      (mesh.material.map!.image as { data: Uint8Array }).data,
    );

    expect(bytes(first.bulletMesh)).toEqual(bytes(second.bulletMesh));
    expect(bytes(first.bulletMesh)).not.toEqual(bytes(changed.bulletMesh));
    expect(first.bulletMesh.material.map).not.toBe(second.bulletMesh.material.map);
    first.dispose();
    second.dispose();
    changed.dispose();
  });

  it('disposes the shared geometry, both materials and both textures exactly once', () => {
    const parent = new THREE.Group();
    const marks = new CombatImpactMarks(parent, { capacities: SMALL_CAPACITY });
    marks.emitBullet({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const geometryDispose = vi.spyOn(marks.bulletMesh.geometry, 'dispose');
    const materialDisposes = [marks.bulletMesh.material, marks.scorchMesh.material]
      .map((material) => vi.spyOn(material, 'dispose'));
    const textureDisposes = [marks.bulletMesh.material.map!, marks.scorchMesh.material.map!]
      .map((texture) => vi.spyOn(texture, 'dispose'));

    marks.dispose();
    marks.dispose();

    expect(parent.children).not.toContain(marks.root);
    expect(marks.root.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    for (const dispose of materialDisposes) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of textureDisposes) expect(dispose).toHaveBeenCalledTimes(1);
    expect(marks.getStats()).toEqual({
      active: { bullets: 0, scorches: 0 },
      capacity: SMALL_CAPACITY,
      drawCalls: 0,
      resources: { geometries: 0, materials: 0, textures: 0 },
    });
    expect(() => marks.update(.016)).toThrow(/disposed/i);
  });

  it('validates construction and every public emission/update parameter', () => {
    const parent = new THREE.Group();
    expect(() => new CombatImpactMarks(parent, { capacities: { bullets: -1 } })).toThrow(/capacity/i);
    expect(() => new CombatImpactMarks(parent, { capacities: { scorches: 1.5 } })).toThrow(/capacity/i);
    expect(() => new CombatImpactMarks(parent, { seed: Number.NaN })).toThrow(/seed/i);
    const disabled = new CombatImpactMarks(parent, { capacities: { bullets: 0, scorches: 0 } });
    expect(disabled.emitBullet({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(false);
    expect(disabled.getStats().drawCalls).toBe(0);
    disabled.dispose();

    const marks = new CombatImpactMarks(parent, { capacities: SMALL_CAPACITY });
    expect(() => marks.emitBullet({ x: Number.NaN, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toThrow(/point\.x/i);
    expect(() => marks.emitBullet({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toThrow(/normal/i);
    expect(() => marks.emitScorch({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { radius: 0 })).toThrow(/radius/i);
    expect(() => marks.emitBullet({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { lifetime: Infinity })).toThrow(/lifetime/i);
    expect(() => marks.update(-.1)).toThrow(/delta/i);
    marks.dispose();
  });
});
