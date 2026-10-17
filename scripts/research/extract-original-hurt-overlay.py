#!/usr/bin/env python3
"""Bounded static SWF JPEG3/MATRIX extraction; never execute original content."""
from pathlib import Path
import hashlib, io, json, shutil, struct, zlib
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'docs/research-evidence/2026-09-30/director-extraction'
OUT=ROOT/'public/assets/original-effects'
class Bits:
 def __init__(self,data,pos=0):self.data=data;self.bit=pos*8
 def u(self,n):
  if self.bit+n>len(self.data)*8:raise ValueError('bit bounds')
  v=0
  for _ in range(n):v=(v<<1)|((self.data[self.bit//8]>>(7-self.bit%8))&1);self.bit+=1
  return v
 def s(self,n):
  v=self.u(n);return v-(1<<n) if n and v&(1<<(n-1)) else v
 def align(self):self.bit=(self.bit+7)//8*8
 @property
 def pos(self):return (self.bit+7)//8
 def rect(self):
  n=self.u(5);a=[self.s(n) for _ in range(4)];self.align();return a
 def matrix(self):
  a=d=1.;b=c=0.
  if self.u(1):n=self.u(5);a=self.s(n)/65536;d=self.s(n)/65536
  if self.u(1):n=self.u(5);b=self.s(n)/65536;c=self.s(n)/65536
  n=self.u(5);x=self.s(n);y=self.s(n);self.align()
  return [a,b,c,d,x/20,y/20]
def tags(data,start):
 p=start
 while p<len(data):
  if p+2>len(data):raise ValueError('tag header')
  h=struct.unpack_from('<H',data,p)[0];p+=2;t=h>>6;n=h&63
  if n==63:
   if p+4>len(data):raise ValueError('long header')
   n=struct.unpack_from('<I',data,p)[0];p+=4
  if p+n>len(data):raise ValueError('tag body')
  yield t,data[p:p+n];p+=n
  if t==0:
   if p!=len(data):raise ValueError('bytes after End')
   return
 raise ValueError('missing End')
def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 OUT.mkdir(parents=True,exist_ok=True)
 swfpath=BASE/'barrack/media/original-hurtrot.swf';raw=swfpath.read_bytes()
 if raw[:4]!=b'FWS\x05' or struct.unpack_from('<I',raw,4)[0]!=len(raw):raise ValueError('SWF header')
 resource_path=BASE/'barrack/05122-XMED.bin';resource=resource_path.read_bytes()
 if resource[12:]!=raw:raise ValueError('SWF does not match preserved XMED resource')
 index=json.loads((BASE/'barrack/cast-media-index.json').read_text())
 if not any(x['parent']==4056 and x['child']==5122 and x['tag']=='XMED' for x in index['key_links']):raise ValueError('cast/resource binding')
 bits=Bits(raw,8);stage=bits.rect();rate,frames=struct.unpack_from('<HH',raw,bits.pos)
 records=list(tags(raw,bits.pos+4));counts={}
 placements=[];frame=1;shape=None;sprite=None;bitmap=None
 for tag,body in records:
  counts[tag]=counts.get(tag,0)+1
  if tag in (12,59,72,82):raise ValueError('executable action tag')
  if tag==35:
   cid,offset=struct.unpack_from('<HI',body);jpeg=body[6:6+offset];alpha=zlib.decompress(body[6+offset:]);im=Image.open(io.BytesIO(jpeg)).convert('RGB')
   if len(alpha)!=im.width*im.height:raise ValueError('alpha dimensions')
   rgba=im.convert('RGBA');rgba.putalpha(Image.frombytes('L',im.size,alpha));rgba.save(OUT/'hurt-barrack.png')
   bitmap={'characterId':cid,'dimensions':list(im.size),'jpegSha256':sha(jpeg),'alphaSha256':sha(alpha),'rgbaPixelSha256':sha(rgba.tobytes()),'alphaRange':[min(alpha),max(alpha)],'rgbPolicy':'Decoded JPEG RGB plus exact zlib alpha, without color correction or re-encoding JPEG.'}
  if tag==2:
   cid=struct.unpack_from('<H',body)[0];r=Bits(body,2);bounds=r.rect();p=r.pos;fill_count=body[p];p+=1;fills=[]
   for _ in range(fill_count):
    kind=body[p];p+=1
    if kind not in (0x40,0x41):raise ValueError('unexpected fill')
    bid=struct.unpack_from('<H',body,p)[0];p+=2;r=Bits(body,p);m=r.matrix();p=r.pos;fills.append({'type':kind,'bitmapId':bid,'matrix':m})
   if body[p]!=0:raise ValueError('unexpected line styles')
   r=Bits(body,p+1);nf=r.u(4);nl=r.u(4);vertices=[];x=y=0;selected_fill=None
   while True:
    if r.u(1):
     if not r.u(1):raise ValueError('unexpected curved edge')
     n=r.u(4)+2
     if r.u(1):dx=r.s(n);dy=r.s(n)
     elif r.u(1):dx=0;dy=r.s(n)
     else:dx=r.s(n);dy=0
     x+=dx;y+=dy;vertices.append([x,y])
    else:
     f=r.u(5)
     if not f:break
     if f&1:n=r.u(5);x=r.s(n);y=r.s(n);vertices.append([x,y])
     if f&2:r.u(nf)
     if f&4:selected_fill=r.u(nf)
     if f&8:r.u(nl)
     if f&16:raise ValueError('unexpected style extension')
   if selected_fill!=2 or vertices!=[[820,-240],[-820,-240],[-820,-860],[820,-860],[820,-240]]:raise ValueError('unexpected bitmap polygon')
   shape={'characterId':cid,'boundsTwips':bounds,'fills':fills,'selectedFill':selected_fill,'polygonTwips':vertices,'rawShapeBodySha256':sha(body)}
  if tag==39:
   cid,n=struct.unpack_from('<HH',body);nested=list(tags(body,4));ps=[]
   for t,bod in nested:
    if t in (12,59,72,82):raise ValueError('sprite action')
    if t==26:
     flags= bod[0];depth=struct.unpack_from('<H',bod,1)[0];p=3;char=None
     if flags&2:char=struct.unpack_from('<H',bod,p)[0];p+=2
     m=Bits(bod,p).matrix() if flags&4 else None;ps.append({'flags':flags,'depth':depth,'characterId':char,'matrix':m})
   sprite={'characterId':cid,'frames':n,'placements':ps,'tagCounts':{str(t):sum(x==t for x,_ in nested) for t,_ in nested}}
  if tag==26:
   flags=body[0];depth=struct.unpack_from('<H',body,1)[0];p=3;cid=None
   if flags&2:cid=struct.unpack_from('<H',body,p)[0];p+=2
   r=Bits(body,p);m=r.matrix() if flags&4 else None
   placements.append({'frame':frame,'flags':flags,'depth':depth,'characterId':cid,'matrix':m})
  if tag==1:frame+=1
 if frames!=361 or len(placements)!=361 or frame!=362 or bitmap is None or shape is None or sprite is None:raise ValueError('unexpected structure')
 woodland=BASE/'woodland/media/06226-hurtrot-rgba.png';shutil.copyfile(woodland,OUT/'hurt-woodland.png');woodim=Image.open(woodland)
 payload={'executed':False,'sourceSwf':str(swfpath.relative_to(ROOT)),'sourceSwfSha256':sha(raw),'barrackResource':{'castId':4056,'castName':'hurtrot','resourceId':5122,'path':str(resource_path.relative_to(ROOT)),'sha256':sha(resource),'swfOffset':12},'swfVersion':raw[3],'stageBoundsTwips':stage,'frameRate':rate/256,'frameCount':frames,'tagCounts':counts,'bitmap':bitmap,'shape':shape,'sprite':sprite,'placements':placements,'woodland':{'source':str(woodland.relative_to(ROOT)),'sha256':sha(woodland.read_bytes()),'dimensions':list(woodim.size),'mode':woodim.mode,'packaging':'byte-for-byte copy'},'outputs':{n:sha((OUT/n).read_bytes()) for n in ('hurt-barrack.png','hurt-woodland.png')},'scriptSha256':sha(Path(__file__).read_bytes()),'frameMappingLimit':'Source requests posterFrame=361+vang, vang=(yaw+rot.z) mod 360. SWF frames only 1..361. Native signed remainder, out-of-range posterFrame coercion and filtering are not proven. Raw transforms are authoritative; normalized angular selection must be labelled browser adapter.'}
 provenance=json.dumps(payload,indent=2)+'\n'
 (OUT/'hurt-overlay-provenance.json').write_text(provenance)
 # Vite imports belong in src; retain public provenance for external inspection.
 imported_provenance=ROOT/'src/assets/original-effects/hurt-overlay-provenance.json'
 imported_provenance.parent.mkdir(parents=True,exist_ok=True)
 imported_provenance.write_text(provenance)
 print(json.dumps({k:payload[k] for k in ('stageBoundsTwips','frameCount','bitmap','shape','sprite','outputs')},indent=2))
if __name__=='__main__':main()
