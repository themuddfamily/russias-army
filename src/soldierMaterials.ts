import * as THREE from 'three';

export type SoldierMaterialTier = 'low' | 'high';
export type SoldierPresentation = 'legacy' | 'modern';

export type SoldierMaterialSurface =
  | 'fabric'
  | 'armor'
  | 'webbing'
  | 'rubber'
  | 'polymer'
  | 'metal'
  | 'wood'
  | 'skin'
  | 'lens'
  | 'silhouetteFabric'
  | 'silhouetteArmor'
  | 'silhouetteMetal'
  | 'flashCore'
  | 'flashFlare';

export interface SoldierMaterialLibraryOptions {
  /** Legacy follows the visible Woodland uniform; modern retains archival winter kit. */
  presentation?: SoldierPresentation;
  /** Changes all procedural detail while keeping it deterministic. */
  seed?: number | string;
  /** Modern low is texture-free; legacy low retains a single camouflage family. */
  tier?: SoldierMaterialTier;
  /** Square edge length for high-tier procedural textures. Defaults to 128. */
  textureSize?: number;
  /** Texture anisotropy, clamped to the portable 1-16 range. */
  anisotropy?: number;
  /** Optional authored high-tier albedos; configured clones are library-owned. */
  albedoMaps?: Partial<Record<SoldierMaterialSurface, THREE.Texture>>;
}

export interface SoldierMaterialPalette {
  fabric: THREE.MeshStandardMaterial;
  armor: THREE.MeshStandardMaterial;
  webbing: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  polymer: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  lens: THREE.MeshStandardMaterial;
  silhouetteFabric: THREE.MeshStandardMaterial;
  silhouetteArmor: THREE.MeshStandardMaterial;
  silhouetteMetal: THREE.MeshStandardMaterial;
  flashCore: THREE.MeshStandardMaterial;
  flashFlare: THREE.MeshStandardMaterial;
}

type TextureFamily = 'fabric' | 'armor' | 'metal' | 'wood' | 'skin';

