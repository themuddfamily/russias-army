import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState} from './weapons';
import {createOriginalPlayerHealth} from '../shared/originalPlayerHealth';

function client(map='woodlands',typing=false,health=100){
 const game=Object.create(Game.prototype) as any;
 Object.assign(game,{mapId:map,archivalWinter:map==='winter',phase:'playing',playerAlive:true,mode:'solo',chatOpen:typing,
  health,sourceHealth:createOriginalPlayerHealth(health),sourceHealthPrediction:[],sourceHealthAuthorityTime:-Infinity,
  sourceEscapePending:false,needsAuthoritativeSpawn:false,localCallsign:'COMRADE',elapsed:0,armor:100,invulnerableUntil:100,
  camera:new THREE.PerspectiveCamera(),velocity:new THREE.Vector3(1,2,3),keys:new Set(),weaponState:new WeaponState('woodlands'),
  enemies:[],remotePlayers:new Map(),firing:true,aiming:false,rightMouseAiming:false,controlsPreset:'legacy',arrowMovement:false,
  deaths:0,kills:0,hits:0,score:0,damageOpacity:0,handledNetworkDamageEvents:new Set(),handledNetworkEliminations:new Set(),
  networkEffectCounts:{damageEvents:0,eliminations:0},audio:{play:vi.fn(),playOriginalHurt:vi.fn()},
  updateHud:vi.fn(),showNetworkDamage:vi.fn(),showDamageDirection:vi.fn(),showHitmarker:vi.fn(),playOriginalCombatSound:vi.fn(),
  addKillFeed:vi.fn(),appendChat:vi.fn(),setMessage:vi.fn(),publishNetworkTransform:vi.fn(),pause:vi.fn(),resume:vi.fn(),disconnectNetwork:vi.fn(),
  endRound:vi.fn(()=>{game.phase='lost';}),closeChat:vi.fn(()=>{game.chatOpen=false;})});
 vi.stubGlobal('document',{exitPointerLock:vi.fn()});
 return game;
}
function key(repeat=false,ctrlKey=false){return {code:'Escape',repeat,ctrlKey,metaKey:false,altKey:false,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()} as unknown as KeyboardEvent;}
function online(game:any,accepted=true){game.mode='online';game.network={clientId:'local',connected:true,sourceEscape:vi.fn(()=>accepted),flushTransform:vi.fn()};return game.network;}
function damaged(game:any,health:number,lethal:boolean,time=1000){game.handleNetworkEvent({type:'damaged',serverTime:time,data:{attackerId:'',targetId:'local',damage:1000,health,sourceHealth:{canonical:health,flick:2},sourceHealthTime:time,lethal,source:{kind:'cowardice',direct:false,attackerId:null}}});}
function killed(game:any){game.handleNetworkEvent({type:'killed',serverTime:1000,data:{killerId:'',victimId:'local',killerFrags:0,victimDeaths:1,source:{kind:'cowardice',direct:false,attackerId:null}}});}
afterEach(()=>vi.unstubAllGlobals());

