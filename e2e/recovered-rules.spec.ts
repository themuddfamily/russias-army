import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

interface State {
  local: { x: number; y: number; z: number; yaw: number; health: number; alive: boolean };
  loadout: { equipped: string; ammo: Record<string, number>; reserve: Record<string, number>; reloading: boolean; reloadRemaining: number; authoritativeUpdates: number };
}
interface Debug { snapshot(): State; fireNetworkWeapon(weapon: 'launcher', yaw: number, pitch: number): void }
type DebugWindow = Window & { __RA_MULTIPLAYER_DEBUG__?: Debug };
test.setTimeout(120_000);
test.use({ viewport: { width: 1280, height: 576 } });

async function deploy(page: Page, map: string) {
  await page.addInitScript(() => {
    let locked: Element | null = null;
    Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get: () => locked });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: function (this: HTMLCanvasElement) {
      locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve();
    } });
    Object.defineProperty(Document.prototype, 'exitPointerLock', { configurable: true, value() {
      locked = null; document.dispatchEvent(new Event('pointerlockchange'));
    } });
  });
  await page.goto(`/?map=${map}&e2e=1&quality=low`);
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30_000 });
  await page.locator('#mode-online').click();
  await page.locator('#deploy').click();
  await page.locator('#room-code').fill('RULES' + Date.now().toString(36).toUpperCase());
  await page.locator('#join-room').click();
  await expect(page.locator('#network-status')).toHaveAttribute('data-state', 'connected');
}
async function state(page: Page): Promise<State> {
  return page.evaluate(() => (window as DebugWindow).__RA_MULTIPLAYER_DEBUG__!.snapshot());
}
const out = 'artifacts/fidelity-review/2026-09-30/current';

for (const map of ['barrack', 'woodlands']) {
  test(`${map} reload transfers immediately while shooting remains locked`, async ({ page }) => {
    await deploy(page, map);
    await page.keyboard.press('Digit3');
    await expect.poll(async () => (await state(page)).loadout.equipped).toBe('rifle');
    await page.waitForTimeout(1000);
    await page.locator('#game canvas').click();
    await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousedown', { button: 0 })));
    try { await expect.poll(async () => (await state(page)).loadout.ammo.rifle).toBeLessThan(28); }
    finally { await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))); }
    const fired = await state(page);
    const immediately = await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', key: 'r' }));
      const snapshot = (window as DebugWindow).__RA_MULTIPLAYER_DEBUG__!.snapshot();
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      return { snapshot, afterBlockedShot: (window as DebugWindow).__RA_MULTIPLAYER_DEBUG__!.snapshot() };
    });
    expect(immediately.snapshot.loadout.ammo.rifle).toBe(28);
    expect(immediately.snapshot.loadout.reserve.rifle).toBe(fired.loadout.reserve.rifle - (28 - fired.loadout.ammo.rifle));
    expect(immediately.snapshot.loadout.reloading).toBe(true);
    expect(immediately.snapshot.loadout.reloadRemaining).toBeGreaterThan(0);
    expect(immediately.afterBlockedShot.loadout.ammo.rifle).toBe(28);
    await expect.poll(async () => (await state(page)).loadout.reloading).toBe(false);
    const complete = await state(page);
    expect(complete.loadout.ammo.rifle).toBe(28);
    expect(complete.loadout.reserve.rifle).toBe(immediately.snapshot.loadout.reserve.rifle);
    await mkdir(out, { recursive: true });
    await writeFile(`${out}/${map}-immediate-reload.json`, JSON.stringify({ verified: true, fired, immediately, complete }, null, 2));
  });

  test(`${map} Legacy lateral arrows turn without strafing and chat isolates them`, async ({ page }) => {
    await deploy(page, map);
    const before = await state(page);
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await state(page)).local.yaw).toBeGreaterThan(before.local.yaw + .1);
    await page.keyboard.up('ArrowLeft');
    const left = await state(page);
    expect(Math.hypot(left.local.x - before.local.x, left.local.z - before.local.z)).toBeLessThan(.05);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await state(page)).local.yaw).toBeLessThan(left.local.yaw - .1);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Enter');
    const chatting = await state(page);
    await page.keyboard.press('ArrowLeft');
    expect((await state(page)).local.yaw).toBe(chatting.local.yaw);
    await mkdir(out, { recursive: true });
    await writeFile(`${out}/${map}-arrow-steering.json`, JSON.stringify({ verified: true, before, left, chatting }, null, 2));
  });
}

test('Woodland uses exact square health images and reveals red damage from the bottom', async ({ page }) => {
  await deploy(page, 'woodlands');
  const full = page.locator('#woodland-health-full');
  await expect(full).toHaveCSS('clip-path', 'inset(100% 0px 0px)');
  const dimensions = await page.locator('.woodland-health-cross').boundingBox();
  expect(dimensions!.width).toBeCloseTo(dimensions!.height, 1);
  await page.waitForTimeout(1800);
  await page.evaluate(() => (window as DebugWindow).__RA_MULTIPLAYER_DEBUG__!.fireNetworkWeapon('launcher', 0, -1.5));
  await expect.poll(async () => (await state(page)).local.health).toBeLessThan(100);
  const damaged = await state(page);
  expect(damaged.local.health).toBeGreaterThan(0);
  await expect(full).toHaveCSS('clip-path', `inset(${Math.min(100, damaged.local.health + 1)}% 0px 0px)`);
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: `${out}/woodlands-original-health-damaged.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  const weapons = await page.locator('.weapon-table').boundingBox();
  const health = await page.locator('.woodland-health-cross').boundingBox();
  expect(weapons!.x + weapons!.width).toBeLessThan(health!.x);
  await page.screenshot({ path: `${out}/woodlands-original-health-compact.png` });
});
