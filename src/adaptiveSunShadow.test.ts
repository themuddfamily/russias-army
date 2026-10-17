import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  AdaptiveSunShadow,
  createAdaptiveSunShadow,
  DEFAULT_ADAPTIVE_SUN_DIRECTION,
} from './adaptiveSunShadow';

function center(shadow: AdaptiveSunShadow): [number, number, number] {
  const value = shadow.debug.snappedCenter;
  return [value.x, value.y, value.z];
}

describe('AdaptiveSunShadow', () => {
  it('creates one correctly configured high-tier sun map with stable diagnostics', () => {
    const parent = new THREE.Group();
    const shadow = createAdaptiveSunShadow(parent);
    const debug = shadow.getDebugState();

    expect(shadow.ownsLight).toBe(true);
    expect(parent.children).toEqual([shadow.light, shadow.light.target]);
    expect(shadow.light.name).toBe('AdaptiveSun');
    expect(shadow.light.color.getHex()).toBe(0xffe4c6);
    expect(shadow.light.intensity).toBeCloseTo(2.85, 6);
    expect(shadow.light.castShadow).toBe(true);
    expect(shadow.shadowMapType).toBe(THREE.PCFSoftShadowMap);
    expect(shadow.light.shadow.mapSize.toArray()).toEqual([2048, 2048]);
    expect(shadow.light.shadow.camera.left).toBe(-44);
    expect(shadow.light.shadow.camera.right).toBe(44);
    expect(shadow.light.shadow.camera.top).toBe(44);
    expect(shadow.light.shadow.camera.bottom).toBe(-44);
    expect(shadow.light.shadow.bias).toBeCloseTo(-.00008, 8);
    expect(shadow.light.shadow.normalBias).toBe(.025);
    expect(shadow.light.shadow.radius).toBe(2.5);
    expect(debug).toBe(shadow.debug);
    expect(shadow.getDebugState()).toBe(debug);
    expect(debug).toMatchObject({
      enabled: true,
      mapSize: 2048,
      span: 88,
      worldUnitsPerTexel: 88 / 2048,
      bias: -.00008,
      normalBias: .025,
      type: 'PCFSoftShadowMap',
    });
    shadow.dispose();
  });

  it('focuses ahead on the ground, preserves the authored sun direction and clamps at arena edges', () => {
    const shadow = new AdaptiveSunShadow(new THREE.Group());
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(10, 4, 10);
    camera.rotation.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    shadow.update(camera);

    expect(shadow.debug.snappedCenter.x).toBeCloseTo(10, 1);
    expect(shadow.debug.snappedCenter.y).toBeCloseTo(0, 1);
    expect(shadow.debug.snappedCenter.z).toBeCloseTo(-13, 1);
    const actualDirection = shadow.light.position.clone().sub(shadow.light.target.position).normalize();
    const expectedDirection = new THREE.Vector3(
      DEFAULT_ADAPTIVE_SUN_DIRECTION.x,
      DEFAULT_ADAPTIVE_SUN_DIRECTION.y,
      DEFAULT_ADAPTIVE_SUN_DIRECTION.z,
    ).normalize();
    expect(actualDirection.distanceTo(expectedDirection)).toBeLessThan(1e-10);

    camera.position.set(10_000, 4, -10_000);
    camera.updateMatrixWorld(true);
    shadow.update(camera);
    expect(shadow.debug.snappedCenter.x).toBeGreaterThanOrEqual(-64);
    expect(shadow.debug.snappedCenter.x).toBeLessThanOrEqual(64);
    expect(shadow.debug.snappedCenter.z).toBeGreaterThanOrEqual(-64);
    expect(shadow.debug.snappedCenter.z).toBeLessThanOrEqual(64);
    shadow.dispose();
  });

  it('holds for sub-texel motion and advances on integral light-space texels', () => {
    const shadow = new AdaptiveSunShadow(new THREE.Group(), { focusDistance: 0 });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 2, 0);
    camera.updateMatrixWorld(true);
    const debugIdentity = shadow.update(camera);
    const centerIdentity = shadow.debug.snappedCenter;
    const initial = center(shadow);
    const lightIdentity = shadow.light;
    const targetIdentity = shadow.light.target;

    camera.position.x = .01;
    camera.updateMatrixWorld(true);
    expect(shadow.update(camera)).toBe(debugIdentity);
    expect(shadow.debug.snappedCenter).toBe(centerIdentity);
    expect(center(shadow)).toEqual(initial);

    camera.position.x = .2;
    camera.updateMatrixWorld(true);
    shadow.update(camera);
    expect(center(shadow)).not.toEqual(initial);
    expect(shadow.light).toBe(lightIdentity);
    expect(shadow.light.target).toBe(targetIdentity);

    const right = new THREE.Vector3().crossVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-46, 34, 18).normalize(),
    ).normalize();
    const movement = shadow.light.target.position.clone();
    const texelMovement = movement.dot(right) / shadow.debug.worldUnitsPerTexel;
    expect(texelMovement).toBeCloseTo(Math.round(texelMovement), 8);
    shadow.dispose();
  });

  it('wraps but does not attach or dispose a caller-owned light', () => {
    const parent = new THREE.Group();
    const suppliedParent = new THREE.Group();
    const supplied = new THREE.DirectionalLight(0x123456, 1.25);
    suppliedParent.add(supplied, supplied.target);
    const dispose = vi.spyOn(supplied.shadow, 'dispose');
    const shadow = new AdaptiveSunShadow(parent, { light: supplied });

    expect(shadow.ownsLight).toBe(false);
    expect(parent.children).toEqual([]);
    expect(supplied.parent).toBe(suppliedParent);
    expect(supplied.target.parent).toBe(suppliedParent);
    expect(supplied.color.getHex()).toBe(0x123456);
    expect(supplied.intensity).toBe(1.25);
    shadow.dispose();
    shadow.dispose();
    expect(dispose).not.toHaveBeenCalled();
    expect(supplied.parent).toBe(suppliedParent);
    expect(shadow.debug.enabled).toBe(false);
  });

  it('disposes an owned shadow allocation and attachments exactly once', () => {
    const parent = new THREE.Group();
    const shadow = new AdaptiveSunShadow(parent);
    const dispose = vi.spyOn(shadow.light.shadow, 'dispose');
    const camera = new THREE.PerspectiveCamera();
    shadow.update(camera);

    shadow.dispose();
    shadow.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(parent.children).toEqual([]);
    expect(shadow.debug.enabled).toBe(false);
    expect(shadow.update(camera)).toBe(shadow.debug);
  });

  it('supports disabled low-tier configuration without moving or allocating a shadow map', () => {
    const shadow = new AdaptiveSunShadow(new THREE.Group(), { enabled: false });
    const camera = new THREE.PerspectiveCamera();
    const initialPosition = shadow.light.position.clone();
    expect(shadow.light.castShadow).toBe(false);
    expect(shadow.update(camera)).toBe(shadow.debug);
    expect(shadow.light.position).toEqual(initialPosition);
    expect(shadow.light.shadow.map).toBeNull();
    expect(shadow.debug.enabled).toBe(false);
    shadow.dispose();
  });

  it('validates configuration and update inputs', () => {
    const parent = new THREE.Group();
    expect(() => new AdaptiveSunShadow(null as unknown as THREE.Object3D)).toThrow(/parent/);
    expect(() => new AdaptiveSunShadow(parent, { enabled: 'yes' as unknown as boolean })).toThrow(/enabled/);
    expect(() => new AdaptiveSunShadow(parent, { mapSize: 1000 })).toThrow(/mapSize/);
    expect(() => new AdaptiveSunShadow(parent, { span: 0 })).toThrow(/span/);
    expect(() => new AdaptiveSunShadow(parent, { focusDistance: -1 })).toThrow(/focusDistance/);
    expect(() => new AdaptiveSunShadow(parent, { groundY: Number.NaN })).toThrow(/groundY/);
    expect(() => new AdaptiveSunShadow(parent, { direction: { x: 0, y: 0, z: 0 } })).toThrow(/direction/);
    expect(() => new AdaptiveSunShadow(parent, { cameraNear: 2, cameraFar: 2 })).toThrow(/cameraFar/);
    expect(() => new AdaptiveSunShadow(parent, { normalBias: -1 })).toThrow(/normalBias/);
    expect(() => new AdaptiveSunShadow(parent, {
      bounds: { minX: 1, maxX: 0, minZ: -1, maxZ: 1 },
    })).toThrow(/maxX/);
    expect(() => new AdaptiveSunShadow(parent, {
      bounds: { minX: 0, maxX: .01, minZ: 0, maxZ: .01 },
    })).toThrow(/snapping guard/);
    expect(() => new AdaptiveSunShadow(parent, {
      shadowMapType: 999 as THREE.ShadowMapType,
    })).toThrow(/shadowMapType/);

    const shadow = new AdaptiveSunShadow(parent);
    expect(() => shadow.update(new THREE.Group() as unknown as THREE.Camera)).toThrow(/camera/);
    shadow.dispose();
  });
});
