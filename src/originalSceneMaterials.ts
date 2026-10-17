import * as THREE from 'three';
import {createOriginalSkyGeometry,applyOriginalSkyTransform} from '../shared/originalSkyRay';

export interface OriginalTextureDescription {
  url: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}
export interface OriginalTextureLayer {
  textureName: string;
  textureMode: string;
  textureScale: number[];
}
export interface OriginalSceneMaterialData {
  meshes?: Array<{ resource: string; positions: number[][] }>;
  textures: Record<string, OriginalTextureDescription>;
  shaders: Array<{ name: string; texture_layers: OriginalTextureLayer[] }>;
  runtime: {
    doubleSidedModels: string[];
    sky: {
      texture: string;
      radius: number;
      height: number;
      position: number[];
      rotationDegrees: number[];
      textureScale: number[];
      backgroundRgb: number[];
      nearFiltering: boolean;
    };
  };
}

/** Raw CLOD coordinates: pinned dirplayer-rs scene3d.rs runtime convention.
 * This is an adapter inference, not a measurement of a rendered Director frame.
 */
export function originalSourceUv(u: number, v: number): [number, number] {
  return [u + .5, .5 - v];
}

export interface OriginalSceneMaterials {
  forMesh(mesh: { shader: string }, modelName: string): THREE.MeshBasicMaterial;
  createSky(): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  background: THREE.Color;
  dispose(): void;
}

/**
 * Owns materials and sky geometry; supplied textures are borrowed by default.
 * Pinned primary adapter reference: igorlira/dirplayer-rs commit
 * 68376fbb4494a6bbad4c70081ecdcb99814a74c9, scene3d.rs / W3dTextureLayer defaults.
 * Original explore.buildlevel supplies planar/source-space projection, .005
 * noise scale, emissive white and explicit double-sided models. Planar fitting
 * to source resource XY bounds follows the pinned world.image adapter branch;
 * the recovered floortop/floortop2 image is a complete map aerial texture.
 * Texture scale describes apparent size, so its UV tile factor is reciprocal,
 * as documented by Director MX2004 textureTransform. Its blendFunctionList
 * default is multiply; source floor shaders are newly created without a blend
 * override. Planar bounds fitting remains an adapter inference. No alpha cutoff
 * or additional lighting/fog is inferred. Ordinary mesh UVs must be remapped
 * with originalSourceUv by the geometry owner.
 */
