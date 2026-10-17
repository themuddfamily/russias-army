#!/usr/bin/env python3
"""Export authored result timeline data and glyphs without executing a movie."""
import importlib.util,json,hashlib,math,copy
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
path=ROOT/'scripts/research/extract-original-result-ui.py'
spec=importlib.util.spec_from_file_location('result_art',path);artmod=importlib.util.module_from_spec(spec);spec.loader.exec_module(artmod)
OUT=ROOT/'public/assets/original-result-animation';OUT.mkdir(exist_ok=True)
def sha(b):return hashlib.sha256(b).hexdigest()
outputs={};editions=[];all_frames=None
for edition,resource,cast in [('barrack',5118,4527),('woodland',6525,5760)]:
 art=artmod.Artwork(edition,resource,cast);scroll=art.decode(84);assert scroll['frameCount']==800 and not scroll['opaqueActions'];assert art.source['frameRate']==20
 assert art.display[16]['matrix']==[1,0,0,1,0,560]
 assert art.decode(36)['boundsTwips']==[0,16000,0,600]
 frames=[]
 for frame in scroll['frames']:
  assert set(frame)=={1,2,3} and frame[2]['clipDepth']==5
  p=frame[3];assert p['matrix'][:4]==[1,0,0,1] and p['colorTransform']==artmod.IDENTITY
  assert p['characterId'] in (39,83)
  frames.append([p['characterId'],*p['matrix'][4:]])
 if all_frames is not None:assert all_frames==frames
 all_frames=frames
 for cid in [39,83]:
  nested=art.decode(cid);assert nested['frameCount']==1 and not nested['opaqueActions']
  item=dict(characterId=cid,matrix=[1,0,0,1,0,0],colorTransform=copy.deepcopy(artmod.IDENTITY),ratio=0)
  raw=artmod.svg_items(art,[item]).replace(b'viewBox="0 0 800 600" width="800" height="600"',b'viewBox="0 0 1847 30" width="1847" height="30"')
  key=f'scroll-content-{cid}.svg';target=OUT/key
  if key in outputs:assert outputs[key]['sha256']==sha(raw)
  target.write_bytes(raw);ET.fromstring(raw);outputs[key]=dict(file=str(target.relative_to(ROOT)),sha256=sha(raw),bytes=len(raw))
 editions.append(art.source)
lines=['// Generated passively by scripts/research/export-original-result-animation.py.', '// Source SWF20fps; each tuple is [characterId, authoredX, authoredY].', 'export const ORIGINAL_RESULT_UI_FPS=20;', 'export const ORIGINAL_RESULT_SCROLL_FRAMES=[']
lines+=['  '+json.dumps(frame,separators=(',',':'))+',' for frame in all_frames]
lines+= ['] as const;','export const ORIGINAL_RESULT_REPLAY_FRAMES=15;','']
data='\n'.join(lines).encode();target=ROOT/'src/originalResultTimelineData.ts';target.write_bytes(data);outputs['timelineData']=dict(file=str(target.relative_to(ROOT)),sha256=sha(data),bytes=len(data))
manifest=dict(executed=False,sources=editions,decoder=dict(file=str(Path(__file__).relative_to(ROOT)),sha256=sha(Path(__file__).read_bytes())),helper=dict(file=str(path.relative_to(ROOT)),sha256=sha(path.read_bytes())),outputs=outputs,scroll=dict(frames=800,fps=20,rootDepth=16,viewport=[0,560,800,30],first=all_frames[0],last=all_frames[-1]),limits=['Native phase and child reentry semantics remain unexecuted; loop behavior is separately corroborated by passive actions/docs audit.','Raw sprite ratios do not select nested frames. All nested scroll glyph sprites have one frame.','SVG glyph raster, viewport stretching and browser20fps wall clock remain adapters.'])
(OUT/'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(verified=True,outputs=len(outputs),frames=len(all_frames),first=all_frames[0],last=all_frames[-1])))
