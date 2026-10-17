#!/usr/bin/env python3
"""Passively decode bounded SWF timeline/action records; never execute actions."""
from pathlib import Path
import argparse, hashlib, importlib.util, json, struct
ROOT=Path(__file__).resolve().parents[2]
DOC=ROOT/'docs/research-evidence/2026-10-01/ORIGINAL_RESULT_TIMELINES.md'
spec=importlib.util.spec_from_file_location('result_artwork',ROOT/'scripts/research/extract-original-result-ui.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
sha=lambda b:hashlib.sha256(b).hexdigest()
NAMES={0:'End',4:'NextFrame',5:'PreviousFrame',6:'Play',7:'Stop',0x1c:'GetVariable',0x4f:'SetMember',0x81:'GotoFrame',0x8b:'SetTarget',0x8c:'GotoLabel',0x96:'Push',0x9f:'GotoFrame2'}

def actions(body):
    result=[];p=0
    while p<len(body):
        start=p;code=body[p];p+=1;payload=b''
        if code>=128:
            if p+2>len(body):raise ValueError('Action length header')
            n=struct.unpack_from('<H',body,p)[0];p+=2
            if p+n>len(body):raise ValueError('Action body bounds')
            payload=body[p:p+n];p+=n
        item=dict(offset=start,code=code,name=NAMES.get(code,'Opaque'),payloadBytes=len(payload),payloadHex=payload.hex())
        if code==0x96:
            q=0;values=[]
            while q<len(payload):
                kind=payload[q];q+=1
                if kind!=0:raise ValueError('Unexpected nonstring Push in bounded evidence')
                end=payload.index(0,q);values.append(payload[q:end].decode('utf-8'));q=end+1
            item['strings']=values
        elif code in (0x8b,0x8c):
            if not payload or payload[-1]!=0 or 0 in payload[:-1]:raise ValueError('Action string')
            item['string']=payload[:-1].decode('utf-8')
        elif code==0x81:
            if len(payload)!=2:raise ValueError('GotoFrame length')
            item['rawFrameIndex']=struct.unpack('<H',payload)[0]
        result.append(item)
        if code==0:
            if p!=len(body):raise ValueError('Bytes after End action')
            return result
    raise ValueError('Missing End action')

def action_timeline(records):
    frame=1;labels=[];programs=[]
    for tag,body in records:
        if tag==1:frame+=1
        elif tag==43:
            if not body or body[-1]!=0:raise ValueError('Frame label')
            labels.append(dict(frame=frame,name=body[:-1].decode('utf-8')))
        elif tag==12:programs.append(dict(frame=frame,tag=tag,bytes=len(body),sha256=sha(body),hex=body.hex(),records=actions(body)))
        elif tag in (59,72,82):raise ValueError('Unsupported executable tag in bounded timeline')
    return dict(labels=labels,programs=programs)

def audit():
    editions={}
    for edition,resource,cast in [('barrack',5118,4527),('woodland',6525,5760)]:
        art=helper.Artwork(edition,resource,cast);raw=(helper.BASE/edition/f'{resource:05d}-XMED.bin').read_bytes()[12:];r=helper.Bits(raw,8);r.rect();records=list(helper.tags(raw,r.pos+4))
        root=action_timeline(records);scroll=art.decode(84);replay=art.decode(88)
        scroll_events=action_timeline(list(helper.tags(art.defs[84][1],4)));replay_events=action_timeline(list(helper.tags(art.defs[88][1],4)))
        positions=[]
        for i,frame in enumerate(scroll['frames'],1):
            if set(frame)!={1,2,3} or frame[2]['clipDepth']!=5 or frame[1]['characterId']!=36 or frame[2]['characterId']!=36:raise ValueError('Scroll layer/mask changes')
            p=frame[3]
            if p['matrix'][:4]!=[1,0,0,1] or p['matrix'][5]!=.05 or p['colorTransform']!=helper.IDENTITY:raise ValueError('Unexpected scroll transforms')
            positions.append(dict(frame=i,characterId=p['characterId'],matrix=p['matrix'],ratio=p['ratio']))
        if [p['characterId'] for p in positions]!=[83]*799+[39]:raise ValueError('Scroll final-character switch')
        poses=[]
        for i,frame in enumerate(replay['frames'],1):
            if set(frame)!={1}:raise ValueError('Replay layer changes')
            p=frame[1]
            if p['matrix']!=[1,0,0,1,0,0] or p['colorTransform']!=helper.IDENTITY:raise ValueError('Replay transforms')
            poses.append(dict(frame=i,characterId=p['characterId'],ratio=p['ratio']))
        buttons={}
        for cid in (91,96):
            body=art.defs[cid][1];offset=struct.unpack_from('<H',body,3)[0];pos=3+offset;size,condition=struct.unpack_from('<HH',body,pos)
            if size!=0:raise ValueError('Expected one bounded button condition')
            if condition!=4 or body[pos+2:pos+4]!=b'\x04\x00':raise ValueError('Source button press condition differs')
            payload=body[pos+4:];buttons[cid]=dict(conditionRawBytes=body[pos+2:pos+4].hex(),conditionRawUI16=condition,conditionName='CondOverUpToOverDown',trigger='press',actions=actions(payload),sha256=sha(payload))
        root54=[p for p in root['programs'] if p['frame']==54]
        if len(root54)!=1 or [p['code'] for p in root54[0]['records']]!=[7,0]:raise ValueError('Root54 Stop proof')
        if scroll_events['programs'] or replay_events['programs'] or scroll_events['labels'] or replay_events['labels']:raise ValueError('Nested action or label unexpectedly present')
        if art.source['frameRate']!=20 or len(positions)!=800 or len(poses)!=15:raise ValueError('Timeline rate/count')
        editions[edition]=dict(source=art.source,root=root,scroll=dict(characterId=84,frameCount=800,actions=scroll_events,mask=art.decode(36)['boundsTwips'],positions=positions,
            captions={83:art.decode(82)['caption'],39:art.decode(38)['caption']}),replay=dict(characterId=88,frameCount=15,actions=replay_events,poses=poses),buttons=buttons)
    a,b=editions.values()
    for key in ('root','scroll','replay','buttons'):
        if a[key]!=b[key]:raise ValueError(f'Edition timeline evidence differs {key}')
    return dict(executed=False,decoder=str(Path(__file__).relative_to(ROOT)),decoderSha256=sha(Path(__file__).read_bytes()),helperSha256=sha(Path(helper.__file__).read_bytes()),editionTimelineEvidenceIdentical=True,editions=editions)

def document(data):
    a=data['editions']['barrack'];root=a['root'];scroll=a['scroll'];replay=a['replay']
    text='''# Passive result timeline audit — 2026-10-01

This audit reads SWF5 tags, authored display lists and bounded AVM1 action records as data. No original Director, Flash, ActionScript, action interpreter or reconstructed action program is run. It establishes a source-supported animation path; native playback registration and scheduling remain qualified.

The decoder is [audit-original-result-timelines.py](../../../scripts/research/audit-original-result-timelines.py). Run `python3 scripts/research/audit-original-result-timelines.py` to deterministically regenerate this document, or add `--json` to print complete machine-readable evidence without writing it. Both edition timeline records compare identically. Artwork, original glyphs and edition JPEGs remain in [result provenance](../../../public/assets/original-result-ui/provenance.json).

## Root frame54 and action records

Both source UI resources declare20 frames/second and61 root frames. Frame54 is labelled `gameover`. Its only DoAction payload is hexadecimal `0700`: ActionStop(0x07), then End(0x00). There is no SetTarget, Play or Goto action in that payload. Earlier root frame2 has Push `_root`, GetVariable, Push `state` and `start`, SetMember, End; this is evidence of a root property assignment, not an instruction to animate a result child.

Adobe's original SWF specification documents that Stop/Play/Goto actions default to their containing timeline and that sprites have independent timelines. Thus the frame54 Stop does not itself stop sprite84 or sprite88. It also specifies AVM1 record headers and the Stop0x07/Play0x06/GotoFrame0x81 codes used by this passive decoder. See Adobe, *SWF File Format Specification19*, pp63–66 and201–202 ([readable mirror of the Adobe-authored manual](https://paperzz.com/doc/7855335/swf-file-format-specification-version-19)).

Default repetition is corroborated separately by Adobe's *Flash ProfessionalCC Classroom in a Book*, printedp133: movie-clip animations repeat automatically unless script stops their timeline. The original publication PDF was downloaded and its Flate text stream read as data, without a PDF script/action interpreter ([Adobe Press publication](https://www.adobepress.com/content/images/9780321927859/samplepages/0321927850.pdf)). PDF SHA256: `9c9cdf7dff5eea453590f21b2a3dc28d4dabf9e3f6bd248408d48208a0ea1225`; relevant decoded text-stream SHA256: `e150203fdd0fb89e0f525a6bc0432d7fa3a3b7ea24b7cc61d52d19ea43259592`. This later Adobe publication corroborates the default movie-clip behavior; it is not a native capture of the original Director Flash5 runtime.

| Root frame | Label | DoAction opcode sequence |
| --- | --- | --- |
'''
    labels={x['frame']:x['name'] for x in root['labels']}
    for p in root['programs']:text+=f"|{p['frame']} |{labels.get(p['frame'],'—')} |"+', '.join(x['name'] for x in p['records'])+' |\n'
    text+='''
## Scrolling sprite84

Sprite84 is first placed on the root at frame54/depth16, translation(0,560). Its800 frames have no DoAction, DoInitAction or frame labels. Local depth1 is black shape36; depth2 repeats that shape as a mask through depth5; depth3 carries the scrolling text sprite. Shape36 bounds are(0,16000,0,600)twips, yielding an800×30 strip at root y560..590. Only horizontal translation changes; local y is0.05 and the child text itself adds(2,2).

Frames1..799 use sprite83/text82: the source result invitation. Frame800 replaces it with sprite39/text38: the source general welcome/instructions. The last-frame replacement is real retained source data, not a decoding normalization. Its wider instruction text can leave a visible tail in the mask before repetition, so a reconstruction must preserve it. Ratios on these sprite placements remain raw metadata; they are not morph ratios or nested frame selectors.

The first three x coordinates are801,798,795; frame400 is−392.5; frame799 is−1586; frame800 is−1589. The path is twip-rounded and differs from a naïve straight interpolation by up to0.048310388px. Use the exact800 records below. At20Hz an800-frame default cycle is40 seconds; the frame800→frame1 boundary repeats the authored list and switches back to the result caption.

'''
    text+='Result invitation: `'+scroll['captions'][83]+'`\n\n'
    text+='Final-frame instruction text: `'+scroll['captions'][39]+'`\n\n'
    text+='''## Replay-up sprite88

Button91 up-state contains sprite88, with15 frames and no DoAction, DoInitAction or frame labels. Its single local depth1 stays at identity transform and identity color transform. Frames1..4 use morph85; frames5..14 use morph86; frame15 switches to ordinary shape87. Explicit morph ratios are listed below. A20Hz15-frame default cycle is0.75 seconds. Hover/down states instead show original static text89/90; the hit state is separate.

| Frame | Character | Morph ratio (raw UI16) |
| --- | --- | --- |
'''
    for p in replay['poses']:text+=f"|{p['frame']} |{p['characterId']} |{p['ratio']} |\n"
    text+='''
Button91 and96 each contain one bounded condition-action block. Their action record sequences are Push `_root`, GetVariable, Push `state` and respectively `replay`/`submit`, SetMember, End. Neither contains Stop, Play, GotoFrame, GotoLabel or SetTarget. The original condition bytes are `04 00`, little-endian UI16=4 (`0x0004`, CondOverUpToOverDown): hovered/unpressed to hovered/pressed, so the source trigger is mouse press. The generator asserts both the exact bytes and decoded value. The independent [button hit and event audit](ORIGINAL_RESULT_BUTTON_HIT_AUDIT.md) corroborates the condition against Adobe's specification and Ruffle's named flags. No key condition is set. This audit does not reimplement historical submission. No source action establishes a hover reset rule for the nested up-state clip.

## Concrete browser recommendation and limits

Use independent50ms artwork steps while the result UI is visible. Loop the exact800-frame scrolling display list and the15 Replay-up poses, preserving the last-frame character switches. Keep the source mask at root(0,560),800×30 and keep depth16 beneath Replaydepth22, gameoverdepth25, emblemdepth34, source control28/depth37 and borderdepth40. Do not freeze child artwork merely because frame54 stops the root. Prefer these finite recovered pose/state tables over evaluating any original action program.

Starting both children at pose1 on browser endgame entry is an explicit phase adapter. Native Director `goToFrame(54)` registration, wall-clock/timer behavior, lost frames under load, lifetime across repeated frame selection and whether a button up-state clip restarts or resumes after hover/down are not demonstrated by static bytes. Continue to qualify those behaviors. The default-loop inference is supported by the source's absence of child stop actions plus Adobe's independent/default-loop movie-clip documentation; no native historical playback capture was made. Dynamic rooms text and external score submission remain separate gaps.

## Complete exact scrolling placements

Each row is `[frame, characterId, xPx, yPx, rawRatio]`. The linear parts of all matrices are identity and all color transforms are identity. This compact table is generated directly from every ShowFrame display list; no guessed easing or interpolation fills missing samples.

<details>
<summary>All800 authored scrolling frames</summary>

```json
'''
    text+='[\n'+',\n'.join(json.dumps([p['frame'],p['characterId'],p['matrix'][4],p['matrix'][5],p['ratio']],separators=(',',':')) for p in scroll['positions'])+'\n]\n```\n\n</details>\n\n'
    text+='## Provenance\n\n'
    text+='Decoder SHA256: `'+data['decoderSha256']+'`. Artwork helper SHA256: `'+data['helperSha256']+'`.\n\n'
    for edition,item in data['editions'].items():
        s=item['source'];text+=f"- {edition}: resource{s['resourceId']}, cast{s['castId']}, XMED SHA256 `{s['resourceSha256']}`, embedded SWF SHA256 `{s['swfSha256']}`.\n"
    return text

def main():
    p=argparse.ArgumentParser();p.add_argument('--json',action='store_true',help='Print full evidence without writing document');args=p.parse_args();data=audit()
    if args.json:print(json.dumps(data,indent=2));return
    DOC.write_text(document(data));print(json.dumps(dict(document=str(DOC.relative_to(ROOT)),executed=False,editionsIdentical=True,scrollFrames=800,replayFrames=15,framesPerSecond=20,root54Action='Stop',decoderSha256=data['decoderSha256'])))
if __name__=='__main__':main()
