import {describe,it,expect,vi} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {ClientMessage,MessagePeer,ServerMessage,PlayerTransform,MatchEvent} from './protocol';
import type {OriginalPlayerHealthState,WeaponDropSnapshot} from '../shared/protocol';
import type {OriginalRemoteView} from '../shared/originalRemoteView';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
interface Actor {id:string;health:number;alive:boolean;sourceHealth:OriginalPlayerHealthState|null;transform:PlayerTransform;deaths:number;frags:number;score:number;reloadWeapon:string|null;reloadCompleteAt:number|null;sourceRemoteView:OriginalRemoteView|null;sourceViewGeneration:number;sourceMotionTime:number;sourceTimeoutDrops:Map<string,WeaponDropSnapshot>}
function setup(map:'barrack'|'woodlands'='barrack',source=true){
 let sequence=0;
 const runtime=getOriginalMapRuntime(map),room=new MatchRoom('cowardice',{map,spawnPoints:[runtime.spawnPoints[0]],now:()=>0,idFactory:()=>`p${++sequence}`,...(!source?{collisionProfile:'winter' as const}:{})});
 const actors=(room as unknown as {players:Map<string,Actor>}).players;
 const join=(name:string,view=false)=>{const peer=new Peer(),out=room.join(peer,name,0,undefined,view);if(!out.ok)throw Error(out.message);return {peer,actor:actors.get(out.player.id)!};};
 const victim=join('Victim');
 const typing=(enabled:boolean)=>room.handleMessage(victim.actor.id,{type:'transform',sequence:++sequence,clientTime:0,transform:{...victim.actor.transform,typing:enabled,sourceInput:{forward:false,backward:false,left:false,right:false,jump:false}}},0,victim.peer);
 const escape=(peer:MessagePeer=victim.peer,message:ClientMessage={type:'source_escape'})=>room.handleMessage(victim.actor.id,message,0,peer);
 const events=(peer=victim.peer):MatchEvent[]=>peer.messages.flatMap(m=>m.type==='event'?[m.event]:[]);
 return {room,actors,runtime,join,victim,typing,escape,events};
}
describe('authenticated source Escape / Cowardice lifecycle',()=>{
 it.each([{map:'barrack' as const,typing:false,direct:true},{map:'barrack' as const,typing:true,direct:false},{map:'woodlands' as const,typing:false,direct:false},{map:'woodlands' as const,typing:true,direct:false}])('$map typing=$typing uses source direct=$direct route',({map,typing,direct})=>{
  const s=setup(map);s.typing(typing);expect(Boolean(s.victim.actor.transform.typing)).toBe(typing);s.escape();
  const damage=s.events().filter(e=>e.type==='damaged');expect(damage).toHaveLength(direct?0:1);
  if(!direct)expect(damage[0]).toMatchObject({data:{damage:1000,health:-900,lethal:true,sourceHealth:{canonical:-900,flick:2},source:{kind:'cowardice',direct:false,attackerId:null}}});
  expect(s.events().filter(e=>e.type==='killed')).toEqual([expect.objectContaining({data:expect.objectContaining({source:{kind:'cowardice',direct,attackerId:null},victimDeaths:1,killerFrags:0,killerScore:0})})]);
  expect(s.victim.actor).toMatchObject({alive:false,health:0,deaths:1,sourceMotionTime:2400});
 });
 it.each([{flick:2 as const,initial:996,dead:false},{flick:2 as const,initial:995,dead:true},{flick:-2 as const,initial:1004,dead:false},{flick:-2 as const,initial:1003,dead:true}])('keeps literal strict death boundary flick=$flick health=$initial',({flick,initial,dead})=>{
  const s=setup('woodlands');s.victim.actor.health=initial;Object.assign(s.victim.actor.sourceHealth!,{canonical:initial,flick});s.typing(true);s.escape();
  expect(s.events().find(e=>e.type==='damaged')).toMatchObject({data:{health:initial-1000,lethal:dead,sourceHealth:{canonical:initial-1000,flick}}});
  expect(s.victim.actor.alive).toBe(!dead);expect(s.victim.actor.transform.typing).toBe(true);
 });
 it('surviving requests retain typing and apply separate uncapped1000 mutations',()=>{
  const s=setup('barrack');s.victim.actor.health=2500;s.victim.actor.sourceHealth!.canonical=2500;s.typing(true);s.escape();s.escape();
  expect(s.victim.actor).toMatchObject({alive:true,health:500,transform:{typing:true}});expect(s.events().filter(e=>e.type==='damaged').map(e=>e.type==='damaged'&&e.data.health)).toEqual([1500,500]);
  expect(s.room.getSnapshot().drops).toHaveLength(0);
 });
 it('advances ordinary health callback phase before serializing surviving damage epoch',()=>{
  const s=setup('woodlands');s.victim.actor.health=2000;s.victim.actor.sourceHealth!.canonical=2000;
  s.room.handleMessage(s.victim.actor.id,{type:'source_escape'},1000/30,s.victim.peer);
  expect(s.events().find(e=>e.type==='damaged')).toMatchObject({serverTime:1000/30,data:{health:1000,lethal:false,sourceHealthTime:1000/30,sourceHealth:{canonical:1000,flick:-2}}});
 });
 it('requires negotiated current-generation view receipts before accepting Escape',()=>{
  const s=setup(),viewer=s.join('Viewer',true);
  s.room.handleMessage(viewer.actor.id,{type:'source_escape'},0,viewer.peer);
  expect(viewer.actor.alive).toBe(true);expect(viewer.peer.messages.some(m=>m.type==='error'&&m.code==='invalid_source_view')).toBe(true);
  expect(s.events().some(e=>e.type==='killed'&&e.data.victimId===viewer.actor.id)).toBe(false);
  const resumed=new Peer(),welcome=viewer.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
  expect(s.room.join(resumed,'Viewer',0,welcome.resumeToken,true).ok).toBe(true);
  s.room.handleMessage(viewer.actor.id,{type:'source_escape',sourceRemoteView:{generation:viewer.actor.sourceViewGeneration,callbacks:0,receipts:[{tick:0,callbacks:0}]}},0,resumed);
  expect(viewer.actor.alive).toBe(false);
 });
 it('direct Barrack walking dies even above1000 without fabricated damage',()=>{
  const s=setup();s.victim.actor.health=2500;s.victim.actor.sourceHealth!.canonical=2500;s.escape();
  expect(s.victim.actor.alive).toBe(false);expect(s.events().some(e=>e.type==='damaged')).toBe(false);
 });
 it('current peer, alive authority and source map are required and client authority fields are rejected',()=>{
  const s=setup();s.escape(new Peer());expect(s.victim.actor.alive).toBe(true);
  s.escape(s.victim.peer,{type:'source_escape',direct:true,damage:0,targetId:'p2'} as unknown as ClientMessage);expect(s.victim.actor.alive).toBe(true);
  expect(s.victim.peer.messages.at(-1)).toMatchObject({type:'error',code:'invalid_source_escape'});
  const winter=setup('barrack',false);winter.escape();expect(winter.victim.actor.alive).toBe(true);expect(winter.victim.peer.messages.at(-1)).toMatchObject({type:'error',code:'invalid_source_escape'});
 });
 it('duplicates and queued movement cannot produce another death/drop; reload cancellation is delivered after killed',()=>{
  const s=setup(),observer=s.join('Observer');s.victim.actor.reloadWeapon='rifle';s.victim.actor.reloadCompleteAt=100000;
  (s.room as unknown as {sendSourceViewMessage(p:Actor,m:ServerMessage):void}).sendSourceViewMessage(observer.actor,{type:'snapshot',snapshot:s.room.getSnapshot(0)});
  const yaw=vi.spyOn(Math,'random').mockReturnValue(.5);try{s.escape();}finally{yaw.mockRestore();}
  const position={...s.victim.actor.transform.position};s.escape();s.typing(true);
  const snapshot=s.room.getSnapshot(),drop=[...observer.actor.sourceTimeoutDrops.values()][0];expect(snapshot.drops).toEqual([]);expect(observer.actor.sourceTimeoutDrops.size).toBe(1);expect(s.victim.actor.sourceTimeoutDrops.size).toBe(0);expect(s.victim.actor.deaths).toBe(1);expect(s.victim.actor.transform.position).toEqual(position);
  expect(drop).toMatchObject({weapon:s.victim.actor.transform.weapon,expiresAt:null,yaw:190*Math.PI/180,position:{x:position.x,z:position.z}});
  // Primary baddies uses eye minus half of GI sphere radius times scale.
  expect(drop.position.y).toBeCloseTo(position.y+s.runtime.profile.eyeHeight-1726.8026123046875*.045*.75/2*s.runtime.scale);
  expect(s.victim.actor).toMatchObject({reloadWeapon:null,reloadCompleteAt:null});
  const killed=s.victim.peer.messages.findIndex(m=>m.type==='event'&&m.event.type==='killed');expect(s.victim.peer.messages[killed+1]).toMatchObject({type:'loadout',reload:null});
  // Death/pickup lifetime scope, not a hundred-second physics replay. Keep
  // the virtual timestamp and existing deadline while isolating world catch-up.
  const world=vi.spyOn(s.room as unknown as {updateSourceWorld(now:number):void},'updateSourceWorld').mockImplementation(()=>{});
  try{s.room.tick(100000);expect(s.room.getSnapshot().drops).toEqual([]);expect(observer.actor.sourceTimeoutDrops.get(drop.id)).toEqual(drop);expect(s.victim.actor.alive).toBe(false);}finally{world.mockRestore();}
 });
 it.each(['Cowardice','cowardice','COWARDICE','cOwArDiCe'])('awards source30 to a distinct live actor named %s using ASCII Lingo comparison',name=>{
  const s=setup('woodlands'),other=s.join(name);s.escape();expect(other.actor).toMatchObject({frags:1,score:30});
  expect(s.events().find(e=>e.type==='damaged')).toMatchObject({data:{attackerId:other.actor.id,source:{attackerId:other.actor.id}}});
  const self=setup();self.room.leave(self.victim.actor.id,0,self.victim.peer);const named=self.join(name);self.room.handleMessage(named.actor.id,{type:'source_escape'},0,named.peer);expect(named.actor).toMatchObject({frags:0,score:0});
 });
 it('keeps dead and detached name matches outside current live authority eligibility',()=>{
  const dead=setup(),deadNamed=dead.join('COWARDICE');dead.room.handleMessage(deadNamed.actor.id,{type:'source_escape'},0,deadNamed.peer);dead.escape();expect(deadNamed.actor.score).toBe(0);
  expect(dead.events().filter(e=>e.type==='killed').at(-1)).toMatchObject({data:{source:{attackerId:null}}});
  const suspended=setup(),detached=suspended.join('cowardice');suspended.room.suspend(detached.actor.id,0,detached.peer);suspended.escape();expect(detached.actor.score).toBe(0);
  expect(suspended.events().find(e=>e.type==='killed')).toMatchObject({data:{source:{attackerId:null}}});
 });
 it('prioritizes own case-equivalent name over an earlier joined matching remote',()=>{
  const s=setup('woodlands');s.room.leave(s.victim.actor.id,0,s.victim.peer);
  const earlier=s.join('Cowardice'),self=s.join('COWARDICE');
  s.room.handleMessage(self.actor.id,{type:'source_escape'},0,self.peer);
  expect(s.events(self.peer).find(e=>e.type==='damaged')).toMatchObject({data:{attackerId:self.actor.id,source:{attackerId:self.actor.id}}});
  expect(s.events(self.peer).find(e=>e.type==='killed')).toMatchObject({data:{killerId:self.actor.id,source:{attackerId:self.actor.id}}});
  expect(self.actor).toMatchObject({frags:0,score:0});expect(earlier.actor).toMatchObject({frags:0,score:0});
 });
 it('killed reaches negotiated observer before leave and its next callback removes the pending death actor',()=>{
  const s=setup(),observer=s.join('Observer',true);s.escape();
  const killed=observer.peer.messages.find(m=>m.type==='event'&&m.event.type==='killed');expect(killed).toMatchObject({sourceViewTick:1,sourceViewSentAt:0});
  const mirror=observer.actor.sourceRemoteView!;
  s.room.handleMessage(observer.actor.id,{type:'transform',sequence:1,clientTime:0,transform:{...observer.actor.transform},sourceRemoteView:{generation:observer.actor.sourceViewGeneration,callbacks:0,receipts:[{tick:0,callbacks:0},{tick:1,callbacks:0}]}},0,observer.peer);
  expect(observer.peer.messages.some(m=>m.type==='error'&&m.code==='invalid_source_view')).toBe(false);
  expect(mirror.freeze().find(p=>p.id===s.victim.actor.id)).toMatchObject({alive:false,motionTime:0});expect(observer.actor.sourceTimeoutDrops.size).toBe(0);
  s.room.leave(s.victim.actor.id,0,s.victim.peer);expect(s.events(observer.peer).filter(e=>e.type==='killed'||e.type==='leave').map(e=>e.type)).toEqual(['killed','leave']);
  expect(mirror.freeze().find(p=>p.id===s.victim.actor.id)).toMatchObject({alive:false,motionTime:0});
  s.room.handleMessage(observer.actor.id,{type:'transform',sequence:2,clientTime:34,transform:{...observer.actor.transform},sourceRemoteView:{generation:observer.actor.sourceViewGeneration,callbacks:1,receipts:[]}},34,observer.peer);
  expect(observer.peer.messages.some(m=>m.type==='error'&&m.code==='invalid_source_view')).toBe(false);expect(mirror.freeze().find(p=>p.id===s.victim.actor.id)).toBeUndefined();expect(observer.actor.sourceTimeoutDrops.size).toBe(1);expect(s.room.getSnapshot(34).drops).toEqual([]);
 });
 it('dead resume stays dead while explicit leave and fresh join creates a new life',()=>{
  const s=setup();const welcome=s.victim.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');s.escape();s.room.suspend(s.victim.actor.id,0,s.victim.peer);
  const resumedPeer=new Peer(),resumed=s.room.join(resumedPeer,'Victim',0,welcome.resumeToken);expect(resumed).toMatchObject({ok:true,player:{alive:false,health:0,deaths:1}});
  s.room.leave(s.victim.actor.id,0,resumedPeer);const fresh=s.join('Victim');expect(fresh.actor).toMatchObject({alive:true,health:100,deaths:0});expect(fresh.actor.id).not.toBe(s.victim.actor.id);
 });
});
