import {mkdir} from 'node:fs/promises';
import {expect,test} from '@playwright/test';

for(const quality of ['low','high'] as const){
  test(`Woodland ${quality} trees, boundary and timber interior have repeatable review captures`,async({page},testInfo)=>{
    test.setTimeout(180_000);
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto(`/?map=woodlands&e2e=1&quality=${quality}`);
    await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
    await page.locator('#deploy').click();
    const out='artifacts/fidelity-review/2026-09-30/current';
    await mkdir(out,{recursive:true});
    for(const name of ['forest','outbuilding','outbuilding-yard','shed','shed-yard']){
      await page.evaluate(camera=>{
        const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setReferenceView(name:string):void;setView(x:number,z:number,yaw:number,pitch:number):void}}).__RA_MULTIPLAYER_DEBUG__;
        if(!debug)throw new Error('Reference camera hook missing');
        debug.setReferenceView(camera==='shed-yard'?'shed':camera);
        if(camera==='shed-yard')debug.setView(-31,39,0,.05);
      },name);
      await expect(page.locator('#hud')).toBeHidden();
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const path=`${out}/woodlands-${name}${quality==='high'?'-high':''}.png`;
      await page.screenshot({path});
      await testInfo.attach(`${name} ${quality}`,{path,contentType:'image/png'});
    }
    // These are rendered review artifacts, not historical pixel-parity tests.
    expect(errors).toEqual([]);
  });
}
