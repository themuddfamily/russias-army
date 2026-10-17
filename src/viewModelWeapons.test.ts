import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  createViewModelWeapons,
  VIEW_MODEL_FORWARD,
  type ViewModelWeaponCollection,
  type ViewModelWeaponMetadata,
} from './viewModelWeapons';
import { RIFLE_VIEW_MODEL_LAYOUT } from './rifleViewModelGeometry';
import type { WeaponId } from './weapons';

const IDS: WeaponId[] = ['pistol', 'shotgun', 'rifle', 'launcher', 'rpg', 'sniper'];

const EXPECTED_PARTS: Record<WeaponId, Array<keyof ViewModelWeaponMetadata['parts']>> = {
  pistol: ['magazine', 'bolt', 'trigger'],
  shotgun: ['magazine', 'bolt', 'pump', 'trigger'],
  rifle: ['magazine', 'bolt', 'trigger', 'safety'],
  launcher: ['cylinder', 'trigger', 'safety'],
  rpg: ['rocket', 'trigger'],
  sniper: ['magazine', 'bolt', 'trigger'],
};

const collections: ViewModelWeaponCollection[] = [];

function createCollection(): ViewModelWeaponCollection {
  const collection = createViewModelWeapons();
  collections.push(collection);
  return collection;
}

