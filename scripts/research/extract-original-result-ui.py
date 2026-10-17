#!/usr/bin/env python3
"""Bounded passive frame54 artwork export. SWF/Director/action bytes never execute."""
from pathlib import Path
import base64, copy, hashlib, importlib.util, json, struct
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/research-evidence/2026-09-30/director-extraction'
OUT = ROOT / 'public/assets/original-result-ui'
spec = importlib.util.spec_from_file_location('normal_decoder', ROOT / 'scripts/research/extract-original-normal-ui.py')
normal = importlib.util.module_from_spec(spec); spec.loader.exec_module(normal)
scope = normal.scope
Bits, tags = scope.Bits, scope.tags
sha = lambda data: hashlib.sha256(data).hexdigest()
number = lambda x: format(x, '.12g')
point = lambda p: ' '.join(number(x / 20) for x in p)
IDENTITY = dict(multiply=[256]*4, add=[0]*4)
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
   elif kind in (0x40,0x41):
    bid=struct.unpack_from('<H',body,p)[0];p+=2;rb=Bits(body,p);matrix=rb.matrix();p=rb.pos
    fills.append({'type':'bitmap','kind':kind,'bitmapId':bid,'matrix':matrix})
   else:raise ValueError(f'Unsupported visible fill type {kind:x}')
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

def cx(body, pos):
    r = Bits(body, pos); add, mul, n = r.u(1), r.u(1), r.u(4)
    result = dict(multiply=[r.s(n) for _ in range(4)] if mul else [256]*4,
                  add=[r.s(n) for _ in range(4)] if add else [0]*4)
    r.align(); return result, r.pos

def combine(parent, child):
    return dict(multiply=[parent['multiply'][i]*child['multiply'][i]/256 for i in range(4)],
                add=[parent['add'][i]+parent['multiply'][i]*child['add'][i]/256 for i in range(4)])

def matrix_mul(a,b):
    return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]

def placement(body, display):
    flags=body[0];depth=struct.unpack_from('<H',body,1)[0];p=3
    item=copy.deepcopy(display[depth]) if flags&1 else dict(depth=depth,matrix=[1,0,0,1,0,0],ratio=0,colorTransform=copy.deepcopy(IDENTITY))
    if flags&2:item['characterId']=struct.unpack_from('<H',body,p)[0];p+=2
    if flags&4:r=Bits(body,p);item['matrix']=r.matrix();p=r.pos
    if flags&8:item['colorTransform'],p=cx(body,p)
    if flags&16:item['ratio']=struct.unpack_from('<H',body,p)[0];p+=2
    if flags&32:
        end=body.index(0,p);item['name']=body[p:end].decode('utf-8');p=end+1
    if flags&64:item['clipDepth']=struct.unpack_from('<H',body,p)[0];p+=2
    if flags&128:item['opaqueClipActions']=dict(bytes=len(body)-p,sha256=sha(body[p:]));p=len(body)
    if p!=len(body) or 'characterId' not in item:raise ValueError('Placement length/reference')
    display[depth]=item

def timeline(records):
    display={};frames=[];opaque=[]
    for tag,body in records:
        if tag==26:placement(body,display)
        elif tag==28:display.pop(struct.unpack('<H',body)[0],None)
        elif tag==1:frames.append(copy.deepcopy(display))
        elif tag in (12,59,72,82):opaque.append(dict(tag=tag,bytes=len(body),sha256=sha(body)))
        elif tag in (4,5,70):raise ValueError('Unsupported visible placement')
    return frames,opaque

