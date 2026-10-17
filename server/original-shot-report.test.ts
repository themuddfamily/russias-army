import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalSceneGeometry,type OriginalSceneNode,type OriginalSceneMesh} from '../shared/originalSceneGeometry';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import {MAX_ORIGINAL_REMOTE_SHOTS} from '../shared/originalRemoteShots';
import type {MessagePeer,ServerMessage,WeaponId,Vec3} from './protocol';

class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
/** An actual scene ray query, deliberately independent of the recovered map's
 * sky/doors/barrels. It proves eligibility in the reconstructed population. */
function syntheticGeometry(name:string){
 const node:OriginalSceneNode={name,resource:'wall',parent:'World',matrix:identity,visibility:1,shader:'default'};
 const mesh:OriginalSceneMesh={resource:'wall',part:0,positions:[[-3,1,100],[3,1,100],[3,1,104],[-3,1,104]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]};
 return createOriginalSceneGeometry({nodes:[node],meshes:[mesh]},{scale:1,cellSize:1});
}
function setup(map:'barrack'|'woodlands'='woodlands',model='floorwall'){
 const room=new MatchRoom('shot-report',{map,now:()=>1100,spawnPoints:[{x:0,y:100,z:0}]}),peer=new Peer(),joined=room.join(peer,'SHOOTER',1100);
 if(!joined.ok)throw Error('join');
 const review=room as any,actor=review.players.get(joined.player.id);
 // Keep actual admission and ray queries, selecting a small trusted scene to
 // make positive and empty populations explicit. No query function is mocked.
 review.original={...review.original,geometry:syntheticGeometry(model)};review.doorWorld=undefined;
 review.barrelWorld.applySnapshots([]);actor.sourceWorld.doors=undefined;actor.sourceWorld.barrels.applySnapshots([]);
 actor.transform.position={x:0,y:100,z:0};
 const fire=(shotId='one',weapon:WeaponId='pistol',direction:Vec3={x:0,y:0,z:-1})=>{
  actor.transform.weapon=weapon;actor.sourceCounter=new OriginalWeaponCounter(map,weapon);actor.sourceCounterUpdatedAt=1100;actor.sourceCounterReady=true;actor.sourceCounterWeapon=weapon;
  room.handleMessage(actor.id,{type:'shoot',shot:{shotId,weapon,origin:{x:0,y:100+getOriginalMapRuntime(map).profile.eyeHeight,z:0},direction}},1100);
 };
 const published=(p:Peer)=>p.messages.filter(m=>m.type==='snapshot').at(-1)!;
 return {room,review,actor,peer,fire,published};
}

