import * as THREE from 'three';
import { createCrossroadGeometry } from './crossroadGeometry';

export type RoadSurfaceQuality = 'low' | 'high';

export interface RoadSurfacePresentationOptions {
  quality?: RoadSurfaceQuality;
  length?: number;
  width?: number;
  seed?: number | string;
  /**
   * Injected asphalt remains caller-owned. High-quality roads enable its
   * `vertexColors` flag so the geometry's subtle aggregate/wear breakup is
   * visible; callers sharing that material should account for that setting.
   */
  asphaltMaterial?: THREE.Material;
  name?: string;
}

export interface RoadSurfaceStats {
  readonly quality: RoadSurfaceQuality;
  readonly length: number;
  readonly nominalWidth: number;
  readonly nominalArea: number;
  readonly projectedArea: number;
  readonly minimumClearWidth: number;
  readonly maximumSurfaceHeight: number;
  readonly surfaceTriangles: number;
  readonly markingInstances: number;
  readonly repairInstances: number;
  readonly drawCalls: number;
  readonly geometries: number;
  readonly colliders: 0;
  readonly submittedTriangles: number;
}

export interface RoadSurfacePresentation {
  readonly quality: RoadSurfaceQuality;
  readonly root: THREE.Group;
  readonly surface: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly markings: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
  readonly repairs?: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
  /** Exact piecewise-planar height contract for presentation overlays. */
  readonly heightSampler: RoadSurfaceHeightSampler;
  readonly stats: Readonly<RoadSurfaceStats>;
  dispose(): void;
}

export interface RoadSurfacePoint {
  readonly x: number;
  readonly z: number;
}

export interface RoadSurfaceHeightSample {
  readonly height: number;
  /** Upward-facing geometric normal of the rendered triangle. */
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
}

export interface RoadSurfaceHeightSamplerOptions {
  quality?: RoadSurfaceQuality;
  length?: number;
  width?: number;
  seed?: number | string;
}

/**
 * Deterministic road lookup with no scene, raycaster, or geometry dependency
 * after construction. A missing
 * sample means the point is outside the rendered plus-shaped surface (or in a
 * seeded high-quality shoulder cut-in).
 */
export interface RoadSurfaceHeightSampler {
  readonly quality: RoadSurfaceQuality;
  readonly length: number;
  readonly width: number;
  sample(x: number, z: number): RoadSurfaceHeightSample | undefined;
  heightAt(x: number, z: number): number | undefined;
  /**
   * Returns the highest sampled surface plus clearance. Pass a centre alone
   * for point overlays, or a centre and footprint corners for rigid props.
   * Returns undefined if any point is outside the rendered road.
   */
  placementHeight(points: readonly RoadSurfacePoint[], clearance?: number): number | undefined;
}

interface ShoulderProfile {
  readonly negativeInsets: number[];
  readonly positiveInsets: number[];
}

interface ArmDefinition {
  readonly name: 'east' | 'west' | 'south' | 'north';
  readonly directionX: number;
  readonly directionZ: number;
  readonly lateralX: number;
  readonly lateralZ: number;
  readonly profile: ShoulderProfile;
}

interface SurfaceBuild {
  readonly geometry: THREE.BufferGeometry;
  readonly projectedArea: number;
  readonly minimumClearWidth: number;
  readonly maximumSurfaceHeight: number;
  readonly profiles: readonly ShoulderProfile[];
}

const DEFAULT_LENGTH = 145;
const DEFAULT_WIDTH = 13;
const BASE_HEIGHT = .015;
const CROWN_HEIGHT = .04;
const HIGH_CENTRAL_SEGMENTS = 8;
const HIGH_ARM_SEGMENTS = 24;
const HIGH_LATERAL_SEGMENTS = 8;
const DEFAULT_PROJECTED_AREA_LOSS = 13;
const MAXIMUM_TOTAL_INSET = .6;
const MARKING_SPACING = 6;
const MARKING_LENGTH = 2.8;
const MARKING_WIDTH = .1;
const REPAIR_COUNT = 12;
const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_OVERLAY_CLEARANCE = .008;
const SAMPLE_EPSILON = 1e-7;

interface SurfaceTriangle {
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly denominator: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  if (value <= 0) throw new RangeError(`${label} must be greater than zero.`);
  return value;
}

