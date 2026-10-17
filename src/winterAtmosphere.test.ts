import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createWinterAtmosphere,
  DEFAULT_WINTER_FOG_DENSITY,
  WINTER_PALETTE,
  WINTER_SNOW_COUNTS,
  winterFogFactorAtDistance,
} from './winterAtmosphere';

function renderer(pixelRatio = 1): THREE.WebGLRenderer {
  return { getPixelRatio: () => pixelRatio } as unknown as THREE.WebGLRenderer;
}

function positions(atmosphere: ReturnType<typeof createWinterAtmosphere>): Float32Array {
  return (atmosphere.snow.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
}

describe('createWinterAtmosphere', () => {
  it('installs a fog-matched procedural sky and the correct quality-tier snow volume', () => {
    const enhancedScene = new THREE.Scene();
    const fallbackScene = new THREE.Scene();
    const enhanced = createWinterAtmosphere(renderer(), enhancedScene, new THREE.Scene(), true, { environment: false });
    const fallback = createWinterAtmosphere(renderer(), fallbackScene, new THREE.Scene(), false, { environment: false });

    expect(enhancedScene.children).toContain(enhanced.sky);
    expect(enhancedScene.children).toContain(enhanced.snow);
    expect(enhanced.snow.geometry.getAttribute('position').count).toBe(WINTER_SNOW_COUNTS.enhanced);
    expect(fallback.snow.geometry.getAttribute('position').count).toBe(WINTER_SNOW_COUNTS.fallback);
    expect(enhanced.fog.color.getHex()).toBe(WINTER_PALETTE.fog);
    expect((enhancedScene.background as THREE.Color).getHex()).toBe(WINTER_PALETTE.fog);
    expect(enhanced.sky.material.name).toBe('WinterOvercastSky');
    expect(enhanced.sky.material.fragmentShader).toContain('fbm');
    for (const atmosphere of [enhanced, fallback]) {
      expect(atmosphere.fog.density).toBe(DEFAULT_WINTER_FOG_DENSITY);
      expect(atmosphere.sky.material.toneMapped).toBe(true);
      expect(atmosphere.sky.material.fragmentShader).toContain('#include <tonemapping_fragment>');
      expect(atmosphere.sky.material.fragmentShader).toContain('#include <colorspace_fragment>');
      expect(atmosphere.snow.material.toneMapped).toBe(true);
      expect(atmosphere.snow.material.fragmentShader).toContain('#include <tonemapping_fragment>');
      expect(atmosphere.snow.material.fragmentShader).toContain('#include <colorspace_fragment>');
    }
    expect(enhanced.environment).toBeNull();

    enhanced.dispose();
    fallback.dispose();
  });

  it('preserves near-field clarity while adding readable aerial perspective', () => {
    expect(DEFAULT_WINTER_FOG_DENSITY).toBe(.0092);
    expect(winterFogFactorAtDistance(10)).toBeGreaterThan(.006);
    expect(winterFogFactorAtDistance(10)).toBeLessThan(.011);
    expect(winterFogFactorAtDistance(50)).toBeGreaterThan(.17);
    expect(winterFogFactorAtDistance(50)).toBeLessThan(.21);
    expect(winterFogFactorAtDistance(70)).toBeGreaterThan(.31);
    expect(winterFogFactorAtDistance(70)).toBeLessThan(.37);
    expect(winterFogFactorAtDistance(-10)).toBe(0);

    const custom = createWinterAtmosphere(renderer(), new THREE.Scene(), new THREE.Scene(), false, {
      environment: false,
      fogDensity: .006,
      snowCount: 12,
    });
    expect(custom.fog.density).toBe(.006);
    custom.dispose();
  });

  it('uses stable seeded attributes while separating different seeds', () => {
    const first = createWinterAtmosphere(renderer(), new THREE.Scene(), new THREE.Scene(), false, {
      environment: false, seed: 'stable', snowCount: 48,
    });
    const second = createWinterAtmosphere(renderer(), new THREE.Scene(), new THREE.Scene(), false, {
      environment: false, seed: 'stable', snowCount: 48,
    });
    const changed = createWinterAtmosphere(renderer(), new THREE.Scene(), new THREE.Scene(), false, {
      environment: false, seed: 'different', snowCount: 48,
    });

    expect(positions(first)).toEqual(positions(second));
    expect(positions(first)).not.toEqual(positions(changed));
    expect(first.snow.geometry.getAttribute('snowData').array).toEqual(second.snow.geometry.getAttribute('snowData').array);

    first.dispose();
    second.dispose();
    changed.dispose();
  });

  it('updates only uniforms and camera-relative transforms, never GPU buffer attributes', () => {
    const atmosphere = createWinterAtmosphere(renderer(1.5), new THREE.Scene(), new THREE.Scene(), true, {
      environment: false, snowCount: 32,
    });
    const cameraRig = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2, 3, 4);
    cameraRig.position.set(10, 1, -8);
    cameraRig.add(camera);
    cameraRig.updateMatrixWorld(true);
    const positionAttribute = atmosphere.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
    const dataAttribute = atmosphere.snow.geometry.getAttribute('snowData') as THREE.BufferAttribute;
    const initialPositionVersion = positionAttribute.version;
    const initialDataVersion = dataAttribute.version;
    const initialPositions = new Float32Array(positionAttribute.array as Float32Array);

    atmosphere.update(12.5, camera);

    expect(atmosphere.sky.position.toArray()).toEqual([12, 4, -4]);
    expect(atmosphere.snow.position.toArray()).toEqual([12, 4, -4]);
    expect(atmosphere.sky.material.uniforms.uTime!.value).toBe(12.5);
    expect(atmosphere.snow.material.uniforms.uTime!.value).toBe(12.5);
    expect(positionAttribute.version).toBe(initialPositionVersion);
    expect(dataAttribute.version).toBe(initialDataVersion);
    expect(positionAttribute.usage).toBe(THREE.StaticDrawUsage);
    expect(dataAttribute.usage).toBe(THREE.StaticDrawUsage);
    expect(positionAttribute.needsUpdate).toBeUndefined();
    expect(positionAttribute.array).toEqual(initialPositions);

    atmosphere.dispose();
  });

  it('disposes owned resources once and restores scene state without overwriting later changes', () => {
    const scene = new THREE.Scene();
    const priorBackground = new THREE.Color(0x123456);
    const priorFog = new THREE.Fog(0x334455, 1, 20);
    scene.background = priorBackground;
    scene.fog = priorFog;
    const atmosphere = createWinterAtmosphere(renderer(), scene, new THREE.Scene(), false, { environment: false, snowCount: 24 });
    const disposals = [
      vi.spyOn(atmosphere.sky.geometry, 'dispose'),
      vi.spyOn(atmosphere.sky.material, 'dispose'),
      vi.spyOn(atmosphere.snow.geometry, 'dispose'),
      vi.spyOn(atmosphere.snow.material, 'dispose'),
    ];

    atmosphere.dispose();
    atmosphere.dispose();

    expect(scene.children).not.toContain(atmosphere.sky);
    expect(scene.children).not.toContain(atmosphere.snow);
    expect(scene.background).toBe(priorBackground);
    expect(scene.fog).toBe(priorFog);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('validates dimensions and custom particle counts', () => {
    const create = (options: Parameters<typeof createWinterAtmosphere>[4]) =>
      createWinterAtmosphere(renderer(), new THREE.Scene(), new THREE.Scene(), false, { environment: false, ...options });

    expect(() => create({ snowRadius: 0 })).toThrow(/snowRadius/);
    expect(() => create({ snowHeight: Number.NaN })).toThrow(/snowHeight/);
    expect(() => create({ fogDensity: -1 })).toThrow(/fogDensity/);
    expect(() => create({ snowCount: 2.5 })).toThrow(/integer/);
    const custom = create({ snowCount: 27 });
    expect(custom.snow.geometry.getAttribute('position').count).toBe(27);
    custom.dispose();
  });
});
