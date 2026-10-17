import { describe, expect, it } from 'vitest';
import { MatchRoom } from './match-room';
import { getLegacyMap, legacyGroundHeightAt, legacyRampHeightAt } from '../shared/legacyMaps';
import { raycastLegacyMap, hasLegacyLineOfSight } from '../shared/legacyCollision';
import type { ClientMessage, MessagePeer, PlayerSnapshot, ServerMessage, Vec3 } from '../shared/protocol';
class Peer implements MessagePeer { messages: ServerMessage[]=[]; send(message:ServerMessage){this.messages.push(message);} }
function connect(room:MatchRoom,name='Player'){const peer=new Peer(),result=room.join(peer,name,0);if(!result.ok)throw new Error(result.message);return {id:result.player.id,peer};}
function player(room:MatchRoom,id:string):PlayerSnapshot{return room.getSnapshot(0).players.find(p=>p.id===id)!;}
function transform(room:MatchRoom,id:string,position:Vec3,sequence=1,now=2000){const current=player(room,id);room.handleMessage(id,{type:'transform',sequence,clientTime:now,transform:{...current.transform,position}},now);}
function shoot(room:MatchRoom,attacker:string,target:string,time:number){const current=player(room,attacker);if(current.transform.weapon!=='rifle')room.handleMessage(attacker,{type:'transform',sequence:0,clientTime:time,transform:{...current.transform,weapon:'rifle'}},time);const a=player(room,attacker),b=player(room,target),origin={...a.transform.position,y:a.transform.position.y+1.55};const diff={x:b.transform.position.x-origin.x,y:b.transform.position.y+.98-origin.y,z:b.transform.position.z-origin.z};const length=Math.hypot(diff.x,diff.y,diff.z);const shotId='shot-'+time;room.handleMessage(attacker,{type:'shoot',shot:{shotId,weapon:'rifle',origin,direction:{x:diff.x/length,y:diff.y/length,z:diff.z/length}}},time);room.handleMessage(attacker,{type:'hit',hit:{shotId,targetId:target}},time+1);}

