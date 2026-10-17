import {describe,expect,it} from 'vitest';
import {MatchRoom} from './match-room';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {ORIGINAL_DROP_AMMO,originalDropPosition} from '../shared/originalPickupRules';
import type {MessagePeer,ServerMessage,PlayerTransform,WeaponId} from './protocol';
import type {WeaponDropSnapshot} from '../shared/protocol';

class Peer implements MessagePeer {
  messages:ServerMessage[]=[];
  send(message:ServerMessage){if(this.messages.length>=256)throw Error('Finite message ledger exceeded');this.messages.push(message);}
}
interface Actor {
  id:string;transform:PlayerTransform;alive:boolean;health:number;score:number;frags:number;deaths:number;
  reserve:Record<WeaponId,number>;sourceViewGeneration:number;sourceTimeoutDrops:Map<string,WeaponDropSnapshot>;
}
interface Dispatch {players:Map<string,Actor>;sendSourceViewMessage(actor:Actor,message:ServerMessage):void}
function setup(negotiated=true){
  let clock=0;
  const runtime=getOriginalMapRuntime('woodlands');
  const room=new MatchRoom('ordinary-death-locality',{map:'woodlands',spawnPoints:[runtime.spawnPoints[0]],now:()=>clock});
  const dispatch=room as unknown as Dispatch;
  const join=(name:string,view=negotiated)=>{
    const peer=new Peer(),result=room.join(peer,name,clock,undefined,view);
    if(!result.ok)throw Error(result.message);
    return {peer,actor:dispatch.players.get(result.player.id)!,sequence:0};
  };
  const victim=join('Victim',false);
  const select=(weapon:WeaponId)=>room.handleMessage(victim.actor.id,{type:'transform',sequence:victim.sequence++,clientTime:clock,transform:{...victim.actor.transform,weapon}},clock,victim.peer);
  select('rifle');expect(victim.actor.transform.weapon).toBe('rifle');
  const a=join('Cowardice');
  const whereA=a.peer.messages.find(m=>m.type==='snapshot');if(whereA?.type!=='snapshot')throw Error('Initial A snapshot missing');
  select('launcher');expect(victim.actor.transform.weapon).toBe('launcher');
  const b=join('ViewerB');
  const whereB=b.peer.messages.find(m=>m.type==='snapshot');if(whereB?.type!=='snapshot')throw Error('Initial B snapshot missing');
  const kill=()=>room.handleMessage(victim.actor.id,{type:'source_escape'},clock,victim.peer);
  const pending=(viewer:typeof a)=>viewer.peer.messages.flatMap(m=>(m.type==='snapshot'||m.type==='event')&&m.sourceViewTick!==undefined?[{tick:m.sourceViewTick,callbacks:0}]:[]);
  const acknowledge=(viewer:typeof a,callbacks:number,receipts=pending(viewer),now=callbacks?34:0)=>{
    clock=now;room.handleMessage(viewer.actor.id,{type:'transform',sequence:viewer.sequence++,clientTime:clock,
      transform:{...viewer.actor.transform},sourceRemoteView:{generation:viewer.actor.sourceViewGeneration,callbacks,receipts}},clock,viewer.peer);
  };
  const collect=(viewer:typeof a,id:string)=>room.handleMessage(viewer.actor.id,{type:'collect',itemId:id},clock,viewer.peer);
  const drops=(viewer:typeof a)=>[...viewer.actor.sourceTimeoutDrops.values()];
  const publish=(viewer:typeof a)=>dispatch.sendSourceViewMessage(viewer.actor,{type:'snapshot',snapshot:room.getSnapshot(clock)});
  return {room,runtime,dispatch,victim,a,b,whereA,whereB,join,kill,pending,acknowledge,collect,drops,publish};
}
const collected=(peer:Peer)=>peer.messages.filter(m=>m.type==='event'&&m.event.type==='collected');

