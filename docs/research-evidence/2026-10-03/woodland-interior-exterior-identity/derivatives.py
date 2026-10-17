from pathlib import Path
import json,hashlib,math
from PIL import Image
P=Path(__file__).resolve().parent;R=P.parents[3];ref=R/'docs/research-evidence/2026-10-03/woodland-interior-endpoints/frame-05.png';tex=R/'public/assets/original-scenes/woodland/textures/haddingtoncafe.png';s=json.loads((R/'public/assets/original-scenes/woodland/scene.json').read_text());m=next(x for x in s['meshes']if x['resource']=='stonebarn');n=next(x for x in s['nodes']if x['name']=='stonebarn');v=m['positions'];mat=n['matrix']
def t(p):return [sum(mat[k*4+j]*p[k]for k in range(3))+mat[12+j]for j in range(3)]
Image.open(ref).crop((920,185,1150,320)).resize((920,540),Image.Resampling.NEAREST).save(P/'cafe-inspection.png')
Image.open(tex).crop((345,125,512,225)).resize((668,400),Image.Resampling.NEAREST).save(P/'atlas-panel-inspection.png')
g=json.loads((P/'geometry.json').read_text());panel=[f for f in g['whollyPanelFaces']if f['face']in[36,44,93]];a=t(v[184]);b=t(v[140]);corners=[t(v[j])for j in[178,193,224,186]]
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def minus(a,b):return [a[i]-b[i]for i in range(2)]
results=[]
for name,c in [('corner'+str(j),t(v[j]))for j in[178,193,224,186]]+[('footprint-centroid',[sum(p[i]for p in corners)/4 for i in range(3)])]:
 for vid in[178,143]:
  p=next(f['sourceWorldPositions'][f['vertexIds'].index(vid)]for f in panel if vid in f['vertexIds']);d=minus(p,c);e=minus(b,a);den=cross(d,e);q=minus(a,c);ray=cross(q,e)/den;gap=cross(q,d)/den
  results.append({'cameraPlanSample':name,'cameraSourceXYZ':c,'cafeVertex':vid,'cafeSourceXYZ':p,'rayFractionAtGapLine':ray,'gapFractionAtoB':gap,'withinFiniteGapPlanOnly':0<ray<1 and 0<=gap<=1})
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="850" height="850" viewBox="350 300 2500 2550"><rect x="350" y="300" width="2500" height="2550" fill="white"/>']
svg.append('<polygon points="'+' '.join(f'{p[0]},{-p[1]}'for p in corners)+'" fill="none" stroke="black" stroke-width="8"/>')
svg.append(f'<line x1="{a[0]}" y1="{-a[1]}" x2="{b[0]}" y2="{-b[1]}" stroke="cyan" stroke-width="14"/>')
for f in panel:
 svg.append('<polygon points="'+' '.join(f'{p[0]},{-p[1]}'for p in f['sourceWorldPositions'])+'" fill="none" stroke="red" stroke-width="5"/>')
for r in results[-2:]:
 c=r['cameraSourceXYZ'];p=r['cafeSourceXYZ'];svg.append(f'<line x1="{c[0]}" y1="{-c[1]}" x2="{p[0]}" y2="{-p[1]}" stroke="#888" stroke-width="3"/>')
svg.append('<text x="400" y="400" font-size="45">Recovered source XY plan; no fitted native camera</text></svg>');(P/'source-plan.svg').write_text('\n'.join(svg)+'\n')
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512"><image href="../../../../public/assets/original-scenes/woodland/textures/haddingtoncafe.png" width="512" height="512"/>']
for f in panel:
 pts=f['atlasPixels'];cx=sum(p[0]for p in pts)/3;cy=sum(p[1]for p in pts)/3;svg.append('<polygon points="'+' '.join(f'{p[0]},{p[1]}'for p in pts)+'" fill="none" stroke="cyan" stroke-width="1"/>');svg.append(f'<text x="{cx}" y="{cy}" fill="cyan" font-size="9">{f["face"]}</text>')
svg.append('</svg>');(P/'panel-uv.svg').write_text('\n'.join(svg)+'\n')
out={'inputs':{str(p.relative_to(R)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in[ref,tex,R/'public/assets/original-scenes/woodland/scene.json']},'derivatives':[{'file':'cafe-inspection.png','crop':[920,185,1150,320],'scale':4},{'file':'atlas-panel-inspection.png','crop':[345,125,512,225],'scale':4}],'resampling':'nearest-neighbor','contrastAdjustment':False,'finitePlanRaySamples':results,'raySampleMeaning':'Necessary source-XY aperture alignment only. No camera pose selected, no ray height or other occluders tested; source room corners are not native camera coordinates.','admittedSourceAnchors':[],'cameraFitAttempted':False};(P/'provenance.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(results,indent=2))
