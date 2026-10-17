import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { WeaponId } from './weapons';
import { applyLegacyShotgunPresentation } from './viewModelShotgun';
import { applyLegacySniperPresentation } from './viewModelSniper';
import { WeaponMaterialLibrary, type WeaponMaterialLibraryOptions } from './weaponMaterials';
import {
  createRifleViewModelGeometry,
  type RifleGroupedGeometryResource,
  type RifleViewModelGeometrySet,
} from './rifleViewModelGeometry';

/** Camera-local convention used by every model returned by this module. */
export const VIEW_MODEL_FORWARD = new THREE.Vector3(0, 0, -1);

export type WeaponPresentation = 'legacy' | 'modern';

export interface ViewModelWeaponsOptions extends WeaponMaterialLibraryOptions {
  /** Legacy defaults to the angular presentation guided by saved original gameplay. */
  presentation?: WeaponPresentation;
}

export interface ViewModelPose {
  /** Suggested position for the parent view-model container, in camera space. */
  position: THREE.Vector3;
  /** Suggested XYZ Euler rotation for the parent view-model container. */
  rotation: THREE.Euler;
  /** Suggested camera field of view in degrees. */
  fov: number;
}

export interface ViewModelWeaponAnchors {
  /** Bore exit. Its local -Z axis is the projectile direction. */
  muzzle: THREE.Object3D;
  /** Rear sight / optic centre, useful when calculating an exact ADS offset. */
  sight: THREE.Object3D;
  /** Casing spawn point. Its local +X axis is the suggested ejection direction. */
  ejection: THREE.Object3D;
  rightHand: THREE.Object3D;
  leftHand: THREE.Object3D;
}

/**
 * Animation pivots. Only parts that exist on a weapon are populated.
 * Moving a pivot never detaches the hands or the weapon root.
 */
export interface ViewModelMovableParts {
  magazine?: THREE.Group;
  bolt?: THREE.Group;
  pump?: THREE.Group;
  cylinder?: THREE.Group;
  rocket?: THREE.Group;
  trigger?: THREE.Group;
  safety?: THREE.Group;
}

export interface ViewModelWeaponMetadata {
  id: WeaponId;
  /** Model root from `models`, repeated here for convenient iteration. */
  model: THREE.Group;
  anchors: ViewModelWeaponAnchors;
  parts: ViewModelMovableParts;
  poses: {
    hip: ViewModelPose;
    ads: ViewModelPose;
    sprint: ViewModelPose;
  };
  /** Model-local forward axis. No compensating Y rotation is required. */
  forward: THREE.Vector3;
}

export interface ViewModelWeaponCollection {
  models: Map<WeaponId, THREE.Group>;
  metadata: Map<WeaponId, ViewModelWeaponMetadata>;
  forward: THREE.Vector3;
  /** Disposes all geometries and materials owned by this collection exactly once. */
  dispose(): void;
}

type MaterialKey =
  | 'gunmetal' | 'darkMetal' | 'edgeMetal' | 'polymer' | 'olive' | 'wood'
  | 'glove' | 'sleeve' | 'stitch' | 'brass' | 'glass' | 'lensGlow' | 'marking';

interface Resources {
  presentation: WeaponPresentation;
  geometries: {
    box: THREE.BoxGeometry;
    beveledBox: RoundedBoxGeometry;
    cylinder20: THREE.CylinderGeometry;
    cylinder8: THREE.CylinderGeometry;
    cylinderOpen: THREE.CylinderGeometry;
    ogive: THREE.LatheGeometry;
    sphere: THREE.SphereGeometry;
    capsule: THREE.CapsuleGeometry;
    torus: THREE.TorusGeometry;
  };
  materials: Record<MaterialKey, THREE.Material>;
  rifleMaterials: Record<RifleGroupedGeometryResource['materialSlots'][number], THREE.Material>;
  weaponMaterials: WeaponMaterialLibrary;
  rifleGeometry: RifleViewModelGeometrySet;
  ownedMaterials: THREE.Material[];
}

interface WeaponBuild {
  id: WeaponId;
  model: THREE.Group;
  anchors: ViewModelWeaponAnchors;
  parts: ViewModelMovableParts;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DEFAULT_SCALE = 0.62;

/** Authored two-tone faceting follows the source's light top/darker side faces. */
function legacyLauncherTubeGeometry(): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(.5, .5, 1, 8);
  geometry.clearGroups();
  const index=geometry.index!;const normals=geometry.getAttribute('normal');
  let previous=-1;let start=0;
  for(let offset=0;offset<index.count;offset+=3) {
    const z=(normals.getZ(index.getX(offset))+normals.getZ(index.getX(offset+1))+normals.getZ(index.getX(offset+2)))/3;
    // After the mesh's X quarter-turn, negative local Z is the upper face.
    const materialIndex=z < -.35 ? 0 : 1;
    if(materialIndex!==previous) {
      if(previous!==-1) geometry.addGroup(start,offset-start,previous);
      start=offset;previous=materialIndex;
    }
  }
  geometry.addGroup(start,index.count-start,previous);
  return geometry;
}

