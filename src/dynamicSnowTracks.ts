import * as THREE from 'three';

export interface SnowTrackVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DynamicSnowTrackCapacities {
  footprints: number;
  puffs: number;
}

export interface DynamicSnowTracksOptions {
  capacities?: Partial<DynamicSnowTrackCapacities>;
  seed?: number;
  footprintSpacing?: number;
  footprintLifetime?: number;
  rootName?: string;
  pixelRatio?: number;
  surfaceHeightAt?: (x: number, z: number) => number | undefined;
  /** Optional authored footprint texture. Ownership transfers to this presentation. */
  bootTexture?: THREE.Texture;
}

export interface DynamicSnowTrackStats {
  readonly active: Readonly<DynamicSnowTrackCapacities>;
  readonly capacity: Readonly<DynamicSnowTrackCapacities>;
  readonly actors: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly resources: {
    readonly geometries: number;
    readonly materials: number;
    readonly textures: number;
  };
}

interface FootprintSlot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  side: -1 | 1;
  age: number;
  lifetime: number;
  active: boolean;
}

interface PuffSlot {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  age: number;
  lifetime: number;
  active: boolean;
}

interface ActorTrackState {
  x: number;
  y: number;
  z: number;
  distance: number;
  side: -1 | 1;
  initialized: boolean;
}

const DEFAULT_CAPACITIES: Readonly<DynamicSnowTrackCapacities> = Object.freeze({
  footprints: 256,
  puffs: 128,
});
const FOOTPRINT_WIDTH = .18;
const FOOTPRINT_LENGTH = .39;
const FOOTPRINT_Y_OFFSET = .026;
const TELEPORT_DISTANCE = 2.5;
const ARENA_HALF_ROAD_LENGTH = 72.5;
const ARENA_HALF_ROAD_WIDTH = 6.5;
const MIN_SNOW_Y = -.05;
const MAX_SNOW_Y = .08;
const FOOTINGS = Object.freeze([
  Object.freeze({ x: -21, z: -18, width: 24, depth: 14 }),
  Object.freeze({ x: 24, z: 19, width: 19, depth: 13 }),
  Object.freeze({ x: 27, z: -24, width: 15, depth: 10 }),
  Object.freeze({ x: -26, z: 25, width: 14, depth: 10 }),
]);

function capacity(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new RangeError(`${label} capacity must be a non-negative integer.`);
  }
  return resolved;
}

