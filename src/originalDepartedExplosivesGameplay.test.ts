import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState} from './weapons';
import {createOriginalPlayerHealth} from '../shared/originalPlayerHealth';

const owner='departed-owner';
function player(id:string,name:string){return {id,name,frags:0,deaths:0,score:0,health:100,alive:true,transform:{position:{x:1,y:0,z:2},yaw:0,pitch:0,weapon:'rifle'}};}
function client(map='woodlands'){
 const game=Object.create(Game.prototype) as any;
 Object.assign(game,{mapId:map,archivalWinter:map==='winter',phase:'playing',playerAlive:true,health:100,
  localCallsign:'VICTIM',network:{clientId:'local'},sourceHealth:createOriginalPlayerHealth(100),sourceHealthPrediction:[],sourceHealthAuthorityTime:-Infinity,
  camera:new THREE.PerspectiveCamera(),velocity:new THREE.Vector3(),weaponState:new WeaponState('woodlands'),
  deaths:0,kills:0,hits:0,score:0,firing:false,aiming:false,remotePlayers:new Map(),enemies:[],yaw:0,
  handledNetworkDamageEvents:new Set(),handledNetworkEliminations:new Set(),creditedExplosiveShots:new Set(),
  networkEffectCounts:{damageEvents:0,eliminations:0},audio:{play:vi.fn(),playOriginalHurt:vi.fn()},
  updateHud:vi.fn(),showDamageDirection:vi.fn(),showHitmarker:vi.fn(),playOriginalCombatSound:vi.fn(),
  addKillFeed:vi.fn(),appendChat:vi.fn(),setMessage:vi.fn(),disconnectNetwork:vi.fn(),
  endRound:vi.fn(()=>{game.phase='lost';}),latestNetworkSnapshot:{players:[player('local','VICTIM'),player('remote-victim','OTHER')]}});
 return game;
}
function source(name:string|undefined){return {kind:'explosion',shotId:'shot',projectileId:'projectile',weapon:'rg6',position:{x:999,y:999,z:999},...(name===undefined?{}:{attackerName:name})};}
function damaged(game:any,health=95,lethal=false,name:string|undefined='LAUNCHER',id=owner){game.handleNetworkEvent({type:'damaged',serverTime:1000,data:{attackerId:id,targetId:'local',damage:5,health,sourceHealth:{canonical:health,flick:2},sourceHealthTime:1000,lethal,source:source(name)}});}
function killed(game:any,victimId='remote-victim',name:string|null='LAUNCHER',recipients?:unknown[],killerId=owner){game.handleNetworkEvent({type:'killed',serverTime:1000,data:{killerId,victimId,killerFrags:0,killerScore:0,victimDeaths:1,source:source(name??undefined),...(recipients===undefined?{}:{sourceScoreRecipients:recipients})}});}
function registerVictim(game:any){game.remotePlayers.set('remote-victim',{name:'OTHER',apply:vi.fn()});}
afterEach(()=>vi.unstubAllGlobals());

