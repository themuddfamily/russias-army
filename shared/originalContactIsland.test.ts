import {describe,it,expect} from 'vitest';
import {resolveOriginalContactIsland,type OriginalIslandContact} from './originalContactIsland';
import {createOriginalAngularBody,cloneOriginalAngularBody,resolveOriginalAngularManifold,originalAngularPointVelocity,type OriginalAngularContactBody} from './originalAngularBody';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';
import {originalGrenadeConvex} from './originalGrenadeShape';
import {originalGrenadeBasisFromDirection} from './originalGrenadeOrientation';
const v=(x=0,y=0,z=0):Vec3=>({x,y,z});
function cube(size=1):OriginalConvexPolytope {
 return {vertices:[v(-size,-size,-size),v(size,-size,-size),v(-size,size,-size),v(size,size,-size),v(-size,-size,size),v(size,-size,size),v(-size,size,size),v(size,size,size)],faceNormals:[v(1),v(-1),v(0,1),v(0,-1),v(0,0,1),v(0,0,-1)],edgeDirections:[v(1),v(0,1),v(0,0,1)],faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
}
function close(a:Vec3,b:Vec3,digits=10){for(const k of ['x','y','z'] as const)expect(a[k]).toBeCloseTo(b[k],digits);}
const contact=(bodyA:number,bodyB:number,normal:Vec3,point:Vec3,restitution=0,friction=0):OriginalIslandContact=>({bodyA,bodyB,normal,pairs:[{witnessA:point,witnessB:{...point}}],restitution,friction});
describe('experimental simultaneous contact island reconstruction',()=>{
 it('satisfies simultaneous sphere/floor and actual recovered grenade surface constraints',()=>{
  const shape=originalGrenadeConvex(originalGrenadeBasisFromDirection(v(0,-1))),minimum=Math.min(...shape.vertices.map(p=>p.y)),base=shape.vertices.filter(p=>Math.abs(p.y-minimum)<=1e-12);
  const center=base.reduce((a,p)=>v(a.x+p.x,a.y+p.y,a.z+p.z),v()),mean=v(center.x/base.length,center.y/base.length,center.z/base.length),angular=createOriginalAngularBody(shape,1);
  const bodies=[{position:v(0,.5),velocity:v(0,-1),mass:1},{position:v(-mean.x,1-minimum,-mean.z),velocity:v(0,-2),mass:1,angular},{position:v(),velocity:v(),mass:Infinity}];
  const result=resolveOriginalContactIsland(bodies,[contact(0,2,v(0,1),v(),.1,.1),contact(0,1,v(0,-1),v(0,1),.1,.5)]);
  expect(result.converged).toBe(true);expect(result.maxNormalResidual).toBeLessThanOrEqual(result.tolerance);
  expect(result.velocities[0].y).toBeGreaterThanOrEqual(.1-1e-12);
  const after=cloneOriginalAngularBody(angular);after.angularVelocity=result.angularVelocities[1]!;
  const grenadePoint=originalAngularPointVelocity(bodies[1].position,result.velocities[1],after,v(0,1));
  expect(grenadePoint.y-result.velocities[0].y).toBeGreaterThanOrEqual(.1-1e-12);expect(result.contacts.every(c=>c.active)).toBe(true);
 });
 it('resolves both opposed floor/player/grenade constraints through the shared player index',()=>{
  const bodies:OriginalAngularContactBody[]=[{position:v(0,.5),velocity:v(0,-1),mass:1},{position:v(0,1.1),velocity:v(0,-2),mass:1,angular:createOriginalAngularBody(cube(.1),1)},{position:v(),velocity:v(),mass:Infinity}];
  const result=resolveOriginalContactIsland(bodies,[contact(0,2,v(0,1),v(),.1),contact(0,1,v(0,-1),v(0,1),.1)]);
  expect(result.converged).toBe(true);expect(result.iterations).toBeLessThanOrEqual(128);expect(result.tolerance).toBe(2e-13);expect(result.maxNormalResidual).toBeLessThanOrEqual(result.tolerance);expect(result.maxImpulseUpdate).toBeLessThanOrEqual(result.tolerance);
  expect(result.velocities[0].y).toBeCloseTo(.1,11);expect(result.velocities[1].y).toBeCloseTo(.2,11);close(result.velocities[2],v());close(result.angularVelocities[1]!,v());
  expect(result.contacts.every(c=>c.active&&c.normalImpulse>0)).toBe(true);
 });
 it('conserves isolated pair linear and angular momentum with off-center witnesses',()=>{
  const a=createOriginalAngularBody(cube(),1),b=createOriginalAngularBody(cube(),2),point=v(.75,0,.25);
  const result=resolveOriginalContactIsland([{position:v(0,1),velocity:v(0,-1),mass:1,angular:a},{position:v(0,-1),velocity:v(),mass:2,angular:b}],[contact(0,1,v(0,1),point,.2)]);
  const va=result.velocities[0],vb=result.velocities[1];close(v(va.x+2*vb.x,va.y+2*vb.y,va.z+2*vb.z),v(0,-1));
  const wa=result.angularVelocities[0]!,wb=result.angularVelocities[1]!;close(v((2/3)*wa.x+(4/3)*wb.x,(2/3)*wa.y+(4/3)*wb.y,(2/3)*wa.z+(4/3)*wb.z),v());
  expect(wa.z).toBeGreaterThan(1);expect(wb.z).toBeLessThan(-1);
 });
 it('keeps initial restitution targets fixed across solver passes and correctly reverses body order',()=>{
  const bodies=[{position:v(0,1),velocity:v(0,-1),mass:1},{position:v(0,-1),velocity:v(),mass:2}];
  const forward=resolveOriginalContactIsland(bodies,[contact(0,1,v(0,1),v(),.2)]),reverse=resolveOriginalContactIsland(bodies,[contact(1,0,v(0,-1),v(),.2)]);
  expect(forward.velocities[0].y-forward.velocities[1].y).toBeCloseTo(.2,12);expect(forward.velocities).toEqual(reverse.velocities);expect(forward.contacts).toEqual(reverse.contacts);
 });
 it('opposes slip with accumulated Coulomb friction bounded by the normal impulse',()=>{
  const angular=createOriginalAngularBody(cube(),1),bodies=[{position:v(),velocity:v(1,-1,.5),mass:1,angular},{position:v(0,-2),velocity:v(),mass:Infinity}],pairs=[v(-1,-1,-1),v(1,-1,-1),v(1,-1,1),v(-1,-1,1)].map(p=>({witnessA:p,witnessB:{...p}}));
  const result=resolveOriginalContactIsland(bodies,[{bodyA:0,bodyB:1,normal:v(0,1),pairs,restitution:0,friction:.1}]),linear=result.velocities[0];
  expect(Math.hypot(linear.x-1,linear.z-.5)).toBeLessThanOrEqual(.1*result.contacts[0].normalImpulse+1e-12);expect(Math.hypot(linear.x,linear.z)).toBeLessThan(Math.hypot(1,.5));
  const after=cloneOriginalAngularBody(angular);after.angularVelocity={...result.angularVelocities[0]!};for(const p of pairs)expect(originalAngularPointVelocity(v(),linear,after,p.witnessA).y).toBeGreaterThanOrEqual(-1e-8);
 });
 it('matches independent pair manifolds without sharing scratch results or mutating inputs',()=>{
  const angular0=createOriginalAngularBody(cube(),1),angular2=createOriginalAngularBody(cube(.5),2);angular0.angularVelocity=v(2,-3,4);angular2.angularVelocity=v(-1,2,-4);
  const bodies:OriginalAngularContactBody[]=[{position:v(),velocity:v(.5,-1,.2),mass:1,angular:angular0},{position:v(0,-2),velocity:v(),mass:Infinity},{position:v(4,0),velocity:v(-.4,-2,.3),mass:2,angular:angular2},{position:v(4,-1),velocity:v(),mass:Infinity}];
  const contacts=[contact(0,1,v(0,1),v(.25,-1,.1),.2,.5),contact(2,3,v(0,1),v(4.1,-.5,.1),.1,.1)],before=structuredClone(bodies),old=structuredClone(bodies);
  const expected=contacts.map(c=>resolveOriginalAngularManifold(old[c.bodyA],old[c.bodyB],c.normal,c.pairs,c.restitution,c.friction)),result=resolveOriginalContactIsland(bodies,contacts);
  close(result.velocities[0],expected[0].velocityA);close(result.velocities[1],expected[0].velocityB);close(result.velocities[2],expected[1].velocityA);close(result.velocities[3],expected[1].velocityB);close(result.angularVelocities[0]!,old[0].angular!.angularVelocity);close(result.angularVelocities[2]!,old[2].angular!.angularVelocity);
  expect(bodies).toEqual(before);const saved=structuredClone(result);result.velocities[0].x=999;result.angularVelocities[0]!.x=999;expect(bodies).toEqual(before);
  expect(resolveOriginalContactIsland(bodies,contacts)).toEqual(saved);
 });
 it('returns detached pass-through states for no contacts and reports inactive separating contacts',()=>{
  const a={position:v(),velocity:v(0,1),mass:1},b={position:v(0,-2),velocity:v(),mass:Infinity};
  const empty=resolveOriginalContactIsland([a,b],[]);expect(empty).toMatchObject({iterations:0,converged:true,maxNormalResidual:0,maxImpulseUpdate:0,contacts:[]});expect(empty.velocities).toEqual([a.velocity,b.velocity]);expect(empty.velocities[0]).not.toBe(a.velocity);
  expect(resolveOriginalContactIsland([a,b],[contact(0,1,v(0,1),v())]).contacts).toEqual([{normalImpulse:0,active:false}]);
 });
 it('reports unresolved kinematic constraints at the unchanged iteration cap',()=>{
  const result=resolveOriginalContactIsland([{position:v(),velocity:v(0,-1),mass:Infinity},{position:v(),velocity:v(),mass:Infinity}],[contact(0,1,v(0,1),v(),.2)]);
  expect(result.iterations).toBe(128);expect(result.converged).toBe(false);expect(result.maxNormalResidual).toBeCloseTo(1.2);expect(result.contacts[0].active).toBe(false);
 });
 it('rejects malformed body indices, self constraints, witnesses, coefficients and poses',()=>{
  const bodies=[{position:v(),velocity:v(0,-1),mass:1},{position:v(),velocity:v(),mass:Infinity}],base=contact(0,1,v(0,1),v());
  for(const c of [{...base,bodyA:-1},{...base,bodyB:2},{...base,bodyB:0},{...base,bodyA:.5},{...base,normal:v()},{...base,pairs:[]},{...base,pairs:[{witnessA:v(NaN),witnessB:v()}]},{...base,friction:-1},{...base,restitution:NaN}])expect(()=>resolveOriginalContactIsland(bodies,[c])).toThrow();
  expect(()=>resolveOriginalContactIsland([{...bodies[0],mass:0},bodies[1]],[base])).toThrow();expect(()=>resolveOriginalContactIsland([{...bodies[0],position:v(Infinity)},bodies[1]],[base])).toThrow();
 });
});
