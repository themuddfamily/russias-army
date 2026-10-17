#!/usr/bin/env python3
"""Inspect preserved Shockwave IFX scene metadata without running game code.

Independent bounded Python reader of layouts documented by dirplayer-rs:
https://github.com/igorlira/dirplayer-rs/tree/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/director/chunks/w3d
Only nodes and model-resource declarations are decoded; CLOD bytes stay intact.
Usage: python scripts/research/inspect-w3d-metadata.py [evidence-directory]
"""
import json,struct,hashlib,collections,math,sys
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/research-evidence/2026-09-30')
out=root/'w3d-metadata';out.mkdir(exist_ok=True)
class Reader:
 def __init__(self,b):self.b=b;self.p=0
 def take(self,n):
  if n<0 or self.p+n>len(self.b):raise ValueError('read outside block')
  v=self.b[self.p:self.p+n];self.p+=n;return v
 def u32(self):return struct.unpack('<I',self.take(4))[0]
 def f32(self):return struct.unpack('<f',self.take(4))[0]
 def string(self):return self.take(struct.unpack('<H',self.take(2))[0]).decode('latin1')
 def matrix(self):return [self.f32() for _ in range(16)]
for edition in ['barrack','woodland']:
 folder=root/'director-extraction'/edition;idx=json.loads((folder/'cast-media-index.json').read_text())
 for c in idx['cast_members']:
  if c['name'] not in ['level1','level2','gunz','baddy']:continue
  link=next(x for x in idx['key_links'] if x['parent']==c['id'] and x['tag']=='XMED')
  path=folder/f"{link['child']:05d}-XMED.bin";raw=path.read_bytes();start=raw.find(b'IFX\0',0,256);assert start>=0
  data=raw[start:];hs,version,length=struct.unpack_from('<III',data,4);assert length==len(data)
  p=8+hs;blocks=[];nodes=[];resources=[];errors=[]
  while p+8<=len(data):
   typ,size=struct.unpack_from('<II',data,p);at=p;p+=8
   if p+size>len(data):raise ValueError('invalid block bounds')
   b=data[p:p+size];p=(p+size+3)&~3;blocks.append({'offset':at,'type':f'{typ:08x}','bytes':size})
   r=Reader(b)
   try:
    if typ in [0xffffff70,0xffffff72,0xffffff77,0xffffff78]:
     v={'name':r.string(),'parent':r.string(),'resource':r.string(),'type':'model' if typ in [0xffffff72,0xffffff78] else 'group','matrix':r.matrix()}
     if typ in [0xffffff77,0xffffff78]:v['bounds_sphere']=[r.f32() for _ in range(4)];v['bounds_box']=[r.f32() for _ in range(4)]
     if v['type']=='model':
      v['model_resource']=r.string();v['style']=r.string();v['visibility']=r.u32()&3;v['shader']=r.string()
     if not all(math.isfinite(f) for f in v['matrix']):raise ValueError('nonfinite transform')
     v['translation']=v['matrix'][12:15];nodes.append(v)
    elif typ==0xffffff45:
     v={'name':r.string(),'attributes':r.u32(),'meshes':[]};n=r.u32();assert n<10000
     for _ in range(n):v['meshes'].append({'vertices':r.u32(),'faces':r.u32(),'update_data_count':r.u32(),'updates':r.u32(),'inverse_sync_bias':r.f32(),'vertex_attributes':r.u32()})
     ns=r.u32();assert ns<10000;v['shader_bindings']=[]
     for _ in range(ns):v['shader_bindings'].append({'name':r.string(),'mesh_bindings':[r.string() for _ in range(n)]})
     if len(b)-r.p>=16:v['bounding_sphere']=[r.f32() for _ in range(4)]
     resources.append(v)
   except Exception as e:errors.append({'block_offset':at,'type':f'{typ:08x}','error':str(e)})
  result={'edition':edition,'cast_name':c['name'],'cast_id':c['id'],'resource_id':link['child'],'source_sha256':hashlib.sha256(raw).hexdigest(),'wrapper_offset':start,'ifx_header_size':hs,'ifx_version':version,'declared_length_matches':length==len(data),'blocks':blocks,'block_counts':dict(collections.Counter(x['type'] for x in blocks)),'nodes':nodes,'model_resources':resources,'errors':errors,'parser_reference':'https://github.com/igorlira/dirplayer-rs/tree/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/director/chunks/w3d'}
  (out/f'{edition}-{c["name"]}.json').write_text(json.dumps(result,indent=2)+'\n');print(edition,c['name'],'blocks',len(blocks),'nodes',len(nodes),'resources',len(resources),'errors',len(errors),'counts',result['block_counts']);print('sample',nodes[:2])
