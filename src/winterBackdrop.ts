import * as THREE from 'three';

export type WinterBackdropQuality = 'low' | 'high';
export type WinterBackdropSide = 'north' | 'south' | 'west' | 'east';

export interface WinterBackdropOptions {
  readonly quality?: WinterBackdropQuality;
  /** A safe integer or non-empty string; the same seed produces byte-stable buffers. */
  readonly seed?: number | string;
  /** Caller-owned snow material used by the rolling terrain skirt. */
  readonly snowMaterial: THREE.Material;
  readonly name?: string;
}

export interface WinterBackdropStats {
  readonly quality: WinterBackdropQuality;
  readonly terrainVertices: number;
  readonly terrainTriangles: number;
  readonly treesPerSide: number;
  readonly treeCount: number;
  readonly treeTrianglesPerInstance: number;
  readonly treeInstances: number;
  readonly forestBatches: 4;
  readonly drawCalls: 5;
  readonly geometries: 2;
  readonly ownedMaterials: 1;
  readonly ownedTextures: 0;
  readonly colliders: 0;
  readonly submittedTriangles: number;
}

export interface WinterBackdrop {
  /** Decorative-only root; this presentation intentionally has no colliders or update method. */
  readonly root: THREE.Group;
  readonly terrain: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  /** North, south, west and east sector batches, in that stable order. */
  readonly treeBatches: readonly THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  readonly stats: Readonly<WinterBackdropStats>;
  /** Idempotently detaches the root and releases only resources owned by this module. */
  dispose(): void;
}

interface QualityConfig {
  readonly terrainAlongSegments: number;
  readonly terrainReturnSegments: number;
  readonly treesPerSide: number;
  readonly nearTreesPerSide: number;
  readonly treeRadialSegments: number;
  readonly treeProfile: readonly (readonly [height: number, radius: number])[];
  readonly includeTrunk: boolean;
}

export const WINTER_BACKDROP_SIDES = Object.freeze<readonly WinterBackdropSide[]>([
  'north', 'south', 'west', 'east',
]);

export const WINTER_BACKDROP_BUDGETS = Object.freeze({
  low: Object.freeze({ terrainTriangles: 384, treeTrianglesPerInstance: 32, submittedTriangles: 5_000 }),
  high: Object.freeze({ terrainTriangles: 768, treeTrianglesPerInstance: 88, submittedTriangles: 15_000 }),
});

const QUALITY = {
  low: {
    terrainAlongSegments: 16,
    terrainReturnSegments: 8,
    treesPerSide: 36,
    nearTreesPerSide: 24,
    treeRadialSegments: 4,
    treeProfile: [[0, .18], [.66, 1.08], [1.38, .82], [2.12, .52], [3.2, .08]] as const,
    includeTrunk: false,
  },
  high: {
    terrainAlongSegments: 32,
    terrainReturnSegments: 16,
    treesPerSide: 40,
    nearTreesPerSide: 26,
    treeRadialSegments: 6,
    treeProfile: [[.52, .25], [1.02, 1.17], [1.52, .95], [2.04, .78], [2.58, .50], [3.42, .07]] as const,
    includeTrunk: true,
  },
} as const satisfies Readonly<Record<WinterBackdropQuality, QualityConfig>>;

const INNER_EXTENT = 90;
const OUTER_EXTENT = 185;
const TERRAIN_OUTWARD_SEGMENTS = 4;
// Concentrate the outer rows behind the authored 120 m perimeter. The earlier
// ±105 m spread spent too many instances beyond the useful camera horizon,
// leaving the central skyline visually unchanged despite valid geometry.
const TREE_ALONG_EXTENT = 90;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface SeedPhases {
  readonly primary: number;
  readonly secondary: number;
  readonly tertiary: number;
}

