import {describe,it,expect} from 'vitest';
import {NetworkClient,NETWORK_PROTOCOL_VERSION,type WebSocketLike,type WelcomeMessage,type LoadoutMessage} from './network';
class Socket implements WebSocketLike {
 readyState=0;sent:string[]=[];listeners=new Map<string,((event:any)=>void)[]>();
 send(s:string){this.sent.push(s);}close(){this.readyState=3;}
 addEventListener(type:any,listener:any){this.listeners.set(type,[...(this.listeners.get(type)??[]),listener]);}
 emit(type:string,event:any){for(const f of this.listeners.get(type)??[])f(event);}
 receive(value:unknown){this.emit('message',{data:JSON.stringify(value)});}
}
const welcome:WelcomeMessage={type:'welcome',protocol:NETWORK_PROTOCOL_VERSION,clientId:'a',resumeToken:'token',room:'display',tickRate:20,serverTime:0,fragLimit:10,player:{id:'a',name:'A',health:100,maxHealth:100,frags:0,deaths:0,alive:true,respawnAt:null,transform:{position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},yaw:0,pitch:0,grounded:true,weapon:'launcher'}}};
const packet:LoadoutMessage={type:'loadout',serverTime:0,playerId:'a',equipped:'launcher',unarmed:true,weapons:{pistol:{ammo:0,reserve:0},shotgun:{ammo:0,reserve:0},rifle:{ammo:0,reserve:0},sniper:{ammo:0,reserve:0},launcher:{ammo:0,reserve:0},rpg:{ammo:0,reserve:0}},reload:null};
async function setup(){const socket=new Socket(),received:LoadoutMessage[]=[];const client=new NetworkClient({reconnect:false,websocketFactory:()=>socket,onLoadout:m=>received.push(m)});const joined=client.join('display','A');socket.readyState=1;socket.emit('open',{});socket.receive(welcome);await joined;return {socket,client,received};}
describe('source display transport',()=>{
 it('delivers retained model and explicit VOID independently of cached equipped enum',async()=>{
  const s=await setup();s.socket.receive({...packet,sourceDisplayedWeapon:'launcher'});s.socket.receive({...packet,sourceDisplayedWeapon:null});
  expect(s.received.map(m=>m.sourceDisplayedWeapon)).toEqual(['launcher',null]);s.client.leave();
 });
 it('rejects invalid display models but accepts optional legacy omission',async()=>{
  const s=await setup();for(const invalid of ['VOID',false,{},0])s.socket.receive({...packet,sourceDisplayedWeapon:invalid});s.socket.receive(packet);
  expect(s.received).toEqual([packet]);s.client.leave();
 });
 it('sends held-fire sort intent separately from ordinary manual reload',async()=>{
  const s=await setup();expect(s.client.reload('launcher')).toBe(true);expect(s.client.reload('launcher',true)).toBe(true);expect(s.client.reload('launcher','yes' as never)).toBe(false);
  expect(s.socket.sent.map(m=>JSON.parse(m)).filter(m=>m.type==='reload')).toEqual([{type:'reload',weapon:'launcher'},{type:'reload',weapon:'launcher',sourceSortAfterReload:true}]);s.client.leave();
 });
});
