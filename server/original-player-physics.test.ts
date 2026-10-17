import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalProjectile} from '../shared/originalExplosives';
import {ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_DERIVATIVE_JUMP,ORIGINAL_PLAYER_DERIVATIVE_GRAVITY,ORIGINAL_PLAYER_DERIVATIVE_FACTOR,originalPlayerEye,stepOriginalPhysicsWorld,type OriginalPlayerBody} from '../shared/originalPlayerPhysics';
import {applyOriginalPlayerMovementControls} from '../shared/copyPlayerControls';
import type {MessagePeer,ServerMessage,PlayerTransform,Vec3} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
const held=(changes:Partial<NonNullable<PlayerTransform['sourceInput']>>={})=>({forward:false,backward:false,left:false,right:false,jump:false,...changes});
function setup(){
 const runtime=getOriginalMapRuntime('woodlands'),spawn={...runtime.spawnPoints[0]},room=new MatchRoom('source-player',{map:'woodlands',spawnPoints:[spawn],now:()=>0}),peer=new Peer(),joined=room.join(peer,'PLAYER',0);
 if(!joined.ok)throw Error('join');
 // Isolate source control dimensions from the still unproved native terrain
 // manifold. The production adapter supplies actual recovered triangle sweeps.
 const floorSweep=(from:Vec3,to:Vec3,height:number)=>{
  const floor=spawn.y+height;if(to.y>=floor||to.y>=from.y)return null;
  const fraction=Math.max(0,(from.y-floor)/(from.y-to.y));return {position:{x:from.x+(to.x-from.x)*fraction,y:floor,z:from.z+(to.z-from.z)*fraction},normal:{x:0,y:1,z:0},fraction};
 };
 Object.defineProperty(room,'originalGeometry',{value:{...runtime.geometry,groundBounds:runtime.geometry.groundBounds,bounds:runtime.geometry.bounds,
  sweepSphere:floorSweep,
  // An infinite plane touches the transformed hull's lowest vertex. The
  // projectile pivot radius is only a broadphase bound, not its floor offset.
  sweepConvex(from:Vec3,to:Vec3,shape:{vertices:readonly Vec3[]}){
   return floorSweep(from,to,-Math.min(...shape.vertices.map(vertex=>vertex.y)));
  },
 }});
 const id=joined.player.id,player=()=>room.getSnapshot().players.find(player=>player.id===id)!;
 let sequence=0;
 const input=(intent:NonNullable<PlayerTransform['sourceInput']>,time:number,extra:Partial<PlayerTransform>={})=>room.handleMessage(id,{type:'transform',sequence:++sequence,clientTime:time,transform:{...player().transform,...extra,sourceInput:intent}},time);
 return {room,peer,id,player,input,spawn};
}
describe('source held input authoritative joint body',()=>{
 it.each(['source','modern-walk','modern-sprint','modern-aim'] as const)('matches the shared held-body controls and publishes %s mode',movementMode=>{
  const s=setup(),intent=held({forward:true,right:true,jump:true});
  s.input(intent,0,{movementMode,yaw:.4,pitch:.3});
  const actor=(s.room as unknown as {players:Map<string,{sourceBody:OriginalPlayerBody}>}).players.get(s.id)!;
  const expected:OriginalPlayerBody={...actor.sourceBody,position:{...actor.sourceBody.position},velocity:{...actor.sourceBody.velocity}};
  const geometry=(s.room as unknown as {originalGeometry:{sweepSphere:(from:Vec3,to:Vec3,radius:number)=>never}}).originalGeometry;
  stepOriginalPhysicsWorld([expected],[],{sweep:(from,to,radius)=>geometry.sweepSphere(from,to,radius)});
  const control=applyOriginalPlayerMovementControls(expected,{...intent,yaw:.4,pitch:.3},movementMode);
  s.room.tick(1000/30);const actual=s.player().transform,eye=originalPlayerEye(expected);
  expect(actual.position).toEqual({...eye,y:eye.y-1.72});
  expect(actual.velocity).toEqual({x:expected.velocity.x*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:expected.velocity.y*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:expected.velocity.z*ORIGINAL_PLAYER_DERIVATIVE_FACTOR});
  expect(actual.grounded).toBe(control.grounded&&!control.jumped);expect(actual.movementMode).toBe(movementMode);
  expect(s.peer.messages.filter(message=>message.type==='error')).toEqual([]);
 });
 it.each([['modern-sprint',7.2/4.55],['modern-aim',2.6/4.55]] as const)('changes the initial horizontal impulse only for %s', (movementMode,scale)=>{
  const source=setup(),modern=setup(),intent=held({forward:true,jump:true});
  source.input(intent,0,{yaw:0,pitch:.3});modern.input(intent,0,{yaw:0,pitch:.3,movementMode});
  source.room.tick(1000/30);modern.room.tick(1000/30);
  expect(modern.player().transform.velocity.z).toBeCloseTo(source.player().transform.velocity.z*scale,12);
  expect(modern.player().transform.velocity.y).toBe(source.player().transform.velocity.y);
 });
 it('rejects an unknown movement mode and restores default source controls when the optional mode is omitted',()=>{
  const s=setup();s.input(held(),0,{movementMode:'modern-fly' as never});
  expect(s.peer.messages.some(message=>message.type==='error'&&message.code==='invalid_transform')).toBe(true);
  s.input(held(),0,{movementMode:'modern-sprint'});expect(s.player().transform.movementMode).toBe('modern-sprint');
  s.input(held({forward:true}),0,{movementMode:undefined,yaw:0,pitch:0});
  expect(s.player().transform.movementMode).toBeUndefined();
  const source=setup();source.input(held({forward:true}),0,{yaw:0,pitch:0});
  s.room.tick(1000/30);source.room.tick(1000/30);expect(s.player().transform.velocity).toEqual(source.player().transform.velocity);
 });
 it.each(['modern-sprint','modern-aim'] as const)('preserves typing suppression and unsupported controls in %s authority',movementMode=>{
  const source=setup(),modern=setup(),intent=held({forward:true,right:true,jump:true});
  source.input(intent,0,{typing:true});modern.input(intent,0,{typing:true,movementMode});
  source.room.tick(1000/30);modern.room.tick(1000/30);
  expect(modern.player().transform.velocity).toEqual(source.player().transform.velocity);
  // A source jump without directional input gives both bodies the same
  // airborne state before the optional movement mode changes.
  source.input(held({jump:true}),1000/30,{typing:false});modern.input(held({jump:true}),1000/30,{typing:false,movementMode});
  source.room.tick(2*1000/30);modern.room.tick(2*1000/30);
  expect(modern.player().transform.grounded).toBe(false);
  source.input(intent,2*1000/30);modern.input(intent,2*1000/30,{movementMode});
  source.room.tick(3*1000/30);modern.room.tick(3*1000/30);
  expect(modern.player().transform.velocity).toEqual(source.player().transform.velocity);
  expect(modern.player().transform.position).toEqual(source.player().transform.position);
 });
 it('derives the jump and gravity from the source physics clock, and does not repeat Space while unsupported',()=>{
  const s=setup();s.input(held({jump:true}),0);s.room.tick(1000/30);
  const launch=s.player().transform;
  expect(launch.grounded).toBe(false);expect(launch.velocity.y).toBeCloseTo(ORIGINAL_PLAYER_DERIVATIVE_JUMP,0);
  s.room.tick(2*1000/30);const airborne=s.player().transform;
  expect(airborne.velocity.y).toBeCloseTo(launch.velocity.y-ORIGINAL_PLAYER_DERIVATIVE_GRAVITY/30,8);
  expect(airborne.position.y).toBeGreaterThan(s.spawn.y);expect(airborne.grounded).toBe(false);
 });
 it('accepts held intent without trusting reported position, velocity, or grounded state',()=>{
  const s=setup();s.input(held({forward:true}),0,{position:{...s.spawn,x:s.spawn.x+5},velocity:{x:19,y:0,z:0},grounded:false,yaw:0,pitch:0});
  expect(s.player().transform.position).toEqual(s.spawn);expect(s.player().transform.velocity).toEqual({x:0,y:0,z:0});
  s.room.tick(1000/30);expect(s.player().transform.velocity.z).toBeLessThan(-2);
  s.room.tick(2*1000/30);expect(s.player().transform.position.z).toBeLessThan(s.spawn.z);
  expect(s.player().transform.position.x).toBeCloseTo(s.spawn.x,10);
 });
 it('suppresses movement and jumping while typing but preserves physics and grounded drag',()=>{
  const s=setup();s.input(held({forward:true,jump:true}),0,{typing:true,yaw:0,pitch:0});s.room.tick(4*1000/30);
  const state=s.player().transform;expect(state.velocity.z).toBe(0);expect(state.position.z).toBe(s.spawn.z);expect(state.velocity.y).toBeLessThan(.1);expect(state.grounded).toBe(true);
  s.input(held({jump:true}),4*1000/30,{typing:false});s.room.tick(5*1000/30);expect(s.player().transform.velocity.y).toBeGreaterThan(7);
 });
 it('does not let later transform-only packets overwrite an established source body',()=>{
  const s=setup();s.input(held(),0);
  const transform={...s.player().transform,position:{...s.spawn,x:s.spawn.x+1}};delete transform.sourceInput;
  s.room.handleMessage(s.id,{type:'transform',sequence:2,clientTime:1,transform},1);
  expect(s.player().transform.position).toEqual(s.spawn);expect(s.peer.messages.some(message=>message.type==='error'&&message.code==='invalid_transform')).toBe(true);
 });
 it('couples player and grenade motion before projectile actor processing, without authored explosion boost',()=>{
  const s=setup();s.input(held({jump:true}),0);s.room.tick(1000/30);
  s.input(held(),1100);
  const state=s.player().transform,eye={...state.position,y:state.position.y+1.72};
  s.room.handleMessage(s.id,{type:'shoot',shot:{shotId:'joint',weapon:'launcher',origin:eye,direction:{x:0,y:-1,z:0}}},1100);
  s.room.tick(1100+1000/30);
  expect(s.room.getSnapshot().projectiles[0].remainingCallbacks).toBe(59);
  expect(s.peer.messages.some(message=>message.type==='event'&&message.event.type==='projectile_contact')).toBe(true);
  expect(s.peer.messages.some(message=>message.type==='event'&&message.event.type==='rg6_boost')).toBe(false);
  expect(s.player().transform.position.y+ORIGINAL_PLAYER_RADIUS).toBeGreaterThan(s.spawn.y);
 });
 it('uses the next shared callback for a projectile born between callbacks and publishes the actual phase',()=>{
  const s=setup();s.input(held(),0);s.room.tick(1100);
  const eye={...s.player().transform.position,y:s.player().transform.position.y+1.72};
  s.room.handleMessage(s.id,{type:'shoot',shot:{shotId:'phase',weapon:'launcher',origin:eye,direction:{x:0,y:1,z:0}}},1110);
  s.room.tick(1134);const snapshot=s.room.getSnapshot(1134);
  expect(snapshot.sourcePhysicsTime).toBeCloseTo(34*1000/30,8);expect(snapshot.sourcePhysicsTime).toBeLessThan(snapshot.serverTime);
  expect(snapshot.projectiles[0].remainingCallbacks).toBe(59);
 });
 it('rejects extra intent keys without opting into authority',()=>{
  const s=setup();s.input({...held(),extra:true} as NonNullable<PlayerTransform['sourceInput']>,0);
  expect(s.peer.messages.some(message=>message.type==='error'&&message.code==='invalid_transform')).toBe(true);
  const actor=(s.room as unknown as {players:Map<string,{sourceBody:unknown;sourceInput:unknown}>}).players.get(s.id)!;
  expect(actor.sourceBody).toBeNull();expect(actor.sourceInput).toBeNull();
 });
 it('clears held controls on suspension and does not replay the disconnected interval',()=>{
  const s=setup();s.input(held({forward:true}),0,{yaw:0,pitch:0});s.room.tick(1000/30);
  const welcome=s.peer.messages.find(message=>message.type==='welcome');if(!welcome||welcome.type!=='welcome')throw Error('welcome');
  s.room.suspend(s.id,40,s.peer);const retained=(s.room as unknown as {players:Map<string,{transform:PlayerTransform}>}).players.get(s.id)!;
  const position={...retained.transform.position};
  const peer=new Peer();expect(s.room.join(peer,'PLAYER',5040,welcome.resumeToken).ok).toBe(true);
  expect(s.player().transform.position).toEqual(position);expect(s.player().transform.sourceInput).toEqual(held());
  s.room.tick(5040);expect(s.player().transform.position).toEqual(position);
 });

 it('samples blast damage at each joint callback during catch-up instead of reusing the final eye',()=>{
  const s=setup();s.input(held(),0);
  const actor=(s.room as unknown as {players:Map<string,{sourceBody:{position:Vec3;velocity:Vec3;supported:boolean};transform:PlayerTransform}>}).players.get(s.id)!;
  actor.sourceBody.position.y+=10;actor.sourceBody.supported=false;actor.sourceBody.velocity={x:20,y:0,z:0};
  actor.transform.position.y+=10;actor.transform.grounded=false;
  const eye={...actor.transform.position,y:actor.transform.position.y+1.72};
  const source=createOriginalProjectile('launcher',eye,{x:0,y:1,z:0},s.id);
  const review=s.room as unknown as {installSourceFixtureActor(active:unknown,viewers:string[]):void;detonate(active:unknown,now:number):void};
  const active={source,updatedAt:1100,snapshot:{projectileId:'per-frame',shotId:'per-frame',attackerId:s.id,weapon:'launcher',position:eye,velocity:{x:0,y:0,z:0},expiresAt:1100}};
  review.installSourceFixtureActor(active,[s.id]);review.detonate(active,1100);
  // Move the physics phase to the blast epoch; this fixture tests damage
  // sampling, independently of callbacks before the synthetic blast.
  Object.assign(s.room as unknown as {sourceWorldUpdatedAt:number;sourceHealthUpdatedAt:number},{sourceWorldUpdatedAt:1100,sourceHealthUpdatedAt:1100});
  (actor as unknown as {sourceWorld:{updatedAt:number}}).sourceWorld.updatedAt=1100;
  s.room.tick(1100+16*1000/30);
  expect(s.player().health).toBe(75);
  expect(s.room.getSnapshot().blasts).toEqual([]);
 });

 it('keeps an input-free remote player from changing local movement in a mixed room',()=>{
  const s=setup(),single=setup(),peer=new Peer(),joined=s.room.join(peer,'COMPAT',0);if(!joined.ok)throw Error('join');
  const actor=(s.room as unknown as {players:Map<string,{transform:PlayerTransform;sourceBody:unknown}>}).players.get(joined.player.id)!;
  actor.transform.position={...s.spawn,x:s.spawn.x+1.3};const initialX=actor.transform.position.x;
  s.input(held({right:true}),0,{yaw:0,pitch:0});s.room.tick(20*1000/30);
  single.input(held({right:true}),0,{yaw:0,pitch:0});single.room.tick(20*1000/30);
  expect(actor.transform.position.x).toBe(initialX);
  expect(actor.sourceBody).toBeNull();
  expect(Object.values(actor.transform.position).every(Number.isFinite)).toBe(true);
  expect(s.player().transform).toEqual(single.player().transform);
 });

 it.each([92,120,-120])('accepts source post-recoil/mouse pitch %s degrees and applies the published pitched impulse',degrees=>{
  const s=setup(),pitch=degrees*Math.PI/180;
  s.input(held({forward:true}),0,{pitch,yaw:0});
  expect(s.peer.messages.some(message=>message.type==='error')).toBe(false);
  expect(s.player().transform.pitch).toBe(pitch);
  s.room.tick(1000/30);
  // Beyond vertical the source forward cosine reverses horizontal direction;
  // clamping the received aim would incorrectly keep this component negative.
  expect(s.player().transform.velocity.z).toBeGreaterThan(0);
  expect(Math.sign(s.player().transform.velocity.y)).toBe(Math.sign(degrees));
 });
 it('preserves finite accumulated source yaw turns and rejects nonfinite source aim',()=>{
  const s=setup(),yaw=2000*Math.PI;
  s.input(held(),0,{yaw,pitch:92*Math.PI/180});expect(s.player().transform.yaw).toBe(yaw);
  s.input(held(),1,{pitch:Number.POSITIVE_INFINITY});
  expect(s.peer.messages.some(message=>message.type==='error'&&message.code==='invalid_transform')).toBe(true);
  expect(s.player().transform.pitch).toBe(92*Math.PI/180);
 });
 it.each(['winter','compat'] as const)('keeps the authored pitch bound for %s transforms',kind=>{
  const peer=new Peer(),room=new MatchRoom('pitch-bound',{...(kind==='winter'?{collisionProfile:'winter' as const}:{map:'woodlands' as const,originalScene:false}),now:()=>0});
  const joined=room.join(peer,'PLAYER',0);if(!joined.ok)throw Error('join');
  room.handleMessage(joined.player.id,{type:'transform',sequence:1,clientTime:0,transform:{...joined.player.transform,pitch:92*Math.PI/180,...(kind==='winter'?{sourceInput:held()}: {})}},0);
  expect(peer.messages.some(message=>message.type==='error'&&message.code==='invalid_transform')).toBe(true);
  expect(room.getSnapshot().players[0].transform.pitch).toBe(joined.player.transform.pitch);
 });

});
