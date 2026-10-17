import * as THREE from 'three';
import type {Vec3} from '../shared/protocol';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import type {ReceiverProjectileResource} from '../shared/originalReceiverProjectileInventory';
import type {ReceiverProjectileWorldBirth,ReceiverProjectileWorldCheckpoint,ReceiverProjectileWorldModel,ReceiverProjectileWorldWeapon} from '../shared/originalReceiverProjectileWorld';
import {originalProjectileModelQuaternion} from '../shared/originalProjectileRay';
import {originalProjectileRotationMatchesDirection} from '../shared/originalProjectileOrientation';
import type {OriginalWeaponCollection} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

const resource=(weapon:ReceiverProjectileWorldWeapon):ReceiverProjectileResource=>weapon==='launcher'?'rg6grenade':'rpgrocket';
const unit=new THREE.Vector3(ORIGINAL_WEAPON_UNIT_SCALE,ORIGINAL_WEAPON_UNIT_SCALE,ORIGINAL_WEAPON_UNIT_SCALE);
function bound(value:number):void {if(!Number.isSafeInteger(value)||value<1||value>65536)throw Error('Invalid projectile binding text bound');}
function matrix(values:readonly number[]):THREE.Matrix4 {
 if(!Array.isArray(values)||values.length!==16)throw Error('Invalid projectile binding matrix count');
 for(let i=0;i<16;i++)if(!Number.isFinite(values[i]))throw Error('Nonfinite projectile binding matrix');
 if(values[3]!==0||values[7]!==0||values[11]!==0||values[15]!==1)throw Error('Nonaffine projectile binding matrix');
 const result=new THREE.Matrix4().fromArray(values),det=result.determinant();
 if(!Number.isFinite(det)||det===0)throw Error('Singular projectile binding matrix');
 if(!result.clone().invert().elements.every(Number.isFinite))throw Error('Projectile binding inverse overflow');
 return result;
}
function generated(value:THREE.Matrix4):readonly number[] {
 const e=value.elements;
 if(!e.every(Number.isFinite)||Math.abs(e[3])>1e-10||Math.abs(e[7])>1e-10||Math.abs(e[11])>1e-10||Math.abs(e[15]-1)>1e-10)throw Error('Projectile binding arithmetic overflow');
 e[3]=e[7]=e[11]=0;e[15]=1;matrix(e);return Object.freeze([...e]);
}
function text(value:unknown):asserts value is string {if(typeof value!=='string'||!value.length||value.trim()!==value)throw Error('Invalid projectile binding text');}
function copyModel(value:ReceiverProjectileWorldModel,maxTextChars:number):ReceiverProjectileWorldModel {
 bound(maxTextChars);
 if(!value||typeof value.inWorld!=='boolean'||!['rg6grenade','rpgrocket'].includes(value.resource)||!Array.isArray(value.groupAncestry)||value.groupAncestry.length>maxTextChars)throw Error('Invalid projectile binding model');
 text(value.handle);text(value.resource);text(value.materialHandle);
 let chars=value.handle.length+value.resource.length+value.materialHandle.length;
 if(chars>maxTextChars)throw Error('Projectile binding text budget exceeded');
 const groups=new Set<string>();
 for(let i=0;i<value.groupAncestry.length;i++){
  const group=value.groupAncestry[i];text(group);const key=group.toLowerCase();
  if(key===value.handle.toLowerCase()||groups.has(key))throw Error('Invalid projectile binding ancestry');
  groups.add(key);chars+=group.length;if(chars>maxTextChars)throw Error('Projectile binding text budget exceeded');
 }
 const worldMatrix=Object.freeze([...matrix(value.worldMatrix).elements]);
 return Object.freeze({handle:value.handle,resource:value.resource,inWorld:value.inWorld,materialHandle:value.materialHandle,groupAncestry:Object.freeze([...value.groupAncestry]),worldMatrix});
}
export interface OriginalSoloProjectileResourceOptions {
 readonly handle:string;readonly resource:ReceiverProjectileResource;readonly inWorld:boolean;
 readonly materialHandle:string;readonly groupAncestry:readonly string[];
 readonly renderToWorld:readonly number[];readonly maxTextChars:number;
}
/** Reads an already-updated resource WORLD matrix. Geometry attestation belongs
 * to the paired resource provider. Membership, shader identity and ancestry
 * must be supplied explicitly; visibility and Three parents are not evidence. */
