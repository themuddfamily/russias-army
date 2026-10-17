import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  BUILDING_FACADE_WINDOW_DEPTHS,
  createBuildingFacadePresentation,
  type BuildingFacadePresentation,
  type BuildingFacadePresentationMaterials,
} from './buildingFacadePresentation';

const MATERIAL_SLOTS = ['concrete', 'redSteel', 'corrugatedSteel', 'dark', 'glass', 'accent'] as const;

function materials(): BuildingFacadePresentationMaterials {
  return {
    concrete: new THREE.MeshStandardMaterial({ name: 'concrete' }),
    redSteel: new THREE.MeshStandardMaterial({ name: 'redSteel' }),
    corrugatedSteel: new THREE.MeshStandardMaterial({ name: 'corrugatedSteel' }),
    dark: new THREE.MeshStandardMaterial({ name: 'dark' }),
    glass: new THREE.MeshStandardMaterial({ name: 'glass' }),
    accent: new THREE.MeshStandardMaterial({ name: 'accent' }),
  };
}

function disposeMaterials(injected: BuildingFacadePresentationMaterials): void {
  for (const slot of MATERIAL_SLOTS) injected[slot].dispose();
}

function geometryArrays(presentation: BuildingFacadePresentation, slot: typeof MATERIAL_SLOTS[number]): {
  position: number[];
  normal: number[];
  uv: number[];
  color: number[];
  index: number[];
} {
  const geometry = presentation.batches[slot].geometry;
  return {
    position: Array.from(geometry.getAttribute('position').array),
    normal: Array.from(geometry.getAttribute('normal').array),
    uv: Array.from(geometry.getAttribute('uv').array),
    color: Array.from(geometry.getAttribute('color').array),
    index: Array.from(geometry.index!.array),
  };
}

