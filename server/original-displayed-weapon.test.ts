import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {MatchRoom} from './match-room';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {LoadoutMessage,MessagePeer,ServerMessage,WeaponId} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
function setup(map:'barrack'|'woodlands',winter=false){
 registerOriginalMapRuntime(map,JSON.parse(readFileSync(`public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,'utf8')));
 const room=new MatchRoom('display',{map,now:()=>0,...(winter?{collisionProfile:'winter' as const}:{})}),peer=new Peer(),joined=room.join(peer,'A',0);
 if(!joined.ok)throw Error(joined.message);const id=joined.player.id;
 const actor=(room as unknown as {players:Map<string,{ammo:Record<WeaponId,number>;reserve:Record<WeaponId,number>}>}).players.get(id)!;
 const loadout=()=>peer.messages.filter((m):m is LoadoutMessage=>m.type==='loadout').at(-1)!;
 const empty=()=>{for(const key of Object.keys(actor.ammo) as WeaponId[]){actor.ammo[key]=0;actor.reserve[key]=0;}};
 const reload=(sourceSortAfterReload?:boolean,now=0)=>room.handleMessage(id,{type:'reload',weapon:room.getSnapshot(0).players[0].transform.weapon,...(sourceSortAfterReload!==undefined?{sourceSortAfterReload}:{})},now);
 return {room,peer,id,actor,loadout,empty,reload};
}
describe('authoritative source displayed model is distinct from VOID selection',()=>{
 it.each(['barrack','woodlands'] as const)('%s failed manual reload retains old model, then held empty fire sorts to VOID',map=>{
  const s=setup(map);expect(s.loadout().sourceDisplayedWeapon).toBe('launcher');s.empty();s.reload();
  expect(s.loadout()).toMatchObject({unarmed:true,equipped:'launcher',sourceDisplayedWeapon:'launcher',reload:null});
  s.reload(true);expect(s.loadout()).toMatchObject({unarmed:true,equipped:'launcher',sourceDisplayedWeapon:null,reload:null});
  s.reload();expect(s.loadout().sourceDisplayedWeapon).toBeNull();
 });
 it.each(['barrack','woodlands'] as const)('%s selects and displays first usable fallback and successful reload',map=>{
  const s=setup(map);s.empty();s.actor.reserve.pistol=3;s.reload();
  expect(s.loadout()).toMatchObject({unarmed:false,equipped:'pistol',sourceDisplayedWeapon:'pistol'});
  s.reload();expect(s.loadout().weapons.pistol.ammo).toBe(3);expect(s.loadout().sourceDisplayedWeapon).toBe('pistol');
 });
 it.each(['barrack','woodlands'] as const)('%s preserves both retained and hidden model through reconnect',map=>{
  for(const hide of [false,true]){const s=setup(map);s.empty();s.reload(hide);
   const welcome=s.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
   s.room.suspend(s.id,0,s.peer);const peer=new Peer();const resumed=s.room.join(peer,'A',1,welcome.resumeToken);expect(resumed.ok).toBe(true);
   expect(peer.messages.filter(m=>m.type==='loadout').at(-1)).toMatchObject({unarmed:true,sourceDisplayedWeapon:hide?null:'launcher'});
  }
 });
 it.each(['barrack','woodlands'] as const)('%s failed autonomous RPG reload retains display until explicit held-fire sort',map=>{
  const s=setup(map);const transform=s.room.getSnapshot(0).players[0].transform;
  s.room.handleMessage(s.id,{type:'transform',sequence:1,clientTime:0,transform:{...transform,weapon:'rpg'}},0);s.empty();s.room.tick(2000);
  expect(s.loadout()).toMatchObject({equipped:'rpg',unarmed:true,sourceDisplayedWeapon:'rpg'});
  s.reload(true,2000);expect(s.loadout()).toMatchObject({equipped:'rpg',unarmed:true,sourceDisplayedWeapon:null});
 });
 it.each(['barrack','woodlands'] as const)('%s weapon pickup restores a model after held-fire VOID sort',map=>{
  const s=setup(map);s.empty();s.reload(true);const feet=s.room.getSnapshot(0).players[0].transform.position;
  const drops=(s.room as unknown as {drops:Map<string,{id:string;weapon:WeaponId;position:typeof feet;expiresAt:null}>}).drops;
  drops.set('source-pickup',{id:'source-pickup',weapon:'rifle',position:{...feet,y:feet.y+1.55},expiresAt:null});
  s.room.handleMessage(s.id,{type:'collect',itemId:'source-pickup'},0);
  expect(s.loadout()).toMatchObject({unarmed:false,equipped:'rifle',sourceDisplayedWeapon:'rifle'});expect(s.loadout().weapons.rifle.ammo).toBeGreaterThan(0);
 });
 it('rejects malformed sort intent before modifying authoritative selection',()=>{
  const s=setup('barrack');s.empty();s.room.handleMessage(s.id,{type:'reload',weapon:'launcher',sourceSortAfterReload:'launcher'} as never,0);
  expect(s.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'invalid_reload'}));expect(s.loadout()).toMatchObject({unarmed:false,sourceDisplayedWeapon:'launcher'});
 });
 it('Winter retains its legacy packet and reload semantics with source intent',()=>{
  const s=setup('barrack',true);s.reload(true);expect(s.loadout()).not.toHaveProperty('sourceDisplayedWeapon');expect(s.loadout()).not.toHaveProperty('unarmed');
 });
});
