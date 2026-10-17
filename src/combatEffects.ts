import * as THREE from 'three';

/** Minimal vector shape accepted by all emission methods. */
export interface CombatEffectVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CombatEffectCapacities {
  tracers: number;
  sparks: number;
  chips: number;
  dust: number;
  smoke: number;
  explosionFlashes: number;
  shockRings: number;
}

export interface CombatEffectsOptions {
  capacities?: Partial<CombatEffectCapacities>;
  /** Seed for repeatable particle spread. */
  seed?: number;
  /** Lets an integration identify the owned subtree in scene tools. */
  rootName?: string;
}

export interface TracerOptions {
  /** World-space beam width. */
  width?: number;
  /** Seconds before the streak is returned to the pool. */
  lifetime?: number;
}

/** Presentation palette only. Damage, hit zones and gameplay remain unchanged. */
export type ImpactSurface = 'snow' | 'concrete' | 'metal' | 'flesh';

export interface ImpactOptions {
  sparkCount?: number;
  chipCount?: number;
  dustCount?: number;
  smokeCount?: number;
  /** Multiplier for particle size and launch velocity. */
  scale?: number;
  /** Multiplier for each particle's authored lifetime. */
  lifetime?: number;
  /** Selects color and motion without changing represented particle counts. */
  surface?: ImpactSurface;
}

export interface ExplosionOptions {
  /** Approximate world-space blast radius used by the presentation. */
  radius?: number;
  sparkCount?: number;
  chipCount?: number;
  dustCount?: number;
  smokeCount?: number;
  /** Multiplier for all explosion layer lifetimes. */
  lifetime?: number;
}

export interface CombatEmissionCounts {
  sparks: number;
  chips: number;
  dust: number;
  smoke: number;
}

export interface CombatEffectsStats {
  readonly active: Readonly<CombatEffectCapacities>;
  readonly capacity: Readonly<CombatEffectCapacities>;
  readonly resources: {
    readonly geometries: number;
    readonly materials: number;
    readonly textures: number;
  };
  readonly render: {
    /** Fixed renderer families owned by this presentation. */
    readonly batches: number;
    /** Families that currently submit at least one compacted instance. */
    readonly activeBatches: number;
    /** Triangles submitted by active compacted instances in one world pass. */
    readonly submittedTriangles: number;
  };
}

type ParticleKind = 'spark' | 'chip' | 'dust' | 'smoke';

interface TracerSlot {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  age: number;
  lifetime: number;
  length: number;
  width: number;
  active: boolean;
}

interface ParticleSlot {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly spin: THREE.Vector3;
  readonly rotation: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
  readonly color: THREE.Color;
  readonly kind: ParticleKind;
  age: number;
  lifetime: number;
  size: number;
  growth: number;
  drag: number;
  gravity: number;
  active: boolean;
}

interface FlashSlot {
  readonly position: THREE.Vector3;
  readonly color: THREE.Color;
  age: number;
  lifetime: number;
  radius: number;
  active: boolean;
}

interface RingSlot {
  readonly position: THREE.Vector3;
  readonly color: THREE.Color;
  age: number;
  lifetime: number;
  radius: number;
  active: boolean;
}

interface RenderBatch {
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
  readonly trianglesPerInstance: number;
}

interface SurfaceProfile {
  readonly spark: THREE.Color;
  readonly chip: THREE.Color;
  readonly dust: THREE.Color;
  readonly smoke: THREE.Color;
  readonly sparkSpeed: number;
  readonly chipSpeed: number;
  readonly dustSpeed: number;
  readonly smokeSpeed: number;
  readonly sparkSize: number;
  readonly chipSize: number;
  readonly dustSize: number;
  readonly smokeSize: number;
  readonly dustRise: number;
  readonly smokeRise: number;
}

const DEFAULT_CAPACITIES: CombatEffectCapacities = {
  tracers: 48,
  sparks: 96,
  chips: 48,
  dust: 40,
  smoke: 48,
  explosionFlashes: 12,
  shockRings: 12,
};

