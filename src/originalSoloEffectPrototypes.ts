import * as THREE from 'three';
import type {OriginalSoldierResources} from './originalSoldier';
import type {OriginalSoloTransientBinding} from './originalSoloTransientResources';
import type {OriginalSoloMuzzlePrototype,OriginalSoloSceneResourcesOptions} from './originalSoloSceneResources';
import type {OriginalReceiverTransientInitialShader} from '../shared/originalReceiverTransientWorld';
import {createOriginalReceiverTransientResourceDescriptor} from '../shared/originalReceiverTransientResourceDescriptor';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

const families={pistol:'mfpistol',shotgun:'mfspas12',rifle:'mfak47',sniper:'mfdragunov'} as const;
type Family=keyof typeof families;
export interface OriginalSoloEffectPrototypeMetadata {
 readonly geometryProvenance:string;readonly group:'scene'|'gsmokes';readonly groupAncestry:readonly string[];
}
export interface OriginalSoloEffectPrototypesOptions {
 readonly soldierResources:OriginalSoldierResources;readonly transientBinding:OriginalSoloTransientBinding;
 /** Borrowed caller-declared material. Its map must join the exact texture bank;
  * no event-dependent plane shader is inferred from an empty live pool. */
 readonly planeMaterial:THREE.MeshBasicMaterial;readonly initialShader?:OriginalReceiverTransientInitialShader;
 readonly muzzles:Readonly<Record<Family,OriginalSoloEffectPrototypeMetadata>>;
 readonly constructorPolicy:'copy-fresh-mesh-identity-offworld-phase-zero';
 readonly maxModels:number;readonly maxTextChars:number;
}
export interface OriginalSoloEffectPrototypes {
 readonly plane:OriginalSoloSceneResourcesOptions['plane'];
 readonly muzzles:OriginalSoloSceneResourcesOptions['muzzles'];
 readonly initialShader?:OriginalReceiverTransientInitialShader;
 release():void;dispose():void;
}
function borrowedMap(value:unknown):Map<string,unknown> {
 if(!(value instanceof Map)||Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!.call(value)>256)throw Error('Invalid effect prototype borrowed resource bank');return value;
}
function shaderCopy(raw:OriginalReceiverTransientInitialShader,add:(value:unknown)=>string):OriginalReceiverTransientInitialShader {
 const handle=add(raw?.handle),texture=add(raw?.texture),recycled=raw.recycled,blend=raw.blend,emissiveWhite=raw.emissiveWhite;
 const specularBlack=raw.specularBlack,shininess=raw.shininess,nearFiltering=raw.nearFiltering,renderFormat=raw.renderFormat;
 const vector=(v:OriginalReceiverTransientInitialShader['textureScale'])=>{if(!v)throw Error('Invalid effect prototype shader vector');const x=v.x,y=v.y,z=v.z;if(![x,y,z].every(Number.isFinite))throw Error('Invalid effect prototype shader vector');return Object.freeze({x,y,z});};
 const textureScale=vector(raw.textureScale),texturePosition=vector(raw.texturePosition);
 if(typeof recycled!=='boolean'||typeof emissiveWhite!=='boolean'||!Number.isFinite(blend)||(specularBlack!==undefined&&typeof specularBlack!=='boolean')||(shininess!==undefined&&shininess!==0)||(nearFiltering!==undefined&&nearFiltering!==true)||(renderFormat!==undefined&&renderFormat!=='rgba8888'))throw Error('Invalid effect prototype initial shader');
 return Object.freeze({handle,texture,recycled,blend,emissiveWhite,textureScale,texturePosition,...(specularBlack!==undefined?{specularBlack}:{}),...(shininess!==undefined?{shininess}:{}),...(nearFiltering!==undefined?{nearFiltering}:{}),...(renderFormat!==undefined?{renderFormat}:{})});
}
/** Five fresh private Mesh wrappers mirror the installed copy constructors:
 * identity transform, offworld membership and phase zero. This is a declared
 * copy policy, not evidence of native clone defaults or first-barrel shaders.
 * Loaded soldier geometry/material and plane assets remain borrowed. No live
 * pool acquire/reset, scene parenting, gameplay RNG hook or borrowed WORLD update.
 * Three Mesh construction draws UUID randomness; acquire once before callbacks.
 * Keep the asset generation alive until every dependent owner is released. */