function isDescendant(root: THREE.Object3D, candidate: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = candidate;
  while (current) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function expectFiniteVector(vector: THREE.Vector3): void {
  expect(vector.toArray().every(Number.isFinite)).toBe(true);
}

afterEach(() => {
  for (const collection of collections.splice(0)) collection.dispose();
});

describe('procedural first-person weapon collection', () => {
  it('creates exactly one unique model and metadata record for each weapon', () => {
    const collection = createCollection();

    expect([...collection.models.keys()]).toEqual(IDS);
    expect([...collection.metadata.keys()]).toEqual(IDS);
    expect(collection.models.size).toBe(6);
    expect(collection.metadata.size).toBe(6);

    const roots = [...collection.models.values()];
    expect(new Set(roots).size).toBe(6);
    expect(new Set(roots.map((model) => model.uuid)).size).toBe(6);

    const ownedObjects = new Set<THREE.Object3D>();
    for (const id of IDS) {
      const model = collection.models.get(id);
      const metadata = collection.metadata.get(id);
      expect(model).toBeDefined();
      expect(metadata?.id).toBe(id);
      expect(metadata?.model).toBe(model);
      expect(model?.userData.weaponId).toBe(id);
      expect(model?.parent).toBeNull();

      model?.traverse((object) => {
        expect(ownedObjects.has(object)).toBe(false);
        ownedObjects.add(object);
      });
    }
  });

  it('keeps every weapon richly modeled with efficient hero geometry and procedural PBR finishes', () => {
    const collection = createCollection();
    const meshFloors: Record<WeaponId, number> = {
      pistol: 32, shotgun: 40, rifle: 20, launcher: 35, rpg: 35, sniper: 47,
    };
    const expectedSurfaces: Record<WeaponId, string[]> = {
      pistol: ['gunmetal', 'polymer'],
      shotgun: ['gunmetal', 'polymer'],
      rifle: ['gunmetal', 'worn-wood'],
      launcher: ['gunmetal', 'polymer'],
      rpg: ['gunmetal', 'paint', 'polymer', 'worn-wood'],
      sniper: ['gunmetal', 'worn-wood'],
    };
    for (const id of IDS) {
      const model = collection.models.get(id)!;
      const meshes: THREE.Mesh[] = [];
      model.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
      expect(model.visible).toBe(false);
      expect(meshes.length).toBeGreaterThanOrEqual(meshFloors[id]);
      if (id === 'rifle') {
        expect(meshes.length).toBeLessThanOrEqual(32);
        expect(meshes.some((item) => item.name === 'ak47-hero-fixed')).toBe(true);
        expect(meshes.some((item) => item.name === 'ak47-hero-magazine')).toBe(true);
      } else {
        expect(meshes.some((item) => item.geometry instanceof RoundedBoxGeometry)).toBe(false);
      }
      const procedural = meshes.filter((item) => {
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        return materials.some((material) => Boolean(material.userData.proceduralWeaponSurface));
      });
      expect(procedural.length).toBeGreaterThan(id === 'rifle' ? 1 : 8);
      const surfaces = new Set(procedural.flatMap((item) => {
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        return materials.map((material) => material.userData.proceduralWeaponSurface).filter(Boolean) as string[];
      }));
      expect([...surfaces].sort()).toEqual(expectedSurfaces[id].sort());
      expect(procedural.every((item) => {
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        return materials.some((material) => material instanceof THREE.MeshStandardMaterial && material.map && material.roughnessMap);
      })).toBe(true);
    }
  });

  it('integrates the AK-47 hero geometry without disturbing anchors, pivots or budgets', () => {
    const collection = createCollection();
    const metadata = collection.metadata.get('rifle')!;
    const body = metadata.model.getObjectByName('ak47-body')!;
    const fixed = metadata.model.getObjectByName('ak47-hero-fixed') as THREE.Mesh;
    const magazineMesh = metadata.model.getObjectByName('ak47-hero-magazine') as THREE.Mesh;
    const meshes: THREE.Mesh[] = [];
    metadata.model.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });

    expect(metadata.model.name).toBe('view-model-rifle');
    expect(metadata.model.scale.toArray()).toEqual([
      RIFLE_VIEW_MODEL_LAYOUT.rootScale,
      RIFLE_VIEW_MODEL_LAYOUT.rootScale,
      RIFLE_VIEW_MODEL_LAYOUT.rootScale,
    ]);
    expect(body).toBeDefined();
    expect(fixed.geometry.name).toBe('AK47HeroFixedGroupedGeometry');
    expect(magazineMesh.geometry.name).toBe('AK47HeroMagazineGroupedGeometry');
    expect(fixed.geometry.groups).toHaveLength(4);
    expect(magazineMesh.geometry.groups).toHaveLength(2);
    expect(Array.isArray(fixed.material) ? fixed.material : []).toHaveLength(4);
    expect(Array.isArray(magazineMesh.material) ? magazineMesh.material : []).toHaveLength(2);

    const triangles = meshes.reduce((sum, item) => (
      sum + (item.geometry.index?.count ?? item.geometry.getAttribute('position').count) / 3
    ), 0);
    const draws = meshes.reduce((sum, item) => sum + (Array.isArray(item.material) ? item.geometry.groups.length : 1), 0);
    expect(meshes).toHaveLength(22);
    expect(draws).toBe(26);
    expect(triangles).toBeLessThanOrEqual(7_500);

    for (const [key, expected] of Object.entries(RIFLE_VIEW_MODEL_LAYOUT.anchors)) {
      expect(metadata.anchors[key as keyof typeof metadata.anchors].position.toArray()).toEqual(expected);
    }
    for (const [key, expected] of Object.entries(RIFLE_VIEW_MODEL_LAYOUT.pivots)) {
      expect(metadata.parts[key as keyof typeof metadata.parts]?.position.toArray()).toEqual(expected);
    }
    expect(Object.keys(metadata.parts).sort()).toEqual(['bolt', 'magazine', 'safety', 'trigger']);
    expect(Object.values(metadata.parts).every((part) => part && part.children.length > 0)).toBe(true);

    const features = new Set([
      ...(fixed.geometry.userData.rifleFeatures as string[]),
      ...(magazineMesh.geometry.userData.rifleFeatures as string[]),
    ]);
    for (const feature of [
      'stamped-receiver', 'faceted-dust-cover', 'tapered-handguard',
      'curved-steel-magazine', 'gray-rear-extension', 'front-sight-post',
      'rear-tangent-notch', 'short-muzzle-collar', 'ejection-port',
    ]) expect(features.has(feature), feature).toBe(true);
  });

  it('uses camera-local -Z consistently for models, metadata and muzzle direction', () => {
    const collection = createCollection();
    expect(VIEW_MODEL_FORWARD.toArray()).toEqual([0, 0, -1]);
    expect(collection.forward.toArray()).toEqual([0, 0, -1]);

    for (const id of IDS) {
      const metadata = collection.metadata.get(id)!;
      metadata.model.updateMatrixWorld(true);
      expect(metadata.model.userData.forward).toBe('-Z');
      expect(metadata.forward.toArray()).toEqual([0, 0, -1]);

      const muzzlePosition = metadata.anchors.muzzle.getWorldPosition(new THREE.Vector3());
      const muzzleForward = VIEW_MODEL_FORWARD.clone().applyQuaternion(
        metadata.anchors.muzzle.getWorldQuaternion(new THREE.Quaternion()),
      );
      expect(muzzlePosition.z).toBeLessThan(0);
      expect(muzzleForward.z).toBeLessThan(-.999);
    }
  });

  it('provides finite hip, ADS and sprint transforms with sight-aligned ADS offsets', () => {
    const collection = createCollection();

    for (const metadata of collection.metadata.values()) {
      for (const pose of Object.values(metadata.poses)) {
        expectFiniteVector(pose.position);
        expect([pose.rotation.x, pose.rotation.y, pose.rotation.z].every(Number.isFinite)).toBe(true);
        expect(Number.isFinite(pose.fov)).toBe(true);
        expect(pose.fov).toBeGreaterThan(20);
        expect(pose.fov).toBeLessThan(100);
      }

      metadata.model.updateMatrixWorld(true);
      const alignedSight = metadata.anchors.sight
        .getWorldPosition(new THREE.Vector3())
        .add(metadata.poses.ads.position);
      expect(alignedSight.x).toBeCloseTo(0, 6);
      expect(alignedSight.y).toBeCloseTo(0, 6);
      expect(metadata.poses.sprint.rotation.z).toBeLessThan(0);
    }
  });

  it('defaults to original-inspired legacy framing while retaining the previous modern pose option', () => {
    const legacy = createCollection();
    const modern = createViewModelWeapons({ presentation: 'modern', tier: 'low', textureSize: 32 });
    collections.push(modern);
    for (const id of IDS) {
      const original = legacy.metadata.get(id)!;
      const previous = modern.metadata.get(id)!;
      expect(original.model.userData.presentation).toBe('legacy');
      expect(previous.model.userData.presentation).toBe('modern');
      expect(original.poses.hip.position.z).toBeLessThan(previous.poses.hip.position.z);
      // Pistol/RPG keep the initial inset; recovered gun frames guide the other
      // poses individually, so a universal leftward offset is not a contract.
      if (id === 'pistol' || id === 'rpg') expect(original.poses.hip.position.x).toBeLessThan(previous.poses.hip.position.x);
      expect(original.poses.ads.position.toArray()).toEqual(previous.poses.ads.position.toArray());
      const previousMeshes: THREE.Mesh[] = [];
      previous.model.traverse((object) => { if (object instanceof THREE.Mesh) previousMeshes.push(object); });
      if (id !== 'rifle') expect(previousMeshes.some((item) => item.geometry instanceof RoundedBoxGeometry)).toBe(true);
    }
    const legacyRifle = legacy.metadata.get('rifle')!;
    const modernRifle = modern.metadata.get('rifle')!;
    expect(legacyRifle.poses.hip.position.toArray()).toEqual([.33, -.25, -.76]);
    expect(legacyRifle.poses.hip.rotation.y).toBe(.16);
    expect(modernRifle.poses.hip.position.toArray()).toEqual([.32, -.38, -.72]);
    expect(modernRifle.poses.hip.rotation.y).toBe(0);
    expect(legacyRifle.anchors.leftHand.visible).toBe(false);
    expect(modernRifle.anchors.leftHand.visible).toBe(true);
    const legacyFixed = legacyRifle.model.getObjectByName('ak47-hero-fixed') as THREE.Mesh;
    const modernFixed = modernRifle.model.getObjectByName('ak47-hero-fixed') as THREE.Mesh;
    expect(legacyFixed.geometry.userData.rifleFeatures).toContain('faceted-dust-cover');
    expect(legacyFixed.geometry.userData.rifleFeatures).not.toContain('wooden-fixed-stock');
    expect(modernFixed.geometry.userData.rifleFeatures).toContain('crowned-dust-cover');
    expect(modernFixed.geometry.userData.rifleFeatures).toContain('wooden-fixed-stock');
    const legacyMetal = (legacyFixed.material as THREE.MeshStandardMaterial[])[0];
    const modernMetal = (modernFixed.material as THREE.MeshStandardMaterial[])[0];
    expect(legacyMetal.emissiveIntensity).toBe(1.0);
    expect(modernMetal.emissive.getHex()).toBe(0);
  });

  it('owns named muzzle, sight and hand anchors with explicit ejection semantics', () => {
    const collection = createCollection();

    for (const id of IDS) {
      const metadata = collection.metadata.get(id)!;
      const { muzzle, sight, ejection, rightHand, leftHand } = metadata.anchors;
      for (const anchor of [muzzle, sight, ejection, rightHand, leftHand]) {
        expect(isDescendant(metadata.model, anchor)).toBe(true);
        expectFiniteVector(anchor.getWorldPosition(new THREE.Vector3()));
      }
      expect(muzzle.name).toBe('muzzle');
      expect(sight.name).toBe('sight');
      expect(rightHand.name).toBe('right-hand-anchor');
      expect(leftHand.name).toBe('left-hand-anchor');
      expect(ejection.name).toBe(id === 'rpg' ? 'backblast' : 'ejection');
    }
  });

  it('exposes the expected independent animation pivots for every weapon', () => {
    const collection = createCollection();

    for (const id of IDS) {
      const metadata = collection.metadata.get(id)!;
      expect(Object.keys(metadata.parts).sort()).toEqual([...EXPECTED_PARTS[id]].sort());
      for (const key of EXPECTED_PARTS[id]) {
        const part = metadata.parts[key];
        expect(part).toBeInstanceOf(THREE.Group);
        expect(isDescendant(metadata.model, part!)).toBe(true);
        expect(part!.children.length).toBeGreaterThan(0);
      }
    }
  });

  it('shares render resources and disposes attached models exactly once', () => {
    const collection = createCollection();
    const meshes: THREE.Mesh[] = [];
    for (const model of collection.models.values()) {
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) meshes.push(object);
      });
    }

    const geometries = new Set(meshes.map((item) => item.geometry));
    const materials = new Set<THREE.Material>();
    for (const item of meshes) {
      const itemMaterials = Array.isArray(item.material) ? item.material : [item.material];
      for (const material of itemMaterials) materials.add(material);
    }
    expect(meshes.length).toBeGreaterThan(100);
    expect(geometries.size).toBeLessThanOrEqual(11);
    // Three scoped RG6 variants preserve its gray source palette without changing AK or other weapons.
    expect(materials.size).toBeLessThanOrEqual(18);
    expect(meshes.length / geometries.size).toBeGreaterThan(10);

    const geometryDisposals = new Map<THREE.BufferGeometry, number>();
    const materialDisposals = new Map<THREE.Material, number>();
    for (const geometry of geometries) {
      geometryDisposals.set(geometry, 0);
      geometry.addEventListener('dispose', () => {
        geometryDisposals.set(geometry, geometryDisposals.get(geometry)! + 1);
      });
    }
    for (const material of materials) {
      materialDisposals.set(material, 0);
      material.addEventListener('dispose', () => {
        materialDisposals.set(material, materialDisposals.get(material)! + 1);
      });
    }

    const stage = new THREE.Group();
    const roots = [...collection.models.values()];
    stage.add(...roots);
    collection.dispose();
    collection.dispose();

    expect(collection.models.size).toBe(0);
    expect(collection.metadata.size).toBe(0);
    expect(stage.children).toHaveLength(0);
    expect(roots.every((model) => model.parent === null)).toBe(true);
    expect([...geometryDisposals.values()].every((count) => count === 1)).toBe(true);
    expect([...materialDisposals.values()].every((count) => count === 1)).toBe(true);
  });

  it('keeps independent factory instances isolated without leaking roots between builds', () => {
    const first = createCollection();
    const second = createCollection();
    const firstRoots = new Set(first.models.values());
    const secondRoots = new Set(second.models.values());

    expect([...firstRoots].every((root) => !secondRoots.has(root))).toBe(true);
    first.dispose();
    expect(first.models.size).toBe(0);
    expect(second.models.size).toBe(6);
    expect([...second.models.values()].every((root) => root.parent === null)).toBe(true);
  });

  it('uses lean optic glass in low quality while retaining transmission in high quality', () => {
    const low = createViewModelWeapons({ tier: 'low', textureSize: 32 });
    const high = createViewModelWeapons({ tier: 'high', textureSize: 32 });
    collections.push(low, high);
    const materials = (collection: ViewModelWeaponCollection): THREE.Material[] => {
      const found = new Set<THREE.Material>();
      for (const model of collection.models.values()) model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) found.add(material);
      });
      return [...found];
    };
    const lowGlass = materials(low).find((material) => material.name === 'Low-tier optic glass');
    const highGlass = materials(high).find((material) => material.name === 'High-tier optic glass');

    expect(lowGlass?.type).toBe('MeshStandardMaterial');
    expect(highGlass?.type).toBe('MeshPhysicalMaterial');
    expect((highGlass as THREE.MeshPhysicalMaterial).transmission).toBeGreaterThan(0);
  });
});


