import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalArena} from './originalArena';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {OriginalMapData} from './originalMapAssets';
import type {OriginalDoorTracks} from '../shared/originalDoorWorld';

function fixture(){
  const data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')) as OriginalMapData;
  const doorTracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')) as OriginalDoorTracks;
  registerOriginalMapRuntime('barrack',data);
  const textures=Object.fromEntries(Object.keys(data.textures).map(name=>[name,new THREE.Texture()]));
  const arena=createOriginalArena(new THREE.Scene(),'barrack',{data,doorTracks,textures});
  const worlds=new Map([['player',{doors:arena.doorWorld,doorEpoch:10}]]);
  const game=Object.assign(Object.create(Game.prototype),{archivalWinter:false,mode:'solo',arena,soloWorlds:{worlds}}) as {updateOriginalDoors():void};
  return {arena,worlds,game,dispose(){arena.dispose();for(const texture of Object.values(textures))texture.dispose();}};
}

describe('actual Game solo door render clock',()=>{
  it('syncs committed door animation when the last opening epoch lags callbacks',()=>{
    const f=fixture();
    try{
      const mesh=f.arena.group.getObjectByName('door open 28')!;
      const closed=mesh.matrix.toArray();
      f.arena.doorWorld.update(10);
      f.arena.doorWorld.open('door open 28',10);
      f.arena.doorWorld.update(10.5);
      const committed=f.arena.doorWorld.getModelMatrix('door open 28');
      expect(mesh.matrix.toArray()).toEqual(closed);
      expect(()=>f.game.updateOriginalDoors()).not.toThrow();
      expect(mesh.matrix.toArray()).toEqual(committed);
      expect(mesh.matrix.toArray()).not.toEqual(closed);
      expect(f.arena.doorWorld.updatedAtSeconds).toBe(10.5);
      expect(f.worlds.get('player')!.doorEpoch).toBe(10);
      // Repeated render frames (including pause) consume no animation time.
      f.game.updateOriginalDoors();
      expect(f.arena.doorWorld.getModelMatrix('door open 28')).toEqual(committed);
      expect(f.arena.doorWorld.updatedAtSeconds).toBe(10.5);
      f.arena.doorWorld.update(10.75);
      f.game.updateOriginalDoors();
      expect(mesh.matrix.toArray()).toEqual(f.arena.doorWorld.getModelMatrix('door open 28'));
    }finally{f.dispose();}
  });
  it('does not advance the arena clock before a solo observer exists',()=>{
    const f=fixture();
    try{
      f.worlds.clear();
      const update=vi.spyOn(f.arena,'updateDoors');
      f.game.updateOriginalDoors();
      expect(update).not.toHaveBeenCalled();
      expect(f.arena.doorWorld.updatedAtSeconds).toBe(0);
    }finally{f.dispose();}
  });
});
