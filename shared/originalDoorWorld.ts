import type {Vec3} from './protocol';
import type {ArenaRayHit,ArenaRaycastOptions} from './arenaCollision';
import {createOriginalSceneGeometry,isOriginalFixedModel,sourcePointToWorld,type OriginalSceneData,type OriginalSceneGeometry,type OriginalPlayerMoveResult,type OriginalFixedTrianglePage} from './originalSceneGeometry';

export const ORIGINAL_DOOR_TRIGGER_SOURCE_DISTANCE=100;
export const ORIGINAL_DOOR_FREEZE_SECONDS=1.6;
export interface OriginalDoorKey {time:number;position:readonly [number,number,number];quaternion_xyzw:readonly [number,number,number,number];scale:readonly [number,number,number]}
export interface OriginalDoorTrack {name:string;motionName:string;baseMatrix:readonly number[];keys:readonly OriginalDoorKey[]}
export interface OriginalDoorTracks {version:1;doors:readonly OriginalDoorTrack[]}
export interface OriginalWorldDoorState {name:string;openedAt:number|null;phase:'closed'|'opening'|'open';elapsedSeconds:number}
export type OriginalSceneCollisionGeometry=Pick<OriginalSceneGeometry,'bounds'|'groundBounds'|'triangleCount'|'cellSize'|'supportHeightAt'|'playerSupportHeightAt'|'playerIntersects'|'resolvePlayerOverlap'|'movePlayer'|'sweepSphere'|'sweepConvex'|'contactsSphere'|'contactsConvex'|'raycast'|'fixedTrianglePage'> & {readonly movementSnapshotIdentity?:object};
const movementSnapshotIdentities=new WeakMap<OriginalSceneGeometry,object>();
function multiply(a:readonly number[],b:readonly number[]):number[]{
 const out=new Array<number>(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;
}
function normalized(q:readonly number[]):number[]{const n=Math.hypot(...q);return q.map(x=>x/n);}
function slerp(a:readonly number[],b:readonly number[],t:number):number[]{
 const qa=normalized(a);let qb=normalized(b),dot=qa.reduce((sum,v,i)=>sum+v*qb[i],0);
 if(dot<0){qb=qb.map(x=>-x);dot=-dot;}
 if(dot>.9995)return normalized(qa.map((x,i)=>x+(qb[i]-x)*t));
 const theta=Math.acos(Math.min(1,dot)),sin=Math.sin(theta);return normalized(qa.map((x,i)=>(x*Math.sin((1-t)*theta)+qb[i]*Math.sin(t*theta))/sin));
}
/** Pure source Z-up math. Preserve the authored matrix (including nonuniform
 * scale), then apply each exact keyframe delta locally on its right.
 */
export function sampleOriginalDoorSourceMatrix(track:OriginalDoorTrack,timeSeconds:number):number[]{
 if(!Number.isFinite(timeSeconds))throw new Error('Invalid original door sample time');
 const keys=track.keys;let a=keys[0],b=a,t=0;
 if(timeSeconds>=keys[keys.length-1].time)a=b=keys[keys.length-1];
 else if(timeSeconds>a.time){let i=0;while(i<keys.length-2&&keys[i+1].time<timeSeconds)i++;a=keys[i];b=keys[i+1];t=b.time>a.time?(timeSeconds-a.time)/(b.time-a.time):0;}
 const p=a.position.map((x,i)=>x+(b.position[i]-x)*t),s=a.scale.map((x,i)=>x+(b.scale[i]-x)*t),[x,y,z,w]=slerp(a.quaternion_xyzw,b.quaternion_xyzw,t);
 const m=[(1-2*(y*y+z*z))*s[0],2*(x*y+z*w)*s[0],2*(x*z-y*w)*s[0],0,2*(x*y-z*w)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+x*w)*s[1],0,2*(x*z+y*w)*s[2],2*(y*z-x*w)*s[2],(1-2*(x*x+y*y))*s[2],0,p[0],p[1],p[2],1];
 return multiply(track.baseMatrix,m);
}
export function validateOriginalDoorTracks(tracks:OriginalDoorTracks):void {
 if(tracks.version!==1||!Array.isArray(tracks.doors))throw new Error('Invalid original door tracks');const names=new Set<string>();
 for(const d of tracks.doors){
  if(!d.name||names.has(d.name)||!d.motionName||d.baseMatrix.length!==16||!d.baseMatrix.every(Number.isFinite)||!d.keys.length)throw new Error(`Invalid original door track: ${d.name}`);names.add(d.name);let last=-Infinity;
  for(const k of d.keys){if(!Number.isFinite(k.time)||k.time<0||k.time<last||k.position.length!==3||k.scale.length!==3||k.quaternion_xyzw.length!==4||![...k.position,...k.scale,...k.quaternion_xyzw].every(Number.isFinite)||Math.hypot(...k.quaternion_xyzw)<1e-9)throw new Error(`Invalid original door key: ${d.name}`);last=k.time;}
 }
}

