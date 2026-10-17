"""Finite image-colour measurements; no renderer, camera search or runtime execution."""
from pathlib import Path
import hashlib,json
from PIL import Image

ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
FRAME=ROOT/'docs/research-evidence/2026-10-03/woodland-interior-endpoints/frame-05.png'
PROV=ROOT/'public/assets/original-normal-ui/provenance.json'
im=Image.open(FRAME).convert('RGB')
assert im.size==(1280,574)
p=im.load()
def bbox(points):
    return [min(x for x,y in points),min(y for x,y in points),max(x for x,y in points)+1,max(y for x,y in points)+1] if points else None
measurements=[]
for rmin,ratio in [(80,1.8),(100,2.0),(120,2.5)]:
    def red(x,y):
        r,g,b=p[x,y]
        return r>=rmin and r>=ratio*max(1,g) and r>=ratio*max(1,b)
    # Predeclared disjoint search regions from the source reticle and corner-logo placements.
    center=[(x,y) for y in range(250,325) for x in range(595,690) if red(x,y)]
    logo=[(x,y) for y in range(480,550) for x in range(1140,1280) if red(x,y)]
    # Record every coordinate rather than hand selecting an edge.
    measurements.append({'threshold':[rmin,ratio],'reticle':{'bboxExclusive':bbox(center),'pixels':center},'logo':{'bboxExclusive':bbox(logo),'count':len(logo)}})

pr=json.loads(PROV.read_text())
mat=pr['outputs']['emblem-woodland']['placementMatrices'][0]
redfills=[f for f in pr['editionContents']['woodland']['shapes']['7']['fills'] if f['style']['rgba']==[255,0,0,255]]
rectpath='M 288.65 134.8 L 404.1 134.8 L 404.1 204.8 L 287.45 204.8 L 282.15 204.8 L 258.1 204.8 L 258.1 134.8 L 287.15 134.8 L 288.65 134.8 Z'
assert any(rectpath in f['paths'] for f in redfills)
source=[mat[0]*258.1+mat[4],mat[3]*134.8+mat[5],mat[0]*404.1+mat[4],mat[3]*204.8+mat[5]]
stretch=[1280/800,574/600]
predicted=[source[0]*stretch[0],source[1]*stretch[1],source[2]*stretch[0],source[3]*stretch[1]]
# Measured colour bbox edges can retreat because of filtering and codec chroma bleed.
# Two recorded pixels per edge is a declared sensitivity envelope, not a confidence interval.
observed=measurements[1]['logo']['bboxExclusive']
assert observed is not None
width,height=observed[2]-observed[0],observed[3]-observed[1]
dx,dy=source[2]-source[0],source[3]-source[1]
intervals={'scaleX':[(width-4)/dx,(width+4)/dx],'scaleY':[(height-4)/dy,(height+4)/dy]}
out={'schemaVersion':1,'frameSize':list(im.size),'thresholdSensitivity':measurements,'sourceLogoRedRectangle':source,'sourceReticleCenter':[400,300],'declaredWholeSpriteStretch':{'scale':stretch,'logoRectangle':predicted,'reticleCenter':[640,287]},'edgeSensitivityPixels':2,'measuredLogoDimensions':[width,height],'conditionalOverlayScaleIntervals':intervals,'sameAxisScaleIntervalsOverlap':max(intervals['scaleX'][0],intervals['scaleY'][0])<=min(intervals['scaleX'][1],intervals['scaleY'][1]),'limitations':['Conditional correspondence of recorded ARMУ badge with recovered frame-two UI character7.','Colour bounding rectangles are codec/raster dependent; two-pixel sensitivity is declared, not calibrated native error.','UI overlay transform is not camera.rect or 3D projection geometry.','No native camera or geometry anchor admitted.']}
(OUT/'result.json').write_text(json.dumps(out,indent=2)+'\n')
inputs=[FRAME,PROV,ROOT/'public/assets/original-normal-ui/crosshair.svg',ROOT/'public/assets/original-normal-ui/emblem-woodland.svg',ROOT/'docs/research-evidence/2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 5 - goody.ls',ROOT/'docs/research-evidence/2026-10-01/native-gameplay-sprite-constraint.json',ROOT/'public/assets/legacy-woodland/provenance.json',Path(__file__),OUT/'result.json']
(OUT/'hashes.json').write_text(json.dumps([{'path':str(q.relative_to(ROOT)),'bytes':q.stat().st_size,'sha256':hashlib.file_digest(q.open('rb'),'sha256').hexdigest()} for q in inputs],indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k!='thresholdSensitivity'},indent=2))
