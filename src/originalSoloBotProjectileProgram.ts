import * as THREE from 'three';
import {isOriginalSoloBotShotCapture,sourceRotationForSoloDirection,type OriginalSoloBotShotCapture} from '../shared/originalSoloBotShotCapture';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import type {OriginalSoloReceiverCurrentContext} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloLaunchReservation} from '../shared/originalSoloLaunchBatch';
import type {OriginalSoloAdmittedBang,OriginalSoloBotProjectileProgram} from '../shared/originalSoloCurrentSceneProducer';
import type {ReceiverProjectileWorldBirth,ReceiverProjectileWorldCheckpoint} from '../shared/originalReceiverProjectileWorld';
import {captureOriginalSoloProjectileReceiptProgram} from './originalSoloProjectileProgram';

const mapSize=Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!;
const mapValues=Map.prototype.values;

export interface OriginalSoloBotProjectileProgramOptions {
 readonly renderToWorld:readonly number[];
 readonly maxActors:number;readonly maxCommands:number;readonly maxShots:number;readonly maxTextChars:number;
 readonly captureBirth:(reservation:OriginalSoloLaunchReservation)=>ReceiverProjectileWorldBirth;
}
/** Translates already issued authored AI shots. No human ammo/gun gate, RNG,
 * recoil or motion step is inferred. The post-goody eye matches Game's existing
 * bot constructor; captured aim retains its authored targeting operands.
 * Exact reservations and constructor prototypes come from the live callback
 * batch. Receipt motion/retirement uses the existing owned-projectile adapter.
 * Retry retention belongs to the producer, not a second call to this reader. */
