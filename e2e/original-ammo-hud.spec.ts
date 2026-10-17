import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {ORIGINAL_AMMO_HUD_SLOTS,originalAmmoHudText} from '../shared/originalAmmoHudText';
import type {ClientMessage,ShootMessage,LoadoutMessage} from '../shared/protocol';

for(const map of ['barrack','woodlands'] as const)test(`${map} source ammunition text keeps original spacing and live fire reload counts`,async({page})=>{
  test.setTimeout(100_000);
  const errors:string[]=[],serverErrors:unknown[]=[],loadouts:LoadoutMessage[]=[],shots:Array<ShootMessage['shot']>=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>{
    socket.on('framesent',({payload})=>{const message=JSON.parse(String(payload)) as ClientMessage;if(message.type==='shoot')shots.push(message.shot);});
    socket.on('framereceived',({payload})=>{const message=JSON.parse(String(payload));if(message.type==='error')serverErrors.push(message);if(message.type==='loadout')loadouts.push(message);});
  });
  await page.addInitScript(()=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
  });
  await page.setViewportSize({width:800,height:600});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#deploy').click();
  await page.locator('#room-code').fill('AMMOUI'+Date.now().toString(36));await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  if(!await page.evaluate(()=>!!document.pointerLockElement))await page.locator('#game canvas').click();
  await page.keyboard.down('Digit3');await expect(page.locator('tr[data-weapon="rifle"]')).toHaveClass(/active/);await page.keyboard.up('Digit3');
  const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
  const initial=await read();
  for(const {weapon} of ORIGINAL_AMMO_HUD_SLOTS){
    const actual=await page.locator(`tr[data-weapon="${weapon}"]`).textContent();
    expect(actual).toBe(originalAmmoHudText(weapon,initial.loadout.ammo[weapon],initial.loadout.reserve[weapon]));
    const color=await page.locator(`tr[data-weapon="${weapon}"]`).evaluate(element=>getComputedStyle(element).color);
    expect(color).toBe(weapon==='rifle'?'rgb(255, 255, 0)':'rgb(255, 0, 0)');
  }
  const ammo=page.locator('#ammo-rifle');
  const shotsBefore=shots.length;
  await page.mouse.down();await expect(ammo).toHaveText(`${initial.loadout.ammo.rifle-1} / ${initial.loadout.reserve.rifle}`);await page.mouse.up();
  const fired=await read();
  await expect.poll(()=>shots.length-shotsBefore).toBe(initial.loadout.ammo.rifle-fired.loadout.ammo.rifle);
  const firedShots=shots.slice(shotsBefore);
  // The AK is automatic; releasing after observing its first decrement can
  // include another callback. Every transmitted shot must consume one round.
  expect(firedShots.length).toBeGreaterThan(0);expect(firedShots.every(shot=>shot.weapon==='rifle')).toBe(true);
  expect(fired.loadout.ammo.rifle).toBe(initial.loadout.ammo.rifle-firedShots.length);
  expect(await ammo.textContent()).toBe(`${fired.loadout.ammo.rifle} / ${initial.loadout.reserve.rifle}`);
  await expect.poll(()=>firedShots.every(shot=>loadouts.some(message=>message.ackShotId===shot.shotId))).toBe(true);
  const lastShotAck=loadouts.filter(message=>firedShots.some(shot=>message.ackShotId===shot.shotId)).at(-1)!;
  expect(lastShotAck.weapons.rifle).toEqual({ammo:fired.loadout.ammo.rifle,reserve:initial.loadout.reserve.rifle});
  await page.keyboard.down('KeyR');await expect(ammo).toHaveText(`${initial.loadout.ammo.rifle} / ${initial.loadout.reserve.rifle-firedShots.length}`);await page.keyboard.up('KeyR');
  await expect.poll(()=>loadouts.some(message=>message.serverTime>lastShotAck.serverTime&&message.weapons.rifle.ammo===initial.loadout.ammo.rifle&&message.weapons.rifle.reserve===initial.loadout.reserve.rifle-firedShots.length)).toBe(true);
  const reloaded=await read();expect(reloaded.loadout.ammo.rifle).toBe(initial.loadout.ammo.rifle);
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});
  const measurements=[];
  for(const viewport of [{width:800,height:600},{width:1280,height:576},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    const panel=await page.locator('.weapon-table-panel').boundingBox();
    // CSS positions quantize to1/64px; retain a subpixel tolerance.
    expect(panel!.x).toBeCloseTo(40/800*viewport.width,1);expect(panel!.y).toBeCloseTo(19/600*viewport.height,1);
    expect(panel!.width).toBeCloseTo(128/800*viewport.width,1);expect(panel!.height).toBeCloseTo(128/600*viewport.height,1);
    const rows=await page.locator('.weapon-table tr').evaluateAll(rows=>rows.map(row=>{
      const range=document.createRange();range.selectNodeContents(row);const ink=range.getBoundingClientRect();
      const box=row.getBoundingClientRect(),style=getComputedStyle(row);
      return {text:row.textContent,x:box.x,y:box.y,height:box.height,right:ink.right,fontSize:style.fontSize,lineHeight:style.lineHeight,color:style.color};
    }));
    expect(rows).toHaveLength(6);
    for(const [index,row] of rows.entries()){
      expect(row.y).toBeCloseTo((19+15*index)/600*viewport.height,1);
      expect(row.height).toBeCloseTo(15/600*viewport.height,1);
      expect(row.fontSize).toBe('12px');expect(row.lineHeight).toBe('15px');
      expect(row.right).toBeLessThanOrEqual(panel!.x+panel!.width+.1);
    }
    await page.screenshot({path:`${out}/${map}-source-ammo-ui-${viewport.width}x${viewport.height}.png`});
    measurements.push({viewport,panel,rows});
  }
  expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
  await writeFile(`${out}/${map}-source-ammo-ui-browser.json`,JSON.stringify({map,initial,fired,reloaded,firedShots,lastShotAck,loadouts,measurements,errors,serverErrors},null,2));
});
