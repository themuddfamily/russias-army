from pathlib import Path
import json,hashlib,math
P=Path(__file__).resolve().parent;R=P.parents[3]
s=json.loads((R/'public/assets/original-scenes/woodland/scene.json').read_text())
m=next(x for x in s['meshes'] if x['resource']=='haddingtoncafe'); n=next(x for x in s['nodes'] if x['name']=='haddingtoncafe');mat=n['matrix'];v=m['positions'];uv=m['tex_coords'][0]
def transform(p):return [sum(mat[k*4+j]*p[k] for k in range(3))+mat[12+j] for j in range(3)]
def normal(t):
 a,b,c=t;u=[b[i]-a[i] for i in range(3)];w=[c[i]-a[i] for i in range(3)];q=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];l=math.sqrt(sum(x*x for x in q));return [x/l if l else 0 for x in q]
faces=[]
for i,f in enumerate(m['faces']):
 pts=[v[j] for j in f];pixels=[[(uv[j][0]+.5)*512-.5,(.5-uv[j][1])*512-.5] for j in f]
 faces.append({'face':i,'vertexIds':f,'localPositions':pts,'sourceWorldPositions':[transform(p) for p in pts],'atlasPixels':pixels,'normal':normal(pts)})
# Retain every face whose entire UV support falls in the visually identified two-window panel.
# This is an atlas-patch classification, not a source/native corner correspondence.
panel=[f for f in faces if all(349<=a<=512 and 126<=b<=221 for a,b in f['atlasPixels'])]
out={'sceneNode':n,'parent':'World (stored identity-root transform)','allFaces':faces,'twoWindowPanelAtlasBox':[349,126,512,221],'whollyPanelFaces':panel,'admittedSourceAnchors':[],'cameraFitAttempted':False}
(P/'geometry.json').write_text(json.dumps(out,indent=2)+'\n')
print('vertices',len(v),'faces',len(faces),'panel faces',len(panel))
for f in panel:print(json.dumps(f))
print('bounds',[[min(transform(p)[i] for p in v),max(transform(p)[i] for p in v)] for i in range(3)])
