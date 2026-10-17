import type {Vec3,OriginalBarrelSnapshot} from './protocol';
import type {ArenaRayHit,ArenaRaycastOptions} from './arenaCollision';
import type {OriginalMapRuntime} from './originalMapRuntime';
import type {OriginalMovableBody} from './originalPlayerPhysics';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import {createOriginalBarrelConvex} from './originalBarrelShape';
import {createOriginalAngularBody,originalAngularConvex,originalRotateVector,validOriginalQuaternion} from './originalAngularBody';
import {createOriginalSceneGeometry,originalNodeWorldMatrices,sourcePointToWorld,type OriginalSceneGeometry,type OriginalSceneNode} from './originalSceneGeometry';

export const ORIGINAL_BARREL_LIFT_SOURCE=10;
export const ORIGINAL_BARREL_MASS=1;
export const ORIGINAL_BARREL_RESTITUTION=.2;
export const ORIGINAL_BARREL_FRICTION=1;
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const magnitude=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
const finite=(v:Vec3)=>v&&[v.x,v.y,v.z].every(Number.isFinite);
interface Template {node:OriginalSceneNode;sourceMatrix:readonly number[];initial:Vec3;convex:OriginalConvexPolytope;radius:number}
function barrelTemplate(runtime:OriginalMapRuntime,node:OriginalSceneNode,matrix:readonly number[]):Template {
 const initial=sourcePointToWorld(matrix.slice(12,15),runtime.scale),vertices:Vec3[]=[],indices=new Map<string,number>();
 const parts=runtime.data.meshes.filter(mesh=>mesh.resource.toLowerCase()===node.resource.toLowerCase());
 if(!parts.length)throw Error(`Missing source barrel mesh: ${node.name}`);
 for(const mesh of parts){
  const mapped=mesh.positions.map(p=>{
   const world=sourcePointToWorld([matrix[0]*p[0]+matrix[4]*p[1]+matrix[8]*p[2]+matrix[12],matrix[1]*p[0]+matrix[5]*p[1]+matrix[9]*p[2]+matrix[13],matrix[2]*p[0]+matrix[6]*p[1]+matrix[10]*p[2]+matrix[14]],runtime.scale);
   const v=sub(world,initial),key=[v.x,v.y,v.z].join(',');let index=indices.get(key);
   if(index===undefined){index=vertices.length;indices.set(key,index);vertices.push(v);}return index;
  });
  for(const face of mesh.faces){
   if(face.length!==3||face.some(i=>!Number.isInteger(i)||i<0||i>=mapped.length))throw Error(`Invalid source barrel face: ${node.name}`);
  }
 }
 if(vertices.length<4||!vertices.every(finite))throw Error(`Invalid source barrel hull: ${node.name}`);
 const convex=createOriginalBarrelConvex(vertices);
 return {node,sourceMatrix:Object.freeze([...matrix]),initial,convex,radius:Math.max(...vertices.map(magnitude))};
}

/** Instance-owned source barrel bodies retain their imported full hull/pivot.
 * Angular response is a documented convex-mass adapter, not measured Havok;
 * the source hurt trigger and native manifold/callback rules remain open. */