export function createOriginalSceneMaterials(
  data: OriginalSceneMaterialData,
  textures: Record<string, THREE.Texture>,
  options: { disposeTextures?: boolean } = {},
): OriginalSceneMaterials {
  const shaders = new Map(data.shaders.map(shader => [shader.name, shader]));
  const doubleSided = new Set(data.runtime.doubleSidedModels);
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  const geometries = new Set<THREE.CylinderGeometry>();
  let disposed = false;
  const texture = (name: string): THREE.Texture => {
    const result = textures[name];
    if (!result || !data.textures[name]) throw new Error(`Missing original texture: ${name}`);
    result.flipY = false;
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = THREE.RepeatWrapping;
    // Clamp the finite sky image vertically so linear minification at its top
    // cannot pull the bottom treeline into a broken line across the sky.
    // The isolated sky-boundary experiment establishes this Three adapter
    // correction, not the native Director sampler. Horizontal sky tiling and
    // ordinary scene textures still repeat.
    result.wrapT = name === data.runtime.sky.texture
      ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    // The sky explicitly selects #low. Macromedia manuals disagree on the
    // default for recreated ordinary textures; their no-mipmap setup remains
    // an adapter pending resolution. Native minification is not established.
    result.generateMipmaps = false;
    result.minFilter = THREE.LinearFilter;
    result.magFilter = name === data.runtime.sky.texture && !data.runtime.sky.nearFiltering
      ? THREE.NearestFilter : THREE.LinearFilter;
    result.needsUpdate = true;
    return result;
  };
  const material = (name: string, side: THREE.Side): THREE.MeshBasicMaterial => {
    if (disposed) throw new Error('Original scene materials have been disposed');
    const key = `${name}:${side}`;
    const previous = materials.get(key);
    if (previous) return previous;
    const shader = shaders.get(name);
    if (!shader?.texture_layers.length) throw new Error(`Missing original shader: ${name}`);
    const layer = shader.texture_layers[0];
    const map = texture(layer.textureName);
    const result = new THREE.MeshBasicMaterial({
      name: `original:${name}`, map, side,
      transparent: data.textures[layer.textureName].hasAlpha,
      toneMapped: false, fog: false,
    });
    // Capture source coordinates before any scene-basis change or world scale.
    // wrapPlanar projects source object XY, dropping source Z. Fit the whole
    // aerial image to all floor resource parts, including its rock part.
    const noise = shader.texture_layers[1];
    if (layer.textureMode === 'wrapPlanar' || noise) {
      const noiseMap = noise ? texture(noise.textureName) : undefined;
      const baseScale = new THREE.Vector2(1 / layer.textureScale[0], 1 / layer.textureScale[1]);
      const noiseScale = noise ? new THREE.Vector2(1 / noise.textureScale[0], 1 / noise.textureScale[1]) : new THREE.Vector2();
      const sourcePositions = data.meshes?.filter(mesh => mesh.resource === 'floor').flatMap(mesh => mesh.positions);
      if (!sourcePositions?.length) throw new Error('Original planar floor requires source mesh positions');
      const minX = Math.min(...sourcePositions.map(position => position[0]));
      const maxX = Math.max(...sourcePositions.map(position => position[0]));
      const minY = Math.min(...sourcePositions.map(position => position[1]));
      const maxY = Math.max(...sourcePositions.map(position => position[1]));
      if (!(maxX > minX && maxY > minY)) throw new Error('Invalid original planar floor bounds');
      const planarBounds = new THREE.Vector4(minX, maxY, maxX - minX, maxY - minY);
      result.userData.originalProjection = { mode: layer.textureMode, baseScale, noiseScale, planarBounds, sourceTextureScale: layer.textureScale, sourceNoiseScale: noise?.textureScale, noiseBlend: noise ? 'multiply-adapter-default' : undefined };
      result.onBeforeCompile = compiled => {
        compiled.uniforms.originalBaseScale = { value: baseScale };
        compiled.uniforms.originalNoiseScale = { value: noiseScale };
        compiled.uniforms.originalPlanarBounds = { value: planarBounds };
        if (noiseMap) compiled.uniforms.originalNoise = { value: noiseMap };
        compiled.vertexShader = compiled.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 originalSourceXY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\noriginalSourceXY = position.xy;');
        compiled.fragmentShader = compiled.fragmentShader.replace('#include <common>',
          '#include <common>\nvarying vec2 originalSourceXY;\nuniform vec2 originalBaseScale;\nuniform vec2 originalNoiseScale;\nuniform vec4 originalPlanarBounds;' + (noiseMap ? '\nuniform sampler2D originalNoise;' : ''));
        const normalizedUv = 'vec2((originalSourceXY.x - originalPlanarBounds.x) / originalPlanarBounds.z, (originalPlanarBounds.y - originalSourceXY.y) / originalPlanarBounds.w)';
        let sample = layer.textureMode === 'wrapPlanar'
          ? `vec2 originalPlanarUv = ${normalizedUv};\ndiffuseColor *= texture2D(map, originalPlanarUv * originalBaseScale);`
          : '#include <map_fragment>';
        if (noiseMap) sample += '\ndiffuseColor.rgb *= texture2D(originalNoise, originalPlanarUv * originalNoiseScale).rgb;';
        compiled.fragmentShader = compiled.fragmentShader.replace('#include <map_fragment>', sample);
      };
      result.customProgramCacheKey = () => `original:${name}:${layer.textureMode}:${noise?.textureName ?? ''}`;
    }
    materials.set(key, result);
    return result;
  };
  return {
    background: new THREE.Color().setRGB(
      data.runtime.sky.backgroundRgb[0] / 255,
      data.runtime.sky.backgroundRgb[1] / 255,
      data.runtime.sky.backgroundRgb[2] / 255,
      THREE.SRGBColorSpace,
    ),
    forMesh: (mesh, modelName) => material(mesh.shader, doubleSided.has(modelName) ? THREE.DoubleSide : THREE.FrontSide),
    createSky: () => {
      const source = data.runtime.sky;
      const skyMaterial = material('sky', THREE.BackSide);
      const map = texture(source.texture);
      map.repeat.set(1 / source.textureScale[0], 1 / source.textureScale[1]);
      // Source makeland leaves primitive resolution/numSegments unset. Director
      // MX2004 Scripting Reference pp955 and900 documents defaults 20 and2.
      const geometry = createOriginalSkyGeometry(source);
      // Three's generated cylinder uses v=1 at its top. Original image upload
      // is top-origin (flipY=false), so only this generated primitive needs a
      // V reversal; source CLOD UV conversion remains separate.
      const skyUv = geometry.getAttribute('uv');
      for (let i = 0; i < skyUv.count; i++) skyUv.setY(i, 1 - skyUv.getY(i));
      geometries.add(geometry);
      const sky = new THREE.Mesh(geometry, skyMaterial);
      sky.name = 'original:sky';
      applyOriginalSkyTransform(sky,source);
      sky.userData.originalSourceBasis = 'z-up';
      sky.userData.sourceDefaultResolution = 20;
      sky.userData.sourceDefaultNumSegments = 2;
      return sky;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const item of materials.values()) item.dispose();
      for (const item of geometries) item.dispose();
      if (options.disposeTextures) for (const item of new Set(Object.values(textures))) item.dispose();
    },
  };
}

/** Resolves only after every original image is loaded; cleans up partial loads. */
export async function loadOriginalSceneMaterials(
  data: OriginalSceneMaterialData,
  loader: Pick<THREE.TextureLoader, 'loadAsync'> = new THREE.TextureLoader(),
): Promise<OriginalSceneMaterials> {
  const entries = Object.entries(data.textures);
  const loaded = await Promise.allSettled(entries.map(async ([name, description]) => [name, await loader.loadAsync(description.url)] as const));
  const textures: Record<string, THREE.Texture> = {};
  let failure: unknown;
  for (const result of loaded) {
    if (result.status === 'fulfilled') textures[result.value[0]] = result.value[1];
    else failure = result.reason;
  }
  if (loaded.some(result => result.status === 'rejected')) {
    for (const item of new Set(Object.values(textures))) item.dispose();
    throw failure;
  }
  return createOriginalSceneMaterials(data, textures, { disposeTextures: true });
}
