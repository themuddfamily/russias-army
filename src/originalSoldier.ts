import * as THREE from 'three';
import {OriginalMuzzleModelPool} from './originalMuzzleModelPool';
import type {WeaponId} from './weapons';
import type {SoldierAnimationState,SoldierDetailLevel} from './soldierModel';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import type {Vec3} from '../shared/protocol';
import {createOriginalWeaponGeometry,ORIGINAL_WEAPON_RESOURCES,type OriginalWeaponAssets,type OriginalMeshData} from './originalWeapons';

export const ORIGINAL_GI_SCALE=.045*ORIGINAL_MAP_SCALE;
export const ORIGINAL_GI_ROOT_HEIGHT=55*ORIGINAL_MAP_SCALE;
export const ORIGINAL_GI_RIGHT_FINGERS=22;
/** Recovered GI bounding sphere, source model scale and fadeaway multiplier. */
export const ORIGINAL_GI_DEATH_RADIUS=1726.8026123046875*.045*.75*ORIGINAL_MAP_SCALE;
const FLASH_RESOURCES:Partial<Record<WeaponId,string>>={rifle:'mfak47',shotgun:'mfspas12',pistol:'mfpistol',sniper:'mfdragunov'};
type SourceNodeSnapshot={parent:THREE.Object3D|null;position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3;matrix:THREE.Matrix4;world:THREE.Matrix4;auto:boolean;worldAuto:boolean;dirty:boolean;visible:boolean};
const saveSourceNode=(node:THREE.Object3D):SourceNodeSnapshot=>({parent:node.parent,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone(),matrix:node.matrix.clone(),world:node.matrixWorld.clone(),auto:node.matrixAutoUpdate,worldAuto:node.matrixWorldAutoUpdate,dirty:node.matrixWorldNeedsUpdate,visible:node.visible});
function sourceAffineCopy(value:THREE.Matrix4):THREE.Matrix4 {
 if(!(value instanceof THREE.Matrix4))throw Error('Invalid source model WORLD');const input=value.elements;
 if(!Array.isArray(input)||input.length!==16)throw Error('Invalid source model WORLD');const output:number[]=[];
 for(let i=0;i<16;i++){const n=input[i];if(!Number.isFinite(n))throw Error('Invalid source model WORLD');output.push(n);}
 if(output[3]!==0||output[7]!==0||output[11]!==0||output[15]!==1)throw Error('Invalid source model affine');return new THREE.Matrix4().fromArray(output);
}
function sourceGeneratedAffine(matrix:THREE.Matrix4):THREE.Matrix4 {
 if(!matrix.elements.every(Number.isFinite))throw Error('Source model transform overflow');matrix.elements[3]=0;matrix.elements[7]=0;matrix.elements[11]=0;matrix.elements[15]=1;return matrix;
}
interface BoneData {name:string;parent:number;length:number;displacement:number[];quaternion_xyzw:number[]}
interface MotionKey {time:number;position:number[];quaternion_xyzw:number[];scale:number[]}
interface MotionTrack {bone:string;keys:MotionKey[]}
export interface OriginalSoldierAssets {
  geometry:{meshes:Array<OriginalMeshData&{bone_indices:number[][];bone_weights:number[][]}>};
  rigMotion:{rigs:Array<{name:string;bones:BoneData[]}>;motions:Array<{name:string;tracks:MotionTrack[]}>};
  texture:THREE.Texture;
}
export interface OriginalSoldierConstructorCapture {
  readonly kind:'copy-fresh-soldier-constructor';readonly provenance:string;readonly resourceBindingId?:string;
  readonly phase:0;readonly boneCount:25;
  readonly gi:Readonly<{resource:'GI';geometry:THREE.BufferGeometry;material:THREE.MeshBasicMaterial;worldMatrix:readonly number[];resourceOrientation:Readonly<{x:number;y:number;z:number;w:number}>}>;
  /** Recovered bone23 is zero-based ORIGINAL_GI_RIGHT_FINGERS (22). */
  readonly bone23WorldMatrix:readonly number[];readonly selectedWeapon:WeaponId;
  readonly gun:Readonly<{weapon:WeaponId;resource:string;geometry:THREE.BufferGeometry;material:THREE.MeshBasicMaterial;worldMatrix:readonly number[]}>;
}
export interface OriginalSoldierGunConstructorCapture {
  readonly kind:'copy-fresh-gun-mesh-constructor';readonly provenance:string;readonly resourceBindingId?:string;
  readonly phase:0;readonly weapon:WeaponId;readonly resource:string;
  readonly geometry:THREE.BufferGeometry;readonly material:THREE.MeshBasicMaterial;
  readonly worldMatrix:readonly number[];readonly localMatrix:readonly number[];readonly inWorld:false;
}
const constructorCaptures=new WeakSet<object>(),gunConstructorCaptures=new WeakSet<object>();
export function isOriginalSoldierConstructorCapture(value:unknown):value is OriginalSoldierConstructorCapture {return typeof value==='object'&&value!==null&&constructorCaptures.has(value);}
export function isOriginalSoldierGunConstructorCapture(value:unknown):value is OriginalSoldierGunConstructorCapture {return typeof value==='object'&&value!==null&&gunConstructorCaptures.has(value);}
/** Fixed-size constructor observation only; no WORLD update or asset freeze. */
const constructorMatrix=(value:THREE.Matrix4):readonly number[]=>Object.freeze([...value.elements]);
export interface OriginalSoldierResources {
  /** Caller attestation for the same immutable decoded pack; not a content proof. */
  readonly resourceBindingId?:string;
  assets:OriginalSoldierAssets;geometry:THREE.BufferGeometry;material:THREE.MeshBasicMaterial;
  gunGeometries:Map<string,THREE.BufferGeometry>;gunMaterials:Map<string,THREE.MeshBasicMaterial>;
  readonly muzzleModels:OriginalMuzzleModelPool;
  /** Owns geometry/materials only; all supplied textures remain caller-owned. */
  dispose():void;
}
function configureTexture(texture:THREE.Texture):void {texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.needsUpdate=true;}
export async function loadOriginalSoldierAssets(base='/assets/original-soldier'):Promise<OriginalSoldierAssets> {
  const json=async(file:string)=>{const response=await fetch(`${base}/${file}`);if(!response.ok)throw new Error(`Original GI ${file} unavailable (${response.status})`);return response.json();};
  const [geometry,rigMotion,texture]=await Promise.all([json('geometry.json'),json('rig-motion.json'),new THREE.TextureLoader().loadAsync(`${base}/GI.png`)]);
  configureTexture(texture);return {geometry,rigMotion,texture};
}
export function createOriginalSoldierResources(assets:OriginalSoldierAssets,weapons:OriginalWeaponAssets,options?:{resourceBindingId?:string;maxBindingTextChars?:number}):OriginalSoldierResources {
  const resourceBindingId=options?.resourceBindingId,capturedCap=options?.maxBindingTextChars,maxBindingTextChars=capturedCap===undefined?65536:capturedCap;
  if(!Number.isSafeInteger(maxBindingTextChars)||maxBindingTextChars<=0||resourceBindingId!==undefined&&(typeof resourceBindingId!=='string'||!resourceBindingId||resourceBindingId.length>maxBindingTextChars))throw Error('Invalid original soldier resource binding');
  const source=assets.geometry.meshes.find(mesh=>mesh.resource==='GI');if(!source)throw new Error('Original GI mesh missing');
  const geometry=new THREE.BufferGeometry();geometry.name='original-GI';
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions.flat(),3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(source.normals.flat(),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(source.tex_coords[0].flatMap(([u,v])=>[u+.5,.5-v]),2));geometry.setIndex(source.faces.flat());
  const indices:number[]=[],weights:number[]=[];
  for(let vertex=0;vertex<source.positions.length;vertex++){
    if(source.bone_indices[vertex].length>4)throw new Error('Original GI exceeds four skin influences');
    for(let slot=0;slot<4;slot++){indices.push(source.bone_indices[vertex][slot]??0);weights.push(source.bone_weights[vertex][slot]??0);}
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  configureTexture(assets.texture);
  // Runtime GI uses emissive rgb200/specular black. Unlit tint is a WebGL approximation of that standard shader.
  const material=new THREE.MeshBasicMaterial({name:'original-GI-runtime',map:assets.texture,color:0xc8c8c8,toneMapped:false});
  const gunGeometries=new Map<string,THREE.BufferGeometry>(),gunMaterials=new Map<string,THREE.MeshBasicMaterial>();
  for(const data of weapons.geometry.meshes)gunGeometries.set(data.resource,createOriginalWeaponGeometry(data));
  for(const [name,texture] of weapons.textures){configureTexture(texture);const flash=name==='mfmachinegun';gunMaterials.set(name,new THREE.MeshBasicMaterial({name:`original-GI-gun-${name}`,map:texture,toneMapped:false,side:flash?THREE.DoubleSide:THREE.FrontSide,transparent:flash,depthWrite:!flash}));}
  const muzzleModels=new OriginalMuzzleModelPool(resource=>{
    const geometry=gunGeometries.get(resource),material=gunMaterials.get('mfmachinegun');
    if(!geometry||!material)throw Error('Original muzzle resource missing');
    const mesh=new THREE.Mesh(geometry,material);mesh.name='original-GI-shot-flash';return mesh;
  });
  let disposed=false;
  const resources:OriginalSoldierResources={assets,geometry,material,gunGeometries,gunMaterials,muzzleModels,dispose(){if(disposed)return;disposed=true;muzzleModels.dispose();geometry.dispose();material.dispose();for(const geometry of gunGeometries.values())geometry.dispose();for(const material of gunMaterials.values())material.dispose();}};
  if(resourceBindingId!==undefined)Object.defineProperty(resources,'resourceBindingId',{value:resourceBindingId,enumerable:true,writable:false,configurable:false});
  return resources;
}

export interface DetachedSourceFlashes {
  readonly count:number;
  step(deltaSeconds:number):void;
  clear():void;
}

/** Original rigid GI skin and recorded keys. No procedural kit, IK, aim pose or replacement LOD. */
export class OriginalSoldier {
  readonly group=new THREE.Group();readonly visual=this.group;readonly presentation='legacy' as const;
  readonly mesh:THREE.SkinnedMesh;readonly bones:THREE.Bone[];readonly skeleton:THREE.Skeleton;
  /** Source model-under-ray targets the actual skinned GI, excluding held guns. */
  readonly hitMeshes:THREE.SkinnedMesh[];
  readonly nativeRoot=new THREE.Group();readonly weaponRoot=new THREE.Group();readonly muzzle=new THREE.Object3D();
  private readonly gunModels=new Map<WeaponId,THREE.Mesh>();
  private readonly gunConstructorCaptures=new Map<WeaponId,OriginalSoldierGunConstructorCapture>();
  private readonly constructorSeedCapture:OriginalSoldierConstructorCapture;
  private readonly sourceGunWorld=new Map<WeaponId,THREE.Matrix4>();
  private readonly sourceGunMembership=new Map<WeaponId,boolean>();
  private readonly tracks:Map<string,MotionTrack>;
  private flashCallbackAccumulator=0;
  private sourceTransientPresentationRetired=false;
  private readonly flashRecords:Array<{mesh:THREE.Mesh;bangtime:number;world:THREE.Matrix4}>=[];
  private readonly scratchPosition=new THREE.Vector3();private readonly scratchRotation=new THREE.Quaternion();private readonly scratchScale=new THREE.Vector3();
  private readonly correction=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,THREE.MathUtils.degToRad(170),THREE.MathUtils.degToRad(10),'ZYX'));
  private readonly inverseRoot=new THREE.Matrix4();
  private readonly gunWorldMatrix=new THREE.Matrix4();
  private readonly previousBoneWorld=new THREE.Matrix4();
  private readonly nativeRootBasis=new THREE.Quaternion();
  private sourceBirthWorld?:THREE.Matrix4;
  private readonly gunOffset=new THREE.Vector3();
  private readonly unitScale=new THREE.Vector3(1,1,1);
  private sourceOldWeapon?:WeaponId;
  private sourceModelBusy=false;private sourceModelFailed=false;
  private adoptedGI?:{world:THREE.Matrix4;phase:number;inWorld:boolean};
  private adoptedGuns=new Map<THREE.Mesh,{id:WeaponId;world:THREE.Matrix4;parent:THREE.Object3D;inWorld:boolean;saved:SourceNodeSnapshot;previousWorld:THREE.Matrix4;previousMembership:boolean|undefined}>();
  private sourceGISnapshot?:{node:SourceNodeSnapshot;groupVisible:boolean;time:number;previousBone:THREE.Matrix4;bones:Array<{position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3}>};
  private sourceModelGunWorld?:THREE.Matrix4;
  private currentWeapon:WeaponId;private alive=true;private removed=false;private deathBon=0;private timeMs=0;private wasFiring=false;private disposed=false;
  constructor(private readonly resources:OriginalSoldierResources,options:{name?:string;weapon?:WeaponId;castShadow?:boolean}={}){
    this.currentWeapon=options.weapon??'rifle';this.group.name='original-soldier';this.setName(options.name);
    this.nativeRoot.name='original-GI-native';this.nativeRoot.position.y=ORIGINAL_GI_ROOT_HEIGHT;
    // Native Z-up -> world Y-up; source +X-facing becomes caller's local +Z.
    this.nativeRoot.quaternion.setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
    this.nativeRootBasis.copy(this.nativeRoot.quaternion);
    this.nativeRoot.scale.setScalar(ORIGINAL_GI_SCALE);this.group.add(this.nativeRoot,this.weaponRoot);
    const rig=resources.assets.rigMotion.rigs.find(rig=>rig.name==='GI');if(!rig||rig.bones.length!==25)throw new Error('Original25-bone GI rig missing');
    this.bones=rig.bones.map(data=>{const bone=new THREE.Bone();bone.name=data.name;bone.position.fromArray(data.displacement);if(data.parent>=0)bone.position.x+=rig.bones[data.parent].length;bone.quaternion.fromArray(data.quaternion_xyzw).normalize();return bone;});
    rig.bones.forEach((data,index)=>{if(data.parent>=0)this.bones[data.parent].add(this.bones[index]);else this.nativeRoot.add(this.bones[index]);});
    this.mesh=new THREE.SkinnedMesh(resources.geometry,resources.material);this.mesh.name='original-GI-skin';this.mesh.castShadow=options.castShadow??false;this.mesh.frustumCulled=false;this.nativeRoot.add(this.mesh);
    this.hitMeshes=[this.mesh];
    this.group.updateMatrixWorld(true);this.skeleton=new THREE.Skeleton(this.bones);this.mesh.bind(this.skeleton,this.mesh.matrixWorld);
    const motion=resources.assets.rigMotion.motions.find(motion=>motion.name==='GI');if(!motion)throw new Error('Original GI motion missing');this.tracks=new Map(motion.tracks.map(track=>[track.bone,track]));
    this.weaponRoot.add(this.muzzle);this.setWeapon(this.currentWeapon);this.sampleMotion(0);this.captureBonePose();this.updateGunPose();
    this.weaponRoot.updateWorldMatrix(true,true);
    for(const [id,model] of this.gunModels){this.sourceGunWorld.set(id,model.matrixWorld.clone());this.sourceGunMembership.set(id,true);}
    // Observe only the updates already performed by this constructor.
    const selected=this.gunModels.get(this.currentWeapon)!,basis=this.nativeRootBasis,resourceBindingId=resources.resourceBindingId;
    const capture:OriginalSoldierConstructorCapture=Object.freeze({kind:'copy-fresh-soldier-constructor',provenance:'installed OriginalSoldier copy constructor after phase-zero sampling',...(resourceBindingId!==undefined?{resourceBindingId}:{}),phase:0,boneCount:25,
      gi:Object.freeze({resource:'GI',geometry:resources.geometry,material:resources.material,worldMatrix:constructorMatrix(this.nativeRoot.matrixWorld),resourceOrientation:Object.freeze({x:basis.x,y:basis.y,z:basis.z,w:basis.w})}),
      bone23WorldMatrix:constructorMatrix(this.previousBoneWorld),selectedWeapon:this.currentWeapon,
      gun:Object.freeze({weapon:this.currentWeapon,resource:ORIGINAL_WEAPON_RESOURCES[this.currentWeapon],geometry:selected.geometry,material:selected.material as THREE.MeshBasicMaterial,worldMatrix:constructorMatrix(selected.matrixWorld)})});
    this.constructorSeedCapture=capture;constructorCaptures.add(capture);
  }
  /** Historical fresh-constructor evidence, never the rig's current pose.
   * Borrowed resource references require their original generation to survive. */
  readConstructorSeedCapture():OriginalSoldierConstructorCapture {
    if(this.disposed||this.resources.muzzleModels.isDisposed)throw Error('Original soldier constructor capture unavailable');return this.constructorSeedCapture;
  }
  /** Pure first-allocation lookup. An unconstructed gun returns undefined. */
  readGunConstructorSeedCapture(weapon:WeaponId):OriginalSoldierGunConstructorCapture|undefined {
    if(this.disposed||this.resources.muzzleModels.isDisposed)throw Error('Original soldier gun constructor capture unavailable');return this.gunConstructorCaptures.get(weapon);
  }
  get weapon():WeaponId{return this.currentWeapon;}
  private sourceModelOperation<T>(operation:()=>T):T {
    if(this.sourceModelBusy){this.sourceModelFailed=true;throw Error('Recursive source model adoption');}if(this.disposed)throw Error('Disposed source GI');
    this.sourceModelBusy=true;this.sourceModelFailed=false;try{const result=operation();if(this.sourceModelFailed)throw Error('Source model adoption rejected');return result;}finally{this.sourceModelBusy=false;}
  }
  private rejectLegacySourceModelWrite(gi=false,model?:THREE.Mesh):void {
    if(this.sourceModelBusy){this.sourceModelFailed=true;throw Error('Recursive source model adoption');}
    if((gi&&this.adoptedGI)||(model&&this.adoptedGuns.has(model)))throw Error('Explicit source model owner active');
  }
  private sourceModelLocal(world:THREE.Matrix4,parent:THREE.Object3D,inWorld=true):THREE.Matrix4 {
    parent.updateWorldMatrix(true,false);const parentWorld=sourceAffineCopy(parent.matrixWorld),det=parentWorld.determinant();
    if(!Number.isFinite(det)||det===0)throw Error('Singular source model parent');const inverse=sourceGeneratedAffine(parentWorld.invert());return inWorld?sourceGeneratedAffine(inverse.multiply(world)):world;
  }
  private writeSourceModel(node:THREE.Object3D,matrix:THREE.Matrix4,inWorld:boolean):void {
    node.matrixAutoUpdate=false;node.matrixWorldAutoUpdate=true;node.matrix.copy(matrix);node.visible=inWorld;node.matrixWorldNeedsUpdate=true;node.updateWorldMatrix(true,true);
  }
  /** RAW GI resource WORLD, with all basis/units already supplied by the caller.
   * Original bindMatrix and skeleton boneInverses are retained. Attached skin's
   * bindMatrixInverse continues to follow its current WORLD normally. */
  adoptSourceGIWorld(world:THREE.Matrix4,phase:number,inWorld:boolean):void {this.sourceModelOperation(()=>{
    const next=sourceAffineCopy(world),det=next.determinant(),parent=this.nativeRoot.parent;
    if(parent!==this.group||!Number.isFinite(det)||det===0||!Number.isFinite(phase)||phase<0||typeof inWorld!=='boolean')throw Error('Invalid source GI adoption');
    const local=this.sourceModelLocal(next,parent);if(this.sourceModelFailed)throw Error('Source model adoption rejected');
    if(!this.sourceGISnapshot)this.sourceGISnapshot={node:saveSourceNode(this.nativeRoot),groupVisible:this.group.visible,time:this.timeMs,previousBone:this.previousBoneWorld.clone(),bones:this.bones.map(bone=>({position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}))};
    this.adoptedGI={world:next,phase,inWorld};this.group.visible=true;this.writeSourceModel(this.nativeRoot,local,inWorld);this.timeMs=phase;this.sampleMotion(phase/1000);this.captureBonePose();
  });}
  /** WORLD for the actual pre-scaled renderer mesh. This method never applies
   * another resource basis/unit conversion, selects a gun, or disposes it. */
  adoptSourceGunWorld(model:THREE.Mesh,world:THREE.Matrix4,parent:THREE.Object3D,inWorld:boolean):void {this.sourceModelOperation(()=>{
    const entry=[...this.gunModels].find(([,gun])=>gun===model);if(!entry||!(parent instanceof THREE.Object3D)||typeof inWorld!=='boolean')throw Error('Invalid source gun adoption');
    for(let ancestor:THREE.Object3D|null=parent;ancestor;ancestor=ancestor.parent)if(ancestor===model||ancestor===this.nativeRoot||ancestor===this.weaponRoot||ancestor===this.group)throw Error('Invalid source gun adoption parent');
    const next=sourceAffineCopy(world),local=this.sourceModelLocal(next,parent,inWorld);if(this.sourceModelFailed)throw Error('Source model adoption rejected');
    const previous=this.adoptedGuns.get(model);
    const adopted={id:entry[0],world:next,parent,inWorld,saved:previous?.saved??saveSourceNode(model),previousWorld:previous?.previousWorld??this.sourceGunWorld.get(entry[0])!.clone(),previousMembership:previous?previous.previousMembership:this.sourceGunMembership.get(entry[0])};
    this.sourceModelGunWorld??=this.gunWorldMatrix.clone();this.adoptedGuns.set(model,adopted);if(inWorld)parent.add(model);else model.removeFromParent();this.writeSourceModel(model,inWorld?local:next,inWorld);
    this.sourceGunWorld.get(entry[0])!.copy(next);this.sourceGunMembership.set(entry[0],inWorld);
  });}
  /** Parent-only rebasing: no phase sampling, orientgun or callback age. */
  rebaseSourceModelWorlds():void {this.sourceModelOperation(()=>this.rebaseAdoptedSourceModels());}
  private rebaseAdoptedSourceModels():void {
    const gi=this.adoptedGI,parent=this.nativeRoot.parent;if(gi&&parent!==this.group)throw Error('Unsupported source GI parent');const giLocal=gi?this.sourceModelLocal(gi.world,parent!):undefined;
    const guns=[...this.adoptedGuns].map(([model,entry])=>({model,entry,local:this.sourceModelLocal(entry.world,entry.parent,entry.inWorld)}));
    if(this.sourceModelFailed)throw Error('Source model adoption rejected');
    if(gi&&giLocal){this.group.visible=true;this.writeSourceModel(this.nativeRoot,giLocal,gi.inWorld);this.captureBonePose();this.skeleton.update();this.mesh.computeBoundingSphere();if(this.mesh.boundingBox)this.mesh.computeBoundingBox();}
    for(const {model,entry,local} of guns){if(entry.inWorld){if(model.parent!==entry.parent)entry.parent.add(model);}else model.removeFromParent();this.writeSourceModel(model,entry.inWorld?local:entry.world,entry.inWorld);}
  }
  /** Restore one bounded pre-adoption snapshot; resources remain borrowed. */
  releaseSourceModelWorlds():void {this.sourceModelOperation(()=>{
    const errors:unknown[]=[];
    const restore=(node:THREE.Object3D,saved:SourceNodeSnapshot)=>{
      try{if(node.parent!==saved.parent){if(saved.parent)saved.parent.add(node);else node.removeFromParent();}}catch(error){errors.push(error);}
      node.position.copy(saved.position);node.quaternion.copy(saved.quaternion);node.scale.copy(saved.scale);node.matrix.copy(saved.matrix);node.matrixWorld.copy(saved.world);node.matrixAutoUpdate=saved.auto;node.matrixWorldAutoUpdate=saved.worldAuto;node.matrixWorldNeedsUpdate=saved.dirty;node.visible=saved.visible;
    };
    for(const [model,entry] of this.adoptedGuns){restore(model,entry.saved);this.sourceGunWorld.get(entry.id)!.copy(entry.previousWorld);if(entry.previousMembership===undefined)this.sourceGunMembership.delete(entry.id);else this.sourceGunMembership.set(entry.id,entry.previousMembership);}
    this.adoptedGuns.clear();if(this.sourceModelGunWorld)this.gunWorldMatrix.copy(this.sourceModelGunWorld);this.sourceModelGunWorld=undefined;
    const snapshot=this.sourceGISnapshot;this.adoptedGI=undefined;this.sourceGISnapshot=undefined;
    if(snapshot){restore(this.nativeRoot,snapshot.node);this.group.visible=snapshot.groupVisible;this.timeMs=snapshot.time;for(let i=0;i<this.bones.length;i++){this.bones[i].position.copy(snapshot.bones[i].position);this.bones[i].quaternion.copy(snapshot.bones[i].quaternion);this.bones[i].scale.copy(snapshot.bones[i].scale);}this.group.updateWorldMatrix(true,true);this.group.updateMatrixWorld(true);this.skeleton.update();this.mesh.computeBoundingSphere();if(this.mesh.boundingBox)this.mesh.computeBoundingBox();this.previousBoneWorld.copy(snapshot.previousBone);}
    if(errors.length)throw new AggregateError(errors,'Source model restoration failed');
  });}
  get detailLevel():SoldierDetailLevel{return 'full';}
  /** Transported bon is absolute; retaining it between snapshots is a network adapter. */
  setSourceMotionTime(timeMs:number):void {
    this.rejectLegacySourceModelWrite();
    if(this.disposed||!Number.isFinite(timeMs)||timeMs<0)return;
    if(this.adoptedGI){this.rebaseSourceModelWorlds();return;}
    this.timeMs=timeMs;
    if(!this.alive){
      this.deathBon=Math.max(0,timeMs-2400);
      this.nativeRoot.position.y=85*ORIGINAL_MAP_SCALE-ORIGINAL_GI_DEATH_RADIUS/300*this.deathBon;
      this.removed=this.deathBon>600;this.group.visible=!this.removed;
    }
    this.sampleMotion(timeMs/1000);this.captureBonePose();
  }
  setDetailLevel(_level:SoldierDetailLevel):void {/* Exact source mesh remains unchanged at all distances. */}
  setDistanceToCamera(_distance:number):SoldierDetailLevel{return 'full';}
  setName(name?:string):void {this.group.userData.originalName=name??'';}
  setWeapon(id:WeaponId):void {
    this.rejectLegacySourceModelWrite(false,this.gunModels.get(this.currentWeapon));this.rejectLegacySourceModelWrite(false,this.gunModels.get(id));
    this.ensureSourceGun(id);this.currentWeapon=id;for(const [weapon,model] of this.gunModels)if(model.parent===this.weaponRoot)model.visible=weapon===id&&this.sourceGunMembership.get(weapon)!==false;
    this.updateMuzzleAnchor(id);
  }
  private updateMuzzleAnchor(id:WeaponId):void {
    const flashResource=FLASH_RESOURCES[id];
    const geometry=this.resources.gunGeometries.get(flashResource??ORIGINAL_WEAPON_RESOURCES[id]);geometry?.computeBoundingBox();
    const bounds=geometry?.boundingBox;if(bounds){bounds.getCenter(this.muzzle.position);if(!flashResource)this.muzzle.position.x=bounds.min.x;}
  }
  /** Source actor birth resets scalars, but recycled GI bone/rotation state
   * belongs to the model until its next ordinary callback. */
  prepareSourceReuse(name?:string):void {
    this.rejectLegacySourceModelWrite(true);if(this.adoptedGuns.size)throw Error('Explicit source model owner active');
    if(this.disposed)throw Error('Disposed source GI');
    this.clearSourceBirthPose(false);
    this.alive=true;this.removed=false;this.deathBon=0;this.timeMs=0;this.wasFiring=false;this.sourceOldWeapon=undefined;
    this.nativeRoot.position.set(0,ORIGINAL_GI_ROOT_HEIGHT,0);this.nativeRoot.scale.setScalar(ORIGINAL_GI_SCALE);
    this.group.visible=true;this.weaponRoot.visible=true;if(name!==undefined)this.setName(name);
    this.bindSourceWeapon('rpg');
  }
  /** Source getwepmod clones only on first use. Geometry/materials remain
   * shared resources; stable mesh identities survive removal and GI reuse. */
  private ensureSourceGun(id:WeaponId):THREE.Mesh {
    if(this.disposed)throw Error('Disposed source GI');
    const existing=this.gunModels.get(id);if(existing)return existing;
    const model=this.admitSourceGun(id);
    this.sourceGunMembership.set(id,true);model.visible=true;this.weaponRoot.add(model);return model;
  }
  /** Catalog-only allocation for exact receiver handle binding. New instances
   * stay offworld until an explicit membership/pose operation admits them.
   * Existing held, dropped or collected instances are returned unchanged. */
  admitSourceGun(id:WeaponId):THREE.Mesh {
    this.rejectLegacySourceModelWrite();
    if(this.disposed)throw Error('Disposed source GI');
    const existing=this.gunModels.get(id);if(existing)return existing;
    const resource=ORIGINAL_WEAPON_RESOURCES[id],geometry=this.resources.gunGeometries.get(resource),material=this.resources.gunMaterials.get(resource);
    if(!geometry||!material)throw Error(`Original held gun missing: ${resource}`);
    const model=new THREE.Mesh(geometry,material);model.name=`original-held-${resource}`;model.visible=false;
    const resourceBindingId=this.resources.resourceBindingId;
    const capture:OriginalSoldierGunConstructorCapture=Object.freeze({kind:'copy-fresh-gun-mesh-constructor',provenance:'installed OriginalSoldier.admitSourceGun fresh unparented Mesh constructor',...(resourceBindingId!==undefined?{resourceBindingId}:{}),phase:0,weapon:id,resource,geometry,material,worldMatrix:constructorMatrix(model.matrixWorld),localMatrix:constructorMatrix(model.matrix),inWorld:false});
    this.gunConstructorCaptures.set(id,capture);gunConstructorCaptures.add(capture);
    this.weaponRoot.updateWorldMatrix(true,false);
    this.sourceGunWorld.set(id,this.weaponRoot.matrixWorld.clone());this.sourceGunMembership.set(id,false);
    this.gunModels.set(id,model);return model;
  }
  /** Pure lookup never creates or re-admits an unselected model. */
  getSourceGun(id:WeaponId):THREE.Mesh {
    if(this.disposed)throw Error('Disposed source GI');
    const model=this.gunModels.get(id);if(!model)throw Error('Unknown source gun');return model;
  }
  /** Birth changes the GI node transform without changing its retained bones.
   * Cache that queryable bone WORLD for the first orientgun callback only. */
  captureSourceBirthPose():void {this.rejectLegacySourceModelWrite(true);if(!this.disposed){this.group.updateWorldMatrix(true,true);this.captureBonePose();}}
  /** baddies.new places the model at CURRENT eye+(4,0,75), before its
   * first orientgun. The supplied feet are the current receiver adapter;
   * native downward birth grounding remains a separate query requirement. */
  prepareSourceBirthPose(feetWorld:Readonly<Vec3>):void {
    this.rejectLegacySourceModelWrite(true);
    if(this.disposed)throw Error('Disposed source GI');
    const {x,y,z}=feetWorld;
    if(![x,y,z].every(Number.isFinite))throw Error('Invalid source GI birth position');
    this.group.updateWorldMatrix(true,true);
    this.validateSourceBirthParent();
    if(!this.nativeRoot.matrixWorld.elements.every(Number.isFinite))throw Error('Invalid source GI birth transform');
    const birthWorld=this.nativeRoot.matrixWorld.clone().setPosition(
      x+4*ORIGINAL_MAP_SCALE,y+160*ORIGINAL_MAP_SCALE,z);
    this.sourceBirthLocal(birthWorld); // Validate before publishing a pending pose.
    this.sourceBirthWorld=birthWorld;
    this.applySourceBirthPose();
    this.captureSourceBirthPose();
  }
  /** Keep the exact saved WORLD affine matrix while presentation parents
   * move. TRS fields are diagnostic; the explicit matrix preserves shear. */
  private applySourceBirthPose():void {
    if(!this.sourceBirthWorld)return;
    this.group.updateWorldMatrix(true,false);
    const local=this.sourceBirthLocal(this.sourceBirthWorld);
    this.nativeRoot.matrixAutoUpdate=false;
    this.nativeRoot.matrix.copy(local);
    this.nativeRoot.matrix.decompose(this.nativeRoot.position,this.nativeRoot.quaternion,this.nativeRoot.scale);
    this.nativeRoot.matrixWorldNeedsUpdate=true;
    this.group.updateWorldMatrix(true,true);
  }
  private validateSourceBirthParent():void {
    const determinant=this.group.matrixWorld.determinant();
    if(!this.group.matrixWorld.elements.every(Number.isFinite)||!Number.isFinite(determinant)||determinant===0)throw Error('Invalid source GI birth parent');
  }
  private sourceBirthLocal(world:THREE.Matrix4):THREE.Matrix4 {
    this.validateSourceBirthParent();
    const local=this.group.matrixWorld.clone().invert().multiply(world);
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();local.decompose(p,q,s);
    if(!local.elements.every(Number.isFinite)||![...p.toArray(),...q.toArray(),...s.toArray()].every(Number.isFinite))throw Error('Invalid source GI birth transform');
    return local;
  }
  private clearSourceBirthPose(restore=true):void {
    if(!this.sourceBirthWorld)return;
    this.sourceBirthWorld=undefined;this.nativeRoot.matrixAutoUpdate=true;
    if(!restore)return;
    this.nativeRoot.position.set(0,ORIGINAL_GI_ROOT_HEIGHT,0);
    this.nativeRoot.quaternion.copy(this.nativeRootBasis);this.nativeRoot.scale.setScalar(ORIGINAL_GI_SCALE);
  }
  /** Explicit source drop transform applies even to an offworld model. It
   * does not confer membership or reparent a collected gun. */
  setSourceGunWorld(model:THREE.Mesh,world:THREE.Matrix4):void {
    this.rejectLegacySourceModelWrite(false,model);
    if(this.disposed)throw Error('Disposed source GI');
    const entry=[...this.gunModels].find(([,gun])=>gun===model);if(!entry)throw Error('Foreign source gun');
    if(world.elements.length!==16||!world.elements.every(Number.isFinite))throw Error('Invalid source gun world transform');
    this.sourceGunWorld.get(entry[0])!.copy(world);
    if(entry[0]===this.currentWeapon){this.gunWorldMatrix.copy(world);this.applyGunWorldPose();}
  }
  /** Native callback removes the old gun before resource/name lookup, including
   * its first VOID-oldweapon refresh. Same-weapon callbacks do not look up. */
  refreshSourceWeapon(id:WeaponId):void {
    this.rejectLegacySourceModelWrite(false,this.gunModels.get(this.currentWeapon));this.rejectLegacySourceModelWrite(false,this.gunModels.get(id));
    if(this.disposed)throw Error('Disposed source GI');
    if(id!==this.sourceOldWeapon){this.removeSourceGun(this.getSourceGun(this.currentWeapon));this.sourceOldWeapon=id;this.bindSourceWeapon(id);}
  }
  /** Explicit source getwepmod lookup assigns parent=gsmokes. Restores the
   * stable gun under its owning live hierarchy, including collected models. */
  bindSourceWeapon(id:WeaponId):void {
    this.rejectLegacySourceModelWrite(false,this.gunModels.get(this.currentWeapon));this.rejectLegacySourceModelWrite(false,this.gunModels.get(id));
    if(this.disposed)throw Error('Disposed source GI');
    const selected=this.ensureSourceGun(id),previous=this.getSourceGun(this.currentWeapon);
    if(id!==this.currentWeapon||selected.parent!==this.weaponRoot){
      if(previous.parent===this.weaponRoot){this.applyGunWorldPose();previous.updateWorldMatrix(true,false);this.sourceGunWorld.get(this.currentWeapon)?.copy(previous.matrixWorld);}
      const world=this.sourceGunWorld.get(id)!;
      if(selected.parent&&selected.parent!==this.weaponRoot){selected.updateWorldMatrix(true,false);world.copy(selected.matrixWorld);}
      this.gunWorldMatrix.copy(world);
      this.weaponRoot.add(selected);
      selected.matrixAutoUpdate=true;selected.position.set(0,0,0);selected.quaternion.identity();selected.scale.set(1,1,1);selected.updateMatrix();
    }
    this.sourceGunMembership.set(id,true);selected.visible=true;this.currentWeapon=id;
    for(const [weapon,model] of this.gunModels)if(model.parent===this.weaponRoot)model.visible=weapon===id&&this.sourceGunMembership.get(weapon)!==false;
    this.updateMuzzleAnchor(id);this.applyGunWorldPose();
  }
  /** Transfer the actual gun mesh; caller supplies its explicit drop basis. */
  detachSourceGun(id:WeaponId,parent:THREE.Object3D):THREE.Mesh {
    this.rejectLegacySourceModelWrite(false,this.gunModels.get(id));
    if(this.disposed)throw Error('Disposed source GI');
    if(id!==this.currentWeapon)throw Error('Source drop weapon is not current');
    const model=this.getSourceGun(id);
    if(model.parent)model.updateWorldMatrix(true,false);
    const world=model.parent?model.matrixWorld.clone():this.gunWorldMatrix.clone();this.sourceGunWorld.get(id)!.copy(world);
    parent.updateWorldMatrix(true,false);const local=new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(world);
    if(this.sourceGunMembership.get(id)!==false)parent.add(model);
    model.matrixAutoUpdate=true;local.decompose(model.position,model.quaternion,model.scale);model.updateMatrix();model.matrixWorldNeedsUpdate=true;
    model.visible=this.sourceGunMembership.get(id)!==false;return model;
  }
  removeSourceGun(model:THREE.Mesh):void {
    this.rejectLegacySourceModelWrite(false,model);
    const entry=[...this.gunModels].find(([,gun])=>gun===model);if(!entry)throw Error('Foreign source gun');
    if(model.parent){model.updateWorldMatrix(true,false);this.sourceGunWorld.get(entry[0])!.copy(model.matrixWorld);}
    this.sourceGunMembership.set(entry[0],false);model.visible=false;model.removeFromParent();
  }
  animate(delta:number,state:SoldierAnimationState={}):void {
    this.rejectLegacySourceModelWrite();
    if(this.disposed)return;if(this.adoptedGI){this.stepSourceFlashRecords(delta);this.refreshSourcePresentation();return;}
    if(this.disposed)return;if(state.alive===false&&this.alive)this.die();else if(state.alive===true&&!this.alive)this.reset();
    if(this.removed)return;
    if(state.firing&&!this.wasFiring)this.fire();this.wasFiring=state.firing??false;
    // Original orientgun precedes actor transform and bonesPlayer.currentTime.
    this.updateGunPose();
    // The first orientgun consumed the retained constructor bone WORLD.
    // Source then assigns ordinary actor placement before sampling bones.
    this.clearSourceBirthPose();
    // Preserve source's single strict subtraction per nominal frame, including
    // shoot's2000 ->1000 transition. Bound long stalls and split slow frames.
    let remaining=Math.min(1,Math.max(0,delta));
    const speed=Math.hypot(state.moveSpeed??0,state.strafeSpeed??0);
    while(remaining>1e-8){const step=Math.min(1/30,remaining);
      if(this.alive){this.timeMs+=speed*step/ORIGINAL_MAP_SCALE*10;if(this.timeMs>1000)this.timeMs-=1000;}
      else{
        this.deathBon+=8*30*step;this.timeMs=2400+this.deathBon;
        this.nativeRoot.position.y=85*ORIGINAL_MAP_SCALE-ORIGINAL_GI_DEATH_RADIUS/300*this.deathBon;
        if(this.deathBon>600+1e-8){this.removed=true;this.group.visible=false;}
      }
      remaining-=step;if(this.removed)break;
    }
    this.sampleMotion(this.timeMs/1000);this.captureBonePose();
    // Negotiated remotes supply whole source callbacks; preview/practice
    // renders accumulate nominal callbacks. Zero-time pose refreshes do not
    // step muzzle actors. Native actor-list append timing remains an adapter.
    this.stepSourceFlashRecords(delta);this.refreshSourcePresentation();
  }
  private stepSourceFlashRecords(delta:number):void {
    if(this.sourceTransientPresentationRetired)return;
    this.flashCallbackAccumulator+=Math.min(1,Math.max(0,delta));
    while(this.flashCallbackAccumulator>=1/30-1e-9){
      this.flashCallbackAccumulator-=1/30;
      for(let i=0;i<this.flashRecords.length;){const record=this.flashRecords[i];
        record.mesh.visible=true;
        if(record.bangtime===0){this.resources.muzzleModels.release(record.mesh);this.flashRecords.splice(i,1);}else i++;
        record.bangtime--;
      }
    }
  }
  /** Rebase retained world-space gun/flashes after a GI presentation refresh.
   * This is not orientgun: it never samples a bone, advances phase or ages FX. */
  refreshSourcePresentation():void {
    this.rejectLegacySourceModelWrite();
    if(this.disposed)return;
    if(this.adoptedGI||this.adoptedGuns.size)this.rebaseSourceModelWorlds();
    if(!this.adoptedGI)this.applySourceBirthPose();
    this.applyGunWorldPose();
    if(!this.sourceTransientPresentationRetired)for(const record of this.flashRecords)record.mesh.matrix.copy(this.inverseRoot.copy(this.group.matrixWorld).invert().multiply(record.world));
  }
  /** Original shoot assigns bon2000 before the next source step; flashes use the prior world pose. */
  fire(_strength=1):void {
    this.fireForSourceWeapon(this.currentWeapon);
  }
  /** A packet can change logical weapon before callback gun refresh. Muzzle
   * geometry follows that weapon, while placement retains the prior gun pose. */
  fireForSourceWeapon(weapon:WeaponId):void {
    this.rejectLegacySourceModelWrite();
    if(this.sourceTransientPresentationRetired)return;
    if(!this.alive||this.disposed)return;const resource=FLASH_RESOURCES[weapon];if(!resource){if(!this.adoptedGI)this.timeMs=2000;return;}
    const geometry=this.resources.gunGeometries.get(resource),material=this.resources.gunMaterials.get('mfmachinegun');if(!geometry||!material)return;
    const flash=this.resources.muzzleModels.acquire(resource);if(!this.adoptedGI)this.timeMs=2000;
    flash.geometry=geometry;flash.material=material;flash.visible=true;
    this.applyGunWorldPose();this.weaponRoot.updateWorldMatrix(true,false);const world=(this.adoptedGuns.get(this.gunModels.get(this.currentWeapon)!)?.world??this.weaponRoot.matrixWorld).clone();
    // Source copies position/rotation only; a recycled muzzle keeps its scale.
    world.decompose(this.scratchPosition,this.scratchRotation,this.scratchScale);world.compose(this.scratchPosition,this.scratchRotation,flash.scale);
    flash.matrixAutoUpdate=false;flash.matrix.copy(this.inverseRoot.copy(this.group.matrixWorld).invert().multiply(world));flash.matrixWorldNeedsUpdate=true;this.group.add(flash);this.flashRecords.push({mesh:flash,bangtime:1,world});
  }
  triggerFire(strength=1):void {this.fire(strength);}
  get sourceFlashCount():number {return this.flashRecords.length;}
  /** This rig's FX are now presented by the committed owner for its lifetime.
   * Stop legacy births, age and rebase before attempting cleanup hooks. */
  retireSourceTransientPresentation():void {
    this.sourceTransientPresentationRetired=true;
    this.clearSourceTransientFlashes();
  }
  /** Retire legacy transient leases without sampling or changing GI/gun state.
   * Failed releases remain reachable for later cleanup; every lease is tried. */
  clearSourceTransientFlashes():void {
    const records=this.flashRecords.splice(0),errors:unknown[]=[];
    this.flashCallbackAccumulator=0;
    for(const record of records)try{this.resources.muzzleModels.release(record.mesh);}catch(error){this.flashRecords.push(record);errors.push(error);}
    if(errors.length)throw new AggregateError(errors,'Source transient flash cleanup failed');
  }
  /** muzzle owns its WORLD and clock independently of baddies/fadeaway.
   * Transfer the actual meshes and remaining callback state, not a new flash. */
  detachSourceFlashes(parent:THREE.Object3D):DetachedSourceFlashes {
    const records=this.flashRecords.splice(0),pool=this.resources.muzzleModels;
    let accumulator=this.flashCallbackAccumulator;this.flashCallbackAccumulator=0;
    if(pool.isDisposed){records.length=0;accumulator=0;}
    const inverse=new THREE.Matrix4();
    const rebase=()=>{parent.updateWorldMatrix(true,false);inverse.copy(parent.matrixWorld).invert();for(const record of records){record.mesh.matrix.copy(inverse).multiply(record.world);record.mesh.matrixWorldNeedsUpdate=true;}};
    for(const record of records)parent.add(record.mesh);
    rebase();
    return {
      get count(){return records.length;},
      step(deltaSeconds){
        if(pool.isDisposed){records.length=0;accumulator=0;return;}
        accumulator+=Math.min(1,Math.max(0,deltaSeconds));
        while(accumulator>=1/30-1e-9){accumulator-=1/30;
          for(let i=0;i<records.length;){const record=records[i];record.mesh.visible=true;
            if(record.bangtime===0){pool.release(record.mesh);records.splice(i,1);}else i++;record.bangtime--;
          }
        }
        rebase();
      },
      clear(){
        const pending=records.splice(0),errors:unknown[]=[];accumulator=0;
        for(const record of pending)try{pool.release(record.mesh);}catch(error){records.push(record);errors.push(error);}
        if(errors.length)throw new AggregateError(errors,'Detached source flash cleanup failed');
      },
    };
  }
  flinch(_strength=1,_side=1):void {/* No recovered skeletal flinch sequence; do not invent one. */}
  triggerFlinch(strength=1,side=1):void {this.flinch(strength,side);}
  die(immediate=false):void {this.initializeDeath(immediate?600:0,immediate?3000:2400);if(immediate)this.clearFlashes();}
  /** baddies.die selects3000; fadeaway.new starts its independent bon at0.
   * The next ordinary fade callback therefore samples2408, not3008. */
  beginSourceFadeaway():void {this.initializeDeath(0,3000);}
  // muzzle is a separate source actor under gsmokes; a baddie death does not
  // cancel its remaining callbacks or reset the shared flash clock.
  private initializeDeath(deathBon:number,motionTime:number):void {this.rejectLegacySourceModelWrite(true);this.clearSourceBirthPose();this.alive=false;this.removed=false;this.deathBon=deathBon;this.timeMs=motionTime;this.nativeRoot.position.y=85*ORIGINAL_MAP_SCALE-ORIGINAL_GI_DEATH_RADIUS/300*this.deathBon;this.weaponRoot.visible=false;this.sampleMotion(this.timeMs/1000);this.captureBonePose();}
  reset():void {this.rejectLegacySourceModelWrite(true);this.clearSourceBirthPose();this.alive=true;this.removed=false;this.deathBon=0;this.nativeRoot.position.y=ORIGINAL_GI_ROOT_HEIGHT;this.timeMs=0;this.wasFiring=false;this.weaponRoot.visible=true;this.group.visible=true;this.clearFlashes();this.sampleMotion(0);this.captureBonePose();this.updateGunPose();}
  getMuzzleWorldPosition(target=new THREE.Vector3()):THREE.Vector3 {const adopted=this.adoptedGuns.get(this.getSourceGun(this.currentWeapon));if(adopted){this.rebaseSourceModelWorlds();return target.copy(this.muzzle.position).applyMatrix4(adopted.world);}this.applyGunWorldPose();return this.muzzle.getWorldPosition(target);}
  debugState():{presentation:'legacy';weapon:WeaponId;detailLevel:'full';bones:number;vertices:number;triangles:number;timeMs:number;alive:boolean;removed:boolean;deathBon:number;gunWorldScale:number[]} {
    this.applyGunWorldPose();this.weaponRoot.updateWorldMatrix(true,false);const scale=(this.adoptedGuns.has(this.gunModels.get(this.currentWeapon)!)?this.gunModels.get(this.currentWeapon)!:this.weaponRoot).getWorldScale(new THREE.Vector3());return {presentation:'legacy',weapon:this.weapon,detailLevel:'full',bones:this.bones.length,vertices:this.mesh.geometry.getAttribute('position').count,triangles:(this.mesh.geometry.index?.count??0)/3,timeMs:this.timeMs,alive:this.alive,removed:this.removed,deathBon:this.deathBon,gunWorldScale:scale.toArray()};
  }
  dispose():void {
    if(this.sourceModelBusy){this.sourceModelFailed=true;throw Error('Recursive source model adoption');}if(this.disposed)return;
    this.adoptedGI=undefined;this.adoptedGuns.clear();this.sourceGISnapshot=undefined;this.sourceModelGunWorld=undefined;this.sourceBirthWorld=undefined;this.disposed=true;
    const errors:unknown[]=[],attempt=(operation:()=>void)=>{try{operation();}catch(error){errors.push(error);}};
    for(const record of this.flashRecords)attempt(()=>this.resources.muzzleModels.release(record.mesh));this.flashRecords.length=0;this.flashCallbackAccumulator=0;
    for(const model of this.gunModels.values())attempt(()=>model.removeFromParent());
    attempt(()=>this.skeleton.dispose());attempt(()=>this.group.removeFromParent());
    const children=this.group.children.slice();for(const child of children)attempt(()=>this.group.remove(child));
    if(errors.length)throw new AggregateError(errors,'Source GI disposal failed');
  }
  private clearFlashes():void {for(const record of this.flashRecords)this.resources.muzzleModels.release(record.mesh);this.flashRecords.length=0;this.flashCallbackAccumulator=0;}
  private sampleMotion(seconds:number):void {
    const rig=this.resources.assets.rigMotion.rigs.find(rig=>rig.name==='GI')!;
    for(let index=0;index<this.bones.length;index++){
      const bone=this.bones[index],data=rig.bones[index],track=this.tracks.get(data.name);if(!track?.keys.length)continue;
      const keys=track.keys;let lower=0,upper=keys.length-1;while(lower<upper){const middle=Math.floor((lower+upper+1)/2);if(keys[middle].time<=seconds)lower=middle;else upper=middle-1;}
      const first=keys[lower],second=keys[Math.min(lower+1,keys.length-1)],alpha=second.time===first.time?0:THREE.MathUtils.clamp((seconds-first.time)/(second.time-first.time),0,1);
      bone.position.fromArray(first.position).lerp(this.scratchPosition.fromArray(second.position),alpha);if(data.parent>=0)bone.position.x+=rig.bones[data.parent].length;
      bone.quaternion.fromArray(first.quaternion_xyzw).normalize().slerp(this.scratchRotation.fromArray(second.quaternion_xyzw).normalize(),alpha);
      bone.scale.fromArray(first.scale).lerp(this.scratchScale.fromArray(second.scale),alpha);
    }
    this.group.updateMatrixWorld(true);this.skeleton.update();
    // Three caches these bounds on first raycast. Recompute after posing so an
    // animated hand or foot outside the previous pose is still hittable.
    this.mesh.computeBoundingSphere();if(this.mesh.boundingBox)this.mesh.computeBoundingBox();
  }
  private captureBonePose():void {this.group.updateMatrixWorld(true);this.previousBoneWorld.copy(this.bones[ORIGINAL_GI_RIGHT_FINGERS].matrixWorld);}
  private updateGunPose():void {
    if(this.adoptedGI||this.adoptedGuns.has(this.gunModels.get(this.currentWeapon)!))return;
    this.previousBoneWorld.decompose(this.scratchPosition,this.scratchRotation,this.scratchScale);
    this.scratchRotation.multiply(this.correction);this.scratchPosition.add(this.gunOffset.set(0,-3*ORIGINAL_MAP_SCALE,0).applyQuaternion(this.scratchRotation));
    this.gunWorldMatrix.compose(this.scratchPosition,this.scratchRotation,this.unitScale);this.applyGunWorldPose();
    if(this.alive)this.sourceGunWorld.get(this.currentWeapon)?.copy(this.gunWorldMatrix);
  }
  private applyGunWorldPose():void {
    if(this.adoptedGuns.has(this.gunModels.get(this.currentWeapon)!)){if(!this.sourceModelBusy)this.rebaseSourceModelWorlds();return;}
    this.group.updateWorldMatrix(true,false);this.weaponRoot.matrixAutoUpdate=false;
    this.weaponRoot.matrix.copy(this.inverseRoot.copy(this.group.matrixWorld).invert().multiply(this.gunWorldMatrix));this.weaponRoot.matrixWorldNeedsUpdate=true;
  }
}
