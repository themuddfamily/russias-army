import * as THREE from 'three';

export type WinterGroundReliefPatchKind = 'sastrugi' | 'wind-crust' | 'compacted';

export interface WinterGroundReliefExclusionRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Additional clearance beyond the presentation-wide padding. */
  readonly padding?: number;
}

export interface WinterGroundReliefPlacement {
  readonly kind: WinterGroundReliefPatchKind;
  readonly quadrant: 'south-west' | 'south-east' | 'north-west' | 'north-east';
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly length: number;
  readonly width: number;
  readonly height: number;
}

export interface WinterGroundReliefStats {
  readonly quality: 'high';
  readonly patches: 88;
  readonly sastrugiPatches: 64;
  readonly windCrustPatches: 16;
  readonly compactedPatches: 8;
  readonly vertices: 84;
  readonly submittedVertices: 7392;
  readonly trianglesPerPatch: 108;
  readonly submittedTriangles: 9504;
  readonly drawCalls: 1;
  readonly geometries: 1;
  readonly ownedGeometries: 1;
  readonly injectedMaterials: 1;
  readonly ownedMaterials: 1;
  readonly ownedTextures: 0;
  readonly exclusions: number;
  readonly colliders: 0;
  readonly perFrameUpdates: 0;
  readonly minHeight: -0.01;
  readonly maxHeight: 0.04;
}

export interface WinterGroundReliefOptions {
  /** Cloned before vertex/instance colour support is enabled; never disposed. */
  readonly material: THREE.Material;
  readonly seed?: number | string;
  /** General-purpose clear rectangles such as roads and building footprints. */
  readonly exclusions?: readonly WinterGroundReliefExclusionRect[];
  /** Alias for authored visual masks; combined with `exclusions`. */
  readonly masks?: readonly WinterGroundReliefExclusionRect[];
  /** Projected contact colliders; combined with the other clear rectangles. */
  readonly contactColliders?: readonly WinterGroundReliefExclusionRect[];
  /** Clearance added around every supplied rectangle. Defaults to 0.45m. */
  readonly exclusionPadding?: number;
  /** Used to preserve the caller's world-phased snow-map UV scale. Defaults to 180m. */
  readonly fieldSize?: number;
  readonly name?: string;
}

export interface WinterGroundReliefHeightSampler {
  /** Returns the decorative surface height, or undefined beyond every patch. */
  heightAt(x: number, z: number): number | undefined;
}

export interface WinterGroundRelief {
  readonly root: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
  readonly stats: Readonly<WinterGroundReliefStats>;
  readonly placements: readonly Readonly<WinterGroundReliefPlacement>[];
  readonly heightSampler: WinterGroundReliefHeightSampler;
  setVisible(visible: boolean): void;
  /** Idempotently detaches the mesh and releases only its owned geometry/material. */
  dispose(): void;
}

