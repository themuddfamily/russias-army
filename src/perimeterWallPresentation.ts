import * as THREE from 'three';
import {
  createPerimeterWallBlueprint,
  type PerimeterWallBlueprint,
  type PerimeterWallMaterialSlot,
  type PerimeterWallPartRole,
  type PerimeterWallVisualPart,
} from './perimeterWallBlueprint';

export interface PerimeterWallPresentationMaterials {
  /** Caller-owned templates are cloned so shared material state is never mutated. */
  readonly concrete: THREE.Material;
  readonly dark: THREE.Material;
  readonly snow: THREE.Material;
  readonly accent: THREE.Material;
}

export interface PerimeterWallPresentationOptions {
  /** The merged presentation intentionally supports only the authored high tier. */
  readonly quality?: 'high';
  readonly seed?: number | string;
  readonly name?: string;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface PerimeterWallPresentationBatches {
  readonly concrete: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly dark: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly snow: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  readonly accent: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
}

export interface PerimeterWallPresentationStats {
  readonly quality: 'high';
  readonly authoredParts: 236;
  readonly panelTriangles: 1056;
  readonly submittedTriangles: 2832;
  readonly drawCalls: 4;
  readonly geometries: 4;
  readonly ownedGeometries: 4;
  readonly injectedMaterials: 4;
  readonly ownedMaterials: 4;
  readonly ownedTextures: 0;
  readonly colliders: 0;
  readonly perFrameUpdates: 0;
}

export interface PerimeterWallPresentation {
  readonly root: THREE.Group;
  readonly batches: Readonly<PerimeterWallPresentationBatches>;
  readonly blueprint: PerimeterWallBlueprint;
  readonly stats: Readonly<PerimeterWallPresentationStats>;
  /** Keeps the 88 structural panels and hides all authored trim and repairs. */
  setDetailsVisible(visible: boolean): void;
  /** Idempotently detaches the root and releases four geometries and four material clones. */
  dispose(): void;
}

interface MutableGeometryData {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

interface Face {
  readonly normal: readonly [number, number, number];
  readonly corners: readonly [number, number, number][];
  readonly uvAxes: readonly ['x' | 'y' | 'z', 'x' | 'y' | 'z'];
}

const MATERIAL_SLOTS: readonly PerimeterWallMaterialSlot[] = Object.freeze([
  'concrete',
  'dark',
  'snow',
  'accent',
]);
const BOX_INDICES = Object.freeze([0, 1, 2, 0, 2, 3]);
const PANEL_INDEX_COUNT = 88 * 36;
const CONCRETE_INDEX_COUNT = 144 * 36;
const SLOT_METRES_PER_TILE: Readonly<Record<PerimeterWallMaterialSlot, readonly [number, number]>> = Object.freeze({
  concrete: Object.freeze([3, 2] as const),
  dark: Object.freeze([1.5, 1.5] as const),
  snow: Object.freeze([4, 4] as const),
  accent: Object.freeze([2, 2] as const),
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
    if (!Number.isSafeInteger(seed)) throw new RangeError('perimeter wall seed must be a safe integer or non-empty string');
  } else if (typeof seed !== 'string' || seed.length === 0) {
    throw new RangeError('perimeter wall seed must be a safe integer or non-empty string');
  }
  return String(seed);
}

function validateMaterials(materials: PerimeterWallPresentationMaterials): void {
  if (!materials || typeof materials !== 'object') throw new TypeError('perimeter wall materials must be provided');
  for (const slot of MATERIAL_SLOTS) {
    if (!(materials[slot] instanceof THREE.Material)) {
      throw new TypeError(`perimeter wall ${slot} material must be a THREE.Material`);
    }
  }
}

function enableVertexColors(material: THREE.Material): void {
  if (!('vertexColors' in material)) return;
  const configurable = material as THREE.Material & { vertexColors: boolean };
  if (configurable.vertexColors) return;
  configurable.vertexColors = true;
  material.needsUpdate = true;
}

function partHash(part: PerimeterWallVisualPart, partIndex: number, seed: string): number {
  return hashText(`${seed}:${partIndex}:${part.role}:${part.side ?? 'corner'}:${part.position.join(',')}`);
}

function colourForPart(role: PerimeterWallPartRole, hash: number): readonly [number, number, number] {
  const mix = (hash & 0xffff) / 0xffff;
  if (role === 'panel') {
    const value = .91 + mix * .07;
    return [value * .97, value * .985, value];
  }
  if (role === 'post') {
    const value = .84 + mix * .08;
    return [value * .95, value * .975, value];
  }
  if (role === 'repair-patch') {
    const value = .68 + mix * .1;
    return [value * .96, value * .985, value];
  }
  if (role === 'snow-cap') {
    const value = .94 + mix * .06;
    return [value * .95, value * .975, value];
  }
  if (role === 'coping') {
    const value = .86 + mix * .09;
    return [value * .96, value * .98, value];
  }
  const value = .94 + mix * .05;
  return [value, value * .985, value * .94];
}

function axisValue(corner: readonly [number, number, number], axis: 'x' | 'y' | 'z'): number {
  return corner[axis === 'x' ? 0 : axis === 'y' ? 1 : 2];
}

function facesForPart(part: PerimeterWallVisualPart): readonly Face[] {
  const [sx, sy, sz] = part.size;
  const [cx, cy, cz] = part.position;
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy - sy / 2;
  const y1 = cy + sy / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  return [
    { normal: [1, 0, 0], corners: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], uvAxes: ['z', 'y'] },
    { normal: [-1, 0, 0], corners: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], uvAxes: ['z', 'y'] },
    { normal: [0, 1, 0], corners: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], uvAxes: ['x', 'z'] },
    { normal: [0, -1, 0], corners: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], uvAxes: ['x', 'z'] },
    { normal: [0, 0, 1], corners: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], uvAxes: ['x', 'y'] },
    { normal: [0, 0, -1], corners: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], uvAxes: ['x', 'y'] },
  ];
}

