import * as THREE from 'three';
import type {OriginalSoldierCollisionAssets} from './originalSoldierCollision';

export interface OriginalReceiverSoldierResourceOptions {
  readonly maxVertices:number;readonly maxFaces:number;readonly maxMotionKeys:number;
  readonly provenance:string;
}
export interface OriginalReceiverSoldierSample {
  /** Detached posed WORLD coordinates; input worldMatrix is applied once. */
  readonly positions:readonly (readonly number[])[];
  /** Full affine bone23 transform, including model scale, in world coordinates. */
  readonly bone23WorldMatrix:readonly number[];
}
interface Bone {name:string;parent:number;length:number;displacement:readonly number[];quaternion_xyzw:readonly number[]}
interface Key {time:number;position:readonly number[];quaternion_xyzw:readonly number[];scale:readonly number[]}
const vector=(values:readonly number[],count:number)=>Array.isArray(values)&&values.length===count&&values.every(Number.isFinite);
const quaternion=(values:readonly number[])=>{
  if(!vector(values,4))return false;const squared=values[0]*values[0]+values[1]*values[1]+values[2]*values[2]+values[3]*values[3];
  return Number.isFinite(squared)&&squared>0;
};
const affine=(m:readonly number[])=>vector(m,16)&&m[3]===0&&m[7]===0&&m[11]===0&&m[15]===1;

/** Bounded, source-local identity-bind GI skin resource. No textures, rendering,
 * callback root offset, implicit basis/scale conversion or lifecycle history.
 * Float32 positions/weights, normalized quaternions and Three interpolation are
 * explicit renderer arithmetic adapters, not measured native Director skinning.
 */
