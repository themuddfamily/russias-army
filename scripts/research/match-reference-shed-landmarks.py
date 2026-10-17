#!/usr/bin/env python3
"""Passively audit interior atlas correspondence ambiguity without camera input.

Retain source candidates for each descriptor match, but emit a fitter landmark
only when its UV maps to exactly one distinct source location. Never select a
wall or building component from a camera pose or fitting residual.
"""
import argparse
import hashlib
import json
import os
from collections import Counter
from pathlib import Path
import cv2
import numpy as np


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    cv2.setNumThreads(1)
    scene_path=Path('public/assets/original-scenes/woodland/scene.json')
    atlas_path=Path('public/assets/original-scenes/woodland/textures/woodenshed.png')
    reference_path=Path('docs/research-evidence/2026-09-30/woodland-video-11s.jpg')
    scene=json.loads(scene_path.read_text())
    mesh=next(m for m in scene['meshes']if m['resource']=='woodenshed' and m['part']==0)
    nodes={n['name'].lower():n for n in scene['nodes']}
    def world_matrix(name,visiting=()):
        if name in visiting:
            raise ValueError('Cyclic scene parent')
        node=nodes[name];local=np.array(node['matrix']).reshape((4,4),order='F');parent=node['parent'].lower()
        return (np.eye(4) if parent in ('','world') else world_matrix(parent,visiting+(name,)))@local
    transform=world_matrix('woodenshed')
    atlas=cv2.imread(str(atlas_path),0);reference=cv2.imread(str(reference_path),0)
    sift=cv2.SIFT_create(nfeatures=6000,contrastThreshold=.005)
    ka,da=sift.detectAndCompute(atlas,None)
    roles=[]
    for key in ka:
        coordinate=f'{round(key.pt[0])},{round(key.pt[1])}'
        roles.append('heldout' if int(hashlib.sha256(coordinate.encode()).hexdigest()[:8],16)%3==0 else 'fit')
    kb,db=sift.detectAndCompute(reference,None)
    reverse={m.queryIdx:m.trainIdx for m in cv2.BFMatcher().match(db,da)}
    uv=np.array(mesh['tex_coords'][0]);uv=np.column_stack((uv[:,0]+.5,.5-uv[:,1]))*[atlas.shape[1],atlas.shape[0]]-.5
    positions=np.array(mesh['positions']);scale=1.72/85
    descriptor_matches=[];landmarks=[]
    for best,second in cv2.BFMatcher().knnMatch(da,db,k=2):
        if best.distance>=.7*second.distance or reverse.get(best.trainIdx)!=best.queryIdx:
            continue
        q=np.array(ka[best.queryIdx].pt);candidates=[]
        for index,face in enumerate(mesh['faces']):
            t=uv[face];matrix=np.column_stack((t[1]-t[0],t[2]-t[0]))
            if abs(np.linalg.det(matrix))<1e-8:
                continue
            b=np.linalg.solve(matrix,q-t[0]);weights=np.r_[1-sum(b),b]
            if min(weights)<-1e-8:
                continue
            local=weights@positions[face]
            source=(transform@np.r_[local,1])[:3]
            candidates.append({'face':index,'barycentric':weights.tolist(),
                'sourceLocalPoint':local.tolist(),'worldPoint':[source[0]*scale,source[2]*scale,-source[1]*scale]})
        distinct={tuple(np.round(x['sourceLocalPoint'],7))for x in candidates}
        item={'atlasPixel':q.tolist(),'pixel':list(kb[best.trainIdx].pt),
            'role':roles[best.queryIdx],'descriptorDistance':float(best.distance),
            'descriptorRatio':float(best.distance/second.distance),'reciprocalNearestDescriptor':True,
            'sourceCandidates':candidates,'distinctSourceLocationCount':len(distinct)}
        descriptor_matches.append(item)
        if len(candidates)==1:
            candidate=candidates[0]
            landmarks.append({'id':f'shed-sift-{q[0]:.3f}-{q[1]:.3f}','node':'woodenshed','part':0,
                'face':candidate['face'],'barycentric':candidate['barycentric'],
                'pixel':item['pixel'],'role':item['role'],'uncertaintyPixels':2})
    histogram=Counter(x['distinctSourceLocationCount']for x in descriptor_matches)
    data={'scene':str(scene_path),'sceneSha256':digest(scene_path),
        'atlas':str(atlas_path),'atlasSha256':digest(atlas_path),
        'reference':str(reference_path),'referenceSha256':digest(reference_path),
        'generator':'scripts/research/match-reference-shed-landmarks.py','generatorSha256':digest(__file__),
        'imageSize':[reference.shape[1],reference.shape[0]],'scale':scale,'verticalFovDegrees':50,
        'landmarks':landmarks,'descriptorMatches':descriptor_matches,
        'counts':{'atlasDescriptors':len(ka),'referenceDescriptors':len(kb),
            'reciprocalRatioMatches':len(descriptor_matches),'globallyUniqueUvLandmarks':len(landmarks),
            'distinctSourceLocationMultiplicityHistogram':dict(sorted(histogram.items()))},
        'method':{'detector':'OpenCV SIFT','opencvVersion':cv2.__version__,
            'nfeatures':6000,'contrastThreshold':.005,'ratioThreshold':.7,
            'reciprocalNearest':True,'sourceAtlasPatch':'Entire atlas',
            'uvPixelConvention':'(u+.5,.5-v)*(width,height)-.5',
            'faceSelection':'Exactly one containing triangle over entire source mesh; ambiguous matches rejected',
            'roleRule':'SHA256 of rounded atlas x,y first eight hex digits modulo3 zero means heldout, assigned before reference matching',
            'worldTransform':'Full column-major source node parent chain, then source Z-up to world Y-up with scale1.72/85',
            'geometricOutlierSelection':'None'},
        'conclusion':'No eligible unique source-point correspondences; repeated wall/building UVs prevent independent pose fitting from these matches.',
        'limitations':['Descriptor matches may be false even with reciprocal ratio tests.',
            'Selecting among UV candidates using a prior camera would make this evidence circular.',
            'Room/component identity and wall orientation need independent geometric evidence.',
            'UV adapter is an explicit current reconstruction assumption, not fresh native Director proof.',
            'No original code, camera, projection, browser, or renderer was executed.']}
    args.output.write_text(json.dumps(data,indent=2)+'\n')
    svg=args.output.with_suffix('.svg');href=os.path.relpath(reference_path,svg.parent)
    marks=''.join(f'<circle cx="{x["pixel"][0]}" cy="{x["pixel"][1]}" r="3" stroke="#ff9900" fill="none"/>'for x in descriptor_matches)
    svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{reference.shape[1]}" height="{reference.shape[0]}"><image href="{href}" width="100%" height="100%"/>{marks}</svg>\n')
    print(json.dumps({'output':str(args.output),'counts':data['counts']}))


if __name__=='__main__':
    main()
