#!/usr/bin/env python3
"""Passive independent storyboard video-content bounds; no aperture fit."""
from pathlib import Path
from PIL import Image
import hashlib,json,statistics
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'docs/research-evidence/2026-10-03/scope-registration-observations'
def rec(p):return {'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def main():
 base=ROOT/'docs/research-evidence/2026-09-30';obs=OUT/'observations.json';prior=OUT/'analytic-outline-diagnostic.json';o=json.loads(obs.read_text());analytic=json.loads(prior.read_text());sheets=[('barrack-2012-sheet-2.jpg',120,[50,51,52,53,54]),('woodland-2014-sheet-4.jpg',200,[113,114,115,116,117])];records=[]
 for name,w,samples in sheets:
  p=base/name;im=Image.open(p).convert('RGB');tiles=[]
  for sample in samples:
   index=sample%25;xy=[(index%5)*w,(index//5)*90];t=im.crop((xy[0],xy[1],xy[0]+w,xy[1]+90));rows=[]
   for y in range(90):
    pixels=[t.getpixel((x,y))for x in range(w)];deviation=[max(abs(c-16)for c in px)for px in pixels]
    rows.append({'row':y,'exactGrey16Pixels':sum(px==(16,16,16)for px in pixels),'medianMaxChannelDeviationFromGrey16':statistics.median(deviation),'meanMaxChannelDeviationFromGrey16':sum(deviation)/w,'meanMaxChannel':sum(max(px)for px in pixels)/w,'grey16PixelCountsAtChannelAllowances':{str(a):sum(v<=a for v in deviation)for a in [0,4,8,16]}})
   tiles.append({'sampleIndex':sample,'sheetCropOrigin':xy,'dimensions':[w,90],'rowProfiles':rows})
  records.append({'sheet':rec(p),'tileProfiles':tiles})
 # Rectangle was independently observed from shared video bars in unscoped tiles, not solved from aperture.
 rect={'edition':'barrack','classification':'Approximate video-content rectangle, not proven native game camera rectangle','nominalPixelEdgeBounds':[0,10,120,80],'topEdgeInterval':[9,11],'bottomEdgeInterval':[79,81],'horizontalLimits':'Content reaches horizontal tile limits; hidden source/video crop is unknown. No independent inset found.','evidenceSamples':[50,51,52,53,54],'measurementBasis':'Shared grey16 top/bottom bands and unscoped scene/HUD transitions; rows81..89 exact grey across all five tiles. Source aperture not used to choose boundaries.','pixelConvention':'Continuous tile edge coordinates; approximate content rows10..79.'}
 checks=[]
 barrack=next(f for f in o['frames']if 'barrack' in f['reference']['path']);extrema=analytic['analyticExtrema']
 for observation in barrack['observations']:
  if 'nativeTileCoordinateInterval'not in observation:continue
  name=observation['id'].split('-')[0];axis=0 if observation['axis']=='x'else 1;value=extrema[name]['translatedSvgPoint'][axis]
  if axis==0:nominal=value*120/800;predictions=[nominal]
  else:nominal=10+value*70/600;predictions=[top+value*(bottom-top)/600 for top in rect['topEdgeInterval']for bottom in rect['bottomEdgeInterval']]
  lo,hi=observation['nativeTileCoordinateInterval'];checks.append({'observation':observation['id'],'role':observation['role'],'retainedInterval':[lo,hi],'nominalRectanglePrediction':nominal,'predictionRangeFromIndependentEdgeIntervals':[min(predictions),max(predictions)],'nominalWithinRetainedInterval':lo<=nominal<=hi})
 result={'generator':rec(Path(__file__)),'inputs':[rec(obs),rec(prior),rec(base/'remaining-weapons-storyboard-provenance.json')],'originalRuntimeExecuted':False,'fitAttempted':False,'browserExecuted':False,'sheetDiagnostics':records,'independentlyObservedBarrackVideoContentRectangle':rect,'barrackDeclaredRectangleMappingChecks':checks,'woodlandAssessment':{'samples':[113,114,115,116,117],'unscopedEvidence':[113,114],'result':'Unscoped scene/HUD occupy outer top/bottom rows; scoped black surround does not independently establish video letterbox. No positive-height top/bottom bar is identified.','candidateOuterVideoContentBounds':[0,0,200,90],'status':'Outer tile is consistent with visible unscoped content; native game viewport/crop remains unproved.'},'heldoutLimit':'Bottom remains same-curve diagnostic; independent content bounds do not turn it into independent reticle/border validation.','limits':['Storyboard compression contaminates transition rows and upper grey bars.','Observed video bars can be publisher/recorder padding; source camera/overlay mapping is still conditional.','No native viewport, FOV, crop, edition identity or shader equality established.','No finer reticle landmarks recovered; no production CSS correction justified by coarse agreement alone.']}
 for tile in records[0]['tileProfiles']:assert all(tile['rowProfiles'][y]['exactGrey16Pixels']==120 for y in range(81,90))
 p=OUT/'independent-content-bounds.json';p.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'path':str(p.relative_to(ROOT)),'barrackRectangle':rect,'mappingChecks':checks}))
if __name__=='__main__':main()
