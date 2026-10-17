"""Deterministically package statically recovered maps; never executes game code.

Inputs: validated raw geometry, original IFX metadata with part shader bindings,
original cast-media inventory and byte-exact decoded RGBA PNGs. Output leaves
source units, local coordinates, normals, UVs and matrices unchanged. Director
script overrides are explicit data, not a choice of Three presentation scale.
Run from the repository root; Pillow is used to inventory alpha only.
"""
from pathlib import Path
import argparse, copy, hashlib, json, math, shutil, struct
from PIL import Image

LIMIT = 64 * 1024 * 1024

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def read_json(path):
    if path.stat().st_size > LIMIT:
        raise ValueError(f'oversized input {path}')
    return json.loads(path.read_text())

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n')

def package(root, evidence, edition, level):
    geometry_path = evidence / 'w3d-decoded' / f'{edition}-{level}' / 'geometry.json'
    validation_path = geometry_path.with_name('validation.json')
    metadata_path = evidence / 'w3d-metadata' / f'{edition}-{level}.json'
    media_dir = evidence / 'director-extraction' / edition
    media_path = media_dir / 'cast-media-index.json'
    script_dir = evidence / 'director-script-extraction' / edition / 'casts/parents'
    explore_path = script_dir / 'BehaviorScript 32 - explore.ls'
    physics_path = script_dir / 'ParentScript 21 - worldphysics.ls'
    generics_path = script_dir / 'MovieScript 1 - generics.ls'
    geometry = read_json(geometry_path)
    validation = read_json(validation_path)
    metadata = read_json(metadata_path)
    media = read_json(media_path)
    if validation['validation_failures'] or validation['parse_errors'] or metadata['errors']:
        raise ValueError(f'{edition}: source validation errors')
    explore = explore_path.read_text()
    floor_texture = 'floortop' if edition == 'barrack' else 'floortop2'
    if f'shady("{floor_texture}")' not in explore or 'flsha.textureTransformList[2].scale = vector(0.005, 0.005, 0.005)' not in explore:
        raise ValueError('floor source override changed; audit required')
    resources = {r['name'].casefold(): r for r in metadata['model_resources']}
    textures_by_name = {p['name'].casefold(): p for p in media['rgba_media']}
    out = root / 'public/assets/original-scenes' / edition
    out.mkdir(parents=True, exist_ok=True)
    texture_names = {'sky', 'noise', floor_texture}
    meshes = []
    for original in sorted(geometry['meshes'], key=lambda m: (m['resource'], m['part'])):
        mesh = copy.deepcopy(original)
        resource = resources[mesh['resource'].casefold()]
        # Resource-named style carries stored part bindings; 'default' does not.
        bindings = [b for b in resource['shader_bindings'] if b['name'].casefold().strip() == resource['name'].casefold().strip()]
        if len(bindings) != 1 or len(bindings[0]['mesh_bindings']) != len(resource['meshes']):
            raise ValueError(f'unresolved binding {edition}:{resource["name"]}')
        source_shader = bindings[0]['mesh_bindings'][mesh['part']]
        shader = source_shader
        if mesh['resource'].casefold() == 'floor' and (edition == 'barrack' or mesh['part'] == 0):
            shader = floor_texture
        mesh.update(sourceShader=source_shader, shader=shader)
        texture_names.add(shader)
        if len(mesh['positions']) != len(mesh['normals']):
            raise ValueError('position/normal count mismatch')
        if any(not math.isfinite(v) for row in mesh['positions'] + mesh['normals'] for v in row):
            raise ValueError('nonfinite source geometry')
        if any(index < 0 or index >= len(mesh['positions']) for face in mesh['faces'] for index in face):
            raise ValueError('out of range triangle')
        meshes.append(mesh)
    source_shaders = {s['name']: copy.deepcopy(s) for s in geometry['shaders']}
    shaders = []
    for name in sorted(texture_names):
        if name.casefold() not in textures_by_name:
            raise ValueError(f'unresolved original cast texture {edition}:{name}')
        shader = source_shaders.get(name, {'name': name, 'material': name, 'texture_layers': []})
        shader['sourceTextureLayers'] = copy.deepcopy(shader['texture_layers'])
        is_floor = name == floor_texture
        layer = copy.deepcopy(shader['texture_layers'][0]) if shader['texture_layers'] else {}
        layer.update(name=name, textureName=name, textureMode='wrapPlanar' if is_floor else 'meshUV', textureScale=[0.1, 1.01, 1.01] if name == 'sky' else [1, 1, 1])
        shader['texture_layers'] = [layer]
        if is_floor:
            shader['texture_layers'].append({'name': 'noise', 'textureName': 'noise', 'textureMode': 'wrapPlanar', 'textureScale': [0.005, 0.005, 0.005]})
        shader.update(runtimeEmissiveRgb=[255, 255, 255], runtimeSpecularRgb=[0, 0, 0] if name in [floor_texture, 'sky'] else None)
        shaders.append(shader)
    textures = {}
    texture_provenance = []
    for name in sorted(texture_names):
        entry = textures_by_name[name.casefold()]
        source = media_dir / entry['file']
        if source.stat().st_size > LIMIT:
            raise ValueError('oversized texture')
        relative = f'textures/{name}.png'
        destination = out / relative
        destination.parent.mkdir(exist_ok=True)
        shutil.copyfile(source, destination)
        image = Image.open(destination)
        image.load()
        if image.mode != 'RGBA' or image.size != tuple(entry['size']):
            raise ValueError('invalid original texture preview')
        digest = sha(source)
        if sha(destination) != digest:
            raise ValueError('texture copy hash mismatch')
        textures[name] = {'url': f'/assets/original-scenes/{edition}/{relative}', 'sha256': digest, 'width': image.width, 'height': image.height, 'hasAlpha': image.getchannel('A').getextrema()[0] < 255}
        texture_provenance.append({'name': name, 'file': relative, 'source': str(source.relative_to(root)), 'sha256': digest, 'castId': entry['cast_id'], 'colorResourceId': entry['color_resource'], 'alphaResourceId': entry['alpha_resource'], 'transformation': 'byte-exact copy of statically decoded RGBA PNG'})
    double_sided = ['outerfencing'] if edition == 'barrack' else ['syccamore', 'spindlybirchleaves', 'rowanbranch', 'othertrees', 'birch', 'outerfencing']
    floor = resources['floor']
    floor_shaders = [m['shader'] for m in meshes if m['resource'].casefold() == 'floor']
    runtime = {
        'doubleSidedModels': double_sided,
        'reparent': {name: 'smokes' for name in double_sided},
        'createdGroups': ['smokes'],
        'deleteFirstStoredLight': True,
        'floor': {'resource': 'floor', 'shaderParts': floor_shaders, 'planar': True, 'noiseTexture': 'noise', 'noiseScale': [0.005, 0.005, 0.005]},
        'sky': {'texture': 'sky', 'radius': floor['bounding_sphere'][3] * 0.95, 'sourceFloorBoundingSphere': floor['bounding_sphere'], 'height': 2000, 'position': [0, 0, 1000], 'rotationDegrees': [90, 0, 0], 'caps': False, 'visibility': 'back', 'textureScale': [0.1, 1.01, 1.01], 'nearFiltering': False, 'quality': 'low', 'renderFormat': 'rgba8888', 'backgroundRgb': list(Image.open(out / 'textures/sky.png').getpixel((0, 0)))[:3]},
        'physics': {'excludedNameContains': ['door', 'baddy', 'barrel'], 'gravity': [0, 0, -400], 'sourceOnly': True, 'exclusionMeaning': 'Excluded from worldphysics.setupmodels fixed bodies; separate actor scripts may create movable bodies.'},
        'adaptationLimits': ['No scale selected.', 'Raw CLOD UVs preserved; texture coordinate convention must be applied by rendering adapter.', 'Director wrapPlanar projection and second-layer blend require a verified adapter; texture scales are source values.', 'No inferred culling or alpha cutoff threshold. Double-sided list is explicit source visibility override.', 'No collision simplification or gameplay changes.'],
    }
    scene = {'edition': edition, 'coordinateSystem': 'original-z-up', 'nodes': geometry['nodes'], 'meshes': meshes, 'shaders': shaders, 'materials': geometry['materials'], 'textures': textures, 'runtime': runtime}
    write_json(out / 'scene.json', scene)
    inputs = [geometry_path, validation_path, metadata_path, media_path, explore_path, physics_path, generics_path]
    source_movie = evidence / 'payload-variants' / ('russiasarmy-barrack-20110415.dcr' if edition == 'barrack' else 'russiasarmy-woodland-20150618.dcr')
    inputs.append(source_movie)
    provenance = {'schemaVersion': 1, 'edition': edition, 'gameExecuted': False, 'sourceUnitsPreserved': True, 'packager': 'scripts/research/package-original-scenes.py', 'packagerSha256': sha(Path(__file__)), 'inputs': [{'path': str(p.relative_to(root)), 'sha256': sha(p)} for p in inputs], 'textures': texture_provenance, 'outputs': [{'path': 'scene.json', 'sha256': sha(out / 'scene.json')}], 'validation': {'meshParts': len(meshes), 'nodes': len(geometry['nodes']), 'textures': len(textures), 'sourceGeometryPreserved': all({k: m[k] for k in original} == original for m, original in zip(meshes, sorted(geometry['meshes'], key=lambda m: (m['resource'], m['part'])))), 'unresolvedTextureNames': [], 'partBindingsComplete': True, 'allTextureCopiesByteExact': True}}
    write_json(out / 'provenance.json', provenance)
    print(json.dumps({'edition': edition, **provenance['validation']}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--evidence', type=Path, default=Path('docs/research-evidence/2026-09-30'))
    args = parser.parse_args()
    root = args.root.resolve()
    evidence = (root / args.evidence).resolve()
    for edition, level in [('barrack', 'level1'), ('woodland', 'level2')]:
        package(root, evidence, edition, level)
