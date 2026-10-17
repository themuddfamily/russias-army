import * as THREE from 'three';

export type StaticBoxVector = readonly [number, number, number];

export interface StaticBoxInstance {
  size: StaticBoxVector;
  position: StaticBoxVector;
  rotation?: StaticBoxVector;
  material: THREE.Material;
  /** Optional per-instance tint. The shared material must enable vertexColors. */
  color?: THREE.ColorRepresentation;
  /** Optional spatial bucket; preserves frustum culling for distant structures. */
  cluster?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface StaticBoxBatchStats {
  instances: number;
  batches: number;
  triangles: number;
}

export interface StaticBoxBatches {
  root: THREE.Group;
  meshes: readonly THREE.InstancedMesh[];
  stats: Readonly<StaticBoxBatchStats>;
  /** Detaches the batches and disposes their shared geometry, never caller materials. */
  dispose(): void;
}

interface Bucket {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  instances: StaticBoxInstance[];
}

function validateVector(vector: StaticBoxVector, label: string, positive = false): void {
  for (let axis = 0; axis < 3; axis++) {
    const value = vector[axis];
    if (!Number.isFinite(value) || (positive && value <= 0)) {
      throw new RangeError(`${label}[${axis}] must be ${positive ? 'finite and greater than zero' : 'finite'}`);
    }
  }
}

/**
 * Collapses arbitrary axis-aligned or Euler-rotated boxes into one draw batch per
 * material/shadow-state tuple. Materials are injected and remain caller-owned.
 */
export function createStaticBoxBatches(
  parent: THREE.Object3D,
  instances: readonly StaticBoxInstance[],
  name = 'StaticBoxBatches',
): StaticBoxBatches {
  const materialBuckets = new Map<THREE.Material, Map<string, Bucket>>();
  for (let index = 0; index < instances.length; index++) {
    const instance = instances[index];
    validateVector(instance.size, `instances[${index}].size`, true);
    validateVector(instance.position, `instances[${index}].position`);
    if (instance.rotation) validateVector(instance.rotation, `instances[${index}].rotation`);
    const castShadow = instance.castShadow ?? true;
    const receiveShadow = instance.receiveShadow ?? true;
    let states = materialBuckets.get(instance.material);
    if (!states) { states = new Map(); materialBuckets.set(instance.material, states); }
    const key = `${castShadow ? 1 : 0}:${receiveShadow ? 1 : 0}:${instance.cluster ?? ''}`;
    let bucket = states.get(key);
    if (!bucket) {
      bucket = { material: instance.material, castShadow, receiveShadow, instances: [] };
      states.set(key, bucket);
    }
    bucket.instances.push(instance);
  }

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.name = `${name}UnitBox`;
  const root = new THREE.Group();
  root.name = name;
  root.userData.visualOnly = true;
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const color = new THREE.Color();
  for (const states of materialBuckets.values()) for (const bucket of states.values()) {
    const mesh = new THREE.InstancedMesh(geometry, bucket.material, bucket.instances.length);
    mesh.name = `${name}:${meshes.length}`;
    mesh.userData.visualOnly = true;
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const usesInstanceColors = bucket.instances.some((instance) => instance.color !== undefined);
    for (let index = 0; index < bucket.instances.length; index++) {
      const instance = bucket.instances[index];
      position.set(...instance.position);
      scale.set(...instance.size);
      if (instance.rotation) {
        euler.set(...instance.rotation);
        quaternion.setFromEuler(euler);
      } else quaternion.identity();
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      if (usesInstanceColors) {
        mesh.setColorAt(index, color.set(instance.color ?? 0xffffff));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(THREE.StaticDrawUsage);
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    root.add(mesh);
    meshes.push(mesh);
  }
  parent.add(root);

  const stats = Object.freeze<StaticBoxBatchStats>({
    instances: instances.length,
    batches: meshes.length,
    triangles: instances.length * 12,
  });
  let disposed = false;
  return {
    root,
    meshes,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      geometry.dispose();
    },
  };
}
