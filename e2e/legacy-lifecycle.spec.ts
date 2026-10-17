import {expect,test} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {PROTOCOL_VERSION} from '../shared/protocol';

test.setTimeout(120_000);
test.use({viewport:{width:1280,height:576}});

for(const map of ['barrack','woodlands'] as const)for(const mode of ['solo','online'] as const){
  test(`${map} ${mode} lethal blasts end the life and Replay requires fresh entry`,async({page},testInfo)=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      let locked:Element|null=null;
      Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
      Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
      Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
    });
    await page.goto(`/?map=${map}&e2e=1&quality=low`);await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
    await expect(page.locator('#menu .menu-wordmark')).toBeVisible();
    const room='LIFE'+Date.now().toString(36).toUpperCase();
    if(mode==='online')await page.locator('#mode-online').click();
    await page.locator('#deploy').click();
    if(mode==='online'){await page.locator('#room-code').fill(room);await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');}
    const read=()=>page.evaluate(()=>{
      const debug=(window as any).__RA_MULTIPLAYER_DEBUG__;if(!debug)throw new Error('Game snapshot missing');return debug.snapshot() as {clientId:string|null;local:{alive:boolean;health:number};loadout:{ammo:Record<string,number>};originalExplosives:{projectiles:unknown[];blasts:unknown[];contactCount:number}};
    });
    const before=await read();
    if(mode==='online')await page.evaluate(async({room,map,protocol})=>{
      const observer={socket:new WebSocket('ws://127.0.0.1:8081'),latest:null as any};(window as any).__LIFE_OBSERVER__=observer;
      await new Promise<void>((resolve,reject)=>{observer.socket.onerror=()=>reject(new Error('Observer failed'));observer.socket.onopen=()=>observer.socket.send(JSON.stringify({type:'join',room,map,protocol,name:'SURVIVOR'}));observer.socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.type==='snapshot')observer.latest=message.snapshot;if(message.type==='welcome')resolve();};});
    },{room,map,protocol:PROTOCOL_VERSION});
    else await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.setView(-45,-43,0,-1.5));
    await page.waitForTimeout(1800);await page.locator('#game canvas').click();
    const health:number[]=[];
    for(let shot=0;shot<6&&(await read()).local.alive;shot++){
      const previous=(await read()).local.health;
      if(mode==='online')await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.fireNetworkWeapon('launcher',0,-1.5));
      else {await page.keyboard.press('Digit4');await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mousedown',{button:0})));}
      try{await expect.poll(async()=>(await read()).local.health,{timeout:8000}).toBeLessThan(previous);}
      finally{if(mode==='solo')await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:0})));}
      health.push((await read()).local.health);await page.waitForTimeout(650);
    }
    await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#result-title')).toHaveText('GAME OVER');
    const dead=await read();
    await expect(page.locator('#result .menu-wordmark')).toBeHidden();
    await expect(page.locator('#original-result-ui')).toBeVisible();
    await expect(page.locator('#original-result-ui')).toHaveAttribute('data-source-edition',map==='woodlands'?'woodland':'barrack');
    await expect(page.locator('#result-kicker')).toContainText('Our commiserations, Comrade');
    await expect(page.locator('#result-kicker')).not.toContainText('thanks to YOU');
    await expect(page.locator('#result-kicker')).not.toContainText('thanks to UNKNOWN');
    await expect(page.locator('#result-stats')).toHaveText('Would you like to submit your score of 0 points?\n\nClick go to see if you are worthy of Kremlin fame.');
    await expect(page.locator('#result-stats')).toHaveCSS('white-space','pre-line');
    await expect(page.locator('#result-stats div')).toHaveCount(0);
    await expect(page.locator('#respawn-overlay')).not.toHaveClass(/active/);await expect(page.locator('#hud')).toBeHidden();
    await page.waitForTimeout(1800);const afterResults=await read();expect(afterResults.local.alive).toBe(false);
    if(mode==='solo'){
      expect(afterResults.originalExplosives.projectiles).toEqual(dead.originalExplosives.projectiles);
      expect(afterResults.originalExplosives.blasts).toEqual(dead.originalExplosives.blasts);
      expect(afterResults.originalExplosives.contactCount).toBe(dead.originalExplosives.contactCount);
    }
    let survivor:any=null;
    if(mode==='online'){
      await expect(page.locator('#result-kicker')).toContainText('Our commiserations, Comrade');
      await expect(page.locator('#result-stats')).toHaveText('Would you like to submit your score of 0 points?\n\nClick go to see if you are worthy of Kremlin fame.');
      await expect(page.locator('#result-stats div')).toHaveCount(0);
      await expect.poll(()=>page.evaluate(()=>(window as any).__LIFE_OBSERVER__.latest?.players.length)).toBe(1);
      survivor=await page.evaluate(()=>(window as any).__LIFE_OBSERVER__.latest);
      expect(survivor.state).toBe('playing');expect(survivor.players[0].alive).toBe(true);
    }
    const deathMessage={text:await page.locator('#result-kicker').textContent(),score:await page.locator('#result-stats').textContent(),source:await page.locator('#result').evaluate(element=>element.classList.contains('source-result'))};
    const out=process.env.RA_FIDELITY_ARTIFACT_DIR??'artifacts/fidelity-review/2026-10-02/current/source-gameover-actor-cancellation/browser';await mkdir(out,{recursive:true});
    const path=`${out}/${map}-${mode}-game-over.png`;await page.screenshot({path});await testInfo.attach('Actual lethal-blast GAME OVER',{path,contentType:'image/png'});
    await page.locator('#restart').click();await expect(page.locator('#menu-entry')).toBeVisible();await expect(page.locator('#menu-rooms')).toBeHidden();
    expect((await read()).clientId).toBeNull();
    await page.locator('#deploy').click();
    if(mode==='online'){await expect(page.locator('#menu-rooms')).toBeVisible();await page.locator('#join-room').click();await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected');expect((await read()).clientId).not.toBe(before.clientId);}
    expect((await read()).local.alive).toBe(true);expect((await read()).local.health).toBe(100);
    await writeFile(`${out}/${map}-${mode}-lifecycle.json`,JSON.stringify({verified:true,map,mode,before,health,dead,afterResults,survivor,deathMessage,reentered:await read()},null,2));
    if(mode==='online')await page.evaluate(()=>(window as any).__LIFE_OBSERVER__.socket.close());
    expect(errors).toEqual([]);
  });
}
