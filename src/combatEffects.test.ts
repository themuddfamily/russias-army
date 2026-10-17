import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  CombatEffects,
  type CombatEffectCapacities,
  type ImpactSurface,
} from './combatEffects';

const SMALL_CAPACITY: CombatEffectCapacities = {
  tracers: 2,
  sparks: 3,
  chips: 2,
  dust: 2,
  smoke: 2,
  explosionFlashes: 1,
  shockRings: 1,
};

const BATCH_NAMES = [
  'combat-tracer-core-batch',
  'combat-tracer-glow-batch',
  'combat-spark-batch',
  'combat-chip-batch',
  'combat-dust-batch',
  'combat-smoke-batch',
  'combat-explosion-hot-lobes-batch',
  'combat-explosion-halo-batch',
  'combat-shock-ring-batch',
] as const;

function batches(root: THREE.Object3D): THREE.InstancedMesh[] {
  return root.children.map((child) => {
    expect(child).toBeInstanceOf(THREE.InstancedMesh);
    return child as THREE.InstancedMesh;
  });
}

function batch(root: THREE.Object3D, name: typeof BATCH_NAMES[number]): THREE.InstancedMesh {
  const value = root.getObjectByName(name);
  if (!(value instanceof THREE.InstancedMesh)) throw new Error(`Missing batch ${name}.`);
  return value;
}

function packedMatrices(mesh: THREE.InstancedMesh): number[] {
  return Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16));
}

function packedColors(mesh: THREE.InstancedMesh): number[] {
  return Array.from(mesh.instanceColor!.array.slice(0, mesh.count * 3));
}

function matrixTranslations(mesh: THREE.InstancedMesh): number[][] {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, rotation, scale);
    return position.toArray();
  });
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

function renderResources(root: THREE.Object3D): {
  objects: Set<string>;
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
} {
  const objects = new Set<string>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    objects.add(object.uuid);
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of assigned) materials.add(material);
    }
  });
  return { objects, geometries, materials };
}

function snapshotInstances(root: THREE.Object3D): Array<{
  mesh: THREE.InstancedMesh;
  matrix: ArrayLike<number>;
  color: ArrayLike<number>;
}> {
  return batches(root).map((mesh) => ({
    mesh,
    matrix: mesh.instanceMatrix.array,
    color: mesh.instanceColor!.array,
  }));
}

