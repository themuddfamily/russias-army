import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WeaponMaterialLibrary } from './weaponMaterials';

function bytes(texture: THREE.DataTexture): Uint8Array {
  return texture.image.data as Uint8Array;
}

describe('WeaponMaterialLibrary', () => {
  it('provides a cached drop-in first-person palette backed by four texture sets', () => {
    const library = new WeaponMaterialLibrary({ seed: 'palette', textureSize: 32 });
    const palette = library.viewModelPalette();
    const again = library.viewModelPalette();

    expect(Object.keys(palette)).toEqual([
      'gunmetal', 'darkMetal', 'edgeMetal', 'polymer', 'olive', 'wood',
    ]);
    expect(again.gunmetal).toBe(palette.gunmetal);
    expect(again.darkMetal).toBe(palette.darkMetal);
    expect(again.edgeMetal).toBe(palette.edgeMetal);
    expect(palette.darkMetal.map).toBe(palette.gunmetal.map);
    expect(palette.edgeMetal.roughnessMap).toBe(palette.gunmetal.roughnessMap);
    expect(library.size).toBe(6);
    expect(library.textureSetCount).toBe(4);

    expect(palette.gunmetal.metalness).toBeGreaterThan(.8);
    expect(palette.polymer.metalness).toBeLessThan(.1);
    expect(palette.wood.metalness).toBeLessThan(.1);
    expect(palette.olive.metalness).toBeLessThan(.2);
    library.dispose();
  });

  it('supports a subdued legacy finish without changing the modern palette or duplicating textures', () => {
    const library = new WeaponMaterialLibrary({ textureSize: 32 });
    const legacy = library.viewModelPalette('legacy');
    const modern = library.viewModelPalette('modern');
    expect(legacy.gunmetal.metalness).toBeLessThan(modern.gunmetal.metalness);
    expect(legacy.edgeMetal.roughness).toBeGreaterThan(modern.edgeMetal.roughness);
    expect(legacy.wood.metalness).toBe(0);
    expect(legacy.gunmetal.map).toBe(modern.gunmetal.map);
    expect(legacy.wood.map).toBe(modern.wood.map);
    expect(library.textureSetCount).toBe(4);
    expect(library.viewModelPalette('legacy').gunmetal).toBe(legacy.gunmetal);
    library.dispose();
  });

  it('generates deterministic maps for equal seeds and different detail for changed seeds', () => {
    const first = new WeaponMaterialLibrary({ seed: 'stable', textureSize: 32 });
    const second = new WeaponMaterialLibrary({ seed: 'stable', textureSize: 32 });
    const changed = new WeaponMaterialLibrary({ seed: 'changed', textureSize: 32 });
    const firstWood = first.get('worn-wood');
    const secondWood = second.get('worn-wood');
    const changedWood = changed.get('worn-wood');

    expect(firstWood).not.toBe(secondWood);
    expect(bytes(firstWood.map as THREE.DataTexture)).toEqual(bytes(secondWood.map as THREE.DataTexture));
    expect(bytes(firstWood.roughnessMap as THREE.DataTexture)).toEqual(bytes(secondWood.roughnessMap as THREE.DataTexture));
    expect(bytes(firstWood.bumpMap as THREE.DataTexture)).toEqual(bytes(secondWood.bumpMap as THREE.DataTexture));
    expect(bytes(firstWood.map as THREE.DataTexture)).not.toEqual(bytes(changedWood.map as THREE.DataTexture));
    expect(firstWood.userData.proceduralSeed).toBe(secondWood.userData.proceduralSeed);
    expect(firstWood.userData.proceduralSeed).not.toBe(changedWood.userData.proceduralSeed);

    first.dispose();
    second.dispose();
    changed.dispose();
  });

  it('uses 256px bump-mapped high textures and a lean 128px low tier by default', () => {
    const high = new WeaponMaterialLibrary({ tier: 'high', anisotropy: 7 });
    const low = new WeaponMaterialLibrary({ tier: 'low', anisotropy: 3 });
    const highMetal = high.get('gunmetal');
    const lowMetal = low.get('gunmetal');
    const highMap = highMetal.map as THREE.DataTexture;
    const lowMap = lowMetal.map as THREE.DataTexture;

    expect(highMap.image.width).toBe(256);
    expect(highMap.image.height).toBe(256);
    expect(highMetal.bumpMap).toBeInstanceOf(THREE.DataTexture);
    expect(highMetal.bumpScale).toBeGreaterThan(0);
    expect(lowMap.image.width).toBe(128);
    expect(lowMap.image.height).toBe(128);
    expect(lowMetal.bumpMap).toBeNull();
    expect(lowMetal.bumpScale).toBe(0);

    for (const texture of [highMap, highMetal.roughnessMap as THREE.DataTexture, highMetal.bumpMap as THREE.DataTexture]) {
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);
      expect(texture.wrapT).toBe(THREE.RepeatWrapping);
      expect(texture.anisotropy).toBe(7);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(texture.magFilter).toBe(THREE.LinearFilter);
    }
    expect(highMap.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(highMetal.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(highMetal.bumpMap!.colorSpace).toBe(THREE.NoColorSpace);
    high.dispose();
    low.dispose();
  });

  it('uses a configured owned albedo clone while retaining procedural roughness and height', () => {
    const source = new THREE.Texture();
    source.colorSpace = THREE.NoColorSpace;
    source.wrapS = THREE.ClampToEdgeWrapping;
    source.repeat.set(8, 9);
    source.anisotropy = 1;
    source.magFilter = THREE.NearestFilter;
    source.minFilter = THREE.NearestFilter;
    source.generateMipmaps = false;
    const replacement = new THREE.Texture();
    const albedoMaps = { gunmetal: source };
    const library = new WeaponMaterialLibrary({ textureSize: 32, albedoMaps });
    const material = library.get('gunmetal', { repeat: [2.5, 3], anisotropy: 7 });
    const map = material.map!;

    expect(map).not.toBe(source);
    expect(map.source).toBe(source.source);
    expect(map).not.toBeInstanceOf(THREE.DataTexture);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(map.wrapS).toBe(THREE.RepeatWrapping);
    expect(map.wrapT).toBe(THREE.RepeatWrapping);
    expect(map.repeat.toArray()).toEqual([2.5, 3]);
    expect(map.anisotropy).toBe(7);
    expect(map.generateMipmaps).toBe(true);
    expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(map.magFilter).toBe(THREE.LinearFilter);
    expect(source.repeat.toArray()).toEqual([8, 9]);
    expect(source.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(source.colorSpace).toBe(THREE.NoColorSpace);
    expect(material.roughnessMap).toBeInstanceOf(THREE.DataTexture);
    expect(material.bumpMap).toBeInstanceOf(THREE.DataTexture);
    expect(bytes(material.roughnessMap as THREE.DataTexture).length).toBe(32 * 32 * 4);
    expect(bytes(material.bumpMap as THREE.DataTexture).length).toBe(32 * 32 * 4);

    albedoMaps.gunmetal = replacement;
    const changed = library.get('gunmetal', { repeat: [2.5, 3], anisotropy: 7 });
    expect(changed).not.toBe(material);
    expect(changed.map!.source).toBe(replacement.source);

    const cloneDispose = vi.spyOn(map, 'dispose');
    const sourceDispose = vi.spyOn(source, 'dispose');
    library.dispose();
    expect(cloneDispose).toHaveBeenCalledTimes(1);
    expect(sourceDispose).not.toHaveBeenCalled();
  });

  it('keeps non-finite texture-size fallbacks aligned with the selected tier', () => {
    const low = new WeaponMaterialLibrary({ tier: 'low', textureSize: Number.NaN });
    const high = new WeaponMaterialLibrary({ tier: 'high', textureSize: Number.POSITIVE_INFINITY });

    expect((low.get('polymer').map as THREE.DataTexture).image.width).toBe(128);
    expect((high.get('polymer').map as THREE.DataTexture).image.width).toBe(256);
    low.dispose();
    high.dispose();
  });

  it('shares maps across finishes while separating material-affecting configurations', () => {
    const library = new WeaponMaterialLibrary({ textureSize: 32 });
    const base = library.get('gunmetal');
    const tinted = library.get('gunmetal', { tint: 0x8899aa });
    const rough = library.get('gunmetal', { roughness: .8 });
    const variant = library.get('gunmetal', { seed: 'other' });
    const repeated = library.get('gunmetal', { repeat: [2, 1], textureSize: 48, anisotropy: 6 });

    expect(library.get('gunmetal')).toBe(base);
    expect(tinted).not.toBe(base);
    expect(rough).not.toBe(base);
    expect(tinted.map).toBe(base.map);
    expect(rough.roughnessMap).toBe(base.roughnessMap);
    expect(variant.map).not.toBe(base.map);
    expect(repeated.map).not.toBe(base.map);
    expect((repeated.map as THREE.DataTexture).image.width).toBe(48);
    expect(repeated.map!.repeat.toArray()).toEqual([2, 1]);
    expect(repeated.map!.anisotropy).toBe(6);
    library.dispose();
  });

  it('disposes every owned resource exactly once and rejects later use', () => {
    const library = new WeaponMaterialLibrary({ textureSize: 32 });
    const palette = library.viewModelPalette();
    const materials = Object.values(palette);
    const textures = new Set<THREE.Texture>();
    for (const material of materials) {
      if (material.map) textures.add(material.map);
      if (material.roughnessMap) textures.add(material.roughnessMap);
      if (material.bumpMap) textures.add(material.bumpMap);
    }
    const materialSpies = materials.map(material => vi.spyOn(material, 'dispose'));
    const textureSpies = [...textures].map(texture => vi.spyOn(texture, 'dispose'));

    library.dispose();
    library.dispose();

    expect(library.size).toBe(0);
    expect(library.textureSetCount).toBe(0);
    for (const spy of [...materialSpies, ...textureSpies]) expect(spy).toHaveBeenCalledTimes(1);
    expect(() => library.get('polymer')).toThrow(/already been disposed/i);
  });

  it('validates repeats and clamps configurable sampling values', () => {
    const library = new WeaponMaterialLibrary({ textureSize: 1, anisotropy: 99 });
    expect(() => library.get('paint', { repeat: [0, 1] })).toThrow(/greater than zero/i);
    expect(() => library.get('paint', { repeat: [Number.NaN, 1] })).toThrow(/finite/i);

    const paint = library.get('paint', { roughness: 4, metalness: -2 });
    expect((paint.map as THREE.DataTexture).image.width).toBe(32);
    expect(paint.map!.anisotropy).toBe(16);
    expect(paint.roughness).toBe(1);
    expect(paint.metalness).toBe(0);
    library.dispose();
  });
});
