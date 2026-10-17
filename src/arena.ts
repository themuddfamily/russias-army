import * as THREE from 'three';
import { addArenaInteriors, type ArenaInteriorsData } from './arenaInteriors';
import {
  createBuildingFacadeBlueprint,
  type BuildingFacadeMaterialSlot,
} from './buildingFacadeBlueprint';
import {
  createBuildingFacadePresentation,
  type BuildingFacadePresentation,
  type BuildingFacadePresentationMaterials,
} from './buildingFacadePresentation';
import { createInstancedFoliage, type InstancedFoliage, type WinterPinePlacement } from './instancedFoliage';
import {
  createProceduralMaterialLibrary,
  type ArenaSurface,
  type ProceduralMaterialLibrary,
  type ProceduralMaterialLibraryOptions,
  type ProceduralMaterialOptions,
} from './materials';
import { createSnowGroundDressing, type SnowGroundDressing, type SnowRoadEdge } from './snowGroundDressing';
import { createStaticBoxBatches, type StaticBoxBatches, type StaticBoxInstance } from './staticBoxBatches';
import {
  createPerimeterWallBlueprint,
  type PerimeterWallBlueprint,
  type PerimeterWallMaterialSlot,
} from './perimeterWallBlueprint';
import {
  createPerimeterWallPresentation,
  type PerimeterWallPresentation,
} from './perimeterWallPresentation';
import {
  createBlastBarrierBlueprint,
  type BlastBarrierMaterialSlot,
} from './blastBarrierBlueprint';
import {
  createSecurityInfrastructureBlueprint,
  SECURITY_LAMP_LOCATIONS,
  type SecurityMaterialSlot,
} from './securityInfrastructureBlueprint';
import {
  createChainLinkFencePresentation,
  type ChainLinkFencePresentation,
} from './chainLinkFence';
import {
  createSecurityWireBlueprint,
  type SecurityWireMaterialSlot,
} from './securityWireBlueprint';
import {
  createWatchtowerBlueprint,
  type WatchtowerMaterialSlot,
} from './watchtowerBlueprint';
import {
  createWarehouseDetailBlueprint,
  type WarehouseDetailMaterialSlot,
} from './warehouseDetailBlueprint';
import {
  createYardCrateBlueprint,
  type YardCrateMaterialSlot,
} from './yardCrateBlueprint';
import {
  createMilitaryTransportPresentation,
  type MilitaryTransportPresentation,
} from './militaryTransport';
import {
  createSandbagBarrierPresentation,
  type SandbagBarrierPresentation,
} from './sandbagBarrier';
import {
  createRoadSurfacePresentation,
  type RoadSurfacePresentation,
} from './roadSurfacePresentation';
import { createWinterBackdrop, type WinterBackdrop } from './winterBackdrop';
import {
  createSnowFieldPresentation,
  type SnowFieldMaskRect,
  type SnowFieldPresentation,
} from './snowFieldPresentation';
import {
  createWinterGroundRelief,
  type WinterGroundRelief,
  type WinterGroundReliefExclusionRect,
} from './winterGroundRelief';
import { ARENA_COLLIDERS } from '../shared/arenaCollision';

export interface ArenaData {
  colliders: THREE.Box3[];
  spawnPoints: THREE.Vector3[];
  pickups: Pickup[];
  /** Owns the arena's shared procedural PBR textures for the scene lifetime. */
  materials: ProceduralMaterialLibrary;
  interiors: ArenaInteriorsData;
  foliage: InstancedFoliage;
  groundDressing: SnowGroundDressing;
  /** Flat gameplay-safe snow surface with presentation-only macro shading. */
  snowField: SnowFieldPresentation;
  /** High-tier physical snow crusts; visual height never enters collision. */
  winterGroundRelief: WinterGroundRelief | null;
  roadSurface: RoadSurfacePresentation;
  staticBoxes: StaticBoxBatches;
  buildingFacade: {
    quality: 'low' | 'high';
    blueprint: ReturnType<typeof createBuildingFacadeBlueprint>;
    authoritativeColliders: number;
    presentation: BuildingFacadePresentation | null;
  };
  perimeterWall: {
    quality: 'low' | 'high';
    blueprint: PerimeterWallBlueprint;
    presentation: PerimeterWallPresentation | null;
  };
  chainLinkFence: ChainLinkFencePresentation;
  militaryTransport: MilitaryTransportPresentation;
  sandbagBarrier: SandbagBarrierPresentation;
  /** Collision-free rolling terrain and forest beyond the playable perimeter. */
  exteriorBackdrop: WinterBackdrop;
}

export interface BuildArenaOptions extends ProceduralMaterialLibraryOptions {
  enhancedRendering?: boolean;
  decals?: ArenaGeneratedDecals;
}

export interface ArenaGeneratedDecals {
  pickupIcons?: Partial<Record<Pickup['type'], THREE.Texture>>;
  signPlate?: THREE.Texture;
  crateStamp?: THREE.Texture;
}

export interface Pickup {
  mesh: THREE.Group;
  type: 'health' | 'ammo' | 'armor';
  active: boolean;
  respawnAt: number;
}

function material(color: number, roughness = 0.82, metalness = 0.04, map?: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...(map ? { map } : {}),
  });
}

interface ArenaMaterialSet {
  concrete: THREE.Material;
  redSteel: THREE.Material;
  corrugatedSteel: THREE.Material;
  snow: THREE.Material;
  darkMetal: THREE.Material;
  wood: THREE.Material;
  facadeFrame: THREE.Material;
  facadeWindow: THREE.Material;
}

const ARENA_SNOW_ROAD_EDGES: readonly SnowRoadEdge[] = [
  // Continuous wheel history through the junction, without generating banks there.
  { start: [-56, -6.5], end: [56, -6.5], inside: 1, drifts: false },
  { start: [56, 6.5], end: [-56, 6.5], inside: 1, drifts: false },
  { start: [6.5, -56], end: [6.5, 56], inside: 1, drifts: false },
  { start: [-6.5, 56], end: [-6.5, -56], inside: 1, drifts: false },
  // Snow banks stop short of the crossing so combat lanes remain visually clear.
  { start: [-56, -6.5], end: [-7.5, -6.5], inside: 1, tracks: false },
  { start: [7.5, -6.5], end: [56, -6.5], inside: 1, tracks: false },
  { start: [56, 6.5], end: [7.5, 6.5], inside: 1, tracks: false },
  { start: [-7.5, 6.5], end: [-56, 6.5], inside: 1, tracks: false },
  { start: [6.5, -56], end: [6.5, -7.5], inside: 1, tracks: false },
  { start: [6.5, 7.5], end: [6.5, 56], inside: 1, tracks: false },
  { start: [-6.5, 56], end: [-6.5, 7.5], inside: 1, tracks: false },
  { start: [-6.5, -7.5], end: [-6.5, -56], inside: 1, tracks: false },
];

