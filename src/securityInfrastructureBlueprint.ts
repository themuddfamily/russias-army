import type { StaticBoxVector } from './staticBoxBatches';

export type SecurityMaterialSlot = 'steel' | 'dark' | 'glass' | 'accent';
export type SecurityStructureKind = 'lamp' | 'fence';
export type SecurityPartFeature =
  | 'base'
  | 'pedestal'
  | 'pole'
  | 'arm'
  | 'luminaire'
  | 'lens'
  | 'post'
  | 'rail'
  | 'brace';

/** Material-independent geometry accepted by the arena's static box batcher. */
export interface SecurityBoxPart {
  readonly name: string;
  readonly structureId: string;
  readonly kind: SecurityStructureKind;
  readonly feature: SecurityPartFeature;
  readonly materialSlot: SecurityMaterialSlot;
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly rotation?: StaticBoxVector;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface SecurityLampLocation {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

export interface SecurityFenceRun {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly length: number;
  readonly rotationY: number;
}

/**
 * Axis-aligned gameplay bounds for a fence run. `localSize` documents the
 * oriented visual footprint from which the world AABB was derived.
 */
export interface SecurityFenceCollider {
  readonly runId: string;
  readonly localSize: StaticBoxVector;
  readonly sourceRotationY: number;
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly min: StaticBoxVector;
  readonly max: StaticBoxVector;
}

export interface SecurityInfrastructureStats {
  readonly parts: number;
  readonly triangles: number;
  readonly lampParts: number;
  readonly fenceParts: number;
  readonly lamps: number;
  readonly fences: number;
  readonly fencePanels: number;
  readonly materialCounts: Readonly<Record<SecurityMaterialSlot, number>>;
}

export interface SecurityInfrastructureBlueprint {
  readonly parts: readonly SecurityBoxPart[];
  readonly colliders: readonly SecurityFenceCollider[];
  readonly stats: Readonly<SecurityInfrastructureStats>;
}

export const SECURITY_TRIANGLES_PER_PART = 12;

export const SECURITY_LAMP_LOCATIONS: readonly SecurityLampLocation[] = Object.freeze([
  Object.freeze({ id: 'lamp-south-west', x: -7, z: -23 }),
  Object.freeze({ id: 'lamp-north-center', x: 9, z: 21 }),
  Object.freeze({ id: 'lamp-east', x: 36, z: -8 }),
  Object.freeze({ id: 'lamp-west', x: -37, z: 1 }),
]);

export const SECURITY_FENCE_RUNS: readonly SecurityFenceRun[] = Object.freeze([
  Object.freeze({ id: 'fence-east', x: 47, z: 7, length: 20, rotationY: Math.PI / 2 }),
  Object.freeze({ id: 'fence-west', x: -42, z: -17, length: 25, rotationY: Math.PI / 2 }),
  Object.freeze({ id: 'fence-north', x: 18, z: 43, length: 18, rotationY: 0 }),
]);

const FENCE_HEIGHT = 2.15;
const FENCE_THICKNESS = .12;
const MAX_PANEL_WIDTH = 3;

function clean(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vector(x: number, y: number, z: number): StaticBoxVector {
  return Object.freeze([clean(x), clean(y), clean(z)]) as StaticBoxVector;
}

function rotation(x: number, y: number, z: number): StaticBoxVector {
  return Object.freeze([x, y, z]) as StaticBoxVector;
}

function validateFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

function validateId(id: string, label: string): void {
  if (id.trim().length === 0) throw new RangeError(`${label} must not be empty`);
}

function worldPosition(x: number, z: number, localX: number, localZ: number, rotationY: number): readonly [number, number] {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return [
    clean(x + localX * cosine + localZ * sine),
    clean(z - localX * sine + localZ * cosine),
  ];
}

/** Creates one modern cantilever area light without adding gameplay collision. */
export function createSecurityLampBlueprint(location: SecurityLampLocation): readonly SecurityBoxPart[] {
  validateId(location.id, 'location.id');
  validateFinite(location.x, 'location.x');
  validateFinite(location.z, 'location.z');

  const parts: SecurityBoxPart[] = [];
  const add = (
    name: string,
    feature: SecurityPartFeature,
    materialSlot: SecurityMaterialSlot,
    size: StaticBoxVector,
    localPosition: StaticBoxVector,
    partRotation?: StaticBoxVector,
    castShadow?: boolean,
  ): void => {
    parts.push(Object.freeze({
      name: `${location.id}-${name}`,
      structureId: location.id,
      kind: 'lamp',
      feature,
      materialSlot,
      size,
      position: vector(location.x + localPosition[0], localPosition[1], location.z + localPosition[2]),
      ...(partRotation === undefined ? {} : { rotation: partRotation }),
      ...(castShadow === undefined ? {} : { castShadow }),
    }));
  };

  // A broad dark shoe and inset pedestal give the thin mast a credible footing.
  add('base', 'base', 'dark', vector(.58, .16, .58), vector(0, .08, 0));
  add('pedestal', 'pedestal', 'steel', vector(.32, .32, .32), vector(0, .31, 0));
  add('safety-sleeve', 'pedestal', 'accent', vector(.24, .38, .24), vector(0, .68, 0), undefined, false);
  add('pole', 'pole', 'steel', vector(.15, 3.45, .15), vector(0, 2.48, 0));

  // The raised cantilever and broad LED housing replace the old pole-and-bulb
  // silhouette while retaining its east-facing pool-of-light anchor.
  add('angled-arm', 'arm', 'steel', vector(.13, .9, .13), vector(.3, 4.52, 0), rotation(0, 0, -.73));
  add('arm-coupling', 'arm', 'dark', vector(.25, .17, .2), vector(.61, 4.8, 0));
  add('luminaire-housing', 'luminaire', 'dark', vector(.82, .2, .38), vector(.92, 4.79, 0));
  add('luminaire-lens', 'lens', 'glass', vector(.62, .055, .28), vector(.96, 4.66, 0), undefined, false);

  return Object.freeze(parts);
}

export interface SecurityFenceBlueprint {
  readonly parts: readonly SecurityBoxPart[];
  readonly collider: SecurityFenceCollider;
  readonly panels: number;
}

/** Creates one framed security-fence run and its authoritative world AABB. */
export function createSecurityFenceBlueprint(run: SecurityFenceRun): SecurityFenceBlueprint {
  validateId(run.id, 'run.id');
  validateFinite(run.x, 'run.x');
  validateFinite(run.z, 'run.z');
  validateFinite(run.length, 'run.length');
  validateFinite(run.rotationY, 'run.rotationY');
  if (run.length <= FENCE_THICKNESS) {
    throw new RangeError(`run.length must be greater than ${FENCE_THICKNESS}`);
  }

  const parts: SecurityBoxPart[] = [];
  const add = (
    name: string,
    feature: SecurityPartFeature,
    materialSlot: SecurityMaterialSlot,
    size: StaticBoxVector,
    localX: number,
    y: number,
    localZ = 0,
    localRotationZ = 0,
  ): void => {
    const [x, z] = worldPosition(run.x, run.z, localX, localZ, run.rotationY);
    parts.push(Object.freeze({
      name: `${run.id}-${name}`,
      structureId: run.id,
      kind: 'fence',
      feature,
      materialSlot,
      size,
      position: vector(x, y, z),
      rotation: rotation(0, run.rotationY, localRotationZ),
    }));
  };

  const panels = Math.ceil(run.length / MAX_PANEL_WIDTH);
  // Inset square post centres by half their width so the complete visible frame
  // ends exactly at +/- length/2, matching the collider footprint.
  const framedSpan = run.length - FENCE_THICKNESS;
  const panelWidth = framedSpan / panels;
  for (let post = 0; post <= panels; post++) {
    add(
      `post-${post}`,
      'post',
      'steel',
      vector(FENCE_THICKNESS, FENCE_HEIGHT, FENCE_THICKNESS),
      -framedSpan / 2 + post * panelWidth,
      FENCE_HEIGHT / 2,
    );
  }

  add('top-rail', 'rail', 'dark', vector(run.length, .1, .1), 0, 2.04);
  add('mid-rail', 'rail', 'dark', vector(run.length, .1, .1), 0, 1.08);

  const cosine = Math.abs(Math.cos(run.rotationY));
  const sine = Math.abs(Math.sin(run.rotationY));
  const halfX = clean(cosine * run.length / 2 + sine * FENCE_THICKNESS / 2);
  const halfZ = clean(sine * run.length / 2 + cosine * FENCE_THICKNESS / 2);
  const colliderPosition = vector(run.x, FENCE_HEIGHT / 2, run.z);
  const collider = Object.freeze({
    runId: run.id,
    localSize: vector(run.length, FENCE_HEIGHT, FENCE_THICKNESS),
    sourceRotationY: run.rotationY,
    size: vector(halfX * 2, FENCE_HEIGHT, halfZ * 2),
    position: colliderPosition,
    min: vector(run.x - halfX, 0, run.z - halfZ),
    max: vector(run.x + halfX, FENCE_HEIGHT, run.z + halfZ),
  });

  return Object.freeze({ parts: Object.freeze(parts), collider, panels });
}

/** Builds all four legacy lamp anchors and all three legacy fence runs. */
export function createSecurityInfrastructureBlueprint(): SecurityInfrastructureBlueprint {
  const lampParts = SECURITY_LAMP_LOCATIONS.flatMap((location) => [...createSecurityLampBlueprint(location)]);
  const fenceBlueprints = SECURITY_FENCE_RUNS.map(createSecurityFenceBlueprint);
  const fenceParts = fenceBlueprints.flatMap((blueprint) => [...blueprint.parts]);
  const parts = Object.freeze([...lampParts, ...fenceParts]);
  const colliders = Object.freeze(fenceBlueprints.map((blueprint) => blueprint.collider));
  const materialCounts: Record<SecurityMaterialSlot, number> = { steel: 0, dark: 0, glass: 0, accent: 0 };
  for (const part of parts) materialCounts[part.materialSlot]++;
  Object.freeze(materialCounts);

  const stats = Object.freeze({
    parts: parts.length,
    triangles: parts.length * SECURITY_TRIANGLES_PER_PART,
    lampParts: lampParts.length,
    fenceParts: fenceParts.length,
    lamps: SECURITY_LAMP_LOCATIONS.length,
    fences: SECURITY_FENCE_RUNS.length,
    fencePanels: fenceBlueprints.reduce((sum, blueprint) => sum + blueprint.panels, 0),
    materialCounts,
  });
  return Object.freeze({ parts, colliders, stats });
}