def font(body):
    cid=struct.unpack_from('<H',body)[0];flags,language,n=body[2:5];name=body[5:5+n].decode('utf-8');p=5+n
    count=struct.unpack_from('<H',body,p)[0];p+=2
    if flags&(8|4):raise ValueError('Unexpected wide font tables')
    offsets=list(struct.unpack_from('<'+'H'*(count+1),body,p))
    if offsets[0]!=2*(count+1) or offsets!=sorted(offsets):raise ValueError('Font offsets')
    codes=list(body[p+offsets[-1]:p+offsets[-1]+count]);glyphs=[]
    for i in range(count):
        raw=body[p+offsets[i]:p+offsets[i+1]]
        synthetic=struct.pack('<H',i)+b'\x08\x00'+b'\x01\x00\x00\x00\x00\x00'+raw
        shape=decode_shape(2,synthetic)
        glyphs.append(dict(index=i,codepoint=codes[i],paths=shape['fills'][0]['paths'],shapeSha256=sha(raw)))
    pos=p+offsets[-1]+count;layout=None
    if flags&128:
        raw=body[pos:];ascent,descent,leading=struct.unpack_from('<hhh',body,pos);pos+=6
        advances=list(struct.unpack_from('<'+'h'*count,body,pos));pos+=2*count;bounds=[]
        for _ in range(count):r=Bits(body,pos);bounds.append(r.rect());pos=r.pos
        kern_count=struct.unpack_from('<H',body,pos)[0];pos+=2;kerning=[]
        for _ in range(kern_count):
            a,b,v=struct.unpack_from('<BBh',body,pos);pos+=4;kerning.append([a,b,v])
        layout=dict(bytes=len(raw),sha256=sha(raw),ascent=ascent,descent=descent,leading=leading,advances=advances,boundsTwips=bounds,kerning=kerning)
    if pos!=len(body):raise ValueError('Font trailing layout')
    return dict(characterId=cid,name=name,flags=flags,language=language,glyphs=glyphs,layout=layout,bodySha256=sha(body))

def button(body):
    cid,flags,offset=struct.unpack_from('<HBH',body);p=5;records=[]
    if flags&~1:raise ValueError('Button reserved flags')
    while body[p]:
        state=body[p];p+=1
        if state&0xf0:raise ValueError('Unsupported button filter/blend')
        char,depth=struct.unpack_from('<HH',body,p);p+=4;r=Bits(body,p);matrix=r.matrix();p=r.pos;color,p=cx(body,p)
        records.append(dict(characterId=char,depth=depth,matrix=matrix,colorTransform=color,ratio=0,stateFlags=state))
    p+=1
    if offset and p!=3+offset:raise ValueError('Button action offset')
    if not offset and p!=len(body):raise ValueError('Button trailing data')
    return dict(characterId=cid,trackAsMenu=bool(flags&1),records=records,
                opaqueActions=dict(bytes=len(body)-p,sha256=sha(body[p:])),bodySha256=sha(body))

def edge_records(data,pos):
    r=Bits(data,pos);nf,nl=r.u(4),r.u(4);x=y=f0=f1=line=0;result=[]
    while True:
        if r.u(1):
            straight=r.u(1);n=r.u(4)+2;start=[x,y];control=None
            if straight:
                if r.u(1):dx,dy=r.s(n),r.s(n)
                elif r.u(1):dx,dy=0,r.s(n)
                else:dx,dy=r.s(n),0
                x+=dx;y+=dy
            else:
                control=[x+r.s(n),y+r.s(n)];x,y=control[0]+r.s(n),control[1]+r.s(n)
            result.append(dict(start=start,end=[x,y],control=control,fill0=f0,fill1=f1,line=line))
        else:
            f=r.u(5)
            if not f:break
            if f&16:raise ValueError('Morph new styles')
            if f&1:n=r.u(5);x,y=r.s(n),r.s(n)
            if f&2:f0=r.u(nf)
            if f&4:f1=r.u(nf)
            if f&8:line=r.u(nl)
    r.align();return result,r.pos