function validateQuality(value: RoadSurfaceQuality): RoadSurfaceQuality {
  if (value !== 'low' && value !== 'high') throw new RangeError('road surface quality must be low or high.');
  return value;
}

function hashSeed(value: number | string): number {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
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

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function createSurfaceColors(geometry: THREE.BufferGeometry, seed: number | string): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const seedHash = hashSeed(`${seed}:surface-color`);
  const phaseA = (seedHash & 0xffff) / 0xffff * Math.PI * 2;
  const phaseB = (seedHash >>> 16) / 0xffff * Math.PI * 2;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const broad = Math.sin(x * .071 + z * .043 + phaseA);
    const aggregate = Math.sin(x * .39 - z * .31 + phaseB);
    const wear = Math.sin((x + z) * .16 + phaseA * .43 - phaseB * .27);
    const value = THREE.MathUtils.clamp(.955 + broad * .019 + aggregate * .014 + wear * .009, .91, .995);
    colors[index * 3] = value * .975;
    colors[index * 3 + 1] = value * .992;
    colors[index * 3 + 2] = value;
  }
  const attribute = new THREE.BufferAttribute(colors, 3);
  attribute.setUsage(THREE.StaticDrawUsage);
  geometry.setAttribute('color', attribute);
}

function createHeightSamplerFromGeometry(
  geometry: THREE.BufferGeometry,
  quality: RoadSurfaceQuality,
  length: number,
  width: number,
): RoadSurfaceHeightSampler {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index) throw new Error('road surface height sampling requires indexed geometry.');
  const triangles: SurfaceTriangle[] = [];
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    const ax = position.getX(a);
    const ay = position.getY(a);
    const az = position.getZ(a);
    const bx = position.getX(b);
    const by = position.getY(b);
    const bz = position.getZ(b);
    const cx = position.getX(c);
    const cy = position.getY(c);
    const cz = position.getZ(c);
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) <= Number.EPSILON) continue;
    const abX = bx - ax;
    const abY = by - ay;
    const abZ = bz - az;
    const acX = cx - ax;
    const acY = cy - ay;
    const acZ = cz - az;
    let normalX = abY * acZ - abZ * acY;
    let normalY = abZ * acX - abX * acZ;
    let normalZ = abX * acY - abY * acX;
    const inverseNormalLength = 1 / Math.hypot(normalX, normalY, normalZ);
    normalX *= inverseNormalLength;
    normalY *= inverseNormalLength;
    normalZ *= inverseNormalLength;
    triangles.push({
      ax, ay, az, bx, by, bz, cx, cy, cz,
      minX: Math.min(ax, bx, cx),
      maxX: Math.max(ax, bx, cx),
      minZ: Math.min(az, bz, cz),
      maxZ: Math.max(az, bz, cz),
      denominator,
      normalX,
      normalY,
      normalZ,
    });
  }

  const sample = (x: number, z: number): RoadSurfaceHeightSample | undefined => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
    for (const triangle of triangles) {
      if (
        x < triangle.minX - SAMPLE_EPSILON || x > triangle.maxX + SAMPLE_EPSILON
        || z < triangle.minZ - SAMPLE_EPSILON || z > triangle.maxZ + SAMPLE_EPSILON
      ) continue;
      const weightA = (
        (triangle.bz - triangle.cz) * (x - triangle.cx)
        + (triangle.cx - triangle.bx) * (z - triangle.cz)
      ) / triangle.denominator;
      const weightB = (
        (triangle.cz - triangle.az) * (x - triangle.cx)
        + (triangle.ax - triangle.cx) * (z - triangle.cz)
      ) / triangle.denominator;
      const weightC = 1 - weightA - weightB;
      if (weightA < -SAMPLE_EPSILON || weightB < -SAMPLE_EPSILON || weightC < -SAMPLE_EPSILON) continue;
      return {
        height: weightA * triangle.ay + weightB * triangle.by + weightC * triangle.cy,
        normalX: triangle.normalX,
        normalY: triangle.normalY,
        normalZ: triangle.normalZ,
      };
    }
    return undefined;
  };

  return Object.freeze({
    quality,
    length,
    width,
    sample,
    heightAt(x: number, z: number): number | undefined {
      return sample(x, z)?.height;
    },
    placementHeight(points: readonly RoadSurfacePoint[], clearance = DEFAULT_OVERLAY_CLEARANCE): number | undefined {
      if (!Number.isFinite(clearance) || clearance < 0) {
        throw new RangeError('road surface placement clearance must be finite and non-negative.');
      }
      if (points.length === 0) throw new RangeError('road surface placement requires at least one point.');
      let maximumHeight = Number.NEGATIVE_INFINITY;
      for (const point of points) {
        const result = sample(point.x, point.z);
        if (!result) return undefined;
        maximumHeight = Math.max(maximumHeight, result.height);
      }
      return maximumHeight + clearance;
    },
  });
}

