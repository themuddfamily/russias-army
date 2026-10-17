/**
 * Recovered Woodland goody.writestats overlays red healthfull on healthempty,
 * clipping the red image from its top according to health lost. The decoded lives expression normalizes plives - pcheatflick to health
 * and retains a +1 display offset. Preserve that offset without importing the
 * original integrity enforcement. CSS clipping of out-of-range source values
 * remains an explicit browser adapter.
 */
export function legacyHealthClip(health: number): string {
  const inset = Number.isNaN(health) ? 100 : Math.min(100, Math.max(0, health + 1));
  return `inset(${inset}% 0 0 0)`;
}

export function updateLegacyHealthHud(health: number): void {
  const full = document.getElementById('woodland-health-full');
  if (full) full.style.clipPath = legacyHealthClip(health);
}
