import type { StaticBoxVector } from './staticBoxBatches';

export type BlastBarrierMaterialSlot = 'concrete' | 'snow' | 'dark' | 'accent';
export type BlastBarrierId = 'north' | 'east' | 'south' | 'west';
export type BlastBarrierOrientation = 'horizontal' | 'vertical';
export type BlastBarrierPartRole = 'panel' | 'buttress' | 'plinth' | 'snow-cap' | 'hazard-panel';

/** A material-independent box compatible with the arena's static-box batches. */
export interface BlastBarrierVisualPart {
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly materialSlot: BlastBarrierMaterialSlot;
  readonly role: BlastBarrierPartRole;
  readonly barrier: BlastBarrierId;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

/** One authoritative, unsplit gameplay collision volume from the original arena. */
export interface BlastBarrierCollider {
  readonly barrier: BlastBarrierId;
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly min: StaticBoxVector;
  readonly max: StaticBoxVector;
}

export interface BlastBarrierBlueprintStats {
  readonly parts: number;
  readonly triangles: number;
  readonly roleCounts: Readonly<Record<BlastBarrierPartRole, number>>;
  readonly materialCounts: Readonly<Record<BlastBarrierMaterialSlot, number>>;
}

export interface BlastBarrierBlueprint {
  readonly parts: readonly BlastBarrierVisualPart[];
  readonly colliders: readonly BlastBarrierCollider[];
  readonly stats: Readonly<BlastBarrierBlueprintStats>;
}

export const BLAST_BARRIER_TRIANGLES_PER_PART = 12;

interface BarrierSpec {
  readonly id: BlastBarrierId;
  readonly orientation: BlastBarrierOrientation;
  readonly position: StaticBoxVector;
  readonly size: StaticBoxVector;
  readonly segments: number;
  /** Direction of the playable-facing hazard plates on the short axis. */
  readonly accentSide: -1 | 1;
}

function clean(value: number): number {
  // Keep repeating panel divisions effectively exact at gameplay scale while
  // still normalising floating-point tails in the public collider records.
  const rounded = Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vector(x: number, y: number, z: number): StaticBoxVector {
  return Object.freeze([clean(x), clean(y), clean(z)]) as StaticBoxVector;
}

function freezeCollider(spec: BarrierSpec): BlastBarrierCollider {
  const [x, y, z] = spec.position;
  const [width, height, depth] = spec.size;
  return Object.freeze({
    barrier: spec.id,
    size: spec.size,
    position: spec.position,
    min: vector(x - width / 2, y - height / 2, z - depth / 2),
    max: vector(x + width / 2, y + height / 2, z + depth / 2),
  });
}

const SPECS: readonly BarrierSpec[] = Object.freeze([
  Object.freeze({ id: 'north', orientation: 'horizontal', size: vector(18, 2.4, .65), position: vector(0, 1.2, -8), segments: 6, accentSide: 1 }),
  Object.freeze({ id: 'east', orientation: 'vertical', size: vector(.65, 2.4, 16), position: vector(8.7, 1.2, 0), segments: 5, accentSide: -1 }),
  Object.freeze({ id: 'south', orientation: 'horizontal', size: vector(12, 1.6, .7), position: vector(-4, .8, 12), segments: 4, accentSide: -1 }),
  Object.freeze({ id: 'west', orientation: 'vertical', size: vector(.7, 1.6, 8), position: vector(-10, .8, 8.3), segments: 3, accentSide: 1 }),
]);

/**
 * Builds a modern, material-independent visual shell for the four central blast
 * barriers. Concrete panels exactly tile each original collision envelope; the
 * buttresses, plinths, broken snow coping and warning plates are visual-only
 * overlaps. Gameplay therefore retains four continuous collision volumes and
 * cannot acquire navigation or projectile seams at the visible panel joints.
 */
export function createBlastBarrierBlueprint(): BlastBarrierBlueprint {
  const parts: BlastBarrierVisualPart[] = [];
  const add = (
    spec: BarrierSpec,
    size: StaticBoxVector,
    position: StaticBoxVector,
    materialSlot: BlastBarrierMaterialSlot,
    role: BlastBarrierPartRole,
    castShadow?: boolean,
  ): void => {
    parts.push(Object.freeze({
      size,
      position,
      materialSlot,
      role,
      barrier: spec.id,
      ...(castShadow === undefined ? {} : { castShadow }),
    }));
  };

  for (const spec of SPECS) {
    const [x, , z] = spec.position;
    const [width, height, depth] = spec.size;
    const horizontal = spec.orientation === 'horizontal';
    const length = horizontal ? width : depth;
    const thickness = horizontal ? depth : width;
    const segmentLength = length / spec.segments;
    const start = (horizontal ? x : z) - length / 2;

    // The panel boxes are contiguous and tile the authoritative volume exactly.
    for (let segment = 0; segment < spec.segments; segment++) {
      const along = start + segmentLength * (segment + .5);
      add(
        spec,
        horizontal ? vector(segmentLength, height, thickness) : vector(thickness, height, segmentLength),
        horizontal ? vector(along, height / 2, z) : vector(x, height / 2, along),
        'concrete',
        'panel',
      );
    }

    // Slightly proud joints establish a readable precast cadence at combat range.
    for (let joint = 0; joint <= spec.segments; joint++) {
      const along = start + segmentLength * joint;
      add(
        spec,
        horizontal ? vector(.3, height + .18, thickness + .3) : vector(thickness + .3, height + .18, .3),
        horizontal ? vector(along, (height + .18) / 2, z) : vector(x, (height + .18) / 2, along),
        'concrete',
        'buttress',
      );
    }

    // One dark footing grounds each wall without adding collision complexity.
    add(
      spec,
      horizontal ? vector(length + .4, .22, thickness + .24) : vector(thickness + .24, .22, length + .4),
      vector(x, .11, z),
      'dark',
      'plinth',
    );

    // Broken coping avoids a perfectly flat white strip and exposes every joint.
    for (let segment = 0; segment < spec.segments; segment++) {
      const along = start + segmentLength * (segment + .5);
      add(
        spec,
        horizontal ? vector(segmentLength - .14, .12, thickness + .24) : vector(thickness + .24, .12, segmentLength - .14),
        horizontal ? vector(along, height + .06, z) : vector(x, height + .06, along),
        'snow',
        'snow-cap',
        false,
      );
    }

    // A mirrored pair of inset warning plates faces the central playable space.
    for (const sign of [-1, 1]) {
      const along = (horizontal ? x : z) + sign * length * .22;
      const across = (horizontal ? z : x) + spec.accentSide * (thickness / 2 + .031);
      add(
        spec,
        horizontal ? vector(1.15, .46, .06) : vector(.06, .46, 1.15),
        horizontal ? vector(along, height * .57, across) : vector(across, height * .57, along),
        'accent',
        'hazard-panel',
        false,
      );
    }
  }

  const roleCounts: Record<BlastBarrierPartRole, number> = {
    panel: 0,
    buttress: 0,
    plinth: 0,
    'snow-cap': 0,
    'hazard-panel': 0,
  };
  const materialCounts: Record<BlastBarrierMaterialSlot, number> = {
    concrete: 0,
    snow: 0,
    dark: 0,
    accent: 0,
  };
  for (const part of parts) {
    roleCounts[part.role]++;
    materialCounts[part.materialSlot]++;
  }

  const frozenParts = Object.freeze(parts);
  const colliders = Object.freeze(SPECS.map(freezeCollider));
  const stats = Object.freeze({
    parts: frozenParts.length,
    triangles: frozenParts.length * BLAST_BARRIER_TRIANGLES_PER_PART,
    roleCounts: Object.freeze(roleCounts),
    materialCounts: Object.freeze(materialCounts),
  });
  return Object.freeze({ parts: frozenParts, colliders, stats });
}
