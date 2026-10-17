#!/usr/bin/env python3
"""Static source door audit; no VM execution. Preserve full parsed tracks and raw blocks."""
import json,struct,math,hashlib,sys
from pathlib import Path
import numpy as np
base=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/research-evidence/2026-09-30')
out=base/'original-door-animation';out.mkdir(exist_ok=True)
def sample(keys,t):
 if t<=keys[0]['time']:return keys[0]
 if t>=keys[-1]['time']:return keys[-1]
 i=next(i for i in range(len(keys)-1)if keys[i+1]['time']>=t);a,b=keys[i:i+2];f=(t-a['time'])/(b['time']-a['time']);q0=np.array(a['quaternion_xyzw']);q1=np.array(b['quaternion_xyzw']);q0/=np.linalg.norm(q0);q1/=np.linalg.norm(q1);dot=float(q0@q1)
 if dot<0:q1=-q1;dot=-dot
 if dot>.9995:q=(1-f)*q0+f*q1
 else:
  theta=math.acos(min(1,dot));q=(math.sin((1-f)*theta)*q0+math.sin(f*theta)*q1)/math.sin(theta)
 q/=np.linalg.norm(q)
 return {'time':t,'position':((1-f)*np.array(a['position'])+f*np.array(b['position'])).tolist(),'scale':((1-f)*np.array(a['scale'])+f*np.array(b['scale'])).tolist(),'quaternion_xyzw':q.tolist()}
def matrix(k):
 x,y,z,w=k['quaternion_xyzw'];q=np.array([x,y,z,w]);q/=np.linalg.norm(q);x,y,z,w=q
 m=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]])
 m[:3,:3]*=np.array(k['scale'])[None,:];m[:3,3]=k['position'];return m
for name in ['barrack-level1','woodland-level2']:
 metadata=json.loads((base/'w3d-metadata'/f'{name}.json').read_text());g=json.loads((base/'w3d-rig-audit'/name/'geometry.json').read_text());parsed=json.loads((base/'w3d-rig-audit'/name/'rig-motion.json').read_text());raw=(base/'director-extraction'/metadata['edition']/f"{metadata['resource_id']:05d}-XMED.bin").read_bytes();ifx=raw[metadata['wrapper_offset']:];dest=out/name;dest.mkdir(exist_ok=True);blocks=[];bindings=[]
 for block in metadata['blocks']:
  if block['type']not in ['ffffff96','ffffff67']:continue
  at=block['offset'];data=ifx[at+8:at+8+block['bytes']];path=f"{at:06d}-{block['type']}.bin";(dest/path).write_bytes(data);record={**block,'path':path,'sha256':hashlib.sha256(data).hexdigest()};blocks.append(record)
  if block['type']=='ffffff96':
   p=0
   def take(n):
    global p
    assert p+n<=len(data);v=data[p:p+n];p+=n;return v
   def string():return take(struct.unpack('<H',take(2))[0]).decode('latin1')
   node=string();attrs=take(1)[0];rate=struct.unpack('<f',take(4))[0];count=struct.unpack('<I',take(4))[0];mixers=[]
   for _ in range(count):mixers.append({'motion':string(),'attributes':take(1)[0],'time_offset':struct.unpack('<f',take(4))[0],'time_scale':struct.unpack('<f',take(4))[0]})
   blend=struct.unpack('<f',take(4))[0];axis,concat=struct.unpack('<II',take(8));assert p==len(data)
   bindings.append({'node':node,'attributes':attrs,'time_scale':rate,'mixers':mixers,'blend_time':blend,'axis_lock':axis,'concatenation':concat,'raw_block':record})
 (dest/'full-map-motions.json').write_text(json.dumps(parsed,indent=2)+'\n');doors=[]
 for node in g['nodes']:
  if not node['name'].startswith('door '):continue
  binding=next(b for b in bindings if b['node']==node['name']);mo=next(m for m in parsed['motions']if m['name']==binding['mixers'][0]['motion']);assert len(mo['tracks'])==1;track=mo['tracks'][0];assert track['bone']==node['name'];keys=track['keys'];assert all(a['time']<=b['time']for a,b in zip(keys,keys[1:]));base_m=np.array(node['matrix']).reshape(4,4,order='F');samples=[]
  for t in [0,.25,.5,.75,1,1.6,1.6333333333333,2.3342,3.3333]:
   k=sample(keys,t);local=matrix(k);world=base_m@local;samples.append({'time_seconds':t,'source_delta_trs':k,'source_delta_matrix':local.flatten(order='F').tolist(),'source_base_times_delta_matrix':world.flatten(order='F').tolist(),'delta_angle_degrees':2*math.degrees(math.atan2(np.linalg.norm(k['quaternion_xyzw'][:3]),k['quaternion_xyzw'][3]))})
  meshes=[m for m in g['meshes']if m['resource']==node['resource']];corners=np.array([p for m in meshes for p in m['positions']]);doors.append({'name':node['name'],'parent':node['parent'],'resource':node['resource'],'visibility':node['visibility'],'source_base_matrix':node['matrix'],'source_style':node.get('source_style'),'binding':binding,'motion':mo,'mesh_parts':len(meshes),'mesh_vertices':len(corners),'local_bounds_min':corners.min(axis=0).tolist(),'local_bounds_max':corners.max(axis=0).tolist(),'samples':samples})
 result={'edition':metadata['edition'],'source_xmed_sha256':hashlib.sha256(raw).hexdigest(),'source_ifx_version':metadata['ifx_version'],'doors':doors,'raw_blocks':blocks,'validation':{'door_nodes':len(doors),'motion_count':len(parsed['motions']),'binding_count':len(bindings),'key_count':sum(len(m['tracks'][0]['keys'])for m in parsed['motions']),'all_raw_modifiers_consumed_exactly':True,'node_motion_track_names_match':True},'matrix_composition':'source base * sampled local TRS; supported by Intel IFX animation modifier input.Multiply(rootClearance); not VM-tested'}
 (dest/'door-tracks.json').write_text(json.dumps(result,indent=2)+'\n');print(name,result['validation'])
files=[{'path':str(p.relative_to(out)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sorted(out.rglob('*'))if p.is_file()and p.name!='manifest.json'];(out/'manifest.json').write_text(json.dumps({'files':files,'source_parser_commit':'68376fbb4494a6bbad4c70081ecdcb99814a74c9','mode':'static parsing, no runtime execution'},indent=2)+'\n')
