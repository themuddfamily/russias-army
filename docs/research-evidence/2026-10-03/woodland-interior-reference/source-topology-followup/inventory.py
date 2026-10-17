from pathlib import Path
import json,hashlib,numpy as np
P=Path(__file__).resolve().parent;ROOT=P.parents[4]
scene_path=ROOT/'public/assets/original-scenes/woodland/scene.json';scene=json.loads(scene_path.read_text());m=next(m for m in scene['meshes']if m['resource']=='stonebarn');pos=np.array(m['positions']);uv=np.array(m['tex_coords'][0]);uv=np.column_stack((uv[:,0]+.5,.5-uv[:,1]))*512-.5
faces=[]
for i,idx in enumerate(m['faces']):
 t=uv[idx];v=pos[idx]
 if min(t[:,1])>128 or max(t[:,1])<0:continue
 n=np.cross(v[1]-v[0],v[2]-v[0]);n/=np.linalg.norm(n)
 faces.append({'face':i,'vertexIndices':idx,'localPositions':v.tolist(),'atlasPixels':t.tolist(),'normal':n.tolist(),'whollyInteriorStrip':bool(min(t[:,1])>=-.51 and max(t[:,1])<=128),'centroid':v.mean(axis=0).tolist()})
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512"><image href="../../../../../public/assets/original-scenes/woodland/textures/stonebarn.png" width="512" height="512"/>']
for f in faces:
 pts=f['atlasPixels'];cx,cy=np.array(pts).mean(axis=0);colour='#00ffff'if f['whollyInteriorStrip']else'#ff66bb';svg.append(f'<polygon points="{" ".join(str(x)+","+str(y)for x,y in pts)}" fill="none" stroke="{colour}" stroke-width=".8"/><text x="{cx}" y="{cy}" font-size="7" fill="{colour}">{f["face"]}</text>')
svg.append('</svg>');(P/'interior-uv-faces.svg').write_text('\n'.join(svg)+'\n')
result={'scene':str(scene_path.relative_to(ROOT)),'sceneSha256':hashlib.sha256(scene_path.read_bytes()).hexdigest(),'resource':'stonebarn','method':'All triangles touching atlas y=0..128 retained, with adapter (u+.5,.5-v)*512-.5. No reference-pixel/camera selection. No UV wrapping inferred.','faces':faces,'count':len(faces),'whollyInteriorStripCount':sum(f['whollyInteriorStrip']for f in faces)}
(P/'interior-uv-faces.json').write_text(json.dumps(result,indent=2)+'\n')
print('Faces:',len(faces),'wholly interior:',result['whollyInteriorStripCount'])
for f in faces:print(f['face'],'inside',f['whollyInteriorStrip'],'normal',np.round(f['normal'],4).tolist(),'centroid',np.round(f['centroid'],2).tolist(),'uv',np.round(f['atlasPixels'],1).tolist())
