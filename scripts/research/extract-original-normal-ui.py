#!/usr/bin/env python3
"""Recover bounded UI frame-two vectors; never interpret or execute SWF actions."""
from pathlib import Path
import hashlib
import importlib.util
import json
import struct

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/research-evidence/2026-09-30/director-extraction'
OUT = ROOT / 'public/assets/original-normal-ui'
spec = importlib.util.spec_from_file_location('scope_decoder', ROOT / 'scripts/research/extract-original-scope.py')
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)
Bits, tags = scope.Bits, scope.tags
sha = lambda data: hashlib.sha256(data).hexdigest()
LAYERS = {'backing': (1, 6), 'emblem': (2, 7), 'crosshair': (5, 11), 'border': (40, 5)}


def display_list(records, target):
    display, frame = {}, 1
    for tag, body in records:
        if tag == 26:
            flags = body[0]
            # Only static placement fields used in these two frames are accepted.
            if flags not in (6, 22):
                raise ValueError(f'Unsupported frame{frame} placement flags {flags}')
            depth, character = struct.unpack_from('<HH', body, 1)
            bits = Bits(body, 5)
            matrix = bits.matrix()
            ratio = struct.unpack_from('<H', body, bits.pos)[0] if flags & 16 else None
            if bits.pos + (2 if flags & 16 else 0) != len(body):
                raise ValueError('Trailing placement bytes')
            display[depth] = {'characterId': character, 'matrix': matrix, 'ratio': ratio}
        elif tag == 28:
            if len(body) != 2:
                raise ValueError('Invalid RemoveObject2')
            display.pop(struct.unpack_from('<H', body)[0], None)
        elif tag == 1:
            if frame == target:
                return display
            frame += 1
    raise ValueError('Requested display frame missing')


def decode_font(body):
    character = struct.unpack_from('<H', body)[0]
    flags, language, name_length = body[2:5]
    if flags & (128 | 8 | 4):
        raise ValueError('Unexpected font layout/wide offsets/wide codes')
    name = body[5:5 + name_length].decode('utf-8')
    pos = 5 + name_length
    count = struct.unpack_from('<H', body, pos)[0]
    pos += 2
    offsets = list(struct.unpack_from('<' + 'H' * (count + 1), body, pos))
    if count > 128 or offsets[0] != 2 * (count + 1) or offsets != sorted(offsets):
        raise ValueError('Invalid bounded font offsets')
    codes = list(body[pos + offsets[-1]:])
    if len(codes) != count:
        raise ValueError('Font code count mismatch')
    glyphs = []
    for i in range(count):
        raw = body[pos + offsets[i]:pos + offsets[i + 1]]
        # Font glyph SHAPE has no style array. Add a synthetic black fill solely
        # to reuse the existing exact edge decoder; all glyph edges stay intact.
        synthetic = struct.pack('<H', i) + b'\x08\x00' + b'\x01\x00\x00\x00\x00\x00' + raw
        shape = scope.decode_shape(2, synthetic)
        glyphs.append({'index': i, 'codepoint': codes[i], 'paths': shape['fills'][0]['paths'], 'edges': shape['edges'], 'curves': shape['curves'], 'shapeSha256': sha(raw)})
    return {'characterId': character, 'name': name, 'flags': flags, 'language': language, 'bodySha256': sha(body), 'glyphs': glyphs}


def decode_text(body, font):
    bits = Bits(body, 2)
    bounds, matrix = bits.rect(), bits.matrix()
    pos = bits.pos
    glyph_bits, advance_bits = body[pos:pos + 2]
    pos += 2
    runs, x, y, height, color, font_id = [], 0, 0, None, None, None
    while body[pos]:
        flags = body[pos]
        pos += 1
        if flags & 0x70 or not flags & 0x80:
            raise ValueError('Unexpected DefineText flags')
        if flags & 8:
            font_id = struct.unpack_from('<H', body, pos)[0]
            pos += 2
        if flags & 4:
            color = list(body[pos:pos + 3])
            pos += 3
        if flags & 1:
            x = struct.unpack_from('<h', body, pos)[0]
            pos += 2
        if flags & 2:
            y = struct.unpack_from('<h', body, pos)[0]
            pos += 2
        if flags & 8:
            height = struct.unpack_from('<H', body, pos)[0]
            pos += 2
        count = body[pos]
        pos += 1
        bits = Bits(body, pos)
        glyphs = []
        for _ in range(count):
            index, advance = bits.u(glyph_bits), bits.s(advance_bits)
            if index >= len(font['glyphs']) or font_id != font['characterId'] or height is None or color is None:
                raise ValueError('Invalid caption glyph reference')
            glyphs.append({'index': index, 'advanceTwips': advance, 'xTwips': x, 'yTwips': y})
            x += advance
        bits.align()
        pos = bits.pos
        runs.append({'fontId': font_id, 'heightTwips': height, 'rgb': color, 'glyphs': glyphs})
    if pos + 1 != len(body):
        raise ValueError('Trailing DefineText data')
    caption = ''.join(chr(font['glyphs'][g['index']]['codepoint']) for run in runs for g in run['glyphs'])
    return {'characterId': 9, 'boundsTwips': bounds, 'matrix': matrix, 'bodySha256': sha(body), 'caption': caption, 'runs': runs}


