import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {AudioSystem} from './audio';
import type {WeaponId} from './weapons';

// Actual Game accepted-event dispatcher and AudioSystem channel ownership.
// The receiver event and enemy muzzle sink are explicit seams; fake WebAudio
// nodes establish invocation/voice ownership, not native audible mixing.
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
async function fixture(map:'barrack'|'woodlands'){
 const sources:Array<{stop:ReturnType<typeof vi.fn>;start:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;onended:(()=>void)|null;buffer:unknown}>=[];
 const node=()=>({connect:vi.fn((target:unknown)=>target),disconnect:vi.fn()});
 class Context{
  destination={};currentTime=1;resume=vi.fn(async()=>{});decodeAudioData=vi.fn(async(bytes:ArrayBuffer)=>({bytes,duration:.3}));
  createGain(){return {...node(),gain:{value:0,setTargetAtTime:vi.fn()}};}
  createStereoPanner(){return {...node(),pan:{value:0}};}
  createBufferSource(){const value={...node(),buffer:null,onended:null,start:vi.fn(),stop:vi.fn()};sources.push(value);return value;}
 }
 vi.stubGlobal('AudioContext',Context);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)})));
 const audio=new AudioSystem();audio.resume();await audio.prepareOriginalCombatSounds();
 const enemy={id:'bot',sourceRig:{},sourceReceivedShot:vi.fn()};
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,phase:'playing',camera:new THREE.PerspectiveCamera(),audio,enemies:[enemy],
  soloWorlds:{worlds:new Map([['player',{lifeGeneration:2}],['sibling',{lifeGeneration:2}]])},flushOriginalReconciliation:vi.fn()}) as any;
 const dispatch=(weapon:WeaponId='rifle',recipientId='player',lifeGeneration=2)=>game.receiveSoloWorldEvent({kind:'shot',recipientId,lifeGeneration,ownerId:'bot',weapon,position:{x:1,y:2,z:3}});
 const channels=()=>[...(audio as unknown as {originalChannels:Map<number,unknown>}).originalChannels.keys()].sort((a,b)=>a-b);
 return {audio,game,enemy,sources,dispatch,channels};
}

describe('accepted Solo remote shots use shared automatic sound channels',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map}: all four hitscan families overlap without replacing local channel6`,async()=>{
   const s=await fixture(map),play=vi.spyOn(s.audio,'playOriginalSound');s.audio.playOriginalLocalSound('reak47',6);const local=s.sources[0];
   const families=[['pistol','gunfire'],['shotgun','spas12wav'],['rifle','gunfire'],['sniper','resniper']] as const;
   for(const [weapon,sample] of families){s.dispatch(weapon);expect(play).toHaveBeenLastCalledWith(sample,{x:1,y:2,z:3},s.game.camera.position,expect.any(THREE.Vector3),undefined);}
   expect(s.channels()).toEqual([1,2,3,4,6]);expect(s.sources).toHaveLength(5);expect(s.enemy.sourceReceivedShot.mock.calls.map(call=>call[0])).toEqual(families.map(([weapon])=>weapon));
   for(const voice of s.sources){expect(voice.start).toHaveBeenCalledOnce();expect(voice.stop).not.toHaveBeenCalled();}
   expect(local.disconnect).not.toHaveBeenCalled();
  });
  it(`${map}: sibling and stale-generation receipts produce no sound or muzzle invocation`,async()=>{
   const s=await fixture(map),play=vi.spyOn(s.audio,'playOriginalSound');s.dispatch('pistol','sibling');s.dispatch('rifle','player',1);
   expect(play).not.toHaveBeenCalled();expect(s.sources).toHaveLength(0);expect(s.enemy.sourceReceivedShot).not.toHaveBeenCalled();
  });
  it(`${map}: a full mixer drops another remote voice instead of interrupting local6`,async()=>{
   const s=await fixture(map);s.audio.playOriginalLocalSound('reak47',6);
   for(let i=0;i<7;i++)s.dispatch('rifle');expect(s.channels()).toEqual([1,2,3,4,5,6,7,8]);expect(s.sources).toHaveLength(8);
   s.dispatch('sniper');expect(s.sources).toHaveLength(8);for(const voice of s.sources)expect(voice.stop).not.toHaveBeenCalled();
   expect(s.enemy.sourceReceivedShot).toHaveBeenCalledTimes(8);
   // Finishing automatic channel1 allows precisely one new remote voice.
   s.sources[1].onended!();s.dispatch('pistol');expect(s.sources).toHaveLength(9);expect(s.channels()).toEqual([1,2,3,4,5,6,7,8]);expect(s.sources[0].stop).not.toHaveBeenCalled();
  });
 }
});
