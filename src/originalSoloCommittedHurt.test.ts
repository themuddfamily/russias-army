import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {copyReceiverLocalHitscanOutcomes,type ReceiverLocalHitscanOutcome} from '../shared/originalReceiverLocalHitscan';
import type {OriginalSoloEvent} from '../shared/originalSoloObserverWorld';

const prefix=(life=7,callback=3)=>({kind:'callback' as const,sceneGeneration:life,callback});
function outcome(life=7,callback=3,hurt=true):ReceiverLocalHitscanOutcome {
 return {prefix:prefix(life,callback),weapon:'rifle',positiveShot:1,
  hit:{handle:'baddy:target',geometryProvenance:'declared-CPU-fixture',layer:'live-gi',faceIndex:0,distance:4,point:{x:1,y:2,z:3},normal:{x:0,y:1,z:0}},
  ...(hurt?{hurt:{actorId:'target',name:'Target',amount:6 as const,sourcePositionWorld:{x:11,y:12,z:13}}}:{})};
}
function fixture(raw:readonly ReceiverLocalHitscanOutcome[]=[outcome()]) {
 const values=copyReceiverLocalHitscanOutcomes(raw,prefix(),256,65536);
 const world={id:'player',lifeGeneration:7,callback:3,health:{health:100},localHitscanOutcomes:values};
 const target={id:'target',health:80,sourceDamagePresentation:vi.fn()};
 const game=Object.assign(Object.create(Game.prototype),{phase:'playing',mode:'solo',archivalWinter:false,arena:{runtime:{}},health:100,
  soloWorlds:{worlds:new Map([['player',world]])},enemies:[target],playOriginalCombatSound:vi.fn(),updateHud:vi.fn(),showOriginalHurt:vi.fn(),playPlayerHurtSound:vi.fn()}) as any;
 const event=(value=values[0],recipientId='player',lifeGeneration=7):Extract<OriginalSoloEvent,{kind:'local-hitscan-outcome'}>=>({kind:'local-hitscan-outcome',recipientId,lifeGeneration,time:10,outcome:value});
 return {game,world,target,values,event};
}

// Game's real event consumer and the real detached outcome copier, with CPU
// observer ownership fixtures. Audio is a mocked post-commit sink; this does
// not prove native sound attenuation, geometry queries or report damage.
describe('Solo committed source hurt presentation',()=>{
 it('plays at captured logical actor position without applying damage',()=>{
  const f=fixture();f.game.receiveSoloWorldEvent(f.event());
  expect(f.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('hurt',f.values[0].hurt!.sourcePositionWorld);
  expect(f.values[0].hurt!.sourcePositionWorld).not.toEqual(f.values[0].hit!.point);
  expect(f.game.health).toBe(100);expect(f.world.health.health).toBe(100);expect(f.target.health).toBe(80);
  expect(f.target.sourceDamagePresentation).not.toHaveBeenCalled();expect(f.game.updateHud).not.toHaveBeenCalled();expect(f.game.showOriginalHurt).not.toHaveBeenCalled();expect(f.game.playPlayerHurtSound).not.toHaveBeenCalled();
 });
 it('rejects a fabricated equal-value outcome and accepts the actual committed identity',()=>{
  const f=fixture();f.game.receiveSoloWorldEvent(f.event({...f.values[0]}));expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();
  f.game.receiveSoloWorldEvent(f.event());expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();
 });
 it('consumes each committed outcome index once',()=>{
  const f=fixture([outcome(),outcome()]);
  for(const value of f.values){f.game.receiveSoloWorldEvent(f.event(value));f.game.receiveSoloWorldEvent(f.event(value));}
  expect(f.game.playOriginalCombatSound).toHaveBeenCalledTimes(2);
 });
 it('consumes before a throwing audio sink and continues with another outcome',()=>{
  const f=fixture([outcome(),outcome()]);f.game.playOriginalCombatSound.mockImplementationOnce(()=>{throw Error('audio failed');});
  expect(()=>f.game.receiveSoloWorldEvent(f.event())).toThrow('audio failed');
  f.game.receiveSoloWorldEvent(f.event());f.game.receiveSoloWorldEvent(f.event(f.values[1]));
  expect(f.game.playOriginalCombatSound).toHaveBeenCalledTimes(2);expect(f.target.health).toBe(80);
 });
 it('rejects previous-callback outcomes even when retained by the world',()=>{
  const f=fixture();f.world.callback=4;f.game.receiveSoloWorldEvent(f.event());expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();
 });
 it('rejects a mismatched outcome scene generation',()=>{
  const f=fixture();const stale=outcome(6);f.world.localHitscanOutcomes=[stale];f.game.receiveSoloWorldEvent(f.event(stale));expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();
 });
 it('rejects stale event life and removed world ownership',()=>{
  const f=fixture();f.game.receiveSoloWorldEvent(f.event(f.values[0],'player',6));
  f.game.soloWorlds.worlds.delete('player');f.game.receiveSoloWorldEvent(f.event());expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();
 });
 it('accepts fresh ownership after same-id reset without replaying old outcomes',()=>{
  const f=fixture();f.game.receiveSoloWorldEvent(f.event());
  const fresh=copyReceiverLocalHitscanOutcomes([outcome(8)],prefix(8),256,65536);
  f.game.soloWorlds.worlds.set('player',{...f.world,lifeGeneration:8,localHitscanOutcomes:fresh});
  f.game.receiveSoloWorldEvent(f.event());f.game.receiveSoloWorldEvent(f.event(fresh[0],'player',8));f.game.receiveSoloWorldEvent(f.event(fresh[0],'player',8));
  expect(f.game.playOriginalCombatSound).toHaveBeenCalledTimes(2);
 });
 it.each(['online','winter','paused','bot'])('rejects %s delivery',kind=>{
  const f=fixture();let event=f.event();
  if(kind==='online')f.game.mode='online';if(kind==='winter')f.game.archivalWinter=true;if(kind==='paused')f.game.phase='paused';
  if(kind==='bot'){f.game.soloWorlds.worlds.set('bot',f.world);event=f.event(f.values[0],'bot');}
  f.game.receiveSoloWorldEvent(event);expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();
 });
 it('does not create hurt audio for non-actor hits or misses',()=>{
  const miss:ReceiverLocalHitscanOutcome={prefix:prefix(),weapon:'rifle',positiveShot:0,hit:null};
  const f=fixture([outcome(7,3,false),miss]);for(const value of f.values)f.game.receiveSoloWorldEvent(f.event(value));expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();
 });
 it('rejects missing or oversized committed identity lists',()=>{
  const f=fixture();f.world.localHitscanOutcomes=undefined as any;f.game.receiveSoloWorldEvent(f.event());
  f.world.localHitscanOutcomes=Array(257).fill(f.values[0]);f.game.receiveSoloWorldEvent(f.event());expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();
 });
});
