import * as THREE from 'three';

/** Minimal vector shape accepted by the mark emission API. */
export interface CombatImpactMarkVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CombatImpactMarkCapacities {
  bullets: number;
  scorches: number;
}

export interface CombatImpactMarksOptions {
  capacities?: Partial<CombatImpactMarkCapacities>;
  /** Seed used for repeatable mark rotation, size variation and textures. */
  seed?: number;
  rootName?: string;
  /** Optional authored decal textures. Ownership transfers to this presentation. */
  bulletTexture?: THREE.Texture;
  scorchTexture?: THREE.Texture;
}

export interface ImpactMarkEmissionOptions {
  /** World-space radius. Plane diameter is twice this value. */
  radius?: number;
  /** Seconds before the mark is returned to its fixed-capacity pool. */
  lifetime?: number;
}

export interface CombatImpactMarksStats {
  readonly active: Readonly<CombatImpactMarkCapacities>;
  readonly capacity: Readonly<CombatImpactMarkCapacities>;
  readonly drawCalls: number;
  readonly resources: {
    readonly geometries: number;
    readonly materials: number;
    readonly textures: number;
  };
}

interface MarkSlot {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  radius: number;
  age: number;
  lifetime: number;
  active: boolean;
}

interface MarkPool {
  readonly slots: MarkSlot[];
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  cursor: number;
}

const DEFAULT_CAPACITIES: Readonly<CombatImpactMarkCapacities> = Object.freeze({
  bullets: 96,
  scorches: 12,
});
const PLANE_NORMAL = new THREE.Vector3(0, 0, 1);
const BULLET_OFFSET = .008;
const SCORCH_OFFSET = .012;

function validatedCapacity(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new RangeError(`${label} capacity must be a non-negative integer.`);
  }
  return resolved;
}

