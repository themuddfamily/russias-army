import * as THREE from 'three';

export const MILITARY_TRANSPORT_SURFACE_ROLE = Object.freeze({
  paint: 0,
  canvas: 1,
  glass: 2,
  metal: 3,
  snow: 4,
  lampWarm: 5,
  lampRed: 6,
} as const);

type SurfaceRole = keyof typeof MILITARY_TRANSPORT_SURFACE_ROLE;
type Point2 = readonly [number, number];
type Point3 = readonly [number, number, number];

export interface MilitaryTransportShellGeometryResult {
  geometry: THREE.BufferGeometry;
  partCount: number;
  triangles: number;
  roleVertexCounts: Readonly<Record<SurfaceRole, number>>;
}

const ROLE_COLORS: Readonly<Record<SurfaceRole, THREE.ColorRepresentation>> = Object.freeze({
  paint: 0x64745f,
  canvas: 0x78816a,
  glass: 0x426a73,
  metal: 0x59635f,
  snow: 0xdce7e4,
  lampWarm: 0xffcf78,
  lampRed: 0xa92d29,
});

const ROLE_NAMES = Object.freeze(Object.keys(MILITARY_TRANSPORT_SURFACE_ROLE) as SurfaceRole[]);
const SHELL_MIN = Object.freeze([-1.33, 0, -3.7] as const);
const SHELL_MAX = Object.freeze([1.33, 2.9, 3.5] as const);
const MAX_SHELL_TRIANGLES = 1_100;

function point(x: number, y: number, z: number): Point3 {
  return [x, y, z];
}

function subtract(a: Point3, b: Point3): Point3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Point3, b: Point3): Point3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function midpoint(points: readonly Point3[]): Point3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const value of points) {
    x += value[0];
    y += value[1];
    z += value[2];
  }
  const inverse = 1 / points.length;
  return [x * inverse, y * inverse, z * inverse];
}

class ShellBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  readonly roles: number[] = [];
  readonly roleVertexCounts: Record<SurfaceRole, number> = {
    paint: 0,
    canvas: 0,
    glass: 0,
    metal: 0,
    snow: 0,
    lampWarm: 0,
    lampRed: 0,
  };
  partCount = 0;

  private activeRole: SurfaceRole = 'paint';
  private activeColor = new THREE.Color(ROLE_COLORS.paint);

  part(role: SurfaceRole, build: () => void): void {
    this.partCount++;
    this.activeRole = role;
    this.activeColor = new THREE.Color(ROLE_COLORS[role]);
    build();
  }

  triangle(a: Point3, b: Point3, c: Point3): void {
    const normal = cross(subtract(b, a), subtract(c, a));
    const length = Math.hypot(normal[0], normal[1], normal[2]);
    if (length <= Number.EPSILON) throw new Error('Military transport shell contains a degenerate triangle.');
    const nx = normal[0] / length;
    const ny = normal[1] / length;
    const nz = normal[2] / length;
    const roleId = MILITARY_TRANSPORT_SURFACE_ROLE[this.activeRole];
    const color = this.activeColor;
    const vertices = [a, b, c] as const;
    const triangleUvs = [[0, 0], [1, 0], [1, 1]] as const;
    for (let index = 0; index < 3; index++) {
      const vertex = vertices[index];
      this.positions.push(vertex[0], vertex[1], vertex[2]);
      this.normals.push(nx, ny, nz);
      this.uvs.push(triangleUvs[index][0], triangleUvs[index][1]);
      this.colors.push(color.r, color.g, color.b);
      this.roles.push(roleId);
      this.roleVertexCounts[this.activeRole]++;
    }
  }

  triangleFacing(a: Point3, b: Point3, c: Point3, desiredNormal: Point3): void {
    const normal = cross(subtract(b, a), subtract(c, a));
    if (dot(normal, desiredNormal) < 0) this.triangle(a, c, b);
    else this.triangle(a, b, c);
  }

  quadFacing(a: Point3, b: Point3, c: Point3, d: Point3, desiredNormal: Point3): void {
    const normal = cross(subtract(b, a), subtract(c, a));
    if (dot(normal, desiredNormal) < 0) {
      this.triangle(a, d, c);
      this.triangle(a, c, b);
    } else {
      this.triangle(a, b, c);
      this.triangle(a, c, d);
    }
  }

  box(
    role: SurfaceRole,
    center: Point3,
    size: Point3,
    rotation: Point3 = [0, 0, 0],
  ): void {
    this.part(role, () => {
      const half = [size[0] * .5, size[1] * .5, size[2] * .5] as const;
      const euler = new THREE.Euler(rotation[0], rotation[1], rotation[2], 'XYZ');
      const vertices: Point3[] = [];
      for (const [x, y, z] of [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
      ] as const) {
        const vertex = new THREE.Vector3(x * half[0], y * half[1], z * half[2]).applyEuler(euler);
        vertices.push([vertex.x + center[0], vertex.y + center[1], vertex.z + center[2]]);
      }
      for (const face of [
        [0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3],
        [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2],
      ] as const) {
        this.triangle(vertices[face[0]], vertices[face[1]], vertices[face[2]]);
        this.triangle(vertices[face[0]], vertices[face[2]], vertices[face[3]]);
      }
    });
  }

  extrudedPolygonXy(role: SurfaceRole, polygon: readonly Point2[], zMin: number, zMax: number): void {
    this.part(role, () => {
      const center2 = midpoint(polygon.map(([x, y]) => point(x, y, 0)));
      const frontCenter = point(center2[0], center2[1], zMin);
      const rearCenter = point(center2[0], center2[1], zMax);
      for (let index = 0; index < polygon.length; index++) {
        const next = (index + 1) % polygon.length;
        const [ax, ay] = polygon[index];
        const [bx, by] = polygon[next];
        const a0 = point(ax, ay, zMin);
        const b0 = point(bx, by, zMin);
        const b1 = point(bx, by, zMax);
        const a1 = point(ax, ay, zMax);
        const outward = point((ax + bx) * .5 - center2[0], (ay + by) * .5 - center2[1], 0);
        this.quadFacing(a0, b0, b1, a1, outward);
        this.triangleFacing(frontCenter, b0, a0, [0, 0, -1]);
        this.triangleFacing(rearCenter, a1, b1, [0, 0, 1]);
      }
    });
  }

  extrudedPolygonXz(role: SurfaceRole, polygon: readonly Point2[], yMin: number, yMax: number): void {
    this.part(role, () => {
      const center2 = midpoint(polygon.map(([x, z]) => point(x, 0, z)));
      const lowerCenter = point(center2[0], yMin, center2[2]);
      const upperCenter = point(center2[0], yMax, center2[2]);
      for (let index = 0; index < polygon.length; index++) {
        const next = (index + 1) % polygon.length;
        const [ax, az] = polygon[index];
        const [bx, bz] = polygon[next];
        const a0 = point(ax, yMin, az);
        const b0 = point(bx, yMin, bz);
        const b1 = point(bx, yMax, bz);
        const a1 = point(ax, yMax, az);
        const outward = point((ax + bx) * .5 - center2[0], 0, (az + bz) * .5 - center2[2]);
        this.quadFacing(a0, b0, b1, a1, outward);
        this.triangleFacing(lowerCenter, a0, b0, [0, -1, 0]);
        this.triangleFacing(upperCenter, b1, a1, [0, 1, 0]);
      }
    });
  }

  taperedCab(): void {
    this.part('paint', () => {
      const vertices: readonly Point3[] = [
        [-1.08, .77, -2.88], [1.08, .77, -2.88], [1.08, .77, -1.30], [-1.08, .77, -1.30],
        [-.93, 2.49, -2.58], [.93, 2.49, -2.58], [.93, 2.49, -1.37], [-.93, 2.49, -1.37],
      ];
      const center = midpoint(vertices);
      for (const face of [
        [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
        [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],
      ] as const) {
        const facePoints = face.map((index) => vertices[index]);
        const faceCenter = midpoint(facePoints);
        this.quadFacing(
          facePoints[0], facePoints[1], facePoints[2], facePoints[3],
          subtract(faceCenter, center),
        );
      }
    });
  }
}

