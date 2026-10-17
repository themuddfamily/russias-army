#!/usr/bin/env python3
"""Passive AK front-sight finite topology audit; no poses, fits or rendering."""
from pathlib import Path
from collections import defaultdict,Counter
import hashlib,json,math
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research-evidence/2026-10-03/ak-front-sight-topology'
def rec(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def distance(a,b):return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))
def components(items,adj):
 remaining=set(items);result=[]
 while remaining:
  queue=[min(remaining)];seen=set(queue)
  while queue:
   a=queue.pop()
   for b in adj.get(a,[]):
    if b in remaining and b not in seen:seen.add(b);queue.append(b)
  remaining-=seen;result.append(sorted(seen))
 return result

def main():
 old=ROOT/'artifacts/fidelity-review/2026-10-02/current/ak-camera-local-landmark-inventory/inventory.json';d=json.loads(old.read_text())
 geo=ROOT/'public/assets/original-weapons/geometry.json';assert rec(geo)['sha256']==d['dependencySha256'][str(geo.relative_to(ROOT))]
 m=next(x for x in json.loads(geo.read_text())['meshes']if x['resource']=='ak47');pos=m['positions'];faces=m['faces'];uv=m['tex_coords'][0]
 candidates=[c for c in d['structuralCandidates']if c['id'].startswith('front_sight')];region=sorted(set(f for c in candidates for f in c['faceIdsTouchingSelection']))
 used=set(v for f in faces for v in f);degenerate=[]
 for i,f in enumerate(faces):
  a,b,c=[pos[v]for v in f];u=[x-y for x,y in zip(b,a)];v=[x-y for x,y in zip(c,a)];cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
  if sum(x*x for x in cross)==0:degenerate.append(i)
 models=[]
 for label,tolerance in [('source-index',None),('exact-coordinate',0),('near-coordinate-diagnostic',1e-6)]:
  representatives=[];gids=[];members=[]
  for i,p in enumerate(pos):
   match=[] if tolerance is None else [j for j,q in enumerate(representatives)if (p==q if tolerance==0 else distance(p,q)<=tolerance)]
   if match:g=match[0]
   else:g=len(representatives);representatives.append(p);members.append([])
   gids.append(g);members[g].append(i)
  incidence=defaultdict(list)
  for f,vs in enumerate(faces):
   for a,b in [(vs[0],vs[1]),(vs[1],vs[2]),(vs[2],vs[0])]:
    if gids[a]>gids[b]:a,b=b,a
    incidence[(gids[a],gids[b])].append({'faceId':f,'vertexIds':[a,b],'exactPositions':[pos[a],pos[b]],'rawUvs':[uv[a],uv[b]]})
  adj=defaultdict(set);regadj=defaultdict(set);edges=[];boundaryadj=defaultdict(set)
  for key,bs in sorted(incidence.items()):
   fs=sorted(set(b['faceId']for b in bs));local=[f for f in fs if f in region]
   for a in fs:adj[a].update(set(fs)-{a})
   for a in local:regadj[a].update(set(local)-{a})
   if not local:continue
   collapse=key[0]==key[1];valence=len([f for f in fs if f not in degenerate]);selectedvalence=len([f for f in local if f not in degenerate])
   if not collapse and selectedvalence==1:boundaryadj[key[0]].add(key[1]);boundaryadj[key[1]].add(key[0])
   edges.append({'groupIds':list(key),'globalFaceIds':fs,'selectedRegionFaceIds':local,'globalNondegenerateFaceValence':valence,'regionNondegenerateFaceValence':selectedvalence,'collapsedByModel':collapse,'candidateBoundaryOfSelectedRegion':not collapse and selectedvalence==1,'candidateGlobalOpenBoundary':not collapse and valence==1,'bindings':bs,'silhouetteStatus':'Unassigned: view-facing signs and occlusion are unknown. Region boundary may be only coordinate-gate cutoff.'})
  boundarycomponents=components(boundaryadj,boundaryadj)
  componentstats=[]
  for compfaces in components(range(len(faces)),adj):
   fs=set(compfaces);es={key for key,bs in incidence.items()if any(b['faceId']in fs for b in bs)};vs={gids[v]for f in fs for v in faces[f]}
   componentstats.append({'faceIds':compfaces,'faceCount':len(fs),'edgeCount':len(es),'groupedVertexCount':len(vs),'eulerCharacteristicDiagnostic':len(vs)-len(es)+len(fs),'allEdgesHaveTwoDistinctIncidentFaces':all(len({b['faceId']for b in incidence[e]if b['faceId']in fs})==2 for e in es),'touchesSelectedRegion':bool(fs.intersection(region)),'limit':'Grouped combinatorial diagnostic only; no manifold/embedding/orientability or image-hole proof.'})
  models.append({'id':label,'allowanceSource':tolerance,'coordinateStatus':'Decoded vertex IDs/positions/UVs unchanged; grouping graph is diagnostic only.','coordinateGroupCount':len(members),'groups':[{'id':i,'vertexIds':ids,'maxPairwisePositionDifferenceSource':max([0]+[distance(pos[a],pos[b])for a in ids for b in ids])}for i,ids in enumerate(members)],'globalComponentDiagnostics':componentstats,'globalFaceConnectedComponents':components(range(len(faces)),adj),'selectedRegionFaceConnectedComponents':components(region,regadj),'selectedIncidentEdges':edges,'selectedBoundaryGraphComponents':[{'groups':c,'degrees':{str(g):len(boundaryadj[g])for g in c},'everyVertexDegreeTwo':all(len(boundaryadj[g])==2 for g in c),'interpretation':'Graph cycle alone does not prove a physical hole or projected sight opening; region truncation, seams and degenerate faces remain relevant.'}for c in boundarycomponents]})
 frame=ROOT/d['image']['path'];assert rec(frame)['sha256']==d['dependencySha256'][d['image']['path']]
 result={'generator':rec(Path(__file__)),'inputs':[rec(old),rec(geo),rec(frame)],'originalRuntimeExecuted':False,'cameraFitAttempted':False,'rendererExecuted':False,'mesh':{'positions':pos,'faces':faces,'firstUvChannel':uv,'vertexCount':len(pos),'faceCount':len(faces),'unusedVertexIds':sorted(set(range(len(pos)))-used),'exactDegenerateFaceIds':degenerate},'sourceCoordinateCandidates':candidates,'selectedRegionFaceIds':region,'regionStatus':'Union of faces touching pre-existing crown/stem coordinate gates; not an authored front-sight part label.','topologyModels':models,'image':{'reference':rec(frame),'dimensions':[1280,574],'frontSightApproximateRoi':[682,303,717,355],'observation':'Small dark two-post/stem morphology above fore-end; low contrast timber background and raster blur obscure attachment and exact finite tips.','role':'Exploratory morphology only; no measured source-correspondence or accepted hole boundary.','acceptedCorrespondences':[],'fitCorrespondences':[],'heldoutCorrespondences':[]},'projectionHypotheses':d['projectionHypotheses'],'transformLimits':d['transform']['limits']+['Native Euler order, hither/near clipping, wave/bob and recovery phase are not proved; no pose-based front-facing or silhouette claim.'],'conclusion':'Actual finite triangle/edge alternatives retained under three topology models; no independently accepted finite landmark or physical sight-hole identification; V23 remains open.'}
 OUT.mkdir(parents=True,exist_ok=True);p=OUT/'front-sight-topology.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'path':str(p.relative_to(ROOT)),'unusedVertices':len(result['mesh']['unusedVertexIds']),'degenerateFaces':degenerate,'selectedFaces':len(region),'models':[{'id':x['id'],'groups':x['coordinateGroupCount'],'globalComponents':len(x['globalFaceConnectedComponents']),'regionComponents':len(x['selectedRegionFaceConnectedComponents']),'selectedEdges':len(x['selectedIncidentEdges']),'boundaryComponents':len(x['selectedBoundaryGraphComponents'])}for x in models]}))
if __name__=='__main__':main()
