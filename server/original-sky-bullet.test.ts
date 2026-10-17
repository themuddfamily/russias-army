import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalSceneGeometry} from '../shared/originalSceneGeometry';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import {OriginalSoldierCollision} from '../shared/originalSoldierCollision';
import {originalServerSoldierAssets} from './original-soldier-collision';
import type {MessagePeer,ServerMessage,Vec3,WeaponId} from './protocol';

class Peer implements MessagePeer {messages:ServerMessage[]=[];send(message:ServerMessage){this.messages.push(message);}}
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function fixture(map:'barrack'|'woodlands',nearWall=false){
 const runtime=getOriginalMapRuntime(map),data=runtime.data as any,height=data.runtime.sky.position[2]*runtime.scale;
 const room=new MatchRoom('sky-bullet',{map,now:()=>1100,spawnPoints:[{x:0,y:height-runtime.profile.eyeHeight,z:0}]}),peer=new Peer(),joined=room.join(peer,'SHOOTER',1100);
 if(!joined.ok)throw Error('join');const review=room as any,actor=review.players.get(joined.player.id),distance=nearWall?1:-1;
 const geometry=createOriginalSceneGeometry({nodes:[{name:'test-wall',resource:'wall',parent:'World',matrix:identity,visibility:1,shader:'default'}],
  meshes:[{resource:'wall',part:0,positions:[[distance,-3,height-3],[distance,3,height-3],[distance,3,height+3],[distance,-3,height+3]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}]},{scale:1,cellSize:1});
 // Keep real packaged sky metadata, but select an explicit actual scene-query
 // population and disable unrelated dynamic layers. No ray helper is mocked.
 review.original={...review.original,geometry};review.doorWorld=undefined;actor.sourceWorld.doors=undefined;actor.sourceWorld.barrels.applySnapshots([]);
 actor.transform.position={x:0,y:height-runtime.profile.eyeHeight,z:0};
 const origin={x:0,y:height,z:0},direction={x:1,y:0,z:0};
 const fire=(weapon:WeaponId='pistol',ray:Vec3=direction)=>{
  actor.transform.weapon=weapon;actor.sourceCounter=new OriginalWeaponCounter(map,weapon);actor.sourceCounterUpdatedAt=1100;actor.sourceCounterReady=true;actor.sourceCounterWeapon=weapon;
  room.handleMessage(actor.id,{type:'shoot',shot:{shotId:'sky-shot',weapon,origin,direction:ray}},1100);
 };
 return {room,review,actor,peer,origin,direction,fire};
}

/** Select an actual GI triangle, rather than a proxy or assumed body center. */
function actualGiRay(origin:Vec3,position:Vec3,yaw:number){
 const collision=new OriginalSoldierCollision(originalServerSoldierAssets);
 try{
  const vertices=collision.evaluatePose(position,yaw+Math.PI,0),faces=originalServerSoldierAssets.geometry.meshes.find(mesh=>mesh.resource==='GI')!.faces;
  for(const face of faces){
   const points=face.map(index=>vertices[index]),center={x:(points[0].x+points[1].x+points[2].x)/3,y:(points[0].y+points[1].y+points[2].y)/3,z:(points[0].z+points[1].z+points[2].z)/3};
   if(center.y-position.y<.8||center.y-position.y>1.2)continue;
   const delta={x:center.x-origin.x,y:center.y-origin.y,z:center.z-origin.z},length=Math.hypot(delta.x,delta.y,delta.z),direction={x:delta.x/length,y:delta.y/length,z:delta.z/length};
   const hit=collision.intersectRay(origin,direction,700);
   if(hit)return {direction,distance:hit.distance};
  }
  throw Error('No real GI triangle visible from the declared sky fixture origin');
 }finally{collision.dispose();}
}

describe('actual authority source bullet sky population',()=>{
 for(const map of ['barrack','woodlands'] as const){
  for(const [weapon,count] of [['pistol',1],['shotgun',2]] as const)it(`${map} ${weapon} publishes a positive sky-only report independently of hit claims`,()=>{
   const s=fixture(map);
   expect(s.review.raycastFor(s.actor,s.origin,s.direction,700,{includeGround:true})).toBeNull();
   const sky=s.review.freezeSourceRay(s.actor)(s.origin,s.direction,700,{includeGround:true});expect(sky).not.toBeNull();expect(sky.distance).toBeGreaterThan(1);expect(sky.distance).toBeLessThan(700);
   const ammo=s.actor.ammo[weapon];s.fire(weapon);
   expect(s.actor.ammo[weapon]).toBe(ammo-1);expect(s.actor.pendingShots.has('sky-shot')).toBe(true);expect(s.actor.sourcePendingShots).toBe(count);
   expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)).toMatchObject({sourceShots:count});expect(s.actor.sourcePendingShots).toBe(0);
  });
  it(`${map} selects a nearer wall while general physics rays remain independent of sky`,()=>{
   const s=fixture(map,true);
   expect(s.review.freezeSourceRay(s.actor)(s.origin,s.direction,700,{includeGround:true})).toMatchObject({id:'test-wall',distance:1});
   expect(s.review.raycastFor(s.actor,s.origin,s.direction,700,{includeGround:true})).toMatchObject({id:'test-wall',distance:1});
   s.fire();expect(s.actor.sourcePendingShots).toBe(1);
  });
  it(`${map} admits an upward ray without inventing an uncapped sky report`,()=>{
   const s=fixture(map),up={x:0,y:1,z:0};
   expect(s.review.freezeSourceRay(s.actor)(s.origin,up,700,{includeGround:true})).toBeNull();
   s.fire('pistol',up);expect(s.actor.pendingShots.has('sky-shot')).toBe(true);expect(s.actor.sourcePendingShots).toBe(0);
   expect(s.room.tick(1100).players.find(p=>p.id===s.actor.id)?.sourceShots).toBeUndefined();
  });
  for(const outside of [false,true])it(`${map} actual hit claim ${outside?'is blocked by the nearer sky':'damages the nearer GI inside the sky'}`,()=>{
   const s=fixture(map),peer=new Peer(),joined=s.room.join(peer,'TARGET',1100);if(!joined.ok)throw Error('target join');
   const target=s.review.players.get(joined.player.id);target.sourceWorld.doors=undefined;target.sourceWorld.barrels.applySnapshots([]);const runtime=getOriginalMapRuntime(map),source=runtime.data as any;
   // Stored trusted poses deliberately isolate both sides of the cylinder;
   // no client transform/ray claim is allowed to select the target geometry.
   const x=outside?source.runtime.sky.radius*runtime.scale+4:4;
   target.transform.position={x,y:s.origin.y-1,z:0};target.transform.yaw=0;target.sourceMotionPosition={...target.transform.position};target.sourceMotionTime=0;
   target.positionHistory=[];target.sourcePoseHistory=[];target.armor=0;target.protectedUntil=0;
   s.review.recordPosition(target,1100);
   const selected=actualGiRay(s.origin,target.transform.position,target.transform.yaw);
   expect(s.review.raycastFor(s.actor,s.origin,selected.direction,700,{includeGround:true})).toBeNull();
   const sky=s.review.freezeSourceRay(s.actor)(s.origin,selected.direction,700,{includeGround:true});expect(sky).not.toBeNull();
   if(outside)expect(sky.distance).toBeLessThan(selected.distance);else expect(sky.distance).toBeGreaterThan(selected.distance);
   s.fire('pistol',selected.direction);
   const registered=s.actor.pendingShots.get('sky-shot');expect(registered).toBeDefined();expect(registered.targetPoses.get(target.id)).toHaveLength(1);
   expect(s.actor.sourcePendingShots).toBe(1);
   s.room.handleMessage(s.actor.id,{type:'hit',hit:{shotId:'sky-shot',targetId:target.id}},1100);
   expect(target.health).toBe(outside?100:88);
   expect(s.peer.messages.filter(message=>message.type==='event'&&message.event.type==='damaged')).toHaveLength(outside?0:1);
   // Repeated blocked claims remain harmless; successful claims consume once.
   s.room.handleMessage(s.actor.id,{type:'hit',hit:{shotId:'sky-shot',targetId:target.id}},1100);expect(target.health).toBe(outside?100:88);
  });
 }
});
