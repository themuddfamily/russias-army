#!/usr/bin/env python3
"""Bounded passive score/SWF audio inventory. Never execute original content."""
from pathlib import Path
import argparse, collections, hashlib, importlib.util, json, struct, urllib.request

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/research-evidence/2026-09-30/director-extraction'
SOUND_TAGS = {14: 'DefineSound', 15: 'StartSound', 17: 'DefineButtonSound',
              18: 'SoundStreamHead', 19: 'SoundStreamBlock',
              45: 'SoundStreamHead2', 89: 'StartSound2'}
PRIMARY = {
    'scoreParser': {'url': 'https://raw.githubusercontent.com/scummvm/scummvm/4d360356e79eb6f0cd1fd0f77f6e686e6419f272/engines/director/frame.cpp',
                    'sha256': '334ca9e1f5821f751845ba34c494164bee9a36bcfc41d000a6d4ebd9100ba16a'},
    'adobeSwfSpecification': {'url': 'https://open-flash.github.io/mirrors/swf-spec-19.pdf',
                             'sha256': '6a1625b0929a86329021d365ba079c7e1f51502dfb4ea7d92ec9947841625cdd'},
}


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCORE = load('score_data_decoder', 'scripts/research/decode-original-result-score.py')
SWF = load('bounded_swf_tags', 'scripts/research/extract-original-hurt-overlay.py')


def source(path, data):
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}


def score_audio(path):
    data = path.read_bytes()
    decoded = SCORE.score(data)
    state = bytearray(288 + decoded['spriteRecordBytes'] * decoded['displayedChannels'])
    frames = []
    for frame in decoded['frames']:
        for patch in frame['patches']:
            start, end = patch['sourceRangeExclusive']
            offset = patch['channelOffset']
            state[offset:offset + end - start] = data[start:end]
        channels = []
        for channel, offset in [(1, 192), (2, 144)]:
            raw = bytes(state[offset:offset + 48])
            library, member, list_index = struct.unpack_from('>HHI', raw)
            channels.append({'channel': channel, 'stateOffset': offset,
                             'castLibrary': library, 'castMember': member,
                             'spriteListIndex': list_index, 'editorColor': raw[8],
                             'rawHex': raw.hex(), 'allBytesZero': not any(raw)})
        frames.append({'frame': frame['frame'], 'sourcePatches': frame['patches'],
                       'soundChannels': channels})
    return {'source': source(path, data), 'framesVersion': decoded['framesVersion'],
            'mainChannelBytes': 288, 'frames': frames,
            'allSoundChannelsZero': all(c['allBytesZero'] for f in frames for c in f['soundChannels'])}


def swf_audio(path):
    data = path.read_bytes()
    if data[:3] != b'FWS' or struct.unpack_from('<I', data, 4)[0] != len(data):
        raise ValueError('Expected exact uncompressed SWF container')
    reader = SWF.Bits(data, 8)
    bounds = reader.rect()
    rate, declared_frames = struct.unpack_from('<HH', data, reader.pos)
    timelines, sounds, imports = [], [], []

    def walk(payload, start, name, depth=0):
        if depth > 32:
            raise ValueError('Unexpected sprite nesting')
        counts = collections.Counter()
        frame = 1
        for tag, body in SWF.tags(payload, start):
            counts[tag] += 1
            if tag in SOUND_TAGS:
                item = {'timeline': name, 'frame': frame, 'tag': tag, 'name': SOUND_TAGS[tag],
                        'payloadBytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
                if tag == 14:
                    if len(body) < 7:
                        raise ValueError('Truncated DefineSound')
                    identifier, flags, samples = struct.unpack_from('<HBI', body)
                    item['definition'] = {'soundId': identifier, 'format': flags >> 4,
                                          'rateCode': (flags >> 2) & 3, 'storedSizeBit': (flags >> 1) & 1,
                                          'channels': 2 if flags & 1 else 1, 'declaredSampleCount': samples,
                                          'soundDataBytes': len(body) - 7}
                elif tag == 15:
                    if len(body) < 3:
                        raise ValueError('Truncated StartSound')
                    identifier, flags = struct.unpack_from('<HB', body)
                    if flags != 4 or len(body) != 5:
                        raise ValueError('Unexpected StartSound style; decode explicitly before claiming semantics')
                    item['start'] = {'soundId': identifier, 'soundInfoHex': body[2:].hex(),
                                     'syncStop': False, 'syncNoMultiple': False, 'hasEnvelope': False,
                                     'hasInPoint': False, 'hasOutPoint': False,
                                     'loopCount': struct.unpack_from('<H', body, 3)[0]}
                elif tag in (18, 45):
                    item['streamHeaderHex'] = body.hex()
                sounds.append(item)
            if tag in (57, 71):
                imports.append({'timeline': name, 'tag': tag, 'payloadBytes': len(body)})
            if tag == 39:
                if len(body) < 4:
                    raise ValueError('Truncated sprite header')
                character, frames = struct.unpack_from('<HH', body)
                walk(body, 4, f'{name}/sprite:{character}', depth + 1)
            if tag == 1:
                frame += 1
        timelines.append({'timeline': name, 'tagCounts': dict(sorted(counts.items())),
                          'showFrames': counts[1]})

    walk(data, reader.pos + 4, 'root')
    return {'source': source(path, data), 'swfVersion': data[3], 'stageBoundsTwips': bounds,
            'frameRate': rate / 256, 'declaredRootFrames': declared_frames,
            'timelines': timelines, 'soundTags': sounds, 'importTags': imports}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-primary', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.verify_primary:
        for reference in PRIMARY.values():
            data = urllib.request.urlopen(reference['url'], timeout=30).read()
            if hashlib.sha256(data).hexdigest() != reference['sha256']:
                raise ValueError('Pinned primary reference hash mismatch')
    editions = {}
    for edition in ['barrack', 'woodland']:
        folder = BASE / edition
        scores = list(folder.glob('*-VWSC.bin'))
        if len(scores) != 1:
            raise ValueError('Expected one preserved score per edition')
        swfs = sorted((folder / 'media').glob('*.swf'))
        if len(swfs) != (3 if edition == 'barrack' else 1):
            raise ValueError('Unexpected preserved SWF inventory')
        editions[edition] = {'score': score_audio(scores[0]),
                             'swfs': [swf_audio(path) for path in swfs]}
    result = {'originalRuntimeExecuted': False, 'primaryReferences': PRIMARY,
              'primaryHashesVerifiedThisRun': args.verify_primary,
              'decoder': source(Path(__file__), Path(__file__).read_bytes()),
              'helperSources': [source(Path(module.__file__), Path(module.__file__).read_bytes()) for module in [SCORE, SWF]],
              'scope': 'All six preserved score frames and every root/nested sprite tag in four exported SWFs. This does not execute or prove absence of dynamic/external ActionScript audio, omitted-argument Lingo member behavior, native mixer output or continuous-footage audio.',
              'editions': editions}
    output = json.dumps(result, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output)
    print(json.dumps({'scoreFrames': {key: len(value['score']['frames']) for key, value in editions.items()},
                      'allScoreSoundChannelsZero': all(e['score']['allSoundChannelsZero'] for e in editions.values()),
                      'swfs': [{'path': s['source']['path'], 'timelines': len(s['timelines']), 'soundTags': len(s['soundTags']), 'importTags': len(s['importTags'])} for e in editions.values() for s in e['swfs']],
                      'primaryHashesVerifiedThisRun': args.verify_primary}, indent=2))


if __name__ == '__main__':
    main()
