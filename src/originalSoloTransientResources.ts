import * as THREE from 'three';
import {OriginalReceiverTransientResources} from '../shared/originalReceiverTransientResources';
import type {ReceiverWeaponGeometry} from '../shared/originalReceiverActorResources';
import {createOriginalReceiverTransientResourceDescriptor} from '../shared/originalReceiverTransientResourceDescriptor';
import type {ReceiverTransientPresentationResources} from './originalReceiverTransientPresentation';
import type {OriginalSoldierResources} from './originalSoldier';
import type {OriginalExplosionResources} from './originalExplosionPresentation';
import type {OriginalCombatEffectResources} from './originalCombatEffectPresentation';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

export interface OriginalSoloTransientRendererBinding {
 readonly resources:ReceiverTransientPresentationResources;
 readonly side:THREE.Side;
 readonly nearFilter:THREE.MagnificationTextureFilter;
}
export type OriginalSoloTransientBinding=OriginalSoloTransientRendererBinding;
export interface OriginalSoloTransientRendererBindingInput {
 readonly soldierResources:OriginalSoldierResources;
 readonly explosionResources:OriginalExplosionResources;
 readonly combatResources:OriginalCombatEffectResources;
 /** Explicit additional seed textures; no barrel/native texture is inferred. */
 readonly extraTextures?:ReadonlyMap<string,THREE.Texture>;
 /** Explicit resource coordinates already in WORLD units; no native primitive guess. */
 readonly planeGeometry:THREE.BufferGeometry;
 readonly planeWidthWorld:number;
 readonly planeGeometryProvenance:string;
 readonly sourceScale:number;
 readonly provenance:string;
 readonly sidedness:'front'|'back'|'double';
 readonly resourceBindingId:string;
 readonly textureBindingId:string;
 readonly nearFilter:THREE.MagnificationTextureFilter;
 readonly maxVertices:number;
 readonly maxFaces:number;
 readonly maxResourceEntries:number;
 readonly maxTextChars:number;
}
const muzzles=['mfpistol','mfspas12','mfak47','mfdragunov'] as const;
const textureNames=['mfmachinegun','banggrenade','bangrocket','spatter','decalspas','decal','pufft'] as const;
/** Map-compatible borrowed snapshot. Ordinary mutation methods reject; this
 * is not a hostile-code barrier against native Map.prototype calls. */
class CapturedMap<K,V> extends Map<K,V> {
 constructor(entries:readonly (readonly [K,V])[]){super();for(const [key,value] of entries)Map.prototype.set.call(this,key,value);Object.freeze(this);}
 override set(_key:K,_value:V):this {throw Error('Immutable transient resource bank');}
 override delete(_key:K):boolean {throw Error('Immutable transient resource bank');}
 override clear():void {throw Error('Immutable transient resource bank');}
}
type InspectedGeometry={positions:ArrayLike<number>;indices:ArrayLike<number>|null;vertices:number;faces:number};
function inspect(geometry:THREE.BufferGeometry):InspectedGeometry {
 const position=THREE.BufferGeometry.prototype.getAttribute.call(geometry,'position');
 const index=geometry.index;
 if(!(position instanceof THREE.BufferAttribute))throw Error('Invalid borrowed transient positions');
 const itemSize=position.itemSize,vertices=position.count,positions=position.array;
 if(itemSize!==3||!Number.isSafeInteger(vertices)||vertices<1||!ArrayBuffer.isView(positions))throw Error('Invalid borrowed transient positions');
 if(positions.length!==vertices*3)throw Error('Invalid borrowed transient position length');
 let indices:ArrayLike<number>|null=null,faces:number;
 if(index!==null){
  if(!(index instanceof THREE.BufferAttribute))throw Error('Invalid borrowed transient indices');
  const itemSize=index.itemSize,count=index.count,array=index.array;
  if(itemSize!==1||!Number.isSafeInteger(count)||count<3||count%3!==0||!ArrayBuffer.isView(array)||array.length!==count)throw Error('Invalid borrowed transient indices');
  indices=array;faces=count/3;
 }else{if(vertices%3!==0)throw Error('Invalid borrowed transient triangle list');faces=vertices/3;}
 return {positions,indices,vertices,faces};
}
function boundedMap(value:unknown,limit:number):Map<string,unknown> {
 if(!(value instanceof Map)||Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!.call(value)>limit)throw Error('Borrowed transient resource map budget exceeded');
 return value;
}

