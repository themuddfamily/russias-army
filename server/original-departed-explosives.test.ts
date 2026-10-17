import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {MessagePeer,ServerMessage,MatchEvent,PlayerTransform,ProjectileSnapshot,Vec3} from './protocol';
import type {OriginalPlayerBody} from '../shared/originalPlayerPhysics';
import type {OriginalProjectileState} from '../shared/originalExplosives';
import type {OriginalPlayerHealthState,WeaponDropSnapshot} from '../shared/protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
interface Actor {sourceWorld:{body:OriginalPlayerBody;projectiles:Map<string,Active>;blasts:Map<string,unknown>}|null;id:string;name:string;peer:MessagePeer|null;alive:boolean;health:number;sourceHealth:OriginalPlayerHealthState|null;frags:number;score:number;deaths:number;transform:PlayerTransform;reloadWeapon:string|null;reloadCompleteAt:number|null;authorizedBoost:unknown;resumeExpiresAt:number|null;sourceTimeoutDrops:Map<string,WeaponDropSnapshot>}
interface Active {snapshot:ProjectileSnapshot;source:OriginalProjectileState;rg6JumpEligible:boolean;sourceLaunchName?:string;sourceReceivers?:Set<Actor>}
interface Review {players:Map<string,Actor>;projectiles:Map<string,Active>;detonate(active:Active,time:number):void;detonateSourceFor(player:Actor,active:Active,time:number):void;stepSourceObserverBlasts(player:Actor,time:number):void;installSourceFixtureActor(active:Active,viewers?:readonly string[]):void;expireSuspendedPlayers(time:number):void;sendSourceViewMessage(p:Actor,m:ServerMessage):void}
function setup(map:'barrack'|'woodlands',weapon:'launcher'|'rpg',winter=false){
 let seq=0;const runtime=getOriginalMapRuntime(map),room=new MatchRoom('departed',{map,spawnPoints:[winter?{x:40,y:0,z:30}:runtime.spawnPoints[0]],now:()=>0,idFactory:()=>`p${++seq}`,...(winter?{collisionProfile:'winter' as const}:{})});
 const review=room as unknown as Review;
 const join=(name:string,time=0)=>{const peer=new Peer(),result=room.join(peer,name,time);if(!result.ok)throw Error(result.message);return {peer,actor:review.players.get(result.player.id)!};};
 const owner=join('Launcher'),victim=join('Victim');if(winter)victim.actor.transform.position.x-=10;
 const eye=(actor:Actor):Vec3=>({...actor.transform.position,y:actor.transform.position.y+(winter?1.55:runtime.profile.eyeHeight)});
 room.handleMessage(owner.actor.id,{type:'transform',sequence:1,clientTime:1000,transform:{...owner.actor.transform,weapon}},1000,owner.peer);
 room.handleMessage(owner.actor.id,{type:'shoot',shot:{shotId:'accepted',weapon,origin:eye(owner.actor),direction:{x:0,y:1,z:0}}},1100,owner.peer);
 const launch=[...review.projectiles.values()][0],active=winter?launch:victim.actor.sourceWorld?.projectiles.get(launch?.snapshot.projectileId);if(!active)throw Error('accepted projectile missing '+JSON.stringify(owner.peer.messages.filter(m=>m.type==='error')));
 const events=(type:string):MatchEvent[]=>victim.peer.messages.flatMap(m=>m.type==='event'&&m.event.type===type?[m.event]:[]);
 const detonate=()=>{active.snapshot.position=eye(victim.actor);if(winter)review.detonate(active,1100);else review.detonateSourceFor(victim.actor,active,1100);};
 const callbacks=(from:number,to:number)=>{for(let n=from;n<=to;n++)review.stepSourceObserverBlasts(victim.actor,1100+n*1000/30);};
 const health=(value:number)=>{victim.actor.health=value;victim.actor.sourceHealth!.canonical=value;victim.actor.sourceHealth!.flick=2;};
 return {room,review,owner,victim,join,active,launch,events,detonate,callbacks,health};
}
const matrix=(['barrack','woodlands'] as const).flatMap(map=>(['launcher','rpg'] as const).flatMap(weapon=>(['leave','suspend'] as const).map(departure=>({map,weapon,departure}))));
describe('source explosives retain immutable attribution after owner departure',()=>{
 it.each(matrix)('$map $weapon survives $departure before real fuse detonation',({map,weapon,departure})=>{
  const s=setup(map,weapon);expect(s.events('projectile_spawned')[0]).toMatchObject({data:{projectile:{attackerId:s.owner.actor.id,attackerName:'Launcher'}}});expect(s.room.getSnapshotFor(s.victim.actor.id,1100).projectiles[0]).toMatchObject({attackerId:s.owner.actor.id,attackerName:'Launcher'});s.room[departure](s.owner.actor.id,1100,s.owner.peer);
  expect(s.room.getSnapshotFor(s.victim.actor.id).projectiles).toHaveLength(1);expect(s.active.snapshot).toMatchObject({attackerId:s.owner.actor.id,attackerName:'Launcher'});
  s.owner.actor.name='MUTATED REMOVED OBJECT';
  s.room.tick(1100+(weapon==='launcher'?59:200)*1000/30);
  expect(s.events('explosion')).toHaveLength(1);expect(s.events('explosion')[0]).toMatchObject({data:{attackerId:s.owner.actor.id,attackerName:'Launcher'}});
  expect(s.room.getSnapshotFor(s.victim.actor.id).projectiles).toHaveLength(0);
  s.room.tick(1100+((weapon==='launcher'?59:200)+16)*1000/30);
  expect(s.room.getSnapshotFor(s.victim.actor.id).blasts).toHaveLength(0);expect(s.events('explosion')).toHaveLength(1);
 });
 it.each(matrix)('$map $weapon continues all16 five-damage callbacks across $departure during blast',({map,weapon,departure})=>{
  const s=setup(map,weapon);s.detonate();s.callbacks(1,4);s.room[departure](s.owner.actor.id,1100+4*1000/30,s.owner.peer);s.callbacks(5,16);
  expect(s.victim.actor.health).toBe(20);expect(s.owner.actor.health).toBe(100);expect(s.events('damaged').filter(e=>e.type==='damaged'&&e.data.targetId===s.victim.actor.id)).toHaveLength(16);
  for(const event of s.events('damaged').filter(e=>e.type==='damaged'&&e.data.targetId===s.victim.actor.id))expect(event).toMatchObject({data:{attackerId:s.owner.actor.id,damage:5,source:{attackerName:'Launcher',kind:'explosion'}}});
  expect(s.room.getSnapshotFor(s.victim.actor.id).blasts).toHaveLength(0);s.callbacks(17,20);expect(s.events('damaged').filter(e=>e.type==='damaged'&&e.data.targetId===s.victim.actor.id)).toHaveLength(16);
 });
 it.each(matrix)('$map $weapon lethal callback after $departure gives one persistent drop and no invented owner/victim score',({map,weapon,departure})=>{
  const s=setup(map,weapon),observer=s.join('Observer',1100);s.health(10);s.victim.actor.reloadWeapon='rifle';s.victim.actor.reloadCompleteAt=99999;s.victim.actor.authorizedBoost={velocityY:99};s.review.sendSourceViewMessage(observer.actor,{type:'snapshot',snapshot:s.room.getSnapshotFor(s.victim.actor.id,1100)});s.detonate();s.callbacks(1,1);s.room[departure](s.owner.actor.id,1100+1000/30,s.owner.peer);s.callbacks(2,16);
  expect(s.events('killed')).toHaveLength(1);expect(s.events('killed')[0]).toMatchObject({data:{killerId:s.owner.actor.id,victimId:s.victim.actor.id,source:{attackerName:'Launcher'},sourceScoreRecipients:[]}});
  expect(s.victim.actor).toMatchObject({alive:false,health:0,deaths:1,score:0,frags:0,reloadWeapon:null,reloadCompleteAt:null,authorizedBoost:null});expect(s.owner.actor.score).toBe(0);
  expect(s.room.getSnapshotFor(s.victim.actor.id).drops).toEqual([]);expect(observer.actor.sourceTimeoutDrops.size).toBe(1);expect([...observer.actor.sourceTimeoutDrops.values()][0].expiresAt).toBeNull();expect(s.victim.actor.sourceTimeoutDrops.size).toBe(0);expect(observer.actor.alive).toBe(true);
 });
 it.each(['leave','suspend','dead'] as const)('fresh same-name receivers get score while %s original owner does not',departure=>{
  const s=setup('woodlands','launcher');s.detonate();s.health(0);
  if(departure==='dead')s.room.handleMessage(s.owner.actor.id,{type:'source_escape'},1100,s.owner.peer);else s.room[departure](s.owner.actor.id,1100,s.owner.peer);
  const fresh=s.join('lAuNcHeR',1100),duplicate=s.join('LAUNCHER',1100);s.callbacks(1,1);
  expect(s.owner.actor.score).toBe(0);expect(fresh.actor).toMatchObject({score:30,frags:1});expect(duplicate.actor).toMatchObject({score:30,frags:1});
  expect(s.events('killed').at(-1)).toMatchObject({data:{killerId:s.owner.actor.id,sourceScoreRecipients:[{playerId:fresh.actor.id,frags:1,score:30},{playerId:duplicate.actor.id,frags:1,score:30}]}});
 });
 it('current living owner receives30 but sender-name duplicates exclude every own-message recipient',()=>{
  const s=setup('barrack','rpg');s.detonate();s.health(0);s.callbacks(1,1);expect(s.owner.actor).toMatchObject({score:30,frags:1});
  const own=setup('woodlands','rpg');own.victim.actor.name='LAUNCHER';const duplicate=own.join('launcher');own.detonate();own.health(0);own.callbacks(1,1);expect(own.owner.actor.score).toBe(0);expect(duplicate.actor.score).toBe(0);expect(own.events('killed')[0]).toMatchObject({data:{sourceScoreRecipients:[]}});
 });
 it('expiry removes suspended session without removing its still-active blast',()=>{
  const s=setup('woodlands','rpg');s.detonate();s.room.suspend(s.owner.actor.id,1100,s.owner.peer);s.owner.actor.resumeExpiresAt=1101;s.review.expireSuspendedPlayers(1101);expect(s.review.players.has(s.owner.actor.id)).toBe(false);s.callbacks(1,16);expect(s.victim.actor.health).toBe(20);
 });
 it('dead owner reconnect stays dead; fresh life does not inherit accepted old projectile or movement authorization',()=>{
  const s=setup('barrack','launcher');s.room.handleMessage(s.owner.actor.id,{type:'source_escape'},1100,s.owner.peer);expect(s.active.rg6JumpEligible).toBe(false);const welcome=s.owner.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');s.room.suspend(s.owner.actor.id,1100,s.owner.peer);const resumed=new Peer();expect(s.room.join(resumed,'Launcher',1100,welcome.resumeToken)).toMatchObject({ok:true,player:{alive:false}});s.room.leave(s.owner.actor.id,1100,resumed);const fresh=s.join('Launcher',1100);expect(fresh.actor.authorizedBoost).toBeNull();expect(s.active.snapshot.attackerId).toBe(s.owner.actor.id);expect(s.active.snapshot.attackerId).not.toBe(fresh.actor.id);
  s.room.handleMessage(s.owner.actor.id,{type:'shoot',shot:{shotId:'accepted',weapon:'launcher',origin:s.active.snapshot.position,direction:{x:0,y:1,z:0}}},1100,s.owner.peer);expect(s.events('projectile_spawned')).toHaveLength(1);
 });
 it('resuming a living owner preserves one old projectile and restored live score eligibility',()=>{
  const s=setup('woodlands','rpg'),welcome=s.owner.peer.messages.find(m=>m.type==='welcome');if(welcome?.type!=='welcome')throw Error('welcome');
  s.room.suspend(s.owner.actor.id,1100,s.owner.peer);const resumed=new Peer();expect(s.room.join(resumed,'Launcher',1100,welcome.resumeToken)).toMatchObject({ok:true,player:{id:s.owner.actor.id,alive:true}});
  expect(s.room.getSnapshotFor(s.victim.actor.id).projectiles).toHaveLength(1);s.detonate();s.health(0);s.callbacks(1,1);expect(s.owner.actor.score).toBe(30);expect(s.events('explosion')).toHaveLength(1);expect(s.events('killed')).toHaveLength(1);
 });
 it('serializes lethal damage then death before victim leave without another drop',()=>{
  const s=setup('woodlands','launcher'),observer=s.join('Observer',1100);s.room.leave(s.owner.actor.id,1100,s.owner.peer);s.detonate();s.health(0);s.review.sendSourceViewMessage(observer.actor,{type:'snapshot',snapshot:s.room.getSnapshotFor(s.victim.actor.id,1100)});s.callbacks(1,1);const drop=[...observer.actor.sourceTimeoutDrops.values()][0];s.room.leave(s.victim.actor.id,1100+1000/30,s.victim.peer);
  const sequence=s.victim.peer.messages.flatMap(m=>m.type==='event'?[m.event.type]:[]);expect(sequence.indexOf('damaged')).toBeLessThan(sequence.indexOf('killed'));expect(s.room.getSnapshotFor(s.victim.actor.id).drops).toEqual([]);expect(observer.actor.sourceTimeoutDrops.size).toBe(1);expect(observer.actor.sourceTimeoutDrops.get(drop.id)).toEqual(drop);
 });
 it('catalog metadata mutation does not change an already received private attribution',()=>{
  const s=setup('woodlands','launcher');delete s.launch.snapshot.attackerName;
  expect(s.active.snapshot.attackerName).toBe('Launcher');
  expect(s.room.getSnapshotFor(s.victim.actor.id,1100).projectiles[0].attackerName).toBe('Launcher');
  s.room.leave(s.owner.actor.id,1100,s.owner.peer);s.detonate();
  expect(s.events('explosion')[0]).toMatchObject({data:{attackerName:'Launcher'}});
 });
 it('legacy optional attribution omits unknown names on snapshot, explosion and damage',()=>{
  const s=setup('woodlands','launcher');delete s.active.snapshot.attackerName;delete s.active.sourceLaunchName;delete s.active.sourceReceivers;s.review.installSourceFixtureActor(s.active,[s.victim.actor.id]);s.room.leave(s.owner.actor.id,1100,s.owner.peer);
  expect(s.room.getSnapshotFor(s.victim.actor.id,1100).projectiles[0]).not.toHaveProperty('attackerName');s.detonate();
  const explosion=s.events('explosion')[0];if(explosion.type!=='explosion')throw Error('explosion');expect(explosion.data).not.toHaveProperty('attackerName');
  expect(s.room.getSnapshotFor(s.victim.actor.id,1100).blasts![0]).not.toHaveProperty('attackerName');s.health(0);s.callbacks(1,1);
  const damage=s.events('damaged')[0];if(damage.type!=='damaged')throw Error('damaged');expect(damage.data.source).not.toHaveProperty('attackerName');
  const killed=s.events('killed')[0];if(killed.type!=='killed')throw Error('killed');expect(killed.data.source).not.toHaveProperty('attackerName');expect(killed.data.killerId).toBe(s.owner.actor.id);expect(killed.data.sourceScoreRecipients).toEqual([]);
 });
 it.each(['leave','suspend'] as const)('authored Winter still cancels in-flight projectiles on %s',departure=>{
  const s=setup('barrack','launcher',true);s.room[departure](s.owner.actor.id,1100,s.owner.peer);expect(s.room.getSnapshotFor(s.victim.actor.id).projectiles).toHaveLength(0);
 });
});
