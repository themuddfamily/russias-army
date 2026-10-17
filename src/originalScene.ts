import * as THREE from 'three';
import { originalNodeWorldMatrices, type OriginalSceneData, type OriginalSceneMesh, type OriginalSceneNode } from '../shared/originalSceneGeometry';

export type OriginalRenderMesh = OriginalSceneMesh & { shader?: string; sourceShader?: string };
export interface OriginalRenderScene extends OriginalSceneData {
  meshes: OriginalRenderMesh[];
  runtime?: { doubleSidedModels?: string[]; reparent?: Record<string, string> };
}
export interface OriginalSceneRender {
  group: THREE.Group;
  models: Map<string, THREE.Group>;
  bounds: THREE.Box3;
  dispose(): void;
}

/** Builds the preserved source parts directly; the GLB loses their shader bindings.
 * Geometry remains Z-up locally. Only the outer group converts basis and units.
 * Raw centered CLOD UVs are retained separately; render UVs follow the recovered
 * W3D renderer's (u+.5,.5-v) convention. Texture upload must not flip V again.
 * Materials/textures belong to the caller and may be shared with other casts.
 */
export function createOriginalScene(
  data: OriginalRenderScene,
  scale: number,
  materialFor: (shader: string, node: OriginalSceneNode, part: OriginalRenderMesh, doubleSided: boolean) => THREE.Material,
): OriginalSceneRender {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Original scene scale must be positive');
  const group = new THREE.Group();
  group.name = 'original-source-scene';
  group.rotation.x = -Math.PI / 2;
  group.scale.setScalar(scale);
  const models = new Map<string, THREE.Group>();
  const geometry = new Map<OriginalSceneMesh, THREE.BufferGeometry>();
  const parts = new Map<string, OriginalRenderMesh[]>();
  for (const part of data.meshes) {
    const list = parts.get(part.resource) ?? [];
    list.push(part);
    parts.set(part.resource, list);
  }
  const doubleSided = new Set(data.runtime?.doubleSidedModels ?? []);
  const sourceMatrices = originalNodeWorldMatrices(data);
  for (const node of data.nodes) {
    if (!node.resource) continue; // exporter cameras/lights are not gameplay models
    if (models.has(node.name)) throw new Error(`Duplicate original model: ${node.name}`);
    const model = new THREE.Group();
    model.name = node.name;
    model.matrixAutoUpdate = false;
    model.matrix.fromArray(sourceMatrices.get(node.name.toLowerCase())!);
    model.visible = node.visibility !== 0;
    model.userData.originalResource = node.resource;
    model.userData.originalLocalMatrix = [...node.matrix];
    models.set(node.name, model);
    for (const part of parts.get(node.resource) ?? []) {
      let buffer = geometry.get(part);
      if (!buffer) {
        buffer = new THREE.BufferGeometry();
        buffer.setAttribute('position', new THREE.Float32BufferAttribute(part.positions.flat(), 3));
        buffer.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals.flat(), 3));
        for (let layer = 0; layer < part.tex_coords.length; layer++) {
          const raw = part.tex_coords[layer];
          buffer.setAttribute(`sourceUv${layer}`, new THREE.Float32BufferAttribute(raw.flat(), 2));
          buffer.setAttribute(layer === 0 ? 'uv' : `uv${layer}`, new THREE.Float32BufferAttribute(raw.flatMap(uv => [uv[0] + .5, .5 - uv[1]]), 2));
        }
        buffer.setIndex(part.faces.flat());
        buffer.computeBoundingBox();
        buffer.computeBoundingSphere();
        geometry.set(part, buffer);
      }
      const shader = part.shader ?? part.sourceShader;
      if (!shader) throw new Error(`Missing original shader binding: ${part.resource}/${part.part}`);
      const mesh = new THREE.Mesh(buffer, materialFor(shader, node, part, doubleSided.has(node.name)));
      mesh.name = `${node.name}/part-${part.part}`;
      mesh.userData.originalShader = shader;
      mesh.userData.originalPart = part.part;
      model.add(mesh);
    }
  }
  for (const node of data.nodes) {
    const model = models.get(node.name);
    if (!model) continue;
    // Flatten evaluated source transforms so nonmesh editor groups may be omitted
    // without losing the actual model world pose. Collision uses the same helper.
    group.add(model);
  }
  group.updateMatrixWorld(true);
  // Director changes parent while retaining model world transforms. Empty source
  // cameras/lights are omitted; runtime grouping never changes their geometry.
  const runtimeGroups = new Map<string, THREE.Group>();
  for (const [name, parentName] of Object.entries(data.runtime?.reparent ?? {})) {
    const model = models.get(name);
    if (!model) throw new Error(`Missing reparented original model: ${name}`);
    let parent = runtimeGroups.get(parentName);
    if (!parent) {
      parent = new THREE.Group(); parent.name = parentName; group.add(parent);
      runtimeGroups.set(parentName, parent);
    }
    parent.attach(model);
    model.matrixAutoUpdate = false;
    model.updateMatrix();
  }
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  let disposed = false;
  return { group, models, bounds, dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const buffer of geometry.values()) buffer.dispose();
  } };
}
