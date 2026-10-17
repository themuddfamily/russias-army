#!/usr/bin/env python3
"""Read only Director score delta bytes and Paige result text; no movie execution.

Prints a reproducible JSON report to stdout. Does not claim registration offsets.
The D6+ container and D7 channel offsets follow ScummVM score.cpp/frame.cpp;
Paige fields reuse the independently documented existing text decoder.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[2]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


NUM = load('result_numeric', 'scripts/research/decode-original-hud-text-style.py')
OTHER = load('result_other', 'scripts/research/decode-original-other-hud-text.py')


def source(path):
    data = path.read_bytes()
    return data, dict(path=str(path.relative_to(ROOT)), bytes=len(data),
                     sha256=hashlib.sha256(data).hexdigest())


def score(data):
    declared, version, list_start = struct.unpack_from('>IiI', data)
    assert declared == len(data) and version == -3 and list_start == 12
    entries, list_size, max_data = struct.unpack_from('>III', data, list_start)
    base = list_start + 12 + list_size * 4
    offsets = struct.unpack_from(f'>{entries}I', data, list_start + 12)
    assert all(a <= b for a, b in zip(offsets, offsets[1:]))
    header = base + offsets[0]
    size, first_offset, frames, fv, record_size, channels, displayed = struct.unpack_from('>IIIHHHH', data, header)
    assert (first_offset, frames, fv, record_size, displayed) == (20, 6, 14, 48, 16)
    assert offsets[1] == size
    position = header + first_offset
    state = bytearray(288 + record_size * displayed)
    result = []
    for frame in range(1, frames + 1):
        start = position
        length = struct.unpack_from('>H', data, position)[0]
        end = start + length
        position += 2
        patches = []
        while position < end:
            count, offset = struct.unpack_from('>HH', data, position)
            position += 4
            assert position + count <= end and offset + count <= len(state)
            state[offset:offset + count] = data[position:position + count]
            patches.append(dict(sourceRangeExclusive=[position, position + count], channelOffset=offset))
            position += count
        assert position == end
        sprites = []
        for channel in (1, 2):
            raw = state[288 + (channel - 1) * 48:288 + channel * 48]
            lib, member, details, y, x, height, width = struct.unpack_from('>hHIhhhh', raw, 4)
            sprites.append(dict(channel=channel, rawHex=raw.hex(), spriteType=raw[0], inkData=raw[1],
                                castLib=lib, castMember=member, detailsIndex=details,
                                loc=[x, y], size=[width, height]))
        result.append(dict(frame=frame, frameRangeExclusive=[start, end], patches=patches, sprites=sprites))
    assert position == header + size
    return dict(headerOffset=header, dataBase=base, framesVersion=fv, spriteRecordBytes=record_size,
                declaredChannels=channels, displayedChannels=displayed, frames=result)


def text(data):
    a, z, count = NUM.section(data, 6)
    fields = NUM.numbers(data, a, z)
    assert len(fields) == 1 + count * 77
    runs = OTHER.runs(data, 4)
    refs = sorted({r['index']['value'] for r in runs} | {fields[0]['value']})
    fonts = NUM.fonts(data)
    styles = []
    for index in refs:
        q = fields[1 + index * 77:1 + (index + 1) * 77]
        styles.append(dict(index=index, font=fonts[q[0]['value']]['names'][0]['name'],
                           point=q[18]['value'] / 65536,
                           metrics=[q[k]['value'] for k in (3, 4, 5)],
                           boldItalicUnderline=[q[k]['value'] for k in (39, 40, 41)],
                           foreground=[q[k]['value'] >> 8 for k in (9, 10, 11)],
                           spaceAndCharacterExtra=[q[k]['value'] for k in (23, 24)],
                           fields=q))
    a, z, _ = NUM.section(data, 2)
    match = re.match(rb'\x00([0-9A-F]+),', data[a:z])
    assert match
    payload = a + match.end()
    assert payload + int(match[1], 16) == z
    return dict(storedText=data[payload:z].decode('latin1'), insertStyle=fields[0],
                styleRuns=runs, referencedStyles=styles, paragraphRuns=OTHER.runs(data, 5),
                paragraphs=OTHER.paragraphs(data))


def cast_bounds(data):
    kind, info_length, specific_length = struct.unpack_from('>III', data)
    assert kind == 15 and 12 + info_length + specific_length == len(data)
    info = data[12:12 + info_length]
    assert struct.unpack_from('>I', info)[0] == 20
    count = struct.unpack_from('>H', info, 20)[0]
    offsets = struct.unpack_from(f'>{count + 1}I', info, 22)
    base = 22 + (count + 1) * 4
    assert count == 13 and base + offsets[-1] == len(info)
    start, end = base + offsets[12], base + offsets[13]
    assert end - start == 16
    top, left, bottom, right = struct.unpack_from('>iiii', info, start)
    specific = data[12 + info_length:]
    symbol_length = struct.unpack_from('>I', specific)[0]
    symbol = specific[4:4 + symbol_length].decode('ascii')
    payload_length = struct.unpack_from('>I', specific, 4 + symbol_length)[0]
    payload = specific[8 + symbol_length:]
    assert len(payload) == payload_length
    result = dict(xtraSymbol=symbol, xtraRect=[left, top, right, bottom],
                  rectSourceRangeExclusive=[12 + start, 12 + end],
                  opaquePayloadBytes=payload_length)
    if symbol == 'text':
        height, width = struct.unpack_from('>ii', payload, 36)
        assert (height, width) == (bottom - top, right - left)
        result['textPayloadDimensions'] = [width, height]
    return result


def main():
    out = dict(passive=True, originalRuntimeExecuted=False, registrationDecoded=False, editions={})
    for edition, resource, ui in [('barrack', 4918, 4527), ('woodland', 6307, 5760)]:
        directory = ROOT / 'docs/research-evidence/2026-09-30/director-extraction' / edition
        score_data, score_source = source(next(directory.glob('*-VWSC.bin')))
        rooms_cast, rooms_cast_source = source(directory / '02052-CASt.bin')
        ui_cast, ui_cast_source = source(directory / f'{ui:05d}-CASt.bin')
        text_data, text_source = source(directory / f'{resource:05d}-XMED.bin')
        out['editions'][edition] = dict(scoreSource=score_source, textSource=text_source,
                                       score=score(score_data), rooms=text(text_data),
                                       roomsCast=dict(source=rooms_cast_source, decoded=cast_bounds(rooms_cast)),
                                       uiCast=dict(source=ui_cast_source, decoded=cast_bounds(ui_cast)))
    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()
