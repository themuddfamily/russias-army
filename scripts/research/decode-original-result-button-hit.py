#!/usr/bin/env python3
"""Passive button hit contours and AVM1 instruction listing; no action execution."""
import copy
import importlib.util
import json
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('result_artwork', ROOT / 'scripts/research/extract-original-result-ui.py')
ART = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ART)


def instructions(body):
    # ActionOffset is relative to its own UI16 field, starting at byte3.
    position = 3 + struct.unpack_from('<H', body, 3)[0]
    raw = body[position:]
    size, condition = struct.unpack_from('<HH', raw)
    assert size == 0 and condition == 4
    position = 4
    out = []
    while position < len(raw):
        start = position
        opcode = raw[position]
        position += 1
        payload = b''
        if opcode >= 0x80:
            length = struct.unpack_from('<H', raw, position)[0]
            position += 2
            payload = raw[position:position + length]
            assert len(payload) == length
            position += length
        entry = dict(actionRangeExclusive=[start, position], opcodeHex=f'{opcode:02x}')
        if opcode == 0x96:
            strings = []
            cursor = 0
            while cursor < len(payload):
                assert payload[cursor] == 0  # Literal STRING type; no evaluation.
                end = payload.index(0, cursor + 1)
                strings.append(payload[cursor + 1:end].decode('ascii'))
                cursor = end + 1
            entry.update(name='ActionPush', literalStrings=strings)
        else:
            assert opcode in (0x1c, 0x4f, 0)
            entry['name'] = {0x1c: 'ActionGetVariable', 0x4f: 'ActionSetMember', 0: 'End'}[opcode]
        out.append(entry)
        if opcode == 0:
            break
    assert position == len(raw)
    assert [x['opcodeHex'] for x in out] == ['96', '1c', '96', '4f', '00']
    assert out[0]['literalStrings'] == ['_root']
    assert out[2]['literalStrings'][0] == 'state'
    return dict(bytes=len(raw), sha256=ART.sha(raw), conditionHex='0004',
                condition='CondOverUpToOverDown', instructions=out,
                staticAssignmentInference='_root.state = ' + repr(out[2]['literalStrings'][1]))


def glyph_control_bbox(art, record):
    text = art.decode(record['characterId'])
    matrix = ART.matrix_mul(record['matrix'], text['matrix'])
    points = []
    for run in text['runs']:
        font = art.decode(run['fontId'])
        scale = run['heightTwips'] / 1024
        for glyph in run['glyphs']:
            transform = ART.matrix_mul(matrix, [scale, 0, 0, scale, glyph['xTwips'] / 20, glyph['yTwips'] / 20])
            for path in font['glyphs'][glyph['index']]['paths']:
                assert set(re.findall('[A-Za-z]', path)) <= {'M', 'L', 'Q', 'Z'}
                numbers = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', path)]
                assert len(numbers) % 2 == 0
                for x, y in zip(numbers[::2], numbers[1::2]):
                    points.append([transform[0]*x + transform[2]*y + transform[4],
                                   transform[1]*x + transform[3]*y + transform[5]])
    return [min(x for x, y in points), min(y for x, y in points),
            max(x for x, y in points), max(y for x, y in points)]


def main():
    result = dict(passive=True, originalActionExecution=False, editions={})
    for edition, resource, cast in [('barrack', 5118, 4527), ('woodland', 6525, 5760)]:
        art = ART.Artwork(edition, resource, cast)
        replay = art.display[22]
        go = copy.deepcopy(art.decode(97)['frames'][0][4])
        go['matrix'] = ART.matrix_mul(art.display[25]['matrix'], go['matrix'])
        controls = {}
        for name, placement, shape_id, text_id in [('replay', replay, 41, 90), ('go', go, 93, 95)]:
            cid = placement['characterId']
            button = art.decode(cid)
            shape = art.decode(shape_id)
            glyph = next(r for r in button['records'] if r['characterId'] == text_id and r['stateFlags'] & 8)
            controls[name] = dict(characterId=cid, records=button['records'], placement=placement,
                                  hitShape=shape, glyphControlBoundsLocal=glyph_control_bbox(art, glyph),
                                  actions=instructions(art.defs[cid][1]))
        bbox = controls['replay']['glyphControlBoundsLocal']
        assert -1 <= bbox[0] <= bbox[2] <= 100 and -.05 <= bbox[1] <= bbox[3] <= 39.95
        quad = art.bounds(replay, state=8)[:4]
        x, y = min(p[0] for p in quad), min(p[1] for p in quad)
        width, height = max(p[0] for p in quad)-x, max(p[1] for p in quad)-y
        controls['replay'].update(glyphContainedInRectangle=True, exactHitQuadStage=quad,
                                  envelope=[x, y, width, height],
                                  cssPolygonPercent=[[100*(a-x)/width, 100*(b-y)/height] for a, b in quad])
        result['editions'][edition] = dict(source=art.source, controls=controls)
    assert result['editions']['barrack']['controls'] == result['editions']['woodland']['controls']
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
