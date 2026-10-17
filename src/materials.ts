import * as THREE from 'three';

/** Procedural surface families used by the winter military arena. */
export type ArenaSurface =
  | 'cracked-concrete'
  | 'icy-asphalt'
  | 'painted-corrugated-steel'
  | 'worn-wood'
  | 'burlap'
  | 'snow'
  | 'dark-metal';

export interface ProceduralMaterialLibraryOptions {
  /** Changes every generated detail while remaining deterministic. */
  seed?: number | string;
  /** Texture edge length. 256 is a useful balance for repeated arena surfaces. */
  textureSize?: number;
  /** Usually `recommendedMaterialAnisotropy(renderer)`. */
  anisotropy?: number;
  /** Optional authored albedo textures; the library configures and owns clones. */
  albedoMaps?: Partial<Record<ArenaSurface, THREE.Texture>>;
}

export interface ProceduralMaterialOptions {
  /** Texture repeats in the local U and V axes. Defaults to [1, 1]. */
  repeat?: readonly [number, number];
  /** Multiplies the authored albedo, useful for painted surface variants. */
  tint?: THREE.ColorRepresentation;
  /** Optional per-material seed mixed with the library seed. */
  seed?: number | string;
  textureSize?: number;
  anisotropy?: number;
}

interface SurfacePixels {
  albedo: Uint8ClampedArray;
  height: Uint8ClampedArray;
  roughness: Uint8ClampedArray;
}

interface CachedMaterial {
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  textures: readonly THREE.Texture[];
}

interface PixelSample {
  color: readonly [number, number, number];
  height: number;
  roughness: number;
}

