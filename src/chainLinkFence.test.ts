import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  CHAIN_LINK_TEXTURE_RESOLUTIONS,
  createChainLinkFencePresentation,
  type ChainLinkFencePresentation,
} from './chainLinkFence';
import { SECURITY_FENCE_RUNS } from './securityInfrastructureBlueprint';

function matrixArray(presentation: ChainLinkFencePresentation): number[] {
  return Array.from(presentation.batches.infill.instanceMatrix.array);
}

describe('createChainLinkFencePresentation', () => {
  it('fills all three authoritative fence runs with stable oriented panels', () => {
    const parent = new THREE.Group();
    const presentation = createChainLinkFencePresentation(parent, SECURITY_FENCE_RUNS, {
      quality: 'high',
      castShadow: false,
    });

    expect(parent.children).toEqual([presentation.group]);
    expect(presentation.group.children).toEqual([
      presentation.batches.infill,
      presentation.batches.snowEdges,
    ]);
    expect(presentation.batches.infill.count).toBe(22);
    expect(presentation.batches.snowEdges.count).toBe(3);
    expect(presentation.batches.infill.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
    expect(presentation.batches.infill.castShadow).toBe(false);
    expect(presentation.batches.infill.receiveShadow).toBe(true);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    // First instance indices for east, west and north runs: 0, 7 and 16.
    const expected = [
      { index: 0, x: 47, z: 15.52, rotationY: Math.PI / 2 },
      { index: 7, x: -42, z: -5.942222222222222, rotationY: Math.PI / 2 },
      { index: 16, x: 10.55, z: 43, rotationY: 0 },
    ];
    for (const item of expected) {
      presentation.batches.infill.getMatrixAt(item.index, matrix);
      matrix.decompose(position, rotation, scale);
      expect(position.x).toBeCloseTo(item.x, 6);
      expect(position.y).toBeCloseTo(1.075, 6);
      expect(position.z).toBeCloseTo(item.z, 6);
      expect(rotation.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.rotationY))).toBeCloseTo(0, 6);
      expect(scale.y).toBeCloseTo(1.83, 6);
    }

    presentation.dispose();
  });

  it('uses one opaque alpha-tested double-sided diamond material in both tiers', () => {
    const low = createChainLinkFencePresentation(new THREE.Group(), SECURITY_FENCE_RUNS, { quality: 'low' });
    const high = createChainLinkFencePresentation(new THREE.Group(), SECURITY_FENCE_RUNS, { quality: 'high' });

    for (const presentation of [low, high]) {
      const { linkMaterial, diamondTexture } = presentation.resources;
      expect(presentation.batches.infill.material).toBe(linkMaterial);
      expect(linkMaterial.map).toBe(diamondTexture);
      expect(linkMaterial.alphaTest).toBeGreaterThan(0);
      expect(linkMaterial.transparent).toBe(false);
      expect(linkMaterial.depthWrite).toBe(true);
      expect(linkMaterial.depthTest).toBe(true);
      expect(linkMaterial.side).toBe(THREE.DoubleSide);
      expect(diamondTexture.wrapS).toBe(THREE.RepeatWrapping);
      expect(diamondTexture.wrapT).toBe(THREE.RepeatWrapping);
      const alpha = Array.from((diamondTexture.image.data as Uint8Array).filter((_value, index) => index % 4 === 3));
      expect(Math.min(...alpha)).toBe(0);
      expect(Math.max(...alpha)).toBe(255);
    }
    expect(low.resources.diamondTexture.image.width).toBe(CHAIN_LINK_TEXTURE_RESOLUTIONS.low);
    expect(high.resources.diamondTexture.image.width).toBe(CHAIN_LINK_TEXTURE_RESOLUTIONS.high);
    expect(low.resources.diamondTexture.generateMipmaps).toBe(false);
    expect(high.resources.diamondTexture.generateMipmaps).toBe(true);
    expect(low.batches.snowEdges.visible).toBe(false);
    expect(high.batches.snowEdges.visible).toBe(true);
    expect(low.stats.drawCalls).toBe(1);

    low.dispose();
    high.dispose();
  });

  it('stays within two draw calls and 400 submitted triangles without creating collision', () => {
    const presentation = createChainLinkFencePresentation(new THREE.Group());

    expect(presentation.stats).toEqual({
      quality: 'high',
      runs: 3,
      panelInstances: 22,
      snowEdgeInstances: 3,
      totalInstances: 25,
      drawCalls: 2,
      submittedTriangles: 80,
      textureResolution: 128,
      colliders: 0,
    });
    expect(Object.isFrozen(presentation.stats)).toBe(true);
    expect(presentation.stats.drawCalls).toBeLessThanOrEqual(3);
    expect(presentation.stats.submittedTriangles).toBeLessThanOrEqual(400);
    expect('colliders' in presentation).toBe(false);
    expect(presentation.group.userData.colliderPolicy).toBe('external');
    expect(presentation.group.userData.decorative).toBe(true);

    presentation.dispose();
  });

  it('keeps layout deterministic and identical between quality tiers', () => {
    const first = createChainLinkFencePresentation(new THREE.Group(), SECURITY_FENCE_RUNS, { quality: 'high' });
    const second = createChainLinkFencePresentation(new THREE.Group(), SECURITY_FENCE_RUNS, { quality: 'high' });
    const low = createChainLinkFencePresentation(new THREE.Group(), SECURITY_FENCE_RUNS, { quality: 'low' });

    expect(matrixArray(first)).toEqual(matrixArray(second));
    expect(matrixArray(first)).toEqual(matrixArray(low));
    expect(Array.from(first.batches.snowEdges.instanceMatrix.array)).toEqual(
      Array.from(low.batches.snowEdges.instanceMatrix.array),
    );

    first.dispose();
    second.dispose();
    low.dispose();
  });

  it('disposes all owned resources exactly once and validates compatible runs', () => {
    const parent = new THREE.Group();
    const presentation = createChainLinkFencePresentation(parent);
    const disposals = [
      vi.spyOn(presentation.batches.infill.geometry, 'dispose'),
      vi.spyOn(presentation.batches.snowEdges.geometry, 'dispose'),
      vi.spyOn(presentation.resources.linkMaterial, 'dispose'),
      vi.spyOn(presentation.resources.snowMaterial, 'dispose'),
      vi.spyOn(presentation.resources.diamondTexture, 'dispose'),
    ];

    presentation.dispose();
    presentation.dispose();
    expect(parent.children).not.toContain(presentation.group);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);

    expect(() => createChainLinkFencePresentation(new THREE.Group(), [
      { id: '', x: 0, z: 0, length: 2, rotationY: 0 },
    ])).toThrow(/id/);
    expect(() => createChainLinkFencePresentation(new THREE.Group(), [
      { id: 'bad', x: Number.NaN, z: 0, length: 2, rotationY: 0 },
    ])).toThrow(/\.x/);
    expect(() => createChainLinkFencePresentation(new THREE.Group(), [
      { id: 'bad', x: 0, z: 0, length: .1, rotationY: 0 },
    ])).toThrow(/length/);
    expect(() => createChainLinkFencePresentation(new THREE.Group(), [
      { id: 'bad', x: 0, z: 0, length: 2, rotationY: Infinity },
    ])).toThrow(/rotationY/);
    expect(() => createChainLinkFencePresentation(new THREE.Group(), [
      { id: 'same', x: 0, z: 0, length: 2, rotationY: 0 },
      { id: 'same', x: 3, z: 0, length: 2, rotationY: 0 },
    ])).toThrow(/unique/);
  });
});
