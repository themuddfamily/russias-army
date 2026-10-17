import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createSnowGroundDressing,
  SNOW_GROUND_BATCH_CAP,
  WINTER_DECAL_PROGRAM_KEY,
  type SnowGroundDressingOptions,
} from './snowGroundDressing';

const SMALL_LAYOUT: Pick<SnowGroundDressingOptions, 'roadEdges' | 'footings'> = {
  roadEdges: [{ start: [-10, 0], end: [10, 0], inside: 1 }],
  footings: [{ center: [0, 8], size: [6, 4], entrance: 'south' }],
};

function matrixData(mesh: THREE.InstancedMesh): number[] {
  return Array.from(mesh.instanceMatrix.array);
}

describe('createSnowGroundDressing', () => {
  it('builds a known low-quality layout in two collision-free static batches', () => {
    const parent = new THREE.Group();
    const dressing = createSnowGroundDressing(parent, { ...SMALL_LAYOUT, seed: 'counts', quality: 'low' });

    expect(parent.children).toContain(dressing.root);
    expect(dressing.root.children).toEqual([dressing.drifts, dressing.decals]);
    expect(dressing.stats).toEqual({
      batches: 2,
      driftInstances: 7,
      decalInstances: 13,
      tireMarks: 4,
      bootMarks: 3,
      slushMarks: 6,
      triangles: 314,
    });
    expect(dressing.drifts.count).toBe(dressing.stats.driftInstances);
    expect(dressing.decals.count).toBe(dressing.stats.decalInstances);
    expect(dressing.drifts.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
    expect(dressing.decals.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
    expect(dressing.root.userData.visualOnly).toBe(true);
    expect(dressing.drifts.userData.visualOnly).toBe(true);
    expect(dressing.decals.userData.visualOnly).toBe(true);
    expect(dressing.stats.batches).toBeLessThanOrEqual(SNOW_GROUND_BATCH_CAP);
    const decalMaterial = dressing.decals.material as THREE.MeshStandardMaterial;
    expect(decalMaterial.userData.softWinterDecal).toBe(true);
    expect(decalMaterial.customProgramCacheKey()).toBe(WINTER_DECAL_PROGRAM_KEY);
    const shader = {
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>',
      uniforms: {},
    };
    decalMaterial.onBeforeCompile(shader as never, {} as never);
    expect(shader.vertexShader).toContain('vWinterDecalUv = uv');
    expect(shader.fragmentShader).toContain('winterDecalRadius');
    expect(shader.fragmentShader).toContain('smoothstep( 0.56, 1.02');

    dressing.dispose();
  });

  it('produces identical instance matrices for the same seed and different dressing for another seed', () => {
    const first = createSnowGroundDressing(new THREE.Group(), { ...SMALL_LAYOUT, seed: 'stable', quality: 'high' });
    const second = createSnowGroundDressing(new THREE.Group(), { ...SMALL_LAYOUT, seed: 'stable', quality: 'high' });
    const changed = createSnowGroundDressing(new THREE.Group(), { ...SMALL_LAYOUT, seed: 'changed', quality: 'high' });

    expect(matrixData(first.drifts)).toEqual(matrixData(second.drifts));
    expect(matrixData(first.decals)).toEqual(matrixData(second.decals));
    expect(matrixData(first.drifts)).not.toEqual(matrixData(changed.drifts));
    expect(matrixData(first.decals)).not.toEqual(matrixData(changed.decals));

    first.dispose();
    second.dispose();
    changed.dispose();
  });

  it('uses tapered berm and irregular track geometry with sunk outer boundaries', () => {
    const dressing = createSnowGroundDressing(new THREE.Group(), { ...SMALL_LAYOUT, seed: 'berm-shape', quality: 'high' });
    const driftPositions = dressing.drifts.geometry.getAttribute('position');
    const driftUvs = dressing.drifts.geometry.getAttribute('uv');
    const decalPositions = dressing.decals.geometry.getAttribute('position');

    expect(dressing.drifts.geometry.name).toBe('TaperedSnowBermGeometry');
    expect(dressing.decals.geometry.name).toBe('IrregularWinterTrackGeometry');
    expect(dressing.drifts.geometry.index?.count).toBe(90);
    expect(dressing.decals.geometry.index?.count).toBe(24);
    expect(driftPositions.count).toBe(24);
    expect(driftUvs.count).toBe(driftPositions.count);
    expect(Math.min(...Array.from(driftPositions.array).filter((_, index) => index % 3 === 1))).toBeLessThan(0);
    expect(Math.max(...Array.from(driftPositions.array).filter((_, index) => index % 3 === 1))).toBeGreaterThan(.7);

    const radii = Array.from({ length: decalPositions.count - 1 }, (_, index) => {
      const vertex = index + 1;
      return Math.hypot(decalPositions.getX(vertex), decalPositions.getY(vertex));
    });
    expect(new Set(radii.map((radius) => radius.toFixed(2))).size).toBeGreaterThan(4);
    dressing.dispose();
  });

  it('keeps footing snow outside the solid footprint and raises decals off the ground', () => {
    const dressing = createSnowGroundDressing(new THREE.Group(), {
      roadEdges: [],
      footings: [{ center: [3, -2], size: [8, 6], clearance: .5, entrance: 'east' }],
      seed: 17,
      quality: 'high',
      groundY: .1,
    });
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();

    for (let index = 0; index < dressing.drifts.count; index++) {
      dressing.drifts.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix);
      const insideFootprint = Math.abs(position.x - 3) < 4 && Math.abs(position.z + 2) < 3;
      expect(insideFootprint).toBe(false);
      expect(position.y).toBeCloseTo(.1);
    }
    for (let index = 0; index < dressing.decals.count; index++) {
      dressing.decals.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix);
      expect(position.y).toBeCloseTo(.132);
    }

    dressing.dispose();
  });

  it('keeps snow banks out of doorway gaps and supports track-only road spans', () => {
    const footing = createSnowGroundDressing(new THREE.Group(), {
      roadEdges: [],
      footings: [{ center: [0, 0], size: [10, 6], clearance: 0, entrance: 'south', entranceWidth: 3 }],
      seed: 'clear-door',
      quality: 'high',
    });
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let index = 0; index < footing.drifts.count; index++) {
      footing.drifts.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix);
      const blocksDoor = position.z > 2.8 && Math.abs(position.x) < 1.85;
      expect(blocksDoor).toBe(false);
    }
    footing.dispose();

    const tracksOnly = createSnowGroundDressing(new THREE.Group(), {
      roadEdges: [{ start: [-10, 0], end: [10, 0], inside: 1, drifts: false }],
      footings: [],
      seed: 'tracks-only',
      quality: 'low',
    });
    expect(tracksOnly.stats.driftInstances).toBe(0);
    expect(tracksOnly.stats.decalInstances).toBeGreaterThan(0);
    tracksOnly.dispose();
  });

  it('aligns road marks with their edge direction and clears a sampled crowned surface', () => {
    const surfaceHeightAt = (x: number, z: number): number | undefined => (
      Math.abs(x) <= 12 && Math.abs(z) <= 4 ? .03 + z * .004 : undefined
    );
    const dressing = createSnowGroundDressing(new THREE.Group(), {
      roadEdges: [{ start: [-10, 0], end: [10, 0], inside: 1, drifts: false }],
      footings: [],
      seed: 'height-coherent-road-marks',
      quality: 'high',
      surfaceHeightAt,
    });
    const matrix = new THREE.Matrix4();
    const origin = new THREE.Vector3();
    const localAlong = new THREE.Vector3(1, 0, 0);
    const worldAlong = new THREE.Vector3();
    const vertex = new THREE.Vector3();
    const positions = dressing.decals.geometry.getAttribute('position');

    for (let instance = 0; instance < dressing.decals.count; instance++) {
      dressing.decals.getMatrixAt(instance, matrix);
      origin.setFromMatrixPosition(matrix);
      worldAlong.copy(localAlong).transformDirection(matrix);
      expect(Math.abs(worldAlong.x)).toBeGreaterThan(.985);
      expect(Math.abs(worldAlong.z)).toBeLessThan(.18);
      for (let index = 0; index < positions.count; index++) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(matrix);
        const height = surfaceHeightAt(vertex.x, vertex.z);
        expect(height).toBeDefined();
        expect(vertex.y - height!).toBeGreaterThanOrEqual(.004);
        expect(vertex.y - height!).toBeLessThanOrEqual(.012);
      }
      expect(origin.y).toBeGreaterThan(.03);
    }
    dressing.dispose();
  });

  it('rejects non-finite visual-surface heights before allocating GPU resources', () => {
    expect(() => createSnowGroundDressing(new THREE.Group(), {
      roadEdges: [{ start: [-10, 0], end: [10, 0], inside: 1, drifts: false }],
      footings: [],
      surfaceHeightAt: () => Number.NaN,
    })).toThrow(/surfaceHeightAt.*finite/i);
  });

  it('clears every doorway footprint and emits a trail for each entrance', () => {
    const dressing = createSnowGroundDressing(new THREE.Group(), {
      roadEdges: [],
      footings: [{
        center: [0, 0],
        size: [10, 6],
        clearance: 0,
        entrances: [{ side: 'south', width: 3 }, { side: 'east', width: 2.4 }],
      }],
      seed: 'multiple-doorways',
      quality: 'high',
    });
    expect(dressing.stats.bootMarks).toBe(12);

    dressing.drifts.geometry.computeBoundingBox();
    const localBounds = dressing.drifts.geometry.boundingBox!;
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < dressing.drifts.count; index++) {
      dressing.drifts.getMatrixAt(index, matrix);
      const bounds = localBounds.clone().applyMatrix4(matrix);
      const blocksSouth = bounds.max.z > 2.8 && bounds.max.x > -1.5 && bounds.min.x < 1.5;
      const blocksEast = bounds.max.x > 4.8 && bounds.max.z > -1.2 && bounds.min.z < 1.2;
      expect(blocksSouth || blocksEast).toBe(false);
    }
    dressing.dispose();
  });

  it('disposes owned geometry and materials once while preserving caller-owned materials', () => {
    const parent = new THREE.Group();
    const owned = createSnowGroundDressing(parent, { ...SMALL_LAYOUT, seed: 1, quality: false });
    const ownedDisposals = [
      vi.spyOn(owned.drifts.geometry, 'dispose'),
      vi.spyOn(owned.decals.geometry, 'dispose'),
      vi.spyOn(owned.drifts.material as THREE.Material, 'dispose'),
      vi.spyOn(owned.decals.material as THREE.Material, 'dispose'),
    ];

    owned.dispose();
    owned.dispose();

    expect(parent.children).not.toContain(owned.root);
    for (const dispose of ownedDisposals) expect(dispose).toHaveBeenCalledTimes(1);

    const snowMaterial = new THREE.MeshStandardMaterial();
    const decalMaterial = new THREE.MeshBasicMaterial();
    const snowDispose = vi.spyOn(snowMaterial, 'dispose');
    const decalDispose = vi.spyOn(decalMaterial, 'dispose');
    const injected = createSnowGroundDressing(new THREE.Group(), {
      ...SMALL_LAYOUT,
      material: snowMaterial,
      decalMaterial,
    });
    injected.dispose();

    expect(snowDispose).not.toHaveBeenCalled();
    expect(decalDispose).not.toHaveBeenCalled();
    snowMaterial.dispose();
    decalMaterial.dispose();
  });

  it('holds the default enhanced layout below the hard batch cap and validates bad geometry', () => {
    const dressing = createSnowGroundDressing(new THREE.Group(), { seed: 'full-layout', quality: true });
    const low = createSnowGroundDressing(new THREE.Group(), { seed: 'full-layout', quality: false });

    expect(dressing.stats.batches).toBe(2);
    expect(dressing.stats.batches).toBeLessThanOrEqual(SNOW_GROUND_BATCH_CAP);
    expect(dressing.stats.driftInstances).toBeGreaterThan(100);
    expect(dressing.stats.decalInstances).toBeGreaterThan(150);
    expect(dressing.stats.triangles).toBeLessThanOrEqual(7_500);
    expect(low.stats.triangles).toBeLessThanOrEqual(4_600);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let maximumDecalLength = 0;
    for (let index = 0; index < dressing.decals.count; index++) {
      dressing.decals.getMatrixAt(index, matrix);
      matrix.decompose(position, rotation, scale);
      maximumDecalLength = Math.max(maximumDecalLength, scale.x);
    }
    expect(maximumDecalLength).toBeLessThan(4);
    dressing.dispose();
    low.dispose();

    expect(() => createSnowGroundDressing(new THREE.Group(), {
      roadEdges: [{ start: [0, 0], end: [1, Number.NaN] }],
      footings: [],
    })).toThrow(/finite/);
    expect(() => createSnowGroundDressing(new THREE.Group(), {
      roadEdges: [],
      footings: [{ center: [0, 0], size: [0, 2] }],
    })).toThrow(/greater than zero/);
  });
});
