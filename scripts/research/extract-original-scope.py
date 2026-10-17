#!/usr/bin/env python3
"""Decode only recovered UI frame-one solid vector paths. Never execute SWF/actions."""
from pathlib import Path
import hashlib, importlib.util, json, struct
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('static_swf',ROOT/'scripts/research/extract-original-hurt-overlay.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
Bits,tags=module.Bits,module.tags
BASE=ROOT/'docs/research-evidence/2026-09-30/director-extraction'
OUT=ROOT/'public/assets/original-effects'
def sha(b):return hashlib.sha256(b).hexdigest()
def number(x):return format(x,'.8g')
def point(p):return ' '.join(number(x/20) for x in p)
def decode_shape(tag,body):
 cid=struct.unpack_from('<H',body)[0];r=Bits(body,2);bounds=r.rect();p=r.pos
 channels=4 if tag==32 else 3
 def styles(p):
  count=body[p];p+=1
  if count==255:count=struct.unpack_from('<H',body,p)[0];p+=2
  fills=[]
  for _ in range(count):
   kind=body[p];p+=1
   if kind==0:
    color=list(body[p:p+channels]);p+=channels
    if channels==3:color.append(255)
    fills.append({'type':'solid','rgba':color})
   elif kind in (0x10,0x12):
    rb=Bits(body,p);matrix=rb.matrix();p=rb.pos;flags=body[p];p+=1;stops=[]
    if flags>>4:raise ValueError('Unsupported gradient spread/interpolation')
    for _ in range(flags&15):
     ratio=body[p];p+=1;color=list(body[p:p+channels]);p+=channels
     if channels==3:color.append(255)
     stops.append({'ratio':ratio,'rgba':color})
    fills.append({'type':'linear' if kind==0x10 else 'radial','matrix':matrix,'stops':stops})
   else:raise ValueError(f'Unexpected scope fill type {kind:x}')
  count=body[p];p+=1
  if count==255:count=struct.unpack_from('<H',body,p)[0];p+=2
  lines=[]
  for _ in range(count):
   width=struct.unpack_from('<H',body,p)[0];p+=2;rgba=list(body[p:p+channels]);p+=channels
   if channels==3:rgba.append(255)
   lines.append({'widthTwips':width,'rgba':rgba})
  return p,fills,lines
 p,fill_styles,line_styles=styles(p);fill_offset=line_offset=0
 r=Bits(body,p);nf,nl=r.u(4),r.u(4);x=y=0;f0=f1=line=0;edges=[]
 while True:
  if r.u(1):
   straight=r.u(1);n=r.u(4)+2;start=(x,y);control=None
   if straight:
    if r.u(1):dx,dy=r.s(n),r.s(n)
    elif r.u(1):dx,dy=0,r.s(n)
    else:dx,dy=r.s(n),0
    x+=dx;y+=dy
   else:
    cx,cy=x+r.s(n),y+r.s(n);x,y=cx+r.s(n),cy+r.s(n);control=(cx,cy)
   edges.append({'start':start,'end':(x,y),'control':control,'fill0':f0,'fill1':f1,'line':line})
  else:
   flags=r.u(5)
   if not flags:break
   if flags&1:n=r.u(5);x,y=r.s(n),r.s(n)
   if flags&2:v=r.u(nf);f0=v+fill_offset if v else 0
   if flags&4:v=r.u(nf);f1=v+fill_offset if v else 0
   if flags&8:v=r.u(nl);line=v+line_offset if v else 0
   if flags&16:
    r.align();p,newfills,newlines=styles(r.pos);fill_offset=len(fill_styles);line_offset=len(line_styles);fill_styles.extend(newfills);line_styles.extend(newlines);r=Bits(body,p);nf,nl=r.u(4),r.u(4)
 r.align()
 if r.pos!=len(body):raise ValueError('Shape trailing bytes')
 if any(e['fill0']>len(fill_styles) or e['fill1']>len(fill_styles) or e['line']>len(line_styles) for e in edges):raise ValueError('Unknown style index')
 def paths(selected):
  pending=list(selected);result=[]
  while pending:
   edge=pending.pop(0);start=edge['start'];end=edge['end'];commands=['M '+point(start)]
   def command(e):return ('Q '+point(e['control'])+' '+point(e['end'])) if e['control'] is not None else 'L '+point(e['end'])
   commands.append(command(edge))
   while end!=start:
    nxt=next((i for i,e in enumerate(pending) if e['start']==end),None)
    if nxt is None:break
    edge=pending.pop(nxt);commands.append(command(edge));end=edge['end']
   if end==start:commands.append('Z')
   result.append(' '.join(commands))
  return result
 filled_styles=[]
 for i,style in enumerate(fill_styles):
  filled=[]
  for e in edges:
   if e['fill1']==i+1:filled.append(e)
   if e['fill0']==i+1:filled.append({**e,'start':e['end'],'end':e['start']})
  fill_paths=paths(filled)
  if any(not p.endswith('Z') for p in fill_paths):raise ValueError('Open fill contour')
  filled_styles.append({'style':style,'paths':fill_paths})
 strokes=[{'style':style,'paths':paths([e for e in edges if e['line']==i+1])} for i,style in enumerate(line_styles)]
 return {'characterId':cid,'tag':tag,'boundsTwips':bounds,'fills':filled_styles,'strokes':strokes,'edges':len(edges),'curves':sum(e['control'] is not None for e in edges),'bodySha256':sha(body)}

def source(edition,resource,cast):
 path=BASE/edition/f'{resource:05d}-XMED.bin';payload=path.read_bytes();raw=payload[12:]
 if raw[:4]!=b'FWS\x05' or struct.unpack_from('<I',raw,4)[0]!=len(raw) or len(raw)>2_000_000:raise ValueError('Unexpected bounded SWF')
 index=json.loads((BASE/edition/'cast-media-index.json').read_text())
 if not any(c['id']==cast and c['name']=='UI' for c in index['cast_members']):raise ValueError('Missing UI cast')
 if not any(l['parent']==cast and l['child']==resource and l['tag']=='XMED' for l in index['key_links']):raise ValueError('Missing resource binding')
 r=Bits(raw,8);bounds=r.rect();rate,frames=struct.unpack_from('<HH',raw,r.pos);shapes={};placements=[];frame=1;actions=0
 for tag,body in tags(raw,r.pos+4):
  if tag in (12,59,72,82):actions+=1 # Opaque bytes counted; never interpreted or executed.
  if tag in (2,32) and struct.unpack_from('<H',body)[0] in (4,5):shapes[struct.unpack_from('<H',body)[0]]=decode_shape(tag,body)
  if frame==1 and tag==26:
   flags=body[0];depth,cid=struct.unpack_from('<HH',body,1)
   if flags!=6:raise ValueError('Unexpected scope placement')
   matrix=Bits(body,5).matrix();placements.append({'characterId':cid,'depth':depth,'matrix':matrix})
  if tag==1:frame+=1
 if set(shapes)!={4,5} or [p['characterId'] for p in placements]!=[4,5]:raise ValueError('Unexpected scope display list')
 return {'edition':edition,'castId':cast,'resourceId':resource,'path':str(path.relative_to(ROOT)),'resourceSha256':sha(payload),'swfSha256':sha(raw),'swfOffset':12,'stageBoundsTwips':bounds,'frameRate':rate/256,'frameCount':frames,'opaqueRootActionTagCount':actions},shapes,placements

def main():
 sources=[];reference=None
 for edition,resource,cast in [('barrack',5118,4527),('woodland',6525,5760)]:
  info,shapes,placements=source(edition,resource,cast);sources.append(info)
  content={'shapes':shapes,'placements':placements}
  if reference is not None and content!=reference:raise ValueError('Edition scope vectors differ')
  reference=content
 svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" preserveAspectRatio="none">','<!-- Byte-equivalent source UI frame 1 vector shapes. No SWF code executed. -->']
 for placement in sorted(reference['placements'],key=lambda p:p['depth']):
  shape=reference['shapes'][placement['characterId']];matrix=' '.join(number(v) for v in placement['matrix']);svg.append(f'<g transform="matrix({matrix})">')
  for index,fill in enumerate(shape['fills']):
   style=fill['style'];opacity='1'
   if style['type']=='solid':
    color=style['rgba'];paint='#'+''.join(f'{v:02x}' for v in color[:3]);opacity=number(color[3]/255)
   else:
    ident=f'shape{shape["characterId"]}fill{index}';transform=' '.join(number(v) for v in style['matrix'])
    if style['type']=='radial':svg.append(f'<defs><radialGradient id="{ident}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="819.2" gradientTransform="matrix({transform})">')
    else:svg.append(f'<defs><linearGradient id="{ident}" gradientUnits="userSpaceOnUse" x1="-819.2" y1="0" x2="819.2" y2="0" gradientTransform="matrix({transform})">')
    for stop in style['stops']:
     rgba=stop['rgba'];rgb='#'+''.join(f'{v:02x}' for v in rgba[:3]);svg.append(f'<stop offset="{number(stop["ratio"]/255)}" stop-color="{rgb}" stop-opacity="{number(rgba[3]/255)}"/>')
    svg.append('</radialGradient></defs>' if style['type']=='radial' else '</linearGradient></defs>');paint=f'url(#{ident})'
   svg.append(f'<path d="{" ".join(fill["paths"])}" fill="{paint}" fill-opacity="{opacity}" fill-rule="evenodd"/>')
  for stroke in shape['strokes']:
   rgba=stroke['style']['rgba'];rgb='#'+''.join(f'{v:02x}' for v in rgba[:3]);svg.append(f'<path d="{" ".join(stroke["paths"])}" fill="none" stroke="{rgb}" stroke-opacity="{number(rgba[3]/255)}" stroke-width="{number(stroke["style"]["widthTwips"]/20)}" stroke-linejoin="round" stroke-linecap="round"/>')
  svg.append('</g>')
 svg.append('</svg>');data=('\n'.join(svg)+'\n').encode();OUT.mkdir(parents=True,exist_ok=True);(OUT/'scope-original.svg').write_bytes(data)
 manifest={'schemaVersion':1,'executed':False,'decoder':str(Path(__file__).relative_to(ROOT)),'decoderSha256':sha(Path(__file__).read_bytes()),'sources':sources,'identicalScopeShapesAndPlacements':True,'frame':1,**reference,'output':{'file':'scope-original.svg','sha256':sha(data),'bytes':len(data),'viewBox':[0,0,800,600]},'limits':['Scope solid fills, radial-gradient stops/matrix, line widths and quadratic curves are recovered by exact twip-to-pixel conversion; SVG rasterization and gradient interpolation are browser adapters.','Native SWF stage is1024x1024; exported800x600 viewport follows recovered gameplay sprite/visible artwork, not native texture raster proof. preserveAspectRatio=none explicitly normalizes artwork across the browser viewport and can distort it at other aspect ratios.','Line cap/join defaults are mapped to SVG round; native antialiasing, filtering and stroke pixel registration remain unproved.','Opaque root and nested ActionScript is never executed; only static frame1 display-list vector shapes4 and5 are exported.']}
 (OUT/'scope-original-provenance.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'output':manifest['output'],'shapes':[{k:s[k] for k in ('characterId','edges','curves','bodySha256')} for s in reference['shapes'].values()]}))
if __name__=='__main__':main()
