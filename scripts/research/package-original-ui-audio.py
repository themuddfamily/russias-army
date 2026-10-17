#!/usr/bin/env python3
"""Package preserved UI DefineSound data; static tags/media only, no VM execution.

ADPCM layout: Adobe SWF v19 pp177–187. Independently reconstruct bounded
mono samples and compare every PCM byte against the installed FFmpeg decoder.
The sound-rate code maps to 5512 Hz in Adobe's explicit rate table and FFmpeg.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, json, struct, subprocess, tempfile, wave

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/research-evidence/2026-09-30/director-extraction'
OUT = ROOT / 'public/assets/original-audio'
spec = importlib.util.spec_from_file_location('bounded_tags', ROOT / 'scripts/research/extract-original-hurt-overlay.py')
SWF = importlib.util.module_from_spec(spec)
spec.loader.exec_module(SWF)
STEP = [7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767]
INDEX = {2: [-1,2], 3: [-1,-1,2,4], 4: [-1,-1,-1,-1,2,4,6,8], 5: [-1,-1,-1,-1,-1,-1,-1,-1,1,2,4,6,8,10,13,16]}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def record(path):
    data = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': sha(data)}


def inventory(path):
    raw = path.read_bytes()
    if len(raw) > 8 * 1024 * 1024 or raw[:3] != b'FWS' or struct.unpack_from('<I', raw, 4)[0] != len(raw):
        raise ValueError('Expected bounded exact FWS container')
    bits = SWF.Bits(raw, 8)
    stage = bits.rect()
    rate, frames = struct.unpack_from('<HH', raw, bits.pos)
    start = bits.pos + 4
    sounds, starts, others = [], [], []

    def walk(data, offset, timeline, depth=0):
        if depth > 32:
            raise ValueError('Excessive sprite nesting')
        frame = 1
        for tag, body in SWF.tags(data, offset):
            meta = {'timeline': timeline, 'frame': frame, 'tag': tag, 'bodyBytes': len(body), 'bodySha256': sha(body)}
            if tag == 14:
                if len(body) < 8:
                    raise ValueError('Truncated DefineSound')
                sound_id, flags, count = struct.unpack_from('<HBI', body)
                sounds.append((body, {**meta, 'soundId': sound_id, 'flagsHex': f'{flags:02x}', 'format': flags >> 4, 'rateCode': (flags >> 2) & 3, 'sizeFlag': (flags >> 1) & 1, 'channels': 1 + (flags & 1), 'sampleCount': count, 'headerHex': body[:7].hex(), 'soundDataBytes': len(body) - 7, 'soundDataSha256': sha(body[7:])}))
            if tag == 15:
                if len(body) < 3:
                    raise ValueError('Truncated StartSound')
                sound_id, flags = struct.unpack_from('<HB', body)
                pos = 3
                info = {'soundId': sound_id, 'flagsHex': f'{flags:02x}', 'syncStop': bool(flags & 32), 'syncNoMultiple': bool(flags & 16), 'rawHex': body.hex()}
                if flags & 192:
                    raise ValueError('Reserved SOUNDINFO flags')
                for bit, name, fmt in [(1,'inPoint','<I'), (2,'outPoint','<I'), (4,'loopCount','<H')]:
                    if flags & bit:
                        info[name] = struct.unpack_from(fmt, body, pos)[0]
                        pos += struct.calcsize(fmt)
                if flags & 8:
                    count = body[pos]
                    pos += 1
                    info['envelopes'] = []
                    for _ in range(count):
                        position, left, right = struct.unpack_from('<IHH', body, pos)
                        pos += 8
                        info['envelopes'].append({'position44': position, 'leftLevel': left, 'rightLevel': right})
                if pos != len(body):
                    raise ValueError('SOUNDINFO length mismatch')
                starts.append({**meta, **info})
            if tag in (17,18,19,45,89):
                meta['rawHex'] = body.hex()
                if tag in (18,45):
                    if len(body) < 4:
                        raise ValueError('Truncated sound stream header')
                    playback, stream, count = struct.unpack_from('<BBH', body)
                    meta.update(playbackRateCode=(playback >> 2) & 3,
                                playbackSizeFlag=(playback >> 1) & 1,
                                playbackChannels=1 + (playback & 1),
                                streamFormat=stream >> 4,
                                streamRateCode=(stream >> 2) & 3,
                                streamSizeFlag=(stream >> 1) & 1,
                                streamChannels=1 + (stream & 1),
                                streamSamplesPerFrame=count)
                others.append(meta)
            if tag == 39:
                character, _ = struct.unpack_from('<HH', body)
                walk(body, 4, f'{timeline}/sprite:{character}', depth + 1)
            if tag == 1:
                frame += 1
    walk(raw, start, 'root')
    return raw, raw[8:start], sounds, starts, others, {'swfVersion': raw[3], 'stageBoundsTwips': stage, 'frameRate': rate / 256, 'declaredRootFrames': frames}


def decode(data, sample_count):
    if not 0 < sample_count < 4_000_000:
        raise ValueError('Unbounded sample count')
    reader = SWF.Bits(data)
    width = reader.u(2) + 2
    pcm = bytearray()
    packets = 0
    while len(pcm) // 2 < sample_count:
        predictor, index = reader.s(16), reader.u(6)
        if index > 88:
            raise ValueError('Invalid initial step index')
        pcm.extend(struct.pack('<h', predictor))
        packets += 1
        codes = min(4095, sample_count - len(pcm) // 2)
        for _ in range(codes):
            code = reader.u(width)
            magnitude = code & ((1 << (width - 1)) - 1)
            step = STEP[index]
            difference = 0
            for shift in range(width - 2, -1, -1):
                if magnitude & (1 << shift):
                    difference += step
                step >>= 1
            difference += step
            predictor += -difference if code & (1 << (width - 1)) else difference
            predictor = min(32767, max(-32768, predictor))
            index = min(88, max(0, index + INDEX[width][magnitude]))
            pcm.extend(struct.pack('<h', predictor))
    remaining = len(data) * 8 - reader.bit
    if remaining > 7 or (remaining and reader.u(remaining) != 0):
        raise ValueError('Unexpected trailing ADPCM data')
    return bytes(pcm), {'codeBits': width, 'packets': packets, 'paddingBits': remaining}


def tag(code, body):
    return struct.pack('<HI', (code << 6) | 63, len(body)) + body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect-only', action='store_true')
    args = parser.parse_args()
    editions = []
    extracted = []
    for edition, cast_id, resource_id in [('barrack',4527,5118), ('woodland',5760,6525)]:
        folder = BASE / edition
        path = folder / 'media/original-ui.swf'
        raw, header, sounds, starts, others, info = inventory(path)
        resource = folder / f'{resource_id:05d}-XMED.bin'
        resource_data = resource.read_bytes()
        if resource_data[12:] != raw:
            raise ValueError('UI SWF does not match preserved XMED payload')
        index = json.loads((folder / 'cast-media-index.json').read_text())
        cast = next(c for c in index['cast_members'] if c['id'] == cast_id)
        if cast['name'] != 'UI' or not any(link['parent'] == cast_id and link['child'] == resource_id and link['tag'] == 'XMED' for link in index['key_links']):
            raise ValueError('UI cast/resource binding mismatch')
        if len(sounds) != 1 or len(starts) != 1 or len(others) != 32 or any(x['tag'] != 45 or x['rawHex'] != '02000000' for x in others):
            raise ValueError('Unexpected UI sound inventory')
        body, sound = sounds[0]
        if (sound['soundId'], sound['format'], sound['rateCode'], sound['channels'], sound['sampleCount']) != (13,1,0,1,1264176):
            raise ValueError('Unexpected UI sound encoding')
        if starts[0]['rawHex'] != '0d0004ffff':
            raise ValueError('Unexpected source sound start/loop settings')
        extracted.append((body, header, raw[3]))
        editions.append({'edition': edition, 'swf': record(path), 'resource': record(resource), 'castId': cast_id, 'castName': 'UI', **info, 'defineSounds': [sound], 'startSounds': starts, 'otherSoundTags': others})
    if extracted[0][0] != extracted[1][0]:
        raise ValueError('Edition sound payloads differ')
    if args.inspect_only:
        print(json.dumps({'originalRuntimeExecuted': False, 'editions': editions}, indent=2))
        return
    body, header, version = extracted[0]
    payload = body[7:]
    pcm, decoding = decode(payload, 1264176)
    # Synthetic data-only SWF: the exact audio tag, container header, End.
    # No ActionScript, sprite, StartSound or original movie is passed to FFmpeg.
    media_body = header + tag(14, body) + b'\0\0'
    media = b'FWS' + bytes([version]) + struct.pack('<I', 8 + len(media_body)) + media_body
    with tempfile.TemporaryDirectory(prefix='ui-static-adpcm-') as temporary:
        input_path = Path(temporary) / 'sound-only.swf'
        output_path = Path(temporary) / 'crosscheck.pcm'
        input_path.write_bytes(media)
        command = ['ffmpeg','-v','error','-nostdin','-threads','1','-f','swf','-i',str(input_path),'-map','0:a:0','-c:a','pcm_s16le','-f','s16le','-threads','1','-y',str(output_path)]
        subprocess.run(command, check=True, timeout=30)
        crosscheck = output_path.read_bytes()
        # FFmpeg's SWF decoder consumes all complete codes in the final byte,
        # including zero padding, rather than the DefineSound sample count.
        expected_extra = decoding['paddingBits'] // decoding['codeBits']
        if crosscheck[:len(pcm)] != pcm or len(crosscheck) != len(pcm) + expected_extra * 2:
            raise ValueError(f'Independent/FFmpeg PCM disagreement: {len(pcm)} vs {len(crosscheck)} bytes')
    OUT.mkdir(parents=True, exist_ok=True)
    files = {'defineSound': ('ui-theme.definesound',body), 'adpcm': ('ui-theme.adpcm',payload), 'pcm': ('ui-theme.pcm',pcm)}
    for name, data in files.values():
        (OUT / name).write_bytes(data)
    wav_path = OUT / 'ui-theme.wav'
    with wave.open(str(wav_path),'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(5512)
        output.writeframes(pcm)
    with wave.open(str(wav_path),'rb') as check:
        if (check.getnchannels(), check.getsampwidth(), check.getframerate(), check.getnframes(), check.readframes(1264176)) != (1,2,5512,1264176,pcm):
            raise ValueError('WAV round-trip mismatch')
    samples = struct.unpack('<1264176h',pcm)
    if not any(samples):
        raise ValueError('Unexpected silent-only UI audio')
    files['wav'] = ('ui-theme.wav',wav_path.read_bytes())
    ffmpeg_version = subprocess.run(['ffmpeg','-version'],check=True,capture_output=True,text=True,timeout=10).stdout.splitlines()[0]
    result = {'schemaVersion': 1, 'originalRuntimeExecuted': False, 'decoderScript': record(Path(__file__)), 'parserHelper': record(Path(SWF.__file__)), 'identicalEditionSoundPayloads': True, 'sources': editions, 'decoding': {**decoding, 'codec': 'ADPCM_SWF', 'pcmCodec': 'signed16LittleEndian', 'channels': 1, 'sampleRate': 5512, 'sampleCount': 1264176, 'durationSeconds': 1264176 / 5512, 'minimumSample': min(samples), 'maximumSample': max(samples), 'crossvalidation': {'decoder': ffmpeg_version, 'allDeclaredSamplePcmBytesEqual': True, 'declaredSamplePcmSha256': sha(crosscheck[:len(pcm)]), 'ffmpegOutputSampleCount': len(crosscheck) // 2, 'ffmpegPaddingOnlyExtraSamples': expected_extra, 'ffmpegPaddingOnlyExtraSamplesHex': crosscheck[len(pcm):].hex(), 'ffmpegUntrimmedPcmSha256': sha(crosscheck), 'dataOnlyContainerSha256': sha(media), 'originalScriptsPassedToDecoder': False}}, 'assets': {key: {'file': name, 'bytes': len(data), 'sha256': sha(data)} for key,(name,data) in files.items()}, 'rateInterpretation': 'Adobe v19 explicit rate table lists 5512 Hz and FFmpeg uses integer 44100 >> 3. Adobe also describes one-eighth of 44100 (5512.5); historical native clock has not been measured. WAV uses explicit 5512 Hz mapping without rate conversion or sample duplication.', 'sourcePlayback': {'rootFrame': 2, 'soundId': 13, 'startSoundRawHex': '0d0004ffff', 'loopCount': 65535, 'syncStop': False, 'syncNoMultiple': False, 'inPointSpecified': False, 'outPointSpecified': False, 'envelopeSpecified': False}, 'transformations': ['DefineSound body and ADPCM payload copied byte-exact.', 'Bounded independent ADPCM decode, byte-exact declared-sample crossvalidation against FFmpeg; its two padding-only extra samples excluded using the exact DefineSound count.', 'PCM samples unchanged in minimal lossless integer-rate WAV; no filtering, gain, removal of declared samples, lossy encoding or authored music.'], 'limits': ['ADPCM source was already lossy; pre-encoding PCM is not recovered.', 'Static StartSound metadata does not prove dynamic mute, stop, scene or timeline scheduling.', 'Playback/gain/mixing and the native half-Hz rate ambiguity remain unverified.', 'The filename ui-theme identifies embedded UI audio; musical classification is not proved by tags.'], 'primaryReferences': ['https://open-flash.github.io/mirrors/swf-spec-19.pdf', 'https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavformat/swfdec.c', 'https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavcodec/adpcm.c']}
    (OUT / 'ui-provenance.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'wav': str(wav_path.relative_to(ROOT)), 'sampleCount': 1264176, 'sampleRate': 5512, 'pcmSha256': sha(pcm), 'allDeclaredSamplePcmBytesEqual': True, 'ffmpegPaddingOnlyExtraSamples': expected_extra}))


if __name__ == '__main__':
    main()