function resources(options: ViewModelWeaponsOptions): Resources {
  const presentation = options.presentation ?? 'legacy';
  const weaponMaterials = new WeaponMaterialLibrary(options);
  const rifleGeometry = createRifleViewModelGeometry(presentation);
  const palette = weaponMaterials.viewModelPalette(presentation);
  const rifleMaterials = {
    gunmetal: palette.gunmetal,
    darkMetal: palette.darkMetal,
    edgeMetal: palette.edgeMetal,
    wood: palette.wood,
  };
  if (presentation === 'legacy') {
    // Both sharper Woodland captures show broad, blue-gray receiver faces even
    // in a dark interior. Give only the rifle a restrained ambient contribution.
    for (const slot of ['gunmetal', 'darkMetal', 'edgeMetal'] as const) {
      const tint = slot === 'darkMetal' ? 0x9498b0 : slot === 'edgeMetal' ? 0xd4d7ed : 0xc8cbe6;
      const material = weaponMaterials.get('gunmetal', { tint, roughness: .9, metalness: .08 });
      // The foreground extension is visibly paler than the receiver in the
      // preserved Woodland frame, including under subdued scene lighting.
      material.emissive.setHex(slot==='edgeMetal'?0x7e8295:0x303443);
      material.emissiveIntensity = 1.0;
      rifleMaterials[slot] = material;
    }
  }
  const opticGlass = options.tier === 'low'
    ? new THREE.MeshStandardMaterial({
      name: 'Low-tier optic glass', color: 0x244956, emissive: 0x102a33,
      emissiveIntensity: .72, roughness: .16, metalness: .16,
    })
    : new THREE.MeshPhysicalMaterial({
      name: 'High-tier optic glass', color: 0x193642, roughness: .08,
      metalness: .18, clearcoat: 1, transmission: .22, thickness: .03,
    });
  const ownedMaterials: THREE.Material[] = [
    new THREE.MeshStandardMaterial({ color: 0x353e3a, roughness: .94, metalness: 0 }),
    new THREE.MeshStandardMaterial({ color: 0x667664, roughness: .96, metalness: 0 }),
    new THREE.MeshStandardMaterial({ color: 0x879080, roughness: .9, metalness: 0 }),
    new THREE.MeshStandardMaterial({ color: 0xb38a42, roughness: .35, metalness: .78 }),
    opticGlass,
    new THREE.MeshStandardMaterial({
      color: 0x315f6b, emissive: 0x12333c, emissiveIntensity: .9,
      roughness: .08, metalness: .12,
    }),
    new THREE.MeshStandardMaterial({ color: 0xd5d0b7, roughness: .56, metalness: .1 }),
  ];
  return {
    presentation,
    geometries: {
      box: new THREE.BoxGeometry(1, 1, 1),
      beveledBox: new RoundedBoxGeometry(1, 1, 1, 1, .075),
      cylinder20: new THREE.CylinderGeometry(.5, .5, 1, 20),
      cylinder8: legacyLauncherTubeGeometry(),
      cylinderOpen: new THREE.CylinderGeometry(.5, .5, 1, 20, 1, true, Math.PI / 2, Math.PI),
      ogive: new THREE.LatheGeometry([
        new THREE.Vector2(.015, -.9), new THREE.Vector2(.095, -.8),
        new THREE.Vector2(.18, -.58), new THREE.Vector2(.2, -.38),
        new THREE.Vector2(.13, -.12), new THREE.Vector2(.065, .5),
      ], 20).rotateX(Math.PI / 2),
      sphere: new THREE.SphereGeometry(.5, 16, 10),
      capsule: new THREE.CapsuleGeometry(.5, 1, 5, 10),
      torus: new THREE.TorusGeometry(.5, .1, 8, 20),
    },
    materials: {
      ...palette,
      glove: ownedMaterials[0],
      sleeve: ownedMaterials[1],
      stitch: ownedMaterials[2],
      brass: ownedMaterials[3],
      glass: ownedMaterials[4],
      lensGlow: ownedMaterials[5],
      marking: ownedMaterials[6],
    },
    rifleMaterials,
    weaponMaterials,
    rifleGeometry,
    ownedMaterials,
  };
}

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  position: [number, number, number],
  scale: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  name?: string,
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(...position);
  result.scale.set(...scale);
  result.rotation.set(...rotation);
  result.castShadow = true;
  result.receiveShadow = true;
  if (name) result.name = name;
  parent.add(result);
  return result;
}

function box(
  r: Resources, parent: THREE.Object3D, size: [number, number, number],
  position: [number, number, number], material: MaterialKey,
  rotation: [number, number, number] = [0, 0, 0], name?: string,
): THREE.Mesh {
  const crisp = r.presentation === 'legacy' || material === 'edgeMetal' || material === 'marking' || material === 'brass' ||
    Math.min(size[0], size[1], size[2]) < .055;
  return mesh(parent, crisp ? r.geometries.box : r.geometries.beveledBox, r.materials[material], position, size, rotation, name);
}

