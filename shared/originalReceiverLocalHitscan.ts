import type {Vec3,WeaponId} from './protocol';
import type {ReceiverModelEntry,ReceiverModelPose} from './originalReceiverModelWorld';
import type {ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import type {OriginalReceiverSceneRayHit} from './originalReceiverSceneRay';
import {ORIGINAL_RECEIVER_SCENE_LAYERS} from './originalReceiverSceneRay';
import type {OriginalReceiverTransientBirth} from './originalReceiverTransientWorld';
import {originalProjectileDirection} from './originalProjectileOrientation';
import type {OriginalReceiverGeometryQuery} from './originalReceiverGeometryBackend';

export type ReceiverLocalBulletWeapon=Extract<WeaponId,'pistol'|'shotgun'|'rifle'|'sniper'>;
export interface ReceiverLocalHitscanSceneCapture {
 readonly prefix:ReceiverScenePrefix;readonly models:readonly Readonly<ReceiverModelEntry>[];
 readonly actors:ReceiverActorRegistrySnapshot;
}
/** One literal bullettest call. SPAS calls this twice; coords never alter its ray.
 * A trusted action is not readiness, transport admission or a health authority. */
export interface ReceiverLocalHitscanAction {
 readonly prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;
 readonly weapon:ReceiverLocalBulletWeapon;readonly sourceRotation:Readonly<Vec3>;readonly origin:Readonly<Vec3>;
 readonly bspWorld:number;readonly actorNames:Readonly<Record<string,string|0>>;
 readonly effectId:string;readonly muzzleId:string;readonly gunPose:Readonly<ReceiverModelPose>;
}
export interface ReceiverLocalHitscanQuery {
 readonly nearestBullet:(capture:ReceiverLocalHitscanSceneCapture,origin:Readonly<Vec3>,direction:Readonly<Vec3>)=>OriginalReceiverSceneRayHit|null;
}
/** Source directional cosines use the existing Z-up to Y-up rotation adapter;
 * scene intersections retain the explicit mesh sidedness/tie-order adapter. */
export function createReceiverLocalHitscanQuery(query:OriginalReceiverGeometryQuery):ReceiverLocalHitscanQuery {
 if(typeof query!=='function')throw Error('Missing local hitscan geometry query');
 return Object.freeze({nearestBullet:(capture:ReceiverLocalHitscanSceneCapture,origin:Readonly<Vec3>,direction:Readonly<Vec3>)=>query(capture.models,capture.prefix.callback,capture.prefix.sceneGeneration,capture.prefix,capture.actors).nearestDetailed(origin,direction,{bullet:true})});
}
export interface ReceiverLocalHitscanOutcome {
 readonly prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;readonly weapon:ReceiverLocalBulletWeapon;
 readonly hit:OriginalReceiverSceneRayHit|null;readonly positiveShot:0|1;
 /** Source baddy.hurt is presentation; hurts[name] is the separate report. */
 readonly hurt?:Readonly<{actorId:string;name:string;amount:12|18|6|36;sourcePositionWorld:Readonly<Vec3>}>;
}
const damage:Readonly<Record<ReceiverLocalBulletWeapon,12|18|6|36>>={pistol:12,shotgun:18,rifle:6,sniper:36};
const point=(p:Readonly<Vec3>):Readonly<Vec3>=>{if(!p)throw Error('Invalid local hitscan point');const x=p.x,y=p.y,z=p.z;if(![x,y,z].every(Number.isFinite))throw Error('Invalid local hitscan point');return Object.freeze({x,y,z});};
/** Post-commit delivery copy, independently bounded and limited to known fields. */
export function copyReceiverLocalHitscanOutcomes(raw:readonly ReceiverLocalHitscanOutcome[],expected:Extract<ReceiverScenePrefix,{kind:'callback'}>,maxEntries:number,maxTextChars:number):readonly ReceiverLocalHitscanOutcome[] {
 validateReceiverScenePrefix(expected);
 if(!Array.isArray(raw))throw Error('Local hitscan outcome budget exceeded');
 const count=raw.length;
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>256||!Number.isSafeInteger(count)||count<0||count>maxEntries||!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536)throw Error('Local hitscan outcome budget exceeded');
 let text=0;const label=(s:string)=>{if(typeof s!=='string'||!s)throw Error('Invalid local hitscan outcome identity');text+=s.length;return s;};
 const results:ReceiverLocalHitscanOutcome[]=[];
 for(let i=0;i<count;i++){
  const value:ReceiverLocalHitscanOutcome=raw[i];if(!value)throw Error('Missing local hitscan outcome');
  const p=value.prefix,weapon=value.weapon,positiveShot=value.positiveShot,rawHit=value.hit,rawHurt=value.hurt;
  if(!p||p.kind!=='callback')throw Error('Invalid local hitscan outcome prefix');
  const prefix=Object.freeze({kind:'callback' as const,sceneGeneration:p.sceneGeneration,callback:p.callback});validateReceiverScenePrefix(prefix);
  if(!sameReceiverScenePrefix(prefix,expected)||!Object.hasOwn(damage,weapon)||positiveShot!==0&&positiveShot!==1||(rawHit===null)!==(positiveShot===0))throw Error('Foreign or invalid local hitscan outcome');
  let hit:OriginalReceiverSceneRayHit|null=null,hurt:ReceiverLocalHitscanOutcome['hurt'];
  if(rawHit){const handle=label(rawHit.handle),geometryProvenance=label(rawHit.geometryProvenance),layer=rawHit.layer,faceIndex=rawHit.faceIndex,distance=rawHit.distance;
   if(!ORIGINAL_RECEIVER_SCENE_LAYERS.includes(layer)||!Number.isSafeInteger(faceIndex)||faceIndex<0||!Number.isFinite(distance)||distance<0)throw Error('Invalid local hitscan outcome hit');
   hit=Object.freeze({handle,geometryProvenance,layer,faceIndex,distance,point:point(rawHit.point),normal:point(rawHit.normal)});
  }else if(rawHit!==null)throw Error('Invalid local hitscan outcome hit');
  if(rawHurt){const actorId=label(rawHurt.actorId),name=rawHurt.name,amount=rawHurt.amount;if(!hit||typeof name!=='string'||amount!==damage[weapon])throw Error('Invalid local hitscan hurt report');text+=name.length;hurt=Object.freeze({actorId,name,amount,sourcePositionWorld:point(rawHurt.sourcePositionWorld)});}
  if(!Number.isSafeInteger(text)||text>maxTextChars)throw Error('Local hitscan outcome text budget exceeded');
  results.push(Object.freeze({prefix,weapon,positiveShot,hit,...(hurt?{hurt}:{})}));
 }
 return Object.freeze(results);
}
export function copyReceiverLocalHitscanAction(raw:ReceiverLocalHitscanAction,maxModels:number,maxTextChars:number):ReceiverLocalHitscanAction {
 if(!raw||!Number.isSafeInteger(maxModels)||maxModels<1||!Number.isSafeInteger(maxTextChars)||maxTextChars<1)throw Error('Invalid local hitscan boundary');
 const p=raw.prefix,weapon=raw.weapon,bspWorld=raw.bspWorld,names=raw.actorNames,effectId=raw.effectId,muzzleId=raw.muzzleId,pose=raw.gunPose;
 if(!p||p.kind!=='callback')throw Error('Local hitscan requires callback');
 const prefix=Object.freeze({kind:'callback' as const,sceneGeneration:p.sceneGeneration,callback:p.callback});validateReceiverScenePrefix(prefix);
 if(!Object.hasOwn(damage,weapon)||!Number.isFinite(bspWorld)||bspWorld<=0||!names||typeof names!=='object'||Array.isArray(names))throw Error('Invalid local hitscan action');
 const keys=Object.keys(names);if(keys.length>maxModels)throw Error('Local hitscan name budget exceeded');
 let text=0;const label=(s:string)=>{if(typeof s!=='string'||!s)throw Error('Invalid local hitscan identity');text+=s.length;return s;};
 const actorNames=Object.create(null) as Record<string,string|0>;
 for(const key of keys){label(key);const value=names[key];if(value!==0&&typeof value!=='string')throw Error('Invalid local hitscan actor name');if(typeof value==='string')text+=value.length;actorNames[key]=value;}
 label(effectId);label(muzzleId);if(effectId===muzzleId||text>maxTextChars)throw Error('Local hitscan identity budget exceeded');
 const sourceRotation=point(raw.sourceRotation);originalProjectileDirection(sourceRotation);
 const origin=point(raw.origin),q=pose?.rotation;
 if(!pose||![pose.yaw,pose.phase,pose.scale].every(Number.isFinite)||pose.phase<0||pose.scale<=0||!q||![q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>1e-6)throw Error('Invalid local hitscan muzzle pose');
 const gunPose=Object.freeze({position:point(pose.position),yaw:pose.yaw,phase:pose.phase,scale:pose.scale,rotation:Object.freeze({x:q.x,y:q.y,z:q.z,w:q.w})});
 return Object.freeze({prefix,weapon,sourceRotation,origin,bspWorld,actorNames:Object.freeze(actorNames),effectId,muzzleId,gunPose});
}
export function stageReceiverLocalHitscan(action:ReceiverLocalHitscanAction,capture:ReceiverLocalHitscanSceneCapture,query:ReceiverLocalHitscanQuery,sourceScale:number,emitBirth:(event:OriginalReceiverTransientBirth)=>void):ReceiverLocalHitscanOutcome {
 if(!sameReceiverScenePrefix(action.prefix,capture.prefix)||!capture.actors.prefix||!sameReceiverScenePrefix(action.prefix,capture.actors.prefix)||!Number.isFinite(sourceScale)||sourceScale<=0)throw Error('Local hitscan scene prefix mismatch');
 const bindings=capture.actors.actors,keys=Object.keys(action.actorNames);
 if(keys.length!==bindings.length||bindings.some(binding=>!Object.hasOwn(action.actorNames,binding.actorId)))throw Error('Local hitscan actor name inventory mismatch');
 const direction=originalProjectileDirection(action.sourceRotation),raw=query.nearestBullet(capture,action.origin,direction);
 if(raw!==null&&!raw)throw Error('Invalid local hitscan query result');
 let hit:OriginalReceiverSceneRayHit|null=null,hurt:ReceiverLocalHitscanOutcome['hurt'];
 if(raw){
  if(!capture.models.some(model=>model.handle===raw.handle&&model.inWorld&&model.geometryProvenance===raw.geometryProvenance)||!Number.isSafeInteger(raw.faceIndex)||raw.faceIndex<0||!Number.isFinite(raw.distance)||raw.distance<0)throw Error('Invalid local hitscan query result');
  hit=Object.freeze({handle:raw.handle,layer:raw.layer,geometryProvenance:raw.geometryProvenance,faceIndex:raw.faceIndex,distance:raw.distance,point:point(raw.point),normal:point(raw.normal)});
  const actor=bindings.find(binding=>binding.gi===hit!.handle),name=actor?action.actorNames[actor.actorId]:0;
  if(actor&&typeof name==='string'){
   hurt=Object.freeze({actorId:actor.actorId,name,amount:damage[action.weapon],sourcePositionWorld:point(actor.sourcePositionWorld)});
   const halfBsp=action.bspWorld/2;
   emitBirth(Object.freeze({kind:'blood',id:action.effectId,position:point({x:hit.point.x-direction.x*halfBsp,y:hit.point.y-direction.y*halfBsp,z:hit.point.z-direction.z*halfBsp})}));
  }else emitBirth(Object.freeze({kind:'miss',id:action.effectId,position:hit.point,normal:point({x:hit.normal.x*sourceScale,y:hit.normal.y*sourceScale,z:hit.normal.z*sourceScale})}));
 }
 emitBirth(Object.freeze({kind:'muzzle',id:action.muzzleId,weapon:action.weapon,gunPose:action.gunPose}));
 return Object.freeze({prefix:action.prefix,weapon:action.weapon,hit,positiveShot:hit?1:0,...(hurt?{hurt}:{})});
}
