import { mkdir } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { getLegacyReferenceCameras, type LegacyMapId } from '../shared/legacyMaps';

test.setTimeout(120_000);

interface FidelityState {
  connection:string;clientId:string|null;
  map: 'barrack'|'woodlands'|'winter'; controls:'legacy'|'modern'; aiming:boolean; chatOpen:boolean;
  local:{x:number;y:number;z:number;health:number;alive:boolean};
  loadout:{equipped:string;ammo:Record<string,number>;reserve:Record<string,number>;authoritativeUpdates:number};
  pickups:Array<{id:string;active:boolean}>;
  snowField?:unknown; winterGroundRelief:unknown;
  snowTracks:{active:{footprints:number;puffs:number};drawCalls:number};
}

test('online entry advances to room choice and Back preserves name and map without joining',async({page},testInfo)=>{
  await load(page,'woodlands');
  await page.locator('#mode-online').click();
  await expect(page.locator('#online-fields')).toBeHidden();
  await expect(page.locator('#deploy')).toHaveText('NEXT');
  await page.locator('#callsign').fill('   ');await page.locator('#deploy').click();
  await expect(page.locator('#entry-note')).toContainText('Enter a player name');
  await expect(page.locator('#menu-entry')).toBeVisible();
  await page.locator('#callsign').fill('  ALPHA  ');await page.locator('#deploy').click();
  await expect(page.locator('#menu-entry')).toBeHidden();await expect(page.locator('#menu-rooms')).toBeVisible();
  await expect(page.locator('#room-callsign')).toHaveText('ALPHA');
  expect((await state(page)).clientId).toBeNull();expect((await state(page)).connection).toBe('idle');
  const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});
  const roomPath=out+'/menu-rooms.png';await page.screenshot({path:roomPath});await testInfo.attach('room-choice',{path:roomPath,contentType:'image/png'});
  await page.locator('#back-entry').click();
  await expect(page.locator('#menu-entry')).toBeVisible();await expect(page.locator('#menu-rooms')).toBeHidden();
  await expect(page.locator('#callsign')).toHaveValue('ALPHA');await expect(page.locator('#map-select')).toHaveValue('woodlands');
  await page.locator('#mode-solo').click();await expect(page.locator('#deploy')).toHaveText('PLAY');
});
async function state(page:Page):Promise<FidelityState> {
  return page.evaluate(()=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{snapshot():FidelityState}}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Game debug snapshot missing');
    return debug.snapshot();
  });
}

// Exercise real game pointer-lock event handling without headless browser user-
// gesture restrictions. Network, game simulation and chat messages remain real.
async function deterministicPointerCapture(page:Page):Promise<void> {
  await page.addInitScript(()=>{
    let locked:Element|null=null;
    Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get:()=>locked});
    Object.defineProperty(HTMLCanvasElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLCanvasElement){locked=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();}});
    Object.defineProperty(Document.prototype,'exitPointerLock',{configurable:true,value(){locked=null;document.dispatchEvent(new Event('pointerlockchange'));}});
  });
}
// Source Escape is Cowardice. Review controls use browser capture failure,
// which exercises the supported pause path without changing the player's life.
async function pauseForReview(page:Page):Promise<void> {
  await page.evaluate(()=>{
    document.exitPointerLock();
    document.dispatchEvent(new Event('pointerlockerror'));
  });
  await expect(page.locator('#pause')).toBeVisible();
}
async function load(page:Page,map:LegacyMapId='barrack'):Promise<void> {
  await deterministicPointerCapture(page);
  await page.goto(`/?e2e=1&quality=low${map==='barrack'?'':`&map=${map}`}`);
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
}

// HUD/control checks use a real empty room so bot kills cannot reset the
// equipped weapon or interrupt typing while browser rendering is slow.
async function deployEmptyRoom(page:Page):Promise<void>{
  await page.locator('#mode-online').click();
  await page.locator('#deploy').click();
  await page.locator('#room-code').fill('CHECK'+Date.now().toString(36).toUpperCase());
  await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});
}

test('default Barrack and selectable Woodlands have no winter scene or snow trails',async({page})=>{
  await load(page);
  await expect(page.locator('#map-select')).toHaveValue('barrack');
  expect((await state(page)).map).toBe('barrack');
  for(const map of ['woodlands','barrack'] as const){
    await page.locator('#map-select').selectOption(map);
    await expect.poll(async()=>(await state(page)).map).toBe(map);
    const snapshot=await state(page);
    expect(snapshot.snowField).toBeUndefined();
    expect(snapshot.winterGroundRelief).toBeNull();
    expect(snapshot.snowTracks.active).toEqual({footprints:0,puffs:0});
  }
  await page.locator('#deploy').click();
  await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');
  expect((await state(page)).snowTracks.drawCalls).toBe(0);
});

