import {originalAngularConvex,cloneOriginalAngularBody,advanceOriginalAngularBody,originalAngularPointVelocity,resolveOriginalAngularManifold,type OriginalAngularBody} from '../../../../shared/originalAngularBody';
import {originalConvexPairPatch} from '../../../../shared/originalContactPatch';
import type {Vec3} from '../../../../shared/protocol';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {ORIGINAL_PHYSICS_STEP,ORIGINAL_PHYSICS_SUBSTEPS,ORIGINAL_PROJECTILE_GRAVITY,ORIGINAL_PROJECTILE_RADIUS,ORIGINAL_FIXED_RESTITUTION,ORIGINAL_FIXED_FRICTION,resolveOriginalBodyContact} from '../../../../shared/originalExplosives';
import type {OriginalProjectileState,OriginalProjectileContact} from '../../../../shared/originalExplosives';
import type {OriginalConvexPolytope} from '../../../../shared/originalConvexSweep';
import {sweepOriginalConvexPair,sweepOriginalConvexSphere} from '../../../../shared/originalConvexContact';
import {sweepOriginalConvexPairDistance} from '../../../../shared/originalContactDistance';
import {resolveOriginalContactIsland,type OriginalIslandContact,type OriginalContactIslandResult} from '../../../../shared/originalContactIsland';
import type {OriginalAngularContactBody} from '../../../../shared/originalAngularBody';

export const ORIGINAL_PLAYER_RADIUS=25*S;
export const ORIGINAL_PLAYER_EYE_OFFSET=60*S;
export const ORIGINAL_PLAYER_MASS=1;
export const ORIGINAL_PLAYER_RESTITUTION=.1;
export const ORIGINAL_PLAYER_FRICTION=1;
export const ORIGINAL_PLAYER_MOVE_IMPULSE=100*S;
export const ORIGINAL_PLAYER_JUMP_IMPULSE=250*S;
export const ORIGINAL_PLAYER_HORIZONTAL_DRAG=.75;
export const ORIGINAL_PLAYER_GRAVITY=ORIGINAL_PROJECTILE_GRAVITY;
/** .05 physics seconds per nominal 1/30 wall-clock callback. */
export const ORIGINAL_PHYSICS_DERIVATIVE_FACTOR=1.5;
export const ORIGINAL_PLAYER_DERIVATIVE_FACTOR=ORIGINAL_PHYSICS_DERIVATIVE_FACTOR;
export const ORIGINAL_PLAYER_DERIVATIVE_JUMP=ORIGINAL_PLAYER_JUMP_IMPULSE*ORIGINAL_PHYSICS_DERIVATIVE_FACTOR;
export const ORIGINAL_PLAYER_DERIVATIVE_GRAVITY=-ORIGINAL_PLAYER_GRAVITY*ORIGINAL_PHYSICS_DERIVATIVE_FACTOR**2;
export const ORIGINAL_PLAYER_GROUNDED_MAX_SPEED=ORIGINAL_PLAYER_MOVE_IMPULSE*3*ORIGINAL_PHYSICS_DERIVATIVE_FACTOR;
export interface OriginalPlayerBody {id:string;position:Vec3;velocity:Vec3;supported:boolean}
/** Generic translation-only dynamic hull. Radius is a conservative bound from
 * its preserved pivot; native contact-driven angular motion is not represented. */
export interface OriginalMovableBody {angular?:OriginalAngularBody;id:string;position:Vec3;velocity:Vec3;convex:OriginalConvexPolytope;radius:number;mass:number;restitution:number;friction:number}
export interface OriginalPlayerControls {forward?:boolean;backward?:boolean;right?:boolean;left?:boolean;jump?:boolean;typing?:boolean;yaw:number;pitch:number}
const add=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(v:Vec3,n:number):Vec3=>({x:v.x*n,y:v.y*n,z:v.z*n});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const length=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
const norm=(v:Vec3):Vec3=>{const l=length(v);return l>1e-12?mul(v,1/l):{x:0,y:1,z:0};};
export function createOriginalPlayerBody(id:string,eye:Vec3,velocity:Vec3={x:0,y:0,z:0}):OriginalPlayerBody {
 return {id,position:{x:eye.x,y:eye.y-ORIGINAL_PLAYER_EYE_OFFSET,z:eye.z},velocity:{...velocity},supported:false};
}
export function originalPlayerEye(body:OriginalPlayerBody):Vec3{return {...body.position,y:body.position.y+ORIGINAL_PLAYER_EYE_OFFSET};}
/** goody follows joint physics. Ground support is a one-callback latch, not an
 * authored height check. Full pitched aim and averaging preserve source input. */