const ARENA_SNOW_FIELD_MASKS = Object.freeze<readonly SnowFieldMaskRect[]>([
  // Keep the entire nominal crossroad neutral, then feather the visual-only
  // wind shaping over four metres beyond its shoulders.
  { minX: -72.5, maxX: 72.5, minZ: -6.5, maxZ: 6.5, feather: 4 },
  { minX: -6.5, maxX: 6.5, minZ: -72.5, maxZ: 72.5, feather: 4 },
  // The four authoritative building footprints stay neutral beneath their
  // foundations and blend smoothly into the surrounding packed snow.
  { minX: -33, maxX: -9, minZ: -25, maxZ: -11, feather: 4 },
  { minX: 14.5, maxX: 33.5, minZ: 12.5, maxZ: 25.5, feather: 4 },
  { minX: 19.5, maxX: 34.5, minZ: -29, maxZ: -19, feather: 4 },
  { minX: -33, maxX: -19, minZ: 20, maxZ: 30, feather: 4 },
]);

const ARENA_GROUND_STENCIL_EXCLUSIONS = Object.freeze<readonly WinterGroundReliefExclusionRect[]>([
  // The painted sector identifiers are 4.8 m squares rotated slightly on the
  // snow. Conservative square projections keep relief from breaking the ink.
  { minX: -16.8, maxX: -9.2, minZ: -10.8, maxZ: -3.2 },
  { minX: 11.2, maxX: 18.8, minZ: 5.2, maxZ: 12.8 },
  { minX: 9.2, maxX: 16.8, minZ: -33.8, maxZ: -26.2 },
  { minX: -31.8, maxX: -24.2, minZ: 27.2, maxZ: 34.8 },
]);

function winterReliefExclusions(colliders: readonly THREE.Box3[]): WinterGroundReliefExclusionRect[] {
  const exclusions: WinterGroundReliefExclusionRect[] = ARENA_SNOW_FIELD_MASKS.map((mask, index) => ({
    minX: mask.minX,
    maxX: mask.maxX,
    minZ: mask.minZ,
    maxZ: mask.maxZ,
    // Road dressing occupies the first metre beyond each shoulder. Building
    // clearances also retain the short static boot trails at every entrance.
    padding: index < 2 ? 1.25 : 3,
  }));
  for (const collider of colliders) exclusions.push({
    minX: collider.min.x,
    maxX: collider.max.x,
    minZ: collider.min.z,
    maxZ: collider.max.z,
    padding: .35,
  });
  exclusions.push(...ARENA_GROUND_STENCIL_EXCLUSIONS);
  return exclusions;
}

const COLLIDER_PARITY_EPSILON = 1e-9;

function replaceWithSharedArenaColliders(colliders: THREE.Box3[]): void {
  if (colliders.length !== ARENA_COLLIDERS.length) {
    throw new Error(`arena collider contract drifted: expected ${ARENA_COLLIDERS.length}, received ${colliders.length}`);
  }
  const axes = ['x', 'y', 'z'] as const;
  for (let index = 0; index < ARENA_COLLIDERS.length; index++) {
    const authored = colliders[index];
    const shared = ARENA_COLLIDERS[index];
    for (let axis = 0; axis < axes.length; axis++) {
      const key = axes[axis];
      const authoredMin = authored.min[key];
      const authoredMax = authored.max[key];
      if (Math.abs(authoredMin - shared.min[axis]) > COLLIDER_PARITY_EPSILON
        || Math.abs(authoredMax - shared.max[axis]) > COLLIDER_PARITY_EPSILON) {
        throw new Error(
          `arena collider ${index} (${shared.id}) drifted on ${key}: `
          + `authored [${authoredMin}, ${authoredMax}], shared [${shared.min[axis]}, ${shared.max[axis]}]`,
        );
      }
    }
  }
  const sharedBoxes = ARENA_COLLIDERS.map((collider) => new THREE.Box3(
    new THREE.Vector3(...collider.min),
    new THREE.Vector3(...collider.max),
  ));
  colliders.splice(0, colliders.length, ...sharedBoxes);
}

function queueStaticBox(
  instances: StaticBoxInstance[],
  colliders: THREE.Box3[],
  size: [number, number, number],
  position: [number, number, number],
  mat: THREE.Material,
  options: { rotation?: [number, number, number]; castShadow?: boolean; receiveShadow?: boolean; collide?: boolean } = {},
): void {
  instances.push({
    size,
    position,
    material: mat,
    rotation: options.rotation,
    castShadow: options.castShadow,
    receiveShadow: options.receiveShadow,
  });
  if (!options.collide) return;
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(options.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(...size),
  );
  colliders.push(new THREE.Box3(
    new THREE.Vector3(-.5, -.5, -.5),
    new THREE.Vector3(.5, .5, .5),
  ).applyMatrix4(matrix));
}

/** Classic five-pointed army star, the signature insignia of the original game's compound. */
function paintRedStar(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  const inner = radius * .42;
  context.save();
  context.beginPath();
  for (let point = 0; point < 5; point++) {
    const outerAngle = -Math.PI / 2 + point * (Math.PI * 2 / 5);
    const innerAngle = outerAngle + Math.PI / 5;
    const ox = cx + Math.cos(outerAngle) * radius; const oy = cy + Math.sin(outerAngle) * radius;
    if (point === 0) context.moveTo(ox, oy); else context.lineTo(ox, oy);
    context.lineTo(cx + Math.cos(innerAngle) * inner, cy + Math.sin(innerAngle) * inner);
  }
  context.closePath();
  context.fillStyle = '#b8332e';
  context.fill();
  context.strokeStyle = '#e7dfca';
  context.lineWidth = Math.max(2, radius * .09);
  context.stroke();
  context.restore();
}

function addFacadeLabels(
  scene: THREE.Scene,
  text: string,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  accent: string,
  frontOffsetX = 0,
  outset = .326,
  signPlate?: THREE.Texture,
): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const plateImage = signPlate?.image as CanvasImageSource | undefined;
  if (plateImage) context.drawImage(plateImage, 0, 0, 512, 128);
  else { context.fillStyle = '#171b1a'; context.fillRect(0, 0, 512, 128); }
  context.fillStyle = 'rgba(5, 8, 8, .38)'; context.fillRect(0, 0, 512, 128);
  context.fillStyle = accent; context.fillRect(0, 0, 14, 128);
  paintRedStar(context, 58, 64, 34);
  context.fillStyle = '#e7e7de'; context.font = '700 54px sans-serif';
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 288, 67);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const labels = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(3.7, .92),
    new THREE.MeshStandardMaterial({ map, roughness: .68, metalness: .15 }),
    2,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  position.set(x + w * .24 + frontOffsetX, h - 1.25, z + d / 2 + outset);
  matrix.compose(position, quaternion, scale); labels.setMatrixAt(0, matrix);
  position.set(x - w / 2 - outset, h - 1.18, z + d * .18);
  quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  matrix.compose(position, quaternion, scale); labels.setMatrixAt(1, matrix);
  labels.instanceMatrix.needsUpdate = true;
  labels.computeBoundingBox(); labels.computeBoundingSphere(); scene.add(labels);
}