def read_source(edition, resource, cast):
    path = BASE / edition / f'{resource:05d}-XMED.bin'
    payload = path.read_bytes()
    raw = payload[12:]
    if raw[:4] != b'FWS\x05' or len(raw) > 2_000_000 or struct.unpack_from('<I', raw, 4)[0] != len(raw):
        raise ValueError('Unexpected bounded UI SWF')
    index = json.loads((BASE / edition / 'cast-media-index.json').read_text())
    if not any(c['id'] == cast and c['name'] == 'UI' for c in index['cast_members']):
        raise ValueError('UI cast missing')
    if not any(l['parent'] == cast and l['child'] == resource and l['tag'] == 'XMED' for l in index['key_links']):
        raise ValueError('UI cast/resource binding missing')
    bits = Bits(raw, 8)
    bounds = bits.rect()
    rate, frames = struct.unpack_from('<HH', raw, bits.pos)
    records = list(tags(raw, bits.pos + 4))
    shapes, sprites, texts, fonts = {}, {}, {}, {}
    for tag, body in records:
        if tag in (2, 32) and struct.unpack_from('<H', body)[0] in (5, 6, 7, 11):
            shape = scope.decode_shape(tag, body)
            shapes[shape['characterId']] = shape
        elif tag == 39 and struct.unpack_from('<H', body)[0] in (10, 12):
            character, count = struct.unpack_from('<HH', body)
            if count != 1:
                raise ValueError('Unexpected emblem/crosshair sprite timeline')
            sprites[character] = {'frameCount': count, 'placements': display_list(list(tags(body, 4)), 1), 'bodySha256': sha(body)}
        elif tag == 48 and struct.unpack_from('<H', body)[0] == 8:
            fonts[8] = decode_font(body)
        elif tag == 11 and struct.unpack_from('<H', body)[0] == 9:
            texts[9] = decode_text(body, fonts[8])
    display = display_list(records, 2)
    expected = {1: 6, 2: 10, 5: 12, 40: 5}
    if {d: p['characterId'] for d, p in display.items()} != expected or set(shapes) != {5, 6, 7, 11} or set(sprites) != {10, 12}:
        raise ValueError('Unexpected normal UI display graph')
    if {d: p['characterId'] for d, p in sprites[10]['placements'].items()} != {1: 7, 2: 9} or {d: p['characterId'] for d, p in sprites[12]['placements'].items()} != {1: 11} or set(texts) != {9}:
        raise ValueError('Unexpected nested UI display graph')
    info = {'edition': edition, 'castId': cast, 'resourceId': resource, 'path': str(path.relative_to(ROOT)), 'resourceSha256': sha(payload), 'swfSha256': sha(raw), 'swfOffset': 12, 'stageBoundsTwips': bounds, 'frameCount': frames, 'frameRate': rate / 256, 'opaqueRootActionTagCount': sum(t in (12, 59, 72, 82) for t, _ in records)}
    return info, {'frame': 2, 'displayList': display, 'shapes': shapes, 'sprites': sprites, 'texts': texts, 'fonts': fonts}


def shape_svg(shape):
    result = []
    for fill in shape['fills']:
        color = fill['style']['rgba']
        if fill['style']['type'] != 'solid':
            raise ValueError('Normal UI unexpected nonsolid fill')
        paint = '#' + ''.join(f'{c:02x}' for c in color[:3])
        result.append(f'<path d="{" ".join(fill["paths"])}" fill="{paint}" fill-opacity="{scope.number(color[3] / 255)}" fill-rule="evenodd"/>')
    for stroke in shape['strokes']:
        color = stroke['style']['rgba']
        paint = '#' + ''.join(f'{c:02x}' for c in color[:3])
        result.append(f'<path d="{" ".join(stroke["paths"])}" fill="none" stroke="{paint}" stroke-opacity="{scope.number(color[3] / 255)}" stroke-width="{scope.number(stroke["style"]["widthTwips"] / 20)}" stroke-linejoin="round" stroke-linecap="round"/>')
    return result


