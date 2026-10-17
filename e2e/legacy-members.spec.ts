import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { PROTOCOL_VERSION } from '../shared/protocol';

test.setTimeout(120_000);
test.use({ viewport: { width: 1280, height: 576 } });

for (const map of ['barrack', 'woodlands'] as const) {
  test(`${map} M prints current room membership to the log and stays isolated from chat`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
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
    const room = 'MEMBERS' + Date.now().toString(36).toUpperCase();
    await page.locator('#callsign').fill('ALPHA');
    await page.locator('#mode-online').click();
    await page.locator('#deploy').click();
    await page.locator('#room-code').fill(room);
    await page.locator('#join-room').click();
    await expect(page.locator('#network-status')).toHaveAttribute('data-state', 'connected');
    await page.keyboard.press('KeyM');
    await expect(page.locator('#chat-log div').first()).toHaveText('Members: ALPHA');
    await page.evaluate(async ({ room, map, protocol }) => {
      const socket = new WebSocket('ws://127.0.0.1:8081');
      (window as typeof window & { __MEMBERS_OBSERVER__?: WebSocket }).__MEMBERS_OBSERVER__ = socket;
      await new Promise<void>((resolve, reject) => {
        socket.onerror = () => reject(new Error('Roster observer connection failed'));
        socket.onopen = () => socket.send(JSON.stringify({ type: 'join', room, map, protocol, name: 'BRAVO' }));
        socket.onmessage = event => { if (JSON.parse(event.data).type === 'welcome') resolve(); };
      });
    }, { room, map, protocol: PROTOCOL_VERSION });
    await expect.poll(() => page.evaluate(() => (window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().playerCount)).toBe(2);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#chat-log div').first()).toHaveText('Members: ALPHA BRAVO');
    const out = 'artifacts/fidelity-review/2026-09-30/current';
    await mkdir(out, { recursive: true });
    const path = `${out}/${map}-current-members.png`;
    await page.screenshot({ path });
    await testInfo.attach('Live current members', { path, contentType: 'image/png' });
    await page.evaluate(() => (window as typeof window & { __MEMBERS_OBSERVER__?: WebSocket }).__MEMBERS_OBSERVER__!.close());
    await expect.poll(() => page.evaluate(() => (window as any).__RA_MULTIPLAYER_DEBUG__.snapshot().playerCount)).toBe(1);
    await page.keyboard.press('KeyM');
    await expect(page.locator('#chat-log div').first()).toHaveText('Members: ALPHA');
    await page.keyboard.press('Enter');
    await expect(page.locator('#chat-input')).toBeFocused();
    const memberLines = await page.locator('#chat-log div').filter({ hasText: /^Members:/ }).count();
    await page.locator('#chat-input').pressSequentially('m');
    await expect(page.locator('#chat-input')).toHaveValue('m');
    expect(await page.locator('#chat-log div').filter({ hasText: /^Members:/ }).count()).toBe(memberLines);
    await page.keyboard.press('Tab');
    await expect(page.locator('#chat-form')).toBeHidden();
    await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
    await page.evaluate(()=>document.exitPointerLock());
    await expect(page.locator('#pause')).toBeVisible();
    await page.keyboard.press('KeyM');
    expect(await page.locator('#chat-log div').filter({ hasText: /^Members:/ }).count()).toBe(memberLines);
    expect(errors).toEqual([]);
  });
}
