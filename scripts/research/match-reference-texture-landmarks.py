#!/usr/bin/env python3
"""Passive atlas-to-recording SIFT correspondences; never runs original code.

Face selection uses only atlas UV containment, never a fitted camera. Roles
are a deterministic atlas-coordinate hash fixed before reference matching.
All eligible matches are emitted, including potential descriptor false matches.
"""
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def role(point):
    key = f'{round(point[0])},{round(point[1])}'
    return 'heldout' if int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 3 == 0 else 'fit'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    scene_path = Path('public/assets/original-scenes/woodland/scene.json')
    atlas_path = Path('public/assets/original-scenes/woodland/textures/stonebarn.png')
    scene = json.loads(scene_path.read_text())
    mesh = next(m for m in scene['meshes'] if m['resource'] == 'stonebarn' and m['part'] == 0)
    atlas = cv2.imread(str(atlas_path), cv2.IMREAD_GRAYSCALE)
    reference = cv2.imread(str(args.reference), cv2.IMREAD_GRAYSCALE)
    if atlas is None or reference is None:
        raise ValueError('Unreadable input image')
    h, w = atlas.shape
    uvs = np.array(mesh['tex_coords'][0], dtype=float)
    # OpenCV pixel centers start at zero. UV texel-center coordinates therefore
    # equal (pixel + .5)/dimension, not pixel/dimension.
    atlas_uv_pixels = np.column_stack((uvs[:, 0] + .5, .5 - uvs[:, 1])) * [w, h] - .5
    positions = np.array(mesh['positions'], dtype=float)
    sift = cv2.SIFT_create(nfeatures=4000, contrastThreshold=.01)
    atlas_keys, atlas_descriptors = sift.detectAndCompute(atlas, None)
    atlas_roles = [role(key.pt) for key in atlas_keys]
    reference_keys, reference_descriptors = sift.detectAndCompute(reference, None)
    if atlas_descriptors is None or reference_descriptors is None:
        raise ValueError('No SIFT descriptors')
    matches = cv2.BFMatcher().knnMatch(atlas_descriptors, reference_descriptors, k=2)
    reverse = {m.queryIdx: m.trainIdx for m in cv2.BFMatcher().match(reference_descriptors, atlas_descriptors)}
    candidates = []
    ambiguous = []
    outside = 0
    for best, second in matches:
        if best.distance >= .7 * second.distance or reverse.get(best.trainIdx) != best.queryIdx:
            continue
        q = np.array(atlas_keys[best.queryIdx].pt)
        # The bottom-left exterior facade atlas patch is selected from the
        # source image before camera fitting. Exclude other repeated surfaces.
        if not (0 <= q[0] <= 250 and 435 <= q[1] <= 511):
            outside += 1
            continue
        hits = []
        for face_index, face in enumerate(mesh['faces']):
            triangle = atlas_uv_pixels[face]
            matrix = np.column_stack((triangle[1] - triangle[0], triangle[2] - triangle[0]))
            if abs(np.linalg.det(matrix)) < 1e-8:
                continue
            weights2 = np.linalg.solve(matrix, q - triangle[0])
            weights = np.r_[1 - sum(weights2), weights2]
            if min(weights) >= -1e-8:
                hits.append((face_index, weights))
        if len(hits) != 1:
            ambiguous.append({'atlasPixel': q.tolist(), 'matchingUvFaces': [x[0] for x in hits]})
            continue
        face_index, weights = hits[0]
        candidates.append({
            'id': f'sift-atlas-{q[0]:.3f}-{q[1]:.3f}',
            'node': 'stonebarn', 'part': 0, 'face': face_index,
            'barycentric': weights.tolist(), 'atlasPixel': q.tolist(),
            'pixel': list(reference_keys[best.trainIdx].pt), 'role': atlas_roles[best.queryIdx],
            'uncertaintyPixels': 2,
            'descriptorDistance': float(best.distance),
            'descriptorRatio': float(best.distance / second.distance),
            'reciprocalNearestDescriptor': True,
            'sourceLocalPoint': (weights @ positions[mesh['faces'][face_index]]).tolist(),
        })
    # SIFT may emit two orientation descriptors at one physical location.
    # Retain strongest descriptor match; this selection never consults a pose.
    unique = {}
    for item in candidates:
        key = tuple(round(p, 3) for p in item['atlasPixel'])
        if key not in unique or item['descriptorDistance'] < unique[key]['descriptorDistance']:
            unique[key] = item
    landmarks = sorted(unique.values(), key=lambda x: tuple(x['atlasPixel']))
    local_points = np.array([x['sourceLocalPoint'] for x in landmarks])
    singular_values = np.linalg.svd(local_points - local_points.mean(axis=0), compute_uv=False).tolist() if len(landmarks) else []
    data = {
        'scene': str(scene_path), 'sceneSha256': digest(scene_path),
        'reference': str(args.reference), 'referenceSha256': digest(args.reference),
        'atlas': str(atlas_path), 'atlasSha256': digest(atlas_path),
        'generator': 'scripts/research/match-reference-texture-landmarks.py',
        'generatorSha256': digest(__file__),
        'imageSize': [int(reference.shape[1]), int(reference.shape[0])],
        'scale': 1.72 / 85, 'verticalFovDegrees': 50,
        'landmarks': landmarks,
        'method': {'detector': 'OpenCV SIFT', 'opencvVersion': cv2.__version__,
            'nfeatures': 4000, 'contrastThreshold': .01, 'ratioThreshold': .7,
            'reciprocalNearest': True, 'atlasPatchPixels': [0, 435, 250, 511],
            'roleRule': 'SHA256 of rounded atlas x,y: first eight hex digits modulo three zero means heldout',
            'uvPixelConvention': '(u+.5, .5-v) * (width,height) - .5',
            'faceSelection': 'Exactly one containing UV triangle across the entire source mesh',
            'geometricOutlierSelection': 'None; all eligible descriptor matches retained',
            'uncertaintyPixels': 'Fixed two pixel measurement allowance; not increased after pose fitting'},
        'counts': {'fit': sum(x['role'] == 'fit' for x in landmarks),
            'heldout': sum(x['role'] == 'heldout' for x in landmarks),
            'outsideSelectedAtlasPatch': outside, 'ambiguousUvMatches': len(ambiguous)},
        'ambiguousUvMatches': ambiguous,
        'localPointCenteredSingularValues': singular_values,
        'limitations': [
            'Descriptor correspondence is evidence, not proof of raster or camera equivalence.',
            'These features occupy one nearly planar facade. Camera depth and capture intrinsics can remain ambiguous.',
            'No camera, manual corner annotation, or camera residual influences feature or face selection.',
            'The current renderer UV adapter is assumed; native Director UV convention is not newly proved.',
            'No heldout feature is used to choose a homography, camera solution, or inlier set.'],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, indent=2) + '\n')
    svg = args.output.with_suffix('.svg')
    shapes = []
    for item in landmarks:
        x, y = item['pixel']; color = '#00ffff' if item['role'] == 'fit' else '#ff00ff'
        shapes.append(f'<circle cx="{x:.3f}" cy="{y:.3f}" r="4" stroke="{color}" fill="none"/><text x="{x+5:.3f}" y="{y-5:.3f}" fill="{color}" font-size="11">{item["face"]}/{item["role"]}</text>')
    import os
    href = os.path.relpath(args.reference, svg.parent)
    svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{reference.shape[1]}" height="{reference.shape[0]}" viewBox="0 0 {reference.shape[1]} {reference.shape[0]}"><image href="{href}" width="100%" height="100%"/>{"".join(shapes)}</svg>\n')
    print(json.dumps({'output': str(args.output), 'counts': data['counts'], 'localPointCenteredSingularValues': singular_values}))


if __name__ == '__main__':
    main()
