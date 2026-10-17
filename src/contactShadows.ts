import * as THREE from 'three';

/** Minimal world-position shape accepted without requiring a THREE.Vector3. */
export interface ContactShadowVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ContactShadowTarget {
  /** World-space ground/contact position. */
  readonly position: ContactShadowVector;
  /** World-space radius of the soft shadow disc. */
  readonly radius: number;
  /** Per-target multiplier, clamped to the range 0..1. */
  readonly opacity?: number;
  readonly visible?: boolean;
}

export interface ContactShadowOptions {
  /** Overrides target.position.y when every target shares one ground plane. */
  readonly groundY?: number;
  /** Prevents depth fighting with the ground surface. */
  readonly yOffset?: number;
  /** Maximum alpha before per-target and distance fading. */
  readonly opacity?: number;
  readonly color?: THREE.ColorRepresentation;
  /** Camera distance at which fading begins. */
  readonly fadeStart?: number;
  /** Camera distance at which a shadow becomes fully transparent. */
  readonly fadeEnd?: number;
  readonly name?: string;
  readonly renderOrder?: number;
  /** Resolution of the one generated radial alpha texture. */
  readonly textureSize?: number;
}

export interface ContactShadowStats {
  readonly capacity: number;
  readonly submitted: number;
  readonly active: number;
  readonly clipped: number;
  readonly drawCalls: number;
}

interface MutableContactShadowStats {
  capacity: number;
  submitted: number;
  active: number;
  clipped: number;
  drawCalls: number;
}

const DEFAULT_Y_OFFSET = .018;
const DEFAULT_OPACITY = .38;
const DEFAULT_FADE_START = 34;
const DEFAULT_FADE_END = 62;
const IDENTITY_QUATERNION = new THREE.Quaternion();

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function finiteAtLeast(value: number, minimum: number, label: string): number {
  finite(value, label);
  if (value < minimum) throw new RangeError(`${label} must be at least ${minimum}.`);
  return value;
}

function normalizedOpacity(value: number, label: string): number {
  finite(value, label);
  return THREE.MathUtils.clamp(value, 0, 1);
}

