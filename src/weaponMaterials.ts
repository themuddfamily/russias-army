import * as THREE from 'three';

/** Procedural texture families used on camera-local first-person weapons. */
export type WeaponMaterialSurface = 'gunmetal' | 'polymer' | 'worn-wood' | 'paint';

export type WeaponMaterialTier = 'low' | 'high';

export interface WeaponMaterialLibraryOptions {
  /** Changes every generated detail while remaining deterministic. */
  seed?: number | string;
  /** High defaults to 256px; low defaults to 128px. */
  tier?: WeaponMaterialTier;
  /** Overrides the tier's square texture edge length. */
  textureSize?: number;
  /** Usually the renderer's supported anisotropy, clamped to 1-16. */
  anisotropy?: number;
  /** Optional authored albedos; configured clones are owned by the library. */
  albedoMaps?: Partial<Record<WeaponMaterialSurface, THREE.Texture>>;
}

export interface WeaponMaterialOptions {
  /** Texture repeats in local UV space. Defaults to [1, 1]. */
  repeat?: readonly [number, number];
  /** Multiplies the authored albedo without regenerating its texture set. */
  tint?: THREE.ColorRepresentation;
  /** Optional deterministic variation mixed with the library seed. */
  seed?: number | string;
  tier?: WeaponMaterialTier;
  textureSize?: number;
  anisotropy?: number;
  /** Overrides the authored scalar while retaining the procedural map. */
  roughness?: number;
  /** Overrides the authored metalness. */
  metalness?: number;
}

/** Drop-in replacements for the textured material keys in viewModelWeapons. */
export interface ViewModelWeaponMaterialPalette {
  gunmetal: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  edgeMetal: THREE.MeshStandardMaterial;
  polymer: THREE.MeshStandardMaterial;
  olive: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
}

interface SurfaceSample {
  color: readonly [number, number, number];
  height: number;
  roughness: number;
}

interface TextureSet {
  map: THREE.Texture;
  roughnessMap: THREE.DataTexture;
  bumpMap?: THREE.DataTexture;
}

interface Finish {
  roughness: number;
  metalness: number;
  bumpScale: number;
}

const TAU = Math.PI * 2;
const DEFAULT_SIZE: Record<WeaponMaterialTier, number> = { low: 128, high: 256 };