describe('CombatEffects batched pooling', () => {
  it('preallocates exactly nine stable instanced renderer families', () => {
    const scene = new THREE.Scene();
    const effects = new CombatEffects(scene, { capacities: SMALL_CAPACITY, seed: 7 });
    const stats = effects.getStats();
    const renderBatches = batches(effects.root);

    expect(scene.children).toContain(effects.root);
    expect(effects.root.name).toBe('combat-effects');
    expect(effects.root.userData.fixedRenderBatches).toBe(9);
    expect(renderBatches.map((mesh) => mesh.name)).toEqual(BATCH_NAMES);
    expect(stats.capacity).toEqual(SMALL_CAPACITY);
    expect(Object.isFrozen(effects.capacities)).toBe(true);
    expect(Object.values(stats.active).every((count) => count === 0)).toBe(true);
    expect(stats.resources).toEqual({ geometries: 6, materials: 9, textures: 1 });
    expect(stats.render).toEqual({ batches: 9, activeBatches: 0, submittedTriangles: 0 });

    for (const mesh of renderBatches) {
      expect(mesh.count, mesh.name).toBe(0);
      expect(mesh.visible, mesh.name).toBe(false);
      expect(mesh.frustumCulled, mesh.name).toBe(false);
      expect(mesh.castShadow, mesh.name).toBe(false);
      expect(mesh.receiveShadow, mesh.name).toBe(false);
      expect(mesh.instanceMatrix.usage, mesh.name).toBe(THREE.DynamicDrawUsage);
      expect(mesh.instanceColor?.usage, mesh.name).toBe(THREE.DynamicDrawUsage);
      expect(Array.isArray(mesh.material), mesh.name).toBe(false);
      const material = mesh.material as THREE.Material;
      if (material.transparent && material.side === THREE.DoubleSide) {
        expect(material.forceSinglePass, mesh.name).toBe(true);
      }
      const geometry = mesh.geometry;
      expect(geometry.getAttribute('position').count, mesh.name).toBeGreaterThan(0);
      expect(triangleCount(geometry), mesh.name).toBeGreaterThan(0);
    }
    expect(batch(effects.root, 'combat-tracer-core-batch').geometry)
      .toBe(batch(effects.root, 'combat-tracer-glow-batch').geometry);
    expect(batch(effects.root, 'combat-dust-batch').geometry)
      .toBe(batch(effects.root, 'combat-smoke-batch').geometry);
    expect(batch(effects.root, 'combat-dust-batch').geometry)
      .toBe(batch(effects.root, 'combat-explosion-halo-batch').geometry);
    expect(triangleCount(batch(effects.root, 'combat-explosion-hot-lobes-batch').geometry)).toBe(60);
    effects.dispose();
  });

  it('recycles tracer slots in stable ring order and compacts paired batches', () => {
    const effects = new CombatEffects(new THREE.Scene(), { capacities: SMALL_CAPACITY });
    const identities = effects.root.children.map((child) => child.uuid);
    const emit = (x: number) => effects.emitTracer(
      { x, y: 1, z: 0 },
      { x, y: 1, z: -10 },
      { lifetime: .05 },
    );
    expect(emit(1)).toBe(true);
    expect(emit(2)).toBe(true);
    expect(emit(3)).toBe(true);
    expect(effects.emitTracer({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })).toBe(false);

    const core = batch(effects.root, 'combat-tracer-core-batch');
    const glow = batch(effects.root, 'combat-tracer-glow-batch');
    expect(effects.getStats().active.tracers).toBe(2);
    expect(core.count).toBe(2);
    expect(glow.count).toBe(2);
    // Slot zero is overwritten by the third emission; compaction preserves CPU slot order.
    expect(matrixTranslations(core).map(([x]) => x)).toEqual([3, 2]);
    expect(effects.getStats().render.activeBatches).toBe(2);
    expect(effects.root.children.map((child) => child.uuid)).toEqual(identities);
    effects.update(.05);
    expect(effects.getStats().active.tracers).toBe(0);
    expect(core.count).toBe(0);
    expect(glow.visible).toBe(false);
    const retired = new THREE.Matrix4();
    const retiredPosition = new THREE.Vector3();
    const retiredRotation = new THREE.Quaternion();
    const retiredScale = new THREE.Vector3();
    core.getMatrixAt(0, retired);
    retired.decompose(retiredPosition, retiredRotation, retiredScale);
    expect(retiredScale.toArray()).toEqual([0, 0, 0]);
    effects.dispose();
  });

  it('caps impact layers, initializes authored scales, and expires every compacted family', () => {
    const effects = new CombatEffects(new THREE.Scene(), { capacities: SMALL_CAPACITY, seed: 42 });
    const emitted = effects.emitImpact(
      { x: 3, y: 1, z: -4 },
      { x: 0, y: 0, z: 0 },
      { sparkCount: 20, chipCount: 20, dustCount: 20, smokeCount: 20, lifetime: .1 },
    );

    expect(emitted).toEqual({ sparks: 3, chips: 2, dust: 2, smoke: 2 });
    expect(effects.getStats().active).toMatchObject(emitted);
    expect(effects.getStats().render.activeBatches).toBe(4);
    for (const name of [
      'combat-spark-batch', 'combat-chip-batch', 'combat-dust-batch', 'combat-smoke-batch',
    ] as const) {
      const mesh = batch(effects.root, name);
      expect(mesh.count).toBe(emitted[name === 'combat-spark-batch' ? 'sparks'
        : name === 'combat-chip-batch' ? 'chips'
          : name === 'combat-dust-batch' ? 'dust' : 'smoke']);
      const matrices = packedMatrices(mesh);
      expect(matrices.every(Number.isFinite), name).toBe(true);
      expect(matrices.some((value) => Math.abs(value) > 1e-6), name).toBe(true);
    }
    effects.update(1);
    expect(effects.getStats().active).toMatchObject({ sparks: 0, chips: 0, dust: 0, smoke: 0 });
    expect(effects.getStats().render).toEqual({ batches: 9, activeBatches: 0, submittedTriangles: 0 });
    effects.dispose();
  });

  it('layers a seven-batch modern explosion below the high-tier triangle allowance', () => {
    const effects = new CombatEffects(new THREE.Scene(), {
      capacities: {
        tracers: 0, sparks: 24, chips: 9, dust: 12, smoke: 10,
        explosionFlashes: 1, shockRings: 1,
      },
      seed: 19,
    });
    const emitted = effects.emitExplosion({ x: 2, y: 0, z: 5 }, {
      radius: 4.5, sparkCount: 24, chipCount: 9, dustCount: 12, smokeCount: 10,
    });
    expect(emitted).toEqual({ sparks: 24, chips: 9, dust: 12, smoke: 10 });
    expect(effects.getStats().active).toEqual({
      tracers: 0, sparks: 24, chips: 9, dust: 12, smoke: 10,
      explosionFlashes: 1, shockRings: 1,
    });
    const render = effects.getStats().render;
    expect(render.batches).toBe(9);
    expect(render.activeBatches).toBe(7);
    expect(render.submittedTriangles).toBeLessThanOrEqual(2_000);
    expect(batch(effects.root, 'combat-explosion-hot-lobes-batch').count).toBe(1);
    expect(batch(effects.root, 'combat-explosion-halo-batch').count).toBe(1);
    expect(batch(effects.root, 'combat-shock-ring-batch').count).toBe(1);
    effects.update(2);
    expect(Object.values(effects.getStats().active).every((count) => count === 0)).toBe(true);
    effects.dispose();
  });

  it('clears active effects without disposing or reallocating the reusable pools', () => {
    const scene = new THREE.Scene();
    const effects = new CombatEffects(scene, { capacities: SMALL_CAPACITY, seed: 19 });
    const resources = renderResources(effects.root);
    effects.emitTracer({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -5 });
    effects.emitExplosion({ x: 2, y: 0, z: 5 });
    expect(Object.values(effects.getStats().active).some((count) => count > 0)).toBe(true);

    effects.clear();

    expect(Object.values(effects.getStats().active).every((count) => count === 0)).toBe(true);
    expect(effects.getStats().render).toEqual({ batches: 9, activeBatches: 0, submittedTriangles: 0 });
    expect(batches(effects.root).every((mesh) => mesh.count === 0 && !mesh.visible)).toBe(true);
    expect(renderResources(effects.root)).toEqual(resources);
    expect(scene.children).toContain(effects.root);
    expect(effects.emitTracer({ x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: -5 })).toBe(true);
    expect(effects.getStats().active.tracers).toBe(1);
    effects.dispose();
  });

  it('is seed deterministic and keeps palette selection out of resource topology', () => {
    const create = (seed: number, surface: ImpactSurface) => {
      const effects = new CombatEffects(new THREE.Scene(), { capacities: SMALL_CAPACITY, seed });
      effects.emitImpact(
        { x: 1, y: 2, z: 3 }, { x: .2, y: 1, z: -.3 },
        { sparkCount: 3, chipCount: 2, dustCount: 2, smokeCount: 2, surface },
      );
      effects.update(.04);
      return effects;
    };
    const first = create(91, 'metal');
    const second = create(91, 'metal');
    const changed = create(92, 'metal');
    for (const name of BATCH_NAMES.slice(2, 6)) {
      expect(packedMatrices(batch(first.root, name))).toEqual(packedMatrices(batch(second.root, name)));
      expect(packedColors(batch(first.root, name))).toEqual(packedColors(batch(second.root, name)));
    }
    expect(packedMatrices(batch(first.root, 'combat-spark-batch')))
      .not.toEqual(packedMatrices(batch(changed.root, 'combat-spark-batch')));
    expect(first.getStats().resources).toEqual(changed.getStats().resources);
    first.dispose(); second.dispose(); changed.dispose();
  });

  it('provides distinct snow, concrete, metal and flesh palettes with identical counts', () => {
    const surfaces: ImpactSurface[] = ['snow', 'concrete', 'metal', 'flesh'];
    const samples = surfaces.map((surface) => {
      const effects = new CombatEffects(new THREE.Scene(), { capacities: SMALL_CAPACITY, seed: 5 });
      const counts = effects.emitImpact(
        { x: 0, y: 0, z: 0 }, undefined,
        { sparkCount: 1, chipCount: 1, dustCount: 1, smokeCount: 1, surface },
      );
      return {
        effects,
        counts,
        colors: [
          ...packedColors(batch(effects.root, 'combat-spark-batch')),
          ...packedColors(batch(effects.root, 'combat-chip-batch')),
          ...packedColors(batch(effects.root, 'combat-dust-batch')),
          ...packedColors(batch(effects.root, 'combat-smoke-batch')),
        ],
        sparkMatrix: packedMatrices(batch(effects.root, 'combat-spark-batch')),
      };
    });
    for (const sample of samples) expect(sample.counts).toEqual({ sparks: 1, chips: 1, dust: 1, smoke: 1 });
    expect(new Set(samples.map((sample) => sample.colors.join(','))).size).toBe(4);
    // Profiles alter motion/size as well as tint while consuming the same seeded random sequence.
    expect(new Set(samples.map((sample) => sample.sparkMatrix.join(','))).size).toBe(4);

    const fallback = new CombatEffects(new THREE.Scene(), { capacities: SMALL_CAPACITY, seed: 5 });
    fallback.emitImpact(
      { x: 0, y: 0, z: 0 }, undefined,
      { sparkCount: 1, chipCount: 1, dustCount: 1, smokeCount: 1 },
    );
    expect(packedColors(batch(fallback.root, 'combat-dust-batch')))
      .toEqual(packedColors(batch(samples[1].effects.root, 'combat-dust-batch')));
    fallback.dispose();
    for (const sample of samples) sample.effects.dispose();
  });

  it('does not allocate render objects, resources, or instance buffers while emitting', () => {
    const effects = new CombatEffects(new THREE.Scene(), { capacities: SMALL_CAPACITY, seed: 1 });
    const before = renderResources(effects.root);
    const instances = snapshotInstances(effects.root);

    for (let index = 0; index < 100; index++) {
      effects.emitTracer({ x: index, y: 1, z: 0 }, { x: index, y: 1.5, z: -20 });
      effects.emitImpact(
        { x: index, y: 0, z: -2 }, { x: 0, y: 1, z: 0 },
        { surface: (['snow', 'concrete', 'metal', 'flesh'] as const)[index % 4] },
      );
      effects.emitExplosion({ x: index, y: 0, z: -5 });
      effects.update(.016);
    }

    const after = renderResources(effects.root);
    expect(after.objects).toEqual(before.objects);
    expect(after.geometries).toEqual(before.geometries);
    expect(after.materials).toEqual(before.materials);
    expect(effects.getStats().resources).toEqual({ geometries: 6, materials: 9, textures: 1 });
    for (const snapshot of instances) {
      expect(snapshot.mesh.instanceMatrix.array).toBe(snapshot.matrix);
      expect(snapshot.mesh.instanceColor!.array).toBe(snapshot.color);
    }
    expect(effects.root.children).toHaveLength(9);
    expect(effects.getStats().render.activeBatches).toBeLessThanOrEqual(9);
    effects.dispose();
  });

  it('detaches and disposes each batch and shared GPU resource exactly once', () => {
    const scene = new THREE.Scene();
    const effects = new CombatEffects(scene, { capacities: SMALL_CAPACITY });
    effects.emitExplosion({ x: 0, y: 0, z: 0 });
    const resources = renderResources(effects.root);
    const batchesBefore = batches(effects.root);
    const batchSpies = batchesBefore.map((mesh) => vi.spyOn(mesh, 'dispose'));
    const materialSpies = [...resources.materials].map((material) => vi.spyOn(material, 'dispose'));
    const geometrySpies = [...resources.geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const texture = ([...resources.materials]
      .map((material) => 'map' in material
        ? material.map
        : material instanceof THREE.ShaderMaterial ? material.uniforms.uMap?.value : null)
      .find((map): map is THREE.Texture => map instanceof THREE.Texture));
    expect(texture).toBeDefined();
    const textureSpy = vi.spyOn(texture!, 'dispose');

    effects.dispose();
    effects.dispose();

    expect(scene.children).not.toContain(effects.root);
    expect(effects.root.children).toHaveLength(0);
    for (const spy of batchSpies) expect(spy).toHaveBeenCalledTimes(1);
    for (const spy of materialSpies) expect(spy).toHaveBeenCalledTimes(1);
    for (const spy of geometrySpies) expect(spy).toHaveBeenCalledTimes(1);
    expect(textureSpy).toHaveBeenCalledTimes(1);
    expect(effects.getStats().resources).toEqual({ geometries: 0, materials: 0, textures: 0 });
    expect(effects.getStats().render).toEqual({ batches: 0, activeBatches: 0, submittedTriangles: 0 });
    expect(Object.values(effects.getStats().active).every((count) => count === 0)).toBe(true);
    expect(() => effects.update(.016)).toThrow(/already been disposed/i);
  });

  it('validates capacities, surfaces and emission parameters at the public boundary', () => {
    expect(() => new CombatEffects(new THREE.Scene(), { capacities: { tracers: -1 } })).toThrow(/capacity/i);
    const effects = new CombatEffects(new THREE.Scene(), { capacities: SMALL_CAPACITY });
    expect(() => effects.emitTracer(
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { width: 0 },
    )).toThrow(/width/i);
    expect(() => effects.emitImpact(
      { x: 0, y: 0, z: 0 }, undefined, { sparkCount: -1 },
    )).toThrow(/count/i);
    expect(() => effects.emitImpact(
      { x: 0, y: 0, z: 0 }, undefined, { surface: 'ice' as ImpactSurface },
    )).toThrow(/surface/i);
    expect(() => effects.emitExplosion(
      { x: 0, y: 0, z: 0 }, { radius: Number.NaN },
    )).toThrow(/radius/i);
    expect(() => effects.update(-.1)).toThrow(/delta/i);
    effects.dispose();
  });
});
