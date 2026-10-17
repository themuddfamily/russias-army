import {ORIGINAL_WEAPON_LOAD_POSITION,ORIGINAL_WEAPON_POSES,ORIGINAL_WEAPON_UNIT_SCALE} from '../src/originalWeaponPresentation';
import {mkdir} from 'node:fs/promises';
import {expect,test} from '@playwright/test';

test.setTimeout(90_000);
interface AnimationState {position:number[];rotation:number[];magazinePosition:number[];ammo:number;reserve:number;refillStartedAt:number}

test('source AK equip and refill move the whole rigid rifle',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?map=woodlands&e2e=1&quality=low');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate(element=>{element.style.display='none';});
  const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});
  for(const kind of ['equip','refill'] as const){
    const samples:AnimationState[]=[];
    for(const progress of [0,.5,1]){
      const sample=await page.evaluate(({kind,progress})=>{
        const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setWeaponAnimationPresentation(kind:'equip'|'refill',progress:number):AnimationState|null}}).__RA_MULTIPLAYER_DEBUG__;
        if(!debug)throw new Error('Animation review hook missing');return debug.setWeaponAnimationPresentation(kind,progress);
      },{kind,progress});
      expect(sample).not.toBeNull();samples.push(sample!);
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const path=`${out}/woodlands-ak-${kind}-${progress}.png`;await page.screenshot({path});
      await testInfo.attach(`AK ${kind} ${progress}`,{path,contentType:'image/png'});
    }
    expect(samples[0].position[1]).toBeLessThan(samples[1].position[1]);
    expect(samples[1].position[1]).toBeLessThan(samples[2].position[1]);
    expect(samples[0].position[0]).toBeLessThan(samples[2].position[0]);
    expect(samples[0].rotation[2]).toBe(0);
    for(let i=0;i<3;i++){
      expect(samples[0].position[i]).toBeCloseTo(ORIGINAL_WEAPON_LOAD_POSITION[i]*ORIGINAL_WEAPON_UNIT_SCALE,7);
      const expected=ORIGINAL_WEAPON_POSES.rifle.rest[i]+(ORIGINAL_WEAPON_LOAD_POSITION[i]-ORIGINAL_WEAPON_POSES.rifle.rest[i])*Math.pow(.9,30);
      expect(samples[2].position[i]).toBeCloseTo(expected*ORIGINAL_WEAPON_UNIT_SCALE,7);
    }
    expect(samples[0].rotation).toEqual([-Math.PI/2,-Math.PI/2,0]);
    expect(samples[0].magazinePosition).toEqual([]);
    for(const sample of samples){
      expect(sample.magazinePosition).toEqual(samples[0].magazinePosition);
      expect([sample.ammo,sample.reserve]).toEqual([samples[0].ammo,samples[0].reserve]);
    }
  }
  expect(errors).toEqual([]);
});

test('authoritative rifle refill starts the legacy rise once and preserves loadout counts',async({page},testInfo)=>{
  await page.addInitScript(()=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  });
  await page.goto('/?map=woodlands&e2e=1&quality=low');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#deploy').click();await page.locator('#room-code').fill('ANIM'+Date.now().toString(36).toUpperCase());await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});
  const read=()=>page.evaluate(()=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{weaponAnimationSnapshot():AnimationState|null}}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Animation snapshot missing');return debug.weaponAnimationSnapshot()!;
  });
  await page.keyboard.down('Digit3');
  await expect(page.locator('tr[data-weapon="rifle"]')).toHaveClass(/active/);await page.keyboard.up('Digit3');
  const initial=await read();
  expect(initial.ammo).toBe(28); // Recovered publisher goody.new spawn value.
  await page.locator('#game canvas').click();
  await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousedown',{button:0})));
  try {
    await expect.poll(async()=>(await read()).ammo).toBeLessThan(28);
  } finally {
    await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:0})));
  }
  const fired=await read();await page.keyboard.down('r');
  try{await expect.poll(async()=>(await read()).refillStartedAt,{timeout:10_000}).toBeGreaterThan(0);}finally{await page.keyboard.up('r');}
  const refilled=await read();expect(refilled.ammo).toBe(28);
  expect(refilled.reserve).toBe(fired.reserve-(28-fired.ammo));
  await page.waitForTimeout(900);
  expect((await read()).refillStartedAt).toBe(refilled.refillStartedAt);
  await expect(page.locator('#ammo-rifle')).toHaveText(`28 / ${refilled.reserve}`);
  const path='artifacts/fidelity-review/2026-09-30/current/woodlands-ak-authoritative-refill.png';
  await page.screenshot({path});
  await testInfo.attach('Actual Woodland AK refill to 28',{path,contentType:'image/png'});
});
