import * as THREE from 'three';
import type {Vec3} from './protocol';
import type {ArenaRayHit} from './arenaCollision';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
import {originalGrenadeBasisFromDirection} from './originalGrenadeOrientation';
import {originalRpgBasisFromSourceRotation} from './originalRpgShape';

export interface OriginalProjectileModelPose {
 readonly id:string;readonly weapon:'launcher'|'rpg';readonly position:Readonly<Vec3>;readonly direction:Readonly<Vec3>;
 readonly sourceRotation?:Readonly<Vec3>;readonly orientation?:Readonly<{x:number;y:number;z:number;w:number}>;
}
export interface OriginalProjectileRayMesh {readonly positions:readonly (readonly number[])[];readonly faces:readonly (readonly number[])[]}
const MAX_VERTICES=512,MAX_TRIANGLES=1024;
const finiteVector=(v:Readonly<Vec3>)=>[v.x,v.y,v.z].every(Number.isFinite);

/** The displayed indexed Float32 mesh, not its Havok convex support body. */
export function createOriginalProjectileRayGeometry(raw:OriginalProjectileRayMesh):THREE.BufferGeometry {
 if(!Array.isArray(raw?.positions)||raw.positions.length===0||raw.positions.length>MAX_VERTICES
  ||!Array.isArray(raw.faces)||raw.faces.length===0||raw.faces.length>MAX_TRIANGLES)throw Error('Invalid original projectile mesh bounds');
 const positions:number[]=[],indices:number[]=[];
 for(const p of raw.positions){
  if(!Array.isArray(p)||p.length!==3||![...p].every(Number.isFinite))throw Error('Invalid original projectile vertex');
  for(const value of p){const scaled=Math.fround(value*ORIGINAL_MAP_SCALE);if(!Number.isFinite(scaled))throw Error('Original projectile vertex overflow');positions.push(scaled);}
 }
 for(const face of raw.faces){
  if(!Array.isArray(face)||face.length!==3||![...face].every(i=>Number.isSafeInteger(i)&&i>=0&&i<raw.positions.length))throw Error('Invalid original projectile face');
  indices.push(...face);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
 geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** Preserve the renderer's source basis and angular premultiplication. The RPG
 * direction-only fallback remains an adapter; native Euler conventions are not attested. */
export function originalProjectileModelQuaternion(weapon:'launcher'|'rpg',direction:Readonly<Vec3>,sourceRotation?:Readonly<Vec3>,orientation?:Readonly<{x:number;y:number;z:number;w:number}>):THREE.Quaternion {
 const magnitude=Math.hypot(direction.x,direction.y,direction.z);
 if(!finiteVector(direction)||!Number.isFinite(magnitude)||magnitude===0
  ||sourceRotation&&!finiteVector(sourceRotation)||orientation&&(![orientation.x,orientation.y,orientation.z,orientation.w].every(Number.isFinite)||Math.hypot(orientation.x,orientation.y,orientation.z,orientation.w)===0))throw Error('Invalid original projectile orientation');
 if(sourceRotation||weapon==='launcher'){
  const basis=sourceRotation?originalRpgBasisFromSourceRotation(sourceRotation):originalGrenadeBasisFromDirection(direction);
  const vector=(p:Vec3)=>new THREE.Vector3(p.x,p.y,p.z);
  const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(vector(basis.x),vector(basis.y),vector(basis.z)));
  if(orientation)quaternion.premultiply(new THREE.Quaternion(orientation.x,orientation.y,orientation.z,orientation.w));
  return quaternion;
 }
 return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1,0,0),new THREE.Vector3(direction.x,direction.y,direction.z));
}

const material=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
// One reusable mesh per owned geometry, with no pose or query history. Weak keys
// allow retired geometry to release the scratch mesh as well.
const meshes=new WeakMap<THREE.BufferGeometry,THREE.Mesh>();
const raycaster=new THREE.Raycaster(),normalMatrix=new THREE.Matrix3(),normal=new THREE.Vector3();
function query(mesh:THREE.Mesh,origin:Readonly<Vec3>,direction:Readonly<Vec3>,max:number,id:string):ArenaRayHit|null {
 const magnitude=Math.hypot(direction.x,direction.y,direction.z);
 if(!finiteVector(origin)||!Number.isFinite(magnitude)||magnitude===0||!Number.isFinite(max)||max<0)return null;
 const positions=mesh.geometry.getAttribute('position'),count=mesh.geometry.index?.count??positions?.count;
 if(!positions||positions.count>MAX_VERTICES||count===undefined||count>MAX_TRIANGLES*3||count%3!==0)throw Error('Invalid original projectile query geometry bounds');
 raycaster.ray.origin.set(origin.x,origin.y,origin.z);raycaster.ray.direction.set(direction.x/magnitude,direction.y/magnitude,direction.z/magnitude);raycaster.near=0;raycaster.far=max;
 // Lifecycle/world membership belongs to the caller. Visibility alone does
 // not remove a native model from modelsUnderRay (nor from Three Mesh.raycast).
 mesh.updateWorldMatrix(true,false);
 if(!mesh.matrixWorld.elements.every(Number.isFinite))throw Error('Invalid original projectile world transform');
 const hits:THREE.Intersection[]=[];mesh.raycast(raycaster,hits);
 let nearest:THREE.Intersection|undefined;
 for(const hit of hits)if(Number.isFinite(hit.distance)&&hit.distance<=max&&hit.distance>=0&&(!nearest||hit.distance<nearest.distance))nearest=hit;
 if(!nearest?.face)return null;
 normal.copy(nearest.face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(mesh.matrixWorld));
 return {id,surface:'collider',distance:nearest.distance,point:{x:nearest.point.x,y:nearest.point.y,z:nearest.point.z},normal:{x:normal.x,y:normal.y,z:normal.z}};
}

/** Query the actual displayed mesh, including parent transforms and material
 * sidedness. No visibility or damage behavior is inferred here. */
export function raycastOriginalProjectileMesh(mesh:THREE.Mesh,origin:Readonly<Vec3>,direction:Readonly<Vec3>,max:number,id:string):ArenaRayHit|null {
 return query(mesh,origin,direction,max,id);
}

/** Server pose adapter uses the same FrontSide triangles as source flight meshes. */
export function raycastOriginalProjectileModel(geometry:THREE.BufferGeometry,position:Readonly<Vec3>,quaternion:Readonly<{x:number;y:number;z:number;w:number}>,origin:Readonly<Vec3>,direction:Readonly<Vec3>,max:number,id:string):ArenaRayHit|null {
 if(!finiteVector(position)||![quaternion.x,quaternion.y,quaternion.z,quaternion.w].every(Number.isFinite)||Math.hypot(quaternion.x,quaternion.y,quaternion.z,quaternion.w)===0)throw Error('Invalid original projectile pose');
 let mesh=meshes.get(geometry);if(!mesh){mesh=new THREE.Mesh(geometry,material);meshes.set(geometry,mesh);}
 mesh.position.set(position.x,position.y,position.z);mesh.quaternion.set(quaternion.x,quaternion.y,quaternion.z,quaternion.w);
 return query(mesh,origin,direction,max,id);
}
