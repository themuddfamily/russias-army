#!/usr/bin/env python3
"""Passive bounded finite edge overlap diagnostic; never modifies geometry."""
from pathlib import Path
from collections import Counter
import hashlib,json,math
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research-evidence/2026-10-02/interior-source-overlaps'
def record(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def sub(a,b):return [x-y for x,y in zip(a,b)]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def norm(a):return math.sqrt(dot(a,a))
def point(a,u,t):return [x+t*y for x,y in zip(a,u)]
def main():
 old=ROOT/'docs/research-evidence/2026-10-02/interior-source-junctions/source-junction-inventory.json';d=json.loads(old.read_text())
 scene=ROOT/'public/assets/original-scenes/woodland/scene.json';s=json.loads(scene.read_text());m=next(x for x in s['meshes'] if x['resource']=='woodenshed' and x['part']==0)
 assert hashlib.sha256(scene.read_bytes()).hexdigest()==next(r['sha256'] for r in d['inputs'] if r['path']==str(scene.relative_to(ROOT)))
 # Every directed binding survives; pairs are evaluated once, including degenerate face62 edges.
 edges=[]
 for g in d['edges']:
  for b in g['bindings']:
   a,z=b['positions'];length=norm(sub(z,a))
   if length>0:edges.append({'id':f"face-{b['face']}-vertices-{b['vertexPair'][0]}-{b['vertexPair'][1]}",'oldEdgeGroup':g['id'],'component':g['component'],**b,'lengthSource':length})
 records=[];tested=Counter()
 # 0.002 matches the earlier duplicate-vertex diagnostic, not a coordinate edit.
 allowances=[.00001,.0001,.001,.002]
 for i,a in enumerate(edges):
  av=a['positions'];u=[x/a['lengthSource'] for x in sub(av[1],av[0])]
  for b in edges[i+1:]:
   if a['face']==b['face'] or a['component']!=b['component']:continue
   tested[a['component']]+=1
   bv=b['positions'];v=[x/b['lengthSource'] for x in sub(bv[1],bv[0])]
   parallelError=norm([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]])
   # Endpoint distance to the other infinite line handles long edges; no angular-only admission.
   ts=[dot(sub(p,av[0]),u) for p in bv]; lo=max(0,min(ts));hi=min(a['lengthSource'],max(ts))
   if hi-lo<=1e-6:continue
   distA=max(norm(sub(p,point(av[0],u,t))) for p,t in zip(bv,ts))
   bs=[dot(sub(p,bv[0]),v) for p in av]
   distB=max(norm(sub(p,point(bv[0],v,t))) for p,t in zip(av,bs))
   if max(distA,distB)>.002:continue
   def interpolated(edge,p):
    start,end=edge['positions'];w=sub(end,start);t=dot(sub(p,start),w)/dot(w,w)
    return {'fraction':t,'sourcePoint':point(start,w,t),'uv':[x+t*(y-x) for x,y in zip(*edge['uv'])],'worldPoint':[x+t*(y-x) for x,y in zip(*edge['worldPositions'])]}
   endpoints=[point(av[0],u,lo),point(av[0],u,hi)]; pa=[interpolated(a,p) for p in endpoints];pb=[interpolated(b,p) for p in endpoints]
   kinds={a['planeKind'],b['planeKind']}; wallroof='wall'in kinds and 'sloped-plane'in kinds
   comp=a['component']; compatible={ 'A':{8,12,25},'B':{10,14,26}}[comp]
   exactfull=a['oldEdgeGroup']==b['oldEdgeGroup']
   records.append({'id':f"overlap-{len(records)}",'component':comp,'bindingIds':[a['id'],b['id']],'triangleIds':[a['face'],b['face']],'planeIds':[a['planeId'],b['planeId']],'planeKinds':[a['planeKind'],b['planeKind']], 'finiteOverlapLengthSource':hi-lo,'overlapLengthExceedsMaximumDistanceAllowance':hi-lo>.002,'lengthInterpretation':'substantial finite overlap' if hi-lo>.002 else 'numerical endpoint sliver; not accepted as finite boundary support','endpointDistanceToOppositeInfiniteLineSource':[distA,distB],'directionCrossNorm':parallelError,'acceptedAtDistanceAllowancesSource':[x for x in allowances if max(distA,distB)<=x],'alreadyGroupedFullEdge':exactfull,'wallSlopedCandidate':wallroof,'touchesHistoricalInteriorCompatibleWall':bool(compatible.intersection({a['planeId'],b['planeId']})),'bindingAInterpolatedOverlap':pa,'bindingBInterpolatedOverlap':pb,'maxInterpolatedEndpointDisagreementSource':max(norm(sub(x['sourcePoint'],y['sourcePoint']))for x,y in zip(pa,pb)),'maxRawUvOverlapEndpointDisagreement':max(norm(sub(x['uv'],y['uv']))for x,y in zip(pa,pb))})
 data={'generator':record(Path(__file__)),'inputs':[record(old),record(scene)],'originalRuntimeExecuted':False,'cameraFitAttempted':False,'rendererExecuted':False,'method':{'distanceAllowancesSource':allowances,'maximumEndpointDistanceSource':.002,'minimumPositiveOverlapSource':1e-6,'pairSelection':'Every distinct-face same-component edge pair; both endpoints on each opposite infinite line within distance allowance, projected finite intervals overlap positively.','coordinateStatus':'All 196 original faces and exact endpoint/UV/world bindings unchanged. Interpolated diagnostics are derived points, not replacement geometry or accepted image correspondences.','limitations':['Only near-collinear edge-edge incidences; no edge-in-face or general triangle intersection test.','Zero-length touch is excluded; positive T-junction subdivision overlaps retained.','Tolerance can admit nearly parallel separate surfaces; admission is diagnostic, not native welded topology.']},'sourceFaces':m['faces'],'sourcePositions':m['positions'],'sourceFirstUvChannel':m['tex_coords'][0],'bindings':edges,'overlaps':records,'counts':{'faces':len(m['faces']),'bindings':len(edges),'testedSameComponentDistinctFacePairs':dict(tested),'perComponent':{c:{'allOverlaps':sum(r['component']==c for r in records),'newPartialOrUngrouped':sum(r['component']==c and not r['alreadyGroupedFullEdge'] for r in records),'wallSloped':sum(r['component']==c and r['wallSlopedCandidate'] for r in records),'newSubstantialOverlap':sum(r['component']==c and not r['alreadyGroupedFullEdge'] and r['overlapLengthExceedsMaximumDistanceAllowance'] for r in records),'newWallSloped':sum(r['component']==c and r['wallSlopedCandidate'] and not r['alreadyGroupedFullEdge'] for r in records),'newWallSlopedTouchingHistoricalInterior':sum(r['component']==c and r['wallSlopedCandidate'] and not r['alreadyGroupedFullEdge'] and r['touchesHistoricalInteriorCompatibleWall'] for r in records)}for c in ['A','B']}},'imageAssignment':None,'fitObservations':[],'heldoutObservations':[],'conclusion':'Finite source overlap alternatives retained for both components; no image line, finite endpoint, component label, camera or native lighting established.'}
 OUT.mkdir(exist_ok=True);p=OUT/'finite-edge-overlaps.json';p.write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({'path':str(p.relative_to(ROOT)),'counts':data['counts']}))
if __name__=='__main__':main()
