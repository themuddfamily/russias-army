import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalRemoteView} from '../shared/originalRemoteView';
import type {LoadoutMessage,MessagePeer,PlayerTransform,ServerMessage,WeaponId} from './protocol';

class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
interface Actor {id:string;sourceMotionTime:number;sourcePoseHistory:{motionTime:number}[];sourceRemoteView:OriginalRemoteView|null;sourceViewGeneration:number;sourceViewTick:number;transform:PlayerTransform;ammo:Record<WeaponId,number>;}
interface Review {players:Map<string,Actor>;sendSourceViewMessage(player:Actor,message:ServerMessage):void;}
function setup(map:'barrack'|'woodlands',weapon:WeaponId){
 const runtime=getOriginalMapRuntime(map),room=new MatchRoom('projectile-phase',{map,now:()=>1100,spawnPoints:[runtime.spawnPoints[0]]}),peer=new Peer(),joined=room.join(peer,'SHOOTER',0);
 if(!joined.ok)throw Error('join');const review=room as unknown as Review,actor=review.players.get(joined.player.id)!;
 room.handleMessage(actor.id,{type:'transform',sequence:1,clientTime:1000,transform:{...room.getSnapshot(1000).players.find(p=>p.id===actor.id)!.transform,weapon}},1000);
 // Finish ordinary authority callbacks first. The shot and receipts below
 // share one epoch so a phase change can only come from the launch itself.
 room.tick(1100);actor.sourceMotionTime=440;
 const origin={...actor.transform.position,y:actor.transform.position.y+runtime.profile.eyeHeight};
 const fire=(shotId='launch')=>room.handleMessage(actor.id,{type:'shoot',shot:{shotId,weapon,origin,direction:{x:0,y:1,z:0},...(weapon==='rpg'?{sourceRotation:{x:90,y:0,z:0}}:{})}},1100);
 const loadout=()=>peer.messages.filter((m):m is LoadoutMessage=>m.type==='loadout').at(-1)!;
 return {room,review,peer,actor,fire,loadout};
}

describe('authority projectile launch does not invoke source baddie shoot',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const)it(`${map} ${weapon} retains GI phase while spawning, consuming ammo and rejecting replay`,()=>{
  const s=setup(map,weapon),ammo=s.actor.ammo[weapon],poses=s.actor.sourcePoseHistory.map(p=>({...p}));
  s.fire();expect(s.actor.sourceMotionTime).toBe(440);expect(s.actor.sourcePoseHistory).toEqual(poses);
  expect(s.room.getSnapshot(1100).players.find(p=>p.id===s.actor.id)!.sourceMotionTime).toBe(440);
  expect(s.room.getSnapshot(1100).projectiles).toHaveLength(1);expect(s.room.getSnapshot(1100).projectiles[0]).toMatchObject({shotId:'launch',attackerId:s.actor.id,weapon,remainingCallbacks:weapon==='rpg'?200:60});
  expect(s.loadout().weapons[weapon].ammo).toBe(ammo-1);expect(s.loadout().ackShotId).toBe('launch');
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='projectile_spawned')).toHaveLength(1);
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='shot')).toHaveLength(0);
  s.fire();expect(s.actor.sourceMotionTime).toBe(440);expect(s.actor.ammo[weapon]).toBe(ammo-1);expect(s.room.getSnapshot(1100).projectiles).toHaveLength(1);
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='projectile_spawned')).toHaveLength(1);
  expect(s.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'duplicate_shot'}));
 });
 it.each(['barrack','woodlands'] as const)('%s hitscan retains shoot phase2000 and its source pose record',map=>{
  const s=setup(map,'pistol'),ammo=s.actor.ammo.pistol;s.fire('bullet');
  expect(s.actor.sourceMotionTime).toBe(2000);expect(s.actor.sourcePoseHistory.at(-1)!.motionTime).toBe(2000);
  expect(s.room.getSnapshot(1100).players.find(p=>p.id===s.actor.id)!.sourceMotionTime).toBe(2000);
  expect(s.actor.ammo.pistol).toBe(ammo-1);expect(s.room.getSnapshot(1100).projectiles).toEqual([]);
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='shot')).toHaveLength(1);
 });
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const)it(`${map} negotiated ${weapon} receipt keeps its ordered tick without resetting the viewer GI`,()=>{
  const s=setup(map,weapon),peer=new Peer(),joined=s.room.join(peer,'VIEWER',1100,undefined,true);if(!joined.ok)throw Error('viewer join');
  const viewer=s.review.players.get(joined.player.id)!,mirror=viewer.sourceRemoteView!;
  const trace=(tick:number)=>({generation:viewer.sourceViewGeneration,callbacks:0,receipts:[{tick,callbacks:0}]});
  expect(mirror.accept(trace(0),1100)).toEqual({ok:true});const before=mirror.freeze();expect(before.find(p=>p.id===s.actor.id)!.motionTime).toBe(0);
  s.fire();const event=peer.messages.find(m=>m.type==='event'&&m.event.type==='projectile_spawned');
  expect(event).toMatchObject({type:'event',sourceViewTick:1,sourceViewSentAt:1100,event:{type:'projectile_spawned',data:{projectile:{weapon,attackerId:s.actor.id}}}});
  expect(mirror.accept(trace(1),1100)).toEqual({ok:true});expect(mirror.freeze()).toEqual(before);expect(mirror.debugState().pendingTicks).toEqual([]);
  s.review.sendSourceViewMessage(viewer,{type:'snapshot',snapshot:s.room.getSnapshot(1100)});
  expect(peer.messages.at(-1)).toMatchObject({type:'snapshot',sourceViewTick:2,sourceViewSentAt:1100});
  expect(mirror.accept(trace(2),1100)).toEqual({ok:true});expect(mirror.freeze().find(p=>p.id===s.actor.id)!.motionTime).toBe(0);expect(mirror.debugState().pendingTicks).toEqual([]);
  expect(peer.messages.some(m=>m.type==='error')).toBe(false);
 });
});
