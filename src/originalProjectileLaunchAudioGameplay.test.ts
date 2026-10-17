import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalProjectile} from '../shared/originalExplosives';
import type {ProjectileSnapshot,Vec3} from '../shared/protocol';
import {originalFireSound} from './originalCombatAudio';

const launch={x:2,y:5,z:-3},direction={x:1,y:0,z:0};
function harness(map:'barrack'|'woodlands'|'winter'){
 const g=Object.create(Game.prototype) as any;
 Object.assign(g,{mapId:map,archivalWinter:map==='winter',phase:'playing',mode:'online',network:{clientId:'local'},camera:new THREE.PerspectiveCamera(),
  remotePlayers:new Map(),handledNetworkProjectileSpawns:new Set(),networkEffectCounts:{projectileSpawns:0},reconcileNetworkProjectile:vi.fn(),
  flushOriginalReconciliation:vi.fn(),updateHud:vi.fn(),audio:{play:vi.fn(),playOriginalSound:vi.fn()}});
 return g;
}
function event(weapon:'launcher'|'rpg',id:string,attackerId='remote',launchSoundPosition?:Vec3){
 // Use actual source spawn state: RPG displayed position is already offset
 // from its constructor sound position, whereas RG6 retains the launch point.
 const state=createOriginalProjectile(weapon,launch,direction,attackerId);
 const projectile:ProjectileSnapshot={projectileId:id,shotId:`shot-${id}`,attackerId,weapon,position:{...state.position},velocity:{...state.velocity},direction:{...state.direction},remainingCallbacks:state.remainingCallbacks,expiresAt:5000};
 return {type:'projectile_spawned' as const,serverTime:1000,data:{projectile,...(launchSoundPosition?{launchSoundPosition}: {})}};
}
const remote=()=>({group:new THREE.Group(),fire:vi.fn()});
const calls=(g:any)=>g.audio.playOriginalSound.mock.calls;

describe('actual Game immutable source projectile launch audio position',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const){
  it(`${map} ${weapon} uses the supplied launch point despite moving or absent remote actors and suppresses duplicate receipts`,()=>{
   const g=harness(map),actor=remote();actor.group.position.set(30,10,-10);g.remotePlayers.set('remote',actor);
   const supplied={...launch},first=event(weapon,'first','remote',supplied);
   if(weapon==='rpg')expect(first.data.projectile.position).not.toEqual(supplied);
   g.handleNetworkEvent(first);expect(calls(g)).toHaveLength(1);expect(calls(g)[0][0]).toBe(originalFireSound(weapon));expect(calls(g)[0][1]).toEqual(supplied);expect(calls(g)[0][4]).toBe(7);
   // A later renderer position cannot relocate/replay a received launch.
   actor.group.position.set(-50,20,80);g.handleNetworkEvent(first);expect(calls(g)).toHaveLength(1);expect(g.networkEffectCounts.projectileSpawns).toBe(1);
   g.remotePlayers.delete('remote');g.handleNetworkEvent(event(weapon,'absent','remote',{...launch}));
   expect(calls(g)).toHaveLength(2);expect(calls(g)[1][1]).toEqual(launch);expect(calls(g)[1][4]).toBe(7);expect(g.networkEffectCounts.projectileSpawns).toBe(2);
   expect(actor.fire).not.toHaveBeenCalled();expect(g.audio.play).not.toHaveBeenCalled();
  });

  it(`${map} ${weapon} keeps local prediction acknowledgement silent even with supplied launch audio metadata`,()=>{
   const g=harness(map),actor=remote();g.remotePlayers.set('local',actor);const local=event(weapon,'predicted','local',{...launch});
   // The local firing path already emitted its constructor sample. Its server
   // receipt still reconciles the visual but does not dispatch another voice.
   g.handleNetworkEvent(local);g.handleNetworkEvent(local);
   expect(g.reconcileNetworkProjectile).toHaveBeenCalledTimes(2);expect(g.networkEffectCounts.projectileSpawns).toBe(1);
   expect(calls(g)).toHaveLength(0);expect(g.audio.play).not.toHaveBeenCalled();expect(actor.fire).not.toHaveBeenCalled();
  });

  it(`${map} ${weapon} retains the explicit older-server fallback when launch metadata is absent`,()=>{
   const g=harness(map),actor=remote();actor.group.position.set(7,2,4);g.remotePlayers.set('remote',actor);
   g.handleNetworkEvent(event(weapon,'old-with-actor'));expect(calls(g)[0][1]).toEqual({x:7,y:2+1.72,z:4});expect(calls(g)[0][4]).toBe(7);
   g.remotePlayers.delete('remote');const missing=event(weapon,'old-without-actor');g.handleNetworkEvent(missing);
   expect(calls(g)[1][1]).toEqual(missing.data.projectile.position);expect(calls(g)[1][4]).toBe(7);
  });
 }

 for(const weapon of ['launcher','rpg'] as const)it(`Winter ${weapon} retains its distance gate, procedural sample and remote firing phase`,()=>{
  const g=harness('winter'),actor=remote();g.remotePlayers.set('remote',actor);
  const first=event(weapon,'winter-near','remote',{x:1000,y:1000,z:1000});g.handleNetworkEvent(first);g.handleNetworkEvent(first);
  expect(g.audio.play).toHaveBeenCalledExactlyOnceWith('shot',.28);expect(calls(g)).toHaveLength(0);expect(actor.fire).toHaveBeenCalledOnce();
  const far=event(weapon,'winter-far','remote',{...launch});far.data.projectile.position={x:1000,y:0,z:0};g.handleNetworkEvent(far);
  expect(g.audio.play).toHaveBeenCalledOnce();expect(actor.fire).toHaveBeenCalledTimes(2);expect(calls(g)).toHaveLength(0);
 });
});
