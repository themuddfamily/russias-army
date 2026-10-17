import type {WeaponId} from './protocol';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverModelEntry} from './originalReceiverModelWorld';
import type {OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

export const ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES=Object.freeze({
 pistol:'pistol',spas12:'spas12',ak47:'ak47',rg6:'rg6',rpg:'rpg',dragunov:'dragunov',rocket:'rpgrocket',
} as const);
export type ReceiverLocalWeaponHandle=keyof typeof ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES;
export interface ReceiverLocalWeaponInventoryOptions {
 readonly sceneGeneration:number;readonly maxModels:number;readonly maxVertices:number;readonly maxFaces:number;
 readonly provenance:string;readonly sidedness:OriginalReceiverRayModel['sidedness'];
 readonly maxTextChars?:number;readonly maxMeshes?:number;
}
export interface ReceiverLocalWeaponModelCapture {
 readonly handle:ReceiverLocalWeaponHandle;readonly resource:string;
 /** Complete raw source-resource to WORLD affine; no conversion is added. */
 readonly worldMatrix:readonly number[];readonly inWorld:boolean;readonly groupAncestry:readonly string[];
}
export interface ReceiverLocalWeaponCapture {
 readonly prefix:ReceiverScenePrefix;readonly models:readonly ReceiverLocalWeaponModelCapture[];
 /** Logical selection does not imply visibility, parent or world membership. */
 readonly selectedWeapon:WeaponId|null;readonly loadedRocket:boolean;readonly cameraHandle:string;
}
export interface ReceiverLocalWeaponInventorySnapshot {
 readonly scope:'local-camera-weapons-only';readonly prefix:ReceiverScenePrefix;
 readonly models:readonly ReceiverModelEntry[];readonly triangles:readonly OriginalReceiverRayModel[];
 readonly missing:readonly string[];readonly provenance:string;
 readonly selectedWeapon:WeaponId|null;readonly loadedRocket:boolean;readonly cameraHandle:string;
 resolveModel(handle:string):OriginalReceiverRayModel;
}
export interface OriginalReceiverLocalWeaponInventory {
 snapshotAt(prefix:ReceiverScenePrefix,capture:ReceiverLocalWeaponCapture):ReceiverLocalWeaponInventorySnapshot;
}
const handles=Object.freeze(Object.keys(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES) as ReceiverLocalWeaponHandle[]);
const weaponIds=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const affine=(m:readonly number[])=>{if(!Array.isArray(m)||m.length!==16)return false;for(let i=0;i<16;i++)if(!Number.isFinite(m[i]))return false;return m[3]===0&&m[7]===0&&m[11]===0&&m[15]===1;};
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
const frozenPrefix=(prefix:ReceiverScenePrefix):ReceiverScenePrefix=>prefix.kind==='receipt'
 ?Object.freeze({sceneGeneration:prefix.sceneGeneration,callback:prefix.callback,kind:'receipt',tick:prefix.tick})
 :Object.freeze({sceneGeneration:prefix.sceneGeneration,callback:prefix.callback,kind:'callback'});

/** One receiver's explicit CURRENT camera-owned weapon subset. setupmods'
 * six offworld templates and setuprockets' loaded model are identities, not
 * inferred membership: capture supplies every matrix/parent/world flag.
 * Geometry is decoded once, detached and shared immutably across snapshots.
 * No history, native clone placement, visibility, GI or grenade is invented;
 * projectile and other scene classes must be accounted for by a composer. */
export function createOriginalReceiverLocalWeaponInventory(
 weapons:ReceiverWeaponGeometry,options:ReceiverLocalWeaponInventoryOptions,
):OriginalReceiverLocalWeaponInventory {
 const maxModels=options.maxModels,maxVertices=options.maxVertices,maxFaces=options.maxFaces,maxText=options.maxTextChars??65536,maxMeshes=options.maxMeshes??256;
 const generation=options.sceneGeneration,provenance=options.provenance,sidedness=options.sidedness;
 if(![maxModels,maxVertices,maxFaces,maxText,maxMeshes].every(positive)||maxModels<handles.length
  ||!Number.isSafeInteger(generation)||generation<0||typeof provenance!=='string'||!provenance||provenance.length>maxText
  ||!['front','back','double'].includes(sidedness)||!Array.isArray(weapons?.meshes)||weapons.meshes.length>maxMeshes)throw Error('Invalid local weapon inventory bounds');
 const geometry=new Map<string,{positions:OriginalReceiverRayModel['positions'];faces:OriginalReceiverRayModel['faces']}>();
 const selected:ReceiverWeaponGeometry['meshes']=[];let vertices=0,faces=0;
 for(const handle of handles){
  const resource=ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES[handle];let match:ReceiverWeaponGeometry['meshes'][number]|undefined;
  for(const mesh of weapons.meshes)if(mesh?.resource===resource){if(match)throw Error('Duplicate local weapon resource');match=mesh;}
  if(!match||!Array.isArray(match.positions)||!match.positions.length||!Array.isArray(match.faces)||!match.faces.length)throw Error(`Missing local weapon resource: ${resource}`);
  vertices+=match.positions.length;faces+=match.faces.length;
  if(!Number.isSafeInteger(vertices)||!Number.isSafeInteger(faces)||vertices>maxVertices||faces>maxFaces)throw Error('Local weapon geometry budget exceeded');
  for(const p of match.positions)if(!Array.isArray(p)||p.length!==3||![p[0],p[1],p[2]].every(Number.isFinite))throw Error('Invalid local weapon vertex');
  for(const f of match.faces)if(!Array.isArray(f)||f.length!==3||![f[0],f[1],f[2]].every(i=>Number.isSafeInteger(i)&&i>=0&&i<match!.positions.length))throw Error('Invalid local weapon face');
  selected.push(match);
 }
 for(const mesh of selected)geometry.set(mesh.resource,Object.freeze({positions:Object.freeze(mesh.positions.map(p=>Object.freeze([p[0],p[1],p[2]]))),faces:Object.freeze(mesh.faces.map(f=>Object.freeze([f[0],f[1],f[2]])))}));
 return Object.freeze({snapshotAt:(prefix:ReceiverScenePrefix,capture:ReceiverLocalWeaponCapture)=>{
  validateReceiverScenePrefix(prefix);validateReceiverScenePrefix(capture.prefix);
  if(prefix.sceneGeneration!==generation||!sameReceiverScenePrefix(prefix,capture.prefix))throw Error('Local weapon inventory prefix mismatch');
  if(!Array.isArray(capture.models)||capture.models.length>maxModels||capture.models.length>handles.length
   ||typeof capture.loadedRocket!=='boolean'||typeof capture.cameraHandle!=='string'||!capture.cameraHandle||['smokes','gsmokes'].includes(capture.cameraHandle.trim().toLowerCase())
   ||capture.selectedWeapon!==null&&!weaponIds.includes(capture.selectedWeapon))throw Error('Invalid local weapon capture');
  let text=provenance.length+capture.cameraHandle.length+(capture.selectedWeapon?.length??0);const seen=new Set<string>();
  // Validate the entire capture before copying/publishing any geometry record.
  for(const item of capture.models){
   if(!item||!handles.includes(item.handle)||seen.has(item.handle)||item.resource!==ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES[item.handle as ReceiverLocalWeaponHandle]
    ||typeof item.inWorld!=='boolean'||!affine(item.worldMatrix)||!Array.isArray(item.groupAncestry)||item.groupAncestry.length>maxModels)throw Error('Invalid local weapon ownership capture');
   seen.add(item.handle);text+=item.handle.length+item.resource.length;
   for(const name of item.groupAncestry){if(typeof name!=='string'||!name||['smokes','gsmokes'].includes(name.trim().toLowerCase()))throw Error('Invalid local weapon ancestry');text+=name.length;}
   if(!Number.isSafeInteger(text)||text>maxText)throw Error('Local weapon text budget exceeded');
  }
  const missing=handles.filter(handle=>!seen.has(handle)).map(handle=>`local-weapon-state:${handle}`);
  for(const label of missing)text+=label.length;
  if(!Number.isSafeInteger(text)||text>maxText)throw Error('Local weapon text budget exceeded');
  const models:ReceiverModelEntry[]=[],triangles:OriginalReceiverRayModel[]=[],lookup=new Map<string,OriginalReceiverRayModel>();
  for(const item of capture.models){
   const worldMatrix=Object.freeze([...item.worldMatrix]),ancestry=Object.freeze([...item.groupAncestry]),g=geometry.get(item.resource)!;
   const ray=Object.freeze({handle:item.handle,layer:'local-weapon' as const,inWorld:item.inWorld,groupAncestry:ancestry,geometryProvenance:provenance,positions:g.positions,faces:g.faces,worldMatrix,sidedness});
   triangles.push(ray);lookup.set(item.handle,ray);
   models.push(Object.freeze({handle:item.handle,name:item.handle,resource:item.resource,kind:'local-weapon' as const,group:'scene' as const,inWorld:item.inWorld,worldMatrix,geometryProvenance:provenance,
    pose:Object.freeze({position:Object.freeze({x:worldMatrix[12],y:worldMatrix[13],z:worldMatrix[14]}),yaw:0,phase:0,scale:1})}));
  }
  return Object.freeze({scope:'local-camera-weapons-only' as const,prefix:frozenPrefix(prefix),models:Object.freeze(models),triangles:Object.freeze(triangles),
   missing:Object.freeze(missing),provenance,selectedWeapon:capture.selectedWeapon,loadedRocket:capture.loadedRocket,cameraHandle:capture.cameraHandle,
   resolveModel:(handle:string)=>{const value=lookup.get(handle);if(!value)throw Error('Unknown local weapon inventory model');return value;}});
 }});
}
