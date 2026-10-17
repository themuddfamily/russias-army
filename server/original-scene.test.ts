import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {getLegacyMap} from '../shared/legacyMaps';
import {originalDropPosition,ORIGINAL_DROP_AMMO} from '../shared/originalPickupRules';
import {ORIGINAL_SOURCE_SPAWNS} from '../shared/originalMapProfile';
import type {PlayerTransform,MessagePeer,ServerMessage,Vec3} from './protocol';
import type {WeaponDropSnapshot} from '../shared/protocol';
import type {ArenaRayHit,ArenaRaycastOptions} from '../shared/arenaCollision';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
interface Player {id:string;transform:PlayerTransform;alive:boolean;reserve:Record<string,number>;score:number;sourceTimeoutDrops:Map<string,WeaponDropSnapshot>}
interface RoomReview {
 players:Map<string,Player>;
 validTransform(t:PlayerTransform):boolean;
 validArenaMovement(p:Player,t:PlayerTransform,now:number):unknown;
 hasPlayerSupport(p:Vec3):boolean;
 raycast(o:Vec3,d:Vec3,max:number,options?:ArenaRaycastOptions):ArenaRayHit|null;
 lineOfSight(a:Vec3,b:Vec3):boolean;
 kill(k:Player,v:Player,source:'rifle',now:number,award:boolean):void;
 sendSourceViewMessage(p:Player,m:ServerMessage):void;
}
const inspect=(room:MatchRoom)=>room as unknown as RoomReview;
describe('authoritative recovered original maps',()=>{
 it.each(['barrack','woodlands'] as const)('%s defaults to six recovered terrain-supported spawn locations and removes authored fixed pickups',map=>{
  const runtime=getOriginalMapRuntime(map),room=new MatchRoom('original',{map,now:()=>0});
  expect(runtime.spawnPoints).toHaveLength(6);
  for(let i=0;i<6;i++){
   const joined=room.join(new Peer(),`PLAYER${i}`,0);if(!joined.ok)throw Error(joined.message);
   expect(runtime.spawnPoints).toContainEqual(joined.player.transform.position);
   const index=runtime.spawnPoints.findIndex(p=>p.x===joined.player.transform.position.x&&p.z===joined.player.transform.position.z);
   expect(joined.player.transform.yaw).toBeCloseTo(ORIGINAL_SOURCE_SPAWNS[map][index].rotation[2]*Math.PI/180);
   expect(joined.player.transform.pitch).toBeCloseTo(ORIGINAL_SOURCE_SPAWNS[map][index].rotation[0]*Math.PI/180);
   expect(inspect(room).hasPlayerSupport(joined.player.transform.position)).toBe(true);
   expect(runtime.geometry.playerIntersects(joined.player.transform.position,runtime.profile.radius,runtime.profile.bodyHeight)).toBe(false);
  }
  expect(room.getSnapshot().pickups).toEqual([]);
 });
 it.each(['barrack','woodlands'] as const)('%s accepts original spawn ranges excluded by the old flat ±62 bounds',map=>{
  const runtime=getOriginalMapRuntime(map),room=new MatchRoom('bounds',{map});
  const position=runtime.spawnPoints.find(p=>Math.abs(p.x)>62||Math.abs(p.z)>62||p.y< -2)!;
  expect(position).toBeDefined();
  const transform:PlayerTransform={position,velocity:{x:0,y:0,z:0},yaw:0,pitch:0,grounded:true,weapon:'launcher'};
  expect(inspect(room).validTransform(transform)).toBe(true);
  expect(inspect(room).validTransform({...transform,position:{...position,x:runtime.profile.bounds.max.x+1}})).toBe(false);
 });
 it.each(['barrack','woodlands'] as const)('%s uses exact recovered ground ray hits and line of sight',map=>{
  const runtime=getOriginalMapRuntime(map),room=new MatchRoom('combat',{map}),feet=runtime.spawnPoints[0];
  const origin={...feet,y:feet.y+10},direction={x:0,y:-1,z:0};
  const hit=runtime.geometry.raycast(origin,direction,30,{includeGround:true});expect(hit).not.toBeNull();
  expect(inspect(room).raycast(origin,direction,30,{includeGround:true})).toEqual(hit);
  expect(inspect(room).lineOfSight(origin,{...hit!.point,y:hit!.point.y-.1})).toBe(false);
  expect(inspect(room).lineOfSight(origin,{...hit!.point,y:hit!.point.y+.1})).toBe(true);
 });
 it.each(['barrack','woodlands'] as const)('%s validates grounded original sphere support and rejects penetrating the terrain',map=>{
  const room=new MatchRoom('collision',{map}),joined=room.join(new Peer(),'PLAYER',0);if(!joined.ok)throw Error(joined.message);
  const player=inspect(room).players.get(joined.player.id)!;
  expect(inspect(room).validArenaMovement(player,player.transform,100)).toBe(null);
  expect(inspect(room).validArenaMovement(player,{...player.transform,position:{...player.transform.position,y:player.transform.position.y-.1}},100)).toBe(false);
 });
 it.each(['barrack','woodlands'] as const)('%s rejects crossing original fixed triangles between clear, supported endpoints',map=>{
  const runtime=getOriginalMapRuntime(map),room=new MatchRoom('sweep',{map,spawnPoints:[runtime.spawnPoints[0]]}),joined=room.join(new Peer(),'PLAYER',0);if(!joined.ok)throw Error(joined.message);
  const player=inspect(room).players.get(joined.player.id)!,next=runtime.spawnPoints[1];
  expect(inspect(room).hasPlayerSupport(next)).toBe(true);
  expect(runtime.geometry.playerIntersects(next,runtime.profile.radius,runtime.profile.bodyHeight)).toBe(false);
  expect(runtime.geometry.movePlayer(player.transform.position,next,runtime.profile.radius,runtime.profile.bodyHeight).collided).toBe(true);
  expect(inspect(room).validArenaMovement(player,{...player.transform,position:next},100)).toBe(false);
 });
 it.each(['barrack','woodlands'] as const)('%s places death drops using the declared original GI sphere and lets a nearby survivor collect them',map=>{
  const runtime=getOriginalMapRuntime(map),position=runtime.spawnPoints[0],room=new MatchRoom('drops',{map,spawnPoints:[position]}),a=room.join(new Peer(),'A',0),b=room.join(new Peer(),'B',0);
  if(!a.ok||!b.ok)throw Error('join');const review=inspect(room),killer=review.players.get(a.player.id)!,victim=review.players.get(b.player.id)!;
  const before=killer.reserve.launcher;review.sendSourceViewMessage(killer,{type:'snapshot',snapshot:room.getSnapshot(1100)});review.kill(killer,victim,'rifle',1100,true);
  expect(room.getSnapshot().drops).toEqual([]);expect(killer.sourceTimeoutDrops.size).toBe(1);expect(victim.sourceTimeoutDrops.size).toBe(0);const drop=[...killer.sourceTimeoutDrops.values()][0];expect(drop.position).toEqual(originalDropPosition({...position,y:position.y+runtime.profile.eyeHeight},runtime.scale));const killScore=killer.score;
  room.handleMessage(killer.id,{type:'collect',itemId:drop.id},1200);
  expect(room.getSnapshot().drops).toEqual([]);expect(killer.sourceTimeoutDrops.size).toBe(0);expect(killer.reserve.launcher).toBe(before+ORIGINAL_DROP_AMMO.launcher);expect(killer.score).toBe(killScore+5);
 });
 it('keeps authored default-map geometry behind an explicit fixture opt-in',()=>{
  const room=new MatchRoom('fixture',{originalScene:false}),joined=room.join(new Peer(),'FIXTURE',0);if(!joined.ok)throw Error(joined.message);
  expect(getLegacyMap('barrack').spawnPoints.map(([x,y,z])=>({x,y,z}))).toContainEqual(joined.player.transform.position);
  expect(room.getSnapshot().pickups!.length).toBeGreaterThan(0);
 });
 it('retains the explicit archival Winter collision and loadout profile',()=>{
  const room=new MatchRoom('winter',{collisionProfile:'winter'}),joined=room.join(new Peer(),'WINTER',0);if(!joined.ok)throw Error(joined.message);
  expect(joined.player.transform.position.y).toBe(0);expect(joined.player.transform.weapon).toBe('rifle');
 });
});
