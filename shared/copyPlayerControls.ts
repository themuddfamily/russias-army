import type {OriginalPlayerMovementMode} from './protocol';
export type CopyMovementMode=OriginalPlayerMovementMode;
import {applyOriginalPlayerControls,ORIGINAL_PLAYER_HORIZONTAL_DRAG,type OriginalPlayerBody,type OriginalPlayerControls} from './originalPlayerPhysics';

export function isCopyMovementMode(value:unknown):value is CopyMovementMode {
 return value==='source'||value==='modern-walk'||value==='modern-sprint'||value==='modern-aim';
}

/** Optional copy controls change only horizontal movement impulse. The source
 * grounded latch, drag, pitched vertical impulse and jump remain shared. */
export function applyOriginalPlayerMovementControls(body:OriginalPlayerBody,input:OriginalPlayerControls,mode:CopyMovementMode='source') {
 const before={...body.velocity};
 const control=applyOriginalPlayerControls(body,input);
 const scale=mode==='modern-sprint'?7.2/4.55:mode==='modern-aim'?2.6/4.55:1;
 if(control.grounded&&!input.typing&&scale!==1){
  body.velocity.x+=(scale-1)*(body.velocity.x-ORIGINAL_PLAYER_HORIZONTAL_DRAG*before.x);
  body.velocity.z+=(scale-1)*(body.velocity.z-ORIGINAL_PLAYER_HORIZONTAL_DRAG*before.z);
 }
 return control;
}