def morph(body,ratio):
    cid=struct.unpack_from('<H',body)[0];r=Bits(body,2);start_bounds,end_bounds=r.rect(),r.rect();offset=struct.unpack_from('<I',body,r.pos)[0];p=r.pos+4;end_pos=p+offset
    fills=[];n=body[p];p+=1
    if n==255:n=struct.unpack_from('<H',body,p)[0];p+=2
    for _ in range(n):
        kind=body[p];p+=1
        if kind!=0:raise ValueError('Unsupported visible morph fill')
        fills.append([list(body[p:p+4]),list(body[p+4:p+8])]);p+=8
    lines=[];n=body[p];p+=1
    if n==255:n=struct.unpack_from('<H',body,p)[0];p+=2
    for _ in range(n):
        widths=list(struct.unpack_from('<HH',body,p));p+=4;colors=[list(body[p:p+4]),list(body[p+4:p+8])];p+=8;lines.append([widths,colors])
    edges,last=edge_records(body,p);ends,last2=edge_records(body,end_pos)
    if last!=end_pos or last2!=len(body) or len(edges)!=len(ends):raise ValueError('Morph paired records')
    t=ratio/65535;mix=lambda a,b:[x+(y-x)*t for x,y in zip(a,b)]
    result=[]
    for a,b in zip(edges,ends):
        ac=a['control'];bc=b['control']
        if (ac is None)!=(bc is None):
            if ac is None:ac=[(x+y)/2 for x,y in zip(a['start'],a['end'])]
            if bc is None:bc=[(x+y)/2 for x,y in zip(b['start'],b['end'])]
        result.append({**a,'start':mix(a['start'],b['start']),'end':mix(a['end'],b['end']),'control':mix(ac,bc) if ac is not None else None})
    def paths(selected,closed=True):
        pending=selected[:];out=[]
        while pending:
            e=pending.pop(0);start=e['start'];end=e['end'];cmd=['M '+point(start)]
            def command(q):return ('Q '+point(q['control'])+' '+point(q['end'])) if q['control'] is not None else 'L '+point(q['end'])
            cmd.append(command(e))
            while end!=start:
                i=next((i for i,q in enumerate(pending) if q['start']==end),None)
                if i is None:
                    if closed:raise ValueError('Open morph contour')
                    break
                e=pending.pop(i);cmd.append(command(e));end=e['end']
            if end==start:cmd.append('Z')
            out.append(' '.join(cmd))
        return out
    fs=[]
    for i,(a,b) in enumerate(fills,1):
        selected=[]
        for e in result:
            if e['fill1']==i:selected.append(e)
            if e['fill0']==i:selected.append({**e,'start':e['end'],'end':e['start']})
        fs.append(dict(style=dict(type='solid',rgba=mix(a,b)),paths=paths(selected)))
    ss=[]
    for i,(widths,colors) in enumerate(lines,1):
        selected=[e for e in result if e['line']==i]
        ss.append(dict(style=dict(widthTwips=widths[0]+t*(widths[1]-widths[0]),rgba=mix(*colors)),paths=paths(selected,False)))
    return dict(characterId=cid,boundsTwips=[x+(y-x)*t for x,y in zip(start_bounds,end_bounds)],fills=fs,strokes=ss,bodySha256=sha(body),ratio=ratio)
