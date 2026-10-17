import * as THREE from 'three';
import {
  BUILDING_FACADE_SPECS,
  createBuildingFacadeBlueprint,
  type BuildingFacadeBlueprint,
  type BuildingFacadeId,
  type BuildingFacadeSpec,
  type BuildingFacadeVisualPart,
} from './buildingFacadeBlueprint';

export type BuildingFacadePresentationMaterialSlot =
  | 'concrete'
  | 'redSteel'
  | 'corrugatedSteel'
  | 'dark'
  | 'glass'
  | 'accent';

export interface BuildingFacadePresentationMaterials {
  /** Caller-owned templates are cloned before vertex colours are enabled. */
  readonly concrete: THREE.Material;
  readonly redSteel: THREE.Material;
  readonly corrugatedSteel: THREE.Material;
  readonly dark: THREE.Material;
  readonly glass: THREE.Material;
  readonly accent: THREE.Material;
}

export interface BuildingFacadePresentationOptions {
  /** This merged presentation is intentionally the enhanced-only layer. */
  readonly quality?: 'high';
  readonly seed?: number | string;
  readonly name?: string;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface BuildingFacadePresentationBatches {
  readonly concrete: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly redSteel: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly corrugatedSteel: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly dark: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly glass: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly accent: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
}

export interface BuildingFacadePresentationStats {
  readonly quality: 'high';
  readonly buildings: 4;
  readonly entrances: 7;
  readonly authoredParts: 529;
  readonly panelModules: 170;
  readonly corrugatedRuns: 8;
  readonly corrugatedSegments: 628;
  readonly windows: 30;
  readonly windowParts: 240;
  readonly serviceParts: 87;
  readonly weatheringPatches: 24;
  readonly panelTriangles: 1700;
  readonly corrugatedTriangles: 1256;
  readonly windowTriangles: 2880;
  readonly serviceTriangles: 1044;
  readonly weatheringTriangles: 48;
  readonly submittedTriangles: 6928;
  readonly drawCalls: 6;
  readonly geometries: 6;
  readonly ownedGeometries: 6;
  readonly injectedMaterials: 6;
  readonly ownedMaterials: 6;
  readonly ownedTextures: 0;
  readonly colliders: 0;
  readonly perFrameUpdates: 0;
  readonly buildingParts: Readonly<Record<BuildingFacadeId, number>>;
  readonly buildingTriangles: Readonly<Record<BuildingFacadeId, number>>;
  readonly windowCounts: Readonly<Record<BuildingFacadeId, number>>;
  readonly panelCounts: Readonly<Record<BuildingFacadeId, number>>;
  readonly materialTriangles: Readonly<Record<BuildingFacadePresentationMaterialSlot, number>>;
}

export interface BuildingFacadePresentation {
  readonly root: THREE.Group;
  readonly batches: Readonly<BuildingFacadePresentationBatches>;
  /** The existing 93-part service-detail source consumed by the merger. */
  readonly serviceBlueprint: BuildingFacadeBlueprint;
  readonly stats: Readonly<BuildingFacadePresentationStats>;
  /** Hides or restores the complete collision-free enhanced façade layer. */
  setDetailsVisible(visible: boolean): void;
  /** Idempotently detaches and releases six geometries and six cloned materials. */
  dispose(): void;
}

type ExteriorFace = 'north' | 'south' | 'west' | 'east';
type Vector3Tuple = readonly [number, number, number];

interface MutableGeometryData {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

interface ShellRectangle {
  readonly building: BuildingFacadeSpec;
  readonly face: ExteriorFace;
  readonly centerU: number;
  readonly bottom: number;
  readonly span: number;
  readonly height: number;
}

interface WindowPlacement {
  readonly building: BuildingFacadeSpec;
  readonly face: 'north' | 'west' | 'east';
  readonly u: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly glassWidth: number;
  readonly glassHeight: number;
}

const MATERIAL_SLOTS: readonly BuildingFacadePresentationMaterialSlot[] = Object.freeze([
  'concrete',
  'redSteel',
  'corrugatedSteel',
  'dark',
  'glass',
  'accent',
]);
const WALL_HALF_DEPTH = .275;
const PANEL_MAX_WIDTH = 3;
const PANEL_MAX_HEIGHT = 2;
const PANEL_GAP = .055;
const PANEL_BACK_OUTSET = .008;
const PANEL_FRONT_OUTSET = .05;
const CORRUGATION_STEP = .08;
const CORRUGATION_PERIOD = .32;
const CORRUGATION_BASE_OUTSET = .055;
const CORRUGATION_AMPLITUDE = .03;
const BOX_INDICES = Object.freeze([0, 1, 2, 0, 2, 3]);
const METRES_PER_TILE: Readonly<Record<BuildingFacadePresentationMaterialSlot, readonly [number, number]>> = Object.freeze({
  concrete: Object.freeze([3, 2] as const),
  redSteel: Object.freeze([2.4, 2] as const),
  corrugatedSteel: Object.freeze([2, 2] as const),
  dark: Object.freeze([1.5, 1.5] as const),
  glass: Object.freeze([1.25, 1.25] as const),
  accent: Object.freeze([2, 2] as const),
});

/** Signed distance from the authoritative wall exterior along its outward normal. */
export const BUILDING_FACADE_WINDOW_DEPTHS = Object.freeze({
  glassFront: .102,
  mullionFront: .1475,
  frameFront: .1575,
  sillFront: .24,
});

const EXPECTED_INDEX_COUNTS: Readonly<Record<BuildingFacadePresentationMaterialSlot, number>> = Object.freeze({
  concrete: 3552,
  redSteel: 2196,
  corrugatedSteel: 3804,
  dark: 9216,
  glass: 1224,
  accent: 792,
});

function hashText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ (hash >>> 16)) >>> 0;
}

