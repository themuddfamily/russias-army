import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {legacyGroundHeightAt} from '../shared/legacyMaps';
import type {MessagePeer,ServerMessage,WeaponId,LoadoutMessage} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
function setup(map:'barrack'|'woodlands'='barrack',winter=false){
 const room=new MatchRoom('reload',{originalScene:false,map,now:()=>0,spawnPoints:[{x:-45,y:winter?0:legacyGroundHeightAt(map,-45,-35),z:-35}],...(winter?{collisionProfile:'winter' as const}:{})});
 const peer=new Peer(),joined=room.join(peer,'Comrade',0);if(!joined.ok)throw Error(joined.message);const id=joined.player.id;
 const read=()=>room.getSnapshot(0).players.find(p=>p.id===id)!;
 let sequence=0,shot=0;
 const equip=(weapon:WeaponId,time:number)=>room.handleMessage(id,{type:'transform',sequence:++sequence,clientTime:time,transform:{...read().transform,weapon}},time);
 const fire=(time:number)=>{const p=read().transform.position;room.handleMessage(id,{type:'shoot',shot:{shotId:'shot'+ ++shot,weapon:read().transform.weapon,origin:{...p,y:p.y+1.55},direction:{x:0,y:1,z:0}}},time);};
 const loadout=()=>peer.messages.filter((m):m is LoadoutMessage=>m.type==='loadout').at(-1)!;
 return {room,peer,id,read,equip,fire,loadout};
}
describe('legacy immediate reload transfer and input lockout',()=>{
 it.each(['barrack','woodlands'] as const)('%s transfers now, blocks shooting/switching, and does not transfer twice',map=>{
  const s=setup(map);s.equip('rifle',1000);s.fire(1200);
  expect(s.loadout().weapons.rifle).toEqual({ammo:27,reserve:140});
  s.room.handleMessage(s.id,{type:'reload',weapon:'rifle'},1300);
  expect(s.loadout()).toMatchObject({weapons:{rifle:{ammo:28,reserve:139}},reload:{weapon:'rifle'}});
  const deadline=s.loadout().reload!.completesAt;
  expect(deadline-1300).toBeCloseTo(map==='woodlands'?1000:22000/30);
  s.fire(1301);s.equip('pistol',1302);
  expect(s.peer.messages.filter(m=>m.type==='error')).toMatchObject([{code:'reload_in_progress'},{code:'reload_in_progress'}]);
  expect(s.read().transform.weapon).toBe('rifle');
  s.room.tick(deadline-1);expect(s.loadout().reload).not.toBeNull();
  s.room.tick(deadline);expect(s.loadout()).toMatchObject({weapons:{rifle:{ammo:28,reserve:139}},reload:null});
  s.fire(deadline+1);expect(s.loadout().weapons.rifle).toEqual({ammo:27,reserve:139});
 });
 it('preserves transferred counts and the same lockout deadline across reconnect',()=>{
  const s=setup();s.equip('rifle',1000);s.fire(1200);s.room.handleMessage(s.id,{type:'reload',weapon:'rifle'},1300);
  const deadline=s.loadout().reload!.completesAt;
  const welcome=s.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
  s.room.suspend(s.id,1301,s.peer);const replacement=new Peer();s.room.join(replacement,'Comrade',1302,welcome.resumeToken);
  expect(replacement.messages.find(m=>m.type==='loadout')).toMatchObject({weapons:{rifle:{ammo:28,reserve:139}},reload:{weapon:'rifle',completesAt:deadline}});
  s.room.tick(deadline);
  expect(replacement.messages.filter(m=>m.type==='loadout').at(-1)).toMatchObject({weapons:{rifle:{ammo:28,reserve:139}},reload:null});
 });
 it('rejects full magazines and above-target Dragunov spawn without moving ammunition',()=>{
  const s=setup();s.equip('sniper',1000);s.room.handleMessage(s.id,{type:'reload',weapon:'sniper'},1100);
  expect(s.peer.messages.filter(m=>m.type==='error').at(-1)).toMatchObject({type:'error',code:'magazine_full'});
  expect(s.loadout()).toMatchObject({weapons:{sniper:{ammo:30,reserve:12}},reload:null});
  s.equip('rifle',1200);s.room.handleMessage(s.id,{type:'reload',weapon:'rifle'},1300);
  expect(s.peer.messages.filter(m=>m.type==='error').at(-1)).toMatchObject({type:'error',code:'magazine_full'});
  expect(s.loadout().weapons.rifle).toEqual({ammo:28,reserve:140});
 });
 it('rejects an empty magazine when its reserve has been consumed by real reloads',()=>{
  const s=setup();s.equip('rpg',1000);let now=2000;
  for(let i=0;i<12;i++){
   s.fire(now);s.room.handleMessage(s.id,{type:'reload',weapon:'rpg'},now+1);
   const deadline=s.loadout().reload!.completesAt;s.room.tick(deadline);now=Math.max(deadline+1,now+1101);
  }
  expect(s.loadout().weapons.rpg).toEqual({ammo:1,reserve:0});s.fire(now);
  s.room.handleMessage(s.id,{type:'reload',weapon:'rpg'},now+1);
  expect(s.peer.messages.filter(m=>m.type==='error').at(-1)).toMatchObject({type:'error',code:'no_reserve'});
  expect(s.loadout()).toMatchObject({weapons:{rpg:{ammo:0,reserve:0}},reload:null});
 });
 it('retains deferred transfer in archived Winter',()=>{
  const s=setup('barrack',true);s.equip('rifle',1000);s.fire(1200);s.room.handleMessage(s.id,{type:'reload',weapon:'rifle'},1300);
  expect(s.loadout()).toMatchObject({weapons:{rifle:{ammo:29,reserve:150}},reload:{weapon:'rifle'}});
  const deadline=s.loadout().reload!.completesAt;s.room.tick(deadline);
  expect(s.loadout()).toMatchObject({weapons:{rifle:{ammo:30,reserve:149}},reload:null});
 });
});
