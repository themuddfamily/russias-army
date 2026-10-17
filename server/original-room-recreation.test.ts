import {describe,expect,it} from 'vitest';
import WebSocket from 'ws';
import {startMatchServer,type RunningMatchServer} from './index';
import {PROTOCOL_VERSION,type ServerMessage} from './protocol';

type Predicate=(message:ServerMessage)=>boolean;
class Peer {
 readonly messages:ServerMessage[]=[];
 private waiters=new Set<{predicate:Predicate;resolve:(message:ServerMessage)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private failure:Error|undefined;
 private pingSequence=0;
 constructor(readonly socket:WebSocket){
  socket.on('message',raw=>{
   try{
    if(this.messages.length>=4096)throw Error('Room recreation message cap exceeded');
    const message=JSON.parse(raw.toString()) as ServerMessage;this.messages.push(message);
    for(const waiter of [...this.waiters])if(waiter.predicate(message)){clearTimeout(waiter.timer);this.waiters.delete(waiter);waiter.resolve(message);}
   }catch(error){this.fail(error instanceof Error?error:Error(String(error)));}
  });
  socket.on('error',error=>this.fail(error));
  socket.on('close',()=>this.fail(Error('Room recreation socket closed')));
 }
 private fail(error:Error){
  this.failure=error;
  for(const waiter of this.waiters){clearTimeout(waiter.timer);waiter.reject(error);}this.waiters.clear();
 }
 wait(predicate:Predicate):Promise<ServerMessage>{
  const prior=this.messages.find(predicate);if(prior)return Promise.resolve(prior);
  if(this.failure)return Promise.reject(this.failure);
  return new Promise((resolve,reject)=>{
   const waiter={predicate,resolve,reject,timer:setTimeout(()=>{this.waiters.delete(waiter);reject(Error('Room recreation message deadline exceeded'));},2000)};
   this.waiters.add(waiter);
  });
 }
 send(message:unknown){this.socket.send(JSON.stringify(message));}
 async barrier(){
  const clientTime=++this.pingSequence,pong=this.wait(message=>message.type==='pong'&&message.clientTime===clientTime);
  this.send({type:'ping',clientTime});await pong;
 }
 async close(){
  if(this.socket.readyState===WebSocket.CLOSED)return;
  await new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>{this.socket.terminate();reject(Error('Room recreation close deadline exceeded'));},2000);
   this.socket.once('close',()=>{clearTimeout(timeout);resolve();});this.socket.close();
  });
 }
}
async function connect(server:RunningMatchServer,peers:Peer[]){
 await expect.poll(()=>server.port,{timeout:2000,interval:5}).not.toBe(0);
 const socket=new WebSocket(`ws://127.0.0.1:${server.port}/`),peer=new Peer(socket);peers.push(peer);
 await new Promise<void>((resolve,reject)=>{
  const timeout=setTimeout(()=>{socket.terminate();reject(Error('Room recreation open deadline exceeded'));},2000);
  socket.once('open',()=>{clearTimeout(timeout);resolve();});socket.once('error',error=>{clearTimeout(timeout);reject(error);});
 });
 return peer;
}
async function join(peer:Peer,room:string,map:'barrack'|'woodlands',name:string){
 const result=peer.wait(message=>message.type==='welcome');peer.send({type:'join',protocol:PROTOCOL_VERSION,room,map,name});
 const welcome=await result;if(welcome.type!=='welcome')throw Error('Missing room recreation welcome');return welcome;
}
async function health(server:RunningMatchServer,rooms:number,players:number){
 const response=await fetch(`http://127.0.0.1:${server.port}/health`,{signal:AbortSignal.timeout(2000)});
 expect(response.ok).toBe(true);expect(await response.json()).toMatchObject({ok:true,rooms,players});
}