describe('legacy map multiplayer',()=>{
  for(const map of ['barrack','woodlands'] as const)for(const originalScene of [true,false])it(`retains source talk whitespace with bounded transport in ${map}, source=${originalScene}`,()=>{
    const room=new MatchRoom('spaces',{map,originalScene}),a=connect(room,'Alice'),b=connect(room,'Bob');
    for(const [i,text] of ['>> ','>> hello  ','>>hello'].entries()){
      room.handleMessage(a.id,{type:'chat',text},100+i,a.peer);
      expect(b.peer.messages.at(-1)).toMatchObject({type:'event',event:{type:'chat',data:{playerId:a.id,name:'Alice',text:originalScene?text:text.trim()}}});
    }
    room.handleMessage(a.id,{type:'chat',text:'   '},200,a.peer);expect(a.peer.messages.at(-1)).toMatchObject({type:'error',code:'invalid_chat'});
  });
  it('uses the explicit authored blockout fixtures for grounded transform mechanics',()=>{
    for(const map of ['barrack','woodlands'] as const){
      const room=new MatchRoom(map,{originalScene:false,map});const {id,peer}=connect(room);
      expect(room.getSnapshot().map).toBe(map);
      expect(peer.messages[0]).toMatchObject({type:'welcome',map});
      const initial=player(room,id).transform.position;
      expect(initial.y).toBeCloseTo(legacyGroundHeightAt(map,initial.x,initial.z));
      const x=initial.x+.5,z=initial.z+.4,y=legacyGroundHeightAt(map,x,z);
      transform(room,id,{x,y,z});expect(player(room,id).transform.position).toEqual({x,y,z});
      transform(room,id,{x,y:y+1,z},2);expect(player(room,id).transform.position).toEqual({x,y,z});
      transform(room,id,{x,y:y-1,z},3);expect(player(room,id).transform.position).toEqual({x,y,z});
    }
  });
  it('allows ramp ascent but rejects crossing a production wall',()=>{
    const ramp=getLegacyMap('barrack').ramps.find(r=>r.id==='west-rise')!;
    const start={x:ramp.x,z:21,y:legacyRampHeightAt(ramp,ramp.x,21)!};
    const room=new MatchRoom('ramps',{originalScene:false,spawnPoints:[start]});const {id}=connect(room);
    const next={x:ramp.x,z:19,y:legacyRampHeightAt(ramp,ramp.x,19)!};transform(room,id,next);expect(player(room,id).transform.position).toEqual(next);
    const wallRoom=new MatchRoom('wall',{originalScene:false,spawnPoints:[{x:-31.6,y:0,z:-10}]});const p=connect(wallRoom);transform(wallRoom,p.id,{x:-30.4,y:0,z:-10});expect(player(wallRoom,p.id).transform.position.x).toBe(-31.6);
  });
  it('rejects crossing through a filled ramp from either side, including clear endpoints',()=>{
    const room=new MatchRoom('ramp-sides',{originalScene:false,spawnPoints:[{x:-22,y:0,z:10}]});const {id}=connect(room);
    transform(room,id,{x:-20,y:0,z:10});expect(player(room,id).transform.position.x).toBe(-22);
    const corner=new MatchRoom('ramp-corner',{originalScene:false,spawnPoints:[{x:-22,y:0,z:20.5}]});const c=connect(corner);
    transform(corner,c.id,{x:-20,y:0,z:22.5});expect(player(corner,c.id).transform.position.x).toBe(-22);
    const bridge=new MatchRoom('bridge-under',{originalScene:false,spawnPoints:[{x:-1.5,y:0,z:-14}]});const p=connect(bridge);
    for(let i=1;i<=4;i++)transform(bridge,p.id,{x:-1.5,y:0,z:-14+i*2},i,2000+i*500);
    expect(player(bridge,p.id).transform.position.z).toBe(-6);
  });
  it('broadcasts sanitized sender identity and rejects long, control-character and rapid chat',()=>{
    const room=new MatchRoom('chat');const a=connect(room,'Alice'),b=connect(room,'Bob');
    room.handleMessage(a.id,{type:'chat',text:'  hello <b>Bob</b>  ',playerId:b.id,name:'Bob'} as ClientMessage,10,a.peer);
    expect(b.peer.messages.at(-1)).toMatchObject({type:'event',event:{type:'chat',data:{playerId:a.id,name:'Alice',text:'  hello <b>Bob</b>  '}}});
    for(const text of ['', 'x'.repeat(241), 'line\nnew'])room.handleMessage(a.id,{type:'chat',text},20);
    expect(a.peer.messages.filter(m=>m.type==='error'&&m.code==='invalid_chat')).toHaveLength(3);
    for(let i=0;i<4;i++)room.handleMessage(a.id,{type:'chat',text:'message'},100+i);
    expect(a.peer.messages.at(-1)).toMatchObject({type:'error',code:'chat_rate_limit'});
    room.handleMessage(a.id,{type:'chat',text:'after window'},5100);
    expect(b.peer.messages.at(-1)).toMatchObject({type:'event',event:{type:'chat',data:{text:'after window'}}});
    room.handleMessage(a.id,{type:'chat',text:'stale peer'},6000,b.peer);
    expect(b.peer.messages.at(-1)).toMatchObject({type:'event',event:{data:{text:'after window'}}});
  });
  it('collects map armor only in range, once, and respawns it after 18 seconds',()=>{
    const pickup=getLegacyMap('barrack').pickups.find(p=>p.type==='armor')!;const [x,,z]=pickup.position;
    const room=new MatchRoom('pickups',{originalScene:false,spawnPoints:[{x:x-2,y:0,z}]});const a=connect(room);
    room.handleMessage(a.id,{type:'collect',itemId:pickup.id},100);expect(player(room,a.id).armor).toBe(0);
    transform(room,a.id,{x,y:0,z});room.handleMessage(a.id,{type:'collect',itemId:pickup.id},2100);
    expect(player(room,a.id).armor).toBe(50);expect(room.getSnapshot().pickups?.find(p=>p.id===pickup.id)?.active).toBe(false);
    room.handleMessage(a.id,{type:'collect',itemId:pickup.id},2101);expect(player(room,a.id).armor).toBe(50);
    room.tick(20099);expect(room.getSnapshot().pickups?.find(p=>p.id===pickup.id)?.active).toBe(false);
    room.tick(20100);room.handleMessage(a.id,{type:'collect',itemId:pickup.id},20101);expect(player(room,a.id).armor).toBe(100);
  });
  it('applies collected armor to authoritative hitscan damage',()=>{
    const pickup=getLegacyMap('barrack').pickups.find(p=>p.type==='armor')!;const [x,,z]=pickup.position;
    const room=new MatchRoom('armor',{originalScene:false,spawnPoints:[{x,y:0,z},{x:x-10,y:0,z}]});const target=connect(room),attacker=connect(room);
    room.handleMessage(target.id,{type:'collect',itemId:pickup.id},100);
    shoot(room,attacker.id,target.id,2000);
    expect(player(room,target.id).health).toBeCloseTo(84.7);expect(player(room,target.id).armor).toBeCloseTo(31.3);
  });
  it('keeps full-health pickups available, caps healing, and grants ammunition once',()=>{
    const health=getLegacyMap('barrack').pickups.find(p=>p.type==='health')!;const [x,,z]=health.position;
    const room=new MatchRoom('healing',{originalScene:false,spawnPoints:[{x,y:0,z},{x:x+8,y:0,z}]});const target=connect(room),attacker=connect(room);
    room.handleMessage(target.id,{type:'collect',itemId:health.id},20);
    expect(room.getSnapshot().pickups?.find(p=>p.id===health.id)?.active).toBe(true);
    shoot(room,attacker.id,target.id,2000);expect(player(room,target.id).health).toBe(66);
    room.handleMessage(target.id,{type:'collect',itemId:health.id},2100);expect(player(room,target.id).health).toBe(100);
    const ammo=getLegacyMap('barrack').pickups.find(p=>p.type==='ammo')!;
    const ammoRoom=new MatchRoom('ammo',{originalScene:false,spawnPoints:[{x:ammo.position[0],y:0,z:ammo.position[2]}]});const a=connect(ammoRoom);
    for(const itemId of ['', 'x'.repeat(129), '__proto__'])ammoRoom.handleMessage(a.id,{type:'collect',itemId},100);
    ammoRoom.handleMessage(a.id,{type:'collect',itemId:ammo.id},200);
    const loadout=a.peer.messages.filter(m=>m.type==='loadout').at(-1);
    expect(loadout).toMatchObject({weapons:{rifle:{reserve:161},rpg:{reserve:13}}});
    ammoRoom.handleMessage(a.id,{type:'collect',itemId:ammo.id},201);
    expect(a.peer.messages.filter(m=>m.type==='loadout').at(-1)).toBe(loadout);
  });
  it('rejects vertical pickup reach and awards a contested pickup to one player only',()=>{
    const pickup=getLegacyMap('barrack').pickups.find(p=>p.type==='armor')!;const [x,,z]=pickup.position;
    const highRoom=new MatchRoom('high',{originalScene:false,spawnPoints:[{x,y:3,z}]});const high=connect(highRoom);
    highRoom.handleMessage(high.id,{type:'collect',itemId:pickup.id},100);expect(player(highRoom,high.id).armor).toBe(0);
    const room=new MatchRoom('race',{originalScene:false,spawnPoints:[{x,y:0,z}]});const a=connect(room),b=connect(room);
    room.handleMessage(a.id,{type:'collect',itemId:pickup.id},100);
    room.handleMessage(b.id,{type:'collect',itemId:pickup.id},100);
    expect([player(room,a.id).armor,player(room,b.id).armor]).toEqual([50,0]);
  });
  it('rejects collecting through solid cover even when horizontal and vertical range pass',()=>{
    const map=getLegacyMap('barrack'),pickup=map.pickups.find(p=>p.type==='armor')!;const [x,,z]=pickup.position;
    // Controlled occluder exercises the production collection/LOS pipeline.
    const collider={id:'test-pickup-cover',kind:'barrier' as const,min:[x-.65,0,z-1] as const,max:[x-.55,2,z+1] as const};
    map.colliders.push(collider);
    try {
      const room=new MatchRoom('covered',{originalScene:false,spawnPoints:[{x:x-1.2,y:0,z}]});const a=connect(room);
      room.handleMessage(a.id,{type:'collect',itemId:pickup.id},100);
      expect(player(room,a.id).armor).toBe(0);expect(room.getSnapshot().pickups?.find(p=>p.id===pickup.id)?.active).toBe(true);
    } finally { map.colliders.splice(map.colliders.indexOf(collider),1); }
  });
  it('preserves map, armor and chat limits on resume while rejecting old peers and foreign tokens',()=>{
    const pickup=getLegacyMap('woodlands').pickups.find(p=>p.type==='armor')!;const [x,,z]=pickup.position;
    const room=new MatchRoom('forest',{originalScene:false,map:'woodlands',spawnPoints:[{x,y:legacyGroundHeightAt('woodlands',x,z),z}]});const a=connect(room,'Original');
    room.handleMessage(a.id,{type:'collect',itemId:pickup.id},10);
    for(let i=0;i<4;i++)room.handleMessage(a.id,{type:'chat',text:'hello'},100+i);
    const welcome=a.peer.messages.find(m=>m.type==='welcome')!;if(welcome.type!=='welcome')throw new Error('missing welcome');
    room.suspend(a.id,200,a.peer);
    const foreign=new MatchRoom('barrack');expect(foreign.join(new Peer(),'Imposter',250,welcome.resumeToken)).toMatchObject({ok:false,code:'resume_expired'});
    const peer=new Peer();expect(room.join(peer,'Changed',300,welcome.resumeToken)).toMatchObject({ok:true,player:{id:a.id,name:'Original',armor:50}});
    expect(peer.messages[0]).toMatchObject({type:'welcome',map:'woodlands'});
    room.handleMessage(a.id,{type:'chat',text:'too fast'},310,peer);expect(peer.messages.at(-1)).toMatchObject({type:'error',code:'chat_rate_limit'});
    const count=peer.messages.length;room.handleMessage(a.id,{type:'chat',text:'old transport'},5200,a.peer);expect(peer.messages).toHaveLength(count);
  });
  it('sends completed reload state even when chat or a rejected collect finishes the reload',()=>{
    for(const message of [{type:'chat',text:'ready'},{type:'collect',itemId:'missing'}] as ClientMessage[]){
      const room=new MatchRoom('reload');const a=connect(room),position=player(room,a.id).transform.position;
      room.handleMessage(a.id,{type:'transform',sequence:0,clientTime:1000,transform:{...player(room,a.id).transform,weapon:'rifle'}},1000);
      room.handleMessage(a.id,{type:'shoot',shot:{shotId:'first',weapon:'rifle',origin:{...position,y:position.y+1.55},direction:{x:0,y:0,z:1}}},1200);
      room.handleMessage(a.id,{type:'reload',weapon:'rifle'},1300);
      room.handleMessage(a.id,message,3100);
      expect(a.peer.messages.filter(m=>m.type==='loadout').at(-1)).toMatchObject({reload:null,weapons:{rifle:{ammo:28,reserve:139}}});
    }
  });
  it('reproduces the Woodland AK 12/140 to 28/124 immediate refill with a timed lockout',()=>{
    const room=new MatchRoom('woodland-refill',{originalScene:false,map:'woodlands'}),a=connect(room);
    const position=player(room,a.id).transform.position;
    room.handleMessage(a.id,{type:'transform',sequence:0,clientTime:1000,transform:{...player(room,a.id).transform,weapon:'rifle'}},1000);
    let now=1000,shot=0;
    const fire=(count:number)=>{
      for(let i=0;i<count;i++){
        room.handleMessage(a.id,{type:'shoot',shot:{shotId:`refill-${++shot}`,weapon:'rifle',origin:{...position,y:position.y+1.55},direction:{x:0,y:0,z:1}}},now);
        now+=100;
      }
    };
    const loadout=()=>a.peer.messages.filter(m=>m.type==='loadout').at(-1);
    expect(loadout()).toMatchObject({weapons:{rifle:{ammo:28,reserve:140}}});
    expect(loadout()).toMatchObject({reload:null,weapons:{rifle:{ammo:28,reserve:140}}});
    fire(16);
    expect(loadout()).toMatchObject({weapons:{rifle:{ammo:12,reserve:140}}});
    room.handleMessage(a.id,{type:'reload',weapon:'rifle'},now);
    expect(loadout()).toMatchObject({weapons:{rifle:{ammo:28,reserve:124}},reload:{weapon:'rifle'}});
    const deadline=(loadout() as Extract<ServerMessage,{type:'loadout'}>).reload!.completesAt;
    room.tick(deadline-1);
    expect(loadout()).toMatchObject({weapons:{rifle:{ammo:28,reserve:124}},reload:{weapon:'rifle'}});
    room.tick(deadline);
    expect(loadout()).toMatchObject({reload:null,weapons:{rifle:{ammo:28,reserve:124}}});
    room.handleMessage(a.id,{type:'reload',weapon:'rifle'},now+1800);
    expect(a.peer.messages.filter(m=>m.type==='error').at(-1)).toMatchObject({type:'error',code:'magazine_full'});
    expect(loadout()).toMatchObject({reload:null,weapons:{rifle:{ammo:28,reserve:124}}});
  });
  it('uses the source Barrack refill while retaining the archived Winter copy refill',()=>{
    for(const options of [{map:'barrack' as const},{map:'woodlands' as const,collisionProfile:'winter' as const}]){
      const room=new MatchRoom('other-refill',options),a=connect(room),position=player(room,a.id).transform.position;
      room.handleMessage(a.id,{type:'transform',sequence:0,clientTime:1000,transform:{...player(room,a.id).transform,weapon:'rifle'}},1000);
      room.handleMessage(a.id,{type:'shoot',shot:{shotId:'first',weapon:'rifle',origin:{...position,y:position.y+1.55},direction:{x:0,y:0,z:1}}},1200);
      room.handleMessage(a.id,{type:'reload',weapon:'rifle'},1300);
      room.tick(3050);
      expect(a.peer.messages.filter(m=>m.type==='loadout').at(-1)).toMatchObject({reload:null,weapons:{rifle:options.collisionProfile==='winter'?{ammo:30,reserve:149}:{ammo:28,reserve:139}}});
    }
  });
  it('creates authoritative death drops, rejects remote collection, and grants once at the corpse',()=>{
    const room=new MatchRoom('drops',{originalScene:false,spawnPoints:[{x:-45,y:0,z:-35},{x:-45,y:0,z:-25}]});const a=connect(room),b=connect(room);
    shoot(room,a.id,b.id,2000);shoot(room,a.id,b.id,2200);shoot(room,a.id,b.id,2400);
    expect(player(room,b.id).alive).toBe(false);const drop=room.getSnapshot().drops![0];expect(drop.weapon).toBe('launcher');
    room.handleMessage(a.id,{type:'collect',itemId:drop.id},2450);expect(room.getSnapshot().drops).toHaveLength(1);
    for(let i=1;i<=5;i++)transform(room,a.id,{x:-45,y:0,z:-35+i*2},i,2500+i*200);
    room.handleMessage(a.id,{type:'collect',itemId:drop.id},3600);expect(room.getSnapshot().drops).toHaveLength(0);
    const loadout=a.peer.messages.filter(m=>m.type==='loadout').at(-1);expect(loadout).toMatchObject({type:'loadout',weapons:{launcher:{reserve:24},rifle:{reserve:140}}});
    room.handleMessage(a.id,{type:'collect',itemId:drop.id},3601);
    expect(a.peer.messages.filter(m=>m.type==='loadout').at(-1)).toBe(loadout);
  });
});

