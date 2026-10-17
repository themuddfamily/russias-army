import json,hashlib
from pathlib import Path
p=Path(__file__).resolve().parent
s=json.loads((p/'settings.json').read_text()); a=(p/'baseline.rgba').read_bytes();b=(p/'intervention.rgba').read_bytes(); w,h=1280,576
points=sorted(s['points'],key=lambda q:q['x'])
def edge(x):
 for l,r in zip(points,points[1:]):
  if l['x']<=x<=r['x']:return l['y']+(r['y']-l['y'])*(x-l['x'])/(r['x']-l['x'])
 return None
def pixel(x,y):
 i=((h-1-y)*w+x)*4
 return list(a[i:i+4]),list(b[i:i+4])
def region(predicate):
 n=changed=0;mx=total=0;box=None;strong=None
 for y in range(h):
  for x in range(w):
   if not predicate(x,y):continue
   n+=1;u,v=pixel(x,y);d=max(abs(c-e) for c,e in zip(u,v));total+=sum(abs(c-e) for c,e in zip(u[:3],v[:3]))
   if d:
    changed+=1
    if box is None:box=[x,y,x,y]
    else:box=[min(box[0],x),min(box[1],y),max(box[2],x),max(box[3],y)]
   if d>mx:mx=d;strong={'x':x,'y':y,'baseline':u,'clampT':v,'projectedEdgeY':edge(x+.5)}
 return {'pixels':n,'changedPixels':changed,'maxChannelDelta':mx,'meanAbsoluteRgbDelta':total/(n*3),'changedBoundsInclusive':box,'strongestPixel':strong}
result={'scope':'RGBA readPixels causal current-copy isolation, not native material correctness','edgeBandDefinition':'pixel center within 3 pixels of piecewise projected cylinder upper edge','distantControlDefinition':'x=100..1179 inclusive; y=235..254 inclusive (inside distant sky below top edge, above treeline)','edgeBand':region(lambda x,y:edge(x+.5) is not None and abs(y+.5-edge(x+.5))<=3),'distantControl':region(lambda x,y:100<=x<1180 and 235<=y<255),'entireCanvas':region(lambda x,y:True)}
(p/'measurements.json').write_text(json.dumps(result,indent=2)+'\n'); print(json.dumps(result))
