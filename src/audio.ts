import type {Vec3} from '../shared/protocol';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {ORIGINAL_COMBAT_SOUND_NAMES,type OriginalSoundName} from './originalCombatAudio';

type NoiseKind = 'shot' | 'sniper' | 'explosion' | 'hit' | 'empty' | 'reload' | 'step' | 'hurt' | 'ui';

/** WebAudio adaptation of the recovered playsound attenuation and ear pan.
 * Positions are in this client's normalized units; source ears are ±5 units.
 * Director volume0..255 and pan-100..100 become linear gain and stereo pan.
 */
export function originalDoorSoundLevels(position:Vec3,eye:Vec3,right:Vec3):{gain:number;pan:number} {
  const magnitude=Math.hypot(right.x,right.y,right.z)||1;
  const earOffset=5*ORIGINAL_MAP_SCALE/magnitude;
  const distance=(x:number,y:number,z:number)=>Math.hypot(position.x-x,position.y-y,position.z-z)/ORIGINAL_MAP_SCALE;
  const sourceDistance=distance(eye.x,eye.y,eye.z);
  const volume=200-Math.round(sourceDistance*.04);
  const left=distance(eye.x-right.x*earOffset,eye.y-right.y*earOffset,eye.z-right.z*earOffset);
  const rightDistance=distance(eye.x+right.x*earOffset,eye.y+right.y*earOffset,eye.z+right.z*earOffset);
  return {gain:volume>1?Math.min(1,volume/255):0,pan:Math.max(-1,Math.min(1,(left-rightDistance)/10))};
}

export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.55;
  private readonly originalSamples=new Map<OriginalSoundName,{bytes?:ArrayBuffer;buffer?:AudioBuffer;preparation?:Promise<void>;decoding?:Promise<void>}>();
  private readonly originalChannels=new Map<number,{source:AudioBufferSourceNode;cleanup:()=>void}>();

  resume(): void {
    if (!this.context) {
      if(typeof AudioContext==='undefined')return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    void this.context.resume().catch(()=>undefined);
    for(const name of this.originalSamples.keys())void this.decodeOriginalSound(name);
  }

  private prepareOriginalSound(name:OriginalSoundName):Promise<void> {
    let sample=this.originalSamples.get(name);
    if(!sample){sample={};this.originalSamples.set(name,sample);}
    const entry=sample;
    if(!entry.preparation)entry.preparation=(async()=>{
      const response=await fetch(`/assets/original-audio/${name}.wav`);
      if(!response.ok)throw new Error(`Original ${name} sample unavailable (${response.status})`);
      entry.bytes=await response.arrayBuffer();await this.decodeOriginalSound(name);
    })().catch(()=>undefined);
    return entry.preparation;
  }

  private decodeOriginalSound(name:OriginalSoundName):Promise<void> {
    const sample=this.originalSamples.get(name);
    if(!this.context||!sample?.bytes||sample.buffer)return Promise.resolve();
    if(!sample.decoding)sample.decoding=this.context.decodeAudioData(sample.bytes.slice(0))
      .then(buffer=>{sample.buffer=buffer;}).catch(()=>undefined);
    return sample.decoding;
  }

  prepareOriginalDoorSound():Promise<void> {return this.prepareOriginalSound('door');}
  prepareOriginalHurtSound():Promise<void> {return this.prepareOriginalSound('hurtme');}
  async prepareOriginalCombatSounds():Promise<void> {
    await Promise.all(ORIGINAL_COMBAT_SOUND_NAMES.map(name=>this.prepareOriginalSound(name)));
  }

  /** Source playsound shares eight channels: automatic uses the first free;
   * explicit channels restart only when distance attenuation is audible.
   * Muted explicit events retire their previous browser voice as before.
   */
  playOriginalSound(name:OriginalSoundName,position:Vec3|undefined,eye:Vec3,right:Vec3,channel?:number):void {
    const levels=originalDoorSoundLevels(position??eye,eye,right);
    if(levels.gain<=0)return;
    if(channel!==undefined&&(!Number.isInteger(channel)||channel<1||channel>8))return;
    const selected=channel??Array.from({length:8},(_,i)=>i+1).find(i=>!this.originalChannels.has(i));
    if(selected===undefined)return;
    const previous=this.originalChannels.get(selected);
    if(previous){try{previous.source.stop();}catch{/* Voice may already have ended. */}previous.cleanup();}
    const buffer=this.originalSamples.get(name)?.buffer;
    if(!this.context||!this.master||!buffer||this.volume<=0)return;
    const source=this.context.createBufferSource(),gain=this.context.createGain(),pan=this.context.createStereoPanner();
    source.buffer=buffer;gain.gain.value=levels.gain;pan.pan.value=levels.pan;
    source.connect(gain).connect(pan).connect(this.master);
    let cleaned=false;
    const voice={source,cleanup:()=>{
      if(cleaned)return;cleaned=true;
      if(this.originalChannels.get(selected)===voice)this.originalChannels.delete(selected);
      source.disconnect();gain.disconnect();pan.disconnect();
    }};
    this.originalChannels.set(selected,voice);source.onended=voice.cleanup;
    try{source.start();}catch{voice.cleanup();}
  }

  playOriginalLocalSound(name:OriginalSoundName,channel:number):void {
    this.playOriginalSound(name,undefined,{x:0,y:0,z:0},{x:1,y:0,z:0},channel);
  }
  playOriginalDoor(position:Vec3,eye:Vec3,right:Vec3):void {this.playOriginalSound('door',position,eye,right);}
  playOriginalHurt():void {this.playOriginalLocalSound('hurtme',8);}

  setVolume(value: number): void {
    this.volume = value;
    if (this.master && this.context) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.03);
  }

  play(kind: NoiseKind, intensity = 1): void {
    if (!this.context || !this.master || this.volume <= 0) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const duration = kind === 'explosion' ? 0.65 : kind === 'sniper' ? 0.34 : kind === 'shot' ? 0.18 : 0.1;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      const decay = Math.pow(1 - t, kind === 'explosion' ? 2 : 5);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const settings: Record<NoiseKind, [BiquadFilterType, number, number]> = {
      shot: ['bandpass', 820, 0.42], sniper: ['lowpass', 1200, 0.62], explosion: ['lowpass', 320, 0.9],
      hit: ['highpass', 1600, 0.15], empty: ['highpass', 2200, 0.09], reload: ['bandpass', 1300, 0.12],
      step: ['lowpass', 180, 0.07], hurt: ['lowpass', 500, 0.25], ui: ['highpass', 900, 0.08],
    };
    const [type, frequency, level] = settings[kind];
    filter.type = type; filter.frequency.value = frequency;
    gain.gain.setValueAtTime(level * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(now);

    if (kind === 'shot' || kind === 'sniper' || kind === 'explosion') {
      const oscillator = ctx.createOscillator();
      const thump = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(kind === 'explosion' ? 75 : 110, now);
      oscillator.frequency.exponentialRampToValueAtTime(35, now + duration);
      thump.gain.setValueAtTime((kind === 'explosion' ? 0.65 : 0.22) * intensity, now);
      thump.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(thump).connect(this.master);
      oscillator.start(now); oscillator.stop(now + duration);
    }
  }
}
