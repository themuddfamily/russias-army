import {readFileSync} from 'node:fs';
import {registerOriginalMapRuntime} from '../../shared/originalMapRuntime';
import {createOriginalProjectile,ORIGINAL_COLLISION_CONTACT_DISTANCE} from '../../shared/originalExplosives';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_RADIUS} from '../../shared/originalPlayerPhysics';
import type {Vec3} from '../../shared/protocol';

// Reconstruct one callback from recorded poses and velocities. Captured traces
// may omit retained launch direction: legacy traces estimate the basis from
// first observed velocity, which may already have bounced and is not authoritative. This replay omits controls, doors and actor aging deliberately.
const root=new URL('../../',import.meta.url);
// This retained capture contains all diagnosed samples; the mutable current
// capture can be shorter and must not silently replace the replay input.
const tracePath=process.argv[2]??'artifacts/fidelity-review/2026-10-01/current/source-assisted-pre-contact-distance/barrack-solo-successive-assisted-jump.json';
const contactDistance=process.argv.includes('--zero-contact-distance')?0:ORIGINAL_COLLISION_CONTACT_DISTANCE;
const recorded=JSON.parse(readFileSync(new URL(tracePath,root),'utf8'));
const runtime=registerOriginalMapRuntime('barrack',JSON.parse(readFileSync(new URL('public/assets/original-scenes/barrack/scene.json',root),'utf8')));
interface RecordedProjectile {position:Vec3;velocity:Vec3;direction?:Vec3;remainingCallbacks:number}
interface Sample {at:number;local:Vec3;movement:{velocity:Vec3};explosives:{projectiles:RecordedProjectile[];contactCount:number}}
const samples:Sample[]=recorded.review.samples;
const sampleIndices=[28,29,30,33];
for(const index of sampleIndices)if(!samples[index])throw Error(`Trace ${tracePath} lacks sample ${index}; no replay emitted`);
for(const index of sampleIndices){
 const sample=samples[index];if(!sample)throw Error(`Trace lacks sample ${index}`);
 const player=createOriginalPlayerBody('p',{...sample.local,y:sample.local.y+1.72},{x:sample.movement.velocity.x/1.5,y:sample.movement.velocity.y/1.5,z:sample.movement.velocity.z/1.5});
 const projectiles=sample.explosives.projectiles.map((p,i)=>{
  const launch=samples.find(s=>s.explosives.projectiles.length>i)!.explosives.projectiles[i];
  const projectile=createOriginalProjectile('launcher',p.position,p.direction??launch.direction??launch.velocity,'p');
  Object.assign(projectile,{position:{...p.position},velocity:{...p.velocity},remainingCallbacks:p.remainingCallbacks});return projectile;
 });
 const initial={player:structuredClone(player),projectiles:projectiles.map(p=>({position:{...p.position},velocity:{...p.velocity}}))};
 const identities:Record<string,number>={},firstContacts:unknown[]=[],resolvedContacts:unknown[]=[];
 const result=stepOriginalPhysicsWorld([player],projectiles,{
  contactDistance,
  sweep:(from,to,radius)=>runtime.geometry.sweepSphere(from,to,radius,contactDistance),
  sweepConvex:(from,to,shape)=>runtime.geometry.sweepConvex(from,to,shape,contactDistance),
  onResolvedContact:event=>resolvedContacts.push(event),
  onProjectileContact:(projectile,contact)=>{
   const identity=contact.body?.id??'fixed';identities[identity]=(identities[identity]??0)+1;
   if(firstContacts.length<20)firstContacts.push({projectile:projectiles.indexOf(projectile),otherId:identity,normal:contact.normal,
    // Joint pair signal does not currently expose fraction/penetrationDepth.
    fraction:contact.fraction??null,penetrationDepth:contact.penetrationDepth??null,
    position:{...projectile.position},velocityAfterHitobj:{...projectile.velocity},playerVelocity:{...player.velocity}});
  },
 });
 console.log(JSON.stringify({sample:index,contactDistance,at:sample.at,recordedContactCount:sample.explosives.contactCount,initial,result,identities,firstContacts,resolvedContacts,basisProvenance:sample.explosives.projectiles.map(p=>p.direction?'retained launch direction':'legacy estimated from first observed velocity; may have bounced'),
  final:{player,projectiles:projectiles.map(p=>({position:p.position,velocity:p.velocity}))}}));
}
// Isolate feedback without map geometry, floor, doors or friction tangents.
const player=createOriginalPlayerBody('p',{x:0,y:10,z:0},{x:0,y:3,z:0});
const grenade=createOriginalProjectile('launcher',{x:0,y:10,z:0},{x:0,y:-1,z:0},'p');
grenade.position={x:0,y:player.position.y+ORIGINAL_PLAYER_RADIUS-Math.min(...grenade.convex!.vertices.map(v=>v.y)),z:0};
grenade.velocity={x:0,y:1,z:0};
const signals:unknown[]=[],resolvedContacts:unknown[]=[];
const result=stepOriginalPhysicsWorld([player],[grenade],{contactDistance,sweep:()=>null,sweepConvex:()=>null,onResolvedContact:event=>resolvedContacts.push(event),onProjectileContact:(p,contact)=>signals.push({normal:contact.normal,velocityAfterHitobj:{...p.velocity},playerVelocity:{...player.velocity}})});
console.log(JSON.stringify({isolated:true,contactDistance,result,signals,resolvedContacts}));
