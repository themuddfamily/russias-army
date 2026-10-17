import * as THREE from 'three';
import { OriginalEffectPlanePool } from './originalEffectPlanePool';
import type { Vec3 } from '../shared/protocol';
import {
  ORIGINAL_COMBAT_PLANE_SIZE,
  createOriginalMissEffect, stepOriginalMissEffect,
  createOriginalBloodEffect, stepOriginalBloodEffect,
  createOriginalRpgPuffEffect, stepOriginalRpgPuffEffect,
  type OriginalMissEffectState, type OriginalBloodEffectState, type OriginalRpgPuffEffectState,
} from '../shared/originalCombatEffects';

export const ORIGINAL_COMBAT_EFFECT_LAYER = 1;
export const ORIGINAL_COMBAT_EFFECT_URLS = {
  spatter: '/assets/original-combat-effects/spatter.png',
  decalspas: '/assets/original-combat-effects/decalspas.png',
  decal: '/assets/original-combat-effects/decal.png',
  pufft: '/assets/original-combat-effects/pufft.png',
} as const;
type TextureKind = keyof typeof ORIGINAL_COMBAT_EFFECT_URLS;
export interface OriginalCombatEffectResources {
  readonly geometry: THREE.PlaneGeometry;
  readonly textures: Readonly<Record<TextureKind, THREE.Texture>>;
  dispose(): void;
}

/** Original RGBA textures and white emissive planes. Linear sampling, sRGB
 * decoding and inverse texture transforms are Three adapters; the original
 * Director raster/filter/wrap behavior has not been measured. */
export function createOriginalCombatEffectResources(textures: Record<TextureKind, THREE.Texture>): OriginalCombatEffectResources {
  const geometry = new THREE.PlaneGeometry(ORIGINAL_COMBAT_PLANE_SIZE, ORIGINAL_COMBAT_PLANE_SIZE);
  for (const texture of Object.values(textures)) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
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

export async function loadOriginalCombatEffectResources(
  loader: Pick<THREE.TextureLoader, 'loadAsync'> = new THREE.TextureLoader(),
): Promise<OriginalCombatEffectResources> {
  const kinds = Object.keys(ORIGINAL_COMBAT_EFFECT_URLS) as TextureKind[];
  const results = await Promise.allSettled(kinds.map(kind => loader.loadAsync(ORIGINAL_COMBAT_EFFECT_URLS[kind])));
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    throw failure.reason;
  }
  return createOriginalCombatEffectResources(Object.fromEntries(kinds.map((kind, index) => [
    kind, (results[index] as PromiseFulfilledResult<THREE.Texture>).value,
  ])) as Record<TextureKind, THREE.Texture>);
}

/** Source textureTransform scale3 and position(x,y) converted to inverse
 * sampling, with top-origin recovered atlas rows. Initial (1,1) is preserved,
 * then callback positions (0,1),(-1,1),(-2,1), including terminal scroll. */
export function applyOriginalBloodTextureTransform(texture: THREE.Texture, state: OriginalBloodEffectState): void {
  texture.repeat.set(1 / state.textureScale.x, 1 / state.textureScale.y);
  texture.offset.set(-state.texturePosition.x / state.textureScale.x,
    1 - (state.texturePosition.y + 1) / state.textureScale.y);
  texture.updateMatrix();
}

