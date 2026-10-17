import { describe, expect, it } from 'vitest';
import {
  createPerimeterWallBlueprint,
  type PerimeterWallSide,
  type PerimeterWallVisualPart,
} from './perimeterWallBlueprint';

function interval(part: PerimeterWallVisualPart, axis: 0 | 2): readonly [number, number] {
  const half = part.size[axis] / 2;
  return [part.position[axis] - half, part.position[axis] + half];
}

function expectContinuousPanels(
  parts: readonly PerimeterWallVisualPart[],
  side: PerimeterWallSide,
  axis: 0 | 2,
  expectedStart: number,
  expectedEnd: number,
  expectedLength: number,
): void {
  const panels = parts
    .filter((part) => part.role === 'panel' && part.side === side)
    .sort((first, second) => interval(first, axis)[0] - interval(second, axis)[0]);
  expect(panels).toHaveLength(expectedLength);
  expect(interval(panels[0], axis)[0]).toBeCloseTo(expectedStart, 8);
  for (let index = 1; index < panels.length; index++) {
    expect(interval(panels[index - 1], axis)[1]).toBeCloseTo(interval(panels[index], axis)[0], 8);
  }
  expect(interval(panels.at(-1)!, axis)[1]).toBeCloseTo(expectedEnd, 8);
  for (const panel of panels) {
    expect(panel.position[1] - panel.size[1] / 2).toBe(0);
    expect(panel.position[1] + panel.size[1] / 2).toBe(3.2);
  }
}

function partKey(part: PerimeterWallVisualPart, invert = false): string {
  const sign = invert ? -1 : 1;
  const x = Object.is(part.position[0] * sign, -0) ? 0 : part.position[0] * sign;
  const z = Object.is(part.position[2] * sign, -0) ? 0 : part.position[2] * sign;
  return JSON.stringify([part.role, part.materialSlot, part.size, [x, part.position[1], z], part.castShadow]);
}