function validateSeed(seed: number | string): string {
  if (typeof seed === 'number') {
    if (!Number.isSafeInteger(seed)) throw new RangeError('building façade seed must be a safe integer or non-empty string');
  } else if (typeof seed !== 'string' || seed.length === 0) {
    throw new RangeError('building façade seed must be a safe integer or non-empty string');
  }
  return String(seed);
}

function validateMaterials(materials: BuildingFacadePresentationMaterials): void {
  if (!materials || typeof materials !== 'object') throw new TypeError('building façade materials must be provided');
  for (const slot of MATERIAL_SLOTS) {
    if (!(materials[slot] instanceof THREE.Material)) {
      throw new TypeError(`building façade ${slot} material must be a THREE.Material`);
    }
  }
}

function enableVertexColors(material: THREE.Material): void {
  if (!('vertexColors' in material)) return;
  const configurable = material as THREE.Material & { vertexColors: boolean };
  if (!configurable.vertexColors) {
    configurable.vertexColors = true;
    material.needsUpdate = true;
  }
}

function normalForFace(face: ExteriorFace): Vector3Tuple {
  switch (face) {
    case 'north': return [0, 0, -1];
    case 'south': return [0, 0, 1];
    case 'west': return [-1, 0, 0];
    case 'east': return [1, 0, 0];
  }
}

function tangentForFace(face: ExteriorFace): Vector3Tuple {
  return face === 'north' || face === 'south' ? [1, 0, 0] : [0, 0, 1];
}

function surfacePoint(
  building: BuildingFacadeSpec,
  face: ExteriorFace,
  u: number,
  y: number,
  outset: number,
): Vector3Tuple {
  const [nx, , nz] = normalForFace(face);
  if (face === 'north' || face === 'south') {
    const facadeZ = building.z + (face === 'north' ? -building.depth / 2 - WALL_HALF_DEPTH : building.depth / 2 + WALL_HALF_DEPTH);
    return [building.x + u, y, facadeZ + nz * outset];
  }
  const facadeX = building.x + (face === 'west' ? -building.width / 2 - WALL_HALF_DEPTH : building.width / 2 + WALL_HALF_DEPTH);
  return [facadeX + nx * outset, y, building.z + u];
}

