import type {Vec3} from './protocol';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';

/** Both editions: generics planemakeme 145–155, miss 4–35, blood 4–36,
 * puff 4–32. One step is one actor callback, not elapsed seconds. The native
 * actor-list birth phase, plane handedness, filtering and texture-transform
 * wrapping are not determined here. Positions supplied by callers are already
 * in world coordinates; source lengths below explicitly use the map scale. */
export const ORIGINAL_COMBAT_PLANE_SIZE = 50 * ORIGINAL_MAP_SCALE;

interface OriginalCombatEffectState {
  position:Vec3;
  alive:boolean;
  /** Model multiplier of the source 50-unit square plane. */
  scale:number;
  /** Full side length in the copy's world coordinates. */
  size:number;
  blend:number;
  opacity:number;
}
export interface OriginalMissEffectState extends OriginalCombatEffectState {
  texture:'decal'|'decalspas';
  remainingCallbacks:number;
}
export interface OriginalBloodEffectState extends OriginalCombatEffectState {
  texture:'spatter';
  remainingCallbacks:number;
  /** Raw Director texture transform, not a guessed normalized atlas cell. */
  textureScale:Vec3;
  texturePosition:Vec3;
}
export interface OriginalRpgPuffEffectState extends OriginalCombatEffectState {
  texture:'pufft';
  myscale:number;
  rollDegrees:number;
}

export function createOriginalMissEffect(position:Vec3,normal:Vec3,shotgun:boolean):OriginalMissEffectState {
  const scale=shotgun?.5:.4;
  return {position:{x:position.x+normal.x*ORIGINAL_MAP_SCALE,y:position.y+normal.y*ORIGINAL_MAP_SCALE,z:position.z+normal.z*ORIGINAL_MAP_SCALE},
    alive:true,texture:shotgun?'decalspas':'decal',scale,size:ORIGINAL_COMBAT_PLANE_SIZE*scale,
    blend:40,opacity:.4,remainingCallbacks:80};
}

export function stepOriginalMissEffect(state:OriginalMissEffectState):void {
  if(!state.alive)return;
  // Source adds to world, checks zero, removes, THEN decrements.
  if(state.remainingCallbacks===0)state.alive=false;
  state.remainingCallbacks--;
}

export function createOriginalBloodEffect(position:Vec3):OriginalBloodEffectState {
  return {position:{...position},alive:true,texture:'spatter',scale:2,size:ORIGINAL_COMBAT_PLANE_SIZE*2,
    blend:50,opacity:.5,remainingCallbacks:8,textureScale:{x:3,y:3,z:3},texturePosition:{x:1,y:1,z:0}};
}

export function stepOriginalBloodEffect(state:OriginalBloodEffectState,goodyPresent=true):void {
  if(!state.alive||!goodyPresent)return;
  // Texture and pointAt change before the pre-decrement lifetime check.
  state.texturePosition.x--;
  if(state.texturePosition.x===-3){state.texturePosition.x=0;state.texturePosition.y++;}
  if(state.remainingCallbacks<1)state.alive=false;
  state.remainingCallbacks-=4;
}

/** JS uniform random is an explicit adapter for Director random(36). Supplying
 * a deterministic [0,1) sample exposes the exact 36 native integer outcomes. */
export function createOriginalRpgPuffEffect(position:Vec3,random:()=>number=Math.random):OriginalRpgPuffEffectState {
  const sample=random();
  if(!Number.isFinite(sample)||sample<0||sample>=1)throw new Error('Invalid original puff random sample');
  return {position:{x:position.x,y:position.y+10*ORIGINAL_MAP_SCALE,z:position.z},alive:true,
    texture:'pufft',scale:.01,size:ORIGINAL_COMBAT_PLANE_SIZE*.01,blend:50,opacity:.5,
    myscale:0,rollDegrees:(Math.floor(sample*36)+1)*10};
}

export function stepOriginalRpgPuffEffect(state:OriginalRpgPuffEffectState):void {
  if(!state.alive)return;
  state.myscale+=6;
  state.blend=100-state.myscale*.55;
  state.opacity=state.blend/100;
  state.scale=state.myscale*.02;
  state.size=ORIGINAL_COMBAT_PLANE_SIZE*state.scale;
  // Preserve even the terminal negative blend before removing the actor.
  if(state.myscale>180)state.alive=false;
}
