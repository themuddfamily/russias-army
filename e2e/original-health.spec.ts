import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {installOriginalAudioProbe} from './original-audio-probe';

test.setTimeout(90_000);test.use({viewport:{width:1280,height:576}});
for(const map of ['barrack','woodlands'])test(`${map} actual source blast damage preserves phase and ends life at its literal threshold`,async({page})=>{
 const errors:string[]=[],serverErrors:any[]=[],damage:any[]=[],snapshots:any[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('websocket',s=>s.on('framereceived',f=>{
  const m=JSON.parse(String(f.payload));if(m.type==='error')serverErrors.push(m);
  if(m.type==='snapshot')snapshots.push(m.snapshot);
  if(m.type==='event'&&m.event.type==='damaged')damage.push(m.event);
 }));
 await page.addInitScript(installOriginalAudioProbe);
 await page.addInitScript(()=>{
  let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
  Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
 });
 await page.goto(`/?map=${map}&e2e=1&quality=low`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
 await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('HEALTH'+Date.now().toString(36).toUpperCase());await page.locator('#join-room').click();
 await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});await page.locator('#game canvas').click();
 const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
 await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(-Math.PI/2,-1.5));await page.waitForTimeout(150);
 const before=await read();expect(before.sourceHealth.canonical).toBe(100);
 const fire=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.fireNetworkWeapon('launcher',-Math.PI/2,-1.5));
 await fire();await expect.poll(()=>damage.filter(e=>e.data.targetId===before.clientId).length,{timeout:8_000}).toBeGreaterThan(0);
 const overlay=page.locator('#original-hurt-overlay'),image=page.locator('#original-hurt-image');
 await expect(overlay).toBeVisible();await expect.poll(()=>overlay.evaluate(e=>Number(getComputedStyle(e).opacity))).toBeGreaterThan(0);
 await expect(image).toHaveAttribute('href',`/assets/original-effects/hurt-${map==='woodlands'?'woodland':'barrack'}.png`);
 if(map==='barrack'){await expect(overlay).toHaveAttribute('data-frame','271');await expect(image).toHaveAttribute('transform','matrix(0 -1 -1 0 64 64)');}
 else {
  // A live source callback can move the observer slightly before the blast.
  // Verify the exact resulting source angle rather than a fixed spawn angle.
  const directional=await read();
  await expect(image).toHaveAttribute('transform',`rotate(${directional.sourceHurt.sourceAngle+180} 64 64)`);
  expect(Math.abs(directional.sourceHurt.sourceAngle+90)).toBeLessThan(2);
 }
 const hurtCapture=await read();expect(hurtCapture.sourceHurt.blend).toBeGreaterThan(0);expect(hurtCapture.combatTransients.damageOpacity).toBe(0);
 await mkdir('artifacts/fidelity-review/2026-10-01/current',{recursive:true});await page.screenshot({path:`artifacts/fidelity-review/2026-10-01/current/${map}-source-hurt-overlay.png`});
 await expect.poll(()=>damage.filter(e=>e.data.targetId===before.clientId).length,{timeout:8_000}).toBe(16);
 await expect.poll(async()=>((await read()).sourceHurt.blend),{timeout:3000}).toBe(0);
 const survived=await read();expect(survived.local.health).toBe(20);expect(survived.sourceHealth.canonical).toBe(20);expect(survived.local.alive).toBe(true);
 if(map==='barrack'){
  await expect(page.locator('#barrack-health')).toHaveAttribute('data-source-frame','79');
  await expect.poll(()=>page.locator('#barrack-health').evaluate(element=>(element as HTMLImageElement).complete)).toBe(true);
 }
 await fire();await expect(page.locator('#result')).toBeVisible({timeout:8_000});await expect(page.locator('#result-title')).toHaveText('GAME OVER');
 const own=damage.filter(e=>e.data.targetId===before.clientId),fatal=own.at(-1);
 expect(own.every(e=>e.data.damage===5&&e.data.sourceHealth.canonical===e.data.health&&e.data.lethal===(e.data.health+2*e.data.sourceHealth.flick<0)&&e.data.sourceHealthTime<=e.serverTime)).toBe(true);
 expect(fatal.data.lethal).toBe(true);expect(fatal.data.health+2*fatal.data.sourceHealth.flick).toBeLessThan(0);
 expect(own.slice(0,-1).every(e=>e.data.lethal===false)).toBe(true);
 expect(snapshots.some(s=>Number.isFinite(s.sourceHealthTime)&&s.players.some((p:any)=>p.id===before.clientId&&p.sourceHealth?.canonical===20))).toBe(true);
 await page.waitForTimeout(1200);const dead=await read();expect(dead.local.alive).toBe(false);expect(dead.local.health).toBe(0);
 await page.locator('#restart').click();await expect(page.locator('#menu-entry')).toBeVisible();await page.locator('#deploy').click();await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
 const reentered=await read();expect(reentered.local.health).toBe(100);expect(reentered.sourceHealth.canonical).toBe(100);expect(reentered.clientId).not.toBe(before.clientId);
 const hurtAudio=await page.evaluate(()=>(window as any).__RA_ORIGINAL_AUDIO__.events.filter((e:any)=>e.name==='hurtme'));
 expect(hurtAudio.filter((e:any)=>e.kind==='start')).toHaveLength(own.length);
 expect(hurtAudio.filter((e:any)=>e.kind==='stop').length).toBeGreaterThanOrEqual(own.length-2);
 expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
 const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-health.json`,JSON.stringify({verified:true,before,hurtCapture,survived,damage:own,fatal,dead,reentered,snapshots,hurtAudio,errors,serverErrors},null,2));
});
