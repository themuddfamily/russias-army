import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {ORIGINAL_WEAPON_POSES,ORIGINAL_WEAPON_UNIT_SCALE} from '../src/originalWeaponPresentation';
import type {WeaponId} from '../src/weapons';
test.setTimeout(180_000);
test.use({viewport:{width:1280,height:576}});
type Gun={weapon:WeaponId;position:number[];sourcePosition:number[];worldFov:number;viewFov:number;meshes:string[];loadedRocket:boolean;flashes:number};
type Review=Window&{__RA_MULTIPLAYER_DEBUG__:{snapshot():{originalWeapon:Gun;sourceScope:{active:boolean;fov:number;ptog:string;zoomonce:number}};setPresentation(weapon:WeaponId,aiming?:boolean,reloadProgress?:number,flash?:boolean):void}};
const weapons=['pistol','shotgun','rifle','launcher','rpg','sniper'] as const;
const out=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-09-30/current';
for(const quality of ['low','high'])test(`all six recovered source weapons render in a wide viewport on ${quality}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  });
  await page.goto(`/?map=woodlands&quality=${quality}&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
  await page.locator('#deploy').click();await page.locator('#game canvas').click();await page.evaluate(()=>document.exitPointerLock());
  await expect(page.locator('#pause')).not.toHaveClass(/hidden/);
  await page.addStyleTag({content:'#pause{visibility:hidden!important}'});
  const samples:unknown[]=[];await mkdir(out,{recursive:true});
  for(const weapon of weapons){
    await page.evaluate(w=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.setPresentation(w),weapon);
    const idle=await page.evaluate(()=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.snapshot().originalWeapon);
    expect(idle.weapon).toBe(weapon);expect(idle.worldFov).toBe(50);expect(idle.viewFov).toBe(50);
    expect(idle.sourcePosition).toEqual([...ORIGINAL_WEAPON_POSES[weapon].rest]);
    for(let i=0;i<3;i++)expect(idle.position[i]).toBeCloseTo(ORIGINAL_WEAPON_POSES[weapon].rest[i]*ORIGINAL_WEAPON_UNIT_SCALE,7);
    expect(idle.meshes.every(n=>n.startsWith('original-'))).toBe(true);
    await page.screenshot({path:`${out}/source-${weapon}-${quality}-idle.png`});
    await page.evaluate(w=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.setPresentation(w,false,0),weapon);
    const reload=await page.evaluate(()=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.snapshot().originalWeapon);
    expect(reload.sourcePosition).toEqual([-12,-20,5]);
    await page.screenshot({path:`${out}/source-${weapon}-${quality}-load.png`});
    await page.evaluate(w=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.setPresentation(w,false,undefined,true),weapon);
    const fired=await page.evaluate(()=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.snapshot().originalWeapon);
    expect(fired.sourcePosition).toEqual([...ORIGINAL_WEAPON_POSES[weapon].recoil]);
    expect(fired.flashes).toBe(['pistol','shotgun','rifle','sniper'].includes(weapon)?1:0);
    await page.screenshot({path:`${out}/source-${weapon}-${quality}-fire.png`});
    samples.push({weapon,idle,reload,fired});
  }
  await page.evaluate(()=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.setPresentation('sniper',true));
  const scopeState=await page.evaluate(()=>(window as unknown as Review).__RA_MULTIPLAYER_DEBUG__.snapshot());
  const scope=scopeState.originalWeapon;
  // This paused fixture captures construction, before the source actor's
  // first callback; actual held-Shift zoom to8 is covered by original-scope.
  expect(scopeState.sourceScope).toMatchObject({active:true,fov:35,ptog:'open',zoomonce:0});
  expect(scope.worldFov).toBe(35);expect(scope.viewFov).toBe(35);
  await page.screenshot({path:`${out}/source-sniper-${quality}-scope-entry.png`});
  expect(errors).toEqual([]);await writeFile(`${out}/source-weapons-${quality}.json`,JSON.stringify({verified:true,quality,samples,scope,errors},null,2));
});