function addCorrugation(scene: THREE.Scene, x: number, z: number, w: number, d: number, h: number, eastGap = 0, frontGap = 2.2): void {
  // The procedural steel normal map supplies the fine corrugation. These
  // sparse darker ribs represent actual structural seams instead of a bright
  // picket fence of redundant geometry.
  const spacing = 2.4;
  const countX = Math.floor((w - 1) / spacing) + 1;
  const countZ = Math.floor((d - 1) / spacing) + 1;
  const count = countX * 2 + countZ * 2;
  const ribs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(.045, h - .35, .07),
    material(0x505b58, .66, .48),
    count,
  );
  ribs.name = 'WarehouseStructuralSeams';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  let index = 0;
  for (let i = 0; i < countX; i++) {
    const offset = -w / 2 + .5 + i * spacing;
    for (const side of [-1, 1]) {
      if (side === 1 && Math.abs(offset) < frontGap / 2 + .12) continue;
      position.set(x + offset, h / 2, z + side * (d / 2 + .325));
      matrix.compose(position, quaternion, scale); ribs.setMatrixAt(index++, matrix);
    }
  }
  quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  for (let i = 0; i < countZ; i++) {
    const offset = -d / 2 + .5 + i * spacing;
    for (const side of [-1, 1]) {
      if (side === 1 && eastGap > 0 && Math.abs(offset) < eastGap / 2 + .12) continue;
      position.set(x + side * (w / 2 + .325), h / 2, z + offset);
      matrix.compose(position, quaternion, scale); ribs.setMatrixAt(index++, matrix);
    }
  }
  ribs.count = index; ribs.instanceMatrix.needsUpdate = true;
  ribs.castShadow = true; ribs.receiveShadow = true; scene.add(ribs);
}

