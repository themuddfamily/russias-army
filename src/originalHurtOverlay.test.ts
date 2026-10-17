import { describe, expect, it } from 'vitest';
import { sourcePointToWorld } from '../shared/originalSceneGeometry';
import {
  activateOriginalHurtOverlay,
  createOriginalHurtOverlay,
  originalWoodlandHurtRotation,
  stepOriginalHurtOverlay,
} from './originalHurtOverlay';

const player = { x: 0, y: 0, z: 0 };

describe('recovered local directional hurt state', () => {
  it.each([
    [[0, 10, 0], 180],
    [[10, 0, 0], -90],
    [[0, -10, 0], 0],
    [[-10, 0, 0], 90],
  ] as const)('preserves source cardinal direction for attacker %j', (attacker, angle) => {
    const state = createOriginalHurtOverlay();
    expect(activateOriginalHurtOverlay(state, player, sourcePointToWorld(attacker, .02), 0)).toBe(true);
    expect(state.sourceAngle).toBeCloseTo(angle, 12);
    expect(state.blend).toBe(100);
    expect(originalWoodlandHurtRotation(state)).toBeCloseTo(angle + 180, 12);
  });

  it('adds the native rotation before signed remainder, preserving negative Barrack indices', () => {
    const state = createOriginalHurtOverlay();
    const attacker = sourcePointToWorld([10, 0, 0], 2);
    activateOriginalHurtOverlay(state, player, attacker, -300 * Math.PI / 180);
    expect(state.sourceAngle).toBeCloseTo(-30, 12);
    expect(361 + state.sourceAngle).toBeCloseTo(331, 12);
    activateOriginalHurtOverlay(state, player, attacker, 480 * Math.PI / 180);
    expect(state.sourceAngle).toBeCloseTo(30, 12);
  });

  it('uses zero directional yaw for coincident or purely vertical positions', () => {
    const state = createOriginalHurtOverlay();
    activateOriginalHurtOverlay(state, player, player, -.5 * Math.PI);
    expect(state.sourceAngle).toBe(-90);
    activateOriginalHurtOverlay(state, player, { x: 0, y: 7, z: 0 }, .5 * Math.PI);
    expect(state.sourceAngle).toBe(90);
  });

  it('uses differences independently of world origin and normalization scale', () => {
    const state = createOriginalHurtOverlay();
    const a = sourcePointToWorld([100, 200, 50], .03);
    const b = sourcePointToWorld([110, 210, 80], .03);
    activateOriginalHurtOverlay(state, a, b, Math.PI / 4);
    expect(state.sourceAngle).toBeCloseTo(-90, 12);
  });

  it('leaves initial and existing overlays unchanged for unresolved attackers', () => {
    const state = createOriginalHurtOverlay();
    expect(activateOriginalHurtOverlay(state, player, null, 0)).toBe(false);
    expect(state).toEqual({ blend: 0, sourceAngle: 0 });
    activateOriginalHurtOverlay(state, player, { x: 2, y: 0, z: 0 }, 0);
    stepOriginalHurtOverlay(state);
    const prior = { ...state };
    expect(activateOriginalHurtOverlay(state, player, undefined, 0)).toBe(false);
    expect(state).toEqual(prior);
  });

  it('subtracts exactly four per callback, reaches zero at 25, and resets resolved hits', () => {
    const state = createOriginalHurtOverlay();
    stepOriginalHurtOverlay(state);
    expect(state.blend).toBe(0);
    activateOriginalHurtOverlay(state, player, { x: 2, y: 0, z: 0 }, 0);
    for (let callback = 1; callback <= 24; callback++) {
      stepOriginalHurtOverlay(state);
      expect(state.blend).toBe(100 - callback * 4);
    }
    expect(state.sourceAngle).toBe(-90);
    stepOriginalHurtOverlay(state);
    expect(state.blend).toBe(0);
    stepOriginalHurtOverlay(state);
    expect(state.blend).toBe(0);
    activateOriginalHurtOverlay(state, player, { x: -2, y: 0, z: 0 }, 0);
    expect(state).toEqual({ blend: 100, sourceAngle: 90 });
  });

  it('rejects malformed resolved coordinates atomically', () => {
    const state = { blend: 40, sourceAngle: -30 };
    expect(() => activateOriginalHurtOverlay(state, player, { x: NaN, y: 0, z: 0 }, 0)).toThrow();
    expect(() => activateOriginalHurtOverlay(state, player, player, Infinity)).toThrow();
    expect(state).toEqual({ blend: 40, sourceAngle: -30 });
  });

  it('restarts an active fade rather than accumulating blend or keeping old direction', () => {
    const state = createOriginalHurtOverlay();
    activateOriginalHurtOverlay(state, player, { x: 2, y: 0, z: 0 }, 0);
    for (let i = 0; i < 8; i++) stepOriginalHurtOverlay(state);
    expect(state.blend).toBe(68);
    activateOriginalHurtOverlay(state, player, { x: -2, y: 0, z: 0 }, 0);
    expect(state).toEqual({ blend: 100, sourceAngle: 90 });
    stepOriginalHurtOverlay(state);
    expect(state.blend).toBe(96);
  });
});
