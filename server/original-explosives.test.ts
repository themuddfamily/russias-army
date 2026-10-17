import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalProjectile} from '../shared/originalExplosives';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import type {MessagePeer,ServerMessage,ProjectileSnapshot,Vec3} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
function installBlast(room:MatchRoom,id:string,snapshot:ProjectileSnapshot){
 const review=room as unknown as {installSourceFixtureActor(active:unknown,viewers:string[]):void;detonate(active:unknown,now:number):void;players:Map<string,{sourceWorld:{updatedAt:number}}>};
 const active={snapshot,source:createOriginalProjectile('launcher',snapshot.position,{x:0,y:1,z:0},id),updatedAt:snapshot.expiresAt};
 review.installSourceFixtureActor(active,[id]);review.detonate(active,snapshot.expiresAt);
 review.players.get(id)!.sourceWorld.updatedAt=snapshot.expiresAt;
}
function setup(map:'barrack'|'woodlands'){
 const runtime=getOriginalMapRuntime(map),room=new MatchRoom('explosives',{map,now:()=>0,spawnPoints:[runtime.spawnPoints[0]]}),peer=new Peer(),joined=room.join(peer,'SHOOTER',0);
 if(!joined.ok)throw Error('join');
 const id=joined.player.id,player=()=>room.getSnapshot().players.find(p=>p.id===id)!;
 const events=(type:string)=>peer.messages.filter(m=>m.type==='event'&&m.event.type===type);
 const eye=()=>({...player().transform.position,y:player().transform.position.y+runtime.profile.eyeHeight});
 const fire=(weapon:'launcher'|'rpg',time:number,direction:Vec3={x:0,y:1,z:0})=>{
  room.handleMessage(id,{type:'transform',sequence:1,clientTime:1000,transform:{...player().transform,weapon}},1000);
  room.handleMessage(id,{type:'shoot',shot:{shotId:'source-shot',weapon,origin:eye(),direction}},time);
 };
 return {room,peer,id,player,events,eye,fire};
}
describe('preserved map authoritative explosive lifecycle',()=>{
 it.each(['barrack','woodlands'] as const)('%s RG6 spawns at the eye without aim lift or clearance and survives contacts until callback59',map=>{
  const s=setup(map),origin=s.eye();s.fire('launcher',1100,{x:0,y:-1,z:0});
  const spawned=s.room.getSnapshot(1100).projectiles[0];
  expect(spawned.position).toEqual(origin);expect(spawned.velocity).toEqual({x:0,y:-1300*ORIGINAL_MAP_SCALE,z:0});expect(spawned.remainingCallbacks).toBe(60);
  s.room.tick(1100+1000/30);expect(s.room.getSnapshot().projectiles).toHaveLength(1);expect(s.events('explosion')).toHaveLength(0);expect(s.player().health).toBe(100);
  s.room.tick(1100+58*1000/30);expect(s.room.getSnapshot().projectiles).toHaveLength(1);expect(s.room.getSnapshot().projectiles[0].remainingCallbacks).toBe(2);
  s.room.tick(1100+59*1000/30);expect(s.room.getSnapshot().projectiles).toHaveLength(0);expect(s.events('explosion')).toHaveLength(1);expect(s.events('rg6_boost')).toHaveLength(0);
  expect(s.room.getSnapshot().blasts?.[0].remainingCallbacks).toBe(16);
 });
 it.each(['barrack','woodlands'] as const)('%s blast damages the eye exactly five on each of16 callbacks with no detonation impulse',map=>{
  const s=setup(map),position=s.eye();
  const projectile:ProjectileSnapshot={projectileId:'blast',shotId:'blast-shot',attackerId:s.id,weapon:'launcher',position,velocity:{x:0,y:0,z:0},expiresAt:1100};
  installBlast(s.room,s.id,projectile);
  expect(s.player().health).toBe(100);expect(s.events('projectile_contact')).toHaveLength(0);expect(s.events('rg6_boost')).toHaveLength(0);
  const cloned=s.room.getSnapshot(1100);cloned.blasts![0].position.x=999;expect(s.room.getSnapshot(1100).blasts![0].position).toEqual(position);
  s.room.tick(1100+15*1000/30);expect(s.player().health).toBe(25);expect(s.room.getSnapshot().blasts![0].remainingCallbacks).toBe(1);
  s.room.tick(1100+16*1000/30);expect(s.player().health).toBe(20);expect(s.room.getSnapshot().blasts).toEqual([]);
  expect(s.events('damaged')).toHaveLength(16);s.room.tick(3000);expect(s.player().health).toBe(20);
 });
 it('uses RPG source muzzle clearance and a200callback maximum fuse',()=>{
  const s=setup('woodlands'),eye=s.eye();s.fire('rpg',1100);
  const p=s.room.getSnapshot(1100).projectiles[0];expect(p.position.y).toBeCloseTo(eye.y+50*ORIGINAL_MAP_SCALE);expect(p.velocity.y).toBeCloseTo(800*ORIGINAL_MAP_SCALE);expect(p.remainingCallbacks).toBe(200);
  s.room.tick(1100+199*1000/30);expect(s.room.getSnapshot().projectiles[0].remainingCallbacks).toBe(1);
  s.room.tick(1100+200*1000/30);expect(s.room.getSnapshot().projectiles).toHaveLength(0);expect(s.events('explosion')).toHaveLength(1);
 });
 it('applies source blast damage through terrain and ignores targets exactly at the strict eye radius',()=>{
  const s=setup('barrack'),feet=s.player().transform.position,eye=s.eye(),belowFloor={...feet,y:feet.y-.1};
  const runtime=getOriginalMapRuntime('barrack');expect(runtime.geometry.raycast(belowFloor,{x:0,y:1,z:0},eye.y-belowFloor.y)).not.toBeNull();
  const blast=(position:Vec3,id:string,time:number)=>{
   const snapshot:ProjectileSnapshot={projectileId:id,shotId:id,attackerId:s.id,weapon:'launcher',position,velocity:{x:0,y:0,z:0},expiresAt:time};
   installBlast(s.room,s.id,snapshot);
  };
  blast(belowFloor,'occluded',1100);s.room.tick(1100+1000/30);expect(s.player().health).toBe(95);
  // Separate fixture for the exact boundary avoids interference from this blast.
  const boundary=setup('woodlands');
  const internal=(boundary.room as unknown as {players:Map<string,{transform:{position:Vec3};sourceWorld:{body:{position:Vec3}}}>}).players.get(boundary.id)!;
  internal.transform.position.x=0;internal.sourceWorld.body.position.x=0;
  const atEye=boundary.eye(),position={...atEye,x:250*ORIGINAL_MAP_SCALE};
  const snapshot:ProjectileSnapshot={projectileId:'edge',shotId:'edge',attackerId:boundary.id,weapon:'launcher',position,velocity:{x:0,y:0,z:0},expiresAt:1100};
  installBlast(boundary.room,boundary.id,snapshot);
  boundary.room.tick(1100+1000/30);expect(boundary.player().health).toBe(100);
  internal.transform.position.x=.01;internal.sourceWorld.body.position.x=.01;boundary.room.tick(1100+2*1000/30);expect(boundary.player().health).toBe(95);
  internal.transform.position.x=-.01;internal.sourceWorld.body.position.x=-.01;boundary.room.tick(1100+3*1000/30);expect(boundary.player().health).toBe(95);
 });

 it('keeps the authoritative source eye as the spawn origin for a tolerated reported offset',()=>{
  const s=setup('woodlands'),eye=s.eye();
  s.room.handleMessage(s.id,{type:'shoot',shot:{shotId:'offset',weapon:'launcher',origin:{...eye,x:eye.x+.1},direction:{x:0,y:1,z:0}}},1100);
  expect(s.room.getSnapshot(1100).projectiles[0].position).toEqual(eye);
 });
 it('retains RPG replay protection through its longer source fuse',()=>{
  const s=setup('woodlands');s.fire('rpg',1100);
  s.room.handleMessage(s.id,{type:'reload',weapon:'rpg'},1101);s.fire('rpg',5700);
  expect(s.events('projectile_spawned')).toHaveLength(1);
  expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='duplicate_shot')).toBe(true);
 });

});
