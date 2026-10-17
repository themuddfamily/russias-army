import {Matrix4} from 'three';
import type {Vec3,WeaponId} from '../shared/protocol';
import type {ReceiverGunHeldInput} from '../shared/originalReceiverGunCallback';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';

export interface OriginalSoloHumanCallbackInputOptions {
 readonly prefix:ReceiverScenePrefix;
 /** Already updated WORLD matrix, after camera recoil and before gun kicks. */
 readonly cameraWorldMatrix:readonly number[];
 readonly velocityWorld:Readonly<Vec3>;
 /** Logical aim, independent of the camera's current recoil transform. */
 readonly pitchRadians:number;readonly yawRadians:number;
 readonly typing:boolean;readonly firing:boolean;
 readonly keys:Pick<ReadonlySet<string>,'has'>;
 readonly sourceScopeEnabled:boolean;
 readonly weaponModelPresent:Readonly<Record<WeaponId,boolean>>;
}
export interface OriginalSoloHumanCallbackInput {
 readonly prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;
 readonly cameraWorldMatrix:readonly number[];
 readonly velocityWorld:Readonly<Vec3>;
 readonly sourceRotation:Readonly<Vec3>;
 readonly held:ReceiverGunHeldInput;
 readonly shiftHeld:boolean;
 readonly sourceScopeEnabled:boolean;
 readonly weaponModelPresent:Readonly<Record<WeaponId,boolean>>;
}

/** Capture one caller-selected camera/input boundary. This function does not
 * update camera matrices, apply unit conversion, gate typing, consume RNG or
 * retain callback history. The caller owns reuse of this snapshot on retry. */
export function captureOriginalSoloHumanCallbackInput(options:OriginalSoloHumanCallbackInputOptions):OriginalSoloHumanCallbackInput {
 if(!options)throw Error('Missing human callback input');
 const rawPrefix=options.prefix;
 if(!rawPrefix)throw Error('Missing human callback prefix');
 const {kind,sceneGeneration,callback}=rawPrefix;
 const prefix={kind,sceneGeneration,callback};
 validateReceiverScenePrefix(prefix as ReceiverScenePrefix);
 if(kind!=='callback')throw Error('Human input requires callback prefix');
 const pitch=options.pitchRadians,yaw=options.yawRadians,typing=options.typing,firing=options.firing,sourceScopeEnabled=options.sourceScopeEnabled;
 const pitchDegrees=pitch*180/Math.PI,yawDegrees=yaw*180/Math.PI;
 if(!Number.isFinite(pitch)||!Number.isFinite(yaw)||!Number.isFinite(pitchDegrees)||!Number.isFinite(yawDegrees)
  ||typeof typing!=='boolean'||typeof firing!=='boolean'||typeof sourceScopeEnabled!=='boolean')throw Error('Invalid human callback scalar input');
 const rawVelocity=options.velocityWorld;
 if(!rawVelocity)throw Error('Missing human callback velocity');
 const velocityWorld={x:rawVelocity.x,y:rawVelocity.y,z:rawVelocity.z};
 if(!Object.values(velocityWorld).every(Number.isFinite))throw Error('Invalid human callback velocity');
 const rawMatrix=options.cameraWorldMatrix;
 if(!Array.isArray(rawMatrix)||rawMatrix.length!==16)throw Error('Invalid human camera matrix count');
 const cameraWorldMatrix:number[]=[];
 for(let i=0;i<16;i++){
  const value=rawMatrix[i];
  if(!Number.isFinite(value))throw Error('Nonfinite human camera matrix');
  cameraWorldMatrix.push(value);
 }
 if(cameraWorldMatrix[3]!==0||cameraWorldMatrix[7]!==0||cameraWorldMatrix[11]!==0||cameraWorldMatrix[15]!==1)throw Error('Nonaffine human camera matrix');
 const matrix=new Matrix4().fromArray(cameraWorldMatrix),determinant=matrix.determinant();
 if(!Number.isFinite(determinant)||determinant===0||!matrix.clone().invert().elements.every(Number.isFinite))throw Error('Singular or overflowing human camera matrix');
 const rawPresence=options.weaponModelPresent;
 if(!rawPresence)throw Error('Missing human weapon model presence');
 const weaponModelPresent={pistol:rawPresence.pistol,shotgun:rawPresence.shotgun,rifle:rawPresence.rifle,launcher:rawPresence.launcher,rpg:rawPresence.rpg,sniper:rawPresence.sniper};
 if(!Object.values(weaponModelPresent).every(v=>typeof v==='boolean'))throw Error('Invalid human weapon model presence');
 const keys=options.keys;
 if(!keys||typeof keys.has!=='function')throw Error('Missing human key levels');
 // Read every known key exactly once, even if firing or a modifier is already
 // true. The keyboard can change after capture; no downstream code rereads it.
 const reload=keys.has('KeyR'),controlLeft=keys.has('ControlLeft'),controlRight=keys.has('ControlRight');
 const digits:ReceiverGunHeldInput['digits']=[keys.has('Digit1'),keys.has('Digit2'),keys.has('Digit3'),keys.has('Digit4'),keys.has('Digit5'),keys.has('Digit6')];
 const shiftLeft=keys.has('ShiftLeft'),shiftRight=keys.has('ShiftRight');
 if(![reload,controlLeft,controlRight,...digits,shiftLeft,shiftRight].every(v=>typeof v==='boolean'))throw Error('Invalid human key levels');
 return Object.freeze({prefix:Object.freeze({kind,sceneGeneration,callback}),cameraWorldMatrix:Object.freeze(cameraWorldMatrix),velocityWorld:Object.freeze(velocityWorld),
  sourceRotation:Object.freeze({x:pitchDegrees,y:0,z:yawDegrees}),held:Object.freeze({typing,reload,fire:firing||controlLeft||controlRight,digits:Object.freeze(digits)}),
  shiftHeld:shiftLeft||shiftRight,sourceScopeEnabled,weaponModelPresent:Object.freeze(weaponModelPresent)});
}
