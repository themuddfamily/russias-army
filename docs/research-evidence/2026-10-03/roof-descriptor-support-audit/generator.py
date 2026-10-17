#!/usr/bin/env python3
"""Detached passive reproduction of roof SIFT, retaining alternatives; no poses."""
from pathlib import Path
import json,hashlib,math
import cv2,numpy as np
ROOT=Path(__file__).resolve().parents[4];OUT=Path(__file__).resolve().parent
def rec(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def key(k,index):
 x,y=k.pt;r=k.size/2
 return {'index':index,'pixel':[x,y],'size':k.size,'angleDegrees':k.angle,'octavePacked':k.octave,'response':k.response,'classId':k.class_id,'nominalScaleCircleBounds':[x-r,y-r,x+r,y+r],'supportStatus':'Keypoint size/2 is nominal scale radius, not complete descriptor sampling support or native raster support.'}
def main():
 cv2.setNumThreads(1);scene=ROOT/'public/assets/original-scenes/woodland/scene.json';atlaspath=ROOT/'public/assets/original-scenes/woodland/textures/stonebarn.png';original=ROOT/'scripts/research/match-reference-roof-landmarks.py';mesh=next(m for m in json.loads(scene.read_text())['meshes']if m['resource']=='stonebarn'and m['part']==0)
 atlas=cv2.imread(str(atlaspath),0);sift=cv2.SIFT_create(nfeatures=12000,contrastThreshold=.002,edgeThreshold=20);ka,da=sift.detectAndCompute(atlas,None);uv=np.array(mesh['tex_coords'][0]);uv=np.column_stack((uv[:,0]+.5,.5-uv[:,1]))*512-.5;results=[]
 for seconds,refpath in [(15,ROOT/'docs/research-evidence/2026-09-30/woodland-video-15s.jpg'),(16,ROOT/'docs/research-evidence/2026-10-01/woodland-video-16s-camera-reference.png')]:
  oldpath=ROOT/f'docs/research-evidence/2026-10-01/woodland-{seconds}s-stonebarn-roof-texture-heldout.json';old=json.loads(oldpath.read_text())
  for p,k in [(scene,'scene'),(atlaspath,'atlas'),(refpath,'reference'),(original,'generator')]:assert rec(p)['sha256']==old[k+'Sha256']
  reference=cv2.imread(str(refpath),0);kb,db=sift.detectAndCompute(reference,None);matcher=cv2.BFMatcher();reverse=matcher.match(db,da);reverse2=matcher.knnMatch(db,da,k=2);candidates=[];accepted=[]
  for best,second in matcher.knnMatch(da,db,k=2):
   q=np.array(ka[best.queryIdx].pt)
   if not(70<=q[0]<=100 and 385<=q[1]<=420):continue
   hits=[]
   for face,ids in enumerate(mesh['faces']):
    t=uv[ids];matrix=np.column_stack((t[1]-t[0],t[2]-t[0]))
    if abs(np.linalg.det(matrix))<1e-8:continue
    b=np.linalg.solve(matrix,q-t[0]);weights=np.r_[1-sum(b),b]
    if min(weights)>=-1e-8:hits.append({'face':face,'barycentric':weights.tolist()})
   ratio=float(best.distance/second.distance)if second.distance else None;ratioPass=best.distance<.8*second.distance;reciprocal=reverse[best.trainIdx].trainIdx==best.queryIdx
   reasons=[]
   if not ratioPass:reasons.append('fails unchanged0.8 ratio')
   if not reciprocal:reasons.append('not reciprocal nearest')
   if len(hits)!=1:reasons.append('not exactly one containing UV triangle')
   entry={'atlasKeypoint':key(ka[best.queryIdx],best.queryIdx),'atlasDescriptor':da[best.queryIdx].tolist(),'best':{'distance':float(best.distance),'referenceKeypoint':key(kb[best.trainIdx],best.trainIdx),'referenceDescriptor':db[best.trainIdx].tolist()},'second':{'distance':float(second.distance),'referenceKeypoint':key(kb[second.trainIdx],second.trainIdx),'referenceDescriptor':db[second.trainIdx].tolist()},'reverseFromBestReference':[{'distance':float(m.distance),'atlasKeypoint':key(ka[m.trainIdx],m.trainIdx),'atlasDescriptor':da[m.trainIdx].tolist()}for m in reverse2[best.trainIdx]],'descriptorRatio':ratio,'ratioPass':ratioPass,'reciprocalNearest':reciprocal,'uvCandidates':hits,'acceptedOriginalRules':not reasons,'acceptanceReasons':reasons or ['unchanged ratio,reciprocal and uniqueUV rules pass'],'role':'heldout','uncertaintyPixels':2}
   candidates.append(entry)
   if not reasons:
    h=hits[0];weights=np.array(h['barycentric']);accepted.append({'atlasPixel':q.tolist(),'pixel':list(kb[best.trainIdx].pt),'face':h['face'],'barycentric':h['barycentric'],'descriptorDistance':float(best.distance),'descriptorRatio':ratio,'sourceLocalPoint':(weights@np.array(mesh['positions'])[mesh['faces'][h['face']]]).tolist()})
  prior=old['landmarks'];assert len(accepted)==len(prior)
  checks=[]
  for fresh in accepted:
   saved=next(p for p in prior if p['atlasPixel']==fresh['atlasPixel']);differences={k:max(abs(a-b)for a,b in zip(fresh[k],saved[k])) for k in ['atlasPixel','pixel','barycentric','sourceLocalPoint']};assert all(v==0 for v in differences.values());assert fresh['face']==saved['face'] and fresh['descriptorDistance']==saved['descriptorDistance']and fresh['descriptorRatio']==saved['descriptorRatio'];checks.append({'atlasPixel':fresh['atlasPixel'],'differences':differences,'exactOriginalReproduction':True})
  results.append({'seconds':seconds,'inputs':[rec(refpath),rec(oldpath)],'atlasDescriptorCount':len(ka),'referenceDescriptorCount':len(kb),'sourcePatchCandidates':candidates,'accepted':accepted,'originalReproductionChecks':checks})
 data={'generator':rec(Path(__file__)),'inputs':[rec(scene),rec(atlaspath),rec(original)],'opencvVersion':cv2.__version__,'settings':{'nfeatures':12000,'contrastThreshold':.002,'edgeThreshold':20,'ratioThreshold':.8,'sourcePatch':[70,385,100,420],'role':'all heldout','uncertaintyPixels':2,'threadCount':1},'originalRuntimeExecuted':False,'cameraFitsRead':False,'cameraFitAttempted':False,'results':results,'supportLimit':'Nominal scale-circle extent is retained; full SIFT implementation sampling support is not equated with this circle. No native shader/raster or perspective support asserted.'}
 (OUT/'descriptor-support.json').write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({'frames':[{'seconds':r['seconds'],'candidates':len(r['sourcePatchCandidates']),'accepted':len(r['accepted']),'exactOriginalReproduction':all(c['exactOriginalReproduction']for c in r['originalReproductionChecks']),'acceptedDetails':[{'atlas':c['atlasKeypoint'],'best':c['best']['referenceKeypoint'],'second':c['second']['referenceKeypoint'],'ratio':c['descriptorRatio']}for c in r['sourcePatchCandidates']if c['acceptedOriginalRules']]}for r in results]}))
if __name__=='__main__':main()
