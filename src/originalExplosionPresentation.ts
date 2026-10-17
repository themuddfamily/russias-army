import * as THREE from 'three';
import { ORIGINAL_MAP_SCALE } from '../shared/originalMapProfile';
import type { Vec3 } from '../shared/protocol';
import { OriginalEffectPlanePool } from './originalEffectPlanePool';

export type OriginalExplosionKind = 'grenade' | 'rocket';
export const ORIGINAL_EXPLOSION_CALLBACKS = 16;
/** Keep translucent billboard quads out of opaque normal/depth AO captures. */
export const ORIGINAL_EXPLOSION_LAYER = 1;
export const ORIGINAL_EXPLOSION_PLANE_SOURCE_SIZE = 50;
export const ORIGINAL_EXPLOSION_SCALE = { grenade: 7, rocket: 8 } as const;
export const ORIGINAL_EXPLOSION_ATLAS_URLS = {
  grenade: '/assets/original-effects/banggrenade.png',
  rocket: '/assets/original-effects/bangrocket.png',
} as const;

export interface OriginalExplosionResources {
  readonly geometry: THREE.PlaneGeometry;
  readonly textures: Readonly<Record<OriginalExplosionKind, THREE.Texture>>;
  dispose(): void;
}

/** Source nearFiltering=1, RGBA8888, white emissive shader and blend50.
 * Texture data is copied unchanged. sRGB decoding and the reciprocal UV transform
 * are modern render adapters, not a measured Director raster match.
 */
export function createOriginalExplosionResources(
  textures: Record<OriginalExplosionKind, THREE.Texture>,
): OriginalExplosionResources {
  const geometry = new THREE.PlaneGeometry(
    ORIGINAL_EXPLOSION_PLANE_SOURCE_SIZE * ORIGINAL_MAP_SCALE,
    ORIGINAL_EXPLOSION_PLANE_SOURCE_SIZE * ORIGINAL_MAP_SCALE,
  );
  for (const texture of Object.values(textures)) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
  }
  let disposed = false;
  return { geometry, textures, dispose() {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    for (const texture of new Set(Object.values(textures))) texture.dispose();
  } };
}

export async function loadOriginalExplosionResources(
  loader: Pick<THREE.TextureLoader, 'loadAsync'> = new THREE.TextureLoader(),
): Promise<OriginalExplosionResources> {
  const results = await Promise.allSettled([
    loader.loadAsync(ORIGINAL_EXPLOSION_ATLAS_URLS.grenade),
    loader.loadAsync(ORIGINAL_EXPLOSION_ATLAS_URLS.rocket),
  ]);
  if (results.some(result => result.status === 'rejected')) {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    throw failed.reason;
  }
  return createOriginalExplosionResources({
    grenade: (results[0] as PromiseFulfilledResult<THREE.Texture>).value,
    rocket: (results[1] as PromiseFulfilledResult<THREE.Texture>).value,
  });
}

/** Source textureTransform is scale4 with x decreasing1 and y increasing1
 * after each fourth callback. Inverse sampling selects left-to-right cells,
 * then top-to-bottom rows of the recovered image. Frame16 wraps to0 before the
 * model is recycled on that same callback. Constructor frame0 is retained.
 */
export function applyOriginalExplosionAtlasFrame(texture: THREE.Texture, frame: number): void {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > 16) throw new Error('Invalid original explosion atlas frame');
  const wrapped = frame % 16;
  texture.repeat.set(.25, .25);
  texture.offset.set((wrapped % 4) / 4, .75 - Math.floor(wrapped / 4) / 4);
  texture.updateMatrix();
}

export interface OriginalExplosionInstance {
  readonly id: string;
  readonly kind: OriginalExplosionKind;
  readonly position: THREE.Vector3;
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  remainingCallbacks: number;
  frame: number;
  /** Last applied callback, or restoration/birth epoch in the modern clock. */
  lastCallbackTime: number;
}

/** ParentScript17 bangs plus MovieScript1 planemakeme. Presentation borrows
 * shared resources, leases independently scrolling shaders from a plane pool, and
 * deliberately has no damage, impulse, authored particles, light or scorch.
 * Call step exactly once per source actor callback; no elapsed-time fade.
 */
export class OriginalExplosionPresentation {
  private readonly instances = new Map<string, OriginalExplosionInstance>();
  readonly planePool: OriginalEffectPlanePool;
  private readonly ownsPlanePool: boolean;
  private disposed = false;
  constructor(readonly resources: OriginalExplosionResources, readonly parent: THREE.Object3D, planePool?: OriginalEffectPlanePool) {
    this.planePool = planePool ?? new OriginalEffectPlanePool(resources.geometry);
    this.ownsPlanePool = planePool === undefined;
  }
  get size(): number { return this.instances.size; }
  list(): readonly OriginalExplosionInstance[] { return [...this.instances.values()]; }
  get(id: string): OriginalExplosionInstance | undefined { return this.instances.get(id); }

