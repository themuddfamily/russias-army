import json
from pathlib import Path
base=Path('docs/research-evidence/2026-10-03/barrack-support-route')
j=json.loads(Path('docs/research-evidence/2026-10-03/barrack-stair-gap-inventory/inventory.json').read_text())
r=json.loads((base/'replay.json').read_text())
points=[{'name':'room-start','x':50.7,'y':10.74582918772978,'z':64.24},{'name':'central-sill','x':49.6,'y':10.817072639016544,'z':64.24}]
for result in r['results']:
 p=result['trace'][-1]['position'];points.append({'name':f"exterior-final-jump-{result['jumpEnabled']}",'x':p['x'],'y':result['endSupport'],'z':p['z']})
for p in points:
 p['supportTriangleWitnesses']=[]
 for f in j['faces']:
  if f['normal']['y']<.99: continue
  a,b,c=f['points'];den=(b['z']-c['z'])*(a['x']-c['x'])+(c['x']-b['x'])*(a['z']-c['z'])
  if abs(den)<1e-10:continue
  u=((b['z']-c['z'])*(p['x']-c['x'])+(c['x']-b['x'])*(p['z']-c['z']))/den
  v=((c['z']-a['z'])*(p['x']-c['x'])+(a['x']-c['x'])*(p['z']-c['z']))/den
  w=1-u-v
  if min(u,v,w)>=-1e-8 and abs(u*a['y']+v*b['y']+w*c['y']-p['y'])<1e-6:
   p['supportTriangleWitnesses'].append({'id':f['id'],'barycentric':[u,v,w],'points':f['points'],'normal':f['normal']})
 if not p['supportTriangleWitnesses']:raise RuntimeError(f'Missing triangle for {p}')
(base/'support-witnesses.json').write_text(json.dumps({'scope':'Exact XZ projected barycentric membership of named support points at their stated height; not filled component bounds or entire trajectory support proof. No source geometry queries.', 'points':points},indent=2)+'\n')
print([(p['name'],[f['id'] for f in p['supportTriangleWitnesses']]) for p in points])
