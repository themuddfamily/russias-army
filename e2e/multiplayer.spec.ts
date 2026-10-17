import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Two software-WebGL contexts compile a large scene serially on shared CI.
// Leave enough room for both cold starts plus the actual replication checks.
test.setTimeout(120_000);

interface DebugRemote {
  original?:{bones:number;vertices:number;triangles:number;weapon:string;timeMs:number};
  id: string;
  name: string;
  authoritative: { x: number; y: number; z: number };
  rendered: { x: number; y: number; z: number };
  visible: boolean;
  inScene: boolean;
}

interface MultiplayerDebugSnapshot {
  connection: string;
  clientId?: string;
  room?: string;
  local: { health:number;alive:boolean;x:number;y:number;z:number };
  networkProjectiles: number;
  originalExplosionVisuals: Array<{id:string;kind:string;frame:number;remainingCallbacks:number}>;
  originalCombatVisuals: Array<{id:string;kind:string}>;
  networkEffects: { predictions:number;adoptions:number;projectileSpawns:number;explosions:number;damageEvents:number;eliminations:number };
  loadout: { equipped:string;ammo:Record<string,number>;reserve:Record<string,number>;reloading:boolean;reloadRemaining:number;autoReloadWeapon:string|null;authoritativeUpdates:number;lastServerTime:number|null };
  combatTransients: { damageOpacity:number;recoil:number;bob:number;stepDistance:number;viewActionPulse:number;muzzleFlashRemaining:number };
  impactMarks: { active: { bullets:number;scorches:number } };
  combatEffects: { active: Record<string,number> };
  blastLights: { active:number;capacity:number };
  remotes: DebugRemote[];
}

async function makePlayer(
  browser: Browser,
  callsign: string,
  room: string,
): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.goto('/?e2e=1');
    await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30_000 });
    await page.locator('#mode-online').click();
    await page.locator('#callsign').fill(callsign);
    await page.locator('#deploy').click();
    await expect(page.locator('#online-fields')).toBeVisible();
    await page.locator('#room-code').fill(room);
    await page.locator('#join-room').click();
    await expect(page.locator('#network-status')).toHaveAttribute('data-state', 'connected', { timeout: 10_000 });

    return { context, page, errors };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
}

async function debugSnapshot(page: Page): Promise<MultiplayerDebugSnapshot> {
  return page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: { snapshot(): MultiplayerDebugSnapshot };
    };
    if (!debugWindow.__RA_MULTIPLAYER_DEBUG__) throw new Error('Multiplayer debug snapshot is unavailable.');
    return debugWindow.__RA_MULTIPLAYER_DEBUG__.snapshot();
  });
}

// Source Escape now performs Cowardice; browser capture loss remains the
// review pause path used by restart and capture-generation fixtures.
async function pauseForReview(page:Page):Promise<void> {
  await page.evaluate(()=>{
    document.exitPointerLock();
    document.dispatchEvent(new Event('pointerlockerror'));
  });
  await expect(page.locator('#pause')).toBeVisible();
}

