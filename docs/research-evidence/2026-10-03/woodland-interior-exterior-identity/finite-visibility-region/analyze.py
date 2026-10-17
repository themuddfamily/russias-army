from pathlib import Path
from fractions import Fraction as F
import json,hashlib,math
P=Path(__file__).resolve().parent;R=P.parents[4];scene=R/'public/assets/original-scenes/woodland/scene.json';s=json.loads(scene.read_text())
def q(x):return F.from_float(x) if isinstance(x,float) else F(x)
def mesh(name):return next(x for x in s['meshes']if x['resource']==name)
def node(name):return next(x for x in s['nodes']if x['name']==name)
def world(name,vid):
 n=node(name);assert n['parent'].lower()=='world';p=mesh(name)['positions'][vid];m=n['matrix'];return [sum(q(m[k*4+j])*q(p[k])for k in range(3))+q(m[12+j]) for j in range(3)]
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def sub(a,b):return [a[i]-b[i]for i in range(2)]
def line(a,b):
 d=sub(b,a);return [-d[1],d[0],d[1]*a[0]-d[0]*a[1]]
def value(h,p):return h[0]*p[0]+h[1]*p[1]+h[2]
def halfplane(a,b,inside,label):
 h=line(a,b);v=value(h,inside);assert v!=0
 if v<0:h=[-x for x in h]
 return {'label':label,'coefficients':h}
def clip(poly,h):
 out=[]
 if not poly:return out
 prev=poly[-1];vp=value(h,prev)
 for cur in poly:
  vc=value(h,cur)
  if (vp<0)!=(vc<0):
   t=vp/(vp-vc);out.append([prev[i]+t*(cur[i]-prev[i])for i in range(2)])
  if vc>=0:out.append(cur)
  prev,vp=cur,vc
 clean=[]
 for p in out:
  if not clean or p!=clean[-1]:clean.append(p)
 if len(clean)>1 and clean[0]==clean[-1]:clean.pop()
 return clean
A=world('stonebarn',184)[:2];B=world('stonebarn',140)[:2];poly=[world('stonebarn',i)[:2]for i in[178,193,224,186]];footprint=poly[:];area2=sum(cross(poly[i],poly[(i+1)%len(poly)])for i in range(len(poly)));assert area2!=0
# Convexity required; retain the original recovered skew and vertex order.
turns=[cross(sub(poly[(i+1)%4],poly[i]),sub(poly[(i+2)%4],poly[(i+1)%4]))for i in range(4)];assert all(t*area2>0 for t in turns)
center=[sum(p[i]for p in poly)/4 for i in range(2)];gap=halfplane(A,B,center,'interior side of gap A to B');constraints=[gap];endpoints={str(i):world('haddingtoncafe',i)[:2]for i in[143,178]}
for vid,p in endpoints.items():
 assert value(gap['coefficients'],p)<0
 constraints.extend([halfplane(p,A,B,f'cafe {vid}: ray P-A side containing B'),halfplane(p,B,A,f'cafe {vid}: ray P-B side containing A')])
stages=[]
for h in constraints:
 poly=clip(poly,h['coefficients']);stages.append({'constraint':h['label'],'remainingVertices':poly[:]})
region_area2=abs(sum(cross(poly[i],poly[(i+1)%len(poly)])for i in range(len(poly))))if poly else F(0)
centroid=[sum(p[i]for p in poly)/len(poly)for i in range(2)]if poly else None
# Strict interior witness must be inside every constraint, including footprint edges.
footprint_h=[halfplane(footprint[i],footprint[(i+1)%4],center,f'footprint edge {i}')for i in range(4)]
all_h=constraints+footprint_h
witness_checks=[]
if centroid:
 for h in all_h:
  val=value(h['coefficients'],centroid);norm=math.hypot(float(h['coefficients'][0]),float(h['coefficients'][1]));witness_checks.append({'constraint':h['label'],'exactPositive':val>0,'normalizedMarginSourceUnits':float(val)/norm})
