import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {OriginalRemoteView} from '../shared/originalRemoteView';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import {OriginalSoldierCollision} from '../shared/originalSoldierCollision';
import {originalServerSoldierAssets} from './original-soldier-collision';
import type {MessagePeer,ServerMessage,PlayerTransform,OriginalRemoteViewWireTrace,Vec3} from './protocol';
class Peer implements MessagePeer {messages:ServerMessage[]=[];fail=false;onSend?:(message:ServerMessage)=>void;send(m:ServerMessage){if(this.fail)throw Error('transport');this.messages.push(m);this.onSend?.(m);}}
interface Player {id:string;peer:MessagePeer|null;resumeToken:string;sourceRemoteView:OriginalRemoteView|null;sourceViewGeneration:number;sourceViewTick:number;sourceCounter:OriginalWeaponCounter;sourceCounterUpdatedAt:number;sourceCounterReady:boolean;sourceCounterWeapon:string;sourceMotionTime:number;transform:PlayerTransform;ammo:Record<string,number>;health:number;alive:boolean;pendingShots:Map<string,{targetPoses:Map<string,{position:Vec3;yaw:number;motionTime:number}[]>}>}
interface Review {kill(killer:Player,victim:Player,source:import('./protocol').DamageSource,now:number,award:boolean):void;players:Map<string,Player>;sendSourceViewMessage(p:Player,m:ServerMessage):void;raycast(o:Vec3,d:Vec3,r:number,opts:unknown):unknown}
function setup(clock:()=>number=()=>0){
 const room=new MatchRoom('source-view',{map:'barrack',spawnPoints:[{x:0,y:100,z:0}],now:clock}),review=room as unknown as Review;
 const targetPeer=new Peer(),tj=room.join(targetPeer,'Target',0);if(!tj.ok)throw Error('join');
 const target=review.players.get(tj.player.id)!;target.transform.position={x:4,y:100,z:0};target.transform.yaw=.3;
 const peer=new Peer(),vj=room.join(peer,'Viewer',0,undefined,true);if(!vj.ok)throw Error('join');
 const viewer=review.players.get(vj.player.id)!;
 const snapshot=(now:number)=>review.sendSourceViewMessage(viewer,{type:'snapshot',snapshot:room.getSnapshot(now)});
 const trace=(callbacks:number,receipts:{tick:number;callbacks:number}[]):OriginalRemoteViewWireTrace=>({generation:viewer.sourceViewGeneration,callbacks,receipts});
 const origin={x:0,y:101.72,z:0};
 const shoot=(id:string,now:number,t:OriginalRemoteViewWireTrace|undefined,direction:Vec3={x:1,y:0,z:0})=>{
  viewer.transform.weapon='pistol';viewer.sourceCounter=new OriginalWeaponCounter('barrack','pistol');viewer.sourceCounterUpdatedAt=now;viewer.sourceCounterReady=true;viewer.sourceCounterWeapon='pistol';
  room.handleMessage(viewer.id,{type:'shoot',shot:{shotId:id,weapon:'pistol',origin,direction},...(t?{sourceRemoteView:t}:{})},now);
 };
 return {room,review,target,viewer,peer,targetPeer,snapshot,trace,origin,shoot};
}
function aimAt(origin:Vec3,position:Vec3,yaw:number,phase:number,accept:(dir:Vec3)=>boolean=()=>true){
 const geometry=new OriginalSoldierCollision(originalServerSoldierAssets),vertices=geometry.evaluatePose(position,yaw,phase);
 for(const face of originalServerSoldierAssets.geometry.meshes.find(m=>m.resource==='GI')!.faces){
  const points=face.map(i=>vertices[i]);const center={x:(points[0].x+points[1].x+points[2].x)/3,y:(points[0].y+points[1].y+points[2].y)/3,z:(points[0].z+points[1].z+points[2].z)/3};
  if(center.y-position.y<.8||center.y-position.y>1.3)continue;
  const delta={x:center.x-origin.x,y:center.y-origin.y,z:center.z-origin.z},length=Math.hypot(delta.x,delta.y,delta.z),dir={x:delta.x/length,y:delta.y/length,z:delta.z/length};
  if(geometry.intersectRay(origin,dir,100)&&accept(dir))return dir;
 }
 throw Error('No visible posed triangle');
}
describe('negotiated source remote view authority',()=>{
 it('records and sends actual dispatch time before a slow successful send, without changing simulation timestamps or age budgets',()=>{
  let clock=0;const s=setup(()=>clock);expect(s.viewer.sourceRemoteView!.accept(s.trace(0,[{tick:0,callbacks:0}]),0).ok).toBe(true);
  clock=300;s.peer.onSend=()=>{clock+=200;};s.snapshot(100);
  expect(s.peer.messages.at(-1)).toMatchObject({type:'snapshot',sourceViewTick:1,sourceViewSentAt:300,snapshot:{serverTime:100}});
  expect(clock).toBe(500);expect(s.viewer.sourceRemoteView!.debugState().pendingSentAt).toEqual([300]);
  // Simulation age1100ms must not expire a packet actually dispatched900ms ago.
  expect(s.viewer.sourceRemoteView!.accept(s.trace(36,[{tick:1,callbacks:9}]),1200)).toEqual({ok:true});
 });
 it('orders a historical killed callback after the preceding snapshot using actual dispatch times',()=>{
  let clock=0;const s=setup(()=>clock);clock=400;s.snapshot(300);clock=500;
  s.review.kill(s.viewer,s.target,{kind:'hitscan',shotId:'historical',weapon:'pistol',zone:'body',position:{...s.target.transform.position}},200,true);
  expect(s.peer.messages.find(m=>m.type==='event'&&m.event.type==='killed')).toMatchObject({sourceViewTick:2,sourceViewSentAt:500,event:{serverTime:200}});
  expect(s.viewer.sourceRemoteView!.debugState().pendingSentAt).toEqual([0,400,500]);expect(s.viewer.peer).toBe(s.peer);
  expect(s.peer.messages.some(m=>m.type==='error')).toBe(false);
  expect(s.viewer.sourceRemoteView!.accept(s.trace(15,[{tick:0,callbacks:0},{tick:1,callbacks:12},{tick:2,callbacks:15}]),500)).toEqual({ok:true});
  expect(s.viewer.sourceRemoteView!.freeze()[0]).toMatchObject({id:s.target.id,alive:false,motionTime:0});
 });
 it('welcomes before private initial tick zero and resets generation/receipts on reconnect',()=>{
  const s=setup();expect(s.peer.messages[0]).toMatchObject({type:'welcome',sourceRemoteView:{epoch:0,generation:s.viewer.sourceViewGeneration}});
  expect(s.peer.messages[1]).toMatchObject({type:'snapshot',sourceViewTick:0});
  const old=s.viewer.sourceViewGeneration,token=s.viewer.resumeToken;s.room.suspend(s.viewer.id,10,s.peer);expect(s.viewer.sourceRemoteView).toBeNull();
  const peer=new Peer(),joined=s.room.join(peer,'Viewer',20,token,true);expect(joined.ok).toBe(true);expect(s.viewer.sourceViewGeneration).toBeGreaterThan(old);
  expect(peer.messages[0]).toMatchObject({sourceRemoteView:{epoch:20,generation:s.viewer.sourceViewGeneration}});expect(peer.messages[1]).toMatchObject({sourceViewTick:0});
  s.shoot('old',20,{generation:old,callbacks:0,receipts:[{tick:0,callbacks:0}]});expect(s.viewer.pendingShots.size).toBe(0);
 });
 for(const kind of ['missing','unsent','generation','future','order'] as const)it(`rejects ${kind} trace before consuming ammunition or registering shot`,()=>{
  const s=setup();s.snapshot(50);const before=s.viewer.ammo.pistol,mirror=s.viewer.sourceRemoteView!,state=mirror.debugState();
  const t=s.trace(3,[{tick:0,callbacks:0},{tick:1,callbacks:1}]);
  if(kind==='unsent')t.receipts[1].tick=900;if(kind==='generation')t.generation++;if(kind==='future')t.callbacks=100;if(kind==='order')t.receipts.reverse();
  s.shoot(kind,100,kind==='missing'?undefined:t);expect(s.viewer.ammo.pistol).toBe(before);expect(s.viewer.pendingShots.size).toBe(0);
  expect(mirror.debugState()).toEqual(state);expect(s.viewer.peer).toBeNull();expect(s.viewer.sourceRemoteView).toBeNull();expect(s.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'invalid_source_view'}));expect(s.peer.messages.at(-2)).toMatchObject({type:'loadout',ackShotId:kind});expect(s.peer.messages.at(-1)).toMatchObject({type:'error',code:'invalid_source_view'});
  const count=s.peer.messages.length;
  s.room.handleMessage(s.viewer.id,{type:'transform',sequence:1,clientTime:101,transform:s.viewer.transform,sourceRemoteView:t},101,s.peer);
  expect(s.peer.messages).toHaveLength(count);expect(s.viewer.ammo.pistol).toBe(before);
  const resumed=new Peer();expect(s.room.join(resumed,'Viewer',102,s.viewer.resumeToken,true).ok).toBe(true);
  expect(s.viewer.peer).toBe(resumed);expect(s.viewer.sourceRemoteView).not.toBeNull();
 });
 it('freezes delayed moving/turning GI displayed triangles rather than current or raw history',()=>{
  const s=setup();s.target.transform.position.x=8;s.target.transform.yaw=1.2;s.target.sourceMotionTime=440;s.snapshot(100);
  const t=s.trace(6,[{tick:0,callbacks:0},{tick:1,callbacks:3}]);expect(s.viewer.sourceRemoteView!.accept(t,200).ok).toBe(true);
  const pose=s.viewer.sourceRemoteView!.freeze().find(p=>p.id===s.target.id)!;expect(pose.position.x).toBeGreaterThan(4);expect(pose.position.x).toBeLessThan(8);
  expect(pose.yaw).not.toBeCloseTo(1.2+Math.PI);
  // Source newstuff preserves bon0; three later callbacks advance it from
  // the actual interpolation speed, independently of transported phase440.
  let expectedX=4,expectedPhase=0;
  for(const remaining of [9,8,7]){const dx=(8-expectedX)/remaining;expectedX+=dx;expectedPhase+=Math.hypot(dx,0,0)/ORIGINAL_MAP_SCALE*10;if(expectedPhase>1000)expectedPhase-=1000;}
  expect(pose.motionTime).toBe(expectedPhase);expect(pose.motionTime).not.toBe(440);
  const dir=aimAt(s.origin,{...pose.position},pose.yaw,pose.motionTime);s.shoot('posed',200,s.trace(6,[]),dir);
  const registered=s.viewer.pendingShots.get('posed')!;expect(registered.targetPoses.get(s.target.id)).toEqual([{receivedAt:200,position:{...pose.position},yaw:pose.yaw-Math.PI,motionTime:expectedPhase}]);
  s.target.transform.position.x=40;s.target.transform.yaw=2.5;
  s.room.handleMessage(s.viewer.id,{type:'hit',hit:{shotId:'posed',targetId:s.target.id}},201);expect(s.target.health).toBe(88);
 });
 it('rejects a farther display target when another live displayed GI is nearer',()=>{
  const s=setup();s.target.transform.position.x=8;
  const join=s.room.join(new Peer(),'Nearer',0);if(!join.ok)throw Error('join');const near=s.review.players.get(join.player.id)!;near.transform.position={x:4,y:100,z:0};near.transform.yaw=s.target.transform.yaw;
  s.snapshot(0);const t=s.trace(12,[{tick:0,callbacks:0},{tick:1,callbacks:0}]);s.viewer.sourceRemoteView!.accept(t,400);
  const poses=s.viewer.sourceRemoteView!.freeze(),farPose=poses.find(p=>p.id===s.target.id)!,nearPose=poses.find(p=>p.id===near.id)!;
  const collision=new OriginalSoldierCollision(originalServerSoldierAssets);collision.evaluatePose({...nearPose.position},nearPose.yaw,nearPose.motionTime);
  const dir=aimAt(s.origin,{...farPose.position},farPose.yaw,farPose.motionTime,d=>Boolean(collision.intersectRay(s.origin,d,100)));
  s.shoot('nearest',400,s.trace(12,[]),dir);expect(s.viewer.pendingShots.get('nearest')!.targetPoses.size).toBe(2);
  s.room.handleMessage(s.viewer.id,{type:'hit',hit:{shotId:'nearest',targetId:s.target.id}},401);expect(s.target.health).toBe(100);
  s.room.handleMessage(s.viewer.id,{type:'hit',hit:{shotId:'nearest',targetId:near.id}},402);expect(near.health).toBe(88);
 });
 it('keeps a departed displayed GI as an occluding ghost until callback460, without making it damageable',()=>{
  // Existing explicit clear-air trusted-pose fixture: this proves receipt,
  // triangle and target eligibility ordering, not native spawn placement.
  const s=setup();s.target.transform.position.x=8;
  const nearPeer=new Peer(),joined=s.room.join(nearPeer,'Departing nearer',0);if(!joined.ok)throw Error('join');
  const near=s.review.players.get(joined.player.id)!;near.transform.position={x:4,y:100,z:0};near.transform.yaw=s.target.transform.yaw;
  s.snapshot(0);
  expect(s.viewer.sourceRemoteView!.accept(s.trace(12,[{tick:0,callbacks:0},{tick:1,callbacks:0}]),400)).toEqual({ok:true});
  const poses=s.viewer.sourceRemoteView!.freeze(),farPose=poses.find(p=>p.id===s.target.id)!,nearPose=poses.find(p=>p.id===near.id)!;
  const collision=new OriginalSoldierCollision(originalServerSoldierAssets);collision.evaluatePose({...nearPose.position},nearPose.yaw,nearPose.motionTime);
  const direction=aimAt(s.origin,{...farPose.position},farPose.yaw,farPose.motionTime,d=>Boolean(collision.intersectRay(s.origin,d,100)));
  expect(s.room.leave(near.id,400,nearPeer)).toBe(true);expect(s.room.has(near.id)).toBe(false);
  s.snapshot(400);
  // The ordinary authenticated shot acknowledges the snapshot omission.
  s.shoot('ghost-occluded',400,s.trace(12,[{tick:2,callbacks:12}]),direction);
  const registered=s.viewer.pendingShots.get('ghost-occluded')!;
  expect(registered).toBeDefined();expect(registered.targetPoses.has(near.id)).toBe(true);expect(registered.targetPoses.has(s.target.id)).toBe(true);
  expect(s.viewer.sourceRemoteView!.freeze().find(p=>p.id===near.id)).toMatchObject({alive:true,steps:-2});
  s.room.handleMessage(s.viewer.id,{type:'hit',hit:{shotId:'ghost-occluded',targetId:near.id}},401);expect(near.health).toBe(100);
  s.room.handleMessage(s.viewer.id,{type:'hit',hit:{shotId:'ghost-occluded',targetId:s.target.id}},402);expect(s.target.health).toBe(100);
  expect(nearPeer.messages.some(m=>m.type==='event'&&m.event.type==='damaged')).toBe(false);
  // A duplicate ordinary shot acknowledges its own previously sent phase
  // receipt without registering another shot. No stale receipt is held across
  // the idle interval, and no acceptance/freshness limit is relaxed.
  const ammo=s.viewer.ammo.pistol;
  s.room.handleMessage(s.viewer.id,{type:'shoot',shot:{shotId:'ghost-occluded',weapon:'pistol',origin:s.origin,direction},
   sourceRemoteView:s.trace(12,[{tick:3,callbacks:12}])},403);
  expect(s.viewer.ammo.pistol).toBe(ammo);expect(s.viewer.sourceRemoteView!.debugState().pendingTicks).toEqual([]);
  expect(s.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'duplicate_shot'}));
  // Receive the actual current far target at callback459. Its where packet
  // extends its own recurrence; the omitted near actor reaches -450 on460.
  s.snapshot(15300);
  s.shoot('after-ghost-timeout',15334,s.trace(460,[{tick:4,callbacks:459}]),direction);
  expect(s.viewer.sourceRemoteView!.freeze().map(p=>p.id)).not.toContain(near.id);
  const after=s.viewer.pendingShots.get('after-ghost-timeout')!;expect(after).toBeDefined();
  expect(after.targetPoses.has(near.id)).toBe(false);expect(after.targetPoses.has(s.target.id)).toBe(true);
  s.room.handleMessage(s.viewer.id,{type:'hit',hit:{shotId:'after-ghost-timeout',targetId:s.target.id}},15335);
  expect(s.target.health).toBe(88);expect(near.health).toBe(100);
 });
 it('retains actual original world occlusion for a frozen displayed target',()=>{
  const s=setup(),feet=getOriginalMapRuntime('barrack').spawnPoints[0];s.viewer.transform.position={...feet};Object.assign(s.origin,{...feet,y:feet.y+1.72});
  let blocked:Vec3|undefined;
  for(let angle=0;angle<Math.PI*2;angle+=.1){const d={x:Math.cos(angle),y:0,z:Math.sin(angle)};const hit=s.review.raycast(s.origin,d,100,{includeGround:true,minDistance:.01}) as {distance:number}|null;
    if(hit&&hit.distance>2){blocked={x:feet.x+d.x*(hit.distance+4),y:feet.y,z:feet.z+d.z*(hit.distance+4)};break;}}
  expect(blocked).toBeDefined();s.target.transform.position=blocked!;s.snapshot(0);s.viewer.sourceRemoteView!.accept(s.trace(12,[{tick:0,callbacks:0},{tick:1,callbacks:0}]),400);
  const pose=s.viewer.sourceRemoteView!.freeze()[0],dir=aimAt(s.origin,{...pose.position},pose.yaw,pose.motionTime,d=>Boolean(s.review.raycast(s.origin,d,Math.hypot(pose.position.x-s.origin.x,pose.position.z-s.origin.z),{includeGround:true,minDistance:.01})));
  s.shoot('wall',400,s.trace(12,[]),dir);expect(s.viewer.pendingShots.has('wall')).toBe(true);
  s.room.handleMessage(s.viewer.id,{type:'hit',hit:{shotId:'wall',targetId:s.target.id}},401);expect(s.target.health).toBe(100);
 });
 it('records inert shot receipts and consumes their trusted report on the next callback',()=>{
  const s=setup();s.viewer.sourceRemoteView!.accept(s.trace(0,[{tick:0,callbacks:0}]),0);
  s.review.sendSourceViewMessage(s.viewer,{type:'event',event:{type:'shot',serverTime:50,data:{playerId:s.target.id,shot:{shotId:'remote',weapon:'pistol',origin:s.origin,direction:{x:1,y:0,z:0}}}}});
  expect(s.peer.messages.at(-1)).toMatchObject({sourceViewTick:1});expect(s.viewer.sourceRemoteView!.accept(s.trace(1,[{tick:1,callbacks:1}]),50).ok).toBe(true);
  expect(s.viewer.sourceRemoteView!.freeze()).toMatchObject([{id:s.target.id,motionTime:0,position:{x:4,y:100,z:0}}]);
  const report=s.room.getSnapshot(50);report.players=report.players.map(player=>player.id===s.target.id?{...player,sourceShots:1}:player);
  s.review.sendSourceViewMessage(s.viewer,{type:'snapshot',snapshot:report});
  expect(s.peer.messages.at(-1)).toMatchObject({sourceViewTick:2});
  expect(s.viewer.sourceRemoteView!.accept(s.trace(1,[{tick:2,callbacks:1}]),50).ok).toBe(true);
  expect(s.viewer.sourceRemoteView!.freeze()).toMatchObject([{id:s.target.id,motionTime:0,position:{x:4,y:100,z:0}}]);
  expect(s.viewer.sourceRemoteView!.accept(s.trace(2,[]),2000/30).ok).toBe(true);
  expect(s.viewer.sourceRemoteView!.freeze()).toMatchObject([{id:s.target.id,motionTime:1000,position:{x:4,y:100,z:0}}]);
 });
 it('actual killed event receives the next private tick before a full snapshot and dead displayed targets cannot be shot',()=>{
  const s=setup();s.viewer.sourceRemoteView!.accept(s.trace(0,[{tick:0,callbacks:0}]),0);
  s.target.transform.position.x=9;s.snapshot(50);s.viewer.sourceRemoteView!.accept(s.trace(1,[{tick:1,callbacks:1}]),50);
  s.viewer.sourceRemoteView!.accept(s.trace(2,[]),67);const before=s.viewer.sourceRemoteView!.freeze()[0];
  s.review.kill(s.viewer,s.target,{kind:'hitscan',shotId:'lethal',weapon:'pistol',zone:'body',position:{...s.target.transform.position}},70,true);
  const killed=s.peer.messages.find(m=>m.type==='event'&&m.event.type==='killed');expect(killed).toMatchObject({type:'event',sourceViewTick:2,event:{data:{victimId:s.target.id}}});
  expect(s.viewer.sourceRemoteView!.accept(s.trace(2,[{tick:2,callbacks:2}]),80).ok).toBe(true);
  expect(s.viewer.sourceRemoteView!.freeze()[0]).toEqual({...before,alive:false});
  const death=s.viewer.sourceRemoteView!.accept(s.trace(3,[]),100);
  expect(death).toMatchObject({ok:true,deaths:[{id:s.target.id,callback:3,weapon:'launcher',position:{x:before.position.x+(9-before.position.x)/(before.steps-1),y:100,z:0}}]});
  expect(s.viewer.sourceRemoteView!.freeze()).toEqual([]);
  const dir=aimAt(s.origin,{...before.position},before.yaw,before.motionTime);s.shoot('after-death',100,s.trace(3,[]),dir);
  expect(s.viewer.pendingShots.get('after-death')!.targetPoses.has(s.target.id)).toBe(false);s.room.handleMessage(s.viewer.id,{type:'hit',hit:{shotId:'after-death',targetId:s.target.id}},101);expect(s.target.health).toBe(0);
  // The local shot itself occupies the next private ordered tick.
  expect(s.peer.messages.find(m=>m.type==='event'&&m.event.type==='shot')).toMatchObject({sourceViewTick:3});
  s.snapshot(110);expect(s.peer.messages.at(-1)).toMatchObject({type:'snapshot',sourceViewTick:4});
 });
 it('never records a failed send and detaches the generation for explicit reconnect',()=>{
  const s=setup(),mirror=s.viewer.sourceRemoteView!;s.peer.fail=true;s.snapshot(50);
  expect(mirror.debugState().pendingTicks).toEqual([0]);expect(s.viewer.peer).toBeNull();expect(s.viewer.sourceRemoteView).toBeNull();
 });
 it('disconnects on mirror queue saturation instead of accepting unrecorded targets',()=>{
  const s=setup();for(let i=0;i<64;i++)s.snapshot(i+1);
  expect(s.viewer.peer).toBeNull();expect(s.viewer.sourceRemoteView).toBeNull();expect(s.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'source_view_resync_required',message:'snapshot_queue_full'}));
 });
});
