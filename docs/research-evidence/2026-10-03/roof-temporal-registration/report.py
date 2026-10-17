"""Assemble retained results and standalone annotations; no rerun or fitting."""
from pathlib import Path
import json,hashlib,base64,html
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[3]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
data=json.loads((OUT/'results.json').read_text());config=json.loads((OUT/'masks.json').read_text())
rows=[]
for t in data['tracks']:
 steps=t['transitions'];rows.append(f"|{t['id']}|{t['role']}|{t['initialPixel']}|{t['lastPixel']}|{min(s['ncc'] for s in steps):.6f}|{min(s['peakMargin'] for s in steps):.6f}|{max(s['forwardBackwardPixels'] for s in steps):.6f}|")
parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="650" viewBox="0 0 1280 650"><rect width="1280" height="650" fill="white"/>']
for column,index in enumerate([0,4]):
 frame=config['frames'][index];p=ROOT/frame['path'];mime='image/jpeg' if p.suffix=='.jpg' else 'image/png';encoded=base64.b64encode(p.read_bytes()).decode()
 offset=640*column
 parts.append(f'<text x="{offset+12}" y="24" font-size="18">{frame["seconds"]} s: independently observed mask / admitted tracks</text><g transform="translate({offset},40) scale(.5)">')
 parts.append(f'<image width="1280" height="574" href="data:{mime};base64,{encoded}"/>')
 polygon=' '.join(f'{x},{y}' for x,y in frame['roofPolygon']);parts.append(f'<polygon points="{polygon}" fill="none" stroke="#00ffff" stroke-width="2"/>')
 for t in data['tracks']:
  x,y=t['initialPixel'] if index==0 else t['lastPixel'];color='#ff00ff' if t['role']=='heldout' else '#00ff00'
  parts.append(f'<circle cx="{x}" cy="{y}" r="5" fill="none" stroke="{color}" stroke-width="2"/><text x="{x+6}" y="{y-6}" fill="{color}" font-size="18">{t["id"]}</text>')
 candidates=[{'pixel':data['disputedTrack']['initialPixel'],'name':'disputed'}] if index==0 else data['retained16sAlternatives']
 for candidate in candidates:
  x,y=candidate['pixel'];parts.append(f'<circle cx="{x}" cy="{y}" r="5" fill="none" stroke="#ffff00" stroke-width="2"/><text x="{x+8}" y="{y-8}" fill="#ffff00" font-size="18">{html.escape(candidate["name"])}</text>')
 parts.append('</g>')
parts.append('<text x="12" y="365" font-size="18">Cyan: conservative roof polygon. Green: training. Magenta: independent heldout. Yellow: retained disputed alternatives.</text><text x="12" y="398" font-size="18">Only three complete tracks: insufficient support for homography; no camera fit or candidate selection.</text></svg>')
(OUT/'image-only-track-overview.svg').write_text(''.join(parts)+'\n')
report='''# Image-only roof temporal registration result

The predeclared trial extracted three new intermediate video frames and tracked
roof image patches from15 s to16 s without reading camera files, projected
points, scene geometry or source atlas. It produced **three complete image-only
tracks** but **insufficient independent support for a homography**. No camera
fit, exact source correspondence or candidate selection follows.

## Fixed method and independently observed masks

[Protocol](PROTOCOL.md) preceded extraction and matcher outputs. After inspecting
the actual full endpoint/intermediate images, [masks](masks.json) conservatively
narrowed its broad endpoint neighborhoods to roof interiors before matching.
This avoids pretending that their initial approximate polygons prove full patch
support. The initial polygons and narrowing are both preserved. No match,
projection or camera residual informed the masks.

Requested15.25/15.50/15.75 s selections actually decode15.3/15.5/15.8 s from the
preserved10 FPS video. The first showinfo record in each extraction log binds the
saved frame's actual PTS; the following record is decoder/filter lookahead, not
another saved PNG. [Commands](extraction-commands.txt) and all logs are retained.

Shi–Tomasi detected three corners under the unchanged conservative11x11 roof
patch support, source exclusion, spacing and quality rules. All three survived
all four adjacent-frame searches. Their full best/second NCC peaks and reverse
localizations are retained in [results](results.json).

|ID|Preassigned role|15 s pixel|16 s pixel|Lowest NCC|Lowest distinct-peak margin|Largest FB error, px|
|---|---|---|---|---|---|---|
'''+ '\n'.join(rows)+'''

The unchanged every-third-seed assignment yields only **two training tracks and
one heldout**. The protocol requires at least four training plus three heldout
tracks. No homography was attempted; no transform-heldout RMS exists. Individual
forward/backward checks establish local patch consistency only. These nearby
features provide weak spatial coverage and can share the same window neighborhood;
they are not seven independently identified physical roof landmarks.

## Disputed feature and alternatives

The disputed15 s SIFT center(697.210815,190.020233) fails at the first15→15.3 s
transition: its source patch crosses the conservative roof boundary, NCC0.786852
fails0.85, best and distinct second scores tie(margin0), and reverse localization
differs17.534515 px from the start. The retained best diagnostic match(585,197)
therefore has no accepted temporal identity. No complete disputed track or fitted
image prediction exists from which to adjudicate the16 s candidates.

Both original16 s alternatives remain retained and unselected:
(619.471375,130.784973) and(630.661194,130.328873). Their historical heldout roles,
2 px allowance and failed4.745 px roof check are unchanged. Failure of this
roof-only trial does not prove either original descriptor false, or prove that
no other independently supported registration method can work.

[Standalone overview](image-only-track-overview.svg) annotates unchanged original
pixels with mask/track/candidate overlays. An image track is not exact atlas texel
identity: compression, blur, repeated texture and changed contextual support can
move descriptor/patch extrema. V14 stays open. No production/evidence history or
checklist acceptance changed.

## Resource evidence

Extraction ran in ra-job-1791027717-8744 with peak221011968 bytes(210.7 MiB);
matching ran in ra-job-1791027858-8906 with peak218619904 bytes(208.4 MiB).
Both exited0 with no OOM events. The bounded launcher serialized execution; no
browser, original executable or unbounded heavy process ran.

## Next material action

This attempt lacks the independent roof support needed to resolve the descriptor
dispute. Do not relax thresholds or repeatedly expand this patch to manufacture
a fit. Prioritize a different source-unique noncoplanar landmark or the broader
Barrack continuous-route verification before revisiting roof registration with
substantially better evidence.
'''
(OUT/'REPORT.md').write_text(report)
manifest={'inputs':data['inputs'],'video':{'path':'docs/research-evidence/2026-09-30/woodland-video-first45s.mp4','sha256':digest(ROOT/'docs/research-evidence/2026-09-30/woodland-video-first45s.mp4')},'files':[{'path':str(p.relative_to(ROOT)),'sha256':digest(p)} for p in sorted(OUT.iterdir()) if p.is_file() and p.name not in ['manifest.json','report-run.log']]}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'resultsSha256':digest(OUT/'results.json'),'reportSha256':digest(OUT/'REPORT.md'),'manifestSha256':digest(OUT/'manifest.json'),'completeTracks':len(data['tracks']),'homographyAttempted':data['homography']['attempted']}))
