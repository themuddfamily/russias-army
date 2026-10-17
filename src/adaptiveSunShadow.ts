import * as THREE from 'three';

export interface AdaptiveSunShadowVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AdaptiveSunShadowBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type AdaptiveSunShadowType =
  | 'BasicShadowMap'
  | 'PCFShadowMap'
  | 'PCFSoftShadowMap'
  | 'VSMShadowMap';

export interface AdaptiveSunShadowOptions {
  /** Existing light to configure. When omitted, the rig owns a new light. */
  readonly light?: THREE.DirectionalLight;
  readonly enabled?: boolean;
  readonly color?: THREE.ColorRepresentation;
  readonly intensity?: number;
  /** Vector from the focused ground point toward the sun. */
  readonly direction?: AdaptiveSunShadowVector;
  readonly mapSize?: number;
  readonly span?: number;
  readonly focusDistance?: number;
  readonly groundY?: number;
  readonly bounds?: AdaptiveSunShadowBounds;
  readonly lightDistance?: number;
  readonly cameraNear?: number;
  readonly cameraFar?: number;
  readonly bias?: number;
  readonly normalBias?: number;
  readonly radius?: number;
  readonly shadowMapType?: THREE.ShadowMapType;
  readonly name?: string;
}

export interface AdaptiveSunShadowDebugState {
  readonly enabled: boolean;
  readonly mapSize: number;
  readonly span: number;
  readonly worldUnitsPerTexel: number;
  readonly snappedCenter: Readonly<{ x: number; y: number; z: number }>;
  readonly bias: number;
  readonly normalBias: number;
  readonly type: AdaptiveSunShadowType;
}

export const DEFAULT_ADAPTIVE_SUN_DIRECTION: Readonly<AdaptiveSunShadowVector> = Object.freeze({
  x: -46,
  y: 34,
  z: 18,
});

export const DEFAULT_ADAPTIVE_SUN_BOUNDS: Readonly<AdaptiveSunShadowBounds> = Object.freeze({
  minX: -64,
  maxX: 64,
  minZ: -64,
  maxZ: 64,
});

const DEFAULT_MAP_SIZE = 2048;
const DEFAULT_SPAN = 88;
const DEFAULT_FOCUS_DISTANCE = 23;
const DEFAULT_LIGHT_DISTANCE = 96;
const DEFAULT_BIAS = -.00008;
const DEFAULT_NORMAL_BIAS = .025;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function finiteAtLeast(value: number, minimum: number, label: string): number {
  finite(value, label);
  if (value < minimum) throw new RangeError(`${label} must be at least ${minimum}.`);
  return value;
}

function finiteGreaterThan(value: number, minimum: number, label: string): number {
  finite(value, label);
  if (value <= minimum) throw new RangeError(`${label} must be greater than ${minimum}.`);
  return value;
}

function validateMapSize(value: number): number {
  if (!Number.isInteger(value) || value < 256 || (value & (value - 1)) !== 0) {
    throw new RangeError('mapSize must be a power-of-two integer of at least 256.');
  }
  return value;
}

function validateShadowMapType(value: THREE.ShadowMapType): THREE.ShadowMapType {
  if (
    value !== THREE.BasicShadowMap
    && value !== THREE.PCFShadowMap
    && value !== THREE.PCFSoftShadowMap
    && value !== THREE.VSMShadowMap
  ) {
    throw new RangeError('shadowMapType must be a supported THREE shadow map type.');
  }
  return value;
}

function shadowMapTypeName(value: THREE.ShadowMapType): AdaptiveSunShadowType {
  if (value === THREE.BasicShadowMap) return 'BasicShadowMap';
  if (value === THREE.PCFSoftShadowMap) return 'PCFSoftShadowMap';
  if (value === THREE.VSMShadowMap) return 'VSMShadowMap';
  return 'PCFShadowMap';
}

function validatedBounds(bounds: AdaptiveSunShadowBounds): AdaptiveSunShadowBounds {
  finite(bounds.minX, 'bounds.minX');
  finite(bounds.maxX, 'bounds.maxX');
  finite(bounds.minZ, 'bounds.minZ');
  finite(bounds.maxZ, 'bounds.maxZ');
  if (bounds.maxX <= bounds.minX) throw new RangeError('bounds.maxX must be greater than bounds.minX.');
  if (bounds.maxZ <= bounds.minZ) throw new RangeError('bounds.maxZ must be greater than bounds.minZ.');
  return bounds;
}

