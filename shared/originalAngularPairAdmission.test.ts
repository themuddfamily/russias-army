import {afterEach,describe,expect,it,vi} from 'vitest';
import * as convexContacts from './originalConvexContact';
import {sweepOriginalConvexPairDistance} from './originalContactDistance';
import {createOriginalAngularBody,originalAngularPointVelocity} from './originalAngularBody';
import {createOriginalProjectile,ORIGINAL_PROJECTILE_RADIUS,ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from './originalExplosives';
import {stepOriginalPhysicsWorld,type OriginalMovableBody,type OriginalPhysicsContactDiagnostic} from './originalPlayerPhysics';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';

const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
const shifted=(p:Vec3,n:Vec3,d:number):Vec3=>({x:p.x+n.x*d,y:p.y+n.y*d,z:p.z+n.z*d});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
function box(h=.02):OriginalConvexPolytope {
 return {vertices:[at(-h,-h,-h),at(h,-h,-h),at(-h,h,-h),at(h,h,-h),at(-h,-h,h),at(h,-h,h),at(-h,h,h),at(h,h,h)],
  faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],
  faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
}
function movable(id:string,mass:number,position:Vec3,velocity=at()):OriginalMovableBody {
 const convex=box(),angular=createOriginalAngularBody(convex,mass);angular.angularVelocity=at(20);
 return {id,mass,position,velocity,convex,angular,radius:Math.sqrt(3)*.02,restitution:.2,friction:0};
}
function impactPositions(a:Vec3,b:Vec3,e:OriginalPhysicsContactDiagnostic,massA:number,massB:number):[Vec3,Vec3] {
 const separation=Math.max(0,e.penetrationDepth??0)+1e-7,ia=1/massA,ib=1/massB;
 return [shifted(a,e.normal,-separation*ia/(ia+ib)),shifted(b,e.normal,separation*ib/(ia+ib))];
}
function conservedImpulse(e:OriginalPhysicsContactDiagnostic,massA:number,massB:number):void {
 for(const axis of ['x','y','z'] as const)expect(e.afterResponse.a[axis]*massA+e.afterResponse.b[axis]*massB)
  .toBeCloseTo(e.beforeResponse.a[axis]*massA+e.beforeResponse.b[axis]*massB,9);
 expect(dot(sub(e.beforeResponse.a,e.beforeResponse.b),e.normal)).toBeLessThan(-1);
 expect(dot(sub(e.afterResponse.a,e.afterResponse.b),e.normal)).toBeGreaterThan(0);
}
afterEach(()=>vi.restoreAllMocks());

describe('actual angular dynamic pair admission without stationary contact providers',()=>{
 for(const injectStaleCandidate of [false,true])it(`validates convex A / sphere B and mass100 response${injectStaleCandidate?' after a rejected earlier candidate':''}`,()=>{
  const a=createOriginalProjectile('launcher',at(),at(1),'a'),b=createOriginalProjectile('rpg',at(),at(1),'b');
  // The public optional-hull path supports compatibility sphere projectiles.
  // This exercises the reverse branch, not a claim that native RPGs were spheres.
  delete b.angular;delete b.convex;b.position=at();b.velocity=at();
  a.convex=box();a.angular=createOriginalAngularBody(a.convex,1);a.angular.angularVelocity=at(20);
  a.position=at(-(.02+ORIGINAL_PROJECTILE_RADIUS.rpg+T+.005));a.velocity=at(3);
  if(injectStaleCandidate)vi.spyOn(convexContacts,'sweepOriginalConvexSphere').mockReturnValueOnce({fraction:.1,normalBToA:at(-1),penetrationDepth:0,initialOverlap:false});
  const events:OriginalPhysicsContactDiagnostic[]=[];let hooks=0;
  stepOriginalPhysicsWorld([],[a,b],{contactDistance:T,sweep:()=>null,sweepConvex:()=>null,onProjectileContact:()=>hooks++,onResolvedContact:e=>{
   events.push(e);expect(e.fraction).toBeGreaterThan(0);
   const [pa,pb]=impactPositions(a.position,b.position,e,1,100);
   const actual=convexContacts.sweepOriginalConvexSphere(a.convex!,pa,pa,pb,pb,ORIGINAL_PROJECTILE_RADIUS.rpg,T);
   expect(actual,'A rejected prediction must not dispatch its damping/hit handlers').not.toBeNull();
   for(const axis of ['x','y','z'] as const)expect(e.normal[axis]).toBeCloseTo(actual!.normalBToA[axis],9);
   expect(e.surfaceWitnesses).toBeDefined();
   for(const axis of ['x','y','z'] as const){
    expect(e.surfaceWitnesses!.a[axis]).toBeCloseTo(actual!.witnessA![axis],9);
    expect(e.surfaceWitnesses!.b[axis]).toBeCloseTo(actual!.witnessB![axis],9);
   }
   conservedImpulse(e,1,100);
   expect(dot(sub(e.afterResponse.a,e.afterResponse.b),e.normal)).toBeCloseTo(-.2*dot(sub(e.beforeResponse.a,e.beforeResponse.b),e.normal),8);
   for(const axis of ['x','y','z'] as const){expect(e.afterActorCallbacks.a[axis]).toBe(e.afterResponse.a[axis]*.85);expect(e.afterActorCallbacks.b[axis]).toBe(e.afterResponse.b[axis]);}
  }});
  expect(events).toHaveLength(1);expect(hooks).toBe(2);expect(b.hit).toBe(true);
  expect(events[0].time).toBeGreaterThan(.001); // Genuine gap closes after the injected .0005 candidate.
  expect(a.remainingCallbacks).toBe(60);expect(b.remainingCallbacks).toBe(200);
 });

 it('uses current convex / convex witnesses and inverse mass separation for a rotating mass1/mass100 pair',()=>{
  const a=movable('light',1,at(-(.04+T+.005)),at(3)),b=movable('heavy',100,at());
  const events:OriginalPhysicsContactDiagnostic[]=[];let hooks=0;
  stepOriginalPhysicsWorld([],[],{contactDistance:T,movableBodies:[a,b],sweep:()=>null,sweepConvex:()=>null,onMovableContact:()=>hooks++,onResolvedContact:e=>{
   events.push(e);expect(e.fraction).toBeGreaterThan(0);
   const [pa,pb]=impactPositions(a.position,b.position,e,1,100);
   const actual=sweepOriginalConvexPairDistance(a.convex,pa,pa,b.convex,pb,pb,T);
   expect(actual).not.toBeNull();expect(e.surfaceWitnesses).toBeDefined();
   for(const axis of ['x','y','z'] as const)expect(e.normal[axis]).toBeCloseTo(actual!.normalBToA[axis],8);
   conservedImpulse(e,1,100);
   const wa=e.surfaceWitnesses!.a,wb=e.surfaceWitnesses!.b;
   expect(dot(sub(wa,wb),e.normal)).toBeCloseTo(T,9);
   // Relative gap alone cannot detect incorrect individual separation weights.
   // Each original witness must lie on its restored body's own support plane.
   expect(dot(sub(wa,pa),e.normal)).toBeCloseTo(Math.min(...a.convex.vertices.map(v=>dot(v,e.normal))),10);
   expect(dot(sub(wb,pb),e.normal)).toBeCloseTo(Math.max(...b.convex.vertices.map(v=>dot(v,e.normal))),10);
   const beforeA=originalAngularPointVelocity(pa,e.beforeResponse.a,{...a.angular!,angularVelocity:e.angularBeforeResponse!.a},wa);
   const beforeB=originalAngularPointVelocity(pb,e.beforeResponse.b,{...b.angular!,angularVelocity:e.angularBeforeResponse!.b},wb);
   const afterA=originalAngularPointVelocity(pa,e.afterResponse.a,{...a.angular!,angularVelocity:e.angularAfterResponse!.a},wa);
   const afterB=originalAngularPointVelocity(pb,e.afterResponse.b,{...b.angular!,angularVelocity:e.angularAfterResponse!.b},wb);
   expect(dot(sub(afterA,afterB),e.normal)).toBeCloseTo(-.2*dot(sub(beforeA,beforeB),e.normal),8);
   expect(e.afterActorCallbacks).toEqual(e.afterResponse);
  }});
  expect(events).toHaveLength(1);expect(hooks).toBe(2);
 });
});
