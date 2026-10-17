import {describe,it,expect} from 'vitest';
import {NetworkClient,NETWORK_PROTOCOL_VERSION,type WebSocketLike,type WelcomeMessage,type NetworkSnapshot} from './network';
class Socket implements WebSocketLike {
 readyState=0;sent:string[]=[];listeners=new Map<string,((event:any)=>void)[]>();
 send(s:string){this.sent.push(s);}close(){this.readyState=3;}
 addEventListener(type:any,listener:any){this.listeners.set(type,[...(this.listeners.get(type)??[]),listener]);}
 emit(type:string,event:any){for(const f of this.listeners.get(type)??[])f(event);}
 receive(value:unknown){this.emit('message',{data:JSON.stringify(value)});}
}
const welcome:WelcomeMessage={type:'welcome',protocol:NETWORK_PROTOCOL_VERSION,clientId:'a',resumeToken:'token',room:'display',tickRate:20,serverTime:0,fragLimit:10,player:{id:'a',name:'A',health:100,maxHealth:100,frags:0,deaths:0,alive:true,respawnAt:null,transform:{position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},yaw:0,pitch:0,grounded:true,weapon:'launcher'}}};
const snapshot:NetworkSnapshot={room:'display',map:'barrack',tick:0,serverTime:0,fragLimit:10,state:'playing',winnerId:null,players:[welcome.player],projectiles:[],barrels:[{id:'barrel01',position:{x:1,y:2,z:3},velocity:{x:0,y:-1,z:0}}]};
async function setup(){const socket=new Socket(),received:NetworkSnapshot[]=[];const client=new NetworkClient({reconnect:false,websocketFactory:()=>socket,onSnapshot:m=>received.push(m)});const joined=client.join('display','A');socket.readyState=1;socket.emit('open',{});socket.receive(welcome);await joined;return {socket,client,received};}
describe('source movable barrel snapshot transport',()=>{
 it('delivers canonical positions and physics velocities, source empty maps and optional legacy omission',async()=>{
  const s=await setup();s.socket.receive({type:'snapshot',snapshot});s.socket.receive({type:'snapshot',snapshot:{...snapshot,map:'woodlands',barrels:[]}});const legacy={...snapshot};delete legacy.barrels;s.socket.receive({type:'snapshot',snapshot:legacy});
  expect(s.received).toEqual([snapshot,{...snapshot,map:'woodlands',barrels:[]},legacy]);s.client.leave();
 });
 it('rejects malformed identifiers, nonfinite positions/velocities, duplicate IDs and oversized lists',async()=>{
  const s=await setup(),barrel=snapshot.barrels![0];const invalid=[[{...barrel,id:''}],[{...barrel,position:{x:1,y:'2',z:3}}],[{...barrel,velocity:{x:0,y:null,z:0}}],[barrel,barrel],Array.from({length:129},(_,i)=>({...barrel,id:`barrel${i}`}))];
  for(const barrels of invalid)s.socket.receive({type:'snapshot',snapshot:{...snapshot,barrels}});s.socket.receive({type:'snapshot',snapshot});expect(s.received).toEqual([snapshot]);s.client.leave();
 });
});
