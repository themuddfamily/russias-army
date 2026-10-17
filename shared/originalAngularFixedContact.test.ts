import {describe,expect,it} from 'vitest';
import {createOriginalSceneGeometry,type OriginalSceneData} from './originalSceneGeometry';
import {createOriginalAngularBody,originalAngularConvex} from './originalAngularBody';
import {createOriginalProjectile,stepOriginalProjectilePhysicsSubstep,type OriginalProjectileState} from './originalExplosives';
import {stepOriginalPhysicsWorld,type OriginalMovableBody,type OriginalPhysicsContactDiagnostic} from './originalPlayerPhysics';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';

const at=(x=0,y=0,z=0):Vec3=>({x,y,z}),I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function box(x=.1,y=.1,z=.1):OriginalConvexPolytope {
 return {vertices:[at(-x,-y,-z),at(x,-y,-z),at(-x,y,-z),at(x,y,-z),at(-x,-y,z),at(x,-y,z),at(-x,y,z),at(x,y,z)],
  faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],
  faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
}
function geometry(models:Array<{name:string;vertices:Vec3[];faces:Array<[number,number,number]>}>){
 const data:OriginalSceneData={nodes:models.map(m=>({name:m.name,resource:m.name,parent:'World',matrix:[...I],visibility:1,shader:'default'})),
  meshes:models.map(m=>({resource:m.name,part:0,positions:m.vertices.map(p=>[p.x,-p.z,p.y]),faces:m.faces,normals:[],tex_coords:[]}))};
 return createOriginalSceneGeometry(data,{scale:1,includeModel:()=>true});
}
const floor=()=>geometry([{name:'floor',vertices:[at(-10,0,-10),at(10,0,-10),at(10,0,10),at(-10,0,10)],faces:[[0,1,2],[0,2,3]]}]);
function rotating(spin:number):OriginalMovableBody {
 const shape=box(1,.1,.1),angular=createOriginalAngularBody(shape,1),angle=Math.PI/4;
 angular.orientation={x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)};angular.angularVelocity=at(0,0,spin);
 const convex=originalAngularConvex(angular),position=at(0,-Math.min(...convex.vertices.map(v=>v.y))+.02023529411764706+.00005);
 return {id:'rotating',angular,convex,position,velocity:at(0,-1),radius:Math.sqrt(1.02),mass:1,restitution:.2,friction:.5};
}
function projectile(body:OriginalMovableBody):OriginalProjectileState {
 const result=createOriginalProjectile('launcher',body.position,at(1),'owner');
 result.position={...body.position};result.velocity={...body.velocity};result.angular=structuredClone(body.angular!);result.convex=originalAngularConvex(result.angular);return result;
}

