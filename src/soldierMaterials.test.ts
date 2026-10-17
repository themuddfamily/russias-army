import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SoldierMaterialLibrary, type SoldierMaterialSurface } from './soldierMaterials';

const SURFACES: readonly SoldierMaterialSurface[] = [
  'fabric', 'armor', 'webbing', 'rubber', 'polymer', 'metal', 'wood', 'skin', 'lens',
  'silhouetteFabric', 'silhouetteArmor', 'silhouetteMetal', 'flashCore', 'flashFlare',
];

const TEXTURED_SURFACES: readonly SoldierMaterialSurface[] = [
  'fabric', 'armor', 'webbing', 'rubber', 'polymer', 'metal', 'wood', 'skin', 'lens',
];

const SNOW_SURFACES: readonly SoldierMaterialSurface[] = ['fabric', 'armor', 'webbing'];
const SNOW_EXCLUDED_SURFACES: readonly SoldierMaterialSurface[] = [
  'rubber', 'polymer', 'metal', 'wood', 'skin', 'lens',
  'silhouetteFabric', 'silhouetteArmor', 'silhouetteMetal', 'flashCore', 'flashFlare',
];

function bytes(texture: THREE.DataTexture): Uint8Array {
  return texture.image.data as Uint8Array;
}

describe('SoldierMaterialLibrary', () => {
  it('exposes one cached MeshStandardMaterial for every semantic soldier surface', () => {
    const library = new SoldierMaterialLibrary({ tier: 'low' });

    expect(Object.keys(library.materials)).toEqual(SURFACES);
    expect(library.materialCount).toBe(14);
    for (const surface of SURFACES) {
      expect(library.materials[surface]).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(library.get(surface)).toBe(library.materials[surface]);
      expect(library.materials[surface].vertexColors).toBe(true);
      expect(library.materials[surface].name).toBe(`soldier-${surface}`);
    }
    library.dispose();
  });

  it('keeps low tier entirely map-free while retaining legible scalar PBR finishes', () => {
    const library = new SoldierMaterialLibrary({ tier: 'low', textureSize: 256 });

    expect(library.textureSetCount).toBe(0);
    expect(library.textureCount).toBe(0);
    for (const material of Object.values(library.materials)) {
      expect(material.map).toBeNull();
      expect(material.roughnessMap).toBeNull();
      expect(material.normalMap).toBeNull();
      expect(material.bumpMap).toBeNull();
      expect(material.roughness).toBeGreaterThanOrEqual(0);
      expect(material.roughness).toBeLessThanOrEqual(1);
      expect(material.metalness).toBeGreaterThanOrEqual(0);
      expect(material.metalness).toBeLessThanOrEqual(1);
      expect(material.color.getHex()).not.toBe(0x000000);
    }
    expect(library.materials.metal.metalness).toBeCloseTo(.3);
    expect(library.materials.metal.roughness).toBeGreaterThan(.5);
    expect(library.materials.lens.transparent).toBe(false);
    expect(library.materials.fabric.roughness).toBeGreaterThan(.8);
    expect(library.materials.skin.metalness).toBe(0);
    library.dispose();
  });

  it('uses five shared high-tier albedo/roughness families and no special-effect maps', () => {
    const library = new SoldierMaterialLibrary({ tier: 'high', textureSize: 32 });

    expect(library.textureSetCount).toBe(5);
    expect(library.textureCount).toBe(10);
    for (const surface of TEXTURED_SURFACES) {
      expect(library.get(surface).map).toBeInstanceOf(THREE.DataTexture);
      expect(library.get(surface).roughnessMap).toBeInstanceOf(THREE.DataTexture);
    }
    expect(library.materials.fabric.map).toBe(library.materials.webbing.map);
    expect(library.materials.armor.map).toBe(library.materials.rubber.map);
    expect(library.materials.armor.map).toBe(library.materials.polymer.map);
    expect(library.materials.armor.map).toBe(library.materials.lens.map);
    expect(library.materials.metal.map).not.toBe(library.materials.armor.map);

    for (const surface of ['silhouetteFabric', 'silhouetteArmor', 'silhouetteMetal', 'flashCore', 'flashFlare'] as const) {
      expect(library.materials[surface].map).toBeNull();
      expect(library.materials[surface].roughnessMap).toBeNull();
    }
    library.dispose();
  });

  it('adds directional snow only to high-tier fabric, armor, and webbing', () => {
    const high = new SoldierMaterialLibrary({ tier: 'high', textureSize: 32 });
    const low = new SoldierMaterialLibrary({ tier: 'low' });

    expect(high.materialCount).toBe(14);
    expect(high.textureSetCount).toBe(5);
    expect(high.textureCount).toBe(10);
    expect(low.materialCount).toBe(14);
    expect(low.textureSetCount).toBe(0);
    expect(low.textureCount).toBe(0);

    const expectedCoverage: Partial<Record<SoldierMaterialSurface, number>> = {
      fabric: .3,
      armor: .24,
      webbing: .18,
    };
    for (const surface of SNOW_SURFACES) {
      const material = high.get(surface);
      expect(material.userData.snowAccumulation, surface).toBe(true);
      expect(material.userData.snowCoverage, surface).toBe(expectedCoverage[surface]);
      expect(material.userData.snowLayer, surface).toBe('soldier-directional-snow-v1');
      expect(material.customProgramCacheKey(), surface).toBe('soldier-directional-snow-v1');
    }
    for (const surface of SNOW_EXCLUDED_SURFACES) {
      const material = high.get(surface);
      expect(material.userData.snowAccumulation, surface).toBe(false);
      expect(material.userData.snowCoverage, surface).toBe(0);
      expect(material.userData.snowLayer, surface).toBeNull();
    }
    for (const surface of SURFACES) {
      const material = low.get(surface);
      expect(material.userData.snowAccumulation, surface).toBe(false);
      expect(material.userData.snowCoverage, surface).toBe(0);
      expect(material.userData.snowLayer, surface).toBeNull();
    }

    high.dispose();
    low.dispose();
  });

  it('injects deterministic world-up snow into diffuse, roughness, and metalness', () => {
    const library = new SoldierMaterialLibrary({ tier: 'high', textureSize: 16 });
    const material = library.materials.fabric;
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '',
      fragmentShader: '#include <common>\nvoid main() {\n#include <normal_fragment_maps>\n}',
    };

    (material.onBeforeCompile as unknown as (value: typeof shader) => void)(shader);

    expect(shader.uniforms.soldierSnowCoverage?.value).toBe(.3);
    expect(shader.fragmentShader).toContain('uniform float soldierSnowCoverage;');
    expect(shader.fragmentShader).toContain('mat3( viewMatrix )');
    expect(shader.fragmentShader).toContain('floor( vMapUv * 10.0 )');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = mix');
    expect(shader.fragmentShader).toContain('roughnessFactor = mix( roughnessFactor, 0.96');
    expect(shader.fragmentShader).toContain('metalnessFactor = mix( metalnessFactor, 0.0');
    expect(shader.fragmentShader.match(/#include <normal_fragment_maps>/g)).toHaveLength(1);

    const repeated = {
      ...shader,
      uniforms: {} as Record<string, { value: unknown }>,
      fragmentShader: '#include <common>\n#include <normal_fragment_maps>',
    };
    (material.onBeforeCompile as unknown as (value: typeof repeated) => void)(repeated);
    expect(repeated.fragmentShader).toContain('floor( vMapUv * 10.0 )');
    expect(repeated.uniforms.soldierSnowCoverage?.value).toBe(.3);
    library.dispose();
  });

  it('generates deterministic pixels for equal seeds and different pixels for changed seeds', () => {
    const first = new SoldierMaterialLibrary({ seed: 'stable', textureSize: 32 });
    const second = new SoldierMaterialLibrary({ seed: 'stable', textureSize: 32 });
    const changed = new SoldierMaterialLibrary({ seed: 'changed', textureSize: 32 });

    expect(first.materials.fabric).not.toBe(second.materials.fabric);
    expect(bytes(first.materials.fabric.map as THREE.DataTexture))
      .toEqual(bytes(second.materials.fabric.map as THREE.DataTexture));
    expect(bytes(first.materials.fabric.roughnessMap as THREE.DataTexture))
      .toEqual(bytes(second.materials.fabric.roughnessMap as THREE.DataTexture));
    expect(bytes(first.materials.fabric.map as THREE.DataTexture))
      .not.toEqual(bytes(changed.materials.fabric.map as THREE.DataTexture));
    expect(first.materials.fabric.userData.proceduralSeed)
      .toBe(second.materials.fabric.userData.proceduralSeed);
    expect(first.materials.fabric.userData.proceduralSeed)
      .not.toBe(changed.materials.fabric.userData.proceduralSeed);

    first.dispose();
    second.dispose();
    changed.dispose();
  });

  it('configures high-tier DataTextures for PBR color-space and filtered sampling', () => {
    const library = new SoldierMaterialLibrary({ tier: 'high', textureSize: 1, anisotropy: 99 });
    const material = library.materials.wood;
    const map = material.map as THREE.DataTexture;
    const roughnessMap = material.roughnessMap as THREE.DataTexture;

    expect(map.image.width).toBe(16);
    expect(map.image.height).toBe(16);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(roughnessMap.colorSpace).toBe(THREE.NoColorSpace);
    for (const texture of [map, roughnessMap]) {
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);
      expect(texture.wrapT).toBe(THREE.RepeatWrapping);
      expect(texture.anisotropy).toBe(16);
      expect(texture.magFilter).toBe(THREE.LinearFilter);
      expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(texture.generateMipmaps).toBe(true);
    }
    expect(material.roughness).toBeCloseTo(.7);
    expect(material.metalness).toBeCloseTo(.015);
    expect(library.materials.lens.transparent).toBe(true);
    expect(library.materials.lens.depthWrite).toBe(false);
    expect(library.materials.flashCore.emissiveIntensity).toBeGreaterThan(3);
    library.dispose();
  });

  it('uses reusable owned high-tier albedo clones while preserving procedural roughness and low-tier defaults', () => {
    const source = new THREE.Texture();
    source.colorSpace = THREE.NoColorSpace;
    source.wrapS = THREE.ClampToEdgeWrapping;
    source.wrapT = THREE.MirroredRepeatWrapping;
    source.repeat.set(7, 8);
    source.anisotropy = 1;
    source.magFilter = THREE.NearestFilter;
    source.minFilter = THREE.NearestFilter;
    source.generateMipmaps = false;
    const albedoMaps = { fabric: source, webbing: source };
    const high = new SoldierMaterialLibrary({ tier: 'high', textureSize: 16, anisotropy: 7, albedoMaps });
    const low = new SoldierMaterialLibrary({ tier: 'low', albedoMaps });
    const map = high.materials.fabric.map!;

    expect(map).not.toBe(source);
    expect(map.source).toBe(source.source);
    expect(map).not.toBeInstanceOf(THREE.DataTexture);
    expect(high.materials.webbing.map).toBe(map);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(map.wrapS).toBe(THREE.RepeatWrapping);
    expect(map.wrapT).toBe(THREE.RepeatWrapping);
    expect(map.repeat.toArray()).toEqual([1, 1]);
    expect(map.anisotropy).toBe(7);
    expect(map.generateMipmaps).toBe(true);
    expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(map.magFilter).toBe(THREE.LinearFilter);
    expect(source.repeat.toArray()).toEqual([7, 8]);
    expect(source.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(source.colorSpace).toBe(THREE.NoColorSpace);
    expect(high.materials.fabric.roughnessMap).toBeInstanceOf(THREE.DataTexture);
    expect(high.materials.fabric.roughnessMap).toBe(high.materials.webbing.roughnessMap);
    expect(bytes(high.materials.fabric.roughnessMap as THREE.DataTexture).length).toBe(16 * 16 * 4);
    expect(high.materials.fabric.roughness).toBeCloseTo(.88);

    expect(low.textureSetCount).toBe(0);
    expect(low.textureCount).toBe(0);
    for (const material of Object.values(low.materials)) {
      expect(material.map).toBeNull();
      expect(material.roughnessMap).toBeNull();
    }

    const cloneDispose = vi.spyOn(map, 'dispose');
    const sourceDispose = vi.spyOn(source, 'dispose');
    high.dispose();
    low.dispose();
    expect(cloneDispose).toHaveBeenCalledTimes(1);
    expect(sourceDispose).not.toHaveBeenCalled();
  });

  it('disposes every owned material and texture exactly once and rejects later use', () => {
    const library = new SoldierMaterialLibrary({ tier: 'high', textureSize: 16 });
    const materials = Object.values(library.materials);
    const textures = new Set<THREE.Texture>();
    for (const material of materials) {
      if (material.map) textures.add(material.map);
      if (material.roughnessMap) textures.add(material.roughnessMap);
    }
    const materialSpies = materials.map(material => vi.spyOn(material, 'dispose'));
    const textureSpies = [...textures].map(texture => vi.spyOn(texture, 'dispose'));

    library.dispose();
    library.dispose();

    expect(library.isDisposed).toBe(true);
    expect(library.materialCount).toBe(0);
    expect(library.textureSetCount).toBe(0);
    expect(library.textureCount).toBe(0);
    for (const spy of [...materialSpies, ...textureSpies]) expect(spy).toHaveBeenCalledTimes(1);
    expect(() => library.get('fabric')).toThrow(/already been disposed/i);
  });
});
