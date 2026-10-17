import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {AudioSystem,originalDoorSoundLevels} from './audio';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
const base=new URL('../public/assets/original-audio/',import.meta.url);
const eye={x:0,y:0,z:0},right={x:1,y:0,z:0};
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('recovered original door audio',()=>{
  it('preserves the decoded float WAV and its source provenance',()=>{
    const bytes=readFileSync(new URL('door.wav',base)),provenance=JSON.parse(readFileSync(new URL('provenance.json',base),'utf8'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(provenance.wav.sha256);
    expect(provenance.identical_edition_payloads).toBe(true);expect(provenance.sources[0].resource_sha256).toBe(provenance.sources[1].resource_sha256);
    expect(bytes.toString('ascii',0,4)).toBe('RIFF');expect(bytes.toString('ascii',8,12)).toBe('WAVE');
    let rate=0,channels=0,frames=0;
    for(let offset=12;offset+8<=bytes.length;){const name=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),data=offset+8;
      if(name==='fmt '){const format=bytes.readUInt16LE(data);expect([3,65534]).toContain(format);channels=bytes.readUInt16LE(data+2);rate=bytes.readUInt32LE(data+4);expect(bytes.readUInt16LE(data+14)).toBe(32);if(format===65534)expect(bytes.readUInt16LE(data+24)).toBe(3);}
      if(name==='data')frames=length/4/channels;offset=data+length+(length%2);
    }
    expect([rate,channels,frames]).toEqual([16000,1,13824]);expect(frames/rate).toBe(provenance.wav.untrimmed_duration_seconds);
  });
  it('adapts source distance, ±5-unit ears and channel volume/pan without extra attenuation',()=>{
    expect(originalDoorSoundLevels(eye,eye,right)).toEqual({gain:200/255,pan:0});
    const positive=originalDoorSoundLevels({x:500*ORIGINAL_MAP_SCALE,y:0,z:0},eye,right);
    expect(positive.gain).toBe(180/255);expect(positive.pan).toBeCloseTo(1);
    const negative=originalDoorSoundLevels({x:-500*ORIGINAL_MAP_SCALE,y:0,z:0},eye,right);expect(negative.pan).toBeCloseTo(-1);
    expect(originalDoorSoundLevels({x:0,y:0,z:-500*ORIGINAL_MAP_SCALE},eye,right).pan).toBe(0);
    expect(originalDoorSoundLevels({x:500*ORIGINAL_MAP_SCALE,y:0,z:0},eye,{x:2,y:0,z:0})).toEqual(positive);
    expect(originalDoorSoundLevels({x:5000*ORIGINAL_MAP_SCALE,y:0,z:0},eye,right).gain).toBe(0);
  });
  it('stays silent without AudioContext and fetches the original WAV once before a gesture',async()=>{
    vi.stubGlobal('AudioContext',undefined);const fetcher=vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}));vi.stubGlobal('fetch',fetcher);
    const audio=new AudioSystem();audio.resume();audio.playOriginalDoor(eye,eye,right);await audio.prepareOriginalDoorSound();await audio.prepareOriginalDoorSound();expect(fetcher).toHaveBeenCalledOnce();expect(fetcher).toHaveBeenCalledWith('/assets/original-audio/door.wav');
  });
  it('decodes after resume, honors mute and the original eight simultaneous channels',async()=>{
    const sources:any[]=[],gains:any[]=[],pans:any[]=[];
    const node=()=>({connect:vi.fn((target:any)=>target),disconnect:vi.fn()});
    const decoder=vi.fn(async()=>({duration:.864}));
    class Context {
      destination={};currentTime=0;resume=vi.fn(async()=>{});decodeAudioData=decoder;
      createGain(){const gain={...node(),gain:{value:0,setTargetAtTime:vi.fn()}};gains.push(gain);return gain;}
      createStereoPanner(){const pan={...node(),pan:{value:0}};pans.push(pan);return pan;}
      createBufferSource(){const source={...node(),buffer:null,onended:null,start:vi.fn()};sources.push(source);return source;}
    }
    vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}));
    const audio=new AudioSystem();await audio.prepareOriginalDoorSound();expect(decoder).not.toHaveBeenCalled();audio.resume();await audio.prepareOriginalDoorSound();await Promise.resolve();expect(decoder).toHaveBeenCalledOnce();
    audio.setVolume(0);audio.playOriginalDoor(eye,eye,right);expect(sources).toHaveLength(0);audio.setVolume(.55);
    for(let i=0;i<9;i++)audio.playOriginalDoor(eye,eye,right);expect(sources).toHaveLength(8);expect(gains[1].gain.value).toBe(200/255);expect(pans[0].pan.value).toBe(0);
    sources[0].onended();audio.playOriginalDoor(eye,eye,right);expect(sources).toHaveLength(9);expect(sources[0].disconnect).toHaveBeenCalledOnce();
  });
});
