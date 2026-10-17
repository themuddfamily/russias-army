import type {WeaponId} from './protocol';

/** ParentScript 6 - weaponry.ls, preserved Barrack 2011 / Woodland 2015.
 * One step is one original gun callback. Elapsed-time scheduling belongs to
 * the caller; 30 Hz is the movie's nominal actor callback rate.
 */
export type OriginalWeaponCounterMap='barrack'|'woodlands';
export const ORIGINAL_WEAPON_WAIT:Readonly<Record<WeaponId,number>>={
  pistol:8,shotgun:15,rifle:2,launcher:10,rpg:10,sniper:50,
};
export interface OriginalWeaponCounterState {readonly waitgun:number;readonly poldwaitgun:number}
export interface OriginalRpgShotResult {ammo:number;reserve:number;canReload:boolean}
export interface OriginalWeaponCounterStep {
  /** Chat suppresses reload and Barrack's readiness calculation/increment. */
  inputEnabled?:boolean;
  /** A successful held-R reload, after Woodland decrement, before the gate.
   * Empty-weapon fallback is not a successful reload and must leave this false.
   */
  reload?:boolean;
}
export class OriginalWeaponCounter {
  private waitgun:number;
  private poldwaitgun=0;
  constructor(readonly map:OriginalWeaponCounterMap,initialWeapon:WeaponId='launcher') {
    this.waitgun=map==='barrack'?ORIGINAL_WEAPON_WAIT[initialWeapon]:0;
  }
  get state():OriginalWeaponCounterState {return {waitgun:this.waitgun,poldwaitgun:this.poldwaitgun};}
  restore(state:OriginalWeaponCounterState):void {
    if(!Number.isSafeInteger(state.waitgun)||!Number.isSafeInteger(state.poldwaitgun)){
      throw new Error('Invalid original weapon counter state');
    }
    this.waitgun=state.waitgun;this.poldwaitgun=state.poldwaitgun;
  }
  step(weapon:WeaponId|null,options:OriginalWeaponCounterStep={}):boolean {
    if(this.map==='woodlands')this.waitgun--;
    if(weapon===null||options.inputEnabled===false)return false;
    if(options.reload)this.reload();
    if(this.map==='woodlands')return this.waitgun<1;
    let delta=this.waitgun-this.poldwaitgun;
    const wait=ORIGINAL_WEAPON_WAIT[weapon];
    if(delta>wait*2){
      this.poldwaitgun=this.waitgun;delta=0;
    }else if(delta<=wait){
      this.waitgun++;
    }
    // The source tests the saved difference, not the incremented counter.
    return delta>=wait;
  }
  reload():void {
    if(this.map==='woodlands')this.waitgun=30;
    else this.poldwaitgun=this.waitgun+20;
  }
  shot(weapon:WeaponId):void {
    this.waitgun=this.map==='woodlands'?ORIGINAL_WEAPON_WAIT[weapon]:this.poldwaitgun;
  }
  clone():OriginalWeaponCounter {
    const result=new OriginalWeaponCounter(this.map);
    result.waitgun=this.waitgun;result.poldwaitgun=this.poldwaitgun;return result;
  }
  fork():OriginalWeaponCounter {return this.clone();}
  framesUntilReady(weapon:WeaponId|null,limit=256):number {
    if(weapon===null)return Infinity;
    const preview=this.clone();
    for(let callbacks=1;callbacks<=limit;callbacks++)if(preview.step(weapon))return callbacks;
    return Infinity;
  }
  /** Number of future input-enabled callbacks until the next ready gate.
   * Includes that callback (minimum 1); does not mutate the live counter.
   */
  callbacksUntilReady(weapon:WeaponId):number {
    const result=this.framesUntilReady(weapon);
    if(!Number.isFinite(result))throw new Error('Original weapon counter did not reach a ready gate');
    return result;
  }
}

/** A loaded RPG branch from gun(), with the saved `bullets` assignment last.
 * Barrack resets its shot counter before reload; Woodland resets it after the
 * rocket constructor/submission. The optional callback marks that source point,
 * and receives the temporarily refilled chamber before the saved overwrite.
 * This models script order, not the native actor/network scheduler.
 */
export function originalRpgShot(
  counter:OriginalWeaponCounter,ammo:number,reserve:number,capacity=1,
  spawn?:(loaded:{ammo:number;reserve:number})=>void,
):OriginalRpgShotResult {
  if(ammo<=0)throw new Error('Original RPG shot requires a loaded chamber');
  const savedBullets=ammo;
  if(counter.map==='barrack')counter.shot('rpg');
  // reload() succeeds with an already loaded chamber even at zero reserve.
  // Preserve its signed vneeded calculation instead of clamping a full load.
  if(reserve>0){
    const needed=capacity-ammo;
    const given=reserve>=needed?needed:reserve;
    reserve-=given;ammo+=given;
  }
  counter.reload();
  spawn?.({ammo,reserve});
  if(counter.map==='woodlands')counter.shot('rpg');
  return {ammo:savedBullets-1,reserve,canReload:true};
}