const FINISHES: Record<WeaponMaterialSurface, Finish> = {
  gunmetal: { roughness: .46, metalness: .86, bumpScale: .018 },
  polymer: { roughness: .8, metalness: .035, bumpScale: .026 },
  'worn-wood': { roughness: .72, metalness: .015, bumpScale: .038 },
  paint: { roughness: .68, metalness: .14, bumpScale: .022 },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
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
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function mixedSeed(base: number, value: number | string): number {
  return hashSeed(`${base}:${String(value)}`);
}

function hash2(x: number, y: number, seed: number): number {
  let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ seed;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

/** Periodic value noise; integer octave frequencies make every map tile cleanly. */
function valueNoise(u: number, v: number, frequency: number, seed: number): number {
  const px = u * frequency;
  const py = v * frequency;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const tx0 = px - x0;
  const ty0 = py - y0;
  const tx = tx0 * tx0 * (3 - 2 * tx0);
  const ty = ty0 * ty0 * (3 - 2 * ty0);
  const wrappedX = positiveModulo(x0, frequency);
  const wrappedY = positiveModulo(y0, frequency);
  const x1 = (wrappedX + 1) % frequency;
  const y1 = (wrappedY + 1) % frequency;
  const top = mix(hash2(wrappedX, wrappedY, seed), hash2(x1, wrappedY, seed), tx);
  const bottom = mix(hash2(wrappedX, y1, seed), hash2(x1, y1, seed), tx);
  return mix(top, bottom, ty);
}

function fbm(u: number, v: number, seed: number): number {
  return valueNoise(u, v, 4, seed) * .5
    + valueNoise(u, v, 8, seed + 19) * .28
    + valueNoise(u, v, 16, seed + 47) * .15
    + valueNoise(u, v, 32, seed + 83) * .07;
}

function gunmetalSample(u: number, v: number, seed: number): SurfaceSample {
  const mottle = fbm(u, v, seed);
  const grain = valueNoise(u, v, 64, seed + 109);
  const scratchWave = Math.abs(Math.sin((u * 24 + v * 2) * TAU));
  const scratch = smoothstep(.973, .997, scratchWave)
    * smoothstep(.57, .84, valueNoise(u, v, 16, seed + 211));
  const worn = smoothstep(.67, .85, fbm(u + .21, v + .37, seed + 307));
  // Keep blackened steel dark, but preserve enough midtone information for the
  // lean renderer where the weapon shares the arena's overcast light rig.
  const base = 68 + mottle * 28 + grain * 6;
  return {
    color: [base + worn * 18 + scratch * 48, base + 8 + worn * 15 + scratch * 50, base + 7 + worn * 12 + scratch * 47],
    height: clamp01(.49 + mottle * .1 + grain * .035 - scratch * .16),
    roughness: clamp01(.43 + mottle * .22 + worn * .12 - scratch * .3),
  };
}

function polymerSample(u: number, v: number, seed: number): SurfaceSample {
  const broad = fbm(u, v, seed);
  const stipple = valueNoise(u, v, 64, seed + 131);
  const molded = Math.abs(Math.sin(u * TAU * 32) * Math.sin(v * TAU * 32));
  const scuffWave = Math.abs(Math.sin((u * 7 - v * 23) * TAU));
  const scuff = smoothstep(.978, .998, scuffWave)
    * smoothstep(.64, .85, valueNoise(u, v, 12, seed + 229));
  const base = 62 + broad * 23 + stipple * 8 + molded * 3;
  return {
    color: [base - scuff * 8, base + 7 - scuff * 7, base + 3 - scuff * 6],
    height: clamp01(.39 + stipple * .23 + molded * .09 - scuff * .1),
    roughness: clamp01(.73 + stipple * .18 + scuff * .07),
  };
}

function woodSample(u: number, v: number, seed: number): SurfaceSample {
  const warp = valueNoise(u, v, 5, seed) * .1;
  const grainWave = Math.sin((u + warp) * TAU * 18 + Math.sin(v * TAU * 2) * 1.2) * .5 + .5;
  const grain = Math.pow(grainWave, 3.4);
  const mottle = fbm(u, v, seed + 127);
  const darkGrain = smoothstep(.86, .97, grain);
  const wear = smoothstep(.69, .84, fbm(u + .3, v + .17, seed + 251));
  const base = 66 + mottle * 38 + grain * 24 + wear * 12;
  return {
    color: [base + 31, base + 6 - darkGrain * 13, base - 17 - darkGrain * 20],
    height: clamp01(.38 + grain * .22 + mottle * .14 - darkGrain * .08),
    roughness: clamp01(.66 + mottle * .18 + darkGrain * .08 - wear * .08),
  };
}

function paintSample(u: number, v: number, seed: number): SurfaceSample {
  const mottle = fbm(u, v, seed);
  const fine = valueNoise(u, v, 48, seed + 113);
  const chipField = fbm(u + .16, v + .39, seed + 197)
    + valueNoise(u, v, 16, seed + 257) * .14;
  const chip = smoothstep(.75, .86, chipField);
  const scratchWave = Math.abs(Math.sin((u * 4 + v * 27) * TAU));
  const scratch = smoothstep(.982, .998, scratchWave)
    * smoothstep(.65, .87, valueNoise(u, v, 10, seed + 331));
  const exposed = Math.max(chip, scratch);
  const paintR = 72 + mottle * 25 + fine * 4;
  const paintG = 83 + mottle * 27 + fine * 4;
  const paintB = 67 + mottle * 20 + fine * 3;
  return {
    color: [mix(paintR, 92, exposed), mix(paintG, 96, exposed), mix(paintB, 92, exposed)],
    height: clamp01(.47 + mottle * .11 + fine * .035 - exposed * .16),
    roughness: clamp01(.58 + mottle * .2 + chip * .2 - scratch * .17),
  };
}

function sampleSurface(surface: WeaponMaterialSurface, u: number, v: number, seed: number): SurfaceSample {
  switch (surface) {
    case 'gunmetal': return gunmetalSample(u, v, seed);
    case 'polymer': return polymerSample(u, v, seed);
    case 'worn-wood': return woodSample(u, v, seed);
    case 'paint': return paintSample(u, v, seed);
  }
}

function writeColor(data: Uint8Array, offset: number, color: readonly [number, number, number]): void {
  data[offset] = Math.round(Math.max(0, Math.min(255, color[0])));
  data[offset + 1] = Math.round(Math.max(0, Math.min(255, color[1])));
  data[offset + 2] = Math.round(Math.max(0, Math.min(255, color[2])));
  data[offset + 3] = 255;
}

function writeGray(data: Uint8Array, offset: number, value: number): void {
  const byte = Math.round(clamp01(value) * 255);
  data[offset] = byte;
  data[offset + 1] = byte;
  data[offset + 2] = byte;
  data[offset + 3] = 255;
}

function generatePixels(surface: WeaponMaterialSurface, size: number, seed: number, includeHeight: boolean): {
  albedo: Uint8Array;
  roughness: Uint8Array;
  height?: Uint8Array;
} {
  const length = size * size * 4;
  const albedo = new Uint8Array(length);
  const roughness = new Uint8Array(length);
  const height = includeHeight ? new Uint8Array(length) : undefined;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sample = sampleSurface(surface, (x + .5) / size, (y + .5) / size, seed);
      const offset = (y * size + x) * 4;
      writeColor(albedo, offset, sample.color);
      writeGray(roughness, offset, sample.roughness);
      if (height) writeGray(height, offset, sample.height);
    }
  }
  return { albedo, roughness, height };
}

