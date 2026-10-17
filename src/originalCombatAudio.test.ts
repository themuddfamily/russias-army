import {afterEach,describe,expect,it,vi} from 'vitest';
import {AudioSystem} from './audio';
import {ORIGINAL_COMBAT_SOUND_NAMES,originalFireSound,originalReloadSound} from './originalCombatAudio';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
const eye={x:0,y:0,z:0},right={x:1,y:0,z:0};
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function setup(){
 const sources:any[]=[],gains:any[]=[],pans:any[]=[];
 const node=()=>({connect:vi.fn((target:any)=>target),disconnect:vi.fn()});
 const decode=vi.fn(async(bytes:ArrayBuffer)=>({bytes,duration:.3}));
 class Context{
  destination={};currentTime=1;resume=vi.fn(async()=>{});decodeAudioData=decode;
  createGain(){const n={...node(),gain:{value:0,setTargetAtTime:vi.fn()}};gains.push(n);return n;}
  createStereoPanner(){const n={...node(),pan:{value:0}};pans.push(n);return n;}
  createBufferSource(){const n={...node(),buffer:null,onended:null,start:vi.fn(),stop:vi.fn()};sources.push(n);return n;}
 }
 const bytes=new ArrayBuffer(8),fetcher=vi.fn(async()=>({ok:true,arrayBuffer:async()=>bytes}));
 vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',fetcher);
 return {audio:new AudioSystem(),sources,gains,pans,decode,fetcher,bytes};
}
async function ready(){const m=setup();m.audio.resume();await Promise.all([m.audio.prepareOriginalCombatSounds(),m.audio.prepareOriginalDoorSound(),m.audio.prepareOriginalHurtSound()]);return m;}
describe('source combat sample mappings',()=>{
 it.each([
  ['pistol','gunfire','repistol'],['shotgun','spas12wav','repistol'],['rifle','gunfire','reak47'],
  ['sniper','resniper','reak47'],['launcher','grenade1','rerg6'],['rpg','offrock','rerg6'],
 ] as const)('%s uses decoded source fire and reload members',(weapon,fire,reload)=>{expect(originalFireSound(weapon)).toBe(fire);expect(originalReloadSound(weapon)).toBe(reload);});
});
describe('shared source audio channels',()=>{
 it('prefetches exactly ten combat members once and waits for the audio gesture',async()=>{
  const m=setup();await m.audio.prepareOriginalCombatSounds();await m.audio.prepareOriginalCombatSounds();
  expect(m.fetcher.mock.calls.map(c=>(c as any[])[0])).toEqual(ORIGINAL_COMBAT_SOUND_NAMES.map(n=>`/assets/original-audio/${n}.wav`));
  expect(m.decode).not.toHaveBeenCalled();m.audio.resume();await Promise.resolve();await Promise.resolve();
  expect(m.decode).toHaveBeenCalledTimes(10);for(const [bytes] of m.decode.mock.calls)expect(bytes).not.toBe(m.bytes);
  m.audio.resume();await m.audio.prepareOriginalCombatSounds();expect(m.decode).toHaveBeenCalledTimes(10);
 });
 it('shares first-free automatic channels between doors, combat and local hurt',async()=>{
  const m=await ready();m.audio.playOriginalHurt(); // channel 8
  m.audio.playOriginalDoor(eye,eye,right); // channel 1
  for(let i=0;i<6;i++)m.audio.playOriginalSound('boomnew',eye,eye,right); // channels 2..7
  m.audio.playOriginalSound('hurt',eye,eye,right);m.audio.playOriginalDoor(eye,eye,right);expect(m.sources).toHaveLength(8);
  m.sources[1].onended();m.audio.playOriginalSound('gunfire',eye,eye,right);expect(m.sources).toHaveLength(9);
  m.audio.playOriginalLocalSound('repistol',1);expect(m.sources[8].stop).toHaveBeenCalledOnce();expect(m.sources[0].stop).not.toHaveBeenCalled();
 });
 it('replaces channel 6 across firing and reload without stale callbacks clearing the new voice',async()=>{
  const m=await ready();m.audio.playOriginalLocalSound('gunfire',6);const first=m.sources[0];
  m.audio.playOriginalLocalSound('reak47',6);expect(first.stop).toHaveBeenCalledOnce();expect(first.disconnect).toHaveBeenCalledOnce();
  first.onended();m.audio.playOriginalLocalSound('spas12wav',6);expect(m.sources[1].stop).toHaveBeenCalledOnce();
  expect(first.disconnect).toHaveBeenCalledOnce();expect(m.sources[2].start).toHaveBeenCalledOnce();
 });
 it('keeps channels 6, 7 and 8 independent and lets explicit events replace an automatically occupied channel',async()=>{
  const m=await ready();for(let i=0;i<8;i++)m.audio.playOriginalDoor(eye,eye,right);
  m.audio.playOriginalLocalSound('gunfire',6);m.audio.playOriginalLocalSound('grenade1',7);m.audio.playOriginalHurt();
  expect(m.sources).toHaveLength(11);for(const index of [5,6,7])expect(m.sources[index].stop).toHaveBeenCalledOnce();
  for(const index of [0,1,2,3,4,8,9,10])expect(m.sources[index].stop).not.toHaveBeenCalled();
 });
 it('uses source positional volume and ear pan and leaves busy channels alone beyond audible distance',async()=>{
  const m=await ready();m.audio.playOriginalLocalSound('offrock',7);
  m.audio.playOriginalSound('grenade1',{x:5000*ORIGINAL_MAP_SCALE,y:0,z:0},eye,right,7);
  expect(m.sources).toHaveLength(1);expect(m.sources[0].stop).not.toHaveBeenCalled();
  m.audio.playOriginalSound('boomnew',{x:500*ORIGINAL_MAP_SCALE,y:0,z:0},eye,right);
  expect(m.gains[2].gain.value).toBe(180/255);expect(m.pans[1].pan.value).toBeCloseTo(1);
  expect(m.gains[1].gain.value).toBe(200/255);expect(m.pans[0].pan.value).toBe(0);
 });
 it('ignores invalid channels and missing samples, honors mute, and releases failed starts',async()=>{
  const m=await ready();for(const channel of [0,9,1.5,Infinity])m.audio.playOriginalLocalSound('gunfire',channel);expect(m.sources).toHaveLength(0);
  m.audio.setVolume(0);m.audio.playOriginalLocalSound('gunfire',6);expect(m.sources).toHaveLength(0);m.audio.setVolume(.55);
  const context=(m.audio as any).context,create=context.createBufferSource.bind(context);
  context.createBufferSource=()=>{const s=create();s.start.mockImplementationOnce(()=>{throw Error('start');});return s;};
  m.audio.playOriginalLocalSound('gunfire',6);expect(m.sources[0].disconnect).toHaveBeenCalledOnce();
  context.createBufferSource=create;m.audio.playOriginalSound('boomnew',eye,eye,right);expect(m.sources).toHaveLength(2);expect(m.sources[0].stop).not.toHaveBeenCalled();
 });
 it('keeps unavailable combat samples silent after fetch or decode failure',async()=>{
  const m=setup();m.fetcher.mockResolvedValueOnce({ok:false,arrayBuffer:async()=>m.bytes});m.decode.mockRejectedValueOnce(Error('bad wav'));
  m.audio.resume();await m.audio.prepareOriginalCombatSounds();m.audio.playOriginalLocalSound('gunfire',6);m.audio.playOriginalLocalSound('spas12wav',6);expect(m.sources).toHaveLength(0);
 });
});
