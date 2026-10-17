import { describe, expect, it } from 'vitest';
import {
  createBlastBarrierBlueprint,
  type BlastBarrierId,
  type BlastBarrierPartRole,
  type BlastBarrierVisualPart,
} from './blastBarrierBlueprint';

const BARRIER_CENTRES: Readonly<Record<BlastBarrierId, readonly [number, number]>> = {
  north: [0, -8],
  east: [8.7, 0],
  south: [-4, 12],
  west: [-10, 8.3],
};

function interval(part: BlastBarrierVisualPart, axis: 0 | 2): readonly [number, number] {
  const half = part.size[axis] / 2;
  return [part.position[axis] - half, part.position[axis] + half];
}

function expectPanelCoverage(
  parts: readonly BlastBarrierVisualPart[],
  barrier: BlastBarrierId,
  axis: 0 | 2,
  expectedStart: number,
  expectedEnd: number,
  expectedHeight: number,
  expectedCount: number,
): void {
  const panels = parts
    .filter((part) => part.barrier === barrier && part.role === 'panel')
    .sort((first, second) => interval(first, axis)[0] - interval(second, axis)[0]);
  expect(panels).toHaveLength(expectedCount);
  expect(interval(panels[0], axis)[0]).toBeCloseTo(expectedStart, 8);
  for (let index = 1; index < panels.length; index++) {
    expect(interval(panels[index - 1], axis)[1]).toBeCloseTo(interval(panels[index], axis)[0], 8);
  }
  expect(interval(panels.at(-1)!, axis)[1]).toBeCloseTo(expectedEnd, 8);
  for (const panel of panels) {
    expect(panel.position[1] - panel.size[1] / 2).toBeCloseTo(0, 8);
    expect(panel.position[1] + panel.size[1] / 2).toBeCloseTo(expectedHeight, 8);
  }
}

function isLongAxisMirror(first: BlastBarrierVisualPart, second: BlastBarrierVisualPart): boolean {
  const [centreX, centreZ] = BARRIER_CENTRES[first.barrier];
  const axis = first.barrier === 'north' || first.barrier === 'south' ? 0 : 2;
  const crossAxis = axis === 0 ? 2 : 0;
  const centre = axis === 0 ? centreX : centreZ;
  return first.barrier === second.barrier
    && first.role === second.role
    && first.materialSlot === second.materialSlot
    && first.castShadow === second.castShadow
    && first.size.every((value, index) => Math.abs(value - second.size[index]) < 1e-9)
    && Math.abs(first.position[axis] + second.position[axis] - 2 * centre) < 1e-9
    && Math.abs(first.position[crossAxis] - second.position[crossAxis]) < 1e-9
    && Math.abs(first.position[1] - second.position[1]) < 1e-9;
}