export function createOriginalSoloEffectPrototypes(options:OriginalSoloEffectPrototypesOptions):OriginalSoloEffectPrototypes {
 if(!options)throw Error('Missing effect prototype options');
 const maxModels=options.maxModels,maxText=options.maxTextChars,policy=options.constructorPolicy;
 if(!Number.isSafeInteger(maxModels)||maxModels<5||maxModels>256||!Number.isSafeInteger(maxText)||maxText<1||maxText>65536||policy!=='copy-fresh-mesh-identity-offworld-phase-zero')throw Error('Invalid effect prototype constructor policy or limits');
 const soldier=options.soldierResources,binding=options.transientBinding,resources=binding?.resources,planeMaterial=options.planeMaterial;
 if(!soldier||!resources||soldier.muzzleModels?.isDisposed||!(planeMaterial instanceof THREE.MeshBasicMaterial))throw Error('Missing effect prototype loaded assets/material');
 const geometries=borrowedMap(resources.geometries),textures=borrowedMap(resources.textures),soldierGeometries=borrowedMap(soldier.gunGeometries),soldierMaterials=borrowedMap(soldier.gunMaterials);
 const textureNames:string[]=[];Map.prototype.forEach.call(textures,(_texture:unknown,name:string)=>textureNames.push(name));
 createOriginalReceiverTransientResourceDescriptor({sourceScale:resources.sourceScale,planeWidthWorld:resources.planeWidthWorld,planeGeometryProvenance:resources.planeGeometryProvenance,provenance:resources.provenance,sidedness:resources.sidedness,resourceBindingId:resources.resourceBindingId,textureBindingId:resources.textureBindingId,textureNames},maxText);
 let chars=0;
 const add=(raw:unknown):string=>{if(typeof raw!=='string'||!raw||raw.trim()!==raw)throw Error('Invalid effect prototype metadata');chars+=raw.length;if(chars>maxText)throw Error('Effect prototype text budget exceeded');return raw;};
 for(const label of [resources.resourceBindingId,resources.textureBindingId,resources.planeGeometryProvenance,resources.provenance,resources.sidedness,...textureNames])add(label);
 const planeProvenance=resources.planeGeometryProvenance;
 const planeEntry=Map.prototype.get.call(geometries,'plane') as {geometry:THREE.BufferGeometry;unitScale:number}|undefined;
 const flashMaterial=Map.prototype.get.call(soldierMaterials,'mfmachinegun') as THREE.MeshBasicMaterial|undefined;
 const flashTexture=Map.prototype.get.call(textures,'mfmachinegun') as THREE.Texture|undefined;
 const planeTexture=planeMaterial.map;
 const planeTextureNames:string[]=[];Map.prototype.forEach.call(textures,(texture:unknown,name:string)=>{if(texture===planeTexture)planeTextureNames.push(name);});
 if(!planeEntry||!(planeEntry.geometry instanceof THREE.BufferGeometry)||planeEntry.unitScale!==1||!(flashMaterial instanceof THREE.MeshBasicMaterial)||!(flashTexture instanceof THREE.Texture)||flashMaterial.map!==flashTexture||!(planeTexture instanceof THREE.Texture)||!planeTextureNames.length)throw Error('Foreign effect prototype material/texture/plane binding');
 const planeGeometry=planeEntry.geometry;
 const rawShader=options.initialShader,initialShader=rawShader===undefined?undefined:shaderCopy(rawShader,add);
 if(initialShader&&Map.prototype.get.call(textures,initialShader.texture)!==planeTexture)throw Error('Effect prototype initial shader texture mismatch');
 const metadata={} as Record<Family,OriginalSoloEffectPrototypeMetadata>,geometryByFamily=new Map<Family,THREE.BufferGeometry>(),entryByFamily=new Map<Family,{geometry:THREE.BufferGeometry;unitScale:number}>();
 for(const weapon of Object.keys(families) as Family[]){
  const resource=families[weapon],entry=Map.prototype.get.call(geometries,resource) as {geometry:THREE.BufferGeometry;unitScale:number}|undefined;
  const geometry=Map.prototype.get.call(soldierGeometries,resource),raw=options.muzzles?.[weapon];
  if(!entry||!(entry.geometry instanceof THREE.BufferGeometry)||entry.geometry!==geometry||entry.unitScale!==ORIGINAL_WEAPON_UNIT_SCALE||!raw)throw Error('Foreign effect prototype muzzle geometry');
  const provenance=add(raw.geometryProvenance),group=raw.group,ancestry=raw.groupAncestry;
  if(!['scene','gsmokes'].includes(group)||!Array.isArray(ancestry)||ancestry.length>maxText)throw Error('Invalid effect prototype ancestry');
  const copied:string[]=[],names=new Set<string>();
  for(let i=0;i<ancestry.length;i++){const name=add(ancestry[i]),folded=name.toLowerCase();if(folded===resource||names.has(folded))throw Error('Invalid effect prototype ancestry');names.add(folded);copied.push(name);}
  if((group==='gsmokes')!==(names.has('smokes')||names.has('gsmokes')))throw Error('Effect prototype group ancestry mismatch');
  metadata[weapon]=Object.freeze({geometryProvenance:provenance,group,groupAncestry:Object.freeze(copied)});geometryByFamily.set(weapon,entry.geometry);entryByFamily.set(weapon,entry);
 }
 if(new Set([planeEntry.geometry,...geometryByFamily.values()]).size!==5)throw Error('Aliased effect prototype geometries');
 // Every identity and metadata check precedes the fixed five wrapper allocations.
 const owned:THREE.Mesh[]=[],muzzles={} as Record<Family,OriginalSoloMuzzlePrototype>;
 let closed=false;
 const release=()=>{if(closed)return;closed=true;const errors:unknown[]=[];for(const mesh of owned)try{mesh.removeFromParent();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Effect prototype release failed');};
 try{
  const fresh=(geometry:THREE.BufferGeometry,material:THREE.MeshBasicMaterial,name:string)=>{const mesh=new THREE.Mesh(geometry,material);owned.push(mesh);mesh.name=name;mesh.updateMatrixWorld(true);return mesh;};
  const plane=Object.freeze({mesh:fresh(planeGeometry,planeMaterial,'solo-fresh-plane-prototype'),phase:0,geometryProvenance:planeProvenance,inWorld:false});
  for(const weapon of Object.keys(families) as Family[])muzzles[weapon]=Object.freeze({mesh:fresh(geometryByFamily.get(weapon)!,flashMaterial,`solo-fresh-${families[weapon]}-prototype`),phase:0,inWorld:false,...metadata[weapon]});
  Object.freeze(muzzles);
  const identity=new THREE.Matrix4().elements;
  const check=()=>{
   if(closed)throw Error('Effect prototypes released');
   if(binding.resources!==resources||resources.geometries!==geometries||resources.textures!==textures||soldier.gunGeometries!==soldierGeometries||soldier.gunMaterials!==soldierMaterials)throw Error('Effect prototype borrowed binding bank changed');
   if(Map.prototype.get.call(geometries,'plane')!==planeEntry||planeEntry.geometry!==planeGeometry||planeEntry.unitScale!==1)throw Error('Effect prototype borrowed plane binding changed');
   if(Map.prototype.get.call(textures,'mfmachinegun')!==flashTexture||planeTextureNames.some(name=>Map.prototype.get.call(textures,name)!==planeTexture))throw Error('Effect prototype borrowed texture binding changed');
   if(initialShader&&Map.prototype.get.call(textures,initialShader.texture)!==planeTexture)throw Error('Effect prototype borrowed shader binding changed');
   if(soldier.muzzleModels?.isDisposed||Map.prototype.get.call(soldierMaterials,'mfmachinegun')!==flashMaterial||flashMaterial.map!==flashTexture||planeMaterial.map!==planeTexture)throw Error('Effect prototype borrowed asset lifetime changed');
   for(const weapon of Object.keys(families) as Family[]){const entry=entryByFamily.get(weapon)!;if(Map.prototype.get.call(geometries,families[weapon])!==entry||entry.geometry!==geometryByFamily.get(weapon)||entry.unitScale!==ORIGINAL_WEAPON_UNIT_SCALE||Map.prototype.get.call(soldierGeometries,families[weapon])!==geometryByFamily.get(weapon))throw Error('Effect prototype borrowed geometry binding changed');}
   for(const mesh of owned)if(mesh.parent!==null||mesh.position.lengthSq()!==0||mesh.quaternion.x!==0||mesh.quaternion.y!==0||mesh.quaternion.z!==0||mesh.quaternion.w!==1||!mesh.scale.equals(new THREE.Vector3(1,1,1))||!mesh.matrix.elements.every((v,i)=>v===identity[i])||!mesh.matrixWorld.elements.every((v,i)=>v===identity[i]))throw Error('Changed effect prototype constructor seed');
   if(plane.mesh.geometry!==planeGeometry||plane.mesh.material!==planeMaterial)throw Error('Changed effect prototype plane binding');
   for(const weapon of Object.keys(families) as Family[])if(muzzles[weapon].mesh.geometry!==geometryByFamily.get(weapon)||muzzles[weapon].mesh.material!==flashMaterial)throw Error('Changed effect prototype muzzle binding');
  };
  return Object.freeze({get plane(){check();return plane;},get muzzles(){check();return muzzles;},get initialShader(){check();return initialShader;},release,dispose:release});
 }catch(error){try{release();}catch(cleanup){throw new AggregateError([error,cleanup],'Effect prototype construction and cleanup failed',{cause:error});}throw error;}
}