// This verifies the reconstruction's graceful empty-room policy, not original
// MultiUser server expiry timing. All scene/life changes use real authenticated
// protocol messages; no health, position, scene, clock or room-state seed occurs.
describe('original map room recreation through real server transport',()=>{
 it.each(['barrack','woodlands'] as const)('%s preserves a survivor then recreates the room after final explicit leave',async map=>{
  const server=startMatchServer(0),peers:Peer[]=[],room=`reset-${map}`;
  try{
   const victim=await connect(server,peers),victimWelcome=await join(victim,room,map,'PLAYER');
   const survivor=await connect(server,peers),survivorWelcome=await join(survivor,room,map,'Cowardice');
   await health(server,1,2);
   const death=survivor.wait(message=>message.type==='event'&&message.event.type==='killed'&&message.event.data.victimId===victimWelcome.clientId);
   victim.send({type:'source_escape'});
   const killed=await death;
   expect(killed).toMatchObject({type:'event',event:{type:'killed',data:{victimId:victimWelcome.clientId,killerId:survivorWelcome.clientId,killerScore:30,killerFrags:1,victimDeaths:1,source:{kind:'cowardice',attackerId:survivorWelcome.clientId,direct:map==='barrack'}}}});
   const dropState=await survivor.wait(message=>message.type==='snapshot'&&message.snapshot.drops?.length===1);
   if(dropState.type!=='snapshot')throw Error('Missing death drop snapshot');
   const drop=dropState.snapshot.drops![0];expect(drop).toMatchObject({weapon:'launcher',expiresAt:null});
   victim.send({type:'leave'});await victim.barrier();
   const preserved=await survivor.wait(message=>message.type==='snapshot'&&message.snapshot.players.length===1&&message.snapshot.players[0].id===survivorWelcome.clientId&&message.snapshot.players[0].score===30);
   if(preserved.type!=='snapshot')throw Error('Missing survivor snapshot');
   expect(preserved.snapshot.players[0]).toMatchObject({id:survivorWelcome.clientId,alive:true,health:100,frags:1,deaths:0,score:30});
   expect(preserved.snapshot.drops).toEqual([drop]);await health(server,1,1);
   const probe=await connect(server,peers),wrongMap=map==='barrack'?'woodlands':'barrack';
   const mismatch=probe.wait(message=>message.type==='error'&&message.code==='map_mismatch');
   probe.send({type:'join',protocol:PROTOCOL_VERSION,room,map:wrongMap,name:'PROBE'});
   expect(await mismatch).toMatchObject({type:'error',code:'map_mismatch'});await probe.barrier();await health(server,1,1);
   survivor.send({type:'leave'});await survivor.barrier();await health(server,0,0);
   const expired=probe.wait(message=>message.type==='error'&&message.code==='resume_expired');
   probe.send({type:'join',protocol:PROTOCOL_VERSION,room,map,name:'Cowardice',resumeToken:survivorWelcome.resumeToken});
   expect(await expired).toMatchObject({type:'error',code:'resume_expired'});await probe.barrier();await health(server,0,0);
   const fresh=await join(probe,room,map,'Cowardice');
   expect(fresh.clientId).not.toBe(survivorWelcome.clientId);expect(fresh.resumeToken).not.toBe(survivorWelcome.resumeToken);
   expect(fresh.player).toMatchObject({alive:true,health:100,frags:0,deaths:0,score:0});
   const loadout=await probe.wait(message=>message.type==='loadout'&&message.playerId===fresh.clientId);
   expect(loadout).toMatchObject({type:'loadout',equipped:'launcher',unarmed:false,sourceDisplayedWeapon:'launcher',weapons:{launcher:{ammo:6,reserve:18}}});
   const reset=await probe.wait(message=>message.type==='snapshot'&&message.snapshot.players.some(player=>player.id===fresh.clientId));
   if(reset.type!=='snapshot')throw Error('Missing fresh room snapshot');
   expect(reset.snapshot).toMatchObject({map,room,state:'playing',winnerId:null,projectiles:[],drops:[]});
   expect(reset.snapshot.players).toHaveLength(1);
   expect(reset.snapshot.players[0]).toMatchObject({id:fresh.clientId,alive:true,health:100,frags:0,deaths:0,score:0});
   if(map==='barrack')expect(reset.snapshot.doors).toHaveLength(13);
   else expect(reset.snapshot.doors).toEqual([]);
   await health(server,1,1);
   probe.send({type:'leave'});await probe.barrier();await health(server,0,0);
   for(const peer of peers)expect(peer.messages.filter(message=>message.type==='error')).toEqual(peer===probe?[expect.objectContaining({code:'map_mismatch'}),expect.objectContaining({code:'resume_expired'})]:[]);
  }finally{
   try{await Promise.allSettled(peers.map(peer=>peer.close()));}finally{await server.close();}
  }
 },10_000);
});
