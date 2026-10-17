#!/usr/bin/env python3
"""Passively derive grenade convex support from preserved resource vertices.

No Director/Havok code or original action program is executed. SciPy/Qhull
provides an offline triangulation; native hull margins and inertia are unknown.
Run with --check to compare deterministic output without writing any file.
"""
import argparse
import hashlib
from pathlib import Path
import json

import numpy as np
from scipy.spatial import ConvexHull

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/assets/original-weapons/geometry.json'
TARGET = ROOT / 'shared/originalGrenadeShape.ts'
EXPECTED_SHA = '7fb016ef55d032bf329dbfe99cf5904e44f297a57da9d2babff11c6f4f8f9c2b'

RUNTIME = r'''
/** Explicit rigid columns mapping resource axes to world axes. This module
 * never infers pointAt/Euler orientation, angular response or launch roll. */
export interface OriginalGrenadeBasis {readonly x:Readonly<Vec3>;readonly y:Readonly<Vec3>;readonly z:Readonly<Vec3>}
export interface OriginalGrenadePose {readonly pivot:Readonly<Vec3>;readonly basis:OriginalGrenadeBasis}
const finite=(v:Readonly<Vec3>)=>[v.x,v.y,v.z].every(Number.isFinite);
const dot=(a:Readonly<Vec3>,b:Readonly<Vec3>)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:Readonly<Vec3>,b:Readonly<Vec3>):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function requireBasis(b:OriginalGrenadeBasis):void {
 if(!finite(b.x)||!finite(b.y)||!finite(b.z)
  ||Math.abs(dot(b.x,b.x)-1)>1e-8||Math.abs(dot(b.y,b.y)-1)>1e-8||Math.abs(dot(b.z,b.z)-1)>1e-8
  ||Math.abs(dot(b.x,b.y))>1e-8||Math.abs(dot(b.x,b.z))>1e-8||Math.abs(dot(b.y,b.z))>1e-8
  ||Math.abs(dot(cross(b.x,b.y),b.z)-1)>1e-8)throw Error('Invalid original grenade rigid orientation');
}
function requirePose(p:OriginalGrenadePose):void {if(!finite(p.pivot))throw Error('Invalid original grenade pivot');requireBasis(p.basis);}
function rotate(v:Readonly<Vec3>,b:OriginalGrenadeBasis):Vec3 {
 return {x:v.x*b.x.x+v.y*b.y.x+v.z*b.z.x,y:v.x*b.x.y+v.y*b.y.y+v.z*b.z.y,z:v.x*b.x.z+v.y*b.y.z+v.z*b.z.z};
}
function transformed(v:Readonly<Vec3>,p:OriginalGrenadePose):Vec3 {
 const r=rotate(v,p.basis),s=ORIGINAL_MAP_SCALE;return {x:p.pivot.x+r.x*s,y:p.pivot.y+r.y*s,z:p.pivot.z+r.z*s};
}
export function originalGrenadeWorldVertices(p:OriginalGrenadePose):Vec3[] {requirePose(p);return ORIGINAL_GRENADE_SOURCE_POINTS.map(v=>transformed(v,p));}
export function originalGrenadeSupport(p:OriginalGrenadePose,direction:Readonly<Vec3>):{point:Vec3;sourceIndex:number} {
 requirePose(p);const length=Math.hypot(direction.x,direction.y,direction.z);
 if(!finite(direction)||length===0||!Number.isFinite(length))throw Error('Invalid original grenade support direction');
 const unit={x:direction.x/length,y:direction.y/length,z:direction.z/length};
 const local={x:dot(p.basis.x,unit),y:dot(p.basis.y,unit),z:dot(p.basis.z,unit)};
 let sourceIndex=0,projection=-Infinity;
 ORIGINAL_GRENADE_SOURCE_POINTS.forEach((v,i)=>{const value=dot(v,local);if(value>projection){sourceIndex=i;projection=value;}});
 return {point:transformed(ORIGINAL_GRENADE_SOURCE_POINTS[sourceIndex],p),sourceIndex};
}
export function originalGrenadeWorldBounds(p:OriginalGrenadePose):{min:Vec3;max:Vec3} {
 const points=originalGrenadeWorldVertices(p),min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
 for(const v of points)for(const axis of ['x','y','z'] as const){min[axis]=Math.min(min[axis],v[axis]);max[axis]=Math.max(max[axis],v[axis]);}
 return {min,max};
}
/** Bound about the unchanged resource pivot, for broad phase only. */
export const ORIGINAL_GRENADE_PIVOT_BOUND=Math.max(...ORIGINAL_GRENADE_SOURCE_POINTS.map(v=>Math.hypot(v.x,v.y,v.z)))*ORIGINAL_MAP_SCALE;
export function originalGrenadeWorldConvex(p:OriginalGrenadePose):OriginalConvexPolytope {
 requirePose(p);const frozen=(values:Vec3[])=>Object.freeze(values.map(v=>Object.freeze(v)));
 return Object.freeze({vertices:frozen(ORIGINAL_GRENADE_SOURCE_POINTS.map(v=>transformed(v,p))),faces:ORIGINAL_GRENADE_SOURCE_FACES,
  faceNormals:frozen(ORIGINAL_GRENADE_SOURCE_FACE_NORMALS.map(v=>rotate(v,p.basis))),edgeDirections:frozen(ORIGINAL_GRENADE_SOURCE_EDGE_DIRECTIONS.map(v=>rotate(v,p.basis)))});
}
/** Oriented offsets; sweep callers add the physical pivot exactly once. */
export function originalGrenadeConvex(basis:OriginalGrenadeBasis):OriginalConvexPolytope {return originalGrenadeWorldConvex({pivot:{x:0,y:0,z:0},basis});}
'''


