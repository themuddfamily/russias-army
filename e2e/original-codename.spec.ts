import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {ORIGINAL_CODENAME_REJECTION} from '../shared/originalCodename';

test.setTimeout(90_000);
for(const map of ['barrack','woodlands'] as const)test(`${map} filters actual entry, joins with source codename and retains it through Replay`,async({page})=>{
 const errors:string[]=[],packets:any[]=[],requests:any[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('websocket',socket=>{
  socket.on('framereceived',frame=>packets.push(JSON.parse(String(frame.payload))));
  socket.on('framesent',frame=>requests.push(JSON.parse(String(frame.payload))));
 });
 await page.addInitScript(()=>{
  let locked:Element|null=null;
  Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
  Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
  Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
 });
 const out='artifacts/fidelity-review/2026-10-02/current/codename-browser';await mkdir(out,{recursive:true});
 try{
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
  await page.locator('#mode-online').click();await page.locator('#callsign').fill('!!! é');await page.locator('#deploy').click();
  await expect(page.locator('#entry-note')).toHaveText(ORIGINAL_CODENAME_REJECTION);
  await expect(page.locator('#callsign')).toHaveValue('');await expect(page.locator('#menu')).toHaveAttribute('data-stage','entry');
  await page.locator('#callsign').fill('A B!0');await page.locator('#deploy').click();
  await expect(page.locator('#callsign')).toHaveValue('AB0');await expect(page.locator('#room-callsign')).toHaveText('AB0');
  await page.locator('#room-code').fill(`CN${map[0]}${Date.now().toString(36)}`);await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});
  await expect.poll(()=>packets.find(p=>p.type==='welcome')?.player.name).toBe('AB0');
  expect(requests.find(p=>p.type==='join').name).toBe('AB0');
  await page.locator('#game canvas').click();await page.keyboard.press('Escape');
  await expect(page.locator('#result')).not.toHaveClass(/hidden/,{timeout:10_000});
  await expect(page.locator('#result-kicker')).toContainText('Comrade AB0');
  await page.locator('#restart').click();await expect(page.locator('#menu-entry')).toBeVisible();
  await expect(page.locator('#callsign')).toHaveValue('AB0');
  await page.screenshot({path:`${out}/${map}-replay.png`});
  expect(errors).toEqual([]);expect(packets.filter(p=>p.type==='error')).toEqual([]);
 }finally{
  const state=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__?.snapshot()).catch(()=>null);
  await writeFile(`${out}/${map}.json`,JSON.stringify({map,errors,packets,requests,state,limits:'Real text entry, room selection, join, Escape and Replay. Pointer capture uses the existing browser shim. Native symbol capitalization and alert presentation remain qualified.'},null,2));
 }
});
