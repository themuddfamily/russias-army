import {expect,test,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {MatchRoom} from '../server/match-room';
import {matchServerNow} from '../server/clock';
import {parseClientMessage,PROTOCOL_VERSION,type MessagePeer,type ServerMessage} from '../server/protocol';
import {getOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {WeaponDropSnapshot} from '../shared/protocol';
import {installOriginalAudioProbe} from './original-audio-probe';

test.setTimeout(90_000);
test.use({viewport:{width:800,height:600}});

// Drop placement and a 200ms receipt-to-removal network gap are fixture setup.
// Inventory, source callbacks, selection,
// automatic collection, reload and canonical transport remain production code.
async function authority(map:'barrack'|'woodlands'){
  const room=new MatchRoom('CROSSPICKUP',{map,now:matchServerNow});
  const server=new WebSocketServer({port:0,host:'127.0.0.1'});
  const messages:ServerMessage[]=[],collections:unknown[]=[],failures:string[]=[];
  let removalNotBefore=0,heldSnapshots=0,removalDelivered=false;
  const retain=(message:ServerMessage)=>{
    if(message.type!=='welcome'&&message.type!=='loadout'&&message.type!=='error'&&!(message.type==='event'&&message.event.type==='collected'))return;
    if(messages.length>=256){failures.push('Canonical ledger capacity exceeded');return;}
    messages.push(message);
  };
  await new Promise<void>(resolve=>server.once('listening',resolve));
  server.on('connection',socket=>{
    let playerId:string|null=null;
    const peer:MessagePeer={send(message){
      // Reproduce the confirmed receipt/old-snapshot race without altering
      // Game's clock, source callbacks, retry throttle or freshness deadline.
      if(message.type==='event'&&message.event.type==='collected')removalNotBefore=matchServerNow()+200;
      if(message.type==='snapshot'&&removalNotBefore){
        if(matchServerNow()<removalNotBefore){heldSnapshots++;return;}
        if(!message.snapshot.drops?.some(drop=>drop.id==='cross-slot-pistol'))removalDelivered=true;
      }
      retain(message);if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));
    }};
    socket.on('message',raw=>{
      const message=parseClientMessage(raw.toString());
      if(!message){failures.push('Invalid fixture request');return;}
      if(message.type==='collect'){
        if(collections.length>=32){failures.push('Collection ledger capacity exceeded');return;}
        collections.push(message);
      }
      if(message.type==='join'){
        if(message.protocol!==PROTOCOL_VERSION){failures.push('Fixture protocol mismatch');return;}
        const joined=room.join(peer,message.name,matchServerNow(),message.resumeToken,message.sourceRemoteView);
        if(!joined.ok){failures.push(joined.message);return;}playerId=joined.player.id;
      }else if(playerId){room.handleMessage(playerId,message,matchServerNow(),peer);if(message.type==='leave')playerId=null;}
    });
    socket.on('close',()=>{if(playerId)room.suspend(playerId,matchServerNow(),peer);});
  });
  const timer=setInterval(()=>room.tick(matchServerNow()),50);
  return {room,messages,collections,failures,get heldSnapshots(){return heldSnapshots;},get removalDelivered(){return removalDelivered;},port:(server.address() as {port:number}).port,
    insertDrop(playerId:string){
      const player=room.getSnapshot(matchServerNow()).players.find(p=>p.id===playerId);
      if(!player)throw Error('Missing collector');
      const drop:WeaponDropSnapshot={id:'cross-slot-pistol',weapon:'pistol',position:{...player.transform.position,y:player.transform.position.y+getOriginalMapRuntime(map).profile.eyeHeight},expiresAt:null};
      (room as unknown as {drops:Map<string,WeaponDropSnapshot>}).drops.set(drop.id,drop);
      return drop;
    },
    async close(){clearInterval(timer);for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));},
  };
}

async function prepare(page:Page,map:string,port:number){
  await page.addInitScript(installOriginalAudioProbe);
  await page.addInitScript(({port})=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
    const Native=window.WebSocket;
    window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(String(url).replace(':8081',`:${port}`),protocols);}};
  },{port});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#callsign').fill('COLLECTOR');await page.locator('#mode-online').click();await page.locator('#deploy').click();
  await page.locator('#room-code').fill('CROSSPICKUP');await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('#game canvas')!.requestPointerLock());
}
const read=(page:Page)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());