describe('trusted reconstructed source where shot report producer',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const [weapon,count] of [['pistol',1],['shotgun',2]] as const)
 it(`${map} ${weapon} publishes positive world-query counts without a hit claim`,()=>{
  const s=setup(map);s.fire('positive',weapon);
  expect(s.actor.pendingShots.has('positive')).toBe(true);expect(s.actor.sourcePendingShots).toBe(count);
  expect(s.peer.messages.some(m=>m.type==='event'&&m.event.type==='shot')).toBe(true);
  const publication=s.room.tick(1100);expect(publication.players.find(p=>p.id===s.actor.id)).toMatchObject({sourceShots:count});
  expect(s.actor.sourcePendingShots).toBe(0);
  expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)?.sourceShots).toBeUndefined();
 });

 it('counts a real nearby model without borrowing the blast ray cutoff',()=>{
  const s=setup();
  const data={nodes:[{name:'near-wall',resource:'wall',parent:'World',matrix:identity,visibility:1,shader:'default'}],
   meshes:[{resource:'wall',part:0,positions:[[-3,.01,100],[3,.01,100],[3,.01,104],[-3,.01,104]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}]};
  s.review.original={...s.review.original,geometry:createOriginalSceneGeometry(data,{scale:1})};
  s.fire('nearby');expect(s.actor.pendingShots.has('nearby')).toBe(true);expect(s.actor.sourcePendingShots).toBe(1);
  expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)?.sourceShots).toBe(1);
 });

 it('an admitted reconstructed empty ray does not report every trigger pull',()=>{
  const s=setup(),ammo=s.actor.ammo.pistol;s.fire('empty','pistol',{x:0,y:1,z:0});
  expect(s.actor.pendingShots.has('empty')).toBe(true);expect(s.actor.ammo.pistol).toBe(ammo-1);
  expect(s.actor.sourcePendingShots).toBe(0);expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)?.sourceShots).toBeUndefined();
 });

 for(const map of ['barrack','woodlands'] as const)it(`${map} excludes outerfencing from the positive bullet population`,()=>{
  const s=setup(map,'outerfencing');s.fire('fence');
  expect(s.actor.pendingShots.has('fence')).toBe(true);expect(s.actor.sourcePendingShots).toBe(0);
  expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)?.sourceShots).toBeUndefined();
 });

 it('duplicate and rejected shots add no reports',()=>{
  const s=setup();s.fire('duplicate');expect(s.actor.sourcePendingShots).toBe(1);
  s.fire('duplicate');expect(s.actor.sourcePendingShots).toBe(1);
  expect(s.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'duplicate_shot'}));
  s.actor.ammo.pistol=0;s.fire('rejected');expect(s.actor.sourcePendingShots).toBe(1);expect(s.actor.pendingShots.has('rejected')).toBe(false);
  expect(s.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'empty_magazine'}));
 });

 it('publishes one captured batch to every viewer and inspector reads do not drain it',()=>{
  const s=setup(),viewers=[new Peer(),new Peer()];
  for(let i=0;i<viewers.length;i++)expect(s.room.join(viewers[i],`VIEWER${i}`,1100).ok).toBe(true);
  s.fire('batch');
  for(let read=0;read<3;read++)expect(s.room.getSnapshot(1100).players.find(p=>p.id===s.actor.id)?.sourceShots).toBeUndefined();
  expect(s.actor.sourcePendingShots).toBe(1);const batch=s.room.tick(1100);
  for(const peer of [s.peer,...viewers]){
   const message=s.published(peer);expect(message.type).toBe('snapshot');
   if(message.type==='snapshot')expect(message.snapshot.players.find(p=>p.id===s.actor.id)).toMatchObject({sourceShots:1});
  }
  expect(batch.players.find(p=>p.id===s.actor.id)?.sourceShots).toBe(1);expect(s.actor.sourcePendingShots).toBe(0);
  expect(s.room.tick(1100).players.every(p=>p.sourceShots===undefined)).toBe(true);
 });

 it('reports aggregate ray count alongside the current publication weapon',()=>{
  const s=setup();s.fire('pistol');s.fire('shotgun','shotgun');expect(s.actor.sourcePendingShots).toBe(3);
  s.actor.transform.weapon='rpg';
  expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)).toMatchObject({sourceShots:3,transform:{weapon:'rpg'}});
 });

 it('suspension clears a pending report before a fresh session',()=>{
  const s=setup();s.fire();expect(s.actor.sourcePendingShots).toBe(1);
  expect(s.room.suspend(s.actor.id,1100,s.peer)).toBe(true);expect(s.actor.sourcePendingShots).toBe(0);
  const peer=new Peer();expect(s.room.join(peer,'SHOOTER',1100,s.actor.resumeToken).ok).toBe(true);
  expect(s.actor.sourcePendingShots).toBe(0);expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)?.sourceShots).toBeUndefined();
 });

 it('a dead publication discards its unconsumed live report',()=>{
  const s=setup();s.fire();s.actor.alive=false;
  expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)?.sourceShots).toBeUndefined();expect(s.actor.sourcePendingShots).toBe(0);
 });

 it('report saturation requires explicit resynchronization rather than truncation',()=>{
  const s=setup();s.actor.sourcePendingShots=MAX_ORIGINAL_REMOTE_SHOTS;s.fire('overflow');
  expect(s.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'source_view_resync_required'}));
  expect(s.actor.peer).toBeNull();expect(s.actor.sourcePendingShots).toBe(0);expect(s.actor.pendingShots.has('overflow')).toBe(false);
 });
});
