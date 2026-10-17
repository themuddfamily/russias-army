import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import type {NetworkSnapshot,NetworkGameEvent} from './network';
import {RemotePlayer} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';

const assets=new URL('../public/assets/',import.meta.url);
type Player=NetworkSnapshot['players'][number];
function player(id:string,name:string,alive=true):Player{return {id,name,alive,health:alive?100:0,maxHealth:100,frags:0,deaths:0,respawnAt:null,sourceMotionTime:0,
 transform:{position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},yaw:-Math.PI,pitch:0,weapon:'rifle',grounded:true}};}
interface Row {textContent:string;className:string;children:Row[];scrollTop:number;scrollHeight:number;replaceChildren(...rows:Row[]):void;append(value:Row):void}
function row():Row{return {textContent:'',className:'',children:[],scrollTop:0,scrollHeight:0,
 replaceChildren(...rows:Row[]){this.children=rows;},append(value:Row){this.children.push(value);}};}
function harness(map='woodlands',archivalWinter=false,negotiated=true){
 const log=row();vi.stubGlobal('document',{getElementById:()=>log,createElement:()=>row()});
 let now=5000;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const gi=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const resources=createOriginalSoldierResources({geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',assets),'utf8')) as OriginalSoldierAssets['geometry'],rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',assets),'utf8')) as OriginalSoldierAssets['rigMotion'],texture:gi},
 {geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',assets),'utf8')) as OriginalWeaponGeometryData,textures});
 const game=Object.create(Game.prototype) as any;
 Object.assign(game,{mapId:map,mode:'online',archivalWinter,phase:'playing',playerAlive:true,needsAuthoritativeSpawn:false,
 network:{clientId:'viewer',state:'connected'},arena:{},scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),remotePlayers:new Map(),sourceTimeoutCorpses:new Set(),originalSoldierResources:resources,
 snowTracks:{resetActor:vi.fn()},attachOriginalDoors:vi.fn(),reconcileNetworkItems:vi.fn(),reconcileNetworkProjectiles:vi.fn(),updateNetworkStatus:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),playOriginalCombatSound:vi.fn()});
 game.resetSourceRemoteView(negotiated?{epoch:1000,generation:1}:undefined);
 const feedback=vi.spyOn(game,'appendChat');
 const snapshot=(players:Player[],tick=0):NetworkSnapshot=>({map:map as NetworkSnapshot['map'],room:'entry',tick,serverTime:1000+tick*1000/30,fragLimit:12,state:'playing',winnerId:null,projectiles:[],players});
 const join=(value:Player)=>game.handleNetworkEvent({type:'join',serverTime:1000,data:{player:value}} satisfies NetworkGameEvent);
 return {game,log,feedback,snapshot,join,time:(callback:number)=>{now=5000+callback*1000/30;},dispose:()=>{game.clearRemotePlayers();resources.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('source entry feedback follows actual Game actor registration',()=>{
 for(const map of ['woodlands','barrack']){
  it(`${map}: a join receipt alone is silent; the first living snapshot registers once with raw feedback`,()=>{
   const s=harness(map),visitor=player('visitor','<img src=x>');
   try{
    s.join(visitor);expect(s.feedback).not.toHaveBeenCalled();expect(s.game.setMessage).not.toHaveBeenCalled();expect(s.game.remotePlayers.size).toBe(0);expect(s.log.children).toHaveLength(0);
    s.game.applyNetworkSnapshot(s.snapshot([visitor]));const actor=s.game.remotePlayers.get(visitor.id);
    expect(actor).toBeInstanceOf(RemotePlayer);expect(actor.sourceActorActive).toBe(true);expect(actor.group.parent).toBe(s.game.scene);
    expect(s.feedback).toHaveBeenCalledExactlyOnceWith('','<img src=x> has entered the arena.','feedback');
    expect(s.log.children[0]).toMatchObject({textContent:'<img src=x> has entered the arena.',className:'feedback'});expect(s.game.setMessage).not.toHaveBeenCalled();
    s.join(visitor);s.game.applyNetworkSnapshot(s.snapshot([visitor],1));s.game.applyNetworkSnapshot(s.snapshot([{...visitor,name:'RENAMED'}],2));
    expect(s.game.remotePlayers.get(visitor.id)).toBe(actor);expect(s.feedback).toHaveBeenCalledTimes(1);expect(s.game.setMessage).not.toHaveBeenCalled();
    expect(s.game.reconcileNetworkItems).toHaveBeenCalledTimes(3);expect(s.game.reconcileNetworkProjectiles).toHaveBeenCalledTimes(3);expect(s.game.updateHud).toHaveBeenCalled();
   }finally{s.dispose();}
  });
  it(`${map}: initial room members announce in registration order, excluding local, same ASCII name and unknown dead records`,()=>{
   const s=harness(map),local=player('viewer','COMRADE');
   try{
    s.game.applyNetworkSnapshot(s.snapshot([local,player('alias','comrade'),player('dead','DEAD',false),player('first','FIRST'),player('second','SECOND')]));
    expect([...s.game.remotePlayers.keys()]).toEqual(['first','second']);
    expect(s.feedback.mock.calls).toEqual([['','FIRST has entered the arena.','feedback'],['','SECOND has entered the arena.','feedback']]);
    expect(s.log.children.map(line=>line.textContent)).toEqual(['SECOND has entered the arena.','FIRST has entered the arena.','']);expect(s.game.setMessage).not.toHaveBeenCalled();
    s.game.applyNetworkSnapshot(s.snapshot([local,player('first','FIRST'),player('second','SECOND')],1));expect(s.feedback).toHaveBeenCalledTimes(2);
   }finally{s.dispose();}
  });
 }
 it('pending dead and omitted living registrations do not announce again; completed death allows fresh same-ID registration beside its old corpse',()=>{
  const s=harness(),visitor=player('visitor','OLD');
  try{
   s.game.applyNetworkSnapshot(s.snapshot([visitor]));const old=s.game.remotePlayers.get(visitor.id) as RemotePlayer;s.feedback.mockClear();
   s.game.applyNetworkSnapshot(s.snapshot([],1));s.game.applyNetworkSnapshot(s.snapshot([visitor],2));
   expect(s.game.remotePlayers.get(visitor.id)).toBe(old);expect(s.feedback).not.toHaveBeenCalled();
   s.game.applyNetworkSnapshot(s.snapshot([{...visitor,alive:false,health:0}],3));
   expect(old.sourceActorActive).toBe(true);expect(old.alive).toBe(false);s.game.applyNetworkSnapshot(s.snapshot([{...visitor,alive:false,health:0}],4));expect(s.feedback).not.toHaveBeenCalled();
   s.time(1);s.game.advanceSourceRemoteView();expect(s.game.remotePlayers.has(visitor.id)).toBe(false);expect(s.game.sourceTimeoutCorpses.has(old)).toBe(true);
   expect(old.sourceActorActive).toBe(false);expect(old.group.parent).toBe(s.game.scene);expect(s.feedback).not.toHaveBeenCalled();
   s.game.applyNetworkSnapshot(s.snapshot([{...visitor,alive:false,health:0}],5));expect(s.game.remotePlayers.has(visitor.id)).toBe(false);expect(s.feedback).not.toHaveBeenCalled();
   s.game.applyNetworkSnapshot(s.snapshot([{...visitor,name:'FRESH'}],6));const fresh=s.game.remotePlayers.get(visitor.id);
   expect(fresh).toBeInstanceOf(RemotePlayer);expect(fresh).not.toBe(old);expect(fresh.sourceActorActive).toBe(true);expect(s.game.sourceTimeoutCorpses.has(old)).toBe(true);expect(old.group.parent).toBe(s.game.scene);
   expect(s.feedback).toHaveBeenCalledExactlyOnceWith('','FRESH has entered the arena.','feedback');
  }finally{s.dispose();}
 });
 for(const adapter of [{winter:true,negotiated:false},{winter:false,negotiated:false}])it(`legacy adapter winter=${adapter.winter} retains the join banner/system message`,()=>{
  const s=harness('woodlands',adapter.winter,adapter.negotiated),visitor=player('visitor','ADAPTER');
  try{
   s.join(visitor);expect(s.game.setMessage).toHaveBeenCalledExactlyOnceWith('ADAPTER JOINED',1.2);expect(s.feedback).toHaveBeenCalledExactlyOnceWith('','ADAPTER has entered the arena.','system');expect(s.game.remotePlayers.size).toBe(0);
   s.game.applyNetworkSnapshot(s.snapshot([visitor]));expect(s.game.remotePlayers.get(visitor.id)).toBeInstanceOf(RemotePlayer);expect(s.feedback).toHaveBeenCalledTimes(1);
  }finally{s.dispose();}
 });
 it('won/lost source phases keep their existing event and snapshot gate',()=>{
  const s=harness();
  try{for(const phase of ['won','lost']){s.game.phase=phase;s.join(player('visitor','VISITOR'));s.game.applyNetworkSnapshot(s.snapshot([player('visitor','VISITOR')]));}
   expect(s.game.remotePlayers.size).toBe(0);expect(s.feedback).not.toHaveBeenCalled();expect(s.game.setMessage).not.toHaveBeenCalled();expect(s.game.reconcileNetworkItems).not.toHaveBeenCalled();
  }finally{s.dispose();}
 });
});
