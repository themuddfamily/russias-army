import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test.setTimeout(60_000);test.use({viewport:{width:1280,height:576}});
async function setup(page:any,map:string,online:boolean){
 await page.addInitScript(()=>{
  localStorage.setItem('russias-army-settings',JSON.stringify({controls:'modern',arrows:true,sensitivity:1,volume:0}));
  let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
  Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
 });
 await page.goto(`/?map=${map}&e2e=1&quality=low`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
 await page.locator(`#mode-${online?'online':'solo'}`).click();await page.locator('#deploy').click();
 if(online){await page.locator('#room-code').fill('MODERN'+Date.now().toString(36).toUpperCase());await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});}
 await page.locator('#game canvas').click();
}
for(const map of ['barrack','woodlands']){
 test(`${map} Modern sprint and aim modes reach authoritative source movement`,async({page})=>{
  const errors:string[]=[],serverErrors:unknown[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('websocket',s=>s.on('framereceived',f=>{const m=JSON.parse(String(f.payload));if(m.type==='error')serverErrors.push(m);}));
  await setup(page,map,true);const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
  expect((await read()).controls).toBe('modern');
  await page.keyboard.down('KeyW');await page.keyboard.down('ShiftLeft');
  let sprint:any,walk:any,aim:any;
  try{
   await expect.poll(async()=>(await read()).authoritativeLocal?.movementMode).toBe('modern-sprint');sprint=await read();
   await page.keyboard.up('ShiftLeft');await expect.poll(async()=>(await read()).authoritativeLocal?.movementMode).toBe('modern-walk');walk=await read();
   await page.mouse.down({button:'right'});await expect.poll(async()=>(await read()).authoritativeLocal?.movementMode).toBe('modern-aim');aim=await read();
   expect(aim.aiming).toBe(true);expect(aim.authoritativeLocal.sourceInput.forward).toBe(true);
  }finally{await page.keyboard.up('ShiftLeft');await page.keyboard.up('KeyW');await page.mouse.up({button:'right'});}
  expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-modern-authority.json`,JSON.stringify({verified:true,sprint,walk,aim,errors,serverErrors},null,2));
 });
 test(`${map} Modern hand grenade moves and expires on the source callback clock`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,map,false);
  const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
  const before=await read();expect(before.authoredHandGrenades.remaining).toBe(3);
  await page.keyboard.press('KeyG');await expect.poll(async()=>(await read()).authoredHandGrenades.remaining).toBe(2);
  const first=await read();expect(first.authoredHandGrenades.projectiles).toHaveLength(1);
  await expect.poll(async()=>{
   const p=(await read()).authoredHandGrenades.projectiles[0],old=first.authoredHandGrenades.projectiles[0];
   return p?Math.hypot(p.position.x-old.position.x,p.position.y-old.position.y,p.position.z-old.position.z):0;
  }).toBeGreaterThan(.05);
  const flight=await read();expect(flight.authoredHandGrenades.projectiles[0].life).toBeLessThan(first.authoredHandGrenades.projectiles[0].life);
  await expect.poll(async()=>(await read()).authoredHandGrenades.projectiles.length,{timeout:5_000}).toBe(0);
  const after=await read();expect(after.authoredHandGrenades.remaining).toBe(2);expect(after.originalExplosives.blasts).toEqual([]);
  expect(after.loadout.ammo.launcher).toBe(before.loadout.ammo.launcher);expect(errors).toEqual([]);
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-modern-hand-grenade.json`,JSON.stringify({verified:true,before,first,flight,after,errors},null,2));
 });
}
