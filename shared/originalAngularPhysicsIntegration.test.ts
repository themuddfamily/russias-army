import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {createOriginalAngularBody,originalAngularCenter,originalAngularConvex} from './originalAngularBody';
import {createOriginalSceneGeometry} from './originalSceneGeometry';
import {createOriginalProjectile,stepOriginalProjectilePhysicsSubstep,stepOriginalProjectileActor,ORIGINAL_COLLISION_CONTACT_DISTANCE as T,ORIGINAL_PROJECTILE_RADIUS} from './originalExplosives';
import {stepOriginalPhysicsWorld,type OriginalMovableBody,type OriginalPhysicsContactDiagnostic} from './originalPlayerPhysics';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import type {OriginalConvexPolytope} from './originalConvexSweep';
const at=(x=0,y=0,z=0)=>({x,y,z});
function box():OriginalConvexPolytope {
 return {vertices:[at(-1,-1,-1),at(1,-1,-1),at(-1,1,-1),at(1,1,-1),at(-1,-1,1),at(1,-1,1),at(-1,1,1),at(1,1,1)],
 faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],
 faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
}
function floor(){return createOriginalSceneGeometry({nodes:[{name:'floor',parent:'World',resource:'floor',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],visibility:1,shader:'fixture'}],meshes:[{resource:'floor',part:0,positions:[[-10,10,0],[10,10,0],[10,-10,0],[-10,-10,0]],faces:[[0,2,1],[0,3,2]],normals:[],tex_coords:[]}]},{scale:1,cellSize:1});}
describe('coherent angular source world integration',()=>{
 it('combines finite coplanar floor triangles without inventing corner torque',()=>{
  const g=floor(),convex=box(),angular=createOriginalAngularBody(convex,1),body:OriginalMovableBody={id:'box',position:at(0,1+T+.001),velocity:at(0,-1),convex,radius:Math.sqrt(3),mass:1,restitution:.2,friction:1,angular};
  const records:OriginalPhysicsContactDiagnostic[]=[];
  stepOriginalPhysicsWorld([],[],{contactDistance:T,movableBodies:[body],sweep:()=>null,sweepConvex:(a,b,s,v)=>g.sweepConvex(a,b,s,T,v),onResolvedContact:e=>records.push(e)});
  expect(records.length).toBeGreaterThan(0);
  expect(records[0].surfaceWitnesses!.a.x).toBeCloseTo(0,10);expect(records[0].surfaceWitnesses!.a.z).toBeCloseTo(0,10);
  expect(Math.hypot(angular.angularVelocity.x,angular.angularVelocity.y,angular.angularVelocity.z)).toBeLessThan(1e-8);
  expect(body.position.y-1).toBeGreaterThanOrEqual(T-1e-9);
 });
 it('applies an actual off-center fixed-surface impulse, rotates the full hull and retains angular state after source damping',()=>{
  const p=createOriginalProjectile('launcher',at(0,2),at(1),'owner'),before=structuredClone(p.angular!.orientation),records:OriginalPhysicsContactDiagnostic[]=[];
  let hit=false;
  stepOriginalPhysicsWorld([],[p],{sweep:()=>null,sweepConvex:from=>{if(hit)return null;hit=true;return {position:{...from},fraction:0,normal:at(-1),witnessA:at(from.x,from.y+.01,from.z),witnessB:at(from.x,from.y+.01,from.z)};},onResolvedContact:e=>records.push(e)});
  expect(records).toHaveLength(1);expect(records[0].angularBeforeResponse!.a).toEqual(at());
  const spin=records[0].angularAfterResponse!.a;expect(Math.hypot(spin.x,spin.y,spin.z)).toBeGreaterThan(1);
  expect(records[0].angularAfterActorCallbacks!.a).toEqual(spin);
  for(const axis of ['x','y','z'] as const)expect(records[0].afterActorCallbacks.a[axis]).toBeCloseTo(records[0].afterResponse.a[axis]*.85,10);
  expect(p.angular!.orientation).not.toEqual(before);expect(p.convex).toBe(originalAngularConvex(p.angular!));
  expect(p.convex!.vertices).not.toEqual(p.angular!.referenceConvex.vertices);
 });
 it('advances identical isolated free source body pose in joint and standalone physics and keeps RPG launch metadata immutable',()=>{
  for(const weapon of ['launcher','rpg'] as const){
   const joint=createOriginalProjectile(weapon,at(0,20),at(.2,.3,-1),'owner'),standalone=createOriginalProjectile(weapon,at(0,20),at(.2,.3,-1),'owner');
   joint.angular!.angularVelocity=at(50,-30,20);standalone.angular!.angularVelocity=at(50,-30,20);
   const launch=structuredClone(joint.sourceRotation),direction={...joint.direction};
   stepOriginalPhysicsWorld([],[joint],{contactDistance:T,sweep:()=>null,sweepConvex:()=>null});
   for(let i=0;i<10;i++)stepOriginalProjectilePhysicsSubstep(standalone,{radius:ORIGINAL_PROJECTILE_RADIUS[weapon],sweep:()=>null,sweepConvex:()=>null});
   for(const axis of ['x','y','z'] as const){expect(joint.position[axis]).toBeCloseTo(standalone.position[axis],9);expect(joint.angular!.angularVelocity[axis]).toBeCloseTo(standalone.angular!.angularVelocity[axis],8);}
   for(const axis of ['x','y','z','w'] as const)expect(joint.angular!.orientation[axis]).toBeCloseTo(standalone.angular!.orientation[axis],9);
   const spin={...joint.angular!.angularVelocity},pose={...joint.angular!.orientation};stepOriginalProjectileActor(joint);
   expect(joint.angular!.orientation).toEqual(pose);expect(joint.angular!.angularVelocity).toEqual(spin);
   expect(joint.sourceRotation).toEqual(launch);expect(joint.direction).toEqual(direction);
  }
 });
 it('settles the actual imported barrel without arbitrary near-flat floor torque while preserving model pivot and COM',()=>{
  const runtime=registerOriginalMapRuntime('barrack',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8'))),world=new OriginalBarrelWorld(runtime);
  for(let i=0;i<60;i++)stepOriginalPhysicsWorld([],[],{contactDistance:T,movableBodies:world.bodies,sweep:(a,b,r)=>runtime.geometry.sweepSphere(a,b,r,T),sweepConvex:(a,b,s,v)=>runtime.geometry.sweepConvex(a,b,s,T,v)});
  const body=world.bodies[0],q=body.angular!.orientation;
  expect(Math.hypot(q.x,q.y,q.z)).toBeLessThan(.001);
  const bottom=body.position.y+Math.min(...body.convex.vertices.map(v=>v.y)),support=runtime.geometry.playerSupportHeightAt(body.position.x,body.position.z,bottom+.1,.001,.002)!;
  expect(bottom-support).toBeGreaterThanOrEqual(-1e-6);expect(bottom-support).toBeLessThan(T+.01);
  expect(originalAngularCenter(body.position,body.angular!).y).toBeGreaterThan(bottom);
 });
});