interface ValidatedExclusion {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface Footprint {
  readonly x: number;
  readonly z: number;
  readonly axisX: readonly [number, number];
  readonly axisZ: readonly [number, number];
  readonly halfLength: number;
  readonly halfWidth: number;
}

interface PatchRange {
  readonly length: readonly [number, number];
  readonly width: readonly [number, number];
  readonly height: readonly [number, number];
}

interface PatchSurface {
  readonly localX: Float32Array;
  readonly localZ: Float32Array;
  readonly localHeight: Float32Array;
  readonly indices: Uint16Array;
}

const RIBBON_COUNT = 3;
const ALONG_COUNT = 7;
const CROSS_COUNT = 4;
const PATCH_COUNT = 88;
const PREVAILING_YAW = -.43;
const YAW_VARIATION = .14;
const DEFAULT_FIELD_SIZE = 180;
const DEFAULT_EXCLUSION_PADDING = .45;
const PLACEMENT_CLEARANCE = .15;
const MAX_PATCH_HEIGHT = .04;
const LOCAL_RIM_HEIGHT = -.25;
const QUADRANT_MIN = 10;
const QUADRANT_MAX = 55;

const PATCH_RANGES: Readonly<Record<WinterGroundReliefPatchKind, PatchRange>> = Object.freeze({
  sastrugi: Object.freeze({ length: [4, 6.5] as const, width: [1.4, 2.2] as const, height: [.018, .04] as const }),
  'wind-crust': Object.freeze({ length: [3.2, 5.2] as const, width: [1.6, 2.6] as const, height: [.01, .024] as const }),
  compacted: Object.freeze({ length: [2.6, 4.6] as const, width: [1.8, 2.8] as const, height: [.005, .014] as const }),
});

const QUADRANTS = Object.freeze([
  Object.freeze({ name: 'south-west' as const, xSign: -1, zSign: -1 }),
  Object.freeze({ name: 'south-east' as const, xSign: 1, zSign: -1 }),
  Object.freeze({ name: 'north-west' as const, xSign: -1, zSign: 1 }),
  Object.freeze({ name: 'north-east' as const, xSign: 1, zSign: 1 }),
]);

const TYPES_PER_QUADRANT: readonly WinterGroundReliefPatchKind[] = Object.freeze([
  'sastrugi', 'sastrugi', 'sastrugi', 'sastrugi',
  'sastrugi', 'sastrugi', 'sastrugi', 'sastrugi',
  'sastrugi', 'sastrugi', 'sastrugi', 'sastrugi',
  'sastrugi', 'sastrugi', 'sastrugi', 'sastrugi',
  'wind-crust', 'wind-crust', 'wind-crust', 'wind-crust',
  'compacted', 'compacted',
]);

export const WINTER_GROUND_RELIEF_PROGRAM_KEY = 'winter-ground-relief-world-map-uv-v1';

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ (hash >>> 16)) >>> 0;
}

function validateSeed(seed: number | string): number {
  if (typeof seed === 'number' && (!Number.isSafeInteger(seed) || !Number.isFinite(seed))) {
    throw new RangeError('winter ground relief seed must be a safe integer or non-empty string');
  }
  if (typeof seed !== 'number' && (typeof seed !== 'string' || seed.length === 0)) {
    throw new RangeError('winter ground relief seed must be a safe integer or non-empty string');
  }
  return hashSeed(seed);
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

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [output[index], output[swap]] = [output[swap]!, output[index]!];
  }
  return output;
}

function validateExclusions(
  source: readonly WinterGroundReliefExclusionRect[],
  globalPadding: number,
): readonly ValidatedExclusion[] {
  return source.map((rect, index) => {
    if (!rect || typeof rect !== 'object') {
      throw new TypeError(`winter ground relief exclusion ${index} must be a rectangle`);
    }
    const minX = finite(rect.minX, `winter ground relief exclusion ${index} minX`);
    const maxX = finite(rect.maxX, `winter ground relief exclusion ${index} maxX`);
    const minZ = finite(rect.minZ, `winter ground relief exclusion ${index} minZ`);
    const maxZ = finite(rect.maxZ, `winter ground relief exclusion ${index} maxZ`);
    const localPadding = finite(rect.padding ?? 0, `winter ground relief exclusion ${index} padding`);
    if (maxX <= minX || maxZ <= minZ) {
      throw new RangeError(`winter ground relief exclusion ${index} maximums must be greater than minimums`);
    }
    if (localPadding < 0) {
      throw new RangeError(`winter ground relief exclusion ${index} padding must not be negative`);
    }
    const padding = globalPadding + localPadding;
    return Object.freeze({
      minX: minX - padding,
      maxX: maxX + padding,
      minZ: minZ - padding,
      maxZ: maxZ + padding,
    });
  });
}

function footprintFor(placement: WinterGroundReliefPlacement, clearance = 0): Footprint {
  const cosine = Math.cos(placement.yaw);
  const sine = Math.sin(placement.yaw);
  return {
    x: placement.x,
    z: placement.z,
    axisX: [cosine, -sine],
    axisZ: [sine, cosine],
    halfLength: placement.length * .5 + clearance,
    halfWidth: placement.width * .5 + clearance,
  };
}

function projectionRadius(footprint: Footprint, axisX: number, axisZ: number): number {
  return footprint.halfLength * Math.abs(footprint.axisX[0] * axisX + footprint.axisX[1] * axisZ)
    + footprint.halfWidth * Math.abs(footprint.axisZ[0] * axisX + footprint.axisZ[1] * axisZ);
}