test('reference HUD places six weapon rows upper left and health upper right',async({page})=>{
  await load(page);await deployEmptyRoom(page);
  const view=page.viewportSize()!;
  const table=await page.locator('.weapon-table').boundingBox();
  const health=await page.locator('.health-panel').boundingBox();
  expect(table).not.toBeNull();expect(health).not.toBeNull();
  expect(table!.x).toBeLessThan(view.width*.1);expect(table!.y).toBeLessThan(view.height*.1);
  expect(health!.x).toBeGreaterThan(view.width*.8);expect(health!.y).toBeLessThan(view.height*.1);
  await expect(page.locator('.weapon-table tr')).toHaveCount(6);
  await expect(page.locator('.minimap')).toBeHidden();await expect(page.locator('.topbar')).toBeHidden();
  for(const [index,weapon] of ['pistol','shotgun','rifle','launcher','rpg','sniper'].entries()){
    await page.keyboard.down(`Digit${index+1}`);
    try{await expect(page.locator(`tr[data-weapon="${weapon}"]`)).toHaveClass(/active/);}finally{await page.keyboard.up(`Digit${index+1}`);}
    await expect(page.locator(`#ammo-${weapon}`)).toHaveText(/^\d+ \/ \d+$/);
  }
});

test('legacy Shift scopes only the sniper; modern preset changes controls and survives reload',async({page})=>{
  await load(page);await deployEmptyRoom(page);
  expect((await state(page)).controls).toBe('legacy');
  await page.keyboard.down('ShiftLeft');await expect.poll(async()=>(await state(page)).aiming).toBe(false);
  // Source weapon selection reads held keys at its callback, so keep each key
  // down until the selected weapon has updated the scope state.
  await page.keyboard.down('Digit6');
  try{await expect.poll(async()=>(await state(page)).aiming).toBe(true);}finally{await page.keyboard.up('Digit6');}
  await page.keyboard.down('Digit3');
  try{await expect.poll(async()=>(await state(page)).aiming).toBe(false);}finally{await page.keyboard.up('Digit3');}
  await page.keyboard.up('ShiftLeft');await expect.poll(async()=>(await state(page)).aiming).toBe(false);
  await pauseForReview(page);await page.locator('#controls-preset').selectOption('modern');
  await page.locator('#resume').click();
  await page.keyboard.down('ShiftLeft');expect((await state(page)).controls).toBe('modern');
  await expect.poll(async()=>(await state(page)).aiming).toBe(false);await page.keyboard.up('ShiftLeft');
  await page.locator('#game canvas').click();await page.mouse.down({button:'right'});
  await expect.poll(async()=>(await state(page)).aiming).toBe(true);await page.mouse.up({button:'right'});
  await pauseForReview(page);await page.locator('#restart-pause').click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.reload();await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  expect((await state(page)).controls).toBe('modern');
});

test('chat releases capture and typing gameplay keys neither moves, fires nor pauses',async({page})=>{
  await load(page);await deployEmptyRoom(page);await page.locator('#game canvas').click();
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#chat-input')).toBeFocused();await expect(page.locator('#pause')).toBeHidden();
  expect(await page.evaluate(()=>document.pointerLockElement===null)).toBe(true);
  const before=await state(page);
  await page.locator('#chat-input').pressSequentially('wasd123456rg',{delay:30});
  const after=await state(page);
  expect(after.chatOpen).toBe(true);expect(after.loadout.equipped).toBe(before.loadout.equipped);
  expect(after.loadout.ammo).toEqual(before.loadout.ammo);
  expect(Math.hypot(after.local.x-before.local.x,after.local.z-before.local.z)).toBeLessThan(.02);
  await expect(page.locator('#pause')).toBeHidden();
  await page.keyboard.press('Enter');await expect(page.locator('#chat-log')).toContainText('wasd123456rg');
  await expect(page.locator('#chat-form')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
  await pauseForReview(page);await expect(page.locator('#restart-pause')).toHaveText('REPLAY');
  await page.locator('#restart-pause').click();await expect(page.locator('#menu')).toBeVisible();await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('#menu-entry')).toBeVisible();await expect(page.locator('#menu-rooms')).toBeHidden();
});