function crown(normalizedLateral: number): number {
  const clamped = THREE.MathUtils.clamp(Math.abs(normalizedLateral), 0, 1);
  return 1 - clamped * clamped;
}

function centralHeight(x: number, z: number, halfWidth: number): number {
  const crownX = crown(x / halfWidth);
  const crownZ = crown(z / halfWidth);
  return BASE_HEIGHT + CROWN_HEIGHT * (crownX + crownZ - crownX * crownZ);
}

function armHeight(lateral: number, negativeEdge: number, positiveEdge: number): number {
  const normalized = lateral < 0 ? lateral / -negativeEdge : lateral / positiveEdge;
  return BASE_HEIGHT + CROWN_HEIGHT * crown(normalized);
}

function generateProfiles(random: () => number, armLength: number, width: number): ShoulderProfile[] {
  const profiles = Array.from({ length: 4 }, (): ShoulderProfile => ({
    negativeInsets: Array.from({ length: HIGH_ARM_SEGMENTS + 1 }, (_, station) => {
      if (station === 0 || station === HIGH_ARM_SEGMENTS) return 0;
      const notch = random() > .82 ? random() * .2 : 0;
      return .02 + random() * .06 + notch;
    }),
    positiveInsets: Array.from({ length: HIGH_ARM_SEGMENTS + 1 }, (_, station) => {
      if (station === 0 || station === HIGH_ARM_SEGMENTS) return 0;
      const notch = random() > .82 ? random() * .2 : 0;
      return .02 + random() * .06 + notch;
    }),
  }));

  const stationLength = armLength / HIGH_ARM_SEGMENTS;
  let rawLoss = 0;
  let maximumRawInset = 0;
  for (const profile of profiles) {
    for (let station = 0; station <= HIGH_ARM_SEGMENTS; station++) {
      const totalInset = profile.negativeInsets[station] + profile.positiveInsets[station];
      const weight = station === 0 || station === HIGH_ARM_SEGMENTS ? .5 : 1;
      rawLoss += totalInset * stationLength * weight;
      maximumRawInset = Math.max(maximumRawInset, totalInset);
    }
  }
  const length = armLength * 2 + width;
  const nominalArea = 2 * length * width - width * width;
  const requestedLoss = Math.min(DEFAULT_PROJECTED_AREA_LOSS, nominalArea * .0045);
  const lossScale = rawLoss > 0 ? requestedLoss / rawLoss : 0;
  const widthScale = maximumRawInset > 0 ? MAXIMUM_TOTAL_INSET / maximumRawInset : 1;
  const scale = Math.min(1, lossScale, widthScale);
  for (const profile of profiles) {
    for (let station = 0; station <= HIGH_ARM_SEGMENTS; station++) {
      profile.negativeInsets[station] *= scale;
      profile.positiveInsets[station] *= scale;
    }
  }
  return profiles;
}

