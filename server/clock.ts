/** Epoch-shaped timestamps driven by monotonic elapsed time. Wall-clock
 * corrections must not rewind projectile integration or movement allowances.
 */
export function createMatchClock(
  wallNow:()=>number=Date.now,
  elapsedNow:()=>number=()=>performance.now(),
):()=>number {
  const epoch=wallNow(),start=elapsedNow();
  return ()=>epoch+elapsedNow()-start;
}

// Transport handlers, room defaults and ticks share the same time domain.
export const matchServerNow=createMatchClock();
