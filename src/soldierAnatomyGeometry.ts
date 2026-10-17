import * as THREE from 'three';

interface AnatomyRing {
  readonly y: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  /** Fore/aft centreline offset; positive Z is the soldier's front. */
  readonly centerZ: number;
}

export interface SoldierAnatomyGeometryStats {
  readonly geometries: 6;
  readonly uniqueTriangles: number;
  readonly submittedTriangles: number;
}

export interface SoldierAnatomyGeometrySet {
  readonly torso: THREE.BufferGeometry;
  readonly pelvis: THREE.BufferGeometry;
  readonly thigh: THREE.BufferGeometry;
  readonly calf: THREE.BufferGeometry;
  readonly upperArm: THREE.BufferGeometry;
  readonly forearm: THREE.BufferGeometry;
  readonly stats: Readonly<SoldierAnatomyGeometryStats>;
}

const TORSO_PROFILE: readonly AnatomyRing[] = Object.freeze([
  // The lower two rings pull in at the natural waist before the rib cage and
  // deltoid line broaden. Small Z shifts keep the back comparatively straight
  // while giving the chest a readable forward profile under the plate carrier.
  Object.freeze({ y: -.065, radiusX: .203, radiusZ: .146, centerZ: .000 }),
  Object.freeze({ y: .040, radiusX: .195, radiusZ: .151, centerZ: .005 }),
  Object.freeze({ y: .225, radiusX: .238, radiusZ: .181, centerZ: .008 }),
  Object.freeze({ y: .470, radiusX: .280, radiusZ: .194, centerZ: .000 }),
  Object.freeze({ y: .575, radiusX: .244, radiusZ: .169, centerZ: -.003 }),
  Object.freeze({ y: .645, radiusX: .132, radiusZ: .112, centerZ: -.003 }),
]);

const PELVIS_PROFILE: readonly AnatomyRing[] = Object.freeze([
  // A narrow lower bridge opens into the hip crest, then returns to the torso
  // waist instead of forming the former inverted-cone silhouette.
  Object.freeze({ y: -.100, radiusX: .168, radiusZ: .101, centerZ: .002 }),
  Object.freeze({ y: -.060, radiusX: .193, radiusZ: .113, centerZ: -.001 }),
  Object.freeze({ y: -.020, radiusX: .220, radiusZ: .127, centerZ: -.006 }),
  Object.freeze({ y: .030, radiusX: .230, radiusZ: .132, centerZ: -.008 }),
  Object.freeze({ y: .070, radiusX: .219, radiusZ: .127, centerZ: -.004 }),
  Object.freeze({ y: .100, radiusX: .203, radiusZ: .138, centerZ: .000 }),
]);

const THIGH_PROFILE: readonly AnatomyRing[] = Object.freeze([
  Object.freeze({ y: -.515, radiusX: .081, radiusZ: .075, centerZ: .010 }),
  Object.freeze({ y: -.420, radiusX: .087, radiusZ: .081, centerZ: .008 }),
  Object.freeze({ y: -.280, radiusX: .102, radiusZ: .095, centerZ: .003 }),
  Object.freeze({ y: -.120, radiusX: .114, radiusZ: .104, centerZ: -.002 }),
  Object.freeze({ y: -.030, radiusX: .119, radiusZ: .108, centerZ: -.004 }),
  Object.freeze({ y: .015, radiusX: .112, radiusZ: .102, centerZ: .000 }),
]);

const CALF_PROFILE: readonly AnatomyRing[] = Object.freeze([
  Object.freeze({ y: -.500, radiusX: .064, radiusZ: .058, centerZ: .000 }),
  Object.freeze({ y: -.420, radiusX: .071, radiusZ: .064, centerZ: -.003 }),
  Object.freeze({ y: -.280, radiusX: .088, radiusZ: .079, centerZ: -.009 }),
  Object.freeze({ y: -.140, radiusX: .102, radiusZ: .094, centerZ: -.012 }),
  Object.freeze({ y: -.050, radiusX: .096, radiusZ: .089, centerZ: -.002 }),
  // The upper calf meets the distal thigh at the forward knee line.
  Object.freeze({ y: .000, radiusX: .081, radiusZ: .075, centerZ: .010 }),
]);

const UPPER_ARM_PROFILE: readonly AnatomyRing[] = Object.freeze([
  Object.freeze({ y: -.430, radiusX: .064, radiusZ: .058, centerZ: .006 }),
  Object.freeze({ y: -.350, radiusX: .070, radiusZ: .063, centerZ: .004 }),
  Object.freeze({ y: -.220, radiusX: .083, radiusZ: .074, centerZ: .002 }),
  Object.freeze({ y: -.100, radiusX: .092, radiusZ: .082, centerZ: .000 }),
  Object.freeze({ y: -.040, radiusX: .090, radiusZ: .080, centerZ: .000 }),
  Object.freeze({ y: -.010, radiusX: .084, radiusZ: .075, centerZ: .000 }),
]);

const FOREARM_PROFILE: readonly AnatomyRing[] = Object.freeze([
  Object.freeze({ y: -.377, radiusX: .050, radiusZ: .045, centerZ: .006 }),
  Object.freeze({ y: -.300, radiusX: .056, radiusZ: .050, centerZ: .004 }),
  Object.freeze({ y: -.200, radiusX: .069, radiusZ: .061, centerZ: .002 }),
  Object.freeze({ y: -.100, radiusX: .077, radiusZ: .068, centerZ: .000 }),
  Object.freeze({ y: -.040, radiusX: .072, radiusZ: .064, centerZ: .001 }),
  // Matches the upper arm's elbow cap, avoiding a pinched hinge in a bent pose.
  Object.freeze({ y: -.003, radiusX: .064, radiusZ: .058, centerZ: .006 }),
]);

