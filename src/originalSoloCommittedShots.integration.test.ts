import {describe,it,expect,vi} from 'vitest';
import {presentationFixture} from './originalSoloLoadedScenePresentation.fixture';
import type {ReceiverLocalHitscanOutcome} from '../shared/originalReceiverLocalHitscan';

const cycle=(f:ReturnType<typeof presentationFixture>,time:number)=>{f.prepare(time);f.worlds.completeGoody(time);f.game.completeSoloActors();};

// Complete decoded resources, actual report bank/CURRENT/Game/coordinator and
// remote model/FX owners. Positive geometry outcomes are explicit CPU inputs;
// this establishes the installed transport phase, not native packet timing.
describe('committed human reports through complete Solo remote firing presentation',()=>{
 it.each([
  ['barrack','pistol'],['woodlands','pistol'],['barrack','shotgun'],['woodlands','shotgun'],
 ] as const)('%s %s publishes once at the following where after joint retry', (map,weapon)=>{
  const f=presentationFixture(map);let failure:{mockRestore():void}|undefined;
  try{
   f.game.keys.add(weapon==='pistol'?'Digit1':'Digit2');cycle(f,0);f.game.keys.clear();f.player.weapon=weapon;
   f.game.shots=11;f.game.hits=4;const health=f.player.health.canonical;
   const banks=f.owners.get('player')!.banks;if(!('weaponReportWorld' in banks))throw Error('Missing actual human report bank');
   const bank=banks.weaponReportWorld,prefix=bank.freeze().prefix,count=weapon==='shotgun'?2:1;
   if(prefix.kind!=='callback')throw Error('Expected completed callback report prefix');
   const tx=bank.begin();
   const outcome:ReceiverLocalHitscanOutcome={prefix,weapon,positiveShot:1,hit:{handle:'declared-fixed-surface',geometryProvenance:'explicit positive CPU input',layer:'fixed',faceIndex:0,distance:4,point:{x:1,y:2,z:3},normal:{x:0,y:1,z:0}}};
   for(let i=0;i<count;i++)tx.record(outcome);tx.prepareCommit()();
   const sink=vi.spyOn(f.worlds,'reportShots'),begin=f.events.length;
   f.prepare(1/30);failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('report late peer');});
   expect(()=>f.worlds.completeGoody(1/30)).toThrow('report late peer');failure.mockRestore();failure=undefined;
   expect(bank.freeze().shots).toBe(count);expect(sink).not.toHaveBeenCalled();expect(f.events).toHaveLength(begin);
   f.worlds.completeGoody(1/30);f.game.completeSoloActors();
   const report=f.player.weaponReports!.find(event=>event.report.shots!==undefined)!;
   expect(report.report.shots).toBe(count);expect(Object.isFrozen(f.player.weaponReports)).toBe(true);expect(bank.freeze().shots).toBe(0);
   expect(sink).toHaveBeenCalledExactlyOnceWith('player',count);f.game.receiveSoloWorldEvent(report);expect(sink).toHaveBeenCalledOnce();
   expect(f.events.slice(begin).filter(event=>event.kind==='shot'&&event.ownerId==='player')).toEqual([]);
   const next=f.events.length;cycle(f,2/30);
   const shots=f.events.slice(next).filter(event=>event.kind==='shot'&&event.ownerId==='player');
   expect(shots.map(event=>event.recipientId)).toEqual(['a','b']);for(const event of shots)if(event.kind==='shot')expect(event.weapon).toBe(weapon);
   const after=f.events.length;cycle(f,3/30);expect(f.events.slice(after).filter(event=>event.kind==='shot'&&event.ownerId==='player')).toEqual([]);
   expect(sink).toHaveBeenCalledOnce();expect(f.game.shots).toBe(11);expect(f.game.hits).toBe(4);expect(f.player.health.canonical).toBe(health);
  }finally{failure?.mockRestore();f.dispose();}
 });
});
