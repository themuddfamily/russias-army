import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createWinterBackdrop,
  WINTER_BACKDROP_BUDGETS,
  WINTER_BACKDROP_SIDES,
  type WinterBackdrop,
  type WinterBackdropQuality,
} from './winterBackdrop';

const EXPECTED_STATS = {
  low: {
    quality: 'low',
    terrainVertices: 260,
    terrainTriangles: 384,
    treesPerSide: 36,
    treeCount: 144,
    treeTrianglesPerInstance: 32,
    treeInstances: 144,
    forestBatches: 4,
    drawCalls: 5,
    geometries: 2,
    ownedMaterials: 1,
    ownedTextures: 0,
    colliders: 0,
    submittedTriangles: 4_992,
  },
  high: {
    quality: 'high',
    terrainVertices: 500,
    terrainTriangles: 768,
    treesPerSide: 40,
    treeCount: 160,
    treeTrianglesPerInstance: 84,
    treeInstances: 160,
    forestBatches: 4,
    drawCalls: 5,
    geometries: 2,
    ownedMaterials: 1,
    ownedTextures: 0,
    colliders: 0,
    submittedTriangles: 14_208,
  },
} as const;

const TOPOLOGY_CEILINGS = {
  low: { terrainTriangles: 384, treeTrianglesPerInstance: 32, submittedTriangles: 5_000 },
  high: { terrainTriangles: 768, treeTrianglesPerInstance: 88, submittedTriangles: 15_000 },
} as const;

function create(quality: WinterBackdropQuality, seed = 6_901): {
  parent: THREE.Group;
  snow: THREE.MeshStandardMaterial;
  backdrop: WinterBackdrop;
} {
  const parent = new THREE.Group();
  const snow = new THREE.MeshStandardMaterial({ color: 0xeaf0f1 });
  const backdrop = createWinterBackdrop(parent, { quality, seed, snowMaterial: snow });
  return { parent, snow, backdrop };
}

function attributeArray(
  geometry: THREE.BufferGeometry,
  name: string,
): number[] {
  return Array.from((geometry.getAttribute(name) as THREE.BufferAttribute).array);
}

function batches(backdrop: WinterBackdrop): readonly THREE.InstancedMesh[] {
  return backdrop.treeBatches;
}

function matrices(backdrop: WinterBackdrop): number[][] {
  return batches(backdrop).map((batch) => Array.from(batch.instanceMatrix.array));
}

function expectFiniteAttribute(
  geometry: THREE.BufferGeometry,
  name: string,
  itemSize: number,
): THREE.BufferAttribute {
  const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
  expect(attribute, `${name} attribute`).toBeInstanceOf(THREE.BufferAttribute);
  expect(attribute.itemSize).toBe(itemSize);
  expect(attribute.count).toBeGreaterThan(0);
  expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
  expect(attribute.usage).toBe(THREE.StaticDrawUsage);
  return attribute;
}

function connectedComponentSizes(geometry: THREE.BufferGeometry): number[] {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const adjacency = Array.from({ length: position.count }, () => new Set<number>());
  const indices = Array.from(geometry.index!.array);
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [indices[index]!, indices[index + 1]!, indices[index + 2]!] as const;
    for (const vertex of triangle) {
      for (const neighbour of triangle) {
        if (vertex !== neighbour) adjacency[vertex]!.add(neighbour);
      }
    }
  }
  const visited = new Set<number>();
  const sizes: number[] = [];
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (visited.has(vertex)) continue;
    const pending = [vertex];
    visited.add(vertex);
    let size = 0;
    while (pending.length > 0) {
      const current = pending.pop()!;
      size += 1;
      for (const neighbour of adjacency[current]!) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        pending.push(neighbour);
      }
    }
    sizes.push(size);
  }
  return sizes.sort((left, right) => left - right);
}

