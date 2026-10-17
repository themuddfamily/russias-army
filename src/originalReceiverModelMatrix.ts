import * as THREE from 'three';
import type {ReceiverModelEntry,ReceiverModelRotation} from '../shared/originalReceiverModelWorld';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

export interface OriginalReceiverModelMatrixOptions {
 readonly sourceScale:number;readonly giResourceOrientation:ReceiverModelRotation;
}
const gunResources=['pistol','spas12','ak47','rg6','rpg','dragunov'];
function rotationCopy(raw:ReceiverModelRotation):THREE.Quaternion {
 if(!raw)throw Error('Missing receiver model rotation');
 const x=raw.x,y=raw.y,z=raw.z,w=raw.w;
 if(![x,y,z,w].every(Number.isFinite)||Math.abs(Math.hypot(x,y,z,w)-1)>1e-6)throw Error('Invalid receiver model rotation');
 // Match the resource backend's explicit tolerance; do not normalize captures.
 return new THREE.Quaternion(x,y,z,w);
}
function affineCopy(raw:readonly number[]):THREE.Matrix4 {
 if(!Array.isArray(raw)||raw.length!==16)throw Error('Invalid receiver model affine');
 const values:number[]=[];
 for(let i=0;i<16;i++){const value=raw[i];if(!Number.isFinite(value))throw Error('Invalid receiver model affine');values.push(value);}
 if(values[3]!==0||values[7]!==0||values[11]!==0||values[15]!==1)throw Error('Invalid receiver model affine');
 return new THREE.Matrix4().fromArray(values);
}
/** Raw decoded GI/gun resource to WORLD. An explicit matrix replaces the
 * complete derived transform; it never receives the resource basis twice.
 * The caller supplies the actual backend basis. No scene membership, native
 * bounds, parent conversion or renderer scale is inferred here. */
export function originalReceiverModelWorldMatrix(model:Readonly<ReceiverModelEntry>,options:OriginalReceiverModelMatrixOptions):THREE.Matrix4 {
 if(!model||!options)throw Error('Missing receiver model matrix input');
 const sourceScale=options.sourceScale,rawBasis=options.giResourceOrientation;
 const kind=model.kind,resource=model.resource,rawPose=model.pose,rawWorld=model.worldMatrix;
 if(!Number.isFinite(sourceScale)||sourceScale<=0||kind!=='gi'&&kind!=='gun'||kind==='gi'&&resource!=='GI'||kind==='gun'&&!gunResources.includes(resource)||!rawPose)throw Error('Invalid receiver model matrix binding');
 const basis=rotationCopy(rawBasis),rawPosition=rawPose.position,yaw=rawPose.yaw,phase=rawPose.phase,scale=rawPose.scale,rawRotation=rawPose.rotation;
 if(!rawPosition)throw Error('Missing receiver model position');
 const x=rawPosition.x,y=rawPosition.y,z=rawPosition.z;
 if(![x,y,z,yaw,phase,scale].every(Number.isFinite)||phase<0||scale<=0)throw Error('Invalid receiver model pose');
 const rotation=rawRotation===undefined?new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw):rotationCopy(rawRotation);
 if(kind==='gi')rotation.multiply(basis);
 const scaled=scale*sourceScale;
 if(!Number.isFinite(scaled))throw Error('Receiver model transform overflow');
 const derived=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),rotation,new THREE.Vector3(scaled,scaled,scaled));
 // Validate the source pose even when a full captured affine replaces it.
 affineCopy(derived.elements);
 return rawWorld===undefined?derived:affineCopy(rawWorld);
}
/** Renderer gun vertices already include the source unit scale. Compensate
 * once on the RIGHT, preserving captured WORLD translation and affine shape. */
export function originalReceiverGunMeshWorldMatrix(raw:THREE.Matrix4):THREE.Matrix4 {
 if(!(raw instanceof THREE.Matrix4))throw Error('Missing receiver gun WORLD matrix');
 const matrix=affineCopy(raw.elements),inverse=1/ORIGINAL_WEAPON_UNIT_SCALE;
 matrix.multiply(new THREE.Matrix4().makeScale(inverse,inverse,inverse));
 return affineCopy(matrix.elements);
}
