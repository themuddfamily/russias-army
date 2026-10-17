#!/usr/bin/env python3
"""Light metadata-only OpenCV4.13 descriptor-grid support diagnostic; no SIFT."""
from pathlib import Path
import json,math,hashlib
ROOT=Path(__file__).resolve().parents[4];OUT=Path(__file__).resolve().parent
def rec(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def support(k,dimensions):
 octave=k['octavePacked']&255;octave=octave if octave<128 else octave-256;factor=2.**octave;scale=1/factor;x,y=k['pixel'];center=[round(x*scale),round(y*scale)];width=3*k['size']*scale*.5;radius=round(width*math.sqrt(2)*2.5);angle=math.radians(360-k['angleDegrees']);cos=math.cos(angle)/width;sin=math.sin(angle)/width;points=[]
 for i in range(-radius,radius+1):
  for j in range(-radius,radius+1):
   r=i*cos+j*sin+1.5;c=j*cos-i*sin+1.5
   if -1<r<4 and -1<c<4 and 0<center[0]+j<int(dimensions[0]*scale)-1 and 0<center[1]+i<int(dimensions[1]*scale)-1:points.append([(center[0]+j)*factor,(center[1]+i)*factor])
 return {'octave':octave,'octaveToInputFactor':factor,'roundedOctaveCenter':center,'histogramWidthOctavePixels':width,'scanRadiusOctavePixels':radius,'scanBoundsInputPixels':[(center[0]-radius)*factor,(center[1]-radius)*factor,(center[0]+radius)*factor,(center[1]+radius)*factor],'contributingGridCoordinateBoundsInputPixels':[min(p[0]for p in points),min(p[1]for p in points),max(p[0]for p in points),max(p[1]for p in points)],'contributingGridCoordinatesInputPixels':points,'calculationStatus':'Double-precision transcription of published4.13.0 loop predicates; binary float/SIMD details not asserted exact. Gradient adds neighboring octave pixels and Gaussian pyramid blur extends underlying image dependence.'}
def main():
 p=OUT/'descriptor-support.json';d=json.loads(p.read_text());records=[]
 for r in d['results']:
  c=next(c for c in r['sourcePatchCandidates']if c['acceptedOriginalRules']);a=support(c['atlasKeypoint'],[512,512]);a['gridSamplesAboveRoofUpperUvBoundary384_6105499267578']=sum(q[1]<384.6105499267578 for q in a['contributingGridCoordinatesInputPixels']);records.append({'seconds':r['seconds'],'atlas':a,'bestReference':support(c['best']['referenceKeypoint'],[1280,574]),'secondReference':support(c['second']['referenceKeypoint'],[1280,574])})
 result={'generator':rec(Path(__file__)),'inputs':[rec(p)],'implementationSources':[{'url':'https://raw.githubusercontent.com/opencv/opencv/4.13.0/modules/features2d/src/sift.simd.hpp','lines':'657-703','role':'histogram width, scan radius and rotated bin predicates'},{'url':'https://raw.githubusercontent.com/opencv/opencv/4.13.0/modules/features2d/src/sift.dispatch.cpp','lines':'402-413','role':'octave scale, keypoint size and descriptor orientation'}],'siftExecuted':False,'cameraFitsRead':False,'records':records,'limits':['Support transcription is an implementation diagnostic, not a native Director descriptor/raster model.','Grid support crossing a roof boundary identifies contextual descriptor dependence, not a false match or permission to discard heldout evidence.']};q=OUT/'sampling-support-diagnostic.json';q.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'records':[{'seconds':r['seconds'],'atlasBounds':r['atlas']['contributingGridCoordinateBoundsInputPixels'],'samplesAboveRoofBoundary':r['atlas']['gridSamplesAboveRoofUpperUvBoundary384_6105499267578'],'sampleCount':len(r['atlas']['contributingGridCoordinatesInputPixels']),'bestBounds':r['bestReference']['contributingGridCoordinateBoundsInputPixels'],'secondBounds':r['secondReference']['contributingGridCoordinateBoundsInputPixels']}for r in records]}))
if __name__=='__main__':main()
