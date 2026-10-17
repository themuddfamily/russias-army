import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createOriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import type {OriginalSceneData} from './originalSceneGeometry';
import type {Vec3} from './protocol';
interface Route {door:string;scale:number;radius:number;bodyHeight:number;eyeHeight:number;waypoints:Vec3[]}
const route=JSON.parse(readFileSync(new URL('../docs/research-evidence/2026-09-30/DEFAULT_BARRACK_DOOR_ROUTE.json',import.meta.url),'utf8')) as Route;
describe('original Barrack default spawn navigation',()=>{
 it('can walk a supported route around the enclosing building and trigger the original ground-level door',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8')) as OriginalSceneData;
  const tracks=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks;
  const world=createOriginalDoorWorld(data,route.scale,tracks);
  for(let segment=0;segment<route.waypoints.length-1;segment++){
   const a=route.waypoints[segment],b=route.waypoints[segment+1];
   const movement=world.movePlayer(a,b,route.radius,route.bodyHeight);
   expect(movement.fraction).toBeGreaterThan(.999999);
   expect(movement.normals.every(n=>n.y>.5)).toBe(true);
   const count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1);
   for(let i=0;i<=count;i++){
    const x=a.x+(b.x-a.x)*i/count,z=a.z+(b.z-a.z)*i/count,y=a.y+(b.y-a.y)*i/count;
    const support=world.playerSupportHeightAt(x,z,y+.15,route.radius,route.bodyHeight);
    expect(support).toBeDefined();expect(Math.abs(support!-y)).toBeLessThan(.001);
    expect(world.playerIntersects({x,y:support!,z},route.radius,route.bodyHeight)).toBe(false);
   }
  }
  const feet=route.waypoints.at(-1)!;
  expect(world.triggerNearby({...feet,y:feet.y+route.eyeHeight},1)).toContain(route.door);
  expect(world.getStates().find(d=>d.name===route.door)?.phase).toBe('opening');
 });
});