export function applyOriginalPlayerControls(body:OriginalPlayerBody,input:OriginalPlayerControls):{grounded:boolean;jumped:boolean} {
 const grounded=body.supported;let jumped=false;
 if(grounded){
  if(!input.typing){
   const aim={x:-Math.sin(input.yaw)*Math.cos(input.pitch),y:Math.sin(input.pitch),z:-Math.cos(input.yaw)*Math.cos(input.pitch)};
   const strafe={x:Math.cos(input.yaw)*Math.cos(input.pitch),y:-Math.sin(input.pitch),z:-Math.sin(input.yaw)*Math.cos(input.pitch)};
   const f=input.forward?1:input.backward?-1:0,r=input.right?1:input.left?-1:0;
   const side=mul(strafe,r);if(r)side.y=-Math.sin(input.pitch);
   let push=add(mul(aim,f),side);if(f&&r)push=mul(push,.5);
   body.velocity=add(body.velocity,mul(push,ORIGINAL_PLAYER_MOVE_IMPULSE));
   if(input.jump){body.velocity.y+=ORIGINAL_PLAYER_JUMP_IMPULSE;jumped=true;}
  }
  body.velocity.x*=ORIGINAL_PLAYER_HORIZONTAL_DRAG;body.velocity.z*=ORIGINAL_PLAYER_HORIZONTAL_DRAG;
 }
 body.supported=false;return {grounded,jumped};
}
export interface OriginalPhysicsContactDiagnosticBody {id:string;type:'player'|'launcher'|'rpg'|'movable'|'fixed'}
export interface OriginalPhysicsContactDiagnosticVelocities {a:Vec3;b:Vec3}
/** Solver clock observation, not a collision certificate or retryable debt.
 * advancedTime is the RN sum of scheduled advanceBody duration arguments
 * (also the virtual clock for an empty body list);
 * remainingTime is the existing debit ledger. Their different rounding graphs
 * need not add exactly to requestedTime. Gravity already ran for every dt. */
export interface OriginalPhysicsSubstepClock {
 readonly index:number;readonly requestedTime:number;readonly advancedTime:number;
 readonly remainingTime:number;readonly iterations:number;
 readonly kind:'complete'|'event-cap'|'time-cutoff'|'invalid-clock';
}
export interface OriginalPhysicsWorldResult {
 readonly contacts:number;readonly kind:'complete'|'incomplete';
 readonly requestedTime:number;readonly advancedTime:number;readonly remainingTime:number;
 readonly substeps:readonly OriginalPhysicsSubstepClock[];
}
/** Detached observation of a resolved event, including the actor callbacks'
 * velocity changes. Times are physics seconds within this world callback. */
export interface OriginalPhysicsContactDiagnostic {
 substepIndex:number;iteration:number;time:number;substepTime:number;
 remainingBefore:number;remainingAfter:number;fraction:number;penetrationDepth?:number;
 bodyA:OriginalPhysicsContactDiagnosticBody;bodyB:OriginalPhysicsContactDiagnosticBody;normal:Vec3;
 /** Actual surface witnesses at impact, when established by the geometric query.
  * Omitted for unresolved overlaps/manifolds and fixed queries without witnesses. */
 surfaceWitnesses?:{a:Vec3;b:Vec3};
 angularBeforeResponse?:OriginalPhysicsContactDiagnosticVelocities;
 angularAfterResponse?:OriginalPhysicsContactDiagnosticVelocities;
 angularAfterActorCallbacks?:OriginalPhysicsContactDiagnosticVelocities;
 beforeResponse:OriginalPhysicsContactDiagnosticVelocities;
 afterResponse:OriginalPhysicsContactDiagnosticVelocities;
 afterActorCallbacks:OriginalPhysicsContactDiagnosticVelocities;
 /** Coupled constraints may need a silent solve after known actor damping.
  * These detached values distinguish that solve from the handler itself. */
 afterConstraintProjection?:OriginalPhysicsContactDiagnosticVelocities;
 angularAfterConstraintProjection?:OriginalPhysicsContactDiagnosticVelocities;
 island?:{contacts:number;responseIterations:number;projectionIterations:number};
}
export interface OriginalPhysicsEnvironment {
 /** One total scene-unit contact skin; omitted means legacy physical intersection. */
 contactDistance?:number;
 sweep:(from:Vec3,to:Vec3,radius:number)=>OriginalProjectileContact|null;
 sweepConvex?:(from:Vec3,to:Vec3,shape:OriginalConvexPolytope,surfaceVelocity?:(point:Vec3)=>Vec3)=>OriginalProjectileContact|null;
 /** All stationary finite contacts, including separating support. Both queries
  * are required for transactional coupled response; closest-hit sweeps remain
  * responsible for motion. Native notification grouping is not represented. */
 contactsSphere?:(position:Vec3,radius:number)=>readonly OriginalProjectileContact[];
 contactsConvex?:(position:Vec3,shape:OriginalConvexPolytope)=>readonly OriginalProjectileContact[];
 /** Opt in only when identical numeric geometry queries are pure for this
  * entire callback. Cache holds at most one previous query per physics body. */
 memoizePureSweep?:boolean;
 /** Whether player spheres contact each other. Defaults to true for generic
  * multi-body compatibility. Recovered observer worlds contain only their
  * local goody sphere; a shared authority can disable these extra pairs
  * without disabling player contacts with projectiles or scene bodies. */
 playerPairContacts?:boolean;
 movableBodies?:readonly OriginalMovableBody[];
 onMovableContact?:(body:OriginalMovableBody,normal:Vec3,otherId?:string)=>void;
 onPlayerContact?:(player:OriginalPlayerBody,normal:Vec3,otherId?:string)=>void;
 onProjectileContact?:(projectile:OriginalProjectileState,contact:OriginalProjectileContact)=>void;
 /** Receives detached values after response, actor callbacks and separation.
  * Mutating this record cannot change the simulation or its callback values. */
 onResolvedContact?:(event:OriginalPhysicsContactDiagnostic)=>void;
}
interface SweepMemo {wx?:number;wy?:number;wz?:number;fx:number;fy:number;fz:number;tx:number;ty:number;tz:number;contact:OriginalProjectileContact|null}
interface Body {angular?:OriginalAngularBody;sweepMemo?:SweepMemo;convex?:OriginalConvexPolytope;state:OriginalPlayerBody|OriginalProjectileState|OriginalMovableBody;player?:OriginalPlayerBody;projectile?:OriginalProjectileState;movable?:OriginalMovableBody;radius:number;mass:number;restitution:number;friction:number;id:string}
const diagnosticType=(body:Body):OriginalPhysicsContactDiagnosticBody['type']=>body.player?'player':body.projectile?body.projectile.weapon:'movable';
const angularVelocities=(a:Body,b?:Body):OriginalPhysicsContactDiagnosticVelocities=>({a:{...a.angular?.angularVelocity??{x:0,y:0,z:0}},b:{...b?.angular?.angularVelocity??{x:0,y:0,z:0}}});
const diagnosticVelocities=(a:Body,b?:Body):OriginalPhysicsContactDiagnosticVelocities=>({a:{...a.state.velocity},b:b?{...b.state.velocity}:{x:0,y:0,z:0}});
const copySweepContact=(contact:OriginalProjectileContact|null):OriginalProjectileContact|null=>contact===null?null:{
 ...contact,position:{...contact.position},normal:{...contact.normal},
 ...(contact.witnessPairs?{witnessPairs:contact.witnessPairs.map(pair=>({witnessA:{...pair.witnessA},witnessB:{...pair.witnessB}}))}:{}),
 ...(contact.witnessA?{witnessA:{...contact.witnessA}}:{}),...(contact.witnessB?{witnessB:{...contact.witnessB}}:{}),
 ...(contact.body?{body:{...contact.body,velocity:{...contact.body.velocity}}}:{}),
};
function sweepBody(body:Body,to:Vec3,environment:OriginalPhysicsEnvironment):OriginalProjectileContact|null {
 const from=body.state.position;
 const sweep=()=>{
  if(!body.convex)return environment.sweep(from,to,body.radius);
  if(!environment.sweepConvex)throw Error(`A full convex sweep is required for original ${body.movable?'movable body':body.projectile?.weapon==='launcher'?'grenade':'RPG'} joint physics`);
  return environment.sweepConvex(from,to,body.convex,body.angular?point=>originalAngularPointVelocity(from,body.state.velocity,body.angular!,point):undefined);
 };
 if(!environment.memoizePureSweep)return sweep();
 const memo=body.sweepMemo,omega=body.angular?.angularVelocity;
 if(memo&&Object.is(memo.wx,omega?.x)&&Object.is(memo.wy,omega?.y)&&Object.is(memo.wz,omega?.z)&&Object.is(memo.fx,from.x)&&Object.is(memo.fy,from.y)&&Object.is(memo.fz,from.z)
   &&Object.is(memo.tx,to.x)&&Object.is(memo.ty,to.y)&&Object.is(memo.tz,to.z))return copySweepContact(memo.contact);
 const contact=sweep();
 // A signal callback may mutate the returned contact; keep a detached cache
 // entry and hand out a fresh result on each reuse, preserving callback order.
 body.sweepMemo={wx:omega?.x,wy:omega?.y,wz:omega?.z,fx:from.x,fy:from.y,fz:from.z,tx:to.x,ty:to.y,tz:to.z,contact:copySweepContact(contact)};
 return contact;
}
/** Rotation is conservatively sampled within source substeps. This is a
 * bounded reconstruction, not native rotational CCD: each sampled hull is
 * swept without changing its orientation, then the complete hull is rotated. */
