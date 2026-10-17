import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {ORIGINAL_MAP_SCALE as S} from '../shared/originalMapProfile';

test.setTimeout(90_000);
const out='artifacts/fidelity-review/2026-10-01/current';
for(const map of ['barrack','woodlands'] as const){
  test(`${map} recovered miss blood and puff textures render source callback states`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`/?map=${map}&quality=${map==='barrack'?'low':'high'}&e2e=1`);
    await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});await page.locator('#deploy').click();
    await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));await expect(page.locator('#pause')).toBeVisible();await page.locator('#pause').evaluate(el=>{el.style.display='none';});
    await page.evaluate(()=>{const d=(window as any).__RA_MULTIPLAYER_DEBUG__;d.setLook(d.snapshot().local.yaw,.4);});
    await mkdir(out,{recursive:true});const captures:any[]=[];
    for(const [kind,callbacks,scale,opacity] of [['miss',0,.4,.4],['shotgun-miss',0,.5,.4],['blood',1,2,.5],['puff',10,1.2,.67]] as const){
      await page.evaluate(({kind,callbacks})=>(window as any).__RA_MULTIPLAYER_DEBUG__.setOriginalCombatPresentation(kind,callbacks,3),{kind,callbacks});
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const state=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
      expect(state.originalCombatVisuals).toHaveLength(1);const visual=state.originalCombatVisuals[0];
      expect(visual.scale).toBeCloseTo(scale);expect(visual.opacity).toBeCloseTo(opacity);expect(visual.size[0]).toBeCloseTo(50*S);
      expect(Object.values(state.combatEffects.active).every(value=>value===0)).toBe(true);
      await page.screenshot({path:`${out}/${map}-source-${kind}.png`});captures.push({kind,callbacks,visual});
      const remaining=kind==='blood'?2:kind==='puff'?21:81;
      await page.evaluate(seconds=>(window as any).__RA_MULTIPLAYER_DEBUG__.advanceEffects(seconds),remaining/30);
      expect(await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().originalCombatVisuals.length)).toBe(0);
    }
    await writeFile(`${out}/${map}-source-combat-effects-presentation.json`,JSON.stringify({map,captures,errors},null,2));expect(errors).toEqual([]);
  });
  test(`${map} actual pistol and SPAS world misses create recovered decals without particles`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{let locked:Element|null=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});});
    await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});await page.locator('#deploy').click();
    if(!await page.evaluate(()=>!!document.pointerLockElement))await page.locator('#game canvas').click();
    const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());const records:any[]=[];
    for(const [weapon,key,count,texture] of [['pistol','Digit1',1,'decal'],['shotgun','Digit2',2,'decalspas']] as const){
      await page.keyboard.down(key);await expect(page.locator(`tr[data-weapon="${weapon}"]`)).toHaveClass(/active/);await page.keyboard.up(key);
      await expect.poll(async()=>(await read()).loadout.sourceCounter.ready,{timeout:6000}).toBe(true);
      await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setLook(0,-1.4));
      const before=await read(),ids=new Set(before.originalCombatVisuals.map((effect:any)=>effect.id));
      await page.mouse.down();try{await expect.poll(async()=>(await read()).originalCombatVisuals.filter((effect:any)=>!ids.has(effect.id)).length,{timeout:3000,intervals:[20]}).toBe(count);}finally{await page.mouse.up();}
      const after=await read(),fresh=after.originalCombatVisuals.filter((effect:any)=>!ids.has(effect.id));
      expect(fresh).toHaveLength(count);expect(fresh.every((effect:any)=>effect.texture===texture&&effect.opacity===.4)).toBe(true);
      expect(Object.values(after.combatEffects.active).every(value=>value===0)).toBe(true);records.push({weapon,before,after,fresh});
    }
    await mkdir(out,{recursive:true});await writeFile(`${out}/${map}-source-combat-effects-miss.json`,JSON.stringify({map,records,errors},null,2));expect(errors).toEqual([]);
  });
}


for(const map of ['barrack','woodlands'] as const)test(`${map} blood actors share reset scroll and terminal shader mutations`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/?map=${map}&quality=${map==='barrack'?'low':'high'}&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));await expect(page.locator('#pause')).toBeVisible();await page.locator('#pause').evaluate(el=>{el.style.display='none';});
  const read=()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().originalCombatVisuals);
  await page.evaluate(()=>{const d=(window as any).__RA_MULTIPLAYER_DEBUG__;d.setLook(d.snapshot().local.yaw,.4);d.setOriginalCombatPresentation('blood',1,3);});
  const aged=await read();expect(aged).toHaveLength(1);expect(aged[0].offset[0]).toBeCloseTo(0);
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.addOriginalBloodPresentation(3.6));
  const reset=await read();expect(reset).toHaveLength(2);for(const actor of reset){expect(actor.offset[0]).toBeCloseTo(-1/3);expect(actor.offset[1]).toBeCloseTo(1/3);}
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.advanceEffects(1/30));
  const shared=await read();expect(shared).toHaveLength(2);for(const actor of shared){expect(actor.offset[0]).toBeCloseTo(1/3);expect(actor.offset[1]).toBeCloseTo(1/3);}
  await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/${map}-source-shared-blood.png`});
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.advanceEffects(1/30));
  const survivor=await read();expect(survivor).toHaveLength(1);expect(survivor[0].offset[0]).toBeCloseTo(0);expect(survivor[0].offset[1]).toBeCloseTo(0);
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.advanceEffects(1/30));expect(await read()).toHaveLength(0);
  await writeFile(`${out}/${map}-source-shared-blood.json`,JSON.stringify({map,aged,reset,shared,survivor,errors,limits:'Production resources/factory/rendering with deterministic actor callback seam. Native shader inverse sampling/raster and actor birth scheduling remain unmeasured.'},null,2));expect(errors).toEqual([]);
});
