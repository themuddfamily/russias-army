import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {MatchRoom} from '../server/match-room';
import type {MessagePeer} from '../server/protocol';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import type {MatchSnapshot,ServerMessage} from '../shared/protocol';
import {createOriginalExplosionResources,OriginalExplosionPresentation} from './originalExplosionPresentation';
import {createOriginalCombatEffectResources,OriginalCombatEffectPresentation} from './originalCombatEffectPresentation';

class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
function client(map:'barrack'|'woodlands',id:string,ids:string[]){
 const scene=new THREE.Scene(),geometry=new THREE.CylinderGeometry(),material=new THREE.MeshBasicMaterial(),runtime=getOriginalMapRuntime(map);
 const explosionResources=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
 const combatResources=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decal:new THREE.Texture(),decalspas:new THREE.Texture(),pufft:new THREE.Texture()});
 const explosions=new OriginalExplosionPresentation(explosionResources,scene),combat=new OriginalCombatEffectPresentation(combatResources,scene);
 // Unrelated remote GI presentation is stubbed. Local correction, private
 // barrel replacement and projectile/explosion presentations use real methods.
 const remotePlayers=new Map(ids.filter(other=>other!==id).map(other=>[other,{alive:true,group:new THREE.Group(),apply:vi.fn(),dispose:vi.fn(),debugState:()=>({original:{removed:false}})}]));
 const g=Object.assign(Object.create(Game.prototype),{mapId:map,archivalWinter:false,phase:'playing',mode:'online',playerAlive:true,
  elapsed:0,needsAuthoritativeSpawn:false,network:{clientId:id,state:'joined',estimatedServerTimeMs:1100,resetTransformPath:vi.fn()},camera:new THREE.PerspectiveCamera(),velocity:new THREE.Vector3(),scene,
  arena:{runtime,barrelWorld:new OriginalBarrelWorld(runtime),syncBarrels:vi.fn()},remotePlayers,
  originalPlayerPrediction:[],originalPlayerContacts:[],sourceHealthPrediction:[],originalBarrelAuthorityTime:-Infinity,originalBarrelReceivedTime:-Infinity,
  networkProjectiles:new Map(),pendingNetworkProjectileShots:new Map(),handledNetworkProjectileSpawns:new Set(),handledNetworkExplosions:new Set(),
  networkExplosionIds:new Set(),handledNetworkShots:new Set(),handledNetworkRG6Boosts:new Set(),handledNetworkDamageEvents:new Set(),handledNetworkEliminations:new Set(),creditedExplosiveShots:new Set(),
  networkEffectCounts:{projectileSpawns:0,explosions:0},projectileRocketGeometry:geometry,projectileShellGeometry:geometry,projectileShellMaterial:material,
  originalExplosionPresentation:explosions,originalCombatEffectPresentation:combat,
  attachOriginalDoors:vi.fn(),reconcileNetworkItems:vi.fn(),updateNetworkStatus:vi.fn(),updateHud:vi.fn(),audio:{play:vi.fn(),playOriginalSound:vi.fn()}});
 return {g,explosions,dispose(){g.clearNetworkProjectiles();geometry.dispose();material.dispose();explosions.dispose();combat.dispose();explosionResources.dispose();combatResources.dispose();}};
}
function authority(map:'barrack'|'woodlands',weapon:'launcher'|'rpg'){
 let sequence=0;
 const runtime=getOriginalMapRuntime(map),room=new MatchRoom('private-gameplay',{map,spawnPoints:[runtime.spawnPoints[0]],now:()=>0,idFactory:()=>`p${++sequence}`}),review=room as any;
 const join=(name:string)=>{const peer=new Peer(),joined=room.join(peer,name,0);if(!joined.ok)throw Error(joined.message);return {peer,actor:review.players.get(joined.player.id)};};
 const owner=join('Launcher'),observer=join('Observer'),denied=join('LAUNCHER');
 for(const viewer of [owner,observer,denied])viewer.peer.messages.length=0;
 room.handleMessage(owner.actor.id,{type:'transform',sequence:1,clientTime:1000,transform:{...owner.actor.transform,weapon}},1000,owner.peer);
 room.handleMessage(owner.actor.id,{type:'shoot',shot:{shotId:'private',weapon,origin:{...owner.actor.transform.position,y:owner.actor.transform.position.y+runtime.profile.eyeHeight},direction:{x:0,y:1,z:0}}},1100,owner.peer);
 const record=[...review.projectiles.values()][0] as any;if(!record)throw Error('Admitted launch required');
 const snapshot=(viewer:typeof owner,time=1100):MatchSnapshot=>{
  viewer.peer.messages.length=0;review.sendSourceViewMessage(viewer.actor,{type:'snapshot',snapshot:room.getSnapshot(time)});
  const packet=viewer.peer.messages.at(-1);if(packet?.type!=='snapshot')throw Error('Sent personalized snapshot required');return packet.snapshot;
 };
 return {room,review,owner,observer,denied,id:record.snapshot.projectileId,snapshot};
}