describe('actual Game source Escape and Cowardice lifecycle',()=>{
 it('ends Barrack walking directly even with enough health to survive a thousand-point hurt',()=>{
  const game=client('barrack',false,2000);game.keyDown(key());
  expect(game.playerAlive).toBe(false);expect(game.deaths).toBe(1);expect(game.endRound).toHaveBeenCalledWith(false,'Cowardice');
  expect(game.sourceHealth.canonical).toBe(2000);expect(game.pause).not.toHaveBeenCalled();
  expect(game.audio.playOriginalHurt).not.toHaveBeenCalled();expect(game.playOriginalCombatSound).not.toHaveBeenCalled();
 });
 it.each([['woodlands',false],['woodlands',true],['barrack',true]])('hurts %s with typing=%s rather than forcing death', (map,typing)=>{
  const game=client(map as string,typing as boolean,1100);game.keyDown(key());
  expect(game.health).toBe(100);expect(game.sourceHealth.canonical).toBe(100);expect(game.playerAlive).toBe(true);
  expect(game.endRound).not.toHaveBeenCalled();expect(game.pause).not.toHaveBeenCalled();expect(game.closeChat).not.toHaveBeenCalled();
 });
 it('routes the ordinary Woodlands lethal hurt to the literal Cowardice cause exactly once',()=>{
  const game=client();game.keyDown(key());game.keyDown(key());
  expect(game.deaths).toBe(1);expect(game.endRound).toHaveBeenCalledTimes(1);expect(game.endRound).toHaveBeenCalledWith(false,'Cowardice');
 });
 it('uses the recovered flick boundary for a thousand-point hurt at exactly one thousand health',()=>{
  const positive=client('woodlands',true,1000);positive.keyDown(key());expect(positive.health).toBe(0);expect(positive.playerAlive).toBe(true);
  const negative=client('woodlands',true,1000);negative.sourceHealth.flick=-2;negative.keyDown(key());expect(negative.playerAlive).toBe(false);expect(negative.endRound).toHaveBeenCalledWith(false,'Cowardice');
 });
 it('retains Winter Escape pause and typing cancellation',()=>{
  const walking=client('winter');walking.keyDown(key());expect(walking.pause).toHaveBeenCalledOnce();expect(walking.health).toBe(100);
  const typing=client('winter',true);typing.keyDown(key());expect(typing.closeChat).toHaveBeenCalledOnce();expect(typing.health).toBe(100);
 });
 it('does not turn browser modifier chords into source requests',()=>{
  const game=client('woodlands',false,2100),network=online(game);game.keyDown(key(false,true));
  expect(network.sourceEscape).not.toHaveBeenCalled();expect(game.health).toBe(2100);
 });
 it('publishes source typing state and waits for one authoritative request rather than predicting hurt',()=>{
  const game=client('barrack',true,1100),network=online(game);game.requestSourceEscape();game.requestSourceEscape();
  expect(network.sourceEscape).toHaveBeenCalledOnce();expect(game.publishNetworkTransform).toHaveBeenCalledOnce();
  expect(game.publishNetworkTransform.mock.invocationCallOrder[0]).toBeLessThan(network.sourceEscape.mock.invocationCallOrder[0]);
  expect(game.sourceEscapePending).toBe(true);expect(game.health).toBe(1100);expect(game.chatOpen).toBe(true);expect(game.disconnectNetwork).not.toHaveBeenCalled();
 });
 it('allows retry after an unavailable transport without consuming a local life',()=>{
  const game=client(),network=online(game,false);game.requestSourceEscape();expect(game.sourceEscapePending).toBe(false);
  network.sourceEscape.mockReturnValue(true);game.requestSourceEscape();expect(network.sourceEscape).toHaveBeenCalledTimes(2);expect(game.health).toBe(100);
 });
 it('ignores requests outside a live source round and while authoritative spawn is pending',()=>{
  for(const change of [{phase:'lost'},{playerAlive:false},{archivalWinter:true},{needsAuthoritativeSpawn:true}]){
   const game=client(),network=online(game);Object.assign(game,change);game.requestSourceEscape();expect(network.sourceEscape).not.toHaveBeenCalled();
  }
 });
 it('restores nonlethal authority and retains the source local hurt sample without inventing an attacker position',()=>{
  const game=client('woodlands',true,1100);online(game);game.sourceEscapePending=true;damaged(game,100,false);
  expect(game.sourceEscapePending).toBe(false);expect(game.health).toBe(100);expect(game.playerAlive).toBe(true);expect(game.chatOpen).toBe(true);
  expect(game.showNetworkDamage).not.toHaveBeenCalled();expect(game.disconnectNetwork).not.toHaveBeenCalled();expect(game.audio.playOriginalHurt).toHaveBeenCalledOnce();expect(game.sourceHurt.blend).toBe(0);
 });
 it('waits for the real killed event after lethal cause damage, then leaves once with the source cause',()=>{
  const game=client();online(game);game.latestNetworkSnapshot={players:[{id:'local',name:'COMRADE',frags:0,deaths:0,health:100,alive:true,transform:{position:{x:0,y:0,z:0},yaw:0,pitch:0,weapon:'rifle'}}]};game.sourceEscapePending=true;damaged(game,-900,true);
  expect(game.disconnectNetwork).not.toHaveBeenCalled();expect(game.endRound).not.toHaveBeenCalled();
  killed(game);killed(game);
  expect(game.endRound).toHaveBeenCalledOnce();expect(game.endRound).toHaveBeenCalledWith(false,'Cowardice');expect(game.disconnectNetwork).toHaveBeenCalledOnce();expect(game.deaths).toBe(1);
  expect(game.appendChat).not.toHaveBeenCalled();
  expect(game.playOriginalCombatSound).not.toHaveBeenCalled();
 });
 it('does not treat a remote Cowardice cause as a shot hit or emit remote weapon hurt audio',()=>{
  const game=client();online(game);const remote={flinch:vi.fn()};game.remotePlayers.set('remote',remote);
  game.handleNetworkEvent({type:'damaged',serverTime:1000,data:{attackerId:'local',targetId:'remote',damage:1000,health:100,lethal:false,source:{kind:'cowardice',direct:false,attackerId:'local'}}});
  expect(game.hits).toBe(0);expect(remote.flinch).not.toHaveBeenCalled();expect(game.showHitmarker).not.toHaveBeenCalled();expect(game.playOriginalCombatSound).not.toHaveBeenCalled();
 });
 it('accepts actual Cowardice-name kill credit without producing a weapon confirmation effect',()=>{
  const game=client();online(game);game.playerName=vi.fn((id:string)=>id==='local'?'Cowardice':'OTHER');
  const remote={apply:vi.fn()};game.remotePlayers.set('remote',remote);
  game.latestNetworkSnapshot={players:[{id:'remote',name:'OTHER',frags:0,deaths:0,health:100,alive:true,transform:{position:{x:1,y:0,z:2},yaw:0,pitch:0,weapon:'rifle'}}]};
  const event={type:'killed',serverTime:1000,data:{killerId:'local',victimId:'remote',killerFrags:2,killerScore:60,victimDeaths:1,source:{kind:'cowardice',direct:true,attackerId:'local'}}};
  game.handleNetworkEvent(event);game.handleNetworkEvent(event);
  expect(game.kills).toBe(2);expect(game.score).toBe(60);expect(game.addKillFeed).toHaveBeenCalledOnce();expect(game.addKillFeed).toHaveBeenCalledWith('Cowardice','OTHER');
  expect(game.appendChat).toHaveBeenCalledOnce();expect(game.appendChat).toHaveBeenCalledWith('','Cowardice makes OTHER russian history.','feedback');
  expect(remote.apply).toHaveBeenCalledOnce();expect(remote.apply.mock.calls[0][0]).toMatchObject({id:'remote',alive:false,health:0});
  expect(game.showHitmarker).not.toHaveBeenCalled();expect(game.playOriginalCombatSound).toHaveBeenCalledOnce();
  expect(game.playOriginalCombatSound).toHaveBeenCalledWith('hurt',{x:1,y:1.72,z:2});expect(game.setMessage).not.toHaveBeenCalled();
 });
 it('does not announce or create an unknown remote baddie from a standing-only death event',()=>{
  const game=client();online(game);
  game.latestNetworkSnapshot={players:[{id:'unknown',name:'UNKNOWN',frags:0,deaths:0,health:100,alive:true,transform:{position:{x:1,y:0,z:2},yaw:0,pitch:0,weapon:'rifle'}}]};
  game.handleNetworkEvent({type:'killed',serverTime:1000,data:{killerId:'other',victimId:'unknown',killerFrags:1,victimDeaths:1,source:{kind:'cowardice',direct:true,attackerId:'other'}}});
  expect(game.appendChat).not.toHaveBeenCalled();expect(game.playOriginalCombatSound).not.toHaveBeenCalled();expect(game.remotePlayers.size).toBe(0);
 });
 it.each([['barrack',true],['barrack',false],['woodlands',true],['woodlands',false]])('%s remote Cowardice direct=%s starts fadeaway hurt once without weapon credit',(map,direct)=>{
  const game=client(map as string);online(game);game.playerName=vi.fn(()=> 'VICTIM');
  const remote={apply:vi.fn()};game.remotePlayers.set('remote',remote);
  game.latestNetworkSnapshot={players:[{id:'remote',name:'VICTIM',frags:0,deaths:0,health:100,alive:true,transform:{position:{x:4,y:3,z:5},yaw:0,pitch:0,weapon:'pistol'}}]};
  const event={type:'killed',serverTime:1000,data:{killerId:'',victimId:'remote',killerFrags:0,victimDeaths:1,source:{kind:'cowardice',direct,attackerId:null}}};
  game.handleNetworkEvent(event);game.handleNetworkEvent(event);
  expect(game.playOriginalCombatSound).toHaveBeenCalledOnce();expect(game.playOriginalCombatSound).toHaveBeenCalledWith('hurt',{x:4,y:4.72,z:5});
  expect(remote.apply).toHaveBeenCalledOnce();expect(remote.apply.mock.calls[0][0].alive).toBe(false);
  expect(game.audio.playOriginalHurt).not.toHaveBeenCalled();expect(game.hits).toBe(0);expect(game.kills).toBe(0);expect(game.score).toBe(0);
  expect(game.showHitmarker).not.toHaveBeenCalled();expect(game.disconnectNetwork).not.toHaveBeenCalled();
 });
 it.each(['barrack','woodland'])('pins %s remote death audio to the unconditional fadeaway constructor',map=>{
  const directory=`../docs/research-evidence/2026-09-30/director-script-extraction/${map}/casts/parents/`;
  const baddies=readFileSync(new URL(directory+'ParentScript 8 - baddies.ls',import.meta.url),'utf8');
  const fadeaway=readFileSync(new URL(directory+'ParentScript 9 - fadeaway.ls',import.meta.url),'utf8');
  const die=baddies.slice(baddies.indexOf('on die me'),baddies.indexOf('on hurt me'));
  expect(die).toContain('fadeaway = script("fadeaway", "parents").new(pmod, pos)');
  expect(die).not.toContain('Cowardice');
  const constructor=fadeaway.slice(fadeaway.indexOf('on new me'),fadeaway.indexOf('on stepFrame me'));
  expect(constructor).toContain('playsound(pos, "hurt")');expect(constructor.indexOf('playsound(pos, "hurt")')).toBeLessThan(constructor.indexOf('if hit.count > 0 then'));
 });
 it.each(['barrack','woodland'])('pins the %s primary MUS remote death feedback phrase and own-message exclusion',map=>{
  const source=readFileSync(new URL(`../docs/research-evidence/2026-09-30/director-script-extraction/${map}/casts/parents/MovieScript 4 - M U S.ls`,import.meta.url),'utf8');
  expect(source).toContain('wri = vkiller & " makes " & vsend & " russian history."');
  expect(source).toContain('goody.feedback(wri)');
  expect(source).toContain('if vsend <> nom then');
 });
 // The recovered handlers are keyDownScript callbacks. Browser-generated
 // repeats are an input adapter; this test does not establish native repeat timing.
 it('handles actual repeated keydown events after surviving authority without polling Escape in movie callbacks',()=>{
  const game=client('woodlands',true,2100),network=online(game);game.firing=false;game.nextSourceReloadPoll=-Infinity;
  game.keyDown(key());game.keyDown(key(true));game.updateSourceWeaponInput();expect(network.sourceEscape).toHaveBeenCalledOnce();
  expect(game.keys.has('Escape')).toBe(false);
  game.elapsed=1/30;game.updateSourceWeaponInput();expect(network.sourceEscape).toHaveBeenCalledOnce();
  damaged(game,1100,false);game.elapsed=2/30;game.updateSourceWeaponInput();expect(network.sourceEscape).toHaveBeenCalledOnce();
  game.keyDown(key(true));expect(network.sourceEscape).toHaveBeenCalledTimes(2);
  damaged(game,100,false,1034);game.elapsed=3/30;game.updateSourceWeaponInput();expect(network.sourceEscape).toHaveBeenCalledTimes(2);
 });
 it('applies successive delivered source keydown events in solo typing without a render-time gate',()=>{
  const game=client('woodlands',true,2100);game.keyDown(key());expect(game.health).toBe(1100);
  game.keyDown(key(true));expect(game.health).toBe(100);expect(game.playerAlive).toBe(true);expect(game.chatOpen).toBe(true);
 });
 it.each(['Cowardice','cOwArDiCe'])('credits an actual actor named %s for direct death and gives local name priority',name=>{
  const game=client('barrack');const actor={name,alive:true,frags:4,group:new THREE.Group()};game.enemies=[actor];game.requestSourceEscape();
  expect(actor.frags).toBe(5);expect(game.addKillFeed).toHaveBeenCalledWith('Cowardice','YOU');
  const self=client('barrack');self.localCallsign=name;self.enemies=[actor];self.requestSourceEscape();expect(actor.frags).toBe(5);expect(self.kills).toBe(0);expect(self.score).toBe(0);
 });
 it('suppresses the browser unlock pause for source Escape and restores ordinary unlock behavior after recapture',()=>{
  const game=client('woodlands',false,1100);game.renderer={domElement:{}};game.keyDown(key());
  game.handlePointerLockChange();expect(game.pause).not.toHaveBeenCalled();
  vi.stubGlobal('document',{pointerLockElement:game.renderer.domElement});game.handlePointerLockChange();expect(game.sourceEscapeCaptureReleased).toBe(false);
  vi.stubGlobal('document',{pointerLockElement:null});game.handlePointerLockChange();expect(game.pause).toHaveBeenCalledOnce();
  const winter=client('winter');winter.renderer={domElement:{}};winter.sourceEscapeCaptureReleased=true;winter.handlePointerLockChange();expect(winter.pause).toHaveBeenCalledOnce();
 });
});
