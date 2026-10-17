import {readFileSync} from 'node:fs';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import type {OriginalSceneData} from './originalSceneGeometry';
import {describe,expect,it} from 'vitest';
import {advanceOriginalAngularBody,cloneOriginalAngularBody,createOriginalAngularBody,originalAngularCenter,originalAngularConvex,
 originalAngularPointVelocity,originalRotateVector,resolveOriginalAngularContact,resolveOriginalAngularManifold,validOriginalQuaternion,type OriginalQuaternion} from './originalAngularBody';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';
import {originalGrenadeConvex} from './originalGrenadeShape';
import {originalGrenadeBasisFromDirection} from './originalGrenadeOrientation';
import {originalRpgConvex,originalRpgBasisFromDirection} from './originalRpgShape';
const at=(x=0,y=0,z=0):Vec3=>({x,y,z}),DEG=Math.PI/180;
const qz=(angle:number):OriginalQuaternion=>({x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)});
function close(actual:Vec3,expected:Vec3){for(const axis of ['x','y','z'] as const)expect(actual[axis]).toBeCloseTo(expected[axis],10);}
function box(x=1,y=1,z=1,offset=at()):OriginalConvexPolytope {
 const vertices=[at(-x,-y,-z),at(x,-y,-z),at(-x,y,-z),at(x,y,-z),at(-x,-y,z),at(x,-y,z),at(-x,y,z),at(x,y,z)].map(v=>at(v.x+offset.x,v.y+offset.y,v.z+offset.z));
 return {vertices,faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],
  faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
}
describe('explicit uniform convex-volume angular reconstruction',()=>{
 it('integrates analytic box COM and all principal inertias independently of model pivot',()=>{
  for(const offset of [at(),at(10,-23,7),at(100000,-300000,200000)]){
   const state=createOriginalAngularBody(box(1,2,3,offset),2);close(state.centerOfMass,offset);
   expect(state.inverseInertia.xx).toBeCloseTo(3/26,11);expect(state.inverseInertia.yy).toBeCloseTo(3/20,11);expect(state.inverseInertia.zz).toBeCloseTo(3/10,11);
   expect(state.inverseInertia.xy).toBeCloseTo(0,11);expect(state.inverseInertia.xz).toBeCloseTo(0,11);expect(state.inverseInertia.yz).toBeCloseTo(0,11);
  }
 });
 it('retains a full symmetric tensor for an oblique reference hull rather than diagonalizing world axes',()=>{
  const base=box(1,2,3),q=qz(Math.PI/4),shape={...base,vertices:base.vertices.map(v=>originalRotateVector(q,v)),faceNormals:base.faceNormals.map(v=>originalRotateVector(q,v)),edgeDirections:base.edgeDirections.map(v=>originalRotateVector(q,v))};
  const state=createOriginalAngularBody(shape,2),a=3/26,b=3/20;
  expect(state.inverseInertia.xx).toBeCloseTo((a+b)/2,11);expect(state.inverseInertia.yy).toBeCloseTo((a+b)/2,11);
  expect(state.inverseInertia.xy).toBeCloseTo((a-b)/2,11);expect(state.inverseInertia.zz).toBeCloseTo(.3,11);
 });
 it('imports actual recovered closed grenade and RPG hulls with source mass ratios',()=>{
  const grenade=originalGrenadeConvex(originalGrenadeBasisFromDirection(at(0,0,-1))),rpg=originalRpgConvex(originalRpgBasisFromDirection(at(0,0,-1)));
  for(const shape of [grenade,rpg]){
   const one=createOriginalAngularBody(shape,1),hundred=createOriginalAngularBody(shape,100);
   expect(originalAngularConvex(one)).toBe(shape);close(hundred.centerOfMass,one.centerOfMass);
   for(const component of ['xx','yy','zz','xy','xz','yz'] as const)expect(hundred.inverseInertia[component]*100).toBeCloseTo(one.inverseInertia[component],9);
   expect(Object.isFrozen(one.centerOfMass)).toBe(true);expect(Object.isFrozen(one.inverseInertia)).toBe(true);
  }
 });
 it('advances world degree/sec orientation about COM while reconstructing an offset model pivot',()=>{
  const state=createOriginalAngularBody(box(1,2,3,at(2)),1);state.angularVelocity=at(0,0,90);
  const next=advanceOriginalAngularBody(at(10,4,3),at(3,2,1),state,1);
  close(next,at(15,4,4));close(originalAngularCenter(next,state),at(15,6,4));
  close(originalRotateVector(state.orientation,at(1)),at(0,1));expect(validOriginalQuaternion(state.orientation)).toBe(true);
  // World-axis angular integration left-multiplies an existing rotation.
  state.angularVelocity=at(90);const before=originalAngularCenter(next,state),after=advanceOriginalAngularBody(next,at(),state,1);
  close(originalAngularCenter(after,state),before);close(originalRotateVector(state.orientation,at(1)),at(0,0,1));
 });
 it('preserves existing exact zero-spin translation and does not modify its quaternion',()=>{
  const state=createOriginalAngularBody(box(1,2,3,at(1000,-3000,7)),1);state.orientation=qz(.4);
  const before={...state.orientation},position=at(.1,.2,.3),velocity=at(.7,-.2,.13),seconds=.005;
  expect(advanceOriginalAngularBody(position,velocity,state,seconds)).toEqual(at(position.x+velocity.x*seconds,position.y+velocity.y*seconds,position.z+velocity.z*seconds));
  expect(state.orientation).toEqual(before);expect(position).toEqual(at(.1,.2,.3));
 });
 it('preserves world angular momentum for asymmetric nonprincipal free spin and converges in energy',()=>{
  const run=(steps:number)=>{
   const state=createOriginalAngularBody(box(1,2,3,at(4,-2,1)),2);state.orientation=qz(.3);state.angularVelocity=at(37,71,-43);
   const momentum=()=>{
    const q=state.orientation,local=originalRotateVector({x:-q.x,y:-q.y,z:-q.z,w:q.w},at(state.angularVelocity.x*DEG,state.angularVelocity.y*DEG,state.angularVelocity.z*DEG));
    return originalRotateVector(q,at(local.x*26/3,local.y*20/3,local.z*10/3));
   };
   const energy=()=>{const l=momentum();return .5*DEG*(l.x*state.angularVelocity.x+l.y*state.angularVelocity.y+l.z*state.angularVelocity.z);};
   const initialMomentum=momentum(),initialEnergy=energy();let position=at(3,2,1),center=originalAngularCenter(position,state);
   for(let step=0;step<steps;step++){
    position=advanceOriginalAngularBody(position,at(),state,1/steps);close(momentum(),initialMomentum);close(originalAngularCenter(position,state),center);
    expect(validOriginalQuaternion(state.orientation)).toBe(true);
   }
   return {error:Math.abs(energy()-initialEnergy),omega:state.angularVelocity};
  };
  const coarse=run(20),fine=run(80);
  expect(Math.abs(fine.omega.x-37)+Math.abs(fine.omega.y-71)+Math.abs(fine.omega.z+43)).toBeGreaterThan(1);
  expect(fine.error).toBeLessThan(coarse.error/8);expect(fine.error).toBeLessThan(1e-4);
 });
 it('rotates the full reference hull, normals and edges and caches numeric orientation without stale mutable q',()=>{
  const state=createOriginalAngularBody(box(1,2,3,at(4)),1),reference=state.referenceConvex;
  expect(originalAngularConvex(state)).toBe(reference);state.orientation=qz(Math.PI/2);
  const shape=originalAngularConvex(state);expect(originalAngularConvex(state)).toBe(shape);
  close(shape.vertices[0],originalRotateVector(state.orientation,reference.vertices[0]));close(shape.faceNormals[0],at(0,1));close(shape.edgeDirections[0],at(0,1));
  expect(shape.faces).toBe(reference.faces);expect(Object.isFrozen(shape.vertices[0])).toBe(true);
  state.orientation.x=0;state.orientation.z=0;state.orientation.w=1;
  expect(originalAngularConvex(state)).toBe(reference);expect(reference.vertices[0]).toEqual(at(3,-2,-3));
 });
 it('clones dynamic orientation/spin and shares only detached immutable mass metadata',()=>{
  const input=box(1,2,3,at(4)),state=createOriginalAngularBody(input,1),copy=cloneOriginalAngularBody(state);
  copy.orientation=qz(.2);copy.angularVelocity.y=40;
  expect(state.orientation).toEqual({x:0,y:0,z:0,w:1});expect(state.angularVelocity).toEqual(at());
  expect(copy.referenceConvex).toBe(state.referenceConvex);expect(copy.inverseInertia).toBe(state.inverseInertia);
  input.vertices[0].x=999;expect(state.referenceConvex.vertices[0].x).toBe(3);
 });
 it('converts degree spin to actual point velocity about COM rather than the model pivot',()=>{
  const state=createOriginalAngularBody(box(1,1,1,at(2)),1);state.angularVelocity=at(0,0,180);
  close(originalAngularPointVelocity(at(10),at(1,2,3),state,at(12,1)),at(1-Math.PI,2,3));
 });
 it('a centered elastic impulse changes translation without inventing spin',()=>{
  const state=createOriginalAngularBody(box(),1),a={position:at(),velocity:at(-1),mass:1,angular:state},b={position:at(-2),velocity:at(),mass:Infinity};
  const response=resolveOriginalAngularContact(a,b,at(1),at(-1),at(-1),1,0);
  close(response.velocityA,at(1));close(response.velocityB,at());expect(state.angularVelocity).toEqual(at());expect(a.velocity).toEqual(at(-1));
 });
 it('an off-center elastic impulse conserves energy and angular momentum about its fixed contact',()=>{
  const state=createOriginalAngularBody(box(),1),a={position:at(),velocity:at(-1),mass:1,angular:state},b={position:at(-2),velocity:at(),mass:Infinity},point=at(-1,.5);
  const response=resolveOriginalAngularContact(a,b,at(1),point,point,1,0),omega=state.angularVelocity.z*DEG;
  expect(response.velocityA.x).toBeCloseTo(5/11,11);expect(omega).toBeCloseTo(-12/11,11);
  expect(.5*response.velocityA.x**2+(1/3)*omega**2).toBeCloseTo(.5,11);
  expect((2/3)*omega+.5*response.velocityA.x).toBeCloseTo(-.5,11);
 });
 it('exchanges linear and angular momentum between two freely rotating bodies',()=>{
  const angularA=createOriginalAngularBody(box(),1),angularB=createOriginalAngularBody(box(),1),point=at(0,.5);
  const response=resolveOriginalAngularContact({position:at(1),velocity:at(-1),mass:1,angular:angularA},{position:at(-1),velocity:at(1),mass:1,angular:angularB},at(1),point,point,1,0);
  expect(response.velocityA.x+response.velocityB.x).toBeCloseTo(0,11);expect(angularA.angularVelocity.z+angularB.angularVelocity.z).toBeCloseTo(0,11);
  const energy=.5*(response.velocityA.x**2+response.velocityB.x**2)+(1/3)*DEG**2*(angularA.angularVelocity.z**2+angularB.angularVelocity.z**2);
  expect(energy).toBeCloseTo(1,11);
 });
 it('friction uses contact point slip and creates angular response without changing orientation',()=>{
  const state=createOriginalAngularBody(box(),1),before={...state.orientation};
  const response=resolveOriginalAngularContact({position:at(),velocity:at(-1,1),mass:1,angular:state},{position:at(-2),velocity:at(),mass:Infinity},at(1),at(-1),at(-1),0,1);
  expect(response.velocityA.y).toBeCloseTo(.6,11);expect(state.angularVelocity.z*DEG).toBeCloseTo(.6,11);
  close(originalAngularPointVelocity(at(),response.velocityA,state,at(-1)),at());expect(state.orientation).toEqual(before);
 });
 it('ignores separating contacts and handles two fixed bodies without NaN',()=>{
  const state=createOriginalAngularBody(box(),1);state.angularVelocity=at(0,0,10);
  const before={...state.angularVelocity},a={position:at(),velocity:at(1),mass:1,angular:state},b={position:at(-2),velocity:at(),mass:Infinity};
  expect(resolveOriginalAngularContact(a,b,at(1),at(-1),at(-1),1,.5).velocityA).toEqual(a.velocity);expect(state.angularVelocity).toEqual(before);
  expect(resolveOriginalAngularContact({...a,mass:Infinity},b,at(1),at(-1),at(-1),1,0)).toEqual({velocityA:at(1),velocityB:at()});
 });
 it('validates normalized quaternions, hull closure, mass and step boundaries',()=>{
  expect(validOriginalQuaternion(qz(1))).toBe(true);expect(validOriginalQuaternion({x:0,y:0,z:0,w:1.0000001})).toBe(true);
  for(const q of [{x:0,y:0,z:0,w:0},{x:NaN,y:0,z:0,w:1},{x:0,y:0,z:0,w:1.001}])expect(validOriginalQuaternion(q)).toBe(false);
  for(const mass of [0,-1,Infinity,NaN])expect(()=>createOriginalAngularBody(box(),mass)).toThrow();
  const shape=box();expect(()=>createOriginalAngularBody({...shape,faces:shape.faces!.slice(1)},1)).toThrow(/Open/);
  expect(()=>createOriginalAngularBody({...shape,faces:shape.faces!.map(face=>[face[0],face[2],face[1]])},1)).toThrow(/inward/);
  const state=createOriginalAngularBody(box(),1);expect(()=>advanceOriginalAngularBody(at(),at(),state,-1)).toThrow();
 });
 it('a symmetric square support patch rebounds as a face without spurious tipping',()=>{
  const state=createOriginalAngularBody(box(),1),pairs=[at(-1,-1,-1),at(1,-1,-1),at(1,-1,1),at(-1,-1,1)].map(point=>({witnessA:point,witnessB:{...point}}));
  const before=JSON.stringify(pairs),orientation={...state.orientation};
  const response=resolveOriginalAngularManifold({position:at(),velocity:at(0,-2),mass:1,angular:state},{position:at(0,-2),velocity:at(),mass:Infinity},at(0,1),pairs,.2,0);
  expect(response.velocityA.y).toBeCloseTo(.4,10);close(response.velocityB,at());close(state.angularVelocity,at());
  expect(state.orientation).toEqual(orientation);expect(JSON.stringify(pairs)).toBe(before);
  for(const pair of pairs)expect(originalAngularPointVelocity(at(),response.velocityA,state,pair.witnessA).y).toBeCloseTo(.4,10);
 });
 it('an off-center clipped support patch produces real torque and equal opposite Newton reaction',()=>{
  const angularA=createOriginalAngularBody(box(),1),angularB=createOriginalAngularBody(box(),2),positionA=at(0,1),positionB=at(0,-1);
  const pairs=[at(.5,0,-.5),at(1,0,-.5),at(1,0,.5),at(.5,0,.5)].map(point=>({witnessA:point,witnessB:{...point}}));
  const response=resolveOriginalAngularManifold({position:positionA,velocity:at(0,-1),mass:1,angular:angularA},{position:positionB,velocity:at(),mass:2,angular:angularB},at(0,1),pairs,.2,0);
  expect(angularA.angularVelocity.z).toBeGreaterThan(1);expect(angularB.angularVelocity.z).toBeLessThan(-1);
  close(at(response.velocityA.x+2*response.velocityB.x,response.velocityA.y+2*response.velocityB.y,response.velocityA.z+2*response.velocityB.z),at(0,-1));
  // COMs lie on the y axis and impulses are normal, so orbital angular
  // momentum remains zero: each spin change has an equal opposite reaction.
  close(at((2/3)*angularA.angularVelocity.x+(4/3)*angularB.angularVelocity.x,
   (2/3)*angularA.angularVelocity.y+(4/3)*angularB.angularVelocity.y,
   (2/3)*angularA.angularVelocity.z+(4/3)*angularB.angularVelocity.z),at());
 });
 it('manifold restitution is an initial target, not multiplied again on every solver pass',()=>{
  const angularA=createOriginalAngularBody(box(),1),angularB=createOriginalAngularBody(box(),2),pairs=[at(-1,0,-1),at(1,0,-1),at(1,0,1),at(-1,0,1)].map(point=>({witnessA:point,witnessB:{...point}}));
  const response=resolveOriginalAngularManifold({position:at(0,1),velocity:at(0,-1),mass:1,angular:angularA},{position:at(0,-1),velocity:at(),mass:2,angular:angularB},at(0,1),pairs,.2,0);
  expect(response.velocityA.y).toBeCloseTo(-.2,10);expect(response.velocityB.y).toBeCloseTo(-.4,10);
  expect(response.velocityA.y-response.velocityB.y).toBeCloseTo(.2,10);close(angularA.angularVelocity,at());close(angularB.angularVelocity,at());
 });
 it('solves the rotating body in B order against infinite fixed A with opposite witnesses and normal',()=>{
  const state=createOriginalAngularBody(box(),1),pairs=[at(-1,1,-1),at(1,1,-1),at(1,1,1),at(-1,1,1)].map(point=>({witnessA:{...point},witnessB:point}));
  const response=resolveOriginalAngularManifold({position:at(0,2),velocity:at(),mass:Infinity},{position:at(),velocity:at(0,2),mass:1,angular:state},at(0,1),pairs,.2,0);
  close(response.velocityA,at());expect(response.velocityB.y).toBeCloseTo(-.4,10);close(state.angularVelocity,at());
 });
 it('accumulates vector friction within each point Coulomb cone and opposes broad-face slip',()=>{
  const state=createOriginalAngularBody(box(),1),pairs=[at(-1,-1,-1),at(1,-1,-1),at(1,-1,1),at(-1,-1,1)].map(point=>({witnessA:point,witnessB:{...point}}));
  const response=resolveOriginalAngularManifold({position:at(),velocity:at(1,-1,.5),mass:1,angular:state},{position:at(0,-2),velocity:at(),mass:Infinity},at(0,1),pairs,0,.1);
  const tangentialImpulse=Math.hypot(response.velocityA.x-1,response.velocityA.z-.5),normalImpulse=response.velocityA.y+1;
  expect(tangentialImpulse).toBeLessThanOrEqual(.1*normalImpulse+1e-12);
  expect(Math.hypot(response.velocityA.x,response.velocityA.z)).toBeLessThan(Math.hypot(1,.5));
  for(const pair of pairs)expect(originalAngularPointVelocity(at(),response.velocityA,state,pair.witnessA).y).toBeGreaterThanOrEqual(-1e-8);
 });
 it('keeps caller velocities and earlier results detached during later frictional manifold solves',()=>{
  const velocity=Object.freeze(at(1,-1,.5)),fixedVelocity=Object.freeze(at()),state=createOriginalAngularBody(box(),1);
  const pairs=[at(-1,-1,-1),at(1,-1,-1),at(1,-1,1),at(-1,-1,1)].map(point=>({witnessA:point,witnessB:{...point}}));
  const response=resolveOriginalAngularManifold({position:at(),velocity,mass:1,angular:state},{position:at(0,-2),velocity:fixedVelocity,mass:Infinity},at(0,1),pairs,.2,.5),retained=structuredClone(response);
  expect(velocity).toEqual(at(1,-1,.5));expect(fixedVelocity).toEqual(at());expect(response.velocityA).not.toBe(velocity);expect(response.velocityB).not.toBe(fixedVelocity);
  resolveOriginalAngularManifold({position:at(),velocity:at(-.5,-2,1),mass:1,angular:state},{position:at(0,-2),velocity:at(),mass:Infinity},at(0,1),pairs,.2,1);
  expect(response).toEqual(retained);
 });
 it('validates manifold input and handles fixed or separating constraints without changing angular state',()=>{
  const state=createOriginalAngularBody(box(),1),a={position:at(),velocity:at(0,1),mass:1,angular:state},b={position:at(0,-2),velocity:at(),mass:Infinity},pair={witnessA:at(0,-1),witnessB:at(0,-1)};
  expect(resolveOriginalAngularManifold(a,b,at(0,1),[pair],.2,.5)).toEqual({velocityA:a.velocity,velocityB:b.velocity});expect(state.angularVelocity).toEqual(at());
  expect(resolveOriginalAngularManifold({...a,mass:Infinity},b,at(0,1),[pair],.2,.5)).toEqual({velocityA:a.velocity,velocityB:b.velocity});
  for(const pairs of [[],[{witnessA:at(NaN),witnessB:at()}]])expect(()=>resolveOriginalAngularManifold(a,b,at(0,1),pairs,.2,0)).toThrow();
  for(const invalid of [-1,NaN,Infinity]){
   expect(()=>resolveOriginalAngularManifold(a,b,at(0,1),[pair],invalid,0)).toThrow();
   expect(()=>resolveOriginalAngularManifold(a,b,at(0,1),[pair],0,invalid)).toThrow();
  }
  expect(()=>resolveOriginalAngularManifold(a,b,at(),[pair],0,0)).toThrow();
 });
 it('converges the recovered ten-point barrel base with redundant interior patch constraints',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8')) as OriginalSceneData;
  const convex=new OriginalBarrelWorld(registerOriginalMapRuntime('barrack',data)).bodies[0].convex;
  const base=convex.vertices.filter(v=>Math.abs(v.y)<1e-10);
  expect(base).toHaveLength(10);
  const interior=(a:Vec3,b:Vec3,c:Vec3)=>at((a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3,(a.z+b.z+c.z)/3);
  for(const points of [base,[...base,interior(base[0],base[3],base[6]),interior(base[1],base[5],base[8])]]){
   const state=createOriginalAngularBody(convex,1);expect(state.centerOfMass.y).toBeCloseTo(.607,2);
   const n=at(4e-9,1,0),length=Math.hypot(n.x,n.y,n.z);n.x/=length;n.y/=length;
   const pairs=points.map(point=>({witnessA:{...point},witnessB:at(point.x-n.x*(n.x*point.x+point.y),point.y-n.y*(n.x*point.x+point.y),point.z)}));
   const before=JSON.stringify(pairs);
   const response=resolveOriginalAngularManifold({position:at(),velocity:at(0,-1.7),mass:1,angular:state},{position:at(),velocity:at(),mass:Infinity},n,pairs,.2,.1);
   expect(response.velocityA.y).toBeCloseTo(.34,12);
   const target=.34*n.y;
   for(const point of base){const v=originalAngularPointVelocity(at(),response.velocityA,state,point);
    expect(Math.abs(v.x*n.x+v.y*n.y-target)).toBeLessThanOrEqual(1e-12);
   }
   expect(Math.hypot(state.angularVelocity.x,state.angularVelocity.y,state.angularVelocity.z)).toBeLessThan(1e-8);
   expect(JSON.stringify(pairs)).toBe(before);
  }
 });

});


it('zero elapsed time leaves a nonprincipal spinning pose and velocity exactly unchanged',()=>{
 const angular=createOriginalAngularBody(box(1,2,3,at(2)),2);angular.angularVelocity=at(31,47,-19);angular.orientation=qz(.37);
 const before=structuredClone(angular),position=at(.1,2,.3);
 expect(advanceOriginalAngularBody(position,at(7,8,9),angular,0)).toEqual(position);expect(angular).toEqual(before);
});