export function captureOriginalSoloProjectileResource(mesh:THREE.Mesh,options:OriginalSoloProjectileResourceOptions):ReceiverProjectileWorldModel {
 if(!(mesh instanceof THREE.Mesh)||!options)throw Error('Invalid projectile binding borrowed mesh');
 bound(options.maxTextChars);
 // Preflight labels before the matrix allocation, retaining only known fields.
 const declared=copyModel({...options,worldMatrix:new THREE.Matrix4().elements},options.maxTextChars);
 const worldMatrix=generated(matrix(options.renderToWorld).multiply(matrix(mesh.matrixWorld.elements)).scale(unit));
 return copyModel({...declared,worldMatrix},options.maxTextChars);
}
export interface OriginalSoloProjectileSeedOptions {
 readonly prefix:ReceiverScenePrefix;readonly renderToWorld:readonly number[];
 readonly grenadeMaterialHandle:string;readonly grenadeAncestry:readonly string[];readonly maxTextChars:number;
}
/** The grenade template is offworld and belongs to this bank; loaded rocket
 * remains in the local weapon bank. This seeds a fresh life, not a pool reset. */
export function captureOriginalSoloProjectileSeed(collection:OriginalWeaponCollection,options:OriginalSoloProjectileSeedOptions):ReceiverProjectileWorldCheckpoint {
 if(!collection||!(collection.resources instanceof Map)||!options)throw Error('Invalid projectile binding seed');
 validateReceiverScenePrefix(options.prefix);
 const p=options.prefix,prefix:ReceiverScenePrefix=Object.freeze(p.kind==='receipt'?{kind:p.kind,sceneGeneration:p.sceneGeneration,callback:p.callback,tick:p.tick}:{kind:p.kind,sceneGeneration:p.sceneGeneration,callback:p.callback});
 const template=captureOriginalSoloProjectileResource(collection.resources.get('rg6grenade')!,{handle:'grenade',resource:'rg6grenade',inWorld:false,materialHandle:options.grenadeMaterialHandle,groupAncestry:options.grenadeAncestry,renderToWorld:options.renderToWorld,maxTextChars:options.maxTextChars});
 return Object.freeze({prefix,template,catalog:Object.freeze([]),models:Object.freeze([]),actors:Object.freeze([]),fifo:Object.freeze({launcher:Object.freeze([]),rpg:Object.freeze([])})});
}
export interface OriginalSoloProjectilePose {
 readonly launchId:string;readonly weapon:ReceiverProjectileWorldWeapon;
 /** Copy/render-space physical position, not source-unit eye coordinates. */
 readonly position:Readonly<Vec3>;readonly direction:Readonly<Vec3>;
 readonly sourceRotation?:Readonly<Vec3>;readonly orientation?:Readonly<{x:number;y:number;z:number;w:number}>;
 readonly renderToWorld:readonly number[];
 /** Copy source basis + normalized angular premultiplication + uniform raw
  * unit scale reset. Native pointAt/Euler/parallel-up/clone defaults unproved. */
 readonly orientationPolicy:'copy-source-basis-unit-reset';
}
function vector(value:Readonly<Vec3>):Readonly<Vec3> {
 if(!value||![value.x,value.y,value.z].every(Number.isFinite))throw Error('Invalid projectile binding vector');
 return Object.freeze({x:value.x,y:value.y,z:value.z});
}
function copyPose(input:OriginalSoloProjectilePose,maxTextChars:number):OriginalSoloProjectilePose {
 bound(maxTextChars);
 if(!input||!['launcher','rpg'].includes(input.weapon)||input.orientationPolicy!=='copy-source-basis-unit-reset')throw Error('Invalid projectile binding pose policy');
 text(input.launchId);if(input.launchId.length>maxTextChars)throw Error('Projectile binding text budget exceeded');
 const position=vector(input.position),direction=vector(input.direction),length=Math.hypot(direction.x,direction.y,direction.z);
 if(!Number.isFinite(length)||length===0)throw Error('Invalid projectile binding direction');
 const sourceRotation=input.sourceRotation===undefined?undefined:vector(input.sourceRotation);
 if(input.weapon==='rpg'&&!sourceRotation)throw Error('RPG projectile binding requires captured source rotation');
 if(input.weapon==='launcher'&&sourceRotation)throw Error('Launcher projectile binding cannot use RPG source rotation');
 if(sourceRotation&&(sourceRotation.y!==0||!originalProjectileRotationMatchesDirection(sourceRotation,direction)))throw Error('RPG projectile binding rotation does not match direction');
 let orientation:OriginalSoloProjectilePose['orientation'];
 if(input.orientation!==undefined){
  const q=input.orientation;
  if(!q||![q.x,q.y,q.z,q.w].every(Number.isFinite))throw Error('Invalid projectile binding angular orientation');
  const magnitude=Math.hypot(q.x,q.y,q.z,q.w);
  if(!Number.isFinite(magnitude)||magnitude===0)throw Error('Invalid projectile binding angular orientation');
  orientation=Object.freeze({x:q.x/magnitude,y:q.y/magnitude,z:q.z/magnitude,w:q.w/magnitude});
 }
 return Object.freeze({launchId:input.launchId,weapon:input.weapon,position,direction,orientationPolicy:input.orientationPolicy,renderToWorld:Object.freeze([...matrix(input.renderToWorld).elements]),...(sourceRotation?{sourceRotation}:{}),...(orientation?{orientation}:{})});
}
function poseMatrix(pose:OriginalSoloProjectilePose):readonly number[] {
 const axis=(v:Readonly<Vec3>)=>new THREE.Vector3(v.x,v.y,v.z);
 const rotation=originalProjectileModelQuaternion(pose.weapon,pose.direction,pose.sourceRotation,pose.orientation);
 // Normalize only the generated copy quaternion; borrowed matrices stay strict.
 rotation.normalize();
 return generated(matrix(pose.renderToWorld).multiply(new THREE.Matrix4().compose(axis(pose.position),rotation,unit)));
}
/** The caller proves launch-to-model ownership against its actor catalog. No
 * missing actor is inferred retired, and no dummy parked rigidbody pose is used. */