function cylinderZ(
  r: Resources, parent: THREE.Object3D, radius: number, length: number,
  position: [number, number, number], material: MaterialKey,
  name?: string,
): THREE.Mesh {
  return mesh(
    parent,
    r.geometries.cylinder20,
    r.materials[material], position, [radius * 2, length, radius * 2],
    [Math.PI / 2, 0, 0], name,
  );
}

function cylinderX(
  r: Resources, parent: THREE.Object3D, radius: number, length: number,
  position: [number, number, number], material: MaterialKey, name?: string,
): THREE.Mesh {
  return mesh(
    parent, r.geometries.cylinder20, r.materials[material], position,
    [radius * 2, length, radius * 2], [0, 0, Math.PI / 2], name,
  );
}

function ellipsoid(
  r: Resources, parent: THREE.Object3D, size: [number, number, number],
  position: [number, number, number], material: MaterialKey,
  rotation: [number, number, number] = [0, 0, 0], name?: string,
): THREE.Mesh {
  return mesh(parent, r.geometries.sphere, r.materials[material], position, size, rotation, name);
}

function group(parent: THREE.Object3D, name: string, position: [number, number, number] = [0, 0, 0]): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  result.position.set(...position);
  parent.add(result);
  return result;
}

function marker(parent: THREE.Object3D, name: string, position: [number, number, number]): THREE.Object3D {
  const result = new THREE.Object3D();
  result.name = name;
  result.position.set(...position);
  parent.add(result);
  return result;
}

function capsuleBetween(
  r: Resources, parent: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3,
  radius: number, material: MaterialKey, name?: string,
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const result = mesh(
    parent, r.geometries.capsule, r.materials[material],
    [0, 0, 0], [radius * 2, Math.max(.01, length / 2), radius * 2],
  );
  result.position.copy(start).add(end).multiplyScalar(.5);
  result.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  if (name) result.name = name;
  return result;
}

interface HandPose {
  wrist: [number, number, number];
  palm: [number, number, number];
  sleeve: [number, number, number];
  rotation?: [number, number, number];
}

function addHand(r: Resources, parent: THREE.Group, side: 'left' | 'right', pose: HandPose): THREE.Object3D {
  const hand = group(parent, `${side}-hand-anchor`, pose.palm);
  if (pose.rotation) hand.rotation.set(...pose.rotation);
  ellipsoid(r, hand, [.19, .14, .22], [0, 0, 0], 'glove', [0, 0, side === 'left' ? -.2 : .2], `${side}-palm`);
  // Knuckles and curled fingers break up the old capsule-only silhouette.
  for (let index = 0; index < 4; index++) {
    const x = (index - 1.5) * .047;
    capsuleBetween(
      r, hand,
      new THREE.Vector3(x, -.02, -.05),
      new THREE.Vector3(x, -.105, -.13),
      .025, 'glove', `${side}-finger-${index}`,
    );
  }
  capsuleBetween(
    r, hand,
    new THREE.Vector3(side === 'left' ? .105 : -.105, .01, .015),
    new THREE.Vector3(side === 'left' ? .14 : -.14, -.07, -.055),
    .033, 'glove', `${side}-thumb`,
  );
  const wrist = new THREE.Vector3(...pose.wrist);
  const sleeve = new THREE.Vector3(...pose.sleeve);
  capsuleBetween(r, parent, sleeve, wrist, .105, 'sleeve', `${side}-sleeve`);
  cylinderZ(r, parent, .107, .025, [pose.wrist[0], pose.wrist[1], pose.wrist[2]], 'stitch', `${side}-cuff`);
  return hand;
}

function addHands(
  r: Resources, model: THREE.Group,
  right: HandPose, left: HandPose,
): Pick<ViewModelWeaponAnchors, 'rightHand' | 'leftHand'> {
  return {
    rightHand: addHand(r, model, 'right', right),
    leftHand: addHand(r, model, 'left', left),
  };
}

function ironSight(r: Resources, parent: THREE.Object3D, z: number, height: number): void {
  box(r, parent, [.025, .12, .025], [-.045, height, z], 'darkMetal');
  box(r, parent, [.025, .12, .025], [.045, height, z], 'darkMetal');
  box(r, parent, [.11, .025, .025], [0, height - .047, z], 'darkMetal');
}

function ventRows(r: Resources, parent: THREE.Object3D, zStart: number, count: number, spacing: number, y: number): void {
  for (let index = 0; index < count; index++) {
    const z = zStart - index * spacing;
    box(r, parent, [.13, .012, .035], [0, y, z], 'edgeMetal');
  }
}

function addRifleGroupedGeometry(
  r: Resources,
  parent: THREE.Object3D,
  resource: RifleGroupedGeometryResource,
  name: string,
): THREE.Mesh {
  const layer = mesh(
    parent,
    resource.geometry,
    resource.materialSlots.map((slot) => r.rifleMaterials[slot]),
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
    name,
  );
  layer.userData.rifleHeroLayer = name;
  layer.userData.rifleMaterialSlots = resource.materialSlots;
  return layer;
}

function baseModel(id: WeaponId): THREE.Group {
  const model = new THREE.Group();
  model.name = `view-model-${id}`;
  model.scale.setScalar(DEFAULT_SCALE);
  model.userData.weaponId = id;
  model.userData.forward = '-Z';
  return model;
}

