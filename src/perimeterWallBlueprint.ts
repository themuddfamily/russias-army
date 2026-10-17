import type { StaticBoxVector } from './staticBoxBatches';

export type PerimeterWallQuality = 'low' | 'high';
export type PerimeterWallMaterialSlot = 'concrete' | 'dark' | 'snow' | 'accent';
export type PerimeterWallSide = 'north' | 'south' | 'west' | 'east';
export type PerimeterWallPartRole =
  | 'panel'
  | 'post'
  | 'coping'
  | 'snow-cap'
  | 'safety-panel'
  | 'repair-patch';

/**
 * A material-agnostic box. Low-tier parts remain compatible with
 * createStaticBoxBatches; high tier is consumed by the dedicated merged wall
 * presentation so its physical UVs and panel-only draw range stay intact.
 */
export interface PerimeterWallVisualPart {
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly materialSlot: PerimeterWallMaterialSlot;
  readonly role: PerimeterWallPartRole;
  readonly side?: PerimeterWallSide;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

/** One of the four authoritative, unsplit gameplay collision volumes. */
export interface PerimeterWallCollider {
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly min: StaticBoxVector;
  readonly max: StaticBoxVector;
}

export interface PerimeterWallBlueprintStats {
  readonly parts: number;
  readonly triangles: number;
  readonly panels: number;
  readonly posts: number;
  readonly materialCounts: Readonly<Record<PerimeterWallMaterialSlot, number>>;
}

export interface PerimeterWallBlueprint {
  readonly parts: readonly PerimeterWallVisualPart[];
  readonly colliders: readonly PerimeterWallCollider[];
  readonly stats: Readonly<PerimeterWallBlueprintStats>;
}

interface WallBay {
  readonly side: PerimeterWallSide;
  readonly centre: number;
  readonly length: number;
  readonly index: number;
}

const NORTH_Z = -58;
const SOUTH_Z = 58;
const WEST_X = -60;
const EAST_X = 60;
const WALL_HEIGHT = 3.2;
const WALL_THICKNESS = .8;
const LONG_PANEL_LENGTH = 10;
const RETURN_PANEL_LENGTH = 11.6;

function clean(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vector(x: number, y: number, z: number): StaticBoxVector {
  return Object.freeze([clean(x), clean(y), clean(z)]) as StaticBoxVector;
}

function collider(
  size: StaticBoxVector,
  position: StaticBoxVector,
  min: StaticBoxVector,
  max: StaticBoxVector,
): PerimeterWallCollider {
  return Object.freeze({ size, position, min, max });
}

function createColliders(): readonly PerimeterWallCollider[] {
  return Object.freeze([
    collider(vector(120, 3.2, .8), vector(0, 1.6, -58), vector(-60, 0, -58.4), vector(60, 3.2, -57.6)),
    collider(vector(120, 3.2, .8), vector(0, 1.6, 58), vector(-60, 0, 57.6), vector(60, 3.2, 58.4)),
    collider(vector(.8, 3.2, 116), vector(-60, 1.6, 0), vector(-60.4, 0, -58), vector(-59.6, 3.2, 58)),
    collider(vector(.8, 3.2, 116), vector(60, 1.6, 0), vector(59.6, 0, -58), vector(60.4, 3.2, 58)),
  ]);
}

function addPart(
  parts: PerimeterWallVisualPart[],
  size: StaticBoxVector,
  position: StaticBoxVector,
  materialSlot: PerimeterWallMaterialSlot,
  role: PerimeterWallPartRole,
  side?: PerimeterWallSide,
  castShadow?: boolean,
): void {
  parts.push(Object.freeze({
    size,
    position,
    materialSlot,
    role,
    ...(side === undefined ? {} : { side }),
    ...(castShadow === undefined ? {} : { castShadow }),
  }));
}

function addLegacyPosts(parts: PerimeterWallVisualPart[]): void {
  for (const x of [WEST_X, EAST_X]) for (const z of [NORTH_Z, SOUTH_Z]) {
    addPart(parts, vector(1.25, 3.5, 1.25), vector(x, 1.75, z), 'concrete', 'post');
  }
  for (let joint = 1; joint < 12; joint++) {
    const x = WEST_X + LONG_PANEL_LENGTH * joint;
    addPart(parts, vector(1.05, 3.5, 1.25), vector(x, 1.75, NORTH_Z), 'concrete', 'post', 'north');
    addPart(parts, vector(1.05, 3.5, 1.25), vector(x, 1.75, SOUTH_Z), 'concrete', 'post', 'south');
  }
  for (let joint = 1; joint < 10; joint++) {
    const z = NORTH_Z + RETURN_PANEL_LENGTH * joint;
    addPart(parts, vector(1.25, 3.5, 1.05), vector(WEST_X, 1.75, z), 'concrete', 'post', 'west');
    addPart(parts, vector(1.25, 3.5, 1.05), vector(EAST_X, 1.75, z), 'concrete', 'post', 'east');
  }
}

function addSafetyPanels(parts: PerimeterWallVisualPart[]): void {
  addPart(parts, vector(2.4, .55, .1), vector(0, 2.05, NORTH_Z + .46), 'accent', 'safety-panel', 'north', false);
  addPart(parts, vector(2.4, .55, .1), vector(0, 2.05, SOUTH_Z - .46), 'accent', 'safety-panel', 'south', false);
  addPart(parts, vector(.1, .55, 2.4), vector(WEST_X + .46, 2.05, 0), 'accent', 'safety-panel', 'west', false);
  addPart(parts, vector(.1, .55, 2.4), vector(EAST_X - .46, 2.05, 0), 'accent', 'safety-panel', 'east', false);
}

function wallBays(): readonly WallBay[] {
  const bays: WallBay[] = [];
  for (let index = 0; index < 12; index++) {
    const centre = WEST_X + LONG_PANEL_LENGTH * (index + .5);
    bays.push({ side: 'north', centre, length: LONG_PANEL_LENGTH, index });
    bays.push({ side: 'south', centre: -centre, length: LONG_PANEL_LENGTH, index });
  }
  for (let index = 0; index < 10; index++) {
    const centre = NORTH_Z + RETURN_PANEL_LENGTH * (index + .5);
    bays.push({ side: 'west', centre, length: RETURN_PANEL_LENGTH, index });
    bays.push({ side: 'east', centre: -centre, length: RETURN_PANEL_LENGTH, index });
  }
  return Object.freeze(bays.map((bay) => Object.freeze(bay)));
}

function orientedSize(side: PerimeterWallSide, along: number, height: number, depth: number): StaticBoxVector {
  return side === 'north' || side === 'south'
    ? vector(along, height, depth)
    : vector(depth, height, along);
}

function orientedPosition(side: PerimeterWallSide, along: number, y: number, inset = 0): StaticBoxVector {
  switch (side) {
    case 'north': return vector(along, y, NORTH_Z + inset);
    case 'south': return vector(along, y, SOUTH_Z - inset);
    case 'west': return vector(WEST_X + inset, y, along);
    case 'east': return vector(EAST_X - inset, y, along);
  }
}

function buildLegacyParts(): readonly PerimeterWallVisualPart[] {
  const parts: PerimeterWallVisualPart[] = [];
  addPart(parts, vector(120, WALL_HEIGHT, WALL_THICKNESS), vector(0, WALL_HEIGHT / 2, NORTH_Z), 'concrete', 'panel', 'north');
  addPart(parts, vector(120, WALL_HEIGHT, WALL_THICKNESS), vector(0, WALL_HEIGHT / 2, SOUTH_Z), 'concrete', 'panel', 'south');
  addPart(parts, vector(WALL_THICKNESS, WALL_HEIGHT, 116), vector(WEST_X, WALL_HEIGHT / 2, 0), 'concrete', 'panel', 'west');
  addPart(parts, vector(WALL_THICKNESS, WALL_HEIGHT, 116), vector(EAST_X, WALL_HEIGHT / 2, 0), 'concrete', 'panel', 'east');

  addLegacyPosts(parts);

  addPart(parts, vector(120.5, .18, 1.08), vector(0, 3.25, NORTH_Z), 'dark', 'coping', 'north');
  addPart(parts, vector(120.5, .18, 1.08), vector(0, 3.25, SOUTH_Z), 'dark', 'coping', 'south');
  addPart(parts, vector(1.08, .18, 116.5), vector(WEST_X, 3.25, 0), 'dark', 'coping', 'west');
  addPart(parts, vector(1.08, .18, 116.5), vector(EAST_X, 3.25, 0), 'dark', 'coping', 'east');

  for (let panel = 0; panel < 12; panel++) {
    const x = WEST_X + LONG_PANEL_LENGTH * (panel + .5);
    addPart(parts, vector(9.45, .12, 1.02), vector(x, 3.4, NORTH_Z), 'snow', 'snow-cap', 'north', false);
    addPart(parts, vector(9.45, .12, 1.02), vector(x, 3.4, SOUTH_Z), 'snow', 'snow-cap', 'south', false);
  }
  for (let panel = 0; panel < 10; panel++) {
    const z = NORTH_Z + RETURN_PANEL_LENGTH * (panel + .5);
    addPart(parts, vector(1.02, .12, 11.05), vector(WEST_X, 3.4, z), 'snow', 'snow-cap', 'west', false);
    addPart(parts, vector(1.02, .12, 11.05), vector(EAST_X, 3.4, z), 'snow', 'snow-cap', 'east', false);
  }

  addSafetyPanels(parts);
  return Object.freeze(parts);
}

function buildHighParts(): readonly PerimeterWallVisualPart[] {
  const parts: PerimeterWallVisualPart[] = [];
  const bays = wallBays();

  // Panels are deliberately first and use two real 1.6 m precast courses. This
  // exact 88-box prefix is the clean structural baseline used by drawRange.
  for (const bay of bays) for (const y of [.8, 2.4]) {
    addPart(
      parts,
      orientedSize(bay.side, bay.length, 1.6, WALL_THICKNESS),
      orientedPosition(bay.side, bay.centre, y),
      'concrete',
      'panel',
      bay.side,
    );
  }

  addLegacyPosts(parts);

  // One coping and one interrupted snow shelf per bay retain the manufactured
  // rhythm without the old four perfectly continuous strips.
  for (const bay of bays) {
    addPart(
      parts,
      orientedSize(bay.side, bay.length - .72, .18, 1.08),
      orientedPosition(bay.side, bay.centre, 3.25),
      'dark',
      'coping',
      bay.side,
    );
  }
  for (const bay of bays) {
    const pairIndex = bay.index % (bay.length === LONG_PANEL_LENGTH ? 6 : 5);
    const lengthFactor = [.72, .81, .67, .77, .70, .84][pairIndex];
    const offsetFactor = [-.075, .055, -.025, .08, -.06, .025][pairIndex];
    const sideSign = bay.side === 'south' || bay.side === 'east' ? -1 : 1;
    const capLength = bay.length * lengthFactor;
    const capCentre = bay.centre + sideSign * bay.length * offsetFactor;
    addPart(
      parts,
      orientedSize(bay.side, capLength, .12, 1.02),
      orientedPosition(bay.side, capCentre, 3.4),
      'snow',
      'snow-cap',
      bay.side,
      false,
    );
  }

  addSafetyPanels(parts);

  // Shallow inward-facing repairs come in six central-symmetry pairs. They are
  // visual spalls only and never fragment the four authoritative colliders.
  const repairs = [
    { side: 'north' as const, along: -42, y: .72, width: 2.7, height: .82 },
    { side: 'north' as const, along: -13, y: 2.47, width: 1.9, height: .56 },
    { side: 'north' as const, along: 31, y: 1.45, width: 3.2, height: .68 },
    { side: 'west' as const, along: -39, y: 1.02, width: 2.4, height: .74 },
    { side: 'west' as const, along: 8, y: 2.58, width: 3.1, height: .52 },
    { side: 'west' as const, along: 34, y: 1.82, width: 1.8, height: .9 },
  ];
  for (const repair of repairs) {
    const opposite: PerimeterWallSide = repair.side === 'north' ? 'south' : 'east';
    addPart(
      parts,
      orientedSize(repair.side, repair.width, repair.height, .07),
      orientedPosition(repair.side, repair.along, repair.y, .435),
      'concrete',
      'repair-patch',
      repair.side,
    );
    addPart(
      parts,
      orientedSize(opposite, repair.width, repair.height, .07),
      orientedPosition(opposite, -repair.along, repair.y, .435),
      'concrete',
      'repair-patch',
      opposite,
    );
  }

  return Object.freeze(parts);
}

function finalize(parts: readonly PerimeterWallVisualPart[]): PerimeterWallBlueprint {
  const materialCounts: Record<PerimeterWallMaterialSlot, number> = {
    concrete: 0,
    dark: 0,
    snow: 0,
    accent: 0,
  };
  for (const part of parts) materialCounts[part.materialSlot]++;
  Object.freeze(materialCounts);
  const stats = Object.freeze({
    parts: parts.length,
    triangles: parts.length * 12,
    panels: parts.filter((part) => part.role === 'panel').length,
    posts: parts.filter((part) => part.role === 'post').length,
    materialCounts,
  });
  return Object.freeze({ parts, colliders: createColliders(), stats });
}

/**
 * Produces the visual shell for the original 120 x 116 metre perimeter.
 *
 * No argument intentionally preserves the legacy low-tier 100-part blueprint.
 * High quality authors two precast rows, segmented coping, broken snow and
 * shallow repairs while retaining the same four unsplit gameplay colliders.
 */
export function createPerimeterWallBlueprint(
  quality: PerimeterWallQuality = 'low',
): PerimeterWallBlueprint {
  if (quality !== 'low' && quality !== 'high') throw new RangeError('perimeter wall quality must be low or high');
  return finalize(quality === 'high' ? buildHighParts() : buildLegacyParts());
}
