import type {ReceiverModelEntry} from './originalReceiverModelWorld';
import type {WeaponId} from './protocol';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

/** Exact retained gun at the shooting boundary. Its resource can differ from
 * the logical weapon. Full gun affine is observation, not a flash-scale policy. */
export interface ReceiverShotModel {
 readonly actorId:string;readonly weapon:WeaponId;readonly callback:number;
 readonly prefix:ReceiverScenePrefix;readonly gunHandle:string;readonly gun:Readonly<ReceiverModelEntry>;
}
export interface ReceiverShotModelCopyOptions {
 readonly sceneGeneration:number;readonly minCallback:number;readonly maxCallback:number;
 readonly maxEntries:number;readonly maxTextChars:number;
}
export function copyReceiverShotModels(raw:readonly ReceiverShotModel[],options:ReceiverShotModelCopyOptions):readonly ReceiverShotModel[] {
 const sceneGeneration=options.sceneGeneration,minCallback=options.minCallback,maxCallback=options.maxCallback,maxEntries=options.maxEntries,maxTextChars=options.maxTextChars;
 if(![sceneGeneration,minCallback,maxCallback,maxEntries,maxTextChars].every(Number.isSafeInteger)||sceneGeneration<0||minCallback<0||maxCallback<0||maxEntries<1||maxEntries>256||maxTextChars<1||maxTextChars>65536||!Array.isArray(raw))throw Error('Invalid shot model copy bounds');
 const count=raw.length;if(!Number.isSafeInteger(count)||count<0||count>maxEntries||count>0&&maxCallback<minCallback)throw Error('Shot model entry budget or callback window exceeded');
 let text=0,previous=minCallback;const result:ReceiverShotModel[]=[];
 const label=(value:string):string=>{if(typeof value!=='string'||!value)throw Error('Invalid shot model identity');text+=value.length;if(!Number.isSafeInteger(text)||text>maxTextChars)throw Error('Shot model text budget exceeded');return value;};
 const weapons:readonly WeaponId[]=['pistol','shotgun','rifle','sniper'];
 const resources=['pistol','spas12','ak47','rg6','rpg','dragunov'];
 for(let i=0;i<count;i++){
  const item:ReceiverShotModel=raw[i];if(!item)throw Error('Missing shot model');
  const actorId=item.actorId,weapon=item.weapon,callback=item.callback,rawPrefix=item.prefix,gunHandle=item.gunHandle,input=item.gun;
  if(!weapons.includes(weapon)||!rawPrefix||!input)throw Error('Invalid shot model weapon or capture');
  const kind=rawPrefix.kind,generation=rawPrefix.sceneGeneration,prefixCallback=rawPrefix.callback;
  if(kind!=='callback')throw Error('Invalid shot model callback prefix');
  const prefix:ReceiverScenePrefix={kind,sceneGeneration:generation,callback:prefixCallback};validateReceiverScenePrefix(prefix);
  if(generation!==sceneGeneration||callback!==prefixCallback||callback<=minCallback||callback>maxCallback||callback<previous)throw Error('Foreign or replayed shot model prefix');previous=callback;
  const handle=input.handle,name=input.name,resource=input.resource,group=input.group,modelKind=input.kind,inWorld=input.inWorld,geometryProvenance=input.geometryProvenance,rawPose=input.pose,rawMatrix=input.worldMatrix;
  if(modelKind!=='gun'||handle!==gunHandle||!resources.includes(resource)||!['soldiers','gsmokes','scene'].includes(group)||typeof inWorld!=='boolean'||!rawPose)throw Error('Invalid retained shot gun');
  const rawPosition=rawPose.position,yaw=rawPose.yaw,phase=rawPose.phase,scale=rawPose.scale,rawRotation=rawPose.rotation;
  if(!rawPosition||![yaw,phase,scale].every(Number.isFinite)||phase<0||scale<=0)throw Error('Invalid shot gun pose');
  const x=rawPosition.x,y=rawPosition.y,z=rawPosition.z;if(![x,y,z].every(Number.isFinite))throw Error('Invalid shot gun position');
  let rotation:ReceiverModelEntry['pose']['rotation'];
  if(rawRotation!==undefined){if(!rawRotation)throw Error('Invalid shot gun rotation');const x=rawRotation.x,y=rawRotation.y,z=rawRotation.z,w=rawRotation.w;if(![x,y,z,w].every(Number.isFinite)||Math.abs(Math.hypot(x,y,z,w)-1)>1e-6)throw Error('Invalid shot gun rotation');rotation=Object.freeze({x,y,z,w});}
  let worldMatrix:readonly number[]|undefined;
  if(rawMatrix!==undefined){if(!Array.isArray(rawMatrix)||rawMatrix.length!==16)throw Error('Invalid shot gun matrix');const values:number[]=[];for(let j=0;j<16;j++){const value=rawMatrix[j];if(!Number.isFinite(value))throw Error('Invalid shot gun matrix');values.push(value);}if(values[3]!==0||values[7]!==0||values[11]!==0||values[15]!==1)throw Error('Invalid shot gun affine');worldMatrix=Object.freeze(values);}
  label(kind);label(modelKind);
  const gun=Object.freeze({handle:label(handle),name:label(name),resource:label(resource),group:label(group) as ReceiverModelEntry['group'],kind:modelKind,inWorld,geometryProvenance:label(geometryProvenance),pose:Object.freeze({position:Object.freeze({x,y,z}),yaw,phase,scale,...(rotation?{rotation}:{})}),...(worldMatrix?{worldMatrix}:{})});
  result.push(Object.freeze({actorId:label(actorId),weapon:label(weapon) as WeaponId,callback,prefix:Object.freeze({kind:'callback' as const,sceneGeneration:generation,callback:prefixCallback}),gunHandle:label(gunHandle),gun}));
 }
 return Object.freeze(result);
}
