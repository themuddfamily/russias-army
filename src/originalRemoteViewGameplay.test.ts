import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {RemotePlayer,type RemoteState,type RemoteTimeout} from './remotePlayer';
import type {NetworkSnapshot} from './network';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {OriginalRemoteView} from '../shared/originalRemoteView';
interface ClockGame {sourceRemoteViewEpoch:number|null;sourceRemoteViewGeneration:number|null;sourceRemoteViewLocalStart:number;sourceRemoteViewCallbacks:number;phase:string;scene:THREE.Scene;snowTracks:{resetActor:ReturnType<typeof vi.fn>};latestNetworkSnapshot?:{players:{id:string}[]};remotePlayers:Map<string,{update:(delta:number,position:THREE.Vector3,callbacks:number)=>RemoteTimeout|undefined}>;sourceTimeoutCorpses:Set<RemotePlayer>;appendChat:ReturnType<typeof vi.fn>;playOriginalCombatSound:ReturnType<typeof vi.fn>;resetSourceRemoteView(state?:{epoch:number;generation:number}):void;advanceSourceRemoteView():number;applyNetworkSnapshot(snapshot:NetworkSnapshot):void;clearRemotePlayers():void}
function harness(){
 let now=5000;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const game=Object.create(Game.prototype) as ClockGame;
 Object.assign(game,{remotePlayers:new Map(),sourceTimeoutCorpses:new Set(),camera:new THREE.PerspectiveCamera(),phase:'playing',scene:new THREE.Scene(),snowTracks:{resetActor:vi.fn()},appendChat:vi.fn(),playOriginalCombatSound:vi.fn(),
  mapId:'woodlands',mode:'online',archivalWinter:false,network:{clientId:'viewer'},arena:{},attachOriginalDoors:vi.fn(),reconcileNetworkItems:vi.fn(),reconcileNetworkProjectiles:vi.fn(),updateNetworkStatus:vi.fn(),updateHud:vi.fn()});
 game.resetSourceRemoteView({epoch:1000,generation:1});
 const actor=()=>{const update=vi.fn();return {update,steps:()=>update.mock.calls.reduce((sum,call)=>sum+call[2],0)};};
 return {game,actor,time:(elapsed:number)=>{now=5000+elapsed;}};
}
const base=new URL('../public/assets/',import.meta.url);
function resources(){return createOriginalSoldierResources({geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'],rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'],texture:new THREE.Texture()},
 {geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});}
