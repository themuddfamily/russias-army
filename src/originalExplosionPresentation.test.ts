import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  applyOriginalExplosionAtlasFrame, createOriginalExplosionResources,
  loadOriginalExplosionResources, OriginalExplosionPresentation,
} from './originalExplosionPresentation';
import { ORIGINAL_MAP_SCALE } from '../shared/originalMapProfile';
import { OriginalEffectPlanePool } from './originalEffectPlanePool';

function fixture() {
  const resources = createOriginalExplosionResources({ grenade: new THREE.Texture(), rocket: new THREE.Texture() });
  const parent = new THREE.Group();
  return { resources, parent, presentation: new OriginalExplosionPresentation(resources, parent) };
}

describe('source explosion atlas actor', () => {
  it('uses the byte-exact identical recovered RGBA images from both editions', () => {
    const base = 'docs/research-evidence/2026-09-30/director-extraction/';
    const manifest = JSON.parse(readFileSync('public/assets/original-effects/provenance.json', 'utf8'));
    for (const [kind, name, width] of [['grenade', '02879-banggrenade-rgba.png', 256], ['rocket', '01003-bangrocket-rgba.png', 128]] as const) {
      const actual = readFileSync(`public/assets/original-effects/bang${kind}.png`);
      expect(actual.equals(readFileSync(`${base}barrack/media/${name}`))).toBe(true);
      expect(actual.equals(readFileSync(`${base}woodland/media/${name}`))).toBe(true);
      expect(actual.subarray(1, 4).toString()).toBe('PNG');
      expect(actual.readUInt32BE(16)).toBe(width);
      expect(actual.readUInt32BE(20)).toBe(width);
      expect(actual[25]).toBe(6); // RGBA source color type, not opaque JPEG fallback
      expect(manifest.sources.find((source: { kind: string }) => source.kind === kind).sha256)
        .toBe(createHash('sha256').update(actual).digest('hex'));
    }
    expect(manifest.game_executed).toBe(false);
  });

  it('loads both packaged images and retains filtering/color settings', async () => {
    const loadAsync = vi.fn(async () => new THREE.Texture());
    const resources = await loadOriginalExplosionResources({ loadAsync });
    expect(loadAsync.mock.calls).toEqual([
      ['/assets/original-effects/banggrenade.png'], ['/assets/original-effects/bangrocket.png'],
    ]);
    for (const texture of Object.values(resources.textures)) {
      expect(texture.magFilter).toBe(THREE.LinearFilter);
      expect(texture.minFilter).toBe(THREE.LinearFilter);
      expect(texture.generateMipmaps).toBe(false);
      expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    }
    resources.dispose();
  });

  it('releases a successful partial load when another image fails', async () => {
    const texture = new THREE.Texture();
    const disposal = vi.spyOn(texture, 'dispose');
    const failure = new Error('missing grenade');
    await expect(loadOriginalExplosionResources({ loadAsync: vi.fn()
      .mockRejectedValueOnce(failure).mockResolvedValueOnce(texture) })).rejects.toBe(failure);
    expect(disposal).toHaveBeenCalledOnce();
  });

  it('selects all sixteen row-major cells with source first increment and terminal wrap', () => {
    const texture = new THREE.Texture();
    for (let frame = 0; frame <= 16; frame++) {
      applyOriginalExplosionAtlasFrame(texture, frame);
      const index = frame % 16;
      expect(texture.repeat.toArray()).toEqual([.25, .25]);
      expect(texture.offset.toArray()).toEqual([(index % 4) / 4, .75 - Math.floor(index / 4) / 4]);
      const uv = new THREE.Vector2(.5, .5).applyMatrix3(texture.matrix);
      expect(uv.x).toBe((index % 4 + .5) / 4);
      expect(uv.y).toBe((3 - Math.floor(index / 4) + .5) / 4);
    }
    for (const invalid of [-1, 17, .5, NaN]) expect(() => applyOriginalExplosionAtlasFrame(texture, invalid)).toThrow();
  });

  it('uses source plane50 and scale7/8, blend50, white emissive rendering and front face', () => {
    const { presentation, resources } = fixture();
    const grenade = presentation.spawn('g', 'grenade', { x: 3, y: 4, z: 5 });
    const rocket = presentation.spawn('r', 'rocket', { x: 6, y: 7, z: 8 });
    expect(resources.geometry.parameters.width).toBe(50 * ORIGINAL_MAP_SCALE);
    expect(resources.geometry.parameters.height).toBe(50 * ORIGINAL_MAP_SCALE);
    expect(grenade.mesh.scale.toArray()).toEqual([7, 7, 7]);
    expect(rocket.mesh.scale.toArray()).toEqual([8, 8, 8]);
    expect(grenade.mesh.position.toArray()).toEqual([3, 4, 5]);
    expect(grenade.mesh.material.opacity).toBe(.5);
    expect(grenade.mesh.material.transparent).toBe(true);
    expect(grenade.mesh.material.color.getHex()).toBe(0xffffff);
    expect(grenade.mesh.material.side).toBe(THREE.FrontSide);
    expect(grenade.mesh.material.toneMapped).toBe(false);
    presentation.dispose(); resources.dispose();
  });

  it('increments before rendering first callback and removes after exactly sixteen', () => {
    const { presentation, resources, parent } = fixture();
    const instance = presentation.spawn('g', 'grenade', { x: 0, y: 0, z: 0 });
    expect(instance.frame).toBe(0);
    for (let callback = 1; callback <= 15; callback++) {
      presentation.step({ x: 0, y: 0, z: 10 });
      expect(instance.frame).toBe(callback);
      expect(instance.remainingCallbacks).toBe(16 - callback);
      expect(presentation.get('g')).toBe(instance);
      expect(instance.mesh.material.opacity).toBe(.5); // no time fade
    }
    presentation.step({ x: 0, y: 0, z: 10 });
    expect(instance.frame).toBe(16);
    expect(instance.remainingCallbacks).toBe(0);
    expect(presentation.size).toBe(0);
    expect(parent.children).toHaveLength(0);
    presentation.dispose(); resources.dispose();
  });

  it('freezes all actor state without goody and preserves facing for vertical-only differences', () => {
    const { presentation, resources } = fixture();
    const instance = presentation.spawn('g', 'grenade', { x: 2, y: 3, z: 4 });
    presentation.faceAll({ x: 8, y: 6, z: 4 });
    const original = instance.mesh.quaternion.clone();
    presentation.step(null);
    expect(instance.frame).toBe(0);
    expect(instance.remainingCallbacks).toBe(16);
    expect(instance.mesh.quaternion.equals(original)).toBe(true);
    presentation.step({ x: 2, y: 30, z: 4 });
    expect(instance.frame).toBe(1);
    expect(instance.mesh.quaternion.equals(original)).toBe(true);
    presentation.dispose(); resources.dispose();
  });

  it('faces the full source eye direction with Y-up and a fixed world anchor', () => {
    const { presentation, resources, parent } = fixture();
    parent.position.set(4, 5, 6);
    parent.rotation.y = .3;
    const instance = presentation.spawn('g', 'grenade', { x: 2, y: 3, z: 4 });
    presentation.faceAll({ x: 10, y: 9, z: -2 });
    expect(instance.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(instance.position)).toBeLessThan(1e-12);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(instance.mesh.getWorldQuaternion(new THREE.Quaternion()));
    expect(forward.distanceTo(new THREE.Vector3(8, 6, -6).normalize())).toBeLessThan(1e-12);
    expect(instance.frame).toBe(0);
    presentation.dispose(); resources.dispose();
  });

  it('restores late-join age without replay and independently scrolls concurrent instances', () => {
    const { presentation, resources } = fixture();
    const old = presentation.sync('old', 'rocket', { x: 1, y: 2, z: 3 }, 5)!;
    const young = presentation.spawn('young', 'rocket', { x: 4, y: 5, z: 6 });
    expect(old.frame).toBe(11);
    expect(old.mesh.material.map!.offset.toArray()).toEqual([.75, .25]);
    expect(young.mesh.material.map).not.toBe(old.mesh.material.map);
    expect(resources.textures.rocket.repeat.toArray()).toEqual([1, 1]);
    presentation.step({ x: 1, y: 2, z: 20 });
    expect(old.frame).toBe(12);
    expect(young.frame).toBe(1);
    expect(presentation.sync('old', 'rocket', { x: 7, y: 8, z: 9 }, 2)).toBe(old);
    expect(old.frame).toBe(14);
    expect(old.mesh.position.toArray()).toEqual([7, 8, 9]);
    presentation.sync('old', 'rocket', { x: 7, y: 8, z: 9 }, 0);
    expect(presentation.get('old')).toBeUndefined();
    expect(presentation.size).toBe(1);
    presentation.dispose(); resources.dispose();
  });

  it('preserves restored age through historical catch-up and retires only on future callbacks', () => {
    const { presentation, resources } = fixture();
    const restored = presentation.sync('late', 'rocket', { x: 1, y: 2, z: 3 }, 13, 10)!;
    const originalFacing = restored.mesh.quaternion.clone();
    for (const callback of [9, 9.5, 9.99, 10]) presentation.step({ x: 20, y: 0, z: 0 }, callback);
    expect(restored.remainingCallbacks).toBe(13);
    expect(restored.frame).toBe(3);
    expect(restored.mesh.quaternion.equals(originalFacing)).toBe(true);
    presentation.step({ x: 20, y: 0, z: 0 }, 10.1);
    presentation.step({ x: 20, y: 0, z: 0 }, 10.1);
    expect(restored.remainingCallbacks).toBe(12);
    expect(restored.frame).toBe(4);
    for (let callback = 2; callback <= 12; callback++) {
      presentation.step({ x: 20, y: 0, z: 0 }, 10 + callback / 10);
      expect(presentation.get('late')).toBe(restored);
    }
    presentation.step({ x: 20, y: 0, z: 0 }, 11.3);
    expect(presentation.get('late')).toBeUndefined();
    presentation.dispose(); resources.dispose();
  });

  it('resets an existing restoration epoch without advancing other actors or replaying duplicate callbacks', () => {
    const { presentation, resources } = fixture();
    const old = presentation.spawn('old', 'grenade', { x: 0, y: 0, z: 0 }, 16, 5);
    const born = presentation.spawn('born', 'rocket', { x: 0, y: 0, z: 0 }, 16, 10);
    presentation.step({ x: 0, y: 0, z: 10 }, 9);
    expect(old.remainingCallbacks).toBe(15);
    expect(born.remainingCallbacks).toBe(16);
    expect(presentation.sync('old', 'grenade', { x: 1, y: 0, z: 0 }, 7, 12)).toBe(old);
    presentation.step({ x: 0, y: 0, z: 10 }, 11);
    expect(old.remainingCallbacks).toBe(7);
    expect(born.remainingCallbacks).toBe(15);
    presentation.step({ x: 0, y: 0, z: 10 }, 12);
    expect(old.remainingCallbacks).toBe(7);
    presentation.step({ x: 0, y: 0, z: 10 }, 12.1);
    expect(old.remainingCallbacks).toBe(6);
    expect(old.lastCallbackTime).toBe(12.1);
    presentation.dispose(); resources.dispose();
  });

  it('rejects malformed callback clocks before changing restored actors', () => {
    const { presentation, resources } = fixture();
    const existing = presentation.spawn('g', 'grenade', { x: 0, y: 0, z: 0 }, 16, 1);
    for (const invalid of [-1, Infinity, NaN]) {
      expect(() => presentation.sync('g', 'grenade', { x: 0, y: 0, z: 0 }, 3, invalid)).toThrow();
      expect(() => presentation.spawn('g', 'grenade', { x: 0, y: 0, z: 0 }, 16, invalid)).toThrow();
      expect(() => presentation.step({ x: 0, y: 0, z: 10 }, invalid)).toThrow();
      expect(presentation.get('g')).toBe(existing);
      expect(existing.remainingCallbacks).toBe(16);
    }
    presentation.dispose(); resources.dispose();
  });

  it('retains returned shader resources until private pool disposal and borrows shared data', () => {
    const { presentation, resources } = fixture();
    const instance = presentation.spawn('g', 'grenade', { x: 0, y: 0, z: 0 });
    const material = vi.spyOn(instance.mesh.material, 'dispose');
    const texture = vi.spyOn(instance.mesh.material.map!, 'dispose');
    const sharedTexture = vi.spyOn(resources.textures.grenade, 'dispose');
    const geometry = vi.spyOn(resources.geometry, 'dispose');
    presentation.remove('g'); presentation.remove('g');
    expect(material).not.toHaveBeenCalled();
    expect(texture).not.toHaveBeenCalled();
    expect(presentation.planePool.stats().pooled).toBe(1);
    presentation.dispose(); presentation.dispose();
    expect(material).toHaveBeenCalledOnce();
    expect(texture).toHaveBeenCalledOnce();
    expect(geometry).not.toHaveBeenCalled();
    expect(sharedTexture).not.toHaveBeenCalled();
    resources.dispose(); resources.dispose();
    expect(geometry).toHaveBeenCalledOnce();
    expect(sharedTexture).toHaveBeenCalledOnce();
  });

  it('reuses the plane and shader FIFO across actors and blast kinds with retained birth rotation', () => {
    const { presentation, resources } = fixture();
    const first = presentation.spawn('first', 'grenade', { x: 0, y: 0, z: 0 });
    const second = presentation.spawn('second', 'rocket', { x: 1, y: 0, z: 0 });
    presentation.step({ x: 10, y: 4, z: 7 });
    const quaternion = first.mesh.quaternion.clone();
    const name = first.mesh.name;
    const material = first.mesh.material;
    const wrapper = material.map!;
    presentation.remove('first'); presentation.remove('second');
    const recycled = presentation.spawn('third', 'rocket', { x: 3, y: 2, z: 1 });
    expect(recycled.mesh).toBe(first.mesh);
    expect(recycled.mesh.material).toBe(material);
    expect(recycled.mesh.material.map).toBe(wrapper);
    expect(wrapper.source).toBe(resources.textures.rocket.source);
    expect(wrapper.offset.toArray()).toEqual([0, .75]);
    expect(wrapper.repeat.toArray()).toEqual([.25, .25]);
    expect(recycled.mesh.quaternion.equals(quaternion)).toBe(true);
    expect(recycled.mesh.name).toBe(name);
    expect(recycled.mesh.scale.toArray()).toEqual([8, 8, 8]);
    const next = presentation.spawn('fourth', 'grenade', { x: 4, y: 0, z: 0 });
    expect(next.mesh).toBe(second.mesh);
    expect(next.mesh.material.map).not.toBe(wrapper);
    expect(next.mesh.scale.toArray()).toEqual([7, 7, 7]);
    presentation.dispose(); resources.dispose();
  });

  it('returns borrowed leases without disposing a pool shared with another presentation', () => {
    const resources = createOriginalExplosionResources({ grenade: new THREE.Texture(), rocket: new THREE.Texture() });
    const pool = new OriginalEffectPlanePool(resources.geometry);
    const first = new OriginalExplosionPresentation(resources, new THREE.Group(), pool);
    const second = new OriginalExplosionPresentation(resources, new THREE.Group(), pool);
    const a = first.spawn('a', 'grenade', { x: 0, y: 0, z: 0 });
    const b = second.spawn('b', 'rocket', { x: 0, y: 0, z: 0 });
    const dispose = vi.spyOn(a.mesh.material, 'dispose');
    first.dispose(); first.dispose();
    expect(() => first.spawn('reborn', 'rocket', { x: 0, y: 0, z: 0 })).toThrow(/disposed/);
    expect(() => first.sync('reborn', 'rocket', { x: 0, y: 0, z: 0 }, 3)).toThrow(/disposed/);
    expect(() => first.step({ x: 1, y: 0, z: 1 })).toThrow(/disposed/);
    expect(() => first.faceAll({ x: 1, y: 0, z: 1 })).toThrow(/disposed/);
    expect(pool.isDisposed).toBe(false);
    expect(dispose).not.toHaveBeenCalled();
    expect(pool.stats().active).toBe(1);
    expect(second.get('b')).toBe(b);
    second.step({ x: 1, y: 0, z: 1 });
    expect(b.frame).toBe(1);
    second.dispose(); pool.dispose(); pool.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    resources.dispose();
  });

  it('preflights bounded admission before removal and credits replacement leases', () => {
    const resources = createOriginalExplosionResources({ grenade: new THREE.Texture(), rocket: new THREE.Texture() });
    const pool = new OriginalEffectPlanePool(resources.geometry, { maxModels: 1, maxShaders: 1 });
    const parent = new THREE.Group();
    const presentation = new OriginalExplosionPresentation(resources, parent, pool);
    const existing = presentation.spawn('one', 'grenade', { x: 0, y: 0, z: 0 });
    expect(() => presentation.spawn('two', 'rocket', { x: 1, y: 0, z: 0 })).toThrow();
    expect(presentation.get('one')).toBe(existing);
    expect(parent.children).toEqual([existing.mesh]);
    const replacement = presentation.spawn('one', 'rocket', { x: 2, y: 0, z: 0 });
    expect(replacement.mesh).toBe(existing.mesh);
    expect(pool.stats().allocated).toBe(1);
    expect(pool.stats().shaders).toBe(1);
    expect(replacement.kind).toBe('rocket');
    presentation.dispose(); pool.dispose(); resources.dispose();
  });

  it('rejects mutations after pool disposal while allowing idempotent presentation cleanup', () => {
    const { presentation, resources } = fixture();
    const existing = presentation.spawn('one', 'grenade', { x: 0, y: 0, z: 0 });
    presentation.planePool.dispose();
    expect(() => presentation.spawn('one', 'rocket', { x: 1, y: 0, z: 0 })).toThrow(/disposed/);
    expect(() => presentation.sync('one', 'grenade', { x: 1, y: 0, z: 0 }, 3)).toThrow(/disposed/);
    expect(() => presentation.step({ x: 1, y: 0, z: 1 })).toThrow(/disposed/);
    expect(() => presentation.faceAll({ x: 1, y: 0, z: 1 })).toThrow(/disposed/);
    expect(presentation.get('one')).toBe(existing);
    expect(existing.frame).toBe(0);
    expect(existing.position.toArray()).toEqual([0, 0, 0]);
    presentation.dispose(); presentation.dispose();
    expect(presentation.size).toBe(0);
    resources.dispose();
  });

  it('rejects malformed authority age and position without replacing the existing actor', () => {
    const { presentation, resources } = fixture();
    const instance = presentation.spawn('g', 'grenade', { x: 0, y: 0, z: 0 });
    for (const age of [-1, .5, 17, Infinity]) {
      expect(() => presentation.sync('g', 'grenade', { x: 0, y: 0, z: 0 }, age)).toThrow();
      expect(presentation.get('g')).toBe(instance);
    }
    expect(() => presentation.spawn('g', 'grenade', { x: NaN, y: 0, z: 0 })).toThrow();
    presentation.dispose(); resources.dispose();
  });
});
