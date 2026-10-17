import type { StaticBoxVector } from './staticBoxBatches';

export type YardCrateMaterialSlot = 'wood' | 'dark' | 'accent';
export type YardCratePartRole =
  | 'inner-core'
  | 'face-slat'
  | 'side-panel'
  | 'lid-slat'
  | 'corner-batten'
  | 'strap'
  | 'stencil-plate';

export interface YardCratePlacement {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly scale: number;
}

/** A material-independent box accepted directly by the arena static batcher. */
export interface YardCrateVisualPart {
  readonly name: string;
  readonly crateId: string;
  readonly role: YardCratePartRole;
  readonly materialSlot: YardCrateMaterialSlot;
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

/** The crate's one unsplit gameplay volume, identical to the original cube. */
export interface YardCrateCollider {
  readonly crateId: string;
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly min: StaticBoxVector;
  readonly max: StaticBoxVector;
}

export interface YardCrateBlueprintStats {
  readonly crates: number;
  readonly parts: number;
  readonly partsPerCrate: number;
  readonly triangles: number;
  readonly roleCounts: Readonly<Record<YardCratePartRole, number>>;
  readonly materialCounts: Readonly<Record<YardCrateMaterialSlot, number>>;
}

export interface YardCrateBlueprint {
  readonly parts: readonly YardCrateVisualPart[];
  readonly colliders: readonly YardCrateCollider[];
  readonly stats: Readonly<YardCrateBlueprintStats>;
}

export const YARD_CRATE_TRIANGLES_PER_PART = 12;
export const YARD_CRATE_MAX_PARTS = 100;
export const YARD_CRATE_MAX_TRIANGLES = 1_200;

export const YARD_CRATE_PLACEMENTS: readonly YardCratePlacement[] = Object.freeze([
  Object.freeze({ id: 'crate-south-west', x: -5, z: -3, scale: 1 }),
  Object.freeze({ id: 'crate-center-east', x: 4, z: 7, scale: 1.2 }),
  Object.freeze({ id: 'crate-east', x: 14, z: -13, scale: .9 }),
  Object.freeze({ id: 'crate-north-west', x: -15, z: 14, scale: 1.1 }),
  Object.freeze({ id: 'crate-far-east', x: 33, z: 5, scale: 1 }),
]);

function clean(value: number): number {
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vector(x: number, y: number, z: number): StaticBoxVector {
  return Object.freeze([clean(x), clean(y), clean(z)]) as StaticBoxVector;
}

function createCollider(placement: YardCratePlacement): YardCrateCollider {
  const half = .75 * placement.scale;
  return Object.freeze({
    crateId: placement.id,
    size: vector(half * 2, half * 2, half * 2),
    position: vector(placement.x, half, placement.z),
    min: vector(placement.x - half, 0, placement.z - half),
    max: vector(placement.x + half, half * 2, placement.z + half),
  });
}

/**
 * Builds five modern yard crates without materials or Three.js objects. The
 * visible boards are inset over a smaller core, so their narrow gaps read as
 * actual recesses. Every detail remains within the original collider envelope;
 * callers therefore retain one authoritative, seam-free collider per crate.
 */
export function createYardCrateBlueprint(): YardCrateBlueprint {
  const parts: YardCrateVisualPart[] = [];
  const add = (
    placement: YardCratePlacement,
    suffix: string,
    role: YardCratePartRole,
    materialSlot: YardCrateMaterialSlot,
    localSize: StaticBoxVector,
    localPosition: StaticBoxVector,
    castShadow?: boolean,
  ): void => {
    const scale = placement.scale;
    parts.push(Object.freeze({
      name: `${placement.id}-${suffix}`,
      crateId: placement.id,
      role,
      materialSlot,
      size: vector(localSize[0] * scale, localSize[1] * scale, localSize[2] * scale),
      position: vector(
        placement.x + localPosition[0] * scale,
        localPosition[1] * scale,
        placement.z + localPosition[2] * scale,
      ),
      ...(castShadow === undefined ? {} : { castShadow }),
    }));
  };

  for (const placement of YARD_CRATE_PLACEMENTS) {
    // The recessed body closes the crate through the deliberate board gaps.
    add(placement, 'inner-core', 'inner-core', 'wood', vector(1.28, 1.28, 1.28), vector(0, .75, 0));

    // Two broad separated boards on both long faces establish a readable slat
    // cadence without overspending geometry in the central junction view.
    for (const side of [-1, 1] as const) for (let slat = 0; slat < 2; slat++) {
      const offset = (slat - .5) * .64;
      add(
        placement,
        `${side < 0 ? 'front' : 'back'}-slat-${slat}`,
        'face-slat',
        'wood',
        vector(.58, 1.18, .08),
        vector(offset, .75, side * .71),
      );
    }

    // Broad inset side boards keep the box solid without spending extra batches.
    for (const side of [-1, 1] as const) {
      add(
        placement,
        `${side < 0 ? 'left' : 'right'}-panel`,
        'side-panel',
        'wood',
        vector(.08, 1.18, 1.28),
        vector(side * .71, .75, 0),
      );
    }

    // A split lid remains flush with the collider's top plane.
    for (let slat = 0; slat < 3; slat++) {
      add(
        placement,
        `lid-slat-${slat}`,
        'lid-slat',
        'wood',
        vector(.42, .09, 1.28),
        vector((slat - 1) * .46, 1.455, 0),
      );
    }

    // Four dark edge protectors strengthen the silhouette while remaining flush.
    for (const xSide of [-1, 1] as const) for (const zSide of [-1, 1] as const) {
      add(
        placement,
        `corner-${xSide < 0 ? 'left' : 'right'}-${zSide < 0 ? 'front' : 'back'}`,
        'corner-batten',
        'dark',
        vector(.1, 1.42, .1),
        vector(xSide * .7, .75, zSide * .7),
      );
    }

    // Paired retaining straps cross the lid below its maximum height.
    for (const side of [-1, 1] as const) {
      add(
        placement,
        `lid-strap-${side < 0 ? 'left' : 'right'}`,
        'strap',
        'dark',
        vector(.09, .05, 1.38),
        vector(side * .42, 1.475, 0),
      );
    }

    // A flush front plate gives the renderer one accent/stencil material target.
    add(
      placement,
      'front-stencil-plate',
      'stencil-plate',
      'accent',
      vector(.38, .24, .025),
      vector(0, .78, -.7375),
    );
  }

  const roleCounts: Record<YardCratePartRole, number> = {
    'inner-core': 0,
    'face-slat': 0,
    'side-panel': 0,
    'lid-slat': 0,
    'corner-batten': 0,
    strap: 0,
    'stencil-plate': 0,
  };
  const materialCounts: Record<YardCrateMaterialSlot, number> = { wood: 0, dark: 0, accent: 0 };
  for (const part of parts) {
    roleCounts[part.role]++;
    materialCounts[part.materialSlot]++;
  }

  const frozenParts = Object.freeze(parts);
  const colliders = Object.freeze(YARD_CRATE_PLACEMENTS.map(createCollider));
  const stats = Object.freeze({
    crates: YARD_CRATE_PLACEMENTS.length,
    parts: frozenParts.length,
    partsPerCrate: frozenParts.length / YARD_CRATE_PLACEMENTS.length,
    triangles: frozenParts.length * YARD_CRATE_TRIANGLES_PER_PART,
    roleCounts: Object.freeze(roleCounts),
    materialCounts: Object.freeze(materialCounts),
  });
  if (stats.parts > YARD_CRATE_MAX_PARTS || stats.triangles > YARD_CRATE_MAX_TRIANGLES) {
    throw new RangeError('yard crate blueprint exceeds its static-batching geometry budget');
  }
  return Object.freeze({ parts: frozenParts, colliders, stats });
}