describe('actual Game consumes individualized observer worlds',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const)it(`${map} ${weapon} keeps one viewer live after another viewer explodes`,()=>{
  const s=authority(map,weapon),viewers=[s.owner,s.observer,s.denied],clients=viewers.map(viewer=>client(map,viewer.actor.id,viewers.map(p=>p.actor.id)));
  try{
   for(const [index,viewer] of viewers.entries())for(const packet of viewer.peer.messages)if(packet.type==='event'&&packet.event.type==='projectile_spawned')clients[index].g.handleNetworkEvent(packet.event);
   const a=s.owner.actor.sourceWorld.projectiles.get(s.id),b=s.observer.actor.sourceWorld.projectiles.get(s.id);
   expect(a).toBeDefined();expect(b).toBeDefined();
   a.source.position={x:100,y:100,z:100};a.snapshot.position={...a.source.position};
   b.source.position={x:200,y:100,z:100};b.snapshot.position={...b.source.position};
   for(const [index,viewer] of viewers.entries())clients[index].g.applyNetworkSnapshot(s.snapshot(viewer));
   expect(clients.map(c=>c.g.networkProjectiles.size)).toEqual([1,1,0]);
   expect(clients[0].g.networkProjectiles.get(s.id).mesh.position.x).toBe(100);
   expect(clients[1].g.networkProjectiles.get(s.id).mesh.position.x).toBe(200);
   for(const viewer of viewers)viewer.peer.messages.length=0;
   // Isolate the private transition timing; delivery and Game handlers are real.
   s.review.detonateSourceFor(s.owner.actor,a,1100);
   for(const [index,viewer] of viewers.entries())for(const packet of viewer.peer.messages)if(packet.type==='event'&&packet.event.type==='explosion')clients[index].g.handleNetworkEvent(packet.event);
   for(const [index,viewer] of viewers.entries())clients[index].g.applyNetworkSnapshot(s.snapshot(viewer));
   expect(clients.map(c=>c.g.networkProjectiles.size)).toEqual([0,1,0]);
   expect(clients.map(c=>c.explosions.size)).toEqual([1,0,0]);
   expect(clients[0].g.handledNetworkExplosions.has(s.id)).toBe(true);
   expect(clients[1].g.handledNetworkExplosions.has(s.id)).toBe(false);
   expect(clients[1].g.networkProjectiles.get(s.id).mesh.position.x).toBe(200);
   expect(clients.map(c=>c.g.audio.playOriginalSound.mock.calls.length)).toEqual([1,1,0]);
  }finally{for(const c of clients)c.dispose();}
 });
 it('Barrack stages each private barrel and local body at the same epoch through actual snapshot reconciliation',()=>{
  const s=authority('barrack','launcher'),viewers=[s.owner,s.observer],clients=viewers.map(viewer=>client('barrack',viewer.actor.id,[s.owner.actor.id,s.observer.actor.id,s.denied.actor.id]));
  try{
   for(const [index,viewer] of viewers.entries()){
    const held={forward:false,backward:false,left:false,right:false,jump:false};
    viewer.peer.messages.length=0;
    s.room.handleMessage(viewer.actor.id,{type:'transform',sequence:viewer===s.owner?2:1,clientTime:1100,transform:{...viewer.actor.transform,typing:true,sourceInput:held}},1100,viewer.peer);
    expect(viewer.peer.messages.filter(message=>message.type==='error')).toEqual([]);
    expect(viewer.actor.sourceInput).toMatchObject(held);
    const world=viewer.actor.sourceWorld,position={x:100+index*100,y:100,z:100};
    world.barrels.bodies[0].position={...position};viewer.actor.transform.position={...position,x:position.x+20};
    world.updatedAt=1200;
    clients[index].g.sourceRemoteViewEpoch=0;
    const prior=clients[index].g.arena.barrelWorld.snapshots();
    const packet=s.snapshot(viewer,1200);clients[index].g.applyNetworkSnapshot(packet);
    expect(clients[index].g.arena.barrelWorld.snapshots()).toEqual(prior);
    expect(clients[index].g.pendingOriginalReconciliation.serverTime).toBe(1200);
    clients[index].g.flushOriginalReconciliation();
    expect(clients[index].g.arena.barrelWorld.snapshots()[0].position).toEqual(position);
    expect(clients[index].g.camera.position.x).toBe(position.x+20);
    expect(clients[index].g.originalBarrelAuthorityTime).toBe(1200);
   }
   expect(clients[0].g.arena.barrelWorld.snapshots()[0].position.x).toBe(100);
   expect(clients[1].g.arena.barrelWorld.snapshots()[0].position.x).toBe(200);
  }finally{for(const c of clients)c.dispose();}
 });
});
