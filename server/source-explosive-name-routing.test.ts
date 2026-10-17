import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {OriginalRemoteView} from '../shared/originalRemoteView';
import type {MessagePeer,ServerMessage,MatchEvent,PlayerTransform,ProjectileSnapshot,Vec3} from './protocol';

class Peer implements MessagePeer {
  messages:ServerMessage[]=[];
  fail=false;
  failType?:ServerMessage['type'];
  failEvent?:MatchEvent['type'];
  send(message:ServerMessage){
    if(this.fail||message.type===this.failType||(message.type==='event'&&message.event.type===this.failEvent))throw Error('test transport failure');
    this.messages.push(message);
  }
}
interface Actor {
  id:string;name:string;peer:MessagePeer|null;resumeToken:string;alive:boolean;health:number;
  transform:PlayerTransform;sourceRemoteView:OriginalRemoteView|null;sourceViewGeneration:number;
  resumeExpiresAt:number|null;
  sourceWorld:{projectiles:Map<string,Active>;blasts:Map<string,unknown>}|null;
}
interface Active {snapshot:ProjectileSnapshot;sourceReceivers?:Set<Actor>}
interface Review {
  players:Map<string,Actor>;projectiles:Map<string,Active>;
  sourceBlasts:Map<string,{sourceReceivers?:Set<Actor>}>;
  detonate(projectile:Active,time:number):void;updateSourceBlasts(time:number):void;
  detonateSourceFor(actor:Actor,projectile:Active,time:number):void;stepSourceObserverBlasts(actor:Actor,time:number):void;
  sendSourceViewMessage(player:Actor,message:ServerMessage):void;
  expireSuspendedPlayers(time:number):void;respawn(player:Actor,time:number):void;
}
type MapName='barrack'|'woodlands';
type Weapon='launcher'|'rpg';
const cases=(['barrack','woodlands'] as const).flatMap(map=>(['launcher','rpg'] as const).map(weapon=>({map,weapon})));

/** This isolates actor routing, not a native projectile trajectory: normal joins
 * and admitted shots use the recovered map profile, while private detonate puts
 * the accepted actor at the shared spawn eye. No collision/visibility theorem is
 * inferred from the deliberately coincident living players or callback helper. */
function setup(map:MapName,weapon:Weapon,negotiated=false,winter=false,round=false){
  let id=0;
  const runtime=getOriginalMapRuntime(map);
  const room=new MatchRoom('name-routing',{map,now:()=>0,idFactory:()=>`viewer-${++id}`,
    spawnPoints:[winter?{x:40,y:0,z:30}:runtime.spawnPoints[0]],
    ...(winter?{collisionProfile:'winter' as const}:{}),...(round?{sessionMode:'round' as const}:{})});
  const review=room as unknown as Review;
  const join=(name:string,time=0,remoteView=false)=>{
    const peer=new Peer(),result=room.join(peer,name,time,undefined,remoteView);
    if(!result.ok)throw Error(result.message);
    return {peer,actor:review.players.get(result.player.id)!};
  };
  const owner=join('Launcher'),duplicate=join('lAuNcHeR',0,negotiated),observer=join('Observer',0,negotiated);
  const eye=(actor:Actor):Vec3=>({...actor.transform.position,y:actor.transform.position.y+(winter?1.55:runtime.profile.eyeHeight)});
  const launch=()=>{
    room.handleMessage(owner.actor.id,{type:'transform',sequence:1,clientTime:1000,transform:{...owner.actor.transform,weapon}},1000,owner.peer);
    room.handleMessage(owner.actor.id,{type:'shoot',shot:{shotId:'launch',weapon,origin:eye(owner.actor),direction:{x:0,y:1,z:0}}},1100,owner.peer);
    const active=[...review.projectiles.values()][0];
    if(!active)throw Error('Accepted source projectile missing: '+JSON.stringify(owner.peer.messages.filter(m=>m.type==='error')));
    return active;
  };
  const snapshot=(viewer:{actor:Actor;peer:Peer},time=1100)=>{
    review.sendSourceViewMessage(viewer.actor,{type:'snapshot',snapshot:room.getSnapshot(time)});
    const message=viewer.peer.messages.at(-1);
    if(message?.type!=='snapshot')throw Error('Snapshot delivery missing');
    return message.snapshot;
  };
  const events=(peer:Peer,type:MatchEvent['type'])=>peer.messages.flatMap(m=>m.type==='event'&&m.event.type===type?[m.event]:[]);
  const detonate=(active:Active)=>{
    active.snapshot.position=eye(winter?duplicate.actor:owner.actor);
    // All three living eyes must be strictly inside the source 250-unit blast.
    if(!winter)for(const viewer of [owner,duplicate,observer]){
      const p=eye(viewer.actor),center=active.snapshot.position;
      expect(Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z)).toBeLessThan(250*runtime.scale);
    }
    if(winter)review.detonate(active,1100);
    else for(const actor of review.players.values()){
      const copy=actor.sourceWorld?.projectiles.get(active.snapshot.projectileId);
      if(copy){copy.snapshot.position={...active.snapshot.position};review.detonateSourceFor(actor,copy,1100);}
    }
  };
  // Isolate blast callbacks from trajectory/support physics; each received
  // world advances its own actor and damages only its own goody.
  const callbacks=(count=1)=>{for(let n=1;n<=count;n++)for(const actor of review.players.values())if(actor.alive&&actor.peer)review.stepSourceObserverBlasts(actor,1100+n*1000/30);};
  return {room,review,owner,duplicate,observer,join,eye,launch,snapshot,events,detonate,callbacks};
}