/** Borrowed immutable-pack assembly only. IDs/provenance attest the caller's
 * resource generation; they are not content hashes or native equivalence proof.
 * No Three geometry/material/texture is created, mutated or disposed. The caller
 * must keep this captured asset generation alive for every presentation using it. */
export function createOriginalSoloTransientRendererBinding(input:OriginalSoloTransientRendererBindingInput):OriginalSoloTransientRendererBinding {
 if(!input)throw Error('Missing Solo transient resource input');
 // Capture public metadata once; validate it before reading resource geometry.
 const sourceScale=input.sourceScale,planeWidthWorld=input.planeWidthWorld,planeGeometryProvenance=input.planeGeometryProvenance,provenance=input.provenance,sidedness=input.sidedness;
 const resourceBindingId=input.resourceBindingId,textureBindingId=input.textureBindingId,nearFilter=input.nearFilter;
 const maxVertices=input.maxVertices,maxFaces=input.maxFaces,maxResourceEntries=input.maxResourceEntries,maxTextChars=input.maxTextChars;
 if(![maxVertices,maxFaces,maxResourceEntries,maxTextChars].every(n=>Number.isSafeInteger(n)&&n>0)||maxResourceEntries>256||maxTextChars>65536||![THREE.NearestFilter,THREE.LinearFilter].includes(nearFilter))throw Error('Invalid Solo transient resource limits/filter');
 // Validate the fixed metadata first, before inspecting even the optional pack.
 createOriginalReceiverTransientResourceDescriptor({sourceScale,planeWidthWorld,planeGeometryProvenance,provenance,sidedness,resourceBindingId,textureBindingId,textureNames},maxTextChars);
 const extraInput=input.extraTextures,extraEntries:Array<readonly [string,THREE.Texture]>=[];
 if(extraInput!==undefined){
  const extras=boundedMap(extraInput,maxResourceEntries),names=new Set<string>(textureNames);let count=textureNames.length;
  Map.prototype.forEach.call(extras,(texture:THREE.Texture,name:string)=>{
   if(++count>256||typeof name!=='string'||!name||names.has(name)||!(texture instanceof THREE.Texture))throw Error('Invalid extra borrowed transient texture');
   names.add(name);extraEntries.push([name,texture]);
  });
 }
 const metadata=createOriginalReceiverTransientResourceDescriptor({sourceScale,planeWidthWorld,planeGeometryProvenance,provenance,sidedness,resourceBindingId,textureBindingId,textureNames:[...textureNames,...extraEntries.map(([name])=>name)]},maxTextChars);
 const soldier=input.soldierResources,explosion=input.explosionResources,combat=input.combatResources,planeGeometry=input.planeGeometry;
 if(!soldier||!explosion||!combat||!(planeGeometry instanceof THREE.BufferGeometry))throw Error('Missing borrowed Solo transient resources');
 const geometryMap=boundedMap(soldier.gunGeometries,maxResourceEntries),materialMap=boundedMap(soldier.gunMaterials,maxResourceEntries);
 const geometryEntries:Array<readonly [string,Readonly<{geometry:THREE.BufferGeometry;unitScale:number}>]>=[['plane',Object.freeze({geometry:planeGeometry,unitScale:1})]];
 for(const name of muzzles){
  const geometry=Map.prototype.get.call(geometryMap,name);
  if(!(geometry instanceof THREE.BufferGeometry))throw Error(`Missing borrowed muzzle geometry: ${name}`);
  geometryEntries.push([name,Object.freeze({geometry,unitScale:ORIGINAL_WEAPON_UNIT_SCALE})]);
 }
 const flashMaterial=Map.prototype.get.call(materialMap,'mfmachinegun');
 if(!(flashMaterial instanceof THREE.MeshBasicMaterial))throw Error('Missing borrowed muzzle material');
 const flashTexture=flashMaterial.map,explosionTextures=explosion.textures,combatTextures=combat.textures;
 if(!explosionTextures||!combatTextures)throw Error('Missing borrowed transient texture pack');
 const textureEntries:readonly (readonly [string,THREE.Texture])[]=[['mfmachinegun',flashTexture as THREE.Texture],['banggrenade',explosionTextures.grenade],['bangrocket',explosionTextures.rocket],['spatter',combatTextures.spatter],['decalspas',combatTextures.decalspas],['decal',combatTextures.decal],['pufft',combatTextures.pufft],...extraEntries];
 for(const [name,texture] of textureEntries)if(!(texture instanceof THREE.Texture))throw Error(`Missing borrowed transient texture: ${name}`);
 // Inspect counts for every geometry before walking any vertex/index array.
 const inspected=geometryEntries.map(([,entry])=>inspect(entry.geometry));
 let vertices=0,faces=0;
 for(const mesh of inspected){vertices+=mesh.vertices;faces+=mesh.faces;if(!Number.isSafeInteger(vertices)||vertices>maxVertices||!Number.isSafeInteger(faces)||faces>maxFaces)throw Error('Solo transient geometry budget exceeded');}
 for(const mesh of inspected){
  for(let i=0;i<mesh.vertices*3;i++)if(!Number.isFinite(mesh.positions[i]))throw Error('Invalid borrowed transient vertex');
  if(mesh.indices)for(let i=0;i<mesh.faces*3;i++){const index=mesh.indices[i];if(!Number.isSafeInteger(index)||index<0||index>=mesh.vertices)throw Error('Invalid borrowed transient face');}
 }
 const resources:ReceiverTransientPresentationResources=Object.freeze({sourceScale:metadata.sourceScale,planeWidthWorld:metadata.planeWidthWorld,planeGeometryProvenance:metadata.planeGeometryProvenance,provenance:metadata.provenance,sidedness:metadata.sidedness,resourceBindingId:metadata.resourceBindingId,textureBindingId:metadata.textureBindingId,
  geometries:new CapturedMap(geometryEntries),textures:new CapturedMap(textureEntries)});
 const side=sidedness==='front'?THREE.FrontSide:sidedness==='back'?THREE.BackSide:THREE.DoubleSide;
 return Object.freeze({resources,side,nearFilter});
}

