import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {ORIGINAL_WEAPON_UNIT_SCALE as S} from '../src/originalWeaponPresentation';
import {ORIGINAL_PLAYER_DERIVATIVE_FACTOR} from '../shared/originalPlayerPhysics';

test.use({viewport:{width:800,height:600}});test.setTimeout(60_000);
for(const map of ['barrack','woodlands'] as const)test(`${map} actual walking weapon bob uses source body velocity`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
  Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
  Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
 });
 await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});await page.locator('#deploy').click();await page.locator('#game canvas').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().movement.grounded)).toBe(true);
 await page.keyboard.down('KeyW');
 let moving:any;
 try{
  await expect.poll(async()=>{moving=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());return Math.hypot(...Object.values(moving.movement.velocity) as number[]);}).toBeGreaterThan(1);
  // Advance several source callbacks to distinguish motion from initial equip.
  await page.waitForTimeout(250);moving=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
 }finally{await page.keyboard.up('KeyW');}
 const gun=moving.originalWeapon,speed=Math.hypot(moving.movement.velocity.x,moving.movement.velocity.y,moving.movement.velocity.z)/ORIGINAL_PLAYER_DERIVATIVE_FACTOR/S;
 const sine=Math.sin(gun.ticker*Math.PI/180),expected=[(gun.sourcePosition[0]-sine*speed*.003)*S,(gun.sourcePosition[1]-Math.abs(sine*speed*.002))*S,gun.sourcePosition[2]*S];
 const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-weapon-body-speed.json`,JSON.stringify({map,moving,speed,expected,errors},null,2));
 await page.evaluate(()=>document.exitPointerLock());await page.addStyleTag({content:'#pause{display:none!important}#resume,#restart-pause{display:none!important}'});await page.screenshot({path:`${out}/${map}-source-weapon-body-speed.png`});
 expect(speed).toBeGreaterThan(0);for(let axis=0;axis<3;axis++)expect(gun.position[axis]).toBeCloseTo(expected[axis],10);expect(errors).toEqual([]);
});
