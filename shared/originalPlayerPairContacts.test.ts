import {describe,expect,it} from 'vitest';
import {createOriginalProjectile,type OriginalProjectileContact} from './originalExplosives';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_RADIUS as R,type OriginalPhysicsEnvironment,type OriginalPhysicsContactDiagnostic,type OriginalMovableBody} from './originalPlayerPhysics';
import type {Vec3} from './protocol';

const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
const empty:OriginalPhysicsEnvironment={sweep:()=>null,sweepConvex:()=>null};
const player=(id:string,position:Vec3,velocity=at())=>({...createOriginalPlayerBody(id,at()),position:{...position},velocity:{...velocity}});
const playerPair=(event:OriginalPhysicsContactDiagnostic)=>event.bodyA.type==='player'&&event.bodyB.type==='player';

// These tests cover the shared solver's pair policy. They do not reconstruct
// separate observer worlds or certify the native Havok response.
describe('source observer player sphere pair policy',()=>{
 it('retains generic player-pair momentum exchange when the policy is omitted or true',()=>{
  for(const playerPairContacts of [undefined,true]){
   const a=player('a',at(),at(30)),b=player('b',at(2*R+.1),at(-30)),events:OriginalPhysicsContactDiagnostic[]=[];
   const result=stepOriginalPhysicsWorld([a,b],[],{...empty,playerPairContacts,onResolvedContact:event=>events.push(event)});
   expect(result.kind).toBe('complete');expect(events.some(playerPair)).toBe(true);
   expect(a.velocity.x).toBeCloseTo(-3);expect(b.velocity.x).toBeCloseTo(3);
   expect(a.velocity.x+b.velocity.x).toBeCloseTo(0);
   expect(a.position.x).toBeLessThan(b.position.x);
  }
 });

 it('allows overlapping paths to cross without response, notification or support from the other player',()=>{
  const a=player('a',at(),at(30)),b=player('b',at(2*R+.1),at(-30)),events:OriginalPhysicsContactDiagnostic[]=[],notifications:string[]=[];
  const result=stepOriginalPhysicsWorld([a,b],[],{...empty,playerPairContacts:false,onResolvedContact:event=>events.push(event),onPlayerContact:p=>notifications.push(p.id)});
  expect(result.kind).toBe('complete');expect(result.contacts).toBe(0);
  expect(a.position.x).toBeCloseTo(1.5);expect(b.position.x).toBeCloseTo(2*R+.1-1.5);
  expect(a.position.x).toBeGreaterThan(b.position.x);
  expect(a.velocity.x).toBe(30);expect(b.velocity.x).toBe(-30);
  expect(events).toEqual([]);expect(notifications).toEqual([]);
  expect(a.supported).toBe(false);expect(b.supported).toBe(false);
 });

 it('does not let a stationary touching player serve as a support surface',()=>{
  const lower=player('lower',at()),upper=player('upper',at(0,2*R));
  const result=stepOriginalPhysicsWorld([lower,upper],[],{...empty,playerPairContacts:false});
  expect(result.contacts).toBe(0);expect(upper.supported).toBe(false);
  expect(upper.position.y-lower.position.y).toBeCloseTo(2*R);
  const genericLower=player('lower',at()),genericUpper=player('upper',at(0,2*R));
  stepOriginalPhysicsWorld([genericLower,genericUpper],[],empty);
  expect(genericUpper.supported).toBe(true);
 });

 it('retains fixed floor support and collision callbacks with player pairs disabled',()=>{
  const bodies=[player('a',at(0,R)),player('b',at(10,R))],notifications:string[]=[],events:OriginalPhysicsContactDiagnostic[]=[];
  const result=stepOriginalPhysicsWorld(bodies,[],{playerPairContacts:false,sweep:(from,to,radius)=>{
   if(to.y>=radius)return null;
   const fraction=from.y>radius?(from.y-radius)/(from.y-to.y):0;
   return {fraction,position:at(from.x+(to.x-from.x)*fraction,radius,from.z),normal:at(0,1)};
  },onPlayerContact:p=>notifications.push(p.id),onResolvedContact:event=>events.push(event)});
  expect(result.kind).toBe('complete');expect(result.contacts).toBeGreaterThan(0);
  expect(new Set(notifications)).toEqual(new Set(['a','b']));
  expect(events.every(event=>event.bodyB.type==='fixed')).toBe(true);
  for(const body of bodies){expect(body.supported).toBe(true);expect(body.position.y).toBeGreaterThanOrEqual(R);}
 });

 it('retains player-projectile momentum exchange and grenade damping',()=>{
  const run=(playerPairContacts:boolean)=>{
  const p=player('p',at(),at(10)),remote=player('remote',at(100));
  const grenade=createOriginalProjectile('launcher',at(),at(-1),'launcher');
  const extent=-Math.min(...grenade.convex!.vertices.map(v=>v.x));
  // Place impact within a substep, not at the .005s floating boundary.
  grenade.position=at(R+extent+.05);grenade.velocity=at(-10);
  const events:OriginalPhysicsContactDiagnostic[]=[],notifications:string[]=[];
  const result=stepOriginalPhysicsWorld([p,remote],[grenade],{...empty,playerPairContacts,onPlayerContact:(body,_normal,other)=>notifications.push(`${body.id}:${other}`),onResolvedContact:event=>events.push(event)});
   return {p,remote,grenade,events,notifications,result};
  };
  const disabled=run(false),generic=run(true);
  expect(disabled).toEqual(generic);
  const {p,remote,grenade,events,notifications,result}=disabled;
  expect(result.kind).toBe('complete');expect(result.contacts).toBe(1);
  expect(p.velocity.x).toBeCloseTo(-1);expect(grenade.velocity.x).toBeCloseTo(.85);
  expect(events[0].bodyA.type).toBe('player');expect(events[0].bodyB.type).toBe('launcher');
  expect(notifications).toEqual(['p:projectile:0']);expect(remote.velocity.x).toBe(0);
 });

 it('retains player contacts with a movable convex scene body',()=>{
  const run=(playerPairContacts:boolean)=>{
  const q=.2,box:OriginalMovableBody={id:'box',position:at(R+q+.05),velocity:at(-10),radius:Math.sqrt(3)*q,mass:1,restitution:.2,friction:0,convex:{
   vertices:[at(-q,-q,-q),at(q,-q,-q),at(-q,q,-q),at(q,q,-q),at(-q,-q,q),at(q,-q,q),at(-q,q,q),at(q,q,q)],
   faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],
   faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]],
  }};
  const p=player('p',at(),at(10)),remote=player('remote',at(100)),events:OriginalPhysicsContactDiagnostic[]=[],notifications:string[]=[];
  const result=stepOriginalPhysicsWorld([p,remote],[],{...empty,playerPairContacts,movableBodies:[box],onMovableContact:(_body,_normal,other)=>notifications.push(other!),onResolvedContact:event=>events.push(event)});
   return {p,remote,box,events,notifications,result};
  };
  const disabled=run(false),generic=run(true);
  expect(disabled).toEqual(generic);
  const {p,remote,box,events,notifications,result}=disabled;
  expect(result.kind).toBe('complete');expect(result.contacts).toBe(1);
  expect(p.velocity.x).toBeCloseTo(-1);expect(box.velocity.x).toBeCloseTo(1);
  expect(events[0].bodyA.type).toBe('player');expect(events[0].bodyB.type).toBe('movable');
  expect(notifications).toEqual(['p']);expect(remote.velocity.x).toBe(0);
 });

 it('excludes player-pair rows when a separate angular body triggers a coupled contact island',()=>{
  const run=(playerPairContacts:boolean)=>{
   const a=player('a',at(),at(10)),b=player('b',at(2*R),at(-10));
   const grenade=createOriginalProjectile('launcher',at(100),at(1),'launcher');grenade.position=at(100);grenade.velocity=at();
   // A synthetic stationary plane isolates island membership from scene data.
   // Its witness lies at the grenade pivot, so its response has no spin arm.
   const plane=(position:Vec3):OriginalProjectileContact=>({position:{...position},fraction:0,normal:at(0,1),witnessA:{...position},witnessB:{...position},penetrationDepth:0});
   const events:OriginalPhysicsContactDiagnostic[]=[];
   stepOriginalPhysicsWorld([a,b],[grenade],{...empty,playerPairContacts,
    sweepConvex:from=>from.y<=0?plane(from):null,contactsSphere:()=>[],contactsConvex:position=>position.y<=0?[plane(position)]:[],onResolvedContact:event=>events.push(event)});
   return {a,b,events};
  };
  const disabled=run(false),generic=run(true);
  expect(disabled.events.some(event=>event.island)).toBe(true);
  expect(generic.events.some(event=>event.island&&playerPair(event))).toBe(true);
  expect(disabled.events.some(playerPair)).toBe(false);
  expect(disabled.a.velocity.x).toBe(10);expect(disabled.b.velocity.x).toBe(-10);
  expect(generic.a.velocity.x).toBeLessThan(0);expect(generic.b.velocity.x).toBeGreaterThan(0);
 });
});
