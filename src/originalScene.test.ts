import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createOriginalScene, type OriginalRenderScene } from './originalScene';

function recovered(edition: 'woodland' | 'barrack'): OriginalRenderScene {
  const cast = edition === 'woodland' ? 'woodland-level2' : 'barrack-level1';
  const base = 'docs/research-evidence/2026-09-30/';
  const data = JSON.parse(readFileSync(`${base}w3d-decoded/${cast}/geometry.json`, 'utf8')) as OriginalRenderScene;
  const metadata = JSON.parse(readFileSync(`${base}w3d-metadata/${cast}.json`, 'utf8')) as {
    model_resources: { name: string; shader_bindings: { name: string; mesh_bindings: string[] }[] }[];
  };
  for (const mesh of data.meshes) {
    const resource = metadata.model_resources.find(item => item.name === mesh.resource)!;
    const binding = resource.shader_bindings.find(item => item.name === resource.name)!;
    mesh.shader = binding.mesh_bindings[mesh.part];
  }
  return data;
}

describe('original source mesh construction', () => {
  it.each(['woodland', 'barrack'] as const)('retains every %s source part, index and UV and converts source coordinates once', edition => {
    const data = recovered(edition);
    const material = new THREE.MeshBasicMaterial();
    const result = createOriginalScene(data, .02, () => material);
    expect(result.models.size).toBe(edition === 'woodland' ? 22 : 92);
    for (const node of data.nodes.filter(node => node.resource)) {
      const model = result.models.get(node.name)!;
      expect(model.matrix.elements).toEqual(node.matrix);
      for (const part of data.meshes.filter(mesh => mesh.resource === node.resource)) {
        const mesh = model.getObjectByName(`${node.name}/part-${part.part}`) as THREE.Mesh;
        expect(mesh.geometry.attributes.position.count).toBe(part.positions.length);
        expect(Array.from(mesh.geometry.index!.array)).toEqual(part.faces.flat());
        expect(Array.from(mesh.geometry.attributes.sourceUv0.array)).toEqual(Array.from(new Float32Array(part.tex_coords[0].flat())));
        expect(Array.from(mesh.geometry.attributes.uv.array)).toEqual(Array.from(new Float32Array(part.tex_coords[0].flatMap(uv => [uv[0] + .5, .5 - uv[1]]))));
        const sourcePosition = new THREE.Vector3(...part.positions[0]).applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
        const renderedPosition = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 0).applyMatrix4(mesh.matrixWorld);
        expect(renderedPosition.x).toBeCloseTo(sourcePosition.x * .02, 5);
        expect(renderedPosition.y).toBeCloseTo(sourcePosition.z * .02, 5);
        expect(renderedPosition.z).toBeCloseTo(-sourcePosition.y * .02, 5);
      }
    }
    expect(result.bounds.max.x - result.bounds.min.x).toBeGreaterThan(300);
    result.dispose(); material.dispose();
  });

  it('keeps the Woodland floor parts distinct and preserves the world pose when grouping foliage', () => {
    const data = recovered('woodland');
    const calls: string[] = [];
    const material = new THREE.MeshBasicMaterial();
    const before = createOriginalScene(data, 1, () => material);
    data.runtime = { reparent: { othertrees: 'smokes' }, doubleSidedModels: ['othertrees'] };
    const after = createOriginalScene(data, 1, (shader, node, _part, both) => {
      if (node.name === 'floor') calls.push(shader);
      if (node.name === 'othertrees') expect(both).toBe(true);
      return material;
    });
    expect(calls).toEqual(['floor', 'barerocksand2']);
    const first = before.models.get('othertrees')!, second = after.models.get('othertrees')!;
    expect(second.parent!.name).toBe('smokes');
    for (let i = 0; i < 16; i++) expect(second.matrixWorld.elements[i]).toBeCloseTo(first.matrixWorld.elements[i], 8);
    before.dispose(); after.dispose(); material.dispose();
  });

  it('disposes owned geometry once while leaving caller-owned materials alive', () => {
    const data = recovered('woodland');
    const material = new THREE.MeshBasicMaterial();
    const result = createOriginalScene(data, 1, () => material);
    const disposals: number[] = [];
    let materialDisposals = 0;
    material.addEventListener('dispose', () => materialDisposals++);
    result.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const index = disposals.push(0) - 1;
      object.geometry.addEventListener('dispose', () => disposals[index]++);
    });
    const scene = new THREE.Scene(); scene.add(result.group);
    result.dispose(); result.dispose();
    expect(scene.children).toHaveLength(0);
    expect(disposals.every(value => value === 1)).toBe(true);
    expect(materialDisposals).toBe(0);
    material.dispose();
  });
});
