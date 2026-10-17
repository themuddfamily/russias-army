export type ArenaVector = readonly [number, number, number];

export interface ArenaVectorLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type ArenaColliderKind =
  | 'building'
  | 'interior'
  | 'barrier'
  | 'crate'
  | 'sandbag'
  | 'watchtower'
  | 'fence'
  | 'barrel'
  | 'transport'
  | 'perimeter';

export interface ArenaAabb {
  readonly id: string;
  readonly kind: ArenaColliderKind;
  readonly min: ArenaVector;
  readonly max: ArenaVector;
}

export interface ArenaRaycastOptions {
  /** Ignore intersections closer than this many world metres. */
  readonly minDistance?: number;
  /** The packed-snow plane is authoritative but is not one of the 95 AABBs. */
  readonly includeGround?: boolean;
  /** Original triangle rays only: exclude a model when its name or a retained
   * ancestor name matches. Does not change support, sweeps or physics geometry. */
  readonly excludeModel?: (name: string) => boolean;
}

export interface ArenaRayHit {
  readonly id: string;
  readonly surface: 'collider' | 'ground';
  readonly distance: number;
  readonly point: Readonly<ArenaVectorLike>;
  readonly normal: Readonly<ArenaVectorLike>;
}

const RAY_EPSILON = 1e-10;

function vector(x: number, y: number, z: number): ArenaVector {
  return Object.freeze([x, y, z]) as ArenaVector;
}

function box(
  id: string,
  kind: ArenaColliderKind,
  min: ArenaVector,
  max: ArenaVector,
): ArenaAabb {
  return Object.freeze({ id, kind, min, max });
}

function centeredBox(
  id: string,
  kind: ArenaColliderKind,
  size: ArenaVector,
  center: ArenaVector,
): ArenaAabb {
  return box(
    id,
    kind,
    vector(center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2),
    vector(center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2),
  );
}

interface BuildingSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly eastGap: number;
  readonly frontGap: number;
  readonly roofAccess: boolean;
}

const BUILDINGS: readonly BuildingSpec[] = Object.freeze([
  Object.freeze({ id: 'block-01', x: -21, z: -18, width: 24, depth: 14, height: 5.6, eastGap: 0, frontGap: 2.2, roofAccess: true }),
  Object.freeze({ id: 'barracks', x: 24, z: 19, width: 19, depth: 13, height: 4.8, eastGap: 2.4, frontGap: 3.2, roofAccess: false }),
  Object.freeze({ id: 'warehouse', x: 27, z: -24, width: 15, depth: 10, height: 4.1, eastGap: 3.4, frontGap: 4.8, roofAccess: false }),
  Object.freeze({ id: 'medpoint', x: -26, z: 25, width: 14, depth: 10, height: 3.8, eastGap: 4.2, frontGap: 2.2, roofAccess: false }),
]);

function addBuildingColliders(target: ArenaAabb[], spec: BuildingSpec): void {
  const { id, x, z, width: width, depth: depth, height: height, eastGap, frontGap, roofAccess } = spec;
  const wall = .55;
  const openingHeight = Math.min(2.7, height - .65);
  target.push(
    centeredBox(`building:${id}:rear-wall`, 'building', vector(width, height, wall), vector(x, height / 2, z - depth / 2)),
    centeredBox(`building:${id}:west-wall`, 'building', vector(wall, height, depth), vector(x - width / 2, height / 2, z)),
    centeredBox(`building:${id}:front-east`, 'building', vector((width - frontGap) / 2, height, wall), vector(x + (width + frontGap) / 4, height / 2, z + depth / 2)),
    centeredBox(`building:${id}:front-west`, 'building', vector((width - frontGap) / 2, height, wall), vector(x - (width + frontGap) / 4, height / 2, z + depth / 2)),
    centeredBox(`building:${id}:front-lintel`, 'building', vector(frontGap, height - openingHeight, wall), vector(x, openingHeight + (height - openingHeight) / 2, z + depth / 2)),
  );
  if (eastGap > 0) {
    target.push(
      centeredBox(`building:${id}:east-north`, 'building', vector(wall, height, (depth - eastGap) / 2), vector(x + width / 2, height / 2, z + (depth + eastGap) / 4)),
      centeredBox(`building:${id}:east-south`, 'building', vector(wall, height, (depth - eastGap) / 2), vector(x + width / 2, height / 2, z - (depth + eastGap) / 4)),
      centeredBox(`building:${id}:east-lintel`, 'building', vector(wall, height - openingHeight, eastGap), vector(x + width / 2, openingHeight + (height - openingHeight) / 2, z)),
    );
  }
  target.push(centeredBox(
    `building:${id}:roof`,
    'building',
    vector(width + .25, .35, depth + .25),
    vector(x, height + .15, z),
  ));
  if (!roofAccess) return;
  for (let index = 0; index < 13; index++) {
    target.push(centeredBox(
      `building:${id}:stair-${index}`,
      'building',
      vector(3.1, .35, .85),
      vector(x + width / 2 + 1.5, .18 + index * .45, z - depth / 2 + 1 + index * .7),
    ));
  }
}

