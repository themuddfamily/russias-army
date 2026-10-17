import type {OriginalReceiverTransientResources} from './originalReceiverTransientResources';
import type {ReceiverModelEntry,ReceiverModelPose} from './originalReceiverModelWorld';
import type {OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

export const ORIGINAL_RECEIVER_MUZZLE_TEMPLATES=Object.freeze(['mfpistol','mfspas12','mfak47','mfdragunov'] as const);
export type ReceiverMuzzleTemplateHandle=typeof ORIGINAL_RECEIVER_MUZZLE_TEMPLATES[number];
export interface ReceiverTransientTemplateCapture {
 readonly handle:ReceiverMuzzleTemplateHandle;readonly resource:string;
 readonly worldMatrix:readonly number[];readonly inWorld:boolean;
 readonly group:'scene'|'gsmokes';readonly groupAncestry:readonly string[];
}
export interface ReceiverTransientInventoryCapture {
 readonly prefix:ReceiverScenePrefix;
 readonly templates:readonly ReceiverTransientTemplateCapture[];
 /** Actual staged/committed ledger clones, including offworld retained pools. */
 readonly models:readonly Readonly<ReceiverModelEntry>[];
 /** Independent inventory evidence, not reconstructed from successful resolve. */
 readonly expectedHandles:readonly string[];
 /** Explicit gaps in actor/resource support, including unsupported barrel bangs.
  * Empty is a trusted closed-fixture/current-source attestation, not inference. */
 readonly unresolved:readonly string[];readonly planeWidthWorld:number|null;
}
export interface ReceiverTransientInventoryOptions {
 readonly sceneGeneration:number;readonly maxModels:number;readonly maxVertices:number;readonly maxFaces:number;
 readonly provenance:string;readonly maxTextChars?:number;
}
export interface ReceiverTransientInventorySnapshot {
 readonly scope:'receiver-transients-only';readonly prefix:ReceiverScenePrefix;
 readonly models:readonly ReceiverModelEntry[];readonly triangles:readonly OriginalReceiverRayModel[];
 readonly missing:readonly string[];readonly provenance:string;
 resolveModel(handle:string):OriginalReceiverRayModel;
}
export interface OriginalReceiverTransientInventory {
 snapshotAt(prefix:ReceiverScenePrefix,capture:ReceiverTransientInventoryCapture):ReceiverTransientInventorySnapshot;
}
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
const point=(p:ReceiverModelPose['position'])=>({x:p.x,y:p.y,z:p.z});
const poseCopy=(p:ReceiverModelPose):ReceiverModelPose=>({position:point(p.position),yaw:p.yaw,phase:p.phase,scale:p.scale,...(p.rotation?{rotation:{x:p.rotation.x,y:p.rotation.y,z:p.rotation.z,w:p.rotation.w}}:{})});
function poseValid(p:ReceiverModelPose):boolean {
 if(!p?.position||![p.position.x,p.position.y,p.position.z,p.yaw,p.phase,p.scale].every(Number.isFinite)||p.phase<0||p.scale<=0)return false;
 return !p.rotation||[p.rotation.x,p.rotation.y,p.rotation.z,p.rotation.w].every(Number.isFinite)&&Math.abs(Math.hypot(p.rotation.x,p.rotation.y,p.rotation.z,p.rotation.w)-1)<=1e-6;
}
function affine(m:readonly number[]):boolean {if(!Array.isArray(m)||m.length!==16)return false;for(let i=0;i<16;i++)if(!Number.isFinite(m[i]))return false;return m[3]===0&&m[7]===0&&m[11]===0&&m[15]===1;}
const prefixCopy=(p:ReceiverScenePrefix):ReceiverScenePrefix=>p.kind==='receipt'?Object.freeze({sceneGeneration:p.sceneGeneration,callback:p.callback,kind:'receipt',tick:p.tick}):Object.freeze({sceneGeneration:p.sceneGeneration,callback:p.callback,kind:'callback'});

/** CURRENT owned FX geometry only. Decoding/scaling is delegated to the
 * existing generation's TransientResources; this adapter copies inventory and
 * explicit template transforms. It never births/ages FX or publishes effects.
 * Native offworld template pose/parent and clone state are caller evidence.
 * Barrel recurrence requires a retained shader or explicit fresh shader seed;
 * unresolved evidence must preserve missing lifecycle/resource inputs rather
 * than declaring native defaults or event coverage from resolved geometry. */
export function createOriginalReceiverTransientInventory(resources:OriginalReceiverTransientResources,options:ReceiverTransientInventoryOptions):OriginalReceiverTransientInventory {
 const generation=options.sceneGeneration,maxModels=options.maxModels,maxVertices=options.maxVertices,maxFaces=options.maxFaces,maxText=options.maxTextChars??65536,provenance=options.provenance;
 if(!Number.isSafeInteger(generation)||generation<0||![maxModels,maxVertices,maxFaces,maxText].every(positive)||maxModels<4||typeof provenance!=='string'||!provenance||provenance.length>maxText)throw Error('Invalid transient inventory bounds');
 return Object.freeze({snapshotAt:(prefix:ReceiverScenePrefix,capture:ReceiverTransientInventoryCapture)=>{
  validateReceiverScenePrefix(prefix);validateReceiverScenePrefix(capture.prefix);
  if(prefix.sceneGeneration!==generation||!sameReceiverScenePrefix(prefix,capture.prefix))throw Error('Transient inventory prefix mismatch');
  if(!Array.isArray(capture.templates)||capture.templates.length>4||!Array.isArray(capture.models)||capture.templates.length+capture.models.length>maxModels
   ||!Array.isArray(capture.expectedHandles)||capture.expectedHandles.length>maxModels||!Array.isArray(capture.unresolved)||capture.unresolved.length>maxModels
   ||capture.planeWidthWorld!==null&&(!Number.isFinite(capture.planeWidthWorld)||capture.planeWidthWorld<=0))throw Error('Invalid transient inventory capture budget');
  let text=provenance.length;const expected=new Set<string>(),seen=new Set<string>(),templates=new Set<string>(),missing:string[]=[];
  const addText=(value:string)=>{if(typeof value!=='string'||!value)throw Error('Invalid transient inventory text');text+=value.length;if(!Number.isSafeInteger(text)||text>maxText)throw Error('Transient inventory text budget exceeded');};
  for(const name of capture.expectedHandles){addText(name);if(expected.has(name))throw Error('Duplicate expected transient handle');expected.add(name);}
  for(const gap of capture.unresolved){addText(gap);missing.push(gap);}
  const records:Array<{model:ReceiverModelEntry;ancestry:readonly string[];template:boolean}>=[];
  for(const item of capture.templates){
   if(!item||!ORIGINAL_RECEIVER_MUZZLE_TEMPLATES.includes(item.handle)||item.resource!==item.handle||seen.has(item.handle)
    ||typeof item.inWorld!=='boolean'||!['scene','gsmokes'].includes(item.group)||!affine(item.worldMatrix)||!Array.isArray(item.groupAncestry)||item.groupAncestry.length>maxModels)throw Error('Invalid transient template ownership');
   addText(item.handle);addText(item.resource);for(const name of item.groupAncestry)addText(name);
   const smokeParent=item.groupAncestry.some((name:string)=>['smokes','gsmokes'].includes(name.toLowerCase()));
   if((item.group==='gsmokes')!==smokeParent)throw Error('Transient template group ancestry mismatch');
   if(!expected.has(item.handle))throw Error('Unattested transient handle');seen.add(item.handle);templates.add(item.handle);
   const model:ReceiverModelEntry={handle:item.handle,name:item.handle,resource:item.resource,kind:'transient',group:item.group,inWorld:item.inWorld,worldMatrix:Object.freeze([...item.worldMatrix]),geometryProvenance:provenance,pose:{position:{x:item.worldMatrix[12],y:item.worldMatrix[13],z:item.worldMatrix[14]},yaw:0,phase:0,scale:1}};
   records.push({model,ancestry:Object.freeze([...item.groupAncestry]),template:true});
  }
  for(const model of capture.models){
   if(!model||model.kind!=='transient'||model.group!=='gsmokes'||seen.has(model.handle)||ORIGINAL_RECEIVER_MUZZLE_TEMPLATES.some(name=>name===model.handle)
    ||typeof model.inWorld!=='boolean'||!poseValid(model.pose)||model.worldMatrix!==undefined&&!affine(model.worldMatrix))throw Error('Invalid owned transient model');
   addText(model.handle);addText(model.name);addText(model.resource);addText(model.geometryProvenance);if(!expected.has(model.handle))throw Error('Unattested transient handle');seen.add(model.handle);
   records.push({model:{handle:model.handle,name:model.name,resource:model.resource,kind:'transient',group:'gsmokes',inWorld:model.inWorld,pose:poseCopy(model.pose),geometryProvenance:model.geometryProvenance,...(model.worldMatrix?{worldMatrix:Object.freeze([...model.worldMatrix])}:{})},ancestry:Object.freeze(['gsmokes']),template:false});
  }
  for(const handle of ORIGINAL_RECEIVER_MUZZLE_TEMPLATES){if(!expected.has(handle))missing.push(`transient-template-evidence:${handle}`);if(!templates.has(handle))missing.push(`transient-template-state:${handle}`);}
  for(const handle of expected)if(!seen.has(handle))missing.push(`transient-state:${handle}`);
  let vertices=0,faces=0;const resolved:Array<{model:ReceiverModelEntry;ray:OriginalReceiverRayModel}>=[];
  for(const record of records){
   if(record.model.resource!=='plane'&&!ORIGINAL_RECEIVER_MUZZLE_TEMPLATES.some(name=>name===record.model.resource)){missing.push(`transient-geometry:${record.model.handle}`);continue;}
   if(record.model.resource==='plane'&&capture.planeWidthWorld===null){missing.push(`transient-plane-width:${record.model.handle}`);continue;}
   // The existing resolver requires actor gsmokes identity. Templates use its
   // decoded geometry/matrix only; explicit capture ancestry/group is restored.
   const ray=resources.resolve(record.template?{...record.model,group:'gsmokes'}:record.model,capture.planeWidthWorld??undefined);
   vertices+=ray.positions.length;faces+=ray.faces.length;if(!Number.isSafeInteger(vertices)||!Number.isSafeInteger(faces)||vertices>maxVertices||faces>maxFaces)throw Error('Transient inventory geometry budget exceeded');
   resolved.push({model:record.model,ray:Object.freeze({...ray,groupAncestry:record.ancestry})});
  }
  for(const gap of missing)addText(gap);
  const models:ReceiverModelEntry[]=[],triangles:OriginalReceiverRayModel[]=[],lookup=new Map<string,OriginalReceiverRayModel>();
  for(const {model,ray} of resolved){const p=poseCopy(model.pose);models.push(Object.freeze({...model,worldMatrix:ray.worldMatrix,pose:Object.freeze({...p,position:Object.freeze(p.position),...(p.rotation?{rotation:Object.freeze(p.rotation)}:{})})}));triangles.push(ray);lookup.set(ray.handle,ray);}
  return Object.freeze({scope:'receiver-transients-only' as const,prefix:prefixCopy(prefix),models:Object.freeze(models),triangles:Object.freeze(triangles),missing:Object.freeze([...new Set(missing)]),provenance,
   resolveModel:(handle:string)=>{const value=lookup.get(handle);if(!value)throw Error('Unknown transient inventory model');return value;}});
 }});
}