describe('createWinterBackdrop', () => {
  it.each(['low', 'high'] as const)('reports exact %s topology while honouring its submission budget', (quality) => {
    const { parent, snow, backdrop } = create(quality);

    expect(parent.children).toContain(backdrop.root);
    const forestBatches = batches(backdrop);
    expect(backdrop.root.children).toEqual([backdrop.terrain, ...forestBatches]);
    expect(forestBatches).toHaveLength(4);
    expect(WINTER_BACKDROP_BUDGETS).toEqual(TOPOLOGY_CEILINGS);
    expect(forestBatches.map((batch) => batch.userData.sector)).toEqual(WINTER_BACKDROP_SIDES);
    expect(backdrop.stats).toEqual(EXPECTED_STATS[quality]);
    expect(backdrop.terrain.geometry.getAttribute('position').count).toBe(backdrop.stats.terrainVertices);
    expect(backdrop.terrain.geometry.index?.count).toBe(backdrop.stats.terrainTriangles * 3);
    expect(forestBatches.reduce((total, batch) => total + batch.count, 0)).toBe(backdrop.stats.treeInstances);
    expect(forestBatches.map((batch) => batch.count)).toEqual(
      Array(4).fill(backdrop.stats.treeCount / 4),
    );
    const treeGeometry = forestBatches[0]!.geometry;
    const treeTriangles = treeGeometry.index
      ? treeGeometry.index.count / 3
      : treeGeometry.getAttribute('position').count / 3;
    expect(backdrop.stats.treeTrianglesPerInstance).toBe(treeTriangles);
    expect(backdrop.stats.submittedTriangles).toBe(
      backdrop.stats.terrainTriangles + backdrop.stats.treeInstances * treeTriangles,
    );
    expect(backdrop.stats.terrainTriangles).toBeLessThanOrEqual(TOPOLOGY_CEILINGS[quality].terrainTriangles);
    expect(backdrop.stats.treeTrianglesPerInstance).toBeLessThanOrEqual(
      TOPOLOGY_CEILINGS[quality].treeTrianglesPerInstance,
    );
    expect(backdrop.stats.submittedTriangles).toBeLessThanOrEqual(
      TOPOLOGY_CEILINGS[quality].submittedTriangles,
    );

    backdrop.dispose();
    snow.dispose();
  });

  it('builds finite indexed terrain attributes with world-scaled presentation data', () => {
    const { snow, backdrop } = create('high');
    const { geometry } = backdrop.terrain;
    const index = geometry.index;

    expect(index).not.toBeNull();
    expect(index!.usage).toBe(THREE.StaticDrawUsage);
    expect(Array.from(index!.array).every(Number.isFinite)).toBe(true);
    const position = expectFiniteAttribute(geometry, 'position', 3);
    const normal = expectFiniteAttribute(geometry, 'normal', 3);
    const uv = expectFiniteAttribute(geometry, 'uv', 2);
    const color = expectFiniteAttribute(geometry, 'color', 3);
    expect(normal.count).toBe(position.count);
    expect(uv.count).toBe(position.count);
    expect(color.count).toBe(position.count);
    expect(Math.min(...Array.from(color.array))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...Array.from(color.array))).toBeLessThanOrEqual(1);
    for (let index = 0; index < normal.count; index += 1) {
      expect(normal.getY(index), `terrain normal ${index} should face upward`).toBeGreaterThan(.5);
    }

    backdrop.dispose();
    snow.dispose();
  });

  it('builds the high conifer from an open stem, disconnected whorls, and sparse snow shelves', () => {
    const { snow, backdrop } = create('high');
    const geometry = batches(backdrop)[0]!.geometry;
    const position = expectFiniteAttribute(geometry, 'position', 3);
    const normal = expectFiniteAttribute(geometry, 'normal', 3);
    const uv = expectFiniteAttribute(geometry, 'uv', 2);
    const color = expectFiniteAttribute(geometry, 'color', 3);

    expect(position.count).toBe(76);
    expect(uv.count).toBe(76);
    expect(color.count).toBe(76);
    expect(normal.count).toBe(76);
    expect(geometry.index?.count).toBe(252);
    expect(geometry.index?.usage).toBe(THREE.StaticDrawUsage);
    expect(connectedComponentSizes(geometry)).toEqual([
      4, 4, 4, 4, 4, 4,
      8, 8, 8, 8, 8,
      12,
    ]);

    const ys: number[] = [];
    let maximumRadius = 0;
    for (let index = 0; index < position.count; index++) {
      ys.push(position.getY(index));
      maximumRadius = Math.max(maximumRadius, Math.hypot(position.getX(index), position.getZ(index)));
    }
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeCloseTo(3.42, 6);
    expect(maximumRadius).toBeCloseTo(1.17, 6);
    expect(maximumRadius).toBeLessThanOrEqual(1.170001);

    const expectedTrunk = new THREE.Color(0x4a382d);
    expect(color.getX(0)).toBeCloseTo(expectedTrunk.r, 7);
    expect(color.getY(0)).toBeCloseTo(expectedTrunk.g, 7);
    expect(color.getZ(0)).toBeCloseTo(expectedTrunk.b, 7);
    const expectedSnow = new THREE.Color(0x98aaa7);
    let snowVertices = 0;
    for (let index = 0; index < color.count; index++) {
      if (
        Math.abs(color.getX(index) - expectedSnow.r) < 1e-6
        && Math.abs(color.getY(index) - expectedSnow.g) < 1e-6
        && Math.abs(color.getZ(index) - expectedSnow.b) < 1e-6
      ) snowVertices += 1;
    }
    expect(snowVertices).toBe(24);
    for (let index = 52; index < 76; index++) {
      expect(normal.getY(index), `snow vertex ${index} should face upward`).toBeGreaterThan(.55);
    }

    backdrop.dispose();
    snow.dispose();
  });

  it('preserves the exact low conifer and upgrades only the high pre-aged material', () => {
    const low = create('low');
    const high = create('high');
    const lowGeometry = batches(low.backdrop)[0]!.geometry;
    const lowMaterial = batches(low.backdrop)[0]!.material as THREE.MeshStandardMaterial;
    const highMaterial = batches(high.backdrop)[0]!.material as THREE.MeshStandardMaterial;

    expect(lowGeometry.getAttribute('position').count).toBe(20);
    expect(lowGeometry.index?.count).toBe(96);
    expect(attributeArray(lowGeometry, 'position').slice(0, 12)).toEqual([
      0.18000000715255737, 0, 0,
      1.102182101152202e-17, 0, 0.18000000715255737,
      -0.18000000715255737, 0, 2.204364202304404e-17,
      -3.306546303456606e-17, 0, -0.18000000715255737,
    ]);
    expect(lowMaterial.name).toBe('WinterBackdropVertexColourForest');
    expect(lowMaterial.roughness).toBe(.96);
    expect(lowMaterial.metalness).toBe(0);
    expect(lowMaterial.vertexColors).toBe(true);
    expect(lowMaterial.flatShading).toBe(true);
    expect(lowMaterial.fog).toBe(false);
    expect(lowMaterial.emissive.getHex()).toBe(0x172622);
    expect(lowMaterial.emissiveIntensity).toBe(.22);

    expect(highMaterial.name).toBe('WinterBackdropVertexColourForestHigh');
    expect(highMaterial.roughness).toBeGreaterThanOrEqual(.98);
    expect(highMaterial.metalness).toBe(0);
    expect(highMaterial.vertexColors).toBe(true);
    expect(highMaterial.flatShading).toBe(true);
    expect(highMaterial.fog).toBe(false);
    expect(highMaterial.emissive.getHex()).toBe(0);

    for (const created of [low, high]) {
      created.backdrop.dispose();
      created.snow.dispose();
    }
  });

  it('is deterministic for a seed while retaining authored tree and relief variance', () => {
    const first = create('high', 10_337);
    const second = create('high', 10_337);
    const changed = create('high', 10_338);

    expect(attributeArray(first.backdrop.terrain.geometry, 'position'))
      .toEqual(attributeArray(second.backdrop.terrain.geometry, 'position'));
    expect(attributeArray(first.backdrop.terrain.geometry, 'color'))
      .toEqual(attributeArray(second.backdrop.terrain.geometry, 'color'));
    expect(matrices(first.backdrop)).toEqual(matrices(second.backdrop));
    expect(matrices(first.backdrop)).not.toEqual(matrices(changed.backdrop));

    const heights = attributeArray(first.backdrop.terrain.geometry, 'position')
      .filter((_value, index) => index % 3 === 1);
    expect(new Set(heights.map((height) => height.toFixed(4))).size).toBeGreaterThan(8);

    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const matrix = new THREE.Matrix4();
    const widths = new Set<string>();
    const treeHeights = new Set<string>();
    for (const batch of batches(first.backdrop)) {
      for (let index = 0; index < batch.count; index += 1) {
        batch.getMatrixAt(index, matrix);
        matrix.decompose(position, rotation, scale);
        widths.add(scale.x.toFixed(3));
        treeHeights.add(scale.y.toFixed(3));
      }
    }
    expect(widths.size).toBeGreaterThan(12);
    expect(treeHeights.size).toBeGreaterThan(12);

    for (const created of [first, second, changed]) {
      created.backdrop.dispose();
      created.snow.dispose();
    }
  });

  it('preserves low seeded transforms and constrains high mature-tree scale without changing RNG order', () => {
    const low = create('low', 6_901);
    const high = create('high', 6_901);

    expect(Array.from(batches(low.backdrop)[0]!.instanceMatrix.array.slice(0, 16))).toEqual([
      0.34919974207878113, 0, -2.4792022705078125, 0,
      0, 5.296017169952393, 0, 0,
      2.5688514709472656, 0, 0.36182698607444763, 0,
      -86.4770736694336, 0, -76.50142669677734, 1,
    ]);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const anchors: number[][] = [];
    for (const batch of batches(high.backdrop)) {
      for (let index = 0; index < batch.count; index++) {
        batch.getMatrixAt(index, matrix);
        matrix.decompose(position, rotation, scale);
        expect(scale.x).toBeGreaterThanOrEqual(1.55);
        expect(scale.x).toBeLessThanOrEqual(2.30);
        expect(scale.y).toBeGreaterThanOrEqual(3.15);
        expect(scale.y).toBeLessThanOrEqual(4.45);
        expect(scale.z / scale.x).toBeGreaterThanOrEqual(.90 - 1e-6);
        expect(scale.z / scale.x).toBeLessThanOrEqual(1.08 + 1e-6);
        if (anchors.length === 0) anchors.push(position.toArray());
      }
    }
    expect(anchors[0]).toEqual([-86.76554107666016, 0, -76.50142669677734]);

    for (const created of [low, high]) {
      created.backdrop.dispose();
      created.snow.dispose();
    }
  });

  it.each(['low', 'high'] as const)('uses four cullable static sector batches in %s quality', (quality) => {
    const { snow, backdrop } = create(quality);
    const forestBatches = batches(backdrop);
    const geometries = new Set(forestBatches.map((batch) => batch.geometry));
    const materials = new Set(forestBatches.map((batch) => batch.material));

    expect(geometries.size).toBe(1);
    expect(materials.size).toBe(1);
    for (const batch of forestBatches) {
      expect(batch).toBeInstanceOf(THREE.InstancedMesh);
      expect(batch.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
      expect(batch.frustumCulled).toBe(true);
      expect(batch.castShadow).toBe(false);
      expect(batch.receiveShadow).toBe(false);
      expect(batch.boundingBox).not.toBeNull();
      expect(batch.boundingSphere).not.toBeNull();
    }
    expect(backdrop.terrain.frustumCulled).toBe(true);
    expect(backdrop.terrain.castShadow).toBe(false);
    expect(backdrop.terrain.receiveShadow).toBe(false);

    backdrop.dispose();
    snow.dispose();
  });

  it('keeps every terrain vertex and tree anchor outside gameplay bounds', () => {
    const { snow, backdrop } = create('high');
    backdrop.root.updateMatrixWorld(true);
    const positions = backdrop.terrain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const world = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      world.fromBufferAttribute(positions, index);
      backdrop.terrain.localToWorld(world);
      expect(
        Math.abs(world.x) >= 63.4 || Math.abs(world.z) >= 61.4,
        `terrain vertex ${index} entered gameplay at ${world.x}, ${world.z}`,
      ).toBe(true);
    }

    const matrix = new THREE.Matrix4();
    const azimuths: number[] = [];
    for (const batch of batches(backdrop)) {
      const worldBounds = batch.boundingBox!.clone().applyMatrix4(batch.matrixWorld);
      expect(
        worldBounds.min.x >= 63.4
          || worldBounds.max.x <= -63.4
          || worldBounds.min.z >= 61.4
          || worldBounds.max.z <= -61.4,
        `forest sector bounds entered gameplay: ${worldBounds.min.toArray()} .. ${worldBounds.max.toArray()}`,
      ).toBe(true);
      for (let index = 0; index < batch.count; index += 1) {
        batch.getMatrixAt(index, matrix);
        world.setFromMatrixPosition(matrix).applyMatrix4(batch.matrixWorld);
        azimuths.push(Math.atan2(world.z, world.x));
        expect(
          Math.abs(world.x) >= 63.4 || Math.abs(world.z) >= 61.4,
          `tree ${index} entered gameplay at ${world.x}, ${world.z}`,
        ).toBe(true);
      }
    }
    azimuths.sort((left, right) => left - right);
    let largestGap = 0;
    for (let index = 0; index < azimuths.length; index += 1) {
      const next = index + 1 < azimuths.length ? azimuths[index + 1] : azimuths[0] + Math.PI * 2;
      largestGap = Math.max(largestGap, next - azimuths[index]);
    }
    expect(THREE.MathUtils.radToDeg(largestGap)).toBeLessThanOrEqual(30);

    backdrop.dispose();
    snow.dispose();
  });

  it('validates malformed quality, seed, and material options', () => {
    const parent = new THREE.Group();
    const snow = new THREE.MeshStandardMaterial();
    const createInvalid = (options: Record<string, unknown>) =>
      createWinterBackdrop(parent, options as never);

    expect(() => createInvalid({ quality: 'ultra', snowMaterial: snow })).toThrow(/quality/i);
    expect(() => createInvalid({ quality: 'high', seed: Number.NaN, snowMaterial: snow })).toThrow(/seed/i);
    expect(() => createInvalid({ quality: 'high', seed: 1.5, snowMaterial: snow })).toThrow(/seed|integer/i);
    expect(() => createInvalid({ quality: 'high', seed: '', snowMaterial: snow })).toThrow(/seed|empty/i);
    expect(() => createInvalid({ quality: 'high', snowMaterial: {} })).toThrow(/snowMaterial|material/i);
    expect(() => createWinterBackdrop(null as never, { quality: 'high', snowMaterial: snow })).toThrow(/parent/i);

    snow.dispose();
  });

  it('detaches and disposes owned resources once without disposing injected snow material', () => {
    const { parent, snow, backdrop } = create('high');
    const terrainGeometryDispose = vi.spyOn(backdrop.terrain.geometry, 'dispose');
    const firstBatch = batches(backdrop)[0]!;
    const treeGeometry = firstBatch.geometry;
    const treeMaterial = firstBatch.material as THREE.Material;
    const treeGeometryDispose = vi.spyOn(treeGeometry, 'dispose');
    const treeMaterialDispose = vi.spyOn(treeMaterial, 'dispose');
    const snowDispose = vi.spyOn(snow, 'dispose');

    backdrop.dispose();
    backdrop.dispose();

    expect(parent.children).not.toContain(backdrop.root);
    expect(terrainGeometryDispose).toHaveBeenCalledTimes(1);
    expect(treeGeometryDispose).toHaveBeenCalledTimes(1);
    expect(treeMaterialDispose).toHaveBeenCalledTimes(1);
    expect(snowDispose).not.toHaveBeenCalled();

    snow.dispose();
  });
});
