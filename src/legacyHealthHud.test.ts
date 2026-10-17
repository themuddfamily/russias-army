import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { legacyHealthClip, updateLegacyHealthHud } from './legacyHealthHud';

afterEach(() => vi.unstubAllGlobals());

describe('recovered Woodland health loss display', () => {
  it('shows the translucent empty cross at full health and retains the original one-percent display offset at zero health', () => {
    expect(legacyHealthClip(100)).toBe('inset(100% 0 0 0)');
    expect(legacyHealthClip(0)).toBe('inset(1% 0 0 0)');
    expect(legacyHealthClip(75)).toBe('inset(76% 0 0 0)');
    expect(legacyHealthClip(12.5)).toBe('inset(13.5% 0 0 0)');
  });

  it('clamps health bounds and treats an unavailable health value as healthy', () => {
    expect(legacyHealthClip(-30)).toBe('inset(0% 0 0 0)');
    expect(legacyHealthClip(-.5)).toBe('inset(0.5% 0 0 0)');
    expect(legacyHealthClip(-1)).toBe('inset(0% 0 0 0)');
    expect(legacyHealthClip(140)).toBe(legacyHealthClip(100));
    expect(legacyHealthClip(Number.POSITIVE_INFINITY)).toBe(legacyHealthClip(100));
    expect(legacyHealthClip(Number.NEGATIVE_INFINITY)).toBe('inset(0% 0 0 0)');
    expect(legacyHealthClip(Number.NaN)).toBe(legacyHealthClip(100));
  });

  it('updates the recovered red foreground without altering the numeric health label', () => {
    const full = { style: { clipPath: '' } };
    const lookup = vi.fn((id: string) => id === 'woodland-health-full' ? full : null);
    vi.stubGlobal('document', { getElementById: lookup });
    updateLegacyHealthHud(40);
    expect(full.style.clipPath).toBe('inset(41% 0 0 0)');
    expect(lookup).toHaveBeenCalledExactlyOnceWith('woodland-health-full');
  });

  it('tolerates a page without the legacy foreground', () => {
    vi.stubGlobal('document', { getElementById: () => null });
    expect(() => updateLegacyHealthHud(50)).not.toThrow();
  });

  it('ships byte-exact recovered 64-square PNGs with original resource provenance', () => {
    const manifest = JSON.parse(readFileSync('public/assets/legacy-woodland/provenance.json', 'utf8'));
    expect(manifest.source_movie_sha256).toBe('d42aaf3cd5c5bdb1decee1f8b48271c7590e49dee9e6d06a0f2954f8c486245c');
    expect(manifest.game_executed).toBe(false);
    expect(manifest.assets.map((asset: { cast_id: number }) => asset.cast_id)).toEqual([4528, 4529]);
    for (const asset of manifest.assets) {
      const bytes = readFileSync(`public/assets/legacy-woodland/${asset.file}`);
      expect(bytes).toEqual(readFileSync(asset.decoded_source));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([64, 64]);
    }
  });
});