function buildPistol(r: Resources): WeaponBuild {
  const id: WeaponId = 'pistol';
  const model = baseModel(id);
  const body = group(model, 'pistol-body');
  // TT-inspired slim slide with separate reciprocating bolt/slide pivot.
  const bolt = group(body, 'pistol-slide');
  box(r, bolt, [.19, .17, .62], [0, .055, -.31], 'gunmetal');
  box(r, bolt, [.195, .026, .38], [0, .15, -.23], 'edgeMetal');
  for (let index = 0; index < 5; index++) {
    box(r, bolt, [.202, .045, .012], [0, .075, -.08 + index * .031], 'darkMetal');
  }
  cylinderZ(r, bolt, .034, .5, [0, .05, -.42], 'darkMetal');
  box(r, body, [.17, .12, .37], [0, -.06, -.14], 'darkMetal');
  const grip = group(body, 'pistol-grip', [0, -.17, -.04]);
  box(r, grip, [.15, .38, .2], [0, -.16, .045], 'polymer', [-.18, 0, 0]);
  for (let index = 0; index < 4; index++) box(r, grip, [.155, .018, .19], [0, -.065 - index * .067, .045 + index * .012], 'gunmetal');
  const magazine = group(grip, 'magazine', [0, -.25, .09]);
  box(r, magazine, [.115, .24, .13], [0, 0, 0], 'gunmetal', [-.18, 0, 0]);
  box(r, magazine, [.13, .025, .15], [0, -.13, .022], 'edgeMetal');
  const trigger = group(body, 'trigger', [0, -.105, -.2]);
  mesh(trigger, r.geometries.torus, r.materials.darkMetal, [0, 0, 0], [.16, .18, .18], [0, Math.PI / 2, 0]);
  box(r, trigger, [.018, .12, .018], [0, -.01, .01], 'edgeMetal', [.28, 0, 0]);
  box(r, bolt, [.025, .06, .025], [0, .175, -.57], 'darkMetal');
  box(r, bolt, [.075, .025, .025], [0, .154, -.06], 'darkMetal');

  const hands = addHands(r, model,
    { palm: [.14, -.31, .03], wrist: [.19, -.36, .12], sleeve: [.48, -.72, .48], rotation: [-.16, 0, -.35] },
    { palm: [-.07, -.3, -.01], wrist: [-.14, -.37, .09], sleeve: [-.42, -.7, .33], rotation: [-.12, 0, .25] },
  );
  return {
    id, model,
    anchors: {
      muzzle: marker(bolt, 'muzzle', [0, .055, -.635]),
      sight: marker(bolt, 'sight', [0, .182, -.06]),
      ejection: marker(bolt, 'ejection', [.105, .105, -.23]),
      ...hands,
    },
    parts: { magazine, bolt, trigger },
  };
}

function buildRifle(r: Resources): WeaponBuild {
  const id: WeaponId = 'rifle';
  const model = baseModel(id);
  const body = group(model, 'ak47-body');
  addRifleGroupedGeometry(r, body, r.rifleGeometry.fixed, 'ak47-hero-fixed');

  const magazine = group(body, 'magazine', [0, -.19, -.2]);
  addRifleGroupedGeometry(r, magazine, r.rifleGeometry.magazine, 'ak47-hero-magazine');

  const bolt = group(body, 'bolt', [.112, .07, -.23]);
  box(r, bolt, [.025, .055, .28], [0, 0, 0], 'edgeMetal');
  cylinderX(r, bolt, .025, .13, [.04, .02, .08], 'edgeMetal');

  const trigger = group(body, 'trigger', [0, -.13, -.01]);
  mesh(trigger, r.geometries.torus, r.materials.darkMetal, [0, 0, 0], [.17, .2, .2], [0, Math.PI / 2, 0]);

  const safety = group(body, 'safety', [.112, .02, -.08]);
  box(r, safety, [.02, .035, .3], [0, 0, 0], 'edgeMetal', [-.08, 0, 0]);

  const hands = addHands(r, model,
    { palm: [.145, -.28, .08], wrist: [.22, -.35, .16], sleeve: [.51, -.72, .48], rotation: [-.22, 0, -.31] },
    { palm: [-.1, -.13, -.79], wrist: [-.17, -.22, -.67], sleeve: [-.48, -.69, -.22], rotation: [.1, 0, .24] },
  );
  if (r.presentation === 'legacy') {
    // Neither the clear hip frame nor the firing frame exposes player arms.
    // Retain the anchors and geometry for animations and the modern option.
    model.traverse((object) => {
      if (object.name.startsWith('left-') || object.name.startsWith('right-')) object.visible = false;
    });
  }
  return {
    id, model,
    anchors: {
      muzzle: marker(body, 'muzzle', [0, .045, -1.9]),
      sight: marker(body, 'sight', [0, .19, -.08]),
      ejection: marker(body, 'ejection', [.13, .075, -.27]),
      ...hands,
    },
    parts: { magazine, bolt, trigger, safety },
  };
}

