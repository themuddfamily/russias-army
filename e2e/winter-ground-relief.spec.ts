import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(180_000);

type ReliefView = 'perimeter' | 'tower';

interface RenderStats {
  calls: number;
  triangles: number;
}

interface ReliefSample {
  changedPixels: number;
  changedColumns: number;
  horizontalSpan: number;
  p90Delta: number;
  groundConcentration: number;
  skyPixels: number;
  brighterRatio: number;
  darkerRatio: number;
  visibleMean: number;
  visibleP10: number;
  visibleP90: number;
  visibleStdDev: number;
}

async function prepare(page: Page, quality: 'low' | 'high'): Promise<void> {
  await page.goto(`/?map=winter&quality=${quality}&e2e=1`);
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 15_000 });
  await page.locator('#deploy').click();
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockerror')));
  await expect(page.locator('#pause')).toBeVisible();
  await page.locator('#pause').evaluate((panel) => { panel.style.display = 'none'; });
}

async function capturePair(page: Page, view: ReliefView): Promise<{
  hidden: Buffer;
  visible: Buffer;
  renderDelta: RenderStats;
}> {
  const result = await page.evaluate(async (preset) => {
    const debug = (window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: {
        setEnvironmentPresentation(view: ReliefView): void;
        setGroundDressingVisible(visible: boolean): void;
        setWinterGroundReliefVisible(visible: boolean): void;
        snapshot(): { render: RenderStats };
      };
    }).__RA_MULTIPLAYER_DEBUG__;
    if (!debug) throw new Error('Winter-ground relief debug hooks are unavailable.');
    const capture = async (visible: boolean): Promise<{ image: string; render: RenderStats }> => {
      debug.setWinterGroundReliefVisible(visible);
      return new Promise((resolve, reject) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        if (!canvas) { reject(new Error('Winter-ground relief canvas is unavailable.')); return; }
        resolve({ image: canvas.toDataURL('image/png'), render: debug.snapshot().render });
      })));
    };
    debug.setEnvironmentPresentation(preset);
    debug.setGroundDressingVisible(false);
    try {
      const hidden = await capture(false);
      const visible = await capture(true);
      return {
        hidden: hidden.image,
        visible: visible.image,
        renderDelta: {
          calls: visible.render.calls - hidden.render.calls,
          triangles: visible.render.triangles - hidden.render.triangles,
        },
      };
    } finally {
      debug.setWinterGroundReliefVisible(true);
      debug.setGroundDressingVisible(true);
    }
  }, view);
  const decode = (dataUrl: string): Buffer => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  return { hidden: decode(result.hidden), visible: decode(result.visible), renderDelta: result.renderDelta };
}

async function samplePair(page: Page, view: ReliefView, hidden: Buffer, visible: Buffer): Promise<ReliefSample> {
  return page.evaluate(async ({ preset, hiddenData, visibleData }) => {
    const width = 240; const height = 150;
    const decode = async (data: string): Promise<ImageData> => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Winter-ground relief sampling canvas is unavailable.');
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height);
    };
    const [before, after] = await Promise.all([decode(hiddenData), decode(visibleData)]);
    const inReviewRoi = (x: number, y: number): boolean => {
      if (preset === 'perimeter') return x >= 7 && x <= 232 && y >= 102 && y <= 144;
      return y >= 102 && y <= 144 && ((x >= 7 && x <= 79) || (x >= 163 && x <= 232));
    };
    const columns = new Uint16Array(width);
    const deltas: number[] = [];
    const luminances: number[] = [];
    let changedPixels = 0; let fullChanged = 0; let groundChanged = 0; let skyPixels = 0;
    let brighter = 0; let darker = 0; let luminanceSum = 0;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const beforeLuminance = before.data[offset] * .2126 + before.data[offset + 1] * .7152 + before.data[offset + 2] * .0722;
      const afterLuminance = after.data[offset] * .2126 + after.data[offset + 1] * .7152 + after.data[offset + 2] * .0722;
      if (inReviewRoi(x, y)) { luminances.push(afterLuminance); luminanceSum += afterLuminance; }
      const red = before.data[offset] - after.data[offset];
      const green = before.data[offset + 1] - after.data[offset + 1];
      const blue = before.data[offset + 2] - after.data[offset + 2];
      const delta = Math.sqrt(red * red * .2126 + green * green * .7152 + blue * blue * .0722);
      if (delta < 4) continue;
      fullChanged += 1;
      if (y >= Math.floor(height * .56)) groundChanged += 1;
      if (y < Math.floor(height * .5)) skyPixels += 1;
      if (!inReviewRoi(x, y)) continue;
      changedPixels += 1; columns[x] += 1; deltas.push(delta);
      const signed = afterLuminance - beforeLuminance;
      if (signed >= 1) brighter += 1;
      if (signed <= -1) darker += 1;
    }
    const hitColumns = Array.from(columns, (count, index) => ({ count, index })).filter(({ count }) => count >= 2);
    deltas.sort((left, right) => left - right);
    luminances.sort((left, right) => left - right);
    const mean = luminanceSum / Math.max(1, luminances.length);
    const variance = luminances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, luminances.length);
    return {
      changedPixels,
      changedColumns: hitColumns.length,
      horizontalSpan: hitColumns.length ? hitColumns[hitColumns.length - 1]!.index - hitColumns[0]!.index + 1 : 0,
      p90Delta: deltas.length ? deltas[Math.floor((deltas.length - 1) * .9)]! : 0,
      groundConcentration: fullChanged ? groundChanged / fullChanged : 0,
      skyPixels,
      brighterRatio: changedPixels ? brighter / changedPixels : 0,
      darkerRatio: changedPixels ? darker / changedPixels : 0,
      visibleMean: mean,
      visibleP10: luminances[Math.floor((luminances.length - 1) * .1)] ?? 0,
      visibleP90: luminances[Math.floor((luminances.length - 1) * .9)] ?? 0,
      visibleStdDev: Math.sqrt(variance),
    };
  }, { preset: view, hiddenData: hidden.toString('base64'), visibleData: visible.toString('base64') });
}

