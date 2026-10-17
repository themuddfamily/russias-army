import type {DoorSnapshot,Vec3} from '../shared/protocol';
import type {OriginalArena} from './originalArena';

/** Keeps source animation monotonic even when a measured server clock changes.
 * Online openings come exclusively from accepted server events/snapshots.
 */
export class OriginalDoorClient {
  private arena?:Pick<OriginalArena,'doorWorld'|'updateDoors'|'resetDoors'>;
  private time=0;
  attach(arena:Pick<OriginalArena,'doorWorld'|'updateDoors'|'resetDoors'>|undefined):void {
    if(this.arena===arena)return;
    this.arena=arena;this.time=0;
  }
  reset(atSeconds:number):void {
    this.time=atSeconds;this.arena?.resetDoors(atSeconds);
  }
  update(atSeconds:number,soloEye?:Vec3):string[] {
    this.time=Math.max(this.time,atSeconds);
    return this.arena?.updateDoors(this.time,soloEye)??[];
  }
  snapshot(doors:readonly DoorSnapshot[]|undefined,serverTimeMs:number,fresh=false):void {
    if(!this.arena||!doors)return;
    const at=serverTimeMs/1000;
    if(fresh){this.time=at;this.arena.doorWorld.reconcile(doors.map(d=>({...d,openedAt:d.openedAt===null?null:d.openedAt/1000})),at);}
    else for(const door of doors)if(door.openedAt!==null)this.arena.doorWorld.setOpenedAt(door.name,door.openedAt/1000);
    this.update(at);
  }
  opened(name:string,openedAtMs:number,serverTimeMs:number):boolean {
    const first=this.arena?.doorWorld.getStates().some(d=>d.name===name&&d.openedAt===null)??false;
    this.arena?.doorWorld.setOpenedAt(name,openedAtMs/1000);
    this.update(serverTimeMs/1000);
    return first;
  }
}
