#!/usr/bin/env python3
"""Passive bright-window centroid check; never reads a camera or pose.

Regions are visual annotations of the same distinctive roof window, not pose
predictions. Threshold160 and sensitivity thresholds are fixed in this script.
Centroid projection is only approximate under a projective transformation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import cv2
import numpy as np


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def component(image, roi, threshold):
    x0,y0,x1,y1=roi
    crop=image[y0:y1,x0:x1]
    count,labels,stats,centroids=cv2.connectedComponentsWithStats((crop>=threshold).astype('uint8'), connectivity=8)
    if count<2:
        raise ValueError('No bright connected component')
    index=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]))
    x,y,w,h,area=stats[index]
    return {'centroid':[float(centroids[index,0]+x0),float(centroids[index,1]+y0)],
        'bounds':[int(x+x0),int(y+y0),int(w),int(h)],'pixelCount':int(area),
        'otherComponentPixelCounts':sorted([int(stats[i,cv2.CC_STAT_AREA])for i in range(1,count)if i!=index],reverse=True),
        'touchesRoiBorder':bool(x==0 or y==0 or x+w==x1-x0 or y+h==y1-y0)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference',type=Path)
    parser.add_argument('--second',type=int,choices=[15,16],required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    cv2.setNumThreads(1)
    scene_path=Path('public/assets/original-scenes/woodland/scene.json')
    atlas_path=Path('public/assets/original-scenes/woodland/textures/stonebarn.png')
    atlas=cv2.imread(str(atlas_path),0);reference=cv2.imread(str(args.reference),0)
    atlas_roi=[65,385,105,425]
    reference_roi={15:[650,170,750,230],16:[560,110,680,175]}[args.second]
    source_component=component(atlas,atlas_roi,160)
    target_component=component(reference,reference_roi,160)
    if source_component['touchesRoiBorder'] or target_component['touchesRoiBorder']:
        raise ValueError('Selected bright component intersects annotation border')
    scene=json.loads(scene_path.read_text())
    mesh=next(m for m in scene['meshes']if m['resource']=='stonebarn' and m['part']==0)
    uv=np.array(mesh['tex_coords'][0]);uv=np.column_stack((uv[:,0]+.5,.5-uv[:,1]))*512-.5
    q=np.array(source_component['centroid']);hits=[]
    for index,face in enumerate(mesh['faces']):
        t=uv[face];matrix=np.column_stack((t[1]-t[0],t[2]-t[0]))
        if abs(np.linalg.det(matrix))<1e-8:
            continue
        b=np.linalg.solve(matrix,q-t[0]);weights=np.r_[1-sum(b),b]
        if min(weights)>=-1e-8:
            hits.append((index,weights))
    if len(hits)!=1:
        raise ValueError(f'Window centroid is not globally UV-unique: {[x[0]for x in hits]}')
    index,weights=hits[0]
    landmark={'id':'roof-window-bright-component-centroid-threshold160',
        'node':'stonebarn','part':0,'face':index,'barycentric':weights.tolist(),
        'atlasPixel':source_component['centroid'],'pixel':target_component['centroid'],
        'role':'heldout','uncertaintyPixels':2,
        'sourceLocalPoint':(weights@np.array(mesh['positions'])[mesh['faces'][index]]).tolist()}
    sensitivity=[]
    for threshold in [100,128,160,192]:
        sensitivity.append({'threshold':threshold,'source':component(atlas,atlas_roi,threshold),
            'reference':component(reference,reference_roi,threshold)})
    data={'scene':str(scene_path),'sceneSha256':digest(scene_path),
        'reference':str(args.reference),'referenceSha256':digest(args.reference),
        'atlas':str(atlas_path),'atlasSha256':digest(atlas_path),
        'generator':'scripts/research/measure-reference-roof-window.py','generatorSha256':digest(__file__),
        'imageSize':[reference.shape[1],reference.shape[0]],'scale':1.72/85,'verticalFovDegrees':50,
        'landmarks':[landmark], 'sourceComponent':source_component,'referenceComponent':target_component,
        'sensitivityMeasurements':sensitivity,
        'method':{'grayConversion':'cv2.imread IMREAD_GRAYSCALE','threshold':160,
            'connectivity':8,'selection':'Largest connected component inside visually annotated window ROI',
            'atlasRoi':atlas_roi,'referenceRoi':reference_roi,
            'uvPixelConvention':'(u+.5,.5-v)*512-.5',
            'faceSelection':'Exactly one containing source UV triangle over entire mesh',
            'roleRule':'Heldout only; no pose fitting or candidate selection'},
        'limitations':['Projective transformation does not exactly preserve area centroid.',
            'Brightness threshold interacts with JPEG compression, interpolation, and exposure.',
            'Reference ROIs identify the distinctive white window visually, independently of any camera projection.',
            'Two pixel allowance is fixed before projection evaluation; sensitivity thresholds do not select a preferred fit.',
            'This alternative measurement does not replace or invalidate the separate failed roof SIFT check.',
            'A single small roof feature cannot prove full camera equivalence.']}
    args.output.write_text(json.dumps(data,indent=2)+'\n')
    svg=args.output.with_suffix('.svg');href=os.path.relpath(args.reference,svg.parent)
    x,y=target_component['centroid'];bx,by,bw,bh=target_component['bounds']
    svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{reference.shape[1]}" height="{reference.shape[0]}"><image href="{href}" width="100%" height="100%"/><rect x="{bx-.5}" y="{by-.5}" width="{bw}" height="{bh}" stroke="#ff00ff" fill="none"/><circle cx="{x}" cy="{y}" r="3" stroke="#00ffff" fill="none"/></svg>\n')
    print(json.dumps({'output':str(args.output),'landmark':landmark,'sensitivityMeasurements':sensitivity}))


if __name__=='__main__':
    main()
