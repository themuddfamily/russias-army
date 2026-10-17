import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {MatchRoom} from '../server/match-room';
import type {MessagePeer} from '../server/protocol';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {ServerMessage} from '../shared/protocol';
import {createOriginalExplosionResources,OriginalExplosionPresentation} from './originalExplosionPresentation';
import {createOriginalCombatEffectResources,OriginalCombatEffectPresentation} from './originalCombatEffectPresentation';

class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
function client(map:'barrack'|'woodlands',id:string){
 const scene=new THREE.Scene(),geometry=new THREE.CylinderGeometry(),material=new THREE.MeshBasicMaterial();
 const explosionResources=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
 const combatResources=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decal:new THREE.Texture(),decalspas:new THREE.Texture(),pufft:new THREE.Texture()});
 const explosions=new OriginalExplosionPresentation(explosionResources,scene),combat=new OriginalCombatEffectPresentation(combatResources,scene);
 const g=Object.assign(Object.create(Game.prototype),{mapId:map,archivalWinter:false,phase:'playing',mode:'online',playerAlive:true,
  elapsed:0,network:{clientId:id},camera:new THREE.PerspectiveCamera(),scene,arena:{},remotePlayers:new Map(),
  networkProjectiles:new Map(),pendingNetworkProjectileShots:new Map(),handledNetworkProjectileSpawns:new Set(),handledNetworkExplosions:new Set(),
  networkExplosionIds:new Set(),handledNetworkShots:new Set(),handledNetworkRG6Boosts:new Set(),handledNetworkDamageEvents:new Set(),handledNetworkEliminations:new Set(),creditedExplosiveShots:new Set(),
  networkEffectCounts:{projectileSpawns:0,explosions:0},projectileRocketGeometry:geometry,projectileShellGeometry:geometry,projectileShellMaterial:material,
  originalExplosionPresentation:explosions,originalCombatEffectPresentation:combat,
  flushOriginalReconciliation:vi.fn(),updateHud:vi.fn(),audio:{play:vi.fn(),playOriginalSound:vi.fn()}});
 return {g,scene,explosions,combat,dispose(){g.clearNetworkProjectiles();geometry.dispose();material.dispose();explosions.dispose();combat.dispose();explosionResources.dispose();combatResources.dispose();}};
}

describe('authority receipts consumed by actual Game explosive presentation',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const)it(`${map} ${weapon} excludes equivalent-name models/audio/effects through both launches and snapshots`,()=>{
  let sequence=0;
  const runtime=getOriginalMapRuntime(map),room=new MatchRoom('receipt-gameplay',{map,spawnPoints:[runtime.spawnPoints[0]],now:()=>0,idFactory:()=>`p${++sequence}`});
  const authority=room as any;
  const join=(name:string)=>{const peer=new Peer(),result=room.join(peer,name,0);if(!result.ok)throw Error(result.message);return {peer,actor:authority.players.get(result.player.id)};};
  const owner=join('Launcher'),denied=join('LAUNCHER'),observer=join('Observer');
  const clients=[client(map,owner.actor.id),client(map,denied.actor.id),client(map,observer.actor.id)];
  try{
   for(const p of [owner,denied,observer])p.peer.messages.length=0;
   room.handleMessage(owner.actor.id,{type:'transform',sequence:1,clientTime:1000,transform:{...owner.actor.transform,weapon}},1000,owner.peer);
   const eye={...owner.actor.transform.position,y:owner.actor.transform.position.y+runtime.profile.eyeHeight};
   room.handleMessage(owner.actor.id,{type:'shoot',shot:{shotId:'accepted',weapon,origin:eye,direction:{x:0,y:1,z:0}}},1100,owner.peer);
   const active=[...authority.projectiles.values()][0] as any;expect(active).toBeDefined();
   for(const [index,p] of [owner,denied,observer].entries()){
    for(const m of p.peer.messages)if(m.type==='event'&&m.event.type==='projectile_spawned')clients[index].g.handleNetworkEvent(m.event);
    p.peer.messages.length=0;
    authority.sendSourceViewMessage(p.actor,{type:'snapshot',snapshot:room.getSnapshot(1100)});
    const message=p.peer.messages.at(-1)!;if(message.type!=='snapshot')throw Error('snapshot');
    clients[index].g.reconcileNetworkProjectiles(message.snapshot.projectiles,message.snapshot.serverTime);
   }
   expect(clients.map(c=>c.g.networkProjectiles.size)).toEqual([1,0,1]);
   expect(clients[0].g.audio.playOriginalSound).not.toHaveBeenCalled();
   expect(clients[1].g.audio.playOriginalSound).not.toHaveBeenCalled();
   expect(clients[2].g.audio.playOriginalSound).toHaveBeenCalledTimes(1);
   for(const p of [owner,denied,observer])p.peer.messages.length=0;
   authority.detonate(active,1100);
   for(const [index,p] of [owner,denied,observer].entries()){
    for(const m of p.peer.messages)if(m.type==='event'&&m.event.type==='explosion')clients[index].g.handleNetworkEvent(m.event);
    p.peer.messages.length=0;
    authority.sendSourceViewMessage(p.actor,{type:'snapshot',snapshot:room.getSnapshot(1100)});
    const message=p.peer.messages.at(-1)!;if(message.type!=='snapshot')throw Error('blast snapshot');
    for(const b of message.snapshot.blasts??[])clients[index].explosions.sync(b.projectileId,b.weapon==='rpg'?'rocket':'grenade',b.position,b.remainingCallbacks);
   }
   expect(clients.map(c=>c.g.networkProjectiles.size)).toEqual([0,0,0]);
   expect(clients.map(c=>c.explosions.size)).toEqual([1,0,1]);
   expect(clients[1].combat.size).toBe(0);expect(clients[1].g.audio.playOriginalSound).not.toHaveBeenCalled();
   expect(clients.map(c=>c.g.audio.playOriginalSound.mock.calls.length)).toEqual([1,0,2]);
   if(weapon==='rpg'){expect(clients[0].combat.size).toBeGreaterThan(0);expect(clients[2].combat.size).toBeGreaterThan(0);}
  }finally{for(const c of clients)c.dispose();}
 });
});