for(const map of ['barrack','woodlands'] as const)test(`${map} armed pistol pickup preserves Dragunov and refunds its overfull chamber`,async({page},testInfo)=>{
  const fixture=await authority(map),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await prepare(page,map,fixture.port);
    await page.keyboard.down('Digit6');
    try{await expect.poll(async()=>(await read(page)).loadout.equipped).toBe('sniper');}
    finally{await page.keyboard.up('Digit6');}
    await expect.poll(()=>fixture.messages.some(m=>m.type==='loadout'&&m.equipped==='sniper')).toBe(true);
    const before=await read(page);
    expect(before.loadout.ammo.sniper).toBe(30);expect(before.loadout.reserve.sniper).toBe(12);
    expect(before.loadout.ammo.pistol).toBe(8);expect(before.loadout.reserve.pistol).toBe(54);
    const audioBefore=await page.evaluate(()=>(window as any).__RA_ORIGINAL_AUDIO__.events.length);
    const drop=fixture.insertDrop(before.clientId);
    await expect.poll(()=>fixture.messages.filter(m=>m.type==='event'&&m.event.type==='collected').length).toBe(1);
    await expect.poll(async()=>(await read(page)).loadout.reserve.pistol).toBe(74);
    await expect.poll(async()=>(await read(page)).loadout.ammo.sniper).toBe(28);
    const after=await read(page);
    expect(after.loadout.equipped).toBe('sniper');expect(after.loadout.unarmed).toBe(false);
    expect(after.loadout.reserve.sniper).toBe(14);expect(after.loadout.ammo.pistol).toBe(8);
    for(const weapon of ['shotgun','rifle','launcher','rpg']){
      expect(after.loadout.ammo[weapon]).toBe(before.loadout.ammo[weapon]);
      expect(after.loadout.reserve[weapon]).toBe(before.loadout.reserve[weapon]);
    }
    expect(after.originalWeapon.displayedWeapon).toBe('sniper');
    expect(after.originalWeapon.models.filter((m:any)=>m.visible).map((m:any)=>m.weapon)).toEqual(['sniper']);
    await expect(page.locator('tr[data-weapon="sniper"]')).toHaveClass(/active/);
    await expect(page.locator('#legacy-score')).toHaveText('5');
    await expect(page.locator('#chat-log > div').first()).toHaveText('Ammo for the pistol.');
    await expect.poll(()=>fixture.removalDelivered).toBe(true);
    expect(fixture.heldSnapshots).toBeGreaterThan(0);
    expect(fixture.collections).toEqual([{type:'collect',itemId:drop.id}]);
    expect(fixture.room.getSnapshot(matchServerNow()).drops).toEqual([]);
    const collected=fixture.messages.find(m=>m.type==='event'&&m.event.type==='collected');
    expect(collected).toMatchObject({event:{data:{playerId:before.clientId,itemId:drop.id,kind:'weapon',weapon:'pistol',score:5}}});
    const pickupLoadout=fixture.messages.find(m=>m.type==='loadout'&&m.weapons.pistol.reserve===74);
    expect(pickupLoadout).toMatchObject({equipped:'sniper',unarmed:false,sourceDisplayedWeapon:'sniper',weapons:{sniper:{ammo:28,reserve:14},pistol:{ammo:8,reserve:74}},reload:{weapon:'sniper'}});
    await expect.poll(()=>page.evaluate((start)=>(window as any).__RA_ORIGINAL_AUDIO__.events.slice(start).filter((e:any)=>e.kind==='start'&&e.name==='reak47').length,audioBefore)).toBe(1);
    const audio=await page.evaluate((start)=>(window as any).__RA_ORIGINAL_AUDIO__.events.slice(start),audioBefore);
    expect(audio.filter((e:any)=>e.kind==='start'&&e.name==='repistol')).toEqual([]);
    expect(fixture.messages.filter(m=>m.type==='error')).toEqual([]);expect(fixture.failures).toEqual([]);expect(errors).toEqual([]);
    const out=testInfo.outputPath('cross-weapon-pickup');await mkdir(out,{recursive:true});
    await page.screenshot({path:`${out}/after.png`});
    await writeFile(`${out}/evidence.json`,JSON.stringify({map,before,drop,after,messages:fixture.messages,collections:fixture.collections,audio,errors,failures:fixture.failures,networkGap:{minimumRemovalDelayMs:200,heldSnapshots:fixture.heldSnapshots,removalDelivered:fixture.removalDelivered},limits:'Drop placement, socket redirection and withholding snapshots for 200ms after collection receipt are fixture setup. Normal source spawn inventory, physical numeric selection, automatic collection, authoritative reload/refund, model selection, HUD and decoded reload audio use production gameplay. No production clock, retry or freshness limit is changed. Native GI bounds, callback wall-clock timing and original raster equality remain unproved.'},null,2));
  }finally{await fixture.close();}
});