function angularInterval(bodies:readonly Body[],remaining:number,contactDistance:number):number {
 let interval=remaining;
 for(const body of bodies)if(body.angular){
  const speed=length(body.angular.angularVelocity)*Math.PI/180;
  if(speed>0){
   const extent=body.radius+length(body.angular.centerOfMass);
   const allowance=contactDistance>0?contactDistance*.5:Math.max(extent*.005,1e-8);
   interval=Math.min(interval,(5*Math.PI/180)/speed,allowance/(speed*Math.max(extent,1e-8)));
  }
 }
 return interval;
}
function advanceBody(body:Body,seconds:number):void {
 body.state.position=body.angular?advanceOriginalAngularBody(body.state.position,body.state.velocity,body.angular,seconds):add(body.state.position,mul(body.state.velocity,seconds));
 if(body.angular){
  const convex=originalAngularConvex(body.angular);
  if(convex!==body.convex)body.sweepMemo=undefined;
  body.convex=convex;if(body.projectile)body.projectile.convex=convex;if(body.movable)body.movable.convex=convex;
 }
}
function predictedPivot(body:Body,seconds:number):Vec3 {
 return body.angular?advanceOriginalAngularBody(body.state.position,body.state.velocity,cloneOriginalAngularBody(body.angular),seconds):add(body.state.position,mul(body.state.velocity,seconds));
}
function velocityAt(body:Body,point?:Vec3):Vec3 {
 return body.angular&&point?originalAngularPointVelocity(body.state.position,body.state.velocity,body.angular,point):body.state.velocity;
}
interface Event {a:Body;b?:Body;fraction:number;normal:Vec3;contact?:OriginalProjectileContact;penetrationDepth?:number;surfaceWitnesses?:{a:Vec3;b:Vec3};witnessPairs?:Array<{witnessA:Vec3;witnessB:Vec3}>}
/** A translated angular hull predicts a candidate, not actual pose contact. */
function refineAngularPairAtPose(event:Event,T:number):Event|undefined {
 const {a,b}=event;if(!b||!(a.angular||b.angular)||!(a.convex||b.convex))return event;
 const hit=a.convex&&b.convex?(T>0?sweepOriginalConvexPairDistance(a.convex,a.state.position,a.state.position,b.convex,b.state.position,b.state.position,T):sweepOriginalConvexPair(a.convex,a.state.position,a.state.position,b.convex,b.state.position,b.state.position))
  :a.convex?sweepOriginalConvexSphere(a.convex,a.state.position,a.state.position,b.state.position,b.state.position,b.radius,T)
  :sweepOriginalConvexSphere(b.convex!,b.state.position,b.state.position,a.state.position,a.state.position,a.radius,T);
 if(!hit)return;
 const normal=a.convex?hit.normalBToA:mul(hit.normalBToA,-1);
 const patch=a.convex&&b.convex?originalConvexPairPatch(a.convex,a.state.position,b.convex,b.state.position,normal):null;
 const witnessA=patch?.witnessA??(a.convex?hit.witnessA:hit.witnessB),witnessB=patch?.witnessB??(a.convex?hit.witnessB:hit.witnessA);
 return {a,b,fraction:event.fraction,normal,penetrationDepth:hit.penetrationDepth,
  ...(patch?{witnessPairs:patch.pairs}:{}),...(witnessA&&witnessB?{surfaceWitnesses:{a:witnessA,b:witnessB}}:{})};
}
/** Refresh the exact selected finite feature, never an arbitrary touching row. */
function refineAngularFixedAtPose(event:Event,T:number):Event|undefined {
 const {a,contact}=event;
 if(!a.convex||!contact?.fixedFeature||contact.body)return event;
 const fresh=contact.fixedFeature.refresh(a.convex,a.state.position,T);
 if(!fresh)return;
 const current:OriginalProjectileContact={...fresh,fraction:event.fraction,fixedFeature:contact.fixedFeature};
 return {a,fraction:event.fraction,normal:norm(fresh.normal),contact:current,penetrationDepth:fresh.penetrationDepth,
  ...(fresh.witnessPairs?{witnessPairs:fresh.witnessPairs}:{}),
  ...(fresh.witnessA&&fresh.witnessB?{surfaceWitnesses:{a:fresh.witnessA,b:fresh.witnessB}}:{})};
}
interface PreparedIsland {
 events:Event[];rows:OriginalIslandContact[];initial:OriginalAngularContactBody[];
 response:OriginalContactIslandResult;actors:OriginalAngularContactBody[];projection:OriginalContactIslandResult;
}
const finiteVector=(v:Vec3)=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
/** Prepare all response and known handler mutations without observable effects.
 * Native interest multiplicity is unproved: one notification per active surface
 * row is an explicit reconstruction, separate from numerical solver passes. */