function createHighSurface(length: number, width: number, seed: number | string): SurfaceBuild {
  const halfLength = length * .5;
  const halfWidth = width * .5;
  const armLength = halfLength - halfWidth;
  const profiles = generateProfiles(mulberry32(hashSeed(`${seed}:shoulders`)), armLength, width);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertexCache = new Map<string, number>();
  let maximumSurfaceHeight = Number.NEGATIVE_INFINITY;
  let minimumClearWidth = width;

  const vertex = (x: number, y: number, z: number): number => {
    const key = `${x.toFixed(9)}:${z.toFixed(9)}`;
    const cached = vertexCache.get(key);
    if (cached !== undefined) return cached;
    const index = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(x / width, z / width);
    maximumSurfaceHeight = Math.max(maximumSurfaceHeight, y);
    vertexCache.set(key, index);
    return index;
  };
  const addCell = (a: number, b: number, c: number, d: number): void => {
    indices.push(a, b, c, b, d, c);
  };

  const central: number[][] = [];
  for (let xIndex = 0; xIndex <= HIGH_CENTRAL_SEGMENTS; xIndex++) {
    const x = -halfWidth + width * xIndex / HIGH_CENTRAL_SEGMENTS;
    const row: number[] = [];
    for (let zIndex = 0; zIndex <= HIGH_CENTRAL_SEGMENTS; zIndex++) {
      const z = -halfWidth + width * zIndex / HIGH_CENTRAL_SEGMENTS;
      row.push(vertex(x, centralHeight(x, z, halfWidth), z));
    }
    central.push(row);
  }
  for (let xIndex = 0; xIndex < HIGH_CENTRAL_SEGMENTS; xIndex++) {
    for (let zIndex = 0; zIndex < HIGH_CENTRAL_SEGMENTS; zIndex++) {
      addCell(
        central[xIndex][zIndex],
        central[xIndex][zIndex + 1],
        central[xIndex + 1][zIndex],
        central[xIndex + 1][zIndex + 1],
      );
    }
  }

  const arms: ArmDefinition[] = [
    { name: 'east', directionX: 1, directionZ: 0, lateralX: 0, lateralZ: 1, profile: profiles[0] },
    { name: 'west', directionX: -1, directionZ: 0, lateralX: 0, lateralZ: -1, profile: profiles[1] },
    { name: 'south', directionX: 0, directionZ: 1, lateralX: -1, lateralZ: 0, profile: profiles[2] },
    { name: 'north', directionX: 0, directionZ: -1, lateralX: 1, lateralZ: 0, profile: profiles[3] },
  ];
  for (const arm of arms) {
    const grid: number[][] = [];
    for (let station = 0; station <= HIGH_ARM_SEGMENTS; station++) {
      const along = armLength * station / HIGH_ARM_SEGMENTS;
      const negativeEdge = halfWidth - arm.profile.negativeInsets[station];
      const positiveEdge = halfWidth - arm.profile.positiveInsets[station];
      minimumClearWidth = Math.min(minimumClearWidth, negativeEdge + positiveEdge);
      const row: number[] = [];
      for (let lateralIndex = 0; lateralIndex <= HIGH_LATERAL_SEGMENTS; lateralIndex++) {
        const lateral = -negativeEdge
          + (negativeEdge + positiveEdge) * lateralIndex / HIGH_LATERAL_SEGMENTS;
        const x = arm.directionX * (halfWidth + along) + arm.lateralX * lateral;
        const z = arm.directionZ * (halfWidth + along) + arm.lateralZ * lateral;
        row.push(vertex(x, armHeight(lateral, negativeEdge, positiveEdge), z));
      }
      grid.push(row);
    }
    for (let station = 0; station < HIGH_ARM_SEGMENTS; station++) {
      for (let lateralIndex = 0; lateralIndex < HIGH_LATERAL_SEGMENTS; lateralIndex++) {
        addCell(
          grid[station][lateralIndex],
          grid[station][lateralIndex + 1],
          grid[station + 1][lateralIndex],
          grid[station + 1][lateralIndex + 1],
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  createSurfaceColors(geometry, seed);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'CrownedWinterCrossroadGeometry';

  const stationLength = armLength / HIGH_ARM_SEGMENTS;
  let shoulderLoss = 0;
  for (const profile of profiles) {
    for (let station = 0; station <= HIGH_ARM_SEGMENTS; station++) {
      const weight = station === 0 || station === HIGH_ARM_SEGMENTS ? .5 : 1;
      shoulderLoss += (
        profile.negativeInsets[station] + profile.positiveInsets[station]
      ) * stationLength * weight;
    }
  }
  const nominalArea = 2 * length * width - width * width;
  const projectedArea = nominalArea - shoulderLoss;
  geometry.userData.nominalArea = nominalArea;
  geometry.userData.projectedArea = rounded(projectedArea);
  geometry.userData.minimumClearWidth = rounded(minimumClearWidth);
  geometry.userData.maximumSurfaceHeight = rounded(maximumSurfaceHeight);
  geometry.userData.regionCount = 5;
  geometry.userData.shoulderProfiles = profiles.map((profile) => Object.freeze({
    negativeInsets: Object.freeze([...profile.negativeInsets]),
    positiveInsets: Object.freeze([...profile.positiveInsets]),
  }));
  return {
    geometry,
    projectedArea: rounded(projectedArea),
    minimumClearWidth: rounded(minimumClearWidth),
    maximumSurfaceHeight: rounded(maximumSurfaceHeight),
    profiles,
  };
}

function createLowSurface(length: number, width: number): SurfaceBuild {
  const geometry = createCrossroadGeometry(length, width);
  geometry.translate(0, BASE_HEIGHT, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'FallbackFlatWinterCrossroadGeometry';
  const nominalArea = 2 * length * width - width * width;
  geometry.userData.nominalArea = nominalArea;
  geometry.userData.projectedArea = nominalArea;
  geometry.userData.minimumClearWidth = width;
  geometry.userData.maximumSurfaceHeight = BASE_HEIGHT;
  return {
    geometry,
    projectedArea: nominalArea,
    minimumClearWidth: width,
    maximumSurfaceHeight: BASE_HEIGHT,
    profiles: [],
  };
}

/**
 * Builds the same deterministic height contract as a road presentation
 * without retaining a renderable geometry. Prefer a presentation's
 * `heightSampler` when one already exists so seed and dimensions cannot drift.
 */
export function createRoadSurfaceHeightSampler(
  options: RoadSurfaceHeightSamplerOptions = {},
): RoadSurfaceHeightSampler {
  const quality = validateQuality(options.quality ?? 'high');
  const length = finitePositive(options.length ?? DEFAULT_LENGTH, 'road surface length');
  const width = finitePositive(options.width ?? DEFAULT_WIDTH, 'road surface width');
  if (length <= width) throw new RangeError('road surface length must be greater than its width.');
  const build = quality === 'high'
    ? createHighSurface(length, width, options.seed ?? 'barrack-01-road-surface')
    : createLowSurface(length, width);
  const sampler = createHeightSamplerFromGeometry(build.geometry, quality, length, width);
  build.geometry.dispose();
  return sampler;
}

function createWeatheredMarkingGeometry(): THREE.BufferGeometry {
  const outline = [
    [-1, -.30], [-.68, .42], [-.18, .36], [.36, .45],
    [1, .24], [.89, -.34], [.28, -.41], [-.45, -.37],
  ] as const;
  const positions = [0, 0, 0];
  const uvs = [.5, .5];
  const indices: number[] = [];
  for (const [x, z] of outline) {
    positions.push(x * MARKING_LENGTH * .5, 0, z * MARKING_WIDTH);
    uvs.push(x * .5 + .5, z + .5);
  }
  for (let point = 0; point < outline.length; point++) {
    indices.push(0, point + 1, (point + 1) % outline.length + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'WeatheredRoadMarkingGeometry';
  return geometry;
}

function createRepairGeometry(): THREE.BufferGeometry {
  const radii = [1, .72, .94, .68, 1, .77, .9, .7] as const;
  const positions = [0, 0, 0];
  const uvs = [.5, .5];
  const indices: number[] = [];
  for (let point = 0; point < radii.length; point++) {
    const angle = -point / radii.length * Math.PI * 2;
    const radius = radii[point];
    positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    uvs.push(Math.cos(angle) * radius * .5 + .5, Math.sin(angle) * radius * .5 + .5);
    indices.push(0, point + 1, (point + 1) % radii.length + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'IrregularRoadRepairGeometry';
  return geometry;
}

function configureStaticInstances(mesh: THREE.InstancedMesh): void {
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.StaticDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.userData.presentationOnly = true;
}

function createMarkings(
  length: number,
  width: number,
  heightSampler: RoadSurfaceHeightSampler,
  seed: number | string,
): { mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>; material: THREE.Material } {
  const geometry = createWeatheredMarkingGeometry();
  const halfLength = length * .5;
  const halfWidth = width * .5;
  const maximumMark = Math.floor((halfLength - halfWidth) / MARKING_SPACING) * MARKING_SPACING;
  const alongPositions: number[] = [];
  for (let along = -maximumMark; along <= maximumMark + 1e-9; along += MARKING_SPACING) alongPositions.push(along);
  const count = alongPositions.length * 4;
  const material = new THREE.MeshStandardMaterial({
    color: 0xeadfb8,
    roughness: .96,
    metalness: 0,
    // A small warm lift keeps thin paint legible under the overcast key and
    // prevents grazing transparent fans from reading as black asphalt cuts.
    emissive: 0x6e5f3d,
    emissiveIntensity: .28,
    transparent: true,
    opacity: .7,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexColors: true,
    // Every fan is authored counter-clockwise from above. FrontSide avoids the
    // two-pass transparent DoubleSide path and keeps the published draw budget real.
    side: THREE.FrontSide,
  });
  material.name = 'WeatheredRoadPaint';
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'InstancedWeatheredRoadMarkings';
  const random = mulberry32(hashSeed(`${seed}:markings`));
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let instance = 0;
  for (const along of alongPositions) {
    for (const lane of [-width * .4115384615, width * .4115384615]) {
      const horizontalHeight = heightSampler.placementHeight([{ x: along, z: lane }], .011);
      if (horizontalHeight === undefined) throw new Error('road marking centre fell outside the horizontal road arm.');
      position.set(along, horizontalHeight, lane);
      rotation.setFromAxisAngle(UP, (random() - .5) * .025);
      scale.set(.86 + random() * .14, 1, .76 + random() * .22);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(instance, matrix);
      const value = .78 + random() * .18;
      mesh.setColorAt(instance++, color.setRGB(value, value * .97, value * .82));

      const verticalHeight = heightSampler.placementHeight([{ x: lane, z: along }], .0115);
      if (verticalHeight === undefined) throw new Error('road marking centre fell outside the vertical road arm.');
      position.set(lane, verticalHeight, along);
      rotation.setFromAxisAngle(UP, Math.PI * .5 + (random() - .5) * .025);
      scale.set(.86 + random() * .14, 1, .76 + random() * .22);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(instance, matrix);
      const verticalValue = .78 + random() * .18;
      mesh.setColorAt(instance++, color.setRGB(verticalValue, verticalValue * .97, verticalValue * .82));
    }
  }
  configureStaticInstances(mesh);
  return { mesh, material };
}

function createRepairs(
  length: number,
  width: number,
  heightSampler: RoadSurfaceHeightSampler,
  seed: number | string,
): { mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>; material: THREE.Material } {
  const geometry = createRepairGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: .9,
    metalness: .01,
    transparent: true,
    // Repairs should interrupt the specular sheet without reading as black
    // holes. Low opacity lets the authored icy-asphalt variation remain visible.
    opacity: .24,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    vertexColors: true,
    side: THREE.FrontSide,
  });
  material.name = 'WinterRoadRepairs';
  const mesh = new THREE.InstancedMesh(geometry, material, REPAIR_COUNT);
  mesh.name = 'InstancedWinterRoadRepairs';
  const random = mulberry32(hashSeed(`${seed}:repairs`));
  const halfLength = length * .5;
  const halfWidth = width * .5;
  const armLength = halfLength - halfWidth;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (let index = 0; index < REPAIR_COUNT; index++) {
    const arm = index % 4;
    const along = halfWidth + Math.min(armLength * .86, 4 + random() * Math.max(0, armLength - 8));
    const lateral = (random() - .5) * width * .58;
    const x = arm === 0 ? along : arm === 1 ? -along : lateral;
    const z = arm === 2 ? along : arm === 3 ? -along : lateral;
    const height = heightSampler.placementHeight([{ x, z }], .006);
    if (height === undefined) throw new Error('road repair centre fell outside the road surface.');
    position.set(x, height, z);
    rotation.setFromAxisAngle(UP, random() * Math.PI);
    scale.set(.2 + random() * .34, 1, .07 + random() * .12);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    const value = .64 + random() * .12;
    mesh.setColorAt(index, color.setRGB(value * .9, value, value * .96));
  }
  configureStaticInstances(mesh);
  return { mesh, material };
}

function enableMaterialVertexColors(material: THREE.Material): void {
  if (!('vertexColors' in material)) return;
  const vertexColorMaterial = material as THREE.Material & { vertexColors: boolean };
  if (vertexColorMaterial.vertexColors) return;
  vertexColorMaterial.vertexColors = true;
  material.needsUpdate = true;
}

/**
 * Creates the arena's visual-only winter crossroad presentation. The returned
 * object deliberately contains no colliders or update method; gameplay keeps
 * using the existing flat ground and road masks.
 */
export function createRoadSurfacePresentation(
  parent: THREE.Object3D,
  options: RoadSurfacePresentationOptions = {},
): RoadSurfacePresentation {
  if (!(parent instanceof THREE.Object3D)) throw new TypeError('road surface parent must be a THREE.Object3D.');
  const quality = validateQuality(options.quality ?? 'high');
  const length = finitePositive(options.length ?? DEFAULT_LENGTH, 'road surface length');
  const width = finitePositive(options.width ?? DEFAULT_WIDTH, 'road surface width');
  if (length <= width) throw new RangeError('road surface length must be greater than its width.');
  const seed = options.seed ?? 'barrack-01-road-surface';
  const surfaceBuild = quality === 'high'
    ? createHighSurface(length, width, seed)
    : createLowSurface(length, width);
  const heightSampler = createHeightSamplerFromGeometry(surfaceBuild.geometry, quality, length, width);
  const ownedAsphalt = options.asphaltMaterial ? null : new THREE.MeshPhysicalMaterial({
    color: 0x52605d,
    roughness: .66,
    metalness: .04,
    clearcoat: .34,
    clearcoatRoughness: .28,
  });
  const asphaltMaterial = options.asphaltMaterial ?? ownedAsphalt!;
  if (quality === 'high') enableMaterialVertexColors(asphaltMaterial);
  const surface = new THREE.Mesh(surfaceBuild.geometry, asphaltMaterial);
  surface.name = quality === 'high' ? 'CrownedWinterCrossroad' : 'FallbackFlatWinterCrossroad';
  surface.castShadow = false;
  surface.receiveShadow = true;
  surface.userData.presentationOnly = true;
  surface.userData.heightContract = 'piecewise-planar-road-sampler';
  surface.userData.vertexColorBreakup = quality === 'high';

  const markingBuild = createMarkings(length, width, heightSampler, seed);
  const repairBuild = quality === 'high' ? createRepairs(length, width, heightSampler, seed) : undefined;
  const root = new THREE.Group();
  root.name = options.name ?? 'RoadSurfacePresentation';
  root.userData.presentationOnly = true;
  root.userData.authoritativeColliders = 'none';
  root.add(surface, markingBuild.mesh);
  if (repairBuild) root.add(repairBuild.mesh);

  const surfaceTriangles = triangleCount(surfaceBuild.geometry);
  const markingTriangles = triangleCount(markingBuild.mesh.geometry) * markingBuild.mesh.count;
  const repairTriangles = repairBuild
    ? triangleCount(repairBuild.mesh.geometry) * repairBuild.mesh.count
    : 0;
  const stats = Object.freeze<RoadSurfaceStats>({
    quality,
    length,
    nominalWidth: width,
    nominalArea: 2 * length * width - width * width,
    projectedArea: surfaceBuild.projectedArea,
    minimumClearWidth: surfaceBuild.minimumClearWidth,
    maximumSurfaceHeight: surfaceBuild.maximumSurfaceHeight,
    surfaceTriangles,
    markingInstances: markingBuild.mesh.count,
    repairInstances: repairBuild?.mesh.count ?? 0,
    drawCalls: repairBuild ? 3 : 2,
    geometries: repairBuild ? 3 : 2,
    colliders: 0,
    submittedTriangles: surfaceTriangles + markingTriangles + repairTriangles,
  });
  const exceedsHighBudget = quality === 'high' && (
    stats.drawCalls > 3 || stats.geometries > 3 || stats.submittedTriangles > 2_600
  );
  const exceedsLowBudget = quality === 'low' && (
    stats.drawCalls > 2 || stats.geometries > 2 || stats.submittedTriangles > 1_200
  );
  if (exceedsHighBudget || exceedsLowBudget) {
    surfaceBuild.geometry.dispose();
    markingBuild.mesh.geometry.dispose();
    markingBuild.material.dispose();
    repairBuild?.mesh.geometry.dispose();
    repairBuild?.material.dispose();
    ownedAsphalt?.dispose();
    throw new Error(`${quality}-quality road surface exceeded its presentation budget.`);
  }
  parent.add(root);

  let disposed = false;
  return {
    quality,
    root,
    surface,
    markings: markingBuild.mesh,
    repairs: repairBuild?.mesh,
    heightSampler,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      surfaceBuild.geometry.dispose();
      markingBuild.mesh.geometry.dispose();
      markingBuild.material.dispose();
      if (repairBuild) {
        repairBuild.mesh.geometry.dispose();
        repairBuild.material.dispose();
      }
      ownedAsphalt?.dispose();
    },
  };
}
