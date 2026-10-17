import * as THREE from 'three';
import {OriginalReceiverActorResources,type ReceiverActorResourceOptions,type ReceiverWeaponGeometry} from '../shared/originalReceiverActorResources';
import {createOriginalReceiverActorResourceDescriptor} from '../shared/originalReceiverActorResourceDescriptor';
import type {OriginalSoldierResources} from './originalSoldier';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

export type OriginalSoloActorQueryResourceOptions=Omit<ReceiverActorResourceOptions,'resourceBindingId'> & {maxMeshes:number};
const guns=['pistol','spas12','ak47','rg6','rpg','dragunov'] as const;
type RawMesh=ReceiverWeaponGeometry['meshes'][number];
function attribute(geometry:THREE.BufferGeometry,name:string,size:number,count?:number):THREE.BufferAttribute {
 const value=THREE.BufferGeometry.prototype.getAttribute.call(geometry,name);
 if(!(value instanceof THREE.BufferAttribute)||value.normalized||value.itemSize!==size||!Number.isSafeInteger(value.count)||value.count<1||!ArrayBuffer.isView(value.array)||value.array.length!==value.count*size||count!==undefined&&value.count!==count)throw Error(`Invalid borrowed actor ${name}`);
 return value;
}
function inspect(geometry:THREE.BufferGeometry,raw:RawMesh){
 if(!(geometry instanceof THREE.BufferGeometry))throw Error('Missing borrowed actor geometry');
 const positions=attribute(geometry,'position',3,raw.positions.length),index=geometry.index;
 if(!(index instanceof THREE.BufferAttribute)||index.normalized||index.itemSize!==1||!Number.isSafeInteger(index.count)||index.count!==raw.faces.length*3||!ArrayBuffer.isView(index.array)||index.array.length!==index.count)throw Error('Invalid borrowed actor indices');
 return {positions:positions.array,indices:index.array};
}
/** Pair queries with the actual immutable renderer generation. Borrowed buffers
 * remain caller-owned; only the returned scratch rig and detached query data
 * are owned. Float32 and Three skinning are explicit copy arithmetic adapters. */
