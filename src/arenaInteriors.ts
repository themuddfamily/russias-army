import * as THREE from 'three';
import { createStaticBoxBatches, type StaticBoxBatches, type StaticBoxInstance } from './staticBoxBatches';

export interface ArenaInteriorMaterials {
  floor: THREE.Material;
  ceiling: THREE.Material;
  wall: THREE.Material;
  darkMetal: THREE.Material;
  paintedMetal: THREE.Material;
  wood: THREE.Material;
  fabric: THREE.Material;
  medical: THREE.Material;
  pallet: THREE.Material;
  light: THREE.Material;
}

export interface ArenaInteriorsOptions {
  materials?: Partial<ArenaInteriorMaterials>;
  /** Adds a small number of non-shadow-casting practical lights. */
  lights?: boolean;
  /** Controls castShadow on the interior props, independently of arena shadows. */
  shadows?: boolean;
}

export interface ArenaInteriorsData {
  group: THREE.Group;
  lights: THREE.PointLight[];
  /** Only contains fallback materials created by this module, never injected ones. */
  ownedMaterials: THREE.Material[];
  staticBoxes: StaticBoxBatches;
}

export const ARENA_INTERIOR_FOOTPRINTS = Object.freeze({
  warehouse: Object.freeze({ center: Object.freeze([27, -24] as const), size: Object.freeze([15, 10, 4.1] as const) }),
  medpoint: Object.freeze({ center: Object.freeze([-26, 25] as const), size: Object.freeze([14, 10, 3.8] as const) }),
  barracks: Object.freeze({ center: Object.freeze([24, 19] as const), size: Object.freeze([19, 13, 4.8] as const) }),
});

type Point3 = readonly [number, number, number];

interface BoxInstance {
  position: Point3;
  rotationY?: number;
}

interface InteriorContext {
  group: THREE.Group;
  colliders: THREE.Box3[];
  materials: ArenaInteriorMaterials;
  lights: THREE.PointLight[];
  shadows: boolean;
  addLights: boolean;
  boxes: StaticBoxInstance[];
}

