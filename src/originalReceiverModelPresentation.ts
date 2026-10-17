import * as THREE from 'three';
import {OriginalSoldier,type OriginalSoldierResources} from './originalSoldier';
import {ORIGINAL_WEAPON_RESOURCES} from './originalWeapons';
import {originalReceiverModelWorldMatrix,originalReceiverGunMeshWorldMatrix} from './originalReceiverModelMatrix';
import {validateOriginalReceiverActorRegistrySnapshot,type ReceiverActorRegistrySnapshot,type ReceiverActorRegistryPickup} from '../shared/originalReceiverActorRegistry';
import {validateOriginalReceiverActorResourceDescriptor,type ReceiverActorResourceDescriptor} from '../shared/originalReceiverActorResourceDescriptor';
import type {WeaponId} from '../shared/protocol';

export interface OriginalReceiverModelPresentationOptions {
 readonly sceneGeneration:number;readonly maxModels:number;readonly maxPickups:number;readonly maxTextChars:number;readonly resourceBindingId:string;
}
export interface OriginalReceiverPickupBinding {
 readonly pickup:ReceiverActorRegistryPickup;readonly giHandle:string;readonly gunHandle:string;readonly rig:OriginalSoldier;readonly model:THREE.Mesh;
}
/** Historical actor membership joined to one current mutable gun model;
 * no historical collection position or synthetic drawing is exposed. */
export interface OriginalReceiverPickupModelBinding {
 readonly checkpoint:ReceiverActorRegistrySnapshot;readonly giHandle:string;readonly gunHandle:string;readonly weapon:WeaponId;
 readonly rig:OriginalSoldier;readonly model:THREE.Mesh;readonly inWorld:boolean;readonly held:boolean;readonly count:number;
}
interface GunBinding {readonly gi:string;readonly weapon:WeaponId;readonly model:THREE.Mesh}
function affine(matrix:THREE.Matrix4):void {
 const values=matrix.elements;
 for(let i=0;i<16;i++)if(!Number.isFinite(values[i]))throw Error('Invalid receiver presentation transform');
 if(values[3]!==0||values[7]!==0||values[11]!==0||values[15]!==1)throw Error('Invalid receiver presentation affine');
}
function invertible(matrix:THREE.Matrix4):void {
 affine(matrix);const determinant=matrix.determinant();if(!Number.isFinite(determinant)||determinant===0)throw Error('Singular receiver presentation transform');
 const inverse=matrix.clone().invert();for(const value of inverse.elements)if(!Number.isFinite(value))throw Error('Receiver presentation inverse overflow');
}
function generatedAffine(matrix:THREE.Matrix4):THREE.Matrix4 {
 for(const value of matrix.elements)if(!Number.isFinite(value))throw Error('Receiver presentation parent conversion overflow');
 matrix.elements[3]=0;matrix.elements[7]=0;matrix.elements[11]=0;matrix.elements[15]=1;return matrix;
}

/** Per-life renderer ownership for exact receiver handles. Resource packs are
 * borrowed under an explicit immutable-pack binding-ID attestation. Branding
 * does not prove asset equality or native parenting. Three events and trusted
 * resource construction can throw after allocation/writes; this renderer is
 * not an atomic query/physics publisher and keeps owned rigs for cleanup. */
