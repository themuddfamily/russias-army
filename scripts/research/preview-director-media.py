"""Static original-media research previews; never executes Director or Flash.

Independent Python format interpretation, informed by these primary projects:
ProjectorRays src/director/chunk.cpp (CastInfo lists and KEY association);
ScummVM engines/director/images.cpp (BITD run-length/planar pixel layout);
Adobe SWF specification (bounded record headers / DefineBits).
Pillow is required only for this preview helper, not the raw extractor.
Usage: python scripts/research/preview-director-media.py [extraction-directory]
"""
from pathlib import Path
import json,struct,re,argparse
from PIL import Image,ImageDraw
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('extraction_directory',nargs='?',type=Path,default=Path('docs/research-evidence/2026-09-30/director-extraction'))
base=parser.parse_args().extraction_directory
for mode in ['barrack','woodland']:
 folder=base/mode; inv=json.loads((folder/'inventory.json').read_text()); rs={r['id']:r for r in inv['resources']}; names={}; casts=[]
 for r in rs.values():
  if r['tag']!='CASt' or 'filename' not in r: continue
  b=(folder/r['filename']).read_bytes()
  try:
   typ,ilen,slen=struct.unpack_from('>III',b); info=b[12:12+ilen]; name=''
   if ilen>=20:
    off=struct.unpack_from('>I',info)[0]; n=struct.unpack_from('>H',info,off)[0]; offsets=list(struct.unpack_from('>'+str(n)+'I',info,off+2)); total=struct.unpack_from('>I',info,off+2+4*n)[0]; dataoff=off+6+4*n
    if n>1:
     start,end=offsets[1],offsets[2] if n>2 else total; item=info[dataoff+start:dataoff+end]
     if item: name=item[1:1+item[0]].decode('mac_roman')
   names[r['id']]=name
   casts.append({'id':r['id'],'name':name,'member_type':typ,'info_length':ilen,'specific_data_length':slen})
  except (struct.error,IndexError) as e: print('bad cast',mode,r['id'],e)
 links=[]
 for r in rs.values():
  if r['tag']!='KEY*':continue
  b=(folder/r['filename']).read_bytes(); count=struct.unpack_from('<I',b,8)[0]
  for i in range(count):
   child,parent,tag=struct.unpack_from('<II4s',b,12+i*12);links.append({'child':child,'parent':parent,'tag':tag[::-1].decode('ascii',errors='replace'),'name':names.get(parent,'')})
 media=folder/'media';media.mkdir(exist_ok=True); pictures=[]
 for r in rs.values():
  if 'filename' not in r:continue
  b=(folder/r['filename']).read_bytes()
  if not b.startswith(b'\xff\xd8\xff'):continue
  linkage=next((l for l in links if l['child']==r['id']),{});name=linkage.get('name','') or 'unnamed'; fn=f"{r['id']:05d}-{re.sub('[^A-Za-z0-9_-]','_',name)}.jpg";(media/fn).write_bytes(b)
  im=Image.open(media/fn);pictures.append({'resource_id':r['id'],'name':name,'cast_id':linkage.get('parent'),'size':list(im.size),'file':'media/'+fn})
 def sheet(pics,filename):
  cellw,cellh=210,240; cols=5; canvas=Image.new('RGB',(cols*cellw,((len(pics)+cols-1)//cols)*cellh),'#e0e0e0');draw=ImageDraw.Draw(canvas)
  for i,p in enumerate(pics):
   im=Image.open(folder/p['file']).convert('RGB');im.thumbnail((200,200));x=(i%cols)*cellw;y=(i//cols)*cellh;canvas.paste(im,(x+(200-im.width)//2,y));draw.text((x+3,y+203),f"{p['resource_id']} {p['name']}",fill='black');draw.text((x+3,y+219),str(p['size']),fill='black')
  canvas.save(folder/filename)
 sheet(pictures,'jpeg-contact-sheet.jpg')
 sheet([p for p in pictures if p['name'] in ['ak47','rpg','rg6','spas12','pistol','dragunov','GI','mfmachinegun']],'weapon-soldier-contact-sheet.jpg')
 (folder/'cast-media-index.json').write_text(json.dumps({'source_format_reference':'https://github.com/ProjectorRays/ProjectorRays/blob/master/src/director/chunk.cpp','cast_members':casts,'key_links':links,'jpeg_media':pictures},indent=2)+'\n')
 print(mode,'JPEG',len(pictures),'casts',len(casts));

def unrle(b,expected):
 if len(b)==expected:return b
 out=bytearray();i=0
 while i<len(b):
  c=b[i];i+=1
  if c&128:
   if i>=len(b):raise ValueError('truncated run')
   out.extend(bytes([b[i]])*(257-c));i+=1
  else:
   n=c+1
   if i+n>len(b):raise ValueError('truncated literal')
   out.extend(b[i:i+n]);i+=n
  if len(out)>expected:raise ValueError('oversized pixels')
 if len(out)!=expected:raise ValueError((len(out),expected))
 return bytes(out)
for mode in ['barrack','woodland']:
 folder=base/mode;idx=json.loads((folder/'cast-media-index.json').read_text());inv=json.loads((folder/'inventory.json').read_text());rs={r['id']:r for r in inv['resources']}; decoded=[]; errors=[]
 for c in idx['cast_members']:
  if c['member_type']!=1:continue
  links=[l for l in idx['key_links'] if l['parent']==c['id']]; bd=next((l for l in links if l['tag']=='BITD' and l['child'] in rs and 'filename' in rs[l['child']]),None); jpg=next((p for p in idx['jpeg_media'] if p['cast_id']==c['id']),None)
  if not bd and not jpg:continue
  try:
   cb=(folder/rs[c['id']]['filename']).read_bytes();specific=cb[12+c['info_length']:12+c['info_length']+c['specific_data_length']];pitch=struct.unpack_from('>H',specific)[0]&0x3fff;top,left,bottom,right=struct.unpack_from('>hhhh',specific,2);w,h=right-left,bottom-top;bpp=specific[23]
   if w<=0 or h<=0 or w*h>16*1024*1024:raise ValueError('size')
   if bd:
    raw=(folder/rs[bd['child']]['filename']).read_bytes();pixels=unrle(raw,pitch*h)
    if bpp!=32 or pitch!=w*4:raise ValueError('unsupported bitmap')
    rgb=bytearray()
    for y in range(h):
     line=pixels[y*pitch:(y+1)*pitch]
     for x in range(w):rgb.extend((line[w+x],line[2*w+x],line[3*w+x]))
    im=Image.frombytes('RGB',(w,h),bytes(rgb)).convert('RGBA')
   else:im=Image.open(folder/jpg['file']).convert('RGBA')
   a=next((l for l in links if l['tag']=='ALFA'),None)
   if a:im.putalpha(Image.frombytes('L',(w,h),unrle((folder/rs[a['child']]['filename']).read_bytes(),w*h)))
   fn=f"media/{c['id']:05d}-{re.sub('[^A-Za-z0-9_-]','_',c['name'] or 'unnamed')}-rgba.png";im.save(folder/fn);decoded.append({'cast_id':c['id'],'name':c['name'],'size':[w,h],'file':fn,'color_resource':bd['child'] if bd else jpg['resource_id'],'alpha_resource':a['child'] if a else None})
  except Exception as e:errors.append({'cast_id':c['id'],'error':str(e)})
 idx['rgba_media']=decoded;idx['preview_errors']=errors;(folder/'cast-media-index.json').write_text(json.dumps(idx,indent=2)+'\n')
 hud=[p for p in decoded if any(s in p['name'].lower() for s in ['health','hurt'])]
 if hud:
  canvas=Image.new('RGB',(len(hud)*280,330),'#777777');draw=ImageDraw.Draw(canvas)
  for i,p in enumerate(hud):
   im=Image.open(folder/p['file']).convert('RGBA');im=im.resize((256,256),Image.Resampling.NEAREST);canvas.paste(im,(i*280,0),im);draw.text((i*280+3,270),p['name'],fill='white');draw.text((i*280+3,290),str(p['size']),fill='white')
  canvas.save(folder/'hud-bitmap-contact-sheet.png')
 print('RGBA',mode,len(decoded),'errors',errors)

# Static SWF container inspection only: no AVM/ActionScript or Director execution.
# SWF 19 specification: RECT/header followed by bounded RECORDHEADER tags;
# DefineBits (6) stores a uint16 character ID followed by JPEG bytes.
# https://open-flash.github.io/mirrors/swf-spec-19.pdf
for mode in ['barrack', 'woodland']:
 folder=base/mode;idx=json.loads((folder/'cast-media-index.json').read_text());inv=json.loads((folder/'inventory.json').read_text());rs={r['id']:r for r in inv['resources']};swfs=[]
 for c in idx['cast_members']:
  for link in idx['key_links']:
   if link['parent']!=c['id'] or link['tag']!='XMED' or link['child'] not in rs:continue
   raw=(folder/rs[link['child']]['filename']).read_bytes()
   if raw[12:15]!=b'FWS':continue
   length=struct.unpack_from('<I',raw,16)[0]
   if length<12 or length>64*1024*1024 or 12+length>len(raw):raise ValueError('SWF length')
   swf=raw[12:12+length];stem=re.sub('[^A-Za-z0-9_-]','_',c['name'] or 'unnamed');swf_file=f'media/original-{stem.lower()}.swf';(folder/swf_file).write_bytes(swf)
   rect_bits=swf[8]>>3;pos=8+(5+4*rect_bits+7)//8+4;counts={};bitmaps=[]
   while pos<len(swf):
    if pos+2>len(swf):raise ValueError('SWF record header')
    header=struct.unpack_from('<H',swf,pos)[0];pos+=2;tag=header>>6;size=header&63
    if size==63:
     if pos+4>len(swf):raise ValueError('SWF long header')
     size=struct.unpack_from('<I',swf,pos)[0];pos+=4
    if pos+size>len(swf):raise ValueError('SWF record bounds')
    body=swf[pos:pos+size];pos+=size;counts[tag]=counts.get(tag,0)+1
    if tag==6 and size>=2:
     character=struct.unpack_from('<H',body)[0];jpeg_file=f'media/original-{stem.lower()}-character-{character}.jpg';(folder/jpeg_file).write_bytes(body[2:]);im=Image.open(folder/jpeg_file);im.load();png_file=f'media/original-{stem.lower()}-bitmap-raw.png';im.save(folder/png_file);bitmaps.append({'character_id':character,'tag':tag,'size':list(im.size),'jpeg':jpeg_file,'png':png_file})
    if tag==0:break
   swfs.append({'cast_id':c['id'],'cast_name':c['name'],'resource_id':link['child'],'swf_file':swf_file,'version':swf[3],'length':length,'tag_counts':counts,'bitmaps':bitmaps,'executed':False})
 idx['embedded_swf']=swfs;(folder/'cast-media-index.json').write_text(json.dumps(idx,indent=2)+'\n')
