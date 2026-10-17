#!/usr/bin/env python3
"""Passive bounded health SWF display-list/morph export. Never executes content."""
from pathlib import Path
import copy
import hashlib
import importlib.util
import json
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/research-evidence/2026-09-30/director-extraction/barrack/05120-XMED.bin'
OUT = ROOT / 'public/assets/original-barrack-health'
spec = importlib.util.spec_from_file_location('scope_decoder', ROOT / 'scripts/research/extract-original-scope.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
Bits, tags = helper.Bits, helper.tags

def sha(data):
    return hashlib.sha256(data).hexdigest()

def number(x):
    return format(x, '.12g')

def edges(data, offset):
    r = Bits(data, offset)
    nf, nl = r.u(4), r.u(4)
    x = y = f0 = f1 = line = 0
    result = []
    while True:
        if r.u(1):
            straight = r.u(1)
            n = r.u(4) + 2
            start = [x, y]
            if not straight:
                raise ValueError('Health morph unexpectedly has quadratic edge')
            if r.u(1):
                dx, dy = r.s(n), r.s(n)
            elif r.u(1):
                dx, dy = 0, r.s(n)
            else:
                dx, dy = r.s(n), 0
            x += dx
            y += dy
            result.append(dict(start=start, end=[x, y], fill0=f0, fill1=f1, line=line))
        else:
            flags = r.u(5)
            if not flags:
                break
            if flags & 16:
                raise ValueError('Unsupported morph NewStyles')
            if flags & 1:
                n = r.u(5)
                x, y = r.s(n), r.s(n)
            if flags & 2:
                f0 = r.u(nf)
            if flags & 4:
                f1 = r.u(nf)
            if flags & 8:
                line = r.u(nl)
    r.align()
    return result, r.pos

def morph(body):
    cid = struct.unpack_from('<H', body)[0]
    r = Bits(body, 2)
    start_bounds, end_bounds = r.rect(), r.rect()
    offset = struct.unpack_from('<I', body, r.pos)[0]
    p = r.pos + 4
    end_offset = p + offset
    count = body[p]
    p += 1
    assert count == 1
    kind = body[p]
    p += 1
    assert kind == 0
    start_rgba, end_rgba = list(body[p:p + 4]), list(body[p + 4:p + 8])
    p += 8
    count = body[p]
    p += 1
    assert count == 1
    widths = list(struct.unpack_from('<HH', body, p))
    p += 4
    line_rgba = [list(body[p:p + 4]), list(body[p + 4:p + 8])]
    p += 8
    start_edges, start_end = edges(body, p)
    end_edges, end_end = edges(body, end_offset)
    assert start_end == end_offset and end_end == len(body)
    assert len(start_edges) == len(end_edges) == 4
    assert widths == [0, 0] and all(c[3] == 0 for c in line_rgba)
    assert all(e['line'] == 1 for e in start_edges)
    assert all(e['fill0'] == 1 and e['fill1'] == 0 for e in start_edges)
    # EndEdges encode geometry only; SWF morph style indexes come from StartEdges.
    assert all(e['fill0'] == e['fill1'] == e['line'] == 0 for e in end_edges)
    assert all(start_edges[i]['end'] == start_edges[(i + 1) % 4]['start'] for i in range(4))
    assert all(end_edges[i]['end'] == end_edges[(i + 1) % 4]['start'] for i in range(4))
    return dict(characterId=cid, bodySha256=sha(body), startBoundsTwips=start_bounds,
                endBoundsTwips=end_bounds, startRgba=start_rgba, endRgba=end_rgba,
                transparentZeroWidthLineWidths=widths, transparentZeroWidthLineRgba=line_rgba,
                startEdges=start_edges, endEdges=end_edges)

def place(body, display):
    flags = body[0]
    depth = struct.unpack_from('<H', body, 1)[0]
    assert not flags & 160, 'No names or clip actions supported'
    p = 3
    if flags & 1:
        assert depth in display
        item = copy.deepcopy(display[depth])
    else:
        assert depth not in display
        item = dict(depth=depth, matrix=[1, 0, 0, 1, 0, 0], ratio=0,
                    colorTransform=dict(multiply=[256] * 4, add=[0] * 4))
    if flags & 2:
        item['characterId'] = struct.unpack_from('<H', body, p)[0]
        p += 2
    if flags & 4:
        r = Bits(body, p)
        item['matrix'] = r.matrix()
        p = r.pos
    if flags & 8:
        r = Bits(body, p)
        has_add, has_mul, n = r.u(1), r.u(1), r.u(4)
        mul = [r.s(n) for _ in range(4)] if has_mul else [256] * 4
        add = [r.s(n) for _ in range(4)] if has_add else [0] * 4
        r.align()
        p = r.pos
        item['colorTransform'] = dict(multiply=mul, add=add)
    if flags & 16:
        item['ratio'] = struct.unpack_from('<H', body, p)[0]
        p += 2
    if flags & 64:
        item['clipDepth'] = struct.unpack_from('<H', body, p)[0]
        p += 2
    assert p == len(body) and 'characterId' in item
    display[depth] = item

def rgba(style, transform):
    color = [min(255, max(0, v * transform['multiply'][i] / 256 + transform['add'][i]))
             for i, v in enumerate(style['rgba'])]
    return f'rgb({number(color[0])},{number(color[1])},{number(color[2])})', number(color[3] / 255)

def morph_shape(m, ratio):
    assert 0 <= ratio <= 65535
    t = ratio / 65535
    vertices = [[a + (b - a) * t for a, b in zip(e0['start'], e1['start'])]
                for e0, e1 in zip(m['startEdges'], m['endEdges'])]
    path = 'M ' + ' L '.join(' '.join(number(v / 20) for v in pt) for pt in vertices) + ' Z'
    color = [a + (b - a) * t for a, b in zip(m['startRgba'], m['endRgba'])]
    return dict(fills=[dict(style=dict(rgba=color), paths=[path])], strokes=[])

def art(shape, item, clip=False):
    result = []
    matrix = ' '.join(number(v) for v in item['matrix'])
    # SVG clipPath takes basic shapes directly. A nested group is XML-valid
    # but Chromium excludes its geometry from the clipping silhouette. Keep
    # the identical source placement matrix on each direct mask path instead.
    if clip:
        assert not shape['strokes'], 'Clip masks with strokes need explicit geometry recovery'
    else:
        result.append(f'<g transform="matrix({matrix})">')
    path_transform = f' transform="matrix({matrix})"' if clip else ''
    for fill in shape['fills']:
        color, alpha = rgba(fill['style'], item['colorTransform'])
        for path in fill['paths']:
            result.append(f'<path d="{path}"{path_transform} fill="{color}" fill-opacity="{alpha}" fill-rule="nonzero"/>')
    for stroke in shape['strokes']:
        color, alpha = rgba(stroke['style'], item['colorTransform'])
        for path in stroke['paths']:
            result.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-opacity="{alpha}" stroke-width="{number(stroke["style"]["widthTwips"] / 20)}" stroke-linecap="round" stroke-linejoin="round"/>')
    if not clip:
        result.append('</g>')
    return '\n'.join(result)

def svg_for(display, shapes, morphs):
    result = ['<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
              '<!-- Passive source health display list; no original content executed. -->']
    clips = []
    for depth, item in sorted(display.items()):
        while clips and depth > clips[-1]:
            result.append('</g>')
            clips.pop()
        cid = item['characterId']
        shape = morph_shape(morphs[cid], item['ratio']) if cid in morphs else shapes[cid]
        content = art(shape, item, clip='clipDepth' in item)
        if 'clipDepth' in item:
            assert not clips and item['clipDepth'] > depth
            result.append(f'<defs><clipPath id="depth{depth}" clipPathUnits="userSpaceOnUse">{content}</clipPath></defs>')
            result.append(f'<g clip-path="url(#depth{depth})">')
            clips.append(item['clipDepth'])
        else:
            result.append(content)
    while clips:
        result.append('</g>')
        clips.pop()
    result.append('</svg>')
    raw = ('\n'.join(result) + '\n').encode()
    ET.fromstring(raw)
    return raw

def main():
    payload = SOURCE.read_bytes()
    assert sha(payload) == 'cf457d250591f80b56677f13bdc5a8d203a8dae2dda8f06323ad138858b22966'
    raw = payload[12:]
    assert raw[:4] == b'FWS\x05' and struct.unpack_from('<I', raw, 4)[0] == len(raw)
    index = json.loads((SOURCE.parent / 'cast-media-index.json').read_text())
    assert any(x['id'] == 3765 and x['name'] == 'health' for x in index['cast_members'])
    assert any(x['parent'] == 3765 and x['child'] == 5120 and x['tag'] == 'XMED' for x in index['key_links'])
    r = Bits(raw, 8)
    stage = r.rect()
    rate, count = struct.unpack_from('<HH', raw, r.pos)
    assert stage == [0, 1280, 0, 1280] and rate == 3072 and count == 100
    shapes, morphs, display, frames, tag_counts = {}, {}, {}, [], {}
    background = None
    for tag, body in tags(raw, r.pos + 4):
        tag_counts[tag] = tag_counts.get(tag, 0) + 1
        assert tag in (0, 1, 2, 9, 26, 28, 46), f'Unsupported tag {tag}'
        if tag == 2:
            shape = helper.decode_shape(tag, body)
            assert all(x['style']['type'] == 'solid' for x in shape['fills'])
            shapes[shape['characterId']] = shape
        elif tag == 46:
            item = morph(body)
            morphs[item['characterId']] = item
        elif tag == 26:
            place(body, display)
        elif tag == 28:
            assert len(body) == 2
            del display[struct.unpack('<H', body)[0]]
        elif tag == 1:
            assert len(body) == 0
            frames.append(copy.deepcopy(display))
        elif tag == 9:
            assert len(body) == 3
            background = list(body)
            # Background color is stage background, not display-list artwork.
    assert len(frames) == 100 and set(shapes) == {1, 3, 4, 5} and set(morphs) == {2}
    assert frames[0][2]['ratio'] == 0 and frames[0][2]['characterId'] == 2
    assert frames[-1][2]['characterId'] == 5
    assert all(frames[i][2]['ratio'] < frames[i + 1][2]['ratio'] for i in range(98))
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = []
    for i, display in enumerate(frames, 1):
        data = svg_for(display, shapes, morphs)
        path = OUT / f'frame-{i:03}.svg'
        path.write_bytes(data)
        outputs.append(dict(frame=i, file=path.name, sha256=sha(data), bytes=len(data),
                            displayList=[item for _, item in sorted(display.items())]))
    manifest = dict(schemaVersion=1, executed=False,
        decoder=str(Path(__file__).relative_to(ROOT)), decoderSha256=sha(Path(__file__).read_bytes()),
        helperDecoder=str(Path(helper.__file__).relative_to(ROOT)), helperDecoderSha256=sha(Path(helper.__file__).read_bytes()),
        source=dict(path=str(SOURCE.relative_to(ROOT)), sha256=sha(payload), castId=3765,
                    resourceId=5120, swfOffset=12, swfSha256=sha(raw), stageBoundsTwips=stage,
                    frames=count, framesPerSecond=rate / 256, tagCounts=tag_counts, backgroundRgb=background),
        shapes=shapes, morphs=morphs, outputs=outputs,
        overlayAnchor=['viewportRight - 82', 11],
        posterFrameExpression='100 - (plives + 1 - pcheatflick)',
        limits=[
            'All100 source display lists, shape paths, placement matrices, color transforms, mask ranges and explicit morph ratios are statically decoded. No original movie or code is executed.',
            'Morph coordinates are linearly interpolated from integer-twip endpoints using ratio/65535; native intermediate integer rounding remains unproved. SVG antialiasing, line cap/join rasterization and texture filtering remain browser adapters.',
            'SWF SetBackgroundColor is retained as source metadata but excluded from transparent vector texture artwork; native Director Flash background alpha behavior remains unproved.',
            'No native behavior is asserted for fractional, zero, negative or greater-than100 posterFrame values; integration must explicitly identify its choice for unsupported values.',
            'Native64x64 envelope is preserved; scaling and responsive placement are browser adapters.'
        ])
    (OUT / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(dict(output=str(OUT.relative_to(ROOT)), frames=len(outputs),
                          shapes=len(shapes), morphs=len(morphs), sourceSha256=sha(payload))))

if __name__ == '__main__':
    main()
