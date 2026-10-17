import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState,type WeaponId} from './weapons';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint,type ReceiverLoadoutIntent} from '../shared/originalReceiverLoadoutWorld';
import {ORIGINAL_WEAPON_SLOT_ORDER} from '../shared/originalPickupRules';
import type {OriginalSoloEvent} from '../shared/originalSoloObserverWorld';

const counts=(n=0)=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,n])) as Record<WeaponId,number>;
const owned=(n=true)=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,n])) as Record<WeaponId,boolean>;
function seed(map:'barrack'|'woodlands'='barrack'):ReceiverLoadoutCheckpoint{
 return {prefix:{kind:'receipt',sceneGeneration:4,callback:0,tick:0},map,selected:'pistol',owned:{...owned(),rifle:false},ammo:counts(),reserve:counts(),refillTarget:8,counter:{waitgun:7,poldwaitgun:3},score:10,goldScore:123.5};
}
// Actual loadout transaction supplies counts and pure outputs. Direct Game
// delivery isolates its consumer; native scheduling/renderer binding is absent.
function committed(map:'barrack'|'woodlands'='barrack'){
 const bank=new OriginalReceiverLoadoutWorld(seed(map),{maxCommands:16,maxTextChars:4096,weaponModelPresent:owned()});
 const tx=bank.begin(),intents:ReceiverLoadoutIntent[]=[];
 tx.advanceCallback({kind:'callback',sceneGeneration:4,callback:1});tx.getGun('rifle',intent=>intents.push(intent));tx.addScore(5);tx.commit();
 return {bank,checkpoint:bank.freeze(),intents};
}
function harness(checkpoint:ReceiverLoadoutCheckpoint){
 const world={lifeGeneration:4,loadout:checkpoint};
 const client=Object.assign(Object.create(Game.prototype),{mode:'solo',archivalWinter:false,phase:'playing',mapId:checkpoint.map,playerAlive:true,elapsed:20,score:999,
  arena:{runtime:{scale:.02},pickups:[]},soloWorlds:{worlds:new Map([['player',world]])},weaponState:new WeaponState(checkpoint.map),
  camera:new THREE.PerspectiveCamera(),weaponDrops:[],updateHud:vi.fn(),reload:vi.fn(),switchWeapon:vi.fn(),syncWeaponPresentation:vi.fn(),
  appendChat:vi.fn(),playOriginalCombatSound:vi.fn(),removeWeaponDrop:vi.fn(),setMessage:vi.fn(),distanceToWorld:()=>Infinity,
 });
 const state:OriginalSoloEvent={kind:'loadout-state',recipientId:'player',lifeGeneration:4,time:1,checkpoint};
 return {client,world,state,deliver:(event:OriginalSoloEvent)=>client.receiveSoloWorldEvent(event)};
}

