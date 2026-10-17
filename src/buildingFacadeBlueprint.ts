import type { StaticBoxVector } from './staticBoxBatches';

export type BuildingFacadeId = 'block-01' | 'barracks' | 'warehouse' | 'infirmary';
export type BuildingFacadeFace = 'south' | 'east';
export type BuildingFacadeMaterialSlot = 'concrete' | 'dark' | 'accent' | 'glass';
export type BuildingFacadePartRole =
  | 'entrance-jamb'
  | 'entrance-lintel'
  | 'threshold'
  | 'drain-grate'
  | 'drain-bar'
  | 'drainpipe'
  | 'pipe-bracket'
  | 'pipe-outlet'
  | 'conduit'
  | 'junction-box'
  | 'indicator'
  | 'roof-flashing'
  | 'panel-joint';

export interface BuildingFacadeSpec {
  readonly id: BuildingFacadeId;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly southGap: number;
  readonly eastGap: number;
  readonly openingHeight: number;
}

/** A material-independent façade box accepted by the arena static batcher. */
export interface BuildingFacadeVisualPart {
  readonly name: string;
  readonly buildingId: BuildingFacadeId;
  /** Stable spatial bucket; prevents distant buildings sharing one giant batch. */
  readonly cluster: string;
  readonly face?: BuildingFacadeFace;
  readonly role: BuildingFacadePartRole;
  readonly materialSlot: BuildingFacadeMaterialSlot;
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface BuildingFacadeBlueprintStats {
  readonly buildings: number;
  readonly entrances: number;
  readonly parts: number;
  readonly triangles: number;
  readonly buildingCounts: Readonly<Record<BuildingFacadeId, number>>;
  readonly roleCounts: Readonly<Record<BuildingFacadePartRole, number>>;
  readonly materialCounts: Readonly<Record<BuildingFacadeMaterialSlot, number>>;
}

export interface BuildingFacadeBlueprint {
  readonly parts: readonly BuildingFacadeVisualPart[];
  readonly stats: Readonly<BuildingFacadeBlueprintStats>;
}

export const BUILDING_FACADE_TRIANGLES_PER_PART = 12;
export const BUILDING_FACADE_MAX_PARTS = 100;
export const BUILDING_FACADE_MAX_TRIANGLES = 1_200;

function clean(value: number): number {
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vector(x: number, y: number, z: number): StaticBoxVector {
  return Object.freeze([clean(x), clean(y), clean(z)]) as StaticBoxVector;
}

function spec(
  id: BuildingFacadeId,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  southGap: number,
  eastGap: number,
): BuildingFacadeSpec {
  return Object.freeze({
    id,
    x,
    z,
    width,
    depth,
    height,
    southGap,
    eastGap,
    openingHeight: Math.min(2.7, height - .65),
  });
}

/** Mirrors the four authoritative addBuilding calls in arena.ts. */
export const BUILDING_FACADE_SPECS: readonly BuildingFacadeSpec[] = Object.freeze([
  spec('block-01', -21, -18, 24, 14, 5.6, 2.2, 0),
  spec('barracks', 24, 19, 19, 13, 4.8, 3.2, 2.4),
  spec('warehouse', 27, -24, 15, 10, 4.1, 4.8, 3.4),
  spec('infirmary', -26, 25, 14, 10, 3.8, 2.2, 4.2),
]);

/**
 * Builds compact exterior detailing for all four arena buildings.
 *
 * Door jambs and lintels sit on the solid wall side of the exact addBuilding
 * openings. Thresholds and drains are cosmetic floor plates, and no collider is
 * returned or implied. The details can therefore improve depth and scale without
 * narrowing a player or projectile path.
 */
export function createBuildingFacadeBlueprint(): BuildingFacadeBlueprint {
  const parts: BuildingFacadeVisualPart[] = [];
  const add = (
    building: BuildingFacadeSpec,
    suffix: string,
    role: BuildingFacadePartRole,
    materialSlot: BuildingFacadeMaterialSlot,
    size: StaticBoxVector,
    position: StaticBoxVector,
    face?: BuildingFacadeFace,
    castShadow?: boolean,
  ): void => {
    parts.push(Object.freeze({
      name: `${building.id}-${suffix}`,
      buildingId: building.id,
      cluster: `building-facade:${building.id}`,
      role,
      materialSlot,
      size,
      position,
      ...(face === undefined ? {} : { face }),
      ...(castShadow === undefined ? {} : { castShadow }),
    }));
  };

  const addEntrance = (
    building: BuildingFacadeSpec,
    face: BuildingFacadeFace,
    gap: number,
  ): void => {
    const openingHeight = building.openingHeight;
    const south = face === 'south';
    const facadeCoordinate = south
      ? building.z + building.depth / 2
      : building.x + building.width / 2;

    // Deep returns terminate at, but never cross, the clear opening boundary.
    for (const side of [-1, 1] as const) {
      add(
        building,
        `${face}-reveal-${side < 0 ? 'left' : 'right'}`,
        'entrance-jamb',
        'concrete',
        south ? vector(.1, openingHeight, .48) : vector(.48, openingHeight, .1),
        south
          ? vector(building.x + side * (gap / 2 + .05), openingHeight / 2, facadeCoordinate - .02)
          : vector(facadeCoordinate - .02, openingHeight / 2, building.z + side * (gap / 2 + .05)),
        face,
      );
    }
    add(
      building,
      `${face}-reveal-lintel`,
      'entrance-lintel',
      'concrete',
      south ? vector(gap, .12, .48) : vector(.48, .12, gap),
      south
        ? vector(building.x, openingHeight + .06, facadeCoordinate - .02)
        : vector(facadeCoordinate - .02, openingHeight + .06, building.z),
      face,
    );

    // Flush floor plates keep the traversal volume clear above ankle height.
    add(
      building,
      `${face}-threshold`,
      'threshold',
      'dark',
      south ? vector(gap - .16, .05, .76) : vector(.76, .05, gap - .16),
      south
        ? vector(building.x, .025, facadeCoordinate + .08)
        : vector(facadeCoordinate + .08, .025, building.z),
      face,
      false,
    );

    const drainCoordinate = facadeCoordinate + .7;
    add(
      building,
      `${face}-drain-grate`,
      'drain-grate',
      'dark',
      south ? vector(gap - .34, .045, .34) : vector(.34, .045, gap - .34),
      south
        ? vector(building.x, .0225, drainCoordinate)
        : vector(drainCoordinate, .0225, building.z),
      face,
      false,
    );
    for (const side of [-1, 1] as const) {
      add(
        building,
        `${face}-drain-bar-${side < 0 ? 'left' : 'right'}`,
        'drain-bar',
        'accent',
        south ? vector(.055, .026, .36) : vector(.36, .026, .055),
        south
          ? vector(building.x + side * gap * .22, .05, drainCoordinate)
          : vector(drainCoordinate, .05, building.z + side * gap * .22),
        face,
        false,
      );
    }
  };

  for (const building of BUILDING_FACADE_SPECS) {
    addEntrance(building, 'south', building.southGap);
    if (building.eastGap > 0) addEntrance(building, 'east', building.eastGap);

    // A sparse downpipe occupies a blank north-west corner, away from both door
    // families. Brackets and a short kick make it read as infrastructure rather
    // than an arbitrary vertical stripe.
    const pipeX = building.x - building.width / 2 - .34;
    const pipeZ = building.z - building.depth / 2 + 1;
    add(building, 'north-west-drainpipe', 'drainpipe', 'dark', vector(.12, building.height - .7, .12), vector(pipeX, building.height / 2, pipeZ));
    for (const [index, y] of [1.25, building.height - 1] .entries()) {
      add(building, `north-west-pipe-bracket-${index}`, 'pipe-bracket', 'dark', vector(.18, .08, .18), vector(pipeX, y, pipeZ));
    }
    add(building, 'north-west-pipe-outlet', 'pipe-outlet', 'dark', vector(.32, .12, .12), vector(pipeX + .1, .31, pipeZ));

    // Surface conduit and a lit status jewel give each entrance a small amount
    // of believable service detail, positioned well outside the south opening.
    const utilityX = building.x - building.southGap / 2 - .92;
    const utilityZ = building.z + building.depth / 2 + .345;
    const conduitTop = building.height - .36;
    const conduitStart = 1.66;
    add(building, 'south-utility-conduit-vertical', 'conduit', 'dark', vector(.08, conduitTop - conduitStart, .08), vector(utilityX, (conduitTop + conduitStart) / 2, utilityZ), 'south');
    add(building, 'south-utility-conduit-horizontal', 'conduit', 'dark', vector(1.1, .08, .08), vector(utilityX - .51, conduitTop, utilityZ), 'south');
    add(building, 'south-utility-junction-box', 'junction-box', 'dark', vector(.52, .62, .12), vector(utilityX, 1.34, utilityZ), 'south');
    add(building, 'south-utility-indicator', 'indicator', 'glass', vector(.12, .12, .025), vector(utilityX, 1.34, utilityZ + .0725), 'south', false);

    // Two restrained flashing lines sharpen the roof edge; a single rear panel
    // joint breaks up the largest uninterrupted wall without excessive geometry.
    add(building, 'south-roof-flashing', 'roof-flashing', 'accent', vector(building.width - .8, .08, .14), vector(building.x, building.height + .45, building.z + building.depth / 2 + .16), 'south');
    add(building, 'east-roof-flashing', 'roof-flashing', 'accent', vector(.14, .08, building.depth - .8), vector(building.x + building.width / 2 + .16, building.height + .45, building.z), 'east');
    add(building, 'north-panel-joint', 'panel-joint', 'dark', vector(.07, building.height - .9, .055), vector(building.x + building.width * .18, building.height / 2, building.z - building.depth / 2 - .39));
  }

  const buildingCounts: Record<BuildingFacadeId, number> = {
    'block-01': 0,
    barracks: 0,
    warehouse: 0,
    infirmary: 0,
  };
  const roleCounts: Record<BuildingFacadePartRole, number> = {
    'entrance-jamb': 0,
    'entrance-lintel': 0,
    threshold: 0,
    'drain-grate': 0,
    'drain-bar': 0,
    drainpipe: 0,
    'pipe-bracket': 0,
    'pipe-outlet': 0,
    conduit: 0,
    'junction-box': 0,
    indicator: 0,
    'roof-flashing': 0,
    'panel-joint': 0,
  };
  const materialCounts: Record<BuildingFacadeMaterialSlot, number> = {
    concrete: 0,
    dark: 0,
    accent: 0,
    glass: 0,
  };
  for (const part of parts) {
    buildingCounts[part.buildingId]++;
    roleCounts[part.role]++;
    materialCounts[part.materialSlot]++;
  }

  const frozenParts = Object.freeze(parts);
  const stats = Object.freeze({
    buildings: BUILDING_FACADE_SPECS.length,
    entrances: BUILDING_FACADE_SPECS.reduce((total, building) => total + 1 + (building.eastGap > 0 ? 1 : 0), 0),
    parts: frozenParts.length,
    triangles: frozenParts.length * BUILDING_FACADE_TRIANGLES_PER_PART,
    buildingCounts: Object.freeze(buildingCounts),
    roleCounts: Object.freeze(roleCounts),
    materialCounts: Object.freeze(materialCounts),
  });
  if (stats.parts > BUILDING_FACADE_MAX_PARTS || stats.triangles > BUILDING_FACADE_MAX_TRIANGLES) {
    throw new RangeError('building façade blueprint exceeds its static-batching geometry budget');
  }
  return Object.freeze({ parts: frozenParts, stats });
}
