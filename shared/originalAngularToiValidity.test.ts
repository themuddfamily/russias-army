import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import {stepOriginalPhysicsWorld,type OriginalPlayerBody,type OriginalPhysicsContactDiagnostic} from './originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T,createOriginalProjectile,type OriginalProjectileState} from './originalExplosives';
import {createOriginalAngularBody,originalAngularConvex} from './originalAngularBody';
import type {OriginalMovableBody} from './originalPlayerPhysics';
import {sweepOriginalConvexSphere} from './originalConvexContact';
import type {Vec3} from './protocol';

// Immutable full-body seeds captured at the actual first/second birth callbacks.
// The retained capture contains twelve later empty-world callbacks after death;
// these are distinct from the 84 live-player replay seeds.
const fixture=JSON.parse(readFileSync(new URL('../artifacts/fidelity-review/2026-10-02/current/contact-response-audit/angular-toi-validity-seeds.json',import.meta.url),'utf8')) as {
 records:Array<{index:number;beforePhysics:{player:OriginalPlayerBody;projectiles:Array<{state:OriginalProjectileState}>}}>
};
const scene=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'));
const geometry=registerOriginalMapRuntime('woodlands',scene).geometry;
const shift=(p:Vec3,n:Vec3,d:number):Vec3=>({x:p.x+n.x*d,y:p.y+n.y*d,z:p.z+n.z*d});
const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
function cube(){return {vertices:[at(-.2,-.2,-.2),at(.2,-.2,-.2),at(-.2,.2,-.2),at(.2,.2,-.2),at(-.2,-.2,.2),at(.2,-.2,.2),at(-.2,.2,.2),at(.2,.2,.2)],
 faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],
 faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]] as Array<[number,number,number]>};}

describe('angular TOI admission at the actual rotated pose',()=>{
 for(const sharedReferencePeer of [false,true])it(`retains T=0 translated RPG contact with unchanged nonidentity orientation (shared reference peer=${sharedReferencePeer})`,()=>{
  const rocket=createOriginalProjectile('rpg',at(),at(1),'owner');
  rocket.angular!.orientation={x:.1,y:0,z:0,w:Math.sqrt(.99)};
  rocket.convex=originalAngularConvex(rocket.angular!);
  const vertices=rocket.convex.vertices;
  rocket.position=at(-Math.max(...vertices.map(v=>v.x))-.2-.1,-(Math.min(...vertices.map(v=>v.y))+Math.max(...vertices.map(v=>v.y)))/2,-(Math.min(...vertices.map(v=>v.z))+Math.max(...vertices.map(v=>v.z)))/2);
  rocket.velocity=at(10);
  const target:OriginalMovableBody={id:'target',position:at(),velocity:at(),convex:cube(),radius:Math.sqrt(3)*.2,mass:1,restitution:.2,friction:1};
  const bodies=[target];
  if(sharedReferencePeer){
   const angular=createOriginalAngularBody(rocket.angular!.referenceConvex,1);angular.orientation={x:.2,y:.1,z:0,w:Math.sqrt(.95)};
   bodies.push({id:'cache-peer',position:at(30),velocity:at(),angular,convex:originalAngularConvex(angular),radius:2,mass:1,restitution:.2,friction:1});
  }
  const events:OriginalPhysicsContactDiagnostic[]=[];
  stepOriginalPhysicsWorld([], [rocket],{contactDistance:0,movableBodies:bodies,sweep:()=>null,sweepConvex:()=>null,onResolvedContact:event=>events.push(event)});
  const first=events.find(event=>event.bodyB.id==='target');expect(first).toBeDefined();
  expect(first!.afterResponse.b.x).toBeGreaterThan(0);expect(rocket.hit).toBe(true);
  expect(first!.angularBeforeResponse!.a).toEqual(at());
  expect(rocket.position.x).toBeGreaterThan(-Math.max(...vertices.map(v=>v.x))-.2);
 });
 for(const seed of fixture.records)it(`dispatches only actual dynamic contacts at captured callback ${seed.index}`,()=>{
  const player=structuredClone(seed.beforePhysics.player),projectiles=structuredClone(seed.beforePhysics.projectiles.map(p=>p.state));
  const events:OriginalPhysicsContactDiagnostic[]=[],positivePairs:OriginalPhysicsContactDiagnostic[]=[];
  let projectileNotifications=0,terrainSupport=false;
  const result=stepOriginalPhysicsWorld([player],projectiles,{
   contactDistance:T,memoizePureSweep:true,
   sweep:(a,b,r)=>geometry.sweepSphere(a,b,r,T),sweepConvex:(a,b,s,v)=>geometry.sweepConvex(a,b,s,T,v),
   contactsSphere:(p,r)=>geometry.contactsSphere(p,r,T),contactsConvex:(p,s)=>geometry.contactsConvex(p,s,T),
   onProjectileContact:()=>projectileNotifications++,
   onResolvedContact:event=>{
    events.push(event);
    if(event.bodyA.type==='player'&&event.bodyB.type==='fixed'&&event.normal.y>.5){expect(player.supported).toBe(true);terrainSupport=true;}
    if(event.fraction<=0||event.bodyA.type!=='player'||event.bodyB.type!=='launcher')return;
    positivePairs.push(event);
    const projectile=projectiles[Number(event.bodyB.id.split(':')[1])];
    // The diagnostic follows inverse-mass separation. Undo that known equal-mass
    // displacement to query the actual impact pose, retaining actual quaternion.
    const separation=(Math.max(0,event.penetrationDepth??0)+1e-7)/2;
    const sphere=shift(player.position,event.normal,-separation),pivot=shift(projectile.position,event.normal,separation);
    const actual=sweepOriginalConvexSphere(projectile.convex!,pivot,pivot,sphere,sphere,25*(1.72/85),T);
    expect(actual,'Handler must not dispatch outside actual angular contact distance').not.toBeNull();
    expect(actual!.normalBToA.x).toBeCloseTo(-event.normal.x,9);
    expect(actual!.normalBToA.y).toBeCloseTo(-event.normal.y,9);
    expect(actual!.normalBToA.z).toBeCloseTo(-event.normal.z,9);
    for(const axis of ['x','y','z'] as const)expect(event.afterActorCallbacks.b[axis]).toBe(event.afterResponse.b[axis]*.85);
   },
  });
  expect(positivePairs.length).toBeGreaterThan(0); // Genuine initial impacts survive.
  expect(result.contacts).toBe(events.length);
  expect(projectileNotifications).toBe(events.filter(e=>e.bodyA.type==='launcher'||e.bodyB.type==='launcher').length);
  expect(player.supported).toBe(seed.index===3);expect(terrainSupport).toBe(seed.index===3);
  expect(projectiles.map(p=>p.remainingCallbacks)).toEqual(seed.beforePhysics.projectiles.map(p=>p.state.remainingCallbacks));
  expect(Object.values(player.position).every(Number.isFinite)).toBe(true);
 });
 it('keeps zero-body callbacks empty without geometry queries or notifications',()=>{
  let queries=0,notifications=0;
  const result=stepOriginalPhysicsWorld([],[],{sweep:()=>{queries++;throw Error('Empty world must not query geometry');},onProjectileContact:()=>notifications++});
  expect(result.contacts).toBe(0);expect(result.kind).toBe('complete');expect(result.remainingTime).toBe(0);
  expect(queries).toBe(0);expect(notifications).toBe(0);
 });
});
