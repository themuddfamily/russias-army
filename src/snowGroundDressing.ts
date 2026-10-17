import * as THREE from 'three';

export type SnowGroundDressingQuality = 'low' | 'high' | boolean;
export type FootingEntrance = 'north' | 'east' | 'south' | 'west' | false;

export interface SnowFootingEntrance {
  side: Exclude<FootingEntrance, false>;
  width: number;
}

export interface SnowRoadEdge {
  /** World-space [x, z] endpoints of the road edge. */
  start: readonly [number, number];
  end: readonly [number, number];
  /** Which side of the directed edge is road. Defaults to the left-hand side. */
  inside?: -1 | 1;
  /** Lateral distance from the edge to the centre of the tire/slush marks. */
  trackOffset?: number;
  /** Set false for decorative edges that should only accumulate snow. */
  tracks?: boolean;
  /** Set false for track-only spans such as a cleared road junction. */
  drifts?: boolean;
}

export interface SnowFooting {
  /** World-space [x, z] centre and [width, depth] footprint. */
  center: readonly [number, number];
  size: readonly [number, number];
  /** Gap between the solid footprint and visual-only snow. */
  clearance?: number;
  /** Optional doorway side used for a short trail of boot prints. */
  entrance?: FootingEntrance;
  /** Clear width reserved in the snow bank around the doorway. */
  entranceWidth?: number;
  /** Multiple doorway clearings. Takes precedence over the legacy single entrance. */
  entrances?: readonly SnowFootingEntrance[];
}

export interface SnowGroundDressingOptions {
  roadEdges?: readonly SnowRoadEdge[];
  footings?: readonly SnowFooting[];
  /** Reuses an arena snow material when supplied; it remains caller-owned. */
  material?: THREE.Material;
  /** Reuses a caller-owned slush/decal material when supplied. */
  decalMaterial?: THREE.Material;
  seed?: number | string;
  quality?: SnowGroundDressingQuality;
  groundY?: number;
  /**
   * Optional visual-surface query. Decals whose footprint overlaps a returned
   * height are lifted coherently above that surface; `undefined` keeps the
   * normal ground clearance (for example boot prints on snow).
   */
  surfaceHeightAt?: (x: number, z: number) => number | undefined;
}

export interface SnowGroundDressingStats {
  batches: number;
  driftInstances: number;
  decalInstances: number;
  tireMarks: number;
  bootMarks: number;
  slushMarks: number;
  triangles: number;
}

export interface SnowGroundDressing {
  root: THREE.Group;
  drifts: THREE.InstancedMesh;
  decals: THREE.InstancedMesh;
  stats: Readonly<SnowGroundDressingStats>;
  dispose: () => void;
}

export const SNOW_GROUND_BATCH_CAP = 4;
export const WINTER_DECAL_PROGRAM_KEY = 'winter-ground-decal-feather-v1';

export const DEFAULT_SNOW_ROAD_EDGES: readonly SnowRoadEdge[] = Object.freeze([
  Object.freeze({ start: [-56, -6.5] as const, end: [56, -6.5] as const, inside: 1 as const }),
  Object.freeze({ start: [56, 6.5] as const, end: [-56, 6.5] as const, inside: 1 as const }),
  Object.freeze({ start: [6.5, -56] as const, end: [6.5, 56] as const, inside: 1 as const }),
  Object.freeze({ start: [-6.5, 56] as const, end: [-6.5, -56] as const, inside: 1 as const }),
]);

export const DEFAULT_SNOW_FOOTINGS: readonly SnowFooting[] = Object.freeze([
  Object.freeze({ center: [-21, -18] as const, size: [24, 14] as const, entrance: 'south' as const, entranceWidth: 2.2 }),
  Object.freeze({ center: [24, 19] as const, size: [19, 13] as const, entrances: Object.freeze([{ side: 'south' as const, width: 3.2 }, { side: 'east' as const, width: 2.4 }]) }),
  Object.freeze({ center: [27, -24] as const, size: [15, 10] as const, entrances: Object.freeze([{ side: 'south' as const, width: 4.8 }, { side: 'east' as const, width: 3.4 }]) }),
  Object.freeze({ center: [-26, 25] as const, size: [14, 10] as const, entrances: Object.freeze([{ side: 'south' as const, width: 2.2 }, { side: 'east' as const, width: 4.2 }]) }),
]);

