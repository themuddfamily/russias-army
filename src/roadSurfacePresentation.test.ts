import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createRoadSurfaceHeightSampler,
  createRoadSurfacePresentation,
  type RoadSurfacePoint,
  type RoadSurfacePresentation,
} from './roadSurfacePresentation';

function attributeValues(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number[] {
  return Array.from(attribute.array);
}

function instanceMatrices(mesh: THREE.InstancedMesh): number[] {
  return Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16));
}

function projectedAreaAndWinding(geometry: THREE.BufferGeometry): { area: number; minimumSignedArea: number } {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index) throw new Error('Expected indexed road geometry.');
  let area = 0;
  let minimumSignedArea = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    const abX = position.getX(b) - position.getX(a);
    const abZ = position.getZ(b) - position.getZ(a);
    const acX = position.getX(c) - position.getX(a);
    const acZ = position.getZ(c) - position.getZ(a);
    const signedArea = (abZ * acX - abX * acZ) * .5;
    minimumSignedArea = Math.min(minimumSignedArea, signedArea);
    area += signedArea;
  }
  return { area, minimumSignedArea };
}

function expectFiniteGeometry(geometry: THREE.BufferGeometry): void {
  expect(geometry.getIndex()).not.toBeNull();
  for (const name of ['position', 'normal', 'uv']) {
    const attribute = geometry.getAttribute(name);
    expect(attribute, name).toBeDefined();
    expect(attributeValues(attribute).every(Number.isFinite), `${name} must be finite`).toBe(true);
  }
  expect(Array.from(geometry.getIndex()!.array).every(Number.isFinite)).toBe(true);
}

function disposeAll(...presentations: RoadSurfacePresentation[]): void {
  for (const presentation of presentations) presentation.dispose();
}

function raycastHeight(presentation: RoadSurfacePresentation, point: RoadSurfacePoint): number | undefined {
  presentation.root.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(point.x, 2, point.z),
    new THREE.Vector3(0, -1, 0),
  );
  return raycaster.intersectObject(presentation.surface, false)[0]?.point.y;
}

