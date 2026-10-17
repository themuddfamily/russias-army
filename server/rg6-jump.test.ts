import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {createMatchClock} from './clock';
import type {MessagePeer,ServerMessage,ShotData,PlayerTransform} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
function setup(position={x:-45,y:0,z:-35},winter=false){
 const room=new MatchRoom('rg6',{originalScene:false,spawnPoints:[position],now:()=>0,...(winter?{collisionProfile:'winter' as const}:{})});
 const peer=new Peer(),result=room.join(peer,'Jumper',0);if(!result.ok)throw Error(result.message);
 const id=result.player.id;
 const read=()=>room.getSnapshot(0).players.find(p=>p.id===id)!;
 let sequence=0;
 const move=(changes:Partial<PlayerTransform>,now:number)=>room.handleMessage(id,{type:'transform',sequence:++sequence,clientTime:now,transform:{...read().transform,...changes}},now);
 move({weapon:'launcher'},1000);
 const fire=(time=1100,changes:Partial<ShotData>={})=>{
   const p=read().transform.position;
   room.handleMessage(id,{type:'shoot',shot:{shotId:'s'+time,weapon:'launcher',origin:{...p,y:p.y+1.55},direction:{x:0,y:-1,z:0},rg6Jump:{forward:true,jump:true},...changes}},time);
 };
 const boosts=()=>peer.messages.filter(m=>m.type==='event'&&m.event.type==='rg6_boost');
 return {room,peer,id,read,move,fire,boosts};
}
describe('authoritative legacy RG6 assisted jump',()=>{
 it('resolves an actual ground blast, consumes ammo, hurts the shooter, and accepts the issued flight',()=>{
  const s=setup();s.fire();expect(s.boosts()).toHaveLength(0);s.room.tick(1150);
  expect(s.boosts()).toHaveLength(1);expect(s.read().health).toBeLessThan(100);expect(s.read().health).toBeGreaterThan(0);
  expect(s.read().transform.velocity.y).toBe(8);
  expect(s.peer.messages.filter(m=>m.type==='loadout').at(-1)).toMatchObject({weapons:{launcher:{ammo:5}}});
  const start=s.read().transform.position;
  for(let i=1;i<=11;i++){
   const t=i*.1,y=8*t-6.25*t*t;
   s.move({position:{...start,y:Math.max(0,y)},velocity:{x:0,y:8-12.5*t,z:0},grounded:y<=0},1150+i*100);
   expect(s.read().transform.position.y).toBeCloseTo(Math.max(0,y));
  }
  s.move({position:{...start,y:0},velocity:{x:0,y:0,z:0},grounded:true},2450);
  expect(s.read().transform.grounded).toBe(true);
  s.move({position:{...start,y:2},velocity:{x:0,y:8,z:0},grounded:false},2600);
  expect(s.read().transform.position.y).toBe(0);
 });
 it.each([
  ['missing input',{rg6Jump:undefined}],['not jumping',{rg6Jump:{forward:true,jump:false}}],
  ['not forward',{rg6Jump:{forward:false,jump:true}}],['wrong angle',{direction:{x:1,y:0,z:0}}],
 ] as const)('does not boost for %s',(_label,changes)=>{
  const s=setup();s.fire(1100,changes);s.room.tick(4000);expect(s.boosts()).toHaveLength(0);
 });
 it('does not boost RPG or archival Winter ground shots',()=>{
  const s=setup();s.move({weapon:'rpg'},1050);s.fire(1100,{weapon:'rpg'});s.room.tick(1150);expect(s.boosts()).toHaveLength(0);
  const winter=setup(undefined,true);winter.fire();winter.room.tick(1150);expect(winter.boosts()).toHaveLength(0);
 });
 it('rejects malformed intent and replay without granting ammo or boosts',()=>{
  const s=setup();s.fire(1100,{rg6Jump:{forward:1,jump:true} as never});expect(s.room.getSnapshot(1100).projectiles).toHaveLength(0);
  s.fire(1200);s.room.tick(1250);expect(s.boosts()).toHaveLength(1);
  s.fire(1800,{shotId:'s1200'});s.room.tick(1850);expect(s.boosts()).toHaveLength(1);
 });
 it('does not spend boost time as horizontal allowance or permit immediate vertical teleport',()=>{
  const s=setup();s.fire();s.room.tick(1150);const p=s.read().transform.position;
  s.move({position:{...p,y:2},velocity:{x:0,y:8,z:0}},1150);expect(s.read().transform.position.y).toBe(0);
  s.move({position:{...p,x:p.x+4},velocity:{x:0,y:8,z:0}},1150);expect(s.read().transform.position.x).toBe(p.x);
 });
 it('supports successive eye-height ground shots renewing descent and climbing higher',()=>{
  const s=setup();s.fire();s.room.tick(1150);
  const p=s.read().transform.position,healthAfterFirst=s.read().health;
  const descentTime=.95,y=8*descentTime-6.25*descentTime**2;
  s.move({position:{...p,y},velocity:{x:0,y:8-12.5*descentTime,z:0},grounded:false},2100);
  s.fire(2100); // Actual current eye height; no launch-origin override.
  expect(s.room.getSnapshot(2100).projectiles[0].position.y).toBeCloseTo(y+1.55-1.2);
  const impactFeet=8*1.1-6.25*1.1**2;
  s.move({position:{...p,y:impactFeet},velocity:{x:0,y:8-12.5*1.1,z:0},grounded:false},2250);
  s.room.tick(2250);
  expect(s.boosts()).toHaveLength(2);expect(s.read().health).toBeLessThan(healthAfterFirst);
  expect(s.read().transform.velocity.y).toBeCloseTo(8);
  const event=s.boosts().at(-1);if(event?.type!=='event')throw Error('boost');
  expect(event.event.serverTime).toBe(2250);
  s.move({position:{...p,y:impactFeet+.7375},velocity:{x:0,y:6.75,z:0},grounded:false},2350);
  expect(s.read().transform.position.y).toBeCloseTo(impactFeet+.7375);
  s.move({position:{...p,y:impactFeet+2.2},velocity:{x:0,y:3,z:0},grounded:false},2650);
  expect(s.read().transform.position.y).toBeGreaterThan(8**2/(2*12.5));
  expect(s.peer.messages.filter(m=>m.type==='error')).toHaveLength(0);
 });
 it('cannot reuse an authorized ascent after suspension and reconnect',()=>{
  const s=setup();s.fire();s.room.tick(1150);
  const welcome=s.peer.messages.find(m=>m.type==='welcome');if(!welcome||welcome.type!=='welcome')throw Error('welcome');
  s.room.suspend(s.id,1200,s.peer);const replacement=new Peer();s.room.join(replacement,'Jumper',1250,welcome.resumeToken);
  const p=s.read().transform.position;s.move({position:{...p,y:2},velocity:{x:0,y:8,z:0},grounded:false},1400);
  expect(s.read().transform.position.y).toBe(0);
 });
 it('also authorizes a clearance impact once and never boosts a shooter killed by the blast',()=>{
  const s=setup();
  s.fire(1100,{origin:{x:-45,y:1,z:-35}});expect(s.boosts()).toHaveLength(1);
  s.room.tick(1200);expect(s.boosts()).toHaveLength(1);
  for(let i=1;i<=4;i++){
   if(!s.read().alive)break;
   s.move({grounded:true,velocity:{x:0,y:0,z:0}},1100+i*600-1);
   s.fire(1100+i*600,{origin:{x:-45,y:1,z:-35}});
  }
  expect(s.read().alive).toBe(false);
  expect(s.boosts()).toHaveLength(3);
  expect(s.read().transform.velocity.y).toBe(0);
 });
 it('retains ceiling collision even with a legitimate issued ascent',()=>{
  const s=setup({x:-31,y:0,z:28});s.fire();s.room.tick(1150);
  expect(s.boosts()).toHaveLength(1);
  s.move({position:{x:-31,y:1.8,z:28},velocity:{x:0,y:4.25,z:0},grounded:false},1450);
  expect(s.read().transform.position.y).toBe(0);
  expect(s.peer.messages.at(-1)).toMatchObject({type:'error',code:'collision_rejected'});
 });

 it('ignores an in-transit grounded packet without cancelling the newly issued boost',()=>{
  const s=setup();s.fire();s.room.tick(1150);const p=s.read().transform.position;
  s.move({grounded:true,velocity:{x:0,y:0,z:0}},1160);
  expect(s.read().transform.grounded).toBe(false);
  expect(s.peer.messages.filter(m=>m.type==='error')).toHaveLength(0);
  s.move({position:{...p,y:.7375},velocity:{x:0,y:6.75,z:0},grounded:false},1250);
  expect(s.read().transform.position.y).toBeCloseTo(.7375);
 });
 it('ignores an in-transit descending packet after a second real blast renews ascent',()=>{
  const s=setup();s.fire();s.room.tick(1150);const p=s.read().transform.position;
  const y=8*.95-6.25*.95**2;
  s.move({position:{...p,y},velocity:{x:0,y:8-12.5*.95,z:0},grounded:false},2100);
  s.fire(2100);
  const impactFeet=8*1.1-6.25*1.1**2;
  s.move({position:{...p,y:impactFeet},velocity:{x:0,y:8-12.5*1.1,z:0},grounded:false},2250);
  s.room.tick(2250);
  s.move({position:{...p,y:impactFeet-.03},velocity:{x:0,y:-6,z:0},grounded:false},2260);
  expect(s.read().transform.position.y).toBeCloseTo(impactFeet);
  s.move({position:{...p,y:impactFeet+.7375},velocity:{x:0,y:6.75,z:0},grounded:false},2350);
  expect(s.read().transform.position.y).toBeCloseTo(impactFeet+.7375);
  expect(s.peer.messages.filter(m=>m.type==='error')).toHaveLength(0);
 });
 it('does not extend the receipt window or ignore descent after observing ascent',()=>{
  const s=setup();s.fire();s.room.tick(1150);const p=s.read().transform.position;
  s.move({position:{...p,y:.7375},velocity:{x:0,y:6.75,z:0},grounded:false},1250);
  s.move({position:{...p,y:.72},velocity:{x:0,y:-1,z:0},grounded:false},1260);
  expect(s.read().transform.velocity.y).toBe(-1);
  s.move({position:{...p,y:1},velocity:{x:0,y:5,z:0},grounded:false},1300);
  expect(s.read().transform.position.y).toBe(.72);
  const later=setup();later.fire();later.room.tick(1150);
  later.move({grounded:true,velocity:{x:0,y:0,z:0}},1500);
  later.move({position:{...p,y:2},velocity:{x:0,y:8,z:0},grounded:false},1600);
  expect(later.read().transform.position.y).toBe(0);
 });

 it('continues authoritative flight when the host wall clock rolls backward',()=>{
  let wall=1_000_000,elapsed=0;
  const clock=createMatchClock(()=>wall,()=>elapsed);
  const room=new MatchRoom('clock-rollback',{originalScene:false,spawnPoints:[{x:-45,y:0,z:-35}],now:clock});
  const peer=new Peer(),joined=room.join(peer,'Jumper');if(!joined.ok)throw Error(joined.message);
  const id=joined.player.id;
  const read=()=>room.getSnapshot().players.find(p=>p.id===id)!;
  elapsed=1000;
  room.handleMessage(id,{type:'transform',sequence:1,clientTime:wall+elapsed,transform:{...read().transform,weapon:'launcher'}});
  elapsed=1100;
  room.handleMessage(id,{type:'shoot',shot:{shotId:'clock-shot',weapon:'launcher',origin:{x:-45,y:1.55,z:-35},direction:{x:0,y:-1,z:0},rg6Jump:{forward:true,jump:true}}});
  elapsed=1150;room.tick();
  expect(read().transform.velocity.y).toBe(8);
  wall-=900; // Same rollback recorded in the live preview diagnostics.
  elapsed=1450;
  room.handleMessage(id,{type:'transform',sequence:2,clientTime:wall+elapsed,transform:{...read().transform,
    position:{x:-45,y:1.8375,z:-35},velocity:{x:0,y:4.25,z:0},grounded:false}});
  expect(read().transform.position.y).toBeCloseTo(1.8375);
  expect(room.getSnapshot().serverTime).toBe(1_001_450);
  expect(peer.messages.filter(m=>m.type==='error')).toHaveLength(0);
 });

 it('accepts a valid ballistic flight sampled 120 ms before packet receipt, including the apex',()=>{
  const s=setup();s.fire();s.room.tick(1150);const p=s.read().transform.position;
  for(let i=1;i<=11;i++){
   const t=i*.1,y=8*t-6.25*t*t;
   s.move({position:{...p,y},velocity:{x:0,y:8-12.5*t,z:0},grounded:false},1150+i*100+120);
   expect(s.read().transform.position.y).toBeCloseTo(y);
  }
  expect(s.peer.messages.filter(m=>m.type==='error')).toHaveLength(0);
 });

 it('still rejects flight delayed beyond the bounded sampling allowance and stale hovering',()=>{
  const delayed=setup();delayed.fire();delayed.room.tick(1150);const p=delayed.read().transform.position;
  delayed.move({position:{...p,y:.7375},velocity:{x:0,y:6.75,z:0},grounded:false},1650);
  expect(delayed.read().transform.position.y).toBe(0);
  const hover=setup();hover.fire();hover.room.tick(1150);
  hover.move({position:{...p,y:2.56},velocity:{x:0,y:0,z:0},grounded:false},1790);
  expect(hover.read().transform.position.y).toBeCloseTo(2.56);
  hover.move({position:{...p,y:2.56},velocity:{x:0,y:0,z:0},grounded:false},3150);
  expect(hover.peer.messages.at(-1)).toMatchObject({type:'error',code:'collision_rejected'});
 });

 it('does not mistake the first positive boost acknowledgment below a stale origin for descent',()=>{
  // Real roof support permits a ground-directed blast under an airborne shooter.
  const s=setup({x:-31,y:3.64,z:28});
  s.move({position:{x:-31,y:4.186865,z:28},velocity:{x:0,y:3.8,z:0},grounded:false},1100);
  s.fire(1100);s.room.tick(1150);
  expect(s.boosts()).toHaveLength(1);
  s.move({position:{x:-31,y:3.979906,z:28},velocity:{x:0,y:7.615,z:0},grounded:false},1505);
  expect(s.read().transform.position.y).toBeCloseTo(3.979906);
  s.move({position:{x:-31,y:5.7023,z:28},velocity:{x:0,y:3.812,z:0},grounded:false},1555);
  expect(s.read().transform.position.y).toBeCloseTo(5.7023);
  expect(s.peer.messages.filter(m=>m.type==='error')).toHaveLength(0);
 });

});
