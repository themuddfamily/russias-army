import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import {OriginalBarrelWorld} from './originalBarrelWorld';
const runtime=(map:'barrack'|'woodlands')=>registerOriginalMapRuntime(map,JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,import.meta.url),'utf8')));
const at=(x=0,y=0,z=0)=>({x,y,z});
describe('observer and registered-shot barrel forks',()=>{
 it('copies exact current poses and angular state while sharing only imported reference hulls',()=>{
  const world=new OriginalBarrelWorld(runtime('barrack')),packet=world.snapshots();
  packet[0].position=at(100,50,100);packet[0].velocity=at(1,2,3);packet[0].orientation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};packet[0].angularVelocity=at(12,23,34);world.applySnapshots(packet);
  const copy=world.fork(),a=world.bodies[0],b=copy.bodies[0];
  expect(copy.snapshots()).toEqual(world.snapshots());
  expect(b).not.toBe(a);expect(b.position).not.toBe(a.position);expect(b.velocity).not.toBe(a.velocity);
  expect(b.angular).not.toBe(a.angular);expect(b.angular!.orientation).not.toBe(a.angular!.orientation);expect(b.angular!.angularVelocity).not.toBe(a.angular!.angularVelocity);
  expect(b.angular!.referenceConvex).toBe(a.angular!.referenceConvex);
  const before=copy.snapshots();a.position.x+=10;a.velocity.y+=1;a.angular!.orientation.z=0;a.angular!.angularVelocity.x+=2;
  expect(copy.snapshots()).toEqual(before);
  copy.reset();expect(copy.snapshots()[0].position).not.toEqual(before[0].position);expect(world.bodies[0].position.x).toBe(110);
 });
 it('keeps ray and support blockers at the captured pose after source motion and disappearance',()=>{
  const world=new OriginalBarrelWorld(runtime('barrack')),packet=world.snapshots();packet[0].position=at(100,50,100);world.applySnapshots(packet);
  const before=world.raycast(at(95,50.6,100),at(1),6),copy=world.fork(),support=copy.playerSupportHeightAt(100,100,100,.1,.2);
  expect(before).not.toBeNull();expect(copy.raycast(at(95,50.6,100),at(1),6)).toEqual(before);
  world.bodies[0].position.x+=20;expect(world.raycast(at(95,50.6,100),at(1),6)).toBeNull();world.applySnapshots([]);
  expect(copy.raycast(at(95,50.6,100),at(1),6)).toEqual(before);expect(copy.playerSupportHeightAt(100,100,100,.1,.2)).toBe(support);
  expect(copy.playerIntersects(at(100,50.5,100),.1,.2)).toBe(true);expect(world.playerIntersects(at(100,50.5,100),.1,.2)).toBe(false);
 });
 it('forks the empty Woodland population without adding bodies',()=>{
  const world=new OriginalBarrelWorld(runtime('woodlands')),copy=world.fork();expect(copy).not.toBe(world);expect(copy.snapshots()).toEqual([]);expect(copy.raycast(at(),at(1),10)).toBeNull();
 });
});