function add3(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract3(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize3(value: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 0 ? [value[0] / length, value[1] / length, value[2] / length] : [0, 1, 0];
}

function seededAppearance(seed: string, key: string, base = .9, range = .1): {
  readonly color: Vector3Tuple;
  readonly phaseU: number;
  readonly phaseV: number;
} {
  const hash = hashText(`${seed}:${key}`);
  const value = base + (hash & 0xffff) / 0xffff * range;
  return {
    color: [value * .965, value * .985, value],
    phaseU: ((hash >>> 8) & 0xfff) / 0xfff,
    phaseV: ((hash >>> 20) & 0xfff) / 0xfff,
  };
}

function appendQuad(
  data: MutableGeometryData,
  corners: readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple, Vector3Tuple],
  normals: Vector3Tuple | readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple, Vector3Tuple],
  uvs: readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]],
  color: Vector3Tuple,
): void {
  const baseVertex = data.positions.length / 3;
  const perVertexNormals: readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple, Vector3Tuple] = typeof normals[0] === 'number'
    ? [normals as Vector3Tuple, normals as Vector3Tuple, normals as Vector3Tuple, normals as Vector3Tuple]
    : normals as readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple, Vector3Tuple];
  for (let index = 0; index < 4; index++) {
    data.positions.push(...corners[index]);
    data.normals.push(...perVertexNormals[index]);
    data.uvs.push(...uvs[index]);
    data.colors.push(...color);
  }
  const geometricNormal = cross3(subtract3(corners[1], corners[0]), subtract3(corners[2], corners[0]));
  const desiredNormal = normalize3(add3(add3(perVertexNormals[0], perVertexNormals[1]), add3(perVertexNormals[2], perVertexNormals[3])));
  const order = dot3(geometricNormal, desiredNormal) >= 0
    ? BOX_INDICES
    : [0, 2, 1, 0, 3, 2];
  for (const localIndex of order) data.indices.push(baseVertex + localIndex);
}

function quadUvs(width: number, height: number, phaseU: number, phaseV: number, metres: readonly [number, number]):
readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]] {
  return [
    [phaseU, phaseV],
    [phaseU + width / metres[0], phaseV],
    [phaseU + width / metres[0], phaseV + height / metres[1]],
    [phaseU, phaseV + height / metres[1]],
  ];
}

function appendBevelPanel(
  data: MutableGeometryData,
  rectangle: ShellRectangle,
  centerU: number,
  centerY: number,
  width: number,
  height: number,
  slot: 'concrete' | 'redSteel',
  seed: string,
  key: string,
): void {
  const appearance = seededAppearance(seed, key, .91, .08);
  const metres = METRES_PER_TILE[slot];
  const u0 = centerU - width / 2;
  const u1 = centerU + width / 2;
  const y0 = centerY - height / 2;
  const y1 = centerY + height / 2;
  const back = [
    surfacePoint(rectangle.building, rectangle.face, u0, y0, PANEL_BACK_OUTSET),
    surfacePoint(rectangle.building, rectangle.face, u1, y0, PANEL_BACK_OUTSET),
    surfacePoint(rectangle.building, rectangle.face, u1, y1, PANEL_BACK_OUTSET),
    surfacePoint(rectangle.building, rectangle.face, u0, y1, PANEL_BACK_OUTSET),
  ] as const;
  const front = [
    surfacePoint(rectangle.building, rectangle.face, u0, y0, PANEL_FRONT_OUTSET),
    surfacePoint(rectangle.building, rectangle.face, u1, y0, PANEL_FRONT_OUTSET),
    surfacePoint(rectangle.building, rectangle.face, u1, y1, PANEL_FRONT_OUTSET),
    surfacePoint(rectangle.building, rectangle.face, u0, y1, PANEL_FRONT_OUTSET),
  ] as const;
  appendQuad(data, front, normalForFace(rectangle.face), quadUvs(width, height, appearance.phaseU, appearance.phaseV, metres), appearance.color);
  const edges = [
    [back[0], back[1], front[1], front[0]],
    [back[1], back[2], front[2], front[1]],
    [back[2], back[3], front[3], front[2]],
    [back[3], back[0], front[0], front[3]],
  ] as const;
  const tangent = tangentForFace(rectangle.face);
  const edgeNormals: readonly Vector3Tuple[] = [
    [0, -1, 0],
    tangent,
    [0, 1, 0],
    [-tangent[0], -tangent[1], -tangent[2]],
  ];
  for (let edge = 0; edge < edges.length; edge++) {
    const corners = edges[edge];
    const edgeLength = edge % 2 === 0 ? width : height;
    appendQuad(
      data,
      corners,
      edgeNormals[edge],
      quadUvs(edgeLength, PANEL_FRONT_OUTSET - PANEL_BACK_OUTSET, appearance.phaseU, appearance.phaseV, metres),
      appearance.color,
    );
  }
}

