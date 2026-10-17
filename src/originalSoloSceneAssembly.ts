import * as THREE from 'three';
import {createOriginalSoloReceiverSceneInventory,type OriginalSoloReceiverSceneInventoryOptions,type OriginalSoloReceiverSceneInventory} from '../shared/originalSoloReceiverSceneInventory';
import type {ReceiverModelBackend} from '../shared/originalReceiverModelWorld';
import type {OriginalReceiverGeometryQuery} from '../shared/originalReceiverGeometryBackend';
import {createReceiverLocalHitscanQuery} from '../shared/originalReceiverLocalHitscan';
import {createOriginalSoloSceneResources,type OriginalSoloSceneResourcesOptions} from './originalSoloSceneResources';
import {createOriginalSoloFreshBanks,createOriginalSoloFreshBotBanks,type OriginalSoloFreshBanksOptions,type OriginalSoloFreshBotBanksOptions,type OriginalSoloFreshBotBanks} from './originalSoloFreshBanks';
import type {OriginalWeaponCollection} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {createOriginalSoloEffectPrototypes,type OriginalSoloEffectPrototypesOptions} from './originalSoloEffectPrototypes';

export interface OriginalSoloConstructorSceneResourcesOptions extends Omit<OriginalSoloSceneResourcesOptions,'plane'|'muzzles'> {
 readonly effectPrototypes:Omit<OriginalSoloEffectPrototypesOptions,'soldierResources'|'transientBinding'|'initialShader'>;
}

export interface OriginalSoloSceneAssemblyOptions {
 readonly resources:OriginalSoloSceneResourcesOptions|OriginalSoloConstructorSceneResourcesOptions;
 readonly banks:OriginalSoloFreshBanksOptions;
 readonly inventory:Omit<OriginalSoloReceiverSceneInventoryOptions,'sourceScale'|'sceneGeneration'|'map'|'weaponGeometry'|'actorResources'|'transientResources'|'muzzleTemplates'>;
}
export interface OriginalSoloBotSceneAssemblyOptions extends Omit<OriginalSoloSceneAssemblyOptions,'banks'> {
 readonly banks:OriginalSoloFreshBotBanksOptions;
}

