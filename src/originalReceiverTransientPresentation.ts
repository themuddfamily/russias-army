import * as THREE from 'three';
import {validateOriginalReceiverTransientCheckpoint,type ReceiverTransientCheckpoint} from '../shared/originalReceiverTransientCheckpoint';
import {validateOriginalReceiverTransientResourceDescriptor,type ReceiverTransientResourceDescriptor} from '../shared/originalReceiverTransientResourceDescriptor';
import type {OriginalReceiverTransientModel} from '../shared/originalReceiverTransientWorld';

export interface ReceiverTransientPresentationResources {
 readonly sourceScale:number;readonly planeWidthWorld:number;readonly planeGeometryProvenance:string;readonly provenance:string;
 readonly sidedness:'front'|'back'|'double';readonly resourceBindingId:string;readonly textureBindingId:string;
 readonly geometries:ReadonlyMap<string,Readonly<{geometry:THREE.BufferGeometry;unitScale:number}>>;
 readonly textures:ReadonlyMap<string,THREE.Texture>;
}
export interface OriginalReceiverTransientPresentationOptions {
 readonly sceneGeneration:number;readonly maxModels:number;readonly maxShaders:number;readonly maxTextChars:number;
 readonly resourceBindingId:string;readonly textureBindingId:string;readonly side:THREE.Side;readonly nearFilter:THREE.MagnificationTextureFilter;
}
interface ShaderBinding {readonly material:THREE.MeshBasicMaterial;readonly texture:THREE.Texture}
interface ModelBinding {readonly resource:string;readonly name:string;readonly geometryProvenance:string;readonly mesh:THREE.Mesh}
const families=['plane','mfpistol','mfspas12','mfak47','mfdragunov'];
function affine(matrix:THREE.Matrix4):THREE.Matrix4 {
 const m=matrix.elements;for(let i=0;i<16;i++)if(!Number.isFinite(m[i]))throw Error('Transient render matrix overflow');
 if(m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)throw Error('Invalid transient render affine');return matrix;
}
function generated(matrix:THREE.Matrix4):THREE.Matrix4 {
 for(let i=0;i<16;i++)if(!Number.isFinite(matrix.elements[i]))throw Error('Transient render conversion overflow');
 matrix.elements[3]=matrix.elements[7]=matrix.elements[11]=0;matrix.elements[15]=1;return matrix;
}
function rawWorld(model:Readonly<OriginalReceiverTransientModel>,sourceScale:number):THREE.Matrix4 {
 if(model.worldMatrix){const m=model.worldMatrix,values:number[]=[];for(let i=0;i<16;i++)values.push(m[i]);return affine(new THREE.Matrix4().fromArray(values));}
 const p=model.pose,q=p.rotation?new THREE.Quaternion(p.rotation.x,p.rotation.y,p.rotation.z,p.rotation.w):new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.yaw),scale=p.scale*(model.resource==='plane'?1:sourceScale);
 return generated(new THREE.Matrix4().compose(new THREE.Vector3(p.position.x,p.position.y,p.position.z),q,new THREE.Vector3(scale,scale,scale)));
}
/** Borrowed immutable-pack attestation and modern unlit/UV/filter adapter.
 * Owns only meshes and shader/texture wrappers. Native lighting, texture Z,
 * primitive defaults and raster equivalence are not inferred. Trusted Three
 * hooks can throw after writes; adoption is preflighted, not atomic rollback. */
