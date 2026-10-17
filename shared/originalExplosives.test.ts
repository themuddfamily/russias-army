import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import {createOriginalProjectile,stepOriginalProjectile,stepOriginalProjectilePhysicsSubstep,ORIGINAL_FIXED_RESTITUTION,ORIGINAL_FIXED_FRICTION,createOriginalBlast,stepOriginalBlast,resolveOriginalBodyContact,ORIGINAL_BLAST_DAMAGE,ORIGINAL_BLAST_RADIUS,ORIGINAL_PROJECTILE_RADIUS} from './originalExplosives';
import type {OriginalProjectileEnvironment} from './originalExplosives';
const empty:OriginalProjectileEnvironment={radius:0,sweep:()=>null,sweepConvex:()=>null};
const origin={x:0,y:0,z:0};
const convexOnly=(sweepConvex:NonNullable<OriginalProjectileEnvironment['sweepConvex']>):OriginalProjectileEnvironment=>({radius:0,sweep:()=>{throw Error('Grenade narrowphase must use its recovered convex hull');},sweepConvex});
describe('preserved explosive actor callbacks',()=>{
 it('bounds decoded projectile vertices about the retained resource pivot',()=>{
  const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as {meshes:{resource:string;positions:number[][]}[]};
  const grenade=geometry.meshes.filter(mesh=>mesh.resource==='rg6grenade').flatMap(mesh=>mesh.positions);
  const rocket=geometry.meshes.filter(mesh=>mesh.resource==='rpgrocket').flatMap(mesh=>mesh.positions);
  expect(grenade).toHaveLength(129);expect(rocket).toHaveLength(195);
  const grenadeRadius=Math.max(...grenade.map(vertex=>Math.hypot(...vertex)));
  const rocketRadius=Math.max(...rocket.map(vertex=>Math.hypot(...vertex)));
  expect(ORIGINAL_PROJECTILE_RADIUS.launcher/S).toBeCloseTo(grenadeRadius,12);
  expect(ORIGINAL_PROJECTILE_RADIUS.rpg/S).toBeCloseTo(rocketRadius,12);
  // Both radii bound broadphase only; narrowphase uses full recovered convex shapes.
  expect(Math.max(...rocket.map(vertex=>Math.hypot(...vertex)))).toBeGreaterThan(40);
 });
 it('launches grenades at the eye with unlifted source velocity, rockets50source units forward',()=>{
  const grenade=createOriginalProjectile('launcher',origin,{x:1,y:0,z:0},'p');
  expect(grenade.position).toEqual(origin);expect(grenade.velocity).toEqual({x:1300*S,y:0,z:0});
  expect(grenade.convex?.vertices).toHaveLength(75);expect(grenade.convex?.faces).toHaveLength(78);
  expect(grenade.convex?.vertices.every(p=>Math.hypot(p.x,p.y,p.z)<=ORIGINAL_PROJECTILE_RADIUS.launcher+1e-14)).toBe(true);
  const rocket=createOriginalProjectile('rpg',origin,{x:0,y:0,z:-1},'p');
  expect(rocket.position).toEqual({x:0,y:0,z:-50*S});expect(rocket.velocity.z).toBe(-800*S);
 });
 it('integrates .05 physics seconds with10 gravity substeps per callback',()=>{
  const p=createOriginalProjectile('launcher',origin,{x:1,y:0,z:0},'p');
  let calls=0;stepOriginalProjectile(p,convexOnly((_from,_to,shape)=>{expect(shape).toBe(p.convex);calls++;return null;}));
  expect(calls).toBe(10);expect(p.position.x).toBeCloseTo(1300*S*.05,12);
  // Semi-implicit adapter: sum gravity * dt² * (1+...+10).
  expect(p.position.y).toBeCloseTo(-400*S*.005*.005*55,12);expect(p.velocity.y).toBeCloseTo(-20*S,12);
 });
 it('expires grenade on callback59 regardless of elapsed wall time',()=>{
  const p=createOriginalProjectile('launcher',origin,{x:1,y:0,z:0},'p');
  for(let i=1;i<=58;i++)expect(stepOriginalProjectile(p,empty).detonated).toBe(false);
  expect(stepOriginalProjectile(p,empty).detonated).toBe(true);expect(p.remainingCallbacks).toBe(1);
 });
 it('bounces at the supplied triangle normal and damps .85 without impact detonation',()=>{
  const p=createOriginalProjectile('launcher',origin,{x:1,y:0,z:0},'p');let hit=false;
  const result=stepOriginalProjectile(p,convexOnly(from=>{if(hit)return null;hit=true;return {position:from,normal:{x:-1,y:0,z:0}};}));
  expect(result).toEqual({detonated:false,contacts:1});
  expect(p.velocity.x).toBeCloseTo(-1300*S*.2*.85,10);
 });
 it('uses positional source fixedmaterial restitution1/friction.1 rather than the trailingextra1',()=>{
  expect(ORIGINAL_FIXED_RESTITUTION).toBe(1);expect(ORIGINAL_FIXED_FRICTION).toBe(.1);
  const p=createOriginalProjectile('launcher',origin,{x:1,y:0,z:0},'p');p.velocity={x:100,y:-10,z:0};
  stepOriginalProjectilePhysicsSubstep(p,convexOnly(from=>({position:from,normal:{x:0,y:1,z:0}})));
  const impactSpeed=10+400*S*.005;
  expect(p.velocity.x).toBeCloseTo((100-.1*1.2*impactSpeed)*.85,12);
  expect(p.velocity.y).toBeCloseTo(.2*impactSpeed*.85,12);
 });
 it('uses oblique triangle normals rather than reversing only vertical motion',()=>{
  const p=createOriginalProjectile('launcher',origin,{x:1,y:0,z:0},'p');let hit=false;
  stepOriginalProjectile(p,convexOnly(from=>hit?null:(hit=true,{position:from,normal:{x:-Math.SQRT1_2,y:0,z:Math.SQRT1_2}})));
  expect(p.velocity.z).toBeGreaterThan(0);expect(p.velocity.x).toBeLessThan(1300*S*.85);
 });
 it('expires rocket on callback200 and resets its velocity after each physics callback',()=>{
  const p=createOriginalProjectile('rpg',origin,{x:1,y:0,z:0},'p');
  for(let i=1;i<=199;i++){expect(stepOriginalProjectile(p,empty).detonated).toBe(false);expect(p.velocity).toEqual({x:800*S,y:0,z:0});}
  expect(stepOriginalProjectile(p,empty).detonated).toBe(true);
 });
 it('detonates rockets after world contact',()=>{
  const p=createOriginalProjectile('rpg',origin,{x:1,y:0,z:0},'p');
  expect(stepOriginalProjectile(p,{radius:.1,sweep:()=>{throw Error('RPG must use convex collision');},sweepConvex:from=>({position:from,normal:{x:-1,y:0,z:0}})}).detonated).toBe(true);
 });
 it('tests strict rocket eye proximity and excludes remote shooter',()=>{
  const probe=createOriginalProjectile('rpg',origin,{x:1,y:0,z:0},'p');stepOriginalProjectile(probe,empty);
  const make=()=>createOriginalProjectile('rpg',origin,{x:1,y:0,z:0},'p');
  expect(stepOriginalProjectile(make(),{...empty,eyes:[{id:'p',position:probe.position}]}).detonated).toBe(false);
  expect(stepOriginalProjectile(make(),{...empty,eyes:[{id:'other',position:probe.position}]}).detonated).toBe(true);
  expect(stepOriginalProjectile(make(),{...empty,localEye:probe.position}).detonated).toBe(true);
  expect(stepOriginalProjectile(make(),{...empty,eyes:[{id:'other',position:{...probe.position,z:35*S}}]}).detonated).toBe(false);
 });
 it('applies5damage on all16callbacks including self, without falloff or LOS',()=>{
  const blast=createOriginalBlast(origin,'self','launcher');
  const eyes=[{id:'self',position:origin},{id:'nearEdge',position:{x:ORIGINAL_BLAST_RADIUS-.001,y:0,z:0}},{id:'atEdge',position:{x:ORIGINAL_BLAST_RADIUS,y:0,z:0}}];
  let damage=0;for(let i=0;i<16;i++){const result=stepOriginalBlast(blast,eyes);expect(result.damagedPlayerIds).toEqual(['self','nearEdge']);expect(result.expired).toBe(i===15);damage+=ORIGINAL_BLAST_DAMAGE;}
  expect(damage).toBe(80);expect(stepOriginalBlast(blast,eyes)).toEqual({damagedPlayerIds:[],expired:true});
 });
 it('rechecks moving eyes each blast callback rather than locking recipients at detonation',()=>{
  const blast=createOriginalBlast(origin,'self','rpg');
  expect(stepOriginalBlast(blast,[{id:'p',position:origin}]).damagedPlayerIds).toEqual(['p']);
  expect(stepOriginalBlast(blast,[{id:'p',position:{x:0,y:ORIGINAL_BLAST_RADIUS,z:0}}]).damagedPlayerIds).toEqual([]);
  expect(stepOriginalBlast(blast,[{id:'p',position:origin}]).damagedPlayerIds).toEqual(['p']);
 });
});
describe('explicit rigid-body contact adapter',()=>{
 it('exchanges equal-mass momentum with source player restitution .1',()=>{
  const result=resolveOriginalBodyContact({x:0,y:10,z:0},origin,{x:0,y:-1,z:0},1,1,.1,0);
  expect(result.velocityA.y).toBeCloseTo(4.5);expect(result.velocityB.y).toBeCloseTo(5.5);
  expect(result.velocityA.y+result.velocityB.y).toBeCloseTo(10);
 });
 it('does not invent an impulse for separating or resting contact',()=>{
  const velocity={x:0,y:-1,z:0};const result=resolveOriginalBodyContact(velocity,origin,{x:0,y:-1,z:0},1,1,.1,1);
  expect(result.velocityA).toEqual(velocity);expect(result.velocityB).toEqual(origin);expect(result.impulse).toEqual(origin);
 });
 it('returns player velocity from a projectile contact and damps projectile only',()=>{
  const p=createOriginalProjectile('launcher',origin,{x:0,y:1,z:0},'p');let hit=false;let playerY=0;
  stepOriginalProjectile(p,{...convexOnly(from=>hit?null:(hit=true,{position:from,normal:{x:0,y:-1,z:0},body:{id:'p',velocity:origin,mass:1,restitution:.1,friction:1}})),onContact:(_contact,_state,bodyVelocity)=>{playerY=bodyVelocity!.y;}});
  expect(playerY).toBeCloseTo((1300-2)*S*.55,10);
  expect(p.velocity.y).toBeCloseTo((1300-2)*S*.45*.85-18*S,10);
 });
 it('enforces Coulomb friction bound and infinite fixed-body momentum',()=>{
  const result=resolveOriginalBodyContact({x:100,y:-10,z:0},origin,{x:0,y:1,z:0},1,Infinity,.2,.5);
  expect(result.velocityA).toEqual({x:94,y:2,z:0});expect(result.velocityB).toEqual(origin);
 });
 it('rejects invalid input without emitting NaN simulation state',()=>{
  expect(()=>createOriginalProjectile('launcher',origin,origin,'p')).toThrow();
  expect(()=>createOriginalProjectile('rpg',origin,{x:0,y:0,z:-1},'p',{x:0,y:0,z:180})).toThrow(/rotation/);
  const p=createOriginalProjectile('launcher',origin,{x:1,y:0,z:0},'p');
  expect(()=>stepOriginalProjectile(p,{...empty,radius:-1})).toThrow();
  expect(()=>resolveOriginalBodyContact(origin,origin,origin,1,1,.1,1)).toThrow();
 });
});
