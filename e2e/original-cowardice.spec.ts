import {expect,test,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {MatchRoom} from '../server/match-room';
import {matchServerNow} from '../server/clock';
import {parseClientMessage,PROTOCOL_VERSION,type MessagePeer,type ServerMessage} from '../server/protocol';
import {installOriginalAudioProbe} from './original-audio-probe';

test.setTimeout(120_000);
const out='artifacts/fidelity-review/2026-10-01/current';
async function prepare(page:Page,map:string,port?:number){
  await page.setViewportSize({width:800,height:600});
  await page.addInitScript(installOriginalAudioProbe);
  await page.addInitScript(({port})=>{
    if(port){const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(String(url).replace(':8081',`:${port}`),protocols);}};}
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  },{port});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
}
async function join(page:Page,room:string,name:string){
  await page.locator('#callsign').fill(name);await page.locator('#mode-online').click();await page.locator('#deploy').click();
  await page.locator('#room-code').fill(room);await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
}
const read=(page:Page)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
const hurts=(page:Page)=>page.evaluate(()=>(window as any).__RA_ORIGINAL_AUDIO__.events.filter((event:any)=>event.name==='hurtme'&&event.kind==='start'));

for(const scenario of [
  {map:'barrack',typing:false,named:false},{map:'barrack',typing:true,named:false},
  {map:'woodlands',typing:false,named:false},{map:'woodlands',typing:true,named:false},
  {map:'woodlands',typing:true,named:true},
  {map:'woodlands',typing:true,named:true,observerName:'cOwArDiCe'},
])test(`${scenario.map} typing=${scenario.typing} named=${scenario.named}${'observerName' in scenario?' mixed-case':''} real Cowardice death leaves one drop and corpse`,async({browser})=>{
  const a=await browser.newContext(),b=await browser.newContext();
  try{
    const victim=await a.newPage(),observer=await b.newPage(),errors:string[]=[],messages:any[]=[],sent:any[]=[],serverErrors:any[]=[];
    for(const page of [victim,observer])page.on('pageerror',error=>errors.push(error.message));
    observer.on('websocket',socket=>socket.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));messages.push(m);if(m.type==='error')serverErrors.push(m);}));
    victim.on('websocket',socket=>{socket.on('framesent',frame=>sent.push(JSON.parse(String(frame.payload))));socket.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);});});
    await prepare(victim,scenario.map);const room='COW'+Date.now().toString(36);await join(victim,room,'VICTIM');const initial=await read(victim);
    await prepare(observer,scenario.map);await join(observer,room,scenario.observerName??(scenario.named?'Cowardice':'OBSERVER'));
    await expect.poll(async()=>(await read(observer)).playerCount).toBe(2);
    await victim.bringToFront();
    if(scenario.typing){await victim.keyboard.press('Tab');await victim.locator('#chat-input').fill('unfinished');}
    await expect.poll(async()=>(await read(victim)).authoritativeLocal?.typing).toBe(scenario.typing);
    await victim.keyboard.press('Escape');await expect(victim.locator('#result')).toBeVisible();
    await expect(victim.locator('#result-kicker')).toContainText('thanks to Cowardice...');
    await expect(victim.locator('#pause')).toBeHidden();
    await expect.poll(()=>messages.filter(m=>m.type==='event'&&m.event.type==='killed').length).toBe(1);
    const killed=messages.find(m=>m.type==='event'&&m.event.type==='killed'),direct=scenario.map==='barrack'&&!scenario.typing;
    expect(killed.event.data).toMatchObject({victimId:initial.clientId,victimDeaths:1,source:{kind:'cowardice',direct,attackerId:scenario.named?(await read(observer)).clientId:null}});
    await expect.poll(()=>messages.filter(m=>m.type==='event'&&m.event.type==='leave').length).toBe(1);
    const deathIndex=messages.indexOf(killed),leaveIndex=messages.findIndex(m=>m.type==='event'&&m.event.type==='leave');expect(deathIndex).toBeLessThan(leaveIndex);
    await expect(observer.locator('#chat-log')).toContainText('Cowardice makes VICTIM russian history.');
    await expect.poll(()=>messages.some(m=>m.type==='snapshot'&&m.snapshot.drops?.length===1)).toBe(true);
    const drops=messages.find(m=>m.type==='snapshot'&&m.snapshot.drops?.length===1).snapshot.drops;
    expect(drops).toHaveLength(1);expect(drops[0]).toMatchObject({weapon:initial.loadout.equipped,expiresAt:null});
    await expect.poll(async()=>(await read(observer)).remotes.some((remote:any)=>remote.id===initial.clientId&&!remote.alive&&remote.inScene)).toBe(true);
    const corpse=await read(observer);
    const damage=messages.filter(m=>m.type==='event'&&m.event.type==='damaged');expect(damage).toHaveLength(direct?0:1);
    if(!direct)expect(damage[0].event.data).toMatchObject({damage:1000,health:-900,lethal:true,sourceHealth:{canonical:-900}});
    expect(await hurts(victim)).toHaveLength(direct?0:1);expect(await hurts(observer)).toHaveLength(0);
    // Default source spawns are random: the observer can legitimately collect
    // the victim's drop. Verify death credit independently of pickup credit.
    const observerId=(await read(observer)).clientId;
    expect(killed.event.data).toMatchObject({killerScore:scenario.named?30:0,killerFrags:scenario.named?1:0});
    if(scenario.named)expect(killed.event.data.killerId).toBe(observerId);
    expect(killed.event.data.sourceScoreRecipients??[]).toEqual([]);
    const observerCollections=()=>messages.filter(m=>m.type==='event'&&m.event.type==='collected'&&m.event.data.playerId===observerId);
    await expect.poll(async()=>Number(await observer.locator('#legacy-score').textContent())-5*observerCollections().length).toBe(scenario.named?30:0);
    for(const [index,collected] of observerCollections().entries())expect(collected.event.data).toMatchObject({kind:'weapon',weapon:initial.loadout.equipped,score:(scenario.named?30:0)+5*(index+1)});
    expect((await read(observer)).networkEffects.damageEvents).toBe(direct?0:1);
    const requests=sent.filter(m=>m.type==='source_escape');expect(requests).toHaveLength(1);expect(requests[0].sourceRemoteView.generation).toBe(1);
    const escapeIndex=sent.indexOf(requests[0]);expect(sent[escapeIndex-1]).toMatchObject({type:'transform',transform:{typing:scenario.typing}});
    await mkdir(out,{recursive:true});const label=`${scenario.map}-cowardice-${scenario.typing?'typing':'walking'}${scenario.named?'-named':''}${'observerName' in scenario?'-mixed-case':''}`;
    await victim.screenshot({path:`${out}/${label}-result.png`});
    await expect.poll(async()=>(await read(observer)).remotes.some((remote:any)=>remote.id===initial.clientId),{timeout:6000}).toBe(false);
    await victim.locator('#restart').click();await expect(victim.locator('#menu-entry')).toBeVisible();await victim.locator('#deploy').click();await victim.locator('#join-room').click();await expect(victim.locator('#network-status')).toHaveAttribute('data-state','connected');
    const reentered=await read(victim);expect(reentered.clientId).not.toBe(initial.clientId);expect(reentered.local.health).toBe(100);
    expect(messages.filter(m=>m.type==='event'&&m.event.type==='killed')).toHaveLength(1);expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
    await writeFile(`${out}/${label}.json`,JSON.stringify({initial,corpse,drops,messages,sent,reentered,errors,serverErrors},null,2));
  }finally{await a.close();await b.close();}
});