export function captureOriginalSoloBotProjectileProgram(
 context:OriginalSoloReceiverCurrentContext,
 prefixes:Readonly<{receipt:ReceiverScenePrefix;callback?:ReceiverScenePrefix}>,
 previous:ReceiverProjectileWorldCheckpoint,admittedBangs:readonly OriginalSoloAdmittedBang[],
 shots:readonly OriginalSoloBotShotCapture[],options:OriginalSoloBotProjectileProgramOptions,
):OriginalSoloBotProjectileProgram {
 if(!options||![options.maxActors,options.maxCommands,options.maxShots,options.maxTextChars].every(Number.isSafeInteger)
  ||options.maxActors<1||options.maxActors>10000||options.maxCommands<1||options.maxCommands>256
  ||options.maxShots<1||options.maxShots>64||options.maxTextChars<1||options.maxTextChars>65536||typeof options.captureBirth!=='function')throw Error('Invalid bot projectile program bounds');
 const mapping=options.renderToWorld;
 if(!Array.isArray(mapping)||mapping.length!==16||mapping.some(n=>!Number.isFinite(n))||mapping[3]!==0||mapping[7]!==0||mapping[11]!==0||mapping[15]!==1)throw Error('Invalid bot projectile render mapping');
 const determinant=new THREE.Matrix4().fromArray(mapping).determinant();
 if(!Number.isFinite(determinant)||determinant===0)throw Error('Invalid bot projectile render mapping');
 if(!context||!prefixes||!Number.isSafeInteger(context.lifeGeneration)||context.lifeGeneration<1||typeof context.id!=='string'||!context.id||!Number.isFinite(context.time)||context.time<0||!['where','death'].includes(context.deliveryKind))throw Error('Invalid bot projectile capture context');
 validateReceiverScenePrefix(prefixes.receipt);
 const callback=prefixes.callback;
 if(prefixes.receipt.kind!=='receipt'||prefixes.receipt.sceneGeneration!==context.lifeGeneration||prefixes.receipt.callback!==context.order.receiptCallbacks||prefixes.receipt.tick!==context.receiptTick
  ||!previous||previous.prefix?.sceneGeneration!==context.lifeGeneration)throw Error('Foreign bot projectile receipt prefix');
 if(context.deliveryKind==='where'){
  if(!callback)throw Error('Missing bot projectile callback prefix');validateReceiverScenePrefix(callback);
  if(callback.kind!=='callback'||callback.sceneGeneration!==context.lifeGeneration||callback.callback!==context.order.callbacks||context.phase!=='physics'||!context.afterGoody||!context.alive)throw Error('Invalid living bot projectile callback');
 }else if(callback!==undefined)throw Error('Bot death receipt has a callback');
 if(!Array.isArray(shots)||shots.length>options.maxShots)throw Error('Bot projectile shot budget exceeded');
 if(context.deliveryKind==='death'&&shots.length)throw Error('Bot death receipt cannot launch shots');
 // The actual CURRENT map is bounded before any array allocation/iteration.
 // Instance overrides cannot replace its size or iterator with external hooks.
 if(mapSize.call(context.projectiles)>options.maxActors)throw Error('Bot projectile physical actor budget exceeded');
 let lastSequence=0,text=context.id.length;
 const eye=context.deliveryKind==='where'?originalPlayerEye(context.body):undefined;
 if(eye&&![eye.x,eye.y,eye.z].every(Number.isFinite))throw Error('Invalid bot projectile post-goody eye');
 // Inspect every issued row, sequence and RPG conversion before the first
 // externally observable reservation. Never inspect unissued row getters.
 const commands=shots.map(shot=>{
  if(!isOriginalSoloBotShotCapture(shot))throw Error('Unissued authored bot projectile shot');
  if(shot.ownerId!==context.id||shot.ownerLife!==context.lifeGeneration||shot.weapon!=='launcher'&&shot.weapon!=='rpg'||shot.sequence<=lastSequence||shot.capturedAt>context.time)throw Error('Foreign or unordered authored bot projectile shot');
  if(Math.hypot(shot.aimDirection.x,shot.aimDirection.y,shot.aimDirection.z)===0)throw Error('Invalid authored bot projectile constructor direction');
  lastSequence=shot.sequence;text+=shot.ownerId.length+shot.targetId.length+shot.weapon.length;
  if(text>options.maxTextChars)throw Error('Bot projectile text budget exceeded');
  return Object.freeze({shot,command:Object.freeze({weapon:shot.weapon,eye:Object.freeze({...eye!}),direction:shot.aimDirection,...(shot.weapon==='rpg'?{sourceRotation:Object.freeze(sourceRotationForSoloDirection(shot.aimDirection))}:{})})});
 });
 const receiptCommands=captureOriginalSoloProjectileReceiptProgram(previous,[...mapValues.call(context.projectiles)],admittedBangs,options);
 // Reserve room for one constructor per authored row, even if a later cap
 // rejection would omit its birth. Budget rejection never consumes ordinals.
 if(receiptCommands.length+commands.length>options.maxCommands)throw Error('Bot projectile combined command budget exceeded');
 const reserve=context.reserveLaunch,captureBirth=options.captureBirth;
 if(commands.length&&typeof reserve!=='function')throw Error('Bot projectile callback requires live launch reservation');
 const callbackCommands:Extract<NonNullable<OriginalSoloBotProjectileProgram['callbackCommands']>[number],{kind:'projectile-birth'}>[]=[];
 const botLaunchAdmissions:OriginalSoloBotProjectileProgram['botLaunchAdmissions'][number][]=[];
 for(let ordinal=0;ordinal<commands.length;ordinal++){
  const {shot,command}=commands[ordinal],admission=reserve!(command,ordinal);
  if(!admission||!Object.isFrozen(admission))throw Error('Invalid bot projectile reservation admission');
  if(admission.ok){
   const reservation=admission.reservation,launch=reservation?.launch;
   if(!reservation||!Object.isFrozen(reservation)||!launch||!Object.isFrozen(launch)||launch.ownerId!==context.id||launch.ownerLife!==context.lifeGeneration||launch.weapon!==shot.weapon)throw Error('Foreign bot projectile reservation');
   const raw=captureBirth(reservation);
   if(!raw||raw.launchId!==launch.id||raw.weapon!==launch.weapon||typeof raw.cloneFresh!=='function'||typeof raw.resetModel!=='function'||raw.onRecycled!==undefined&&typeof raw.onRecycled!=='function')throw Error('Invalid exact bot projectile model birth');
   const birth=Object.freeze({launchId:raw.launchId,weapon:raw.weapon,cloneFresh:raw.cloneFresh,resetModel:raw.resetModel,...(raw.onRecycled?{onRecycled:raw.onRecycled}:{})});
   callbackCommands.push(Object.freeze({kind:'projectile-birth',birth}));
  }else if(admission.reason!=='projectile-cap')throw Error('Invalid bot projectile reservation rejection');
  botLaunchAdmissions.push(Object.freeze({shot,admission}));
 }
 return Object.freeze({receiptCommands,...(callback?{callbackCommands:Object.freeze(callbackCommands)}:{}),botLaunchAdmissions:Object.freeze(botLaunchAdmissions)});
}