function buildShotgun(r: Resources): WeaponBuild {
  const id: WeaponId = 'shotgun';
  const model = baseModel(id);
  const body = group(model, 'spas12-body');
  box(r, body, [.22, .24, .65], [0, .015, -.21], 'gunmetal');
  box(r, body, [.25, .21, .55], [0, -.01, .39], 'polymer');
  box(r, body, [.21, .34, .24], [0, -.19, .2], 'polymer', [-.2, 0, 0]);
  cylinderZ(r, body, .052, 1.42, [0, .08, -1.17], 'darkMetal');
  cylinderZ(r, body, .042, 1.05, [0, -.085, -1.01], 'gunmetal');
  cylinderZ(r, body, .071, .12, [0, .08, -1.91], 'darkMetal');
  // A curved SPAS-style heat shield replaces the old flat plate and fake rods.
  mesh(body, r.geometries.cylinderOpen, r.materials.gunmetal, [0, .08, -1.04], [.27, .94, .27], [Math.PI / 2, 0, 0], 'perforated-heat-shield');
  for (let index = 0; index < 7; index++) {
    box(r, body, [.19, .012, .045], [0, .205, -.68 - index * .12], 'darkMetal', [0, 0, 0], `shield-vent-${index}`);
  }
  const pump = group(body, 'pump', [0, -.04, -.98]);
  box(r, pump, [.27, .23, .47], [0, 0, 0], 'polymer');
  for (let index = 0; index < 4; index++) box(r, pump, [.278, .24, .015], [0, 0, -.15 + index * .10], 'edgeMetal');
  const bolt = group(body, 'bolt', [.12, .06, -.17]);
  box(r, bolt, [.025, .1, .25], [0, 0, 0], 'edgeMetal');
  // Folded skeletal stock above the receiver.
  box(r, body, [.035, .035, .95], [-.105, .22, .31], 'edgeMetal', [-.05, 0, 0]);
  box(r, body, [.035, .035, .95], [.105, .22, .31], 'edgeMetal', [-.05, 0, 0]);
  box(r, body, [.25, .05, .12], [0, .23, .78], 'polymer');
  ironSight(r, body, -1.68, .19);
  const trigger = group(body, 'trigger', [0, -.14, .01]);
  mesh(trigger, r.geometries.torus, r.materials.darkMetal, [0, 0, 0], [.18, .2, .2], [0, Math.PI / 2, 0]);
  const magazine = group(body, 'loading-gate', [0, -.13, -.24]);
  box(r, magazine, [.13, .018, .22], [0, 0, 0], 'edgeMetal');

  const hands = addHands(r, model,
    { palm: [.145, -.28, .2], wrist: [.23, -.36, .25], sleeve: [.52, -.72, .56], rotation: [-.22, 0, -.3] },
    { palm: [-.1, -.17, -.98], wrist: [-.19, -.25, -.82], sleeve: [-.5, -.69, -.29], rotation: [.09, 0, .2] },
  );
  if (r.presentation === 'legacy') applyLegacyShotgunPresentation(model, r.geometries, r.weaponMaterials);
  return {
    id, model,
    anchors: {
      muzzle: marker(body, 'muzzle', [0, .08, -1.99]),
      sight: marker(body, 'sight', [0, .19, -.06]),
      ejection: marker(body, 'ejection', [.135, .075, -.17]),
      ...hands,
    },
    parts: { magazine, bolt, pump, trigger },
  };
}