def layer_svg(content, name):
    depth, character = LAYERS[name]
    placement = content['displayList'][depth]
    matrices = [placement['matrix']]
    if name in ('emblem', 'crosshair'):
        matrices.append(content['sprites'][placement['characterId']]['placements'][1]['matrix'])
    lines = []
    for matrix in matrices:
        lines.append('<g transform="matrix(' + ' '.join(scope.number(v) for v in matrix) + ')">')
    lines.extend(shape_svg(content['shapes'][character]))
    if name == 'emblem':
        caption_placement = content['sprites'][10]['placements'][2]['matrix']
        text, font = content['texts'][9], content['fonts'][8]
        # Close shape7's local identity group, then render caption at sprite10's
        # separate depth2 placement. Keep both inside the original root matrix.
        lines.append('</g>')
        lines.append('<g transform="matrix(' + ' '.join(scope.number(v) for v in caption_placement) + ')"><g transform="matrix(' + ' '.join(scope.number(v) for v in text['matrix']) + ')">')
        for run in text['runs']:
            paint = '#' + ''.join(f'{c:02x}' for c in run['rgb'])
            for glyph in run['glyphs']:
                x, y = glyph['xTwips'] / 20, glyph['yTwips'] / 20
                scale = run['heightTwips'] / 1024
                paths = ' '.join(font['glyphs'][glyph['index']]['paths'])
                lines.append(f'<path transform="translate({scope.number(x)} {scope.number(y)}) scale({scope.number(scale)})" d="{paths}" fill="{paint}" fill-rule="evenodd"/>')
        lines.extend(['</g>', '</g>', '</g>'])
    else:
        lines.extend('</g>' for _ in matrices)
    return lines, {'depth': depth, 'characterId': character, 'placementMatrices': matrices}


def main():
    sources, contents = [], {}
    for edition, resource, cast in [('barrack', 5118, 4527), ('woodland', 6525, 5760)]:
        info, content = read_source(edition, resource, cast)
        sources.append(info)
        contents[edition] = content
    if contents['barrack']['texts'][9]['caption'] != 'Barrack' or contents['woodland']['texts'][9]['caption'] != 'Woodland':
        raise ValueError('Unexpected edition caption')
    reference = contents['barrack']
    other = contents['woodland']
    if reference['shapes'] != other['shapes'] or reference['displayList'] != other['displayList'] or reference['sprites'][12] != other['sprites'][12]:
        raise ValueError('Common normal UI vectors/placements differ')
    OUT.mkdir(parents=True, exist_ok=True)
    start = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" preserveAspectRatio="none">'
    outputs = {}
    for edition, content in contents.items():
        composite = []
        for name in LAYERS:
            lines, metadata = layer_svg(content, name)
            key = f'emblem-{edition}' if name == 'emblem' else name
            data = ('\n'.join([start, '<!-- Original normal UI frame2 vector layer; no SWF code executed. -->', *lines, '</svg>']) + '\n').encode()
            path = OUT / f'{key}.svg'
            if key in outputs and outputs[key]['sha256'] != sha(data):
                raise ValueError('Shared vector layer differs')
            path.write_bytes(data)
            outputs[key] = {**metadata, 'file': str(path.relative_to(ROOT)), 'sha256': sha(data), 'bytes': len(data), 'viewBox': [0, 0, 800, 600]}
            composite.extend(lines)
        data = ('\n'.join([start, '<!-- Complete static source frame2 vectors including original font glyph caption. -->', *composite, '</svg>']) + '\n').encode()
        path = OUT / f'normal-ui-{edition}.svg'
        path.write_bytes(data)
        outputs[f'composite-{edition}'] = {'file': str(path.relative_to(ROOT)), 'sha256': sha(data), 'bytes': len(data), 'viewBox': [0, 0, 800, 600]}
    manifest = {'schemaVersion': 1, 'executed': False, 'decoder': str(Path(__file__).relative_to(ROOT)), 'decoderSha256': sha(Path(__file__).read_bytes()), 'sources': sources, 'identicalSelectedShapeBodiesAndRootPlacements': True, 'editionContents': contents, 'outputs': outputs, 'limits': ['All static frame2 display objects including DefineText9 caption font outlines are exported. Edition captions differ: Barrack versus Woodland, with original placement differences retained.', 'Native stage is1024x1024;800x600 SVG viewport follows visible source artwork and current projection adapter, not proof of native texture rasterization.', 'SVG alpha, even-odd contours, quadratic curves and source twip widths are retained; browser antialiasing/round line joins/caps and preserveAspectRatio=none viewport stretching remain explicit adapters.', 'ActionScript tags remain opaque and are never interpreted or executed.']}
    (OUT / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'outputs': outputs, 'captions': {edition: content['texts'][9]['caption'] for edition, content in contents.items()}}, indent=2))


if __name__ == '__main__':
    main()
