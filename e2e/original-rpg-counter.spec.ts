import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {originalProjectileRotationMatchesDirection} from '../shared/originalProjectileOrientation';
import {installOriginalAudioProbe} from './original-audio-probe';

test.setTimeout(90_000);
for(const map of ['barrack','woodlands'])for(const mode of ['solo','online'])test(`${map} ${mode} held RPG preserves loaded shot, empty gate and delayed refill`,async({page})=>{
  const errors:string[]=[],serverErrors:any[]=[],loadouts:any[]=[],spawns:any[]=[],outgoing:any[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>{socket.on('framesent',({payload})=>outgoing.push(JSON.parse(String(payload))));socket.on('framereceived',({payload})=>{const message=JSON.parse(String(payload));if(message.type==='error')serverErrors.push(message);if(message.type==='loadout')loadouts.push(message);if(message.type==='event'&&message.event.type==='projectile_spawned')spawns.push(message.event);});});
  await page.addInitScript(installOriginalAudioProbe);
  await page.addInitScript(()=>{let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator(`#mode-${mode}`).click();await page.locator('#deploy').click();
  if(mode==='online'){await page.locator('#room-code').fill('RPG'+Date.now().toString(36));await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');}
  if(!await page.evaluate(()=>!!document.pointerLockElement))await page.locator('#game canvas').click();
  const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
  const audio=()=>page.evaluate(()=>(window as any).__RA_ORIGINAL_AUDIO__);
  await page.keyboard.down('Digit5');await expect(page.locator('tr[data-weapon="rpg"]')).toHaveClass(/active/);await page.keyboard.up('Digit5');
  await expect.poll(async()=>(await read()).loadout.sourceCounter.ready,{timeout:6000}).toBe(true);
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(0,1.4));
  const before=await read();expect(before.loadout.ammo.rpg).toBe(1);expect(before.loadout.reserve.rpg).toBe(12);
  await page.evaluate(()=>{const w=window as any;w.__RPG_COUNTER_FRAMES__=[];w.__RPG_COUNTER_STOP__=false;function sample(){if(w.__RPG_COUNTER_STOP__)return;const s=w.__RA_MULTIPLAYER_DEBUG__.snapshot();w.__RPG_COUNTER_FRAMES__.push({at:performance.now(),loadout:s.loadout,alive:s.local.alive,projectiles:s.originalExplosives.projectiles,effects:s.originalCombatVisuals});requestAnimationFrame(sample);}requestAnimationFrame(sample);});
  await page.mouse.down();
  let observationError:unknown;
  try{await expect.poll(async()=>(await audio()).events.filter((event:any)=>event.kind==='start'&&event.name==='offrock').length,{timeout:8000,intervals:[20]}).toBeGreaterThanOrEqual(2);}catch(error){observationError=error;}finally{await page.mouse.up();}
  const after=await read(),observed=await audio();
  const frames=await page.evaluate(()=>{const w=window as any;w.__RPG_COUNTER_STOP__=true;return w.__RPG_COUNTER_FRAMES__;});
  frames.push({at:await page.evaluate(()=>performance.now()),loadout:after.loadout,alive:after.local.alive,projectiles:after.originalExplosives.projectiles});
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-${mode}-source-rpg-counter.json`,JSON.stringify({map,mode,before,after,frames,observed,loadouts,spawns,outgoing,errors,serverErrors,observationError:observationError?String(observationError):null},null,2));
  if(observationError)throw observationError;
  expect(frames.some((frame:any)=>frame.loadout.ammo.rpg===0&&frame.loadout.reserve.rpg===12)).toBe(true);
  expect(frames.some((frame:any)=>frame.loadout.ammo.rpg===1&&frame.loadout.reserve.rpg===11)).toBe(true);
  expect(frames.some((frame:any)=>frame.loadout.ammo.rpg===0&&frame.loadout.reserve.rpg===11)).toBe(true);
  expect(frames.some((frame:any)=>frame.effects?.some((effect:any)=>effect.kind==='puff'))).toBe(true);
  const launches=observed.events.filter((event:any)=>event.kind==='start'&&event.name==='offrock');
  expect(launches).toHaveLength(2);
  const cycleCallbacks=map==='barrack'?62:40;
  expect(launches[1].time-launches[0].time).toBeGreaterThan((cycleCallbacks-1)*1000/30-.1);
  if(mode==='online'){
    expect(spawns).toHaveLength(2);expect(outgoing.filter(message=>message.type==='reload')).toEqual([]);
    const fired=outgoing.filter(message=>message.type==='shoot');expect(fired).toHaveLength(2);
    for(let i=0;i<2;i++){
      expect(fired[i].shot.sourceRotation).toBeDefined();
      expect(originalProjectileRotationMatchesDirection(fired[i].shot.sourceRotation,fired[i].shot.direction)).toBe(true);
      expect(spawns[i].data.projectile.sourceRotation).toEqual(fired[i].shot.sourceRotation);
    }
    const shots=loadouts.filter(message=>message.ackShotId&&message.equipped==='rpg');expect(shots).toHaveLength(2);
    expect(shots[0].weapons.rpg).toEqual({ammo:0,reserve:12});expect(shots[1].weapons.rpg).toEqual({ammo:0,reserve:11});
    if(map==='barrack')expect(shots[0].sourceCounter.waitgun-shots[0].sourceCounter.poldwaitgun).toBe(-20);else expect(shots[0].sourceCounter.waitgun).toBe(10);
    expect(spawns[1].serverTime-spawns[0].serverTime).toBeGreaterThan((cycleCallbacks-1)*1000/30-.1);
    expect(loadouts.some(message=>!message.ackShotId&&message.weapons.rpg.ammo===1&&message.weapons.rpg.reserve===11)).toBe(true);
  }
  expect(after.local.alive).toBe(true);expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
});
