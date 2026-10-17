import * as THREE from 'three';
import type {Vec3} from '../shared/protocol';

export const ORIGINAL_DOOR_TRACKS_URL = '/assets/original-scenes/barrack/doors.json';
export const ORIGINAL_DOOR_TRIGGER_SOURCE_DISTANCE = 100;
export const ORIGINAL_DOOR_FREEZE_SECONDS = 1.6;
export interface OriginalDoorKey {
  time:number;
  position:readonly [number,number,number];
  quaternion_xyzw:readonly [number,number,number,number];
  scale:readonly [number,number,number];
}
export interface OriginalDoorTrack {
  name:string;
  motionName:string;
  baseMatrix:readonly number[];
  keys:readonly OriginalDoorKey[];
}
export interface OriginalDoorTracks {version:1;doors:readonly OriginalDoorTrack[]}
export type OriginalDoorPhase = 'closed'|'opening'|'open';
export interface OriginalDoorState {name:string;phase:OriginalDoorPhase;elapsedSeconds:number}
export interface OriginalDoorOpenEvent {name:string;remote:boolean;position:Vec3}
export interface OriginalSceneDoorOptions {onOpen?:(event:OriginalDoorOpenEvent)=>void}
interface Door {track:OriginalDoorTrack;model:THREE.Group;phase:OriginalDoorPhase;elapsed:number}

function validate(data:OriginalDoorTracks):void {
  if(data.version!==1||!Array.isArray(data.doors))throw new Error('Invalid original door asset');
  const names=new Set<string>();
  for(const d of data.doors){
    if(!d.name||names.has(d.name)||!d.motionName||d.baseMatrix.length!==16||!d.baseMatrix.every(Number.isFinite)||!d.keys.length)throw new Error(`Invalid original door track: ${d.name}`);
    names.add(d.name);let previous=-Infinity;
    for(const k of d.keys){
      if(!Number.isFinite(k.time)||k.time<0||k.time<previous||k.position.length!==3||k.scale.length!==3||k.quaternion_xyzw.length!==4||![...k.position,...k.scale,...k.quaternion_xyzw].every(Number.isFinite)||Math.hypot(...k.quaternion_xyzw)<1e-9)throw new Error(`Invalid original door key: ${d.name}`);
      previous=k.time;
    }
  }
}
export async function loadOriginalDoorTracks(fetcher:typeof fetch=fetch):Promise<OriginalDoorTracks> {
  const response=await fetcher(ORIGINAL_DOOR_TRACKS_URL);
  if(!response.ok)throw new Error(`Original door asset failed: ${response.status}`);
  const data=await response.json() as OriginalDoorTracks;validate(data);return data;
}

/** Original keys are local Z-up deltas. Compose the intact source base on the
 * left; the surrounding original scene group converts basis and units once.
 */
export function sampleOriginalDoorMatrix(track:OriginalDoorTrack,timeSeconds:number):THREE.Matrix4 {
  const keys=track.keys;let a=keys[0],b=a,alpha=0;
  if(timeSeconds>=keys[keys.length-1].time)a=b=keys[keys.length-1];
  else if(timeSeconds>a.time){
    let index=0;while(index<keys.length-2&&keys[index+1].time<timeSeconds)index++;
    a=keys[index];b=keys[index+1];alpha=b.time>a.time?(timeSeconds-a.time)/(b.time-a.time):0;
  }
  const position=new THREE.Vector3(...a.position).lerp(new THREE.Vector3(...b.position),alpha);
  const scale=new THREE.Vector3(...a.scale).lerp(new THREE.Vector3(...b.scale),alpha);
  const rotation=new THREE.Quaternion(...a.quaternion_xyzw).normalize().slerp(new THREE.Quaternion(...b.quaternion_xyzw).normalize(),alpha);
  return new THREE.Matrix4().fromArray(track.baseMatrix).multiply(new THREE.Matrix4().compose(position,rotation,scale));
}

/** Source doors trigger automatically, remove physics immediately, and remain
 * open. onOpen runs once for local and remote triggers, before visual movement;
 * use event.remote to avoid relaying a received event back to the server.
 */
export class OriginalSceneDoors {
  private readonly doors=new Map<string,Door>();
  private readonly triggerDistance:number;
  constructor(models:ReadonlyMap<string,THREE.Group>,tracks:OriginalDoorTracks,scale:number,private readonly options:OriginalSceneDoorOptions={}){
    validate(tracks);if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid original door scale');
    this.triggerDistance=ORIGINAL_DOOR_TRIGGER_SOURCE_DISTANCE*scale;
    for(const track of tracks.doors){
      const model=models.get(track.name);if(!model)throw new Error(`Missing original door model: ${track.name}`);
      const base=new THREE.Matrix4().fromArray(track.baseMatrix);model.matrixAutoUpdate=false;model.matrix.copy(base);model.matrixWorldNeedsUpdate=true;
      this.doors.set(track.name,{track,model,phase:'closed',elapsed:0});
    }
  }
  getState(name:string):OriginalDoorState|undefined {
    const d=this.doors.get(name);return d?{name,phase:d.phase,elapsedSeconds:d.elapsed}:undefined;
  }
  /** Source-space matrix; returning a clone prevents callers changing door state. */
  getModelMatrix(name:string):THREE.Matrix4|undefined {return this.doors.get(name)?.model.matrix.clone();}
  trigger(name:string,remote=false):boolean {
    const d=this.doors.get(name);if(!d||d.phase!=='closed')return false;
    d.model.updateWorldMatrix(true,false);const p=d.model.getWorldPosition(new THREE.Vector3());
    d.phase='opening';d.elapsed=0;
    this.options.onOpen?.({name,remote,position:{x:p.x,y:p.y,z:p.z}});
    return true;
  }
  /** playerEye uses the same normalized world coordinates as the scene camera. */
  triggerNearby(playerEye:Vec3):string[] {
    if(![playerEye.x,playerEye.y,playerEye.z].every(Number.isFinite))throw new Error('Invalid original door proximity position');
    const opened:string[]=[];const eye=new THREE.Vector3(playerEye.x,playerEye.y,playerEye.z);
    for(const [name,d]of this.doors){
      if(d.phase!=='closed')continue;
      d.model.updateWorldMatrix(true,false);
      if(d.model.getWorldPosition(new THREE.Vector3()).distanceTo(eye)<this.triggerDistance&&this.trigger(name))opened.push(name);
    }
    return opened;
  }
  update(deltaSeconds:number):void {
    if(!Number.isFinite(deltaSeconds)||deltaSeconds<0)throw new Error('Invalid original door elapsed time');
    for(const d of this.doors.values()){
      if(d.phase!=='opening')continue;
      d.elapsed+=deltaSeconds;
      // Source stops once its clock exceeds1600ms, inside the open hold phase.
      // Clamp to that phase boundary so a suspended frame cannot reach reclose.
      d.model.matrix.copy(sampleOriginalDoorMatrix(d.track,Math.min(d.elapsed,ORIGINAL_DOOR_FREEZE_SECONDS)));
      d.model.matrixWorldNeedsUpdate=true;d.model.updateWorldMatrix(false,true);
      if(d.elapsed>ORIGINAL_DOOR_FREEZE_SECONDS){d.elapsed=ORIGINAL_DOOR_FREEZE_SECONDS;d.phase='open';}
    }
  }
}
export function createOriginalSceneDoors(models:ReadonlyMap<string,THREE.Group>,tracks:OriginalDoorTracks,scale:number,options:OriginalSceneDoorOptions={}):OriginalSceneDoors {
  return new OriginalSceneDoors(models,tracks,scale,options);
}
