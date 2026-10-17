import * as THREE from 'three';
import {
  SECURITY_FENCE_RUNS,
  type SecurityFenceRun,
} from './securityInfrastructureBlueprint';

export type ChainLinkFenceQuality = 'low' | 'high';
export type ChainLinkFenceRun = SecurityFenceRun;

export interface ChainLinkFenceOptions {
  readonly quality?: ChainLinkFenceQuality;
  readonly name?: string;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface ChainLinkFenceBatches {
  /** Alpha-tested, decorative fence infill. It never owns gameplay collision. */
  readonly infill: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  /** Thin visual-only snow accumulation along each run's lower edge. */
  readonly snowEdges: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
}

export interface ChainLinkFenceResources {
  readonly diamondTexture: THREE.DataTexture;
  readonly linkMaterial: THREE.MeshStandardMaterial;
  readonly snowMaterial: THREE.MeshStandardMaterial;
}

export interface ChainLinkFenceStats {
  readonly quality: ChainLinkFenceQuality;
  readonly runs: number;
  readonly panelInstances: number;
  readonly snowEdgeInstances: number;
  readonly totalInstances: number;
  readonly drawCalls: number;
  /** Triangles submitted after instancing, not merely unique geometry triangles. */
  readonly submittedTriangles: number;
  readonly textureResolution: number;
  /** Collision remains owned by securityInfrastructureBlueprint and the arena. */
  readonly colliders: 0;
}

export interface ChainLinkFencePresentation {
  readonly group: THREE.Group;
  readonly batches: ChainLinkFenceBatches;
  readonly resources: ChainLinkFenceResources;
  readonly stats: Readonly<ChainLinkFenceStats>;
  /** Idempotently detaches the presentation and releases every owned resource. */
  dispose(): void;
}

export const CHAIN_LINK_MAX_PANEL_WIDTH = 3;
export const CHAIN_LINK_TEXTURE_RESOLUTIONS = Object.freeze({ low: 64, high: 128 });

const FENCE_POST_WIDTH = .12;
const INFILL_BOTTOM = .16;
const INFILL_TOP = 1.99;
const INFILL_HEIGHT = INFILL_TOP - INFILL_BOTTOM;
const INFILL_CENTER_Y = (INFILL_TOP + INFILL_BOTTOM) * .5;
const SNOW_EDGE_HEIGHT = .075;
const SNOW_EDGE_DEPTH = .14;
const IDENTITY_SCALE_Z = .01;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function validateRun(run: ChainLinkFenceRun, index: number, ids: Set<string>): void {
  if (run.id.trim().length === 0) throw new RangeError(`runs[${index}].id must not be empty`);
  if (ids.has(run.id)) throw new RangeError(`runs[${index}].id must be unique`);
  ids.add(run.id);
  if (!Number.isFinite(run.x)) throw new RangeError(`runs[${index}].x must be finite`);
  if (!Number.isFinite(run.z)) throw new RangeError(`runs[${index}].z must be finite`);
  if (!Number.isFinite(run.length) || run.length <= FENCE_POST_WIDTH) {
    throw new RangeError(`runs[${index}].length must be finite and greater than ${FENCE_POST_WIDTH}`);
  }
  if (!Number.isFinite(run.rotationY)) {
    throw new RangeError(`runs[${index}].rotationY must be finite`);
  }
}

function distanceToInteger(value: number): number {
  return Math.abs(value - Math.round(value));
}

/**
 * Generates a tileable RGBA diamond weave without relying on DOM canvas state.
 * Holes have zero alpha, allowing one opaque render pass with alpha testing.
 */
function createDiamondTexture(quality: ChainLinkFenceQuality): THREE.DataTexture {
  const resolution = CHAIN_LINK_TEXTURE_RESOLUTIONS[quality];
  const data = new Uint8Array(resolution * resolution * 4);
  // Keep the openings small enough to read as security mesh at arena scale.
  // Width tracks texel density so the fallback texture still retains solid,
  // alpha-tested strands instead of collapsing into sub-pixel noise.
  const wireWidth = quality === 'high' ? .085 : .14;
  const strandFrequency = quality === 'high' ? 10 : 8;

  for (let y = 0; y < resolution; y++) {
    const v = (y + .5) / resolution;
    for (let x = 0; x < resolution; x++) {
      const u = (x + .5) / resolution;
      const ascending = distanceToInteger((u + v) * strandFrequency);
      const descending = distanceToInteger((u - v) * strandFrequency);
      const distance = Math.min(ascending, descending);
      const strand = THREE.MathUtils.clamp(1 - distance / wireWidth, 0, 1);
      const intersection = ascending < wireWidth && descending < wireWidth;
      const weather = ((x * 13 + y * 7) % 29) / 29;
      const luminance = Math.round((intersection ? 205 : 150) + weather * 26);
      const offset = (y * resolution + x) * 4;
      data[offset] = luminance;
      data[offset + 1] = Math.min(255, luminance + 8);
      data[offset + 2] = Math.min(255, luminance + 9);
      data[offset + 3] = Math.round(strand * 255);
    }
  }

  const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat);
  texture.name = `ChainLinkDiamond${quality === 'high' ? 'High' : 'Low'}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = quality === 'high' ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.generateMipmaps = quality === 'high';
  texture.anisotropy = quality === 'high' ? 8 : 2;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createLinkMaterial(texture: THREE.DataTexture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name: 'ChainLinkDiamondMaterial',
    map: texture,
    color: 0xc2cac9,
    roughness: .47,
    metalness: .68,
    alphaTest: .42,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });
  return material;
}

function configureBatch(
  mesh: THREE.InstancedMesh,
  name: string,
  castShadow: boolean,
  receiveShadow: boolean,
): void {
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.userData.decorative = true;
  mesh.userData.colliderPolicy = 'external';
}

function finishBatch(mesh: THREE.InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.count === 0) return;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

/**
 * Adds deterministic chain-link infill to compatible security-fence runs.
 *
 * The returned group is presentation-only: no collider, raycast policy or
 * gameplay bounds are created here. Existing fence colliders remain authoritative.
 */
export function createChainLinkFencePresentation(
  parent: THREE.Object3D,
  runs: readonly ChainLinkFenceRun[] = SECURITY_FENCE_RUNS,
  options: ChainLinkFenceOptions = {},
): ChainLinkFencePresentation {
  const quality = options.quality ?? 'high';
  if (quality !== 'low' && quality !== 'high') throw new RangeError('quality must be low or high');
  const ids = new Set<string>();
  runs.forEach((run, index) => validateRun(run, index, ids));

  const panelCounts = runs.map((run) => Math.ceil(run.length / CHAIN_LINK_MAX_PANEL_WIDTH));
  const panelInstances = panelCounts.reduce((total, count) => total + count, 0);
  const diamondTexture = createDiamondTexture(quality);
  const linkMaterial = createLinkMaterial(diamondTexture);
  const snowMaterial = new THREE.MeshStandardMaterial({
    name: 'ChainLinkLowerEdgeSnow',
    color: 0xd8e2e5,
    roughness: .96,
    metalness: 0,
  });
  const infillGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  infillGeometry.name = 'ChainLinkUnitPanel';
  const snowGeometry = new THREE.BoxGeometry(1, 1, 1);
  snowGeometry.name = 'ChainLinkUnitSnowEdge';

  const infill = new THREE.InstancedMesh(infillGeometry, linkMaterial, panelInstances);
  const snowEdges = new THREE.InstancedMesh(snowGeometry, snowMaterial, runs.length);
  // The low tier omits this subtle second pass; the infill remains fully
  // present and the arena's ground snow already covers the same lower edge.
  snowEdges.visible = quality === 'high';
  const castShadow = options.castShadow ?? quality === 'high';
  const receiveShadow = options.receiveShadow ?? true;
  configureBatch(infill, 'ChainLinkFenceInfill', castShadow, receiveShadow);
  configureBatch(snowEdges, 'ChainLinkFenceSnowEdges', false, receiveShadow);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let instance = 0;
  runs.forEach((run, runIndex) => {
    const panels = panelCounts[runIndex];
    const framedSpan = run.length - FENCE_POST_WIDTH;
    const panelWidth = framedSpan / panels;
    const cosine = Math.cos(run.rotationY);
    const sine = Math.sin(run.rotationY);
    quaternion.setFromAxisAngle(Y_AXIS, run.rotationY);

    for (let panel = 0; panel < panels; panel++) {
      const localX = -framedSpan * .5 + (panel + .5) * panelWidth;
      position.set(
        run.x + localX * cosine,
        INFILL_CENTER_Y,
        run.z - localX * sine,
      );
      scale.set(panelWidth * .94, INFILL_HEIGHT, IDENTITY_SCALE_Z);
      matrix.compose(position, quaternion, scale);
      infill.setMatrixAt(instance++, matrix);
    }

    position.set(run.x, SNOW_EDGE_HEIGHT * .5, run.z);
    scale.set(Math.max(run.length - .18, run.length * .75), SNOW_EDGE_HEIGHT, SNOW_EDGE_DEPTH);
    matrix.compose(position, quaternion, scale);
    snowEdges.setMatrixAt(runIndex, matrix);
  });
  finishBatch(infill);
  finishBatch(snowEdges);

  const group = new THREE.Group();
  group.name = options.name ?? 'ChainLinkFencePresentation';
  group.userData.decorative = true;
  group.userData.colliderPolicy = 'external';
  group.userData.quality = quality;
  group.add(infill, snowEdges);
  parent.add(group);

  const panelTriangles = infillGeometry.index
    ? infillGeometry.index.count / 3
    : infillGeometry.getAttribute('position').count / 3;
  const snowTriangles = snowGeometry.index
    ? snowGeometry.index.count / 3
    : snowGeometry.getAttribute('position').count / 3;
  const drawCalls = runs.length === 0 ? 0 : quality === 'high' ? 2 : 1;
  const stats = Object.freeze<ChainLinkFenceStats>({
    quality,
    runs: runs.length,
    panelInstances,
    snowEdgeInstances: runs.length,
    totalInstances: panelInstances + runs.length,
    drawCalls,
    submittedTriangles: panelTriangles * panelInstances + snowTriangles * runs.length,
    textureResolution: CHAIN_LINK_TEXTURE_RESOLUTIONS[quality],
    colliders: 0,
  });
  const batches = Object.freeze({ infill, snowEdges });
  const resources = Object.freeze({ diamondTexture, linkMaterial, snowMaterial });
  let disposed = false;

  return {
    group,
    batches,
    resources,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      infillGeometry.dispose();
      snowGeometry.dispose();
      linkMaterial.dispose();
      snowMaterial.dispose();
      diamondTexture.dispose();
    },
  };
}