function buildLauncher(r: Resources): WeaponBuild {
  const legacy = r.presentation === 'legacy';
  if (legacy) {
    // The directly decoded 1.3 s RG6 frame shows gray broad faces, not olive
    // furniture. Scope these cached material variants to the launcher only.
    const gray = r.weaponMaterials.get('gunmetal', { tint: 0xe1e4e5, roughness: .9, metalness: .08 });
    gray.color.setHex(0xb7bec1);
    gray.emissive.setHex(0x7b8285); gray.emissiveIntensity = .65;
    gray.flatShading = true;
    const darkGray = r.weaponMaterials.get('gunmetal', { tint: 0xa8adb0, roughness: .92, metalness: .05 });
    darkGray.color.setHex(0x78838a);
    darkGray.emissive.setHex(0x485259); darkGray.emissiveIntensity = .6;
    const grayPolymer = r.weaponMaterials.get('polymer', { tint: 0xc6cbd0, roughness: .95, metalness: 0 });
    grayPolymer.color.setHex(0x899298);
    grayPolymer.emissive.setHex(0x485259); grayPolymer.emissiveIntensity = .55;
    r = { ...r, materials: { ...r.materials, gunmetal: gray, darkMetal: darkGray,
      edgeMetal: gray, olive: gray, polymer: grayPolymer } };
  }
  const id: WeaponId = 'launcher';
  const model = baseModel(id);
  const body = group(model, 'rg6-body');
  box(r, body, [.22, .23, .52], [0, .035, .14], 'olive');
  box(r, body, [.19, .38, .17], [0, -.23, .27], 'polymer', [-.18, 0, 0]);
  box(r, body, [.24, .22, .42], [0, .02, .55], 'polymer');
  const cylinder = group(body, 'six-shot-cylinder', [0, legacy ? -.29 : -.02, -.42]);
  cylinderZ(r, cylinder, .3, .5, [0, 0, 0], 'gunmetal');
  for (let index = 0; index < 6; index++) {
    const angle = index * Math.PI / 3;
    const x = Math.cos(angle) * .16;
    const y = Math.sin(angle) * .16;
    mesh(
      cylinder, r.geometries.torus, r.materials.darkMetal,
      // The rear face is the one visible from the player's shoulder. Keeping
      // the six recessed rims here makes the RG-6 cylinder read as a launcher
      // instead of a featureless drum in its normal hip pose.
      [x, y, .258], [.17, .17, .17], [0, 0, 0], `chamber-${index}`,
    );
  }
  cylinderZ(r, body, .075, .63, [0, .055, -.97], 'darkMetal');
  cylinderZ(r, body, .09, .17, [0, .055, -1.36], 'gunmetal');
  box(r, body, [.18, .12, .54], [0, .17, -.88], 'olive');
  ventRows(r, body, -.7, 4, .12, .24);
  if (!legacy) ironSight(r, body, -1.21, .27);
  box(r, body, [.12, .38, .14], [0, -.23, -.81], 'polymer', [.08, 0, 0]);
  const trigger = group(body, 'trigger', [0, -.15, .12]);
  mesh(trigger, r.geometries.torus, r.materials.darkMetal, [0, 0, 0], [.17, .19, .19], [0, Math.PI / 2, 0]);
  const safety = group(body, 'safety', [.13, .03, .13]);
  cylinderX(r, safety, .035, .08, [0, 0, 0], 'marking');

  if (legacy) {
    // Broad upper tube and flat support seen in the visible source portion.
    // Dimensions are authored screen-composition approximations.
    mesh(body, r.geometries.cylinder8, [r.materials.gunmetal, r.materials.darkMetal], [0, .055, -.39], [.30, 2.16, .30], [Math.PI / 2, 0, 0], 'legacy-rg6-upper-tube');
    mesh(body, r.geometries.cylinder8, [r.materials.gunmetal, r.materials.darkMetal], [0, .055, -1.395], [.34, .15, .34], [Math.PI / 2, 0, 0], 'legacy-rg6-front-collar');
    const faces = [r.materials.darkMetal, r.materials.darkMetal, r.materials.gunmetal, r.materials.darkMetal, r.materials.darkMetal, r.materials.darkMetal];
    mesh(body, r.geometries.box, faces, [0, -.16, -.09], [.55, .13, 1.30], [0, 0, 0], 'legacy-rg6-support-platform');
    box(r, body, [.045, .39, .91], [-.255, -.27, -.05], 'darkMetal', [0, 0, 0], 'legacy-rg6-side-frame');
    mesh(body, r.geometries.box, faces, [0, -.15, .38], [.45, .30, .46], [0, 0, 0], 'legacy-rg6-rear-body');
    for (let index = 0; index < 6; index++) cylinder.getObjectByName(`chamber-${index}`)!.visible = false;
  }

  const hands = addHands(r, model,
    { palm: [.15, -.3, .27], wrist: [.23, -.38, .32], sleeve: [.51, -.74, .58], rotation: [-.2, 0, -.3] },
    { palm: [-.13, -.29, -.78], wrist: [-.22, -.36, -.65], sleeve: [-.5, -.72, -.19], rotation: [.08, 0, .19] },
  );
  if (legacy) model.traverse(object => {
    if (object.name.startsWith('left-') || object.name.startsWith('right-')) object.visible = false;
  });
  return {
    id, model,
    anchors: {
      muzzle: marker(body, 'muzzle', [0, .055, -1.48]),
      sight: marker(body, 'sight', [0, .27, -.05]),
      ejection: marker(cylinder, 'ejection', [.31, legacy ? .35 : .08, -.17]),
      ...hands,
    },
    parts: { cylinder, trigger, safety },
  };
}