function createTexture(
  data: Uint8Array,
  size: number,
  repeat: readonly [number, number],
  anisotropy: number,
  colorSpace: THREE.ColorSpace,
  name: string,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
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

function normalizeSize(value: number, fallback = 256): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(32, Math.min(512, Math.round(value)));
}

function normalizeAnisotropy(value: number): number {
  if (!Number.isFinite(value)) return 4;
  return Math.max(1, Math.min(16, Math.round(value)));
}

function normalizeUnit(value: number, fallback: number): number {
  return Number.isFinite(value) ? clamp01(value) : fallback;
}

/**
 * Owns and caches procedural first-person weapon materials and their shared maps.
 *
 * Materials returned by `get()` and `viewModelPalette()` are library-owned and
 * must not be disposed individually. Call `dispose()` once with the weapon view.
 */
export class WeaponMaterialLibrary {
  private readonly baseSeed: number;
  private readonly defaultTier: WeaponMaterialTier;
  private readonly configuredSize?: number;
  private readonly defaultAnisotropy: number;
  private readonly albedoMaps: Partial<Record<WeaponMaterialSurface, THREE.Texture>>;
  private readonly textureSets = new Map<string, TextureSet>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private disposed = false;

  constructor(options: WeaponMaterialLibraryOptions = {}) {
    this.baseSeed = hashSeed(options.seed ?? 'russias-army-first-person-weapons');
    this.defaultTier = options.tier ?? 'high';
    this.configuredSize = options.textureSize === undefined
      ? undefined
      : normalizeSize(options.textureSize, DEFAULT_SIZE[this.defaultTier]);
    this.defaultAnisotropy = normalizeAnisotropy(options.anisotropy ?? 4);
    this.albedoMaps = options.albedoMaps ?? {};
  }

