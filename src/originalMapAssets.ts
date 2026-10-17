import * as THREE from 'three';
import {validateOriginalDoorTracks,type OriginalDoorTracks} from '../shared/originalDoorWorld';
import { LEGACY_MAP_IDS, type LegacyMapId } from '../shared/legacyMaps';
import { registerOriginalMapRuntime } from '../shared/originalMapRuntime';
import type { OriginalRenderScene } from './originalScene';
import type { OriginalSceneMaterialData } from './originalSceneMaterials';

export type OriginalMapData = OriginalRenderScene & OriginalSceneMaterialData;
export interface OriginalMapAsset { data: OriginalMapData; textures: Record<string, THREE.Texture>;doorTracks:OriginalDoorTracks }
export type OriginalMapAssets = Record<LegacyMapId, OriginalMapAsset>;

/** Load original scenes before starting Game; no procedural fallback changes maps. */
export async function preloadOriginalMapAssets(): Promise<OriginalMapAssets> {
  const loader = new THREE.TextureLoader();
  const owned: THREE.Texture[] = [];
  const settled = await Promise.allSettled(LEGACY_MAP_IDS.map(async map => {
    const edition = map === 'woodlands' ? 'woodland' : 'barrack';
    const response = await fetch(`/assets/original-scenes/${edition}/scene.json`);
    if (!response.ok) throw new Error(`Original ${map} scene: HTTP ${response.status}`);
    const data = await response.json() as OriginalMapData;
    const entries = await Promise.allSettled(Object.entries(data.textures).map(async ([name, source]) => {
      const texture = await loader.loadAsync(source.url); owned.push(texture);
      return [name, texture] as const;
    }));
    const failure = entries.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    const textures = Object.fromEntries(entries.map(result => {
      if (result.status !== 'fulfilled') throw new Error('Unloaded original texture');
      return result.value;
    }));
    let doorTracks:OriginalDoorTracks={version:1,doors:[]};
    if(map==='barrack'){
      const doorResponse=await fetch('/assets/original-scenes/barrack/doors.json');
      if(!doorResponse.ok)throw new Error(`Original doors: HTTP ${doorResponse.status}`);
      doorTracks=await doorResponse.json() as OriginalDoorTracks;validateOriginalDoorTracks(doorTracks);
    }
    registerOriginalMapRuntime(map, data);
    return [map, { data, textures,doorTracks }] as const;
  }));
  const failure = settled.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    for (const texture of owned) texture.dispose();
    throw failure.reason;
  }
  return Object.fromEntries(settled.map(result => {
    if (result.status !== 'fulfilled') throw new Error('Unloaded original scene');
    return result.value;
  })) as OriginalMapAssets;
}