export function captureOriginalSoloProjectilePose(retained:ReceiverProjectileWorldModel,input:OriginalSoloProjectilePose,maxTextChars:number):Readonly<{launchId:string;model:ReceiverProjectileWorldModel}> {
 const pose=copyPose(input,maxTextChars),model=copyModel(retained,maxTextChars);
 if(model.resource!==resource(pose.weapon))throw Error('Projectile binding pose resource mismatch');
 if(model.handle.length+model.resource.length+model.materialHandle.length+model.groupAncestry.reduce((n,g)=>n+g.length,0)+pose.launchId.length>maxTextChars)throw Error('Projectile binding text budget exceeded');
 return Object.freeze({launchId:pose.launchId,model:copyModel({...model,worldMatrix:poseMatrix(pose)},maxTextChars)});
}
export interface OriginalSoloProjectileBirthOptions {
 readonly launchId:string;readonly weapon:ReceiverProjectileWorldWeapon;
 /** Launcher template or the latest explicitly captured local rocket; not a
  * second rocket template. Captured defaults are detached before hooks exist.
  * Its membership and ancestry are explicit clone policy inputs. The copy's
  * new THREE.Mesh is unparented; native clone parenting remains unproved. */
 readonly freshModel:ReceiverProjectileWorldModel;readonly pose:OriginalSoloProjectilePose;
 readonly rocketMaterialHandle:string;readonly maxTextChars:number;
}
export function createOriginalSoloProjectileBirth(options:OriginalSoloProjectileBirthOptions):ReceiverProjectileWorldBirth {
 if(!options)throw Error('Invalid projectile binding birth');
 const maxTextChars=options.maxTextChars,pose=copyPose(options.pose,maxTextChars),fresh=copyModel(options.freshModel,maxTextChars),rocketMaterialHandle=options.rocketMaterialHandle;
 text(options.launchId);text(rocketMaterialHandle);
 if(options.launchId!==pose.launchId||options.weapon!==pose.weapon||fresh.resource!==resource(pose.weapon))throw Error('Projectile binding birth identity mismatch');
 if(options.launchId.length+rocketMaterialHandle.length+fresh.handle.length+fresh.resource.length+fresh.materialHandle.length+fresh.groupAncestry.reduce((n,g)=>n+g.length,0)>maxTextChars)throw Error('Projectile binding text budget exceeded');
 // Compute/validate every constructor operand before creating callable hooks.
 const worldMatrix=poseMatrix(pose),weapon=pose.weapon,launchId=pose.launchId;
 return Object.freeze({launchId,weapon,
  cloneFresh:(allocatedName?:string)=>{
   text(allocatedName);
   return copyModel({...fresh,handle:allocatedName},maxTextChars);
  },
  resetModel:(retained:ReceiverProjectileWorldModel)=>{
   const model=copyModel(retained,maxTextChars);
   if(model.resource!==resource(weapon))throw Error('Projectile binding reset resource mismatch');
   return copyModel({...model,worldMatrix,materialHandle:weapon==='rpg'?rocketMaterialHandle:model.materialHandle},maxTextChars);
  },
 });
}
