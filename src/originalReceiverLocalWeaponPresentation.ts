import * as THREE from 'three';
import type {OriginalWeaponCollection} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from '../shared/originalReceiverLocalWeaponInventory';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import {copyReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponCheckpoint';

export interface OriginalReceiverLocalWeaponPresentationOptions {readonly sceneGeneration:number;readonly maxTextChars:number}
const handles=Object.keys(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES) as Array<keyof typeof ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES>;
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
function invertible(matrix:THREE.Matrix4):void {
 const determinant=matrix.determinant();if(!Number.isFinite(determinant)||determinant===0)throw Error('Singular local weapon presentation transform');
}
/** Validated affine operands stay affine mathematically, but generic cofactor
 * inversion can round m15 away from one. Canonicalize only generated results,
 * after rejecting overflow; retain every upper affine coefficient unchanged. */
function generatedAffine(matrix:THREE.Matrix4):THREE.Matrix4 {
 for(const value of matrix.elements)if(!Number.isFinite(value))throw Error('Local weapon presentation transform overflow');
 matrix.elements[3]=0;matrix.elements[7]=0;matrix.elements[11]=0;matrix.elements[15]=1;return matrix;
}
type Saved={mesh:THREE.Mesh;parent:THREE.Object3D|null;visible:boolean;auto:boolean;worldAuto:boolean;dirty:boolean;
 position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3;order:THREE.EulerOrder;matrix:THREE.Matrix4;world:THREE.Matrix4};

/** Borrowed renderer projection of explicit captured WORLD state. Membership
 * controls rendering only; ancestry does not reconstruct native parenting.
 * Three add/remove event handlers are trusted: exceptions after validation can
 * leave partial renderer writes, and are not an atomic scene transaction. */
export class OriginalReceiverLocalWeaponPresentation {
 private readonly generation:number;private readonly maxText:number;
 private readonly saved=new Map<string,Saved>();private checkpoint?:ReceiverLocalWeaponWorldCheckpoint;
 private closed=false;private busy=false;private failed=false;
 constructor(collection:OriginalWeaponCollection,private readonly root:THREE.Object3D,options:OriginalReceiverLocalWeaponPresentationOptions){
  const generation=options.sceneGeneration,maxText=options.maxTextChars;
  if(!Number.isSafeInteger(generation)||generation<0||!Number.isSafeInteger(maxText)||maxText<=0||!(root instanceof THREE.Object3D))throw Error('Invalid local weapon presentation options');
  this.generation=generation;this.maxText=maxText;const seen=new Set<THREE.Mesh>();
  for(const handle of handles){
   const resource=ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES[handle],mesh=collection.resources.get(resource);
   if(!(mesh instanceof THREE.Mesh)||seen.has(mesh)||handle==='rocket'&&collection.rocket!==mesh)throw Error('Invalid local weapon presentation resource binding');
   for(let parent:THREE.Object3D|null=root;parent;parent=parent.parent)if(parent===mesh)throw Error('Local weapon presentation root cycle');
   seen.add(mesh);this.saved.set(handle,{mesh,parent:mesh.parent,visible:mesh.visible,auto:mesh.matrixAutoUpdate,worldAuto:mesh.matrixWorldAutoUpdate,dirty:mesh.matrixWorldNeedsUpdate,
    position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.clone(),order:mesh.rotation.order,matrix:mesh.matrix.clone(),world:mesh.matrixWorld.clone()});
  }
 }

 adopt(prefix:ReceiverScenePrefix,capture:ReceiverLocalWeaponWorldCheckpoint,worldToRender:readonly number[]):void {
  if(this.busy){this.failed=true;throw Error('Local weapon presentation operation active');}if(this.closed)throw Error('Local weapon presentation unavailable');this.busy=true;this.failed=false;
  try{
   const admitted=prefixCopy(prefix),next=copyReceiverLocalWeaponWorldCheckpoint(capture,this.maxText),conversion=new THREE.Matrix4().fromArray(matrixCopy(worldToRender));invertible(conversion);
   if(admitted.sceneGeneration!==this.generation||!sameReceiverScenePrefix(admitted,next.prefix))throw Error('Invalid local weapon presentation capture prefix');
   this.root.updateWorldMatrix(true,false);const rootWorld=new THREE.Matrix4().fromArray(matrixCopy(this.root.matrixWorld.elements));invertible(rootWorld);
   const inverseRoot=generatedAffine(rootWorld.clone().invert()),base=generatedAffine(inverseRoot.multiply(conversion)),unscale=new THREE.Matrix4().makeScale(1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE);
   const prepared=next.models.map(model=>{
    const mesh=this.saved.get(model.handle)!.mesh;
    for(let parent:THREE.Object3D|null=this.root;parent;parent=parent.parent)if(parent===mesh)throw Error('Local weapon presentation root cycle');
    const matrix=generatedAffine(base.clone().multiply(new THREE.Matrix4().fromArray(model.worldMatrix)).multiply(unscale));matrixCopy(matrix.elements);
    return {mesh,matrix,visible:model.inWorld};
   });
   if(this.failed||this.closed)throw Error('Local weapon presentation operation rejected');
   for(const {mesh,matrix,visible} of prepared){this.root.add(mesh);if(this.failed)throw Error('Local weapon presentation operation rejected');mesh.matrixAutoUpdate=false;mesh.matrixWorldAutoUpdate=true;mesh.matrix.copy(matrix);mesh.visible=visible;mesh.matrixWorldNeedsUpdate=true;mesh.updateWorldMatrix(true,false);}
   if(this.failed||this.closed)throw Error('Local weapon presentation operation rejected');
   this.checkpoint=next;
  }finally{this.busy=false;}
 }
 freeze():ReceiverLocalWeaponWorldCheckpoint|undefined {return this.checkpoint;}
 private disposalComplete=false;
 get isDisposed():boolean {return this.disposalComplete;}
 release():void {
  if(this.closed){if(!this.disposalComplete)throw Error('Presentation cleanup still active');return;}if(this.busy){this.failed=true;throw Error('Local weapon presentation operation active');}this.closed=true;this.checkpoint=undefined;const errors:unknown[]=[];
  for(const saved of this.saved.values()){
   const {mesh}=saved;
   try{if(saved.parent)saved.parent.add(mesh);else mesh.removeFromParent();}catch(error){errors.push(error);}
   try{mesh.rotation.order=saved.order;mesh.position.copy(saved.position);mesh.quaternion.copy(saved.quaternion);mesh.scale.copy(saved.scale);mesh.matrix.copy(saved.matrix);mesh.matrixWorld.copy(saved.world);mesh.visible=saved.visible;mesh.matrixAutoUpdate=saved.auto;mesh.matrixWorldAutoUpdate=saved.worldAuto;mesh.matrixWorldNeedsUpdate=saved.dirty;}catch(error){errors.push(error);}
  }
  this.saved.clear();this.disposalComplete=true;if(errors.length)throw new AggregateError(errors,'Local weapon presentation release failed');
 }
}