function createRadialAlphaTexture(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) * .5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center) / center;
      const inner = THREE.MathUtils.clamp(1 - distance, 0, 1);
      // A broad opaque core and smooth cubic edge read as contact occlusion
      // without the hard boundary of a conventional transparent plane.
      const alpha = inner * inner * (3 - 2 * inner);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'ContactShadowRadialAlpha';
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createMaterial(texture: THREE.DataTexture, color: THREE.Color): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: 'ContactShadowMaterial',
    uniforms: {
      shadowMap: { value: texture },
      shadowColor: { value: color },
    },
    vertexShader: /* glsl */`
      attribute float instanceOpacity;
      varying vec2 vShadowUv;
      varying float vShadowOpacity;

      void main() {
        vShadowUv = uv;
        vShadowOpacity = instanceOpacity;
        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D shadowMap;
      uniform vec3 shadowColor;
      varying vec2 vShadowUv;
      varying float vShadowOpacity;

      void main() {
        float alpha = texture2D(shadowMap, vShadowUv).a * vShadowOpacity;
        if (alpha <= 0.001) discard;
        gl_FragColor = vec4(shadowColor, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.blending = THREE.NormalBlending;
  return material;
}

/**
 * Fixed-capacity soft contact shadows for moving soldiers and pickups.
 *
 * Updates rewrite preallocated instance buffers and retain a single draw batch.
 * Hidden, transparent and distance-faded targets are compacted out before the
 * capacity limit is applied, so useful shadows are not displaced by empty slots.
 */
export class ContactShadows {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly stats: Readonly<ContactShadowStats>;

  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly texture: THREE.DataTexture;
  private readonly instanceOpacity: THREE.InstancedBufferAttribute;
  private readonly mutableStats: MutableContactShadowStats;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly groundY: number | undefined;
  private readonly yOffset: number;
  private readonly opacity: number;
  private readonly fadeStartSquared: number;
  private readonly fadeEndSquared: number;
  private readonly fadeEnd: number;
  private readonly inverseFadeRange: number;
  private disposed = false;

  constructor(parent: THREE.Object3D, capacity: number, options: ContactShadowOptions = {}) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new RangeError('capacity must be a non-negative integer.');
    }

    const yOffset = finite(options.yOffset ?? DEFAULT_Y_OFFSET, 'yOffset');
    const opacity = normalizedOpacity(options.opacity ?? DEFAULT_OPACITY, 'opacity');
    const fadeStart = finiteAtLeast(options.fadeStart ?? DEFAULT_FADE_START, 0, 'fadeStart');
    const fadeEnd = finiteAtLeast(options.fadeEnd ?? DEFAULT_FADE_END, 0, 'fadeEnd');
    if (fadeEnd <= fadeStart) throw new RangeError('fadeEnd must be greater than fadeStart.');
    if (options.groundY !== undefined) finite(options.groundY, 'groundY');
    const renderOrder = finite(options.renderOrder ?? 2, 'renderOrder');
    const textureSize = options.textureSize ?? 32;
    if (!Number.isInteger(textureSize) || textureSize < 4) {
      throw new RangeError('textureSize must be an integer of at least 4.');
    }

    this.groundY = options.groundY;
    this.yOffset = yOffset;
    this.opacity = opacity;
    this.fadeEnd = fadeEnd;
    this.fadeStartSquared = fadeStart * fadeStart;
    this.fadeEndSquared = fadeEnd * fadeEnd;
    this.inverseFadeRange = 1 / (fadeEnd - fadeStart);

    this.texture = createRadialAlphaTexture(textureSize);
    this.material = createMaterial(this.texture, new THREE.Color(options.color ?? 0x11191c));
    this.geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    this.geometry.rotateX(-Math.PI * .5);
    this.instanceOpacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.instanceOpacity.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('instanceOpacity', this.instanceOpacity);

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.name = options.name ?? 'DynamicContactShadows';
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.userData.decorative = true;
    parent.add(this.mesh);

    this.mutableStats = {
      capacity,
      submitted: 0,
      active: 0,
      clipped: 0,
      drawCalls: 0,
    };
    this.stats = this.mutableStats;
  }

  /** Returns the same stats object on every call; its values describe this update. */
  update(
    targets: readonly ContactShadowTarget[],
    cameraPosition?: ContactShadowVector,
  ): Readonly<ContactShadowStats> {
    if (this.disposed) return this.stats;
    if (cameraPosition) {
      finite(cameraPosition.x, 'cameraPosition.x');
      finite(cameraPosition.y, 'cameraPosition.y');
      finite(cameraPosition.z, 'cameraPosition.z');
    }

    const capacity = this.mutableStats.capacity;
    let active = 0;
    let drawable = 0;
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      const { position, radius } = target;
      // Keep the normal update path allocation-free; diagnostic strings are
      // constructed only for malformed input.
      if (!Number.isFinite(position.x)) {
        throw new RangeError(`targets[${index}].position.x must be finite.`);
      }
      if (!Number.isFinite(position.y)) {
        throw new RangeError(`targets[${index}].position.y must be finite.`);
      }
      if (!Number.isFinite(position.z)) {
        throw new RangeError(`targets[${index}].position.z must be finite.`);
      }
      if (!Number.isFinite(radius) || radius <= 0) {
        throw new RangeError(`targets[${index}].radius must be finite and greater than zero.`);
      }
      let targetOpacity = target.opacity ?? 1;
      if (!Number.isFinite(targetOpacity)) {
        throw new RangeError(`targets[${index}].opacity must be finite.`);
      }
      targetOpacity = targetOpacity < 0 ? 0 : targetOpacity > 1 ? 1 : targetOpacity;
      if (target.visible === false || targetOpacity === 0 || this.opacity === 0) continue;

      let distanceFade = 1;
      if (cameraPosition) {
        const dx = position.x - cameraPosition.x;
        const dy = position.y - cameraPosition.y;
        const dz = position.z - cameraPosition.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        if (distanceSquared >= this.fadeEndSquared) continue;
        if (distanceSquared > this.fadeStartSquared) {
          distanceFade = (this.fadeEnd - Math.sqrt(distanceSquared)) * this.inverseFadeRange;
        }
      }

      drawable++;
      if (active >= capacity) continue;
      this.position.set(position.x, (this.groundY ?? position.y) + this.yOffset, position.z);
      this.scale.set(radius, 1, radius);
      this.matrix.compose(this.position, IDENTITY_QUATERNION, this.scale);
      this.mesh.setMatrixAt(active, this.matrix);
      this.instanceOpacity.setX(active, this.opacity * targetOpacity * distanceFade);
      active++;
    }

    this.mesh.count = active;
    if (active > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.instanceOpacity.needsUpdate = true;
    }
    this.mutableStats.submitted = targets.length;
    this.mutableStats.active = active;
    this.mutableStats.clipped = Math.max(0, drawable - capacity);
    this.mutableStats.drawCalls = active > 0 ? 1 : 0;
    return this.stats;
  }

  /** Idempotently detaches the mesh and releases its one shared resource set. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.mesh.count = 0;
    this.mutableStats.active = 0;
    this.mutableStats.drawCalls = 0;
  }
}

export function createContactShadows(
  parent: THREE.Object3D,
  capacity: number,
  options: ContactShadowOptions = {},
): ContactShadows {
  return new ContactShadows(parent, capacity, options);
}
