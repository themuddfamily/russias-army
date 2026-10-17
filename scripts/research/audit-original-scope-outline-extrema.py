#!/usr/bin/env python3
"""Detached analytic SVG quadratic-outline diagnostic; no observation fitting."""
from pathlib import Path
import re,json,hashlib,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'docs/research-evidence/2026-10-03/scope-registration-observations'
def rec(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def main():
 svg=ROOT/'public/assets/original-effects/scope-original.svg';observations=OUT/'observations.json';obs=json.loads(observations.read_text());element=ET.fromstring(svg.read_text());assert element.attrib['viewBox']=='0 0 800 600';assert element.find('{http://www.w3.org/2000/svg}g').attrib['transform']=='matrix(1 0 0 1 0 -7)';path=element.find('.//{http://www.w3.org/2000/svg}path');tokens=re.findall(r'[MLQZ]|-?\d+(?:\.\d+)?',path.attrib['d']);i=0;contours=[];current=[];position=None;start=None
 while i<len(tokens):
  command=tokens[i];i+=1
  if command=='M':
   if current:contours.append(current);current=[]
   position=[float(tokens[i]),float(tokens[i+1])];start=position;i+=2
  elif command=='L':
   end=[float(tokens[i]),float(tokens[i+1])];i+=2;current.append({'kind':'L','start':position,'end':end});position=end
  elif command=='Q':
   control=[float(tokens[i]),float(tokens[i+1])];end=[float(tokens[i+2]),float(tokens[i+3])];i+=4;current.append({'kind':'Q','start':position,'control':control,'end':end});position=end
  elif command=='Z':
   if position!=start:current.append({'kind':'L','start':position,'end':start})
   contours.append(current);current=[];position=start
  else:raise ValueError(command)
 if current:contours.append(current)
 assert len(contours)==2
 inner=contours[1];candidates=[]
 for index,segment in enumerate(inner):
  a=segment['start'];b=segment['end'];ts={0.,1.}
  if segment['kind']=='Q':
   c=segment['control']
   for axis in [0,1]:
    denominator=a[axis]-2*c[axis]+b[axis]
    if denominator:
     t=(a[axis]-c[axis])/denominator
     if 0<t<1:ts.add(t)
  for t in sorted(ts):
   p=([(1-t)*a[j]+t*b[j]for j in [0,1]]if segment['kind']=='L'else[(1-t)**2*a[j]+2*(1-t)*t*c[j]+t*t*b[j]for j in [0,1]])
   candidates.append({'segmentIndex':index,'kind':segment['kind'],'parameter':t,'rawPoint':p,'translatedSvgPoint':[p[0],p[1]-7]})
 extrema={name:min(candidates,key=lambda c:sign*c['translatedSvgPoint'][axis]) for name,axis,sign in [('left',0,1),('right',0,-1),('top',1,1),('bottom',1,-1)]}
 frames=[]
 for frame in obs['frames']:
  if not frame['scopeSample']:continue
  width,height=frame['nativeTileDimensions'];checks=[]
  for o in frame['observations']:
   if o.get('nativeTileCoordinateInterval')is None:continue
   name=o['id'].split('-')[0];axis=0 if o['axis']=='x'else 1;pred=extrema[name]['translatedSvgPoint'][axis]*([width/800,height/600][axis]);lo,hi=o['nativeTileCoordinateInterval'];checks.append({'observationId':o['id'],'role':o['role'],'nativePixelInterval':[lo,hi],'predictedFullTileCoordinate':pred,'withinRetainedInterval':lo<=pred<=hi,'distanceOutsideIntervalPixels':max(lo-pred,0,pred-hi),'errorStatus':'Interval comparison only; no residual-based role/interval selection, optimization or fitted crop.'})
  frames.append({'reference':frame['reference'],'tileDimensions':[width,height],'model':'Declared full 800x600 viewBox independently scaled to entire tile; no inferred content rectangle','checks':checks,'allIntervalsConsistent':all(c['withinRetainedInterval']for c in checks)})
 result={'generator':rec(Path(__file__)),'inputs':[rec(svg),rec(observations)],'originalRuntimeExecuted':False,'cameraFitAttempted':False,'rendererExecuted':False,'method':'Parse first black-mask SVG path; isolate second (inner aperture) contour. Enumerate endpoints and every interior quadratic derivative zero separately for X/Y. Apply exact source root translation (0,-7).','innerContourSegments':inner,'analyticExtrema':extrema,'candidateParameters':candidates,'fullTileMappingChecks':frames,'contentRectangleHypotheses':[],'contentRectangleStatus':'None added: storyboard-to-tile crop verified, but independent native viewport/letterbox boundary measurements absent. Solving a rectangle from aperture extrema would be observation fitting and circular.','excludedUnscopedSamples':[f['reference']for f in obs['frames']if not f['scopeSample']],'heldoutLimit':'Bottom withheld from top/left/right uses the same aperture curve; it does not supply an independent reticle, border or physical feature family.','limits':['Analytic path boundary is not a historical gradient/raster/compression contour.','Retained manual intervals are exploratory, not calibrated statistical errors.','Version identity and native overlay mapping remain unproved.','Fixed-model interval inconsistency does not uniquely identify letterbox, crop, aspect, shader or edition differences.'],'recommendation':'Retain full-tile hypothesis results; do not change CSS from these coarse samples. Obtain independently measured video content bounds or higher-resolution scoped imagery before adding a crop mapping or precise heldout reticle comparison.'}
 p=OUT/'analytic-outline-diagnostic.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'path':str(p.relative_to(ROOT)),'extrema':extrema,'frames':frames}))
if __name__=='__main__':main()
