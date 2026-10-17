import {describe,it,expect} from 'vitest';
import {createOriginalProjectile,ORIGINAL_PROJECTILE_GRAVITY,ORIGINAL_PHYSICS_STEP,ORIGINAL_PHYSICS_SUBSTEPS} from './originalExplosives';
import {stepOriginalPhysicsWorld,ORIGINAL_PLAYER_RADIUS as R,type OriginalMovableBody,type OriginalPlayerBody,type OriginalPhysicsEnvironment,type OriginalPhysicsContactDiagnostic} from './originalPlayerPhysics';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';
const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
function box(h=.2):OriginalConvexPolytope {
 return {vertices:[at(-h,-h,-h),at(h,-h,-h),at(-h,h,-h),at(h,h,-h),at(-h,-h,h),at(h,-h,h),at(-h,h,h),at(h,h,h)],faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
}
function movable(position=at(),velocity=at()):OriginalMovableBody{return {id:'barrel',position:{...position},velocity:{...velocity},convex:box(),radius:Math.sqrt(3)*.2,mass:1,restitution:.2,friction:1};}
function player(position=at(),velocity=at()):OriginalPlayerBody{return {id:'player',position:{...position},velocity:{...velocity},supported:false};}
function empty(body:OriginalMovableBody):OriginalPhysicsEnvironment{return {movableBodies:[body],sweep:()=>null,sweepConvex:()=>null};}
const fixedFloor:Pick<OriginalPhysicsEnvironment,'sweep'|'sweepConvex'>={
 sweep:(from,to,radius)=>floorContact(from,to,-radius),
 sweepConvex:(from,to,shape)=>floorContact(from,to,Math.min(...shape.vertices.map(v=>v.y))),
};
function floorContact(from:Vec3,to:Vec3,bottom:number){
 if(to.y+bottom>=0)return null;
 const fraction=from.y+bottom>0?(from.y+bottom)/(from.y-to.y):0;
 return {fraction,position:{x:from.x+(to.x-from.x)*fraction,y:-bottom,z:from.z+(to.z-from.z)*fraction},normal:at(0,1),penetrationDepth:Math.max(0,-from.y-bottom)};
}
describe('generic source movable bodies in joint translation-only physics',()=>{
 it('uses shared gravity and ten substeps without adding actor state or changing the fixed basis',()=>{
  const body=movable(at(2,3,4),at(2,0,-1)),shape=body.convex;
  expect(stepOriginalPhysicsWorld([],[],empty(body)).contacts).toBe(0);
  expect(body.position.x).toBeCloseTo(2.1,12);expect(body.position.z).toBeCloseTo(3.95,12);
  const dt=ORIGINAL_PHYSICS_STEP/ORIGINAL_PHYSICS_SUBSTEPS;
  expect(body.position.y).toBeCloseTo(3+ORIGINAL_PROJECTILE_GRAVITY*dt*dt*55,12);
  expect(body.velocity.y).toBeCloseTo(ORIGINAL_PROJECTILE_GRAVITY*.05,12);expect(body.convex).toBe(shape);
  expect(body).not.toHaveProperty('supported');expect(body).not.toHaveProperty('hit');expect(body).not.toHaveProperty('remainingCallbacks');
 });
 it('sweeps its full physical hull against fixed terrain and applies its own material response',()=>{
  const body=movable(at(0,.2,0),at(100,-10,0)),events:OriginalPhysicsContactDiagnostic[]=[];
  stepOriginalPhysicsWorld([],[],{...empty(body),...fixedFloor,onResolvedContact:event=>events.push(event)});
  expect(events.length).toBeGreaterThan(0);
  const first=events[0],speed=10-ORIGINAL_PROJECTILE_GRAVITY*.005;
  expect(first.bodyA).toEqual({id:'barrel',type:'movable'});expect(first.bodyB.type).toBe('fixed');
  expect(first.afterResponse.a.y).toBeCloseTo(.2*speed,12);
  expect(first.afterResponse.a.x).toBeCloseTo(100-.1*1.2*speed,12);
  expect(first.afterActorCallbacks).toEqual(first.afterResponse);expect(body.position.y).toBeGreaterThanOrEqual(.2);
 });
 it('exchanges momentum with the player without grenade damping or player drag on the movable',()=>{
  const body=movable(at(R+.2+.1),at(-10)),p=player(at(),at(10)),events:OriginalPhysicsContactDiagnostic[]=[];
  const contacts=stepOriginalPhysicsWorld([p],[],{...empty(body),onResolvedContact:event=>events.push(event)}).contacts;
  expect(contacts).toBe(1);expect(p.velocity.x).toBeCloseTo(-1,11);expect(body.velocity.x).toBeCloseTo(1,11);
  expect(p.velocity.x+body.velocity.x).toBeCloseTo(0,12);expect(p.position.x).toBeCloseTo(.005,5);
  expect(body.position.x).toBeCloseTo(R+.2+.095,5);expect(events[0].afterActorCallbacks).toEqual(events[0].afterResponse);
 });
 it('supplies actual convex support to a player while resting on the fixed floor',()=>{
  const body=movable(at(0,.2)),p=player(at(0,.4+R)),otherIds:(string|undefined)[]=[];
  stepOriginalPhysicsWorld([p],[],{...empty(body),...fixedFloor,onPlayerContact:(_player,_normal,id)=>otherIds.push(id)});
  expect(p.supported).toBe(true);expect(otherIds).toContain('barrel');
  expect(body.position.y).toBeGreaterThanOrEqual(.2);expect(p.position.y-body.position.y).toBeGreaterThanOrEqual(R+.2-1e-6);
  expect(body).not.toHaveProperty('supported');
 });
 it.each(['launcher','rpg'] as const)('collides with the actual %s hull while keeping source projectile callbacks off the movable',weapon=>{
  const body=movable(),projectile=createOriginalProjectile(weapon,at(),at(1), 'owner'),hull=projectile.convex!;
  const maximumX=Math.max(...hull.vertices.map(v=>v.x)),middle=(axis:'y'|'z')=>(Math.min(...hull.vertices.map(v=>v[axis]))+Math.max(...hull.vertices.map(v=>v[axis])))/2;
  projectile.position=at(-.2-maximumX-.1,-middle('y'),-middle('z'));projectile.velocity=at(10);
  const events:OriginalPhysicsContactDiagnostic[]=[],projectileContacts:string[]=[],movableContacts:string[]=[];
  stepOriginalPhysicsWorld([], [projectile],{...empty(body),onResolvedContact:event=>events.push(event),onProjectileContact:p=>projectileContacts.push(p.weapon),onMovableContact:m=>movableContacts.push(m.id)});
  expect(events.length).toBeGreaterThan(0);expect(projectileContacts).toContain(weapon);expect(movableContacts).toContain('barrel');
  const first=events[0];expect(first.bodyA.type).toBe(weapon);expect(first.bodyB).toEqual({id:'barrel',type:'movable'});
  expect(first.afterActorCallbacks.b).toEqual(first.afterResponse.b);
  if(weapon==='launcher')for(const axis of ['x','y','z'] as const)expect(first.afterActorCallbacks.a[axis]).toBeCloseTo(.85*first.afterResponse.a[axis],12);
  else{expect(projectile.hit).toBe(true);expect(first.afterActorCallbacks.a).toEqual(first.afterResponse.a);}
  expect(projectile.remainingCallbacks).toBe(weapon==='launcher'?60:200);
  expect(body).not.toHaveProperty('hit');expect(body).not.toHaveProperty('remainingCallbacks');expect(body).not.toHaveProperty('supported');
 });
 it('detaches movable diagnostics so an observer cannot change the world',()=>{
  const run=(mutate:boolean)=>{
   const body=movable(at(0,.2),at(2,-10)),events:OriginalPhysicsContactDiagnostic[]=[];
   stepOriginalPhysicsWorld([],[],{...empty(body),...fixedFloor,memoizePureSweep:true,onResolvedContact:event=>{
    events.push(structuredClone(event));if(mutate){event.bodyA.id='changed';event.normal.y=-999;event.beforeResponse.a.x=999;event.afterResponse.a.y=999;event.afterActorCallbacks.a.z=999;}
   }});return {body,events};
  };
  expect(run(true)).toEqual(run(false));
 });
 it('uses full convex sweeps and rejects invalid masses or undersized pivot bounds',()=>{
  const body=movable();expect(()=>stepOriginalPhysicsWorld([],[],{movableBodies:[body],sweep:()=>null})).toThrow(/movable body/);
  for(const invalid of [{...body,mass:0},{...body,radius:.1},{...body,friction:NaN}])expect(()=>stepOriginalPhysicsWorld([],[],empty(invalid))).toThrow(/Invalid original movable body/);
 });
});
