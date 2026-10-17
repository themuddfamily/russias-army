import * as THREE from 'three';
import {
  SANDBAG_LEGACY_CAPSULE_BOUNDS,
  createSandbagGeometry,
  type SandbagGeometryQuality,
} from './sandbagGeometry';

export interface SandbagBarrierOptions {
  quality?: SandbagGeometryQuality;
  /** Injected materials remain caller-owned. */
  material?: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  name?: string;
}

export interface SandbagBarrierStats {
  quality: SandbagGeometryQuality;
  bags: 6;
  drawCalls: 1;
  geometries: 1;
  colliders: 6;
  trianglesPerBag: number;
  submittedTriangles: number;
}

export interface SandbagBarrierPresentation {
  group: THREE.Group;
  bags: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
  /** The six original capsule-derived gameplay AABBs, unchanged by visual quality. */
  colliders: readonly THREE.Box3[];
  stats: Readonly<SandbagBarrierStats>;
  dispose(): void;
}

export const SANDBAG_BARRIER_COUNT = 6;
export const SANDBAG_BARRIER_START_X = -2;
export const SANDBAG_BARRIER_SPACING = 1.25;
export const SANDBAG_BARRIER_POSITION_Y = .34;
export const SANDBAG_BARRIER_POSITION_Z = 24;
export const SANDBAG_BARRIER_ROTATION = Object.freeze([0, .15, Math.PI / 2] as const);

/**
 * Builds the arena's existing low-cover row as one modern instanced sack draw.
 * Visual shells stay inside the frozen legacy capsule bounds, so gameplay cover
 * and navigation retain their exact six world-space AABBs.
 */
export function createSandbagBarrierPresentation(
  parent: THREE.Object3D,
  options: SandbagBarrierOptions = {},
): SandbagBarrierPresentation {
  const quality = options.quality ?? 'high';
  if (quality !== 'low' && quality !== 'high') throw new RangeError('sandbag barrier quality must be low or high');

  const shell = createSandbagGeometry(quality);
  const ownedMaterial = options.material ? null : new THREE.MeshStandardMaterial({
    color: 0x817b62,
    roughness: .96,
    metalness: 0,
  });
  const material = options.material ?? ownedMaterial!;
  const bags = new THREE.InstancedMesh(shell.geometry, material, SANDBAG_BARRIER_COUNT);
  bags.name = 'InstancedLoadedSandbagBarrier';
  bags.castShadow = options.castShadow ?? quality === 'high';
  bags.receiveShadow = options.receiveShadow ?? true;
  bags.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  bags.userData.authoritativeColliders = 'SandbagBarrierPresentation.colliders';

  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...SANDBAG_BARRIER_ROTATION));
  const scale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const colliders: THREE.Box3[] = [];
  const localCollider = new THREE.Box3(
    new THREE.Vector3(...SANDBAG_LEGACY_CAPSULE_BOUNDS.min),
    new THREE.Vector3(...SANDBAG_LEGACY_CAPSULE_BOUNDS.max),
  );
  const tint = new THREE.Color();
  for (let index = 0; index < SANDBAG_BARRIER_COUNT; index++) {
    matrix.compose(
      new THREE.Vector3(
        SANDBAG_BARRIER_START_X + index * SANDBAG_BARRIER_SPACING,
        SANDBAG_BARRIER_POSITION_Y,
        SANDBAG_BARRIER_POSITION_Z,
      ),
      rotation,
      scale,
    );
    bags.setMatrixAt(index, matrix);
    // Small deterministic cloth-value variation breaks the repeated-instance
    // read without altering geometry, material count, transforms, or collision.
    const value = 1 - (index % 3) * .035;
    bags.setColorAt(index, tint.setRGB(value, value * .985, value * .94));
    colliders.push(localCollider.clone().applyMatrix4(matrix));
  }
  bags.instanceMatrix.needsUpdate = true;
  if (bags.instanceColor) {
    bags.instanceColor.setUsage(THREE.StaticDrawUsage);
    bags.instanceColor.needsUpdate = true;
  }
  bags.computeBoundingBox();
  bags.computeBoundingSphere();

  const group = new THREE.Group();
  group.name = options.name ?? 'ModernSandbagBarrier';
  group.userData.presentationOnly = true;
  group.add(bags);
  parent.add(group);

  const stats = Object.freeze<SandbagBarrierStats>({
    quality,
    bags: SANDBAG_BARRIER_COUNT,
    drawCalls: 1,
    geometries: 1,
    colliders: SANDBAG_BARRIER_COUNT,
    trianglesPerBag: shell.stats.triangles,
    submittedTriangles: shell.stats.triangles * SANDBAG_BARRIER_COUNT,
  });
  let disposed = false;
  return {
    group,
    bags,
    colliders,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      shell.dispose();
      ownedMaterial?.dispose();
    },
  };
}