function buildRpg(r: Resources): WeaponBuild {
  const id: WeaponId = 'rpg';
  const model = baseModel(id);
  const body = group(model, 'rpg7-body');
  cylinderZ(r, body, .11, 1.8, [0, .06, -.43], 'olive');
  cylinderZ(r, body, .135, .12, [0, .06, .36], 'darkMetal');
  cylinderZ(r, body, .15, .17, [0, .06, -.75], 'darkMetal');
  cylinderZ(r, body, .13, .38, [0, .06, .18], 'wood');
  for (let index = 0; index < 5; index++) cylinderZ(r, body, .135, .018, [0, .06, .04 + index * .07], 'edgeMetal');
  // The complete rocket is one movable reload part.
  const rocket = group(body, 'rocket', [0, .06, -1.34]);
  mesh(rocket, r.geometries.ogive, r.materials.olive, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'lathed-warhead');
  cylinderZ(r, rocket, .082, .11, [0, 0, -.16], 'edgeMetal');
  // Fins remain readable at the edge of the screen during reload.
  for (let index = 0; index < 4; index++) {
    const angle = index * Math.PI / 2;
    box(r, rocket, [.025, .13, .22], [Math.cos(angle) * .09, Math.sin(angle) * .09, .39], 'olive', [0, 0, angle]);
  }
  box(r, body, [.13, .42, .15], [0, -.2, -.16], 'wood', [-.08, 0, 0]);
  box(r, body, [.11, .35, .13], [0, -.17, -.72], 'polymer', [.08, 0, 0]);
  const trigger = group(body, 'trigger', [0, -.09, -.31]);
  mesh(trigger, r.geometries.torus, r.materials.darkMetal, [0, 0, 0], [.16, .18, .18], [0, Math.PI / 2, 0]);
  // Optical sight body, glass and mounting bracket.
  const optic = group(body, 'pgo7-optic', [.18, .22, -.45]);
  cylinderZ(r, optic, .095, .42, [0, 0, 0], 'darkMetal');
  cylinderZ(r, optic, .1, .025, [0, 0, -.225], 'lensGlow');
  cylinderZ(r, optic, .105, .025, [0, 0, .225], 'glass');
  box(r, optic, [.045, .25, .12], [-.11, -.12, .08], 'gunmetal');
  box(r, body, [.04, .2, .04], [0, .22, -.9], 'darkMetal');

  const hands = addHands(r, model,
    { palm: [.14, -.3, -.13], wrist: [.22, -.37, -.02], sleeve: [.5, -.73, .36], rotation: [-.12, 0, -.3] },
    { palm: [-.12, -.18, -.76], wrist: [-.21, -.26, -.65], sleeve: [-.49, -.7, -.18], rotation: [.08, 0, .2] },
  );
  return {
    id, model,
    anchors: {
      muzzle: marker(rocket, 'muzzle', [0, 0, -.91]),
      sight: marker(optic, 'sight', [0, 0, .235]),
      // RPGs do not eject brass; this is the rear exhaust origin.
      ejection: marker(body, 'backblast', [.12, .06, .49]),
      ...hands,
    },
    parts: { rocket, trigger },
  };
}

function buildSniper(r: Resources): WeaponBuild {
  const id: WeaponId = 'sniper';
  const model = baseModel(id);
  const body = group(model, 'svd-body');
  box(r, body, [.19, .19, .76], [0, .025, -.2], 'gunmetal');
  box(r, body, [.22, .035, .63], [0, .135, -.16], 'edgeMetal');
  // Laminated upper/lower struts create the SVD's characteristic thumb hole.
  box(r, body, [.24, .10, .66], [0, .12, .49], 'wood', [-.035, 0, 0]);
  box(r, body, [.18, .085, .48], [0, -.115, .54], 'wood', [.13, 0, 0]);
  box(r, body, [.22, .07, .3], [0, .205, .38], 'wood');
  box(r, body, [.23, .34, .09], [0, -.01, .84], 'wood');
  box(r, body, [.12, .28, .2], [0, -.2, .16], 'wood', [-.12, 0, 0]);
  box(r, body, [.26, .19, .73], [0, .02, -.76], 'wood');
  for (let index = 0; index < 4; index++) box(r, body, [.27, .022, .08], [0, .12, -.52 - index * .16], 'edgeMetal');
  cylinderZ(r, body, .038, 1.18, [0, .065, -1.64], 'darkMetal');
  cylinderZ(r, body, .07, .2, [0, .065, -2.3], 'gunmetal');
  cylinderZ(r, body, .048, .86, [0, .145, -1.22], 'gunmetal');
  box(r, body, [.13, .13, .13], [0, .13, -1.54], 'darkMetal');
  ironSight(r, body, -2.13, .2);
  const magazine = group(body, 'magazine', [0, -.17, -.18]);
  box(r, magazine, [.17, .33, .2], [0, -.08, 0], 'darkMetal', [-.1, 0, 0]);
  box(r, magazine, [.16, .16, .19], [0, -.28, .03], 'gunmetal', [-.2, 0, 0]);
  for (let index = 0; index < 4; index++) box(r, magazine, [.175, .018, .19], [0, -.02 - index * .08, index * .01], 'edgeMetal');
  const bolt = group(body, 'bolt', [.115, .08, -.2]);
  box(r, bolt, [.025, .055, .32], [0, 0, 0], 'edgeMetal');
  cylinderX(r, bolt, .025, .16, [.05, 0, .11], 'edgeMetal');
  const trigger = group(body, 'trigger', [0, -.13, .04]);
  mesh(trigger, r.geometries.torus, r.materials.darkMetal, [0, 0, 0], [.17, .2, .2], [0, Math.PI / 2, 0]);
  // PSO-inspired optic with offset mount and adjustment turrets.
  const optic = group(body, 'pso-optic', [.035, .285, -.27]);
  cylinderZ(r, optic, .105, .72, [0, 0, 0], 'darkMetal');
  cylinderZ(r, optic, .125, .09, [0, 0, -.38], 'gunmetal');
  cylinderZ(r, optic, .115, .08, [0, 0, .39], 'gunmetal');
  cylinderZ(r, optic, .11, .02, [0, 0, -.43], 'lensGlow');
  cylinderZ(r, optic, .105, .02, [0, 0, .44], 'glass');
  cylinderX(r, optic, .07, .12, [0, .12, -.05], 'gunmetal');
  cylinderX(r, optic, .055, .14, [.11, 0, -.05], 'gunmetal');
  box(r, optic, [.06, .2, .46], [-.13, -.12, .06], 'gunmetal');

  const hands = addHands(r, model,
    { palm: [.15, -.28, .17], wrist: [.23, -.36, .24], sleeve: [.52, -.73, .56], rotation: [-.2, 0, -.31] },
    { palm: [-.1, -.13, -.78], wrist: [-.18, -.22, -.66], sleeve: [-.48, -.69, -.21], rotation: [.08, 0, .22] },
  );
  if (r.presentation === 'legacy') applyLegacySniperPresentation(model, r.geometries, r.weaponMaterials);
  return {
    id, model,
    anchors: {
      muzzle: marker(body, 'muzzle', [0, .065, -2.42]),
      sight: marker(optic, 'sight', [0, 0, .45]),
      ejection: marker(body, 'ejection', [.13, .09, -.22]),
      ...hands,
    },
    parts: { magazine, bolt, trigger },
  };
}