function horizontalDistance(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

test('two players join, replicate movement, and clean up after disconnect', async ({ browser }, testInfo) => {
  const room = `PW${testInfo.workerIndex}${testInfo.retry}`;
  let alpha: Awaited<ReturnType<typeof makePlayer>> | undefined;
  let bravo: Awaited<ReturnType<typeof makePlayer>> | undefined;

  try {
    alpha = await makePlayer(browser, 'ALPHA', room);
    bravo = await makePlayer(browser, 'BRAVO', room);
    await expect(alpha.page.locator('#network-status')).toHaveAttribute('data-player-count', '2', { timeout: 10_000 });
    await expect(bravo.page.locator('#network-status')).toHaveAttribute('data-player-count', '2', { timeout: 10_000 });

    await expect.poll(async () => (await debugSnapshot(alpha!.page)).remotes.map((remote) => remote.name)).toContain('BRAVO');
    await expect.poll(async () => (await debugSnapshot(bravo!.page)).remotes.map((remote) => remote.name)).toContain('ALPHA');
    const alphaView = (await debugSnapshot(alpha.page)).remotes.find((remote) => remote.name === 'BRAVO');
    const before = (await debugSnapshot(bravo.page)).remotes.find((remote) => remote.name === 'ALPHA');
    expect(alphaView, 'ALPHA should render BRAVO after both players join').toBeDefined();
    expect(alphaView?.visible).toBe(true);
    expect(alphaView?.inScene).toBe(true);
    expect(before, 'BRAVO should render ALPHA before movement').toBeDefined();
    expect(before?.visible).toBe(true);
    expect(before?.inScene).toBe(true);
    expect(alphaView?.original).toMatchObject({bones:25,vertices:742,triangles:832,weapon:'launcher'});
    expect(before?.original).toMatchObject({bones:25,vertices:742,triangles:832,weapon:'launcher'});

    await alpha.page.bringToFront();
    await alpha.page.keyboard.down('KeyD');
    await alpha.page.waitForTimeout(900);
    await alpha.page.keyboard.up('KeyD');

    await expect.poll(async () => {
      const remote = (await debugSnapshot(bravo!.page)).remotes.find((candidate) => candidate.name === 'ALPHA');
      return remote && before ? horizontalDistance(remote.authoritative, before.authoritative) : 0;
    }, { timeout: 10_000, message: 'ALPHA movement should reach BRAVO through server snapshots' }).toBeGreaterThan(0.25);

    await expect.poll(async () => {
      const remote = (await debugSnapshot(bravo!.page)).remotes.find((candidate) => candidate.name === 'ALPHA');
      return remote ? horizontalDistance(remote.rendered, remote.authoritative) : Number.POSITIVE_INFINITY;
    }, { timeout: 10_000, message: 'BRAVO should interpolate ALPHA toward the authoritative position' }).toBeLessThan(0.35);

    await alpha.context.close();
    await expect(bravo.page.locator('#network-status')).toHaveAttribute('data-player-count', '1', { timeout: 10_000 });
    await expect.poll(async () => (await debugSnapshot(bravo!.page)).remotes.some((remote) => remote.name === 'ALPHA')).toBe(false);

    expect(alpha.errors).toEqual([]);
    expect(bravo.errors).toEqual([]);
  } finally {
    await alpha?.context.close().catch(() => undefined);
    await bravo?.context.close().catch(() => undefined);
  }
});

test('server projectile produces one shared blast and authoritative self-damage', async ({ browser }, testInfo) => {
  const room=`PX${testInfo.workerIndex}${testInfo.retry}`;
  let alpha:Awaited<ReturnType<typeof makePlayer>>|undefined;
  let bravo:Awaited<ReturnType<typeof makePlayer>>|undefined;
  try{
    alpha=await makePlayer(browser,'ROCKET',room);bravo=await makePlayer(browser,'OBSERVER',room);
    await expect(alpha.page.locator('#network-status')).toHaveAttribute('data-player-count','2',{timeout:10_000});
    await expect(bravo.page.locator('#network-status')).toHaveAttribute('data-player-count','2',{timeout:10_000});
    expect((await debugSnapshot(alpha.page)).impactMarks.active.scorches).toBe(0);
    expect((await debugSnapshot(bravo.page)).impactMarks.active.scorches).toBe(0);

    await alpha.page.evaluate(()=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{fireNetworkWeapon(weapon:'launcher'|'rpg',yaw?:number,pitch?:number):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Multiplayer fire hook is unavailable.');
      debug.fireNetworkWeapon('launcher',0,-1.15);
    });

    await expect.poll(async()=>(await debugSnapshot(alpha!.page)).local.health,{timeout:10_000,message:'sixteen source blast callbacks should each apply five damage'}).toBe(20);
    await expect.poll(async()=>(await debugSnapshot(alpha!.page)).networkEffects,{timeout:10_000}).toEqual({predictions:1,adoptions:1,projectileSpawns:1,explosions:1,damageEvents:16,eliminations:0});
    await expect.poll(async()=>(await debugSnapshot(bravo!.page)).networkEffects,{timeout:10_000}).toEqual({predictions:0,adoptions:0,projectileSpawns:1,explosions:1,damageEvents:16,eliminations:0});
    await expect.poll(async()=>(await debugSnapshot(alpha!.page)).impactMarks.active.scorches,{timeout:10_000}).toBe(0);
    await expect.poll(async()=>(await debugSnapshot(bravo!.page)).impactMarks.active.scorches,{timeout:10_000}).toBe(0);
    await alpha.page.waitForTimeout(500);
    expect((await debugSnapshot(alpha.page)).networkProjectiles).toBe(0);
    expect((await debugSnapshot(bravo.page)).networkProjectiles).toBe(0);
    expect((await debugSnapshot(alpha.page)).networkEffects).toEqual({predictions:1,adoptions:1,projectileSpawns:1,explosions:1,damageEvents:16,eliminations:0});
    expect((await debugSnapshot(bravo.page)).networkEffects).toEqual({predictions:0,adoptions:0,projectileSpawns:1,explosions:1,damageEvents:16,eliminations:0});
    expect((await debugSnapshot(alpha.page)).impactMarks.active.scorches).toBe(0);
    expect((await debugSnapshot(bravo.page)).impactMarks.active.scorches).toBe(0);
    await alpha.page.evaluate(()=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{triggerEffect(kind:'explosion'|'impact',x:number,y:number,z:number):void;setCombatEffectsFrozen(frozen:boolean):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Multiplayer effect hook is unavailable.');
      debug.triggerEffect('explosion',0,0,0);debug.setCombatEffectsFrozen(true);
    });
    const beforeRestart=await debugSnapshot(alpha.page);
    // Source explosions use the recovered callback atlas; authored Winter
    // particles, screen flash, scorch and lighting must remain absent.
    expect(beforeRestart.originalExplosionVisuals).toHaveLength(1);
    expect(beforeRestart.originalExplosionVisuals[0]).toMatchObject({kind:'grenade',frame:0,remainingCallbacks:16});
    expect(beforeRestart.combatTransients.damageOpacity).toBe(0);
    expect(Object.values(beforeRestart.combatEffects.active).every((count)=>count===0)).toBe(true);
    expect(beforeRestart.blastLights.active).toBe(0);

    await pauseForReview(alpha.page);
    await expect(alpha.page.locator('#pause')).toBeVisible();
    await alpha.page.locator('#restart-pause').click();
    await expect(alpha.page.locator('#menu')).toBeVisible();
    await alpha.page.locator('#deploy').click();
    await expect(alpha.page.locator('#menu-rooms')).toBeVisible();
    await alpha.page.locator('#join-room').click();
    await expect(alpha.page.locator('#network-status')).toHaveAttribute('data-state','connected',{timeout:10_000});
    const restarted=await debugSnapshot(alpha.page);
    expect(restarted.originalExplosionVisuals).toEqual([]);
    expect(restarted.originalCombatVisuals).toEqual([]);
    expect(restarted.combatTransients).toEqual({damageOpacity:0,recoil:0,bob:0,stepDistance:0,viewActionPulse:0,muzzleFlashRemaining:0});
    expect(Object.values(restarted.combatEffects.active).every((count)=>count===0)).toBe(true);
    expect(restarted.blastLights.active).toBe(0);
    expect(restarted.impactMarks.active).toEqual({bullets:0,scorches:0});
    expect(await alpha.page.evaluate(()=>({
      flash:document.getElementById('damage-flash')?.style.opacity,
      direction:document.getElementById('damage-direction')?.style.opacity,
      marker:document.getElementById('hitmarker')?.style.opacity,
    }))).toEqual({flash:'0',direction:'0',marker:'0'});
    expect(alpha.errors).toEqual([]);expect(bravo.errors).toEqual([]);
  }finally{
    await alpha?.context.close().catch(()=>undefined);await bravo?.context.close().catch(()=>undefined);
  }
});

test('authoritative loadout restores a rejected RPG and permits the returned shot', async ({ browser }, testInfo) => {
  const room=`LR${testInfo.workerIndex}${testInfo.retry}`;let player:Awaited<ReturnType<typeof makePlayer>>|undefined;
  try{
    player=await makePlayer(browser,'LOADOUT',room);
    await expect.poll(async()=>(await debugSnapshot(player!.page)).loadout.authoritativeUpdates,{timeout:10_000,message:'initial authoritative loadout should arrive after welcome'}).toBeGreaterThan(0);
    const initial=await debugSnapshot(player.page);
    await player.page.keyboard.press('Digit5');
    await expect(player.page.locator('#weapon-name')).toHaveText('RPG-7');
    await expect.poll(async()=>{
      const state=await debugSnapshot(player!.page);
      return state.loadout.authoritativeUpdates>initial.loadout.authoritativeUpdates&&state.loadout.equipped==='rpg';
    },{timeout:10_000,message:'server should acknowledge the equipped RPG'}).toBe(true);

    await player.page.evaluate(()=>{
      const original=WebSocket.prototype.send;
      WebSocket.prototype.send=function(data){
        if(typeof data==='string'&&(JSON.parse(data) as {type?:string}).type==='shoot'){WebSocket.prototype.send=original;throw new Error('synthetic shot send failure');}
        Reflect.apply(original,this,[data]);
      };
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{fireNetworkWeaponFromOffset(weapon:'launcher'|'rpg',offsetX:number,offsetZ:number,yaw?:number,pitch?:number):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Multiplayer debug hook is unavailable.');debug.fireNetworkWeaponFromOffset('rpg',0,0,0,0);
    });
    await expect.poll(async()=>{
      const state=await debugSnapshot(player!.page);return {ammo:state.loadout.ammo.rpg,autoReload:state.loadout.autoReloadWeapon,predictions:state.networkEffects.predictions};
    },{timeout:5_000,message:'a synchronous send failure must refund the optimistic round'}).toEqual({ammo:1,autoReload:null,predictions:0});
    await player.page.waitForTimeout(1_150);

    await player.page.evaluate(()=>{
      const ammo=document.getElementById('ammo');if(!ammo)throw new Error('Ammo HUD is unavailable.');
      const probe={sawEmpty:ammo.textContent==='00'};new MutationObserver(()=>{if(ammo.textContent==='00')probe.sawEmpty=true;}).observe(ammo,{childList:true,characterData:true,subtree:true});
      Object.assign(window,{__RPG_AMMO_PROBE__:probe});
    });
    await player.page.evaluate(()=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{fireNetworkWeaponFromOffset(weapon:'launcher'|'rpg',offsetX:number,offsetZ:number,yaw?:number,pitch?:number):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Multiplayer debug hook is unavailable.');debug.fireNetworkWeaponFromOffset('rpg',24,24,0,0);
    });
    await expect.poll(()=>player!.page.evaluate(()=>(window as typeof window&{__RPG_AMMO_PROBE__?:{sawEmpty:boolean}}).__RPG_AMMO_PROBE__?.sawEmpty??false),{timeout:10_000,message:'optimistic rejected shot should consume the local RPG first'}).toBe(true);
    await expect.poll(async()=>{
      const state=await debugSnapshot(player!.page);return {ammo:state.loadout.ammo.rpg,reserve:state.loadout.reserve.rpg,autoReload:state.loadout.autoReloadWeapon,projectiles:state.networkProjectiles,spawns:state.networkEffects.projectileSpawns};
    },{timeout:10_000,message:'authoritative loadout should restore the rejected RPG'}).toEqual({ammo:1,reserve:12,autoReload:null,projectiles:0,spawns:0});
    await expect(player.page.locator('#ammo')).toHaveText('01');await expect(player.page.locator('#reserve')).toHaveText('012');

    // A rejected transform carrying a weapon switch must snap both position and
    // weapon presentation back to the authoritative RPG without a loadout event.
    await player.page.evaluate(([x,z])=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{setView(x:number,z:number,yaw?:number,pitch?:number):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Multiplayer debug hook is unavailable.');debug.setView(x+24,z+24,0,0);
    },[initial.local.x,initial.local.z] as const);
    await player.page.keyboard.press('Digit4');
    await expect.poll(async()=>horizontalDistance((await debugSnapshot(player!.page)).local,initial.local),{timeout:10_000,message:'rejected transform should restore server position'}).toBeLessThan(.05);
    await expect.poll(async()=>(await debugSnapshot(player!.page)).loadout.equipped,{timeout:10_000,message:'rejected transform should restore the authoritative equipped weapon'}).toBe('rpg');
    await expect(player.page.locator('#weapon-name')).toHaveText('RPG-7');

    await player.page.evaluate(()=>{
      const debug=(window as typeof window&{__RA_MULTIPLAYER_DEBUG__?:{fireNetworkWeapon(weapon:'launcher'|'rpg',yaw?:number,pitch?:number):void}}).__RA_MULTIPLAYER_DEBUG__;
      if(!debug)throw new Error('Multiplayer debug hook is unavailable.');debug.fireNetworkWeapon('rpg',0,0);
    });
    await expect.poll(async()=>(await debugSnapshot(player!.page)).networkEffects.projectileSpawns,{timeout:10_000,message:'returned authoritative RPG should produce a server projectile'}).toBe(1);
    await expect.poll(async()=>(await debugSnapshot(player!.page)).loadout.ammo.rpg,{timeout:10_000}).toBe(0);
    await expect.poll(async()=>{
      const loadout=(await debugSnapshot(player!.page)).loadout;
      return loadout.autoReloadWeapon==='rpg'||loadout.reloading;
    },{timeout:5_000,message:'an accepted final round must retain or begin auto-reload after reload:null reconciliation'}).toBe(true);
    expect(player.errors).toEqual([]);
  }finally{await player?.context.close().catch(()=>undefined);}
});

test('late fullscreen completion cannot recapture input after returning to the menu', async ({ page }, testInfo) => {
  await page.addInitScript(()=>{
    let fullscreen=false;let resolveFullscreen:undefined|(()=>void);let pointerRequests=0;
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>fullscreen?document.documentElement:null});
    Object.defineProperty(document,'exitFullscreen',{configurable:true,value:()=>{fullscreen=false;return Promise.resolve();}});
    Object.defineProperty(HTMLElement.prototype,'requestFullscreen',{configurable:true,value:()=>new Promise<void>((resolve)=>{
      resolveFullscreen=()=>{fullscreen=true;resolve();};
    })});
    Object.defineProperty(HTMLElement.prototype,'requestPointerLock',{configurable:true,value:()=>{pointerRequests++;return Promise.resolve();}});
    Object.assign(window,{__CAPTURE_PROBE__:{resolve:()=>resolveFullscreen?.(),pointerRequests:()=>pointerRequests}});
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#mode-online').click();
  await page.locator('#callsign').fill('CAPTURE');
  await page.locator('#deploy').click();
  await page.locator('#room-code').fill(`CAP${testInfo.workerIndex}${testInfo.retry}`);
  await page.locator('#join-room').click();
  await pauseForReview(page);
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#restart-pause').click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.evaluate(()=>{
    (window as typeof window&{__CAPTURE_PROBE__?:{resolve():void}}).__CAPTURE_PROBE__?.resolve();
  });
  await page.waitForTimeout(50);
  expect(await page.evaluate(()=>({
    phaseMenu:!document.getElementById('menu')?.classList.contains('hidden'),
    fullscreen:document.fullscreenElement!==null,
    pointerRequests:(window as typeof window&{__CAPTURE_PROBE__?:{pointerRequests():number}}).__CAPTURE_PROBE__?.pointerRequests()??-1,
    keyboardCapture:document.documentElement.dataset.keyboardCapture,
  }))).toEqual({phaseMenu:true,fullscreen:false,pointerRequests:0,keyboardCapture:'released'});
});

