#!/usr/bin/env python3
"""Cheap passive semantic/UV audit of retained interior correspondences.

No matching, fitting, rasterization, original runtime or browser execution.
Keep every historical descriptor match and report the remaining source planes.
"""
from pathlib import Path
import hashlib, json, math
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/research-evidence/2026-10-02/woodland-11s-interior-semantic-audit.json'
MATCH = ROOT / 'docs/research-evidence/2026-10-01/woodland-11s-shed-texture-ambiguity.json'
PLANES = ROOT / 'docs/research-evidence/2026-10-01/woodland-11s-shed-training-homographies.json'
FIT = ROOT / 'artifacts/fidelity-review/2026-10-01/current/woodland-11s-shed-training-plane-camera-fit.json'


def record(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def main():
    matches = json.loads(MATCH.read_text())
    planes = json.loads(PLANES.read_text())
    fit = json.loads(FIT.read_text())
    sources = [ROOT / matches[key] for key in ['scene','atlas','reference']]
    for key, path in zip(['scene','atlas','reference'], sources):
        if record(path)['sha256'] != matches[key + 'Sha256']:
            raise ValueError('Historical source changed: ' + key)
    if planes['inputSha256'] != record(MATCH)['sha256'] or fit['sceneSha256'] != record(sources[0])['sha256']:
        raise ValueError('Historical evidence dependencies differ')
    scene = json.loads(sources[0].read_text())
    mesh = next(m for m in scene['meshes'] if m['resource'] == 'woodenshed' and m['part'] == 0)
    # Conservative regions drawn from visible wall/corner/rifle boundaries.
    # Exploratory annotation only, not fresh blind heldout validation.
    regions = [
        ('visible-back-wall', [235,90,710,370]),
        ('visible-left-wall', [0,110,195,455]),
        ('visible-right-wall', [775,110,1100,320]),
    ]
    result_regions = []
    assigned = set()
    for name, (x0,y0,x1,y1) in regions:
        indices = [i for i,m in enumerate(matches['descriptorMatches']) if x0 < m['pixel'][0] < x1 and y0 < m['pixel'][1] < y1]
        assigned.update(indices)
        training = [i for i in indices if matches['descriptorMatches'][i]['role'] == 'fit']
        heldout = [i for i in indices if matches['descriptorMatches'][i]['role'] == 'heldout']
        common = set(range(len(planes['sourcePlanes'])))
        for i in training:
            faces = {c['face'] for c in matches['descriptorMatches'][i]['sourceCandidates']}
            common &= {p for p,plane in enumerate(planes['sourcePlanes']) if faces.intersection(plane['faces'])}
        candidates = []
        for p in sorted(common):
            plane = planes['sourcePlanes'][p]
            vertices = [mesh['positions'][v] for f in plane['faces'] for v in mesh['faces'][f]]
            candidates.append({'planeId': p, **plane, 'localBounds': [[min(v[d] for v in vertices),max(v[d] for v in vertices)] for d in range(3)]})
        result_regions.append({'name': name, 'rectanglePixels': [x0,y0,x1,y1], 'descriptorMatchIndices': indices, 'trainingCount': len(training), 'heldoutCount': len(heldout), 'trainingCompatibleSourcePlanes': candidates})
    with Image.open(sources[1]) as image:
        alpha = image.getchannel('A').getextrema()
        bright = image.getpixel((380,338))
    if alpha != (255,255):
        raise ValueError('Unexpected atlas alpha')
    data = {
        'originalRuntimeExecuted': False, 'newCameraFitAttempted': False,
        'generator': record(Path(__file__)), 'inputs': [record(p) for p in [MATCH,PLANES,FIT]+sources],
        'adjacentExteriorReference': record(ROOT / 'docs/research-evidence/2026-09-30/woodland-video-10s.jpg'),
        'referenceSize': matches['imageSize'], 'historicalCounts': matches['counts'],
        'semanticAnnotationStatus': 'Retrospective exploratory image-only regions; not fresh blind validation. No camera/residual determines a region boundary or face assignment.',
        'regions': result_regions,
        'unassignedDescriptorMatchIndices': [i for i in range(len(matches['descriptorMatches'])) if i not in assigned],
        'allHistoricalMatchesRetained': True,
        'atlasEvidence': {'dimensions': [512,512], 'alphaRange': list(alpha), 'brightPhotographicRoofSpot': {'atlasPixel': [380,338], 'rgba': list(bright), 'interpretation': 'Opaque baked image feature; it cannot alone identify a geometric roof hole or native illumination.'}},
        'historicalDiagnosticFit': {'fitRmsPixels': fit['fitRmsPixels'], 'heldoutRmsPixels': fit['heldoutRmsPixels'], 'heldoutMaxPixels': fit['heldoutMaxPixels'], 'status': fit['status'], 'retainedUnchanged': True},
        'conclusion': 'The visible back-wall patch retains six compatible source planes across two spatially separate shed components. Image-only wall selection does not supply unique 3D correspondences. Historical all-heldout candidate remains rejected; no registered interior camera is established.',
        'nextEvidence': ['Recover unique exterior/doorway/terrain correspondences from the preserved10s approach before assigning the11s interior to a source component.', 'Use distinct source wall boundaries plus independently identified noncoplanar geometry, or a separate unused interior frame, to check a proposed pose.', 'Keep texture-photograph rail/corner/roof-spot identity separate from actual mesh geometry and native lighting.'],
        'limits': ['Repeated atlas pixels can map to multiple walls and two separate source components.', 'Only retained descriptor matches are audited; no new descriptor matching or geometric camera fit ran.', 'A training homography establishes neither semantic room identity nor visibility.', 'Posthoc semantic regions cannot convert the failed historical heldout camera check into blind validation.', 'Source UV convention, FOV/crop/raster, native shader and native lighting remain qualified.', 'V12 and V14 remain open at their full scope.'],
    }
    OUT.write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps({'output': str(OUT.relative_to(ROOT)), 'regions': [{ 'name':r['name'],'training':r['trainingCount'],'heldout':r['heldoutCount'],'compatiblePlanes':len(r['trainingCompatibleSourcePlanes'])} for r in result_regions], 'allHistoricalMatchesRetained': True}))


if __name__ == '__main__':
    main()