function finitePositive(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero.`);
  }
  return resolved;
}

function validatedSeed(value: number | undefined): number {
  const resolved = value ?? 0x7f4a7c15;
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved)) {
    throw new RangeError('Impact mark seed must be a finite integer.');
  }
  return resolved >>> 0 || 0x7f4a7c15;
}

function pixelNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x + 0x68bc21eb, 0x27d4eb2d);
  value ^= Math.imul(y + 0x165667b1, 0x85ebca6b);
  value ^= seed;
  value ^= value >>> 15;
  value = Math.imul(value, 0x2c1b3c6d);
  value ^= value >>> 12;
  return (value >>> 0) / 4294967296;
}

function createBulletTexture(seed: number, size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) * .5;
  const phase = pixelNoise(2, 7, seed) * Math.PI * 2;
  const spokeCount = 7 + (seed % 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - center) / center;
      const ny = (y - center) / center;
      const distance = Math.hypot(nx, ny);
      const angle = Math.atan2(ny, nx);
      const noise = pixelNoise(x, y, seed);
      const irregularDistance = distance * (1 + (noise - .5) * .14);
      const crater = irregularDistance < .28 ? 1 : Math.max(0, 1 - (irregularDistance - .28) / .16);
      const rim = Math.max(0, 1 - Math.abs(irregularDistance - .39) / .075);
      const spoke = Math.pow(Math.max(0, Math.cos(angle * spokeCount + phase)), 22)
        * Math.max(0, 1 - distance / .92)
        * (distance > .28 ? 1 : 0);
      const alpha = THREE.MathUtils.clamp(Math.max(crater, rim * .78, spoke * .72) + (noise - .72) * .2, 0, 1);
      const shade = Math.round(THREE.MathUtils.lerp(24, 77, rim * .65 + noise * .12));
      const offset = (y * size + x) * 4;
      data[offset] = shade;
      data[offset + 1] = Math.max(0, shade - 4);
      data[offset + 2] = Math.max(0, shade - 8);
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'combat-impact-bullet-mark';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createScorchTexture(seed: number, size = 96): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) * .5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - center) / center;
      const ny = (y - center) / center;
      const distance = Math.hypot(nx, ny);
      const noise = pixelNoise(x, y, seed ^ 0x9e3779b9);
      const coarse = pixelNoise(x >> 2, y >> 2, seed ^ 0x51ed270b);
      const edge = 1 - THREE.MathUtils.smoothstep(distance + (coarse - .5) * .2, .48, 1.03);
      const soot = THREE.MathUtils.clamp(edge * (.56 + noise * .44), 0, 1);
      const heatRing = Math.max(0, 1 - Math.abs(distance - .43) / .24) * edge;
      const alpha = THREE.MathUtils.clamp(soot * .92 + heatRing * .18, 0, 1);
      const shade = Math.round(THREE.MathUtils.lerp(56, 108, noise * .34 + heatRing * .18));
      const offset = (y * size + x) * 4;
      data[offset] = shade;
      data[offset + 1] = Math.max(0, shade - 7);
      data[offset + 2] = Math.max(0, shade - 12);
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'combat-impact-scorch-mark';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createMarkMaterial(
  name: string,
  texture: THREE.Texture,
  alphaTest: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name,
    map: texture,
    alphaTest,
    transparent: false,
    depthTest: true,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function createSlot(): MarkSlot {
  return {
    x: 0,
    y: 0,
    z: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    radius: 0,
    age: 0,
    lifetime: 0,
    active: false,
  };
}

function createPool(
  root: THREE.Object3D,
  geometry: THREE.PlaneGeometry,
  material: THREE.MeshStandardMaterial,
  count: number,
  name: string,
  renderOrder: number,
): MarkPool {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.count = 0;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.decorative = true;
  root.add(mesh);
  return {
    slots: Array.from({ length: count }, createSlot),
    mesh,
    cursor: 0,
  };
}

/**
 * Fixed-capacity persistent combat marks. Emissions only overwrite preallocated
 * numeric slots; the two shared instanced batches are compacted after each
 * change so inactive marks submit no instances or draw calls.
 */
export class CombatImpactMarks {
  readonly root = new THREE.Group();
  readonly capacities: Readonly<CombatImpactMarkCapacities>;
  readonly bulletMesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  readonly scorchMesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

  private readonly geometry: THREE.PlaneGeometry;
  private readonly bulletTexture: THREE.Texture;
  private readonly scorchTexture: THREE.Texture;
  private readonly bulletMaterial: THREE.MeshStandardMaterial;
  private readonly scorchMaterial: THREE.MeshStandardMaterial;
  private readonly bulletPool: MarkPool;
  private readonly scorchPool: MarkPool;
  private readonly position = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly orientation = new THREE.Quaternion();
  private readonly roll = new THREE.Quaternion();
  private readonly matrix = new THREE.Matrix4();
  private randomState: number;
  private disposed = false;

  constructor(parent: THREE.Object3D, options: CombatImpactMarksOptions = {}) {
    const capacities = options.capacities ?? {};
    this.capacities = Object.freeze({
      bullets: validatedCapacity(capacities.bullets, DEFAULT_CAPACITIES.bullets, 'Bullets'),
      scorches: validatedCapacity(capacities.scorches, DEFAULT_CAPACITIES.scorches, 'Scorches'),
    });
    this.randomState = validatedSeed(options.seed);
    this.root.name = options.rootName ?? 'combat-impact-marks';
    this.root.userData.decorative = true;
    parent.add(this.root);

    this.geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    this.geometry.name = 'combat-impact-mark-plane';
    this.bulletTexture = options.bulletTexture ?? createBulletTexture(this.randomState ^ 0x243f6a88);
    this.scorchTexture = options.scorchTexture ?? createScorchTexture(this.randomState ^ 0xb7e15162);
    this.bulletMaterial = createMarkMaterial('combat-impact-bullet-material', this.bulletTexture, .22);
    this.scorchMaterial = createMarkMaterial('combat-impact-scorch-material', this.scorchTexture, .1);
    this.bulletPool = createPool(
      this.root,
      this.geometry,
      this.bulletMaterial,
      this.capacities.bullets,
      'combat-impact-bullets',
      4,
    );
    this.scorchPool = createPool(
      this.root,
      this.geometry,
      this.scorchMaterial,
      this.capacities.scorches,
      'combat-impact-scorches',
      3,
    );
    this.bulletMesh = this.bulletPool.mesh;
    this.scorchMesh = this.scorchPool.mesh;
  }

  emitBullet(
    point: CombatImpactMarkVector,
    normal: CombatImpactMarkVector,
    options: ImpactMarkEmissionOptions = {},
  ): boolean {
    return this.emit(this.bulletPool, point, normal, options, .075, 30, BULLET_OFFSET);
  }

  emitScorch(
    point: CombatImpactMarkVector,
    normal: CombatImpactMarkVector,
    options: ImpactMarkEmissionOptions = {},
  ): boolean {
    return this.emit(this.scorchPool, point, normal, options, 1.65, 45, SCORCH_OFFSET);
  }

  /** Advances lifetimes, expires old marks and compacts both instance batches. */
  update(delta: number): void {
    this.assertUsable();
    if (!Number.isFinite(delta) || delta < 0) {
      throw new RangeError('Combat impact mark delta must be a finite, non-negative number.');
    }
    if (delta > 0) {
      this.agePool(this.bulletPool, delta);
      this.agePool(this.scorchPool, delta);
    }
    this.syncPool(this.bulletPool);
    this.syncPool(this.scorchPool);
  }

  /** Returns every active mark to its existing slot without releasing resources. */
  clear(): void {
    this.assertUsable();
    this.clearPool(this.bulletPool);
    this.clearPool(this.scorchPool);
  }

  getStats(): CombatImpactMarksStats {
    const bullets = this.activeCount(this.bulletPool);
    const scorches = this.activeCount(this.scorchPool);
    return {
      active: { bullets, scorches },
      capacity: this.capacities,
      drawCalls: (bullets > 0 ? 1 : 0) + (scorches > 0 ? 1 : 0),
      resources: {
        geometries: this.disposed ? 0 : 1,
        materials: this.disposed ? 0 : 2,
        textures: this.disposed ? 0 : 2,
      },
    };
  }

  /** Idempotently detaches the owned subtree and releases each shared resource once. */
  dispose(): void {
    if (this.disposed) return;
    this.clearPool(this.bulletPool);
    this.clearPool(this.scorchPool);
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.geometry.dispose();
    this.bulletMaterial.dispose();
    this.scorchMaterial.dispose();
    this.bulletTexture.dispose();
    this.scorchTexture.dispose();
  }

  private emit(
    pool: MarkPool,
    point: CombatImpactMarkVector,
    normal: CombatImpactMarkVector,
    options: ImpactMarkEmissionOptions,
    defaultRadius: number,
    defaultLifetime: number,
    offset: number,
  ): boolean {
    this.assertUsable();
    this.validatePoint(point);
    const radius = finitePositive(options.radius, defaultRadius, 'Impact mark radius');
    const lifetime = finitePositive(options.lifetime, defaultLifetime, 'Impact mark lifetime');
    this.normal.set(normal.x, normal.y, normal.z);
    const normalLengthSquared = this.normal.lengthSq();
    if (!Number.isFinite(normalLengthSquared) || normalLengthSquared <= 1e-10) {
      throw new RangeError('Impact mark normal must contain finite values and have non-zero length.');
    }
    if (pool.slots.length === 0) return false;

    this.normal.multiplyScalar(1 / Math.sqrt(normalLengthSquared));
    const slot = pool.slots[pool.cursor];
    pool.cursor = (pool.cursor + 1) % pool.slots.length;
    this.orientation.setFromUnitVectors(PLANE_NORMAL, this.normal);
    this.roll.setFromAxisAngle(this.normal, this.random() * Math.PI * 2);
    this.orientation.premultiply(this.roll).normalize();
    const sizeVariation = .9 + this.random() * .2;

    slot.x = point.x + this.normal.x * offset;
    slot.y = point.y + this.normal.y * offset;
    slot.z = point.z + this.normal.z * offset;
    slot.qx = this.orientation.x;
    slot.qy = this.orientation.y;
    slot.qz = this.orientation.z;
    slot.qw = this.orientation.w;
    slot.radius = radius * sizeVariation;
    slot.age = 0;
    slot.lifetime = lifetime;
    slot.active = true;
    this.syncPool(pool);
    return true;
  }

  private syncPool(pool: MarkPool): void {
    let active = 0;
    for (const slot of pool.slots) {
      if (!slot.active) continue;
      this.position.set(slot.x, slot.y, slot.z);
      this.orientation.set(slot.qx, slot.qy, slot.qz, slot.qw);
      this.scale.set(slot.radius, slot.radius, 1);
      this.matrix.compose(this.position, this.orientation, this.scale);
      pool.mesh.setMatrixAt(active, this.matrix);
      active++;
    }
    pool.mesh.count = active;
    pool.mesh.visible = active > 0;
    if (active > 0) pool.mesh.instanceMatrix.needsUpdate = true;
  }

  private agePool(pool: MarkPool, delta: number): void {
    for (const slot of pool.slots) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= slot.lifetime) slot.active = false;
    }
  }

  private clearPool(pool: MarkPool): void {
    for (const slot of pool.slots) {
      slot.active = false;
      slot.age = 0;
    }
    pool.cursor = 0;
    pool.mesh.count = 0;
    pool.mesh.visible = false;
  }

  private activeCount(pool: MarkPool): number {
    let count = 0;
    for (const slot of pool.slots) if (slot.active) count++;
    return count;
  }

  private validatePoint(point: CombatImpactMarkVector): void {
    if (!Number.isFinite(point.x)) throw new RangeError('Impact mark point.x must be finite.');
    if (!Number.isFinite(point.y)) throw new RangeError('Impact mark point.y must be finite.');
    if (!Number.isFinite(point.z)) throw new RangeError('Impact mark point.z must be finite.');
  }

  private random(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 4294967296;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('CombatImpactMarks has already been disposed.');
  }
}

export function createCombatImpactMarks(
  parent: THREE.Object3D,
  options: CombatImpactMarksOptions = {},
): CombatImpactMarks {
  return new CombatImpactMarks(parent, options);
}
