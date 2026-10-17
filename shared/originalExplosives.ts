import {createOriginalAngularBody,cloneOriginalAngularBody,originalAngularConvex,originalAngularPointVelocity,advanceOriginalAngularBody,resolveOriginalAngularManifold,type OriginalAngularBody} from './originalAngularBody';
import {originalGrenadeConvex} from './originalGrenadeShape';
import {originalGrenadeBasisFromDirection} from './originalGrenadeOrientation';
import type {Vec3} from './protocol';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
import {originalRpgConvex,originalRpgBasisFromSourceRotation,ORIGINAL_RPG_PIVOT_BOUND} from './originalRpgShape';
import type {OriginalConvexPolytope,OriginalFixedConvexFeature} from './originalConvexSweep';
import {originalProjectileRotationMatchesDirection} from './originalProjectileOrientation';

/** Preserved grenades/rockets/bangs/worldphysics scripts. Elapsed scheduling at
 * 30 Hz is a client adaptation; each source physics callback advances .05 s.
 * Continuous sphere/convex sweeps, semi-implicit integration and coefficient combination below
 * are explicit adapters, not an implementation of the native Havok runtime. */
export const ORIGINAL_EXPLOSIVE_CALLBACK_HZ = 30;
export const ORIGINAL_PHYSICS_STEP = .05;
export const ORIGINAL_PHYSICS_SUBSTEPS = 10;
/** Adapter work limits, not recovered native Havok constants. Selected
 * collision candidates, including rejected refreshes, retain their allowance;
 * ordinary no-contact angular samples have a separate bounded allowance. */
export const ORIGINAL_PHYSICS_MAX_SWEEPS_PER_SUBSTEP=512;
export const ORIGINAL_PHYSICS_MAX_EVENTS_PER_SUBSTEP=48;
/** worldphysics.Initialize(scene,1,1): one TOTAL surface separation in scene units. */
export const ORIGINAL_COLLISION_CONTACT_DISTANCE = ORIGINAL_MAP_SCALE;
export const ORIGINAL_PROJECTILE_GRAVITY = -400 * ORIGINAL_MAP_SCALE;
export const ORIGINAL_BLAST_RADIUS = 250 * ORIGINAL_MAP_SCALE;
export const ORIGINAL_BLAST_DAMAGE = 5;
export const ORIGINAL_BLAST_CALLBACKS = 16;
export const ORIGINAL_ROCKET_PROXIMITY = 35 * ORIGINAL_MAP_SCALE;
export const ORIGINAL_GRENADE_MASS = 1;
export const ORIGINAL_PLAYER_MASS = 1;
export const ORIGINAL_ROCKET_MASS = 100;
/** setupmodels passes six positional arguments to a five-parameter makefixed:
 * slot3 restitution=1, slot4 friction=.1, trailing1 is outside the signature. */
export const ORIGINAL_FIXED_RESTITUTION = 1;
export const ORIGINAL_FIXED_FRICTION = .1;
/** Broad-phase bounds around each retained resource pivot. Both projectile
 * narrow phases use their recovered convex support points. */
export const ORIGINAL_PROJECTILE_RADIUS = {
  launcher:2.7497782490023486*ORIGINAL_MAP_SCALE,
  rpg:ORIGINAL_RPG_PIVOT_BOUND,
} as const;
export type OriginalExplosiveWeapon = 'launcher'|'rpg';
export interface OriginalEye {id:string;position:Vec3}
export interface OriginalProjectileState {
  weapon:OriginalExplosiveWeapon;shooterId:string;position:Vec3;velocity:Vec3;
  direction:Vec3;remainingCallbacks:number;hit:boolean;
  /** Pre-recoil source degrees, not recoverable uniquely from direction. */
  sourceRotation?:Readonly<Vec3>;
  convex?:OriginalConvexPolytope;
  /** Reconstructed angular dynamics; launch direction/rotation remain immutable. */
  angular?:OriginalAngularBody;
}
export interface OriginalProjectileContact {
  /** Physical body pivot at contact, not the triangle surface point. */
  position:Vec3;normal:Vec3;fraction?:number;
  penetrationDepth?:number;
  /** Actual surface witnesses, when the geometric query establishes them. */
  witnessA?:Vec3;witnessB?:Vec3;
  witnessPairs?:Array<{witnessA:Vec3;witnessB:Vec3}>;
  /** Immutable selected scene feature, preserved through contact copies. */
  fixedFeature?:OriginalFixedConvexFeature;
  /** Optional dynamic body contact. Without it, the contact is a fixed triangle. */
  body?:{id:string;velocity:Vec3;mass:number;restitution:number;friction:number};
}
export interface OriginalProjectileEnvironment {
  sweep:(from:Vec3,to:Vec3,radius:number)=>OriginalProjectileContact|null;
  sweepConvex?:(from:Vec3,to:Vec3,shape:OriginalConvexPolytope,surfaceVelocity?:(point:Vec3)=>Vec3)=>OriginalProjectileContact|null;
  /** Sphere radius or convex broad-phase bound. */
  radius:number;eyes?:readonly OriginalEye[];localEye?:Vec3;
  onContact?:(contact:OriginalProjectileContact,state:OriginalProjectileState,bodyVelocity?:Vec3)=>void;
}
export interface OriginalBlastState {
  weapon:OriginalExplosiveWeapon;shooterId:string;position:Vec3;remainingCallbacks:number;
}
const copy=(v:Vec3):Vec3=>({...v});
const scale=(v:Vec3,n:number):Vec3=>({x:v.x*n,y:v.y*n,z:v.z*n});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const add=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const subtract=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const magnitude=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
const normalized=(v:Vec3):Vec3=>{const length=magnitude(v);if(!Number.isFinite(length)||length===0)throw new Error('Invalid original projectile direction/normal');return scale(v,1/length);};
const within=(a:Vec3,b:Vec3,r:number)=>magnitude(subtract(a,b))<r;