describe('createBlastBarrierBlueprint', () => {
  it('preserves the four original authoritative collision bounds exactly', () => {
    const { colliders } = createBlastBarrierBlueprint();
    expect(colliders).toEqual([
      { barrier: 'north', size: [18, 2.4, .65], position: [0, 1.2, -8], min: [-9, 0, -8.325], max: [9, 2.4, -7.675] },
      { barrier: 'east', size: [.65, 2.4, 16], position: [8.7, 1.2, 0], min: [8.375, 0, -8], max: [9.025, 2.4, 8] },
      { barrier: 'south', size: [12, 1.6, .7], position: [-4, .8, 12], min: [-10, 0, 11.65], max: [2, 1.6, 12.35] },
      { barrier: 'west', size: [.7, 1.6, 8], position: [-10, .8, 8.3], min: [-10.35, 0, 4.3], max: [-9.65, 1.6, 12.3] },
    ]);
    for (const collider of colliders) for (let axis = 0; axis < 3; axis++) {
      expect(collider.size[axis]).toBeCloseTo(collider.max[axis] - collider.min[axis], 8);
      expect(collider.position[axis]).toBeCloseTo((collider.min[axis] + collider.max[axis]) / 2, 8);
      expect(collider.min[axis]).toBeLessThan(collider.max[axis]);
    }
  });

  it('tiles every collider envelope with contiguous structural panels', () => {
    const { parts } = createBlastBarrierBlueprint();
    expectPanelCoverage(parts, 'north', 0, -9, 9, 2.4, 6);
    expectPanelCoverage(parts, 'east', 2, -8, 8, 2.4, 5);
    expectPanelCoverage(parts, 'south', 0, -10, 2, 1.6, 4);
    expectPanelCoverage(parts, 'west', 2, 4.3, 12.3, 1.6, 3);
  });

  it('uses every material and stays inside the 90-part visual budget', () => {
    const { parts, stats } = createBlastBarrierBlueprint();
    expect(stats).toEqual({
      parts: 70,
      triangles: 840,
      roleCounts: { panel: 18, buttress: 22, plinth: 4, 'snow-cap': 18, 'hazard-panel': 8 },
      materialCounts: { concrete: 40, snow: 18, dark: 4, accent: 8 },
    });
    expect(stats.parts).toBeLessThanOrEqual(90);
    expect(stats.triangles).toBeLessThanOrEqual(1080);
    expect(new Set(parts.map((part) => part.materialSlot))).toEqual(new Set(['concrete', 'snow', 'dark', 'accent']));

    const expectedMaterialForRole: Readonly<Record<BlastBarrierPartRole, string>> = {
      panel: 'concrete',
      buttress: 'concrete',
      plinth: 'dark',
      'snow-cap': 'snow',
      'hazard-panel': 'accent',
    };
    for (const part of parts) {
      expect(expectedMaterialForRole[part.role]).toBe(part.materialSlot);
      expect(part.size.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(part.position.every(Number.isFinite)).toBe(true);
    }

    for (const barrier of Object.keys(BARRIER_CENTRES) as BlastBarrierId[]) {
      const barrierParts = parts.filter((part) => part.barrier === barrier);
      const panels = barrierParts.filter((part) => part.role === 'panel').length;
      expect(barrierParts.filter((part) => part.role === 'buttress')).toHaveLength(panels + 1);
      expect(barrierParts.filter((part) => part.role === 'snow-cap')).toHaveLength(panels);
      expect(barrierParts.filter((part) => part.role === 'plinth')).toHaveLength(1);
      expect(barrierParts.filter((part) => part.role === 'hazard-panel')).toHaveLength(2);
    }

    const transforms = parts.map((part) => JSON.stringify([
      part.barrier, part.role, part.materialSlot, part.size, part.position,
    ]));
    expect(new Set(transforms).size).toBe(parts.length);
  });

  it('keeps every visual role symmetric along its own barrier', () => {
    const { parts } = createBlastBarrierBlueprint();
    const roles: readonly BlastBarrierPartRole[] = ['panel', 'buttress', 'plinth', 'snow-cap', 'hazard-panel'];
    for (const barrier of Object.keys(BARRIER_CENTRES) as BlastBarrierId[]) {
      for (const role of roles) {
        const matching = parts.filter((part) => part.barrier === barrier && part.role === role);
        for (const part of matching) expect(matching.some((candidate) => isLongAxisMirror(part, candidate))).toBe(true);
      }
    }
  });

  it('is deterministic and deeply immutable', () => {
    const first = createBlastBarrierBlueprint();
    const second = createBlastBarrierBlueprint();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.parts).not.toBe(second.parts);
    expect(first.parts[0]).not.toBe(second.parts[0]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parts)).toBe(true);
    for (const part of first.parts) {
      expect(Object.isFrozen(part)).toBe(true);
      expect(Object.isFrozen(part.size)).toBe(true);
      expect(Object.isFrozen(part.position)).toBe(true);
    }
    expect(Object.isFrozen(first.colliders)).toBe(true);
    for (const collider of first.colliders) {
      expect(Object.isFrozen(collider)).toBe(true);
      expect(Object.isFrozen(collider.size)).toBe(true);
      expect(Object.isFrozen(collider.position)).toBe(true);
      expect(Object.isFrozen(collider.min)).toBe(true);
      expect(Object.isFrozen(collider.max)).toBe(true);
    }
    expect(Object.isFrozen(first.stats)).toBe(true);
    expect(Object.isFrozen(first.stats.roleCounts)).toBe(true);
    expect(Object.isFrozen(first.stats.materialCounts)).toBe(true);
  });
});
