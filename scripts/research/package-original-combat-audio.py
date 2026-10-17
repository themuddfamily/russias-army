"""Bounded static packaging of original combat samples. Never executes the original VM.
Run from the repository root. Requires ffmpeg; compressed frames are copied byte-exact,
and decoded to untrimmed float32 PCM without gain, filtering or resampling.
Observed Director encode=1 unsigned8 PCM is converted exactly by (byte-128)/128.
"""
from pathlib import Path
import hashlib, json, math, struct, subprocess

ROOT = Path.cwd()
EVIDENCE = ROOT / 'docs/research-evidence/2026-09-30'
OUTPUT = ROOT / 'public/assets/original-audio'
REFERENCE = 'https://github.com/igorlira/dirplayer-rs/blob/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/director/chunks/sound.rs'
# name: cast id Barrack/Woodland, resource id Barrack/Woodland, observed tag
ASSETS = {
    'gunfire': (142, 142, 4888, 6277, 'ediM'),
    'spas12wav': (516, 516, 4858, 6247, 'ediM'),
    'resniper': (4683, 4095, 4912, 6301, 'ediM'),
    'repistol': (2943, 2943, 4866, 6255, 'snd '),
    'reak47': (3032, 3032, 4894, 6283, 'ediM'),
    'rerg6': (3034, 3034, 4900, 6289, 'ediM'),
    'grenade1': (3031, 3031, 4876, 6265, 'ediM'),
    'offrock': (515, 515, 4852, 6241, 'ediM'),
    'boomnew': (3030, 3030, 4872, 6261, 'snd '),
    'hurt': (342, 342, 4882, 6271, 'ediM'),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def mpeg_frame(header):
    if len(header) < 4 or header[0] != 255 or header[1] & 224 != 224:
        raise ValueError('invalid MPEG sync')
    version, layer = (header[1] >> 3) & 3, (header[1] >> 1) & 3
    index, rate_index = header[2] >> 4, (header[2] >> 2) & 3
    if version not in (2, 3) or layer != 1 or index in (0, 15) or rate_index == 3:
        raise ValueError('unsupported MPEG format')
    table = ([0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0]
             if version == 3 else [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0])
    bitrate = table[index] * 1000
    rate = [44100,48000,32000][rate_index] // (1 if version == 3 else 2)
    return {'length': (144 if version == 3 else 72) * bitrate // rate + ((header[2] >> 1) & 1),
            'sample_rate': rate, 'channels': 1 if header[3] >> 6 == 3 else 2,
            'bitrate': bitrate, 'samples': 1152 if version == 3 else 576,
            'mpeg_version': 1 if version == 3 else 2, 'layer': 3}


def extract_mpeg(data):
    if len(data) < 40:
        raise ValueError('truncated media header')
    fields = struct.unpack_from('>6I', data)
    header_length = fields[0]
    prefix = {320: bytes(4), 356: bytes.fromhex('466ed577')}.get(header_length)
    if prefix is None or data[header_length:header_length + 4] != prefix:
        raise ValueError('unrecognized observed media header/prefix')
    start = header_length + 4
    position, frames = start, []
    while position < len(data):
        info = mpeg_frame(data[position:position + 4])
        if position + info['length'] > len(data) or info['sample_rate'] != fields[2] or info['channels'] != 1:
            raise ValueError('incomplete frame or media/MPEG format mismatch')
        frames.append({'source_offset': position, **info})
        position += info['length']
    if len(frames) < 2 or position != len(data):
        raise ValueError('incomplete MPEG stream')
    return data[start:], {'codec': 'mpeg_layer_iii', 'header_length': header_length,
                         'header_u32_fields': list(fields), 'post_header_prefix_hex': prefix.hex(),
                         'mpeg_start_offset': start, 'mpeg_frames': frames,
                         'sample_rate': fields[2], 'channels': 1,
                         'sample_count': sum(f['samples'] for f in frames)}


def extract_pcm(data):
    # Require the exact observed self-contained Director type2 snd bufferCmd layout.
    if len(data) < 36 or struct.unpack_from('>3H', data) != (2, 0, 1):
        raise ValueError('unexpected snd command header')
    command, parameter, offset = struct.unpack_from('>HHI', data, 6)
    if (command, parameter, offset) != (0x8051, 0, 14):
        raise ValueError('unexpected snd bufferCmd binding')
    sample_ptr, count, rate_field, loop_start, loop_end, encoding, base_frequency = struct.unpack_from('>5IBB', data, offset)
    # Here rate is the observed plain integer low word, not fixed-point high word.
    if sample_ptr != 0 or encoding != 1 or rate_field not in (11025, 5500) or count != len(data) - 36:
        raise ValueError('snd PCM header/sample-count mismatch')
    if loop_start != 0 or loop_end != 0 or base_frequency != 60 or count == 0:
        raise ValueError('unexpected snd PCM loop/base-frequency fields')
    return data[36:], {'codec': 'pcm_u8', 'snd_format_type': 2, 'reference_count': 0,
                       'command_count': 1, 'buffer_command': command, 'sound_header_offset': offset,
                       'sample_pointer': sample_ptr, 'declared_sample_count': count,
                       'sample_rate_field': rate_field, 'rate_encoding': 'Director plain integer low word',
                       'sample_rate': rate_field, 'channels': 1, 'bits_per_sample': 8,
                       'encoding': encoding, 'base_frequency': base_frequency,
                       'loop_start': loop_start, 'loop_end': loop_end,
                       'sample_start_offset': 36, 'sample_count': count}


def write_float_wav(path, rate, raw_pcm):
    payload = b''.join(struct.pack('<f', (value - 128) / 128) for value in raw_pcm)
    # WAVE_FORMAT_IEEE_FLOAT; one fact chunk gives the exact sample count.
    fmt = struct.pack('<HHIIHH', 3, 1, rate, rate * 4, 4, 32)
    body = b'WAVEfmt ' + struct.pack('<I', len(fmt)) + fmt
    body += b'fact' + struct.pack('<II', 4, len(raw_pcm))
    body += b'data' + struct.pack('<I', len(payload)) + payload
    path.write_bytes(b'RIFF' + struct.pack('<I', len(body)) + body)


def verify_wav(path, rate, sample_count):
    data = path.read_bytes()
    if data[:4] != b'RIFF' or data[8:12] != b'WAVE' or struct.unpack_from('<I', data, 4)[0] + 8 != len(data):
        raise ValueError('invalid WAV container')
    position, sample_payload, fmt = 12, None, None
    while position + 8 <= len(data):
        tag, length = struct.unpack_from('<4sI', data, position)
        position += 8
        if position + length > len(data):
            raise ValueError('invalid WAV chunk')
        if tag == b'fmt ':
            fmt = struct.unpack_from('<HHIIHH', data, position)
        if tag == b'data':
            sample_payload = data[position:position + length]
        position += length + (length & 1)
    if position != len(data) or fmt != (3, 1, rate, rate * 4, 4, 32):
        raise ValueError('WAV format mismatch')
    if sample_payload is None or len(sample_payload) != sample_count * 4:
        raise ValueError('WAV sample count differs from complete source frames/PCM')
    samples = struct.unpack(f'<{sample_count}f', sample_payload)
    if not all(math.isfinite(value) for value in samples) or not any(value != 0 for value in samples):
        raise ValueError('nonfinite or empty PCM')
    return {'file': path.name, 'sha256': digest(data), 'bytes': len(data), 'codec': 'pcm_f32le',
            'sample_rate': rate, 'channels': 1, 'sample_count': sample_count,
            'untrimmed_duration_seconds': sample_count / rate,
            'finite_nonempty_pcm_verified': True, 'peak_absolute_sample': max(abs(value) for value in samples)}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    version = subprocess.run(['ffmpeg', '-version'], check=True, capture_output=True, text=True, timeout=10).stdout.splitlines()[0]
    assets = {}
    for name, (cast_b, cast_w, resource_b, resource_w, tag) in ASSETS.items():
        sources, decoded = [], []
        for edition, cast_id, resource_id, movie in [
            ('barrack', cast_b, resource_b, 'russiasarmy-barrack-20110415.dcr'),
            ('woodland', cast_w, resource_w, 'russiasarmy-woodland-20150618.dcr')]:
            folder = EVIDENCE / 'director-extraction' / edition
            index = json.loads((folder / 'cast-media-index.json').read_text())
            inventory = json.loads((folder / 'inventory.json').read_text())
            cast = next(c for c in index['cast_members'] if c['name'] == name)
            if cast['id'] != cast_id or cast['member_type'] != 6:
                raise ValueError('unexpected sound cast')
            if not any(l['parent'] == cast_id and l['child'] == resource_id and l['tag'] == tag for l in index['key_links']):
                raise ValueError('sound KEY binding missing')
            resource = next(r for r in inventory['resources'] if r['id'] == resource_id)
            path = folder / resource['filename']
            if path.stat().st_size > 1024 * 1024 or resource['tag'] != tag:
                raise ValueError('oversized or mismatched source')
            raw = path.read_bytes()
            if len(raw) != resource['output_size'] or digest(raw) != resource['sha256']:
                raise ValueError('source inventory mismatch')
            payload, info = extract_mpeg(raw) if tag == 'ediM' else extract_pcm(raw)
            movie_path = EVIDENCE / 'payload-variants' / movie
            info.update(edition=edition, cast_id=cast_id, cast_name=name, resource_id=resource_id,
                        resource_tag=tag, resource_path=str(path.relative_to(ROOT)), resource_sha256=digest(raw),
                        source_movie=str(movie_path.relative_to(ROOT)), source_movie_sha256=digest(movie_path.read_bytes()))
            sources.append(info)
            decoded.append((raw, payload))
        if decoded[0] != decoded[1]:
            raise ValueError(f'{name}: edition bodies differ; require separate explicit exports')
        info = sources[0]
        wav_path = OUTPUT / f'{name}.wav'
        record = {'sources': sources, 'identical_edition_resource_bodies': True}
        if tag == 'ediM':
            mp3_path = OUTPUT / f'{name}.mp3'
            mp3_path.write_bytes(decoded[0][1])
            subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-f', 'mp3', '-i', str(mp3_path),
                            '-map', '0:a:0', '-c:a', 'pcm_f32le', '-map_metadata', '-1',
                            '-fflags', '+bitexact', '-flags:a', '+bitexact', '-y', str(wav_path)], check=True, timeout=30)
            record['mp3'] = {'file': mp3_path.name, 'sha256': digest(mp3_path.read_bytes()),
                             'bytes': mp3_path.stat().st_size, 'transformation': 'byte-exact complete frame copy; no re-encoding'}
        else:
            pcm_path = OUTPUT / f'{name}.pcm'
            pcm_path.write_bytes(decoded[0][1])
            write_float_wav(wav_path, info['sample_rate'], decoded[0][1])
            record['pcm'] = {'file': pcm_path.name, 'sha256': digest(pcm_path.read_bytes()),
                             'bytes': pcm_path.stat().st_size, 'codec': 'pcm_u8',
                             'transformation': 'byte-exact declared sample copy; WAV conversion (byte-128)/128 is exactly representable'}
        record['wav'] = verify_wav(wav_path, info['sample_rate'], info['sample_count'])
        assets[name] = record
    manifest = {'schema_version': 1, 'game_executed': False, 'audio_played': False,
                'decoder_script': str(Path(__file__).relative_to(ROOT)), 'decoder_script_sha256': digest(Path(__file__).read_bytes()),
                'decoder': version, 'format_references': [REFERENCE], 'assets': assets,
                'limits': ['No original VM, scripts or movie execution.',
                           'Original MPEG compression remains lossy; pre-compression PCM is unavailable.',
                           'Media prefixes and encoder/Director trim fields are recorded, not interpreted as scheduling.',
                           'All decoded frames/samples retained; no resampling, gain adjustment, filtering or lossy re-encoding.',
                           'Native device mixing, channel timing and perceived output have not been measured.']}
    (OUTPUT / 'combat-provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({name: record['wav'] for name, record in assets.items()}, indent=2))


if __name__ == '__main__':
    main()
