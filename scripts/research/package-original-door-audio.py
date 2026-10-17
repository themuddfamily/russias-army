"""Static original door audio packaging. Never executes Director/Lingo/Flash.

Director media header interpretation reference:
https://github.com/igorlira/dirplayer-rs/blob/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/director/chunks/media.rs
MPEG frame validation follows documented header fields, not a player runtime.
The stored MP3 is copied without re-encoding; FFmpeg decodes an untrimmed float32
PCM WAV with no resampling, filtering, gain change or added lossy compression.
This does not recover pre-MP3 PCM or establish historical encoder-padding trim.
Requires ffmpeg and ffprobe. Run from repository root.
"""
from pathlib import Path
import hashlib, json, struct, subprocess

ROOT = Path.cwd()
EVIDENCE = ROOT / 'docs/research-evidence/2026-09-30'
OUTPUT = ROOT / 'public/assets/original-audio'
MAX_INPUT = 1024 * 1024

def digest(data):
    return hashlib.sha256(data).hexdigest()

def frame(header):
    if len(header) < 4 or header[0] != 255 or header[1] & 224 != 224:
        return None
    version = (header[1] >> 3) & 3
    layer = (header[1] >> 1) & 3
    index = header[2] >> 4
    rate_index = (header[2] >> 2) & 3
    if version != 2 or layer != 1 or index in (0, 15) or rate_index == 3:
        return None
    bitrate = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0][index] * 1000
    rate = [44100,48000,32000][rate_index] // 2
    channels = 1 if header[3] >> 6 == 3 else 2
    return {'length': 72 * bitrate // rate + ((header[2] >> 1) & 1), 'sample_rate': rate, 'channels': channels, 'bitrate': bitrate, 'samples': 576}

def extract(path):
    if path.stat().st_size > MAX_INPUT:
        raise ValueError('oversized original sound')
    data = path.read_bytes()
    if len(data) < 40:
        raise ValueError('truncated Director media header')
    fields = struct.unpack_from('>6I', data)
    header_length = fields[0]
    if header_length < 40 or header_length >= len(data):
        raise ValueError('invalid Director header length')
    # These preserved payloads have a four-byte zero prefix after the header.
    # Require the observed prefix exactly, rather than scan arbitrary bytes.
    if data[header_length:header_length + 4] != b'\0' * 4:
        raise ValueError('unrecognized post-header prefix')
    start = header_length + 4
    position = start
    frames = []
    while position < len(data):
        info = frame(data[position:position + 4])
        if not info or position + info['length'] > len(data):
            raise ValueError(f'invalid complete MPEG frame at {position}')
        if info['sample_rate'] != fields[2] or info['channels'] != 1:
            raise ValueError('MPEG/Director metadata disagreement')
        frames.append({'source_offset': position, **info})
        position += info['length']
    if len(frames) < 2 or position != len(data):
        raise ValueError('incomplete MPEG stream')
    return data, data[start:], {'header_length': header_length, 'header_u32_fields': list(fields), 'post_header_zero_prefix_bytes': 4, 'mpeg_start_offset': start, 'mpeg_frames': frames}

sources = [('barrack', 4846, 'russiasarmy-barrack-20110415.dcr'), ('woodland', 6235, 'russiasarmy-woodland-20150618.dcr')]
extracted = []
for edition, resource, movie in sources:
    folder = EVIDENCE / 'director-extraction' / edition
    index = json.loads((folder / 'cast-media-index.json').read_text())
    cast = next(c for c in index['cast_members'] if c['name'] == 'door')
    if cast['id'] != 3680 or cast['member_type'] != 6:
        raise ValueError('unexpected original door cast')
    if not any(link['parent'] == cast['id'] and link['child'] == resource and link['tag'] == 'ediM' for link in index['key_links']):
        raise ValueError('original door resource binding missing')
    path = folder / f'{resource:05d}-ediM.bin'
    raw, mp3, info = extract(path)
    extracted.append((raw, mp3))
    movie_path = EVIDENCE / 'payload-variants' / movie
    info.update(edition=edition, cast_id=3680, cast_name='door', resource_id=resource, resource_path=str(path.relative_to(ROOT)), resource_sha256=digest(raw), source_movie=str(movie_path.relative_to(ROOT)), source_movie_sha256=digest(movie_path.read_bytes()))
    if edition == 'barrack': provenance_sources = [info]
    else: provenance_sources.append(info)
if extracted[0] != extracted[1]:
    raise ValueError('edition sound payloads differ; separate exports required')
OUTPUT.mkdir(parents=True, exist_ok=True)
mp3_path = OUTPUT / 'door.mp3'
wav_path = OUTPUT / 'door.wav'
mp3_path.write_bytes(extracted[0][1])
command = ['ffmpeg', '-v', 'error', '-nostdin', '-f', 'mp3', '-i', str(mp3_path), '-map', '0:a:0', '-c:a', 'pcm_f32le', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-y', str(wav_path)]
subprocess.run(command, check=True, timeout=30)
probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate,channels,duration,codec_name,bits_per_sample', '-of', 'json', str(wav_path)], check=True, capture_output=True, text=True, timeout=10)
streams = json.loads(probe.stdout)['streams']
if len(streams) != 1 or streams[0]['codec_name'] != 'pcm_f32le' or streams[0]['sample_rate'] != '16000' or streams[0]['channels'] != 1:
    raise ValueError('decoded WAV format changed')
# Independently inspect RIFF chunk lengths and exact PCM sample count.
wav = wav_path.read_bytes()
if wav[:4] != b'RIFF' or wav[8:12] != b'WAVE' or struct.unpack_from('<I', wav, 4)[0] + 8 != len(wav):
    raise ValueError('invalid WAV container')
pos = 12
sample_bytes = None
while pos + 8 <= len(wav):
    tag, length = struct.unpack_from('<4sI', wav, pos); pos += 8
    if pos + length > len(wav): raise ValueError('invalid WAV chunk')
    if tag == b'data': sample_bytes = length
    pos += length + (length & 1)
expected_samples = sum(f['samples'] for f in provenance_sources[0]['mpeg_frames'])
if sample_bytes != expected_samples * 4:
    raise ValueError('decoded sample count does not match complete MPEG frames')
version = subprocess.run(['ffmpeg', '-version'], check=True, capture_output=True, text=True, timeout=10).stdout.splitlines()[0]
manifest = {'schema_version': 1, 'game_executed': False, 'decoder_script': 'scripts/research/package-original-door-audio.py', 'decoder_script_sha256': digest(Path(__file__).read_bytes()), 'decoder': version, 'sources': provenance_sources, 'identical_edition_payloads': True, 'mp3': {'file': 'door.mp3', 'sha256': digest(mp3_path.read_bytes()), 'bytes': mp3_path.stat().st_size, 'transformation': 'byte-exact consecutive MPEG frame copy from source offset324; no re-encoding'}, 'wav': {'file': 'door.wav', 'sha256': digest(wav), 'bytes': len(wav), 'codec': 'pcm_f32le', 'sample_rate': 16000, 'channels': 1, 'sample_count': expected_samples, 'untrimmed_duration_seconds': expected_samples / 16000, 'transformation': 'static FFmpeg decode, float32 PCM, no resampling/gain/filtering/lossy re-encoding'}, 'limits': ['Source MPEG compression was already lossy; pre-encoding PCM is not recovered.', 'Director header timing/trim fields and encoder delay/padding are not fully interpreted; output retains all decoded frame samples.', 'Decoded transport duration is not claimed to equal historical scheduled playback duration.', 'Neither original movie/VM nor audio playback was used.'], 'format_references': ['https://github.com/igorlira/dirplayer-rs/blob/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/director/chunks/media.rs', 'https://github.com/igorlira/dirplayer-rs/blob/68376fbb4494a6bbad4c70081ecdcb99814a74c9/vm-rust/src/director/chunks/sound.rs', 'https://ffmpeg.org/ffmpeg.html']}
(OUTPUT / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'file': str(wav_path.relative_to(ROOT)), 'source_editions_equal': True, 'mpeg_frames': len(provenance_sources[0]['mpeg_frames']), 'sample_count': expected_samples, 'untrimmed_duration_seconds': expected_samples / 16000, 'wav_sha256': digest(wav)}))
