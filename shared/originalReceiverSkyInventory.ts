import * as THREE from 'three';
import {createOriginalSkyGeometry,applyOriginalSkyTransform,type OriginalSkyDescription} from './originalSkyRay';
import type {ReceiverModelEntry} from './originalReceiverModelWorld';
import type {OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

export interface ReceiverSkyInventoryOptions {
 readonly scale:number;readonly sceneGeneration:number;readonly provenance:string;
 readonly maxModels:number;readonly maxVertices:number;readonly maxFaces:number;readonly maxTextChars?:number;
}
export interface ReceiverSkyInventorySnapshot {
 readonly scope:'sky-only';readonly prefix:ReceiverScenePrefix;
 readonly models:readonly ReceiverModelEntry[];readonly triangles:readonly OriginalReceiverRayModel[];
 /** Empty means this static sky class is represented, not whole-scene coverage. */
 readonly missing:readonly string[];readonly provenance:string;
}
export interface OriginalReceiverSkyInventory {
 /** Caller attests this generation's static resource belongs to this CURRENT
  * prefix. No dynamic membership/history or native tessellation is inferred. */
 snapshotAt(prefix:ReceiverScenePrefix,capture:{readonly prefix:ReceiverScenePrefix}):ReceiverSkyInventorySnapshot;
}
const float32Max=3.4028234663852886e38;
const vertexCount=63,faceCount=80;

/** Both recovered explore scripts create an uncapped, back-facing cylinder.
 * This reuses the existing renderer's explicit20-by2/80-triangle adapter.
 * Native seam, tessellation and primitive arithmetic remain unmeasured.
 * Owns frozen arrays only; temporary Three geometry is always disposed.
 */
export function createOriginalReceiverSkyInventory(source:OriginalSkyDescription,options:ReceiverSkyInventoryOptions):OriginalReceiverSkyInventory {
 const maxText=options.maxTextChars??131072;
 if(!Number.isFinite(options.scale)||options.scale<=0||!Number.isSafeInteger(options.sceneGeneration)||options.sceneGeneration<0
  ||typeof options.provenance!=='string'||!options.provenance||!Number.isSafeInteger(maxText)||maxText<1
  ||![options.maxModels,options.maxVertices,options.maxFaces].every(value=>Number.isSafeInteger(value)&&value>0))throw Error('Invalid receiver sky inventory options');
 const provenance=`${options.provenance}:uncapped-cylinder-20x2-back-adapter`;
 if(provenance.length>maxText)throw Error('Receiver sky text budget exceeded');
 // Segment counts are constants in createOriginalSkyGeometry, so preflight
 // model/resource allocation before constructing the temporary primitive.
 if(options.maxModels<1||options.maxVertices<vertexCount||options.maxFaces<faceCount)throw Error('Receiver sky geometry budget exceeded');
 if(!source||!Number.isFinite(source.radius)||source.radius<=0||!Number.isFinite(source.height)||source.height<=0
  ||!Array.isArray(source.position)||source.position.length!==3||![...source.position].every(Number.isFinite)
  ||!Array.isArray(source.rotationDegrees)||source.rotationDegrees.length!==3||![...source.rotationDegrees].every(Number.isFinite))throw Error('Invalid receiver sky description');
 if(source.radius>float32Max||source.height/2>float32Max)throw Error('Receiver sky primitive overflow');
 const description:OriginalSkyDescription={radius:source.radius,height:source.height,position:Object.freeze([...source.position]),rotationDegrees:Object.freeze([...source.rotationDegrees])};
 const local=new THREE.Object3D();applyOriginalSkyTransform(local,description);local.updateMatrix();
 const parent=new THREE.Object3D();parent.rotation.x=-Math.PI/2;parent.scale.setScalar(options.scale);parent.updateMatrix();
 const matrix=new THREE.Matrix4().multiplyMatrices(parent.matrix,local.matrix);
 if(!matrix.elements.every(Number.isFinite)||matrix.elements[3]!==0||matrix.elements[7]!==0||matrix.elements[11]!==0||matrix.elements[15]!==1)throw Error('Receiver sky world transform overflow');
 const worldMatrix=Object.freeze(matrix.toArray()),geometry=createOriginalSkyGeometry(description);
 let positions:readonly (readonly number[])[],faces:readonly (readonly number[])[];
 try{
  const vertices=geometry.getAttribute('position'),indices=geometry.index;
  if(vertices.count!==vertexCount||!indices||indices.count!==faceCount*3)throw Error('Receiver sky primitive adapter changed');
  const points:(readonly number[])[]=[],triangles:(readonly number[])[]=[];
  for(let index=0;index<vertices.count;index++){
   const vertex=new THREE.Vector3().fromBufferAttribute(vertices,index),world=vertex.clone().applyMatrix4(matrix);
   if(![vertex.x,vertex.y,vertex.z,world.x,world.y,world.z].every(Number.isFinite))throw Error('Receiver sky vertex overflow');
   points.push(Object.freeze(vertex.toArray()));
  }
  for(let index=0;index<indices.count;index+=3){
   const face=[indices.getX(index),indices.getX(index+1),indices.getX(index+2)];
   if(!face.every(value=>Number.isSafeInteger(value)&&value>=0&&value<vertices.count))throw Error('Invalid receiver sky face');
   const [a,b,c]=face.map(value=>new THREE.Vector3().fromArray(points[value]).applyMatrix4(matrix));
   const normal=b.clone().sub(a).cross(c.clone().sub(a));
   if(!normal.toArray().every(Number.isFinite)||normal.lengthSq()===0||!Number.isFinite(normal.lengthSq()))throw Error('Receiver sky face overflow or degeneracy');
   triangles.push(Object.freeze(face));
  }
  positions=Object.freeze(points);faces=Object.freeze(triangles);
 }finally{geometry.dispose();}
 const ray:OriginalReceiverRayModel=Object.freeze({handle:'sky',layer:'sky',inWorld:true,groupAncestry:Object.freeze([]),geometryProvenance:provenance,positions,faces,worldMatrix,sidedness:'back'});
 const model:ReceiverModelEntry=Object.freeze({handle:'sky',name:'sky',resource:'sky',kind:'sky',group:'scene',inWorld:true,geometryProvenance:provenance,worldMatrix,
  pose:Object.freeze({position:Object.freeze({x:worldMatrix[12],y:worldMatrix[13],z:worldMatrix[14]}),yaw:0,phase:0,scale:1})});
 const models=Object.freeze([model]),triangles=Object.freeze([ray]),missing=Object.freeze([] as string[]),generation=options.sceneGeneration;
 return Object.freeze({snapshotAt:(prefix:ReceiverScenePrefix,capture:{readonly prefix:ReceiverScenePrefix})=>{
  validateReceiverScenePrefix(prefix);validateReceiverScenePrefix(capture.prefix);
  if(prefix.sceneGeneration!==generation||!sameReceiverScenePrefix(prefix,capture.prefix))throw Error('Receiver sky prefix mismatch');
  const frozenPrefix:ReceiverScenePrefix=Object.freeze(prefix.kind==='receipt'?{kind:'receipt',sceneGeneration:generation,callback:prefix.callback,tick:prefix.tick}:{kind:'callback',sceneGeneration:generation,callback:prefix.callback});
  return Object.freeze({scope:'sky-only' as const,prefix:frozenPrefix,models,triangles,missing,provenance});
 }});
}
