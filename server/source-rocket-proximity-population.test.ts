import {afterEach,describe,expect,it,vi} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import * as physics from '../shared/originalPlayerPhysics';
import {createOriginalProjectile,type OriginalProjectileState} from '../shared/originalExplosives';
import type {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import type {OriginalDoorWorld} from '../shared/originalDoorWorld';
import type {MessagePeer,PlayerTransform,ProjectileSnapshot,ServerMessage,Vec3} from './protocol';

class Peer implements MessagePeer {
 messages:ServerMessage[]=[];
 send(message:ServerMessage){this.messages.push(message);}
}
interface Actor {
 id:string;name:string;alive:boolean;peer:MessagePeer|null;transform:PlayerTransform;
 sourceBody:physics.OriginalPlayerBody|null;sourceExplosiveCutoff:number;
 sourceWorld:{body:physics.OriginalPlayerBody;projectiles:Map<string,Active>;barrels:OriginalBarrelWorld;doors?:OriginalDoorWorld;updatedAt:number}|null;
}
interface Active {
 snapshot:ProjectileSnapshot;source:OriginalProjectileState;updatedAt:number;gravity:number;radius:number;damage:number;rg6JumpEligible:boolean;
 sourceLaunchName?:string;sourceBirthSequence?:number;sourceReceivers?:Set<Actor>;
}
interface Inspect {
 players:Map<string,Actor>;projectiles:Map<string,Active>;sourceHealthUpdatedAt:number|null;
 updateSourceWorldImpl(time:number):void;respawn(actor:Actor,time:number):void;
 sendSourceViewMessage(actor:Actor,message:ServerMessage):void;
 installSourceFixtureActor(actor:Active,viewers:readonly string[]):void;
}
type Stage='controlled'|'legacy'|'fixture';
const cases=(['barrack','woodlands'] as const).flatMap(map=>(['controlled','legacy','fixture'] as const).map(stage=>({map,stage})));
const held={forward:false,backward:false,left:false,right:false,jump:false};

/** Real admission establishes launch identity and delivery receipts. Only the
 * physical integration is isolated: this verifies actor proximity population,
 * not a native Havok trajectory. Every case runs the per-world driver; */
function setup(map:'barrack'|'woodlands',stage:Stage){
 let sequence=0;
 const runtime=getOriginalMapRuntime(map);
 const room=new MatchRoom('rocket-population',{map,sessionMode:'round',now:()=>0,idFactory:()=>`actor-${++sequence}`,spawnPoints:[runtime.spawnPoints[0]]});
 const inspect=room as unknown as Inspect;
 const join=(name:string)=>{
  const peer=new Peer(),joined=room.join(peer,name,0);
  if(!joined.ok)throw Error(joined.message);
  return {actor:inspect.players.get(joined.player.id)!,peer};
 };
 const owner=join('Launcher'),duplicate=join('lAuNcHeR'),observer=join('Observer'),remote=join('Remote');
 room.handleMessage(owner.actor.id,{type:'transform',sequence:1,clientTime:1000,transform:{...owner.actor.transform,weapon:'rpg'}},1000,owner.peer);
 const launchEye={...owner.actor.transform.position,y:owner.actor.transform.position.y+runtime.profile.eyeHeight};
 room.handleMessage(owner.actor.id,{type:'shoot',shot:{shotId:'rocket',weapon:'rpg',origin:launchEye,direction:{x:0,y:1,z:0}}},1100,owner.peer);
 const launch=[...inspect.projectiles.values()][0];
 if(!launch?.source)throw Error('Admitted RPG missing');
 if(stage==='controlled')for(const [viewer,transformSequence] of [[owner,2],[observer,1]] as const)
  room.handleMessage(viewer.actor.id,{type:'transform',sequence:transformSequence,clientTime:1100,transform:{...viewer.actor.transform,sourceInput:held,typing:true}},1100,viewer.peer);
 if(stage==='fixture')inspect.installSourceFixtureActor(launch,[owner.actor.id,observer.actor.id]);
 let watched=observer;
 const active=()=>watched.actor.sourceWorld!.projectiles.get(launch.snapshot.projectileId)!;
 // This suite isolates actor-stage proximity: solver calls are counted but
 // integration is suppressed. The separate observer-world suite runs physics.
 const world=vi.spyOn(physics,'stepOriginalPhysicsWorld').mockReturnValue({contacts:0,kind:'complete',requestedTime:.05,advancedTime:.05,remainingTime:0,substeps:[]});
 const center:Vec3={x:100,y:100,z:100};
 for(const viewer of [owner,observer]){
  const actor=viewer.actor.sourceWorld!.projectiles.get(launch.snapshot.projectileId)!;
  actor.source.position={...center};actor.snapshot.position={...center};actor.source.velocity={x:0,y:0,z:0};actor.source.hit=false;
 }
 const setEye=(actor:Actor,eye:Vec3)=>{
  actor.transform.position={...eye,y:eye.y-runtime.profile.eyeHeight};actor.transform.velocity={x:0,y:0,z:0};
  if(actor.sourceWorld){actor.sourceWorld.body=physics.createOriginalPlayerBody(actor.id,eye);if(actor.sourceBody)actor.sourceBody=actor.sourceWorld.body;}
 };
 for(const actor of inspect.players.values()){
  setEye(actor,{x:1000,y:1000,z:1000});
  if(actor.sourceWorld){actor.sourceWorld.updatedAt=1100;actor.sourceWorld.barrels.applySnapshots([]);actor.sourceWorld.doors=undefined;}
 }
 const near=(actor:Actor)=>setEye(actor,center);
 const watch=(viewer:typeof observer)=>{watched=viewer;};
 const step=()=>{
  const actor=active(),before=actor.source.remainingCallbacks;
  // Receipt-bound snapshots seed the actual non-negotiated baddy adapter.
  for(const viewer of [owner,observer])if(inspect.players.has(viewer.actor.id)&&viewer.actor.alive)
   inspect.sendSourceViewMessage(viewer.actor,{type:'snapshot',snapshot:room.getSnapshotFor(viewer.actor.id,1100)});
  inspect.sourceHealthUpdatedAt=1100;world.mockClear();inspect.updateSourceWorldImpl(1100+1000/30);
  expect(world.mock.calls.every(call=>call[0].length===1)).toBe(true);
  expect(actor.source.remainingCallbacks).toBe(before-1);expect(actor.source.hit).toBe(false);
  return !watched.actor.sourceWorld!.projectiles.has(launch.snapshot.projectileId);
 };
 const result={room,inspect,owner,duplicate,observer,remote,launch,near,step,watch};
 return Object.defineProperty(result,'active',{get:active}) as typeof result&{active:Active};
}
afterEach(()=>vi.restoreAllMocks());

describe('source RPG proximity includes source baddies and actor-owning local lives',()=>{
 it.each(cases)('$map $stage launcher skips proximity and does not initialize historical receipts',({map,stage})=>{
  const s=setup(map,stage);
  s.active.source=createOriginalProjectile('launcher',s.active.source.position,{x:0,y:1,z:0},s.owner.actor.id);
  s.active.source.velocity={x:0,y:0,z:0};s.active.snapshot.weapon='launcher';
  delete s.active.sourceReceivers;delete s.active.sourceBirthSequence;
  s.near(s.owner.actor);s.near(s.duplicate.actor);
  expect(s.step()).toBe(false);expect(s.active.source.remainingCallbacks).toBe(59);
  expect(s.active.sourceReceivers).toBeUndefined();
 });
 it.each(cases)('$map $stage ignores equivalent-name remote baddy without a local rocket actor',({map,stage})=>{
  const s=setup(map,stage);s.near(s.duplicate.actor);
  expect(s.launch.sourceReceivers?.has(s.duplicate.actor)).toBe(false);
  expect(s.step()).toBe(false);
 });
 it.each(cases)('$map $stage preserves ordinary distinct-name remote proximity',({map,stage})=>{
  const s=setup(map,stage);s.near(s.remote.actor);expect(s.step()).toBe(true);
 });
 it.each(cases)('$map $stage preserves the launching life local goody proximity',({map,stage})=>{
  const s=setup(map,stage);s.watch(s.owner);s.near(s.owner.actor);expect(s.step()).toBe(true);
 });
 it.each(cases)('$map $stage keeps immutable launchname after launcher rename',({map,stage})=>{
  const s=setup(map,stage);s.owner.actor.name='Changed';s.near(s.duplicate.actor);
  expect(s.active.sourceLaunchName).toBe('Launcher');expect(s.step()).toBe(false);
 });
 it.each(cases)('$map $stage keeps equivalent-name exclusion after launcher departure',({map,stage})=>{
  const s=setup(map,stage);expect(s.room.leave(s.owner.actor.id,1100,s.owner.peer)).toBe(true);
  s.near(s.duplicate.actor);expect(s.step()).toBe(false);
 });
 it.each(cases)('$map $stage retains receiver local goody proximity after equivalent-name rename',({map,stage})=>{
  const s=setup(map,stage);expect(s.launch.sourceReceivers?.has(s.observer.actor)).toBe(true);
  s.observer.actor.name='LAUNCHER';s.near(s.observer.actor);expect(s.step()).toBe(true);
 });
 it.each(cases)('$map $stage existing baddy keeps its received sender name after room metadata rename',({map,stage})=>{
  const s=setup(map,stage);s.duplicate.actor.name='New remote name';s.near(s.duplicate.actor);
  expect(s.launch.sourceReceivers?.has(s.duplicate.actor)).toBe(false);expect(s.step()).toBe(false);
 });
 it.each(cases)('$map $stage excludes the dead launching life',({map,stage})=>{
  const s=setup(map,stage);s.room.handleMessage(s.owner.actor.id,{type:'source_escape'},1100,s.owner.peer);
  expect(s.owner.actor.alive).toBe(false);s.near(s.owner.actor);expect(s.step()).toBe(false);
 });
 it.each(cases)('$map $stage does not grant a new launching-ID life its old local rocket',({map,stage})=>{
  const s=setup(map,stage);s.room.handleMessage(s.owner.actor.id,{type:'source_escape'},1100,s.owner.peer);
  s.inspect.respawn(s.owner.actor,1100);expect(s.owner.actor.alive).toBe(true);
  expect(s.launch.sourceReceivers?.has(s.owner.actor)).toBe(false);
  s.near(s.owner.actor);expect(s.step()).toBe(false);
 });
 it.each(cases)('$map $stage cutoff rejects stale membership for a replacement local life',({map,stage})=>{
  const s=setup(map,stage);s.room.handleMessage(s.owner.actor.id,{type:'source_escape'},1100,s.owner.peer);s.inspect.respawn(s.owner.actor,1100);
  s.launch.sourceReceivers!.add(s.owner.actor);
  expect(s.launch.sourceReceivers?.has(s.owner.actor)).toBe(true);
  expect(s.owner.actor.sourceWorld?.projectiles.has(s.launch.snapshot.projectileId)??false).toBe(false);
  s.near(s.owner.actor);expect(s.step()).toBe(false);
  expect(s.owner.actor.sourceWorld?.projectiles.has(s.launch.snapshot.projectileId)??false).toBe(false);
 });
 it.each(cases)('$map $stage unknown-name historical fixture retains ID-based remote proximity',({map,stage})=>{
  const s=setup(map,stage);
  const checkpoint={...s.active,sourceLaunchName:undefined,sourceReceivers:undefined,sourceBirthSequence:undefined,snapshot:{...s.active.snapshot,attackerName:undefined}};
  s.inspect.installSourceFixtureActor(checkpoint,[s.owner.actor.id,s.observer.actor.id]);
  s.near(s.duplicate.actor);expect(s.step()).toBe(true);
 });
});
