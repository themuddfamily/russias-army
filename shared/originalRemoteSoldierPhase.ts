import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
import type {OriginalRemotePosition} from './originalRemoteMovement';

/** Expected failure when finite transport data cannot produce a finite source
 * skeletal phase. The mirror uses this distinction to reject the transaction. */
export class OriginalRemoteSoldierPhaseError extends Error {
  constructor(){super('Original remote soldier phase overflow');this.name='OriginalRemoteSoldierPhaseError';}
}

/** Recovered baddies.stepFrame: movement updates speed first, then bon advances
 * by that retained displacement. This is one subtraction, not a modulo. */
export function advanceOriginalRemoteSoldierPhase(phase:number,speed:Readonly<OriginalRemotePosition>):number {
  if(![phase,speed.x,speed.y,speed.z].every(Number.isFinite))throw new OriginalRemoteSoldierPhaseError();
  const next=phase+Math.hypot(speed.x,speed.y,speed.z)/ORIGINAL_MAP_SCALE*10;
  if(!Number.isFinite(next))throw new OriginalRemoteSoldierPhaseError();
  return next>1000?next-1000:next;
}
