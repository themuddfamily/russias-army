import type {Vec3} from '../shared/protocol';
import {applyOriginalPlayerControls, ORIGINAL_PLAYER_DERIVATIVE_FACTOR, ORIGINAL_PLAYER_HORIZONTAL_DRAG, type OriginalPlayerBody} from '../shared/originalPlayerPhysics';

export interface OriginalSoloBotIntent {direction:Readonly<Vec3>;speed:number}

/** Authored AI speed adapter. The source ground latch and drag remain physical;
 * retained collision momentum is never replaced by a target velocity or pose.
 * The push gives the authored wall-clock speed at steady state on level ground.
 */
export function applyOriginalSoloBotIntent(body:OriginalPlayerBody,intent:OriginalSoloBotIntent):{grounded:boolean;jumped:boolean} {
  const {direction,speed}=intent;
  if(!Number.isFinite(speed)||speed<0||![direction.x,direction.y,direction.z].every(Number.isFinite))throw Error('Invalid solo bot intent');
  const result=applyOriginalPlayerControls(body,{yaw:0,pitch:0,typing:true});
  const length=Math.hypot(direction.x,direction.z);
  if(result.grounded&&length>0){
    const push=(1-ORIGINAL_PLAYER_HORIZONTAL_DRAG)*speed/ORIGINAL_PLAYER_DERIVATIVE_FACTOR;
    body.velocity.x+=direction.x/length*push;
    body.velocity.z+=direction.z/length*push;
  }
  return result;
}

export {sourceRotationForSoloDirection} from '../shared/originalSoloBotShotCapture';
