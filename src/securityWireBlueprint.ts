import type { StaticBoxVector } from './staticBoxBatches';
import {
  SECURITY_FENCE_RUNS,
  type SecurityFenceRun,
} from './securityInfrastructureBlueprint';

export type SecurityWireMaterialSlot = 'steel' | 'dark';
export type SecurityWirePartRole = 'outrigger' | 'wire';

/** Material-independent, visual-only geometry for the top of a security fence. */
export interface SecurityWireBoxPart {
  readonly name: string;
  readonly runId: string;
  readonly role: SecurityWirePartRole;
  readonly materialSlot: SecurityWireMaterialSlot;
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly rotation: StaticBoxVector;
  /** Keeps each distant fence run independently frustum-cullable after batching. */
  readonly cluster: string;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface SecurityWireRunBlueprint {
  readonly parts: readonly SecurityWireBoxPart[];
  readonly outriggers: number;
  readonly wireSegments: number;
}

export interface SecurityWireStats {
  readonly parts: number;
  readonly triangles: number;
  readonly runs: number;
  readonly outriggers: number;
  readonly wireSegments: number;
  readonly materialCounts: Readonly<Record<SecurityWireMaterialSlot, number>>;
}

/**
 * This blueprint intentionally has no collider collection: every emitted part
 * is visual dressing above the authoritative 2.15 m fence collider.
 */
export interface SecurityWireBlueprint {
  readonly parts: readonly SecurityWireBoxPart[];
  readonly stats: Readonly<SecurityWireStats>;
}

export const SECURITY_WIRE_TRIANGLES_PER_PART = 12;
export const SECURITY_WIRE_TRIANGLE_CEILING = 700;

const FENCE_HEIGHT = 2.15;
const FENCE_POST_THICKNESS = .12;
const MAX_OUTRIGGER_SPACING = 5;
const OUTRIGGER_RISE = .72;
const OUTRIGGER_REACH = .36;
const OUTRIGGER_THICKNESS = .055;
const WIRE_THICKNESS = .024;
const WIRE_GAP = .14;
const WIRE_STATIONS = Object.freeze([.22, .59, .96] as const);

function clean(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vector(x: number, y: number, z: number): StaticBoxVector {
  return Object.freeze([clean(x), clean(y), clean(z)]) as StaticBoxVector;
}

function validateFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

function validateRun(run: SecurityFenceRun): void {
  if (run.id.trim().length === 0) throw new RangeError('run.id must not be empty');
  validateFinite(run.x, 'run.x');
  validateFinite(run.z, 'run.z');
  validateFinite(run.length, 'run.length');
  validateFinite(run.rotationY, 'run.rotationY');
  if (run.length <= FENCE_POST_THICKNESS + WIRE_GAP) {
    throw new RangeError(`run.length must be greater than ${FENCE_POST_THICKNESS + WIRE_GAP}`);
  }
}

function worldPosition(
  run: SecurityFenceRun,
  localX: number,
  y: number,
  localZ: number,
): StaticBoxVector {
  const cosine = Math.cos(run.rotationY);
  const sine = Math.sin(run.rotationY);
  return vector(
    run.x + localX * cosine + localZ * sine,
    y,
    run.z - localX * sine + localZ * cosine,
  );
}

/** Selects the run normal facing away from the arena's origin. */
function outwardDirection(run: SecurityFenceRun): 1 | -1 {
  const normalX = Math.sin(run.rotationY);
  const normalZ = Math.cos(run.rotationY);
  return run.x * normalX + run.z * normalZ < 0 ? -1 : 1;
}

/** Builds thin, non-colliding outriggers and three gapped taut-wire courses. */
export function createSecurityWireRunBlueprint(run: SecurityFenceRun): SecurityWireRunBlueprint {
  validateRun(run);

  const parts: SecurityWireBoxPart[] = [];
  const cluster = `security-wire:${run.id}`;
  const add = (
    name: string,
    role: SecurityWirePartRole,
    materialSlot: SecurityWireMaterialSlot,
    size: StaticBoxVector,
    position: StaticBoxVector,
    rotation: StaticBoxVector,
    castShadow = false,
  ): void => {
    parts.push(Object.freeze({
      name: `${run.id}-${name}`,
      runId: run.id,
      role,
      materialSlot,
      size,
      position,
      rotation,
      cluster,
      castShadow,
    }));
  };

  const intervals = Math.ceil(run.length / MAX_OUTRIGGER_SPACING);
  const supportSpan = run.length - FENCE_POST_THICKNESS;
  const spacing = supportSpan / intervals;
  const direction = outwardDirection(run);
  const baseY = FENCE_HEIGHT - .01;
  const outriggerLength = Math.hypot(OUTRIGGER_RISE, OUTRIGGER_REACH);
  const elevation = Math.atan2(OUTRIGGER_RISE, OUTRIGGER_REACH);
  const outriggerYaw = run.rotationY - direction * Math.PI / 2;

  for (let support = 0; support <= intervals; support++) {
    const localX = -supportSpan / 2 + support * spacing;
    add(
      `outrigger-${support}`,
      'outrigger',
      'steel',
      vector(outriggerLength, OUTRIGGER_THICKNESS, OUTRIGGER_THICKNESS),
      worldPosition(run, localX, baseY + OUTRIGGER_RISE / 2, direction * OUTRIGGER_REACH / 2),
      vector(0, outriggerYaw, elevation),
      true,
    );
  }

  // Gaps at every outrigger keep the courses legible as wire instead of solid,
  // climbable-looking rails. All three courses sit above the gameplay fence.
  for (let interval = 0; interval < intervals; interval++) {
    const localX = -supportSpan / 2 + (interval + .5) * spacing;
    for (let station = 0; station < WIRE_STATIONS.length; station++) {
      const progress = WIRE_STATIONS[station];
      add(
        `wire-${station}-${interval}`,
        'wire',
        'dark',
        vector(spacing - WIRE_GAP, WIRE_THICKNESS, WIRE_THICKNESS),
        worldPosition(
          run,
          localX,
          baseY + OUTRIGGER_RISE * progress,
          direction * OUTRIGGER_REACH * progress,
        ),
        vector(0, run.rotationY, 0),
      );
    }
  }

  const frozenParts = Object.freeze(parts);
  return Object.freeze({
    parts: frozenParts,
    outriggers: intervals + 1,
    wireSegments: intervals * WIRE_STATIONS.length,
  });
}

/** Builds top-security dressing for the three established arena fence runs. */
export function createSecurityWireBlueprint(): SecurityWireBlueprint {
  const runs = SECURITY_FENCE_RUNS.map(createSecurityWireRunBlueprint);
  const parts = Object.freeze(runs.flatMap((run) => [...run.parts]));
  const materialCounts: Record<SecurityWireMaterialSlot, number> = { steel: 0, dark: 0 };
  for (const part of parts) materialCounts[part.materialSlot]++;
  Object.freeze(materialCounts);

  const stats = Object.freeze({
    parts: parts.length,
    triangles: parts.length * SECURITY_WIRE_TRIANGLES_PER_PART,
    runs: runs.length,
    outriggers: runs.reduce((total, run) => total + run.outriggers, 0),
    wireSegments: runs.reduce((total, run) => total + run.wireSegments, 0),
    materialCounts,
  });
  if (stats.triangles > SECURITY_WIRE_TRIANGLE_CEILING) {
    throw new RangeError(`security wire exceeds ${SECURITY_WIRE_TRIANGLE_CEILING} triangles`);
  }
  return Object.freeze({ parts, stats });
}
