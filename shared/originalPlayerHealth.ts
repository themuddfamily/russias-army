import type {OriginalPlayerHealthState} from './protocol';

export type {OriginalPlayerHealthState} from './protocol';

export interface OriginalPlayerHealthMutation {health:number;dead:boolean}

function validateState(state:OriginalPlayerHealthState):void {
  if(!Number.isFinite(state.canonical)||(state.flick!==2&&state.flick!==-2)){
    throw new Error('Invalid original player health state');
  }
}

/** Preserved goody.ls stores plives = canonical + flick and poldlives = canonical.
 * Keep the signed canonical value after mutation so the caller can route death;
 * resetting the source actor's plives belongs to that terminal presentation.
 */
export function createOriginalPlayerHealth(canonical=100,flick:2|-2=2):OriginalPlayerHealthState {
  const state={canonical,flick};
  validateState(state);
  return state;
}

/** cheatfinder runs once at the end of goody's callback. It does not test death. */
export function stepOriginalPlayerHealth(state:OriginalPlayerHealthState):void {
  validateState(state);
  state.flick=state.flick===2?-2:2;
}

/** setlives adds an uncapped signed delta and tests (plives + flick) < 0. */
export function applyOriginalPlayerHealthDelta(state:OriginalPlayerHealthState,delta:number):OriginalPlayerHealthMutation {
  validateState(state);
  const health=state.canonical+delta;
  if(!Number.isFinite(delta)||!Number.isFinite(health)){
    throw new Error('Invalid original player health delta');
  }
  state.canonical=health;
  return {health,dead:health+2*state.flick<0};
}

export function applyOriginalPlayerDamage(state:OriginalPlayerHealthState,amount:number):OriginalPlayerHealthMutation {
  return applyOriginalPlayerHealthDelta(state,-amount);
}
