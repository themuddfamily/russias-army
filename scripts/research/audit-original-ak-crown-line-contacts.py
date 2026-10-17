#!/usr/bin/env python3
"""Passive finite source-X line/triangle contacts, including coplanar triangles."""
from pathlib import Path
import hashlib,json,math
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'docs/research-evidence/2026-10-03/ak-crown-line-contacts'
def rec(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def cross(a,b):return float(a[0]*b[1]-a[1]*b[0])
def main():
 source=ROOT/'docs/research-evidence/2026-10-03/ak-front-sight-topology/front-sight-topology.json';d=json.loads(source.read_text());m=next(m for m in d['topologyModels']if m['id']=='exact-coordinate');pos=np.array(d['mesh']['positions']);faces=d['mesh']['faces'];uv=np.array(d['mesh']['firstUvChannel']);fc={f:i for i,fs in enumerate(m['globalFaceConnectedComponents'])for f in fs};sight=next(i for i,fs in enumerate(m['globalFaceConnectedComponents'])if set(fs).intersection(d['selectedRegionFaceIds']));crown=next(c for c in d['sourceCoordinateCandidates']if c['id']=='front_sight_crown');probes=[]
 for gid in crown['exactCoordinateGroups']:
  group=next(g for g in m['groups']if g['id']==gid);tip=pos[group['vertexIds'][0]];q=tip[1:];variants=[]
  for tol in [0.,1e-8,1e-6]:
   contacts=[]
   for f,vs in enumerate(faces):
    t=pos[vs];p=t[:,1:];a=p[1]-p[0];b=p[2]-p[0];det=cross(a,b);bindings=[]
    if abs(det)>1e-14:
     y=cross(q-p[0],b)/det;z=cross(a,q-p[0])/det;weights=np.array([1-y-z,y,z]);hit=weights@p;accepted=True
     # Physical projected edge halfspace allowance rather than barycentric allowance.
     for i in range(3):
      edge=p[(i+1)%3]-p[i];distance=cross(edge,q-p[i])*(1 if det>0 else -1)/np.linalg.norm(edge)
      if distance < -tol:accepted=False
     if accepted:
      if min(weights)<0:
       nearest=[]
       for i in range(3):
        j=(i+1)%3;edge=p[j]-p[i];den=float(np.dot(edge,edge));fraction=max(0,min(1,float(np.dot(q-p[i],edge))/den))if den else 0
        finite=np.zeros(3);finite[i]=1-fraction;finite[j]=fraction;nearest.append((float(np.linalg.norm(finite@p-q)),finite))
       distance,weights=min(nearest,key=lambda x:x[0]);accepted=distance<=tol
      if accepted:bindings=[{'barycentric':weights.tolist(),'sourcePoint':(weights@t).tolist(),'rawUv':(weights@uv[vs]).tolist()}]
     kind='nondegenerate-projected-point'
    else:
     # Projected triangle collapses to a segment; its line preimage is a finite interval.
     for i in range(3):
      j=(i+1)%3;edge=p[j]-p[i];den=float(np.dot(edge,edge))
      if den==0:
       if np.linalg.norm(q-p[i])<=tol:
        for k in [i,j]:
         weights=np.zeros(3);weights[k]=1;bindings.append({'barycentric':weights.tolist(),'sourcePoint':t[k].tolist(),'rawUv':uv[vs[k]].tolist()})
      else:
       fraction=float(np.dot(q-p[i],edge))/den;clamped=max(0,min(1,fraction));distance=float(np.linalg.norm(q-p[i]-clamped*edge))
       if distance<=tol:
        weights=np.zeros(3);weights[i]=1-clamped;weights[j]=clamped;bindings.append({'barycentric':weights.tolist(),'sourcePoint':(weights@t).tolist(),'rawUv':(weights@uv[vs]).tolist()})
     kind='projected-degenerate-finite-contact'
    if bindings:
     bindings.sort(key=lambda h:h['sourcePoint'][0]);bounds=[bindings[0]['sourcePoint'][0],bindings[-1]['sourcePoint'][0]]
     contacts.append({'faceId':f,'componentId':fc[f],'sightComponent':fc[f]==sight,'vertexIds':vs,'exactTrianglePositions':t.tolist(),'exactTriangleUvs':uv[vs].tolist(),'kind':kind,'projectedSignedDoubleArea':det,'finiteSourceXSupport':bounds,'supportEndpoints':[bindings[0],bindings[-1]],'maximumSupportEndpointDistanceToDeclaredLineSource':max(float(np.linalg.norm(np.array(h['sourcePoint'])[1:]-q))for h in bindings),'tipXWithinSupport':bool(bounds[0]-tol<=tip[0]<=bounds[1]+tol),'interpretation':'Finite source-axis contact only; positive allowance can include a nearby line, not exact native topology.'})
   variants.append({'projectedDistanceAllowanceSource':tol,'testedTriangleCount':359,'contacts':contacts,'otherComponentContactCount':sum(not c['sightComponent']for c in contacts),'degenerateProjectedContactCount':sum(c['kind']=='projected-degenerate-finite-contact'for c in contacts),'minimumXSupport':min((c['finiteSourceXSupport'][0]for c in contacts),default=None),'maximumXSupport':max((c['finiteSourceXSupport'][1]for c in contacts),default=None)})
  probes.append({'coordinateGroup':gid,'rawVertexIds':group['vertexIds'],'sourceTipCandidate':tip.tolist(),'variants':variants,'imageRole':'No pixel/landmark assignment; coordinate-gate candidate only.'})
 result={'generator':rec(Path(__file__)),'inputs':[rec(source)],'originalRuntimeExecuted':False,'cameraFitAttempted':False,'rendererExecuted':False,'method':{'direction':[1,0,0],'projection':'Exact finite triangles projected to source YZ; nondegenerate projected points or degenerate projected segment preimages retain X intervals.','projectedDegeneracyAreaThreshold':1e-14,'distanceAllowancesSource':[0,1e-8,1e-6],'scope':'All 359 triangles for each of three crown-coordinate lines; raw IDs/coordinates/UVs preserved.','limitations':['Zero allowance is floating-point computation, not interval-certified exact arithmetic.','Contacts at these three lines alone cannot establish a neighborhood silhouette, extrema under perspective or eye-facing depth order.','Native Euler/culling/near clipping, gun translation/bob/recoil, aspect/crop and recorded tip identity remain unproved.']},'probes':probes,'projectionHypotheses':d['projectionHypotheses'],'fitObservations':[],'heldoutObservations':[],'conclusion':'Finite source-axis contact support enumerated; no camera or recorded finite silhouette endpoint accepted.'}
 OUT.mkdir(parents=True,exist_ok=True);p=OUT/'crown-finite-line-contacts.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'path':str(p.relative_to(ROOT)),'probes':[{'group':r['coordinateGroup'],'variants':[{'allowance':v['projectedDistanceAllowanceSource'],'contacts':len(v['contacts']),'degenerate':v['degenerateProjectedContactCount'],'other':v['otherComponentContactCount'],'xSupport':[v['minimumXSupport'],v['maximumXSupport']]}for v in r['variants']]}for r in probes]}))
if __name__=='__main__':main()
