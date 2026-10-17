"""Bounded, conditional four-endpoint perspective diagnostic; standard library only."""
import hashlib
import itertools
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
INPUT = HERE.parent.parent / 'woodland-interior-exterior-identity/finite-aperture-height/region.json'
j = json.loads(INPUT.read_text())
def floats(v): return [x['float'] for x in v]
points = [floats(j['gap']['top198']), floats(j['gap']['top183']),
          floats(j['cafeEndpoints']['143']), floats(j['cafeEndpoints']['178'])]
pixels = [[931.,199.],[1140.,149.],[980.,246.],[1107.,246.]]
boxes = [[926,194,936,204],[1136,145,1144,153],[975,241,985,251],[1102,241,1112,251]]
polygon = [floats(v) for v in j['region']]
height = sum(floats(j['conditionalEyeInterval'])) / 2
focal = 574 / (2 * math.tan(math.radians(50) / 2))
horizontal_stretch = (1280 / 800) / (574 / 600)
focal_x = focal * horizontal_stretch
count = 0
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def sub(a,b): return [x-y for x,y in zip(a,b)]
def norm(a): return math.sqrt(dot(a,a))
def unit(a): return [x/norm(a) for x in a]
def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def mul(A,B): return [[sum(A[i][k]*B[k][z] for k in range(3)) for z in range(3)] for i in range(3)]
def transpose(A): return list(map(list,zip(*A)))
def transform(A,v): return [dot(row,v) for row in A]
def inside(x,y):
    signs = [(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]) for a,b in zip(polygon,polygon[1:]+polygon[:1])]
    return min(signs)>=0 or max(signs)<=0
def frame(a,b):
    e0=unit([x+y for x,y in zip(a,b)])
    e1=unit(sub(a,b))
    return transpose([e0,e1,cross(e0,e1)])
image_rays = [unit([(x-640)/focal_x,(y-287)/focal,1]) for x,y in pixels]
def pair_rotation(C):
    rays=[unit(sub(p,C)) for p in points[:2]]
    return mul(frame(*image_rays[:2]),transpose(frame(*rays)))
def rodrigues(v):
    theta=norm(v)
    if theta<1e-15: return [[1,0,0],[0,1,0],[0,0,1]]
    u=[x/theta for x in v]; c=math.cos(theta); s=math.sin(theta)
    K=[[0,-u[2],u[1]],[u[2],0,-u[0]],[-u[1],u[0],0]]
    return [[(c if i==k else 0)+(1-c)*u[i]*u[k]+s*K[i][k] for k in range(3)] for i in range(3)]
def project(C,R):
    out=[]
    for p in points:
        x,y,z=transform(R,sub(p,C))
        if z<=0: return None
        out.append([640+focal_x*x/z,287+focal*y/z])
    return out
def evaluate(v,R0=None):
    global count
    count+=1
    if count>2000: raise RuntimeError('Hard cap: 2,000 evaluations')
    C=[v[0],v[1],height]
    if not inside(*C[:2]): return None
    R=pair_rotation(C) if R0 is None else mul(rodrigues(v[2:]),R0)
    out=project(C,R)
    if out is None: return None
    residual=[a-b for p,q in zip(out,pixels) for a,b in zip(p,q)]
    return sum(x*x for x in residual),residual,out,R
grid=[]
for ix in range(31):
    x=min(p[0] for p in polygon)+(max(p[0] for p in polygon)-min(p[0] for p in polygon))*ix/30
    for iy in range(31):
        y=min(p[1] for p in polygon)+(max(p[1] for p in polygon)-min(p[1] for p in polygon))*iy/30
        e=evaluate([x,y])
        if e is not None: grid.append((e[0],x,y))
best=min(grid)
v=[best[1],best[2],0.,0.,0.]
R0=pair_rotation([v[0],v[1],height])
trace=[]
def solve(A,b):
    A=[row[:]+[z] for row,z in zip(A,b)]
    for i in range(len(b)):
        pivot=max(range(i,len(b)),key=lambda k:abs(A[k][i]))
        A[i],A[pivot]=A[pivot],A[i]
        if abs(A[i][i])<1e-20: return None
        t=A[i][i]; A[i]=[x/t for x in A[i]]
        for k in range(len(b)):
            if k!=i:
                t=A[k][i]; A[k]=[a-t*c for a,c in zip(A[k],A[i])]
    return [row[-1] for row in A]