describe('createPerimeterWallBlueprint', () => {
  it('preserves the four original authoritative collision bounds exactly', () => {
    const { colliders } = createPerimeterWallBlueprint();
    expect(colliders).toEqual([
      { size: [120, 3.2, .8], position: [0, 1.6, -58], min: [-60, 0, -58.4], max: [60, 3.2, -57.6] },
      { size: [120, 3.2, .8], position: [0, 1.6, 58], min: [-60, 0, 57.6], max: [60, 3.2, 58.4] },
      { size: [.8, 3.2, 116], position: [-60, 1.6, 0], min: [-60.4, 0, -58], max: [-59.6, 3.2, 58] },
      { size: [.8, 3.2, 116], position: [60, 1.6, 0], min: [59.6, 0, -58], max: [60.4, 3.2, 58] },
    ]);
  });

  it('covers every wall envelope with one continuous structural shell', () => {
    const { parts } = createPerimeterWallBlueprint();
    expectContinuousPanels(parts, 'north', 0, -60, 60, 1);
    expectContinuousPanels(parts, 'south', 0, -60, 60, 1);
    expectContinuousPanels(parts, 'west', 2, -58, 58, 1);
    expectContinuousPanels(parts, 'east', 2, -58, 58, 1);

    const panelLengths = parts
      .filter((part) => part.role === 'panel')
      .map((part) => Math.max(part.size[0], part.size[2]));
    expect(panelLengths.sort((a, b) => a - b)).toEqual([116, 116, 120, 120]);
  });

  it('stays inside the visual budget and exercises every material slot', () => {
    const blueprint = createPerimeterWallBlueprint();
    expect(blueprint.stats).toEqual({
      parts: 100,
      triangles: 1200,
      panels: 4,
      posts: 44,
      materialCounts: { concrete: 48, dark: 4, snow: 44, accent: 4 },
    });
    expect(blueprint.stats.parts).toBeLessThanOrEqual(180);
    expect(blueprint.stats.triangles).toBeLessThanOrEqual(2160);
    for (const part of blueprint.parts) {
      expect(['concrete', 'dark', 'snow', 'accent']).toContain(part.materialSlot);
      expect(part.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(part.position.every(Number.isFinite)).toBe(true);
    }
  });

  it('is deterministic, deeply immutable, and centrally symmetric', () => {
    const first = createPerimeterWallBlueprint();
    const second = createPerimeterWallBlueprint();
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parts)).toBe(true);
    expect(Object.isFrozen(first.parts[0])).toBe(true);
    expect(Object.isFrozen(first.parts[0].size)).toBe(true);
    expect(Object.isFrozen(first.colliders[0])).toBe(true);

    const keys = new Set(first.parts.map((part) => partKey(part)));
    for (const part of first.parts) expect(keys.has(partKey(part, true))).toBe(true);
  });

  it('authors an exact high-tier two-course precast wall without changing collision', () => {
    const low = createPerimeterWallBlueprint();
    const high = createPerimeterWallBlueprint('high');
    expect(high.colliders).toEqual(low.colliders);
    expect(high.stats).toEqual({
      parts: 236,
      triangles: 2832,
      panels: 88,
      posts: 44,
      materialCounts: { concrete: 144, dark: 44, snow: 44, accent: 4 },
    });
    expect(high.parts.slice(0, 88).every((part) => part.role === 'panel')).toBe(true);
    expect(high.parts.slice(88, 132).every((part) => part.role === 'post')).toBe(true);
    expect(high.parts.slice(132, 176).every((part) => part.role === 'coping')).toBe(true);
    expect(high.parts.slice(176, 220).every((part) => part.role === 'snow-cap')).toBe(true);
    expect(high.parts.slice(220, 224).every((part) => part.role === 'safety-panel')).toBe(true);
    expect(high.parts.slice(224).every((part) => part.role === 'repair-patch')).toBe(true);
    expect(high.parts.slice(88, 132)).toEqual(low.parts.slice(4, 48));
  });

  it('tiles both high-tier panel rows continuously across all four envelopes', () => {
    const { parts } = createPerimeterWallBlueprint('high');
    const cases: readonly [PerimeterWallSide, 0 | 2, number, number, number][] = [
      ['north', 0, -60, 60, 12],
      ['south', 0, -60, 60, 12],
      ['west', 2, -58, 58, 10],
      ['east', 2, -58, 58, 10],
    ];
    for (const [side, axis, start, end, count] of cases) {
      for (const centreY of [.8, 2.4]) {
        const row = parts
          .filter((part) => part.role === 'panel' && part.side === side && part.position[1] === centreY)
          .sort((first, second) => interval(first, axis)[0] - interval(second, axis)[0]);
        expect(row).toHaveLength(count);
        expect(interval(row[0], axis)[0]).toBeCloseTo(start, 8);
        expect(interval(row.at(-1)!, axis)[1]).toBeCloseTo(end, 8);
        for (let index = 1; index < row.length; index++) {
          expect(interval(row[index - 1], axis)[1]).toBeCloseTo(interval(row[index], axis)[0], 8);
        }
        for (const panel of row) {
          expect(panel.size[1]).toBe(1.6);
          expect(panel.position[1] - panel.size[1] / 2).toBeCloseTo(centreY - .8, 8);
          expect(panel.position[1] + panel.size[1] / 2).toBeCloseTo(centreY + .8, 8);
        }
      }
    }
  });

  it('keeps segmented caps within their bays and pairs all high details centrally', () => {
    const high = createPerimeterWallBlueprint('high');
    const roleCounts = new Map<string, number>();
    for (const part of high.parts) roleCounts.set(part.role, (roleCounts.get(part.role) ?? 0) + 1);
    expect(Object.fromEntries(roleCounts)).toEqual({
      panel: 88,
      post: 44,
      coping: 44,
      'snow-cap': 44,
      'safety-panel': 4,
      'repair-patch': 12,
    });
    const snow = high.parts.filter((part) => part.role === 'snow-cap');
    expect(new Set(snow.map((part) => `${part.size.join(',')}@${part.position.join(',')}`)).size).toBe(44);
    for (const cap of snow) {
      const axis = cap.side === 'north' || cap.side === 'south' ? 0 : 2;
      const bayLength = axis === 0 ? 10 : 11.6;
      const nearestBayCentre = axis === 0
        ? -55 + Math.round((cap.position[axis] + 55) / 10) * 10
        : -52.2 + Math.round((cap.position[axis] + 52.2) / 11.6) * 11.6;
      expect(Math.abs(cap.position[axis] - nearestBayCentre) + cap.size[axis] / 2).toBeLessThan(bayLength / 2);
    }
    const keys = new Set(high.parts.map((part) => partKey(part)));
    for (const part of high.parts) expect(keys.has(partKey(part, true))).toBe(true);
  });

  it('keeps both tiers deterministic, deeply frozen, finite, and rejects invalid quality', () => {
    const high = createPerimeterWallBlueprint('high');
    expect(high).toEqual(createPerimeterWallBlueprint('high'));
    expect(Object.isFrozen(high)).toBe(true);
    expect(Object.isFrozen(high.parts)).toBe(true);
    expect(Object.isFrozen(high.parts[0])).toBe(true);
    expect(Object.isFrozen(high.parts[0].size)).toBe(true);
    expect(Object.isFrozen(high.colliders)).toBe(true);
    expect(Object.isFrozen(high.stats.materialCounts)).toBe(true);
    for (const part of high.parts) {
      expect(part.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(part.position.every(Number.isFinite)).toBe(true);
    }
    expect(() => createPerimeterWallBlueprint('ultra' as 'high')).toThrow(/quality.*low or high/i);
  });
});