function shellRectangles(building: BuildingFacadeSpec): ShellRectangle[] {
  const rectangles: ShellRectangle[] = [
    { building, face: 'north', centerU: 0, bottom: 0, span: building.width, height: building.height },
    { building, face: 'west', centerU: 0, bottom: 0, span: building.depth, height: building.height },
  ];
  const southSpan = (building.width - building.southGap) / 2;
  for (const side of [-1, 1] as const) {
    rectangles.push({
      building,
      face: 'south',
      centerU: side * (building.southGap / 2 + southSpan / 2),
      bottom: 0,
      span: southSpan,
      height: building.height,
    });
  }
  rectangles.push({
    building,
    face: 'south',
    centerU: 0,
    bottom: building.openingHeight,
    span: building.southGap,
    height: building.height - building.openingHeight,
  });
  if (building.eastGap > 0) {
    const eastSpan = (building.depth - building.eastGap) / 2;
    for (const side of [-1, 1] as const) {
      rectangles.push({
        building,
        face: 'east',
        centerU: side * (building.eastGap / 2 + eastSpan / 2),
        bottom: 0,
        span: eastSpan,
        height: building.height,
      });
    }
    rectangles.push({
      building,
      face: 'east',
      centerU: 0,
      bottom: building.openingHeight,
      span: building.eastGap,
      height: building.height - building.openingHeight,
    });
  }
  return rectangles;
}

function appendPanels(
  data: Record<BuildingFacadePresentationMaterialSlot, MutableGeometryData>,
  building: BuildingFacadeSpec,
  seed: string,
): number {
  const slot = building.id === 'barracks' ? 'redSteel' : 'concrete';
  let count = 0;
  for (const [rectangleIndex, rectangle] of shellRectangles(building).entries()) {
    const columns = Math.ceil(rectangle.span / PANEL_MAX_WIDTH);
    const rows = Math.ceil(rectangle.height / PANEL_MAX_HEIGHT);
    const cellWidth = rectangle.span / columns;
    const cellHeight = rectangle.height / rows;
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      appendBevelPanel(
        data[slot],
        rectangle,
        rectangle.centerU - rectangle.span / 2 + (column + .5) * cellWidth,
        rectangle.bottom + (row + .5) * cellHeight,
        cellWidth - PANEL_GAP,
        cellHeight - PANEL_GAP,
        slot,
        seed,
        `${building.id}:panel:${rectangleIndex}:${row}:${column}`,
      );
      count++;
    }
  }
  return count;
}

function appendCorrugationRun(
  data: MutableGeometryData,
  rectangle: ShellRectangle,
  runIndex: number,
  seed: string,
): number {
  const segments = Math.ceil(rectangle.span / CORRUGATION_STEP);
  const appearance = seededAppearance(seed, `${rectangle.building.id}:corrugation:${runIndex}`, .92, .075);
  const tangent = tangentForFace(rectangle.face);
  const outward = normalForFace(rectangle.face);
  const phase = hashText(`${rectangle.building.id}:${rectangle.face}:${runIndex}`) / 0xffffffff * Math.PI * 2;
  const y0 = rectangle.bottom;
  const y1 = rectangle.bottom + rectangle.height;
  const uStart = rectangle.centerU - rectangle.span / 2;
  const surface = (u: number): { point0: Vector3Tuple; point1: Vector3Tuple; normal: Vector3Tuple } => {
    const localDistance = u - uStart;
    const angle = localDistance / CORRUGATION_PERIOD * Math.PI * 2 + phase;
    const outset = CORRUGATION_BASE_OUTSET + Math.sin(angle) * CORRUGATION_AMPLITUDE;
    const derivative = Math.cos(angle) * CORRUGATION_AMPLITUDE * Math.PI * 2 / CORRUGATION_PERIOD;
    return {
      point0: surfacePoint(rectangle.building, rectangle.face, u, y0, outset),
      point1: surfacePoint(rectangle.building, rectangle.face, u, y1, outset),
      normal: normalize3([
        outward[0] - tangent[0] * derivative,
        0,
        outward[2] - tangent[2] * derivative,
      ]),
    };
  };
  for (let segment = 0; segment < segments; segment++) {
    const u0 = uStart + rectangle.span * segment / segments;
    const u1 = uStart + rectangle.span * (segment + 1) / segments;
    const left = surface(u0);
    const right = surface(u1);
    const uv0 = appearance.phaseU + rectangle.span * segment / segments / METRES_PER_TILE.corrugatedSteel[0];
    const uv1 = appearance.phaseU + rectangle.span * (segment + 1) / segments / METRES_PER_TILE.corrugatedSteel[0];
    const v0 = appearance.phaseV;
    const v1 = v0 + rectangle.height / METRES_PER_TILE.corrugatedSteel[1];
    appendQuad(
      data,
      [left.point0, right.point0, right.point1, left.point1],
      [left.normal, right.normal, right.normal, left.normal],
      [[uv0, v0], [uv1, v0], [uv1, v1], [uv0, v1]],
      appearance.color,
    );
  }
  return segments;
}

