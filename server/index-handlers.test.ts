/** Handler integration only. These tests never claim to exercise OS sockets. */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunningMatchServer } from './index';

const harness=vi.hoisted(()=>({request:undefined as undefined|((request:unknown,response:unknown)=>void),server:undefined as undefined|{emit:(event:string,...args:unknown[])=>boolean}}));
vi.mock('node:http',async()=>{
  const {EventEmitter}=await import('node:events');
  return {createServer:(request:typeof harness.request)=>{
    harness.request=request;
    return new class extends EventEmitter {
      listen(){return this;}
      address(){return {port:12345};}
      close(callback:(error?:Error)=>void){callback();return this;}
    }();
  }};
});
vi.mock('ws',async()=>{
  const {EventEmitter}=await import('node:events');
  return {WebSocket:{OPEN:1},WebSocketServer:class extends EventEmitter {
    constructor(){super();harness.server=this;}
    close(callback:(error?:Error)=>void){callback();}
  }};
});
import { startMatchServer } from './index';
import { getOriginalMapRuntime } from '../shared/originalMapRuntime';
import { ORIGINAL_SOURCE_SPAWNS } from '../shared/originalMapProfile';
import { PROTOCOL_VERSION } from '../shared/protocol';
class Socket extends EventEmitter {
  readyState=1;messages:Array<Record<string,any>>=[];
  send(raw:string){this.messages.push(JSON.parse(raw));}
  close(){this.readyState=3;this.emit('close');}
  terminate(){this.close();}
  ping(){}
  request(message:unknown){this.emit('message',Buffer.from(JSON.stringify(message)));}
}
let running:RunningMatchServer|undefined;
afterEach(async()=>{await running?.close();running=undefined;});
function start(){running=startMatchServer(0);}
function connect(){const socket=new Socket();harness.server!.emit('connection',socket);return socket;}
function directory(){let status=0,headers:Record<string,string>={},body:any;harness.request!({method:'GET',url:'/rooms'},{writeHead:(code:number,value:Record<string,string>)=>{status=code;headers=value;},end:(value:string)=>{body=JSON.parse(value);}});return {status,headers,body};}

describe('match HTTP/WebSocket handlers without listening sockets',()=>{
  it('defaults new rooms to the real Barrack map and ignores client collision-profile injection',()=>{
    start();const socket=connect();socket.request({type:'join',protocol:PROTOCOL_VERSION,room:'default',name:'Player',collisionProfile:'winter'});
    const welcome=socket.messages[0];
    expect(welcome).toMatchObject({type:'welcome',map:'barrack'});
    const starts=getOriginalMapRuntime('barrack').spawnPoints;
    expect(starts).toContainEqual(welcome.player.transform.position);
    const index=starts.findIndex(start=>start.x===welcome.player.transform.position.x&&start.y===welcome.player.transform.position.y&&start.z===welcome.player.transform.position.z);
    expect(welcome.player.transform.yaw).toBeCloseTo(ORIGINAL_SOURCE_SPAWNS.barrack[index].rotation[2]*Math.PI/180);
    expect(welcome.player.transform.pitch).toBeCloseTo(ORIGINAL_SOURCE_SPAWNS.barrack[index].rotation[0]*Math.PI/180);
    expect(directory()).toMatchObject({status:200,headers:{'cache-control':'no-store','access-control-allow-origin':'*'},body:{rooms:[{room:'default',map:'barrack',players:1,connectedPlayers:1,capacity:8}]}});
  });
  it('rejects map mutation on reconnect without displacing the active owner or leaking a new room',()=>{
    start();const first=connect();first.request({type:'join',protocol:PROTOCOL_VERSION,room:'forest',name:'Player',map:'woodlands'});const token=first.messages[0].resumeToken;
    const second=connect();second.request({type:'join',protocol:PROTOCOL_VERSION,room:'forest',name:'Other',map:'barrack',resumeToken:token});
    expect(second.messages.at(-1)).toMatchObject({type:'error',code:'map_mismatch'});expect(first.readyState).toBe(1);
    second.request({type:'join',protocol:PROTOCOL_VERSION,room:'bad-map',name:'Other',map:'winter'});expect(second.messages.at(-1)).toMatchObject({type:'error',code:'invalid_map'});
    expect(directory().body.rooms).toHaveLength(1);
    second.request({type:'join',protocol:PROTOCOL_VERSION,room:'forest',name:'Other',map:'woodlands',resumeToken:token});
    expect(second.messages.find(m=>m.type==='welcome')).toMatchObject({map:'woodlands',player:{name:'Player'}});expect(first.readyState).toBe(3);
    expect(directory().body.rooms).toMatchObject([{players:1,connectedPlayers:1}]);
    second.close();expect(directory().body.rooms).toMatchObject([{players:1,connectedPlayers:0}]);
  });
  it('routes chat through authoritative validation and removes a room on explicit leave',()=>{
    start();const first=connect(),second=connect();
    first.request({type:'join',protocol:PROTOCOL_VERSION,room:'chat',name:'Alice'});second.request({type:'join',protocol:PROTOCOL_VERSION,room:'chat',name:'Bob'});
    first.request({type:'chat',text:'Hello',name:'Bob',playerId:'forged'});
    expect(second.messages.at(-1)).toMatchObject({type:'event',event:{type:'chat',data:{name:'Alice',playerId:first.messages[0].clientId,text:'Hello'}}});
    first.request({type:'chat',text:'x'.repeat(241)});expect(first.messages.at(-1)).toMatchObject({type:'error',code:'invalid_chat'});
    first.request({type:'leave'});second.request({type:'leave'});expect(directory().body.rooms).toEqual([]);
  });
});
