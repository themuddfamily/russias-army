import * as THREE from 'three';
import type {OriginalWeaponCollection} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import type {ReceiverProjectileWorldCheckpoint} from '../shared/originalReceiverProjectileWorld';
import {copyReceiverProjectileWorldCheckpoint} from '../shared/originalReceiverProjectileCheckpoint';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';

export type OriginalReceiverProjectileResource='rg6grenade'|'rpgrocket';
export interface OriginalReceiverProjectileMaterialBinding {
 readonly resource:OriginalReceiverProjectileResource;
 readonly material:THREE.Material|THREE.Material[];
}
export interface OriginalReceiverProjectilePresentationOptions {
 readonly sceneGeneration:number;readonly maxModels:number;readonly maxActors:number;readonly maxTextChars:number;
 readonly rocketMaterialHandle:string;
 readonly materialBindings:ReadonlyMap<string,OriginalReceiverProjectileMaterialBinding>;
 readonly worldToRender?:readonly number[];
}
function matrix(raw:readonly number[]):THREE.Matrix4 {
 if(!Array.isArray(raw)||raw.length!==16)throw Error('Invalid projectile presentation matrix');
 const values:number[]=[];for(let i=0;i<16;i++){const v=raw[i];if(!Number.isFinite(v))throw Error('Invalid projectile presentation matrix');values.push(v);}
 if(values[3]!==0||values[7]!==0||values[11]!==0||values[15]!==1)throw Error('Invalid projectile presentation affine');
 const result=new THREE.Matrix4().fromArray(values),det=result.determinant();
 if(!Number.isFinite(det)||det===0)throw Error('Singular projectile presentation transform');return result;
}
function generatedAffine(value:THREE.Matrix4):THREE.Matrix4 {
 for(const coefficient of value.elements)if(!Number.isFinite(coefficient))throw Error('Projectile presentation transform overflow');
 value.elements[3]=value.elements[7]=value.elements[11]=0;value.elements[15]=1;matrix(value.elements);return value;
}
function copyPrefix(raw:ReceiverScenePrefix):ReceiverScenePrefix {
 if(!raw)throw Error('Missing projectile presentation prefix');
 const kind=raw.kind,sceneGeneration=raw.sceneGeneration,callback=raw.callback;
 const next=kind==='receipt'?{kind,sceneGeneration,callback,tick:raw.tick}:{kind,sceneGeneration,callback};
 validateReceiverScenePrefix(next as ReceiverScenePrefix);return Object.freeze(next as ReceiverScenePrefix);
}

/** Projects captured RAW-resource WORLD matrices onto private mesh wrappers.
 * Renderer buffers already contain UNIT, so it is removed on the right once.
 * Membership, rotation and retained FIFO identity come solely from captures;
 * no projectile physics, direction-based orientation or fuse is reconstructed.
 * Three parenting event handlers are trusted; exceptions during renderer writes
 * are not an atomic scene transaction. Borrowed assets are never disposed. */
