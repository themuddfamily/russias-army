import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {installOriginalAudioProbe} from './original-audio-probe';
import {originalFireSound,originalReloadSound} from '../src/originalCombatAudio';

test.setTimeout(120_000);
for(const map of ['barrack','woodlands'])test(`${map} actual six-weapon firing and reload use recovered combat samples`,async({page})=>{
  const errors:string[]=[],serverErrors:any[]=[],shots:any[]=[],launches:any[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>socket.on('framereceived',({payload})=>{const message=JSON.parse(String(payload));if(message.type==='error')serverErrors.push(message);if(message.type==='event'&&message.event.type==='shot')shots.push(message.event);if(message.type==='event'&&message.event.type==='projectile_spawned')launches.push(message.event);}));
  await page.addInitScript(installOriginalAudioProbe);
  await page.addInitScript(()=>{let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('AUDIO'+Date.now().toString(36));await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');if(!await page.evaluate(()=>!!document.pointerLockElement))await page.locator('#game canvas').click();
  const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
  const audio=()=>page.evaluate(()=>(window as any).__RA_ORIGINAL_AUDIO__);
  await expect.poll(async()=>Object.keys((await audio()).decoded).length).toBe(12);
  const samples:any[]=[];
  for(const [weapon,slot] of [['pistol',1],['shotgun',2],['rifle',3],['sniper',6],['launcher',4],['rpg',5]] as const){
    await page.keyboard.down(`Digit${slot}`);await expect(page.locator(`tr[data-weapon="${weapon}"]`)).toHaveClass(/active/);await page.keyboard.up(`Digit${slot}`);
    await expect.poll(async()=>(await read()).loadout.sourceCounter.ready,{timeout:6000}).toBe(true);
    await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(0,1.4));
    const before=(await audio()).events.length;
    await page.mouse.down();await page.waitForTimeout(60);await page.mouse.up();
    await expect.poll(()=>shots.some(event=>event.data.shot.weapon===weapon)||launches.some(event=>event.data.projectile.weapon===weapon),{timeout:6000}).toBe(true);
    await expect.poll(async()=>(await audio()).events.slice(before).some((event:any)=>event.kind==='start'&&event.name===originalFireSound(weapon))).toBe(true);
    const fired=await audio();await page.keyboard.down('KeyR');await page.waitForTimeout(60);await page.keyboard.up('KeyR');
    await expect.poll(async()=>(await audio()).events.slice(fired.events.length).some((event:any)=>event.kind==='start'&&event.name===originalReloadSound(weapon))).toBe(true);
    samples.push({weapon,events:(await audio()).events.slice(before),state:await read()});
  }
  await expect.poll(async()=>(await audio()).events.some((event:any)=>event.kind==='start'&&event.name==='boomnew'),{timeout:8000}).toBe(true);
  const final=await read(),observed=await audio();expect(final.local.alive).toBe(true);
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-combat-audio.json`,JSON.stringify({map,samples,shots,launches,observed,final,errors,serverErrors},null,2));
  expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
});
