import * as THREE from 'three';

/** One decorative pine rooted on the local XZ ground plane of the supplied parent. */
export interface WinterPinePlacement {
  x: number;
  z: number;
  scale: number;
}

export type InstancedFoliageQuality = 'low' | 'high';

export interface InstancedFoliageMaterials {
  trunk: THREE.Material;
  foliage: THREE.Material;
  snow: THREE.Material;
}

export interface InstancedFoliageOptions {
  /** Low retains the original tiered geometry and transforms exactly. */
  quality?: InstancedFoliageQuality;
  /** Materials supplied here remain owned by the caller and are never disposed. */
  materials?: Partial<InstancedFoliageMaterials>;
  /** Local height of the ground under every placement. */
  groundY?: number;
  /** Stable integer used to vary the silhouettes without using global randomness. */
  seed?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  name?: string;
}

export interface InstancedFoliageBatches {
  trunks: THREE.InstancedMesh;
  crowns: THREE.InstancedMesh;
  snowCaps: THREE.InstancedMesh;
}

export interface InstancedFoliageStats {
  quality: InstancedFoliageQuality;
  treeCount: number;
  trunkInstances: number;
  crownInstances: number;
  snowCapInstances: number;
  totalInstances: number;
  /** Retained for existing diagnostics; equal to drawCalls. */
  drawBatches: number;
  drawCalls: number;
  geometries: number;
  ownedGeometries: number;
  materials: number;
  ownedMaterials: number;
  textures: number;
  colliders: number;
  uniqueTriangles: number;
  trianglesPerTree: number;
  submittedTriangles: number;
}

export interface InstancedFoliage {
  /** A decorative-only subtree. It intentionally exposes no gameplay colliders. */
  group: THREE.Group;
  batches: InstancedFoliageBatches;
  stats: Readonly<InstancedFoliageStats>;
  /** Idempotently detaches the group and releases only resources owned here. */
  dispose(): void;
}

const CROWN_TIERS = 4;
const HIGH_CROWN_SEGMENTS = 12;
const TWO_PI = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface GeometrySet {
  trunk: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  snow: THREE.BufferGeometry;
}

