/// <reference types="vite/client" />
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {Game} from '../src/game';
import {WeaponState} from '../src/weapons';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalSceneGeometry,originalNodeWorldMatrices,sourcePointToWorld,type OriginalSceneData} from '../shared/originalSceneGeometry';
import {ORIGINAL_SOURCE_SPAWNS} from '../shared/originalMapProfile';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE} from '../shared/originalExplosives';

function runtime(map:'barrack'|'woodlands') {
 return registerOriginalMapRuntime(map,JSON.parse(readFileSync(`public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,'utf8')) as OriginalSceneData);
}
function ramp(r:OriginalMapRuntime) {
 // The two preserved plinth faces form the broad inclined quad, rather than an authored ramp.
 const mesh=r.data.meshes.find(m=>m.resource==='plinths'&&m.part===0)!,matrix=originalNodeWorldMatrices(r.data).get('plinths')!;
 const points=[...new Set([...mesh.faces[12],...mesh.faces[34]])].map(i=>{
  const p=mesh.positions[i];return [matrix[0]*p[0]+matrix[4]*p[1]+matrix[8]*p[2]+matrix[12],matrix[1]*p[0]+matrix[5]*p[1]+matrix[9]*p[2]+matrix[13],matrix[2]*p[0]+matrix[6]*p[1]+matrix[10]*p[2]+matrix[14]];
 });
 const edge=(z:number)=>{const ps=points.filter(p=>p[2]===z);return ps[0].map((_,i)=>ps.reduce((sum,p)=>sum+p[i],0)/ps.length);};
 const low=edge(Math.min(...points.map(p=>p[2]))),high=edge(Math.max(...points.map(p=>p[2])));
 const start=sourcePointToWorld([low[0]-75,low[1],low[2]],r.scale),finish=sourcePointToWorld([high[0]+75,high[1],high[2]],r.scale);
 start.y=r.geometry.playerSupportHeightAt(start.x,start.z,start.y+1,r.profile.radius,r.profile.bodyHeight)!;
 finish.y=r.geometry.playerSupportHeightAt(finish.x,finish.z,finish.y+1,r.profile.radius,r.profile.bodyHeight)!;
 return {start,finish};
}
interface Client {camera:THREE.PerspectiveCamera;velocity:THREE.Vector3;keys:Set<string>;grounded:boolean;yaw:number;updateMovement(delta:number):void}
function client(r:OriginalMapRuntime,feet:{x:number;y:number;z:number},yaw:number):Client {
 const game=Object.create(Game.prototype) as Client,camera=new THREE.PerspectiveCamera();camera.position.set(feet.x,feet.y+r.profile.eyeHeight,feet.z);
 Object.assign(game,{camera,velocity:new THREE.Vector3(),keys:new Set(['KeyW']),grounded:true,yaw,pitch:0,controlsPreset:'legacy',arrowMovement:true,rightMouseAiming:false,chatOpen:false,archivalWinter:false,
  projectiles:[],mode:'solo',playerAlive:true,aiming:false,recoil:0,bob:0,stepDistance:0,weaponSwayX:0,weaponSwayY:0,weaponState:new WeaponState(r.map),weaponMetadata:new Map(),audio:{play(){}},
  arena:{runtime:r,colliders:[],supportHeightAt:(x:number,z:number,max:number)=>r.geometry.playerSupportHeightAt(x,z,max,r.profile.radius,r.profile.bodyHeight)}});
 return game;
}
function feet(g:Client){return {x:g.camera.position.x,y:g.camera.position.y-1.72,z:g.camera.position.z};}
function contactSupport(r:OriginalMapRuntime,g:Client){
 // Query the contact envelope for an expected height, keeping actual gameplay
 // and authority player bodies at their recovered physical radius.
 const here=feet(g),distance=ORIGINAL_COLLISION_CONTACT_DISTANCE;
 const support=r.geometry.playerSupportHeightAt(here.x,here.z,here.y+.1-distance,r.profile.radius+distance,r.profile.bodyHeight+2*distance);
 expect(support).toBeDefined();
 return support!+distance;
}

import {MatchRoom} from './match-room';
import type {MessagePeer,ServerMessage,PlayerTransform} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
function transform(g:Client):PlayerTransform {return {position:feet(g),velocity:{x:g.velocity.x,y:g.velocity.y,z:g.velocity.z},yaw:g.yaw,pitch:0,grounded:g.grounded,weapon:'launcher'};}
function session(r:OriginalMapRuntime,start:{x:number;y:number;z:number},yaw:number,authority=false) {
 const room=new MatchRoom('source-route',{map:r.map,spawnPoints:[start],now:()=>0}),peer=new Peer(),joined=room.join(peer,'WALKER',0);
 if(!joined.ok)throw Error(joined.message);
 const g=client(r,start,yaw);let sequence=0,now=0,travel=0;
 return {room,peer,g,get elapsed(){return now;},get travel(){return travel;},advance:(frames:number)=>{
  if(authority){
   const sourceInput={forward:g.keys.has('KeyW'),backward:g.keys.has('KeyS'),left:g.keys.has('KeyA'),right:g.keys.has('KeyD'),jump:g.keys.has('Space')};
   // Establish held intent before the interval; client and authority consume
   // the same recovered joint callbacks rather than validate a linear chord
   // through resolved triangle contacts after the interval has elapsed.
   room.handleMessage(joined.player.id,{type:'transform',sequence:++sequence,clientTime:now,transform:{...transform(g),sourceInput}},now);
   for(let i=0;i<frames;i++){
    const before=feet(g);g.updateMovement(1/120);now+=1000/120;room.tick(now);
    const after=feet(g);travel+=Math.hypot(after.x-before.x,after.y-before.y,after.z-before.z);
   }
   expect(peer.messages.filter(m=>m.type==='error')).toEqual([]);
   const snapshot=room.getSnapshot(now),actual=snapshot.players[0].transform,expected=transform(g);
   expect(snapshot.sourcePhysicsTime).toBeCloseTo(Math.floor((now+1e-7)/(1000/30))*1000/30,7);
   for(const axis of ['x','y','z'] as const){expect(actual.position[axis]).toBeCloseTo(expected.position[axis],7);expect(actual.velocity[axis]).toBeCloseTo(expected.velocity[axis],7);}
   expect(actual.grounded).toBe(expected.grounded);
  }else{
  const path=[];for(let i=0;i<frames;i++){g.updateMovement(1/120);now+=1000/120;const t=transform(g);path.push({position:t.position,velocity:t.velocity,grounded:t.grounded});}
  room.handleMessage(joined.player.id,{type:'transform',sequence:++sequence,clientTime:now,transform:transform(g),path},now);
  const errors=peer.messages.filter(m=>m.type==='error');expect(errors,JSON.stringify({now,transform:transform(g),support:r.geometry.playerSupportHeightAt(feet(g).x,feet(g).z,feet(g).y+.08,r.profile.radius,r.profile.bodyHeight),intersects:r.geometry.playerIntersects(feet(g),r.profile.radius,r.profile.bodyHeight),sweep:r.geometry.movePlayer(room.getSnapshot().players[0].transform.position,feet(g),r.profile.radius,r.profile.bodyHeight),errors})).toEqual([]);
  expect(room.getSnapshot().players[0].transform.position).toEqual(feet(g));
  }
 }};
}
describe('authority accepts actual Game traversal of recovered terrain',()=>{
 it('accepts climb and descent over the broad Barrack ramp including rounded edges',()=>{
  const r=runtime('barrack'),route=ramp(r),s=session(r,route.start,-Math.PI/2,true);
  expect(route.finish.y).toBeGreaterThan(route.start.y+1);
  for(let i=0;i<120&&feet(s.g).x<route.finish.x;i++)s.advance(12);
  expect(feet(s.g).x).toBeGreaterThanOrEqual(route.finish.x);expect(feet(s.g).y).toBeCloseTo(contactSupport(r,s.g),2);
  const summit=feet(s.g),climbTravel=s.travel;
  s.g.keys=new Set(['KeyS']);
  for(let i=0;i<120&&feet(s.g).x>route.start.x;i++)s.advance(12);
  expect(feet(s.g).x).toBeLessThanOrEqual(route.start.x);expect(feet(s.g).y).toBeCloseTo(contactSupport(r,s.g),2);
  expect(summit.y-feet(s.g).y).toBeGreaterThan(1);
  expect(climbTravel).toBeGreaterThan(route.finish.x-route.start.x);
  expect(s.travel-climbTravel).toBeGreaterThan(route.finish.x-route.start.x);
 });
 it('matches Woodland spawn-zero W movement over source joint callbacks',()=>{
  const r=runtime('woodlands'),s=session(r,r.spawnPoints[0],ORIGINAL_SOURCE_SPAWNS.woodlands[0].rotation[2]*Math.PI/180,true);
  for(let i=0;i<50;i++)s.advance(36);
  expect(s.elapsed).toBeCloseTo(15_000,7);
  expect(s.room.getSnapshot(s.elapsed).sourcePhysicsTime).toBeCloseTo(450*1000/30,7);
  expect(s.travel).toBeGreaterThan(10);
  expect(Math.hypot(feet(s.g).x-r.spawnPoints[0].x,feet(s.g).z-r.spawnPoints[0].z)).toBeGreaterThan(2);
 });
});

describe('grounded source path validation keeps solid boundaries',()=>{
 it('rejects a claimed grounded sphere more than eight centimetres above support',()=>{
  const r=runtime('woodlands'),s=session(r,r.spawnPoints[0],0),player=s.room.getSnapshot().players[0];
  s.room.handleMessage(player.id,{type:'transform',sequence:1,clientTime:100,transform:{...player.transform,position:{...player.transform.position,y:player.transform.position.y+.081}}},100);
  expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='collision_rejected')).toBe(true);
 });
 it('rejects crossing a thin wall and climbing a nonwalkable face between supported endpoints',()=>{
  const r=runtime('barrack'),s=session(r,r.spawnPoints[0],0);
  const mesh=(resource:string,positions:number[][])=>({resource,part:0,positions,faces:[[0,2,1],[0,3,2]],normals:[],tex_coords:[]});
  const meshes=[mesh('floor',[[-10,0,-10],[10,0,-10],[10,0,10],[-10,0,10]]),mesh('wall',[[1,0,-2],[1,3,-2],[1,3,2],[1,0,2]]),mesh('bank',[[4,0,-2],[6,4,-2],[6,4,2],[4,0,2]]),mesh('roof',[[6,4,-2],[9,4,-2],[9,4,2],[6,4,2]])];
  // World fixture coordinates converted to original Z-up geometry.
  for(const m of meshes)m.positions=m.positions.map(([x,y,z])=>[x,-z,y]);
  const nodes=meshes.map(m=>({name:m.resource,parent:'',resource:m.resource,visibility:1,shader:'',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}));
  const geometry=createOriginalSceneGeometry({meshes,nodes},{scale:1});
  const review=s.room as unknown as {original:OriginalMapRuntime;doorWorld:undefined;players:Map<string,{transform:PlayerTransform}>;validArenaMovement(p:unknown,t:PlayerTransform,now:number):unknown};
  review.original={...r,geometry,profile:{...r.profile,bounds:geometry.bounds}};review.doorWorld=undefined;
  const player=review.players.get(s.room.getSnapshot().players[0].id)!;
  (player as unknown as {sourceWorld:{doors?:unknown}}).sourceWorld.doors=undefined;
  for(const [from,to] of [[{x:0,y:0,z:0},{x:2,y:0,z:0}],[{x:3,y:0,z:0},{x:7,y:4,z:0}]]){
   player.transform={...player.transform,position:from,grounded:true};
   expect(geometry.playerIntersects(from,r.profile.radius,r.profile.bodyHeight)).toBe(false);
   expect(review.validArenaMovement(player,player.transform,100)).toBe(null);
   expect(geometry.playerIntersects(to,r.profile.radius,r.profile.bodyHeight)).toBe(false);
   expect(review.validArenaMovement(player,{...player.transform,position:to},100)).toBe(false);
   const last={position:to,velocity:{x:0,y:0,z:0},grounded:true};
   s.peer.messages.length=0;
   s.room.handleMessage(s.room.getSnapshot().players[0].id,{type:'transform',sequence:1,clientTime:100,transform:{...player.transform,...last},path:[last]},100);
   expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='collision_rejected')).toBe(true);
  }
 });
});

describe('movement sample paths are bounded authoritative claims',()=>{
 it.each(['overlong','nonfinite','missing grounded','wrong endpoint','overspeed'])('rejects %s paths without advancing the player',kind=>{
  const r=runtime('barrack'),s=session(r,r.spawnPoints[0],0),player=s.room.getSnapshot().players[0],sample={position:{...player.transform.position},velocity:{x:0,y:0,z:0},grounded:true};
  let path:unknown[]=[sample];
  if(kind==='overlong')path=Array.from({length:129},()=>sample);
  if(kind==='nonfinite')path=[{...sample,position:{...sample.position,x:Infinity}}];
  if(kind==='missing grounded')path=[{position:sample.position,velocity:sample.velocity}];
  if(kind==='wrong endpoint')path=[{...sample,position:{...sample.position,x:sample.position.x+.01}}];
  if(kind==='overspeed')path=[{...sample,velocity:{x:100,y:0,z:0}}];
  s.room.handleMessage(player.id,{type:'transform',sequence:1,clientTime:100,transform:player.transform,path:path as never},100);
  expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='invalid_transform')).toBe(true);
  expect(s.room.getSnapshot().players[0].transform).toEqual(player.transform);
 });
 it('charges intermediate travel even when the endpoint returns to the start',()=>{
  const r=runtime('barrack'),route=ramp(r),s=session(r,route.start,0),player=s.room.getSnapshot().players[0];
  const path=[];
  for(let i=0;i<100;i++){const x=route.start.x+(i%2===0?1:0);path.push({position:{...route.start,x},velocity:{x:0,y:0,z:0},grounded:true});}
  s.room.handleMessage(player.id,{type:'transform',sequence:1,clientTime:100,transform:player.transform,path},100);
  expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='movement_rejected')).toBe(true);
  expect(s.room.getSnapshot().players[0].transform).toEqual(player.transform);
 });
});

describe('movement paths retain jump authorization',()=>{
 it('accepts a path from a rigid-body projectile contact and rejects an unsolicited ascent',()=>{
  const r=runtime('barrack'),start=ramp(r).start,room=new MatchRoom('path-contact',{map:'barrack',spawnPoints:[start],now:()=>0}),peer=new Peer(),joined=room.join(peer,'JUMPER',0);
  if(!joined.ok)throw Error(joined.message);
  // A rebounding grenade reaches the underside of the source player sphere.
  // This fixture specifies the body state, then runs the real authority step.
  room.handleMessage(joined.player.id,{type:'shoot',shot:{shotId:'jump',weapon:'launcher',origin:{...start,y:start.y+r.profile.eyeHeight},direction:{x:0,y:1,z:0}}},1100);
  type Review={players:Map<string,{sourceWorld:{projectiles:Map<string,{source:{position:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number}}}>}}>};
  const active=[...(room as unknown as Review).players.get(joined.player.id)!.sourceWorld.projectiles.values()][0];active.source.position={...start,y:start.y+.08};active.source.velocity={x:0,y:16,z:0};
  room.tick(1100+1000/30);
  const event=peer.messages.find(m=>m.type==='event'&&m.event.type==='projectile_contact');expect(event).toBeDefined();expect(peer.messages.some(m=>m.type==='event'&&m.event.type==='rg6_boost')).toBe(false);
  const initial=room.getSnapshot().players[0].transform,vy=initial.velocity.y;
  expect(vy).toBeGreaterThan(5.6);expect(room.getSnapshot().players[0].health).toBe(100);
  const path=Array.from({length:36},(_,i)=>{const t=(i+1)/120;return {position:{...start,y:start.y+vy*t-6.25*t*t},velocity:{x:0,y:vy-12.5*t,z:0},grounded:false};});
  room.handleMessage(joined.player.id,{type:'transform',sequence:1,clientTime:1433+1/3,transform:{...initial,...path.at(-1)!},path},1433+1/3);
  expect(peer.messages.filter(m=>m.type==='error')).toEqual([]);expect(room.getSnapshot().players[0].transform.position.y).toBeCloseTo(path.at(-1)!.position.y);
  const ordinary=session(r,start,0),player=ordinary.room.getSnapshot().players[0];
  ordinary.room.handleMessage(player.id,{type:'transform',sequence:1,clientTime:300,transform:{...player.transform,...path.at(-1)!},path},300);
  expect(ordinary.peer.messages.some(m=>m.type==='error'&&m.code==='collision_rejected')).toBe(true);
  expect(ordinary.room.getSnapshot().players[0].transform.position).toEqual(start);
 });
 it('rejects an unsupported intermediate grounded peak even with an honest endpoint',()=>{
  const r=runtime('barrack'),s=session(r,ramp(r).start,0),player=s.room.getSnapshot().players[0],last={position:player.transform.position,velocity:{x:0,y:0,z:0},grounded:true};
  s.room.handleMessage(player.id,{type:'transform',sequence:1,clientTime:100,transform:player.transform,path:[{...last,position:{...last.position,y:last.position.y+1}},last]},100);
  expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='collision_rejected')).toBe(true);
 });
});

describe('source catch-up authority and compatibility movement budgets',()=>{
 it('matches one second of actual Game source movement from held input',()=>{
  const r=runtime('barrack'),s=session(r,ramp(r).start,-Math.PI/2,true),start=feet(s.g);
  s.advance(120);
  expect(Math.hypot(feet(s.g).x-start.x,feet(s.g).z-start.z)).toBeGreaterThan(3);
 });
 it('retains the initial three-metre allowance, caps idle credit at fourteen and refills by elapsed time',()=>{
  const r=runtime('barrack'),start=ramp(r).start,room=new MatchRoom('budget',{map:'barrack',spawnPoints:[start],now:()=>0}),peer=new Peer(),joined=room.join(peer,'WALKER',0);
  if(!joined.ok)throw Error(joined.message);const initial=joined.player.transform;
  // Isolate movement-credit accounting from unrelated moving barrels during
  // 3,000 real callbacks. Source terrain, body and elapsed-time rules remain.
  const actor=(room as unknown as {players:Map<string,{sourceWorld:{barrels:{applySnapshots(states:[]):void}}}>}).players.get(joined.player.id)!;
  actor.sourceWorld.barrels.applySnapshots([]);
  let sequence=0;
  const move=(travel:number,now:number)=>{
   peer.messages.length=0;
   const path=Array.from({length:travel},(_,i)=>({position:{...start,x:start.x+(i%2===0?1:0)},velocity:{x:0,y:0,z:0},grounded:true}));
   room.handleMessage(joined.player.id,{type:'transform',sequence:++sequence,clientTime:now,transform:{...initial,...path.at(-1)!},path},now);
   return peer.messages.filter(m=>m.type==='error');
  };
  expect(move(4,0)).toEqual([expect.objectContaining({code:'movement_rejected'})]);
  expect(move(16,100_000)).toEqual([expect.objectContaining({code:'movement_rejected'})]);
  expect(move(14,100_000)).toEqual([]);
  expect(move(2,100_100)).toEqual([expect.objectContaining({code:'movement_rejected'})]);
  expect(move(2,100_200)).toEqual([]);
 // This fixture advances 100 seconds (3,000 source terrain/body callbacks).
 },15_000);
 it('retains the three-metre cap for archival Winter after a long idle interval',()=>{
  const room=new MatchRoom('winter-budget',{collisionProfile:'winter',spawnPoints:[{x:0,y:0,z:0}],now:()=>0}),peer=new Peer(),joined=room.join(peer,'WALKER',0);
  if(!joined.ok)throw Error(joined.message);
  room.handleMessage(joined.player.id,{type:'transform',sequence:1,clientTime:100_000,transform:{...joined.player.transform,position:{x:4,y:0,z:0}}},100_000);
  expect(peer.messages.some(m=>m.type==='error'&&m.code==='movement_rejected')).toBe(true);
  expect(room.getSnapshot().players[0].transform.position.x).toBe(0);
 });
});
