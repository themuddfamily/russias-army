#!/usr/bin/env python3
"""Passive triangle finite-incidence diagnostics near candidate interior wall tops."""
from pathlib import Path
import json,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research-evidence/2026-10-02/interior-walltop-incidences'
def rec(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def main():
 prior=ROOT/'docs/research-evidence/2026-10-02/interior-source-junctions/source-junction-inventory.json';d=json.loads(prior.read_text())
 scene=ROOT/'public/assets/original-scenes/woodland/scene.json';s=json.loads(scene.read_text());m=next(x for x in s['meshes'] if x['resource']=='woodenshed' and x['part']==0)
 assert rec(scene)['sha256']==next(r['sha256'] for r in d['inputs'] if r['path']==str(scene.relative_to(ROOT)))
 pos=np.array(m['positions']);uv=np.array(m['tex_coords'][0]);faces=m['faces'];tri=[pos[f] for f in faces]
 normal=[]
 for t in tri:
  n=np.cross(t[1]-t[0],t[2]-t[0]);length=np.linalg.norm(n);normal.append(n/length if length>0 else None)
 member={f:p['id'] for p in d['sourcePlanes'] for f in p['faces']};kinds={p['id']:p['orientationClass']for p in d['sourcePlanes']}
 compatible={'A':[8,12,25],'B':[10,14,26]};records=[];tested=0
 def bary(point,t):
  a=t[1]-t[0];b=t[2]-t[0];v=point-t[0];aa=np.dot(a,a);ab=np.dot(a,b);bb=np.dot(b,b);den=aa*bb-ab*ab
  if abs(den)<1e-12:return None
  y=(bb*np.dot(v,a)-ab*np.dot(v,b))/den;z=(aa*np.dot(v,b)-ab*np.dot(v,a))/den;return np.array([1-y-z,y,z])
 def inside(point,index,tolerance):
  n=normal[index]
  if n is None:return None
  t=tri[index];dist=float(np.dot(point-t[0],n));projected=point-dist*n;b=bary(projected,t)
  if b is None:return None
  # Absolute physical allowance on each oriented edge halfspace, not barycentric allowance.
  for i in range(3):
   a=t[i];z=t[(i+1)%3];inward=np.cross(n,z-a);inward/=np.linalg.norm(inward)
   if np.dot(projected-a,inward)<-tolerance:return None
  if abs(dist)>tolerance:return None
  return b
 def candidate(a,b,tol):
  hits=[]
  for own,other in [(a,b),(b,a)]:
   t=tri[own];n=normal[other];ds=(t-tri[other][0])@n
   for i in range(3):
    j=(i+1)%3
    if abs(ds[i])<=tol and inside(t[i],other,tol)is not None:hits.append(t[i])
    if ds[i]*ds[j]<0:
     p=t[i]+ds[i]/(ds[i]-ds[j])*(t[j]-t[i])
     if inside(p,other,tol)is not None:hits.append(p)
  unique=[]
  for p in hits:
   if not any(np.linalg.norm(p-q)<1e-7 for q in unique):unique.append(p)
  if not unique:return None
  if len(unique)==1:ends=[unique[0],unique[0]]
  else:ends=max(((p,q)for p in unique for q in unique),key=lambda pq:np.linalg.norm(pq[0]-pq[1]))
  return {'lengthSource':float(np.linalg.norm(ends[0]-ends[1])),'endpointDiagnostics':[{'sourcePoint':p.tolist(),'wallBarycentric':bary(p,tri[a]).tolist(),'otherBarycentric':bary(p,tri[b]).tolist(),'wallPlaneDistanceSource':float(np.dot(p-tri[a][0],normal[a])),'otherPlaneDistanceSource':float(np.dot(p-tri[b][0],normal[b])),'wallUv':(bary(p,tri[a])@uv[faces[a]]).tolist(),'otherUv':(bary(p,tri[b])@uv[faces[b]]).tolist()} for p in ends]}
 for component,ids in compatible.items():
  wallfaces=[f for f in range(len(faces))if member.get(f)in ids]; zmax=max(pos[v,2]for f in wallfaces for v in faces[f]);zmin=min(pos[v,2]for f in wallfaces for v in faces[f]); threshold=(zmax+zmin)/2
  for a in wallfaces:
   for b in range(len(faces)):
    if normal[b]is None or kinds.get(member.get(b))!='sloped-plane':continue
    if ('A'if np.mean(tri[b][:,1])>1000 else 'B')!=component:continue
    # Coarse bounding boxes expanded by maximum allowance before exact finite tests.
    if np.any(np.max(tri[a],axis=0)+.002<np.min(tri[b],axis=0))or np.any(np.max(tri[b],axis=0)+.002<np.min(tri[a],axis=0)):continue
    tested+=1
    if np.linalg.norm(np.cross(normal[a],normal[b]))<1e-8:continue
    variants=[]
    for tol in [1e-5,1e-4,.001,.002]:
     c=candidate(a,b,tol)
     if c is not None and max(x['sourcePoint'][2]for x in c['endpointDiagnostics'])>=threshold:variants.append({'allowanceSource':tol,**c})
    if variants:records.append({'id':f'{component}-wall-face-{a}-sloped-face-{b}','component':component,'wallFace':a,'wallPlane':member[a],'slopedFace':b,'slopedPlane':member[b],'sharesPriorFullEdgeGroup':any({a,b}.issubset({binding['face'] for binding in e['bindings']})for e in d['edges']),'wallFaceVertices':faces[a],'slopedFaceVertices':faces[b],'wallTopDiagnosticZThreshold':threshold,'exactTrianglePositions':[tri[a].tolist(),tri[b].tolist()],'exactTriangleUvs':[uv[faces[a]].tolist(),uv[faces[b]].tolist()],'allowanceVariants':variants})
 data={'generator':rec(Path(__file__)),'inputs':[rec(prior),rec(scene)],'originalRuntimeExecuted':False,'cameraFitAttempted':False,'rendererExecuted':False,'sourceFaces':faces,'sourcePositions':m['positions'],'sourceFirstUvChannel':m['tex_coords'][0],'degenerateFaces':[i for i,n in enumerate(normal)if n is None],'method':{'compatibleWallPlanes':compatible,'otherCandidates':'All same-component sloped-normal triangles; orientation does not establish roof semantics.','wallTopRegion':'Upper half of combined compatible wall source Z extent, source-only exploratory filter.','allowancesSource':[1e-5,1e-4,.001,.002],'finiteTest':'Vertices near opposite plane inside opposite triangle, plus exact edge/plane crossings inside opposite triangle. Oriented edge halfspace distance uses physical source allowance. Coplanar pairs excluded.','endpointStatus':'Derived finite triangle-incidence diagnostics; exact decoded triangles/UVs retained unchanged. Nonzero allowance can admit nearby disconnected triangles and extrapolated UVs; not native topology.','scopeLimit':'Only compatible walls against sloped triangles in upper region; does not inventory every face intersection or prove absent roof geometry.'},'testedBoundingBoxCandidatePairs':tested,'candidates':records,'counts':{c:{'candidatePairs':sum(r['component']==c for r in records),'perAllowance':{str(t):{'admittedPairs':sum(r['component']==c and any(v['allowanceSource']==t for v in r['allowanceVariants'])for r in records),'lengthAbove002':sum(r['component']==c and any(v['allowanceSource']==t and v['lengthSource']>.002 for v in r['allowanceVariants'])for r in records)}for t in [1e-5,1e-4,.001,.002]},'positiveLengthAtStrictestAllowance':sum(r['component']==c and any(v['allowanceSource']==1e-5 and v['lengthSource']>.002 for v in r['allowanceVariants'])for r in records)}for c in compatible},'imageAssignment':None,'fitObservations':[],'heldoutObservations':[],'conclusion':'Source finite incidences only; no image physical boundary, shed component, camera or native lighting accepted.'}
 OUT.mkdir(exist_ok=True);p=OUT/'finite-walltop-incidences.json';p.write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({'path':str(p.relative_to(ROOT)),'counts':data['counts'],'tested':tested,'degenerateFaces':data['degenerateFaces']}))
if __name__=='__main__':main()
