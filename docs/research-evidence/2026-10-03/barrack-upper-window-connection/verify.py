import json,hashlib
from pathlib import Path
b=Path('docs/research-evidence/2026-10-03/barrack-upper-window-connection')
d=json.loads((b/'replay.json').read_text());old=json.loads(Path('docs/research-evidence/2026-10-03/barrack-corridor-ascent/replay.json').read_text());i=json.loads((b/'inspection.json').read_text())
assert d['trace'][:282]==old['trace']
assert [c for c in d['contactEvents'] if c['callback']<282]==old['contactEvents']
assert d['segments'][:7]==old['segments']
assert d['status']=='completed' and not d['jumpFired'] and d['callbacks']==373
assert not any(t['intersects'] for t in d['trace'])
assert not any(t.get('triggered') for t in d['trace'])
assert d['queries']+i['queries']==7766<=8000
inventory=json.loads(Path('docs/research-evidence/2026-10-03/barrack-stair-gap-inventory/inventory.json').read_text())
faces=[f for f in inventory['faces'] if f['id'] in ['bigredfellaopen/0/7','bigredfellaopen/0/8']]
witness=next(c for c in d['contactEvents'] if c['callback']>=360 and c['normal']['x']<-.5)
p=witness['surfaceWitnesses']['b'];t=next(t for t in i['triangles'] if t['index']==1522)
assert faces[0]['points']==[t['a'],t['b'],t['c']]
v=[t['a'],t['b'],t['c']];n=t['normal']
assert abs(sum((p[k]-v[0][k])*n[k] for k in 'xyz'))<1e-6
for j,a in enumerate(v):
 z=v[(j+1)%3];u=[z[k]-a[k] for k in 'xyz'];q=[p[k]-a[k] for k in 'xyz'];c=[u[1]*q[2]-u[2]*q[1],u[2]*q[0]-u[0]*q[2],u[0]*q[1]-u[1]*q[0]]
 assert sum(c[j]*n[k] for j,k in enumerate('xyz'))>=-1e-6
out={'scope':'Offline verification of existing observations; no additional player geometry query or physics replay','prefixJSONEqual':True,'callbacks':373,'totalPublicQueries':7766,'startupIncluded':True,'intersections':0,'sourceDoorTriggers':0,'jump':False,'authoredEntryRamp':faces,'rampContact':witness,'finalAirborneSample':d['trace'][-1],'floorSettlingProved':False}
(b/'verification.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k not in ['authoredEntryRamp','rampContact']}))
