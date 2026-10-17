#!/usr/bin/env python3
"""Enumerate source-only ordered adjacent-wall hypotheses; no camera fitting.

Image regions and descriptor roles are retained from the preceding audit.
Every eligible wall pair in each separated source shed component is emitted.
No camera residual is read, and no best source label is selected.
"""
from pathlib import Path
import hashlib, json, math

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/research-evidence/2026-10-02'
OUT = BASE / 'interior-coupled-wall-hypotheses'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    audit_path = BASE / 'woodland-11s-interior-semantic-audit.json'
    audit = json.loads(audit_path.read_text())
    match_path = ROOT / 'docs/research-evidence/2026-10-01/woodland-11s-shed-texture-ambiguity.json'
    planes_path = ROOT / 'docs/research-evidence/2026-10-01/woodland-11s-shed-training-homographies.json'
    matches = json.loads(match_path.read_text())
    planes = json.loads(planes_path.read_text())['sourcePlanes']
    back = next(r for r in audit['regions'] if r['name'] == 'visible-back-wall')
    left = next(r for r in audit['regions'] if r['name'] == 'visible-left-wall')
    OUT.mkdir(parents=True,exist_ok=True)
    candidates = []
    for component, members in [('A',[8,12,25]), ('B',[10,14,26])]:
        for back_plane in members:
            for left_plane in members:
                dot = sum(a*b for a,b in zip(planes[back_plane]['normal'],planes[left_plane]['normal']))
                if abs(dot) >= .02:
                    continue
                label = f'component-{component}-back-{back_plane}-left-{left_plane}'
                landmarks, unresolved = [], []
                for region, plane in [(back,back_plane),(left,left_plane)]:
                    faces = set(planes[plane]['faces'])
                    for i in region['descriptorMatchIndices']:
                        match = matches['descriptorMatches'][i]
                        points = [c for c in match['sourceCandidates'] if c['face'] in faces]
                        if len(points) != 1:
                            unresolved.append({'matchIndex': i, 'compatibleFaceCount': len(points), 'region':region['name']})
                            continue
                        point = points[0]
                        landmarks.append({'id':f'{label}-match-{i}','node':'woodenshed','part':0,'face':point['face'],'barycentric':point['barycentric'],'pixel':match['pixel'],'role':match['role'],'uncertaintyPixels':2,'descriptorMatchIndex':i,'semanticRegion':region['name'],'hypothesisPlaneId':plane,'atlasPixel':match['atlasPixel']})
                data = {'scene':matches['scene'],'sceneSha256':matches['sceneSha256'],'reference':matches['reference'],'referenceSha256':matches['referenceSha256'],'imageSize':matches['imageSize'],'scale':matches['scale'],'verticalFovDegrees':50,'landmarks':landmarks,'hypothesis': {'id':label,'component':component,'backPlane':back_plane,'leftPlane':left_plane,'normalDotProduct':dot,'sourceOnlyWallPairSelection':True},'inputs':{'semanticAudit':str(audit_path.relative_to(ROOT)),'semanticAuditSha256':sha(audit_path),'matches':str(match_path.relative_to(ROOT)),'matchesSha256':sha(match_path),'planes':str(planes_path.relative_to(ROOT)),'planesSha256':sha(planes_path)},'unresolvedAssignments':unresolved,'limits':['All source-only ordered perpendicular pairs retained; no camera residual selects a plane.', 'Retrospective semantic regions are exploratory, not fresh blind validation.', 'Original source-atlas coordinate roles retained; heldout points must be excluded from fit/initialization/solution selection.', 'A hypothesis is not accepted without heldout multiwall agreement and independent eye support/occlusion/component identity.', 'No original runtime, renderer or camera fit executes in this preparation script.']}
                path = OUT / (label + '.json')
                path.write_text(json.dumps(data,indent=2)+'\n')
                candidates.append({'id':label,'path':str(path.relative_to(ROOT)),'sha256':sha(path),'training':sum(x['role']=='fit' for x in landmarks),'heldout':sum(x['role']=='heldout' for x in landmarks),'unresolvedAssignments':len(unresolved),'normalDotProduct':dot})
    manifest = {'generator':str(Path(__file__).relative_to(ROOT)),'generatorSha256':sha(Path(__file__)),'originalRuntimeExecuted':False,'cameraFitAttempted':False,'candidates':candidates,'sourceComponentGrouping':'Separated local position clusters: A around(-1200,8850,900), B around(0,0,100); all three candidate inner walls retained per component.','normalPerpendicularityLimit':.02,'hypothesisSelection':'All ordered pairs satisfying source normal dot bound; never rank or discard with camera residual.'}
    (OUT / 'hypotheses.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))


if __name__ == '__main__':
    main()
