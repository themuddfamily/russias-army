import {describe,it,expect,vi} from 'vitest';
import {createOriginalSceneGeometry,type OriginalSceneData} from './originalSceneGeometry';
import {originalGrenadeConvex} from './originalGrenadeShape';
import {originalGrenadeBasisFromDirection} from './originalGrenadeOrientation';
import {sweepOriginalConvexSphere} from './originalConvexContact';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_EYE_OFFSET,type OriginalPhysicsContactDiagnostic} from './originalPlayerPhysics';
import {createOriginalProjectile,stepOriginalProjectilePhysicsSubstep,ORIGINAL_COLLISION_CONTACT_DISTANCE as T,ORIGINAL_PHYSICS_STEP,ORIGINAL_PHYSICS_SUBSTEPS,ORIGINAL_PROJECTILE_GRAVITY,ORIGINAL_PROJECTILE_RADIUS} from './originalExplosives';
const at=(x=0,y=0,z=0)=>({x,y,z}),I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function geometry(world:number[][],faces:number[][],name='floor'){
 const data:OriginalSceneData={nodes:[{name,parent:'World',resource:name,matrix:I,visibility:1,shader:'fixture'}],meshes:[{resource:name,part:0,positions:world.map(([x,y,z])=>[x,-z,y]),faces,normals:[],tex_coords:[]}]};
 return createOriginalSceneGeometry(data,{scale:1,cellSize:.25});
}
const floor=()=>geometry([[-3,0,-3],[3,0,-3],[3,0,3],[-3,0,3]],[[0,2,1],[0,3,2]]);
const shape=()=>originalGrenadeConvex(originalGrenadeBasisFromDirection(at(0,0,-1)));
describe('source one-unit contact-distance integration',()=>{
 it('sweeps a physical sphere center to one skin gap without inflating its pivot or reporting penetration',()=>{
  const g=floor(),hit=g.sweepSphere(at(0,1),at(0,-1),.2,T)!;
  expect(hit.position.y).toBeCloseTo(.2+T,10);expect(hit.fraction).toBeCloseTo((1-.2-T)/2,10);expect(hit.penetrationDepth).toBe(0);expect(hit.normal).toEqual(at(0,1));
  expect(hit.witnessA!.y).toBeCloseTo(T,10);expect(hit.witnessB).toEqual(at());
  expect(g.sweepSphere(at(0,1),at(0,-1),.2,0)!.position.y).toBeCloseTo(.2,5);
  expect(g.playerIntersects(at(0,hit.position.y-.2),.2,.4)).toBe(false);
 });
 it('preserves physical penetration and accepts stationary skin geometry without inventing a separating impact',()=>{
  const g=floor();expect(g.sweepSphere(at(0,.2+T*.5),at(0,.2+T*.5),.2,T)).toMatchObject({fraction:0,penetrationDepth:0});
  expect(g.sweepSphere(at(0,.19),at(0,.18),.2,T)!.penetrationDepth).toBeCloseTo(.01,12);
  expect(g.sweepSphere(at(0,.2+T*.5),at(0,1),.2,T)).toBeNull();
 });
 it('uses rounded finite triangle edges and rejects square-corner inflation',()=>{
  const g=geometry([[0,0,0],[1,0,0],[0,0,1]],[[0,2,1]]),r=.01;
  const miss=-(r+T)*.75,hit=-(r+T)*.6;
  expect(g.sweepSphere(at(miss,0,miss),at(miss,0,miss),r,T)).toBeNull();
  const contact=g.sweepSphere(at(hit,0,hit),at(hit,0,hit),r,T)!;expect(contact.penetrationDepth).toBe(0);expect(contact.normal.x).toBeCloseTo(-Math.SQRT1_2,10);expect(contact.normal.z).toBeCloseTo(-Math.SQRT1_2,10);
 });
 it.each([
  ['stationary',at(.75,0,.75)],
  ['separating',at(.875,0,.875)],
 ] as const)('rejects a %s separated finite triangle without a minimum search',(_name,to)=>{
  const g=geometry([[0,0,0],[1,0,0],[0,0,1]],[[0,2,1]]);
  // The expanded broad-phase bounds overlap this triangle, but the nearest
  // finite edge is farther than radius + skin. Count distance evaluations
  // instead of timing the query, avoiding machine-dependent performance gates.
  const distanceEvaluations=vi.spyOn(Math,'sqrt');let count=0;
  try{
   expect(g.sweepSphere(at(.75,0,.75),to,.1,.1)).toBeNull();
   count=distanceEvaluations.mock.calls.length;
  }finally{distanceEvaluations.mockRestore();}
  expect(count).toBeGreaterThan(0);expect(count).toBeLessThanOrEqual(4);
 });
 it('retains exact finite-edge grazing while rejecting a nearby miss',()=>{
  const g=geometry([[0,0,0],[1,0,0],[0,0,1]],[[0,2,1]]),z=-Math.sqrt(.03);
  // A radius .1 sphere with skin .1 grazes the finite z=0 edge at distance .2.
  // Both paths reach the same candidate triangle; the miss cannot be rejected
  // merely by its expanded axis-aligned bounds.
  const hit=g.sweepSphere(at(-1,.1,z),at(1,.1,z),.1,.1)!;
  expect(hit.fraction).toBeCloseTo(.5,4);expect(hit.penetrationDepth).toBe(0);
  expect(hit.normal.y).toBeCloseTo(.5,8);expect(hit.normal.z).toBeCloseTo(-Math.sqrt(3)/2,8);
  expect(g.sweepSphere(at(-1,.1,z-.00001),at(1,.1,z-.00001),.1,.1)).toBeNull();
 });
 it('does not let a harmless floor skin obscure a later sphere wall impact',()=>{
  const g=geometry([[-3,0,-3],[3,0,-3],[3,0,3],[-3,0,3],[0,0,-3],[0,3,-3],[0,3,3],[0,0,3]],[[0,2,1],[0,3,2],[4,5,6],[4,6,7]]);
  const hit=g.sweepSphere(at(-1,.21),at(1,.21),.2,.02)!;expect(hit.normal.x).toBeCloseTo(-1,10);expect(hit.fraction).toBeCloseTo(.39,10);
 });
 it('expands convex world broad phase by one distance, preserving source pivot and physical hull',()=>{
  const g=floor(),s=shape(),minY=Math.min(...s.vertices.map(v=>v.y));
  const start=at(0,-minY+T*.5),end=at(0,-minY+T*.25);
  expect(g.sweepConvex(start,end,s,0)).toBeNull();const hit=g.sweepConvex(start,end,s,T)!;expect(hit.fraction).toBe(0);expect(hit.penetrationDepth).toBe(0);expect(hit.position).toEqual(start);expect(hit.normal.y).toBeCloseTo(1,9);
 });
 it('does not let a harmless floor skin obscure a later convex wall impact',()=>{
  const g=geometry([[-3,0,-3],[3,0,-3],[3,0,3],[-3,0,3],[0,0,-3],[0,3,-3],[0,3,3],[0,0,3]],[[0,2,1],[0,3,2],[4,5,6],[4,6,7]]),s=shape();
  const minY=Math.min(...s.vertices.map(v=>v.y)),maxX=Math.max(...s.vertices.map(v=>v.x));
  const hit=g.sweepConvex(at(-1,-minY+T*.5),at(1,-minY+T*.5),s,T)!;
  expect(hit.normal.x).toBeCloseTo(-1,8);expect(hit.fraction).toBeCloseTo((1-maxX-T)/2,8);
 });
 it('uses one total convex-sphere skin and retains actual depth',()=>{
  const s=shape(),maxY=Math.max(...s.vertices.map(v=>v.y)),r=.2;
  const hit=sweepOriginalConvexSphere(s,at(),at(),at(0,maxY+r+T),at(),r,T)!;expect(hit.fraction).toBe(0);expect(hit.penetrationDepth).toBe(0);expect(hit.initialOverlap).toBe(false);
  expect(sweepOriginalConvexSphere(s,at(),at(),at(0,maxY+r+1.1*T),at(0,maxY+r+1.1*T),r,T)).toBeNull();
 });
 it('source joint body uses the same contact distance and leaves the physical sphere outside the floor',()=>{
  const g=floor(),body=createOriginalPlayerBody('player',at(0,ORIGINAL_PLAYER_EYE_OFFSET+ORIGINAL_PLAYER_RADIUS+T+.001),at(0,-2)),records:OriginalPhysicsContactDiagnostic[]=[];
  stepOriginalPhysicsWorld([body],[],{contactDistance:T,sweep:(a,b,r)=>g.sweepSphere(a,b,r,T),sweepConvex:(a,b,s)=>g.sweepConvex(a,b,s,T),onResolvedContact:e=>records.push(e)});
  const dt=ORIGINAL_PHYSICS_STEP/ORIGINAL_PHYSICS_SUBSTEPS;
  expect(records.length).toBeGreaterThan(0);expect(records[0].penetrationDepth).toBe(0);expect(records[0].bodyB.type).toBe('fixed');
  expect(records[0].surfaceWitnesses!.a.y).toBeCloseTo(T,10);
  expect(records[0].surfaceWitnesses!.b.y).toBeCloseTo(0,10);
  expect(records[0].fraction).toBeCloseTo(.001/((2-ORIGINAL_PROJECTILE_GRAVITY*dt)*dt),8);
  // First response starts at the exact source skin. Source restitution .1
  // subsequently leaves the body above it; the final gap need not equal T.
  const gap=body.position.y-ORIGINAL_PLAYER_RADIUS;
  expect(gap).toBeGreaterThanOrEqual(T-1e-9);expect(gap).toBeLessThanOrEqual(T+.001+1e-6);expect(body.supported).toBe(true);
 });
 it('separating standalone skin does not invent grenade damping or an RPG hit',()=>{
  const dt=ORIGINAL_PHYSICS_STEP/ORIGINAL_PHYSICS_SUBSTEPS;
  for(const weapon of ['launcher','rpg'] as const)for(const relativeSpeed of [0,2])for(const movingBody of [false,true]){
   const p=createOriginalProjectile(weapon,at(0,2),at(0,1),'owner'),start={...p.position},callbacks=p.remainingCallbacks;
   const bodyVelocity=movingBody?at(0,-3):at(),afterGravity=at(1,bodyVelocity.y+relativeSpeed,3);
   p.velocity={...afterGravity,y:afterGravity.y-ORIGINAL_PROJECTILE_GRAVITY*dt};
   let sweeps=0,contacts=0;
   const count=stepOriginalProjectilePhysicsSubstep(p,{
    radius:ORIGINAL_PROJECTILE_RADIUS[weapon],
    sweep:()=>{throw Error('Source projectile must use its full convex hull');},
    sweepConvex:(from,to,convex)=>{
     sweeps++;expect(convex).toBe(p.convex);expect(from).toEqual(start);
     expect(to).toEqual(at(start.x+afterGravity.x*dt,start.y+afterGravity.y*dt,start.z+afterGravity.z*dt));
     return {position:{...from},normal:at(0,1),fraction:0,penetrationDepth:0,
      ...(movingBody?{body:{id:'moving',velocity:bodyVelocity,mass:1,restitution:.2,friction:.5}}:{})};
    },onContact:()=>{contacts++;},
   },dt);
   expect(count).toBe(0);expect(sweeps).toBe(1);expect(contacts).toBe(0);expect(p.velocity).toEqual(afterGravity);
   expect(p.position).toEqual(at(start.x+afterGravity.x*dt,start.y+afterGravity.y*dt,start.z+afterGravity.z*dt));
   expect(p.hit).toBe(false);expect(p.remainingCallbacks).toBe(callbacks);
  }
 });
});
