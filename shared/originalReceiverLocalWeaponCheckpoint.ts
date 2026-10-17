import type {ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from './originalReceiverLocalWeaponInventory';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import type {WeaponId} from './protocol';
const handles=Object.keys(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES) as Array<keyof typeof ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES>;
const weapons:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const normalized=(name:string)=>name.trim().toLowerCase();
function prefixCopy(raw:ReceiverScenePrefix):ReceiverScenePrefix {
 if(!raw)throw Error('Missing local weapon presentation prefix');
 const kind=raw.kind,sceneGeneration=raw.sceneGeneration,callback=raw.callback;
 const result=kind==='receipt'?{kind,sceneGeneration,callback,tick:raw.tick}:{kind,sceneGeneration,callback};
 validateReceiverScenePrefix(result as ReceiverScenePrefix);return Object.freeze(result as ReceiverScenePrefix);
}
function matrixCopy(raw:readonly number[]):readonly number[] {
 if(!Array.isArray(raw)||raw.length!==16)throw Error('Invalid local weapon presentation matrix');
 const values:number[]=[];for(let i=0;i<16;i++){const value=raw[i];if(!Number.isFinite(value))throw Error('Invalid local weapon presentation matrix');values.push(value);}
 if(values[3]!==0||values[7]!==0||values[11]!==0||values[15]!==1)throw Error('Invalid local weapon presentation affine');
 return Object.freeze(values);
}
/** Detached bounded known-field capture; no inferred parenting or membership. */
export function copyReceiverLocalWeaponWorldCheckpoint(raw:ReceiverLocalWeaponWorldCheckpoint,maxTextChars:number):ReceiverLocalWeaponWorldCheckpoint {
 if(!Number.isSafeInteger(maxTextChars)||maxTextChars<=0)throw Error('Invalid local weapon checkpoint text budget');
  if(!raw)throw Error('Missing local weapon presentation capture');
  const rawPrefix=raw.prefix,cameraHandle=raw.cameraHandle,rawCamera=raw.cameraWorldMatrix,selectedWeapon=raw.selectedWeapon,loadedRocket=raw.loadedRocket,rawMotion=raw.motion,rawModels=raw.models;
  const capturedPrefix=prefixCopy(rawPrefix);
  if(typeof cameraHandle!=='string'||!cameraHandle.trim()||handles.includes(normalized(cameraHandle) as typeof handles[number])||['smokes','gsmokes'].includes(normalized(cameraHandle))||typeof loadedRocket!=='boolean'
   ||selectedWeapon!==null&&!weapons.includes(selectedWeapon)||!rawMotion||!Array.isArray(rawModels)||rawModels.length!==7)throw Error('Invalid local weapon presentation capture');
  let text=cameraHandle.length;if(text>maxTextChars)throw Error('Local weapon presentation text budget');
  const weapon=rawMotion.weapon,ticker=rawMotion.ticker,rawPosition=rawMotion.gunPositionSource;
  if(!rawPosition)throw Error('Invalid local weapon presentation motion');
  const x=rawPosition.x,y=rawPosition.y,z=rawPosition.z;
  if(weapon!==selectedWeapon||weapon!==null&&!weapons.includes(weapon)||![ticker,x,y,z].every(Number.isFinite))throw Error('Invalid local weapon presentation motion');
  text+=(selectedWeapon?.length??0)+(weapon?.length??0);
  const cameraWorldMatrix=matrixCopy(rawCamera),models:ReceiverLocalWeaponModelCapture[]=[],seen=new Set<string>();
  for(let i=0;i<7;i++){
   const item:ReceiverLocalWeaponModelCapture=rawModels[i];if(!item)throw Error('Missing local weapon presentation model');
   const handle=item.handle,resource=item.resource,inWorld=item.inWorld,rawWorld=item.worldMatrix,rawGroups=item.groupAncestry;
   if(!handles.includes(handle)||seen.has(handle)||resource!==ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES[handle]||typeof inWorld!=='boolean'||!Array.isArray(rawGroups))throw Error('Invalid local weapon presentation model');
   const count=rawGroups.length;if(!Number.isSafeInteger(count)||count<0||count>maxTextChars)throw Error('Local weapon presentation ancestry budget');
   seen.add(handle);text+=handle.length+resource.length;const groups:string[]=[],unique=new Set<string>();
   for(let j=0;j<count;j++){const group=rawGroups[j];if(typeof group!=='string'||!group.trim())throw Error('Invalid local weapon presentation ancestry');const key=normalized(group);if(key===handle||unique.has(key)||['smokes','gsmokes'].includes(key))throw Error('Invalid local weapon presentation ancestry');unique.add(key);text+=group.length;if(text>maxTextChars)throw Error('Local weapon presentation text budget');groups.push(group);}
   if(text>maxTextChars)throw Error('Local weapon presentation text budget');
   models.push(Object.freeze({handle,resource,inWorld,worldMatrix:matrixCopy(rawWorld),groupAncestry:Object.freeze(groups)}));
  }
  const ancestry=new Map(models.map(model=>[model.handle,model.groupAncestry.map(normalized)])),visiting=new Set<string>(),visited=new Set<string>();
  const visit=(handle:typeof handles[number]):void=>{if(visiting.has(handle))throw Error('Cyclic local weapon presentation ancestry');if(visited.has(handle))return;visiting.add(handle);for(const group of ancestry.get(handle)??[])if(ancestry.has(group as typeof handle))visit(group as typeof handle);visiting.delete(handle);visited.add(handle);};
  for(const handle of handles)visit(handle);
  return Object.freeze({prefix:capturedPrefix,cameraHandle,cameraWorldMatrix,selectedWeapon,loadedRocket,
   motion:Object.freeze({weapon,ticker,gunPositionSource:Object.freeze({x,y,z})}),models:Object.freeze(models)});
}