function addBuilding(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  staticBoxes: StaticBoxInstance[],
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  mat: THREE.Material,
  roofAccess = false,
  accent = 0x9b3431,
  label = 'БЛОК 01',
  corrugated = false,
  surfaces?: ArenaMaterialSet,
  eastGap = 0,
  frontGap = 2.2,
  modernFacade = false,
  signPlate?: THREE.Texture,
): void {
  const wall = 0.55;
  queueStaticBox(staticBoxes, colliders, [w, h, wall], [x, h / 2, z - d / 2], mat, { collide: true });
  queueStaticBox(staticBoxes, colliders, [wall, h, d], [x - w / 2, h / 2, z], mat, { collide: true });
  const doorGap = frontGap;
  const openingHeight = Math.min(2.7, h - .65);
  queueStaticBox(staticBoxes, colliders, [(w - doorGap) / 2, h, wall], [x + (w + doorGap) / 4, h / 2, z + d / 2], mat, { collide: true });
  queueStaticBox(staticBoxes, colliders, [(w - doorGap) / 2, h, wall], [x - (w + doorGap) / 4, h / 2, z + d / 2], mat, { collide: true });
  queueStaticBox(staticBoxes, colliders, [doorGap, h - openingHeight, wall], [x, openingHeight + (h - openingHeight) / 2, z + d / 2], mat, { collide: true });
  if (eastGap > 0) {
    queueStaticBox(staticBoxes, colliders, [wall, h, (d - eastGap) / 2], [x + w / 2, h / 2, z + (d + eastGap) / 4], mat, { collide: true });
    queueStaticBox(staticBoxes, colliders, [wall, h, (d - eastGap) / 2], [x + w / 2, h / 2, z - (d + eastGap) / 4], mat, { collide: true });
    queueStaticBox(staticBoxes, colliders, [wall, h - openingHeight, eastGap], [x + w / 2, openingHeight + (h - openingHeight) / 2, z], mat, { collide: true });
  }
  queueStaticBox(staticBoxes, colliders, [w + .25, .35, d + .25], [x, h + .15, z], surfaces?.darkMetal ?? material(0x373b38, .95), { collide: true });

  // Thin, non-colliding caps and trim break up the simple silhouettes while preserving gameplay geometry.
  const snowCap = surfaces?.snow ?? material(0xd9dfd9, .98, 0);
  queueStaticBox(staticBoxes, colliders, [w + .48, .11, d + .48], [x, h + .38, z], snowCap);
  const trim = surfaces?.darkMetal ?? material(0x252b29, .72, .34);
  const accentMat = material(accent, .64, .28);
  queueStaticBox(staticBoxes, colliders, [w + .12, .16, .12], [x, h - .28, z - d / 2 - .34], accentMat);
  queueStaticBox(staticBoxes, colliders, [d + .12, .16, .12], [x - w / 2 - .34, h - .28, z], accentMat, { rotation: [0, Math.PI / 2, 0] });
  queueStaticBox(staticBoxes, colliders, [d + .12, .16, .12], [x + w / 2 + .34, h - .28, z], accentMat, { rotation: [0, Math.PI / 2, 0] });
  for (const side of [-1, 1]) {
    queueStaticBox(staticBoxes, colliders, [.14, h - .4, .14], [x + side * (w / 2 + .31), h / 2, z - d / 2 - .34], trim);
  }

  // A continuous foundation plinth visually seats each shell in the snow. Door
  // openings and thresholds remain clear, and none of this decorative trim
  // changes the building collision envelope.
  const frontPlinthLength = (w - doorGap) / 2;
  queueStaticBox(staticBoxes, colliders, [w + .12, .32, .14], [x, .16, z - d / 2 - .34], trim);
  for (const side of [-1, 1]) {
    queueStaticBox(
      staticBoxes, colliders, [frontPlinthLength, .32, .14],
      [x + side * (w + doorGap) / 4, .16, z + d / 2 + .34], trim,
    );
  }
  queueStaticBox(staticBoxes, colliders, [.14, .32, d + .12], [x - w / 2 - .34, .16, z], trim);
  if (eastGap > 0) {
    const eastPlinthLength = (d - eastGap) / 2;
    for (const side of [-1, 1]) {
      queueStaticBox(
        staticBoxes, colliders, [.14, .32, eastPlinthLength],
        [x + w / 2 + .34, .16, z + side * (d + eastGap) / 4], trim,
      );
    }
  } else {
    queueStaticBox(staticBoxes, colliders, [.14, .32, d + .12], [x + w / 2 + .34, .16, z], trim);
  }
  const windowFrame = surfaces?.facadeFrame ?? material(0x222826, .56, .48);
  const windowMat = surfaces?.facadeWindow ?? material(0x4d5044, .24, .12);
  if (!modernFacade) {
    for (let wx = -w / 2 + 2.5; wx < w / 2 - 1; wx += 4) {
      queueStaticBox(staticBoxes, colliders, [1.58, 1.32, .06], [x + wx, h * .58, z - d / 2 - .345], windowFrame);
      queueStaticBox(staticBoxes, colliders, [1.35, 1.1, .055], [x + wx, h * .58, z - d / 2 - .385], windowMat, { castShadow: false });
      queueStaticBox(staticBoxes, colliders, [.055, 1.1, .025], [x + wx, h * .58, z - d / 2 - .425], windowFrame, { castShadow: false });
      queueStaticBox(staticBoxes, colliders, [1.35, .055, .025], [x + wx, h * .58, z - d / 2 - .425], windowFrame, { castShadow: false });
    }
    for (let wz = -d / 2 + 2; wz < d / 2 - 1.5; wz += 3.8) {
      for (const side of [-1, 1]) {
        if (side === 1 && eastGap > 0 && Math.abs(wz) < eastGap / 2 + .7) continue;
        queueStaticBox(staticBoxes, colliders, [1.26, .96, .06], [x + side * (w / 2 + .345), h * .58, z + wz], windowFrame, { rotation: [0, Math.PI / 2, 0] });
        queueStaticBox(staticBoxes, colliders, [1.08, .78, .055], [x + side * (w / 2 + .385), h * .58, z + wz], windowMat, { rotation: [0, Math.PI / 2, 0], castShadow: false });
      }
    }
  }

  // Door surrounds remain open and non-colliding. Canopies sit directly over
  // the lintels (rather than floating at the roofline), so entrances read at
  // combat speed and correspond to the actual openings.
  const canopyY = openingHeight + .18;
  if (!corrugated) {
    queueStaticBox(staticBoxes, colliders, [doorGap + .5, .24, .92], [x, canopyY, z + d / 2 + .36], accentMat);
    for (const side of [-1, 1]) {
      queueStaticBox(staticBoxes, colliders, [.16, openingHeight + .12, .18], [x + side * (doorGap / 2 + .08), (openingHeight + .12) / 2, z + d / 2 + .34], accentMat);
    }
    if (eastGap > 0) {
      queueStaticBox(staticBoxes, colliders, [.92, .24, eastGap + .5], [x + w / 2 + .36, canopyY, z], accentMat);
      for (const side of [-1, 1]) {
        queueStaticBox(staticBoxes, colliders, [.18, openingHeight + .12, .16], [x + w / 2 + .34, (openingHeight + .12) / 2, z + side * (eastGap / 2 + .08)], accentMat);
      }
    }
  }
  const canopyLight = new THREE.PointLight(0xffbd72, 5.5, 6.5, 2);
  canopyLight.position.set(x, openingHeight - .18, z + d / 2 + .58); scene.add(canopyLight);
  addFacadeLabels(
    scene,
    label,
    x,
    z,
    w,
    d,
    h,
    `#${accent.toString(16).padStart(6, '0')}`,
    corrugated ? 1 : 0,
    corrugated ? .38 : .326,
    signPlate,
  );

  if (corrugated && !modernFacade) addCorrugation(scene, x, z, w, d, h, eastGap, doorGap);
  if (roofAccess) {
    const stairMaterial = material(0x4d514e);
    for (let i = 0; i < 13; i++) {
      const stepW = 3.1;
      queueStaticBox(staticBoxes, colliders, [stepW, .35, .85], [x + w / 2 + 1.5, .18 + i * .45, z - d / 2 + 1 + i * .7], stairMaterial, { collide: true });
    }

    // Low roof curbs preserve the traversable roof's silhouette without
    // pretending there is a tall gameplay obstacle. Handrails follow the
    // existing stair slope and remain cosmetic, matching the original steps.
    const curbY = h + .49;
    queueStaticBox(staticBoxes, colliders, [w + .5, .18, .14], [x, curbY, z - d / 2 - .18], trim);
    queueStaticBox(staticBoxes, colliders, [w + .5, .18, .14], [x, curbY, z + d / 2 + .18], trim);
    queueStaticBox(staticBoxes, colliders, [.14, .18, d + .22], [x - w / 2 - .18, curbY, z], trim);

    const stairRise = 12 * .45;
    const stairRun = 12 * .7;
    const railLength = Math.hypot(stairRun, stairRise);
    const railRotationX = -Math.atan2(stairRise, stairRun);
    const railY = .18 + stairRise / 2 + .94;
    const railZ = z - d / 2 + 1 + stairRun / 2;
    for (const side of [-1, 1]) {
      const railX = x + w / 2 + 1.5 + side * 1.47;
      queueStaticBox(staticBoxes, colliders, [.08, .08, railLength], [railX, railY, railZ], stairMaterial, { rotation: [railRotationX, 0, 0] });
      for (const step of [0, 6, 12]) {
        queueStaticBox(
          staticBoxes, colliders, [.075, .96, .075],
          [railX, .66 + step * .45, z - d / 2 + 1 + step * .7], stairMaterial,
        );
      }
    }
  } else if (corrugated) {
    // The warehouse gets a compact raised monitor, reinforcing its industrial
    // profile without adding a standalone mesh or a new material batch.
    const monitorW = Math.min(8.2, w * .56);
    const monitorD = Math.min(3.4, d * .36);
    queueStaticBox(staticBoxes, colliders, [monitorW, .62, monitorD], [x, h + .72, z], trim);
    for (const side of [-1, 1]) {
      queueStaticBox(staticBoxes, colliders, [monitorW - .5, .28, .055], [x, h + .75, z + side * (monitorD / 2 + .035)], windowMat, { castShadow: false });
    }
    queueStaticBox(staticBoxes, colliders, [monitorW + .34, .11, monitorD + .34], [x, h + 1.09, z], snowCap);
    for (const offset of [-1, 1]) {
      queueStaticBox(staticBoxes, colliders, [.44, .7, .44], [x + offset * monitorW * .34, h + 1.42, z], trim);
      queueStaticBox(staticBoxes, colliders, [.58, .09, .58], [x + offset * monitorW * .34, h + 1.81, z], snowCap);
    }
  } else if (eastGap > 0 && eastGap < 3) {
    // The long barracks receives a shallow snow-clad gable. Two sloped boxes
    // provide the silhouette at only 24 triangles and use the shared snow batch.
    const rise = 1.05;
    const run = d / 2;
    const slopeLength = Math.hypot(run, rise);
    const slope = Math.atan2(rise, run);
    for (const side of [-1, 1]) {
      queueStaticBox(
        staticBoxes, colliders, [w + .5, .13, slopeLength + .16],
        [x, h + .43 + rise / 2, z + side * run / 2], snowCap,
        { rotation: [side * slope, 0, 0] },
      );
    }
    queueStaticBox(staticBoxes, colliders, [w + .65, .2, .2], [x, h + .43 + rise, z], accentMat);
  } else {
    // The medical block keeps a low institutional parapet with compact rooftop
    // vents, a deliberately calmer outline than the barracks and warehouse.
    const parapetY = h + .58;
    queueStaticBox(staticBoxes, colliders, [w + .5, .38, .16], [x, parapetY, z - d / 2 - .18], trim);
    queueStaticBox(staticBoxes, colliders, [w + .5, .38, .16], [x, parapetY, z + d / 2 + .18], trim);
    queueStaticBox(staticBoxes, colliders, [.16, .38, d + .22], [x - w / 2 - .18, parapetY, z], trim);
    queueStaticBox(staticBoxes, colliders, [.16, .38, d + .22], [x + w / 2 + .18, parapetY, z], trim);
    for (const offset of [-2.2, 0, 2.2]) {
      queueStaticBox(staticBoxes, colliders, [.5, .62, .5], [x + offset, h + .85, z], trim);
      queueStaticBox(staticBoxes, colliders, [.64, .09, .64], [x + offset, h + 1.2, z], snowCap);
    }
  }
}

function queueWatchtower(
  scene: THREE.Scene,
  colliders: THREE.Box3[],
  instances: StaticBoxInstance[],
  materials: Readonly<Record<WatchtowerMaterialSlot, THREE.Material>>,
  x: number,
  z: number,
): void {
  for (const part of createWatchtowerBlueprint(x, z)) {
    instances.push({
      size: part.size,
      position: part.position,
      rotation: part.rotation,
      material: materials[part.materialSlot],
      castShadow: part.castShadow,
      receiveShadow: true,
    });
  }

  // Preserve the five collision volumes from the original tower exactly.
  const colliderVolumes: ReadonlyArray<readonly [readonly [number, number, number], readonly [number, number, number]]> = [
    [[3.5, .3, 3.5], [x, 5.2, z]],
    [[3.3, 1.8, .18], [x, 6.05, z - 1.55]],
    [[.18, 1.8, 3.1], [x - 1.55, 6.05, z]],
    [[.18, 1.8, 3.1], [x + 1.55, 6.05, z]],
    [[3.5, .2, 3.5], [x, 7.05, z]],
  ];
  for (const [size, position] of colliderVolumes) {
    colliders.push(new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(...position),
      new THREE.Vector3(...size),
    ));
  }

  const cabinLight = new THREE.PointLight(0xffbd72, 7, 8, 2);
  cabinLight.position.set(x, 5.9, z); scene.add(cabinLight);
}

