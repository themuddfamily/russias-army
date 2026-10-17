import * as THREE from 'three';
import type {WeaponId} from './protocol';
import type {OriginalSoldierCollisionAssets} from './originalSoldierCollision';
import {OriginalReceiverSoldierResource} from './originalReceiverSoldierResource';
import type {ReceiverModelEntry,ReceiverModelPose,ReceiverModelRotation} from './originalReceiverModelWorld';
import type {OriginalReceiverRayModel,OriginalReceiverSceneLayer} from './originalReceiverSceneRay';
import {createOriginalReceiverActorResourceDescriptor,type ReceiverActorResourceDescriptor} from './originalReceiverActorResourceDescriptor';

export interface ReceiverWeaponGeometry {
  meshes:Array<{resource:string;positions:number[][];faces:number[][]}>;
}
export interface ReceiverActorResourceOptions {
  sourceScale:number;
  /** Explicit raw GI resource basis relative to the ledger's world rotation.
   * No live-facing, constructor height or corpse sinking is inferred here. */
  giResourceOrientation:ReceiverModelRotation;
  /** Source gun scale is independent of the GI/bone scale. */
  gunScale:number;
  maxVertices:number;maxFaces:number;maxMotionKeys:number;
  provenance:string;sidedness:'front'|'back'|'double';
  /** Optional explicit same-immutable-pack attestation, never inferred from a
   * model name/provenance. Absence preserves the existing no-descriptor path. */
  resourceBindingId?:string;maxDescriptorTextChars?:number;
}
const gunResources:Record<WeaponId,string>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
const identity=Object.freeze(new THREE.Matrix4().toArray());
function quaternion(value:ReceiverModelRotation):THREE.Quaternion {
  if(![value.x,value.y,value.z,value.w].every(Number.isFinite)||Math.abs(Math.hypot(value.x,value.y,value.z,value.w)-1)>1e-6)throw Error('Invalid receiver resource quaternion');
  return new THREE.Quaternion(value.x,value.y,value.z,value.w);
}
function poseMatrix(pose:ReceiverModelPose,sourceScale:number,basis?:THREE.Quaternion):THREE.Matrix4 {
  if(![pose.position.x,pose.position.y,pose.position.z,pose.yaw,pose.phase,pose.scale].every(Number.isFinite)||pose.phase<0||pose.scale<=0)throw Error('Invalid receiver resource pose');
  const q=pose.rotation?quaternion(pose.rotation):new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.yaw);
  if(basis)q.multiply(basis);
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(pose.position.x,pose.position.y,pose.position.z),q,new THREE.Vector3().setScalar(pose.scale*sourceScale));
  if(!matrix.elements.every(Number.isFinite))throw Error('Receiver resource transform overflow');
  return matrix;
}
function explicitMatrix(values:readonly number[]):THREE.Matrix4 {
  if(values.length!==16||!values.every(Number.isFinite)||values[3]!==0||values[7]!==0||values[11]!==0||values[15]!==1)throw Error('Invalid receiver resource affine matrix');
  return new THREE.Matrix4().fromArray(values);
}

/** Decoded GI and rigid gun geometry for one receiver query. Owns one scratch
 * skeleton, immutable resources and no callback/posed-mesh history. Full model
 * matrices replace the pose-derived transform rather than receiving it twice.
 * Three skin/interpolation, ZYX gun correction and sidedness remain adapters;
 * this provider does not establish complete scene inventory or native bounds. */
