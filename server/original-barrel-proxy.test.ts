import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {MatchRoom} from './match-room';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_PLAYER_EYE_OFFSET,type OriginalPlayerBody} from '../shared/originalPlayerPhysics';
import type {OriginalProjectileState} from '../shared/originalExplosives';
import type {MessagePeer,ServerMessage,PlayerTransform} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
interface Review {
 players:Map<string,{sourceWorld:{body:OriginalPlayerBody;projectiles:Map<string,{source:OriginalProjectileState}>}|null;transform:PlayerTransform;authorizedBoost:{issuedAt:number;velocityY:number}|null;sourceBody:OriginalPlayerBody|null}>;
 respawn(player:unknown,now:number):void;
}
function setup(){
 const runtime=registerOriginalMapRuntime('barrack',JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8'))),peer=new Peer();let seq=0;
 const room=new MatchRoom('legacy-proxy',{map:'barrack',spawnPoints:[runtime.spawnPoints[0]],now:()=>0,sessionMode:'round',idFactory:()=>`player-${++seq}`}),joined=room.join(peer,'A',0);if(!joined.ok)throw Error(joined.message);
 const review=room as unknown as Review,id=joined.player.id;
 return {runtime,room,peer,review,id};
}
function rebound(s:ReturnType<typeof setup>){
 const start=s.room.getSnapshot(0).players[0].transform.position;
 s.room.handleMessage(s.id,{type:'shoot',shot:{shotId:'rebound',weapon:'launcher',origin:{...start,y:start.y+s.runtime.profile.eyeHeight},direction:{x:0,y:1,z:0}}},1100);
 const active=[...s.review.players.get(s.id)!.sourceWorld!.projectiles.values()][0];expect(active).toBeDefined();active.source.position={...start,y:start.y+.08};active.source.velocity={x:0,y:16,z:0};
 s.room.tick(1100+1000/30);return start;
}
describe('source compatibility proxies preserve physical contact continuity',()=>{
 it('does not teleport a launched body back to stale reported feet on later callbacks',()=>{
  const s=setup(),start=rebound(s),actor=s.review.players.get(s.id)!,proxy=s.review.players.get(s.id)!.sourceWorld!.body;
  const boost={...actor.authorizedBoost!};expect(boost.velocityY).toBeGreaterThan(5.6);s.room.tick(1433+1/3);
  expect(s.review.players.get(s.id)!.sourceWorld!.body).toBe(proxy);expect(proxy.position.y).toBeGreaterThan(start.y+s.runtime.profile.eyeHeight-ORIGINAL_PLAYER_EYE_OFFSET+.5);
  expect(actor.transform.position).toEqual(start);expect(actor.authorizedBoost!.issuedAt).toBe(boost.issuedAt);expect(actor.authorizedBoost!.velocityY).toBe(boost.velocityY);
  expect(s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='projectile_contact')).toHaveLength(1);
 });
 it('batched catch-up preserves the same physical callback and contact order as individual ticks',()=>{
  const individual=setup(),batched=setup();rebound(individual);rebound(batched);for(let i=1;i<=15;i++)individual.room.tick(1133+1/3+i*1000/30);batched.room.tick(1633+1/3);
  expect({...individual.room.getSnapshot(1633+1/3),tick:0}).toEqual({...batched.room.getSnapshot(1633+1/3),tick:0});
  expect(individual.review.players.get(individual.id)!.sourceWorld!.body).toEqual(batched.review.players.get(batched.id)!.sourceWorld!.body);
  expect(individual.peer.messages.filter(m=>m.type==='event')).toEqual(batched.peer.messages.filter(m=>m.type==='event'));
 });
 it('reanchors external movement, transfers body ownership on source takeover, retains suspension and resets respawn',()=>{
  const s=setup();s.room.tick(100);const before=s.review.players.get(s.id)!.sourceWorld!.body;expect(before).toBeDefined();const transform=s.room.getSnapshot(100).players[0].transform;
  s.room.handleMessage(s.id,{type:'transform',sequence:1,clientTime:100,transform},100);expect(s.peer.messages.filter(m=>m.type==='error')).toEqual([]);
  const anchored=s.review.players.get(s.id)!.sourceWorld!.body;expect(anchored).not.toBe(before);expect(anchored.position).toEqual({...transform.position,y:transform.position.y+s.runtime.profile.eyeHeight-ORIGINAL_PLAYER_EYE_OFFSET});
  s.room.handleMessage(s.id,{type:'transform',sequence:2,clientTime:100,transform:{...transform,sourceInput:{forward:false,backward:false,left:false,right:false,jump:false}}},100);
  expect(s.review.players.get(s.id)!.sourceBody).not.toBeNull();expect(s.review.players.get(s.id)!.sourceWorld!.body).toBe(s.review.players.get(s.id)!.sourceBody);
  const detached=setup();detached.room.tick(100);const retained=detached.review.players.get(detached.id)!.sourceWorld;expect(retained).not.toBeNull();const frozenBody=structuredClone(retained!.body);detached.room.suspend(detached.id,100,detached.peer);detached.room.tick(200);expect(detached.review.players.get(detached.id)!.sourceWorld).toBe(retained);expect(retained!.body).toEqual(frozenBody);
  const life=setup();life.room.tick(100);life.review.respawn(life.review.players.get(life.id),100);expect(life.review.players.get(life.id)!.sourceWorld).toBeNull();
 });
});
