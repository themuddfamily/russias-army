#!/usr/bin/env python3
"""Passive finite triangle-edge / UV boundary inventory; no image matching or fits."""
from pathlib import Path
from collections import defaultdict, Counter
import hashlib, json, math
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research-evidence/2026-10-02/interior-source-junctions'
def rec(p):
 return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def distance(a,b): return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))
def main():
 scene=ROOT/'public/assets/original-scenes/woodland/scene.json'
 planespath=ROOT/'docs/research-evidence/2026-10-01/woodland-11s-shed-training-homographies.json'
 s=json.loads(scene.read_text()); planes=json.loads(planespath.read_text())['sourcePlanes']
 mesh=next(m for m in s['meshes'] if m['resource']=='woodenshed' and m['part']==0)
 node=next(n for n in s['nodes'] if n['name']=='woodenshed')
 assert node['parent'].lower()=='world' and node['matrix'][:12]==[1.,0.,0.,0.,0.,1.,0.,0.,0.,0.,1.,0.]
 positions=mesh['positions']; uv=mesh['tex_coords'][0]; representatives=[]; groups=[]
 # Consolidate duplicated source vertices without replacing any exact coordinates.
 for p in positions:
  matches=[i for i,q in enumerate(representatives) if distance(p,q)<.002]
  assert len(matches)<=1
  if not matches: matches=[len(representatives)]; representatives.append(p)
  groups.append(matches[0])
 def world(p):
  q=[p[i]+node['matrix'][12+i] for i in range(3)]
  return [q[0]*1.72/85,q[2]*1.72/85,-q[1]*1.72/85]
 faceplane={f:i for i,p in enumerate(planes) for f in p['faces']}
 kinds={i:('wall' if abs(p['normal'][2])<.02 else 'sloped-plane' if .02<=abs(p['normal'][2])<.99 else 'horizontal-plane') for i,p in enumerate(planes)}
 edges=defaultdict(list)
 for f,vs in enumerate(mesh['faces']):
  for a,b in [(vs[0],vs[1]),(vs[1],vs[2]),(vs[2],vs[0])]:
   if groups[a]==groups[b]: continue
   if groups[a]>groups[b]: a,b=b,a
   edges[(groups[a],groups[b])].append({'face':f,'planeId':faceplane.get(f),'planeKind':kinds[faceplane[f]] if f in faceplane else 'degenerate-unassigned','vertexPair':[a,b], 'positions':[positions[a],positions[b]],'worldPositions':[world(positions[a]),world(positions[b])],'uv':[uv[a],uv[b]]})
 records=[]
 for key,bindings in sorted(edges.items()):
  vertices=[p for b in bindings for p in b['positions']]; component='A' if sum(p[1] for p in vertices)/len(vertices)>1000 else 'B'
  ids=sorted(set(b['planeId'] for b in bindings if b['planeId'] is not None)); kk=set(kinds[i] for i in ids)
  roofwall='wall' in kk and 'sloped-plane' in kk
  wallwall=len([i for i in ids if kinds[i]=='wall'])>=2 and any(abs(sum(x*y for x,y in zip(planes[i]['normal'],planes[j]['normal'])))<.98 for i in ids for j in ids if kinds[i]==kinds[j]=='wall')
  uvdelta=max([0]+[max(distance(a['uv'][e],b['uv'][e]) for e in [0,1]) for a in bindings for b in bindings])
  geomdelta=max([0]+[max(distance(a['positions'][e],b['positions'][e]) for e in [0,1]) for a in bindings for b in bindings])
  records.append({'id':f'{component}-edge-{key[0]}-{key[1]}','component':component,'groupedEndpointIds':list(key),'finiteLengthSource':distance(*bindings[0]['positions']),'planeIds':ids,'roofWallCandidate':roofwall,'touchesHistoricallyCompatibleInteriorWallPlane':bool(set(ids).intersection({'A':{8,12,25},'B':{10,14,26}}[component])),'nonparallelWallWallCandidate':wallwall,'uvSeamAtRawEndpointTolerance1eMinus6':uvdelta>1e-6,'maxRawUvEndpointDisagreement':uvdelta,'maxExactPositionEndpointDisagreementSource':geomdelta,'incidenceCount':len(bindings),'bindings':bindings})
 refs=[ROOT/'docs/research-evidence/2026-09-30/woodland-video-11s.jpg',ROOT/'docs/research-evidence/2026-10-02/interior-approach-textures/woodland-video-12s.jpg', ROOT/'docs/research-evidence/2026-10-02/woodland-11s-interior-semantic-audit.json']
 data={'generator':rec(Path(__file__)),'inputs':[rec(p) for p in [scene,planespath]+refs],'originalRuntimeExecuted':False,'cameraFitAttempted':False,'imageMatchingExecuted':False,'componentAssignment':'Source-only separated clusters: local Y > 1000 labels A, otherwise B; no image assigns a component.','method':{'duplicateVertexGroupingDistanceSource':.002,'grouping':'Only full finite triangle edges with near-identical endpoints; exact binding positions remain unchanged. No inferred infinite intersection or partial collinear overlap.', 'planeClassification':'Existing hashed source plane normals: abs(nZ)<.02 wall; .02<=abs(nZ)<.99 sloped; otherwise horizontal. These are orientation classes, not accepted roof semantics.','uvComparison':'Raw decoded first UV channel at both grouped endpoints; no wrapping or native raster assumption.','worldAdapter':'Exact source node matrix, then [x,z,-y]*1.72/85'},'sourcePlanes':[{ 'id':i,**p,'orientationClass':kinds[i]} for i,p in enumerate(planes)],'edges':records,'counts':{'sourceFaces':len(mesh['faces']),'sourceVertices':len(positions),'facesAbsentFromHistoricalPlaneInventory':[f for f in range(len(mesh['faces'])) if f not in faceplane],'endpointGroups':len(representatives),'allFiniteEdgeGroups':len(records),'perComponent':{c:{'all':sum(e['component']==c for e in records),'roofWallCandidates':sum(e['component']==c and e['roofWallCandidate'] for e in records),'nonparallelWallWallCandidates':sum(e['component']==c and e['nonparallelWallWallCandidate'] for e in records),'roofWallTouchingHistoricalInteriorCandidates':sum(e['component']==c and e['roofWallCandidate'] and e['touchesHistoricallyCompatibleInteriorWallPlane'] for e in records),'rawUvSeams':sum(e['component']==c and e['uvSeamAtRawEndpointTolerance1eMinus6'] for e in records)} for c in ['A','B']}},'imageObservationRoles':[{'reference':'12s','family':'apparent back/side wall and roof/wall transitions','role':'exploratory candidate only; excluded from fit and heldout','acceptedSourceBinding':None},{'reference':'11s','family':'historical conservative back/left/right wall regions','role':'retrospective semantic diagnostic; historical descriptor roles unchanged; not new blind heldout','acceptedSourceBinding':None},{'reference':'11s/12s','family':'timber rails, roof bright mark, photographic beams/stains','role':'appearance only; excluded from physical boundary constraints','acceptedSourceBinding':None}],'fitObservations':[],'heldoutObservations':[],'limits':['Triangle topology contains duplicate vertices and near-equal decoded coordinates; grouping tolerance is explicit and exact bindings retained.','Full-edge inventory can miss T-junctions or partial overlapping edges; unpaired edges are not proof of a geometric hole.','A wall/sloped plane incidence is a source candidate, not proof the image displays it or that it is an interior roof boundary.','UV discontinuity need not yield a visible boundary; a texture line can exist without a mesh edge.','No camera, component image assignment, native lighting or V12/V14 acceptance established.']}
 OUT.mkdir(exist_ok=True); target=OUT/'source-junction-inventory.json';target.write_text(json.dumps(data,indent=2)+'\n'); print(json.dumps({'output':str(target.relative_to(ROOT)),'counts':data['counts']}))
if __name__=='__main__': main()
