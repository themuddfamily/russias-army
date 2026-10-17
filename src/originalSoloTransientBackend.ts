import * as THREE from 'three';
import type {Vec3,WeaponId} from '../shared/protocol';
import type {ReceiverModelPose,ReceiverModelRotation} from '../shared/originalReceiverModelWorld';
import type {OriginalReceiverTransientBackend,OriginalReceiverTransientInitialShader,OriginalReceiverTransientCloneContext} from '../shared/originalReceiverTransientWorld';

const weapons=['pistol','shotgun','rifle','sniper'] as const;
export interface OriginalSoloTransientSeed {
 readonly pose:Readonly<ReceiverModelPose>;readonly geometryProvenance:string;readonly inWorld:boolean;
}
export interface OriginalSoloTransientSeedOptions {
 readonly renderToWorld:readonly number[];readonly phase:number;
 readonly geometryProvenance:string;readonly inWorld:boolean;readonly maxTextChars:number;
}
function bound(n:number):void {if(!Number.isSafeInteger(n)||n<1||n>65536)throw Error('Invalid transient backend text bound');}
function label(v:unknown):asserts v is string {if(typeof v!=='string'||!v.length||v.trim()!==v)throw Error('Invalid transient backend text');}
function vector(v:Readonly<Vec3>):Vec3 {
 if(!v||![v.x,v.y,v.z].every(Number.isFinite))throw Error('Invalid transient backend vector');
 return {x:v.x,y:v.y,z:v.z};
}
function quaternion(v:Readonly<ReceiverModelRotation>):ReceiverModelRotation {
 if(!v||![v.x,v.y,v.z,v.w].every(Number.isFinite)||Math.abs(Math.hypot(v.x,v.y,v.z,v.w)-1)>1e-6)throw Error('Invalid transient backend quaternion');
 return {x:v.x,y:v.y,z:v.z,w:v.w};
}
function pose(p:Readonly<ReceiverModelPose>):ReceiverModelPose {
 if(!p||![p.yaw,p.phase,p.scale].every(Number.isFinite)||p.phase<0||p.scale<=0||!p.rotation)throw Error('Invalid transient backend pose');
 return {position:vector(p.position),yaw:p.yaw,phase:p.phase,scale:p.scale,rotation:quaternion(p.rotation)};
}
function frozenPose(p:Readonly<ReceiverModelPose>):Readonly<ReceiverModelPose> {
 const c=pose(p);return Object.freeze({...c,position:Object.freeze(c.position),rotation:Object.freeze(c.rotation!)});
}
function matrix(v:readonly number[]):THREE.Matrix4 {
 if(!Array.isArray(v)||v.length!==16||Array.from({length:16},(_,i)=>v[i]).some(n=>!Number.isFinite(n))||v[3]!==0||v[7]!==0||v[11]!==0||v[15]!==1)throw Error('Invalid transient backend affine matrix');
 const m=new THREE.Matrix4().fromArray(v),det=m.determinant();
 if(!Number.isFinite(det)||det===0)throw Error('Invalid transient backend singular matrix');
 return m;
}
function copySeed(s:OriginalSoloTransientSeed,maxTextChars:number):OriginalSoloTransientSeed {
 if(!s||typeof s.inWorld!=='boolean')throw Error('Invalid transient backend seed');
 label(s.geometryProvenance);if(s.geometryProvenance.length>maxTextChars)throw Error('Transient backend text budget exceeded');
 return Object.freeze({pose:frozenPose(s.pose),geometryProvenance:s.geometryProvenance,inWorld:s.inWorld});
}
/** Capture an already-updated borrowed mesh without updating its parent tree.
 * Geometry unit conversion belongs to the paired resource provider; attestation
 * belongs to the paired renderer/query provider. No parent/visibility inference. */