  get(surface: WeaponMaterialSurface, options: WeaponMaterialOptions = {}): THREE.MeshStandardMaterial {
    if (this.disposed) throw new Error('This WeaponMaterialLibrary has already been disposed.');
    const repeat: readonly [number, number] = options.repeat ?? [1, 1];
    if (!Number.isFinite(repeat[0]) || !Number.isFinite(repeat[1]) || repeat[0] <= 0 || repeat[1] <= 0) {
      throw new Error('Weapon material repeat values must be finite and greater than zero.');
    }

    const tier = options.tier ?? this.defaultTier;
    const size = normalizeSize(options.textureSize ?? this.configuredSize ?? DEFAULT_SIZE[tier], DEFAULT_SIZE[tier]);
    const anisotropy = normalizeAnisotropy(options.anisotropy ?? this.defaultAnisotropy);
    const seed = options.seed === undefined
      ? mixedSeed(this.baseSeed, surface)
      : mixedSeed(mixedSeed(this.baseSeed, surface), options.seed);
    const albedoSource = this.albedoMaps[surface];
    const albedoKey = albedoSource ? `external:${albedoSource.uuid}` : 'procedural';
    const textureKey = [surface, seed, tier, size, anisotropy, repeat[0], repeat[1], albedoKey].join(':');
    let textures = this.textureSets.get(textureKey);
    if (!textures) {
      const pixels = generatePixels(surface, size, seed, tier === 'high');
      const prefix = `weapon:${surface}:${seed}`;
      textures = {
        map: albedoSource
          ? cloneAlbedoTexture(albedoSource, repeat, anisotropy, `${prefix}:external-albedo`)
          : createTexture(pixels.albedo, size, repeat, anisotropy, THREE.SRGBColorSpace, `${prefix}:albedo`),
        roughnessMap: createTexture(pixels.roughness, size, repeat, anisotropy, THREE.NoColorSpace, `${prefix}:roughness`),
        bumpMap: pixels.height
          ? createTexture(pixels.height, size, repeat, anisotropy, THREE.NoColorSpace, `${prefix}:height`)
          : undefined,
      };
      this.textureSets.set(textureKey, textures);
    }

    const finish = FINISHES[surface];
    const tint = new THREE.Color(options.tint ?? 0xffffff);
    const roughness = normalizeUnit(options.roughness ?? finish.roughness, finish.roughness);
    const metalness = normalizeUnit(options.metalness ?? finish.metalness, finish.metalness);
    const materialKey = [textureKey, tint.getHexString(THREE.SRGBColorSpace), roughness, metalness].join(':');
    const cached = this.materials.get(materialKey);
    if (cached) return cached;

    const material = new THREE.MeshStandardMaterial({
      name: `PBR weapon ${surface}`,
      color: tint,
      map: textures.map,
      roughness,
      roughnessMap: textures.roughnessMap,
      metalness,
      bumpMap: textures.bumpMap ?? null,
      bumpScale: textures.bumpMap ? finish.bumpScale : 0,
    });
    material.userData.proceduralWeaponSurface = surface;
    material.userData.proceduralSeed = seed;
    material.userData.proceduralTier = tier;
    this.materials.set(materialKey, material);
    return material;
  }

  /**
   * Six shared materials matching `viewModelWeapons`' existing textured keys.
   * Repeated calls return the same material instances.
   */
  viewModelPalette(presentation: 'legacy' | 'modern' = 'modern'): ViewModelWeaponMaterialPalette {
    if (presentation === 'legacy') {
      // The low-resolution footage establishes gray steel and brown wood, not
      // exact reflectance. Use subdued finishes and omit modern shiny edging.
      return {
        gunmetal: this.get('gunmetal', { roughness: .82, metalness: .2 }),
        darkMetal: this.get('gunmetal', { tint: 0x91949a, roughness: .88, metalness: .18 }),
        edgeMetal: this.get('gunmetal', { tint: 0xc7cbd1, roughness: .75, metalness: .25 }),
        polymer: this.get('polymer', { tint: 0xb9bbc1, roughness: .9, metalness: 0 }),
        olive: this.get('paint', { roughness: .88, metalness: .05 }),
        wood: this.get('worn-wood', { roughness: .85, metalness: 0 }),
      };
    }
    return {
      gunmetal: this.get('gunmetal'),
      darkMetal: this.get('gunmetal', { tint: 0x737b78, roughness: .56, metalness: .8 }),
      edgeMetal: this.get('gunmetal', { tint: 0xc1cac6, roughness: .25, metalness: .92 }),
      polymer: this.get('polymer'),
      olive: this.get('paint'),
      wood: this.get('worn-wood'),
    };
  }

  /** Number of distinct shared material configurations currently allocated. */
  get size(): number {
    return this.materials.size;
  }

  /** Number of generated texture configurations (four families for a full palette). */
  get textureSetCount(): number {
    return this.textureSets.size;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of this.materials.values()) material.dispose();
    for (const textures of this.textureSets.values()) {
      textures.map.dispose();
      textures.roughnessMap.dispose();
      textures.bumpMap?.dispose();
    }
    this.materials.clear();
    this.textureSets.clear();
  }
}

export function createWeaponMaterialLibrary(options: WeaponMaterialLibraryOptions = {}): WeaponMaterialLibrary {
  return new WeaponMaterialLibrary(options);
}