type EffectState = OriginalMissEffectState | OriginalBloodEffectState | OriginalRpgPuffEffectState;
export interface OriginalCombatEffectInstance {
  readonly id: string;
  readonly kind: 'miss' | 'blood' | 'puff';
  readonly state: EffectState;
  lastCallbackTime: number;
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

/** Parent scripts18/19/16. Blood actors share the named spatter shader's atlas
 * transform; miss/puff borrow image data with their existing render adapters.
 * There is no elapsed-time fade or invented
 * particle/light. step() is exactly one source actor callback. */
export class OriginalCombatEffectPresentation {
  private readonly instances = new Map<string, OriginalCombatEffectInstance>();
  readonly planePool: OriginalEffectPlanePool;
  private readonly ownsPlanePool: boolean;
  private disposed = false;
  private sequence = 0;
  constructor(readonly resources: OriginalCombatEffectResources, readonly parent: THREE.Object3D, pool?: OriginalEffectPlanePool) {
    this.ownsPlanePool = pool === undefined;
    this.planePool = pool ?? new OriginalEffectPlanePool(resources.geometry);
  }
  get size(): number { return this.instances.size; }
  list(): readonly OriginalCombatEffectInstance[] { return [...this.instances.values()]; }
  get(id: string): OriginalCombatEffectInstance | undefined { return this.instances.get(id); }
  getStats(): { miss: number; blood: number; puff: number; total: number } {
    const stats = { miss: 0, blood: 0, puff: 0, total: this.size };
    for (const instance of this.instances.values()) stats[instance.kind]++;
    return stats;
  }

  spawnMiss(position: Vec3, normal: Vec3, shotgun: boolean, id = `miss-${++this.sequence}`, birthEpoch?: number): OriginalCombatEffectInstance {
    const state = createOriginalMissEffect(position, normal, shotgun);
    const instance = this.add(id, 'miss', state, birthEpoch);
    this.face(instance, position);
    instance.mesh.rotateX(Math.PI); // source rotate(180,0,0,#self)
    return instance;
  }
  spawnBlood(position: Vec3, _playerEye: Vec3 | null = null, id = `blood-${++this.sequence}`, birthEpoch?: number): OriginalCombatEffectInstance {
    // Source constructor does not pointAt; first facing happens in stepFrame.
    const state = createOriginalBloodEffect(position);
    this.validateCallbackTime(birthEpoch);
    this.validateVector(state.position);
    return this.add(id, 'blood', state, birthEpoch);
  }
  spawnPuff(position: Vec3, playerModelPosition: Vec3 | null, random: () => number = Math.random,
    id = `puff-${++this.sequence}`, ageCallbacks = 0, birthEpoch?: number): OriginalCombatEffectInstance {
    // Network replay may reconstruct earlier source projectile callbacks. The
    // caller supplies discrete age; elapsed-time/native actor birth conversion
    // remains an adapter. Never advance other live actors during restoration.
    if (!Number.isSafeInteger(ageCallbacks) || ageCallbacks < 0 || ageCallbacks > 200) {
      throw new Error('Invalid original puff callback age');
    }
    const state = createOriginalRpgPuffEffect(position, random);
    if (playerModelPosition) this.validateVector(playerModelPosition);
    const instance = this.add(id, 'puff', state, birthEpoch);
    if (playerModelPosition) this.face(instance, playerModelPosition);
    instance.mesh.rotateZ(state.rollDegrees * Math.PI / 180);
    for (let index = 0; index < Math.min(ageCallbacks, 31); index++) stepOriginalRpgPuffEffect(state);
    this.apply(instance);
    if (!state.alive) this.remove(instance.id);
    return instance;
  }

  /** Optional birth/callback epochs skip historical frame catch-up after a
   * spawn or replay restoration. Native actor-list birth phase is unproved;
   * this adapter begins each actor on its next strictly later callback. */
  step(playerEye: Vec3 | null, callbackTime?: number): void {
    this.validateCallbackTime(callbackTime);
    if (playerEye) this.validateVector(playerEye);
    if (this.disposed || this.planePool.isDisposed) { this.clear(); return; }
    for (const instance of this.instances.values()) {
      if (callbackTime !== undefined && callbackTime <= instance.lastCallbackTime) continue;
      if (callbackTime !== undefined) instance.lastCallbackTime = callbackTime;
      switch (instance.kind) {
        case 'miss': stepOriginalMissEffect(instance.state as OriginalMissEffectState); break;
        case 'blood':
          stepOriginalBloodEffect(instance.state as OriginalBloodEffectState, playerEye !== null);
          if (playerEye) this.face(instance, playerEye);
          break;
        case 'puff': stepOriginalRpgPuffEffect(instance.state as OriginalRpgPuffEffectState); break;
      }
      this.apply(instance);
      if (!instance.state.alive) this.remove(instance.id);
    }
  }
  stepCallbacks(playerEye: Vec3 | null, count = 1): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid original combat effect callback count');
    for (let index = 0; index < count; index++) this.step(playerEye);
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