function footprintsOverlap(first: Footprint, second: Footprint): boolean {
  const deltaX = second.x - first.x;
  const deltaZ = second.z - first.z;
  const axes = [first.axisX, first.axisZ, second.axisX, second.axisZ] as const;
  for (const axis of axes) {
    const distance = Math.abs(deltaX * axis[0] + deltaZ * axis[1]);
    if (distance >= projectionRadius(first, axis[0], axis[1]) + projectionRadius(second, axis[0], axis[1])) {
      return false;
    }
  }
  return true;
}

function footprintOverlapsExclusion(footprint: Footprint, rect: ValidatedExclusion): boolean {
  const rectangle: Footprint = {
    x: (rect.minX + rect.maxX) * .5,
    z: (rect.minZ + rect.maxZ) * .5,
    axisX: [1, 0],
    axisZ: [0, 1],
    halfLength: (rect.maxX - rect.minX) * .5,
    halfWidth: (rect.maxZ - rect.minZ) * .5,
  };
  return footprintsOverlap(footprint, rectangle);
}

function candidateIsClear(
  candidate: WinterGroundReliefPlacement,
  exclusions: readonly ValidatedExclusion[],
  accepted: readonly WinterGroundReliefPlacement[],
): boolean {
  const footprint = footprintFor(candidate);
  if (exclusions.some((rect) => footprintOverlapsExclusion(footprint, rect))) return false;
  const paddedFootprint = footprintFor(candidate, PLACEMENT_CLEARANCE);
  return accepted.every((placement) => !footprintsOverlap(
    paddedFootprint,
    footprintFor(placement, PLACEMENT_CLEARANCE),
  ));
}

function createCandidate(
  kind: WinterGroundReliefPatchKind,
  quadrant: (typeof QUADRANTS)[number],
  xMagnitudeRange: readonly [number, number],
  zMagnitudeRange: readonly [number, number],
  random: () => number,
  forceMaximumHeight: boolean,
): WinterGroundReliefPlacement {
  const range = PATCH_RANGES[kind];
  const interpolate = (limits: readonly [number, number]): number => THREE.MathUtils.lerp(limits[0], limits[1], random());
  return {
    kind,
    quadrant: quadrant.name,
    x: quadrant.xSign * interpolate(xMagnitudeRange),
    z: quadrant.zSign * interpolate(zMagnitudeRange),
    yaw: PREVAILING_YAW + (random() * 2 - 1) * YAW_VARIATION,
    length: interpolate(range.length),
    width: interpolate(range.width),
    height: forceMaximumHeight ? MAX_PATCH_HEIGHT : interpolate(range.height),
  };
}

function createPlacements(
  random: () => number,
  exclusions: readonly ValidatedExclusion[],
): readonly Readonly<WinterGroundReliefPlacement>[] {
  const accepted: WinterGroundReliefPlacement[] = [];
  let maximumHeightAssigned = false;
  const xCells = 6;
  const zCells = 4;
  const xCellSize = (QUADRANT_MAX - QUADRANT_MIN) / xCells;
  const zCellSize = (QUADRANT_MAX - QUADRANT_MIN) / zCells;

  for (const quadrant of QUADRANTS) {
    const types = shuffled(TYPES_PER_QUADRANT, random);
    const cells = shuffled(Array.from({ length: 24 }, (_, index) => index), random);
    // Two cells per quadrant remain intentionally open so the ribbons form
    // loose fields rather than a mechanically complete lattice.
    for (let slot = 0; slot < 22; slot += 1) {
      const kind = types[slot]!;
      const cell = cells[slot]!;
      const xCell = cell % xCells;
      const zCell = Math.floor(cell / xCells);
      const localXRange = [QUADRANT_MIN + xCell * xCellSize, QUADRANT_MIN + (xCell + 1) * xCellSize] as const;
      const localZRange = [QUADRANT_MIN + zCell * zCellSize, QUADRANT_MIN + (zCell + 1) * zCellSize] as const;
      let selected: WinterGroundReliefPlacement | undefined;

      for (let attempt = 0; attempt < 320 && !selected; attempt += 1) {
        const useWholeQuadrant = attempt >= 112;
        const candidate = createCandidate(
          kind,
          quadrant,
          useWholeQuadrant ? [QUADRANT_MIN, QUADRANT_MAX] : localXRange,
          useWholeQuadrant ? [QUADRANT_MIN, QUADRANT_MAX] : localZRange,
          random,
          !maximumHeightAssigned && kind === 'sastrugi',
        );
        if (candidateIsClear(candidate, exclusions, accepted)) selected = candidate;
      }

      if (!selected) {
        throw new Error(`winter ground relief could not place ${kind} in the ${quadrant.name} quadrant; exclusions leave insufficient clear ground`);
      }
      if (selected.height === MAX_PATCH_HEIGHT) maximumHeightAssigned = true;
      accepted.push(selected);
    }
  }

  return Object.freeze(accepted.map((placement) => Object.freeze(placement)));
}