describe('actual Game departed source explosive attribution',()=>{
 it.each(['barrack','woodlands'])('keeps %s damage and local hurt audio without an available owner actor',map=>{
  const game=client(map);damaged(game);damaged(game);
  expect(game.health).toBe(95);expect(game.sourceHealth.canonical).toBe(95);expect(game.audio.playOriginalHurt).toHaveBeenCalledOnce();
  expect(game.sourceHurt.blend).toBe(0);expect(game.networkEffectCounts.damageEvents).toBe(1);expect(game.hits).toBe(0);
  expect(game.showDamageDirection).not.toHaveBeenCalled();expect(game.showHitmarker).not.toHaveBeenCalled();
 });
 it('preserves the stored departed name on lethal damage and does not credit the victim',()=>{
  const game=client();damaged(game,-1,true);
  expect(game.endRound).toHaveBeenCalledWith(false,'LAUNCHER');expect(game.disconnectNetwork).toHaveBeenCalledOnce();
  expect(game.deaths).toBe(1);expect(game.kills).toBe(0);expect(game.score).toBe(0);expect(game.audio.playOriginalHurt).toHaveBeenCalledOnce();
 });
 it('uses the stored name for a killed-only local receipt after owner snapshot removal',()=>{
  const game=client();killed(game,'local');
  expect(game.endRound).toHaveBeenCalledWith(false,'LAUNCHER');expect(game.deaths).toBe(1);
  expect(game.addKillFeed).toHaveBeenCalledWith('LAUNCHER','YOU');expect(game.appendChat).not.toHaveBeenCalled();
 });
 it('prints departed source owner feedback for a remote death without a fabricated owner actor',()=>{
  const game=client();registerVictim(game);killed(game);killed(game);
  expect(game.appendChat).toHaveBeenCalledOnce();expect(game.appendChat).toHaveBeenCalledWith('','LAUNCHER makes OTHER russian history.','feedback');
  expect(game.addKillFeed).toHaveBeenCalledWith('LAUNCHER','OTHER');expect(game.latestNetworkSnapshot.players[1].alive).toBe(false);
 });
 it('resolves a current matching-name actor for direction rather than the departed id or blast origin',()=>{
  const game=client();game.remotePlayers.set('fresh-session',{name:'lAuNcHeR',alive:true,get sourceActorActive(){return this.alive;},group:new THREE.Group()});
  game.remotePlayers.get('fresh-session').group.position.set(4,0,2);damaged(game);
  expect(game.sourceHurt.blend).toBe(100);expect(Number.isFinite(game.sourceHurt.sourceAngle)).toBe(true);
 });
 it('gives the local matching name direction priority and does not resolve a dead remote',()=>{
  const game=client();game.localCallsign='launcher';game.camera.position.set(3,4,5);game.remotePlayers.set('fresh-session',{name:'LAUNCHER',alive:true,get sourceActorActive(){return this.alive;},group:new THREE.Group()});
  expect(game.originalHurtAttackerNamePosition('LAUNCHER')).toBe(game.camera.position);
  game.localCallsign='VICTIM';game.remotePlayers.get('fresh-session').alive=false;damaged(game);expect(game.sourceHurt.blend).toBe(0);
 });
 it('applies authoritative fresh-session name score without inventing weapon hit credit',()=>{
  const game=client();game.localCallsign='launcher';killed(game,'remote-victim','LAUNCHER',[{playerId:'local',frags:2,score:60}]);
  expect(game.kills).toBe(2);expect(game.score).toBe(60);expect(game.latestNetworkSnapshot.players[0].frags).toBe(2);expect(game.latestNetworkSnapshot.players[0].score).toBe(60);
  expect(game.showHitmarker).not.toHaveBeenCalled();expect(game.setMessage).not.toHaveBeenCalled();expect(game.hits).toBe(0);
 });
 it('does not invent credit for an original id omitted from the authoritative living name recipients',()=>{
  const game=client();killed(game,'remote-victim','LAUNCHER',[],'local');
  expect(game.kills).toBe(0);expect(game.score).toBe(0);expect(game.showHitmarker).not.toHaveBeenCalled();
 });
 it('retains original live owner confirmation when that session receives actual source score',()=>{
  const game=client();killed(game,'remote-victim','LAUNCHER',[{playerId:'local',frags:1,score:30}],'local');
  expect(game.kills).toBe(1);expect(game.score).toBe(30);expect(game.showHitmarker).toHaveBeenCalledWith(true);
 });
 it('preserves legacy missing attribution fallback and authored Winter owner labels',()=>{
  const legacy=client();legacy.latestNetworkSnapshot.players.push(player(owner,'OLD OWNER'));killed(legacy,'remote-victim',null);
  expect(legacy.addKillFeed).toHaveBeenCalledWith('OLD OWNER','OTHER');
  const winter=client('winter');winter.latestNetworkSnapshot.players.push(player(owner,'WINTER OWNER'));killed(winter);
  expect(winter.addKillFeed).toHaveBeenCalledWith('WINTER OWNER','OTHER');expect(winter.appendChat).not.toHaveBeenCalled();
 });
 it('passes markup-like owner names as literal text through actual feedback rendering',()=>{
  const game=client();registerVictim(game);delete game.appendChat;const name='<img src=x onerror=evil()>',log={children:[] as any[],replaceChildren:vi.fn(),scrollTop:0};
  vi.stubGlobal('document',{getElementById:()=>log,createElement:()=>({textContent:'',className:''})});
  killed(game,'remote-victim',name);
  const lines=log.replaceChildren.mock.calls[0];expect(lines[0].textContent).toBe(`${name} makes OTHER russian history.`);
  expect(game.addKillFeed).toHaveBeenCalledWith(name,'OTHER');
 });
});
