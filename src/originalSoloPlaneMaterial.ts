import * as THREE from 'three';
import type {OriginalSoloTransientBinding} from './originalSoloTransientResources';
import type {OriginalReceiverTransientInitialShader} from '../shared/originalReceiverTransientWorld';

export interface OriginalSoloPlaneShaderObservation {
 /** Installed BasicMaterial opacity/unlit white and inverse 2D UV mapping.
  * Z is explicitly scale1/position0; no native shader defaults are inferred. */
 readonly policy:'installed-basic-material-uv-with-unit-z';
 readonly handle:string;readonly recycled:boolean;readonly provenance:string;
}
export interface OriginalSoloPlaneMaterialOptions {
 readonly texture:string;
 readonly constructorPolicy:'copy-fresh-basic-material-borrowed-texture';
 readonly maxTextChars:number;
 readonly initialShader?:OriginalReceiverTransientInitialShader;
 readonly shaderProvenance?:string;
 readonly shaderObservation?:OriginalSoloPlaneShaderObservation;
}
export interface OriginalSoloPlaneMaterial {
 readonly planeMaterial:THREE.MeshBasicMaterial;
 readonly initialShader:OriginalReceiverTransientInitialShader|undefined;
 readonly shaderProvenance:string|undefined;
 release():void;
}
const size=Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!;
function bank(raw:unknown):Map<string,unknown> {
 if(!(raw instanceof Map)||size.call(raw)>256)throw Error('Invalid Solo plane material resource bank');
 return raw;
}
function copyShader(raw:OriginalReceiverTransientInitialShader,add:(raw:unknown)=>string):OriginalReceiverTransientInitialShader {
 if(!raw)throw Error('Missing Solo plane material shader observation');
 const handle=add(raw.handle),texture=add(raw.texture),recycled=raw.recycled,blend=raw.blend,emissiveWhite=raw.emissiveWhite;
 const specularBlack=raw.specularBlack,shininess=raw.shininess,nearFiltering=raw.nearFiltering,renderFormat=raw.renderFormat;
 if(typeof recycled!=='boolean'||typeof emissiveWhite!=='boolean'||!Number.isFinite(blend)
  ||specularBlack!==undefined&&typeof specularBlack!=='boolean'||shininess!==undefined&&shininess!==0
  ||nearFiltering!==undefined&&nearFiltering!==true||renderFormat!==undefined&&renderFormat!=='rgba8888')throw Error('Invalid Solo plane material shader observation');
 const vector=(v:OriginalReceiverTransientInitialShader['textureScale'])=>{
  if(!v)throw Error('Invalid Solo plane material shader vector');const x=v.x,y=v.y,z=v.z;
  if(![x,y,z].every(Number.isFinite))throw Error('Invalid Solo plane material shader vector');return Object.freeze({x,y,z});
 };
 const textureScale=vector(raw.textureScale),texturePosition=vector(raw.texturePosition);
 return Object.freeze({handle,texture,recycled,blend,emissiveWhite,textureScale,texturePosition,
  ...(specularBlack!==undefined?{specularBlack}:{}),...(shininess!==undefined?{shininess}:{}),
  ...(nearFiltering!==undefined?{nearFiltering}:{}),...(renderFormat!==undefined?{renderFormat}:{})});
}
function observeShader(material:THREE.MeshBasicMaterial,texture:THREE.Texture,textureName:string,handle:string,recycled:boolean):OriginalReceiverTransientInitialShader {
 const opacity=material.opacity,color=material.color;
 if(material.map!==texture||!color||color.r!==1||color.g!==1||color.b!==1||material.transparent!==true||material.toneMapped!==false||material.depthWrite!==false||material.side!==THREE.FrontSide
  ||!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('Unsupported installed Solo plane material observation');
 const repeat=texture.repeat,offset=texture.offset,center=texture.center,rotation=texture.rotation,auto=texture.matrixAutoUpdate;
 const rx=repeat?.x,ry=repeat?.y,ox=offset?.x,oy=offset?.y,cx=center?.x,cy=center?.y;
 if(![rx,ry,ox,oy,cx,cy,rotation].every(Number.isFinite)||rx===0||ry===0||cx!==0||cy!==0||rotation!==0||auto!==true)throw Error('Unsupported installed Solo plane texture observation');
 // Invert the same top-origin source UV adapter used by the presentation.
 // Reading repeat/offset does not update the borrowed texture matrix/version.
 const sx=1/rx,sy=1/ry,px=-ox/rx,py=(1-oy)/ry-1;
 if(![sx,sy,px,py].every(Number.isFinite))throw Error('Installed Solo plane texture observation overflow');
 return Object.freeze({handle,texture:textureName,recycled,blend:opacity*100,emissiveWhite:true,
  textureScale:Object.freeze({x:sx,y:sy,z:1}),texturePosition:Object.freeze({x:px,y:py,z:0})});
}
/** Resource-generation owner for the installed BasicMaterial copy constructor.
 * The exact bound texture is borrowed: no pool acquisition, texture clone, UV
 * update or native shader inference. Three material construction draws UUID
 * randomness; acquire once outside gameplay callbacks. Optional shader fields
 * are explicit observations, never reconstructed from renderer defaults. */
export function createOriginalSoloPlaneMaterial(binding:OriginalSoloTransientBinding,options:OriginalSoloPlaneMaterialOptions):OriginalSoloPlaneMaterial {
 const maxText=options?.maxTextChars,policy=options?.constructorPolicy;
 if(!Number.isSafeInteger(maxText)||maxText<1||maxText>65536||policy!=='copy-fresh-basic-material-borrowed-texture')throw Error('Invalid Solo plane material policy or limits');
 const resources=binding?.resources;
 if(!resources)throw Error('Missing Solo plane material resource binding');
 const textures=bank(resources.textures),geometries=bank(resources.geometries);
 const sourceScale=resources.sourceScale,width=resources.planeWidthWorld,sidedness=resources.sidedness;
 if(!Number.isFinite(sourceScale)||sourceScale<=0||!Number.isFinite(width)||width<=0||!['front','back','double'].includes(sidedness))throw Error('Invalid Solo plane material resource metadata');
 let chars=0;
 const add=(raw:unknown):string=>{
  if(typeof raw!=='string'||!raw||raw.trim()!==raw)throw Error('Invalid Solo plane material text');
  chars+=raw.length;if(chars>maxText)throw Error('Solo plane material text budget exceeded');return raw;
 };
 add(resources.resourceBindingId);add(resources.textureBindingId);add(resources.planeGeometryProvenance);add(resources.provenance);add(sidedness);
 Map.prototype.forEach.call(textures,(value:unknown,name:unknown)=>{add(name);if(!(value instanceof THREE.Texture))throw Error('Invalid Solo plane material borrowed texture');});
 Map.prototype.forEach.call(geometries,(value:unknown,name:unknown)=>{
  add(name);const entry=value as {geometry?:unknown;unitScale?:number}|undefined;
  const geometry=entry?.geometry,unitScale=entry?.unitScale;
  if(!(geometry instanceof THREE.BufferGeometry)||typeof unitScale!=='number'||!Number.isFinite(unitScale)||unitScale<=0)throw Error('Invalid Solo plane material borrowed geometry');
 });
 const plane=Map.prototype.get.call(geometries,'plane') as {unitScale:number}|undefined;
 if(!plane||plane.unitScale!==1)throw Error('Missing Solo plane material WORLD plane');
 const textureName=add(options.texture),texture=Map.prototype.get.call(textures,textureName) as THREE.Texture|undefined;
 if(!(texture instanceof THREE.Texture))throw Error('Missing Solo plane material bound texture');
 const rawShader=options.initialShader,rawProvenance=options.shaderProvenance,rawObservation=options.shaderObservation;
 let observation:Readonly<{handle:string;recycled:boolean}>|undefined;
 let shaderProvenance=rawProvenance===undefined?undefined:add(rawProvenance);
 if(rawObservation!==undefined){
  if(!rawObservation||rawShader!==undefined||rawProvenance!==undefined)throw Error('Conflicting Solo plane shader observations');
  const observedPolicy=rawObservation.policy,handle=rawObservation.handle,recycled=rawObservation.recycled,provenance=rawObservation.provenance;
  if(observedPolicy!=='installed-basic-material-uv-with-unit-z'||typeof recycled!=='boolean')throw Error('Invalid installed Solo plane shader observation policy');
  observation=Object.freeze({handle:add(handle),recycled});shaderProvenance=add(provenance);
 }
 if(rawShader!==undefined&&shaderProvenance===undefined)throw Error('Solo plane material shader requires provenance');
 let initialShader=rawShader===undefined?undefined:copyShader(rawShader,add);
 if(initialShader&&initialShader.texture!==textureName)throw Error('Solo plane material shader texture mismatch');
 // Declared inputs/budgets precede acquisition; observing the acquired wrapper
 // is guarded below, with owned-only rollback on unsupported renderer state.
 const material=new THREE.MeshBasicMaterial({map:texture,color:0xffffff,transparent:true,side:THREE.FrontSide,toneMapped:false,depthWrite:false});
 try{
  if(material.map!==texture||Map.prototype.get.call(textures,textureName)!==texture)throw Error('Solo plane material borrowed texture rebound during acquisition');
  if(observation)initialShader=observeShader(material,texture,textureName,observation.handle,observation.recycled);
 }catch(error){
  try{material.dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'Solo plane observation and cleanup failed',{cause:error});}throw error;
 }
 let released=false,materialDisposed=false,textureDisposed=false;
 const onMaterialDispose=()=>{materialDisposed=true;},onTextureDispose=()=>{textureDisposed=true;};
 material.addEventListener('dispose',onMaterialDispose);texture.addEventListener('dispose',onTextureDispose);
 const check=()=>{
  if(released)throw Error('Solo plane material released');
  if(materialDisposed||textureDisposed)throw Error('Solo plane material resource disposed');
  if(material.map!==texture||Map.prototype.get.call(textures,textureName)!==texture)throw Error('Solo plane material borrowed texture rebound');
 };
 const release=()=>{
  if(released)return;released=true;texture.removeEventListener('dispose',onTextureDispose);material.removeEventListener('dispose',onMaterialDispose);
  if(!materialDisposed){materialDisposed=true;material.dispose();}
 };
 return Object.freeze({get planeMaterial(){check();return material;},get initialShader(){check();return initialShader;},get shaderProvenance(){check();return shaderProvenance;},release});
}