describe('createBuildingFacadePresentation', () => {
  it('reports the exact six-batch enhanced façade contract', () => {
    const injected = materials();
    const presentation = createBuildingFacadePresentation(new THREE.Group(), injected);

    expect(presentation.stats).toEqual({
      quality: 'high',
      buildings: 4,
      entrances: 7,
      authoredParts: 529,
      panelModules: 170,
      corrugatedRuns: 8,
      corrugatedSegments: 628,
      windows: 30,
      windowParts: 240,
      serviceParts: 87,
      weatheringPatches: 24,
      panelTriangles: 1700,
      corrugatedTriangles: 1256,
      windowTriangles: 2880,
      serviceTriangles: 1044,
      weatheringTriangles: 48,
      submittedTriangles: 6928,
      drawCalls: 6,
      geometries: 6,
      ownedGeometries: 6,
      injectedMaterials: 6,
      ownedMaterials: 6,
      ownedTextures: 0,
      colliders: 0,
      perFrameUpdates: 0,
      buildingParts: { 'block-01': 161, barracks: 175, warehouse: 81, infirmary: 112 },
      buildingTriangles: { 'block-01': 1742, barracks: 1896, warehouse: 2072, infirmary: 1218 },
      windowCounts: { 'block-01': 9, barracks: 9, warehouse: 6, infirmary: 6 },
      panelCounts: { 'block-01': 65, barracks: 72, warehouse: 0, infirmary: 33 },
      materialTriangles: { concrete: 1184, redSteel: 732, corrugatedSteel: 1268, dark: 3072, glass: 408, accent: 264 },
    });
    expect(presentation.serviceBlueprint.stats).toMatchObject({ buildings: 4, entrances: 7, parts: 93, triangles: 1116 });
    expect(Object.isFrozen(presentation.stats)).toBe(true);
    expect(Object.isFrozen(presentation.stats.buildingParts)).toBe(true);
    expect(Object.isFrozen(presentation.stats.buildingTriangles)).toBe(true);
    expect(Object.isFrozen(presentation.stats.windowCounts)).toBe(true);
    expect(Object.isFrozen(presentation.stats.panelCounts)).toBe(true);
    expect(Object.isFrozen(presentation.stats.materialTriangles)).toBe(true);

    presentation.dispose();
    disposeMaterials(injected);
  });

  it('submits the exact indexed topology in six static, bounded meshes', () => {
    const injected = materials();
    const parent = new THREE.Group();
    const presentation = createBuildingFacadePresentation(parent, injected, { name: 'TestFacades' });
    const expectedTriangles = {
      concrete: 1184,
      redSteel: 732,
      corrugatedSteel: 1268,
      dark: 3072,
      glass: 408,
      accent: 264,
    } as const;

    expect(parent.children).toEqual([presentation.root]);
    expect(presentation.root.name).toBe('TestFacades');
    expect(presentation.root.children).toHaveLength(6);
    expect(presentation.root.matrixAutoUpdate).toBe(false);
    expect(presentation.root.userData).toMatchObject({ presentationOnly: true, authoritativeColliders: 'none' });
    let submittedTriangles = 0;
    for (const slot of MATERIAL_SLOTS) {
      const mesh = presentation.batches[slot];
      const geometry = mesh.geometry;
      expect(mesh.parent).toBe(presentation.root);
      expect(mesh.matrixAutoUpdate).toBe(false);
      expect(mesh.frustumCulled).toBe(true);
      expect(mesh.userData).toMatchObject({ presentationOnly: true, authoritativeColliders: 'none', materialSlot: slot });
      expect(geometry.index!.count).toBe(expectedTriangles[slot] * 3);
      expect(geometry.index!.usage).toBe(THREE.StaticDrawUsage);
      expect(geometry.boundingBox).not.toBeNull();
      expect(geometry.boundingSphere).not.toBeNull();
      for (const attributeName of ['position', 'normal', 'uv', 'color']) {
        const attribute = geometry.getAttribute(attributeName);
        expect(attribute, `${slot}.${attributeName}`).toBeDefined();
        expect(attribute, `${slot}.${attributeName}`).toBeInstanceOf(THREE.BufferAttribute);
        expect((attribute as THREE.BufferAttribute).usage, `${slot}.${attributeName}`).toBe(THREE.StaticDrawUsage);
        expect(Array.from(attribute.array).every(Number.isFinite), `${slot}.${attributeName} finite`).toBe(true);
      }
      expect(geometry.getAttribute('position').count).toBe(geometry.getAttribute('normal').count);
      expect(geometry.getAttribute('position').count).toBe(geometry.getAttribute('uv').count);
      expect(geometry.getAttribute('position').count).toBe(geometry.getAttribute('color').count);
      submittedTriangles += geometry.index!.count / 3;
    }
    expect(submittedTriangles).toBe(6928);
    expect(presentation.batches.concrete.castShadow).toBe(true);
    expect(presentation.batches.redSteel.castShadow).toBe(true);
    expect(presentation.batches.corrugatedSteel.castShadow).toBe(true);
    expect(presentation.batches.dark.castShadow).toBe(false);
    expect(presentation.batches.glass.castShadow).toBe(false);
    expect(presentation.batches.accent.castShadow).toBe(false);
    expect(presentation.batches.glass.receiveShadow).toBe(false);

    presentation.dispose();
    disposeMaterials(injected);
  });

  it('authors real corrugated surface relief with continuous normalized normals', () => {
    const injected = materials();
    const presentation = createBuildingFacadePresentation(new THREE.Group(), injected);
    const geometry = presentation.batches.corrugatedSteel.geometry;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const directions = new Set<string>();

    // Six host-material weather quads follow the exact corrugation prefix.
    expect(positions.count).toBe(628 * 4 + 6 * 4);
    expect(geometry.index!.count).toBe(1268 * 3);
    for (let index = 0; index < 628 * 4; index++) {
      const x = normals.getX(index);
      const y = normals.getY(index);
      const z = normals.getZ(index);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
      expect(y).toBeCloseTo(0, 7);
      directions.add(`${x.toFixed(3)}:${z.toFixed(3)}`);
    }
    expect(directions.size).toBeGreaterThan(16);
    const bounds = geometry.boundingBox!;
    expect(bounds.min.x).toBeLessThan(19.25);
    expect(bounds.max.x).toBeGreaterThan(34.75);
    expect(bounds.min.z).toBeLessThan(-29.25);
    expect(bounds.max.z).toBeGreaterThan(-18.75);

    presentation.dispose();
    disposeMaterials(injected);
  });

  it('orients every panel depth edge outward and compensates shared texture repeat in physical UVs', () => {
    const baselineMaterials = materials();
    const repeatedMaterials = materials();
    const texture = new THREE.Texture();
    texture.repeat.set(8, 3);
    (repeatedMaterials.concrete as THREE.MeshStandardMaterial).map = texture;
    const baseline = createBuildingFacadePresentation(new THREE.Group(), baselineMaterials, { seed: 'uv-contract' });
    const repeated = createBuildingFacadePresentation(new THREE.Group(), repeatedMaterials, { seed: 'uv-contract' });
    const baselineGeometry = baseline.batches.concrete.geometry;
    const repeatedGeometry = repeated.batches.concrete.geometry;
    const normals = repeatedGeometry.getAttribute('normal');
    const normalAt = (index:number):number[] => [normals.getX(index), normals.getY(index), normals.getZ(index)]
      .map((value)=>Object.is(value,-0)?0:value);
    expect(normalAt(4)).toEqual([0, -1, 0]);
    expect(normalAt(8)).toEqual([1, 0, 0]);
    expect(normalAt(12)).toEqual([0, 1, 0]);
    expect(normalAt(16)).toEqual([-1, 0, 0]);

    const baselineUv = baselineGeometry.getAttribute('uv');
    const repeatedUv = repeatedGeometry.getAttribute('uv');
    const span = (attribute:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,axis:'x'|'y'):number => {
      const values=[0,1,2,3].map((index)=>axis==='x'?attribute.getX(index):attribute.getY(index));
      return Math.max(...values)-Math.min(...values);
    };
    expect(span(repeatedUv,'x')).toBeCloseTo(span(baselineUv,'x')/8,6);
    expect(span(repeatedUv,'y')).toBeCloseTo(span(baselineUv,'y')/3,6);
    expect(texture.repeat.toArray()).toEqual([8,3]);
    expect((repeated.batches.concrete.material as THREE.MeshStandardMaterial).map).toBe(texture);

    baseline.dispose();repeated.dispose();
    disposeMaterials(baselineMaterials);disposeMaterials(repeatedMaterials);texture.dispose();
  });

  it('leaves Block-01 east fully open instead of drawing a collisionless wall or floating windows', () => {
    const injected = materials();
    const presentation = createBuildingFacadePresentation(new THREE.Group(), injected);
    expect(presentation.stats.panelCounts['block-01']).toBe(65);
    expect(presentation.stats.windowCounts['block-01']).toBe(9);
    for (const slot of ['concrete','glass'] as const) {
      const positions=presentation.batches[slot].geometry.getAttribute('position');
      let eastFaceVertices=0;
      for(let index=0;index<positions.count;index++){
        const x=positions.getX(index);const y=positions.getY(index);const z=positions.getZ(index);
        if(x>-8.9&&x<-8.35&&y>.2&&y<5.5&&z>-24.8&&z<-11.2)eastFaceVertices++;
      }
      expect(eastFaceVertices,`${slot} geometry across Block-01 east opening`).toBe(0);
    }
    presentation.dispose();disposeMaterials(injected);
  });

  it('keeps the glass behind the frame and sill by an explicit signed-depth contract', () => {
    expect(BUILDING_FACADE_WINDOW_DEPTHS).toEqual({
      glassFront: .102,
      mullionFront: .1475,
      frameFront: .1575,
      sillFront: .24,
    });
    expect(BUILDING_FACADE_WINDOW_DEPTHS.mullionFront - BUILDING_FACADE_WINDOW_DEPTHS.glassFront).toBeGreaterThan(.04);
    expect(BUILDING_FACADE_WINDOW_DEPTHS.frameFront).toBeGreaterThan(BUILDING_FACADE_WINDOW_DEPTHS.mullionFront);
    expect(BUILDING_FACADE_WINDOW_DEPTHS.sillFront).toBeGreaterThan(BUILDING_FACADE_WINDOW_DEPTHS.frameFront);
    expect(Object.isFrozen(BUILDING_FACADE_WINDOW_DEPTHS)).toBe(true);
  });

  it('is byte-deterministic while allowing seed-controlled UV and tint variation', () => {
    const stableMaterialsA = materials();
    const stableMaterialsB = materials();
    const changedMaterials = materials();
    const first = createBuildingFacadePresentation(new THREE.Group(), stableMaterialsA, { seed: 'stable' });
    const second = createBuildingFacadePresentation(new THREE.Group(), stableMaterialsB, { seed: 'stable' });
    const changed = createBuildingFacadePresentation(new THREE.Group(), changedMaterials, { seed: 'changed' });

    for (const slot of MATERIAL_SLOTS) {
      const a = geometryArrays(first, slot);
      const b = geometryArrays(second, slot);
      const c = geometryArrays(changed, slot);
      expect(a).toEqual(b);
      expect(c.position, `${slot} structural position`).toEqual(a.position);
      expect(c.normal, `${slot} structural normal`).toEqual(a.normal);
      expect(c.index, `${slot} topology`).toEqual(a.index);
      expect(c.uv, `${slot} seed UV`).not.toEqual(a.uv);
      expect(c.color, `${slot} seed tint`).not.toEqual(a.color);
    }

    first.dispose();
    second.dispose();
    changed.dispose();
    disposeMaterials(stableMaterialsA);
    disposeMaterials(stableMaterialsB);
    disposeMaterials(changedMaterials);
  });

  it('clones caller materials, supports E2E visibility isolation, and disposes owned resources once', () => {
    const injected = materials();
    const parent = new THREE.Group();
    const callerDisposals = MATERIAL_SLOTS.map((slot) => vi.spyOn(injected[slot], 'dispose'));
    const presentation = createBuildingFacadePresentation(parent, injected, {
      castShadow: false,
      receiveShadow: false,
    });
    const geometryDisposals = MATERIAL_SLOTS.map((slot) => vi.spyOn(presentation.batches[slot].geometry, 'dispose'));
    const cloneDisposals = MATERIAL_SLOTS.map((slot) => vi.spyOn(presentation.batches[slot].material, 'dispose'));

    for (const slot of MATERIAL_SLOTS) {
      expect(presentation.batches[slot].material).not.toBe(injected[slot]);
      expect((presentation.batches[slot].material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
      expect((injected[slot] as THREE.MeshStandardMaterial).vertexColors).toBe(false);
      expect(presentation.batches[slot].castShadow).toBe(false);
      expect(presentation.batches[slot].receiveShadow).toBe(false);
    }
    presentation.setDetailsVisible(false);
    expect(presentation.root.visible).toBe(false);
    presentation.setDetailsVisible(true);
    expect(presentation.root.visible).toBe(true);

    presentation.dispose();
    presentation.dispose();
    expect(parent.children).not.toContain(presentation.root);
    for (const spy of geometryDisposals) expect(spy).toHaveBeenCalledTimes(1);
    for (const spy of cloneDisposals) expect(spy).toHaveBeenCalledTimes(1);
    for (const spy of callerDisposals) expect(spy).not.toHaveBeenCalled();
    disposeMaterials(injected);
  });

  it('validates the high-only contract before allocating resources', () => {
    const injected = materials();
    expect(() => createBuildingFacadePresentation({} as THREE.Object3D, injected)).toThrow(/parent/i);
    expect(() => createBuildingFacadePresentation(new THREE.Group(), injected, { quality: 'low' as 'high' })).toThrow(/high quality/i);
    expect(() => createBuildingFacadePresentation(new THREE.Group(), injected, { seed: '' })).toThrow(/seed/i);
    expect(() => createBuildingFacadePresentation(new THREE.Group(), injected, { seed: Number.NaN })).toThrow(/seed/i);
    expect(() => createBuildingFacadePresentation(new THREE.Group(), {
      ...injected,
      glass: {} as THREE.Material,
    })).toThrow(/glass material/i);
    disposeMaterials(injected);
  });
});