ray_checks=[]
if centroid:
 for vid,p in endpoints.items():
  d=sub(p,centroid);e=sub(B,A);den=cross(d,e);offset=sub(A,centroid);t=cross(offset,e)/den;u=cross(offset,d)/den;assert 0<t<1 and 0<u<1
  ray_checks.append({'cafeVertex':int(vid),'rayFractionAtGapLine':t,'gapFractionAtoB':u,'strictlyInsideFiniteGap':True})
assert all(value(h['coefficients'],p)>=0 for p in poly for h in all_h)
def enc(obj):
 if isinstance(obj,F):return {'numerator':str(obj.numerator),'denominator':str(obj.denominator),'float':float(obj)}
 if isinstance(obj,list):return [enc(v)for v in obj]
 if isinstance(obj,dict):return {k:enc(v)for k,v in obj.items()}
 return obj
out={'inputScene':str(scene.relative_to(R)),'sceneSha256':hashlib.file_digest(scene.open('rb'),'sha256').hexdigest(),'arithmetic':'Exact Fraction operations on decoded source binary64 values, including column-major node matrix products. No epsilon used in clipping or classification.','nativeAccuracyClaim':False,'gap':{'A184':A,'B140':B},'sourceFootprintVertices':[178,193,224,186],'footprint':footprint,'cafeTopEndpoints':endpoints,'constraints':constraints,'clippingStages':stages,'region':poly,'positiveArea':region_area2>0,'areaSourceUnitsSquared':region_area2/2,'footprintAreaSourceUnitsSquared':abs(area2)/2,'areaFractionOfFootprint':region_area2/abs(area2),'interiorWitness':centroid,'witnessConstraintMargins':witness_checks,'witnessRayChecks':ray_checks,'floatExportValidationToleranceSourceUnits':1e-7,'boundaries':'Closed necessary XY region. Boundary positions may graze a jamb; strict witness avoids all boundaries.','cameraFitAttempted':False,'admittedSourceAnchors':[],'excludedClaims':['Native camera location or pose','Ray heights / native eye height','Other source scene occlusion','Unique native panel identity','Camera pixel residual or heldout gate']}
(P/'region.json').write_text(json.dumps(enc(out),indent=2)+'\n')
print(json.dumps({'regionVertexCount':len(poly),'positiveArea':region_area2>0,'area':float(region_area2/2),'areaFraction':float(region_area2/abs(area2)),'witness':[float(x)for x in centroid]if centroid else None,'minimumWitnessMargin':min(x['normalizedMarginSourceUnits']for x in witness_checks)if witness_checks else None,'rays':enc(ray_checks)},indent=2))
# SVG is source geometry only and includes neither native image nor projected pixels.
allpts=footprint+[A,B]+list(endpoints.values());xmin=min(float(p[0])for p in allpts)-80;xmax=max(float(p[0])for p in allpts)+80;ymin=min(-float(p[1])for p in allpts)-80;ymax=max(-float(p[1])for p in allpts)+80
def pts(ps):return ' '.join(f'{float(p[0])},{-float(p[1])}'for p in ps)
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="{xmin} {ymin} {xmax-xmin} {ymax-ymin}">',f'<rect x="{xmin}" y="{ymin}" width="{xmax-xmin}" height="{ymax-ymin}" fill="white"/>',f'<polygon points="{pts(footprint)}" fill="none" stroke="black" stroke-width="6"/>',f'<polygon points="{pts(poly)}" fill="#d5f4da" stroke="#178c35" stroke-width="5"/>',f'<polyline points="{pts([A,B])}" fill="none" stroke="#00a5b5" stroke-width="12"/>']
if centroid:
 svg.append(f'<circle cx="{float(centroid[0])}" cy="{-float(centroid[1])}" r="8" fill="#178c35"/>')
 for p in endpoints.values():svg.append(f'<polyline points="{pts([centroid,p])}" fill="none" stroke="#777" stroke-width="3"/>')
svg.append(f'<polyline points="{pts(list(endpoints.values()))}" fill="none" stroke="#c22" stroke-width="10"/>');svg.append('</svg>');(P/'region-plan.svg').write_text('\n'.join(svg)+'\n')
