"""Read-only bounded Afterburner resource extraction; never loads a Director VM.

Format reference: ScummVM engines/director/archive.cpp readAfterburnerMap and
getResource, https://github.com/scummvm/scummvm/blob/master/engines/director/archive.cpp
Independent Python implementation for research. Outputs are raw resource data,
not decoded images, playable movies or decompiled Lingo.
"""
from pathlib import Path
import argparse, collections, hashlib, json, re, struct, zlib

CAP=64*1024*1024
class Reader:
    def __init__(self,data,endian='<'): self.data=data;self.pos=0;self.endian=endian
    def take(self,n):
        if n<0 or self.pos+n>len(self.data): raise ValueError('truncated input')
        b=self.data[self.pos:self.pos+n];self.pos+=n;return b
    def tag(self):
        b=self.take(4);return (b[::-1] if self.endian=='<' else b).decode('ascii')
    def var(self):
        v=0
        for _ in range(5):
            b=self.take(1)[0];v=(v<<7)|(b&127)
            if not b&128: return v
        raise ValueError('oversized varint')
    def uint(self,n): return int.from_bytes(self.take(n),'little' if self.endian=='<' else 'big')

def inflate(data,expected=None):
    if expected is not None and expected>CAP: raise ValueError('resource exceeds cap')
    dec=zlib.decompressobj();out=dec.decompress(data,CAP+1)
    if len(out)>CAP or dec.unconsumed_tail or not dec.eof: raise ValueError('invalid/oversized zlib')
    if expected is not None and len(out)!=expected: raise ValueError(f'inflated size {len(out)} != {expected}')
    return out

def extract(path,outdir):
    data=path.read_bytes();r=Reader(data,'<' if data[:4]==b'XFIR' else '>')
    if data[:4] not in [b'XFIR',b'RIFX']: raise ValueError('not Director')
    r.pos=4
    if r.uint(4)+8!=len(data): raise ValueError('container size mismatch')
    if r.tag()!='FGDM': raise ValueError('not Afterburner movie')
    if r.tag()!='Fver': raise ValueError('missing Fver')
    versiondata=r.take(r.var());v=Reader(versiondata,r.endian)
    version=v.var();meta={'afterburner_version':version}
    if version>=0x401: meta.update(imap_version=v.var(),director_version=v.var())
    if version>=0x501: meta['director_version_string']=v.take(v.uint(1)).decode('ascii')
    if r.tag()!='Fcdr': raise ValueError('missing Fcdr')
    codecs=Reader(inflate(r.take(r.var())),r.endian);codec_count=codecs.uint(2)
    if codec_count>128: raise ValueError('too many codecs')
    guids=[codecs.take(16).hex() for _ in range(codec_count)]
    if r.tag()!='ABMP': raise ValueError('missing ABMP')
    length=r.var();end=r.pos+length;compression=r.var();size=r.var()
    tabledata=inflate(r.take(end-r.pos),size);table=Reader(tabledata,r.endian)
    unknown=[table.var(),table.var()];count=table.var()
    if count>100000: raise ValueError('too many resources')
    resources={}
    for _ in range(count):
        rid,offset,packed,unpacked,codec=[table.var() for _ in range(5)]
        if offset>=0x80000000: offset-=0x100000000
        tag=table.tag()
        if rid in resources or packed>CAP or unpacked>CAP: raise ValueError('invalid entry')
        resources[rid]={'id':rid,'tag':tag,'offset':offset,'packed_size':packed,'unpacked_size':unpacked,'codec':codec}
    if table.pos!=len(tabledata): raise ValueError('map trailing data')
    if r.tag()!='FGEI': raise ValueError('missing FGEI')
    ils_unknown=r.var();body=r.pos;ils=resources[2]
    initial=Reader(inflate(r.take(ils['packed_size']),ils['unpacked_size']),r.endian)
    initial_data={}
    while initial.pos<len(initial.data):
        rid=initial.var();initial_data[rid]=initial.take(resources[rid]['packed_size'])
    outdir.mkdir(parents=True,exist_ok=True)
    total=0;errors=[]
    for rid,res in resources.items():
        if rid<3: continue
        try:
            if res['offset']==-1: payload=initial_data[rid]
            else:
                start=body+res['offset'];end=start+res['packed_size']
                if start<body or end>len(data): raise ValueError('resource outside file')
                payload=data[start:end]
                # Actual zlib streams are recognized structurally, not by size alone.
                # Keep JPEG/SWA/null/font payloads verbatim unless the zlib codec matches.
                guid=guids[res['codec']] if res['codec']<len(guids) else ''
                zlib_codec=guid.startswith('04e999ac7000360b') or guid.startswith('ac99e90400700b36')
                if res['packed_size']!=res['unpacked_size'] and zlib_codec:
                    payload=inflate(payload,res['unpacked_size']);res['inflated']=True
            total+=len(payload)
            if total>256*1024*1024: raise ValueError('aggregate output cap')
            filename=f"{rid:05d}-{re.sub('[^A-Za-z0-9_-]','_',res['tag'])}.bin"
            (outdir/filename).write_bytes(payload)
            res.update(filename=filename,output_size=len(payload),sha256=hashlib.sha256(payload).hexdigest())
        except (ValueError,KeyError,zlib.error) as e:
            errors.append({'id':rid,'error':str(e)})
    result={'input':str(path),'input_size':len(data),'input_sha256':hashlib.sha256(data).hexdigest(),
        'format_reference':'https://github.com/scummvm/scummvm/blob/master/engines/director/archive.cpp',
        'game_executed':False,'metadata':meta,'codec_guids':guids,'map_unknown':unknown,'map_codec':compression,
        'ils_unknown':ils_unknown,'resource_count':count,'tag_counts':dict(collections.Counter(x['tag'] for x in resources.values())),
        'extracted_bytes':total,'resources':list(resources.values()),'errors':errors}
    (outdir/'inventory.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['input','metadata','resource_count','tag_counts','extracted_bytes','errors']},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    extract(a.input,a.output)