function profileSlope(profile: readonly AnatomyRing[], index: number, key: 'radiusX' | 'radiusZ' | 'centerZ'): number {
  const previous = profile[Math.max(0, index - 1)];
  const next = profile[Math.min(profile.length - 1, index + 1)];
  return (next[key] - previous[key]) / (next.y - previous.y);
}

function pushVertex(
  positions: number[], normals: number[], uvs: number[],
  position: readonly [number, number, number], normal: readonly [number, number, number],
  uv: readonly [number, number],
): number {
  const index = positions.length / 3;
  positions.push(...position);
  normals.push(...normal);
  uvs.push(...uv);
  return index;
}

/**
 * Builds an indexed elliptical ring shell. Side-ring vertices are shared for
 * smooth shading, while each closed cap has independent vertices and a planar
 * normal. The duplicated side vertex at theta=-PI/2 is the back UV seam.
 */
function createProfileShell(
  name: string,
  profile: readonly AnatomyRing[],
  segments: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const firstY = profile[0].y;
  const inverseHeight = 1 / (profile[profile.length - 1].y - firstY);

  for (let ringIndex = 0; ringIndex < profile.length; ringIndex++) {
    const ring = profile[ringIndex];
    const slopeX = profileSlope(profile, ringIndex, 'radiusX');
    const slopeZ = profileSlope(profile, ringIndex, 'radiusZ');
    const centerSlopeZ = profileSlope(profile, ringIndex, 'centerZ');
    for (let segment = 0; segment <= segments; segment++) {
      const u = segment / segments;
      const theta = -Math.PI * .5 + u * Math.PI * 2;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      const nx = ring.radiusZ * cosine;
      const ny = -(
        slopeZ * ring.radiusX * sine * sine
        + slopeX * ring.radiusZ * cosine * cosine
        + centerSlopeZ * ring.radiusX * sine
      );
      const nz = ring.radiusX * sine;
      const normalLength = Math.hypot(nx, ny, nz);
      pushVertex(
        positions,
        normals,
        uvs,
        [ring.radiusX * cosine, ring.y, ring.centerZ + ring.radiusZ * sine],
        [nx / normalLength, ny / normalLength, nz / normalLength],
        [u, (ring.y - firstY) * inverseHeight],
      );
    }
  }

  const sideStride = segments + 1;
  for (let ring = 0; ring < profile.length - 1; ring++) {
    const lower = ring * sideStride;
    const upper = (ring + 1) * sideStride;
    for (let segment = 0; segment < segments; segment++) {
      const a = lower + segment;
      const b = a + 1;
      const d = upper + segment;
      const c = d + 1;
      indices.push(a, c, b, a, d, c);
    }
  }

  const addCap = (ring: AnatomyRing, up: boolean): void => {
    const normal = [0, up ? 1 : -1, 0] as const;
    const center = pushVertex(positions, normals, uvs, [0, ring.y, ring.centerZ], normal, [.5, .5]);
    const perimeter: number[] = [];
    for (let segment = 0; segment <= segments; segment++) {
      const theta = -Math.PI * .5 + segment / segments * Math.PI * 2;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      perimeter.push(pushVertex(
        positions,
        normals,
        uvs,
        [ring.radiusX * cosine, ring.y, ring.centerZ + ring.radiusZ * sine],
        normal,
        [.5 + cosine * .5, .5 + sine * .5],
      ));
    }
    for (let segment = 0; segment < segments; segment++) {
      if (up) indices.push(center, perimeter[segment + 1], perimeter[segment]);
      else indices.push(center, perimeter[segment], perimeter[segment + 1]);
    }
  };

  addCap(profile[0], false);
  addCap(profile[profile.length - 1], true);

  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function triangles(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? 0) / 3;
}

/** Creates one independently owned, material-free anatomical geometry set. */
export function createSoldierAnatomyGeometrySet(): SoldierAnatomyGeometrySet {
  const torso = createProfileShell('AnatomicalTorsoShell', TORSO_PROFILE, 12);
  const pelvis = createProfileShell('AnatomicalPelvisShell', PELVIS_PROFILE, 12);
  const thigh = createProfileShell('AnatomicalThighShell', THIGH_PROFILE, 10);
  const calf = createProfileShell('AnatomicalCalfShell', CALF_PROFILE, 10);
  const upperArm = createProfileShell('AnatomicalUpperArmShell', UPPER_ARM_PROFILE, 10);
  const forearm = createProfileShell('AnatomicalForearmShell', FOREARM_PROFILE, 10);
  const uniqueTriangles = [torso, pelvis, thigh, calf, upperArm, forearm]
    .reduce((sum, geometry) => sum + triangles(geometry), 0);
  const submittedTriangles = triangles(torso) + triangles(pelvis) + 2 * (
    triangles(thigh) + triangles(calf) + triangles(upperArm) + triangles(forearm)
  );
  const stats = Object.freeze<SoldierAnatomyGeometryStats>({
    geometries: 6,
    uniqueTriangles,
    submittedTriangles,
  });
  return Object.freeze({ torso, pelvis, thigh, calf, upperArm, forearm, stats });
}
