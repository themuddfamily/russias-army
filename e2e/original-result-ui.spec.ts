import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

test.setTimeout(90_000);
for(const map of ['barrack','woodlands'] as const)test(`${map} recovered result art and accessible Replay`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
  await page.goto(`/?map=${map}&quality=low&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setTransientPresentation('death'));
  const result=page.locator('#result'),art=page.locator('#original-result-ui');
  await expect(result).toBeVisible();await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('data-source-edition',map==='woodlands'?'woodland':'barrack');
  await expect(page.locator('#original-normal-ui')).toBeHidden();
  await expect(page.locator('#original-result-submit')).toBeDisabled();
  await expect(result.locator('.result-star')).toBeHidden();await expect(result.locator('.menu-wordmark')).toBeHidden();
  const measurements=[];const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});
  for(const viewport of [{width:800,height:600},{width:1280,height:576},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await expect.poll(()=>result.locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&[800,1847].includes((image as HTMLImageElement).naturalWidth)))).toBe(true);
    const value=await result.evaluate(element=>{
      const rect=(e:Element)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
      const caption=element.querySelector('#result-kicker')!,style=getComputedStyle(caption);
      return {art:rect(element.querySelector('#original-result-ui')!),message:rect(element.querySelector('.result-message')!),replay:rect(element.querySelector('#restart')!),font:style.fontFamily,fontSize:style.fontSize,lineHeight:style.lineHeight,textAlign:style.textAlign,background:getComputedStyle(element.querySelector('.result-disk')!).backgroundColor};
    });
    expect(value.art).toEqual({x:0,y:0,width:viewport.width,height:viewport.height});
    expect(value.message.x).toBeCloseTo(96*viewport.width/800,3);expect(value.message.y).toBeCloseTo(189*viewport.height/600,3);
    expect(value.font).toContain('Times New Roman');expect(value.fontSize).toBe('18px');expect(value.lineHeight).toBe('21px');expect(value.textAlign).toBe('center');expect(value.background).toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({path:`${out}/${map}-result-ui-${viewport.width}x${viewport.height}.png`});measurements.push({viewport,...value});
  }
  await page.keyboard.press('Tab');await expect(page.locator('#restart')).toBeFocused();
  await expect(page.locator('#original-replay-focus')).toBeVisible();
  await page.screenshot({path:`${out}/${map}-result-keyboard-focus.png`});
  await page.keyboard.press('Enter');await expect(page.locator('#menu-entry')).toBeVisible();await expect(result).toBeHidden();
  const next=map==='barrack'?'woodlands':'barrack';await page.locator('#map-select').selectOption(next);await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setTransientPresentation('death'));
  await expect(art).toHaveAttribute('data-source-edition',next==='woodlands'?'woodland':'barrack');
  await page.locator('#restart').click();await expect(page.locator('#menu-entry')).toBeVisible();
  expect(requests.some(url=>url.includes('scoreboard_30days.php'))).toBe(false);expect(errors).toEqual([]);
  await writeFile(`${out}/${map}-result-ui-browser.json`,JSON.stringify({verified:true,map,measurements,errors,historicalSubmissionRequests:0},null,2));
});

test('Winter retains authored results and report',async({page})=>{
  await page.goto('/?map=winter&quality=low&e2e=1');await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setTransientPresentation('results'));
  await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#original-result-ui')).toBeHidden();await expect(page.locator('#original-result-submit')).toBeHidden();
  await expect(page.locator('#result-stats')).toContainText('ACCURACY');await expect(page.locator('.result-star')).toBeVisible();await page.locator('#restart').click();await expect(page.locator('#menu')).toBeVisible();
});

for(const map of ['barrack','woodlands'] as const)test(`${map} result clips exact hit shape and replays on press while authored clips animate`,async({page})=>{
  await page.setViewportSize({width:800,height:600});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setTransientPresentation('death'));
  const art=page.locator('#original-result-ui'),scroll=page.locator('#original-result-scroll');await expect(art).toBeVisible();
  const initial=Number(await scroll.getAttribute('data-source-frame'));
  await expect.poll(async()=>Number(await scroll.getAttribute('data-source-frame'))).toBeGreaterThan(initial+20);
  await expect.poll(()=>art.locator('.original-replay-up').getAttribute('data-source-frame')).not.toBeNull();
  const firstReplay=await art.locator('.original-replay-up').getAttribute('data-source-frame');
  await expect.poll(()=>art.locator('.original-replay-up').getAttribute('data-source-frame')).not.toBe(firstReplay);
  await page.waitForTimeout(4000);
  const animation=await scroll.evaluate(element=>{
    const image=Array.from(element.querySelectorAll('img')).find(image=>!image.hidden)!;
    const clip=element.querySelector('.original-result-scroll-clip')!;
    const r=clip.getBoundingClientRect();return {frame:Number((element as HTMLElement).dataset.sourceFrame),transform:image.style.transform,image:image.src,loaded:image.complete&&image.naturalWidth===1847,clip:{x:r.x,y:r.y,width:r.width,height:r.height},overflow:getComputedStyle(clip).overflow};
  });
  expect(animation.loaded).toBe(true);expect(animation.clip).toEqual({x:0,y:560,width:800,height:30});expect(animation.overflow).toBe('hidden');expect(animation.image).toContain('scroll-content-83.svg');
  const hits=await page.evaluate(()=>({outside:document.elementFromPoint(526,459)?.id,inside:document.elementFromPoint(579,500)?.id}));
  expect(hits.outside).not.toBe('restart');expect(hits.inside).toBe('restart');
  await page.mouse.click(526,459);await expect(page.locator('#result')).toBeVisible();
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/${map}-result-motion.png`});
  await page.mouse.move(579,500);await page.mouse.down();
  // Native source condition is press; prove return before mouseup arrives.
  await expect(page.locator('#menu-entry')).toBeVisible();await expect(page.locator('#result')).toBeHidden();
  await page.mouse.up();await expect(page.locator('#menu-entry')).toBeVisible();
  await writeFile(`${out}/${map}-result-motion-browser.json`,JSON.stringify({verified:true,map,animation,hits,replayBeforeMouseUp:true},null,2));
});
