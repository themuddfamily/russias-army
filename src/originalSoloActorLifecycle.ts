import type {WeaponId} from '../shared/protocol';
import type {OriginalReceiverActorResources} from '../shared/originalReceiverActorResources';
import type {ReceiverModelBackend,ReceiverModelPose,ReceiverModelEntry,ReceiverDropYawRequest} from '../shared/originalReceiverModelWorld';

const weapons=['pistol','shotgun','rifle','launcher','rpg','sniper'] as const;
/** Recovered GI resource radius. This declared resource bound is not a native
 * runtime sphere measurement or an animated geometry fit. */
export const ORIGINAL_SOLO_GI_DECLARED_RADIUS=1726.8026123046875;
export interface OriginalSoloActorCloneSeed {readonly pose:Readonly<ReceiverModelPose>;readonly geometryProvenance:string}
export interface OriginalSoloActorDropYawCapture {readonly actorId:string;readonly callback:number;readonly random36:number}
export interface OriginalSoloActorDropYawPlan {
 readonly entries:readonly Readonly<OriginalSoloActorDropYawCapture>[];
 readonly callback:number;
}
const issuedPlans=new WeakSet<object>();
function bound(n:number,max:number):void {if(!Number.isSafeInteger(n)||n<1||n>max)throw Error('Invalid actor lifecycle bound');}
function label(v:unknown):asserts v is string {if(typeof v!=='string'||!v||v.trim()!==v)throw Error('Invalid actor lifecycle label');}
function copyPose(p:Readonly<ReceiverModelPose>):ReceiverModelPose {
 if(!p||!p.position||![p.position.x,p.position.y,p.position.z,p.yaw,p.phase,p.scale].every(Number.isFinite)||p.phase<0||p.scale<=0)throw Error('Invalid actor lifecycle pose');
 const q=p.rotation;
 if(q!==undefined&&(!q||![q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>1e-6))throw Error('Invalid actor lifecycle quaternion');
 return Object.freeze({position:Object.freeze({x:p.position.x,y:p.position.y,z:p.position.z}),yaw:p.yaw,phase:p.phase,scale:p.scale,...(q?{rotation:Object.freeze({x:q.x,y:q.y,z:q.z,w:q.w})}:{})});
}
/** Capture already sampled source random(36) operands outside rollbackable
 * scene work. No RNG, mutable registry or receipt history is retained. */
export function captureOriginalSoloActorDropYawPlan(callback:number,samples:readonly Readonly<{actorId:string;random36:number}>[],options:Readonly<{maxEntries:number;maxTextChars:number}>):OriginalSoloActorDropYawPlan {
 bound(options.maxEntries,256);bound(options.maxTextChars,65536);
 if(!Number.isSafeInteger(callback)||callback<0||!Array.isArray(samples)||samples.length>options.maxEntries)throw Error('Invalid actor lifecycle drop plan');
 const entries=samples.map(e=>({actorId:e.actorId,random36:e.random36,callback}));
 let text=0;const keys=new Map<number,Set<string>>();
 for(const e of entries){
  if(!e)throw Error('Invalid actor lifecycle drop entry');label(e.actorId);
  text+=e.actorId.length;
  if(text>options.maxTextChars||!Number.isSafeInteger(e.callback)||e.callback<0||!Number.isSafeInteger(e.random36)||e.random36<1||e.random36>36)throw Error('Invalid actor lifecycle drop entry');
  let ids=keys.get(e.callback);if(!ids){ids=new Set();keys.set(e.callback,ids);}if(ids.has(e.actorId))throw Error('Duplicate actor lifecycle drop entry');ids.add(e.actorId);
 }
 const plan=Object.freeze({callback,entries:Object.freeze(entries.map(e=>Object.freeze({actorId:e.actorId,callback:e.callback,random36:e.random36})))});
 issuedPlans.add(plan);return plan;
}
export type OriginalSoloActorLifecycle=Pick<ReceiverModelBackend,'cloneGI'|'cloneGun'|'sphere'|'heldGunPose'|'reparentGunMembership'|'dropYaw'>;
export interface OriginalSoloActorLifecycleOptions {
 readonly actorResources:Pick<OriginalReceiverActorResources,'heldGunPose'>&Partial<Pick<OriginalReceiverActorResources,'readResourceDescriptor'>>;
 readonly sourceScale:number;readonly gi:OriginalSoloActorCloneSeed;
 readonly guns:Readonly<Record<WeaponId,OriginalSoloActorCloneSeed>>;
 readonly parentRestoresMembership:boolean;
 readonly readDropYawPlan:(actorId:string,callback:number,request?:ReceiverDropYawRequest)=>OriginalSoloActorDropYawPlan;readonly maxTextChars:number;
}
/** Source lifecycle operations over detached seeds and the actual decoded
 * resource provider. Parent membership and positive source-Z to copy-Y yaw
 * are declared copy policies. The caller supplies an issued plan or a live
 * detach admission capture that retains sampled operands through rollback/retry.
 * This adapter owns no plan installation, history, RNG or renderer state. */
export function createOriginalSoloActorLifecycle(options:OriginalSoloActorLifecycleOptions):Readonly<OriginalSoloActorLifecycle> {
 bound(options.maxTextChars,65536);
 if(!Number.isFinite(options.sourceScale)||options.sourceScale<=0||typeof options.parentRestoresMembership!=='boolean'||!options.actorResources||typeof options.actorResources.heldGunPose!=='function'||typeof options.readDropYawPlan!=='function')throw Error('Invalid actor lifecycle options');
 const descriptor=options.actorResources.readResourceDescriptor?.();
 if(descriptor&&descriptor.sourceScale!==options.sourceScale)throw Error('Actor lifecycle resource source scale mismatch');
 let text=0;
 const seed=(s:OriginalSoloActorCloneSeed):OriginalSoloActorCloneSeed=>{
  if(!s)throw Error('Missing actor lifecycle clone seed');label(s.geometryProvenance);text+=s.geometryProvenance.length;
  if(text>options.maxTextChars)throw Error('Actor lifecycle text budget exceeded');
  return Object.freeze({pose:copyPose(s.pose),geometryProvenance:s.geometryProvenance});
 };
 const gi=seed(options.gi),guns=new Map<WeaponId,OriginalSoloActorCloneSeed>();
 for(const weapon of weapons)guns.set(weapon,seed(options.guns?.[weapon]));
 const sourceScale=options.sourceScale,parentRestoresMembership=options.parentRestoresMembership,resources=options.actorResources,readPlan=options.readDropYawPlan,maxTextChars=options.maxTextChars;
 const clone=(s:OriginalSoloActorCloneSeed,name:string)=>{label(name);if(name.length>maxTextChars)throw Error('Actor lifecycle clone name budget exceeded');return Object.freeze({pose:copyPose(s.pose),geometryProvenance:s.geometryProvenance});};
 return Object.freeze({
  cloneGI:(name:string)=>clone(gi,name),
  cloneGun:(name:string,weapon:WeaponId)=>{const s=guns.get(weapon);if(!s)throw Error('Unknown actor lifecycle gun');return clone(s,name);},
  sphere:(model:Readonly<ReceiverModelEntry>)=>{
   if(!model||model.kind!=='gi'||model.resource!=='GI')throw Error('Actor lifecycle sphere requires GI');
   if(model.worldMatrix!==undefined)throw Error('Actor lifecycle declared sphere does not support explicit GI matrix');
   const p=copyPose(model.pose),bspWorld=ORIGINAL_SOLO_GI_DECLARED_RADIUS*p.scale*sourceScale*.75;
   if(!Number.isFinite(bspWorld)||bspWorld<=0)throw Error('Actor lifecycle sphere overflow');
   return Object.freeze({bspWorld,provenance:'declared-resource' as const});
  },
  heldGunPose:(model:Readonly<ReceiverModelEntry>,weapon:WeaponId)=>{
   if(!model||model.kind!=='gi'||model.resource!=='GI'||model.group!=='soldiers'||typeof model.inWorld!=='boolean'||!guns.has(weapon))throw Error('Actor lifecycle held gun requires GI and known weapon');
   label(model.handle);label(model.name);label(model.geometryProvenance);
   if(model.handle.length+model.name.length+model.geometryProvenance.length>maxTextChars)throw Error('Actor lifecycle model text budget exceeded');
   const worldMatrix=model.worldMatrix;
   if(worldMatrix!==undefined&&(!Array.isArray(worldMatrix)||worldMatrix.length!==16||Array.from({length:16},(_,i)=>worldMatrix[i]).some(n=>!Number.isFinite(n))||worldMatrix[3]!==0||worldMatrix[7]!==0||worldMatrix[11]!==0||worldMatrix[15]!==1))throw Error('Invalid actor lifecycle GI matrix');
   const detached=Object.freeze({handle:model.handle,name:model.name,resource:model.resource,kind:model.kind,group:model.group,inWorld:model.inWorld,geometryProvenance:model.geometryProvenance,pose:copyPose(model.pose),...(worldMatrix?{worldMatrix:Object.freeze([...worldMatrix])}:{})});
   return copyPose(resources.heldGunPose(detached,weapon));
  },
  reparentGunMembership:(inWorld:boolean)=>{if(typeof inWorld!=='boolean')throw Error('Invalid actor lifecycle membership');return parentRestoresMembership;},
  dropYaw:(actorId:string,callback:number,request?:ReceiverDropYawRequest)=>{
   label(actorId);if(actorId.length>maxTextChars||!Number.isSafeInteger(callback)||callback<0)throw Error('Invalid actor lifecycle drop key');
   const plan=readPlan(actorId,callback,request);if(!plan||!issuedPlans.has(plan)||!Object.isFrozen(plan)||!Object.isFrozen(plan.entries)||plan.callback!==callback)throw Error('Invalid captured actor lifecycle drop plan');
   const entry=plan.entries.find(e=>e.actorId===actorId&&e.callback===callback);
   if(!entry)throw Error('Missing captured actor lifecycle drop yaw');
   return entry.random36*10*Math.PI/180;
  },
 });
}