function createArenaColliders(): readonly ArenaAabb[] {
  const result: ArenaAabb[] = [];
  for (const building of BUILDINGS) addBuildingColliders(result, building);

  // Sparse interior cover, in the same order authored by addArenaInteriors.
  result.push(
    centeredBox('interior:warehouse:racks', 'interior', vector(1.36, 2.56, 5.75), vector(20.65, 1.28, -22.95)),
    centeredBox('interior:warehouse:pallet-island', 'interior', vector(2.18, 1.24, 1.12), vector(26.5, .62, -23.25)),
    centeredBox('interior:barracks:bunk-0', 'interior', vector(1, 2.05, 2.08), vector(16.25, 1.02, 18.1)),
    centeredBox('interior:barracks:bunk-1', 'interior', vector(1, 2.05, 2.08), vector(18, 1.02, 18.1)),
    centeredBox('interior:barracks:bunk-2', 'interior', vector(1, 2.05, 2.08), vector(16.25, 1.02, 21.45)),
    centeredBox('interior:barracks:bunk-3', 'interior', vector(1, 2.05, 2.08), vector(18, 1.02, 21.45)),
    centeredBox('interior:barracks:lockers', 'interior', vector(3.54, 1.82, .56), vector(21.59, .94, 24.65)),
    centeredBox('interior:barracks:mess-table', 'interior', vector(2.62, .88, 1.14), vector(27.4, .44, 23)),
    centeredBox('interior:medpoint:gurney-0', 'interior', vector(1, .92, 1.94), vector(-31, .46, 24.2)),
    centeredBox('interior:medpoint:gurney-1', 'interior', vector(1, .92, 1.94), vector(-28.85, .46, 27.15)),
    centeredBox('interior:medpoint:reception', 'interior', vector(3.12, 1.12, .72), vector(-25.45, .56, 28.63)),

    box('barrier:north', 'barrier', vector(-9, 0, -8.325), vector(9, 2.4, -7.675)),
    box('barrier:east', 'barrier', vector(8.375, 0, -8), vector(9.025, 2.4, 8)),
    box('barrier:south', 'barrier', vector(-10, 0, 11.65), vector(2, 1.6, 12.35)),
    box('barrier:west', 'barrier', vector(-10.35, 0, 4.3), vector(-9.65, 1.6, 12.3)),

    box('crate:south-west', 'crate', vector(-5.75, 0, -3.75), vector(-4.25, 1.5, -2.25)),
    box('crate:center-east', 'crate', vector(3.1, 0, 6.1), vector(4.9, 1.8, 7.9)),
    box('crate:east', 'crate', vector(13.325, 0, -13.675), vector(14.675, 1.35, -12.325)),
    box('crate:north-west', 'crate', vector(-15.825, 0, 13.175), vector(-14.175, 1.65, 14.825)),
    box('crate:far-east', 'crate', vector(32.25, 0, 4.25), vector(33.75, 1.5, 5.75)),

    // These retain the exact Float32-derived legacy capsule transforms.
    box('sandbag:0', 'sandbag', vector(-2.882132840349632, .020000007152557286, 23.565250999083297), vector(-1.1178671596503678, .6283100509643555, 24.434749000916703)),
    box('sandbag:1', 'sandbag', vector(-1.6321328403496322, .020000007152557286, 23.565250999083297), vector(.13213284034963224, .6283100509643555, 24.434749000916703)),
    box('sandbag:2', 'sandbag', vector(-.38213284034963224, .020000007152557286, 23.565250999083297), vector(1.3821328403496322, .6283100509643555, 24.434749000916703)),
    box('sandbag:3', 'sandbag', vector(.8678671596503678, .020000007152557286, 23.565250999083297), vector(2.632132840349632, .6283100509643555, 24.434749000916703)),
    box('sandbag:4', 'sandbag', vector(2.117867159650368, .020000007152557286, 23.565250999083297), vector(3.882132840349632, .6283100509643555, 24.434749000916703)),
    box('sandbag:5', 'sandbag', vector(3.367867159650368, .020000007152557286, 23.565250999083297), vector(5.132132840349632, .6283100509643555, 24.434749000916703)),
  );

  const towerColliders = (id: string, x: number, z: number): void => {
    result.push(
      centeredBox(`watchtower:${id}:platform`, 'watchtower', vector(3.5, .3, 3.5), vector(x, 5.2, z)),
      centeredBox(`watchtower:${id}:north-wall`, 'watchtower', vector(3.3, 1.8, .18), vector(x, 6.05, z - 1.55)),
      centeredBox(`watchtower:${id}:west-wall`, 'watchtower', vector(.18, 1.8, 3.1), vector(x - 1.55, 6.05, z)),
      centeredBox(`watchtower:${id}:east-wall`, 'watchtower', vector(.18, 1.8, 3.1), vector(x + 1.55, 6.05, z)),
      centeredBox(`watchtower:${id}:roof`, 'watchtower', vector(3.5, .2, 3.5), vector(x, 7.05, z)),
    );
  };
  towerColliders('south-east', 43, -43);
  towerColliders('north-west', -43, 43);

  result.push(
    box('fence:east', 'fence', vector(46.94, 0, -3), vector(47.06, 2.15, 17)),
    box('fence:west', 'fence', vector(-42.06, 0, -29.5), vector(-41.94, 2.15, -4.5)),
    box('fence:north', 'fence', vector(9, 0, 42.94), vector(27, 2.15, 43.06)),

    // CylinderGeometry stores these legacy bounds as Float32 values.
    box('barrel:east-cluster-0', 'barrel', vector(18.639999985694885, .00500000596046446, -17.360000014305115), vector(19.360000014305115, .9549999940395355, -16.639999985694885)),
    box('barrel:east-cluster-1', 'barrel', vector(20.552808087013695, -.05705258056114737, -17.360000014305115), vector(21.447191912986305, 1.0170525805611472, -16.639999985694885)),
    box('barrel:east-cluster-2', 'barrel', vector(33.59437761395407, -.028567003997361895, -17.360000014305115), vector(34.40562238604593, .9885670039973619, -16.639999985694885)),
    box('barrel:west-cluster-0', 'barrel', vector(-18.405622386045927, -.028567003997361895, 14.639999985694885), vector(-17.594377613954073, .9885670039973619, 15.360000014305115)),
    box('barrel:west-cluster-1', 'barrel', vector(-33.360000014305115, .00500000596046446, 28.639999985694885), vector(-32.639999985694885, .9549999940395355, 29.360000014305115)),

    box('transport:yard-cargo-truck', 'transport', vector(7.67, 0, 25.299999999999997), vector(10.33, 2.9, 32.5)),

    box('perimeter:north', 'perimeter', vector(-60, 0, -58.4), vector(60, 3.2, -57.6)),
    box('perimeter:south', 'perimeter', vector(-60, 0, 57.6), vector(60, 3.2, 58.4)),
    box('perimeter:west', 'perimeter', vector(-60.4, 0, -58), vector(-59.6, 3.2, 58)),
    box('perimeter:east', 'perimeter', vector(59.6, 0, -58), vector(60.4, 3.2, 58)),
  );

  if (result.length !== 95) throw new Error(`arena collision manifest must contain 95 AABBs, received ${result.length}`);
  return Object.freeze(result);
}

