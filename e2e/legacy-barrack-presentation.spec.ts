import {mkdir} from 'node:fs/promises';
import {expect,test} from '@playwright/test';

for(const quality of ['low','high'] as const){
  test(`Barrack ${quality} mixed pink and brick facades have review captures`,async({page},testInfo)=>{
    test.setTimeout(180_000);
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(`/?map=barrack&e2e=1&quality=${quality}`);
    await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
    await page.locator('#deploy').click();
    const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});
    for(const camera of ['courtyard','pink-facade','ramp']){
      await page.evaluate(name=>{
        const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setReferenceView(name:string):void}}).__RA_MULTIPLAYER_DEBUG__;
        if(!debug)throw new Error('Reference camera hook missing');debug.setReferenceView(name);
      },camera);
      await expect(page.locator('#hud')).toBeHidden();
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const path=`${out}/barrack-${camera}${quality==='high'?'-high':''}.png`;
      await page.screenshot({path});await testInfo.attach(`${camera} ${quality}`,{path,contentType:'image/png'});
    }
    expect(errors).toEqual([]);
  });
}
