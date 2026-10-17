import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createPerimeterWallPresentation,
  type PerimeterWallPresentation,
  type PerimeterWallPresentationMaterials,
} from './perimeterWallPresentation';

function materials(): PerimeterWallPresentationMaterials {
  return {
    concrete: new THREE.MeshStandardMaterial(),
    dark: new THREE.MeshStandardMaterial(),
    snow: new THREE.MeshStandardMaterial(),
    accent: new THREE.MeshStandardMaterial(),
  };
}

function meshes(presentation: PerimeterWallPresentation): readonly THREE.Mesh[] {
  return [
    presentation.batches.concrete,
    presentation.batches.dark,
    presentation.batches.snow,
    presentation.batches.accent,
  ];
}

function attributeValues(geometry: THREE.BufferGeometry, name: string): number[] {
  return Array.from(geometry.getAttribute(name).array as ArrayLike<number>);
}

describe('createPerimeterWallPresentation', () => {
  it('merges the 236 authored boxes into exactly four fixed material batches', () => {
    const parent = new THREE.Group();
    const injected = materials();
    const presentation = createPerimeterWallPresentation(parent, injected);
    const batches = meshes(presentation);
    expect(parent.children).toEqual([presentation.root]);
    expect(presentation.root.children).toEqual(batches);
    expect(batches.every((mesh) => mesh instanceof THREE.Mesh && !(mesh instanceof THREE.InstancedMesh))).toBe(true);
    expect(new Set(batches.map((mesh) => mesh.geometry)).size).toBe(4);
    expect(batches.map((mesh) => mesh.material)).not.toContain(injected.concrete);
    expect(batches.map((mesh) => mesh.material)).not.toContain(injected.dark);
    expect(batches.map((mesh) => mesh.material)).not.toContain(injected.snow);
    expect(batches.map((mesh) => mesh.material)).not.toContain(injected.accent);
    expect(batches.map((mesh) => (mesh.geometry.index?.count ?? 0) / 3)).toEqual([1728, 528, 528, 48]);
    expect(presentation.stats).toEqual({
      quality: 'high',
      authoredParts: 236,
      panelTriangles: 1056,
      submittedTriangles: 2832,
      drawCalls: 4,
      geometries: 4,
      ownedGeometries: 4,
      injectedMaterials: 4,
      ownedMaterials: 4,
      ownedTextures: 0,
      colliders: 0,
      perFrameUpdates: 0,
    });
    expect(Object.isFrozen(presentation.stats)).toBe(true);
    expect(Object.isFrozen(presentation.batches)).toBe(true);
    expect('update' in presentation).toBe(false);
    presentation.dispose();
    Object.values(injected).forEach((material) => material.dispose());
  });

  it('uploads finite static indexed buffers, physical UVs, tint variation, and bounds', () => {
    const injected = materials();
    const presentation = createPerimeterWallPresentation(new THREE.Group(), injected);
    for (const mesh of meshes(presentation)) {
      const geometry = mesh.geometry;
      expect(geometry.index).not.toBeNull();
      expect(geometry.index?.usage).toBe(THREE.StaticDrawUsage);
      for (const name of ['position', 'normal', 'uv', 'color']) {
        const attribute = geometry.getAttribute(name) as THREE.BufferAttribute;
        expect(attribute.usage).toBe(THREE.StaticDrawUsage);
        expect(Array.from(attribute.array as ArrayLike<number>).every(Number.isFinite)).toBe(true);
      }
      expect(geometry.getAttribute('position').count).toBe(geometry.getAttribute('normal').count);
      expect(geometry.getAttribute('position').count).toBe(geometry.getAttribute('uv').count);
      expect(geometry.getAttribute('position').count).toBe(geometry.getAttribute('color').count);
      expect(geometry.boundingBox).not.toBeNull();
      expect(geometry.boundingSphere).not.toBeNull();
      expect(mesh.frustumCulled).toBe(true);
      expect(mesh.matrixAutoUpdate).toBe(false);
      expect(mesh.matrix.equals(new THREE.Matrix4())).toBe(true);
      expect(mesh.userData.presentationOnly).toBe(true);
      expect(mesh.userData.authoritativeColliders).toMatch(/blueprint\.colliders/);
    }
    expect(presentation.root.matrixAutoUpdate).toBe(false);
    expect(presentation.root.matrix.equals(new THREE.Matrix4())).toBe(true);
    expect(presentation.batches.concrete.geometry.boundingBox?.min.toArray()).toEqual([-60.625, 0, -58.625]);
    expect(presentation.batches.concrete.geometry.boundingBox?.max.toArray()).toEqual([60.625, 3.5, 58.625]);

    const uv = presentation.batches.concrete.geometry.getAttribute('uv');
    const faceU = [uv.getX(16), uv.getX(17), uv.getX(18), uv.getX(19)];
    const faceV = [uv.getY(16), uv.getY(17), uv.getY(18), uv.getY(19)];
    expect(Math.max(...faceU) - Math.min(...faceU)).toBeCloseTo(10 / 3, 5);
    expect(Math.max(...faceV) - Math.min(...faceV)).toBeCloseTo(1.6 / 2, 5);

    const color = presentation.batches.concrete.geometry.getAttribute('color');
    const firstPanel = [color.getX(0), color.getY(0), color.getZ(0)];
    const secondPanel = [color.getX(24), color.getY(24), color.getZ(24)];
    const firstPost = [color.getX(88 * 24), color.getY(88 * 24), color.getZ(88 * 24)];
    expect(secondPanel).not.toEqual(firstPanel);
    expect(firstPost[0]).toBeLessThan(firstPanel[0]);
    for (const material of Object.values(injected)) expect((material as THREE.MeshStandardMaterial).vertexColors).toBe(false);
    for (const mesh of meshes(presentation)) expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    presentation.dispose();
    Object.values(injected).forEach((material) => material.dispose());
  });

  it('uses its deterministic seed only for per-part UV phase and colour', () => {
    const firstMaterials = materials();
    const secondMaterials = materials();
    const changedMaterials = materials();
    const first = createPerimeterWallPresentation(new THREE.Group(), firstMaterials, { seed: 'stable' });
    const second = createPerimeterWallPresentation(new THREE.Group(), secondMaterials, { seed: 'stable' });
    const changed = createPerimeterWallPresentation(new THREE.Group(), changedMaterials, { seed: 'changed' });
    const firstGeometry = first.batches.concrete.geometry;
    const secondGeometry = second.batches.concrete.geometry;
    const changedGeometry = changed.batches.concrete.geometry;
    expect(attributeValues(firstGeometry, 'position')).toEqual(attributeValues(secondGeometry, 'position'));
    expect(attributeValues(firstGeometry, 'position')).toEqual(attributeValues(changedGeometry, 'position'));
    expect(Array.from(firstGeometry.index!.array)).toEqual(Array.from(secondGeometry.index!.array));
    expect(Array.from(firstGeometry.index!.array)).toEqual(Array.from(changedGeometry.index!.array));
    expect(attributeValues(firstGeometry, 'uv')).toEqual(attributeValues(secondGeometry, 'uv'));
    expect(attributeValues(firstGeometry, 'color')).toEqual(attributeValues(secondGeometry, 'color'));
    expect(attributeValues(firstGeometry, 'uv')).not.toEqual(attributeValues(changedGeometry, 'uv'));
    expect(attributeValues(firstGeometry, 'color')).not.toEqual(attributeValues(changedGeometry, 'color'));
    first.dispose();
    second.dispose();
    changed.dispose();
    for (const group of [firstMaterials, secondMaterials, changedMaterials]) {
      Object.values(group).forEach((material) => material.dispose());
    }
  });

  it('switches to the exact 1056-triangle panel prefix without rebuilding', () => {
    const injected = materials();
    const presentation = createPerimeterWallPresentation(new THREE.Group(), injected);
    const concreteGeometry = presentation.batches.concrete.geometry;
    const geometries = meshes(presentation).map((mesh) => mesh.geometry);
    expect(concreteGeometry.drawRange).toEqual({ start: 0, count: 5184 });
    expect(meshes(presentation).every((mesh) => mesh.visible)).toBe(true);
    presentation.setDetailsVisible(false);
    expect(concreteGeometry.drawRange).toEqual({ start: 0, count: 3168 });
    expect(presentation.batches.concrete.visible).toBe(true);
    expect(presentation.batches.dark.visible).toBe(false);
    expect(presentation.batches.snow.visible).toBe(false);
    expect(presentation.batches.accent.visible).toBe(false);
    expect(meshes(presentation).map((mesh) => mesh.geometry)).toEqual(geometries);
    presentation.setDetailsVisible(true);
    expect(concreteGeometry.drawRange).toEqual({ start: 0, count: 5184 });
    expect(meshes(presentation).every((mesh) => mesh.visible)).toBe(true);
    presentation.dispose();
    Object.values(injected).forEach((material) => material.dispose());
  });

  it('idempotently releases owned geometry and material clones while preserving injected resources', () => {
    const parent = new THREE.Group();
    const injected = materials();
    const texture = new THREE.Texture();
    (injected.concrete as THREE.MeshStandardMaterial).map = texture;
    const presentation = createPerimeterWallPresentation(parent, injected);
    const geometryDisposals = meshes(presentation).map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));
    const ownedMaterialDisposals = meshes(presentation).map((mesh) => vi.spyOn(mesh.material as THREE.Material, 'dispose'));
    const materialDisposals = Object.values(injected).map((material) => vi.spyOn(material, 'dispose'));
    const textureDispose = vi.spyOn(texture, 'dispose');
    expect(presentation.batches.concrete.material).not.toBe(injected.concrete);
    expect((presentation.batches.concrete.material as THREE.MeshStandardMaterial).map).toBe(texture);
    expect((injected.concrete as THREE.MeshStandardMaterial).vertexColors).toBe(false);
    presentation.dispose();
    presentation.dispose();
    expect(parent.children).not.toContain(presentation.root);
    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    ownedMaterialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    materialDisposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    expect(textureDispose).not.toHaveBeenCalled();
    Object.values(injected).forEach((material) => material.dispose());
    texture.dispose();
  });

  it('validates its high-only API, seed, parent, and four injected materials', () => {
    const injected = materials();
    expect(() => createPerimeterWallPresentation({} as THREE.Object3D, injected)).toThrow(/parent.*THREE\.Object3D/i);
    expect(() => createPerimeterWallPresentation(new THREE.Group(), injected, {
      quality: 'low' as 'high',
    })).toThrow(/high quality only/i);
    expect(() => createPerimeterWallPresentation(new THREE.Group(), injected, { seed: Number.NaN })).toThrow(/seed.*safe integer/i);
    expect(() => createPerimeterWallPresentation(new THREE.Group(), injected, { seed: '' })).toThrow(/seed.*non-empty/i);
    expect(() => createPerimeterWallPresentation(new THREE.Group(), {
      ...injected,
      snow: {} as THREE.Material,
    })).toThrow(/snow material.*THREE\.Material/i);
    Object.values(injected).forEach((material) => material.dispose());
  });
});