function appendWarehouseCorrugation(
  data: MutableGeometryData,
  building: BuildingFacadeSpec,
  seed: string,
): { runs: number; segments: number } {
  const rectangles = shellRectangles(building);
  let segments = 0;
  rectangles.forEach((rectangle, index) => { segments += appendCorrugationRun(data, rectangle, index, seed); });
  return { runs: rectangles.length, segments };
}

interface BoxFace {
  readonly normal: Vector3Tuple;
  readonly corners: readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple, Vector3Tuple];
  readonly width: number;
  readonly height: number;
}

function boxFaces(size: Vector3Tuple, position: Vector3Tuple): readonly BoxFace[] {
  const [sx, sy, sz] = size;
  const [cx, cy, cz] = position;
  const x0 = cx - sx / 2; const x1 = cx + sx / 2;
  const y0 = cy - sy / 2; const y1 = cy + sy / 2;
  const z0 = cz - sz / 2; const z1 = cz + sz / 2;
  return [
    { normal: [1, 0, 0], corners: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], width: sz, height: sy },
    { normal: [-1, 0, 0], corners: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], width: sz, height: sy },
    { normal: [0, 1, 0], corners: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], width: sx, height: sz },
    { normal: [0, -1, 0], corners: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], width: sx, height: sz },
    { normal: [0, 0, 1], corners: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], width: sx, height: sy },
    { normal: [0, 0, -1], corners: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], width: sx, height: sy },
  ];
}

function appendBox(
  data: MutableGeometryData,
  size: Vector3Tuple,
  position: Vector3Tuple,
  slot: BuildingFacadePresentationMaterialSlot,
  seed: string,
  key: string,
  appearanceOverride?: { readonly base: number; readonly range: number },
): void {
  const appearance = seededAppearance(seed, key, appearanceOverride?.base ?? .9, appearanceOverride?.range ?? .1);
  for (const [faceIndex, face] of boxFaces(size, position).entries()) {
    appendQuad(
      data,
      face.corners,
      face.normal,
      quadUvs(face.width, face.height, appearance.phaseU + faceIndex * .071, appearance.phaseV, METRES_PER_TILE[slot]),
      appearance.color,
    );
  }
}

function enumerateWindows(): WindowPlacement[] {
  const windows: WindowPlacement[] = [];
  for (const building of BUILDING_FACADE_SPECS) {
    for (let offset = -building.width / 2 + 2.5; offset < building.width / 2 - 1; offset += 4) {
      windows.push({
        building,
        face: 'north',
        u: offset,
        y: building.height * .58,
        width: 1.58,
        height: 1.32,
        glassWidth: 1.35,
        glassHeight: 1.1,
      });
    }
    for (let offset = -building.depth / 2 + 2; offset < building.depth / 2 - 1.5; offset += 3.8) {
      for (const side of [-1, 1] as const) {
        if (side === 1 && building.eastGap === 0) continue;
        if (side === 1 && building.eastGap > 0 && Math.abs(offset) < building.eastGap / 2 + .7) continue;
        windows.push({
          building,
          face: side < 0 ? 'west' : 'east',
          u: offset,
          y: building.height * .58,
          width: 1.26,
          height: .96,
          glassWidth: 1.08,
          glassHeight: .78,
        });
      }
    }
  }
  return windows;
}

function boxAtSurface(
  window: WindowPlacement,
  uOffset: number,
  yOffset: number,
  width: number,
  height: number,
  depth: number,
  outset: number,
): { readonly size: Vector3Tuple; readonly position: Vector3Tuple } {
  const center = surfacePoint(window.building, window.face, window.u + uOffset, window.y + yOffset, outset);
  return {
    size: window.face === 'north' ? [width, height, depth] : [depth, height, width],
    position: center,
  };
}

