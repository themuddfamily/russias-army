import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalRemoteView} from '../shared/originalRemoteView';
import {ORIGINAL_DROP_AMMO,originalDropPosition,originalPickupInReach} from '../shared/originalPickupRules';
import type {MessagePeer,ServerMessage,PlayerTransform,OriginalRemoteViewWireTrace,WeaponId} from './protocol';
import type {WeaponDropSnapshot} from '../shared/protocol';

class Peer implements MessagePeer {
  messages:ServerMessage[]=[];
  send(message:ServerMessage){
    if(this.messages.length>=512)throw Error('Test message ledger exceeded its bound');
    this.messages.push(message);
  }
}
interface Player {
  id:string;peer:MessagePeer|null;resumeToken:string;transform:PlayerTransform;
  health:number;alive:boolean;score:number;frags:number;deaths:number;
  ammo:Record<WeaponId,number>;reserve:Record<WeaponId,number>;
  sourceRemoteView:OriginalRemoteView|null;sourceViewGeneration:number;
  sourceTimeoutDrops:Map<string,WeaponDropSnapshot>;
}
interface Review {
  players:Map<string,Player>;
  sendSourceViewMessage(player:Player,message:ServerMessage):void;
}

/** Authored spawn fixture uses actual Woodland source starts. No damage,
 * actor positions, counters, or private drops are changed by the fixture.
 * Direct dispatch follows the existing source-view tests and records precisely
 * the snapshots the authority actually sends to this particular viewer. */
function setup(distant=false){
  let clock=0,sequence=0;
  const runtime=getOriginalMapRuntime('woodlands');
  const room=new MatchRoom('timeout-private-pickups',{map:'woodlands',
    spawnPoints:distant?runtime.spawnPoints:[runtime.spawnPoints[0]],now:()=>clock});
  const review=room as unknown as Review,targetPeer=new Peer(),observerPeer=new Peer(),peer=new Peer();
  const join=(p:Peer,name:string,enabled=false)=>{
    const result=room.join(p,name,clock,undefined,enabled);
    if(!result.ok)throw Error('Fixture join failed');
    return review.players.get(result.player.id)!;
  };
  const target=join(targetPeer,'Departing');
  // Ordinary selection makes the trusted last sent weapon distinguishable
  // from the default launcher and from the viewer's own equipped weapon.
  room.handleMessage(target.id,{type:'transform',sequence:0,clientTime:0,
    transform:{...target.transform,weapon:'rifle'}},0);
  expect(target.transform.weapon).toBe('rifle');
  const observer=join(observerPeer,'Observer'),viewer=join(peer,'Viewer',true);
  const mirror=viewer.sourceRemoteView!;
  const trace=(callbacks:number,receipts:{tick:number;callbacks:number}[]):OriginalRemoteViewWireTrace=>({
    generation:viewer.sourceViewGeneration,callbacks,receipts});
  const snapshot=(now:number)=>{
    clock=now;review.sendSourceViewMessage(viewer,{type:'snapshot',snapshot:room.getSnapshot(now)});
    const message=peer.messages.at(-1);
    if(message?.type!=='snapshot'||message.sourceViewTick===undefined)throw Error('Missing recorded snapshot');
    return message;
  };
  const transform=(callbacks:number,now:number,receipts:{tick:number;callbacks:number}[]=[])=>{
    clock=now;room.handleMessage(viewer.id,{type:'transform',sequence:sequence++,clientTime:now,
      transform:{...viewer.transform},sourceRemoteView:trace(callbacks,receipts)},now);
  };
  const initial=peer.messages.find(message=>message.type==='snapshot');
  if(initial?.type!=='snapshot'||initial.sourceViewTick===undefined)throw Error('Missing welcome snapshot');
  const sentTarget=initial.snapshot.players.find(player=>player.id===target.id)!;
  expect(room.leave(target.id,0,targetPeer)).toBe(true);
  const omitted=snapshot(0);
  transform(0,0,[{tick:initial.sourceViewTick,callbacks:0},{tick:omitted.sourceViewTick!,callbacks:0}]);
  const at449=()=>{
    const current=snapshot(15300);
    // This timely snapshot refreshes the living observer, but cannot refresh
    // the departed actor because its id is absent from the authority snapshot.
    transform(459,15300,[{tick:current.sourceViewTick!,callbacks:459}]);
  };
  const transition=()=>{at449();transform(460,15334);};
  const collect=(player:Player,id:string,now=15335)=>{
    clock=now;room.handleMessage(player.id,{type:'collect',itemId:id},now);
  };
  return {room,review,runtime,target,viewer,observer,peer,targetPeer,observerPeer,mirror,
    sentTarget,snapshot,trace,transform,at449,transition,collect};
}
const standing=(player:Player)=>({health:player.health,alive:player.alive,score:player.score,frags:player.frags,deaths:player.deaths});
const terminal=(peer:Peer)=>peer.messages.filter(message=>message.type==='event'&&(message.event.type==='killed'||message.event.type==='damaged'));
const collected=(peer:Peer)=>peer.messages.filter(message=>message.type==='event'&&message.event.type==='collected');

