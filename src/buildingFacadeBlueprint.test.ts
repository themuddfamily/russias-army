import { describe, expect, it } from 'vitest';
import {
  BUILDING_FACADE_MAX_PARTS,
  BUILDING_FACADE_MAX_TRIANGLES,
  BUILDING_FACADE_SPECS,
  createBuildingFacadeBlueprint,
  type BuildingFacadeSpec,
  type BuildingFacadeVisualPart,
} from './buildingFacadeBlueprint';

function intervalsOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && aMax > bMin;
}

function intersectsOpening(part: BuildingFacadeVisualPart, building: BuildingFacadeSpec, face: 'south' | 'east'): boolean {
  const epsilon = .001;
  const gap = face === 'south' ? building.southGap : building.eastGap;
  const facade = face === 'south'
    ? building.z + building.depth / 2
    : building.x + building.width / 2;
  const half = part.size.map((value) => value / 2);
  const min = part.position.map((value, axis) => value - half[axis]);
  const max = part.position.map((value, axis) => value + half[axis]);
  if (face === 'south') {
    return intervalsOverlap(min[0], max[0], building.x - gap / 2 + epsilon, building.x + gap / 2 - epsilon)
      && intervalsOverlap(min[1], max[1], .075, building.openingHeight - epsilon)
      && intervalsOverlap(min[2], max[2], facade - .3, facade + 1);
  }
  return intervalsOverlap(min[0], max[0], facade - .3, facade + 1)
    && intervalsOverlap(min[1], max[1], .075, building.openingHeight - epsilon)
    && intervalsOverlap(min[2], max[2], building.z - gap / 2 + epsilon, building.z + gap / 2 - epsilon);
}

describe('createBuildingFacadeBlueprint', () => {
  it('mirrors the four arena building shells and all seven doorway openings', () => {
    expect(BUILDING_FACADE_SPECS).toEqual([
      { id: 'block-01', x: -21, z: -18, width: 24, depth: 14, height: 5.6, southGap: 2.2, eastGap: 0, openingHeight: 2.7 },
      { id: 'barracks', x: 24, z: 19, width: 19, depth: 13, height: 4.8, southGap: 3.2, eastGap: 2.4, openingHeight: 2.7 },
      { id: 'warehouse', x: 27, z: -24, width: 15, depth: 10, height: 4.1, southGap: 4.8, eastGap: 3.4, openingHeight: 2.7 },
      { id: 'infirmary', x: -26, z: 25, width: 14, depth: 10, height: 3.8, southGap: 2.2, eastGap: 4.2, openingHeight: 2.7 },
    ]);
    const blueprint = createBuildingFacadeBlueprint();
    expect(blueprint.stats.buildings).toBe(4);
    expect(blueprint.stats.entrances).toBe(7);
    expect(blueprint.parts.filter((part) => part.role === 'entrance-lintel')).toHaveLength(7);
    expect(blueprint.parts.filter((part) => part.role === 'entrance-jamb')).toHaveLength(14);
  });

  it('keeps every south and east doorway clear above its flush threshold', () => {
    const { parts } = createBuildingFacadeBlueprint();
    for (const building of BUILDING_FACADE_SPECS) {
      expect(parts.some((part) => part.buildingId === building.id && part.face === 'south' && part.role === 'threshold')).toBe(true);
      for (const part of parts) expect(intersectsOpening(part, building, 'south')).toBe(false);
      if (building.eastGap > 0) {
        expect(parts.some((part) => part.buildingId === building.id && part.face === 'east' && part.role === 'threshold')).toBe(true);
        for (const part of parts) expect(intersectsOpening(part, building, 'east')).toBe(false);
      }
    }
    for (const threshold of parts.filter((part) => part.role === 'threshold')) {
      expect(threshold.position[1] - threshold.size[1] / 2).toBe(0);
      expect(threshold.position[1] + threshold.size[1] / 2).toBeLessThan(.075);
    }
  });

  it('provides recessed entries, drainage, utilities, and restrained roof articulation for every building', () => {
    const { parts } = createBuildingFacadeBlueprint();
    for (const building of BUILDING_FACADE_SPECS) {
      const cluster = parts.filter((part) => part.buildingId === building.id);
      expect(new Set(cluster.map((part) => part.cluster))).toEqual(new Set([`building-facade:${building.id}`]));
      expect(cluster.filter((part) => part.role === 'drainpipe')).toHaveLength(1);
      expect(cluster.filter((part) => part.role === 'pipe-bracket')).toHaveLength(2);
      expect(cluster.filter((part) => part.role === 'conduit')).toHaveLength(2);
      expect(cluster.filter((part) => part.role === 'junction-box')).toHaveLength(1);
      expect(cluster.filter((part) => part.role === 'indicator')).toHaveLength(1);
      expect(cluster.filter((part) => part.role === 'roof-flashing')).toHaveLength(2);
      expect(cluster.filter((part) => part.role === 'panel-joint')).toHaveLength(1);
      expect(cluster.every((part) => part.size.every((value) => Number.isFinite(value) && value > 0))).toBe(true);
      expect(cluster.every((part) => part.position.every(Number.isFinite))).toBe(true);
    }
    expect(new Set(parts.map((part) => part.name)).size).toBe(parts.length);
  });

  it('uses the shared arena material vocabulary and stays under 1,200 triangles', () => {
    const { parts, stats } = createBuildingFacadeBlueprint();
    expect(stats).toEqual({
      buildings: 4,
      entrances: 7,
      parts: 93,
      triangles: 1116,
      buildingCounts: { 'block-01': 18, barracks: 25, warehouse: 25, infirmary: 25 },
      roleCounts: {
        'entrance-jamb': 14,
        'entrance-lintel': 7,
        threshold: 7,
        'drain-grate': 7,
        'drain-bar': 14,
        drainpipe: 4,
        'pipe-bracket': 8,
        'pipe-outlet': 4,
        conduit: 8,
        'junction-box': 4,
        indicator: 4,
        'roof-flashing': 8,
        'panel-joint': 4,
      },
      materialCounts: { concrete: 21, dark: 46, accent: 22, glass: 4 },
    });
    expect(stats.parts).toBeLessThanOrEqual(BUILDING_FACADE_MAX_PARTS);
    expect(stats.triangles).toBeLessThanOrEqual(BUILDING_FACADE_MAX_TRIANGLES);
    expect(new Set(parts.map((part) => part.materialSlot))).toEqual(new Set(['concrete', 'dark', 'accent', 'glass']));
  });

  it('is deterministic and deeply immutable', () => {
    const first = createBuildingFacadeBlueprint();
    const second = createBuildingFacadeBlueprint();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.parts).not.toBe(second.parts);
    expect(Object.isFrozen(BUILDING_FACADE_SPECS)).toBe(true);
    for (const building of BUILDING_FACADE_SPECS) expect(Object.isFrozen(building)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parts)).toBe(true);
    for (const part of first.parts) {
      expect(Object.isFrozen(part)).toBe(true);
      expect(Object.isFrozen(part.size)).toBe(true);
      expect(Object.isFrozen(part.position)).toBe(true);
    }
    expect(Object.isFrozen(first.stats)).toBe(true);
    expect(Object.isFrozen(first.stats.buildingCounts)).toBe(true);
    expect(Object.isFrozen(first.stats.roleCounts)).toBe(true);
    expect(Object.isFrozen(first.stats.materialCounts)).toBe(true);
  });
});
