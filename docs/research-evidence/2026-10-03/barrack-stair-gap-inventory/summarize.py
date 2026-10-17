import hashlib
import json
from pathlib import Path

base = Path('docs/research-evidence/2026-10-03/barrack-stair-gap-inventory')
inventory = json.loads((base / 'inventory.json').read_text())
underside = json.loads((base / 'replay.json').read_text())
sill = json.loads((base / 'sill-replay.json').read_text())
faces = {face['id']: face for face in inventory['faces']}
groups = {group['id']: group for group in inventory['groups']}
orientation = []
for pair in inventory['stairPairs']:
    normals = [[faces[name]['normal']['y'] for name in groups[key]['faces']]
               for key in [pair['a'], pair['b']]]
    orientation.append({**pair, 'normalYRanges': [[min(v), max(v)] for v in normals],
                        'allFacesUpward': all(min(v) > .5 for v in normals),
                        'allFacesStrictlyHorizontalUpward': all(min(v) > .999999 for v in normals)})

def result_summary(result):
    return {key: result[key] for key in ['status', 'jumps', 'intersections', 'initialSupport']} | {
        'jumpControlEnabled': result['jump'], 'callbacks': len(result['trace']),
        'finalPosition': result['trace'][-1]['position']}

summary = {
    'schema': 'barrack-stair-gap-inventory/v1',
    'requirement': 'V10', 'acceptance': 'open', 'productionChanged': False,
    'scope': 'Recovered fixed-scene transformed triangles, horizontal components, restricted axis-aligned step necessary conditions, one strip counterexample, two explicit shared-physics candidate replays. No historical/native equivalence or arbitrary stair/gap completeness.',
    'sceneNodes': inventory['sceneNodes'], 'sceneMeshes': inventory['sceneMeshes'],
    'transformedFaces': inventory['transformedFaceCount'], 'horizontalFaces': inventory['horizontalFaceCount'],
    'horizontalComponents': len(groups), 'analyticalPairs': inventory['analyticalPairs'],
    'candidatePairs': orientation,
    'undersideReplay': [result_summary(r) for r in underside['results']],
    'sillReplay': [result_summary(r) for r in sill['results']],
    'sillInteriorClearance': [check for check in sill['supportChecks'] if check['x'] == 4.5],
    'strip': {'commonX': inventory['strip']['commonX'], 'separation': inventory['strip']['separation'],
              'finiteSharedWidth': inventory['strip']['commonX'][1] - inventory['strip']['commonX'][0],
              'distinctLanes': len(set(check['from']['x'] for check in inventory['strip']['checks'])),
              'sweepCount': len(inventory['strip']['checks']),
              'blockedCount': sum(check['hit'] is not None for check in inventory['strip']['checks'])},
    'totalCountedSourceQueries': inventory['explicitQueries'] + underside['queries'] + sill['queries'],
    'queryCeiling': 5000,
    'conclusion': 'No traversable stair or clear supported jump gap established. The low-level apparent stair is a downward underside; the upward single sill is clearance-limited and both control replays remain blocked.'
}
(base / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
paths = sorted(path for path in base.iterdir() if path.is_file() and path.name not in ['hashes.json', 'final-hashes.json', 'summary.log'])
paths += [Path(name) for name in ['public/assets/original-scenes/barrack/scene.json', 'shared/originalSceneGeometry.ts', 'shared/originalMapProfile.ts', 'shared/originalPlayerPhysics.ts', 'shared/originalExplosives.ts']]
(base / 'final-hashes.json').write_text(json.dumps({str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}, indent=2) + '\n')
print(json.dumps({'sourceQueries': summary['totalCountedSourceQueries'], 'strictlyUpwardPairs': sum(p['allFacesStrictlyHorizontalUpward'] for p in orientation), 'bindings': len(paths), 'conclusion': summary['conclusion']}))