function appendPart(
  data: MutableGeometryData,
  part: PerimeterWallVisualPart,
  partIndex: number,
  seed: string,
): void {
  const hash = partHash(part, partIndex, seed);
  const phaseU = ((hash >>> 8) & 0xfff) / 0xfff;
  const phaseV = ((hash >>> 20) & 0xfff) / 0xfff;
  const [red, green, blue] = colourForPart(part.role, hash);
  const [metresU, metresV] = SLOT_METRES_PER_TILE[part.materialSlot];
  for (const face of facesForPart(part)) {
    const baseVertex = data.positions.length / 3;
    const firstU = axisValue(face.corners[0], face.uvAxes[0]);
    const firstV = axisValue(face.corners[0], face.uvAxes[1]);
    for (const corner of face.corners) {
      data.positions.push(...corner);
      data.normals.push(...face.normal);
      data.uvs.push(
        (axisValue(corner, face.uvAxes[0]) - firstU) / metresU + phaseU,
        (axisValue(corner, face.uvAxes[1]) - firstV) / metresV + phaseV,
      );
      data.colors.push(red, green, blue);
    }
    for (const localIndex of BOX_INDICES) data.indices.push(baseVertex + localIndex);
  }
}

function staticAttribute(array: Float32Array, itemSize: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(array, itemSize).setUsage(THREE.StaticDrawUsage);
}

