#!/usr/bin/env python3
"""Passive exact-coordinate combinatorial manifold and opening diagnostics."""
from pathlib import Path
from collections import defaultdict,deque
import hashlib,json
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'docs/research-evidence/2026-10-03/ak-sight-manifold'
def rec(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def main():
 source=ROOT/'docs/research-evidence/2026-10-03/ak-front-sight-topology/front-sight-topology.json';d=json.loads(source.read_text());model=next(m for m in d['topologyModels']if m['id']=='exact-coordinate');comp=next(c for c in model['globalComponentDiagnostics']if c['touchesSelectedRegion']);fs=comp['faceIds'];positions=np.array(d['mesh']['positions']);rawfaces=d['mesh']['faces']
 gid={v:g['id']for g in model['groups']for v in g['vertexIds']};coords={g['id']:positions[g['vertexIds'][0]]for g in model['groups']};tris={f:[gid[v]for v in rawfaces[f]]for f in fs};vertices=sorted({v for t in tris.values()for v in t});edges=defaultdict(list)
 for f,t in tris.items():
  for a,b in zip(t,t[1:]+t[:1]):edges[tuple(sorted((a,b)))].append({'face':f,'direction':1 if a<b else -1})
 links=[]
 for v in vertices:
  adj=defaultdict(list);lf=[]
  for f,t in tris.items():
   if v in t:
    pair=[x for x in t if x!=v];assert len(pair)==2
    a,b=pair;adj[a].append(b);adj[b].append(a);lf.append({'face':f,'oppositeEdge':pair})
  seen=set();queue=[next(iter(adj))]
  while queue:
   a=queue.pop()
   if a in seen:continue
   seen.add(a);queue+=adj[a]
  links.append({'vertexGroup':v,'sourcePoint':coords[v].tolist(),'rawVertexIds':next(g['vertexIds']for g in model['groups']if g['id']==v),'linkBindings':lf,'linkDegrees':{str(a):len(bs)for a,bs in adj.items()},'connected':len(seen)==len(adj),'singleCycle':len(seen)==len(adj)and all(len(bs)==2 for bs in adj.values())})
 adjacency=defaultdict(list)
 for e,bs in edges.items():
  assert len(bs)==2
  a,b=bs;relation=-a['direction']*b['direction'];adjacency[a['face']].append((b['face'],relation));adjacency[b['face']].append((a['face'],relation))
 signs={fs[0]:1};queue=[fs[0]];conflicts=[]
 while queue:
  f=queue.pop()
  for g,r in adjacency[f]:
   proposed=signs[f]*r
   if g in signs:
    if signs[g]!=proposed:conflicts.append([f,g])
   else:signs[g]=proposed;queue.append(g)
 chi=len(vertices)-len(edges)+len(fs);closed=all(len(b)==2 for b in edges.values());manifold=closed and all(l['singleCycle']for l in links);orientable=not conflicts and len(signs)==len(fs)
 points=np.array([coords[v]for v in vertices]);ranges=np.ptp(points,axis=0);axis=int(np.argmin(ranges));direction=np.eye(3)[axis];center=(np.min(points,axis=0)+np.max(points,axis=0))/2
 # Ray candidates through the full finite component, source axes only. These are probes, not aperture proof.
 def rayhit(origin,direction,t):
  e1=t[1]-t[0];e2=t[2]-t[0];h=np.cross(direction,e2);det=float(np.dot(e1,h))
  if abs(det)<1e-12:return None
  inv=1/det;q=origin-t[0];u=float(np.dot(q,h))*inv
  if u< -1e-9 or u>1+1e-9:return None
  cross=np.cross(q,e1);v=float(np.dot(direction,cross))*inv
  if v< -1e-9 or u+v>1+1e-9:return None
  distance=float(np.dot(e2,cross))*inv
  return distance if distance>=0 else None
 def projectedClearance(point,axis):
  dims=[i for i in range(3)if i!=axis];q=point[dims];results=[]
  for f in fs:
   t=positions[rawfaces[f]][:,dims];distances=[]
   cross2=lambda a,b:float(a[0]*b[1]-a[1]*b[0])
   area=cross2(t[1]-t[0],t[2]-t[0])
   signs=[cross2(t[(i+1)%3]-t[i],q-t[i])for i in range(3)]
   if abs(area)>1e-14 and (all(v>=-1e-14 for v in signs)or all(v<=1e-14 for v in signs)):distance=0.
   else:
    for i in range(3):
     a=t[i];b=t[(i+1)%3];w=b-a;den=float(np.dot(w,w));u=max(0,min(1,float(np.dot(q-a,w))/den))if den else 0
     distances.append(float(np.linalg.norm(q-a-u*w)))
    distance=min(distances)
   results.append((distance,f))
  distance,f=min(results);return {'minimumDistanceToInfiniteAxisLineSource':distance,'nearestTriangle':f,'finiteCylinderRadiusStrictlyBelowSource':distance,'scope':'Exact triangle component only; all other weapon components excluded. Floating-point calculation with no outward error interval.'}
 probes=[]
 for ax in range(3):
  direction=np.eye(3)[ax];origin=center-direction*(ranges[ax]+1)
  hits=[{'face':f,'distanceSource':h}for f in fs if (h:=rayhit(origin,direction,positions[rawfaces[f]]))is not None]
  probes.append({'axis':['X','Y','Z'][ax],'origin':origin.tolist(),'direction':direction.tolist(),'hits':hits,'noTriangleIntersection':not hits,'projectedClearanceDiagnostic':projectedClearance(center,ax)})
 result={'generator':rec(Path(__file__)),'inputs':[rec(source)],'originalRuntimeExecuted':False,'cameraFitAttempted':False,'rendererExecuted':False,'groupingAssumption':'Exact coordinate duplicates identified combinatorially; all raw seams/IDs/UVs remain in hashed source evidence. No native welding is asserted.','componentFaceIds':fs,'vertexLinks':links,'edgeIncidences':[{'groups':list(e),'bindings':bs}for e,bs in sorted(edges.items())],'orientability':{'faceOrientationSigns':{str(f):v for f,v in signs.items()},'conflicts':conflicts,'orientable':orientable},'topology':{'vertices':len(vertices),'edges':len(edges),'faces':len(fs),'eulerCharacteristic':chi,'closed':closed,'vertexManifold':manifold,'connected':len(signs)==len(fs),'genusConditional':int((2-chi)/2)if manifold and orientable else None},'sourceGeometry':{'componentBounds':np.array([np.min(points,axis=0),np.max(points,axis=0)]).tolist(),'axisRanges':ranges.tolist(),'boundsCenter':center.tolist(),'minimumExtentAxis':['X','Y','Z'][axis],'boundsCenterAxisRayProbes':probes,'openingDirectionCandidate':'Source X at bounding-box center, if its positive clearance diagnostic survives validation; minimum bounding extent is not the opening direction.','interpretation':'Axis probes through bounding-box center are finite ray tests, not an interval-certified clearance bound, complete aperture region, self-intersection test or embedding proof.'},'projectionHypotheses':d['projectionHypotheses'],'fitObservations':[],'heldoutObservations':[],'limits':['A combinatorial closed orientable genus-one component does not alone prove a non-self-intersecting embedded physical tunnel.','Global self-intersection/embedding and native sidedness/culling have not been checked.','A no-hit source ray is only an exact tested line at this pose-free component, not a camera-visible opening; the projected clearance remains floating-point diagnostic only.','Native Euler, near clipping, gun translation/bob/recoil, aspect/crop and image landmark identity remain unknown.']}
 OUT.mkdir(parents=True,exist_ok=True);p=OUT/'sight-manifold.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'path':str(p.relative_to(ROOT)),'topology':result['topology'],'orientable':orientable,'sourceGeometry':result['sourceGeometry']}))
if __name__=='__main__':main()
