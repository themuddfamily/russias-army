import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {OriginalSoldierCollision} from '../shared/originalSoldierCollision';
import {originalServerSoldierAssets} from './original-soldier-collision';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import type {MessagePeer,ServerMessage,Vec3,PlayerTransform} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];send(m:ServerMessage){this.messages.push(m);}}
interface Pose {receivedAt:number;position:Vec3;yaw:number;motionTime:number}
interface Player {alive:boolean;id:string;sourceMotionTime:number;sourceMotionPosition:Vec3;sourcePoseHistory:Pose[];transform:PlayerTransform;resumeToken:string}
interface Review {players:Map<string,Player>;stepSourceMotion(time:number):void;recordSourcePose(p:Player,t:number):void;rewindSourcePoses(p:Player,t:number):Pose[];rayHitSourcePoses(o:Vec3,d:Vec3,p:Pose[]):{distance:number}|null;rayHitPlayerPath(o:Vec3,d:Vec3,p:Vec3[]):unknown}
function setup(map:'barrack'|'woodlands'){
 const room=new MatchRoom('gi-triangle',{map,spawnPoints:[getOriginalMapRuntime(map).spawnPoints[0]],now:()=>0});
 const peer=new Peer(),join=room.join(peer,'GI',0);if(!join.ok)throw Error('join');
 const review=room as unknown as Review,player=review.players.get(join.player.id)!;return {room,review,player,peer};
}
describe('source GI authoritative pose geometry',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} phases follow accepted displacement, source single subtraction, shot phase and retained reconnect`,()=>{
   const s=setup(map),p=s.player;
   s.room.tick(1000/30);expect(s.room.getSnapshot().players[0].sourceMotionTime).toBe(0);
   p.transform.position.x+=ORIGINAL_MAP_SCALE*50;s.review.stepSourceMotion(67);expect(p.sourceMotionTime).toBeCloseTo(500);
   p.sourceMotionTime=2000;s.review.stepSourceMotion(100);expect(p.sourceMotionTime).toBe(1000);
   s.review.stepSourceMotion(133);expect(p.sourceMotionTime).toBe(1000);
   p.transform.position.x+=ORIGINAL_MAP_SCALE;s.review.stepSourceMotion(167);expect(p.sourceMotionTime).toBeCloseTo(10);
   const token=p.resumeToken;s.room.suspend(p.id,170,s.peer);s.room.tick(200);expect(p.sourceMotionTime).toBeCloseTo(10);
   const joined=s.room.join(new Peer(),'GI',210,token);expect(joined.ok).toBe(true);
   if(joined.ok)expect(joined.player.sourceMotionTime).toBeCloseTo(10);
  });
  it(`${map} preserves accepted yaw and phase, bounded history, and separate historical poses without swept fills`,()=>{
   const s=setup(map),p=s.player;
   p.transform.position={x:-2,y:0,z:0};p.transform.yaw=.2;p.sourceMotionTime=320;s.review.recordSourcePose(p,20);
   p.transform.position={x:2,y:0,z:0};p.transform.yaw=.7;p.sourceMotionTime=670;s.review.recordSourcePose(p,40);
   const poses=s.review.rewindSourcePoses(p,40);expect(poses).toMatchObject([{yaw:.2,motionTime:320},{yaw:.7,motionTime:670}]);
   const origin={x:0,y:.98,z:4},direction={x:0,y:0,z:-1};
   expect(s.review.rayHitPlayerPath(origin,direction,poses.map(p=>p.position))).not.toBeNull();
   expect(s.review.rayHitSourcePoses(origin,direction,poses)).toBeNull();
   for(let i=0;i<100;i++)s.review.recordSourcePose(p,100+i*10);
   expect(p.sourcePoseHistory.length).toBeLessThanOrEqual(32);expect(p.sourcePoseHistory[0].receivedAt).toBeGreaterThanOrEqual(780);
  });
 }
 it('advances connected death phase exactly eight per callback and stops at source removal3008',()=>{
  const s=setup('barrack');s.player.alive=false;s.player.sourceMotionTime=2400;
  s.review.stepSourceMotion(33);expect(s.player.sourceMotionTime).toBe(2408);
  for(let i=0;i<74;i++)s.review.stepSourceMotion(67+i*1000/30);
  expect(s.player.sourceMotionTime).toBe(3000);
  s.review.stepSourceMotion(3000);expect(s.player.sourceMotionTime).toBe(3008);
  s.review.stepSourceMotion(3033);expect(s.player.sourceMotionTime).toBe(3008);
  expect(s.room.getSnapshot().players[0].sourceMotionTime).toBe(3008);
 });
 it('actual source-room triangle query preserves holes inside former body volume and reaches real extremities',()=>{
  const s=setup('barrack'),pose={receivedAt:0,position:{x:0,y:0,z:0},yaw:0,motionTime:0};
  const geometry=new OriginalSoldierCollision(originalServerSoldierAssets);geometry.evaluatePose(pose.position,Math.PI,0);
  let hole:Vec3|undefined,extremity:Vec3|undefined;
  for(let y=.2;y<1.95;y+=.025)for(let x=-.8;x<.8;x+=.025){
   const origin={x,y,z:4},direction={x:0,y:0,z:-1};
   const proxy=s.review.rayHitPlayerPath(origin,direction,[pose.position]),triangle=geometry.intersectRay(origin,direction,10);
   if(proxy&&!triangle)hole??=origin;
   if(!proxy&&triangle)extremity??=origin;
  }
  expect(hole).toBeDefined();expect(extremity).toBeDefined();
  expect(s.review.rayHitSourcePoses(hole!,{x:0,y:0,z:-1},[pose])).toBeNull();
  expect(s.review.rayHitSourcePoses(extremity!,{x:0,y:0,z:-1},[pose])).not.toBeNull();
 });
});
