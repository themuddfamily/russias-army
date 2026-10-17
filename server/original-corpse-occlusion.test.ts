import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {OriginalRemoteView} from '../shared/originalRemoteView';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import {OriginalSoldierCollision} from '../shared/originalSoldierCollision';
import {originalServerSoldierAssets} from './original-soldier-collision';
import type {MessagePeer,ServerMessage,PlayerTransform,Vec3} from './protocol';

class Peer implements MessagePeer {
  messages:ServerMessage[]=[];
  send(message:ServerMessage){if(this.messages.length>=128)throw Error('Finite ledger exceeded');this.messages.push(message);}
}
interface Corpse {ownerId:string;sequence:number;position:Readonly<Vec3>;yaw:number;motionTime:number;deathBon:number}
interface Actor {
  id:string;transform:PlayerTransform;health:number;sourceRemoteView:OriginalRemoteView;
  sourceViewGeneration:number;sourceCounter:OriginalWeaponCounter;sourceCounterUpdatedAt:number;
  sourceCounterReady:boolean;sourceCounterWeapon:string;
  pendingShots:Map<string,{sourceOccluderPoses:readonly unknown[]}>;
}
interface Review {players:Map<string,Actor>;sendSourceViewMessage(player:Actor,message:ServerMessage):void}
/** Explicit clear-air trusted-position fixture, matching original-remote-view.
 * Actual death is authenticated Escape; actor receipts/advancement remain the
 * established direct mirror clock adapter. No physics time is fast-forwarded. */
function setup(){
  const room=new MatchRoom('corpse-ray-authority',{map:'barrack',spawnPoints:[{x:0,y:100,z:0}],now:()=>0});
  const review=room as unknown as Review;
  const join=(name:string,view=false)=>{const peer=new Peer(),out=room.join(peer,name,0,undefined,view);if(!out.ok)throw Error('join');return {peer,actor:review.players.get(out.player.id)!};};
  const far=join('Far'),near=join('Near');
  far.actor.transform.position={x:8,y:100,z:0};far.actor.transform.yaw=.3;
  near.actor.transform.position={x:4,y:100,z:0};near.actor.transform.yaw=.3;
  const viewer=join('Viewer',true),mirror=viewer.actor.sourceRemoteView;
  const trace=(callbacks:number,receipts:{tick:number;callbacks:number}[]=[])=>({generation:viewer.actor.sourceViewGeneration,callbacks,receipts});
  const acknowledge=(callbacks:number,receipts:{tick:number;callbacks:number}[]=[])=>{
    const result=mirror.accept(trace(callbacks,receipts),callbacks*1000/30);expect(result.ok).toBe(true);return result;
  };
  acknowledge(0,[{tick:0,callbacks:0}]);
  room.handleMessage(near.actor.id,{type:'source_escape'},0,near.peer);
  const death=viewer.peer.messages.find(m=>m.type==='event'&&m.event.type==='killed');
  if(death?.type!=='event'||death.sourceViewTick===undefined)throw Error('Actual sent death missing');
  acknowledge(0,[{tick:death.sourceViewTick,callbacks:0}]);acknowledge(1);
  const corpses=()=>mirror.freezeCorpses() as readonly Corpse[];
  expect(corpses()).toHaveLength(1);
  const origin={x:0,y:101.72,z:0};
  const refreshFar=(callbacks:number)=>{
    review.sendSourceViewMessage(viewer.actor,{type:'snapshot',snapshot:room.getSnapshot(callbacks*1000/30)});
    const sent=viewer.peer.messages.at(-1);if(sent?.type!=='snapshot'||sent.sourceViewTick===undefined)throw Error('Snapshot missing');
    acknowledge(callbacks,[{tick:sent.sourceViewTick,callbacks}]);
  };
  const shoot=(id:string,callbacks:number,direction:Vec3)=>{
    const now=callbacks*1000/30,actor=viewer.actor;
    actor.transform.weapon='pistol';actor.sourceCounter=new OriginalWeaponCounter('barrack','pistol');actor.sourceCounterUpdatedAt=now;actor.sourceCounterReady=true;actor.sourceCounterWeapon='pistol';
    room.handleMessage(actor.id,{type:'shoot',shot:{shotId:id,weapon:'pistol',origin,direction},sourceRemoteView:trace(callbacks)},now,viewer.peer);
    expect(actor.pendingShots.has(id)).toBe(true);
    const shot=viewer.peer.messages.find(m=>m.type==='event'&&m.event.type==='shot'&&m.event.data.shot.shotId===id);
    if(shot?.type!=='event'||shot.sourceViewTick===undefined)throw Error('Shot phase missing');
    acknowledge(callbacks,[{tick:shot.sourceViewTick,callbacks}]);
    return actor.pendingShots.get(id)!;
  };
  const hit=(id:string,callbacks:number)=>room.handleMessage(viewer.actor.id,{type:'hit',hit:{shotId:id,targetId:far.actor.id}},callbacks*1000/30+.1,viewer.peer);
  return {room,review,far,near,viewer,mirror,origin,corpses,acknowledge,refreshFar,shoot,hit};
}
function rayToFar(s:ReturnType<typeof setup>,blocked:boolean){
  const pose=s.mirror.freeze().find(p=>p.id===s.far.actor.id)!;
  const far=new OriginalSoldierCollision(originalServerSoldierAssets),near=new OriginalSoldierCollision(originalServerSoldierAssets);
  try{
    const vertices=far.evaluatePose({...pose.position},pose.yaw,pose.motionTime),corpse=s.corpses()[0];
    near.evaluatePose({...corpse.position},corpse.yaw,corpse.motionTime,corpse.deathBon);
    for(const face of originalServerSoldierAssets.geometry.meshes.find(m=>m.resource==='GI')!.faces){
      const p=face.map(i=>vertices[i]);const center={x:(p[0].x+p[1].x+p[2].x)/3,y:(p[0].y+p[1].y+p[2].y)/3,z:(p[0].z+p[1].z+p[2].z)/3};
      const delta={x:center.x-s.origin.x,y:center.y-s.origin.y,z:center.z-s.origin.z},length=Math.hypot(delta.x,delta.y,delta.z);
      if(length===0)continue;
      const direction={x:delta.x/length,y:delta.y/length,z:delta.z/length};
      const f=far.intersectRay(s.origin,direction,100),n=near.intersectRay(s.origin,direction,100);
      if(f&&Boolean(n&&n.distance<f.distance)===blocked)return direction;
    }
    throw Error(`Finite actual-triangle search found no ${blocked?'blocked':'clear'} far ray`);
  }finally{far.dispose();near.dispose();}
}