describe('source-guided legacy RG6', () => {
  it('shows broad gray upper geometry with low retained cylinder and preserves neutral anchors', () => {
    const legacy=createViewModelWeapons({presentation:'legacy',tier:'low'});
    const modern=createViewModelWeapons({presentation:'modern',tier:'low'});
    const a=legacy.metadata.get('launcher')!;const b=modern.metadata.get('launcher')!;
    for(const name of ['legacy-rg6-upper-tube','legacy-rg6-support-platform','legacy-rg6-rear-body']) {
      expect(a.model.getObjectByName(name)).toBeDefined();expect(b.model.getObjectByName(name)).toBeUndefined();
    }
    expect(a.parts.cylinder!.position.y).toBeLessThan(b.parts.cylinder!.position.y);
    expect(a.poses.hip.position.toArray()).toEqual([.41,-.21,-.9]);
    const tube=a.model.getObjectByName('legacy-rg6-upper-tube') as THREE.Mesh;
    const tubeMaterials=tube.material as THREE.MeshStandardMaterial[];
    const material=tubeMaterials[0];
    expect(tubeMaterials).toHaveLength(2);
    expect(tubeMaterials[1].emissiveIntensity).toBeLessThan(material.emissiveIntensity);
    expect(new Set(tube.geometry.groups.map(group=>group.materialIndex))).toEqual(new Set([0,1]));
    const platform=a.model.getObjectByName('legacy-rg6-support-platform') as THREE.Mesh;
    const faces=platform.material as THREE.Material[];
    expect(faces[2]).toBe(tubeMaterials[0]);
    expect(faces[0]).toBe(tubeMaterials[1]);
    expect(material.color.getHex()).toBe(0xb7bec1);
    expect(material.emissiveIntensity).toBe(.65);
    expect(material.emissive.getHex()).toBe(0x7b8285);
    expect((tube.geometry as THREE.CylinderGeometry).parameters.radialSegments).toBe(8);
    expect(a.model.getObjectByName('legacy-rg6-front-collar')).toBeDefined();
    expect(a.anchors.leftHand.visible).toBe(false);expect(b.anchors.leftHand.visible).toBe(true);
    for(const name of ['muzzle','sight','ejection','leftHand','rightHand'] as const) {
      const p=a.anchors[name].getWorldPosition(new THREE.Vector3());
      const q=b.anchors[name].getWorldPosition(new THREE.Vector3());
      expect(p.distanceTo(q)).toBeLessThan(1e-7);
    }
    for(let index=0;index<6;index++) {
      expect(a.model.getObjectByName(`chamber-${index}`)!.visible).toBe(false);
      expect(b.model.getObjectByName(`chamber-${index}`)!.visible).toBe(true);
    }
    legacy.dispose();modern.dispose();
  });
});
