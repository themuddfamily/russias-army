import {mkdir} from 'node:fs/promises';
import {expect,test} from '@playwright/test';

for(const quality of ['low','high'] as const){
  test(`Woodland ${quality} legacy weapons render the source comparison states`,async({page},testInfo)=>{
    test.setTimeout(150_000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    // The native Woodland storyboards are 200×90. Use that aspect ratio for
    // weapon projections instead of comparing a wide source to a 16:10 copy.
    await page.setViewportSize({width:1280,height:576});
    await page.goto(`/?map=woodlands&e2e=1&quality=${quality}`);
    await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
    await page.locator('#deploy').click();
    await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
    await expect(page.locator('#pause')).toBeVisible();await page.locator('#pause').evaluate(element=>{element.style.display='none';});
    const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});
    for(const [weapon,label,ammo] of [['rifle','ak47','28 / 140'],['launcher','rg6','6 / 18'],['shotgun','spas12','6 / 24'],['sniper','dragunov','30 / 12']] as const){
      await page.evaluate(weapon=>{
        const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setPresentation(weapon:'rifle'|'launcher'|'shotgun'|'sniper',aiming:boolean):void}}).__RA_MULTIPLAYER_DEBUG__;
        if(!debug)throw new Error('Weapon review hook missing');debug.setPresentation(weapon,false);
      },weapon);
      await expect(page.locator(`tr[data-weapon="${weapon}"]`)).toHaveClass(/active/);
      await expect(page.locator(`#ammo-${weapon}`)).toHaveText(ammo);
      await expect(page.locator('#original-normal-ui [data-source-layer="emblem"]')).toBeVisible();
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const path=`${out}/woodlands-${label}-${quality}.png`;await page.screenshot({path});await testInfo.attach(`${label} ${quality}`,{path,contentType:'image/png'});
    }
    await page.evaluate(()=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setPresentation(weapon:'rifle',aiming:boolean,reloadProgress:undefined,muzzleFlash:boolean):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Weapon review hook missing');debug.setPresentation('rifle',false,undefined,true);
    });
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const flashPath=`${out}/woodlands-ak47-flash-${quality}.png`;await page.screenshot({path:flashPath});
    await testInfo.attach(`AK pale muzzle flash ${quality}`,{path:flashPath,contentType:'image/png'});
    expect(errors).toEqual([]);
  });
}