const required=['pistol','spas12','ak47','rg6','rpg','dragunov','rpgrocket','rg6grenade'] as const;
function preflight(collection:OriginalWeaponCollection,options:OriginalSoloSceneAssemblyOptions|OriginalSoloBotSceneAssemblyOptions):void {
 const resources=options?.resources,banks=options?.banks,inventory=options?.inventory;
 if(!resources||!banks||!inventory||!resources.actor||!resources.transientBinding?.resources)throw Error('Missing Solo scene assembly options');
 const scale=banks.sourceScale;
 if(!Number.isFinite(scale)||scale<=0||resources.actor.sourceScale!==scale||resources.transientBinding.resources.sourceScale!==scale
  ||!['barrack','woodlands'].includes(banks.map)||!Number.isSafeInteger(banks.sceneGeneration)||banks.sceneGeneration<0)throw Error('Solo scene assembly scale/map/generation mismatch');
 const a=resources.renderToWorld,b=banks.renderToWorld;
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==16||b.length!==16)throw Error('Solo scene assembly WORLD mapping mismatch');
 for(let i=0;i<16;i++)if(!Number.isFinite(a[i])||a[i]!==b[i])throw Error('Solo scene assembly WORLD mapping mismatch');
 const budgets=inventory.budgets,actor=resources.actor;
 if(!budgets||![budgets.maxMeshes,budgets.maxVertices,budgets.maxFaces,budgets.maxTextChars,actor.maxMeshes,actor.maxVertices,actor.maxFaces,actor.maxDescriptorTextChars??65536].every(n=>Number.isSafeInteger(n)&&n>0)||actor.maxMeshes>256||(actor.maxDescriptorTextChars??65536)>65536)throw Error('Invalid Solo scene assembly pairing limits');
 const maxMeshes=Math.min(budgets.maxMeshes,actor.maxMeshes),maxVertices=Math.min(budgets.maxVertices,actor.maxVertices),maxFaces=Math.min(budgets.maxFaces,actor.maxFaces),maxText=Math.min(budgets.maxTextChars,actor.maxDescriptorTextChars??65536);
 const meshes=resources.weapons?.meshes,bank=collection?.resources;
 if(!Array.isArray(meshes)||meshes.length>maxMeshes||!(bank instanceof Map)||Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!.call(bank)>maxMeshes)throw Error('Solo scene assembly mesh budget exceeded');
 let text=0;
 for(const mesh of meshes){if(typeof mesh?.resource!=='string'||!mesh.resource||(text+=mesh.resource.length)>maxText)throw Error('Solo scene assembly resource text budget exceeded');}
 const selected=required.map(resource=>{const matches=meshes.filter(mesh=>mesh.resource===resource);if(matches.length!==1)throw Error('Missing or duplicate Solo scene assembly weapon geometry');return matches[0];});
 let vertices=0,faces=0;
 for(const mesh of selected){if(!Array.isArray(mesh.positions)||!Array.isArray(mesh.faces)||!mesh.positions.length||!mesh.faces.length)throw Error('Invalid Solo scene assembly raw geometry');vertices+=mesh.positions.length;faces+=mesh.faces.length;if(!Number.isSafeInteger(vertices)||vertices>maxVertices||!Number.isSafeInteger(faces)||faces>maxFaces)throw Error('Solo scene assembly geometry budget exceeded');}
 if(new Set(selected.map(mesh=>mesh.positions)).size!==selected.length||new Set(selected.map(mesh=>mesh.faces)).size!==selected.length)throw Error('Aliased Solo scene assembly raw geometry');
 const borrowed=required.map(resource=>Map.prototype.get.call(bank,resource) as THREE.Mesh);
 if(borrowed.some(mesh=>!(mesh instanceof THREE.Mesh))||collection.rocket!==borrowed[6]||new Set(borrowed).size!==borrowed.length||new Set(borrowed.map(mesh=>mesh.geometry)).size!==borrowed.length)throw Error('Foreign or aliased Solo scene assembly borrowed meshes');
 const buffers=borrowed.map((mesh,i)=>{
  if(!(mesh.geometry instanceof THREE.BufferGeometry))throw Error('Invalid Solo scene assembly borrowed geometry');
  const position=THREE.BufferGeometry.prototype.getAttribute.call(mesh.geometry,'position'),index=mesh.geometry.index,raw=selected[i];
  if(!(position instanceof THREE.BufferAttribute)||position.normalized||position.itemSize!==3||position.count!==raw.positions.length||!ArrayBuffer.isView(position.array)||position.array.length!==raw.positions.length*3
   ||!(index instanceof THREE.BufferAttribute)||index.normalized||index.itemSize!==1||index.count!==raw.faces.length*3||!ArrayBuffer.isView(index.array)||index.array.length!==raw.faces.length*3)throw Error('Invalid Solo scene assembly borrowed buffers');
  return {position:position.array,index:index.array};
 });
 if(new Set(buffers.map(buffer=>buffer.position)).size!==buffers.length||new Set(buffers.map(buffer=>buffer.index)).size!==buffers.length)throw Error('Aliased Solo scene assembly borrowed buffers');
 for(let i=0;i<selected.length;i++){
  const raw=selected[i],buffer=buffers[i];
  for(let vertex=0;vertex<raw.positions.length;vertex++){
   const point=raw.positions[vertex];if(!Array.isArray(point)||point.length!==3)throw Error('Invalid Solo scene assembly vertex');
   for(let axis=0;axis<3;axis++){const expected=Math.fround(point[axis]*ORIGINAL_WEAPON_UNIT_SCALE);if(!Number.isFinite(point[axis])||!Number.isFinite(expected)||buffer.position[vertex*3+axis]!==expected)throw Error('Foreign Solo scene assembly borrowed positions');}
  }
  for(let face=0;face<raw.faces.length;face++){
   const indices=raw.faces[face];if(!Array.isArray(indices)||indices.length!==3)throw Error('Invalid Solo scene assembly face');
   for(let axis=0;axis<3;axis++){const index=indices[axis];if(!Number.isSafeInteger(index)||index<0||index>=raw.positions.length||buffer.index[face*3+axis]!==index)throw Error('Foreign Solo scene assembly borrowed topology');}
  }
 }
}
function guardedModel(base:ReceiverModelBackend,check:()=>void):ReceiverModelBackend {
 return Object.freeze<ReceiverModelBackend>({cloneGI:(...a)=>{check();return base.cloneGI(...a);},cloneGun:(...a)=>{check();return base.cloneGun(...a);},sphere:(...a)=>{check();return base.sphere(...a);},heldGunPose:(...a)=>{check();return base.heldGunPose(...a);},reparentGunMembership:(...a)=>{check();return base.reparentGunMembership(...a);},dropYaw:(...a)=>{check();return base.dropYaw(...a);},nearestDetailedDownward:(...a)=>{check();return base.nearestDetailedDownward(...a);}});
}
/** Acquire one complete source scene life without publishing, advancing or
 * rendering it. All decoded resources and renderer objects remain borrowed. */
