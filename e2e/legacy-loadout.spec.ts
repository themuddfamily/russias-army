import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.setTimeout(120_000);
test.use({ viewport: { width: 1280, height: 576 } });

for (const map of ['barrack', 'woodlands']) for (const mode of ['solo', 'online']) {
  test(`${map} ${mode} starts with recovered publisher ammunition and RG6`, async ({ page }) => {
    await page.addInitScript(() => {
      let locked: Element | null = null;
      Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked });
      Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: function (this: HTMLCanvasElement) {
        locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve();
      } });
    });
    await page.goto(`/?map=${map}&quality=low&e2e=1`);
    await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30_000 });
    if (mode === 'online') await page.locator('#mode-online').click();
    await page.locator('#deploy').click();
    if (mode === 'online') {
      await page.locator('#room-code').fill('SOURCE' + Date.now().toString(36).toUpperCase());
      await page.locator('#join-room').click();
      await expect(page.locator('#network-status')).toHaveAttribute('data-state', 'connected');
    }
    await expect(page.locator('tr[data-weapon="launcher"]')).toHaveClass(/active/);
    const expected = { pistol: '8 / 54', shotgun: '6 / 24', rifle: '28 / 140', launcher: '6 / 18', rpg: '1 / 12', sniper: '30 / 12' };
    for (const [weapon, ammo] of Object.entries(expected)) await expect(page.locator(`#ammo-${weapon}`)).toHaveText(ammo);
    const snapshot = await page.evaluate(() => (window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
    expect(snapshot.loadout.equipped).toBe('launcher');
    if (mode === 'online') expect(snapshot.loadout.authoritativeUpdates).toBeGreaterThan(0);
    const out = 'artifacts/fidelity-review/2026-09-30/current';
    await mkdir(out, { recursive: true });
    await page.screenshot({ path: `${out}/${map}-${mode}-source-loadout.png` });
    await writeFile(`${out}/${map}-${mode}-source-loadout.json`, JSON.stringify({ map, mode, verified: true, loadout: snapshot.loadout }, null, 2));
    // Original reload permits the initial over-target Dragunov chamber and
    // returns its two surplus rounds to reserve immediately, even online.
    await page.locator('#game canvas').click();await page.keyboard.down('6');
    await expect(page.locator('tr[data-weapon="sniper"]')).toHaveClass(/active/);await page.keyboard.up('6');
    await page.keyboard.down('r');
    try{await expect(page.locator('#ammo-sniper')).toHaveText('28 / 14');}finally{await page.keyboard.up('r');}
    const reloaded=await page.evaluate(()=>(window as any).__RA_MULTIPLAYER_DEBUG__.snapshot());
    expect(reloaded.loadout.equipped).toBe('sniper');expect(reloaded.loadout.ammo.sniper+reloaded.loadout.reserve.sniper).toBe(42);
    await writeFile(`${out}/${map}-${mode}-source-reload.json`,JSON.stringify({map,mode,verified:true,loadout:reloaded.loadout},null,2));

  });
}
