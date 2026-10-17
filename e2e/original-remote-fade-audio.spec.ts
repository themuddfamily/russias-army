import {expect,test,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {MatchRoom} from '../server/match-room';
import {matchServerNow} from '../server/clock';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import {parseClientMessage,PROTOCOL_VERSION,type MessagePeer,type ServerMessage} from '../server/protocol';
import {installOriginalAudioProbe} from './original-audio-probe';

test.setTimeout(120_000);
const out='artifacts/fidelity-review/2026-10-01/current';
async function fixture(map:'barrack'|'woodlands'){
  // Pin both source entries near one another so the positional sound is audible.
  // Geometry, health, source timing and Escape handling remain production paths.
  const room=new MatchRoom('FADEAUDIO',{map,now:matchServerNow,spawnPoints:[getOriginalMapRuntime(map).spawnPoints[0]]});
  const server=new WebSocketServer({port:0,host:'127.0.0.1'}),messages:ServerMessage[]=[];
  await new Promise<void>(resolve=>server.once('listening',resolve));
  server.on('connection',socket=>{
    let playerId:string|null=null;
    const peer:MessagePeer={send(message){messages.push(message);if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}};
    socket.on('message',raw=>{
      const message=parseClientMessage(raw.toString());if(!message)throw Error('Invalid fixture protocol message');
      if(message.type==='join'){
        if(message.protocol!==PROTOCOL_VERSION)throw Error('Fixture protocol mismatch');
        const result=room.join(peer,message.name,matchServerNow(),message.resumeToken,message.sourceRemoteView);if(!result.ok)throw Error(result.message);playerId=result.player.id;
      }else if(playerId){room.handleMessage(playerId,message,matchServerNow(),peer);if(message.type==='leave')playerId=null;}
    });
    socket.on('close',()=>{if(playerId)room.suspend(playerId,matchServerNow(),peer);});
  });
  const timer=setInterval(()=>room.tick(matchServerNow()),50),port=(server.address() as {port:number}).port;
  return {port,messages,close:async()=>{clearInterval(timer);for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
async function prepare(page:Page,map:string,port:number,name:string){
  await page.setViewportSize({width:800,height:600});await page.addInitScript(installOriginalAudioProbe);
  await page.addInitScript(({port})=>{
    const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(String(url).replace(':8081',`:${port}`),protocols);}};
    let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  },{port});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});await page.locator('#callsign').fill(name);
  await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('FADEAUDIO');await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await expect.poll(()=>page.evaluate(()=>Object.keys((window as any).__RA_ORIGINAL_AUDIO__.decoded).length)).toBe(12);
}
for(const map of ['barrack','woodlands'] as const)for(const typing of [false,true])test(`${map} typing=${typing} remote corpse plays hurt while local direct route stays distinct`,async({browser})=>{
  const server=await fixture(map),a=await browser.newContext(),b=await browser.newContext();
  try{
    const victim=await a.newPage(),observer=await b.newPage(),errors:string[]=[],serverErrors:unknown[]=[];
    for(const page of [victim,observer]){page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>socket.on('framereceived',frame=>{const message=JSON.parse(String(frame.payload));if(message.type==='error')serverErrors.push(message);}));}
    await prepare(victim,map,server.port,'VICTIM');await prepare(observer,map,server.port,'OBSERVER');
    const read=(page:Page)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
    await expect.poll(async()=>(await read(observer)).playerCount).toBe(2);const initial=await read(victim);
    await victim.bringToFront();if(typing)await victim.keyboard.press('Tab');await expect.poll(async()=>(await read(victim)).authoritativeLocal?.typing).toBe(typing);
    await victim.keyboard.press('Escape');await expect(victim.locator('#result')).toBeVisible();
    const audio=(page:Page)=>page.evaluate(()=>(window as any).__RA_ORIGINAL_AUDIO__);
    await expect.poll(async()=>(await audio(observer)).events.filter((e:any)=>e.kind==='start'&&e.name==='hurt').length).toBe(1);
    await expect.poll(async()=>(await read(observer)).remotes.some((remote:any)=>remote.id===initial.clientId&&!remote.alive&&remote.inScene)).toBe(true);
    const localAudio=await audio(victim),remoteAudio=await audio(observer),direct=map==='barrack'&&!typing;
    expect(localAudio.events.filter((e:any)=>e.kind==='start'&&e.name==='hurtme')).toHaveLength(direct?0:1);
    expect(localAudio.events.filter((e:any)=>e.kind==='start'&&e.name==='hurt')).toHaveLength(0);
    expect(remoteAudio.events.filter((e:any)=>e.kind==='start'&&e.name==='hurtme')).toHaveLength(0);
    const corpse=await read(observer);expect(corpse.networkEffects.eliminations).toBe(1);expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
    await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-remote-fade-hurt-${typing?'typing':'walking'}.json`,JSON.stringify({map,typing,initial,corpse,localAudio,remoteAudio,messages:server.messages,errors,serverErrors,limits:'Production parsing, MatchRoom, source geometry, real Escape and WebAudio playback with pinned nearby source starts and pointer-lock shim. Native mixer/callback birth time remains unmeasured.'},null,2));
  }finally{await a.close();await b.close();await server.close();}
});
