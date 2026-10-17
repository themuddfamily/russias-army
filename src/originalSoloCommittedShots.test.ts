import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {OriginalReceiverWeaponReportWorld,copyReceiverWeaponReportPayload,type ReceiverWeaponReportPayload} from '../shared/originalReceiverWeaponReportWorld';
import type {ReceiverLocalHitscanOutcome} from '../shared/originalReceiverLocalHitscan';
import type {OriginalSoloEvent} from '../shared/originalSoloObserverWorld';

type ReportEvent=Extract<OriginalSoloEvent,{kind:'weapon-report'}>;
const prefix=(life=7,callback=3)=>Object.freeze({kind:'callback' as const,sceneGeneration:life,callback});
function reportEvent(raw:ReceiverWeaponReportPayload={shots:2},life=7,callback=3):ReportEvent {
 return Object.freeze({kind:'weapon-report',recipientId:'player',lifeGeneration:life,time:10,prefix:prefix(life,callback),report:copyReceiverWeaponReportPayload(raw,256,65536)});
}
function fixture(events:readonly ReportEvent[]=[reportEvent()]) {
 const world={id:'player',lifeGeneration:7,callback:3,weaponReports:Object.freeze([...events])};
 const worlds={worlds:new Map<string,typeof world>([['player',world]]),reportShots:vi.fn()};
 const game=Object.assign(Object.create(Game.prototype),{phase:'playing',mode:'solo',archivalWinter:false,arena:{runtime:{}},
  soloWorlds:worlds,shots:11,hits:4,health:100,score:9,updateHud:vi.fn(),playOriginalCombatSound:vi.fn(),showHitmarker:vi.fn()}) as any;
 return {game,world,worlds,events:world.weaponReports};
}
function ray(hit:boolean,actor=false):ReceiverLocalHitscanOutcome {
 return {prefix:prefix(),weapon:'shotgun',positiveShot:hit?1:0,
  hit:hit?{handle:actor?'baddy:target':'floor',geometryProvenance:'declared-CPU-query',layer:actor?'live-gi':'fixed',faceIndex:0,distance:4,point:{x:1,y:2,z:3},normal:{x:0,y:1,z:0}}:null,
  ...(actor?{hurt:{actorId:'target',name:'Target',amount:18 as const,sourcePositionWorld:{x:4,y:5,z:6}}}:{})};
}