const SURFACE_PROFILES: Readonly<Record<ImpactSurface, SurfaceProfile>> = Object.freeze({
  concrete: Object.freeze({
    spark: new THREE.Color(0xffc45a), chip: new THREE.Color(0x8a8271),
    dust: new THREE.Color(0xb7aa90), smoke: new THREE.Color(0x747d7a),
    sparkSpeed: 1, chipSpeed: 1, dustSpeed: 1, smokeSpeed: 1,
    sparkSize: 1, chipSize: 1, dustSize: 1, smokeSize: 1,
    dustRise: 1, smokeRise: 1,
  }),
  snow: Object.freeze({
    spark: new THREE.Color(0xffd89a), chip: new THREE.Color(0xd5e0e2),
    dust: new THREE.Color(0xe5eff1), smoke: new THREE.Color(0xa9b8ba),
    sparkSpeed: .56, chipSpeed: .72, dustSpeed: 1.2, smokeSpeed: .82,
    sparkSize: .72, chipSize: .82, dustSize: 1.34, smokeSize: 1.08,
    dustRise: 1.28, smokeRise: .82,
  }),
  metal: Object.freeze({
    spark: new THREE.Color(0xfff1bd), chip: new THREE.Color(0x333b3e),
    dust: new THREE.Color(0x859296), smoke: new THREE.Color(0x414b50),
    sparkSpeed: 1.42, chipSpeed: 1.18, dustSpeed: .62, smokeSpeed: .64,
    sparkSize: 1.16, chipSize: .78, dustSize: .68, smokeSize: .78,
    dustRise: .62, smokeRise: .7,
  }),
  flesh: Object.freeze({
    spark: new THREE.Color(0x9d2d2b), chip: new THREE.Color(0x512321),
    dust: new THREE.Color(0x7f2929), smoke: new THREE.Color(0x472326),
    sparkSpeed: .42, chipSpeed: .55, dustSpeed: .7, smokeSpeed: .72,
    sparkSize: .64, chipSize: .7, dustSize: .88, smokeSize: .82,
    dustRise: .76, smokeRise: .78,
  }),
});

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DEFAULT_NORMAL: CombatEffectVector = { x: 0, y: 1, z: 0 };
const WHITE = new THREE.Color(0xffffff);
const TRACER_CORE_COLOR = new THREE.Color(0xfff1a8);
const TRACER_GLOW_COLOR = new THREE.Color(0xff9b38);
const ZERO_SCALE = new THREE.Vector3(0, 0, 0);
const IDENTITY_QUATERNION = new THREE.Quaternion();
const ZERO_MATRIX = new THREE.Matrix4().compose(new THREE.Vector3(), IDENTITY_QUATERNION, ZERO_SCALE);