function staticAttribute(values: Float32Array, itemSize: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(values, itemSize).setUsage(THREE.StaticDrawUsage);
}

function createPatchGeometry(): { geometry: THREE.BufferGeometry; surface: PatchSurface } {
  const vertexCount = RIBBON_COUNT * ALONG_COUNT * CROSS_COUNT;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const localHeights = new Float32Array(vertexCount);
  const localX = new Float32Array(vertexCount);
  const localZ = new Float32Array(vertexCount);
  const indices = new Uint16Array(RIBBON_COUNT * (ALONG_COUNT - 1) * (CROSS_COUNT - 1) * 6);
  const xStations = [-.5, -.355, -.185, 0, .175, .35, .5] as const;
  const envelope = [0, .38, .78, 1, .84, .44, 0] as const;
  const ribbonCentres = [-.31, 0, .3] as const;
  const crossOffsets = [-.105, -.032, .034, .102] as const;
  let positionOffset = 0;
  let uvOffset = 0;
  for (let ribbon = 0; ribbon < RIBBON_COUNT; ribbon += 1) {
    for (let along = 0; along < ALONG_COUNT; along += 1) {
      for (let cross = 0; cross < CROSS_COUNT; cross += 1) {
        const vertex = ribbon * ALONG_COUNT * CROSS_COUNT + along * CROSS_COUNT + cross;
        const outerFoot = along === 0 || along === ALONG_COUNT - 1 || cross === 0 || cross === CROSS_COUNT - 1;
        const crestStrength = cross === 1 ? 1 : .57;
        const ribbonStrength = ribbon === 0 ? 1 : ribbon === 1 ? .9 : .76;
        const leeAsymmetry = cross === 2 ? .91 + .045 * Math.sin(along * 1.63 + ribbon) : 1;
        const height = outerFoot
          ? LOCAL_RIM_HEIGHT
          : envelope[along]! * crestStrength * ribbonStrength * leeAsymmetry;
        const x = xStations[along]! + (cross === 1 ? -.006 : cross === 2 ? .009 : 0);
        const z = ribbonCentres[ribbon]! + crossOffsets[cross]!;
        const colour = outerFoot
          ? .985
          : THREE.MathUtils.clamp(.982 + Math.sin(along * 1.91 + cross * 2.17 + ribbon) * .017, .965, 1);
        localX[vertex] = x;
        localZ[vertex] = z;
        localHeights[vertex] = height;
        positions[positionOffset] = x;
        positions[positionOffset + 1] = height;
        positions[positionOffset + 2] = z;
        colors[positionOffset] = colour;
        colors[positionOffset + 1] = Math.min(1, colour + .006);
        colors[positionOffset + 2] = Math.min(1, colour + .012);
        uvs[uvOffset] = x + .5;
        uvs[uvOffset + 1] = z + .5;
        positionOffset += 3;
        uvOffset += 2;
      }
    }
  }

  let indexOffset = 0;
  for (let ribbon = 0; ribbon < RIBBON_COUNT; ribbon += 1) {
    const ribbonOffset = ribbon * ALONG_COUNT * CROSS_COUNT;
    for (let along = 0; along < ALONG_COUNT - 1; along += 1) {
      for (let cross = 0; cross < CROSS_COUNT - 1; cross += 1) {
        const lowerLeft = ribbonOffset + along * CROSS_COUNT + cross;
        const upperLeft = lowerLeft + 1;
        const lowerRight = lowerLeft + CROSS_COUNT;
        const upperRight = lowerRight + 1;
        indices[indexOffset] = lowerLeft;
        indices[indexOffset + 1] = upperLeft;
        indices[indexOffset + 2] = lowerRight;
        indices[indexOffset + 3] = lowerRight;
        indices[indexOffset + 4] = upperLeft;
        indices[indexOffset + 5] = upperRight;
        indexOffset += 6;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = 'WinterGroundReliefPatchGeometry';
  geometry.setAttribute('position', staticAttribute(positions, 3));
  geometry.setAttribute('uv', staticAttribute(uvs, 2));
  geometry.setAttribute('color', staticAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1).setUsage(THREE.StaticDrawUsage));
  geometry.computeVertexNormals();
  (geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.StaticDrawUsage);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    surface: Object.freeze({ localX, localZ, localHeight: localHeights, indices }),
  };
}

function cloneReliefMaterial(source: THREE.Material, fieldSize: number): THREE.Material {
  const material = source.clone();
  material.name = `${source.name || source.type}-WinterGroundRelief`;
  material.vertexColors = true;
  const inheritedCompile = material.onBeforeCompile.bind(material);
  const inheritedCacheKey = material.customProgramCacheKey.bind(material);
  const halfField = fieldSize * .5;
  const shaderPatch = `#include <uv_vertex>
#if defined( USE_MAP ) && defined( USE_INSTANCING )
  vec4 winterReliefWorldPosition = instanceMatrix * vec4( position, 1.0 );
  vMapUv = ( mapTransform * vec3( ( winterReliefWorldPosition.xz + vec2( ${halfField.toFixed(6)} ) ) / ${fieldSize.toFixed(6)}, 1.0 ) ).xy;
#endif`;
  material.onBeforeCompile = (shader, renderer): void => {
    inheritedCompile(shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', shaderPatch);
  };
  material.customProgramCacheKey = () => `${inheritedCacheKey()}|${WINTER_GROUND_RELIEF_PROGRAM_KEY}|${fieldSize}`;
  material.needsUpdate = true;
  material.userData.winterGroundReliefWorldUv = true;
  return material;
}

function instanceColour(kind: WinterGroundReliefPatchKind): THREE.Color {
  if (kind === 'wind-crust') return new THREE.Color(.995, .997, 1);
  if (kind === 'compacted') return new THREE.Color(.91, .925, .935);
  return new THREE.Color(.985, .992, 1);
}

function samplePatchHeight(surface: PatchSurface, x: number, z: number): number | undefined {
  if (x < -.5 || x > .5 || z < -.5 || z > .5) return undefined;
  for (let offset = 0; offset < surface.indices.length; offset += 3) {
    const first = surface.indices[offset]!;
    const second = surface.indices[offset + 1]!;
    const third = surface.indices[offset + 2]!;
    const ax = surface.localX[first]!;
    const az = surface.localZ[first]!;
    const bx = surface.localX[second]!;
    const bz = surface.localZ[second]!;
    const cx = surface.localX[third]!;
    const cz = surface.localZ[third]!;
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    const firstWeight = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
    const secondWeight = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
    const thirdWeight = 1 - firstWeight - secondWeight;
    if (firstWeight >= -1e-7 && secondWeight >= -1e-7 && thirdWeight >= -1e-7) {
      return firstWeight * surface.localHeight[first]!
        + secondWeight * surface.localHeight[second]!
        + thirdWeight * surface.localHeight[third]!;
    }
  }
  return undefined;
}

function createHeightSampler(
  placements: readonly Readonly<WinterGroundReliefPlacement>[],
  surface: PatchSurface,
): WinterGroundReliefHeightSampler {
  return Object.freeze({
    heightAt(x: number, z: number): number | undefined {
      finite(x, 'winter ground relief sample x');
      finite(z, 'winter ground relief sample z');
      for (const placement of placements) {
        const deltaX = x - placement.x;
        const deltaZ = z - placement.z;
        const cosine = Math.cos(placement.yaw);
        const sine = Math.sin(placement.yaw);
        const localX = deltaX * cosine - deltaZ * sine;
        const localZ = deltaX * sine + deltaZ * cosine;
        const sampled = samplePatchHeight(surface, localX / placement.length, localZ / placement.width);
        if (sampled === undefined) continue;
        return Math.max(0, sampled * placement.height);
      }
      return undefined;
    },
  });
}

export function createWinterGroundRelief(
  parent: THREE.Object3D,
  options: WinterGroundReliefOptions,
): WinterGroundRelief {
  if (!(parent instanceof THREE.Object3D)) {
    throw new TypeError('winter ground relief parent must be a THREE.Object3D');
  }
  if (!(options?.material instanceof THREE.Material)) {
    throw new TypeError('winter ground relief material must be a THREE.Material');
  }
  const seedHash = validateSeed(options.seed ?? 'russias-army-winter-ground-relief-v1');
  const exclusionPadding = finite(options.exclusionPadding ?? DEFAULT_EXCLUSION_PADDING, 'winter ground relief exclusion padding');
  if (exclusionPadding < 0) throw new RangeError('winter ground relief exclusion padding must not be negative');
  const fieldSize = finite(options.fieldSize ?? DEFAULT_FIELD_SIZE, 'winter ground relief field size');
  if (fieldSize < 120) throw new RangeError('winter ground relief field size must be at least 120 metres');
  const allExclusions = [
    ...(options.exclusions ?? []),
    ...(options.masks ?? []),
    ...(options.contactColliders ?? []),
  ];
  const exclusions = validateExclusions(allExclusions, exclusionPadding);
  const placements = createPlacements(mulberry32(seedHash), exclusions);
  if (placements.length !== PATCH_COUNT) throw new Error('winter ground relief placement contract was not satisfied');

  const { geometry, surface } = createPatchGeometry();
  const material = cloneReliefMaterial(options.material, fieldSize);
  const root = new THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>(geometry, material, PATCH_COUNT);
  root.name = options.name ?? 'WinterGroundRelief';
  root.castShadow = false;
  root.receiveShadow = true;
  root.frustumCulled = true;
  root.userData.presentationOnly = true;
  root.userData.authoritativeColliders = 'none';
  root.userData.perFrameUpdates = 0;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  placements.forEach((placement, index) => {
    position.set(placement.x, 0, placement.z);
    quaternion.setFromAxisAngle(up, placement.yaw);
    scale.set(placement.length, placement.height, placement.width);
    matrix.compose(position, quaternion, scale);
    root.setMatrixAt(index, matrix);
    root.setColorAt(index, instanceColour(placement.kind));
  });
  root.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  root.instanceMatrix.needsUpdate = true;
  root.instanceColor?.setUsage(THREE.StaticDrawUsage);
  if (root.instanceColor) root.instanceColor.needsUpdate = true;
  root.computeBoundingBox();
  root.computeBoundingSphere();
  parent.add(root);

  const stats = Object.freeze<WinterGroundReliefStats>({
    quality: 'high',
    patches: 88,
    sastrugiPatches: 64,
    windCrustPatches: 16,
    compactedPatches: 8,
    vertices: 84,
    submittedVertices: 7392,
    trianglesPerPatch: 108,
    submittedTriangles: 9504,
    drawCalls: 1,
    geometries: 1,
    ownedGeometries: 1,
    injectedMaterials: 1,
    ownedMaterials: 1,
    ownedTextures: 0,
    exclusions: exclusions.length,
    colliders: 0,
    perFrameUpdates: 0,
    minHeight: -0.01,
    maxHeight: 0.04,
  });
  const heightSampler = createHeightSampler(placements, surface);
  let disposed = false;

  return {
    root,
    stats,
    placements,
    heightSampler,
    setVisible(visible: boolean): void {
      if (typeof visible !== 'boolean') throw new TypeError('winter ground relief visibility must be boolean');
      root.visible = visible;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
