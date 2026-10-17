import * as THREE from 'three';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverModelEntry} from './originalReceiverModelWorld';
import type {OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {createOriginalReceiverTransientResourceDescriptor,type ReceiverTransientResourceDescriptor} from './originalReceiverTransientResourceDescriptor';

export interface ReceiverPlaneResource {
  /** Source planemakeme's first goody.bsp, already converted to world units. */
  widthWorld:number;
  /** Explicit primitive geometry in WORLD-unit resource coordinates. Native
   * plane orientation/tessellation must not be inferred from a unit square. */
  positions:number[][];faces:number[][];provenance:string;
}
export interface ReceiverTransientResourceOptions {
  sourceScale:number;planeResource:ReceiverPlaneResource;
  maxVertices:number;maxFaces:number;provenance:string;
  /** Bound the complete decoded source list before any resource lookup. */
  maxMeshes?:number;
  sidedness:'front'|'back'|'double';
  resourceBindingId?:string;textureBindingId?:string;textureNames?:readonly string[];
  maxDescriptorTextChars?:number;
}
interface Geometry {positions:readonly (readonly number[])[];faces:readonly (readonly number[])[]}
const muzzleResources=['mfpistol','mfspas12','mfak47','mfdragunov'] as const;
function validateGeometry(mesh:{positions:number[][];faces:number[][]}):void {
  if(!mesh.positions.length||!mesh.faces.length)throw Error('Missing receiver transient geometry');
  for(const point of mesh.positions)if(point.length!==3||!point.every(Number.isFinite))throw Error('Invalid receiver transient vertex');
  for(const face of mesh.faces)if(face.length!==3||!face.every(index=>Number.isSafeInteger(index)&&index>=0&&index<mesh.positions.length))throw Error('Invalid receiver transient face');
}
const copyGeometry=(mesh:{positions:number[][];faces:number[][]}):Geometry=>Object.freeze({
  positions:Object.freeze(mesh.positions.map(p=>Object.freeze([p[0],p[1],p[2]]))),
  faces:Object.freeze(mesh.faces.map(f=>Object.freeze([f[0],f[1],f[2]]))),
});

/** Source transient model geometry; shader atlas/blend and visibility do not
 * remove admitted triangles. A generation's one explicit plane resource keeps
 * its original width across actor reuse and later goody lives. No pose history,
 * implicit billboarding, native clone pose or complete-scene claim is stored. */
export class OriginalReceiverTransientResources {
  readonly planeWidthWorld:number;
  readonly planeGeometryProvenance:string;
  readonly provenance:string;
  private readonly resources=new Map<string,Geometry>();
  private readonly sourceScale:number;
  private readonly sidedness:ReceiverTransientResourceOptions['sidedness'];
  private disposed=false;
  private readonly descriptor:ReceiverTransientResourceDescriptor|undefined;
  constructor(weapons:ReceiverWeaponGeometry,options:ReceiverTransientResourceOptions){
    const maxMeshes=options.maxMeshes??256,sourceMeshes=weapons?.meshes;
    if(!Number.isSafeInteger(maxMeshes)||maxMeshes<1||!Array.isArray(sourceMeshes))throw Error('Invalid receiver transient mesh budget');
    const meshCount=sourceMeshes.length;
    if(!Number.isSafeInteger(meshCount)||meshCount<0||meshCount>maxMeshes)throw Error('Receiver transient mesh budget exceeded');
    const plane=options.planeResource;
    const sourceScale=options.sourceScale,planeWidthWorld=plane.widthWorld,provenance=options.provenance,planeGeometryProvenance=plane.provenance,sidedness=options.sidedness,maxVertices=options.maxVertices,maxFaces=options.maxFaces;
    if(!Number.isFinite(sourceScale)||sourceScale<=0||!Number.isFinite(planeWidthWorld)||planeWidthWorld<=0
      ||typeof provenance!=='string'||!provenance||typeof planeGeometryProvenance!=='string'||!planeGeometryProvenance
      ||!['front','back','double'].includes(sidedness)||![maxVertices,maxFaces].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid receiver transient resource options');
    const resourceBindingId=options.resourceBindingId,textureBindingId=options.textureBindingId,textureNames=options.textureNames;
    const maxDescriptorTextChars=options.maxDescriptorTextChars??65536;
    if(!Number.isSafeInteger(maxDescriptorTextChars)||maxDescriptorTextChars<1)throw Error('Invalid transient resource descriptor text budget');
    if(resourceBindingId===undefined&&(textureBindingId!==undefined||textureNames!==undefined))throw Error('Transient texture metadata requires a resource binding');
    this.descriptor=resourceBindingId===undefined?undefined:createOriginalReceiverTransientResourceDescriptor({
      sourceScale:sourceScale,planeWidthWorld:planeWidthWorld,planeGeometryProvenance:planeGeometryProvenance,
      provenance:provenance,sidedness:sidedness,resourceBindingId,
      textureBindingId:textureBindingId as string,textureNames:textureNames as readonly string[],
    },maxDescriptorTextChars);
    const selected:Array<{resource:string;positions:number[][];faces:number[][]}>=[{resource:'plane',positions:plane.positions,faces:plane.faces}];
    for(const name of muzzleResources){
      let match:ReceiverWeaponGeometry['meshes'][number]|undefined;
      for(let index=0;index<meshCount;index++){
        const mesh=sourceMeshes[index];
        if(mesh?.resource===name){if(match)throw Error(`Missing or duplicate receiver muzzle resource: ${name}`);match=mesh;}
      }
      if(!match)throw Error(`Missing or duplicate receiver muzzle resource: ${name}`);selected.push(match);
    }
    let vertices=0,faces=0;
    for(const mesh of selected){
      vertices+=mesh.positions.length;faces+=mesh.faces.length;
      if(!Number.isSafeInteger(vertices)||vertices>maxVertices||!Number.isSafeInteger(faces)||faces>maxFaces)throw Error('Receiver transient resource budget exceeded');
      validateGeometry(mesh);
    }
    this.planeWidthWorld=planeWidthWorld;this.planeGeometryProvenance=planeGeometryProvenance;this.provenance=provenance;
    this.sourceScale=sourceScale;this.sidedness=sidedness;
    for(const mesh of selected)this.resources.set(mesh.resource,copyGeometry(mesh));
  }
  readResourceDescriptor():ReceiverTransientResourceDescriptor|undefined {
    if(this.disposed)throw Error('Receiver transient resources disposed');
    return this.descriptor;
  }
  resolve(model:Readonly<ReceiverModelEntry>,planeWidthWorld?:number):OriginalReceiverRayModel {
    if(this.disposed)throw Error('Receiver transient resources disposed');
    if(model.kind!=='transient'||model.group!=='gsmokes'||!model.handle||!model.geometryProvenance)throw Error('Receiver transient resource identity mismatch');
    const resource=this.resources.get(model.resource);if(!resource)throw Error('Missing receiver transient resource');
    if(model.resource==='plane'&&planeWidthWorld!==this.planeWidthWorld)throw Error('Receiver plane resource generation mismatch');
    const pose=model.pose;
    if(![pose.position.x,pose.position.y,pose.position.z,pose.yaw,pose.phase,pose.scale].every(Number.isFinite)||pose.phase<0||pose.scale<=0)throw Error('Invalid receiver transient resource pose');
    const q=pose.rotation?new THREE.Quaternion(pose.rotation.x,pose.rotation.y,pose.rotation.z,pose.rotation.w):new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),pose.yaw);
    if(![q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>1e-6)throw Error('Invalid receiver transient resource rotation');
    let matrix:THREE.Matrix4;
    if(model.worldMatrix){
      const m=model.worldMatrix;
      if(m.length!==16||!m.every(Number.isFinite)||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)throw Error('Invalid receiver transient resource affine matrix');
      matrix=new THREE.Matrix4().fromArray(m);
    }else{
      // Plane geometry already has world-unit dimensions; decoded muzzle
      // geometry still needs the source/world unit conversion exactly once.
      const scale=pose.scale*(model.resource==='plane'?1:this.sourceScale);
      matrix=new THREE.Matrix4().compose(new THREE.Vector3(pose.position.x,pose.position.y,pose.position.z),q,new THREE.Vector3().setScalar(scale));
    }
    if(!matrix.elements.every(Number.isFinite))throw Error('Receiver transient resource transform overflow');
    return Object.freeze({handle:model.handle,layer:'transient',inWorld:model.inWorld,groupAncestry:Object.freeze(['gsmokes']),geometryProvenance:model.geometryProvenance,
      positions:resource.positions,faces:resource.faces,worldMatrix:Object.freeze(matrix.toArray()),sidedness:this.sidedness});
  }
  dispose():void {this.disposed=true;}
}