export class OriginalReceiverTransientPresentation {
 private readonly options:Readonly<OriginalReceiverTransientPresentationOptions>;
 private readonly metadata:Readonly<Omit<ReceiverTransientPresentationResources,'geometries'|'textures'>>;
 private readonly geometries=new Map<string,Readonly<{geometry:THREE.BufferGeometry;unitScale:number}>>();
 private readonly textures=new Map<string,THREE.Texture>();private readonly ownedTextures=new Set<THREE.Texture>();private readonly models=new Map<string,ModelBinding>();private readonly shaders=new Map<string,ShaderBinding>();
 private checkpoint?:ReceiverTransientCheckpoint;private descriptor?:ReceiverTransientResourceDescriptor;private lastReceiptTick?:number;
 private closed=false;private busy=false;private failed=false;
 constructor(resources:ReceiverTransientPresentationResources,private readonly parent:THREE.Object3D,options:OriginalReceiverTransientPresentationOptions){
  const sceneGeneration=options.sceneGeneration,maxModels=options.maxModels,maxShaders=options.maxShaders,maxTextChars=options.maxTextChars,resourceBindingId=options.resourceBindingId,textureBindingId=options.textureBindingId,side=options.side,nearFilter=options.nearFilter;
  if(!(parent instanceof THREE.Object3D)||!Number.isSafeInteger(sceneGeneration)||sceneGeneration<0||![maxModels,maxShaders].every(n=>Number.isSafeInteger(n)&&n>0&&n<=256)||!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536||typeof resourceBindingId!=='string'||!resourceBindingId||typeof textureBindingId!=='string'||!textureBindingId||resourceBindingId.length+textureBindingId.length>maxTextChars||![THREE.FrontSide,THREE.BackSide,THREE.DoubleSide].includes(side)||![THREE.NearestFilter,THREE.LinearFilter].includes(nearFilter))throw Error('Invalid transient presentation options');
  this.options=Object.freeze({sceneGeneration,maxModels,maxShaders,maxTextChars,resourceBindingId,textureBindingId,side,nearFilter});
  const sourceScale=resources.sourceScale,planeWidthWorld=resources.planeWidthWorld,planeGeometryProvenance=resources.planeGeometryProvenance,provenance=resources.provenance,sidedness=resources.sidedness,bankId=resources.resourceBindingId,textureId=resources.textureBindingId,geometries=resources.geometries,textures=resources.textures;
  if(!Number.isFinite(sourceScale)||sourceScale<=0||!Number.isFinite(planeWidthWorld)||planeWidthWorld<=0||typeof planeGeometryProvenance!=='string'||!planeGeometryProvenance||typeof provenance!=='string'||!provenance||bankId!==resourceBindingId||textureId!==textureBindingId||!['front','back','double'].includes(sidedness)||!(geometries instanceof Map)||!(textures instanceof Map)||Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!.call(geometries)>5||Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!.call(textures)>256)throw Error('Invalid transient presentation resource bank');
  let text=planeGeometryProvenance.length+provenance.length+bankId.length+textureId.length+sidedness.length;if(text>maxTextChars)throw Error('Transient render bank text budget exceeded');
  let geometryCount=0,textureCount=0;
  Map.prototype.forEach.call(geometries,(entry:Readonly<{geometry:THREE.BufferGeometry;unitScale:number}>,name:string)=>{if(++geometryCount>5)throw Error('Transient render geometry count exceeded');const geometry=entry?.geometry,unitScale=entry?.unitScale;if(!families.includes(name)||!(geometry instanceof THREE.BufferGeometry)||!Number.isFinite(unitScale)||unitScale<=0||name==='plane'&&unitScale!==1)throw Error('Invalid transient render geometry');text+=name.length;if(text>maxTextChars)throw Error('Transient render bank text budget exceeded');this.geometries.set(name,Object.freeze({geometry,unitScale}));});
  Map.prototype.forEach.call(textures,(texture:THREE.Texture,name:string)=>{if(++textureCount>256)throw Error('Transient render texture count exceeded');if(typeof name!=='string'||!name||!(texture instanceof THREE.Texture))throw Error('Invalid transient render texture');text+=name.length;if(text>maxTextChars)throw Error('Transient render bank text budget exceeded');this.textures.set(name,texture);});
  this.metadata=Object.freeze({sourceScale,planeWidthWorld,planeGeometryProvenance,provenance,sidedness,resourceBindingId:bankId,textureBindingId:textureId});
 }
 private read():void {if(this.closed)throw Error('Transient presentation disposed');}
 private check():void {if(this.failed||this.closed)throw Error('Transient presentation rejected');}
 private operation<T>(fn:()=>T):T {if(this.busy){this.failed=true;throw Error('Recursive transient presentation');}this.read();this.busy=true;this.failed=false;try{const value=fn();this.check();return value;}finally{this.busy=false;}}
 private inverseParent():THREE.Matrix4 {
  const seen=new Set<THREE.Object3D>();for(let node:THREE.Object3D|null=this.parent;node;node=node.parent){if(seen.has(node))throw Error('Cyclic transient render parent');seen.add(node);for(const binding of this.models.values())if(node===binding.mesh)throw Error('Owned transient cannot parent render root');}
  this.parent.updateWorldMatrix(true,false);this.check();affine(this.parent.matrixWorld);const det=this.parent.matrixWorld.determinant();if(!Number.isFinite(det)||det===0)throw Error('Singular transient render parent');return generated(this.parent.matrixWorld.clone().invert());
 }
 adopt(checkpoint:ReceiverTransientCheckpoint,descriptor:ReceiverTransientResourceDescriptor):void {this.operation(()=>{
  const o=this.options,m=this.metadata;validateOriginalReceiverTransientCheckpoint(checkpoint,{maxModels:o.maxModels,maxActors:256,maxShaders:o.maxShaders,maxTextures:256,maxPoolEntries:256,maxTextChars:o.maxTextChars});validateOriginalReceiverTransientResourceDescriptor(descriptor,o.maxTextChars);
  if(checkpoint.sceneGeneration!==o.sceneGeneration||checkpoint.prefix.sceneGeneration!==o.sceneGeneration||descriptor.resourceBindingId!==o.resourceBindingId||descriptor.textureBindingId!==o.textureBindingId||this.descriptor&&this.descriptor!==descriptor||descriptor.sourceScale!==m.sourceScale||descriptor.planeWidthWorld!==m.planeWidthWorld||descriptor.planeGeometryProvenance!==m.planeGeometryProvenance||descriptor.provenance!==m.provenance||descriptor.sidedness!==m.sidedness||checkpoint.planeWidthWorld!==null&&checkpoint.planeWidthWorld!==m.planeWidthWorld)throw Error('Foreign transient render resource binding');
  const expectedSide=m.sidedness==='front'?THREE.FrontSide:m.sidedness==='back'?THREE.BackSide:THREE.DoubleSide;if(o.side!==expectedSide)throw Error('Transient render side policy differs from binding');
  if(descriptor.textureNames.length!==this.textures.size)throw Error('Transient render texture pack mismatch');for(let i=0;i<descriptor.textureNames.length;i++)if(!this.textures.has(descriptor.textureNames[i]))throw Error('Missing transient render bound texture');
  const prefix=checkpoint.prefix;if(this.checkpoint&&(prefix.callback<this.checkpoint.prefix.callback||prefix.kind==='receipt'&&this.lastReceiptTick!==undefined&&prefix.tick<this.lastReceiptTick))throw Error('Replayed transient presentation');
  const modelEntries=new Map(checkpoint.models.map(entry=>[entry.handle,entry])),shaderEntries=new Map(checkpoint.shaders.map(entry=>[entry.handle,entry]));
  for(const [handle,old] of this.models){const entry=modelEntries.get(handle);if(!entry||entry.resource!==old.resource||entry.name!==old.name||entry.geometryProvenance!==old.geometryProvenance)throw Error('Transient model catalog changed or deleted');}
  for(const handle of this.shaders.keys())if(!shaderEntries.has(handle))throw Error('Transient shader catalog deleted');
  for(const texture of checkpoint.textures)if(!this.textures.has(texture.name))throw Error('Unknown transient render texture');
  const priorModels=new Map(this.checkpoint?.models.map(entry=>[entry.handle,entry])??[]);
  const checkParents=()=>{for(const [handle,binding] of this.models){const old=priorModels.get(handle);if(binding.mesh.parent!==(old?.inWorld?this.parent:null))throw Error('Foreign transient model parent');}};checkParents();
  const inverse=this.inverseParent();checkParents();const locals=new Map<string,THREE.Matrix4>();
  for(const model of checkpoint.models){const resource=this.geometries.get(model.resource);if(!resource)throw Error('Missing transient render geometry');const raw=rawWorld(model,m.sourceScale),meshWorld=generated(raw.multiply(new THREE.Matrix4().makeScale(1/resource.unitScale,1/resource.unitScale,1/resource.unitScale)));locals.set(model.handle,model.inWorld?generated(inverse.clone().multiply(meshWorld)):meshWorld);}
  const textureFlags=new Map(checkpoint.textures.map(texture=>[texture.name,texture]));
  const uv=new Map<string,{source:THREE.Texture;repeat:THREE.Vector2;offset:THREE.Vector2;opacity:number;near:boolean}>();
  for(const shader of checkpoint.shaders){const source=this.textures.get(shader.texture),sx=shader.textureScale.x,sy=shader.textureScale.y,px=shader.texturePosition.x,py=shader.texturePosition.y,rx=1/sx,ry=1/sy,ox=-px/sx,oy=1-(py+1)/sy,opacity=shader.blend/100;if(!source||![rx,ry,ox,oy,opacity].every(Number.isFinite))throw Error('Unsupported transient render texture transform');uv.set(shader.handle,{source,repeat:new THREE.Vector2(rx,ry),offset:new THREE.Vector2(ox,oy),opacity,near:textureFlags.get(shader.texture)!.nearFiltering===true});}
  let newShaders=0;for(const shader of checkpoint.shaders)if(!this.shaders.has(shader.handle))newShaders++;if(this.ownedTextures.size+newShaders>o.maxShaders)throw Error('Transient texture wrapper budget exhausted');
  this.check();
  for(const shader of checkpoint.shaders)if(!this.shaders.has(shader.handle)){
   if(this.ownedTextures.size>=o.maxShaders)throw Error('Transient texture wrapper budget exhausted');
   const texture=uv.get(shader.handle)!.source.clone();
   if(!(texture instanceof THREE.Texture)||this.ownedTextures.has(texture)||[...this.textures.values()].includes(texture))throw Error('Foreign transient texture clone');
   this.ownedTextures.add(texture);this.check();
   const material=new THREE.MeshBasicMaterial({map:texture,color:0xffffff,transparent:true,side:o.side,toneMapped:false,depthWrite:false});this.shaders.set(shader.handle,{texture,material});this.check();
  }
  for(const model of checkpoint.models)if(!this.models.has(model.handle)){const mesh=new THREE.Mesh(this.geometries.get(model.resource)!.geometry,this.shaders.get(model.shaderHandle)!.material);mesh.name=model.name;mesh.layers.set(1);this.models.set(model.handle,{resource:model.resource,name:model.name,geometryProvenance:model.geometryProvenance,mesh});}
  for(const shader of checkpoint.shaders){const binding=this.shaders.get(shader.handle)!,state=uv.get(shader.handle)!;binding.texture.copy(state.source);this.check();binding.texture.wrapS=binding.texture.wrapT=THREE.RepeatWrapping;binding.texture.repeat.copy(state.repeat);binding.texture.offset.copy(state.offset);if(state.near){binding.texture.magFilter=o.nearFilter;binding.texture.minFilter=o.nearFilter;binding.texture.generateMipmaps=false;}binding.texture.updateMatrix();binding.texture.needsUpdate=true;binding.material.opacity=state.opacity;binding.material.needsUpdate=true;this.check();}
  for(const model of checkpoint.models){const mesh=this.models.get(model.handle)!.mesh;mesh.material=this.shaders.get(model.shaderHandle)!.material;if(model.inWorld)this.parent.add(mesh);else mesh.removeFromParent();this.check();mesh.matrixAutoUpdate=false;mesh.matrixWorldAutoUpdate=true;mesh.matrix.copy(locals.get(model.handle)!);mesh.visible=model.inWorld;mesh.matrixWorldNeedsUpdate=true;mesh.updateWorldMatrix(true,false);this.check();}
  this.descriptor=descriptor;this.checkpoint=checkpoint;if(prefix.kind==='receipt')this.lastReceiptTick=prefix.tick;
 });}
 rebase():void {if(this.checkpoint&&this.descriptor){this.adopt(this.checkpoint,this.descriptor);return;}this.operation(()=>{if(this.models.size||this.shaders.size)throw Error('Uncommitted transient resources require adoption or disposal');this.inverseParent();});}
 freeze():ReceiverTransientCheckpoint|undefined{return this.checkpoint;}
 readModel(handle:string):THREE.Mesh|undefined{this.read();return this.models.get(handle)?.mesh;}
 readMaterial(handle:string):THREE.MeshBasicMaterial|undefined{this.read();return this.shaders.get(handle)?.material;}
 private disposalComplete=false;
 get isDisposed():boolean {return this.disposalComplete;}
 dispose():void {if(this.closed){if(!this.disposalComplete)throw Error('Presentation cleanup still active');return;}if(this.busy){this.failed=true;throw Error('Recursive transient presentation disposal');}this.closed=true;const meshes=[...this.models.values()],shaders=[...this.shaders.values()],textures=[...this.ownedTextures];this.models.clear();this.shaders.clear();this.ownedTextures.clear();this.geometries.clear();this.textures.clear();this.checkpoint=undefined;this.descriptor=undefined;this.lastReceiptTick=undefined;const errors:unknown[]=[];for(const {mesh} of meshes)try{mesh.removeFromParent();}catch(error){errors.push(error);}for(const binding of shaders)try{binding.material.dispose();}catch(error){errors.push(error);}for(const texture of textures)try{texture.dispose();}catch(error){errors.push(error);}this.disposalComplete=true;if(errors.length)throw new AggregateError(errors,'Transient presentation disposal failed');}
}