const state:RemoteState={id:'target',name:'TARGET',x:0,y:0,z:0,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true,sourceMotionTime:0};
function snapshot(callback:number,targets:RemoteState[]=[]):NetworkSnapshot{return {map:'woodlands',room:'source-timeout',tick:callback,serverTime:1000+callback*1000/30,fragLimit:12,state:'playing',winnerId:null,projectiles:[],players:targets.map(target=>({id:target.id,name:target.name,health:target.health,maxHealth:100,frags:target.frags,deaths:target.deaths,alive:target.alive,respawnAt:null,sourceMotionTime:target.sourceMotionTime,transform:{position:{x:target.x,y:target.y,z:target.z},velocity:{x:0,y:0,z:0},yaw:target.yaw,pitch:target.pitch,weapon:target.weapon,grounded:true}}))};}
afterEach(()=>vi.restoreAllMocks());
describe('actual Game shared source remote view clock',()=>{
 it('retains fractional time and gives every actor the same whole callbacks exactly once',()=>{
  const s=harness(),a=s.actor(),b=s.actor();s.game.remotePlayers.set('a',a);s.game.remotePlayers.set('b',b);
  s.time(1000/60);expect(s.game.advanceSourceRemoteView()).toBe(0);expect(a.steps()).toBe(0);
  s.time(1000/30);expect(s.game.advanceSourceRemoteView()).toBe(1);expect(a.steps()).toBe(1);expect(b.steps()).toBe(1);
  for(let i=0;i<5;i++)expect(s.game.advanceSourceRemoteView()).toBe(1);expect(a.steps()).toBe(1);expect(b.steps()).toBe(1);
  s.time(85);expect(s.game.advanceSourceRemoteView()).toBe(2);expect(a.steps()).toBe(2);expect(b.steps()).toBe(2);
  expect(a.update.mock.calls).toEqual(b.update.mock.calls);
 });
 it('actor creation and removal preserve the global callback clock',()=>{
  const s=harness(),old=s.actor();s.game.remotePlayers.set('old',old);s.time(200);expect(s.game.advanceSourceRemoteView()).toBe(6);
  const fresh=s.actor();s.game.remotePlayers.set('new',fresh);expect(s.game.advanceSourceRemoteView()).toBe(6);expect(fresh.steps()).toBe(0);
  s.time(300);expect(s.game.advanceSourceRemoteView()).toBe(9);expect(old.steps()).toBe(9);expect(fresh.steps()).toBe(3);
  s.game.remotePlayers.delete('old');s.time(400);expect(s.game.advanceSourceRemoteView()).toBe(12);expect(fresh.steps()).toBe(6);
 });
 for(const phase of ['paused','results','menu'])it(`receipt advancement progresses during ${phase} and the getter sees the completed callback`,()=>{
  const s=harness(),a=s.actor();s.game.remotePlayers.set('a',a);s.game.phase=phase;s.time(200);
  // These are the actual Game methods backing NetworkClient's receipt hooks.
  const beforeReceipt=()=>s.game.advanceSourceRemoteView(),getCallbacks=()=>s.game.sourceRemoteViewCallbacks;
  expect(beforeReceipt()).toBe(6);expect(getCallbacks()).toBe(6);expect(a.steps()).toBe(6);
  expect(beforeReceipt()).toBe(6);expect(getCallbacks()).toBe(6);expect(a.steps()).toBe(6);
 });
 it('a welcome resets generation and callback zero relative to local delivery, and disconnect disables stepping',()=>{
  const s=harness(),a=s.actor();s.game.remotePlayers.set('a',a);s.time(200);s.game.advanceSourceRemoteView();
  s.game.resetSourceRemoteView({epoch:10000,generation:2});expect(s.game.sourceRemoteViewGeneration).toBe(2);expect(s.game.sourceRemoteViewEpoch).toBe(10000);expect(s.game.sourceRemoteViewCallbacks).toBe(0);
  expect(s.game.advanceSourceRemoteView()).toBe(0);s.time(250);expect(s.game.advanceSourceRemoteView()).toBe(1);
  const steps=a.steps();s.game.resetSourceRemoteView();s.time(1000);expect(s.game.advanceSourceRemoteView()).toBe(0);expect(a.steps()).toBe(steps);expect(s.game.sourceRemoteViewGeneration).toBeNull();
 });
 it('a stopped tab exceeds the work bound without inventing callback progress; a new generation resumes',()=>{
  const s=harness(),a=s.actor();s.game.remotePlayers.set('a',a);s.time(100);expect(s.game.advanceSourceRemoteView()).toBe(3);
  s.time(140000);expect(s.game.advanceSourceRemoteView()).toBe(3);expect(a.steps()).toBe(3);expect(s.game.advanceSourceRemoteView()).toBe(3);
  s.game.resetSourceRemoteView({epoch:141000,generation:2});expect(s.game.advanceSourceRemoteView()).toBe(0);s.time(140100);expect(s.game.advanceSourceRemoteView()).toBe(3);expect(a.steps()).toBe(6);
 });
 it('ordinary death enters on the next baddie callback then retains its corpse for76 fade callbacks',()=>{
  const s=harness(),r=resources(),remote=new RemotePlayer('target','TARGET',undefined,r,true);remote.apply(state,true);remote.apply({...state,alive:false,health:0,sourceMotionTime:2400});
  s.game.remotePlayers.set('target',remote);s.game.scene.add(remote.group);s.game.latestNetworkSnapshot={players:[]};const dispose=vi.spyOn(remote,'dispose');
  try{
   expect(remote.debugState().original).toMatchObject({alive:true,timeMs:0});expect(s.game.playOriginalCombatSound).not.toHaveBeenCalled();
   s.time(1000/30);expect(s.game.advanceSourceRemoteView()).toBe(1);expect(remote.debugState().original).toMatchObject({alive:false,deathBon:0,timeMs:3000});
   expect(s.game.remotePlayers.has('target')).toBe(false);expect(s.game.sourceTimeoutCorpses.has(remote)).toBe(true);expect(remote.group.parent).toBe(s.game.scene);
   expect(s.game.appendChat).not.toHaveBeenCalled();expect(s.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('hurt',{x:0,y:1.72,z:0});
   s.time(76*1000/30);expect(s.game.advanceSourceRemoteView()).toBe(76);expect(remote.debugState().original).toMatchObject({deathBon:600,removed:false,timeMs:3000});
   expect(s.game.sourceTimeoutCorpses.has(remote)).toBe(true);expect(remote.group.parent).toBe(s.game.scene);expect(dispose).not.toHaveBeenCalled();
   s.time(77*1000/30);expect(s.game.advanceSourceRemoteView()).toBe(77);expect(s.game.sourceTimeoutCorpses.has(remote)).toBe(false);expect(remote.group.parent).toBeNull();expect(dispose).toHaveBeenCalledTimes(1);expect(s.game.snowTracks.resetActor).toHaveBeenCalledExactlyOnceWith('remote:target');
   s.game.advanceSourceRemoteView();expect(dispose).toHaveBeenCalledTimes(1);expect(s.game.playOriginalCombatSound).toHaveBeenCalledTimes(1);
  }finally{if(!dispose.mock.calls.length)remote.dispose();r.dispose();}
 });
 it('ordinary corpse cleanup is independent of its dead owner remaining in the latest snapshot',()=>{
  const s=harness(),r=resources(),remote=new RemotePlayer('target','TARGET',undefined,r,true);remote.apply(state,true);remote.apply({...state,alive:false,health:0,sourceMotionTime:2400});
  s.game.remotePlayers.set('target',remote);s.game.scene.add(remote.group);s.game.latestNetworkSnapshot={players:[{id:'target'}]};const dispose=vi.spyOn(remote,'dispose');
  try{
   s.time(120*1000/30);expect(s.game.advanceSourceRemoteView()).toBe(120);expect(remote.debugState().original).toMatchObject({removed:true,deathBon:608});expect(remote.hitMeshes).toHaveLength(0);
   expect(s.game.remotePlayers.has('target')).toBe(false);expect(s.game.sourceTimeoutCorpses.has(remote)).toBe(false);expect(dispose).toHaveBeenCalledTimes(1);expect(remote.group.parent).toBeNull();
   s.game.latestNetworkSnapshot={players:[]};expect(s.game.advanceSourceRemoteView()).toBe(120);expect(dispose).toHaveBeenCalledTimes(1);expect(s.game.snowTracks.resetActor).toHaveBeenCalledExactlyOnceWith('remote:target');
  }finally{if(!dispose.mock.calls.length)remote.dispose();r.dispose();}
 });
 it('dead snapshots cannot replace a pending baddie target or gun, or recreate its detached corpse',()=>{
  const s=harness(),r=resources();Object.assign(s.game,{originalSoldierResources:r});
  s.game.applyNetworkSnapshot(snapshot(0,[{...state,x:2}]));const remote=s.game.remotePlayers.get('target') as RemotePlayer;
  expect(s.game.appendChat).toHaveBeenCalledExactlyOnceWith('','TARGET has entered the arena.','feedback');s.game.appendChat.mockClear();
  try{
   remote.apply({...state,x:11,weapon:'launcher',sourceMotionTime:440});
   const dead={...state,x:99,y:99,z:99,weapon:'pistol' as const,health:0,alive:false,sourceMotionTime:3008};
   s.game.applyNetworkSnapshot(snapshot(0,[dead]));s.game.applyNetworkSnapshot(snapshot(0,[dead]));
   expect(remote.alive).toBe(false);expect(remote.weapon).toBe('launcher');expect(remote.debugState().rendered.x).toBe(2);
   // No actor callbacks ran: source newstuff preserves the birth phase0.
   expect(remote.debugState().sourceMovement?.steps).toBe(10);expect(remote.debugState().original).toMatchObject({alive:true,timeMs:0});
   expect(s.game.advanceSourceRemoteView()).toBe(0);expect(s.game.remotePlayers.get('target')).toBe(remote);expect(s.game.playOriginalCombatSound).not.toHaveBeenCalled();
   s.time(1000/30);s.game.advanceSourceRemoteView();expect(remote.debugState().rendered.x).toBe(3);expect(remote.weapon).toBe('launcher');
   expect(remote.debugState().original).toMatchObject({timeMs:3000,deathBon:0});expect(s.game.remotePlayers.has('target')).toBe(false);expect(s.game.sourceTimeoutCorpses.has(remote)).toBe(true);
   s.game.applyNetworkSnapshot(snapshot(1,[dead]));expect(s.game.remotePlayers.size).toBe(0);expect(s.game.sourceTimeoutCorpses.size).toBe(1);
   s.time(2*1000/30);s.game.advanceSourceRemoteView();expect(remote.debugState().original).toMatchObject({timeMs:2408,deathBon:8});
   expect(s.game.appendChat).not.toHaveBeenCalled();expect(s.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('hurt',{x:3,y:1.72,z:0});
  }finally{s.game.clearRemotePlayers();r.dispose();}
 });
 it('real dead RemotePlayer processes more than thirty explicit callbacks without the ordinary animation delta clamp',()=>{
  const r=resources(),remote=new RemotePlayer('target','TARGET',undefined,r,true);remote.apply(state,true);remote.apply({...state,alive:false,health:0,sourceMotionTime:2400});
  try{expect(remote.update(2,undefined,60)).toMatchObject({reason:'death',callbackOffset:1});expect(remote.debugState().original).toMatchObject({timeMs:2872,deathBon:472,removed:false});expect(remote.update(17/30,undefined,17)).toBeUndefined();expect(remote.debugState().original).toMatchObject({timeMs:3008,deathBon:608,removed:true});}
  finally{remote.dispose();r.dispose();}
 });
 it('actual snapshot omission retains a living baddie through459 callbacks, then detaches its corpse and emits feedback and hurt once',()=>{
  const s=harness(),r=resources();Object.assign(s.game,{originalSoldierResources:r});
  s.game.applyNetworkSnapshot(snapshot(0,[{...state,x:2,y:3,z:4}]));
  expect(s.game.appendChat).toHaveBeenCalledExactlyOnceWith('','TARGET has entered the arena.','feedback');s.game.appendChat.mockClear();
  const remote=s.game.remotePlayers.get('target') as RemotePlayer,dispose=vi.spyOn(remote,'dispose');
  try{
   // Advance the real Game method at each nominal callback. Fresh omitted
   // snapshots exercise Game's omission path; transport validation is separate.
   for(let callback=1;callback<=459;callback++){
    s.time(callback*1000/30);expect(s.game.advanceSourceRemoteView()).toBe(callback);
    if(callback%3===0)s.game.applyNetworkSnapshot(snapshot(callback));
   }
   expect(s.game.remotePlayers.get('target')).toBe(remote);expect(remote.alive).toBe(true);expect(remote.debugState().sourceMovement?.steps).toBe(-449);
   expect(s.game.sourceTimeoutCorpses.size).toBe(0);expect(s.game.appendChat).not.toHaveBeenCalled();expect(s.game.playOriginalCombatSound).not.toHaveBeenCalled();
   s.time(460*1000/30);expect(s.game.advanceSourceRemoteView()).toBe(460);
   expect(s.game.remotePlayers.has('target')).toBe(false);expect(s.game.sourceTimeoutCorpses.has(remote)).toBe(true);expect(remote.group.parent).toBe(s.game.scene);
   expect(remote.debugState().original).toMatchObject({alive:false,timeMs:3000,deathBon:0,removed:false});expect(dispose).not.toHaveBeenCalled();
   expect(s.game.appendChat).toHaveBeenCalledExactlyOnceWith('','TARGET is disconnected','feedback');
   expect(s.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('hurt',{x:2,y:4.72,z:4});
   expect(s.game.snowTracks.resetActor).toHaveBeenCalledExactlyOnceWith('remote:target');
   s.game.advanceSourceRemoteView();s.game.applyNetworkSnapshot(snapshot(460));
   expect(s.game.appendChat).toHaveBeenCalledTimes(1);expect(s.game.playOriginalCombatSound).toHaveBeenCalledTimes(1);
   s.time(461*1000/30);s.game.advanceSourceRemoteView();expect(remote.debugState().original).toMatchObject({timeMs:2408,deathBon:8,removed:false});
   for(let callback=462;callback<=535;callback++){s.time(callback*1000/30);s.game.advanceSourceRemoteView();}
   expect(remote.debugState().original).toMatchObject({deathBon:600,removed:false});expect(s.game.sourceTimeoutCorpses.has(remote)).toBe(true);
   s.time(536*1000/30);s.game.advanceSourceRemoteView();expect(remote.debugState().original).toMatchObject({deathBon:608,removed:true});
   expect(s.game.sourceTimeoutCorpses.size).toBe(0);expect(remote.group.parent).toBeNull();expect(dispose).toHaveBeenCalledTimes(1);
   s.game.advanceSourceRemoteView();expect(dispose).toHaveBeenCalledTimes(1);expect(s.game.appendChat).toHaveBeenCalledTimes(1);expect(s.game.playOriginalCombatSound).toHaveBeenCalledTimes(1);
  }finally{s.game.clearRemotePlayers();r.dispose();}
 });
 it('a later trusted snapshot constructs a fresh same-ID actor while the old timeout corpse continues fading',()=>{
  const s=harness(),r=resources();Object.assign(s.game,{originalSoldierResources:r});s.game.applyNetworkSnapshot(snapshot(0,[state]));
  const old=s.game.remotePlayers.get('target') as RemotePlayer,dispose=vi.spyOn(old,'dispose');
  try{
   for(let callback=1;callback<=460;callback++){s.time(callback*1000/30);s.game.advanceSourceRemoteView();if(callback%3===0)s.game.applyNetworkSnapshot(snapshot(callback));}
   const freshState={...state,x:9,z:-4,sourceMotionTime:440};s.game.applyNetworkSnapshot(snapshot(460,[freshState]));
   const fresh=s.game.remotePlayers.get('target') as RemotePlayer;
   expect(fresh).not.toBe(old);expect(fresh.alive).toBe(true);expect(fresh.debugState().sourceMovement?.steps).toBe(10);expect(fresh.debugState().rendered).toMatchObject({x:9,y:0,z:-4});
   expect(old.alive).toBe(false);expect(s.game.sourceTimeoutCorpses.has(old)).toBe(true);expect(old.group.parent).toBe(s.game.scene);expect(fresh.group.parent).toBe(s.game.scene);
   for(let callback=461;callback<=535;callback++){
    s.time(callback*1000/30);s.game.advanceSourceRemoteView();if(callback%3===0)s.game.applyNetworkSnapshot(snapshot(callback,[freshState]));
   }
   expect(old.debugState().original).toMatchObject({deathBon:600,removed:false});expect(fresh.alive).toBe(true);expect(dispose).not.toHaveBeenCalled();
   s.time(536*1000/30);s.game.advanceSourceRemoteView();expect(dispose).toHaveBeenCalledTimes(1);expect(s.game.sourceTimeoutCorpses.size).toBe(0);
   expect(s.game.remotePlayers.get('target')).toBe(fresh);expect(fresh.alive).toBe(true);expect(fresh.group.parent).toBe(s.game.scene);
   expect(s.game.appendChat.mock.calls).toEqual([['','TARGET has entered the arena.','feedback'],['','TARGET is disconnected','feedback'],['','TARGET has entered the arena.','feedback']]);expect(s.game.playOriginalCombatSound).toHaveBeenCalledTimes(1);
  }finally{s.game.clearRemotePlayers();r.dispose();}
 });
 it('orders timeout effects by callback offset within a batch and never advances a new corpse twice',()=>{
  const s=harness(),r=resources();Object.assign(s.game,{originalSoldierResources:r});s.game.applyNetworkSnapshot(snapshot(0,[state]));
  const earlier=s.game.remotePlayers.get('target') as RemotePlayer;
  try{
   for(let callback=1;callback<=10;callback++){s.time(callback*1000/30);s.game.advanceSourceRemoteView();}
   s.game.applyNetworkSnapshot(snapshot(10,[{...state,id:'later',name:'LATER',x:3}]));
   const later=s.game.remotePlayers.get('later') as RemotePlayer;
   expect(s.game.appendChat.mock.calls).toEqual([['','TARGET has entered the arena.','feedback'],['','LATER has entered the arena.','feedback']]);s.game.appendChat.mockClear();
   // Reverse insertion order to ensure the effects do not simply follow the map.
   s.game.remotePlayers.delete('target');s.game.remotePlayers.set('target',earlier);
   for(let callback=11;callback<=450;callback++){s.time(callback*1000/30);s.game.advanceSourceRemoteView();if(callback%3===0)s.game.applyNetworkSnapshot(snapshot(callback));}
   s.time(475*1000/30);expect(s.game.advanceSourceRemoteView()).toBe(475);
   expect(s.game.appendChat.mock.calls).toEqual([['','TARGET is disconnected','feedback'],['','LATER is disconnected','feedback']]);
   expect(s.game.playOriginalCombatSound.mock.calls).toEqual([['hurt',{x:0,y:1.72,z:0}],['hurt',{x:3,y:1.72,z:0}]]);
   expect(earlier.debugState().original).toMatchObject({deathBon:120,timeMs:2520});expect(later.debugState().original).toMatchObject({deathBon:40,timeMs:2440});
   expect(s.game.sourceTimeoutCorpses.size).toBe(2);expect(s.game.remotePlayers.size).toBe(0);
   s.game.advanceSourceRemoteView();expect(earlier.debugState().original?.deathBon).toBe(120);expect(later.debugState().original?.deathBon).toBe(40);
   const earlyDispose=vi.spyOn(earlier,'dispose'),lateDispose=vi.spyOn(later,'dispose');s.game.clearRemotePlayers();
   expect(earlyDispose).toHaveBeenCalledTimes(1);expect(lateDispose).toHaveBeenCalledTimes(1);expect(s.game.sourceTimeoutCorpses.size).toBe(0);
   expect(earlier.group.parent).toBeNull();expect(later.group.parent).toBeNull();s.game.clearRemotePlayers();expect(earlyDispose).toHaveBeenCalledTimes(1);expect(lateDispose).toHaveBeenCalledTimes(1);
  }finally{s.game.clearRemotePlayers();r.dispose();}
 });
 it('receipts advance existing real soldiers before packet application and phase-only fire matches the mirror between callbacks',()=>{
  const s=harness(),r=resources(),remote=new RemotePlayer('target','TARGET',undefined,r,true),mirror=new OriginalRemoteView(1000);
  s.game.remotePlayers.set('target',remote);remote.apply(state,true);mirror.recordSent({tick:0,sentAt:1000,targets:[{id:'target',position:{x:0,y:0,z:0},yaw:state.yaw,motionTime:0,alive:true}]});mirror.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},1000);
  try{
   s.time(100);const cb=s.game.advanceSourceRemoteView();expect(cb).toBe(3);
   const packet={...state,x:9,yaw:0,sourceMotionTime:440};remote.apply(packet);mirror.recordSent({tick:1,sentAt:1100,targets:[{id:'target',position:{x:9,y:0,z:0},yaw:packet.yaw,motionTime:440,alive:true}]});expect(mirror.accept({callbacks:cb,receipts:[{tick:1,callbacks:cb}]},1100).ok).toBe(true);
   s.time(150);const fireCb=s.game.advanceSourceRemoteView();expect(fireCb).toBe(4);const prior=remote.debugState();remote.fire();
   mirror.recordSent({tick:2,sentAt:1150,targets:[],firePlayerId:'target'});expect(mirror.accept({callbacks:fireCb,receipts:[{tick:2,callbacks:fireCb}]},1150).ok).toBe(true);
   const pose=mirror.freeze()[0],actual=remote.debugState();expect(actual.rendered).toEqual({...pose.position,yaw:pose.yaw});expect(actual.sourceMovement!.steps).toBe(prior.sourceMovement!.steps);expect(actual.original!.timeMs).toBe(2000);expect(pose.motionTime).toBe(2000);
   s.game.advanceSourceRemoteView();expect(remote.debugState().sourceMovement!.steps).toBe(actual.sourceMovement!.steps);
   s.time(200);const finalCb=s.game.advanceSourceRemoteView();mirror.accept({callbacks:finalCb,receipts:[]},1200);
   expect(remote.debugState().rendered).toEqual({...mirror.freeze()[0].position,yaw:mirror.freeze()[0].yaw});expect(remote.debugState().original!.timeMs).toBe(mirror.freeze()[0].motionTime);
  }finally{remote.dispose();r.dispose();}
 });
});