export class OriginalBarrelWorld {
 private readonly templates:ReadonlyMap<string,Template>;
 private active:OriginalMovableBody[]=[];
 private cachedGeometry:OriginalSceneGeometry|null=null;
 private geometryKey='';
 private readonly identity=Object.freeze({});
 private mutationIdentity:object=Object.freeze({});
 private forkParentIdentity?:object;private forkBaseMutation?:object;private forkBaseState?:string;
 private adoptionPrepared=false;
 constructor(private readonly runtime:OriginalMapRuntime,seed?:OriginalBarrelWorld){
  if(seed){
   if(runtime!==seed.runtime)throw Error('Foreign barrel fork runtime');
   this.templates=seed.templates;
   this.active=seed.active.map(body=>{
    const angular=createOriginalAngularBody(body.angular!.referenceConvex,body.mass);
    angular.orientation={...body.angular!.orientation};
    angular.angularVelocity={...body.angular!.angularVelocity};
    return {...body,position:{...body.position},velocity:{...body.velocity},angular,convex:originalAngularConvex(angular)};
   });
   return;
  }
  const matrices=originalNodeWorldMatrices(runtime.data);
  this.templates=new Map(runtime.data.nodes.filter(n=>n.name.trim().split(/\s+/)[0].toLowerCase()==='barrel').map(node=>[node.name,barrelTemplate(runtime,node,matrices.get(node.name.toLowerCase())!)]));
  this.reset();
 }
 get bodies():readonly OriginalMovableBody[]{return this.active;}
 /** Source/world unit binding shared by private inventory and effect stages. */
 get sourceScale():number{return this.runtime.scale;}
 /** Share imported templates, but copy each mutable pose/angular body and
  * start with an independent query cache. Useful for observer worlds and
  * frozen registered-shot blockers; later source movement cannot alter a fork. */
 fork():OriginalBarrelWorld{
  const signature=this.stateSignature(),candidate=new OriginalBarrelWorld(this.runtime,this);
  candidate.forkParentIdentity=this.identity;candidate.forkBaseMutation=this.mutationIdentity;candidate.forkBaseState=signature;return candidate;
 }
 private requireMutable():void {if(this.adoptionPrepared)throw Error('Barrel adoption already prepared');}
 /** Canonical primitive capture also detects solver/body-reference writes which
  * do not pass through methods. Derived convex/query caches are not authority. */
 private stateSignature():string {
  if(this.active.length>this.templates.size)throw Error('Invalid barrel adoption population');
  const ids=new Set<string>();
  return JSON.stringify(this.active.map(body=>{
   const template=this.templates.get(body.id),angular=body.angular;
   if(!template||ids.has(body.id)||!finite(body.position)||!finite(body.velocity)||!angular||!validOriginalQuaternion(angular.orientation)||!finite(angular.angularVelocity)
    ||body.mass!==ORIGINAL_BARREL_MASS||body.radius!==template.radius||body.restitution!==ORIGINAL_BARREL_RESTITUTION||body.friction!==ORIGINAL_BARREL_FRICTION
    ||angular.referenceConvex!==template.convex||!finite(angular.centerOfMass)||![angular.inverseInertia.xx,angular.inverseInertia.yy,angular.inverseInertia.zz,angular.inverseInertia.xy,angular.inverseInertia.xz,angular.inverseInertia.yz].every(Number.isFinite))throw Error('Invalid canonical barrel adoption state');
   ids.add(body.id);
   return [body.id,body.position.x,body.position.y,body.position.z,body.velocity.x,body.velocity.y,body.velocity.z,
    angular.orientation.x,angular.orientation.y,angular.orientation.z,angular.orientation.w,angular.angularVelocity.x,angular.angularVelocity.y,angular.angularVelocity.z,
    body.mass,body.radius,body.restitution,body.friction,angular.centerOfMass.x,angular.centerOfMass.y,angular.centerOfMass.z,
    angular.inverseInertia.xx,angular.inverseInertia.yy,angular.inverseInertia.zz,angular.inverseInertia.xy,angular.inverseInertia.xz,angular.inverseInertia.yz];
  }));
 }
 /** Adopt only a still-current DIRECT fork. All validation/allocation happens
  * here; commit is assignment-only and terminal calls are harmless. No solver
  * or public callbacks run. Trusted preexisting physics/body references MUST
  * NOT write the target during prepare-to-commit; this legacy API cannot lock
  * external references. Candidate and old target body references are detached. */
 prepareAdopt(candidate:OriginalBarrelWorld):{commit():void;rollback():void} {
  this.requireMutable();
  if(!(candidate instanceof OriginalBarrelWorld)||candidate.forkParentIdentity!==this.identity||candidate.runtime!==this.runtime||candidate.templates!==this.templates
   ||candidate.forkBaseMutation!==this.mutationIdentity||candidate.forkBaseState!==this.stateSignature())throw Error('Foreign or stale barrel adoption fork');
  candidate.stateSignature();
  const active=candidate.active.map(body=>{
   const template=this.templates.get(body.id)!,angular=createOriginalAngularBody(template.convex,ORIGINAL_BARREL_MASS),source=body.angular!;
   if(source.centerOfMass.x!==angular.centerOfMass.x||source.centerOfMass.y!==angular.centerOfMass.y||source.centerOfMass.z!==angular.centerOfMass.z
    ||(['xx','yy','zz','xy','xz','yz'] as const).some(key=>source.inverseInertia[key]!==angular.inverseInertia[key])
    ||!candidate.getModelMatrix(body.id)!.every(Number.isFinite))throw Error('Invalid canonical barrel adoption angular resource or matrix');
   angular.orientation={...body.angular!.orientation};angular.angularVelocity={...body.angular!.angularVelocity};
   return {id:body.id,position:{...body.position},velocity:{...body.velocity},angular,convex:originalAngularConvex(angular),radius:template.radius,mass:ORIGINAL_BARREL_MASS,restitution:ORIGINAL_BARREL_RESTITUTION,friction:ORIGINAL_BARREL_FRICTION};
  });
  const nextMutation=Object.freeze({});let open=true;this.adoptionPrepared=true;
  return Object.freeze({commit:()=>{if(!open)return;this.active=active;this.cachedGeometry=null;this.geometryKey='';this.mutationIdentity=nextMutation;this.adoptionPrepared=false;open=false;},
   rollback:()=>{if(!open)return;this.adoptionPrepared=false;open=false;}});
 }
 getInitialPosition(id:string):Vec3|undefined {const template=this.templates.get(id);return template?{...template.initial}:undefined;}
 reset():void {
  this.requireMutable();
  this.active=[...this.templates].map(([id,t])=>({id,position:{...t.initial,y:t.initial.y+ORIGINAL_BARREL_LIFT_SOURCE*this.runtime.scale},velocity:{x:0,y:0,z:0},convex:t.convex,angular:createOriginalAngularBody(t.convex,ORIGINAL_BARREL_MASS),radius:t.radius,mass:ORIGINAL_BARREL_MASS,restitution:ORIGINAL_BARREL_RESTITUTION,friction:ORIGINAL_BARREL_FRICTION}));
  this.cachedGeometry=null;this.geometryKey='';this.mutationIdentity=Object.freeze({});
 }
 snapshots():OriginalBarrelSnapshot[]{return this.active.map(body=>({id:body.id,position:{...body.position},velocity:{...body.velocity},orientation:{...body.angular!.orientation},angularVelocity:{...body.angular!.angularVelocity}}));}
 /** Validate the complete packet before mutation; absent entries remove models.
  * Snapshot epoch ordering belongs to the authority/Game packet boundary. */
 applySnapshots(snapshots:readonly OriginalBarrelSnapshot[]):void {
  this.requireMutable();
  const ids=new Set<string>();
  for(const s of snapshots){
   const paired=(s.orientation===undefined)===(s.angularVelocity===undefined),q=s.orientation;
   const validAngular=paired&&(q===undefined||(q!==null&&[q.x,q.y,q.z,q.w].every(Number.isFinite)&&Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)<=1e-6&&finite(s.angularVelocity!)));
   if(!this.templates.has(s.id)||ids.has(s.id)||!finite(s.position)||!finite(s.velocity)||!validAngular)throw Error(`Invalid source barrel snapshot: ${s.id}`);ids.add(s.id);
  }
  const old=new Map(this.active.map(b=>[b.id,b]));
  this.active=snapshots.map(s=>{
   const t=this.templates.get(s.id)!,angular=createOriginalAngularBody(t.convex,ORIGINAL_BARREL_MASS);
   if(s.orientation){const q=s.orientation,n=Math.hypot(q.x,q.y,q.z,q.w);angular.orientation={x:q.x/n,y:q.y/n,z:q.z/n,w:q.w/n};angular.angularVelocity={...s.angularVelocity!};}
   return {...old.get(s.id),id:s.id,position:{...s.position},velocity:{...s.velocity},angular,convex:originalAngularConvex(angular),radius:t.radius,mass:ORIGINAL_BARREL_MASS,restitution:ORIGINAL_BARREL_RESTITUTION,friction:ORIGINAL_BARREL_FRICTION};
  });
  this.mutationIdentity=Object.freeze({});
 }
 /** Source-basis full model matrix shared by rendered and query geometry.
  * Orientation is relative to the initial world-oriented retained hull. */
 getModelMatrix(id:string):number[]|undefined {
  const body=this.active.find(body=>body.id===id);if(!body)return;
  const matrix=[...this.templates.get(id)!.sourceMatrix],q=body.angular!.orientation;
  if(q.x!==0||q.y!==0||q.z!==0||q.w!==1)for(let column=0;column<3;column++){
   const offset=column*4,world=originalRotateVector(q,{x:matrix[offset],y:matrix[offset+2],z:-matrix[offset+1]});
   matrix[offset]=world.x;matrix[offset+1]=-world.z;matrix[offset+2]=world.y;
  }
  matrix[12]=body.position.x/this.runtime.scale;matrix[13]=-body.position.z/this.runtime.scale;matrix[14]=body.position.y/this.runtime.scale;
  return matrix;
 }
 private geometry():OriginalSceneGeometry|null {
  if(!this.active.length)return null;
  const key=this.active.map(b=>`${b.id}:${b.position.x},${b.position.y},${b.position.z}:${Object.values(b.angular!.orientation).join(',')}`).join('|');
  if(this.cachedGeometry&&key===this.geometryKey)return this.cachedGeometry;
  const nodes=this.active.map(body=>{
   const t=this.templates.get(body.id)!;return {...t.node,parent:'World',matrix:this.getModelMatrix(body.id)!};
  });
  this.cachedGeometry=createOriginalSceneGeometry({nodes,meshes:this.runtime.data.meshes},{scale:this.runtime.scale,includeModel:()=>true});this.geometryKey=key;return this.cachedGeometry;
 }
 raycast(origin:Vec3,direction:Vec3,maxDistance=300,options:ArenaRaycastOptions={}):ArenaRayHit|null{return this.geometry()?.raycast(origin,direction,maxDistance,options)??null;}
 playerIntersects(feet:Vec3,radius:number,height:number):boolean{
  const geometry=this.geometry();if(!geometry)return false;
  if(geometry.playerIntersects(feet,radius,height))return true;
  // Triangle surfaces alone miss a capsule wholly contained in a closed solid.
  // Its endpoint centers inside a convex hull establish physical intersection.
  for(const body of this.active){body.convex=originalAngularConvex(body.angular!);for(const y of [feet.y+radius,feet.y+height-radius]){
   const point=sub({x:feet.x,y,z:feet.z},body.position);
   if(body.convex.faces!.every((face,i)=>dot(body.convex.faceNormals[i],sub(point,body.convex.vertices[face[0]]))<=0))return true;
  }}
  return false;
 }
 playerSupportHeightAt(x:number,z:number,maxY:number,radius:number,height:number):number|undefined{return this.geometry()?.playerSupportHeightAt(x,z,maxY,radius,height);}
}