function prepareContactIsland(bodies:readonly Body[],environment:OriginalPhysicsEnvironment,contactDistance:number,selected:Event):PreparedIsland|undefined {
 if(!environment.contactsSphere||!environment.contactsConvex)return;
 const events:Event[]=[],rows:OriginalIslandContact[]=[],fixed=bodies.length;
 const append=(event:Event,ia:number,ib:number):boolean=>{
  const pairs=event.witnessPairs??(event.surfaceWitnesses?[{witnessA:event.surfaceWitnesses.a,witnessB:event.surfaceWitnesses.b}]:undefined);
  if(!pairs?.length||!finiteVector(event.normal)||length(event.normal)===0||pairs.some(pair=>!finiteVector(pair.witnessA)||!finiteVector(pair.witnessB))
   ||(event.penetrationDepth!==undefined&&(!Number.isFinite(event.penetrationDepth)||event.penetrationDepth<0)))return false;
  events.push(event);rows.push({bodyA:ia,bodyB:ib,normal:event.normal,pairs,
   restitution:Math.min(event.a.restitution,event.b?.restitution??ORIGINAL_FIXED_RESTITUTION),friction:Math.min(event.a.friction,event.b?.friction??ORIGINAL_FIXED_FRICTION)});return true;
 };
 for(let i=0;i<bodies.length;i++){
  const a=bodies[i],contacts=a.convex?environment.contactsConvex(a.state.position,a.convex):environment.contactsSphere(a.state.position,a.radius);
  for(const raw of contacts){
   if(!finiteVector(raw.normal)||length(raw.normal)===0||(raw.fraction??0)!==0)return;
   const contact=copySweepContact(raw)!;
   if(!append({a,fraction:0,normal:norm(contact.normal),contact,penetrationDepth:contact.penetrationDepth,
    ...(contact.witnessPairs?{witnessPairs:contact.witnessPairs}:{}),...(contact.witnessA&&contact.witnessB?{surfaceWitnesses:{a:contact.witnessA,b:contact.witnessB}}:{})},i,fixed))return;
  }
 }
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
  const a=bodies[i],b=bodies[j];
  if(environment.playerPairContacts===false&&a.player&&b.player)continue;
  const offset=sub(a.state.position,b.state.position),distance=length(offset);
  if(distance>a.radius+b.radius+contactDistance)continue;
  if(a.convex||b.convex){
   const hit=a.convex&&b.convex?(contactDistance>0?sweepOriginalConvexPairDistance(a.convex,a.state.position,a.state.position,b.convex,b.state.position,b.state.position,contactDistance):sweepOriginalConvexPair(a.convex,a.state.position,a.state.position,b.convex,b.state.position,b.state.position))
    :a.convex?sweepOriginalConvexSphere(a.convex,a.state.position,a.state.position,b.state.position,b.state.position,b.radius,contactDistance)
    :sweepOriginalConvexSphere(b.convex!,b.state.position,b.state.position,a.state.position,a.state.position,a.radius,contactDistance);
   if(!hit)continue;
   const n=a.convex?hit.normalBToA:mul(hit.normalBToA,-1),patch=a.convex&&b.convex?originalConvexPairPatch(a.convex,a.state.position,b.convex,b.state.position,n):null;
   const witnessA=patch?.witnessA??(a.convex?hit.witnessA:hit.witnessB),witnessB=patch?.witnessB??(a.convex?hit.witnessB:hit.witnessA);
   if(!append({a,b,fraction:0,normal:n,penetrationDepth:hit.penetrationDepth,
    ...(patch?{witnessPairs:patch.pairs}:{}),...(witnessA&&witnessB?{surfaceWitnesses:{a:witnessA,b:witnessB}}:{})},i,j))return;
  }else{
   // Coincident centers have no established witness direction. Retain the
   // existing bounded response rather than inventing an island surface.
   if(distance<=1e-12)return;
   const n=mul(offset,1/distance),witnessA=sub(a.state.position,mul(n,a.radius)),witnessB=add(b.state.position,mul(n,b.radius));
   if(!append({a,b,fraction:0,normal:n,penetrationDepth:Math.max(0,a.radius+b.radius-distance),surfaceWitnesses:{a:witnessA,b:witnessB}},i,j))return;
  }
 }
 if(!rows.length||!events.some(event=>event.a===selected.a&&event.b===selected.b&&dot(event.normal,selected.normal)>=1-16*Number.EPSILON))return;
 const initial:OriginalAngularContactBody[]=bodies.map(body=>({position:{...body.state.position},velocity:{...body.state.velocity},mass:body.mass,...(body.angular?{angular:cloneOriginalAngularBody(body.angular)}:{})}));
 initial.push({position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},mass:Infinity});
 const valid=(result:OriginalContactIslandResult)=>result.converged&&Number.isFinite(result.maxNormalResidual)&&Number.isFinite(result.maxImpulseUpdate)
  &&result.velocities.every(finiteVector)&&result.angularVelocities.every(v=>v===null||finiteVector(v));
 const response=resolveOriginalContactIsland(initial,rows);if(!valid(response)||!response.contacts.some(contact=>contact.active))return;
 const actors=initial.map((body,i)=>({...body,velocity:{...response.velocities[i]},...(body.angular?{angular:{...body.angular,angularVelocity:{...response.angularVelocities[i]!}}}:{})}));
 for(let i=0;i<events.length;i++)if(response.contacts[i].active){
  const event=events[i],row=rows[i];
  for(const [body,index] of [[event.a,row.bodyA],[event.b,row.bodyB]] as const)if(body?.projectile?.weapon==='launcher')actors[index].velocity=mul(actors[index].velocity,.85);
 }
 // Handler setters can re-close another touching row. Re-project every row,
 // including initially separating support, before committing or dispatching.
 const projection=resolveOriginalContactIsland(actors,rows.map(row=>({...row,restitution:0})));if(!valid(projection))return;
 return {events,rows,initial,response,actors,projection};
}
/** Sphere/convex triangle and relative body sweeps are an explicit reconstruction,
 * not native Havok. Bodies advance together through collision time, exchange
 * momentum, then advance the remaining substep. Material coefficients combine
 * by minimum; native manifold/rotation/coefficient rules remain unproved. */
