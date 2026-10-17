/** Reconstructed publisher weaponry scripts and DRCF declare a 30 fps movie.
 * These are nominal frame-scheduling durations, not measured wall-clock rates.
 */
const BARRACK_FIRE_WAIT_FRAMES: Readonly<Record<string, number>> = {
  pistol: 8, shotgun: 15, rifle: 2, launcher: 10, rpg: 10, sniper: 50,
};

export function usesImmediateReload(map: string | undefined): boolean {
  return map === 'barrack' || map === 'woodlands';
}

export function weaponReloadDuration(map: string | undefined, weapon: string, fallbackSeconds: number): number {
  if (map === 'woodlands') return 30 / 30;
  // Barrack moves poldwaitgun twenty frames ahead of waitgun. It then waits
  // for the equipped weapon's pwaits delta before permitting another shot.
  if (map === 'barrack' && Object.hasOwn(BARRACK_FIRE_WAIT_FRAMES, weapon)) {
    return (20 + BARRACK_FIRE_WAIT_FRAMES[weapon]) / 30;
  }
  return fallbackSeconds;
}