export class OriginalReceiverSoldierResource {
  readonly faces:readonly (readonly number[])[];
  readonly vertexCount:number;readonly triangleCount:number;readonly provenance:string;
  private readonly group=new THREE.Group();
  private readonly mesh:THREE.SkinnedMesh;
  private readonly skeleton:THREE.Skeleton;
  private readonly bones:THREE.Bone[];
  private readonly rig:readonly Bone[];
  private readonly tracks:ReadonlyMap<string,readonly Key[]>;
  private readonly point=new THREE.Vector3();private readonly targetPosition=new THREE.Vector3();
  private readonly targetRotation=new THREE.Quaternion();private readonly targetScale=new THREE.Vector3();
  private readonly world=new THREE.Matrix4();private readonly boneWorld=new THREE.Matrix4();
  private disposed=false;
  constructor(assets:OriginalSoldierCollisionAssets,options:OriginalReceiverSoldierResourceOptions){
    if(typeof options.provenance!=='string'||!options.provenance||![options.maxVertices,options.maxFaces,options.maxMotionKeys].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid receiver GI resource budget');
    const source=assets.geometry.meshes.find(mesh=>mesh.resource==='GI'),rig=assets.rigMotion.rigs.find(r=>r.name==='GI'),motion=assets.rigMotion.motions.find(m=>m.name==='GI');
    if(!source||assets.geometry.meshes.reduce((count,mesh)=>count+(mesh.resource==='GI'?1:0),0)!==1||!rig||assets.rigMotion.rigs.reduce((count,value)=>count+(value.name==='GI'?1:0),0)!==1
      ||!Array.isArray(rig.bones)||rig.bones.length!==25||!motion||assets.rigMotion.motions.reduce((count,value)=>count+(value.name==='GI'?1:0),0)!==1
      ||!Array.isArray(source.positions)||!Array.isArray(source.faces)||!Array.isArray(source.bone_indices)||!Array.isArray(source.bone_weights)
      ||source.positions.length===0||source.positions.length>options.maxVertices||source.faces.length===0||source.faces.length>options.maxFaces
      ||source.bone_indices.length!==source.positions.length||source.bone_weights.length!==source.positions.length
      ||!Array.isArray(motion.tracks)||motion.tracks.length>25)throw Error('Invalid receiver GI resource inventory');
    // Complete topology/data/budget validation precedes owned geometry copies.
    for(let i=0;i<source.positions.length;i++){
      const indices=source.bone_indices[i],weights=source.bone_weights[i];
      if(!vector(source.positions[i],3)||source.positions[i].some(value=>!Number.isFinite(Math.fround(value)))
        ||!Array.isArray(indices)||!Array.isArray(weights)||indices.length===0||indices.length>4||weights.length!==indices.length
        ||!indices.every(index=>Number.isSafeInteger(index)&&index>=0&&index<25)
        ||!weights.every(weight=>Number.isFinite(weight)&&weight>=0&&Number.isFinite(Math.fround(weight)))
        ||!Number.isFinite(weights.reduce((a,b)=>a+b,0))||weights.reduce((a,b)=>a+b,0)<=0)throw Error('Invalid receiver GI vertex skin');
    }
    for(const face of source.faces)if(!vector(face,3)||!face.every(index=>Number.isSafeInteger(index)&&index>=0&&index<source.positions.length))throw Error('Invalid receiver GI face');
    const names=new Set<string>();
    for(const bone of rig.bones){
      if(typeof bone.name!=='string'||!bone.name||names.has(bone.name)||!Number.isSafeInteger(bone.parent)||bone.parent< -1||bone.parent>=25
        ||!Number.isFinite(bone.length)||bone.length<0||!vector(bone.displacement,3)||!quaternion(bone.quaternion_xyzw))throw Error('Invalid receiver GI bind bone');names.add(bone.name);
    }
    for(let i=0;i<25;i++){const seen=new Set<number>();let parent=i;
      while(parent!==-1){if(seen.has(parent))throw Error('Cyclic receiver GI skeleton');seen.add(parent);parent=rig.bones[parent].parent;}
      const bone=rig.bones[i];if(bone.parent>=0&&!Number.isFinite(bone.displacement[0]+rig.bones[bone.parent].length))throw Error('Receiver GI bind offset overflow');}
    const trackNames=new Set<string>();let keyCount=0;
    for(const track of motion.tracks){
      if(typeof track.bone!=='string'||!names.has(track.bone)||trackNames.has(track.bone)||!Array.isArray(track.keys))throw Error('Invalid receiver GI motion track');trackNames.add(track.bone);
      keyCount+=track.keys.length;if(keyCount>options.maxMotionKeys)throw Error('Receiver GI motion budget exceeded');let previous=-Infinity;
      for(const key of track.keys){if(!Number.isFinite(key.time)||key.time<0||key.time<previous||!vector(key.position,3)||!quaternion(key.quaternion_xyzw)||!vector(key.scale,3))throw Error('Invalid receiver GI motion key');previous=key.time;}
    }
    this.vertexCount=source.positions.length;this.triangleCount=source.faces.length;this.provenance=options.provenance;
    this.faces=Object.freeze(source.faces.map(face=>Object.freeze([...face])));
    this.rig=Object.freeze(rig.bones.map(bone=>Object.freeze({name:bone.name,parent:bone.parent,length:bone.length,displacement:Object.freeze([...bone.displacement]),quaternion_xyzw:Object.freeze([...bone.quaternion_xyzw])})));
    this.tracks=new Map(motion.tracks.map(track=>[track.bone,Object.freeze(track.keys.map(key=>Object.freeze({time:key.time,position:Object.freeze([...key.position]),quaternion_xyzw:Object.freeze([...key.quaternion_xyzw]),scale:Object.freeze([...key.scale])})))]));
    const geometry=new THREE.BufferGeometry();
    const positions=new Float32Array(this.vertexCount*3),indices=new Uint16Array(this.vertexCount*4),weights=new Float32Array(this.vertexCount*4);
    for(let i=0;i<this.vertexCount;i++){
      positions.set(source.positions[i],i*3);
      for(let slot=0;slot<4;slot++){indices[i*4+slot]=source.bone_indices[i][slot]??0;weights[i*4+slot]=source.bone_weights[i][slot]??0;}
    }
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('skinIndex',new THREE.BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));
    geometry.setIndex(source.faces.flat());
    this.bones=this.rig.map(bone=>{const object=new THREE.Bone();object.name=bone.name;return object;});this.restoreBind();
    this.rig.forEach((bone,index)=>{if(bone.parent>=0)this.bones[bone.parent].add(this.bones[index]);else this.group.add(this.bones[index]);});
    this.mesh=new THREE.SkinnedMesh(geometry);this.group.add(this.mesh);this.group.updateMatrixWorld(true);
    this.skeleton=new THREE.Skeleton(this.bones);this.mesh.bind(this.skeleton,this.mesh.matrixWorld);
  }
  private restoreBind():void {
    this.rig.forEach((data,index)=>{const bone=this.bones[index];bone.position.fromArray(data.displacement);
      if(data.parent>=0)bone.position.x+=this.rig[data.parent].length;
      bone.quaternion.fromArray(data.quaternion_xyzw).normalize();bone.scale.set(1,1,1);
    });
  }
  sample(phase:number,worldMatrix:readonly number[]):OriginalReceiverSoldierSample {
    if(this.disposed)throw Error('Receiver GI resource disposed');
    if(!Number.isFinite(phase)||phase<0||!affine(worldMatrix))throw Error('Invalid receiver GI model pose');
    this.world.fromArray(worldMatrix);this.restoreBind();const seconds=phase/1000;
    this.rig.forEach((data,index)=>{
      const keys=this.tracks.get(data.name);if(!keys?.length)return;
      let lower=0,upper=keys.length-1;
      while(lower<upper){const middle=Math.floor((lower+upper+1)/2);if(keys[middle].time<=seconds)lower=middle;else upper=middle-1;}
      const first=keys[lower],second=keys[Math.min(lower+1,keys.length-1)],alpha=second.time===first.time?0:THREE.MathUtils.clamp((seconds-first.time)/(second.time-first.time),0,1),bone=this.bones[index];
      bone.position.fromArray(first.position).lerp(this.targetPosition.fromArray(second.position),alpha);
      if(data.parent>=0)bone.position.x+=this.rig[data.parent].length;
      bone.quaternion.fromArray(first.quaternion_xyzw).normalize().slerp(this.targetRotation.fromArray(second.quaternion_xyzw).normalize(),alpha);
      bone.scale.fromArray(first.scale).lerp(this.targetScale.fromArray(second.scale),alpha);
    });
    this.group.updateMatrixWorld(true);this.skeleton.update();
    const attribute=this.mesh.geometry.getAttribute('position'),positions:(readonly number[])[]=[];
    for(let i=0;i<this.vertexCount;i++){
      this.point.fromBufferAttribute(attribute,i);this.mesh.applyBoneTransform(i,this.point).applyMatrix4(this.world);
      if(![this.point.x,this.point.y,this.point.z].every(Number.isFinite))throw Error('Receiver GI skin overflow');positions.push(Object.freeze(this.point.toArray()));
    }
    this.boneWorld.multiplyMatrices(this.world,this.bones[22].matrixWorld);
    if(!this.boneWorld.elements.every(Number.isFinite))throw Error('Receiver GI bone transform overflow');
    return Object.freeze({positions:Object.freeze(positions),bone23WorldMatrix:Object.freeze([...this.boneWorld.elements])});
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;this.skeleton.dispose();this.mesh.geometry.dispose();
    const material=this.mesh.material;if(Array.isArray(material))material.forEach(value=>value.dispose());else material.dispose();
  }
}
