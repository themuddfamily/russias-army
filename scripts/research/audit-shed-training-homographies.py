#!/usr/bin/env python3
"""Group shed descriptor matches by training-only image homographies.

This audit never reads a prior camera or chooses a source plane by camera fit.
Held-out samples never enter model fitting, extraction or candidate selection.
"""
import argparse, base64, hashlib, json
from pathlib import Path
import cv2
import numpy as np

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def project(h, points):
    q=np.c_[points,np.ones(len(points))]@h.T
    return q[:,:2]/q[:,2,None]

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--input',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--candidate-output',type=Path)
    args=ap.parse_args();data=json.loads(args.input.read_text())
    scene_path=Path(data['scene'])
    assert sha(scene_path)==data['sceneSha256']
    assert sha(data['reference'])==data['referenceSha256']
    assert sha(data['atlas'])==data['atlasSha256']
    scene=json.loads(scene_path.read_text());mesh=next(m for m in scene['meshes'] if m['resource']=='woodenshed' and m['part']==0)
    p=np.array(mesh['positions']);planes=[];face_plane={}
    # Source positions are single-precision decoded data; 0.02 source units
    # tolerates numerical noise while preserving the approximately 4-unit walls.
    for i,face in enumerate(mesh['faces']):
        t=p[face];n=np.cross(t[1]-t[0],t[2]-t[0]);size=np.linalg.norm(n)
        if size<1e-8:continue
        n/=size
        if n[np.argmax(abs(n))]<0:n=-n
        offset=float(n@t[0]);index=next((j for j,x in enumerate(planes) if np.linalg.norm(n-np.array(x['normal']))<1e-5 and abs(offset-x['offset'])<.02),None)
        if index is None:index=len(planes);planes.append({'normal':n.tolist(),'offset':offset,'faces':[]})
        planes[index]['faces'].append(i);face_plane[i]=index
    matches=data['descriptorMatches'];training=[i for i,m in enumerate(matches) if m['role']=='fit'];heldout=[i for i,m in enumerate(matches) if m['role']=='heldout']
    remaining=list(training);groups=[];threshold=2.;minimum=12
    cv2.setNumThreads(1);cv2.setRNGSeed(1701)
    for group_index in range(4):
        if len(remaining)<minimum:break
        atlas=np.array([matches[i]['atlasPixel'] for i in remaining]);pixels=np.array([matches[i]['pixel'] for i in remaining])
        h,mask=cv2.findHomography(atlas,pixels,cv2.RANSAC,threshold,maxIters=10000,confidence=.999)
        if h is None:break
        members=[i for i,ok in zip(remaining,mask[:,0]) if ok]
        if len(members)<minimum:break
        # Refit with training inliers alone; membership stays the RANSAC result.
        h,_=cv2.findHomography(np.array([matches[i]['atlasPixel'] for i in members]),np.array([matches[i]['pixel'] for i in members]),0)
        candidate_sets=[{face_plane[x['face']] for x in matches[i]['sourceCandidates'] if x['face'] in face_plane} for i in members]
        compatible=set.intersection(*candidate_sets)
        def errors(ids):
            predicted=project(h,np.array([matches[i]['atlasPixel'] for i in ids]));actual=np.array([matches[i]['pixel'] for i in ids])
            return [{'matchIndex':i,'errorPixels':float(e),'withinFixedTwoPixelThreshold':bool(e<=threshold)} for i,e in zip(ids,np.linalg.norm(predicted-actual,axis=1))]
        hold_errors=errors(heldout)
        groups.append({'group':group_index,'homographyAtlasToReference':h.tolist(),'trainingMatchIndices':members,'trainingErrors':errors(members),'compatibleSourcePlaneIds':sorted(compatible),'heldoutErrors':hold_errors,'heldoutWithinThreshold':sum(x['withinFixedTwoPixelThreshold'] for x in hold_errors),'uniqueSourcePlaneAssignment':len(compatible)==1})
        remaining=[i for i in remaining if i not in members]
    out={'input':str(args.input),'inputSha256':sha(args.input),'generator':'scripts/research/audit-shed-training-homographies.py','generatorSha256':sha(__file__),'scene':str(scene_path),'sceneSha256':sha(scene_path),'groups':groups,'sourcePlanes':planes,'unassignedTrainingMatchIndices':remaining,'counts':{'trainingMatches':len(training),'heldoutMatches':len(heldout),'trainingHomographyGroups':len(groups),'uniqueSourcePlaneAssignments':sum(x['uniqueSourcePlaneAssignment'] for x in groups)},'method':{'opencvVersion':cv2.__version__,'randomSeed':1701,'trainingOnlyRansacThresholdPixels':threshold,'minimumTrainingGroupSize':minimum,'maximumGroups':4,'maxRansacIterations':10000,'ransacConfidence':.999,'planeNormalTolerance':1e-5,'planeOffsetToleranceSourceUnits':.02,'sourcePlaneSelection':'Intersection of containing-face source planes across training group, without camera','heldoutUse':'Validation only; no group membership or source-plane selection'},'landmarks':[],'limitations':['A single homography group is only a possible plane, since false descriptor matches and repeated atlas patterns can form groups.','Plane intersections do not test perspective orientation, occlusion, room identity or a jointly consistent camera.','Held-out errors are reported for all groups, including failures; no group is selected with held-out errors.','No camera, original runtime, browser or GPU was read or executed.','No landmark is accepted until independent source-plane identity is established.']}
    if args.candidate_output:
        if len(groups)!=1 or not groups[0]['uniqueSourcePlaneAssignment']:
            raise ValueError('Candidate output requires exactly one uniquely assigned training group')
        group=groups[0];plane_id=group['compatibleSourcePlaneIds'][0];faces=set(planes[plane_id]['faces']);landmarks=[]
        for i in group['trainingMatchIndices']+heldout:
            match=matches[i];candidates=[x for x in match['sourceCandidates'] if x['face'] in faces]
            if len(candidates)!=1:continue
            candidate=candidates[0]
            landmarks.append({'id':f'shed-training-plane-candidate-{i}','node':'woodenshed','part':0,'face':candidate['face'],'barycentric':candidate['barycentric'],'pixel':match['pixel'],'role':match['role'],'uncertaintyPixels':2,'descriptorMatchIndex':i})
        candidate_data={'scene':data['scene'],'sceneSha256':data['sceneSha256'],'reference':data['reference'],'referenceSha256':data['referenceSha256'],'imageSize':data['imageSize'],'scale':data['scale'],'verticalFovDegrees':50,'landmarks':landmarks,'status':'Unvalidated training-only plane-assignment hypothesis; all plane-compatible heldouts retained without residual filtering','method':out['method'],'limitations':out['limitations'],'audit':str(args.output),'generatorSha256':sha(__file__)}
        args.candidate_output.write_text(json.dumps(candidate_data,indent=2)+'\n')
        out['candidateOutput']=str(args.candidate_output);out['candidateOutputSha256']=sha(args.candidate_output)
        out['candidateCounts']={role:sum(x['role']==role for x in landmarks)for role in ('fit','heldout')}
    args.output.write_text(json.dumps(out,indent=2)+'\n')
    # Embedded reference image and all heldout marks keep failed matches visible.
    colors=['#00ddff','#ee66ff','#66ff66','#ffbb00'];marks=[]
    for group in groups:
        color=colors[group['group']]
        for i in group['trainingMatchIndices']:
            x,y=matches[i]['pixel'];marks.append(f'<circle cx="{x}" cy="{y}" r="3" fill="none" stroke="{color}"/>')
    for i in heldout:
        x,y=matches[i]['pixel'];marks.append(f'<path d="M{x-3},{y-3}L{x+3},{y+3}M{x-3},{y+3}L{x+3},{y-3}" stroke="#ff9900"/>')
    width,height=data['imageSize'];encoded=base64.b64encode(Path(data['reference']).read_bytes()).decode()
    args.output.with_suffix('.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}"><image href="data:image/jpeg;base64,{encoded}" width="{width}" height="{height}"/>{"".join(marks)}</svg>\n')
    print(json.dumps({'counts':out['counts'],'groups':[{'group':x['group'],'training':len(x['trainingMatchIndices']),'compatiblePlanes':x['compatibleSourcePlaneIds'],'heldoutWithin2px':x['heldoutWithinThreshold']}for x in groups]}))
if __name__=='__main__': main()
