import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import type {MessagePeer,ServerMessage} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
const sourceWeapons={
 pistol:{ammo:8,reserve:54},shotgun:{ammo:6,reserve:24},rifle:{ammo:28,reserve:140},
 launcher:{ammo:6,reserve:18},rpg:{ammo:1,reserve:12},sniper:{ammo:30,reserve:12},
};
describe('publisher-script spawn loadouts',()=>{
 it.each(['barrack','woodlands'] as const)('%s welcome and loadout start with RG6 and original chamber/reserve counts',map=>{
  const room=new MatchRoom('spawn',{map,now:()=>0}),peer=new Peer(),joined=room.join(peer,'Comrade',0);
  expect(joined).toMatchObject({ok:true,player:{transform:{weapon:'launcher'}}});
  expect(peer.messages[0]).toMatchObject({type:'welcome',map,player:{transform:{weapon:'launcher'}}});
  expect(peer.messages.find(m=>m.type==='loadout')).toMatchObject({equipped:'launcher',weapons:sourceWeapons});
 });
 it('reconnect preserves consumed chambers while a fresh session restores the publisher spawn loadout',()=>{
  const room=new MatchRoom('reentry',{map:'woodlands',now:()=>0}),peer=new Peer(),joined=room.join(peer,'Comrade',0);
  if(!joined.ok)throw Error(joined.message);const id=joined.player.id,p=joined.player.transform.position;
  room.handleMessage(id,{type:'shoot',shot:{shotId:'first',weapon:'launcher',origin:{...p,y:p.y+1.55},direction:{x:0,y:0,z:-1}}},1100);
  const welcome=peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
  room.suspend(id,1200,peer);const resumedPeer=new Peer();room.join(resumedPeer,'Comrade',1300,welcome.resumeToken);
  expect(resumedPeer.messages.find(m=>m.type==='loadout')).toMatchObject({equipped:'launcher',weapons:{launcher:{ammo:5,reserve:18},sniper:{ammo:30,reserve:12}}});
  room.leave(id,1400,resumedPeer);const freshPeer=new Peer();room.join(freshPeer,'Comrade',1500);
  expect(freshPeer.messages.find(m=>m.type==='loadout')).toMatchObject({equipped:'launcher',weapons:sourceWeapons});
 });
 it('retains the archival Winter rifle spawn and authored ammunition',()=>{
  const room=new MatchRoom('winter',{collisionProfile:'winter',now:()=>0}),peer=new Peer();room.join(peer,'Comrade',0);
  expect(peer.messages[0]).toMatchObject({type:'welcome',player:{transform:{weapon:'rifle'}}});
  expect(peer.messages.find(m=>m.type==='loadout')).toMatchObject({equipped:'rifle',weapons:{rifle:{ammo:30,reserve:150},sniper:{ammo:10,reserve:40},rpg:{ammo:1,reserve:5}}});
 });
});
