/** Static art from the recovered UI Flash member's normal frame (2).
 * Each SVG contains its original placement in an 800 × 600 source viewport.
 * Stretching that viewport to the browser HUD is an explicit projection adapter;
 * it does not establish the original Director overlay's native texture mapping.
 * Dynamic health, ammunition and chat belong outside this static art container.
 */
export interface OriginalNormalUiState {
  map: 'barrack' | 'woodlands';
  sourceMap: boolean;
  playing: boolean;
  scoped: boolean;
}

export interface OriginalNormalUi {
  setState(state: OriginalNormalUiState): void;
  dispose(): void;
}

const SOURCE_LAYERS = [
  ['backing', 1],
  ['emblem', 2],
  ['crosshair', 5],
  ['border', 40],
] as const;

/** Prepend below existing live HUD content; the source scope frame owns its
 * existing separate artwork and replaces these normal-frame placements.
 */
export function installOriginalNormalUi(host: HTMLElement): OriginalNormalUi {
  const document = host.ownerDocument;
  const layer = document.createElement('div');
  layer.id = 'original-normal-ui';
  layer.className = 'original-normal-ui';
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.sourceFrame = '2';
  layer.dataset.sourceViewport = '800x600';
  layer.hidden = true;
  Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '0' });
  let emblem: HTMLImageElement | undefined;
  for (const [name, depth] of SOURCE_LAYERS) {
    const image = document.createElement('img');
    image.src = `/assets/original-normal-ui/${name === 'emblem' ? 'emblem-barrack' : name}.svg`;
    if (name === 'emblem') emblem = image;
    image.alt = '';
    image.draggable = false;
    image.dataset.sourceLayer = name;
    image.dataset.sourceDepth = String(depth);
    Object.assign(image.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'fill' });
    layer.append(image);
  }
  host.prepend(layer);
  let disposed = false;
  let edition = 'barrack';
  layer.dataset.sourceEdition = edition;
  return {
    setState(state): void {
      if (disposed) return;
      const nextEdition = state.map === 'woodlands' ? 'woodland' : 'barrack';
      if (nextEdition !== edition) {
        edition = nextEdition;
        if (emblem) emblem.src = `/assets/original-normal-ui/emblem-${edition}.svg`;
        layer.dataset.sourceEdition = edition;
      }
      layer.hidden = !(state.sourceMap && state.playing && !state.scoped);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      layer.remove();
    },
  };
}
