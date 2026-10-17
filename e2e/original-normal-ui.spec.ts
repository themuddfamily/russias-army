import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

for(const map of ['barrack','woodlands'] as const)test(`${map} recovered normal HUD renders and returns after actual scope`,async({page})=>{
  test.setTimeout(120_000);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
  });
  await page.setViewportSize({width:800,height:600});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();await page.locator('#deploy').click();
  await page.locator('#room-code').fill('UI'+Date.now().toString(36));await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  if(!await page.evaluate(()=>!!document.pointerLockElement))await page.locator('#game canvas').click();
  const normal=page.locator('#original-normal-ui');
  await expect(normal).toBeVisible();
  await expect(normal).toHaveAttribute('data-source-edition',map==='woodlands'?'woodland':'barrack');
  await expect(page.locator('#crosshair')).toBeHidden();await expect(page.locator('.hud-emblem')).toBeHidden();
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});
  const measurements=[];
  for(const viewport of [{width:800,height:600},{width:1280,height:576},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await expect.poll(()=>normal.locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth===800))).toBe(true);
    const layers=await normal.locator('img').evaluateAll(images=>images.map(image=>{
      const rect=image.getBoundingClientRect();const img=image as HTMLImageElement;
      return {layer:img.dataset.sourceLayer,x:rect.x,y:rect.y,width:rect.width,height:rect.height,naturalHeight:img.naturalHeight,pointerEvents:getComputedStyle(img).pointerEvents};
    }));
    expect(layers).toHaveLength(4);
    for(const layer of layers){expect(layer.x).toBe(0);expect(layer.y).toBe(0);expect(layer.width).toBe(viewport.width);expect(layer.height).toBe(viewport.height);expect(layer.naturalHeight).toBe(600);expect(layer.pointerEvents).toBe('none');}
    await expect(page.locator('.weapon-table-panel')).toBeVisible();await expect(page.locator('.health-panel')).toBeVisible();await expect(page.locator('.chat-panel')).toBeVisible();
    await page.screenshot({path:`${out}/${map}-normal-ui-${viewport.width}x${viewport.height}.png`});
    measurements.push({viewport,layers});
  }
  await page.setViewportSize({width:800,height:600});
  // Check decoded vector layers independently of world pixels. This verifies
  // browser display of retained geometry, not the historical Flash rasterizer.
  const pixels=await normal.evaluate(element=>{
    const sample=(layer:string,x:number,y:number)=>{
      const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;
      const context=canvas.getContext('2d')!;context.drawImage(element.querySelector(`[data-source-layer="${layer}"]`) as HTMLImageElement,0,0,800,600);
      return Array.from(context.getImageData(x,y,1,1).data);
    };
    return {arms:[[400,287],[400,313],[387,300],[413,300]].map(([x,y])=>sample('crosshair',x,y)),center:sample('crosshair',400,300),corner:sample('border',0,0),opening:sample('border',400,300),backing:sample('backing',40,20)};
  });
  for(const arm of pixels.arms){expect(arm[0]).toBe(255);expect(arm[1]).toBe(0);expect(arm[2]).toBe(0);expect(arm[3]).toBeGreaterThan(0);}
  expect(pixels.center[3]).toBe(0);expect(pixels.corner).toEqual([0,0,0,255]);expect(pixels.opening[3]).toBe(0);expect(pixels.backing).toEqual([0,0,0,51]);
  await page.keyboard.down('Digit6');await expect(page.locator('tr[data-weapon="sniper"]')).toHaveClass(/active/);await page.keyboard.up('Digit6');
  await page.keyboard.down('ShiftLeft');await expect(page.locator('#scope-overlay')).toHaveClass(/active/);await expect(normal).toBeHidden();
  await expect(page.locator('.legacy-score')).toBeVisible();
  expect(await page.locator('.legacy-score').evaluate(element=>Number(getComputedStyle(element).zIndex))).toBeGreaterThan(await page.locator('#scope-overlay').evaluate(element=>Number(getComputedStyle(element).zIndex)||0));
  await expect.poll(()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().originalWeapon.worldFov)).toBe(8);
  await page.screenshot({path:`${out}/${map}-normal-ui-scope.png`});
  await page.keyboard.up('ShiftLeft');await expect(normal).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().originalWeapon.worldFov)).toBe(50);
  await page.screenshot({path:`${out}/${map}-normal-ui-restored.png`});
  await page.keyboard.press('Tab');await expect(page.locator('#chat-form')).toBeVisible();await expect(normal).toBeVisible();
  await page.locator('#chat-input').fill('Recovered HUD check');await page.keyboard.press('Enter');await expect(page.locator('#chat-log')).toContainText('Recovered HUD check');
  expect(errors).toEqual([]);
  await writeFile(`${out}/${map}-normal-ui-browser.json`,JSON.stringify({map,measurements,pixels,errors},null,2));
});

test('archived Winter keeps its existing HUD artwork',async({page})=>{
  await page.goto('/?map=winter&quality=low&e2e=1');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#original-normal-ui')).toBeHidden();
  await expect(page.locator('#crosshair')).toBeVisible();
  await expect(page.locator('.hud-emblem')).toBeVisible();
});

for(const map of ['barrack','woodlands'] as const)test(`${map} normal HUD follows death replay and edition change`,async({page})=>{
  await page.goto(`/?map=${map}&quality=low&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#original-normal-ui')).toBeVisible();
  await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setTransientPresentation('death'));
  await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#original-normal-ui')).toBeHidden();
  await page.locator('#restart').click();await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#original-normal-ui')).toBeHidden();
  const nextMap=map==='barrack'?'woodlands':'barrack';
  await page.locator('#map-select').selectOption(nextMap);await page.locator('#deploy').click();
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#original-normal-ui')).toBeVisible();
  await expect(page.locator('#original-normal-ui')).toHaveAttribute('data-source-edition',nextMap==='woodlands'?'woodland':'barrack');
});
