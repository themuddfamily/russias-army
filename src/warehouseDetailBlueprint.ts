import type { StaticBoxVector } from './staticBoxBatches';

export type WarehouseDetailMaterialSlot = 'steel' | 'dark' | 'wood' | 'glass' | 'accent';

export type WarehouseDetailPartRole =
  | 'door-track'
  | 'door-lintel'
  | 'shutter-housing'
  | 'shutter-endcap'
  | 'shutter-slat'
  | 'door-motor'
  | 'warning-plate'
  | 'warning-lens'
  | 'rack-upright'
  | 'rack-shelf'
  | 'rack-fascia'
  | 'pallet-rail'
  | 'pallet-slat'
  | 'ceiling-rail'
  | 'ceiling-housing'
  | 'ceiling-lens'
  | 'conduit'
  | 'conduit-clamp'
  | 'wall-panel'
  | 'bay-marker';

export type WarehousePortalId = 'south' | 'east';

/** A material-independent box accepted by the arena static batching pipeline. */
export interface WarehouseDetailVisualPart {
  readonly name: string;
  readonly role: WarehouseDetailPartRole;
  readonly materialSlot: WarehouseDetailMaterialSlot;
  readonly size: StaticBoxVector;
  readonly position: StaticBoxVector;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

/** The full-width, full-height volume that must remain free at a warehouse portal. */
export interface WarehousePortalClearance {
  readonly id: WarehousePortalId;
  readonly min: StaticBoxVector;
  readonly max: StaticBoxVector;
}

export interface WarehouseDetailBlueprintStats {
  readonly parts: number;
  readonly triangles: number;
  readonly portalParts: number;
  readonly interiorParts: number;
  readonly roleCounts: Readonly<Record<WarehouseDetailPartRole, number>>;
  readonly materialCounts: Readonly<Record<WarehouseDetailMaterialSlot, number>>;
}

export interface WarehouseDetailBlueprint {
  /** Cosmetic parts only: this blueprint deliberately publishes no colliders. */
  readonly parts: readonly WarehouseDetailVisualPart[];
  readonly clearances: readonly WarehousePortalClearance[];
  readonly stats: Readonly<WarehouseDetailBlueprintStats>;
}

export const WAREHOUSE_DETAIL_TRIANGLES_PER_PART = 12;
export const WAREHOUSE_DETAIL_MAX_TRIANGLES = 1_000;

function clean(value: number): number {
  const rounded = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function vector(x: number, y: number, z: number): StaticBoxVector {
  return Object.freeze([clean(x), clean(y), clean(z)]) as StaticBoxVector;
}

/**
 * Authoritative traversable apertures from addBuilding(27, -24, 15, 10, 4.1).
 * The extra wall-normal depth makes accidental reveal obstruction testable.
 */
export const WAREHOUSE_PORTAL_CLEARANCES: readonly WarehousePortalClearance[] = Object.freeze([
  Object.freeze({ id: 'south', min: vector(24.6, 0, -19.4), max: vector(29.4, 2.7, -18.6) }),
  Object.freeze({ id: 'east', min: vector(34.1, 0, -25.7), max: vector(34.9, 2.7, -22.3) }),
]);

/**
 * Builds a compact presentation layer for the fixed warehouse at (27, -24).
 * Both roll-up shutters are fully raised: tracks sit in the adjacent wall
 * reveals and the apron, lintel and motor assemblies occupy existing overhead
 * wall volume. Interior props are shallow wall- or ceiling-mounted silhouettes,
 * so none implies new solid cover or requires a gameplay collider.
 */
export function createWarehouseDetailBlueprint(): WarehouseDetailBlueprint {
  const parts: WarehouseDetailVisualPart[] = [];
  const add = (
    name: string,
    role: WarehouseDetailPartRole,
    materialSlot: WarehouseDetailMaterialSlot,
    size: StaticBoxVector,
    position: StaticBoxVector,
    castShadow?: boolean,
  ): void => {
    parts.push(Object.freeze({
      name,
      role,
      materialSlot,
      size,
      position,
      ...(castShadow === undefined ? {} : { castShadow }),
    }));
  };

  const addSouthPortal = (): void => {
    const z = -19.12;
    for (const [side, x] of [['left', 24.49], ['right', 29.51]] as const) {
      add(`south-track-${side}`, 'door-track', 'steel', vector(.16, 2.64, .2), vector(x, 1.35, z));
    }
    add('south-reveal-lintel', 'door-lintel', 'accent', vector(5.16, .14, .6), vector(27, 2.78, -19));
    add('south-shutter-housing', 'shutter-housing', 'dark', vector(5.1, .36, .34), vector(27, 3.09, z));
    for (const [side, x] of [['left', 24.43], ['right', 29.57]] as const) {
      add(`south-shutter-endcap-${side}`, 'shutter-endcap', 'steel', vector(.14, .42, .4), vector(x, 3.09, z));
    }
    for (let slat = 0; slat < 3; slat++) {
      add(`south-raised-slat-${slat}`, 'shutter-slat', 'steel', vector(4.76, .04, .055), vector(27, 2.75 + slat * .065, -18.82));
    }
    add('south-door-motor', 'door-motor', 'dark', vector(.34, .46, .34), vector(29.63, 3.09, z));
    add('south-warning-plate', 'warning-plate', 'accent', vector(.34, .2, .055), vector(24.35, 2.35, -18.81), false);
    add('south-warning-lens', 'warning-lens', 'glass', vector(.13, .13, .04), vector(24.35, 2.35, -18.775), false);
  };

  const addEastPortal = (): void => {
    const x = 34.62;
    for (const [side, z] of [['north', -25.81], ['south', -22.19]] as const) {
      add(`east-track-${side}`, 'door-track', 'steel', vector(.2, 2.64, .16), vector(x, 1.35, z));
    }
    add('east-reveal-lintel', 'door-lintel', 'accent', vector(.6, .14, 3.76), vector(34.5, 2.78, -24));
    add('east-shutter-housing', 'shutter-housing', 'dark', vector(.34, .36, 3.7), vector(x, 3.09, -24));
    for (const [side, z] of [['north', -25.87], ['south', -22.13]] as const) {
      add(`east-shutter-endcap-${side}`, 'shutter-endcap', 'steel', vector(.4, .42, .14), vector(x, 3.09, z));
    }
    for (let slat = 0; slat < 3; slat++) {
      add(`east-raised-slat-${slat}`, 'shutter-slat', 'steel', vector(.055, .04, 3.36), vector(34.21, 2.75 + slat * .065, -24));
    }
    add('east-door-motor', 'door-motor', 'dark', vector(.34, .46, .34), vector(x, 3.09, -22.07));
    add('east-warning-plate', 'warning-plate', 'accent', vector(.055, .2, .34), vector(34.205, 2.35, -25.95), false);
    add('east-warning-lens', 'warning-lens', 'glass', vector(.04, .13, .13), vector(34.17, 2.35, -25.95), false);
  };

  addSouthPortal();
  addEastPortal();
  const portalParts = parts.length;

  // A shallow rack is fixed to the north wall. At 38 cm deep it reads from the
  // south review camera but is much too shallow to promise stand-alone cover.
  for (let upright = 0; upright < 4; upright++) {
    add(`back-rack-upright-${upright}`, 'rack-upright', 'steel', vector(.1, 2.46, .12), vector(24.75 + upright * 1.5, 1.25, -28.48));
  }
  for (let level = 0; level < 3; level++) {
    const y = .42 + level * .82;
    add(`back-rack-shelf-${level}`, 'rack-shelf', 'wood', vector(4.62, .1, .38), vector(27, y, -28.5));
    add(`back-rack-fascia-${level}`, 'rack-fascia', 'dark', vector(4.7, .08, .08), vector(27, y + .02, -28.285));
  }

  // One empty pallet is stored upright against the same wall. Its open slat
  // pattern communicates scenery rather than a new opaque gameplay obstacle.
  for (const [side, x] of [['left', 30.35], ['right', 31.45]] as const) {
    add(`stored-pallet-rail-${side}`, 'pallet-rail', 'wood', vector(.1, 1.55, .1), vector(x, .82, -28.41));
  }
  for (let slat = 0; slat < 5; slat++) {
    add(`stored-pallet-slat-${slat}`, 'pallet-slat', 'wood', vector(1.35, .11, .1), vector(30.9, .22 + slat * .3, -28.35));
  }

  // Ceiling rails and lit housings extend the existing practical-light rhythm
  // deeper into the room without hanging into the 2.7 m circulation envelope.
  for (const [side, x] of [['west', 22.9], ['east', 31.1]] as const) {
    add(`ceiling-service-rail-${side}`, 'ceiling-rail', 'steel', vector(.1, .08, 7.6), vector(x, 3.94, -24));
  }
  for (const [index, x] of [23, 27, 31].entries()) {
    add(`ceiling-strip-housing-${index}`, 'ceiling-housing', 'dark', vector(2.45, .11, .3), vector(x, 3.88, -26.05), false);
    add(`ceiling-strip-lens-${index}`, 'ceiling-lens', 'glass', vector(2.16, .045, .18), vector(x, 3.81, -26.05), false);
  }

  // Surface conduit on the rear wall gives the interior industrial scale. All
  // segments and clips are less than 14 cm deep and remain tight to the wall.
  add('rear-conduit-header', 'conduit', 'steel', vector(6.4, .09, .09), vector(27.6, 3.22, -28.39));
  for (const [side, x] of [['left', 24.4], ['right', 30.8]] as const) {
    add(`rear-conduit-riser-${side}`, 'conduit', 'steel', vector(.09, 1.55, .09), vector(x, 2.49, -28.39));
  }
  for (let clip = 0; clip < 4; clip++) {
    add(`rear-conduit-clip-${clip}`, 'conduit-clamp', 'steel', vector(.18, .16, .055), vector(25.2 + clip * 1.6, 3.22, -28.335), false);
  }

  // Thin service panels and accent identifiers occupy the otherwise blank rear
  // wall; they do not project far enough to resemble interactable cover.
  for (let panel = 0; panel < 4; panel++) {
    const x = 22.45 + panel * 3.03;
    add(`rear-service-panel-${panel}`, 'wall-panel', 'steel', vector(1.02, .72, .045), vector(x, 2.63, -28.69), false);
    add(`rear-bay-marker-${panel}`, 'bay-marker', 'accent', vector(.38, .18, .035), vector(x, 2.63, -28.655), false);
  }

  const roleCounts: Record<WarehouseDetailPartRole, number> = {
    'door-track': 0,
    'door-lintel': 0,
    'shutter-housing': 0,
    'shutter-endcap': 0,
    'shutter-slat': 0,
    'door-motor': 0,
    'warning-plate': 0,
    'warning-lens': 0,
    'rack-upright': 0,
    'rack-shelf': 0,
    'rack-fascia': 0,
    'pallet-rail': 0,
    'pallet-slat': 0,
    'ceiling-rail': 0,
    'ceiling-housing': 0,
    'ceiling-lens': 0,
    conduit: 0,
    'conduit-clamp': 0,
    'wall-panel': 0,
    'bay-marker': 0,
  };
  const materialCounts: Record<WarehouseDetailMaterialSlot, number> = {
    steel: 0,
    dark: 0,
    wood: 0,
    glass: 0,
    accent: 0,
  };
  for (const part of parts) {
    roleCounts[part.role]++;
    materialCounts[part.materialSlot]++;
  }

  const frozenParts = Object.freeze(parts);
  const stats = Object.freeze({
    parts: frozenParts.length,
    triangles: frozenParts.length * WAREHOUSE_DETAIL_TRIANGLES_PER_PART,
    portalParts,
    interiorParts: frozenParts.length - portalParts,
    roleCounts: Object.freeze(roleCounts),
    materialCounts: Object.freeze(materialCounts),
  });
  if (stats.triangles > WAREHOUSE_DETAIL_MAX_TRIANGLES) {
    throw new RangeError('warehouse detail blueprint exceeds its static-batching geometry budget');
  }
  return Object.freeze({ parts: frozenParts, clearances: WAREHOUSE_PORTAL_CLEARANCES, stats });
}
