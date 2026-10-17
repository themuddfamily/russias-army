#!/usr/bin/env python3
"""Preserve exact decoded GI attributes, bone records, motion keys and texture."""
import hashlib,json
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'docs/research-evidence/2026-09-30'
OUT=ROOT/'public/assets/original-soldier'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def canonical(data):return json.dumps(data,sort_keys=True,separators=(',',':')).encode()
def main():
 OUT.mkdir(parents=True,exist_ok=True);provenance={'sourceBuilds':{'barrack':'2011-04-15','woodland':'2015-06-18'},'sourceGeometry':{},'sourceRigMotion':{},'files':{},'textureSources':{}}
 for file,record in [('geometry.json','sourceGeometry'),('rig-motion.json','sourceRigMotion')]:
  sources={edition:BASE/'w3d-rig-audit'/f'{edition}-baddy'/file for edition in ('barrack','woodland')}
  data={edition:json.loads(path.read_text()) for edition,path in sources.items()}
  if data['barrack']!=data['woodland']:raise ValueError(f'Original GI differs between editions: {file}')
  payload=canonical(data['woodland']);(OUT/file).write_bytes(payload+b'\n');provenance['files'][file]={'sha256':digest(OUT/file),'canonicalSha256':hashlib.sha256(payload).hexdigest()}
  for edition,path in sources.items():provenance[record][edition]={'path':str(path.relative_to(ROOT)),'sha256':digest(path),'canonicalSha256':hashlib.sha256(canonical(data[edition])).hexdigest()}
 textures={edition:BASE/'director-extraction'/edition/'media/02328-GI-rgba.png' for edition in ('barrack','woodland')}
 if textures['barrack'].read_bytes()!=textures['woodland'].read_bytes():raise ValueError('Decoded GI textures differ')
 shutil.copyfile(textures['woodland'],OUT/'GI.png');provenance['files']['GI.png']={'sha256':digest(OUT/'GI.png')}
 for edition,path in textures.items():provenance['textureSources'][edition]={'path':str(path.relative_to(ROOT)),'sha256':digest(path)}
 provenance.update({'editionEquality':'Decoded geometry and rig-motion data equal; decoded GI texture byte-identical.','sourceModelScale':.045,'worldScale':1.72/85,'actorOrigin':'Copy feet root +55 source units upward; source editor node transform is overwritten by baddies script.', 'bindConvention':'Parent length along local X plus bone displacement; original quaternion; inverse bind derived from this exact hierarchy.', 'animation':'Preserved source key positions/quaternions/scales; linear position/scale and shortest-path quaternion slerp WebGL adaptation.', 'animationCounter':'Locomotion source per-frame position delta*10; shoot assigns2000 then strict single subtract1000 when greater; death2400+8ms per nominal30Hz frame, hide only afterbon>600 (bon608/time3008 at30Hz); eye-origin85source, verticalsink-bsp*bon/300; adapter slow frames split at30Hz and stalls bounded1s.', 'deathRadiusAdapter':1726.8026123046875*.045*.75*(1.72/85),'limits':['Bounding-sphere1726.8026123046875 is a resource-radius adapter, not a Director runtime query.','Original old-format optional bone fields and skin quantizer interpretation retain the documented static-parser limits.','Key interpolation and standard-shader appearance are WebGL adaptations; native Director renderer equivalence is unproven.'],'heldGun':'Previous-frame bone index22 world position+rotation only (scale discarded); self rotate0,170,10 ZYX then self translate0,-3,0.'})
 (OUT/'provenance.json').write_bytes(canonical(provenance)+b'\n');print('Packaged GI geometry,25-bone rig/motion and lossless texture; both builds verified equal.')
if __name__=='__main__':main()
