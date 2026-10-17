import {validateOriginalReceiverActorRegistrySnapshot,type ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import type {OriginalReceiverPrivateInventory,ReceiverPrivateInventoryCapture} from './originalReceiverPrivateInventory';
import type {createOriginalReceiverSkyInventory} from './originalReceiverSkyInventory';
import type {createOriginalReceiverLocalWeaponInventory} from './originalReceiverLocalWeaponInventory';
import type {createOriginalReceiverProjectileInventory} from './originalReceiverProjectileInventory';
import type {createOriginalReceiverTransientInventory} from './originalReceiverTransientInventory';
import type {ReceiverModelEntry} from './originalReceiverModelWorld';
import type {OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

type SkyInventory=ReturnType<typeof createOriginalReceiverSkyInventory>;
type LocalInventory=ReturnType<typeof createOriginalReceiverLocalWeaponInventory>;
type ProjectileInventory=ReturnType<typeof createOriginalReceiverProjectileInventory>;
type TransientInventory=ReturnType<typeof createOriginalReceiverTransientInventory>;
export interface ReceiverSceneInventoryOptions {
 readonly sceneGeneration:number;readonly provenance:string;
 readonly maxModels:number;readonly maxVertices:number;readonly maxFaces:number;readonly maxTextChars?:number;
 readonly sky?:SkyInventory;readonly localWeapons?:LocalInventory;
 readonly projectiles?:ProjectileInventory;readonly transients?:TransientInventory;
}
export interface ReceiverSceneInventoryCapture {
 readonly prefix:ReceiverScenePrefix;
 /** Exact staged ownership audit; owned GI/gun remain inside ModelWorld. */
 readonly actorRegistry?:ReceiverActorRegistrySnapshot;
 readonly imported:ReceiverPrivateInventoryCapture;
 readonly localWeapons?:Parameters<LocalInventory['snapshotAt']>[1];
 readonly projectiles?:Parameters<ProjectileInventory['snapshotAt']>[1];
 readonly transients?:Parameters<TransientInventory['snapshotAt']>[1];
}
export interface ReceiverSceneInventorySnapshot {
 readonly scope:'private-scene-subset';readonly prefix:ReceiverScenePrefix;
 readonly models:readonly ReceiverModelEntry[];readonly triangles:readonly OriginalReceiverRayModel[];
 readonly missing:readonly string[];readonly provenance:string;
 resolveModel(handle:string):OriginalReceiverRayModel;
}
interface Component {
 readonly prefix:ReceiverScenePrefix;readonly models:readonly ReceiverModelEntry[];
 readonly triangles:readonly OriginalReceiverRayModel[];readonly missing:readonly string[];
 readonly provenance:string;
}

/** CURRENT private inventory composition, not native history reconstruction.
 * Resource providers share a caller-established world/basis binding. Only the
 * independently supplied classes can discharge their exact missing labels.
 * The actor ledger and every detailed unresolved input remain separate evidence.
 * Snapshots retain borrowed immutable resources and bounded copied references.
 */
export function createOriginalReceiverSceneInventory(
 imported:OriginalReceiverPrivateInventory,options:ReceiverSceneInventoryOptions,
):{snapshotAt(prefix:ReceiverScenePrefix,capture:ReceiverSceneInventoryCapture):ReceiverSceneInventorySnapshot} {
 const maxText=options.maxTextChars??131072;
 if(!Number.isSafeInteger(options.sceneGeneration)||options.sceneGeneration<0
  ||![options.maxModels,options.maxVertices,options.maxFaces,maxText].every(n=>Number.isSafeInteger(n)&&n>0)
  ||typeof options.provenance!=='string'||!options.provenance||options.provenance.length>maxText)throw Error('Invalid composed receiver inventory bounds');
 const generation=options.sceneGeneration,provenance=options.provenance;
 const maxModels=options.maxModels,maxVertices=options.maxVertices,maxFaces=options.maxFaces;
 const sky=options.sky,local=options.localWeapons;
 const projectiles=options.projectiles,transients=options.transients;
 return Object.freeze({snapshotAt:(prefix:ReceiverScenePrefix,capture:ReceiverSceneInventoryCapture)=>{
  validateReceiverScenePrefix(prefix);validateReceiverScenePrefix(capture.prefix);
  if(prefix.sceneGeneration!==generation||!sameReceiverScenePrefix(prefix,capture.prefix))throw Error('Composed receiver prefix mismatch');
  if(capture.localWeapons&&!local)throw Error('Local receiver weapon provider unavailable');
  if(capture.projectiles&&!projectiles)throw Error('Receiver projectile provider unavailable');
  if(capture.transients&&!transients)throw Error('Receiver transient provider unavailable');
  const base=imported.snapshotAt(prefix,capture.imported);
  const skySnapshot=sky?.snapshotAt(prefix,{prefix});
  const localSnapshot=local&&capture.localWeapons?local.snapshotAt(prefix,capture.localWeapons):undefined;
  const projectileSnapshot=projectiles&&capture.projectiles?projectiles.snapshotAt(prefix,capture.projectiles):undefined;
  const transientSnapshot=transients&&capture.transients?transients.snapshotAt(prefix,capture.transients):undefined;
  const components:readonly Component[]=[base,...(skySnapshot?[skySnapshot]:[]),...(localSnapshot?[localSnapshot]:[]),
   ...(projectileSnapshot?[projectileSnapshot]:[]),...(transientSnapshot?[transientSnapshot]:[])];
  const discharged=new Set<string>();
  if(capture.actorRegistry){
   validateOriginalReceiverActorRegistrySnapshot(capture.actorRegistry,{maxModels,maxTextChars:maxText});
   if(!capture.actorRegistry.prefix||!sameReceiverScenePrefix(prefix,capture.actorRegistry.prefix))throw Error('Composed receiver actor registry prefix mismatch');
   discharged.add('actor-ledger');
  }
  if(skySnapshot&&!skySnapshot.missing.length)discharged.add('sky');
  if(localSnapshot&&!localSnapshot.missing.length)discharged.add('local-camera-weapon');
  if(projectileSnapshot&&!projectileSnapshot.missing.length)discharged.add('projectile');
  if(transientSnapshot&&!transientSnapshot.missing.length)discharged.add('transient');
  let modelCount=0,vertices=0,faces=0,text=provenance.length;
  const missing:string[]=[],handles=new Set<string>();
  // Validate all component identities and combined bounds before materializing
  // merged arrays. Missing evidence is never derived from successful resolution.
  for(const component of components){
   if(!sameReceiverScenePrefix(prefix,component.prefix)||!component.provenance)throw Error('Composed receiver component prefix mismatch');
   if(component.models.length!==component.triangles.length)throw Error('Composed receiver geometry identity mismatch');
   modelCount+=component.models.length;
   if(!Number.isSafeInteger(modelCount)||modelCount>maxModels)throw Error('Composed receiver model budget exceeded');
   for(let i=0;i<component.models.length;i++){
    const entry=component.models[i],ray=component.triangles[i],key=entry.handle.toLowerCase();
    if(!key||handles.has(key)||ray.handle!==entry.handle||ray.inWorld!==entry.inWorld||ray.geometryProvenance!==entry.geometryProvenance
     ||!entry.worldMatrix||entry.worldMatrix.length!==16||ray.worldMatrix.length!==16
     ||entry.worldMatrix.some((value,index)=>value!==ray.worldMatrix[index]))throw Error('Composed receiver model identity mismatch');
    handles.add(key);vertices+=ray.positions.length;faces+=ray.faces.length;
    text+=entry.handle.length+entry.resource.length+entry.geometryProvenance.length;
    for(const group of ray.groupAncestry)text+=group.length;
    if(!Number.isSafeInteger(vertices)||vertices>maxVertices||!Number.isSafeInteger(faces)||faces>maxFaces)throw Error('Composed receiver geometry budget exceeded');
   }
   for(const value of component.missing){
    if(typeof value!=='string')throw Error('Invalid composed receiver missing evidence');
    if(component!==base||!discharged.has(value))missing.push(value);
    text+=value.length;
   }
   text+=component.provenance.length;
   if(text>maxText)throw Error('Composed receiver text budget exceeded');
  }
  const models=Object.freeze(components.flatMap(component=>[...component.models]));
  const triangles=Object.freeze(components.flatMap(component=>[...component.triangles]));
  const lookup=new Map(triangles.map(model=>[model.handle,model]));
  const frozenPrefix:ReceiverScenePrefix=Object.freeze(prefix.kind==='receipt'
   ?{kind:'receipt',sceneGeneration:generation,callback:prefix.callback,tick:prefix.tick}
   :{kind:'callback',sceneGeneration:generation,callback:prefix.callback});
  return Object.freeze({scope:'private-scene-subset' as const,prefix:frozenPrefix,models,triangles,
   missing:Object.freeze([...new Set(missing)]),provenance,
   resolveModel:(handle:string)=>{const model=lookup.get(handle);if(!model)throw Error('Unknown composed receiver model');return model;}});
 }});
}
