import {expect,test,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {MatchRoom} from '../server/match-room';
import {matchServerNow} from '../server/clock';
import {parseClientMessage,PROTOCOL_VERSION,type MessagePeer,type ServerMessage,type WeaponId} from '../server/protocol';
import type {WeaponDropSnapshot} from '../shared/protocol';

test.setTimeout(120_000);
const out='artifacts/fidelity-review/2026-10-01/current';
const ids:WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
type FixtureActor={ammo:Record<WeaponId,number>;reserve:Record<WeaponId,number>;transform:{weapon:WeaponId};sourceDisplayedWeapon:WeaponId|null;sourceCounterWeapon:WeaponId};

async function authority(map:'barrack'|'woodlands',initialWeapon:WeaponId='launcher'){
  const room=new MatchRoom('UNARMED',{map,now:matchServerNow});
  const server=new WebSocketServer({port:0,host:'127.0.0.1'}),messages:ServerMessage[]=[],requests:unknown[]=[];
  await new Promise<void>(resolve=>server.once('listening',resolve));
  server.on('connection',socket=>{
    let playerId:string|null=null;
    const peer:MessagePeer={send(message){
      // Seed a depleted armed inventory before its first canonical loadout.
      // Subsequent selection, reload, gun callbacks and pickup are real gameplay.
      if(message.type==='welcome'){
        const actor=(room as unknown as {players:Map<string,FixtureActor>}).players.get(message.clientId)!;
        for(const id of ids){actor.ammo[id]=0;actor.reserve[id]=0;}
        actor.transform.weapon=initialWeapon;actor.sourceDisplayedWeapon=initialWeapon;actor.sourceCounterWeapon=initialWeapon;
        message.player.transform.weapon=initialWeapon;
      }
      messages.push(message);if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));
    }};
    socket.on('message',raw=>{
      const message=parseClientMessage(raw.toString());if(!message)throw Error('Invalid unarmed fixture request');
      requests.push(message);
      if(message.type==='join'){
        if(message.protocol!==PROTOCOL_VERSION)throw Error('Unarmed fixture protocol mismatch');
        const result=room.join(peer,message.name,matchServerNow(),message.resumeToken,message.sourceRemoteView);
        if(!result.ok)throw Error(result.message);playerId=result.player.id;
      }else if(playerId){room.handleMessage(playerId,message,matchServerNow(),peer);if(message.type==='leave')playerId=null;}
    });
    socket.on('close',()=>{if(playerId)room.suspend(playerId,matchServerNow(),peer);});
  });
  const timer=setInterval(()=>room.tick(matchServerNow()),50);
  return {messages,requests,port:(server.address() as {port:number}).port,
    pickup(playerId:string){
      const player=room.getSnapshot(matchServerNow()).players.find(p=>p.id===playerId);
      if(!player)throw Error('Missing pickup fixture player');
      const drop:WeaponDropSnapshot={id:'same-slot-source-pickup',weapon:'launcher',position:{...player.transform.position,y:player.transform.position.y+1.55},expiresAt:null};
      (room as unknown as {drops:Map<string,WeaponDropSnapshot>}).drops.set(drop.id,drop);
    },
    async close(){clearInterval(timer);for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));},
  };
}

async function prepare(page:Page,map:string,port:number){
  await page.setViewportSize({width:800,height:600});
  await page.addInitScript(({port})=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
    const Native=window.WebSocket;
    window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(String(url).replace(':8081',`:${port}`),protocols);}};
  },{port});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
  await page.locator('#callsign').fill('DEPLETED');await page.locator('#mode-online').click();await page.locator('#deploy').click();
  await page.locator('#room-code').fill('UNARMED');await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  // Clicking the canvas would already run the empty firing branch, obscuring R.
  await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('#game canvas')!.requestPointerLock());
}
const read=(page:Page)=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
function displayed(state:any,weapon:WeaponId|null){
  expect(state.originalWeapon.displayedWeapon).toBe(weapon);
  expect(state.originalWeapon.models).toHaveLength(6);
  expect(state.originalWeapon.models.map((model:{weapon:WeaponId})=>model.weapon).sort()).toEqual([...ids].sort());
  for(const model of state.originalWeapon.models)expect(model.visible).toBe(model.weapon===weapon);
}