function validateArguments(parent: THREE.Object3D, options: WinterBackdropOptions): {
  quality: WinterBackdropQuality;
  seedHash: number;
} {
  if (!(parent instanceof THREE.Object3D)) throw new TypeError('parent must be a THREE.Object3D');
  const quality = options?.quality ?? 'high';
  if (quality !== 'low' && quality !== 'high') throw new RangeError('quality must be low or high');
  if (!(options?.snowMaterial instanceof THREE.Material)) {
    throw new TypeError('snowMaterial must be a THREE.Material');
  }
  const seed = options.seed ?? 'russias-army-exterior-winter-v1';
  if (typeof seed === 'number' && (!Number.isSafeInteger(seed) || !Number.isFinite(seed))) {
    throw new RangeError('seed must be a safe integer or non-empty string');
  }
  if (typeof seed !== 'number' && (typeof seed !== 'string' || seed.length === 0)) {
    throw new RangeError('seed must be a safe integer or non-empty string');
  }
  return { quality, seedHash: hashSeed(seed) };
}

function hashSeed(seed: number | string): number {
  const value = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ (hash >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function terrainHeight(x: number, z: number, phases: SeedPhases): number {
  const outside = Math.max(Math.abs(x), Math.abs(z)) - INNER_EXTENT;
  const edge = smoothstep(outside / (OUTER_EXTENT - INNER_EXTENT));
  const broad = .5 + .275 * Math.sin(x * .031 + phases.primary)
    + .225 * Math.cos(z * .027 + phases.secondary);
  const broken = .5 + .5 * Math.sin((x + z) * .061 + phases.tertiary);
  return -.06 + edge * (1.28 + broad * 2.7 + broken * .52);
}

function terrainColour(x: number, z: number, phases: SeedPhases): readonly [number, number, number] {
  const variation = .91 + .055 * Math.sin(x * .087 + phases.secondary)
    + .035 * Math.cos(z * .103 + phases.tertiary);
  return [variation * .94, variation * .985, variation];
}

interface TerrainBuilder {
  positions: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function appendTerrainSlab(
  builder: TerrainBuilder,
  startX: number,
  endX: number,
  startZ: number,
  endZ: number,
  xSegments: number,
  zSegments: number,
  phases: SeedPhases,
): void {
  const baseVertex = builder.positions.length / 3;
  for (let zIndex = 0; zIndex <= zSegments; zIndex++) {
    const zMix = zIndex / zSegments;
    const z = THREE.MathUtils.lerp(startZ, endZ, zMix);
    for (let xIndex = 0; xIndex <= xSegments; xIndex++) {
      const xMix = xIndex / xSegments;
      const x = THREE.MathUtils.lerp(startX, endX, xMix);
      builder.positions.push(x, terrainHeight(x, z, phases), z);
      // UVs remain world-scaled so the injected repeating snow maps never stretch over the skirt.
      builder.uvs.push(x / 32, z / 32);
      builder.colors.push(...terrainColour(x, z, phases));
    }
  }
  const stride = xSegments + 1;
  const upwardWinding = (endX - startX) * (endZ - startZ) > 0;
  for (let zIndex = 0; zIndex < zSegments; zIndex++) {
    for (let xIndex = 0; xIndex < xSegments; xIndex++) {
      const lowerLeft = baseVertex + zIndex * stride + xIndex;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + stride;
      const upperRight = upperLeft + 1;
      if (upwardWinding) {
        builder.indices.push(lowerLeft, upperLeft, lowerRight, lowerRight, upperLeft, upperRight);
      } else {
        builder.indices.push(lowerLeft, lowerRight, upperLeft, lowerRight, upperRight, upperLeft);
      }
    }
  }
}

function staticAttribute(array: Float32Array, itemSize: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(array, itemSize).setUsage(THREE.StaticDrawUsage);
}

function createTerrainGeometry(config: QualityConfig, phases: SeedPhases): THREE.BufferGeometry {
  const builder: TerrainBuilder = { positions: [], uvs: [], colors: [], indices: [] };
  appendTerrainSlab(
    builder, -OUTER_EXTENT, OUTER_EXTENT, -INNER_EXTENT, -OUTER_EXTENT,
    config.terrainAlongSegments, TERRAIN_OUTWARD_SEGMENTS, phases,
  );
  appendTerrainSlab(
    builder, -OUTER_EXTENT, OUTER_EXTENT, INNER_EXTENT, OUTER_EXTENT,
    config.terrainAlongSegments, TERRAIN_OUTWARD_SEGMENTS, phases,
  );
  appendTerrainSlab(
    builder, -INNER_EXTENT, -OUTER_EXTENT, -INNER_EXTENT, INNER_EXTENT,
    TERRAIN_OUTWARD_SEGMENTS, config.terrainReturnSegments, phases,
  );
  appendTerrainSlab(
    builder, INNER_EXTENT, OUTER_EXTENT, -INNER_EXTENT, INNER_EXTENT,
    TERRAIN_OUTWARD_SEGMENTS, config.terrainReturnSegments, phases,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.name = 'WinterBackdropRollingTerrain';
  geometry.setAttribute('position', staticAttribute(new Float32Array(builder.positions), 3));
  geometry.setAttribute('uv', staticAttribute(new Float32Array(builder.uvs), 2));
  geometry.setAttribute('color', staticAttribute(new Float32Array(builder.colors), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(builder.indices), 1).setUsage(THREE.StaticDrawUsage));
  geometry.computeVertexNormals();
  (geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.StaticDrawUsage);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

interface TreeBuilder {
  positions: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

// Low retains the original pre-aged, non-fogged presentation byte-for-byte.
const FOLIAGE_DARK: readonly [number, number, number] = [.14, .23, .20];
const FOLIAGE_LIGHT: readonly [number, number, number] = [.20, .30, .26];
const SNOW_SHELF: readonly [number, number, number] = [.30, .39, .36];

function srgbTuple(hex: number): readonly [number, number, number] {
  // Buffer colours live in Three's linear working space. Constructing from a
  // hex value performs the sRGB-to-linear conversion once at authoring time.
  const colour = new THREE.Color(hex);
  return [colour.r, colour.g, colour.b];
}

const HIGH_TRUNK = srgbTuple(0x4a382d);
const HIGH_FOLIAGE_DARK = srgbTuple(0x203e34);
const HIGH_FOLIAGE_MID = srgbTuple(0x2c5143);
const HIGH_FOLIAGE_TIP = srgbTuple(0x37604f);
const HIGH_SNOW = srgbTuple(0x98aaa7);

interface HighWhorl {
  readonly topHeight: number;
  readonly outerHeight: number;
  readonly lowerHubHeight: number;
  readonly radius: number;
  readonly phase: number;
  readonly radiusScale: readonly [number, number, number, number, number, number];
  readonly droop: readonly [number, number, number, number, number, number];
  readonly colour: readonly [number, number, number];
}

const HIGH_WHORLS: readonly HighWhorl[] = Object.freeze([
  { topHeight: 1.65, outerHeight: .69, lowerHubHeight: 1.02, radius: 1.17, phase: .03, radiusScale: [1, .91, .96, .88, .94, .90], droop: [.02, .08, .04, .10, .03, .07], colour: HIGH_FOLIAGE_DARK },
  { topHeight: 2.15, outerHeight: 1.25, lowerHubHeight: 1.55, radius: 1.01, phase: .29, radiusScale: [.92, 1, .88, .95, .90, .97], droop: [.06, .02, .09, .04, .08, .03], colour: HIGH_FOLIAGE_DARK },
  { topHeight: 2.62, outerHeight: 1.81, lowerHubHeight: 2.08, radius: .84, phase: .08, radiusScale: [.96, .89, 1, .91, .95, .87], droop: [.03, .08, .02, .07, .04, .09], colour: HIGH_FOLIAGE_MID },
  { topHeight: 3.03, outerHeight: 2.35, lowerHubHeight: 2.58, radius: .64, phase: .34, radiusScale: [.89, .97, .91, 1, .87, .94], droop: [.07, .02, .05, .02, .08, .04], colour: HIGH_FOLIAGE_MID },
  { topHeight: 3.42, outerHeight: 2.82, lowerHubHeight: 3.02, radius: .43, phase: .13, radiusScale: [.95, .88, .97, .90, 1, .86], droop: [.03, .06, .02, .05, .01, .07], colour: HIGH_FOLIAGE_TIP },
]);

function highWhorlOuter(whorl: HighWhorl, segment: number): readonly [number, number, number] {
  const wrapped = segment % 6;
  const angle = wrapped / 6 * Math.PI * 2 + whorl.phase;
  const radius = whorl.radius * whorl.radiusScale[wrapped]!;
  return [Math.cos(angle) * radius, whorl.outerHeight - whorl.droop[wrapped]!, Math.sin(angle) * radius];
}

function appendCrown(builder: TreeBuilder, config: QualityConfig): void {
  const base = builder.positions.length / 3;
  const radial = config.treeRadialSegments;
  for (let ring = 0; ring < config.treeProfile.length; ring++) {
    const [height, radius] = config.treeProfile[ring];
    const colour = ring % 2 === 1 ? SNOW_SHELF : (ring === 0 ? FOLIAGE_DARK : FOLIAGE_LIGHT);
    for (let segment = 0; segment < radial; segment++) {
      const angle = segment / radial * Math.PI * 2 + (ring % 2) * .12;
      builder.positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      builder.uvs.push(segment / radial, height / 3.42);
      builder.colors.push(...colour);
    }
  }
  for (let ring = 0; ring < config.treeProfile.length - 1; ring++) {
    for (let segment = 0; segment < radial; segment++) {
      const next = (segment + 1) % radial;
      const lower = base + ring * radial + segment;
      const lowerNext = base + ring * radial + next;
      const upper = lower + radial;
      const upperNext = base + (ring + 1) * radial + next;
      builder.indices.push(lower, upper, lowerNext, lowerNext, upper, upperNext);
    }
  }
}

function appendHighStem(builder: TreeBuilder): void {
  const base = builder.positions.length / 3;
  const radial = 6;
  for (const [height, radius] of [[0, .15], [3.42, .035]] as const) {
    for (let segment = 0; segment < radial; segment++) {
      const angle = segment / radial * Math.PI * 2;
      builder.positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      builder.uvs.push(segment / radial, height / 3.42);
      builder.colors.push(...HIGH_TRUNK);
    }
  }
  for (let segment = 0; segment < 6; segment++) {
    const next = (segment + 1) % radial;
    builder.indices.push(base + segment, base + radial + segment, base + next);
    builder.indices.push(base + next, base + radial + segment, base + radial + next);
  }
}

function appendHighWhorl(builder: TreeBuilder, whorl: HighWhorl): void {
  const base = builder.positions.length / 3;
  const topHeight = whorl.topHeight;
  const bottomHeight = whorl.lowerHubHeight;
  builder.positions.push(0, topHeight, 0, 0, bottomHeight, 0);
  builder.uvs.push(.5, topHeight / 3.42, .5, bottomHeight / 3.42);
  builder.colors.push(...whorl.colour, ...whorl.colour);

  for (let segment = 0; segment < 6; segment++) {
    const [x, y, z] = highWhorlOuter(whorl, segment);
    builder.positions.push(x, y, z);
    builder.uvs.push(.5 + x / (whorl.radius * 2), .5 + z / (whorl.radius * 2));
    builder.colors.push(...whorl.colour);
  }
  for (let segment = 0; segment < 6; segment++) {
    const next = (segment + 1) % 6;
    const outer = base + 2 + segment;
    const outerNext = base + 2 + next;
    // The two fans give the shallow branch whorl a readable underside while
    // remaining disconnected from neighbouring tiers.
    builder.indices.push(base, outerNext, outer);
    builder.indices.push(base + 1, outer, outerNext);
  }
}

function appendHighSnowTrapezoid(builder: TreeBuilder, whorl: HighWhorl, segment: number): void {
  const base = builder.positions.length / 3;
  const top: readonly [number, number, number] = [0, whorl.topHeight, 0];
  const current = highWhorlOuter(whorl, segment);
  const next = highWhorlOuter(whorl, segment + 1);
  const weights = [
    [.48, .32, .20],
    [.28, .46, .26],
    [.28, .26, .46],
    [.48, .20, .32],
  ] as const;
  for (const [centreWeight, currentWeight, nextWeight] of weights) {
    const x = top[0] * centreWeight + current[0] * currentWeight + next[0] * nextWeight;
    const y = top[1] * centreWeight + current[1] * currentWeight + next[1] * nextWeight + .018;
    const z = top[2] * centreWeight + current[2] * currentWeight + next[2] * nextWeight;
    builder.positions.push(x, y, z);
    builder.uvs.push(.5 + x / (whorl.radius * 2), .5 + z / (whorl.radius * 2));
    builder.colors.push(...HIGH_SNOW);
  }
  builder.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

function appendHighTree(builder: TreeBuilder): void {
  appendHighStem(builder);
  for (const whorl of HIGH_WHORLS) appendHighWhorl(builder, whorl);
  for (const [whorlIndex, segment] of [[0, 0], [0, 3], [1, 1], [1, 4], [2, 2], [3, 5]] as const) {
    appendHighSnowTrapezoid(builder, HIGH_WHORLS[whorlIndex]!, segment);
  }
}

function createTreeGeometry(config: QualityConfig): THREE.BufferGeometry {
  const builder: TreeBuilder = { positions: [], uvs: [], colors: [], indices: [] };
  if (config.includeTrunk) appendHighTree(builder);
  else appendCrown(builder, config);
  const geometry = new THREE.BufferGeometry();
  geometry.name = config.includeTrunk ? 'WinterBackdropConiferHigh' : 'WinterBackdropConiferLow';
  geometry.setAttribute('position', staticAttribute(new Float32Array(builder.positions), 3));
  geometry.setAttribute('uv', staticAttribute(new Float32Array(builder.uvs), 2));
  geometry.setAttribute('color', staticAttribute(new Float32Array(builder.colors), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(builder.indices), 1).setUsage(THREE.StaticDrawUsage));
  geometry.computeVertexNormals();
  (geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.StaticDrawUsage);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function treePosition(side: WinterBackdropSide, along: number, distance: number): readonly [number, number] {
  switch (side) {
    case 'north': return [along, -distance];
    case 'south': return [-along, distance];
    case 'west': return [-distance, -along];
    case 'east': return [distance, along];
  }
}

function createTreeBatch(
  side: WinterBackdropSide,
  config: QualityConfig,
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  phases: SeedPhases,
  random: () => number,
): THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const batch = new THREE.InstancedMesh(geometry, material, config.treesPerSide);
  batch.name = `WinterBackdropForest:${side}`;
  batch.userData.visualOnly = true;
  batch.userData.decorative = true;
  batch.userData.sector = side;
  batch.castShadow = false;
  batch.receiveShadow = false;
  batch.frustumCulled = true;
  batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const tint = new THREE.Color();
  const farCount = config.treesPerSide - config.nearTreesPerSide;
  for (let index = 0; index < config.treesPerSide; index++) {
    const near = index < config.nearTreesPerSide;
    const rowIndex = near ? index : index - config.nearTreesPerSide;
    const rowCount = near ? config.nearTreesPerSide : farCount;
    const stagger = near ? 0 : .5;
    const alongMix = (rowIndex + .5 + stagger) / rowCount;
    const along = THREE.MathUtils.lerp(-TREE_ALONG_EXTENT, TREE_ALONG_EXTENT, alongMix)
      + (random() - .5) * (near ? 5.2 : 7.4);
    const distance = near ? 68 + random() * 14 : 88 + random() * 17;
    const [x, z] = treePosition(side, along, distance);
    const terrainY = Math.max(0, terrainHeight(x, z, phases));
    // High uses a narrower mature-spruce envelope around its more articulate
    // unit silhouette. Keep every random read in the original order so anchor,
    // yaw, anisotropy and tint determinism remain stable across the upgrade.
    const width = (config.includeTrunk ? 1.55 : 1.9) + random() * (config.includeTrunk ? .75 : .95);
    const height = (config.includeTrunk ? 3.15 : 3.8) + random() * (config.includeTrunk ? 1.30 : 1.6);
    position.set(x, terrainY, z);
    rotation.setFromAxisAngle(Y_AXIS, random() * Math.PI * 2);
    scale.set(width, height, width * (.90 + random() * .18));
    matrix.compose(position, rotation, scale);
    batch.setMatrixAt(index, matrix);
    const brightness = .88 + random() * .15;
    batch.setColorAt(index, tint.setRGB(brightness * .92, brightness, brightness * .96));
  }
  batch.instanceMatrix.needsUpdate = true;
  if (batch.instanceColor) {
    batch.instanceColor.setUsage(THREE.StaticDrawUsage);
    batch.instanceColor.needsUpdate = true;
  }
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
  return batch;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

/**
 * Builds a decorative exterior snow skirt and sector-culled forest. Every
 * resource and transform is created once; the backdrop has no per-frame work.
 */
export function createWinterBackdrop(
  parent: THREE.Object3D,
  options: WinterBackdropOptions,
): WinterBackdrop {
  const { quality, seedHash } = validateArguments(parent, options);
  const config = QUALITY[quality];
  const phaseRandom = mulberry32(seedHash ^ 0x4f1bbcdc);
  const phases: SeedPhases = {
    primary: phaseRandom() * Math.PI * 2,
    secondary: phaseRandom() * Math.PI * 2,
    tertiary: phaseRandom() * Math.PI * 2,
  };

  const terrainGeometry = createTerrainGeometry(config, phases);
  const terrain = new THREE.Mesh(terrainGeometry, options.snowMaterial);
  terrain.name = 'WinterBackdropTerrain';
  terrain.userData.visualOnly = true;
  terrain.userData.decorative = true;
  terrain.castShadow = false;
  terrain.receiveShadow = false;
  terrain.frustumCulled = true;

  const treeGeometry = createTreeGeometry(config);
  const treeMaterial = quality === 'high'
    ? new THREE.MeshStandardMaterial({
      name: 'WinterBackdropVertexColourForestHigh',
      color: 0xffffff,
      roughness: .98,
      metalness: 0,
      vertexColors: true,
      flatShading: true,
      dithering: true,
      // At 70–150 m the global exponential fog erases this entire dark LOD.
      // Its corrected low-luminance palette already carries aerial perspective,
      // so avoid applying that attenuation a second time.
      fog: false,
    })
    : new THREE.MeshStandardMaterial({
      name: 'WinterBackdropVertexColourForest',
      color: 0xffffff,
      roughness: .96,
      metalness: 0,
      vertexColors: true,
      flatShading: true,
      dithering: true,
      fog: false,
      emissive: 0x172622,
      emissiveIntensity: .22,
    });
  const treeBatches = WINTER_BACKDROP_SIDES.map((side, index) => createTreeBatch(
    side,
    config,
    treeGeometry,
    treeMaterial,
    phases,
    mulberry32(seedHash ^ Math.imul(index + 1, 0x9e3779b1)),
  ));

  const root = new THREE.Group();
  root.name = options.name ?? 'WinterExteriorBackdrop';
  root.userData.visualOnly = true;
  root.userData.decorative = true;
  root.add(terrain, ...treeBatches);
  parent.add(root);

  const terrainTriangles = triangleCount(terrainGeometry);
  const treeTrianglesPerInstance = triangleCount(treeGeometry);
  const treeCount = config.treesPerSide * WINTER_BACKDROP_SIDES.length;
  const stats = Object.freeze<WinterBackdropStats>({
    quality,
    terrainVertices: terrainGeometry.getAttribute('position').count,
    terrainTriangles,
    treesPerSide: config.treesPerSide,
    treeCount,
    treeTrianglesPerInstance,
    treeInstances: treeCount,
    forestBatches: 4,
    drawCalls: 5,
    geometries: 2,
    ownedMaterials: 1,
    ownedTextures: 0,
    colliders: 0,
    submittedTriangles: terrainTriangles + treeCount * treeTrianglesPerInstance,
  });
  const budget = WINTER_BACKDROP_BUDGETS[quality];
  if (
    stats.terrainTriangles > budget.terrainTriangles
    || stats.treeTrianglesPerInstance > budget.treeTrianglesPerInstance
    || stats.submittedTriangles > budget.submittedTriangles
  ) {
    terrainGeometry.dispose();
    treeGeometry.dispose();
    treeMaterial.dispose();
    root.removeFromParent();
    throw new Error(`Winter backdrop ${quality} topology exceeded its authored budget`);
  }

  let disposed = false;
  return {
    root,
    terrain,
    treeBatches,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      terrainGeometry.dispose();
      treeGeometry.dispose();
      treeMaterial.dispose();
    },
  };
}
