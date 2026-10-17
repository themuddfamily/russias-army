import {afterEach,describe,expect,it,vi} from 'vitest';
import {AudioSystem} from './audio';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

function mockAudio() {
  const sources:any[]=[],gains:any[]=[],pans:any[]=[];
  const buffer={duration:.5},bytes=new ArrayBuffer(8);
  const node=()=>({connect:vi.fn((target:any)=>target),disconnect:vi.fn()});
  const decoder=vi.fn(async(_bytes:ArrayBuffer)=>buffer),resume=vi.fn(async()=>{});
  class Context {
    destination={};currentTime=1;resume=resume;decodeAudioData=decoder;
    createGain(){const gain={...node(),gain:{value:0,setTargetAtTime:vi.fn()}};gains.push(gain);return gain;}
    createStereoPanner(){const pan={...node(),pan:{value:0}};pans.push(pan);return pan;}
    createBufferSource(){const source={...node(),buffer:null,onended:null,start:vi.fn(),stop:vi.fn()};sources.push(source);return source;}
  }
  const fetcher=vi.fn(async()=>({ok:true,arrayBuffer:async()=>bytes}));
  vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',fetcher);
  return {sources,gains,pans,buffer,bytes,decoder,resume,fetcher};
}

async function readyAudio() {
  const mock=mockAudio(),audio=new AudioSystem();
  await audio.prepareOriginalHurtSound();audio.resume();
  // Decode is initiated by the gesture, independently of the completed prefetch.
  await Promise.resolve();await Promise.resolve();
  return {...mock,audio};
}

describe('original local hurt channel',()=>{
  it('prefetches once without a context and decodes a copy after a gesture',async()=>{
    const mock=mockAudio(),audio=new AudioSystem();
    audio.playOriginalHurt();expect(mock.sources).toHaveLength(0);
    await audio.prepareOriginalHurtSound();await audio.prepareOriginalHurtSound();
    expect(mock.fetcher).toHaveBeenCalledOnce();expect(mock.fetcher).toHaveBeenCalledWith('/assets/original-audio/hurtme.wav');
    expect(mock.decoder).not.toHaveBeenCalled();audio.resume();await Promise.resolve();audio.resume();await Promise.resolve();
    expect(mock.decoder).toHaveBeenCalledOnce();expect(mock.decoder.mock.calls[0][0]).not.toBe(mock.bytes);
    audio.playOriginalHurt();expect(mock.sources[0].buffer).toBe(mock.buffer);expect(mock.sources[0].start).toHaveBeenCalledOnce();
  });
  it('decodes when fetching finishes after the context already exists',async()=>{
    const mock=mockAudio(),audio=new AudioSystem();audio.resume();await audio.prepareOriginalHurtSound();
    expect(mock.decoder).toHaveBeenCalledOnce();audio.playOriginalHurt();expect(mock.sources).toHaveLength(1);
  });
  it('uses source volume 200/255, centered pan and the existing user volume master',async()=>{
    const {audio,sources,gains,pans}=await readyAudio();audio.playOriginalHurt();
    expect(gains[0].gain.value).toBe(.55);expect(gains[1].gain.value).toBe(200/255);expect(pans[0].pan.value).toBe(0);
    expect(sources[0].connect).toHaveBeenCalledWith(gains[1]);expect(gains[1].connect).toHaveBeenCalledWith(pans[0]);expect(pans[0].connect).toHaveBeenCalledWith(gains[0]);
    audio.setVolume(.25);expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(.25,1,.03);
  });
  it('restarts channel 8 on each hurt and ignores the previous delayed ended callback',async()=>{
    const {audio,sources,gains,pans}=await readyAudio();audio.playOriginalHurt();const first=sources[0];
    audio.playOriginalHurt();const second=sources[1];expect(first.stop).toHaveBeenCalledOnce();expect(first.disconnect).toHaveBeenCalledOnce();
    expect(gains[1].disconnect).toHaveBeenCalledOnce();expect(pans[0].disconnect).toHaveBeenCalledOnce();
    first.onended();expect(first.disconnect).toHaveBeenCalledOnce();audio.playOriginalHurt();
    expect(second.stop).toHaveBeenCalledOnce();expect(sources[2].start).toHaveBeenCalledOnce();
  });
  it('releases an ended channel without stopping it on the next hurt',async()=>{
    const {audio,sources}=await readyAudio();audio.playOriginalHurt();sources[0].onended();audio.playOriginalHurt();
    expect(sources[0].disconnect).toHaveBeenCalledOnce();expect(sources[0].stop).not.toHaveBeenCalled();expect(sources).toHaveLength(2);
  });
  it('honors mute and stops any previous hurt when a new muted hurt arrives',async()=>{
    const {audio,sources}=await readyAudio();audio.setVolume(0);audio.playOriginalHurt();expect(sources).toHaveLength(0);
    audio.setVolume(.55);audio.playOriginalHurt();audio.setVolume(0);audio.playOriginalHurt();
    expect(sources).toHaveLength(1);expect(sources[0].stop).toHaveBeenCalledOnce();expect(sources[0].disconnect).toHaveBeenCalledOnce();
  });
  it('stays silent on missing context, failed fetch or failed decode',async()=>{
    vi.stubGlobal('AudioContext',undefined);vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:404})));
    const unavailable=new AudioSystem();unavailable.resume();await unavailable.prepareOriginalHurtSound();expect(()=>unavailable.playOriginalHurt()).not.toThrow();
    const mock=mockAudio();mock.decoder.mockRejectedValueOnce(new Error('decode failed'));
    const invalid=new AudioSystem();invalid.resume();await invalid.prepareOriginalHurtSound();invalid.playOriginalHurt();expect(mock.sources).toHaveLength(0);
  });
  it('cleans up a failed start and allows the next hurt to play',async()=>{
    const {audio,sources}=await readyAudio();
    // The first voice is created synchronously by playback; inject a start failure through its factory.
    const context=(audio as any).context,create=context.createBufferSource.bind(context);
    context.createBufferSource=()=>{const source=create();source.start.mockImplementationOnce(()=>{throw new Error('start failed');});return source;};
    expect(()=>audio.playOriginalHurt()).not.toThrow();expect(sources[0].disconnect).toHaveBeenCalledOnce();
    context.createBufferSource=create;audio.playOriginalHurt();expect(sources[0].stop).not.toHaveBeenCalled();expect(sources[1].start).toHaveBeenCalledOnce();
  });
});