export function createOriginalProjectile(weapon:OriginalExplosiveWeapon,eye:Vec3,direction:Vec3,shooterId:string,sourceRotation?:Vec3):OriginalProjectileState {
  const aim=normalized(direction);
  if(weapon==='rpg'&&sourceRotation&&!originalProjectileRotationMatchesDirection(sourceRotation,aim))throw Error('Original RPG rotation does not match its launch direction');
  // Standalone legacy fixtures may supply only direction. Actual Game launch
  // and protocol9 source RPG snapshots preserve the pre-recoil rotation.
  const rotation=weapon==='rpg'?Object.freeze({...sourceRotation??{x:Math.asin(aim.y)*180/Math.PI,y:0,z:Math.atan2(-aim.x,-aim.z)*180/Math.PI}}):undefined;
  const convex=rotation?originalRpgConvex(originalRpgBasisFromSourceRotation(rotation)):originalGrenadeConvex(originalGrenadeBasisFromDirection(aim));
  return {weapon,shooterId,direction:aim,position:weapon==='rpg'?add(eye,scale(aim,50*ORIGINAL_MAP_SCALE)):copy(eye),
    velocity:scale(aim,(weapon==='rpg'?800:1300)*ORIGINAL_MAP_SCALE),remainingCallbacks:weapon==='rpg'?200:60,hit:false,
    convex,angular:createOriginalAngularBody(convex,weapon==='launcher'?ORIGINAL_GRENADE_MASS:ORIGINAL_ROCKET_MASS),
    ...(rotation?{sourceRotation:rotation}:{}),};
}

/** No damage or detonation impulse occurs here. One call is one actor callback.
 * World collision resolves the projectile shape using the actual triangle
 * normal supplied by the caller. Grenade hitobj then damps all velocity by .85.
 * Rockets retain collision flags, and reset velocity in their actor callback. */
export function stepOriginalProjectile(state:OriginalProjectileState,environment:OriginalProjectileEnvironment):{detonated:boolean;contacts:number} {
  if(!Number.isFinite(environment.radius)||environment.radius<0)throw new Error('Invalid original projectile radius');
  if(state.remainingCallbacks<=0)return {detonated:true,contacts:0};
  let contacts=0;
  for(let i=0;i<ORIGINAL_PHYSICS_SUBSTEPS;i++)contacts+=stepOriginalProjectilePhysicsSubstep(state,environment);
  return {...stepOriginalProjectileActor(state,environment),contacts};
}

/** One physics substep only; no fuse or actor reset. Joint-world callers instead
 * integrate all dynamic bodies together with relative sweeps. */
