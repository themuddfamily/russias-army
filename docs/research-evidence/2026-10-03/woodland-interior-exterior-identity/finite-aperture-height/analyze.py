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
A3=world('stonebarn',184);B3=world('stonebarn',140);T3=world('stonebarn',183);U3=world('stonebarn',198)
A=A3[:2];B=B3[:2];assert T3[:2]==A and U3[:2]==B
corners=[world('stonebarn',i)for i in[178,193,224,186]];footprint=[p[:2]for p in corners]
center=[sum(p[i]for p in footprint)/4 for i in range(2)]
area2=sum(cross(footprint[i],footprint[(i+1)%4])for i in range(4));assert all(cross(sub(footprint[(i+1)%4],footprint[i]),sub(footprint[(i+2)%4],footprint[(i+1)%4]))*area2>0 for i in range(4))
gap=halfplane(A,B,center,'room side of gap');L=gap['coefficients'];constraints=[gap]
endpoints={str(i):world('haddingtoncafe',i)for i in[143,178]}
floor_interval=[min(p[2]for p in corners),max(p[2]for p in corners)];eye_interval=[z+85 for z in floor_interval]
e=sub(B,A);e2=sum(v*v for v in e)
def height_value(C,P,zc,zA,zB):
 lc=value(L,C);lp=value(L,P[:2]);assert lp<0
 D=lc-lp;Nxy=[-lp*C[i]+lc*P[i]for i in range(2)];Nz=-lp*zc+lc*P[2]
 return (Nz-D*zA)*e2-(zB-zA)*sum((Nxy[i]-D*A[i])*e[i]for i in range(2))
def height_plane(P,zc,zA,zB,above,label):
 def f(C):return height_value(C,P,zc,zA,zB)*(1 if above else -1)
 c=f([F(0),F(0)]);return {'label':label,'coefficients':[f([F(1),F(0)])-c,f([F(0),F(1)])-c,c]}
for vid,p in endpoints.items():
 assert value(L,p[:2])<0
 constraints.extend([halfplane(p[:2],A,B,f'{vid}: XY side P-A'),halfplane(p[:2],B,A,f'{vid}: XY side P-B')])
 # Necessary bounds permit the most favorable camera height separately for each inequality.
 constraints.extend([height_plane(p,eye_interval[1],A3[2],B3[2],True,f'{vid}: above finite bottom, maximal eye'),height_plane(p,eye_interval[0],T3[2],U3[2],False,f'{vid}: below finite top, minimal eye')])
poly=footprint[:];stages=[]
for h in constraints:
 poly=clip(poly,h['coefficients']);stages.append({'constraint':h['label'],'vertices':poly[:]})
assert poly
witness=[sum(p[i]for p in poly)/len(poly)for i in range(2)];eye=sum(eye_interval)/2
allh=constraints+[halfplane(footprint[i],footprint[(i+1)%4],center,f'footprint {i}')for i in range(4)]
assert all(value(h['coefficients'],p)>=0 for p in poly for h in allh)
assert all(value(h['coefficients'],witness)>0 for h in allh)
rays=[]
for vid,p in endpoints.items():
 lc=value(L,witness);lp=value(L,p[:2]);t=lc/(lc-lp);Q=[witness[i]*(1-t)+p[i]*t for i in range(2)]+[eye*(1-t)+p[2]*t];u=sum((Q[i]-A[i])*e[i]for i in range(2))/e2
 bottom=A3[2]*(1-u)+B3[2]*u;top=T3[2]*(1-u)+U3[2]*u
 assert 0<t<1 and 0<u<1 and bottom<Q[2]<top
 rays.append({'cafeVertex':int(vid),'t':t,'u':u,'gapIntersection':Q,'bottomZ':bottom,'topZ':top,'bottomClearance':Q[2]-bottom,'topClearance':top-Q[2]})
def enc(obj):
 if isinstance(obj,F):return {'numerator':str(obj.numerator),'denominator':str(obj.denominator),'float':float(obj)}
 if isinstance(obj,list):return [enc(v)for v in obj]
 if isinstance(obj,dict):return {k:enc(v)for k,v in obj.items()}
 return obj
region_area2=abs(sum(cross(poly[i],poly[(i+1)%len(poly)])for i in range(len(poly))))
out={'scene':str(scene.relative_to(R)),'arithmetic':'Exact rational operations on decoded binary64 source inputs; zero clipping epsilon.','footprintCornerVertices':[178,193,224,186],'footprintCornersXYZ':corners,'gap':{'bottom184':A3,'bottom140':B3,'top183':T3,'top198':U3},'cafeEndpoints':endpoints,'conditionalFloorSeamInterval':floor_interval,'conditionalEyeInterval':eye_interval,'eyeOffsetSourceUnits':85,'physicalSupportVerified':False,'floorSeamIsPhysicalFloorAssumed':False,'heightBoundsMeaning':'Necessary conditional bound only: each inequality independently uses favorable endpoint of seam-height plus85 interval. Camera support must be separately checked.','constraints':constraints,'clippingStages':stages,'region':poly,'area':region_area2/2,'areaFractionOfFootprint':region_area2/abs(area2),'strictWitness':[witness[0],witness[1],eye],'witnessChecks':rays,'cameraFitAttempted':False,'admittedSourceAnchors':[],'nativeEyeHeightVerified':False}
(P/'region.json').write_text(json.dumps(enc(out),indent=2)+'\n')
(P/'witness-float.json').write_text(json.dumps({'sourceCamera':[float(witness[0]),float(witness[1]),float(eye)],'targets':{vid:[float(x)for x in p]for vid,p in endpoints.items()}},indent=2)+'\n')
print(json.dumps({'vertices':len(poly),'area':float(region_area2/2),'areaFraction':float(region_area2/abs(area2)),'witness':[float(witness[0]),float(witness[1]),float(eye)],'rays':enc(rays)},indent=2))
