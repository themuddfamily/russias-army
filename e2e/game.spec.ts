import { expect, test } from '@playwright/test';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../shared/protocol';

test.setTimeout(60_000);

function openRoomOccupant(room: string, name: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket('ws://127.0.0.1:8081');
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out joining room ${room}`));
    }, 10_000);
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.once('open', () => {
      socket.once('message', (payload) => {
        clearTimeout(timeout);
        const message = JSON.parse(payload.toString()) as {
          type?: string;
          protocol?: number;
          code?: string;
          message?: string;
        };
        if (message.type === 'welcome' && message.protocol === PROTOCOL_VERSION) {
          resolve(socket);
          return;
        }
        socket.close();
        reject(new Error(message.message ?? message.code ?? 'Room occupant was not welcomed'));
      });
      socket.send(JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, room, name }));
    });
  });
}

function closeRoomOccupant(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once('close', () => resolve());
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'leave' }));
      socket.close();
    }
  });
}

test('loads the arena and enters a playable round', async ({ page }) => {
  // Grenades belong to the optional modern offline controls.
  await page.addInitScript(() => localStorage.setItem('russias-army-settings', JSON.stringify({controls:'modern'})));
  const errors: string[] = [];
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __keyboardLockCalls: number;
      __keyboardUnlockCalls: number;
      __fullscreenKeyboardLockRequests: number;
    };
    state.__keyboardLockCalls = 0;
    state.__keyboardUnlockCalls = 0;
    state.__fullscreenKeyboardLockRequests = 0;
    const requestFullscreen = Element.prototype.requestFullscreen;
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value(this: Element, options?: FullscreenOptions & { keyboardLock?: string }) {
        if (options?.keyboardLock === 'browser') state.__fullscreenKeyboardLockRequests++;
        return requestFullscreen.call(this, options);
      },
    });
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true,
      value: {
        lock: async () => { state.__keyboardLockCalls++; },
        unlock: () => { state.__keyboardUnlockCalls++; },
      },
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: () => Promise.resolve(),
    });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#callsign')).toHaveAttribute('maxlength','20');
  await expect(page.locator('#room-code')).toHaveAttribute('maxlength','32');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    return { canceled: !window.dispatchEvent(event), defaultPrevented: event.defaultPrevented };
  })).toEqual({ canceled: false, defaultPrevented: false });
  expect(await page.evaluate(() => !window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', ctrlKey: true, cancelable: true }),
  ))).toBe(false);
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __keyboardLockCalls: number }
  ).__keyboardLockCalls)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (
    window as typeof window & { __fullscreenKeyboardLockRequests: number }
  ).__fullscreenKeyboardLockRequests)).toBe(0);
  await expect.poll(() => page.locator('html').getAttribute('data-keyboard-capture')).toBe('locked');
  await expect(page.locator('#health')).toHaveText(/^\d{1,3}$/);
  await expect(page.locator('#enemy-count')).toHaveText('0 / 12');
  await expect(page.locator('#leader-line')).toContainText('YOU 0');
  await expect(page.locator('#respawn-overlay')).not.toHaveClass(/active/);
  await page.keyboard.press('Digit6');
  await expect(page.locator('#weapon-name')).toHaveText('SVD DRAGUNOV');
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' }));
    for (let index = 0; index < 4; index++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', repeat: true }));
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG' }));
  });
  await expect(page.locator('#grenades')).toHaveText('2');
  const shortcutResults = await page.evaluate(() => [
    new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', ctrlKey: true, cancelable: true }),
    new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', metaKey: true, cancelable: true }),
    new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', ctrlKey: true, shiftKey: true, cancelable: true }),
    new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', ctrlKey: true, cancelable: true }),
    new KeyboardEvent('keydown', { code: 'KeyT', key: 't', ctrlKey: true, cancelable: true }),
    new KeyboardEvent('keydown', { code: 'F4', key: 'F4', ctrlKey: true, cancelable: true }),
    new KeyboardEvent('keydown', { code: 'Equal', key: '+', metaKey: true, cancelable: true }),
    new KeyboardEvent('keydown', { code: 'F5', key: 'F5', cancelable: true }),
    new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', altKey: true, cancelable: true }),
    new KeyboardEvent('keydown', { code: 'BrowserBack', key: 'BrowserBack', cancelable: true }),
  ].map((event) => !window.dispatchEvent(event)));
  expect(shortcutResults).toEqual([true, true, true, true, true, true, true, true, true, true]);
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    return { canceled: !window.dispatchEvent(event), defaultPrevented: event.defaultPrevented };
  })).toEqual({ canceled: true, defaultPrevented: true });
  await expect(page.locator('#prompt')).toHaveClass(/active/);
  await expect(page.locator('#prompt')).toContainText('BROWSER SHORTCUT BLOCKED');
  await expect(page.locator('#status-text')).toHaveText('COMBAT READY');
  expect(await page.evaluate(() => {
    let propagated = 0;
    const laterListener = () => { propagated++; };
    window.addEventListener('keydown', laterListener);
    const event = new KeyboardEvent('keydown', {
      code: 'KeyW', key: 'w', ctrlKey: true, cancelable: true,
    });
    const canceled = !window.dispatchEvent(event);
    window.removeEventListener('keydown', laterListener);
    return { canceled, propagated };
  })).toEqual({ canceled: true, propagated: 0 });

  const locksBeforePause = await page.evaluate(() => (
    window as typeof window & { __keyboardLockCalls: number }
  ).__keyboardLockCalls);
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#prompt')).toHaveClass(/active/);
  await expect(page.locator('#prompt')).toContainText('POINTER CAPTURE BLOCKED');
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __keyboardUnlockCalls: number }
  ).__keyboardUnlockCalls)).toBeGreaterThan(0);
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-capture', 'released');
  expect(await page.evaluate(() => !window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', ctrlKey: true, cancelable: true }),
  ))).toBe(true);

  await page.locator('#resume').click();
  await expect(page.locator('#pause')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __keyboardLockCalls: number }
  ).__keyboardLockCalls)).toBeGreaterThan(locksBeforePause);
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-capture', 'locked');
  await page.screenshot({ path: 'test-results/gameplay.png' });
  expect(errors).toEqual([]);
});

test('falls back from unsupported fullscreen keyboard lock without losing fullscreen', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __enhancedFullscreenRequests: number;
      __basicFullscreenRequests: number;
    };
    state.__enhancedFullscreenRequests = 0;
    state.__basicFullscreenRequests = 0;
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: undefined });
    const requestFullscreen = Element.prototype.requestFullscreen;
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value(this: Element, options?: FullscreenOptions & { keyboardLock?: string }) {
        if (options?.keyboardLock === 'browser') {
          state.__enhancedFullscreenRequests++;
          return Promise.reject(new DOMException('Unsupported keyboard lock mode', 'NotSupportedError'));
        }
        state.__basicFullscreenRequests++;
        return requestFullscreen.call(this, options);
      },
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: () => Promise.resolve(),
    });
  });

  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 5_000 });
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __enhancedFullscreenRequests: number }
  ).__enhancedFullscreenRequests)).toBe(1);
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __basicFullscreenRequests: number }
  ).__basicFullscreenRequests)).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-capture', 'fallback');
});

test('uses fullscreen keyboard lock when navigator.keyboard is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { __fullscreenKeyboardLockRequests: number };
    state.__fullscreenKeyboardLockRequests = 0;
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: undefined });
    const requestFullscreen = Element.prototype.requestFullscreen;
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value(this: Element, options?: FullscreenOptions & { keyboardLock?: string }) {
        if (options?.keyboardLock === 'browser') {
          state.__fullscreenKeyboardLockRequests++;
          // The fixture models a browser that accepts the new option even when
          // Playwright's bundled Chromium has not shipped it yet.
          return requestFullscreen.call(this, { navigationUI: options.navigationUI });
        }
        return requestFullscreen.call(this, options);
      },
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: () => Promise.resolve(),
    });
  });

  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 5_000 });
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __fullscreenKeyboardLockRequests: number }
  ).__fullscreenKeyboardLockRequests)).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-capture', 'fullscreen');
});

test('keeps the active page open when Chromium receives Control+W', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: () => Promise.resolve(),
    });
  });

  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 5_000 });
  await page.locator('#deploy').click();
  await expect.poll(() => page.locator('html').getAttribute('data-keyboard-capture')).toBe('locked');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+W' : 'Control+W');

  expect(page.isClosed()).toBe(false);
  expect(dialogs).toEqual([]);
  await expect(page.locator('#prompt')).toContainText('BROWSER SHORTCUT BLOCKED');
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-capture', 'locked');
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
});

test('falls back safely when navigator keyboard lock is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true,
      value: {
        lock: () => Promise.reject(new DOMException('Keyboard lock denied', 'NotAllowedError')),
        unlock: () => undefined,
      },
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: () => Promise.resolve(),
    });
  });

  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 5_000 });
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-capture', 'fallback');
  await expect(page.locator('#prompt')).toContainText('BROWSER KEY CAPTURE UNAVAILABLE');
  expect(await page.evaluate(() => !window.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', ctrlKey: true, cancelable: true }),
  ))).toBe(true);
});

test('archived Winter last-round auto-reload survives pausing before its delay elapses', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    let lockedElement: Element | null = null;
    Object.defineProperty(Document.prototype, 'pointerLockElement', {
      configurable: true,
      get: () => lockedElement,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value(this: HTMLCanvasElement) {
        lockedElement = this;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
    Object.defineProperty(Document.prototype, 'exitPointerLock', {
      configurable: true,
      value() {
        lockedElement = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
  });

  // The 350 ms delay and five reserve rockets belong to the authored Winter
  // rules; Barrack and Woodlands use the recovered source reload callbacks.
  await page.goto('/?map=winter&e2e=1&quality=low');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 15_000 });
  await page.locator('#deploy').click();
  await page.keyboard.press('Digit5');
  await expect(page.locator('#weapon-name')).toHaveText('RPG-7');
  await expect(page.locator('#ammo')).toHaveText('01');

  // The first click acquires the deterministic pointer-lock fixture. Fire the
  // single loaded rocket and pause synchronously, before the 350 ms auto-reload
  // delay can elapse.
  await page.locator('#game canvas').click();
  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    // Release the captured browser pointer to pause synchronously.
    document.exitPointerLock();
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  });
  await expect(page.locator('#ammo')).toHaveText('00');
  await expect(page.locator('#pause')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator('#ammo')).toHaveText('00');

  await page.locator('#resume').click();
  await expect(page.locator('#pause')).toBeHidden();
  await expect(page.locator('#ammo')).toHaveText('01', { timeout: 6_000 });
  await expect(page.locator('#reserve')).toHaveText('004');
  expect(errors).toEqual([]);
});

test('a full online room reports the server rejection in the menu', async ({ page }, testInfo) => {
  const room = `FULL${testInfo.workerIndex}${testInfo.retry}`;
  const occupants: WebSocket[] = [];
  try {
    occupants.push(...await Promise.all(Array.from({ length: 16 }, (_, index) => (
      openRoomOccupant(room, `RAW-${index + 1}`)
    ))));

    await page.goto('/?e2e=1&quality=low');
    await expect(page.locator('#loading')).toHaveCount(0, { timeout: 15_000 });
    await page.locator('#mode-online').click();
    await page.locator('#callsign').fill('SEVENTEENTH');
    await page.locator('#deploy').click();
    await page.locator('#room-code').fill(room);
    await page.locator('#join-room').click();

    await expect(page.locator('#menu')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#connection-note')).toHaveText('THIS ROOM IS FULL.');
    await expect(page.locator('#connection-note')).toHaveClass(/error/);
  } finally {
    await Promise.all(occupants.map(closeRoomOccupant));
  }
});
