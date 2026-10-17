import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

for(const map of ['barrack','woodlands'] as const)test(`${map} recovered feedback typing score and health HUD`,async({page})=>{
  test.setTimeout(120_000);
  const errors:string[]=[],sent:any[]=[],serverErrors:any[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>{
    socket.on('framesent',frame=>{const message=JSON.parse(String(frame.payload));if(message.type==='chat')sent.push(message);});
    socket.on('framereceived',frame=>{const message=JSON.parse(String(frame.payload));if(message.type==='error')serverErrors.push(message);});
  });
  await page.addInitScript(()=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  });
  await page.setViewportSize({width:800,height:600});
  await page.goto(`/?map=${map}&quality=low&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#callsign').fill('ALPHA');await page.locator('#mode-online').click();await page.locator('#deploy').click();
  await page.locator('#room-code').fill('FEEDBACK'+Date.now().toString(36));await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');
  await expect(page.locator('#chat-log div').first()).toHaveText('Welcome to Russia Army, comrade ALPHA!');
  const input=page.locator('#chat-input');
  for(const message of ['one','two','three']){
    await page.keyboard.press('Tab');await expect(input).toBeFocused();
    await expect(page.locator('#chat-label')).toHaveText('>> ',{useInnerText:false});
    await expect(input).toHaveAttribute('maxlength','37');
    await input.fill(message);await page.keyboard.press('Enter');
    await expect(page.locator('#chat-log div').first()).toHaveText(`ALPHA: >> ${message}`);
  }
  await page.keyboard.press('KeyM');await page.keyboard.press('KeyM');
  expect(await page.locator('#chat-log div').allTextContents()).toEqual(['Members: ALPHA ','Members: ALPHA ','ALPHA: >> three','ALPHA: >> two','ALPHA: >> one']);
  const colors=await page.locator('#chat-log div').evaluateAll(lines=>lines.map(line=>getComputedStyle(line).color));
  expect(colors).toEqual(['rgb(255, 255, 0)',...Array(4).fill('rgb(0, 255, 0)')]);
  await page.keyboard.press('Tab');await page.keyboard.press('Backspace');
  await expect(page.locator('#chat-label')).toHaveText('>>');await expect(input).toHaveAttribute('maxlength','38');
  await input.pressSequentially('W'.repeat(45),{delay:25});await expect(input).toHaveValue('W'.repeat(38));
  await page.keyboard.press('Tab');await expect(page.locator('#chat-form')).toBeHidden();
  await page.keyboard.press('Tab');await expect(input).toHaveValue('');
  await input.fill('cancelled');await page.keyboard.press('Tab');await expect(page.locator('#chat-form')).toBeHidden();
  expect(sent.map(message=>message.text)).toEqual(['>> one','>> two','>> three']);
  const out='artifacts/fidelity-review/2026-10-01/current';await mkdir(out,{recursive:true});
  const measurements=[];
  for(const viewport of [{width:800,height:600},{width:1280,height:576},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.keyboard.press('Tab');await expect(input).toBeFocused();
    await input.fill('Follow the source HUD');
    const surfaces=await page.evaluate(()=>['#chat-log','#chat-form','.legacy-score'].map(selector=>{
      const element=document.querySelector(selector) as HTMLElement,rect=element.getBoundingClientRect(),style=getComputedStyle(element);
      return {selector,x:rect.x,y:rect.y,width:rect.width,height:rect.height,fontSize:style.fontSize,lineHeight:style.lineHeight,color:style.color,text:element.textContent};
    }));
    for(const surface of surfaces){
      const score=surface.selector==='.legacy-score';
      expect(Math.abs(surface.x-(score?689:40)*viewport.width/800)).toBeLessThan(.06);
      expect(Math.abs(surface.y-(score?80:surface.selector==='#chat-log'?510:490)*viewport.height/600)).toBeLessThan(.06);
      expect(Math.abs(surface.width-(score?128:256)*viewport.width/800)).toBeLessThan(.06);
      expect(surface.fontSize).toBe(score?'12px':'11px');expect(surface.lineHeight).toBe(score?'15px':'14px');
    }
    await expect(page.locator('.legacy-score')).toHaveText('score  0',{useInnerText:false});
    expect(await page.locator('#legacy-score').evaluate(element=>getComputedStyle(element).color)).toBe('rgb(255, 255, 0)');
    expect(await input.evaluate(element=>getComputedStyle(element).color)).toBe('rgb(255, 0, 0)');
    expect(await input.evaluate(element=>getComputedStyle(element).outlineStyle)).toBe('none');
    await page.screenshot({path:`${out}/${map}-feedback-hud-${viewport.width}x${viewport.height}.png`});
    measurements.push({viewport,surfaces});await page.keyboard.press('Tab');
  }
  let healthPixels:unknown;
  if(map==='barrack'){
    await expect(page.locator('#barrack-health')).toBeVisible();await expect(page.locator('#barrack-health')).toHaveAttribute('data-source-frame','1');
    healthPixels=await page.evaluate(async()=>{
      const samples=[];
      for(const frame of [1,50,100]){
        const image=new Image();image.src=`/assets/original-barrack-health/frame-${String(frame).padStart(3,'0')}.svg`;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
        samples.push({frame,top:Array.from(context.getImageData(32,10,1,1).data),bottom:Array.from(context.getImageData(32,45,1,1).data)});
      }
      return samples;
    });
    expect(healthPixels).toEqual([{frame:1,top:[0,0,0,51],bottom:[0,0,0,51]},{frame:50,top:[0,0,0,51],bottom:[204,0,0,255]},{frame:100,top:[204,0,0,255],bottom:[204,0,0,255]}]);
  }else await expect(page.locator('.woodland-health-cross')).toBeVisible();
  await page.keyboard.press('Tab');await expect(input).toHaveValue('');await page.keyboard.press('Enter');
  await expect.poll(()=>page.locator('#chat-log div').first().textContent()).toBe('ALPHA: >> ');
  expect(sent.at(-1).text).toBe('>> ');
  expect(errors).toEqual([]);expect(serverErrors).toEqual([]);
  await writeFile(`${out}/${map}-feedback-hud-browser.json`,JSON.stringify({map,measurements,colors,sent,healthPixels,errors,serverErrors},null,2));
});
