import * as THREE from 'three';
import {createOriginalDoorWorld,type OriginalDoorWorld} from '../shared/originalDoorWorld';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import type {Vec3} from '../shared/protocol';
import type { LegacyMapId } from '../shared/legacyMaps';
import { getOriginalMapRuntime, type OriginalMapRuntime } from '../shared/originalMapRuntime';
import type { LegacyArena } from './legacyArena';
import { createOriginalScene } from './originalScene';
import { createOriginalSceneMaterials } from './originalSceneMaterials';
import type { OriginalMapAsset } from './originalMapAssets';

export interface OriginalArena extends LegacyArena {
  runtime: OriginalMapRuntime;
  doorWorld:OriginalDoorWorld;
  barrelWorld:OriginalBarrelWorld;
  syncBarrels():void;
  resetBarrels():void;
  barrelModelPivots():Array<{id:string;pivot:Vec3}>;
  updateDoors(atSeconds:number,eye?:Vec3):string[];
  resetDoors(atSeconds:number):void;
}

export function createOriginalArena(scene: THREE.Scene, map: LegacyMapId, asset: OriginalMapAsset): OriginalArena {
  const base = getOriginalMapRuntime(map);
  const doorWorld=createOriginalDoorWorld(base.data,base.scale,asset.doorTracks);
  const runtime={...base,geometry:doorWorld.geometry};
  const barrelWorld=new OriginalBarrelWorld(runtime);
  const materials = createOriginalSceneMaterials(asset.data, asset.textures);
  const render = createOriginalScene(asset.data, runtime.scale,
    (shader, node) => materials.forMesh({ shader }, node.name));
  render.group.name = `original-${map}`;
  render.group.add(materials.createSky());
  scene.add(render.group);
  scene.background = materials.background;
  scene.fog = null;
  const geometry = runtime.geometry;
  const syncDoorModels=()=>{
    for(const track of asset.doorTracks.doors){
      const model=render.models.get(track.name);
      if(!model)throw new Error(`Missing rendered original door: ${track.name}`);
      model.matrix.fromArray(doorWorld.getModelMatrix(track.name)!);model.matrixWorldNeedsUpdate=true;
    }
  };
  const barrelMatrices=new Map(barrelWorld.snapshots().map(barrel=>{
    const model=render.models.get(barrel.id);
    if(!model)throw new Error(`Missing rendered original barrel: ${barrel.id}`);
    return [barrel.id,model.matrix.clone()] as const;
  }));
  const syncBarrels=()=>{
    const snapshots=barrelWorld.snapshots(),active=new Set(snapshots.map(barrel=>barrel.id));
    for(const id of barrelMatrices.keys())render.models.get(id)!.visible=active.has(id);
    for(const barrel of snapshots){
      const model=render.models.get(barrel.id)!;
      // The body/query layer preserves the source full matrix and model pivot
      // while converting its relative world orientation into source axes.
      model.matrix.fromArray(barrelWorld.getModelMatrix(barrel.id)!);
      model.matrixWorldNeedsUpdate=true;
    }
  };
  syncBarrels();
  let disposed = false;
  return {
    group: render.group, runtime,doorWorld,barrelWorld,syncBarrels,
    resetBarrels(){barrelWorld.reset();syncBarrels();},
    barrelModelPivots(){render.group.updateWorldMatrix(true,true);return barrelWorld.snapshots().map(barrel=>{const model=render.models.get(barrel.id)!,position=new THREE.Vector3().setFromMatrixPosition(model.matrixWorld);return {id:barrel.id,pivot:{x:position.x,y:position.y,z:position.z}};});},
    updateDoors(atSeconds,eye){
      const opened=eye?doorWorld.triggerNearby(eye,atSeconds):[];
      doorWorld.update(atSeconds);syncDoorModels();return opened;
    },
    resetDoors(atSeconds){doorWorld.reset();doorWorld.update(atSeconds);syncDoorModels();},
    // Exact concave triangles replace the authored whole-volume box blockers.
    colliders: [], pickups: [],
    spawnPoints: runtime.spawnPoints.map(p => new THREE.Vector3(p.x, p.y, p.z)),
    groundHeightAt: (x, z) => geometry.supportHeightAt(x, z, Infinity, true) ?? geometry.groundBounds!.min.y,
    supportHeightAt: (x, z, maxY = Infinity) => Math.max(geometry.playerSupportHeightAt(x, z, maxY, runtime.profile.radius, runtime.profile.bodyHeight)??geometry.groundBounds!.min.y,barrelWorld.playerSupportHeightAt(x,z,maxY,runtime.profile.radius,runtime.profile.bodyHeight)??-Infinity),
    dispose() {
      if (disposed) return;
      disposed = true; render.dispose(); materials.dispose();
    },
  };
}