function appendWindows(
  data: Record<BuildingFacadePresentationMaterialSlot, MutableGeometryData>,
  seed: string,
): { count: number; parts: number; counts: Record<BuildingFacadeId, number> } {
  const counts: Record<BuildingFacadeId, number> = { 'block-01': 0, barracks: 0, warehouse: 0, infirmary: 0 };
  const windows = enumerateWindows();
  for (const [windowIndex, window] of windows.entries()) {
    counts[window.building.id]++;
    const key = `${window.building.id}:window:${windowIndex}`;
    const frameWidth = .1;
    const horizontalWidth = window.width - frameWidth * 2;
    const glass = boxAtSurface(window, 0, 0, window.glassWidth, window.glassHeight, .018, .093);
    appendBox(data.glass, glass.size, glass.position, 'glass', seed, `${key}:glass`, { base: .94, range: .055 });
    for (const side of [-1, 1] as const) {
      const vertical = boxAtSurface(window, side * (window.width - frameWidth) / 2, 0, frameWidth, window.height, .075, .12);
      appendBox(data.dark, vertical.size, vertical.position, 'dark', seed, `${key}:frame-v:${side}`);
      const horizontal = boxAtSurface(window, 0, side * (window.height - frameWidth) / 2, horizontalWidth, frameWidth, .075, .12);
      appendBox(data.dark, horizontal.size, horizontal.position, 'dark', seed, `${key}:frame-h:${side}`);
    }
    const verticalMullion = boxAtSurface(window, 0, 0, .055, window.glassHeight, .045, .125);
    appendBox(data.dark, verticalMullion.size, verticalMullion.position, 'dark', seed, `${key}:mullion-v`);
    const horizontalMullion = boxAtSurface(window, 0, 0, window.glassWidth, .055, .045, .125);
    appendBox(data.dark, horizontalMullion.size, horizontalMullion.position, 'dark', seed, `${key}:mullion-h`);
    const sill = boxAtSurface(window, 0, -window.height / 2 - .055, window.width + .18, .09, .19, .145);
    appendBox(data.dark, sill.size, sill.position, 'dark', seed, `${key}:sill`);
  }
  return { count: windows.length, parts: windows.length * 8, counts };
}

function presentationSlotForService(part: BuildingFacadeVisualPart): BuildingFacadePresentationMaterialSlot {
  switch (part.materialSlot) {
    case 'concrete': return 'concrete';
    case 'dark': return 'dark';
    case 'glass': return 'glass';
    case 'accent': return 'accent';
  }
}

function appendServiceParts(
  data: Record<BuildingFacadePresentationMaterialSlot, MutableGeometryData>,
  blueprint: BuildingFacadeBlueprint,
  seed: string,
): number {
  let count = 0;
  for (const part of blueprint.parts) {
    // The warehouse detail blueprint owns deeper shutter tracks and lintels at
    // both portals. Preserve the legacy integration filter so these cosmetic
    // service returns never interpenetrate their replacements.
    if (part.buildingId === 'warehouse' && (part.role === 'entrance-jamb' || part.role === 'entrance-lintel')) continue;
    const slot = presentationSlotForService(part);
    appendBox(data[slot], part.size, part.position, slot, seed, `service:${part.name}`);
    count++;
  }
  return count;
}

function appendWeatheringPatches(
  data: Record<BuildingFacadePresentationMaterialSlot, MutableGeometryData>,
  seed: string,
): number {
  let patchCount = 0;
  for (const building of BUILDING_FACADE_SPECS) {
    const anchors: readonly [ExteriorFace, number, number, number, number][] = [
      ['south', -building.width * .37, .56, .78, .44],
      ['south', building.width * .31, .92, .54, .72],
      ['south', -building.width * .22, 1.46, .42, .55],
      ['north', -building.width * .28, .48, .68, .38],
      ['north', building.width * .24, 1.18, .46, .64],
      ['west', building.depth * .26, .73, .56, .5],
    ];
    const slot: BuildingFacadePresentationMaterialSlot = building.id === 'warehouse'
      ? 'corrugatedSteel'
      : building.id === 'barracks' ? 'redSteel' : 'concrete';
    for (const [localIndex, [face, centerU, centerY, width, height]] of anchors.entries()) {
      const key = `${building.id}:weather:${localIndex}`;
      const shapeHash = hashText(key);
      const skewA = ((shapeHash & 0xff) / 255 - .5) * .16;
      const skewB = (((shapeHash >>> 8) & 0xff) / 255 - .5) * .14;
      const outset = building.id === 'warehouse' ? .091 : .057;
      const corners = [
        surfacePoint(building, face, centerU - width / 2 + skewA, centerY - height / 2, outset),
        surfacePoint(building, face, centerU + width / 2, centerY - height / 2 + skewB, outset),
        surfacePoint(building, face, centerU + width / 2 - skewA, centerY + height / 2, outset),
        surfacePoint(building, face, centerU - width / 2, centerY + height / 2 - skewB, outset),
      ] as const;
      // Stains inherit the host cladding map and tint rather than using the
      // nearly-black trim material, so they read as surface wear instead of
      // floating black cards.
      const appearance = seededAppearance(seed, key, .6, .14);
      appendQuad(
        data[slot],
        corners,
        normalForFace(face),
        quadUvs(width, height, appearance.phaseU, appearance.phaseV, METRES_PER_TILE[slot]),
        appearance.color,
      );
      patchCount++;
    }
  }
  return patchCount;
}

