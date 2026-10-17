import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import {createOriginalProjectile,stepOriginalProjectileActor,ORIGINAL_COLLISION_CONTACT_DISTANCE as T,ORIGINAL_PHYSICS_STEP,ORIGINAL_PHYSICS_SUBSTEPS} from './originalExplosives';
import {originalAngularConvex} from './originalAngularBody';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_DERIVATIVE_FACTOR,type OriginalPhysicsEnvironment,type OriginalPhysicsContactDiagnostic} from './originalPlayerPhysics';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';
const capture=JSON.parse(readFileSync(new URL('../artifacts/fidelity-review/2026-10-02/current/contact-skin-trial/browser/woodlands-source-angular-explosives-solo.json',import.meta.url),'utf8'));
const sample=capture.samples.find((s:any)=>s.projectiles.some((p:any)=>p.remainingCallbacks===59));
const runtime=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
function seed(){
 const source=sample.projectiles[0],projectile=createOriginalProjectile('launcher',source.position,source.direction,'player');
 projectile.position={...source.position};projectile.velocity={...source.velocity};projectile.remainingCallbacks=source.remainingCallbacks;projectile.angular!.orientation={...source.orientation};projectile.angular!.angularVelocity={...source.angularVelocity};projectile.convex=originalAngularConvex(projectile.angular!);
 const p=sample.local,v=sample.movement.velocity,player=createOriginalPlayerBody('player',{x:p.x,y:p.y+runtime.profile.eyeHeight,z:p.z},{x:v.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:v.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:v.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR});
 return {player,projectile};
}
type GatherMode='enabled'|'legacy'|'incomplete'|'contradictory'|'zero_normal'|'nonfinite_normal'|'future_fraction'|'nan_depth'|'infinite_depth'|'negative_depth'|'missing_selected'|'legacy_missing_selected';
function run(mode:GatherMode,corruptObserver=false,observe=true){
 const state=seed(),events:OriginalPhysicsContactDiagnostic[]=[];let projectileHandlers=0,playerHandlers=0,gathers=0;
 const env:OriginalPhysicsEnvironment={contactDistance:T,memoizePureSweep:true,sweep:(a,b,r)=>runtime.geometry.sweepSphere(a,b,r,T),sweepConvex:(a,b,s,v)=>runtime.geometry.sweepConvex(a,b,s,T,v),onProjectileContact:()=>projectileHandlers++,onPlayerContact:()=>playerHandlers++,onResolvedContact:event=>{
  events.push(structuredClone(event));
  if(corruptObserver){event.normal.x=999;event.beforeResponse.a.y=-Infinity;event.afterResponse.b.x=Infinity;event.afterActorCallbacks.a.z=NaN;if(event.angularAfterActorCallbacks)event.angularAfterActorCallbacks.a.x=999;if(event.afterConstraintProjection)event.afterConstraintProjection.a.y=Infinity;if(event.angularAfterConstraintProjection)event.angularAfterConstraintProjection.b.z=NaN;if(event.surfaceWitnesses)event.surfaceWitnesses.a.x=999;}
 }};
 if(!observe)delete env.onResolvedContact;
 if(mode==='missing_selected'||mode==='legacy_missing_selected')env.sweepConvex=(from,_to,shape,surfaceVelocity)=>{
  const p=shape.vertices[0],point={x:from.x+p.x,y:from.y+p.y,z:from.z+p.z},velocity=surfaceVelocity!(point),speed=Math.hypot(velocity.x,velocity.y,velocity.z);
  if(speed===0)return null;
  const normal={x:-velocity.x/speed,y:-velocity.y/speed,z:-velocity.z/speed};
  // A synthetic fixed plane returned only by sweep tests the missing-selected
  // gather guard. The matching legacy control uses this exact same provider.
  return {position:{...from},fraction:0,normal,penetrationDepth:0,witnessA:point,witnessB:{x:point.x-normal.x*T,y:point.y-normal.y*T,z:point.z-normal.z*T}};
 };
 if(mode!=='legacy'&&mode!=='legacy_missing_selected'){
  env.contactsSphere=(position:Vec3,radius:number)=>{
   gathers++;const hits=runtime.geometry.contactsSphere(position,radius,T);
   if(mode!=='contradictory'||!hits.length)return hits;
   const floor=hits[0],n={x:-floor.normal.x,y:-floor.normal.y,z:-floor.normal.z},point={x:position.x-n.x*radius,y:position.y-n.y*radius,z:position.z-n.z*radius};
   // A deliberately incompatible ceiling provider checks transactional failure,
   // rather than pretending this extra plane exists in the original scene.
   return [...hits,{position:{...position},fraction:0 as const,normal:n,penetrationDepth:0,witnessA:{...point},witnessB:{...point},witnessPairs:[{witnessA:{...point},witnessB:{...point}}]}];
  };
  env.contactsConvex=(position:Vec3,shape:OriginalConvexPolytope)=>{
   gathers++;const hits=runtime.geometry.contactsConvex(position,shape,T);
   if(mode==='nan_depth'||mode==='infinite_depth'||mode==='negative_depth')return [...hits,{position:{...position},fraction:0,normal:{x:0,y:1,z:0},penetrationDepth:mode==='nan_depth'?NaN:mode==='infinite_depth'?Infinity:-1,witnessA:{...position},witnessB:{...position}}];
   if(mode==='zero_normal'||mode==='nonfinite_normal'||mode==='future_fraction')return [...hits,{position:{...position},fraction:mode==='future_fraction'?.5:0,normal:mode==='zero_normal'?{x:0,y:0,z:0}:mode==='nonfinite_normal'?{x:NaN,y:1,z:0}:{x:0,y:1,z:0},penetrationDepth:0,witnessA:{...position},witnessB:{...position}}];
   // Honest unresolved geometry must abandon the complete transaction.
   return mode==='incomplete'?[...hits,{position:{...position},fraction:0 as const,normal:{x:0,y:1,z:0},penetrationDepth:0}]:hits;
  };
 }
 const result=stepOriginalPhysicsWorld([state.player],[state.projectile],env);
 return {state,result,events,projectileHandlers,playerHandlers,gathers};
}
describe('coupled contact island at actual captured Woodland callback boundary',()=>{
 it('integrates captured spin and physics time instead of consuming every zero-time collision budget',()=>{
  const legacy=run('legacy'),coupled=run('enabled'),initial=sample.projectiles[0].orientation,q=coupled.state.projectile.angular!.orientation;
  expect(legacy.result.contacts).toBe(480);expect(legacy.events.filter(e=>e.iteration===47)).toHaveLength(10);
  expect(legacy.result.kind).toBe('incomplete');expect(legacy.result.remainingTime).toBeGreaterThan(0);
  expect(legacy.result.substeps).toHaveLength(10);
  for(const clock of legacy.result.substeps){
   const last=legacy.events.find(e=>e.substepIndex===clock.index&&e.iteration===47)!;
   expect(clock.kind).toBe('event-cap');expect(clock.iterations).toBe(48);
   expect(clock.remainingTime).toBe(last.remainingAfter);
  }
  expect(coupled.events.some(e=>e.island)).toBe(true);expect(coupled.result.contacts).toBeLessThan(legacy.result.contacts);
  expect(Math.hypot(q.x-initial.x,q.y-initial.y,q.z-initial.z,q.w-initial.w)).toBeGreaterThan(1e-4);
  expect(coupled.events.filter(e=>e.iteration===47&&e.remainingAfter>=ORIGINAL_PHYSICS_STEP/ORIGINAL_PHYSICS_SUBSTEPS-1e-12)).toHaveLength(0);
  expect(coupled.state.projectile.remainingCallbacks).toBe(59);expect(coupled.state.projectile.hit).toBe(false);
  expect(stepOriginalProjectileActor(coupled.state.projectile).detonated).toBe(false);expect(coupled.state.projectile.remainingCallbacks).toBe(58);
 });
 it('keeps geometry, velocities and handlers independent of corrupting detached diagnostic vectors',()=>{
  const ordinary=run('enabled'),corrupt=run('enabled',true),unobserved=run('enabled',false,false);
  expect(corrupt.state).toEqual(ordinary.state);expect(corrupt.result).toEqual(ordinary.result);expect(corrupt.projectileHandlers).toBe(ordinary.projectileHandlers);expect(corrupt.playerHandlers).toBe(ordinary.playerHandlers);
  expect(unobserved.state).toEqual(ordinary.state);expect(unobserved.result).toEqual(ordinary.result);expect(unobserved.projectileHandlers).toBe(ordinary.projectileHandlers);expect(unobserved.playerHandlers).toBe(ordinary.playerHandlers);
 });
 it.each(['incomplete','contradictory'] as const)('falls back transactionally for %s gather without duplicate handlers or changed state',mode=>{
  const legacy=run('legacy'),fallback=run(mode);
  expect(fallback.gathers).toBeGreaterThan(0);expect(fallback.events.some(e=>e.island)).toBe(false);
  expect(fallback.state).toEqual(legacy.state);expect(fallback.result).toEqual(legacy.result);expect(fallback.projectileHandlers).toBe(legacy.projectileHandlers);expect(fallback.playerHandlers).toBe(legacy.playerHandlers);
 });
 it.each(['zero_normal','nonfinite_normal','future_fraction'] as const)('rejects %s stationary contact rows before observable response',mode=>{
  const legacy=run('legacy'),fallback=run(mode);
  expect(fallback.gathers).toBeGreaterThan(0);expect(fallback.events.some(e=>e.island)).toBe(false);expect(fallback.state).toEqual(legacy.state);expect(fallback.result).toEqual(legacy.result);expect(fallback.projectileHandlers).toBe(legacy.projectileHandlers);
 });
 it.each(['nan_depth','infinite_depth','negative_depth'] as const)('rejects %s before positional correction or hooks, preserving exact legacy fallback',mode=>{
  const legacy=run('legacy'),fallback=run(mode);
  expect(fallback.gathers).toBeGreaterThan(0);expect(fallback.events.some(e=>e.island)).toBe(false);
  expect(fallback.state).toEqual(legacy.state);expect(fallback.result).toEqual(legacy.result);
  expect(fallback.events).toEqual(legacy.events);expect(fallback.projectileHandlers).toBe(legacy.projectileHandlers);expect(fallback.playerHandlers).toBe(legacy.playerHandlers);
 });
 it('requires the selected sweep contact to exist in the complete stationary gather',()=>{
  const legacy=run('legacy_missing_selected'),fallback=run('missing_selected');
  expect(fallback.gathers).toBeGreaterThan(0);expect(fallback.events.some(e=>e.island)).toBe(false);expect(fallback.state).toEqual(legacy.state);expect(fallback.result).toEqual(legacy.result);expect(fallback.projectileHandlers).toBe(legacy.projectileHandlers);
 });
});
