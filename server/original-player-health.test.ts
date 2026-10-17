import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalProjectile} from '../shared/originalExplosives';
import type {MessagePeer,ServerMessage,PlayerTransform} from './protocol';
import type {OriginalPlayerBody} from '../shared/originalPlayerPhysics';
import type {OriginalPlayerHealthState} from '../shared/protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
interface Actor {sourceWorld:{body:OriginalPlayerBody;projectiles:Map<string,unknown>}|null;id:string;health:number;armor:number;alive:boolean;sourceHealth:OriginalPlayerHealthState|null;protectedUntil:number;transform:PlayerTransform}
interface Review {players:Map<string,Actor>;applyDamage(player:Actor,damage:number):boolean;installSourceFixtureActor(active:unknown,viewers?:readonly string[]):void;detonateSourceFor(player:Actor,active:unknown,now:number):void;pickups:Map<string,unknown>}
function setup(mode:'source'|'winter'|'fixture'='source'){
 const map='barrack',position=mode==='source'?getOriginalMapRuntime(map).spawnPoints[0]:{x:0,y:0,z:0};
 const room=new MatchRoom('health',{map,spawnPoints:[position],now:()=>0,...(mode==='winter'?{collisionProfile:'winter' as const}:{}),...(mode==='fixture'?{originalScene:false}: {})});
 const peer=new Peer(),joined=room.join(peer,'PLAYER',0);if(!joined.ok)throw Error('join');
 const review=room as unknown as Review,actor=review.players.get(joined.player.id)!;
 const snapshot=()=>room.getSnapshot(0).players.find(p=>p.id===actor.id)!;
 const blast=(time=0,id='blast')=>{
  const eye={...actor.transform.position,y:actor.transform.position.y+1.72};
  const source=createOriginalProjectile('launcher',eye,{x:0,y:1,z:0},actor.id);
  review.installSourceFixtureActor({source,updatedAt:time,gravity:0,radius:6.25,damage:5,rg6JumpEligible:false,snapshot:{projectileId:id,shotId:id,attackerId:actor.id,weapon:'launcher',position:eye,velocity:{x:0,y:0,z:0},direction:{...source.direction},remainingCallbacks:source.remainingCallbacks,expiresAt:time+59*1000/30}},[actor.id]);
  review.detonateSourceFor(actor,actor.sourceWorld!.projectiles.get(id),time);
 };
 return{room,peer,review,actor,snapshot,blast};
}
describe('source room health callback and mutation order',()=>{
 it('preserves signed zero through phase flips without automatic death',()=>{
  const s=setup();expect(s.snapshot().sourceHealth).toEqual({canonical:100,flick:2});
  expect(s.review.applyDamage(s.actor,100)).toBe(false);expect(s.snapshot().health).toBe(0);
  s.room.tick(1000/30);expect(s.snapshot().sourceHealth).toEqual({canonical:0,flick:-2});expect(s.actor.alive).toBe(true);
  s.room.tick(2000/30);expect(s.snapshot().sourceHealth).toEqual({canonical:0,flick:2});expect(s.actor.alive).toBe(true);
 });
 it.each([{flick:2 as const,initial:1,damage:5,health:-4,dead:false},{flick:2 as const,initial:0,damage:5,health:-5,dead:true},{flick:-2 as const,initial:9,damage:5,health:4,dead:false},{flick:-2 as const,initial:8,damage:5,health:3,dead:true}])('uses strict death boundary for $flick at resulting $health',({flick,initial,damage,health,dead})=>{
  const s=setup();Object.assign(s.actor.sourceHealth!,{canonical:initial,flick});s.actor.health=initial;
  expect(s.review.applyDamage(s.actor,damage)).toBe(dead);expect(s.snapshot().health).toBe(health);
 });
 it('source blast takes immediate direct damage despite armor/protection and alternates before all16 samples',()=>{
  const s=setup();s.actor.armor=100;s.actor.protectedUntil=999999;s.blast();
  s.room.tick(16*1000/30);expect(s.snapshot().health).toBe(20);expect(s.snapshot().armor).toBe(100);
  const events=s.peer.messages.flatMap(m=>m.type==='event'&&m.event.type==='damaged'?[m.event]:[]);
  expect(events).toHaveLength(16);events.forEach((e,i)=>{
   expect(e.data).toMatchObject({health:95-5*i,lethal:false,sourceHealth:{canonical:95-5*i,flick:i%2===0?-2:2}});
   expect(e.data.sourceHealthTime).toBeCloseTo((i+1)*1000/30);
  });
 });
 it('broadcasts explicit lethal phase and resets death snapshot to zero',()=>{
  const s=setup();s.actor.health=8;s.actor.sourceHealth!.canonical=8;s.blast();s.room.tick(1000/30);
  const event=s.peer.messages.find(m=>m.type==='event'&&m.event.type==='damaged');
  expect(event).toMatchObject({event:{data:{health:3,lethal:true,sourceHealth:{canonical:3,flick:-2}}}});
  expect(s.snapshot()).toMatchObject({alive:false,health:0,sourceHealth:{canonical:0,flick:-2}});
 });
 it('retains health and phase while suspended and resumes them in welcome',()=>{
  const s=setup();s.room.tick(1000/30);s.review.applyDamage(s.actor,12);
  const welcome=s.peer.messages.find(m=>m.type==='welcome');if(!welcome||welcome.type!=='welcome')throw Error('welcome');
  s.room.suspend(s.actor.id,40,s.peer);s.room.tick(1000);const peer=new Peer();const resumed=s.room.join(peer,'PLAYER',1000,welcome.resumeToken);
  expect(resumed).toMatchObject({ok:true,player:{health:88,sourceHealth:{canonical:88,flick:-2}}});
  expect(peer.messages.find(m=>m.type==='welcome')).toMatchObject({player:{sourceHealth:{canonical:88,flick:-2}},sourceHealthTime:expect.any(Number)});
 });
 it('uses uncapped20 health pickup and consumes it permanently',()=>{
  const s=setup();s.review.pickups.set('health',{id:'health',type:'health',position:{...s.actor.transform.position,y:s.actor.transform.position.y+.8},active:true,respawnAt:null});
  s.room.handleMessage(s.actor.id,{type:'collect',itemId:'health'},0);
  expect(s.snapshot().health).toBe(120);expect(s.snapshot().score).toBe(5);
  expect(s.review.pickups.get('health')).toMatchObject({active:false,respawnAt:null});
 });
 it.each(['winter','fixture'] as const)('%s keeps authored armor arithmetic and no source state',mode=>{
  const s=setup(mode);s.actor.armor=100;expect(s.review.applyDamage(s.actor,12)).toBe(false);
  expect(s.snapshot().health).toBeCloseTo(94.6);expect(s.snapshot().armor).toBeCloseTo(93.4);expect(s.snapshot().sourceHealth).toBeUndefined();
 });
});