describe('committed Solo loadout Game consumption without replaying mutations',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map}: adopts actual committed ammo/selection/score and emits only sound/feedback`,()=>{
   const c=committed(map),h=harness(c.checkpoint);h.deliver(h.state);
   expect(h.client.weaponState.current).toBe('rifle');expect(h.client.weaponState.ammo.rifle).toBe(28);expect(h.client.weaponState.reserve.rifle).toBe(22);expect(h.client.score).toBe(15);
   expect(h.client.weaponState.originalLoadoutCheckpoint).toEqual(c.checkpoint);
   for(const intent of c.intents)if(intent.kind==='feedback'||intent.kind==='reload-sound')h.deliver({kind:'loadout-output',recipientId:'player',lifeGeneration:4,time:1,prefix:c.checkpoint.prefix,intent});
   expect(h.client.appendChat).toHaveBeenCalledExactlyOnceWith('','You have the ak47!','feedback');expect(h.client.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('reak47',undefined,6);
   expect(h.client.reload).not.toHaveBeenCalled();expect(h.client.switchWeapon).not.toHaveBeenCalled();expect(h.client.syncWeaponPresentation).not.toHaveBeenCalled();expect(h.client.score).toBe(15);c.bank.release();
  });
  it(`${map}: restores counters without time catchup until an explicit callback`,()=>{
   const c=committed(map),state=new WeaponState(map);state.lastShot=5;state.adoptOriginalLoadout(c.checkpoint,20);
   expect(state.lastShot).toBe(5);expect(state.originalCounterState).toEqual({...c.checkpoint.counter,ready:false});
   expect(state.canFire(200)).toBe(false);expect(state.update(200)).toBe(false);expect(state.originalCounterState).toEqual({...c.checkpoint.counter,ready:false});
   state.stepSourceCounter(200);expect(state.originalLoadoutCheckpoint).toEqual(c.checkpoint);c.bank.release();
  });
 }
 it('detaches captured ownership metadata from input and mutable live ammo, and clears it on reset',()=>{
  const input=seed(),state=new WeaponState('barrack');state.adoptOriginalLoadout(input,10);
  expect(state.originalLoadoutCheckpoint!.owned.rifle).toBe(false);(input.ammo as Record<WeaponId,number>).pistol=100;state.ammo.rifle=200;
  expect(state.originalLoadoutCheckpoint!.ammo.pistol).toBe(0);expect(state.originalLoadoutCheckpoint!.ammo.rifle).toBe(0);expect(Object.isFrozen(state.originalLoadoutCheckpoint!.ammo)).toBe(true);
  state.reset();expect(state.originalLoadoutCheckpoint).toBeUndefined();
 });
 it('retains the rendered selection cache for VOID and does not transfer rounds or touch shot time',()=>{
  const state=new WeaponState('barrack');state.current='rpg';state.lastShot=9;state.adoptOriginalLoadout({...seed(),selected:null},10);
  expect(state.current).toBe('rpg');expect(state.unarmed).toBe(true);expect(state.lastShot).toBe(9);expect(state.ammo).toEqual(counts());expect(state.reserve).toEqual(counts());expect(state.originalLoadoutCheckpoint!.selected).toBeNull();
 });
 it('rejects map/ownership/count/clock failures before changing any state',()=>{
  const state=new WeaponState('barrack'),before={ammo:{...state.ammo},reserve:{...state.reserve},current:state.current};
  for(const bad of [seed('woodlands'),{...seed(),owned:{...owned(),rifle:false},reserve:{...counts(),rifle:1}},{...seed(),ammo:{...counts(),sniper:NaN}}])expect(()=>state.adoptOriginalLoadout(bad,10)).toThrow();
  expect(()=>state.adoptOriginalLoadout(seed(),Infinity)).toThrow();expect(state.ammo).toEqual(before.ammo);expect(state.reserve).toEqual(before.reserve);expect(state.current).toBe(before.current);expect(state.originalLoadoutCheckpoint).toBeUndefined();
 });
 it('does not apply player state/output to another life, mode, map or unowned world',()=>{
  const c=committed();
  for(const change of ['generation','winter','online','phase','unowned','map','recipient']){
   const h=harness(c.checkpoint);let event=h.state;
   if(change==='generation')event={...event,lifeGeneration:5};if(change==='winter')h.client.archivalWinter=true;if(change==='online')h.client.mode='online';if(change==='phase')h.client.phase='lost';if(change==='unowned')h.world.loadout=undefined as any;if(change==='map')h.client.mapId='woodlands';if(change==='recipient')event={...event,recipientId:'bot'};
   h.deliver(event);h.deliver({kind:'loadout-output',recipientId:event.recipientId,lifeGeneration:event.lifeGeneration,time:1,prefix:c.checkpoint.prefix,intent:{kind:'feedback',message:'ignore'}});
   expect(h.client.score).toBe(999);expect(h.client.weaponState.originalLoadoutCheckpoint).toBeUndefined();expect(h.client.appendChat).not.toHaveBeenCalled();
  }c.bank.release();
 });
 it('rejects a stale same-life checkpoint that is not the current committed owner',()=>{
  const c=committed(),h=harness(c.checkpoint);h.deliver({...h.state,checkpoint:{...c.checkpoint,score:0}});
  expect(h.client.score).toBe(999);expect(h.client.weaponState.originalLoadoutCheckpoint).toBeUndefined();c.bank.release();
 });
 it('delivers committed state/output while the world is dead but before the Game leaves playing',()=>{
  const c=committed(),h=harness(c.checkpoint);Object.assign(h.world,{alive:false});h.client.playerAlive=false;
  h.deliver(h.state);h.deliver({kind:'loadout-output',recipientId:'player',lifeGeneration:4,time:1,prefix:c.checkpoint.prefix,intent:{kind:'feedback',message:'committed'}});
  expect(h.client.score).toBe(15);expect(h.client.appendChat).toHaveBeenCalledExactlyOnceWith('','committed','feedback');c.bank.release();
 });
 it('skips legacy drop lifetime, rewards and removal for a committed owner',()=>{
  const c=committed(),h=harness(c.checkpoint),add=vi.spyOn(h.client.weaponState,'addReserve');
  h.client.weaponDrops=[{expiresAt:0,group:{position:new THREE.Vector3()},weapon:'rifle'}];h.client.updateWeaponDrops(1/30);
  expect(add).not.toHaveBeenCalled();expect(h.client.removeWeaponDrop).not.toHaveBeenCalled();expect(h.client.reload).not.toHaveBeenCalled();expect(h.client.score).toBe(999);c.bank.release();
 });
 it('preserves old drop collection when the world has no committed owner',()=>{
  const h=harness(seed());h.world.loadout=undefined as any;h.client.weaponDrops=[{expiresAt:null,group:{position:new THREE.Vector3()},weapon:'rifle'}];
  const reserve=h.client.weaponState.reserve.rifle;h.client.updateWeaponDrops(1/30);
  expect(h.client.weaponState.reserve.rifle).toBe(reserve+50);expect(h.client.reload).toHaveBeenCalledOnce();expect(h.client.removeWeaponDrop).toHaveBeenCalledWith(0);expect(h.client.score).toBe(1004);
 });
 it('skips legacy arena ammo collection for a committed owner',()=>{
  const c=committed(),h=harness(c.checkpoint),add=vi.spyOn(h.client.weaponState,'addReserve');
  const pickup={type:'ammo',active:true,mesh:{position:new THREE.Vector3(0,-1.72,0),visible:true},respawnAt:0};h.client.arena.pickups=[pickup];h.client.collectPickups();
  expect(add).not.toHaveBeenCalled();expect(pickup.active).toBe(true);expect(h.client.updateHud).not.toHaveBeenCalled();c.bank.release();
 });
});