/** The exact ordered Barrack 01 gameplay collision contract. */
export const ARENA_COLLIDERS = createArenaColliders();

/** Inner faces of the closed perimeter walls. */
export const ARENA_PLAYABLE_BOUNDS = Object.freeze({
  minX: -59.6,
  maxX: 59.6,
  minZ: -57.6,
  maxZ: 57.6,
});

/** The authoritative packed-snow plane, intentionally separate from the 95 AABBs. */
export const ARENA_GROUND = Object.freeze({
  id: 'ground',
  y: 0,
  minX: ARENA_PLAYABLE_BOUNDS.minX,
  maxX: ARENA_PLAYABLE_BOUNDS.maxX,
  minZ: ARENA_PLAYABLE_BOUNDS.minZ,
  maxZ: ARENA_PLAYABLE_BOUNDS.maxZ,
});

function finiteVector(value: ArenaVectorLike): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

interface AabbIntersection {
  readonly distance: number;
  readonly normal: ArenaVectorLike;
}

function intersectAabb(
  origin: ArenaVectorLike,
  direction: ArenaVectorLike,
  collider: ArenaAabb,
  minDistance: number,
  maxDistance: number,
): AabbIntersection | null {
  let beginsOnBoundary = false;
  let pointsInward = false;
  let pointsOutward = false;
  const boundaryOrigins = [origin.x, origin.y, origin.z] as const;
  const boundaryDirections = [direction.x, direction.y, direction.z] as const;
  const beginsInsideClosedBox = boundaryOrigins.every((value, axis) => (
    value >= collider.min[axis] - RAY_EPSILON && value <= collider.max[axis] + RAY_EPSILON
  ));
  for (let axis = 0; axis < 3; axis++) {
    const axisOrigin = boundaryOrigins[axis];
    const axisDirection = boundaryDirections[axis];
    if (Math.abs(axisOrigin - collider.min[axis]) <= RAY_EPSILON) {
      beginsOnBoundary = true;
      if (axisDirection > RAY_EPSILON) pointsInward = true;
      else if (axisDirection < -RAY_EPSILON) pointsOutward = true;
    }
    if (Math.abs(axisOrigin - collider.max[axis]) <= RAY_EPSILON) {
      beginsOnBoundary = true;
      if (axisDirection < -RAY_EPSILON) pointsInward = true;
      else if (axisDirection > RAY_EPSILON) pointsOutward = true;
    }
  }
  // A ray leaving a face or merely travelling along it never enters the box.
  // At an edge, any outward component also leaves the closed volume at once.
  if (beginsInsideClosedBox && beginsOnBoundary && (pointsOutward || !pointsInward)) return null;

  let near = -Infinity;
  let far = Infinity;
  let nearNormal: ArenaVectorLike = { x: 0, y: 0, z: 0 };
  let farNormal: ArenaVectorLike = { x: 0, y: 0, z: 0 };
  const origins = [origin.x, origin.y, origin.z] as const;
  const directions = [direction.x, direction.y, direction.z] as const;

  for (let axis = 0; axis < 3; axis++) {
    const axisOrigin = origins[axis];
    const axisDirection = directions[axis];
    const axisMin = collider.min[axis];
    const axisMax = collider.max[axis];
    if (Math.abs(axisDirection) <= RAY_EPSILON) {
      if (axisOrigin < axisMin || axisOrigin > axisMax) return null;
      continue;
    }
    let entry = (axisMin - axisOrigin) / axisDirection;
    let exit = (axisMax - axisOrigin) / axisDirection;
    let entrySign = -1;
    let exitSign = 1;
    if (entry > exit) {
      [entry, exit] = [exit, entry];
      [entrySign, exitSign] = [exitSign, entrySign];
    }
    if (entry > near) {
      near = entry;
      nearNormal = axis === 0
        ? { x: entrySign, y: 0, z: 0 }
        : axis === 1
          ? { x: 0, y: entrySign, z: 0 }
          : { x: 0, y: 0, z: entrySign };
    }
    if (exit < far) {
      far = exit;
      farNormal = axis === 0
        ? { x: exitSign, y: 0, z: 0 }
        : axis === 1
          ? { x: 0, y: exitSign, z: 0 }
          : { x: 0, y: 0, z: exitSign };
    }
    if (near > far) return null;
  }

  if (far < minDistance || near > maxDistance) return null;
  if (near >= minDistance) return { distance: near, normal: nearNormal };
  if (far >= minDistance && far <= maxDistance) return { distance: far, normal: farNormal };
  return null;
}

