import * as THREE from 'three';
import { WeaponMaterialLibrary } from './weaponMaterials';

export interface ShotgunPresentationGeometry {
  box: THREE.BoxGeometry;
  cylinder8: THREE.CylinderGeometry;
  torus: THREE.TorusGeometry;
}

/**
 * Broad visible SPAS12 surfaces from Woodland storyboard samples 79/81/85.
 * Native 200×90 evidence establishes the gray platform, dark upper barrel and
 * rear round forms, but cannot specify hidden mechanisms or exact dimensions.
 * Existing animation groups and anchors remain attached; modern is unaffected.
 * All geometry is borrowed and materials are owned by the shared library.
 */
export function applyLegacyShotgunPresentation(
  model: THREE.Group,
  geometry: ShotgunPresentationGeometry,
  materials: WeaponMaterialLibrary,
): void {
  model.traverse(object => {
    if (object instanceof THREE.Mesh) object.visible = false;
  });
  const body = model.getObjectByName('spas12-body');
  if (!body) throw new Error('SPAS12 presentation requires its existing body');

  // Reuse the launcher's existing cached gray finish rather than introducing
  // additional texture/material ownership for this coarse source comparison.
  const gray = materials.get('gunmetal', { tint: 0xe1e4e5, roughness: .9, metalness: .08 });
  gray.color.setHex(0xb7bec1);
  gray.emissive.setHex(0x7b8285);
  gray.emissiveIntensity = .65;
  gray.flatShading = true;
  const dark = materials.viewModelPalette('legacy').darkMetal;

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
  const faces = [dark, gray, gray, dark, dark, gray];
  // Angular tray runs back toward the lower-right, rather than the present
  // modern gun's exposed black pistol grip, hands and slender skeletal stock.
  add(body, 'legacy-spas12-platform', geometry.box, faces, [0, -.09, -.22], [.43, .15, 1.66]);
  add(body, 'legacy-spas12-receiver', geometry.box, faces, [.035, .055, .18], [.37, .24, .62]);
  add(body, 'legacy-spas12-left-rail', geometry.box, gray, [-.205, .035, -.48], [.055, .17, 1.22]);
  add(body, 'legacy-spas12-right-rail', geometry.box, faces, [.205, .035, -.48], [.055, .17, 1.22]);
  add(body, 'legacy-spas12-upper-barrel', geometry.cylinder8, dark, [-.065, .15, -1.11], [.115, 1.65, .115], [Math.PI / 2, 0, 0]);
  add(body, 'legacy-spas12-front-collar', geometry.cylinder8, gray, [-.065, .15, -1.875], [.16, .13, .16], [Math.PI / 2, 0, 0]);
  // Small gray rounded surrounds with dark openings rise just above the rear
  // platform in the native frames. Keep them subordinate to that broad face.
  // These are visual outlines; they do not assert their mechanical purpose.
  for (const [index, z] of [-.06, .29].entries()) {
    add(body, `legacy-spas12-rear-round-form-${index}`, geometry.torus, gray,
      [.125, .16, z], [.154, .175, .154]);
  }
  const pump = model.getObjectByName('pump');
  if (pump) add(pump, 'legacy-spas12-pump-surface', geometry.box, faces,
    [0, -.035, 0], [.35, .16, .48]);
  const bolt = model.getObjectByName('bolt');
  if (bolt) add(bolt, 'legacy-spas12-bolt-surface', geometry.box, dark,
    [.035, .055, -.02], [.05, .065, .22]);
}