function standard(color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function resolveMaterials(
  supplied: Partial<ArenaInteriorMaterials>,
): { materials: ArenaInteriorMaterials; ownedMaterials: THREE.Material[] } {
  const ownedMaterials: THREE.Material[] = [];
  const fallback = <T extends THREE.Material>(material: T): T => {
    ownedMaterials.push(material);
    return material;
  };
  const materials: ArenaInteriorMaterials = {
    floor: supplied.floor ?? fallback(standard(0x484b47, .9, .03)),
    ceiling: supplied.ceiling ?? fallback(standard(0x8f938b, .93, .01)),
    wall: supplied.wall ?? fallback(standard(0x777b72, .9, .02)),
    darkMetal: supplied.darkMetal ?? fallback(standard(0x252b29, .55, .68)),
    paintedMetal: supplied.paintedMetal ?? fallback(standard(0x50615a, .65, .38)),
    wood: supplied.wood ?? fallback(standard(0x664a32, .84, .01)),
    fabric: supplied.fabric ?? fallback(standard(0x66725e, .98, 0)),
    medical: supplied.medical ?? fallback(standard(0xb9c3bc, .76, .04)),
    pallet: supplied.pallet ?? fallback(standard(0x8a6742, .92, .01)),
    light: supplied.light ?? fallback(new THREE.MeshStandardMaterial({
      color: 0xffe2ac,
      emissive: 0xffb55d,
      emissiveIntensity: 3.2,
      roughness: .42,
    })),
  };
  return { materials, ownedMaterials };
}

function addBox(
  context: InteriorContext,
  size: Point3,
  position: Point3,
  material: THREE.Material,
  castShadow = context.shadows,
): void {
  context.boxes.push({ size, position, material, castShadow, receiveShadow: true });
}

function addInstances(
  context: InteriorContext,
  size: Point3,
  material: THREE.Material,
  instances: readonly BoxInstance[],
  castShadow = context.shadows,
): void {
  for (const instance of instances) context.boxes.push({
    size,
    position: instance.position,
    rotation: instance.rotationY === undefined ? undefined : [0, instance.rotationY, 0],
    material,
    castShadow,
    receiveShadow: true,
  });
}

function addCollider(context: InteriorContext, center: Point3, size: Point3): void {
  const half = new THREE.Vector3(...size).multiplyScalar(.5);
  const middle = new THREE.Vector3(...center);
  context.colliders.push(new THREE.Box3(middle.clone().sub(half), middle.clone().add(half)));
}

function addShell(context: InteriorContext, x: number, z: number, w: number, d: number, h: number): void {
  // Kept just inside the existing shell so no trim appears to hover beyond the open east facade.
  addBox(context, [w - .72, .08, d - .72], [x + .04, .04, z], context.materials.floor, false);
  addBox(context, [w - .74, .055, d - .74], [x + .04, h - .09, z], context.materials.ceiling, false);
  addBox(context, [w - .8, .78, .045], [x + .04, .43, z - d / 2 + .31], context.materials.wall, false);
  addBox(context, [.045, .78, d - .8], [x - w / 2 + .31, .43, z], context.materials.wall, false);
}

function addCeilingFixtures(
  context: InteriorContext,
  positions: readonly Point3[],
  lightRange: number,
  lightIntensity: number,
): void {
  addInstances(context, [1.35, .065, .34], context.materials.darkMetal, positions.map((position) => ({ position })), false);
  const emitters = positions.map(([x, y, z]) => ({ position: [x, y - .045, z] as Point3 }));
  addInstances(context, [1.14, .035, .22], context.materials.light, emitters, false);
  if (!context.addLights) return;
  // One practical per room is enough to illuminate the open shells; the remaining strips are emissive only.
  const middle = positions[Math.floor(positions.length / 2)];
  const light = new THREE.PointLight(0xffc77c, lightIntensity, lightRange, 2);
  light.position.set(middle[0], middle[1] - .35, middle[2]);
  light.castShadow = false;
  context.group.add(light);
  context.lights.push(light);
}

function addWarehouse(context: InteriorContext): void {
  const { darkMetal, paintedMetal, wood, pallet } = context.materials;
  addShell(context, 27, -24, 15, 10, 4.1);
  addCeilingFixtures(context, [
    [23, 3.82, -24], [27, 3.82, -24], [31, 3.82, -24],
  ], 11, 7.5);

  // Two compact rack bays hug the west wall. The centre, south edge and open east side stay clear.
  const rackCenters = [[20.65, -21.4], [20.65, -24.45]] as const;
  const uprights: BoxInstance[] = [];
  const shelves: BoxInstance[] = [];
  for (const [x, z] of rackCenters) {
    for (const dx of [-.58, .58]) for (const dz of [-1.18, 1.18]) {
      uprights.push({ position: [x + dx, 1.28, z + dz] });
    }
    for (const y of [.18, 1.03, 1.89]) shelves.push({ position: [x, y, z] });
  }
  addInstances(context, [.09, 2.56, .09], paintedMetal, uprights);
  addInstances(context, [1.32, .10, 2.55], darkMetal, shelves);
  addInstances(context, [1.08, .56, .82], wood, [
    { position: [20.65, .51, -21.55] },
    { position: [20.65, 1.38, -24.75] },
  ]);
  addCollider(context, [20.65, 1.28, -22.95], [1.36, 2.56, 5.75]);

  // A waist-high pallet island gives intentional cover without pinching either wide aisle.
  addInstances(context, [2.15, .12, 1.08], pallet, [
    { position: [26.5, .10, -23.25] },
    { position: [26.5, .28, -23.25] },
    { position: [26.5, .46, -23.25] },
  ]);
  addInstances(context, [.74, .68, .74], wood, [
    { position: [26.08, .86, -23.25] },
    { position: [26.91, .86, -23.25] },
  ]);
  addInstances(context, [.69, .045, .69], darkMetal, [
    { position: [26.08, 1.225, -23.25] },
    { position: [26.91, 1.225, -23.25] },
  ], false);
  addCollider(context, [26.5, .62, -23.25], [2.18, 1.24, 1.12]);
}

function addBunkBeds(context: InteriorContext, centers: readonly Point3[]): void {
  const { darkMetal, fabric } = context.materials;
  const legs: BoxInstance[] = [];
  const rails: BoxInstance[] = [];
  const mattresses: BoxInstance[] = [];
  for (const [x, , z] of centers) {
    for (const dx of [-.45, .45]) for (const dz of [-.96, .96]) {
      legs.push({ position: [x + dx, 1.02, z + dz] });
    }
    for (const y of [.43, 1.42]) {
      rails.push({ position: [x - .48, y, z] }, { position: [x + .48, y, z] });
      mattresses.push({ position: [x, y + .10, z] });
    }
  }
  addInstances(context, [.065, 2.05, .065], darkMetal, legs);
  addInstances(context, [.065, .10, 2.02], darkMetal, rails);
  addInstances(context, [.88, .15, 1.86], fabric, mattresses);
}

function addBarracks(context: InteriorContext): void {
  const { darkMetal, paintedMetal, wood } = context.materials;
  addShell(context, 24, 19, 19, 13, 4.8);
  addCeilingFixtures(context, [
    [18, 4.5, 19], [24, 4.5, 19], [30, 4.5, 19],
  ], 13, 8);

  // Sleeping furniture is confined to the west half; the east and south circulation lanes remain broad.
  const bunks = [
    [16.25, 0, 18.1], [18.0, 0, 18.1],
    [16.25, 0, 21.45], [18.0, 0, 21.45],
  ] as const;
  addBunkBeds(context, bunks);
  for (const [x, , z] of bunks) addCollider(context, [x, 1.02, z], [1.0, 2.05, 2.08]);

  // Lockers read as a single wall bank and use one collider rather than many tiny volumes.
  const lockerPositions: BoxInstance[] = [];
  for (let index = 0; index < 5; index++) lockerPositions.push({ position: [20.15 + index * .72, .94, 24.65] });
  addInstances(context, [.64, 1.82, .52], paintedMetal, lockerPositions);
  addInstances(context, [.025, .035, .075], darkMetal, lockerPositions.map(({ position: [x, , z] }) => ({
    position: [x + .20, .94, z - .275],
  })), false);
  addCollider(context, [21.59, .94, 24.65], [3.54, 1.82, .56]);

  // A small mess table occupies the northwest pocket but leaves the central line from the door open.
  addBox(context, [2.55, .13, 1.08], [27.4, .83, 23.0], wood);
  addInstances(context, [.10, .78, .10], darkMetal, [
    { position: [26.35, .39, 22.62] }, { position: [28.45, .39, 22.62] },
    { position: [26.35, .39, 23.38] }, { position: [28.45, .39, 23.38] },
  ]);
  addCollider(context, [27.4, .44, 23.0], [2.62, .88, 1.14]);
}

function addGurneys(context: InteriorContext, centers: readonly Point3[]): void {
  const { darkMetal, medical, fabric } = context.materials;
  const frames: BoxInstance[] = [];
  const mattresses: BoxInstance[] = [];
  const legs: BoxInstance[] = [];
  for (const [x, , z] of centers) {
    frames.push({ position: [x, .68, z] });
    mattresses.push({ position: [x, .82, z] });
    for (const dx of [-.38, .38]) for (const dz of [-.82, .82]) {
      legs.push({ position: [x + dx, .34, z + dz] });
    }
  }
  addInstances(context, [.92, .10, 1.86], medical, frames);
  addInstances(context, [.84, .16, 1.72], fabric, mattresses);
  addInstances(context, [.055, .64, .055], darkMetal, legs);
}

function addMedpoint(context: InteriorContext): void {
  const { darkMetal, medical, paintedMetal, wood } = context.materials;
  addShell(context, -26, 25, 14, 10, 3.8);
  addCeilingFixtures(context, [
    [-30, 3.51, 25], [-26, 3.51, 25], [-22, 3.51, 25],
  ], 10, 8.5);

  const gurneys = [
    [-31.0, 0, 24.2], [-28.85, 0, 27.15],
  ] as const;
  addGurneys(context, gurneys);
  for (const [x, , z] of gurneys) addCollider(context, [x, .46, z], [1.0, .92, 1.94]);

  // Reception anchors the north-west corner. The open east side and southern ingress stay unobstructed.
  addBox(context, [3.05, .14, .82], [-25.45, 1.02, 28.55], medical);
  addBox(context, [3.05, .92, .16], [-25.45, .52, 28.86], paintedMetal);
  addInstances(context, [.16, .94, .16], darkMetal, [
    { position: [-26.75, .49, 28.55] }, { position: [-24.15, .49, 28.55] },
  ]);
  addCollider(context, [-25.45, .56, 28.63], [3.12, 1.12, .72]);

  // Wall-mounted treatment storage is visual detail only, preventing snagging near the doorway.
  addInstances(context, [1.05, .86, .30], medical, [
    { position: [-31.9, 1.6, 27.75] }, { position: [-31.9, 1.6, 26.55] },
  ]);
  addInstances(context, [.025, .035, .07], darkMetal, [
    { position: [-31.35, 1.6, 27.75] }, { position: [-31.35, 1.6, 26.55] },
  ], false);
  addBox(context, [.62, .035, .42], [-25.85, 1.115, 28.52], wood, false);
}

/**
 * Adds deterministic, low-draw-count set dressing to Barrack 01's three open buildings.
 * Existing shell colliders should already be present; this function only contributes sparse
 * prop cover. All positions are world-space so the group must remain at the scene origin.
 */
export function addArenaInteriors(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  options: ArenaInteriorsOptions = {},
): ArenaInteriorsData {
  const { materials, ownedMaterials } = resolveMaterials(options.materials ?? {});
  const group = new THREE.Group();
  group.name = 'arena-interiors';
  const context: InteriorContext = {
    group,
    colliders,
    materials,
    lights: [],
    shadows: options.shadows ?? true,
    addLights: options.lights ?? true,
    boxes: [],
  };
  addWarehouse(context);
  addBarracks(context);
  addMedpoint(context);
  const staticBoxes = createStaticBoxBatches(group, context.boxes, 'ArenaInteriorBoxes');
  scene.add(group);
  return { group, lights: context.lights, ownedMaterials, staticBoxes };
}
