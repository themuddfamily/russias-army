import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {parseClientMessage,type MessagePeer,type ServerMessage,type Vec3} from './protocol';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {sourcePointToWorld,originalNodeWorldMatrices} from '../shared/originalSceneGeometry';
import type {OriginalDoorWorld} from '../shared/originalDoorWorld';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
interface Review {players:Map<string,{sourceWorld:{doors:OriginalDoorWorld};alive:boolean}>;raycastFor(player:unknown,o:Vec3,d:Vec3,max:number):{id:string;distance:number}|null}
function route(){
 const r=getOriginalMapRuntime('barrack'),node=r.data.nodes.find(n=>n.name==='door open 28')!,matrix=originalNodeWorldMatrices(r.data).get(node.name.toLowerCase())!;
 const mesh=r.data.meshes.find(m=>m.resource===node.resource)!,bottom=mesh.positions[1],axis={x:matrix[0]*bottom[0]+matrix[4]*bottom[1],y:matrix[1]*bottom[0]+matrix[5]*bottom[1]},length=Math.hypot(axis.x,axis.y);
 const center=[matrix[12]+axis.x*.3,matrix[13]+axis.y*.3,matrix[14]],normal={x:-axis.y/length,y:axis.x/length};
 const start=sourcePointToWorld([center[0]-normal.x*65,center[1]-normal.y*65,center[2]],r.scale),end=sourcePointToWorld([center[0]+normal.x*65,center[1]+normal.y*65,center[2]],r.scale);
 for(const p of [start,end])p.y=r.geometry.playerSupportHeightAt(p.x,p.z,p.y+1,r.profile.radius,r.profile.bodyHeight)!;
 return {r,start,end,direction:{x:normal.x,y:0,z:-normal.y}};
}
function setup(){
 const path=route(),room=new MatchRoom('doors',{map:'barrack',spawnPoints:[path.start],now:()=>0}),a=new Peer(),b=new Peer(),joined=room.join(a,'A',0),remote=room.join(b,'B',0);
 if(!joined.ok||!remote.ok)throw Error('join');return {...path,room,a,b,id:joined.player.id,initial:joined.player.transform,get world(){return (room as unknown as Review).players.get(joined.player.id)!.sourceWorld.doors;}};
}
function crossing(s:ReturnType<typeof setup>,now=1000){
 const path=Array.from({length:100},(_,i)=>{const t=(i+1)/100,p={x:s.start.x+(s.end.x-s.start.x)*t,y:s.start.y+(s.end.y-s.start.y)*t,z:s.start.z+(s.end.z-s.start.z)*t};return {position:p,velocity:{x:0,y:0,z:0},grounded:true};});
 s.room.handleMessage(s.id,{type:'transform',sequence:1,clientTime:now,transform:{...s.initial,...path.at(-1)!},path},now);
}
const opens=(peer:Peer)=>peer.messages.filter(m=>m.type==='event'&&m.event.type==='door_open');
describe('source Barrack door authority',()=>{
 it('blocks a closed door, then opens from validated proximity before crossing its unchanged visible panel',()=>{
  const s=setup(),radius=s.r.profile.radius,height=s.r.profile.bodyHeight;
  expect(s.world.movePlayer(s.start,s.end,radius,height).fraction).toBeLessThan(.9);
  s.room.handleMessage(s.id,{type:'transform',sequence:1,clientTime:500,transform:{...s.initial,position:s.end}},500);
  expect(s.room.getSnapshot().players[0].transform.position).toEqual(s.start);expect(opens(s.a)).toEqual([]);
  s.a.messages.length=0;crossing(s);
  expect(s.a.messages.filter(m=>m.type==='error')).toEqual([]);
  expect(s.room.getSnapshot().players[0].transform.position).toEqual(s.end);
  expect(s.room.getSnapshotFor(s.id,1000).doors!.find(d=>d.name==='door open 28')!.openedAt).toBeCloseTo(1000,8);
  expect(opens(s.a)).toHaveLength(1);expect(opens(s.b)).toHaveLength(1);
  const world=s.world;
  expect(world.movePlayer(s.start,s.end,radius,height).fraction).toBeCloseTo(1);
  const eye={...s.start,y:s.start.y+2};
  expect((s.room as unknown as Review).raycastFor((s.room as unknown as Review).players.get(s.id),eye,s.direction,4)?.id).toContain('door open 28');
  const initialHit=(s.room as unknown as Review).raycastFor((s.room as unknown as Review).players.get(s.id),eye,s.direction,4);
  s.room.tick(1500);
  expect((s.room as unknown as Review).raycastFor((s.room as unknown as Review).players.get(s.id),eye,s.direction,4)).not.toEqual(initialHit);
  s.room.tick(4000);expect(opens(s.a)).toHaveLength(1);
 });
 it('advances the visible combat panel for a shot received between physics ticks',()=>{
  const s=setup();crossing(s);const review=s.room as unknown as Review,eye={...s.start,y:s.start.y+2},before=review.raycastFor(review.players.get(s.id),eye,s.direction,4);
  expect(before?.id).toContain('door open 28');
  s.room.handleMessage(s.id,{type:'shoot',shot:{shotId:'between-ticks',weapon:'launcher',origin:{...s.end,y:s.end.y+1.55},direction:{x:-s.direction.x,y:0,z:-s.direction.z}}},1500);
  expect(s.a.messages.filter(m=>m.type==='error')).toEqual([]);
  expect(s.world.getStates().find(d=>d.name==='door open 28')!.elapsedSeconds).toBeCloseTo(.5);
  expect(review.raycastFor(review.players.get(s.id),eye,s.direction,4)).not.toEqual(before);
  expect(opens(s.a)).toHaveLength(1);
 });
 it('starts late join doors closed and retains living resume opened state within its own world',()=>{
  const s=setup();crossing(s);const late=new Peer();s.room.join(late,'LATE',1100);
  const snapshot=late.messages.find(m=>m.type==='snapshot');expect(snapshot).toMatchObject({snapshot:{doors:expect.arrayContaining([{name:'door open 28',openedAt:null}])}});
  const openedAt=s.room.getSnapshotFor(s.id,1100).doors!.find(d=>d.name==='door open 28')!.openedAt;expect(openedAt).toBeCloseTo(1000,8);
  const welcome=s.a.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
  s.room.suspend(s.id,1200,s.a);const resumed=new Peer();s.room.join(resumed,'A',1300,welcome.resumeToken);
  expect(resumed.messages.find(m=>m.type==='snapshot')).toMatchObject({snapshot:{doors:expect.arrayContaining([{name:'door open 28',openedAt}])}});
  const other=new MatchRoom('separate',{map:'barrack',now:()=>0});expect(other.getSnapshot(0).doors).toHaveLength(13);expect(other.getSnapshot(0).doors!.every(d=>d.openedAt===null)).toBe(true);
  expect(other.getSnapshot(0).doors!.some(d=>d.name.includes('\t'))).toBe(true);
 });
 it('does not commit proximity from a rejected path or accept arbitrary distant client door commands',()=>{
  const s=setup();
  const path=Array.from({length:100},(_,i)=>{const t=(i+1)/100;return {position:{x:s.start.x+(s.end.x-s.start.x)*t,y:s.start.y,z:s.start.z+(s.end.z-s.start.z)*t},velocity:{x:0,y:0,z:0},grounded:true};});
  path.push({position:{...s.end,y:s.end.y+20},velocity:{x:0,y:0,z:0},grounded:true});
  s.room.handleMessage(s.id,{type:'transform',sequence:1,clientTime:1000,transform:{...s.initial,...path.at(-1)!},path},1000);
  expect(opens(s.a)).toEqual([]);expect(s.room.getSnapshot().doors!.every(d=>d.openedAt===null)).toBe(true);
  expect(parseClientMessage(JSON.stringify({type:'door_open',name:'door open 28'}))).toBeNull();
  s.room.tick(1100);expect(s.room.getSnapshot().doors!.every(d=>d.openedAt===null)).toBe(true);
 });
 it('opens on authoritative ticks for a nearby living player while ignoring dead and suspended players',()=>{
  const {r,start,end}=route(),near={x:start.x+(end.x-start.x)*.2,y:start.y,z:start.z+(end.z-start.z)*.2};
  for(const status of ['alive','dead','suspended']){
   const room=new MatchRoom('tick-door-'+status,{map:'barrack',spawnPoints:[near],now:()=>0}),peer=new Peer(),joined=room.join(peer,'A',0);if(!joined.ok)throw Error('join');
   const review=room as unknown as Review;
   expect(review.players.get(joined.player.id)!.sourceWorld.doors.playerIntersects(near,r.profile.radius,r.profile.bodyHeight)).toBe(false);
   if(status==='dead')review.players.get(joined.player.id)!.alive=false;
   if(status==='suspended')room.suspend(joined.player.id,50,peer);
   room.tick(100);
   const openedAt=room.getSnapshot(100).doors!.find(d=>d.name==='door open 28')!.openedAt;if(status==='alive')expect(openedAt).toBeCloseTo(100,8);else expect(openedAt).toBeNull();
  }
 });
 it('keeps Woodland door state empty and archival Winter messages unchanged',()=>{
  expect(new MatchRoom('woodland',{map:'woodlands',now:()=>0}).getSnapshot(0).doors).toEqual([]);
  expect(new MatchRoom('winter',{collisionProfile:'winter',now:()=>0}).getSnapshot(0).doors).toBeUndefined();
 });
});