test('out-of-order capture promises cannot release a newer playing round', async ({ page }) => {
  await page.addInitScript(()=>{
    let fullscreen=false;let pointerElement:Element|null=null;let keyboardLocked=false;let keyboardUnlocks=0;
    const fullscreenResolvers:Array<()=>void>=[];const pointerResolvers:Array<()=>void>=[];const keyboardResolvers:Array<()=>void>=[];
    Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>fullscreen?document.documentElement:null});
    Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>pointerElement});
    Object.defineProperty(document,'exitFullscreen',{configurable:true,value:()=>{fullscreen=false;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();}});
    Object.defineProperty(document,'exitPointerLock',{configurable:true,value:()=>{pointerElement=null;document.dispatchEvent(new Event('pointerlockchange'));}});
    Object.defineProperty(HTMLElement.prototype,'requestFullscreen',{configurable:true,value:()=>new Promise<void>((resolve)=>{
      fullscreenResolvers.push(()=>{fullscreen=true;document.dispatchEvent(new Event('fullscreenchange'));resolve();});
    })});
    Object.defineProperty(HTMLElement.prototype,'requestPointerLock',{configurable:true,value:function(this:HTMLElement){return new Promise<void>((resolve)=>{
      pointerResolvers.push(()=>{pointerElement=this;document.dispatchEvent(new Event('pointerlockchange'));resolve();});
    });}});
    Object.defineProperty(navigator,'keyboard',{configurable:true,value:{
      lock:()=>new Promise<void>((resolve)=>{keyboardResolvers.push(()=>{keyboardLocked=true;resolve();});}),
      unlock:()=>{if(keyboardLocked)keyboardUnlocks++;keyboardLocked=false;},
    }});
    Object.assign(window,{__CAPTURE_QUEUE__:{
      resolveFullscreen:(index:number)=>fullscreenResolvers[index]?.(),
      resolvePointer:(index:number)=>pointerResolvers[index]?.(),
      resolveKeyboard:(index:number)=>keyboardResolvers[index]?.(),
      snapshot:()=>({fullscreen,pointer:pointerElement instanceof HTMLCanvasElement,keyboardLocked,keyboardUnlocks,fullscreenRequests:fullscreenResolvers.length,pointerRequests:pointerResolvers.length,keyboardRequests:keyboardResolvers.length}),
    }});
  });
  type ProbeState={fullscreen:boolean;pointer:boolean;keyboardLocked:boolean;keyboardUnlocks:number;fullscreenRequests:number;pointerRequests:number;keyboardRequests:number};
  const captureProbe=async():Promise<ProbeState>=>page.evaluate(()=>(window as typeof window&{__CAPTURE_QUEUE__:{snapshot():ProbeState}}).__CAPTURE_QUEUE__.snapshot());
  const resolve=async(kind:'Fullscreen'|'Pointer'|'Keyboard',index:number):Promise<void>=>page.evaluate(([name,position])=>{
    const probe=(window as typeof window&{__CAPTURE_QUEUE__:Record<string,(index:number)=>void>}).__CAPTURE_QUEUE__;
    probe[`resolve${name}`](position);
  },[kind,index] as const);

  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0,{timeout:30_000});
  await page.locator('#deploy').click();
  await expect.poll(async()=>(await captureProbe()).fullscreenRequests).toBe(1);
  await pauseForReview(page);
  await page.locator('#resume').click();
  await expect.poll(async()=>(await captureProbe()).fullscreenRequests).toBe(2);

  // Round B owns fullscreen and pointer lock before round A's older
  // fullscreen promise settles. A must not globally release B's capture.
  await resolve('Fullscreen',1);
  await expect.poll(async()=>(await captureProbe()).pointerRequests).toBe(1);
  await resolve('Pointer',0);
  await resolve('Fullscreen',0);
  await expect.poll(captureProbe).toMatchObject({fullscreen:true,pointer:true});
  await expect(page.locator('#pause')).toBeHidden();

  // Keep B's keyboard request pending, begin round C, then resolve C before B.
  await pauseForReview(page);
  await page.locator('#resume').click();
  await expect.poll(async()=>(await captureProbe()).fullscreenRequests).toBe(3);
  await resolve('Fullscreen',2);
  await expect.poll(async()=>(await captureProbe()).keyboardRequests).toBe(2);
  await resolve('Keyboard',1);
  const keyboardUnlocksBeforeStale=(await captureProbe()).keyboardUnlocks;
  await resolve('Keyboard',0);
  await expect.poll(captureProbe).toMatchObject({fullscreen:true,keyboardLocked:true,keyboardUnlocks:keyboardUnlocksBeforeStale});
  await expect(page.locator('#pause')).toBeHidden();

  // Keep C's pointer request pending and let D acquire pointer lock first.
  await pauseForReview(page);
  await page.locator('#resume').click();
  await expect.poll(async()=>(await captureProbe()).fullscreenRequests).toBe(4);
  await resolve('Fullscreen',3);
  await expect.poll(async()=>(await captureProbe()).pointerRequests).toBe(3);
  await resolve('Keyboard',2);
  await resolve('Pointer',2);
  await resolve('Pointer',1);
  await expect.poll(captureProbe).toMatchObject({fullscreen:true,pointer:true,keyboardLocked:true,keyboardUnlocks:keyboardUnlocksBeforeStale+1});
  await page.evaluate(()=>document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeHidden();
  await expect.poll(captureProbe).toMatchObject({fullscreen:true,pointer:true,keyboardLocked:true,keyboardUnlocks:keyboardUnlocksBeforeStale+1});
});
