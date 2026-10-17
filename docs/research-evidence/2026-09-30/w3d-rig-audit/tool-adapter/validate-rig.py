import json,struct,math,pathlib,numpy as np
base=pathlib.Path('/root/russias-army/docs/research-evidence/2026-09-30/w3d-rig-audit')
b=(base/'barrack-baddy/scene.glb').read_bytes();ln,typ=struct.unpack_from('<II',b,12);g=json.loads(b[20:20+ln]);bs=20+ln;bn,bt=struct.unpack_from('<II',b,bs);data=b[bs+8:bs+8+bn]
def acc(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']];return np.frombuffer(data,dtype=dtype,count=a['count']*size,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],size).copy()
def mat(n):
 if 'matrix'in n:return np.array(n['matrix']).reshape(4,4,order='F')
 x,y,z,w=n.get('rotation',[0,0,0,1]);q=np.array([x,y,z,w],dtype=float);q/=np.linalg.norm(q);x,y,z,w=q
 r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],[0,0,0,1]])
 r[:3,:3]*=np.array(n.get('scale',[1,1,1]))[None,:];r[:3,3]=n.get('translation',[0,0,0]);return r
parents={c:i for i,n in enumerate(g['nodes'])for c in n.get('children',[])}
def world(nodes,i):return world(nodes,parents[i])@mat(nodes[i])if i in parents else mat(nodes[i])
sk=g['skins'][0];ib=acc(sk['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);meshnode=next(i for i,n in enumerate(g['nodes'])if 'mesh'in n and 'skin'in n);p=g['meshes'][g['nodes'][meshnode]['mesh']]['primitives'][0];at=p['attributes'];pos=acc(at['POSITION']);joints=acc(at['JOINTS_0']);weights=acc(at['WEIGHTS_0']);hom=np.c_[pos,np.ones(len(pos))]
def skin(nodes):
 invmesh=np.linalg.inv(world(nodes,meshnode));sm=np.array([invmesh@world(nodes,j)@m for j,m in zip(sk['joints'],ib)]);return sum(weights[:,k,None]*np.einsum('vij,vj->vi',sm[joints[:,k]],hom)for k in range(4))[:,:3]
rest=skin(g['nodes']);report={'vertices':len(pos),'joints':len(sk['joints']),'rest_skin_max_position_error':float(np.max(np.abs(rest-pos))),'weight_min':float(weights.min()),'weight_max':float(weights.max()),'weight_sum_max_error':float(np.max(np.abs(weights.sum(axis=1)-1))),'animation_channels':len(g['animations'][0]['channels']),'samples':[]}
def sample(t):
 nodes=json.loads(json.dumps(g['nodes']));anim=g['animations'][0]
 for c in anim['channels']:
  s=anim['samplers'][c['sampler']];times=acc(s['input'])[:,0];vals=acc(s['output']);hi=int(np.searchsorted(times,t,side='right'));lo=max(0,hi-1);hi=min(len(times)-1,hi);a=0 if hi==lo else (t-times[lo])/(times[hi]-times[lo]);v0=vals[lo];v1=vals[hi];path=c['target']['path']
  if path=='rotation' and np.dot(v0,v1)<0:v1=-v1
  v=(1-a)*v0+a*v1
  if path=='rotation':v/=np.linalg.norm(v)
  nodes[c['target']['node']][path]=v.tolist()
 out=skin(nodes);return {'time':t,'finite':bool(np.isfinite(out).all()),'bounds_min':out.min(axis=0).tolist(),'bounds_max':out.max(axis=0).tolist(),'max_vertex_delta_from_rest':float(np.max(np.linalg.norm(out-rest,axis=1)))}
for t in [0,0.5,1,1.5,2,2.5,3,3.3333]:report['samples'].append(sample(t))
assert report['rest_skin_max_position_error']<0.002 and all(x['finite']for x in report['samples'])
(base/'rig-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
