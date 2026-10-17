import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import {originalProjectileDirection} from '../shared/originalProjectileOrientation';
import {originalRpgBasisFromSourceRotation,originalRpgConvex} from '../shared/originalRpgShape';
import type {MessagePeer,ServerMessage,PlayerTransform,Vec3} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
interface Player {
 id:string;transform:PlayerTransform;sourceViewGeneration:number;sourceCounter:OriginalWeaponCounter;sourceCounterUpdatedAt:number;sourceCounterReady:boolean;sourceCounterWeapon:string;
 ammo:Record<string,number>;reserve:Record<string,number>;recentShotIds:Map<string,number>;pendingShots:Map<string,unknown>;sourceMotionTime:number;lastShotAt:number;
}
function setup(map:'barrack'|'woodlands'){
 const room=new MatchRoom('rpg-convex',{map,spawnPoints:[{x:0,y:100,z:0}],now:()=>0}),peer=new Peer(),join=room.join(peer,'Shooter',0,undefined,true);if(!join.ok)throw Error('join');
 const player=(room as unknown as {players:Map<string,Player>}).players.get(join.player.id)!;
 player.transform.weapon='rpg';player.sourceCounter=new OriginalWeaponCounter(map,'rpg');player.sourceCounterUpdatedAt=0;player.sourceCounterReady=true;player.sourceCounterWeapon='rpg';
 const origin={...player.transform.position,y:player.transform.position.y+1.72};
 const trace={generation:player.sourceViewGeneration,callbacks:0,receipts:[{tick:0,callbacks:0}]};
 const shoot=(sourceRotation?:Vec3,direction=sourceRotation?originalProjectileDirection(sourceRotation):{x:0,y:0,z:-1})=>room.handleMessage(player.id,{type:'shoot',sourceRemoteView:trace,shot:{shotId:'rpg-shot',weapon:'rpg',origin,direction,...(sourceRotation===undefined?{}:{sourceRotation})}},0);
 return {room,peer,player,origin,shoot};
}
function shotHistory(player:Player){return {ammo:{...player.ammo},reserve:{...player.reserve},recent:[...player.recentShotIds],pending:[...player.pendingShots],phase:player.sourceMotionTime,lastShotAt:player.lastShotAt,counter:player.sourceCounter.state};}
describe('actual authority RPG convex launch orientation',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const sourceRotation of [{x:113,y:0,z:-2377},{x:90,y:0,z:-2377}])it(`${map} retains pitch${sourceRotation.x} and multiturn yaw in actual launch, event and snapshot`,()=>{
  const s=setup(map);s.shoot(sourceRotation);const snapshot=s.room.getSnapshot(0).projectiles[0];expect(snapshot).toBeTruthy();expect(snapshot.sourceRotation).toEqual(sourceRotation);expect(snapshot.direction).toEqual(originalProjectileDirection(sourceRotation));expect(snapshot.remainingCallbacks).toBe(200);
  const spawned=s.peer.messages.find(message=>message.type==='event'&&message.event.type==='projectile_spawned');expect(spawned).toMatchObject({type:'event',event:{data:{projectile:{sourceRotation,remainingCallbacks:200}}}});
  const active=(s.room as unknown as {projectiles:Map<string,{source:{sourceRotation:Vec3;convex:unknown}}>} ).projectiles.get(snapshot.projectileId)!;
  expect(active.source.sourceRotation).toEqual(sourceRotation);expect(active.source.convex).toEqual(originalRpgConvex(originalRpgBasisFromSourceRotation(sourceRotation)));
  expect(s.player.ammo.rpg).toBe(0);expect(s.player.recentShotIds.has('rpg-shot')).toBe(true);expect(s.peer.messages.at(-1)).toMatchObject({type:'loadout',ackShotId:'rpg-shot'});
 });
 it('detaches input, snapshot and projectile event orientation from authoritative storage',()=>{
  const s=setup('woodlands'),sourceRotation={x:113,y:0,z:-2377},expected={...sourceRotation};s.shoot(sourceRotation);sourceRotation.x=-5;
  const snapshot=s.room.getSnapshot(0).projectiles[0];snapshot.sourceRotation!.x=44;
  const event=s.peer.messages.find(message=>message.type==='event'&&message.event.type==='projectile_spawned');if(!event||event.type!=='event'||event.event.type!=='projectile_spawned')throw Error('spawn');event.event.data.projectile.sourceRotation!.z=7;
  expect(s.room.getSnapshot(0).projectiles[0].sourceRotation).toEqual(expected);
 });
 it.each(['missing','mismatch','nonzero-y'] as const)('rejects negotiated %s rotation before ammunition and shot history change, then acknowledges rejection',kind=>{
  const s=setup('barrack'),before=shotHistory(s.player),start=s.peer.messages.length;
  if(kind==='missing')s.shoot();else if(kind==='mismatch')s.shoot({x:113,y:0,z:-2377},{x:0,y:0,z:-1});else s.shoot({x:0,y:1,z:0},{x:0,y:0,z:-1});
  expect(s.room.getSnapshot(0).projectiles).toEqual([]);expect(shotHistory(s.player)).toEqual(before);
  expect(s.peer.messages.slice(start)).toMatchObject([{type:'error',code:'invalid_shot'},{type:'loadout',ackShotId:'rpg-shot'}]);
 });
});
