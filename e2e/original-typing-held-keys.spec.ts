import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test.setTimeout(90_000);
const out='artifacts/fidelity-review/2026-10-01/current';
for(const map of ['barrack','woodlands'])for(const close of ['Enter','Tab'])test(`${map} ${close} preserves physical W across source talk`,async({page})=>{
  const errors:string[]=[],serverErrors:unknown[]=[],sent:any[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>{
    socket.on('framesent',frame=>sent.push(JSON.parse(String(frame.payload))));
    socket.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);});
  });
  await page.addInitScript(()=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
  });
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('HELD'+Date.now().toString(36));await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('#game canvas')!.requestPointerLock());
  const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
  await expect.poll(async()=>(await read()).movement.grounded).toBe(true);
  const cases:any[]=[];
  for(const scenario of ['held-before','held-during','released-during']){
    await page.keyboard.up('KeyW');
    if(scenario==='held-before')await page.keyboard.down('KeyW');
    await page.keyboard.press('Tab');await expect(page.locator('#chat-input')).toBeFocused();
    if(scenario!=='held-before')await page.keyboard.down('KeyW');
    if(scenario==='released-during')await page.keyboard.up('KeyW');
    await expect.poll(async()=>(await read()).authoritativeLocal?.typing).toBe(true);
    const typing=await read();expect(typing.chatOpen).toBe(true);expect(typing.movement.pointerCaptured).toBe(true);
    if(scenario!=='released-during')expect(typing.movement.keys).toContain('KeyW');else expect(typing.movement.keys).not.toContain('KeyW');
    // A held physical key is transported, but source typing prevents its force.
    const beforeClose=sent.length;await page.keyboard.press(close);await expect(page.locator('#chat-form')).not.toBeVisible();
    await expect.poll(async()=>(await read()).authoritativeLocal?.typing).toBe(false);
    const resumed=await read();
    expect(resumed.movement.keys.includes('KeyW')).toBe(scenario!=='released-during');
    await expect.poll(async()=>(await read()).authoritativeLocal?.sourceInput?.forward).toBe(scenario!=='released-during');
    const delivered=sent.slice(beforeClose).filter(m=>m.type==='transform');
    expect(delivered.some(m=>m.transform.typing===false&&m.transform.sourceInput?.forward===(scenario!=='released-during'))).toBe(true);
    cases.push({scenario,typing,resumed,delivered});await page.keyboard.up('KeyW');
    await expect.poll(async()=>(await read()).authoritativeLocal?.sourceInput?.forward).toBe(false);
  }
  expect(errors).toEqual([]);expect(serverErrors).toEqual([]);await mkdir(out,{recursive:true});
  await writeFile(`${out}/${map}-source-typing-held-keys-${close.toLowerCase()}.json`,JSON.stringify({map,close,cases,errors,serverErrors,limits:'Real browser keyDown/keyUp, focused talk form and accepted authority sourceInput. Ground collision can prevent translation; actual supported impulse and held jump are verified separately in Game unit tests. Native host keyboard cadence remains unmeasured.'},null,2));
});

for(const map of ['barrack','woodlands'])test(`${map} held Control fires after source talk and stops on keyup`,async({page})=>{
  const errors:string[]=[],serverErrors:unknown[]=[],shots:any[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>socket.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);if(m.type==='event'&&m.event.type==='shot')shots.push(m.event);}));
  await page.addInitScript(()=>{
    const diagnostic:any[]=[];(window as any).__SOURCE_GUN_DIAGNOSTICS__=diagnostic;
    const NativeWebSocket=window.WebSocket;
    const capture=(direction:string,message:any)=>{if(message.type==='shoot'||message.type==='loadout'||message.type==='error'||message.type==='transform'){
      const state=(window as any).__RA_MULTIPLAYER_DEBUG__?.snapshot();
      diagnostic.push({direction,localNow:performance.now(),message:message.type==='transform'?{type:message.type,sequence:message.sequence,typing:message.transform.typing,weapon:message.transform.weapon}:message,timing:state?.sourceGunTiming,counter:state?.loadout.sourceCounter,chatOpen:state?.chatOpen});
      if(diagnostic.length>1000)diagnostic.shift();
    }};
    window.WebSocket=class extends NativeWebSocket {
      constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);this.addEventListener('message',event=>capture('received',JSON.parse(String(event.data))));}
      send(data:string|ArrayBufferLike|Blob|ArrayBufferView){if(typeof data==='string')capture('sent',JSON.parse(data));super.send(data);}
    };
    let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('CONTROL'+Date.now().toString(36));await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('#game canvas')!.requestPointerLock());
  const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
  await page.keyboard.down('Digit1');await expect(page.locator('tr[data-weapon="pistol"]')).toHaveClass(/active/);await page.keyboard.up('Digit1');
  const cases:any[]=[];
  for(const control of ['ControlLeft','ControlRight']){
    await page.keyboard.press('Tab');await expect(page.locator('#chat-input')).toBeFocused();
    const before=await read(),beforeShots=shots.length;await page.keyboard.down(control);await page.waitForTimeout(200);
    expect(shots.length).toBe(beforeShots);expect((await read()).loadout.ammo.pistol).toBe(before.loadout.ammo.pistol);
    // Submit the production form directly: SEND is visually hidden and host Ctrl chords are protected.
    await page.locator('#chat-form').evaluate(form=>(form as HTMLFormElement).requestSubmit());await expect(page.locator('#chat-form')).not.toBeVisible();
    await expect.poll(()=>shots.length).toBeGreaterThan(beforeShots);
    await page.keyboard.up(control);await expect.poll(async()=>(await read()).movement.keys.includes(control)).toBe(false);
    await page.waitForTimeout(200);const released=await read(),settledShots=shots.length;await page.waitForTimeout(200);
    expect(shots.length).toBe(settledShots);expect((await read()).loadout.ammo.pistol).toBe(released.loadout.ammo.pistol);
    cases.push({control,before,released,shots:shots.slice(beforeShots)});
  }
  await mkdir(out,{recursive:true});
  const diagnostics=await page.evaluate(()=>(window as any).__SOURCE_GUN_DIAGNOSTICS__);
  await writeFile(`${out}/${map}-source-control-fire-diagnostics.json`,JSON.stringify({map,cases,errors,serverErrors,diagnostics},null,2));
  expect(shots.every(shot=>shot.data.shot.weapon==='pistol')).toBe(true);expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
  await writeFile(`${out}/${map}-source-control-fire.json`,JSON.stringify({map,cases,errors,serverErrors,limits:'Real source Control key states, talk gate, direct requestSubmit fixture calling the production form listener and authority shot receipts. Host modifier chords retain browser shortcut policy; native keyboard and callback timing remain unmeasured.'},null,2));
});