export function stepOriginalProjectilePhysicsSubstep(state:OriginalProjectileState,environment:OriginalProjectileEnvironment,dt=ORIGINAL_PHYSICS_STEP/ORIGINAL_PHYSICS_SUBSTEPS):number {
    if(!Number.isFinite(environment.radius)||environment.radius<0||!Number.isFinite(dt)||dt<=0)throw new Error('Invalid original projectile physics substep');
    state.velocity.y+=ORIGINAL_PROJECTILE_GRAVITY*dt;
    if(state.angular)return stepAngularProjectileSubstep(state,environment,dt);
    const next=add(state.position,scale(state.velocity,dt));
    if(state.convex&&!environment.sweepConvex)throw Error(`A full convex sweep is required for original ${state.weapon==='launcher'?'grenade':'RPG'} physics`);
    const contact=state.convex?environment.sweepConvex!(state.position,next,state.convex):environment.sweep(state.position,next,environment.radius);
    if(!contact){state.position=next;return 0;}
    const normal=normalized(contact.normal);
    const body=contact.body;
    // A stationary/separating skin does not create a new impact response.
    if(contact.fraction===0&&dot(subtract(state.velocity,body?.velocity??{x:0,y:0,z:0}),normal)>=0){state.position=next;return 0;}
    const contacts=1;
    state.position=copy(contact.position);
    const response=resolveOriginalBodyContact(state.velocity,body?.velocity??{x:0,y:0,z:0},normal,
      state.weapon==='launcher'?ORIGINAL_GRENADE_MASS:ORIGINAL_ROCKET_MASS,body?.mass??Infinity,
      Math.min(state.weapon==='launcher'?.2:1,body?.restitution??ORIGINAL_FIXED_RESTITUTION),
      Math.min(state.weapon==='launcher'?.5:0,body?.friction??ORIGINAL_FIXED_FRICTION));
    state.velocity=response.velocityA;
    if(state.weapon==='launcher')state.velocity=scale(state.velocity,.85);
    else state.hit=true;
    environment.onContact?.(contact,state,body?response.velocityB:undefined);
  return contacts;
}

/** Shared angular conventions with the joint world. Rotational CCD is a
 * bounded sampled-hull reconstruction; source gravity is applied once above. */
function stepAngularProjectileSubstep(state:OriginalProjectileState,environment:OriginalProjectileEnvironment,dt:number):number {
 const angular=state.angular!;let remaining=dt,contacts=0,eventIterations=0;
 if(!environment.sweepConvex)throw Error('A full convex sweep is required for angular source projectiles');
 const mass=state.weapon==='launcher'?ORIGINAL_GRENADE_MASS:ORIGINAL_ROCKET_MASS;
 for(let iteration=0;iteration<ORIGINAL_PHYSICS_MAX_SWEEPS_PER_SUBSTEP&&eventIterations<ORIGINAL_PHYSICS_MAX_EVENTS_PER_SUBSTEP&&remaining>1e-9;iteration++){
  state.convex=originalAngularConvex(angular);
  const speed=magnitude(angular.angularVelocity)*Math.PI/180,extent=environment.radius+magnitude(angular.centerOfMass);
  const interval=speed>0?Math.min(remaining,(5*Math.PI/180)/speed,ORIGINAL_COLLISION_CONTACT_DISTANCE*.5/(speed*Math.max(extent,1e-8))):remaining;
  const next=advanceOriginalAngularBody(state.position,state.velocity,cloneOriginalAngularBody(angular),interval);
  let contact=environment.sweepConvex(state.position,next,state.convex,point=>originalAngularPointVelocity(state.position,state.velocity,angular,point));
  let normal=contact?normalized(contact.normal):undefined;
  const pointVelocity=contact?.witnessA?originalAngularPointVelocity(state.position,state.velocity,angular,contact.witnessA):state.velocity;
  const delta=subtract(next,state.position),fraction=contact?Math.max(0,Math.min(1,contact.fraction??(dot(delta,delta)>0?dot(subtract(contact.position,state.position),delta)/dot(delta,delta):0))):1;
  const separating=!!contact&&fraction<=1e-8&&(contact.witnessPairs?.length?contact.witnessPairs.every(pair=>dot(subtract(originalAngularPointVelocity(state.position,state.velocity,angular,pair.witnessA),contact!.body?.velocity??{x:0,y:0,z:0}),normal!)>=0):dot(subtract(pointVelocity,contact.body?.velocity??{x:0,y:0,z:0}),normal!)>=0);
  if(!contact||separating){state.position=advanceOriginalAngularBody(state.position,state.velocity,angular,interval);remaining-=interval;continue;}
  eventIterations++;
  const previousOrientation=fraction>0&&contact.fixedFeature&&!contact.body?{...angular.orientation}:undefined;
  state.position=advanceOriginalAngularBody(state.position,state.velocity,angular,interval*fraction);remaining-=interval*fraction;
  // A frozen-hull candidate may disappear when the body actually rotates.
  // Keep the elapsed interval consumed and search the remaining time again.
  // Exact unchanged orientations retain translated zero-skin contacts.
  if(previousOrientation&&(['x','y','z','w'] as const).some(axis=>!Object.is(previousOrientation[axis],angular.orientation[axis]))){
   state.convex=originalAngularConvex(angular);
   const feature=contact.fixedFeature!,fresh=feature.refresh(state.convex,state.position,feature.contactDistance);
   if(!fresh)continue;
   contact={...fresh,fraction,fixedFeature:feature};normal=normalized(fresh.normal);
  }
  const body=contact.body,restitution=Math.min(state.weapon==='launcher'?.2:1,body?.restitution??ORIGINAL_FIXED_RESTITUTION),friction=Math.min(state.weapon==='launcher'?.5:0,body?.friction??ORIGINAL_FIXED_FRICTION);
  const response=contact.witnessA&&contact.witnessB?resolveOriginalAngularManifold(
   {position:state.position,velocity:state.velocity,mass,angular},
   {position:contact.witnessB,velocity:body?.velocity??{x:0,y:0,z:0},mass:body?.mass??Infinity},normal!,contact.witnessPairs?.length?contact.witnessPairs:[{witnessA:contact.witnessA,witnessB:contact.witnessB}],restitution,friction)
   :resolveOriginalBodyContact(state.velocity,body?.velocity??{x:0,y:0,z:0},normal!,mass,body?.mass??Infinity,restitution,friction);
  state.velocity=response.velocityA;
  if(state.weapon==='launcher')state.velocity=scale(state.velocity,.85);else state.hit=true;
  environment.onContact?.(contact,state,body?response.velocityB:undefined);
  state.position=add(state.position,scale(normal!,Math.max(0,contact.penetrationDepth??0)+1e-7));contacts++;
 }
 state.convex=originalAngularConvex(angular);return contacts;
}

