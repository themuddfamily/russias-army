import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createOriginalSceneMaterials, loadOriginalSceneMaterials, originalSourceUv, type OriginalSceneMaterialData } from './originalSceneMaterials';

const data = JSON.parse(readFileSync('public/assets/original-scenes/woodland/scene.json', 'utf8')) as OriginalSceneMaterialData;
const textures = () => Object.fromEntries(Object.keys(data.textures).map(name => [name, new THREE.Texture()]));

describe('original source map materials', () => {
  it('remaps centered CLOD UVs with the pinned runtime convention', () => {
    expect(originalSourceUv(-.5, .5)).toEqual([0, 0]);
    expect(originalSourceUv(.5, -.5)).toEqual([1, 1]);
    expect(originalSourceUv(1.25, -2)).toEqual([1.75, 2.5]);
  });

  it('resolves exact part shaders and source two-sided models using original textures', () => {
    const maps = textures();
    const library = createOriginalSceneMaterials(data, maps);
    const leaf = library.forMesh({ shader: 'syccamore' }, 'syccamore');
    expect(leaf.map).toBe(maps.syccamore);
    expect(leaf.side).toBe(THREE.DoubleSide);
    expect(leaf.alphaTest).toBe(0);
    expect(leaf.transparent).toBe(true);
    expect(leaf.toneMapped).toBe(false);
    expect(leaf.fog).toBe(false);
    const rock = library.forMesh({ shader: 'barerocksand2' }, 'floor');
    expect(rock.map).toBe(maps.barerocksand2);
    expect(rock.side).toBe(THREE.FrontSide);
    expect(rock.map?.flipY).toBe(false);
    expect(rock.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(library.forMesh({ shader: 'syccamore' }, 'syccamore')).toBe(leaf);
    expect(() => library.forMesh({ shader: 'invented' }, 'floor')).toThrow('Missing original shader');
    library.dispose();
  });

  it.each(['barrack','woodland'])('disables mipmapped sampling for every recreated %s scene texture', edition => {
    const scene = JSON.parse(readFileSync(`public/assets/original-scenes/${edition}/scene.json`, 'utf8')) as OriginalSceneMaterialData;
    const maps = Object.fromEntries(Object.keys(scene.textures).map(name => [name,new THREE.Texture()]));
    // Exercise real Three loader defaults, including ordinary parts, the
    // planar floor's second noise layer, and the separately generated sky.
    for(const map of Object.values(maps)){
      expect(map.generateMipmaps).toBe(true);
      expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    }
    const library = createOriginalSceneMaterials(scene,maps);
    for(const shader of scene.shaders)library.forMesh({shader:shader.name},'fixture');
    library.createSky();
    for(const [name,map] of Object.entries(maps)){
      expect(map.generateMipmaps,name).toBe(false);
      expect(map.minFilter,name).toBe(THREE.LinearFilter);
      expect(map.magFilter,name).toBe(name===scene.runtime.sky.texture?THREE.NearestFilter:THREE.LinearFilter);
      expect(map.wrapS,name).toBe(THREE.RepeatWrapping);
      expect(map.wrapT,name).toBe(name===scene.runtime.sky.texture?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping);
    }
    // Reusing a material with another culling side must preserve the sky's
    // explicit nearFiltering=0 rather than reset its magnification filter.
    library.forMesh({shader:'sky'},'fixture');
    expect(maps.sky.magFilter).toBe(THREE.NearestFilter);
    expect(maps.sky.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(maps.sky.repeat.toArray()).toEqual([10, 1 / 1.01]);
    library.dispose();
  });

  it('projects floor and noise from source object XY before scene basis/scale', () => {
    const maps = textures();
    const library = createOriginalSceneMaterials(data, maps);
    const floor = library.forMesh({ shader: 'floortop2' }, 'floor');
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <map_fragment>\n}',
    } as Parameters<typeof floor.onBeforeCompile>[0];
    floor.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('originalSourceXY = position.xy');
    expect(shader.fragmentShader).toContain('originalPlanarUv * originalBaseScale');
    expect(shader.fragmentShader).toContain('originalPlanarUv * originalNoiseScale');
    expect(shader.fragmentShader).toContain('(originalSourceXY.x - originalPlanarBounds.x) / originalPlanarBounds.z');
    expect(shader.fragmentShader).toContain('(originalPlanarBounds.y - originalSourceXY.y) / originalPlanarBounds.w');
    expect(shader.uniforms.originalNoise.value).toBe(maps.noise);
    expect(shader.uniforms.originalNoiseScale.value.toArray()).toEqual([200, 200]);
    expect(shader.uniforms.originalBaseScale.value.toArray()).toEqual([1, 1]);
    const allFloor = data.meshes!.filter(mesh => mesh.resource === 'floor').flatMap(mesh => mesh.positions);
    const minX = Math.min(...allFloor.map(point => point[0]));
    const maxX = Math.max(...allFloor.map(point => point[0]));
    const minY = Math.min(...allFloor.map(point => point[1]));
    const maxY = Math.max(...allFloor.map(point => point[1]));
    expect(shader.uniforms.originalPlanarBounds.value.toArray()).toEqual([minX, maxY, maxX - minX, maxY - minY]);
    expect(floor.userData.originalProjection.sourceNoiseScale).toEqual([.005, .005, .005]);
    expect(shader.fragmentShader).not.toContain('worldPosition');
    library.dispose();
  });

  it.each(['barrack', 'woodland'])('creates the uncapped inward %s sky with source primitive defaults', edition => {
    const data = JSON.parse(readFileSync(`public/assets/original-scenes/${edition}/scene.json`, 'utf8')) as OriginalSceneMaterialData;
    const maps = Object.fromEntries(Object.keys(data.textures).map(name => [name, new THREE.Texture()]));
    const library = createOriginalSceneMaterials(data, maps);
    const sky = library.createSky();
    expect(sky.geometry.parameters.radiusTop).toBe(data.runtime.sky.radius);
    expect(sky.geometry.parameters.radiusBottom).toBe(data.runtime.sky.radius);
    expect(sky.geometry.parameters.height).toBe(2000);
    expect(sky.geometry.parameters.radialSegments).toBe(20);
    expect(sky.geometry.parameters.heightSegments).toBe(2);
    expect(sky.geometry.parameters.openEnded).toBe(true);
    const positions = sky.geometry.getAttribute('position');
    const uv = sky.geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      // Before the source90deg rotation, cylinder Y is the image's vertical
      // axis. Top-origin PNG upload requires top v0, middle v.5, bottom v1.
      expect(uv.getY(i)).toBeCloseTo(.5 - positions.getY(i) / data.runtime.sky.height);
    }
    expect(uv.getX(0)).toBe(0);
    expect(uv.getX(20)).toBe(1);
    expect(new Set(Array.from({ length: positions.count }, (_, i) => positions.getY(i)))).toEqual(new Set([1000, 0, -1000]));
    expect(sky.material.side).toBe(THREE.BackSide);
    expect(sky.position.toArray()).toEqual([0, 0, 1000]);
    expect(sky.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(maps.sky.repeat.toArray()).toEqual([10, 1 / 1.01]);
    expect(maps.sky.magFilter).toBe(THREE.NearestFilter);
    expect(maps.sky.generateMipmaps).toBe(false);
    expect(maps.sky.minFilter).toBe(THREE.LinearFilter);
    const rgb = library.background.clone().convertLinearToSRGB();
    expect(rgb.r).toBeCloseTo(141 / 255);
    expect(rgb.g).toBeCloseTo(160 / 255);
    expect(rgb.b).toBeCloseTo(174 / 255);
    library.dispose();
  });

  it('disposes owned materials/geometry exactly once and keeps borrowed textures', () => {
    const maps = textures();
    const library = createOriginalSceneMaterials(data, maps);
    const mesh = library.forMesh({ shader: 'floortop2' }, 'floor');
    const sky = library.createSky();
    const materialDispose = vi.spyOn(mesh, 'dispose');
    const geometryDispose = vi.spyOn(sky.geometry, 'dispose');
    const textureDispose = vi.spyOn(maps.floortop2, 'dispose');
    library.dispose(); library.dispose();
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).not.toHaveBeenCalled();
    expect(() => library.forMesh({ shader: 'floortop2' }, 'floor')).toThrow('disposed');
  });

  it('waits for all images and owns their disposal in the async factory', async () => {
    const loaded = new THREE.Texture();
    const tiny = { ...data, textures: { sky: data.textures.sky } };
    const library = await loadOriginalSceneMaterials(tiny, { loadAsync: vi.fn().mockResolvedValue(loaded) });
    const dispose = vi.spyOn(loaded, 'dispose');
    library.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('cleans successful partial image loads when another original image fails', async () => {
    const loaded = new THREE.Texture();
    const tiny = { ...data, textures: { sky: data.textures.sky, noise: data.textures.noise } };
    const dispose = vi.spyOn(loaded, 'dispose');
    const error = new Error('original image failed');
    await expect(loadOriginalSceneMaterials(tiny, { loadAsync: vi.fn().mockResolvedValueOnce(loaded).mockRejectedValueOnce(error) })).rejects.toBe(error);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
