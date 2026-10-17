from pathlib import Path
import json, hashlib, math
P=Path(__file__).resolve().parent; R=P.parents[3]
scene_path=R/'public/assets/original-scenes/woodland/scene.json'
s=json.loads(scene_path.read_text()); m=next(v for v in s['meshes'] if v['resource']=='stonebarn'); pos=m['positions']
A=pos[184];B=pos[140]
def cross_at(c):return (B[0]-A[0])*(c[1]-A[1])-(B[1]-A[1])*(c[0]-A[0])
corners={str(i):{'position':pos[i], 'openingDirectedHalfPlane':cross_at(pos[i])} for i in [178,193,186,224]}
faces=[]
for i, ids in enumerate(m['faces']):
 if 224 not in ids and 140 not in ids and 198 not in ids and 184 not in ids and 183 not in ids:continue
 faces.append({'face':i,'vertices':ids,'positions':[pos[j] for j in ids]})
inputs=[scene_path,R/'public/assets/original-scenes/woodland/textures/stonebarn.png']+[R/'docs/research-evidence/2026-10-03/woodland-interior-reference'/f'frame-{i:02}.png' for i in range(1,7)]
d={'inputs':{str(f.relative_to(R)):hashlib.sha256(f.read_bytes()).hexdigest() for f in inputs},'jambs':{'A':{'bottomId':184,'topId':183,'bottom':A,'top':pos[183]},'B':{'bottomId':140,'topId':198,'bottom':B,'top':pos[198]}},'corners':corners,'incidentFaces':faces,'conditionalImageOrder':{'left':'B','right':'A','assumptions':['The visible opening is the recovered large interior long-wall gap.','Viewpoint is inside the room on the positive directed half-plane of A to B.','Ordinary perspective uses screen right = viewing direction cross world up, without image reflection.','Both jamb rays have positive perspective depth.','The explicit same-height endpoint formula uses a level camera; arbitrary native pitch and roll remain unproved.'],'identityStatus':'conditional geometry ordering; no admitted pixel endpoint or camera anchor'},'corner224Status':'conditional candidate for left far-wall/floor junction when viewing the positive-local-X gable; the observed seam need not be a mesh corner','nativeProjectionHandedness':'not independently recovered in this investigation'}
(P/'identity.json').write_text(json.dumps(d,indent=2)+'\n')
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="-1060 -280 760 520"><rect x="-1060" y="-280" width="760" height="520" fill="#fff"/>']
for i,j in [(178,193),(193,224),(224,186),(186,140),(184,178)]:
 a,b=pos[i],pos[j];svg.append(f'<line x1="{a[0]}" y1="{-a[1]}" x2="{b[0]}" y2="{-b[1]}" stroke="#333" stroke-width="4"/>')
svg.append(f'<line x1="{A[0]}" y1="{-A[1]}" x2="{B[0]}" y2="{-B[1]}" stroke="#00a2a2" stroke-width="4" stroke-dasharray="8 5"/>')
for name,i in [('178',178),('193',193),('186',186),('224 blind-end candidate',224),('A184',184),('B140',140)]:
 p=pos[i];svg.append(f'<circle cx="{p[0]}" cy="{-p[1]}" r="5" fill="#d22"/><text x="{p[0]+8}" y="{-p[1]-8}" font-size="13">{name}</text>')
svg.append('<text x="-1030" y="200" font-size="15">Source XY plan; up on page is +local Y. No camera fit.</text></svg>')
(P/'source-plan.svg').write_text('\n'.join(svg)+'\n')
print(json.dumps({'corners':corners,'conditionalImageOrder':d['conditionalImageOrder']},indent=2))
