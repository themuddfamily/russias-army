import * as THREE from 'three';
import type {Vec3} from '../shared/protocol';

export type OriginalPlaneEffectKind='miss'|'blood'|'puff'|'bang';
type Plane=THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
interface Shader {material:THREE.MeshBasicMaterial;texture:THREE.Texture;recycled:boolean}
const textures:Record<OriginalPlaneEffectKind,readonly string[]>={miss:['decal','decalspas'],blood:['spatter'],puff:['pufft'],bang:['banggrenade','bangrocket']};
/** Shared plane FIFO and independent puff/bang shader FIFO. The supplied
 * geometry and source textures are borrowed; shader wrappers are owned.
 * Native global names/first-goody primitive dimensions remain separate. */
export class OriginalEffectPlanePool {
 readonly bloodTexturePosition:Vec3={x:1,y:1,z:0};
 readonly maxModels:number;readonly maxShaders:number;
 private readonly owned=new Set<Plane>();
 private readonly active=new Map<Plane,Shader>();
 private readonly planes:Plane[]=[];
 private readonly shaders=new Set<Shader>();
 private readonly named=new Map<string,Shader>();
 private readonly recycled:Shader[]=[];
 private disposed=false;
 constructor(readonly geometry:THREE.PlaneGeometry,options:{maxModels?:number;maxShaders?:number}={}){
  this.maxModels=options.maxModels??512;this.maxShaders=options.maxShaders??512;
  if(!(geometry instanceof THREE.PlaneGeometry)||![this.maxModels,this.maxShaders].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid effect plane budget/resource');
 }
 get isDisposed():boolean{return this.disposed;}
 preflight(kind:OriginalPlaneEffectKind,textureName:string,replacement?:THREE.Mesh):void {
  if(this.disposed)throw Error('Effect plane pool disposed');
  if(!Object.hasOwn(textures,kind)||!textures[kind].includes(textureName))throw Error('Invalid effect plane texture');
  const old=replacement?this.active.get(replacement as Plane):undefined;
  if(replacement&&!old)throw Error('Foreign effect plane replacement');
  if(!this.planes.length&&!old&&this.owned.size>=this.maxModels)throw Error('Effect plane budget requires scene reset');
  const reusable=kind==='puff'||kind==='bang';
  const needsShader=reusable?this.recycled.length===0&&!old?.recycled:!this.named.has(textureName);
  if(needsShader&&this.shaders.size>=this.maxShaders)throw Error('Effect shader budget requires scene reset');
 }
 acquire(kind:OriginalPlaneEffectKind,textureName:string,sourceTexture:THREE.Texture):Plane {
  if(!(sourceTexture instanceof THREE.Texture))throw Error('Invalid effect source texture');
  this.preflight(kind,textureName);
  const reusable=kind==='puff'||kind==='bang';
  let shader=reusable?this.recycled.shift():this.named.get(textureName);
  if(!shader){
   const texture=sourceTexture.clone(),material=new THREE.MeshBasicMaterial({map:texture,color:0xffffff,transparent:true,side:THREE.FrontSide,toneMapped:false,depthWrite:false});
   shader={texture,material,recycled:reusable};this.shaders.add(shader);if(!reusable)this.named.set(textureName,shader);
  }else if(reusable){
   // Preserve the shader/UV-wrapper identities while changing its source image.
   shader.texture.copy(sourceTexture);shader.texture.needsUpdate=true;
  }
  if(reusable){shader.texture.repeat.set(1,1);shader.texture.offset.set(0,0);shader.texture.updateMatrix();shader.material.needsUpdate=true;}
  let mesh=this.planes.shift();
  if(!mesh){mesh=new THREE.Mesh(this.geometry,shader.material);mesh.name='original-effect-plane';this.owned.add(mesh);}
  mesh.material=shader.material;mesh.visible=true;mesh.matrixAutoUpdate=true;mesh.layers.set(1);
  this.active.set(mesh,shader);return mesh;
 }
 release(mesh:THREE.Mesh):void {
  if(this.disposed)return;
  const plane=mesh as Plane,shader=this.active.get(plane);
  if(!shader)throw Error(this.owned.has(plane)?'Effect plane already released':'Foreign effect plane');
  plane.removeFromParent();this.active.delete(plane);this.planes.push(plane);
  if(shader.recycled)this.recycled.push(shader);
 }
 stats():Readonly<{allocated:number;active:number;pooled:number;shaders:number;recycledShaders:number;freeRecycledShaders:number}>{
  return Object.freeze({allocated:this.owned.size,active:this.active.size,pooled:this.planes.length,shaders:this.shaders.size,recycledShaders:[...this.shaders].filter(s=>s.recycled).length,freeRecycledShaders:this.recycled.length});
 }
 private clearInventory():void {
  for(const mesh of this.owned)mesh.removeFromParent();
  for(const shader of this.shaders){shader.texture.dispose();shader.material.dispose();}
  this.owned.clear();this.active.clear();this.planes.length=0;this.shaders.clear();this.named.clear();this.recycled.length=0;
  Object.assign(this.bloodTexturePosition,{x:1,y:1,z:0});
 }
 reset():void {
  if(this.disposed)throw Error('Effect plane pool disposed');
  if(this.active.size)throw Error('Effect plane reset has active actors');
  this.clearInventory();
 }
 dispose():void {if(this.disposed)return;this.disposed=true;this.clearInventory();}
}
