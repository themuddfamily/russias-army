import * as THREE from 'three';

export type SnowFieldQuality = 'low' | 'high';

export interface SnowFieldMaskRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** World-space blend distance outside the rectangle. Defaults to four metres. */
  readonly feather?: number;
}

export interface SnowFieldPresentationOptions {
  readonly quality?: SnowFieldQuality;
  /** A safe integer or non-empty string; the same seed produces byte-stable attributes. */
  readonly seed?: number | string;
  /** Caller-owned and never disposed by this presentation. */
  readonly material: THREE.Material;
  /** Width and depth of the square field in world metres. Defaults to 180. */
  readonly size?: number;
  /** Areas such as roads and buildings where macro shading returns to neutral. */
  readonly masks?: readonly SnowFieldMaskRect[];
  readonly name?: string;
}

export interface SnowFieldPresentationStats {
  readonly quality: SnowFieldQuality;
  readonly vertices: number;
  readonly triangles: number;
  readonly drawCalls: 1;
  readonly geometries: 1;
  readonly ownedMaterials: 0;
  readonly ownedTextures: 0;
  readonly colliders: 0;
  readonly maxHeight: 0;
}

export interface SnowFieldPresentation {
  /** Decorative surface only; it intentionally has no collider or update method. */
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly stats: Readonly<SnowFieldPresentationStats>;
  /** Idempotently detaches the mesh and releases its geometry only. */
  dispose(): void;
}

interface MacroPhases {
  readonly broad: number;
  readonly medium: number;
  readonly fine: number;
  readonly colour: number;
}

interface ValidatedMask {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly feather: number;
}

const DEFAULT_SIZE = 180;
const DEFAULT_FEATHER = 4;
const FULL_TURN = Math.PI * 2;
const SEGMENTS: Readonly<Record<SnowFieldQuality, number>> = Object.freeze({ low: 1, high: 48 });

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
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

