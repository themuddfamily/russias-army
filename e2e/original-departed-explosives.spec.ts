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
type Departure='before'|'during';
async function authority(map:'barrack'|'woodlands',health:number){
  // A recovered spawn plus a supported two-metre offset keeps both eyes
  // within blast range, without overlapping bodies or automatic drop pickup.
  // Only lethal cases seed60health before welcome; gameplay handling is unchanged.
  const runtime=getOriginalMapRuntime(map),spawn=runtime.spawnPoints[0];
  const offset={...spawn,x:spawn.x+2};
  const support=runtime.geometry.playerSupportHeightAt(offset.x,offset.z,spawn.y+.08,runtime.profile.radius,runtime.profile.bodyHeight);
  if(support===undefined)throw Error('Departure fixture offset has no recovered support');offset.y=support;
  const room=new MatchRoom('DEPARTURE',{map,now:matchServerNow,spawnPoints:[spawn,offset]});
  const server=new WebSocketServer({port:0,host:'127.0.0.1'}),messages:ServerMessage[]=[];
  await new Promise<void>(resolve=>server.once('listening',resolve));
  server.on('connection',socket=>{
    let playerId:string|null=null;
    const peer:MessagePeer={send(message){
      if(message.type==='welcome'&&message.player.name==='VICTIM'&&health!==100){
        const actor=(room as any).players.get(message.clientId);actor.health=health;actor.sourceHealth.canonical=health;
        message.player.health=health;message.player.sourceHealth!.canonical=health;
      }
      messages.push(message);if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));
    }};
    socket.on('message',raw=>{
      const message=parseClientMessage(raw.toString());if(!message)throw Error('Invalid departure fixture request');
      if(message.type==='join'){
        if(message.protocol!==PROTOCOL_VERSION)throw Error('Departure fixture protocol mismatch');
        const result=room.join(peer,message.name,matchServerNow(),message.resumeToken,message.sourceRemoteView);
        if(!result.ok)throw Error(result.message);playerId=result.player.id;
      }else if(playerId){room.handleMessage(playerId,message,matchServerNow(),peer);if(message.type==='leave')playerId=null;}
    });
    socket.on('close',()=>{if(playerId)room.suspend(playerId,matchServerNow(),peer);});
  });
  const timer=setInterval(()=>room.tick(matchServerNow()),50);
  return {room,messages,port:(server.address() as {port:number}).port,close:async()=>{clearInterval(timer);for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
async function prepare(page:Page,map:string,port:number){
  await page.setViewportSize({width:800,height:600});await page.addInitScript(installOriginalAudioProbe);
  await page.addInitScript(({port})=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
    const Native=window.WebSocket;
    window.WebSocket=class extends Native{
      constructor(url:string|URL,protocols?:string|string[]){
        super(String(url).replace(':8081',`:${port}`),protocols);
        this.addEventListener('message',event=>{
          const state=(window as any).__DEPARTURE_INPUT__;if(!state?.armed)return;
          const message=JSON.parse(String(event.data));if(message.type!=='event')return;
          const e=message.event;
          const triggered=state.mode==='before'?e.type==='projectile_spawned'&&e.data.projectile.attackerId===state.ownerId
            :e.type==='damaged'&&e.data.source.kind==='explosion'&&e.data.targetId===state.victimId;
          if(triggered){state.armed=false;state.trigger=e;queueMicrotask(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true,cancelable:true})));}
        });
      }
    };
  },{port});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
}
async function join(page:Page,name:string){
  await page.locator('#callsign').fill(name);await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('DEPARTURE');await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
}
const read=(page:Page)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
const cases:Array<{map:'barrack'|'woodlands';weapon:'launcher'|'rpg';departure:Departure;health:number}>=[];
for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const)for(const departure of ['before','during'] as const)cases.push({map,weapon,departure,health:100});
for(const map of ['barrack','woodlands'] as const)cases.push({map,weapon:'launcher',departure:'during',health:60});
for(const scenario of cases)test(`${scenario.map} ${scenario.weapon} owner leaves ${scenario.departure} blast at victim health${scenario.health}`,async({browser})=>{
  const fixture=await authority(scenario.map,scenario.health),a=await browser.newContext(),b=await browser.newContext();
  const errors:string[]=[],serverErrors:any[]=[],received:any[]=[],sent:any[]=[];
  const label=`${scenario.map}-departed-${scenario.weapon}-${scenario.departure}-${scenario.health}`;
  try{
    const owner=await a.newPage(),victim=await b.newPage();
    for(const page of [owner,victim])page.on('pageerror',error=>errors.push(error.message));
    victim.on('websocket',socket=>socket.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));received.push(m);if(m.type==='error')serverErrors.push(m);}));
    owner.on('websocket',socket=>{socket.on('framesent',frame=>sent.push(JSON.parse(String(frame.payload))));socket.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);});});
    await prepare(owner,scenario.map,fixture.port);await join(owner,'OWNER');
    await prepare(victim,scenario.map,fixture.port);await join(victim,'VICTIM');
    await expect.poll(async()=>(await read(owner)).playerCount).toBe(2);
    const initialOwner=await read(owner),initialVictim=await read(victim);
    await owner.evaluate(({mode,ownerId,victimId})=>{(window as any).__DEPARTURE_INPUT__={armed:true,mode,ownerId,victimId};},{mode:scenario.departure,ownerId:initialOwner.clientId,victimId:initialVictim.clientId});
    await victim.bringToFront();
    const distantRocket=scenario.weapon==='rpg'&&scenario.departure==='before';
    await owner.evaluate(({weapon,pitch})=>(window as any).__RA_MULTIPLAYER_DEBUG__.fireNetworkWeapon(weapon,0,pitch),{weapon:scenario.weapon,pitch:distantRocket?1.5:-1.5});
    await expect(owner.locator('#result')).toBeVisible({timeout:10_000});
    const events=()=>received.filter(m=>m.type==='event').map(m=>m.event);
    await expect.poll(()=>events().filter(e=>e.type==='explosion').length,{timeout:10_000,intervals:[20]}).toBe(1);
    const explosion=events().find(e=>e.type==='explosion'),spawn=events().find(e=>e.type==='projectile_spawned');
    await mkdir(out,{recursive:true});
    await writeFile(`${out}/${label}.json`,JSON.stringify({verified:false,initialOwner,initialVictim,events:events(),sent,errors,serverErrors},null,2));
    let blastVisual:any=null;
    if(scenario.health===100){
      await expect.poll(async()=>{blastVisual=(await read(victim)).originalExplosionVisuals.find((visual:any)=>visual.id===explosion.data.projectileId);return blastVisual?.kind;},{intervals:[20]}).toBe(scenario.weapon==='rpg'?'rocket':'grenade');
      expect(blastVisual.remainingCallbacks).toBeGreaterThan(0);expect(blastVisual.remainingCallbacks).toBeLessThanOrEqual(16);
    }
    expect(spawn.data.projectile).toMatchObject({attackerId:initialOwner.clientId,attackerName:'OWNER',weapon:scenario.weapon});
    expect(explosion.data).toMatchObject({attackerId:initialOwner.clientId,attackerName:'OWNER',weapon:scenario.weapon,projectileId:spawn.data.projectile.projectileId});
    await expect.poll(()=>events().filter(e=>e.type==='leave'&&e.data.playerId===initialOwner.clientId).length).toBe(1);
    const leave=events().find(e=>e.type==='leave'&&e.data.playerId===initialOwner.clientId),list=events();
    if(scenario.departure==='before')expect(list.indexOf(leave)).toBeLessThan(list.indexOf(explosion));
    else expect(list.indexOf(explosion)).toBeLessThan(list.indexOf(leave));
    const damage=()=>events().filter(e=>e.type==='damaged'&&e.data.targetId===initialVictim.clientId&&e.data.source.kind==='explosion');
    if(scenario.health===100){
      await expect.poll(()=>damage().length,{timeout:5000}).toBe(distantRocket?0:16);
      await expect.poll(async()=>(await read(victim)).local.health).toBe(distantRocket?100:20);
      await expect(victim.locator('#result')).toBeHidden();
      await expect.poll(async()=>(await read(victim)).originalExplosionVisuals.length).toBe(0);
      await expect.poll(async()=>(await read(victim)).networkProjectiles).toBe(0);
      await expect(victim.locator('#legacy-score')).toHaveText('0');
    }else{
      await expect(victim.locator('#result')).toBeVisible({timeout:5000});
      await expect(victim.locator('#result-kicker')).toContainText('thanks to OWNER...');
      await expect.poll(()=>events().filter(e=>e.type==='killed'&&e.data.victimId===initialVictim.clientId).length).toBe(1);
      const killed=events().find(e=>e.type==='killed'&&e.data.victimId===initialVictim.clientId);
      expect(killed.data).toMatchObject({killerId:initialOwner.clientId,victimDeaths:1,killerScore:0,source:{attackerName:'OWNER'},sourceScoreRecipients:[]});
      expect(fixture.room.getSnapshot().drops).toHaveLength(2);
    }
    expect(damage().every(e=>e.data.damage===5&&e.data.attackerId===initialOwner.clientId&&e.data.source.attackerName==='OWNER')).toBe(true);
    if(distantRocket)expect(damage()).toEqual([]);
    else expect(damage().some(e=>e.serverTime>leave.serverTime)).toBe(true);
    const hurt=await victim.evaluate(()=>(window as any).__RA_ORIGINAL_AUDIO__.events.filter((e:any)=>e.name==='hurtme'&&e.kind==='start'));
    expect(hurt).toHaveLength(damage().length);
    const trigger=await owner.evaluate(()=>(window as any).__DEPARTURE_INPUT__.trigger);
    expect(sent.filter(m=>m.type==='source_escape')).toHaveLength(1);
    expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
    await mkdir(out,{recursive:true});
    await victim.screenshot({path:`${out}/${label}.png`});
    await writeFile(`${out}/${label}.json`,JSON.stringify({verified:true,blastVisual,fixture:{recoveredSpawnAndSupportedOffset:2,initialVictimHealth:scenario.health,eventTriggeredDomEscape:true},initialOwner,initialVictim,trigger,events:events(),sent,damage:damage(),hurt,final:await read(victim),authority:fixture.room.getSnapshot(),errors,serverErrors},null,2));
  }finally{await a.close();await b.close();await fixture.close();}
});