function addSecurityLighting(scene: THREE.Scene, enhancedRendering: boolean): void {
  const poolGeometry = new THREE.CircleGeometry(3.9, 32);
  const poolMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc478,
    transparent: true,
    opacity: enhancedRendering ? .075 : .13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pools = new THREE.InstancedMesh(poolGeometry, poolMaterial, SECURITY_LAMP_LOCATIONS.length);
  pools.name = 'InstancedSecurityLightPools';
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const scale = new THREE.Vector3(1, 1, 1);
  for (let index = 0; index < SECURITY_LAMP_LOCATIONS.length; index++) {
    const { x, z } = SECURITY_LAMP_LOCATIONS[index];
    matrix.compose(new THREE.Vector3(x + .96, .035, z), rotation, scale);
    pools.setMatrixAt(index, matrix);
    if (!enhancedRendering) continue;
    const light = new THREE.SpotLight(0xffbd72, 34, 16, Math.PI * .29, .7, 2);
    light.position.set(x + .96, 4.66, z);
    light.target.position.set(x + .96, 0, z);
    scene.add(light.target, light);
  }
  pools.instanceMatrix.needsUpdate = true;
  pools.computeBoundingBox();
  pools.computeBoundingSphere();
  scene.add(pools);
}

function addIndustrialClutter(scene: THREE.Scene, colliders: THREE.Box3[]): void {
  const barrelClusters = [
    [[19,-17,0],[21,-17,.2],[34,-17,.1]],
    [[-18,15,-.1],[-33,29,0]],
  ] as const;
  const barrelGeometry=new THREE.CylinderGeometry(.36,.36,.95,8);
  barrelGeometry.computeBoundingBox();
  const barrelMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.62,metalness:.48,vertexColors:true});
  // Thin open collars keep the barrel silhouette while avoiding torus-heavy geometry.
  const bandGeometry=new THREE.CylinderGeometry(.375,.375,.045,6,1,true);
  const bandMaterial=material(0x252b29,.42,.8);
  const matrix=new THREE.Matrix4();const position=new THREE.Vector3();const rotation=new THREE.Quaternion();const scale=new THREE.Vector3(1,1,1);const color=new THREE.Color();
  const barrelCenter=new THREE.Vector3();const bandOffset=new THREE.Vector3();
  for(let clusterIndex=0;clusterIndex<barrelClusters.length;clusterIndex++){
    const barrels=barrelClusters[clusterIndex];
    const barrelMesh=new THREE.InstancedMesh(barrelGeometry,barrelMaterial,barrels.length);
    barrelMesh.name=`InstancedIndustrialBarrels:${clusterIndex}`;barrelMesh.castShadow=true;barrelMesh.receiveShadow=true;
    const bandMesh=new THREE.InstancedMesh(bandGeometry,bandMaterial,barrels.length*2);
    bandMesh.name=`InstancedBarrelBands:${clusterIndex}`;bandMesh.castShadow=true;bandMesh.receiveShadow=true;
    let bandIndex=0;
    for(let index=0;index<barrels.length;index++){
      const [x,z,tilt]=barrels[index];rotation.setFromEuler(new THREE.Euler(0,0,tilt));barrelCenter.set(x,.48,z);matrix.compose(barrelCenter,rotation,scale);barrelMesh.setMatrixAt(index,matrix);
      barrelMesh.setColorAt(index,color.setHex(Math.abs(x)%2?0x754532:0x59675e));
      colliders.push(barrelGeometry.boundingBox!.clone().applyMatrix4(matrix));
      for(const y of [.13,.82]){bandOffset.set(0,y-.48,0).applyQuaternion(rotation);position.copy(barrelCenter).add(bandOffset);matrix.compose(position,rotation,scale);bandMesh.setMatrixAt(bandIndex++,matrix);}
    }
    barrelMesh.instanceMatrix.needsUpdate=true;if(barrelMesh.instanceColor)barrelMesh.instanceColor.needsUpdate=true;barrelMesh.computeBoundingBox();barrelMesh.computeBoundingSphere();
    bandMesh.instanceMatrix.needsUpdate=true;bandMesh.computeBoundingBox();bandMesh.computeBoundingSphere();scene.add(barrelMesh,bandMesh);
  }

  const tireMesh=new THREE.InstancedMesh(new THREE.TorusGeometry(.42,.13,6,12),material(0x171a19,.9,.05),4);
  tireMesh.name='InstancedDiscardedTires';tireMesh.castShadow=true;tireMesh.receiveShadow=true;rotation.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  for(let index=0;index<4;index++){position.set(-16,.14+index*.24,-31);matrix.compose(position,rotation,scale);tireMesh.setMatrixAt(index,matrix);}
  tireMesh.instanceMatrix.needsUpdate=true;tireMesh.computeBoundingBox();tireMesh.computeBoundingSphere();scene.add(tireMesh);

  const puddleMat=new THREE.MeshPhysicalMaterial({color:0x263a3a,roughness:.12,metalness:.05,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.72});
  const puddles=[[-5,31,4,1.3],[18,-5,2.2,.8],[-35,-19,3.2,1]] as const;
  const puddleMesh=new THREE.InstancedMesh(new THREE.CircleGeometry(1,12),puddleMat,puddles.length);puddleMesh.name='InstancedIcyPuddles';puddleMesh.renderOrder=2;
  rotation.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  for(let index=0;index<puddles.length;index++){const [x,z,sx,sz]=puddles[index];position.set(x,.028,z);scale.set(sx,sz,1);matrix.compose(position,rotation,scale);puddleMesh.setMatrixAt(index,matrix);}
  puddleMesh.instanceMatrix.needsUpdate=true;puddleMesh.computeBoundingBox();puddleMesh.computeBoundingSphere();scene.add(puddleMesh);
}

function addGroundStencil(scene: THREE.Scene, label: string, x: number, z: number, color: string, rotation = 0): void {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const context = canvas.getContext('2d')!; context.clearRect(0, 0, 256, 256);
  context.strokeStyle = color; context.globalAlpha = .72; context.lineWidth = 11;
  context.strokeRect(25, 25, 206, 206);
  context.fillStyle = color; context.font = '800 108px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText(label, 128, 137);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const stencil = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 4.8),
    new THREE.MeshStandardMaterial({ map, transparent: true, opacity: .56, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  stencil.rotation.x = -Math.PI / 2; stencil.rotation.z = rotation; stencil.position.set(x, .043, z); scene.add(stencil);
}

function createHazardMaterial(): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 32;
  const context = canvas.getContext('2d')!; context.fillStyle = '#cf9d31'; context.fillRect(0, 0, 256, 32);
  context.strokeStyle = '#202523'; context.lineWidth = 18;
  for (let x = -32; x < 288; x += 42) { context.beginPath(); context.moveTo(x, 32); context.lineTo(x + 32, 0); context.stroke(); }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.repeat.set(2.5, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, roughness: .76, metalness: .08 });
}

