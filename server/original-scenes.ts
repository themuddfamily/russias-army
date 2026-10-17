import {readFileSync} from 'node:fs';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {OriginalSceneData} from '../shared/originalSceneGeometry';

/** Fail startup if a default publisher map cannot be loaded; never substitute authored geometry. */
export function loadOriginalServerScenes():void {
  for(const [map,directory] of [['barrack','barrack'],['woodlands','woodland']] as const){
    const file=new URL(`../public/assets/original-scenes/${directory}/scene.json`,import.meta.url);
    const data=JSON.parse(readFileSync(file,'utf8')) as OriginalSceneData;
    registerOriginalMapRuntime(map,data);
  }
}

loadOriginalServerScenes();

/** Preserved door tracks are shared immutable input; each room owns its states. */
export const originalServerDoorTracks=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as Parameters<typeof import('../shared/originalDoorWorld').createOriginalDoorWorld>[2];
