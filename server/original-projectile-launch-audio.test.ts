import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import type {MessagePeer,ServerMessage,Vec3} from './protocol';

class Peer implements MessagePeer {
  messages:ServerMessage[]=[];
  send(message:ServerMessage):void {this.messages.push(message);}
}

function admittedLaunch(map:'barrack'|'woodlands'|'winter',weapon:'launcher'|'rpg') {
  const original=map!=='winter',eyeHeight=map!=='winter'?getOriginalMapRuntime(map).profile.eyeHeight:1.55;
  const room=new MatchRoom('launch-audio',{map:map==='winter'?'barrack':map,...(!original?{collisionProfile:'winter' as const}:{}),now:()=>1100,spawnPoints:[{x:0,y:100-eyeHeight,z:0}]}),peer=new Peer();
  const joined=room.join(peer,'SHOOTER',1100);if(!joined.ok)throw Error('Join failed');
  const review=room as any,actor=review.players.get(joined.player.id);
  // Trusted fixture placement and a ready source counter isolate accepted
  // admission. The supplied origin is deliberately distinct but within the
  // unchanged origin validation bound; no spawn/audio method is stubbed.
  actor.transform.position={x:0,y:100-eyeHeight,z:0};actor.transform.weapon=weapon;
  actor.reloadWeapon=null;
  if(map!=='winter'){
    actor.sourceCounter=new OriginalWeaponCounter(map,weapon);
    actor.sourceCounterReady=actor.sourceCounter.step(weapon);
    expect(actor.sourceCounterReady).toBe(true);
    actor.sourceCounterUpdatedAt=1100;actor.sourceCounterWeapon=weapon;
  }
  const eye:Vec3={x:0,y:100,z:0},claimedOrigin:Vec3={x:.5,y:100.25,z:.125};
  room.handleMessage(actor.id,{type:'shoot',shot:{shotId:'launch',weapon,origin:claimedOrigin,direction:{x:1,y:0,z:0},
    ...(original&&weapon==='rpg'?{sourceRotation:{x:0,y:0,z:-90}}:{})}},1100);
  const events=peer.messages.flatMap(message=>message.type==='event'&&message.event.type==='projectile_spawned'?[message.event]:[]);
  expect(events).toHaveLength(1);
  expect(peer.messages.filter(message=>message.type==='error')).toEqual([]);
  const event=events[0],active=review.projectiles.get(event.data.projectile.projectileId);
  expect(active).toBeDefined();expect(event.data.projectile.shotId).toBe('launch');
  return {room,review,actor,event,active,eye,claimedOrigin};
}

describe('accepted authority projectile launch audio origin',()=>{
  for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const){
    it(`${map} ${weapon} reports a detached authoritative eye before any rocket offset`,()=>{
      const s=admittedLaunch(map,weapon),sound=s.event.data.launchSoundPosition;
      expect(sound).toEqual(s.eye);expect(sound).not.toEqual(s.claimedOrigin);
      const expectedBody={...s.eye,x:weapon==='rpg'?50*ORIGINAL_MAP_SCALE:0};
      expect(s.event.data.projectile.position).toEqual(expectedBody);
      if(weapon==='rpg')expect(sound).not.toEqual(s.event.data.projectile.position);
      expect(sound).not.toBe(s.actor.transform.position);
      expect(sound).not.toBe(s.active.source.position);
      expect(sound).not.toBe(s.event.data.projectile.position);
      const retainedSound={...sound!},retainedBody={...s.event.data.projectile.position};
      // Mutate the trusted live body/eye after publication. This tests snapshot
      // detachment without asserting a native physics step or clock schedule.
      s.active.source.position.x+=7;s.active.source.position.y-=3;
      s.active.snapshot.position.x+=9;s.actor.transform.position.z+=11;
      s.claimedOrigin.x+=20;
      expect(s.event.data.launchSoundPosition).toEqual(retainedSound);
      expect(s.event.data.projectile.position).toEqual(retainedBody);
    });
  }

  it.each(['launcher','rpg'] as const)('Winter %s retains its existing event without the source audio field',weapon=>{
    const s=admittedLaunch('winter',weapon);
    expect(Object.prototype.hasOwnProperty.call(s.event.data,'launchSoundPosition')).toBe(false);
    expect(s.event.data.launchSoundPosition).toBeUndefined();
    expect(s.active.source).toBeUndefined();
  });
});