export function stepOriginalPhysicsWorld(players:readonly OriginalPlayerBody[],projectiles:readonly OriginalProjectileState[],environment:OriginalPhysicsEnvironment):OriginalPhysicsWorldResult {
 const contactDistance=environment.contactDistance??0;
 if(!Number.isFinite(contactDistance)||contactDistance<0)throw Error('Invalid original contact distance');
 const movableBodies=environment.movableBodies??[];
 for(const body of movableBodies){
  if(![body.radius,body.mass,body.restitution,body.friction,...Object.values(body.position),...Object.values(body.velocity)].every(Number.isFinite)||body.radius<=0||body.mass<=0||body.restitution<0||body.friction<0
   ||body.convex.vertices.some(vertex=>length(vertex)>body.radius+1e-12))throw Error('Invalid original movable body');
 }
 const bodies:Body[]=[...players.map(player=>({state:player,player,radius:ORIGINAL_PLAYER_RADIUS,mass:1,restitution:.1,friction:1,id:player.id})),...projectiles.filter(p=>p.remainingCallbacks>0).map((projectile,i)=>({state:projectile,projectile,angular:projectile.angular,convex:projectile.angular?originalAngularConvex(projectile.angular):projectile.convex,radius:ORIGINAL_PROJECTILE_RADIUS[projectile.weapon],mass:projectile.weapon==='launcher'?1:100,restitution:projectile.weapon==='launcher'?.2:1,friction:projectile.weapon==='launcher'?.5:0,id:`projectile:${i}`})),...movableBodies.map(movable=>({state:movable,movable,angular:movable.angular,convex:movable.angular?originalAngularConvex(movable.angular):movable.convex,radius:movable.radius,mass:movable.mass,restitution:movable.restitution,friction:movable.friction,id:movable.id}))];
 let contacts=0,advancedTime=0,remainingTime=0;
 const substeps:OriginalPhysicsSubstepClock[]=[];
 const signal=(body:Body,n:Vec3,other?:Body,contact?:OriginalProjectileContact,knownDampingAlreadyApplied=false)=>{
  if(body.player){if(n.y>.5)body.player.supported=true;environment.onPlayerContact?.(body.player,n,other?.id);}
  if(body.movable)environment.onMovableContact?.(body.movable,n,other?.id);
  if(body.projectile){if(body.projectile.weapon==='launcher'){if(!knownDampingAlreadyApplied)body.state.velocity=mul(body.state.velocity,.85);}else body.projectile.hit=true;environment.onProjectileContact?.(body.projectile,contact??{position:{...body.state.position},normal:n,body:other?{id:other.id,velocity:{...other.state.velocity},mass:other.mass,restitution:other.restitution,friction:other.friction}:undefined});}
 };
 for(let step=0;step<ORIGINAL_PHYSICS_SUBSTEPS;step++){
  const dt=ORIGINAL_PHYSICS_STEP/ORIGINAL_PHYSICS_SUBSTEPS;
  for(const body of bodies)body.state.velocity.y+=ORIGINAL_PLAYER_GRAVITY*dt;
  let remaining=dt,substepAdvanced=0,iterations=0;
  // Bounded continuous collision solver: a pathological manifold may consume
  // its budget; remaining movement is then discarded rather than tunnelled.
  for(let iteration=0;iteration<48&&remaining>1e-9;iteration++){
   iterations++;
   const interval=angularInterval(bodies,remaining,contactDistance);
   let earliest:Event|undefined;
   const destinations=new Map(bodies.map(body=>[body,predictedPivot(body,interval)]));
   for(const a of bodies){
    const to=destinations.get(a)!;
    const contact=sweepBody(a,to,environment);
    if(contact){
     const n=norm(contact.normal),travel=sub(to,a.state.position);
     const fraction=Math.max(0,Math.min(1,contact.fraction??(dot(travel,travel)>0?dot(sub(contact.position,a.state.position),travel)/dot(travel,travel):0)));
     if(a.player&&fraction<=1e-8&&n.y>.5)a.player.supported=true;
     // Ignore zero-time separating contacts; no bounce/damping is warranted.
     if(fraction>1e-8||(contact.witnessPairs?.length?contact.witnessPairs.some(pair=>dot(velocityAt(a,pair.witnessA),n)<-1e-8):dot(velocityAt(a,contact.witnessA),n)<-1e-8)){const e:Event={a,fraction,normal:n,contact,...(contact.witnessPairs?{witnessPairs:contact.witnessPairs.map(pair=>({witnessA:{...pair.witnessA},witnessB:{...pair.witnessB}}))}:{}),...(contact.witnessA&&contact.witnessB?{surfaceWitnesses:{a:{...contact.witnessA},b:{...contact.witnessB}}}:{})};if(!earliest||e.fraction<earliest.fraction)earliest=e;}
    }
   }
   for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
    const a=bodies[i],b=bodies[j];
    if(environment.playerPairContacts===false&&a.player&&b.player)continue;
    const offset=sub(a.state.position,b.state.position),travel=a.angular||b.angular?sub(sub(destinations.get(a)!,a.state.position),sub(destinations.get(b)!,b.state.position)):mul(sub(a.state.velocity,b.state.velocity),interval),radius=a.radius+b.radius;
    if(a.convex||b.convex){
     // Pivot-centered bounds reject distant pairs only. Narrow phase preserves
     // the entire oriented hull, including its original off-axis offset.
     if(length(offset)>radius+contactDistance+length(travel))continue;
     const toA=destinations.get(a)!,toB=destinations.get(b)!;
     const hit=a.convex&&b.convex?(contactDistance>0?sweepOriginalConvexPairDistance(a.convex,a.state.position,toA,b.convex,b.state.position,toB,contactDistance):sweepOriginalConvexPair(a.convex,a.state.position,toA,b.convex,b.state.position,toB))
       :a.convex?sweepOriginalConvexSphere(a.convex,a.state.position,toA,b.state.position,toB,b.radius,contactDistance)
       :sweepOriginalConvexSphere(b.convex!,b.state.position,toB,a.state.position,toA,a.radius,contactDistance);
     if(!hit)continue;
     const n=a.convex?hit.normalBToA:mul(hit.normalBToA,-1);
     const patch=a.convex&&b.convex?originalConvexPairPatch(a.convex,add(a.state.position,mul(sub(toA,a.state.position),hit.fraction)),b.convex,add(b.state.position,mul(sub(toB,b.state.position),hit.fraction)),n):null;
     const witnessA=patch?.witnessA??(a.convex?hit.witnessA:hit.witnessB),witnessB=patch?.witnessB??(a.convex?hit.witnessB:hit.witnessA);
     // Existing touching pairs can support a stationary/separating player.
     // Future candidates may be preempted by an earlier collision; only the
     // selected event's signal is allowed to latch support for those hits.
     // A future rotating-hull candidate does not establish current support.
     // Its actual pose is checked after advancing before any selected signal.
     if(hit.fraction===0||(!(a.angular||b.angular)&&hit.fraction<=1e-8)){if(a.player&&n.y>.5)a.player.supported=true;if(b.player&&-n.y>.5)b.player.supported=true;}
     if(hit.fraction<=1e-8&&(patch?patch.pairs.every(pair=>dot(sub(velocityAt(a,pair.witnessA),velocityAt(b,pair.witnessB)),n)>=-1e-12):dot(sub(velocityAt(a,witnessA),velocityAt(b,witnessB)),n)>=-1e-12))continue;
     const event:Event={a,b,fraction:hit.fraction,normal:n,penetrationDepth:hit.penetrationDepth,...(patch?{witnessPairs:patch.pairs}:{}),
      ...(witnessA&&witnessB?{surfaceWitnesses:{a:witnessA,b:witnessB}}:{}),
     };if(!earliest||event.fraction<earliest.fraction)earliest=event;
     continue;
    }
    const detectionRadius=radius+contactDistance,c=dot(offset,offset)-detectionRadius*detectionRadius,v=dot(travel,travel),projection=dot(offset,travel);
    let f:number;
    if(c<=1e-10){
     const n=norm(offset);if(a.player&&n.y>.5)a.player.supported=true;if(b.player&&-n.y>.5)b.player.supported=true;
     if(projection>=-1e-12)continue;f=0;
    }else{const discriminant=projection*projection-v*c;if(v<=1e-20||projection>=0||discriminant<0)continue;f=(-projection-Math.sqrt(discriminant))/v;if(f<0||f>1)continue;}
    const e={a,b,fraction:f,normal:norm(add(offset,mul(travel,f)))};if(!earliest||e.fraction<earliest.fraction)earliest=e;
   }
   const remainingBefore=remaining;
   const fraction=earliest?.fraction??1;
   // Keep the exact swept orientation independently of the single-entry hull
   // cache: another body sharing the reference hull can evict that cache.
   const angularPoseA=fraction>0&&earliest?.a.angular?{...earliest.a.angular.orientation}:undefined;
   const angularPoseB=fraction>0&&earliest?.b?.angular?{...earliest.b.angular.orientation}:undefined;
   const duration=interval*fraction;
   for(const body of bodies)advanceBody(body,duration);
   substepAdvanced+=duration;
   remaining=interval===remaining?remaining*(1-fraction):remaining-interval*fraction;if(!earliest)continue;
   // Translation of a frozen angular hull can predict contact at a pose where
   // the real rotated feature has moved away. Time already advanced remains
   // accounted for; requery the rest instead of dispatching a stale handler.
   const angularPoseChanged=(angularPoseA&&(['x','y','z','w'] as const).some(axis=>!Object.is(angularPoseA[axis],earliest!.a.angular!.orientation[axis])))
    ||(angularPoseB&&(['x','y','z','w'] as const).some(axis=>!Object.is(angularPoseB[axis],earliest!.b!.angular!.orientation[axis])));
   // An unchanged orientation retains the valid translated sweep. Requiring a
   // second strict static SAT would lose T=0 contacts to translation roundoff.
   if(fraction>0&&angularPoseChanged){
    const refined=earliest.b?refineAngularPairAtPose(earliest,contactDistance):refineAngularFixedAtPose(earliest,contactDistance);if(!refined)continue;earliest=refined;
   }
   if(fraction===0&&(earliest.a.angular||earliest.b?.angular)){
    const island=prepareContactIsland(bodies,environment,contactDistance,earliest);
    if(island){
     const {events,rows,initial,response,actors,projection}=island;
     for(let i=0;i<bodies.length;i++){
      const body=bodies[i];body.state.velocity={...projection.velocities[i]};
      if(body.angular)body.angular.angularVelocity={...projection.angularVelocities[i]!};
      body.sweepMemo=undefined;
     }
     const pairVelocities=(values:readonly Vec3[],ia:number,ib:number):OriginalPhysicsContactDiagnosticVelocities=>({a:{...values[ia]},b:{...values[ib]}});
     const spins=(values:readonly (Vec3|null)[],ia:number,ib:number):OriginalPhysicsContactDiagnosticVelocities=>({a:{...values[ia]??{x:0,y:0,z:0}},b:{...values[ib]??{x:0,y:0,z:0}}});
     for(let i=0;i<events.length;i++){
      const event=events[i],{a,b,normal:n,contact}=event,row=rows[i];
      // Touching support participates even when another impulse activates it.
      if(a.player&&n.y>.5)a.player.supported=true;if(b?.player&&-n.y>.5)b.player.supported=true;
      if(!response.contacts[i].active)continue;
      signal(a,n,b,contact,true);if(b)signal(b,mul(n,-1),a,undefined,true);
      const separation=Math.max(0,event.penetrationDepth??0)+1e-7,inverseA=1/a.mass,inverseB=b?1/b.mass:0,total=inverseA+inverseB;
      a.state.position=add(a.state.position,mul(n,separation*inverseA/total));if(b)b.state.position=sub(b.state.position,mul(n,separation*inverseB/total));
      contacts++;
      if(environment.onResolvedContact){
       const ia=row.bodyA,ib=row.bodyB,substepTime=dt-remaining;
       const actorVelocities=actors.map(body=>body.velocity),initialVelocities=initial.map(body=>body.velocity);
       const actorSpins=actors.map(body=>body.angular?.angularVelocity??null),initialSpins=initial.map(body=>body.angular?.angularVelocity??null);
       environment.onResolvedContact({substepIndex:step,iteration,time:step*dt+substepTime,substepTime,
        remainingBefore,remainingAfter:remaining,fraction:0,penetrationDepth:event.penetrationDepth??contact?.penetrationDepth,
        bodyA:{id:a.id,type:diagnosticType(a)},bodyB:b?{id:b.id,type:diagnosticType(b)}:{id:contact?.body?.id??'fixed',type:'fixed'},normal:{...n},
        ...(event.surfaceWitnesses?{surfaceWitnesses:{a:{...event.surfaceWitnesses.a},b:{...event.surfaceWitnesses.b}}}:{}),
        beforeResponse:pairVelocities(initialVelocities,ia,ib),afterResponse:pairVelocities(response.velocities,ia,ib),afterActorCallbacks:pairVelocities(actorVelocities,ia,ib),afterConstraintProjection:pairVelocities(projection.velocities,ia,ib),
        ...(a.angular||b?.angular?{angularBeforeResponse:spins(initialSpins,ia,ib),angularAfterResponse:spins(response.angularVelocities,ia,ib),angularAfterActorCallbacks:spins(actorSpins,ia,ib),angularAfterConstraintProjection:spins(projection.angularVelocities,ia,ib)}:{}),
        island:{contacts:events.length,responseIterations:response.iterations,projectionIterations:projection.iterations},
       });
      }
     }
     // Do not advance the remaining interval here. Requery the complete moving
     // hulls through the existing sampled angular/relative-motion sweeps.
     continue;
    }
   }
   const {a,b,normal:n,contact}=earliest;
   if(contact&&!a.angular)a.state.position={...contact.position};
   const observer=environment.onResolvedContact;
   const beforeResponse=observer?diagnosticVelocities(a,b):undefined;
   const angularBeforeResponse=observer&&(a.angular||b?.angular)?angularVelocities(a,b):undefined;
   const restitution=Math.min(a.restitution,b?.restitution??ORIGINAL_FIXED_RESTITUTION),friction=Math.min(a.friction,b?.friction??ORIGINAL_FIXED_FRICTION);
   const witnesses=earliest.surfaceWitnesses;
   const response=(a.angular||b?.angular)&&witnesses?resolveOriginalAngularManifold(
    {position:a.state.position,velocity:a.state.velocity,mass:a.mass,angular:a.angular},
    b?{position:b.state.position,velocity:b.state.velocity,mass:b.mass,angular:b.angular}:{position:witnesses.b,velocity:{x:0,y:0,z:0},mass:Infinity},n,earliest.witnessPairs?.length?earliest.witnessPairs:[{witnessA:witnesses.a,witnessB:witnesses.b}],restitution,friction)
    :resolveOriginalBodyContact(a.state.velocity,b?.state.velocity??{x:0,y:0,z:0},n,a.mass,b?.mass??Infinity,restitution,friction);
   a.state.velocity=response.velocityA;if(b)b.state.velocity=response.velocityB;
   const afterResponse=observer?diagnosticVelocities(a,b):undefined;
   const angularAfterResponse=angularBeforeResponse?angularVelocities(a,b):undefined;
   signal(a,n,b,contact);if(b)signal(b,mul(n,-1),a);
   const afterActorCallbacks=observer?diagnosticVelocities(a,b):undefined;
   const angularAfterActorCallbacks=angularBeforeResponse?angularVelocities(a,b):undefined;
   // Separate a numerical overlap by inverse mass without fixing either body.
   const separation=b?(a.convex||b.convex?Math.max(0,earliest.penetrationDepth??0)+1e-7:Math.max(1e-7,a.radius+b.radius-length(sub(a.state.position,b.state.position))+1e-7)):Math.max(0,contact?.penetrationDepth??0)+1e-7;
   const inverseA=1/a.mass,inverseB=b?1/b.mass:0,total=inverseA+inverseB;
   a.state.position=add(a.state.position,mul(n,separation*inverseA/total));if(b)b.state.position=sub(b.state.position,mul(n,separation*inverseB/total));
   contacts++;
   if(observer){
    const substepTime=dt-remaining;
    observer({substepIndex:step,iteration,time:step*dt+substepTime,substepTime,
     remainingBefore,remainingAfter:remaining,fraction,penetrationDepth:earliest.penetrationDepth??contact?.penetrationDepth,
     bodyA:{id:a.id,type:diagnosticType(a)},
     bodyB:b?{id:b.id,type:diagnosticType(b)}:{id:contact?.body?.id??'fixed',type:'fixed'},
     normal:{...n},...(earliest.surfaceWitnesses?{surfaceWitnesses:{a:{...earliest.surfaceWitnesses.a},b:{...earliest.surfaceWitnesses.b}}}:{}),
     ...(angularBeforeResponse?{angularBeforeResponse,angularAfterResponse,angularAfterActorCallbacks}:{}),
     beforeResponse:beforeResponse!,afterResponse:afterResponse!,afterActorCallbacks:afterActorCallbacks!,
    });
   }
  }
  advancedTime+=substepAdvanced;remainingTime+=remaining;
  substeps.push(Object.freeze({index:step,requestedTime:dt,advancedTime:substepAdvanced,remainingTime:remaining,iterations,
   kind:!Number.isFinite(remaining)||remaining<0||!Number.isFinite(substepAdvanced)||substepAdvanced<0?'invalid-clock':
    remaining===0?'complete':remaining<=1e-9?'time-cutoff':'event-cap'}));
 }
 return Object.freeze({contacts,kind:substeps.every(step=>step.kind==='complete')?'complete':'incomplete',
  requestedTime:ORIGINAL_PHYSICS_STEP,advancedTime,remainingTime,substeps:Object.freeze(substeps)});
}
