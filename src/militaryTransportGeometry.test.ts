import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  MILITARY_TRANSPORT_SURFACE_ROLE,
  createMilitaryTransportShellGeometry,
} from './militaryTransportGeometry';

const ATTRIBUTE_NAMES = ['position', 'normal', 'uv', 'color', 'surfaceRole'] as const;

function values(geometry: THREE.BufferGeometry, attribute: typeof ATTRIBUTE_NAMES[number]): number[] {
  return Array.from(geometry.getAttribute(attribute).array);
}

function rolePositions(geometry: THREE.BufferGeometry, role: number): THREE.Vector3[] {
  const positions = geometry.getAttribute('position');
  const roles = geometry.getAttribute('surfaceRole');
  const result: THREE.Vector3[] = [];
  for (let index = 0; index < positions.count; index++) {
    if (roles.getX(index) === role) result.push(new THREE.Vector3().fromBufferAttribute(positions, index));
  }
  return result;
}

function average(valuesToAverage: readonly number[]): number {
  return valuesToAverage.reduce((sum, value) => sum + value, 0) / valuesToAverage.length;
}

describe('createMilitaryTransportShellGeometry', () => {
  it('builds deterministic local shell buffers and immutable accounting', () => {
    const first = createMilitaryTransportShellGeometry();
    const second = createMilitaryTransportShellGeometry();

    expect(first.geometry).not.toBe(second.geometry);
    expect(first.geometry.name).toBe('MilitaryTransportHighTierShell');
    expect(first.geometry.index).toBeNull();
    expect(first.partCount).toBe(82);
    expect(first.triangles).toBe(1_032);
    expect(first.roleVertexCounts).toEqual({
      paint: 744,
      canvas: 108,
      glass: 24,
      metal: 1_944,
      snow: 132,
      lampWarm: 72,
      lampRed: 72,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.roleVertexCounts)).toBe(true);

    expect(second.partCount).toBe(first.partCount);
    expect(second.triangles).toBe(first.triangles);
    expect(second.roleVertexCounts).toEqual(first.roleVertexCounts);
    for (const name of ATTRIBUTE_NAMES) expect(values(second.geometry, name)).toEqual(values(first.geometry, name));

    first.geometry.dispose();
    second.geometry.dispose();
  });

  it('aligns finite vertex attributes and supplies unit face normals and valid scalar roles', () => {
    const result = createMilitaryTransportShellGeometry();
    const { geometry } = result;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const uvs = geometry.getAttribute('uv');
    const colors = geometry.getAttribute('color');
    const roles = geometry.getAttribute('surfaceRole');

    expect(positions.itemSize).toBe(3);
    expect(normals.itemSize).toBe(3);
    expect(uvs.itemSize).toBe(2);
    expect(colors.itemSize).toBe(3);
    expect(roles.itemSize).toBe(1);
    expect(normals.count).toBe(positions.count);
    expect(uvs.count).toBe(positions.count);
    expect(colors.count).toBe(positions.count);
    expect(roles.count).toBe(positions.count);
    expect(positions.count).toBe(result.triangles * 3);

    const validRoles = new Set<number>(Object.values(MILITARY_TRANSPORT_SURFACE_ROLE));
    for (let index = 0; index < positions.count; index++) {
      for (const component of [
        positions.getX(index), positions.getY(index), positions.getZ(index),
        colors.getX(index), colors.getY(index), colors.getZ(index),
        uvs.getX(index), uvs.getY(index),
      ]) expect(Number.isFinite(component)).toBe(true);
      expect(Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index))).toBeCloseTo(1, 5);
      expect(uvs.getX(index)).toBeGreaterThanOrEqual(0);
      expect(uvs.getX(index)).toBeLessThanOrEqual(1);
      expect(uvs.getY(index)).toBeGreaterThanOrEqual(0);
      expect(uvs.getY(index)).toBeLessThanOrEqual(1);
      expect(Number.isInteger(roles.getX(index))).toBe(true);
      expect(validRoles.has(roles.getX(index))).toBe(true);
    }

    expect(Object.values(result.roleVertexCounts).reduce((sum, count) => sum + count, 0)).toBe(positions.count);
    for (const role of Object.keys(MILITARY_TRANSPORT_SURFACE_ROLE) as Array<keyof typeof MILITARY_TRANSPORT_SURFACE_ROLE>) {
      expect(result.roleVertexCounts[role]).toBeGreaterThan(0);
    }
    geometry.dispose();
  });

  it('stays inside the authoritative truck collider and the shell triangle allowance', () => {
    const result = createMilitaryTransportShellGeometry();
    const bounds = result.geometry.boundingBox;
    expect(bounds).not.toBeNull();
    expect(bounds!.min.x).toBeGreaterThanOrEqual(-1.33);
    expect(bounds!.min.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.min.z).toBeGreaterThanOrEqual(-3.7);
    expect(bounds!.max.x).toBeLessThanOrEqual(1.33);
    expect(bounds!.max.y).toBeLessThanOrEqual(2.9);
    expect(bounds!.max.z).toBeLessThanOrEqual(3.5);
    expect(result.triangles).toBeLessThanOrEqual(1_100);
    // The current high running-gear batch contributes 576 triangles.
    expect(result.triangles + 576).toBeLessThanOrEqual(1_800);
    result.geometry.dispose();
  });

  it('contains the authored cab, canvas, fender, snow, trim and lamp landmarks', () => {
    const result = createMilitaryTransportShellGeometry();
    const { geometry } = result;
    const paint = rolePositions(geometry, MILITARY_TRANSPORT_SURFACE_ROLE.paint);
    const canvas = rolePositions(geometry, MILITARY_TRANSPORT_SURFACE_ROLE.canvas);
    const glass = rolePositions(geometry, MILITARY_TRANSPORT_SURFACE_ROLE.glass);
    const metal = rolePositions(geometry, MILITARY_TRANSPORT_SURFACE_ROLE.metal);
    const snow = rolePositions(geometry, MILITARY_TRANSPORT_SURFACE_ROLE.snow);
    const warm = rolePositions(geometry, MILITARY_TRANSPORT_SURFACE_ROLE.lampWarm);
    const red = rolePositions(geometry, MILITARY_TRANSPORT_SURFACE_ROLE.lampRed);

    // The cab narrows at its high, rearward-sloped windscreen edge.
    expect(paint.some((vertex) => vertex.y > 2.45 && vertex.z < -2.5 && Math.abs(vertex.x) < 1)).toBe(true);
    const frontGlass = glass.filter((vertex) => Math.abs(vertex.x) < .9 && vertex.z < -2.55);
    const lowerWindscreenZ = frontGlass.filter((vertex) => vertex.y < 1.8).map((vertex) => vertex.z);
    const upperWindscreenZ = frontGlass.filter((vertex) => vertex.y > 2.2).map((vertex) => vertex.z);
    expect(lowerWindscreenZ.length).toBeGreaterThan(0);
    expect(upperWindscreenZ.length).toBeGreaterThan(0);
    expect(average(upperWindscreenZ)).toBeGreaterThan(average(lowerWindscreenZ));
    expect(glass.some((vertex) => Math.abs(vertex.x) > .95 && vertex.z > -2.5)).toBe(true);

    // The cover bows above the sidewalls; front fender segments flare around the wheel station.
    expect(canvas.some((vertex) => vertex.y > 2.7 && Math.abs(vertex.x) < .05 && vertex.z > -.4)).toBe(true);
    expect(paint.some((vertex) => Math.abs(vertex.x) > 1.18 && vertex.y < 1.15 && vertex.z < -1.8 && vertex.z > -3)).toBe(true);
    expect(paint.some((vertex) => vertex.z < -3.5 && vertex.y > .9)).toBe(true);

    // Snow caps both cab and bonnet; trim articulates the tailgate.
    expect(snow.some((vertex) => vertex.y > 2.58 && vertex.z < -1.3)).toBe(true);
    expect(snow.some((vertex) => vertex.z < -3.45 && vertex.y > 1.5)).toBe(true);
    expect(metal.some((vertex) => vertex.z > 3.13 && vertex.y > 1)).toBe(true);

    // Warm front lamps and red rear lamps occupy opposite ends of the local shell.
    expect(warm.every((vertex) => vertex.z < -3.62)).toBe(true);
    expect(red.every((vertex) => vertex.z > 3.14)).toBe(true);
    geometry.dispose();
  });

  it('returns only caller-owned geometry and value metadata, without materials or textures', () => {
    const result = createMilitaryTransportShellGeometry();
    expect(Object.keys(result).sort()).toEqual(['geometry', 'partCount', 'roleVertexCounts', 'triangles']);
    expect(result).not.toHaveProperty('material');
    expect(result).not.toHaveProperty('materials');
    expect(result).not.toHaveProperty('texture');
    expect(result).not.toHaveProperty('textures');
    expect(result.geometry.groups).toEqual([]);
    result.geometry.dispose();
  });
});
