import * as THREE from 'three';
import { WeaponMaterialLibrary } from './weaponMaterials';

export interface SniperPresentationGeometry {
  box: THREE.BoxGeometry;
  cylinder8: THREE.CylinderGeometry;
}

/**
 * Coarse unscoped Dragunov silhouette from Woodland samples 95 and 119–122.
 * The native 200×90 frames establish a slim dark gun, elongated upper optic
 * and subdued gray angular lower surfaces. They do not resolve fine mechanisms,
 * furniture, lens finish or exact dimensions. Keep those details understated.
 * Existing groups, animation parts and anchors are retained. Geometry is
 * borrowed and finishes reuse the collection's cached material library.
 */
export function applyLegacySniperPresentation(
  model: THREE.Group,
  geometry: SniperPresentationGeometry,
  materials: WeaponMaterialLibrary,
): void {
  const body = model.getObjectByName('svd-body');
  const optic = model.getObjectByName('pso-optic');
  if (!body || !optic) throw new Error('Dragunov presentation requires its existing body and optic');

  // Preserve all neutral transforms and non-rendering markers while removing
  // unsupported prominent wooden furniture, blue lenses and visible hands.
  model.traverse(object => {
    if (object instanceof THREE.Mesh) object.visible = false;
  });
  const dark = materials.viewModelPalette('legacy').darkMetal;
  // Already created for RG6. Do not alter the shared finish here: the darker
  // gray is sufficient for the narrow faces visible under the source optic.
  const gray = materials.get('gunmetal', { tint: 0xa8adb0, roughness: .92, metalness: .05 });
  const faces = [dark, gray, gray, dark, dark, gray];
  const add = (
    parent: THREE.Object3D, name: string, shape: THREE.BufferGeometry,
    finish: THREE.Material | THREE.Material[], position: [number, number, number],
    size: [number, number, number], rotation: [number, number, number] = [0, 0, 0],
  ) => {
    const mesh = new THREE.Mesh(shape, finish);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...size);
    mesh.rotation.set(...rotation);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  add(body, 'legacy-dragunov-lower-body', geometry.box, faces,
    [0, -.015, -.25], [.22, .16, 1.48]);
  add(body, 'legacy-dragunov-rear-body', geometry.box, faces,
    [0, -.045, .56], [.24, .15, .65]);
  add(body, 'legacy-dragunov-upper-body', geometry.box, dark,
    [0, .09, -.27], [.18, .055, 1.23]);
  add(body, 'legacy-dragunov-barrel', geometry.cylinder8, dark,
    [0, .065, -1.69], [.074, 1.3, .074], [Math.PI / 2, 0, 0]);

  // Narrow the oversized camera-facing lens of the authored modern model.
  // A single dark horizontal tube and small angular support are the only
  // optic features consistently visible in these compressed source fragments.
  add(optic, 'legacy-dragunov-optic', geometry.cylinder8, dark,
    [0, -.01, -.04], [.16, 1.12, .16], [Math.PI / 2, 0, 0]);
  add(optic, 'legacy-dragunov-optic-support', geometry.box, dark,
    [-.055, -.11, -.045], [.075, .14, .5]);
  const magazine = model.getObjectByName('magazine');
  if (magazine) add(magazine, 'legacy-dragunov-magazine', geometry.box, dark,
    [0, -.11, .015], [.15, .35, .2], [-.1, 0, 0]);
  const bolt = model.getObjectByName('bolt');
  if (bolt) add(bolt, 'legacy-dragunov-bolt', geometry.box, gray,
    [0, 0, 0], [.025, .04, .28]);
}
