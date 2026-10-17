import hashlib
import json
from pathlib import Path

base = Path('docs/research-evidence/2026-10-03/barrack-diagonal-bypass')
r = json.loads((base / 'replay.json').read_text())
assert r['status'] == 'completed'
assert r['callbacks'] == 157 and r['queries'] == 3357 and r['spawnQueries'] == 32
assert all(s['reached'] for s in r['segments']) and not r['jumpFired']
assert len(r['trace']) == 157 and not any(t['intersects'] for t in r['trace'])
assert not any(t['triggered'] for t in r['trace'])
assert all(abs(t['normal']['y']) > .99 for t in r['contactEvents'])
assert all(not t.get('jump', False) for t in r['trace'])
source = ['shared/originalMapProfile.ts', 'shared/originalPlayerPhysics.ts',
          'shared/originalDoorWorld.ts', 'shared/originalSceneGeometry.ts',
          'shared/originalExplosives.ts', 'public/assets/original-scenes/barrack/scene.json',
          'public/assets/original-scenes/barrack/doors.json']
files = sorted(p for p in base.iterdir() if p.is_file() and p.name not in ['hashes.json', 'record.log'])
files += [Path(p) for p in source]
hashes = {}
for p in files:
    with p.open('rb') as f:
        hashes[str(p)] = hashlib.file_digest(f, 'sha256').hexdigest()
prior = json.loads(Path('docs/research-evidence/2026-10-03/barrack-spawn3-south-route/hashes.json').read_text())
assert all(hashes[p] == prior[p] for p in source)
(base / 'hashes.json').write_text(json.dumps(hashes, indent=2) + '\n')
print(json.dumps({'passed': True, 'bindings': len(hashes), 'observations': len(r['trace']), 'contactEvents': len(r['contactEvents'])}))
