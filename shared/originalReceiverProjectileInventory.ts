import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverModelEntry} from './originalReceiverModelWorld';
import type {OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

export type ReceiverProjectileResource='rg6grenade'|'rpgrocket';
export interface ReceiverProjectileModelCapture {
 readonly handle:string;readonly resource:ReceiverProjectileResource;readonly inWorld:boolean;
 /** Full RAW resource-local to WORLD matrix, including unit conversion once. */
 readonly worldMatrix:readonly number[];readonly groupAncestry:readonly string[];
}
export interface ReceiverProjectileInventoryCapture {
 /** Independently inventoried CURRENT receiver prefix, not physics/body IDs.
  * Expected handles include offworld pooled models and the grenade template. */
 readonly prefix:ReceiverScenePrefix;readonly expectedHandles:readonly string[];
 readonly models:readonly ReceiverProjectileModelCapture[];
}
export interface ReceiverProjectileInventoryOptions {
 readonly sceneGeneration:number;readonly provenance:string;
 readonly sidedness:'front'|'back'|'double';
 readonly maxModels:number;readonly maxVertices:number;readonly maxFaces:number;readonly maxTextChars?:number;readonly maxMeshes?:number;
}
export interface ReceiverProjectileInventorySnapshot {
 readonly scope:'private-projectile-subset';readonly prefix:ReceiverScenePrefix;
 readonly models:readonly ReceiverModelEntry[];readonly triangles:readonly OriginalReceiverRayModel[];
 readonly missing:readonly string[];readonly provenance:string;
}
export interface OriginalReceiverProjectileInventory {
 snapshotAt(prefix:ReceiverScenePrefix,capture:ReceiverProjectileInventoryCapture):ReceiverProjectileInventorySnapshot;
}
const resources=['rg6grenade','rpgrocket'] as const;
const localNames=new Set(['pistol','spas12','ak47','rg6','rpg','dragunov','rocket']);
const folded=(value:string)=>value.toLowerCase();
const validHandle=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.trim()===value;
const affine=(value:readonly number[])=>Array.isArray(value)&&value.length===16&&value.every(Number.isFinite)&&value[3]===0&&value[7]===0&&value[11]===0&&value[15]===1;

/** Rigid decoded triangle resources, not Havok convex/support proxies. Names,
 * prefix chronology, model membership and full transforms are caller inputs.
 * No native clone naming/orientation is inferred. The offworld grenade template
 * belongs here; loaded 'rocket' and six local guns belong to local weaponry.
 * Resource arrays are immutable/shared; no mutable body or pose history retained.
 */
export function createOriginalReceiverProjectileInventory(weapons:ReceiverWeaponGeometry,options:ReceiverProjectileInventoryOptions):OriginalReceiverProjectileInventory {
 const maxText=options.maxTextChars??131072,maxMeshes=options.maxMeshes??256;
 if(!Number.isSafeInteger(options.sceneGeneration)||options.sceneGeneration<0||typeof options.provenance!=='string'||!options.provenance
  ||!['front','back','double'].includes(options.sidedness)||!Number.isSafeInteger(maxText)||maxText<1||!Number.isSafeInteger(maxMeshes)||maxMeshes<1
  ||![options.maxModels,options.maxVertices,options.maxFaces].every(value=>Number.isSafeInteger(value)&&value>0)
  ||!Array.isArray(weapons?.meshes)||weapons.meshes.length>maxMeshes)throw Error('Invalid receiver projectile inventory options');
 if(options.provenance.length>maxText)throw Error('Receiver projectile text budget exceeded');
 const found=new Map<ReceiverProjectileResource,ReceiverWeaponGeometry['meshes'][number]>();
 // Length admission occurs before touching any resource entry. One bounded
 // pass keeps at most two pointers and never allocates duplicate match lists.
 for(const mesh of weapons.meshes as ReceiverWeaponGeometry['meshes']){
  if(mesh?.resource!=='rg6grenade'&&mesh?.resource!=='rpgrocket')continue;
  if(found.has(mesh.resource))throw Error('Missing or duplicate receiver projectile resource');found.set(mesh.resource,mesh);
 }
 let vertices=0,faces=0;
 const selected=resources.map(resource=>{
  const mesh=found.get(resource);if(!mesh)throw Error('Missing or duplicate receiver projectile resource');
  if(!Array.isArray(mesh.positions)||!mesh.positions.length||!Array.isArray(mesh.faces)||!mesh.faces.length)throw Error('Invalid receiver projectile resource');
  vertices+=mesh.positions.length;faces+=mesh.faces.length;
  if(!Number.isSafeInteger(vertices)||!Number.isSafeInteger(faces)||vertices>options.maxVertices||faces>options.maxFaces)throw Error('Receiver projectile resource budget exceeded');
  for(const point of mesh.positions)if(!Array.isArray(point)||point.length!==3||![...point].every(Number.isFinite))throw Error('Invalid receiver projectile vertex');
  for(const face of mesh.faces)if(!Array.isArray(face)||face.length!==3||![...face].every(value=>Number.isSafeInteger(value)&&value>=0&&value<mesh.positions.length))throw Error('Invalid receiver projectile face');
  return mesh;
 });
 // Aggregate/topology preflight completes before copying either resource.
 const geometry=new Map(selected.map(mesh=>[mesh.resource,Object.freeze({positions:Object.freeze(mesh.positions.map(point=>Object.freeze([...point]))),faces:Object.freeze(mesh.faces.map(face=>Object.freeze([...face])))})]));
 const generation=options.sceneGeneration,provenance=options.provenance,sidedness=options.sidedness;
 const maxModels=options.maxModels,maxVertices=options.maxVertices,maxFaces=options.maxFaces;
 return Object.freeze({snapshotAt:(prefix:ReceiverScenePrefix,capture:ReceiverProjectileInventoryCapture)=>{
  validateReceiverScenePrefix(prefix);validateReceiverScenePrefix(capture.prefix);
  if(prefix.sceneGeneration!==generation||!sameReceiverScenePrefix(prefix,capture.prefix))throw Error('Receiver projectile prefix mismatch');
  if(!Array.isArray(capture.expectedHandles)||!Array.isArray(capture.models)||capture.expectedHandles.length>maxModels||capture.models.length>maxModels)throw Error('Receiver projectile model budget exceeded');
  let text=provenance.length,instanceVertices=0,instanceFaces=0;
  const expected=new Set<string>(),foldedExpected=new Set<string>(),seen=new Set<string>(),foldedSeen=new Set<string>();
  const checkText=(amount:number)=>{text+=amount;if(text>maxText)throw Error('Receiver projectile text budget exceeded');};
  for(const handle of capture.expectedHandles){
   if(!validHandle(handle)||localNames.has(folded(handle))||foldedExpected.has(folded(handle)))throw Error('Invalid receiver projectile expected identity');
   checkText(handle.length);expected.add(handle);foldedExpected.add(folded(handle));
  }
  // Validate complete submitted shape and instance totals before copying poses.
  for(const model of capture.models as readonly ReceiverProjectileModelCapture[]){
   if(!model||!validHandle(model.handle)||localNames.has(folded(model.handle))||foldedSeen.has(folded(model.handle))||!expected.has(model.handle)
    ||!resources.includes(model.resource)||typeof model.inWorld!=='boolean'||!affine(model.worldMatrix)
    ||!Array.isArray(model.groupAncestry)||model.groupAncestry.length>maxModels||model.groupAncestry.some((group:string)=>typeof group!=='string'||!group))throw Error('Invalid receiver projectile model capture');
   if(folded(model.handle)==='grenade'&&(model.handle!=='grenade'||model.resource!=='rg6grenade'))throw Error('Invalid receiver grenade template');
   seen.add(model.handle);foldedSeen.add(folded(model.handle));checkText(model.handle.length+model.resource.length);
   for(const group of model.groupAncestry)checkText(group.length);
   const mesh=geometry.get(model.resource)!;instanceVertices+=mesh.positions.length;instanceFaces+=mesh.faces.length;
   if(!Number.isSafeInteger(instanceVertices)||!Number.isSafeInteger(instanceFaces)||instanceVertices>maxVertices||instanceFaces>maxFaces)throw Error('Receiver projectile instance budget exceeded');
   // Validate final transformed points without materializing a posed geometry.
   const m=model.worldMatrix;
   for(const point of mesh.positions)if(![m[0]*point[0]+m[4]*point[1]+m[8]*point[2]+m[12],m[1]*point[0]+m[5]*point[1]+m[9]*point[2]+m[13],m[2]*point[0]+m[6]*point[1]+m[10]*point[2]+m[14]].every(Number.isFinite))throw Error('Receiver projectile transform overflow');
  }
  const missing:string[]=[];
  if(!expected.has('grenade'))missing.push('projectile-template-coverage:grenade');
  if(!seen.has('grenade'))missing.push('missing-projectile-template:grenade');
  for(const handle of expected)if(!seen.has(handle))missing.push(`missing-projectile-model:${handle}`);
  for(const value of missing)checkText(value.length);
  const models:ReceiverModelEntry[]=[],triangles:OriginalReceiverRayModel[]=[];
  for(const captureModel of capture.models as readonly ReceiverProjectileModelCapture[]){
   const mesh=geometry.get(captureModel.resource)!,worldMatrix=Object.freeze([...captureModel.worldMatrix]),groupAncestry=Object.freeze([...captureModel.groupAncestry]);
   const model:ReceiverModelEntry=Object.freeze({handle:captureModel.handle,name:captureModel.handle,resource:captureModel.resource,kind:'projectile',group:groupAncestry.some(group=>['smokes','gsmokes'].includes(folded(group)))?'gsmokes':'scene',inWorld:captureModel.inWorld,geometryProvenance:provenance,worldMatrix,
    pose:Object.freeze({position:Object.freeze({x:worldMatrix[12],y:worldMatrix[13],z:worldMatrix[14]}),yaw:0,phase:0,scale:1})});
   models.push(model);triangles.push(Object.freeze({handle:model.handle,layer:'projectile',inWorld:model.inWorld,groupAncestry,geometryProvenance:provenance,positions:mesh.positions,faces:mesh.faces,worldMatrix,sidedness}));
  }
  const frozenPrefix:ReceiverScenePrefix=Object.freeze(prefix.kind==='receipt'?{kind:'receipt',sceneGeneration:generation,callback:prefix.callback,tick:prefix.tick}:{kind:'callback',sceneGeneration:generation,callback:prefix.callback});
  return Object.freeze({scope:'private-projectile-subset' as const,prefix:frozenPrefix,models:Object.freeze(models),triangles:Object.freeze(triangles),missing:Object.freeze(missing),provenance});
 }});
}
