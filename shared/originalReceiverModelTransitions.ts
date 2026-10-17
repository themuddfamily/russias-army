import type {ReceiverModelTransition,ReceiverModelPose,ReceiverPickup} from './originalReceiverModelWorld';
import type {WeaponId} from './protocol';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

export interface ReceiverModelTransitionCopyOptions {
 readonly sceneGeneration:number;readonly minCallback:number;readonly maxCallback:number;readonly receiptTick:number;
 readonly maxEntries:number;readonly maxTextChars:number;
 /** Ordinal of the first event in a bounded streamed journal window. */
 readonly firstOrdinal?:number;
}
/** Detached known-field delivery data. The journal records adapter lifecycle
 * identities, not native actor-list scheduling or complete geometry proof. */
export function copyReceiverModelTransitions(raw:readonly ReceiverModelTransition[],options:ReceiverModelTransitionCopyOptions):readonly ReceiverModelTransition[] {
 const sceneGeneration=options.sceneGeneration,minCallback=options.minCallback,maxCallback=options.maxCallback,receiptTick=options.receiptTick,maxEntries=options.maxEntries,maxTextChars=options.maxTextChars,firstOrdinal=options.firstOrdinal??1;
 if(![sceneGeneration,minCallback,maxCallback,receiptTick,maxEntries,maxTextChars,firstOrdinal].every(Number.isSafeInteger)||sceneGeneration<0||minCallback<0||maxCallback<minCallback||receiptTick<0||maxEntries<1||maxEntries>256||maxTextChars<1||maxTextChars>65536||firstOrdinal<1||!Array.isArray(raw))throw Error('Invalid model transition copy bounds');
 const count=raw.length;if(!Number.isSafeInteger(count)||count<0||count>maxEntries||!Number.isSafeInteger(firstOrdinal+Math.max(0,count-1)))throw Error('Model transition entry budget exceeded');
 let text=0,previousCallback=minCallback;const result:ReceiverModelTransition[]=[],weapons:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
 const label=(value:string):string=>{if(typeof value!=='string'||!value)throw Error('Invalid model transition identity');text+=value.length;if(!Number.isSafeInteger(text)||text>maxTextChars)throw Error('Model transition text budget exceeded');return value;};
 const weaponCopy=(value:WeaponId):WeaponId=>{if(!weapons.includes(value))throw Error('Invalid model transition weapon');return label(value) as WeaponId;};
 const point=(rawPoint:ReceiverModelPose['position'])=>{if(!rawPoint)throw Error('Invalid model transition position');const x=rawPoint.x,y=rawPoint.y,z=rawPoint.z;if(![x,y,z].every(Number.isFinite))throw Error('Invalid model transition position');return Object.freeze({x,y,z});};
 const pickupCopy=(rawPickup:Readonly<ReceiverPickup>):Readonly<ReceiverPickup>=>{
  if(!rawPickup)throw Error('Invalid model transition pickup');const id=rawPickup.id,rawHandle=rawPickup.handle,rawWeapon=rawPickup.weapon,rawPosition=rawPickup.position;
  if(!Number.isSafeInteger(id)||id<1)throw Error('Invalid model transition pickup id');
  return Object.freeze({id,handle:label(rawHandle),weapon:weaponCopy(rawWeapon),position:point(rawPosition)});
 };
 const poseCopy=(rawPose:Readonly<ReceiverModelPose>):Readonly<ReceiverModelPose>=>{
  if(!rawPose)throw Error('Invalid model transition pose');const rawPosition=rawPose.position,yaw=rawPose.yaw,phase=rawPose.phase,scale=rawPose.scale,rawRotation=rawPose.rotation;
  if(![yaw,phase,scale].every(Number.isFinite)||phase<0||scale<=0)throw Error('Invalid model transition pose');
  const position=point(rawPosition);let rotation:ReceiverModelPose['rotation'];
  if(rawRotation!==undefined){if(!rawRotation)throw Error('Invalid model transition rotation');const x=rawRotation.x,y=rawRotation.y,z=rawRotation.z,w=rawRotation.w;if(![x,y,z,w].every(Number.isFinite)||Math.abs(Math.hypot(x,y,z,w)-1)>1e-6)throw Error('Invalid model transition rotation');rotation=Object.freeze({x,y,z,w});}
  return Object.freeze({position,yaw,phase,scale,...(rotation?{rotation}:{})});
 };
 for(let i=0;i<count;i++){
  const item:ReceiverModelTransition=raw[i];if(!item)throw Error('Missing model transition');
  const kind=item.kind,ordinal=item.ordinal,rawPrefix=item.prefix;
  if(ordinal!==firstOrdinal+i||!rawPrefix)throw Error('Invalid model transition ordinal or prefix');
  const prefixKind=rawPrefix.kind,generation=rawPrefix.sceneGeneration,callback=rawPrefix.callback;
  if(prefixKind!=='callback'&&prefixKind!=='receipt')throw Error('Invalid model transition prefix');
  const prefix:ReceiverScenePrefix=prefixKind==='receipt'?{kind:prefixKind,sceneGeneration:generation,callback,tick:rawPrefix.tick}:{kind:prefixKind,sceneGeneration:generation,callback};
  validateReceiverScenePrefix(prefix);
  if(generation!==sceneGeneration||callback<minCallback||callback>maxCallback||callback<previousCallback||(prefix.kind==='receipt'?(prefix.tick!==receiptTick||callback!==minCallback):callback<=minCallback))throw Error('Foreign, replayed or future model transition prefix');
  previousCallback=callback;label(prefixKind);const common={ordinal,prefix:Object.freeze(prefix)};
  let event:ReceiverModelTransition;
  switch(kind){
   case 'birth':{label(kind);const actorId=item.actorId,giHandle=item.giHandle,gunHandle=item.gunHandle,reused=item.reused;if(typeof reused!=='boolean')throw Error('Invalid model transition reuse');event=Object.freeze({...common,kind,actorId:label(actorId),giHandle:label(giHandle),gunHandle:label(gunHandle),reused});break;}
   case 'gun-bound':{label(kind);const actorId=item.actorId,giHandle=item.giHandle,gunHandle=item.gunHandle,previousGunHandle=item.previousGunHandle,weapon=item.weapon;event=Object.freeze({...common,kind,actorId:label(actorId),giHandle:label(giHandle),gunHandle:label(gunHandle),previousGunHandle:label(previousGunHandle),weapon:weaponCopy(weapon)});break;}
   case 'detach':{label(kind);const actorId=item.actorId,giHandle=item.giHandle,gunHandle=item.gunHandle,rawPickup=item.pickup,fadeId=item.fadeId,rawFadePosition=item.fadePositionWorld;if(!Number.isSafeInteger(fadeId)||fadeId<1)throw Error('Invalid model transition fade id');const pickup=pickupCopy(rawPickup);if(pickup.handle!==gunHandle)throw Error('Contradictory model transition drop handle');event=Object.freeze({...common,kind,actorId:label(actorId),giHandle:label(giHandle),gunHandle:label(gunHandle),pickup,fadeId,fadePositionWorld:point(rawFadePosition)});break;}
   case 'pickup-collected':{label(kind);const pickup=item.pickup;event=Object.freeze({...common,kind,pickup:pickupCopy(pickup)});break;}
   case 'corpse-retired':{label(kind);const fadeId=item.fadeId,giHandle=item.giHandle,terminalPose=item.terminalPose;if(!Number.isSafeInteger(fadeId)||fadeId<1)throw Error('Invalid model transition fade id');event=Object.freeze({...common,kind,fadeId,giHandle:label(giHandle),terminalPose:poseCopy(terminalPose)});break;}
   default:throw Error('Invalid model transition kind');
  }
  result.push(event);
 }
 return Object.freeze(result);
}
