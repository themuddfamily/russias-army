import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {MatchRoom} from './match-room';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalPlayerBody,originalPlayerEye,ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_DERIVATIVE_FACTOR,type OriginalPlayerBody} from '../shared/originalPlayerPhysics';
import type {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import type {MessagePeer,ServerMessage,PlayerTransform} from './protocol';

class Peer implements MessagePeer {
 messages:ServerMessage[]=[];
 send(message:ServerMessage){this.messages.push(message);}
}
interface Actor {sourceBody:OriginalPlayerBody|null;transform:PlayerTransform;sourceWorld:{body:OriginalPlayerBody;barrels:OriginalBarrelWorld;doors?:unknown}}
interface Inspect {
 players:Map<string,Actor>;
 barrelWorld:OriginalBarrelWorld;
 updateSourceWorldImpl(time:number):void;
}
const held={forward:false,backward:false,left:false,right:false,jump:false};
const motion=(body:OriginalPlayerBody)=>({position:{...body.position},velocity:{...body.velocity},supported:body.supported});

function setup(map:'barrack'|'woodlands',paired:boolean,authority:boolean,remoteAuthority=false){
 const runtime=registerOriginalMapRuntime(map,JSON.parse(readFileSync(`public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,'utf8')));
 const room=new MatchRoom('source-player-population',{map,spawnPoints:[runtime.spawnPoints[0]],now:()=>0});
 const inspect=room as unknown as Inspect,peers:Peer[]=[],ids:string[]=[];
 for(let index=0;index<(paired?2:1);index++){
  const peer=new Peer(),joined=room.join(peer,index?'REMOTE':'LOCAL',0);
  if(!joined.ok)throw Error(joined.message);
  peers.push(peer);ids.push(joined.player.id);
  const actor=inspect.players.get(joined.player.id)!;
  if(authority&&(index===0||remoteAuthority))room.handleMessage(joined.player.id,{type:'transform',sequence:1,clientTime:0,transform:{...actor.transform,sourceInput:held,typing:true}},0);
  // Deliberately overlapping, approaching spheres make unwanted pair contacts
  // observable immediately. Empty geometry isolates population from unproved
  // native terrain manifolds; recovered radius and physics clocks stay real.
  const body=createOriginalPlayerBody(joined.player.id,{x:index*1.5*ORIGINAL_PLAYER_RADIUS,y:20,z:0},{x:index?-8:8,y:0,z:0});
  const eye=originalPlayerEye(body);
  actor.transform.position={...eye,y:eye.y-runtime.profile.eyeHeight};
  actor.transform.velocity={x:body.velocity.x*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:0,z:0};
  actor.transform.grounded=false;
  if(actor.sourceBody!==null)actor.sourceBody=body;
  actor.sourceWorld.body=body;actor.sourceWorld.doors=undefined;actor.sourceWorld.barrels.applySnapshots([]);
 }
 inspect.barrelWorld.applySnapshots([]);
 Object.defineProperty(room,'originalGeometry',{value:{
  ...runtime.geometry,
  sweepSphere:()=>null,sweepConvex:()=>null,
  contactsSphere:()=>[],contactsConvex:()=>[],
 }});
 return {room,inspect,peers,ids};
}

describe('source room excludes remote GI spheres from direct player pair contacts',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it.each([false,true])(`${map}: nearby %s held-input remote player leaves local authoritative motion unchanged`,remoteAuthority=>{
   const single=setup(map,false,true),pair=setup(map,true,true,remoteAuthority);
   const initialX=pair.inspect.players.get(pair.ids[0])!.sourceBody!.position.x;
   for(let callback=1;callback<=4;callback++){
    single.room.tick(callback*1000/30);pair.room.tick(callback*1000/30);
    const own=pair.inspect.players.get(pair.ids[0])!,expected=single.inspect.players.get(single.ids[0])!;
    expect(motion(own.sourceBody!)).toEqual(motion(expected.sourceBody!));
    expect(own.transform).toEqual(expected.transform);
   }
   expect(pair.inspect.players.get(pair.ids[0])!.sourceBody!.position.x).toBeGreaterThan(initialX);
   expect(pair.inspect.players.get(pair.ids[1])!.sourceBody===null).toBe(!remoteAuthority);
   for(const peer of [...single.peers,...pair.peers])expect(peer.messages.filter(message=>message.type==='error'||message.type==='event'&&message.event.type==='projectile_contact')).toEqual([]);
  });
  it(`${map}: nearby legacy proxy leaves retained local physics motion unchanged`,()=>{
   const single=setup(map,false,false),pair=setup(map,true,false);
   const reported={...pair.inspect.players.get(pair.ids[0])!.transform.position};
   // Drive the actual private-world callback for both maps.
   for(let callback=1;callback<=4;callback++){
    single.inspect.updateSourceWorldImpl(callback*1000/30);
    pair.inspect.updateSourceWorldImpl(callback*1000/30);
    const own=pair.inspect.players.get(pair.ids[0])!.sourceWorld.body;
    const expected=single.inspect.players.get(single.ids[0])!.sourceWorld.body;
    expect(motion(own)).toEqual(motion(expected));
   }
   expect(pair.inspect.players.get(pair.ids[0])!.sourceWorld.body).not.toBe(pair.inspect.players.get(pair.ids[1])!.sourceWorld.body);
   expect(pair.inspect.players.get(pair.ids[0])!.sourceWorld.body.position.x).toBeGreaterThan(reported.x);
   // Reported feet remain client-owned; comparing these alone would miss proxy
   // separation or pair impulses inside the shared physical world.
   expect(pair.inspect.players.get(pair.ids[0])!.transform.position).toEqual(reported);
   expect(pair.inspect.players.get(pair.ids[0])!.sourceBody).toBeNull();
   expect(pair.inspect.players.get(pair.ids[1])!.sourceBody).toBeNull();
  });
 }
});