function posesFor(id: WeaponId, model: THREE.Group, sight: THREE.Object3D, presentation: WeaponPresentation): ViewModelWeaponMetadata['poses'] {
  const long = id === 'sniper' || id === 'shotgun' || id === 'rpg';
  const heavy = id === 'launcher' || id === 'rpg';
  const adsFov = id === 'sniper' ? 21 : id === 'rpg' ? 51 : 57;
  // Cancel the actual, scaled sight offset so the recommendation is useful even
  // for the laterally mounted PGO/PSO optics rather than being a cosmetic guess.
  model.updateMatrixWorld(true);
  const sightOffset = sight.getWorldPosition(new THREE.Vector3());
  const adsDepth: Record<WeaponId, number> = {
    // Keep the rear of each weapon well beyond the view camera's near plane.
    // The sight remains centred because its X/Y offset is cancelled separately.
    pistol: -.81,
    shotgun: -.97,
    rifle: -.92,
    launcher: -.92,
    rpg: -.74,
    sniper: -.99,
  };
  return {
    hip: {
      // These are composition recommendations, not measurements of original FOV.
      position: presentation === 'legacy'
        ? id === 'rifle'
          ? new THREE.Vector3(.33, -.25, -.76)
          : id === 'launcher'
            ? new THREE.Vector3(.41, -.21, -.9)
            : id === 'shotgun'
              ? new THREE.Vector3(.33, -.4, -1.2)
              : new THREE.Vector3(id === 'pistol' ? .22 : .26, long ? -.34 : -.32, long ? -.9 : -.96)
        : new THREE.Vector3(id === 'pistol' ? .27 : .32, long ? -.4 : -.38, long ? -.65 : -.72),
      rotation: new THREE.Euler(0, presentation === 'legacy' ? id === 'rifle' ? .16 : id === 'launcher' ? .10 : id === 'shotgun' ? .08 : 0 : 0, 0, 'XYZ'),
      fov: 72,
    },
    ads: {
      position: new THREE.Vector3(-sightOffset.x, -sightOffset.y, adsDepth[id]),
      rotation: new THREE.Euler(0, 0, 0, 'XYZ'),
      fov: adsFov,
    },
    sprint: {
      position: new THREE.Vector3(heavy ? .4 : .37, heavy ? -.56 : -.51, -.61),
      rotation: new THREE.Euler(.14, 0, heavy ? -.2 : -.16, 'XYZ'),
      fov: 77,
    },
  };
}

/**
 * Creates all six procedural first-person weapon models and their shared resources.
 *
 * Returned models already use a 0.62 presentation scale and point down camera-local
 * -Z. Add exactly one selected model to a camera-attached view-model container; do
 * not apply the legacy `rotation.y = Math.PI` flip.
 */
export function createViewModelWeapons(options: ViewModelWeaponsOptions = {}): ViewModelWeaponCollection {
  const owned = resources(options);
  const builds = [
    buildPistol(owned),
    buildShotgun(owned),
    buildRifle(owned),
    buildLauncher(owned),
    buildRpg(owned),
    buildSniper(owned),
  ];
  const models = new Map<WeaponId, THREE.Group>();
  const metadata = new Map<WeaponId, ViewModelWeaponMetadata>();
  for (const build of builds) {
    build.model.visible = false;
    build.model.userData.presentation = owned.presentation;
    models.set(build.id, build.model);
    metadata.set(build.id, {
      id: build.id,
      model: build.model,
      anchors: build.anchors,
      parts: build.parts,
      poses: posesFor(build.id, build.model, build.anchors.sight, owned.presentation),
      forward: VIEW_MODEL_FORWARD.clone(),
    });
  }

  let disposed = false;
  return {
    models,
    metadata,
    forward: VIEW_MODEL_FORWARD.clone(),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const model of models.values()) model.removeFromParent();
      owned.rifleGeometry.dispose();
      for (const geometry of Object.values(owned.geometries)) geometry.dispose();
      owned.weaponMaterials.dispose();
      for (const material of owned.ownedMaterials) material.dispose();
      models.clear();
      metadata.clear();
    },
  };
}