/**
 * One camera-focused directional shadow map for the combat area.
 *
 * The rig spends the existing map resolution around and ahead of the player,
 * then snaps that focus in the sun's light plane to prevent sub-texel crawling.
 * Every object touched by update() is retained by the instance, so the hot path
 * does not allocate.
 */
export class AdaptiveSunShadow {
  readonly light: THREE.DirectionalLight;
  readonly ownsLight: boolean;
  readonly shadowMapType: THREE.ShadowMapType;
  readonly debug: Readonly<AdaptiveSunShadowDebugState>;

  private readonly parent: THREE.Object3D;
  private readonly enabled: boolean;
  private readonly direction = new THREE.Vector3();
  private readonly lightRight = new THREE.Vector3();
  private readonly lightUp = new THREE.Vector3();
  private readonly cameraForward = new THREE.Vector3(0, 0, -1);
  private readonly previousHorizontalForward = new THREE.Vector3(0, 0, -1);
  private readonly desiredCenter = new THREE.Vector3();
  private readonly snappedCenter = new THREE.Vector3();
  private readonly debugCenter = { x: 0, y: 0, z: 0 };
  private readonly mapSize: number;
  private readonly span: number;
  private readonly worldUnitsPerTexel: number;
  private readonly focusDistance: number;
  private readonly groundY: number;
  private readonly bounds: AdaptiveSunShadowBounds;
  private readonly lightDistance: number;
  private readonly mutableDebug: {
    enabled: boolean;
    mapSize: number;
    span: number;
    worldUnitsPerTexel: number;
    snappedCenter: { x: number; y: number; z: number };
    bias: number;
    normalBias: number;
    type: AdaptiveSunShadowType;
  };
  private disposed = false;

  constructor(parent: THREE.Object3D, options: AdaptiveSunShadowOptions = {}) {
    if (!(parent instanceof THREE.Object3D)) throw new TypeError('parent must be a THREE.Object3D.');
    this.parent = parent;
    this.enabled = options.enabled ?? true;
    if (typeof this.enabled !== 'boolean') throw new TypeError('enabled must be a boolean.');

    this.mapSize = validateMapSize(options.mapSize ?? DEFAULT_MAP_SIZE);
    this.span = finiteGreaterThan(options.span ?? DEFAULT_SPAN, 0, 'span');
    this.worldUnitsPerTexel = this.span / this.mapSize;
    this.focusDistance = finiteAtLeast(options.focusDistance ?? DEFAULT_FOCUS_DISTANCE, 0, 'focusDistance');
    this.groundY = finite(options.groundY ?? 0, 'groundY');
    this.lightDistance = finiteGreaterThan(options.lightDistance ?? DEFAULT_LIGHT_DISTANCE, 0, 'lightDistance');
    this.bounds = validatedBounds(options.bounds ?? DEFAULT_ADAPTIVE_SUN_BOUNDS);
    if (
      this.bounds.maxX - this.bounds.minX <= this.worldUnitsPerTexel * 2
      || this.bounds.maxZ - this.bounds.minZ <= this.worldUnitsPerTexel * 2
    ) {
      throw new RangeError('bounds must leave at least a one-texel snapping guard on every edge.');
    }

    const direction = options.direction ?? DEFAULT_ADAPTIVE_SUN_DIRECTION;
    this.direction.set(
      finite(direction.x, 'direction.x'),
      finite(direction.y, 'direction.y'),
      finite(direction.z, 'direction.z'),
    );
    if (this.direction.lengthSq() <= Number.EPSILON) throw new RangeError('direction must have non-zero length.');
    this.direction.normalize();
    this.lightRight.crossVectors(WORLD_UP, this.direction);
    if (this.lightRight.lengthSq() <= 1e-10) this.lightRight.set(1, 0, 0);
    else this.lightRight.normalize();
    this.lightUp.crossVectors(this.direction, this.lightRight).normalize();

    this.ownsLight = options.light === undefined;
    this.light = options.light ?? new THREE.DirectionalLight(
      options.color ?? 0xffe4c6,
      options.intensity ?? 2.85,
    );
    if (options.color !== undefined) this.light.color.set(options.color);
    if (options.intensity !== undefined) this.light.intensity = finiteAtLeast(options.intensity, 0, 'intensity');
    if (this.ownsLight || options.name !== undefined) this.light.name = options.name ?? 'AdaptiveSun';

    const cameraNear = finiteAtLeast(options.cameraNear ?? 1, 0, 'cameraNear');
    const cameraFar = finiteGreaterThan(options.cameraFar ?? 180, cameraNear, 'cameraFar');
    const bias = finite(options.bias ?? DEFAULT_BIAS, 'bias');
    const normalBias = finiteAtLeast(options.normalBias ?? DEFAULT_NORMAL_BIAS, 0, 'normalBias');
    const radius = finiteAtLeast(options.radius ?? 2.5, 0, 'radius');
    this.shadowMapType = validateShadowMapType(options.shadowMapType ?? THREE.PCFSoftShadowMap);

    this.light.castShadow = this.enabled;
    this.light.shadow.mapSize.set(this.mapSize, this.mapSize);
    this.light.shadow.bias = bias;
    this.light.shadow.normalBias = normalBias;
    this.light.shadow.radius = radius;
    const shadowCamera = this.light.shadow.camera;
    const halfSpan = this.span * .5;
    shadowCamera.left = -halfSpan;
    shadowCamera.right = halfSpan;
    shadowCamera.top = halfSpan;
    shadowCamera.bottom = -halfSpan;
    shadowCamera.near = cameraNear;
    shadowCamera.far = cameraFar;
    shadowCamera.updateProjectionMatrix();

    if (this.ownsLight) this.parent.add(this.light, this.light.target);

    this.mutableDebug = {
      enabled: this.enabled,
      mapSize: this.mapSize,
      span: this.span,
      worldUnitsPerTexel: this.worldUnitsPerTexel,
      snappedCenter: this.debugCenter,
      bias,
      normalBias,
      type: shadowMapTypeName(this.shadowMapType),
    };
    this.debug = this.mutableDebug;
  }

