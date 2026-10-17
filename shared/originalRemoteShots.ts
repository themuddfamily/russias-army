import type {WeaponId} from './protocol';

/** Explicit wire/queue bound, not a recovered Director counter limit. */
export const MAX_ORIGINAL_REMOTE_SHOTS=128;
export interface OriginalRemoteShots {misses:number;aiming:number}

/** Source initializes misses to zero; zero aiming adapts its unspecified initial
 * property value. Neither value is an array of historical per-shot weapons. */
export function createOriginalRemoteShots():OriginalRemoteShots {
 return {misses:0,aiming:0};
}
export function isOriginalRemoteShotReport(value:unknown):value is number|undefined {
 return value===undefined||(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=MAX_ORIGINAL_REMOTE_SHOTS);
}
/** MUS where replaces misses for a positive report; absent/zero preserves it. */
export function receiveOriginalRemoteShots(state:OriginalRemoteShots,shots:number|undefined):void {
 if(!isOriginalRemoteShotReport(shots))throw new RangeError('Invalid original remote shot report');
 if(shots!==undefined&&shots>0)state.misses=shots;
}
/** One baddies.stepFrame prefix, before gun refresh, orientation and movement.
 * True means shoot ran, even for a weapon without a muzzle/sound case. SPAS
 * subtracts twice and can leave misses negative. Aiming reaching zero still
 * consumes this callback without firing. The caller sets bon=2000 on true. */
export function stepOriginalRemoteShots(state:OriginalRemoteShots,weapon:WeaponId):boolean {
 if(state.aiming>0){state.aiming--;return false;}
 if(state.misses<=0)return false;
 state.misses--;
 switch(weapon){
  case 'pistol':state.aiming=8;break;
  case 'shotgun':state.misses--;state.aiming=15;break;
  case 'rifle':case 'sniper':state.aiming=2;break;
 }
 return true;
}
