import * as THREE from 'three';
import type {WeaponId} from '../shared/protocol';
import type {ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {ORIGINAL_WEAPON_RESOURCES} from './originalWeapons';

/** Decode the explicitly selected RAW local model's position/orientation at a
 * gun intent. No camera refresh, model mutation, motion finish or unit guess.
 * Uniform positive scale is required; shear/reflection is not silently repaired.
 * The returned scale reconstructs RAW WORLD using the provider sourceScale.
 * Source muzzle birth copies only position/rotation and retains its clone scale. */
export function captureOriginalSoloLocalGunPose(state:ReceiverLocalWeaponWorldCheckpoint,weapon:WeaponId,
 options:Readonly<{sourceScale:number;phase:number;maxTextChars:number}>,
):Readonly<ReceiverModelPose> {
 if(!state||!options||state.selectedWeapon!==weapon||!Object.hasOwn(ORIGINAL_WEAPON_RESOURCES,weapon)||!Array.isArray(state.models)||state.models.length!==7
  ||!Number.isFinite(options.sourceScale)||options.sourceScale<=0||!Number.isFinite(options.phase)||options.phase<0
  ||!Number.isSafeInteger(options.maxTextChars)||options.maxTextChars<1||options.maxTextChars>65536)throw Error('Invalid local gun pose capture');
 const matches=state.models.filter(model=>model?.resource===ORIGINAL_WEAPON_RESOURCES[weapon]);
 if(matches.length!==1)throw Error('Missing or duplicate selected local gun');
 const model=matches[0],e=model.worldMatrix;
 if(typeof model.handle!=='string'||model.handle!==model.resource||typeof model.resource!=='string'||model.handle.length+model.resource.length>options.maxTextChars
  ||typeof model.inWorld!=='boolean'||!Array.isArray(e)||e.length!==16||Array.from({length:16},(_,i)=>e[i]).some(v=>!Number.isFinite(v))||e[3]!==0||e[7]!==0||e[11]!==0||e[15]!==1)throw Error('Invalid local gun RAW matrix');
 const determinant=new THREE.Matrix4().fromArray(e).determinant();
 if(!Number.isFinite(determinant)||determinant===0)throw Error('Invalid local gun invertible matrix');
 const axes=[new THREE.Vector3(e[0],e[1],e[2]),new THREE.Vector3(e[4],e[5],e[6]),new THREE.Vector3(e[8],e[9],e[10])],lengths=axes.map(a=>Math.hypot(a.x,a.y,a.z));
 if(lengths.some(n=>!Number.isFinite(n)||n<=0)||Math.abs(lengths[1]/lengths[0]-1)>1e-8||Math.abs(lengths[2]/lengths[0]-1)>1e-8)throw Error('Local gun pose requires uniform scale');
 axes.forEach((a,i)=>a.set(a.x/lengths[i],a.y/lengths[i],a.z/lengths[i]));
 if(Math.abs(axes[0].dot(axes[1]))>1e-8||Math.abs(axes[0].dot(axes[2]))>1e-8||Math.abs(axes[1].dot(axes[2]))>1e-8||axes[0].clone().cross(axes[1]).dot(axes[2])<=0)throw Error('Local gun pose rejects shear/reflection');
 const scale=lengths[0]/options.sourceScale;
 if(!Number.isFinite(scale)||scale<=0)throw Error('Local gun pose scale overflow');
 const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axes[0],axes[1],axes[2])).normalize();
 if(![q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>1e-6)throw Error('Invalid local gun orientation');
 return Object.freeze({position:Object.freeze({x:e[12],y:e[13],z:e[14]}),rotation:Object.freeze({x:q.x,y:q.y,z:q.z,w:q.w}),yaw:new THREE.Euler().setFromQuaternion(q,'YXZ').y,phase:options.phase,scale});
}