export function captureOriginalSoloTransientSeed(mesh:THREE.Mesh,options:OriginalSoloTransientSeedOptions):OriginalSoloTransientSeed {
 if(!(mesh instanceof THREE.Mesh)||!options)throw Error('Invalid transient backend borrowed mesh');
 bound(options.maxTextChars);label(options.geometryProvenance);
 if(options.geometryProvenance.length>options.maxTextChars||typeof options.inWorld!=='boolean'||!Number.isFinite(options.phase)||options.phase<0)throw Error('Invalid transient backend capture metadata');
 const m=matrix(options.renderToWorld).multiply(matrix(mesh.matrixWorld.elements));
 const e=m.elements;if(!e.every(Number.isFinite))throw Error('Transient backend matrix arithmetic overflow');
 const axes=[new THREE.Vector3(e[0],e[1],e[2]),new THREE.Vector3(e[4],e[5],e[6]),new THREE.Vector3(e[8],e[9],e[10])];
 const lengths=axes.map(a=>Math.hypot(a.x,a.y,a.z));
 if(lengths.some(n=>!Number.isFinite(n)||n<=0)||Math.abs(lengths[1]/lengths[0]-1)>1e-8||Math.abs(lengths[2]/lengths[0]-1)>1e-8)throw Error('Transient backend requires uniform scale');
 axes.forEach((a,i)=>a.multiplyScalar(1/lengths[i]));
 if(Math.abs(axes[0].dot(axes[1]))>1e-8||Math.abs(axes[0].dot(axes[2]))>1e-8||Math.abs(axes[1].dot(axes[2]))>1e-8||axes[0].clone().cross(axes[1]).dot(axes[2])<=0)throw Error('Transient backend rejects shear/reflection');
 const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axes[0],axes[1],axes[2])).normalize();
 const p:ReceiverModelPose={position:{x:e[12],y:e[13],z:e[14]},yaw:new THREE.Euler().setFromQuaternion(q,'YXZ').y,phase:options.phase,scale:lengths[0],rotation:{x:q.x,y:q.y,z:q.z,w:q.w}};
 return copySeed({pose:p,geometryProvenance:options.geometryProvenance,inWorld:options.inWorld},options.maxTextChars);
}
export interface OriginalSoloTransientBackendOptions {
 readonly plane:OriginalSoloTransientSeed;readonly planeWidthWorld:number;
 readonly muzzles:Readonly<Record<typeof weapons[number],OriginalSoloTransientSeed>>;
 readonly initialShader?:OriginalReceiverTransientInitialShader;
 /** Shared observations keep their exact alias. Fresh copy material wrappers
  * instead receive a stable shader identity per allocated plane name. */
 readonly initialShaderIdentity?:'shared-observed'|'per-clone-name';
 readonly cloneMembership?:'template'|'copy-effect-birth-parented';
 readonly pointAtPolicy:'copy-plane-positive-z';readonly omittedUpPolicy:'copy-negative-z';
 readonly parallelUpPolicy:'copy-x';readonly explicitUpPolicy:'copy-three-lookat';readonly selfRotatePolicy:'copy-local-xyz';
 readonly coincidentPolicy:'retain'|'reject';readonly maxTextChars:number;
}
function copyShader(s:OriginalReceiverTransientInitialShader):OriginalReceiverTransientInitialShader {
 label(s?.handle);label(s.texture);
 if(typeof s.recycled!=='boolean'||typeof s.emissiveWhite!=='boolean'||!Number.isFinite(s.blend)||(s.specularBlack!==undefined&&typeof s.specularBlack!=='boolean')||(s.shininess!==undefined&&s.shininess!==0)||(s.nearFiltering!==undefined&&s.nearFiltering!==true)||(s.renderFormat!==undefined&&s.renderFormat!=='rgba8888'))throw Error('Invalid transient backend shader');
 return Object.freeze({handle:s.handle,texture:s.texture,recycled:s.recycled,textureScale:Object.freeze(vector(s.textureScale)),texturePosition:Object.freeze(vector(s.texturePosition)),blend:s.blend,emissiveWhite:s.emissiveWhite,
 ...(s.specularBlack!==undefined?{specularBlack:s.specularBlack}:{}),...(s.shininess!==undefined?{shininess:s.shininess}:{}),...(s.nearFiltering!==undefined?{nearFiltering:s.nearFiltering}:{}),...(s.renderFormat!==undefined?{renderFormat:s.renderFormat}:{})});
}
/** Detached copy policies only: +Z plane facing, explicit default-up/fallback
 * and postmultiplied local XYZ rotation. Native clone/axis conventions unproved.
 * The bank, not this adapter, owns models, shaders, pools and clone numbering.
 * Shared shader observations retain their exact alias and reject later
 * inconsistencies. The explicit fresh-material copy policy derives an
 * identity from the allocated plane and observes staged global texture flags. */