for(const map of ['barrack','woodlands'] as const)for(const input of ['manual-r','held-fire'] as const)
test(`${map} source ${input} depleted display and same-slot pickup`,async({page})=>{
  const fixture=await authority(map),errors:string[]=[],serverErrors:unknown[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>socket.on('framereceived',frame=>{const message=JSON.parse(String(frame.payload));if(message.type==='error')serverErrors.push(message);}));
  try{
    await prepare(page,map,fixture.port);
    await expect.poll(async()=>(await read(page)).loadout.authoritativeUpdates).toBeGreaterThan(0);
    const before=await read(page);expect(before.loadout.unarmed).toBe(false);
    displayed(before,'launcher');
    for(const id of ids){expect(before.loadout.ammo[id]).toBe(0);expect(before.loadout.reserve[id]).toBe(0);}
    await expect(page.locator('tr[data-weapon="launcher"]')).toHaveClass(/active/);
    await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/${map}-unarmed-${input}-before.png`});
    if(input==='manual-r')await page.keyboard.down('r');else await page.mouse.down();
    await expect.poll(async()=>(await read(page)).loadout.unarmed).toBe(true);
    if(input==='manual-r')await page.keyboard.up('r');else await page.mouse.up();
    await expect.poll(()=>fixture.messages.filter(m=>m.type==='loadout'&&m.unarmed===true).length).toBeGreaterThan(0);
    const depleted=await read(page);
    displayed(depleted,input==='manual-r'?'launcher':null);
    const loadout=fixture.messages.filter(m=>m.type==='loadout').at(-1)!;
    expect(loadout).toMatchObject({unarmed:true,equipped:'launcher',sourceDisplayedWeapon:input==='manual-r'?'launcher':null});
    const reloads=fixture.requests.filter((m:any)=>m.type==='reload') as Array<{sourceSortAfterReload?:boolean}>;
    expect(reloads.length).toBeGreaterThan(0);
    expect(reloads[0].sourceSortAfterReload).toBe(input==='held-fire'?true:undefined);
    if(input==='manual-r')await expect(page.locator('tr[data-weapon="launcher"]')).toHaveClass(/active/);
    else await expect(page.locator('tr[data-weapon].active')).toHaveCount(0);
    await page.screenshot({path:`${out}/${map}-unarmed-${input}-depleted.png`});
    fixture.pickup(before.clientId);
    await expect.poll(async()=>(await read(page)).loadout.unarmed).toBe(false);
    await expect.poll(async()=>(await read(page)).loadout.ammo.launcher).toBe(6);
    await expect(page.locator('tr[data-weapon="launcher"]')).toHaveClass(/active/);
    await expect(page.locator('#chat-log > div').first()).toHaveText('Ammo for the rg6.');
    await expect(page.locator('#chat-log > div').first()).toHaveCSS('color','rgb(255, 255, 0)');
    const feedback=await page.locator('#chat-log').innerText();
    const restored=await read(page);
    displayed(restored,'launcher');
    expect(restored.loadout.equipped).toBe(before.loadout.equipped);
    expect(fixture.messages.filter(m=>m.type==='loadout').at(-1)).toMatchObject({unarmed:false,equipped:'launcher',sourceDisplayedWeapon:'launcher'});
    expect(fixture.requests).toContainEqual({type:'collect',itemId:'same-slot-source-pickup'});
    await page.screenshot({path:`${out}/${map}-unarmed-${input}-restored.png`});
    await writeFile(`${out}/${map}-unarmed-${input}.json`,JSON.stringify({map,input,before,depleted,restored,feedback,requests:fixture.requests,loadouts:fixture.messages.filter(m=>m.type==='loadout'),errors,serverErrors,limits:'Inventory and pickup placement are fixture setup. R, held fire, reload transport, canonical loadout, collection, all six model visibility flags and HUD are actual gameplay. These tests cover online reconstructed gameplay; native Director callback latency and rendering remain unmeasured.'},null,2));
    expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
  }finally{await fixture.close();}
});

for(const map of ['barrack','woodlands'] as const)test(`${map} exhausted sniper reload precedes simultaneous Shift scope creation`,async({page})=>{
  const fixture=await authority(map,'sniper'),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await prepare(page,map,fixture.port);
    await expect.poll(async()=>(await read(page)).loadout.equipped).toBe('sniper');
    await expect.poll(async()=>(await read(page)).loadout.authoritativeUpdates).toBeGreaterThan(0);
    // Dispatch both inputs in one browser task so no movie callback can run
    // between them. Record each render frame, including the first callback.
    await page.evaluate(()=>{
      const w=window as any;w.__scopeReloadFrames=[];w.__scopeReloadRecording=true;
      const sample=()=>{if(!w.__scopeReloadRecording)return;w.__scopeReloadFrames.push(w.__RA_MULTIPLAYER_DEBUG__.snapshot().sourceScope);requestAnimationFrame(sample);};
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR',key:'r',bubbles:true}));
      document.dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft',key:'Shift',shiftKey:true,bubbles:true}));
      requestAnimationFrame(sample);
    });
    await expect.poll(async()=>(await read(page)).loadout.unarmed).toBe(true);
    await expect.poll(()=>page.evaluate(()=>(window as any).__scopeReloadFrames.length)).toBeGreaterThan(5);
    const frames=await page.evaluate(()=>{const w=window as any;w.__scopeReloadRecording=false;document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyR',key:'r',bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{code:'ShiftLeft',key:'Shift',bubbles:true}));return w.__scopeReloadFrames;});
    expect(frames.every((frame:any)=>!frame.active&&frame.fov===50&&frame.zoomonce===1)).toBe(true);
    await expect(page.locator('#scope-overlay')).not.toHaveClass(/active/);
    expect(fixture.requests).toContainEqual({type:'reload',weapon:'sniper'});
    await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-exhausted-sniper-reload-scope.json`,JSON.stringify({map,frames,requests:fixture.requests,errors,limits:'Inventory/equipped weapon are fixture setup; simultaneous browser keys, Game callbacks and reload transport are actual reconstructed gameplay. Native actor scheduling remains unmeasured.'},null,2));
    expect(errors).toEqual([]);
  }finally{await fixture.close();}
});
