from pathlib import Path
import hashlib,json,re
from PIL import Image,ImageDraw
P=Path(__file__).resolve().parent;ROOT=P.parents[3]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
src=ROOT/'docs/research-evidence/2026-09-30/woodland-video-first45s.mp4'
scene_path=ROOT/'public/assets/original-scenes/woodland/scene.json';scene=json.loads(scene_path.read_text())
canvas=Image.new('RGB',(1280,636));draw=ImageDraw.Draw(canvas)
for i in range(6):
 im=Image.open(P/f'frame-{i+1:02}.png');im.thumbnail((640,287));x=(i%2)*640;y=(i//2)*212
 im=im.resize((448,201));canvas.paste(im,(x,y));draw.text((x+454,y+8),f'{21+i}.0 s\nframe {210+10*i}',fill='white')
canvas.save(P/'six-frame-context.png')
records=json.loads((P/'woodland-22s-stonebarn-matches.json').read_text())['descriptorMatches']
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="574" viewBox="0 0 1280 574"><image href="frame-02.png" width="1280" height="574"/>']
for r in records:
 x,y=r['pixel'];svg.append(f'<circle cx="{x}" cy="{y}" r="7" fill="none" stroke="#ff4bde" stroke-width="2"/><text x="{x+9}" y="{y}" fill="#ff4bde" font-size="14">M{r["matchIndex"]}</text>')
for name,x,y in [('C1',323,388),('C2',611,383),('C3',783,228)]:svg.append(f'<circle cx="{x}" cy="{y}" r="7" fill="none" stroke="#00ffff" stroke-width="2"/><text x="{x+9}" y="{y}" fill="#00ffff" font-size="14">{name}</text>')
svg.append('</svg>');(P/'interior-candidates.svg').write_text('\n'.join(svg)+'\n')
resources=['stonebarn','woodenshed','haddingtoncafe','lorryback'];inventory=[]
for node in scene['nodes']:
 if node['resource'] not in resources:continue
 meshes=[m for m in scene['meshes'] if m['resource']==node['resource']]
 inventory.append({'node':node,'meshParts':[{'part':m['part'],'shader':m['shader'],'vertices':len(m['positions']),'faces':len(m['faces'])} for m in meshes]})
(P/'source-node-inventory.json').write_text(json.dumps({'scene':str(scene_path.relative_to(ROOT)),'sceneSha256':sha(scene_path),'candidates':inventory,'nodeSelection':'Visible material/building classes only; not camera residuals or accepted vertex correspondences.'},indent=2)+'\n')
provenance={'video':str(src.relative_to(ROOT)),'videoSha256':sha(src),'sourceProvenance':'docs/research-evidence/2026-09-30/source-provenance.json','dimensions':[1280,574],'fps':10,'frameCount':451,'durationSeconds':45.1,'sourceFormat':'136; silent H264 prefix remux, not full recording','frames':[{'file':f'frame-{i+1:02}.png','decodedZeroBasedFrame':210+i*10,'ptsSeconds':21+i,'sha256':sha(P/f'frame-{i+1:02}.png')}for i in range(6)],'extraction':'One FFmpeg decode, six exact select(n) frames, threads=1, no native image scaling or brightness adjustment; fps_mode=passthrough','diagnosticContactSheet':'six-frame-context.png: resized display derivatives only; use frame PNGs for pixels','originalRuntimeExecuted':False,'cameraFitAttempted':False,'architecturalCandidates':[{'id':'C1','frame':'frame-02.png','approxPixel':[323,388],'interpretation':'left/back wall meets floor','sourceVertexIdentity':None},{'id':'C2','frame':'frame-02.png','approxPixel':[611,383],'interpretation':'back floor edge disappears behind weapon; not proven geometric corner','sourceVertexIdentity':None},{'id':'C3','frame':'frame-02.png','approxPixel':[783,228],'interpretation':'upper visible left doorway jamb; lintel boundary unclear','sourceVertexIdentity':None}]}
(P/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
print('Prepared six native frames, context derivative, candidate overlay and provenance.')
