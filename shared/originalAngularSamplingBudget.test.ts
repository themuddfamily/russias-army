import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {createOriginalAngularBody} from './originalAngularBody';
import {createOriginalSceneGeometry} from './originalSceneGeometry';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_GRAVITY,ORIGINAL_PHYSICS_MAX_EVENTS_PER_SUBSTEP,ORIGINAL_PHYSICS_MAX_SWEEPS_PER_SUBSTEP,type OriginalMovableBody} from './originalPlayerPhysics';
import {createOriginalProjectile,stepOriginalProjectilePhysicsSubstep,ORIGINAL_PROJECTILE_RADIUS,ORIGINAL_COLLISION_CONTACT_DISTANCE as T,type OriginalProjectileState} from './originalExplosives';
import type {Vec3} from './protocol';
import {stepOriginalPhysicsWorld as stepLegacyPhysics} from '../artifacts/fidelity-review/2026-10-07/angular-sampling-budget/baseline-player-physics';

function spinner(speed:number):OriginalMovableBody {
 const p=(x:number,y:number,z:number):Vec3=>({x,y,z});
 const vertices=[p(-1,-1,-1),p(1,-1,-1),p(-1,1,-1),p(1,1,-1),p(-1,-1,1),p(1,-1,1),p(-1,1,1),p(1,1,1)];
 const convex={vertices,faceNormals:[p(1,0,0),p(-1,0,0),p(0,1,0),p(0,-1,0),p(0,0,1),p(0,0,-1)],edgeDirections:[p(1,0,0),p(0,1,0),p(0,0,1)],faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]] as [number,number,number][]},angular=createOriginalAngularBody(convex,1);
 angular.angularVelocity={x:0,y:speed*180/Math.PI,z:0};
 return {id:'spinner',position:{x:100,y:100,z:100},velocity:{x:0,y:0,z:0},angular,convex,radius:Math.sqrt(3),mass:1,restitution:.1,friction:0};
}

it('finishes fast free rotation without spending collision attempts or replaying gravity',()=>{
 const beforeClock=createOriginalPlayerBody('before-clock',{x:0,y:100,z:0},{x:1,y:0,z:0});
 const before=stepLegacyPhysics([beforeClock],[],{movableBodies:[spinner(60)],sweep:()=>null,sweepConvex:()=>null});
 expect(before.kind).toBe('incomplete');expect(before.contacts).toBe(0);expect(before.remainingTime).toBeGreaterThan(.009);
 expect(before.substeps.every(s=>s.iterations===48)).toBe(true);
 expect(beforeClock.position.x).toBeCloseTo(before.advancedTime,14);
 const clock=createOriginalPlayerBody('clock',{x:0,y:100,z:0},{x:1,y:0,z:0}),body=spinner(60),start=clock.position.x;
 const result=stepOriginalPhysicsWorld([clock],[],{movableBodies:[body],sweep:()=>null,sweepConvex:()=>null});
 expect(result.kind).toBe('complete');expect(result.remainingTime).toBe(0);expect(result.contacts).toBe(0);
 expect(result.advancedTime).toBeCloseTo(.05,14);expect(clock.position.x-start).toBeCloseTo(.05,14);
 expect(clock.velocity.y).toBeCloseTo(ORIGINAL_PLAYER_GRAVITY*.05,12);
 expect(body.velocity.y).toBeCloseTo(clock.velocity.y,12);
 expect(body.angular!.orientation.y).toBeCloseTo(Math.sin(60*.05/2),10);
 expect(body.angular!.orientation.w).toBeCloseTo(Math.cos(60*.05/2),10);
 expect(result.substeps.every(s=>s.iterations>48&&s.iterations<=ORIGINAL_PHYSICS_MAX_SWEEPS_PER_SUBSTEP&&s.eventIterations===0)).toBe(true);
});

