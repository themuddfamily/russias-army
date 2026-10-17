#!/usr/bin/env python3
"""Independent heldout-only roof SIFT checks, using passive images/geometry.

Restrict the source atlas to the roof-window neighborhood before matching.
The wider descriptor ratio allowance is explicit; do not treat a single feature
as conclusive camera validation. No camera or projection is read by this script.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import cv2
import numpy as np


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


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
    atlas = cv2.imread(str(atlas_path), 0)
    reference = cv2.imread(str(args.reference), 0)
    sift = cv2.SIFT_create(nfeatures=12000, contrastThreshold=.002, edgeThreshold=20)
    ka, da = sift.detectAndCompute(atlas, None)
    kb, db = sift.detectAndCompute(reference, None)
    reverse = {m.queryIdx: m.trainIdx for m in cv2.BFMatcher().match(db, da)}
    uv = np.array(mesh['tex_coords'][0])
    uv = np.column_stack((uv[:, 0] + .5, .5 - uv[:, 1])) * 512 - .5
    landmarks = []
    ambiguous = []
    for best, second in cv2.BFMatcher().knnMatch(da, db, k=2):
        q = np.array(ka[best.queryIdx].pt)
        if not (70 <= q[0] <= 100 and 385 <= q[1] <= 420):
            continue
        if best.distance >= .8 * second.distance or reverse.get(best.trainIdx) != best.queryIdx:
            continue
        hits = []
        for index, face in enumerate(mesh['faces']):
            t = uv[face]; matrix = np.column_stack((t[1] - t[0], t[2] - t[0]))
            if abs(np.linalg.det(matrix)) < 1e-8:
                continue
            b = np.linalg.solve(matrix, q - t[0]); weights = np.r_[1-sum(b), b]
            if min(weights) >= -1e-8:
                hits.append((index, weights))
        if len(hits) != 1:
            ambiguous.append({'atlasPixel': q.tolist(), 'matchingUvFaces': [x[0] for x in hits]})
            continue
        index, weights = hits[0]
        landmarks.append({'id': f'roof-sift-{q[0]:.3f}-{q[1]:.3f}',
            'node': 'stonebarn', 'part': 0, 'face': index,
            'barycentric': weights.tolist(), 'atlasPixel': q.tolist(),
            'pixel': list(kb[best.trainIdx].pt), 'role': 'heldout', 'uncertaintyPixels': 2,
            'descriptorDistance': float(best.distance),
            'descriptorRatio': float(best.distance / second.distance),
            'reciprocalNearestDescriptor': True,
            'sourceLocalPoint': (weights @ np.array(mesh['positions'])[mesh['faces'][index]]).tolist()})
    data = {'scene': str(scene_path), 'sceneSha256': digest(scene_path),
        'reference': str(args.reference), 'referenceSha256': digest(args.reference),
        'atlas': str(atlas_path), 'atlasSha256': digest(atlas_path),
        'generator': 'scripts/research/match-reference-roof-landmarks.py',
        'generatorSha256': digest(__file__), 'imageSize': [reference.shape[1], reference.shape[0]],
        'scale': 1.72/85, 'verticalFovDegrees': 50, 'landmarks': landmarks,
        'method': {'detector': 'OpenCV SIFT', 'opencvVersion': cv2.__version__,
            'nfeatures': 12000, 'contrastThreshold': .002, 'edgeThreshold': 20,
            'ratioThreshold': .8, 'reciprocalNearest': True,
            'atlasPatchPixels': [70,385,100,420],
            'uvPixelConvention': '(u+.5,.5-v)*512-.5',
            'faceSelection': 'Exactly one containing UV triangle over the entire mesh',
            'roleRule': 'Every new roof feature is heldout; none may enter pose fitting',
            'geometricOutlierSelection': 'None'},
        'ambiguousUvMatches': ambiguous,
        'limitations': ['The .8 ratio is weaker than the facade matcher .7 threshold.',
            'One independently matched roof feature cannot establish camera equivalence alone.',
            'Source UV adapter is assumed, not newly established as native Director convention.',
            'No camera, projection, manual pixel labels, or camera residual is read by this script.',
            'Do not refit the facade pose or select a camera hypothesis using these heldout checks.']}
    args.output.write_text(json.dumps(data, indent=2)+'\n')
    svg = args.output.with_suffix('.svg'); href = os.path.relpath(args.reference, svg.parent)
    marks = ''.join(f'<circle cx="{x["pixel"][0]}" cy="{x["pixel"][1]}" r="5" stroke="#ff00ff" fill="none"/>' for x in landmarks)
    svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{reference.shape[1]}" height="{reference.shape[0]}"><image href="{href}" width="100%" height="100%"/>{marks}</svg>\n')
    print(json.dumps({'output': str(args.output), 'heldoutCount': len(landmarks), 'landmarks': landmarks}))


if __name__ == '__main__':
    main()