export class OriginalReceiverProjectilePresentation {
 private readonly options:Readonly<Pick<OriginalReceiverProjectilePresentationOptions,'sceneGeneration'|'maxModels'|'maxActors'|'maxTextChars'|'rocketMaterialHandle'>>;
 private readonly resources=new Map<OriginalReceiverProjectileResource,THREE.Mesh>();
 private readonly materials=new Map<string,OriginalReceiverProjectileMaterialBinding>();
 private readonly meshes=new Map<string,THREE.Mesh>();
 private checkpoint?:ReceiverProjectileWorldCheckpoint;private conversion:readonly number[];
 private closed=false;private busy=false;private failed=false;private receiptTick?:number;
 constructor(collection:OriginalWeaponCollection,private readonly root:THREE.Object3D,options:OriginalReceiverProjectilePresentationOptions){
  if(!options||!(root instanceof THREE.Object3D))throw Error('Invalid projectile presentation options');
  const {sceneGeneration,maxModels,maxActors,maxTextChars,rocketMaterialHandle}=options;
  if(!Number.isSafeInteger(sceneGeneration)||sceneGeneration<0||![maxModels,maxActors,maxTextChars].every(v=>Number.isSafeInteger(v)&&v>0)||maxModels>256||maxActors>256||maxTextChars>65536||typeof rocketMaterialHandle!=='string'||!rocketMaterialHandle.trim()||rocketMaterialHandle.trim()!==rocketMaterialHandle||rocketMaterialHandle.length>maxTextChars)throw Error('Invalid projectile presentation options');
  this.options=Object.freeze({sceneGeneration,maxModels,maxActors,maxTextChars,rocketMaterialHandle});
  this.conversion=Object.freeze(matrix(options.worldToRender??new THREE.Matrix4().toArray()).toArray());
  for(const resource of ['rg6grenade','rpgrocket'] as const){const mesh=collection.resources.get(resource);if(!(mesh instanceof THREE.Mesh)||!(mesh.geometry instanceof THREE.BufferGeometry)||resource==='rpgrocket'&&mesh!==collection.rocket)throw Error('Invalid projectile presentation resource binding');this.resources.set(resource,mesh);}
  if(this.resources.get('rg6grenade')===this.resources.get('rpgrocket'))throw Error('Aliased projectile presentation resources');
  if(!options.materialBindings||!Number.isSafeInteger(options.materialBindings.size)||options.materialBindings.size<1||options.materialBindings.size>maxTextChars)throw Error('Invalid projectile presentation material bindings');
  let text=rocketMaterialHandle.length;
  for(const [handle,binding] of options.materialBindings){
   if(typeof handle!=='string'||!handle.trim()||handle.trim()!==handle||!binding)throw Error('Invalid projectile presentation material binding');
   text+=handle.length;if(text>maxTextChars)throw Error('Projectile presentation material text budget exceeded');
   const resource=binding.resource,material=binding.material,source=this.resources.get(resource);
   if(!source||source.material!==material)throw Error('Foreign projectile presentation material/resource');
   if(Array.isArray(material)?!material.length||!material.every(m=>m instanceof THREE.Material):!(material instanceof THREE.Material))throw Error('Invalid projectile presentation material');
   this.materials.set(handle,Object.freeze({resource,material}));
  }
  if(this.materials.get(rocketMaterialHandle)?.resource!=='rpgrocket')throw Error('Unmapped projectile rocket material');
 }
 private check():void {if(this.closed)throw Error('Projectile presentation unavailable');}
 adopt(prefix:ReceiverScenePrefix,capture:ReceiverProjectileWorldCheckpoint,worldToRender:readonly number[]=this.conversion):void {
  if(this.busy){this.failed=true;throw Error('Projectile presentation operation active');}this.check();this.busy=true;this.failed=false;
  try{
   const admitted=copyPrefix(prefix),next=copyReceiverProjectileWorldCheckpoint(capture,this.options),conversion=matrix(worldToRender);
   if(admitted.sceneGeneration!==this.options.sceneGeneration||!sameReceiverScenePrefix(admitted,next.prefix))throw Error('Invalid projectile presentation capture prefix');
   if(this.checkpoint&&(admitted.callback<this.checkpoint.prefix.callback||admitted.kind==='receipt'&&this.receiptTick!==undefined&&admitted.tick<this.receiptTick))throw Error('Replayed projectile presentation prefix');
   const catalog=new Map(next.catalog.map(c=>[c.handle,c.weapon])),previousCatalog=new Map(this.checkpoint?.catalog.map(c=>[c.handle,c.weapon])),previousModels=new Map(this.checkpoint?.models.map(m=>[m.handle,m]));
   for(const [handle,mesh] of this.meshes){const weapon=catalog.get(handle);if(!weapon||previousCatalog.get(handle)!==weapon||mesh.geometry!==this.resources.get(weapon==='launcher'?'rg6grenade':'rpgrocket')!.geometry)throw Error('Projectile catalog changed or deleted');if(mesh.parent!==(previousModels.get(handle)?.inWorld?this.root:null))throw Error('Foreign projectile model parent');}
   const captures=[next.template,...next.models];
   for(const model of captures){const binding=this.materials.get(model.materialHandle);if(!binding||binding.resource!==model.resource)throw Error('Unmapped projectile material/resource');matrix(model.worldMatrix);}
   for(let ancestor:THREE.Object3D|null=this.root;ancestor;ancestor=ancestor.parent)for(const mesh of this.meshes.values())if(ancestor===mesh)throw Error('Projectile presentation root cycle');
   this.root.updateWorldMatrix(true,false);
   const base=generatedAffine(matrix(this.root.matrixWorld.elements).invert().multiply(conversion)),unscale=new THREE.Matrix4().makeScale(1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE);
   const prepared=next.models.map(model=>({model,material:this.materials.get(model.materialHandle)!.material,matrix:generatedAffine((model.inWorld?base:conversion).clone().multiply(matrix(model.worldMatrix)).multiply(unscale))}));
   if(this.failed||this.closed)throw Error('Projectile presentation operation rejected');
   for(const item of prepared){let mesh=this.meshes.get(item.model.handle);if(!mesh){mesh=new THREE.Mesh(this.resources.get(item.model.resource as OriginalReceiverProjectileResource)!.geometry,item.material);mesh.name=item.model.handle;this.meshes.set(item.model.handle,mesh);}if(item.model.inWorld)this.root.add(mesh);else mesh.removeFromParent();if(this.failed||this.closed)throw Error('Projectile presentation operation rejected');mesh.material=item.material;mesh.matrixAutoUpdate=false;mesh.matrixWorldAutoUpdate=true;mesh.matrix.copy(item.matrix);mesh.visible=item.model.inWorld;mesh.matrixWorldNeedsUpdate=true;mesh.updateWorldMatrix(true,false);}
   if(this.failed||this.closed)throw Error('Projectile presentation operation rejected');
   this.checkpoint=next;this.conversion=Object.freeze(conversion.toArray());if(admitted.kind==='receipt')this.receiptTick=admitted.tick;
  }finally{this.busy=false;}
 }
 /** Parent conversion only; captured physical poses and ages remain unchanged. */
 rebase(worldToRender:readonly number[]=this.conversion):void {this.check();if(this.checkpoint){this.adopt(this.checkpoint.prefix,this.checkpoint,worldToRender);return;}if(this.busy){this.failed=true;throw Error('Projectile presentation operation active');}this.busy=true;this.failed=false;try{matrix(worldToRender);this.root.updateWorldMatrix(true,false);matrix(this.root.matrixWorld.elements);if(this.failed||this.closed)throw Error('Projectile presentation operation rejected');}finally{this.busy=false;}}
 freeze():ReceiverProjectileWorldCheckpoint|undefined {return this.checkpoint;}
 meshForHandle(handle:string):THREE.Mesh|undefined {this.check();return this.meshes.get(handle);}
 private disposalComplete=false;
 get isDisposed():boolean {return this.disposalComplete;}
 release():void {
  if(this.closed){if(!this.disposalComplete)throw Error('Presentation cleanup still active');return;}if(this.busy){this.failed=true;throw Error('Projectile presentation operation active');}this.closed=true;this.checkpoint=undefined;this.receiptTick=undefined;
  const meshes=[...this.meshes.values()];this.meshes.clear();this.resources.clear();this.materials.clear();const errors:unknown[]=[];
  for(const mesh of meshes)try{mesh.removeFromParent();}catch(error){errors.push(error);}this.disposalComplete=true;if(errors.length)throw new AggregateError(errors,'Projectile presentation release failed');
 }
 dispose():void {this.release();}
}