interface TextureSet {
  map?: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

interface MaterialDefinition {
  color: THREE.ColorRepresentation;
  roughness: number;
  metalness: number;
  family?: TextureFamily;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
}

interface FamilyDefinition {
  color: readonly [number, number, number];
  variation: number;
  roughness: number;
  roughnessVariation: number;
  frequency: number;
}

const SURFACES: readonly SoldierMaterialSurface[] = [
  'fabric',
  'armor',
  'webbing',
  'rubber',
  'polymer',
  'metal',
  'wood',
  'skin',
  'lens',
  'silhouetteFabric',
  'silhouetteArmor',
  'silhouetteMetal',
  'flashCore',
  'flashFlare',
];

const FAMILY_DEFINITIONS: Record<TextureFamily, FamilyDefinition> = {
  fabric: { color: [218, 222, 209], variation: 22, roughness: .82, roughnessVariation: .14, frequency: 28 },
  armor: { color: [213, 222, 214], variation: 18, roughness: .67, roughnessVariation: .16, frequency: 12 },
  metal: { color: [211, 216, 217], variation: 20, roughness: .43, roughnessVariation: .22, frequency: 36 },
  wood: { color: [225, 207, 182], variation: 28, roughness: .72, roughnessVariation: .17, frequency: 18 },
  skin: { color: [229, 210, 196], variation: 18, roughness: .69, roughnessVariation: .11, frequency: 10 },
};

const MATERIAL_DEFINITIONS: Record<SoldierMaterialSurface, MaterialDefinition> = {
  // Neutral bases are multiplied by per-vertex actor tints. That keeps one
  // material shared by every soldier while preserving uniforms, skin tones,
  // seeded variation, and team identifiers without material clones.
  fabric: { color: 0xffffff, roughness: .88, metalness: .01, family: 'fabric' },
  armor: { color: 0xffffff, roughness: .65, metalness: .08, family: 'armor' },
  webbing: { color: 0xffffff, roughness: .92, metalness: 0, family: 'fabric' },
  rubber: { color: 0xffffff, roughness: .86, metalness: .015, family: 'armor' },
  polymer: { color: 0xffffff, roughness: .76, metalness: .025, family: 'armor' },
  metal: { color: 0xffffff, roughness: .42, metalness: .78, family: 'metal' },
  wood: { color: 0xffffff, roughness: .7, metalness: .015, family: 'wood' },
  skin: { color: 0xffffff, roughness: .72, metalness: 0, family: 'skin' },
  lens: {
    color: 0xffffff,
    roughness: .18,
    metalness: .06,
    family: 'armor',
    transparent: true,
    opacity: .62,
    depthWrite: false,
  },
  silhouetteFabric: { color: 0xffffff, roughness: .95, metalness: 0 },
  silhouetteArmor: { color: 0xffffff, roughness: .8, metalness: .08 },
  silhouetteMetal: { color: 0xffffff, roughness: .57, metalness: .52 },
  flashCore: {
    color: 0xfff4c2,
    roughness: .34,
    metalness: 0,
    emissive: 0xffb328,
    emissiveIntensity: 3.2,
    transparent: true,
    opacity: .96,
    depthWrite: false,
  },
  flashFlare: {
    color: 0xff922e,
    roughness: .47,
    metalness: 0,
    emissive: 0xff560e,
    emissiveIntensity: 2.1,
    transparent: true,
    opacity: .72,
    depthWrite: false,
  },
};

/**
 * Macro-scale winter breakup for the upward-facing soft kit that otherwise
 * collapses into one olive value at gameplay distance. Hard equipment, skin,
 * optics, effects, and the far silhouette deliberately remain untreated.
 */
const SNOW_COVERAGE: Readonly<Partial<Record<SoldierMaterialSurface, number>>> = Object.freeze({
  fabric: .3,
  armor: .24,
  webbing: .18,
});

const SOLDIER_SNOW_PROGRAM_KEY = 'soldier-directional-snow-v1';

function installDirectionalSnow(
  material: THREE.MeshStandardMaterial,
  coverage: number,
): void {
  material.userData.snowAccumulation = true;
  material.userData.snowCoverage = coverage;
  material.userData.snowLayer = SOLDIER_SNOW_PROGRAM_KEY;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.soldierSnowCoverage = { value: coverage };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float soldierSnowCoverage;',
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>

        // The final standard-material normal is in view space. Transforming
        // world-up into the same space keeps accumulation fixed to gravity as
        // articulated limbs turn, aim, and recoil.
        vec3 soldierSnowUpView = normalize( mat3( viewMatrix ) * vec3( 0.0, 1.0, 0.0 ) );
        float soldierSnowFacing = smoothstep( 0.42, 0.88, dot( normal, soldierSnowUpView ) );

        // Quantised UV cells make broad, stable patches rather than shimmering
        // per-pixel noise. Included surfaces always own a high-tier color map,
        // so vMapUv is available without allocating another texture or varying.
        vec2 soldierSnowCell = floor( vMapUv * 10.0 );
        float soldierSnowNoise = fract(
          sin( dot( soldierSnowCell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453
        );
        float soldierSnowBreakup = mix( 0.58, 1.0, smoothstep( 0.12, 0.88, soldierSnowNoise ) );
        float soldierSnowMask = clamp(
          soldierSnowCoverage * soldierSnowFacing * soldierSnowBreakup,
          0.0,
          1.0
        );

        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.72, 0.78, 0.79 ), soldierSnowMask );
        roughnessFactor = mix( roughnessFactor, 0.96, soldierSnowMask );
        metalnessFactor = mix( metalnessFactor, 0.0, soldierSnowMask );`,
      );
  };
  material.customProgramCacheKey = () => SOLDIER_SNOW_PROGRAM_KEY;
  material.needsUpdate = true;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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

function hash2(x: number, y: number, seed: number): number {
  let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ seed;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function normalizeSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 128;
  return Math.max(16, Math.min(256, Math.round(value)));
}

function normalizeAnisotropy(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 4;
  return Math.max(1, Math.min(16, Math.round(value)));
}

function writeColor(data: Uint8Array, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function writeGray(data: Uint8Array, offset: number, value: number): void {
  const byte = Math.round(clamp01(value) * 255);
  writeColor(data, offset, byte, byte, byte);
}

function makeTexture(
  data: Uint8Array,
  size: number,
  anisotropy: number,
  colorSpace: THREE.ColorSpace,
  name: string,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function cloneAlbedoTexture(
  source: THREE.Texture,
  anisotropy: number,
): THREE.Texture {
  const texture = source.clone();
  texture.name = `soldier-external-${source.uuid}-albedo`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = anisotropy;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makeTextureSet(
  family: TextureFamily,
  size: number,
  anisotropy: number,
  seed: number,
  includeAlbedo: boolean,
  presentation: SoldierPresentation,
): TextureSet {
  const definition = FAMILY_DEFINITIONS[family];
  const length = size * size * 4;
  const albedo = includeAlbedo ? new Uint8Array(length) : undefined;
  const roughness = new Uint8Array(length);
  const familySeed = hashSeed(`${seed}:${family}`);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const u = (x + .5) / size;
      const v = (y + .5) / size;
      const broad = Math.sin((u * definition.frequency + v * 2.3) * Math.PI * 2) * .5;
      const cross = Math.cos((v * definition.frequency * .63 - u * 1.7) * Math.PI * 2) * .5;
      const grain = hash2(x, y, familySeed) - .5;
      const detail = broad * .42 + cross * .18 + grain * .4;
      const colorVariation = detail * definition.variation;
      if (albedo && presentation === 'legacy' && family === 'fabric') {
        // Broad irregular pale khaki/olive islands seen in the Woodland still.
        // This is a reference approximation, not an identified real uniform.
        const warpedX = u * 7 + Math.sin(v * 19) * .55;
        const warpedY = v * 9 + Math.sin(u * 23) * .45;
        const patch = hash2(Math.floor(warpedX), Math.floor(warpedY), familySeed);
        const colors = patch < .24 ? [116, 126, 98] : patch < .53 ? [172, 174, 145] : patch < .82 ? [210, 207, 180] : [145, 151, 130];
        writeColor(albedo, offset, colors[0] + grain * 9, colors[1] + grain * 9, colors[2] + grain * 9);
      } else if (albedo) {
        writeColor(
          albedo,
          offset,
          definition.color[0] + colorVariation,
          definition.color[1] + colorVariation * .92,
          definition.color[2] + colorVariation * .8,
        );
      }
      writeGray(
        roughness,
        offset,
        definition.roughness + detail * definition.roughnessVariation,
      );
    }
  }

  return {
    map: albedo
      ? makeTexture(albedo, size, anisotropy, THREE.SRGBColorSpace, `soldier-${family}-albedo`)
      : undefined,
    roughnessMap: makeTexture(
      roughness,
      size,
      anisotropy,
      THREE.NoColorSpace,
      `soldier-${family}-roughness`,
    ),
  };
}

/**
 * Owns the shared materials used by world-space soldier models.
 *
 * Modern low tier allocates no textures; legacy low retains camouflage. High allocates five
 * deterministic roughness families and shares generated albedos where needed.
 * Returned resources are library-owned; dispose the library rather than an
 * individual material.
 */
export class SoldierMaterialLibrary {
  readonly tier: SoldierMaterialTier;
  readonly presentation: SoldierPresentation;
  readonly materials: Readonly<SoldierMaterialPalette>;

  private readonly materialStore = new Map<SoldierMaterialSurface, THREE.MeshStandardMaterial>();
  private readonly textureSets = new Map<TextureFamily, TextureSet>();
  private readonly externalAlbedoMaps = new Map<string, THREE.Texture>();
  private disposed = false;

  constructor(options: SoldierMaterialLibraryOptions = {}) {
    this.tier = options.tier ?? 'high';
    this.presentation = options.presentation ?? 'modern';
    const size = normalizeSize(options.textureSize);
    const anisotropy = normalizeAnisotropy(options.anisotropy);
    const seed = hashSeed(options.seed ?? 'russias-army-soldiers');
    const albedoMaps = options.albedoMaps ?? {};
    const proceduralAlbedoFamilies = new Set<TextureFamily>();
    if (this.tier === 'high' || this.presentation === 'legacy') {
      for (const surface of SURFACES) {
        const family = MATERIAL_DEFINITIONS[surface].family;
        if (family && (this.presentation === 'legacy' || !albedoMaps[surface])) proceduralAlbedoFamilies.add(family);
      }
    }

    for (const surface of SURFACES) {
      const definition = MATERIAL_DEFINITIONS[surface];
      let textureSet: TextureSet | undefined;
      if (definition.family && (this.tier === 'high' || (this.presentation === 'legacy' && definition.family === 'fabric'))) {
        textureSet = this.textureSets.get(definition.family);
        if (!textureSet) {
          textureSet = makeTextureSet(
            definition.family,
            size,
            anisotropy,
            seed,
            proceduralAlbedoFamilies.has(definition.family),
            this.presentation,
          );
          this.textureSets.set(definition.family, textureSet);
        }
      }

      let map: THREE.Texture | null = textureSet?.map ?? null;
      const albedoSource = this.tier === 'high' && this.presentation === 'modern' ? albedoMaps[surface] : undefined;
      if (albedoSource) {
        map = this.externalAlbedoMaps.get(albedoSource.uuid) ?? null;
        if (!map) {
          map = cloneAlbedoTexture(albedoSource, anisotropy);
          this.externalAlbedoMaps.set(albedoSource.uuid, map);
        }
      }

      const material = new THREE.MeshStandardMaterial({
        name: `soldier-${surface}`,
        color: definition.color,
        roughness: this.tier === 'low' && surface === 'metal' ? .56 : definition.roughness,
        metalness: this.tier === 'low' && surface === 'metal' ? .3 : definition.metalness,
        map,
        roughnessMap: textureSet?.roughnessMap ?? null,
        vertexColors: true,
        emissive: definition.emissive ?? 0x000000,
        emissiveIntensity: definition.emissiveIntensity ?? 1,
        transparent: this.tier === 'low' && surface === 'lens' ? false : definition.transparent ?? false,
        opacity: this.tier === 'low' && surface === 'lens' ? 1 : definition.opacity ?? 1,
        depthWrite: this.tier === 'low' && surface === 'lens' ? true : definition.depthWrite ?? true,
      });
      material.userData.soldierSurface = surface;
      material.userData.textureFamily = definition.family ?? null;
      material.userData.proceduralSeed = seed;
      material.userData.qualityTier = this.tier;
      material.userData.snowAccumulation = false;
      material.userData.snowCoverage = 0;
      material.userData.snowLayer = null;
      const snowCoverage = this.tier === 'high' && this.presentation === 'modern' ? SNOW_COVERAGE[surface] : undefined;
      material.userData.presentation = this.presentation;
      if (snowCoverage !== undefined) installDirectionalSnow(material, snowCoverage);
      this.materialStore.set(surface, material);
    }

    this.materials = Object.freeze({
      fabric: this.required('fabric'),
      armor: this.required('armor'),
      webbing: this.required('webbing'),
      rubber: this.required('rubber'),
      polymer: this.required('polymer'),
      metal: this.required('metal'),
      wood: this.required('wood'),
      skin: this.required('skin'),
      lens: this.required('lens'),
      silhouetteFabric: this.required('silhouetteFabric'),
      silhouetteArmor: this.required('silhouetteArmor'),
      silhouetteMetal: this.required('silhouetteMetal'),
      flashCore: this.required('flashCore'),
      flashFlare: this.required('flashFlare'),
    });
  }

  get materialCount(): number {
    return this.materialStore.size;
  }

  get textureSetCount(): number {
    return this.textureSets.size;
  }

  get textureCount(): number {
    let count = this.externalAlbedoMaps.size;
    for (const textureSet of this.textureSets.values()) {
      count += textureSet.map ? 2 : 1;
    }
    return count;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Returns the shared semantic material for a soldier surface. */
  get(surface: SoldierMaterialSurface): THREE.MeshStandardMaterial {
    if (this.disposed) throw new Error('This SoldierMaterialLibrary has already been disposed.');
    return this.required(surface);
  }

  /** Disposes all owned resources exactly once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of this.materialStore.values()) material.dispose();
    for (const textureSet of this.textureSets.values()) {
      textureSet.map?.dispose();
      textureSet.roughnessMap.dispose();
    }
    for (const texture of this.externalAlbedoMaps.values()) texture.dispose();
    this.materialStore.clear();
    this.textureSets.clear();
    this.externalAlbedoMaps.clear();
  }

  private required(surface: SoldierMaterialSurface): THREE.MeshStandardMaterial {
    const material = this.materialStore.get(surface);
    if (!material) throw new Error(`Missing soldier material: ${surface}`);
    return material;
  }
}