export interface OriginalSoloTransientQueryLimits {
 readonly maxVertices:number;readonly maxFaces:number;readonly maxMeshes:number;readonly maxTextChars:number;
}
/** Bind CPU FX queries to the actual captured renderer pack, including its
 * WORLD-unit plane. Only bounded detached numeric arrays are owned here.
 * The caller keeps borrowed resources immutable and alive; descriptor IDs are
 * generation attestations, not native shader/primitive equivalence proofs. */
export function createOriginalSoloTransientQueryResources(weapons:ReceiverWeaponGeometry,binding:OriginalSoloTransientBinding,limits:OriginalSoloTransientQueryLimits):OriginalReceiverTransientResources {
 if(!limits||![limits.maxVertices,limits.maxFaces,limits.maxMeshes,limits.maxTextChars].every(n=>Number.isSafeInteger(n)&&n>0)||limits.maxMeshes>256||limits.maxTextChars>65536)throw Error('Invalid Solo transient query limits');
 const resources=binding?.resources;if(!resources)throw Error('Missing Solo transient query binding');
 const textures=boundedMap(resources.textures,256),textureNames:string[]=[];
 Map.prototype.forEach.call(textures,(_texture:unknown,name:string)=>textureNames.push(name));
 const metadata=createOriginalReceiverTransientResourceDescriptor({sourceScale:resources.sourceScale,planeWidthWorld:resources.planeWidthWorld,planeGeometryProvenance:resources.planeGeometryProvenance,provenance:resources.provenance,sidedness:resources.sidedness,resourceBindingId:resources.resourceBindingId,textureBindingId:resources.textureBindingId,textureNames},limits.maxTextChars);
 const geometries=boundedMap(resources.geometries,256),plane=Map.prototype.get.call(geometries,'plane') as {geometry:THREE.BufferGeometry;unitScale:number}|undefined;
 if(!plane||plane.unitScale!==1||!(plane.geometry instanceof THREE.BufferGeometry))throw Error('Missing WORLD-unit Solo transient query plane');
 const inspected=inspect(plane.geometry);
 if(inspected.vertices>limits.maxVertices||inspected.faces>limits.maxFaces)throw Error('Solo transient query plane budget exceeded');
 // Bind the supplied RAW muzzle resource to the actual pre-scaled renderer
 // buffer, rather than accepting matching names/descriptor IDs as geometry.
 // Validate complete aggregate sizes before copying the plane or CPU resources.
 const meshes=weapons?.meshes;if(!Array.isArray(meshes)||meshes.length>limits.maxMeshes)throw Error('Solo transient query mesh budget exceeded');
 let vertices=inspected.vertices,faceCount=inspected.faces;
 const matched:Array<{raw:ReceiverWeaponGeometry['meshes'][number];borrowed:InspectedGeometry}>=[];
 for(const name of muzzles){
  const matches=meshes.filter(mesh=>mesh?.resource===name);if(matches.length!==1)throw Error('Missing or duplicate Solo transient query muzzle');
  const raw=matches[0],borrowed=Map.prototype.get.call(geometries,name) as {geometry:THREE.BufferGeometry;unitScale:number}|undefined;
  if(!Array.isArray(raw.positions)||!Array.isArray(raw.faces)||!borrowed||borrowed.unitScale!==ORIGINAL_WEAPON_UNIT_SCALE||!(borrowed.geometry instanceof THREE.BufferGeometry))throw Error('Invalid Solo transient query muzzle binding');
  vertices+=raw.positions.length;faceCount+=raw.faces.length;if(!Number.isSafeInteger(vertices)||!Number.isSafeInteger(faceCount)||vertices>limits.maxVertices||faceCount>limits.maxFaces)throw Error('Solo transient query geometry budget exceeded');
  const buffer=inspect(borrowed.geometry);
  if(buffer.vertices!==raw.positions.length||buffer.faces!==raw.faces.length)throw Error('Foreign Solo transient query muzzle geometry');
  matched.push({raw,borrowed:buffer});
 }
 for(const {raw,borrowed} of matched){
  for(let i=0;i<raw.positions.length;i++){
   const point=raw.positions[i];if(!Array.isArray(point)||point.length!==3)throw Error('Invalid Solo transient query muzzle vertex');
   for(let j=0;j<3;j++){const value=point[j];if(!Number.isFinite(value)||borrowed.positions[i*3+j]!==Math.fround(value*ORIGINAL_WEAPON_UNIT_SCALE))throw Error('Foreign Solo transient query muzzle geometry');}
  }
  for(let i=0;i<raw.faces.length;i++){
   const face=raw.faces[i];if(!Array.isArray(face)||face.length!==3)throw Error('Invalid Solo transient query muzzle face');
   for(let j=0;j<3;j++){const index=face[j],actual=borrowed.indices?borrowed.indices[i*3+j]:i*3+j;if(!Number.isSafeInteger(index)||index<0||index>=raw.positions.length||actual!==index)throw Error('Foreign Solo transient query muzzle topology');}
  }
 }
 // Validate all source values before detached arrays are allocated.
 for(let i=0;i<inspected.vertices*3;i++)if(!Number.isFinite(inspected.positions[i]))throw Error('Invalid borrowed transient query vertex');
 if(inspected.indices)for(let i=0;i<inspected.faces*3;i++){const index=inspected.indices[i];if(!Number.isSafeInteger(index)||index<0||index>=inspected.vertices)throw Error('Invalid borrowed transient query face');}
 const positions:number[][]=[],faces:number[][]=[];
 for(let i=0;i<inspected.vertices;i++)positions.push([inspected.positions[i*3],inspected.positions[i*3+1],inspected.positions[i*3+2]]);
 for(let i=0;i<inspected.faces;i++)faces.push(inspected.indices?[inspected.indices[i*3],inspected.indices[i*3+1],inspected.indices[i*3+2]]:[i*3,i*3+1,i*3+2]);
 return new OriginalReceiverTransientResources(weapons,{sourceScale:metadata.sourceScale,planeResource:{widthWorld:metadata.planeWidthWorld,positions,faces,provenance:metadata.planeGeometryProvenance},maxVertices:limits.maxVertices,maxFaces:limits.maxFaces,maxMeshes:limits.maxMeshes,provenance:metadata.provenance,sidedness:metadata.sidedness,resourceBindingId:metadata.resourceBindingId,textureBindingId:metadata.textureBindingId,textureNames:metadata.textureNames,maxDescriptorTextChars:limits.maxTextChars});
}
