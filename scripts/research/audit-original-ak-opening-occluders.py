#!/usr/bin/env python3
"""Passive exact finite triangle source-X opening-line and projected aperture audit."""
from pathlib import Path
import hashlib,json
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'docs/research-evidence/2026-10-03/ak-opening-occluders'
def rec(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def cross2(a,b):return float(a[0]*b[1]-a[1]*b[0])
def main():
 manifold=ROOT/'docs/research-evidence/2026-10-03/ak-sight-manifold/sight-manifold.json';topology=ROOT/'docs/research-evidence/2026-10-03/ak-front-sight-topology/front-sight-topology.json';a=json.loads(manifold.read_text());d=json.loads(topology.read_text())
 assert rec(topology)['sha256']==a['inputs'][0]['sha256']
 pos=np.array(d['mesh']['positions']);faces=d['mesh']['faces'];exact=next(m for m in d['topologyModels']if m['id']=='exact-coordinate');comps=exact['globalFaceConnectedComponents'];fc={f:i for i,fs in enumerate(comps)for f in fs};sight=next(i for i,fs in enumerate(comps)if set(fs)==set(a['componentFaceIds']));center=np.array(a['sourceGeometry']['boundsCenter']);origin=center.copy();origin[0]=min(pos[:,0])-1
 # Full infinite X line: project triangles onto YZ. Handle parallel triangles by closest projected distance.
 records=[]
 for f,vs in enumerate(faces):
  tri=pos[vs];t=tri[:,1:];q=center[1:];w=t[1]-t[0];v=t[2]-t[0];det=cross2(w,v); signs=[cross2(t[(i+1)%3]-t[i],q-t[i])for i in range(3)]
  inside=abs(det)>1e-14 and (all(x>=-1e-12 for x in signs)or all(x<=1e-12 for x in signs))
  distances=[]
  for i in range(3):
   start=t[i];edge=t[(i+1)%3]-start;den=float(np.dot(edge,edge));fraction=max(0,min(1,float(np.dot(q-start,edge))/den))if den else 0;distances.append(float(np.linalg.norm(q-start-fraction*edge)))
  clearance=0. if inside else min(distances);hit=None
  if inside:
   y=cross2(q-t[0],v)/det;z=cross2(w,q-t[0])/det;bary=np.array([1-y-z,y,z]);point=bary@tri;hit={'sourcePoint':point.tolist(),'barycentric':bary.tolist(),'distanceFromOriginSource':float(point[0]-origin[0])}
  records.append({'faceId':f,'componentId':fc[f],'sightComponent':fc[f]==sight,'vertexIds':vs,'exactTrianglePositions':tri.tolist(),'rawUvs':[d['mesh']['firstUvChannel'][v]for v in vs],'minimumDistanceToInfiniteXLineSource':clearance,'pointIntersectionDiagnostic':hit,'projectedDegenerateTriangle':abs(det)<=1e-14,'candidateApertureDiskOverlap':clearance<a['sourceGeometry']['boundsCenterAxisRayProbes'][0]['projectedClearanceDiagnostic']['minimumDistanceToInfiniteAxisLineSource'],'conditionalCopyMapping':'[sourceY,sourceZ,sourceX] before unknown translation; source X becomes camera-local depth. No perspective/viewpoint occlusion accepted.'})
 probes=[]
 crown=next(c for c in d['sourceCoordinateCandidates']if c['id']=='front_sight_crown')
 for g in crown['exactCoordinateGroups']:
  group=exact['groups'][g];point=pos[group['vertexIds'][0]];hits=[]
  for f,vs in enumerate(faces):
   tri=pos[vs];t=tri[:,1:];q=point[1:];w=t[1]-t[0];v=t[2]-t[0];det=cross2(w,v)
   if abs(det)<=1e-14:continue
   y=cross2(q-t[0],v)/det;z=cross2(w,q-t[0])/det;bary=np.array([1-y-z,y,z])
   if min(bary)<-1e-9:continue
   p=bary@tri;hits.append({'faceId':f,'componentId':fc[f],'sourcePoint':p.tolist(),'barycentric':bary.tolist(),'deltaXFromTipSource':float(p[0]-point[0])})
  probes.append({'exactCoordinateGroup':g,'rawVertexIds':group['vertexIds'],'sourceTipCandidate':point.tolist(),'parallelXLineIntersections':sorted(hits,key=lambda h:h['sourcePoint'][0]),'role':'Conditional axis-only finite tip probe; source gate does not identify a pixel tip.'})
 hits=[r for r in records if r['pointIntersectionDiagnostic'] is not None];nearest=min(records,key=lambda r:r['minimumDistanceToInfiniteXLineSource']);radius=a['sourceGeometry']['boundsCenterAxisRayProbes'][0]['projectedClearanceDiagnostic']['minimumDistanceToInfiniteAxisLineSource']
 result={'generator':rec(Path(__file__)),'inputs':[rec(manifold),rec(topology)],'originalRuntimeExecuted':False,'cameraFitAttempted':False,'rendererExecuted':False,'line':{'originSource':origin.tolist(),'direction':[1,0,0],'throughPointSource':center.tolist(),'scope':'Entire infinite source-X line, every one of 359 AK finite triangles; both X direction orders retained.'},'candidateDiskRadiusSource':radius,'componentDefinitions':[{'componentId':i,'faceIds':fs,'sight':i==sight}for i,fs in enumerate(comps)],'triangleDiagnostics':records,'centralLinePointHitsSortedByX':sorted([{'faceId':r['faceId'],'componentId':r['componentId'],**r['pointIntersectionDiagnostic']}for r in hits],key=lambda h:h['sourcePoint'][0]),'fullMeshMinimumProjectedClearance':{'faceId':nearest['faceId'],'componentId':nearest['componentId'],'distanceSource':nearest['minimumDistanceToInfiniteXLineSource']},'crownAxisProbes':probes,'projectionHypotheses':d['projectionHypotheses'],'fitObservations':[],'heldoutObservations':[],'limits':['Source-X probes are parallel orthographic direction diagnostics; a finite perspective eye/gun translation is unknown.','Projected disk overlap is a candidate blocker, not proven occlusion; depth order relative to an eye is unassigned.','Projected degenerate triangles use segment-distance clearance; exact coplanar intersection cannot be inferred from a missing nondegenerate point hit alone.','Floating-point tests use explicit small sign allowances but no outward certified error interval.','Raw seam IDs, unused vertices and UVs are retained in hashed input; no native welding is claimed.','Native Euler, near clipping, bob/recoil/load phase, aspect/crop, silhouette and pixel correspondence remain unknown.']}
 OUT.mkdir(parents=True,exist_ok=True);p=OUT/'all-component-opening-lines.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'path':str(p.relative_to(ROOT)),'centralHits':result['centralLinePointHitsSortedByX'],'fullMeshMinimumProjectedClearance':result['fullMeshMinimumProjectedClearance'],'diskOverlapFaceCount':sum(r['candidateApertureDiskOverlap']for r in records),'otherDiskOverlapFaceCount':sum(r['candidateApertureDiskOverlap']and not r['sightComponent']for r in records),'crownProbeHits':[{'group':r['exactCoordinateGroup'],'hits':len(r['parallelXLineIntersections']),'otherComponentHits':sum(h['componentId']!=sight for h in r['parallelXLineIntersections'])}for r in probes]}))
if __name__=='__main__':main()