describe('ordinary source death pickups belong to each informed viewer',()=>{
  it('uses each accepted last where weapon, creates independent pickups on the next callback and collects each once',()=>{
    const s=setup(),aReserve=s.a.actor.reserve.rifle,bReserve=s.b.actor.reserve.launcher;
    s.kill();expect(s.victim.actor).toMatchObject({alive:false,health:0,deaths:1});
    expect(s.a.actor).toMatchObject({score:30,frags:1});expect(s.b.actor.score).toBe(0);
    expect(s.room.getSnapshot().drops).toEqual([]);expect(s.drops(s.victim)).toEqual([]);
    s.acknowledge(s.a,0);s.acknowledge(s.b,0);expect(s.drops(s.a)).toEqual([]);expect(s.drops(s.b)).toEqual([]);
    s.acknowledge(s.a,1,[]);s.acknowledge(s.b,1,[]);
    const [da]=s.drops(s.a),[db]=s.drops(s.b);expect(da).toBeDefined();expect(db).toBeDefined();expect(da.id).not.toBe(db.id);
    for(const [drop,where,weapon] of [[da,s.whereA,'rifle'],[db,s.whereB,'launcher']] as const){
      const sent=where.snapshot.players.find(p=>p.id===s.victim.actor.id)!;
      expect(drop).toMatchObject({weapon,expiresAt:null,position:originalDropPosition({...sent.transform.position,y:sent.transform.position.y+s.runtime.profile.eyeHeight},s.runtime.scale)});
    }
    s.publish(s.a);s.publish(s.b);
    expect(s.a.peer.messages.at(-1)).toMatchObject({snapshot:{drops:[da]}});expect(s.b.peer.messages.at(-1)).toMatchObject({snapshot:{drops:[db]}});
    s.collect(s.b,da.id);s.collect(s.a,db.id);expect(s.drops(s.a)).toEqual([da]);expect(s.drops(s.b)).toEqual([db]);
    s.collect(s.a,da.id);s.collect(s.b,db.id);s.collect(s.a,da.id);s.collect(s.b,db.id);
    expect(s.a.actor.score).toBe(35);expect(s.b.actor.score).toBe(5);
    expect(s.a.actor.reserve.rifle).toBe(aReserve+ORIGINAL_DROP_AMMO.rifle);expect(s.b.actor.reserve.launcher).toBe(bReserve+ORIGINAL_DROP_AMMO.launcher);
    expect(collected(s.a.peer)).toHaveLength(1);expect(collected(s.b.peer)).toHaveLength(1);expect(collected(s.victim.peer)).toEqual([]);
    expect(s.room.getSnapshot().drops).toEqual([]);expect(s.drops(s.a)).toEqual([]);expect(s.drops(s.b)).toEqual([]);
    const late=s.join('Late');expect(s.drops(late)).toEqual([]);s.acknowledge(late,1,undefined,68);expect(s.drops(late)).toEqual([]);
  });

  it('retains a received death transition through a following omission before its first callback',()=>{
    const s=setup();s.kill();expect(s.room.leave(s.victim.actor.id,0,s.victim.peer)).toBe(true);s.publish(s.a);
    s.acknowledge(s.a,0);expect(s.drops(s.a)).toEqual([]);s.acknowledge(s.a,1,[]);expect(s.drops(s.a)).toHaveLength(1);
    s.acknowledge(s.a,2,[],68);expect(s.drops(s.a)).toHaveLength(1);
  });

  it('rejects an invalid later receipt without committing a prior death pickup',()=>{
    const s=setup();s.kill();const receipts=s.pending(s.a);expect(receipts.length).toBeGreaterThan(1);
    receipts[receipts.length-1]={...receipts.at(-1)!,tick:99999};s.acknowledge(s.a,1,receipts);
    expect(s.drops(s.a)).toEqual([]);expect(s.room.getSnapshot().drops).toEqual([]);
    expect(s.a.peer.messages).toContainEqual(expect.objectContaining({type:'error',code:'invalid_source_view'}));
  });

  it('does not produce another transition for repeated real Escape or a replayed death event',()=>{
    const s=setup();s.kill();s.kill();const killed=s.a.peer.messages.find(m=>m.type==='event'&&m.event.type==='killed');
    if(killed?.type!=='event')throw Error('Authenticated death event missing');
    s.dispatch.sendSourceViewMessage(s.a.actor,{type:'event',event:killed.event});s.acknowledge(s.a,0);s.acknowledge(s.a,1,[]);
    expect(s.drops(s.a)).toHaveLength(1);expect(s.victim.actor.deaths).toBe(1);
    expect(s.room.leave(s.victim.actor.id,34,s.victim.peer)).toBe(true);
    const late=s.join('UnknownToDead');s.dispatch.sendSourceViewMessage(late.actor,{type:'event',event:killed.event});s.acknowledge(late,1,undefined,68);expect(s.drops(late)).toEqual([]);
  });

  it('keeps the non-negotiated sent-metadata adapter private and does not grant historical drops to late entrants',()=>{
    const s=setup(false);s.kill();const [da]=s.drops(s.a),[db]=s.drops(s.b);
    expect(da).toMatchObject({weapon:'rifle',expiresAt:null});expect(db).toMatchObject({weapon:'launcher',expiresAt:null});
    expect(s.drops(s.victim)).toEqual([]);expect(s.room.getSnapshot().drops).toEqual([]);
    const late=s.join('LateDirect',false);expect(s.drops(late)).toEqual([]);
    const killed=s.a.peer.messages.find(m=>m.type==='event'&&m.event.type==='killed');if(killed?.type!=='event')throw Error('Death event missing');
    s.dispatch.sendSourceViewMessage(late.actor,{type:'event',event:killed.event});expect(s.drops(late)).toEqual([]);
  });
});
