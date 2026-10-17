import * as THREE from 'three';
import { createMilitaryTransportShellGeometry } from './militaryTransportGeometry';
import { createMilitaryTransportMaterials } from './militaryTransportMaterials';

export type MilitaryTransportQuality = 'low' | 'high';

/** World-space placement of one parked truck. The local bonnet points toward -Z. */
export interface MilitaryTransportPlacement {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly yaw?: number;
  readonly scale?: number;
}

export interface MilitaryTransportOptions {
  readonly quality?: MilitaryTransportQuality;
  readonly name?: string;
  readonly groundY?: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface MilitaryTransportBatches {
  /** All painted bodywork, glazing, canvas, lamps, trim and snow. */
  readonly body: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Six tyres and six inset hubs per truck in one instance-coloured batch. */
  readonly runningGear: THREE.InstancedMesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
}

export interface MilitaryTransportResources {
  readonly bodyGeometry: THREE.BufferGeometry;
  readonly runningGearGeometry: THREE.CylinderGeometry;
  readonly bodyMaterial: THREE.MeshStandardMaterial;
  readonly runningGearMaterial: THREE.MeshStandardMaterial;
}

export interface MilitaryTransportStats {
  readonly quality: MilitaryTransportQuality;
  readonly transports: number;
  /** Number of authored pieces baked into one high-tier shell. */
  readonly bodyParts: number;
  /** Actual submitted body instances; high tier uses one merged shell per truck. */
  readonly shellInstances: number;
  readonly bodyInstances: number;
  readonly tyreInstances: number;
  readonly hubInstances: number;
  readonly runningGearInstances: number;
  readonly totalInstances: number;
  readonly drawCalls: number;
  readonly geometries: number;
  readonly textures: 0;
  readonly colliders: number;
  /** Submitted triangles for the complete placement array after instancing. */
  readonly submittedTriangles: number;
  /** Useful when callers place more than the default single vehicle. */
  readonly trianglesPerTransport: number;
}

export interface MilitaryTransportPresentation {
  readonly group: THREE.Group;
  readonly batches: Readonly<MilitaryTransportBatches>;
  readonly resources: Readonly<MilitaryTransportResources>;
  /** Exactly one conservative, seam-free world AABB for each placement. */
  readonly colliders: readonly THREE.Box3[];
  readonly stats: Readonly<MilitaryTransportStats>;
  /** Idempotently detaches the group and releases every module-owned resource. */
  dispose(): void;
}

export const DEFAULT_MILITARY_TRANSPORT_PLACEMENTS: readonly MilitaryTransportPlacement[] = Object.freeze([
  Object.freeze({ id: 'yard-cargo-truck', x: 9, z: 29, yaw: 0, scale: 1 }),
]);

export const MILITARY_TRANSPORT_TRIANGLE_BUDGET = Object.freeze({ low: 1_200, high: 1_800 });
export const MILITARY_TRANSPORT_DRAW_CALL_BUDGET = 3;
export const MILITARY_TRANSPORT_GEOMETRY_BUDGET = 3;

type Point3 = readonly [number, number, number];

interface BodyPart {
  readonly role: string;
  readonly size: Point3;
  readonly position: Point3;
  readonly color: THREE.ColorRepresentation;
  readonly rotation?: Point3;
  readonly highOnly?: boolean;
}

const BODY_GREEN = 0x71806c;
const BODY_DARK = 0x313936;
const CANVAS_GREEN = 0x7e866e;
const GLASS_BLUE = 0x4d6e72;
const METAL = 0x9ca5a1;
const SNOW = 0xdce6e3;
const HEADLIGHT = 0xffcf78;
const TAILLIGHT = 0x9d2927;

const BODY_PARTS: readonly BodyPart[] = Object.freeze([
  // Broad shapes first: a long ladder chassis, covered cargo bed and stepped cab.
  { role: 'chassis', size: [2.16, .25, 6.55], position: [0, .67, -.02], color: BODY_DARK },
  { role: 'cargo-floor', size: [2.42, .18, 3.56], position: [0, 1.08, 1.33], color: BODY_GREEN },
  { role: 'canvas-bed', size: [2.26, 1.26, 3.32], position: [0, 1.91, 1.34], color: CANVAS_GREEN },
  { role: 'canvas-roof-left', size: [1.25, .12, 3.40], position: [-.56, 2.60, 1.34], rotation: [0, 0, -.14], color: CANVAS_GREEN },
  { role: 'canvas-roof-right', size: [1.25, .12, 3.40], position: [.56, 2.60, 1.34], rotation: [0, 0, .14], color: CANVAS_GREEN },
  { role: 'cargo-snow', size: [1.58, .085, 3.18], position: [0, 2.70, 1.32], color: SNOW },
  { role: 'cab-lower', size: [2.16, 1.03, 1.72], position: [0, 1.21, -2.24], color: BODY_GREEN },
  { role: 'cab-upper', size: [2.02, .91, 1.35], position: [0, 2.03, -2.14], color: BODY_GREEN },
  { role: 'bonnet', size: [1.88, .63, 1.16], position: [0, 1.28, -3.15], color: BODY_GREEN },
  { role: 'grille', size: [1.78, .59, .105], position: [0, 1.24, -3.75], color: BODY_DARK },
  { role: 'front-bumper', size: [2.34, .18, .22], position: [0, .76, -3.82], color: METAL },
  { role: 'windscreen', size: [1.72, .56, .07], position: [0, 2.13, -2.84], color: GLASS_BLUE },
  { role: 'left-window', size: [.065, .55, .72], position: [-1.045, 2.12, -2.20], color: GLASS_BLUE },
  { role: 'right-window', size: [.065, .55, .72], position: [1.045, 2.12, -2.20], color: GLASS_BLUE },
  { role: 'left-bed-rail', size: [.10, .42, 3.44], position: [-1.20, 1.19, 1.34], color: BODY_GREEN },
  { role: 'right-bed-rail', size: [.10, .42, 3.44], position: [1.20, 1.19, 1.34], color: BODY_GREEN },
  { role: 'left-headlight', size: [.37, .25, .08], position: [-.63, 1.23, -3.82], color: HEADLIGHT },
  { role: 'right-headlight', size: [.37, .25, .08], position: [.63, 1.23, -3.82], color: HEADLIGHT },
  { role: 'rear-bumper', size: [2.26, .16, .18], position: [0, .72, 3.19], color: METAL },
  { role: 'left-tail-light', size: [.28, .22, .07], position: [-.83, 1.06, 3.18], color: TAILLIGHT },
  { role: 'right-tail-light', size: [.28, .22, .07], position: [.83, 1.06, 3.18], color: TAILLIGHT },

  // High tier adds close-range silhouette and readable manufactured seams, but
  // retains the same two batches and authoritative collider as low tier.
  { role: 'left-mirror-stalk', size: [.34, .045, .045], position: [-1.20, 2.22, -2.62], color: METAL, highOnly: true },
  { role: 'right-mirror-stalk', size: [.34, .045, .045], position: [1.20, 2.22, -2.62], color: METAL, highOnly: true },
  { role: 'left-mirror', size: [.065, .28, .22], position: [-1.39, 2.22, -2.62], color: BODY_DARK, highOnly: true },
  { role: 'right-mirror', size: [.065, .28, .22], position: [1.39, 2.22, -2.62], color: BODY_DARK, highOnly: true },
  { role: 'windscreen-divider', size: [.055, .57, .085], position: [0, 2.13, -2.88], color: BODY_DARK, highOnly: true },
  { role: 'left-step', size: [.34, .12, .72], position: [-1.25, .72, -2.13], color: METAL, highOnly: true },
  { role: 'right-step', size: [.34, .12, .72], position: [1.25, .72, -2.13], color: METAL, highOnly: true },
  { role: 'left-door-handle', size: [.055, .055, .31], position: [-1.085, 1.77, -1.94], color: BODY_DARK, highOnly: true },
  { role: 'right-door-handle', size: [.055, .055, .31], position: [1.085, 1.77, -1.94], color: BODY_DARK, highOnly: true },
  { role: 'bonnet-snow', size: [1.58, .065, .72], position: [0, 1.625, -3.10], color: SNOW, highOnly: true },
  { role: 'grille-slat-1', size: [.12, .48, .035], position: [-.58, 1.24, -3.81], color: METAL, highOnly: true },
  { role: 'grille-slat-2', size: [.12, .48, .035], position: [-.29, 1.24, -3.81], color: METAL, highOnly: true },
  { role: 'grille-slat-3', size: [.12, .48, .035], position: [0, 1.24, -3.81], color: METAL, highOnly: true },
  { role: 'grille-slat-4', size: [.12, .48, .035], position: [.29, 1.24, -3.81], color: METAL, highOnly: true },
  { role: 'grille-slat-5', size: [.12, .48, .035], position: [.58, 1.24, -3.81], color: METAL, highOnly: true },
  { role: 'left-canvas-strap-front', size: [.035, 1.12, .10], position: [-1.17, 1.94, .35], color: BODY_DARK, highOnly: true },
  { role: 'left-canvas-strap-rear', size: [.035, 1.12, .10], position: [-1.17, 1.94, 2.32], color: BODY_DARK, highOnly: true },
  { role: 'right-canvas-strap-front', size: [.035, 1.12, .10], position: [1.17, 1.94, .35], color: BODY_DARK, highOnly: true },
  { role: 'right-canvas-strap-rear', size: [.035, 1.12, .10], position: [1.17, 1.94, 2.32], color: BODY_DARK, highOnly: true },
]);

const WHEEL_STATIONS = Object.freeze([-2.35, .30, 2.43]);
const TRUCK_COLLIDER_SIZE = new THREE.Vector3(2.66, 2.90, 7.20);
const TRUCK_COLLIDER_CENTER = new THREE.Vector3(0, 1.45, -.10);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function validatePlacement(placement: MilitaryTransportPlacement, index: number, ids: Set<string>): void {
  if (placement.id.trim().length === 0) throw new RangeError(`placements[${index}].id must not be empty`);
  if (ids.has(placement.id)) throw new RangeError(`placements[${index}].id must be unique`);
  ids.add(placement.id);
  if (!Number.isFinite(placement.x)) throw new RangeError(`placements[${index}].x must be finite`);
  if (!Number.isFinite(placement.z)) throw new RangeError(`placements[${index}].z must be finite`);
  if (!Number.isFinite(placement.yaw ?? 0)) throw new RangeError(`placements[${index}].yaw must be finite`);
  if (!Number.isFinite(placement.scale ?? 1) || (placement.scale ?? 1) <= 0) {
    throw new RangeError(`placements[${index}].scale must be finite and greater than zero`);
  }
}

function configureBatch(
  batch: THREE.InstancedMesh,
  name: string,
  castShadow: boolean,
  receiveShadow: boolean,
): void {
  batch.name = name;
  batch.castShadow = castShadow;
  batch.receiveShadow = receiveShadow;
  batch.frustumCulled = true;
  batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  batch.userData.authoritativeColliders = 'MilitaryTransportPresentation.colliders';
}

function finishBatch(batch: THREE.InstancedMesh): void {
  batch.instanceMatrix.needsUpdate = true;
  if (batch.instanceColor) {
    batch.instanceColor.setUsage(THREE.StaticDrawUsage);
    batch.instanceColor.needsUpdate = true;
  }
  if (batch.count === 0) return;
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

/**
 * Builds one or more parked cargo trucks in two texture-free instanced batches.
 * High tier bakes its authored body pieces into one shell before placement, so
 * richer silhouette and surface roles do not multiply draw calls.
 * Each placement owns exactly one conservative world AABB; visual mirrors and
 * lamps deliberately do not create small collider seams.
 */
export function createMilitaryTransportPresentation(
  parent: THREE.Object3D,
  placements: readonly MilitaryTransportPlacement[] = DEFAULT_MILITARY_TRANSPORT_PLACEMENTS,
  options: MilitaryTransportOptions = {},
): MilitaryTransportPresentation {
  const quality = options.quality ?? 'high';
  if (quality !== 'low' && quality !== 'high') throw new RangeError('quality must be low or high');
  const groundY = options.groundY ?? 0;
  if (!Number.isFinite(groundY)) throw new RangeError('groundY must be finite');
  const ids = new Set<string>();
  placements.forEach((placement, index) => validatePlacement(placement, index, ids));

  const bodyParts = BODY_PARTS.filter((part) => quality === 'high' || !part.highOnly);
  const shell = quality === 'high' ? createMilitaryTransportShellGeometry() : null;
  const bodyPartCount = shell?.partCount ?? bodyParts.length;
  const shellInstances = quality === 'high' ? placements.length : bodyParts.length * placements.length;
  const bodyInstances = shellInstances;
  const tyreInstances = 6 * placements.length;
  const hubInstances = 6 * placements.length;
  const runningGearInstances = tyreInstances + hubInstances;
  const castShadow = options.castShadow ?? quality === 'high';
  const receiveShadow = options.receiveShadow ?? true;

  const bodyGeometry: THREE.BufferGeometry = shell?.geometry ?? new THREE.BoxGeometry(1, 1, 1);
  if (!shell) bodyGeometry.name = 'MilitaryTransportUnitBox';
  const runningGearGeometry = new THREE.CylinderGeometry(.5, .5, 1, quality === 'high' ? 12 : 8, 1, false);
  runningGearGeometry.name = `MilitaryTransportWheel${quality === 'high' ? 'High' : 'Low'}`;
  const transportMaterials = createMilitaryTransportMaterials(quality);
  const bodyMaterial = transportMaterials.body;
  const runningGearMaterial = transportMaterials.runningGear;

  const body = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, bodyInstances);
  const runningGear = new THREE.InstancedMesh(runningGearGeometry, runningGearMaterial, runningGearInstances);
  configureBatch(body, 'InstancedMilitaryTransportBody', castShadow, receiveShadow);
  configureBatch(runningGear, 'InstancedMilitaryTransportRunningGear', castShadow, receiveShadow);

  const baseMatrix = new THREE.Matrix4();
  const localMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const localPosition = new THREE.Vector3();
  const localScale = new THREE.Vector3();
  const localRotation = new THREE.Quaternion();
  const baseRotation = new THREE.Quaternion();
  const color = new THREE.Color();
  const colliders: THREE.Box3[] = [];
  let bodyIndex = 0;
  let runningGearIndex = 0;

  for (const placement of placements) {
    const scale = placement.scale ?? 1;
    const yaw = placement.yaw ?? 0;
    baseRotation.setFromAxisAngle(Y_AXIS, yaw);
    baseMatrix.compose(
      new THREE.Vector3(placement.x, groundY, placement.z),
      baseRotation,
      new THREE.Vector3(scale, scale, scale),
    );

    if (shell) {
      body.setMatrixAt(bodyIndex, baseMatrix);
      bodyIndex++;
    } else {
      for (const part of bodyParts) {
        localPosition.set(...part.position);
        localScale.set(...part.size);
        localRotation.setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0])));
        localMatrix.compose(localPosition, localRotation, localScale);
        worldMatrix.multiplyMatrices(baseMatrix, localMatrix);
        body.setMatrixAt(bodyIndex, worldMatrix);
        body.setColorAt(bodyIndex, color.set(part.color));
        bodyIndex++;
      }
    }

    // Cylinder local Y is the axle; a Z quarter turn points it across the truck.
    localRotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    for (const x of [-1.15, 1.15]) {
      for (const z of WHEEL_STATIONS) {
        localPosition.set(x, .50, z);
        localScale.set(.92, .31, .92);
        localMatrix.compose(localPosition, localRotation, localScale);
        worldMatrix.multiplyMatrices(baseMatrix, localMatrix);
        runningGear.setMatrixAt(runningGearIndex, worldMatrix);
        runningGear.setColorAt(runningGearIndex, color.set(BODY_DARK));
        runningGearIndex++;
      }
    }
    for (const x of [-1.15, 1.15]) {
      for (const z of WHEEL_STATIONS) {
        localPosition.set(x, .50, z);
        localScale.set(.56, .34, .56);
        localMatrix.compose(localPosition, localRotation, localScale);
        worldMatrix.multiplyMatrices(baseMatrix, localMatrix);
        runningGear.setMatrixAt(runningGearIndex, worldMatrix);
        runningGear.setColorAt(runningGearIndex, color.set(METAL));
        runningGearIndex++;
      }
    }

    const colliderMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(placement.x, groundY, placement.z),
      baseRotation,
      new THREE.Vector3(scale, scale, scale),
    );
    localMatrix.compose(TRUCK_COLLIDER_CENTER, new THREE.Quaternion(), TRUCK_COLLIDER_SIZE);
    colliderMatrix.multiply(localMatrix);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(-.5, -.5, -.5),
      new THREE.Vector3(.5, .5, .5),
    ).applyMatrix4(colliderMatrix));
  }

  finishBatch(body);
  finishBatch(runningGear);
  const group = new THREE.Group();
  group.name = options.name ?? 'MilitaryTransportPresentation';
  group.userData.quality = quality;
  group.userData.colliderPolicy = 'one-authoritative-aabb-per-transport';
  group.add(body, runningGear);
  parent.add(group);

  const bodyTriangles = shell?.triangles ?? triangleCount(bodyGeometry) * bodyParts.length;
  const runningGearTriangles = triangleCount(runningGearGeometry) * 12;
  const trianglesPerTransport = bodyTriangles + runningGearTriangles;
  if (trianglesPerTransport > MILITARY_TRANSPORT_TRIANGLE_BUDGET[quality]) {
    throw new RangeError(`military transport exceeds the ${quality} triangle budget`);
  }
  const stats = Object.freeze<MilitaryTransportStats>({
    quality,
    transports: placements.length,
    bodyParts: bodyPartCount,
    shellInstances,
    bodyInstances,
    tyreInstances,
    hubInstances,
    runningGearInstances,
    totalInstances: bodyInstances + runningGearInstances,
    drawCalls: placements.length === 0 ? 0 : 2,
    geometries: placements.length === 0 ? 0 : 2,
    textures: 0,
    colliders: colliders.length,
    submittedTriangles: trianglesPerTransport * placements.length,
    trianglesPerTransport,
  });
  const batches = Object.freeze({ body, runningGear });
  const resources = Object.freeze({ bodyGeometry, runningGearGeometry, bodyMaterial, runningGearMaterial });
  const frozenColliders = Object.freeze(colliders);
  let disposed = false;

  return {
    group,
    batches,
    resources,
    colliders: frozenColliders,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      bodyGeometry.dispose();
      runningGearGeometry.dispose();
      bodyMaterial.dispose();
      runningGearMaterial.dispose();
    },
  };
}
