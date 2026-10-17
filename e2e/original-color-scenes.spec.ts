import {expect,test} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

test.describe.configure({timeout:60_000});
test.use({viewport:{width:1280,height:576}});

for(const map of ['barrack','woodlands'] as const)for(const quality of ['low','balanced','high'] as const){
 test(`${map} ${quality} source review uses ungraded sRGB output`,async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/?map=${map}&quality=${quality}&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:45_000});
  await page.locator('#mode-solo').click();await page.locator('#deploy').click();
  await expect(page.locator('#menu')).toHaveClass(/hidden/);
  // These stations use recovered spawn0 and its authored look direction.
  // Model-bounds review cameras can include distant batched resource parts.
  const station=map==='barrack'?'courtyard':'hills';
  await page.evaluate(name=>window.__RA_MULTIPLAYER_DEBUG__!.setReferenceView(name),station);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const state=await page.evaluate(()=>window.__RA_MULTIPLAYER_DEBUG__!.snapshot());
  expect(state.map).toBe(map);expect(state.originalScene!.triangles).toBeGreaterThan(20_000);
  expect(state.renderPipeline).toMatchObject({toneMapping:0,exposure:1.02,outputColorSpace:'srgb',enhanced:quality!=='low'});
  expect(state.renderPipeline.passes).toEqual(quality==='low'?[]:['RenderPass','SMAAPass','OutputPass']);
  expect(errors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('source-review.png')});
  await writeFile(testInfo.outputPath('source-review.json'),JSON.stringify({verified:true,map,quality,station,state,errors,
   scope:'Current source-derived review station; output configuration and render smoke check, not historical camera registration or native lighting equality.'},null,2));
 });
}