function validateSeed(seed: number | string): number {
  if (typeof seed === 'number' && (!Number.isSafeInteger(seed) || !Number.isFinite(seed))) {
    throw new RangeError('snow field seed must be a safe integer or non-empty string');
  }
  if (typeof seed !== 'number' && (typeof seed !== 'string' || seed.length === 0)) {
    throw new RangeError('snow field seed must be a safe integer or non-empty string');
  }
  return hashSeed(seed);
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function validateMasks(masks: readonly SnowFieldMaskRect[]): readonly ValidatedMask[] {
  return masks.map((mask, index) => {
    if (!mask || typeof mask !== 'object') throw new TypeError(`snow field mask ${index} must be a rectangle`);
    const minX = finite(mask.minX, `snow field mask ${index} minX`);
    const maxX = finite(mask.maxX, `snow field mask ${index} maxX`);
    const minZ = finite(mask.minZ, `snow field mask ${index} minZ`);
    const maxZ = finite(mask.maxZ, `snow field mask ${index} maxZ`);
    const feather = finite(mask.feather ?? DEFAULT_FEATHER, `snow field mask ${index} feather`);
    if (maxX <= minX || maxZ <= minZ) {
      throw new RangeError(`snow field mask ${index} maximums must be greater than minimums`);
    }
    if (feather < 0) throw new RangeError(`snow field mask ${index} feather must not be negative`);
    return Object.freeze({ minX, maxX, minZ, maxZ, feather });
  });
}

function smoothstep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function distanceOutsideRectangle(x: number, z: number, mask: ValidatedMask): number {
  const deltaX = Math.max(mask.minX - x, 0, x - mask.maxX);
  const deltaZ = Math.max(mask.minZ - z, 0, z - mask.maxZ);
  return Math.hypot(deltaX, deltaZ);
}

function presentationStrength(x: number, z: number, masks: readonly ValidatedMask[]): number {
  let strength = 1;
  for (const mask of masks) {
    const distance = distanceOutsideRectangle(x, z, mask);
    const maskStrength = mask.feather === 0 ? (distance === 0 ? 0 : 1) : smoothstep(distance / mask.feather);
    strength = Math.min(strength, maskStrength);
    if (strength === 0) break;
  }
  return strength;
}

function createPhases(seedHash: number): MacroPhases {
  const random = mulberry32(seedHash);
  return {
    broad: random() * FULL_TURN,
    medium: random() * FULL_TURN,
    fine: random() * FULL_TURN,
    colour: random() * FULL_TURN,
  };
}

/**
 * Returns derivatives of a visual-only three-scale snow-height function. The
 * function itself is deliberately never applied to vertex positions.
 */
function macroSlopes(x: number, z: number, phases: MacroPhases): readonly [number, number] {
  const broadWave = FULL_TURN / 31;
  const mediumWave = FULL_TURN / 17;
  const fineWave = FULL_TURN / 8.5;

  const broadArgument = (x * .94 + z * .34) * broadWave + phases.broad;
  const mediumArgument = (x * -.42 + z * .91) * mediumWave + phases.medium;
  const fineArgument = (x * .78 + z * .63) * fineWave + phases.fine;
  const broadDerivative = .38 * Math.cos(broadArgument) * broadWave;
  const mediumDerivative = .13 * Math.cos(mediumArgument) * mediumWave;
  const fineDerivative = .035 * Math.cos(fineArgument) * fineWave;

  return [
    broadDerivative * .94 + mediumDerivative * -.42 + fineDerivative * .78,
    broadDerivative * .34 + mediumDerivative * .91 + fineDerivative * .63,
  ];
}

function macroColour(x: number, z: number, phases: MacroPhases): readonly [number, number, number] {
  const broad = Math.sin((x * .86 + z * .51) * FULL_TURN / 31 + phases.colour);
  const medium = Math.cos((x * -.38 + z * .93) * FULL_TURN / 17 + phases.medium);
  const fine = Math.sin((x + z * .47) * FULL_TURN / 8.5 + phases.fine);
  const value = THREE.MathUtils.clamp(.969 + broad * .018 + medium * .009 + fine * .003, .939, .999);
  return [value * .974, value * .988, value];
}

function staticAttribute(values: Float32Array, itemSize: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(values, itemSize).setUsage(THREE.StaticDrawUsage);
}

function createGeometry(
  size: number,
  segments: number,
  phases: MacroPhases,
  masks: readonly ValidatedMask[],
): THREE.BufferGeometry {
  const verticesPerSide = segments + 1;
  const vertexCount = verticesPerSide * verticesPerSide;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(segments * segments * 6);
  const halfSize = size * .5;
  let positionOffset = 0;
  let uvOffset = 0;

  for (let zIndex = 0; zIndex <= segments; zIndex += 1) {
    const zMix = zIndex / segments;
    const z = THREE.MathUtils.lerp(-halfSize, halfSize, zMix);
    for (let xIndex = 0; xIndex <= segments; xIndex += 1) {
      const xMix = xIndex / segments;
      const x = THREE.MathUtils.lerp(-halfSize, halfSize, xMix);
      const strength = presentationStrength(x, z, masks);
      const [slopeX, slopeZ] = macroSlopes(x, z, phases);
      // Avoid signed zero so fully masked vertices are byte-exact neutral data.
      const normalX = strength === 0 ? 0 : -slopeX * strength;
      const normalZ = strength === 0 ? 0 : -slopeZ * strength;
      const inverseLength = 1 / Math.hypot(normalX, 1, normalZ);
      const [red, green, blue] = macroColour(x, z, phases);

      positions[positionOffset] = x;
      positions[positionOffset + 1] = 0;
      positions[positionOffset + 2] = z;
      normals[positionOffset] = normalX * inverseLength;
      normals[positionOffset + 1] = inverseLength;
      normals[positionOffset + 2] = normalZ * inverseLength;
      colors[positionOffset] = THREE.MathUtils.lerp(1, red, strength);
      colors[positionOffset + 1] = THREE.MathUtils.lerp(1, green, strength);
      colors[positionOffset + 2] = THREE.MathUtils.lerp(1, blue, strength);
      uvs[uvOffset] = xMix;
      uvs[uvOffset + 1] = zMix;
      positionOffset += 3;
      uvOffset += 2;
    }
  }

  let indexOffset = 0;
  for (let zIndex = 0; zIndex < segments; zIndex += 1) {
    for (let xIndex = 0; xIndex < segments; xIndex += 1) {
      const lowerLeft = zIndex * verticesPerSide + xIndex;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + verticesPerSide;
      const upperRight = upperLeft + 1;
      // XZ geometry needs reversed plane winding for a +Y geometric normal.
      indices[indexOffset] = lowerLeft;
      indices[indexOffset + 1] = upperLeft;
      indices[indexOffset + 2] = lowerRight;
      indices[indexOffset + 3] = lowerRight;
      indices[indexOffset + 4] = upperLeft;
      indices[indexOffset + 5] = upperRight;
      indexOffset += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = 'FlatMacroSnowFieldGeometry';
  geometry.setAttribute('position', staticAttribute(positions, 3));
  geometry.setAttribute('normal', staticAttribute(normals, 3));
  geometry.setAttribute('uv', staticAttribute(uvs, 2));
  geometry.setAttribute('color', staticAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1).setUsage(THREE.StaticDrawUsage));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSnowFieldPresentation(
  parent: THREE.Object3D,
  options: SnowFieldPresentationOptions,
): SnowFieldPresentation {
  if (!(parent instanceof THREE.Object3D)) throw new TypeError('snow field parent must be a THREE.Object3D');
  const quality = options?.quality ?? 'high';
  if (quality !== 'low' && quality !== 'high') throw new RangeError('snow field quality must be low or high');
  if (!(options?.material instanceof THREE.Material)) {
    throw new TypeError('snow field material must be a THREE.Material');
  }
  const size = finite(options.size ?? DEFAULT_SIZE, 'snow field size');
  if (size <= 0) throw new RangeError('snow field size must be greater than zero');
  const seedHash = validateSeed(options.seed ?? 'russias-army-macro-snow-v1');
  const masks = validateMasks(options.masks ?? []);
  const segments = SEGMENTS[quality];
  const geometry = createGeometry(size, segments, createPhases(seedHash), masks);
  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(geometry, options.material);
  mesh.name = options.name ?? 'SnowFieldPresentation';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  mesh.userData.presentationOnly = true;
  mesh.userData.authoritativeColliders = 'none';
  parent.add(mesh);

  const vertices = (segments + 1) ** 2;
  const stats = Object.freeze<SnowFieldPresentationStats>({
    quality,
    vertices,
    triangles: segments * segments * 2,
    drawCalls: 1,
    geometries: 1,
    ownedMaterials: 0,
    ownedTextures: 0,
    colliders: 0,
    maxHeight: 0,
  });
  let disposed = false;

  return {
    mesh,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
    },
  };
}
