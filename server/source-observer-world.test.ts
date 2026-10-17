import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_PLAYER_RADIUS,type OriginalPlayerBody} from '../shared/originalPlayerPhysics';
import type {OriginalRemoteView} from '../shared/originalRemoteView';
import type {OriginalProjectileState} from '../shared/originalExplosives';
import type {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import type {ArenaRayHit,ArenaRaycastOptions} from '../shared/arenaCollision';
import type {OriginalDoorWorld} from '../shared/originalDoorWorld';
import type {MessagePeer,MatchEvent,PlayerTransform,ProjectileSnapshot,ServerMessage,Vec3} from './protocol';

class Peer implements MessagePeer {
 messages:ServerMessage[]=[];
 failLaunch=false;
 failDamage=false;
 failDoor=false;
 send(message:ServerMessage){
  if(this.failDoor&&message.type==='event'&&message.event.type==='door_open')throw Error('Fixture rejected door delivery');
  if(this.failDamage&&message.type==='event'&&message.event.type==='damaged')throw Error('Fixture rejected damage delivery');
  if(this.failLaunch&&message.type==='event'&&message.event.type==='projectile_spawned')throw Error('Fixture rejected launch delivery');
  this.messages.push(message);
 }
}
interface Active {snapshot:ProjectileSnapshot;source:OriginalProjectileState;updatedAt:number}
interface World {
 body:OriginalPlayerBody;barrels:OriginalBarrelWorld;doors?:OriginalDoorWorld;
 projectiles:Map<string,Active>;blasts:Map<string,unknown>;updatedAt:number;
}
interface Actor {
 id:string;name:string;alive:boolean;health:number;transform:PlayerTransform;resumeToken:string;
 sourceRemoteView:OriginalRemoteView|null;sourceViewGeneration:number;
 sourceBody:OriginalPlayerBody|null;sourceWorld:World|null;sourceExplosiveCutoff:number;
}
interface Inspect {
 players:Map<string,Actor>;projectiles:Map<string,Active>;sourceHealthUpdatedAt:number|null;
 updateSourceWorldImpl(time:number):void;detonateSourceFor(actor:Actor,active:Active,time:number):void;
 respawn(actor:Actor,time:number):void;
 supportHeight(position:Vec3,maxY:number,actor:Actor):number|undefined;
 commitDoors(actor:Actor,doors:OriginalDoorWorld,time:number):void;
 freezeSourceRay(actor:Actor):(origin:Vec3,direction:Vec3,max:number,options:ArenaRaycastOptions)=>ArenaRayHit|null;
 getSnapshotFor(actor:Actor,time:number):ReturnType<MatchRoom['getSnapshot']>;
}
const maps=['barrack','woodlands'] as const;
const held={forward:false,backward:false,left:false,right:false,jump:false};
const interval=1000/30;
const events=(peer:Peer,type:MatchEvent['type'])=>peer.messages.flatMap(message=>message.type==='event'&&message.event.type===type?[message.event]:[]);

/** Normal admission/delivery constructs production observer worlds and actors.
 * Direct positions and empty fixed geometry isolate dynamic population; these
 * fixtures do not establish a native trajectory or rendered callback timing.
 * No world solver, actor step, delivery, or serialization function is mocked. */
function setup(map:typeof maps[number],controlled=false,failedDelivery=false,weapon:'launcher'|'rpg'='launcher'){
 let sequence=0;
 const runtime=getOriginalMapRuntime(map);
 const room=new MatchRoom('observer-world',{map,sessionMode:'round',now:()=>0,idFactory:()=>`viewer-${++sequence}`,spawnPoints:[runtime.spawnPoints[0]]});
 const inspect=room as unknown as Inspect;
 const join=(name:string)=>{
  const peer=new Peer(),result=room.join(peer,name,0);
  if(!result.ok)throw Error(result.message);
  const actor=inspect.players.get(result.player.id)!;
  if(!actor.sourceWorld)throw Error('Source welcome must construct its observer world');
  return {actor,peer,world:actor.sourceWorld};
 };
 const owner=join('Launcher'),denied=join('lAuNcHeR'),observer=join('Observer');
 observer.peer.failLaunch=failedDelivery;
 room.handleMessage(owner.actor.id,{type:'transform',sequence:1,clientTime:1000,transform:{...owner.actor.transform,weapon}},1000,owner.peer);
 room.handleMessage(owner.actor.id,{type:'shoot',shot:{shotId:'independent-launch',weapon,origin:{...owner.actor.transform.position,y:owner.actor.transform.position.y+runtime.profile.eyeHeight},direction:{x:-1,y:0,z:0}}},1100,owner.peer);
 const launch=[...inspect.projectiles.values()][0];
 if(!launch)throw Error('Admitted source launch missing: '+JSON.stringify(owner.peer.messages.filter(message=>message.type==='error')));
 const id=launch.snapshot.projectileId;
 if(controlled)for(const viewer of [owner,denied,observer])room.handleMessage(viewer.actor.id,{type:'transform',sequence:viewer===owner?2:1,clientTime:1100,transform:{...viewer.actor.transform,sourceInput:held,typing:true}},1100,viewer.peer);
 const own=()=>owner.world.projectiles.get(id)!;
 const remote=()=>observer.world.projectiles.get(id)!;
 const empty=()=>{
  Object.defineProperty(room,'originalGeometry',{configurable:true,value:{...runtime.geometry,sweepSphere:()=>null,sweepConvex:()=>null,contactsSphere:()=>[],contactsConvex:()=>[]}});
  for(const [n,viewer] of [owner,denied,observer].entries()){
   viewer.world.doors=undefined;viewer.world.barrels.applySnapshots([]);viewer.world.updatedAt=1100;
   viewer.actor.transform.position={x:1000+n*20,y:1000,z:1000};viewer.actor.transform.velocity={x:0,y:0,z:0};viewer.actor.transform.grounded=false;
   viewer.world.body.position={x:1000+n*20,y:1000+ORIGINAL_PLAYER_RADIUS,z:1000};viewer.world.body.velocity={x:0,y:0,z:0};viewer.world.body.supported=false;
  }
  inspect.sourceHealthUpdatedAt=1100;
 };
 const step=(n=1)=>inspect.updateSourceWorldImpl(1100+n*interval);
 const snapshot=(viewer:typeof owner,time=1100)=>inspect.getSnapshotFor(viewer.actor,time);
 return {room,inspect,runtime,owner,denied,observer,launch,id,own,remote,empty,step,snapshot};
}

describe('source per-observer physical worlds',()=>{
 it.each(maps)('%s creates no remote physics actor when launch delivery fails',map=>{
  const s=setup(map,false,true);
  expect(s.own()).toBeDefined();expect(s.observer.world.projectiles.size).toBe(0);
  expect(s.observer.world.blasts.size).toBe(0);expect(events(s.observer.peer,'projectile_spawned')).toEqual([]);
 });

 it.each(maps)('%s clones mutable projectile and barrel state per successful receipt',map=>{
  const s=setup(map),a=s.own(),b=s.remote();
  expect(a).toBeDefined();expect(b).toBeDefined();expect(s.denied.world.projectiles.size).toBe(0);
  expect(a).not.toBe(b);expect(a.source).not.toBe(b.source);expect(a.snapshot).not.toBe(b.snapshot);
  expect(a.source.position).not.toBe(b.source.position);expect(a.source.velocity).not.toBe(b.source.velocity);
  expect(a.source.angular).not.toBe(b.source.angular);
  expect(a.source.angular!.orientation).not.toBe(b.source.angular!.orientation);
  expect(a.source.angular!.angularVelocity).not.toBe(b.source.angular!.angularVelocity);
  expect(s.owner.world.body).not.toBe(s.observer.world.body);
  expect(s.owner.world.barrels).not.toBe(s.observer.world.barrels);
  if(map==='barrack'){
   expect(s.owner.world.barrels.bodies.length).toBeGreaterThan(0);
   const barrelA=s.owner.world.barrels.bodies[0],barrelB=s.observer.world.barrels.bodies[0];
   expect(barrelA).not.toBe(barrelB);expect(barrelA.position).not.toBe(barrelB.position);expect(barrelA.angular).not.toBe(barrelB.angular);
   const beforeBarrel={...barrelB.position};barrelA.position.x+=10;expect(barrelB.position).toEqual(beforeBarrel);
  }else expect(s.owner.world.barrels.bodies).toEqual([]);
  const before=structuredClone(b.source.position);a.source.position.x+=3;a.source.angular!.angularVelocity.x+=1;
  expect(b.source.position).toEqual(before);expect(b.source.angular!.angularVelocity.x).toBe(0);
  if(map==='barrack')expect(s.owner.world.doors).not.toBe(s.observer.world.doors);
 });

 it.each(maps.flatMap(map=>[false,true].map(controlled=>({map,controlled}))))('$map controlled=$controlled gives a projectile only its own world goody contact',({map,controlled})=>{
  const s=setup(map,controlled);s.empty();
  // All three local bodies coincide, but only owner and observer received a
  // projectile. Move the observer copy away: there is one actual collision.
  for(const viewer of [s.owner,s.denied,s.observer]){
   viewer.actor.transform.position={x:100,y:100,z:100};viewer.world.body.position={x:100,y:100+ORIGINAL_PLAYER_RADIUS,z:100};
  }
  const a=s.own(),b=s.remote(),extent=-Math.min(...a.source.convex!.vertices.map(vertex=>vertex.x));
  a.source.position={x:100+ORIGINAL_PLAYER_RADIUS+extent+.08,y:100+ORIGINAL_PLAYER_RADIUS,z:100};a.source.velocity={x:-10,y:0,z:0};
  b.source.position={x:200,y:100+ORIGINAL_PLAYER_RADIUS,z:100};b.source.velocity={x:-10,y:0,z:0};
  const bStart={...b.source.position};s.step();
  expect(s.owner.actor.transform.velocity.x).not.toBe(0);
  expect(s.denied.actor.transform.velocity.x).toBe(0);expect(s.observer.actor.transform.velocity.x).toBe(0);
  expect(a.source.velocity.x).not.toBe(b.source.velocity.x);expect(b.source.position.x).toBeCloseTo(bStart.x-.5,8);
  expect(events(s.owner.peer,'projectile_contact').length).toBeGreaterThan(0);
  expect(events(s.denied.peer,'projectile_contact')).toEqual([]);expect(events(s.observer.peer,'projectile_contact')).toEqual([]);
  expect(s.snapshot(s.denied).projectiles).toEqual([]);
  expect(s.snapshot(s.owner).projectiles[0].position).not.toEqual(s.snapshot(s.observer).projectiles[0].position);
 });

 it.each(maps)('%s detonates and damages only the observer whose actor expires',map=>{
  const s=setup(map);s.empty();
  const a=s.own(),b=s.remote();
  a.source.position={...s.owner.world.body.position};a.snapshot.position={...a.source.position};a.source.remainingCallbacks=1;a.source.velocity={x:0,y:0,z:0};
  b.source.position={x:500,y:500,z:500};b.source.velocity={x:0,y:0,z:0};
  s.step();
  expect(s.owner.world.projectiles.has(s.id)).toBe(false);expect(s.owner.world.blasts.has(s.id)).toBe(true);
  expect(s.observer.world.projectiles.has(s.id)).toBe(true);expect(s.observer.world.blasts.has(s.id)).toBe(false);
  expect(events(s.owner.peer,'explosion')).toHaveLength(1);expect(events(s.observer.peer,'explosion')).toEqual([]);expect(events(s.denied.peer,'explosion')).toEqual([]);
  expect(s.inspect.projectiles.has(s.id)).toBe(true);
  for(let n=2;n<=17;n++)s.step(n);
  expect(s.owner.actor.health).toBe(20);expect(s.denied.actor.health).toBe(100);expect(s.observer.actor.health).toBe(100);
  const damage=events(s.owner.peer,'damaged').filter(event=>event.type==='damaged'&&event.data.source.kind==='explosion'&&event.data.source.projectileId===s.id);
  expect(damage).toHaveLength(16);expect(damage.every(event=>event.type==='damaged'&&event.data.targetId===s.owner.actor.id)).toBe(true);
  expect(s.owner.world.blasts.has(s.id)).toBe(false);expect(s.observer.world.projectiles.has(s.id)).toBe(true);
  expect(s.snapshot(s.owner,1100+17*interval).blasts).toEqual([]);
  // Periodic delivery must not resurrect this finished local actor from B.
  s.room.tick(1100+18*interval);
  expect(s.owner.world.projectiles.has(s.id)).toBe(false);expect(s.owner.world.blasts.has(s.id)).toBe(false);
  expect(s.observer.world.projectiles.has(s.id)).toBe(true);
 });

 it.each([false,true])('Barrack door state follows successful eligible per-world delivery; failure=%s',failed=>{
  const s=setup('barrack');
  const world=s.owner.world.doors!.fork(),door=world.getStates().find(state=>state.openedAt===null)!;
  expect(door).toBeDefined();s.observer.peer.failDoor=failed;
  expect(world.open(door.name,1.1)).toBe(true);s.inspect.commitDoors(s.owner.actor,world,1100);
  expect(s.owner.world.doors!.getStates().find(state=>state.name===door.name)?.openedAt).toBe(1.1);
  expect(s.denied.world.doors!.getStates().find(state=>state.name===door.name)?.openedAt).toBeNull();
  const received=s.observer.world.doors!.getStates().find(state=>state.name===door.name)?.openedAt;
  if(failed)expect(received).toBeNull();else expect(received).toBeCloseTo(1.1,12);
  expect(s.snapshot(s.denied).doors?.find(state=>state.name===door.name)?.openedAt).toBeNull();
 });

 it('Barrack support and frozen source rays query the shooter own barrel population',()=>{
  const s=setup('barrack');
  Object.defineProperty(s.room,'originalGeometry',{value:{...s.runtime.geometry,raycast:()=>null,playerSupportHeightAt:()=>undefined}});
  for(const viewer of [s.owner,s.denied,s.observer]){
   viewer.world.doors=undefined;viewer.world.projectiles.clear();
  }
  const initial=s.owner.world.barrels.snapshots()[0];
  s.owner.world.barrels.applySnapshots([{...initial,position:{x:100,y:100,z:100}}]);
  s.observer.world.barrels.applySnapshots([]);
  const body=s.owner.world.barrels.bodies[0],position={...body.position};
  const expected=s.owner.world.barrels.playerSupportHeightAt(position.x,position.z,Infinity,s.runtime.profile.radius,s.runtime.profile.bodyHeight);
  expect(expected).toBeDefined();
  expect(s.inspect.supportHeight(position,Infinity,s.owner.actor)).toBe(expected);
  expect(s.inspect.supportHeight(position,Infinity,s.observer.actor)).toBeUndefined();
  const origin={x:position.x-2,y:position.y+.65,z:position.z},direction={x:1,y:0,z:0};
  const frozen=s.inspect.freezeSourceRay(s.owner.actor);
  const own=frozen(origin,direction,4,{});
  expect(own?.id).toBe(body.id);expect(s.inspect.freezeSourceRay(s.observer.actor)(origin,direction,4,{})).toBeNull();
  s.owner.world.barrels.applySnapshots([]);
  expect(frozen(origin,direction,4,{})).toEqual(own);
  expect(s.inspect.freezeSourceRay(s.owner.actor)(origin,direction,4,{})).toBeNull();
 });

 it.each(maps)('%s stops local blast damage when failed delivery suspends its goody mid-callback',map=>{
  const s=setup(map);s.empty();
  s.inspect.sourceHealthUpdatedAt=2100;for(const viewer of [s.owner,s.denied,s.observer])viewer.world.updatedAt=2100;
  s.room.handleMessage(s.owner.actor.id,{type:'transform',sequence:2,clientTime:2100,transform:{...s.owner.actor.transform,weapon:'launcher'}},2100,s.owner.peer);
  s.room.handleMessage(s.owner.actor.id,{type:'shoot',shot:{shotId:'second-launch',weapon:'launcher',origin:{...s.owner.actor.transform.position,y:s.owner.actor.transform.position.y+s.runtime.profile.eyeHeight},direction:{x:-1,y:0,z:0}}},2200,s.owner.peer);
  expect(s.owner.world.projectiles.size).toBe(2);
  s.empty();
  for(const active of [...s.owner.world.projectiles.values()]){
   active.snapshot.position={...s.owner.world.body.position};
   s.inspect.detonateSourceFor(s.owner.actor,active,2200);
  }
  expect(s.owner.world.blasts.size).toBe(2);s.owner.peer.failDamage=true;
  s.inspect.sourceHealthUpdatedAt=2200;
  for(const viewer of [s.owner,s.denied,s.observer])viewer.world.updatedAt=2200;
  s.inspect.updateSourceWorldImpl(2200+interval);
  expect(s.owner.actor.health).toBe(95);
 });

 it.each(maps)('%s preserves a received instance after its sender leaves',map=>{
  const s=setup(map),remote=s.remote();s.empty();remote.source.position={x:200,y:200,z:200};remote.source.velocity={x:2,y:0,z:0};
  expect(s.room.leave(s.owner.actor.id,1100,s.owner.peer)).toBe(true);
  expect(s.observer.world.projectiles.get(s.id)).toBe(remote);s.step();
  expect(remote.source.position.x).toBeCloseTo(200.1,8);expect(remote.source.remainingCallbacks).toBe(59);
  expect(s.snapshot(s.observer).projectiles).toHaveLength(1);
 });

 it.each(maps)('%s replaces only the dead life world and does not restore pre-cutoff actors',map=>{
  const s=setup(map),old=s.observer.world,other=s.owner.world,actor=s.remote();
  const oldBarrel=old.barrels.bodies[0];if(oldBarrel)oldBarrel.position.x+=10;
  s.room.handleMessage(s.observer.actor.id,{type:'source_escape'},1100,s.observer.peer);
  expect(s.observer.actor.alive).toBe(false);expect(old.projectiles.size).toBe(0);expect(old.blasts.size).toBe(0);
  s.inspect.respawn(s.observer.actor,1100);
  s.inspect.getSnapshotFor(s.observer.actor,1100);
  const fresh=s.observer.actor.sourceWorld!;
  expect(fresh).not.toBe(old);expect(fresh.body).not.toBe(old.body);
  if(oldBarrel)expect(fresh.barrels.bodies[0].position).not.toEqual(oldBarrel.position);
  else expect(fresh.barrels.bodies).toEqual([]);
  expect(fresh.projectiles.has(s.id)).toBe(false);expect(fresh.blasts.size).toBe(0);
  expect(s.owner.actor.sourceWorld).toBe(other);expect(other.projectiles.has(s.id)).toBe(true);
  expect(actor).not.toBe(other.projectiles.get(s.id));expect(s.observer.actor.sourceExplosiveCutoff).toBeGreaterThan(0);
 });

 it.each(maps)('%s resumes its frozen living world without catch-up and rebases wire expiry',map=>{
  const s=setup(map);s.empty();
  const retained=s.observer.world,active=s.remote(),callbacks=active.source.remainingCallbacks;
  const token=s.observer.actor.resumeToken;
  expect(s.room.suspend(s.observer.actor.id,1100,s.observer.peer)).toBe(true);
  // Wall time exceeds the original launch expiry, but this suspended world
  // has not consumed any callbacks.
  const now=s.launch.snapshot.expiresAt+1000;s.room.tick(now);
  expect(active.source.remainingCallbacks).toBe(callbacks);
  const peer=new Peer(),joined=s.room.join(peer,'ignored resume name',now,token);
  expect(joined.ok).toBe(true);expect(s.observer.actor.sourceWorld).toBe(retained);
  expect(retained.projectiles.get(s.id)).toBe(active);
  expect(active.source.remainingCallbacks).toBe(callbacks);
  const packet=peer.messages.find(message=>message.type==='snapshot');
  if(packet?.type!=='snapshot')throw Error('Resume snapshot missing');
  const projected=packet.snapshot.projectiles.find(actor=>actor.projectileId===s.id)!;
  expect(projected).toBeDefined();
  expect(projected.expiresAt).toBeGreaterThanOrEqual(now+(callbacks-1)*interval-1e-6);
 });

 it.each(maps)('%s late join restores one independent projectile or blast checkpoint type',map=>{
  const s=setup(map),donor=s.own();
  donor.source.position={x:100,y:100,z:100};donor.source.velocity={x:2,y:3,z:4};
  donor.snapshot.position={...donor.source.position};donor.snapshot.velocity={...donor.source.velocity};
  const firstPeer=new Peer(),firstJoin=s.room.join(firstPeer,'Late projectile',1100);
  if(!firstJoin.ok)throw Error(firstJoin.message);
  const first=s.inspect.players.get(firstJoin.player.id)!,copy=first.sourceWorld!.projectiles.get(s.id)!;
  expect(copy.source.position).toEqual(donor.source.position);expect(copy.source).not.toBe(donor.source);
  expect(copy.source.angular).not.toBe(donor.source.angular);copy.source.position.x+=10;
  expect(donor.source.position.x).toBe(100);
  s.inspect.detonateSourceFor(s.owner.actor,donor,1100);
  const secondPeer=new Peer(),secondJoin=s.room.join(secondPeer,'Late blast',1100);
  if(!secondJoin.ok)throw Error(secondJoin.message);
  const second=s.inspect.players.get(secondJoin.player.id)!,world=second.sourceWorld!;
  expect(world.projectiles.has(s.id)).toBe(false);expect(world.blasts.has(s.id)).toBe(true);
  const sourceBlast=s.owner.world.blasts.get(s.id) as {state:{position:Vec3};snapshot:{position:Vec3}};
  const blast=world.blasts.get(s.id) as typeof sourceBlast;
  expect(blast).not.toBe(sourceBlast);expect(blast.state).not.toBe(sourceBlast.state);expect(blast.state.position).not.toBe(sourceBlast.state.position);
  blast.state.position.x+=20;expect(sourceBlast.state.position.x).toBe(100);
  const packet=secondPeer.messages.find(message=>message.type==='snapshot');
  expect(packet?.type==='snapshot'?packet.snapshot.projectiles:undefined).toEqual([]);
  expect(packet?.type==='snapshot'?packet.snapshot.blasts:undefined).toHaveLength(1);
 });

 it.each(maps)('%s RPG uses its own accepted baddy mirror rather than common room truth',map=>{
  const s=setup(map,false,false,'rpg');s.empty();
  // Create an ordinary target, then two genuinely negotiated viewers. Their
  // successful initial snapshots carry different historical target positions.
  const targetPeer=new Peer(),targetJoin=s.room.join(targetPeer,'Target',1100);
  if(!targetJoin.ok)throw Error(targetJoin.message);
  const target=s.inspect.players.get(targetJoin.player.id)!;
  const center={x:100,y:100,z:100};
  const viewer=(name:string,near:boolean)=>{
   target.transform.position={x:near?100:500,y:100-s.runtime.profile.eyeHeight,z:100};
   const peer=new Peer(),joined=s.room.join(peer,name,1100,undefined,true);
   if(!joined.ok)throw Error(joined.message);
   const actor=s.inspect.players.get(joined.player.id)!,world=actor.sourceWorld!;
   expect(actor.sourceRemoteView!.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},1100)).toEqual({ok:true});
   world.doors=undefined;world.barrels.applySnapshots([]);world.updatedAt=1100;
   world.body.position={x:1000,y:1000,z:1000};world.body.velocity={x:0,y:0,z:0};
   const projectile=world.projectiles.get(s.id)!;expect(projectile).toBeDefined();
   projectile.source.position={...center};projectile.source.velocity={x:0,y:0,z:0};
   return {actor,world,peer};
  };
  const a=viewer('Viewer A',true),b=viewer('Viewer B',false);
  // Current room truth is the same for both; accepted historical mirrors differ.
  target.transform.position={x:900,y:900,z:900};
  expect(a.actor.sourceRemoteView!.freeze().find(pose=>pose.id===target.id)?.position.x).toBe(100);
  expect(b.actor.sourceRemoteView!.freeze().find(pose=>pose.id===target.id)?.position.x).toBe(500);
  s.inspect.sourceHealthUpdatedAt=1100;s.step();
  expect(a.world.projectiles.has(s.id)).toBe(false);expect(a.world.blasts.has(s.id)).toBe(true);
  expect(b.world.projectiles.has(s.id)).toBe(true);expect(b.world.blasts.has(s.id)).toBe(false);
  expect(events(a.peer,'explosion')).toHaveLength(1);expect(events(b.peer,'explosion')).toEqual([]);
 });

 it.each(maps)('%s keeps RPG launch-name exclusion in the accepted mirror after sender departure',map=>{
  const s=setup(map,false,false,'rpg');s.empty();
  const center={x:100,y:100,z:100};
  s.denied.actor.transform.position={x:100,y:100-s.runtime.profile.eyeHeight,z:100};
  const peer=new Peer(),joined=s.room.join(peer,'Retained viewer',1100,undefined,true);
  if(!joined.ok)throw Error(joined.message);
  const actor=s.inspect.players.get(joined.player.id)!,world=actor.sourceWorld!,projectile=world.projectiles.get(s.id)!;
  expect(actor.sourceRemoteView!.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},1100)).toEqual({ok:true});
  expect(actor.sourceRemoteView!.freeze().find(pose=>pose.id===s.denied.actor.id)?.position.x).toBe(100);
  world.doors=undefined;world.barrels.applySnapshots([]);world.updatedAt=1100;
  world.body.position={x:1000,y:1000,z:1000};world.body.velocity={x:0,y:0,z:0};
  projectile.source.position={...center};projectile.source.velocity={x:0,y:0,z:0};
  expect(s.room.leave(s.owner.actor.id,1100,s.owner.peer)).toBe(true);
  s.inspect.sourceHealthUpdatedAt=1100;s.step();
  expect(world.projectiles.get(s.id)).toBe(projectile);expect(projectile.source.remainingCallbacks).toBe(199);
  expect(world.blasts.has(s.id)).toBe(false);expect(events(peer,'explosion')).toEqual([]);
 });

 it('keeps Winter on the existing global projectile path',()=>{
  let id=0;
  const room=new MatchRoom('winter',{map:'barrack',collisionProfile:'winter',now:()=>0,idFactory:()=>`winter-${++id}`,spawnPoints:[{x:40,y:0,z:30}]});
  const inspect=room as unknown as Inspect,peer=new Peer(),joined=room.join(peer,'Owner',0);
  if(!joined.ok)throw Error(joined.message);
  const actor=inspect.players.get(joined.player.id)!;
  expect(actor.sourceWorld??null).toBeNull();
  room.handleMessage(actor.id,{type:'transform',sequence:1,clientTime:1000,transform:{...actor.transform,weapon:'launcher'}},1000,peer);
  room.handleMessage(actor.id,{type:'shoot',shot:{shotId:'winter-shot',weapon:'launcher',origin:{...actor.transform.position,y:actor.transform.position.y+1.55},direction:{x:0,y:1,z:0}}},1100,peer);
  expect(inspect.projectiles.size).toBe(1);expect(room.getSnapshot(1100).projectiles).toHaveLength(1);
 });
});
