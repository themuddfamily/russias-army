#!/usr/bin/env python3
"""Passive Paige/XMED weapons-style decoder; never executes movie content."""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'docs/research-evidence/2026-10-01/original-normal-ui/dynamic-text-evidence.json'
OUTPUT = ROOT / 'docs/research-evidence/2026-10-01/original-normal-ui/weapons-style-decode.json'


def numbers(data, start, end):
    """PGREAD.C pgUnpackNum: typed ASCII hex plus repeat controls."""
    result = []
    position, previous = start, 0
    while position < end:
        begin = position
        control = data[position]
        position += 1
        assert control & 15 in (1, 2), (begin, control)
        count = 1
        if control & 128:
            if control & 64:
                count = data[position]
                position += 1
                assert count > 0
        else:
            begin_digits = position
            while position < end and data[position] in b'0123456789ABCDEFabcdef-':
                position += 1
            assert position > begin_digits
            previous = int(data[begin_digits:position], 16)
        item = dict(value=previous, controlHex=f'{control:02x}',
                    tokenRangeExclusive=[begin, position])
        result.extend(dict(item, repeatOrdinal=i, repeatTotal=count) for i in range(count))
    assert position == end
    return result


def section(data, key):
    matches = list(re.finditer(rb'\x03' + f'{key:04X}'.encode() + rb'([0-9A-F]{16})', data))
    assert len(matches) == 1
    match = matches[0]
    header = match[1]
    start, length, count = match.end(), int(header[:8], 16), int(header[12:], 16)
    assert data[start + length - 1] == 3
    return start, start + length - 1, count


def fonts(data):
    start, end, count = section(data, 8)
    position, result = start, []
    for index in range(count):
        names = []
        for _ in range(2):
            match = re.match(rb'\x00([0-9A-F]+),', data[position:])
            assert match
            size = int(match[1], 16)
            payload = position + match.end()
            name_length = data[payload]
            assert name_length + 1 <= size
            names.append(dict(name=data[payload + 1:payload + 1 + name_length].decode('ascii'),
                              pointerRangeExclusive=[position, payload + size]))
            position = payload + size
        # 17 fields: environs/typeface/family/char/codepage/language/refcon,
        # machine_var[8], platform, alternate_id. Read until next pointer.
        next_position = data.find(b'\x0040,', position, end)
        if next_position < 0:
            next_position = end
        values = numbers(data, position, next_position)
        assert len(values) == 17
        result.append(dict(fontIndex=index, names=names, propertyFields=values))
        position = next_position
    assert position == end
    return result


def decode():
    manifest = json.loads(MANIFEST.read_text())
    result = {'format': 'Paige typed numeric stream; primary-source layout',
              'primarySource': {
                  'repository': 'https://github.com/nmatavka/HERMES-Paige',
                  'commit': 'cddd9543709db505077b7b0426962fadd85b343d',
                  'filesSha256': {
                      'PGSOURCE/PGREAD.C': '80e06dd3aa0131ae629fa02a8843b40aed8fdb61c9d65bc2bac14583aecebe63',
                      'PGSOURCE/PGWRITE.C': '25129a549c380ecb8b5168facf6090c6224b29c8ddded331f7003d0aa0973d58',
                      'PGHEADER/PAIGE.H': 'd95690e403baae1bded3a383f0895229145479c655e03512e1169559d18ff235',
                      'PGHEADER/PGFILES.H': '58b96218ffa0e560c2b7f2065062eb3a4c930f4102353e128c555feaa0edc4a4',
                      'PGSOURCE/PGTEXT.C': '247878340555e58c0b3c9115802c58d98be412ecf2ac17345639adc2e692e610'
                  }
              }, 'editions': {}}
    for edition, evidence in manifest['editions'].items():
        source = evidence['members']['weapons']['xmed']
        data = (ROOT / source['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == source['sha256']
        begin, end, count = section(data, 6)
        fields = numbers(data, begin, end)
        # PGREAD.C style_info_key reads insert_style before 12 complete
        # unpack_style_info records. Modern field order contains 77 numbers.
        assert count == 12 and len(fields) == 1 + 77 * count
        records = [fields[1 + i * 77:1 + (i + 1) * 77] for i in range(count)]
        font_table = fonts(data)
        styles = []
        for index in (10, 11):
            record = records[index]
            selected = {name: record[number] for name, number in {
                'font_index': 0, 'ascent': 3, 'descent': 4, 'leading': 5,
                'point': 18, 'char_extra': 24, 'bold': 39,
                'italic': 40, 'underline': 41}.items()}
            font_index = selected['font_index']['value']
            assert font_index == 0 and selected['point']['value'] == 12 * 65536
            assert [selected[k]['value'] for k in ('bold', 'italic', 'underline')] == [1, 0, 0]
            assert [selected[k]['value'] for k in ('ascent', 'descent', 'leading')] == [12, 3, 0]
            styles.append(dict(styleIndex=index, fields=record, selectedFields=selected,
                               fontName=font_table[font_index]['names'][0]['name'],
                               storedPointSize=selected['point']['value'] / 65536,
                               storedMetricSum=15))
        p_begin, p_end, p_count = section(data, 7)
        paragraph = numbers(data, p_begin, p_end)
        assert p_count == 1
        selected_par = {name: paragraph[number] for name, number in {
            'justification': 0, 'spacing': 6, 'leading_extra': 7,
            'leading_fixed': 8, 'leading_variable': 9}.items()}
        assert all(value['value'] == 0 for value in selected_par.values())
        result['editions'][edition] = dict(source=source, insertStyle=fields[0],
            sectionBodyRangeExclusive=[begin, end], completeStyleCount=count,
            fonts=font_table, referencedStyles=styles,
            paragraph=dict(bodyRangeExclusive=[p_begin, p_end], selectedFields=selected_par))
    OUTPUT.write_text(json.dumps(result, indent=2) + '\n')
    print(f'Verified both editions; wrote {OUTPUT.relative_to(ROOT)}')


if __name__ == '__main__':
    decode()
