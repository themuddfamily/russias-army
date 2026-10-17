import {isOriginalSoloBotShotCapture,sourceRotationForSoloDirection,type OriginalSoloBotShotCapture} from './originalSoloBotShotCapture';
import type {OriginalSoloReservedLaunchAdmission} from './originalSoloLaunchBatch';
import type {OriginalSoloReceiverCurrentContext} from './originalSoloObserverWorld';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {Vec3} from './protocol';

export interface OriginalSoloBotProjectileAdmission {
 readonly shot:OriginalSoloBotShotCapture;readonly admission:OriginalSoloReservedLaunchAdmission;
}
export interface OriginalSoloBotProjectileAdmissionOptions {
 readonly context:OriginalSoloReceiverCurrentContext;readonly callback:ReceiverScenePrefix;
 readonly callbackCommands:readonly ReceiverCurrentEnvironmentCommand[];
 readonly committedSequence:number;readonly maxAdmissions:number;readonly maxTextChars:number;
}
export interface OriginalSoloBotProjectileCommit {
 readonly prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;
 readonly shots:readonly OriginalSoloBotShotCapture[];
}
const finitePoint=(p:Readonly<Vec3>):boolean=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
/** Authored bot constructor validation only. Actual reservation issuer/ordinal
 * authority remains the coordinator's batch. No human phase, ammo, damage,
 * query, mutation, consumption or transport effect is performed here. */
export function validateOriginalSoloBotProjectileAdmissions(raw:unknown,options:OriginalSoloBotProjectileAdmissionOptions):Readonly<{shots:readonly OriginalSoloBotShotCapture[];admissions:readonly OriginalSoloReservedLaunchAdmission[];lastSequence:number}> {
 if(!options)throw Error('Missing bot projectile admission options');
 const maxAdmissions=options.maxAdmissions,maxTextChars=options.maxTextChars,committedSequence=options.committedSequence,context=options.context,callback=options.callback,commands=options.callbackCommands;
 if(!Number.isSafeInteger(maxAdmissions)||maxAdmissions<1||maxAdmissions>64||!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536||!Number.isSafeInteger(committedSequence)||committedSequence<0)throw Error('Invalid bot projectile admission limits');
 if(!Array.isArray(raw)||!Array.isArray(commands))throw Error('Invalid bot projectile admission arrays');
 const count=raw.length,commandCount=commands.length;
 if(!Number.isSafeInteger(count)||count>maxAdmissions||!Number.isSafeInteger(commandCount)||commandCount>count)throw Error('Bot projectile admission count exceeded');
 if(!context||!callback)throw Error('Missing bot projectile callback context');
 validateReceiverScenePrefix(callback);
 const id=context.id,name=context.name,life=context.lifeGeneration,time=context.time,order=context.order,mirrorCallback=context.mirrorCallback;
 const callbacks=order?.callbacks,receiptCallbacks=order?.receiptCallbacks;
 if(callback.kind!=='callback'||context.deliveryKind!=='where'||context.afterGoody!==true||context.alive!==true||!Number.isSafeInteger(life)||life<1||!Number.isSafeInteger(mirrorCallback)||mirrorCallback<0||!order||callback.sceneGeneration!==life||callback.callback!==callbacks||receiptCallbacks!==mirrorCallback||callbacks!==mirrorCallback+1||!Number.isFinite(time)||time<0||count>0&&typeof context.reserveLaunch!=='function')throw Error('Invalid bot projectile callback context');
 let text=0;
 const add=(value:unknown)=>{if(typeof value!=='string'||!value||value.trim()!==value||(text+=value.length)>maxTextChars)throw Error('Bot projectile admission text budget exceeded');};
 add(id);add(name);
 const eye=originalPlayerEye(context.body);if(!finitePoint(eye))throw Error('Invalid bot projectile next-goody eye');
 const shots:OriginalSoloBotShotCapture[]=[],admissions:OriginalSoloReservedLaunchAdmission[]=[],successes=new Map<string,'launcher'|'rpg'>(),seenAdmissions=new Set<object>();let lastSequence=committedSequence;
 for(let i=0;i<count;i++){
  const row=raw[i] as OriginalSoloBotProjectileAdmission|undefined;if(!row)throw Error('Missing bot projectile admission row');
  const shot=row.shot,admission=row.admission;
  if(!isOriginalSoloBotShotCapture(shot))throw Error('Unissued bot projectile shot');
  if(shot.ownerId!==id||shot.ownerLife!==life||shot.weapon!=='launcher'&&shot.weapon!=='rpg'||shot.sequence<=lastSequence||shot.capturedAt>time)throw Error('Foreign, stale or unordered bot projectile shot');
  add(shot.ownerId);add(shot.targetId);add(shot.weapon);lastSequence=shot.sequence;
  if(!admission||typeof admission!=='object'||!Object.isFrozen(admission)||seenAdmissions.has(admission))throw Error('Invalid or repeated bot projectile admission');seenAdmissions.add(admission);
  if(admission.ok===true){
   const reservation=admission.reservation,launch=reservation?.launch;
   if(!reservation||!Object.isFrozen(reservation)||!launch||!Object.isFrozen(launch))throw Error('Invalid bot projectile reservation');
   const ownerId=launch.ownerId,ownerLife=launch.ownerLife,ownerName=launch.ownerName,weapon=launch.weapon,launchId=launch.id,launchEye=launch.eye,direction=launch.direction,rotation=launch.sourceRotation;
   add(launchId);add(ownerId);add(ownerName);add(weapon);
   if(ownerId!==id||ownerLife!==life||ownerName!==name||weapon!==shot.weapon||successes.has(launchId)||!finitePoint(launchEye)||launchEye.x!==eye.x||launchEye.y!==eye.y||launchEye.z!==eye.z||!finitePoint(direction))throw Error('Foreign bot projectile reservation');
   const d=shot.aimDirection,length=Math.hypot(d.x,d.y,d.z);
   if(length===0||Math.hypot(direction.x-d.x/length,direction.y-d.y/length,direction.z-d.z/length)>1e-10)throw Error('Changed bot projectile direction');
   if(weapon==='rpg'){
    const expected=sourceRotationForSoloDirection(d);
    if(!finitePoint(rotation!)||rotation!.y!==0||Math.abs(rotation!.x-expected.x)>1e-10||Math.abs(rotation!.z-expected.z)>1e-10)throw Error('Changed bot projectile source rotation');
   }else if(rotation!==undefined)throw Error('Unexpected bot grenade source rotation');
   successes.set(launchId,weapon);
  }else if(admission.ok!==false||admission.reason!=='projectile-cap')throw Error('Invalid bot projectile cap rejection');
  shots.push(shot);admissions.push(admission);
 }
 const births=new Set<string>();
 for(let i=0;i<commandCount;i++){
  const command=commands[i];if(!command||command.kind!=='projectile-birth')throw Error('Invalid bot projectile callback command');
  const birth=command.birth;if(!birth)throw Error('Missing bot projectile callback birth');
  const launchId=birth.launchId,weapon=birth.weapon;add(launchId);add(weapon);
  if(births.has(launchId)||successes.get(launchId)!==weapon||typeof birth.cloneFresh!=='function'||typeof birth.resetModel!=='function'||birth.onRecycled!==undefined&&typeof birth.onRecycled!=='function')throw Error('Foreign or repeated bot projectile callback birth');births.add(launchId);
 }
 if(births.size!==successes.size)throw Error('Missing bot projectile callback birth');
 return Object.freeze({shots:Object.freeze(shots),admissions:Object.freeze(admissions),lastSequence});
}
