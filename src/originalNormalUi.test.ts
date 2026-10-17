import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installOriginalNormalUi } from './originalNormalUi';

class ElementFixture {
  children: ElementFixture[] = [];
  parent?: ElementFixture;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  hidden = false;
  className = '';
  src = '';
  alt = '';
  draggable = true;
  ownerDocument = { createElement: (_tag: string): ElementFixture => new ElementFixture() };
  setAttribute(name: string, value: string): void { this.attributes[name] = value; }
  append(child: ElementFixture): void { this.children.push(child); child.parent = this; }
  prepend(child: ElementFixture): void { this.children.unshift(child); child.parent = this; }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = undefined;
  }
}

describe('recovered normal UI frame presentation', () => {
  it('places static source art before dynamic HUD content without capturing input', () => {
    const host = new ElementFixture();
    const health = new ElementFixture();
    host.append(health);
    installOriginalNormalUi(host as unknown as HTMLElement);
    const artwork = host.children[0];
    expect(host.children[1]).toBe(health);
    expect(artwork.hidden).toBe(true);
    expect(artwork.attributes['aria-hidden']).toBe('true');
    expect(artwork.style.pointerEvents).toBe('none');
    expect(artwork.children.every(image => image.alt === '' && !image.draggable)).toBe(true);
    expect(health.children).toEqual([]);
  });

  it('replaces normal art with scope frame and restores it only during a source-map life', () => {
    const host = new ElementFixture();
    const ui = installOriginalNormalUi(host as unknown as HTMLElement);
    const artwork = host.children[0];
    ui.setState({ map: 'barrack', sourceMap: true, playing: true, scoped: false });
    expect(artwork.hidden).toBe(false);
    ui.setState({ map: 'barrack', sourceMap: true, playing: true, scoped: true });
    expect(artwork.hidden).toBe(true);
    ui.setState({ map: 'barrack', sourceMap: true, playing: true, scoped: false });
    expect(artwork.hidden).toBe(false);
    ui.setState({ map: 'barrack', sourceMap: true, playing: false, scoped: false });
    expect(artwork.hidden).toBe(true);
    ui.setState({ map: 'barrack', sourceMap: false, playing: true, scoped: false });
    expect(artwork.hidden).toBe(true);
  });

  it('removes only its own art and ignores late lifecycle updates after disposal', () => {
    const host = new ElementFixture();
    const dynamic = new ElementFixture();
    host.append(dynamic);
    const ui = installOriginalNormalUi(host as unknown as HTMLElement);
    const artwork = host.children[0];
    ui.dispose(); ui.dispose();
    ui.setState({ map: 'barrack', sourceMap: true, playing: true, scoped: false });
    expect(host.children).toEqual([dynamic]);
    expect(artwork.hidden).toBe(true);
  });

  it('switches the recovered edition caption when changing source maps', () => {
    const host = new ElementFixture();
    const ui = installOriginalNormalUi(host as unknown as HTMLElement);
    const artwork = host.children[0];
    const emblem = artwork.children.find(image => image.dataset.sourceLayer === 'emblem')!;
    ui.setState({ map: 'woodlands', sourceMap: true, playing: true, scoped: false });
    expect(emblem.src).toBe('/assets/original-normal-ui/emblem-woodland.svg');
    expect(artwork.dataset.sourceEdition).toBe('woodland');
    ui.setState({ map: 'barrack', sourceMap: true, playing: true, scoped: false });
    expect(emblem.src).toBe('/assets/original-normal-ui/emblem-barrack.svg');
  });

  it('uses recovered full-viewport SVG placement rather than recreating the source geometry in CSS', () => {
    const host = new ElementFixture();
    installOriginalNormalUi(host as unknown as HTMLElement);
    for (const image of host.children[0].children) {
      const svg = readFileSync(`public${image.src}`, 'utf8');
      expect(svg).toMatch(/viewBox="0 0 800 600"/);
      expect(svg).toMatch(/preserveAspectRatio="none"/);
      expect(svg).toContain('<path');
      expect(image.style.width).toBe('100%');
      expect(image.style.height).toBe('100%');
    }
  });

  it('retains the decoded source display depths and off-centre crosshair placement', () => {
    // Independently inspected UI SWF frame 2: the crosshair sprite translates
    // by (385,285); its 30-pixel art then centres at (400,300). The emblem's
    // unequal source X/Y scales must not be replaced by a CSS aspect fit.
    const manifest = JSON.parse(readFileSync('public/assets/original-normal-ui/provenance.json', 'utf8'));
    expect(manifest.executed).toBe(false);
    for (const edition of ['barrack', 'woodland']) {
      const content = manifest.editionContents[edition];
      expect(content.frame).toBe(2);
      expect(content.displayList['5']).toMatchObject({ characterId: 12, matrix: [1, 0, 0, 1, 385, 285] });
      expect(content.displayList['2']).toMatchObject({ characterId: 10, matrix: [.369354248046875, 0, 0, .3695220947265625, 639.75, 479.6] });
      expect(content.shapes['11'].boundsTwips).toEqual([-10, 610, -10, 610]);
    }
    const host = new ElementFixture();
    installOriginalNormalUi(host as unknown as HTMLElement);
    expect(host.children[0].children.map(image => Number(image.dataset.sourceDepth))).toEqual([1, 2, 5, 40]);
    for (const image of host.children[0].children) {
      const key = image.dataset.sourceLayer === 'emblem' ? 'emblem-barrack' : image.dataset.sourceLayer;
      const asset = manifest.outputs[key];
      expect(Number(image.dataset.sourceDepth)).toBe(asset.depth);
      const bytes = readFileSync(`public${image.src}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    }
    const woodland = readFileSync(manifest.outputs['emblem-woodland'].file);
    expect(createHash('sha256').update(woodland).digest('hex')).toBe(manifest.outputs['emblem-woodland'].sha256);
  });
});
