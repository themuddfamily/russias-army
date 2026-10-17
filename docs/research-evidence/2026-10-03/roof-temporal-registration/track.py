"""Predeclared bounded image-only roof patch tracking; no camera/model reads."""
from pathlib import Path
import json, hashlib, math
import cv2
import numpy as np
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
def binding(p):
 return {'path':str(p.relative_to(ROOT)), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def mask(image,polygon):
 m=np.zeros(image.shape,np.uint8);cv2.fillPoly(m,[np.array(polygon,np.int32)],255)
 return m,cv2.erode(m,np.ones((13,13),np.uint8))
def support(m,p):
 x,y=np.rint(p).astype(int)
 return bool(6<=x<m.shape[1]-6 and 6<=y<m.shape[0]-6 and np.all(m[y-6:y+7,x-6:x+7]))
def locate(template,image,allowed):
 ys,xs=np.nonzero(allowed)
 if not len(xs):return {'failure':'empty roof support'}
 x0=max(0,int(xs.min())-5);y0=max(0,int(ys.min())-5);x1=min(image.shape[1],int(xs.max())+6);y1=min(image.shape[0],int(ys.max())+6)
 scores=cv2.matchTemplate(image[y0:y1,x0:x1],template,cv2.TM_CCOEFF_NORMED)
 valid=allowed[y0+5:y1-5,x0+5:x1-5]>0
 scores[~valid]=-2
 _,best,_,where=cv2.minMaxLoc(scores);pixel=[where[0]+x0+5,where[1]+y0+5]
 yy,xx=np.indices(scores.shape);scores[(xx-where[0])**2+(yy-where[1])**2<36]=-2
 _,second,_,other=cv2.minMaxLoc(scores)
 return {'pixel':pixel,'ncc':best,'secondPixel':[other[0]+x0+5,other[1]+y0+5],'secondNcc':second,'peakMargin':best-second}
def transition(a,b,ma,mb,ea,eb,p):
 template=cv2.getRectSubPix(a,(11,11),tuple(map(float,p)))
 found=locate(template,b,eb)
 if 'failure' in found:return found
 q=found['pixel'];back=locate(cv2.getRectSubPix(b,(11,11),tuple(map(float,q))),a,ea)
 error=math.dist(back['pixel'],p) if 'pixel' in back else None
 reasons=[]
 if not support(ma,p):reasons.append('source support crosses observed roof mask')
 if not support(mb,q):reasons.append('destination support crosses observed roof mask')
 if found['ncc']<.85:reasons.append('NCC below0.85')
 if found['peakMargin']<.05:reasons.append('distinct peak margin below0.05')
 if error is None or error>1:reasons.append('forward/backward localization exceeds1px')
 return {'sourcePixel':list(map(float,p)),**found,'reverse':back,'forwardBackwardPixels':error,'admitted':not reasons,'failureReasons':reasons}
def main():
 cv2.setNumThreads(1)
 configuration=json.loads((OUT/'masks.json').read_text());frames=configuration['frames']
 first=cv2.imread(str(ROOT/frames[0]['path']),0);m0,e0=mask(first,frames[0]['roofPolygon'])
 seedmask=e0.copy();cv2.circle(seedmask,(697,190),12,0,-1)
 found=cv2.goodFeaturesToTrack(first,maxCorners=100,qualityLevel=.01,minDistance=6,mask=seedmask)
 seeds=sorted((p[0].tolist() for p in found),key=lambda p:(p[0],p[1])) if found is not None else []
 tracks=[{'id':i,'role':'heldout' if i%3==0 else 'training','initialPixel':p,'transitions':[],'complete':True,'lastPixel':p} for i,p in enumerate(seeds)]
 disputed={'role':'disputed diagnostic heldout, never training','initialPixel':[697.2108154296875,190.02023315429688],'lastPixel':[697.2108154296875,190.02023315429688],'transitions':[],'complete':True}
 adjacent=[]
 for i in range(len(frames)-1):
  a=cv2.imread(str(ROOT/frames[i]['path']),0);b=cv2.imread(str(ROOT/frames[i+1]['path']),0)
  ma,ea=mask(a,frames[i]['roofPolygon']);mb,eb=mask(b,frames[i+1]['roofPolygon'])
  for track in tracks+[disputed]:
   if not track['complete']:continue
   result=transition(a,b,ma,mb,ea,eb,track['lastPixel']);track['transitions'].append({'fromSeconds':frames[i]['seconds'],'toSeconds':frames[i+1]['seconds'],**result})
   if result.get('admitted'):track['lastPixel']=result['pixel']
   else:track['complete']=False
  adjacent.append({'from':frames[i]['seconds'],'to':frames[i+1]['seconds'],'completeIndependentTracks':sum(t['complete'] for t in tracks)})
 training=[t for t in tracks if t['complete'] and t['role']=='training'];heldout=[t for t in tracks if t['complete'] and t['role']=='heldout']
 homography={'attempted':False,'admitted':False,'trainingCount':len(training),'heldoutCount':len(heldout),'failureReasons':[]}
 if len(training)<4:homography['failureReasons'].append('fewer than4 complete training tracks')
 if len(heldout)<3:homography['failureReasons'].append('fewer than3 independent complete heldouts')
 if not homography['failureReasons']:
  x=np.array([t['initialPixel'] for t in training],np.float64);y=np.array([t['lastPixel'] for t in training],np.float64)
  rank=int(np.linalg.matrix_rank(x-x.mean(axis=0)));homography['trainingCenteredRank']=rank
  if rank<2:homography['failureReasons'].append('collinear training')
  else:
   H,_=cv2.findHomography(x,y,method=0);homography['attempted']=True
   if H is None:homography['failureReasons'].append('homography unavailable')
   else:
    checks=[]
    for t in heldout:
     v=H@np.r_[t['initialPixel'],1];q=v[:2]/v[2];checks.append({'id':t['id'],'prediction':q.tolist(),'observed':t['lastPixel'],'errorPixels':math.dist(q,t['lastPixel'])})
    rms=math.sqrt(sum(c['errorPixels']**2 for c in checks)/len(checks));maximum=max(c['errorPixels'] for c in checks)
    homography.update({'matrix':H.tolist(),'matrixCondition':float(np.linalg.cond(H)),'trainingBounds':[x.min(axis=0).tolist(),x.max(axis=0).tolist()],'trainingHullAreaPixels':float(cv2.contourArea(cv2.convexHull(x.astype(np.float32)))),'heldoutChecks':checks,'heldoutRmsPixels':rms,'heldoutMaxPixels':maximum})
    if rms>2 or maximum>2:homography['failureReasons'].append('independent heldout error exceeds2px')
    homography['admitted']=not homography['failureReasons']
    v=H@np.r_[disputed['initialPixel'],1];homography['disputedImagePrediction']=(v[:2]/v[2]).tolist()
 alternatives=[{'name':'best','pixel':[619.4713745117188,130.78497314453125]},{'name':'second','pixel':[630.6611938476562,130.32887268066406]}]
 # Alternative distances are added only after image-only tracks/transform are fixed.
 if disputed['complete']:
  for c in alternatives:c['distanceFromCompleteDisputedTrackPixels']=math.dist(c['pixel'],disputed['lastPixel'])
 if homography.get('disputedImagePrediction'):
  for c in alternatives:c['distanceFromImageHomographyPixels']=math.dist(c['pixel'],homography['disputedImagePrediction'])
 result={'inputs':[binding(ROOT/f['path']) for f in frames]+[binding(OUT/'PROTOCOL.md'),binding(OUT/'masks.json'),binding(Path(__file__))],'opencvVersion':cv2.__version__,'cameraFilesRead':False,'sourceModelRead':False,'originalRuntimeExecuted':False,'settings':{'patchSize':11,'roofErosionRadius':6,'nccMinimum':.85,'peakMarginMinimum':.05,'forwardBackwardMaximumPixels':1,'heldoutRmsAndMaxAllowancePixels':2,'threads':1},'seedCount':len(seeds),'adjacentSummary':adjacent,'tracks':tracks,'disputedTrack':disputed,'homography':homography,'retained16sAlternatives':alternatives,'acceptedSourceTexelIdentity':False,'candidateSelection':None,'limitations':['Approximate observed image masks are not source-face or physical-texel proof.','Small roof patches may have weak/repetitive texture; retained failures cannot justify changed thresholds.','Temporal image tracks do not independently establish exact atlas texel identity or native raster/camera equality.']}
 (OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'seedCount':len(seeds),'adjacent':adjacent,'homography':homography,'disputedTrack':disputed,'alternatives':alternatives},indent=2))
if __name__=='__main__':main()
