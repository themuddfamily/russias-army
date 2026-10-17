import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {legacyGroundHeightAt} from '../shared/legacyMaps';
import type {MessagePeer,ServerMessage} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
function setup(map:'barrack'|'woodlands'='barrack',sessionMode?:'round',fragLimit?:number){
 let n=0;
 const room=new MatchRoom('session',{originalScene:false,map,sessionMode,fragLimit,spawnPoints:[{x:-45,y:legacyGroundHeightAt(map,-45,-35),z:-35},{x:-45,y:legacyGroundHeightAt(map,-45,-25),z:-25}],idFactory:()=>`p${++n}`,now:()=>0});
 const join=(name:string,time=0)=>{const peer=new Peer(),out=room.join(peer,name,time);if(!out.ok)throw Error(out.message);return {id:out.player.id,peer};};
 const read=(id:string)=>room.getSnapshot(0).players.find(p=>p.id===id)!;
 const shooter=join('Shooter');
 room.handleMessage(shooter.id,{type:'transform',sequence:1,clientTime:1000,transform:{...read(shooter.id).transform,weapon:'sniper'}},1000);
 const kill=(target:string,time=1200)=>{
  const a=read(shooter.id),b=read(target),origin={...a.transform.position,y:a.transform.position.y+1.55};
  const d={x:b.transform.position.x-origin.x,y:b.transform.position.y+1.64-origin.y,z:b.transform.position.z-origin.z},m=Math.hypot(d.x,d.y,d.z);
  const shotId='kill'+time;
  room.handleMessage(shooter.id,{type:'shoot',shot:{shotId,weapon:'sniper',origin,direction:{x:d.x/m,y:d.y/m,z:d.z/m}}},time);
  room.handleMessage(shooter.id,{type:'hit',hit:{shotId,targetId:target}},time+1);
 };
 return {room,join,read,shooter,kill};
}
describe('legacy single-life sessions',()=>{
 it.each(['barrack','woodlands'] as const)('%s death ends that session without automatic respawn',map=>{
  const s=setup(map),victim=s.join('Victim');s.kill(victim.id);
  expect(s.read(victim.id)).toMatchObject({alive:false,health:0,deaths:1,respawnAt:null});
  expect(s.room.getSnapshot(1202).drops).toHaveLength(1);
  s.room.tick(50_000);
  expect(s.read(victim.id)).toMatchObject({alive:false,health:0,respawnAt:null});
  expect(s.room.getSnapshot().state).toBe('playing');
  expect(victim.peer.messages.filter(m=>m.type==='event'&&m.event.type==='respawn')).toHaveLength(0);
  const before=s.read(victim.id).transform;
  s.room.handleMessage(victim.id,{type:'transform',sequence:2,clientTime:51000,transform:{...before,position:{...before.position,y:1}}},51000);
  s.room.handleMessage(victim.id,{type:'shoot',shot:{shotId:'dead',weapon:before.weapon,origin:{...before.position,y:1.55},direction:{x:0,y:-1,z:0},rg6Jump:{forward:true,jump:true}}},51000);
  expect(s.read(victim.id).transform).toEqual(before);
  expect(victim.peer.messages.filter(m=>m.type==='event'&&m.event.type==='rg6_boost')).toHaveLength(0);
 });
 it('reconnect keeps a dead session dead; explicit leave and fresh re-entry starts a new session',()=>{
  const s=setup(),victim=s.join('Victim');s.kill(victim.id);
  const welcome=victim.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
  s.room.suspend(victim.id,1300,victim.peer);
  const replacement=new Peer();const resumed=s.room.join(replacement,'Victim',1400,welcome.resumeToken);
  expect(resumed.ok).toBe(true);
  expect(s.read(victim.id)).toMatchObject({alive:false,health:0,deaths:1});
  s.room.tick(5000);expect(s.read(victim.id).alive).toBe(false);
  s.room.leave(victim.id,5100,replacement);
  const fresh=s.join('Victim',5200);
  expect(fresh.id).not.toBe(victim.id);
  expect(s.read(fresh.id)).toMatchObject({alive:true,health:100,deaths:0,frags:0});
 });
 it('keeps the room and surviving players active beyond the authored twelve-frag limit',()=>{
  const s=setup();
  for(let i=0;i<13;i++){
   const time=5000+i*4000;
   const target=s.join('Target'+i,time-1200);s.kill(target.id,time);
   expect(s.read(target.id).alive).toBe(false);
   s.room.leave(target.id,time+2,target.peer);
  }
  expect(s.read(s.shooter.id)).toMatchObject({alive:true,frags:13});
  expect(s.room.getSnapshot()).toMatchObject({state:'playing',winnerId:null});
  expect(s.shooter.peer.messages.filter(m=>m.type==='event'&&m.event.type==='winner')).toHaveLength(0);
  expect(s.join('Late arrival',60000).id).toBeTruthy();
 });
 it('retains automatic respawn for explicitly authored legacy round rooms',()=>{
  const s=setup('barrack','round'),victim=s.join('Victim');s.kill(victim.id);
  expect(s.read(victim.id).respawnAt).toBe(2501);
  s.room.tick(2501);expect(s.read(victim.id).alive).toBe(true);
 });
 it('retains a configured room-wide winner only when legacy round mode is explicitly selected',()=>{
  const s=setup('barrack','round',1),victim=s.join('Victim');s.kill(victim.id);
  expect(s.room.getSnapshot()).toMatchObject({state:'finished',winnerId:s.shooter.id});
  expect(s.shooter.peer.messages.filter(m=>m.type==='event'&&m.event.type==='winner')).toHaveLength(1);
 });

});