const DEFAULT_TEXTURE_SIZE = 256;
const DEFAULT_ANISOTROPY = 4;
const TAU = Math.PI * 2;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function hashSeed(value: number | string): number {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function mixSeed(a: number, b: number | string): number {
  return hashSeed(`${a}:${String(b)}`);
}

/** Stable integer-coordinate random value in [0, 1). */
function hash2(x: number, y: number, seed: number): number {
  let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ seed;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

/** Seamless value noise because lattice coordinates wrap at `frequency`. */
function valueNoise(u: number, v: number, frequency: number, seed: number): number {
  const px = u * frequency;
  const py = v * frequency;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const tx0 = px - x0;
  const ty0 = py - y0;
  const tx = tx0 * tx0 * (3 - 2 * tx0);
  const ty = ty0 * ty0 * (3 - 2 * ty0);
  const x1 = (x0 + 1) % frequency;
  const y1 = (y0 + 1) % frequency;
  const wrappedX0 = positiveModulo(x0, frequency);
  const wrappedY0 = positiveModulo(y0, frequency);
  const top = mix(hash2(wrappedX0, wrappedY0, seed), hash2(x1, wrappedY0, seed), tx);
  const bottom = mix(hash2(wrappedX0, y1, seed), hash2(x1, y1, seed), tx);
  return mix(top, bottom, ty);
}

function fbm(u: number, v: number, seed: number): number {
  return (
    valueNoise(u, v, 4, seed) * .5
    + valueNoise(u, v, 8, seed + 17) * .28
    + valueNoise(u, v, 16, seed + 41) * .15
    + valueNoise(u, v, 32, seed + 79) * .07
  );
}

/** Returns 0 in cell interiors and approaches 1 along seamless Voronoi borders. */
function cellularBorder(u: number, v: number, cells: number, seed: number): number {
  const px = u * cells;
  const py = v * cells;
  const baseX = Math.floor(px);
  const baseY = Math.floor(py);
  let nearest = Number.POSITIVE_INFINITY;
  let second = Number.POSITIVE_INFINITY;
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const cellX = baseX + offsetX;
      const cellY = baseY + offsetY;
      const wrappedX = positiveModulo(cellX, cells);
      const wrappedY = positiveModulo(cellY, cells);
      const pointX = cellX + .15 + hash2(wrappedX, wrappedY, seed) * .7;
      const pointY = cellY + .15 + hash2(wrappedX, wrappedY, seed + 911) * .7;
      const dx = pointX - px;
      const dy = pointY - py;
      const distance = dx * dx + dy * dy;
      if (distance < nearest) {
        second = nearest;
        nearest = distance;
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  return 1 - smoothstep(.015, .11, second - nearest);
}

function concreteSample(u: number, v: number, seed: number): PixelSample {
  const grain = fbm(u, v, seed);
  const aggregate = valueNoise(u, v, 64, seed + 131);
  const broadStain = valueNoise(u, v, 4, seed + 229);
  const crackNetwork = cellularBorder(u, v, 13, seed + 311);
  const crackBreakup = valueNoise(u, v, 24, seed + 367);
  const crackRegion = smoothstep(.64, .81, valueNoise(u, v, 5, seed + 419));
  const crack = smoothstep(.72, .96, crackNetwork * (.64 + crackBreakup * .34)) * crackRegion;
  const edgeDistance = Math.min(u, 1 - u, v, 1 - v);
  const formworkJoint = 1 - smoothstep(.012, .038, edgeDistance);
  const pinhole = smoothstep(.88, .97, valueNoise(u, v, 72, seed + 503));
  const dampEnvelope = .3 + Math.sin(v * Math.PI) ** 2 * .7;
  const dampStreak = smoothstep(.69, .84, fbm(u + .23, v, seed + 587)) * dampEnvelope;
  const fleck = smoothstep(.76, .95, aggregate);
  const base = 118 + grain * 24 - broadStain * 9 - crack * 52 - formworkJoint * 30 - dampStreak * 8;
  return {
    color: [base + fleck * 14 - pinhole * 16, base + 3 + fleck * 12 - pinhole * 15, base + 1 + fleck * 8 - pinhole * 14],
    height: clamp01(.46 + grain * .19 + fleck * .09 - crack * .42 - formworkJoint * .3 - pinhole * .16),
    roughness: clamp01(.78 + grain * .14 + crack * .06 + dampStreak * .05 - fleck * .04),
  };
}

function asphaltSample(u: number, v: number, seed: number): PixelSample {
  // Integer transforms preserve the one-unit period in both axes while giving
  // the aggregate a laid, traffic-direction grain instead of isotropic clouds.
  // Combining unrelated transforms also makes the 1.65x road repeat much less
  // legible at a distance without allocating another texture.
  const broad = fbm(u + .173, v + .319, seed);
  const laidAggregate = valueNoise(u * 2 + v, v, 48, seed + 101);
  const crossAggregate = valueNoise(u * 3 - v, u + v * 2, 32, seed + 149);
  const microAggregate = laidAggregate * .56 + crossAggregate * .44;
  const brightGrit = smoothstep(.79, .94, microAggregate);
  const darkGrit = smoothstep(.82, .96, 1 - laidAggregate) * (.45 + crossAggregate * .55);

  // Long, broken winter polish follows the road direction. Every coefficient
  // multiplying u/v is an integer, and the warp is periodic, so the ribbons
  // meet cleanly at every edge of the repeating tile.
  const polishWarp = valueNoise(u * 2 + v, -u + v, 6, seed + 211) - .5;
  const polishRibbon = Math.sin((u * 3 + v + polishWarp * .18) * TAU) * .5 + .5;
  const polishEnvelope = valueNoise(u * 2, v, 5, seed + 271) * .68
    + valueNoise(u, v, 8, seed + 307) * .32;
  const polishBreakup = valueNoise(u * 5 - v, u + v * 2, 9, seed + 337);
  const polish = smoothstep(.73, .91, polishRibbon * .46 + polishEnvelope * .43 + polishBreakup * .11);

  // Sparse cracks interrupt both the aggregate and polished areas. A broad
  // low-frequency gate prevents the cellular border from becoming a uniform
  // all-over web, while a second noise erodes its edges into believable chips.
  const crackNetwork = cellularBorder(u * 2 + v, -u + v, 9, seed + 401);
  const crackGate = smoothstep(.58, .78, valueNoise(u, v, 4, seed + 449));
  const crackBreakup = valueNoise(u * 2 - v, u + v, 18, seed + 487);
  const crack = smoothstep(.79, .96, crackNetwork * (.72 + crackBreakup * .28)) * crackGate;

  const trafficWear = Math.sin((u * 2 + v) * TAU + (broad - .5) * 1.2) * .5 + .5;
  // Keep overcast asphalt readable after its arena tint and ACES exposure.
  // Cracks remain visible through height/roughness, but no longer crush into
  // near-black networks in grazing views.
  const base = 70 + broad * 28 + trafficWear * 5 + brightGrit * 20 - darkGrit * 7 - crack * 18;
  return {
    color: [base + polish * 22, base + 4 + polish * 28, base + 6 + polish * 32],
    height: clamp01(.34 + broad * .14 + microAggregate * .27 + brightGrit * .06 - darkGrit * .04 - crack * .28 + polish * .025),
    roughness: clamp01(.72 + microAggregate * .16 + darkGrit * .05 + crack * .06 - polish * .44),
  };
}

function corrugatedSteelSample(u: number, v: number, seed: number): PixelSample {
  const wave = Math.cos(u * TAU * 10) * .5 + .5;
  const ridge = Math.pow(wave, .72);
  const mottling = fbm(u, v, seed);
  const verticalWear = valueNoise(u, v, 24, seed + 103);
  const edgeWear = smoothstep(.78, .96, verticalWear + ridge * .12);
  const rustField = fbm(u + .313, v + .117, seed + 191);
  const rust = smoothstep(.68, .82, rustField + valueNoise(u, v, 8, seed + 223) * .12);
  const seam = smoothstep(.965, .995, Math.abs(Math.sin(v * TAU * 4)));
  const paintR = 71 + mottling * 22 + ridge * 10;
  const paintG = 84 + mottling * 24 + ridge * 12;
  const paintB = 79 + mottling * 22 + ridge * 10;
  return {
    color: [
      mix(paintR + edgeWear * 36, 112, rust),
      mix(paintG + edgeWear * 35, 58, rust),
      mix(paintB + edgeWear * 34, 35, rust),
    ],
    height: clamp01(.18 + ridge * .66 + mottling * .06 - seam * .12),
    roughness: clamp01(.47 + mottling * .2 + rust * .3 - edgeWear * .14),
  };
}

function wornWoodSample(u: number, v: number, seed: number): PixelSample {
  const warp = valueNoise(u, v, 5, seed) * .13;
  const grainWave = Math.sin((u + warp) * TAU * 20 + Math.sin(v * TAU * 2) * 1.4) * .5 + .5;
  const fineGrain = Math.pow(grainWave, 3.2);
  const mottling = fbm(u, v, seed + 113);
  const plankDistance = Math.abs((v * 4 % 1) - .5) * 2;
  const plankGap = 1 - smoothstep(.025, .075, 1 - plankDistance);
  const knotField = valueNoise(u, v, 12, seed + 251);
  const knot = smoothstep(.82, .94, knotField) * (Math.sin(u * TAU * 28) * .5 + .5);
  const base = 74 + mottling * 45 + fineGrain * 24 - plankGap * 48 - knot * 25;
  return {
    color: [base + 18, base + 4, base - 10],
    height: clamp01(.38 + fineGrain * .18 + mottling * .2 - plankGap * .5 - knot * .13),
    roughness: clamp01(.72 + mottling * .2 + plankGap * .08),
  };
}

function burlapSample(u: number, v: number, seed: number): PixelSample {
  const warp = Math.pow(Math.abs(Math.sin(u * TAU * 22)), 7);
  const weft = Math.pow(Math.abs(Math.sin(v * TAU * 19)), 7);
  const overUnder = ((Math.floor(u * 44) + Math.floor(v * 38)) & 1) === 0 ? warp : weft;
  const weave = Math.max(warp, weft) * .58 + overUnder * .42;
  const fibreNoise = valueNoise(u, v, 64, seed + 71);
  const staining = fbm(u + .171, v + .293, seed + 149);
  const darkStain = smoothstep(.67, .83, staining + valueNoise(u, v, 7, seed + 233) * .1);
  const base = 91 + fibreNoise * 24 + weave * 29 - darkStain * 24;
  return {
    color: [base + 16, base + 12, base - 7],
    height: clamp01(.3 + weave * .48 + fibreNoise * .08 - darkStain * .08),
    roughness: clamp01(.84 + fibreNoise * .12 + darkStain * .04 - weave * .06),
  };
}

function snowSample(u: number, v: number, seed: number): PixelSample {
  const drift = valueNoise(u, v, 4, seed);
  const granules = valueNoise(u, v, 48, seed + 107);
  const packedField = fbm(u + .219, v + .411, seed + 197);
  const packed = smoothstep(.63, .78, packedField);
  const shadow = (1 - drift) * 17 + (1 - granules) * 7;
  return {
    color: [225 - shadow + packed * 8, 234 - shadow + packed * 8, 234 - shadow * .72 + packed * 10],
    height: clamp01(.42 + drift * .36 + granules * .13),
    roughness: clamp01(.9 - packed * .28 + granules * .08),
  };
}

function darkMetalSample(u: number, v: number, seed: number): PixelSample {
  const mottling = fbm(u, v, seed);
  const fine = valueNoise(u, v, 48, seed + 109);
  // Integer tile frequencies keep diagonal machining scratches seamless on both axes.
  const scratchWave = Math.abs(Math.sin((u * 18 + v * 2) * TAU));
  const scratchMask = valueNoise(u, v, 16, seed + 211);
  const scratch = smoothstep(.965, .995, scratchWave) * smoothstep(.66, .84, scratchMask);
  const oxidation = smoothstep(.69, .84, fbm(u + .19, v + .37, seed + 307));
  const base = 31 + mottling * 27 + fine * 5;
  return {
    color: [base + oxidation * 35 + scratch * 44, base + 7 + oxidation * 12 + scratch * 45, base + 6 + scratch * 42],
    height: clamp01(.46 + mottling * .13 + fine * .04 - scratch * .13),
    roughness: clamp01(.48 + mottling * .2 + oxidation * .24 - scratch * .25),
  };
}

function sampleSurface(surface: ArenaSurface, u: number, v: number, seed: number): PixelSample {
  switch (surface) {
    case 'cracked-concrete': return concreteSample(u, v, seed);
    case 'icy-asphalt': return asphaltSample(u, v, seed);
    case 'painted-corrugated-steel': return corrugatedSteelSample(u, v, seed);
    case 'worn-wood': return wornWoodSample(u, v, seed);
    case 'burlap': return burlapSample(u, v, seed);
    case 'snow': return snowSample(u, v, seed);
    case 'dark-metal': return darkMetalSample(u, v, seed);
  }
}

function writePixel(data: Uint8ClampedArray, index: number, red: number, green: number, blue: number): void {
  data[index] = Math.round(Math.max(0, Math.min(255, red)));
  data[index + 1] = Math.round(Math.max(0, Math.min(255, green)));
  data[index + 2] = Math.round(Math.max(0, Math.min(255, blue)));
  data[index + 3] = 255;
}

function generateSurfacePixels(surface: ArenaSurface, size: number, seed: number): SurfacePixels {
  const pixelCount = size * size * 4;
  const albedo = new Uint8ClampedArray(pixelCount);
  const height = new Uint8ClampedArray(pixelCount);
  const roughness = new Uint8ClampedArray(pixelCount);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sampling at pixel centres avoids duplicating an edge while the noise itself remains periodic.
      const sample = sampleSurface(surface, (x + .5) / size, (y + .5) / size, seed);
      const index = (y * size + x) * 4;
      writePixel(albedo, index, sample.color[0], sample.color[1], sample.color[2]);
      const heightValue = clamp01(sample.height) * 255;
      writePixel(height, index, heightValue, heightValue, heightValue);
      const roughnessValue = clamp01(sample.roughness) * 255;
      writePixel(roughness, index, roughnessValue, roughnessValue, roughnessValue);
    }
  }
  return { albedo, height, roughness };
}

function createCanvasTexture(
  pixels: Uint8ClampedArray,
  size: number,
  repeat: readonly [number, number],
  anisotropy: number,
  colorSpace: THREE.ColorSpace,
  name: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the procedural material canvas.');
  const imageData = context.createImageData(size, size);
  imageData.data.set(pixels);
  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = anisotropy;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function cloneAlbedoTexture(
  source: THREE.Texture,
  repeat: readonly [number, number],
  anisotropy: number,
  name: string,
): THREE.Texture {
  const texture = source.clone();
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = anisotropy;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makeMaterial(
  surface: ArenaSurface,
  map: THREE.Texture,
  bumpMap: THREE.CanvasTexture,
  roughnessMap: THREE.CanvasTexture,
  tint: THREE.Color,
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  const shared = { color: tint, map, bumpMap, roughnessMap };
  switch (surface) {
    case 'cracked-concrete':
      return new THREE.MeshStandardMaterial({ ...shared, name: 'PBR cracked concrete', roughness: 1, metalness: .01, bumpScale: .085 });
    case 'icy-asphalt':
      return new THREE.MeshPhysicalMaterial({
        ...shared, name: 'PBR icy asphalt', roughness: .82, metalness: .04, bumpScale: .055,
        clearcoat: .38, clearcoatRoughness: .24,
      });
    case 'painted-corrugated-steel':
      // Intact paint is dielectric; the old high metalness multiplied the dark
      // procedural albedo into near-black facades under the overcast sky.
      return new THREE.MeshStandardMaterial({ ...shared, name: 'PBR painted corrugated steel', roughness: .72, metalness: .16, bumpScale: .16 });
    case 'worn-wood':
      return new THREE.MeshStandardMaterial({ ...shared, name: 'PBR worn wood', roughness: .96, metalness: 0, bumpScale: .07 });
    case 'burlap':
      return new THREE.MeshStandardMaterial({ ...shared, name: 'PBR woven burlap', roughness: 1, metalness: 0, bumpScale: .12 });
    case 'snow':
      return new THREE.MeshPhysicalMaterial({
        ...shared, name: 'PBR snow', roughness: .94, metalness: 0, bumpScale: .095,
        sheen: .24, sheenColor: new THREE.Color(0xc8dbe3), sheenRoughness: .88,
      });
    case 'dark-metal':
      return new THREE.MeshStandardMaterial({ ...shared, name: 'PBR dark metal', roughness: .84, metalness: .78, bumpScale: .035 });
  }
}

function normalizeSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_TEXTURE_SIZE;
  return Math.max(32, Math.min(1024, Math.round(size)));
}

function normalizeAnisotropy(anisotropy: number): number {
  if (!Number.isFinite(anisotropy)) return DEFAULT_ANISOTROPY;
  return Math.max(1, Math.min(16, Math.round(anisotropy)));
}

/**
 * Returns a quality-conscious anisotropy setting limited by the active GPU.
 * Pass the result into the library constructor so every generated map agrees.
 */
export function recommendedMaterialAnisotropy(renderer: THREE.WebGLRenderer, preferred = 8): number {
  return Math.max(1, Math.min(preferred, renderer.capabilities.getMaxAnisotropy()));
}

/**
 * Owns and caches all generated textures and materials.
 *
 * `get()` returns a shared material; callers must not dispose it individually.
 * Dispose the library once when the arena is torn down. Disposal is idempotent.
 */
export class ProceduralMaterialLibrary {
  private readonly baseSeed: number;
  private readonly defaultTextureSize: number;
  private readonly defaultAnisotropy: number;
  private readonly albedoMaps: Partial<Record<ArenaSurface, THREE.Texture>>;
  private readonly cache = new Map<string, CachedMaterial>();
  private disposed = false;

  constructor(options: ProceduralMaterialLibraryOptions = {}) {
    this.baseSeed = hashSeed(options.seed ?? 'russias-army-winter-arena');
    this.defaultTextureSize = normalizeSize(options.textureSize ?? DEFAULT_TEXTURE_SIZE);
    this.defaultAnisotropy = normalizeAnisotropy(options.anisotropy ?? DEFAULT_ANISOTROPY);
    this.albedoMaps = options.albedoMaps ?? {};
  }

  get(surface: ArenaSurface, options: ProceduralMaterialOptions = {}): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
    if (this.disposed) throw new Error('This ProceduralMaterialLibrary has already been disposed.');
    const repeat: readonly [number, number] = options.repeat ?? [1, 1];
    if (!Number.isFinite(repeat[0]) || !Number.isFinite(repeat[1]) || repeat[0] <= 0 || repeat[1] <= 0) {
      throw new Error('Procedural material repeat values must be finite and greater than zero.');
    }
    const size = normalizeSize(options.textureSize ?? this.defaultTextureSize);
    const anisotropy = normalizeAnisotropy(options.anisotropy ?? this.defaultAnisotropy);
    const seed = options.seed === undefined ? mixSeed(this.baseSeed, surface) : mixSeed(this.baseSeed, options.seed);
    const tint = new THREE.Color(options.tint ?? 0xffffff);
    const tintKey = tint.getHexString(THREE.SRGBColorSpace);
    const albedoSource = this.albedoMaps[surface];
    const albedoKey = albedoSource ? `external:${albedoSource.uuid}` : 'procedural';
    const cacheKey = [surface, seed, size, anisotropy, repeat[0], repeat[1], tintKey, albedoKey].join(':');
    const cached = this.cache.get(cacheKey);
    if (cached) return cached.material;

    const pixels = generateSurfacePixels(surface, size, seed);
    const texturePrefix = `${surface}:${seed}`;
    const map = albedoSource
      ? cloneAlbedoTexture(albedoSource, repeat, anisotropy, `${texturePrefix}:external-albedo`)
      : createCanvasTexture(pixels.albedo, size, repeat, anisotropy, THREE.SRGBColorSpace, `${texturePrefix}:albedo`);
    const bumpMap = createCanvasTexture(pixels.height, size, repeat, anisotropy, THREE.NoColorSpace, `${texturePrefix}:height`);
    const roughnessMap = createCanvasTexture(pixels.roughness, size, repeat, anisotropy, THREE.NoColorSpace, `${texturePrefix}:roughness`);
    const material = makeMaterial(surface, map, bumpMap, roughnessMap, tint);
    material.userData.proceduralSurface = surface;
    material.userData.proceduralSeed = seed;
    this.cache.set(cacheKey, { material, textures: [map, bumpMap, roughnessMap] });
    return material;
  }

  /** Number of distinct shared material configurations currently allocated. */
  get size(): number {
    return this.cache.size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.cache.values()) {
      entry.material.dispose();
      for (const texture of entry.textures) texture.dispose();
    }
    this.cache.clear();
  }
}

export function createProceduralMaterialLibrary(options: ProceduralMaterialLibraryOptions = {}): ProceduralMaterialLibrary {
  return new ProceduralMaterialLibrary(options);
}
