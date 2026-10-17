import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.setTimeout(90_000);

type WeaponId = 'pistol' | 'shotgun' | 'rifle' | 'launcher' | 'rpg' | 'sniper';

interface WeaponPresentation {
  id: WeaponId;
  name: string;
  ammo: string;
  reserve: string;
  fireMode: 'AUTO' | 'SEMI';
}

interface PresentationSample {
  opaquePixels: number;
  visiblePixels: number;
  luminanceRange: number;
}

const WEAPONS: readonly WeaponPresentation[] = [
  { id: 'pistol', name: 'TT-33 TOKAREV', ammo: '08', reserve: '064', fireMode: 'SEMI' },
  { id: 'shotgun', name: 'SPAS-12', ammo: '08', reserve: '040', fireMode: 'SEMI' },
  { id: 'rifle', name: 'AK-47', ammo: '30', reserve: '150', fireMode: 'AUTO' },
  { id: 'launcher', name: 'RG-6', ammo: '06', reserve: '018', fireMode: 'SEMI' },
  { id: 'rpg', name: 'RPG-7', ammo: '01', reserve: '005', fireMode: 'SEMI' },
  { id: 'sniper', name: 'SVD DRAGUNOV', ammo: '10', reserve: '040', fireMode: 'SEMI' },
] as const;

async function selectPresentation(page: Page, weapon: WeaponId, aiming = false): Promise<void> {
  await page.evaluate(({ id, aiming }) => {
    const debug = (window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: {
        setPresentation(weapon: WeaponId, aiming?: boolean, reloadProgress?: number): void;
      };
    }).__RA_MULTIPLAYER_DEBUG__;
    if (!debug) throw new Error('Weapon presentation debug hook is unavailable.');
    debug.setPresentation(id, aiming);
  }, { id: weapon, aiming });

  // Let the renderer present the directly-applied debug pose before sampling.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function sampleCompositedScreenshot(page: Page, screenshot: Buffer): Promise<PresentationSample> {
  return page.evaluate(async (encodedScreenshot) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encodedScreenshot}`;
    await image.decode();
    const sample = document.createElement('canvas');
    sample.width = 96;
    sample.height = 64;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Unable to create presentation sampling context.');

    context.drawImage(
      image,
      Math.floor(image.width * .2),
      Math.floor(image.height * .42),
      Math.floor(image.width * .8),
      Math.floor(image.height * .58),
      0,
      0,
      sample.width,
      sample.height,
    );

    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let opaquePixels = 0;
    let visiblePixels = 0;
    let minimumLuminance = 255;
    let maximumLuminance = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (pixels[index + 3] > 0) opaquePixels++;
      if (red + green + blue > 24) visiblePixels++;
      const luminance = Math.round(red * .2126 + green * .7152 + blue * .0722);
      minimumLuminance = Math.min(minimumLuminance, luminance);
      maximumLuminance = Math.max(maximumLuminance, luminance);
    }

    return {
      opaquePixels,
      visiblePixels,
      luminanceRange: maximumLuminance - minimumLuminance,
    };
  }, screenshot.toString('base64'));
}

test('all six first-person weapon presentations render with the correct HUD identity', async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  await page.addInitScript(() => {
    const state = window as typeof window & { __RA_WEBGL_CONTEXT_LOSSES__: string[] };
    state.__RA_WEBGL_CONTEXT_LOSSES__ = [];
    document.addEventListener('webglcontextlost', (event) => {
      const status = event as WebGLContextEvent;
      state.__RA_WEBGL_CONTEXT_LOSSES__.push(status.statusMessage || 'WebGL context lost');
    }, true);
  });
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.goto('/?map=winter&e2e=1&quality=low');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 10_000 });
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();

  // Pause simulation so bots, recoil, and movement cannot perturb the debug poses.
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel) => { panel.setAttribute('hidden', ''); });
  await page.locator('#prompt').evaluate((prompt) => { prompt.classList.remove('active'); });

  let rifleSample: PresentationSample | undefined;
  for (const weapon of WEAPONS) {
    await selectPresentation(page, weapon.id);
    await expect(page.locator('#weapon-name')).toHaveText(weapon.name);
    await expect(page.locator('#ammo')).toHaveText(weapon.ammo);
    await expect(page.locator('#reserve')).toHaveText(weapon.reserve);
    await expect(page.locator('#fire-mode')).toHaveText(weapon.fireMode);
    await expect(canvas).toBeVisible();

    if (weapon.id === 'rifle') {
      const rifleScreenshot = await canvas.screenshot();
      rifleSample = await sampleCompositedScreenshot(page, rifleScreenshot);
      await testInfo.attach('rifle-first-person-presentation', {
        body: rifleScreenshot,
        contentType: 'image/png',
      });
    }
  }

  expect(rifleSample, 'the rifle presentation should have been sampled').toBeDefined();
  expect(rifleSample!.opaquePixels).toBeGreaterThan(5_500);
  expect(rifleSample!.visiblePixels).toBeGreaterThan(4_000);
  expect(rifleSample!.luminanceRange).toBeGreaterThan(60);

  const webglContextLosses = await page.evaluate(() => (
    window as typeof window & { __RA_WEBGL_CONTEXT_LOSSES__: string[] }
  ).__RA_WEBGL_CONTEXT_LOSSES__);
  expect(webglContextLosses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test('high-quality AK-47 hero model remains legible at the hip and through its iron sights', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const runtimeErrors: string[] = [];
  await page.addInitScript(() => {
    const state = window as typeof window & { __RA_WEBGL_CONTEXT_LOSSES__: string[] };
    state.__RA_WEBGL_CONTEXT_LOSSES__ = [];
    document.addEventListener('webglcontextlost', (event) => {
      const status = event as WebGLContextEvent;
      state.__RA_WEBGL_CONTEXT_LOSSES__.push(status.statusMessage || 'WebGL context lost');
    }, true);
  });
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });

  await page.goto('/?map=winter&e2e=1&quality=high');
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 15_000 });
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel) => { panel.setAttribute('hidden', ''); });
  await page.locator('#prompt').evaluate((prompt) => { prompt.classList.remove('active'); });

  await mkdir('artifacts/weapon-review', { recursive: true });
  await selectPresentation(page, 'rifle');
  const hipScreenshot = await canvas.screenshot();
  await writeFile('artifacts/weapon-review/high-rifle-hero.png', hipScreenshot);
  const hipSample = await sampleCompositedScreenshot(page, hipScreenshot);
  await selectPresentation(page, 'rifle', true);
  const adsScreenshot = await canvas.screenshot();
  await writeFile('artifacts/weapon-review/high-rifle-ads.png', adsScreenshot);
  const adsSample = await sampleCompositedScreenshot(page, adsScreenshot);

  await testInfo.attach('high-rifle-hero', { body: hipScreenshot, contentType: 'image/png' });
  await testInfo.attach('high-rifle-ads', { body: adsScreenshot, contentType: 'image/png' });

  expect(hipScreenshot.equals(adsScreenshot)).toBe(false);
  expect(hipSample.visiblePixels).toBeGreaterThan(4_000);
  expect(adsSample.visiblePixels).toBeGreaterThan(4_000);
  expect(hipSample.luminanceRange).toBeGreaterThan(60);
  expect(adsSample.luminanceRange).toBeGreaterThan(60);
  const webglContextLosses = await page.evaluate(() => (
    window as typeof window & { __RA_WEBGL_CONTEXT_LOSSES__: string[] }
  ).__RA_WEBGL_CONTEXT_LOSSES__);
  expect(webglContextLosses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
