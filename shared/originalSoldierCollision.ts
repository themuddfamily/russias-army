import * as THREE from 'three';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
import {ORIGINAL_GI_DECLARED_SPHERE_RADIUS} from './originalPickupRules';
import type {Vec3} from './protocol';

/** Only the recovered numerical data is needed; no texture, DOM or renderer. */
export interface OriginalSoldierCollisionAssets {
  geometry:{meshes:Array<{resource:string;positions:number[][];faces:number[][];bone_indices:number[][];bone_weights:number[][]}>};
  rigMotion:{rigs:Array<{name:string;bones:Array<{name:string;parent:number;length:number;displacement:number[];quaternion_xyzw:number[]}>}>;motions:Array<{name:string;tracks:Array<{bone:string;keys:Array<{time:number;position:number[];quaternion_xyzw:number[];scale:number[]}>}>}>};
}
export interface OriginalSoldierTriangleHit {distance:number;triangleIndex:number}

/** One recovered actor callback, not modulo: shoot's 2000 becomes 1000. */
export function advanceOriginalSoldierPhase(timeMs:number,worldDistance:number):number {
  if(!Number.isFinite(timeMs)||!Number.isFinite(worldDistance)||worldDistance<0)throw new Error('Invalid original GI phase');
  const next=timeMs+worldDistance/ORIGINAL_MAP_SCALE*10;
  if(!Number.isFinite(next))throw new Error('Original GI phase overflow');
  return next>1000?next-1000:next;
}
export function shootOriginalSoldierPhase():2000 {return 2000;}

/** CPU skin of the same GI triangles shown by the recovered-model renderer.
 * This supplies geometry, not a claim about Director's native collision API.
 * Call evaluatePose before each query; the returned vertices are reused.
 */
