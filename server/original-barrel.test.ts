import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {MatchRoom} from './match-room';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {createOriginalPlayerBody,ORIGINAL_PLAYER_EYE_OFFSET,ORIGINAL_PLAYER_RADIUS} from '../shared/originalPlayerPhysics';
import {ORIGINAL_BARREL_LIFT_SOURCE,type OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import type {MessagePeer,ServerMessage,Vec3,PlayerTransform} from './protocol';
import {OriginalSoldierCollision} from '../shared/originalSoldierCollision';
import {originalServerSoldierAssets} from './original-soldier-collision';
import type {ArenaRayHit,ArenaRaycastOptions} from '../shared/arenaCollision';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
function setup(map:'barrack'|'woodlands'='barrack',winter=false,round=false,fixedStart=false){
 const runtime=registerOriginalMapRuntime(map,JSON.parse(readFileSync(`public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,'utf8')));
 const room=new MatchRoom('barrel',{map,now:()=>0,...(fixedStart?{spawnPoints:[runtime.spawnPoints[0]]}:{}),...(round?{sessionMode:'round' as const}:{}),...(winter?{collisionProfile:'winter' as const}:{})}),peer=new Peer(),joined=room.join(peer,'A',0);if(!joined.ok)throw Error(joined.message);
 const inspect=room as unknown as {players:Map<string,{sourceWorld:{barrels:OriginalBarrelWorld}|null;sourceBody:ReturnType<typeof createOriginalPlayerBody>|null;sourceInput:unknown;transform:PlayerTransform;sourceCounterReady:boolean;sourceCounterWeapon:string}>;raycastFor(player:unknown,origin:Vec3,direction:Vec3,max:number,options?:ArenaRaycastOptions):ArenaRayHit|null};
 return {runtime,room,peer,id:joined.player.id,inspect,get world(){return inspect.players.get(joined.player.id)!.sourceWorld!;}};
}
describe('authoritative recovered source movable barrel',()=>{
 it('starts at the literal source lift, falls once per physics callback, and returns detached snapshots',()=>{
  const s=setup(),initial=s.room.getSnapshot(0).barrels!;expect(initial).toHaveLength(1);
  const node=s.runtime.data.nodes.find(n=>n.name===initial[0].id)!;expect(node).toBeDefined();expect(initial[0].position.y).toBeCloseTo((node.matrix[14]+ORIGINAL_BARREL_LIFT_SOURCE)*ORIGINAL_MAP_SCALE);
  s.room.tick(1000/30);const after=s.room.getSnapshot(1000/30).barrels!;expect(after[0].position.y).toBeLessThan(initial[0].position.y);expect(after[0].velocity.y).toBeLessThan(0);
  const settled=after[0].position.y;s.room.tick(1000/30);expect(s.room.getSnapshot(1000/30).barrels![0].position.y).toBe(settled);
  after[0].position.y=123;expect(s.room.getSnapshot(1000/30).barrels![0].position.y).toBe(settled);
 });
 it('uses actual player contact to push its finite-mass hull without detonation or damage',()=>{
  const s=setup(),barrel=s.world.barrels.bodies[0],actor=s.inspect.players.get(s.id)!;
  const maxX=Math.max(...barrel.convex.vertices.map(v=>v.x));
  const maxY=Math.max(...barrel.convex.vertices.map(v=>v.y));
  const position={x:barrel.position.x+maxX+ORIGINAL_PLAYER_RADIUS-.002,y:barrel.position.y+maxY*.5,z:barrel.position.z};
  actor.sourceBody=createOriginalPlayerBody(s.id,{...position,y:position.y+ORIGINAL_PLAYER_EYE_OFFSET},{x:-2,y:0,z:0});actor.sourceInput={yaw:0,pitch:0,typing:true};
  actor.transform.position={...position,y:position.y+ORIGINAL_PLAYER_EYE_OFFSET-s.runtime.profile.eyeHeight};
  const before=barrel.position.x;s.room.tick(1000/30);expect(barrel.position.x).toBeLessThan(before);expect(barrel.velocity.x).toBeLessThan(0);
  expect(s.peer.messages.filter(m=>m.type==='event'&&['explosion','damaged'].includes(m.event.type))).toEqual([]);
 });
 it('obstructs authority combat rays at its current pose and remains a movable hull',()=>{
  const s=setup(),barrel=s.world.barrels.bodies[0],origin={...barrel.position,x:barrel.position.x-1,y:barrel.position.y+Math.max(...barrel.convex.vertices.map(v=>v.y))*.5};
  const hit=s.inspect.raycastFor(s.inspect.players.get(s.id),origin,{x:1,y:0,z:0},2,{includeGround:false});expect(hit).not.toBeNull();expect(hit!.distance).toBeLessThan(1);
  const actor=s.inspect.players.get(s.id)!;
  actor.transform.position={...origin,y:origin.y-s.runtime.profile.eyeHeight};actor.sourceCounterReady=true;actor.sourceCounterWeapon='launcher';
  const before=s.room.getSnapshot(0).barrels!;s.room.handleMessage(s.id,{type:'shoot',shot:{shotId:'barrel-ray',weapon:'launcher',origin,direction:{x:1,y:0,z:0}}},0);
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='projectile_spawned')).toHaveLength(1);
  expect(s.room.getSnapshot(0).barrels).toEqual(before);expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='explosion')).toEqual([]);
 });
 it('blocks a real registered hitscan behind the barrel and permits the same ray when its body is absent',()=>{
  const s=setup(),barrel=s.world.barrels.bodies[0],peer=new Peer(),joined=s.room.join(peer,'B',0);if(!joined.ok)throw Error(joined.message);
  const attacker=s.inspect.players.get(s.id)!,target=s.inspect.players.get(joined.player.id)!;
  const origin={...barrel.position,x:barrel.position.x-2,y:barrel.position.y+.65};
  attacker.transform.position={...origin,y:origin.y-s.runtime.profile.eyeHeight};attacker.transform.weapon='pistol';
  target.transform.position={...barrel.position,x:barrel.position.x+2,y:barrel.position.y-.35};
  Object.assign(target,{sourceMotionPosition:{...target.transform.position},positionHistory:[],sourcePoseHistory:[]});
  (s.room as unknown as {recordPosition(player:unknown,now:number):void}).recordPosition(target,0);
  const collision=new OriginalSoldierCollision(originalServerSoldierAssets),vertices=collision.evaluatePose(target.transform.position,target.transform.yaw+Math.PI,0);
  const mesh=originalServerSoldierAssets.geometry.meshes.find(m=>m.resource==='GI')!;
  let direction:Vec3|undefined;
  for(const face of mesh.faces){
   const [a,b,c]=face.map(i=>vertices[i]),point={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3,z:(a.z+b.z+c.z)/3};
   if(point.y-target.transform.position.y<.8||point.y-target.transform.position.y>1.2)continue;
   const d={x:point.x-origin.x,y:point.y-origin.y,z:point.z-origin.z},len=Math.hypot(d.x,d.y,d.z),candidate={x:d.x/len,y:d.y/len,z:d.z/len};
   if(collision.intersectRay(origin,candidate,len+.01)&&s.world.barrels.raycast(origin,candidate,len)){direction=candidate;break;}
  }
  expect(direction).toBeDefined();
  const fire=(shotId:string)=>{attacker.sourceCounterReady=true;attacker.sourceCounterWeapon='pistol';s.room.handleMessage(s.id,{type:'shoot',shot:{shotId,weapon:'pistol',origin,direction:direction!}},0);s.room.handleMessage(s.id,{type:'hit',hit:{shotId,targetId:joined.player.id}},0);};
  fire('blocked');expect(s.room.getSnapshot(0).players.find(p=>p.id===joined.player.id)!.health).toBe(100);
  s.world.barrels.applySnapshots([]);fire('clear');expect(s.room.getSnapshot(0).players.find(p=>p.id===joined.player.id)!.health).toBe(88);
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='explosion')).toEqual([]);
 });
 it('isolates observer bodies, starts late join barrels fresh and retains living reconnect poses',()=>{
  const first=setup('barrack',false,false,true),second=setup('barrack',false,false,true),initial=second.room.getSnapshot(0).barrels;first.room.tick(200);expect(first.room.getSnapshot(200).barrels).not.toEqual(initial);expect(second.room.getSnapshot(0).barrels).toEqual(initial);
  const pose=first.room.getSnapshot(200).barrels,late=new Peer();expect(first.room.join(late,'B',200).ok).toBe(true);
  expect(late.messages.filter(m=>m.type==='snapshot').at(-1)).toMatchObject({snapshot:{barrels:initial}});
  expect(first.inspect.players.get(first.id)!.sourceWorld!.barrels.snapshots()).toEqual(pose);
  const welcome=first.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');first.room.suspend(first.id,200,first.peer);const resumed=new Peer();expect(first.room.join(resumed,'A',200,welcome.resumeToken).ok).toBe(true);
  expect(resumed.messages.filter(m=>m.type==='snapshot').at(-1)).toMatchObject({snapshot:{barrels:pose}});
 });
 it('starts fresh barrel bodies when a round-mode player respawns',()=>{
  const s=setup('barrack',false,true),initial=s.room.getSnapshotFor(s.id,0).barrels,oldWorld=s.world;s.room.tick(100);const before=s.room.getSnapshotFor(s.id,100).barrels;expect(before).not.toEqual(initial);
  const review=s.room as unknown as {respawn(player:unknown,now:number):void};review.respawn(s.inspect.players.get(s.id),100);
  expect(s.inspect.players.get(s.id)!.sourceWorld).toBeNull();expect(s.room.getSnapshotFor(s.id,100).barrels).toEqual(initial);expect(s.world).not.toBe(oldWorld);expect(s.world.barrels.bodies[0]).not.toBe(oldWorld.barrels.bodies[0]);
 });
 it('publishes an empty Woodland source list and omits barrels for Winter',()=>{
  expect(setup('woodlands').room.getSnapshot(0).barrels).toEqual([]);expect(setup('barrack',true).room.getSnapshot(0)).not.toHaveProperty('barrels');
 });
});
