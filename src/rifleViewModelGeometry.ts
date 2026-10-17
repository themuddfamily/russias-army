import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Existing `viewModelWeapons` material names; this module never creates materials. */
export type RifleGeometryPresentation = 'legacy' | 'modern';

export type RifleMaterialSlot = 'gunmetal' | 'darkMetal' | 'edgeMetal' | 'wood';

export interface RifleGroupedGeometryResource {
  /** One material-array entry is required for every slot, in this exact order. */
  readonly materialSlots: readonly RifleMaterialSlot[];
  /** Groups map one-to-one to `materialSlots`; the geometry itself owns no materials. */
  readonly geometry: THREE.BufferGeometry;
}

export interface RifleViewModelGeometryStats {
  readonly geometryCount: number;
  readonly fixedDrawGroups: number;
  readonly movableDrawGroups: number;
  readonly triangleCount: number;
  readonly fixedTriangleCount: number;
  readonly movableTriangleCount: number;
  /** Two hero meshes, the current four control meshes and sixteen hand meshes. */
  readonly estimatedIntegratedMeshes: number;
  /** Material groups plus the current control and hand draw submissions. */
  readonly estimatedIntegratedDraws: number;
  /** Module triangles plus current control and hand geometry. */
  readonly estimatedIntegratedTriangles: number;
}

export interface RifleViewModelGeometrySet {
  /** Geometry authored in `ak47-body` local space. */
  readonly fixed: RifleGroupedGeometryResource;
  /** Geometry authored in the existing `magazine` pivot's local space. */
  readonly magazine: RifleGroupedGeometryResource;
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly stats: Readonly<RifleViewModelGeometryStats>;
  readonly isDisposed: boolean;
  /** Idempotently disposes every owned output geometry exactly once. */
  dispose(): void;
}

/**
 * Coordinates intentionally match the current procedural rifle. Geometry is
 * authored before the view-model root's 0.62 presentation scale.
 */
export const RIFLE_VIEW_MODEL_LAYOUT = Object.freeze({
  forward: Object.freeze([0, 0, -1] as const),
  rootScale: .62,
  anchors: Object.freeze({
    muzzle: Object.freeze([0, .045, -1.9] as const),
    sight: Object.freeze([0, .19, -.08] as const),
    ejection: Object.freeze([.13, .075, -.27] as const),
  }),
  pivots: Object.freeze({
    magazine: Object.freeze([0, -.19, -.2] as const),
    bolt: Object.freeze([.112, .07, -.23] as const),
    trigger: Object.freeze([0, -.13, -.01] as const),
    safety: Object.freeze([.112, .02, -.08] as const),
  }),
  authoredEnvelope: Object.freeze({
    min: Object.freeze([-.16, -.72, -1.9] as const),
    max: Object.freeze([.37, .3, .77] as const),
  }),
});

const CURRENT_HAND_MESHES = 16;
const CURRENT_HAND_TRIANGLES = 3_376;
const CURRENT_CONTROL_MESHES = 4;
const CURRENT_CONTROL_TRIANGLES = 424;

interface Transform {
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
}

function transformed(geometry: THREE.BufferGeometry, transform: Transform = {}): THREE.BufferGeometry {
  const position = new THREE.Vector3(...(transform.position ?? [0, 0, 0]));
  const rotation = new THREE.Euler(...(transform.rotation ?? [0, 0, 0]), 'XYZ');
  const quaternion = new THREE.Quaternion().setFromEuler(rotation);
  const scale = new THREE.Vector3(...(transform.scale ?? [1, 1, 1]));
  geometry.applyMatrix4(new THREE.Matrix4().compose(position, quaternion, scale));
  return geometry;
}

function box(
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  rounded = false,
): THREE.BufferGeometry {
  const geometry = rounded
    ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, Math.min(...size) * .16)
    : new THREE.BoxGeometry(size[0], size[1], size[2]);
  return transformed(geometry, { position, rotation });
}

function cylinderZ(
  radius: number,
  length: number,
  position: readonly [number, number, number],
  segments = 14,
  openEnded = false,
): THREE.BufferGeometry {
  return transformed(
    new THREE.CylinderGeometry(radius, radius, length, segments, 1, openEnded),
    { position, rotation: [Math.PI / 2, 0, 0] },
  );
}

function cylinderX(
  radius: number,
  length: number,
  position: readonly [number, number, number],
  segments = 12,
): THREE.BufferGeometry {
  return transformed(
    new THREE.CylinderGeometry(radius, radius, length, segments),
    { position, rotation: [0, 0, Math.PI / 2] },
  );
}