/** Per arena/room door state. Geometry snapshots are immutable and shared by
 * forks until changed. Movement uses exact fixed+closed triangles; combat rays
 * also intersect source doors while their visible panels swing out of the way.
 */
export class OriginalDoorWorld implements OriginalSceneCollisionGeometry {
 readonly geometry:OriginalSceneCollisionGeometry=this;
 readonly fixedGeometry:OriginalSceneGeometry;
 private movement:OriginalSceneGeometry;
 private visibleDoors:OriginalSceneGeometry|null;
 private opened=new Map<string,number|null>();
 private readonly adoptionIdentity=Object.freeze({});
 private adoptionRevision:object=Object.freeze({});
 private forkParentIdentity?:object;
 private forkParentRevision?:object;
 private adoptionPrepared=false;
 private readonly trackByName:ReadonlyMap<string,OriginalDoorTrack>;
 private time=0;
 private readonly initialMovement:OriginalSceneGeometry;
 private readonly initialVisible:OriginalSceneGeometry|null;
 constructor(private readonly data:OriginalSceneData,readonly scale:number,private readonly tracks:OriginalDoorTracks,seed?:OriginalDoorWorld){
  if(seed){if(data!==seed.data||scale!==seed.scale||tracks!==seed.tracks)throw Error('Original door fork template mismatch');this.fixedGeometry=seed.fixedGeometry;this.movement=seed.movement;this.visibleDoors=seed.visibleDoors;this.trackByName=seed.trackByName;this.initialMovement=seed.initialMovement;this.initialVisible=seed.initialVisible;this.time=seed.time;for(const [n,t]of seed.opened)this.opened.set(n,t);return;}
  validateOriginalDoorTracks(tracks);if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid original door world scale');
  this.trackByName=new Map(tracks.doors.map(t=>[t.name,t]));const nodes=new Set(data.nodes.map(n=>n.name));
  for(const t of tracks.doors){if(!nodes.has(t.name))throw new Error(`Missing original door model: ${t.name}`);this.opened.set(t.name,null);}
  for(const n of data.nodes)if(n.name.toLowerCase().startsWith('door ')&&!this.trackByName.has(n.name))throw new Error(`Missing original door track: ${n.name}`);
  this.fixedGeometry=createOriginalSceneGeometry(data,{scale});
  this.movement=tracks.doors.length?this.buildMovement():this.fixedGeometry;
  this.visibleDoors=tracks.doors.length?this.buildVisible():null;this.initialMovement=this.movement;this.initialVisible=this.visibleDoors;
 }
 /** Visible facade epoch, used by authority adapters to merge callback and receipt clocks. */
 get updatedAtSeconds():number{return this.time;}
 get bounds(){return this.movement.bounds;}
 get groundBounds(){return this.fixedGeometry.groundBounds;}
 get triangleCount(){return this.movement.triangleCount;}
 get cellSize(){return this.movement.cellSize;}
 /** Current immutable movement population, including closed door bodies.
  * Page revisions and movementSnapshotIdentity are separate stable tokens
  * for the same collision snapshot; visible animation does not change either. */
 fixedTrianglePage(offset:number,limit=32):OriginalFixedTrianglePage {return this.movement.fixedTrianglePage(offset,limit);}
 /** Opaque identity of immutable movement triangles, shared across forks.
  * Visible door animation alone does not replace movement collision. */
 get movementSnapshotIdentity():object {
  let token=movementSnapshotIdentities.get(this.movement);
  if(!token){token=Object.freeze({});movementSnapshotIdentities.set(this.movement,token);}
  return token;
 }
 /** Cheap transactional fork; no source data or existing geometry is mutated. */
 fork():OriginalDoorWorld {const candidate=new OriginalDoorWorld(this.data,this.scale,this.tracks,this);candidate.forkParentIdentity=this.adoptionIdentity;candidate.forkParentRevision=this.adoptionRevision;return candidate;}
 private assertMutable():void {if(this.adoptionPrepared)throw Error('Original door adoption active');}
 private changed():void {this.adoptionRevision=Object.freeze({});}
 /** Publish a direct fork without rebuilding collision or replacing this facade.
  * Opaque tokens establish ancestry without retaining the parent world. All
  * candidate state is captured now; later candidate mutations are independent. */
 prepareAdopt(candidate:OriginalDoorWorld):{commit():void;rollback():void} {
  this.assertMutable();
  if(!(candidate instanceof OriginalDoorWorld)||candidate.forkParentIdentity!==this.adoptionIdentity||candidate.forkParentRevision!==this.adoptionRevision)throw Error('Invalid or stale original door adoption');
  const opened=new Map(candidate.opened),movement=candidate.movement,visible=candidate.visibleDoors,time=candidate.time,revision=Object.freeze({});
  this.adoptionPrepared=true;let pending=true;
  return {commit:()=>{if(!pending)return;pending=false;this.opened=opened;this.movement=movement;this.visibleDoors=visible;this.time=time;this.adoptionRevision=revision;this.adoptionPrepared=false;},rollback:()=>{if(!pending)return;pending=false;this.adoptionPrepared=false;}};
 }