  spawn(id: string, kind: OriginalExplosionKind, position: Vec3, remainingCallbacks = 16, callbackEpoch?: number): OriginalExplosionInstance {
    this.validate(kind, position, remainingCallbacks);
    this.validateCallbackTime(callbackEpoch);
    this.ensurePoolAvailable();
    const sourceTexture = this.resources.textures[kind];
    if (!(sourceTexture instanceof THREE.Texture)) throw new Error('Invalid original explosion source texture');
    const textureName = kind === 'grenade' ? 'banggrenade' : 'bangrocket';
    this.planePool.preflight('bang', textureName, this.instances.get(id)?.mesh);
    this.remove(id);
    const mesh = this.planePool.acquire('bang', textureName, sourceTexture);
    const material = mesh.material;
    material.color.setHex(0xffffff);
    material.transparent = true;
    material.opacity = .5;
    material.side = THREE.FrontSide;
    material.toneMapped = false;
    material.depthWrite = false;
    const texture = material.map!;
    mesh.layers.set(ORIGINAL_EXPLOSION_LAYER);
    mesh.scale.setScalar(ORIGINAL_EXPLOSION_SCALE[kind]);
    const instance: OriginalExplosionInstance = {
      id, kind, position: new THREE.Vector3(position.x, position.y, position.z),
      mesh, remainingCallbacks, frame: 16 - remainingCallbacks, lastCallbackTime: callbackEpoch ?? -Infinity,
    };
    this.parent.add(mesh);
    this.positionMesh(instance);
    applyOriginalExplosionAtlasFrame(texture, instance.frame);
    this.instances.set(id, instance);
    return instance;
  }

  /** Restore an authoritative blast age, including late joins, without playing
   * past callbacks. An absent source goody freezes age and facing in step().
   */
  sync(id: string, kind: OriginalExplosionKind, position: Vec3, remainingCallbacks: number, callbackEpoch?: number): OriginalExplosionInstance | undefined {
    this.validate(kind, position, remainingCallbacks, true);
    this.validateCallbackTime(callbackEpoch);
    this.ensurePoolAvailable();
    if (remainingCallbacks === 0) { this.remove(id); return undefined; }
    const previous = this.instances.get(id);
    if (!previous || previous.kind !== kind) return this.spawn(id, kind, position, remainingCallbacks, callbackEpoch);
    previous.position.set(position.x, position.y, position.z);
    previous.remainingCallbacks = remainingCallbacks;
    previous.frame = 16 - remainingCallbacks;
    if (callbackEpoch !== undefined) previous.lastCallbackTime = callbackEpoch;
    this.positionMesh(previous);
    applyOriginalExplosionAtlasFrame(previous.mesh.material.map!, previous.frame);
    return previous;
  }

  /** Optional timestamps prevent a render-frame catch-up loop from applying
   * callbacks that precede a snapshot restoration or local birth. This clock
   * boundary is a modern adapter; native actor-list birth phase is unproved.
   * Omitting time preserves the explicit one-call/one-callback debug API. */
  step(playerEye: Vec3 | null, callbackTime?: number): void {
    this.validateCallbackTime(callbackTime);
    this.ensurePoolAvailable();
    if (!playerEye) return;
    if (![playerEye.x, playerEye.y, playerEye.z].every(Number.isFinite)) throw new Error('Invalid original explosion eye');
    const eye = new THREE.Vector3(playerEye.x, playerEye.y, playerEye.z);
    for (const instance of this.instances.values()) {
      if (callbackTime !== undefined && callbackTime <= instance.lastCallbackTime) continue;
      if (callbackTime !== undefined) instance.lastCallbackTime = callbackTime;
      instance.frame++;
      applyOriginalExplosionAtlasFrame(instance.mesh.material.map!, instance.frame);
      this.face(instance, eye);
      instance.remainingCallbacks--;
      if (instance.remainingCallbacks === 0) this.remove(instance.id);
    }
  }

  /** Reorient a restored snapshot without consuming a damaging callback. */
  faceAll(playerEye: Vec3): void {
    this.ensurePoolAvailable();
    if (![playerEye.x, playerEye.y, playerEye.z].every(Number.isFinite)) throw new Error('Invalid original explosion eye');
    const eye = new THREE.Vector3(playerEye.x, playerEye.y, playerEye.z);
    for (const instance of this.instances.values()) this.face(instance, eye);
  }

  remove(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) return;
    this.planePool.release(instance.mesh);
    this.instances.delete(id);
  }
  clear(): void { for (const id of this.instances.keys()) this.remove(id); }
  dispose(): void {
    if (this.disposed) return;
    this.clear();
    if (this.ownsPlanePool) this.planePool.dispose();
    this.disposed = true;
  }

  private ensurePoolAvailable(): void {
    if (this.disposed) throw new Error('Original explosion presentation disposed');
    if (this.planePool.isDisposed) throw new Error('Original explosion plane pool disposed');
  }

  private positionMesh(instance: OriginalExplosionInstance): void {
    this.parent.updateWorldMatrix(true, false);
    instance.mesh.position.copy(this.parent.worldToLocal(instance.position.clone()));
  }
  private face(instance: OriginalExplosionInstance, eye: THREE.Vector3): void {
    // Source dog=(goody.pos-pos), projected to sourceXY. Purely vertical eye
    // differences do not change the preceding rotation.
    if (Math.hypot(eye.x - instance.position.x, eye.z - instance.position.z) === 0) return;
    instance.mesh.up.set(0, 1, 0); // original pointAt up=(0,0,1), basis-converted
    instance.mesh.lookAt(eye);
  }
  private validateCallbackTime(time: number | undefined): void {
    if (time !== undefined && (!Number.isFinite(time) || time < 0)) throw new Error('Invalid original explosion callback time');
  }
  private validate(kind: OriginalExplosionKind, position: Vec3, remaining: number, allowZero = false): void {
    if (!(kind in ORIGINAL_EXPLOSION_SCALE) || ![position.x, position.y, position.z].every(Number.isFinite)
      || !Number.isSafeInteger(remaining) || remaining < (allowZero ? 0 : 1) || remaining > 16) {
      throw new Error('Invalid original explosion state');
    }
  }
}