for iteration in range(50):
    current=evaluate(v,R0)
    derivatives=[]
    for k,h in enumerate([.001,.001,1e-6,1e-6,1e-6]):
        w=v[:]; w[k]+=h; e=evaluate(w,R0)
        if e is None: break
        derivatives.append([(a-b)/h for a,b in zip(e[1],current[1])])
    if len(derivatives)!=5: break
    H=[[dot(a,b) for b in derivatives] for a in derivatives]
    b=[-dot(a,current[1]) for a in derivatives]
    accepted=False
    for damping in [1e-6,1e-3,1,100]:
        Hd=[row[:] for row in H]
        for k in range(5): Hd[k][k]+=damping*max(H[k][k],1e-12)
        step=solve(Hd,b)
        if step is None: continue
        w=[a+b for a,b in zip(v,step)]; e=evaluate(w,R0)
        if e is not None and e[0]<current[0]:
            v=w; accepted=True; trace.append({'iteration':iteration,'squaredPixelResidual':e[0],'parameters':v[:]});break
    if not accepted or abs(current[0]-e[0])<1e-10: break
final=evaluate(v,R0)
C=[v[0],v[1],height]
def angle(a,b): return math.degrees(math.acos(max(-1,min(1,dot(unit(a),unit(b))))))
pairs=[]
for a,b in itertools.combinations(range(4),2):
    source=angle(sub(points[a],C),sub(points[b],C))
    native=angle(image_rays[a],image_rays[b])
    box_angles=[]
    for xa,ya in itertools.product([boxes[a][0],boxes[a][2]],[boxes[a][1],boxes[a][3]]):
        for xb,yb in itertools.product([boxes[b][0],boxes[b][2]],[boxes[b][1],boxes[b][3]]):
            box_angles.append(angle([(xa-640)/focal_x,(ya-287)/focal,1],[(xb-640)/focal_x,(yb-287)/focal,1]))
    pairs.append({'pair':[a,b],'sourceDegrees':source,'nativeCenterDegrees':native,
                  'centerDifferenceDegrees':source-native,'cornerSampleDegreesRange':[min(box_angles),max(box_angles)],
                  'cornerRangeIsNotCertifiedContinuousBoxBound':True})
checks=[]
for label,pred,obs,box in zip(['gap198','gap183','cafe143','cafe178'],final[2],pixels,boxes):
    checks.append({'conditionalEndpoint':label,'nativeBox':box,'nativeCenter':obs,'predicted':pred,
                   'residualPixels':sub(pred,obs),'euclideanResidualPixels':norm(sub(pred,obs)),
                   'insideBox':box[0]<=pred[0]<=box[2] and box[1]<=pred[1]<=box[3],
                   'role':'conditional training; not an admitted anchor'})
result={'scope':'Conditional four-point compatibility only; all points training, no heldouts, no native camera recovery.',
 'assumptions':{'verticalFovDegrees':50,'width':1280,'height':574,'principalPoint':[640,287],
                'recordedSquareProjectionPixels':False,'assumedAuthoredFullCameraSprite':[800,600],
                'conditionalHorizontalStretch':horizontal_stretch,'focalX':focal_x,'focalY':focal,
                'recordingTransformObserved':False,'fullCameraUncroppedRecordingAssumed':True,'unreflectedPerspective':True,'sourceEyeZ':height,
                'standingHeightIsSeamBasedAtCandidateAndNotPhysicallyVerified':True},
 'method':'31x31 finite XY grid; exact two-ray frame initialization; bounded five-variable damped Gauss-Newton. Not exhaustive.',
 'evaluations':count,'gridInteriorCandidates':len(grid),'gridBestSquaredResidual':best[0],
 'candidateSourceCamera':C,'worldToCameraRightDownForward':final[3],
 'sumSquaredPixelResidual':final[0],'rootMeanSquaredCoordinateResidual':math.sqrt(final[0]/8),
 'conditionalEndpointResiduals':checks,'allPredictionsInsidePredeclaredBoxes':all(x['insideBox'] for x in checks),
 'rotationInvariantPairs':pairs,'refinementTrace':trace,'admittedSourceAnchors':[],
 'heldoutEndpoints':[],'productionChanged':False,'nativeCameraFitPromoted':False,
 'inputSha256':hashlib.sha256(INPUT.read_bytes()).hexdigest()}
(HERE/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'evaluations':count,'camera':C,'rmsCoordinatePixels':result['rootMeanSquaredCoordinateResidual'],
                  'allBoxes':result['allPredictionsInsidePredeclaredBoxes'],'endpoints':checks},indent=2))