test('Woodlands HUD and rifle capture the sharp-source comparison state',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await load(page,'woodlands');
  const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});
  await page.screenshot({path:out+'/menu.png'});
  await deployEmptyRoom(page);
  await page.keyboard.press('Digit3');
  await expect(page.locator('body')).toHaveAttribute('data-map','woodlands');
  await expect(page.locator('.woodland-health-cross')).toBeVisible();
  await expect(page.locator('.legacy-score')).toBeVisible();
  await expect(page.locator('#legacy-score')).toHaveText('0');
  await expect(page.locator('tr[data-weapon="rifle"]')).toHaveClass(/active/);
  const view=page.viewportSize()!;
  const weapon=await page.locator('.weapon-table').boundingBox();
  const chat=await page.locator('#chat-log').boundingBox();
  expect(weapon!.x/view.width).toBeGreaterThan(.04);expect(weapon!.x/view.width).toBeLessThan(.06);
  expect(weapon!.y/view.height).toBeGreaterThan(.025);expect(weapon!.y/view.height).toBeLessThan(.045);
  expect(weapon!.height/view.height).toBeGreaterThan(.14);expect(weapon!.height/view.height).toBeLessThan(.17);
  expect(chat!.x/view.width).toBeGreaterThan(.04);expect(chat!.x/view.width).toBeLessThan(.06);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.screenshot({path:out+'/woodlands-hud-rifle.png'});
  await testInfo.attach('Woodlands HUD and rifle',{path:out+'/woodlands-hud-rifle.png',contentType:'image/png'});
  await page.setViewportSize({width:1280,height:576});
  const wideWeapon=await page.locator('.weapon-table').boundingBox();
  expect(wideWeapon!.height/576).toBeGreaterThan(.14);expect(wideWeapon!.height/576).toBeLessThan(.17);
  await page.screenshot({path:out+'/woodlands-hud-wide.png'});
  await testInfo.attach('Wide Woodland HUD',{path:out+'/woodlands-hud-wide.png',contentType:'image/png'});
  await page.setViewportSize({width:390,height:844});
  const compactWeapon=await page.locator('.weapon-table').boundingBox();
  const compactHealth=await page.locator('.health-panel').boundingBox();
  expect(compactWeapon!.x+compactWeapon!.width).toBeLessThan(compactHealth!.x);
  await expect(page.locator('.chat-panel')).toBeVisible();
  const compactChat=await page.locator('#chat-log').boundingBox();
  await expect(page.locator('#original-normal-ui [data-source-layer="emblem"]')).toBeVisible();
  // Recovered emblem placement starts at source x639.75 in the800px viewport.
  expect(compactChat!.x+compactChat!.width).toBeLessThan(639.75/800*390);
  await page.screenshot({path:out+'/woodlands-hud-compact.png'});
  await testInfo.attach('Compact Woodland HUD',{path:out+'/woodlands-hud-compact.png',contentType:'image/png'});
  expect(errors).toEqual([]);
});

for(const map of ['barrack','woodlands'] as const){
  test(`${map} reference cameras capture the recovered source scenery`,async({page},testInfo)=>{
    await load(page,map);await page.locator('#deploy').click();
    for(const camera of getLegacyReferenceCameras(map)){
      await page.evaluate(name=>{
        const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setReferenceView(name:string):void}}).__RA_MULTIPLAYER_DEBUG__;
        if(!debug)throw new Error('Reference camera hook missing');debug.setReferenceView(name);
      },camera.name);
      await expect(page.locator('#menu')).toBeHidden();await expect(page.locator('#hud')).toBeHidden();
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const path=testInfo.outputPath(`${map}-${camera.name}.png`);await page.screenshot({path});
      await testInfo.attach(`${map}-${camera.name}`,{path,contentType:'image/png'});
      const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});
      await page.screenshot({path:`${out}/${map}-${camera.name}.png`});
    }
    // Captures are review artifacts, not claims of historical pixel parity.
    expect((await state(page)).map).toBe(map);
  });
}

test('Woodlands room discovery and two-client chat use the selected server map',async({browser},testInfo)=>{
  const alpha=await browser.newContext(),bravo=await browser.newContext();
  try{
    const a=await alpha.newPage(),b=await bravo.newPage();
    const room=`WOOD${testInfo.workerIndex}${testInfo.retry}${Date.now().toString(36).toUpperCase()}`;
    await load(a,'woodlands');await a.locator('#mode-online').click();await a.locator('#callsign').fill('ALPHA');await a.locator('#deploy').click();await a.locator('#room-code').fill(room);await a.locator('#join-room').click();
    await expect(a.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});
    await load(b);await b.locator('#map-select').selectOption('woodlands');await b.locator('#mode-online').click();await b.locator('#callsign').fill('BRAVO');await b.locator('#deploy').click();
    await b.locator('#refresh-rooms').click();
    const listedRoom=b.locator('#room-list button').filter({hasText:room});await expect(listedRoom).toBeVisible();
    await expect(listedRoom).toContainText('1/8');
    const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});
    await b.screenshot({path:out+'/menu-room-directory.png'});
    await testInfo.attach('Populated room directory',{path:out+'/menu-room-directory.png',contentType:'image/png'});
    await listedRoom.click();
    await expect(b.locator('#room-code')).toHaveValue(room);await b.locator('#join-room').click();
    await expect(b.locator('#network-status')).toHaveAttribute('data-player-count','2',{timeout:10_000});
    expect((await state(a)).map).toBe('woodlands');expect((await state(b)).map).toBe('woodlands');
    await a.keyboard.press('Enter');await a.locator('#chat-input').fill('Meet at the cottage  ');await a.keyboard.press('Enter');
    await expect(b.locator('#chat-log')).toContainText('ALPHA: >> Meet at the cottage');
    await expect.poll(()=>b.locator('#chat-log div').first().textContent()).toBe('ALPHA: >> Meet at the cottage  ');
    await b.keyboard.press('Enter');await b.locator('#chat-input').fill('On my way');await b.keyboard.press('Enter');
    await expect(a.locator('#chat-log')).toContainText('BRAVO: >> On my way');
  }finally{await alpha.close();await bravo.close();}
});

