import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ProceduralMaterialLibrary,
  recommendedMaterialAnisotropy,
} from './materials';

/**
 * Vitest runs these unit tests without a browser DOM. The material library only
 * needs the tiny canvas subset below: allocating ImageData and accepting it.
 * Keeping the uploaded bytes also lets us verify determinism without asserting
 * environment-sensitive rendered colours.
 */
class TestCanvas {
  width = 0;
  height = 0;
  uploadedPixels?: Uint8ClampedArray;

  readonly context = {
    createImageData: (width: number, height: number): ImageData => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
      colorSpace: 'srgb',
    } as ImageData),
    putImageData: (image: ImageData): void => {
      this.uploadedPixels = new Uint8ClampedArray(image.data);
    },
  };

  getContext(kind: string): typeof this.context | null {
    return kind === '2d' ? this.context : null;
  }
}

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

beforeAll(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => tag === 'canvas' ? new TestCanvas() : {} },
  });
});

afterAll(() => {
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

function pixels(texture: THREE.Texture): Uint8ClampedArray {
  const uploaded = (texture.image as TestCanvas).uploadedPixels;
  expect(uploaded).toBeInstanceOf(Uint8ClampedArray);
  return uploaded!;
}

function channelValues(data: Uint8ClampedArray, channel = 0): number[] {
  const values: number[] = [];
  for (let index = channel; index < data.length; index += 4) values.push(data[index]);
  return values;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageRgbStep(
  data: Uint8ClampedArray,
  pairs: ReadonlyArray<readonly [number, number]>,
): number {
  let total = 0;
  for (const [firstPixel, secondPixel] of pairs) {
    const first = firstPixel * 4;
    const second = secondPixel * 4;
    total += (
      Math.abs(data[first] - data[second])
      + Math.abs(data[first + 1] - data[second + 1])
      + Math.abs(data[first + 2] - data[second + 2])
    ) / 3;
  }
  return total / Math.max(1, pairs.length);
}

function textureEdgeContinuity(data: Uint8ClampedArray, size: number): { seam: number; interior: number } {
  const seamPairs: Array<readonly [number, number]> = [];
  const interiorPairs: Array<readonly [number, number]> = [];
  for (let axis = 0; axis < size; axis++) {
    seamPairs.push([axis * size + size - 1, axis * size]);
    seamPairs.push([(size - 1) * size + axis, axis]);
    for (let step = 0; step < size - 1; step++) {
      interiorPairs.push([axis * size + step, axis * size + step + 1]);
      interiorPairs.push([step * size + axis, (step + 1) * size + axis]);
    }
  }
  return {
    seam: averageRgbStep(data, seamPairs),
    interior: averageRgbStep(data, interiorPairs),
  };
}

describe('ProceduralMaterialLibrary', () => {
  it('shares identical configurations while separating every material-affecting option', () => {
    const library = new ProceduralMaterialLibrary({ seed: 'cache', textureSize: 32, anisotropy: 2 });
    const base = library.get('cracked-concrete');

    expect(library.get('cracked-concrete')).toBe(base);
    expect(library.get('cracked-concrete', {})).toBe(base);
    expect(library.get('cracked-concrete', { repeat: [2, 1] })).not.toBe(base);
    expect(library.get('cracked-concrete', { tint: 0x8899aa })).not.toBe(base);
    expect(library.get('cracked-concrete', { seed: 'variant' })).not.toBe(base);
    expect(library.get('cracked-concrete', { textureSize: 48 })).not.toBe(base);
    expect(library.get('cracked-concrete', { anisotropy: 3 })).not.toBe(base);
    expect(library.get('snow')).not.toBe(base);
    expect(library.size).toBe(7);

    library.dispose();
  });

  it('configures repeating color and data maps with the requested sampling settings', () => {
    const library = new ProceduralMaterialLibrary({ textureSize: 40, anisotropy: 16 });
    const material = library.get('icy-asphalt', { repeat: [3.5, 2], anisotropy: 7 });
    const map = material.map!;
    const bumpMap = material.bumpMap!;
    const roughnessMap = material.roughnessMap!;

    for (const texture of [map, bumpMap, roughnessMap]) {
      expect(texture).toBeInstanceOf(THREE.CanvasTexture);
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);
      expect(texture.wrapT).toBe(THREE.RepeatWrapping);
      expect(texture.repeat.toArray()).toEqual([3.5, 2]);
      expect(texture.anisotropy).toBe(7);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(texture.magFilter).toBe(THREE.LinearFilter);
      expect((texture.image as TestCanvas).width).toBe(40);
      expect((texture.image as TestCanvas).height).toBe(40);
    }
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(bumpMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(roughnessMap.colorSpace).toBe(THREE.NoColorSpace);

    library.dispose();
  });

  it('uses an owned configured clone for an external albedo while retaining procedural data maps', () => {
    const firstSource = new THREE.Texture();
    firstSource.colorSpace = THREE.NoColorSpace;
    firstSource.wrapS = THREE.ClampToEdgeWrapping;
    firstSource.wrapT = THREE.MirroredRepeatWrapping;
    firstSource.repeat.set(9, 8);
    firstSource.anisotropy = 1;
    firstSource.magFilter = THREE.NearestFilter;
    firstSource.minFilter = THREE.NearestFilter;
    firstSource.generateMipmaps = false;
    const secondSource = new THREE.Texture();
    const albedoMaps = { snow: firstSource };
    const library = new ProceduralMaterialLibrary({ textureSize: 32, albedoMaps });
    const material = library.get('snow', { repeat: [3.5, 2], anisotropy: 7 });
    const map = material.map!;

    expect(map).not.toBe(firstSource);
    expect(map.source).toBe(firstSource.source);
    expect(map).not.toBeInstanceOf(THREE.CanvasTexture);
    expect(map.wrapS).toBe(THREE.RepeatWrapping);
    expect(map.wrapT).toBe(THREE.RepeatWrapping);
    expect(map.repeat.toArray()).toEqual([3.5, 2]);
    expect(map.anisotropy).toBe(7);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(map.generateMipmaps).toBe(true);
    expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(map.magFilter).toBe(THREE.LinearFilter);
    expect(firstSource.repeat.toArray()).toEqual([9, 8]);
    expect(firstSource.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(firstSource.colorSpace).toBe(THREE.NoColorSpace);
    expect(material.bumpMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.roughnessMap).toBeInstanceOf(THREE.CanvasTexture);
    expect(pixels(material.bumpMap!)).toBeInstanceOf(Uint8ClampedArray);
    expect(pixels(material.roughnessMap!)).toBeInstanceOf(Uint8ClampedArray);

    albedoMaps.snow = secondSource;
    const changedMaterial = library.get('snow', { repeat: [3.5, 2], anisotropy: 7 });
    expect(changedMaterial).not.toBe(material);
    expect(changedMaterial.map!.source).toBe(secondSource.source);
    expect(library.size).toBe(2);

    const clonedDispose = vi.spyOn(map, 'dispose');
    const sourceDispose = vi.spyOn(firstSource, 'dispose');
    library.dispose();
    expect(clonedDispose).toHaveBeenCalledTimes(1);
    expect(sourceDispose).not.toHaveBeenCalled();
  });

  it('generates identical maps for equal seeds and different maps for different seeds', () => {
    const first = new ProceduralMaterialLibrary({ seed: 'stable-seed', textureSize: 32 });
    const second = new ProceduralMaterialLibrary({ seed: 'stable-seed', textureSize: 32 });
    const changed = new ProceduralMaterialLibrary({ seed: 'changed-seed', textureSize: 32 });
    const firstMaterial = first.get('worn-wood');
    const secondMaterial = second.get('worn-wood');
    const changedMaterial = changed.get('worn-wood');

    expect(firstMaterial).not.toBe(secondMaterial);
    expect(pixels(firstMaterial.map!)).toEqual(pixels(secondMaterial.map!));
    expect(pixels(firstMaterial.bumpMap!)).toEqual(pixels(secondMaterial.bumpMap!));
    expect(pixels(firstMaterial.roughnessMap!)).toEqual(pixels(secondMaterial.roughnessMap!));
    expect(pixels(firstMaterial.map!)).not.toEqual(pixels(changedMaterial.map!));
    expect(firstMaterial.userData.proceduralSeed).toBe(secondMaterial.userData.proceduralSeed);
    expect(firstMaterial.userData.proceduralSeed).not.toBe(changedMaterial.userData.proceduralSeed);

    first.dispose();
    second.dispose();
    changed.dispose();
  });

  it('authors a deterministic, tile-safe icy asphalt set with coherent winter wear', () => {
    const size = 128;
    const first = new ProceduralMaterialLibrary({ seed: 'road-surface', textureSize: size });
    const second = new ProceduralMaterialLibrary({ seed: 'road-surface', textureSize: size });
    const changed = new ProceduralMaterialLibrary({ seed: 'other-road', textureSize: size });
    const material = first.get('icy-asphalt');
    const matching = second.get('icy-asphalt');
    const variant = changed.get('icy-asphalt');
    const maps = [material.map!, material.bumpMap!, material.roughnessMap!] as const;
    const matchingMaps = [matching.map!, matching.bumpMap!, matching.roughnessMap!] as const;

    // The richer surface is still exactly the existing albedo/height/roughness
    // allocation: no hidden detail, normal, clearcoat, or mask texture.
    expect(first.size).toBe(1);
    expect(new Set(maps).size).toBe(3);
    expect(material.normalMap).toBeNull();
    expect(material.displacementMap).toBeNull();
    expect(material.alphaMap).toBeNull();

    for (const [index, map] of maps.entries()) {
      expect(pixels(map)).toEqual(pixels(matchingMaps[index]));
      const continuity = textureEdgeContinuity(pixels(map), size);
      // Pixel centres either side of a wrap are one sample apart, just like
      // neighbours inside the image, rather than unrelated edge values.
      expect(continuity.seam).toBeLessThan(continuity.interior * 1.8 + 2);
    }
    expect(pixels(material.map!)).not.toEqual(pixels(variant.map!));

    const albedo = pixels(material.map!);
    const heights = channelValues(pixels(material.bumpMap!));
    const roughness = channelValues(pixels(material.roughnessMap!));
    const red = channelValues(albedo);
    const blue = channelValues(albedo, 2);
    const polishedRoughness: number[] = [];
    const neutralRoughness: number[] = [];
    for (let pixel = 0; pixel < roughness.length; pixel++) {
      // Blue-biased highlights are the restrained ice/wet-polish ribbons;
      // neutral aggregate stays rough and raised in the companion maps.
      if (blue[pixel] - red[pixel] >= 14) polishedRoughness.push(roughness[pixel]);
      else neutralRoughness.push(roughness[pixel]);
    }

    expect(Math.min(...red)).toBeGreaterThan(0);
    expect(Math.max(...blue)).toBeLessThan(255);
    // Preserve readable surface variation without allowing crack pixels to
    // collapse into the near-black networks rejected by the road captures.
    expect(Math.max(...red) - Math.min(...red)).toBeGreaterThan(50);
    expect(average(red)).toBeGreaterThan(68);
    expect(average(red)).toBeLessThan(110);
    expect(Math.min(...heights)).toBeGreaterThan(0);
    expect(Math.max(...heights)).toBeLessThan(255);
    expect(Math.min(...roughness)).toBeGreaterThan(0);
    expect(Math.max(...roughness)).toBeLessThan(255);
    expect(polishedRoughness.length).toBeGreaterThan(size * size * .025);
    expect(polishedRoughness.length).toBeLessThan(size * size * .35);
    expect(average(polishedRoughness)).toBeLessThan(average(neutralRoughness) - 25);

    first.dispose();
    second.dispose();
    changed.dispose();
  });

  it('generates a varied non-metallic woven burlap surface for fabric props', () => {
    const library = new ProceduralMaterialLibrary({ seed: 'sandbags', textureSize: 48 });
    const material = library.get('burlap', { repeat: [3, 1], tint: 0x8c886e });
    const albedo = pixels(material.map!);
    const heights = pixels(material.bumpMap!);
    const redValues = new Set<number>();
    const heightValues = new Set<number>();
    for (let index = 0; index < albedo.length; index += 4) {
      redValues.add(albedo[index]);
      heightValues.add(heights[index]);
    }

    expect(material.name).toBe('PBR woven burlap');
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBe(1);
    expect(material.bumpScale).toBeCloseTo(.12);
    expect(material.userData.proceduralSurface).toBe('burlap');
    expect(material.map!.repeat.toArray()).toEqual([3, 1]);
    expect(redValues.size).toBeGreaterThan(40);
    expect(heightValues.size).toBeGreaterThan(40);
    library.dispose();
  });

  it('disposes each cached resource exactly once and remains unusable afterward', () => {
    const library = new ProceduralMaterialLibrary({ textureSize: 32 });
    const concrete = library.get('cracked-concrete');
    const snow = library.get('snow', { repeat: [2, 2] });
    const resources = [
      concrete,
      concrete.map!,
      concrete.bumpMap!,
      concrete.roughnessMap!,
      snow,
      snow.map!,
      snow.bumpMap!,
      snow.roughnessMap!,
    ];
    const disposeSpies = resources.map(resource => vi.spyOn(resource, 'dispose'));

    library.dispose();
    library.dispose();

    expect(library.size).toBe(0);
    for (const spy of disposeSpies) expect(spy).toHaveBeenCalledTimes(1);
    expect(() => library.get('snow')).toThrow(/already been disposed/i);
  });

  it('rejects invalid repeats and clamps renderer anisotropy recommendations', () => {
    const library = new ProceduralMaterialLibrary({ textureSize: 32 });
    expect(() => library.get('snow', { repeat: [0, 1] })).toThrow(/greater than zero/i);
    expect(() => library.get('snow', { repeat: [Number.NaN, 1] })).toThrow(/finite/i);

    const renderer = {
      capabilities: { getMaxAnisotropy: () => 4 },
    } as unknown as THREE.WebGLRenderer;
    expect(recommendedMaterialAnisotropy(renderer)).toBe(4);
    expect(recommendedMaterialAnisotropy(renderer, 2)).toBe(2);
    library.dispose();
  });
});
