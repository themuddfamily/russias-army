import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SOLDIER_LOD_DISTANCES, SoldierModel } from './soldierModel';
import type { WeaponId } from './weapons';

const WEAPONS: WeaponId[] = ['pistol', 'shotgun', 'rifle', 'launcher', 'rpg', 'sniper'];

function isEffectivelyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function visibleMeshCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && isEffectivelyVisible(object)) count++;
  });
  return count;
}

function visibleTriangleCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !isEffectivelyVisible(object)) return;
    count += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
  });
  return count;
}

describe('SoldierModel distance detail', () => {
  it('reduces draw and shadow cost through stable distance tiers', () => {
    const soldier = new SoldierModel({ weapon: 'rifle', showName: false });
    const detailed = soldier.group.getObjectByName('soldier-detailed');
    const silhouette = soldier.group.getObjectByName('soldier-silhouette');
    expect(detailed?.visible).toBe(true);
    expect(silhouette?.visible).toBe(false);

    const fullDraws = visibleMeshCount(soldier.group);
    expect(fullDraws).toBeLessThanOrEqual(65);
    expect(visibleTriangleCount(soldier.group)).toBeLessThanOrEqual(8_500);
    const smallDetails: THREE.Mesh[] = [];
    soldier.group.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.soldierLod === 'small-detail') smallDetails.push(object);
    });
    expect(smallDetails.length).toBeGreaterThan(10);
    expect(smallDetails.every((mesh) => mesh.castShadow === false)).toBe(true);

    expect(soldier.setDistanceToCamera(DEFAULT_SOLDIER_LOD_DISTANCES.reduced)).toBe('reduced');
    const reducedDraws = visibleMeshCount(soldier.group);
    expect(reducedDraws).toBeLessThanOrEqual(36);
    expect(visibleTriangleCount(soldier.group)).toBeLessThanOrEqual(5_500);
    expect(reducedDraws).toBeLessThan(fullDraws);
    expect(smallDetails.every((mesh) => mesh.visible === false)).toBe(true);

    expect(soldier.setDistanceToCamera(DEFAULT_SOLDIER_LOD_DISTANCES.silhouette)).toBe('silhouette');
    const silhouetteDraws = visibleMeshCount(soldier.group);
    expect(silhouetteDraws).toBe(7);
    expect(visibleTriangleCount(soldier.group)).toBeLessThanOrEqual(450);
    expect(silhouetteDraws).toBeLessThan(reducedDraws);
    expect(detailed?.visible).toBe(false);
    expect(silhouette?.visible).toBe(true);
    soldier.dispose();
  });

  it('keeps every weapon inside the full and reduced presentation budgets', () => {
    const soldier = new SoldierModel({ showName: false });
    for (const id of WEAPONS) {
      soldier.setWeapon(id);
      soldier.setDetailLevel('full');
      expect(visibleMeshCount(soldier.group), `${id} full draws`).toBeLessThanOrEqual(65);
      expect(visibleTriangleCount(soldier.group), `${id} full triangles`).toBeLessThanOrEqual(8_500);
      soldier.setDetailLevel('reduced');
      expect(visibleMeshCount(soldier.group), `${id} reduced draws`).toBeLessThanOrEqual(36);
      expect(visibleTriangleCount(soldier.group), `${id} reduced triangles`).toBeLessThanOrEqual(5_500);
    }
    soldier.dispose();
  });

  it('uses hysteresis, retains weapons, and keeps muzzle queries valid while far away', () => {
    const soldier = new SoldierModel({ showName: false });
    expect(soldier.setDistanceToCamera(22)).toBe('reduced');
    expect(soldier.setDistanceToCamera(20)).toBe('reduced');
    expect(soldier.setDistanceToCamera(18.9)).toBe('full');
    expect(soldier.setDistanceToCamera(48)).toBe('silhouette');
    expect(soldier.setDistanceToCamera(46)).toBe('silhouette');
    expect(soldier.setDistanceToCamera(44.9)).toBe('reduced');

    soldier.setDetailLevel('silhouette');
    for (const id of WEAPONS) {
      soldier.setWeapon(id);
      for (const candidate of WEAPONS) {
        expect(soldier.group.getObjectByName(`silhouette-${candidate}`)?.visible).toBe(candidate === id);
      }
      soldier.animate(1 / 60, { alive: true, moveSpeed: 3, aimPitch: .2 });
      soldier.group.updateMatrixWorld(true);
      const muzzle = soldier.getMuzzleWorldPosition();
      expect(Number.isFinite(muzzle.x + muzzle.y + muzzle.z)).toBe(true);
    }
    soldier.setDetailLevel('full');
    expect(soldier.group.getObjectByName('soldier-detailed')?.visible).toBe(true);
    soldier.dispose();
  });

  it('keeps a combat-readable held model for every weapon at reduced detail', () => {
    const soldier = new SoldierModel({ showName: false });
    soldier.setDetailLevel('reduced');
    for (const id of WEAPONS) {
      soldier.setWeapon(id);
      const held = soldier.group.getObjectByName(`held-${id}`)!;
      let visibleMeshes = 0;
      held.traverse((object) => {
        if (object instanceof THREE.Mesh && isEffectivelyVisible(object)) visibleMeshes++;
      });
      expect(visibleMeshes, id).toBeGreaterThan(0);
    }
    soldier.dispose();
  });
});
