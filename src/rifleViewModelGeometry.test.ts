import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createRifleViewModelGeometry,
  RIFLE_VIEW_MODEL_LAYOUT,
} from './rifleViewModelGeometry';

function features(geometries: readonly THREE.BufferGeometry[]): Set<string> {
  return new Set(geometries.flatMap((geometry) => geometry.userData.rifleFeatures as string[]));
}

function aggregateAuthoredBounds(): THREE.Box3 {
  const set = createRifleViewModelGeometry();
  const bounds = new THREE.Box3();
  const include = (geometry: THREE.BufferGeometry, offset: readonly [number, number, number]): void => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!.clone().translate(new THREE.Vector3(...offset));
    bounds.union(box);
  };
  include(set.fixed.geometry, [0, 0, 0]);
  include(set.magazine.geometry, RIFLE_VIEW_MODEL_LAYOUT.pivots.magazine);
  set.dispose();
  return bounds;
}

describe('procedural AK-47 hero geometry', () => {
  it('tapers the Legacy rear notch tips without closing its sight line or changing Modern posts', () => {
    const legacy=createRifleViewModelGeometry('legacy'),modern=createRifleViewModelGeometry('modern');
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const hitsRear=(set:typeof legacy,x:number,y:number)=>{
      const mesh=new THREE.Mesh(set.fixed.geometry,material);mesh.updateMatrixWorld();
      return new THREE.Raycaster(new THREE.Vector3(x,y,.02),new THREE.Vector3(0,0,-1),0,.16).intersectObject(mesh).length>0;
    };
    for(const side of [-1,1]) {
      expect(hitsRear(legacy,side*.043,.202)).toBe(true);
      expect(hitsRear(legacy,side*.055,.202)).toBe(false);
      expect(hitsRear(legacy,side*.055,.145)).toBe(true);
      expect(hitsRear(modern,side*.055,.202)).toBe(true);
    }
    expect(hitsRear(legacy,0,.19)).toBe(false);
    expect(features(legacy.geometries).has('tapered-rear-notch-ears')).toBe(true);
    expect(features(modern.geometries).has('tapered-rear-notch-ears')).toBe(false);
    legacy.dispose();modern.dispose();material.dispose();
  });
  it('preserves the camera-local axis, anchors, pivots and authored envelope contract', () => {
    expect(RIFLE_VIEW_MODEL_LAYOUT).toMatchObject({
      forward: [0, 0, -1],
      rootScale: .62,
      anchors: {
        muzzle: [0, .045, -1.9], sight: [0, .19, -.08], ejection: [.13, .075, -.27],
      },
      pivots: {
        magazine: [0, -.19, -.2], bolt: [.112, .07, -.23],
        trigger: [0, -.13, -.01], safety: [.112, .02, -.08],
      },
    });
    const bounds = aggregateAuthoredBounds();
    const envelope = RIFLE_VIEW_MODEL_LAYOUT.authoredEnvelope;
    expect(bounds.min.x).toBeGreaterThanOrEqual(envelope.min[0]);
    expect(bounds.min.y).toBeGreaterThanOrEqual(envelope.min[1]);
    expect(bounds.min.z).toBeGreaterThanOrEqual(envelope.min[2]);
    expect(bounds.max.x).toBeLessThanOrEqual(envelope.max[0]);
    expect(bounds.max.y).toBeLessThanOrEqual(envelope.max[1]);
    expect(bounds.max.z).toBeLessThanOrEqual(envelope.max[2]);
    expect(bounds.min.z).toBeLessThan(-1.84);
    expect(bounds.max.z).toBeGreaterThan(.73);
    expect(bounds.min.y).toBeLessThan(-.65);
  });

  it('returns two owned resources with six ordered material draw groups', () => {
    const set = createRifleViewModelGeometry();
    expect(set.fixed.materialSlots).toEqual(['gunmetal', 'darkMetal', 'edgeMetal', 'wood']);
    expect(set.magazine.materialSlots).toEqual(['gunmetal', 'darkMetal']);
    expect(set.fixed.geometry.groups).toHaveLength(4);
    expect(set.magazine.geometry.groups).toHaveLength(2);
    expect(set.fixed.geometry.groups.map((group) => group.materialIndex)).toEqual([0, 1, 2, 3]);
    expect(set.magazine.geometry.groups.map((group) => group.materialIndex)).toEqual([0, 1]);
    expect(set.geometries).toHaveLength(2);
    expect(set.stats).toMatchObject({
      geometryCount: 2,
      fixedDrawGroups: 4,
      movableDrawGroups: 2,
      estimatedIntegratedMeshes: 22,
      estimatedIntegratedDraws: 26,
    });
    set.dispose();
  });

  it('provides finite indexed topology with normals, UVs and useful bounds', () => {
    const set = createRifleViewModelGeometry();
    for (const geometry of set.geometries) {
      expect(geometry.index, geometry.name).not.toBeNull();
      expect(geometry.index!.count % 3, geometry.name).toBe(0);
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      expect(position.itemSize, geometry.name).toBe(3);
      expect(normal.itemSize, geometry.name).toBe(3);
      expect(uv.itemSize, geometry.name).toBe(2);
      expect(normal.count, geometry.name).toBe(position.count);
      expect(uv.count, geometry.name).toBe(position.count);
      for (const attribute of [position, normal, uv]) {
        expect(Array.from(attribute.array).every(Number.isFinite), geometry.name).toBe(true);
      }
      expect(geometry.boundingBox?.isEmpty(), geometry.name).toBe(false);
      expect(geometry.boundingSphere?.radius, geometry.name).toBeGreaterThan(0);
      expect(geometry.userData.rifleMaterialIndependent, geometry.name).toBe(true);
      const coveredIndices = geometry.groups.reduce((sum, group) => sum + group.count, 0);
      expect(coveredIndices, geometry.name).toBe(geometry.index!.count);
      expect(geometry.userData.rifleMaterialSlots, geometry.name).toBeDefined();
    }
    set.dispose();
  });

  it('contains the required recognizable AK-47 feature set', () => {
    const set = createRifleViewModelGeometry();
    const found = features(set.geometries);
    for (const expected of [
      'stamped-receiver', 'crowned-dust-cover', 'tapered-handguard', 'handguard-vents',
      'gas-tube', 'curved-steel-magazine', 'magazine-ribs', 'wooden-fixed-stock',
      'front-sight-ears', 'front-sight-post', 'rear-tangent-notch',
      'short-muzzle-collar', 'ejection-port',
    ]) expect(found.has(expected), expected).toBe(true);
    expect(found.size).toBeGreaterThanOrEqual(24);
    set.dispose();
  });

  it('stays inside the standalone and integrated hero budgets', () => {
    const set = createRifleViewModelGeometry();
    expect(set.stats.triangleCount).toBeLessThanOrEqual(4_000);
    expect(set.stats.fixedTriangleCount).toBeLessThanOrEqual(2_800);
    expect(set.stats.estimatedIntegratedMeshes).toBeLessThanOrEqual(32);
    expect(set.stats.estimatedIntegratedDraws).toBeLessThanOrEqual(32);
    expect(set.stats.estimatedIntegratedTriangles).toBeLessThanOrEqual(7_500);
    expect(set.stats.triangleCount).toBeGreaterThan(1_000);
    set.dispose();
  });

  it('provides a separate faceted legacy rifle without altering the modern geometry contract', () => {
    const legacy = createRifleViewModelGeometry('legacy');
    const modern = createRifleViewModelGeometry('modern');
    const legacyFeatures = features(legacy.geometries);
    const modernFeatures = features(modern.geometries);
    expect(legacyFeatures.has('faceted-dust-cover')).toBe(true);
    expect(legacyFeatures.has('gray-rear-extension')).toBe(true);
    expect(legacyFeatures.has('wooden-fixed-stock')).toBe(false);
    expect(modernFeatures.has('crowned-dust-cover')).toBe(true);
    expect(modernFeatures.has('wooden-fixed-stock')).toBe(true);
    expect(legacy.fixed.geometry.boundingBox!.getSize(new THREE.Vector3()).x)
      .toBeGreaterThan(.29);
    expect(legacy.magazine.geometry.getAttribute('position').array)
      .toEqual(modern.magazine.geometry.getAttribute('position').array);
    expect(legacy.fixed.materialSlots).toEqual(modern.fixed.materialSlots);
    expect(legacy.stats.estimatedIntegratedDraws).toBe(modern.stats.estimatedIntegratedDraws);
    legacy.dispose();
    modern.dispose();
  });

  it('is deterministic, independently owned and disposes every geometry exactly once', () => {
    const first = createRifleViewModelGeometry();
    const second = createRifleViewModelGeometry();
    expect(first.stats).toEqual(second.stats);
    expect(first.geometries.every((geometry, index) => geometry !== second.geometries[index])).toBe(true);
    for (let index = 0; index < first.geometries.length; index++) {
      expect(Array.from(first.geometries[index].getAttribute('position').array))
        .toEqual(Array.from(second.geometries[index].getAttribute('position').array));
    }
    const disposalCounts = new Map<THREE.BufferGeometry, number>();
    for (const geometry of first.geometries) {
      disposalCounts.set(geometry, 0);
      geometry.addEventListener('dispose', () => {
        disposalCounts.set(geometry, disposalCounts.get(geometry)! + 1);
      });
    }
    first.dispose();
    first.dispose();
    expect(first.isDisposed).toBe(true);
    expect(second.isDisposed).toBe(false);
    expect([...disposalCounts.values()].every((count) => count === 1)).toBe(true);
    second.dispose();
  });

  it('keeps the legacy front sight open above its crossbar with slim tips and widening supports', () => {
    const legacy = createRifleViewModelGeometry('legacy');
    const modern = createRifleViewModelGeometry('modern');
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const crossesSight = (set: typeof legacy, x: number, y: number): boolean => {
      const mesh = new THREE.Mesh(set.fixed.geometry, material);
      mesh.updateMatrixWorld();
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, -1.4), new THREE.Vector3(0, 0, -1), 0, .3);
      return ray.intersectObject(mesh).length > 0;
    };
    expect(crossesSight(legacy, 0, .22)).toBe(false);
    expect(crossesSight(legacy, 0, .174)).toBe(true);
    for (const side of [-1, 1]) {
      expect(crossesSight(legacy, side * .035, .22)).toBe(true);
      expect(crossesSight(legacy, side * .055, .22)).toBe(false);
      expect(crossesSight(legacy, side * .06, .08)).toBe(true);
      // The existing modern ears remain broader and farther apart.
      expect(crossesSight(modern, side * .055, .22)).toBe(true);
    }
    material.dispose();
    legacy.dispose();
    modern.dispose();
  });
});