function expectOverlayClearance(
  presentation: RoadSurfacePresentation,
  overlay: THREE.InstancedMesh,
): void {
  presentation.root.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4();
  const centre = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  for (let index = 0; index < overlay.count; index++) {
    overlay.getMatrixAt(index, matrix);
    centre.setFromMatrixPosition(matrix).applyMatrix4(overlay.matrixWorld);
    raycaster.set(new THREE.Vector3(centre.x, 1, centre.z), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(presentation.surface, false)[0];
    expect(hit, `overlay ${overlay.name} instance ${index} must remain above the road`).toBeDefined();
    const clearance = centre.y - hit.point.y;
    expect(clearance, `overlay ${overlay.name} instance ${index} clearance`).toBeGreaterThanOrEqual(.005);
    expect(clearance, `overlay ${overlay.name} instance ${index} clearance`).toBeLessThanOrEqual(.012);
  }
}

describe('createRoadSurfacePresentation', () => {
  it('reports exact default quality costs inside the hard presentation budgets', () => {
    const low = createRoadSurfacePresentation(new THREE.Group(), { quality: 'low' });
    const high = createRoadSurfacePresentation(new THREE.Group(), { quality: 'high' });

    expect(low.stats).toEqual({
      quality: 'low',
      length: 145,
      nominalWidth: 13,
      nominalArea: 3_601,
      projectedArea: 3_601,
      minimumClearWidth: 13,
      maximumSurfaceHeight: .015,
      surfaceTriangles: 10,
      markingInstances: 92,
      repairInstances: 0,
      drawCalls: 2,
      geometries: 2,
      colliders: 0,
      submittedTriangles: 746,
    });
    expect(high.stats).toEqual({
      quality: 'high',
      length: 145,
      nominalWidth: 13,
      nominalArea: 3_601,
      projectedArea: 3_588,
      minimumClearWidth: 12.846365,
      maximumSurfaceHeight: .055,
      surfaceTriangles: 1_664,
      markingInstances: 92,
      repairInstances: 12,
      drawCalls: 3,
      geometries: 3,
      colliders: 0,
      submittedTriangles: 2_496,
    });
    expect(low.stats.submittedTriangles).toBeLessThanOrEqual(1_200);
    expect(high.stats.submittedTriangles).toBeLessThanOrEqual(2_600);
    expect(low.root.children).toEqual([low.surface, low.markings]);
    expect(high.root.children).toEqual([high.surface, high.markings, high.repairs]);
    expect(Object.isFrozen(low.stats)).toBe(true);
    expect(Object.isFrozen(high.stats)).toBe(true);
    expect(low.root.userData).toMatchObject({ presentationOnly: true, authoritativeColliders: 'none' });
    expect(high.root.userData).toMatchObject({ presentationOnly: true, authoritativeColliders: 'none' });
    disposeAll(low, high);
  });

  it('builds finite indexed upward-facing topology with exact bounds and projected areas', () => {
    for (const quality of ['low', 'high'] as const) {
      const presentation = createRoadSurfacePresentation(new THREE.Group(), { quality });
      const geometry = presentation.surface.geometry;
      expectFiniteGeometry(geometry);
      const bounds = geometry.boundingBox!;
      const projected = projectedAreaAndWinding(geometry);

      expect(bounds.min.x).toBe(-72.5);
      expect(bounds.max.x).toBe(72.5);
      expect(bounds.min.z).toBe(-72.5);
      expect(bounds.max.z).toBe(72.5);
      expect(bounds.min.y).toBeGreaterThanOrEqual(.01);
      expect(bounds.max.y).toBeLessThanOrEqual(.07);
      expect(projected.minimumSignedArea).toBeGreaterThan(0);
      expect(projected.area).toBeCloseTo(presentation.stats.projectedArea, 3);
      expect(projected.area).toBeGreaterThanOrEqual(presentation.stats.nominalArea * .995);
      expect(projected.area).toBeLessThanOrEqual(presentation.stats.nominalArea);
      presentation.dispose();
    }
  });

  it('uses continuous world-space UVs and shared crowned junction seams', () => {
    const presentation = createRoadSurfacePresentation(new THREE.Group(), { quality: 'high' });
    const geometry = presentation.surface.geometry;
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    const normal = geometry.getAttribute('normal');
    const seamCounts = { east: 0, west: 0, south: 0, north: 0 };

    for (let vertex = 0; vertex < position.count; vertex++) {
      const x = position.getX(vertex);
      const z = position.getZ(vertex);
      expect(uv.getX(vertex)).toBeCloseTo(x / 13, 6);
      expect(uv.getY(vertex)).toBeCloseTo(z / 13, 6);
      const normalLength = Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
      expect(normalLength).toBeCloseTo(1, 5);
      expect(normal.getY(vertex)).toBeGreaterThan(0);
      if (Math.abs(z) <= 6.5 + 1e-6 && Math.abs(x - 6.5) < 1e-6) seamCounts.east++;
      if (Math.abs(z) <= 6.5 + 1e-6 && Math.abs(x + 6.5) < 1e-6) seamCounts.west++;
      if (Math.abs(x) <= 6.5 + 1e-6 && Math.abs(z - 6.5) < 1e-6) seamCounts.south++;
      if (Math.abs(x) <= 6.5 + 1e-6 && Math.abs(z + 6.5) < 1e-6) seamCounts.north++;
    }
    // Shared vertex caching gives each 8-segment seam exactly nine vertices,
    // rather than duplicate arm and junction rows with divergent normals.
    expect(seamCounts).toEqual({ east: 9, west: 9, south: 9, north: 9 });
    presentation.dispose();
  });

  it('samples the exact rendered height across the junction, arms, and ragged shoulders', () => {
    const points: readonly RoadSurfacePoint[] = [
      { x: 0, z: 0 },
      { x: 4.1, z: -3.2 },
      { x: 29.3, z: 5.9 },
      { x: -47.4, z: -6.1 },
      { x: 5.7, z: 38.8 },
      { x: -5.8, z: -64.2 },
    ];
    for (const quality of ['low', 'high'] as const) {
      const presentation = createRoadSurfacePresentation(new THREE.Group(), {
        quality,
        seed: 'sampler-raycast-contract',
      });
      for (const point of points) {
        const expected = raycastHeight(presentation, point);
        const sampled = presentation.heightSampler.sample(point.x, point.z);
        expect(expected, `${quality} ray hit at ${point.x},${point.z}`).toBeDefined();
        expect(sampled, `${quality} sample at ${point.x},${point.z}`).toBeDefined();
        expect(sampled!.height).toBeCloseTo(expected!, 7);
        expect(presentation.heightSampler.heightAt(point.x, point.z)).toBeCloseTo(expected!, 7);
        expect(Math.hypot(sampled!.normalX, sampled!.normalY, sampled!.normalZ)).toBeCloseTo(1, 6);
        expect(sampled!.normalY).toBeGreaterThan(0);
      }
      expect(presentation.heightSampler.sample(8, 8)).toBeUndefined();
      expect(presentation.heightSampler.heightAt(73, 0)).toBeUndefined();
      presentation.dispose();
    }

    const shoulder = createRoadSurfacePresentation(new THREE.Group(), {
      quality: 'high',
      seed: 'sampler-raycast-contract',
    });
    const profile = (shoulder.surface.geometry.userData.shoulderProfiles as Array<{
      negativeInsets: readonly number[];
    }>)[0];
    let station = 1;
    for (let index = 2; index < profile.negativeInsets.length - 1; index++) {
      if (profile.negativeInsets[index] > profile.negativeInsets[station]) station = index;
    }
    const boundaryX = 6.5 + 66 * station / 24;
    const negativeBoundaryZ = -(6.5 - profile.negativeInsets[station]);
    const justInside = { x: boundaryX, z: negativeBoundaryZ + .002 };
    const justOutside = { x: boundaryX, z: negativeBoundaryZ - .002 };
    expect(shoulder.heightSampler.heightAt(justInside.x, justInside.z))
      .toBeCloseTo(raycastHeight(shoulder, justInside)!, 7);
    expect(shoulder.heightSampler.heightAt(justOutside.x, justOutside.z)).toBeUndefined();
    expect(raycastHeight(shoulder, justOutside)).toBeUndefined();
    shoulder.dispose();
  });

  it('computes centre and footprint-corner placement heights with explicit overlay clearance', () => {
    const presentation = createRoadSurfacePresentation(new THREE.Group(), {
      quality: 'high',
      seed: 'footprint-placement',
    });
    const footprints: readonly (readonly RoadSurfacePoint[])[] = [
      [
        { x: 2.2, z: -1.4 },
        { x: 1.3, z: -1.85 }, { x: 3.1, z: -1.85 },
        { x: 1.3, z: -.95 }, { x: 3.1, z: -.95 },
      ],
      [
        { x: 34, z: 3.8 },
        { x: 32.8, z: 3.45 }, { x: 35.2, z: 3.45 },
        { x: 32.8, z: 4.15 }, { x: 35.2, z: 4.15 },
      ],
      [
        { x: -3.7, z: -42 },
        { x: -4.05, z: -43.1 }, { x: -3.35, z: -43.1 },
        { x: -4.05, z: -40.9 }, { x: -3.35, z: -40.9 },
      ],
    ];
    for (const points of footprints) {
      const rayHeights = points.map((point) => raycastHeight(presentation, point));
      expect(rayHeights.every((height) => height !== undefined)).toBe(true);
      const surfaceMaximum = Math.max(...rayHeights as number[]);
      for (const clearance of [.004, .008, .012]) {
        const placement = presentation.heightSampler.placementHeight(points, clearance);
        expect(placement).toBeCloseTo(surfaceMaximum + clearance, 7);
        expect(placement! - surfaceMaximum).toBeGreaterThanOrEqual(.004 - 1e-8);
        expect(placement! - surfaceMaximum).toBeLessThanOrEqual(.012 + 1e-8);
      }
    }
    expect(presentation.heightSampler.placementHeight([{ x: 8, z: 8 }])).toBeUndefined();
    expect(() => presentation.heightSampler.placementHeight([])).toThrow(/at least one point/i);
    expect(() => presentation.heightSampler.placementHeight([{ x: 0, z: 0 }], -.001))
      .toThrow(/clearance.*non-negative/i);
    presentation.dispose();
  });

  it('can recreate the same standalone deterministic height contract', () => {
    const options = { quality: 'high' as const, length: 120, width: 12, seed: 'shared-contract' };
    const presentation = createRoadSurfacePresentation(new THREE.Group(), options);
    const standalone = createRoadSurfaceHeightSampler(options);
    const points = [
      { x: 0, z: 0 }, { x: 30, z: 4.7 }, { x: -3.2, z: -40 },
    ];
    expect(standalone).toMatchObject({ quality: 'high', length: 120, width: 12 });
    expect(Object.isFrozen(standalone)).toBe(true);
    for (const point of points) {
      expect(standalone.sample(point.x, point.z)).toEqual(
        presentation.heightSampler.sample(point.x, point.z),
      );
    }
    presentation.dispose();
  });

  it('authors a variable inward shoulder while retaining the required clear width and crown', () => {
    const presentation = createRoadSurfacePresentation(new THREE.Group(), { quality: 'high' });
    const geometry = presentation.surface.geometry;
    const profiles = geometry.userData.shoulderProfiles as Array<{
      negativeInsets: readonly number[];
      positiveInsets: readonly number[];
    }>;
    const widths: number[] = [];
    expect(profiles).toHaveLength(4);
    for (const profile of profiles) {
      expect(profile.negativeInsets).toHaveLength(25);
      expect(profile.positiveInsets).toHaveLength(25);
      expect(profile.negativeInsets[0]).toBe(0);
      expect(profile.positiveInsets[0]).toBe(0);
      expect(profile.negativeInsets.at(-1)).toBe(0);
      expect(profile.positiveInsets.at(-1)).toBe(0);
      for (let station = 0; station < profile.negativeInsets.length; station++) {
        expect(profile.negativeInsets[station]).toBeGreaterThanOrEqual(0);
        expect(profile.positiveInsets[station]).toBeGreaterThanOrEqual(0);
        widths.push(13 - profile.negativeInsets[station] - profile.positiveInsets[station]);
      }
    }
    expect(Math.min(...widths)).toBeCloseTo(presentation.stats.minimumClearWidth, 6);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(12.4);
    expect(Math.max(...widths)).toBe(13);
    expect(new Set(widths.map((value) => value.toFixed(4))).size).toBeGreaterThan(20);

    const yValues = attributeValues(geometry.getAttribute('position'))
      .filter((_, index) => index % 3 === 1);
    expect(Math.min(...yValues)).toBeGreaterThanOrEqual(.01);
    expect(Math.max(...yValues)).toBeCloseTo(.055, 6);
    expect(new Set(yValues.map((value) => value.toFixed(4))).size).toBeGreaterThan(8);
    presentation.dispose();
  });

  it('is deterministic for equal seeds and changes shoulders, paint wear, and repairs for another seed', () => {
    const first = createRoadSurfacePresentation(new THREE.Group(), { quality: 'high', seed: 'stable' });
    const second = createRoadSurfacePresentation(new THREE.Group(), { quality: 'high', seed: 'stable' });
    const changed = createRoadSurfacePresentation(new THREE.Group(), { quality: 'high', seed: 'changed' });

    expect(attributeValues(first.surface.geometry.getAttribute('position')))
      .toEqual(attributeValues(second.surface.geometry.getAttribute('position')));
    expect(instanceMatrices(first.markings)).toEqual(instanceMatrices(second.markings));
    expect(instanceMatrices(first.repairs!)).toEqual(instanceMatrices(second.repairs!));
    expect(attributeValues(first.surface.geometry.getAttribute('position')))
      .not.toEqual(attributeValues(changed.surface.geometry.getAttribute('position')));
    expect(attributeValues(first.surface.geometry.getAttribute('color')))
      .toEqual(attributeValues(second.surface.geometry.getAttribute('color')));
    expect(attributeValues(first.surface.geometry.getAttribute('color')))
      .not.toEqual(attributeValues(changed.surface.geometry.getAttribute('color')));
    expect(instanceMatrices(first.markings)).not.toEqual(instanceMatrices(changed.markings));
    expect(instanceMatrices(first.repairs!)).not.toEqual(instanceMatrices(changed.repairs!));
    expect(first.stats.projectedArea).toBe(changed.stats.projectedArea);
    disposeAll(first, second, changed);
  });

  it('adds bounded static macro breakup without changing surface topology or material ownership', () => {
    const injected = new THREE.MeshPhysicalMaterial({ vertexColors: false });
    const low = createRoadSurfacePresentation(new THREE.Group(), { quality: 'low' });
    const high = createRoadSurfacePresentation(new THREE.Group(), {
      quality: 'high',
      asphaltMaterial: injected,
      seed: 'macro-breakup',
    });
    const color = high.surface.geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(low.surface.geometry.getAttribute('color')).toBeUndefined();
    expect(color.count).toBe(high.surface.geometry.getAttribute('position').count);
    expect(color.usage).toBe(THREE.StaticDrawUsage);
    expect(Math.min(...attributeValues(color))).toBeGreaterThanOrEqual(.91 * .975 - 1e-6);
    expect(Math.max(...attributeValues(color))).toBeLessThanOrEqual(.995 + 1e-6);
    expect(new Set(attributeValues(color).map((value) => value.toFixed(4))).size).toBeGreaterThan(30);
    expect(injected.vertexColors).toBe(true);
    expect(high.stats.surfaceTriangles).toBe(1_664);
    expect(high.stats.drawCalls).toBe(3);
    disposeAll(low, high);
    injected.dispose();
  });

  it('uses economical ragged paint and repair instances without dynamic buffers', () => {
    const low = createRoadSurfacePresentation(new THREE.Group(), { quality: 'low' });
    const high = createRoadSurfacePresentation(new THREE.Group(), { quality: 'high' });

    expect(low.markings.geometry.name).toBe('WeatheredRoadMarkingGeometry');
    expect(low.markings.geometry.index?.count).toBe(24);
    expect(low.markings.count).toBe(92);
    expect(low.markings.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
    expect(high.repairs?.geometry.name).toBe('IrregularRoadRepairGeometry');
    expect(high.repairs?.geometry.index?.count).toBe(24);
    expect(high.repairs?.count).toBe(12);
    expect(high.repairs?.instanceMatrix.usage).toBe(THREE.StaticDrawUsage);
    expect(high.surface.castShadow).toBe(false);
    expect(high.surface.receiveShadow).toBe(true);
    expect(high.markings.castShadow).toBe(false);
    expect(high.repairs?.castShadow).toBe(false);
    for (const overlay of [low.markings, high.markings, high.repairs!]) {
      const material = overlay.material as THREE.MeshStandardMaterial;
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.polygonOffset).toBe(true);
      expect(material.side).toBe(THREE.FrontSide);
      expect(overlay.instanceColor).not.toBeNull();
      expect(Array.from(overlay.instanceColor!.array).every(Number.isFinite)).toBe(true);
      expect(overlay.boundingBox?.isEmpty()).toBe(false);
      expect(overlay.boundingSphere?.radius).toBeGreaterThan(0);
      expect([
        ...overlay.boundingBox!.min.toArray(),
        ...overlay.boundingBox!.max.toArray(),
        overlay.boundingSphere!.radius,
      ].every(Number.isFinite)).toBe(true);
    }
    expectOverlayClearance(low, low.markings);
    expectOverlayClearance(high, high.markings);
    expectOverlayClearance(high, high.repairs!);
    disposeAll(low, high);
  });

  it('disposes owned geometry and materials once while preserving injected asphalt', () => {
    const parent = new THREE.Group();
    const asphalt = new THREE.MeshPhysicalMaterial();
    const asphaltDispose = vi.spyOn(asphalt, 'dispose');
    const presentation = createRoadSurfacePresentation(parent, { asphaltMaterial: asphalt });
    const disposals = [
      vi.spyOn(presentation.surface.geometry, 'dispose'),
      vi.spyOn(presentation.markings.geometry, 'dispose'),
      vi.spyOn(presentation.markings.material as THREE.Material, 'dispose'),
      vi.spyOn(presentation.repairs!.geometry, 'dispose'),
      vi.spyOn(presentation.repairs!.material as THREE.Material, 'dispose'),
    ];

    expect(parent.children).toContain(presentation.root);
    presentation.dispose();
    presentation.dispose();
    expect(parent.children).not.toContain(presentation.root);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    expect(asphaltDispose).not.toHaveBeenCalled();
    asphalt.dispose();

    const fallback = createRoadSurfacePresentation(new THREE.Group(), { quality: 'low' });
    const fallbackAsphaltDispose = vi.spyOn(fallback.surface.material, 'dispose');
    fallback.dispose();
    fallback.dispose();
    expect(fallbackAsphaltDispose).toHaveBeenCalledTimes(1);
  });

  it('validates parent, quality, and dimensions before allocating a presentation', () => {
    expect(() => createRoadSurfacePresentation({} as THREE.Object3D)).toThrow(/parent/i);
    expect(() => createRoadSurfacePresentation(new THREE.Group(), { quality: 'ultra' as 'high' })).toThrow(/quality/i);
    expect(() => createRoadSurfacePresentation(new THREE.Group(), { length: Number.NaN })).toThrow(/length.*finite/i);
    expect(() => createRoadSurfacePresentation(new THREE.Group(), { width: 0 })).toThrow(/width.*greater than zero/i);
    expect(() => createRoadSurfacePresentation(new THREE.Group(), { length: 12, width: 13 })).toThrow(/greater than its width/i);
  });
});