function staticAttribute(array: Float32Array, itemSize: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(array, itemSize).setUsage(THREE.StaticDrawUsage);
}

function createGeometry(slot: BuildingFacadePresentationMaterialSlot, data: MutableGeometryData): THREE.BufferGeometry {
  if (data.indices.length !== EXPECTED_INDEX_COUNTS[slot]) {
    throw new Error(`building façade ${slot} topology drifted: expected ${EXPECTED_INDEX_COUNTS[slot]} indices, received ${data.indices.length}`);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = `BuildingFacade:${slot}`;
  geometry.setAttribute('position', staticAttribute(new Float32Array(data.positions), 3));
  geometry.setAttribute('normal', staticAttribute(new Float32Array(data.normals), 3));
  geometry.setAttribute('uv', staticAttribute(new Float32Array(data.uvs), 2));
  geometry.setAttribute('color', staticAttribute(new Float32Array(data.colors), 3));
  const IndexArray = data.positions.length / 3 > 65_535 ? Uint32Array : Uint16Array;
  geometry.setIndex(new THREE.BufferAttribute(new IndexArray(data.indices), 1).setUsage(THREE.StaticDrawUsage));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function emptyData(): MutableGeometryData {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

function compensateSharedTextureRepeat(data: MutableGeometryData, material: THREE.Material): void {
  const textured = material as THREE.Material & {
    map?: THREE.Texture | null;
    bumpMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
  };
  const texture = [textured.map, textured.bumpMap, textured.roughnessMap]
    .find((candidate): candidate is THREE.Texture => candidate instanceof THREE.Texture);
  const repeatX = texture && Number.isFinite(texture.repeat.x) && texture.repeat.x > 0 ? texture.repeat.x : 1;
  const repeatY = texture && Number.isFinite(texture.repeat.y) && texture.repeat.y > 0 ? texture.repeat.y : 1;
  if (repeatX === 1 && repeatY === 1) return;
  for (let index = 0; index < data.uvs.length; index += 2) {
    data.uvs[index] /= repeatX;
    data.uvs[index + 1] /= repeatY;
  }
}

function configureMesh(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>,
  slot: BuildingFacadePresentationMaterialSlot,
  castShadow: boolean,
  receiveShadow: boolean,
): void {
  mesh.name = `BuildingFacade:${slot}`;
  mesh.castShadow = castShadow && (slot === 'concrete' || slot === 'redSteel' || slot === 'corrugatedSteel');
  mesh.receiveShadow = receiveShadow && slot !== 'glass';
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.userData.presentationOnly = true;
  mesh.userData.authoritativeColliders = 'none';
  mesh.userData.materialSlot = slot;
}

/**
 * Creates the collision-free enhanced façade layer for all four arena shells.
 * Geometry is merged globally by material so the entire authored treatment is
 * six draw calls even when several buildings share a view.
 */
export function createBuildingFacadePresentation(
  parent: THREE.Object3D,
  materials: BuildingFacadePresentationMaterials,
  options: BuildingFacadePresentationOptions = {},
): BuildingFacadePresentation {
  if (!(parent instanceof THREE.Object3D)) throw new TypeError('building façade parent must be a THREE.Object3D');
  if (options.quality !== undefined && options.quality !== 'high') {
    throw new RangeError('merged building façade presentation supports high quality only');
  }
  validateMaterials(materials);
  const seed = validateSeed(options.seed ?? 'barrack-01-building-facades');
  const serviceBlueprint = createBuildingFacadeBlueprint();
  const data = Object.fromEntries(MATERIAL_SLOTS.map((slot) => [slot, emptyData()])) as unknown as Record<BuildingFacadePresentationMaterialSlot, MutableGeometryData>;

  const panelCounts: Record<BuildingFacadeId, number> = { 'block-01': 0, barracks: 0, warehouse: 0, infirmary: 0 };
  for (const building of BUILDING_FACADE_SPECS) {
    if (building.id !== 'warehouse') panelCounts[building.id] = appendPanels(data, building, seed);
  }
  const warehouse = BUILDING_FACADE_SPECS.find((building) => building.id === 'warehouse');
  if (!warehouse) throw new Error('warehouse façade specification is missing');
  const corrugation = appendWarehouseCorrugation(data.corrugatedSteel, warehouse, seed);
  const windows = appendWindows(data, seed);
  const serviceParts = appendServiceParts(data, serviceBlueprint, seed);
  const weatheringPatches = appendWeatheringPatches(data, seed);

  if (Object.values(panelCounts).reduce((total, count) => total + count, 0) !== 170
    || corrugation.runs !== 8 || corrugation.segments !== 628
    || windows.count !== 30 || windows.parts !== 240
    || serviceBlueprint.stats.parts !== 93 || serviceParts !== 87 || weatheringPatches !== 24) {
    throw new Error('building façade authored topology drifted from its enhanced presentation contract');
  }

  for (const slot of MATERIAL_SLOTS) compensateSharedTextureRepeat(data[slot], materials[slot]);
  const geometries = Object.fromEntries(MATERIAL_SLOTS.map((slot) => [slot, createGeometry(slot, data[slot])])) as unknown as Record<BuildingFacadePresentationMaterialSlot, THREE.BufferGeometry>;
  const presentationMaterials = Object.fromEntries(MATERIAL_SLOTS.map((slot) => {
    const cloned = materials[slot].clone();
    cloned.name = `${materials[slot].name || 'BuildingFacade'}:${slot}:vertex-colour`;
    enableVertexColors(cloned);
    return [slot, cloned];
  })) as unknown as Record<BuildingFacadePresentationMaterialSlot, THREE.Material>;
  const batches = Object.fromEntries(MATERIAL_SLOTS.map((slot) => [
    slot,
    new THREE.Mesh(geometries[slot], presentationMaterials[slot]),
  ])) as unknown as BuildingFacadePresentationBatches;
  const castShadow = options.castShadow ?? true;
  const receiveShadow = options.receiveShadow ?? true;
  for (const slot of MATERIAL_SLOTS) configureMesh(batches[slot], slot, castShadow, receiveShadow);

  const root = new THREE.Group();
  root.name = options.name ?? 'BuildingFacadePresentation';
  root.matrixAutoUpdate = false;
  root.updateMatrix();
  root.userData.presentationOnly = true;
  root.userData.authoritativeColliders = 'none';
  root.add(...MATERIAL_SLOTS.map((slot) => batches[slot]));
  parent.add(root);

  const buildingParts = Object.freeze({ 'block-01': 161, barracks: 175, warehouse: 81, infirmary: 112 });
  const buildingTriangles = Object.freeze({ 'block-01': 1742, barracks: 1896, warehouse: 2072, infirmary: 1218 });
  const materialTriangles = Object.freeze({ concrete: 1184, redSteel: 732, corrugatedSteel: 1268, dark: 3072, glass: 408, accent: 264 });
  const stats = Object.freeze<BuildingFacadePresentationStats>({
    quality: 'high',
    buildings: 4,
    entrances: 7,
    authoredParts: 529,
    panelModules: 170,
    corrugatedRuns: 8,
    corrugatedSegments: 628,
    windows: 30,
    windowParts: 240,
    serviceParts: 87,
    weatheringPatches: 24,
    panelTriangles: 1700,
    corrugatedTriangles: 1256,
    windowTriangles: 2880,
    serviceTriangles: 1044,
    weatheringTriangles: 48,
    submittedTriangles: 6928,
    drawCalls: 6,
    geometries: 6,
    ownedGeometries: 6,
    injectedMaterials: 6,
    ownedMaterials: 6,
    ownedTextures: 0,
    colliders: 0,
    perFrameUpdates: 0,
    buildingParts,
    buildingTriangles,
    windowCounts: Object.freeze({ ...windows.counts }),
    panelCounts: Object.freeze({ ...panelCounts }),
    materialTriangles,
  });
  const frozenBatches = Object.freeze(batches);
  let disposed = false;
  return {
    root,
    batches: frozenBatches,
    serviceBlueprint,
    stats,
    setDetailsVisible(visible: boolean): void {
      root.visible = visible;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const slot of MATERIAL_SLOTS) {
        geometries[slot].dispose();
        presentationMaterials[slot].dispose();
      }
    },
  };
}
