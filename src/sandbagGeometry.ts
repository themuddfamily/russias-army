import * as THREE from 'three';

type Point3 = readonly [number, number, number];

export type SandbagGeometryQuality = 'low' | 'high';

interface SandbagRing {
  readonly y: number;
  readonly radiusX: number;
  readonly radiusZ: number;
}

export const SANDBAG_LEGACY_CAPSULE_BOUNDS = Object.freeze({
  min: Object.freeze([-0.3199999928474426, -0.8450000286102295, -0.31197693943977356] as const),
  max: Object.freeze([0.28831005096435547, 0.8450000286102295, 0.31197693943977356] as const),
});

export interface SandbagGeometryStats {
  readonly geometries: 1;
  readonly vertices: number;
  readonly triangles: number;
  readonly bodyTriangles: number;
  readonly seamTriangles: number;
}

export interface SandbagGeometryResult {
  readonly geometry: THREE.BufferGeometry;
  readonly stats: Readonly<SandbagGeometryStats>;
  /** Idempotently releases the one caller-owned geometry. */
  dispose(): void;
}

const HIGH_SEGMENTS = 10;
const HIGH_BODY_RINGS: readonly SandbagRing[] = Object.freeze([
  Object.freeze({ y: -.844, radiusX: .035, radiusZ: .032 }),
  Object.freeze({ y: -.790, radiusX: .138, radiusZ: .132 }),
  Object.freeze({ y: -.640, radiusX: .238, radiusZ: .230 }),
  Object.freeze({ y: -.360, radiusX: .274, radiusZ: .282 }),
  Object.freeze({ y: .000, radiusX: .277, radiusZ: .292 }),
  Object.freeze({ y: .360, radiusX: .270, radiusZ: .285 }),
  Object.freeze({ y: .640, radiusX: .232, radiusZ: .236 }),
  Object.freeze({ y: .790, radiusX: .132, radiusZ: .128 }),
  Object.freeze({ y: .844, radiusX: .032, radiusZ: .030 }),
]);

const LOW_SEGMENTS = 8;
const LOW_BODY_RINGS: readonly SandbagRing[] = Object.freeze([
  Object.freeze({ y: -.844, radiusX: .035, radiusZ: .032 }),
  Object.freeze({ y: -.750, radiusX: .165, radiusZ: .156 }),
  Object.freeze({ y: -.420, radiusX: .266, radiusZ: .274 }),
  Object.freeze({ y: .050, radiusX: .276, radiusZ: .289 }),
  Object.freeze({ y: .610, radiusX: .225, radiusZ: .230 }),
  Object.freeze({ y: .844, radiusX: .032, radiusZ: .030 }),
]);

function superellipse(value: number): number {
  return Math.sign(value) * Math.sqrt(Math.abs(value));
}

function bodyPoint(ring: SandbagRing, theta: number, profileSeam: boolean): Point3 {
  const sine = Math.sin(theta);
  let crossX = superellipse(Math.cos(theta));
  // Loaded sacks settle against the ground. Compress the lower arc toward a
  // short plane while leaving the upper shoulder softly rounded.
  if (crossX < -.82) crossX = -1 + (crossX + 1) * .18;
  const asymmetricLift = sine * .010;
  const asymmetricDepth = 1 + sine * .030;
  // Low quality cannot afford separate ridge triangles. A narrow crest in its
  // existing cross-section keeps the sewn top line legible for zero topology.
  const seamLift = profileSeam ? Math.pow(Math.max(0, Math.cos(theta)), 8) * .004 : 0;
  return [
    ring.radiusX * crossX + asymmetricLift + seamLift,
    ring.y,
    ring.radiusZ * superellipse(sine) * asymmetricDepth,
  ];
}

function pushVertex(
  positions: number[], normals: number[], uvs: number[],
  position: Point3, normal: Point3, uv: readonly [number, number],
): number {
  const index = positions.length / 3;
  positions.push(...position);
  normals.push(...normal);
  uvs.push(...uv);
  return index;
}

function normalized(vector: THREE.Vector3): Point3 {
  vector.normalize();
  return [vector.x, vector.y, vector.z];
}

