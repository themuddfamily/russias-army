import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import type {MessagePeer,ServerMessage,WeaponId,LoadoutMessage} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];observe?:(m:ServerMessage)=>void;send(m:ServerMessage){this.messages.push(m);this.observe?.(m);}}
type CounterAuthority={ammo:Record<WeaponId,number>;reserve:Record<WeaponId,number>;sourceCounter:OriginalWeaponCounter;sourceCounterReady:boolean;reloadWeapon:WeaponId|null;sourceUnarmed:boolean;sourceAutoReloadTime:number|null};
function setup(map:'barrack'|'woodlands',winter=false){
 const room=new MatchRoom('source-counter',{map,now:()=>0,spawnPoints:[winter?{x:0,y:0,z:0}:getOriginalMapRuntime(map).spawnPoints[0]],...(winter?{collisionProfile:'winter' as const}:{})}),peer=new Peer();
 const joined=room.join(peer,'A',0);if(!joined.ok)throw Error('join');const id=joined.player.id;let sequence=0,shot=0;
 const player=()=>room.getSnapshot(0).players.find(p=>p.id===id)!;
 const select=(weapon:WeaponId,now:number)=>room.handleMessage(id,{type:'transform',sequence:++sequence,clientTime:now,transform:{...player().transform,weapon}},now);
 const typing=(typing:boolean,now:number)=>room.handleMessage(id,{type:'transform',sequence:++sequence,clientTime:now,transform:{...player().transform,typing}},now);
 const reload=(now:number)=>room.handleMessage(id,{type:'reload',weapon:player().transform.weapon},now);
 const fire=(now:number)=>room.handleMessage(id,{type:'shoot',shot:{shotId:`counter-${++shot}`,weapon:player().transform.weapon,origin:{...player().transform.position,y:player().transform.position.y+1.55},direction:{x:0,y:0,z:1}}},now);
 const loadout=()=>peer.messages.filter((m):m is LoadoutMessage=>m.type==='loadout').at(-1)!;
 const authority=()=>(room as unknown as {players:Map<string,CounterAuthority>}).players.get(id)!;
 return {room,peer,id,select,typing,reload,fire,loadout,player,authority};
}
describe('source authority preserves the actor counter across numeric selection',()=>{
 it.each(['barrack','woodlands'] as const)('%s loadout carries the exact completed gun callback epoch at nonaligned receipt times',map=>{
  const s=setup(map);s.select('rpg',1000);s.fire(1107);const shot=s.loadout();
  expect(shot.serverTime).toBe(1107);expect(shot.sourceCounterTime).toBeCloseTo(1100);expect(shot.sourceCounterTime).not.toBe(shot.serverTime);
  const first=shot.reload!.completesAt;expect(first).toBeCloseTo(1100+(map==='barrack'?31:10)*1000/30);
  s.room.tick(first+11);const automatic=s.loadout();
  expect(automatic.serverTime).toBeCloseTo(first+11);expect(automatic.sourceAutoReloadTime).toBeCloseTo(first);expect(automatic.sourceCounterTime).toBeCloseTo(first);
  expect(automatic.sourceCounterTime).not.toBe(automatic.serverTime);expect(automatic.weapons.rpg).toEqual({ammo:1,reserve:11});
  const second=automatic.reload!.completesAt;expect(second).toBeCloseTo(first+(map==='barrack'?31:30)*1000/30);
  s.fire(second-.001);expect(s.peer.messages.at(-2)).toMatchObject({type:'error',code:'reload_in_progress'});
  expect(s.loadout().weapons.rpg).toEqual({ammo:1,reserve:11});expect(s.loadout().sourceCounterTime).toBeCloseTo(second-1000/30);expect(s.loadout().sourceAutoReloadTime).toBeUndefined();
  s.fire(second+7);expect(s.loadout().sourceCounterTime).toBeCloseTo(second);expect(s.loadout().serverTime).toBeCloseTo(second+7);expect(s.loadout().weapons.rpg).toEqual({ammo:0,reserve:11});
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='projectile_spawned')).toHaveLength(2);
 });
 it.each(['barrack','woodlands'] as const)('%s RPG follows each edition firing-time reload and saved-bullets overwrite',map=>{
  const s=setup(map);s.select('rpg',1000);
  // Advance both the real room and an independent actor replay to callback33.
  const expected=new OriginalWeaponCounter(map);
  for(let frame=1;frame<=30;frame++)expected.step('launcher');
  for(let frame=31;frame<=33;frame++)expect(expected.step('rpg')).toBe(true);
  const before=expected.state;
  if(map==='barrack'){expected.shot('rpg');expected.reload();}else{expected.reload();expected.shot('rpg');}
  s.fire(1100);
  expect(s.loadout().sourceCounter).toEqual({...expected.state,ready:false});
  expect(s.loadout().weapons.rpg.ammo).toBe(0);expect(s.loadout().weapons.rpg.reserve).toBe(12);expect(s.loadout().reload?.weapon).toBe('rpg');
  expect(s.loadout().reload!.completesAt).toBeCloseTo(1100+(map==='barrack'?31:10)*1000/30);
  if(map==='barrack')expect(expected.state).toEqual({waitgun:before.poldwaitgun,poldwaitgun:before.poldwaitgun+20});
  else expect(expected.state.waitgun).toBe(10);
 });
 it.each(['barrack','woodlands'] as const)('%s loaded RPG with zero reserve still reloads before spawning and overwrites saved bullets afterwards',map=>{
  const s=setup(map);s.authority().reserve.rpg=0;s.select('rpg',1000);
  let atSpawn:unknown;
  s.peer.observe=m=>{if(m.type==='event'&&m.event.type==='projectile_spawned')atSpawn={ammo:s.authority().ammo.rpg,reserve:s.authority().reserve.rpg,counter:s.authority().sourceCounter.state};};
  s.fire(1100);
  expect(atSpawn).toEqual({ammo:1,reserve:0,counter:map==='barrack'?{waitgun:0,poldwaitgun:20}:{waitgun:30,poldwaitgun:0}});
  expect(s.loadout().weapons.rpg).toEqual({ammo:0,reserve:0});expect(s.loadout().ackShotId).toBe('counter-1');
  expect(s.loadout().sourceCounter).toEqual(map==='barrack'?{waitgun:0,poldwaitgun:20,ready:false}:{waitgun:10,poldwaitgun:0,ready:false});
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='projectile_spawned')).toHaveLength(1);
 });
 it.each(['barrack','woodlands'] as const)('%s firing-time reload preserves the source signed overfull transfer before the final saved chamber overwrite',map=>{
  const s=setup(map);s.authority().ammo.rpg=2;s.select('rpg',1000);let atSpawn:unknown;
  s.peer.observe=m=>{if(m.type==='event'&&m.event.type==='projectile_spawned')atSpawn={ammo:s.authority().ammo.rpg,reserve:s.authority().reserve.rpg};};
  s.fire(1100);expect(atSpawn).toEqual({ammo:1,reserve:13});expect(s.loadout().weapons.rpg).toEqual({ammo:1,reserve:13});
 });
 it.each(['barrack','woodlands'] as const)('%s empty RPG automatically reloads at its next ready callback and cannot fire that callback',map=>{
  const s=setup(map);s.select('rpg',1000);s.fire(1100);
  const first=s.loadout().reload!.completesAt;s.room.tick(first-1);
  expect(s.authority().ammo.rpg).toBe(0);expect(s.authority().reserve.rpg).toBe(12);
  s.room.tick(first);const loaded=s.loadout();
  expect(loaded.weapons.rpg).toEqual({ammo:1,reserve:11});expect(loaded.sourceCounter!.ready).toBe(false);
  expect(loaded.sourceAutoReloadTime).toBeCloseTo(first);expect(s.authority().sourceAutoReloadTime).toBeNull();
  expect(loaded.reload!.completesAt).toBeCloseTo(first+(map==='barrack'?31:30)*1000/30);
  s.fire(first);expect(s.loadout().weapons.rpg).toEqual({ammo:1,reserve:11});expect(s.loadout().ackShotId).toBe('counter-2');
  expect(s.loadout().sourceAutoReloadTime).toBeUndefined();
  expect(s.peer.messages.at(-2)).toMatchObject({type:'error',code:'reload_in_progress'});
  const second=loaded.reload!.completesAt;s.fire(second);
  expect(s.loadout().weapons.rpg).toEqual({ammo:0,reserve:11});
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='projectile_spawned')).toHaveLength(2);
  expect(s.peer.messages.filter(m=>m.type==='loadout'&&m.sourceAutoReloadTime!==undefined)).toHaveLength(1);
 });
 it.each(['barrack','woodlands'] as const)('%s manual reload and ordinary firing never carry an automatic RPG reload marker',map=>{
  const s=setup(map);s.select('rpg',1000);s.reload(1000);expect(s.loadout().sourceAutoReloadTime).toBeUndefined();
  s.fire(s.loadout().reload!.completesAt);expect(s.loadout().sourceAutoReloadTime).toBeUndefined();
 });
 it('retains an unsent automatic reload marker through a throwing send and detachment, then sends it once on resume',()=>{
  const s=setup('woodlands');s.select('rpg',1000);s.fire(1100);const callback=s.loadout().reload!.completesAt;
  const welcome=s.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
  s.peer.observe=m=>{if(m.type==='loadout'&&m.sourceAutoReloadTime!==undefined)throw Error('send failed');};
  expect(()=>s.room.tick(callback)).toThrow('send failed');expect(s.authority().sourceAutoReloadTime).toBeCloseTo(callback);
  s.room.suspend(s.id,callback,s.peer);
  const review=s.room as unknown as {sendLoadout(player:CounterAuthority,now:number):void};review.sendLoadout(s.authority(),callback);
  expect(s.authority().sourceAutoReloadTime).toBeCloseTo(callback);
  const next=new Peer();s.room.join(next,'A',callback,welcome.resumeToken);
  const resumed=next.messages.filter((m):m is LoadoutMessage=>m.type==='loadout').at(-1)!;
  expect(resumed.sourceAutoReloadTime).toBeCloseTo(callback);expect(s.authority().sourceAutoReloadTime).toBeNull();
  review.sendLoadout(s.authority(),callback);expect(next.messages.filter(m=>m.type==='loadout').at(-1)).not.toHaveProperty('sourceAutoReloadTime');
 });
 it.each(['barrack','woodlands'] as const)('%s source RPG auto reload respects typing and falls back through numeric slot order when exhausted',map=>{
  const s=setup(map);s.authority().reserve.rpg=0;s.select('rpg',1000);s.fire(1100);const deadline=s.loadout().reload!.completesAt;
  s.typing(true,1101);s.room.tick(deadline+100);expect(s.player().transform.weapon).toBe('rpg');expect(s.authority().ammo.rpg).toBe(0);
  s.typing(false,deadline+100);s.room.tick(deadline+1300);
  expect(s.player().transform.weapon).toBe('pistol');expect(s.loadout().equipped).toBe('pistol');expect(s.loadout().weapons.rpg).toEqual({ammo:0,reserve:0});
  expect(s.loadout().sourceAutoReloadTime).toBeUndefined();
 });
 it.each(['barrack','woodlands'] as const)('%s rejects an invalid RPG origin without transferring ammunition or changing its admitted shot counter',map=>{
  const s=setup(map);s.select('rpg',1000);s.room.tick(1100);const before=s.loadout(),counter={...s.authority().sourceCounter.state,ready:s.authority().sourceCounterReady};
  s.room.handleMessage(s.id,{type:'shoot',shot:{shotId:'invalid-rpg',weapon:'rpg',origin:{x:9999,y:9999,z:9999},direction:{x:0,y:1,z:0}}},1100);
  expect(s.loadout().weapons.rpg).toEqual(before.weapons.rpg);expect(s.loadout().sourceCounter).toEqual(counter);expect(s.loadout().ackShotId).toBe('invalid-rpg');
  expect(s.peer.messages.at(-2)).toMatchObject({type:'error',code:'invalid_origin'});expect(s.room.getSnapshot(1100).projectiles).toEqual([]);
 });
 it.each(['barrack','woodlands'] as const)('%s allows switching during reload, preserves ammo and retargets the existing counter gate',map=>{
  const s=setup(map);s.select('sniper',1000);s.reload(1000);const sniper=s.loadout();
  expect(sniper.weapons.sniper).toEqual({ammo:28,reserve:14});
  s.select('rifle',1100);const rifle=s.loadout();expect(rifle.equipped).toBe('rifle');expect(rifle.weapons.rifle).toEqual({ammo:28,reserve:140});
  expect(rifle.reload?.weapon).toBe('rifle');const deadline=map==='barrack'?1000+22*1000/30:2000;expect(rifle.reload!.completesAt).toBeCloseTo(deadline);
  s.select('rifle',1200);s.fire(deadline-1);expect(s.loadout().weapons.rifle.ammo).toBe(28);
  expect(s.loadout().reload!.completesAt).toBeCloseTo(deadline);s.fire(deadline);expect(s.loadout().weapons.rifle.ammo).toBe(27);expect(s.loadout().reload).toBeNull();
  expect(s.peer.messages.filter(m=>m.type==='error').every(m=>m.type==='error'&&m.code==='reload_in_progress')).toBe(true);
 });
 it('Woodland keeps the prior gun shot counter when selecting a faster or slower gun',()=>{
  const s=setup('woodlands');s.select('sniper',1000);s.fire(1100);expect(s.loadout().weapons.sniper.ammo).toBe(29);expect(s.loadout().reload).toBeNull();
  s.select('rifle',1101);s.fire(1100+2*1000/30);expect(s.loadout().weapons.rifle.ammo).toBe(28);
  s.fire(1100+50*1000/30);expect(s.loadout().weapons.rifle.ammo).toBe(27);
  s.select('sniper',2801);s.fire(1100+52*1000/30);expect(s.loadout().weapons.sniper.ammo).toBe(28);
 });
 it('Barrack idle selection applies the newly selected threshold reset without granting immediate fire',()=>{
  const s=setup('barrack');s.select('sniper',1000);s.room.tick(3000);
  s.select('rifle',3000);s.fire(3000);expect(s.loadout().weapons.rifle.ammo).toBe(28);
  s.fire(3100);expect(s.loadout().weapons.rifle.ammo).toBe(28);
  s.fire(3000+4*1000/30);expect(s.loadout().weapons.rifle.ammo).toBe(27);
 });
 it('reconnect carries the same source counter and successful reload deadline',()=>{
  const s=setup('barrack');s.select('sniper',1000);s.reload(1000);s.select('rifle',1100);const before=s.loadout();
  const welcome=s.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
  s.room.suspend(s.id,1101,s.peer);const next=new Peer();s.room.join(next,'A',1102,welcome.resumeToken);
  expect(next.messages.filter(m=>m.type==='loadout').at(-1)).toMatchObject({sourceCounter:before.sourceCounter,reload:before.reload});
 });
 it('Winter preserves its reload switch guard and omits source counters',()=>{
  const s=setup('barrack',true);s.fire(1100);s.reload(1200);s.select('pistol',1300);
  expect(s.player().transform.weapon).toBe('rifle');expect(s.loadout().sourceCounter).toBeUndefined();
  expect(s.loadout().sourceCounterTime).toBeUndefined();
  expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='reload_in_progress')).toBe(true);
 });
 it.each(['barrack','woodlands'] as const)('%s synchronizes chat guards with finite reload metadata and resumes at its exact gate',map=>{
  const s=setup(map);s.select('rifle',1000);s.reload(1000);s.typing(true,1100);const before=s.loadout().sourceCounter!;
  expect(s.player().transform.typing).toBe(true);expect(before.ready).toBe(false);
  s.reload(1200);expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='invalid_reload')).toBe(true);
  s.room.tick(2000);s.typing(false,2000);const after=s.loadout();
  expect(s.player().transform.typing).toBe(false);expect(Number.isFinite(after.reload!.completesAt)).toBe(true);expect(after.reload!.completesAt).toBeGreaterThan(2000);
  if(map==='barrack')expect(after.sourceCounter).toEqual(before);
  else{expect(after.sourceCounter!.waitgun).toBe(0);expect(after.sourceCounter!.poldwaitgun).toBe(before.poldwaitgun);}
  const deadline=after.reload!.completesAt;s.fire(deadline-1);expect(s.loadout().weapons.rifle.ammo).toBe(28);
  s.fire(deadline);expect(s.loadout().weapons.rifle.ammo).toBe(27);expect(s.loadout().reload).toBeNull();
 });
 it('rejects malformed typing without changing authoritative state and Winter ignores the input guard',()=>{
  const s=setup('barrack');s.typing('yes' as unknown as boolean,1000);expect(s.player().transform.typing).toBeUndefined();
  expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='invalid_transform')).toBe(true);
  const winter=setup('barrack',true);winter.typing(true,1000);winter.fire(1100);expect(winter.loadout().weapons.rifle.ammo).toBe(29);
  winter.reload(1200);expect(winter.loadout().reload).not.toBeNull();
 });
});
