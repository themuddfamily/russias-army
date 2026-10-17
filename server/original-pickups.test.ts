import {describe,it,expect,vi} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_DROP_AMMO,ORIGINAL_PICKUP_SCORE,ORIGINAL_KILL_SCORE,originalDropPosition} from '../shared/originalPickupRules';
import {weaponReloadDuration} from '../shared/legacyReload';
import type {WeaponId,MessagePeer,ServerMessage,PlayerTransform,DamageSource} from './protocol';
import type {WeaponDropSnapshot} from '../shared/protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
interface Player {id:string;score:number;frags:number;ammo:Record<WeaponId,number>;reserve:Record<WeaponId,number>;transform:PlayerTransform;reloadWeapon:WeaponId|null;reloadCompleteAt:number|null;sourceTimeoutDrops:Map<string,WeaponDropSnapshot>}
interface Review {players:Map<string,Player>;kill(k:Player,v:Player,source:DamageSource,now:number,award:boolean):void;sendSourceViewMessage(p:Player,m:ServerMessage):void}
function setup(map:'barrack'|'woodlands'='barrack',winter=false){
 const runtime=getOriginalMapRuntime(map),position=winter?{x:0,y:0,z:0}:runtime.spawnPoints[0],room=new MatchRoom('pickup-rules',{map,spawnPoints:[position],now:()=>0,...(winter?{collisionProfile:'winter' as const}:{})});
 const peer=new Peer(),victimPeer=new Peer(),joined=room.join(peer,'A',0),v=room.join(victimPeer,'B',0);if(!joined.ok||!v.ok)throw Error('join');
 const review=room as unknown as Review,killer=review.players.get(joined.player.id)!,victim=review.players.get(v.player.id)!;
 const kill=(weapon:WeaponId='launcher',now=1100,award=true)=>{victim.transform.weapon=weapon;review.sendSourceViewMessage(killer,{type:'snapshot',snapshot:room.getSnapshot(now)});review.kill(killer,victim,{kind:'hitscan',shotId:'setup-kill',weapon:'rifle',zone:'body',position:victim.transform.position},now,award);if(winter)return room.getSnapshot(now).drops!.at(-1)!;expect(room.getSnapshot(now).drops).toEqual([]);expect(killer.sourceTimeoutDrops.size).toBe(1);expect(victim.sourceTimeoutDrops.size).toBe(0);return [...killer.sourceTimeoutDrops.values()].at(-1)!;};
 return {room,peer,victimPeer,killer,victim,kill,runtime};
}
const loadout=(s:ReturnType<typeof setup>)=>s.peer.messages.filter(m=>m.type==='loadout').at(-1);
describe('authoritative preserved original pickup and point rules',()=>{
 it.each(['barrack','woodlands'] as const)('%s keeps same death private IDs independently collectible by their owning viewer',map=>{
  const s=setup(map),review=s.room as unknown as Review,otherPeer=new Peer(),joined=s.room.join(otherPeer,'OTHER',1000);if(!joined.ok)throw Error('join');const other=review.players.get(joined.player.id)!;
  s.victim.transform.weapon='pistol';review.sendSourceViewMessage(other,{type:'snapshot',snapshot:s.room.getSnapshot(1100)});
  const otherStores={ammo:{...other.ammo},reserve:{...other.reserve}},drop=s.kill('pistol'),own=[...other.sourceTimeoutDrops.values()][0];expect(own.id).not.toBe(drop.id);expect(own.weapon).toBe('pistol');
  s.room.handleMessage(other.id,{type:'collect',itemId:drop.id},1200);expect(other.sourceTimeoutDrops.get(own.id)).toEqual(own);expect(other.ammo).toEqual(otherStores.ammo);expect(other.reserve).toEqual(otherStores.reserve);expect(other.score).toBe(0);expect(s.killer.sourceTimeoutDrops.has(drop.id)).toBe(true);
  const otherCollected=otherPeer.messages.filter(m=>m.type==='event'&&m.event.type==='collected').length;
  s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},1201);expect(s.killer.score).toBe(ORIGINAL_KILL_SCORE+ORIGINAL_PICKUP_SCORE);expect(s.killer.sourceTimeoutDrops.has(drop.id)).toBe(false);expect(other.sourceTimeoutDrops.get(own.id)).toEqual(own);expect(other.ammo).toEqual(otherStores.ammo);expect(other.reserve).toEqual(otherStores.reserve);expect(otherPeer.messages.filter(m=>m.type==='event'&&m.event.type==='collected')).toHaveLength(otherCollected);expect(s.room.getSnapshot(1201).drops).toEqual([]);
  s.room.handleMessage(other.id,{type:'collect',itemId:own.id},1202);expect(other.sourceTimeoutDrops.size).toBe(0);expect(other.score).toBe(ORIGINAL_PICKUP_SCORE);expect(other.reserve.pistol).toBe(otherStores.reserve.pistol+ORIGINAL_DROP_AMMO.pistol);expect(s.room.getSnapshot(1202).drops).toEqual([]);
 });
 it.each(['barrack','woodlands'] as const)('%s source RPG pickup reload has no automatic ready-empty callback marker',map=>{
  const s=setup(map);s.killer.transform.weapon='rpg';s.killer.ammo.rpg=0;s.killer.reserve.rpg=0;const drop=s.kill('rpg',0);
  s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},0);
  expect(loadout(s)).toMatchObject({equipped:'rpg',weapons:{rpg:{ammo:1,reserve:11}},reload:{weapon:'rpg'}});
  expect(loadout(s)).not.toHaveProperty('sourceAutoReloadTime');
 });
 it.each(['barrack','woodlands'] as const)('%s awards kill and pickup points independently, preserves them on reconnect and never expires the source gun',map=>{
  const s=setup(map),drop=s.kill();expect(s.killer.score).toBe(ORIGINAL_KILL_SCORE);expect(drop.expiresAt).toBeNull();
  expect(drop.position).toEqual(originalDropPosition({...s.victim.transform.position,y:s.victim.transform.position.y+s.runtime.profile.eyeHeight},s.runtime.scale));
  expect(drop.yaw).toBeGreaterThanOrEqual(10*Math.PI/180);expect(drop.yaw).toBeLessThanOrEqual(2*Math.PI);
  // Inventory lifetime/reconnect scope: isolate unrelated sixty-second
  // physics catch-up, retaining original timestamps and the 5s test deadline.
  const world=vi.spyOn(s.room as unknown as {updateSourceWorld(now:number):void},'updateSourceWorld').mockImplementation(()=>{});try{
  s.room.tick(60_000);expect(s.room.getSnapshot(60_000).drops).toEqual([]);expect(s.killer.sourceTimeoutDrops.get(drop.id)).toEqual(drop);expect(s.room.getSnapshot(60_000).players.find(p=>p.id===s.victim.id)!.alive).toBe(false);
  s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},60_001);expect(s.killer.score).toBe(35);expect(s.killer.sourceTimeoutDrops.size).toBe(0);expect(s.room.getSnapshot(60_001).drops).toEqual([]);
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='collected').at(-1)).toMatchObject({event:{data:{score:35}}});
  s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},60_002);expect(s.killer.score).toBe(ORIGINAL_KILL_SCORE+ORIGINAL_PICKUP_SCORE);
  const welcome=s.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');s.room.suspend(s.killer.id,60_100,s.peer);
  const next=new Peer(),resumed=s.room.join(next,'A',60_200,welcome.resumeToken);expect(resumed).toMatchObject({ok:true,player:{score:35,frags:1}});
  }finally{world.mockRestore();}
 });
 it.each(Object.keys(ORIGINAL_DROP_AMMO) as WeaponId[])('grants fixed %s reserve and reloads the selected rifle without switching',weapon=>{
  const s=setup('woodlands');s.killer.transform.weapon='rifle';s.killer.ammo.rifle=12;const before=s.killer.reserve[weapon],stores={ammo:{...s.killer.ammo},reserve:{...s.killer.reserve}},drop=s.kill(weapon);
  s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},1200);
  expect(s.killer.transform.weapon).toBe('rifle');expect(s.killer.ammo.rifle).toBe(28);
  expect(s.killer.reserve[weapon]).toBe(before+ORIGINAL_DROP_AMMO[weapon]-(weapon==='rifle'?16:0));
  expect(s.killer.sourceTimeoutDrops.has(drop.id)).toBe(false);expect(s.killer.score).toBe(ORIGINAL_KILL_SCORE+ORIGINAL_PICKUP_SCORE);for(const other of Object.keys(stores.ammo) as WeaponId[])if(other!==weapon&&other!=='rifle'){expect(s.killer.ammo[other]).toBe(stores.ammo[other]);expect(s.killer.reserve[other]).toBe(stores.reserve[other]);}
  expect(loadout(s)).toMatchObject({equipped:'rifle',reload:{weapon:'rifle',completesAt:2200}});
  s.room.tick(2200);expect(s.killer.ammo.rifle).toBe(28);expect(s.killer.reloadWeapon).toBeNull();
 });
 it.each(['barrack','woodlands'] as const)('%s restarts source pickup lockout even when the selected chamber is full',map=>{
  const s=setup(map);s.killer.transform.weapon='rifle';s.room.handleMessage(s.killer.id,{type:'reload',weapon:'rifle'},1000);expect(s.killer.reloadWeapon).toBe('rifle');
  const drop=s.kill('pistol',1100);s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},1200);
  expect(s.killer.ammo.rifle).toBe(28);expect(s.killer.reserve.rifle).toBe(140);expect(s.killer.reserve.pistol).toBe(74);
  expect(s.killer.reloadCompleteAt).toBeCloseTo(1200+weaponReloadDuration(map,'rifle',1)*1000+(map==='barrack'?1000/30:0));
  s.room.handleMessage(s.killer.id,{type:'shoot',shot:{shotId:'locked',weapon:'rifle',origin:{...s.killer.transform.position,y:s.killer.transform.position.y+1.55},direction:{x:0,y:0,z:1}}},1201);
  expect(s.peer.messages.at(-2)).toMatchObject({type:'error',code:'reload_in_progress'});
 });
 it('uses the source Dragunov refund and loaded/no-reserve lockout, then scans empty stores without reloading',()=>{
  const s=setup('woodlands');s.killer.transform.weapon='sniper';s.room.handleMessage(s.killer.id,{type:'reload',weapon:'sniper'},1000);
  expect(s.killer.ammo.sniper).toBe(28);expect(s.killer.reserve.sniper).toBe(14);expect(s.killer.reloadCompleteAt).toBe(2000);
  s.killer.ammo.sniper=2;s.killer.reserve.sniper=0;s.room.handleMessage(s.killer.id,{type:'reload',weapon:'sniper'},1100);
  expect(s.killer.ammo.sniper).toBe(2);expect(s.killer.reserve.sniper).toBe(0);expect(s.killer.reloadCompleteAt).toBe(2100);
  s.room.tick(2100);s.killer.ammo.sniper=0;s.room.handleMessage(s.killer.id,{type:'reload',weapon:'sniper'},2200);
  expect(loadout(s)).toMatchObject({equipped:'pistol',reload:null,unarmed:false});expect(s.killer.reloadWeapon).toBeNull();
 });
 it('uses camera-distance reach and rejects beyond its sphere regardless of the old feet cylinder',()=>{
  const s=setup(),drop=s.kill(),eye={...s.killer.transform.position,y:s.killer.transform.position.y+s.runtime.profile.eyeHeight};
  const stored=s.killer.sourceTimeoutDrops.get(drop.id)!;
  stored.position={...eye,x:eye.x+1.2};s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},1200);expect(s.killer.sourceTimeoutDrops.has(drop.id)).toBe(true);expect(s.killer.score).toBe(ORIGINAL_KILL_SCORE);expect(s.room.getSnapshot(1200).drops).toEqual([]);
  stored.position={...eye,y:eye.y-.9};s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},1300);expect(s.killer.sourceTimeoutDrops.has(drop.id)).toBe(false);expect(s.killer.score).toBe(ORIGINAL_KILL_SCORE+ORIGINAL_PICKUP_SCORE);expect(s.room.getSnapshot(1300).drops).toEqual([]);
 });
 it('keeps VOID selection through reconnect, rejects firing, and selects the picked gun when all stores were empty',()=>{
  const s=setup('woodlands');for(const weapon of Object.keys(s.killer.ammo) as WeaponId[]){s.killer.ammo[weapon]=0;s.killer.reserve[weapon]=0;}
  s.room.handleMessage(s.killer.id,{type:'reload',weapon:s.killer.transform.weapon},1100);
  expect(loadout(s)).toMatchObject({equipped:'launcher',unarmed:true,reload:null});
  const welcome=s.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
  s.room.suspend(s.killer.id,1101,s.peer);const next=new Peer();s.room.join(next,'A',1102,welcome.resumeToken);
  expect(next.messages.filter(m=>m.type==='loadout').at(-1)).toMatchObject({unarmed:true,reload:null});
  s.room.handleMessage(s.killer.id,{type:'shoot',shot:{shotId:'void-shot',weapon:'launcher',origin:{...s.killer.transform.position,y:s.killer.transform.position.y+1.55},direction:{x:0,y:0,z:1}}},1103);
  expect(next.messages.some(m=>m.type==='error'&&m.code==='empty_magazine')).toBe(true);
  const drop=s.kill('rifle',1200);s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},1201);
  expect(next.messages.filter(m=>m.type==='loadout').at(-1)).toMatchObject({equipped:'rifle',unarmed:false,reload:{weapon:'rifle',completesAt:2200},weapons:{rifle:{ammo:28,reserve:22}}});
 });
 it('rejects empty-slot selection and scans reserve-only slots in source order without starting their reload',()=>{
  const s=setup();s.killer.ammo.pistol=0;s.killer.reserve.pistol=0;
  s.room.handleMessage(s.killer.id,{type:'transform',sequence:0,clientTime:1100,transform:{...s.killer.transform,weapon:'pistol'}},1100);
  expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='invalid_transform')).toBe(true);expect(s.killer.transform.weapon).toBe('launcher');
  s.killer.ammo.launcher=0;s.killer.reserve.launcher=0;s.killer.ammo.shotgun=0;
  s.room.handleMessage(s.killer.id,{type:'reload',weapon:'launcher'},1200);
  expect(loadout(s)).toMatchObject({equipped:'shotgun',reload:null,unarmed:false});expect(s.killer.ammo.shotgun).toBe(0);
 });
 it('does not award a self-elimination score and preserves Winter expiry, quantities and full-reload guards',()=>{
  const source=setup();(source.room as unknown as Review).kill(source.killer,source.killer,{kind:'explosion',shotId:'self',projectileId:'self',weapon:'launcher',position:source.killer.transform.position},1100,false);expect(source.killer.score).toBe(0);expect(source.killer.frags).toBe(0);
  const s=setup('barrack',true),drop=s.kill('pistol');expect(drop.expiresAt).toBe(31_100);expect(s.room.getSnapshot(1100).players[0].score).toBeUndefined();
  s.room.handleMessage(s.killer.id,{type:'reload',weapon:'rifle'},1200);expect(s.peer.messages.at(-2)).toMatchObject({type:'error',code:'magazine_full'});
  s.room.handleMessage(s.killer.id,{type:'collect',itemId:drop.id},1300);expect(s.killer.transform.weapon).toBe('pistol');expect(s.killer.reserve.pistol).toBe(72);
 });
});
