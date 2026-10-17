import type { LegacyMapId } from './legacyMaps';
import { createOriginalSceneGeometry, type OriginalSceneData } from './originalSceneGeometry';
import { ORIGINAL_MAP_SCALE, ORIGINAL_PLAYER_RADIUS, ORIGINAL_PLAYER_BODY_HEIGHT, ORIGINAL_PLAYER_EYE_HEIGHT, getOriginalSettledSpawns } from './originalMapProfile';
import type { Vec3 } from './protocol';
import type {OriginalSceneCollisionGeometry} from './originalDoorWorld';

export interface OriginalMapRuntime {
  map: LegacyMapId;
  data: OriginalSceneData;
  geometry: OriginalSceneCollisionGeometry;
  spawnPoints: Vec3[];
  scale: number;
  profile: {
    radius: number;
    bodyHeight: number;
    eyeHeight: number;
    scale: number;
    bounds: { min: Vec3; max: Vec3 };
  };
}
const runtimes = new Map<LegacyMapId, OriginalMapRuntime>();

/** Browser and server load identical preserved data, then register it here.
 * Missing source data is an initialization failure, never an authored-map fallback.
 */
export function registerOriginalMapRuntime(map: LegacyMapId, data: OriginalSceneData): OriginalMapRuntime {
  const current = runtimes.get(map);
  if (current?.data === data) return current;
  const geometry = createOriginalSceneGeometry(data, { scale: ORIGINAL_MAP_SCALE });
  const bounds = geometry.groundBounds;
  if (!bounds) throw new Error(`Original map has no terrain: ${map}`);
  const runtime: OriginalMapRuntime = {
    map, data, geometry, scale: ORIGINAL_MAP_SCALE,
    spawnPoints: getOriginalSettledSpawns(map, geometry),
    profile: {
      radius: ORIGINAL_PLAYER_RADIUS, bodyHeight: ORIGINAL_PLAYER_BODY_HEIGHT,
      eyeHeight: ORIGINAL_PLAYER_EYE_HEIGHT, scale: ORIGINAL_MAP_SCALE, bounds,
    },
  };
  runtimes.set(map, runtime);
  return runtime;
}

export function getOriginalMapRuntime(map: LegacyMapId): OriginalMapRuntime {
  const runtime = runtimes.get(map);
  if (!runtime) throw new Error(`Original map assets have not loaded: ${map}`);
  return runtime;
}