export class OriginalReceiverModelPresentation {
 private readonly options:Readonly<OriginalReceiverModelPresentationOptions>;
 private readonly rigs=new Map<string,OriginalSoldier>();private readonly guns=new Map<string,GunBinding>();
 private checkpoint?:ReceiverActorRegistrySnapshot;private descriptor?:ReceiverActorResourceDescriptor;private lastReceiptTick?:number;
 private closed=false;private busy=false;private failed=false;
 constructor(private readonly resources:OriginalSoldierResources,private readonly parent:THREE.Object3D,options:OriginalReceiverModelPresentationOptions){
  const sceneGeneration=options.sceneGeneration,maxModels=options.maxModels,maxPickups=options.maxPickups,maxTextChars=options.maxTextChars,resourceBindingId=options.resourceBindingId;
  if(!Number.isSafeInteger(sceneGeneration)||sceneGeneration<0||![maxModels,maxPickups,maxTextChars].every(n=>Number.isSafeInteger(n)&&n>0)||typeof resourceBindingId!=='string'||!resourceBindingId||resourceBindingId.length>maxTextChars||!(parent instanceof THREE.Object3D)||!resources)throw Error('Invalid receiver presentation options');
  this.options=Object.freeze({sceneGeneration,maxModels,maxPickups,maxTextChars,resourceBindingId});
 }
 private read():void {if(this.closed)throw Error('Receiver model presentation disposed');}
 private operation<T>(run:()=>T):T {
  if(this.busy){this.failed=true;throw Error('Recursive receiver model presentation');}this.read();this.busy=true;this.failed=false;
  try{const result=run();if(this.failed||this.closed)throw Error('Receiver model presentation rejected');return result;}finally{this.busy=false;}
 }
 private parentCheck():THREE.Matrix4 {
  const seen=new Set<THREE.Object3D>();
  for(let ancestor:THREE.Object3D|null=this.parent;ancestor;ancestor=ancestor.parent){
   if(seen.has(ancestor))throw Error('Cyclic receiver presentation parent');seen.add(ancestor);
   for(const rig of this.rigs.values())if(ancestor===rig.group||ancestor===rig.mesh||ancestor===rig.mesh.parent)throw Error('Owned receiver rig cannot parent presentation');
   for(const binding of this.guns.values())if(ancestor===binding.model)throw Error('Owned receiver gun cannot parent presentation');
  }
  this.parent.updateWorldMatrix(true,false);invertible(this.parent.matrixWorld);return generatedAffine(this.parent.matrixWorld.clone().invert());
 }
 adopt(checkpoint:ReceiverActorRegistrySnapshot,descriptor:ReceiverActorResourceDescriptor):void {this.operation(()=>{
  const o=this.options;validateOriginalReceiverActorRegistrySnapshot(checkpoint,{maxModels:o.maxModels,maxPickups:o.maxPickups,maxTextChars:o.maxTextChars});validateOriginalReceiverActorResourceDescriptor(descriptor,o.maxTextChars);
  if(checkpoint.pickupHistory&&checkpoint.pickupAliases===undefined)throw Error('Paged receiver presentation requires committed pickup alias membership');
  const prefix=checkpoint.prefix;
  if(checkpoint.sceneGeneration!==o.sceneGeneration||!prefix||prefix.sceneGeneration!==o.sceneGeneration||prefix.callback!==checkpoint.callback||checkpoint.constructingGI!==undefined||descriptor.resourceBindingId!==o.resourceBindingId||this.descriptor&&this.descriptor!==descriptor)throw Error('Foreign receiver presentation binding');
  if(this.checkpoint){
   const before=this.checkpoint.prefix!;
   if(prefix.callback<before.callback||prefix.kind==='receipt'&&this.lastReceiptTick!==undefined&&prefix.tick<this.lastReceiptTick)throw Error('Replayed receiver presentation prefix');
  }
  const entries=new Map(checkpoint.models.map(model=>[model.handle,model])),gis=new Set(checkpoint.giHandles),catalog=new Map(checkpoint.gunCatalog.map(gun=>[gun.handle,gun])),pairs=new Set<string>();
  for(const handle of this.rigs.keys())if(!gis.has(handle))throw Error('Receiver GI catalog deletion requires disposal');
  for(const [handle,existing] of this.guns){const gun=catalog.get(handle);if(!gun||gun.gi!==existing.gi||gun.weapon!==existing.weapon)throw Error('Receiver gun catalog changed or deleted');}
  const matrices=new Map<string,THREE.Matrix4>();
  for(const gun of checkpoint.gunCatalog){
   const pair=JSON.stringify([gun.gi,gun.weapon]);if(pairs.has(pair))throw Error('Duplicate receiver GI/weapon gun identity');pairs.add(pair);
   const model=entries.get(gun.handle),resource=ORIGINAL_WEAPON_RESOURCES[gun.weapon];
   if(!model||model.kind!=='gun'||model.resource!==resource||!gis.has(gun.gi)||!this.resources.gunGeometries.has(resource)||!this.resources.gunMaterials.has(resource))throw Error('Missing receiver gun resource join');
   matrices.set(gun.handle,originalReceiverGunMeshWorldMatrix(originalReceiverModelWorldMatrix(model,descriptor)));
  }
  // The trusted rig constructor creates its initial RPG cache. It is kept
  // offworld unless the independent delivered catalog owns/adopts that model.
  if(!this.resources.gunGeometries.has('rpg')||!this.resources.gunMaterials.has('rpg'))throw Error('Missing receiver constructor RPG resource');
  for(const handle of checkpoint.giHandles){const model=entries.get(handle);if(!model||model.kind!=='gi'||model.resource!=='GI')throw Error('Missing receiver GI resource join');const world=originalReceiverModelWorldMatrix(model,descriptor);invertible(world);matrices.set(handle,world);}
  // Reject root/owned hierarchy cycles BEFORE recursive Three world updates.
  const inverseParent=this.parentCheck();
  // Every actual parent conversion is checked before any new catalog model
  // allocation or adoption write. Existing group transforms remain explicit.
  for(const handle of checkpoint.giHandles){
   const rig=this.rigs.get(handle);let inverse=inverseParent;
   if(rig){if(rig.group.parent!==this.parent||rig.nativeRoot.parent!==rig.group||rig.mesh.parent!==rig.nativeRoot)throw Error('Changed receiver GI parent binding');rig.group.updateWorldMatrix(true,false);invertible(rig.group.matrixWorld);inverse=generatedAffine(rig.group.matrixWorld.clone().invert());}
   generatedAffine(inverse.clone().multiply(matrices.get(handle)!));
  }
  for(const gun of checkpoint.gunCatalog)if(entries.get(gun.handle)!.inWorld)generatedAffine(inverseParent.clone().multiply(matrices.get(gun.handle)!));
  if(this.failed||this.closed)throw Error('Receiver model presentation rejected');
  if(checkpoint===this.checkpoint){for(const rig of this.rigs.values()){rig.rebaseSourceModelWorlds();if(this.failed)throw Error('Receiver model presentation rejected');}return;}
  for(const handle of checkpoint.giHandles)if(!this.rigs.has(handle)){
   const rig=new OriginalSoldier(this.resources,{name:handle,weapon:'rpg'});this.rigs.set(handle,rig);const constructorGun=rig.getSourceGun('rpg');constructorGun.removeFromParent();constructorGun.visible=false;this.parent.add(rig.group);
   if(this.failed||this.closed)throw Error('Receiver model presentation rejected');
  }
  for(const gun of checkpoint.gunCatalog)if(!this.guns.has(gun.handle)){const rig=this.rigs.get(gun.gi)!;this.guns.set(gun.handle,{gi:gun.gi,weapon:gun.weapon,model:rig.admitSourceGun(gun.weapon)});}
  for(const handle of checkpoint.giHandles){const rig=this.rigs.get(handle)!,model=entries.get(handle)!;rig.adoptSourceGIWorld(matrices.get(handle)!,model.pose.phase,model.inWorld);if(this.failed)throw Error('Receiver model presentation rejected');}
  for(const gun of checkpoint.gunCatalog){const rig=this.rigs.get(gun.gi)!,model=entries.get(gun.handle)!;rig.adoptSourceGunWorld(this.guns.get(gun.handle)!.model,matrices.get(gun.handle)!,this.parent,model.inWorld);if(this.failed)throw Error('Receiver model presentation rejected');}
  if(this.failed||this.closed)throw Error('Receiver model presentation rejected');this.descriptor=descriptor;this.checkpoint=checkpoint;if(prefix.kind==='receipt')this.lastReceiptTick=prefix.tick;
 });}
 /** Explicit parent rebasing only; no motion phase or source callback age. */
 rebase():void {
  if(this.checkpoint&&this.descriptor){this.adopt(this.checkpoint,this.descriptor);return;}
  this.operation(()=>{if(this.rigs.size||this.guns.size)throw Error('Uncommitted receiver models require adoption or disposal');this.parentCheck();});
 }
 freeze():ReceiverActorRegistrySnapshot|undefined {return this.checkpoint;}
 readRig(giHandle:string):OriginalSoldier|undefined {this.read();return this.rigs.get(giHandle);}
 readGun(gunHandle:string):THREE.Mesh|undefined {this.read();return this.guns.get(gunHandle)?.model;}
 /** One alias per actual catalog handle, bounded by maxModels regardless of
  * paged history size. Geometry follows the current committed WORLD transform;
  * an old pickup position never creates or relocates a second drawing. */
 pickupModelBindings(checkpoint:ReceiverActorRegistrySnapshot|undefined=this.checkpoint):readonly Readonly<OriginalReceiverPickupModelBinding>[] {
  this.read();
  if(checkpoint!==this.checkpoint)throw Error('Foreign or stale receiver gun catalog checkpoint');
  if(!checkpoint)return Object.freeze([]);
  const models=new Map(checkpoint.models.map(model=>[model.handle,model])),held=new Set(checkpoint.actors.map(actor=>actor.gun)),catalog=new Map(checkpoint.gunCatalog.map(gun=>[gun.handle,gun]));
  let aliases=checkpoint.pickupAliases;
  if(checkpoint.pickupHistory){if(!aliases)throw Error('Paged receiver pickup alias membership missing');}
  else{
   const counts=new Map<string,number>();for(const pickup of checkpoint.pickups)counts.set(pickup.handle,(counts.get(pickup.handle)??0)+1);
   aliases=[...counts].map(([handle,count])=>({handle,count}));
  }
  return Object.freeze(aliases!.map(alias=>{
   const gun=catalog.get(alias.handle);if(!gun)throw Error('Receiver pickup alias catalog join missing');
   const binding=this.guns.get(gun.handle),rig=this.rigs.get(gun.gi),entry=models.get(gun.handle);
   if(!binding||!rig||!entry||binding.gi!==gun.gi||binding.weapon!==gun.weapon)throw Error('Receiver gun catalog presentation join missing');
   return Object.freeze({checkpoint,giHandle:gun.gi,gunHandle:gun.handle,weapon:gun.weapon,rig,model:binding.model,inWorld:entry.inWorld,held:held.has(gun.handle),count:alias.count});
  }));
 }
 /** Drawing identity only: constructor logical weapon/muzzle caches are not
  * inferred from the registry. Callers must use the exact gun handle map. */
 actorRig(id:string):OriginalSoldier|undefined {this.read();const binding=this.checkpoint?.actors.find(actor=>actor.actorId===id);return binding?this.rigs.get(binding.gi):undefined;}
 pickupBinding(id:number):Readonly<OriginalReceiverPickupBinding>|undefined {this.read();if(this.checkpoint?.pickupHistory)throw Error('Paged pickup presentation requires an authenticated window');const pickup=this.checkpoint?.pickups.find(value=>value.id===id);if(!pickup)return undefined;const gun=this.guns.get(pickup.handle)!;return Object.freeze({pickup,giHandle:gun.gi,gunHandle:pickup.handle,rig:this.rigs.get(gun.gi)!,model:gun.model});}
 private disposalComplete=false;
 get isDisposed():boolean {return this.disposalComplete;}
 dispose():void {
  if(this.closed){if(!this.disposalComplete)throw Error('Presentation cleanup still active');return;}if(this.busy){this.failed=true;throw Error('Recursive receiver model presentation disposal');}
  this.closed=true;const rigs=[...this.rigs.values()];this.rigs.clear();this.guns.clear();this.checkpoint=undefined;this.descriptor=undefined;this.lastReceiptTick=undefined;
  const errors:unknown[]=[];for(const rig of rigs)try{rig.dispose();}catch(error){errors.push(error);}this.disposalComplete=true;if(errors.length)throw new AggregateError(errors,'Receiver model presentation disposal failed');
 }
}
