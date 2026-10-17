import {afterEach,describe,expect,it,vi} from 'vitest';
import {MatchRoom} from './match-room';
import * as physics from '../shared/originalPlayerPhysics';
import {createOriginalProjectile} from '../shared/originalExplosives';
import type {MessagePeer,ServerMessage} from './protocol';
const shape={faces:[[0,1,2],[1,3,2],[4,6,5],[5,6,7],[0,4,1],[1,4,5],[2,3,6],[3,7,6],[0,2,4],[2,6,4],[1,5,3],[3,5,7]] as [number,number,number][],vertices:[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>({x:x*.1,y:y*.1,z:z*.1})))),faceNormals:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}],edgeDirections:[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}]};
afterEach(()=>vi.restoreAllMocks());
describe('observer server convex/player relative point velocity',()=>{
 it.each([{body:1,point:0,hit:true},{body:1,point:.2,hit:true},{body:-1,point:0,hit:false},{body:.2,point:1,hit:false}])('body $body point $point admits approaching contact=$hit',({body,point,hit})=>{
  const messages:ServerMessage[]=[],peer:MessagePeer={send:message=>messages.push(message)};
  const room=new MatchRoom('relative',{map:'woodlands',spawnPoints:[{x:0,y:100,z:0}],now:()=>0});
  const joined=room.join(peer,'PLAYER',0);if(!joined.ok)throw Error('join');
  const internal=room as unknown as {players:Map<string,{sourceWorld:{body:physics.OriginalPlayerBody;updatedAt:number}}>;sourceHealthUpdatedAt:number|null};
  Object.defineProperty(room,'originalGeometry',{value:{sweepSphere:()=>null,sweepConvex:()=>null,contactsSphere:()=>[],contactsConvex:()=>[]}});
  const world=internal.players.get(joined.player.id)!.sourceWorld;
  world.body.position={x:0,y:100+physics.ORIGINAL_PLAYER_RADIUS,z:0};world.body.velocity={x:body,y:0,z:0};world.updatedAt=0;
  const pivot={x:.55,y:world.body.position.y,z:0},source=createOriginalProjectile('launcher',pivot,{x:0,y:1,z:0},'fixture');
  source.position={...pivot};source.velocity={x:point,y:0,z:0};source.convex=shape;delete source.angular;
  room.installSourceFixtureActor({source,updatedAt:0,gravity:0,radius:5,damage:5,rg6JumpEligible:false,snapshot:{projectileId:'relative',shotId:'relative',attackerId:'fixture',weapon:'launcher',position:{...pivot},velocity:{...source.velocity},expiresAt:2000}},[joined.player.id]);
  const diagnostics:physics.OriginalPhysicsContactDiagnostic[]=[],solve=physics.stepOriginalPhysicsWorld;
  // Observe the real solver; no response or contact query is substituted.
  vi.spyOn(physics,'stepOriginalPhysicsWorld').mockImplementation((players,projectiles,environment)=>solve(players,projectiles,{...environment,onResolvedContact:event=>{diagnostics.push(event);environment.onResolvedContact?.(event);}}));
  internal.sourceHealthUpdatedAt=0;room.tick(1000/30);
  const contacts=messages.filter(message=>message.type==='event'&&message.event.type==='projectile_contact');
  expect(contacts.length>0).toBe(hit);
  if(hit){
   const event=diagnostics.find(event=>event.bodyA.id===joined.player.id||event.bodyB.id===joined.player.id)!;
   expect(event).toBeDefined();expect(event.surfaceWitnesses?.a).toBeDefined();
   const initial=event.bodyA.id===joined.player.id?event.beforeResponse.a:event.beforeResponse.b;
   expect(initial.x).toBe(body);
  }else expect(diagnostics).toEqual([]);
 });
});
