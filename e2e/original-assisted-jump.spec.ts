import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test.setTimeout(90_000);test.use({viewport:{width:800,height:600}});
for(const map of ['barrack','woodlands'] as const)for(const mode of ['solo','online'] as const)test(`${map} ${mode} successive actual RG6 source shots assist held jump`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const events:unknown[]=[];page.on('websocket',socket=>socket.on('framereceived',frame=>{
    const m=JSON.parse(String(frame.payload));if(m.type==='event'&&['projectile_spawned','projectile_contact','damaged','killed'].includes(m.event.type))events.push(m.event);
  }));
  await page.addInitScript(()=>{
    let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  });
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  if(mode==='online')await page.locator('#mode-online').click();await page.locator('#deploy').click();
  if(mode==='online'){await page.locator('#room-code').fill('ASST'+Date.now().toString(36));await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');}
  await page.locator('#game canvas').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().movement.grounded)).toBe(true);
  await page.keyboard.down('Digit4');await expect(page.locator('tr[data-weapon="launcher"]')).toHaveClass(/active/);await page.keyboard.up('Digit4');
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(0,-1.5));
  await page.evaluate(()=>{
    const debug=(window as any).__RA_MULTIPLAYER_DEBUG__;debug.enableSourceCallbackCapture();const initial=debug.snapshot();
    const review={initial,peak:initial.local.y,samples:[] as any[],shots:0,thirdShotAt:null as number|null,done:false};(window as any).__ASSISTED_REVIEW__=review;
    const sample=()=>{
      const s=debug.snapshot();review.peak=Math.max(review.peak,s.local.y);review.shots=Math.max(review.shots,6-s.loadout.ammo.launcher);
      review.samples.push({at:performance.now(),local:s.local,movement:s.movement,ammo:s.loadout.ammo.launcher,explosives:s.originalExplosives});
      if(review.shots>=3&&review.thirdShotAt===null){review.thirdShotAt=performance.now();document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));}
      // Retain the trajectory after the third launch so delayed contacts/apexes are sampled.
      if(!s.local.alive||(review.thirdShotAt!==null&&performance.now()-review.thirdShotAt>=2000)){review.done=true;return;}
      requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  });
  await page.keyboard.down('KeyW');await page.keyboard.down('Space');await page.mouse.down();
  try{await expect.poll(()=>page.evaluate(()=>(window as any).__ASSISTED_REVIEW__.done),{timeout:15_000}).toBe(true);}
  finally{
    await page.mouse.up();await page.keyboard.up('Space');await page.keyboard.up('KeyW');
    await page.waitForTimeout(500);
    const record=await page.evaluate(()=>({review:(window as any).__ASSISTED_REVIEW__,final:(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot(),callbackCapture:(window as any).__RA_MULTIPLAYER_DEBUG__.readSourceCallbackCapture()}));
    const out=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-${mode}-successive-assisted-jump.json`,JSON.stringify({map,mode,errors,events,...record},null,2));
    await page.screenshot({path:`${out}/${map}-${mode}-successive-assisted-jump.png`});
  }
  const review=await page.evaluate(()=>(window as any).__ASSISTED_REVIEW__);
  expect(review.shots).toBeGreaterThanOrEqual(2);expect(review.peak).toBeGreaterThan(review.initial.local.y+2);expect(errors).toEqual([]);
});