function triangleCount(index: THREE.BufferAttribute | null): number {
  return (index?.count ?? 0) / 3;
}

/**
 * Builds one material-independent, indexed sack in the CapsuleGeometry long-Y
 * convention used by the arena. The loaded body and stitched ridge share one
 * BufferGeometry, so integration requires no extra draw. High quality retains
 * the raised ridge; low quality encodes its seam through the profile and UVs.
 */
export function createSandbagGeometry(quality: SandbagGeometryQuality = 'high'): SandbagGeometryResult {
  if (quality !== 'low' && quality !== 'high') throw new RangeError('sandbag quality must be low or high');
  const segments = quality === 'high' ? HIGH_SEGMENTS : LOW_SEGMENTS;
  const bodyRings = quality === 'high' ? HIGH_BODY_RINGS : LOW_BODY_RINGS;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringPoints = bodyRings.map((ring) => Array.from(
    { length: segments },
    (_, segment) => bodyPoint(ring, -Math.PI + segment / segments * Math.PI * 2, quality === 'low'),
  ));
  const height = bodyRings[bodyRings.length - 1].y - bodyRings[0].y;

  // Shared side-ring vertices carry central-difference normals for smooth cloth.
  for (let ringIndex = 0; ringIndex < bodyRings.length; ringIndex++) {
    const previousRing = Math.max(0, ringIndex - 1);
    const nextRing = Math.min(bodyRings.length - 1, ringIndex + 1);
    for (let segment = 0; segment <= segments; segment++) {
      const wrapped = segment % segments;
      const previousSegment = (wrapped + segments - 1) % segments;
      const nextSegment = (wrapped + 1) % segments;
      const current = ringPoints[ringIndex][wrapped];
      const tangentY = new THREE.Vector3().subVectors(
        new THREE.Vector3(...ringPoints[nextRing][wrapped]),
        new THREE.Vector3(...ringPoints[previousRing][wrapped]),
      );
      const tangentAround = new THREE.Vector3().subVectors(
        new THREE.Vector3(...ringPoints[ringIndex][nextSegment]),
        new THREE.Vector3(...ringPoints[ringIndex][previousSegment]),
      );
      const normal = normalized(tangentY.cross(tangentAround));
      pushVertex(
        positions,
        normals,
        uvs,
        current,
        normal,
        [segment / segments, (bodyRings[ringIndex].y - bodyRings[0].y) / height],
      );
    }
  }

  const stride = segments + 1;
  for (let ring = 0; ring < bodyRings.length - 1; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const lowerLeft = ring * stride + segment;
      const lowerRight = lowerLeft + 1;
      const upperLeft = (ring + 1) * stride + segment;
      const upperRight = upperLeft + 1;
      indices.push(lowerLeft, upperLeft, upperRight, lowerLeft, upperRight, lowerRight);
    }
  }

  const addCap = (ringIndex: number, top: boolean): void => {
    const ring = bodyRings[ringIndex];
    const normal = [0, top ? 1 : -1, 0] as const;
    const center = pushVertex(positions, normals, uvs, [0, ring.y, 0], normal, [.5, .5]);
    const perimeter: number[] = [];
    for (let segment = 0; segment <= segments; segment++) {
      const theta = -Math.PI + segment / segments * Math.PI * 2;
      const value = bodyPoint(ring, theta, quality === 'low');
      perimeter.push(pushVertex(
        positions,
        normals,
        uvs,
        value,
        normal,
        [
          THREE.MathUtils.clamp(.5 + value[0] / (ring.radiusX * 2.2), 0, 1),
          THREE.MathUtils.clamp(.5 + value[2] / (ring.radiusZ * 2.2), 0, 1),
        ],
      ));
    }
    for (let segment = 0; segment < segments; segment++) {
      if (top) indices.push(center, perimeter[segment + 1], perimeter[segment]);
      else indices.push(center, perimeter[segment], perimeter[segment + 1]);
    }
  };
  addCap(0, false);
  addCap(bodyRings.length - 1, true);
  const bodyTriangles = indices.length / 3;

  if (quality === 'high') {
    // A triangular stitched ridge follows the upper longitudinal surface. It
    // is baked into this same index/attribute set and stops before the puckers.
    const ridgeRings = bodyRings.slice(1, -1);
    const ridgeStart = positions.length / 3;
    const ridgeStride = 4;
    for (let ringIndex = 0; ringIndex < ridgeRings.length; ringIndex++) {
      const ring = ridgeRings[ringIndex];
      const previous = ridgeRings[Math.max(0, ringIndex - 1)];
      const next = ridgeRings[Math.min(ridgeRings.length - 1, ringIndex + 1)];
      const slope = (next.radiusX - previous.radiusX) / (next.y - previous.y);
      const leftNormal = normalized(new THREE.Vector3(.014, -slope * .014, -.009));
      const rightNormal = normalized(new THREE.Vector3(.014, -slope * .014, .009));
      const baseX = ring.radiusX - .002;
      const apexX = ring.radiusX + .007;
      const v = (ring.y - bodyRings[0].y) / height;
      pushVertex(positions, normals, uvs, [baseX, ring.y, -.014], leftNormal, [.46, v]);
      pushVertex(positions, normals, uvs, [apexX, ring.y, 0], leftNormal, [.50, v]);
      pushVertex(positions, normals, uvs, [apexX, ring.y, 0], rightNormal, [.50, v]);
      pushVertex(positions, normals, uvs, [baseX, ring.y, .014], rightNormal, [.54, v]);
    }
    for (let ring = 0; ring < ridgeRings.length - 1; ring++) {
      const current = ridgeStart + ring * ridgeStride;
      const next = current + ridgeStride;
      indices.push(
        current, next, next + 1, current, next + 1, current + 1,
        current + 2, next + 2, next + 3, current + 2, next + 3, current + 3,
      );
    }
    const addRidgeCap = (ringIndex: number, top: boolean): void => {
      const ring = ridgeRings[ringIndex];
      const normal = [0, top ? 1 : -1, 0] as const;
      const baseX = ring.radiusX - .002;
      const apexX = ring.radiusX + .007;
      const v = (ring.y - bodyRings[0].y) / height;
      const left = pushVertex(positions, normals, uvs, [baseX, ring.y, -.014], normal, [.46, v]);
      const apex = pushVertex(positions, normals, uvs, [apexX, ring.y, 0], normal, [.50, v]);
      const right = pushVertex(positions, normals, uvs, [baseX, ring.y, .014], normal, [.54, v]);
      if (top) indices.push(left, right, apex);
      else indices.push(left, apex, right);
    };
    addRidgeCap(0, false);
    addRidgeCap(ridgeRings.length - 1, true);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = quality === 'high' ? 'LoadedSandbagShell' : 'LoadedSandbagShellLow';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const bounds = geometry.boundingBox!;
  const legacy = SANDBAG_LEGACY_CAPSULE_BOUNDS;
  if (
    bounds.min.x < legacy.min[0] || bounds.min.y < legacy.min[1] || bounds.min.z < legacy.min[2]
    || bounds.max.x > legacy.max[0] || bounds.max.y > legacy.max[1] || bounds.max.z > legacy.max[2]
  ) {
    geometry.dispose();
    throw new RangeError('loaded sandbag shell exceeds the legacy CapsuleGeometry collider bounds');
  }
  const totalTriangles = triangleCount(geometry.index);
  if (
    (quality === 'high' && (totalTriangles < 160 || totalTriangles > 240))
    || (quality === 'low' && totalTriangles > 98)
  ) {
    geometry.dispose();
    throw new RangeError(`loaded sandbag ${quality} shell exceeds its triangle target`);
  }
  const stats = Object.freeze<SandbagGeometryStats>({
    geometries: 1,
    vertices: geometry.getAttribute('position').count,
    triangles: totalTriangles,
    bodyTriangles,
    seamTriangles: totalTriangles - bodyTriangles,
  });
  let disposed = false;
  return Object.freeze({
    geometry,
    stats,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
    },
  });
}