function createSlotGeometry(
  blueprint: PerimeterWallBlueprint,
  slot: PerimeterWallMaterialSlot,
  seed: string,
): THREE.BufferGeometry {
  const data: MutableGeometryData = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  blueprint.parts.forEach((part, partIndex) => {
    if (part.materialSlot === slot) appendPart(data, part, partIndex, seed);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.name = `PerimeterWall:${slot}`;
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

function configureMesh(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>,
  slot: PerimeterWallMaterialSlot,
  castShadow: boolean,
  receiveShadow: boolean,
): void {
  mesh.name = `PerimeterWall:${slot}`;
  mesh.castShadow = castShadow && slot !== 'snow' && slot !== 'accent';
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.userData.presentationOnly = true;
  mesh.userData.authoritativeColliders = 'PerimeterWallPresentation.blueprint.colliders';
  mesh.userData.materialSlot = slot;
}

/**
 * Creates the high-tier wall as four static, world-space merged meshes. The
 * caller injects material templates. This module owns four geometries and four
 * material clones, preventing vertex-colour state from leaking to shared arena
 * meshes that do not provide a colour attribute.
 */
export function createPerimeterWallPresentation(
  parent: THREE.Object3D,
  materials: PerimeterWallPresentationMaterials,
  options: PerimeterWallPresentationOptions = {},
): PerimeterWallPresentation {
  if (!(parent instanceof THREE.Object3D)) throw new TypeError('perimeter wall parent must be a THREE.Object3D');
  if (options.quality !== undefined && options.quality !== 'high') {
    throw new RangeError('merged perimeter wall presentation supports high quality only');
  }
  validateMaterials(materials);
  const seed = validateSeed(options.seed ?? 'barrack-01-perimeter-wall');
  const blueprint = createPerimeterWallBlueprint('high');
  const geometries = MATERIAL_SLOTS.map((slot) => createSlotGeometry(blueprint, slot, seed));
  const [concreteGeometry, darkGeometry, snowGeometry, accentGeometry] = geometries;
  const presentationMaterials = Object.fromEntries(MATERIAL_SLOTS.map((slot) => {
    const cloned = materials[slot].clone();
    cloned.name = `${materials[slot].name || 'PerimeterWall'}:${slot}:vertex-colour`;
    enableVertexColors(cloned);
    return [slot, cloned];
  })) as unknown as Record<PerimeterWallMaterialSlot, THREE.Material>;

  const batches: PerimeterWallPresentationBatches = {
    concrete: new THREE.Mesh(concreteGeometry, presentationMaterials.concrete),
    dark: new THREE.Mesh(darkGeometry, presentationMaterials.dark),
    snow: new THREE.Mesh(snowGeometry, presentationMaterials.snow),
    accent: new THREE.Mesh(accentGeometry, presentationMaterials.accent),
  };
  const castShadow = options.castShadow ?? true;
  const receiveShadow = options.receiveShadow ?? true;
  for (const slot of MATERIAL_SLOTS) configureMesh(batches[slot], slot, castShadow, receiveShadow);
  concreteGeometry.setDrawRange(0, CONCRETE_INDEX_COUNT);

  const root = new THREE.Group();
  root.name = options.name ?? 'PerimeterWallPresentation';
  root.matrixAutoUpdate = false;
  root.updateMatrix();
  root.userData.presentationOnly = true;
  root.userData.authoritativeColliders = 'PerimeterWallPresentation.blueprint.colliders';
  root.add(batches.concrete, batches.dark, batches.snow, batches.accent);
  parent.add(root);

  const frozenBatches = Object.freeze(batches);
  const stats = Object.freeze<PerimeterWallPresentationStats>({
    quality: 'high',
    authoredParts: 236,
    panelTriangles: 1056,
    submittedTriangles: 2832,
    drawCalls: 4,
    geometries: 4,
    ownedGeometries: 4,
    injectedMaterials: 4,
    ownedMaterials: 4,
    ownedTextures: 0,
    colliders: 0,
    perFrameUpdates: 0,
  });
  let disposed = false;
  return {
    root,
    batches: frozenBatches,
    blueprint,
    stats,
    setDetailsVisible(visible: boolean): void {
      concreteGeometry.setDrawRange(0, visible ? CONCRETE_INDEX_COUNT : PANEL_INDEX_COUNT);
      batches.dark.visible = visible;
      batches.snow.visible = visible;
      batches.accent.visible = visible;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(presentationMaterials)) material.dispose();
    },
  };
}