  /** Returns the same allocation-free diagnostic object on every call. */
  getDebugState(): Readonly<AdaptiveSunShadowDebugState> {
    return this.debug;
  }

  /** Updates the focused, light-space-stabilized map center. */
  update(camera: THREE.Camera): Readonly<AdaptiveSunShadowDebugState> {
    if (this.disposed || !this.enabled) return this.debug;
    if (!(camera instanceof THREE.Camera)) throw new TypeError('camera must be a THREE.Camera.');

    camera.getWorldDirection(this.cameraForward);
    this.cameraForward.y = 0;
    const horizontalLengthSquared = this.cameraForward.lengthSq();
    if (horizontalLengthSquared > 1e-10) {
      this.cameraForward.multiplyScalar(1 / Math.sqrt(horizontalLengthSquared));
      this.previousHorizontalForward.copy(this.cameraForward);
    } else {
      this.cameraForward.copy(this.previousHorizontalForward);
    }

    // Inset by one texel. The maximum displacement introduced by rounding the
    // light-space axes is smaller than this guard, preserving hard bounds.
    const guard = this.worldUnitsPerTexel;
    const desiredX = THREE.MathUtils.clamp(
      camera.position.x + this.cameraForward.x * this.focusDistance,
      this.bounds.minX + guard,
      this.bounds.maxX - guard,
    );
    const desiredZ = THREE.MathUtils.clamp(
      camera.position.z + this.cameraForward.z * this.focusDistance,
      this.bounds.minZ + guard,
      this.bounds.maxZ - guard,
    );
    this.desiredCenter.set(desiredX, this.groundY, desiredZ);

    const lightX = this.desiredCenter.dot(this.lightRight);
    const lightY = this.desiredCenter.dot(this.lightUp);
    const lightZ = this.desiredCenter.dot(this.direction);
    const snappedX = Math.round(lightX / this.worldUnitsPerTexel) * this.worldUnitsPerTexel;
    const snappedY = Math.round(lightY / this.worldUnitsPerTexel) * this.worldUnitsPerTexel;
    const snappedZ = Math.round(lightZ / this.worldUnitsPerTexel) * this.worldUnitsPerTexel;
    this.snappedCenter
      .copy(this.lightRight).multiplyScalar(snappedX)
      .addScaledVector(this.lightUp, snappedY)
      .addScaledVector(this.direction, snappedZ);

    this.light.target.position.copy(this.snappedCenter);
    this.light.position.copy(this.snappedCenter).addScaledVector(this.direction, this.lightDistance);
    this.debugCenter.x = this.snappedCenter.x;
    this.debugCenter.y = this.snappedCenter.y;
    this.debugCenter.z = this.snappedCenter.z;
    return this.debug;
  }

  /** Releases only resources created by this rig; supplied lights remain caller-owned. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mutableDebug.enabled = false;
    if (!this.ownsLight) return;
    this.light.removeFromParent();
    this.light.target.removeFromParent();
    this.light.shadow.dispose();
  }
}

export function createAdaptiveSunShadow(
  parent: THREE.Object3D,
  options: AdaptiveSunShadowOptions = {},
): AdaptiveSunShadow {
  return new AdaptiveSunShadow(parent, options);
}
