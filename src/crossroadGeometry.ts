import * as THREE from 'three';

interface QuadBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Creates a flat, plus-shaped road without the coplanar overlap produced by
 * crossing two full planes. One UV unit corresponds to one road width, and
 * every quad samples the same world-aligned UV space.
 */
export function createCrossroadGeometry(length = 145, width = 13): THREE.BufferGeometry {
  validateDimensions(length, width);

  const halfLength = length * .5;
  const halfWidth = width * .5;
  const quads: readonly QuadBounds[] = [
    { minX: -halfWidth, maxX: halfWidth, minZ: -halfWidth, maxZ: halfWidth },
    { minX: -halfLength, maxX: -halfWidth, minZ: -halfWidth, maxZ: halfWidth },
    { minX: halfWidth, maxX: halfLength, minZ: -halfWidth, maxZ: halfWidth },
    { minX: -halfWidth, maxX: halfWidth, minZ: -halfLength, maxZ: -halfWidth },
    { minX: -halfWidth, maxX: halfWidth, minZ: halfWidth, maxZ: halfLength },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const quad of quads) {
    const vertexOffset = positions.length / 3;
    addVertex(quad.minX, quad.minZ, width, positions, normals, uvs);
    addVertex(quad.maxX, quad.minZ, width, positions, normals, uvs);
    addVertex(quad.maxX, quad.maxZ, width, positions, normals, uvs);
    addVertex(quad.minX, quad.maxZ, width, positions, normals, uvs);

    // Winding is counter-clockwise when viewed from above (+Y).
    indices.push(
      vertexOffset, vertexOffset + 2, vertexOffset + 1,
      vertexOffset, vertexOffset + 3, vertexOffset + 2,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'crossroad-plus-geometry';
  geometry.userData.roadArea = 2 * length * width - width * width;
  geometry.userData.quadCount = quads.length;
  return geometry;
}

function validateDimensions(length: number, width: number): void {
  if (!Number.isFinite(length)) throw new Error('Crossroad length must be finite.');
  if (!Number.isFinite(width)) throw new Error('Crossroad width must be finite.');
  if (length <= 0) throw new Error('Crossroad length must be greater than zero.');
  if (width <= 0) throw new Error('Crossroad width must be greater than zero.');
  if (length <= width) throw new Error('Crossroad length must be greater than its width.');
}

function addVertex(
  x: number,
  z: number,
  width: number,
  positions: number[],
  normals: number[],
  uvs: number[],
): void {
  positions.push(x, 0, z);
  normals.push(0, 1, 0);
  uvs.push(x / width, z / width);
}