interface Placement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  length: number;
  height: number;
  width: number;
  color: number;
}

interface DressingProfile {
  roadDriftSpacing: number;
  footingDriftSpacing: number;
  tireSpacing: number;
  bootSteps: number;
}

interface DecalCounts {
  tire: number;
  boot: number;
  slush: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const FLAT_QUATERNION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const DECAL_SURFACE_CLEARANCE = .006;

/** Yaw that aligns geometry authored along local +X with an XZ direction. */
function localXHeading(dirX: number, dirZ: number): number {
  return Math.atan2(-dirZ, dirX);
}

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function positive(name: string, value: number): number {
  finite(name, value);
  if (value <= 0) throw new Error(`${name} must be greater than zero`);
  return value;
}

function profileFor(quality: SnowGroundDressingQuality | undefined): DressingProfile {
  const high = quality === undefined || quality === true || quality === 'high';
  return high
    ? { roadDriftSpacing: 4.5, footingDriftSpacing: 3.8, tireSpacing: 4.8, bootSteps: 6 }
    : { roadDriftSpacing: 8.6, footingDriftSpacing: 6.8, tireSpacing: 8.2, bootSteps: 3 };
}

function createDriftGeometry(): THREE.BufferGeometry {
  // A tapered surface grid follows the road edge like a low ploughed berm.
  // Its entire perimeter sits below the ground plane, eliminating the bright
  // faceted wedges produced by the former radial mound silhouette.
  const alongStations = [-1, -.64, -.21, .27, .69, 1] as const;
  const crossStations = [-1, -.28, .4, 1] as const;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let alongIndex = 0; alongIndex < alongStations.length; alongIndex++) {
    const x = alongStations[alongIndex];
    const lengthTaper = Math.pow(Math.sin((x + 1) * Math.PI * .5), .7);
    for (let crossIndex = 0; crossIndex < crossStations.length; crossIndex++) {
      const z = crossStations[crossIndex];
      const perimeter = alongIndex === 0 || alongIndex === alongStations.length - 1
        || crossIndex === 0 || crossIndex === crossStations.length - 1;
      const crown = crossIndex === 1 ? 1 : .62;
      const ripple = .92 + Math.sin(x * 8.1 + crossIndex * 1.7) * .08;
      const y = perimeter ? -.055 : lengthTaper * crown * ripple;
      positions.push(x, y, z);
      uvs.push((x + 1) * .5, (z + 1) * .5);
    }
  }
  for (let alongIndex = 0; alongIndex < alongStations.length - 1; alongIndex++) {
    for (let crossIndex = 0; crossIndex < crossStations.length - 1; crossIndex++) {
      const topLeft = alongIndex * crossStations.length + crossIndex;
      const bottomLeft = (alongIndex + 1) * crossStations.length + crossIndex;
      indices.push(topLeft, bottomLeft, topLeft + 1, topLeft + 1, bottomLeft, bottomLeft + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.name = 'TaperedSnowBermGeometry';
  return geometry;
}

function createTrackGeometry(): THREE.BufferGeometry {
  const radii = [1, .86, 1.04, .9, 1, .83, 1.02, .88] as const;
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [.5, .5];
  const indices: number[] = [];
  for (let segment = 0; segment < radii.length; segment++) {
    const angle = segment / radii.length * Math.PI * 2;
    const radius = radii[segment];
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    uvs.push(Math.cos(angle) * radius * .5 + .5, Math.sin(angle) * radius * .5 + .5);
    indices.push(0, 1 + segment, 1 + ((segment + 1) % radii.length));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'IrregularWinterTrackGeometry';
  return geometry;
}

function defaultSnowMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xd6deda,
    roughness: .96,
    metalness: 0,
    vertexColors: true,
  });
  material.name = 'SnowGroundDressing';
  return material;
}

function defaultDecalMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    // Instance colours carry the full tire/slush value. A dark base multiplied
    // every shoulder tint almost to black and reinforced the hard road edge.
    color: 0xffffff,
    roughness: .88,
    metalness: .02,
    transparent: true,
    opacity: .30,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  material.name = 'WinterSlushDecals';
  material.userData.softWinterDecal = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWinterDecalUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWinterDecalUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWinterDecalUv;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float winterDecalRadius = length( ( vWinterDecalUv - 0.5 ) * 2.0 );
        diffuseColor.a *= 1.0 - smoothstep( 0.56, 1.02, winterDecalRadius );`,
      );
  };
  material.customProgramCacheKey = () => WINTER_DECAL_PROGRAM_KEY;
  return material;
}

function addLineDrifts(
  output: Placement[],
  occupied: Array<readonly [number, number, number]>,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  normalSign: number,
  spacing: number,
  groundY: number,
  random: () => number,
): void {
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const length = Math.hypot(deltaX, deltaZ);
  if (length < .01) return;
  const dirX = deltaX / length;
  const dirZ = deltaZ / length;
  const normalX = -dirZ * normalSign;
  const normalZ = dirX * normalSign;
  const count = Math.max(1, Math.floor(length / spacing));
  const stride = length / count;
  for (let index = 0; index < count; index++) {
    const along = (index + .5 + (random() - .5) * .32) * stride;
    const lateral = .10 + random() * .24;
    const x = startX + dirX * along + normalX * lateral;
    const z = startZ + dirZ * along + normalZ * lateral;
    const driftLength = Math.min(stride * .94, 3 + random() * 1.9);
    const footprint = Math.max(.72, driftLength * .27);
    if (occupied.some(([ox, oz, radius]) => Math.hypot(x - ox, z - oz) < footprint + radius)) continue;
    occupied.push([x, z, footprint]);
    output.push({
      x,
      y: groundY,
      z,
      yaw: localXHeading(dirX, dirZ) + (random() - .5) * .14,
      length: driftLength * .5,
      height: .11 + random() * .16,
      width: .48 + random() * .24,
      color: new THREE.Color(0xd1d9d5).offsetHSL(0, 0, (random() - .5) * .055).getHex(),
    });
  }
}

function addDecal(
  output: Placement[],
  counts: DecalCounts,
  kind: keyof DecalCounts,
  x: number,
  z: number,
  yaw: number,
  length: number,
  width: number,
  groundY: number,
  shade: number,
): void {
  counts[kind]++;
  output.push({ x, y: groundY + .032, z, yaw, length, height: 1, width, color: shade });
}

function addRoadTracks(
  output: Placement[],
  counts: DecalCounts,
  edge: SnowRoadEdge,
  spacing: number,
  groundY: number,
  random: () => number,
): void {
  if (edge.tracks === false) return;
  const [startX, startZ] = edge.start;
  const [endX, endZ] = edge.end;
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const length = Math.hypot(deltaX, deltaZ);
  if (length < .01) return;
  const dirX = deltaX / length;
  const dirZ = deltaZ / length;
  const normalX = -dirZ * (edge.inside ?? 1);
  const normalZ = dirX * (edge.inside ?? 1);
  const offset = edge.trackOffset ?? 2.25;
  const yaw = localXHeading(dirX, dirZ);
  const count = Math.max(1, Math.floor(length / spacing));
  const stride = length / count;
  for (let index = 0; index < count; index++) {
    const along = (index + .5 + (random() - .5) * .18) * stride;
    const centreX = startX + dirX * along + normalX * offset;
    const centreZ = startZ + dirZ * along + normalZ * offset;
    const tireLength = .70 + random() * .34;
    for (const lane of [-.62, .62]) {
      addDecal(
        output,
        counts,
        'tire',
        centreX + normalX * lane,
        centreZ + normalZ * lane,
        yaw + (random() - .5) * .035,
        tireLength,
        .10 + random() * .035,
        groundY,
        // Compacted tire film on dark asphalt is a restrained blue-grey value,
        // not the near-black slash appropriate to a boot print on snow.
        random() > .5 ? 0x5e6966 : 0x68736f,
      );
    }
    if (index % 3 === 1) {
      addDecal(
        output,
        counts,
        'slush',
        centreX + (random() - .5) * normalX,
        centreZ + (random() - .5) * normalZ,
        yaw + (random() - .5) * .28,
        .55 + random() * .45,
        .20 + random() * .20,
        groundY,
        0x707b77,
      );
    }
  }
}

function addRoadShoulderSlush(
  output: Placement[],
  counts: DecalCounts,
  edge: SnowRoadEdge,
  spacing: number,
  groundY: number,
  random: () => number,
): void {
  if (edge.drifts === false) return;
  const [startX, startZ] = edge.start;
  const [endX, endZ] = edge.end;
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const length = Math.hypot(deltaX, deltaZ);
  if (length < .01) return;
  const dirX = deltaX / length;
  const dirZ = deltaZ / length;
  const roadSign = edge.inside ?? 1;
  const normalX = -dirZ * roadSign;
  const normalZ = dirX * roadSign;
  const count = Math.max(1, Math.floor(length / (spacing * 3)));
  const stride = length / count;
  const yaw = localXHeading(dirX, dirZ);
  for (let index = 0; index < count; index++) {
    const along = (index + .5 + (random() - .5) * .20) * stride;
    // Long shoulder polygons projected as disconnected, near-black wedges in
    // close camera views. Break each span into irregular, separated deposits;
    // they stay in the same instanced draw while reading as churned slush.
    const patchCount = Math.max(2, Math.ceil(stride / 4.4));
    const patchStride = stride / patchCount;
    for (let patch = 0; patch < patchCount; patch++) {
      const patchAlong = along + (patch + .5) * patchStride - stride * .5
        + (random() - .5) * patchStride * .18;
      const roadward = .08 + random() * .18;
      addDecal(
        output,
        counts,
        'slush',
        startX + dirX * patchAlong + normalX * roadward,
        startZ + dirZ * patchAlong + normalZ * roadward,
        yaw + (random() - .5) * .11,
        patchStride * (.56 + random() * .24),
        .28 + random() * .24,
        groundY,
        random() > .45 ? 0x7d8782 : 0x929b96,
      );
    }
  }
}

function footingEntrances(footing: SnowFooting): readonly SnowFootingEntrance[] {
  if (footing.entrances !== undefined) return footing.entrances;
  if (footing.entrance === false) return [];
  return [{ side: footing.entrance ?? 'south', width: footing.entranceWidth ?? 1.6 }];
}

function footingEdges(footing: SnowFooting): Array<readonly [number, number, number, number, number]> {
  const [x, z] = footing.center;
  const [width, depth] = footing.size;
  const clearance = footing.clearance ?? .36;
  const halfWidth = width * .5 + clearance;
  const halfDepth = depth * .5 + clearance;
  const entrances = footingEntrances(footing);
  const result: Array<readonly [number, number, number, number, number]> = [];
  const add = (side: Exclude<FootingEntrance, false>, startX: number, startZ: number, endX: number, endZ: number): void => {
    const entrance = entrances.find((candidate) => candidate.side === side);
    if (!entrance) { result.push([startX, startZ, endX, endZ, -1]); return; }
    const length = Math.hypot(endX - startX, endZ - startZ);
    // Reserve enough width for the transformed ends of the elongated mounds,
    // not just their instance centres.
    const halfGap = Math.min(length * .45, (entrance.width + 2) * .5);
    const dirX = (endX - startX) / length;
    const dirZ = (endZ - startZ) / length;
    const midX = (startX + endX) * .5;
    const midZ = (startZ + endZ) * .5;
    result.push(
      [startX, startZ, midX - dirX * halfGap, midZ - dirZ * halfGap, -1],
      [midX + dirX * halfGap, midZ + dirZ * halfGap, endX, endZ, -1],
    );
  };
  add('north', x - halfWidth, z - halfDepth, x + halfWidth, z - halfDepth);
  add('east', x + halfWidth, z - halfDepth, x + halfWidth, z + halfDepth);
  add('south', x + halfWidth, z + halfDepth, x - halfWidth, z + halfDepth);
  add('west', x - halfWidth, z + halfDepth, x - halfWidth, z - halfDepth);
  return result;
}

function addBootTrail(
  output: Placement[],
  counts: DecalCounts,
  footing: SnowFooting,
  steps: number,
  groundY: number,
  random: () => number,
): void {
  const [x, z] = footing.center;
  const [width, depth] = footing.size;
  const clearance = footing.clearance ?? .36;
  for (const entrance of footingEntrances(footing)) {
    let originX = x;
    let originZ = z;
    let dirX = 0;
    let dirZ = 1;
    if (entrance.side === 'north') { originZ -= depth * .5 + clearance + .2; dirZ = -1; }
    if (entrance.side === 'south') { originZ += depth * .5 + clearance + .2; dirZ = 1; }
    if (entrance.side === 'east') { originX += width * .5 + clearance + .2; dirX = 1; dirZ = 0; }
    if (entrance.side === 'west') { originX -= width * .5 + clearance + .2; dirX = -1; dirZ = 0; }
    const lateralX = -dirZ;
    const lateralZ = dirX;
    const yaw = localXHeading(dirX, dirZ);
    for (let index = 0; index < steps; index++) {
      const distance = .32 + index * .48;
      const side = index % 2 === 0 ? -.13 : .13;
      addDecal(
        output,
        counts,
        'boot',
        originX + dirX * distance + lateralX * side,
        originZ + dirZ * distance + lateralZ * side,
        yaw + (index % 2 === 0 ? -.10 : .10) + (random() - .5) * .05,
        .18 + random() * .035,
        .075 + random() * .02,
        groundY,
        index % 3 === 0 ? 0x363d3a : 0x414744,
      );
    }
  }
}

function buildInstancedMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly Placement[],
  isDecal: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.userData.visualOnly = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const yawRotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (let index = 0; index < placements.length; index++) {
    const placement = placements[index];
    position.set(placement.x, placement.y, placement.z);
    yawRotation.setFromAxisAngle(UP, placement.yaw);
    rotation.copy(yawRotation);
    if (isDecal) rotation.multiply(FLAT_QUATERNION);
    scale.set(placement.length, isDecal ? placement.width : placement.height, isDecal ? 1 : placement.width);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.setHex(placement.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(THREE.StaticDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.castShadow = false;
  mesh.receiveShadow = !isDecal;
  mesh.frustumCulled = true;
  if (isDecal) mesh.renderOrder = 3;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}

function alignDecalsToVisualSurface(
  decals: Placement[],
  surfaceHeightAt: ((x: number, z: number) => number | undefined) | undefined,
): void {
  if (!surfaceHeightAt) return;
  for (const decal of decals) {
    // The irregular fan reaches a little beyond its unit axes. Sampling a
    // conservative oriented rectangle keeps every corner above a crowned road
    // without bending the tiny visual decal or allocating extra geometry.
    const alongX = Math.cos(decal.yaw);
    const alongZ = -Math.sin(decal.yaw);
    const acrossX = -Math.sin(decal.yaw);
    const acrossZ = -Math.cos(decal.yaw);
    const alongExtent = decal.length * 1.05;
    const acrossExtent = decal.width * 1.05;
    const sampleOffsets: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [alongExtent, acrossExtent],
      [alongExtent, -acrossExtent],
      [-alongExtent, acrossExtent],
      [-alongExtent, -acrossExtent],
    ];
    let maximumHeight = Number.NEGATIVE_INFINITY;
    for (const [along, across] of sampleOffsets) {
      const x = decal.x + alongX * along + acrossX * across;
      const z = decal.z + alongZ * along + acrossZ * across;
      const height = surfaceHeightAt(x, z);
      if (height === undefined) continue;
      if (!Number.isFinite(height)) throw new Error('surfaceHeightAt must return a finite height or undefined');
      maximumHeight = Math.max(maximumHeight, height);
    }
    if (Number.isFinite(maximumHeight)) decal.y = maximumHeight + DECAL_SURFACE_CLEARANCE;
  }
}

/**
 * Adds visual-only winter ground breakup in two static instanced draw batches.
 * No colliders or per-frame updates are installed, so the dressing cannot alter
 * navigation, hit tests, or simulation determinism.
 */
export function createSnowGroundDressing(
  parent: THREE.Object3D,
  options: SnowGroundDressingOptions = {},
): SnowGroundDressing {
  const quality = profileFor(options.quality);
  const groundY = finite('groundY', options.groundY ?? 0);
  const roadEdges = options.roadEdges ?? DEFAULT_SNOW_ROAD_EDGES;
  const footings = options.footings ?? DEFAULT_SNOW_FOOTINGS;
  const random = mulberry32(hashSeed(options.seed ?? 'barrack-01-ground-dressing'));
  const drifts: Placement[] = [];
  const decals: Placement[] = [];
  const occupied: Array<readonly [number, number, number]> = [];
  const decalCounts: DecalCounts = { tire: 0, boot: 0, slush: 0 };

  for (const [index, edge] of roadEdges.entries()) {
    const [startX, startZ] = edge.start;
    const [endX, endZ] = edge.end;
    finite(`roadEdges[${index}].start[0]`, startX);
    finite(`roadEdges[${index}].start[1]`, startZ);
    finite(`roadEdges[${index}].end[0]`, endX);
    finite(`roadEdges[${index}].end[1]`, endZ);
    if (edge.inside !== undefined && edge.inside !== -1 && edge.inside !== 1) {
      throw new Error(`roadEdges[${index}].inside must be -1 or 1`);
    }
    if (edge.trackOffset !== undefined) positive(`roadEdges[${index}].trackOffset`, edge.trackOffset);
    if (edge.drifts !== false) addLineDrifts(
      drifts, occupied, startX, startZ, endX, endZ, -(edge.inside ?? 1),
      quality.roadDriftSpacing, groundY, random,
    );
    addRoadTracks(decals, decalCounts, edge, quality.tireSpacing, groundY, random);
    addRoadShoulderSlush(decals, decalCounts, edge, quality.roadDriftSpacing, groundY, random);
  }

  for (const [index, footing] of footings.entries()) {
    const [x, z] = footing.center;
    const [width, depth] = footing.size;
    finite(`footings[${index}].center[0]`, x);
    finite(`footings[${index}].center[1]`, z);
    positive(`footings[${index}].size[0]`, width);
    positive(`footings[${index}].size[1]`, depth);
    if (footing.clearance !== undefined && footing.clearance < 0) {
      throw new Error(`footings[${index}].clearance must be non-negative`);
    }
    if (footing.entranceWidth !== undefined) positive(`footings[${index}].entranceWidth`, footing.entranceWidth);
    const seenEntrances = new Set<string>();
    for (const [entranceIndex, entrance] of (footing.entrances ?? []).entries()) {
      if (!['north', 'east', 'south', 'west'].includes(entrance.side)) {
        throw new Error(`footings[${index}].entrances[${entranceIndex}].side is invalid`);
      }
      positive(`footings[${index}].entrances[${entranceIndex}].width`, entrance.width);
      if (seenEntrances.has(entrance.side)) throw new Error(`footings[${index}] has duplicate ${entrance.side} entrances`);
      seenEntrances.add(entrance.side);
    }
    for (const [startX, startZ, endX, endZ, normal] of footingEdges(footing)) {
      addLineDrifts(
        drifts,
        occupied,
        startX,
        startZ,
        endX,
        endZ,
        normal,
        quality.footingDriftSpacing,
        groundY,
        random,
      );
    }
    addBootTrail(decals, decalCounts, footing, quality.bootSteps, groundY, random);
  }

  alignDecalsToVisualSurface(decals, options.surfaceHeightAt);

  const driftGeometry = createDriftGeometry();
  const decalGeometry = createTrackGeometry();
  const snowMaterial = options.material ?? defaultSnowMaterial();
  const decalMaterial = options.decalMaterial ?? defaultDecalMaterial();
  const driftMesh = buildInstancedMesh('InstancedSnowDrifts', driftGeometry, snowMaterial, drifts, false);
  const decalMesh = buildInstancedMesh('InstancedWinterTracks', decalGeometry, decalMaterial, decals, true);
  const root = new THREE.Group();
  root.name = 'SnowGroundDressing';
  root.userData.visualOnly = true;
  root.add(driftMesh, decalMesh);
  parent.add(root);

  const stats: Readonly<SnowGroundDressingStats> = Object.freeze({
    batches: root.children.filter((child) => child instanceof THREE.InstancedMesh).length,
    driftInstances: drifts.length,
    decalInstances: decals.length,
    tireMarks: decalCounts.tire,
    bootMarks: decalCounts.boot,
    slushMarks: decalCounts.slush,
    triangles: drifts.length * 30 + decals.length * 8,
  });
  if (stats.batches > SNOW_GROUND_BATCH_CAP) throw new Error('Snow ground dressing exceeded its batch cap');

  let disposed = false;
  return {
    root,
    drifts: driftMesh,
    decals: decalMesh,
    stats,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      driftGeometry.dispose();
      decalGeometry.dispose();
      if (!options.material) snowMaterial.dispose();
      if (!options.decalMaterial) decalMaterial.dispose();
    },
  };
}
