#!/usr/bin/env python3
"""Passive referenced styles/paragraphs for hints, talk and stats XMED."""
import hashlib
import importlib.util
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('weapons_decoder',
    ROOT / 'scripts/research/decode-original-hud-text-style.py')
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)
OUTPUT = ROOT / 'docs/research-evidence/2026-10-01/original-normal-ui/other-hud-text-decode.json'


def runs(data, key):
    begin, end, count = decoder.section(data, key)
    fields = decoder.numbers(data, begin, end)
    assert len(fields) == count * 2
    return [dict(position=fields[i], index=fields[i + 1]) for i in range(0, len(fields), 2)]


def paragraphs(data):
    begin, end, count = decoder.section(data, 7)
    fields = decoder.numbers(data, begin, end)
    result, cursor = [], 0
    for index in range(count):
        # PGREAD.C unpack_par_info: num_tabs at29, then4 numbers per tab,
        # followed by24 fields in the modern version. Zero tabs =54 total.
        num_tabs = fields[cursor + 29]['value']
        assert 0 <= num_tabs <= 32
        length = 54 + 4 * num_tabs
        record = fields[cursor:cursor + length]
        assert len(record) == length
        selected = {name: record[number] for name, number in {
            'justification': 0, 'left_indent': 3, 'right_indent': 4,
            'first_indent': 5, 'spacing': 6, 'leading_extra': 7,
            'leading_fixed': 8, 'leading_variable': 9,
            'top_extra': 10, 'bot_extra': 11, 'num_tabs': 29}.items()}
        result.append(dict(paragraphIndex=index, selectedFields=selected,
                           tabs=[record[30 + i * 4:34 + i * 4] for i in range(num_tabs)],
                           fields=record))
        cursor += length
    assert cursor == len(fields)
    return result


def decode():
    manifest = json.loads(decoder.MANIFEST.read_text())
    primary = json.loads((OUTPUT.parent / 'weapons-style-decode.json').read_text())['primarySource']
    output = dict(primarySource=primary, editions={})
    for edition, evidence in manifest['editions'].items():
        output['editions'][edition] = {}
        for member in ('stats', 'hints', 'talk'):
            source = evidence['members'][member]['xmed']
            data = (ROOT / source['path']).read_bytes()
            assert hashlib.sha256(data).hexdigest() == source['sha256']
            begin, end, count = decoder.section(data, 6)
            fields = decoder.numbers(data, begin, end)
            assert len(fields) == 1 + 77 * count
            style_runs = runs(data, 4)
            paragraph_runs = runs(data, 5)
            font_table = decoder.fonts(data)
            refs = sorted({run['index']['value'] for run in style_runs} | {fields[0]['value']})
            styles = []
            for index in refs:
                assert 0 <= index < count
                record = fields[1 + index * 77:1 + (index + 1) * 77]
                selected = {name: record[number] for name, number in {
                    'font_index': 0, 'ascent': 3, 'descent': 4, 'leading': 5,
                    'point': 18, 'space_extra': 23, 'char_extra': 24,
                    'bold': 39, 'italic': 40, 'underline': 41}.items()}
                font_index = selected['font_index']['value']
                assert 0 <= font_index < len(font_table)
                size = selected['point']['value'] / 65536
                name = font_table[font_index]['names'][0]['name']
                assert name == 'Arial' and size == (12 if member == 'stats' else 11)
                assert [selected[k]['value'] for k in ('bold', 'italic', 'underline')] == [1, 0, 0]
                styles.append(dict(styleIndex=index, fontName=name, storedPointSize=size,
                    storedMetricSum=sum(selected[k]['value'] for k in ('ascent', 'descent', 'leading')),
                    storedForeground=[record[k]['value'] >> 8 for k in (9, 10, 11)],
                    selectedFields=selected, fields=record))
            par_records = paragraphs(data)
            for run in paragraph_runs:
                assert 0 <= run['index']['value'] < len(par_records)
            text = None
            if re.search(rb'\x030002[0-9A-F]{16}', data):
                a, z, _ = decoder.section(data, 2)
                match = re.match(rb'\x00([0-9A-F]+),', data[a:z])
                assert match
                payload, length = a + match.end(), int(match[1], 16)
                assert payload + length == z
                text = data[payload:z].decode('latin1')
            output['editions'][edition][member] = dict(source=source, storedText=text,
                insertionStyle=fields[0], completeStyleCount=count, fonts=font_table,
                styleRuns=style_runs, referencedStyles=styles,
                paragraphRuns=paragraph_runs, paragraphs=par_records,
                nativeMetricsRemeasurementAndRasterVerified=False)
    OUTPUT.write_text(json.dumps(output, indent=2) + '\n')
    print(f'Verified six XMED resources; wrote {OUTPUT.relative_to(ROOT)}')


if __name__ == '__main__':
    decode()
