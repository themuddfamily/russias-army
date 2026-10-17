import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
test.setTimeout(120_000);
for(const map of ['barrack','woodlands'])test(`${map} held R maintains source lock and held pistol fires after release online`,async({page})=>{
 const errors:string[]=[],serverErrors:unknown[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('websocket',s=>s.on('framereceived',({payload})=>{try{const m=JSON.parse(String(payload));if(m.type==='error')serverErrors.push(m);}catch{}}));
 await page.addInitScript(()=>{let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});
 await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
 await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('SOURCEINPUT'+Date.now().toString(36));await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
 await page.locator('#game canvas').click();await page.keyboard.down('1');await expect(page.locator('tr[data-weapon="pistol"]')).toHaveClass(/active/);await page.keyboard.up('1');
 await page.keyboard.down('r');await page.waitForTimeout(1300);await page.mouse.down();await page.waitForTimeout(300);
 const held=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
 expect(held.loadout.ammo.pistol).toBe(8);expect(held.loadout.reserve.pistol).toBe(54);expect(held.loadout.reloading).toBe(true);expect(held.loadout.reloadRemaining).toBeGreaterThan(.5);
 await page.keyboard.up('r');
 try{await expect.poll(async()=>await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().loadout.ammo.pistol),{timeout:5000}).toBeLessThan(7);}finally{await page.mouse.up();}
 const released=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());expect(released.loadout.equipped).toBe('pistol');expect(released.local.alive).toBe(true);
 const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-held-reload-fire.json`,JSON.stringify({map,verified:true,held:held.loadout,released:released.loadout,errors,serverErrors},null,2));expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
});