class Artwork:
    def __init__(self,edition,resource,cast):
        path=BASE/edition/f'{resource:05d}-XMED.bin';payload=path.read_bytes();raw=payload[12:]
        if len(raw)>2_000_000 or raw[:4]!=b'FWS\x05' or struct.unpack_from('<I',raw,4)[0]!=len(raw):raise ValueError('Bounded UI header')
        index=json.loads((path.parent/'cast-media-index.json').read_text())
        if not any(x['id']==cast and x['name']=='UI' for x in index['cast_members']):raise ValueError('UI cast')
        if not any(x['parent']==cast and x['child']==resource and x['tag']=='XMED' for x in index['key_links']):raise ValueError('UI binding')
        r=Bits(raw,8);stage=r.rect();rate,count=struct.unpack_from('<HH',raw,r.pos);records=list(tags(raw,r.pos+4))
        self.defs={struct.unpack_from('<H',b)[0]:(t,b) for t,b in records if t in (2,22,32,39,48,11,33,34,21,6,20,35,36,46)}
        self.frames,self.root_actions=timeline(records)
        if len(self.frames)!=count or count!=61:raise ValueError('Root timeline length')
        self.display=self.frames[53];self.fonts={};self.decoded={};self.visited=set();self.serial=0;self.edition=edition
        self.source=dict(edition=edition,castId=cast,resourceId=resource,path=str(path.relative_to(ROOT)),resourceSha256=sha(payload),swfSha256=sha(raw),swfOffset=12,stageBoundsTwips=stage,frames=count,frameRate=rate/256,opaqueRootActions=self.root_actions)
        self.bitmap=(path.parent/'media/original-ui-character-15.jpg').read_bytes()
        if self.defs[15][0]!=6 or self.defs[15][1][2:]!=self.bitmap:raise ValueError('Extracted JPEG differs from original DefineBits15 bytes')
        self.source['bitmap15']=dict(byteEquivalentDefineBitsPayload=True,path=str((path.parent/'media/original-ui-character-15.jpg').relative_to(ROOT)),sha256=sha(self.bitmap))
        from PIL import Image
        import io
        self.bitmap_size=list(Image.open(io.BytesIO(self.bitmap)).size)
    def decode(self,cid,ratio=0):
        self.visited.add(cid);t,b=self.defs[cid]
        key=(cid,ratio) if t==46 else cid
        if key in self.decoded:return self.decoded[key]
        if t in (2,22,32):result=decode_shape(t,b)
        elif t==46:result=morph(b,ratio)
        elif t==39:
            frames,opaque=timeline(list(tags(b,4)))
            count=struct.unpack_from('<H',b,2)[0]
            if len(frames)!=count:raise ValueError('Nested frame length')
            result=dict(characterId=cid,frames=frames,frameCount=count,opaqueActions=opaque,bodySha256=sha(b))
        elif t==48:result=font(b)
        elif t==11:
            # DefineText font references are fields in its bounded records. These
            # UI resources use font8 for edition captions, font37 elsewhere.
            candidates=[]
            for fid in (8,37):
                try:
                    f=self.decode(fid);text=normal.decode_text(b,f);text['characterId']=cid;candidates.append(text)
                except ValueError:pass
            if len(candidates)!=1:raise ValueError(f'Text font unresolved {cid}')
            result=candidates[0]
        elif t==34:result=button(b)
        elif t==6 and cid==15:result=dict(characterId=cid,type='jpeg',bytes=len(b),bodySha256=sha(b))
        else:raise ValueError(f'Unsupported visible character {cid} tag {t}')
        self.decoded[key]=result;return result
    def color(self,color,transform):
        vals=[max(0,min(255,color[i]*transform['multiply'][i]/256+transform['add'][i])) for i in range(4)]
        return 'rgb('+','.join(number(v) for v in vals[:3])+')',number(vals[3]/255)
    def ident(self,prefix):self.serial+=1;return f'{prefix}{self.serial}'
    def shape(self,shape,matrix,transform,clip=False):
        result=[];attr=' transform="matrix('+' '.join(number(v) for v in matrix)+')"'
        for fill in shape['fills']:
            if not fill['paths']:continue # Unreferenced style slots have no visible geometry.
            style=fill['style'];defs='';alpha='1'
            if clip:paint='black'
            elif style['type']=='solid':paint,alpha=self.color(style['rgba'],transform)
            elif style['type'] in ('linear','radial'):
                ident=self.ident('gradient');m=' '.join(number(v) for v in style['matrix']);kind=style['type'];tag='linearGradient' if kind=='linear' else 'radialGradient'
                geom='x1="-819.2" y1="0" x2="819.2" y2="0"' if kind=='linear' else 'cx="0" cy="0" r="819.2"'
                defs=f'<defs><{tag} id="{ident}" gradientUnits="userSpaceOnUse" {geom} gradientTransform="matrix({m})">'
                for stop in style['stops']:
                    color,opacity=self.color(stop['rgba'],transform);defs+=f'<stop offset="{number(stop["ratio"]/255)}" stop-color="{color}" stop-opacity="{opacity}"/>'
                defs+=f'</{tag}></defs>';paint=f'url(#{ident})'
            elif style['type']=='bitmap':
                if style['bitmapId']!=15 or style['kind']!=0x41:raise ValueError('Unsupported visible bitmap')
                if transform!=IDENTITY:raise ValueError('Bitmap CXFORM requires explicit filter')
                self.decode(15);ident=self.ident('bitmapclip');path=' '.join(fill['paths']);w,h=self.bitmap_size
                bm=style['matrix'][:];bm[:4]=[v/20 for v in bm[:4]]
                # Bitmap coordinates are source pixels; MATRIX scale entries map
                # them into twips, unlike vector vertices already divided by20.
                encoded=base64.b64encode(self.bitmap).decode()
                result.append(f'<g{attr}><defs><clipPath id="{ident}" clipPathUnits="userSpaceOnUse"><path d="{path}" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#{ident})"><image width="{w}" height="{h}" transform="matrix({" ".join(number(v) for v in bm)})" preserveAspectRatio="none" href="data:image/jpeg;base64,{encoded}"/></g></g>')
                continue
            else:raise ValueError('Unsupported paint')
            result.append(defs+f'<path{attr} d="{" ".join(fill["paths"])}" fill="{paint}" fill-opacity="{alpha}" fill-rule="evenodd" clip-rule="evenodd"/>')
        if clip:return result
        for stroke in shape['strokes']:
            color,alpha=self.color(stroke['style']['rgba'],transform)
            result.append(f'<path{attr} d="{" ".join(stroke["paths"])}" fill="none" stroke="{color}" stroke-opacity="{alpha}" stroke-width="{number(stroke["style"]["widthTwips"]/20)}" stroke-linejoin="round" stroke-linecap="round"/>')
        return result
    def render(self,item,parent=None,color=None,state=1,clip=False,exclude=frozenset()):
        cid=item['characterId']
        if cid in exclude:return []
        parent=parent or [1,0,0,1,0,0];color=color or IDENTITY
        matrix=matrix_mul(parent,item['matrix']);transform=combine(color,item['colorTransform']);obj=self.decode(cid,item.get('ratio',0));t=self.defs[cid][0]
        if t in (2,22,32,46):return self.shape(obj,matrix,transform,clip)
        if t==11:
            result=[];matrix=matrix_mul(matrix,obj['matrix'])
            for run in obj['runs']:
                f=self.decode(run['fontId']);rgba=run['rgb']+[255];paint,alpha=self.color(rgba,transform)
                for g in run['glyphs']:
                    m=matrix_mul(matrix,[run['heightTwips']/1024,0,0,run['heightTwips']/1024,g['xTwips']/20,g['yTwips']/20])
                    result.append('<path transform="matrix('+' '.join(number(v) for v in m)+')" d="'+' '.join(f['glyphs'][g['index']]['paths'])+f'" fill="{paint}" fill-opacity="{alpha}" fill-rule="evenodd"/>')
            return result
        if t==34:
            return sum((self.render(p,matrix,transform,state,clip,exclude) for p in sorted(obj['records'],key=lambda p:p['depth']) if p['stateFlags']&state),[])
        if t==39:
            result=[];active=[]
            for depth,p in sorted(obj['frames'][0].items()):
                while active and depth>active[-1]:result.append('</g>');active.pop()
                if 'clipDepth' in p:
                    if clip:raise ValueError('Nested mask geometry')
                    ident=self.ident('mask');art=self.render(p,matrix,transform,state,True,exclude)
                    result.append(f'<defs><clipPath id="{ident}" clipPathUnits="userSpaceOnUse">'+''.join(art)+'</clipPath></defs>')
                    result.append(f'<g clip-path="url(#{ident})">');active.append(p['clipDepth'])
                else:result.extend(self.render(p,matrix,transform,state,clip,exclude))
            while active:result.append('</g>');active.pop()
            return result
        raise ValueError('Non-display character rendered')
    def bounds(self,item,parent=None,state=8):
        parent=parent or [1,0,0,1,0,0];matrix=matrix_mul(parent,item['matrix']);cid=item['characterId'];obj=self.decode(cid,item.get('ratio',0));t=self.defs[cid][0]
        if t in (2,22,32,46,11):
            b=obj['boundsTwips'];pts=[[b[0]/20,b[2]/20],[b[1]/20,b[2]/20],[b[1]/20,b[3]/20],[b[0]/20,b[3]/20]]
            return [[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]] for x,y in pts]
        if t==34:return sum((self.bounds(p,matrix,state) for p in obj['records'] if p['stateFlags']&state),[])
        if t==39:return sum((self.bounds(p,matrix,state) for p in obj['frames'][0].values()),[])
        raise ValueError('Bounds unsupported')
    def svg(self,depths,state=1,exclude=frozenset()):
        self.serial=0;art=sum((self.render(self.display[d],state=state,exclude=exclude) for d in depths),[])
        data=('\n'.join(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" preserveAspectRatio="none">','<!-- Passive original frame54 display artwork. No source actions executed. -->',*art,'</svg>'])+'\n').encode()
        ET.fromstring(data);return data
def svg_items(artwork,items,state=1,exclude=frozenset()):
    artwork.serial=0;lines=sum((artwork.render(item,state=state,exclude=exclude) for item in items),[])
    raw=('\n'.join(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" preserveAspectRatio="none">','<!-- Passive original frame54 artwork; action bytes stay opaque. -->',*lines,'</svg>'])+'\n').encode()
    ET.fromstring(raw);return raw

def json_decoded(artwork):
    result={}
    for cid in sorted(artwork.visited):
        tag,body=artwork.defs[cid]
        if tag==46:
            r=Bits(body,2);bounds=[r.rect(),r.rect()]
            result[cid]=dict(characterId=cid,tag=tag,bodySha256=sha(body),boundsTwips=bounds,
                decodedRatios=sorted(k[1] for k in artwork.decoded if isinstance(k,tuple) and k[0]==cid))
        else:result[cid]={**artwork.decode(cid),'tag':tag}
    return result

def main():
    OUT.mkdir(parents=True,exist_ok=True);outputs={};sources=[];contents={}
    for edition,resource,cast in [('barrack',5118,4527),('woodland',6525,5760)]:
        art=Artwork(edition,resource,cast)
        expected={1:24,3:22,8:18,13:20,16:84,22:91,25:97,34:10,37:28,40:5}
        if {d:p['characterId'] for d,p in art.display.items()}!=expected:raise ValueError('Frame54 root graph')
        def write(key,data,metadata):
            path=OUT/(key+'.svg')
            if key in outputs and outputs[key]['sha256']!=sha(data):raise ValueError(f'Shared edition asset mismatch {key}')
            path.write_bytes(data);outputs[key]=dict(file=str(path.relative_to(ROOT)),sha256=sha(data),bytes=len(data),viewBox=[0,0,800,600],**metadata)
        write('background-'+edition,art.svg([1,3,8,13,16,37]),dict(depths=[1,3,8,13,16,37],nestedTimelinePose=1,containsInertSourceButton28=True))
        write('background-lower-'+edition,art.svg([1,3,8,13,16]),dict(depths=[1,3,8,13,16],nestedTimelinePose=1))
        write('inert-control',art.svg([37]),dict(depth=37,characterId=28,state='up',stateFlag=1,containsOpaqueSourceButtonActions=True))
        write('gameover',art.svg([25],exclude=frozenset({96})),dict(depth=25,characterId=97,excludedControl=96))
        write('emblem-'+edition,art.svg([34]),dict(depth=34,characterId=10))
        write('border',art.svg([40]),dict(depth=40,characterId=5))
        replay=art.display[22]
        go=copy.deepcopy(art.decode(97)['frames'][0][4]);go['matrix']=matrix_mul(art.display[25]['matrix'],go['matrix']);go['colorTransform']=combine(art.display[25]['colorTransform'],go['colorTransform'])
        controls={}
        for name,item in [('replay',replay),('go',go)]:
            points=art.bounds(item,state=8);xs=[p[0] for p in points];ys=[p[1] for p in points]
            controls[name]=dict(characterId=item['characterId'],placement=item,hitBounds=dict(x=min(xs),y=min(ys),width=max(xs)-min(xs),height=max(ys)-min(ys)),
                hitBoundsPolygons=[points[i:i+4] for i in range(0,len(points),4)],hitGeometry='Original visible/hit shapes and glyph paths are in hit SVG; listed polygons are transformed source RECT envelopes, not replacement exact contour geometry.')
            for state,flag in [('up',1),('over',2),('down',4),('hit',8)]:
                write(name+'-'+state,svg_items(art,[item],state=flag),dict(characterId=item['characterId'],state=state,stateFlag=flag,sourceFrame=54,authoredNestedTimelinePose=1))
        write('result-ui-'+edition,art.svg(sorted(art.display)),dict(depths=sorted(art.display),sourceFrame=54,authoredNestedTimelinePose=1))
        # Every authored pose of the15-frame Replay-up sprite is independently
        # exported. These are static timeline poses, never ActionScript results.
        replay_sprite=art.decode(88)
        if replay_sprite['frameCount']!=15:raise ValueError('Replay timeline')
        first=replay_sprite['frames'][0]
        for i,frame in enumerate(replay_sprite['frames'],1):
            replay_sprite['frames'][0]=frame
            write(f'replay-up-pose-{i:02d}',svg_items(art,[replay]),dict(characterId=91,nestedSprite=88,authoredTimelineFrame=i,sourceFrame=54))
        replay_sprite['frames'][0]=first
        for cid,text in [(89,'RE-PLAY'),(90,'RE-PLAY'),(92,'GAME OVER'),(94,'G0'),(95,'G0')]:
            if art.decode(cid)['caption']!=text:raise ValueError('Original result title codepoints')
        # Validate all continuing scroll timeline placements without running it.
        scroll=art.decode(84)
        if scroll['frameCount']!=800:raise ValueError('Scroll timeline')
        sources.append(art.source)
        contents[edition]=dict(frame=54,rootDisplayList=[p for _,p in sorted(art.display.items())],controls=controls,
            reachableStaticCharacters=sorted(art.visited),characters=json_decoded(art),
            continuingTimelines=[dict(characterId=84,frames=800,rootDepth=16,renderedPose=1),dict(characterId=88,frames=15,insideButton91=True,renderedPose=1)])
    manifest=dict(schemaVersion=1,executed=False,decoder=str(Path(__file__).relative_to(ROOT)),decoderSha256=sha(Path(__file__).read_bytes()),
        helperDecoders=[dict(path=str(Path(mod.__file__).relative_to(ROOT)),sha256=sha(Path(mod.__file__).read_bytes())) for mod in (normal,scope)],
        sources=sources,editionContents=contents,outputs=outputs,
        limits=[
            'All ten authored root display objects at frame54 and all their visible initial-pose nested shapes, original text glyph outlines, button states, source depth masks, bitmap fills, gradients and color transforms are exported. Unreferenced fill slots retain metadata but produce no geometry.',
            'No original Director, Flash, ActionScript, button action or clip action is executed or interpreted. Action lengths and hashes are retained as opaque evidence. Static authored placements do not prove action-driven native changes.',
            'SWF stage1024x1024 is projected into an800x600 source-artwork viewport. preserveAspectRatio=none and later responsive scaling are browser adapters; native Director sprite registration and raster equality are unproved.',
            'Initial pose of800-frame scrolling sprite84 is exported; all800 authored display lists remain metadata. Its continuing native animation is not reproduced by a static composite. Replay sprite88 has15 independently exported authored poses; timeline phase and native action-driven behavior remain unproved.',
            'Bitmap15 is the edition-specific extracted JPEG; its authored matrix and clipped fill contour are preserved. JPEG decoding, SVG gradients, alpha/color arithmetic, antialiasing, round line joins/caps and morph intermediate coordinate rounding remain browser raster adapters.',
            'Button hit SVG preserves source shape/text paths. Bounds polygons describe transformed RECT envelopes only. GO artwork is original zero-codepoint G0, not a normalized GO label; no historical external score submission is implemented by these inert assets.',
            'Root button28 remains in background as source static up-state artwork. Its opaque action behavior is not implemented. Dynamic Director rooms/score text is separate and absent from this SWF static artwork export.'
        ])
    target=OUT/'provenance.json';target.write_text(json.dumps(manifest,indent=2)+'\n')
    # Reparse every SVG and verify manifest hashes, including self/dependencies.
    for item in outputs.values():
        data=(ROOT/item['file']).read_bytes();ET.fromstring(data)
        if sha(data)!=item['sha256']:raise ValueError('Output hash mismatch')
    print(json.dumps(dict(output=str(OUT.relative_to(ROOT)),outputs=len(outputs),editions=list(contents),controls=contents['barrack']['controls']),indent=2))

if __name__=='__main__':main()
