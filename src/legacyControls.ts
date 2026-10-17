import type { WeaponId } from './weapons';

export type ControlPreset = 'legacy' | 'modern';

/** Legacy lateral arrows steer; Modern arrows retain the optional strafe alias. */
export function movementAxes(keys:ReadonlySet<string>, arrows=false,preset:ControlPreset='modern') {
  const strafeArrows=arrows&&preset==='modern';
  return {
    forward:Number(keys.has('KeyW')||(arrows&&keys.has('ArrowUp')))-Number(keys.has('KeyS')||(arrows&&keys.has('ArrowDown'))),
    side:Number(keys.has('KeyD')||(strafeArrows&&keys.has('ArrowRight')))-Number(keys.has('KeyA')||(strafeArrows&&keys.has('ArrowLeft'))),
  };
}

/** Recovered goody.stepFrame adds five degrees for Left, else subtracts five
 * for Right. Convert its nominal 30 FPS increment to elapsed-time Three yaw:
 * positive yaw turns the camera left. Source keycodes are confirmed by ScummVM
 * engines/director/util.cpp's Macintosh mapping (123/124/125/126).
 */
export function legacyArrowTurn(keys:ReadonlySet<string>,arrows:boolean,deltaSeconds:number,preset:ControlPreset='legacy'):number {
  if(!arrows||preset!=='legacy')return 0;
  const direction=keys.has('ArrowLeft')?1:keys.has('ArrowRight')?-1:0;
  return direction*(5*Math.PI/180)*30*Math.max(0,deltaSeconds);
}

export function aimingHeld(preset:ControlPreset,keys:ReadonlySet<string>,rightMouse:boolean,weapon:WeaponId):boolean {
  // A surviving desktop player guide limits old-version aiming to Dragunov.
  if(preset==='legacy'&&weapon!=='sniper')return false;
  return rightMouse||(preset==='legacy'&&(keys.has('ShiftLeft')||keys.has('ShiftRight')));
}

export function sprintHeld(preset:ControlPreset,keys:ReadonlySet<string>,aiming:boolean,arrows=false):boolean {
  if(preset!=='modern'||aiming||(!keys.has('ShiftLeft')&&!keys.has('ShiftRight')))return false;
  const move=movementAxes(keys,arrows,preset);return move.forward!==0||move.side!==0;
}