export function createOriginalSoloTransientBackend(options:OriginalSoloTransientBackendOptions):OriginalReceiverTransientBackend {
 if(!options)throw Error('Missing transient backend options');bound(options.maxTextChars);
 if(options.pointAtPolicy!=='copy-plane-positive-z'||options.omittedUpPolicy!=='copy-negative-z'||options.parallelUpPolicy!=='copy-x'||options.explicitUpPolicy!=='copy-three-lookat'||options.selfRotatePolicy!=='copy-local-xyz'||!['retain','reject'].includes(options.coincidentPolicy)||!Number.isFinite(options.planeWidthWorld)||options.planeWidthWorld<=0)throw Error('Invalid transient backend policy/width');
 const plane=copySeed(options.plane,options.maxTextChars),muzzles={} as Record<typeof weapons[number],OriginalSoloTransientSeed>;
 let chars=plane.geometryProvenance.length;
 for(const weapon of weapons){muzzles[weapon]=copySeed(options.muzzles?.[weapon],options.maxTextChars);chars+=muzzles[weapon].geometryProvenance.length;}
 const initialShader=options.initialShader===undefined?undefined:copyShader(options.initialShader);
 const shaderIdentity=options.initialShaderIdentity??'shared-observed';
 if(!['shared-observed','per-clone-name'].includes(shaderIdentity)||shaderIdentity==='per-clone-name'&&!initialShader)throw Error('Invalid transient initial shader identity policy');
 const membership=options.cloneMembership??'template';
 if(!['template','copy-effect-birth-parented'].includes(membership))throw Error('Invalid transient clone membership policy');
 if(initialShader)chars+=initialShader.handle.length+initialShader.texture.length;
 if(chars>options.maxTextChars)throw Error('Transient backend text budget exceeded');
 const width=options.planeWidthWorld,maxTextChars=options.maxTextChars,coincident=options.coincidentPolicy;
 const name=(value:string)=>{label(value);if(value.length+chars>maxTextChars)throw Error('Transient backend clone text budget exceeded');};
 const clone=(s:OriginalSoloTransientSeed)=>({pose:pose(s.pose),geometryProvenance:s.geometryProvenance,inWorld:membership==='copy-effect-birth-parented'||s.inWorld});
 return Object.freeze({
  clonePlane:(allocatedName:string,resourceWidthWorld:number,context?:OriginalReceiverTransientCloneContext)=>{
   name(allocatedName);if(resourceWidthWorld!==width)throw Error('Transient backend plane width mismatch');
   let shader=initialShader?copyShader(initialShader):undefined;
   if(shader&&shaderIdentity==='per-clone-name'){
    if(!context||typeof context.readTexture!=='function')throw Error('Fresh plane shader requires staged texture observation');
    const handle=`${initialShader!.handle.length}:${initialShader!.handle}:${allocatedName}`;
    if(handle.length+shader.texture.length+chars>maxTextChars)throw Error('Transient backend clone shader text budget exceeded');
    const observed=context.readTexture(shader.texture);
    const {nearFiltering:_near,renderFormat:_format,...material}=shader;
    shader={...material,handle,...(observed??{...(_near!==undefined?{nearFiltering:_near}:{}),...(_format!==undefined?{renderFormat:_format}:{})})};
   }
   return {...clone(plane),...(shader?{initialShader:shader}:{})};
  },
  cloneMuzzle:(allocatedName:string,weapon:WeaponId)=>{name(allocatedName);if(!Object.hasOwn(muzzles,weapon))throw Error('Unsupported transient backend muzzle');return clone(muzzles[weapon as typeof weapons[number]]);},
  pointAt:(input:Readonly<ReceiverModelPose>,target:Readonly<Vec3>,up?:Readonly<Vec3>)=>{
   const p=pose(input),t=vector(target),v=new THREE.Vector3(t.x-p.position.x,t.y-p.position.y,t.z-p.position.z);
   if(![v.x,v.y,v.z].every(Number.isFinite))throw Error('Transient backend target delta overflow');
   const magnitude=Math.hypot(v.x,v.y,v.z);if(!Number.isFinite(magnitude))throw Error('Transient backend target magnitude overflow');
   if(magnitude===0){if(coincident==='reject')throw Error('Transient backend coincident target');return quaternion(p.rotation!);}
   v.set(v.x/magnitude,v.y/magnitude,v.z/magnitude);const u=up===undefined?{x:0,y:0,z:-1}:vector(up),uy=new THREE.Vector3(u.x,u.y,u.z),un=Math.hypot(u.x,u.y,u.z);
   if(!Number.isFinite(un)||un===0)throw Error('Invalid transient backend up vector');uy.set(uy.x/un,uy.y/un,uy.z/un);
   // Supplied-up blood/bang facing uses the installed renderer's Three policy,
   // including its exact-collinearity perturbation. Omitted-up source facing
   // instead has the documented copy-X fallback, with no perturbation.
   if(up!==undefined){const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(t.x,t.y,t.z),new THREE.Vector3(p.position.x,p.position.y,p.position.z),uy)).normalize();return quaternion(q);}
   const x=new THREE.Vector3().crossVectors(uy,v);
   if(x.lengthSq()===0)x.crossVectors(new THREE.Vector3(1,0,0),v);
   if(x.lengthSq()===0)throw Error('Transient backend parallel fallback is degenerate');
   x.normalize();const y=new THREE.Vector3().crossVectors(v,x).normalize();
   const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,v)).normalize();return quaternion(q);
  },
  selfRotate:(input:Readonly<ReceiverModelRotation>,degrees:Readonly<Vec3>)=>{
   const r=quaternion(input),d=vector(degrees),rad=Math.PI/180;
   const q=new THREE.Quaternion(r.x,r.y,r.z,r.w).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(d.x*rad,d.y*rad,d.z*rad,'XYZ'))).normalize();return quaternion(q);
  },
 });
}
