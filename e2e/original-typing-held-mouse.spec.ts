import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test.setTimeout(120_000);
const out='artifacts/fidelity-review/2026-10-01/current';
for(const map of ['barrack','woodlands'])for(const close of ['Enter','Tab'])test(`${map} ${close} retains source held mouse across talk`,async({page})=>{
  const errors:string[]=[],serverErrors:unknown[]=[],shots:any[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('websocket',socket=>socket.on('framereceived',frame=>{const m=JSON.parse(String(frame.payload));if(m.type==='error')serverErrors.push(m);if(m.type==='event'&&m.event.type==='shot')shots.push(m.event);}));
  await page.addInitScript(()=>{let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('MOUSE'+Date.now().toString(36));await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('#game canvas')!.requestPointerLock());
  await page.keyboard.down('Digit1');await expect(page.locator('tr[data-weapon="pistol"]')).toHaveClass(/active/);await page.keyboard.up('Digit1');
  const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
  const cases:any[]=[];
  try{
    for(const button of ['left','right'] as const)for(const scenario of ['held-before','held-during','released-during']){
      await page.mouse.move(700,450);await page.mouse.up({button});
      if(scenario==='held-before')await page.mouse.down({button});
      await page.keyboard.press('Tab');await expect(page.locator('#chat-input')).toBeFocused();
      if(scenario!=='held-before')await page.mouse.down({button});
      if(scenario==='released-during')await page.mouse.up({button});
      await expect.poll(async()=>(await read()).authoritativeLocal?.typing).toBe(true);
      await page.waitForTimeout(200);const typing=await read(),beforeShots=shots.length;
      await page.waitForTimeout(200);expect(shots.length).toBe(beforeShots);expect((await read()).loadout.ammo.pistol).toBe(typing.loadout.ammo.pistol);
      expect(typing.movement.pointerCaptured).toBe(true);expect(typing.sourceScope.active).toBe(false);await expect(page.locator('#chat-input')).toBeFocused();
      await page.keyboard.press(close);await expect(page.locator('#chat-form')).not.toBeVisible();
      await expect.poll(async()=>(await read()).authoritativeLocal?.typing).toBe(false);
      if(button==='left'&&scenario!=='released-during')await expect.poll(()=>shots.length).toBeGreaterThan(beforeShots);
      if(button==='right')await expect.poll(async()=>(await read()).authoritativeLocal?.sourceInput?.forward).toBe(scenario!=='released-during');
      const resumed=await read();
      if(button==='left'&&scenario==='released-during'){await page.waitForTimeout(200);expect(shots.length).toBe(beforeShots);expect((await read()).loadout.ammo.pistol).toBe(typing.loadout.ammo.pistol);}
      await page.mouse.up({button});
      if(button==='right')await expect.poll(async()=>(await read()).authoritativeLocal?.sourceInput?.forward).toBe(false);
      await page.waitForTimeout(200);const released=await read(),settledShots=shots.length;await page.waitForTimeout(200);
      expect(shots.length).toBe(settledShots);expect((await read()).loadout.ammo.pistol).toBe(released.loadout.ammo.pistol);
      cases.push({button,scenario,typing,resumed,released,shots:shots.slice(beforeShots)});
    }
    await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-typing-held-mouse-${close.toLowerCase()}.json`,JSON.stringify({map,close,cases,errors,serverErrors,limits:'Real mouse down/up and Enter/Tab with focused input; pointer-lock shim. Authority forward intent alone does not prove supported impulse; actual Game callback tests cover it separately. Native host timing/emulation remain unmeasured.'},null,2));
    expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
  }finally{await page.mouse.up({button:'left'});await page.mouse.up({button:'right'});}
});
