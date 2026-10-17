import {describe,it,expect} from 'vitest';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import {createOriginalProjectile,stepOriginalProjectileActor,ORIGINAL_PROJECTILE_RADIUS} from './originalExplosives';
import {createOriginalPlayerBody,originalPlayerEye,applyOriginalPlayerControls,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET,ORIGINAL_PLAYER_DERIVATIVE_JUMP,ORIGINAL_PLAYER_DERIVATIVE_GRAVITY,ORIGINAL_PLAYER_GROUNDED_MAX_SPEED} from './originalPlayerPhysics';
import type {OriginalPhysicsEnvironment,OriginalMovableBody,OriginalPhysicsContactDiagnostic} from './originalPlayerPhysics';
const zero={x:0,y:0,z:0};
const empty:OriginalPhysicsEnvironment={sweep:()=>null,sweepConvex:()=>null};
const make=(position=zero,velocity=zero)=>({...createOriginalPlayerBody('p',zero),position:{...position},velocity:{...velocity}});
const controls={yaw:0,pitch:0};
const floor:OriginalPhysicsEnvironment={sweep:(from,to,radius)=>{
 if(to.y>=radius)return null;
 const f=from.y>radius?(from.y-radius)/(from.y-to.y):0;
 return {fraction:f,position:{x:from.x+(to.x-from.x)*f,y:radius,z:from.z+(to.z-from.z)*f},normal:{x:0,y:1,z:0}};
}};
describe('source goody controls after joint physics',()=>{
 it('converts center and eye using60source units, without treating dummy resource20 as radius',()=>{
  const p=createOriginalPlayerBody('a',{x:1,y:2,z:3});expect(p.position.y).toBeCloseTo(2-60*S);expect(originalPlayerEye(p)).toEqual({x:1,y:2,z:3});expect(R).toBe(25*S);expect(ORIGINAL_PLAYER_EYE_OFFSET).toBe(60*S);
 });
 it('preserves nominal callback derivative constants as adapter, not authored speeds',()=>{
  expect(ORIGINAL_PLAYER_DERIVATIVE_JUMP).toBeCloseTo(250*S*1.5);expect(ORIGINAL_PLAYER_DERIVATIVE_GRAVITY).toBeCloseTo(400*S*2.25);expect(ORIGINAL_PLAYER_GROUNDED_MAX_SPEED).toBeCloseTo(450*S);
 });
 it('applies100impulse and .75 horizontal drag only on supported callbacks, then clears latch',()=>{
  const p=make();p.supported=true;
  expect(applyOriginalPlayerControls(p,{...controls,forward:true})).toEqual({grounded:true,jumped:false});expect(p.velocity.z).toBeCloseTo(-75*S);expect(p.supported).toBe(false);
  applyOriginalPlayerControls(p,{...controls,forward:true,jump:true});expect(p.velocity.z).toBeCloseTo(-75*S);expect(p.velocity.y).toBe(0);
 });
 it('keeps forward/right priority and averages diagonal instead of normalizing',()=>{
  const p=make();p.supported=true;applyOriginalPlayerControls(p,{...controls,forward:true,backward:true,right:true,left:true});expect(p.velocity.x).toBeCloseTo(37.5*S,12);expect(p.velocity.y).toBe(0);expect(p.velocity.z).toBeCloseTo(-37.5*S,12);
 });
 it('keeps pitched movement vertical impulses and source negative strafe pitch for both sides',()=>{
  const p=make();p.supported=true;applyOriginalPlayerControls(p,{yaw:0,pitch:Math.PI/6,forward:true});expect(p.velocity.y).toBeCloseTo(50*S);expect(p.velocity.z).toBeCloseTo(-75*S*Math.sqrt(3)/2);
  for(const side of ['left','right']){const q=make();q.supported=true;applyOriginalPlayerControls(q,{yaw:0,pitch:Math.PI/6,[side]:true});expect(q.velocity.y).toBeCloseTo(-50*S);}
 });
 it('typing suppresses impulses and held jump but keeps supported horizontal drag',()=>{
  const p=make(zero,{x:4,y:3,z:2});p.supported=true;expect(applyOriginalPlayerControls(p,{...controls,typing:true,forward:true,jump:true})).toEqual({grounded:true,jumped:false});expect(p.velocity).toEqual({x:3,y:3,z:1.5});
 });
 it('held Space jumps again on each later support callback, not on an airborne keydown',()=>{
  const p=make();p.supported=true;expect(applyOriginalPlayerControls(p,{...controls,jump:true}).jumped).toBe(true);expect(p.velocity.y).toBeCloseTo(250*S);
  expect(applyOriginalPlayerControls(p,{...controls,jump:true}).jumped).toBe(false);p.supported=true;expect(applyOriginalPlayerControls(p,{...controls,jump:true}).jumped).toBe(true);expect(p.velocity.y).toBeCloseTo(500*S);
 });
});
describe('joint source player/projectile physics adapter',()=>{
 it('advances both player and projectile .05 seconds with ten shared gravity substeps, without advancing actors',()=>{
  const p=make({x:0,y:0,z:0},{x:2,y:0,z:0});const g=createOriginalProjectile('launcher',{x:100,y:0,z:0},{x:1,y:0,z:0},'p');
  stepOriginalPhysicsWorld([p],[g],empty);expect(p.position.x).toBeCloseTo(.1);expect(g.position.x).toBeCloseTo(100+1300*S*.05);expect(p.position.y).toBeCloseTo(-400*S*.005**2*55);expect(g.position.y).toBeCloseTo(p.position.y);expect(p.velocity.y).toBeCloseTo(-20*S);expect(g.remainingCallbacks).toBe(60);stepOriginalProjectileActor(g);expect(g.remainingCallbacks).toBe(59);
 });
 it('latches upward triangle support, resolves contact, and grounded controls follow physics',()=>{
  const p=make({x:0,y:R,z:0});stepOriginalPhysicsWorld([p],[],floor);expect(p.supported).toBe(true);expect(p.position.y).toBeGreaterThanOrEqual(R);expect(p.position.y).toBeLessThan(R+.001);expect(applyOriginalPlayerControls(p,{...controls,jump:true}).jumped).toBe(true);expect(p.velocity.y).toBeGreaterThan(250*S);
 });
 it('uses relative sweeps for moving equal-mass players and advances both after impact',()=>{
  const a=make({x:0,y:0,z:0},{x:10,y:0,z:0}),b={...make({x:2*R+.1,y:0,z:0},{x:-10,y:0,z:0}),id:'b'};
  stepOriginalPhysicsWorld([a,b],[],empty);expect(a.velocity.x).toBeCloseTo(-1);expect(b.velocity.x).toBeCloseTo(1);expect(a.position.x).toBeCloseTo(.005,5);expect(b.position.x).toBeCloseTo(2*R+.095,5);expect(a.velocity.x+b.velocity.x).toBeCloseTo(0);
 });
 it('advances player and grenade positions after momentum exchange rather than freezing player center',()=>{
  const p=make({x:0,y:0,z:0},{x:10,y:0,z:0});const g=createOriginalProjectile('launcher',zero,{x:-1,y:0,z:0},'p');
  // The actual flat hull cap meets the sphere after .005s; pivot-bound radius
  // is not the narrowphase separation distance.
  const extent=-Math.min(...g.convex!.vertices.map(v=>v.x));g.position={x:R+extent+.1,y:0,z:0};g.velocity={x:-10,y:0,z:0};
  const result=stepOriginalPhysicsWorld([p],[g],empty);expect(result.contacts).toBe(1);expect(p.velocity.x).toBeCloseTo(-1);expect(g.velocity.x).toBeCloseTo(.85);expect(p.position.x).toBeCloseTo(.005,5);expect(g.position.x).toBeCloseTo(R+extent+.05+.85*.045,5);expect(g.remainingCallbacks).toBe(60);
 });
 it('sweeps the RPG nose against a moving player and conserves finite-mass horizontal momentum',()=>{
  const p=make({x:0,y:0,z:0},{x:0,y:0,z:1});
  const rocket=createOriginalProjectile('rpg',zero,{x:0,y:0,z:-1},'other',{x:0,y:0,z:0});
  rocket.position={x:0,y:-7.104002*S,z:1.55};rocket.velocity={x:0,y:0,z:-10};
  const initialMomentum=p.velocity.z+100*rocket.velocity.z;
  const contacts:unknown[]=[];
  const result=stepOriginalPhysicsWorld([p],[rocket],{sweep:()=>null,sweepConvex:()=>null,onProjectileContact:(_r,c)=>contacts.push(c)});
  expect(result.contacts).toBeGreaterThan(0);expect(contacts.length).toBeGreaterThan(0);
  expect(rocket.hit).toBe(true);expect(p.velocity.z).toBeLessThan(-1);
  expect(p.velocity.z+100*rocket.velocity.z).toBeCloseTo(initialMomentum,8);
  expect(rocket.remainingCallbacks).toBe(200);expect(rocket.position.z).toBeGreaterThan(.9);
  expect(rocket.position.z).toBeLessThan(1.55);
 });
 it('a grenade below supplies support but downward contact above the player does not',()=>{
  for(const sign of [-1,1]){const p=make({x:0,y:0,z:0});const g=createOriginalProjectile('launcher',{x:0,y:sign*(R+ORIGINAL_PROJECTILE_RADIUS.launcher+.001),z:0},{x:0,y:-sign,z:0},'p');g.velocity={x:0,y:-sign,z:0};stepOriginalPhysicsWorld([p],[g],empty);expect(p.supported).toBe(sign===-1);}
 });
 it('retains support from a currently touching convex grenade moving away below the player',()=>{
  const player=make();
  const grenade=createOriginalProjectile('launcher',zero,{x:0,y:1,z:0},'p');
  // The actual hull's uppermost vertex, rather than its pivot-bound radius,
  // touches the sphere at callback start. Relative motion separates them.
  const upper=grenade.convex!.vertices.reduce((a,b)=>a.y>b.y?a:b);
  grenade.position={x:-upper.x,y:-R-upper.y+1e-9,z:-upper.z};
  grenade.velocity={x:0,y:-1,z:0};
  const result=stepOriginalPhysicsWorld([player],[grenade],empty);
  expect(result.contacts).toBe(0);expect(player.supported).toBe(true);
 });
 it('combines fixed restitution1/friction.1 with player .1/1 by the explicit minimum adapter',()=>{
  const p=make(zero,{x:100,y:-10,z:0});let hit=false;
  stepOriginalPhysicsWorld([p],[],{sweep:from=>hit?null:(hit=true,{position:from,normal:{x:0,y:1,z:0},fraction:0})});
  const impactSpeed=10+400*S*.005;
  expect(p.velocity.x).toBeCloseTo(100-.1*1.1*impactSpeed,12);
  expect(p.velocity.y).toBeCloseTo(.1*impactSpeed-400*S*.045,12);
 });
 it('does not latch a future floor candidate preempted by an earlier dynamic collision',()=>{
  const a=make(zero,{x:10,y:0,z:0}),b={...make({x:2*R+.01,y:0,z:0}),id:'b'};let first=true;
  stepOriginalPhysicsWorld([a,b],[],{sweep:(_from,to)=>{
   if(!first)return null;first=false;return {position:{...to},normal:{x:0,y:1,z:0},fraction:1};
  }});
  expect(a.supported).toBe(false);expect(b.supported).toBe(false);
 });
 it('does not allow a held jump from a future convex support preempted by a wall',()=>{
  const at=(x=0,y=0,z=0)=>({x,y,z}),q=.05;
  const box:OriginalMovableBody={id:'box',position:at(.8,-.55),velocity:at(),radius:Math.sqrt(3)*q,mass:1,restitution:.2,friction:0,convex:{
   vertices:[at(-q,-q,-q),at(q,-q,-q),at(-q,q,-q),at(q,q,-q),at(-q,-q,q),at(q,-q,q),at(-q,q,q),at(q,q,q)],
   faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],
   faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]],
  }};
  const run=(includeBox:boolean)=>{
   const player=make(zero,at(100,-20)),events:OriginalPhysicsContactDiagnostic[]=[];
   stepOriginalPhysicsWorld([player],[],{movableBodies:includeBox?[box]:[],sweepConvex:()=>null,onResolvedContact:event=>events.push(event),sweep:(from,to)=>{
    if(from.x>.05000001||to.x<=.05)return null;
    const fraction=(.05-from.x)/(to.x-from.x);
    return {fraction,position:at(.05,from.y+(to.y-from.y)*fraction),normal:at(-1)};
   }});
   return {player,events};
  };
  const control=run(false),candidate=run(true);
  expect(candidate.events).toHaveLength(1);
  expect(candidate.events[0].bodyB.type).toBe('fixed');
  expect(candidate.events[0].normal).toEqual(at(-1));
  expect(candidate.player).toEqual(control.player);
  expect(candidate.player.supported).toBe(false);
  expect(applyOriginalPlayerControls(candidate.player,{...controls,jump:true})).toEqual({grounded:false,jumped:false});
 });
 it('strict support normal threshold excludes vertical walls and slope y=.5',()=>{
  const p=make(zero,{x:1,y:-1,z:0});let once=false;stepOriginalPhysicsWorld([p],[],{sweep:from=>once?null:(once=true,{position:from,normal:{x:-Math.sqrt(.75),y:.5,z:0}})});expect(p.supported).toBe(false);
 });
});
