import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalSceneGeometry} from '../shared/originalSceneGeometry';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import {OriginalSoldierCollision} from '../shared/originalSoldierCollision';
import {originalServerSoldierAssets} from './original-soldier-collision';
import {originalProjectileModelQuaternion} from '../shared/originalProjectileRay';
import {createOriginalWeaponGeometry,type OriginalWeaponGeometryData} from '../src/originalWeapons';
import type {MessagePeer,ServerMessage,Vec3,WeaponId} from './protocol';

class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
const data=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function fixture(map:'barrack'|'woodlands'){
 const room=new MatchRoom('projectile-bullet',{map,now:()=>1100,spawnPoints:[{x:0,y:100-getOriginalMapRuntime(map).profile.eyeHeight,z:0}]}),peer=new Peer(),joined=room.join(peer,'SHOOTER',1100);
 if(!joined.ok)throw Error('join');const review=room as any,actor=review.players.get(joined.player.id);
 const geometry=createOriginalSceneGeometry({nodes:[{name:'behind',parent:'World',resource:'wall',matrix:identity,visibility:1,shader:'default'}],
  meshes:[{resource:'wall',part:0,positions:[[-1,-3,90],[-1,3,90],[-1,3,110],[-1,-3,110]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}]},{scale:1});
 // Explicit reconstructed test population omits sky metadata and unrelated
 // dynamic layers. Admission, projectile creation and all ray queries are real.
 review.original={...review.original,geometry,data:{nodes:[],meshes:[]}};review.doorWorld=undefined;actor.sourceWorld.doors=undefined;actor.sourceWorld.barrels.applySnapshots([]);
 actor.transform.position={x:0,y:100-getOriginalMapRuntime(map).profile.eyeHeight,z:0};
 const origin={x:0,y:100,z:0},cleanups:Array<()=>void>=[];
 const shoot=(weapon:WeaponId,id:string,direction:Vec3={x:1,y:0,z:0})=>{
  actor.transform.weapon=weapon;actor.reloadWeapon=null;actor.sourceCounter=new OriginalWeaponCounter(map,weapon);actor.sourceCounterUpdatedAt=1100;actor.sourceCounterReady=true;actor.sourceCounterWeapon=weapon;
  room.handleMessage(actor.id,{type:'shoot',shot:{shotId:id,weapon,origin,direction,...(weapon==='rpg'?{sourceRotation:{x:0,y:0,z:-90}}:{})}},1100);
 };
 const launch=(weapon:'launcher'|'rpg',ray:Vec3)=>{
  shoot(weapon,`launch-${review.projectiles.size}`);
  const id=[...review.projectiles.keys()].at(-1) as string,active=actor.sourceWorld.projectiles.get(id);expect(active?.source).toBeDefined();
  const source=active.source,resource=weapon==='launcher'?'rg6grenade':'rpgrocket';
  const geometry=createOriginalWeaponGeometry(data.meshes.find(mesh=>mesh.resource===resource)!),material=new THREE.MeshBasicMaterial({side:THREE.FrontSide}),mesh=new THREE.Mesh(geometry,material);
  cleanups.push(()=>{geometry.dispose();material.dispose();});mesh.quaternion.copy(originalProjectileModelQuaternion(weapon,source.direction,source.sourceRotation,source.angular?.orientation));
  const positions=geometry.getAttribute('position'),indices=geometry.index!;let center:THREE.Vector3|undefined;
  for(let face=0;face<indices.count;face+=3){
   const [a,b,c]=[0,1,2].map(corner=>new THREE.Vector3().fromBufferAttribute(positions,indices.getX(face+corner)).applyQuaternion(mesh.quaternion));
   if(b.clone().sub(a).cross(c.clone().sub(a)).normalize().dot(ray)<-.2){center=a.add(b).add(c).multiplyScalar(1/3);break;}
  }
  if(!center)throw Error('No front-facing actual projectile triangle');
  // Trusted fixture placement preserves the accepted launch basis. Put a real
  // source triangle on this ray before the subsequent bullet is admitted.
  mesh.position.copy(origin).addScaledVector(new THREE.Vector3().copy(ray),2).sub(center);mesh.updateMatrixWorld(true);source.position={x:mesh.position.x,y:mesh.position.y,z:mesh.position.z};
  return {id,active,mesh};
 };
 const target=()=>{
  const joined=room.join(new Peer(),'TARGET',1100);if(!joined.ok)throw Error('target join');const target=review.players.get(joined.player.id);target.sourceWorld.doors=undefined;target.sourceWorld.barrels.applySnapshots([]);
  target.transform.position={x:8,y:99,z:0};target.transform.yaw=0;target.sourceMotionPosition={...target.transform.position};target.sourceMotionTime=0;
  target.positionHistory=[];target.sourcePoseHistory=[];target.armor=0;target.protectedUntil=0;review.recordPosition(target,1100);
  const collision=new OriginalSoldierCollision(originalServerSoldierAssets);let direction:Vec3|undefined;
  try{
   const vertices=collision.evaluatePose(target.transform.position,Math.PI,0),faces=originalServerSoldierAssets.geometry.meshes.find(mesh=>mesh.resource==='GI')!.faces;
   for(const face of faces){const points=face.map(index=>vertices[index]),center={x:(points[0].x+points[1].x+points[2].x)/3,y:(points[0].y+points[1].y+points[2].y)/3,z:(points[0].z+points[1].z+points[2].z)/3};
    if(center.y-target.transform.position.y<.8||center.y-target.transform.position.y>1.2)continue;
    const delta={x:center.x-origin.x,y:center.y-origin.y,z:center.z-origin.z},length=Math.hypot(delta.x,delta.y,delta.z),ray={x:delta.x/length,y:delta.y/length,z:delta.z/length};
    if(collision.intersectRay(origin,ray,700)){direction=ray;break;}
   }
  }finally{collision.dispose();}
  if(!direction)throw Error('No actual GI witness');return {target,direction};
 };
 return {room,review,actor,peer,origin,shoot,launch,target,dispose:()=>{for(const cleanup of cleanups)cleanup();}};
}

describe('actual authority captured source projectile triangle population',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const){
  it(`${map} ${weapon} gives a positive projectile-only bullet report without a hit claim`,()=>{
   const s=fixture(map);
   try{
    const direction={x:1,y:0,z:0},projectile=s.launch(weapon,direction),rendered=new THREE.Raycaster(new THREE.Vector3().copy(s.origin),new THREE.Vector3().copy(direction),0,700).intersectObject(projectile.mesh,false);
    expect(rendered.length).toBeGreaterThan(0);expect(s.review.raycastFor(s.actor,s.origin,direction,700)).toBeNull();
    expect(s.review.freezeSourceRay(s.actor)(s.origin,direction,700,{})?.distance).toBeCloseTo(rendered[0].distance,10);
    s.shoot('pistol','bullet',direction);expect(s.actor.pendingShots.get('bullet').sourceProjectileOccluders).toHaveLength(1);expect(s.actor.sourcePendingShots).toBe(1);
    expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)?.sourceShots).toBe(1);
   }finally{s.dispose();}
  });
  for(const change of ['movement','retirement'] as const)it(`${map} ${weapon} remains a frozen blocker for an admitted real-GI shot after projectile ${change}`,()=>{
   const s=fixture(map);
   try{
    const target=s.target(),projectile=s.launch(weapon,target.direction);s.shoot('pistol','bullet',target.direction);
    const shot=s.actor.pendingShots.get('bullet'),poses=shot.sourceProjectileOccluders,originalPosition={...poses[0].position};expect(poses).toHaveLength(1);
    if(change==='movement'){projectile.active.source.position={x:1000,y:1000,z:1000};projectile.active.source.angular.orientation={x:0,y:Math.sin(.3),z:0,w:Math.cos(.3)};}
    else s.actor.sourceWorld.projectiles.delete(projectile.id);
    expect(poses[0].position).toEqual(originalPosition);expect(s.review.freezeSourceRay(s.actor)(s.origin,target.direction,700,{})).toBeNull();
    expect(shot.sourceRay(s.origin,target.direction,700,{})).not.toBeNull();
    s.room.handleMessage(s.actor.id,{type:'hit',hit:{shotId:'bullet',targetId:target.target.id}},1100);expect(target.target.health).toBe(100);
    expect(s.peer.messages.some(message=>message.type==='event'&&message.event.type==='damaged')).toBe(false);
   }finally{s.dispose();}
  });
  it(`${map} ${weapon} born after admission cannot become a historical blocker`,()=>{
   const s=fixture(map);
   try{
    const target=s.target();s.shoot('pistol','bullet',target.direction);expect(s.actor.pendingShots.get('bullet').sourceProjectileOccluders).toEqual([]);
    s.launch(weapon,target.direction);expect(s.review.freezeSourceRay(s.actor)(s.origin,target.direction,700,{})).not.toBeNull();
    s.room.handleMessage(s.actor.id,{type:'hit',hit:{shotId:'bullet',targetId:target.target.id}},1100);expect(target.target.health).toBe(88);
   }finally{s.dispose();}
  });
 }
});
