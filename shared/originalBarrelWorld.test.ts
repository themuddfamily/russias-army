import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {originalAngularConvex} from './originalAngularBody';
import {stepOriginalPhysicsWorld} from './originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from './originalExplosives';
import {originalNodeWorldMatrices,sourcePointToWorld,type OriginalSceneData} from './originalSceneGeometry';
const data=(map:'barrack'|'woodlands')=>JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData;
const runtime=(map:'barrack'|'woodlands'='barrack')=>registerOriginalMapRuntime(map,data(map));
const at=(x=0,y=0,z=0)=>({x,y,z});
describe('recovered barrel instance world',()=>{
 it('preserves the actual source bottom pivot, full point cloud and data while applying the ten-unit lift',()=>{
  const r=runtime(),before=JSON.stringify(r.data),world=new OriginalBarrelWorld(r),body=world.bodies[0];
  const node=r.data.nodes.find(n=>n.name==='barrel')!,matrix=originalNodeWorldMatrices(r.data).get(node.name)!;
  const initial=sourcePointToWorld(matrix.slice(12,15),r.scale);
  expect(world.bodies).toHaveLength(1);expect(world.getInitialPosition(body.id)).toEqual(initial);
  expect(body.position).toEqual({...initial,y:initial.y+10*r.scale});
  expect(body).toMatchObject({mass:1,restitution:.2,friction:1,velocity:at()});
  expect(body.convex.vertices).toHaveLength(20);expect(body.convex.faces).toHaveLength(36);
  expect(Math.min(...body.convex.vertices.map(v=>v.y))).toBe(0);
  expect(body.radius).toBeCloseTo(Math.max(...body.convex.vertices.map(v=>Math.hypot(v.x,v.y,v.z))),12);
  expect(JSON.stringify(r.data)).toBe(before);
 });
 it('falls and settles through actual fixed scene physics while retaining its physical hull',()=>{
  const r=runtime(),world=new OriginalBarrelWorld(r),body=world.bodies[0],initial=body.position.y,convex=body.convex;
  for(let i=0;i<30;i++)stepOriginalPhysicsWorld([],[],{movableBodies:world.bodies,contactDistance:T,sweep:(a,b,radius)=>r.geometry.sweepSphere(a,b,radius,T),sweepConvex:(a,b,s)=>r.geometry.sweepConvex(a,b,s,T)});
  expect(body.position.y).toBeLessThan(initial-.1);expect(body.position.y).toBeGreaterThanOrEqual(T-1e-6);expect(body.position.y).toBeLessThan(T+.001);
  expect(body.angular!.referenceConvex).toBe(convex);expect(body.convex).toBe(originalAngularConvex(body.angular!));expect(body.position.x).toBeCloseTo(world.getInitialPosition(body.id)!.x,9);
 });
 it('uses the actual moved mesh for ray obstruction, support and contained-volume overlap',()=>{
  const world=new OriginalBarrelWorld(runtime()),s=world.snapshots();s[0].position=at(100,50,100);world.applySnapshots(s);
  const hit=world.raycast(at(95,50.6,100),at(1),10)!;
  expect(hit.id).toContain(s[0].id);expect(hit.distance).toBeCloseTo(4.5953847,5);expect(hit.normal.x).toBeLessThan(-.5);
  expect(world.playerIntersects(at(100,50.5,100),.1,.2)).toBe(true);
  expect(world.playerIntersects(at(101,50.5,100),.1,.2)).toBe(false);
  const top=50+Math.max(...world.bodies[0].convex.vertices.map(v=>v.y));
  expect(world.playerSupportHeightAt(100,100,100,.1,.2)).toBeCloseTo(top,9);
 });
 it('refreshes geometric queries after a joint body position changes, without rebuilding physics shapes',()=>{
  const world=new OriginalBarrelWorld(runtime()),s=world.snapshots();s[0].position=at(100,50,100);world.applySnapshots(s);
  const convex=world.bodies[0].convex;
  expect(world.raycast(at(95,50.6,100),at(1),6)).not.toBeNull();world.bodies[0].position.x+=2;
  expect(world.raycast(at(95,50.6,100),at(1),6)).toBeNull();expect(world.raycast(at(97,50.6,100),at(1),6)).not.toBeNull();
  expect(world.playerIntersects(at(100,50.5,100),.1,.2)).toBe(false);expect(world.playerIntersects(at(102,50.5,100),.1,.2)).toBe(true);
  expect(world.bodies[0].convex).toBe(convex);
 });
 it('detaches snapshots and rejects malformed replacements before any body mutation',()=>{
  const world=new OriginalBarrelWorld(runtime()),initial=world.snapshots(),packet=world.snapshots();packet[0].position.x+=3;
  expect(world.snapshots()).toEqual(initial);
  expect(()=>world.applySnapshots([packet[0],packet[0]])).toThrow();expect(world.snapshots()).toEqual(initial);
  expect(()=>world.applySnapshots([{...packet[0],id:'unknown'}])).toThrow();expect(world.snapshots()).toEqual(initial);
  expect(()=>world.applySnapshots([{...packet[0],velocity:at(NaN)}])).toThrow();expect(world.snapshots()).toEqual(initial);
  world.applySnapshots(packet);packet[0].position.x+=2;expect(world.snapshots()[0].position.x).toBe(initial[0].position.x+3);
 });
 it('removes absent canonical bodies and restores exactly the source setup on a new world',()=>{
  const world=new OriginalBarrelWorld(runtime()),initial=world.snapshots(),convex=world.bodies[0].convex,p=initial[0].position;
  expect(world.raycast(at(p.x-2,p.y+.6,p.z),at(1),4)).not.toBeNull();world.applySnapshots([]);
  expect(world.bodies).toEqual([]);expect(world.raycast(at(p.x-2,p.y+.6,p.z),at(1),4)).toBeNull();
  expect(world.playerIntersects(at(p.x,p.y+.5,p.z),.1,.2)).toBe(false);
  world.reset();expect(world.snapshots()).toEqual(initial);expect(world.bodies[0].convex).toBe(convex);
 });
 it('keeps body state private to the instance and initial-pivot queries detached',()=>{
  const r=runtime(),first=new OriginalBarrelWorld(r),second=new OriginalBarrelWorld(r),initial=second.snapshots();
  first.bodies[0].position.x+=5;expect(second.snapshots()).toEqual(initial);
  const pivot=first.getInitialPosition(first.bodies[0].id)!;pivot.x=999;expect(first.getInitialPosition(first.bodies[0].id)!.x).toBe(initial[0].position.x);
 });
 it('restores angular snapshots as detached state and rejects incomplete or malformed packets atomically',()=>{
  const world=new OriginalBarrelWorld(runtime()),before=world.snapshots(),packet=world.snapshots(),q={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};
  packet[0].orientation=q;packet[0].angularVelocity=at(12,23,34);packet[0].position=at(100,50,100);
  for(const invalid of [{...packet[0],orientation:undefined},{...packet[0],angularVelocity:undefined},{...packet[0],orientation:{x:0,y:0,z:0,w:2}},{...packet[0],orientation:null},{...packet[0],angularVelocity:at(Infinity)}]){
   expect(()=>world.applySnapshots([invalid as any])).toThrow();expect(world.snapshots()).toEqual(before);
  }
  world.applySnapshots(packet);q.z=0;packet[0].angularVelocity!.x=999;packet[0].position.x=999;
  const restored=world.snapshots()[0];expect(restored.orientation!.z).toBeCloseTo(Math.SQRT1_2,12);expect(restored.angularVelocity).toEqual(at(12,23,34));expect(restored.position.x).toBe(100);
  restored.orientation!.w=999;restored.angularVelocity!.y=999;expect(world.snapshots()[0].orientation!.w).toBeCloseTo(Math.SQRT1_2,12);expect(world.snapshots()[0].angularVelocity!.y).toBe(23);
  world.applySnapshots([{id:before[0].id,position:at(100,50,100),velocity:at()}]);expect(world.snapshots()[0]).toMatchObject({orientation:{x:0,y:0,z:0,w:1},angularVelocity:at()});
  world.reset();expect(world.snapshots()).toEqual(before);
 });
 it('rotates full barrel geometry around the retained model pivot for rays, support and contained-volume tests',()=>{
  const world=new OriginalBarrelWorld(runtime()),packet=world.snapshots(),reference=world.bodies[0].convex.vertices.map(v=>({...v}));
  packet[0].position=at(100,50,100);world.applySnapshots(packet);
  const upright=world.raycast(at(95,50,100),at(1),10)!.distance;
  packet[0].orientation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};world.applySnapshots(packet);
  for(const [i,v] of world.bodies[0].convex.vertices.entries()){
   expect(v.x).toBeCloseTo(-reference[i].y,11);expect(v.y).toBeCloseTo(reference[i].x,11);expect(v.z).toBeCloseTo(reference[i].z,11);
  }
  const sideways=world.raycast(at(95,50,100),at(1),10)!;
  expect(sideways.distance).toBeLessThan(upright-.5);
  expect(world.playerIntersects(at(99.4,49.95,100),.05,.1)).toBe(true);
  expect(world.playerIntersects(at(100,50.6,100),.05,.1)).toBe(false);
  const top=world.playerSupportHeightAt(99.4,100,100,.05,.1)!;expect(top).toBeGreaterThan(50.2);expect(top).toBeLessThan(50.5);
  const matrix=world.getModelMatrix(packet[0].id)!;expect(sourcePointToWorld(matrix.slice(12,15),runtime().scale)).toEqual(packet[0].position);
  matrix[12]=999;expect(world.getModelMatrix(packet[0].id)![12]).not.toBe(999);
 });
 it('has no invented bodies, support or ray blockers in Woodland',()=>{
  const world=new OriginalBarrelWorld(runtime('woodlands'));
  expect(world.snapshots()).toEqual([]);expect(world.raycast(at(),at(1),10)).toBeNull();expect(world.playerIntersects(at(),.1,.2)).toBe(false);
  expect(world.playerSupportHeightAt(0,0,10,.1,.2)).toBeUndefined();world.applySnapshots([]);world.reset();expect(world.bodies).toEqual([]);
 });
});
