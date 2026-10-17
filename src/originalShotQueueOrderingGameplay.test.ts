import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {OriginalRemoteView} from '../shared/originalRemoteView';

const base=new URL('../public/assets/',import.meta.url);
const soldierGeometry=JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'];
const soldierMotion=JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'];
const gunGeometry=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData;
function fixture(map:'barrack'|'woodlands',actors=1){
 const soldierTexture=new THREE.Texture(),weaponTextures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const resources=createOriginalSoldierResources({geometry:soldierGeometry,rigMotion:soldierMotion,texture:soldierTexture},
  {geometry:gunGeometry,textures:weaponTextures});
 const scene=new THREE.Scene(),remotes:RemotePlayer[]=[],states:RemoteState[]=[];
 for(let i=0;i<actors;i++){
  const state:RemoteState={id:`actor${i}`,name:`ACTOR${i}`,x:i*2,y:0,z:0,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true};
  const remote=new RemotePlayer(state.id,state.name,undefined,resources,true,true);scene.add(remote.group);remote.apply(state,true);states.push(state);remotes.push(remote);
 }
 const game=Object.create(Game.prototype) as any;
 Object.assign(game,{mapId:map,archivalWinter:false,phase:'playing',mode:'online',scene,camera:new THREE.PerspectiveCamera(),
  network:{clientId:'viewer'},sourceRemoteViewEpoch:0,sourceRemoteViewLocalStart:0,sourceRemoteViewCallbacks:0,
  remotePlayers:new Map(remotes.map(remote=>[remote.id,remote])),sourceTimeoutCorpses:new Set(),handledNetworkShots:new Set(),
  snowTracks:{resetActor:vi.fn()},updateHud:vi.fn(),appendChat:vi.fn(),playOriginalCombatSound:vi.fn(),spawnNetworkTracer:vi.fn()});
 return {game,remotes,states,dispose:()=>{for(const remote of remotes)remote.dispose();resources.dispose();soldierTexture.dispose();for(const texture of weaponTextures.values())texture.dispose();}};
}
afterEach(()=>vi.restoreAllMocks());

describe('actual Game source queued shooting callback order',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} keeps shot receipts inert and emits queued sound at the pre-movement callback position`,()=>{
   let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);const s=fixture(map),remote=s.remotes[0];
   try{
    remote.apply({...s.states[0],x:.09,sourceShots:1});
    s.game.handleNetworkEvent({type:'shot',serverTime:0,data:{playerId:remote.id,shot:{shotId:'receipt',weapon:'rifle',origin:{x:9,y:9,z:9},direction:{x:0,y:0,z:-1}}}});
    expect(remote.debugState().original!.timeMs).toBe(0);expect(remote.debugState().sourceShots).toEqual({misses:1,aiming:0});
    expect(s.game.playOriginalCombatSound).not.toHaveBeenCalled();expect(s.game.spawnNetworkTracer).toHaveBeenCalledTimes(1);
    expect(s.game.advanceSourceRemoteView()).toBe(0);expect(s.game.playOriginalCombatSound).not.toHaveBeenCalled();
    now=1000/30;expect(s.game.advanceSourceRemoteView()).toBe(1);
    expect(s.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('gunfire',{x:0,y:1.72,z:0});
    expect(remote.debugState().rendered.x).toBeCloseTo(.01,12);expect(remote.debugState().sourceShots).toEqual({misses:0,aiming:2});
    expect(remote.debugState().original!.timeMs).toBeGreaterThan(1000);
   }finally{s.dispose();}
  });

  it(`${map} catches up in callback-major registration order and matches sequential callbacks and the authority mirror`,()=>{
   let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);const batch=fixture(map,2),single=fixture(map,2),mirror=new OriginalRemoteView(0,{},'source-callback');
   try{
    for(const s of [batch,single])for(let i=0;i<2;i++)s.remotes[i].apply({...s.states[i],sourceShots:2});
    expect(mirror.recordSent({tick:0,sentAt:0,targets:batch.states.map(state=>({id:state.id,position:{x:state.x,y:state.y,z:state.z},yaw:state.yaw,motionTime:0,alive:true,weapon:state.weapon,sourceShots:2}))})).toEqual({ok:true});
    expect(mirror.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toEqual({ok:true});
    now=4*1000/30;expect(batch.game.advanceSourceRemoteView()).toBe(4);
    for(let callback=1;callback<=4;callback++){now=callback*1000/30;expect(single.game.advanceSourceRemoteView()).toBe(callback);}
    expect(batch.game.playOriginalCombatSound.mock.calls).toEqual(single.game.playOriginalCombatSound.mock.calls);
    expect(batch.game.playOriginalCombatSound.mock.calls.map((call:any[])=>call[1].x)).toEqual([0,2,0,2]);
    const shots=[1,4].flatMap(callback=>[0,1].map(index=>({callback,id:`actor${index}`,position:{x:index*2,y:0,z:0},weapon:'rifle' as const})));
    expect(mirror.accept({callbacks:4,receipts:[]},4*1000/30)).toEqual({ok:true,shots,events:shots.map(shot=>({kind:'shot',shot}))});
    for(let i=0;i<2;i++){
     expect(batch.remotes[i].debugState()).toEqual(single.remotes[i].debugState());
     const actual=batch.remotes[i].debugState(),pose=mirror.freeze().find(p=>p.id===batch.remotes[i].id)!;
     expect(actual.rendered).toEqual({...pose.position,yaw:pose.yaw});expect(actual.original!.timeMs).toBe(pose.motionTime);
    }
   }finally{batch.dispose();single.dispose();}
  });

  it(`${map} consumes pending shots before the pending death callback and hurt sound`,()=>{
   let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);const s=fixture(map),remote=s.remotes[0];
   try{
    remote.apply({...s.states[0],sourceShots:1});remote.apply({...s.states[0],alive:false,health:0});
    now=1000/30;expect(s.game.advanceSourceRemoteView()).toBe(1);
    expect(s.game.playOriginalCombatSound.mock.calls.map((call:any[])=>call[0])).toEqual(['gunfire','hurt']);
    expect(s.game.playOriginalCombatSound.mock.calls[0][1]).toEqual({x:0,y:1.72,z:0});
    expect(s.game.remotePlayers.has(remote.id)).toBe(false);expect(s.game.sourceTimeoutCorpses.has(remote)).toBe(true);
    expect(remote.debugState().original).toMatchObject({timeMs:3000,deathBon:0});expect(remote.debugState().sourceShots).toEqual({misses:0,aiming:2});
   }finally{s.dispose();}
  });
 }
});
