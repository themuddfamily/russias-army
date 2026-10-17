from pathlib import Path
from fractions import Fraction as F
import json
P=Path(__file__).resolve().parent
# Execute shared exact helpers and source scene loader only, never prior generators.
namespace={'__file__':str(P/'analyze.py')};exec((P/'analyze.py').read_text().split('A3=world')[0],namespace)
world=namespace['world'];halfplane=namespace['halfplane'];value=namespace['value'];q=namespace['q']
s=json.loads((P/'ray-results.json').read_text());r=json.loads((P/'region.json').read_text())
def dec(x):return F(int(x['numerator']),int(x['denominator']))
C=[q(x)for x in s['actualSourceCamera']];feet=q(s['support']['sourceFeetZ']);lo,hi=map(dec,r['conditionalFloorSeamInterval']);assert lo<=feet<=hi
A=world('stonebarn',184);B=world('stonebarn',140);T=world('stonebarn',183);U=world('stonebarn',198)
center=[sum(world('stonebarn',j)[i]for j in[178,193,224,186])/4 for i in range(2)];L=halfplane(A[:2],B[:2],center,'gap')['coefficients']
e=[B[i]-A[i]for i in range(2)];e2=sum(x*x for x in e);checks=[]
for vid in[143,178]:
 p=world('haddingtoncafe',vid);lc=value(L,C[:2]);lp=value(L,p[:2]);t=lc/(lc-lp);Q=[C[i]*(1-t)+p[i]*t for i in range(3)];u=sum((Q[i]-A[i])*e[i]for i in range(2))/e2
 bottom=A[2]*(1-u)+B[2]*u;top=T[2]*(1-u)+U[2]*u
 assert 0<t<1 and 0<u<1 and bottom<Q[2]<top
 checks.append({'vertex':vid,'t':float(t),'u':float(u),'gapHeight':float(Q[2]),'clearanceAboveBottom':float(Q[2]-bottom),'clearanceBelowTop':float(top-Q[2])})
assert s['support']['playerIntersects'] is False and all(x['hit'] is None for x in s['rays']) and s['totalPublicCallsIncludingInternalPlayerIntersects']==5
out={'actualFloatCameraRecheckedWithExactFractions':True,'feetWithinConditionalSeamInterval':True,'allEndpointRayHeightsStrictlyInsideGap':True,'checks':checks,'nativeRuntimeClaim':False,'admittedSourceAnchors':[]}
(P/'supported-witness-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
