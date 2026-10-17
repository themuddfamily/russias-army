import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it} from 'vitest';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {OriginalDoorTracks} from '../shared/originalDoorWorld';
import {createOriginalArena} from './originalArena';
import {OriginalDoorClient} from './originalDoorClient';
import type {OriginalMapData} from './originalMapAssets';

function arena(){
  const data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')) as OriginalMapData;
  const doorTracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')) as OriginalDoorTracks;
  registerOriginalMapRuntime('barrack',data);
  const textures=Object.fromEntries(Object.keys(data.textures).map(n=>[n,new THREE.Texture()]));
  return createOriginalArena(new THREE.Scene(),'barrack',{data,doorTracks,textures});
}
function matrix(a:ReturnType<typeof arena>,name:string){return a.group.getObjectByName(name)!.matrix.toArray();}
describe('source doors in the rendered client arena',()=>{
  it('syncs server animation to meshes and collision, including clock corrections and late joins',()=>{
    const a=arena(),client=new OriginalDoorClient();client.attach(a);
    const closed=matrix(a,'door open 28');
    client.update(100);expect(a.doorWorld.getStates().every(d=>d.phase==='closed')).toBe(true);
    client.opened('door open 28',100_000,100_500);
    expect(matrix(a,'door open 28')).not.toEqual(closed);
    expect(matrix(a,'door open 28')).toEqual([...a.doorWorld.getModelMatrix('door open 28')!]);
    client.update(100.4);expect(a.doorWorld.getStates().find(d=>d.name==='door open 28')!.elapsedSeconds).toBe(.5);
    client.snapshot([{name:'door open 28',openedAt:100_100}],100_600);
    expect(a.doorWorld.getStates().find(d=>d.name==='door open 28')!.elapsedSeconds).toBeCloseTo(.5);
    client.snapshot([{name:'door open 28',openedAt:100_000}],103_000,true);
    expect(a.doorWorld.getStates().find(d=>d.name==='door open 28')!.phase).toBe('open');
    client.snapshot([],104_000,true);expect(matrix(a,'door open 28')).toEqual(closed);
    expect(a.doorWorld.getStates().every(d=>d.phase==='closed')).toBe(true);a.dispose();
  });
  it('opens on solo proximity and resets source meshes for a new round',()=>{
    const a=arena(),client=new OriginalDoorClient();client.attach(a);
    const closed=matrix(a,'door open 28');
    client.update(10,{x:4.7,y:1.72,z:-33.75});
    expect(a.doorWorld.getStates().find(d=>d.name==='door open 28')!.phase).toBe('opening');
    client.update(12);expect(matrix(a,'door open 28')).not.toEqual(closed);
    client.reset(20);expect(matrix(a,'door open 28')).toEqual(closed);
    a.dispose();
  });
});
