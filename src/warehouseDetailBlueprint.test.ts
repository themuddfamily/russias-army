import { describe, expect, it } from 'vitest';
import {
  createWarehouseDetailBlueprint,
  WAREHOUSE_DETAIL_MAX_TRIANGLES,
  WAREHOUSE_PORTAL_CLEARANCES,
  type WarehouseDetailVisualPart,
  type WarehousePortalClearance,
} from './warehouseDetailBlueprint';

function overlapsClearance(part: WarehouseDetailVisualPart, clearance: WarehousePortalClearance): boolean {
  const half = part.size.map((value) => value / 2);
  return part.position.every((center, axis) =>
    center + half[axis] > clearance.min[axis] + 1e-8
    && center - half[axis] < clearance.max[axis] - 1e-8,
  );
}

describe('createWarehouseDetailBlueprint', () => {
  it('keeps both original warehouse apertures completely traversable', () => {
    const blueprint = createWarehouseDetailBlueprint();
    expect(blueprint.clearances).toEqual(WAREHOUSE_PORTAL_CLEARANCES);
    expect(blueprint.clearances.map((clearance) => clearance.id)).toEqual(['south', 'east']);
    for (const clearance of blueprint.clearances) {
      expect(blueprint.parts.filter((part) => overlapsClearance(part, clearance))).toEqual([]);
    }
  });

  it('builds two visibly raised shutters with tracks, deep lintels, and machinery', () => {
    const { parts, stats } = createWarehouseDetailBlueprint();
    expect(stats.roleCounts).toMatchObject({
      'door-track': 4,
      'door-lintel': 2,
      'shutter-housing': 2,
      'shutter-endcap': 4,
      'shutter-slat': 6,
      'door-motor': 2,
      'warning-plate': 2,
      'warning-lens': 2,
    });
    for (const portal of ['south', 'east']) {
      const portalParts = parts.filter((part) => part.name.startsWith(`${portal}-`));
      expect(portalParts).toHaveLength(12);
      expect(portalParts.some((part) => part.role === 'door-track')).toBe(true);
      expect(portalParts.some((part) => part.role === 'shutter-housing')).toBe(true);
      expect(portalParts.every((part) => part.position[1] > 0)).toBe(true);
    }
  });

  it('provides shallow wall detail, storage silhouettes, and ceiling fixtures', () => {
    const { parts, stats } = createWarehouseDetailBlueprint();
    expect(stats.roleCounts).toMatchObject({
      'rack-upright': 4,
      'rack-shelf': 3,
      'rack-fascia': 3,
      'pallet-rail': 2,
      'pallet-slat': 5,
      'ceiling-rail': 2,
      'ceiling-housing': 3,
      'ceiling-lens': 3,
      conduit: 3,
      'conduit-clamp': 4,
      'wall-panel': 4,
      'bay-marker': 4,
    });
    const wallMounted = parts.filter((part) =>
      part.role.startsWith('rack-')
      || part.role.startsWith('pallet-')
      || part.role === 'conduit'
      || part.role === 'conduit-clamp'
      || part.role === 'wall-panel'
      || part.role === 'bay-marker',
    );
    expect(wallMounted.every((part) => part.position[2] < -28.25)).toBe(true);
    const ceilingParts = parts.filter((part) => part.role.startsWith('ceiling-'));
    expect(ceilingParts.every((part) => part.position[1] >= 3.8)).toBe(true);
  });

  it('uses every material slot, unique names, finite boxes, and stays under 1000 triangles', () => {
    const { parts, stats } = createWarehouseDetailBlueprint();
    expect(new Set(parts.map((part) => part.materialSlot))).toEqual(
      new Set(['steel', 'dark', 'wood', 'glass', 'accent']),
    );
    expect(new Set(parts.map((part) => part.name)).size).toBe(parts.length);
    expect(stats).toMatchObject({ parts: 64, portalParts: 24, interiorParts: 40, triangles: 768 });
    expect(stats.triangles).toBeLessThanOrEqual(WAREHOUSE_DETAIL_MAX_TRIANGLES);
    for (const part of parts) {
      expect(part.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(part.position.every(Number.isFinite)).toBe(true);
    }
  });

  it('is deterministic and deeply immutable', () => {
    const first = createWarehouseDetailBlueprint();
    const second = createWarehouseDetailBlueprint();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.parts).not.toBe(second.parts);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parts)).toBe(true);
    for (const part of first.parts) {
      expect(Object.isFrozen(part)).toBe(true);
      expect(Object.isFrozen(part.size)).toBe(true);
      expect(Object.isFrozen(part.position)).toBe(true);
    }
    expect(Object.isFrozen(first.clearances)).toBe(true);
    for (const clearance of first.clearances) {
      expect(Object.isFrozen(clearance)).toBe(true);
      expect(Object.isFrozen(clearance.min)).toBe(true);
      expect(Object.isFrozen(clearance.max)).toBe(true);
    }
    expect(Object.isFrozen(first.stats)).toBe(true);
    expect(Object.isFrozen(first.stats.roleCounts)).toBe(true);
    expect(Object.isFrozen(first.stats.materialCounts)).toBe(true);
  });
});
