import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import {Game} from './game';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';

const assets=new URL('../public/assets/',import.meta.url);
const state:RemoteState={id:'source',name:'SOURCE',x:0,y:0,z:0,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true,sourceMotionTime:0};
afterEach(()=>vi.restoreAllMocks());

it('actual Game member feedback follows remote death and fresh actor registration while standing records stay stale',()=>{
 const gi=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const r=createOriginalSoldierResources({geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',assets),'utf8')) as OriginalSoldierAssets['geometry'],rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',assets),'utf8')) as OriginalSoldierAssets['rigMotion'],texture:gi},
  {geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',assets),'utf8')) as OriginalWeaponGeometryData,textures});
 const remote=new RemotePlayer(state.id,state.name,undefined,r,true),g=Object.create(Game.prototype) as any;
 let now=5000;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const standing={players:[{id:'local',name:'OLD LOCAL',alive:true},{id:state.id,name:state.name,alive:false},{id:'unregistered',name:'NO ACTOR',alive:true}]};
 Object.assign(g,{archivalWinter:false,mode:'online',playerAlive:true,localCallsign:'LOCAL',scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),remotePlayers:new Map([[state.id,remote]]),sourceTimeoutCorpses:new Set(),snowTracks:{resetActor:vi.fn()},playOriginalCombatSound:vi.fn(),appendChat:vi.fn(),latestNetworkSnapshot:standing});
 try{
  g.scene.add(remote.group);remote.apply(state,true);g.resetSourceRemoteView({epoch:1000,generation:1});g.showCurrentMembers();
  expect(g.appendChat).toHaveBeenLastCalledWith('','Members: LOCAL SOURCE ','feedback');
  remote.apply({...state,alive:false,health:0});expect(remote.alive).toBe(false);expect(remote.sourceActorActive).toBe(true);g.showCurrentMembers();
  expect(g.appendChat).toHaveBeenLastCalledWith('','Members: LOCAL SOURCE ','feedback');
  now+=1000/30;g.advanceSourceRemoteView();expect(g.sourceTimeoutCorpses.has(remote)).toBe(true);expect(g.remotePlayers.has(state.id)).toBe(false);expect(remote.sourceActorActive).toBe(false);
  g.showCurrentMembers();expect(g.appendChat).toHaveBeenLastCalledWith('','Members: LOCAL ','feedback');
  const fresh=new RemotePlayer(state.id,'FRESH',undefined,r,true);g.remotePlayers.set(state.id,fresh);g.scene.add(fresh.group);fresh.apply({...state,name:'FRESH'},true);
  g.showCurrentMembers();expect(g.appendChat).toHaveBeenLastCalledWith('','Members: LOCAL FRESH ','feedback');
  expect(g.sourceTimeoutCorpses.has(remote)).toBe(true);expect(g.latestNetworkSnapshot).toBe(standing);
 }finally{g.clearRemotePlayers();r.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}
});