export class OriginalSoldierCollision {
  readonly vertices:ReadonlyArray<Vec3>;
  readonly triangleCount:number;
  private readonly group=new THREE.Group();
  private readonly nativeRoot=new THREE.Group();
  private readonly mesh:THREE.SkinnedMesh;
  private readonly skeleton:THREE.Skeleton;
  private readonly bones:THREE.Bone[];
  private readonly rig:OriginalSoldierCollisionAssets['rigMotion']['rigs'][number];
  private readonly tracks:Map<string,OriginalSoldierCollisionAssets['rigMotion']['motions'][number]['tracks'][number]>;
  private readonly ray=new THREE.Ray();
  private readonly a=new THREE.Vector3();private readonly b=new THREE.Vector3();private readonly c=new THREE.Vector3();
  private readonly point=new THREE.Vector3();private readonly rotation=new THREE.Quaternion();private readonly scale=new THREE.Vector3();
  constructor(assets:OriginalSoldierCollisionAssets){
    const source=assets.geometry.meshes.find(mesh=>mesh.resource==='GI');
    const rig=assets.rigMotion.rigs.find(rig=>rig.name==='GI');
    const motion=assets.rigMotion.motions.find(motion=>motion.name==='GI');
    if(!source||!rig||rig.bones.length!==25||!motion)throw new Error('Original GI collision assets missing');
    this.rig=rig;this.tracks=new Map(motion.tracks.map(track=>[track.bone,track]));
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions.flat(),3));
    geometry.setIndex(source.faces.flat());this.triangleCount=source.faces.length;
    const indices:number[]=[],weights:number[]=[];
    for(let vertex=0;vertex<source.positions.length;vertex++){
      if(source.bone_indices[vertex].length>4)throw new Error('Original GI exceeds four skin influences');
      for(let slot=0;slot<4;slot++){indices.push(source.bone_indices[vertex][slot]??0);weights.push(source.bone_weights[vertex][slot]??0);}
    }
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const nativeRoot=this.nativeRoot;nativeRoot.position.y=55*ORIGINAL_MAP_SCALE;
    nativeRoot.quaternion.setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
    nativeRoot.scale.setScalar(.045*ORIGINAL_MAP_SCALE);this.group.add(nativeRoot);
    this.bones=rig.bones.map(data=>{const bone=new THREE.Bone();bone.name=data.name;bone.position.fromArray(data.displacement);if(data.parent>=0)bone.position.x+=rig.bones[data.parent].length;bone.quaternion.fromArray(data.quaternion_xyzw).normalize();return bone;});
    rig.bones.forEach((data,index)=>{if(data.parent>=0)this.bones[data.parent].add(this.bones[index]);else nativeRoot.add(this.bones[index]);});
    // Material is unused: SkinnedMesh supplies the renderer's exact CPU skin path.
    this.mesh=new THREE.SkinnedMesh(geometry);nativeRoot.add(this.mesh);
    this.group.updateMatrixWorld(true);this.skeleton=new THREE.Skeleton(this.bones);this.mesh.bind(this.skeleton,this.mesh.matrixWorld);
    this.vertices=source.positions.map(()=>({x:0,y:0,z:0}));
    this.evaluatePose({x:0,y:0,z:0},0,0);
  }
  evaluatePose(feet:Vec3,groupYaw:number,timeMs:number,deathBon?:number):ReadonlyArray<Vec3>{
    if(![feet.x,feet.y,feet.z,groupYaw,timeMs].every(Number.isFinite)
      ||(deathBon!==undefined&&(!Number.isFinite(deathBon)||deathBon<0)))throw new Error('Invalid original GI pose');
    // Same declared-resource radius adapter as the renderer. A detached GI
    // starts at source death root85 and sinks during its independent fade.
    this.nativeRoot.position.y=deathBon===undefined?55*ORIGINAL_MAP_SCALE
      :85*ORIGINAL_MAP_SCALE-ORIGINAL_GI_DECLARED_SPHERE_RADIUS*.045*.75*ORIGINAL_MAP_SCALE/300*deathBon;
    this.group.position.set(feet.x,feet.y,feet.z);this.group.rotation.y=groupYaw;
    const seconds=timeMs/1000;
    for(let index=0;index<this.bones.length;index++){
      const bone=this.bones[index],data=this.rig.bones[index],track=this.tracks.get(data.name);if(!track?.keys.length)continue;
      const keys=track.keys;let lower=0,upper=keys.length-1;
      while(lower<upper){const middle=Math.floor((lower+upper+1)/2);if(keys[middle].time<=seconds)lower=middle;else upper=middle-1;}
      const first=keys[lower],second=keys[Math.min(lower+1,keys.length-1)],alpha=second.time===first.time?0:THREE.MathUtils.clamp((seconds-first.time)/(second.time-first.time),0,1);
      bone.position.fromArray(first.position).lerp(this.point.fromArray(second.position),alpha);if(data.parent>=0)bone.position.x+=this.rig.bones[data.parent].length;
      bone.quaternion.fromArray(first.quaternion_xyzw).normalize().slerp(this.rotation.fromArray(second.quaternion_xyzw).normalize(),alpha);
      bone.scale.fromArray(first.scale).lerp(this.scale.fromArray(second.scale),alpha);
    }
    this.group.updateMatrixWorld(true);this.skeleton.update();
    const positions=this.mesh.geometry.getAttribute('position');
    for(let index=0;index<positions.count;index++){
      this.point.fromBufferAttribute(positions,index);this.mesh.applyBoneTransform(index,this.point).applyMatrix4(this.mesh.matrixWorld);
      const vertex=this.vertices[index];vertex.x=this.point.x;vertex.y=this.point.y;vertex.z=this.point.z;
    }
    return this.vertices;
  }
  /** Front faces match the displayed GI material; native sidedness is unproved. */
  intersectRay(origin:Vec3,normalizedDirection:Vec3,maxDistance:number):OriginalSoldierTriangleHit|null {
    if(![origin.x,origin.y,origin.z,normalizedDirection.x,normalizedDirection.y,normalizedDirection.z,maxDistance].every(Number.isFinite)||maxDistance<0)throw new Error('Invalid original GI ray');
    const length=Math.hypot(normalizedDirection.x,normalizedDirection.y,normalizedDirection.z);
    if(Math.abs(length-1)>1e-6)throw new Error('Original GI ray direction must be normalized');
    this.ray.origin.set(origin.x,origin.y,origin.z);this.ray.direction.set(normalizedDirection.x,normalizedDirection.y,normalizedDirection.z).normalize();
    const indices=this.mesh.geometry.index!;let nearest:OriginalSoldierTriangleHit|null=null;
    for(let triangleIndex=0;triangleIndex<this.triangleCount;triangleIndex++){
      this.a.copy(this.vertices[indices.getX(triangleIndex*3)]);this.b.copy(this.vertices[indices.getX(triangleIndex*3+1)]);this.c.copy(this.vertices[indices.getX(triangleIndex*3+2)]);
      if(!this.ray.intersectTriangle(this.a,this.b,this.c,true,this.point))continue;
      const distance=this.point.distanceTo(this.ray.origin);
      if(Number.isFinite(distance)&&distance<=maxDistance&&(!nearest||distance<nearest.distance))nearest={distance,triangleIndex};
    }
    return nearest;
  }
  dispose():void {this.skeleton.dispose();this.mesh.geometry.dispose();const material=this.mesh.material;if(Array.isArray(material))material.forEach(item=>item.dispose());else material.dispose();}
}