function finitePositive(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero.`);
  }
  return resolved;
}

function emissionCount(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new RangeError(`${label} must be a finite number at least zero.`);
  }
  return Math.floor(resolved);
}

function capacity(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new RangeError(`${label} capacity must be a non-negative integer.`);
  }
  return resolved;
}

function impactSurface(value: ImpactSurface | undefined): ImpactSurface {
  const resolved = value ?? 'concrete';
  if (!(resolved in SURFACE_PROFILES)) throw new RangeError(`Unknown impact surface: ${String(resolved)}.`);
  return resolved;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

function radialTexture(size = 64): THREE.DataTexture {
  const bytes = new Uint8Array(size * size * 4);
  const center = (size - 1) * .5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const angle = Math.atan2(dy, dx);
      const wobble = 1 + Math.sin(angle * 5 + .8) * .055 + Math.sin(angle * 9 - .35) * .025;
      const distance = Math.hypot(dx, dy) / wobble;
      const alpha = Math.max(0, 1 - distance);
      const eased = alpha * alpha * (3 - 2 * alpha);
      const offset = (y * size + x) * 4;
      bytes[offset] = 255;
      bytes[offset + 1] = 255;
      bytes[offset + 2] = 255;
      bytes[offset + 3] = Math.round(eased * 255);
    }
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.name = 'combat-vfx-irregular-soft-disc';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createHotLobeGeometry(): THREE.BufferGeometry {
  const source = new THREE.IcosahedronGeometry(1, 0);
  const expanded = source.index ? source.toNonIndexed() : source.clone();
  const attribute = expanded.getAttribute('position');
  const lobes = [
    { offset: [-.18, -.04, .02], scale: [1, .82, .88] },
    { offset: [.2, .08, -.06], scale: [.72, .96, .78] },
    { offset: [.02, .28, .12], scale: [.62, .68, .7] },
  ] as const;
  const positions = new Float32Array(attribute.count * lobes.length * 3);
  let cursor = 0;
  for (const lobe of lobes) {
    for (let index = 0; index < attribute.count; index++) {
      positions[cursor++] = attribute.getX(index) * lobe.scale[0] + lobe.offset[0];
      positions[cursor++] = attribute.getY(index) * lobe.scale[1] + lobe.offset[1];
      positions[cursor++] = attribute.getZ(index) * lobe.scale[2] + lobe.offset[2];
    }
  }
  source.dispose();
  expanded.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'CombatExplosionHotLobesGeometry';
  return geometry;
}

function createBillboardMaterial(
  name: string,
  texture: THREE.Texture,
  color: THREE.ColorRepresentation,
  opacity: number,
  blending: THREE.Blending = THREE.NormalBlending,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name, uniforms:{
      uMap:{value:texture},
      uTint:{value:new THREE.Color(color)},
      uOpacity:{value:opacity},
    },
    vertexShader:/* glsl */`
      varying vec2 vUv;
      varying vec3 vInstanceColor;
      void main(){
        vUv=uv;vInstanceColor=instanceColor;
        vec4 center=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
        float scaleX=length(instanceMatrix[0].xyz);
        float scaleY=length(instanceMatrix[1].xyz);
        float angle=atan(instanceMatrix[0].y,instanceMatrix[0].x);
        float cosine=cos(angle);float sine=sin(angle);
        vec2 local=vec2(position.x*cosine-position.y*sine,position.x*sine+position.y*cosine);
        center.xy+=local*vec2(scaleX,scaleY);
        gl_Position=projectionMatrix*center;
      }
    `,
    fragmentShader:/* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uTint;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vInstanceColor;
      void main(){
        float alpha=texture2D(uMap,vUv).a*uOpacity;
        if(alpha<=0.001)discard;
        gl_FragColor=vec4(uTint*vInstanceColor,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending,
  });
  // These cards are camera-oriented in clip space, so their geometric normal
  // is not meaningful. Render both windings in a single pass to avoid a
  // driver-dependent culling disappearance without doubling submissions.
  material.forceSinglePass = true;
  return material;
}

function createBatch(
  root: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  renderOrder: number,
): RenderBatch {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.count = 0;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.combatEffectBatch = true;
  for (let index = 0; index < count; index++) {
    mesh.setMatrixAt(index, ZERO_MATRIX);
    mesh.setColorAt(index, WHITE);
  }
  mesh.instanceMatrix.needsUpdate = count > 0;
  mesh.instanceColor.needsUpdate = count > 0;
  root.add(mesh);
  return { mesh, trianglesPerInstance: triangleCount(geometry) };
}

/**
 * Fixed-capacity combat presentation. Seven numeric ring buffers compact into
 * nine stable InstancedMesh families; emissions never allocate render objects
 * or GPU resources and active cost depends on represented instances only.
 */
export class CombatEffects {
  readonly root = new THREE.Group();
  readonly capacities: Readonly<CombatEffectCapacities>;

  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly batches: RenderBatch[] = [];
  private readonly tracers: TracerSlot[] = [];
  private readonly sparks: ParticleSlot[] = [];
  private readonly chips: ParticleSlot[] = [];
  private readonly dust: ParticleSlot[] = [];
  private readonly smoke: ParticleSlot[] = [];
  private readonly flashes: FlashSlot[] = [];
  private readonly rings: RingSlot[] = [];
  private readonly cursors: Record<keyof CombatEffectCapacities, number> = {
    tracers: 0, sparks: 0, chips: 0, dust: 0, smoke: 0, explosionFlashes: 0, shockRings: 0,
  };

  private tracerCoreBatch!: RenderBatch;
  private tracerGlowBatch!: RenderBatch;
  private sparkBatch!: RenderBatch;
  private chipBatch!: RenderBatch;
  private dustBatch!: RenderBatch;
  private smokeBatch!: RenderBatch;
  private flashBatch!: RenderBatch;
  private haloBatch!: RenderBatch;
  private ringBatch!: RenderBatch;

  private readonly direction = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  private randomState: number;
  private disposed = false;

  constructor(parent: THREE.Object3D, options: CombatEffectsOptions = {}) {
    const requested = options.capacities ?? {};
    this.capacities = Object.freeze({
      tracers: capacity(requested.tracers, DEFAULT_CAPACITIES.tracers, 'tracers'),
      sparks: capacity(requested.sparks, DEFAULT_CAPACITIES.sparks, 'sparks'),
      chips: capacity(requested.chips, DEFAULT_CAPACITIES.chips, 'chips'),
      dust: capacity(requested.dust, DEFAULT_CAPACITIES.dust, 'dust'),
      smoke: capacity(requested.smoke, DEFAULT_CAPACITIES.smoke, 'smoke'),
      explosionFlashes: capacity(requested.explosionFlashes, DEFAULT_CAPACITIES.explosionFlashes, 'explosionFlashes'),
      shockRings: capacity(requested.shockRings, DEFAULT_CAPACITIES.shockRings, 'shockRings'),
    });
    this.randomState = (options.seed ?? 0x6d2b79f5) >>> 0 || 0x6d2b79f5;
    this.root.name = options.rootName ?? 'combat-effects';
    this.root.userData.fixedRenderBatches = 9;
    parent.add(this.root);
    this.buildPools();
  }

  /** Emits a camera-independent tapered streak. Returns false for a zero-length shot or disabled pool. */
  emitTracer(start: CombatEffectVector, end: CombatEffectVector, options: TracerOptions = {}): boolean {
    this.assertUsable();
    this.direction.set(end.x - start.x, end.y - start.y, end.z - start.z);
    const length = this.direction.length();
    if (length <= 1e-5) return false;
    const lifetime = finitePositive(options.lifetime, .075, 'Tracer lifetime');
    const width = finitePositive(options.width, .035, 'Tracer width');
    const slot = this.acquire(this.tracers, 'tracers');
    if (!slot) return false;
    slot.age = 0;
    slot.lifetime = lifetime;
    slot.width = width;
    slot.length = length;
    slot.active = true;
    slot.position.set((start.x + end.x) * .5, (start.y + end.y) * .5, (start.z + end.z) * .5);
    this.direction.multiplyScalar(1 / length);
    slot.quaternion.setFromUnitVectors(UP, this.direction);
    this.syncTracers();
    return true;
  }

  /** Emits surface-aware ricochet streaks, debris and two atmospheric layers. */
  emitImpact(
    point: CombatEffectVector,
    normal: CombatEffectVector = DEFAULT_NORMAL,
    options: ImpactOptions = {},
  ): CombatEmissionCounts {
    this.assertUsable();
    const scale = finitePositive(options.scale, 1, 'Impact scale');
    const lifetime = finitePositive(options.lifetime, 1, 'Impact lifetime');
    const sparkCount = emissionCount(options.sparkCount, 8, 'Spark count');
    const chipCount = emissionCount(options.chipCount, 3, 'Chip count');
    const dustCount = emissionCount(options.dustCount, 3, 'Dust count');
    const smokeCount = emissionCount(options.smokeCount, 1, 'Smoke count');
    const profile = SURFACE_PROFILES[impactSurface(options.surface)];
    this.setNormal(normal);
    const counts: CombatEmissionCounts = {
      sparks: this.emitParticles(this.sparks, 'sparks', sparkCount, point, scale, lifetime, profile),
      chips: this.emitParticles(this.chips, 'chips', chipCount, point, scale, lifetime, profile),
      dust: this.emitParticles(this.dust, 'dust', dustCount, point, scale, lifetime, profile),
      smoke: this.emitParticles(this.smoke, 'smoke', smokeCount, point, scale, lifetime, profile),
    };
    this.syncParticles();
    return counts;
  }

  /** Emits irregular hot lobes, an expanding halo/ring and a dense impact plume. */
  emitExplosion(point: CombatEffectVector, options: ExplosionOptions = {}): CombatEmissionCounts {
    this.assertUsable();
    const radius = finitePositive(options.radius, 3.2, 'Explosion radius');
    const lifetime = finitePositive(options.lifetime, 1, 'Explosion lifetime');
    const sparkCount = emissionCount(options.sparkCount, 20, 'Spark count');
    const chipCount = emissionCount(options.chipCount, 8, 'Chip count');
    const dustCount = emissionCount(options.dustCount, 10, 'Dust count');
    const smokeCount = emissionCount(options.smokeCount, 8, 'Smoke count');
    const flash = this.acquire(this.flashes, 'explosionFlashes');
    if (flash) {
      flash.age = 0;
      flash.lifetime = .24 * lifetime;
      flash.radius = radius;
      flash.active = true;
      flash.position.set(point.x, point.y + radius * .12, point.z);
      flash.color.setHSL(.055 + this.random() * .025, 1, .55 + this.random() * .08);
    }
    const ring = this.acquire(this.rings, 'shockRings');
    if (ring) {
      ring.age = 0;
      ring.lifetime = .5 * lifetime;
      ring.radius = radius;
      ring.active = true;
      ring.position.set(point.x, point.y + .025, point.z);
      ring.color.set(0xffaa4c);
    }
    const counts = this.emitImpact(point, DEFAULT_NORMAL, {
      sparkCount, chipCount, dustCount, smokeCount,
      scale: Math.max(.4, radius * .55), lifetime, surface: 'concrete',
    });
    this.syncFlashes();
    this.syncRings();
    return counts;
  }

  /** Advances and compacts active slots into the fixed renderer families. */
  update(delta: number): void {
    this.assertUsable();
    if (!Number.isFinite(delta) || delta < 0) {
      throw new RangeError('CombatEffects delta must be a finite, non-negative number.');
    }
    if (delta === 0) return;
    this.updateTracers(delta);
    this.updateParticles(this.sparks, delta);
    this.updateParticles(this.chips, delta);
    this.updateParticles(this.dust, delta);
    this.updateParticles(this.smoke, delta);
    this.updateFlashes(delta);
    this.updateRings(delta);
    this.syncAll();
  }

  getStats(): CombatEffectsStats {
    return {
      active: {
        tracers: this.activeCount(this.tracers), sparks: this.activeCount(this.sparks),
        chips: this.activeCount(this.chips), dust: this.activeCount(this.dust),
        smoke: this.activeCount(this.smoke), explosionFlashes: this.activeCount(this.flashes),
        shockRings: this.activeCount(this.rings),
      },
      capacity: this.capacities,
      resources: {
        geometries: this.geometries.size,
        materials: this.materials.size,
        textures: this.textures.size,
      },
      render: {
        batches: this.disposed ? 0 : this.batches.length,
        activeBatches: this.batches.reduce((count, batch) => count + (batch.mesh.count > 0 ? 1 : 0), 0),
        submittedTriangles: this.batches.reduce(
          (total, batch) => total + batch.mesh.count * batch.trianglesPerInstance,
          0,
        ),
      },
    };
  }

  /** Clears every active effect while retaining the fixed pools and GPU resources for reuse. */
  clear(): void {
    this.assertUsable();
    for (const pool of [this.tracers, this.sparks, this.chips, this.dust, this.smoke, this.flashes, this.rings]) {
      for (const slot of pool) {
        slot.active = false;
        slot.age = 0;
      }
    }
    for (const key of Object.keys(this.cursors) as Array<keyof CombatEffectCapacities>) this.cursors[key] = 0;
    this.syncAll();
  }

  /** Idempotently detaches the subtree and releases every shared GPU resource once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pool of [this.tracers, this.sparks, this.chips, this.dust, this.smoke, this.flashes, this.rings]) {
      for (const slot of pool) slot.active = false;
    }
    for (const batch of this.batches) {
      batch.mesh.count = 0;
      batch.mesh.visible = false;
      batch.mesh.dispose();
    }
    this.root.removeFromParent();
    this.root.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
  }

  private buildPools(): void {
    const softDisc = radialTexture();
    this.textures.add(softDisc);
    const tracerGeometry = new THREE.CylinderGeometry(.08, .58, 1, 8, 1, true);
    const sparkGeometry = new THREE.ConeGeometry(1, 1, 5, 1, true);
    const chipGeometry = new THREE.TetrahedronGeometry(1, 0);
    const billboardGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    const flashGeometry = createHotLobeGeometry();
    const ringGeometry = new THREE.TorusGeometry(1, .026, 4, 32);
    ringGeometry.rotateX(Math.PI * .5);
    for (const geometry of [tracerGeometry, sparkGeometry, chipGeometry, billboardGeometry, flashGeometry, ringGeometry]) {
      this.geometries.add(geometry);
    }

    const tracerCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, vertexColors: true,
    });
    const tracerGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: .24, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, vertexColors: true,
    });
    const sparkMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false,
      toneMapped: false, vertexColors: true, transparent: true, opacity: .96,
    });
    const chipMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: .92, metalness: .08, vertexColors: true,
    });
    const dustMaterial = createBillboardMaterial('CombatDustBillboards', softDisc, 0xffffff, .27);
    const smokeMaterial = createBillboardMaterial('CombatSmokeBillboards', softDisc, 0xffffff, .18);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: .76, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, vertexColors: true,
    });
    const haloMaterial = createBillboardMaterial(
      'CombatExplosionHaloBillboards', softDisc, 0xffffff, .55, THREE.AdditiveBlending,
    );
    haloMaterial.toneMapped = false;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: .62, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, vertexColors: true, side: THREE.FrontSide,
    });
    for (const material of [
      tracerCoreMaterial, tracerGlowMaterial, sparkMaterial, chipMaterial, dustMaterial,
      smokeMaterial, flashMaterial, haloMaterial, ringMaterial,
    ]) this.materials.add(material);

    this.tracerCoreBatch = this.addBatch('combat-tracer-core-batch', tracerGeometry, tracerCoreMaterial, this.capacities.tracers, 20);
    this.tracerGlowBatch = this.addBatch('combat-tracer-glow-batch', tracerGeometry, tracerGlowMaterial, this.capacities.tracers, 19);
    this.sparkBatch = this.addBatch('combat-spark-batch', sparkGeometry, sparkMaterial, this.capacities.sparks, 18);
    this.chipBatch = this.addBatch('combat-chip-batch', chipGeometry, chipMaterial, this.capacities.chips, 0);
    this.dustBatch = this.addBatch('combat-dust-batch', billboardGeometry, dustMaterial, this.capacities.dust, 7);
    this.smokeBatch = this.addBatch('combat-smoke-batch', billboardGeometry, smokeMaterial, this.capacities.smoke, 8);
    this.flashBatch = this.addBatch('combat-explosion-hot-lobes-batch', flashGeometry, flashMaterial, this.capacities.explosionFlashes, 22);
    this.haloBatch = this.addBatch('combat-explosion-halo-batch', billboardGeometry, haloMaterial, this.capacities.explosionFlashes, 21);
    this.ringBatch = this.addBatch('combat-shock-ring-batch', ringGeometry, ringMaterial, this.capacities.shockRings, 20);

    for (let index = 0; index < this.capacities.tracers; index++) {
      this.tracers.push({
        position: new THREE.Vector3(), quaternion: new THREE.Quaternion(),
        age: 0, lifetime: 0, length: 0, width: 0, active: false,
      });
    }
    this.buildParticlePool(this.sparks, this.capacities.sparks, 'spark');
    this.buildParticlePool(this.chips, this.capacities.chips, 'chip');
    this.buildParticlePool(this.dust, this.capacities.dust, 'dust');
    this.buildParticlePool(this.smoke, this.capacities.smoke, 'smoke');
    for (let index = 0; index < this.capacities.explosionFlashes; index++) {
      this.flashes.push({ position: new THREE.Vector3(), color: new THREE.Color(), age: 0, lifetime: 0, radius: 0, active: false });
    }
    for (let index = 0; index < this.capacities.shockRings; index++) {
      this.rings.push({ position: new THREE.Vector3(), color: new THREE.Color(), age: 0, lifetime: 0, radius: 0, active: false });
    }
  }

  private addBatch(
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    renderOrder: number,
  ): RenderBatch {
    const batch = createBatch(this.root, name, geometry, material, count, renderOrder);
    this.batches.push(batch);
    return batch;
  }

  private buildParticlePool(target: ParticleSlot[], count: number, kind: ParticleKind): void {
    for (let index = 0; index < count; index++) {
      target.push({
        position: new THREE.Vector3(), velocity: new THREE.Vector3(), spin: new THREE.Vector3(),
        rotation: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(),
        color: new THREE.Color(), kind, age: 0, lifetime: 0, size: 0, growth: 0,
        drag: 0, gravity: 0, active: false,
      });
    }
  }

  private emitParticles(
    pool: ParticleSlot[],
    cursor: 'sparks' | 'chips' | 'dust' | 'smoke',
    count: number,
    point: CombatEffectVector,
    scale: number,
    lifetimeScale: number,
    profile: SurfaceProfile,
  ): number {
    const represented = Math.min(count, pool.length);
    for (let index = 0; index < count; index++) {
      const slot = this.acquire(pool, cursor);
      if (!slot) break;
      this.randomHemisphere(this.normal, this.direction);
      slot.active = true;
      slot.age = 0;
      slot.position.set(point.x, point.y, point.z).addScaledVector(this.normal, .025 * scale);
      slot.rotation.set(0, 0, 0);
      slot.quaternion.identity();
      if (slot.kind === 'spark') {
        slot.velocity.copy(this.direction).multiplyScalar((5.5 + this.random() * 8) * scale * profile.sparkSpeed);
        slot.lifetime = (.18 + this.random() * .22) * lifetimeScale;
        slot.size = (.3 + this.random() * .3) * scale * profile.sparkSize;
        slot.growth = 0; slot.drag = 1.2; slot.gravity = 8; slot.color.copy(profile.spark);
        this.alignParticle(slot);
        slot.scale.set(slot.size * .1, slot.size * 1.2, slot.size * .1);
      } else if (slot.kind === 'chip') {
        slot.velocity.copy(this.direction).multiplyScalar((2.2 + this.random() * 4.5) * scale * profile.chipSpeed);
        slot.lifetime = (.45 + this.random() * .5) * lifetimeScale;
        slot.size = (.035 + this.random() * .055) * scale * profile.chipSize;
        slot.growth = 0; slot.drag = .65; slot.gravity = 9.8; slot.color.copy(profile.chip);
        slot.spin.set(this.signedRandom(), this.signedRandom(), this.signedRandom()).multiplyScalar(9);
        slot.scale.setScalar(slot.size);
      } else if (slot.kind === 'dust') {
        slot.velocity.copy(this.direction).multiplyScalar((.45 + this.random() * 1.15) * scale * profile.dustSpeed);
        slot.velocity.y += .35 * scale * profile.dustRise;
        slot.lifetime = (.42 + this.random() * .42) * lifetimeScale;
        slot.size = (.18 + this.random() * .18) * scale * profile.dustSize;
        slot.growth = 2.2; slot.drag = 3.2; slot.gravity = .15; slot.color.copy(profile.dust);
        slot.rotation.z = this.random() * Math.PI * 2;
        slot.scale.setScalar(slot.size);
      } else {
        slot.velocity.copy(this.direction).multiplyScalar((.2 + this.random() * .55) * scale * profile.smokeSpeed);
        slot.velocity.y += (.7 + this.random() * .45) * scale * profile.smokeRise;
        slot.lifetime = (.9 + this.random() * .8) * lifetimeScale;
        slot.size = (.25 + this.random() * .25) * scale * profile.smokeSize;
        slot.growth = 3.5; slot.drag = 1.4; slot.gravity = -.06; slot.color.copy(profile.smoke);
        slot.rotation.z = this.random() * Math.PI * 2;
        slot.scale.setScalar(slot.size);
      }
    }
    return represented;
  }

  private updateTracers(delta: number): void {
    for (const slot of this.tracers) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= slot.lifetime) slot.active = false;
    }
  }

  private updateParticles(pool: ParticleSlot[], delta: number): void {
    for (const slot of pool) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= slot.lifetime) { slot.active = false; continue; }
      const progress = slot.age / slot.lifetime;
      const damping = Math.exp(-slot.drag * delta);
      slot.velocity.multiplyScalar(damping);
      slot.velocity.y -= slot.gravity * delta;
      slot.position.addScaledVector(slot.velocity, delta);
      if (slot.kind === 'spark') {
        this.alignParticle(slot);
        const length = slot.size * Math.max(.12, 1 - progress);
        slot.scale.set(length * .1, length * 1.2, length * .1);
      } else if (slot.kind === 'chip') {
        slot.rotation.addScaledVector(slot.spin, delta);
        this.euler.set(slot.rotation.x, slot.rotation.y, slot.rotation.z);
        slot.quaternion.setFromEuler(this.euler);
        slot.scale.setScalar(slot.size * Math.min(1, (1 - progress) * 4));
      } else {
        const tail = Math.min(1, (1 - progress) * 3.5);
        // Atmospheric cards must not all appear full-size at the emission
        // origin: their overlap would briefly read as an opaque dark disk.
        const emergence = Math.pow(Math.min(1, progress * (slot.kind === 'smoke' ? 3 : 5)),3);
        const size = slot.size * (1 + progress * slot.growth) * tail * emergence;
        slot.rotation.z += (slot.kind === 'smoke' ? .2 : .45) * delta;
        slot.quaternion.setFromAxisAngle(Z_AXIS, slot.rotation.z);
        slot.scale.setScalar(size);
      }
    }
  }

  private updateFlashes(delta: number): void {
    for (const slot of this.flashes) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= slot.lifetime) slot.active = false;
    }
  }

  private updateRings(delta: number): void {
    for (const slot of this.rings) {
      if (!slot.active) continue;
      slot.age += delta;
      if (slot.age >= slot.lifetime) slot.active = false;
    }
  }

  private syncAll(): void {
    this.syncTracers();
    this.syncParticles();
    this.syncFlashes();
    this.syncRings();
  }

  private syncTracers(): void {
    let compact = 0;
    for (const slot of this.tracers) {
      if (!slot.active) continue;
      const progress = slot.age / slot.lifetime;
      const fade = Math.min(1, (1 - progress) * 2.8);
      const width = slot.width * (.4 + fade * .6);
      this.scale.set(width, slot.length, width);
      this.matrix.compose(slot.position, slot.quaternion, this.scale);
      this.tracerCoreBatch.mesh.setMatrixAt(compact, this.matrix);
      this.tracerCoreBatch.mesh.setColorAt(compact, TRACER_CORE_COLOR);
      this.scale.set(width * 2.8, slot.length * (1 + progress * .06), width * 2.8);
      this.matrix.compose(slot.position, slot.quaternion, this.scale);
      this.tracerGlowBatch.mesh.setMatrixAt(compact, this.matrix);
      this.tracerGlowBatch.mesh.setColorAt(compact, TRACER_GLOW_COLOR);
      compact++;
    }
    this.finishBatch(this.tracerCoreBatch, compact);
    this.finishBatch(this.tracerGlowBatch, compact);
  }

  private syncParticles(): void {
    this.syncParticlePool(this.sparks, this.sparkBatch);
    this.syncParticlePool(this.chips, this.chipBatch);
    this.syncParticlePool(this.dust, this.dustBatch);
    this.syncParticlePool(this.smoke, this.smokeBatch);
  }

  private syncParticlePool(pool: readonly ParticleSlot[], batch: RenderBatch): void {
    let compact = 0;
    for (const slot of pool) {
      if (!slot.active) continue;
      this.matrix.compose(slot.position, slot.quaternion, slot.scale);
      batch.mesh.setMatrixAt(compact, this.matrix);
      batch.mesh.setColorAt(compact, slot.color);
      compact++;
    }
    this.finishBatch(batch, compact);
  }

  private syncFlashes(): void {
    let compact = 0;
    for (const slot of this.flashes) {
      if (!slot.active) continue;
      const progress = slot.age / slot.lifetime;
      const bloom = 1 - Math.pow(1 - progress, 3);
      const fade = Math.min(1, (1 - progress) * 4);
      this.scale.setScalar(slot.radius * (.08 + bloom * .18) * fade);
      this.matrix.compose(slot.position, IDENTITY_QUATERNION, this.scale);
      this.flashBatch.mesh.setMatrixAt(compact, this.matrix);
      this.flashBatch.mesh.setColorAt(compact, slot.color);
      this.scale.setScalar(slot.radius * (.3 + bloom * .72) * fade);
      this.quaternion.setFromAxisAngle(Z_AXIS, progress * .7);
      this.matrix.compose(slot.position, this.quaternion, this.scale);
      this.haloBatch.mesh.setMatrixAt(compact, this.matrix);
      this.haloBatch.mesh.setColorAt(compact, slot.color);
      compact++;
    }
    this.finishBatch(this.flashBatch, compact);
    this.finishBatch(this.haloBatch, compact);
  }

  private syncRings(): void {
    let compact = 0;
    for (const slot of this.rings) {
      if (!slot.active) continue;
      const progress = slot.age / slot.lifetime;
      const expansion = 1 - Math.pow(1 - progress, 2.4);
      const fade = Math.min(1, (1 - progress) * 3);
      this.scale.setScalar(slot.radius * (.04 + expansion) * fade);
      this.matrix.compose(slot.position, IDENTITY_QUATERNION, this.scale);
      this.ringBatch.mesh.setMatrixAt(compact, this.matrix);
      this.ringBatch.mesh.setColorAt(compact, slot.color);
      compact++;
    }
    this.finishBatch(this.ringBatch, compact);
  }

  private finishBatch(batch: RenderBatch, count: number): void {
    const previousCount = batch.mesh.count;
    // Keep retired GPU slots explicitly inert as well as outside the compacted
    // draw range. This makes lifecycle state safe even if a renderer/backend
    // reads a stale instance range while buffers are being updated.
    for (let index = count; index < previousCount; index++) batch.mesh.setMatrixAt(index, ZERO_MATRIX);
    batch.mesh.count = count;
    batch.mesh.visible = count > 0;
    if (count > 0 || previousCount > 0) {
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (count > 0) batch.mesh.instanceColor!.needsUpdate = true;
    }
  }

  private alignParticle(slot: ParticleSlot): void {
    const lengthSq = slot.velocity.lengthSq();
    if (lengthSq <= 1e-8) return;
    this.scratch.copy(slot.velocity).multiplyScalar(1 / Math.sqrt(lengthSq));
    slot.quaternion.setFromUnitVectors(UP, this.scratch);
  }

  private setNormal(value: CombatEffectVector): void {
    this.normal.set(value.x, value.y, value.z);
    const lengthSq = this.normal.lengthSq();
    if (!Number.isFinite(lengthSq) || lengthSq <= 1e-8) this.normal.copy(UP);
    else this.normal.multiplyScalar(1 / Math.sqrt(lengthSq));
  }

  private randomHemisphere(normal: THREE.Vector3, target: THREE.Vector3): void {
    do target.set(this.signedRandom(), this.random(), this.signedRandom());
    while (target.lengthSq() <= 1e-5);
    target.normalize();
    if (target.dot(normal) < 0) target.negate();
  }

  private random(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 4294967296;
  }

  private signedRandom(): number { return this.random() * 2 - 1; }

  private acquire<T>(pool: T[], cursor: keyof CombatEffectCapacities): T | undefined {
    if (pool.length === 0) return undefined;
    const index = this.cursors[cursor];
    this.cursors[cursor] = (index + 1) % pool.length;
    return pool[index];
  }

  private activeCount<T extends { active: boolean }>(pool: readonly T[]): number {
    let count = 0;
    for (const item of pool) if (item.active) count++;
    return count;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('CombatEffects has already been disposed.');
  }
}
