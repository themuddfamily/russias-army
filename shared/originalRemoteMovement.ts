/** Recovered ParentScript 8 baddies.ls, identical in Barrack and Woodland.
 * Coordinates use the caller's units; yaw uses radians instead of source degrees.
 * Packet cadence and wall-clock callback scheduling are transport adapters.
 */
export interface OriginalRemotePosition {x:number;y:number;z:number}
export interface OriginalRemoteMovement {
  position:OriginalRemotePosition;
  target:OriginalRemotePosition;
  yaw:number;
  targetYaw:number;
  speed:OriginalRemotePosition;
  steps:number;
}
const copyPosition=(p:OriginalRemotePosition):OriginalRemotePosition=>({x:p.x,y:p.y,z:p.z});
export function createOriginalRemoteMovement(position:OriginalRemotePosition,yaw:number,currentPosition:OriginalRemotePosition=position):OriginalRemoteMovement {
  return {position:copyPosition(currentPosition),target:copyPosition(position),yaw,targetYaw:yaw,speed:{x:0,y:0,z:0},steps:10};
}
/** newstuff preserves the negative callback count as extra catch-up time. */
export function receiveOriginalRemoteMovement(state:OriginalRemoteMovement,position:OriginalRemotePosition,yaw:number):void {
  state.steps=state.steps>0?10:10-state.steps;
  state.target=copyPosition(position);state.targetYaw=yaw;
}
/** stepFrame decrements before moving. Snap deliberately retains prior speed.
 * True marks the exact source -450 disconnect boundary after this callback. */
export function stepOriginalRemoteMovement(state:OriginalRemoteMovement):boolean {
  state.steps-=1;
  if(state.steps>0){
    state.speed={x:(state.target.x-state.position.x)/state.steps,y:(state.target.y-state.position.y)/state.steps,z:(state.target.z-state.position.z)/state.steps};
    state.position.x+=state.speed.x;state.position.y+=state.speed.y;state.position.z+=state.speed.z;
    state.yaw+=(state.targetYaw-state.yaw)/state.steps*2;
  }else{
    state.position=copyPosition(state.target);state.yaw=state.targetYaw;
  }
  return state.steps===-450;
}
