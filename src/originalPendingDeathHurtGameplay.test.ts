import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalPlayerHealth} from '../shared/originalPlayerHealth';

const base=new URL('../public/assets/',import.meta.url);
function resources(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const r=createOriginalSoldierResources({geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')),texture} as OriginalSoldierAssets,
  {geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures});
 return {r,dispose(){r.dispose();texture.dispose();for(const item of textures.values())item.dispose();}};
}
const actorState=(id:string,name:string,x=4):RemoteState=>({id,name,x,y:0,z:2,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true,sourceMotionTime:0});
function harness(map:'barrack'|'woodlands'){
 let now=1000;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const owned=resources(),g=Object.create(Game.prototype) as any,camera=new THREE.PerspectiveCamera();camera.position.set(0,1.72,0);
 Object.assign(g,{mapId:map,archivalWinter:false,phase:'playing',mode:'online',playerAlive:true,localCallsign:'VICTIM',network:{clientId:'local'},camera,yaw:0,
  health:100,sourceHealth:createOriginalPlayerHealth(100),sourceHealthPrediction:[],sourceHealthAuthorityTime:-Infinity,
  handledNetworkDamageEvents:new Set(),networkEffectCounts:{damageEvents:0},remotePlayers:new Map(),sourceTimeoutCorpses:new Set(),scene:new THREE.Scene(),
  sourceRemoteViewEpoch:1000,sourceRemoteViewLocalStart:1000,sourceRemoteViewCallbacks:0,
  audio:{play:vi.fn(),playOriginalHurt:vi.fn()},updateHud:vi.fn(),flushOriginalReconciliation:vi.fn(),playOriginalCombatSound:vi.fn(),
  snowTracks:{resetActor:vi.fn()},appendChat:vi.fn(),showDamageDirection:vi.fn()});
 const add=(state:RemoteState)=>{
  const remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true,true);remote.apply(state,true);g.remotePlayers.set(remote.id,remote);g.scene.add(remote.group);return remote;
 };
 return {g,add,callback(){now=1000+1000/30;g.advanceSourceRemoteView();},dispose(){g.clearRemotePlayers();owned.dispose();}};
}
function damage(g:any,time=1000,name='lAuNcHeR'){
 g.handleNetworkEvent({type:'damaged',serverTime:time,data:{attackerId:'old-departed-session',targetId:'local',damage:5,health:95,sourceHealth:{canonical:95,flick:2},sourceHealthTime:time,lethal:false,
  source:{kind:'explosion',shotId:`shot-${time}`,projectileId:`projectile-${time}`,weapon:'rg6',attackerName:name,position:{x:999,y:999,z:999}}}});
}
const angle=(x:number)=>Math.atan2(-x,2)*180/Math.PI;
afterEach(()=>vi.restoreAllMocks());

describe('actual Game source hurt name lookup includes registered pending-death baddies',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} resolves the case-folded pending-death owner pose and stops resetting art after its actual callback removal`,()=>{
   const s=harness(map),state=actorState('owner','LAUNCHER'),owner=s.add(state);
   try{
    owner.apply({...state,alive:false,health:0,x:999,z:999});expect(owner.alive).toBe(false);expect(owner.sourceActorActive).toBe(true);
    damage(s.g);expect(s.g.sourceHurt.blend).toBe(100);expect(s.g.sourceHurt.sourceAngle).toBeCloseTo(angle(4),12);
    expect(s.g.sourceHurt.sourceAngle).not.toBe(-45);expect(s.g.audio.playOriginalHurt).toHaveBeenCalledOnce();
    s.callback();expect(owner.sourceActorActive).toBe(false);expect(s.g.remotePlayers.has(owner.id)).toBe(false);expect(s.g.sourceTimeoutCorpses.has(owner)).toBe(true);
    s.g.sourceHurt.blend=37;const retained={...s.g.sourceHurt};damage(s.g,1034);
    expect(s.g.sourceHurt).toEqual(retained);expect(s.g.audio.playOriginalHurt).toHaveBeenCalledTimes(2);expect(s.g.networkEffectCounts.damageEvents).toBe(2);
    expect(s.g.showDamageDirection).not.toHaveBeenCalled();expect(s.g.audio.play).not.toHaveBeenCalled();
   }finally{s.dispose();}
  });

  it(`${map} preserves first matching registered actor priority over a same-named live replacement`,()=>{
   const s=harness(map),state=actorState('old','LaUnChEr'),owner=s.add(state),replacement=s.add(actorState('replacement','LAUNCHER',-4));
   try{
    owner.apply({...state,alive:false,health:0});damage(s.g);
    expect(s.g.sourceHurt.blend).toBe(100);expect(s.g.sourceHurt.sourceAngle).toBeCloseTo(angle(4),12);expect(replacement.alive).toBe(true);
    s.callback();damage(s.g,1034,'launcher');
    expect(s.g.remotePlayers.get('replacement')).toBe(replacement);expect(s.g.sourceHurt.blend).toBe(100);expect(s.g.sourceHurt.sourceAngle).toBeCloseTo(angle(-4),12);
   }finally{s.dispose();}
  });

  it(`${map} resolves an ordinary live owner by stored name rather than the unrelated departed session id`,()=>{
   const s=harness(map),owner=s.add(actorState('new-session','LAUNCHER'));
   try{damage(s.g);expect(owner.alive).toBe(true);expect(owner.sourceActorActive).toBe(true);expect(s.g.sourceHurt.blend).toBe(100);expect(s.g.sourceHurt.sourceAngle).toBeCloseTo(angle(4),12);}
   finally{s.dispose();}
  });

  it(`${map} leaves existing directional art unchanged when no registered owner name matches`,()=>{
   const s=harness(map);s.add(actorState('unrelated','OTHER'));
   try{
    s.g.sourceHurt={blend:37,sourceAngle:-77};damage(s.g,1000,'ABSENT');
    expect(s.g.sourceHurt).toEqual({blend:37,sourceAngle:-77});expect(s.g.health).toBe(95);expect(s.g.audio.playOriginalHurt).toHaveBeenCalledOnce();
   }finally{s.dispose();}
  });
 }
});
