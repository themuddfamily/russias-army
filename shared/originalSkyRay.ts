import * as THREE from 'three';
import type {Vec3} from './protocol';
import type {ArenaRayHit} from './arenaCollision';

export interface OriginalSkyDescription {
 readonly radius:number;readonly height:number;
 readonly position:readonly number[];readonly rotationDegrees:readonly number[];
}
interface SkyTriangle {a:THREE.Vector3;b:THREE.Vector3;c:THREE.Vector3;normal:THREE.Vector3}
interface SkyCache {scale:number;signature:readonly number[];triangles:readonly SkyTriangle[]}
// One current 80-triangle representation per scene object, not a scale/history
// map. Replaced metadata or scale releases its predecessor; scene ownership is weak.
const scenes=new WeakMap<object,SkyCache>();
function description(value:unknown):OriginalSkyDescription {
 if(!value||typeof value!=='object')throw Error('Invalid original sky description');
 const source=value as Partial<OriginalSkyDescription>;
 if(typeof source.radius!=='number'||!Number.isFinite(source.radius)||source.radius<=0
  ||typeof source.height!=='number'||!Number.isFinite(source.height)||source.height<=0
  ||!Array.isArray(source.position)||source.position.length!==3||![...source.position].every(Number.isFinite)
  ||!Array.isArray(source.rotationDegrees)||source.rotationDegrees.length!==3||![...source.rotationDegrees].every(Number.isFinite))throw Error('Invalid original sky description');
 return {radius:source.radius,height:source.height,position:[...source.position],rotationDegrees:[...source.rotationDegrees]};
}

/** Same finite polygon primitive used by the renderer. Source default segment
 * counts are reconstructed; native primitive seam/handedness remains unproved. */
export function createOriginalSkyGeometry(value:OriginalSkyDescription):THREE.CylinderGeometry {
 const source=description(value);
 const geometry=new THREE.CylinderGeometry(source.radius,source.radius,source.height,20,2,true);
 const positions=geometry.getAttribute('position');
 for(let i=0;i<positions.count;i++)if(![positions.getX(i),positions.getY(i),positions.getZ(i)].every(Number.isFinite)){
  geometry.dispose();throw Error('Original sky primitive overflow');
 }
 return geometry;
}

/** Local Z-up source model placement, before the scene's basis/unit parent. */
export function applyOriginalSkyTransform(object:THREE.Object3D,value:OriginalSkyDescription):void {
 const source=description(value);
 object.position.fromArray(source.position);object.rotation.set(...source.rotationDegrees.map(THREE.MathUtils.degToRad) as [number,number,number]);
}

function worldTriangles(source:OriginalSkyDescription,scale:number):readonly SkyTriangle[] {
 const geometry=createOriginalSkyGeometry(source);
 try{
  const local=new THREE.Object3D();applyOriginalSkyTransform(local,source);local.updateMatrix();
  const parent=new THREE.Object3D();parent.rotation.x=-Math.PI/2;parent.scale.setScalar(scale);parent.updateMatrix();
  const matrix=parent.matrix.clone().multiply(local.matrix),positions=geometry.getAttribute('position'),indices=geometry.index!;
  const vertices:THREE.Vector3[]=[];
  for(let i=0;i<positions.count;i++){
   const vertex=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix);
   if(![vertex.x,vertex.y,vertex.z].every(Number.isFinite))throw Error('Original sky world transform overflow');
   vertices.push(vertex);
  }
  const triangles:SkyTriangle[]=[];
  for(let i=0;i<indices.count;i+=3){
   const a=vertices[indices.getX(i)],b=vertices[indices.getX(i+1)],c=vertices[indices.getX(i+2)];
   const normal=THREE.Triangle.getNormal(a,b,c,new THREE.Vector3()).negate();
   if(![normal.x,normal.y,normal.z].every(Number.isFinite)||normal.lengthSq()===0)throw Error('Original sky triangle overflow or degeneracy');
   triangles.push({a,b,c,normal});
  }
  return triangles;
 }finally{geometry.dispose();}
}

/** Bullet-only sky membership over the displayed inward polygon mesh. This
 * does not add a Havok/support body or attest native primitive/ray arithmetic.
 * Old decoded-format fixtures without runtime.sky keep their existing query. */
export function raycastOriginalSky(data:unknown,scale:number,origin:Vec3,direction:Vec3,max:number):ArenaRayHit|null {
 if(!data||typeof data!=='object')return null;
 const runtime=(data as {runtime?:{sky?:unknown}}).runtime;
 if(runtime?.sky==null)return null;
 const source=description(runtime.sky);
 if(!Number.isFinite(scale)||scale<=0)throw Error('Invalid original sky scale');
 const magnitude=Math.hypot(direction.x,direction.y,direction.z);
 if(![origin.x,origin.y,origin.z,magnitude,max].every(Number.isFinite)||magnitude===0||max<0)return null;
 const signature=[source.radius,source.height,...source.position,...source.rotationDegrees];
 let cache=scenes.get(data);
 if(!cache||cache.scale!==scale||signature.some((value,index)=>value!==cache!.signature[index])){
  cache={scale,signature,triangles:worldTriangles(source,scale)};scenes.set(data,cache);
 }
 const ray=new THREE.Ray(new THREE.Vector3(origin.x,origin.y,origin.z),new THREE.Vector3(direction.x/magnitude,direction.y/magnitude,direction.z/magnitude)),point=new THREE.Vector3();
 let result:ArenaRayHit|null=null,best=max;
 for(const triangle of cache.triangles){
  // Mesh.raycast with BackSide reverses vertices and enables backface culling.
  if(!ray.intersectTriangle(triangle.c,triangle.b,triangle.a,true,point))continue;
  const distance=point.distanceTo(ray.origin);if(distance>best)continue;
  best=distance;result={id:'sky',surface:'collider',distance,point:{x:point.x,y:point.y,z:point.z},normal:{x:triangle.normal.x,y:triangle.normal.y,z:triangle.normal.z}};
 }
 return result;
}
