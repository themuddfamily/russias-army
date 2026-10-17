import * as THREE from 'three';
import { OriginalEffectPlanePool } from './originalEffectPlanePool';
import { describe, expect, it, vi } from 'vitest';
import { ORIGINAL_MAP_SCALE } from '../shared/originalMapProfile';
import {
  createOriginalCombatEffectResources, loadOriginalCombatEffectResources,
  OriginalCombatEffectPresentation, ORIGINAL_COMBAT_EFFECT_URLS,
} from './originalCombatEffectPresentation';

function fixture() {
  const resources = createOriginalCombatEffectResources({
    spatter: new THREE.Texture(), decalspas: new THREE.Texture(), decal: new THREE.Texture(), pufft: new THREE.Texture(),
  });
  const parent = new THREE.Group();
  return { resources, parent, presentation: new OriginalCombatEffectPresentation(resources, parent) };
}
const eye = { x: 4, y: 5, z: 12 };

describe('recovered miss, blood and RPG puff presentation', () => {
  it('loads all source textures with source RGBA/near filtering adapter and cleans partial failures', async () => {
    const loadAsync = vi.fn(async (_url: string) => new THREE.Texture());
    const resources = await loadOriginalCombatEffectResources({ loadAsync });
    expect(loadAsync.mock.calls.map(call => call[0])).toEqual(Object.values(ORIGINAL_COMBAT_EFFECT_URLS));
    for (const texture of Object.values(resources.textures)) {
      expect(texture.magFilter).toBe(THREE.LinearFilter);
      expect(texture.generateMipmaps).toBe(false);
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    }
    resources.dispose();
    const partial = new THREE.Texture();
    const disposal = vi.spyOn(partial, 'dispose');
    const failure = new Error('missing cast');
    await expect(loadOriginalCombatEffectResources({ loadAsync: vi.fn().mockResolvedValueOnce(partial)
      .mockRejectedValue(failure) })).rejects.toBe(failure);
    expect(disposal).toHaveBeenCalledOnce();
  });

  it('places miss planes exactly one source unit along raw normal, rotates their front toward surface exterior', () => {
    const { resources, presentation, parent } = fixture();
    parent.position.set(2, 3, 4); parent.rotation.y = .7;
    const position = { x: 8, y: 9, z: 10 };
    const normal = { x: .6, y: 0, z: .8 };
    const miss = presentation.spawnMiss(position, normal, false);
    expect(resources.geometry.parameters.width).toBe(50 * ORIGINAL_MAP_SCALE);
    expect(miss.mesh.scale.x).toBe(.4);
    expect(miss.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(
      8 + .6 * ORIGINAL_MAP_SCALE, 9, 10 + .8 * ORIGINAL_MAP_SCALE,
    ))).toBeLessThan(1e-12);
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(miss.mesh.getWorldQuaternion(new THREE.Quaternion()));
    expect(front.distanceTo(new THREE.Vector3(.6, 0, .8))).toBeLessThan(1e-12);
    expect(miss.mesh.material.opacity).toBe(.4);
    expect(miss.mesh.material.side).toBe(THREE.FrontSide);
    expect(miss.mesh.material.toneMapped).toBe(false);
    expect(miss.mesh.material.depthWrite).toBe(false);
    expect(miss.mesh.layers.mask).toBe(2);
    expect(presentation.spawnMiss(position, normal, true).mesh.scale.x).toBe(.5);
    presentation.dispose(); resources.dispose();
  });

  it('retains miss80 callbacks and removes on81, even without goody', () => {
    const { resources, presentation } = fixture();
    const miss = presentation.spawnMiss({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, false);
    presentation.stepCallbacks(null, 80);
    expect(presentation.get(miss.id)).toBe(miss);
    expect(miss.mesh.material.opacity).toBe(.4);
    presentation.step(null);
    expect(presentation.size).toBe(0);
    presentation.dispose(); resources.dispose();
  });

  it('keeps blood constructor transform before first scroll, faces full eye direction only on callback, removes on3', () => {
    const { resources, presentation } = fixture();
    const blood = presentation.spawnBlood({ x: 0, y: 0, z: 0 }, eye);
    expect(blood.mesh.scale.x).toBe(2);
    expect(blood.mesh.quaternion.equals(new THREE.Quaternion())).toBe(true);
    const texture = blood.mesh.material.map!;
    expect(texture.repeat.toArray()).toEqual([1 / 3, 1 / 3]);
    expect(texture.offset.x).toBe(-1 / 3);
    expect(texture.offset.y).toBeCloseTo(1 / 3);
    presentation.step(eye);
    expect(texture.offset.x).toBeCloseTo(0);
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(blood.mesh.quaternion);
    expect(front.distanceTo(new THREE.Vector3(4, 5, 12).normalize())).toBeLessThan(1e-12);
    presentation.step({ x: 12, y: 0, z: 0 });
    expect(texture.offset.x).toBeCloseTo(1 / 3);
    expect(presentation.get(blood.id)).toBe(blood);
    presentation.step(eye);
    expect(texture.offset.x).toBeCloseTo(2 / 3); // terminal scroll occurs before disposal
    expect(presentation.get(blood.id)).toBeUndefined();
    presentation.dispose(); resources.dispose();
  });

  it('freezes blood lifetime, texture and facing without goody while other actor types keep advancing', () => {
    const { resources, presentation } = fixture();
    const blood = presentation.spawnBlood({ x: 0, y: 0, z: 0 });
    const puff = presentation.spawnPuff({ x: 0, y: 0, z: 0 }, eye, () => 0);
    presentation.stepCallbacks(null, 31);
    expect(presentation.get(blood.id)).toBe(blood);
    expect(blood.mesh.material.map!.offset.x).toBe(-1 / 3);
    expect(presentation.get(puff.id)).toBeUndefined();
    presentation.dispose(); resources.dispose();
  });

  it('puff uses constructor-only target orientation and random self roll, grows6 each callback and removes31', () => {
    const { resources, presentation } = fixture();
    const puff = presentation.spawnPuff({ x: 1, y: 2, z: 3 }, eye, () => .5);
    expect(puff.mesh.position.toArray()).toEqual([1, 2 + 10 * ORIGINAL_MAP_SCALE, 3]);
    expect(puff.mesh.scale.x).toBe(.01);
    expect(puff.mesh.material.opacity).toBe(.5);
    const quaternion = puff.mesh.quaternion.clone();
    const expected = new THREE.Object3D();
    expected.position.copy(puff.mesh.position); expected.up.set(0, 0, -1);
    expected.lookAt(new THREE.Vector3(4, 5, 12)); expected.rotateZ(190 * Math.PI / 180);
    expect(quaternion.angleTo(expected.quaternion)).toBeLessThan(1e-7);
    presentation.step({ x: -100, y: 200, z: -300 });
    expect(puff.mesh.quaternion.equals(quaternion)).toBe(true);
    expect(puff.mesh.scale.x).toBe(.12);
    expect(puff.mesh.material.opacity).toBeCloseTo(.967);
    presentation.stepCallbacks(eye, 29);
    expect(puff.mesh.scale.x).toBe(3.6);
    expect(puff.mesh.material.opacity).toBeCloseTo(.01);
    expect(presentation.get(puff.id)).toBe(puff);
    presentation.step(eye);
    expect(presentation.size).toBe(0);
    presentation.dispose(); resources.dispose();
  });

  it.each([
    { normal: [1, 0, 0], right: [0, 1, 0], up: [0, 0, 1] },
    { normal: [0, 1, 0], right: [-1, 0, 0], up: [0, 0, 1] },
    { normal: [0, 0, 1], right: [0, 1, 0], up: [-1, 0, 0] },
    { normal: [0, 0, -1], right: [0, -1, 0], up: [-1, 0, 0] },
  ])('uses source default Y up and exact X pole fallback for miss normal $normal', ({ normal, right, up }) => {
    const { resources, presentation } = fixture();
    const miss = presentation.spawnMiss({ x: 0, y: 0, z: 0 }, { x: normal[0], y: normal[1], z: normal[2] }, false);
    // Independent cardinal world bases include the source rotateX(180).
    const rotation = miss.mesh.getWorldQuaternion(new THREE.Quaternion());
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).distanceTo(new THREE.Vector3(...right))).toBeLessThan(1e-12);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).distanceTo(new THREE.Vector3(...up))).toBeLessThan(1e-12);
    presentation.dispose(); resources.dispose();
  });

  it.each([
    { direction: [1, 0, 0], right: [0, -1, 0], up: [0, 0, -1] },
    { direction: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] },
    { direction: [0, 0, 1], right: [0, -1, 0], up: [1, 0, 0] },
    { direction: [0, 0, -1], right: [0, 1, 0], up: [1, 0, 0] },
  ])('applies puff random roll after source default Y/X up for direction $direction', ({ direction, right, up }) => {
    const { resources, presentation } = fixture();
    const puff = presentation.spawnPuff({ x: 0, y: 0, z: 0 },
      { x: direction[0], y: 10 * ORIGINAL_MAP_SCALE + direction[1], z: direction[2] }, () => 0);
    const angle = 10 * Math.PI / 180;
    const expectedRight = new THREE.Vector3(...right).multiplyScalar(Math.cos(angle))
      .addScaledVector(new THREE.Vector3(...up), Math.sin(angle));
    const expectedUp = new THREE.Vector3(...up).multiplyScalar(Math.cos(angle))
      .addScaledVector(new THREE.Vector3(...right), -Math.sin(angle));
    const rotation = puff.mesh.getWorldQuaternion(new THREE.Quaternion());
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).distanceTo(expectedRight)).toBeLessThan(1e-12);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).distanceTo(expectedUp)).toBeLessThan(1e-12);
    presentation.dispose(); resources.dispose();
  });

  it('preserves blood explicit source Z up independently of omitted miss/puff up', () => {
    const { resources, presentation } = fixture();
    const blood = presentation.spawnBlood({ x: 0, y: 0, z: 0 });
    presentation.step({ x: 1, y: 0, z: 0 });
    const rotation = blood.mesh.getWorldQuaternion(new THREE.Quaternion());
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-12);
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-12);
    presentation.dispose(); resources.dispose();
  });

  it('restores only a replayed puff age and preserves its constructor orientation', () => {
    const { resources, presentation } = fixture();
    const live = presentation.spawnPuff({ x: 0, y: 0, z: 0 }, eye, () => 0, 'live');
    const blood = presentation.spawnBlood({ x: 0, y: 0, z: 0 });
    const aged = presentation.spawnPuff({ x: 1, y: 0, z: 0 }, eye, () => .5, 'aged', 21);
    expect(aged.mesh.scale.x).toBe(126 * .02);
    expect(aged.mesh.material.opacity).toBeCloseTo((100 - 126 * .55) / 100);
    expect(live.mesh.scale.x).toBe(.01);
    expect(blood.mesh.material.map!.offset.x).toBe(-1 / 3);
    const fresh = presentation.spawnPuff({ x: 1, y: 0, z: 0 }, eye, () => .5, 'fresh');
    expect(aged.mesh.quaternion.equals(fresh.mesh.quaternion)).toBe(true);
    expect(presentation.spawnPuff({ x: 0, y: 0, z: 0 }, eye, () => 0, 'expired', 31).state.alive).toBe(false);
    expect(presentation.get('expired')).toBeUndefined();
    expect(presentation.spawnPuff({ x: 0, y: 0, z: 0 }, eye, () => 0, 'old', 200).state.alive).toBe(false);
    for (const invalid of [-1, .5, 201, Infinity, NaN]) {
      expect(() => presentation.spawnPuff({ x: 0, y: 0, z: 0 }, eye, () => 0, 'live', invalid)).toThrow();
      expect(presentation.get('live')).toBe(live);
    }
    presentation.dispose(); resources.dispose();
  });

  it('does not double-age restored puffs or consume older callbacks for newly born miss and blood actors', () => {
    const { resources, presentation } = fixture();
    const miss = presentation.spawnMiss({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, false, 'miss', 10);
    const blood = presentation.spawnBlood({ x: 0, y: 0, z: 0 }, eye, 'blood', 10);
    const puff = presentation.spawnPuff({ x: 0, y: 0, z: 0 }, eye, () => 0, 'aged', 21, 10);
    for (const time of [9, 9.9, 10]) presentation.step(eye, time);
    expect(miss.state).toMatchObject({ remainingCallbacks: 80 });
    expect(blood.state).toMatchObject({ remainingCallbacks: 8 });
    expect(puff.state).toMatchObject({ myscale: 126 });
    presentation.step(eye, 10.1);
    presentation.step(eye, 10.1);
    expect(miss.state).toMatchObject({ remainingCallbacks: 79 });
    expect(blood.state).toMatchObject({ remainingCallbacks: 4 });
    expect(puff.state).toMatchObject({ myscale: 132 });
    for (let callback = 2; callback <= 9; callback++) presentation.step(eye, 10 + callback / 10);
    expect(presentation.get(puff.id)).toBe(puff);
    presentation.step(eye, 11);
    expect(presentation.get(puff.id)).toBeUndefined();
    expect(presentation.get(miss.id)).toBe(miss);
    presentation.dispose(); resources.dispose();
  });

  it('rejects malformed birth and callback epochs without replacing actors', () => {
    const { resources, presentation } = fixture();
    const live = presentation.spawnPuff({ x: 0, y: 0, z: 0 }, eye, () => 0, 'live', 0, 1);
    for (const time of [-1, Infinity, NaN]) {
      expect(() => presentation.spawnPuff({ x: 0, y: 0, z: 0 }, eye, () => 0, 'live', 0, time)).toThrow();
      expect(() => presentation.step(eye, time)).toThrow();
      expect(presentation.get('live')).toBe(live);
      expect(live.mesh.scale.x).toBe(.01);
    }
    presentation.dispose(); resources.dispose();
  });

  it('scrolls the named spatter shader once for each concurrent blood callback and wraps across actors', () => {
    const { resources, presentation } = fixture();
    const first = presentation.spawnBlood({ x: 0, y: 0, z: 0 });
    const second = presentation.spawnBlood({ x: 1, y: 0, z: 0 });
    expect(first.mesh.material).toBe(second.mesh.material);
    expect(first.mesh.material.map).toBe(second.mesh.material.map);
    // Two source actor callbacks: shared x starts1, becomes0, then-1.
    presentation.step(eye);
    for (const actor of [first, second]) {
      expect(actor.state).toMatchObject({ remainingCallbacks: 4, texturePosition: { x: -1, y: 1, z: 0 } });
      expect(actor.mesh.material.map!.offset.x).toBeCloseTo(1 / 3);
      expect(actor.mesh.material.map!.offset.y).toBeCloseTo(1 / 3);
    }
    // Next two callbacks: -2, then -3 wraps to0/y2, shared by both.
    presentation.step(eye);
    expect(first.mesh.material.map!.offset.length()).toBe(0);
    expect(second.state).toMatchObject({ remainingCallbacks: 0, texturePosition: { x: 0, y: 2, z: 0 } });
    presentation.step(eye);expect(presentation.size).toBe(0);
    expect(first.mesh.material.map!.offset.x).toBeCloseTo(2 / 3); // Both terminal actors still scroll.
    presentation.dispose(); resources.dispose();
  });

  it('a new blood constructor resets every live model and terminal actors mutate the shared shader before removal', () => {
    const { resources, presentation } = fixture();
    const old = presentation.spawnBlood({ x: 0, y: 0, z: 0 });presentation.step(eye);
    expect(old.mesh.material.map!.offset.x).toBeCloseTo(0);
    const young = presentation.spawnBlood({ x: 1, y: 2, z: 3 });
    expect(old.mesh.material.map!.offset.x).toBe(-1 / 3); // Constructor assigns shared position(1,1,0).
    expect(old.state).toMatchObject({ remainingCallbacks: 4 });expect(young.state).toMatchObject({ remainingCallbacks: 8 });
    presentation.step(eye);
    expect(old.mesh.material.map!.offset.x).toBeCloseTo(1 / 3);expect(young.mesh.material.map!.offset.x).toBeCloseTo(1 / 3);
    expect(old.state).toMatchObject({ remainingCallbacks: 0 });expect(young.state).toMatchObject({ remainingCallbacks: 4 });
    // Old terminal callback takes shared x-1 to-2, then young wraps it to0/y2.
    presentation.step(eye);expect(presentation.get(old.id)).toBeUndefined();expect(presentation.get(young.id)).toBe(young);
    expect(young.state).toMatchObject({ remainingCallbacks: 0, texturePosition: { x: 0, y: 2, z: 0 } });
    expect(young.mesh.material.map!.offset.length()).toBe(0);
    expect(old.mesh.position.toArray()).toEqual([0, 0, 0]);expect(young.mesh.position.toArray()).toEqual([1, 2, 3]);
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(young.mesh.quaternion);
    expect(front.distanceTo(new THREE.Vector3(3, 3, 9).normalize())).toBeLessThan(1e-12);
    expect(old.mesh.quaternion.angleTo(young.mesh.quaternion)).toBeGreaterThan(.01);
    expect(old.mesh.material.opacity).toBe(.5);expect(young.mesh.material.opacity).toBe(.5);
    expect(resources.textures.spatter.repeat.toArray()).toEqual([1, 1]);
    presentation.dispose(); resources.dispose();
  });

  it('freezes the shared blood transform and independent lifetimes without goody', () => {
    const { resources, presentation } = fixture();
    const first = presentation.spawnBlood({ x: 0, y: 0, z: 0 }), second = presentation.spawnBlood({ x: 1, y: 0, z: 0 });
    presentation.stepCallbacks(null, 20);
    expect(first.state).toMatchObject({ remainingCallbacks: 8, texturePosition: { x: 1, y: 1, z: 0 } });
    expect(second.state).toMatchObject({ remainingCallbacks: 8 });expect(first.mesh.material.map!.offset.x).toBe(-1 / 3);
    presentation.step(eye);expect(first.mesh.material.map!.offset.x).toBeCloseTo(1 / 3);
    presentation.dispose(); resources.dispose();
  });

  it('keeps the shared blood texture alive across removal/clear and releases it once on owner disposal', () => {
    const { resources, presentation, parent } = fixture();
    const first = presentation.spawnBlood({ x: 0, y: 0, z: 0 }), second = presentation.spawnBlood({ x: 1, y: 0, z: 0 });
    const texture = first.mesh.material.map!, disposeTexture = vi.spyOn(texture, 'dispose');
    const disposeFirst = vi.spyOn(first.mesh.material, 'dispose'), disposeSecond = vi.spyOn(second.mesh.material, 'dispose');
    const disposeBase = vi.spyOn(resources.textures.spatter, 'dispose');
    presentation.remove(first.id);expect(disposeFirst).not.toHaveBeenCalled();expect(disposeTexture).not.toHaveBeenCalled();
    presentation.step(eye);expect(second.mesh.material.map!.offset.x).toBeCloseTo(0);
    presentation.clear();expect(disposeSecond).not.toHaveBeenCalled();expect(disposeTexture).not.toHaveBeenCalled();expect(parent.children).toHaveLength(0);
    const fresh = presentation.spawnBlood({ x: 2, y: 0, z: 0 });expect(fresh.mesh.material.map).toBe(texture);expect(texture.offset.x).toBe(-1 / 3);
    presentation.dispose();presentation.dispose();expect(disposeTexture).toHaveBeenCalledOnce();expect(disposeBase).not.toHaveBeenCalled();
    resources.dispose();resources.dispose();expect(disposeBase).toHaveBeenCalledOnce();
  });

  it('does not reset live shared blood atlas state when a malformed constructor is rejected', () => {
    const { resources, presentation } = fixture();const blood = presentation.spawnBlood({ x: 0, y: 0, z: 0 });presentation.step(eye);
    expect(() => presentation.spawnBlood({ x: NaN, y: 0, z: 0 })).toThrow();
    expect(() => presentation.spawnBlood({ x: 1, y: 0, z: 0 }, eye, blood.id, -1)).toThrow();
    expect(presentation.get(blood.id)).toBe(blood);expect(blood.mesh.material.map!.offset.x).toBeCloseTo(0);expect(blood.state).toMatchObject({ remainingCallbacks: 4 });
    presentation.dispose(); resources.dispose();
  });

  it('retains pooled shaders across replacement and clear; shared owner cleanup is idempotent', () => {
    const { resources, parent, presentation } = fixture();
    const puff = presentation.spawnPuff({ x: 0, y: 0, z: 0 }, eye, () => 0, 'same');
    const material = vi.spyOn(puff.mesh.material, 'dispose');
    const texture = vi.spyOn(puff.mesh.material.map!, 'dispose');
    const geometry = vi.spyOn(resources.geometry, 'dispose');
    const sharedTexture = vi.spyOn(resources.textures.pufft, 'dispose');
    presentation.spawnPuff({ x: 1, y: 0, z: 0 }, eye, () => 0, 'same');
    expect(material).not.toHaveBeenCalled(); expect(texture).not.toHaveBeenCalled();
    presentation.clear();
    expect(material).not.toHaveBeenCalled(); expect(texture).not.toHaveBeenCalled();
    presentation.dispose();
    expect(material).toHaveBeenCalledOnce(); expect(texture).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
    expect(geometry).not.toHaveBeenCalled(); expect(sharedTexture).not.toHaveBeenCalled();
    resources.dispose(); resources.dispose();
    expect(geometry).toHaveBeenCalledOnce(); expect(sharedTexture).toHaveBeenCalledOnce();
  });
  it('preflights blood capacity before resetting the live named shader atlas, while same-ID replacement uses released capacity', () => {
    const { resources, parent, presentation: unused } = fixture();
    unused.dispose();
    const pool = new OriginalEffectPlanePool(resources.geometry, { maxModels: 1, maxShaders: 2 });
    const presentation = new OriginalCombatEffectPresentation(resources, parent, pool);
    try {
      const blood = presentation.spawnBlood({ x: 0, y: 0, z: 0 }, null, 'live');
      presentation.step(eye);
      const texture = blood.mesh.material.map!, offset = texture.offset.clone();
      expect(() => presentation.spawnBlood({ x: 1, y: 0, z: 0 }, null, 'overflow')).toThrow();
      expect(presentation.get('live')).toBe(blood);
      expect(texture.offset).toEqual(offset);
      expect(blood.state).toMatchObject({ remainingCallbacks: 4, texturePosition: { x: 0, y: 1, z: 0 } });
      const replacement = presentation.spawnBlood({ x: 2, y: 0, z: 0 }, null, 'live');
      expect(replacement.mesh).toBe(blood.mesh);
      expect(texture.offset.x).toBe(-1 / 3);
    } finally { presentation.dispose(); pool.dispose(); resources.dispose(); }
  });

  it('returns blood planes with their retained orientation and keeps borrowed shaders alive until pool disposal', () => {
    const { resources, parent, presentation: unused } = fixture();
    unused.dispose();
    const pool = new OriginalEffectPlanePool(resources.geometry);
    const presentation = new OriginalCombatEffectPresentation(resources, parent, pool);
    try {
      const first = presentation.spawnBlood({ x: 0, y: 0, z: 0 }, null, 'first');
      presentation.step(eye);
      const rotation = first.mesh.quaternion.clone(), material = first.mesh.material;
      const disposeMaterial = vi.spyOn(material, 'dispose');
      presentation.remove('first');
      const next = presentation.spawnBlood({ x: 3, y: 0, z: 0 }, null, 'next');
      expect(next.mesh).toBe(first.mesh);
      expect(next.mesh.quaternion.toArray()).toEqual(rotation.toArray());
      expect(next.mesh.material).toBe(material);
      presentation.dispose();
      expect(pool.isDisposed).toBe(false);
      expect(disposeMaterial).not.toHaveBeenCalled();
      pool.dispose();
      expect(disposeMaterial).toHaveBeenCalledOnce();
    } finally { presentation.dispose(); pool.dispose(); resources.dispose(); }
  });

  it('discards actors safely after borrowed pool disposal and rejects late births without re-admission', () => {
    const { resources, parent, presentation: unused } = fixture();
    unused.dispose();
    const pool = new OriginalEffectPlanePool(resources.geometry);
    const presentation = new OriginalCombatEffectPresentation(resources, parent, pool);
    try {
      const blood = presentation.spawnBlood({ x: 0, y: 0, z: 0 });
      pool.dispose();
      expect(blood.mesh.parent).toBeNull();
      expect(() => presentation.step(null)).not.toThrow();
      expect(presentation.size).toBe(0);
      expect(() => presentation.spawnBlood({ x: 1, y: 0, z: 0 })).toThrow();
      expect(parent.children).toHaveLength(0);
      expect(() => presentation.dispose()).not.toThrow();
    } finally { presentation.dispose(); pool.dispose(); resources.dispose(); }
  });

});