describe('viewer corpse triangles occlude source hits without receiving damage',()=>{
  it('freezes the corpse at registration while its live mirror subsequently advances the fade',()=>{
    const s=setup(),direction=rayToFar(s,true),registered=s.shoot('frozen-corpse',1,direction);
    expect(registered.sourceOccluderPoses).toHaveLength(1);
    const frozen=structuredClone(registered.sourceOccluderPoses);
    // Keep the ordinary hit inside its unchanged shot-lifetime deadline.
    s.acknowledge(2);expect(s.corpses()[0]).toMatchObject({motionTime:2408,deathBon:8});
    s.hit('frozen-corpse',2);expect(s.far.actor.health).toBe(100);expect(s.near.actor.health).toBe(0);
    expect(registered.sourceOccluderPoses).toHaveLength(1);
    expect(registered.sourceOccluderPoses).toEqual(frozen);
  });
  it('damages a living target along a ray beside the actual visible corpse',()=>{
    const s=setup(),direction=rayToFar(s,false);s.shoot('beside-corpse',1,direction);s.hit('beside-corpse',1);
    expect(s.far.actor.health).toBe(88);expect(s.near.actor.health).toBe(0);
  });
  it('keeps callback75 corpse geometry but removes it on76, permitting the formerly blocked ray',()=>{
    const s=setup(),direction=rayToFar(s,true);
    s.acknowledge(76);expect(s.corpses()).toHaveLength(1);expect(s.corpses()[0].deathBon).toBe(600);
    s.acknowledge(77);expect(s.corpses()).toEqual([]);s.refreshFar(77);
    const registered=s.shoot('after-corpse',77,direction);expect(registered.sourceOccluderPoses).toEqual([]);
    s.hit('after-corpse',77);expect(s.far.actor.health).toBe(88);expect(s.near.actor.health).toBe(0);
  });
});
