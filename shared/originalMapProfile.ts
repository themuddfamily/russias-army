import type {LegacyMapId} from './legacyMaps';
import type {Vec3} from './protocol';
import {sourcePointToWorld} from './originalSceneGeometry';

/** Source makedummy names its sphere "20" but never sets radius. Director's
 * default sphere radius is 25: Using Director 11.5, printed p333 / PDF p344.
 * https://help.adobe.com/en_US/Director/11.5/UsingDirector/director_11.5_help.pdf
 * goody.stepFrame places the eye 60 source units above the sphere center.
 * 1.72/85 is a caller adaptation to this client's eye height, not historical meters.
 */
export const ORIGINAL_SOURCE_PLAYER_RADIUS = 25;
export const ORIGINAL_SOURCE_PLAYER_EYE_HEIGHT = 85;
export const ORIGINAL_PLAYER_EYE_HEIGHT = 1.72;
export const ORIGINAL_MAP_SCALE = ORIGINAL_PLAYER_EYE_HEIGHT / ORIGINAL_SOURCE_PLAYER_EYE_HEIGHT;
export const ORIGINAL_PLAYER_RADIUS = ORIGINAL_SOURCE_PLAYER_RADIUS * ORIGINAL_MAP_SCALE;
export const ORIGINAL_PLAYER_BODY_HEIGHT = 2 * ORIGINAL_PLAYER_RADIUS;

export interface OriginalSourceSpawn {
  /** Exact original Z-up vstarts entry, before goody.prepare adds (4,0,25). */
  position: readonly [number,number,number];
  /** Exact original Director rotation vector in degrees, including accumulated turns. */
  rotation: readonly [number,number,number];
}
/** Recovered BehaviorScript 32 - explore.ls, each edition's buildlevel handler. */
export const ORIGINAL_SOURCE_SPAWNS: Readonly<Record<LegacyMapId,readonly OriginalSourceSpawn[]>> = {
  barrack: [
    {position:[296,-563,87],rotation:[1,0,-1264]},
    {position:[-5018,2835,87],rotation:[-1,0,-1532]},
    {position:[-3996,-5565,87],rotation:[1,0,-1872]},
    {position:[3810,-1686,411],rotation:[4,0,-2210]},
    {position:[3072,2157,489],rotation:[-2,0,-2377]},
    {position:[-197,-2748,559],rotation:[-2,0,-2544]},
  ],
  woodlands: [
    {position:[166,4016,914],rotation:[1,0,-1259]},
    {position:[-3414,-2975,-236],rotation:[1,0,-1159]},
    {position:[2613,-1584,-373],rotation:[1,0,-1004]},
    {position:[5548,-5578,628],rotation:[-10,0,-1416]},
    {position:[615,-6591,556],rotation:[-10,0,-1086]},
    {position:[2096,-4255,326],rotation:[-10,0,-1056]},
  ],
};

export interface OriginalSpawnSupport {
  /** Highest supported feet height at or below maxY. */
  supportHeightAt(x:number,z:number,maxY:number):number|undefined;
  /** Optional radius-aware sphere/capsule feet support. Same feet-height convention. */
  playerSupportHeightAt?(x:number,z:number,maxY:number,radius:number,height:number):number|undefined;
  /** Resolve actual triangle penetration by contact normals, without moving source anchors. */
  resolvePlayerOverlap?(feet:Vec3,radius:number,height:number):Vec3;
  playerIntersects?(feet:Vec3,radius:number,height:number):boolean;
}

/** Grounded joining is an adaptation: original prepare starts the sphere at
 * vstart+(4,0,25), then gravity and contact resolution settle it. Start
 * at that horizontal offset, resolve triangle contacts and return supported feet.
 * Source spawn Z is an initialization coordinate, never a floor height.
 */
export function getOriginalSettledSpawns(map:LegacyMapId,geometry:OriginalSpawnSupport):Vec3[] {
  return ORIGINAL_SOURCE_SPAWNS[map].map(({position},index)=>{
    const initialCenter=sourcePointToWorld([position[0]+4,position[1],position[2]+25],ORIGINAL_MAP_SCALE);
    const supportAt=(x:number,z:number)=>geometry.playerSupportHeightAt
      ? geometry.playerSupportHeightAt(x,z,initialCenter.y,ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_BODY_HEIGHT)
      : geometry.supportHeightAt(x,z,initialCenter.y);
    const requireSupport=(x:number,z:number)=>{
      const y=supportAt(x,z);
      if(y===undefined||!Number.isFinite(y))throw new Error(`Original ${map} spawn ${index} has no recovered support.`);
      return y;
    };
    let feet={x:initialCenter.x,y:requireSupport(initialCenter.x,initialCenter.z),z:initialCenter.z};
    // Source Havok also depenetrates nearby walls while the dummy falls.
    // Alternate actual-normal resolution and rounded standing support until settled.
    if(geometry.resolvePlayerOverlap){
      for(let iteration=0;iteration<24;iteration++){
        const pushed=geometry.resolvePlayerOverlap(feet,ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_BODY_HEIGHT);
        const next={x:pushed.x,y:requireSupport(pushed.x,pushed.z),z:pushed.z};
        if(![next.x,next.y,next.z].every(Number.isFinite))throw new Error(`Original ${map} spawn ${index} resolved to invalid coordinates.`);
        const moved=Math.hypot(next.x-feet.x,next.y-feet.y,next.z-feet.z);
        feet=next;
        if(moved<1e-8&&!geometry.playerIntersects?.(feet,ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_BODY_HEIGHT))break;
      }
      if(geometry.playerIntersects?.(feet,ORIGINAL_PLAYER_RADIUS,ORIGINAL_PLAYER_BODY_HEIGHT))throw new Error(`Original ${map} spawn ${index} remains inside original geometry.`);
    }
    return feet;
  });
}
