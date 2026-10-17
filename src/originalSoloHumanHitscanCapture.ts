import type {OriginalSoloReceiverCurrentContext} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloGunHitscanCapture} from '../shared/originalSoloGunCallbackProgram';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {copyReceiverLocalHitscanAction,type ReceiverLocalHitscanAction} from '../shared/originalReceiverLocalHitscan';
import {sameReceiverScenePrefix,validateReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';
import type {OriginalSoloHumanCallbackInput} from './originalSoloHumanCallbackInput';
import {captureOriginalSoloLocalGunPose} from './originalSoloLocalGunPose';

export interface OriginalSoloHumanHitscanOptions {
 readonly sourceScale:number;readonly bspWorld:number;readonly maxModels:number;readonly maxTextChars:number;
}
const size=Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!;
/** Capture one ordered human bullettest operand set. Geometry is queried later
 * against the actual staged scene; this performs no readiness/ammo admission,
 * damage, RNG, query or renderer update. Literal SPAS coordinates select two
 * source calls, and do not introduce invented spread into captured aim. */
export function captureOriginalSoloHumanHitscan(context:OriginalSoloReceiverCurrentContext,input:OriginalSoloHumanCallbackInput,
 request:OriginalSoloGunHitscanCapture,preview:ReceiverLocalWeaponWorldCheckpoint,options:OriginalSoloHumanHitscanOptions,
):ReceiverLocalHitscanAction {
 const sourceScale=options?.sourceScale,bspWorld=options?.bspWorld,maxModels=options?.maxModels,maxTextChars=options?.maxTextChars;
 if(!Number.isFinite(sourceScale)||sourceScale<=0||!Number.isFinite(bspWorld)||bspWorld<=0||!Number.isSafeInteger(maxModels)||maxModels<1||maxModels>10000||!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536)throw Error('Invalid human hitscan capture limits');
 if(!context||!input||!request||!preview)throw Error('Missing human hitscan capture boundary');
 const world=context.observer,prefix=input.prefix,checkpoint=request.checkpoint,fire=request.fire,intentIndex=request.intentIndex,rayIndex=request.rayIndex;
 if(!prefix)throw Error('Missing human hitscan prefix');validateReceiverScenePrefix(prefix);
 if(!world||context.id!=='player'||world.id!==context.id||context.target!==world||context.name!==world.name||context.lifeGeneration!==world.lifeGeneration
  ||context.body!==world.body||context.health!==world.health||context.barrels!==world.barrels||context.barrels.sourceScale!==sourceScale||context.doors!==world.doors||context.projectiles!==world.projectiles||context.blasts!==world.blasts||context.actorNames!==world.actorNames
  ||!context.alive||!world.alive||context.deliveryKind!=='where'||context.phase!=='physics'||context.afterGoody!==true
  ||context.mirrorCallback!==world.callback||context.physicalCallback!==world.callback+1||context.receiptTick!==world.receiptTick||context.time!==world.updatedAt||!Number.isFinite(context.time)||context.time<0
  ||context.order?.callbacks!==world.callback+1||context.order.receiptCallbacks!==world.callback
  ||prefix.kind!=='callback'||prefix.sceneGeneration!==world.lifeGeneration||prefix.callback!==world.callback+1
  ||!checkpoint?.prefix||!preview.prefix||!sameReceiverScenePrefix(prefix,checkpoint.prefix)||!sameReceiverScenePrefix(prefix,preview.prefix))throw Error('Foreign human hitscan callback boundary');
 if(!fire||fire.kind!=='fire'||fire.action!=='hitscan'||!['pistol','shotgun','rifle','sniper'].includes(fire.weapon)||checkpoint.selected!==fire.weapon||preview.selectedWeapon!==fire.weapon
  ||!Number.isSafeInteger(intentIndex)||intentIndex<0||intentIndex>=64||!Number.isSafeInteger(rayIndex)||rayIndex<0
  ||!Array.isArray(fire.rayCoordinates)||fire.rayCoordinates.length!==(fire.weapon==='shotgun'?2:1)||rayIndex>=fire.rayCoordinates.length
  ||!Array.isArray(request.precedingCommands)||request.precedingCommands.length>256)throw Error('Invalid human hitscan request');
 const coordinates=request.coordinates,ray=fire.rayCoordinates[rayIndex];
 if(!Array.isArray(coordinates)||coordinates.length!==2||!Array.isArray(ray)||ray.length!==2||!Number.isFinite(coordinates[0])||!Number.isFinite(coordinates[1])||coordinates[0]!==ray[0]||coordinates[1]!==ray[1])throw Error('Changed human hitscan literal coordinates');
 const camera=input.cameraWorldMatrix,stagedCamera=preview.cameraWorldMatrix;
 if(!Array.isArray(camera)||camera.length!==16||!Array.isArray(stagedCamera)||stagedCamera.length!==16)throw Error('Missing human hitscan captured camera');
 for(let i=0;i<16;i++)if(!Number.isFinite(camera[i])||camera[i]!==stagedCamera[i])throw Error('Changed human hitscan preview camera');
 const names=context.actorNames,receipt=context.receiptActorNames;
 if(!(names instanceof Map)||!Array.isArray(receipt)||size.call(names)>maxModels||receipt.length>maxModels)throw Error('Human hitscan actor name budget exceeded');
 let text=0;
 const label=(raw:unknown):string=>{if(typeof raw!=='string'||!raw)throw Error('Invalid human hitscan actor label');text+=raw.length;if(text>maxTextChars)throw Error('Human hitscan text budget exceeded');return raw;};
 const actorNames=Object.create(null) as Record<string,string>;
 let unique=0;
 const put=(actorId:unknown,name:unknown,life:unknown)=>{
  const id=label(actorId),value=label(name);
  if(id===context.id||!Number.isSafeInteger(life)||typeof life!=='number'||life<1)throw Error('Invalid human hitscan actor identity');
  if(!Object.hasOwn(actorNames,id)&&++unique>maxModels)throw Error('Human hitscan actor name budget exceeded');actorNames[id]=value;
 };
 Map.prototype.forEach.call(names,(row:{name:string;lifeGeneration:number}|undefined,id:unknown)=>{if(!row)throw Error('Missing human hitscan prior actor');put(id,row.name,row.lifeGeneration);});
 const receiptIds=new Set<string>();
 for(let i=0;i<receipt.length;i++){
  const row=receipt[i];if(!row)throw Error('Missing human hitscan receipt actor');
  const id=row.actorId,name=row.name,life=row.lifeGeneration;
  if(receiptIds.has(id))throw Error('Repeated human hitscan receipt actor');receiptIds.add(id);put(id,name,life);
 }
 const stamp=`${prefix.sceneGeneration}:${prefix.callback}:${intentIndex}:${rayIndex}`;
 const effectId=`solo-human-hit:${stamp}`,muzzleId=`solo-human-muzzle:${stamp}`;
 label(effectId);label(muzzleId);
 const gunPose=captureOriginalSoloLocalGunPose(preview,fire.weapon,{sourceScale,phase:0,maxTextChars});
 return copyReceiverLocalHitscanAction({prefix,weapon:fire.weapon as ReceiverLocalHitscanAction['weapon'],sourceRotation:input.sourceRotation,origin:originalPlayerEye(context.body),bspWorld,actorNames,effectId,muzzleId,gunPose},maxModels,maxTextChars);
}
