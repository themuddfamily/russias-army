/** Numerical sniper actor recovered from both editions' ParentScript 7. */
export interface OriginalScopeState {
  active:boolean;
  fov:number;
  mouseDelta:number;
  ptog:'open'|'zoom'|'zoomed'|'zoomdone';
  zoomonce:0|1;
}
export function createOriginalScope():OriginalScopeState {
  return {active:false,fov:50,mouseDelta:.5,ptog:'open',zoomonce:1};
}
export function closeOriginalScope(state:OriginalScopeState):void {
  state.active=false;state.fov=50;state.mouseDelta=.5;state.zoomonce=1;
}
/** Called by weaponry.gun, after goody's mouse callback. Returns whether created. */
export function openOriginalScope(state:OriginalScopeState,dragunov:boolean,typing:boolean,shift:boolean):boolean {
  if(!dragunov||typing||!shift||state.zoomonce!==1)return false;
  state.active=true;state.fov=35;state.ptog='open';state.zoomonce=0;return true;
}
export function stepOriginalScope(state:OriginalScopeState,dragunov:boolean,typing:boolean,shift:boolean):void {
  if(!state.active)return;
  if(state.fov>8){state.fov-=.75;state.mouseDelta*=.93;}
  if(state.fov<30){
    if(shift){if(state.ptog==='open'||state.ptog==='zoomdone')state.ptog='zoomed';}
    else if(state.ptog==='zoom')state.ptog='zoomdone';
    else if(state.ptog==='zoomed')closeOriginalScope(state);
  }
  if(!dragunov||typing)closeOriginalScope(state);
}