  private add(id: string, kind: OriginalCombatEffectInstance['kind'], state: EffectState, birthEpoch?: number): OriginalCombatEffectInstance {
    this.validateCallbackTime(birthEpoch);
    this.validateVector(state.position);
    if (this.disposed || this.planePool.isDisposed) throw new Error('Original combat effect presentation disposed');
    const sourceTexture = this.resources.textures[state.texture];
    if (!(sourceTexture instanceof THREE.Texture)) throw new Error('Invalid original combat effect texture');
    const replacement = this.instances.get(id)?.mesh;
    this.planePool.preflight(kind, state.texture, replacement);
    this.remove(id);
    // Named spatter shader state belongs to the shared scene pool. Only an
    // admitted birth may reset every active blood actor's canonical atlas.
    if (kind === 'blood') {
      const blood = state as OriginalBloodEffectState;
      Object.assign(this.planePool.bloodTexturePosition, blood.texturePosition);
      blood.texturePosition = this.planePool.bloodTexturePosition;
    }
    const mesh = this.planePool.acquire(kind, state.texture, sourceTexture);
    mesh.matrixAutoUpdate = true;
    mesh.visible = true;
    mesh.layers.set(ORIGINAL_COMBAT_EFFECT_LAYER);
    this.parent.add(mesh);
    this.parent.updateWorldMatrix(true, false);
    mesh.position.copy(this.parent.worldToLocal(new THREE.Vector3(state.position.x, state.position.y, state.position.z)));
    const instance = { id, kind, state, mesh, lastCallbackTime: birthEpoch ?? -Infinity };
    this.instances.set(id, instance);
    this.apply(instance);
    return instance;
  }
  private apply(instance: OriginalCombatEffectInstance): void {
    instance.mesh.scale.setScalar(instance.state.scale);
    instance.mesh.material.opacity = instance.state.opacity;
    if (instance.kind === 'blood') applyOriginalBloodTextureTransform(instance.mesh.material.map!, instance.state as OriginalBloodEffectState);
  }
  private face(instance: OriginalCombatEffectInstance, target: Vec3): void {
    if (instance.kind === 'blood') {
      instance.mesh.up.set(0, 1, 0); // blood explicitly supplies source up=(0,0,1)
    } else {
      // Miss/puff omit pointAt's up argument. MX2004 p458 specifies world Y,
      // with world X instead when the target direction is parallel to Y.
      // Source Y maps to copy -Z; choose the documented pole fallback before
      // Three.lookAt can substitute its own small direction perturbation.
      const position = instance.mesh.getWorldPosition(new THREE.Vector3());
      const parallelToSourceY = target.x === position.x && target.y === position.y && target.z !== position.z;
      instance.mesh.up.set(parallelToSourceY ? 1 : 0, 0, parallelToSourceY ? 0 : -1);
    }
    instance.mesh.lookAt(new THREE.Vector3(target.x, target.y, target.z));
  }
  private validateCallbackTime(time: number | undefined): void {
    if (time !== undefined && (!Number.isFinite(time) || time < 0)) throw new Error('Invalid original combat effect callback time');
  }
  private validateVector(position: Vec3): void {
    if (![position.x, position.y, position.z].every(Number.isFinite)) throw new Error('Invalid original combat effect position');
  }
}