function cylinderY(
  radius: number,
  length: number,
  position: readonly [number, number, number],
  segments = 10,
): THREE.BufferGeometry {
  return transformed(new THREE.CylinderGeometry(radius, radius, length, segments), { position });
}

/** Extrudes a Y/Z side silhouette across X, with the output centred on X=0. */
function sideProfile(
  points: readonly (readonly [number, number])[],
  width: number,
  bevel = .01,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) shape.lineTo(points[index][0], points[index][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel > 0,
    bevelSegments: bevel > 0 ? 1 : 0,
    bevelSize: bevel,
    bevelThickness: bevel,
  });
  // Shape X is desired world Z; extrusion Z is desired world -X.
  geometry.translate(0, 0, -width * .5);
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

/** A faceted box whose front and rear cross-sections differ. */
function taperedBoxZ(
  rearZ: number,
  frontZ: number,
  rearWidth: number,
  frontWidth: number,
  rearHeight: number,
  frontHeight: number,
  centerY: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const sourceX = positions.getX(index);
    const sourceY = positions.getY(index);
    const sourceZ = positions.getZ(index);
    const atRear = sourceZ > 0;
    const width = atRear ? rearWidth : frontWidth;
    const height = atRear ? rearHeight : frontHeight;
    positions.setXYZ(
      index,
      sourceX * width,
      centerY + sourceY * height,
      atRear ? rearZ : frontZ,
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function indexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.getAttribute('uv')) {
    const positions = geometry.getAttribute('position');
    const uv = new Float32Array(positions.count * 2);
    for (let index = 0; index < positions.count; index++) {
      uv[index * 2] = positions.getX(index);
      uv[index * 2 + 1] = positions.getZ(index);
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  if (geometry.index) return geometry;
  const result = mergeVertices(geometry, 1e-5);
  geometry.dispose();
  return result;
}

function merged(
  name: string,
  features: readonly string[],
  sources: THREE.BufferGeometry[],
): THREE.BufferGeometry {
  const prepared = sources.map(indexed);
  const result = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();
  if (!result) throw new Error(`Unable to merge ${name}.`);
  const output = indexed(result);
  output.name = name;
  output.userData.rifleMaterialIndependent = true;
  output.userData.rifleFeatures = Object.freeze([...features]);
  output.computeBoundingBox();
  output.computeBoundingSphere();
  return output;
}

function grouped(
  name: string,
  layers: readonly { readonly slot: RifleMaterialSlot; readonly geometry: THREE.BufferGeometry }[],
): RifleGroupedGeometryResource {
  const materialSlots = Object.freeze(layers.map((layer) => layer.slot));
  const features = Object.freeze(layers.flatMap((layer) => layer.geometry.userData.rifleFeatures as string[]));
  const geometry = mergeGeometries(layers.map((layer) => layer.geometry), true);
  for (const layer of layers) layer.geometry.dispose();
  if (!geometry) throw new Error(`Unable to group ${name}.`);
  if (!geometry.index) throw new Error(`${name} unexpectedly lost its index.`);
  geometry.name = name;
  geometry.userData.rifleMaterialIndependent = true;
  geometry.userData.rifleFeatures = features;
  geometry.userData.rifleMaterialSlots = materialSlots;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return Object.freeze({ materialSlots, geometry });
}

function fixedGunmetal(presentation: RifleGeometryPresentation): THREE.BufferGeometry {
  if (presentation === 'legacy') {
    return merged('AK47LegacyFixedGunmetalGeometry', [
      'stamped-receiver', 'faceted-dust-cover', 'forward-trunnion',
    ], [
      sideProfile([[-.6, -.105], [.23, -.12], [.3, .02], [.24, .15], [-.5, .15]], .30, 0),
      taperedBoxZ(.27, -.48, .30, .20, .095, .08, .12),
      box([.215, .18, .13], [0, .005, -.57]),
    ]);
  }
  const receiver = sideProfile([
    [-.6, -.105], [.08, -.11], [.115, -.025], [.065, .13],
    [-.46, .145], [-.59, .075],
  ], .2, .012);
  const dustCover = transformed(
    new THREE.CapsuleGeometry(.1, .34, 4, 12),
    { position: [0, .105, -.19], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, .58] },
  );
  const trunnion = box([.215, .18, .13], [0, .005, -.57], [0, 0, 0], true);
  return merged('AK47FixedGunmetalGeometry', [
    'stamped-receiver', 'crowned-dust-cover', 'forward-trunnion',
  ], [receiver, dustCover, trunnion]);
}

function fixedWood(presentation: RifleGeometryPresentation): THREE.BufferGeometry {
  // The player's eye sits immediately behind the stock in ADS. A first-person
  // shoulder offset keeps this near-camera mass in the lower-right periphery,
  // preserving the iron-sight corridor while retaining its hip-fire silhouette.
  const stock = transformed(sideProfile([
    [.045, .105], [.54, .17], [.755, .085], [.755, -.145],
    [.56, -.185], [.08, -.09],
  ], .14, .014), { position: [.28, -.12, 0] });
  const stockComb = box([.12, .07, .32], [.28, .025, .31], [0, 0, 0], true);
  const lowerHandguard = taperedBoxZ(-.55, -1.18, .255, .215, .215, .18, -.005);
  const upperHandguard = taperedBoxZ(-.58, -1.12, .225, .195, .115, .09, .125);
  const grip = box([.15, .42, .2], [0, -.25, .065], [-.22, 0, 0], true);
  if (presentation === 'legacy') {
    stock.dispose();
    stockComb.dispose();
    return merged('AK47LegacyFixedWoodGeometry', [
      'tapered-handguard', 'upper-handguard', 'angled-pistol-grip',
    ], [lowerHandguard, upperHandguard, grip]);
  }
  return merged('AK47FixedWoodGeometry', [
    'wooden-fixed-stock', 'tapered-handguard', 'upper-handguard', 'angled-pistol-grip',
  ], [stock, stockComb, lowerHandguard, upperHandguard, grip]);
}

function muzzleCollar(): THREE.BufferGeometry[] {
  return [cylinderZ(.044, .1, [0, .045, -1.85], 12)];
}

/** Small slanted, tapering rear forms visible in both sharp Woodland AK frames. */
function legacyRearNotchEar(x: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(.028, .085, .05);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for(let index=0;index<positions.count;index++) {
    if(positions.getY(index)>0) {
      positions.setX(index,positions.getX(index)*(.016/.028));
      positions.setZ(index,positions.getZ(index)*(.018/.05)-.018);
    }
  }
  geometry.computeVertexNormals();
  return transformed(geometry,{position:[x,.17,-.08]});
}

function fixedDarkMetal(presentation: RifleGeometryPresentation): THREE.BufferGeometry {
  const geometry: THREE.BufferGeometry[] = [
    cylinderZ(.034, .86, [0, .035, -1.39], 16),
    cylinderZ(.049, .62, [0, .135, -.91], 16),
    cylinderZ(.012, .74, [0, -.045, -1.34], 8),
    cylinderZ(.065, .12, [0, .045, -1.46], 12),
    box([.115, .09, .105], [0, .1, -1.54], [0, 0, 0], true),
    ...(presentation === 'legacy' ? [
      // Sharp Woodland captures show slim upright tips above a crossbar,
      // with the lower legs widening toward the barrel. Dimensions remain
      // an authored silhouette fit; the sight anchor is unchanged.
      box([.012, .06, .025], [-.035, .205, -1.61]),
      box([.012, .06, .025], [.035, .205, -1.61]),
      box([.082, .014, .025], [0, .174, -1.61]),
      box([.014, .11, .025], [-.049, .12, -1.61], [0, 0, -.27]),
      box([.014, .11, .025], [.049, .12, -1.61], [0, 0, .27]),
    ] : [
      box([.026, .13, .075], [-.047, .165, -1.61]),
      box([.026, .13, .075], [.047, .165, -1.61]),
      box([.11, .025, .075], [0, .11, -1.61]),
    ]),
    cylinderY(.008, .085, [0, .16, -1.61], 8),
    // Rear tangent notch remains open around the exact y=.19 ADS line.
    ...(presentation==='legacy' ? [legacyRearNotchEar(-.043),legacyRearNotchEar(.043)] : [
      box([.028, .085, .05], [-.043, .17, -.08]),
      box([.028, .085, .05], [.043, .17, -.08]),
    ]),
    box([.115, .025, .05], [0, .135, -.08]),
  ];
  if (presentation === 'modern') geometry.push(box([.14, .22, .045], [.28, -.15, .748], [0, 0, 0], true));
  geometry.push(...muzzleCollar());
  return merged('AK47FixedDarkMetalGeometry', [
    'barrel', 'gas-tube', 'cleaning-rod', 'gas-block', 'front-sight-ears',
    'front-sight-post', 'rear-tangent-notch', 'short-muzzle-collar', ...(presentation === 'modern' ? ['stock-butt-pad'] : ['tapered-rear-notch-ears']),
  ], geometry);
}

function fixedEdgeMetal(presentation: RifleGeometryPresentation): THREE.BufferGeometry {
  const geometry: THREE.BufferGeometry[] = [
    box([.014, .09, .29], [.108, .073, -.25], [-.04, 0, 0]),
    box([.016, .032, .34], [.111, .025, -.05], [-.06, 0, 0]),
    box([.205, .026, .16], [0, .145, -.49]),
  ];
  for (const z of [-.69, -.83, -.97]) {
    geometry.push(box([.012, .052, .07], [-.128, .055, z], [0, 0, 0], true));
    geometry.push(box([.012, .052, .07], [.128, .055, z], [0, 0, 0], true));
  }
  for (const z of [-.43, -.23, -.03]) {
    geometry.push(cylinderX(.012, .224, [0, -.055, z], 8));
  }
  // The preserved Woodland frame separates the pale foreground extension
  // from the darker receiver. Reuse the existing finish and unchanged shape.
  if (presentation === 'legacy') geometry.push(taperedBoxZ(.46, .12, .32, .28, .26, .18, -.12));
  return merged('AK47FixedEdgeMetalGeometry', [
    'ejection-port', 'selector-track', 'receiver-top-rib',
    'handguard-vents', 'receiver-rivets', ...(presentation === 'legacy' ? ['gray-rear-extension'] : []),
  ], geometry);
}

function magazineSteel(): THREE.BufferGeometry {
  const body = sideProfile([
    [-.12, .045], [.1, .045], [.145, -.1], [.255, -.28],
    [.32, -.43], [.19, -.505], [.075, -.47], [-.035, -.25],
  ], .17, .01);
  return merged('AK47MagazineSteelGeometry', ['curved-steel-magazine'], [body]);
}

function magazineRibs(): THREE.BufferGeometry {
  const geometry: THREE.BufferGeometry[] = [];
  const levels = [-.055, -.145, -.235, -.325, -.415] as const;
  for (let index = 0; index < levels.length; index++) {
    const y = levels[index];
    const z = -.005 + index * .061;
    geometry.push(box([.181, .017, .17], [0, y, z], [-.1 - index * .025, 0, 0], true));
  }
  geometry.push(box([.185, .03, .2], [0, -.49, .19], [-.18, 0, 0], true));
  return merged('AK47MagazineDarkMetalGeometry', ['magazine-ribs', 'magazine-floorplate'], geometry);
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

/**
 * Creates an independently owned, material-free AK-47 hero geometry set.
 * The fixed resource is body-local and the magazine resource is magazine-pivot
 * local. Existing bolt, trigger and safety primitives remain independently
 * animated at the unchanged pivots in `RIFLE_VIEW_MODEL_LAYOUT`.
 */
export function createRifleViewModelGeometry(presentation: RifleGeometryPresentation = 'modern'): RifleViewModelGeometrySet {
  const fixed = grouped('AK47HeroFixedGroupedGeometry', [
    { slot: 'gunmetal', geometry: fixedGunmetal(presentation) },
    { slot: 'darkMetal', geometry: fixedDarkMetal(presentation) },
    { slot: 'edgeMetal', geometry: fixedEdgeMetal(presentation) },
    { slot: 'wood', geometry: fixedWood(presentation) },
  ]);
  const magazine = grouped('AK47HeroMagazineGroupedGeometry', [
    { slot: 'gunmetal', geometry: magazineSteel() },
    { slot: 'darkMetal', geometry: magazineRibs() },
  ]);
  const geometries = Object.freeze([fixed.geometry, magazine.geometry]);
  const fixedTriangleCount = triangleCount(fixed.geometry);
  const movableTriangleCount = triangleCount(magazine.geometry);
  const triangleTotal = fixedTriangleCount + movableTriangleCount;
  const stats = Object.freeze<RifleViewModelGeometryStats>({
    geometryCount: geometries.length,
    fixedDrawGroups: fixed.geometry.groups.length,
    movableDrawGroups: magazine.geometry.groups.length,
    triangleCount: triangleTotal,
    fixedTriangleCount,
    movableTriangleCount,
    estimatedIntegratedMeshes: geometries.length + CURRENT_CONTROL_MESHES + CURRENT_HAND_MESHES,
    estimatedIntegratedDraws: fixed.geometry.groups.length + magazine.geometry.groups.length
      + CURRENT_CONTROL_MESHES + CURRENT_HAND_MESHES,
    estimatedIntegratedTriangles: triangleTotal + CURRENT_CONTROL_TRIANGLES + CURRENT_HAND_TRIANGLES,
  });

  let disposed = false;
  return {
    fixed,
    magazine,
    geometries,
    stats,
    get isDisposed(): boolean { return disposed; },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
    },
  };
}