describe('source explosive constructor eligibility follows immutable actor receipts',()=>{
  it.each(cases)('$map $weapon denies equivalent-name remote birth but preserves local owner and ordinary remote actor',({map,weapon})=>{
    const s=setup(map,weapon),active=s.launch();
    expect(s.owner.actor.id).not.toBe(s.duplicate.actor.id);
    expect(s.events(s.owner.peer,'projectile_spawned')).toHaveLength(1);
    expect(s.events(s.observer.peer,'projectile_spawned')).toHaveLength(1);
    expect(s.events(s.duplicate.peer,'projectile_spawned')).toEqual([]);
    for(const viewer of [s.owner,s.observer])expect(s.snapshot(viewer).projectiles).toMatchObject([{projectileId:active.snapshot.projectileId}]);
    expect(s.snapshot(s.duplicate).projectiles).toEqual([]);
    s.detonate(active);
    for(const viewer of [s.owner,s.observer]){
      expect(s.events(viewer.peer,'explosion')).toHaveLength(1);
      expect(s.snapshot(viewer).blasts).toMatchObject([{projectileId:active.snapshot.projectileId}]);
    }
    expect(s.events(s.duplicate.peer,'explosion')).toEqual([]);
    expect(s.snapshot(s.duplicate).blasts).toEqual([]);
    s.callbacks(16);
    expect(s.owner.actor.health).toBe(20);expect(s.observer.actor.health).toBe(20);
    expect(s.duplicate.actor.health).toBe(100);
    const damages=s.events(s.owner.peer,'damaged');
    expect(damages.filter(e=>e.type==='damaged'&&e.data.targetId===s.owner.actor.id)).toHaveLength(16);
    expect(damages.filter(e=>e.type==='damaged'&&e.data.targetId===s.observer.actor.id)).toHaveLength(16);
    expect(damages.some(e=>e.type==='damaged'&&e.data.targetId===s.duplicate.actor.id)).toBe(false);
    for(const actor of s.review.players.values())expect(actor.sourceWorld?.blasts.size??0).toBe(0);
  });

  it.each(cases)('$map $weapon retains received actors after owner leave without transferring birth to a fresh same-name life',({map,weapon})=>{
    const s=setup(map,weapon),active=s.launch();
    expect(s.events(s.observer.peer,'projectile_spawned')).toHaveLength(1);
    expect(s.room.leave(s.owner.actor.id,1100,s.owner.peer)).toBe(true);
    const fresh=s.join('LAUNCHER',1100);
    expect(fresh.actor.id).not.toBe(s.owner.actor.id);
    expect(s.snapshot(fresh).projectiles).toEqual([]);
    expect(s.snapshot(s.observer).projectiles).toHaveLength(1);
    s.detonate(active);s.callbacks();
    expect(s.events(s.observer.peer,'explosion')).toHaveLength(1);
    expect(s.observer.actor.health).toBe(95);
    expect(fresh.actor.health).toBe(100);
    expect(s.events(fresh.peer,'explosion')).toEqual([]);
    expect(s.snapshot(fresh).blasts).toEqual([]);
  });

  it.each(cases)('$map $weapon preserves a living resumed viewer receipt even if its retained name changes after birth',({map,weapon})=>{
    const s=setup(map,weapon),active=s.launch(),token=s.observer.actor.resumeToken;
    // Existing compatibility fixture: name is mutable after actor receipt.
    // Birth is not denied retroactively by a repeated current-name test.
    s.observer.actor.name='LAUNCHER';
    expect(s.room.suspend(s.observer.actor.id,1100,s.observer.peer)).toBe(true);
    const resumed=new Peer();
    expect(s.room.join(resumed,'Ignored on resume',1100,token)).toMatchObject({ok:true,player:{id:s.observer.actor.id,alive:true}});
    const restored=resumed.messages.find(m=>m.type==='snapshot');
    expect(restored?.type==='snapshot'?restored.snapshot.projectiles:undefined).toHaveLength(1);
    s.detonate(active);s.callbacks();
    expect(s.events(resumed,'explosion')).toHaveLength(1);expect(s.observer.actor.health).toBe(95);
  });

  it.each(cases)('$map $weapon clears a dead viewer local actor world and does not restore it on dead resume',({map,weapon})=>{
    const s=setup(map,weapon),active=s.launch();
    expect(active.sourceReceivers?.has(s.observer.actor)).toBe(true);
    s.room.handleMessage(s.observer.actor.id,{type:'source_escape'},1100,s.observer.peer);
    expect(s.observer.actor.alive).toBe(false);
    expect(active.sourceReceivers?.has(s.observer.actor)).toBe(false);
    expect(s.snapshot(s.observer).projectiles).toEqual([]);
    const token=s.observer.actor.resumeToken;
    s.room.suspend(s.observer.actor.id,1100,s.observer.peer);
    const resumed=new Peer();
    expect(s.room.join(resumed,'Observer',1100,token)).toMatchObject({ok:true,player:{alive:false}});
    const restored=resumed.messages.find(m=>m.type==='snapshot');
    expect(restored?.type==='snapshot'?restored.snapshot.projectiles:undefined).toEqual([]);
    s.detonate(active);
    expect(s.events(resumed,'explosion')).toEqual([]);
    expect(s.snapshot({actor:s.observer.actor,peer:resumed}).blasts).toEqual([]);
  });

  it.each(cases.flatMap(c=>[false,true].map(negotiated=>({...c,negotiated}))))('$map $weapon negotiated=$negotiated does not grant a remote actor receipt when launch delivery throws',({map,weapon,negotiated})=>{
    const s=setup(map,weapon,negotiated);
    const mirror=s.observer.actor.sourceRemoteView,pendingBefore=mirror?.debugState().pendingTicks;
    s.observer.peer.fail=true;
    const active=s.launch();
    expect(s.events(s.observer.peer,'projectile_spawned')).toEqual([]);
    expect(active.sourceReceivers?.has(s.observer.actor)).toBe(false);
    if(mirror)expect(mirror.debugState().pendingTicks).toEqual(pendingBefore);
    expect(s.observer.actor.peer).toBeNull();
    expect(active.sourceReceivers?.has(s.owner.actor)).toBe(true);
    expect(s.events(s.owner.peer,'projectile_spawned')).toHaveLength(1);
  });

  it.each(cases)('$map $weapon filters a denied launch before assigning negotiated receipt ticks',({map,weapon})=>{
    const s=setup(map,weapon,true);
    // Acknowledge the welcome immediately. Keeping its pending tick until
    // 1100ms would test the separate one-second receipt-age guard instead.
    for(const viewer of [s.duplicate,s.observer])expect(viewer.actor.sourceRemoteView!.accept({
      callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toMatchObject({ok:true});
    s.launch();s.snapshot(s.duplicate);s.snapshot(s.observer);
    const ticks=(peer:Peer)=>peer.messages.flatMap(m=>('sourceViewTick' in m&&typeof m.sourceViewTick==='number')?[m.sourceViewTick]:[]);
    expect(ticks(s.duplicate.peer)).toEqual([0,1]);
    expect(ticks(s.observer.peer)).toEqual([0,1,2]);
    expect(s.duplicate.actor.sourceRemoteView!.debugState().pendingTicks).toEqual([1]);
    expect(s.observer.actor.sourceRemoteView!.debugState().pendingTicks).toEqual([1,2]);
    expect(s.duplicate.actor.sourceRemoteView!.accept({callbacks:33,
      receipts:[{tick:1,callbacks:33}]},1100)).toMatchObject({ok:true});
    expect(s.observer.actor.sourceRemoteView!.accept({callbacks:33,
      receipts:[{tick:1,callbacks:33},{tick:2,callbacks:33}]},1100)).toMatchObject({ok:true});
  });

  it('late snapshot restoration commits adapted projectile and blast birth only after successful delivery',()=>{
    const s=setup('woodlands','rpg'),active=s.launch(),failedPeer=new Peer();
    failedPeer.failType='snapshot';
    const result=s.room.join(failedPeer,'Late failed',1100);
    if(!result.ok)throw Error(result.message);
    const failed=s.review.players.get(result.player.id)!;
    expect(failedPeer.messages.some(m=>m.type==='welcome')).toBe(true);
    expect(failedPeer.messages.some(m=>m.type==='snapshot')).toBe(false);
    expect(active.sourceReceivers?.has(failed)).toBe(false);
    expect(failed.peer).toBeNull();
    const late=s.join('Late projectile',1100);
    expect(active.sourceReceivers?.has(late.actor)).toBe(true);
    expect(s.snapshot(late).projectiles).toHaveLength(1);
    s.detonate(active);
    const blast=s.owner.actor.sourceWorld!.blasts.get(active.snapshot.projectileId)!;
    expect(failed.sourceWorld?.blasts.has(active.snapshot.projectileId)).toBe(false);
    const later=s.join('Late blast',1100);
    expect(s.events(later.peer,'explosion')).toEqual([]);
    expect(s.snapshot(later).blasts).toHaveLength(1);
    expect(later.actor.sourceWorld!.blasts.has(active.snapshot.projectileId)).toBe(true);
    expect(later.actor.sourceWorld!.blasts.get(active.snapshot.projectileId)).not.toBe(blast);
    s.callbacks();expect(late.actor.health).toBe(95);expect(later.actor.health).toBe(95);
  });

  it('a failed owner launch packet preserves its direct local birth and self-blast eligibility',()=>{
    const s=setup('barrack','launcher');s.owner.peer.failEvent='projectile_spawned';
    const active=s.launch();
    expect(s.owner.actor.peer).toBeNull();
    expect(active.sourceReceivers?.has(s.owner.actor)).toBe(true);
    expect(s.events(s.owner.peer,'projectile_spawned')).toEqual([]);
    const resumed=new Peer();
    expect(s.room.join(resumed,'Launcher',1100,s.owner.actor.resumeToken)).toMatchObject({ok:true,player:{alive:true}});
    expect(resumed.messages.find(m=>m.type==='snapshot')).toMatchObject({snapshot:{projectiles:[{projectileId:active.snapshot.projectileId}]}});
    s.detonate(active);s.callbacks();expect(s.owner.actor.health).toBe(95);
  });

  it('terminal leave and suspended-session expiry prune retained viewer objects from live actor sets',()=>{
    const s=setup('woodlands','launcher'),active=s.launch();
    expect(active.sourceReceivers?.has(s.observer.actor)).toBe(true);
    s.room.leave(s.observer.actor.id,1100,s.observer.peer);
    expect(active.sourceReceivers?.has(s.observer.actor)).toBe(false);
    s.detonate(active);
    const world=s.owner.actor.sourceWorld!;
    expect(world.blasts.has(active.snapshot.projectileId)).toBe(true);
    s.room.suspend(s.owner.actor.id,1100,s.owner.peer);
    expect(s.owner.actor.sourceWorld).toBe(world);
    expect(world.blasts.has(active.snapshot.projectileId)).toBe(true);
    // Force the session deadline only; do not advance projectile physics.
    s.owner.actor.resumeExpiresAt=1101;s.review.expireSuspendedPlayers(1101);
    expect(s.review.players.has(s.owner.actor.id)).toBe(false);
    expect(world.blasts.size).toBe(0);
  });

  it('round respawn cannot restore an explosive from the preceding dead local world',()=>{
    const s=setup('barrack','rpg',false,false,true),active=s.launch();
    s.room.handleMessage(s.observer.actor.id,{type:'source_escape'},1100,s.observer.peer);
    expect(s.observer.actor.alive).toBe(false);
    // Invoke the production round reset directly while the old actor remains.
    // This isolates life cleanup, not respawn delay or projectile longevity.
    s.review.respawn(s.observer.actor,1101);
    expect(s.observer.actor.alive).toBe(true);
    expect(s.snapshot(s.observer,1101).projectiles).toEqual([]);
    expect(active.sourceReceivers?.has(s.observer.actor)).toBe(false);
    s.detonate(active);s.callbacks();
    expect(s.snapshot(s.observer).blasts).toEqual([]);
    expect(s.observer.actor.health).toBe(100);
  });

  it('archived Winter keeps equivalent-name projectile broadcast and immediate blast damage',()=>{
    const s=setup('barrack','launcher',false,true);
    // Generic Winter launches perform an immediate collision query. Separate
    // the receivers before admission, then detonate at the duplicate's eye.
    s.duplicate.actor.transform.position.x-=10;
    s.observer.actor.transform.position.x+=10;
    const active=s.launch();
    expect(s.events(s.duplicate.peer,'projectile_spawned')).toHaveLength(1);
    // Winter uses its authored falloff and immediate explosion, not source
    // callback damage. The duplicate eye is deliberately at the blast center;
    // Detonation at 1100ms is after the 1000ms Winter protection window.
    s.detonate(active);
    expect(s.events(s.duplicate.peer,'explosion')).toHaveLength(1);
    expect(s.duplicate.actor.health).toBeLessThan(100);
  });
});