function addPickup(
  scene: THREE.Scene,
  type: Pickup['type'],
  x: number,
  z: number,
  iconMap?: THREE.Texture,
  crateStampMap?: THREE.Texture,
): Pickup {
  const group = new THREE.Group();
  const colors = { health: 0xd84242, ammo: 0xc69946, armor: 0x5b9db8 };
  const crate = new THREE.Mesh(new THREE.BoxGeometry(.75, .34, .55), material(colors[type], .48, .28));
  crate.position.y = .24; crate.castShadow = true; group.add(crate);
  const band = new THREE.Mesh(new THREE.BoxGeometry(.79, .08, .59), material(0x1a1d1c, .4, .5));
  band.position.y = .24; group.add(band);
  if (iconMap) {
    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(.38, .38),
      new THREE.MeshBasicMaterial({ map: iconMap, transparent: true, alphaTest: .08, depthWrite: false }),
    );
    icon.rotation.x = -Math.PI / 2;
    icon.position.y = .416;
    icon.renderOrder = 3;
    group.add(icon);
  }
  if (crateStampMap) {
    const stamp = new THREE.Mesh(
      new THREE.PlaneGeometry(.3, .22),
      new THREE.MeshBasicMaterial({ map: crateStampMap, transparent: true, alphaTest: .08, depthWrite: false }),
    );
    stamp.position.set(0, .24, .281);
    stamp.renderOrder = 3;
    group.add(stamp);
  }
  const glow = new THREE.PointLight(colors[type], .8, 3.5, 2);
  glow.position.y = .6; group.add(glow);
  group.position.set(x, 0, z); scene.add(group);
  return { mesh: group, type, active: true, respawnAt: 0 };
}