// Actual Game consumer and report bank/copier, with explicit CPU committed
// observer ownership. reportShots is the post-commit remote muzzle-report sink;
// these tests do not claim native renderer timing or authority damage.
describe('Solo committed positive-intersection shot reports',()=>{
 it('forwards the real report bank count including both SPAS rays and fixed hits, excluding misses',()=>{
  const bank=new OriginalReceiverWeaponReportWorld({prefix:prefix(7,2),shots:0,hurts:[]},{maxNames:256,maxTextChars:65536,maxCommands:16});
  try{
   const tx=bank.begin();tx.admitPrefix(prefix());tx.record(ray(true,true));tx.record(ray(true,true));tx.record(ray(true));tx.record(ray(false));
   const report=tx.send();expect(report).toEqual({shots:3,hurts:[{name:'Target',amount:36}]});tx.prepareCommit()();
   const f=fixture([reportEvent(report)]);f.game.receiveSoloWorldEvent(f.events[0]);f.game.receiveSoloWorldEvent(f.events[0]);
   expect(f.worlds.reportShots).toHaveBeenCalledExactlyOnceWith('player',3);expect(bank.freeze().shots).toBe(0);
   expect({shots:f.game.shots,hits:f.game.hits,health:f.game.health,score:f.game.score}).toEqual({shots:11,hits:4,health:100,score:9});
   expect(f.game.updateHud).not.toHaveBeenCalled();expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();expect(f.game.showHitmarker).not.toHaveBeenCalled();
  }finally{bank.release();}
 });
 it('rejects equal-value forged event and payload identities before accepting the exact publication',()=>{
  const f=fixture(),event=f.events[0];
  f.game.receiveSoloWorldEvent({...event});f.game.receiveSoloWorldEvent({...event,report:{...event.report}});
  expect(f.worlds.reportShots).not.toHaveBeenCalled();f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).toHaveBeenCalledOnce();
 });
 it('accepts distinct committed rows in reverse delivery order once each',()=>{
  const f=fixture([reportEvent({shots:1}),reportEvent({shots:2})]);
  for(const event of [...f.events].reverse()){f.game.receiveSoloWorldEvent(event);f.game.receiveSoloWorldEvent(event);}
  expect(f.worlds.reportShots.mock.calls).toEqual([['player',2],['player',1]]);
 });
 it('rejects an unfrozen authentication list without consuming its later frozen publication',()=>{
  const f=fixture(),event=f.events[0];f.world.weaponReports=[event];f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).not.toHaveBeenCalled();
  f.world.weaponReports=Object.freeze([event]);f.game.receiveSoloWorldEvent(event);f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).toHaveBeenCalledExactlyOnceWith('player',2);
 });
 it('accepts a distinct newly committed frozen batch at the same callback without replaying its prior batch',()=>{
  const f=fixture(),old=f.events[0];f.game.receiveSoloWorldEvent(old);const fresh=reportEvent({shots:3});
  f.world.weaponReports=Object.freeze([fresh]);f.game.receiveSoloWorldEvent(old);f.game.receiveSoloWorldEvent(fresh);f.game.receiveSoloWorldEvent(fresh);
  expect(f.worlds.reportShots.mock.calls).toEqual([['player',2],['player',3]]);expect(f.world.callback).toBe(3);
 });
 it.each([false,true])('clears consumption on actual Solo teardown (preserve presentation %s)',preservePresentation=>{
  const f=fixture(),event=f.events[0];f.game.receiveSoloWorldEvent(event);expect(f.game.soloCommittedWeaponReports).toBeDefined();
  const clear=vi.fn(()=>f.worlds.worlds.clear());Object.assign(f.worlds,{clear});f.game.disposeSoloWorlds(preservePresentation);
  expect(clear).toHaveBeenCalledOnce();expect(f.game.soloCommittedWeaponReports).toBeUndefined();expect(f.game.soloWorlds).toBeUndefined();
  f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).toHaveBeenCalledOnce();
 });
 it('uses the immutable detached captured count rather than a subsequently changed input',()=>{
  const raw={shots:2,hurts:[{name:'Target',amount:18}]},event=reportEvent(raw),f=fixture([event]);raw.shots=99;raw.hurts[0].amount=999;
  expect(Object.isFrozen(event.report)).toBe(true);expect(Object.isFrozen(event.report.hurts![0])).toBe(true);
  f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).toHaveBeenCalledExactlyOnceWith('player',2);
 });
 it('consumes before a throwing sink so retry never queues the same count again',()=>{
  const f=fixture([reportEvent({shots:1}),reportEvent({shots:2})]),sentinel=Error('report sink failed');f.worlds.reportShots.mockImplementationOnce(()=>{throw sentinel;});
  expect(()=>f.game.receiveSoloWorldEvent(f.events[0])).toThrow(sentinel);f.game.receiveSoloWorldEvent(f.events[0]);f.game.receiveSoloWorldEvent(f.events[1]);
  expect(f.worlds.reportShots.mock.calls).toEqual([['player',1],['player',2]]);
 });
 it('consumes before a reentrant sink and still accepts another distinct committed row',()=>{
  const f=fixture([reportEvent({shots:1}),reportEvent({shots:2})]);
  f.worlds.reportShots.mockImplementationOnce(()=>{f.game.receiveSoloWorldEvent(f.events[0]);f.game.receiveSoloWorldEvent(f.events[1]);});
  f.game.receiveSoloWorldEvent(f.events[0]);f.game.receiveSoloWorldEvent(f.events[1]);expect(f.worlds.reportShots.mock.calls).toEqual([['player',1],['player',2]]);
 });
 it('does not publish a rollbackable report send, and authenticates only the committed retry',()=>{
  const bank=new OriginalReceiverWeaponReportWorld({prefix:prefix(7,2),shots:1,hurts:[]},{maxNames:16,maxTextChars:1024,maxCommands:16});
  try{
   const f=fixture([]),tx=bank.begin();tx.admitPrefix(prefix());const rejected=reportEvent(tx.send());tx.prepareCommit();tx.rollback();
   f.game.receiveSoloWorldEvent(rejected);expect(f.worlds.reportShots).not.toHaveBeenCalled();expect(bank.freeze().shots).toBe(1);
   const retry=bank.begin();retry.admitPrefix(prefix());const event=reportEvent(retry.send());retry.prepareCommit()();f.world.weaponReports=Object.freeze([event]);
   f.game.receiveSoloWorldEvent(rejected);f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).toHaveBeenCalledExactlyOnceWith('player',1);
  }finally{bank.release();}
 });
 it('rejects stale callback, foreign generation and receipt prefixes even if present in the list',()=>{
  for(const event of [reportEvent({shots:1},7,2),reportEvent({shots:1},6),Object.freeze({...reportEvent(),prefix:{kind:'receipt' as const,sceneGeneration:7,callback:3,tick:4}}) as unknown as ReportEvent]){
   const f=fixture([event]);f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).not.toHaveBeenCalled();
  }
 });
 it('rejects removed ownership and event life mismatches',()=>{
  const f=fixture(),event=f.events[0];f.game.receiveSoloWorldEvent({...event,lifeGeneration:6});f.worlds.worlds.delete('player');f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).not.toHaveBeenCalled();
 });
 it('accepts fresh same-id observer ownership and rejects the previous life event',()=>{
  const f=fixture();f.game.receiveSoloWorldEvent(f.events[0]);const event=reportEvent({shots:3},8),fresh={...f.world,lifeGeneration:8,weaponReports:Object.freeze([event])};
  f.worlds.worlds.set('player',fresh);f.game.receiveSoloWorldEvent(f.events[0]);f.game.receiveSoloWorldEvent(event);f.game.receiveSoloWorldEvent(event);
  expect(f.worlds.reportShots.mock.calls).toEqual([['player',2],['player',3]]);
 });
 it.each(['online','winter','paused','bot'])('rejects %s delivery',kind=>{
  let event=reportEvent();if(kind==='bot')event=Object.freeze({...event,recipientId:'bot'});
  const f=fixture([event]);if(kind==='online')f.game.mode='online';if(kind==='winter')f.game.archivalWinter=true;if(kind==='paused')f.game.phase='paused';if(kind==='bot')f.worlds.worlds.set('bot',f.world);
  f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).not.toHaveBeenCalled();
 });
 it('does not forward absent positive-shot counts in empty or hurt-only reports',()=>{
  const f=fixture([reportEvent({}),reportEvent({hurts:[{name:'Target',amount:6}]})]);for(const event of f.events)f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).not.toHaveBeenCalled();expect(f.game.health).toBe(100);
 });
 it('rejects missing or oversized committed authentication lists',()=>{
  const f=fixture(),event=f.events[0];f.world.weaponReports=undefined as any;f.game.receiveSoloWorldEvent(event);
  f.world.weaponReports=Object.freeze(Array(257).fill(event));f.game.receiveSoloWorldEvent(event);expect(f.worlds.reportShots).not.toHaveBeenCalled();
 });
});