describe('trusted missing-where timeout authority and viewer-local pickups',()=>{
  it('transitions only at callback460, sends a private trusted gun, and collects once for ammo and five points',()=>{
    const s=setup(),before=[standing(s.target),standing(s.viewer),standing(s.observer)],reserve=s.viewer.reserve.rifle;
    s.at449();
    expect(s.mirror.freeze().find(actor=>actor.id===s.target.id)).toMatchObject({alive:true,steps:-449});
    expect(s.viewer.sourceTimeoutDrops.size).toBe(0);
    s.transform(460,15334);
    expect(s.mirror.freeze().map(actor=>actor.id)).not.toContain(s.target.id);
    expect(s.viewer.sourceTimeoutDrops.size).toBe(1);
    const drop=[...s.viewer.sourceTimeoutDrops.values()][0];
    expect(drop).toMatchObject({weapon:'rifle',expiresAt:null,position:originalDropPosition({
      ...s.sentTarget.transform.position,y:s.sentTarget.transform.position.y+s.runtime.profile.eyeHeight},s.runtime.scale)});
    expect(drop.yaw).toBeGreaterThanOrEqual(10*Math.PI/180);expect(drop.yaw).toBeLessThanOrEqual(2*Math.PI);
    expect([standing(s.target),standing(s.viewer),standing(s.observer)]).toEqual(before);
    expect(s.room.getSnapshot(15334).drops).toEqual([]);
    expect(s.snapshot(15334).snapshot.drops).toEqual([drop]);
    s.review.sendSourceViewMessage(s.observer,{type:'snapshot',snapshot:s.room.getSnapshot(15334)});
    expect(s.observerPeer.messages.at(-1)).toMatchObject({type:'snapshot',snapshot:{drops:[]}});
    s.collect(s.observer,drop.id);
    expect(s.viewer.sourceTimeoutDrops.size).toBe(1);expect(s.observer.score).toBe(0);
    expect(originalPickupInReach({...s.viewer.transform.position,y:s.viewer.transform.position.y+s.runtime.profile.eyeHeight},drop.position,s.runtime.scale)).toBe(true);
    s.collect(s.viewer,drop.id);
    expect(s.viewer.sourceTimeoutDrops.size).toBe(0);expect(s.viewer.score).toBe(5);
    expect(s.viewer.reserve.rifle).toBe(reserve+ORIGINAL_DROP_AMMO.rifle);
    expect(s.viewer.transform.weapon).toBe('launcher');
    expect(collected(s.peer)).toHaveLength(1);
    expect(collected(s.peer)[0]).toMatchObject({event:{data:{playerId:s.viewer.id,itemId:drop.id,weapon:'rifle',score:5}}});
    expect(collected(s.observerPeer)).toEqual([]);expect(collected(s.targetPeer)).toEqual([]);
    s.collect(s.viewer,drop.id,15336);
    expect(s.viewer.score).toBe(5);expect(s.viewer.reserve.rifle).toBe(reserve+ORIGINAL_DROP_AMMO.rifle);expect(collected(s.peer)).toHaveLength(1);
    expect(s.room.getSnapshot(15336).drops).toEqual([]);
    expect([terminal(s.peer),terminal(s.observerPeer),terminal(s.targetPeer)]).toEqual([[],[],[]]);
    expect(standing(s.viewer)).toEqual({...before[1],score:5});expect(standing(s.observer)).toEqual(before[2]);expect(standing(s.target)).toEqual(before[0]);
  });

  it('cannot collect its own timeout pickup beyond the existing camera-distance reach',()=>{
    const s=setup(true),reserve=s.viewer.reserve.rifle;s.transition();
    const drop=[...s.viewer.sourceTimeoutDrops.values()][0];expect(drop).toBeDefined();
    expect(originalPickupInReach({...s.viewer.transform.position,y:s.viewer.transform.position.y+s.runtime.profile.eyeHeight},drop.position,s.runtime.scale)).toBe(false);
    s.collect(s.viewer,drop.id);
    expect(s.viewer.sourceTimeoutDrops.get(drop.id)).toEqual(drop);expect(s.viewer.score).toBe(0);
    expect(s.viewer.reserve.rifle).toBe(reserve);expect(collected(s.peer)).toEqual([]);
    expect(s.room.getSnapshot(15335).drops).toEqual([]);
  });

  it('rejects a later invalid receipt atomically before a would-be timeout or private pickup',()=>{
    const s=setup();s.at449();
    const first=s.snapshot(15334),second=s.snapshot(15334),before=s.mirror.freeze(),state=s.mirror.debugState();
    s.transform(460,15334,[{tick:first.sourceViewTick!,callbacks:460},{tick:second.sourceViewTick!+100,callbacks:460}]);
    expect(s.mirror.freeze()).toEqual(before);expect(s.mirror.debugState()).toEqual(state);
    expect(s.viewer.sourceTimeoutDrops.size).toBe(0);expect(s.room.getSnapshot(15334).drops).toEqual([]);
    expect(s.viewer.peer).toBeNull();expect(s.viewer.sourceRemoteView).toBeNull();
    expect(s.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'invalid_source_view'}));
    expect(s.viewer.health).toBe(100);expect(s.viewer.score).toBe(0);expect(s.viewer.frags).toBe(0);expect(s.viewer.deaths).toBe(0);
    expect(terminal(s.peer)).toEqual([]);
  });

  it('clears viewer-local timeout pickups when a new authenticated source-view generation reconnects',()=>{
    const s=setup();s.transition();expect(s.viewer.sourceTimeoutDrops.size).toBe(1);
    const oldGeneration=s.viewer.sourceViewGeneration,token=s.viewer.resumeToken;
    expect(s.room.suspend(s.viewer.id,15335,s.peer)).toBe(true);
    const next=new Peer(),result=s.room.join(next,'Viewer',15336,token,true);expect(result.ok).toBe(true);
    expect(s.viewer.sourceViewGeneration).toBeGreaterThan(oldGeneration);expect(s.viewer.sourceTimeoutDrops.size).toBe(0);
    expect(next.messages.find(message=>message.type==='snapshot')).toMatchObject({snapshot:{drops:[]}});
    expect(s.viewer.score).toBe(0);expect(s.viewer.health).toBe(100);expect(s.room.getSnapshot(15336).drops).toEqual([]);
  });
});
