import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {createOriginalProjectile,type OriginalProjectileState} from '../shared/originalExplosives';
import type {ProjectileSnapshot,MessagePeer,ServerMessage} from './protocol';
interface SnapshotAdapter {
 sourceAngularSnapshot(source:OriginalProjectileState):Pick<ProjectileSnapshot,'orientation'|'angularVelocity'>;
 cloneProjectile(snapshot:ProjectileSnapshot):ProjectileSnapshot;
}
describe('source angular snapshot serialization',()=>{
 it.each(['controlled','legacy','fixture'] as const)('refreshes evolving source orientation through the %s server path',path=>{
  const messages:ServerMessage[]=[],peer:MessagePeer={send:message=>messages.push(message)};
  const room=new MatchRoom('angular',{map:'woodlands',spawnPoints:[{x:0,y:100,z:0}],now:()=>0});
  const joined=room.join(peer,'SHOOTER',0);if(!joined.ok)throw Error('join');
  const player=room.getSnapshot(0).players[0];
  room.handleMessage(player.id,{type:'transform',sequence:1,clientTime:1000,transform:{...player.transform,weapon:'launcher',...(path==='controlled'?{sourceInput:{forward:false,backward:false,left:false,right:false,jump:false}}:{})}},1000);
  room.handleMessage(player.id,{type:'shoot',shot:{shotId:'spin',weapon:'launcher',origin:{...player.transform.position,y:player.transform.position.y+1.72},direction:{x:0,y:1,z:0}}},1100);
  const initial=room.getSnapshotFor(player.id,1100).projectiles[0];expect(initial.orientation).toEqual({x:0,y:0,z:0,w:1});expect(initial.angularVelocity).toEqual({x:0,y:0,z:0});
  type Active={source:OriginalProjectileState;snapshot:ProjectileSnapshot;updatedAt:number};
  const internal=room as unknown as {players:Map<string,{sourceWorld:{projectiles:Map<string,Active>}}>};
  let active=internal.players.get(player.id)!.sourceWorld.projectiles.get(initial.projectileId)!;active.source.angular!.angularVelocity={x:0,y:90,z:0};active.source.angular!.orientation={x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2};
  if(path==='fixture'){
   // Explicit historical checkpoint restoration still copies mutable pose.
   room.installSourceFixtureActor({...active,gravity:0,radius:5,damage:5,rg6JumpEligible:false},[player.id]);
   active=internal.players.get(player.id)!.sourceWorld.projectiles.get(initial.projectileId)!;
  }
  room.tick(1100+1000/30);
  const updated=room.getSnapshotFor(player.id,1100+1000/30).projectiles[0];
  expect(updated.orientation).toEqual(active.source.angular!.orientation);expect(updated.angularVelocity).toEqual(active.source.angular!.angularVelocity);expect(updated.orientation!.y).not.toBe(0);
  const retained={...updated.orientation!};active.source.angular!.orientation.y=99;active.source.angular!.angularVelocity.y=99;
  expect(updated.orientation).toEqual(retained);expect(updated.angularVelocity!.y).not.toBe(99);
 });
 it('clones evolving pose independently of immutable source launch rotation',()=>{
  const room=new MatchRoom('angular',{map:'barrack'}) as unknown as SnapshotAdapter;
  const angular={orientation:{x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2},angularVelocity:{x:1,y:2,z:3}};
  const source=createOriginalProjectile('rpg',{x:0,y:100,z:0},{x:0,y:0,z:-1},'owner',{x:0,y:0,z:0});
  // Serialization is independent of how the solver obtains this evolving state.
  Object.assign(source,{angular});
  const payload=room.sourceAngularSnapshot(source);
  const snapshot:ProjectileSnapshot={projectileId:'projectile',shotId:'shot',attackerId:'owner',weapon:'rpg',position:{...source.position},velocity:{...source.velocity},direction:{...source.direction},sourceRotation:{...source.sourceRotation!},expiresAt:1000,...payload};
  const cloned=room.cloneProjectile(snapshot);
  expect(cloned.orientation).toEqual(angular.orientation);expect(cloned.angularVelocity).toEqual(angular.angularVelocity);expect(cloned.sourceRotation).toEqual({x:0,y:0,z:0});
  angular.orientation.w=0;angular.angularVelocity.x=99;
  expect(payload.orientation!.w).toBe(Math.SQRT1_2);expect(payload.angularVelocity!.x).toBe(1);
  snapshot.orientation!.z=0;snapshot.angularVelocity!.y=99;snapshot.sourceRotation!.x=99;
  expect(cloned.orientation!.z).toBe(Math.SQRT1_2);expect(cloned.angularVelocity!.y).toBe(2);expect(cloned.sourceRotation!.x).toBe(0);
 });
 it('preserves optional omission for a legacy source state and an authored snapshot',()=>{
  const room=new MatchRoom('angular',{map:'woodlands'}) as unknown as SnapshotAdapter;
  const source=createOriginalProjectile('launcher',{x:0,y:100,z:0},{x:0,y:1,z:0},'owner');
  // Old state restoration may explicitly omit angular data.
  Reflect.deleteProperty(source,'angular');expect(room.sourceAngularSnapshot(source)).toEqual({});
  const snapshot:ProjectileSnapshot={projectileId:'projectile',shotId:'shot',attackerId:'owner',weapon:'launcher',position:{x:0,y:0,z:0},velocity:{x:1,y:2,z:3},expiresAt:1000};
  expect(room.cloneProjectile(snapshot)).toEqual(snapshot);expect(room.cloneProjectile(snapshot)).not.toHaveProperty('orientation');
 });
});