it('keeps joint and standalone high-spin projectile advancement consistent',()=>{
 const joint=createOriginalProjectile('launcher',{x:0,y:100,z:0},{x:1,y:0,z:0},'owner'),standalone=structuredClone(joint);
 for(const state of [joint,standalone])state.angular!.angularVelocity={x:0,y:2000*180/Math.PI,z:0};
 const result=stepOriginalPhysicsWorld([],[joint],{contactDistance:T,sweep:()=>null,sweepConvex:()=>null});
 let queries=0;
 for(let i=0;i<10;i++)expect(stepOriginalProjectilePhysicsSubstep(standalone,{radius:ORIGINAL_PROJECTILE_RADIUS.launcher,sweep:()=>null,sweepConvex:()=>{queries++;return null;}})).toBe(0);
 expect(result.kind).toBe('complete');expect(result.substeps.every(s=>s.iterations>48&&s.eventIterations===0)).toBe(true);
 expect(queries).toBeGreaterThan(10*48);expect(queries).toBeLessThanOrEqual(10*ORIGINAL_PHYSICS_MAX_SWEEPS_PER_SUBSTEP);
 for(const axis of ['x','y','z'] as const)expect(joint.position[axis]).toBeCloseTo(standalone.position[axis],10);
 for(const axis of ['x','y','z','w'] as const)expect(joint.angular!.orientation[axis]).toBeCloseTo(standalone.angular!.orientation[axis],10);
 expect(joint.remainingCallbacks).toBe(standalone.remainingCallbacks);
});

it('retains the collision attempt limit for repeatedly closing zero-time contacts',()=>{
 const player=createOriginalPlayerBody('closing',{x:0,y:100,z:0},{x:1,y:0,z:0});let queries=0,callbacks=0;
 const result=stepOriginalPhysicsWorld([player],[],{
  sweep:from=>{queries++;return {fraction:0,position:{...from},normal:{x:-1,y:0,z:0}};},
  onPlayerContact:body=>{callbacks++;body.velocity.x=1;},
 });
 expect(result.kind).toBe('incomplete');expect(result.advancedTime).toBe(0);expect(result.remainingTime).toBeCloseTo(.05,15);
 expect(result.substeps.every(s=>s.kind==='event-cap'&&s.eventIterations===ORIGINAL_PHYSICS_MAX_EVENTS_PER_SUBSTEP&&s.iterations===48)).toBe(true);
 expect(queries).toBe(10*48);expect(callbacks).toBe(queries);expect(result.contacts).toBe(callbacks);
});

it('separately bounds extreme free-spin queries without unchecked catch-up',()=>{
 const clock=createOriginalPlayerBody('clock',{x:0,y:100,z:0},{x:1,y:0,z:0}),body=spinner(100000);let queries=0;
 const result=stepOriginalPhysicsWorld([clock],[],{movableBodies:[body],sweep:()=>{queries++;return null;},sweepConvex:()=>null});
 expect(result.kind).toBe('incomplete');expect(result.advancedTime).toBeLessThan(.05);expect(result.remainingTime).toBeGreaterThan(0);
 expect(clock.position.x).toBeCloseTo(result.advancedTime,14);
 expect(result.substeps.every(s=>s.kind==='sweep-cap'&&s.iterations===ORIGINAL_PHYSICS_MAX_SWEEPS_PER_SUBSTEP&&s.eventIterations===0)).toBe(true);
 expect(queries).toBe(10*ORIGINAL_PHYSICS_MAX_SWEEPS_PER_SUBSTEP);
});

it('keeps rejected authentic near-floor candidates within the original event allowance',()=>{
 const evidence=JSON.parse(readFileSync(new URL('../artifacts/fidelity-review/2026-10-07/woodland-near-floor-query/fixture.json',import.meta.url),'utf8'));
 const triangle=evidence.observation.feature.triangle as Vec3[],geometry=createOriginalSceneGeometry({nodes:[{name:'floor',resource:'floor',parent:'World',visibility:1,shader:'default',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}],
  meshes:[{resource:'floor',part:0,positions:triangle.map(p=>[p.x,-p.z,p.y]),faces:[[0,1,2]],normals:[],tex_coords:[]}]},{scale:1,cellSize:2});
 const projectile=structuredClone(evidence.projectile) as OriginalProjectileState,clock=createOriginalPlayerBody('clock',{x:100,y:100,z:100},{x:1,y:0,z:0});
 const fuse=projectile.remainingCallbacks,result=stepOriginalPhysicsWorld([clock],[projectile],{contactDistance:T,
  sweep:(a,b,r)=>geometry.sweepSphere(a,b,r,T),sweepConvex:(a,b,s,v)=>geometry.sweepConvex(a,b,s,T,v)});
 expect(result.kind).toBe('incomplete');expect(result.remainingTime).toBeGreaterThan(.015);
 expect(result.substeps.some(s=>s.kind==='event-cap')).toBe(true);
 expect(result.substeps.every(s=>s.eventIterations<=48)).toBe(true);
 expect(projectile.remainingCallbacks).toBe(fuse);
});
