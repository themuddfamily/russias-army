import type {OriginalSceneData} from './originalSceneGeometry';
import type {OriginalSkyDescription} from './originalSkyRay';
import {createOriginalReceiverImportedScene,type OriginalReceiverImportedScene} from './originalReceiverImportedScene';
import {createOriginalReceiverPrivateInventory} from './originalReceiverPrivateInventory';
import {createOriginalReceiverSkyInventory} from './originalReceiverSkyInventory';
import {createOriginalReceiverLocalWeaponInventory} from './originalReceiverLocalWeaponInventory';
import {createOriginalReceiverProjectileInventory} from './originalReceiverProjectileInventory';
import {createOriginalReceiverTransientInventory,type ReceiverTransientTemplateCapture} from './originalReceiverTransientInventory';
import {createOriginalReceiverSceneInventory,type ReceiverSceneInventorySnapshot} from './originalReceiverSceneInventory';
import type {OriginalReceiverActorResources,ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {OriginalReceiverTransientResources} from './originalReceiverTransientResources';
import {validateOriginalReceiverActorRegistrySnapshot,type ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import {createOriginalReceiverGeometryQuery,createOriginalReceiverGeometryBackend,type OriginalReceiverGeometryQuery,type OriginalReceiverGeometryBackendOptions} from './originalReceiverGeometryBackend';
import {ORIGINAL_RECEIVER_SCENE_LAYERS,type OriginalReceiverSceneLayer} from './originalReceiverSceneRay';
import type {ReceiverCurrentEnvironmentState} from './originalReceiverCurrentEnvironment';
import type {ReceiverModelBackend,ReceiverModelEntry} from './originalReceiverModelWorld';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix,type ReceiverExternalSceneSnapshot} from './originalReceiverPrefix';

export interface OriginalSoloReceiverSceneInventoryOptions {
 readonly map:'barrack'|'woodlands';readonly data:OriginalSceneData;
 readonly doorNames:readonly string[];readonly sky:OriginalSkyDescription;
 readonly sourceScale:number;readonly sceneGeneration:number;
 readonly weaponGeometry:ReceiverWeaponGeometry;
 readonly actorResources:Pick<OriginalReceiverActorResources,'resolve'>;
 readonly transientResources:OriginalReceiverTransientResources;
 /** Full RAW-resource WORLD matrices and membership, including offworld
  * templates. Native defaults must not be inferred from available geometry. */
 readonly muzzleTemplates:readonly ReceiverTransientTemplateCapture[];
 /** Independent unresolved resource/lifecycle evidence, not resolve success. */
 readonly transientUnresolved:readonly string[];
 readonly provenance:string;readonly sidedness:'front'|'back'|'double';
 readonly budgets:Readonly<{maxModels:number;maxVertices:number;maxFaces:number;maxTextChars:number;maxMeshes:number}>;
 /** Borrow one immutable map decode across private receiver lives. */
 readonly imported?:OriginalReceiverImportedScene;
}
export interface OriginalSoloReceiverSceneInventory {
 snapshotAt(prefix:ReceiverScenePrefix,state:ReceiverCurrentEnvironmentState,actors:ReceiverActorRegistrySnapshot):ReceiverExternalSceneSnapshot;
 readonly geometryQuery:OriginalReceiverGeometryQuery;
 createGeometryBackend(lifecycle:Omit<ReceiverModelBackend,'nearestDetailedDownward'>):ReceiverModelBackend;
 /** Releases only this composer's current capture, never borrowed resources. */
 dispose():void;
}
interface Current {
 readonly prefix:ReceiverScenePrefix;
 readonly inventory:ReceiverSceneInventorySnapshot;
 readonly external:ReadonlyMap<string,Readonly<ReceiverModelEntry>>;
}
function samePose(a:ReceiverModelEntry['pose'],b:ReceiverModelEntry['pose']):boolean {
 return Object.is(a.position.x,b.position.x)&&Object.is(a.position.y,b.position.y)&&Object.is(a.position.z,b.position.z)
  &&Object.is(a.yaw,b.yaw)&&Object.is(a.phase,b.phase)&&Object.is(a.scale,b.scale)&&!!a.rotation===!!b.rotation
  &&(!a.rotation||!!b.rotation&&Object.is(a.rotation.x,b.rotation.x)&&Object.is(a.rotation.y,b.rotation.y)&&Object.is(a.rotation.z,b.rotation.z)&&Object.is(a.rotation.w,b.rotation.w));
}
function sameMatrix(a:readonly number[]|undefined,b:readonly number[]|undefined):boolean {
 return a===undefined?b===undefined:b!==undefined&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
}
function queryableSceneData(data:OriginalSceneData,maxModels:number,maxResourceParts:number):OriginalSceneData {
 if(!data||!Array.isArray(data.nodes)||data.nodes.length>maxModels||!Array.isArray(data.meshes)||data.meshes.length>maxResourceParts)throw Error('Invalid Solo receiver source node budget');
 const emptyResourceGeometry=data.meshes.some(mesh=>mesh.resource==='');
 const names=new Set<string>(),parents=new Set<string>();
 for(const node of data.nodes){
  if(!node||typeof node.name!=='string'||!node.name||typeof node.parent!=='string')throw Error('Invalid Solo receiver source hierarchy');
  const name=node.name.toLowerCase();if(names.has(name))throw Error('Duplicate Solo receiver source node');names.add(name);parents.add(node.parent.toLowerCase());
 }
 // Both preserved exports contain this exact renderer-only ambient-light leaf.
 // Empty-resource camera/light metadata is skipped by originalScene rendering.
 // Its zero transform cannot participate in a mesh/group hierarchy: only the
 // recovered, unreferenced leaf is omitted from triangle-inventory decoding.
 // All other nodes retain the strict affine decoder contract. In particular,
 // no malformed group or geometry node receives an invented identity matrix.
 const nodes=data.nodes.filter(node=>!(node.name==='UIAmbient'&&node.parent==='World'&&node.resource===''&&node.shader===''&&node.visibility===1
  &&Array.isArray(node.matrix)&&node.matrix.length===16&&node.matrix.every((value:unknown)=>value===0)&&!parents.has(node.name.toLowerCase())&&!emptyResourceGeometry));
 return nodes.length===data.nodes.length?data:Object.freeze({meshes:data.meshes,nodes:Object.freeze(nodes)});
}

/** Complete CURRENT composition of explicitly supplied receiver classes. One
 * synchronous capture replaces its predecessor; there is no history or scene
 * reconstruction. Primitive tessellation, clone matrices, winding and resource
 * bindings remain declared adapters. Successful decode never proves native
 * completeness or discharges independently retained missing evidence. */
export function createOriginalSoloReceiverSceneInventory(input:OriginalSoloReceiverSceneInventoryOptions):OriginalSoloReceiverSceneInventory {
 if(!input)throw Error('Missing Solo receiver inventory options');
 const map=input.map,data=input.data,sourceScale=input.sourceScale,sceneGeneration=input.sceneGeneration,provenance=input.provenance,sidedness=input.sidedness;
 const rawBudgets=input.budgets;
 if(!rawBudgets)throw Error('Missing Solo receiver inventory budgets');
 const budgets=Object.freeze({maxModels:rawBudgets.maxModels,maxVertices:rawBudgets.maxVertices,maxFaces:rawBudgets.maxFaces,maxTextChars:rawBudgets.maxTextChars,maxMeshes:rawBudgets.maxMeshes});
 if(!['barrack','woodlands'].includes(map)||!Number.isFinite(sourceScale)||sourceScale<=0||!Number.isSafeInteger(sceneGeneration)||sceneGeneration<0
  ||typeof provenance!=='string'||!provenance||!['front','back','double'].includes(sidedness)||!Object.values(budgets).every(n=>Number.isSafeInteger(n)&&n>0)||provenance.length>budgets.maxTextChars)throw Error('Invalid Solo receiver inventory options');
 const actorResources=input.actorResources,transientResources=input.transientResources,weaponGeometry=input.weaponGeometry;
 if(!actorResources||typeof actorResources.resolve!=='function'||!transientResources||typeof transientResources.resolve!=='function')throw Error('Missing Solo receiver resource providers');
 const rawTemplates=input.muzzleTemplates,rawUnresolved=input.transientUnresolved,rawDoors=input.doorNames;
 if(!Array.isArray(rawTemplates)||rawTemplates.length>4||!Array.isArray(rawUnresolved)||rawUnresolved.length>budgets.maxModels||!Array.isArray(rawDoors)||rawDoors.length>budgets.maxModels)throw Error('Solo receiver inventory evidence budget exceeded');
 let evidenceText=provenance.length;
 const addText=(value:string)=>{if(typeof value!=='string'||!value)throw Error('Invalid Solo receiver inventory evidence');evidenceText+=value.length;if(evidenceText>budgets.maxTextChars)throw Error('Solo receiver inventory evidence text budget exceeded');return value;};
 const doorNames=Object.freeze(rawDoors.map(addText)),unresolved=Object.freeze(rawUnresolved.map(addText));
 const templates=Object.freeze(rawTemplates.map(raw=>{
  if(!raw||!Array.isArray(raw.worldMatrix)||raw.worldMatrix.length!==16||!Array.isArray(raw.groupAncestry)||raw.groupAncestry.length>budgets.maxModels)throw Error('Invalid Solo receiver muzzle template');
  return Object.freeze({handle:addText(raw.handle) as ReceiverTransientTemplateCapture['handle'],resource:addText(raw.resource),inWorld:raw.inWorld,group:raw.group,worldMatrix:Object.freeze([...raw.worldMatrix]),groupAncestry:Object.freeze(raw.groupAncestry.map(addText))});
 }));
 const common={sceneGeneration,maxModels:budgets.maxModels,maxVertices:budgets.maxVertices,maxFaces:budgets.maxFaces,maxTextChars:budgets.maxTextChars,provenance};
 const queryData=queryableSceneData(data,budgets.maxModels,budgets.maxFaces);
 const imported=input.imported??createOriginalReceiverImportedScene(queryData,{scale:sourceScale,geometryProvenance:provenance,sidedness,maxModels:budgets.maxModels,maxVertices:budgets.maxVertices,maxFaces:budgets.maxFaces});
 const privateInventory=createOriginalReceiverPrivateInventory(imported,queryData,{...common,map,scale:sourceScale,doorNames});
 const sky=createOriginalReceiverSkyInventory(input.sky,{...common,scale:sourceScale});
 const localWeapons=createOriginalReceiverLocalWeaponInventory(weaponGeometry,{...common,sidedness,maxMeshes:budgets.maxMeshes});
 const projectiles=createOriginalReceiverProjectileInventory(weaponGeometry,{...common,sidedness,maxMeshes:budgets.maxMeshes});
 const transients=createOriginalReceiverTransientInventory(transientResources,common);
 const composed=createOriginalReceiverSceneInventory(privateInventory,{...common,sky,localWeapons,projectiles,transients});
 let current:Current|undefined,disposed=false;
 const check=()=>{if(disposed)throw Error('Solo receiver inventory disposed');};
 const capture=(callback:number,prefix?:ReceiverScenePrefix,actors?:ReceiverActorRegistrySnapshot):Current=>{
  check();if(!current||!prefix||!actors||callback!==current.prefix.callback||!sameReceiverScenePrefix(prefix,current.prefix))throw Error('Stale Solo receiver inventory query');
  validateOriginalReceiverActorRegistrySnapshot(actors,{maxModels:budgets.maxModels,maxTextChars:budgets.maxTextChars});
  if(!actors.prefix||!sameReceiverScenePrefix(prefix,actors.prefix))throw Error('Stale Solo receiver actor registry');return current;
 };
 const handles=(actors:ReceiverActorRegistrySnapshot,inventory:ReceiverSceneInventorySnapshot)=>{
  const expected=Object.freeze([...actors.expectedHandles,...inventory.models.map(model=>model.handle)]);
  if(expected.length>budgets.maxModels||new Set(expected.map(handle=>handle.toLowerCase())).size!==expected.length)throw Error('Solo receiver combined model budget or collision');return expected;
 };
 const geometryOptions:OriginalReceiverGeometryBackendOptions={sceneGeneration,provenance,budget:{maxModels:budgets.maxModels,maxVertices:budgets.maxVertices,maxTriangles:budgets.maxFaces},
  coverageAt:(callback,prefix,actors)=>{const c=capture(callback,prefix,actors);return {prefix:c.prefix,sceneGeneration,callback,actorRegistry:actors!,expectedHandles:handles(actors!,c.inventory),accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:c.inventory.missing};},
  resolveModel:(model,callback,prefix,actors)=>{
   const c=capture(callback,prefix,actors);
   if(model.kind==='gi'||model.kind==='gun'){
    if(!actors!.models.some(entry=>entry===model))throw Error('Stale Solo receiver actor model');
    // ModelWorld independently materializes its query registry after external
    // refresh. A constructor may insert GI before that ray; this exact query
    // registry, already checked against its model identities, owns those roles.
    // There is no separate pending-death flag in the canonical registry.
    const layer:OriginalReceiverSceneLayer=model.kind==='gi'
     ?(actors!.constructingGI===model.handle||actors!.actors.some(actor=>actor.gi===model.handle)?'live-gi':'corpse')
     :(actors!.actors.some(actor=>actor.gun===model.handle)?'held-gun':'dropped-gun');
    return actorResources.resolve(model,layer);
   }
   const expected=c.external.get(model.handle);
   if(!expected||expected.name!==model.name||expected.kind!==model.kind||expected.resource!==model.resource||expected.inWorld!==model.inWorld||expected.group!==model.group||expected.geometryProvenance!==model.geometryProvenance
    ||!samePose(expected.pose,model.pose)||!sameMatrix(expected.worldMatrix,model.worldMatrix))throw Error('Stale Solo receiver external model');
   return c.inventory.resolveModel(model.handle);
  }};
 return Object.freeze({
  snapshotAt:(prefix:ReceiverScenePrefix,state:ReceiverCurrentEnvironmentState,actors:ReceiverActorRegistrySnapshot):ReceiverExternalSceneSnapshot=>{
   check();current=undefined;validateReceiverScenePrefix(prefix);
   if(prefix.sceneGeneration!==sceneGeneration||!state||!actors||!state.localWeapons||!state.projectiles||!state.transients)throw Error('Incomplete Solo receiver current capture');
   validateOriginalReceiverActorRegistrySnapshot(actors,{maxModels:budgets.maxModels,maxTextChars:budgets.maxTextChars});
   if(!actors.prefix||!sameReceiverScenePrefix(prefix,actors.prefix)||!sameReceiverScenePrefix(prefix,state.transients.prefix))throw Error('Solo receiver current prefix mismatch');
   const stagedFX=state.transients,rawFXModels=stagedFX.models,rawFXHandles=stagedFX.expectedHandles;
   if(!Array.isArray(rawFXModels)||!Array.isArray(rawFXHandles))throw Error('Invalid Solo receiver staged FX capture');
   const fxCount=rawFXModels.length,fxHandleCount=rawFXHandles.length;
   if(!Number.isSafeInteger(fxCount)||fxCount<0||fxCount>budgets.maxModels||fxHandleCount!==fxCount||templates.length+fxCount>budgets.maxModels)throw Error('Solo receiver staged FX budget exceeded');
   const fxModels:Readonly<ReceiverModelEntry>[]=[],fxHandles:string[]=[];let fxText=0;
   for(let i=0;i<fxCount;i++){
    const model=rawFXModels[i],handle=rawFXHandles[i];
    if(!model||typeof handle!=='string'||!handle||model.handle!==handle||model.kind!=='transient'||model.group!=='gsmokes'||!model.pose?.position)throw Error('Invalid Solo receiver staged FX model');
    fxText+=handle.length;if(fxText>budgets.maxTextChars)throw Error('Solo receiver staged FX text budget exceeded');
    const pose=model.pose,rotation=pose.rotation,matrix=model.worldMatrix;
    if(matrix!==undefined&&(!Array.isArray(matrix)||matrix.length!==16))throw Error('Invalid Solo receiver staged FX matrix');
    fxModels.push(Object.freeze({handle:model.handle,name:model.name,resource:model.resource,kind:model.kind,group:model.group,inWorld:model.inWorld,geometryProvenance:model.geometryProvenance,
     pose:Object.freeze({position:Object.freeze({x:pose.position.x,y:pose.position.y,z:pose.position.z}),yaw:pose.yaw,phase:pose.phase,scale:pose.scale,...(rotation?{rotation:Object.freeze({x:rotation.x,y:rotation.y,z:rotation.z,w:rotation.w})}:{})}),...(matrix?{worldMatrix:Object.freeze([...matrix])}:{})}));fxHandles.push(handle);
   }
   const inventory=composed.snapshotAt(prefix,{prefix,actorRegistry:actors,imported:{prefix,doors:state.doors,barrels:state.barrels},localWeapons:state.localWeapons,projectiles:state.projectiles,
    transients:{prefix,templates,models:fxModels,expectedHandles:[...templates.map(t=>t.handle),...fxHandles],unresolved,planeWidthWorld:stagedFX.planeWidthWorld}});
   handles(actors,inventory);
   const ownedFX=new Set(fxHandles),externalModels=Object.freeze(inventory.models.filter(model=>!ownedFX.has(model.handle))),external=new Map(inventory.models.map(model=>[model.handle,model]));
   // TransientInventory adds a resolved WORLD matrix to its normalized entries.
   // The controller appends the original pose-only staged ledger entry, so its
   // validation identity must stay distinct from the resolver's derived matrix.
   for(const model of fxModels)external.set(model.handle,model);
   current=Object.freeze({prefix:inventory.prefix,inventory,external});
   return Object.freeze({prefix:inventory.prefix,models:externalModels,missing:inventory.missing,provenance});
  },geometryQuery:createOriginalReceiverGeometryQuery(geometryOptions),
  createGeometryBackend:(lifecycle:Omit<ReceiverModelBackend,'nearestDetailedDownward'>)=>{check();return createOriginalReceiverGeometryBackend(lifecycle,geometryOptions);},
  dispose:()=>{disposed=true;current=undefined;},
 });
}