export function createOriginalSoloActorQueryResources(soldierResources:OriginalSoldierResources,weapons:ReceiverWeaponGeometry,options:OriginalSoloActorQueryResourceOptions):OriginalReceiverActorResources {
 if(!soldierResources||!options)throw Error('Missing Solo actor resource input');
 const {sourceScale,giResourceOrientation,gunScale,maxVertices,maxFaces,maxMotionKeys,maxMeshes,provenance,sidedness}=options;
 const maxDescriptorTextChars=options.maxDescriptorTextChars??65536,resourceBindingId=soldierResources.resourceBindingId;
 if(![maxVertices,maxFaces,maxMotionKeys,maxMeshes,maxDescriptorTextChars].every(value=>Number.isSafeInteger(value)&&value>0)||maxMeshes>256||maxDescriptorTextChars>65536||!Number.isFinite(gunScale)||gunScale<=0||!['front','back','double'].includes(sidedness))throw Error('Invalid Solo actor resource limits/options');
 if(typeof resourceBindingId!=='string'||!resourceBindingId)throw Error('Missing actual Solo actor resource binding ID');
 const metadata=createOriginalReceiverActorResourceDescriptor({sourceScale,giResourceOrientation,resourceBindingId,provenance},maxDescriptorTextChars);
 let text=resourceBindingId.length+provenance.length;
 const label=(value:unknown)=>{if(typeof value!=='string'||!value||value.length>maxDescriptorTextChars||(text+=value.length)>maxDescriptorTextChars)throw Error('Solo actor resource text budget exceeded');};
 const assets=soldierResources.assets,giMeshes=assets?.geometry?.meshes,gunMeshes=weapons?.meshes;
 if(!Array.isArray(giMeshes)||!Array.isArray(gunMeshes)||giMeshes.length>maxMeshes||gunMeshes.length>maxMeshes)throw Error('Solo actor mesh budget exceeded');
 for(const mesh of giMeshes)label(mesh?.resource);
 for(const mesh of gunMeshes)label(mesh?.resource);
 const giMatches=giMeshes.filter(mesh=>mesh.resource==='GI');
 if(giMatches.length!==1)throw Error('Missing or duplicate Solo actor GI');
 const gi=giMatches[0],selected:RawMesh[]=[gi];
 for(const resource of guns){const matches=gunMeshes.filter(mesh=>mesh.resource===resource);if(matches.length!==1)throw Error('Missing or duplicate Solo actor gun');selected.push(matches[0]);}
 if(new Set(selected).size!==selected.length)throw Error('Aliased Solo actor raw meshes');
 let vertices=0,faces=0;
 for(const mesh of selected){
  if(!Array.isArray(mesh.positions)||!Array.isArray(mesh.faces)||!mesh.positions.length||!mesh.faces.length)throw Error('Invalid Solo actor raw geometry');
  vertices+=mesh.positions.length;faces+=mesh.faces.length;
  if(!Number.isSafeInteger(vertices)||vertices>maxVertices||!Number.isSafeInteger(faces)||faces>maxFaces)throw Error('Solo actor geometry budget exceeded');
 }
 if(new Set(selected.map(mesh=>mesh.positions)).size!==selected.length||new Set(selected.map(mesh=>mesh.faces)).size!==selected.length)throw Error('Aliased Solo actor raw arrays');
 // Preflight rig inventory, key counts and text before any buffer/data walk.
 const rigs=assets.rigMotion?.rigs,motions=assets.rigMotion?.motions;
 if(!Array.isArray(rigs)||!Array.isArray(motions)||rigs.length>maxMeshes||motions.length>maxMeshes)throw Error('Solo actor rig inventory budget exceeded');
 for(const rig of rigs)label(rig?.name);for(const motion of motions)label(motion?.name);
 const matchedRigs=rigs.filter(rig=>rig.name==='GI'),matchedMotions=motions.filter(motion=>motion.name==='GI');
 if(matchedRigs.length!==1||matchedMotions.length!==1||!Array.isArray(matchedRigs[0].bones)||matchedRigs[0].bones.length!==25||!Array.isArray(matchedMotions[0].tracks)||matchedMotions[0].tracks.length>25)throw Error('Invalid Solo actor rig inventory');
 for(const bone of matchedRigs[0].bones)label(bone?.name);
 let keys=0;for(const track of matchedMotions[0].tracks){label(track?.bone);if(!Array.isArray(track.keys)||(keys+=track.keys.length)>maxMotionKeys||!Number.isSafeInteger(keys))throw Error('Solo actor motion budget exceeded');}
 if(!Array.isArray(gi.bone_indices)||!Array.isArray(gi.bone_weights)||gi.bone_indices.length!==gi.positions.length||gi.bone_weights.length!==gi.positions.length)throw Error('Invalid Solo actor raw skin');
 const bank=soldierResources.gunGeometries;
 if(!(bank instanceof Map)||Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!.call(bank)>maxMeshes)throw Error('Solo actor borrowed mesh budget exceeded');
 const geometries=[soldierResources.geometry,...guns.map(resource=>Map.prototype.get.call(bank,resource) as THREE.BufferGeometry)];
 if(new Set(geometries).size!==geometries.length)throw Error('Aliased Solo actor borrowed geometries');
 const buffers=geometries.map((geometry,i)=>inspect(geometry,selected[i]));
 if(new Set(buffers.map(buffer=>buffer.positions)).size!==buffers.length)throw Error('Aliased Solo actor borrowed positions');
 const skinIndex=attribute(geometries[0],'skinIndex',4,gi.positions.length).array,skinWeight=attribute(geometries[0],'skinWeight',4,gi.positions.length).array;
 for(let meshIndex=0;meshIndex<selected.length;meshIndex++){
  const raw=selected[meshIndex],buffer=buffers[meshIndex],unit=meshIndex===0?1:ORIGINAL_WEAPON_UNIT_SCALE;
  for(let i=0;i<raw.positions.length;i++){
   const point=raw.positions[i];if(!Array.isArray(point)||point.length!==3)throw Error('Invalid Solo actor vertex');
   for(let j=0;j<3;j++){const expected=Math.fround(point[j]*unit);if(!Number.isFinite(point[j])||!Number.isFinite(expected)||buffer.positions[i*3+j]!==expected)throw Error('Foreign Solo actor positions');}
  }
  for(let i=0;i<raw.faces.length;i++){
   const face=raw.faces[i];if(!Array.isArray(face)||face.length!==3)throw Error('Invalid Solo actor face');
   for(let j=0;j<3;j++){const index=face[j];if(!Number.isSafeInteger(index)||index<0||index>=raw.positions.length||buffer.indices[i*3+j]!==index)throw Error('Foreign Solo actor topology');}
  }
 }
 for(let i=0;i<gi.positions.length;i++){
  const indices=gi.bone_indices[i],weights=gi.bone_weights[i];
  if(!Array.isArray(indices)||!Array.isArray(weights)||indices.length<1||indices.length>4||weights.length!==indices.length)throw Error('Invalid Solo actor skin influences');
  let total=0;
  for(let slot=0;slot<4;slot++){
   const index=indices[slot]??0,weight=weights[slot]??0,rounded=Math.fround(weight);total+=weight;
   if(!Number.isSafeInteger(index)||index<0||index>=25||!Number.isFinite(weight)||weight<0||!Number.isFinite(rounded)||skinIndex[i*4+slot]!==index||skinWeight[i*4+slot]!==rounded)throw Error('Foreign Solo actor skin');
  }
  if(!Number.isFinite(total)||total<=0)throw Error('Invalid Solo actor skin weight sum');
 }
 return new OriginalReceiverActorResources(assets,weapons,{sourceScale:metadata.sourceScale,giResourceOrientation:metadata.giResourceOrientation,gunScale,maxVertices,maxFaces,maxMotionKeys,provenance:metadata.provenance,sidedness,resourceBindingId:metadata.resourceBindingId,maxDescriptorTextChars});
}
