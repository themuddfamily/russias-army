import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GENERATED_ASSET_URLS,generatedAssetRoot } from './generatedAssets';

describe('generatedAssetRoot',()=>{
  it('keeps runtime-loaded textures under Vite deployment bases',()=>{
    expect(generatedAssetRoot('/')).toBe('/assets/generated');
    expect(generatedAssetRoot('/russias-army/')).toBe('/russias-army/assets/generated');
    expect(generatedAssetRoot('https://cdn.example/game')).toBe('https://cdn.example/game/assets/generated');
  });
});

describe('generated asset manifest', () => {
  it('covers every procedural surface family with project-local assets', () => {
    expect(Object.keys(GENERATED_ASSET_URLS.arena)).toEqual([
      'cracked-concrete', 'icy-asphalt', 'painted-corrugated-steel',
      'worn-wood', 'burlap', 'snow', 'dark-metal',
    ]);
    expect(Object.keys(GENERATED_ASSET_URLS.weapon)).toEqual([
      'gunmetal', 'polymer', 'worn-wood', 'paint',
    ]);
    expect(Object.keys(GENERATED_ASSET_URLS.soldier)).toEqual([
      'fabric', 'armor', 'webbing', 'rubber', 'polymer', 'metal', 'wood', 'skin', 'lens',
    ]);
  });

  it('keeps every URL inside the configured generated public asset pack', () => {
    const groups = Object.values(GENERATED_ASSET_URLS);
    const urls = groups.flatMap((group) => Object.values(group));
    expect(urls.length).toBeGreaterThan(20);
    for (const url of urls) {
      expect(url).toMatch(/^\/?(?:.+\/)?assets\/generated\/.+\.(?:png|webp)$/);
      const publicPath=url.slice(url.indexOf('assets/generated'));
      expect(existsSync(resolve('public', publicPath)), url).toBe(true);
    }
  });
});
