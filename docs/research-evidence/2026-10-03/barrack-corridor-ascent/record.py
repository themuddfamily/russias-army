from pathlib import Path
import hashlib,json
base=Path('docs/research-evidence/2026-10-03/barrack-corridor-ascent')
d=json.loads((base/'replay.json').read_text())
assert d['status']=='completed' and d['callbacks']==282 and d['queries']==5879 and d['spawnQueries']==32
assert d['queries']<=6000 and not d['jumpFired'] and all(not x['intersects'] for x in d['trace'])
assert all(x.get('reached',True) for x in d['segments']) and d['trace'][-1]['supported']
assert d['queries']==sum(d['queryTypes'].values())
source=['public/assets/original-scenes/barrack/scene.json','public/assets/original-scenes/barrack/doors.json','shared/originalMapProfile.ts','shared/originalDoorWorld.ts','shared/originalSceneGeometry.ts','shared/originalPlayerPhysics.ts','shared/originalConvexSweep.ts','shared/originalExplosives.ts','scripts/run-bounded.sh','docs/research-evidence/2026-10-03/barrack-diagonal-bypass/replay.ts','docs/research-evidence/2026-10-03/barrack-route-geometry/inventory.json']
paths=[Path(p) for p in source]+[p for p in base.iterdir() if p.is_file() and p.name not in ['hashes.json','record.log']]
result={str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in paths}
(base/'hashes.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'validated':True,'bindings':len(result),'callbacks':d['callbacks'],'queries':d['queries'],'intersections':0,'finalSupportWitness':d['contactEvents'][-1]['surfaceWitnesses']['b']}))