function positive(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero.`);
  }
  return resolved;
}

function finiteVector(point: SnowTrackVector, label: string): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Number.isFinite(point[axis])) throw new RangeError(`${label}.${axis} must be finite.`);
  }
}

/** True only for the exposed, ground-level snow plane—not roads or building floors. */
export function isArenaSnowSurface(point: SnowTrackVector): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return false;
  if (point.y < MIN_SNOW_Y || point.y > MAX_SNOW_Y) return false;
  const onVerticalRoad = Math.abs(point.x) <= ARENA_HALF_ROAD_WIDTH
    && Math.abs(point.z) <= ARENA_HALF_ROAD_LENGTH;
  const onHorizontalRoad = Math.abs(point.z) <= ARENA_HALF_ROAD_WIDTH
    && Math.abs(point.x) <= ARENA_HALF_ROAD_LENGTH;
  if (onVerticalRoad || onHorizontalRoad) return false;
  for (const footing of FOOTINGS) {
    if (Math.abs(point.x - footing.x) <= footing.width * .5
      && Math.abs(point.z - footing.z) <= footing.depth * .5) return false;
  }
  return true;
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

function createBootTexture(seed: number, size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + .5) / size * 2 - 1;
      const ny = (y + .5) / size * 2 - 1;
      const toeWidth = THREE.MathUtils.lerp(.43, .64, THREE.MathUtils.smoothstep(ny, -.15, .85));
      const outline = (nx / toeWidth) ** 2 + ((ny + .02) / .93) ** 2;
      const inside = 1 - THREE.MathUtils.smoothstep(outline, .78, 1.05);
      const heelGap = ny < -.28 && Math.abs(nx) < .22 ? .38 : 1;
      const tread = .55 + .45 * Math.sin((ny + 1) * 35 + Math.floor((nx + 1) * 5) * .8) ** 2;
      const centreGroove = Math.abs(nx) < .075 ? .55 : 1;
      const noise = pixelNoise(x, y, seed);
      const alpha = THREE.MathUtils.clamp(inside * heelGap * centreGroove * (tread * .82 + noise * .18), 0, 1);
      // Compacted snow stays blue-grey instead of reading as a painted black
      // decal; tread breakup supplies contrast while the ground still shows.
      const shade = Math.round(THREE.MathUtils.lerp(104, 148, noise * .38 + (1 - inside) * .1));
      const offset = (y * size + x) * 4;
      data[offset] = Math.max(0, shade - 10);
      data[offset + 1] = shade;
      data[offset + 2] = Math.min(255, shade + 7);
      data[offset + 3] = Math.round(alpha * 205);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'dynamic-snow-boot-sole';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createFootprintSlot(): FootprintSlot {
  return { x: 0, y: 0, z: 0, yaw: 0, side: -1, age: 0, lifetime: 0, active: false };
}

function createPuffSlot(): PuffSlot {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, age: 0, lifetime: 0, active: false };
}

/**
 * Presentation-only dynamic snow response. Footprints and powder use fixed-size
 * numeric pools, so combat movement never allocates scene or GPU resources.
 */
export class DynamicSnowTracks {
  readonly root = new THREE.Group();
  readonly capacities: Readonly<DynamicSnowTrackCapacities>;
  readonly footprintMesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  readonly puffPoints: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  private readonly footprintGeometry: THREE.PlaneGeometry;
  private readonly puffGeometry: THREE.BufferGeometry;
  private readonly bootTexture: THREE.Texture;
  private readonly footprintMaterial: THREE.MeshStandardMaterial;
  private readonly puffMaterial: THREE.ShaderMaterial;
  private readonly footprints: FootprintSlot[];
  private readonly puffs: PuffSlot[];
  private readonly actors = new Map<string, ActorTrackState>();
  private readonly footprintSpacing: number;
  private readonly footprintLifetime: number;
  private readonly surfaceHeightAt?: (x: number, z: number) => number | undefined;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private footprintCursor = 0;
  private puffCursor = 0;
  private randomState: number;
  private disposed = false;

  constructor(parent: THREE.Object3D, options: DynamicSnowTracksOptions = {}) {
    const capacities = options.capacities ?? {};
    this.capacities = Object.freeze({
      footprints: capacity(capacities.footprints, DEFAULT_CAPACITIES.footprints, 'Footprint'),
      puffs: capacity(capacities.puffs, DEFAULT_CAPACITIES.puffs, 'Puff'),
    });
    this.footprintSpacing = positive(options.footprintSpacing, .56, 'Footprint spacing');
    this.footprintLifetime = positive(options.footprintLifetime, 36, 'Footprint lifetime');
    if (options.surfaceHeightAt !== undefined && typeof options.surfaceHeightAt !== 'function') {
      throw new RangeError('Snow-track surface-height sampler must be a function.');
    }
    this.surfaceHeightAt = options.surfaceHeightAt;
    const seed = options.seed ?? 0x534e4f57;
    if (!Number.isInteger(seed) || !Number.isFinite(seed)) throw new RangeError('Snow-track seed must be a finite integer.');
    this.randomState = seed >>> 0 || 0x534e4f57;

    this.root.name = options.rootName ?? 'dynamic-snow-tracks';
    this.root.userData.decorative = true;
    parent.add(this.root);

    this.footprintGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.footprintGeometry.rotateX(-Math.PI / 2);
    this.footprintGeometry.name = 'dynamic-snow-footprint-plane';
    this.bootTexture = options.bootTexture ?? createBootTexture(this.randomState ^ 0x9e3779b9);
    this.footprintMaterial = new THREE.MeshStandardMaterial({
      name: 'dynamic-snow-footprint-material',
      map: this.bootTexture,
      alphaTest: .12,
      transparent: false,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.footprintMesh = new THREE.InstancedMesh(
      this.footprintGeometry,
      this.footprintMaterial,
      this.capacities.footprints,
    );
    this.footprintMesh.name = 'dynamic-snow-footprints';
    this.footprintMesh.count = 0;
    this.footprintMesh.visible = false;
    this.footprintMesh.castShadow = false;
    this.footprintMesh.receiveShadow = false;
    this.footprintMesh.frustumCulled = false;
    this.footprintMesh.renderOrder = 2;
    this.footprintMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.footprintMesh);

    const puffPositions = new Float32Array(this.capacities.puffs * 3);
    const puffData = new Float32Array(this.capacities.puffs * 2);
    this.puffGeometry = new THREE.BufferGeometry();
    this.puffGeometry.name = 'dynamic-snow-puff-points';
    this.puffGeometry.setAttribute('position', new THREE.BufferAttribute(puffPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.puffGeometry.setAttribute('puffData', new THREE.BufferAttribute(puffData, 2).setUsage(THREE.DynamicDrawUsage));
    this.puffGeometry.setDrawRange(0, 0);
    this.puffMaterial = new THREE.ShaderMaterial({
      name: 'dynamic-snow-puff-material',
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: true,
      uniforms: {
        uPixelRatio: { value: positive(options.pixelRatio, 1, 'Pixel ratio') },
        uColour: { value: new THREE.Color(0xe6efec) },
      },
      vertexShader: /* glsl */`
        attribute vec2 puffData;
        uniform float uPixelRatio;
        varying float vLife;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = clamp(puffData.x * uPixelRatio * 270.0 / max(1.0, -viewPosition.z), 1.0, 15.0);
          vLife = puffData.y;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColour;
        varying float vLife;
        void main() {
          vec2 centred = gl_PointCoord - 0.5;
          float disc = 1.0 - smoothstep(0.24, 0.5, length(centred));
          float alpha = disc * smoothstep(0.0, 0.22, vLife) * min(1.0, (1.0 - vLife) * 6.0) * 0.72;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColour, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.puffPoints = new THREE.Points(this.puffGeometry, this.puffMaterial);
    this.puffPoints.name = 'dynamic-snow-puffs';
    this.puffPoints.visible = false;
    this.puffPoints.frustumCulled = false;
    this.puffPoints.renderOrder = 6;
    this.root.add(this.puffPoints);

    this.footprints = Array.from({ length: this.capacities.footprints }, createFootprintSlot);
    this.puffs = Array.from({ length: this.capacities.puffs }, createPuffSlot);
  }

  /** Samples authoritative post-collision position and emits evenly spaced steps. */
  sampleActor(id: string, point: SnowTrackVector, yaw: number, active = true): number {
    this.assertUsable();
    if (!id) throw new RangeError('Snow-track actor id must not be empty.');
    finiteVector(point, 'point');
    if (!Number.isFinite(yaw)) throw new RangeError('Snow-track actor yaw must be finite.');
    let actor = this.actors.get(id);
    if (!actor) {
      actor = { x: point.x, y: point.y, z: point.z, distance: 0, side: -1, initialized: false };
      this.actors.set(id, actor);
    }
    if (!active || !isArenaSnowSurface(point)) {
      this.setActorPosition(actor, point);
      actor.distance = 0;
      actor.initialized = true;
      return 0;
    }
    if (!actor.initialized) {
      this.setActorPosition(actor, point);
      actor.initialized = true;
      return 0;
    }
    const dx = point.x - actor.x;
    const dy = point.y - actor.y;
    const dz = point.z - actor.z;
    const travel = Math.hypot(dx, dz);
    if (travel > TELEPORT_DISTANCE || Math.abs(dy) > .2) {
      this.setActorPosition(actor, point);
      actor.distance = 0;
      return 0;
    }
    if (travel <= 1e-6) return 0;

    let emitted = 0;
    let traversed = 0;
    let needed = this.footprintSpacing - actor.distance;
    while (traversed + needed <= travel + 1e-6) {
      traversed += needed;
      const t = Math.min(1, traversed / travel);
      const step = { x: actor.x + dx * t, y: actor.y + dy * t, z: actor.z + dz * t };
      if (this.emitFootprint(step, yaw, actor.side)) emitted++;
      actor.side = actor.side === -1 ? 1 : -1;
      actor.distance = 0;
      needed = this.footprintSpacing;
    }
    actor.distance += Math.max(0, travel - traversed);
    this.setActorPosition(actor, point);
    return emitted;
  }

  emitFootprint(point: SnowTrackVector, yaw: number, side: -1 | 1): boolean {
    this.assertUsable();
    finiteVector(point, 'point');
    if (!Number.isFinite(yaw)) throw new RangeError('Footprint yaw must be finite.');
    if (side !== -1 && side !== 1) throw new RangeError('Footprint side must be -1 or 1.');
    if (!isArenaSnowSurface(point) || this.footprints.length === 0) return false;
    const lateral = side * .105;
    const x = point.x + Math.cos(yaw) * lateral;
    const z = point.z - Math.sin(yaw) * lateral;
    const y = this.sampleSurfaceHeight(x, z, point.y) + FOOTPRINT_Y_OFFSET;
    const slot = this.footprints[this.footprintCursor];
    this.footprintCursor = (this.footprintCursor + 1) % this.footprints.length;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.yaw = yaw + side * .035;
    slot.side = side;
    slot.age = 0;
    slot.lifetime = this.footprintLifetime * (.9 + this.random() * .2);
    slot.active = true;
    this.emitPowder(point, yaw, side);
    this.syncFootprints();
    this.syncPuffs();
    return true;
  }

  emitTrail(start: SnowTrackVector, end: SnowTrackVector, count: number): number {
    this.assertUsable();
    finiteVector(start, 'start');
    finiteVector(end, 'end');
    if (!Number.isInteger(count) || count < 1) throw new RangeError('Trail count must be a positive integer.');
    const yaw = Math.atan2(end.x - start.x, end.z - start.z);
    let emitted = 0;
    for (let index = 0; index < count; index++) {
      const t = count === 1 ? 0 : index / (count - 1);
      const point = {
        x: THREE.MathUtils.lerp(start.x, end.x, t),
        y: THREE.MathUtils.lerp(start.y, end.y, t),
        z: THREE.MathUtils.lerp(start.z, end.z, t),
      };
      if (this.emitFootprint(point, yaw, index % 2 === 0 ? -1 : 1)) emitted++;
    }
    return emitted;
  }

  update(delta: number): void {
    this.assertUsable();
    if (!Number.isFinite(delta) || delta < 0) throw new RangeError('Snow-track delta must be finite and non-negative.');
    let touched = false;
    if (delta > 0) {
      for (const footprint of this.footprints) if (footprint.active) {
        touched = true;
        footprint.age += delta;
        if (footprint.age >= footprint.lifetime) footprint.active = false;
      }
      for (const puff of this.puffs) if (puff.active) {
        touched = true;
        puff.age += delta;
        if (puff.age >= puff.lifetime) { puff.active = false; continue; }
        puff.x += puff.vx * delta;
        puff.y += puff.vy * delta;
        puff.z += puff.vz * delta;
        puff.vx *= Math.exp(-delta * 3.2);
        puff.vz *= Math.exp(-delta * 3.2);
        puff.vy -= delta * .55;
      }
    }
    // Emit paths sync the instance buffers directly, so an update tick that
    // aged nothing has nothing new to upload.
    if (!touched) return;
    this.syncFootprints();
    this.syncPuffs();
  }

  resetActor(id: string): void {
    this.assertUsable();
    this.actors.delete(id);
  }

  clear(): void {
    this.assertUsable();
    for (const footprint of this.footprints) footprint.active = false;
    for (const puff of this.puffs) puff.active = false;
    this.actors.clear();
    this.footprintCursor = 0;
    this.puffCursor = 0;
    this.syncFootprints();
    this.syncPuffs();
  }

  getStats(): DynamicSnowTrackStats {
    const footprintCount = this.activeFootprints();
    const puffCount = this.activePuffs();
    return {
      active: { footprints: footprintCount, puffs: puffCount },
      capacity: this.capacities,
      actors: this.actors.size,
      drawCalls: (footprintCount > 0 ? 1 : 0) + (puffCount > 0 ? 1 : 0),
      triangles: footprintCount * 2,
      points: puffCount,
      resources: {
        geometries: this.disposed ? 0 : 2,
        materials: this.disposed ? 0 : 2,
        textures: this.disposed ? 0 : 1,
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.footprintGeometry.dispose();
    this.puffGeometry.dispose();
    this.footprintMaterial.dispose();
    this.puffMaterial.dispose();
    this.bootTexture.dispose();
  }

  private setActorPosition(actor: ActorTrackState, point: SnowTrackVector): void {
    actor.x = point.x;
    actor.y = point.y;
    actor.z = point.z;
  }

  private emitPowder(point: SnowTrackVector, yaw: number, side: -1 | 1): void {
    if (this.puffs.length === 0) return;
    const count = Math.min(4, this.puffs.length);
    for (let index = 0; index < count; index++) {
      const puff = this.puffs[this.puffCursor];
      this.puffCursor = (this.puffCursor + 1) % this.puffs.length;
      const spread = (this.random() - .5) * .24;
      const forward = (this.random() - .5) * .18;
      puff.x = point.x + Math.cos(yaw) * (side * .08 + spread) + Math.sin(yaw) * forward;
      puff.z = point.z - Math.sin(yaw) * (side * .08 + spread) + Math.cos(yaw) * forward;
      puff.y = this.sampleSurfaceHeight(puff.x, puff.z, point.y) + .055 + this.random() * .035;
      puff.vx = Math.cos(yaw) * spread * .7 + (this.random() - .5) * .08;
      puff.vy = .11 + this.random() * .22;
      puff.vz = -Math.sin(yaw) * spread * .7 + (this.random() - .5) * .08;
      puff.size = .055 + this.random() * .075;
      puff.age = 0;
      puff.lifetime = .42 + this.random() * .3;
      puff.active = true;
    }
  }

  private syncFootprints(): void {
    let target = 0;
    for (const footprint of this.footprints) {
      if (!footprint.active) continue;
      const remaining = Math.max(0, 1 - footprint.age / footprint.lifetime);
      const fadeScale = remaining < .12 ? THREE.MathUtils.lerp(.72, 1, remaining / .12) : 1;
      this.position.set(footprint.x, footprint.y, footprint.z);
      this.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, footprint.yaw);
      this.scale.set(FOOTPRINT_WIDTH * fadeScale, 1, FOOTPRINT_LENGTH * fadeScale);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.footprintMesh.setMatrixAt(target++, this.matrix);
    }
    this.footprintMesh.count = target;
    this.footprintMesh.visible = target > 0;
    if (target > 0) this.footprintMesh.instanceMatrix.needsUpdate = true;
  }

  private syncPuffs(): void {
    const positions = this.puffGeometry.getAttribute('position') as THREE.BufferAttribute;
    const data = this.puffGeometry.getAttribute('puffData') as THREE.BufferAttribute;
    let target = 0;
    for (const puff of this.puffs) {
      if (!puff.active) continue;
      positions.setXYZ(target, puff.x, puff.y, puff.z);
      data.setXY(target, puff.size, Math.max(0, 1 - puff.age / puff.lifetime));
      target++;
    }
    this.puffGeometry.setDrawRange(0, target);
    this.puffPoints.visible = target > 0;
    if (target > 0) {
      positions.needsUpdate = true;
      data.needsUpdate = true;
    }
  }

  private activeFootprints(): number {
    let count = 0;
    for (const footprint of this.footprints) if (footprint.active) count++;
    return count;
  }

  private activePuffs(): number {
    let count = 0;
    for (const puff of this.puffs) if (puff.active) count++;
    return count;
  }

  private sampleSurfaceHeight(x: number, z: number, fallback: number): number {
    if (!this.surfaceHeightAt) return fallback;
    const sampled = this.surfaceHeightAt(x, z);
    if (sampled === undefined) return fallback;
    if (!Number.isFinite(sampled)) {
      throw new RangeError('Snow-track surface-height sampler must return a finite number or undefined.');
    }
    return Math.max(fallback, sampled);
  }

  private random(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0 || 0x534e4f57;
    return this.randomState / 4294967296;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Dynamic snow tracks have been disposed.');
  }
}

export function createDynamicSnowTracks(
  parent: THREE.Object3D,
  options: DynamicSnowTracksOptions = {},
): DynamicSnowTracks {
  return new DynamicSnowTracks(parent, options);
}