 /** Shift the facade clock and every open epoch together. Solo suspension
  * rebases wall time without consuming animation or replacing collision data.
  * Online receipt epochs continue to use their existing authority path.
  */
 shiftClock(seconds:number):void {
  this.assertMutable();
  const nextTime=this.time+seconds;
  if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(nextTime))throw Error('Invalid original door clock shift');
  const shifted=[...this.opened].map(([name,at])=>[name,at===null?null:at+seconds] as const);
  if(shifted.some(([,at])=>at!==null&&!Number.isFinite(at)))throw Error('Invalid original door clock shift');
  this.time=nextTime;for(const [name,at] of shifted)this.opened.set(name,at);if(seconds!==0)this.changed();
 }

 /** Explicit match/reconnect reset; the facade reference remains unchanged. */
 reset(atSeconds=0):void {
  this.assertMutable();
  if(!Number.isFinite(atSeconds)||atSeconds<0)throw new Error('Invalid original door reset time');
  for(const name of this.opened.keys())this.opened.set(name,null);
  this.time=atSeconds;this.movement=this.initialMovement;this.visibleDoors=this.initialVisible;this.changed();
 }
 /** Atomic authoritative replacement; unchanged states keep their geometry snapshots. */
 reconcile(states:readonly {name:string;openedAt:number|null}[],atSeconds:number):void {
  this.assertMutable();
  if(!Number.isFinite(atSeconds)||atSeconds<0)throw new Error('Invalid original door reconcile time');
  const incoming=new Map<string,number|null>();
  for(const s of states){if(!this.opened.has(s.name)||incoming.has(s.name)||s.openedAt!==null&&(!Number.isFinite(s.openedAt)||s.openedAt<0))throw new Error(`Invalid authoritative original door: ${s.name}`);incoming.set(s.name,s.openedAt);}
  const changed=[...this.opened].some(([name,t])=>t!==(incoming.get(name)??null));
  if(!changed&&atSeconds>=this.time){this.update(atSeconds);return;}
  this.time=atSeconds;for(const name of this.opened.keys())this.opened.set(name,incoming.get(name)??null);
  this.movement=this.buildMovement();this.visibleDoors=this.tracks.doors.length?this.buildVisible():null;this.changed();
 }
 getDoors():OriginalWorldDoorState[]{return this.getStates();}
 getStates():OriginalWorldDoorState[]{return [...this.opened].map(([name,openedAt])=>{const elapsedSeconds=openedAt===null?0:Math.min(ORIGINAL_DOOR_FREEZE_SECONDS,Math.max(0,this.time-openedAt));return {name,openedAt,phase:openedAt===null?'closed':this.time-openedAt>ORIGINAL_DOOR_FREEZE_SECONDS?'open':'opening',elapsedSeconds};});}
 getModelMatrix(name:string):readonly number[]|undefined {
  const track=this.trackByName.get(name);if(!track)return undefined;const at=this.opened.get(name);
  return at===null?[...track.baseMatrix]:sampleOriginalDoorSourceMatrix(track,Math.min(ORIGINAL_DOOR_FREEZE_SECONDS,Math.max(0,this.time-at!)));
 }
 private buildMovement():OriginalSceneGeometry {
  if([...this.opened.values()].every(t=>t!==null))return this.fixedGeometry;
  return createOriginalSceneGeometry(this.data,{scale:this.scale,includeModel:name=>isOriginalFixedModel(name)||this.opened.get(name)===null});
 }
 private buildVisible():OriginalSceneGeometry {
  const data={meshes:this.data.meshes,nodes:this.data.nodes.map(n=>this.trackByName.has(n.name)?{...n,matrix:this.getModelMatrix(n.name)!}:n)};
  return createOriginalSceneGeometry(data,{scale:this.scale,includeModel:name=>this.trackByName.has(name)});
 }
 /** Correct predicted timing without rebuilding an already removed body. */
 setOpenedAt(name:string,atSeconds:number):boolean {
  this.assertMutable();
  if(!Number.isFinite(atSeconds)||atSeconds<0)throw new Error('Invalid original door open time');
  if(!this.opened.has(name))return false;
  const old=this.opened.get(name);if(old===atSeconds)return false;
  this.opened.set(name,atSeconds);if(old===null)this.movement=this.buildMovement();
  this.visibleDoors=this.buildVisible();this.changed();return true;
 }
 open(name:string,atSeconds:number):boolean {
  this.assertMutable();
  if(!Number.isFinite(atSeconds)||atSeconds<0)throw new Error('Invalid original door open time');
  if(!this.opened.has(name)||this.opened.get(name)!==null)return false;
  if(atSeconds>this.time)this.update(atSeconds);this.opened.set(name,atSeconds);this.movement=this.buildMovement();this.visibleDoors=this.buildVisible();this.changed();return true;
 }
 update(atSeconds:number):void {
  this.assertMutable();
  if(!Number.isFinite(atSeconds)||atSeconds<0||atSeconds<this.time)throw new Error('Original door world time must be monotonic');
  const changes=[...this.opened.values()].some(t=>t!==null&&Math.min(ORIGINAL_DOOR_FREEZE_SECONDS,Math.max(0,this.time-t))!==Math.min(ORIGINAL_DOOR_FREEZE_SECONDS,Math.max(0,atSeconds-t)));
  const changedTime=atSeconds!==this.time;this.time=atSeconds;if(changes)this.visibleDoors=this.buildVisible();if(changedTime||changes)this.changed();
 }
 /** Strict source proximity compares player eye to closed source model origin. */
 triggerNearby(eye:Vec3,atSeconds:number):string[]{
  this.assertMutable();
  if(![eye.x,eye.y,eye.z].every(Number.isFinite))throw new Error('Invalid original door proximity position');this.update(atSeconds);const names:string[]=[];
  for(const [name,t]of this.opened){if(t!==null)continue;const origin=sourcePointToWorld(this.trackByName.get(name)!.baseMatrix.slice(12,15),this.scale);
   if(Math.hypot(eye.x-origin.x,eye.y-origin.y,eye.z-origin.z)<ORIGINAL_DOOR_TRIGGER_SOURCE_DISTANCE*this.scale&&this.open(name,atSeconds))names.push(name);
  }return names;
 }
 supportHeightAt(x:number,z:number,maxY=Infinity,groundOnly=false):number|undefined{return this.movement.supportHeightAt(x,z,maxY,groundOnly);}
 playerSupportHeightAt(x:number,z:number,maxY:number,radius:number,height:number,groundOnly=false):number|undefined{return this.movement.playerSupportHeightAt(x,z,maxY,radius,height,groundOnly);}
 playerIntersects(feet:Vec3,radius:number,height:number):boolean{return this.movement.playerIntersects(feet,radius,height);}
 resolvePlayerOverlap(feet:Vec3,radius:number,height:number):Vec3{return this.movement.resolvePlayerOverlap(feet,radius,height);}
 movePlayer(from:Vec3,to:Vec3,radius:number,height:number):OriginalPlayerMoveResult{return this.movement.movePlayer(from,to,radius,height);}
 /** Physics touching contacts use exactly the fixed+closed body union.
  * Opening deletes the source door rigid body immediately; transformed visible
  * opening/open panels remain combat-ray surfaces, not physics constraints. */
 contactsSphere(position:Vec3,radius:number,contactDistance=0){return this.movement.contactsSphere(position,radius,contactDistance);}
 contactsConvex(position:Vec3,shape:Parameters<OriginalSceneGeometry['contactsConvex']>[1],contactDistance=0){return this.movement.contactsConvex(position,shape,contactDistance);}
 sweepSphere(from:Vec3,to:Vec3,radius:number,contactDistance=0){return this.movement.sweepSphere(from,to,radius,contactDistance);}
 sweepConvex(from:Vec3,to:Vec3,shape:Parameters<OriginalSceneGeometry['sweepConvex']>[2],contactDistance=0,surfaceVelocity?:Parameters<OriginalSceneGeometry['sweepConvex']>[4]){return this.movement.sweepConvex(from,to,shape,contactDistance,surfaceVelocity);}
 raycast(origin:Vec3,direction:Vec3,maxDistance=300,options:ArenaRaycastOptions={}):ArenaRayHit|null {
  const fixed=this.fixedGeometry.raycast(origin,direction,maxDistance,options),door=this.visibleDoors?.raycast(origin,direction,maxDistance,options)??null;
  return door&&(!fixed||door.distance<fixed.distance)?door:fixed;
 }
}
export function createOriginalDoorWorld(data:OriginalSceneData,scale:number,tracks:OriginalDoorTracks):OriginalDoorWorld{return new OriginalDoorWorld(data,scale,tracks);}