describe('selected immutable fixed feature angular contact admission',()=>{
 it('refreshes the selected finite triangle rather than admitting any other touching model',()=>{
  const g=geometry([{name:'selected',vertices:[at(0,-2,-2),at(0,2,-2),at(0,0,2)],faces:[[0,1,2]]},
   {name:'unrelated',vertices:[at(4,-2,-2),at(4,2,-2),at(4,0,2)],faces:[[0,1,2]]}]),shape=box();
  const candidate=g.sweepConvex(at(-1),at(1),shape,.02)!;expect(candidate).not.toBeNull();
  const feature=candidate.fixedFeature!;expect(feature).toBeDefined();expect(feature.model).toBe('selected');expect(feature.sourceIndex).toBe(0);expect(feature.revision).toBe(g.fixedTrianglePage(0).revision);
  for(const object of [feature,feature.triangle,...feature.triangle])expect(Object.isFrozen(object)).toBe(true);
  expect(g.contactsConvex(at(4.05),shape,.02).some(contact=>contact.model==='unrelated')).toBe(true);
  expect(feature.refresh(shape,at(4.05),.02)).toBeNull();
  expect(feature.refresh(shape,at(-.11),.02)).not.toBeNull();
  expect(Reflect.set(feature,'sourceIndex',1)).toBe(false);expect(feature.sourceIndex).toBe(0);
 });

 it('rebuilds current witnesses and adjoining coplanar patches over the actual rotated hull',()=>{
  const g=floor(),shape=box(.3,.1,.2),candidate=g.sweepConvex(at(0,1),at(0,-1),shape,.02)!;
  const angular=createOriginalAngularBody(shape,1);angular.orientation={x:0,y:Math.sin(.2),z:0,w:Math.cos(.2)};
  const actual=originalAngularConvex(angular),position=at(0,-Math.min(...actual.vertices.map(v=>v.y))+.01),fresh=candidate.fixedFeature!.refresh(actual,position,.02)!;
  const stationary=g.sweepConvex(position,position,actual,.02)!;
  expect(fresh).not.toBeNull();expect(fresh.fraction).toBe(0);expect(fresh.normal).toEqual(stationary.normal);
  expect(fresh.witnessA).toEqual(stationary.witnessA);expect(fresh.witnessB).toEqual(stationary.witnessB);expect(fresh.witnessPairs).toEqual(stationary.witnessPairs);
  expect(fresh.witnessPairs!.length).toBeGreaterThan(1);expect(fresh.witnessPairs).not.toEqual(candidate.witnessPairs);
  const before=structuredClone(fresh.witnessPairs);fresh.witnessPairs![0].witnessA.x=999;
  expect(candidate.fixedFeature!.refresh(actual,position,.02)!.witnessPairs).toEqual(before);
 });

 it('retains a genuine finite edge with its fresh angled normal and rejects a farther same-plane pose',()=>{
  const g=geometry([{name:'finite',vertices:[at(-1,0,-1),at(1,0,-1),at(0,0,1)],faces:[[0,1,2]]}]),shape=box();
  const candidate=g.sweepConvex(at(0,.5),at(0,.1),shape,.05)!;
  const edge=candidate.fixedFeature!.refresh(shape,at(0,.12,1.12),.05)!;
  expect(edge).not.toBeNull();expect(edge.normal.y).toBeGreaterThan(.1);expect(edge.normal.z).toBeGreaterThan(.1);
  expect(edge.normal).not.toEqual(candidate.normal);expect(edge.witnessB!.z).toBeCloseTo(1,10);
  expect(candidate.fixedFeature!.refresh(shape,at(0,.12,2),.05)).toBeNull();
 });

 it('binds door feature identity to its construction instance without claiming live activation',()=>{
  const model={name:'Door open1',vertices:[at(0,-2,-2),at(0,2,-2),at(0,0,2)],faces:[[0,1,2] as [number,number,number]]},a=geometry([model]),b=geometry([model]),shape=box();
  const hitA=a.sweepConvex(at(-1),at(1),shape,.02)!,hitB=b.sweepConvex(at(-1),at(1),shape,.02)!;
  expect(hitA.fixedFeature!.model).toBe('Door open1');expect(hitA.fixedFeature!.sourceIndex).toBe(hitB.fixedFeature!.sourceIndex);
  expect(hitA.fixedFeature!.revision).not.toBe(hitB.fixedFeature!.revision);
  expect(hitA.fixedFeature!.refresh(shape,at(-.11),.02)).not.toBeNull();
 });

 it('consumes rejected rotated-away fixed sweeps without response or notifications in joint and standalone physics',()=>{
  const g=floor(),body=rotating(-180),state=projectile(body),free=structuredClone(state),events:OriginalPhysicsContactDiagnostic[]=[];let proposals=0,notifications=0;
  const sweep=(a:Vec3,b:Vec3,s:OriginalConvexPolytope,v?:((point:Vec3)=>Vec3))=>{const hit=g.sweepConvex(a,b,s,.02023529411764706,v);if(hit&&(hit.fraction??0)>0)proposals++;return hit;};
  const result=stepOriginalPhysicsWorld([],[],{movableBodies:[body],contactDistance:.02023529411764706,sweep:()=>null,sweepConvex:sweep,onResolvedContact:e=>events.push(e)});
  let standalone=0;for(let i=0;i<10;i++){
   standalone+=stepOriginalProjectilePhysicsSubstep(state,{radius:body.radius,sweep:()=>null,sweepConvex:sweep,onContact:()=>notifications++});
   stepOriginalProjectilePhysicsSubstep(free,{radius:body.radius,sweep:()=>null,sweepConvex:()=>null});
  }
  expect(proposals).toBeGreaterThan(1);expect(events).toHaveLength(0);expect(result.contacts).toBe(0);expect(standalone).toBe(0);expect(notifications).toBe(0);
  expect(result.kind).toBe('complete');expect(result.requestedTime).toBeCloseTo(.05,14);expect(result.advancedTime).toBeCloseTo(.05,12);expect(result.remainingTime).toBe(0);
  for(const axis of ['x','y','z'] as const){expect(state.position[axis]).toBeCloseTo(free.position[axis],11);expect(state.velocity[axis]).toBeCloseTo(free.velocity[axis],11);}
  for(const axis of ['x','y','z','w'] as const)expect(state.angular!.orientation[axis]).toBeCloseTo(free.angular!.orientation[axis],11);
 });

 it('keeps genuine changed-orientation fixed contact responses in joint and standalone physics',()=>{
  const g=floor(),body=rotating(180),state=projectile(body),events:OriginalPhysicsContactDiagnostic[]=[];let notifications=0;
  const sweep=(a:Vec3,b:Vec3,s:OriginalConvexPolytope,v?:((point:Vec3)=>Vec3))=>g.sweepConvex(a,b,s,.02023529411764706,v);
  const result=stepOriginalPhysicsWorld([],[],{movableBodies:[body],contactDistance:.02023529411764706,sweep:()=>null,sweepConvex:sweep,onResolvedContact:e=>events.push(e)});
  const count=stepOriginalProjectilePhysicsSubstep(state,{radius:body.radius,sweep:()=>null,sweepConvex:sweep,onContact:contact=>{notifications++;expect(contact.normal.y).toBeGreaterThan(.5);expect(contact.witnessA).toBeDefined();expect(contact.witnessB).toBeDefined();}});
  expect(result.contacts).toBeGreaterThan(0);expect(result.contacts).toBe(events.length);expect(events.some(e=>e.fraction>0&&e.bodyB.type==='fixed')).toBe(true);
  expect(count).toBeGreaterThan(0);expect(notifications).toBe(count);expect(Object.values(state.velocity).every(Number.isFinite)).toBe(true);
 });

 for(const peer of [false,true])it(`preserves T=0 translated contacts with unchanged nonidentity orientation (shared hull peer=${peer})`,()=>{
  const g=floor(),shape=box(),angular=createOriginalAngularBody(shape,1);angular.orientation={x:0,y:Math.sin(.1),z:0,w:Math.cos(.1)};
  const body:OriginalMovableBody={id:'unchanged',position:at(0,.101),velocity:at(0,-1),convex:originalAngularConvex(angular),angular,radius:Math.sqrt(.03),mass:1,restitution:.2,friction:.5};
  const state=projectile(body),events:OriginalPhysicsContactDiagnostic[]=[],bodies=[body];
  if(peer){const other={...createOriginalAngularBody(shape,1),referenceConvex:angular.referenceConvex};bodies.push({...body,id:'peer',position:at(100,100),velocity:at(),angular:other,convex:originalAngularConvex(other)});}
  const sweep=(a:Vec3,b:Vec3,s:OriginalConvexPolytope,v?:((point:Vec3)=>Vec3))=>g.sweepConvex(a,b,s,0,v);
  stepOriginalPhysicsWorld([],[],{movableBodies:bodies,contactDistance:0,sweep:()=>null,sweepConvex:sweep,onResolvedContact:e=>events.push(e)});
  expect(events.some(e=>e.fraction>0&&e.bodyA.id==='unchanged'&&e.bodyB.type==='fixed')).toBe(true);
  expect(stepOriginalProjectilePhysicsSubstep(state,{radius:body.radius,sweep:()=>null,sweepConvex:sweep})).toBeGreaterThan(0);
 });
});