/** Actor processing follows world physics and player/weapon controls. */
export function stepOriginalProjectileActor(state:OriginalProjectileState,environment:Pick<OriginalProjectileEnvironment,'eyes'|'localEye'>={}):{detonated:boolean} {
  if(state.remainingCallbacks<=0)return {detonated:true};
  state.remainingCallbacks--;
  if(state.weapon==='launcher')return {detonated:state.remainingCallbacks<=1};
  state.velocity=scale(state.direction,800*ORIGINAL_MAP_SCALE);
  const nearby=environment.localEye!==undefined&&within(state.position,environment.localEye,ORIGINAL_ROCKET_PROXIMITY)
    ||environment.eyes?.some(eye=>eye.id!==state.shooterId&&within(state.position,eye.position,ORIGINAL_ROCKET_PROXIMITY))===true;
  return {detonated:state.hit||state.remainingCallbacks===0||nearby};
}
export function createOriginalBlast(position:Vec3,shooterId:string,weapon:OriginalExplosiveWeapon):OriginalBlastState {
  return {position:copy(position),shooterId,weapon,remainingCallbacks:ORIGINAL_BLAST_CALLBACKS};
}
/** Source bangs tests the local eye each callback, including its final one.
 * Callers apply5 damage to every returned id. There is no LOS, falloff, shooter
 * immunity or impulse. Calling after expiry is idempotent and causes no damage. */
export function stepOriginalBlast(state:OriginalBlastState,eyes:readonly OriginalEye[]):{damagedPlayerIds:string[];expired:boolean} {
  if(state.remainingCallbacks<=0)return {damagedPlayerIds:[],expired:true};
  state.remainingCallbacks--;
  return {damagedPlayerIds:eyes.filter(eye=>within(state.position,eye.position,ORIGINAL_BLAST_RADIUS)).map(eye=>eye.id),expired:state.remainingCallbacks===0};
}

/** Frictional rigid-body impulse adapter. Normal points from body B to A.
 * Finite masses exchange momentum; Infinity denotes a fixed triangle body.
 * Callers supply effective coefficients because Havok's native combination
 * rule is unproved. Player/grenade use source masses1, with player rest .1.
 * Velocities must share physics units; output contains no authored jump boost. */
export function resolveOriginalBodyContact(velocityA:Vec3,velocityB:Vec3,normal:Vec3,massA:number,massB:number,restitution:number,friction:number):{velocityA:Vec3;velocityB:Vec3;impulse:Vec3} {
  if(!(massA>0&&massB>0)||!Number.isFinite(restitution)||restitution<0||!Number.isFinite(friction)||friction<0)throw new Error('Invalid original body contact');
  const n=normalized(normal),relative=subtract(velocityA,velocityB),closing=dot(relative,n);
  const invA=1/massA,invB=1/massB,inverseMass=invA+invB;
  if(closing>=0||inverseMass===0)return {velocityA:copy(velocityA),velocityB:copy(velocityB),impulse:{x:0,y:0,z:0}};
  const normalImpulse=-(1+restitution)*closing/inverseMass;
  let impulse=scale(n,normalImpulse);
  const tangent=subtract(relative,scale(n,closing)),tangentSpeed=magnitude(tangent);
  if(tangentSpeed>0)impulse=add(impulse,scale(tangent,-Math.min(tangentSpeed/inverseMass,friction*normalImpulse)/tangentSpeed));
  return {velocityA:add(velocityA,scale(impulse,invA)),velocityB:subtract(velocityB,scale(impulse,invB)),impulse};
}
