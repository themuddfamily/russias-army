#!/usr/bin/env python3
"""Package publisher weapon assets after verifying both decoded builds agree.

No model simplification, normal regeneration, atlas resampling or UV conversion
occurs here. Geometry UV conversion and unit scaling happen at runtime.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
TEXTURES = {'ak47':'01911','spas12':'02127','rg6':'02326','rpg':'01856','pistol':'03767','dragunov':'04127','mfmachinegun':'02161'}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()

def normalized(value):
    return {**value,'meshes':sorted(value['meshes'],key=lambda mesh:(mesh['resource'],mesh['part']))}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--decoded-root',type=Path,default=Path('/tmp/ra-w3d-decoded'))
    parser.add_argument('--output',type=Path,default=ROOT/'public/assets/original-weapons')
    args=parser.parse_args()
    evidence=ROOT/'docs/research-evidence/2026-09-30/director-extraction'
    builds={edition:args.decoded_root/f'{edition}-gunz/geometry.json' for edition in ('barrack','woodland')}
    decoded={edition:normalized(json.loads(path.read_text())) for edition,path in builds.items()}
    if decoded['barrack']!=decoded['woodland']:
        raise ValueError('Weapon resources differ between publisher builds; do not package as shared assets.')
    args.output.mkdir(parents=True,exist_ok=True)
    payload=canonical(decoded['woodland'])
    (args.output/'geometry.json').write_bytes(payload+b'\n')
    manifest={'sourceBuilds':{'barrack':'2011-04-15','woodland':'2015-06-18'},
      'sourceGeometry':{edition:{'decodedPath':str(path),'sha256':sha(path),'canonicalSha256':hashlib.sha256(canonical(decoded[edition])).hexdigest()} for edition,path in builds.items()},
      'equality':'All geometry data agree after sorting meshes by resource and part; all seven decoded PNGs are byte-identical.',
      'unitScale':1.72/85,'uvConversion':{'u':'rawU + 0.5','v':'0.5 - rawV','textureFlipY':False},
      'runtimeShader':'MeshBasicMaterial approximation of runtime white emissive, black specular standard shader',
      'projection':'source vertical FOV50 per Adobe Using Director 11.5 printed p374; sprite aspect/crop and clipping remain comparison questions',
      'geometry':{'file':'geometry.json','sha256':sha(args.output/'geometry.json')},'textures':{},
      'resources':{m['resource']:{'vertices':len(m['positions']),'triangles':len(m['faces'])} for m in decoded['woodland']['meshes']}}
    for name,member in TEXTURES.items():
        source={edition:evidence/edition/'media'/f'{member}-{name}-rgba.png' for edition in builds}
        if source['barrack'].read_bytes()!=source['woodland'].read_bytes():
            raise ValueError(f'{name} decoded texture bytes differ between builds')
        target=args.output/f'{name}.png';shutil.copyfile(source['woodland'],target)
        manifest['textures'][name]={'file':target.name,'sha256':sha(target),
          'source':{edition:{'path':str(path.relative_to(ROOT)),'sha256':sha(path)} for edition,path in source.items()}}
    (args.output/'provenance.json').write_bytes(canonical(manifest)+b'\n')
    print(f"Packaged {len(manifest['resources'])} original mesh resources and {len(TEXTURES)} textures; both builds verified equal.")

if __name__=='__main__':main()