def generate():
    raw = SOURCE.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == EXPECTED_SHA
    data = json.loads(raw)
    meshes = [m for m in data['meshes'] if m['resource'] == 'rg6grenade']
    assert len(meshes) == 1 and len(meshes[0]['positions']) == 129
    node = next(n for n in data['nodes'] if n.get('resource') == 'rg6grenade')
    assert node['parent'] == 'World'
    assert node['matrix'] == [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
    points = np.array(sorted(set(tuple(p) for p in meshes[0]['positions'])))
    assert len(points) == 75
    hull = ConvexHull(points)
    center = points.mean(axis=0)
    faces = []
    for face in hull.simplices:
        a, b, c = map(int, face)
        normal = np.cross(points[b] - points[a], points[c] - points[a])
        if np.dot(normal, center - points[a]) > 0:
            b, c = c, b
        face = [a, b, c]
        start = face.index(min(face))
        faces.append(tuple(face[start:] + face[:start]))
    faces.sort()
    normals = []
    edges = set()
    for a, b, c in faces:
        n = np.cross(points[b] - points[a], points[c] - points[a])
        n /= np.linalg.norm(n)
        assert np.max((points - points[a]) @ n) < 1e-7
        normals.append(n)
        for pair in [(a, b), (b, c), (c, a)]:
            edges.add(tuple(sorted(pair)))
    directions = []
    for a, b in sorted(edges):
        edge = points[b] - points[a]
        directions.append(edge / np.linalg.norm(edge))
    assert len(hull.vertices) == 41 and len(faces) == 78 and len(edges) == 117
    lines = ["// Generated passively by scripts/research/extract-original-grenade-hull.py.",
             "import type {Vec3} from './protocol';", "import type {OriginalConvexPolytope} from './originalConvexSweep';",
             "import {ORIGINAL_MAP_SCALE} from './originalMapProfile';", '',
             '/** All75 unique recovered resource points retain the original pivot. Offline',
             ' * Qhull triangulation supplies complete translation-only SAT axes. Native',
             ' * Havok hull generation, margins, inertia and rotation remain unproved. */',
             f"export const ORIGINAL_GRENADE_GEOMETRY_SHA256='{EXPECTED_SHA}';"]
    for name, values in [('POINTS', points), ('FACE_NORMALS', normals), ('EDGE_DIRECTIONS', directions)]:
        lines.append(f'export const ORIGINAL_GRENADE_SOURCE_{name}:ReadonlyArray<Readonly<Vec3>>=Object.freeze([')
        for x, y, z in values:
            lines.append(f' Object.freeze({{x:{float(x)!r},y:{float(y)!r},z:{float(z)!r}}}),')
        lines.append(']);')
    lines.append('export const ORIGINAL_GRENADE_SOURCE_FACES:ReadonlyArray<readonly [number,number,number]>=Object.freeze([')
    lines.extend(f' Object.freeze([{a},{b},{c}] as const),' for a, b, c in faces)
    lines.append(']);')
    return ('\n'.join(lines) + '\n' + RUNTIME).encode()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    generated = generate()
    if args.check:
        assert TARGET.read_bytes() == generated, 'Generated grenade hull is stale'
    else:
        TARGET.write_bytes(generated)
    print(json.dumps(dict(verified=True,check=args.check,points=75,hullVertices=41,faces=78,edges=117,sha256=hashlib.sha256(generated).hexdigest())))
