import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { originalBarrackHealthFrame, updateOriginalBarrackHealth } from './originalBarrackHealth';

afterEach(() => vi.unstubAllGlobals());

const assetRoot = 'public/assets/original-barrack-health';
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('recovered Barrack health movie', () => {
  it('preserves the source one-point offset for valid integer poster frames', () => {
    const source = readFileSync('docs/research-evidence/2026-09-30/director-script-extraction/barrack/casts/parents/ParentScript 5 - goody.ls', 'utf8');
    expect(source).toContain('member("health").posterFrame = 100 - (plives + 1 - pcheatflick)');
    // Normalized health is plives-pcheatflick. These frame choices are therefore
    // not the usual 100-health fill percentage or the Woodland bitmap clip.
    expect(originalBarrackHealthFrame(98)).toBe(1);
    expect(originalBarrackHealthFrame(75)).toBe(24);
    expect(originalBarrackHealthFrame(49)).toBe(50);
    expect(originalBarrackHealthFrame(0)).toBe(99);
    expect(originalBarrackHealthFrame(-1)).toBe(100);
  });

  it('explicitly adapts unsupported source frame values by truncation and clamping', () => {
    // These are browser adapter decisions, not assertions about Flash behavior.
    expect(originalBarrackHealthFrame(100)).toBe(1); // source frame -1
    expect(originalBarrackHealthFrame(99)).toBe(1); // source frame 0
    expect(originalBarrackHealthFrame(49.5)).toBe(49);
    expect(originalBarrackHealthFrame(49.01)).toBe(49);
    expect(originalBarrackHealthFrame(-20)).toBe(100);
    expect(originalBarrackHealthFrame(Number.POSITIVE_INFINITY)).toBe(1);
    expect(originalBarrackHealthFrame(Number.NEGATIVE_INFINITY)).toBe(100);
    expect(originalBarrackHealthFrame(Number.NaN)).toBe(1);
  });

  it('changes the image only when the displayed frame changes and leaves other HUD elements untouched', () => {
    const setSource = vi.fn();
    const image = { tagName: 'IMG', dataset: { sourceFrame: '1' }, set src(value: string) { setSource(value); } };
    const lookup = vi.fn((id: string) => id === 'barrack-health' ? image : null);
    vi.stubGlobal('document', { getElementById: lookup });
    updateOriginalBarrackHealth(100);
    updateOriginalBarrackHealth(49);
    updateOriginalBarrackHealth(48.5);
    updateOriginalBarrackHealth(0);
    expect(setSource.mock.calls).toEqual([
      ['/assets/original-barrack-health/frame-050.svg'],
      ['/assets/original-barrack-health/frame-099.svg'],
    ]);
    expect(image.dataset.sourceFrame).toBe('99');
    expect(lookup.mock.calls.every(([id]) => id === 'barrack-health')).toBe(true);
  });

  it('tolerates absent artwork and an unrelated element with the same ID', () => {
    vi.stubGlobal('document', { getElementById: () => null });
    expect(() => updateOriginalBarrackHealth(50)).not.toThrow();
    const nonImage = { tagName: 'DIV' };
    vi.stubGlobal('document', { getElementById: () => nonImage });
    expect(() => updateOriginalBarrackHealth(50)).not.toThrow();
    expect(nonImage).toEqual({ tagName: 'DIV' });
  });

  it('ships all 100 passive frames with independently pinned source and output hashes', () => {
    const manifest = JSON.parse(readFileSync(`${assetRoot}/provenance.json`, 'utf8'));
    expect(manifest.executed).toBe(false);
    const source = readFileSync(manifest.source.path);
    expect(sha256(source)).toBe('cf457d250591f80b56677f13bdc5a8d203a8dae2dda8f06323ad138858b22966');
    expect(sha256(source.subarray(12))).toBe('31772e3ac9bb5b6588020c820ec686077f8c8ee108cb7b417b39b81e46bdf274');
    expect(manifest.source).toMatchObject({ castId: 3765, resourceId: 5120, frames: 100, framesPerSecond: 12, stageBoundsTwips: [0, 1280, 0, 1280] });
    expect(manifest.outputs).toHaveLength(100);
    for (let index = 0; index < 100; index++) {
      const asset = manifest.outputs[index];
      expect(asset.frame).toBe(index + 1);
      expect(asset.file).toBe(`frame-${String(index + 1).padStart(3, '0')}.svg`);
      const bytes = readFileSync(`${assetRoot}/${asset.file}`);
      expect(bytes.length).toBe(asset.bytes);
      expect(sha256(bytes)).toBe(asset.sha256);
      expect(bytes.toString()).toContain('width="64" height="64" viewBox="0 0 64 64"');
      // A group inside clipPath is XML-valid but contributes no mask in
      // Chromium. Each source mask must be a direct basic shape, retaining
      // its placement matrix rather than silently clipping every red pixel.
      const clip = bytes.toString().match(/<clipPath\b[^>]*>([\s\S]*?)<\/clipPath>/)?.[1];
      expect(clip).toMatch(/^<path\b/);
      expect(clip).not.toContain('<g');
      expect(clip).toContain('transform="matrix(1 0 0 1 0 0)"');
    }
    expect(sha256(readFileSync(`${assetRoot}/frame-001.svg`))).toBe('daefc715677474a07bd5a8f67dd1fd05bda42f8e958e7734cc8960016bdf887e');
    expect(sha256(readFileSync(`${assetRoot}/frame-050.svg`))).toBe('43ad831f21b3188a8d87160ec26421fa385ead9c123de4f335c55ac01d8ff809');
    expect(sha256(readFileSync(`${assetRoot}/frame-100.svg`))).toBe('a13f5ed601c969cc8087d9aa8006baae3cddac8c6d94ca33a53c7058a623eb08');
  });

  it('retains source mask ratios, overlay placement, translucent empty cross and final mask replacement', () => {
    const manifest = JSON.parse(readFileSync(`${assetRoot}/provenance.json`, 'utf8'));
    expect(manifest.overlayAnchor).toEqual(['viewportRight - 82', 11]);
    expect(manifest.posterFrameExpression).toBe('100 - (plives + 1 - pcheatflick)');
    for (const [frame, ratio] of [[1, 0], [2, 662], [50, 32437], [99, 64874]]) {
      const display = manifest.outputs[frame - 1].displayList;
      expect(display.map((entry: { depth: number }) => entry.depth)).toEqual([1, 2, 3, 5]);
      expect(display[0]).toMatchObject({ characterId: 1, matrix: [1, 0, 0, 1, 2, 2], colorTransform: { multiply: [256, 256, 256, 51] } });
      expect(display[1]).toMatchObject({ characterId: 2, clipDepth: 4, ratio });
    }
    expect(manifest.outputs[99].displayList[1]).toMatchObject({ characterId: 5, clipDepth: 4, ratio: 0 });
    const first = readFileSync(`${assetRoot}/frame-001.svg`, 'utf8');
    const middle = readFileSync(`${assetRoot}/frame-050.svg`, 'utf8');
    const last = readFileSync(`${assetRoot}/frame-100.svg`, 'utf8');
    expect(first).toContain('fill-opacity="0.19921875"'); // 51/256, not 51/255
    expect(first).toContain('M -22 62 L 78 62');
    const maskTop = Number(middle.match(/<path d="M -22 ([\d.]+) L 78/)?.[1]);
    expect(maskTop).toBeCloseTo(62 * (1 - 32437 / 65535), 9);
    expect(last).toContain('M 78 77 L -22 77 L -22 0 L 78 0 L 78 77 Z');
    expect(last).toContain('fill="rgb(204,0,0)"');
    expect(last).toContain('stroke-width="1"');
    expect(manifest.source.backgroundRgb).toEqual([0, 153, 0]);
    expect(last).not.toContain('rgb(0,153,0)'); // Transparent texture adapter, not proven native alpha.
  });
});