test('online health crate is collected by walking and reconciled to both clients',async({browser},testInfo)=>{
  const alpha=await browser.newContext(),bravo=await browser.newContext();
  try{
    const a=await alpha.newPage(),b=await bravo.newPage();const room=`ITEM${testInfo.workerIndex}${testInfo.retry}${Date.now().toString(36).toUpperCase()}`;
    for(const [page,name] of [[a,'COLLECTOR'],[b,'OBSERVER']] as const){
      await load(page);await page.locator('#mode-online').click();await page.locator('#callsign').fill(name);await page.locator('#deploy').click();await page.locator('#room-code').fill(room);await page.locator('#join-room').click();
      await expect(page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});
    }
    // The first room member starts at (0,35); the health crate is two metres east.
    expect((await state(a)).local).toMatchObject({x:0,z:35});
    const pickupId='barrack-pickup-0';
    await expect.poll(async()=>(await state(a)).pickups.find(p=>p.id===pickupId)?.active).toBe(true);
    // Use the existing real-network fire hook. Health is changed only by the server.
    await a.evaluate(()=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{fireNetworkWeapon(weapon:'launcher',yaw:number,pitch:number):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Real network fire hook missing');debug.fireNetworkWeapon('launcher',0,-1.15);
    });
    await expect.poll(async()=>(await state(a)).local.health,{timeout:10_000}).toBeLessThan(100);
    const damaged=await state(a);expect(damaged.local.alive).toBe(true);
    await a.bringToFront();await a.keyboard.down('KeyD');
    try{await expect.poll(async()=>(await state(a)).pickups.find(p=>p.id===pickupId)?.active,{timeout:3_000,intervals:[50]}).toBe(false);}finally{await a.keyboard.up('KeyD');}
    await expect.poll(async()=>(await state(b)).pickups.find(p=>p.id===pickupId)?.active).toBe(false);
    await expect.poll(async()=>(await state(a)).local.health).toBeGreaterThan(damaged.local.health);
  }finally{await alpha.close();await bravo.close();}
});

test('scope, death and results have repeatable comparison captures and replay returns to entry',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await load(page,'barrack');await page.locator('#deploy').click();
  await page.keyboard.press('Enter');await page.locator('#chat-input').fill('Checking the roof route');await page.keyboard.press('Enter');
  await expect(page.locator('#chat-log')).toContainText('Checking the roof route');
  await pauseForReview(page);await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate(element=>{element.style.display='none';});
  await page.evaluate(()=>{
    const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setPresentation(weapon:'sniper',aiming:boolean):void}}).__RA_MULTIPLAYER_DEBUG__;
    if(!debug)throw new Error('Scope review hook missing');debug.setPresentation('sniper',true);
  });
  const out='artifacts/fidelity-review/2026-09-30/current';await mkdir(out,{recursive:true});
  for(const kind of ['scope','death','results'] as const){
    if(kind!=='scope')await page.evaluate(kind=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setTransientPresentation(kind:'death'|'results'):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Transient review hook missing');debug.setTransientPresentation(kind);
    },kind);
    if(kind==='scope'){
      await expect(page.locator('#scope-overlay')).toHaveClass(/active/);
      await expect(page.locator('#original-normal-ui')).toBeHidden();
      await expect(page.locator('.weapon-table-panel')).toBeVisible();
      await expect(page.locator('.health-panel')).toBeVisible();
      await expect(page.locator('.chat-panel')).toBeVisible();
    }
    if(kind==='death'){await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#respawn-overlay')).not.toHaveClass(/active/);await expect(page.locator('#scope-overlay')).not.toHaveClass(/active/);await expect(page.locator('#hud')).toBeHidden();}
    if(kind==='results'){await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#hud')).toBeHidden();}
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const path=`${out}/barrack-${kind}.png`;await page.screenshot({path});await testInfo.attach(kind,{path,contentType:'image/png'});
  }
  await page.locator('#restart').click();await expect(page.locator('#menu')).toBeVisible();
  expect(errors).toEqual([]);
});
