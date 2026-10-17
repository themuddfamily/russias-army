import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {getOriginalHitscan,originalBulletExcludesModel} from '../shared/originalHitscan';
import {OriginalSoldierCollision} from '../shared/originalSoldierCollision';
import {originalServerSoldierAssets} from './original-soldier-collision';
import {createOriginalSceneGeometry} from '../shared/originalSceneGeometry';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import type {MessagePeer,ServerMessage,PlayerTransform,Vec3,WeaponId} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
interface Player {sourceMotionPosition:Vec3;id:string;health:number;armor:number;protectedUntil:number;transform:PlayerTransform;positionHistory:unknown[];ammo:Record<WeaponId,number>;sourceCounter:OriginalWeaponCounter|null}
interface Review {players:Map<string,Player>;recordPosition(p:Player,now:number):void;raycast(origin:Vec3,direction:Vec3,range:number,options:unknown):{distance:number}|null}
function setup(map:'barrack'|'woodlands',weapon:WeaponId,head=false,mode?:'winter'|'fixture'){
 const runtime=getOriginalMapRuntime(map),position=mode?{x:0,y:0,z:0}:runtime.spawnPoints[0];
 const room=new MatchRoom('hitscan-source',{map,spawnPoints:[position],now:()=>0,...(mode==='winter'?{collisionProfile:'winter' as const}:{}),...(mode==='fixture'?{originalScene:false}: {})});
 const peer=new Peer(),other=new Peer(),a=room.join(peer,'A',0),b=room.join(other,'B',0);if(!a.ok||!b.ok)throw Error('join');
 const review=room as unknown as Review,attacker=review.players.get(a.player.id)!,target=review.players.get(b.player.id)!;
 attacker.transform.weapon=weapon;attacker.ammo[weapon]=20;target.protectedUntil=0;target.armor=0;
 if(!mode)attacker.sourceCounter=new OriginalWeaponCounter(map,weapon);
 const origin={...attacker.transform.position,y:attacker.transform.position.y+(mode?1.55:1.72)};
 let direction:Vec3|undefined;
 for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){
  let delta={x:x*4,y:(head?1.64:.98)-1.55,z:z*4};
  if(!mode){
   const feet={...attacker.transform.position,x:attacker.transform.position.x+x*4,z:attacker.transform.position.z+z*4};
   const collision=new OriginalSoldierCollision(originalServerSoldierAssets),vertices=collision.evaluatePose(feet,target.transform.yaw+Math.PI,0);
   const mesh=originalServerSoldierAssets.geometry.meshes.find(m=>m.resource==='GI')!;
   const points=mesh.faces.map(face=>{const [a,b,c]=face.map(i=>vertices[i]);return {x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3,z:(a.z+b.z+c.z)/3};});
   const chosen=points.filter(p=>head?p.y-feet.y>1.6:p.y-feet.y>.8&&p.y-feet.y<1.2).find(p=>{
    const d={x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z},len=Math.hypot(d.x,d.y,d.z),dir={x:d.x/len,y:d.y/len,z:d.z/len};
    return collision.intersectRay(origin,dir,len+.01)&&!review.raycast(origin,dir,len,{includeGround:true,minDistance:.01});
   });
   if(!chosen)continue;
   delta={x:chosen.x-origin.x,y:chosen.y-origin.y,z:chosen.z-origin.z};
  }
  const length=Math.hypot(delta.x,delta.y,delta.z),candidate={x:delta.x/length,y:delta.y/length,z:delta.z/length};
  if(review.raycast(origin,candidate,length,{includeGround:true,minDistance:.01}))continue;
  target.transform.position={...attacker.transform.position,x:attacker.transform.position.x+x*4,z:attacker.transform.position.z+z*4};direction=candidate;break;
 }
 if(!direction)throw Error('No clear original spawn ray');
 target.sourceMotionPosition={...target.transform.position};target.positionHistory=[];review.recordPosition(target,1000);
 const shoot=(id:string,now=1100,requestedOrigin:Vec3=origin)=>room.handleMessage(attacker.id,{type:'shoot',shot:{shotId:id,weapon,origin:requestedOrigin,direction:direction!}},now);
 const hit=(id:string,now=1101)=>room.handleMessage(attacker.id,{type:'hit',hit:{shotId:id,targetId:target.id}},now);
 return {room,peer,attacker,target,shoot,hit,origin,review,getDirection:()=>({...direction!}),setDirection:(next:Vec3)=>{direction=next;}};
}
describe('actual original room numerical hitscan authority',()=>{
 it.each([
  ['barrack','outerfencing',88,1],['woodlands','outerfencing',88,1],
  ['woodlands','syccamore',88,1],['woodlands','spindlybirchleaves',88,1],
  ['woodlands','rowanbranch',88,1],['woodlands','othertrees',88,1],['woodlands','birch',88,1],
  ['barrack','birch',100,1],['woodlands','birch-extra',100,1],['woodlands','wall',100,1],
 ['woodlands','near-wall',100,.01]
 ] as const)('%s bullet claim through %s follows recovered group membership', (map,name,health,blockDistance)=>{
  const s=setup(map,'pistol');
  // Install the decoded-format plane before registration captures the world.
  // No ray intersection or damage function is mocked.
  const d=s.getDirection(),o=s.origin;
  const horizontal=Math.hypot(d.x,d.z),side={x:-d.z/horizontal,y:0,z:d.x/horizontal};
  const center={x:o.x+d.x*blockDistance,y:o.y+d.y*blockDistance,z:o.z+d.z*blockDistance};
  const positions=[[-3,-3],[3,-3],[3,3],[-3,3]].map(([a,b])=>{
   const x=center.x+side.x*a,y=center.y+b,z=center.z+side.z*a;return [x,-z,y];
  });
  const geometry=createOriginalSceneGeometry({nodes:[{name,parent:'World',resource:'plane',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],visibility:1,shader:'default'}],
   meshes:[{resource:'plane',part:0,positions,faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}]},{scale:1});
  let currentGeometry=geometry;
  Object.defineProperty(s.room,'originalGeometry',{get:()=>currentGeometry});
  (s.attacker as unknown as {sourceWorld:{doors?:unknown}}).sourceWorld.doors=undefined;
  expect(s.review.raycast(o,d,3,{includeGround:true,minDistance:.01})).toMatchObject({id:name,distance:expect.closeTo(blockDistance,10)});
  s.shoot('group');
  // Removing a blocker after registration must not change the captured query.
  currentGeometry=createOriginalSceneGeometry({nodes:[{name,parent:'World',resource:'plane',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],visibility:1,shader:'default'}],
   meshes:[{resource:'plane',part:0,positions:positions.map(([x,y,z])=>[x+1000,y,z]),faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}]},{scale:1});
  expect(s.review.raycast(o,d,3,{includeGround:true,minDistance:.01})).toBeNull();
  s.hit('group');expect(s.target.health).toBe(health);expect(s.attacker.ammo.pistol).toBe(19);
  s.hit('group',1102);expect(s.target.health).toBe(health);
  expect(s.review.raycast(o,d,3,{includeGround:true,minDistance:.01})).toBeNull();
 });

 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['pistol','shotgun','rifle','sniper'] as const){
  it(`${map} ${weapon} applies source damage equally to head/body and consumes one round and one hit`,()=>{
   for(const head of [false,true]){
    const s=setup(map,weapon,head),damage=getOriginalHitscan(map,weapon)!.damage;s.shoot('real');
    expect(s.room.getSnapshot(1100).players.find(p=>p.id===s.attacker.id)?.sourceMotionTime).toBe(2000);s.hit('real');
    expect(s.target.health).toBe(100-damage);expect(s.attacker.ammo[weapon]).toBe(19);
    const events=s.peer.messages.filter(m=>m.type==='event'&&m.event.type==='damaged');
    expect(events).toHaveLength(1);expect(events[0]).toMatchObject({event:{data:{damage,source:{zone:'body'}}}});
    s.hit('real',1102);s.shoot('real',4000);s.hit('real',4001);
    expect(s.target.health).toBe(100-damage);expect(s.attacker.ammo[weapon]).toBe(19);
   }
  });
  it(`${map} ${weapon} rejects early fire and permits the edition callback interval`,()=>{
   const s=setup(map,weapon),interval=getOriginalHitscan(map,weapon)!.intervalSeconds*1000;
   s.shoot('first');s.shoot('early',1100+interval-2);
   expect(s.attacker.ammo[weapon]).toBe(19);expect(s.peer.messages.some(m=>m.type==='error'&&m.code==='fire_rate')).toBe(true);
   s.shoot('next',1100+interval);expect(s.attacker.ammo[weapon]).toBe(18);
  });
 }
 it.each(['barrack','woodlands'] as const)('%s actual source hit ignores armor and former spawn protection',map=>{
  const s=setup(map,'pistol');s.target.armor=100;s.target.protectedUntil=999999;
  s.shoot('fresh',500);s.hit('fresh',501);expect(s.target.health).toBe(88);expect(s.target.armor).toBe(100);
  expect(s.peer.messages.find(m=>m.type==='event'&&m.event.type==='damaged')).toMatchObject({event:{data:{health:88,lethal:false,sourceHealth:{canonical:88,flick:-2},sourceHealthTime:expect.closeTo(500,6)}}});
 });
 it.each(['barrack','woodlands'] as const)('%s registered source claims miss proxy holes and hit real extremities',map=>{
  for(const kind of ['hole','extremity'] as const){
   const s=setup(map,'pistol'),collision=new OriginalSoldierCollision(originalServerSoldierAssets);
   collision.evaluatePose(s.target.transform.position,s.target.transform.yaw+Math.PI,0);
   const old=s.review as Review&{rayHitPlayerPath(o:Vec3,d:Vec3,p:Vec3[]):unknown};
   let chosen:Vec3|undefined;
   const target=s.target.transform.position;
   const horizontal={x:target.x-s.origin.x,z:target.z-s.origin.z},length=Math.hypot(horizontal.x,horizontal.z),side={x:-horizontal.z/length,z:horizontal.x/length};
   for(let y=.15;y<1.95&&!chosen;y+=.025)for(let offset=-.8;offset<.8&&!chosen;offset+=.025){
    const point={x:target.x+side.x*offset,y:target.y+y,z:target.z+side.z*offset},delta={x:point.x-s.origin.x,y:point.y-s.origin.y,z:point.z-s.origin.z},distance=Math.hypot(delta.x,delta.y,delta.z),direction={x:delta.x/distance,y:delta.y/distance,z:delta.z/distance};
    const proxy=old.rayHitPlayerPath(s.origin,direction,[target]),triangle=collision.intersectRay(s.origin,direction,20);
    if(kind==='hole'?!proxy||triangle:proxy||!triangle)continue;
    if(s.review.raycast(s.origin,direction,triangle?.distance??distance,{includeGround:true,minDistance:.01}))continue;
    chosen=direction;
   }
   expect(chosen).toBeDefined();s.setDirection(chosen!);s.shoot(kind);s.hit(kind);
   expect(s.target.health).toBe(kind==='hole'?100:88);
  }
 });
 it.each(['barrack','woodlands'] as const)('%s rejects a farther claim when a nearer animated actor occupies its ray',map=>{
  const s=setup(map,'pistol'),joined=s.room.join(new Peer(),'Near',0);if(!joined.ok)throw Error('join');
  const nearer=s.review.players.get(joined.player.id)!;
  nearer.transform.position={x:(s.attacker.transform.position.x+s.target.transform.position.x)/2,y:s.target.transform.position.y,z:(s.attacker.transform.position.z+s.target.transform.position.z)/2};
  nearer.transform.yaw=s.target.transform.yaw;nearer.sourceMotionPosition={...nearer.transform.position};nearer.positionHistory=[];s.review.recordPosition(nearer,1000);
  // Aim at the same torso height through both actors, using real source triangles.
  const collision=new OriginalSoldierCollision(originalServerSoldierAssets);collision.evaluatePose(s.target.transform.position,s.target.transform.yaw+Math.PI,0);
  let direction:Vec3|undefined;
  for(let y=.85;y<1.25&&!direction;y+=.01){
   const delta={x:s.target.transform.position.x-s.origin.x,y:s.target.transform.position.y+y-s.origin.y,z:s.target.transform.position.z-s.origin.z},length=Math.hypot(delta.x,delta.y,delta.z),candidate={x:delta.x/length,y:delta.y/length,z:delta.z/length};
   if(!collision.intersectRay(s.origin,candidate,10))continue;
   const nearCollision=new OriginalSoldierCollision(originalServerSoldierAssets);nearCollision.evaluatePose(nearer.transform.position,nearer.transform.yaw+Math.PI,0);
   if(nearCollision.intersectRay(s.origin,candidate,10))direction=candidate;
  }
  expect(direction).toBeDefined();s.setDirection(direction!);s.shoot('nearest');s.hit('nearest');expect(s.target.health).toBe(100);
  s.room.handleMessage(s.attacker.id,{type:'hit',hit:{shotId:'nearest',targetId:nearer.id}},1102);expect(nearer.health).toBe(88);
 });
 it.each(['barrack','woodlands'] as const)('%s rejects actual source triangles beyond recovered fixed-world geometry',map=>{
  const s=setup(map,'pistol'),world=s.review as Review&{raycast(o:Vec3,d:Vec3,r:number,options:unknown):{distance:number}|null};
  let chosen:Vec3|undefined;
  for(let angle=0;angle<Math.PI*2&&!chosen;angle+=Math.PI/8){
   const horizontal={x:Math.cos(angle),y:0,z:Math.sin(angle)},wall=world.raycast(s.origin,horizontal,120,{includeGround:true,minDistance:.01,excludeModel:(name:string)=>originalBulletExcludesModel(map,name)});
   if(!wall||wall.distance<.1)continue;
   s.target.transform.position={x:s.attacker.transform.position.x+horizontal.x*(wall.distance+4),y:s.attacker.transform.position.y,z:s.attacker.transform.position.z+horizontal.z*(wall.distance+4)};
   const collision=new OriginalSoldierCollision(originalServerSoldierAssets),vertices=collision.evaluatePose(s.target.transform.position,s.target.transform.yaw+Math.PI,0);
   const mesh=originalServerSoldierAssets.geometry.meshes.find(m=>m.resource==='GI')!;
   for(const face of mesh.faces){
    const [a,b,c]=face.map(i=>vertices[i]),point={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3,z:(a.z+b.z+c.z)/3};
    if(point.y-s.target.transform.position.y<.8)continue;
    const delta={x:point.x-s.origin.x,y:point.y-s.origin.y,z:point.z-s.origin.z},distance=Math.hypot(delta.x,delta.y,delta.z),candidate={x:delta.x/distance,y:delta.y/distance,z:delta.z/distance};
    const triangle=collision.intersectRay(s.origin,candidate,200),block=world.raycast(s.origin,candidate,200,{includeGround:true,minDistance:.01,excludeModel:(name:string)=>originalBulletExcludesModel(map,name)});
    if(triangle&&block&&block.distance<triangle.distance){chosen=candidate;break;}
   }
  }
  expect(chosen).toBeDefined();s.target.sourceMotionPosition={...s.target.transform.position};
  const poses=s.target as Player&{sourcePoseHistory:unknown[]};poses.sourcePoseHistory=[];s.target.positionHistory=[];s.review.recordPosition(s.target,1000);
  s.setDirection(chosen!);s.shoot('wall');s.hit('wall');expect(s.target.health).toBe(100);expect(s.attacker.ammo.pistol).toBe(19);
 });
 it.each(['barrack','woodlands'] as const)('%s anchors tolerated client origin across a recovered wall to the actual authoritative eye',map=>{
  const s=setup(map,'pistol');
  let wallDirection:Vec3|undefined,wallDistance=0;
  for(let angle=0;angle<Math.PI*2&&!wallDirection;angle+=Math.PI/16){
   const direction={x:Math.cos(angle),y:0,z:Math.sin(angle)},hit=s.review.raycast(s.origin,direction,80,{includeGround:true,minDistance:.01});
   if(hit&&hit.distance>4){wallDirection=direction;wallDistance=hit.distance;}
  }
  expect(wallDirection).toBeDefined();const d=wallDirection!;
  s.attacker.transform.position.x+=d.x*(wallDistance-.1);s.attacker.transform.position.z+=d.z*(wallDistance-.1);
  Object.assign(s.origin,{...s.attacker.transform.position,y:s.attacker.transform.position.y+1.72});
  const requested={x:s.origin.x+d.x*.2,y:s.origin.y,z:s.origin.z+d.z*.2};
  expect(s.review.raycast(s.origin,d,.2,{includeGround:true,minDistance:.01})).not.toBeNull();
  s.target.transform.position={x:s.attacker.transform.position.x-d.x*3,y:s.attacker.transform.position.y,z:s.attacker.transform.position.z-d.z*3};
  const collision=new OriginalSoldierCollision(originalServerSoldierAssets),vertices=collision.evaluatePose(s.target.transform.position,s.target.transform.yaw+Math.PI,0);
  const mesh=originalServerSoldierAssets.geometry.meshes.find(m=>m.resource==='GI')!;let aim:Vec3|undefined;
  for(const face of mesh.faces){
   const [a,b,c]=face.map(i=>vertices[i]),point={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3,z:(a.z+b.z+c.z)/3};
   const delta={x:point.x-s.origin.x,y:point.y-s.origin.y,z:point.z-s.origin.z},distance=Math.hypot(delta.x,delta.y,delta.z),candidate={x:delta.x/distance,y:delta.y/distance,z:delta.z/distance};
   if(collision.intersectRay(s.origin,candidate,10)&&!s.review.raycast(s.origin,candidate,distance,{includeGround:true,minDistance:.01})){aim=candidate;break;}
  }
  expect(aim).toBeDefined();s.setDirection(aim!);
  s.attacker.sourceMotionPosition={...s.attacker.transform.position};s.target.sourceMotionPosition={...s.target.transform.position};
  (s.target as Player&{sourcePoseHistory:unknown[]}).sourcePoseHistory=[];s.target.positionHistory=[];s.review.recordPosition(s.target,1000);
  s.shoot('stale-origin',1100,requested);s.hit('stale-origin');expect(s.target.health).toBe(88);
  expect(s.peer.messages.find(m=>m.type==='event'&&m.event.type==='shot')).toMatchObject({event:{data:{shot:{origin:s.origin}}}});
  expect(s.peer.messages.filter(m=>m.type==='error')).toEqual([]);
  expect(s.peer.messages.at(-1)?.type).toBe('event');
  expect(s.peer.messages.find(m=>m.type==='loadout'&&m.ackShotId==='stale-origin')).toBeDefined();
 });
 it.each(['barrack','woodlands'] as const)('%s rejects an out-of-bound source origin and acknowledges its exact shot ID',map=>{
  const s=setup(map,'pistol');s.shoot('too-far',1100,{...s.origin,x:s.origin.x+2.751});s.hit('too-far');
  expect(s.target.health).toBe(100);expect(s.attacker.ammo.pistol).toBe(20);
  expect(s.peer.messages.find(m=>m.type==='error')).toMatchObject({code:'invalid_origin'});
  expect(s.peer.messages.find(m=>m.type==='loadout'&&m.ackShotId==='too-far')).toBeDefined();
 });
 it.each(['winter','fixture'] as const)('%s keeps authored damage/head bonuses and cadence',mode=>{
  const s=setup('barrack','rifle',true,mode);s.shoot('old');s.hit('old');expect(s.target.health).toBe(25);
  s.shoot('early',1193);expect(s.attacker.ammo.rifle).toBe(19);s.shoot('valid',1195);expect(s.attacker.ammo.rifle).toBe(18);
 });
});