test('high-tier winter relief adds distributed geometric snow shaping', async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`); });
  await prepare(page, 'high');
  const placements = await page.evaluate(() => {
    const debug = (window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: { winterGroundReliefPlacements(): ReadonlyArray<{ kind:string;quadrant:string }> | null };
    }).__RA_MULTIPLAYER_DEBUG__;
    if (!debug) throw new Error('Winter-ground relief placement hook is unavailable.');
    return debug.winterGroundReliefPlacements();
  });
  expect(placements).toHaveLength(88);
  expect(Object.fromEntries(['sastrugi','wind-crust','compacted'].map((kind) => [
    kind, placements?.filter((placement) => placement.kind === kind).length,
  ]))).toEqual({ sastrugi:64, 'wind-crust':16, compacted:8 });
  for (const quadrant of ['south-west','south-east','north-west','north-east'])
    expect(placements?.filter((placement) => placement.quadrant === quadrant)).toHaveLength(22);
  await mkdir('artifacts/environment-review', { recursive: true });
  const samples = {} as Record<ReliefView, ReliefSample>;
  for (const view of ['perimeter', 'tower'] as const) {
    const pair = await capturePair(page, view);
    const sample = await samplePair(page, view, pair.hidden, pair.visible);
    samples[view] = sample;
    await writeFile(`artifacts/environment-review/high-ground-relief-${view}-hidden.png`, pair.hidden);
    await writeFile(`artifacts/environment-review/high-ground-relief-${view}.png`, pair.visible);
    await testInfo.attach(`high-ground-relief-${view}`, { body: pair.visible, contentType: 'image/png' });
    const minimum = view === 'perimeter'
      ? { pixels:350, columns:70, span:75, p90:5.5 }
      : { pixels:30, columns:6, span:18, p90:4.5 };
    expect.soft(sample.changedPixels, `${view} relief pixels ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(minimum.pixels);
    expect.soft(sample.changedColumns, `${view} relief columns ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(minimum.columns);
    expect.soft(sample.horizontalSpan, `${view} relief span ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(minimum.span);
    expect.soft(sample.p90Delta, `${view} relief contrast ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(minimum.p90);
    expect.soft(sample.groundConcentration, `${view} ground concentration ${JSON.stringify(sample)}`).toBeGreaterThanOrEqual(.8);
    expect.soft(sample.skyPixels, `${view} sky spill ${JSON.stringify(sample)}`).toBeLessThanOrEqual(20);
    expect.soft(pair.renderDelta.calls, `${view} relief draw delta`).toBeGreaterThanOrEqual(1);
    expect.soft(pair.renderDelta.calls, `${view} relief draw delta`).toBeLessThanOrEqual(4);
    expect.soft(pair.renderDelta.triangles, `${view} relief triangle delta`).toBeGreaterThanOrEqual(9_504);
    expect.soft(pair.renderDelta.triangles, `${view} relief triangle delta`).toBeLessThanOrEqual(38_016);
  }
  expect(samples.perimeter.brighterRatio).toBeGreaterThanOrEqual(.75);
  expect(samples.perimeter.visibleMean).toBeGreaterThanOrEqual(140);
  expect(samples.perimeter.visibleMean).toBeLessThanOrEqual(205);
  expect(samples.perimeter.visibleP10).toBeGreaterThanOrEqual(115);
  expect(samples.perimeter.visibleP90).toBeLessThanOrEqual(220);
  expect(samples.perimeter.visibleP90-samples.perimeter.visibleP10).toBeGreaterThanOrEqual(5.5);
  expect(samples.perimeter.visibleStdDev).toBeGreaterThanOrEqual(2.15);
  expect(samples.perimeter.visibleStdDev).toBeLessThanOrEqual(8);
  expect(runtimeErrors).toEqual([]);
});

test('low tier keeps the canonical flat field and relief toggle is a no-op', async ({ page }) => {
  await prepare(page, 'low');
  const result = await page.evaluate(async () => {
    const debug = (window as typeof window & {
      __RA_MULTIPLAYER_DEBUG__?: {
        setEnvironmentPresentation(view: ReliefView): void;
        setWinterGroundReliefVisible(visible: boolean): void;
        snapshot(): { winterGroundRelief: null; authoritativeColliders: number };
      };
    }).__RA_MULTIPLAYER_DEBUG__;
    if (!debug) throw new Error('Winter-ground relief debug hooks are unavailable.');
    const capture = (visible: boolean): Promise<string> => {
      debug.setWinterGroundReliefVisible(visible);
      return new Promise((resolve, reject) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
        if (!canvas) { reject(new Error('Winter-ground relief canvas is unavailable.')); return; }
        resolve(canvas.toDataURL('image/png'));
      })));
    };
    debug.setEnvironmentPresentation('perimeter');
    const hidden = await capture(false);
    const visible = await capture(true);
    return { hidden, visible, snapshot: debug.snapshot() };
  });
  expect(result.snapshot.winterGroundRelief).toBeNull();
  expect(result.snapshot.authoritativeColliders).toBe(95);
  expect(result.visible).toBe(result.hidden);
});