function fallbackMaterial(color: number, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function validatePlacement(placement: WinterPinePlacement, index: number): void {
  if (!Number.isFinite(placement.x)) throw new Error(`placements[${index}].x must be finite`);
  if (!Number.isFinite(placement.z)) throw new Error(`placements[${index}].z must be finite`);
  if (!Number.isFinite(placement.scale) || placement.scale <= 0) {
    throw new Error(`placements[${index}].scale must be finite and greater than zero`);
  }
}

function validateOptions(options: InstancedFoliageOptions): {
  groundY: number;
  seed: number;
  quality: InstancedFoliageQuality;
} {
  const groundY = options.groundY ?? 0;
  const seed = options.seed ?? 0x51f15e;
  const quality = options.quality ?? 'low';
  if (!Number.isFinite(groundY)) throw new Error('groundY must be finite');
  if (!Number.isSafeInteger(seed)) throw new Error('seed must be a safe integer');
  if (quality !== 'low' && quality !== 'high') throw new Error("quality must be 'low' or 'high'");
  return { groundY, seed, quality };
}

/** A compact integer hash, mapped to a stable rotation without using global randomness. */
function treeRotation(index: number, seed: number): number {
  let hash = (index ^ seed) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
  hash = (hash ^ (hash >>> 15)) >>> 0;
  return (hash / 0x1_0000_0000) * TWO_PI;
}

function hashUnit(index: number, seed: number, stream: number): number {
  let hash = (index ^ seed ^ Math.imul(stream, 0x9e3779b9)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
  hash = (hash ^ (hash >>> 15)) >>> 0;
  return hash / 0x1_0000_0000;
}

function markGeometryStatic(geometry: THREE.BufferGeometry): void {
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.getAttribute(name);
    if (attribute instanceof THREE.InterleavedBufferAttribute) {
      attribute.data.setUsage(THREE.StaticDrawUsage);
    } else {
      attribute.setUsage(THREE.StaticDrawUsage);
    }
  }
  geometry.index?.setUsage(THREE.StaticDrawUsage);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

function configureBatch(
  batch: THREE.InstancedMesh,
  name: string,
  castShadow: boolean,
  receiveShadow: boolean,
): void {
  batch.name = name;
  batch.castShadow = castShadow;
  batch.receiveShadow = receiveShadow;
  batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  batch.frustumCulled = true;
}

function finishBatch(batch: THREE.InstancedMesh): void {
  batch.instanceMatrix.needsUpdate = true;
  if (batch.instanceColor) {
    batch.instanceColor.setUsage(THREE.StaticDrawUsage);
    batch.instanceColor.needsUpdate = true;
  }
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
}

function createLowGeometries(): GeometrySet {
  // These constructors and dimensions deliberately match the original foliage exactly.
  const trunk = new THREE.CylinderGeometry(.16, .24, 2.1, 7, 1);
  const crown = new THREE.ConeGeometry(1, 1, 9, 1);
  const snow = new THREE.ConeGeometry(1, 1, 9, 1, true);
  markGeometryStatic(trunk);
  markGeometryStatic(crown);
  markGeometryStatic(snow);
  return { trunk, crown, snow };
}

function pushTriangle(
  positions: number[],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): void {
  positions.push(...a, ...b, ...c);
}

/** Five overlapping, irregular branch whorls form one rooted crown geometry. */
function createHighCrownGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const layers = [
    { topY: 3.35, baseY: 1.34, radius: 1.42, droop: .16, phase: .18 },
    { topY: 3.94, baseY: 2.14, radius: 1.20, droop: .14, phase: .71 },
    { topY: 4.47, baseY: 2.98, radius: .95, droop: .12, phase: 1.29 },
    { topY: 4.99, baseY: 3.80, radius: .70, droop: .10, phase: 1.83 },
    { topY: 5.68, baseY: 4.53, radius: .46, droop: .08, phase: 2.37 },
  ] as const;

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex];
    const apex: readonly [number, number, number] = [
      Math.sin(layer.phase * 1.7) * .035,
      layer.topY,
      Math.cos(layer.phase * 1.3) * .03,
    ];
    const underside: readonly [number, number, number] = [apex[0] * .35, layer.baseY + .1, apex[2] * .35];
    const rim: Array<readonly [number, number, number]> = [];
    for (let segment = 0; segment < HIGH_CROWN_SEGMENTS; segment++) {
      const angle = segment / HIGH_CROWN_SEGMENTS * TWO_PI;
      const irregularity = 1
        + .048 * Math.sin(angle * 5 + layer.phase)
        + .024 * Math.sin(angle * 3 - layer.phase * 1.6);
      const radius = layer.radius * irregularity;
      const lobe = .5 + .5 * Math.cos(angle * 5 + layer.phase);
      rim.push([
        Math.cos(angle) * radius,
        layer.baseY - layer.droop * (.45 + .55 * lobe),
        Math.sin(angle) * radius,
      ]);
    }
    for (let segment = 0; segment < HIGH_CROWN_SEGMENTS; segment++) {
      const current = rim[segment];
      const next = rim[(segment + 1) % HIGH_CROWN_SEGMENTS];
      // Upper faces wind outward/up; the subtly raised lower hub closes the dark underside.
      pushTriangle(positions, apex, next, current);
      pushTriangle(positions, underside, current, next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  markGeometryStatic(geometry);
  return geometry;
}

/** Broken annular patches create snow shelves without wrapping every branch in white. */
function createHighSnowGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const shelves = [
    { innerRadius: .66, outerRadius: 1.31, innerY: 2.34, outerY: 1.57, rotation: .13 },
    { innerRadius: .55, outerRadius: 1.08, innerY: 3.13, outerY: 2.34, rotation: .67 },
    { innerRadius: .43, outerRadius: .84, innerY: 3.85, outerY: 3.16, rotation: 1.11 },
  ] as const;
  const coveredSectors = [0, 3, 6, 9] as const;

  for (const shelf of shelves) {
    for (const sector of coveredSectors) {
      const angleA = shelf.rotation + sector / HIGH_CROWN_SEGMENTS * TWO_PI;
      const angleB = shelf.rotation + (sector + 1) / HIGH_CROWN_SEGMENTS * TWO_PI;
      const innerA: readonly [number, number, number] = [
        Math.cos(angleA) * shelf.innerRadius, shelf.innerY, Math.sin(angleA) * shelf.innerRadius,
      ];
      const innerB: readonly [number, number, number] = [
        Math.cos(angleB) * shelf.innerRadius, shelf.innerY - .025, Math.sin(angleB) * shelf.innerRadius,
      ];
      const outerA: readonly [number, number, number] = [
        Math.cos(angleA) * shelf.outerRadius, shelf.outerY, Math.sin(angleA) * shelf.outerRadius,
      ];
      const outerB: readonly [number, number, number] = [
        Math.cos(angleB) * shelf.outerRadius, shelf.outerY - .04, Math.sin(angleB) * shelf.outerRadius,
      ];
      pushTriangle(positions, innerA, innerB, outerA);
      pushTriangle(positions, innerB, outerB, outerA);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  markGeometryStatic(geometry);
  return geometry;
}

function createHighGeometries(): GeometrySet {
  const trunk = new THREE.CylinderGeometry(.09, .22, 3.2, 7, 1);
  trunk.translate(0, 1.6, 0);
  const crown = createHighCrownGeometry();
  const snow = createHighSnowGeometry();
  markGeometryStatic(trunk);
  return { trunk, crown, snow };
}

function setHighInstanceColors(
  batches: InstancedFoliageBatches,
  treeIndex: number,
  seed: number,
): void {
  const variation = hashUnit(treeIndex, seed, 8);
  batches.trunks.setColorAt(treeIndex, new THREE.Color().setRGB(
    .88 + variation * .07,
    .89 + variation * .065,
    .86 + variation * .065,
  ));
  batches.crowns.setColorAt(treeIndex, new THREE.Color().setRGB(
    .88 + variation * .085,
    .91 + variation * .075,
    .89 + variation * .075,
  ));
  batches.snowCaps.setColorAt(treeIndex, new THREE.Color().setRGB(
    .94 + variation * .045,
    .96 + variation * .035,
    .98 + variation * .02,
  ));
}

function populateLowTransforms(
  placements: readonly WinterPinePlacement[],
  batches: InstancedFoliageBatches,
  groundY: number,
  seed: number,
): void {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const instanceScale = new THREE.Vector3();
  for (let treeIndex = 0; treeIndex < placements.length; treeIndex++) {
    const placement = placements[treeIndex];
    const scale = placement.scale;
    const rotation = treeRotation(treeIndex, seed);

    position.set(placement.x, groundY + 1.05 * scale, placement.z);
    quaternion.setFromAxisAngle(Y_AXIS, rotation);
    instanceScale.setScalar(scale);
    matrix.compose(position, quaternion, instanceScale);
    batches.trunks.setMatrixAt(treeIndex, matrix);

    for (let tier = 0; tier < CROWN_TIERS; tier++) {
      const tierIndex = treeIndex * CROWN_TIERS + tier;
      const radius = (1.4 - tier * .2) * scale;
      const tierY = groundY + (2.2 + tier * .75) * scale;
      const tierRotation = rotation + tier * .31;
      quaternion.setFromAxisAngle(Y_AXIS, tierRotation);
      position.set(placement.x, tierY, placement.z);
      instanceScale.set(radius, 2.4 * scale, radius);
      matrix.compose(position, quaternion, instanceScale);
      batches.crowns.setMatrixAt(tierIndex, matrix);
    }

    position.set(placement.x, groundY + 4.72 * scale, placement.z);
    quaternion.setFromAxisAngle(Y_AXIS, rotation + .93);
    instanceScale.set(.72 * scale, .55 * scale, .72 * scale);
    matrix.compose(position, quaternion, instanceScale);
    batches.snowCaps.setMatrixAt(treeIndex, matrix);
  }
}

function populateHighTransforms(
  placements: readonly WinterPinePlacement[],
  batches: InstancedFoliageBatches,
  trunkGeometry: THREE.BufferGeometry,
  groundY: number,
  seed: number,
): void {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const lean = new THREE.Quaternion();
  const leanAxis = new THREE.Vector3();
  const instanceScale = new THREE.Vector3();
  const transformed = new THREE.Vector3();
  const trunkPositions = trunkGeometry.getAttribute('position');

  for (let treeIndex = 0; treeIndex < placements.length; treeIndex++) {
    const placement = placements[treeIndex];
    const rotation = treeRotation(treeIndex, seed);
    const widthX = .93 + hashUnit(treeIndex, seed, 1) * .14;
    const widthZ = .93 + hashUnit(treeIndex, seed, 2) * .14;
    const height = .95 + hashUnit(treeIndex, seed, 3) * .12;
    const leanAngle = hashUnit(treeIndex, seed, 4) * .04;
    const leanDirection = hashUnit(treeIndex, seed, 5) * TWO_PI;

    yaw.setFromAxisAngle(Y_AXIS, rotation);
    leanAxis.set(Math.cos(leanDirection), 0, Math.sin(leanDirection));
    lean.setFromAxisAngle(leanAxis, leanAngle);
    quaternion.copy(lean).multiply(yaw);
    instanceScale.set(
      placement.scale * widthX,
      placement.scale * height,
      placement.scale * widthZ,
    );

    // All three components share one rooted tree transform. Compensating from
    // the actual tapered-trunk vertices keeps even a leaning tree above ground.
    position.set(placement.x, 0, placement.z);
    matrix.compose(position, quaternion, instanceScale);
    let minimumY = Number.POSITIVE_INFINITY;
    for (let vertex = 0; vertex < trunkPositions.count; vertex++) {
      transformed.fromBufferAttribute(trunkPositions, vertex).applyMatrix4(matrix);
      minimumY = Math.min(minimumY, transformed.y);
    }
    position.y = groundY - minimumY;
    matrix.compose(position, quaternion, instanceScale);
    batches.trunks.setMatrixAt(treeIndex, matrix);
    batches.crowns.setMatrixAt(treeIndex, matrix);
    batches.snowCaps.setMatrixAt(treeIndex, matrix);
    setHighInstanceColors(batches, treeIndex, seed);
  }
}

/**
 * Creates snowy pines in exactly three draw batches. High quality merges every
 * tree's layered crown and snow shelves into one root instance per batch; low
 * quality retains the original four-cone silhouette and transform layout.
 */
export function createInstancedFoliage(
  parent: THREE.Object3D,
  placements: readonly WinterPinePlacement[],
  options: InstancedFoliageOptions = {},
): InstancedFoliage {
  const { groundY, seed, quality } = validateOptions(options);
  placements.forEach(validatePlacement);

  const ownedMaterials: THREE.Material[] = [];
  const resolveMaterial = (supplied: THREE.Material | undefined, color: number, roughness: number): THREE.Material => {
    if (supplied) return supplied;
    const material = fallbackMaterial(color, roughness);
    ownedMaterials.push(material);
    return material;
  };
  const materials: InstancedFoliageMaterials = {
    trunk: resolveMaterial(options.materials?.trunk, 0x49382b, .96),
    foliage: resolveMaterial(options.materials?.foliage, 0x29483a, .94),
    snow: resolveMaterial(options.materials?.snow, 0xdde5e6, .98),
  };

  const geometries = quality === 'high' ? createHighGeometries() : createLowGeometries();
  const ownedGeometries = [geometries.trunk, geometries.crown, geometries.snow];
  const treeCount = placements.length;
  const crownInstances = quality === 'high' ? treeCount : treeCount * CROWN_TIERS;
  const trunks = new THREE.InstancedMesh(geometries.trunk, materials.trunk, treeCount);
  const crowns = new THREE.InstancedMesh(geometries.crown, materials.foliage, crownInstances);
  const snowCaps = new THREE.InstancedMesh(geometries.snow, materials.snow, treeCount);
  const batches = { trunks, crowns, snowCaps };
  const castShadow = options.castShadow ?? true;
  const receiveShadow = options.receiveShadow ?? true;
  configureBatch(trunks, 'WinterPineTrunks', castShadow, receiveShadow);
  configureBatch(crowns, 'WinterPineCrowns', castShadow, receiveShadow);
  configureBatch(snowCaps, 'WinterPineSnowCaps', castShadow, receiveShadow);

  if (quality === 'high') {
    populateHighTransforms(placements, batches, geometries.trunk, groundY, seed);
  } else {
    populateLowTransforms(placements, batches, groundY, seed);
  }
  finishBatch(trunks);
  finishBatch(crowns);
  finishBatch(snowCaps);

  const group = new THREE.Group();
  group.name = options.name ?? 'InstancedWinterPines';
  group.userData.decorative = true;
  group.add(trunks, crowns, snowCaps);
  parent.add(group);

  const trunkTriangles = triangleCount(geometries.trunk);
  const crownTriangles = triangleCount(geometries.crown);
  const snowTriangles = triangleCount(geometries.snow);
  const totalInstances = treeCount + crownInstances + treeCount;
  const drawCalls = treeCount > 0 ? 3 : 0;
  const trianglesPerTree = trunkTriangles
    + crownTriangles * (quality === 'high' ? 1 : CROWN_TIERS)
    + snowTriangles;
  const stats = Object.freeze<InstancedFoliageStats>({
    quality,
    treeCount,
    trunkInstances: treeCount,
    crownInstances,
    snowCapInstances: treeCount,
    totalInstances,
    drawBatches: drawCalls,
    drawCalls,
    geometries: 3,
    ownedGeometries: 3,
    materials: 3,
    ownedMaterials: ownedMaterials.length,
    textures: 0,
    colliders: 0,
    uniqueTriangles: trunkTriangles + crownTriangles + snowTriangles,
    trianglesPerTree,
    submittedTriangles: trianglesPerTree * treeCount,
  });
  let disposed = false;

  return {
    group,
    batches,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
    },
  };
}
