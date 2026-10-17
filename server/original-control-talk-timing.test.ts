import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalWeaponCounter} from '../shared/originalWeaponCounter';
import type {LoadoutMessage,MessagePeer,ServerMessage} from './protocol';

class Peer implements MessagePeer {
  messages:ServerMessage[]=[];
  send(message:ServerMessage):void {this.messages.push(message);}
}

function setup(map:'barrack'|'woodlands') {
  let now=0,sequence=0,shot=0;
  const room=new MatchRoom('control-talk-phase',{map,now:()=>now,spawnPoints:[getOriginalMapRuntime(map).spawnPoints[0]]});
  const peer=new Peer(),joined=room.join(peer,'Control phase',now);
  if(!joined.ok)throw new Error('Join failed');
  const id=joined.player.id;
  const player=()=>room.getSnapshot(now).players.find(player=>player.id===id)!;
  const transform=(typing:boolean,time:number)=>{
    now=time;
    room.handleMessage(id,{type:'transform',sequence:++sequence,clientTime:now,transform:{
      ...player().transform,weapon:'pistol',typing,
      sourceInput:{forward:false,backward:false,left:false,right:false,jump:false},movementMode:'source',
    }},now);
  };
  const fire=(time:number)=>{
    now=time;const current=player();
    room.handleMessage(id,{type:'shoot',shot:{shotId:`control-phase-${++shot}`,weapon:'pistol',
      origin:{...current.transform.position,y:current.transform.position.y+1.55},direction:{x:0,y:0,z:1},
    }},now);
  };
  const tick=(time:number)=>{now=time;room.tick(now);};
  const loadout=()=>peer.messages.filter((message):message is LoadoutMessage=>message.type==='loadout').at(-1)!;
  const errors=()=>peer.messages.filter(message=>message.type==='error');
  transform(false,1000);transform(true,1100);tick(2000);
  return {room,peer,transform,fire,tick,loadout,errors};
}

describe('actual authority gun callback phase after ending source talk',()=>{
  it.each(['barrack','woodlands'] as const)('%s rejects a same-phase shot then admits the first post-talk gun callback',map=>{
    const s=setup(map);s.transform(false,2007);
    const ended=s.loadout();
    expect(ended.sourceTransformSequence).toBe(3);expect(ended.sourceTyping).toBe(false);
    expect(ended.sourceCounterTime).toBeCloseTo(2000);
    expect(ended.sourceCounter!.ready).toBe(false);
    expect(ended.sourceCounter).toEqual({waitgun:map==='woodlands'?-60:11,poldwaitgun:0,ready:false});
    const counter=new OriginalWeaponCounter(map);counter.restore(ended.sourceCounter!);
    // Actor state can be numerically ready while its last callback was typing.
    expect(counter.framesUntilReady('pistol')).toBe(1);
    if(map==='woodlands')expect(ended.sourceCounter!.waitgun).toBeLessThan(0);
    s.fire(2010);
    expect(s.errors()).toEqual([{type:'error',code:'fire_rate',message:'Weapon fired faster than its server rate limit.'}]);
    expect(s.loadout().sourceCounterTime).toBeCloseTo(2000);
    expect(s.loadout().sourceCounter).toEqual(ended.sourceCounter);
    expect(s.loadout().weapons.pistol.ammo).toBe(ended.weapons.pistol.ammo);
    s.fire(2000+1000/30);
    expect(s.errors()).toHaveLength(1);
    expect(s.loadout().sourceCounterTime).toBeCloseTo(2000+1000/30);
    expect(s.loadout().weapons.pistol.ammo).toBe(ended.weapons.pistol.ammo-1);
    expect(s.loadout().sourceCounter!.ready).toBe(false);
    expect(s.peer.messages.filter(message=>message.type==='event'&&message.event.type==='shot')).toHaveLength(1);
  });

  it.each(['barrack','woodlands'] as const)('%s a callback completed before the talk-ending transform remains input-disabled',map=>{
    const s=setup(map),first=2000+1000/30;
    // handleMessage advances gun callbacks before applying transform.typing.
    s.transform(false,first);
    expect(s.loadout().sourceCounterTime).toBeCloseTo(first);
    expect(s.loadout().sourceCounter!.ready).toBe(false);
    s.fire(first+.001);
    expect(s.errors()).toMatchObject([{type:'error',code:'fire_rate'}]);
    s.fire(first+1000/30);
    expect(s.errors()).toHaveLength(1);
    expect(s.peer.messages.filter(message=>message.type==='event'&&message.event.type==='shot')).toHaveLength(1);
  });
});