/**
 * Returns the nearest arena impact. Direction magnitude is ignored, so the
 * returned distance is always expressed in world metres.
 */
export function raycastArena(
  origin: ArenaVectorLike,
  direction: ArenaVectorLike,
  maxDistance = Infinity,
  options: ArenaRaycastOptions = {},
): ArenaRayHit | null {
  if (!finiteVector(origin) || !finiteVector(direction) || Number.isNaN(maxDistance) || maxDistance < 0) return null;
  const magnitude = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(magnitude) || magnitude === 0) return null;
  const normalized = { x: direction.x / magnitude, y: direction.y / magnitude, z: direction.z / magnitude };
  const configuredMinimum = options.minDistance ?? 0;
  const minDistance = Number.isFinite(configuredMinimum) ? Math.max(0, configuredMinimum) : 0;
  let nearest: ArenaRayHit | null = null;

  const makeHit = (
    id: string,
    surface: ArenaRayHit['surface'],
    distance: number,
    normal: ArenaVectorLike,
  ): ArenaRayHit => Object.freeze({
    id,
    surface,
    distance,
    point: Object.freeze({
      x: origin.x + normalized.x * distance,
      y: origin.y + normalized.y * distance,
      z: origin.z + normalized.z * distance,
    }),
    normal: Object.freeze({ ...normal }),
  });

  for (const collider of ARENA_COLLIDERS) {
    const intersection = intersectAabb(origin, normalized, collider, minDistance, nearest?.distance ?? maxDistance);
    if (intersection && (!nearest || intersection.distance < nearest.distance)) {
      nearest = makeHit(collider.id, 'collider', intersection.distance, intersection.normal);
    }
  }

  if (options.includeGround !== false && Math.abs(normalized.y) > RAY_EPSILON) {
    const beginsOnGround = Math.abs(origin.y - ARENA_GROUND.y) <= RAY_EPSILON;
    const distance = beginsOnGround ? 0 : (ARENA_GROUND.y - origin.y) / normalized.y;
    const limit = nearest?.distance ?? maxDistance;
    if ((!beginsOnGround || normalized.y < 0) && distance >= minDistance && distance <= limit) {
      const x = origin.x + normalized.x * distance;
      const z = origin.z + normalized.z * distance;
      if (x >= ARENA_GROUND.minX && x <= ARENA_GROUND.maxX
        && z >= ARENA_GROUND.minZ && z <= ARENA_GROUND.maxZ
        && (!nearest || distance < nearest.distance)) {
        nearest = makeHit(ARENA_GROUND.id, 'ground', distance, { x: 0, y: 1, z: 0 });
      }
    }
  }
  return nearest;
}

/** True when no arena collider or bounded ground surface lies between two points. */
export function hasArenaLineOfSight(
  from: ArenaVectorLike,
  to: ArenaVectorLike,
  options: ArenaRaycastOptions = {},
): boolean {
  if (!finiteVector(from) || !finiteVector(to)) return false;
  const direction = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const distance = Math.hypot(direction.x, direction.y, direction.z);
  if (distance <= RAY_EPSILON) return true;
  const endpointBias = Math.min(1e-5, distance * .5);
  return raycastArena(from, direction, distance - endpointBias, {
    includeGround: options.includeGround,
    minDistance: options.minDistance ?? 1e-5,
  }) === null;
}

export function isInsideArenaPlayableBounds(point: ArenaVectorLike, margin = 0): boolean {
  if (!finiteVector(point) || !Number.isFinite(margin) || margin < 0) return false;
  return point.x >= ARENA_PLAYABLE_BOUNDS.minX + margin
    && point.x <= ARENA_PLAYABLE_BOUNDS.maxX - margin
    && point.z >= ARENA_PLAYABLE_BOUNDS.minZ + margin
    && point.z <= ARENA_PLAYABLE_BOUNDS.maxZ - margin;
}
