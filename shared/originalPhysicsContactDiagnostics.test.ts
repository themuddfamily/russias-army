import {describe,expect,it} from 'vitest';
import {createOriginalProjectile} from './originalExplosives';
import {createOriginalPlayerBody,ORIGINAL_PLAYER_RADIUS,stepOriginalPhysicsWorld} from './originalPlayerPhysics';
import type {OriginalPhysicsContactDiagnostic,OriginalPhysicsEnvironment} from './originalPlayerPhysics';

const zero={x:0,y:0,z:0};
function movingPair(observer?:OriginalPhysicsEnvironment['onResolvedContact']){
 const player=createOriginalPlayerBody('player',zero,{x:10,y:0,z:0});player.position={...zero};
 const grenade=createOriginalProjectile('launcher',zero,{x:-1,y:0,z:0},'owner');
 const extent=-Math.min(...grenade.convex!.vertices.map(v=>v.x));
 grenade.position={x:ORIGINAL_PLAYER_RADIUS+extent+.08,y:0,z:0};grenade.velocity={x:-10,y:0,z:0};
 const callbacks:unknown[]=[];
 const result=stepOriginalPhysicsWorld([player],[grenade],{
  sweep:()=>null,sweepConvex:()=>null,onResolvedContact:observer,
  onPlayerContact:(p,n,id)=>callbacks.push({kind:'player',id:p.id,normal:{...n},otherId:id,velocity:{...p.velocity}}),
  onProjectileContact:(p,c)=>callbacks.push({kind:'grenade',contact:structuredClone(c),velocity:{...p.velocity}}),
 });
 return {player,grenade,callbacks,result};
}

describe('detached joint physics contact diagnostics',()=>{
 it('records dynamic impact timing and velocities before response, after response and after actor damping',()=>{
  const events:OriginalPhysicsContactDiagnostic[]=[];
  const run=movingPair(event=>events.push(event));
  expect(run.result.contacts).toBe(1);expect(events).toHaveLength(1);
  const event=events[0];
  expect(event.bodyA).toEqual({id:'player',type:'player'});
  expect(event.bodyB).toEqual({id:'projectile:0',type:'launcher'});
  expect(event.substepIndex).toBe(0);expect(event.iteration).toBe(0);
  expect(event.remainingBefore).toBe(.005);expect(event.fraction).toBeCloseTo(.8,8);
  expect(event.time).toBeCloseTo(.004,10);expect(event.substepTime).toBe(event.time);
  expect(event.remainingAfter).toBeCloseTo(.001,10);
  expect(event.normal.x).toBeCloseTo(-1,8);
  // Player is A despite the narrow-phase convex-first query. Surface data must
  // retain event body order, and must not substitute either body's pivot.
  expect(event.surfaceWitnesses).toBeDefined();
  const witnesses=event.surfaceWitnesses!;
  expect(witnesses.a.x).toBeCloseTo(.04+ORIGINAL_PLAYER_RADIUS,8);
  expect(witnesses.b.x).toBeCloseTo(witnesses.a.x,8);
  expect(witnesses.a.y).toBeCloseTo(-400*(1.72/85)*.005*.004,8);

  expect(event.beforeResponse.a.x).toBe(10);expect(event.beforeResponse.b.x).toBe(-10);
  expect(event.afterResponse.a.x).toBeCloseTo(-1,10);expect(event.afterResponse.b.x).toBeCloseTo(1,10);
  expect(event.afterActorCallbacks.a).toEqual(event.afterResponse.a);
  expect(event.afterActorCallbacks.b.x).toBeCloseTo(.85,10);
  expect(event.afterActorCallbacks.b.y).toBeCloseTo(event.afterResponse.b.y*.85,10);
 });

 it('preserves exact state and callback order with or without an observer, even when every diagnostic vector is mutated',()=>{
  const plain=movingPair();
  const observed=movingPair(()=>{});
  const corrupted=movingPair(event=>{
   event.normal.x=123;event.normal.y=456;event.normal.z=789;
   for(const velocities of [event.beforeResponse,event.afterResponse,event.afterActorCallbacks]){
    velocities.a.x=Infinity;velocities.a.y=NaN;velocities.a.z=-Infinity;
    velocities.b.x=NaN;velocities.b.y=Infinity;velocities.b.z=-Infinity;
   }
   if(event.surfaceWitnesses){event.surfaceWitnesses.a.x=Infinity;event.surfaceWitnesses.b.y=NaN;}
   event.bodyA.id='mutated';event.bodyB.type='fixed';event.remainingAfter=999;
  });
  expect(observed).toEqual(plain);expect(corrupted).toEqual(plain);
 });

 it('records fixed-contact depth and physics time across substeps without aliasing geometry contact data',()=>{
  const player=createOriginalPlayerBody('player',zero,{x:-1,y:0,z:0});player.position={...zero};
  const events:OriginalPhysicsContactDiagnostic[]=[];
  let queries=0;const contact={fraction:.25,penetrationDepth:.125,position:{...zero},normal:{x:1,y:0,z:0}};
  stepOriginalPhysicsWorld([player],[],{
   sweep:()=>++queries===2?contact:null,
   onResolvedContact:event=>{events.push(structuredClone(event));event.normal.x=-500;},
  });
  expect(events).toHaveLength(1);expect(events[0].bodyB).toEqual({id:'fixed',type:'fixed'});
  expect(events[0].surfaceWitnesses).toBeUndefined();
  expect(events[0].penetrationDepth).toBe(.125);expect(events[0].substepIndex).toBe(1);
  expect(events[0].time).toBeCloseTo(.00625,14);expect(events[0].substepTime).toBeCloseTo(.00125,14);
  expect(contact.normal).toEqual({x:1,y:0,z:0});
 });
});