describe('legacy authoritative raycasts',()=>{
  it('hits the Woodlands heightfield instead of a global y=0 plane',()=>{
    const x=0,z=40,y=legacyGroundHeightAt('woodlands',x,z);
    const hit=raycastLegacyMap('woodlands',{x,y:y+10,z},{x:0,y:-1,z:0},20);
    expect(hit?.surface).toBe('ground');expect(hit?.point.y).toBeCloseTo(y,4);
  });
  it('intersects elevated bridges and permits rays leaving a rooftop surface',()=>{
    const ramp=getLegacyMap('barrack').ramps.find(r=>r.id==='roof-bridge')!;
    const hit=raycastLegacyMap('barrack',{x:ramp.x,y:10,z:ramp.z},{x:0,y:-1,z:0},20);
    expect(hit?.id).toBe(ramp.id);expect(hit?.point.y).toBeCloseTo(5.24);
    expect(raycastLegacyMap('barrack',{x:-19,y:5.24,z:-10},{x:0,y:1,z:0},2)).toBeNull();
  });
  it('rejects invalid sight lines and supports leaving a ramp without self-intersection',()=>{
    expect(hasLegacyLineOfSight('barrack',{x:NaN,y:0,z:0},{x:0,y:0,z:0})).toBe(false);
    expect(raycastLegacyMap('barrack',{x:-1.5,y:5.24,z:-10},{x:0,y:1,z:0},2)).toBeNull();
    expect(raycastLegacyMap('barrack',{x:0,y:1,z:40},{x:0,y:-1,z:0},2)?.distance).toBeCloseTo(1);
  });
  it('blocks hill-crossing lines of sight with no collider between endpoints',()=>{
    const left={x:0,y:legacyGroundHeightAt('woodlands',0,0)+.5,z:0};
    const right={x:50,y:legacyGroundHeightAt('woodlands',50,0)+.5,z:0};
    expect(hasLegacyLineOfSight('woodlands',left,right)).toBe(false);
  });
});