/** Isolated authority fixture seeds uncapped health before welcome. It uses
 * production parsing, source simulation and Escape handling over real sockets;
 * no production endpoint accepts a client-supplied health override.
 */
async function highHealthServer(map:'barrack'|'woodlands'){
  const room=new MatchRoom('HIGHHEALTH',{map,now:matchServerNow}),server=new WebSocketServer({port:0,host:'127.0.0.1'}),messages:ServerMessage[]=[];
  await new Promise<void>(resolve=>server.once('listening',resolve));
  server.on('connection',socket=>{
    let playerId:string|null=null;
    const peer:MessagePeer={send(message){
      if(message.type==='welcome'){
        const actor=(room as any).players.get(message.clientId);actor.health=1100;actor.sourceHealth.canonical=1100;
        message.player.health=1100;message.player.sourceHealth!.canonical=1100;
      }
      messages.push(message);if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));
    }};
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
for(const map of ['barrack','woodlands'] as const)for(const typing of [false,true])test(`${map} typing=${typing} real high-health Cowardice preserves survival and capture state`,async({page})=>{
  const fixture=await highHealthServer(map),errors:string[]=[],serverErrors:any[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>socket.on('framereceived',frame=>{const message=JSON.parse(String(frame.payload));if(message.type==='error')serverErrors.push(message);}));
  try{
    await prepare(page,map,fixture.port);await join(page,'HIGHHEALTH','SURVIVOR');await expect.poll(async()=>(await read(page)).local.health).toBe(1100);
    if(typing){await page.keyboard.press('Tab');await page.locator('#chat-input').fill('keep this text');}
    await page.keyboard.down('Escape');await page.evaluate(()=>document.exitPointerLock());await page.keyboard.up('Escape');
    const direct=map==='barrack'&&!typing;
    if(direct)await expect(page.locator('#result')).toBeVisible();
    else{
      await expect.poll(async()=>(await read(page)).local.health).toBe(100);
      expect((await read(page)).local.alive).toBe(true);await expect(page.locator('#pause')).toBeHidden();await expect(page.locator('#result')).toBeHidden();
      expect((await read(page)).chatOpen).toBe(typing);if(typing)await expect(page.locator('#chat-input')).toHaveValue('keep this text');
      expect(fixture.messages.filter(m=>m.type==='event'&&m.event.type==='killed')).toHaveLength(0);
      await page.keyboard.press('Escape');await expect(page.locator('#result')).toBeVisible();
    }
    await expect(page.locator('#result-kicker')).toContainText('Cowardice');
    expect(await hurts(page)).toHaveLength(direct?0:2);
    expect(fixture.messages.filter(m=>m.type==='event'&&m.event.type==='killed')).toHaveLength(1);
    expect(errors).toEqual([]);expect(serverErrors).toEqual([]);await mkdir(out,{recursive:true});
    await writeFile(`${out}/${map}-cowardice-high-${typing?'typing':'walking'}.json`,JSON.stringify({fixture:'authority-only1100health seed beforewelcome',messages:fixture.messages,final:await read(page),errors,serverErrors},null,2));
  }finally{await fixture.close();}
});
