#!/usr/bin/env python3
"""Passive preserved13s tank correspondence audit; never fit a camera.

All reciprocal ratio matches and all source UV candidates survive, including
false matches, outside-image-region matches, and repeated source locations.
"""
from pathlib import Path
import hashlib,json
import cv2,numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research-evidence/2026-10-02/interior-13s-tank-search'


def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    cv2.setNumThreads(1)
    scene_path=ROOT/'public/assets/original-scenes/woodland/scene.json'
    reference_path=ROOT/'docs/research-evidence/2026-10-02/interior-approach-textures/woodland-video-13s.jpg'
    scene=json.loads(scene_path.read_text());nodes={n['name'].lower():n for n in scene['nodes']};matrices={}
    def matrix(name):
        if name in matrices:return matrices[name]
        n=nodes[name];parent=n['parent'].lower();local=np.array(n['matrix']).reshape((4,4),order='F')
        matrices[name]=(np.eye(4)if parent in ('','world')else matrix(parent))@local
        return matrices[name]
    ref=cv2.imread(str(reference_path),0);sift=cv2.SIFT_create(nfeatures=6000,contrastThreshold=.005)
    kr,dr=sift.detectAndCompute(ref,None);OUT.mkdir(parents=True,exist_ok=True);summaries=[]
    for resource,texture,roi in [('lorryback','lorryback',[517,121,549,158])]:
        atlas_path=ROOT/f'public/assets/original-scenes/woodland/textures/{texture}.png'
        atlas=cv2.imread(str(atlas_path),0);ka,da=sift.detectAndCompute(atlas,None)
        roles=[]
        for k in ka:
            coordinate=f'{round(k.pt[0])},{round(k.pt[1])}'
            roles.append('heldout'if int(hashlib.sha256(coordinate.encode()).hexdigest()[:8],16)%3==0 else 'fit')
        reverse={m.queryIdx:m.trainIdx for m in cv2.BFMatcher().match(dr,da)}
        meshes=[]
        for m in scene['meshes']:
            if m['resource']==resource:
                uv=np.array(m['tex_coords'][0]);uv=np.column_stack((uv[:,0]+.5,.5-uv[:,1]))*[atlas.shape[1],atlas.shape[0]]-.5
                meshes.append((m,uv,np.array(m['positions'])))
        records=[];landmarks=[];atlas_empty=da is None or dr is None
        if atlas_empty:raise ValueError('Missing descriptor data')
        for best,second in cv2.BFMatcher().knnMatch(da,dr,k=2):
            if best.distance>=.7*second.distance or reverse.get(best.trainIdx)!=best.queryIdx:continue
            q=np.array(ka[best.queryIdx].pt);pixel=list(kr[best.trainIdx].pt);candidates=[]
            for m,uv,positions in meshes:
                for face_index,face in enumerate(m['faces']):
                    t=uv[face];system=np.column_stack((t[1]-t[0],t[2]-t[0]))
                    if abs(np.linalg.det(system))<1e-8:continue
                    b=np.linalg.solve(system,q-t[0]);weights=np.r_[1-sum(b),b]
                    if min(weights)<-1e-8:continue
                    local=weights@positions[face]
                    for n in scene['nodes']:
                        if n['resource']!=resource:continue
                        source=(matrix(n['name'].lower())@np.r_[local,1])[:3];world=[source[0]*1.72/85,source[2]*1.72/85,-source[1]*1.72/85]
                        candidates.append({'node':n['name'],'part':m['part'],'face':face_index,'barycentric':weights.tolist(),'sourceLocalPoint':local.tolist(),'worldPoint':world})
            distinct={tuple(np.round(c['worldPoint'],7))for c in candidates}
            i=len(records);in_roi=roi[0]<=pixel[0]<=roi[2]and roi[1]<=pixel[1]<=roi[3]
            item={'matchIndex':i,'atlasPixel':q.tolist(),'pixel':pixel,'role':roles[best.queryIdx],'descriptorDistance':float(best.distance),'descriptorRatio':float(best.distance/second.distance),'reciprocalNearest':True,'withinExploratoryReferenceRegion':in_roi,'sourceCandidates':candidates,'distinctSourceLocationCount':len(distinct)};records.append(item)
            if len(candidates)==1:
                c=candidates[0]
                landmarks.append({'id':f'{resource}-approach-{i}','node':c['node'],'part':c['part'],'face':c['face'],'barycentric':c['barycentric'],'pixel':pixel,'role':item['role'],'uncertaintyPixels':2,'atlasPixel':q.tolist(),'withinExploratoryReferenceRegion':in_roi})
        data={'scene':str(scene_path.relative_to(ROOT)),'sceneSha256':sha(scene_path),'atlas':str(atlas_path.relative_to(ROOT)),'atlasSha256':sha(atlas_path),'reference':str(reference_path.relative_to(ROOT)),'referenceSha256':sha(reference_path),'generator':str(Path(__file__).relative_to(ROOT)),'generatorSha256':sha(Path(__file__)),'imageSize':[ref.shape[1],ref.shape[0]],'scale':1.72/85,'verticalFovDegrees':50,'descriptorMatches':records,'landmarks':landmarks,'counts':{'atlasDescriptors':len(ka),'referenceDescriptors':len(kr),'reciprocalRatioMatches':len(records),'strictUniqueSourceTriangleLandmarks':len(landmarks),'uniqueInsideExploratoryRegion':sum(l['withinExploratoryReferenceRegion']for l in landmarks),'outsideExploratoryRegion':sum(not x['withinExploratoryReferenceRegion']for x in records)},'method':{'opencvVersion':cv2.__version__,'nfeatures':6000,'contrastThreshold':.005,'ratioThreshold':.7,'roleRule':'Atlas coordinate SHA256 modulo3, assigned before reference matching','uvAdapter':'(u+.5,.5-v)*textureDimensions-.5','sourceCandidateSelection':'All containing triangles in every part/instance of the resource; no camera/geometry residual','referenceRegion':roi,'referenceRegionUse':'Exploratory annotation only, no descriptor discarded'},'originalRuntimeExecuted':False,'cameraFitAttempted':False,'limits':['Reciprocal SIFT ratio evidence can still contain false matches.','Source UV convention remains an adapter assumption, not native raster proof.','Every candidate retained; source component is not selected by image or camera residual.','Exploratory tank region derives from the visible white/rusted object, not a camera.','Two-pixel landmark uncertainty retained; fitting requires adequate independently unique geometry and withheld features.']}
        path=OUT/f'woodland-13s-{resource}-matches.json';path.write_text(json.dumps(data,indent=2)+'\n');summaries.append({'path':str(path.relative_to(ROOT)),'sha256':sha(path),'counts':data['counts']})
    inventory_path=ROOT/'docs/research-evidence/2026-10-02/interior-approach-textures/woodland-13s-source-boundary-inventory.json'
    inventory=json.loads(inventory_path.read_text())
    summary={'priorBoundaryInventory':str(inventory_path.relative_to(ROOT)),'priorBoundaryInventorySha256':sha(inventory_path),'allEightJambEdgesRetained':inventory['sourceDoorJambCandidates'],'allFourNominalCapSamplingCandidatesRetained':inventory['tankAtlasSampling']['sourceCandidates'],'generatorSha256':sha(Path(__file__)),'originalRuntimeExecuted':False,'cameraFitAttempted':False,'results':summaries}
    (OUT/'tank-matcher-results.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))


if __name__=='__main__':main()