export class OriginalReceiverActorResources {
  readonly provenance:string;
  private readonly soldier:OriginalReceiverSoldierResource;
  private readonly weapons=new Map<string,{positions:readonly (readonly number[])[];faces:readonly (readonly number[])[]}>();
  private readonly sourceScale:number;
  private readonly gunScale:number;
  private readonly basis:THREE.Quaternion;
  private readonly sidedness:ReceiverActorResourceOptions['sidedness'];
  private readonly resourceDescriptor?:ReceiverActorResourceDescriptor;
  private disposed=false;
  constructor(soldier:OriginalSoldierCollisionAssets,weapons:ReceiverWeaponGeometry,options:ReceiverActorResourceOptions){
    for(const limit of [options.maxVertices,options.maxFaces,options.maxMotionKeys])if(!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid receiver actor resource budget');
    if(!Number.isFinite(options.sourceScale)||options.sourceScale<=0||!Number.isFinite(options.gunScale)||options.gunScale<=0||typeof options.provenance!=='string'||!options.provenance||!['front','back','double'].includes(options.sidedness))throw Error('Invalid receiver actor resource options');
    this.basis=quaternion(options.giResourceOrientation);this.sourceScale=options.sourceScale;this.gunScale=options.gunScale;this.provenance=options.provenance;this.sidedness=options.sidedness;
    const resourceBindingId=options.resourceBindingId,maxDescriptorTextChars=options.maxDescriptorTextChars??65536;
    if(!Number.isSafeInteger(maxDescriptorTextChars)||maxDescriptorTextChars<1)throw Error('Invalid actor resource descriptor text budget');
    if(resourceBindingId!==undefined)this.resourceDescriptor=createOriginalReceiverActorResourceDescriptor({sourceScale:this.sourceScale,giResourceOrientation:{x:this.basis.x,y:this.basis.y,z:this.basis.z,w:this.basis.w},resourceBindingId,provenance:this.provenance},maxDescriptorTextChars);
    const gi=soldier.geometry.meshes.find(mesh=>mesh.resource==='GI');
    if(!gi)throw Error('Missing receiver GI resource');
    let vertices=gi.positions.length,faces=gi.faces.length;
    const selected:Array<ReceiverWeaponGeometry['meshes'][number]>=[];
    for(const resource of Object.values(gunResources)){
      const matches=weapons.meshes.filter(mesh=>mesh.resource===resource);
      if(matches.length!==1)throw Error(`Missing or duplicate receiver gun resource: ${resource}`);
      const mesh=matches[0];vertices+=mesh.positions.length;faces+=mesh.faces.length;
      if(!mesh.positions.length||!mesh.faces.length||!Number.isSafeInteger(vertices)||vertices>options.maxVertices||!Number.isSafeInteger(faces)||faces>options.maxFaces)throw Error('Receiver actor resource budget exceeded');
      for(const point of mesh.positions)if(point.length!==3||!point.every(Number.isFinite))throw Error('Invalid receiver gun vertex');
      for(const face of mesh.faces)if(face.length!==3||!face.every(i=>Number.isSafeInteger(i)&&i>=0&&i<mesh.positions.length))throw Error('Invalid receiver gun face');
      selected.push(mesh);
    }
    // Validate the aggregate before any geometry/skeleton allocations.
    this.soldier=new OriginalReceiverSoldierResource(soldier,{maxVertices:options.maxVertices,maxFaces:options.maxFaces,maxMotionKeys:options.maxMotionKeys,provenance:options.provenance});
    for(const mesh of selected)this.weapons.set(mesh.resource,{positions:Object.freeze(mesh.positions.map(p=>Object.freeze([p[0],p[1],p[2]]))),faces:Object.freeze(mesh.faces.map(f=>Object.freeze([f[0],f[1],f[2]])))});
  }
  private check():void {if(this.disposed)throw Error('Receiver actor resources disposed');}
  /** The actual captured query basis/scale, not a parallel renderer default.
   * This borrows no pack ownership and remains stable for this resource life. */
  readResourceDescriptor():ReceiverActorResourceDescriptor|undefined {this.check();return this.resourceDescriptor;}
  private giMatrix(model:Readonly<ReceiverModelEntry>):THREE.Matrix4 {
    if(model.kind!=='gi'||model.resource!=='GI')throw Error('Receiver GI resource mismatch');
    // Even a complete matrix does not excuse an invalid phase/pose record.
    const derived=poseMatrix(model.pose,this.sourceScale,this.basis);
    return model.worldMatrix?explicitMatrix(model.worldMatrix):derived;
  }
  resolve(model:Readonly<ReceiverModelEntry>,layer:OriginalReceiverSceneLayer):OriginalReceiverRayModel {
    this.check();
    if(!model.handle||!model.geometryProvenance)throw Error('Invalid receiver actor resource identity');
    let positions:OriginalReceiverRayModel['positions'],faces:OriginalReceiverRayModel['faces'],matrix:readonly number[];
    if(model.kind==='gi'){
      if(!['live-gi','pending-death-gi','corpse'].includes(layer))throw Error('Receiver GI layer mismatch');
      const sample=this.soldier.sample(model.pose.phase,this.giMatrix(model).elements);
      positions=sample.positions;faces=this.soldier.faces;matrix=identity;
    }else if(model.kind==='gun'){
      if(!['held-gun','dropped-gun'].includes(layer))throw Error('Receiver gun layer mismatch');
      const resource=this.weapons.get(model.resource);if(!resource)throw Error('Missing receiver gun geometry');
      positions=resource.positions;faces=resource.faces;
      const derived=poseMatrix(model.pose,this.sourceScale);
      matrix=Object.freeze((model.worldMatrix?explicitMatrix(model.worldMatrix):derived).toArray());
    }else throw Error('Receiver actor resource kind mismatch');
    return Object.freeze({handle:model.handle,layer,inWorld:model.inWorld,groupAncestry:Object.freeze([model.group]),geometryProvenance:model.geometryProvenance,positions,faces,worldMatrix:matrix,sidedness:this.sidedness});
  }
  /** Called with the old GI ledger entry before this callback moves/samples it.
   * Source copies bone position/rotation, not animated bone scale. */
  heldGunPose(model:Readonly<ReceiverModelEntry>,weapon:WeaponId):ReceiverModelPose {
    this.check();if(!this.weapons.has(gunResources[weapon]))throw Error('Unknown receiver weapon');
    const sample=this.soldier.sample(model.pose.phase,this.giMatrix(model).elements);
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();
    new THREE.Matrix4().fromArray(sample.bone23WorldMatrix).decompose(p,q,scale);
    if(![p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite))throw Error('Invalid receiver gun bone transform');
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,170*Math.PI/180,10*Math.PI/180,'ZYX')));
    p.add(new THREE.Vector3(0,-3*this.sourceScale,0).applyQuaternion(q));
    if(![p.x,p.y,p.z].every(Number.isFinite))throw Error('Receiver gun transform overflow');
    const rotation=Object.freeze({x:q.x,y:q.y,z:q.z,w:q.w});quaternion(rotation);
    return Object.freeze({position:Object.freeze({x:p.x,y:p.y,z:p.z}),rotation,yaw:Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z)),scale:this.gunScale,phase:0});
  }
  dispose():void {if(!this.disposed){this.disposed=true;this.soldier.dispose();}}
}
