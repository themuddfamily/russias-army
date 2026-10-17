import {cloneOriginalAngularBody} from '../shared/originalAngularBody';
import type {OriginalProjectileState} from '../shared/originalExplosives';

export type OriginalLauncherPredictionStep=(state:OriginalProjectileState)=>{detonated:boolean};

/** Matches the prediction clone: mutable physical vectors are detached while
 * immutable convex/reference inertia metadata retain their original identity. */
function clone(state:OriginalProjectileState):OriginalProjectileState {
 return {...state,position:{...state.position},velocity:{...state.velocity},direction:{...state.direction},
  ...(state.sourceRotation?{sourceRotation:{...state.sourceRotation}}:{}),
  ...(state.angular?{angular:cloneOriginalAngularBody(state.angular)}:{})};
}

/** Launcher-only physical prefixes for internally owned authority seeds.
 * Seed fields and their readonly dependencies must remain unchanged by identity.
 * geometryToken identifies the immutable collision snapshot, not its mutable
 * facade. step must be stable, deterministic and have no presentation/contact
 * side effects; changed collision/parameter semantics require a new identity.
 * This does not cache arbitrary mutable caller inputs or RPG puff effects. */
export class OriginalLauncherPrediction {
 private seed?:OriginalProjectileState;
 private geometryToken?:object;
 private step?:OriginalLauncherPredictionStep;
 private endpoints:OriginalProjectileState[]=[];
 private terminal=false;

 clear():void {
  this.seed=undefined;this.geometryToken=undefined;this.step=undefined;
  this.endpoints=[];this.terminal=false;
 }

 predict(seed:OriginalProjectileState,geometryToken:object,frames:number,step:OriginalLauncherPredictionStep):OriginalProjectileState {
  if(seed.weapon!=='launcher')throw Error('Launcher prediction requires a launcher seed');
  if(!Number.isSafeInteger(frames)||frames<0)throw Error('Invalid launcher prediction callback count');
  if((typeof geometryToken!=='object'&&typeof geometryToken!=='function')||geometryToken===null||typeof step!=='function')throw Error('Invalid launcher prediction dependency');
  if(this.seed!==seed||this.geometryToken!==geometryToken||this.step!==step){
   const initial=clone(seed);
   this.seed=seed;this.geometryToken=geometryToken;this.step=step;
   this.endpoints=[initial];this.terminal=false;
  }
  while(this.endpoints.length<=frames&&!this.terminal){
   // Commit only a completed callback. A throwing step cannot corrupt the
   // stored prefix or publish a partially advanced endpoint on a later call.
   const next=clone(this.endpoints[this.endpoints.length-1]);
   const result=step(next);
   this.endpoints.push(clone(next));this.terminal=result.detonated;
  }
  return clone(this.endpoints[Math.min(frames,this.endpoints.length-1)]);
 }
}