export function buildArena(scene: THREE.Scene, options: BuildArenaOptions = {}): ArenaData {
  const colliders: THREE.Box3[] = [];
  const { enhancedRendering = true, decals, ...materialOptions } = options;
  const materials = createProceduralMaterialLibrary({ seed: 'barrack-01', ...materialOptions });
  const surface = (kind: ArenaSurface, config: ProceduralMaterialOptions): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial => {
    const result = materials.get(kind, config);
    if (!enhancedRendering) {
      // Keep deterministic albedo on the fallback renderer, but drop two texture
      // samples and physical lobes that SwiftShader cannot amortize efficiently.
      result.bumpMap = null;
      result.roughnessMap = null;
      if (result instanceof THREE.MeshPhysicalMaterial) {
        result.clearcoat = 0;
        result.sheen = 0;
      }
      result.needsUpdate = true;
    }
    return result;
  };
  const surfaces: ArenaMaterialSet = {
    concrete: surface('cracked-concrete', { repeat: [8, 3], tint: 0xc5c8c1 }),
    redSteel: surface('painted-corrugated-steel', { repeat: [4, 2], tint: 0x9d625a, seed: 'barracks-red' }),
    corrugatedSteel: surface('painted-corrugated-steel', { repeat: [4, 2], tint: 0x81918d, seed: 'warehouse-grey' }),
    snow: surface('snow', { repeat: [4, 4], tint: 0xf1f5f1 }),
    darkMetal: surface('dark-metal', { repeat: [3, 3], tint: 0x777f7b }),
    wood: surface('worn-wood', { repeat: [2, 2], tint: 0x9a8b6d }),
    facadeFrame: material(0x222826, .56, .48),
    facadeWindow: new THREE.MeshStandardMaterial({
      color: 0x4d5044, roughness: .24, metalness: .12,
      emissive: 0xffb95d, emissiveIntensity: .48,
    }),
  };
  const groundMaterial = surface('snow', { repeat: [32, 32], tint: 0xc1c9c4, seed: 'packed-yard' });
  // This cache entry is unique to the arena floor. Vertex colour multiplies
  // its existing procedural albedo without affecting shared dressing snow.
  groundMaterial.vertexColors = true;
  groundMaterial.needsUpdate = true;
  const snowField = createSnowFieldPresentation(scene, {
    quality: enhancedRendering ? 'high' : 'low',
    seed: 'barrack-01-macro-snow-field',
    size: 180,
    masks: ARENA_SNOW_FIELD_MASKS,
    material: groundMaterial,
  });

  // World-aligned UVs preserve the existing ~8 m texture scale. High quality
  // adds a subtle drainage crown, inward-broken shoulders, worn paint and
  // deterministic repairs without changing the arena's flat gameplay masks.
  const roadMaterial = surface('icy-asphalt', {
    repeat: [1.65, 1.65],
    tint: 0xd0d6d3,
    seed: 'crossroads',
    // Hero road views spend most of their pixels on this one surface. A
    // selective 384px set sharpens aggregate and ice without increasing the
    // existing three-texture or three-draw contracts, while retaining enough
    // headroom for the long enhanced-review capture on software WebGL.
    textureSize: enhancedRendering ? 384 : undefined,
  });
  const roadSurface = createRoadSurfacePresentation(scene, {
    quality: enhancedRendering ? 'high' : 'low',
    length: 145,
    width: 13,
    seed: 'barrack-01-road-surface',
    asphaltMaterial: roadMaterial,
  });

  const concrete = surfaces.concrete;
  const redMetal = surfaces.redSteel;
  const corrugated = surfaces.corrugatedSteel;
  const staticBoxInstances: StaticBoxInstance[] = [];

  const groundDressing = createSnowGroundDressing(scene, {
    material: surfaces.snow,
    roadEdges: ARENA_SNOW_ROAD_EDGES,
    seed: 'barrack-01-ground-history',
    quality: enhancedRendering ? 'high' : 'low',
    surfaceHeightAt: (x, z) => roadSurface.heightSampler.heightAt(x, z),
  });

  addBuilding(scene, colliders, staticBoxInstances, -21, -18, 24, 14, 5.6, concrete, true, 0x9f3533, 'БЛОК 01', false, surfaces, 0, 2.2, enhancedRendering, decals?.signPlate);
  addBuilding(scene, colliders, staticBoxInstances, 24, 19, 19, 13, 4.8, redMetal, false, 0xc19743, 'КАЗАРМА', false, surfaces, 2.4, 3.2, enhancedRendering, decals?.signPlate);
  addBuilding(scene, colliders, staticBoxInstances, 27, -24, 15, 10, 4.1, corrugated, false, 0x4e8999, 'СКЛАД', true, surfaces, 3.4, 4.8, enhancedRendering, decals?.signPlate);
  addBuilding(scene, colliders, staticBoxInstances, -26, 25, 14, 10, 3.8, concrete, false, 0x608465, 'МЕДПУНКТ', false, surfaces, 4.2, 2.2, enhancedRendering, decals?.signPlate);
  const buildingColliderCount = colliders.length;
  if (buildingColliderCount !== 46) throw new Error(`building collider contract drifted: expected 46, received ${buildingColliderCount}`);

  const interiors = addArenaInteriors(scene, colliders, {
    materials: {
      floor: surface('cracked-concrete', { repeat: [6, 4], tint: 0x777d77, seed: 'interior-floor' }),
      ceiling: enhancedRendering ? surfaces.concrete : new THREE.MeshStandardMaterial({ color: 0x777c76, roughness: .95, emissive: 0x333632, emissiveIntensity: .55 }),
      wall: enhancedRendering ? surfaces.concrete : new THREE.MeshStandardMaterial({ color: 0x777c76, roughness: .95, emissive: 0x20231f, emissiveIntensity: .32 }),
      darkMetal: surfaces.darkMetal,
      paintedMetal: surfaces.corrugatedSteel,
      wood: surfaces.wood,
      pallet: surfaces.wood,
    },
    lights: enhancedRendering,
    shadows: enhancedRendering,
  });

  // Modern precast shells preserve the original four unsplit collision lanes.
  const architectureAccent = material(0xd19a45, .58, .28);
  const architectureDetailMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: .7,
    metalness: .24,
    vertexColors: true,
  });
  const facadeBlueprint = createBuildingFacadeBlueprint();
  let buildingFacadePresentation: BuildingFacadePresentation | null = null;
  if (enhancedRendering) {
    const facadeMaterials: BuildingFacadePresentationMaterials = {
      concrete: surfaces.concrete,
      redSteel: surfaces.redSteel,
      corrugatedSteel: surfaces.corrugatedSteel,
      dark: surfaces.facadeFrame,
      glass: surfaces.facadeWindow,
      accent: architectureAccent,
    };
    buildingFacadePresentation = createBuildingFacadePresentation(scene, facadeMaterials, {
      seed: 'barrack-01-building-facades',
      castShadow: true,
      receiveShadow: true,
    });
  } else {
    const facadeColors: Readonly<Record<BuildingFacadeMaterialSlot, THREE.ColorRepresentation>> = {
      concrete: 0xa7aca6,
      dark: 0x29312f,
      accent: 0xd19a45,
      glass: 0xffc16b,
    };
    for (const part of facadeBlueprint.parts) {
      if (part.buildingId === 'warehouse' && (part.role === 'entrance-jamb' || part.role === 'entrance-lintel')) continue;
      staticBoxInstances.push({
        size: part.size,
        position: part.position,
        material: architectureDetailMaterial,
        color: facadeColors[part.materialSlot],
        cluster: `building-detail:${part.buildingId}`,
        castShadow: false,
        receiveShadow: part.receiveShadow,
      });
    }
  }

  const warehouseBlueprint = createWarehouseDetailBlueprint();
  const warehouseColors: Readonly<Record<WarehouseDetailMaterialSlot, THREE.ColorRepresentation>> = {
    steel: 0x687773,
    dark: 0x29312f,
    wood: 0x795a3e,
    glass: 0xffd08a,
    accent: 0xd19a45,
  };
  for (const part of warehouseBlueprint.parts) {
    staticBoxInstances.push({
      size: part.size,
      position: part.position,
      material: architectureDetailMaterial,
      color: warehouseColors[part.materialSlot],
      cluster: 'building-detail:warehouse',
      castShadow: false,
      receiveShadow: part.receiveShadow,
    });
  }

  const barrierBlueprint = createBlastBarrierBlueprint();
  const barrierMaterials: Readonly<Record<BlastBarrierMaterialSlot, THREE.Material>> = {
    concrete,
    snow: surfaces.snow,
    dark: surfaces.darkMetal,
    accent: createHazardMaterial(),
  };
  for (const part of barrierBlueprint.parts) {
    staticBoxInstances.push({
      size: part.size,
      position: part.position,
      material: barrierMaterials[part.materialSlot],
      cluster: `barrier:${part.barrier}`,
      castShadow: part.castShadow,
      receiveShadow: part.receiveShadow,
    });
  }
  for (const collider of barrierBlueprint.colliders) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(...collider.min),
      new THREE.Vector3(...collider.max),
    ));
  }

  // Painted sector IDs make each quadrant immediately legible in a firefight.
  addGroundStencil(scene, 'A1', -13, -7, '#bf554a', -.08);
  addGroundStencil(scene, 'B2', 15, 9, '#d0a24a', .12);
  addGroundStencil(scene, 'C3', 13, -30, '#5c9cad', -.16);
  addGroundStencil(scene, 'D4', -28, 31, '#78a078', .09);

  // Detailed slatted crates retain the five original unsplit collision volumes.
  const crateBlueprint = createYardCrateBlueprint();
  const crateMaterials: Readonly<Record<YardCrateMaterialSlot, THREE.Material>> = {
    wood: surfaces.wood,
    dark: surfaces.darkMetal,
    accent: architectureAccent,
  };
  for (const part of crateBlueprint.parts) {
    staticBoxInstances.push({
      size: part.size,
      position: part.position,
      material: crateMaterials[part.materialSlot],
      cluster: `crate:${part.crateId}`,
      castShadow: part.castShadow,
      receiveShadow: part.receiveShadow,
    });
  }
  for (const collider of crateBlueprint.colliders) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(...collider.min),
      new THREE.Vector3(...collider.max),
    ));
  }
  const bags = surface('burlap', { repeat: [3, 1], tint: 0x8c886e, seed: 'yard-sandbags' });
  const sandbagBarrier = createSandbagBarrierPresentation(scene, {
    quality: enhancedRendering ? 'high' : 'low',
    material: bags,
    castShadow: enhancedRendering,
    receiveShadow: true,
  });
  colliders.push(...sandbagBarrier.colliders);
  const towerMaterials: Readonly<Record<WatchtowerMaterialSlot, THREE.Material>> = {
    steel: surfaces.darkMetal,
    panel: surfaces.corrugatedSteel,
    dark: surfaces.darkMetal,
    snow: surfaces.snow,
    glass: surfaces.facadeWindow,
    accent: architectureAccent,
  };
  queueWatchtower(scene, colliders, staticBoxInstances, towerMaterials, 43, -43);
  queueWatchtower(scene, colliders, staticBoxInstances, towerMaterials, -43, 43);
  const securityBlueprint = createSecurityInfrastructureBlueprint();
  const securityMaterials: Readonly<Record<SecurityMaterialSlot, THREE.Material>> = {
    steel: surfaces.corrugatedSteel,
    dark: surfaces.darkMetal,
    glass: surfaces.facadeWindow,
    accent: architectureAccent,
  };
  for (const part of securityBlueprint.parts) {
    staticBoxInstances.push({
      size: part.size,
      position: part.position,
      rotation: part.rotation,
      material: securityMaterials[part.materialSlot],
      cluster: `security:${part.structureId}`,
      castShadow: part.castShadow,
      receiveShadow: part.receiveShadow,
    });
  }
  for (const collider of securityBlueprint.colliders) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(...collider.min),
      new THREE.Vector3(...collider.max),
    ));
  }
  const securityWire = createSecurityWireBlueprint();
  const securityWireMaterials: Readonly<Record<SecurityWireMaterialSlot, THREE.Material>> = {
    steel: surfaces.corrugatedSteel,
    dark: surfaces.darkMetal,
  };
  for (const part of securityWire.parts) {
    staticBoxInstances.push({
      size: part.size,
      position: part.position,
      rotation: part.rotation,
      material: securityWireMaterials[part.materialSlot],
      cluster: part.cluster,
      castShadow: part.castShadow,
      receiveShadow: part.receiveShadow,
    });
  }
  const chainLinkFence = createChainLinkFencePresentation(scene, undefined, {
    quality: enhancedRendering ? 'high' : 'low',
    castShadow: enhancedRendering,
  });
  addSecurityLighting(scene, enhancedRendering);
  addIndustrialClutter(scene,colliders);
  const militaryTransport = createMilitaryTransportPresentation(scene, undefined, {
    quality: enhancedRendering ? 'high' : 'low',
    castShadow: enhancedRendering,
  });
  colliders.push(...militaryTransport.colliders);

  // Perimeter wall and woodland silhouette.
  const perimeterQuality = enhancedRendering ? 'high' : 'low';
  const wallMat = surface('cracked-concrete', {
    // Low maps twelve repeats over each continuous 120 m shell. High merged
    // geometry supplies physical, per-part UVs and therefore uses unit repeat.
    repeat: enhancedRendering ? [1, 1] : [12, 2],
    tint: 0x969c96,
    seed: 'perimeter',
  });
  const perimeter = createPerimeterWallBlueprint(perimeterQuality);
  const perimeterMaterials: Readonly<Record<PerimeterWallMaterialSlot, THREE.Material>> = {
    concrete: wallMat,
    dark: surfaces.darkMetal,
    snow: surfaces.snow,
    accent: architectureAccent,
  };
  let perimeterPresentation: PerimeterWallPresentation | null = null;
  if (enhancedRendering) {
    perimeterPresentation = createPerimeterWallPresentation(scene, perimeterMaterials, {
      seed: 'barrack-01-perimeter-wall',
      castShadow: true,
      receiveShadow: true,
    });
  } else {
    for (const part of perimeter.parts) {
      staticBoxInstances.push({
        size: part.size,
        position: part.position,
        material: perimeterMaterials[part.materialSlot],
        castShadow: part.castShadow,
        receiveShadow: part.receiveShadow,
      });
    }
  }
  for (const collider of perimeter.colliders) {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(...collider.min),
      new THREE.Vector3(...collider.max),
    ));
  }
  // Relief is generated only after every authoritative ground-contact volume
  // is known, so no visible crust can grow through structures or cover. It is
  // presentation-only and must never change this collider contract.
  replaceWithSharedArenaColliders(colliders);
  const winterGroundRelief = enhancedRendering ? createWinterGroundRelief(scene, {
    material: groundMaterial,
    seed: 'barrack-01-winter-ground-relief',
    fieldSize: 180,
    exclusions: winterReliefExclusions(colliders),
  }) : null;
  const staticBoxes = createStaticBoxBatches(scene, staticBoxInstances, 'ArenaArchitectureBoxes');

  const pinePlacements: WinterPinePlacement[] = [];
  for (let i = 0; i < 54; i++) {
    const side = i % 4;
    const along = -78 + (i * 19.37) % 156;
    const offsetNoise = Math.abs(Math.sin((i + 1) * 91.733) * 43758.5453) % 1;
    const scaleNoise = Math.abs(Math.sin((i + 1) * 47.219) * 24634.6345) % 1;
    const offset = 65 + offsetNoise * 13;
    const x = side < 2 ? along : (side === 2 ? -offset : offset);
    const z = side >= 2 ? along : (side === 0 ? -offset : offset);
    pinePlacements.push({ x, z, scale: .75 + scaleNoise * .65 });
  }
  const foliage = createInstancedFoliage(scene, pinePlacements, {
    quality: enhancedRendering ? 'high' : 'low',
    seed: 0x0ba7701,
    castShadow: enhancedRendering,
    receiveShadow: enhancedRendering,
  });
  const exteriorBackdrop = createWinterBackdrop(scene, {
    quality: enhancedRendering ? 'high' : 'low',
    seed: 'barrack-01-exterior-backdrop',
    snowMaterial: surfaces.snow,
  });

  // Classic army-star compound sign in the spirit of the original game.
  const signText = document.createElement('canvas'); signText.width = 512; signText.height = 128;
  const ctx = signText.getContext('2d')!;
  const signPlateImage = decals?.signPlate?.image as CanvasImageSource | undefined;
  if (signPlateImage) ctx.drawImage(signPlateImage, 0, 0, 512, 128);
  else { ctx.fillStyle = '#982e2e'; ctx.fillRect(0,0,512,128); }
  ctx.fillStyle = 'rgba(90, 12, 12, .18)'; ctx.fillRect(0, 0, 512, 128);
  paintRedStar(ctx, 62, 64, 42); paintRedStar(ctx, 450, 64, 42);
  ctx.fillStyle = '#e7dfca'; ctx.font = '700 40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('АРМИЯ РОССИИ',256,56);
  ctx.font = '700 30px sans-serif'; ctx.fillText('БЛОК 01',256,96);
  const signMap = new THREE.CanvasTexture(signText); signMap.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(9, 2.4, .16),
    new THREE.MeshStandardMaterial({ map: signMap, roughness: .72 }),
  );
  sign.position.set(-21, 3.5, -25.15);sign.castShadow=true;sign.receiveShadow=true;scene.add(sign);

  const pickups = [
    addPickup(scene, 'health', -6, -15, decals?.pickupIcons?.health, decals?.crateStamp),
    addPickup(scene, 'ammo', 17, 7, decals?.pickupIcons?.ammo, decals?.crateStamp),
    addPickup(scene, 'armor', -35, -5, decals?.pickupIcons?.armor, decals?.crateStamp),
    addPickup(scene, 'ammo', 35, 35, decals?.pickupIcons?.ammo, decals?.crateStamp),
  ];

  const spawnPoints = [
    new THREE.Vector3(-43, 0, -36), new THREE.Vector3(42, 0, 38), new THREE.Vector3(38, 0, -12),
    new THREE.Vector3(-38, 0, 12), new THREE.Vector3(5, 0, 30), new THREE.Vector3(12, 0, -40),
    new THREE.Vector3(-8, 0, 22), new THREE.Vector3(32, 0, 4), new THREE.Vector3(-31, 0, -2),
    new THREE.Vector3(-50, 0, 0), new THREE.Vector3(50, 0, 0), new THREE.Vector3(0, 0, -50),
    new THREE.Vector3(0, 0, 50), new THREE.Vector3(-48, 0, 30), new THREE.Vector3(48, 0, -30),
    new THREE.Vector3(25, 0, 48),
  ];
  return {
    colliders, spawnPoints, pickups, materials, interiors, foliage, groundDressing, snowField, winterGroundRelief, roadSurface,
    staticBoxes,
    buildingFacade: {
      quality: enhancedRendering ? 'high' : 'low',
      blueprint: facadeBlueprint,
      authoritativeColliders: buildingColliderCount,
      presentation: buildingFacadePresentation,
    },
    perimeterWall: { quality: perimeterQuality, blueprint: perimeter, presentation: perimeterPresentation },
    chainLinkFence, militaryTransport, sandbagBarrier, exteriorBackdrop,
  };
}

export function updateArena(arena: ArenaData, delta: number, elapsed: number): void {
  for (const pickup of arena.pickups) {
    if (pickup.active) {
      pickup.mesh.rotation.y += delta * .8;
      pickup.mesh.position.y = .08 + Math.sin(elapsed * 2 + pickup.mesh.position.x) * .05;
    } else if (elapsed >= pickup.respawnAt) {
      pickup.active = true; pickup.mesh.visible = true;
    }
  }
}
