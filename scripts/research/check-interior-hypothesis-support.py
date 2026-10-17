#!/usr/bin/env python3
"""Static triangle checks for every retained interior pose; no renderer or VM."""
from pathlib import Path
import hashlib,json
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research-evidence/2026-10-02/interior-coupled-wall-hypotheses'


def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    scene_path=ROOT/'public/assets/original-scenes/woodland/scene.json'
    scene=json.loads(scene_path.read_text());nodes={n['name'].lower():n for n in scene['nodes']};matrices={}
    def matrix(name):
        if name in matrices:return matrices[name]
        n=nodes[name];local=np.array(n['matrix']).reshape((4,4),order='F');parent=n['parent'].lower()
        matrices[name]=(np.eye(4)if parent in ('','world')else matrix(parent))@local
        return matrices[name]
    tris=[];ids=[]
    for n in scene['nodes']:
        if n['resource']not in ('floor','plinths','woodenshed','sheds'):continue
        for m in scene['meshes']:
            if m['resource']!=n['resource']:continue
            source=(np.c_[m['positions'],np.ones(len(m['positions']))]@matrix(n['name'].lower()).T)[:,:3]
            world=source[:,[0,2,1]]*(1.72/85);world[:,2]*=-1
            for i,face in enumerate(m['faces']):
                tris.append(world[face]);ids.append({'node':n['name'],'part':m['part'],'face':i})
    tris=np.array(tris);edge1=tris[:,1]-tris[:,0];edge2=tris[:,2]-tris[:,0]
    def intersections(origin,direction):
        cross=np.cross(direction,edge2);det=np.einsum('ij,ij->i',edge1,cross);valid=abs(det)>1e-10
        inv=np.divide(1.,det,out=np.zeros_like(det),where=valid);delta=origin-tris[:,0]
        u=np.einsum('ij,ij->i',delta,cross)*inv;v_cross=np.cross(delta,edge1)
        v=np.einsum('j,ij->i',direction,v_cross)*inv;t=np.einsum('ij,ij->i',edge2,v_cross)*inv
        valid&=(u>=-1e-8)&(v>=-1e-8)&(u+v<=1+1e-8)&(t>1e-7)
        return np.where(valid,t,np.inf)
    results=[]
    for r in json.loads((OUT/'fit-results.json').read_text())['results']:
        if r['fit'] is None:continue
        path=ROOT/r['fit'];f=json.loads(path.read_text());origin=np.array(f['position']);down=intersections(origin,np.array([0.,-1.,0.]))
        index=int(np.argmin(down));support=None
        if np.isfinite(down[index]):support={'eyeAboveSurface':float(down[index]),'surfaceY':float(origin[1]-down[index]),'triangle':ids[index],'standingHeightComparison':1.72,'differenceFromStanding':float(down[index]-1.72)}
        points=[]
        for p in f['points']:
            hits=intersections(origin,np.array(p['world'])-origin);occluder=int(np.argmin(hits))
            blocked=bool(hits[occluder]<1-1e-6)
            points.append({'descriptorMatchIndex':p['descriptorMatchIndex'],'role':p['role'],'semanticRegion':p['semanticRegion'],'errorPixels':p['errorPixels'],'occludedByStaticTriangle':blocked,'firstOccluder':ids[occluder] if blocked else None,'segmentFraction':float(hits[occluder]) if blocked else None})
        results.append({'id':r['id'],'fit':str(path.relative_to(ROOT)),'fitSha256':sha(path),'eyeSupport':support,'occludedTraining':sum(p['occludedByStaticTriangle']for p in points if p['role']=='fit'),'occludedHeldout':sum(p['occludedByStaticTriangle']for p in points if p['role']=='heldout'),'points':points})
    data={'generator':str(Path(__file__).relative_to(ROOT)),'generatorSha256':sha(Path(__file__)),'scene':str(scene_path.relative_to(ROOT)),'sceneSha256':sha(scene_path),'fitResultsSha256':sha(OUT/'fit-results.json'),'originalRuntimeExecuted':False,'rendererExecuted':False,'allRetainedPosesChecked':True,'supportAndOcclusionResources':['floor','plinths','woodenshed','sheds'],'triangleCount':len(tris),'results':results,'limits':['Unoriented exact mesh triangle intersections are a diagnostic; native sidedness/filtering/contact skin is unproved.', 'Support is a downward geometric ray at the eye position, not a native player shape contact or movement proof.', 'Only listed fixed geometry is considered; animated doors, other structures and native collision state are not recovered by this check.', 'No point or hypothesis is discarded based on support, occlusion or residual.', 'Low residual alone cannot identify a duplicated source component or native illumination.']}
    (OUT/'support-occlusion.json').write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps({'triangles':len(tris),'results':[{k:r[k]for k in ['id','eyeSupport','occludedTraining','occludedHeldout']}for r in results]},indent=2))


if __name__=='__main__':main()