function addSegmentedHoop(builder: ShellBuilder, crossSection: readonly Point2[], z: number): void {
  for (let index = 0; index < crossSection.length - 1; index++) {
    const [ax, ay] = crossSection[index];
    const [bx, by] = crossSection[index + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    builder.box(
      'metal',
      [(ax + bx) * .5, (ay + by) * .5, z],
      [.055, length + .045, .075],
      [0, 0, -Math.atan2(dx, dy)],
    );
  }
}

function addFenderArch(builder: ShellBuilder, x: number): void {
  const arch: readonly Point2[] = [
    [.62, -2.97], [.83, -2.88], [1.00, -2.68], [1.08, -2.42],
    [1.02, -2.15], [.84, -1.93], [.63, -1.84],
  ];
  for (let index = 0; index < arch.length - 1; index++) {
    const [ay, az] = arch[index];
    const [by, bz] = arch[index + 1];
    const dy = by - ay;
    const dz = bz - az;
    const length = Math.hypot(dy, dz);
    builder.box(
      'paint',
      [x, (ay + by) * .5, (az + bz) * .5],
      [.17, length + .055, .10],
      [Math.atan2(dz, dy), 0, 0],
    );
  }
}

/**
 * Creates the high-tier cargo-truck body as one local-space, premerged shell.
 * The geometry owns no material or texture and is ready to be instanced once
 * per transport; wheels remain a separate running-gear batch.
 */
export function createMilitaryTransportShellGeometry(): MilitaryTransportShellGeometryResult {
  const builder = new ShellBuilder();

  // Structural base and cargo deck.
  builder.box('metal', [0, .65, -.02], [2.18, .25, 6.45]);
  builder.box('paint', [0, 1.02, 1.31], [2.42, .20, 3.55]);
  builder.box('paint', [-1.19, 1.20, 1.31], [.10, .40, 3.52]);
  builder.box('paint', [1.19, 1.20, 1.31], [.10, .40, 3.52]);

  // A faceted, bowed tarpaulin cross-section reads as fabric instead of a box.
  const canvasCrossSection: readonly Point2[] = [
    [-1.16, 1.18], [-1.18, 2.22], [-1.02, 2.46], [-.63, 2.65],
    [0, 2.72], [.63, 2.65], [1.02, 2.46], [1.18, 2.22], [1.16, 1.18],
  ];
  builder.extrudedPolygonXy('canvas', canvasCrossSection, -.31, 3.04);
  for (const z of [.02, 1.34, 2.70]) addSegmentedHoop(builder, canvasCrossSection, z);
  for (const x of [-1.205, 1.205]) {
    for (const z of [.48, 1.62, 2.70]) builder.box('metal', [x, 1.82, z], [.045, 1.18, .075]);
  }

  // Tapered cab with a rearward-sloped windscreen and narrowed roofline.
  builder.taperedCab();
  builder.part('glass', () => {
    const desired: Point3 = [0, .18, -1];
    builder.quadFacing([-.82, 1.72, -2.732], [-.045, 1.72, -2.732], [-.045, 2.32, -2.628], [-.77, 2.32, -2.628], desired);
    builder.quadFacing([.045, 1.72, -2.732], [.82, 1.72, -2.732], [.77, 2.32, -2.628], [.045, 2.32, -2.628], desired);
  });
  builder.part('glass', () => {
    builder.quadFacing([-1.036, 1.72, -2.43], [-1.036, 1.72, -1.57], [-.975, 2.30, -1.53], [-.975, 2.30, -2.35], [-1, 0, 0]);
    builder.quadFacing([1.036, 1.72, -1.57], [1.036, 1.72, -2.43], [.975, 2.30, -2.35], [.975, 2.30, -1.53], [1, 0, 0]);
  });
  builder.box('metal', [0, 2.02, -2.684], [.055, .64, .05], [.17, 0, 0]);
  builder.box('paint', [0, 2.53, -1.98], [2.01, .10, 1.35]);
  builder.box('snow', [0, 2.595, -1.98], [1.83, .045, 1.18]);

  // Chamfered bonnet plan, with a thinner matching windward snow cap.
  const bonnet: readonly Point2[] = [
    [-.77, -3.58], [.77, -3.58], [.96, -3.41], [.96, -2.68],
    [.82, -2.55], [-.82, -2.55], [-.96, -2.68], [-.96, -3.41],
  ];
  builder.extrudedPolygonXz('paint', bonnet, .91, 1.53);
  const bonnetSnow = bonnet.map(([x, z]) => [x * .85, z + (z < -3.5 ? .055 : 0)] as const);
  builder.extrudedPolygonXz('snow', bonnetSnow, 1.53, 1.585);
  addFenderArch(builder, -1.125);
  addFenderArch(builder, 1.125);

  // Manufactured detail: steps, mirrors, doors, grille, bumpers and lamps.
  builder.box('metal', [-1.245, .73, -1.92], [.15, .12, .75]);
  builder.box('metal', [1.245, .73, -1.92], [.15, .12, .75]);
  for (const x of [-1.09, 1.09]) {
    builder.box('metal', [x, 1.56, -1.34], [.035, 1.22, .055]);
    builder.box('metal', [x, 1.77, -1.84], [.04, .055, .28]);
  }
  builder.box('metal', [-1.20, 2.23, -2.48], [.20, .04, .04]);
  builder.box('metal', [1.20, 2.23, -2.48], [.20, .04, .04]);
  builder.box('metal', [-1.305, 2.23, -2.48], [.045, .25, .20]);
  builder.box('metal', [1.305, 2.23, -2.48], [.045, .25, .20]);

  builder.box('metal', [0, 1.20, -3.615], [1.72, .56, .055]);
  for (const x of [-.58, -.29, 0, .29, .58]) builder.box('metal', [x, 1.20, -3.652], [.09, .45, .045]);
  builder.box('metal', [0, .75, -3.62], [2.30, .17, .12]);
  builder.box('lampWarm', [-.62, 1.24, -3.655], [.34, .23, .05]);
  builder.box('lampWarm', [.62, 1.24, -3.655], [.34, .23, .05]);

  builder.box('paint', [0, 1.43, 3.095], [2.18, .76, .10]);
  builder.box('metal', [0, 1.43, 3.151], [2.08, .045, .035]);
  for (const x of [-.70, 0, .70]) builder.box('metal', [x, 1.43, 3.151], [.045, .69, .035]);
  builder.box('metal', [0, .74, 3.18], [2.24, .16, .14]);
  builder.box('lampRed', [-.83, 1.07, 3.175], [.27, .21, .055]);
  builder.box('lampRed', [.83, 1.07, 3.175], [.27, .21, .055]);

  const geometry = new THREE.BufferGeometry();
  geometry.name = 'MilitaryTransportHighTierShell';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(builder.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(builder.uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(builder.colors, 3));
  geometry.setAttribute('surfaceRole', new THREE.Uint8BufferAttribute(builder.roles, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const position = geometry.getAttribute('position');
  const triangles = position.count / 3;
  if (!Number.isInteger(triangles) || triangles > MAX_SHELL_TRIANGLES) {
    geometry.dispose();
    throw new RangeError(`military transport shell exceeds ${MAX_SHELL_TRIANGLES} triangles`);
  }
  const bounds = geometry.boundingBox!;
  if (
    bounds.min.x < SHELL_MIN[0] || bounds.min.y < SHELL_MIN[1] || bounds.min.z < SHELL_MIN[2]
    || bounds.max.x > SHELL_MAX[0] || bounds.max.y > SHELL_MAX[1] || bounds.max.z > SHELL_MAX[2]
  ) {
    geometry.dispose();
    throw new RangeError(
      `military transport shell exceeds its authoritative local collider: `
      + `[${bounds.min.toArray().join(', ')}]–[${bounds.max.toArray().join(', ')}]`,
    );
  }

  const roleVertexCounts = Object.freeze(Object.fromEntries(
    ROLE_NAMES.map((role) => [role, builder.roleVertexCounts[role]]),
  ) as Record<SurfaceRole, number>);

  return Object.freeze({
    geometry,
    partCount: builder.partCount,
    triangles,
    roleVertexCounts,
  });
}