function acquireSceneAssembly<T extends OriginalSoloFreshBotBanks>(collection:OriginalWeaponCollection,options:OriginalSoloSceneAssemblyOptions|OriginalSoloBotSceneAssemblyOptions,acquireBanks:()=>T) {
 preflight(collection,options);
 const acquired:Array<()=>void>=[];let released=false;
 const check=()=>{if(released)throw Error('Solo scene assembly released');};
 const cleanup=()=>{const errors:unknown[]=[];for(let i=acquired.length-1;i>=0;i--)try{acquired[i]();}catch(error){errors.push(error);}return errors;};
 const release=()=>{if(released)return;released=true;const errors=cleanup();if(errors.length)throw new AggregateError(errors,'Solo scene assembly release failed');};
 try{
  const resourceOptions=options.resources;
  let effectPrototypes:ReturnType<typeof createOriginalSoloEffectPrototypes>|undefined;
  let capturedResources:OriginalSoloSceneResourcesOptions;
  if('effectPrototypes' in resourceOptions){
   if(resourceOptions.transientPolicy.cloneMembership!=='copy-effect-birth-parented')throw Error('Fresh effect constructors require copy birth membership');
   const initialShader=resourceOptions.transientPolicy.initialShader;
   if(initialShader&&resourceOptions.transientPolicy.initialShaderIdentity!=='per-clone-name')throw Error('Fresh effect constructors require per-clone shader identity');
   effectPrototypes=createOriginalSoloEffectPrototypes({...resourceOptions.effectPrototypes,soldierResources:resourceOptions.soldierResources,transientBinding:resourceOptions.transientBinding,...(initialShader?{initialShader}:{})});
   acquired.push(()=>effectPrototypes!.release());
   capturedResources={...resourceOptions,plane:effectPrototypes.plane,muzzles:effectPrototypes.muzzles,transientPolicy:{...resourceOptions.transientPolicy,initialShader:effectPrototypes.initialShader}};
  }else capturedResources=resourceOptions;
  const resourceOwner=createOriginalSoloSceneResources(capturedResources);acquired.push(()=>resourceOwner.release());
  const banks=acquireBanks();acquired.push(()=>banks.release());
  const input=options.inventory;
  const rawInventory=createOriginalSoloReceiverSceneInventory({map:options.banks.map,sceneGeneration:options.banks.sceneGeneration,sourceScale:options.banks.sourceScale,
   data:input.data,doorNames:input.doorNames,sky:input.sky,weaponGeometry:options.resources.weapons,
   actorResources:resourceOwner.actorQueryResources,transientResources:resourceOwner.transientQueryResources,muzzleTemplates:resourceOwner.muzzleTemplates,
   transientUnresolved:input.transientUnresolved,provenance:input.provenance,sidedness:input.sidedness,budgets:input.budgets,...(input.imported?{imported:input.imported}:{})});
  let inventoryDisposed=false;
  const disposeInventory=()=>{if(inventoryDisposed)return;inventoryDisposed=true;rawInventory.dispose();};
  const inventoryCheck=()=>{check();if(inventoryDisposed)throw Error('Solo scene assembly inventory disposed');};
  acquired.push(disposeInventory);
  const geometryQuery:OriginalReceiverGeometryQuery=(...a)=>{inventoryCheck();const ray=rawInventory.geometryQuery(...a);return Object.freeze({...ray,nearestDetailed:(...args:Parameters<typeof ray.nearestDetailed>)=>{inventoryCheck();return ray.nearestDetailed(...args);},nearestDetailedDownward:(...args:Parameters<typeof ray.nearestDetailedDownward>)=>{inventoryCheck();return ray.nearestDetailedDownward(...args);}});};
  const snapshotAt:OriginalSoloReceiverSceneInventory['snapshotAt']=(...a)=>{inventoryCheck();return rawInventory.snapshotAt(...a);};
  const inventory=Object.freeze<OriginalSoloReceiverSceneInventory>({snapshotAt,geometryQuery,createGeometryBackend:lifecycle=>{inventoryCheck();return guardedModel(rawInventory.createGeometryBackend(lifecycle),check);},dispose:disposeInventory});
  const model=inventory.createGeometryBackend(resourceOwner.actorLifecycle);
  const transient=Object.freeze<ReturnType<typeof createOriginalSoloSceneResources>['transientBackend']>({clonePlane:(...a)=>{check();return resourceOwner.transientBackend.clonePlane(...a);},cloneMuzzle:(...a)=>{check();return resourceOwner.transientBackend.cloneMuzzle(...a);},pointAt:(...a)=>{check();return resourceOwner.transientBackend.pointAt(...a);},selfRotate:(...a)=>{check();return resourceOwner.transientBackend.selfRotate(...a);}});
  const backends=Object.freeze({model,transient,actorResources:resourceOwner.actorDescriptor,transientResources:resourceOwner.transientDescriptor,
   localWeaponWorld:banks.localWeaponWorld,projectileWorld:banks.projectileWorld,
   localHitscan:createReceiverLocalHitscanQuery(geometryQuery),release});
  return Object.freeze({resourceOwner,banks,inventory,backends,snapshotAt,effectPrototypes,release});
 }catch(error){released=true;const errors=cleanup();if(errors.length)throw new AggregateError([error,...errors],'Solo scene assembly construction and cleanup failed',{cause:error});throw error;}
}

/** Human source constructor keeps its six-slot recovered loadout/report banks. */
export function createOriginalSoloSceneAssembly(collection:OriginalWeaponCollection,options:OriginalSoloSceneAssemblyOptions) {
 const owner=acquireSceneAssembly(collection,options,()=>createOriginalSoloFreshBanks(collection,options.banks));
 return Object.freeze({...owner,backends:Object.freeze({...owner.backends,loadoutWorld:owner.banks.loadoutWorld,weaponReportWorld:owner.banks.weaponReportWorld})});
}

/** Declared authored-bot observer projection; owns no human loadout/report bank.
 * Camera, membership and rocket-template policies remain explicit caller facts. */
export function createOriginalSoloBotSceneAssembly(collection:OriginalWeaponCollection,options:OriginalSoloBotSceneAssemblyOptions) {
 return acquireSceneAssembly(collection,options,()=>createOriginalSoloFreshBotBanks(collection,options.banks));
}
